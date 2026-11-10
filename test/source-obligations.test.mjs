import test from 'node:test';import assert from 'node:assert/strict';
import {SourceWorkspace,sourceCoverage} from '../src/source-workspace.mjs';import {ClaimDesk} from '../src/claims.mjs';
const photo='Submit a photograph of the product label.';
const compound='Submit a photograph of the marked cup and attest that you disposed of it.';
const source=remedies=>({title:'Synthetic source policy test',recallNumber:'TEST',sourceDigest:'a'.repeat(64),sourceUrl:'https://example.invalid/fixture',route:'ORIGINAL_PAYMENT_CANDIDATE',remedies});
async function prepared(remedies,fields){const desk=new ClaimDesk({provider:async()=>{throw Error('Provider must not be called');}});const ws=new SourceWorkspace(desk.db,{loadSource:async()=>source(remedies)});let row=await ws.import('TEST');for(const [kind,quote] of fields)row=ws.addField(row.id,{revision:row.revision,kind,quote});return {desk,ws,row,review(decisions=[]){row=ws.review(row.id,{revision:row.revision,fieldIds:row.suggestion.requirements.map(f=>f.id),confirmed:true,clauseDecisions:decisions});this.row=row;return row;},publish(){return ws.activate(row.id,{revision:row.revision,sku:'CUP',lot:'LOT-A',confirmed:true},desk);}};}
test('compound obligations require both responses; INFORMATION cannot waive an omitted attestation',async()=>{
 const s=await prepared([compound],[['PHOTO',compound]]);try{const r=s.review([{id:'clause-0-0',disposition:'INFORMATION',reason:'Trying to waive the missing response.'}]);assert.equal(r.review.coverage[0].disposition,'UNRESOLVED');assert.deepEqual(r.review.coverage[0].missingKinds,['CONFIRMATION']);assert.throws(()=>s.publish(),/manual|obligation/);const row=s.ws.addField(s.row.id,{revision:s.row.revision,kind:'CONFIRMATION',quote:compound});s.row=row;s.ws.review(row.id,{revision:row.revision,fieldIds:row.suggestion.requirements.map(f=>f.id),confirmed:true});const ready=s.ws.get(row.id);assert.ok(s.ws.activate(row.id,{revision:ready.revision,sku:'CUP',lot:'LOT-A',confirmed:true},s.desk).publishedCampaign);assert.equal(s.desk.activeCampaign().coverage[0].obligations.length,2);}finally{s.desk.close();}
});
test('a multi-sentence photo quotation cannot cover or execute a separate attestation',async()=>{
 const text=photo+' Attest that you disposed of the item.';const s=await prepared([text],[['PHOTO',text]]);try{const r=s.review();assert.deepEqual(r.review.coverage[1].missingKinds,['CONFIRMATION']);assert.throws(()=>s.publish(),/one complete source sentence/);}finally{s.desk.close();}
});
for(const [name,kind,quote] of [
 ['where condition','TEXT','Where the label is unreadable, provide the serial number printed on the base.'],
 ['provided-that condition','TEXT','Provide the serial number provided that the label is unreadable.'],
 ['unrecognized conditional lead','TEXT','In circumstances involving an unreadable label, provide the serial number.'],
 ['post-refund timing','CONFIRMATION','On receipt of your refund, attest that you have disposed of the item.'],
 ['later payment timing','CONFIRMATION','Attest to disposal once payment has been received.'],
 ['two distinct photos','PHOTO','Submit two distinct photographs of the product label and the marked cup.'],
 ['unspecified plural photos','PHOTO','Send photos of the marked product.'],
 ['optional request','PHOTO','Consumers may submit a photograph of the product label.']
])test(`${name} stays manual even when its quotation is exact`,async()=>{const remedies=kind==='PHOTO'?[quote]:[photo,quote];const fields=kind==='PHOTO'?[[kind,quote]]:[['PHOTO',photo],[kind,quote]];const s=await prepared(remedies,fields);try{const r=s.review();assert.equal(r.review.coverage.at(-1).disposition,'MANUAL');assert.throws(()=>s.publish(),/manual|timing|photograph/);}finally{s.desk.close();}});
test('missing written response in a compound photo instruction cannot be marked covered',()=>{
 const q='Submit a photograph of the marked cup and enter the serial number.';const c=sourceCoverage(source([q]),[{id:'p',kind:'PHOTO',quote:q}]);assert.deepEqual(c[0].missingKinds,['TEXT']);
});

test('an explicit MANUAL decision overrides a linked field and survives save, reload and history',async()=>{
 const quote='Submit a photograph and also return the item to the retailer.';
 const s=await prepared([quote],[['PHOTO',quote]]);try{
  const reason='A physical return must be handled outside this portal.';
  const r=s.review([{id:'clause-0-0',disposition:'MANUAL',reason}]);
  assert.equal(r.review.coverage[0].disposition,'MANUAL');
  assert.equal(r.review.coverage[0].reason,reason);
  assert.deepEqual(r.review.decisions,[{id:'clause-0-0',disposition:'MANUAL',reason}]);
  const reloaded=s.ws.get(r.id);
  assert.deepEqual(reloaded.review.decisions,[{id:'clause-0-0',disposition:'MANUAL',reason}]);
  assert.equal(sourceCoverage(reloaded.source,reloaded.review.fields,reloaded.review.decisions)[0].disposition,'MANUAL');
  const history=s.ws.historyFor(r.id).events;
  assert.equal(history.at(-1).snapshot.review.decisions[0].reason,reason);
  assert.throws(()=>s.publish(),/manual|obligation/);
 }finally{s.desk.close();}
});

test('legacy source campaigns cannot start provider work until republished; old claims are preserved',async()=>{
 let calls=0;const desk=new ClaimDesk({provider:async()=>{calls++;throw Error('Unexpected provider');}});try{desk.setSetting('published','yes');desk.setSetting('active-campaign',JSON.stringify({sourceDigest:'a'.repeat(64),sku:'CUP',lot:'LOT-A',fields:[{kind:'PHOTO',quote:photo}]}));await assert.rejects(desk.createCheckout(),/Review and republish/);assert.equal(calls,0);assert.equal(desk.merchantState().checkouts.length,0);}finally{desk.close();}
});
test('an unexecuted legacy sourced claim stays immutable and manual before any provider access',async()=>{
 let calls=0;const desk=new ClaimDesk({provider:async()=>{calls++;throw Error('Unexpected provider');}});try{const old={id:'legacy',revision:0,access:'a'.repeat(43),campaign:{sourceDigest:'b'.repeat(64),sku:'CUP',lot:'A',fields:[{id:'p',kind:'PHOTO',quote:compound}]},purchase:{id:'OLD',merchantId:'M',captureId:'C',lineId:'L',linePaidCents:1000,lineRefundedCents:0},submission:null,review:null};desk.saveClaim(old);const view=desk.customerState(old.access);assert.equal(view.status.code,'MANUAL');assert.equal(view.locked,true);assert.throws(()=>desk.submit(old.access,{revision:0}),/manual reconciliation/);await assert.rejects(desk.approve(old.id,{digest:'anything'}),/manual reconciliation/);assert.equal(calls,0);assert.deepEqual(desk.claim(old.id),old);}finally{desk.close();}
});
test('repeated singular photograph requests stay manual rather than collapsing to one upload',async()=>{
 const q='Submit a photograph of the product label and a photograph of the destroyed product.';const s=await prepared([q],[['PHOTO',q]]);try{const r=s.review();assert.equal(r.review.coverage[0].disposition,'MANUAL');assert.equal(r.review.coverage[0].obligations[0].evidenceCount,null);assert.throws(()=>s.publish(),/photograph count/);}finally{s.desk.close();}
});
