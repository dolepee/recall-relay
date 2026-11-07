import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {preparedScenario,exampleNotice} from '../src/prepared-scenario.mjs';
import {SourceWorkspace} from '../src/source-workspace.mjs';
import {assertExecutableCampaign} from '../src/source-policy.mjs';
import {classifyRemedyRoute} from '../src/remedy-route.mjs';
import {readFile} from 'node:fs/promises';

test('the complete fictional source fits the unchanged source policy and requires human publication',async()=>{
 const db=new DatabaseSync(':memory:');let calls=0;const kinds=['PHOTO','TEXT','CONFIRMATION'];
 const ai={status:()=>({available:true,model:'scripted-test-double'}),generate:async()=>{calls++;return JSON.stringify({requirements:exampleNotice.remedies.slice(0,3).map((quote,i)=>({kind:kinds[i],quote}))});}};
 const ws=new SourceWorkspace(db,{loadSource:()=>{throw Error('Must not fetch CPSC');},ai});const settings=new Map();const desk={setSetting:(k,v)=>settings.set(k,v)};
 try{
 let row=ws.example();assert.equal(row.source.originType,'MERCHANT_TEST_NOTICE');assert.equal(row.suggestion,null);assert.equal(settings.size,0);assert.equal(calls,0);
 assert.equal(classifyRemedyRoute(row.source.remedies,row.source.options),'ORIGINAL_PAYMENT_CANDIDATE');
 assert.throws(()=>ws.activate(row.id,{revision:1,sku:'RH-CUP',lot:'LOT-A',confirmed:true},desk),/Review/);
 row=await ws.suggest(row.id,row.revision);assert.equal(calls,1);
 row=ws.review(row.id,{revision:row.revision,fieldIds:row.suggestion.requirements.map(f=>f.id),clauseDecisions:row.source.reviewNotes,confirmed:true});
 assert.equal(settings.size,0);assert.equal(row.review.paymentAuthorized,false);
 row=ws.activate(row.id,{revision:row.revision,sku:'RH-CUP',lot:'LOT-A',confirmed:true},desk);
 const campaign=JSON.parse(settings.get('active-campaign'));assert.doesNotThrow(()=>assertExecutableCampaign(campaign));assert.match(campaign.id,/^TEST-EXAMPLE/);assert.doesNotMatch(campaign.title,/CPSC/);assert.equal(campaign.fields.length,3);
 assert.equal(ws.example().id,row.id);assert.equal((await ws.refresh(row.id,row.revision)).id,row.id);assert.equal(calls,1);
 }finally{db.close();}
});
