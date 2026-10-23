import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {SourceWorkspace,validateSourceSuggestion,validateView,assistCases} from '../src/source-workspace.mjs';

const quote='Upload a photo of the label and confirm the product serial number.';
const source={title:'Public notice',remedies:[quote],sourceUrl:'https://www.cpsc.gov/Recalls/2026/Example',sourceDigest:'a'.repeat(64)};
const raw=JSON.stringify({requirements:[{kind:'PHOTO',quote}]});
function fixture(generate=async()=>raw){const db=new DatabaseSync(':memory:');return {db,ws:new SourceWorkspace(db,{loadSource:async()=>source,ai:{status:()=>({available:true,model:'test-double'}),generate}})};}
test('source fields require exact quotations; generated authority and invented instructions fail',()=>{
  assert.equal(validateSourceSuggestion(raw,source).paymentAuthorized,false);
  assert.throws(()=>validateSourceSuggestion(JSON.stringify({requirements:[{kind:'PHOTO',quote:'Destroy your item immediately.'}]}),source));
  assert.throws(()=>validateSourceSuggestion(JSON.stringify({requirements:[],approved:true}),source));
  assert.throws(()=>validateSourceSuggestion(JSON.stringify({requirements:[{kind:'PAY',quote}]}),source));
});
test('source review binds selected fields to current revision and source, without publishing payments',async()=>{
  const {db,ws}=fixture();const imported=await ws.import('27026');const suggested=await ws.suggest(imported.id,1);
  assert.throws(()=>ws.review(imported.id,{revision:1,fieldIds:['field-1'],confirmed:true}));
  assert.throws(()=>ws.review(imported.id,{revision:2,fieldIds:['invented'],confirmed:true}));
  const reviewed=ws.review(imported.id,{revision:2,fieldIds:['field-1'],confirmed:true});
  assert.equal(reviewed.review.fields[0].quote,quote);assert.equal(reviewed.review.paymentAuthorized,false);
  assert.equal(reviewed.review.sourceDigest,source.sourceDigest);assert.equal(ws.state().setups.length,1);db.close();
});
test('concurrent source suggestion cannot replace a reviewed revision',async()=>{
  let release;const {db,ws}=fixture(()=>new Promise(resolve=>{release=resolve;}));
  const row=await ws.import('27026');const pending=ws.suggest(row.id,1);
  ws.save({...row,revision:2,review:{sentinel:true}});release(raw);
  await assert.rejects(pending,/changed while drafting/);assert.equal(ws.get(row.id).review.sentinel,true);db.close();
});
test('merchant can supply a missing source field without AI and cannot introduce invented text',async()=>{
  const {db,ws}=fixture();const row=await ws.import('27026');
  assert.throws(()=>ws.addField(row.id,{revision:1,kind:'TEXT',quote:'Supply your bank account number.'}));
  const amended=ws.addField(row.id,{revision:1,kind:'PHOTO',quote});
  assert.equal(amended.suggestion.requirements[0].origin,'MERCHANT_SOURCE_SELECTION');assert.equal(amended.review,null);
  assert.throws(()=>ws.addField(row.id,{revision:2,kind:'PHOTO',quote}));db.close();
});
test('case assistant has a closed view vocabulary and computes its answer from current states',async()=>{
  assert.equal(validateView('WAITING'),'WAITING');
  assert.equal(validateView('REVIEW'),'REVIEW');
  assert.throws(()=>validateView('WAITING; send_refund()'));
  assert.throws(()=>validateView('{"view":"READY","refund":true}'));
  assert.throws(()=>validateView('{"view":"delete_all"}'));
  const ai={generate:async()=>'{"view":"WAITING"}',status:()=>({model:'test-double'})};
  const desk={merchantState:()=>({cases:[{order:'RR-1',status:{code:'NEEDS_INFORMATION',reason:'Add a photo.'}},{order:'RR-2',status:{code:'COMPLETED',reason:'Confirmed.'}}]})};
  const result=await assistCases(ai,desk,'who still owes a photo?');assert.equal(result.view,'WAITING');assert.match(result.message,/RR-1: Add a photo/);assert.doesNotMatch(result.message,/RR-2/);
  ai.generate=async()=>'{"view":"UNSUPPORTED"}';assert.equal((await assistCases(ai,desk,'Refund everybody')).view,null);
});
