import assert from 'node:assert/strict';
import {build} from 'esbuild';
import test,{after,afterEach} from 'node:test';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';

// This mounts the real review surface. A photograph that is still loading or
// has failed must keep both the acknowledgement and the review action closed.
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://fixture.invalid/practice',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Node','MutationObserver','Event'])globalThis[name]=name==='window'?dom.window:dom.window[name];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
dom.window.Element.prototype.scrollIntoView=function(){};
await mkdir('.cache',{recursive:true});
const bundleDir=await mkdtemp(resolve('.cache/practice-review-'));
after(async()=>{dom.window.close();await rm(bundleDir,{recursive:true,force:true});});
await build({entryPoints:['ui/practice.jsx'],outdir:bundleDir,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const {default:Practice,ReviewStage,CustomerStage}=await import(pathToFileURL(`${bundleDir}/practice.js`).href);
const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const mounted=[];
afterEach(async()=>{for(const unmount of mounted.splice(0))await unmount();document.body.innerHTML='';});
async function render(element){
  for(const unmount of mounted.splice(0))await unmount();document.body.innerHTML='';
  const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
  await act(async()=>{root.render(element);await tick();});
  const unmount=async()=>{await act(async()=>root.unmount());container.remove();};mounted.push(unmount);
}
const text=node=>node?node.textContent.replace(/\s+/g,' ').trim():'';
const button=label=>[...document.querySelectorAll('button')].find(node=>text(node)===label);
const checkbox=()=>document.querySelector('.rr-review-decision input[type=checkbox]');
const scenario={title:'Practice notice · Relay Home cup',product:'Relay Home cup (fictional)',sku:'CUP-01',lot:'LOT-A',notice:'Practice exercise.',sourceLabel:'Fictional practice notice',sourceNote:'Written for this exercise.',requirements:[{id:'practice-photo',kind:'PHOTO',citation:'Practice notice, requirement 1 of 3',quote:'Upload a photograph of the product label showing the lot code.'},{id:'practice-lot-confirm',kind:'CONFIRMATION',citation:'Practice notice, requirement 2 of 3',quote:'Confirm the lot code printed on the item matches LOT-A.'}],totalCents:5999,affectedCents:2599,unaffectedCents:3400};
function value(overrides={}){
  return {mode:'practice',simulated:true,role:'merchant',attempt:1,scenario,case:{id:'PRACTICE-AAAA1111',revision:1,status:{code:'SUBMITTED',reason:'The claim is with the merchant for review.'},missing:[],plan:{status:'NOT_READY',reason:'No review.',digest:null},review:null,correction:null,locked:false,submittedAt:'2026-11-03T12:00:00.000Z',submission:{lot:'LOT-A',acknowledged:true,hasPhoto:true,extra:{'practice-defect':'The handle has a crack.'}},photo:'data:image/png;base64,AAAA',refund:null,unresolved:null,...overrides}};
}
const image=()=>document.querySelector('.rr-evidence--review img');

test('a loading or failed photograph keeps review closed and recovers on retry',async()=>{
  const calls=[];
  await render(React.createElement(ReviewStage,{value:value(),run:async(...args)=>calls.push(args),busy:false,error:'',stale:false,onRefresh:()=>{}}));
  assert.equal(checkbox().disabled,true,'the acknowledgement is disabled while the photo loads');
  assert.equal(button('Confirm evidence review').disabled,true,'review cannot be confirmed while the photo loads');
  assert.equal(text(document.querySelector('.rr-photo-status')),'Loading photograph…');

  await act(async()=>{image().dispatchEvent(new dom.window.Event('load'));await tick();});
  assert.equal(checkbox().disabled,false,'a loaded photograph enables acknowledgement');
  await act(async()=>{checkbox().click();await tick();});
  assert.equal(button('Confirm evidence review').disabled,false,'a loaded, acknowledged current photo enables review');

  await render(React.createElement(ReviewStage,{value:value({revision:2,photo:'data:image/png;base64,BBBB'}),run:async(...args)=>calls.push(args),busy:false,error:'',stale:false,onRefresh:()=>{}}));
  assert.equal(checkbox().disabled,true,'a new revision resets readiness');
  await act(async()=>{image().dispatchEvent(new dom.window.Event('error'));await tick();});
  assert.match(text(document.querySelector('.rr-photo-error')),/This photograph did not load\.Retry photograph/);
  assert.equal(checkbox().disabled,true,'a failed photograph cannot be acknowledged');
  assert.equal(button('Confirm evidence review').disabled,true,'a failed photograph cannot be reviewed');

  await act(async()=>{button('Retry photograph').click();await tick();});
  assert.equal(text(document.querySelector('.rr-photo-status')),'Loading photograph…');
  await act(async()=>{image().dispatchEvent(new dom.window.Event('load'));await tick();});
  assert.equal(checkbox().disabled,false,'retry recovery restores the review gate after load');
  await act(async()=>{checkbox().click();await tick();button('Confirm evidence review').click();await tick();});
  assert.equal(calls.filter(([action])=>action==='review').length,1,'review is submitted once');
});


test('a customer at the submission limit can start fresh with incomplete or corrected evidence',async()=>{
  for(const correction of [null,{state:'REQUESTED',message:'Replace the unclear label photograph.',replacePhoto:true}]){
    const calls=[];
    await render(React.createElement(CustomerStage,{value:{...value({revision:20,submissionLimitReached:true,missing:['Photograph required'],correction}),role:'customer'},run:async(...args)=>calls.push(args),busy:false,error:'',stale:false,onRefresh:()=>{},expired:false}));
    assert.match(document.body.textContent,/reached its submission limit/);
    assert.equal(document.querySelector('form'),null,'an exhausted case does not offer a doomed submission');
    assert.ok(button('Start a fresh practice case'),'recovery does not depend on merchant handoff or complete evidence');
    await act(async()=>{button('Start a fresh practice case').click();await tick();});
    assert.deepEqual(calls,[['new',{}]],'recovery uses the existing fresh-session endpoint');
  }
});


test('saving customer evidence moves focus to the handoff heading',async()=>{
  const initial={...value({missing:['Photograph required'],submission:null,revision:0}),role:'customer'};
  const submitted={...value(),role:'customer'};
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>({ok:true,json:async()=>options?.method==='POST'?submitted:initial});
  try{
    await render(React.createElement(Practice));
    await act(async()=>{button('Submit for review').click();await tick();});
    assert.equal(text(document.activeElement),'Evidence submitted.');
  }finally{globalThis.fetch=original;}
});
