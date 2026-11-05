// Describe the next merchant action without implying settlement eligibility.
export function nextReconciliationStep(row){
 if(row.scope==='EXCLUDED')return {title:'Outside recall scope',description:'This product or lot is outside the reviewed scope. No claim is opened from this row.'};
 if(row.readiness==='BLOCKED')return {title:'Resolve manually',description:'Resolve the purchase identity or allocation conflict before continuing. This row is excluded from the planning total.'};
 if(row.readiness==='LINKED_CLAIM')return {title:'Open linked claim',description:'A saved claim matches this purchase line. Open it to check current evidence, review and payment status; this plan does not establish refund eligibility.'};
 if(row.readiness==='NEEDS_EVIDENCE')return {title:'Collect missing evidence',description:row.correction?'The assumed lot changes planning only. Obtain product evidence before treating it as a confirmed match.':'Confirm the missing product or lot information. A planning assumption does not replace evidence.'};
 return {title:'Check purchase binding',description:'Link an authorized purchase record with its item allocation. A capture reference alone does not establish ownership or a refundable amount.'};
}
