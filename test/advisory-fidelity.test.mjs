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
