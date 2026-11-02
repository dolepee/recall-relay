import {AgStudioAiModule,AgStudioModuleRegistry,createAiHarness} from 'ag-studio';
import {caseFingerprint,readCaseContext} from './advisory-panel.jsx';
AgStudioModuleRegistry.registerModules([AgStudioAiModule]);

const normalizePrompt=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ').replace(/[.!?]+$/,'');
const readIntents={
  'read the recorded case brief':{section:'brief',label:'Case brief'},
  'read the recorded source requirements':{section:'source',label:'Source requirements'},
  'read the recorded evidence gaps':{section:'gaps',label:'Recorded gaps'},
};
const sectionTitle={brief:'Case brief',source:'Source requirements',gaps:'Recorded gaps'};
const factsText=facts=>facts?`Photograph recorded: ${facts.photoPresent?'Yes':'No'}; lot matches: ${facts.lotMatches?'Yes':'No or not established'}; review revision: ${facts.reviewRevision??'Not recorded'}; correction: ${facts.correctionState||'None recorded'}.`:'';
function recordedText(section,value){
  const lines=[`Recorded data · ${sectionTitle[section]} · revision ${value.revision} · not model interpretation`];
  const facts=factsText(value.facts);if(facts)lines.push(facts);
  if(value.clauses?.length){lines.push('Recorded clauses:',...value.clauses.map(clause=>`- “${clause.quote}” — ${clause.disposition}${clause.fieldIds?.length?` · ${clause.fieldIds.length} linked field(s)`:''}`));}
  if(value.gaps?.length){lines.push('Recorded gaps:',...value.gaps.map(gap=>`- ${gap}`));}
  if(!value.clauses?.length&&!value.gaps?.length)lines.push('No recorded clauses or gaps in this section.');
  return lines.join('\n');
}
const textEvent=text=>{const messageId=crypto.randomUUID();return [
  {type:'TEXT_MESSAGE_START',messageId,role:'assistant'},
  {type:'TEXT_MESSAGE_CONTENT',messageId,delta:text},
  {type:'TEXT_MESSAGE_END',messageId},
];};
// One deterministic read request, executed through the same tool the harness
// advertises. The selected case is fingerprinted before the await and checked
// again after it; a review, payment, correction or source change with the same
// revision cannot leave stale recorded data on screen.
export async function* runCaseReadIntent({intent,item,getCase,tool,threadId,runId,signal}){
  if(!item?.id||!Number.isSafeInteger(item.revision)){
    for(const event of textEvent('Select a saved claim before reading its recorded context.'))yield event;
    yield {type:'RUN_FINISHED',threadId,runId};return;
  }
  const fingerprint=caseFingerprint(item),toolCallId=crypto.randomUUID();
  yield {type:'TOOL_CALL_START',toolCallId,toolCallName:tool.name};
  yield {type:'TOOL_CALL_ARGS',toolCallId,delta:'{}'};
  yield {type:'TOOL_CALL_END',toolCallId};
  let outcome;
  try{
    outcome=await tool.execute({toolCallId,name:tool.name,args:{}},{signal:signal||new AbortController().signal,run:{threadId,runId},success:(response,data)=>({success:true,response,data}),error:messages=>({success:false,issues:(Array.isArray(messages)?messages:[messages]).map(message=>({message}))})});
  }catch(error){
    if(signal?.aborted)return;
    for(const event of textEvent(error instanceof Error?error.message:'The recorded read could not be completed.'))yield event;
    yield {type:'RUN_FINISHED',threadId,runId};return;
  }
  if(signal?.aborted)return;
  const current=getCase();
  if(caseFingerprint(current)!==fingerprint){
    for(const event of textEvent('Recorded data changed while this read was in progress. The result was discarded; select the current claim and try again.'))yield event;
    yield {type:'RUN_FINISHED',threadId,runId};return;
  }
  yield {type:'TOOL_CALL_RESULT',toolCallId,messageId:crypto.randomUUID(),content:JSON.stringify(outcome)};
  if(!outcome.success){
    for(const event of textEvent(outcome.issues?.map(issue=>issue.message).join(' ')||'The recorded read could not be completed.'))yield event;
    yield {type:'RUN_FINISHED',threadId,runId};return;
  }
  const data=outcome.data;
  if(!data||data.caseId!==item.id||data.revision!==item.revision){
    for(const event of textEvent('The recorded read returned a different case revision. The result was discarded.'))yield event;
    yield {type:'RUN_FINISHED',threadId,runId};return;
  }
  for(const event of textEvent(recordedText(intent.section,data)))yield event;
  yield {type:'RUN_FINISHED',threadId,runId};
}

export function caseAssistant(onView,getCase=()=>null){
  return ({api})=>createAiHarness(api,()=>{
    const viewTool=api.defineAiTool({name:'show_claim_view',description:'Change only the visible case list. No record or payment mutation.',params:s=>s.object({view:s.enum(['ALL','REVIEW','READY','WAITING','MANUAL','PAYMENT','COMPLETED'])}),execute:({view},ctx)=>{onView(view);return ctx.success('Case view changed.',{view});}});
    const readTool=(name,section,description)=>api.defineAiTool({name,description,params:s=>s.object({}),execute:async(_args,ctx)=>{
      const item=getCase();
      if(!item?.id||!Number.isSafeInteger(item.revision))return ctx.error('Select a saved claim before reading its recorded context.');
      try{
        const value=await readCaseContext(item.id,item.revision,section);
        if(!value||value.readOnly!==true||!Array.isArray(value.clauses)||!Array.isArray(value.gaps))return ctx.error('The read-only case context was not usable.');
        if(value.caseId!==item.id||value.revision!==item.revision)return ctx.error('The case changed while its recorded context was read. Select the current claim and try again.');
        return ctx.success(`${section} read for revision ${item.revision}.`,value);
      }catch(error){return ctx.error(error instanceof Error?error.message:'The recorded case context could not be read.');}
    }});
    const sourceTool=readTool('get_source_requirements','source','Read the recorded source clauses and dispositions for the selected claim. No photograph, customer free text, credential, capture id or payment action.');
    const gapsTool=readTool('get_evidence_gaps','gaps','Read the recorded evidence gaps for the selected claim. No photograph, customer free text, credential, capture id or payment action.');
    const briefTool=readTool('get_case_brief','brief','Read the recorded case facts for the selected claim. No photograph, customer free text, credential, capture id or payment action.');
    const readTools={brief:briefTool,source:sourceTool,gaps:gapsTool};
    return {
    primary:'case-guide',
    promptStarters:[
      {label:'Read case brief',prompt:'Read the recorded case brief.'},
      {label:'Read source requirements',prompt:'Read the recorded source requirements.'},
      {label:'Read evidence gaps',prompt:'Read the recorded evidence gaps.'},
      {label:'Who needs to send information?',prompt:'Show customers who still owe information.'},
      {label:'Needs evidence review',prompt:'Show submitted claims waiting for my evidence review.'},
      {label:'Ready to approve',prompt:'Show claims ready for merchant refund approval.'},
    ],
    agents:[{
      id:'case-guide',name:'Claim guide',description:'Find claims and explain recorded blockers. No payment authority.',
      tools:()=>[viewTool,sourceTool,gapsTool,briefTool],
      async *run(input,ctx){
        const {threadId,runId}=input;
        yield {type:'RUN_STARTED',threadId,runId};
        try{
          const question=input.messages.filter(m=>m.role==='user').at(-1)?.content||'';
          const intent=readIntents[normalizePrompt(question)];
          if(intent){
            yield* runCaseReadIntent({intent,item:getCase(),getCase,tool:readTools[intent.section],threadId,runId,signal:ctx.signal});
            return;
          }
          const response=await fetch('/api/merchant/assist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question}),signal:ctx.signal});
          const result=await response.json();if(!response.ok)throw new Error(result.error||'The assistant is unavailable.');
          if(ctx.signal?.aborted)return;
          if(result.view){
            const toolCallId=crypto.randomUUID();
            yield {type:'TOOL_CALL_START',toolCallId,toolCallName:'show_claim_view'};
            yield {type:'TOOL_CALL_ARGS',toolCallId,delta:JSON.stringify({view:result.view})};
            yield {type:'TOOL_CALL_END',toolCallId};
            const outcome=await viewTool.execute({toolCallId,name:viewTool.name,args:{view:result.view}},{signal:ctx.signal||new AbortController().signal,run:{threadId,runId},success:(response,data)=>({success:true,response,data}),error:messages=>({success:false,issues:(Array.isArray(messages)?messages:[messages]).map(message=>({message}))})});
            if(!outcome.success)throw new Error('The requested view could not be applied.');
            yield {type:'TOOL_CALL_RESULT',toolCallId,messageId:crypto.randomUUID(),content:JSON.stringify(outcome)};
          }
          const messageId=crypto.randomUUID();yield {type:'TEXT_MESSAGE_START',messageId,role:'assistant'};
          yield {type:'TEXT_MESSAGE_CONTENT',messageId,delta:result.message+'\n\nInterpreted with '+result.model+'.'};
          yield {type:'TEXT_MESSAGE_END',messageId};
          yield {type:'RUN_FINISHED',threadId,runId};
        }catch(error){if(!ctx.signal?.aborted)yield {type:'RUN_ERROR',message:error.message};}
      },
    }],
    };
  });
}
