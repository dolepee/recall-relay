import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {ClaimDesk} from '../src/claims.mjs';
const dom=new JSDOM('<html><body></body></html>',{url:'https://fixture.invalid/desk',pretendToBeVisual:true});
dom.window.HTMLElement.prototype.scrollIntoView=function(){};
dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
for(const key of ['window','document','HTMLElement','Event'])globalThis[key]=key==='window'?dom.window:dom.window[key];
globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');
await mkdir('.cache',{recursive:true});const dir=await mkdtemp(resolve('.cache/reconciliation-dom-'));
await build({entryPoints:['ui/reconciliation-panel.jsx'],outdir:dir,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const {ReconciliationPanel}=await import(pathToFileURL(`${dir}/reconciliation-panel.js`));
let root,desk;afterEach(async()=>{await act(async()=>root?.unmount());document.body.innerHTML='';desk?.journal.close?.();});after(async()=>{dom.window.close();await rm(dir,{recursive:true,force:true});});
const button=t=>[...document.querySelectorAll('button')].find(x=>x.textContent===t);
async function click(t){assert.ok(button(t),t);await act(async()=>{button(t).click();await new Promise(r=>setTimeout(r,0));});}
test('saved purchase reconciliation opens its existing claim and reloads the immutable plan',async()=>{
 desk=new ClaimDesk({provider:new Proxy({}, {get(){throw new Error('No provider calls');}})});desk.setSetting('published','yes');desk.setSetting('active-campaign',JSON.stringify({sku:'CUP',lot:'A',coverage:[]}));
 const c={id:'one',revision:1,createdAt:'2026-10-20T00:00:00Z',purchase:{id:'RR-ONE',captureId:'CAP',lineId:'LINE',sku:'CUP',lot:'A',capturedAt:'2026-10-20T00:00:00Z',linePaidCents:3875,lineRefundedCents:1000}};desk.db.prepare('INSERT INTO claims VALUES (?,?,?)').run('one','hash',JSON.stringify(c));
 const actions=[];globalThis.fetch=async(path,options)=>{const input=JSON.parse(options.body);let value;if(path.endsWith('reconciliation-ledger'))value=desk.reconciliationLedger();else if(path.endsWith('reconciliation-plan'))value=desk.reconcileLedger(input);else if(path.endsWith('reconciliation-plans'))value=desk.reconciliationPlans();else throw new Error('Unexpected API');actions.push(path);return {ok:true,json:async()=>value};};
 const target=document.createElement('div');document.body.append(target);root=createRoot(target);let opened;
 await act(async()=>root.render(React.createElement(ReconciliationPanel,{openClaim:o=>{opened=o;},openBinding:()=>{}})));
 await click('Use saved purchases');assert.match(document.querySelector('#reconciliation-ledger').value,/CAP/);
 await act(async()=>{document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));});
 assert.match(document.body.textContent,/linked claim/);assert.match(document.body.textContent,/\$28\.75/);assert.match(document.body.textContent,/Not a current refundable balance/);
 const view=[...document.querySelectorAll('label')].find(l=>l.textContent.startsWith('Next action')).querySelector('select');await act(async()=>{view.value='NEEDS_EVIDENCE';view.dispatchEvent(new Event('change',{bubbles:true}));});assert.match(document.querySelector('[aria-label="Selected purchase line"]').textContent,/No purchase in this view/);assert.equal(button('Open existing claim'),undefined);await act(async()=>{view.value='LINKED_CLAIM';view.dispatchEvent(new Event('change',{bubbles:true}));});
 await click('Open existing claim');assert.equal(opened,'RR-ONE');assert.equal(desk.reconciliationPlans().length,1);
 await click('Load saved plans');assert.equal([...document.querySelectorAll('label')].find(l=>l.textContent.startsWith('Saved planning snapshot')).querySelectorAll('option').length,2);
 assert.ok(document.querySelector('a[download^="reconciliation-"]'));assert.ok(actions.every(x=>!x.includes('approve')&&!x.includes('capture')));
});

test('a pending reconciliation disables correction acceptance and cannot publish new edits with an old plan',async()=>{
 desk=new ClaimDesk({provider:{}});desk.setSetting('published','yes');desk.setSetting('active-campaign',JSON.stringify({sku:'CUP',lot:'A',coverage:[]}));
 const ledger={version:1,currency:'USD',source:{kind:'merchant-ledger',label:'Fixture',reference:null},orders:[{orderId:'missing',captureId:'CAP',capturedAt:'2026-10-20T00:00:00Z',status:'COMPLETED',lines:[{declaredLineId:'line',sku:'CUP',lot:null,quantity:1,itemPaidCents:1000,taxCents:0,shippingCents:0,refundedCents:0}]}]};
 let calls=0,release;globalThis.fetch=async(path,options)=>{const input=JSON.parse(options.body);let value;if(path.endsWith('reconciliation-ledger'))value=ledger;else if(path.endsWith('reconciliation-plan')){calls++;if(calls===2)await new Promise(r=>{release=r;});value=desk.reconcileLedger(input);}else throw new Error('Unexpected API');return {ok:true,json:async()=>value};};
 const target=document.createElement('div');document.body.append(target);root=createRoot(target);await act(async()=>root.render(React.createElement(ReconciliationPanel,{openClaim:()=>{},openBinding:()=>{}})));
 await click('Use saved purchases');const submit=async form=>act(async()=>{form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));});
 await submit(document.querySelector('form'));await click('Plan a lot correction');assert.ok(button('Use planning correction'));
 await submit(document.querySelector('form'));assert.equal(button('Use planning correction').disabled,true);
 await submit(document.querySelectorAll('form')[1]);assert.doesNotMatch(document.body.textContent,/planning correction\(s\) will be applied/);
 await act(async()=>{release();await new Promise(r=>setTimeout(r,0));});assert.equal(button('Use planning correction'),undefined);assert.doesNotMatch(document.body.textContent,/planning correction\(s\) will be applied/);assert.equal(desk.reconciliationPlans().length,1);
});
