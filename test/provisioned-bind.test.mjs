import assert from 'node:assert/strict';
import {build} from 'esbuild';
import test,{after,afterEach} from 'node:test';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {ClaimDesk} from '../src/claims.mjs';

// Provisioned purchases are bound from the authenticated desk. These tests mount the real desk
// against an in-memory workspace and answer its bind request here, so the panel is exercised
// against the declared contract: the page may name a grant and nothing else.
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://fixture.invalid/desk',pretendToBeVisual:true});
dom.window.matchMedia=query=>({matches:false,media:query,onchange:null,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent(){return false;}});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Node','MutationObserver','Event','KeyboardEvent','MouseEvent','FileReader'])globalThis[name]=name==='window'?dom.window:dom.window[name];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.location=dom.window.location;globalThis.history=dom.window.history;
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
await mkdir('.cache',{recursive:true});
const bundleDir=await mkdtemp(resolve('.cache/provisioned-dom-'));
after(async()=>{dom.window.close();await rm(bundleDir,{recursive:true,force:true});});
await build({entryPoints:['ui/connected.jsx'],outdir:bundleDir,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const {MerchantDesk}=await import(pathToFileURL(`${bundleDir}/connected.js`).href);
const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const step=async(times=2)=>{await act(async()=>{for(let i=0;i<times;i++)await tick();});};
const settle=async(condition,{timeout=4000}={})=>{
  const deadline=Date.now()+timeout;
  for(;;){
    let done=false;
    try{done=!!condition();}catch{done=false;}
    if(done)return true;
    if(Date.now()>deadline)return false;
    await step(1);
  }
};
const button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent.replace(/\s+/g,' ').trim()===text);
const text=node=>node?node.textContent.replace(/\s+/g,' ').trim():'';
const mounted=[];
async function render(element,ready=()=>true){
  const container=document.createElement('div');document.body.appendChild(container);
  const root=createRoot(container);
  await act(async()=>{root.render(element);await tick();});
  await settle(ready);await step();
  let done=false;
  const unmount=async()=>{if(done)return;done=true;await act(async()=>{root.unmount();});container.remove();};
  mounted.push(unmount);return unmount;
}
afterEach(async()=>{for(const unmount of mounted.splice(0))await unmount();document.body.innerHTML='';});

const noPayment=async()=>{throw new Error('No payment calls permitted');};
const grant=(overrides={})=>({grantId:'GRANT-0000000001',sku:'CUP-01',lot:'LOT-A',itemPaidCents:3875,captureCents:3875,operator:'operator@fixture.invalid',provisionedAt:'2026-11-01T09:15:00Z',catalogMapping:'OPERATOR_REVIEWED',...overrides});
const claimView=()=>({id:'claim-1',order:'RR-0001',amountCents:3375,currency:'USD',status:{code:'SUBMITTED',reason:'Your claim is with the merchant for review.'},campaign:{product:'Fictional cup',sku:'CUP-01',lot:'LOT-A'},purchaseProvenance:{kind:'OPERATOR_PROVISIONED',operator:'operator@fixture.invalid',provisionedAt:'2026-11-01T09:15:00Z',catalogMapping:'OPERATOR_REVIEWED',providerVerifiedAt:'2026-11-02T17:40:00Z',orderId:'ORDER-SHOULD-NOT-RENDER',grantDigest:'DIGEST-SHOULD-NOT-RENDER',itemOrdinal:7}});

// Every request other than the bind is answered by the real desk, so the panel renders inside
// the same workspace the merchant actually sees.
async function mountDesk({purchases,bind,stateClaim,stateFailsAfterBind=false}={}){
  const desk=new ClaimDesk({path:':memory:',provider:noPayment});
  const posts=[];
  let bindRecorded=false;
  globalThis.fetch=async(path,options={})=>{
    if(path==='/api/merchant/state'){
      // A failed follow-up refresh must not be mistaken for a failed bind.
      if(stateFailsAfterBind&&bindRecorded)return new Response(JSON.stringify({error:'The desk is temporarily unavailable.'}),{status:503});
      const state={...desk.merchantState(),workspaceId:'ws-4f21c9'};
      if(purchases===undefined)delete state.provisionedPurchases;else state.provisionedPurchases=purchases;
      const claim=typeof stateClaim==='function'?stateClaim():stateClaim;
      if(claim)state.cases=[claim,...state.cases];
      return new Response(JSON.stringify(state));
    }
    assert.equal(path,'/api/merchant/bind-purchase');
    assert.equal(options.method,'POST');
    posts.push(JSON.parse(options.body));
    const response=bind?bind(JSON.parse(options.body)):new Response(JSON.stringify(claimView()));
    if(response.ok)bindRecorded=true;
    return response;
  };
  const unmount=await render(React.createElement(MerchantDesk),()=>button('Refresh claims'));
  const panel=()=>[...document.querySelectorAll('details')].find(node=>node.getAttribute('aria-label')==='Provisioned purchases');
  return {unmount,posts,panel};
}

test('a desk without provisioned purchases is unchanged',async()=>{
  const {panel}=await mountDesk({});
  assert.equal(panel(),undefined,'the panel only appears when the server exposes provisioned purchases');
});

test('provisioned purchases show operator-recorded facts and keep zero and unknown distinct',async()=>{
  const {panel}=await mountDesk({purchases:[grant(),grant({grantId:'GRANT-0000000002',sku:null,lot:null,captureCents:null,catalogMapping:'PENDING',operator:null,provisionedAt:null})]});
  const node=panel();
  assert(node,'the desk offers provisioned purchases');
  assert.match(text(node),/\$38\.75/);
  assert.match(text(node),/Unknown/,'a missing capture amount is unknown, not zero');
  assert.match(text(node),/SKU not recorded/);
  assert.match(text(node),/Operator-reviewed mapping/);
  assert.match(text(node),/Mapping not reviewed/);
  assert.match(text(node),/Operator-recorded/);
  assert.match(text(node),/reference only, not an authorization/);
  assert.equal(node.querySelectorAll('ul li').length,2);
});

test('binding names the grant only and requires an explicit confirmation',async()=>{
  const {panel,posts}=await mountDesk({purchases:[grant({captureCents:9000,itemPaidCents:12000})]});
  const node=panel();
  await act(async()=>{button('Bind purchase').click();await tick();});
  assert.equal(posts.length,0,'one click does not read the provider');
  const confirm=node.querySelector('[role="group"]');
  assert(confirm,'the panel asks before binding');
  assert.match(text(confirm),/cannot be moved to another workspace or claim/);
  await act(async()=>{button('Bind and record').click();await tick();});
  await settle(()=>posts.length===1);
  assert.deepEqual(posts,[{grantId:'GRANT-0000000001'}],'the page supplies no capture, amount or verified flag');
  assert.equal(node.querySelector('[role="group"]'),null,"the confirmation closes once sent");
});

test('a recorded binding reports the claim and refuses to read as a refund',async()=>{
  const {panel}=await mountDesk({purchases:[grant()]});
  const node=panel();
  await act(async()=>{button('Bind purchase').click();await tick();});
  await act(async()=>{button('Bind and record').click();await tick();});
  await settle(()=>node.querySelector('[aria-label="Recorded binding"]'));
  const recorded=node.querySelector('[aria-label="Recorded binding"]');
  assert.match(text(recorded),/RR-0001/);
  assert.match(text(recorded),/\$33\.75/,'the recorded amount is the capture amount the server returned, not the item price');
  assert.match(text(recorded),/not a refund or an approval/);
  assert.match(text(recorded),/Affected item amount/);
  assert.doesNotMatch(text(recorded),/Refundable amount/);
  const provenance=recorded.querySelector('[aria-label="Purchase provenance"]');
  assert(provenance,'the returned purchase provenance is rendered');
  assert.match(text(provenance),/Operator-provisioned/);
  assert.match(text(provenance),/operator@fixture\.invalid/);
  assert.match(text(provenance),/Operator-reviewed mapping/);
  assert.match(text(provenance),/Provider readback at binding/);
  assert.match(text(provenance),/does not verify the lot/);
  assert.doesNotMatch(text(provenance),/ORDER-SHOULD-NOT-RENDER|DIGEST-SHOULD-NOT-RENDER|item ordinal/i);
  assert.match(text(node),/Bound to RR-0001/,'the grant is marked as allocated');
  assert.equal(button('Bind purchase'),undefined,'an allocated grant offers no second binding');
});

test('a failed bind records nothing and says so',async()=>{
  const {panel}=await mountDesk({purchases:[grant()],bind:()=>new Response(JSON.stringify({error:'That capture is already allocated to another workspace.'}),{status:409})});
  const node=panel();
  await act(async()=>{button('Bind purchase').click();await tick();});
  await act(async()=>{button('Bind and record').click();await tick();});
  await settle(()=>node.querySelector('[role="alert"]')||text(node).includes('cannot be bound'));
  assert.equal(node.querySelector('[aria-label="Recorded binding"]'),null,"no recorded claim without a server answer");
  assert.match(text(document.body),/binding outcome could not be confirmed/);
  assert.match(text(document.body),/already allocated to another workspace/);
});

test('long grant references wrap inside the panel instead of widening the page',async()=>{
  const long='GRANT-'+'9'.repeat(140);
  const {panel}=await mountDesk({purchases:[grant({grantId:long})]});
  const node=panel();
  const line=[...node.querySelectorAll('p')].find(item=>text(item).startsWith('Grant '));
  assert(line,'the full grant reference is shown');
  assert.match(line.className,/break-all/);
  assert.match(node.querySelector('li').className,/min-w-0/);
});


test('a refresh derives an already-bound grant from the claim provenance, not component memory',async()=>{
  const boundClaim={id:'claim-1',order:'RR-0001',campaign:{title:'Fictional cup',notice:'Local fixture',sourceUrl:'https://example.invalid',product:'Fictional cup',sku:'CUP-01',lot:'LOT-A',coverage:[],fields:[]},amountCents:3375,currency:'USD',status:{code:'SUBMITTED',reason:'The claim is with you for review.'},missing:[],revision:2,correction:null,submittedAt:'2026-11-02T00:00:00Z',submission:{lot:'LOT-A',acknowledged:true,hasPhoto:false,extra:{}},locked:false,receipt:null,plan:{status:'REVIEW',reason:'Evidence review required.'},review:null,payment:null,claimUrl:'/claim?claim=claim-1#fixture',purchaseProvenance:{...claimView().purchaseProvenance,grantId:'GRANT-0000000001'}};
  const {panel}=await mountDesk({purchases:[grant()],stateClaim:boundClaim});
  const node=panel();
  assert.match(text(node),/Bound to RR-0001/,'the server claim marks the grant as allocated');
  assert.equal(button('Bind purchase'),undefined,'a server-bound grant offers no second binding');
});

test('a recorded bind survives a failed follow-up refresh',async()=>{
  const {panel,posts}=await mountDesk({purchases:[grant()],stateFailsAfterBind:true});
  const node=panel();
  await act(async()=>{button('Bind purchase').click();await tick();});
  await act(async()=>{button('Bind and record').click();await tick();});
  await settle(()=>node.querySelector('[aria-label="Recorded binding"]'));
  assert.equal(posts.length,1,'the bind was sent once');
  const recorded=node.querySelector('[aria-label="Recorded binding"]');
  assert(recorded,'the confirmed server answer is kept even when the desk cannot refresh');
  assert.match(text(recorded),/RR-0001/);
  assert.match(text(recorded),/With the merchant/);
  assert.match(text(recorded),/Status recorded at binding/,'the unmatched status is labelled as binding-time rather than current');
  assert.doesNotMatch(text(node),/outcome could not be confirmed/,'a successful bind is not reported as unconfirmed');
  assert.match(text(node),/binding was recorded, but the desk could not refresh/);
  assert.equal(button('Bind purchase'),undefined,'a recorded bind does not invite a duplicate attempt');
});

test('the recorded heading follows the refreshed claim status after a later decision',async()=>{
  let status='SUBMITTED';
  const deskClaim=()=>({id:'claim-1',order:'RR-0001',campaign:{title:'Fictional cup',notice:'Local fixture',sourceUrl:'https://example.invalid',product:'Fictional cup',sku:'CUP-01',lot:'LOT-A',coverage:[],fields:[]},amountCents:3375,currency:'USD',status:{code:status,reason:'Current desk status.'},missing:[],revision:2,correction:null,submittedAt:'2026-11-02T00:00:00Z',submission:{lot:'LOT-A',acknowledged:true,hasPhoto:false,extra:{}},locked:false,receipt:null,plan:{status:'REVIEW',reason:'Evidence review required.'},review:null,payment:null,claimUrl:'/claim?claim=claim-1#fixture',purchaseProvenance:{...claimView().purchaseProvenance,grantId:'GRANT-0000000001'}});
  const {panel}=await mountDesk({
    purchases:[grant()],
    stateClaim:deskClaim,
    bind:()=>{status='COMPLETED';return new Response(JSON.stringify(claimView()));}
  });
  const node=panel();
  await act(async()=>{button('Bind purchase').click();await tick();});
  await act(async()=>{button('Bind and record').click();await tick();});
  await settle(()=>node.querySelector('[aria-label="Recorded binding"]'));
  const recorded=node.querySelector('[aria-label="Recorded binding"]');
  assert.match(text(recorded),/RR-0001 · Refund confirmed/,'the refreshed claim status wins over the bind-time status');
  assert.doesNotMatch(text(recorded),/With the merchant/);
});
