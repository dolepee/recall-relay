export const hostedModel='@cf/qwen/qwen3-30b-a3b-fp8';
export class HostedAI {
  constructor(binding,reserve,enabled,{refund,allowance}={}){this.binding=binding;this.reserve=reserve;this.enabled=enabled;this.refund=refund;this.allowance=allowance;}
  status(){return {available:!!this.binding&&this.enabled,model:'Qwen3-30B · Cloudflare Workers AI',scope:'Server inference; suggestions require merchant review.'};}
  // Availability is reported from the counters, not from configuration alone, so the interface cannot
  // offer a control whose allowance is already gone.
  async availability(){
    const configured=this.status();
    if(!configured.available)return {...configured,reason:'unavailable',resetAt:null};
    if(typeof this.allowance!=='function')return {...configured,reason:null,resetAt:null};
    try{
      const probe=await this.allowance();
      return {...configured,available:probe?.available!==false,reason:probe?.reason||null,resetAt:probe?.resetAt||null};
    }catch{return {...configured,available:false,reason:'unknown',resetAt:null};}
  }
  // Compensating write for an admission whose generation produced no usable text. Idempotent at the
  // counter, and never allowed to mask the original failure.
  async release(admission){
    if(!admission||typeof this.refund!=='function')return false;
    try{return !!(await this.refund(admission));}catch{return false;}
  }
  async generate(system,input){
    if(!this.status().available)throw new Error('Server AI is unavailable. Manual source review and case controls remain available.');
    const data=JSON.stringify(input);
    if(system.length+data.length>12000)throw new Error('This source is too long for the current AI draft. Review its requirements manually.');
    const admission=await this.reserve();
    let result;
    try{result=await this.binding.run(hostedModel,{messages:[{role:'system',content:system},{role:'user',content:data+'\n/no_think'}],max_tokens:900,temperature:0,stream:false,response_format:{type:'json_object'}});}
    catch{await this.release(admission);throw new Error('The AI service could not complete this request. No suggestion or payment was applied.');}
    let text=[result?.choices?.[0]?.message?.content,result?.response].find(value=>typeof value==='string');
    if(typeof text!=='string'||text.length>18000){
      const finish=result?.choices?.[0]?.finish_reason;
      const reason=['length','stop','content_filter','tool_calls'].includes(finish)?finish:'unknown';
      await this.release(admission);
      throw new Error(`The AI service returned no usable text (finish: ${reason}). No suggestion was applied.`);
    }
    if(text.includes('</think>'))text=text.slice(text.lastIndexOf('</think>')+8);
    return text.trim();
  }
}
