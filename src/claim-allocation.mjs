// A display projection, never payment authority. Original capture amounts are
// recorded only while verifying the purchase; a remaining balance is not one.
export function claimAllocation(purchase) {
  const original = purchase.originalCaptureCents;
  const affected = purchase.linePaidCents;
  if (purchase.currency !== 'USD' || !Number.isSafeInteger(original) ||
      !Number.isSafeInteger(affected) || affected <= 0 || original < affected ||
      original > 100_000_000) return null;
  return {currency:'USD', originalCents:original, affectedCents:affected, excludedCents:original-affected};
}
