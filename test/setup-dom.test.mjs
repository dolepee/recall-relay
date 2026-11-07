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
 const ai={status:()=>({available:true,model:'INJECTED TEST DOUBLE'}),generate:async(_prompt,input)=>JSON.stringify({clauses:input.clauses.map((c,i)=>({clauseId:c.clauseId,kinds:[i===0?'PHOTO':'TEXT']}))})};
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

test('setup reports assistant fields that the response-type check filtered',async()=>{
 const state={ai:{available:true,model:'fixture'},activeCampaign:null,setups:[{id:'setup-1',revision:2,source:{recallNumber:'27-026',title:'Fixture crystal cup',products:[{name:'Fixture cup'}],description:'Local DOM fixture',retrievedAt:'2026-11-02T00:00:00Z',route:'ORIGINAL_PAYMENT_CANDIDATE',sourceUrl:'https://example.invalid/notice',sourceDigest:'a'.repeat(64),remedies:['Submit a photograph of the marked cup.'],requirements:[]},suggestion:{model:'fixture model',createdAt:'2026-11-02T00:00:00Z',requirements:[{id:'field-1',kind:'PHOTO',quote:'Submit a photograph of the marked cup.',sourceUrl:'https://example.invalid/notice'}],filtered:[{kind:'TEXT',quote:'Register at example.invalid to receive your refund.',reason:'A written field needs an explicit value, identifier or description request.'}]},review:null}]};
 globalThis.fetch=async()=>new Response(JSON.stringify(state));
 const root=createRoot(document.getElementById('root'));
 await act(async()=>{root.render(React.createElement(SourceSetup));await tick();await tick();});
 const text=document.body.textContent;
 assert.match(text,/1 drafted field was not used: it did not match a response type or complete source instruction/);
 assert.match(text,/not a completeness check/);
 assert.match(text,/Submit a photograph of the marked cup/);
 await act(async()=>root.unmount());
});

test('a saved setup without stored coverage is not shown as changed',async()=>{
 const quote='Submit a photograph of the marked cup.';
 const field={id:'field-1',kind:'PHOTO',quote,sourceUrl:'https://example.invalid/notice'};
 const state={ai:{available:false},activeCampaign:null,setups:[{id:'legacy-setup',revision:1,source:{recallNumber:'27-026',title:'Fixture crystal cup',products:[{name:'Fixture cup'}],description:'Local DOM fixture',retrievedAt:'2026-11-02T00:00:00Z',route:'ORIGINAL_PAYMENT_CANDIDATE',sourceUrl:'https://example.invalid/notice',sourceDigest:'a'.repeat(64),remedies:[quote],requirements:[]},suggestion:{model:'fixture model',createdAt:'2026-11-02T00:00:00Z',requirements:[field]},review:{revision:1,digest:'b'.repeat(64),fields:[field]}}]};
 globalThis.fetch=async()=>new Response(JSON.stringify(state));
 const root=createRoot(document.getElementById('root'));
 await act(async()=>{root.render(React.createElement(SourceSetup));await tick();await tick();});
 assert.match(document.body.textContent,/Reviewed instructions saved/);
 assert.doesNotMatch(document.body.textContent,/changes not yet saved/);
 await act(async()=>root.unmount());
});

const legacyState=({published=false,uncovered=false}={})=>{
 const covered='Submit a photograph of the marked cup.';
 const field={id:'field-1',kind:'PHOTO',quote:covered,sourceUrl:'https://example.invalid/notice'};
 const remedies=uncovered?[covered,'Confirm the cup was purchased for personal use.']:[covered];
 const setup={id:'legacy-setup',revision:1,source:{recallNumber:'27-026',title:'Fixture crystal cup',products:[{name:'Fixture cup'}],description:'Local DOM fixture',retrievedAt:'2026-11-02T00:00:00Z',route:'ORIGINAL_PAYMENT_CANDIDATE',sourceUrl:'https://example.invalid/notice',sourceDigest:'a'.repeat(64),remedies,requirements:[]},suggestion:{model:'fixture model',createdAt:'2026-11-02T00:00:00Z',requirements:[field]},review:{revision:1,digest:'b'.repeat(64),fields:[field]}};
 if(published)setup.publishedCampaign={id:'old-campaign',sku:'OLD',lot:'LOT-OLD'};
 return {ai:{available:false},activeCampaign:null,setups:[setup]};
};

test('legacy coverage without an uncovered sentence is clean on first open',async()=>{
 for(const published of [false,true]){
  globalThis.fetch=async()=>new Response(JSON.stringify(legacyState({published})));
  const root=createRoot(document.getElementById('root'));
  await act(async()=>{root.render(React.createElement(SourceSetup));await tick();await tick();});
  assert.match(document.body.textContent,/Reviewed instructions saved/,`published=${published}`);
  assert.doesNotMatch(document.body.textContent,/changes not yet saved/,`published=${published}`);
  await act(async()=>root.unmount());
 }
});

test('legacy coverage with an uncovered sentence blocks unpublished and republish',async()=>{
 for(const published of [false,true]){
  globalThis.fetch=async()=>new Response(JSON.stringify(legacyState({published,uncovered:true})));
  const root=createRoot(document.getElementById('root'));
  await act(async()=>{root.render(React.createElement(SourceSetup));await tick();await tick();});
  assert.match(document.body.textContent,/Some source instructions still need attention/,`published=${published}`);
  assert.doesNotMatch(document.body.textContent,/changes not yet saved/,`published=${published}`);
  const publish=[...document.querySelectorAll('button')].find(node=>node.textContent==='Publish sandbox scenario');
  const confirm=[...document.querySelectorAll('label')].find(node=>node.textContent.includes('Use the reviewed instructions and these explicit product identifiers'));
  await act(async()=>{confirm.querySelector('input').click();await tick();});
  assert.equal(publish.disabled,true,`published=${published}`);
  await act(async()=>root.unmount());
 }
});

test('a real field edit in a legacy setup is still marked unsaved',async()=>{
 globalThis.fetch=async()=>new Response(JSON.stringify(legacyState()));
 const root=createRoot(document.getElementById('root'));
 await act(async()=>{root.render(React.createElement(SourceSetup));await tick();await tick();});
 assert.match(document.body.textContent,/Reviewed instructions saved/);
 await act(async()=>{[...document.querySelectorAll('button')].find(node=>node.textContent==='Edit reviewed fields').click();await tick();});
 const field=[...document.querySelectorAll('label')].find(node=>node.textContent.includes('Submit a photograph of the marked cup'));
 await act(async()=>{field.querySelector('input').click();await tick();});
 assert.match(document.body.textContent,/Last saved instructions · changes not yet saved/);
 await act(async()=>root.unmount());
});

const activeSetupState=()=>{
 const make=(number,product,fieldId,digest,published=null)=>({id:`setup-${number}`,revision:1,source:{recallNumber:number,title:`${product} notice`,products:[{name:product}],description:'Local DOM fixture',retrievedAt:'2026-11-02T00:00:00Z',route:'ORIGINAL_PAYMENT_CANDIDATE',sourceUrl:'https://example.invalid/notice',sourceDigest:digest.repeat(64).slice(0,64),remedies:[`Submit a photograph of the marked ${product}.`],requirements:[]},suggestion:{model:'fixture model',createdAt:'2026-11-02T00:00:00Z',requirements:[{id:fieldId,kind:'PHOTO',quote:`Submit a photograph of the marked ${product}.`,sourceUrl:'https://example.invalid/notice'}]},review:{revision:1,digest:digest.repeat(64).slice(0,64),fields:[{id:fieldId,kind:'PHOTO',quote:`Submit a photograph of the marked ${product}.`,sourceUrl:'https://example.invalid/notice'}]},...(published?{publishedCampaign:{id:published,sku:'SCENARIO-ITEM',lot:'LOT-A'}}:{})});
 const first=make('27020','First fixture','field-1','a');
 const active=make('27026','Crystal Glass Cups','field-1','a7413b441c58', 'CPSC-27026-a7413b441c58');
 return {ai:{available:false},activeCampaign:{id:'CPSC-27026-a7413b441c58',product:'Crystal Glass Cups',sku:'SCENARIO-ITEM',lot:'LOT-A'},setups:[first,active]};
};

test('published setup preview points to the desk instead of an absent publish section',async()=>{
 globalThis.fetch=async()=>new Response(JSON.stringify(activeSetupState()));
 const root=createRoot(document.getElementById('root'));
 await act(async()=>{root.render(React.createElement(SourceSetup));await tick();await tick();});
 const body=document.body.textContent;
 assert.match(body,/These fields remain the requirements for existing claims/);
 assert.match(body,/Open the claims desk above for the next test purchase/);
 assert.doesNotMatch(body,/Publish a sandbox scenario below/);
 assert.equal([...document.querySelectorAll('button')].some(node=>node.textContent==='Publish sandbox scenario'),false,'the publish section is absent while active');
 await act(async()=>{[...document.querySelectorAll('button')].find(node=>node.textContent==='Change test product').click();await tick();});
 assert.match(document.body.textContent,/Publish the updated sandbox scenario below/);
 assert.ok([...document.querySelectorAll('button')].some(node=>node.textContent==='Publish sandbox scenario'),'editing the scope restores the publish section');
 await act(async()=>root.unmount());
});

test('first open selects the active published setup and preserves a deliberate edit',async()=>{
 globalThis.fetch=async()=>new Response(JSON.stringify(activeSetupState()));
 const root=createRoot(document.getElementById('root'));
 await act(async()=>{root.render(React.createElement(SourceSetup));await tick();await tick();});
 const selector=[...document.querySelectorAll('select')].find(node=>node.parentElement.textContent.includes('Saved notice setups'));
 assert.equal(selector.value,'setup-27026','the active published setup opens first');
 await act(async()=>{selector.value='setup-27020';selector.dispatchEvent(new Event('change',{bubbles:true}));await tick();});
 assert.equal(selector.value,'setup-27020');
 await act(async()=>{[...document.querySelectorAll('button')].find(node=>node.textContent==='Edit reviewed fields').click();await tick();});
 const field=[...document.querySelectorAll('label')].find(node=>node.textContent.includes('Submit a photograph of the marked First fixture'));
 await act(async()=>{field.querySelector('input').click();await tick();});
 assert.match(document.body.textContent,/Last saved instructions · changes not yet saved/);
 await act(async()=>{[...document.querySelectorAll('button')].find(node=>node.textContent==='Check assistant availability').click();await tick();await tick();});
 assert.equal(selector.value,'setup-27020','a refresh does not replace the merchant selection');
 assert.match(document.body.textContent,/changes not yet saved/,'an unsaved edit survives the refresh');
 await act(async()=>root.unmount());
});

test('compound response omissions are visible and cannot be published through an INFORMATION treatment',async()=>{
 const quote='Submit a photograph of the marked cup and attest that you disposed of it according to the posted instructions.';const field={id:'photo',kind:'PHOTO',quote};const source={recallNumber:'TEST',title:'Synthetic compound obligation',products:[{name:'Fictional cup'}],description:'Controlled source fixture',retrievedAt:'2026-11-05T00:00:00Z',route:'ORIGINAL_PAYMENT_CANDIDATE',sourceUrl:'https://example.invalid/fixture',sourceDigest:'a'.repeat(64),remedies:[quote],requirements:[{quote}]};const state={ai:{available:false},activeCampaign:null,setups:[{id:'compound',revision:2,source,suggestion:{model:'controlled',requirements:[field]},review:{fields:[field],coverage:[{id:'clause-0-0',quote,fieldIds:['photo'],disposition:'FIELD',reason:''}],digest:'old'}}]};globalThis.fetch=async()=>new Response(JSON.stringify(state));const root=createRoot(document.getElementById('root'));await act(async()=>{root.render(React.createElement(SourceSetup));await tick();await tick();});const publish=[...document.querySelectorAll('button')].find(b=>b.textContent==='Publish sandbox scenario');assert.equal(publish.disabled,true);await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Edit reviewed fields').click());assert.match(document.querySelector('[aria-label="Source instruction coverage"]').textContent,/confirmation: Missing response/i);assert.equal([...document.querySelectorAll('select')].some(s=>s.parentElement.textContent.startsWith('Treatment')),false);await act(async()=>root.unmount());
});
