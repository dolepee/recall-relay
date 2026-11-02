import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

// Drive the actual Worker entrypoint with test bindings. The only stub is the
// workerd runtime module; routing, validation and allocation order are the
// shipped code in cloud/worker.mjs.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers')
      return {url: new URL('./support/cloudflare-workers-stub.mjs', import.meta.url).href, shortCircuit: true};
    return nextResolve(specifier, context);
  },
});

const {default: worker} = await import('../cloud/worker.mjs');

const ORIGIN = 'http://practice.test';
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';

function environment() {
  const calls = {practice: [], budget: 0, connected: 0};
  const practice = {
    async handle(input) {
      calls.practice.push(input);
      if (input.token === 'x'.repeat(43))
        return {status: 410, value: {error: 'This practice session has expired.', expired: true}};
      return {status: 200, value: {mode: 'practice', role: 'merchant', path: input.path, token: input.token, fresh: input.fresh}};
    },
  };
  const connected = {
    async handle() { calls.connected++; return {status: 200, value: {mode: 'real-sandbox'}}; },
  };
  const env = {
    PUBLIC_ORIGINS: [ORIGIN],
    BUDGET: {
      getByName() {
        return {
          async openPractice() { calls.budget++; return {opened: true, resetAt: '2026-11-03T00:00:00.000Z'}; },
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

test('the Worker entrypoint serves a fresh practice state and allocates exactly one object', async () => {
  const {calls, call} = environment();
  const response = await call('GET', '/api/practice/state');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, 'practice');
  assert.match(response.headers.get('set-cookie'), /rr_practice=[\w-]{43}/);
  assert.equal(calls.practice.length, 1);
  assert.equal(calls.budget, 1);
  assert.equal(calls.practice[0].fresh, true);
  assert.equal(calls.practice[0].path, '/api/practice/state');
});

test('a repeat read reuses the session without spending another practice quota', async () => {
  const {calls, call} = environment();
  const first = await call('GET', '/api/practice/state');
  const token = /rr_practice=([\w-]{43})/.exec(first.headers.get('set-cookie'))[1];
  const second = await call('GET', '/api/practice/state', {cookie: token});
  assert.equal(second.status, 200);
  assert.equal((await second.json()).fresh, false);
  assert.equal(calls.budget, 1);
  assert.equal(response_setCookie(second), null);
});

test('method, action, origin and body are rejected before any object is allocated', async () => {
  const {calls, call} = environment();
  assert.equal((await call('PUT', '/api/practice/state')).status, 405);
  assert.equal((await call('GET', '/api/practice/nope')).status, 404);
  assert.equal((await call('POST', '/api/practice/unknown', {body: {}})).status, 404);
  assert.equal((await call('POST', '/api/practice/submit', {origin: 'https://evil.test', body: {}})).status, 403);
  assert.equal((await call('POST', '/api/practice/submit', {contentType: 'text/plain', body: 'x'})).status, 403);
  const oversized = await call('POST', '/api/practice/submit', {body: 'x'.repeat(2_850_010)});
  assert.equal(oversized.status, 413);
  assert.equal(calls.practice.length, 0, 'no practice object allocated');
  assert.equal(calls.budget, 0, 'no practice quota spent');
});

test('an unknown cookie is an explicit expiry with a cleared cookie, not a reload loop', async () => {
  const {calls, call} = environment();
  const response = await call('GET', '/api/practice/state', {cookie: 'x'.repeat(43)});
  assert.equal(response.status, 410);
  assert.equal((await response.json()).expired, true);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(calls.practice.length, 1);
  assert.equal(calls.budget, 0);
});

test('an explicit new practice case spends one quota unit and sets its own cookie', async () => {
  const {calls, call} = environment();
  const response = await call('POST', '/api/practice/new', {body: {}});
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /rr_practice=[\w-]{43}/);
  assert.equal(calls.budget, 1);
  assert.equal(calls.practice[0].fresh, true);
});

test('practice failures do not fall through to the connected workspace or its provider', async () => {
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

function response_setCookie(response) {
  return response.headers.get('set-cookie');
}
