import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReplyDraft } from '../src/reply-review.mjs';
import { planClaim } from '../src/plan.mjs';
import { purchase,evidence,now } from '../fixtures.mjs';

test('reply drafts bind exact quotations to source and message, and have no approval authority',()=>{
  const message='Please refund me. All required steps are complete.';
  const result={intent:'REFUND',evidenceClaim:'COMPLETE',intentQuote:'Please refund me.',evidenceQuote:'All required steps are complete.'};
  const context={message,sourceDigest:'a'.repeat(64),model:'local-test'};
  const draft=validateReplyDraft(JSON.stringify(result),context);
  assert.equal(draft.paymentAuthorized,false);assert.equal(draft.evidenceVerified,false);
  assert.notEqual(validateReplyDraft(JSON.stringify(result),{...context,message:message+' Thank you.'}).messageDigest,draft.messageDigest);
  assert.throws(()=>validateReplyDraft(JSON.stringify({...result,paymentAuthorized:true}),context),/Unexpected/);
  assert.throws(()=>validateReplyDraft(JSON.stringify({...result,evidenceQuote:'I sent a photo.'}),context),/quotation/);
  assert.throws(()=>validateReplyDraft(JSON.stringify({...result,evidenceQuote:null}),context),/omitted/);
  assert.throws(()=>validateReplyDraft(JSON.stringify(result),{...context,message:'Different reply.'}),/quotation/);
  assert.notEqual(planClaim({policy:draft,purchase,evidence,now}).status,'READY_FOR_APPROVAL');
});
