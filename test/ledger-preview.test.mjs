import test from 'node:test';
import assert from 'node:assert/strict';
import {previewLedger} from '../src/ledger-preview.mjs';
import {ClaimDesk} from '../src/claims.mjs';
import {claimRoutes} from '../src/claims-http.mjs';

const scope={sku:'CUP',lot:'LOT-A'};
const ledger=()=>({version:1,currency:'USD',source:{kind:'merchant-ledger',label:'Test export'},orders:[{orderId:'ORDER',captureId:'CAPTURE',capturedAt:'2026-10-01T12:00:00Z',status:'COMPLETED',lines:[{declaredLineId:'LINE',sku:'CUP',lot:'LOT-A',quantity:1,itemPaidCents:3875,taxCents:0,shippingCents:0,refundedCents:500}]}]});
test('preview derives variable declared balances without asserting provider verification',()=>{
  const input=ledger(),before=JSON.stringify(input),result=previewLedger(input,scope);
  assert.equal(result.summary.candidateCents,3375);
  assert.equal(result.summary.verifiedRefundableCents,null);
  assert.equal(result.summary.confirmedRefundCents,null);
  assert.equal(result.paymentAllowed,false);
  assert.equal(result.providerChecked,false);
  assert.equal(result.persisted,false);
  assert.equal(result.lines[0].allocationId,null);
  assert.equal(JSON.stringify(input),before);
});
test('zero is explicit, unknown is manual, and uncertain scope is not a match',()=>{
  for(const value of [null,'UNKNOWN']){
    const input=ledger();input.orders[0].lines[0].taxCents=value;
    const result=previewLedger(input,scope);
    assert.equal(result.summary.candidateCents,0);
    assert.equal(result.lines[0].taxCents,null);
    assert.equal(result.lines[0].disposition,'MANUAL');
  }
  assert.equal(previewLedger(ledger(),null).lines[0].disposition,'MANUAL');
  assert.equal(previewLedger(ledger(),{...scope,lot:'OTHER'}).lines[0].disposition,'MANUAL');
  assert.equal(previewLedger(ledger(),{...scope,sku:'OTHER'}).lines[0].disposition,'UNAFFECTED');
});
test('renaming a repeated capture order or line cannot inflate candidate value',()=>{
  const input=ledger(),duplicate=structuredClone(input.orders[0]);
  duplicate.orderId='RENAMED';duplicate.lines[0].declaredLineId='RENAMED';duplicate.lines[0].itemPaidCents=5000;
  input.orders.push(duplicate);
  const result=previewLedger(input,scope);
  assert.equal(result.summary.candidateCents,0);
  assert.equal(result.summary.manualCount,2);
  assert.ok(result.lines.every(row=>row.allocationId===null&&row.paymentAllowed===false));
});
test('reject authority fields, invalid cents, excessive input and ambiguous line references',()=>{
  for(const key of ['workspaceId','merchantId','allocationId','verification','providerFacts']){
    const input=ledger();input[key]='forged';assert.throws(()=>previewLedger(input,scope),/unexpected field/);
  }
  for(const value of [-1,1.2,'2599',Infinity,100000001]){
    const input=ledger();input.orders[0].lines[0].itemPaidCents=value;assert.throws(()=>previewLedger(input,scope),/integer cents/);
  }
  const large=ledger();large.orders=Array.from({length:51},()=>large.orders[0]);assert.throws(()=>previewLedger(large,scope),/1–50/);
  const repeated=ledger();repeated.orders[0].lines.push({...repeated.orders[0].lines[0]});assert.throws(()=>previewLedger(repeated,scope),/duplicate line/);
});
test('renamed same-scope lines within a capture require allocation review',()=>{
  const input=ledger();input.orders[0].lines.push({...input.orders[0].lines[0],declaredLineId:'RENAMED'});
  const result=previewLedger(input,scope);
  assert.equal(result.summary.candidateCents,0);
  assert.equal(result.summary.manualCount,2);
});
test('preview route requires merchant authorization and same-origin POST without provider or durable effects',async()=>{
  let calls=0,output;
  const desk=new ClaimDesk({path:':memory:',provider:async()=>{calls++;throw new Error('Provider must not be called');}});
  try{
    const before=JSON.stringify(desk.merchantState());
    const handler=claimRoutes(desk,{origin:'https://test.invalid',json:(_res,status,value)=>{output={status,value};},body:async req=>req.input});
    const invoke=async({method='POST',token=desk.merchantKey(),origin='https://test.invalid'}={})=>{
      await handler({method,headers:{origin,'content-type':'application/json',authorization:`Bearer ${token}`},input:ledger()},{setHeader(){}},'/api/merchant/import-preview');return output;
    };
    assert.equal((await invoke({token:'customer-or-unknown'})).status,401);
    assert.equal((await invoke({origin:'https://elsewhere.invalid'})).status,403);
    assert.equal((await invoke({method:'GET'})).status,405);
    const result=await invoke();assert.equal(result.status,200);assert.equal(result.value.paymentAllowed,false);
    assert.equal(JSON.stringify(desk.merchantState()),before);
    assert.equal(calls,0);
  }finally{desk.close();}
});
