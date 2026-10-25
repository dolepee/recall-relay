import assert from 'node:assert/strict';
import {build} from 'esbuild';
import test,{after} from 'node:test';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {ClaimDesk} from '../src/claims.mjs';
import {SourceWorkspace} from '../src/source-workspace.mjs';
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://fixture.invalid/setup',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLInputElement','Node','MutationObserver','Event','KeyboardEvent','MouseEvent'])globalThis[name]=name==='window'?dom.window:dom.window[name];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
await mkdir('.cache',{recursive:true});
const bundleDir=await mkdtemp(resolve('.cache/setup-dom-'));
after(async()=>{dom.window.close();await rm(bundleDir,{recursive:true,force:true});});
await build({entryPoints:['ui/setup.jsx'],outfile:`${bundleDir}/setup.mjs`,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const {SourceSetup}=await import(pathToFileURL(`${bundleDir}/setup.mjs`).href);
const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

// Mount the actual setup component against the actual in-memory source workspace.
// Every fetch is intercepted; no browser, payment provider or model is contacted.
test('source setup preserves navigation and reconciles async draft revisions',async()=>{
let passed=0;
for(const republish of [false,true])for(const phase of ['activate','refresh'])for(const navigation of ['none','focus','tab-body','pointer','switch','switch-back','failure']){
 const desk=new ClaimDesk({path:':memory:',provider:async()=>{throw new Error('No payment calls permitted');}});
 const ai={status:()=>({available:false,model:'NO INFERENCE'})};
 const ws=new SourceWorkspace(desk.db,{ai,loadSource:async n=>({recallNumber:n,title:`Synthetic notice ${n}`,products:[{name:`Synthetic ${n}`}],description:'Local DOM fixture',retrievedAt:'2026-10-24T00:00:00Z',route:'ORIGINAL_PAYMENT_CANDIDATE',sourceUrl:'https://example.invalid/notice',sourceDigest:n.padEnd(64,'a'),remedies:[`Upload a photograph for notice ${n}.`],requirements:[]})});
 const prepare=async n=>{let r=await ws.import(n);r=ws.addField(r.id,{revision:r.revision,kind:'PHOTO',quote:r.source.remedies[0]});return ws.review(r.id,{revision:r.revision,fieldIds:r.suggestion.requirements.map(f=>f.id),confirmed:true});};
 let a=await prepare('27026'),b=await prepare('27027');
 if(republish)a=ws.activate(a.id,{revision:a.revision,sku:'FIXTURE-A',lot:'LOT-A',confirmed:true},desk);
 b=ws.activate(b.id,{revision:b.revision,sku:'FIXTURE-B',lot:'LOT-B',confirmed:true},desk);
 let release,hold=false;const gate=new Promise(resolve=>{release=resolve;});
 globalThis.fetch=async(path,options={})=>{
  if(path==='/api/merchant/source-activate'){
   if(phase==='activate')await gate;
   if(navigation==='failure'&&phase==='activate')return new Response(JSON.stringify({error:'Injected activation failure'}),{status:503});
   const result=ws.activate(JSON.parse(options.body).id,JSON.parse(options.body),desk);hold=true;
   return new Response(JSON.stringify(result));
  }
  assert.equal(path,'/api/merchant/sources');if(hold&&phase==='refresh')await gate;
  if(hold&&navigation==='failure'&&phase==='refresh')return new Response(JSON.stringify({error:'Injected refresh failure'}),{status:503});
  return new Response(JSON.stringify(await ws.state(desk)));
 };
 const root=createRoot(document.getElementById('root'));
 await act(async()=>{root.render(React.createElement(SourceSetup));await tick();});
 const selector=[...document.querySelectorAll('select')].find(x=>x.parentElement.textContent.includes('Saved notice setups'));
 const select=async id=>act(async()=>{selector.value=id;selector.dispatchEvent(new Event('change',{bubbles:true}));await tick();});
 await select(a.id);
 const label=[...document.querySelectorAll('label')].find(x=>x.textContent.includes('Use the reviewed instructions and these explicit product identifiers'));
 await act(async()=>{label.querySelector('input').click();});
 const publish=[...document.querySelectorAll('button')].find(x=>x.textContent==='Publish sandbox scenario');
 assert(!publish.disabled);
 await act(async()=>{publish.focus();publish.click();await tick();});
 let expected;
 if(navigation==='focus'){expected=document.querySelector('a[href="https://example.invalid/notice"]');await act(async()=>expected.focus());}
 if(navigation==='tab-body'){await act(async()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));publish.blur();});expected=document.body;}
 if(navigation==='pointer'){await act(async()=>document.querySelector('h1').dispatchEvent(new MouseEvent('pointerdown',{bubbles:true})));expected=document.body;}
 if(navigation.startsWith('switch')){await act(async()=>selector.focus());await select(b.id);if(navigation==='switch-back')await select(a.id);expected=selector;}
 await act(async()=>{release();await tick();await tick();});
 const context=`${republish?'republish':'publish'}/${phase}/${navigation}`;
 if(navigation==='failure'){assert.notEqual(document.activeElement,document.querySelector('h2[tabindex]'),context);assert.match(document.querySelector('[role=alert]').textContent,/Injected .* failure/,context);}
 else if(navigation==='none'){assert.equal(document.activeElement.tagName,'H2',context);assert.equal(document.activeElement.textContent,'Your instructions are published.',context);}
 else assert.equal(document.activeElement===expected,true,context);
 if(navigation==='switch'){assert.equal(selector.value,b.id,context);assert.equal(document.querySelector('h2[tabindex]').textContent,'Publish the reviewed form.',context);}
 if(!(navigation==='failure'&&phase==='activate'))assert.notEqual(desk.activeCampaign().id,b.publishedCampaign.id,context);
 await act(async()=>root.unmount());desk.close();passed++;
}
for(const phase of ['action','refresh'])for(const returnToA of [false,true]){
 const desk=new ClaimDesk({path:':memory:',provider:async()=>{throw new Error('No payment calls permitted');}});
 const ai={status:()=>({available:true,model:'INJECTED TEST DOUBLE'}),generate:async(_prompt,source)=>JSON.stringify({requirements:[{kind:'PHOTO',quote:source.remedies[0]},{kind:'TEXT',quote:source.remedies[1]}]})};
 const ws=new SourceWorkspace(desk.db,{ai,loadSource:async n=>({recallNumber:n,title:`Synthetic notice ${n}`,products:[{name:`Synthetic ${n}`}],description:'Local DOM fixture',retrievedAt:'2026-10-24T00:00:00Z',route:'ORIGINAL_PAYMENT_CANDIDATE',sourceUrl:'https://example.invalid/notice',sourceDigest:n.padEnd(64,'a'),remedies:[`Upload a photograph for notice ${n}.`,`Provide the printed serial number for notice ${n}.`],requirements:[]})});
 const prepare=async n=>{let r=await ws.import(n);r=ws.addField(r.id,{revision:r.revision,kind:'PHOTO',quote:r.source.remedies[0]});return ws.review(r.id,{revision:r.revision,fieldIds:r.suggestion.requirements.map(f=>f.id),confirmed:true});};
 const a=await prepare('27026'),b=await prepare('27027');
 let release,hold=false;const gate=new Promise(resolve=>{release=resolve;});
 globalThis.fetch=async(path,options={})=>{
  if(path==='/api/merchant/source-suggest'){
   if(phase==='action')await gate;
   const data=JSON.parse(options.body),result=await ws.suggest(data.id,data.revision);hold=true;
   return new Response(JSON.stringify(result));
  }
  if(path==='/api/merchant/source-review'){
   const data=JSON.parse(options.body);return new Response(JSON.stringify(ws.review(data.id,data)));
  }
  assert.equal(path,'/api/merchant/sources');if(hold&&phase==='refresh')await gate;
  return new Response(JSON.stringify(await ws.state(desk)));
 };
 const root=createRoot(document.getElementById('root'));
 await act(async()=>{root.render(React.createElement(SourceSetup));await tick();});
 const selector=[...document.querySelectorAll('select')].find(x=>x.parentElement.textContent.includes('Saved notice setups'));
 const select=async id=>act(async()=>{selector.value=id;selector.dispatchEvent(new Event('change',{bubbles:true}));await tick();});
 await select(a.id);
 await act(async()=>[...document.querySelectorAll('button')].find(x=>x.textContent==='Edit reviewed fields').click());
 await act(async()=>{[...document.querySelectorAll('button')].find(x=>x.textContent==='Draft fields again').click();await tick();});
 await act(async()=>selector.focus());await select(b.id);if(returnToA)await select(a.id);
 await act(async()=>{release();await tick();await tick();});
 const context=`draft/${phase}/${returnToA?'away-back':'stay-on-b'}`;
 assert.equal(selector.value,returnToA?a.id:b.id,context);
 assert.equal(document.activeElement===selector,true,context);
 if(!returnToA)await select(a.id);
 // The new requirement is a selectable draft field, not merely original-source text.
 assert([...document.querySelectorAll('label')].some(x=>x.textContent.includes('Written information')&&x.textContent.includes('Provide the printed serial number')),context);
 const confirmation=[...document.querySelectorAll('label')].find(x=>x.textContent.includes('I checked the selected fields'));
 await act(async()=>confirmation.querySelector('input').click());
 await act(async()=>{[...document.querySelectorAll('button')].find(x=>x.textContent==='Save reviewed instructions').click();await tick();await tick();});
 assert.equal(document.querySelector('[role=alert]'),null,context);
 assert.equal(ws.get(a.id).review.fields.length,2,context);
 assert.equal(document.querySelector('h2[tabindex]').textContent,'Publish the reviewed form.',context);
 await act(async()=>root.unmount());desk.close();passed++;
}
assert.equal(passed,32);
});
