import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

// Drive the actual Worker entrypoint with test bindings. The only stub is the
// workerd runtime module; routing, admission and allocation order are the
// shipped code in cloud/worker.mjs.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers')
      return {url: new URL('../support/cloudflare-workers-stub.mjs', import.meta.url).href, shortCircuit: true};
    return nextResolve(specifier, context);
  },
});

const {default: worker} = await import('../cloud/worker.mjs');

const ORIGIN = 'http://practice.test';

function environment({capacity = false} = {}) {
  const calls = {practice: [], admit: 0, has: 0, connected: 0};
  const issued = new Set();
  const practice = {
    async handle(input) {
      calls.practice.push(input);
      if (input.token === 'x'.repeat(43))
        return {status: 410, value: {error: 'This practice session has expired.', expired: true}};
      return {status: 200, value: {mode: 'practice', role: 'merchant', path: input.path, token: input.token, fresh: input.fresh}};
    },
  };
  const connected = {async handle() { calls.connected++; return {status: 200, value: {mode: 'real-sandbox'}}; }};
  const env = {
    PUBLIC_ORIGINS: [ORIGIN],
    BUDGET: {
      getByName() {
        return {
          async admitPractice(id) {
            calls.admit++;
            if (capacity) return {opened: false, resetAt: '2026-11-03T00:00:00.000Z'};
            issued.add(id);
            return {opened: true, resetAt: '2026-11-03T00:00:00.000Z'};
          },
          async hasPractice(id) { calls.has++; return issued.has(id); },
          async hasWorkspace() { return true; },
          async openWorkspace() { return {opened: true}; },
          async admitAI() { return {admitted: true}; },
          async aiAllowance() { return {available: true}; },
        };
      },
    },
    PRACTICE: {getByName(id) { return {...practice, id}; }},
    WORKSPACES: {getByName() { return connected; }},
  };
  const call = (method, path, {cookie, origin = ORIGIN, body, contentType = 'application/json'} = {}) => {
    const headers = {};
    if (origin) headers.Origin = origin;
    if (contentType) headers['Content-Type'] = contentType;
    if (cookie) headers.Cookie = `rr_practice=${cookie}`;
    return worker.fetch(new Request(`${ORIGIN}${path}`, {
      method, headers,
      ...(body === undefined ? {} : {body: typeof body === 'string' ? body : JSON.stringify(body)}),
    }), env);
  };
  return {calls, call};
}
const cookieOf = response => /rr_practice=([\w-]{43})/.exec(response.headers.get('set-cookie') || '')?.[1] || null;

test('the Worker entrypoint serves a fresh practice state through one admitted object', async () => {
  const {calls, call} = environment();
  const response = await call('GET', '/api/practice/state');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, 'practice');
  assert.match(response.headers.get('set-cookie'), /rr_practice=[\w-]{43}/);
  assert.equal(calls.admit, 1);
  assert.equal(calls.practice.length, 1);
  assert.equal(calls.has, 0, 'a fresh session is admitted rather than looked up');
  assert.equal(calls.practice[0].fresh, true);
});

test('a repeat read reuses the admitted session without spending another quota unit', async () => {
  const {calls, call} = environment();
  const first = await call('GET', '/api/practice/state');
  const token = cookieOf(first);
  const second = await call('GET', '/api/practice/state', {cookie: token});
  assert.equal(second.status, 200);
  assert.equal((await second.json()).fresh, false);
  assert.equal(calls.admit, 1);
  assert.equal(calls.practice.length, 2);
});

test('an unissued cookie is rejected before any practice object is allocated', async () => {
  const {calls, call} = environment();
  const response = await call('GET', '/api/practice/state', {cookie: 'a'.repeat(43)});
  assert.equal(response.status, 410);
  assert.equal((await response.json()).expired, true);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(calls.practice.length, 0, 'no Durable Object allocated');
  assert.equal(calls.admit, 0, 'no admission spent');
  assert.equal(calls.has, 1);
});

test('an invalid method and action pair is rejected before admission or allocation', async () => {
  const {calls, call} = environment();
  assert.equal((await call('GET', '/api/practice/new')).status, 405);
  assert.equal((await call('POST', '/api/practice/state', {body: {}})).status, 405);
  assert.equal((await call('PUT', '/api/practice/state')).status, 405);
  assert.equal((await call('GET', '/api/practice/nope')).status, 404);
  assert.equal((await call('POST', '/api/practice/unknown', {body: {}})).status, 404);
  assert.equal((await call('POST', '/api/practice/submit', {origin: 'https://evil.test', body: {}})).status, 403);
  assert.equal((await call('POST', '/api/practice/submit', {contentType: 'text/plain', body: 'x'})).status, 403);
  assert.equal((await call('POST', '/api/practice/submit', {body: 'x'.repeat(2_850_010)})).status, 413);
  assert.equal(calls.practice.length, 0);
  assert.equal(calls.admit, 0);
});

test('a fresh start is refused while the presented case is still active', async () => {
  const {calls, call} = environment();
  const first = await call('GET', '/api/practice/state');
  const token = cookieOf(first);
  const response = await call('POST', '/api/practice/new', {cookie: token, body: {}});
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /still active/);
  assert.equal(calls.admit, 1, 'the active session is not replaced');
  assert.equal(calls.practice.length, 1);
});

test('a fresh start without an active case is admitted and creates one object', async () => {
  const {calls, call} = environment();
  const response = await call('POST', '/api/practice/new', {body: {}});
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /rr_practice=[\w-]{43}/);
  assert.equal(calls.admit, 1);
  assert.equal(calls.practice.length, 1);
  assert.equal(calls.practice[0].fresh, true);
});

test('practice admission capacity refuses a new session without allocating an object', async () => {
  const {calls, call} = environment({capacity: true});
  const response = await call('GET', '/api/practice/state');
  assert.equal(response.status, 429);
  assert.equal(calls.admit, 1);
  assert.equal(calls.practice.length, 0);
});

test('practice errors never fall through to the connected workspace', async () => {
  const {calls, call} = environment();
  await call('POST', '/api/practice/submit', {origin: 'https://evil.test', body: {}});
  await call('GET', '/api/practice/nope');
  assert.equal(calls.connected, 0);
  assert.equal(calls.practice.length, 0);
});

test('the connected merchant route still reaches its own object', async () => {
  const {calls, call} = environment();
  const response = await call('GET', '/api/merchant/state', {contentType: null});
  assert.equal(response.status, 200);
  assert.equal(calls.connected, 1);
  assert.equal(calls.practice.length, 0);
});
