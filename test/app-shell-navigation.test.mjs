import assert from 'node:assert/strict';
import {build} from 'esbuild';
import test,{after} from 'node:test';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';

const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://fixture.invalid/practice',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','Node','MutationObserver','Event'])globalThis[name]=name==='window'?dom.window:dom.window[name];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
await mkdir('.cache',{recursive:true});
const bundleDir=await mkdtemp(resolve('.cache/app-shell-'));
after(async()=>{dom.window.close();await rm(bundleDir,{recursive:true,force:true});});
await build({entryPoints:['ui/system.jsx'],outdir:bundleDir,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const {AppShell}=await import(pathToFileURL(`${bundleDir}/system.js`).href);
const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');

test('the product navigation targets a real landing section on desktop and mobile',async()=>{
  const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
  await act(async()=>{root.render(React.createElement(AppShell,{note:'Simulated. No funds move.'},React.createElement('p',null,'body')));});
  const links=[...document.querySelectorAll('a')].filter(a=>a.textContent.trim()==='How it works');
  assert.equal(links.length,2,'desktop and mobile navigation both expose the link');
  assert.ok(links.every(a=>a.getAttribute('href')==='/#relay'));
  const landing=await readFile(resolve('public/landing.html'),'utf8');
  assert.match(landing,/id="relay"/);
  await act(async()=>root.unmount());container.remove();
});


test('Escape closes the mobile navigation and returns focus to its summary',async()=>{
  const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
  await act(async()=>{root.render(React.createElement(AppShell,null));});
  const menu=document.querySelector('.rr-mobile-menu'),summary=menu.querySelector('summary');
  menu.open=true;menu.querySelector('a').focus();
  await act(async()=>{menu.querySelector('a').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});
  assert.equal(menu.open,false);assert.equal(document.activeElement,summary);
  await act(async()=>root.unmount());container.remove();
});
