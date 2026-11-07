import test from 'node:test';import assert from 'node:assert/strict';
import {loadLinkedClaim} from '../ui/reconciliation-handoff.mjs';
test('handoff reads fresh state and identifies the exact claim instead of falling back',async()=>{
 let reads=0;const fresh={cases:[{order:'first',id:'first'},{order:'bound-in-other-tab',id:'exact'}]};
 assert.equal(await loadLinkedClaim(async()=>{reads++;return fresh;},'bound-in-other-tab','exact'),fresh);assert.equal(reads,1);
 await assert.rejects(loadLinkedClaim(async()=>({cases:[fresh.cases[0]]}),'bound-in-other-tab','exact'),/no other claim/);
 await assert.rejects(loadLinkedClaim(async()=>fresh,'bound-in-other-tab','wrong-id'),/no other claim/);
});
import {purchaseHandoff} from '../ui/reconciliation-handoff.mjs';
test('missing-binding and missing-evidence handoffs are actionable drafts, never payment authority',()=>{
 const row={orderId:'ORDER-X',declaredLineId:'cup',scope:'AFFECTED',sku:'RH-CUP',lot:'LOT-A',readiness:'NEEDS_BINDING'};
 const binding=purchaseHandoff(row);assert.equal(binding.kind,'BINDING');assert.match(binding.text,/ORDER-X \/ cup/);assert.match(binding.text,/operator must provision/);assert.match(binding.text,/does not create a claim/);
 const missing=purchaseHandoff({...row,readiness:'NEEDS_EVIDENCE',lot:null});assert.equal(missing.kind,'EVIDENCE');assert.match(missing.text,/actual product identifier and lot/);assert.match(missing.text,/not sent automatically/);
 for(const other of [{scope:'EXCLUDED'},{readiness:'BLOCKED'},{readiness:'LINKED_CLAIM'}])assert.equal(purchaseHandoff({...row,...other}),null);
});
