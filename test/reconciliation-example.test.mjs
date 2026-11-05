import test from 'node:test';import assert from 'node:assert/strict';
import {examplePlan} from '../ui/reconciliation-example-data.mjs';
import {reconcileLedger} from '../src/recall-reconciliation.mjs';
test('synthetic example uses production scope/readiness calculations without payment authority',()=>{
 const original=examplePlan(),corrected=examplePlan(true);
 assert.equal(original.summary.declaredAffectedCents,4975);assert.equal(original.lines[1].scope,'UNKNOWN');
 assert.equal(corrected.summary.declaredAffectedCents,6175);assert.equal(corrected.lines[1].scope,'AFFECTED');assert.equal(corrected.lines[1].readiness,'NEEDS_EVIDENCE');
 assert.ok(corrected.lines.filter(r=>r.orderId.startsWith('DUPLICATE')).every(r=>r.readiness==='BLOCKED'));
 assert.ok(corrected.lines.every(r=>r.paymentAllowed===false));assert.equal(corrected.providerChecked,false);assert.equal(corrected.summary.currentRefundableCents,null);assert.equal(corrected.lines[0].evidence.provenance,'SYNTHETIC_FIXTURE');
 assert.equal(examplePlan().lines[1].scope,'UNKNOWN');
 const server=reconcileLedger({ledger:original.ledger},original.scope,[],original.createdAt);assert.deepEqual(server.lines.map(r=>r.scope),original.lines.map(r=>r.scope));
});
