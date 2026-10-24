import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ClaimDesk} from '../src/claims.mjs';
import {claimRoutes} from '../src/claims-http.mjs';
import {SourceWorkspace,assistCases} from '../src/source-workspace.mjs';

const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD7kAAAAASUVORK5CYII=';
function setup(path=':memory:') {
  const counters={capture:0,refund:0,read:0};let reference,readFails=false,refundFails=false,complete=false;
  const capture={id:'TEST-CAPTURE',status:'COMPLETED',amount:{currency_code:'USD',value:'59.99'},create_time:new Date().toISOString()};
  const provider={
    async createOrder(input){reference=input.referenceId;return {id:'TEST-ORDER',links:[{rel:'approve',href:'https://www.sandbox.paypal.com/checkoutnow?token=TEST-ORDER'}]};},
    async orderDetails(){return {id:'TEST-ORDER',status:complete?'COMPLETED':'APPROVED',purchase_units:[{reference_id:reference,amount:capture.amount,payee:{merchant_id:'TEST-MERCHANT'},payments:{captures:[capture]}}]};},
    async captureOrder(){counters.capture++;complete=true;return {};},
    async captureDetails(){return capture;},
    async refund(row){counters.refund++;if(refundFails)throw new Error('Response interrupted');return {id:'TEST-REFUND'};},
    async verifiedRefund(){counters.read++;if(readFails)throw new Error('Readback unavailable');return {id:'TEST-REFUND',status:'COMPLETED',amount:{currency_code:'USD',value:'25.99'}};},
  };
  const desk=new ClaimDesk({path,provider:async()=>provider});
  return {desk,provider,counters,capture,setReadFails:v=>readFails=v,setRefundFails:v=>refundFails=v};
}
async function create(desk){desk.publish(true);const checkout=await desk.createCheckout();return desk.captureCheckout(checkout.id);}
function access(item){return item.claimUrl.split('#')[1];}
function ready(desk,item){const a=access(item);desk.submit(a,{revision:0,lot:'LOT-A',acknowledged:true,photo});return desk.review(item.id,{revision:1,confirmed:true});}
async function publishScenario(desk,{route='ORIGINAL_PAYMENT_CANDIDATE'}={}){
  const quotes=['Upload a photograph of the product label.','Confirm the required step described in the original notice.'];
  const ws=new SourceWorkspace(desk.db,{loadSource:async()=>({title:'Test source',recallNumber:'27026',products:[{name:'Scenario product'}],sourceUrl:'https://www.cpsc.gov/Recalls/2026/Test',sourceDigest:'b'.repeat(64),route,remedies:quotes}),ai:{status:()=>({model:'test-double'}),generate:async()=>JSON.stringify({requirements:[{kind:'PHOTO',quote:quotes[0]},{kind:'CONFIRMATION',quote:quotes[1]}]})}});
  const row=await ws.import('27026');const suggested=await ws.suggest(row.id,1);const reviewed=ws.review(row.id,{revision:2,fieldIds:suggested.suggestion.requirements.map(f=>f.id),confirmed:true});
  return {ws,reviewed,activate:()=>ws.activate(row.id,{revision:reviewed.revision,sku:'NEW-ITEM',lot:'LOT-B',confirmed:true},desk)};
}

test('a verified sandbox order becomes one private claim, not a client-supplied capture',async()=>{
  const {desk,counters}=setup();try{
    await assert.rejects(desk.createCheckout(),/publish/);
    const item=await create(desk);const again=await desk.captureCheckout(item.id);
    assert.equal(item.id,again.id);assert.equal(counters.capture,1);assert.equal(desk.merchantState().cases.length,1);
    const customer=desk.customerState(access(item));
    assert.equal(customer.status.code,'AWAITING_CUSTOMER');assert.equal(customer.amountCents,2599);
    for(const field of ['claimUrl','access','purchase','payment','plan','photo'])assert.equal(customer[field],undefined);
    assert.throws(()=>desk.customerState('wrong'),/invalid/);
    assert.equal(desk.authenticateMerchant(access(item)),false);
  }finally{desk.close();}
});
test('missing evidence and unmatched lots stay actionable without authorizing refunds',async()=>{
  const {desk,counters}=setup();try{
    const item=await create(desk),a=access(item);
    let view=desk.submit(a,{revision:0,lot:'LOT-A',acknowledged:true});
    assert.equal(view.status.code,'NEEDS_INFORMATION');assert.equal(view.missing.length,1);
    assert.throws(()=>desk.review(item.id,{revision:1,confirmed:true}),/Review/);
    view=desk.submit(a,{revision:1,lot:'LOT-B',acknowledged:true,photo});
    assert.equal(view.status.code,'MANUAL');assert.throws(()=>desk.review(item.id,{revision:2,confirmed:true}),/Review/);
    await assert.rejects(desk.approve(item.id,{digest:'invented'}),/Approval/);assert.equal(counters.refund,0);
    assert.throws(()=>desk.submit(a,{revision:2,lot:'LOT-A',photo:'data:image/svg+xml;base64,PHN2Zz4='}),/PNG/);
  }finally{desk.close();}
});
test('customer changes invalidate reviewed evidence and exact-action approval',async()=>{
  const {desk,counters}=setup();try{
    const item=await create(desk),view=ready(desk,item);
    desk.submit(access(item),{revision:1,lot:'LOT-A',acknowledged:true});
    assert.throws(()=>desk.review(item.id,{revision:1,confirmed:true}),/current/);
    await assert.rejects(desk.approve(item.id,{digest:view.plan.digest}),/Approval/);
    assert.equal(desk.merchantState().cases[0].review,null);assert.equal(counters.refund,0);
  }finally{desk.close();}
});
test('concurrent approvals dispatch once and both sides see the same confirmed receipt',async()=>{
  const {desk,counters}=setup();try{
    const item=await create(desk),view=ready(desk,item);
    await Promise.all([desk.approve(item.id,{digest:view.plan.digest}),desk.approve(item.id,{digest:view.plan.digest})]);
    await desk.approve(item.id,{digest:view.plan.digest});
    assert.equal(counters.refund,1);
    const customer=desk.customerState(access(item));assert.equal(customer.status.code,'COMPLETED');
    assert.equal(customer.receipt.refundId,'TEST-REFUND');assert.equal(customer.receipt.amountCents,2599);
    assert.deepEqual(customer.receipt,desk.merchantState().cases[0].receipt);
    assert.throws(()=>desk.submit(access(item),{revision:1,lot:'LOT-A'}),/locked/);
  }finally{desk.close();}
});
test('a failed readback stays unresolved; reopening reconciles without another refund',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'recall-claims-'));const path=join(dir,'claims.sqlite');
  const s=setup(path);let reopened;
  try{
    const item=await create(s.desk),view=ready(s.desk,item);s.setReadFails(true);
    await assert.rejects(s.desk.approve(item.id,{digest:view.plan.digest}),/unavailable/);
    assert.equal(s.desk.customerState(access(item)).receipt,null);assert.equal(s.desk.customerState(access(item)).status.code,'UNKNOWN');
    s.desk.close();s.setReadFails(false);reopened=new ClaimDesk({path,provider:async()=>s.provider});
    const result=await reopened.reconcile(item.id);assert.equal(result.receipt.refundId,'TEST-REFUND');assert.equal(s.counters.refund,1);
    assert.equal(reopened.customerState(access(item)).status.code,'COMPLETED');
  }finally{if(reopened)reopened.close();rmSync(dir,{recursive:true,force:true});}
});
test('a lost refund response cannot cause a second dispatch or a false completed state',async()=>{
  const s=setup();try{
    const item=await create(s.desk),view=ready(s.desk,item);s.setRefundFails(true);
    await assert.rejects(s.desk.approve(item.id,{digest:view.plan.digest}),/interrupted/);
    await s.desk.approve(item.id,{digest:view.plan.digest});
    await assert.rejects(s.desk.reconcile(item.id),/Manual reconciliation/);
    assert.equal(s.counters.refund,1);assert.equal(s.desk.customerState(access(item)).receipt,null);
  }finally{s.desk.close();}
});
test('changed original capture and old purchases cannot be sent for automatic refunds',async()=>{
  const s=setup();try{
    const item=await create(s.desk),view=ready(s.desk,item);
    s.capture.status='PARTIALLY_REFUNDED';await assert.rejects(s.desk.approve(item.id,{digest:view.plan.digest}),/changed/);
    s.capture.status='COMPLETED';const claim=s.desk.claim(item.id);claim.purchase.capturedAt='2025-01-01';s.desk.saveClaim(claim);
    assert.equal(s.desk.customerState(access(item)).status.code,'MANUAL');
    await assert.rejects(s.desk.approve(item.id,{digest:view.plan.digest}),/Approval/);assert.equal(s.counters.refund,0);
  }finally{s.desk.close();}
});
test('HTTP boundary separates merchant sessions, customer links and cross-origin writes',async()=>{
  const s=setup();try{
    const item=await create(s.desk);let output,headers;
    const handler=claimRoutes(s.desk,{origin:'http://127.0.0.1:4318',json:(res,status,value)=>{output={status,value};},body:async req=>req.input||{}});
    async function request(path,{method='GET',token,origin='http://127.0.0.1:4318',input}={}){headers={};await handler({method,headers:{authorization:token?`Bearer ${token}`:'',origin,'content-type':'application/json'},input},{setHeader:(k,v)=>headers[k]=v},path);return output;}
    assert.equal((await request('/api/merchant/state')).status,401);
    assert.equal((await request('/api/merchant/state',{token:access(item)})).status,401);
    assert.equal((await request('/api/merchant/request-changes',{method:'POST',token:access(item),input:{id:item.id,revision:0,message:'Please replace the photograph.',replacePhoto:true}})).status,401);
    assert.equal((await request('/api/claim/state',{token:s.desk.merchantKey()})).status,401);
    assert.equal((await request('/api/claim/state',{token:access(item)})).status,200);
    assert.equal((await request('/api/merchant/approve',{method:'POST',token:s.desk.merchantKey(),origin:'https://other.example'})).status,403);
    assert.equal((await request('/api/merchant/login',{method:'POST',input:{key:s.desk.merchantKey()}})).status,200);
    assert.match(headers['Set-Cookie'],/HttpOnly; SameSite=Strict/);
  }finally{s.desk.close();}
});
test('publishing a sourced scenario does not rewrite an earlier pending purchase or claim',async()=>{
  const s=setup();try{
    s.desk.publish(true);const pending=await s.desk.createCheckout();
    const source=await publishScenario(s.desk);source.activate();
    assert.equal(s.desk.activeCampaign().sku,'NEW-ITEM');
    const oldClaim=await s.desk.captureCheckout(pending.id);
    assert.equal(oldClaim.campaign.sku,'CUP-01');assert.equal(oldClaim.campaign.lot,'LOT-A');
    const next=await s.desk.createCheckout();const newClaim=await s.desk.captureCheckout(next.id);
    assert.equal(newClaim.campaign.sku,'NEW-ITEM');assert.equal(newClaim.campaign.fields.length,2);
    assert.equal(s.desk.customerState(access(oldClaim)).campaign.sku,'CUP-01');
  }finally{s.desk.close();}
});
test('source-required responses block review until supplied and are bound into refund approval',async()=>{
  const s=setup();try{
    const source=await publishScenario(s.desk);source.activate();const checkout=await s.desk.createCheckout();const item=await s.desk.captureCheckout(checkout.id),a=access(item);
    let value=s.desk.submit(a,{revision:0,lot:'LOT-B',acknowledged:true,photo,extra:{}});
    assert.equal(value.status.code,'NEEDS_INFORMATION');assert.equal(value.missing.length,1);
    assert.throws(()=>s.desk.review(item.id,{revision:1,confirmed:true}),/Review/);
    value=s.desk.submit(a,{revision:1,lot:'LOT-B',acknowledged:true,extra:{'field-2':true}});
    const approved=s.desk.review(item.id,{revision:2,confirmed:true});assert.equal(approved.plan.status,'READY_FOR_APPROVAL');
    assert.throws(()=>s.desk.submit(a,{revision:2,lot:'LOT-B',extra:{unexpected:true}}),/Unexpected/);
    s.desk.submit(a,{revision:2,lot:'LOT-B',acknowledged:true,extra:{'field-2':false}});
    await assert.rejects(s.desk.approve(item.id,{digest:approved.plan.digest}),/Approval/);assert.equal(s.counters.refund,0);
  }finally{s.desk.close();}
});
test('unsupported source remedy cannot publish an automatic original-payment scenario',async()=>{
  const s=setup();try{const source=await publishScenario(s.desk,{route:'NON_REFUND_REMEDY'});assert.throws(source.activate,/manual remedy/);assert.equal(s.desk.activeCampaign().sku,'CUP-01');}finally{s.desk.close();}
});

test('merchant correction invalidates approval, persists, and requires a new photograph and review',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'recall-correction-')),path=join(dir,'claims.sqlite');
  const s=setup(path);let reopened;
  try{
    const item=await create(s.desk),before=ready(s.desk,item),a=access(item);
    const request=s.desk.requestChanges(item.id,{revision:1,message:'The lot is blurred. Please send a clearer photograph.',replacePhoto:true});
    assert.equal(request.revision,2);assert.equal(request.review,null);assert.equal(request.status.code,'NEEDS_INFORMATION');
    await assert.rejects(s.desk.approve(item.id,{digest:before.plan.digest}),/Approval/);assert.equal(s.counters.refund,0);
    assert.throws(()=>s.desk.review(item.id,{revision:2,confirmed:true}),/Review/);
    assert.throws(()=>s.desk.submit(a,{revision:1,lot:'LOT-A',acknowledged:true,photo,correctionResponse:'Updated'}),/changed/);
    assert.throws(()=>s.desk.submit(a,{revision:2,lot:'LOT-A',acknowledged:true,correctionResponse:'Updated'}),/different photograph/);
    assert.equal(s.desk.claim(item.id).correction.state,'REQUESTED');
    s.desk.close();reopened=new ClaimDesk({path,provider:async()=>s.provider});
    const customer=reopened.customerState(a);assert.equal(customer.correction.message,request.correction.message);assert.equal(customer.correction.photoHash,undefined);
    const nextPhoto='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp0kAAAAASUVORK5CYII=';
    const response=reopened.submit(a,{revision:2,lot:'LOT-A',acknowledged:true,photo:nextPhoto,correctionResponse:'I uploaded a closer photograph with a readable lot.'});
    assert.equal(response.correction.state,'RESPONDED');assert.equal(response.status.code,'SUBMITTED');assert.equal(response.revision,3);
    const queueAI={generate:async()=>JSON.stringify({view:'REVIEW'}),status:()=>({model:'test-double'})};
    assert.match((await assistCases(queueAI,reopened,'What needs my evidence review?')).message,/Needs evidence review: 1 claim/);
    assert.equal(reopened.merchantState().cases[0].correction.response,response.correction.response);
    assert.throws(()=>reopened.submit(a,{revision:3,lot:'LOT-A',acknowledged:true,photo}),/different photograph/);
    assert.throws(()=>reopened.submit(a,{revision:3,lot:'LOT-A',acknowledged:true,photo:null}),/different photograph/);
    assert.equal(reopened.claim(item.id).revision,3);
    await assert.rejects(reopened.approve(item.id,{digest:before.plan.digest}),/Approval/);
    const reviewed=reopened.review(item.id,{revision:3,confirmed:true});assert.notEqual(reviewed.plan.digest,before.plan.digest);
    assert.match((await assistCases(queueAI,reopened,'What needs my evidence review?')).message,/Needs evidence review: 0 claims/);
    queueAI.generate=async()=>JSON.stringify({view:'READY'});assert.match((await assistCases(queueAI,reopened,'What is ready for approval?')).message,/Ready for merchant approval: 1 claim/);
    assert.throws(()=>reopened.submit(a,{revision:3,lot:'LOT-A',acknowledged:true,photo}),/different photograph/);
    await reopened.approve(item.id,{digest:reviewed.plan.digest});assert.equal(s.counters.refund,1);
    assert.throws(()=>reopened.requestChanges(item.id,{revision:3,message:'Please update the photograph again.',replacePhoto:true}),/locked/);
  }finally{if(reopened)reopened.close();else s.desk.close();rmSync(dir,{recursive:true,force:true});}
});

test('clarification requests preserve the photo, require a response, and reject stale or malformed requests',async()=>{
  const {desk,counters}=setup();try{
    const item=await create(desk),a=access(item);
    assert.throws(()=>desk.requestChanges(item.id,{revision:0,message:'Please clarify this item.',replacePhoto:false}),/current submission/);
    desk.submit(a,{revision:0,lot:'LOT-A',acknowledged:true,photo});
    for(const input of [{revision:0,message:'Please clarify this item.',replacePhoto:false},{revision:1,message:'short',replacePhoto:false},{revision:1,message:'x'.repeat(601),replacePhoto:false},{revision:1,message:'Please clarify this item.',replacePhoto:'yes'}])assert.throws(()=>desk.requestChanges(item.id,input));
    desk.requestChanges(item.id,{revision:1,message:'Please clarify the product marking in your response.',replacePhoto:false});
    assert.throws(()=>desk.requestChanges(item.id,{revision:2,message:'A second pending request should not replace the first.',replacePhoto:false}),/already waiting/);
    for(const response of ['', 'x'.repeat(1001)])assert.throws(()=>desk.submit(a,{revision:2,lot:'LOT-A',acknowledged:true,correctionResponse:response}),/Describe/);
    const result=desk.submit(a,{revision:2,lot:'LOT-A',acknowledged:true,correctionResponse:'The marking reads LOT-A.'});
    assert.equal(result.status.code,'SUBMITTED');assert.equal(desk.claim(item.id).submission.photo,photo);assert.equal(result.correction.state,'RESPONDED');assert.equal(counters.refund,0);
  }finally{desk.close();}
});

test('merchant summaries omit photographs while evidence reads bind to the current authorized revision',async()=>{
  const {desk}=setup();try{
    const item=await create(desk),a=access(item);
    desk.submit(a,{revision:0,lot:'LOT-A',acknowledged:true,photo});
    const summary=desk.merchantState().cases[0];
    assert.equal(summary.photo,undefined);assert.equal(summary.submission.hasPhoto,true);
    assert.equal(JSON.stringify(desk.merchantState()).includes(photo),false);
    assert.deepEqual(desk.photograph(item.id,{revision:1}),{id:item.id,revision:1,photo});
    assert.throws(()=>desk.photograph(item.id,{revision:0}),/changed/);
    assert.throws(()=>desk.photograph('another-claim',{revision:1}),/not found/);
    let output;
    const handler=claimRoutes(desk,{origin:'http://127.0.0.1:4318',json:(_res,status,value)=>{output={status,value};},body:async req=>req.input});
    const req={method:'POST',headers:{origin:'http://127.0.0.1:4318','content-type':'application/json',authorization:'Bearer '+a},input:{id:item.id,revision:1}};
    await handler(req,{setHeader(){}},'/api/merchant/photograph');assert.equal(output.status,401);
    req.headers.authorization='Bearer '+desk.merchantKey();await handler(req,{setHeader(){}},'/api/merchant/photograph');assert.equal(output.status,200);assert.equal(output.value.photo,photo);
  }finally{desk.close();}
});
