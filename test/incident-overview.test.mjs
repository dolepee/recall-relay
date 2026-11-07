import test from 'node:test';import assert from 'node:assert/strict';
import {incidentOverview} from '../src/incident-overview.mjs';
const row=(id,code,amountCents,extra={})=>({id,status:{code},amountCents,...extra});
test('overview separates receipts, unresolved payment reservations and unapproved evidence amounts',()=>{
 const result=incidentOverview([row('a','SUBMITTED',3875),row('b','PENDING',9999,{payment:{cents:2500}}),row('c','COMPLETED',9999,{receipt:{amountCents:1700}}),row('d','MANUAL',null)]);
 const group=k=>result.groups.find(g=>g.view===k);
 assert.equal(group('REVIEW').amountCents,3875);assert.equal(group('PAYMENT').amountCents,2500);assert.equal(group('COMPLETED').amountCents,1700);assert.equal(group('MANUAL').unknownAmounts,1);
 assert.equal(result.claimCount,4);assert.equal(group('ALL').amountCents,8075);
 assert.throws(()=>incidentOverview([row('a','SUBMITTED',10),row('a','SUBMITTED',10)]),/unique/);
 assert.equal(incidentOverview([row('c','COMPLETED',9999)]).groups.find(g=>g.view==='COMPLETED').amountCents,0,'a completed label without a receipt cannot invent settlement evidence');
});
