import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {routeWorkspace,workspaceHash,boundedJSON} from '../src/cloud-routing.mjs';
import {cloudSql} from '../src/cloud-sql.mjs';
import {syncTransaction} from '../src/transaction.mjs';
import {RefundJournalCore} from '../src/journal-core.mjs';
import {ClaimDeskCore} from '../src/claims-core.mjs';
import {HostedAI,hostedModel} from '../src/cloud-ai.mjs';

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
