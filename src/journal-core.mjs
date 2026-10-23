import { randomUUID } from 'node:crypto';
import { approvedAction } from './plan.mjs';
import { usdCents } from './money.mjs';
import {syncTransaction} from './transaction.mjs';

// Offline spike: serializes local reservations before any external payment call.
// A separate authenticated reconciliation boundary is required before production.
export class RefundJournalCore {
  constructor(db) {
    this.db = db;
    this.db.exec(`CREATE TABLE IF NOT EXISTS refunds (
      merchant TEXT NOT NULL, capture TEXT NOT NULL, line TEXT NOT NULL,
      digest TEXT NOT NULL, request_id TEXT NOT NULL UNIQUE,
      cents INTEGER NOT NULL, currency TEXT NOT NULL,
      state TEXT NOT NULL, refund_id TEXT,
      PRIMARY KEY (merchant, capture, line)
    )`);
  }

  reserve(plan, approval, captureRemainingCents) {
    const action = approvedAction(plan, approval);
    if (!Number.isSafeInteger(captureRemainingCents) || captureRemainingCents < 0)
      throw new Error('Invalid capture balance.');
    return syncTransaction(this.db,()=>{
      const previous = this.db.prepare('SELECT * FROM refunds WHERE merchant=? AND capture=? AND line=?')
        .get(action.merchantId, action.captureId, action.lineId);
      if (previous) {
        if (previous.digest !== plan.digest) throw new Error('Existing line reservation requires reconciliation.');
        return { ...previous, replay: true };
      }
      const reserved = this.db.prepare('SELECT COALESCE(SUM(cents),0) AS cents FROM refunds WHERE merchant=? AND capture=?')
        .get(action.merchantId, action.captureId).cents;
      // Deliberately conservative: settled rows continue to consume the local budget.
      // This can require manual reconciliation; it never invents available funds.
      if (reserved + action.amountCents > captureRemainingCents)
        throw new Error('Capture balance cannot cover all reserved refunds.');
      const requestId = randomUUID();
      this.db.prepare('INSERT INTO refunds VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)').run(
        action.merchantId, action.captureId, action.lineId, plan.digest,
        requestId, action.amountCents, action.currency, 'RESERVED');
      return this.get(requestId);
    });
  }

  get(id) { return this.db.prepare('SELECT * FROM refunds WHERE request_id=?').get(id); }

  begin(id) {
    const changed = this.db.prepare("UPDATE refunds SET state='UNKNOWN' WHERE request_id=? AND state='RESERVED'").run(id);
    if (!changed.changes) throw new Error('Already attempted; reconcile the existing request before any resend.');
    return this.get(id);
  }

  observe(id, response) {
    if (typeof response?.id !== 'string' || !response.id || !['COMPLETED', 'PENDING', 'FAILED', 'CANCELLED'].includes(response.status))
      throw new Error('Unrecognized refund result; keep the case unresolved.');
    const row = this.get(id);
    if (!row || row.state === 'RESERVED') throw new Error('No attempted refund.');
    if (row.currency !== 'USD' || usdCents(response.amount) !== row.cents)
      throw new Error('Refund amount does not match the approved amount.');
    if (row.refund_id && row.refund_id !== response.id) throw new Error('Refund ID changed.');
    if (row.state === 'COMPLETED' && response.status !== 'COMPLETED')
      throw new Error('A stale observation cannot undo completed payment evidence.');
    this.db.prepare('UPDATE refunds SET state=?, refund_id=? WHERE request_id=?').run(response.status, response.id, id);
    return this.get(id);
  }

  close() { this.db.close(); }
}
