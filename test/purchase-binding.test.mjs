import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ClaimDesk} from '../src/claims.mjs';
import {CaptureOwnershipCore,bindingHash,provisionedPurchases,verifyProvisionedPurchase} from '../src/purchase-binding.mjs';
import {usdAmount} from '../src/money.mjs';
const now='2026-11-02T12:00:00Z';
const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=';
function fixture(cents=3875){
  const grant={version:1,id:'grant-a',workspace:'workspace-a',operator:'operator-a',provisionedAt:now,expiresAt:'2026-11-03T12:00:00Z',salesRecordReference:'reviewed-ledger-export-1',orderId:'ORDER-A',captureId:'CAPTURE-A',merchantId:'MERCHANT-A',referenceId:'SALES-REFERENCE-A',sku:'CUP-01',lot:'LOT-A',itemOrdinal:0,itemPaidCents:cents,captureCents:cents+3400};
  const capture={id:grant.captureId,status:'COMPLETED',amount:usdAmount(grant.captureCents),create_time:'2026-10-01T12:00:00Z',payee:{merchant_id:grant.merchantId},supplementary_data:{related_ids:{order_id:grant.orderId}}};
  const order={id:grant.orderId,status:'COMPLETED',purchase_units:[{reference_id:grant.referenceId,payee:{merchant_id:grant.merchantId},amount:{...capture.amount,breakdown:{item_total:capture.amount}},items:[{sku:grant.sku,quantity:'1',unit_amount:usdAmount(cents)},{sku:'TRAY-01',quantity:'1',unit_amount:usdAmount(3400)}],payments:{captures:[structuredClone(capture)]}}]};
  return {grant,order,capture};
}
function registry(){
  const stores=new Map();
  return {claim(input){const key=bindingHash([input.merchantId,input.captureId]);if(!stores.has(key)){const db=new DatabaseSync(':memory:');stores.set(key,{db,core:new CaptureOwnershipCore(db)});}return stores.get(key).core.claim(input);},close(){for(const v of stores.values())v.db.close();}};
}
function setup(f,owner,workspace=f.grant.workspace){
  const calls={read:0,refund:0,cents:null};
  const provider={orderDetails:async()=>{calls.read++;return f.order;},captureDetails:async()=>{calls.read++;return f.capture;},refund:async row=>{calls.refund++;calls.cents=row.cents;return {id:'REFUND-A'};},verifiedRefund:async row=>({id:'REFUND-A',status:'COMPLETED',amount:usdAmount(row.cents)})};
  const desk=new ClaimDesk({now:()=>now,workspaceId:workspace,purchaseGrants:[f.grant],captureOwnership:owner,provider:async()=>provider});
  desk.publish(true);return {desk,calls};
}
test('provider order/capture and operator catalog mapping produce a variable allocation',()=>{
  for(const cents of [2599,3875]){const f=fixture(cents),p=verifyProvisionedPurchase(f.grant,f.order,f.capture,now);assert.equal(p.linePaidCents,cents);assert.equal(p.captureRemainingCents,cents+3400);assert.equal(p.provenance.catalogMapping,'OPERATOR_REVIEWED');assert.equal(p.lineId,'PROVISIONED-CAPTURE-LINE');}
});
test('missing, mismatched and ambiguous provider allocation stays manual',()=>{
  const changes=[f=>{f.capture.payee.merchant_id='OTHER';},f=>{f.capture.supplementary_data.related_ids.order_id='OTHER';},f=>{f.order.purchase_units[0].reference_id='OTHER';},f=>{f.order.purchase_units[0].items=undefined;},f=>{f.order.purchase_units[0].items[0].quantity='2';},f=>{f.order.purchase_units[0].items[1].sku='CUP-01';},f=>{f.order.purchase_units[0].amount.breakdown.shipping=usdAmount(100);},f=>{f.capture.status='PARTIALLY_REFUNDED';},f=>{f.order.purchase_units[0].payments.refunds=[{id:'OLD'}];},f=>{f.capture.create_time='2020-01-01';},f=>{f.capture.create_time='2027-01-01';},f=>{f.grant.itemPaidCents++;}];
  for(const change of changes){const f=fixture();change(f);assert.throws(()=>verifyProvisionedPurchase(f.grant,f.order,f.capture,now));}
});
test('unprovisioned workspace and client authority cannot even trigger provider lookup',async()=>{
  const f=fixture(),owner=registry(),{desk,calls}=setup(f,owner,'workspace-b');
  try{assert.equal(desk.merchantState().provisionedPurchases.length,0);await assert.rejects(desk.bindPurchase({grantId:f.grant.id}),/not provisioned/);await assert.rejects(desk.bindPurchase({grantId:f.grant.id,verified:true}),/server-provisioned/);assert.equal(calls.read,0);assert.equal(desk.merchantState().cases.length,0);}finally{desk.close();owner.close();}
});
test('binding is idempotent and a variable refund uses the original capture amount ceiling',async()=>{
  const f=fixture(),owner=registry(),{desk,calls}=setup(f,owner);
  try{
    const [a,b]=await Promise.all([desk.bindPurchase({grantId:f.grant.id}),desk.bindPurchase({grantId:f.grant.id})]);
    assert.equal(a.id,b.id);assert.equal(a.claimUrl,b.claimUrl);assert.equal(desk.merchantState().cases.length,1);assert.equal(a.amountCents,3875);
    const token=a.claimUrl.split('#')[1];desk.submit(token,{revision:0,lot:'LOT-A',acknowledged:true,photo});
    const reviewed=desk.review(a.id,{revision:1,confirmed:true});
    await Promise.all([desk.approve(a.id,{digest:reviewed.plan.digest}),desk.approve(a.id,{digest:reviewed.plan.digest})]);
    assert.equal(calls.refund,1);assert.equal(calls.cents,3875);assert.equal(desk.customerState(token).receipt.amountCents,3875);
  }finally{desk.close();owner.close();}
});
test('capture-global ownership blocks a separately provisioned workspace and altered line identity',async()=>{
  const f=fixture(),owner=registry(),a=setup(f,owner),other=structuredClone(f);other.grant.workspace='workspace-b';other.grant.id='renamed-grant';
  const b=setup(other,owner);
  try{await a.desk.bindPurchase({grantId:f.grant.id});await assert.rejects(b.desk.bindPurchase({grantId:other.grant.id}),/already assigned/);assert.equal(b.desk.merchantState().cases.length,0);assert.equal(b.calls.refund,0);}finally{a.desk.close();b.desk.close();owner.close();}
});
test('duplicate capture grants are rejected even when workspace, grant name and amount differ',()=>{
  const f=fixture();assert.throws(()=>provisionedPurchases([f.grant,{...f.grant,id:'other',workspace:'other',itemPaidCents:100}],f.grant.workspace),/Duplicate/);
});
test('an expired grant cannot start a provider lookup and an existing allocation cannot be edited',async()=>{
  const f=fixture(),owner=registry(),{desk,calls}=setup(f,owner);
  try{
    desk.now=()=> '2026-11-04T12:00:00Z';
    await assert.rejects(desk.bindPurchase({grantId:f.grant.id}),/not active/);assert.equal(calls.read,0);
    desk.now=()=>now;await desk.bindPurchase({grantId:f.grant.id});
    desk.purchaseGrants[0].itemPaidCents++;
    await assert.rejects(desk.bindPurchase({grantId:f.grant.id}),/allocation changed/);
    assert.equal(desk.merchantState().cases[0].amountCents,3875);
  }finally{desk.close();owner.close();}
});
