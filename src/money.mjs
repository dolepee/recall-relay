export function usdAmount(cents) {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error('Positive integer cents required.');
  return { value: `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`, currency_code: 'USD' };
}

export function usdCents(amount) {
  if (amount?.currency_code !== 'USD' || typeof amount.value !== 'string' || !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(amount.value))
    throw new Error('Unrecognized USD amount; keep the case unresolved.');
  const [whole, fraction = ''] = amount.value.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount exceeds exact integer range.');
  return Number(cents);
}
