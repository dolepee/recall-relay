import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LocalAI} from '../src/local-ai.mjs';
import {HostedAI,hostedModel} from '../src/cloud-ai.mjs';

const readJson=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));

test('the default Node installation does not download an unused inference runtime',async()=>{
  const manifest=await readJson('../package.json'),lock=await readJson('../package-lock.json');
  assert.deepEqual(lock.packages[''].dependencies,manifest.dependencies);
  assert.deepEqual(lock.packages[''].devDependencies,manifest.devDependencies);
  const unused=Object.keys(lock.packages).filter(path=>
    /(?:^|\/)node_modules\/(?:@huggingface\/transformers|onnxruntime-[^/]+)$/.test(path));
  assert.deepEqual(unused,[],'MLX is installed explicitly with setup-ai.py; hosted AI uses the Worker binding');
  for(const hook of ['preinstall','install','postinstall','prepare'])
    assert.equal(manifest.scripts[hook],undefined,'Model setup must remain an explicit separate step');
});

test('both configured AI adapters load without a JavaScript model runtime',async()=>{
  const local=new LocalAI();
  assert.equal(local.child,null,'Loading the adapter must not launch or download a model');
  assert.match(local.status().scope,/Local inference/);
  let calls=0;
  const hosted=new HostedAI({run:async(model,input)=>{
    calls++;assert.equal(model,hostedModel);assert.equal(input.stream,false);
    return {response:'{"requirements":[]}'};
  }},async()=>({admitted:true}),true);
  assert.equal(await hosted.generate('Return JSON only.',{notice:'Fictional fixture'}),'{"requirements":[]}');
  assert.equal(calls,1,'Hosted inference uses the injected Worker binding only');
});
