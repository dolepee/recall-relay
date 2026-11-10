import test from 'node:test';import assert from 'node:assert/strict';import {validateAdvisory} from '../src/case-advisory.mjs';
const run=(quote,changes)=>validateAdvisory(JSON.stringify({clauses:[{citationId:'c',actor:'CUSTOMER',timing:'UNSPECIFIED',condition:null,explanation:quote,...changes}]}),{clauses:[{citationId:'c',quote}]}).at(0);
test('advisory withholds wrong actor, invented sequence, missing full condition and strengthened modality',()=>{
 assert.equal(run('The manufacturer must issue a refund.',{actor:'CUSTOMER'}).interpretationAvailable,false);
 assert.equal(run('Consumers should upload a photograph.',{timing:'AFTER_ACTION'}).interpretationAvailable,false);
 assert.equal(run('If the label is unreadable, provide the serial number.',{timing:'CONDITIONAL',condition:null}).interpretationAvailable,false);
 assert.equal(run('Consumers may return the product.',{explanation:'Consumers return the product.'}).interpretationAvailable,false);
 assert.equal(run('Do not dispose of the battery.',{explanation:'Do not dispose of the battery until you receive a refund.'}).interpretationAvailable,false);
 assert.equal(run('Consumers must wait 14 days.',{explanation:'Consumers must wait.'}).interpretationAvailable,false);
});
test('complete supported condition and explicitly uncertain actor can survive without payment authority',()=>{
 const r=run('If the label is unreadable, provide the serial number.',{timing:'CONDITIONAL',condition:'If the label is unreadable'});assert.equal(r.interpretationAvailable,true);assert.equal(r.quote,'If the label is unreadable, provide the serial number.');assert.equal(r.actor,'CUSTOMER');
 const passive=run('A refund will be issued.',{actor:'UNKNOWN'});assert.equal(passive.interpretationAvailable,true);
});

test('inverted negation, object, actor and condition explanations are withheld',()=>{
 const cases=[
  ['Consumers should unplug the unit.','Consumers should not unplug the unit.',{actor:'CUSTOMER'}],
  ['The manufacturer will issue a refund.','The manufacturer will not issue a refund.',{actor:'MANUFACTURER'}],
  ['Provide the serial number.','Provide the order number.',{actor:'CUSTOMER'}],
  ['If the label is unreadable, provide the serial number.','If the label is readable, provide the serial number.',{actor:'CUSTOMER',timing:'CONDITIONAL',condition:'If the label is unreadable'}],
  ['The manufacturer will issue a refund.','Customers will receive a refund.',{actor:'MANUFACTURER'}],
 ];
 for(const [quote,explanation,changes] of cases)assert.equal(run(quote,{...changes,explanation}).interpretationAvailable,false,quote);
});

test('inverted outcome verbs and extra identifiers are withheld while supported paraphrases survive',()=>{
 assert.equal(run('The manufacturer will issue a refund.',{actor:'MANUFACTURER',explanation:'The manufacturer will decline a refund.'}).interpretationAvailable,false);
 assert.equal(run('The manufacturer will issue a refund.',{actor:'MANUFACTURER',explanation:'The manufacturer will provide a refund.'}).interpretationAvailable,true);
 assert.equal(run('Provide the serial number.',{actor:'CUSTOMER',explanation:'Ignore the serial number and provide the order number.'}).interpretationAvailable,false);
 assert.equal(run('Provide the serial number.',{actor:'CUSTOMER',explanation:'Provide the order number.'}).interpretationAvailable,false);
 assert.equal(run('Provide the serial number.',{actor:'CUSTOMER',explanation:'Provide the serial number.'}).interpretationAvailable,true);
});
