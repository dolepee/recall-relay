// Pure presentation contract for the guided claim.
//
// The practice workspace owns every recorded fact (evidence, review, refund).
// This module only decides what the interface shows for those facts, so the
// stage, the role handoff and the approval wording can be tested without a
// browser and cannot drift from the copy contract in DESIGN.md.

export const STAGES = Object.freeze([
  {id: 1, label: 'Prepare claim', detail: 'Customer evidence'},
  {id: 2, label: 'Review evidence', detail: 'Merchant decision'},
  {id: 3, label: 'Approve refund', detail: 'Explicit confirmation'},
]);

const money = cents => new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(cents / 100);

// Evidence that is complete, on the current revision, and still needs a
// merchant review. A requested correction is not reviewable until answered.
export function reviewable(value) {
  const c = value.case;
  return Boolean(c.submission) && c.missing.length === 0 && c.correction?.state !== 'REQUESTED' && !c.review && !c.locked;
}

// A recorded review only counts for the revision it was made on. The view
// already drops a review from an earlier revision; keep the check explicit.
export function reviewedCurrent(value) {
  const c = value.case;
  return Boolean(c.review) && c.review.revision === c.revision;
}

export function evidenceState(value) {
  const c = value.case;
  if (c.refund) return 'complete';
  if (c.unresolved) return c.unresolved.state === 'RESERVED' ? 'prepared' : 'unresolved';
  if (c.correction?.state === 'REQUESTED') return 'correction-requested';
  if (reviewedCurrent(value)) return 'reviewed';
  if (c.submission && c.missing.length === 0) return 'submitted';
  if (c.submission) return 'incomplete';
  return 'awaiting';
}

const evidenceTitles = {
  awaiting: 'Waiting for customer evidence',
  incomplete: 'Evidence incomplete',
  submitted: 'Evidence submitted',
  'correction-requested': 'Correction requested',
  reviewed: 'Evidence reviewed',
  prepared: 'Simulated refund prepared, not recorded',
  unresolved: 'Simulated refund not recorded',
  complete: 'Simulated refund recorded',
};

export function evidenceTitle(value) {
  return evidenceTitles[evidenceState(value)] || 'Claim state';
}

export function stage(value) {
  const c = value.case;
  // A recorded review, a reserved attempt or a receipt all mean the evidence
  // work is done; the remaining decision is the refund itself.
  if (c.review || c.locked) return 3;
  return value.role === 'merchant' ? 2 : 1;
}

// The progress track follows the claim, not the current viewer. Once the
// customer submits complete evidence, Prepare claim is done and Review evidence
// is the next stage even while the customer still sees the handoff card.
export function progressStage(value) {
  const c = value.case;
  if (c.review || c.locked) return 3;
  if (reviewable(value) || value.role === 'merchant') return 2;
  return 1;
}

// The contextual handoff replaces a role toggle. Exactly one side is being
// asked for something at a time; the label says what happens next.
export function handoff(value) {
  const c = value.case;
  if (value.role === 'merchant' && c.correction?.state === 'REQUESTED' && !c.locked)
    return {
      to: 'customer',
      title: 'Correction requested. Next, the customer updates their evidence.',
      body: 'The customer answers on their own claim page. Their response creates a new revision and clears any earlier review, so this version cannot be approved while the request is open.',
      label: 'Continue as customer',
    };
  if (value.role === 'customer' && reviewable(value))
    return {
      to: 'merchant',
      title: c.revision > 1 ? 'Updated evidence submitted. Next, review the new version as the merchant.' : 'Evidence submitted. Next, review it as the merchant.',
      body: c.revision > 1
        ? 'The earlier review was cleared when this revision was saved. Review this version before any refund decision.'
        : 'The customer’s part is done for this version. Review the requirement, the evidence and the recorded responses together before deciding.',
      label: 'Continue to merchant review',
    };
  return null;
}

export function canConfirmReview(value, acknowledged, photoReady = true) {
  const c = value.case;
  return value.role === 'merchant' && reviewable(value) && Boolean(c.submission?.hasPhoto) && acknowledged === true && photoReady === true;
}

// The photo is part of the review, not decoration. Bind its readiness to the
// exact case, revision and image so a slow, failed or replaced photograph
// cannot inherit a previous revision's loaded state.
export function reviewPhotoKey(value) {
  const c = value.case;
  return `${c.id}:${c.revision}:${c.photo || 'missing'}`;
}

export function canApprove(value) {
  const c = value.case;
  return reviewedCurrent(value) && c.plan.status === 'READY_FOR_APPROVAL' && Boolean(c.plan.digest) && !c.locked;
}

export function approveLabel() {
  return 'Review refund';
}

export function approveActionLabel(value) {
  return `Approve ${money(value.scenario.affectedCents)} simulated refund`;
}

export function refundFacts(value) {
  const c = value.case;
  const s = value.scenario;
  return {
    affected: money(s.affectedCents),
    excluded: money(s.unaffectedCents),
    total: money(s.totalCents),
    destination: 'Original practice payment (simulated)',
    completedAmount: c.refund ? money(c.refund.cents) : null,
    reference: c.refund?.reference || null,
  };
}

// What the merchant still owes the flow, in the merchant's own words.
export function merchantNextStep(value) {
  const c = value.case;
  if (c.refund) return 'This practice case is complete. The receipt records a simulated refund only.';
  if (c.unresolved) return c.unresolved.state === 'RESERVED'
    ? 'A simulated refund is prepared but not recorded. Resume it or start a new practice case.'
    : 'This simulated refund attempt is unresolved. No funds moved; start a new practice case.';
  if (c.correction?.state === 'REQUESTED') return 'Waiting for the customer to answer the correction.';
  if (!c.submission) return 'Waiting for the customer to submit evidence.';
  if (c.missing.length) return 'The customer’s evidence is saved but incomplete.';
  if (!c.review) return 'Review this version’s evidence before any refund decision.';
  return 'Evidence reviewed. The refund decision is the remaining step.';
}

// Stage one changes shape when the customer is answering a correction.
export function customerTask(value) {
  const c = value.case;
  if (c.refund) return 'completed';
  if (c.correction?.state === 'REQUESTED') return 'correction';
  if (c.submission) return 'edit';
  return 'first';
}
