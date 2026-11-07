import test from 'node:test';import assert from 'node:assert/strict';
import {sourceInstructionProfile,sourceCoverage,assertExecutableSource,assertExecutableCampaign} from '../src/source-policy.mjs';
import {externalDependencies} from '../src/external-sources.mjs';
import {validateAdvisory} from '../src/case-advisory.mjs';
const photo='Upload a photograph of the product label.',field={id:'p',kind:'PHOTO',quote:photo};
test('provided-you purchase conditions cannot become unconditional photo instructions',()=>{
 const quote='Upload a photograph of the label provided you purchased it before October 1.',source={remedies:[quote]},fields=[{...field,quote}];
 assert.equal(sourceInstructionProfile(quote).applicability,'UNSUPPORTED');assert.equal(sourceCoverage(source,fields)[0].disposition,'MANUAL');assert.throws(()=>assertExecutableSource(source,fields),/manual|Conditional/);
});
test('an explicit purchase condition without a form response cannot be waived as information',()=>{
 const source={remedies:[photo,'Refunds are available provided you purchased it before October 1.']},decisions=[{id:'clause-1-0',disposition:'INFORMATION',reason:'Information only, no response requested.'}];
 assert.equal(sourceCoverage(source,[field],decisions)[1].disposition,'MANUAL');assert.throws(()=>assertExecutableSource(source,[field],decisions),/manual/);
});
for(const quote of ['Visit https://example.com/recall to obtain a claim number.','To get a claim number, go to the firm’s website.','Consumers must register on the recall website for a claim number.','Obtain a claim number at WWW.EXAMPLE.COM/recall before submitting evidence.'])test('external claim prerequisite stays unresolved: '+quote,()=>{
 const source={remedies:[photo,quote]},dependencies=externalDependencies(source);assert.equal(dependencies.length,1);assert.equal(dependencies[0].status,'UNRESOLVED');assert.throws(()=>assertExecutableSource(source,[field],[{id:'clause-1-0',disposition:'INFORMATION',reason:'Trying to waive the prerequisite.'}]),/external instructions/);
 if(quote.includes('WWW.'))assert.equal(dependencies[0].url,'https://WWW.EXAMPLE.COM/recall');
});
test('an attached excerpt cannot hide an offsite claim-number prerequisite',()=>{
 const source={rootRemedies:['Follow the instructions on https://example.com/recall.'],remedies:[photo],externalSnapshots:[{dependencyId:'external-0-0',digest:'fixture',text:'Visit https://example.com/claim-number to get a claim number.'}]};assert.ok(externalDependencies(source).some(d=>d.id.startsWith('nested-')&&d.status==='UNRESOLVED'));
});
test('advisory cannot call a provided-you condition a simple before-action sequence',()=>{
 const quote='Upload a photograph of the label provided you purchased it before October 1.',value={citationId:'c',actor:'CUSTOMER',timing:'BEFORE_ACTION',condition:null,explanation:quote};const result=validateAdvisory(JSON.stringify({clauses:[value]}),{clauses:[{citationId:'c',quote}]});assert.equal(result[0].interpretationAvailable,false);
});
test('a supplied label and a passive contact link do not by themselves create new prerequisites',()=>{
 assert.equal(sourceInstructionProfile('Upload a photograph of the label provided by the manufacturer.').applicability,'UNCONDITIONAL');assert.equal(externalDependencies({remedies:['More information is available at https://example.com.']}).length,0);
});
test('previously published version-three source policies require a fresh review before new execution',()=>{
 assert.throws(()=>assertExecutableCampaign({sourceDigest:'fixture',sourcePolicyVersion:3,sourceRemedies:[photo],fields:[field]}),/Review and republish/);
});

for(const quote of ['Consumers should return the recalled product to the store for a refund.','Consumers should contact the manufacturer for a refund.','Reply to the confirmation email with the required photograph attached.','Consumers should register for the recall before submitting a photograph.','Consumers should email a photograph of the product to recall@example.com.','Upload one photograph to recall@example.com.','Consumers will be asked to upload a photograph to recall@example.com.','Please return the recalled product to the store.','Ship the unit using the prepaid label.'])test('an external handoff cannot be waived as information: '+quote,()=>{
 const source={remedies:[photo,quote]},decisions=[{id:'clause-1-0',disposition:'INFORMATION',reason:'Trying to waive the external handoff.'}];
 assert.equal(sourceCoverage(source,[field],decisions)[1].disposition,'MANUAL');assert.throws(()=>assertExecutableSource(source,[field],decisions),/manual|handoff/);
 if(/photograph|photo/i.test(quote))assert.throws(()=>assertExecutableSource({remedies:[quote]},[{...field,quote}],[]),/manual|handoff/);
});
test('stop-use advice and prohibitions do not create a required external handoff',()=>{
 for(const quote of ['Consumers should stop using the product immediately.','Do not return the product to the store.','Do not email personal information to recall@example.com.','Consumers should not return the product to the store.','The manufacturer will contact the customer about the refund.'])assert.equal(sourceInstructionProfile(quote).externalAction,false);
});
test('version-four source publications need fresh review after external handoff checks change',()=>{
 assert.throws(()=>assertExecutableCampaign({sourceDigest:'fixture',sourcePolicyVersion:4,sourceRemedies:[photo],fields:[field]}),/Review and republish/);
});

for(const quote of ['Consumers are not required to return the product to the store.','Consumers will receive a prepaid return label from the manufacturer.','Consumers will be provided with a return label.','Consumers do not need to register for the recall.'])test('informational or waived customer handoffs remain reviewable as information: '+quote,()=>{
 const source={remedies:[photo,quote]},decisions=[{id:'clause-1-0',disposition:'INFORMATION',reason:'Describes a waived step or receiving a label, not a customer handoff.'}];assert.equal(sourceInstructionProfile(quote).externalAction,false);assert.equal(sourceCoverage(source,[field],decisions)[1].disposition,'INFORMATION');assert.doesNotThrow(()=>assertExecutableSource(source,[field],decisions));
});

for(const quote of ['Upload one photograph of the return label.','Upload one photograph of the e-mail receipt.','Upload one photograph of the registration card.'])test('a handoff noun in a photograph instruction is not itself an external action: '+quote,()=>{
 assert.equal(sourceInstructionProfile(quote).externalAction,false);assert.doesNotThrow(()=>assertExecutableSource({remedies:[quote]},[{...field,quote}],[]));
});
