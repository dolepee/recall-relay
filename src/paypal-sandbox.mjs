import { usdAmount, usdCents } from './money.mjs';
import {Buffer} from 'node:buffer';

// Fixed sandbox origin: this spike cannot be configured to spend live money.
const ORIGIN = 'https://api-m.sandbox.paypal.com';
const resourceId = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error('Invalid PayPal resource ID.');
  return encodeURIComponent(value);
};
const requestHeaders = id => {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,38}$/.test(id)) throw new Error('A stable request ID is required.');
  return { 'PayPal-Request-Id': id };
};

export class PayPalSandbox {
  constructor({ token, fetchImpl = fetch }) {
    if (typeof token !== 'string' || !token) throw new Error('A sandbox access token is required.');
    this.token = token;
    this.fetch = (...args) => fetchImpl(...args);
  }

  static async fromCredentials({ clientId, clientSecret, fetchImpl = fetch }) {
    if (typeof clientId !== 'string' || !clientId || clientId.includes(':') || typeof clientSecret !== 'string' || !clientSecret)
      throw new Error('Sandbox client ID and secret are required.');
    const response = await fetchImpl(`${ORIGIN}/v1/oauth2/token`, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (!response.ok) throw new Error(`PayPal sandbox authentication HTTP ${response.status}.`);
    const data = await response.json();
    if (data.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(data.expires_in) || data.expires_in <= 0)
      throw new Error('Unrecognized sandbox authentication response.');
    return new PayPalSandbox({ token: data.access_token, fetchImpl });
  }

  // Caller persists the request ID before invoking these methods. No automatic retries.
  async createOrder({ cents, requestId, referenceId, returnUrl, cancelUrl }) {
    const context = returnUrl ? { payment_source: { paypal: { experience_context: {
      return_url: returnUrl, cancel_url: cancelUrl, user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING',
    } } } } : {};
    return this.#request('/v2/checkout/orders', {
      method: 'POST', headers: requestHeaders(requestId),
      body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ ...(referenceId ? {reference_id: referenceId} : {}), amount: usdAmount(cents), description: 'Recall Relay sandbox test purchase' }], ...context }),
    });
  }

  async orderDetails(orderId) {
    return this.#request(`/v2/checkout/orders/${resourceId(orderId)}`, { method: 'GET' });
  }

  async captureOrder({ orderId, requestId }) {
    return this.#request(`/v2/checkout/orders/${resourceId(orderId)}/capture`, { method: 'POST', headers: requestHeaders(requestId), body: '{}' });
  }

  async captureDetails(captureId) {
    return this.#request(`/v2/payments/captures/${resourceId(captureId)}`, { method: 'GET' });
  }

  async refund(reservation) {
    if (reservation.state !== 'UNKNOWN') throw new Error('Journal must record the attempt first.');
    if (!Number.isSafeInteger(reservation.cents) || reservation.cents <= 0 || reservation.currency !== 'USD')
      throw new Error('Unsupported refund amount.');
    return this.#request(`/v2/payments/captures/${resourceId(reservation.capture)}/refund`, {
      method: 'POST',
      headers: requestHeaders(reservation.request_id),
      body: JSON.stringify({ amount: usdAmount(reservation.cents), note_to_payer: 'Merchant-approved product refund' }),
    });
  }

  async details(refundId) {
    return this.#request(`/v2/payments/refunds/${resourceId(refundId)}`, { method: 'GET' });
  }

  // Only an authenticated readback tied to the original capture may settle a case.
  async verifiedRefund(reservation, refundId) {
    const captureId = resourceId(reservation.capture);
    const response = await this.details(refundId);
    const expectedParents = [
      `${ORIGIN}/v2/payments/captures/${captureId}`,
      `https://api.sandbox.paypal.com/v2/payments/captures/${captureId}`,
    ];
    if (response.id !== refundId || reservation.currency !== 'USD' ||
        usdCents(response.amount) !== reservation.cents ||
        !['COMPLETED', 'PENDING', 'FAILED', 'CANCELLED'].includes(response.status) ||
        !expectedParents.includes(response.links?.find(link => link.rel === 'up')?.href))
      throw new Error('Refund evidence does not match the original capture and approved amount.');
    return response;
  }

  async #request(path, init) {
    const response = await this.fetch(`${ORIGIN}${path}`, {
      ...init, redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...init.headers },
    });
    if (!response.ok) throw new Error(`PayPal sandbox HTTP ${response.status}; reconciliation required.`);
    return response.json();
  }
}
