import assert from 'node:assert/strict';
import {build} from 'esbuild';
import test,{after,afterEach} from 'node:test';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';

// Rendered regression coverage for the customer's evidence handoff box.
// After the merchant confirms the review but before the simulated refund is
// recorded, the box must say the version was reviewed. It previously said that
// no review had been recorded while the status beside it read "Ready for
// simulated refund".
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://fixture.invalid/practice',pretendToBeVisual:true});
dom.window.matchMedia=query=>({matches:false,media:query,onchange:null,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent(){return false;}});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Node','MutationObserver','Event'])globalThis[name]=name==='window'?dom.window:dom.window[name];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
await mkdir('.cache',{recursive:true});
const bundleDir=await mkdtemp(resolve('.cache/practice-customer-'));
after(async()=>{dom.window.close();await rm(bundleDir,{recursive:true,force:true});});
await build({entryPoints:['ui/practice.jsx'],outdir:bundleDir,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const {CustomerPanel}=await import(pathToFileURL(`${bundleDir}/practice.js`).href);
const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');
const mounted=[];
afterEach(async()=>{for(const unmount of mounted.splice(0))await unmount();document.body.innerHTML='';});
async function render(element){
 for(const unmount of mounted.splice(0))await unmount();document.body.innerHTML='';
 const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
 await act(async()=>{root.render(element);await new Promise(resolve=>setTimeout(resolve,0));});
 let done=false;const unmount=async()=>{if(done)return;done=true;await act(async()=>root.unmount());container.remove();};mounted.push(unmount);
 return document.body.textContent.replace(/\s+/g,' ').trim();
}
function value({review=null,status='SUBMITTED',reason='Your claim is with the merchant for review.'}={}){
 return {
  role:'customer',attempt:1,
  scenario:{affectedCents:3875,unaffectedCents:3400,lot:'LOT-A',sku:'SCENARIO-ITEM',totalCents:7275,title:'Crystal Glass Cups',notice:'Fictional recall notice.',sourceLabel:'Example source',sourceNote:'Fictional.',requirements:[],exampleDraft:{label:'x',text:'y',note:'z'}},
  case:{id:'RR-TEST',revision:2,status:{code:status,reason},missing:[],plan:{status:review?'READY_FOR_APPROVAL':'SUBMITTED',reason,digest:null},review,correction:null,locked:false,submittedAt:'2026-11-03T00:00:00.000Z',submission:{lot:'LOT-A',acknowledged:true,hasPhoto:true,extra:{}},photo:null,refund:null,unresolved:null},
 };
}
const props={run:async()=>{},busy:false,error:'',onRefresh:()=>{},stale:false};

test('an unreviewed submission says no review has been recorded',async()=>{
 const text=await render(React.createElement(CustomerPanel,{...props,value:value()}));
 assert.match(text,/Evidence received/);
 assert.match(text,/This version is with the merchant\./);
 assert.match(text,/No review or simulated refund has been recorded\./);
 assert.doesNotMatch(text,/has been reviewed/);
});

test('a reviewed version is reported as reviewed, not unreviewed',async()=>{
 const text=await render(React.createElement(CustomerPanel,{...props,value:value({review:{revision:2,reviewedAt:'2026-11-03T00:10:00.000Z'},status:'READY_FOR_APPROVAL',reason:'Evidence reviewed. Waiting for merchant approval.'})}));
 assert.match(text,/Evidence reviewed/);
 assert.match(text,/This version has been reviewed\./);
 assert.match(text,/No simulated refund has been recorded yet\./);
 assert.doesNotMatch(text,/No review or simulated refund has been recorded/);
});
