import assert from 'node:assert/strict';
import {build} from 'esbuild';
import test,{after,afterEach} from 'node:test';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';

// Rendered regression coverage for the shared shell navigation.
// The product shell reuses one Frame for /desk, /setup and /practice. A merchant
// entry may declare `active: true`, which is a practice-only marker for "the
// current page in this nav". Reading it as an unconditional current-page flag
// made /desk mark both Claims and Instructions as current.
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://fixture.invalid/desk',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','Node','MutationObserver','Event'])globalThis[name]=name==='window'?dom.window:dom.window[name];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
await mkdir('.cache',{recursive:true});
const bundleDir=await mkdtemp(resolve('.cache/frame-nav-'));
after(async()=>{dom.window.close();await rm(bundleDir,{recursive:true,force:true});});
await build({entryPoints:['ui/components.jsx'],outdir:bundleDir,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const {Frame}=await import(pathToFileURL(`${bundleDir}/components.js`).href);
const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');
const mounted=[];
afterEach(async()=>{for(const unmount of mounted.splice(0))await unmount();document.body.innerHTML='';});
async function render(element){
 for(const unmount of mounted.splice(0))await unmount();document.body.innerHTML='';
 const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
 await act(async()=>{root.render(element);await new Promise(resolve=>setTimeout(resolve,0));});
 let done=false;const unmount=async()=>{if(done)return;done=true;await act(async()=>root.unmount());container.remove();};mounted.push(unmount);
}
function currentLinks(){
 return [...document.querySelectorAll('header .rr-mh__nav a[aria-current="page"]')].map(link=>link.textContent.trim());
}
function navLabels(){
 return [...document.querySelectorAll('header .rr-mh__nav a')].map(link=>link.textContent.trim());
}
const child=React.createElement('p',null,'Body');

test('the merchant desk marks only Claims as the current page',async()=>{
 await render(React.createElement(Frame,{merchant:true},child));
 assert.deepEqual(navLabels(),['Claims','Instructions','Practice claim']);
 assert.deepEqual(currentLinks(),['Claims']);
});

test('the merchant desk marks only Instructions while reviewing the public notice',async()=>{
 await render(React.createElement(Frame,{merchant:true,sourceReview:true},child));
 assert.deepEqual(currentLinks(),['Instructions']);
});

test('the practice shell marks only the practice claim as current',async()=>{
 await render(React.createElement(Frame,{practice:true},child));
 assert.deepEqual(navLabels(),['Practice claim','How it works','Sandbox']);
 assert.deepEqual(currentLinks(),['Practice claim']);
});

test('the private customer claim marks no product nav entry as current',async()=>{
 await render(React.createElement(Frame,{customer:true},child));
 assert.equal(document.querySelectorAll('header .rr-mh__nav a[aria-current="page"]').length,0);
 assert.match(document.body.textContent,/Private customer claim/);
});
