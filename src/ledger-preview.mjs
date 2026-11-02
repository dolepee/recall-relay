// Merchant declarations only. This module has no provider, journal or claim access.
// Preview rows never grant payment authority or allocate a provider capture.
export const LEDGER_LIMITS = Object.freeze({orders:50, lines:200, cents:100_000_000});
function object(value, keys, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path}: expected an object.`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`${path}: unexpected field ${key}.`);
  return value;
}
function text(value, path, max=128, nullable=false) {
  if (nullable && value===null) return null;
  if (typeof value!=='string' || !value.trim() || value.length>max || /[\u0000-\u001f]/.test(value)) throw new Error(`${path}: use 1–${max} characters.`);
  return value.trim();
}
function integer(value, path, max=LEDGER_LIMITS.cents) {
  if (value===null || value==='UNKNOWN') return null;
  if (!Number.isSafeInteger(value) || value<0 || value>max) throw new Error(`${path}: use nonnegative integer cents or null for unknown.`);
  return value;
}
export function previewLedger(input, policy) {
  object(input,['version','currency','source','orders'],'ledger');
  if (input.version!==1 || input.currency!=='USD') throw new Error('Use ledger version 1 and USD.');
  object(input.source,['kind','label','reference'],'source');
  if(input.source.kind!=='merchant-ledger')throw new Error('source.kind must be merchant-ledger.');
  const source={kind:'merchant-ledger',label:text(input.source.label,'source.label',160),reference:input.source.reference==null?null:text(input.source.reference,'source.reference')};
  if (!Array.isArray(input.orders) || !input.orders.length || input.orders.length>LEDGER_LIMITS.orders) throw new Error(`Supply 1–${LEDGER_LIMITS.orders} orders.`);
  const rows=[], orders=[], captures=new Map();
  for (const [oi,raw] of input.orders.entries()) {
    const path=`orders[${oi}]`;
    object(raw,['orderId','captureId','capturedAt','status','lines'],path);
    const order={orderId:text(raw.orderId,`${path}.orderId`),captureId:text(raw.captureId,`${path}.captureId`,128,true),capturedAt:text(raw.capturedAt,`${path}.capturedAt`,40,true),status:text(raw.status,`${path}.status`,40,true)};
    if(order.capturedAt!==null&&!Number.isFinite(Date.parse(order.capturedAt)))throw new Error(`${path}.capturedAt: invalid date; use null if unknown.`);
    if(!Array.isArray(raw.lines)||!raw.lines.length||rows.length+raw.lines.length>LEDGER_LIMITS.lines)throw new Error(`Supply nonempty orders with at most ${LEDGER_LIMITS.lines} total lines.`);
    orders.push({...order,captureVerified:false,providerFacts:null});
    if(order.captureId){const group=captures.get(order.captureId)||[];group.push(oi);captures.set(order.captureId,group);}
    const ids=new Set();
    for(const [li,line] of raw.lines.entries()) {
      const lp=`${path}.lines[${li}]`;
      object(line,['declaredLineId','sku','lot','quantity','itemPaidCents','taxCents','shippingCents','refundedCents'],lp);
      const clean={declaredLineId:text(line.declaredLineId,`${lp}.declaredLineId`),sku:text(line.sku,`${lp}.sku`,80,true),lot:text(line.lot,`${lp}.lot`,80,true),quantity:integer(line.quantity,`${lp}.quantity`,10000)};
      for(const key of ['itemPaidCents','taxCents','shippingCents','refundedCents'])clean[key]=integer(line[key],`${lp}.${key}`);
      if(ids.has(clean.declaredLineId))throw new Error(`${lp}.declaredLineId: duplicate line reference within the order.`);
      ids.add(clean.declaredLineId);
      const reasons=[];
      let disposition='AFFECTED';
      if(!policy?.sku || !policy?.lot){disposition='MANUAL';reasons.push('Publish reviewed product and lot scope first.');}
      else if(!clean.sku){disposition='MANUAL';reasons.push('Product SKU is unknown.');}
      else if(clean.sku!==policy.sku){disposition='UNAFFECTED';reasons.push('Declared SKU is outside this campaign.');}
      else if(clean.lot!==policy.lot){disposition='MANUAL';reasons.push('Declared lot is missing or differs; review scope manually.');}
      if(disposition!=='UNAFFECTED') {
        if(!order.captureId||!order.capturedAt||order.status!=='COMPLETED')reasons.push('Declared capture, date or completed status is missing.');
        if(clean.quantity!==1)reasons.push('Only a full single-unit line is supported for this preview.');
        if(['itemPaidCents','taxCents','shippingCents','refundedCents'].some(k=>clean[k]===null))reasons.push('An amount or allocation is unknown.');
        if(clean.taxCents>0||clean.shippingCents>0)reasons.push('Tax or shipping allocation requires manual review.');
        if(clean.refundedCents!==null&&clean.itemPaidCents!==null&&clean.refundedCents>=clean.itemPaidCents)reasons.push('No supported positive line balance remains.');
        if(reasons.length)disposition='MANUAL';
      }
      rows.push({...clean,orderIndex:oi,lineIndex:li,orderId:order.orderId,declaredCaptureId:order.captureId,disposition,reasons,candidateCents:disposition==='AFFECTED'?clean.itemPaidCents-clean.refundedCents:null,allocationId:null,verification:'UNVERIFIED',paymentAllowed:false});
    }
  }
  // A renamed order/line cannot inflate the candidate total for a repeated capture.
  // Without trusted line provenance, flag every occurrence rather than guessing.
  for(const row of rows)if(row.declaredCaptureId&&captures.get(row.declaredCaptureId).length>1){row.disposition='MANUAL';row.candidateCents=null;row.reasons.push('Capture repeated across declared orders; reconcile duplicates before binding.');}
  // The supported path allocates one affected line per capture. Multiple same-scope
  // declarations need reconciliation even when the caller gives each a new line ID.
  for(let oi=0;oi<orders.length;oi++){
    const scoped=rows.filter(row=>row.orderIndex===oi&&row.sku===policy?.sku&&row.lot===policy?.lot);
    if(scoped.length>1)for(const row of scoped){row.disposition='MANUAL';row.candidateCents=null;row.reasons.push('Multiple affected lines in one capture require allocation review.');}
  }
  const summary={affectedCount:0,unaffectedCount:0,manualCount:0,candidateCents:0,verifiedRefundableCents:null,confirmedRefundCents:null};
  for(const row of rows){summary[{AFFECTED:'affectedCount',UNAFFECTED:'unaffectedCount',MANUAL:'manualCount'}[row.disposition]]++;summary.candidateCents+=row.candidateCents||0;}
  return {version:1,mode:'DECLARED_PREVIEW',currency:'USD',source,scope:{sku:policy?.sku||null,lot:policy?.lot||null},orders,lines:rows,summary,persisted:false,providerChecked:false,paymentAllowed:false};
}
