import test from 'node:test';
import assert from 'node:assert/strict';
import {projectClaimState} from '../ui/connected-state.mjs';

const base={
  order:'RR-STATE-01',amountCents:2599,revision:3,
  campaign:{lot:'LOT-A',fields:[],coverage:[]},
  missing:[],submission:{lot:'LOT-A',hasPhoto:true,extra:{}},
  review:true,plan:{status:'READY_FOR_APPROVAL',reason:'Evidence reviewed.'},locked:true,
};
const projection=overrides=>projectClaimState({...base,...overrides});

test('a completed receipt takes precedence over plan and evidence locks',()=>{
  const value=projection({payment:{state:'COMPLETED'},receipt:{refundId:'RF-STATE',amountCents:2599}});
  assert.equal(value.settlementComplete,true);
  assert.equal(value.paymentLabel,'Refund confirmed');
  assert.equal(value.planLabel,'Settlement complete');
  assert.deepEqual(value.blockers,[]);
  assert.match(value.lockNote,/read-only/i);
  assert.match(value.lockNote,/no further refund/i);
  assert.doesNotMatch(JSON.stringify(value),/READY_FOR_APPROVAL/);
});

test('pending, unknown and reserved payments show the actual next step, not a fresh approval',()=>{
  for(const [state,pattern] of [['PENDING',/processing/i],['UNKNOWN',/unknown/i],['RESERVED',/reserved/i]]){
    const value=projection({payment:{state},locked:true});
    assert.equal(value.settlementComplete,false,state);
    assert.equal(value.planLabel,'Payment checking',state);
    assert.equal(value.blockers.length,1,state);
    assert.match(value.blockers[0],pattern,state);
    assert.doesNotMatch(JSON.stringify(value),/READY_FOR_APPROVAL/,state);
  }
});

test('failed and cancelled refunds remain manual reconciliation with no automatic resend',()=>{
  for(const state of ['FAILED','CANCELLED']){
    const value=projection({payment:{state},locked:true});
    assert.equal(value.planLabel,'Manual reconciliation',state);
    assert.match(value.blockers[0],/reconcile/i,state);
    assert.match(value.blockers[0],/no replacement refund/i,state);
    assert.doesNotMatch(JSON.stringify(value),/READY_FOR_APPROVAL/,state);
  }
});

test('manual, review, missing and correction states keep their recorded blockers',()=>{
  assert.equal(projection({payment:null,locked:false,plan:{status:'MANUAL',reason:'Outside the refund window.'}}).planLabel,'Manual review');
  assert.match(projection({payment:null,locked:false,plan:{status:'MANUAL',reason:'Outside the refund window.'}}).blockers[0],/Outside the refund window/);
  assert.match(projection({payment:null,locked:false,plan:{status:'REVIEW',reason:'Evidence review required.'}}).blockers[0],/Evidence review required/);
  assert.ok(projection({payment:null,locked:false,submission:null,missing:['Add a photograph.']}).blockers.includes('Add a photograph.'));
  assert.match(projection({payment:null,locked:false,correction:{state:'REQUESTED',message:'Upload a clearer label.'}}).blockers[0],/Upload a clearer label/);
});
