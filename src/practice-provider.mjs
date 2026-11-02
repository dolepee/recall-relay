import {randomUUID} from 'node:crypto';
import {usdAmount} from './money.mjs';

// Deliberately local: this provider has no HTTP client, no credentials and no
// import path to a payment adapter. It exists so the reviewed claim state
// machine can settle a practice case without touching a payment service.
const CAPTURE_TOTAL_CENTS = 5999;
const AFFECTED_ITEM_CENTS = 2599;

export class SimulatedRefundProvider {
  async captureDetails(captureId) {
    if (typeof captureId !== 'string' || !captureId.startsWith('PRACTICE-CAPTURE-'))
      throw new Error('Practice capture not found.');
    return {id: captureId, status: 'COMPLETED', amount: usdAmount(CAPTURE_TOTAL_CENTS)};
  }

  async refund(reservation) {
    if (reservation?.state !== 'UNKNOWN') throw new Error('Practice journal must record the attempt first.');
    if (reservation.currency !== 'USD' || reservation.cents !== AFFECTED_ITEM_CENTS)
      throw new Error('Practice refund must match the affected item only.');
    return {
      id: `PRACTICE-REFUND-${randomUUID().replaceAll('-', '')}`,
      status: 'COMPLETED',
      amount: usdAmount(AFFECTED_ITEM_CENTS),
      simulated: true,
    };
  }

  async verifiedRefund(reservation, refundId) {
    if (typeof refundId !== 'string' || !refundId.startsWith('PRACTICE-REFUND-'))
      throw new Error('Practice refund reference is invalid.');
    return {
      id: refundId,
      status: 'COMPLETED',
      amount: usdAmount(AFFECTED_ITEM_CENTS),
      simulated: true,
    };
  }
}
