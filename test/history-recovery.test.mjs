import {externalDependencies} from '../src/external-sources.mjs';
import {providerCart} from '../src/checkout-cart.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ClaimDesk} from '../src/claims.mjs';
import {SourceWorkspace} from '../src/source-workspace.mjs';
import {syncTransaction} from '../src/transaction.mjs';
import {assertExecutableSource} from '../src/source-policy.mjs';
const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=';
async function fixture(){
 let cart,reference,refunds=0;const capture={id:'CAPTURE',status:'COMPLETED',amount:{currency_code:'USD',value:'59.99'},create_time:new Date().toISOString()};
 const provider={createOrder:async input=>{reference=input.referenceId;cart=input.cart;return {id:'ORDER',links:[{rel:'approve',href:'https://www.sandbox.paypal.com/checkoutnow?token=ORDER'}]};},orderDetails:async()=>({id:'ORDER',status:'COMPLETED',purchase_units:[{reference_id:reference,...providerCart(cart),payee:{merchant_id:'MERCHANT'},payments:{captures:[capture]}}]}),captureDetails:async()=>capture,refund:async()=>{refunds++;throw new Error('Lost response');},verifiedRefund:async(row,id)=>({id,status:'COMPLETED',amount:{currency_code:'USD',value:'25.99'},invoice_id:'rr-'+row.request_id})};
 const desk=new ClaimDesk({provider:async()=>provider});desk.publish(true);const item=await desk.captureCheckout((await desk.createCheckout()).id),access=item.claimUrl.split('#')[1];
 desk.submit(access,{revision:0,lot:'LOT-A',acknowledged:true,photo});const reviewed=desk.review(item.id,{revision:1,confirmed:true});return {desk,provider,item,access,reviewed,refunds:()=>refunds};
}
test('nested mutations and retained snapshots roll back as one unit',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE sample(id INTEGER)');
 assert.throws(()=>syncTransaction(db,()=>{db.prepare('INSERT INTO sample VALUES (1)').run();syncTransaction(db,()=>db.prepare('INSERT INTO sample VALUES (2)').run());throw new Error('rollback');}));assert.equal(db.prepare('SELECT count(*) n FROM sample').get().n,0);db.close();
});
test('corrections retain old evidence without exporting the bearer secret or granting review authority',async()=>{
 const s=await fixture();try{
 s.desk.requestChanges(s.item.id,{revision:1,message:'Please clarify the product label.',replacePhoto:false});s.desk.submit(s.access,{revision:2,lot:'LOT-A',acknowledged:true,correctionResponse:'The label clearly reads LOT-A.'});
 const history=s.desk.claimHistory(s.item.id);assert.equal(history.events.filter(e=>e.event==='EVIDENCE_REVISION').length,2);assert.ok(history.events.some(e=>e.event==='EVIDENCE_REVIEWED'));assert.ok(!JSON.stringify(history).includes(s.access));assert.ok(!JSON.stringify(history).includes(photo));
 const old=history.events.find(e=>e.snapshot.revision===1&&e.photoAvailable);assert.equal(s.desk.historyPhotograph(s.item.id,{sequence:old.sequence}).photo,photo);assert.equal(s.desk.historyPhotograph(s.item.id,{sequence:old.sequence}).approvalAuthority,false);assert.throws(()=>s.desk.historyPhotograph('another',{sequence:old.sequence}));assert.throws(()=>s.desk.photograph(s.item.id,{revision:1}),/changed/);
 }finally{s.desk.close();}
});
test('lost response recovery requires original correlation and never repeats a refund',async()=>{
 const s=await fixture();try{
 await assert.rejects(s.desk.approve(s.item.id,{digest:s.reviewed.plan.digest}),/Lost/);const row=s.desk.reservation(s.desk.claim(s.item.id)),input={requestId:row.request_id,revision:1,confirmed:true,reason:'Recovered from provider support.',refundId:'RECOVERED'};
 const good=s.provider.verifiedRefund;s.provider.verifiedRefund=async(r,id)=>({...await good(r,id),invoice_id:'another-attempt'});await assert.rejects(s.desk.recoverRefund(s.item.id,input),/correlation/);assert.equal(s.desk.reservation(s.desk.claim(s.item.id)).state,'UNKNOWN');
 s.provider.verifiedRefund=good;const result=await s.desk.recoverRefund(s.item.id,input);assert.equal(result.receipt.refundId,'RECOVERED');await s.desk.approve(s.item.id,{digest:s.reviewed.plan.digest});assert.equal(s.refunds(),1);assert.ok(s.desk.claimHistory(s.item.id).events.some(e=>e.event==='REFUND_REFERENCE_RECOVERED'));
 }finally{s.desk.close();}
});
test('legacy unknown attempts and failed refunds have an auditable manual disposition without unlocking money',async()=>{
 const s=await fixture();try{
 await assert.rejects(s.desk.approve(s.item.id,{digest:s.reviewed.plan.digest}));const row=s.desk.reservation(s.desk.claim(s.item.id)),input={requestId:row.request_id,revision:1,confirmed:true,reason:'Escalated for manual reconciliation.',refundId:'LEGACY'};
 s.desk.db.prepare('DELETE FROM refund_attempt_meta').run();await assert.rejects(s.desk.recoverRefund(s.item.id,input),/legacy/);
 const result=s.desk.recordRefundDisposition(s.item.id,{...input,disposition:'ESCALATED_TO_PROVIDER'});assert.equal(result.payment.state,'UNKNOWN');assert.equal(result.receipt,null);assert.equal(s.refunds(),1);assert.equal(s.desk.claimHistory(s.item.id).events.at(-1).snapshot.settlementChanged,false);
 }finally{s.desk.close();}
});
test('duplicate imports retain review, source changes retain older versions and active setups survive pagination',async()=>{
 const desk=new ClaimDesk({provider:async()=>{throw new Error('No provider');}});let number='27026',version=1;
 const ws=new SourceWorkspace(desk.db,{ai:{status:()=>({available:false})},loadSource:async()=>({recallNumber:number,title:'Public notice',sourceDigest:number+'-'+version,sourceUrl:'https://www.cpsc.gov/Recalls/Example',remedies:['Upload a photograph of the label.']})});
 try{let first=await ws.import(number);first=ws.save({...first,review:{sentinel:true},publishedCampaign:{id:'ACTIVE'}});assert.equal((await ws.import(number)).review.sentinel,true);version++;const changed=await ws.import(number);assert.notEqual(changed.id,first.id);assert.equal(changed.previousSetupId,first.id);assert.equal(ws.get(first.id).review.sentinel,true);
 for(let i=0;i<22;i++){number=String(28000+i);await ws.import(number);}desk.setSetting('published','yes');desk.setSetting('active-campaign',JSON.stringify({id:'ACTIVE'}));const page=await ws.state(desk);assert.ok(page.hasMore);assert.ok(page.setups.some(s=>s.id===first.id));const older=await ws.state(desk,{offset:page.nextOffset});assert.ok(older.setups.some(s=>s.id===changed.id));assert.ok(ws.historyFor(first.id).events.length>=2);
 }finally{desk.close();}
});
test('referenced instructions block publication until a provenance-labelled snapshot is reviewed',async()=>{
 const db=new DatabaseSync(':memory:'),remedies=['Upload a photograph of the label.','Follow the instructions on https://example.com/recall.'];const ws=new SourceWorkspace(db,{ai:{status:()=>({available:false})},loadSource:async()=>({recallNumber:'27026',sourceDigest:'root',sourceUrl:'https://www.cpsc.gov/Recalls/Example',remedies})});
 try{let row=await ws.import('27026');assert.throws(()=>assertExecutableSource(row.source,[],[]),/external instructions/);row=ws.attachExternal(row.id,{revision:1,dependencyId:'external-1-0',url:'https://example.com/recall',text:'Confirm that the product label is visible.',confirmed:true});assert.equal(row.source.externalSnapshots[0].verification,'MERCHANT_SUPPLIED_PUBLIC_EXCERPT_NOT_FETCHED');assert.equal(row.review,null);assert.equal((await ws.import('27026')).source.sourceDigest,row.source.sourceDigest);assert.ok(ws.historyFor(row.id).events.length>=3);
 assert.throws(()=>ws.attachExternal(row.id,{revision:row.revision,dependencyId:'external-1-0',url:'https://other.com/recall',text:'Confirm that the product label is visible.',confirmed:true}),/referenced public website/);
 const changed=ws.attachExternal(row.id,{revision:row.revision,dependencyId:'external-1-0',url:'https://example.com/recall',text:'After receiving the refund, dispose of the product.',confirmed:true});const fields=[{id:'photo',kind:'PHOTO',quote:remedies[0]}],decisions=changed.source.remedies.flatMap((q,p)=>[{id:`clause-${p}-0`,disposition:'INFORMATION',reason:'Information only.'}]);assert.throws(()=>assertExecutableSource(changed.source,fields,decisions),/manual steps/);
 }finally{db.close();}
});

test('an attached excerpt cannot hide a second external instruction',async()=>{
 const db=new DatabaseSync(':memory:'),ws=new SourceWorkspace(db,{ai:{status:()=>({available:false})},loadSource:async()=>({recallNumber:'TEST',sourceDigest:'root',sourceUrl:'https://www.cpsc.gov/Example',remedies:['Upload a photograph of the label.','Follow the instructions on https://example.com/recall.']})});
 try{let row=await ws.import('TEST');row=ws.attachExternal(row.id,{revision:1,dependencyId:'external-1-0',url:'https://example.com/recall',text:'Follow the instructions on https://another.example.com/required.',confirmed:true});assert.throws(()=>assertExecutableSource(row.source,[],[]),/external instructions/);}finally{db.close();}
});

test('first mutation of a legacy claim retains the existing snapshot before overwriting it',async()=>{
 const s=await fixture();try{const history=s.desk.history;s.desk.db.prepare('DELETE FROM workspace_events').run();s.desk.db.prepare('DELETE FROM history_photos').run();s.desk.history=null;const prior=s.desk.claim(s.item.id);s.desk.history=history;s.desk.saveClaim({...prior,review:null,revision:2},'customer-capability');const events=s.desk.claimHistory(s.item.id).events;assert.equal(events[0].event,'PRE_RETENTION_BASELINE');assert.equal(events[0].snapshot.revision,1);assert.equal(s.desk.historyPhotograph(s.item.id,{sequence:events[0].sequence}).photo,photo);assert.equal(events[1].snapshot.revision,2);}finally{s.desk.close();}
});

test('online and bare-www instruction references remain explicit external prerequisites',()=>{
 for(const quote of ['Follow the instructions online to receive a refund.','Consumers should follow the instructions at www.example.com/recall to receive a refund.']){const dependencies=externalDependencies({remedies:[quote]});assert.equal(dependencies.length,1);assert.equal(dependencies[0].status,'UNRESOLVED');assert.throws(()=>assertExecutableSource({remedies:[quote]},[],[]),/external instructions/);}
 assert.equal(externalDependencies({remedies:['Follow the instructions at www.example.com/recall.']})[0].url,'https://www.example.com/recall');
});
