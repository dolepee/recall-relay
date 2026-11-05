import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {recallDraft,fetchRecallDraft} from '../src/cpsc.mjs';
import {planClaim} from '../src/plan.mjs';
import {purchase,evidence,now} from '../fixtures.mjs';

const snapshot=JSON.parse(await readFile(new URL('./fixtures/cpsc-20261021.json',import.meta.url)));
const find = number => snapshot.records.find(x=>x.RecallNumber===number);

test('public sources retain exact evidence and distinguish cash, credit, check and replacement remedies',()=>{
  const expected={27026:'ORIGINAL_PAYMENT_CANDIDATE',27024:'CHECK_REFUND',27009:'CHOICE_REQUIRES_REVIEW',27013:'MARKETPLACE_RETURN_REQUIRED',26792:'REFUND_ROUTE_UNSPECIFIED',26659:'CHOICE_REQUIRES_REVIEW',26610:'CHOICE_REQUIRES_REVIEW',26595:'NON_REFUND_REMEDY'};
  for(const [number,route] of Object.entries(expected)){
    const record=find(number),draft=recallDraft(record);
    assert.equal(draft.route,route,number);
    assert.equal(draft.paymentAuthorized,false);
    for(const excerpt of draft.requirements){
      const i=Number(excerpt.field.match(/\[(\d+)\]/)[1]);
      assert.ok(record.Remedies[i].Name.replace(/\s+/g,' ').includes(excerpt.quote));
    }
    assert.notEqual(planClaim({policy:draft,purchase,evidence,now}).status,'READY_FOR_APPROVAL');
  }
});

test('source changes invalidate its identity while retrieval time alone does not',()=>{
  const record=find('27026');
  const first=recallDraft(record,{retrievedAt:'2026-10-21T00:00:00Z'});
  assert.equal(first.sourceDigest,recallDraft(record,{retrievedAt:'2026-10-22T00:00:00Z'}).sourceDigest);
  const changed=structuredClone(record);changed.Remedies[0].Name='Contact the firm for a replacement.';
  assert.notEqual(first.sourceDigest,recallDraft(changed).sourceDigest);
});

test('recall lookup rejects arbitrary URLs, fuzzy results and incomplete sources',async()=>{
  let calls=0;
  const fetchImpl=async url=>{calls++;assert.equal(url,'https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallNumber=27026');return new Response(JSON.stringify([find('27026')]));};
  assert.equal((await fetchRecallDraft('27-026',{fetchImpl})).recallNumber,'27026');
  await assert.rejects(fetchRecallDraft('https://attacker.example',{fetchImpl}));assert.equal(calls,1);
  await assert.rejects(fetchRecallDraft('27026',{fetchImpl:async()=>new Response(JSON.stringify([find('27024')]))}));
  assert.throws(()=>recallDraft({...find('27026'),URL:'https://www.cpsc.gov.attacker.example/Recalls/2027/example'}));
  assert.throws(()=>recallDraft({...find('27026'),Remedies:[]}));
});

test('negated original-payment promises and verb check do not become payment routes',()=>{
 const record=find('27026');const route=text=>recallDraft({...record,Remedies:[{Name:text}]}).route;
 assert.equal(route('Refunds will not return to the original form of payment.'),'REFUND_ROUTE_UNSPECIFIED');
 assert.equal(route('Refunds will never be issued to the original payment.'),'REFUND_ROUTE_UNSPECIFIED');
 assert.equal(route('Check the label and request a refund.'),'REFUND_ROUTE_UNSPECIFIED');
 assert.equal(route('The refund, in the form of a check, will be mailed to the consumer.'),'CHECK_REFUND');
 assert.equal(recallDraft({...record,RemedyOptions:[{Option:'Refund'},{Option:'Replacement'}]}).route,'CHOICE_REQUIRES_REVIEW');
});
