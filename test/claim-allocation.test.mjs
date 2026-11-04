import test from 'node:test';
import assert from 'node:assert/strict';
import {claimAllocation} from '../src/claim-allocation.mjs';

test('display allocation uses the immutable verified original, not remaining/refunded cents',()=>{
  const purchase={currency:'USD',originalCaptureCents:7350,linePaidCents:3875,lineRefundedCents:3875,captureRemainingCents:3475};
  assert.deepEqual(claimAllocation(purchase),{currency:'USD',originalCents:7350,affectedCents:3875,excludedCents:3475});
  assert.equal(purchase.originalCaptureCents,7350);
});
test('legacy or invalid breakdowns stay unavailable rather than guessing',()=>{
  for(const purchase of [
    {currency:'USD',linePaidCents:2599,captureRemainingCents:5999},
    {currency:'USD',originalCaptureCents:100,linePaidCents:101},
    {currency:'USD',originalCaptureCents:5999.5,linePaidCents:2599},
    {currency:'EUR',originalCaptureCents:5999,linePaidCents:2599},
  ]) assert.equal(claimAllocation(purchase),null);
});
