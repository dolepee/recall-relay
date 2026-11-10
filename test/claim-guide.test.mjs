import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {answerClaimQuestion} from '../src/claim-guide.mjs';
const make=()=>{
 const db=new DatabaseSync(':memory:');let status='SUBMITTED';
 const claim={id:'a',revision:3,submission:{photo:'SECRET_IMAGE',extra:{secret:'CUSTOMER_FREE_TEXT'}},review:null,correction:{state:'RESPONDED'},purchase:{captureId:'PRIVATE_CAPTURE'}};
 const campaign={sourceDigest:'digest',lot:'LOT-A',coverage:[{id:'c1',quote:'Upload a label photograph.',disposition:'FIELD'}]};
 const desk={db,claim:()=>claim,campaignFor:()=>campaign,missing:()=>[],reservation:()=>null,merchantState:()=>({cases:[{id:'a',revision:3,amountCents:3875,status:{code:status,reason:'Current evidence needs merchant review.'}}]})};
 return {desk,claim,db,change:()=>{status='READY_FOR_APPROVAL';},setStatus:s=>{status=s;}};
};
const output=(overrides={})=>JSON.stringify({tool:'get_evidence_gaps',view:'ALL',answer:'Inspect the replacement label before recording a fresh review.',citations:['case-review'],...overrides});
test('natural questions receive cited latest-state answers without sending customer evidence or capture data',async()=>{
 const {desk,db}=make();let sent;
 const ai={generate:async(prompt,input)=>{sent=JSON.stringify(input);return output();},status:()=>({model:'test-double'})};
 const r=await answerClaimQuestion(ai,desk,{question:'What is holding this up?',caseId:'a',revision:3});
 assert.equal(r.tool,'get_evidence_gaps');assert.equal(r.view,null);assert.match(r.citations[0].text,/RESPONDED/);assert.match(r.message,/Recorded case summary/);
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
 assert.doesNotMatch(result.answer,/customer added/);assert.match(result.answer,/Earlier submissions are not reconstructed/);assert.match(result.answer,/History and refund recovery/);assert.match(result.citations[0].text,/RESPONDED/);db.close();
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
test('financial answers never turn another group amount or unknown balance into a zero liability claim',async()=>{
 const {desk,db}=make();desk.merchantState=()=>({cases:[{id:'unknown',amountCents:null,status:{code:'MANUAL',reason:'Amount unavailable.'}},{id:'paid',amountCents:2500,status:{code:'COMPLETED'},receipt:{amountCents:2500}}]});
 const ai={generate:async()=>output({tool:'get_financial_summary',answer:'There are no unresolved amounts. All liability is settled.',citations:['amount-OPEN']}),status:()=>({model:'double'})};
 const result=await answerClaimQuestion(ai,desk,{question:'How much remains unresolved?'});
 assert.doesNotMatch(result.answer,/All liability is settled/);assert.match(result.answer,/incomplete subtotal is not a zero total/);assert.match(result.citations.find(c=>c.id==='amount-OPEN').text,/INCOMPLETE subtotal: \$0.00 known; 1 amounts unknown/);db.close();
});
test('model advice cannot reopen completed evidence or suggest replacement refunds for payment-locked cases',async()=>{
 const {desk,db}=make();
 for(const code of ['COMPLETED','RESERVED','UNKNOWN','PENDING','FAILED','CANCELLED']){
  desk.merchantState=()=>({cases:[{id:'a',order:'RR-A',revision:3,amountCents:3875,status:{code,reason:'Recorded provider state.'},...(code==='COMPLETED'?{receipt:{amountCents:3875}}:{payment:{cents:3875,state:code}})}]});
  const ai={generate:async()=>output({answer:'Inspect the current label and approve another refund now.'}),status:()=>({model:'double'})};
  const result=await answerClaimQuestion(ai,desk,{question:'What should I do next?',caseId:'a',revision:3});assert.doesNotMatch(result.answer,/approve another refund/);assert.match(result.message,/Recorded case boundary/);assert.match(result.answer,code==='COMPLETED'?/no further evidence review or refund action/:/reconcile that attempt/);
 }
 db.close();
});
test('financial summaries retain payment outcomes and receipts when the model fills its optional citations',async()=>{
 const {desk,db}=make();const ai={generate:async()=>output({tool:'get_financial_summary',citations:['amount-ALL','amount-REVIEW','amount-READY','amount-WAITING','amount-MANUAL','amount-OPEN']}),status:()=>({model:'double'})};
 const result=await answerClaimQuestion(ai,desk,{question:'Summarize workspace amounts'});assert.equal(result.citations.length,6);assert.deepEqual(result.citations.slice(0,3).map(c=>c.id),['amount-OPEN','amount-PAYMENT','amount-COMPLETED']);db.close();
});

test('server facts replace unsafe photo, review and refund claims in non-completed states',async()=>{
 const {desk,db,setStatus}=make();
 for(const status of ['SUBMITTED','NEEDS_INFORMATION','READY_FOR_APPROVAL']){
  setStatus(status);
  const ai={generate:async()=>output({tool:'get_case_brief',answer:'The photograph has been verified as authentic and the refund is complete.',citations:['case-review']}),status:()=>({model:'double'})};
  const result=await answerClaimQuestion(ai,desk,{question:'What is the state of this claim?',caseId:'a',revision:3});
  assert.doesNotMatch(result.answer,/verified as authentic|refund is complete/i,status);
  assert.match(result.message,/file format validated only, not authenticity/,status);
  assert.match(result.message,/no current merchant review recorded|current merchant review recorded/,status);
 }
 db.close();
});

test('selected-case answers are server-owned and cannot repeat contradictory refund, review or authenticity claims',async()=>{
 const {desk,db}=make();
 const contradiction='The original capture has been fully refunded. The funds have arrived in the customer account. Evidence review has finished successfully. Authenticity of the photograph is established.';
 for(const tool of ['get_case_brief','get_evidence_gaps','get_source_requirements']){
  const ai={generate:async()=>output({tool,answer:contradiction,citations:['case-review']}),status:()=>({model:'double'})};
  const result=await answerClaimQuestion(ai,desk,{question:'What is the state of this claim?',caseId:'a',revision:3});
  assert.doesNotMatch(result.answer,/fully refunded|funds have arrived|review has finished successfully|Authenticity of the photograph is established/i,tool);
  assert.match(result.answer,/not its authenticity|No current merchant review|no photograph|No recorded evidence gap|reviewed source/i,tool);
  assert.equal(result.nextActions[0].id,'record-review',tool);
  assert.match(result.message,/Recorded case summary/,tool);
 }
 db.close();
});

test('queue and financial tools also use server-owned answers, not model prose',async()=>{
 const {desk,db}=make();
 const view=await answerClaimQuestion({generate:async()=>output({tool:'show_claim_view',view:'COMPLETED',answer:'All refunds are complete.',citations:['workspace']}),status:()=>({model:'double'})},desk,{question:'Show completed claims'});
 assert.equal(view.view,'COMPLETED');
 assert.doesNotMatch(view.answer,/All refunds are complete/i);
 assert.match(view.answer,/Showing the completed queue: 0 claims/);assert.deepEqual(view.citations.map(c=>c.id),['workspace','amount-COMPLETED']);
 const money=await answerClaimQuestion({generate:async()=>output({tool:'get_financial_summary',answer:'All refunds are approved.',citations:['amount-COMPLETED']}),status:()=>({model:'double'})},desk,{question:'How much awaits review?',caseId:'a',revision:3});
 assert.doesNotMatch(money.answer,/All refunds are approved/i);
 assert.match(money.answer,/incomplete subtotal is not a zero total/);
 assert.equal(money.citations[0].id,'amount-OPEN');
 db.close();
});

test('manual or waiting claims never recommend approval even with a retained current review',async()=>{
 const {desk,db}=make();
 desk.merchantState=()=>({cases:[{id:'a',order:'RR-A',revision:3,amountCents:3875,status:{code:'MANUAL',reason:'Source policy requires manual resolution.'},submission:{lot:'LOT-A',photo:'photo',extra:{}},review:{revision:3,reviewedAt:'2026-11-10T00:00:00Z'},payment:null,receipt:null}]});
 const ai={generate:async()=>output({tool:'get_case_brief',answer:'The original capture has been fully refunded.',citations:['case-review']}),status:()=>({model:'double'})};
 const result=await answerClaimQuestion(ai,desk,{question:'What next?',caseId:'a',revision:3});
 assert.equal(result.nextActions[0].id,'resolve-manual');
 assert.doesNotMatch(result.answer,/approval controls/i);
 assert.match(result.answer,/manual source or evidence requirement/i);
 for(const [status,id] of [['WAITING','wait-customer'],['NEEDS_INFORMATION','obtain-information']]){
  desk.merchantState=()=>({cases:[{id:'a',order:'RR-A',revision:3,amountCents:3875,status:{code:status,reason:'Recorded state.'},submission:{lot:'LOT-A',photo:'photo',extra:{}},review:{revision:3},payment:null,receipt:null}]});
  const r=await answerClaimQuestion(ai,desk,{question:'What next?',caseId:'a',revision:3});
  assert.equal(r.nextActions[0].id,id,status);assert.doesNotMatch(r.answer,/approval controls/i,status);
 }
 db.close();
});
