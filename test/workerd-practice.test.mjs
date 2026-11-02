import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {practiceObjectName} from '../src/cloud-practice-routing.mjs';

const WRANGLER = new URL('../node_modules/.bin/wrangler', import.meta.url).pathname;
const WORKER = new URL('../support/practice-alarm-worker.mjs', import.meta.url).pathname;
const TTL = 1200;

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, timeout = 30000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status) return response;
    } catch (error) { last = error; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`wrangler dev did not start: ${last?.message || 'timeout'}`);
}

// Real workerd through the local wrangler runtime: the actual PracticeCase
// object is held across its alarm. deleteAll drops the SQLite schema, the
// cached runtime must be rebuilt, and the next request must answer 410 rather
// than a missing-table error.
test('a real PracticeCase alarm expires the object and the same instance recovers', {timeout: 90000}, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'relay-workerd-'));
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const config = join(dir, 'wrangler.jsonc');
  await writeFile(config, JSON.stringify({
    name: 'practice-alarm-test',
    main: WORKER,
    compatibility_date: '2026-10-23',
    compatibility_flags: ['nodejs_compat'],
    durable_objects: {bindings: [{name: 'PRACTICE', class_name: 'PracticeCase'}]},
    migrations: [{tag: 'v1', new_sqlite_classes: ['PracticeCase']}],
    vars: {PRACTICE_TTL_MS: TTL},
    dev: {ip: '127.0.0.1', port},
  }, null, 2));
  const child = spawn(WRANGLER, ['dev', '--local', '--config', config, '--persist-to', join(dir, 'state')], {
    cwd: dir,
    env: {...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', NO_UPDATE_NOTIFIER: '1'},
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let logs = '';
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });
  try {
    const token = 't'.repeat(43), id = practiceObjectName(token);
    const open = await waitForServer(`${origin}/?id=${id}&token=${token}&fresh=1`);
    assert.equal(open.status, 200);
    const opened = await open.json();
    assert.equal(opened.status, 200, logs);

    await new Promise(resolve => setTimeout(resolve, TTL + 1800));

    const after = await fetch(`${origin}/?id=${id}&token=${token}`);
    assert.equal(after.status, 200);
    const result = await after.json();
    assert.equal(result.status, 410, `expected expiry, got ${JSON.stringify(result)}\n${logs}`);
    assert.equal(result.value.expired, true);
    assert.doesNotMatch(String(result.value.error), /no such table/i);
  } finally {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch {} }
    await new Promise(resolve => child.once('exit', resolve));
    await rm(dir, {recursive: true, force: true});
  }
});
