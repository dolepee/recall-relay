import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planClaim, approvedAction } from '../src/plan.mjs';
import { RefundJournal } from '../src/journal.mjs';
import { PayPalSandbox } from '../src/paypal-sandbox.mjs';
import { policy, evidence, purchase, now } from '../fixtures.mjs';

const plan = (overrides = {}) => planClaim({ policy, purchase, evidence, now, ...overrides });
const approve = (p) => ({ actor: 'fixture-merchant', digest: p.digest });

test('incomplete or conflicting recall evidence cannot authorize money movement', () => {
  for (const [override, status] of [
    [{ purchase: { ...purchase, lot: null } }, 'REVIEW'],
    [{ purchase: { ...purchase, lot: 'LOT-B' } }, 'NOT_MATCHED'],
    [{ policy: { ...policy, remedy: 'REPAIR' } }, 'MANUAL'],
    [{ policy: { ...policy, settlingMerchantId: 'OTHER' } }, 'MANUAL'],
    [{ policy: { ...policy, lots: [] } }, 'REVIEW'],
    [{ evidence: {} }, 'REVIEW'],
    [{ purchase: { ...purchase, capturedAt: '2025-01-01' } }, 'MANUAL'],
    [{ purchase: { ...purchase, currency: 'EUR' } }, 'MANUAL'],
    [{ purchase: { ...purchase, linePaidCents: 25.99 } }, 'REVIEW'],
  ]) assert.equal(plan(override).status, status);
});

test('approval cannot be carried over to changed payment or changed evidence', () => {
  const original = plan();
  const changed = plan({ purchase: { ...purchase, linePaidCents: 2099 } });
  assert.throws(() => approvedAction(changed, approve(original)), /match/);
  const changedEvidence = plan({ evidence: { 'remedy-confirmation': { reviewedBy: 'another-reviewer' } } });
  assert.throws(() => approvedAction(changedEvidence, approve(original)), /match/);
  original.action.amountCents = 1;
  assert.throws(() => approvedAction(original, approve(original)), /modified/);
});

test('a crash after dispatch preserves the request and blocks another dispatch after reopening', () => {
  const dir = mkdtempSync(join(tmpdir(), 'recall-relay-'));
  const path = join(dir, 'journal.sqlite');
  let journal = new RefundJournal(path);
  try {
    const p = plan();
    const first = journal.reserve(p, approve(p), 5999);
    journal.begin(first.request_id);
    journal.close();
    journal = new RefundJournal(path);
    const duplicate = journal.reserve(p, approve(p), 5999);
    assert.equal(duplicate.request_id, first.request_id);
    assert.equal(duplicate.state, 'UNKNOWN');
    assert.throws(() => journal.begin(duplicate.request_id), /reconcile/);
    const completed = journal.observe(first.request_id, { id: 'FIXTURE-REFUND', status: 'COMPLETED', amount: {value:'25.99',currency_code:'USD'} });
    assert.equal(completed.state, 'COMPLETED');
    assert.throws(() => journal.observe(first.request_id, { id: 'FIXTURE-REFUND', status: 'PENDING', amount: {value:'25.99',currency_code:'USD'} }), /stale/);
  } finally { journal.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('two lines cannot reserve more than the available captured amount', () => {
  const journal = new RefundJournal();
  try {
    const first = plan(); journal.reserve(first, approve(first), 4000);
    const second = plan({ purchase: { ...purchase, lineId: 'LINE-2' } });
    assert.throws(() => journal.reserve(second, approve(second), 4000), /balance/);
    assert.equal(journal.reserve(first, approve(first), 4000).replay, true);
  } finally { journal.close(); }
});

test('sandbox adapter sends exact cents to the original capture and treats pending as pending', async () => {
  const journal = new RefundJournal(); const calls = [];
  try {
    const p = plan(); const row = journal.reserve(p, approve(p), 5999);
    const sandbox = new PayPalSandbox({ token: 'fixture-token', fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, json: async () => ({ id: 'FIXTURE-REFUND', status: 'PENDING', amount: {value:'25.99',currency_code:'USD'} }) };
    } });
    const result = await sandbox.refund(journal.begin(row.request_id));
    assert.equal(journal.observe(row.request_id, result).state, 'PENDING');
    assert.equal(calls[0].url, 'https://api-m.sandbox.paypal.com/v2/payments/captures/FIXTURE-CAPTURE/refund');
    assert.equal(calls[0].init.headers['PayPal-Request-Id'], row.request_id);
    assert.deepEqual(JSON.parse(calls[0].init.body).amount, { value: '25.99', currency_code: 'USD' });
    assert.equal(calls[0].init.redirect, 'manual');
  } finally { journal.close(); }
});

test('timeout or malformed provider response stays unresolved', async () => {
  const journal = new RefundJournal();
  try {
    const p = plan(); const row = journal.reserve(p, approve(p), 5999);
    const adapter = new PayPalSandbox({ token: 'fixture-token', fetchImpl: async () => { throw new Error('fixture timeout'); } });
    await assert.rejects(adapter.refund(journal.begin(row.request_id)), /timeout/);
    assert.equal(journal.get(row.request_id).state, 'UNKNOWN');
    assert.throws(() => journal.observe(row.request_id, { status: 'COMPLETED' }), /Unrecognized/);
    assert.equal(journal.get(row.request_id).state, 'UNKNOWN');
  } finally { journal.close(); }
});
