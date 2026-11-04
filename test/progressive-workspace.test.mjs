import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
const dom=new JSDOM('<html><body></body></html>');
for(const key of ['window','document','HTMLElement','Event'])globalThis[key]=key==='window'?dom.window:dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
await mkdir('.cache',{recursive:true});
const dir=await mkdtemp(resolve('.cache/workspace-'));
await build({entryPoints:['ui/progressive-workspace.jsx'],outdir:dir,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const {ProgressiveWorkspace}=await import(pathToFileURL(`${dir}/progressive-workspace.js`));
let root;
afterEach(async()=>{await act(async()=>root?.unmount());document.body.innerHTML='';});
after(async()=>{dom.window.close();await rm(dir,{recursive:true,force:true});});
const tick=ms=>new Promise(r=>setTimeout(r,ms));
async function mount(load,delayMs=10000){
  const container=document.createElement('div');document.body.append(container);root=createRoot(container);
  await act(async()=>root.render(React.createElement(ProgressiveWorkspace,{load,delayMs,fallback:React.createElement('input',{'aria-label':'Standard review',defaultValue:'draft'})})));
}
const loaded={default:()=>React.createElement('h2',null,'Studio loaded')};
test('a fast download automatically opens Studio',async()=>{
  await mount(()=>Promise.resolve(loaded));
  assert.match(document.body.textContent,/Studio loaded/);
});
test('a slow download leaves usable controls and switches only on request',async()=>{
  let finish;await mount(()=>new Promise(r=>{finish=r;}),5);
  await act(()=>tick(15));
  assert.match(document.body.textContent,/taking longer/);assert.ok(document.querySelector('input'));
  await act(async()=>finish(loaded));
  assert.ok(document.querySelector('input'));assert.doesNotMatch(document.body.textContent,/Studio loaded/);
  await act(async()=>document.querySelector('button').click());
  assert.match(document.body.textContent,/Studio loaded/);
});
test('finishing a download preserves an active draft and keyboard focus',async()=>{
  let finish;await mount(()=>new Promise(r=>{finish=r;}));
  const input=document.querySelector('input');await act(async()=>{input.focus();input.value='in progress';});
  await act(async()=>finish(loaded));
  assert.equal(document.activeElement,input);assert.equal(input.value,'in progress');
  assert.ok(document.querySelector('button'));
});
test('a rejected import leaves the standard workspace usable',async()=>{
  await mount(()=>Promise.reject(new Error('offline')));
  assert.match(document.body.textContent,/could not download/);assert.ok(document.querySelector('input'));
});
