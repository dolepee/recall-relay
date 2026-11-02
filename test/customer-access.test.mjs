import test from 'node:test';
import assert from 'node:assert/strict';
import {initialCustomerAccess} from '../src/customer-access.mjs';
import {routeWorkspace} from '../src/cloud-routing.mjs';

function browser(url,values=new Map()){
  const state={location:new URL(url),sessionStorage:{setItem:(k,v)=>values.set(k,v),getItem:k=>values.get(k)||null}};
  state.history={replaceState(_state,_title,path){state.location=new URL(path,state.location);}};
  return state;
}

test('hosted claim survives token removal and reload without losing its routing workspace',()=>{
  const workspace='a'.repeat(64),token='t'.repeat(43);
  const page=browser(`https://example.com/claim?workspace=${workspace}#${token}`);
  assert.equal(initialCustomerAccess(page),token);
  assert.equal(page.location.hash,'');
  const request=new URL('/api/claim/state'+page.location.search,page.location);
  assert.equal(routeWorkspace(request,'').id,workspace);
  assert.equal(initialCustomerAccess(page),token);
});

test('claim access stays scoped to its workspace and ambiguous legacy sessions fail closed',()=>{
  const values=new Map([['rr_customer_access','l'.repeat(43)]]);
  const first=browser(`https://example.com/claim?workspace=${'a'.repeat(64)}#${'t'.repeat(43)}`,values);
  initialCustomerAccess(first);
  assert.equal(initialCustomerAccess(browser(`https://example.com/claim?workspace=${'b'.repeat(64)}`,values)),'');
  assert.equal(initialCustomerAccess(browser('http://127.0.0.1:4318/claim',values)),'');
});

 test('two claims in one workspace retain independent cleaned URLs',()=>{
 const values=new Map(), workspace='w'.repeat(64);
 const a=browser(`https://example.com/claim?workspace=${workspace}#${'a'.repeat(43)}`,values);
 const b=browser(`https://example.com/claim?workspace=${workspace}#${'b'.repeat(43)}`,values);
 initialCustomerAccess(a);initialCustomerAccess(b);
 assert.notEqual(a.location.search,b.location.search);
 assert.equal(initialCustomerAccess(a),'a'.repeat(43));
 assert.equal(initialCustomerAccess(b),'b'.repeat(43));
 });
