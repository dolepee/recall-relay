import test from 'node:test';import assert from 'node:assert/strict';
import {CSV_TEMPLATE,parseLedgerCsv,suggestMapping,mapLedgerCsv,CSV_LIMIT_BYTES} from '../src/ledger-csv.mjs';
const convert=s=>{const t=parseLedgerCsv(s);return mapLedgerCsv(t,suggestMapping(t.headers));};
test('CSV dollars become exact cents and optional blanks remain unknown without provider facts',()=>{
 const p=convert(CSV_TEMPLATE);assert.deepEqual(p.errors,[]);const l=p.ledger.orders[0].lines[0];assert.equal(l.itemPaidCents,3875);assert.equal(l.refundedCents,1000);assert.equal(l.taxCents,0);assert.equal(p.ledger.source.kind,'merchant-ledger');
 const minimal=convert('orderId,lineId,sku,lot\nA,ONE,CUP-01,\n');assert.deepEqual(minimal.errors,[]);assert.equal(minimal.ledger.orders[0].captureId,null);assert.equal(minimal.ledger.orders[0].status,null);assert.equal(minimal.ledger.orders[0].lines[0].quantity,null);assert.equal(minimal.ledger.orders[0].lines[0].itemPaidCents,null);
});
test('quoted commas, escaped quotes, BOM and CRLF parse; malformed shapes never silently drop rows',()=>{
 const t=parseLedgerCsv('\uFEFForderId,lineId,sku\r\n"A,1","say ""hi""",CUP\r\n');assert.equal(t.rows[0][0],'A,1');assert.equal(t.rows[0][1],'say "hi"');
 for(const s of ['a,a\n1,2','a,b\n1','a,b\n"x,2','a,b\n"x"bad,2','a,b\n1,2,3','a,\n1,2'])assert.throws(()=>parseLedgerCsv(s));
 assert.throws(()=>parseLedgerCsv('a'.repeat(CSV_LIMIT_BYTES+1)),/256 KB/);assert.throws(()=>parseLedgerCsv('orderId,lineId\n'+Array.from({length:201},(_,i)=>`${i},L`).join('\n')),/200/);
});
test('amount errors, duplicate lines and conflicting order metadata must be corrected before use',()=>{
 for(const amount of ['-1','1.234','1e2','$2.00','NaN','Infinity','1,000.00','1000000.01']){const p=convert(`orderId,lineId,itemPaid\nA,L,"${amount}"`);assert.equal(p.ledger,null);assert.ok(p.errors.some(e=>e.field==='itemPaid'));}
 for(const tail of ['A,L,OTHER','A,TWO,DIFFERENT']){const p=convert(`orderId,lineId,captureId\nA,L,CAP\n${tail}`);assert.equal(p.ledger,null);}
 const paid=convert('orderId,lineId,itemPaid,refunded\nA,L,10,11');assert.equal(paid.ledger,null);assert.ok(paid.errors.some(e=>e.field==='refunded'));
});
test('column mapping and row correction preserve every line and omit unmapped data',()=>{
 const t=parseLedgerCsv('Sale,Item,Amount,email\nA,L,wrong,private@example.com');const m={...suggestMapping(t.headers),orderId:'0',declaredLineId:'1',itemPaid:'2'};
 assert.equal(mapLedgerCsv(t,m).ledger,null);const p=mapLedgerCsv(t,m,{0:{itemPaid:'0.29'}});assert.deepEqual(p.errors,[]);assert.equal(p.ledger.orders[0].lines[0].itemPaidCents,29);assert.ok(!JSON.stringify(p.ledger).includes('private@example.com'));
 assert.equal(mapLedgerCsv(t,{...m,lot:'0'}).ledger,null);
 const grouped=convert('orderId,lineId,captureId\nA,L1,CAP\nA,L2,CAP\nB,L,CAP');assert.equal(grouped.ledger.orders.length,2);assert.equal(grouped.ledger.orders[0].lines.length,2);
});
