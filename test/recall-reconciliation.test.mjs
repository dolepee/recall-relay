import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileLedger} from '../src/recall-reconciliation.mjs';
import {ClaimDesk} from '../src/claims.mjs';
const policy={sku:'CUP-01',lot:'LOT-A',coverage:[{id:'q',quote:'Return LOT-A.'}]};
const ledger=()=>({version:1,currency:'USD',source:{kind:'merchant-ledger',label:'Test ledger',reference:null},orders:[{orderId:'ORDER',captureId:'CAP',capturedAt:'2026-10-22T00:00:00Z',status:'COMPLETED',lines:[{declaredLineId:'line',sku:'CUP-01',lot:'LOT-A',quantity:1,itemPaidCents:3875,taxCents:0,shippingCents:0,refundedCents:1000}]}]});
const claim={id:'claim',revision:3,createdAt:'2026-10-22T00:00:00Z',purchase:{id:'RR-ORDER',captureId:'CAP',sku:'CUP-01',lot:'LOT-A',linePaidCents:3875,lineRefundedCents:1000}};
const run=(l=ledger(),corrections=[],claims=[claim])=>reconcileLedger({ledger:l,corrections},policy,claims,'2026-11-05T00:00:00Z');
test('exact saved purchase match links a claim without authorizing payment or current balance',()=>{
 const r=run(),row=r.lines[0];assert.equal(row.scope,'AFFECTED');assert.equal(row.readiness,'LINKED_CLAIM');assert.equal(row.action.claimId,'claim');assert.equal(row.evidence.amountAsOfSnapshotCents,2875);assert.equal(row.evidence.currentRefundableCents,null);assert.equal(r.providerChecked,false);assert.equal(row.paymentAllowed,false);
});
test('scope remains affected when purchase binding is absent or duplicated',()=>{
 const l=ledger();assert.equal(run(l,[],[]).lines[0].readiness,'NEEDS_BINDING');l.orders.push({...l.orders[0],orderId:'DUP'});const r=run(l);assert.ok(r.lines.every(x=>x.scope==='AFFECTED'&&x.readiness==='BLOCKED'));assert.equal(r.summary.declaredAffectedCents,0);
});
test('a missing lot correction changes planning scope, not evidence or payment authority',()=>{
 const l=ledger();l.orders[0].lines[0].lot=null;assert.equal(run(l).lines[0].scope,'UNKNOWN');const row=run(l,[{rowKey:'0:0',lot:'LOT-A',reason:'Merchant scenario'}]).lines[0];assert.equal(row.scope,'AFFECTED');assert.equal(row.readiness,'NEEDS_EVIDENCE');assert.equal(row.correction.provenance,'MERCHANT_ASSUMPTION');assert.equal(row.evidence,null);assert.equal(row.action.kind,'EVIDENCE');
});
test('a merchant assumption cannot override an explicit published exclusion',()=>{
 const l=ledger();l.orders[0].lines[0].lot='LOT-B';assert.equal(run(l,[{rowKey:'0:0',lot:'LOT-A',reason:'Attempt override'}]).lines[0].scope,'EXCLUDED');
});
test('unknown amounts, altered allocations and ambiguous line matches never link a claim',()=>{
 const l=ledger();l.orders[0].lines[0].itemPaidCents=null;assert.equal(run(l).lines[0].evidence,null);assert.equal(run(l).summary.unknownAffectedAmounts,1);
 l.orders[0].lines[0].itemPaidCents=4000;assert.equal(run(l).lines[0].readiness,'BLOCKED');
 assert.equal(run(ledger(),[],[claim,{...claim,id:'other'}]).lines[0].readiness,'BLOCKED');
 assert.throws(()=>run(ledger(),[{rowKey:'9:9',lot:'A',reason:'x'}]),/missing row/);
});
test('planning snapshots are immutable, bounded, isolated and do not call the provider',()=>{
 const provider=new Proxy({}, {get(){throw new Error('Provider must not be called');}});const desk=new ClaimDesk({provider});desk.setSetting('active-campaign',JSON.stringify(policy));desk.setSetting('published','yes');
 const before=desk.merchantState();const a=desk.reconcileLedger({ledger:ledger()});const l=ledger();l.orders[0].lines[0].lot=null;const z=desk.reconcileLedger({ledger:l});assert.notEqual(a.id,z.id);assert.deepEqual(desk.reconcileLedger({ledger:ledger()}),a);assert.equal(desk.reconciliationPlans().length,2);assert.deepEqual(desk.merchantState(),before);
 const other=new ClaimDesk({provider});assert.equal(other.reconciliationPlans().length,0);assert.throws(()=>desk.reconcileLedger({ledger:ledger(),claims:[claim]}),/ledger and planning/);desk.journal.close?.();other.journal.close?.();
});

test('AI guidance receives public clauses only and rejects fabricated source conditions',async()=>{
 const {reconciliationAdvice}=await import('../src/recall-reconciliation.mjs');
 const desk=new ClaimDesk({provider:{}});desk.setSetting('published','yes');desk.setSetting('active-campaign',JSON.stringify(policy));const plan=desk.reconcileLedger({ledger:ledger()});let payload;
 const ai={status:()=>({available:true,model:'test'}),generate:async(prompt,input)=>{payload=input;return JSON.stringify({clauses:input.clauses.map(c=>({citationId:c.citationId,actor:'CUSTOMER',timing:'UNSPECIFIED',condition:null,explanation:'Return LOT-A.'}))});}};
 const result=await reconciliationAdvice(ai,desk,{planId:plan.id});assert.equal(result.readOnly,true);assert.deepEqual(payload,{clauses:[{citationId:'q',quote:'Return LOT-A.'}]});assert.ok(!JSON.stringify(payload).includes('CAP'));assert.equal(result.clauses[0].interpretationAvailable,true);
 ai.generate=async()=>JSON.stringify({clauses:[{citationId:'q',actor:'CUSTOMER',timing:'UNSPECIFIED',condition:'after January',explanation:'Return LOT-A.'}]});await assert.rejects(reconciliationAdvice(ai,desk,{planId:plan.id}),/complete cited/);await assert.rejects(reconciliationAdvice(ai,desk,{planId:'not-owned'}),/Unknown/);desk.journal.close?.();
});
