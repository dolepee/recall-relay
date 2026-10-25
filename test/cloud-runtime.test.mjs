import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {routeWorkspace,workspaceHash,boundedJSON} from '../src/cloud-routing.mjs';
import {cloudSql} from '../src/cloud-sql.mjs';
import {syncTransaction} from '../src/transaction.mjs';
import {RefundJournalCore} from '../src/journal-core.mjs';
import {ClaimDeskCore} from '../src/claims-core.mjs';
import {HostedAI,hostedModel} from '../src/cloud-ai.mjs';
import {UsageBudgetCore,DEFAULT_BUDGET_LIMITS,aiRefusal,utcDay,dayResetInstant,burstBucket,resetLabel} from '../src/cloud-budget.mjs';

// The same real-SQLite rollback harness the runtime test above uses, exposed for the budget tests.
function sqliteStorage(){
  const sqlite=new DatabaseSync(':memory:');let transactions=0;
  const storage={sql:{
    exec(query,...args){
      if(query.trim().startsWith('CREATE')){sqlite.exec(query);return {toArray:()=>[],rowsWritten:0};}
      const stmt=sqlite.prepare(query);
      if(query.trim().startsWith('SELECT'))return {toArray:()=>stmt.all(...args),rowsWritten:0};
      const result=stmt.run(...args);return {toArray:()=>[],rowsWritten:result.changes};
    }},
    transactionSync(fn){transactions++;sqlite.exec('BEGIN');try{const value=fn();sqlite.exec('COMMIT');return value;}catch(error){sqlite.exec('ROLLBACK');throw error;}},
  };
  return {storage,sqlite,transactions:()=>transactions};
}
const DAY1=Date.UTC(2026,9,24,12,0,0),DAY1_KEY='2026-10-24';
function budgetFixture({now=DAY1,limits}={}){
  const {storage,sqlite,transactions}=sqliteStorage();
  const clock={value:now};
  const core=new UsageBudgetCore(storage,limits,{clock:()=>clock.value});
  return {core,sqlite,clock,transactions,day:key=>utcDay(clock.value)===key,count:(key,scope)=>core.count(key,scope),seed(key,scope,times){for(let i=0;i<times;i++)core.bump(key,scope);}};
}

test('hosted customer routing never grants merchant ownership or follows a foreign workspace query',()=>{
  const secret='a'.repeat(43),cookie='rr_workspace='+secret;
  const merchant=routeWorkspace(new URL('https://example.com/api/merchant/state?workspace='+'b'.repeat(64)),cookie);
  assert.equal(merchant.id,workspaceHash(secret));assert.equal(merchant.owner,true);
  const customer=routeWorkspace(new URL('https://example.com/api/claim/state?workspace='+'b'.repeat(64)),cookie);
  assert.equal(customer.id,'b'.repeat(64));assert.equal(customer.owner,false);
  assert.throws(()=>routeWorkspace(new URL('https://example.com/api/claim/state'),cookie));
  assert.throws(()=>routeWorkspace(new URL('https://example.com/api/merchant/approve'),''));
  const fresh=routeWorkspace(new URL('https://example.com/api/merchant/state'),'');
  assert.equal(fresh.newSecret.length,43);assert.equal(fresh.id,workspaceHash(fresh.newSecret));
});

test('hosted JSON reader enforces bytes before parsing even without Content-Length',async()=>{
  assert.deepEqual(await boundedJSON(new Request('https://example.com',{method:'POST',body:'{"ok":true}'}),20),{ok:true});
  await assert.rejects(()=>boundedJSON(new Request('https://example.com',{method:'POST',body:'x'.repeat(30)}),20),/too large/);
});

test('Cloudflare SQL adapter uses real rollback and persists the same core schema',()=>{
  const sqlite=new DatabaseSync(':memory:');let transactions=0;
  const storage={sql:{exec(query,...args){
    if(query.trim().startsWith('CREATE')){sqlite.exec(query);return {toArray:()=>[],rowsWritten:0};}
    const stmt=sqlite.prepare(query);
    if(query.trim().startsWith('SELECT'))return {toArray:()=>stmt.all(...args),rowsWritten:0};
    const result=stmt.run(...args);return {toArray:()=>[],rowsWritten:result.changes};
  }},transactionSync(fn){transactions++;sqlite.exec('BEGIN');try{const result=fn();sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  const db=cloudSql(storage),journal=new RefundJournalCore(db),desk=new ClaimDeskCore({journal,provider:()=>{throw new Error('No network');}});
  assert.equal(desk.merchantState().cases.length,0);
  assert.throws(()=>syncTransaction(db,()=>{desk.setSetting('temporary','yes');throw new Error('rollback');}),/rollback/);
  assert.equal(desk.setting('temporary'),undefined);assert.equal(transactions,1);
  desk.setSetting('retained','yes');assert.equal(desk.setting('retained'),'yes');sqlite.close();
});

test('hosted AI consumes its budget before inference and reports only actual provider text',async()=>{
  let reserved=false,called=0;
  const ai=new HostedAI({async run(model,input){assert(reserved);assert.equal(model,hostedModel);assert.equal(input.response_format.type,'json_object');called++;return {response:{},choices:[{message:{content:'{"view":"WAITING"}'}}]};}},async()=>{reserved=true;},true);
  assert.equal(await ai.generate('System',{question:'Show waiting claims'}),'{"view":"WAITING"}');assert.equal(called,1);
  const blocked=new HostedAI({run(){called++;}},async()=>{throw new Error('quota');},true);
  await assert.rejects(()=>blocked.generate('System',{}),/quota/);assert.equal(called,1);
  const disabled=new HostedAI({},async()=>{},false);await assert.rejects(()=>disabled.generate('System',{}),/unavailable/);
});

test('budget defaults keep every published ceiling and add only adjustable burst pacing',()=>{
  assert.deepEqual({...DEFAULT_BUDGET_LIMITS},{workspacesPerDay:200,aiPerWorkspacePerDay:20,aiGlobalPerDay:80,aiPerWorkspacePerBurst:2,aiGlobalPerBurst:5,burstWindowSeconds:60});
  assert.equal(utcDay(DAY1),DAY1_KEY);assert.equal(utcDay(NaN),null);
  assert.equal(dayResetInstant(DAY1_KEY),'2026-10-25T00:00:00.000Z');
  assert.equal(burstBucket(DAY1,60),Math.floor(DAY1/60000));
  const {core,sqlite}=budgetFixture();
  const spec=core.aiSpec('w1');
  assert.deepEqual(spec.daily,[{scope:'ai-workspace-w1',limit:20},{scope:'ai-total',limit:80}]);
  assert.deepEqual(spec.burst,[{scope:'ai-burst-workspace-w1',limit:2},{scope:'ai-burst-total',limit:5}]);
  sqlite.close();
});

test('a refused admission consumes nothing on either scope',()=>{
  const {core,sqlite,day,count,seed}=budgetFixture();
  seed(DAY1_KEY,'ai-total',80);
  const refusal=core.admitAI('w1');
  assert.equal(refusal.admitted,false);assert.equal(refusal.reason,'daily');
  assert.equal(count(DAY1_KEY,'ai-total'),80);assert.equal(count(DAY1_KEY,'ai-workspace-w1'),0);
  const error=aiRefusal(refusal);
  assert.match(error.message,/used for today/);assert.match(error.message,/2026-10-25 00:00 UTC/);assert.match(error.message,/Manual review and existing claims remain available/);
  assert.equal(error.resetAt,dayResetInstant(DAY1_KEY));assert.equal(error.reason,'daily');
  // The per workspace ceiling refuses without spending the shared global counter either.
  const other=budgetFixture();other.seed(DAY1_KEY,'ai-workspace-w2',20);
  const perWorkspace=other.core.admitAI('w2');
  assert.equal(perWorkspace.admitted,false);assert.equal(perWorkspace.reason,'daily');
  assert.equal(other.count(DAY1_KEY,'ai-total'),0);assert.equal(other.count(DAY1_KEY,'ai-workspace-w2'),20);
  // A workspace with room left is unaffected by another workspace's exhaustion.
  assert.equal(other.core.admitAI('w3').admitted,true);
  assert.equal(other.count(DAY1_KEY,'ai-total'),1);assert.equal(other.count(DAY1_KEY,'ai-workspace-w3'),1);
  assert.equal(day(DAY1_KEY),true);other.sqlite.close();sqlite.close();
});

test('burst pacing refuses the third request in a window without touching the daily counter',()=>{
  const {core,sqlite,clock,count}=budgetFixture();
  assert.equal(core.admitAI('w1').admitted,true);
  assert.equal(core.admitAI('w1').admitted,true);
  const burst=core.admitAI('w1');
  assert.equal(burst.admitted,false);assert.equal(burst.reason,'burst');
  assert.equal(burst.resetAt,new Date((burstBucket(DAY1,60)+1)*60000).toISOString());
  assert.equal(count(DAY1_KEY,'ai-workspace-w1'),2);assert.equal(count(DAY1_KEY,'ai-total'),2);
  assert.equal(count(DAY1_KEY,'ai-burst-workspace-w1#'+burstBucket(DAY1,60)),2);
  const refusal=aiRefusal(burst);
  assert.match(refusal.message,/pacing new drafts right now/);assert.match(refusal.message,/Drafts|drafts/);
  assert.equal(refusal.reason,'burst');
  // The burst refusal also carries the server's absolute instant for the window that reopens.
  assert.ok(refusal.message.includes(resetLabel(burst.resetAt)));
  // The global burst ceiling is five generations per window, so two more from another workspace fit;
  // the sixth is refused and the next window admits again.
  assert.equal(core.admitAI('w2').admitted,true);
  assert.equal(core.admitAI('w2').admitted,true);
  assert.equal(core.admitAI('w3').admitted,true);
  const globalBurst=core.admitAI('w4');
  assert.equal(globalBurst.admitted,false);assert.equal(globalBurst.reason,'burst');
  assert.equal(count(DAY1_KEY,'ai-workspace-w4'),0);assert.equal(count(DAY1_KEY,'ai-total'),5);
  clock.value=DAY1+61000;
  assert.equal(core.admitAI('w4').admitted,true);
  assert.equal(count(DAY1_KEY,'ai-workspace-w4'),1);assert.equal(count(DAY1_KEY,'ai-total'),6);
  assert.equal(core.aiAllowance('w4').available,true);sqlite.close();
});

test('an admitted request stays consumed and no refund path exists across the day boundary',()=>{
  const {core,sqlite,clock,count}=budgetFixture();
  const receipt=core.admitAI('w1');assert.equal(receipt.admitted,true);
  assert.equal(count(DAY1_KEY,'ai-total'),1);assert.equal(count(DAY1_KEY,'ai-workspace-w1'),1);
  // There is no compensation: a dispatched attempt cannot be restored, so the unit stays consumed.
  assert.equal(typeof core.refund,'undefined');
  assert.equal(count(DAY1_KEY,'ai-total'),1);assert.equal(count(DAY1_KEY,'ai-workspace-w1'),1);
  // An admission committed on the previous UTC day also stays consumed: nothing is ever returned.
  const carried=core.admitAI('w1');assert.equal(carried.admitted,true);
  clock.value=Date.UTC(2026,9,25,0,0,30);
  assert.equal(count('2026-10-25','ai-total'),0);assert.equal(count('2026-10-25','ai-workspace-w1'),0);
  sqlite.close();
});

test('the day boundary moves both scopes together and reports the server reset instant',()=>{
  const {core,sqlite,clock,count,seed}=budgetFixture();
  seed(DAY1_KEY,'ai-total',79);
  assert.equal(core.admitAI('w1').admitted,true);
  assert.equal(count(DAY1_KEY,'ai-total'),80);assert.equal(count(DAY1_KEY,'ai-workspace-w1'),1);
  assert.equal(core.aiAllowance('w1').available,false);
  clock.value=Date.UTC(2026,9,25,0,0,30);
  const probe=core.aiAllowance('w1');
  assert.equal(probe.available,true);assert.equal(probe.resetAt,dayResetInstant('2026-10-25'));
  assert.equal(core.admitAI('w1').admitted,true);
  assert.equal(count('2026-10-25','ai-total'),1);assert.equal(count('2026-10-25','ai-workspace-w1'),1);
  assert.equal(count(DAY1_KEY,'ai-total'),0);assert.equal(count(DAY1_KEY,'ai-workspace-w1'),0);
  // An unreadable clock fails closed on both admission and workspace creation, writing nothing.
  const broken=budgetFixture({now:NaN});
  const refused=broken.core.admitAI('w1');
  assert.deepEqual(refused,{admitted:false,reason:'clock',resetAt:null});
  assert.deepEqual(broken.core.openWorkspace('a'),{opened:false,reason:'clock',resetAt:null});
  assert.equal(broken.count(DAY1_KEY,'ai-total'),0);
  assert.equal(broken.core.aiAllowance('w1').available,false);broken.sqlite.close();sqlite.close();
});

test('workspace creation counts and registers inside one transaction',()=>{
  const {core,sqlite,count,seed}=budgetFixture();
  assert.deepEqual(core.openWorkspace('a'),{opened:true,reason:null,resetAt:dayResetInstant(DAY1_KEY)});
  assert.equal(core.hasWorkspace('a'),true);assert.equal(count(DAY1_KEY,'workspaces'),1);
  // A duplicate registration rolls back with the counter, so nothing is silently spent.
  assert.throws(()=>core.openWorkspace('a'));
  assert.equal(core.hasWorkspace('a'),true);assert.equal(count(DAY1_KEY,'workspaces'),1);
  const full=budgetFixture();full.seed(DAY1_KEY,'workspaces',200);
  const refusal=full.core.openWorkspace('b');
  assert.equal(refusal.opened,false);assert.equal(refusal.reason,'capacity');
  assert.equal(full.core.hasWorkspace('b'),false);assert.equal(full.count(DAY1_KEY,'workspaces'),200);
  assert.equal(refusal.resetAt,dayResetInstant(DAY1_KEY));
  sqlite.close();full.sqlite.close();
});

test('a dispatched generation is never refunded: failed and unusable output stay consumed',async()=>{
  const limits={aiPerWorkspacePerDay:3,aiGlobalPerDay:10,aiPerWorkspacePerBurst:10,aiGlobalPerBurst:10};
  const {core,sqlite,count}=budgetFixture({limits});
  const consumed=()=>[count(DAY1_KEY,'ai-workspace-w1'),count(DAY1_KEY,'ai-total')];
  const ai=provider=>new HostedAI(provider,async()=>{const admission=await core.admitAI('w1');if(!admission?.admitted)throw aiRefusal(admission);return admission;},true);
  assert.deepEqual(consumed(),[0,0]);
  // A provider call that was dispatched and then failed: the admission is not returned.
  await assert.rejects(()=>ai({async run(){throw new Error('provider down');}}).generate('System',{}),/could not complete this request/);
  assert.deepEqual(consumed(),[1,1]);
  // Truncated output from a dispatched call.
  await assert.rejects(()=>ai({async run(){return {response:{},choices:[{finish_reason:'length',message:{}}]};}}).generate('System',{}),/no usable text/);
  assert.deepEqual(consumed(),[2,2]);
  // Empty output from a dispatched call.
  await assert.rejects(()=>ai({async run(){return {response:{}};}}).generate('System',{}),/no usable text/);
  assert.deepEqual(consumed(),[3,3]);
  // The consumed counters never decrease, and the ceiling now refuses instead of admitting.
  let providerCalls=0;
  await assert.rejects(()=>ai({async run(){providerCalls++;return {response:'ok'};}}).generate('System',{}),/used for today/);
  assert.equal(providerCalls,0);
  assert.deepEqual(consumed(),[3,3]);
  const refusal=core.admitAI('w1');
  assert.equal(refusal.admitted,false);assert.equal(refusal.reason,'daily');
  assert.deepEqual(consumed(),[3,3]);
  // Availability comes from the counters, not from configuration, and a refusal is never silent.
  const gone=new HostedAI({async run(){throw new Error('should not run');}},async()=>{throw aiRefusal({reason:'daily',resetAt:dayResetInstant(DAY1_KEY)});},true,{allowance:async()=>({available:false,reason:'daily',resetAt:dayResetInstant(DAY1_KEY)})});
  assert.equal((await gone.availability()).available,false);
  assert.equal((await gone.availability()).reason,'daily');
  await assert.rejects(()=>gone.generate('System',{}),/used for today/);
  const open=new HostedAI({async run(){return {response:'ok'};}},async()=>({admitted:true,admissionId:'admit-1',day:DAY1_KEY,resetAt:dayResetInstant(DAY1_KEY),scopes:['ai-workspace-w1','ai-total']}),true,{allowance:async()=>({available:true,reason:null,resetAt:null})});
  assert.equal((await open.availability()).available,true);
  sqlite.close();
});
