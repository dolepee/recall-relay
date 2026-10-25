import assert from 'node:assert/strict';
import {build} from 'esbuild';
import test,{after,afterEach} from 'node:test';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {ClaimDesk} from '../src/claims.mjs';
import {SourceWorkspace} from '../src/source-workspace.mjs';

// Rendered regression coverage for the two controls the publication-focus fix does not cover:
// "Save reviewed instructions" on the setup page and "Refresh claims" on the desk. Both are
// disabled while their request runs, so the browser blurs them and focus falls to <body>; the
// saved instructions also remove their own control on success.
//
// jsdom does not blur a control that becomes disabled, so that browser behaviour is applied
// explicitly while the request is in flight (see `browserBlur`). Everything else is the real
// interface mounted against the real in-memory workspace; every fetch is intercepted and no
// browser, payment provider or model is contacted. The rendered Chromium packet remains the
// authority for the browser's own behaviour.
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://fixture.invalid/desk',pretendToBeVisual:true});
// The desk reads the wide-layout media query at module scope; the single-column layout is mounted.
dom.window.matchMedia=query=>({matches:false,media:query,onchange:null,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent(){return false;}});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Node','MutationObserver','Event','KeyboardEvent','MouseEvent'])globalThis[name]=name==='window'?dom.window:dom.window[name];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.location=dom.window.location;globalThis.history=dom.window.history;
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
await mkdir('.cache',{recursive:true});
const bundleDir=await mkdtemp(resolve('.cache/focus-dom-'));
after(async()=>{dom.window.close();await rm(bundleDir,{recursive:true,force:true});});
await build({entryPoints:['ui/setup.jsx','ui/connected.jsx'],outdir:bundleDir,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const {SourceSetup}=await import(pathToFileURL(`${bundleDir}/setup.js`).href);
const {MerchantDesk}=await import(pathToFileURL(`${bundleDir}/connected.js`).href);
const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
// React flushes its work when an act callback finishes, so every wait is wrapped in act.
const step=async(times=2)=>{await act(async()=>{for(let i=0;i<times;i++)await tick();});};
// Wait for the interface's own outcome rather than a fixed number of ticks.
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
const button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
const text=node=>node?node.textContent.replace(/\s+/g,' ').trim():'';
const heading=()=>document.querySelector('h2[tabindex]');
// Assertions compare this short label, never a DOM node: serialising a jsdom element for an
// assertion message walks the whole document.
const activeLabel=()=>{const node=document.activeElement;if(!node)return 'none';return `${node.tagName}:${node.getAttribute('href')??text(node).slice(0,40)}`;};
// The browser blurs a control that becomes disabled, so a request in flight leaves focus on the
// document body even though the user never moved.
const browserBlur=async()=>{await tick();const active=document.activeElement;if(active&&active!==document.body&&active.disabled)active.blur();};
const noPayment=async()=>{throw new Error('No payment calls permitted');};
// A response that is still in flight while the merchant moves on.
function deferred(){let release;const promise=new Promise(resolve=>{release=resolve;});return {promise,release};}

// Every mount is torn down after its test, including after a failed assertion, so one test's
// interface can never answer another test's queries.
const mounted=[];
async function render(element,ready=()=>true){
  const container=document.createElement('div');
  document.body.appendChild(container);
  const root=createRoot(container);
  await act(async()=>{root.render(element);await tick();});
  await settle(ready);
  await step();
  let done=false;
  const unmount=async()=>{if(done)return;done=true;await act(async()=>{root.unmount();});container.remove();};
  mounted.push(unmount);
  return unmount;
}
afterEach(async()=>{for(const unmount of mounted.splice(0))await unmount();document.body.innerHTML='';});

const quotesFor=number=>[`Upload a photograph of the label for UI TEST FIXTURE setup ${number}.`,`Confirm the printed serial number for UI TEST FIXTURE setup ${number}.`];
const sourceFor=number=>({title:`Synthetic notice ${number}`,recallNumber:number,description:'Local DOM fixture',products:[{name:`Synthetic ${number}`}],route:'ORIGINAL_PAYMENT_CANDIDATE',sourceUrl:'https://example.invalid/notice',sourceDigest:String(number).padEnd(64,'a').slice(0,64),retrievedAt:'2026-10-24T00:00:00Z',remedies:quotesFor(number),requirements:quotesFor(number).map(quote=>({quote}))});

// A draft setup is on screen with its reviewed-fields confirmation ticked, so the save control is
// enabled and its request can be failed on demand.
async function mountSetup({saveFails=false}={}){
  const desk=new ClaimDesk({path:':memory:',provider:noPayment});
  const workspace=new SourceWorkspace(desk.db,{ai:{status:()=>({available:false,model:'NO INFERENCE'})},loadSource:async number=>structuredClone(sourceFor(number))});
  const first=workspace.addField((await workspace.import('27026')).id,{revision:1,kind:'PHOTO',quote:quotesFor('27026')[0]});
  // A second draft setup, so the merchant can change the selection while a save is pending.
  const second=workspace.addField((await workspace.import('27027')).id,{revision:1,kind:'PHOTO',quote:quotesFor('27027')[0]});
  let hold=null;
  globalThis.fetch=async(path,options={})=>{
    if(path==='/api/merchant/source-review'){
      await browserBlur();
      if(hold)await hold.promise;
      if(saveFails)return new Response(JSON.stringify({error:'The reviewed instructions could not be saved.'}),{status:503});
      return new Response(JSON.stringify(workspace.review(JSON.parse(options.body).id,JSON.parse(options.body))));
    }
    assert.equal(path,'/api/merchant/sources');
    return new Response(JSON.stringify(await workspace.state(desk)));
  };
  const unmount=await render(React.createElement(SourceSetup),()=>button('Save reviewed instructions'));
  // The newest draft is the one displayed on load; `setups` holds both, newest last.
  const confirmation=[...document.querySelectorAll('label')].find(node=>node.textContent.includes('I checked the selected fields'));
  assert(confirmation,'the reviewed-fields confirmation is rendered');
  await act(async()=>{confirmation.querySelector('input').click();await tick();});
  await settle(()=>button('Save reviewed instructions').disabled===false);
  assert.equal(button('Save reviewed instructions').disabled,false,'the save control is enabled');
  assert.equal(workspace.get(second.id).review,null,'the setup is still an unsaved draft');
  const setups=[first,second];
  const selectSetup=async row=>{
    const selector=[...document.querySelectorAll('select')].find(node=>node.parentElement.textContent.includes('Saved notice setups'));
    // A merchant reaching the selector has focus there, so the move is theirs, not the guard's.
    await act(async()=>{selector.focus();selector.value=row.id;selector.dispatchEvent(new Event('change',{bubbles:true}));await tick();});
    return selector;
  };
  return {desk,workspace,draftId:second.id,setups,selectSetup,setHold:value=>{hold=value;},unmount};
}

async function mountDesk({failFirstState=false,stateFails=false}={}){
  const desk=new ClaimDesk({path:':memory:',provider:noPayment});
  let pendingFailures=failFirstState?1:0,hold=null;
  globalThis.fetch=async path=>{
    assert.equal(path,'/api/merchant/state');
    await browserBlur();
    if(hold)await hold.promise;
    if(stateFails||pendingFailures>0){
      if(pendingFailures>0)pendingFailures--;
      return new Response(JSON.stringify({error:'The desk could not be updated.'}),{status:503});
    }
    return new Response(JSON.stringify(desk.merchantState()));
  };
  const unmount=await render(React.createElement(MerchantDesk),()=>button('Refresh claims')||button('Retry loading desk'));
  return {desk,setHold:value=>{hold=value;},unmount};
}

test('saving reviewed instructions moves focus to the publish step instead of the document body',async()=>{
  const {workspace,draftId,unmount}=await mountSetup();
  const save=button('Save reviewed instructions');
  await act(async()=>{save.focus();save.click();await tick();});
  await settle(()=>!button('Save reviewed instructions'));
  await step();
  assert.equal(activeLabel(),'H2:Publish the reviewed form.','focus moves to the mounted step heading');
  assert.equal(text(heading()),'Publish the reviewed form.');
  // The saved instructions are the ones the interface now shows.
  assert.equal(document.querySelector('[role=alert]'),null);
  assert.equal(workspace.get(draftId).review.status,'REVIEWED_SETUP');
  await unmount();
});

test('a failed save keeps focus on the save control and announces the failure',async()=>{
  const {unmount}=await mountSetup({saveFails:true});
  const save=button('Save reviewed instructions');
  await act(async()=>{save.focus();save.click();await tick();});
  await settle(()=>document.querySelector('[role=alert]'));
  await step();
  assert.match(text(document.querySelector('[role=alert]')),/could not be saved/);
  assert.equal(activeLabel(),'BUTTON:Save reviewed instructions','focus returns to the control that is still on the page');
  await unmount();
});

test('a deliberate move during a save is never overridden',async()=>{
  const {unmount}=await mountSetup();
  const save=button('Save reviewed instructions');
  await act(async()=>{save.focus();save.click();await tick();});
  // A keyboard user tabs away while the request is still running.
  const elsewhere=document.querySelector('a[href="https://example.invalid/notice"]');
  await act(async()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));elsewhere.focus();await tick();});
  await settle(()=>!button('Save reviewed instructions'));
  await step();
  assert.equal(activeLabel(),'A:https://example.invalid/notice');
  await unmount();
});

test('refreshing the desk keeps focus on the refresh control instead of the document body',async()=>{
  const {unmount}=await mountDesk();
  const refresh=button('Refresh claims');
  assert(refresh,'the refresh control is rendered');
  await act(async()=>{refresh.focus();refresh.click();await tick();});
  await settle(()=>button('Refresh claims')?.disabled===false);
  await step();
  assert.equal(activeLabel(),'BUTTON:Refresh claims');
  await unmount();
});

test('a failed refresh keeps focus on the refresh control and announces the failure',async()=>{
  const {unmount}=await mountDesk({stateFails:true});
  const refresh=button('Refresh claims');
  await act(async()=>{refresh.focus();refresh.click();await tick();});
  await settle(()=>document.querySelector('[role=alert]'));
  await step();
  assert.match(text(document.querySelector('[role=alert]')),/could not be updated/);
  assert.equal(activeLabel(),'BUTTON:Refresh claims');
  await unmount();
});

test('a deliberate move during a refresh is never overridden',async()=>{
  const {unmount}=await mountDesk();
  const refresh=button('Refresh claims');
  await act(async()=>{refresh.focus();refresh.click();await tick();});
  const elsewhere=document.querySelector('a[href="/setup"]');
  await act(async()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));elsewhere.focus();await tick();});
  await settle(()=>button('Refresh claims')?.disabled===false);
  await step();
  assert.equal(activeLabel(),'A:/setup');
  await unmount();
});

test('reloading the desk from its retry control lands on the heading that stays mounted',async()=>{
  const {unmount}=await mountDesk({failFirstState:true});
  const retry=button('Retry loading desk');
  assert(retry,'the retry control is rendered after the desk fails to open');
  await act(async()=>{retry.focus();retry.click();await tick();});
  await settle(()=>!button('Retry loading desk'));
  await step();
  // The retry control unmounts with the failed state, so the guard falls through to the heading.
  assert.equal(activeLabel(),'H1:Claims');
  await unmount();
});

// A response that arrives after the merchant has already moved on must not take the focus back.
test('a delayed save does not take focus back from a keyboard move made while it was pending',async()=>{
  const {setHold,unmount}=await mountSetup();
  const hold=deferred();setHold(hold);
  const save=button('Save reviewed instructions');
  await act(async()=>{save.focus();save.click();await tick();});
  const elsewhere=document.querySelector('a[href="https://example.invalid/notice"]');
  await act(async()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));elsewhere.focus();await tick();});
  await act(async()=>{hold.release();await tick();});
  await settle(()=>!button('Save reviewed instructions'));
  await step();
  assert.equal(activeLabel(),'A:https://example.invalid/notice');
  await unmount();
});

test('a delayed save does not take focus back from a pointer move made while it was pending',async()=>{
  const {setHold,unmount}=await mountSetup();
  const hold=deferred();setHold(hold);
  const save=button('Save reviewed instructions');
  await act(async()=>{save.focus();save.click();await tick();});
  const elsewhere=document.querySelector('a[href="/desk"]');
  await act(async()=>{elsewhere.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true}));elsewhere.focus();await tick();});
  await act(async()=>{hold.release();await tick();});
  await settle(()=>!button('Save reviewed instructions'));
  await step();
  assert.equal(activeLabel(),'A:/desk');
  await unmount();
});

test('a delayed save whose response arrives after the merchant switched away and stayed away moves nothing',async()=>{
  const {workspace,setups,selectSetup,setHold,unmount}=await mountSetup();
  const hold=deferred();setHold(hold);
  const saved=setups[1];
  const save=button('Save reviewed instructions');
  await act(async()=>{save.focus();save.click();await tick();});
  // The merchant selects the other saved setup while the save is still in flight, and stays there.
  const selector=await selectSetup(setups[0]);
  await act(async()=>{hold.release();await tick();});
  await step(4);
  assert.equal(selector.value,setups[0].id,'the other setup stays displayed');
  assert.equal(activeLabel().startsWith('SELECT:'),true,'focus stays on the selection the merchant made');
  assert.equal(workspace.get(saved.id).review.status,'REVIEWED_SETUP','the save still reached the server');
  await unmount();
});

test('a delayed failed save whose response arrives after the merchant switched away moves nothing',async()=>{
  const {setups,selectSetup,setHold,unmount}=await mountSetup({saveFails:true});
  const hold=deferred();setHold(hold);
  const save=button('Save reviewed instructions');
  await act(async()=>{save.focus();save.click();await tick();});
  const selector=await selectSetup(setups[0]);
  await act(async()=>{hold.release();await tick();});
  await step(4);
  assert.equal(selector.value,setups[0].id);
  assert.equal(activeLabel().startsWith('SELECT:'),true,'focus stays on the selection the merchant made');
  await unmount();
});

test('a delayed refresh does not take focus back from a keyboard move made while it was pending',async()=>{
  const {setHold,unmount}=await mountDesk();
  const hold=deferred();setHold(hold);
  const refresh=button('Refresh claims');
  await act(async()=>{refresh.focus();refresh.click();await tick();});
  const elsewhere=document.querySelector('a[href="/setup"]');
  await act(async()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));elsewhere.focus();await tick();});
  await act(async()=>{hold.release();await tick();});
  await settle(()=>button('Refresh claims')?.disabled===false);
  await step();
  assert.equal(activeLabel(),'A:/setup');
  await unmount();
});

test('a delayed failed refresh does not take focus back from a pointer move made while it was pending',async()=>{
  const {setHold,unmount}=await mountDesk({stateFails:true});
  const hold=deferred();setHold(hold);
  const refresh=button('Refresh claims');
  await act(async()=>{refresh.focus();refresh.click();await tick();});
  const elsewhere=document.querySelector('a[href="/setup"]');
  await act(async()=>{elsewhere.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true}));elsewhere.focus();await tick();});
  await act(async()=>{hold.release();await tick();});
  await settle(()=>document.querySelector('[role=alert]'));
  await step();
  assert.equal(activeLabel(),'A:/setup');
  await unmount();
});
