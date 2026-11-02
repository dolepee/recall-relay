import test from 'node:test';
import assert from 'node:assert/strict';
import {ClaimDesk} from '../src/claims.mjs';
import {SourceWorkspace,validateSourceSuggestion,validateManualField} from '../src/source-workspace.mjs';
import {validateImageBytes} from '../src/image-validation.mjs';
const source={title:'Test',recallNumber:'27026',products:[{name:'Fixture'}],sourceUrl:'https://www.cpsc.gov/Recalls/2026/Test',sourceDigest:'a'.repeat(64),route:'ORIGINAL_PAYMENT_CANDIDATE',remedies:['Upload a photograph of the label.','Confirm the disposal commitment.']};
const publish=(ws,row,desk)=>ws.activate(row.id,{revision:row.revision,sku:'TEST',lot:'LOT-A',confirmed:true},desk);
const inert=()=>new ClaimDesk({provider:async()=>{throw Error('No payment transport');}});
test('omitted obligations remain unresolved and block publication until added',async()=>{
 const desk=inert();try{
 const ws=new SourceWorkspace(desk.db,{loadSource:async()=>source});
 let row=await ws.import('27026');row=ws.addField(row.id,{revision:row.revision,kind:'PHOTO',quote:source.remedies[0]});
 row=ws.review(row.id,{revision:row.revision,fieldIds:row.suggestion.requirements.map(f=>f.id),confirmed:true});
 assert.equal(row.review.coverage[1].disposition,'UNRESOLVED');assert.throws(()=>publish(ws,row,desk),/every source/);
 row=ws.addField(row.id,{revision:row.revision,kind:'CONFIRMATION',quote:source.remedies[1]});
 row=ws.review(row.id,{revision:row.revision,fieldIds:row.suggestion.requirements.map(f=>f.id),confirmed:true});
 assert(publish(ws,row,desk).publishedCampaign);
 }finally{desk.close();}
});
test('manual clauses block publication; conditional fields never become unconditional forms',async()=>{
 const desk=inert();try{
 const quote='If the label is unreadable, provide the serial number printed on the base.';
 const ws=new SourceWorkspace(desk.db,{loadSource:async()=>({...source,remedies:[source.remedies[0],quote]})});
 let row=await ws.import('27026');row=ws.addField(row.id,{revision:row.revision,kind:'PHOTO',quote:source.remedies[0]});
 row=ws.review(row.id,{revision:row.revision,fieldIds:row.suggestion.requirements.map(f=>f.id),confirmed:true,clauseDecisions:[{id:'clause-1-0',disposition:'MANUAL',reason:'Conditional serial collection needs separate handling.'}]});
 assert.throws(()=>publish(ws,row,desk),/every source/);
 row=ws.addField(row.id,{revision:row.revision,kind:'TEXT',quote});row=ws.review(row.id,{revision:row.revision,fieldIds:row.suggestion.requirements.map(f=>f.id),confirmed:true});
 assert.throws(()=>publish(ws,row,desk),/Conditional/);
 assert.equal(validateManualField({kind:'TEXT',quote:'provide the serial number printed on the base.'},{remedies:[quote]}).quote,quote);
 }finally{desk.close();}
});
test('negated evidence and confirmation notifications are filtered',()=>{
 for(const [kind,quote] of [['PHOTO','A photograph is not required to request this refund.'],['TEXT','Do not provide your account number.'],['CONFIRMATION','A confirmation email will be sent after processing.']])
 assert.equal(validateSourceSuggestion(JSON.stringify({requirements:[{kind,quote}]}),{remedies:[quote]}).requirements.length,0);
});
test('six authentication failures reuse one checkout slot without dispatch',async()=>{
 let calls=0;const desk=new ClaimDesk({provider:async()=>{calls++;throw Error('Authentication unavailable');}});
 try{desk.publish(true);for(let i=0;i<6;i++)await assert.rejects(desk.createCheckout());assert.equal(desk.merchantState().checkouts.length,1);assert.equal(calls,6);}finally{desk.close();}
});
test('lost order responses reuse identical payload and expired ambiguity never dispatches',async()=>{
 let clock=Date.now(),inputs=[];const desk=new ClaimDesk({now:()=>new Date(clock).toISOString(),provider:async()=>({createOrder:async input=>{inputs.push(input);throw Error('Lost response');}})});
 try{desk.publish(true);await assert.rejects(desk.createCheckout());const id=desk.merchantState().checkouts[0].id;
 await assert.rejects(desk.resumeCheckout(id));assert.deepEqual(inputs[0],inputs[1]);assert.equal(desk.merchantState().checkouts.length,1);
 clock+=6*3600000;await assert.rejects(desk.resumeCheckout(id),/safe retry window/);assert.equal(inputs.length,2);
 }finally{desk.close();}
});
test('concurrent create cannot dispatch another request while authentication is pending',async()=>{
 let release;const desk=new ClaimDesk({provider:()=>new Promise(resolve=>{release=resolve;})});
 try{desk.publish(true);const pending=desk.createCheckout();await assert.rejects(desk.createCheckout(),/in progress/);release({createOrder:async()=>({id:'TEST',links:[{rel:'approve',href:'https://www.sandbox.paypal.com/checkoutnow?token=TEST'}]})});await pending;assert.equal(desk.merchantState().checkouts.length,1);}finally{desk.close();}
});
test('bounded image decoding rejects signatures without pixels and excessive dimensions',()=>{
 const malformed=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(12)]);assert.throws(()=>validateImageBytes(malformed,'png'),/decoded safely/);
 const valid=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD\/c8LaHIAAAAASUVORK5CYII=','base64');
 assert.doesNotThrow(()=>validateImageBytes(valid,'png'));
 const huge=Buffer.from(valid);huge.writeUInt32BE(100000,16);assert.throws(()=>validateImageBytes(huge,'png'),/decoded safely/);
 const interlaced=Buffer.from(valid);interlaced[28]=1;assert.throws(()=>validateImageBytes(interlaced,'png'),/decoded safely/);
 assert.throws(()=>validateImageBytes(Buffer.from([255,216,0,0,255,217]),'jpeg'),/decoded safely/);
});
