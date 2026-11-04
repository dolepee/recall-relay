import assert from 'node:assert/strict';
import {build} from 'esbuild';
import test,{after,afterEach} from 'node:test';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';

const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://fixture.invalid/desk',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','Node','MutationObserver','Event'])globalThis[name]=name==='window'?dom.window:dom.window[name];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
await mkdir('.cache',{recursive:true});
const bundleDir=await mkdtemp(resolve('.cache/correction-note-'));
after(async()=>{dom.window.close();await rm(bundleDir,{recursive:true,force:true});});
await build({entryPoints:['ui/components.jsx'],outdir:bundleDir,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const {CorrectionNote}=await import(pathToFileURL(`${bundleDir}/components.js`).href);
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
const value={state:'RESPONDED',message:'Upload a clearer label photograph.',replacePhoto:true,response:'I uploaded a clearer label showing LOT-A.'};

test('correction guidance follows the current review and completion state',async()=>{
 let text=await render(React.createElement(CorrectionNote,{value}));
 assert.match(text,/Customer response recorded/);
 assert.match(text,/Review the current evidence before approving a refund/);

 text=await render(React.createElement(CorrectionNote,{value,reviewed:true}));
 assert.match(text,/Customer response reviewed/);
 assert.match(text,/Review recorded for this claim version/);
 assert.doesNotMatch(text,/Review the current evidence/);
 assert.match(text,/A replacement photograph was included in this update/);

 text=await render(React.createElement(CorrectionNote,{value,reviewed:true,completed:true}));
 assert.match(text,/Change request closed/);
 assert.match(text,/This claim is complete; the latest request and response remain visible/);
 assert.doesNotMatch(text,/Review the current evidence|submitted for review|change history|previous submissions/);

 text=await render(React.createElement(CorrectionNote,{value,customer:true,completed:true}));
 assert.match(text,/Your update is complete/);
 assert.match(text,/Your refund is confirmed/);
 assert.doesNotMatch(text,/Your update is with the merchant/);

 text=await render(React.createElement(CorrectionNote,{value:{...value,state:'REQUESTED'},customer:true}));
 assert.match(text,/The merchant needs an update/);
});
