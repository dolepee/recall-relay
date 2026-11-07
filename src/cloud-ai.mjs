export const advisoryModel='@cf/openai/gpt-oss-120b';
export const hostedModel='@cf/qwen/qwen3-30b-a3b-fp8';
export const inferenceTimeoutMs=45000;
export class HostedAI {
  constructor(binding,reserve,enabled,{allowance,timeoutMs=inferenceTimeoutMs}={}){this.binding=binding;this.reserve=reserve;this.enabled=enabled;this.allowance=allowance;this.timeoutMs=Number.isFinite(timeoutMs)&&timeoutMs>0?Math.min(timeoutMs,inferenceTimeoutMs):inferenceTimeoutMs;}
  advisoryStatus(){return {...this.status(),model:'gpt-oss-120b · Cloudflare Workers AI'};}
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
  // Once the provider call is dispatched the admission is never released: the inference was attempted
  // and may be billable, so the consumed unit is not returned even when no usable text comes back.
  async generate(system,input,{maxTokens=900,advisory=false,responseSchema}={}){
    if(!this.status().available)throw new Error('Server AI is unavailable. Manual source review and case controls remain available.');
    const data=JSON.stringify(input);
    if(system.length+data.length>12000)throw new Error('This source is too long for the current AI draft. Review its requirements manually.');
    const admission=await this.reserve();
    let result,timer;
    const timeoutError=new Error('The AI request took too long. No suggestion was applied. Review the quoted source manually, or try again later.');
    // The deadline bounds our response, not provider execution or billing. Keep the
    // admission consumed and never apply a late result or retry automatically.
    try{result=await Promise.race([this.binding.run(advisory?advisoryModel:hostedModel,{messages:[{role:'system',content:system},{role:'user',content:advisory?data:data+'\n/no_think'}],max_tokens:Math.min(advisory?3500:900,Math.max(1,maxTokens)),temperature:0,stream:false,response_format:responseSchema?{type:'json_schema',json_schema:responseSchema}:{type:'json_object'}}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(timeoutError),this.timeoutMs);})]);}
    catch(error){if(error===timeoutError)throw error;throw new Error('The AI service could not complete this request. No suggestion or payment was applied. Review the quoted source manually, or try again later.');}
    finally{clearTimeout(timer);}
    let text=[result?.choices?.[0]?.message?.content,result?.response,responseSchema&&result?.response&&typeof result.response==='object'?JSON.stringify(result.response):undefined,Array.isArray(result?.output)?result.output.flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join(''):undefined].find(value=>typeof value==='string');
    if(typeof text!=='string'||text.length>18000){
      const finish=result?.choices?.[0]?.finish_reason;
      const reason=['length','stop','content_filter','tool_calls'].includes(finish)?finish:'unknown';
      throw new Error(`The AI service returned no usable text (finish: ${reason}). No suggestion was applied.`);
    }
    if(text.includes('</think>'))text=text.slice(text.lastIndexOf('</think>')+8);
    return text.trim();
  }
}
