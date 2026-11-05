import test from 'node:test';import assert from 'node:assert/strict';
import {loadLinkedClaim} from '../ui/reconciliation-handoff.mjs';
test('handoff reads fresh state and identifies the exact claim instead of falling back',async()=>{
 let reads=0;const fresh={cases:[{order:'first',id:'first'},{order:'bound-in-other-tab',id:'exact'}]};
 assert.equal(await loadLinkedClaim(async()=>{reads++;return fresh;},'bound-in-other-tab','exact'),fresh);assert.equal(reads,1);
 await assert.rejects(loadLinkedClaim(async()=>({cases:[fresh.cases[0]]}),'bound-in-other-tab','exact'),/no other claim/);
 await assert.rejects(loadLinkedClaim(async()=>fresh,'bound-in-other-tab','wrong-id'),/no other claim/);
});
