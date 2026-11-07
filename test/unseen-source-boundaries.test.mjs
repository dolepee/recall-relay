import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceClauses,sourceCoverage,sourceInstructionProfile,assertExecutableSource,assertExecutableCampaign,validateManualField} from '../src/source-policy.mjs';
import {sourceDraftInput,validateSourceDraft} from '../src/source-extraction.mjs';
import {externalDependencies} from '../src/external-sources.mjs';
import {validateAdvisory} from '../src/case-advisory.mjs';
const photo='Upload one photograph of the product label.';
const field=quote=>({id:'p',kind:'PHOTO',quote});
test('quoted sentence endings preserve separate source IDs and cannot hide a following obligation',()=>{
 for(const closing of ['"','”',"'",'’']){
  const first=`The replacement code ends in ${closing}B.${closing}`,second='Consumers must submit a photo of the product label.',source={remedies:[first+' '+second]};
  assert.deepEqual(sourceClauses(source).map(c=>c.quote),[first,second]);
  const out=validateSourceDraft(JSON.stringify({clauses:[{clauseId:'clause-0-0',kinds:[]},{clauseId:'clause-0-1',kinds:['PHOTO']}]}),source);
  assert.equal(out.requirements[0].quote,second);assert.equal(sourceCoverage(source,[])[1].disposition,'UNRESOLVED');
  assert.equal(validateManualField({kind:'PHOTO',quote:second},source).quote,second);
 }
});
test('conditional customer groups and purchase cutoffs cannot be waived into executable forms',()=>{
 for(const quote of ['Upload a photograph of the label only for products purchased before September 15.','Consumers without a purchase receipt must provide the lot code.','Consumers who have the order number will receive a full refund.','For customers with a damaged label, provide the serial number.']){
  const source={remedies:[photo,quote]},decisions=[{id:'clause-1-0',disposition:'INFORMATION',reason:'Trying to waive a customer qualifier.'}];
  assert.equal(sourceInstructionProfile(quote).conditional,true,quote);
  assert.equal(sourceCoverage(source,[field(photo)],decisions)[1].disposition,'MANUAL',quote);
  assert.throws(()=>assertExecutableSource(source,[field(photo)],decisions),/manual|Conditional/);
 }
});
test('explicit offsite uploads are unresolved and stay manual after an excerpt is attached',()=>{
 for(const quote of ['Upload a photograph of the label to the recall registration page.','Send an image of the label through the link https://example.com/recall.']){
  const source={remedies:[quote]},dependencies=externalDependencies(source);assert.equal(dependencies.length,1);assert.equal(dependencies[0].status,'UNRESOLVED');
  assert.throws(()=>assertExecutableSource(source,[field(quote)]),/external instructions/);
  const resolved={...source,externalSnapshots:[{dependencyId:'external-0-0',digest:'fixture',text:'The public instructions identify the same affected model.'}]};
  assert.equal(sourceInstructionProfile(quote).externalAction,true);assert.throws(()=>assertExecutableSource(resolved,[field(quote)]),/handoff|manual/);
 }
 assert.equal(externalDependencies({remedies:['More information is available on the recall registration page.']}).length,0);
 assert.equal(sourceInstructionProfile('Upload one photograph of the registration card.').externalAction,false);
});
test('photo plus separate contact details needs both responses and cannot waive an omitted text field',()=>{
 const quote='Send both photos along with name and address to the firm at recall@example.com.',source={remedies:[quote]};
 const draft=validateSourceDraft(JSON.stringify({clauses:[{clauseId:'clause-0-0',kinds:['PHOTO','TEXT']}]}),source);assert.deepEqual(draft.requirements.map(f=>f.kind),['PHOTO','TEXT']);
 const coverage=sourceCoverage(source,[field(quote)]);assert.deepEqual(coverage[0].missingKinds,['TEXT']);assert.throws(()=>assertExecutableSource(source,draft.requirements),/photograph count|handoff|manual/);
 const pictured='Upload one photograph of the label showing your name and the date written on the product.';
 assert.deepEqual(sourceInstructionProfile(pictured).kinds,['PHOTO'],'a value pictured on the product is not a separate written response');
});
test('advisory withholds unconditional labels for customer-group qualifiers and retains exact supported conditions',()=>{
 for(const [quote,condition] of [['Consumers without a receipt must provide the lot code.','Consumers without a receipt'],['Consumers who have the original order number will receive a full refund.','Consumers who have the original order number'],['For consumers who have the original order number, they will receive a full refund.','For consumers who have the original order number'],['Upload a photograph only for products purchased before September 15.','only for products purchased before September 15']]){
  const input={clauses:[{citationId:'c',quote}]},answer={citationId:'c',actor:'CUSTOMER',timing:'CONDITIONAL',condition,explanation:quote};
  assert.equal(validateAdvisory(JSON.stringify({clauses:[answer]}),input)[0].interpretationAvailable,true,quote);
  assert.equal(validateAdvisory(JSON.stringify({clauses:[{...answer,timing:'UNSPECIFIED',condition:null}]}),input)[0].interpretationAvailable,false,quote);
 }
});
test('changed sentence and condition policy requires renewed publication for version-six campaigns',()=>{
 assert.throws(()=>assertExecutableCampaign({sourceDigest:'saved',sourcePolicyVersion:6,sourceRemedies:[photo],fields:[field(photo)]}),/Review and republish/);
 assert.equal(sourceDraftInput({remedies:[photo]}).clauses.length,1);
});
test('a waived value never cancels a different response and mixed waivers cannot become required forms',()=>{
 for(const [quote,kinds] of [
  ['Consumers will be asked to send their order number (not required) and a photo of the product label.',['PHOTO','TEXT']],
  ['Consumers will be asked to send to support@example.com their order number (not required) and a photo of the product label.',['PHOTO','TEXT']],
  ['Do not send the serial number; upload one photograph of the label.',['PHOTO']],
  ['Submit one photograph and provide your postal address (optional).',['PHOTO','TEXT']],
  ['Do not upload a photograph; enter the lot code.',['TEXT']],
 ]){
  const source={remedies:[quote]},draft=validateSourceDraft(JSON.stringify({clauses:[{clauseId:'clause-0-0',kinds}]}),source);
  assert.deepEqual(draft.requirements.map(f=>f.kind).sort(),[...kinds].sort());
  assert.equal(sourceCoverage(source,draft.requirements)[0].disposition,'MANUAL');
  assert.throws(()=>assertExecutableSource(source,draft.requirements),/manual|waived/);
 }
 const prohibited='Do not upload a photograph; enter the lot code.';
 const source={remedies:[prohibited]},draft=validateSourceDraft(JSON.stringify({clauses:[{clauseId:'clause-0-0',kinds:['PHOTO','TEXT']}]}),source);
 assert.deepEqual(draft.requirements.map(f=>f.kind),['TEXT'],'a prohibited photograph is not revived by a later text request');
 assert.deepEqual(sourceInstructionProfile('Send a photograph to support@example.com.').kinds,['PHOTO'],'a destination is not a separate requested text value');
});
test('a modal inside a customer qualifier cannot certify an incomplete condition',()=>{
 for(const quote of ['Consumers who need to replace the battery must provide the lot code.','Consumers who will replace the battery must provide the lot code.','Customers who may need to replace the battery must provide the lot code.']){
  for(const condition of ['Consumers who','Consumers who need to replace the battery','Customers who may need to replace the battery']){
   const answer={citationId:'c',actor:'CUSTOMER',timing:'CONDITIONAL',condition,explanation:quote};
   // Conditions not literally present fail structural validation; literal ones
   // must be withheld rather than certified from an ambiguous relative clause.
   if(quote.includes(condition))assert.equal(validateAdvisory(JSON.stringify({clauses:[answer]}),{clauses:[{citationId:'c',quote}]})[0].interpretationAvailable,false);
  }
  const answer={citationId:'c',actor:'CUSTOMER',timing:'UNSPECIFIED',condition:null,explanation:quote};assert.equal(validateAdvisory(JSON.stringify({clauses:[answer]}),{clauses:[{citationId:'c',quote}]})[0].interpretationAvailable,false);
  assert.equal(sourceInstructionProfile(quote).conditional,true);
 }
});
test('prohibited or waived external uploads require no destination snapshot, but a separate positive step does',()=>{
 for(const quote of ['Do not upload your receipt to https://example.com/recall.','Consumers should not upload the receipt to https://example.com/recall.','You are not required to register on the recall website.']){
  const source={remedies:[photo,quote]},decisions=[{id:'clause-1-0',disposition:'INFORMATION',reason:'The source explicitly prohibits or waives this action.'}];
  assert.equal(externalDependencies(source).length,0,quote);assert.doesNotThrow(()=>assertExecutableSource(source,[field(photo)],decisions));
 }
 for(const separator of ['; ', ' but ', ' and ']){
  const quote='Do not upload to https://example.com/forbidden'+separator+'register at https://example.org/required.';
  const dependencies=externalDependencies({remedies:[quote]});assert.equal(dependencies.length,1);assert.equal(dependencies[0].url,'https://example.org/required');assert.equal(sourceInstructionProfile(quote).externalAction,true,'the affirmative registration stays manual even after an excerpt is reviewed');
 }
});
test('a prohibition retains an affirmative external prerequisite introduced by a timing connector',()=>{
 for(const connector of ['until','unless','before','after']){
  const quote=`Do not use the product ${connector} you complete the instructions on https://example.com/recall.`,source={remedies:[photo,quote]},decisions=[{id:'clause-1-0',disposition:'INFORMATION',reason:'Trying to waive the affirmative prerequisite.'}];
  const dependencies=externalDependencies(source);assert.equal(dependencies.length,1,quote);assert.equal(dependencies[0].status,'UNRESOLVED');
  assert.throws(()=>assertExecutableSource(source,[field(photo)],decisions),/external instructions/);
  assert.equal(sourceInstructionProfile(quote).externalAction,true,'reviewing a snapshot does not complete the outside action');
 }
 assert.equal(externalDependencies({remedies:['Do not upload a receipt to https://example.com/before-recall.']}).length,0,'a connector inside a URL is not an affirmative prerequisite');
});
test('a date or timing modifier cannot detach an affirmative upload from its destination',()=>{
 for(const modifier of ['before September 15','after September 15','before the deadline','after the support call']){
  const quote=`Complete the form and upload one photograph ${modifier} on the recall website.`,source={remedies:[quote]},fields=[field(quote)];
  assert.equal(externalDependencies(source).length,1,quote);assert.equal(sourceInstructionProfile(quote).externalAction,true,quote);
  assert.throws(()=>assertExecutableSource(source,fields),/external instructions/);
 }
 assert.equal(externalDependencies({remedies:['Do not upload a receipt before September 15 on the recall website.']}).length,0,'a forbidden upload with a date remains forbidden');
});
