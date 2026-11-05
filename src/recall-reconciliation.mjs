import {createHash} from 'node:crypto';
import {advisoryPrompt,validateAdvisory} from './case-advisory.mjs';
import {previewLedger} from './ledger-preview.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cents=n=>Number.isSafeInteger(n)&&n>=0;

// Pure planning projection. Callers supply saved server-owned claims, never
// provider facts from the ledger. No provider, approval or payment access here.
export function reconcileLedger({ledger,corrections=[]},policy,claims=[],now){
  const preview=previewLedger(ledger,policy);
  if(!policy?.sku||!policy?.lot)throw new Error('Publish reviewed instructions before reconciling purchases.');
  if(!Array.isArray(corrections)||corrections.length>200)throw new Error('Use at most 200 planning corrections.');
  const edits=new Map();
  for(const edit of corrections){
    if(!edit||Object.keys(edit).some(k=>!['rowKey','lot','reason'].includes(k))||typeof edit.rowKey!=='string'||typeof edit.lot!=='string'||!edit.lot.trim()||edit.lot.length>80||typeof edit.reason!=='string'||!edit.reason.trim()||edit.reason.length>350||edits.has(edit.rowKey))throw new Error('Each correction needs a unique row, lot and explanation.');
    edits.set(edit.rowKey,{lot:edit.lot.trim(),reason:edit.reason.trim()});
  }
  const repeats=new Map();for(const order of preview.orders)if(order.captureId)repeats.set(order.captureId,(repeats.get(order.captureId)||0)+1);
  const lines=preview.lines.map(row=>{
    const rowKey=`${row.orderIndex}:${row.lineIndex}`,edit=edits.get(rowKey);edits.delete(rowKey);
    const lot=edit?.lot??row.lot;
    const excluded=row.sku&&row.sku!==policy.sku||row.lot&&row.lot!==policy.lot;
    const scope=excluded?'EXCLUDED':!row.sku||!lot?'UNKNOWN':lot!==policy.lot?'EXCLUDED':'AFFECTED';
    const reasons=[];
    let readiness='NEEDS_BINDING',action={kind:'BINDING',label:'Review purchase binding'},evidence=null;
    const declaredRemaining=cents(row.itemPaidCents)&&cents(row.refundedCents)&&row.itemPaidCents>=row.refundedCents?row.itemPaidCents-row.refundedCents:null;
    const candidates=claims.filter(c=>c.purchase.captureId===row.declaredCaptureId&&c.purchase.sku===row.sku&&c.purchase.lot===row.lot);
    if(scope==='EXCLUDED'){readiness='BLOCKED';action=null;reasons.push('Outside the reviewed product and lot scope.');}
    else if(edit||scope==='UNKNOWN'){readiness='NEEDS_EVIDENCE';action={kind:'EVIDENCE',label:'Review missing lot evidence'};reasons.push(edit?'Planning correction is a merchant assumption, not verified product evidence.':'Product or lot is unknown.');}
    else if(!row.declaredCaptureId||repeats.get(row.declaredCaptureId)>1||candidates.length>1){readiness='BLOCKED';action=null;reasons.push('Missing or repeated capture identity requires manual reconciliation.');}
    else if(candidates.length===1){
      const c=candidates[0],p=c.purchase;
      // Exact item amount and a unique full single-unit declaration are required.
      const samePolicy=(!policy.id||c.campaign?.id===policy.id)&&(!policy.sourceDigest||c.campaign?.sourceDigest===policy.sourceDigest);
      const same=samePolicy&&preview.lines.filter(r=>r.orderIndex===row.orderIndex&&r.sku===row.sku&&r.lot===row.lot).length===1&&row.quantity===1&&row.taxCents===0&&row.shippingCents===0&&row.itemPaidCents===p.linePaidCents&&row.refundedCents===p.lineRefundedCents;
      if(same){
        readiness='LINKED_CLAIM';action={kind:'CLAIM',claimId:c.id,order:p.id,label:'Open existing claim'};
        evidence={snapshotId:hash({id:c.id,purchase:p}).slice(0,24),recordedAt:p.provenance?.providerVerifiedAt||c.createdAt,amountAsOfSnapshotCents:p.linePaidCents-p.lineRefundedCents,provenance:'SAVED_WORKSPACE_PURCHASE',claimRevision:c.revision,currentRefundableCents:null};
        reasons.push('Saved purchase allocation matched. Open the claim for its current review and payment state. Historical amount is not current refundability.');
      }else{readiness='BLOCKED';action=null;reasons.push('Declared item allocation differs from the saved purchase; do not infer a new allocation.');}
    }else reasons.push('No matching saved claim. Capture ID alone cannot establish line ownership or allocation.');
    if(declaredRemaining===null)reasons.push('Declared remaining amount is unknown or inconsistent.');
    return {rowKey,orderId:row.orderId,declaredLineId:row.declaredLineId,sku:row.sku,lot:row.lot,planningLot:lot,scope,readiness,declaredRemainingCents:declaredRemaining,amountProvenance:'MERCHANT_DECLARED',correction:edit?{...edit,provenance:'MERCHANT_ASSUMPTION'}:null,evidence,action,reasons,paymentAllowed:false};
  });
  if(edits.size)throw new Error('A planning correction refers to a missing row.');
  const summary={affected:0,excluded:0,unknown:0,linked:0,declaredAffectedCents:0,unknownAffectedAmounts:0,currentRefundableCents:null};
  for(const line of lines){summary[line.scope.toLowerCase()]++;if(line.readiness==='LINKED_CLAIM')summary.linked++;if(line.scope==='AFFECTED'){if(line.declaredRemainingCents===null)summary.unknownAffectedAmounts++;else if(line.readiness!=='BLOCKED')summary.declaredAffectedCents+=line.declaredRemainingCents;}}
  const scope={sku:policy.sku,lot:policy.lot,sourceDigest:policy.sourceDigest||null,clauses:(policy.coverage||[]).map(c=>({id:c.id,quote:c.quote}))};
  return {ledger,mode:'RECONCILIATION_PLAN',version:1,createdAt:now,scope,source:preview.source,lines,summary,paymentAllowed:false,providerChecked:false,digest:hash({scope,ledger,lines})};
}

export async function reconciliationAdvice(ai,desk,input){
  if(!input||Object.keys(input).join()!=='planId'||typeof input.planId!=='string')throw new Error('Choose a saved reconciliation plan.');
  const row=desk.db.prepare('SELECT data FROM reconciliation_plans WHERE id=?').get(input.planId);
  if(!row)throw new Error('Unknown reconciliation plan.');
  const plan=JSON.parse(row.data),context={clauses:plan.scope.clauses.map(c=>({citationId:c.id,quote:c.quote}))};
  if(!context.clauses.length)throw new Error('This plan has no source clauses to interpret.');
  const status=ai.advisoryStatus?.()||ai.status();if(!status.available)throw new Error('AI is unavailable. Read the complete source quotations.');
  const raw=await ai.generate(advisoryPrompt,{clauses:context.clauses},{maxTokens:3500,advisory:true});
  return {planId:plan.id,model:status.model,readOnly:true,clauses:validateAdvisory(raw,context)};
}
