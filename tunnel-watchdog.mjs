// Restarts a Cloudflare tunnel container that has had no live connection for two checks in a row.
// cloudflared can get stuck retrying one unreachable edge address (seen after the EPAM VPN changed routes)
// and only a restart makes it look the edges up again. Run every minute by launchd, see README.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const STATE = path.join(os.homedir(), 'Library/Application Support/nova360-tunnel-watchdog.json');
const FAILS_BEFORE_RESTART = 2;
const STARTUP_GRACE_MS = 2 * 60 * 1000;
const COOLDOWN_MS = 3 * 60 * 1000;

const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'));
  } catch {
    return {};
  }
}

async function docker(...args) {
  return (await run('docker', args, { timeout: 30_000 })).stdout.trim();
}

async function ready(name) {
  try {
    await run('docker', ['exec', name, 'cloudflared', 'tunnel', '--metrics', '127.0.0.1:20241', 'ready'], { timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

let names;
try {
  names = (await docker('ps', '--filter', 'ancestor=cloudflare/cloudflared:latest', '--format', '{{.Names}}')).split('\n').filter(Boolean);
} catch (err) {
  log(`docker not reachable: ${err.message.split('\n')[0]}`);
  process.exit(0);
}

const state = readState();
const now = Date.now();

for (const name of names) {
  const s = (state[name] ??= { fails: 0, restartedAt: 0 });
  if (await ready(name)) {
    if (s.fails) log(`${name} connected again`);
    s.fails = 0;
    continue;
  }
  s.fails++;
  const started = Date.parse(await docker('inspect', '--format', '{{.State.StartedAt}}', name));
  if (now - started < STARTUP_GRACE_MS || now - s.restartedAt < COOLDOWN_MS) continue;
  if (s.fails < FAILS_BEFORE_RESTART) {
    log(`${name} has no tunnel connection (check ${s.fails})`);
    continue;
  }
  log(`${name} disconnected for ${s.fails} checks, restarting`);
  try {
    await docker('restart', name);
    s.restartedAt = now;
    s.fails = 0;
  } catch (err) {
    log(`${name} restart failed: ${err.message.split('\n')[0]}`);
  }
}

for (const name of Object.keys(state)) if (!names.includes(name)) delete state[name];
fs.mkdirSync(path.dirname(STATE), { recursive: true });
fs.writeFileSync(STATE, JSON.stringify(state));
