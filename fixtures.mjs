// Invented records. No real purchaser, merchant, capture, recall policy, or payment.
export const now = '2026-10-19T21:30:00Z';
export const policy = {
  id: 'FIXTURE-RECALL', version: 1, reviewedBy: 'fixture-merchant',
  sourceUrl: 'https://example.com/fictional-recall', remedy: 'REFUND',
  settlingMerchantId: 'FIXTURE-MERCHANT', skus: ['CUP-01'], lots: ['LOT-A'],
  requiredEvidence: ['remedy-confirmation'],
};
export const evidence = { 'remedy-confirmation': { reviewedBy: 'fixture-reviewer', record: 'synthetic-attestation' } };
export const purchase = {
  id: 'ORDER-1', version: 1, merchantId: 'FIXTURE-MERCHANT',
  captureId: 'FIXTURE-CAPTURE', lineId: 'LINE-1', sku: 'CUP-01', lot: 'LOT-A',
  capturedAt: '2026-10-01T12:00:00Z', currency: 'USD',
  linePaidCents: 2599, lineRefundedCents: 0, captureRemainingCents: 5999,
};
