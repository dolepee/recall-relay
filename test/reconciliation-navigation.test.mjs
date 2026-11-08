import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://fixture.invalid/desk',pretendToBeVisual:true});
let width=390;const queries=new Map();
dom.window.matchMedia=query=>{if(!queries.has(query)){const minimum=Number(/min-width:\s*(\d+)/.exec(query)?.[1]||0),listeners=new Set();queries.set(query,{matches:width>=minimum,minimum,listeners,addEventListener(_name,cb){listeners.add(cb);},removeEventListener(_name,cb){listeners.delete(cb);}});}return queries.get(query);};
dom.window.HTMLElement.prototype.scrollIntoView=function(){};
for(const key of ['document','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Node','MutationObserver','Event','KeyboardEvent','MouseEvent'])globalThis[key]=dom.window[key];
globalThis.window=dom.window;globalThis.location=dom.window.location;globalThis.history=dom.window.history;Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
await mkdir('.cache',{recursive:true});const dir=await mkdtemp(resolve('.cache/reconciliation-navigation-'));
const unavailable={name:'unavailable-studio',setup(b){b.onResolve({filter:/(?:^|\/)(?:reconciliation-studio|studio-workspace)\.jsx$/},()=>({path:'studio',namespace:'unavailable'}));b.onLoad({filter:/.*/,namespace:'unavailable'},()=>({contents:'export default function Studio(){throw new Error("Fixture unavailable Studio")}',loader:'jsx'}));}};
await build({entryPoints:['ui/connected.jsx'],outdir:dir,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[unavailable],logLevel:'silent'});
const {MerchantDesk}=await import(pathToFileURL(`${dir}/connected.js`).href);const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');let root;
after(async()=>{dom.window.close();await rm(dir,{recursive:true,force:true});});afterEach(async()=>{await act(async()=>root?.unmount());root=null;document.body.innerHTML='';});
const tick=()=>new Promise(r=>setTimeout(r,25));async function settle(condition){for(let i=0;i<60;i++){if(condition())return;await act(tick);}assert.ok(condition(),'UI did not settle');}
const button=text=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===text);
async function click(text){assert.ok(button(text),`Missing ${text}`);await act(async()=>{button(text).click();await tick();});}
const campaign={product:'Recalled cup',sku:'RH-CUP',lot:'LOT-A',title:'Fictional source',notice:'Upload one photo.',fields:[],coverage:[]};
function fixtureCase(id,order,product,completed){return {id,order,campaign:{...campaign,product},amountCents:3875,currency:'USD',revision:3,submittedAt:'2026-11-08T00:00:00Z',status:{code:completed?'COMPLETED':'SUBMITTED',reason:completed?'PayPal confirmed the refund.':'With the merchant.'},locked:completed,plan:{status:completed?'COMPLETED':'REVIEW',reason:'Fixture recorded state.'},missing:[],submission:{lot:'LOT-A',acknowledged:true,hasPhoto:false,extra:{}},correction:null,review:completed?{revision:3}:null,receipt:completed?{amountCents:3875,refundId:'FIXTURE-REFUND'}:null,payment:completed?{state:'COMPLETED'}:null,claimUrl:'/claim#fixture'};}
async function mount(viewport){width=viewport;for(const m of queries.values()){m.matches=width>=m.minimum;for(const cb of m.listeners)cb();}
 const a=fixtureCase('a','RR-A','Different product',false),b=fixtureCase('b','RR-B','Target recalled cup',true),calls=[];let missing=false;
 const state=()=>({cases:missing?[a]:[a,b],campaign,published:true,hosted:true,checkouts:[],provisioned:[]});
 const ledger={version:1,currency:'USD',source:{kind:'merchant-ledger',label:'Fixture'},orders:[]};
 const plan={id:'saved-plan',createdAt:'2026-11-08',ledger,scope:{sku:'RH-CUP',lot:'LOT-A',clauses:[]},summary:{affected:1,excluded:0,unknown:0,declaredAffectedCents:3875,unknownAffectedAmounts:0,linked:1},lines:[{rowKey:'target-line',orderId:'RR-B',declaredLineId:'RH-CUP-LINE',sku:'RH-CUP',lot:'LOT-A',scope:'AFFECTED',readiness:'LINKED_CLAIM',declaredRemainingCents:3875,reasons:[],action:{kind:'CLAIM',order:'RR-B',claimId:'b'}}]};
 globalThis.fetch=async(path)=>{calls.push(path);let value;if(path==='/api/merchant/state')value=state();else if(path==='/api/merchant/reconciliation-ledger')value=ledger;else if(path==='/api/merchant/reconciliation-plan')value=plan;else throw Error(`Unexpected API ${path}`);return new Response(JSON.stringify(value));};
 const target=document.createElement('div');document.body.append(target);root=createRoot(target);await act(async()=>{root.render(React.createElement(MerchantDesk));await tick();});await settle(()=>!!document.querySelector('#claim-review'));
 const panel=document.querySelector('details[aria-label="Reconcile recall purchases"]');panel.open=true;await click('Use saved purchases');await settle(()=>!button('Save reviewed reconciliation').disabled);await act(async()=>{panel.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await tick();});await settle(()=>!!button('Open existing claim'));
 const filter=[...panel.querySelectorAll('label')].find(l=>l.textContent.startsWith('Next action')).querySelector('select');await act(async()=>{filter.value='LINKED_CLAIM';filter.dispatchEvent(new Event('change',{bubbles:true}));await tick();});
 return {panel,filter,calls,removeTarget(){missing=true;}};
}
for(const viewport of [390,1280])test(`reconciliation opens the exact current claim and returns to the selected purchase at ${viewport}px`,async()=>{
 const {panel,filter,calls}=await mount(viewport);assert.match(document.querySelector('#claim-review').textContent,/Different product/);
 await click('Open existing claim');await settle(()=>document.activeElement?.textContent==='Target recalled cup');assert.equal(panel.open,false);const claim=document.querySelector('#claim-review');assert.match(claim.textContent,/RR-B/);assert.match(claim.textContent,/FIXTURE-REFUND/);assert.equal(claim.querySelector('h2').textContent,'Target recalled cup');assert.ok(button('Return to reconciliation'));
 await click('Return to reconciliation');await settle(()=>document.activeElement===panel.querySelector('[aria-label="Selected purchase line"] h3'));assert.equal(panel.open,true);assert.equal(filter.value,'LINKED_CLAIM');assert.match(document.activeElement.textContent,/RR-B · RH-CUP-LINE/);assert.equal(button('Return to reconciliation'),undefined);assert.ok(calls.every(p=>!/(approve|capture|checkout|reconcile$)/.test(p)));
});
test('an unavailable linked claim keeps its plan open and never substitutes another claim',async()=>{
 const {panel,calls,removeTarget}=await mount(390);removeTarget();await click('Open existing claim');await settle(()=>!!panel.querySelector('[role="alert"]'));assert.match(panel.textContent,/no other claim was opened/);assert.equal(panel.open,true);assert.match(document.querySelector('#claim-review').textContent,/Different product/);assert.equal(button('Return to reconciliation'),undefined);assert.ok(calls.every(p=>!/(approve|capture|checkout)/.test(p)));
});
