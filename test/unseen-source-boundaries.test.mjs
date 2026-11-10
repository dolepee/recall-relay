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
test('colon and dash response clauses link both selected fields without weakening the full remainder',()=>{
 for(const [quote,first,second,kind] of [
  ['Upload one photograph of the product label: enter the serial number.','Upload one photograph of the product label:','enter the serial number.','TEXT'],
  ['Upload one photograph of the product label — confirm the product serial number.','Upload one photograph of the product label —','confirm the product serial number.','CONFIRMATION'],
 ]){
  const source={remedies:[quote]},fields=[{id:'p',kind:'PHOTO',quote:first},{id:'r',kind,quote:second}];
  assert.deepEqual(sourceCoverage(source,fields)[0].missingKinds,[],quote);
  assert.doesNotThrow(()=>assertExecutableSource(source,fields),quote);
  assert.doesNotThrow(()=>assertExecutableSource(source,[{id:'p',kind:'PHOTO',quote:quote},{id:'r',kind,quote:quote}]),quote);
 }
 for(const quote of ['Upload one photograph of the product label: wug the serial number.','Upload one photograph of the product label — wug the serial number.']){
  assert.ok(sourceInstructionProfile(quote).issues.length,quote);
  assert.throws(()=>assertExecutableSource({remedies:[quote]},[{id:'p',kind:'PHOTO',quote},{id:'r',kind:'TEXT',quote}]),/manual|unsupported/i,quote);
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
test('completed and grammatically uncertain prerequisites retain external references conservatively',()=>{
 for(const prerequisite of ['you have completed the instructions','you will have completed the instructions','the instructions have been completed','you have followed the instructions','you finish reading the instructions']){
  const quote=`Do not use the product until ${prerequisite} on https://example.com/recall.`,source={remedies:[photo,quote]},decisions=[{id:'clause-1-0',disposition:'INFORMATION',reason:'Trying to waive a completed-action prerequisite.'}];
  assert.equal(externalDependencies(source).length,1,quote);assert.equal(sourceInstructionProfile(quote).externalAction,true,quote);
  assert.throws(()=>assertExecutableSource(source,[field(photo)],decisions),/external instructions/);
 }
});

test('reported residual actions, means, prerequisites and purchase cutoffs cannot publish',()=>{
 for(const quote of [
  'Submit a photograph and obtain an authorization number from the manufacturer.',
  'Submit a photograph after the replacement has arrived.',
  'Submit a photograph using the manufacturer portal.',
  'Submit a photograph for orders placed before January 2025.',
  'Submit a photograph and deliver the item to the retailer.',
 ]){
  const source={remedies:[quote]},fields=[{id:'p',kind:'PHOTO',quote}];
  assert.ok(sourceInstructionProfile(quote).issues.length>0,quote);
  assert.equal(sourceCoverage(source,fields)[0].disposition,'MANUAL',quote);
  assert.throws(()=>assertExecutableSource(source,fields),/manual|unsupported residual/i,quote);
 }
});
test('the closed response grammar still publishes the supported Relay Home and compound controls',()=>{
 const positive=[
  ['Upload one photograph of the sample label showing the product name and lot code.',['PHOTO']],
  ['Enter the lot code printed on the sample label.',['TEXT']],
  ['Confirm that this submission belongs to this claim.',['CONFIRMATION']],
  ['Upload a photograph of the label and confirm the product serial number.',['PHOTO','CONFIRMATION']],
  ['Submit a photograph of the marked cup and attest that you disposed of it.',['PHOTO','CONFIRMATION']],
  ['Submit a photograph of the marked cup and enter the serial number.',['PHOTO','TEXT']],
  ['Upload a photograph of the label provided by the manufacturer.',['PHOTO']],
  ['Upload one photograph of the return label.',['PHOTO']],
  ['Upload a photograph of the product label; return address must be legible.',['PHOTO']],
 ];
 const basePhoto='Upload one photograph of the product label.';
 for(const [quote,kinds] of positive){
  const remedies=kinds.includes('PHOTO')?[quote]:[basePhoto,quote];
  const fields=[];
  if(!kinds.includes('PHOTO'))fields.push({id:'p-photo',kind:'PHOTO',quote:basePhoto});
  for(const [i,kind] of kinds.entries())fields.push({id:`p${i}`,kind,quote});
  assert.deepEqual(sourceInstructionProfile(quote).issues,[],quote);
  assert.doesNotThrow(()=>assertExecutableSource({remedies},fields),quote);
 }
});

test('a prohibition does not become an external handoff and photographed receipt nouns stay supported',()=>{
 const photo='Upload one photograph of the product label.',source={remedies:[photo,'Do not submit photographs by email.']},fields=[{id:'p',kind:'PHOTO',quote:photo}];
 assert.equal(sourceInstructionProfile(source.remedies[1]).externalAction,false);
 assert.doesNotThrow(()=>assertExecutableSource(source,fields,[{id:'clause-1-0',disposition:'INFORMATION',reason:'The source prohibits this action.'}]));
 for(const quote of ['Upload one photograph of the shipping and return labels.','Upload one photograph of the product label and email receipt.']){
  assert.deepEqual(sourceInstructionProfile(quote).issues,[],quote);
  assert.doesNotThrow(()=>assertExecutableSource({remedies:[quote]},[{id:'p',kind:'PHOTO',quote}]),quote);
 }
});

test('supported responses after a semicolon are not treated as photograph objects',()=>{
 for(const [quote,kinds] of [
  ['Upload one photograph of the product label; enter the serial number.',['PHOTO','TEXT']],
  ['Upload one photograph of the product label; confirm the product serial number.',['PHOTO','CONFIRMATION']],
 ]){
  const fields=kinds.map((kind,i)=>({id:`p${i}`,kind,quote}));
  assert.deepEqual(sourceInstructionProfile(quote).issues,[],quote);
  assert.doesNotThrow(()=>assertExecutableSource({remedies:[quote]},fields),quote);
 }
});

test('whole-instruction timing and purchase residuals stay manual for text and confirmation segments',()=>{
 const photo='Upload one photograph of the product label.';
 for(const [quote,kinds] of [
  ['Upload one photograph of the label and confirm the lot code after contacting the manufacturer.',['PHOTO','CONFIRMATION']],
  ['Enter the lot code for orders placed before January 2025.',['TEXT']],
  ['Confirm ownership after obtaining an authorization number from the manufacturer.',['CONFIRMATION']],
 ]){
  const source=kinds.includes('PHOTO')?{remedies:[quote]}:{remedies:[photo,quote]};
  const fields=[];
  if(!kinds.includes('PHOTO'))fields.push({id:'p-photo',kind:'PHOTO',quote:photo});
  for(const [i,kind] of kinds.entries())fields.push({id:`p${i}`,kind,quote});
  assert.ok(sourceInstructionProfile(quote).issues.length>0,quote);
  assert.throws(()=>assertExecutableSource(source,fields),/manual|unsupported residual|residual/i,quote);
 }
});

test('a no-response remedy timing cutoff also survives INFORMATION',()=>{
 const photo='Upload one photograph of the product label.';
 const timing='Refunds will be issued after January2025.';
 const source={remedies:[photo,timing]};
 const decisions=[{id:'clause-1-0',disposition:'INFORMATION',reason:'The refund sentence describes settlement timing.'}];
 assert.equal(sourceInstructionProfile(timing).kinds.length,0);
 assert.ok(sourceInstructionProfile(timing).issues.some(issue=>/eligibility|cutoff|timing/i.test(issue)));
 assert.equal(sourceCoverage(source,[field(photo)],decisions)[1].disposition,'MANUAL');
 assert.throws(()=>assertExecutableSource(source,[field(photo)],decisions),/manual|eligibility|cutoff|timing/i);
});

test('a bare purchases phrase does not create a remedy constraint',()=>{
 const photo='Upload one photograph of the product label.';
 const refund='Refunds for purchases of the recalled product will be issued to the original form of payment.';
 const source={remedies:[photo,refund]};
 const fields=[field(photo)];
 const decisions=[{id:'clause-1-0',disposition:'INFORMATION',reason:'The refund sentence describes settlement, not a customer response.'}];
 const profile=sourceInstructionProfile(refund);
 assert.equal(profile.kinds.length,0);
 assert.equal(profile.purchaseApplicability,false);
 assert.equal(sourceCoverage(source,fields,decisions)[1].disposition,'INFORMATION');
 assert.doesNotThrow(()=>assertExecutableSource(source,fields,decisions));
});

test('a purchase cutoff survives a no-response sentence and an INFORMATION decision',()=>{
 const photo='Upload one photograph of the product label.';
 const refund='Refunds will be issued to the original form of payment for orders placed before January2025.';
 const source={remedies:[photo,refund]};
 const fields=[field(photo)];
 const decisions=[{id:'clause-1-0',disposition:'INFORMATION',reason:'The refund sentence describes settlement, not a customer response.'}];
 const profile=sourceInstructionProfile(refund);
 assert.equal(profile.kinds.length,0);
 assert.equal(profile.purchaseApplicability,true);
 assert.ok(profile.issues.some(issue=>/eligibility|cutoff/i.test(issue)));
 const coverage=sourceCoverage(source,fields,decisions);
 assert.equal(coverage[1].disposition,'MANUAL');
 assert.match(coverage[1].reason,/eligibility|cutoff/i);
 assert.throws(()=>assertExecutableSource(source,fields,decisions),/manual|eligibility|cutoff/i);
});

test('incoming notifications are informational, not customer evidence handoffs',()=>{
 const photo='Upload one photograph of the product label.';
 const fields=[field(photo)];
 for(const receive of [
  'You will receive a confirmation by email.',
  'The manufacturer will send a confirmation by email.',
  'You will receive an email confirmation via the portal.',
 ]){
  const source={remedies:[photo,receive]};
  const decisions=[{id:'clause-1-0',disposition:'INFORMATION',reason:'The confirmation is a business notification, not a customer response.'}];
  const profile=sourceInstructionProfile(receive);
  assert.equal(profile.externalAction,false,receive);
  assert.equal(sourceCoverage(source,fields,decisions)[1].disposition,'INFORMATION',receive);
  assert.doesNotThrow(()=>assertExecutableSource(source,fields,decisions),receive);
 }
 for(const quote of [
  'You will receive a confirmation by email, then submit a photograph by email.',
  'You will receive a confirmation by email and send a photograph by email.',
  'The manufacturer will send a confirmation by email, then submit a photograph by email.',
 ]){
  assert.equal(sourceInstructionProfile(quote).externalAction,true,quote);
  assert.throws(()=>assertExecutableSource({remedies:[photo,quote]},[field(photo)]),/manual|handoff|external/i,quote);
 }
});

test('form-completion prefixes and quoted markings remain supported',()=>{
 for(const quote of [
  'Complete the form and upload one photograph of the product label.',
  'Fill out an online form and upload one photograph of the product label.',
  'Upload one photograph of the product label marked "RECALL".',
  'Upload one photograph of the product label marked “RECALL”.',
 ]){
  assert.deepEqual(sourceInstructionProfile(quote).issues,[],quote);
  assert.doesNotThrow(()=>assertExecutableSource({remedies:[quote]},[field(quote)]),quote);
 }
 for(const quote of [
  'Complete the form and upload one photograph of the product label marked "WUG".',
  'Upload one photograph of the product label marked "RECALL" and wug the lot code.',
  'Complete the form and upload one photograph of the product label on the recall website.',
 ]){
  assert.ok(sourceInstructionProfile(quote).issues.length>0,quote);
  assert.throws(()=>assertExecutableSource({remedies:[quote]},[field(quote)]),/manual|unsupported|external|handoff/i,quote);
 }
});

test('the complete response parser rejects no-timing extra actions and keeps positive controls',()=>{
 const photo='Upload one photograph of the product label.';
 for(const quote of [
  'Enter the lot code and obtain an authorization number from the manufacturer.',
  'Confirm ownership and deliver the product to the retailer.',
  'Submit a photograph and obtain an authorization number from the manufacturer.',
  'Upload a photograph of the label and confirm the lot code using the manufacturer portal.',
  'Enter the lot code after the manufacturer confirms the order.',
 ]){
  const source={remedies:[photo,quote]};
  assert.ok(sourceInstructionProfile(quote).issues.length>0,quote);
  assert.throws(()=>assertExecutableSource(source,[field(photo)]),/manual|unsupported|residual/i,quote);
 }
 for(const [quote,kinds] of [
  ['Upload one photograph of the product label and confirm the lot code.',['PHOTO','CONFIRMATION']],
  ['Upload one photograph of the product label; enter the serial number.',['PHOTO','TEXT']],
 ]){
  const fields=kinds.map((kind,i)=>({id:`p${i}`,kind,quote}));
  assert.deepEqual(sourceInstructionProfile(quote).issues,[],quote);
  assert.doesNotThrow(()=>assertExecutableSource({remedies:[quote]},fields),quote);
 }
});

test('text and confirmation responses cannot smuggle a physical handoff after the response',()=>{
 const photo='Upload one photograph of the product label.';
 for(const quote of [
  'Enter the lot code and return the item to the retailer.',
  'Enter the lot code and returning the item to the retailer.',
  'Confirm ownership and surrender the product.',
  'Confirm ownership and surrendering the product.',
  'Confirm ownership and hand over the product.',
  'Confirm ownership and take the product to the retailer.',
 ]){
  const source={remedies:[photo,quote]};
  const profile=sourceInstructionProfile(quote);
  assert.ok(profile.issues.length>0,quote);
  const fields=[{id:'p',kind:'PHOTO',quote:photo},...profile.kinds.map((kind,i)=>({id:`k${i}`,kind,quote}))];
  assert.equal(sourceCoverage(source,fields)[1].disposition,'MANUAL',quote);
  assert.throws(()=>assertExecutableSource(source,fields),/manual|handoff|unsupported/i,quote);
 }
});

test('ambiguous provide and send choose their kind from the parsed object',()=>{
 assert.deepEqual(sourceInstructionProfile('Provide the serial number.').kinds,['TEXT']);
 assert.deepEqual(sourceInstructionProfile('Send the serial number.').kinds,['TEXT']);
 assert.deepEqual(sourceInstructionProfile('Provide a photograph of the product label.').kinds,['PHOTO']);
 assert.deepEqual(sourceInstructionProfile('Send a photograph of the product label.').kinds,['PHOTO']);
});

test('every known-positive text, confirmation and compound segment consumes unknown tokens',()=>{
 const positives=[
  ['Upload one photograph of the product label.','Upload one glorp photograph of the product label.','Upload one photograph of the product label wug.'],
  ['Provide the serial number.','Provide the glorp serial number.','Provide the serial number wug.'],
  ['Enter the lot code printed on the sample label.','Enter the glorp lot code printed on the sample label.','Enter the lot code printed on the sample label wug.'],
  ['Confirm the product serial number.','Confirm the glorp product serial number.','Confirm the product serial number wug.'],
  ['Confirm that this submission belongs to this claim.','Confirm that this glorp submission belongs to this claim.','Confirm that this submission belongs to this claim wug.'],
  ['Attest that you disposed of it.','Attest that you glorp disposed of it.','Attest that you disposed of it wug.'],
  ['Upload one photograph of the product label and confirm the product serial number.','Upload one photograph of the product label and confirm the glorp product serial number.','Upload one photograph of the product label and confirm the product serial number wug.'],
  ['Upload one photograph of the product label; enter the serial number.','Upload one photograph of the product label; enter the glorp serial number.','Upload one photograph of the product label; enter the serial number wug.'],
  ['Upload one photograph of the product label: enter the serial number.','Upload one photograph of the product label: enter the glorp serial number.','Upload one photograph of the product label: enter the serial number wug.'],
  ['Upload one photograph of the product label — confirm the product serial number.','Upload one photograph of the product label — confirm the glorp product serial number.','Upload one photograph of the product label — confirm the product serial number wug.'],
 ];
 for(const [positive,unknownObject,unknownTail] of positives){
  for(const quote of [unknownObject,unknownTail]){
   const profile=sourceInstructionProfile(quote);
   assert.ok(profile.issues.length>0,quote);
   const kinds=profile.kinds;
   const fields=[];
   if(!kinds.includes('PHOTO'))fields.push({id:'base-photo',kind:'PHOTO',quote:'Upload one photograph of the product label.'});
   for(const [i,kind] of kinds.entries())fields.push({id:`f${i}`,kind,quote});
   assert.equal(sourceCoverage({remedies:[positive,quote]},fields)[1].disposition,'MANUAL',quote);
   assert.throws(()=>assertExecutableSource({remedies:[positive,quote]},fields),/manual|unsupported|object/i,quote);
  }
 }
});

test('supported responses after colons and dashes publish as compound controls',()=>{
 for(const [quote,kinds] of [
  ['Upload one photograph of the product label: enter the serial number.',['PHOTO','TEXT']],
  ['Upload one photograph of the product label — confirm the product serial number.',['PHOTO','CONFIRMATION']],
 ]){
  const fields=kinds.map((kind,i)=>({id:`p${i}`,kind,quote}));
  assert.deepEqual(sourceInstructionProfile(quote).issues,[],quote);
  assert.doesNotThrow(()=>assertExecutableSource({remedies:[quote]},fields),quote);
 }
});

test('pure coordinated prohibitions remain information and tell-us consumes its pronoun',()=>{
 const photo='Upload one photograph of the product label.';
 for(const quote of ['Do not return the product and its packaging.','Do not return the product and do not contact the retailer.','Do not return the product; never contact the retailer.']){
  const source={remedies:[photo,quote]},decisions=[{id:'clause-1-0',disposition:'INFORMATION',reason:'Pure prohibition; no customer action requested.'}];
  assert.equal(sourceInstructionProfile(quote).parser.issue,null,quote);
  assert.equal(sourceCoverage(source,[{id:'p',kind:'PHOTO',quote:photo}],decisions)[1].disposition,'INFORMATION',quote);
  assert.doesNotThrow(()=>assertExecutableSource(source,[{id:'p',kind:'PHOTO',quote:photo}],decisions),quote);
 }
 const tells=['Tell us the serial number.','Upload one photograph of the label: tell us the serial number.'];
 for(const tell of tells){
  assert.deepEqual(sourceInstructionProfile(tell).issues,[],tell);
  const fields=tell.startsWith('Upload')
   ? [{id:'p',kind:'PHOTO',quote:'Upload one photograph of the label:'},{id:'t',kind:'TEXT',quote:'tell us the serial number.'}]
   : [{id:'p',kind:'PHOTO',quote:photo},{id:'t',kind:'TEXT',quote:tell}];
  assert.doesNotThrow(()=>assertExecutableSource({remedies:tell.startsWith('Upload')?[tell]:[photo,tell]},fields),tell);
 }
 const glorp='Tell us the glorp serial number.';
 assert.ok(sourceInstructionProfile(glorp).issues.length,glorp);
 assert.throws(()=>assertExecutableSource({remedies:[photo,glorp]},[
  {id:'p',kind:'PHOTO',quote:photo},{id:'t',kind:'TEXT',quote:glorp},
 ]),/manual|unsupported/i,glorp);
 for(const quote of [
  'Do not return the product and wug the packaging.',
  'Do not return the product and contact the retailer.',
  'Do not return the product and its packaging; wug the lot code.',
  'Do not return the product and do not contact the retailer; wug the lot code.',
  'Do not return the product and its wug packaging.',
 ]){
  assert.ok(sourceInstructionProfile(quote).parser.issue,quote);
  assert.equal(sourceCoverage({remedies:[photo,quote]},[{id:'p',kind:'PHOTO',quote:photo}],
   [{id:'clause-1-0',disposition:'INFORMATION',reason:'Cannot waive an affirmative tail.'}])[1].disposition,'MANUAL',quote);
  assert.throws(()=>assertExecutableSource({remedies:[photo,quote]},[{id:'p',kind:'PHOTO',quote:photo}],
   [{id:'clause-1-0',disposition:'INFORMATION',reason:'Cannot waive an affirmative tail.'}]),/manual|prohibition/i,quote);
 }
});

test('the independent 28-case closed-grammar contract passes as a synthetic check',()=>{
 const positive=[
  ['PHOTO','Upload one photograph of the product label.'],
  ['TEXT','Enter the lot code printed on the sample label.'],
  ['TEXT','Provide the serial number.'],
  ['TEXT','Send the serial number.'],
  ['CONFIRMATION','Confirm that this submission belongs to this claim.'],
  ['CONFIRMATION','Attest that you disposed of it.'],
  ['PHOTO+TEXT','Upload one photograph of the label; enter the serial number.'],
  ['PHOTO+CONFIRMATION','Upload one photograph of the label and confirm the lot code.'],
  ['PHOTO','Upload one photograph of the shipping and return labels.'],
  ['PHOTO','Upload one photograph of the product label and email receipt.'],
 ];
 const publishes=(quote,kinds)=>{
  const remedies=[quote],fields=kinds.map((kind,i)=>({id:`f${i}`,kind,quote}));
  if(!kinds.includes('PHOTO')){remedies.push('Upload one photograph of the product label.');fields.push({id:'p',kind:'PHOTO',quote:remedies.at(-1)});}
  try{assertExecutableSource({remedies},fields);return true;}catch{return false;}
 };
 for(const [kinds,quote] of positive){
  const split=kinds.split('+');
  assert.deepEqual(sourceInstructionProfile(quote).issues,[],quote);
  assert.equal(publishes(quote,split),true,quote);
  const tail=quote.replace(/\.$/,'')+' and wug.';
  assert.ok(sourceInstructionProfile(tail).issues.length>0,tail);
  assert.equal(publishes(tail,split),false,tail);
 }
 for(const [kinds,quote] of [
  ['TEXT','Enter the glorp lot code.'],
  ['CONFIRMATION','Confirm glorp ownership.'],
  ['PHOTO','Upload one glorp photo of the label.'],
  ['PHOTO+TEXT','Upload one photograph of the label and enter the glorp lot code.'],
  ['TEXT','Enter the lot code and surrender the item to the retailer.'],
  ['CONFIRMATION','Confirm ownership and remit the item to the retailer.'],
  ['TEXT','Provide the serial number to the retailer.'],
  ['PHOTO','Submit a photograph to the manufacturer.'],
 ]){
  const split=kinds.split('+');
  assert.ok(sourceInstructionProfile(quote).issues.length>0,quote);
  assert.equal(publishes(quote,split),false,quote);
 }
});

test('response-specific relations, prohibition parsing and parser consumption are explicit',()=>{
 for(const quote of [
  'Provide the serial number to the manufacturer.',
  'Submit a photograph to the manufacturer.',
  'Provide the serial number to the retailer.',
 ]){
  assert.ok(sourceInstructionProfile(quote).issues.length>0,quote);
  const kinds=sourceInstructionProfile(quote).kinds;
  const fields=[];
  if(!kinds.includes('PHOTO'))fields.push({id:'p',kind:'PHOTO',quote:'Upload one photograph of the product label.'});
  for(const [i,kind] of kinds.entries())fields.push({id:`f${i}`,kind,quote});
  assert.throws(()=>assertExecutableSource({remedies:[quote,'Upload one photograph of the product label.']},fields),/manual|unsupported|object/i,quote);
 }
 assert.deepEqual(sourceInstructionProfile('Upload a photograph of the label provided by the manufacturer.').issues,[]);
 const mixed=sourceInstructionProfile('Do not upload a photograph; enter the lot code.');
 assert.ok(mixed.parser.segments.some(segment=>segment.kind==='TEXT'),'a later affirmative response is not swallowed');
 assert.equal(sourceInstructionProfile('Do not submit photographs by email.').parser.segments.length,0);
 const unknown=sourceInstructionProfile('Enter the glorp lot code.');
 assert.match(unknown.parser.remainder,/glorp/);
 assert.equal(unknown.parser.consumed,'Enter');
 const script=sourceInstructionProfile('Enter the lot code 序列号.');
 assert.match(script.parser.issue,/unsupported character|script/i);
 const ok=sourceInstructionProfile('Provide the serial number.');
 assert.equal(ok.parser.remainder,'');
 assert.ok(ok.parser.segments.length);
});

test('phone relations, unknown scripts and unparsed mandatory instructions stay manual',()=>{
 const photo='Upload one photograph of the product label.';
 for(const [quote,issue] of [
  ['Provide the serial number by phone.',/unsupported word|manual/i],
  ['Enter the lot code请联系厂家.',/unsupported character|script|manual/i],
  ['Consumers must furnish the lot code.',/mandatory|manual/i],
  ['Do not upload a photograph; consumers must furnish the lot code.',/mandatory|manual/i],
  ['Do not submit photographs by email; consumers must furnish the lot code.',/mandatory|manual/i],
  ['Do not upload a photograph; wug the lot code.',/prohibition|unsupported|manual/i],
 ]){
  const profile=sourceInstructionProfile(quote);
  assert.ok(profile.issues.length>0,quote);
  assert.match(profile.issues.join(' '),issue,quote);
  const kinds=profile.kinds;
  const fields=[];
  if(!kinds.includes('PHOTO'))fields.push({id:'p',kind:'PHOTO',quote:photo});
  for(const [i,kind] of kinds.entries())fields.push({id:`f${i}`,kind,quote});
  assert.equal(sourceCoverage({remedies:[photo,quote]},fields,[{id:'clause-1-0',disposition:'INFORMATION',reason:'Cannot waive this instruction.'}])[1].disposition,'MANUAL',quote);
  assert.throws(()=>assertExecutableSource({remedies:[photo,quote]},fields,[{id:'clause-1-0',disposition:'INFORMATION',reason:'Cannot waive this instruction.'}]),/manual|unsupported|mandatory/i,quote);
 }
 assert.doesNotThrow(()=>assertExecutableSource({remedies:['Provide the serial number.','Upload one photograph of the product label.']},[{id:'t',kind:'TEXT',quote:'Provide the serial number.'},{id:'p',kind:'PHOTO',quote:'Upload one photograph of the product label.'}]));
});

test('a modified photograph noun stays inside its response segment',()=>{
 const photo='Upload one photograph of the product label.';
 for(const quote of ['Upload one clear photograph of the product label.','Upload a digital photograph of the product label.']){
  assert.deepEqual(sourceInstructionProfile(quote).issues,[],quote);
  assert.doesNotThrow(()=>assertExecutableSource({remedies:[quote]},[{id:'p',kind:'PHOTO',quote}]),quote);
  const compound=`${quote.replace(/\.$/,'')} and enter the serial number.`;
  assert.equal(sourceInstructionProfile(compound).parser.segments.length,2,compound);
  assert.doesNotThrow(()=>assertExecutableSource({remedies:[compound]},[{id:'p',kind:'PHOTO',quote:compound},{id:'t',kind:'TEXT',quote:compound}]),compound);
 }
 // A real second photograph action still starts its own segment and stays manual.
 const second='Upload one photograph of the product label and photograph the serial number.';
 assert.throws(()=>assertExecutableSource({remedies:[second]},[{id:'p',kind:'PHOTO',quote:second}]),/manual/i);
 assert.equal(sourceInstructionProfile(photo).parser.segments.length,1);
});
