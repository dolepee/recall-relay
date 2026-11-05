import {WorkspaceHistory} from './workspace-history.mjs';
import { randomUUID } from 'node:crypto';
import { approvedAction } from './plan.mjs';
import { usdCents } from './money.mjs';
import {syncTransaction} from './transaction.mjs';

// Offline spike: serializes local reservations before any external payment call.
// A separate authenticated reconciliation boundary is required before production.
export class RefundJournalCore {
  constructor(db) {
    this.db = db;this.now=()=>new Date().toISOString();this.historyEnabled=true;this.history=new WorkspaceHistory(db,{now:()=>this.now()});
    db.exec('CREATE TABLE IF NOT EXISTS refund_attempt_meta(request_id TEXT PRIMARY KEY, data TEXT NOT NULL)');
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
      const meta={approvedAt:this.now(),actor:approval.actor,correlation:'rr-'+requestId,planDigest:plan.digest};this.db.prepare('INSERT INTO refund_attempt_meta VALUES (?,?)').run(requestId,JSON.stringify(meta));if(this.historyEnabled)this.history.append('REFUND',requestId,'REFUND_APPROVED',{...this.get(requestId),approval:meta});
      return this.get(requestId);
    });
  }

  get(id) { return this.db.prepare('SELECT * FROM refunds WHERE request_id=?').get(id); }

  metadata(id){const r=this.db.prepare('SELECT data FROM refund_attempt_meta WHERE request_id=?').get(id);return r?JSON.parse(r.data):null;}
  begin(id) {return syncTransaction(this.db,()=>{
    const changed = this.db.prepare("UPDATE refunds SET state='UNKNOWN' WHERE request_id=? AND state='RESERVED'").run(id);
    if (!changed.changes) throw new Error('Already attempted; reconcile the existing request before any resend.');
    if(this.historyEnabled)this.history.append('REFUND',id,'DISPATCH_BOUNDARY_RECORDED',this.get(id),'system-payment-dispatch');
    return this.get(id);
  });}

  observe(id, response) {return syncTransaction(this.db,()=>{
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
    if(this.historyEnabled)this.history.append('REFUND',id,'PROVIDER_OBSERVED',{...this.get(id),providerObservation:response},'system-provider-readback');
    return this.get(id);
  });}

  close() { this.db.close(); }
}
