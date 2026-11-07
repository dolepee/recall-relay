// A saved plan is historical. Resolve its exact identity against fresh desk
// state before selecting; never let a missing order fall back to another case.
export async function loadLinkedClaim(readState,order,claimId){
  const fresh=await readState();
  if(!fresh?.cases?.some(c=>c.order===order&&c.id===claimId))throw new Error('The linked claim is no longer available in this workspace. Refresh reconciliation; no other claim was opened.');
  return fresh;
}

export function purchaseHandoff(row){
  if(!row||row.scope==='EXCLUDED'||row.readiness==='BLOCKED'||row.readiness==='LINKED_CLAIM')return null;
  const identity=`${row.orderId} / ${row.declaredLineId}`;
  const binding=row.readiness==='NEEDS_BINDING';
  return {
    kind:binding?'BINDING':'EVIDENCE',
    title:binding?'Prepare this purchase for binding':'Collect the missing product information',
    text:binding?`Purchase evidence request: ${identity}\nDeclared SKU: ${row.sku||'unknown'}; lot: ${row.lot||'unknown'}.\nProvide the merchant-owned Sandbox capture record and its itemized order, exact affected-line allocation, currency, quantity and any previous refunds. An operator must provision that record for this workspace before binding. Do not send passwords or API secrets.\nThis request is planning information only; it does not create a claim, prove ownership or authorize a refund.`:`Product information request: ${identity}\nPlease provide the actual product identifier and lot code printed on the product label. Do not substitute our planning assumption for what is printed. The merchant must compare this information with the reviewed notice before continuing.\nThis draft is not sent automatically. It does not establish eligibility or authorize a refund.`,
  };
}
