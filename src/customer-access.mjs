// A non-secret routing ID distinguishes claims in one tab; only the fragment
// contains authority. Old links with a fragment receive a new local routing ID.
export function initialCustomerAccess({location,history,sessionStorage}=window){
  const params=new URLSearchParams(location.search);
  const workspace=params.get('workspace')||'local';
  let claim=params.get('claim');
  if(claim&&!/^[A-Za-z0-9_-]{1,128}$/.test(claim))return '';
  const fragment=location.hash.slice(1);
  if(/^[\w-]{43}$/.test(fragment)){
    claim=claim||crypto.randomUUID();
    params.set('claim',claim);
    sessionStorage.setItem(`rr_customer_access:${workspace}:${claim}`,fragment);
    history.replaceState(null,'',location.pathname+'?'+params.toString());
  }
  // A legacy cleaned URL has no identity. Fail closed instead of guessing the
  // last claim opened in this workspace; reopen the original private link.
  return claim?sessionStorage.getItem(`rr_customer_access:${workspace}:${claim}`)||'':'';
}
