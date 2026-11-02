import test from 'node:test';
import assert from 'node:assert/strict';
import {SAMPLE_CASES,SAMPLE_SOURCE,DEFAULT_SAMPLE_ORDER,caseForOrder} from '../ui/sample-data.mjs';

test('the sample desk is six labelled read-only fixture states',()=>{
  assert.equal(SAMPLE_CASES.length,6);
  assert.deepEqual(SAMPLE_CASES.map(c=>c.status.code),['AWAITING_CUSTOMER','SUBMITTED','READY_FOR_APPROVAL','NEEDS_INFORMATION','FAILED','COMPLETED']);
  assert.equal(new Set(SAMPLE_CASES.map(c=>c.order)).size,6);
  assert.equal(caseForOrder(DEFAULT_SAMPLE_ORDER).status.code,'READY_FOR_APPROVAL');
  assert.equal(SAMPLE_CASES.find(c=>c.status.code==='FAILED').payment.state,'FAILED');
  assert.equal(SAMPLE_CASES.find(c=>c.status.code==='COMPLETED').receipt.reference,'SAMPLE-RF-06');
  assert.equal(SAMPLE_SOURCE.coverage.every(c=>c.disposition==='FIELD'&&c.fieldIds.length===1),true);
  assert.equal(SAMPLE_SOURCE.coverage.some(c=>/percent|coverage/i.test(c.reason)),false);
});
