export const views={ALL:'All claims',READY:'Ready for merchant approval',WAITING:'Waiting for customer information',MANUAL:'Needs manual review',PAYMENT:'Payment needs checking',COMPLETED:'Confirmed refunds'};
export function casesForView(cases,view){
  const groups={READY:['READY_FOR_APPROVAL'],WAITING:['AWAITING_CUSTOMER','NEEDS_INFORMATION'],MANUAL:['MANUAL','REVIEW','SUBMITTED'],PAYMENT:['RESERVED','UNKNOWN','PENDING','FAILED','CANCELLED'],COMPLETED:['COMPLETED']};
  return view==='ALL'?cases:cases.filter(c=>groups[view]?.includes(c.status.code));
}
