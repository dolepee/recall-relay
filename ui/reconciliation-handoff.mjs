// A saved plan is historical. Resolve its exact identity against fresh desk
// state before selecting; never let a missing order fall back to another case.
export async function loadLinkedClaim(readState,order,claimId){
  const fresh=await readState();
  if(!fresh?.cases?.some(c=>c.order===order&&c.id===claimId))throw new Error('The linked claim is no longer available in this workspace. Refresh reconciliation; no other claim was opened.');
  return fresh;
}
