import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {ClaimDesk} from './claims.mjs';
import {SimulatedRefundProvider} from './practice-provider.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const TOKEN = /^[\w-]{43}$/;
const ROLES = new Set(['merchant', 'customer']);
const AFFECTED_CENTS = 2599;
const UNAFFECTED_CENTS = 3400;
const TOTAL_CENTS = AFFECTED_CENTS + UNAFFECTED_CENTS;

export class PracticeSessionError extends Error {}

// A fictional notice written for this exercise. It is not a public safety
// notice, so it makes no citation it cannot support.
const notice = Object.freeze({
  id: 'PRACTICE-CUP-01',
  version: 1,
  title: 'Practice notice · Relay Home cup',
  product: 'Relay Home cup (fictional)',
  sku: 'CUP-01',
  lot: 'LOT-A',
  remedy: 'REFUND',
  settlingMerchantId: 'PRACTICE-MERCHANT',
  sourceUrl: '#practice-notice',
  sourceLabel: 'Fictional practice notice',
  sourceNote: 'Written for this exercise. It is not a CPSC, retailer or manufacturer statement, and no real notice is cited.',
  notice: 'Practice exercise, not a public recall. This invented notice covers the Relay Home cup (fictional SKU CUP-01, lot LOT-A). It says the merchant refunds the price of one affected cup after reviewing the customer’s label photograph, the lot code and a short description of the defect. The $34.00 Relay Home tray in the same fictional purchase is outside this notice and its price is not refunded.',
  requirements: [
    {id: 'practice-photo', kind: 'PHOTO', citation: 'Practice notice, requirement 1 of 3', quote: 'Upload a photograph of the product label showing the lot code.'},
    {id: 'practice-lot-confirm', kind: 'CONFIRMATION', citation: 'Practice notice, requirement 2 of 3', quote: 'Confirm the lot code printed on the item matches LOT-A.'},
    {id: 'practice-defect', kind: 'TEXT', citation: 'Practice notice, requirement 3 of 3', quote: 'Describe the defect you observed on the affected cup.'},
  ],
});

const recordedDraft = Object.freeze({
  label: 'Recorded assistant draft',
  recordedAt: '2026-11-01T23:00:00.000Z',
  text: 'Ask for a label photograph, a lot confirmation and a short defect description.',
  note: 'Recorded before this session for the practice case. It is not a live model response, not customer evidence and not an approval.',
});

function campaign() {
  return {
    ...notice,
    requirements: notice.requirements.map(field => field.quote),
    fields: notice.requirements.map(({id, kind, quote}) => ({id, kind, quote, sourceUrl: notice.sourceUrl})),
  };
}

function newClaim(now) {
  const id = randomUUID();
  return {
    id,
    campaign: campaign(),
    access: secret(),
    createdAt: now,
    purchase: {
      id: `PRACTICE-${id.slice(0, 8).toUpperCase()}`,
      version: 1,
      merchantId: notice.settlingMerchantId,
      captureId: `PRACTICE-CAPTURE-${id}`,
      lineId: `${notice.sku}-LINE`,
      sku: notice.sku,
      lot: notice.lot,
      capturedAt: now,
      currency: 'USD',
      linePaidCents: AFFECTED_CENTS,
      lineRefundedCents: 0,
      captureRemainingCents: TOTAL_CENTS,
    },
    submission: null,
    correction: null,
    revision: 0,
    review: null,
  };
}

export class PracticeWorkspace {
  constructor({path = ':memory:', origin = 'http://127.0.0.1:4318', now = () => new Date().toISOString()} = {}) {
    this.now = now;
    this.desk = new ClaimDesk({path, origin, now, provider: () => new SimulatedRefundProvider()});
    // The practice notice is reviewed by construction; customer evidence still
    // needs its own recorded review before a simulated refund is allowed.
    this.desk.setSetting('published', 'yes');
    this.desk.db.exec('CREATE TABLE IF NOT EXISTS practice_sessions (token_hash TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL)');
  }

  open(token) {
    if (token !== undefined && token !== null) {
      if (typeof token !== 'string' || !TOKEN.test(token)) throw new PracticeSessionError('Invalid practice session.');
      const row = this.desk.db.prepare('SELECT data FROM practice_sessions WHERE token_hash=?').get(hash(token));
      if (!row) throw new PracticeSessionError('Unknown practice session.');
      const session = JSON.parse(row.data);
      session.token = token;
      return {session, fresh: false};
    }
    const freshToken = secret();
    const claim = newClaim(this.now());
    const session = {claimId: claim.id, role: 'merchant', attempt: 1, createdAt: this.now()};
    this.desk.saveClaim(claim);
    session.token = freshToken;
    this.save(session);
    return {session, fresh: true, token: freshToken};
  }

  save(session) {
    const {token} = session;
    if (typeof token !== 'string' || !TOKEN.test(token)) throw new PracticeSessionError('Invalid practice session.');
    const {token: _omitted, ...data} = session;
    this.desk.db.prepare('INSERT INTO practice_sessions VALUES (?,?,?) ON CONFLICT(token_hash) DO UPDATE SET data=excluded.data')
      .run(hash(token), JSON.stringify(data), session.createdAt);
  }

  claim(session) {
    try {
      return this.desk.claim(session.claimId);
    } catch {
      throw new PracticeSessionError('This practice case is no longer available. Start a new one.');
    }
  }

  role(session, role) {
    if (!ROLES.has(role)) throw new Error('Choose the merchant or customer view.');
    session.role = role;
    this.save(session);
    return this.view(session);
  }

  submit(session, input) {
    if (session.role !== 'customer') throw new Error('Switch to the customer view to submit evidence.');
    const claim = this.claim(session);
    this.desk.submit(claim.access, input);
    return this.view(session);
  }

  requestChanges(session, input) {
    if (session.role !== 'merchant') throw new Error('Switch to the merchant view to request a correction.');
    this.desk.requestChanges(session.claimId, {
      revision: input.revision,
      message: input.message,
      replacePhoto: input.replacePhoto,
    });
    return this.view(session);
  }

  review(session, input) {
    if (session.role !== 'merchant') throw new Error('Switch to the merchant view to review evidence.');
    this.desk.review(session.claimId, {revision: input.revision, confirmed: input.confirmed});
    return this.view(session);
  }

  async approve(session, input) {
    if (session.role !== 'merchant') throw new Error('Switch to the merchant view to record a simulated refund.');
    if (input.confirmed !== true) throw new Error('Confirm the simulated refund explicitly.');
    const claim = this.claim(session);
    const plan = this.desk.plan(claim);
    if (plan.status !== 'READY_FOR_APPROVAL')
      throw new Error(plan.reason || 'Review the current evidence before recording a simulated refund.');
    await this.desk.approve(session.claimId, {digest: plan.digest});
    return this.view(session);
  }

  restart(session) {
    if (session.role !== 'merchant') throw new Error('Switch to the merchant view to start a new practice case.');
    const claim = newClaim(this.now());
    this.desk.saveClaim(claim);
    session.claimId = claim.id;
    session.attempt += 1;
    this.save(session);
    return this.view(session);
  }

  status(claim, reservation, missing, plan) {
    if (reservation) {
      const code = reservation.state;
      const reason = code === 'COMPLETED'
        ? 'Simulated refund recorded on this practice case. No payment provider was contacted and no funds moved.'
        : code === 'PENDING'
          ? 'A simulated refund is marked as processing. Nothing was sent.'
          : 'A simulated refund attempt is recorded and needs attention. No funds moved.';
      return {code, reason};
    }
    if (!claim.submission) return {code: 'AWAITING_CUSTOMER', reason: 'Complete the practice claim below.'};
    if (claim.correction?.state === 'REQUESTED')
      return {code: 'NEEDS_INFORMATION', reason: 'The merchant requested a change. Read the message and update the claim below.'};
    if (missing.length) return {code: 'NEEDS_INFORMATION', reason: 'The claim is saved. Add the missing information below.'};
    if (claim.submission.lot !== notice.lot)
      return {code: 'MANUAL', reason: 'The lot differs from the practice notice. The merchant reviews it manually.'};
    if (plan.status === 'MANUAL')
      return {code: 'MANUAL', reason: plan.reason};
    if (claim.review) return {code: plan.status, reason: 'Evidence reviewed for this version. Waiting for the merchant’s simulated refund decision.'};
    return {code: 'SUBMITTED', reason: 'The claim is with the merchant for review.'};
  }

  view(session) {
    const claim = this.claim(session);
    const reservation = this.desk.reservation(claim);
    const missing = this.desk.missing(claim);
    const plan = this.desk.plan(claim);
    const correction = claim.correction ? (({photoHash, ...visible}) => visible)(claim.correction) : null;
    const status = this.status(claim, reservation, missing, plan);
    const review = claim.review && claim.review.revision === claim.revision
      ? {revision: claim.review.revision, reviewedAt: claim.review.reviewedAt}
      : null;
    return {
      mode: 'practice',
      simulated: true,
      role: session.role,
      attempt: session.attempt,
      scenario: {
        title: notice.title,
        product: notice.product,
        sku: notice.sku,
        lot: notice.lot,
        notice: notice.notice,
        sourceLabel: notice.sourceLabel,
        sourceNote: notice.sourceNote,
        requirements: notice.requirements,
        recordedDraft,
        totalCents: TOTAL_CENTS,
        affectedCents: AFFECTED_CENTS,
        unaffectedCents: UNAFFECTED_CENTS,
      },
      case: {
        id: claim.purchase.id,
        revision: claim.revision,
        status,
        missing,
        plan: {status: plan.status, reason: plan.reason},
        review,
        correction,
        locked: Boolean(reservation),
        submittedAt: claim.submission?.submittedAt || null,
        submission: claim.submission
          ? {lot: claim.submission.lot, acknowledged: claim.submission.acknowledged, hasPhoto: Boolean(claim.submission.photo), extra: claim.submission.extra || {}}
          : null,
        photo: claim.submission?.photo || null,
        refund: reservation
          ? {state: reservation.state, cents: reservation.cents, currency: reservation.currency, reference: reservation.refund_id, simulated: true}
          : null,
      },
      boundary: {
        storage: 'Practice data stays with this browser session in its own store.',
        provider: 'No payment provider is connected and no funds move.',
        assistant: 'No live model calls; the draft shown is recorded.',
      },
    };
  }

  close() { this.desk.close(); }
}

export const practiceFixture = Object.freeze({notice, recordedDraft, AFFECTED_CENTS, UNAFFECTED_CENTS, TOTAL_CENTS});
