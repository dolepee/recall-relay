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
