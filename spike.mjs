import { planClaim } from './src/plan.mjs';
import { policy, evidence, purchase, now } from './fixtures.mjs';

const cases = [
  ['eligible', {}], ['unknown lot', { lot: null }], ['different lot', { lot: 'LOT-B' }],
  ['old payment', { capturedAt: '2025-12-01T00:00:00Z' }],
  ['already refunded', { lineRefundedCents: 2599 }],
  ['insufficient balance', { captureRemainingCents: 100 }],
];
console.log('SIMULATED LOCAL SPIKE — no AI inference, PayPal calls, or customer funds');
console.table(cases.map(([scenario, override]) => {
  const plan = planClaim({ policy, evidence, now, purchase: { ...purchase, ...override } });
  return { scenario, status: plan.status, reason: plan.reason ?? '2599 cents ready for exact-action approval' };
}));
