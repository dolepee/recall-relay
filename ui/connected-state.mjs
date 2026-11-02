// Pure projection for the connected review panels. Payment lifecycle wins over
// the pre-settlement plan/evidence projection: a completed receipt is not a
// fresh approval and a terminal failure is not a "ready" claim.
const paymentLabels={
  COMPLETED:'Refund confirmed',
  PENDING:'PayPal processing',
  UNKNOWN:'Payment result unknown',
  RESERVED:'Refund reserved, not sent',
  FAILED:'Refund failed — manual reconciliation',
  CANCELLED:'Refund cancelled — manual reconciliation',
  NONE:'No payment attempt',
};
const paymentBlockers={
  COMPLETED:null,
  PENDING:'PayPal is processing the refund. Do not send another refund; check the provider status.',
  UNKNOWN:'The payment result is unknown. Check PayPal status before any further action; no additional refund has been sent.',
  RESERVED:'The refund is reserved but not sent. Check the original payment before resuming the existing request.',
  FAILED:'PayPal reported the refund failed. The merchant must reconcile the original payment before choosing another remedy. No replacement refund has been sent.',
  CANCELLED:'PayPal reported the refund cancelled. The merchant must reconcile the original payment before choosing another remedy. No replacement refund has been sent.',
  NONE:null,
};
export function projectClaimState(item){
  const paymentState=item.receipt?'COMPLETED':item.payment?.state||'NONE';
  const paymentLabel=paymentLabels[paymentState]||paymentState;
  if(paymentState==='COMPLETED'){
    return {paymentState,paymentLabel,settlementComplete:true,planLabel:'Settlement complete',planReason:item.receipt?'PayPal confirmed the refund to the original payment.':'Payment record is complete.',blockers:[],lockNote:'Completed record. Evidence and payment details are locked and read-only; no further refund action is available.',nextAction:'No further refund action.'};
  }
  const blockers=[];
  const add=value=>{if(value&&!blockers.includes(value))blockers.push(value);};
  const paymentBlocker=paymentBlockers[paymentState];
  if(paymentBlocker)add(paymentBlocker);
  if(['PENDING','UNKNOWN','RESERVED','FAILED','CANCELLED'].includes(paymentState)){
    return {paymentState,paymentLabel,settlementComplete:false,planLabel:paymentState==='FAILED'||paymentState==='CANCELLED'?'Manual reconciliation':'Payment checking',planReason:paymentBlocker,blockers,lockNote:item.locked?'The evidence and payment record are locked to this payment attempt.':null,nextAction:paymentBlocker};
  }
  for(const missing of item.missing||[])add(missing);
  if(item.correction?.state==='REQUESTED')add(`Correction requested: ${item.correction.message}`);
  if(item.submission?.lot&&item.campaign?.lot&&item.submission.lot!==item.campaign.lot)add(`Lot mismatch: customer ${item.submission.lot}, expected ${item.campaign.lot}.`);
  if(!item.submission)add('No customer submission yet.');
  for(const entry of item.campaign?.coverage||[])if(['UNRESOLVED','MANUAL'].includes(entry.disposition))add(`${entry.disposition==='MANUAL'?'Manual':'Unresolved'}: ${entry.reason||entry.quote}`);
  const planStatus=item.plan?.status||null;
  if(planStatus==='MANUAL'||planStatus==='NOT_MATCHED'||planStatus==='ALREADY_REFUNDED')add(item.plan.reason||'Manual review required.');
  else if(planStatus==='REVIEW')add(item.plan.reason||'Evidence review required.');
  const planLabel=planStatus==='READY_FOR_APPROVAL'?'Ready for merchant approval':planStatus==='REVIEW'?'Review required':planStatus==='MANUAL'||planStatus==='NOT_MATCHED'?'Manual review':planStatus==='ALREADY_REFUNDED'?'Already refunded':planStatus||'Not prepared';
  return {paymentState,paymentLabel,settlementComplete:false,planLabel,planReason:item.plan?.reason||'',blockers,lockNote:item.locked?'The evidence and payment record are locked to this payment attempt.':null,nextAction:blockers[0]||'No recorded blocker.'};
}
