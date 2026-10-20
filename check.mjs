// node check.mjs          one request from this machine, exits 1 if any site is down
// node check.mjs --iran   reachability from check-host.net's Iranian nodes, appended to log/iran.csv

import fs from 'node:fs';

const SITES = ['https://me.nova360.io', 'https://desk.nova360.io'];
const IRAN_SITES = ['https://me.nova360.io'];
const IRAN_MIN_OK = 4;

async function direct(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    return { ok: res.status < 500, detail: `${res.status} ${Date.now() - started}ms` };
  } catch (err) {
    return { ok: false, detail: err.cause?.code ?? err.name };
  }
}

class ProbeUnavailable extends Error {}

async function json(path) {
  let last = '';
  for (const wait of [0, 15_000, 45_000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    const res = await fetch(`https://check-host.net${path}`, {
      headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; nova360-uptime/1.0)' },
    });
    const body = await res.text();
    try {
      return JSON.parse(body);
    } catch {
      const title = body.match(/<title>([^<]*)/i)?.[1]?.trim() ?? body.slice(0, 80);
      if (res.status !== 429 && res.status < 500) throw new Error(`check-host.net returned ${res.status}: ${title}`);
      last = `${res.status} ${title}`;
    }
  }
  throw new ProbeUnavailable(`check-host.net unavailable (${last})`);
}

function summary(lines) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}

async function iran(url) {
  const nodes = Object.entries((await json('/nodes/hosts')).nodes)
    .filter(([, n]) => n.location[0] === 'ir')
    .map(([name]) => name);
  const { request_id } = await json(`/check-http?host=${encodeURIComponent(url)}${nodes.map((n) => `&node=${n}`).join('')}`);

  let result = {};
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5_000));
    result = await json(`/check-result/${request_id}`);
    if (Object.values(result).every((v) => v !== null)) break;
  }

  return nodes.map((node) => {
    const r = result[node]?.[0];
    const ok = Boolean(r?.[0]);
    return { node: node.split('.')[0], ok, detail: r ? (ok ? r[3] : r[2]) : 'no result' };
  });
}

let failed = false;

if (process.argv.includes('--iran')) {
  fs.mkdirSync('log', { recursive: true });
  const file = 'log/iran.csv';
  if (!fs.existsSync(file)) fs.writeFileSync(file, 'time,site,ok,total,failures\n');
  const table = ['| Site | Iranian nodes reachable | Failures |', '| --- | --- | --- |'];
  for (const url of IRAN_SITES) {
    let rows;
    try {
      rows = await iran(url);
    } catch (err) {
      if (!(err instanceof ProbeUnavailable)) throw err;
      fs.appendFileSync(file, `${new Date().toISOString()},${url},,,"probe unavailable"\n`);
      console.log(`::warning::${err.message}, Iran check skipped`);
      table.push(`| ${url} | skipped | ${err.message} |`);
      continue;
    }
    const ok = rows.filter((r) => r.ok).length;
    const failures = rows.filter((r) => !r.ok).map((r) => `${r.node}:${r.detail}`).join(' ');
    fs.appendFileSync(file, `${new Date().toISOString()},${url},${ok},${rows.length},"${failures}"\n`);
    console.log(`${url} reachable from ${ok}/${rows.length} Iranian nodes ${failures}`);
    table.push(`| ${url} | ${ok < IRAN_MIN_OK ? '❌' : '✅'} ${ok}/${rows.length} | ${failures || '-'} |`);
    if (ok < IRAN_MIN_OK) failed = true;
  }
  summary(table);
} else {
  const table = ['| Site | Status | Response |', '| --- | --- | --- |'];
  for (const url of SITES) {
    let r = await direct(url);
    // one retry so a single dropped request doesn't page anyone
    if (!r.ok) r = await direct(url);
    console.log(`${url} ${r.ok ? 'up' : 'DOWN'} ${r.detail}`);
    table.push(`| ${url} | ${r.ok ? '✅ up' : '❌ DOWN'} | ${r.detail} |`);
    if (!r.ok) failed = true;
  }
  summary(table);
}

process.exit(failed ? 1 : 0);
