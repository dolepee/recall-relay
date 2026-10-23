// Remove only the capability fragment. Hosted routing still needs the workspace query.
export function initialCustomerAccess({location,history,sessionStorage}=window){
  const workspace=new URLSearchParams(location.search).get('workspace');
  const key=workspace?`rr_customer_access:${workspace}`:'rr_customer_access';
  const fragment=location.hash.slice(1);
  if(/^[\w-]{43}$/.test(fragment)){
    sessionStorage.setItem(key,fragment);
    history.replaceState(null,'',location.pathname+location.search);
  }
  return sessionStorage.getItem(key)||'';
}
