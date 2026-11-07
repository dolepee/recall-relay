import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {answerClaimQuestion} from '../src/claim-guide.mjs';
const make=()=>{
 const db=new DatabaseSync(':memory:');let status='SUBMITTED';
 const claim={id:'a',revision:3,submission:{photo:'SECRET_IMAGE',extra:{secret:'CUSTOMER_FREE_TEXT'}},review:null,correction:{state:'RESPONDED'},purchase:{captureId:'PRIVATE_CAPTURE'}};
 const campaign={sourceDigest:'digest',lot:'LOT-A',coverage:[{id:'c1',quote:'Upload a label photograph.',disposition:'FIELD'}]};
 const desk={db,claim:()=>claim,campaignFor:()=>campaign,missing:()=>[],reservation:()=>null,merchantState:()=>({cases:[{id:'a',revision:3,amountCents:3875,status:{code:status,reason:'Current evidence needs merchant review.'}}]})};
 return {desk,claim,db,change:()=>{status='READY_FOR_APPROVAL';}};
};
const output=(overrides={})=>JSON.stringify({tool:'get_evidence_gaps',view:'ALL',answer:'Inspect the replacement label before recording a fresh review.',citations:['case-review'],...overrides});
test('natural questions receive cited latest-state answers without sending customer evidence or capture data',async()=>{
 const {desk,db}=make();let sent;
 const ai={generate:async(prompt,input)=>{sent=JSON.stringify(input);return output();},status:()=>({model:'test-double'})};
 const r=await answerClaimQuestion(ai,desk,{question:'What is holding this up?',caseId:'a',revision:3});
 assert.equal(r.tool,'get_evidence_gaps');assert.equal(r.view,null);assert.match(r.citations[0].text,/RESPONDED/);assert.match(r.message,/AI explanation/);
 assert.doesNotMatch(sent,/SECRET_IMAGE|CUSTOMER_FREE_TEXT|PRIVATE_CAPTURE/);assert.match(sent,/earlier photograph\/text changes are not reconstructed/);db.close();
});
test('invalid citations, invented figures, stale state and malformed output are not displayed',async()=>{
 const {desk,db,change}=make();const ai={generate:async()=>output(),status:()=>({model:'double'})};const input={question:'What changed?',caseId:'a',revision:3};
 for(const overrides of [{citations:['invented']},{answer:'Refund 999 dollars.'},{citations:[]},{tool:'approve'}]){ai.generate=async()=>output(overrides);await assert.rejects(answerClaimQuestion(ai,desk,input),/unsupported or uncited/);}
 ai.generate=async()=>{change();return output();};await assert.rejects(answerClaimQuestion(ai,desk,input),/workspace changed/);
 await assert.rejects(answerClaimQuestion(ai,desk,{...input,revision:8}),/selected claim changed/);db.close();
});
test('financial questions use deterministic amounts and only an explicit view tool changes the queue',async()=>{
 const {desk,db}=make();const ai={generate:async()=>output({tool:'get_financial_summary',citations:['amount-REVIEW']}),status:()=>({model:'double'})};
 const r=await answerClaimQuestion(ai,desk,{question:'How much awaits review?'});assert.match(r.citations[0].text,/\$38.75/);assert.equal(r.view,null);
 ai.generate=async()=>output({tool:'show_claim_view',view:'REVIEW',citations:['amount-REVIEW']});assert.equal((await answerClaimQuestion(ai,desk,{question:'Show unreviewed claims'})).view,'REVIEW');db.close();
});
test('correction questions never infer a difference from an unavailable earlier submission',async()=>{
 const {desk,db}=make();const ai={generate:async()=>output({tool:'get_case_changes',answer:'The customer added a different photo and changed the lot.'}),status:()=>({model:'double'})};
 const result=await answerClaimQuestion(ai,desk,{question:'What changed after the correction?',caseId:'a',revision:3});
 assert.doesNotMatch(result.answer,/customer added/);assert.match(result.answer,/Earlier submissions are not reconstructed/);assert.match(result.citations[0].text,/RESPONDED/);db.close();
});
test('unsupported mutation requests receive a server-owned refusal with no view change',async()=>{
 const {desk,db}=make();const ai={generate:async()=>JSON.stringify({tool:'UNSUPPORTED',view:null,answer:'Cannot pay',citations:[]}),status:()=>({model:'double'})};
 const result=await answerClaimQuestion(ai,desk,{question:'Pay everyone'});assert.equal(result.view,null);assert.equal(result.readOnly,true);assert.match(result.answer,/require the merchant controls/);db.close();
});
import {validateView} from '../src/source-workspace.mjs';
test('the legacy assistant endpoint does not return the new filter to already-open older clients',()=>{
 assert.throws(()=>validateView('{"view":"OPEN"}'),/supported view/);assert.equal(validateView('REVIEW'),'REVIEW');
});
test('source questions include the ninth and later reviewed clauses without silent truncation',async()=>{
 const {desk,db}=make();const campaign=desk.campaignFor();campaign.coverage=Array.from({length:12},(_,i)=>({id:`clause-${i+1}`,quote:i===8?'Only purchases before the cutoff qualify.':`Public instruction ${i+1}.`,disposition:'INFORMATION'}));desk.campaignFor=()=>campaign;
 let sent;const ai={generate:async(_prompt,input)=>{sent=input;return output({tool:'get_source_requirements',answer:'Read the complete cited condition before considering the claim.',citations:['source-clause-9']});},status:()=>({model:'double'})};
 const result=await answerClaimQuestion(ai,desk,{question:'What source conditions apply?',caseId:'a',revision:3});
 assert.equal(sent.evidence.filter(e=>e.id.startsWith('source-')).length,12);assert.equal(result.citations[0].text,'Only purchases before the cutoff qualify.');db.close();
});
test('an oversized complete source refuses inference instead of sending an incomplete selection',async()=>{
 const {desk,db}=make();const campaign=desk.campaignFor();campaign.coverage=Array.from({length:12},(_,i)=>({id:`clause-${i}`,quote:'Public instruction. '.repeat(40),disposition:'INFORMATION'}));desk.campaignFor=()=>campaign;
 let calls=0;const ai={generate:async()=>{calls++;return output();},status:()=>({model:'double'})};
 await assert.rejects(answerClaimQuestion(ai,desk,{question:'What source conditions apply?',caseId:'a',revision:3}),/No partial source was sent/);assert.equal(calls,0);db.close();
});
