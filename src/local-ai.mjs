import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
export const modelName='Qwen3-4B-Instruct-2507 · local 4-bit';
export class LocalAI {
  constructor(){this.child=null;this.pending=null;}
  available(){return existsSync(resolve(root,'.local/ai-model/verified-download.json')) && existsSync(resolve(root,'.local/ai-model/model.safetensors'));}
  status(){return {available:this.available(),model:modelName,scope:'Local inference. Suggestions require review.'};}
  start(){
    if(this.child)return;
    this.child=spawn(resolve(root,'.local/ai-venv/bin/python'),[resolve(root,'scripts/local-model.py')],{cwd:root,stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH,HOME:process.env.HOME,HF_HUB_OFFLINE:'1',TOKENIZERS_PARALLELISM:'false'}});
    const child=this.child;
    createInterface({input:child.stdout}).on('line',line=>{
      let value;try{value=JSON.parse(line);}catch{return;}
      if(!this.pending||value.id!==this.pending.id)return;
      const task=this.pending;this.pending=null;clearTimeout(task.timer);
      value.error?task.reject(new Error(value.error)):task.resolve(value.text);
    });
    child.stderr.on('data',()=>{}); // No prompt or data dumps into server logs.
    const ended=()=>{if(this.child!==child)return;this.child=null;if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(new Error('Local model stopped. No suggestion was applied.'));this.pending=null;}};
    child.on('error',ended);child.on('exit',ended);
  }
  async generate(system,input){
    if(!this.available())throw new Error('The local model is not ready. Source review and ordinary case controls remain available.');
    if(this.pending)throw new Error('The local assistant is working on another request. Try again when it finishes.');
    this.start();
    return new Promise((resolve,reject)=>{
      const id=randomUUID(),timer=setTimeout(()=>{this.child?.kill();},90000);
      this.pending={id,timer,resolve,reject};this.child.stdin.write(JSON.stringify({id,system,input:JSON.stringify(input)})+'\n');
    });
  }
  close(){this.child?.kill();}
}
