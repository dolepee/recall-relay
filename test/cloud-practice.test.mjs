import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {RefundJournalCore} from '../src/journal-core.mjs';
import {ClaimDeskCore} from '../src/claims-core.mjs';
import {cloudSql} from '../src/cloud-sql.mjs';
import {PracticeRuntime} from '../src/practice-runtime.mjs';
import {SimulatedRefundProvider} from '../src/practice-provider.mjs';
import {boundedJSON} from '../src/cloud-routing.mjs';
import {validatePracticeRequest,resolvePracticeSession,practiceAction,PRACTICE_MAX_BYTES} from '../src/cloud-practice-routing.mjs';
import {UsageBudgetCore,DEFAULT_BUDGET_LIMITS,PRACTICE_SESSIONS_PER_DAY} from '../src/cloud-budget.mjs';

// The same real-SQLite transaction harness the connected runtime tests use.
function sqliteStorage(){
  const sqlite=new DatabaseSync(':memory:');
  const storage={sql:{
    exec(query,...args){
      if(query.trim().startsWith('CREATE')){for(const part of query.split(';').filter(x=>x.trim()))sqlite.exec(part);return {toArray:()=>[],rowsWritten:0};}
      const stmt=sqlite.prepare(query);
      if(query.trim().startsWith('SELECT'))return {toArray:()=>stmt.all(...args),rowsWritten:0};
      const result=stmt.run(...args);return {toArray:()=>[],rowsWritten:result.changes};
    }},
    transactionSync(fn){sqlite.exec('BEGIN');try{const value=fn();sqlite.exec('COMMIT');return value;}catch(error){sqlite.exec('ROLLBACK');throw error;}},
  };
  return {storage,sqlite};
}
const ORIGIN='https://practice.example';
const PHOTO_A='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
const PHOTO_B='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/5ncLrgAAAABJRU5ErkJggg==';
const extra=()=>({'practice-lot-confirm':true,'practice-defect':'The handle is cracked near the rim.'});
const bind=view=>({caseId:view.case.id,attempt:view.attempt,revision:view.case.revision});

function fixture(){
  const {storage,sqlite}=sqliteStorage();
  const runtime=new PracticeRuntime({journal:new RefundJournalCore(cloudSql(storage)),provider:()=>new SimulatedRefundProvider(),origin:ORIGIN});
  return {runtime,sqlite,storage};
}
async function open(rt){
  const resolved=resolvePracticeSession('state',null);
  const result=await rt.handle({token:resolved.token,fresh:true,path:'/api/practice/state',method:'GET',origin:ORIGIN,contentType:'',body:{}});
  return {token:resolved.token,state:result.value};
}
const call=(rt,token,method,path,body,extraInput={})=>rt.handle({token,fresh:false,path,method,origin:ORIGIN,contentType:'application/json',body:body||{},...extraInput});
const count=(rt,table)=>rt.practice.desk.db.prepare(`SELECT count(*) c FROM ${table}`).get().c;

test('cloud practice runs on DO SQLite with shared core and a simulated adapter only',async()=>{
  const {runtime}=fixture();
  const {token,state}=await open(runtime);
  assert.equal(state.mode,'practice');
  assert.equal(state.case.status.code,'AWAITING_CUSTOMER');

  let res=await call(runtime,token,'POST','/api/practice/role',{role:'customer'});
  let view=res.value;
  res=await call(runtime,token,'POST','/api/practice/submit',{...bind(view),lot:'LOT-A',acknowledged:true,photo:PHOTO_A,extra:extra()});
  view=res.value;assert.equal(view.case.status.code,'SUBMITTED');
  res=await call(runtime,token,'POST','/api/practice/role',{role:'merchant'});
  view=res.value;
  res=await call(runtime,token,'POST','/api/practice/review',{...bind(view),confirmed:true});
  view=res.value;assert.equal(view.case.plan.status,'READY_FOR_APPROVAL');

  const realFetch=globalThis.fetch;
  globalThis.fetch=()=>{throw new Error('network is forbidden in practice');};
  try{res=await call(runtime,token,'POST','/api/practice/approve',{...bind(view),confirmed:true,digest:view.case.plan.digest});}
  finally{globalThis.fetch=realFetch;}
  assert.equal(res.value.case.status.code,'COMPLETED');
  assert.match(res.value.case.refund.reference,/^PRACTICE-REFUND-/);
  assert.match(res.value.case.status.reason,/No payment provider/);
});

test('two hosted practice sessions are isolated objects and cannot touch a connected desk',async()=>{
  const a=fixture(),b=fixture();
  const first=await open(a.runtime),second=await open(b.runtime);
  assert.notEqual(first.state.case.id,second.state.case.id);
  await call(a.runtime,first.token,'POST','/api/practice/role',{role:'customer'});
  let view=(await call(a.runtime,first.token,'POST','/api/practice/role',{role:'customer'})).value;
  view=(await call(a.runtime,first.token,'POST','/api/practice/submit',{...bind(view),lot:'LOT-A',acknowledged:true,photo:PHOTO_A,extra:extra()})).value;
  assert.equal(view.case.status.code,'SUBMITTED');
  const other=(await open(b.runtime)).state;
  assert.equal(other.case.status.code,'AWAITING_CUSTOMER');
  assert.notEqual(other.case.id,view.case.id);

  // A connected desk on its own storage stays empty while practice runs.
  const connectedStorage=sqliteStorage();
  const connected=new ClaimDeskCore({journal:new RefundJournalCore(cloudSql(connectedStorage.storage)),provider:()=>{throw new Error('connected provider must not be reached');}});
  assert.equal(connected.merchantState().cases.length,0);
  assert.equal(connected.merchantState().checkouts.length,0);
});

test('hosted practice rejects stale attempt, case and digest without settling',async()=>{
  const {runtime}=fixture();
  const {token}=await open(runtime);
  let view=(await call(runtime,token,'POST','/api/practice/role',{role:'customer'})).value;
  view=(await call(runtime,token,'POST','/api/practice/submit',{...bind(view),lot:'LOT-A',acknowledged:true,photo:PHOTO_A,extra:extra()})).value;
  view=(await call(runtime,token,'POST','/api/practice/role',{role:'merchant'})).value;
  view=(await call(runtime,token,'POST','/api/practice/review',{...bind(view),confirmed:true})).value;
  const shown={...bind(view),confirmed:true,digest:view.case.plan.digest};

  const session=runtime.practice.open(token).session;
  runtime.practice.requestChanges(session,{...bind(view),message:'Please send a clearer photograph of the lot code.',replacePhoto:true});
  const stale=await call(runtime,token,'POST','/api/practice/review',{...shown});
  assert.equal(stale.status,409);assert.equal(stale.value.stale,true);
  const approved=await call(runtime,token,'POST','/api/practice/approve',{...shown});
  assert.equal(approved.status,409);
  assert.equal(count(runtime,'refunds'),0);
});

test('an unresolved hosted practice row reloads unresolved and resumes safely',async()=>{
  const {runtime,sqlite}=fixture();
  const {token}=await open(runtime);
  let view=(await call(runtime,token,'POST','/api/practice/role',{role:'customer'})).value;
  view=(await call(runtime,token,'POST','/api/practice/submit',{...bind(view),lot:'LOT-A',acknowledged:true,photo:PHOTO_A,extra:extra()})).value;
  view=(await call(runtime,token,'POST','/api/practice/role',{role:'merchant'})).value;
  view=(await call(runtime,token,'POST','/api/practice/review',{...bind(view),confirmed:true})).value;
  const session=runtime.practice.open(token).session;
  const claim=runtime.practice.desk.claim(session.claimId);
  const plan=runtime.practice.desk.plan(claim);
  runtime.practice.desk.journal.reserve(plan,{actor:'local-merchant',digest:plan.digest},5999);

  // Reload is a fresh read over the same object storage.
  const state=await call(runtime,token,'GET','/api/practice/state');
  assert.equal(state.value.case.refund,null);
  assert.equal(state.value.case.unresolved.state,'RESERVED');
  assert.notEqual(state.value.case.status.code,'COMPLETED');

  const resumed=await call(runtime,token,'POST','/api/practice/resume',{...bind(state.value),digest:state.value.case.plan.digest});
  assert.equal(resumed.value.case.status.code,'COMPLETED');
  assert.equal(resumed.value.case.unresolved,null);
});

test('expiry deletes practice sessions, claims, photos and refund rows',async()=>{
  const {runtime}=fixture();
  const {token}=await open(runtime);
  let view=(await call(runtime,token,'POST','/api/practice/role',{role:'customer'})).value;
  view=(await call(runtime,token,'POST','/api/practice/submit',{...bind(view),lot:'LOT-A',acknowledged:true,photo:PHOTO_A,extra:extra()})).value;
  assert.ok(count(runtime,'claims')>0);
  runtime.expire();
  assert.equal(count(runtime,'practice_sessions'),0);
  assert.equal(count(runtime,'claims'),0);
  assert.equal(count(runtime,'refunds'),0);
  assert.equal(count(runtime,'refund_hints'),0);
  const after=await call(runtime,token,'GET','/api/practice/state');
  assert.equal(after.status,410);
  assert.equal(after.value.expired,true);
});

test('practice request validation rejects origin, method, route and oversized bodies before state',async()=>{
  assert.equal(practiceAction('/api/practice/state'),'state');
  assert.equal(practiceAction('/api/practice/nope'),null);
  assert.equal(validatePracticeRequest({method:'PUT',pathname:'/api/practice/state',requestOrigin:ORIGIN,contentType:'application/json',origin:ORIGIN}).status,405);
  assert.equal(validatePracticeRequest({method:'GET',pathname:'/api/practice/nope',requestOrigin:ORIGIN,contentType:'',origin:ORIGIN}).status,404);
  assert.equal(validatePracticeRequest({method:'POST',pathname:'/api/practice/submit',requestOrigin:'https://evil.example',contentType:'application/json',origin:ORIGIN}).status,403);
  assert.equal(validatePracticeRequest({method:'POST',pathname:'/api/practice/submit',requestOrigin:ORIGIN,contentType:'text/plain',origin:ORIGIN}).status,403);
  assert.equal(validatePracticeRequest({method:'POST',pathname:'/api/practice/submit',requestOrigin:ORIGIN,contentType:'application/json',origin:ORIGIN}),null);

  assert.deepEqual(resolvePracticeSession('state',null).fresh,true);
  assert.equal(resolvePracticeSession('submit',null).expired,true);
  assert.equal(resolvePracticeSession('submit','x'.repeat(43)).fresh,false);
  await assert.rejects(()=>boundedJSON(new Request('https://example.com',{method:'POST',body:'x'.repeat(PRACTICE_MAX_BYTES+10)}),PRACTICE_MAX_BYTES),/too large/);

  // Malformed and unknown sessions do not create state.
  const {runtime}=fixture();
  assert.equal(count(runtime,'practice_sessions'),0);
  const expired=await call(runtime,'x'.repeat(43),'GET','/api/practice/state');
  assert.equal(expired.status,410);
  assert.equal(count(runtime,'practice_sessions'),0);
});

test('practice session quota is separate from connected workspace quota',()=>{
  const {storage}=sqliteStorage();
  let now=Date.now();
  const core=new UsageBudgetCore(storage,DEFAULT_BUDGET_LIMITS,{clock:()=>now});
  assert.equal(core.openWorkspace('w1').opened,true);
  assert.equal(core.count(new Date(now).toISOString().slice(0,10),'workspaces'),1);
  for(let i=0;i<PRACTICE_SESSIONS_PER_DAY;i++)assert.equal(core.openPractice().opened,true);
  const refused=core.openPractice();
  assert.equal(refused.opened,false);
  assert.equal(refused.reason,'capacity');
  assert.equal(core.count(new Date(now).toISOString().slice(0,10),'workspaces'),1,'connected workspaces are unchanged');
});
