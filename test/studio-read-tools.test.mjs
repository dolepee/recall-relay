import assert from 'node:assert/strict';
import {build} from 'esbuild';
import test,{after,afterEach} from 'node:test';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';

// This mounts the real Studio workspace and its Claim guide harness, then drives
// the three read starters through the actual session. A tool that is registered
// but unreachable fails here because no tool result or recorded text appears.
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://fixture.invalid/desk',pretendToBeVisual:true});
dom.window.matchMedia=query=>({matches:true,media:query,onchange:null,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent(){return false;}});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Node','MutationObserver','Event','KeyboardEvent','MouseEvent','ResizeObserver'])globalThis[name]=name==='window'?dom.window:dom.window[name];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.location=dom.window.location;globalThis.history=dom.window.history;
globalThis.getComputedStyle=(element)=>dom.window.getComputedStyle(element);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
class ResizeObserverStub{observe(){}unobserve(){}disconnect(){}}
globalThis.ResizeObserver=dom.window.ResizeObserver=ResizeObserverStub;
dom.window.Element.prototype.scrollIntoView=function(){};
dom.window.Element.prototype.getBoundingClientRect=function(){return {x:0,y:0,top:0,left:0,bottom:0,right:0,width:320,height:200};};
await mkdir('.cache',{recursive:true});
const bundleDir=await mkdtemp(resolve('.cache/studio-read-'));
after(async()=>{dom.window.close();await rm(bundleDir,{recursive:true,force:true});});
await build({entryPoints:['ui/studio-workspace.jsx'],outdir:bundleDir,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const {default:StudioWorkspace}=await import(pathToFileURL(`${bundleDir}/studio-workspace.js`).href);
const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const step=async(times=2)=>{await act(async()=>{for(let i=0;i<times;i++)await tick();});};
const settle=async(condition,{timeout=5000}={})=>{const deadline=Date.now()+timeout;for(;;){let done=false;try{done=!!condition();}catch{done=false;}if(done)return true;if(Date.now()>deadline)return false;await step(1);}};
const text=node=>node?node.textContent.replace(/\s+/g,' ').trim():'';
const button=label=>[...document.querySelectorAll('button')].find(node=>text(node)===label);
const mounted=[];
afterEach(async()=>{for(const unmount of mounted.splice(0))await unmount();document.body.innerHTML='';});
async function render(element,ready){
  const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
  await act(async()=>{root.render(element);await tick();});await settle(ready);await step();
  let done=false;const unmount=async()=>{if(done)return;done=true;await act(async()=>{root.unmount();});container.remove();};mounted.push(unmount);return unmount;
}
const item={id:'claim-1',revision:2,campaign:{title:'Synthetic notice'},review:null,correction:null,payment:null,status:{code:'SUBMITTED'}};
const W=({children})=>React.createElement('div',null,children);
const data={sources:[{id:'claims',data:[{order:'RR-1',status:'SUBMITTED'}]}]};
const initialState={pages:[{id:'claims',widgets:{},layout:{minWidth:280,columns:24,rowHeight:40,padding:0}}],selectedPageId:'claims'};
const context=(section)=>({caseId:'claim-1',revision:2,sourceDigest:'source',contextDigest:'context',readOnly:true,clauses:[{citationId:`${section}-1`,quote:`${section} quotation`,disposition:'FIELD',fieldIds:['f1']}],facts:{photoPresent:false,lotMatches:true,reviewRevision:2,correctionState:'NONE'},gaps:[`${section} gap`]});

test('the real Studio Claim guide executes all three selected-case read tools',async()=>{
  const posts=[];
  globalThis.fetch=async(path,options={})=>{
    assert.equal(path,'/api/merchant/case-context');
    const payload=JSON.parse(options.body);posts.push(payload);
    return new Response(JSON.stringify(context(payload.section)),{status:200,headers:{'Content-Type':'application/json'}});
  };
  await render(React.createElement(StudioWorkspace,{data,initialState,onView:()=>{},getCase:()=>item,ClaimReview:W,OrderCell:W,CoverageWidget:W,ExceptionsWidget:W,BriefWidget:W,AdvisoryWidget:W,guideOpen:true,onGuideClose:()=>{},customize:false}),()=>button('Read case brief'));
  const read=async(label,prompt)=>{
    const starter=button(label);
    if(starter){await act(async()=>{starter.click();await tick();});}
    else{
      const textarea=document.querySelector('textarea');
      const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set;
      await act(async()=>{setter.call(textarea,prompt);textarea.dispatchEvent(new Event('input',{bubbles:true}));textarea.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await tick();});
    }
    await settle(()=>document.body.textContent.includes(`Recorded data ·`));
  };
  await read('Read case brief','Read the recorded case brief.');
  await read('Read source requirements','Read the recorded source requirements.');
  await read('Read evidence gaps','Read the recorded evidence gaps.');
  assert.deepEqual(posts.map(post=>post.section),['brief','source','gaps'],'each starter reaches its own tool');
  assert.ok(posts.every(post=>post.caseId==='claim-1'&&post.revision===2),'every read is bound to the selected case revision');
  const body=text(document.body);
  assert.match(body,/Recorded data · Case brief/);
  assert.match(body,/Recorded data · Source requirements/);
  assert.match(body,/Recorded data · Recorded gaps/);
  assert.match(body,/not model interpretation/);
  assert.doesNotMatch(body,/Interpreted with/);
});

test('a natural-language question executes the cited answer tool through the actual Studio harness',async()=>{
 const posts=[];
 globalThis.fetch=async(path,options)=>{
   assert.equal(path,'/api/merchant/claim-question');const input=JSON.parse(options.body);posts.push(input);
   return new Response(JSON.stringify({readOnly:true,view:null,citations:[{id:'case-review',text:'Review not recorded.'}],message:'Claim RR-1 · revision 2\nAI explanation · check the cited records\nInspect the current evidence.\n[case-review] Review not recorded.',model:'test-double'}),{status:200});
 };
 await render(React.createElement(StudioWorkspace,{data,initialState,onView:()=>{},getCase:()=>item,ClaimReview:W,OrderCell:W,CoverageWidget:W,ExceptionsWidget:W,BriefWidget:W,AdvisoryWidget:W,guideOpen:true,onGuideClose:()=>{}}),()=>button('What is blocking this claim?'));
 await act(async()=>{button('What is blocking this claim?').click();await tick();});
 assert.ok(await settle(()=>document.body.textContent.includes('[case-review]')));
 assert.equal(posts.length,1);assert.equal(posts[0].caseId,'claim-1');assert.equal(posts[0].revision,2);assert.match(posts[0].question,/holding up/);
 assert.match(text(document.body),/AI explanation · check the cited records/);
});
