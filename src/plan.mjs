import { createHash } from 'node:crypto';

const DAY = 86400000;
const hash = (data) => createHash('sha256').update(JSON.stringify(data)).digest('hex');
const money = (value) => Number.isSafeInteger(value) && value >= 0;

// Trusted merchant records are separate from the proposed AI extraction.
// No notice text, model output, or customer upload grants payment authority.
export function planClaim({ policy, purchase, evidence, now }) {
  const result = (status, reason) => ({ status, reason, purchaseId: purchase.id });
  if (!policy.reviewedBy || !policy.sourceUrl || !policy.version)
    return result('REVIEW', 'A merchant must review the sourced remedy policy.');
  if (policy.remedy !== 'REFUND')
    return result('MANUAL', 'This policy does not authorize a refund.');
  if (policy.settlingMerchantId !== purchase.merchantId)
    return result('MANUAL', 'The responsible payer is not this merchant.');
  if (!Array.isArray(policy.skus) || !policy.skus.length)
    return result('REVIEW', 'Missing explicit product scope.');
  if (!policy.skus.includes(purchase.sku))
    return result('NOT_MATCHED', 'The product is outside the reviewed scope.');
  if (!Array.isArray(policy.lots) || !policy.lots.length)
    return result('REVIEW', 'Missing explicit lot scope; use ALL only after review.');
  if (!policy.lots.includes('ALL')) {
    if (!purchase.lot) return result('REVIEW', 'Lot evidence is missing.');
    if (!policy.lots.includes(purchase.lot))
      return result('NOT_MATCHED', 'The lot is outside the reviewed scope.');
  }
  if (!Array.isArray(policy.requiredEvidence))
    return result('REVIEW', 'Remedy evidence requirements are unspecified.');
  if (policy.requiredEvidence.some((kind) => !evidence[kind]?.reviewedBy))
    return result('REVIEW', 'Required remedy evidence has not been reviewed.');
  if (!purchase.captureId || !purchase.lineId)
    return result('MANUAL', 'Original PayPal capture or line mapping is missing.');
  const age = Date.parse(now) - Date.parse(purchase.capturedAt);
  if (!Number.isFinite(age) || age < 0) return result('REVIEW', 'Invalid capture date.');
  if (age >= 180 * DAY)
    return result('MANUAL', 'Outside this prototype’s conservative refund window.');
  if (purchase.currency !== 'USD')
    return result('MANUAL', 'This spike supports USD only.');
  if (![purchase.linePaidCents, purchase.lineRefundedCents, purchase.captureRemainingCents].every(money))
    return result('REVIEW', 'Payment amounts require exact nonnegative integer cents.');
  const cents = purchase.linePaidCents - purchase.lineRefundedCents;
  if (cents === 0) return result('ALREADY_REFUNDED', 'No remaining amount on this line.');
  if (cents < 0 || cents > purchase.captureRemainingCents)
    return result('REVIEW', 'Recorded line amount conflicts with capture balance.');
  const action = {
    merchantId: purchase.merchantId,
    policyId: policy.id,
    policyVersion: policy.version,
    sourceUrl: policy.sourceUrl,
    captureId: purchase.captureId,
    lineId: purchase.lineId,
    amountCents: cents,
    currency: purchase.currency,
    purchaseId: purchase.id,
    purchaseVersion: purchase.version,
    evidenceHash: hash(evidence),
  };
  return { status: 'READY_FOR_APPROVAL', action, digest: hash(action) };
}

export function approvedAction(plan, approval) {
  if (plan.status !== 'READY_FOR_APPROVAL' || !approval?.actor || approval.digest !== plan.digest)
    throw new Error('Approval must match the current exact action.');
  if (hash(plan.action) !== plan.digest) throw new Error('Plan was modified after preparation.');
  return structuredClone(plan.action);
}
