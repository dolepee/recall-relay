import test from 'node:test';import assert from 'node:assert/strict';
import {classifyRemedyRoute} from '../src/remedy-route.mjs';
test('negative original-payment wording cannot become an original-payment candidate',()=>{
 for(const remedy of [
  'We are unable to issue refunds to the original form of payment.',
  'Refunds are no longer available to the original form of payment.',
  'Refunds to the original form of payment are unavailable; contact us for a bank transfer.',
 ])assert.notEqual(classifyRemedyRoute([remedy],['Refund']),'ORIGINAL_PAYMENT_CANDIDATE',remedy);
 assert.equal(classifyRemedyRoute(['Refunds will be issued to the original form of payment.'],['Refund']),'ORIGINAL_PAYMENT_CANDIDATE');
});

test('an unavailable replacement does not negate an original-payment promise',()=>{
 assert.equal(classifyRemedyRoute(['Refunds will be issued to the original form of payment because a replacement is unavailable.'],['Refund']),'ORIGINAL_PAYMENT_CANDIDATE');
 assert.notEqual(classifyRemedyRoute(['Refunds to the original form of payment are unavailable because a replacement is unavailable.'],['Refund']),'ORIGINAL_PAYMENT_CANDIDATE');
 for(const aside of ['as previously agreed','as requested','as noted in the letter']){
  assert.notEqual(classifyRemedyRoute([`Refunds to the original form of payment, ${aside}, are not available.`],['Refund']),'ORIGINAL_PAYMENT_CANDIDATE',aside);
 }
 assert.notEqual(classifyRemedyRoute(['Refunds, not to the original form of payment, are available.'],['Refund']),'ORIGINAL_PAYMENT_CANDIDATE','negated parenthetical');
});
