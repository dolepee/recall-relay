import assert from 'node:assert/strict';
import {build} from 'esbuild';
import test,{after} from 'node:test';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// The Claim guide's read starters deliberately bypass /assist and execute one of
// the three real selected-case tools. These tests drive the same generator the
// Studio agent's run() delegates to, so a registered-but-unreachable tool fails
// here as it would in the conversation.
await mkdir('.cache',{recursive:true});
const dir=await mkdtemp(resolve('.cache/advisory-read-'));
after(()=>rm(dir,{recursive:true,force:true}));
await build({entryPoints:['ui/case-assistant.mjs'],outdir:dir,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const {runCaseReadIntent}=await import(pathToFileURL(`${dir}/case-assistant.js`).href);

const baseItem=()=>({id:'claim-1',revision:2,campaign:{title:'Notice'},review:null,correction:null,payment:null,status:{code:'SUBMITTED'}});
const resultFor=(section,revision=2)=>({caseId:'claim-1',revision,readOnly:true,sourceDigest:'source',contextDigest:'context',clauses:[{citationId:`${section}-1`,quote:'Recorded quotation',disposition:'FIELD',fieldIds:['f1']}],facts:{photoPresent:false,lotMatches:true,reviewRevision:revision,correctionState:'NONE'},gaps:[`${section} gap`]});
async function collect(iterator){const events=[];for await(const event of iterator)events.push(event);return events;}

test('the harness read path executes each selected-case tool and labels recorded data',async()=>{
  for(const [intent,section] of [[{section:'brief'},'brief'],[{section:'source'},'source'],[{section:'gaps'},'gaps']]){
    const item=baseItem(),calls=[];
    const tool={name:`get_${section}_tool`,execute:async(_args,ctx)=>{calls.push({id:item.id,revision:item.revision,section});return ctx.success('ok',resultFor(section));}};
    const events=await collect(runCaseReadIntent({intent,item,getCase:()=>item,tool,threadId:'thread-1',runId:'run-1',signal:new AbortController().signal}));
    assert.equal(calls.length,1,`${section} tool executes once`);
    assert.deepEqual(calls[0],{id:'claim-1',revision:2,section});
    assert.ok(events.some(event=>event.type==='TOOL_CALL_START'&&event.toolCallName===tool.name),`${section} tool call is shown`);
    assert.ok(events.some(event=>event.type==='TOOL_CALL_RESULT'),`${section} tool result is shown`);
    const text=events.filter(event=>event.type==='TEXT_MESSAGE_CONTENT').map(event=>event.delta).join('\n');
    assert.match(text,/Recorded data · (Case brief|Source requirements|Recorded gaps) · revision 2 · not model interpretation/);
    assert.match(text,/Recorded quotation/);
    assert.match(text,new RegExp(`${section} gap`));
  }
});

test('a same-revision review change during a read discards the recorded result',async()=>{
  const item=baseItem();let release;const pending=new Promise(resolve=>{release=resolve;});
  const tool={name:'get_case_brief',execute:async(_args,ctx)=>{await pending;return ctx.success('ok',resultFor('brief'));}};
  const iterator=runCaseReadIntent({intent:{section:'brief'},item,getCase:()=>item,tool,threadId:'thread-1',runId:'run-1',signal:new AbortController().signal});
  const first=await iterator.next();
  assert.equal(first.value.type,'TOOL_CALL_START');
  item.review={state:'APPROVED'}; // revision deliberately unchanged
  release();
  const rest=await collect(iterator);
  const text=rest.filter(event=>event.type==='TEXT_MESSAGE_CONTENT').map(event=>event.delta).join('\n');
  assert.match(text,/Recorded data changed while this read was in progress/);
  assert.doesNotMatch(text,/Recorded quotation/);
  assert.ok(!rest.some(event=>event.type==='TOOL_CALL_RESULT'),'no stale tool result is published');
});
