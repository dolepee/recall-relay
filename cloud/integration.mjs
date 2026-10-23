// Actual workerd + SQLite storage; every external provider call is intercepted.
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

const origin='https://recall-relay.test',state=await mkdtemp(join(tmpdir(),'recall-cloud-test-'));
const recallFixture=JSON.parse(await readFile(new URL('../test/fixtures/cpsc-20261021.json',import.meta.url),'utf8'));
let reference,captured=false,refundPosts=0,unexpected=0;
const amount={value:'59.99',currency_code:'USD'};
const capture={id:'FAKE-CAPTURE',status:'COMPLETED',amount,create_time:new Date().toISOString()};
const json=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
async function fakeNetwork(request){
  const u=new URL(request.url),path=u.pathname;
  if(u.origin==='https://www.saferproducts.gov'&&path==='/RestWebServices/Recall'&&u.searchParams.get('RecallNumber')==='27026')return json([recallFixture.records.find(record=>record.RecallNumber==='27026')]);
  if(u.origin!=='https://api-m.sandbox.paypal.com'){unexpected++;throw new Error('Unexpected external request in isolated test');}
  if(path==='/v1/oauth2/token')return json({token_type:'Bearer',access_token:'test-token',expires_in:300});
  if(path==='/v2/checkout/orders'&&request.method==='POST'){const input=await request.json();reference=input.purchase_units[0].reference_id;return json({id:'FAKE-ORDER',links:[{rel:'approve',href:'https://www.sandbox.paypal.com/checkoutnow?token=FAKE-ORDER'}]});}
  if(path==='/v2/checkout/orders/FAKE-ORDER/capture'){captured=true;return json({id:'FAKE-ORDER',status:'COMPLETED'});}
  if(path==='/v2/checkout/orders/FAKE-ORDER')return json({id:'FAKE-ORDER',status:captured?'COMPLETED':'APPROVED',purchase_units:[{reference_id:reference,amount,payee:{merchant_id:'TEST-MERCHANT'},...(captured?{payments:{captures:[capture]}}:{})}]});
  if(path==='/v2/payments/captures/FAKE-CAPTURE')return json(capture);
  if(path==='/v2/payments/captures/FAKE-CAPTURE/refund'){refundPosts++;return json({id:'FAKE-REFUND'});}
  if(path==='/v2/payments/refunds/FAKE-REFUND')return json({id:'FAKE-REFUND',status:'COMPLETED',amount:{value:'25.99',currency_code:'USD'},links:[{rel:'up',href:'https://api-m.sandbox.paypal.com/v2/payments/captures/FAKE-CAPTURE'}]});
  unexpected++;throw new Error('Unexpected sandbox route in isolated test');
}
const options=()=>convertV4MiniflareOptions({
  name:'recall-relay-test',scriptPath:resolve('cloud-dist/worker.js'),modules:true,
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
  const cross=await call('/api/merchant/review',{cookie:bob,body:{id:checkout.value.id,revision:1,confirmed:true}});assert.equal(cross.status,400);
  const reviewed=await action('review',{id:checkout.value.id,revision:1,confirmed:true});assert.equal(reviewed.status,200);
  const approval={id:checkout.value.id,digest:reviewed.value.plan.digest};
  const concurrent=await Promise.all([action('approve',approval),action('approve',approval)]);assert(concurrent.every(r=>r.status===200));assert.equal(refundPosts,1);
  let customer=await call('/api/claim/state'+query,{authorization:'Bearer '+token});assert.equal(customer.value.receipt.refundId,'FAKE-REFUND');assert.equal(customer.value.receipt.amountCents,2599);
  await mf.dispose();mf=new Miniflare(options());
  const replay=await action('approve',approval);assert.equal(replay.status,200,JSON.stringify(replay));assert.equal(replay.value.receipt.refundId,'FAKE-REFUND');assert.equal(refundPosts,1);
  customer=await call('/api/claim/state'+query,{authorization:'Bearer '+token});assert.equal(customer.value.receipt.status,'COMPLETED');
  assert.equal(unexpected,0);
  console.log(JSON.stringify({runtime:'Actual workerd + SQLite Durable Objects',provider:'Injected fake transport; no external requests',crossWorkspaceDenied:true,customerAuthorizationChecked:true,concurrentRefundPosts:refundPosts,reopenedReceiptVerified:true}));
}finally{await mf.dispose();await rm(state,{recursive:true,force:true});}
