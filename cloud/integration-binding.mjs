// Real workerd/storage; every provider request is intercepted. No external funds.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const root=await mkdtemp(join(tmpdir(),'recall-binding-')),origin='https://recall-relay.test';
const token='a'.repeat(43),otherToken='b'.repeat(43),hash=x=>createHash('sha256').update(x).digest('hex'),workspace=hash(token),otherWorkspace=hash(otherToken);
const amount={currency_code:'USD',value:'72.75'},itemAmount={currency_code:'USD',value:'38.75'};
const grant={version:1,id:'provided-order',workspace,operator:'test-operator',provisionedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),salesRecordReference:'test-sales-record',orderId:'EXISTING-ORDER',captureId:'EXISTING-CAPTURE',merchantId:'MERCHANT',referenceId:'REVIEWED-REFERENCE',sku:'CUP-01',lot:'LOT-A',itemOrdinal:0,itemPaidCents:3875,captureCents:7275};
const capture={id:grant.captureId,status:'COMPLETED',amount,create_time:new Date(Date.now()-86400000).toISOString(),payee:{merchant_id:grant.merchantId},supplementary_data:{related_ids:{order_id:grant.orderId}}};
const order={id:grant.orderId,status:'COMPLETED',purchase_units:[{reference_id:grant.referenceId,payee:capture.payee,amount:{...amount,breakdown:{item_total:amount}},items:[{sku:'CUP-01',quantity:'1',unit_amount:itemAmount},{sku:'TRAY-01',quantity:'1',unit_amount:{currency_code:'USD',value:'34.00'}}],payments:{captures:[capture]}}]};
let reads=0,refunds=0,unexpected=0;
const json=value=>new Response(JSON.stringify(value));
async function network(request){
  const url=new URL(request.url);if(url.origin!=='https://api-m.sandbox.paypal.com'){unexpected++;throw new Error('Unexpected origin');}
  if(url.pathname==='/v1/oauth2/token')return json({token_type:'Bearer',access_token:'fake-token',expires_in:300});
  reads++;
  if(url.pathname==='/v2/checkout/orders/'+grant.orderId)return json(order);
  if(url.pathname==='/v2/payments/captures/'+grant.captureId&&request.method==='GET')return json(capture);
  if(url.pathname==='/v2/payments/captures/'+grant.captureId+'/refund'){refunds++;assert.equal((await request.json()).amount.value,'38.75');return json({id:'BOUND-REFUND'});}
  if(url.pathname==='/v2/payments/refunds/BOUND-REFUND')return json({id:'BOUND-REFUND',status:'COMPLETED',amount:itemAmount,links:[{rel:'up',href:'https://api-m.sandbox.paypal.com/v2/payments/captures/'+grant.captureId}]});
  unexpected++;throw new Error('Unexpected provider request');
}
const code=await readFile(resolve('cloud-dist/worker.js'),'utf8');
const options=()=>convertV4MiniflareOptions({name:'binding-integration',modules:[{type:'ESModule',path:resolve('cloud-dist/binding-worker.mjs'),contents:code}],compatibilityDate:'2026-10-23',compatibilityFlags:['nodejs_compat'],bindings:{PUBLIC_ORIGINS:[origin],AI_ENABLED:false,PAYPAL_SANDBOX_CLIENT_ID:'fake',PAYPAL_SANDBOX_CLIENT_SECRET:'fake',PROVISIONED_PURCHASES:JSON.stringify([grant])},durableObjects:{WORKSPACES:{className:'RecallWorkspace',useSQLite:true},BUDGET:{className:'UsageBudget',useSQLite:true},CAPTURE_OWNERS:{className:'CaptureOwnership',useSQLite:true}},resourcePersistencePath:root,outboundService:network});
let mf=new Miniflare(options());
async function call(path,body,ownerToken=token){const response=await mf.dispatchFetch(origin+'/api/merchant/'+path,{method:body?'POST':'GET',headers:{Cookie:'rr_workspace='+ownerToken,Origin:origin,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,value:await response.json()};}
try{
  const budget=(await mf.getDurableObjectNamespace('BUDGET')).getByName('daily');await budget.openWorkspace(workspace);await budget.openWorkspace(otherWorkspace);
  assert.equal((await call('state')).value.provisionedPurchases.length,1);
  assert.equal((await call('state',undefined,otherToken)).value.provisionedPurchases.length,0);
  await call('publish',{confirmed:true});await call('publish',{confirmed:true},otherToken);
  assert.equal((await call('bind-purchase',{grantId:grant.id},otherToken)).status,400);assert.equal(reads,0);
  const [a,b]=await Promise.all([call('bind-purchase',{grantId:grant.id}),call('bind-purchase',{grantId:grant.id})]);
  assert.equal(a.status,200,JSON.stringify(a));assert.equal(b.status,200);assert.equal(a.value.id,b.value.id);assert.equal(a.value.claimUrl,b.value.claimUrl);assert.equal(a.value.amountCents,3875);
  await mf.dispose();mf=new Miniflare(options());
  const again=await call('bind-purchase',{grantId:grant.id});assert.equal(again.value.claimUrl,a.value.claimUrl);
  const claimUrl=new URL(a.value.claimUrl,origin),access=claimUrl.hash.slice(1);
  const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=';
  const submitted=await mf.dispatchFetch(origin+'/api/claim/submit'+claimUrl.search,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+access},body:JSON.stringify({revision:0,lot:'LOT-A',acknowledged:true,photo})});assert.equal(submitted.status,200);
  const reviewed=await call('review',{id:a.value.id,revision:1,confirmed:true});assert.equal(reviewed.status,200);
  const approval={id:a.value.id,digest:reviewed.value.plan.digest};
  const approved=await Promise.all([call('approve',approval),call('approve',approval)]);assert(approved.every(x=>x.status===200));assert.equal(refunds,1);assert.equal(approved[0].value.receipt.amountCents,3875);
  // A later operator misconfiguration cannot move the already-owned capture.
  await mf.dispose();grant.workspace=otherWorkspace;mf=new Miniflare(options());
  const conflict=await call('bind-purchase',{grantId:grant.id},otherToken);assert.equal(conflict.status,400);assert.match(conflict.value.error,/already assigned/);assert.equal(refunds,1);
  assert.equal(unexpected,0);
  console.log(JSON.stringify({runtime:'real workerd + SQLite',provider:'fake transport',crossWorkspaceDeniedBeforeLookup:true,idempotentBindingSurvivesReopen:true,variableRefundCents:3875,refundDispatches:refunds,reprovisionConflictRejected:true}));
}finally{await mf.dispose();await rm(root,{recursive:true,force:true});}
