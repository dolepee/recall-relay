import assert from 'node:assert/strict';
import {build} from 'esbuild';
import test,{after,afterEach} from 'node:test';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {ClaimDesk} from '../src/claims.mjs';
import {previewLedger} from '../src/ledger-preview.mjs';

// The import preview is an authenticated /desk action. These tests mount the real desk against
// an in-memory workspace and answer its preview request with the real ledger-preview module, so
// the rendered result is the server contract rather than a UI fixture. No provider, model or
// network call is made.
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://fixture.invalid/desk',pretendToBeVisual:true});
dom.window.matchMedia=query=>({matches:false,media:query,onchange:null,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent(){return false;}});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Node','MutationObserver','Event','KeyboardEvent','MouseEvent','FileReader'])globalThis[name]=name==='window'?dom.window:dom.window[name];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.location=dom.window.location;globalThis.history=dom.window.history;
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
await mkdir('.cache',{recursive:true});
const bundleDir=await mkdtemp(resolve('.cache/import-dom-'));
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
const fileLimit=512*1024;
const scope={sku:'CUP-01',lot:'LOT-A'};
const ledger=()=>({version:1,currency:'USD',source:{kind:'merchant-ledger',label:'Test merchant export',reference:'export-1'},orders:[
  {orderId:'ORDER-1',captureId:'CAPTURE-1',capturedAt:'2026-10-01T12:00:00Z',status:'COMPLETED',lines:[
    {declaredLineId:'LINE-1',sku:'CUP-01',lot:'LOT-A',quantity:1,itemPaidCents:3875,taxCents:0,shippingCents:0,refundedCents:500},
    {declaredLineId:'LINE-2',sku:'TRAY-01',lot:'LOT-A',quantity:1,itemPaidCents:3400,taxCents:0,shippingCents:0,refundedCents:0},
  ]},
  {orderId:'ORDER-2',captureId:'CAPTURE-2',capturedAt:'2026-10-02T12:00:00Z',status:'COMPLETED',lines:[
    {declaredLineId:'LINE-3',sku:'CUP-01',lot:'LOT-A',quantity:1,itemPaidCents:2599,taxCents:null,shippingCents:0,refundedCents:0},
  ]},
]});

// `reply` lets a test substitute the backend answer while every other request stays real.
async function mountDesk(reply){
  const desk=new ClaimDesk({path:':memory:',provider:noPayment});
  const posts=[];
  globalThis.fetch=async(path,options={})=>{
    if(path==='/api/merchant/state')return new Response(JSON.stringify(desk.merchantState()));
    assert.equal(path,'/api/merchant/import-preview');
    const payload=JSON.parse(options.body);posts.push(payload);
    if(reply)return reply(payload);
    return new Response(JSON.stringify(previewLedger(payload,scope)));
  };
  const unmount=await render(React.createElement(MerchantDesk),()=>button('Refresh claims'));
  const details=[...document.querySelectorAll('details')].find(node=>node.getAttribute('aria-label')==='Import existing purchases');
  assert(details,'the desk offers an existing-purchase import action');
  details.open=true;
  const textarea=document.getElementById('ledger-json');
  assert(textarea,'the pasted JSON control is rendered');
  const setText=async value=>{const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set;await act(async()=>{setter.call(textarea,value);textarea.dispatchEvent(new Event('input',{bubbles:true}));await tick();});};
  const submit=async()=>{await act(async()=>{textarea.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await tick();});};
  return {desk,unmount,textarea,setText,submit,posts,details};
}

test('the desk previews a declared ledger through the server and keeps zero distinct from unknown',async()=>{
  const {unmount,setText,submit,posts}=await mountDesk();
  await setText(JSON.stringify(ledger()));
  await submit();
  await settle(()=>document.querySelector('[aria-label="Declared import preview"]'));
  assert.equal(posts.length,1);
  assert.deepEqual(posts[0],ledger(),'the exact declared ledger is posted');
  const preview=document.querySelector('[aria-label="Declared import preview"]');
  assert(preview,'the server answer is rendered');
  assert.match(text(preview.querySelector('[aria-label="Declared candidate value"]')),/\$33\.75/);
  assert.match(text(preview.querySelector('[aria-label="Verified refundable amount"]')),/Unknown/);
  assert.match(text(preview.querySelector('[aria-label="Confirmed refunds"]')),/Unknown/);
  assert.deepEqual([...preview.querySelector('[aria-label="Line counts"]').querySelectorAll('dd')].map(text),['1','1','1']);
  assert.match(text(document.body),/SKU CUP-01 · lot LOT-A/,'the scope shown is the server scope');
  const affected=[...preview.querySelectorAll('article')].find(node=>text(node).includes('LINE-1'));
  assert.match(text(affected),/Tax\$0\.00/,'an explicit zero is rendered as zero');
  const manual=[...preview.querySelectorAll('article')].find(node=>text(node).includes('LINE-3'));
  assert.match(text(manual),/TaxUnknown/,'unknown tax stays unknown');
  assert.match(text(manual),/Declared candidate: Not counted/,'a manual line has no candidate value');
  assert.equal([...preview.querySelectorAll('button')].some(node=>/refund|approve/i.test(text(node))),false,'imported rows offer no refund or approval');
  await unmount();
});

test('a repeated capture keeps both declarations manual and reports an explicit zero candidate',async()=>{
  const {unmount,setText,submit}=await mountDesk();
  const value=ledger();const duplicate=structuredClone(value.orders[0]);
  duplicate.orderId='RENAMED';duplicate.lines[0].declaredLineId='RENAMED-LINE';duplicate.lines[0].itemPaidCents=5000;
  value.orders.push(duplicate);
  await setText(JSON.stringify(value));
  await submit();
  await settle(()=>document.querySelector('[aria-label="Declared import preview"]'));
  const preview=document.querySelector('[aria-label="Declared import preview"]');
  assert.match(text(preview.querySelector('[aria-label="Declared candidate value"]')),/\$0\.00/,'zero is shown as zero, not unknown');
  assert.match(text(preview),/Capture repeated across declared orders; reconcile duplicates before binding\./);
  assert.equal((text(preview).match(/Capture repeated across declared orders/g)||[]).length>=2,true);
  await unmount();
});

test('a rejected ledger shows the server error and keeps the declaration on screen',async()=>{
  const {unmount,setText,submit,posts}=await mountDesk(()=>new Response(JSON.stringify({error:'orders[0].lines[0].itemPaidCents: use nonnegative integer cents or null for unknown.'}),{status:400}));
  const value=JSON.stringify(ledger());
  await setText(value);
  await submit();
  await settle(()=>document.querySelector('[role=alert]'));
  assert.match(text(document.querySelector('[role=alert]')),/nonnegative integer cents or null for unknown/);
  assert.equal(posts.length,1);
  assert.equal(document.getElementById('ledger-json').value,value,'the pasted ledger is not discarded');
  assert.equal(document.querySelector('[aria-label="Declared import preview"]'),null,'no partial preview is shown');
  await unmount();
});

test('invalid JSON is rejected before any request is made',async()=>{
  const {unmount,setText,submit,posts}=await mountDesk();
  await setText('{"version":1,');
  await submit();
  await settle(()=>document.querySelector('[role=alert]'));
  assert.match(text(document.querySelector('[role=alert]')),/not valid JSON/);
  assert.equal(posts.length,0);
  await unmount();
});

test('a chosen JSON file populates the declaration without uploading it',async()=>{
  const {unmount,textarea}=await mountDesk();
  const file=new dom.window.File([JSON.stringify(ledger())],'ledger.json',{type:'application/json'});
  const input=document.getElementById('ledger-file');
  Object.defineProperty(input,'files',{value:[file],configurable:true});
  await act(async()=>{input.dispatchEvent(new Event('change',{bubbles:true}));await tick();});
  await settle(()=>textarea.value.includes('ORDER-1'));
  assert.match(textarea.value,/CAPTURE-1/);
  assert.match(text(document.body),/Loaded ledger\.json/);
  await unmount();
});

test('editing the declaration invalidates the previous preview',async()=>{
  const {unmount,setText,submit,textarea}=await mountDesk();
  await setText(JSON.stringify(ledger()));
  await submit();
  await settle(()=>document.querySelector('[aria-label="Declared import preview"]'));
  assert(document.querySelector('[aria-label="Declared import preview"]'));
  const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set;
  await act(async()=>{setter.call(textarea,textarea.value+'\n');textarea.dispatchEvent(new Event('input',{bubbles:true}));await tick();});
  assert.equal(document.querySelector('[aria-label="Declared import preview"]'),null,'the stale candidate result is removed on edit');
  await unmount();
});

test('an oversized replacement cannot submit the previous declaration under the new file name',async()=>{
  const {unmount}=await mountDesk();
  const input=document.getElementById('ledger-file');
  const good=new dom.window.File([JSON.stringify(ledger())],'good.json',{type:'application/json'});
  Object.defineProperty(input,'files',{value:[good],configurable:true});
  await act(async()=>{input.dispatchEvent(new Event('change',{bubbles:true}));await tick();});
  await settle(()=>document.getElementById('ledger-json').value.includes('ORDER-1'));
  const bad=new dom.window.File(['x'.repeat(fileLimit+1)],'too-big.json',{type:'application/json'});
  Object.defineProperty(input,'files',{value:[bad],configurable:true});
  await act(async()=>{input.dispatchEvent(new Event('change',{bubbles:true}));await tick();});
  await settle(()=>document.querySelector('[role=alert]'));
  assert.equal(document.getElementById('ledger-json').value,'','the old declaration is cleared');
  assert.equal(document.querySelector('[aria-label="Declared import preview"]'),null);
  assert.match(text(document.querySelector('[role=alert]')),/512 KB/);
  assert.equal(button('Preview declared import').disabled,true,'an empty replacement cannot submit old text');
  await unmount();
});

test('an older slow file read cannot overwrite a newer selection',async()=>{
  const {unmount}=await mountDesk();
  const input=document.getElementById('ledger-file');
  let resolveSlow;
  const slow={name:'slow.json',size:20,text:()=>new Promise(resolve=>{resolveSlow=resolve;})};
  const fast={name:'fast.json',size:21,text:()=>Promise.resolve(JSON.stringify({marker:'fast'}))};
  Object.defineProperty(input,'files',{value:[slow],configurable:true});
  await act(async()=>{input.dispatchEvent(new Event('change',{bubbles:true}));await tick();});
  Object.defineProperty(input,'files',{value:[fast],configurable:true});
  await act(async()=>{input.dispatchEvent(new Event('change',{bubbles:true}));await tick();});
  await settle(()=>document.getElementById('ledger-json').value.includes('"fast"'));
  resolveSlow(JSON.stringify({marker:'slow'}));
  await act(async()=>{await tick();});
  assert.match(document.getElementById('ledger-json').value,/"fast"/);
  assert.doesNotMatch(document.getElementById('ledger-json').value,/"slow"/);
  await unmount();
});

test('long order and line references are marked for wrapping in the preview',async()=>{
  const {unmount,setText,submit}=await mountDesk();
  const value=ledger();
  value.orders[0].orderId='ORDER-'+'1'.repeat(119);
  value.orders[0].lines[0].declaredLineId='LINE-'+'2'.repeat(120);
  await setText(JSON.stringify(value));
  await submit();
  await settle(()=>document.querySelector('[aria-label="Declared import preview"]'));
  const preview=document.querySelector('[aria-label="Declared import preview"]');
  const orderSection=[...preview.querySelectorAll('section')].find(node=>node.getAttribute('aria-label')?.startsWith('Declared order'));
  const heading=orderSection.querySelector('h4');
  assert.match(heading.className,/break-all/);
  assert.equal(heading.textContent,value.orders[0].orderId);
  const line=[...preview.querySelectorAll('article')].find(node=>node.getAttribute('aria-label')?.includes(value.orders[0].lines[0].declaredLineId));
  assert(line);
  const reference=[...line.querySelectorAll('p')].find(node=>node.textContent.includes(value.orders[0].lines[0].declaredLineId));
  assert.match(reference.className,/break-all/);
  await unmount();
});
