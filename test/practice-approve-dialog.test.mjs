import assert from 'node:assert/strict';
import {build} from 'esbuild';
import test,{after,afterEach} from 'node:test';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';

const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://fixture.invalid/practice',pretendToBeVisual:true});
dom.window.matchMedia=query=>({matches:false,media:query,onchange:null,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent(){return false;}});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Element','Node','MutationObserver','Event','KeyboardEvent','MouseEvent','ResizeObserver'])globalThis[name]=name==='window'?dom.window:dom.window[name];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
class ResizeObserverStub{observe(){}unobserve(){}disconnect(){}}
globalThis.ResizeObserver=dom.window.ResizeObserver=ResizeObserverStub;
dom.window.Element.prototype.scrollIntoView=function(){};
dom.window.Element.prototype.getBoundingClientRect=function(){return {x:0,y:0,top:0,left:0,bottom:0,right:0,width:320,height:200};};
await mkdir('.cache',{recursive:true});
const bundleDir=await mkdtemp(resolve('.cache/practice-approve-'));
after(async()=>{dom.window.close();await rm(bundleDir,{recursive:true,force:true});});
await build({entryPoints:['ui/practice.jsx'],outdir:bundleDir,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const {ApproveStage}=await import(pathToFileURL(`${bundleDir}/practice.js`).href);
const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const mounted=[];
afterEach(async()=>{for(const unmount of mounted.splice(0))await unmount();document.body.innerHTML='';});
const text=node=>node?node.textContent.replace(/\s+/g,' ').trim():'';
const button=label=>[...document.querySelectorAll('button')].find(node=>text(node)===label);
const scenario={title:'Practice notice · Relay Home cup',product:'Relay Home cup (fictional)',sku:'CUP-01',lot:'LOT-A',notice:'Practice exercise.',sourceLabel:'Fictional practice notice',sourceNote:'Written for this exercise.',requirements:[],totalCents:5999,affectedCents:2599,unaffectedCents:3400};
const value={mode:'practice',simulated:true,role:'merchant',attempt:1,scenario,case:{id:'PRACTICE-AAAA1111',revision:2,status:{code:'READY_FOR_APPROVAL',reason:'Evidence reviewed.'},missing:[],plan:{status:'READY_FOR_APPROVAL',reason:'Ready.',digest:'digest-2'},review:{revision:2},correction:null,locked:false,submission:{lot:'LOT-A',acknowledged:true,hasPhoto:true,extra:{}},photo:'data:image/png;base64,AAAA',refund:null,unresolved:null}};

test('the refund dialog labels the decision and submits only once',async()=>{
  let calls=0;let release;const blocked=new Promise(resolve=>{release=resolve;});
  const run=async()=>{calls+=1;await blocked;};
  const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
  await act(async()=>{root.render(React.createElement(ApproveStage,{value,run,busy:false,error:'',stale:false,onRefresh:()=>{}}));await tick();});
  assert.equal(button('Review refund').disabled,false);
  await act(async()=>{button('Review refund').click();await tick();});
  assert.match(text(document.querySelector('.rr-dialog')),/Approve \$25\.99 simulated refund/);
  assert.ok(button('Cancel'));
  const final=button('Approve $25.99 simulated refund');
  assert.ok(final);
  await act(async()=>{final.click();final.click();await tick();});
  assert.equal(calls,1,'a rapid double click submits one refund');
  await act(async()=>{release();await tick();});
  await act(async()=>root.unmount());container.remove();
});
