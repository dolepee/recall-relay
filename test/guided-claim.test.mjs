import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {approveActionLabel, approveLabel, canApprove, canConfirmReview, customerTask, evidenceState, evidenceTitle, handoff, merchantNextStep, progressStage, refundFacts, reviewPhotoKey, reviewable, reviewedCurrent, stage, STAGES} from '../ui/guided-state.mjs';

const scenario = {title: 'Practice notice · Relay Home cup', product: 'Relay Home cup (fictional)', sku: 'CUP-01', lot: 'LOT-A', notice: 'Practice exercise.', sourceLabel: 'Fictional practice notice', sourceNote: 'Written for this exercise.', requirements: [], totalCents: 5999, affectedCents: 2599, unaffectedCents: 3400};

function view(overrides = {}) {
  const {case: caseOverrides = {}, ...rest} = overrides;
  return {
    mode: 'practice', simulated: true, role: 'customer', attempt: 1, scenario,
    case: {
      id: 'PRACTICE-AAAA1111', revision: 0, status: {code: 'AWAITING_CUSTOMER', reason: 'Complete the practice claim to continue.'},
      missing: [], plan: {status: 'NOT_READY', reason: 'No submission.', digest: null},
      review: null, correction: null, locked: false, submittedAt: null, submission: null, photo: null, refund: null, unresolved: null,
      ...caseOverrides,
    },
    ...rest,
  };
}
const submitted = (extra = {}) => view({case: {revision: 1, status: {code: 'SUBMITTED', reason: 'The claim is with the merchant for review.'}, submittedAt: '2026-11-03T12:00:00.000Z', submission: {lot: 'LOT-A', acknowledged: true, hasPhoto: true, extra: {}}, ...extra}});
const reviewed = () => submitted({revision: 2, review: {revision: 2, reviewedAt: '2026-11-03T12:05:00.000Z'}, status: {code: 'READY_FOR_APPROVAL', reason: 'Evidence reviewed for this version.'}, plan: {status: 'READY_FOR_APPROVAL', reason: 'Ready.', digest: 'digest-2'}});

test('the three conceptual stages are fixed and named', () => {
  assert.deepEqual(STAGES.map(s => s.label), ['Prepare claim', 'Review evidence', 'Approve refund']);
});

test('the journey opens with the customer preparing the claim and advances by recorded state', () => {
  assert.equal(stage(view()), 1);
  assert.equal(stage(submitted()), 1, 'a submitted claim still waits for the handoff');
  assert.equal(stage({...submitted(), role: 'merchant'}), 2);
  assert.equal(stage(reviewed()), 3, 'a recorded review moves the flow to the refund decision');
  assert.equal(stage(view({case: {locked: true}})), 3);
});

test('the progress track advances on submitted evidence while the customer still sees the handoff', () => {
  assert.equal(progressStage(view()), 1);
  assert.equal(progressStage(submitted()), 2, 'submitted evidence makes Review evidence the next stage');
  assert.equal(progressStage({...submitted(), role: 'merchant'}), 2);
  assert.equal(progressStage(reviewed()), 3);
});

test('the handoff is contextual and only appears for the side that owes the next action', () => {
  assert.equal(handoff(view()), null, 'a fresh case has no handoff to offer');
  const toMerchant = handoff(submitted());
  assert.equal(toMerchant.to, 'merchant');
  assert.match(toMerchant.title, /^Evidence submitted\. Next, review it as the merchant\.$/);
  assert.match(toMerchant.body, /customer’s part is done/);
  assert.equal(handoff({...submitted(), role: 'merchant'}), null, 'the merchant is already reviewing');
  const correction = submitted({revision: 2, correction: {state: 'REQUESTED', message: 'Sharper photo, please.', replacePhoto: true}});
  assert.equal(handoff(correction), null, 'the customer answers the correction, it is their turn only after the merchant asks');
  const toCustomer = handoff({...correction, role: 'merchant'});
  assert.equal(toCustomer.to, 'customer');
  assert.match(toCustomer.title, /^Correction requested/);
  assert.match(toCustomer.body, /new revision and clears any earlier review/);
});

test('a correction response is handed back for a fresh review, never described as retained evidence', () => {
  const answered = submitted({revision: 3});
  const next = handoff(answered);
  assert.equal(next.label, 'Continue to merchant review');
  assert.match(next.title, /^Updated evidence submitted/);
  assert.match(next.body, /earlier review was cleared/);
});

test('evidence states are distinct and never collapse submitted into reviewed', () => {
  assert.equal(evidenceState(view()), 'awaiting');
  assert.equal(evidenceTitle(view()), 'Waiting for customer evidence');
  assert.equal(evidenceState(submitted()), 'submitted');
  assert.equal(evidenceTitle(submitted()), 'Evidence submitted');
  assert.equal(evidenceState(submitted({correction: {state: 'REQUESTED', message: 'x'}})), 'correction-requested');
  assert.equal(evidenceState(submitted({missing: ['Lot code']})), 'incomplete');
  assert.equal(evidenceState(reviewed()), 'reviewed');
  assert.equal(evidenceState(view({case: {locked: true, unresolved: {state: 'RESERVED', cents: 2599}}})), 'prepared');
  assert.equal(evidenceState(view({case: {refund: {cents: 2599, reference: 'SIM-1'}}})), 'complete');
});

test('a review is only confirmable with an explicit acknowledgement on a reviewable revision', () => {
  assert.equal(reviewable(submitted()), true);
  assert.equal(canConfirmReview(submitted(), false), false, 'acknowledgement starts unchecked');
  assert.equal(canConfirmReview(submitted(), null), false);
  assert.equal(canConfirmReview(submitted(), true), false, 'the customer cannot confirm a merchant review');
  assert.equal(canConfirmReview({...submitted(), role: 'merchant'}, true), true);
  assert.equal(canConfirmReview({...submitted(), role: 'merchant'}, true, false), false, 'a loading or failed photo blocks review');
  assert.equal(canConfirmReview({...submitted(), role: 'merchant'}, true, null), false, 'only a loaded current photo is ready');
  assert.equal(canConfirmReview({...submitted({submission: {lot: 'LOT-A', acknowledged: true, hasPhoto: false, extra: {}}}), role: 'merchant'}, true), false, 'the server photo guard remains required');
  assert.equal(canConfirmReview({...submitted({missing: ['Lot code']}), role: 'merchant'}, true), false);
  assert.equal(canConfirmReview({...submitted({correction: {state: 'REQUESTED', message: 'x'}}), role: 'merchant'}, true), false);
  assert.equal(canConfirmReview({...submitted({locked: true}), role: 'merchant'}, true), false);
});

test('photo readiness is bound to the current case, revision and image', () => {
  const first = submitted({photo: 'data:image/png;base64,AAA'});
  const second = {...first, case: {...first.case, revision: 2, photo: 'data:image/png;base64,BBB'}};
  assert.notEqual(reviewPhotoKey(first), reviewPhotoKey(second), 'a new revision must reset readiness');
  assert.match(reviewPhotoKey(first), /PRACTICE-AAAA1111:1:data:image\/png/);
});

test('a refund needs a review recorded for the current revision and the displayed plan digest', () => {
  assert.equal(reviewedCurrent(reviewed()), true);
  assert.equal(canApprove(reviewed()), true);
  assert.equal(canApprove(submitted()), false, 'submitted without review is not approvable');
  assert.equal(canApprove(submitted({review: {revision: 1}})), false, 'a review from an earlier revision is stale');
  assert.equal(canApprove({...reviewed(), case: {...reviewed().case, plan: {status: 'READY_FOR_APPROVAL', reason: '', digest: null}}}), false);
  assert.equal(canApprove({...reviewed(), case: {...reviewed().case, locked: true}}), false);
});

test('the final action names the exact affected amount and keeps the excluded line visible', () => {
  assert.equal(approveLabel(reviewed()), 'Review refund');
  assert.equal(approveActionLabel(reviewed()), 'Approve $25.99 simulated refund');
  const facts = refundFacts(reviewed());
  assert.equal(facts.affected, '$25.99');
  assert.equal(facts.excluded, '$34.00');
  assert.equal(facts.total, '$59.99');
  assert.match(facts.destination, /original practice payment/i);
  assert.equal(refundFacts(view({case: {refund: {cents: 2599, reference: 'SIM-9'}}})).completedAmount, '$25.99');
});

test('stage-one copy follows the customer task, including a requested correction', () => {
  assert.equal(customerTask(view()), 'first');
  assert.equal(customerTask(submitted()), 'edit');
  assert.equal(customerTask(submitted({correction: {state: 'REQUESTED', message: 'x'}})), 'correction');
  assert.equal(customerTask(view({case: {refund: {cents: 2599, reference: 'SIM-1'}}})), 'completed');
});

test('the merchant is told what the claim still owes the flow', () => {
  assert.equal(merchantNextStep(view({case: {submission: null}})), 'Waiting for the customer to submit evidence.');
  assert.equal(merchantNextStep({...submitted(), role: 'merchant'}), 'Review this version’s evidence before any refund decision.');
  assert.equal(merchantNextStep(reviewed()), 'Evidence reviewed. The refund decision is the remaining step.');
  assert.match(merchantNextStep(view({case: {correction: {state: 'REQUESTED', message: 'x'}}})), /Waiting for the customer to answer the correction/);
});

test('DESIGN.md records the governing system and the state and copy contract', async () => {
  const doc = await readFile(new URL('../DESIGN.md', import.meta.url), 'utf8');
  for (const token of ['#FFFFFF', '#F5F7FA', '#142337', '#596779', '#315CF5', '#DEE5EE'])
    assert.ok(doc.includes(token), `missing ${token}`);
  assert.match(doc, /Prepare claim \/ Review evidence \/ Approve refund/);
  assert.match(doc, /starts unchecked/i);
  assert.match(doc, /Approve \[amount\] simulated refund/);
  assert.match(doc, /Do not promise retained previous submissions/i);
  assert.doesNotMatch(doc, /with the previous submission retained/i);
  assert.match(doc, /48px/);
  assert.match(doc, /12px/);
});
