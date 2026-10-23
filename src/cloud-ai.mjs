export const hostedModel='@cf/qwen/qwen3-30b-a3b-fp8';
export class HostedAI {
  constructor(binding,reserve,enabled){this.binding=binding;this.reserve=reserve;this.enabled=enabled;}
  status(){return {available:!!this.binding&&this.enabled,model:'Qwen3-30B · Cloudflare Workers AI',scope:'Server inference; suggestions require merchant review.'};}
  async generate(system,input){
    if(!this.status().available)throw new Error('Server AI is unavailable. Manual source review and case controls remain available.');
    const data=JSON.stringify(input);
    if(system.length+data.length>12000)throw new Error('This source is too long for the current AI draft. Review its requirements manually.');
    await this.reserve();
    let result;
    try{result=await this.binding.run(hostedModel,{messages:[{role:'system',content:system},{role:'user',content:data+'\n/no_think'}],max_tokens:900,temperature:0,stream:false,response_format:{type:'json_object'}});}
    catch{throw new Error('The AI service could not complete this request. No suggestion or payment was applied.');}
    let text=result?.response??result?.choices?.[0]?.message?.content;
    if(typeof text!=='string'||text.length>18000)throw new Error('The AI service returned an unusable draft. No suggestion was applied.');
    if(text.includes('</think>'))text=text.slice(text.lastIndexOf('</think>')+8);
    return text.trim();
  }
}
