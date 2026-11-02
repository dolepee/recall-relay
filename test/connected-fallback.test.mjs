import assert from 'node:assert/strict';
import {build} from 'esbuild';
import test,{after,afterEach} from 'node:test';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';

// The connected panels normally sit beside the claim review inside the Studio workspace. When
// that workspace cannot load or render, the desk falls back to BasicCaseWorkspace, which has no
// standalone panels — so they must be mounted inside the ordinary claim review instead of being
// suppressed because the viewport is wide. This bundle swaps the Studio module for one that
// throws while rendering, which is the same path as a failed Studio import or render.
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://fixture.invalid/desk',pretendToBeVisual:true});
// A wide desk: this is exactly the case where the standalone panels would otherwise be expected.
dom.window.matchMedia=query=>({matches:query.includes('min-width: 1100px'),media:query,onchange:null,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent(){return false;}});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Node','MutationObserver','Event','KeyboardEvent','MouseEvent'])globalThis[name]=name==='window'?dom.window:dom.window[name];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.location=dom.window.location;globalThis.history=dom.window.history;
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
await mkdir('.cache',{recursive:true});
const bundleDir=await mkdtemp(resolve('.cache/connected-fallback-'));
after(async()=>{dom.window.close();await rm(bundleDir,{recursive:true,force:true});});
const failingStudio={
  name:'failing-studio',
  setup(builder){
    builder.onResolve({filter:/studio-workspace\.jsx$/},()=>({path:'studio-unavailable',namespace:'unavailable'}));
    builder.onLoad({filter:/.*/,namespace:'unavailable'},()=>({contents:'export default function StudioWorkspace(){throw new Error("Studio workspace unavailable")}',loader:'jsx'}));
  },
};
await build({entryPoints:['ui/connected.jsx'],outdir:bundleDir,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent',plugins:[failingStudio]});
const {MerchantDesk}=await import(pathToFileURL(`${bundleDir}/connected.js`).href);
const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const step=async(times=2)=>{await act(async()=>{for(let i=0;i<times;i++)await tick();});};
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
const text=node=>node?node.textContent.replace(/\s+/g,' ').trim():'';

// The real merchant case shape, as returned by `merchantState()`: submitted evidence, one
// unresolved source requirement and a recorded evidence review that still needs the approval.
const campaign={
  title:'Synthetic connected desk',notice:'Local DOM fixture',sourceUrl:'https://example.invalid/notice',
  product:'Synthetic lamp',sku:'SKU-SYNTH',lot:'LOT-A',
  coverage:[{id:'cov-1',kind:'CONFIRMATION',disposition:'UNRESOLVED',quote:'Confirm the item was returned',reason:'The customer has not confirmed the return.'}],
  fields:[],
};
const state={
  mode:'real-sandbox',campaign,published:false,checkouts:[],
  cases:[{
    id:'claim-1',order:'RR-CONN-01',campaign,amountCents:2599,currency:'USD',
    status:{code:'SUBMITTED',reason:'The claim is with you for review.'},
    missing:['Confirm the source requirement: Confirm the item was returned'],
    revision:2,correction:null,submittedAt:'2026-11-02T00:00:00Z',
    submission:{lot:'LOT-A',acknowledged:true,hasPhoto:false,extra:{}},
    locked:false,receipt:null,plan:{status:'REVIEW',reason:'Evidence review required.'},
    review:null,payment:null,claimUrl:'/claim?claim=claim-1#fixture',
  }],
};

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

const panelSummaries=()=>[...document.querySelectorAll('details')].filter(node=>['Source coverage','Exceptions and amounts','Recorded review brief'].includes(text(node.querySelector('summary'))));

test('the desktop fallback keeps source coverage, exceptions and the recorded brief',async()=>{
  globalThis.fetch=async path=>{
    assert.equal(path,'/api/merchant/state');
    return new Response(JSON.stringify(state));
  };
  // A failed Studio render is reported by the boundary; that is the condition under test.
  const logged=[];const consoleError=console.error;
  console.error=(...args)=>logged.push(args.join(' '));
  try{
    await render(React.createElement(MerchantDesk),()=>document.querySelector('[aria-label="Recorded review brief"]'));
  }finally{console.error=consoleError;}

  const panels=panelSummaries();
  assert.deepEqual(panels.map(node=>text(node.querySelector('summary'))),['Source coverage','Exceptions and amounts','Recorded review brief'],'all three connected panels are mounted in the fallback desk');
  assert.deepEqual(panels.map(node=>node.open),[true,true,true],'the panels are expanded for a desktop reader');
  const body=text(document.body);
  assert.match(body,/Confirm the item was returned/,'source coverage lists the recorded requirement');
  assert.match(body,/RR-CONN-01/);
  assert.match(body,/The customer has not confirmed the return\./,'recorded blockers keep their recorded reason');
  assert.match(body,/Item refund\s*\$25\.99/);
  assert.ok(logged.length>0,'the Studio failure was the boundary fallback, not a silently working workspace');
});

test('the advisory is a separate revision-bound panel and the read tools stay read-only',async()=>{
  const advisoryPosts=[],readPosts=[];
  globalThis.fetch=async(path,options={})=>{
    if(path==='/api/merchant/state')return new Response(JSON.stringify(state));
    if(path==='/api/merchant/case-advisory'){
      advisoryPosts.push(JSON.parse(options.body));
      return new Response(JSON.stringify({
        caseId:'claim-1',revision:2,sourceDigest:'source-fixture',contextDigest:'context-fixture',readOnly:true,status:'CITED',model:'fixture-model',
        summary:'The recorded source asks the customer to confirm the return before a refund is approved.',
        clauses:[{citationId:'cov-1',quote:'Confirm the item was returned',actor:'CUSTOMER',timing:'BEFORE_ACTION',condition:'Before the merchant approves a refund',explanation:'The customer has not yet confirmed the return.',disposition:'UNRESOLVED',fieldIds:[]}],
        gaps:['The customer has not confirmed the return.'],limitations:['The photograph has not been inspected.'],
      }));
    }
    if(path==='/api/merchant/case-context'){
      readPosts.push(JSON.parse(options.body));
      return new Response(JSON.stringify({caseId:'claim-1',revision:2,sourceDigest:'source-fixture',contextDigest:'context-fixture',readOnly:true,clauses:[{citationId:'cov-1',quote:'Confirm the item was returned',disposition:'UNRESOLVED',fieldIds:[]}],facts:{photoPresent:false,lotMatches:true,reviewRevision:2,correctionState:'NONE'},gaps:['The customer has not confirmed the return.']}));
    }
    throw new Error(`Unexpected request: ${path}`);
  };
  await render(React.createElement(MerchantDesk),()=>document.querySelector('[aria-label="AI advisory"]'));
  const panel=document.querySelector('[aria-label="AI advisory"]');
  assert.match(text(panel),/not a recorded fact/i);
  const prepare=[...panel.querySelectorAll('button')].find(node=>text(node)==='Prepare advisory');
  assert(prepare,'the advisory is prepared on request');
  await act(async()=>{prepare.click();await tick();});
  await settle(()=>advisoryPosts.length===1);
  assert.deepEqual(advisoryPosts[0],{caseId:'claim-1',revision:2},'the advisory is bound to the selected revision only');
  assert.match(text(panel),/Confirm the item was returned/);
  assert.match(text(panel),/Customer/);
  assert.match(text(panel),/Before the action/);
  assert.match(text(panel),/The photograph has not been inspected/);
  assert.match(text(panel),/Recorded evidence gaps/);
  // The same three bounded reads are available without a model call.
  const facts=panel.querySelector('details');
  facts.open=true;
  const source=[...facts.querySelectorAll('button')].find(node=>text(node)==='Source requirements');
  await act(async()=>{source.click();await tick();});
  await settle(()=>readPosts.length===1);
  assert.deepEqual(readPosts[0],{caseId:'claim-1',revision:2,section:'source'});
  assert.match(text(facts),/Source requirements · revision 2 · read-only/);
  assert.match(text(facts),/Photograph recorded:/);
  // A review change keeps the same revision but must invalidate both panels.
  state.cases[0].review={state:'APPROVED',reviewedAt:'2026-11-02T17:00:00Z'};
  const refresh=[...document.querySelectorAll('button')].find(node=>text(node)==='Refresh claims');
  await act(async()=>{refresh.click();await tick();});
  await settle(()=>!text(panel).includes('CITED ADVISORY')&&!text(facts).includes('Source requirements · revision'));
  assert.doesNotMatch(text(panel),/CITED ADVISORY/i);
  assert.doesNotMatch(text(facts),/Source requirements · revision 2 · read-only/);
  state.cases[0].review=null;
});

test('a stale advisory is hidden rather than shown beside a newer case revision',async()=>{
  globalThis.fetch=async(path)=>{
    if(path==='/api/merchant/state')return new Response(JSON.stringify(state));
    if(path==='/api/merchant/case-advisory')return new Response(JSON.stringify({error:'Evidence changed',reason:'STALE_CONTEXT'}),{status:400,headers:{'Content-Type':'application/json'}});
    throw new Error(`Unexpected request: ${path}`);
  };
  await render(React.createElement(MerchantDesk),()=>document.querySelector('[aria-label="AI advisory"]'));
  const panel=document.querySelector('[aria-label="AI advisory"]');
  const prepare=[...panel.querySelectorAll('button')].find(node=>text(node)==='Prepare advisory');
  await act(async()=>{prepare.click();await tick();});
  await settle(()=>/This claim changed/.test(text(panel)));
  assert.match(text(panel),/This claim changed while the advisory was being prepared/);
  assert.doesNotMatch(text(panel),/CITED ADVISORY/i);
  assert.doesNotMatch(text(panel),/The recorded source asks/);
});


test('a same-revision review change during an advisory request discards the pending result',async()=>{
  let release;const pending=new Promise(resolve=>{release=resolve;});
  globalThis.fetch=async(path)=>{
    if(path==='/api/merchant/state')return new Response(JSON.stringify(state));
    if(path==='/api/merchant/case-advisory')return pending;
    throw new Error(`Unexpected request: ${path}`);
  };
  await render(React.createElement(MerchantDesk),()=>document.querySelector('[aria-label="AI advisory"]'));
  const panel=document.querySelector('[aria-label="AI advisory"]');
  const prepare=[...panel.querySelectorAll('button')].find(node=>text(node)==='Prepare advisory');
  await act(async()=>{prepare.click();await tick();});
  state.cases[0].review={state:'APPROVED',reviewedAt:'2026-11-02T17:00:00Z'}; // revision deliberately unchanged
  const refresh=[...document.querySelectorAll('button')].find(node=>text(node)==='Refresh claims');
  await act(async()=>{refresh.click();await step(3);});
  release(new Response(JSON.stringify({caseId:'claim-1',revision:2,sourceDigest:'source-fixture',contextDigest:'context-fixture',readOnly:true,status:'CITED',summary:'Pending result',clauses:[{citationId:'cov-1',quote:'Pending quotation',actor:'CUSTOMER',timing:'BEFORE_ACTION',condition:null,explanation:'Pending',disposition:'UNRESOLVED',fieldIds:[]}],gaps:[],limitations:[]}),{status:200,headers:{'Content-Type':'application/json'}}));
  await settle(()=>!text(panel).includes('Preparing advisory'));
  assert.doesNotMatch(text(panel),/CITED ADVISORY|Pending quotation/i);
  state.cases[0].review=null;
});

test('the recorded read rejects a returned case that is not the selected revision',async()=>{
  globalThis.fetch=async(path)=>{
    if(path==='/api/merchant/state')return new Response(JSON.stringify(state));
    if(path==='/api/merchant/case-context')return new Response(JSON.stringify({caseId:'claim-other',revision:2,readOnly:true,clauses:[{citationId:'c',quote:'Wrong case',disposition:'FIELD',fieldIds:[]}],facts:{},gaps:[]}));
    throw new Error(`Unexpected request: ${path}`);
  };
  await render(React.createElement(MerchantDesk),()=>document.querySelector('[aria-label="AI advisory"]'));
  const panel=document.querySelector('[aria-label="AI advisory"]');
  const facts=panel.querySelector('details');facts.open=true;
  const brief=[...facts.querySelectorAll('button')].find(node=>text(node)==='Case brief');
  await act(async()=>{brief.click();await tick();});
  await settle(()=>/different case revision/.test(text(facts)));
  assert.match(text(facts),/different case revision/);
  assert.doesNotMatch(text(facts),/Wrong case/);
});
