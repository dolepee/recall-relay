// Actual workerd + SQLite storage; every external provider call is intercepted.
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

const origin='https://recall-relay.test',state=await mkdtemp(join(tmpdir(),'recall-cloud-test-'));
const recallFixture=JSON.parse(await readFile(new URL('../test/fixtures/cpsc-20261021.json',import.meta.url),'utf8'));
let reference,captured=false,refundPosts=0,unexpected=0,loseRefundResponse=false,failReadback=false;
const amount={value:'59.99',currency_code:'USD'};
const capture={id:'FAKE-CAPTURE',status:'COMPLETED',amount,create_time:new Date().toISOString()};
const json=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
async function fakeNetwork(request){
  const u=new URL(request.url),path=u.pathname;
  if(u.origin==='https://www.saferproducts.gov'&&path==='/RestWebServices/Recall'&&u.searchParams.get('RecallNumber')==='27026')return json([recallFixture.records.find(record=>record.RecallNumber==='27026')]);
  if(u.origin!=='https://api-m.sandbox.paypal.com'){unexpected++;throw new Error('Unexpected external request in isolated test');}
  if(path==='/v1/oauth2/token')return json({token_type:'Bearer',access_token:'test-token',expires_in:300});
  if(path==='/v2/checkout/orders'&&request.method==='POST'){const input=await request.json();reference=input.purchase_units[0].reference_id;captured=false;return json({id:'FAKE-ORDER',links:[{rel:'approve',href:'https://www.sandbox.paypal.com/checkoutnow?token=FAKE-ORDER'}]});}
  if(path==='/v2/checkout/orders/FAKE-ORDER/capture'){captured=true;return json({id:'FAKE-ORDER',status:'COMPLETED'});}
  if(path==='/v2/checkout/orders/FAKE-ORDER')return json({id:'FAKE-ORDER',status:captured?'COMPLETED':'APPROVED',purchase_units:[{reference_id:reference,amount,payee:{merchant_id:'TEST-MERCHANT'},...(captured?{payments:{captures:[capture]}}:{})}]});
  if(path==='/v2/payments/captures/FAKE-CAPTURE')return json(capture);
  if(path==='/v2/payments/captures/FAKE-CAPTURE/refund'){refundPosts++;assert.deepEqual((await request.json()).amount,{value:'25.99',currency_code:'USD'});if(loseRefundResponse)return new Response('Interrupted fake response',{status:503});return json({id:'FAKE-REFUND'});}
  if(path==='/v2/payments/refunds/FAKE-REFUND'&&failReadback)return new Response('Readback unavailable',{status:503});
  if(path==='/v2/payments/refunds/FAKE-REFUND')return json({id:'FAKE-REFUND',status:'COMPLETED',amount:{value:'25.99',currency_code:'USD'},links:[{rel:'up',href:'https://api-m.sandbox.paypal.com/v2/payments/captures/FAKE-CAPTURE'}]});
  unexpected++;throw new Error('Unexpected sandbox route in isolated test');
}
// Test-only overlay seeds durable crash boundaries. It exists only in this
// Miniflare module list, never in the production bundle or deployment config.
const recoveryFixture=`
import worker,{RecallWorkspace as ProductionWorkspace,UsageBudget} from './production.mjs';
export {UsageBudget};
export class RecallWorkspace extends ProductionWorkspace {
  async handle(input){
    if(input.path==='/api/merchant/test-reserve'&&input.owner){
      const state=await super.handle({...input,path:'/api/merchant/state',method:'GET'});
      const claim=state.value.cases.find(c=>c.id===input.body.id);
      if(claim?.plan.status!=='READY_FOR_APPROVAL'||claim.plan.digest!==input.body.digest)throw new Error('Invalid test approval');
      const a=claim.plan.action,id=crypto.randomUUID();
      this.ctx.storage.transactionSync(()=>{
        this.ctx.storage.sql.exec('INSERT INTO refunds VALUES (?,?,?,?,?,?,?,?,NULL)',a.merchantId,a.captureId,a.lineId,claim.plan.digest,id,a.amountCents,a.currency,'RESERVED');
        if(input.body.begun)this.ctx.storage.sql.exec("UPDATE refunds SET state='UNKNOWN' WHERE request_id=? AND state='RESERVED'",id);
      });
      return {status:200,value:{requestId:id}};
    }
    return super.handle(input);
  }
}
export default worker;
`;
const production=await readFile(resolve('cloud-dist/worker.js'),'utf8');
const options=()=>convertV4MiniflareOptions({
  name:'recall-relay-test',modules:[
    {type:'ESModule',path:resolve('cloud-dist/recovery-fixture.mjs'),contents:recoveryFixture},
    {type:'ESModule',path:resolve('cloud-dist/production.mjs'),contents:production},
  ],
  compatibilityDate:'2026-10-23',compatibilityFlags:['nodejs_compat'],
  bindings:{PUBLIC_ORIGINS:[origin],AI_ENABLED:false,PAYPAL_SANDBOX_CLIENT_ID:'test-application',PAYPAL_SANDBOX_CLIENT_SECRET:'disposable-test-secret'},
  durableObjects:{WORKSPACES:{className:'RecallWorkspace',useSQLite:true},BUDGET:{className:'UsageBudget',useSQLite:true}},
  resourcePersistencePath:state,outboundService:fakeNetwork,
});
let mf=new Miniflare(options());
try{
  async function call(path,{cookie='',body,authorization}={}){
    const response=await mf.dispatchFetch(origin+path,{method:body?'POST':'GET',headers:{Cookie:cookie,Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(authorization?{Authorization:authorization}:{})},body:body?JSON.stringify(body):undefined});
    return {status:response.status,value:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  const alice=(await call('/api/merchant/state')).cookie,bob=(await call('/api/merchant/state')).cookie;
  const action=(path,body)=>call('/api/merchant/'+path,{cookie:alice,body});
  const imported=await action('source-import',{recallNumber:'27026'});assert.equal(imported.status,200,JSON.stringify(imported));
  assert.equal((await action('publish',{confirmed:true})).status,200);
  assert.equal((await call('/api/merchant/state',{cookie:bob})).value.published,false);
  const checkout=await action('checkout',{});assert.equal(checkout.status,200,JSON.stringify(checkout));
  const bound=await action('capture',{id:checkout.value.id});assert.equal(bound.status,200,JSON.stringify(bound));
  const url=new URL(bound.value.claimUrl,origin),token=url.hash.slice(1),query=url.search;
  assert.equal((await call('/api/claim/state'+query,{authorization:'Bearer '+token})).status,200);
  assert.equal((await call('/api/claim/state'+query,{authorization:'Bearer '+'x'.repeat(43)})).status,401);
  const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp0kAAAAASUVORK5CYII=';
  const submission=await call('/api/claim/submit'+query,{authorization:'Bearer '+token,body:{revision:0,lot:'LOT-A',photo:image,acknowledged:true}});assert.equal(submission.status,200);
  const summaries=await call('/api/merchant/state',{cookie:alice});assert.equal(summaries.value.cases[0].photo,undefined);assert(!JSON.stringify(summaries.value).includes(image));
  const evidence=await action('photograph',{id:checkout.value.id,revision:1});assert.equal(evidence.status,200);assert.equal(evidence.value.photo,image);
  assert.equal((await call('/api/merchant/photograph',{cookie:bob,body:{id:checkout.value.id,revision:1}})).status,400);
  assert.equal((await action('photograph',{id:checkout.value.id,revision:0})).status,400);
  const cross=await call('/api/merchant/review',{cookie:bob,body:{id:checkout.value.id,revision:1,confirmed:true}});assert.equal(cross.status,400);
  const requested=await action('request-changes',{id:checkout.value.id,revision:1,message:'Please clarify the product label in your response.',replacePhoto:false});assert.equal(requested.status,200);
  let correction=await call('/api/claim/state'+query,{authorization:'Bearer '+token});assert.equal(correction.value.correction.state,'REQUESTED');assert.equal(correction.value.correction.photoHash,undefined);
  assert.equal((await call('/api/merchant/request-changes',{cookie:bob,body:{id:checkout.value.id,revision:2,message:'Try to replace another workspace request.',replacePhoto:false}})).status,400);
  await mf.dispose();mf=new Miniflare(options());
  correction=await call('/api/claim/state'+query,{authorization:'Bearer '+token});assert.equal(correction.value.correction.state,'REQUESTED');
  assert.equal((await action('review',{id:checkout.value.id,revision:2,confirmed:true})).status,400);
  const updated=await call('/api/claim/submit'+query,{authorization:'Bearer '+token,body:{revision:2,lot:'LOT-A',acknowledged:true,correctionResponse:'The label clearly reads LOT-A.'}});assert.equal(updated.status,200);assert.equal(updated.value.correction.state,'RESPONDED');
  const reviewed=await action('review',{id:checkout.value.id,revision:3,confirmed:true});assert.equal(reviewed.status,200);
  const approval={id:checkout.value.id,digest:reviewed.value.plan.digest};
  const reserved=await action('test-reserve',approval);assert.equal(reserved.status,200);
  await mf.dispose();mf=new Miniflare(options());
  const beforeResume=await call('/api/merchant/state',{cookie:alice});
  assert.equal(beforeResume.value.cases[0].payment.state,'RESERVED');assert.equal(refundPosts,0);
  assert.equal((await action('approve',{...approval,digest:'stale'})).status,400);
  const concurrent=await Promise.all([action('approve',approval),action('approve',approval)]);assert(concurrent.every(r=>r.status===200));assert.equal(refundPosts,1);
  assert.equal(concurrent.find(r=>r.value.receipt)?.value.payment.request_id,reserved.value.requestId);
  let customer=await call('/api/claim/state'+query,{authorization:'Bearer '+token});assert.equal(customer.value.receipt.refundId,'FAKE-REFUND');assert.equal(customer.value.receipt.amountCents,2599);
  await mf.dispose();mf=new Miniflare(options());
  const replay=await action('approve',approval);assert.equal(replay.status,200,JSON.stringify(replay));assert.equal(replay.value.receipt.refundId,'FAKE-REFUND');assert.equal(refundPosts,1);
  customer=await call('/api/claim/state'+query,{authorization:'Bearer '+token});assert.equal(customer.value.receipt.status,'COMPLETED');
  // Persisted UNKNOWN without a dispatch or lookup hint must still never resend.
  async function anotherReady(cookie){
    const act=(path,body)=>call('/api/merchant/'+path,{cookie,body});
    await act('publish',{confirmed:true});const checkout=await act('checkout',{});
    const bound=await act('capture',{id:checkout.value.id});assert.equal(bound.status,200);
    const url=new URL(bound.value.claimUrl,origin);
    const submit=await call('/api/claim/submit'+url.search,{authorization:'Bearer '+url.hash.slice(1),body:{revision:0,lot:'LOT-A',photo:image,acknowledged:true}});assert.equal(submit.status,200);
    const review=await act('review',{id:checkout.value.id,revision:1,confirmed:true});assert.equal(review.status,200);
    return {act,approval:{id:checkout.value.id,digest:review.value.plan.digest}};
  }
  const begun=await anotherReady(bob);
  await begun.act('test-reserve',{...begun.approval,begun:true});
  await mf.dispose();mf=new Miniflare(options());
  const blocked=await begun.act('approve',begun.approval);
  assert.equal(blocked.value.payment.state,'UNKNOWN');assert.equal(blocked.value.receipt,null);
  assert.equal((await begun.act('reconcile',{id:begun.approval.id})).status,400);assert.equal(refundPosts,1);

  const lost=await anotherReady((await call('/api/merchant/state')).cookie);
  loseRefundResponse=true;assert.equal((await lost.act('approve',lost.approval)).status,400);loseRefundResponse=false;
  await mf.dispose();mf=new Miniflare(options());
  assert.equal((await lost.act('approve',lost.approval)).value.payment.state,'UNKNOWN');
  assert.equal((await lost.act('reconcile',{id:lost.approval.id})).status,400);assert.equal(refundPosts,2);

  const hinted=await anotherReady((await call('/api/merchant/state')).cookie);
  failReadback=true;assert.equal((await hinted.act('approve',hinted.approval)).status,400);failReadback=false;
  await mf.dispose();mf=new Miniflare(options());
  assert.equal((await hinted.act('approve',hinted.approval)).value.receipt,null);
  assert.equal((await hinted.act('reconcile',{id:hinted.approval.id})).value.receipt.amountCents,2599);
  assert.equal(refundPosts,3);
  assert.equal(unexpected,0);
  console.log(JSON.stringify({runtime:'Actual workerd + SQLite Durable Objects',provider:'Injected fake transport; no external requests',crossWorkspaceDenied:true,customerAuthorizationChecked:true,correctionSurvivesReopen:true,correctionRequiresFreshReview:true,resumedReservationPosts:1,beginWithoutDispatchBlocksResend:true,lostResponseBlocksResend:true,persistedHintReconcilesWithoutResend:true,totalFakeRefundPosts:refundPosts,reopenedReceiptVerified:true}));
}finally{await mf.dispose();await rm(state,{recursive:true,force:true});}
