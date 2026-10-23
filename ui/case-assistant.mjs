import {AgStudioAiModule,AgStudioModuleRegistry,createAiHarness} from 'ag-studio';
AgStudioModuleRegistry.registerModules([AgStudioAiModule]);

export function caseAssistant(onView){
  return ({api})=>createAiHarness(api,()=>{
    const viewTool=api.defineAiTool({name:'show_claim_view',description:'Change only the visible case list. No record or payment mutation.',params:s=>s.object({view:s.enum(['ALL','READY','WAITING','MANUAL','PAYMENT','COMPLETED'])}),execute:({view},ctx)=>{onView(view);return ctx.success('Case view changed.',{view});}});
    return {
    primary:'case-guide',
    promptStarters:[{label:'Who needs to send information?',prompt:'Show customers who still owe information.'},{label:'Ready for refund review',prompt:'Show claims ready for merchant refund approval.'}],
    agents:[{
      id:'case-guide',name:'Claim guide',description:'Find claims and explain recorded blockers. No payment authority.',
      tools:()=>[viewTool],
      async *run(input,ctx){
        const {threadId,runId}=input;
        yield {type:'RUN_STARTED',threadId,runId};
        try{
          const question=input.messages.filter(m=>m.role==='user').at(-1)?.content||'';
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
