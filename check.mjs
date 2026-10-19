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

async function json(path) {
  const res = await fetch(`https://check-host.net${path}`, { headers: { accept: 'application/json' } });
  return res.json();
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
  for (const url of IRAN_SITES) {
    const rows = await iran(url);
    const ok = rows.filter((r) => r.ok).length;
    const failures = rows.filter((r) => !r.ok).map((r) => `${r.node}:${r.detail}`).join(' ');
    fs.appendFileSync(file, `${new Date().toISOString()},${url},${ok},${rows.length},"${failures}"\n`);
    console.log(`${url} reachable from ${ok}/${rows.length} Iranian nodes ${failures}`);
    if (ok < IRAN_MIN_OK) failed = true;
  }
} else {
  for (const url of SITES) {
    let r = await direct(url);
    // one retry so a single dropped request doesn't page anyone
    if (!r.ok) r = await direct(url);
    console.log(`${url} ${r.ok ? 'up' : 'DOWN'} ${r.detail}`);
    if (!r.ok) failed = true;
  }
}

process.exit(failed ? 1 : 0);
