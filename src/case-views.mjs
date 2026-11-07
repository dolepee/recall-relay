export const views={ALL:'All claims',OPEN:'Awaiting resolution',REVIEW:'Needs evidence review',READY:'Ready for merchant approval',WAITING:'Waiting for customer information',MANUAL:'Needs manual review',PAYMENT:'Payment needs checking',COMPLETED:'Confirmed refunds'};
export function casesForView(cases,view){
  const groups={OPEN:['AWAITING_CUSTOMER','NEEDS_INFORMATION','SUBMITTED','REVIEW','READY_FOR_APPROVAL','MANUAL'],REVIEW:['SUBMITTED','REVIEW'],READY:['READY_FOR_APPROVAL'],WAITING:['AWAITING_CUSTOMER','NEEDS_INFORMATION'],MANUAL:['MANUAL'],PAYMENT:['RESERVED','UNKNOWN','PENDING','FAILED','CANCELLED'],COMPLETED:['COMPLETED']};
  return view==='ALL'?cases:cases.filter(c=>groups[view]?.includes(c.status.code));
}
