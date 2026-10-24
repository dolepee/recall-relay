// Assistant-enabled integration harness.
//
// Runs the shipped worker with the assistant switched on, against actual workerd with SQLite Durable
// Objects. Inference is injected: every assistant call is answered by this harness from a scripted test
// double, so no model is contacted. The admission transaction, the counters and the refusals are the
// shipped code paths, exercised across the real async and Durable Object boundaries.
//
// cloud/integration.mjs (assistant disabled) is untouched and remains the default `npm run test:cloud`;
// this file is a separate entry (`npm run test:cloud:ai`) with its own built entry point.
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {workspaceHash} from '../src/cloud-routing.mjs';
import {dayResetInstant,burstBucket} from '../src/cloud-budget.mjs';

// Counts every assertion so the run reports exact numbers.
let assertions=0;
const A=new Proxy(assert,{get(target,key){
  const value=target[key];
  if(typeof value!=='function')return value;
  return (...args)=>{assertions++;return value.apply(target,args);};
}});

const origin='https://recall-relay.test',state=await mkdtemp(join(tmpdir(),'recall-ai-test-'));
const DAY1=Date.UTC(2026,9,24,12,0,0),DAY1_KEY='2026-10-24',DAY2_KEY='2026-10-25',DAY2=Date.UTC(2026,9,25,0,0,30);
const recallFixture=JSON.parse(await readFile(new URL('../test/fixtures/cpsc-20261021.json',import.meta.url),'utf8'));
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp0kAAAAASUVORK5CYII=';
const photoQuote='submit a photograph with the word "RECALL" written on the front of the crystal cup in permanent black marker';
const amount={value:'59.99',currency_code:'USD'};
const capture={id:'FAKE-CAPTURE',status:'COMPLETED',amount,create_time:new Date().toISOString()};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});

// ---- injected inference --------------------------------------------------------------------------
// The harness scripts one step per assistant call: controlled text, a result with no usable text, or a
// thrown failure. Nothing here decides an admission.
let script=[],inferenceCalls=0,unexpected=0,reference=null,captured=false,inFlight=0,peakInFlight=0;
const usableView={mode:'text',result:{response:'{"view":"WAITING"}'}};
const noUsableText={mode:'text',result:{choices:[{finish_reason:'length',message:{}}]}};
const thrownInference={mode:'throw',message:'Injected inference failure.'};
const scripted=(...steps)=>script.push(...steps);
const nextStep=()=>script.length?script.shift():usableView;

async function fakeNetwork(request){
  const url=new URL(request.url),path=url.pathname;
  if(url.origin==='https://ai.integration.test'){
    inferenceCalls++;
    const step=nextStep();
    inFlight++;peakInFlight=Math.max(peakInFlight,inFlight);
    try{
      // A scripted delay lets the harness measure how many generations really overlap.
      if(step.delayMs)await new Promise(resolve=>setTimeout(resolve,step.delayMs));
      return json(step);
    }finally{inFlight--;}
  }
  if(url.origin==='https://www.saferproducts.gov'&&path==='/RestWebServices/Recall'&&url.searchParams.get('RecallNumber')==='27026')
    return json([recallFixture.records.find(record=>record.RecallNumber==='27026')]);
  if(url.origin!=='https://api-m.sandbox.paypal.com'){unexpected++;throw new Error('Unexpected external request in isolated test');}
  if(path==='/v1/oauth2/token')return json({token_type:'Bearer',access_token:'test-token',expires_in:300});
  if(path==='/v2/checkout/orders'&&request.method==='POST'){const input=await request.json();reference=input.purchase_units[0].reference_id;return json({id:'FAKE-ORDER',links:[{rel:'approve',href:'https://www.sandbox.paypal.com/checkoutnow?token=FAKE-ORDER'}]});}
  if(path==='/v2/checkout/orders/FAKE-ORDER/capture'){captured=true;return json({id:'FAKE-ORDER',status:'COMPLETED'});}
  if(path==='/v2/checkout/orders/FAKE-ORDER')return json({id:'FAKE-ORDER',status:captured?'COMPLETED':'APPROVED',purchase_units:[{reference_id:reference,amount,payee:{merchant_id:'TEST-MERCHANT'},...(captured?{payments:{captures:[capture]}}:{})}]});
  if(path==='/v2/payments/captures/FAKE-CAPTURE')return json(capture);
  if(path==='/v2/payments/captures/FAKE-CAPTURE/refund')return json({id:'FAKE-REFUND'});
  if(path==='/v2/payments/refunds/FAKE-REFUND')return json({id:'FAKE-REFUND',status:'COMPLETED',amount:{value:'25.99',currency_code:'USD'},links:[{rel:'up',href:'https://api-m.sandbox.paypal.com/v2/payments/captures/FAKE-CAPTURE'}]});
  unexpected++;throw new Error('Unexpected sandbox route in isolated test');
}

const options=()=>convertV4MiniflareOptions({
  name:'recall-relay-ai-test',scriptPath:resolve('cloud-dist/ai/integration-ai-worker.js'),modules:true,
  compatibilityDate:'2026-10-23',compatibilityFlags:['nodejs_compat'],
  bindings:{PUBLIC_ORIGINS:[origin],AI_ENABLED:true,PAYPAL_SANDBOX_CLIENT_ID:'test-application',PAYPAL_SANDBOX_CLIENT_SECRET:'disposable-test-secret'},
  durableObjects:{WORKSPACES:{className:'RecallWorkspace',useSQLite:true},BUDGET:{className:'UsageBudget',useSQLite:true}},
  resourcePersistencePath:state,outboundService:fakeNetwork,
});

let mf=new Miniflare(options());
try{
  async function call(path,{cookie='',body,authorization,method}={}){
    const response=await mf.dispatchFetch(origin+path,{method:method||(body?'POST':'GET'),headers:{Cookie:cookie,Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(authorization?{Authorization:authorization}:{})},body:body?JSON.stringify(body):undefined});
    return {status:response.status,value:await response.json().catch(()=>null),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  async function control(op,payload={}){
    const response=await mf.dispatchFetch(origin+'/__test/budget',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,...payload})});
    return {status:response.status,value:await response.json()};
  }
  const counters=async()=>{
    const rows=(await control('counters')).value.rows,map={};
    for(const row of rows)map[`${row.day}|${row.scope}`]=row.count;
    return map;
  };
  // A refunded admission leaves its counter rows at zero, so "nothing was consumed" is compared on the
  // effective counts: a row at zero has consumed nothing, every other value must be identical.
  const live=async()=>Object.fromEntries(Object.entries(await counters()).filter(([,count])=>count>0));
  // Deterministic clock, adjustable limits and a clean counter table. Only the clock, the limits and
  // the seed rows are set here; every admission in the tests below is a real request.
  async function configure({clock=DAY1,limits}={}){
    script.length=0;
    A.equal((await control('clock',{value:clock})).status,200);
    A.equal((await control('limits',{value:limits})).status,200);
    A.equal((await control('clear')).status,200);
  }
  async function desk(){
    const created=await call('/api/merchant/state');
    A.equal(created.status,200,JSON.stringify(created));
    return {cookie:created.cookie,id:workspaceHash(created.cookie.slice('rr_workspace='.length))};
  }
  const action=(d,path,body)=>call('/api/merchant/'+path,{cookie:d.cookie,body});
  const assist=(d,question='Show the claims waiting on customers')=>action(d,'assist',{question});
  const sources=d=>call('/api/merchant/sources',{cookie:d.cookie});

  const areas=[];
  const area=async(name,run)=>{await run();areas.push(name);console.log('  ok - '+name);};

  // 1. Cross-workspace isolation.
  await area('cross-workspace isolation: one workspace cannot consume another workspace allowance',async()=>{
    await configure({limits:{aiPerWorkspacePerDay:2,aiGlobalPerDay:8,aiPerWorkspacePerBurst:10,aiGlobalPerBurst:20}});
    const a=await desk(),b=await desk();
    A.equal((await sources(a)).value.ai.available,true);
    A.equal((await assist(a)).status,200);
    A.equal((await assist(a)).status,200);
    const refused=await assist(a);
    A.equal(refused.status,400,JSON.stringify(refused));
    A.equal(refused.value.reason,'daily');
    A.equal(refused.value.resetAt,dayResetInstant(DAY1_KEY));
    A.match(refused.value.error,/used for today/);
    A.match(refused.value.error,/2026-10-25 00:00 UTC/);
    // The other workspace is unaffected by its neighbour's exhaustion.
    A.equal((await assist(b)).status,200);
    const rows=await counters();
    A.equal(rows[`${DAY1_KEY}|ai-workspace-${a.id}`],2);
    A.equal(rows[`${DAY1_KEY}|ai-workspace-${b.id}`],1);
    A.equal(rows[`${DAY1_KEY}|ai-total`],3);
  });

  // 2. Global exhaustion is refused truthfully, never silently and never as a success.
  await area('global exhaustion: the shared ceiling refuses later requests with the server reset instant',async()=>{
    await configure({limits:{aiPerWorkspacePerDay:20,aiGlobalPerDay:3,aiPerWorkspacePerBurst:10,aiGlobalPerBurst:20}});
    A.equal((await control('seed',{day:DAY1_KEY,scope:'ai-total',count:3})).status,200);
    const d=await desk();
    const before=inferenceCalls;
    const refused=await assist(d);
    A.equal(refused.status,400,JSON.stringify(refused));
    A.equal(refused.value.reason,'daily');
    A.equal(refused.value.resetAt,dayResetInstant(DAY1_KEY));
    A.match(refused.value.error,/used for today/);
    A.match(refused.value.error,/2026-10-25 00:00 UTC/);
    A.match(refused.value.error,/Manual review and existing claims remain available/);
    A.equal(inferenceCalls,before); // refused before any inference ran
    const rows=await counters();
    A.equal(rows[`${DAY1_KEY}|ai-workspace-${d.id}`]??0,0);
    A.equal(rows[`${DAY1_KEY}|ai-total`],3);
    // The sources view reports the same truth, with the same server instant.
    const view=await sources(d);
    A.equal(view.status,200);
    A.equal(view.value.ai.available,false);
    A.equal(view.value.ai.reason,'daily');
    A.equal(view.value.ai.resetAt,dayResetInstant(DAY1_KEY));
  });

  // 3. The direct regression: a refused admission consumes nothing on either scope.
  await area('no partial consumption on refused admission: both counters are unchanged after a refusal',async()=>{
    await configure({limits:{aiPerWorkspacePerDay:20,aiGlobalPerDay:2,aiPerWorkspacePerBurst:10,aiGlobalPerBurst:20}});
    A.equal((await control('seed',{day:DAY1_KEY,scope:'ai-total',count:2})).status,200);
    const d=await desk();
    const before=await counters();
    const refused=await assist(d);
    A.equal(refused.status,400,JSON.stringify(refused));
    A.equal(refused.value.reason,'daily');
    A.deepEqual(await counters(),before); // the workspace unit is not spent before the global check
    A.equal(before[`${DAY1_KEY}|ai-workspace-${d.id}`]??0,0);
    A.equal(before[`${DAY1_KEY}|ai-total`],2);
    // The mirror case: a workspace at its own ceiling refuses without spending the shared counter.
    await configure({limits:{aiPerWorkspacePerDay:2,aiGlobalPerDay:20,aiPerWorkspacePerBurst:10,aiGlobalPerBurst:20}});
    const other=await desk();
    A.equal((await control('seed',{day:DAY1_KEY,scope:`ai-workspace-${other.id}`,count:2})).status,200);
    const seeded=await counters();
    const perWorkspace=await assist(other);
    A.equal(perWorkspace.status,400,JSON.stringify(perWorkspace));
    A.equal(perWorkspace.value.reason,'daily');
    A.deepEqual(await counters(),seeded);
    A.equal(seeded[`${DAY1_KEY}|ai-total`]??0,0);
  });

  // 4. Simultaneous racing requests: the invariant holds under real concurrency.
  await area('simultaneous racing requests: no ceiling is exceeded and the invariant holds',async()=>{
    await configure({limits:{aiPerWorkspacePerDay:50,aiGlobalPerDay:4,aiPerWorkspacePerBurst:50,aiGlobalPerBurst:50}});
    const desks=await Promise.all([desk(),desk(),desk()]);
    scripted(...Array.from({length:12},()=>({...usableView,delayMs:60})));
    const racing=await Promise.all(desks.flatMap(d=>[assist(d),assist(d),assist(d),assist(d)]));
    const admitted=racing.filter(r=>r.status===200).length,refused=racing.filter(r=>r.status===400);
    A.equal(admitted,4,JSON.stringify(racing.map(r=>r.status)));
    A.equal(refused.length,8);
    A.ok(refused.every(r=>r.value.reason==='daily'&&r.value.resetAt===dayResetInstant(DAY1_KEY)));
    // The generations really did overlap: the ceiling was enforced while several were in flight.
    A.ok(peakInFlight>1,`peak concurrent generations was ${peakInFlight}`);
    A.ok(peakInFlight<=4);
    const rows=await counters();
    A.equal(rows[`${DAY1_KEY}|ai-total`],4); // exactly the ceiling, never more
    const workspaceSpend=desks.reduce((sum,d)=>sum+(rows[`${DAY1_KEY}|ai-workspace-${d.id}`]??0),0);
    A.equal(workspaceSpend,4);
    // The same race inside one workspace: its own ceiling binds just as tightly.
    await configure({limits:{aiPerWorkspacePerDay:3,aiGlobalPerDay:50,aiPerWorkspacePerBurst:50,aiGlobalPerBurst:50}});
    const single=await desk();
    scripted(...Array.from({length:8},()=>({...usableView,delayMs:60})));
    const raced=await Promise.all(Array.from({length:8},()=>assist(single)));
    A.equal(raced.filter(r=>r.status===200).length,3,JSON.stringify(raced.map(r=>r.status)));
    const after=await counters();
    A.equal(after[`${DAY1_KEY}|ai-workspace-${single.id}`],3);
    A.equal(after[`${DAY1_KEY}|ai-total`],3);
  });

  // 5. UTC day boundary: both scopes move together and the reported instant is the server's own.
  await area('UTC day boundary: both scopes move together, the allowance recovers, the instant is correct',async()=>{
    await configure({clock:Date.UTC(2026,9,24,23,59,30),limits:{aiPerWorkspacePerDay:1,aiGlobalPerDay:1,aiPerWorkspacePerBurst:10,aiGlobalPerBurst:10}});
    const d=await desk();
    A.equal((await assist(d)).status,200);
    const refused=await assist(d);
    A.equal(refused.status,400,JSON.stringify(refused));
    A.equal(refused.value.resetAt,'2026-10-25T00:00:00.000Z');
    A.match(refused.value.error,/2026-10-25 00:00 UTC/);
    A.equal((await sources(d)).value.ai.available,false);
    // Restart the runtime: the counters and the clock override are durable object storage, not memory.
    await mf.dispose();mf=new Miniflare(options());
    A.equal((await control('clock',{value:DAY2})).status,200);
    const view=await sources(d);
    A.equal(view.value.ai.available,true);
    A.equal(view.value.ai.resetAt,dayResetInstant(DAY2_KEY));
    A.equal((await assist(d)).status,200);
    const rows=await counters();
    A.equal(rows[`${DAY2_KEY}|ai-total`],1);
    A.equal(rows[`${DAY2_KEY}|ai-workspace-${d.id}`],1);
    A.equal(Object.keys(rows).filter(key=>key.startsWith(DAY1_KEY+'|')).length,0); // both scopes pruned together
  });

  // 6. Refund behaviour: refund on no usable text, keep on usable text, fail closed otherwise.
  await area('refund behaviour: no usable text refunds idempotently, usable text stays consumed, retries fail closed',async()=>{
    await configure({limits:{aiPerWorkspacePerDay:20,aiGlobalPerDay:20,aiPerWorkspacePerBurst:20,aiGlobalPerBurst:20}});
    const d=await desk();
    const before=await live();
    scripted(noUsableText);
    const empty=await assist(d);
    A.equal(empty.status,400,JSON.stringify(empty));
    A.match(empty.value.error,/no usable text/);
    A.deepEqual(await live(),before); // the consumed unit is refunded
    // The refund itself is idempotent: a repeated refund of the same admission is a no-op.
    const admission=(await control('admit',{workspace:d.id})).value.receipt;
    A.equal(admission.admitted,true);
    A.equal((await counters())[`${DAY1_KEY}|ai-workspace-${d.id}`],1);
    A.equal((await control('refund',{receipt:admission})).value.refunded,true);
    const refunded=await counters();
    A.equal(refunded[`${DAY1_KEY}|ai-workspace-${d.id}`]??0,0);
    A.equal(refunded[`${DAY1_KEY}|ai-total`]??0,0);
    A.equal((await control('refund',{receipt:admission})).value.refunded,false);
    A.deepEqual(await counters(),refunded);
    // A generation that yields usable text leaves its unit consumed.
    scripted(usableView);
    A.equal((await assist(d)).status,200);
    const consumed=await counters();
    A.equal(consumed[`${DAY1_KEY}|ai-workspace-${d.id}`],1);
    A.equal(consumed[`${DAY1_KEY}|ai-total`],1);
    // A plain retry of a committed request is admitted again: it never becomes free.
    scripted(usableView);
    A.equal((await assist(d)).status,200);
    A.equal((await counters())[`${DAY1_KEY}|ai-total`],2);
    // An inference that throws also refunds, so a failed provider call costs nothing.
    const beforeThrow=await live();
    scripted(thrownInference);
    const failed=await assist(d);
    A.equal(failed.status,400,JSON.stringify(failed));
    A.match(failed.value.error,/could not complete this request/);
    A.deepEqual(await live(),beforeThrow);
    // A refund presented after the UTC day moved fails closed instead of guessing.
    const carried=(await control('admit',{workspace:d.id})).value.receipt;
    A.equal(carried.admitted,true);
    A.equal((await control('clock',{value:DAY2})).status,200);
    A.equal((await control('refund',{receipt:carried})).value.refunded,false);
    A.equal((await counters())[`${DAY2_KEY}|ai-total`]??0,0);
    A.equal((await control('clock',{value:DAY1})).status,200);
  });

  // 7. Burst behaviour at both scopes, including cookie churn.
  await area('burst behaviour: the per workspace bucket is defeated by cookie churn, the shared bucket is not',async()=>{
    await configure({limits:{aiPerWorkspacePerDay:50,aiGlobalPerDay:50,aiPerWorkspacePerBurst:2,aiGlobalPerBurst:5}});
    const bucket=burstBucket(DAY1,60);
    const d=await desk();
    A.equal((await assist(d)).status,200);
    A.equal((await assist(d)).status,200);
    const paced=await assist(d);
    A.equal(paced.status,400,JSON.stringify(paced));
    A.equal(paced.value.reason,'burst');
    A.equal(paced.value.resetAt,new Date((bucket+1)*60000).toISOString());
    A.match(paced.value.error,/pacing new drafts right now/);
    A.match(paced.value.error,new RegExp(new Date((bucket+1)*60000).toISOString().slice(0,10)));
    A.equal((await counters())[`${DAY1_KEY}|ai-workspace-${d.id}`],2); // the daily counter is untouched
    // Fresh cookies mean fresh per workspace buckets, but the shared bucket still binds: two units are
    // already spent, so three new workspaces fit inside the shared window of five and the fourth is refused.
    const churn=[await desk(),await desk(),await desk(),await desk()];
    const outcomes=[];
    for(const other of churn)outcomes.push((await assist(other)).status);
    A.deepEqual(outcomes,[200,200,200,400]);
    const rows=await counters();
    A.equal(rows[`${DAY1_KEY}|ai-burst-total#${bucket}`],5);
    A.ok(churn.slice(0,3).every(other=>(rows[`${DAY1_KEY}|ai-burst-workspace-${other.id}#${bucket}`]??0)<=2)); // each stayed inside its own bucket
    A.equal(rows[`${DAY1_KEY}|ai-burst-workspace-${churn[3].id}#${bucket}`]??0,0);
    A.equal(rows[`${DAY1_KEY}|ai-workspace-${churn[3].id}`]??0,0); // the refused workspace spent nothing
    A.equal((await control('clock',{value:DAY1+61000})).status,200);
    const nextWindow=await assist(churn[3]);
    A.equal(nextWindow.status,200,JSON.stringify(nextWindow)); // the next window admits again
    A.equal((await counters())[`${DAY1_KEY}|ai-burst-total#${bucket+1}`],1);
  });

  // 8. Assistant unavailability never blocks a non-AI action.
  await area('assistant unavailability never blocks a non-AI merchant action',async()=>{
    await configure({limits:{aiPerWorkspacePerDay:1,aiGlobalPerDay:1,aiPerWorkspacePerBurst:10,aiGlobalPerBurst:10}});
    const d=await desk();
    A.equal((await assist(d)).status,200); // consumes the only unit
    const before=inferenceCalls;
    const refused=await assist(d);
    A.equal(refused.status,400,JSON.stringify(refused));
    A.equal(refused.value.reason,'daily');
    A.equal(inferenceCalls,before);
    const view=await sources(d);
    A.equal(view.value.ai.available,false);
    A.equal(view.value.ai.reason,'daily');
    A.equal(view.value.ai.resetAt,dayResetInstant(DAY1_KEY));
    // Every merchant action below is non-AI and must still work.
    const imported=await action(d,'source-import',{recallNumber:'27026'});
    A.equal(imported.status,200,JSON.stringify(imported));
    const added=await action(d,'source-add',{id:imported.value.id,revision:1,kind:'PHOTO',quote:photoQuote});
    A.equal(added.status,200,JSON.stringify(added));
    const reviewed=await action(d,'source-review',{id:imported.value.id,revision:2,fieldIds:added.value.suggestion.requirements.map(field=>field.id),confirmed:true});
    A.equal(reviewed.status,200,JSON.stringify(reviewed));
    A.equal((await action(d,'publish',{confirmed:true})).status,200);
    const checkout=await action(d,'checkout',{});
    A.equal(checkout.status,200,JSON.stringify(checkout));
    const bound=await action(d,'capture',{id:checkout.value.id});
    A.equal(bound.status,200,JSON.stringify(bound));
    const url=new URL(bound.value.claimUrl,origin),token=url.hash.slice(1),query=url.search;
    A.equal((await call('/api/claim/state'+query,{authorization:'Bearer '+token})).status,200);
    const submission=await call('/api/claim/submit'+query,{authorization:'Bearer '+token,body:{revision:0,lot:'LOT-A',photo:image,acknowledged:true}});
    A.equal(submission.status,200,JSON.stringify(submission));
    A.equal((await action(d,'photograph',{id:checkout.value.id,revision:1})).status,200);
    const claimReview=await action(d,'review',{id:checkout.value.id,revision:1,confirmed:true});
    A.equal(claimReview.status,200,JSON.stringify(claimReview));
    const approved=await action(d,'approve',{id:checkout.value.id,digest:claimReview.value.plan.digest});
    A.equal(approved.status,200,JSON.stringify(approved));
    const reconciled=await action(d,'reconcile',{id:checkout.value.id});
    A.equal(reconciled.status,200,JSON.stringify(reconciled));
    A.equal(reconciled.value.payment.state,'COMPLETED');
    A.equal(inferenceCalls,before); // not one of the actions above reached the assistant
  });

  A.equal(unexpected,0);
  console.log(JSON.stringify({
    runtime:'Actual workerd + SQLite Durable Objects',
    assistant:'Injected test double; no model call',
    areas:areas.length,assertions,inferenceCalls,peakConcurrentGenerations:peakInFlight,
    crossWorkspaceIsolation:true,globalExhaustion:true,noPartialConsumption:true,racingRequests:true,
    utcDayBoundary:true,refundBehaviour:true,burstBothScopes:true,nonAIActionsUnaffected:true,
  }));
}finally{await mf.dispose();await rm(state,{recursive:true,force:true});}
