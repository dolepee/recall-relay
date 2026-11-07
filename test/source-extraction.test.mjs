import test from 'node:test';import assert from 'node:assert/strict';
import {sourceDraftInput,validateSourceDraft} from '../src/source-extraction.mjs';
import {sourceFieldIssue} from '../src/source-policy.mjs';
import {advisorySchema} from '../src/case-advisory.mjs';
import {HostedAI} from '../src/cloud-ai.mjs';
const quotes=['Consumers should remove the sleeping pad and email a photo to example@example.com to obtain a refund issued to the original payment method.','Before photographing the unit, unplug it and remove the detachable battery.','At submission, enter the lot code and confirm the purchase belongs to this claim.','You may provide a product description, but a photo is not required.'];
const source={remedies:quotes,sourceUrl:'https://example.invalid/notice',sourceDigest:'fixture'};
const classify=kinds=>JSON.stringify({clauses:sourceDraftInput(source).clauses.map((c,i)=>({clauseId:c.clauseId,kinds:kinds[i]}))});
test('indexed extraction preserves full destination/route/preparation text and every requested response',()=>{
 const output=validateSourceDraft(classify([['PHOTO'],['PHOTO'],['TEXT','CONFIRMATION'],['TEXT']]),source);
 assert.equal(output.requirements.length,5);assert.equal(output.requirements[0].quote,quotes[0]);assert.equal(output.requirements[1].quote,quotes[1]);assert.deepEqual(output.requirements.filter(f=>f.quote===quotes[2]).map(f=>f.kind),['TEXT','CONFIRMATION']);
 assert.ok(sourceFieldIssue(output.requirements[4]),'optional written information stays manual, not a universal required form response');
});
test('unknown, omitted, duplicated or malformed sentence classifications cannot save a draft',()=>{
 const valid=JSON.parse(classify([[],[],[],[]]));for(const mutate of [v=>v.clauses.pop(),v=>v.clauses[0].clauseId='invented',v=>v.clauses[1].clauseId=v.clauses[0].clauseId,v=>v.clauses[0].kinds=['PAY'],v=>v.clauses[0].kinds=['PHOTO','PHOTO'],v=>v.clauses[0].quote='shortened',v=>v.approved=true]){const v=structuredClone(valid);mutate(v);assert.throws(()=>validateSourceDraft(JSON.stringify(v),source));}
 assert.throws(()=>validateSourceDraft(JSON.stringify({requirements:[]}),source));assert.throws(()=>validateSourceDraft(' '.repeat(18001),source));assert.throws(()=>validateSourceDraft(null,source));
});
test('schema transport accepts a structured provider object and retains admission/size enforcement',async()=>{
 let admitted=0;const schema=advisorySchema([{citationId:'c'}]),raw={clauses:[{citationId:'c',actor:'CUSTOMER',timing:'UNSPECIFIED',condition:null,explanation:'Upload one photograph of the label.'}]};
 const ai=new HostedAI({run:async(_model,input)=>{assert.equal(input.response_format.type,'json_schema');assert.deepEqual(input.response_format.json_schema,schema);return {response:raw};}},async()=>{admitted++;},true);
 assert.equal(JSON.parse(await ai.generate('Annotate source',{clauses:[{citationId:'c',quote:raw.clauses[0].explanation}]},{responseSchema:schema,advisory:true})).clauses.length,1);assert.equal(admitted,1);
});
test('a waived photo never cancels a separate confirmation or becomes a photo field',()=>{
 const quote='No photograph is required; confirm the purchase belongs to this claim.',s={remedies:[quote],sourceUrl:'https://example.invalid',sourceDigest:'x'};
 const out=validateSourceDraft(JSON.stringify({clauses:[{clauseId:'clause-0-0',kinds:['PHOTO','CONFIRMATION']}]}),s);assert.deepEqual(out.requirements.map(f=>f.kind),['CONFIRMATION']);assert.equal(out.filtered.length,1);
});
test('temporal actor annotations preserve the actual imperative and business subject',async()=>{
 const {validateAdvisory}=await import('../src/case-advisory.mjs');
 for(const [quote,actor,timing] of [['Before photographing the unit, unplug it and remove the detachable battery.','CUSTOMER','BEFORE_ACTION'],['After the replacement arrives, the manufacturer will collect the old unit.','MANUFACTURER','AFTER_ACTION'],['Once the firm receives the photo, consumers will receive a refund.','UNKNOWN','AFTER_ACTION']]){
 const result=validateAdvisory(JSON.stringify({clauses:[{citationId:'c',actor,timing,condition:null,explanation:quote}]}),{clauses:[{citationId:'c',quote}]});assert.equal(result[0].interpretationAvailable,true,quote);
 }
});

test('source-policy updates require a renewed review before execution of version-five campaigns',async()=>{
 const {assertExecutableCampaign}=await import('../src/source-policy.mjs');assert.throws(()=>assertExecutableCampaign({sourceDigest:'saved',sourcePolicyVersion:5,sourceRemedies:['Upload one photograph of the label.'],fields:[{id:'p',kind:'PHOTO',quote:'Upload one photograph of the label.'}]}),/Review and republish/);
});

test('a business receiving a photo and the customer receiving a refund is not another photo request',()=>{
 const quote='Once the firm receives the photo, consumers will receive a refund through the original form of purchase payment.',s={remedies:[quote],sourceUrl:'https://example.invalid',sourceDigest:'x'};
 const result=validateSourceDraft(JSON.stringify({clauses:[{clauseId:'clause-0-0',kinds:['PHOTO']}]}),s);assert.equal(result.requirements.length,0);assert.equal(result.filtered.length,1);
 const followup='Once the firm receives a photo, consumers will receive a refund after they send a photograph of the label.';
 const explicit=validateSourceDraft(JSON.stringify({clauses:[{clauseId:'clause-0-0',kinds:['PHOTO']}]}),{...s,remedies:[followup]});assert.equal(explicit.requirements.length,1);assert.ok(sourceFieldIssue(explicit.requirements[0]),'a later/multiple-photo workflow stays manual');
});
