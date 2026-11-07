import {casesForView,views} from './case-views.mjs';
const cents=value=>Number.isSafeInteger(value)&&value>=0;
// Each server-owned claim contributes once. Imported ledger declarations are never
// mixed into this view; a planning total is not a provider-confirmed liability.
export function incidentOverview(cases=[]){
  const unique=new Map();
  for(const item of cases){
    if(!item?.id||unique.has(item.id))throw new Error('Claim identities must be unique before calculating the overview.');
    unique.set(item.id,item);
  }
  const groups=Object.keys(views).map(view=>{
    const rows=casesForView([...unique.values()],view);
    let amountCents=0,unknownAmounts=0;
    for(const row of rows){
      const amount=row.status.code==='COMPLETED'?row.receipt?.amountCents:row.payment?.cents??row.amountCents;
      if(!cents(amount)){unknownAmounts++;continue;}
      if(!Number.isSafeInteger(amountCents+amount))throw new Error('The overview amount exceeds the supported range.');
      amountCents+=amount;
    }
    return {view,label:views[view],count:rows.length,amountCents,unknownAmounts};
  });
  return {groups,claimCount:unique.size,currency:'USD',basis:'Saved workspace claims only. Imported ledger declarations are separate; unresolved amounts require review and are not approved refunds.'};
}
