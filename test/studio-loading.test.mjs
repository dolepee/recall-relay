import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'vite';

// Exercise the real production graph, including the generated document hint.
test('Studio remains cached across app edits and preloads only on desktop desks',async()=>{
  const compile=changed=>build({logLevel:'silent',build:{write:false},plugins:changed?[{name:'app-only-test-edit',transform(code,id){if(id.endsWith('/ui/main.jsx'))return code+'\nconsole.info("cache stability test");';}}]:[]});
  const first=(await compile(false)).output;
  const second=(await compile(true)).output;
  const vendor=output=>output.find(x=>x.type==='chunk'&&x.name==='studio-vendor');
  assert.ok(vendor(first));
  assert.equal(vendor(first).fileName,vendor(second).fileName,'app-only changes must not invalidate Studio');
  assert.equal(vendor(first).code,vendor(second).code);
  assert.notEqual(first.find(x=>x.isEntry).fileName,second.find(x=>x.isEntry).fileName);
  const chunks=new Map(first.filter(x=>x.type==='chunk').map(x=>[x.fileName,x]));
  function closure(file,seen=new Set()){
    if(seen.has(file))return seen;seen.add(file);
    for(const dep of chunks.get(file)?.imports||[])closure(dep,seen);
    return seen;
  }
  const studioDeps=closure(vendor(first).fileName);
  assert.ok([...studioDeps].every(f=>!Object.keys(chunks.get(f)?.modules||{}).some(m=>m.includes('/ui/'))),'vendor graph must not import app routes');
  for(const chunk of first.filter(x=>x.type==='chunk'&&(x.isEntry||['practice','setup','claim'].includes(x.name)))){
    assert.ok(!closure(chunk.fileName).has(vendor(first).fileName),`${chunk.name} must not eagerly load Studio`);
  }
  const html=String(first.find(x=>x.fileName==='index.html').source);
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert.ok(script);
  for(const [path,width,expected] of [['/desk',1280,1],['/desk',1279,0],['/sample',1100,1],['/sample',1099,0],['/practice',1440,0],['/setup',1440,0],['/claim',1440,0],['/',1440,0]]){
    const links=[];vm.runInNewContext(script,{location:{pathname:path},matchMedia:q=>({matches:width>=Number(q.match(/\d+/)[0])}),document:{createElement:()=>({}),head:{append:l=>links.push(l)}}});
    assert.equal(links.length,expected,`${path} at ${width}`);
    if(expected){assert.equal(links[0].href,'/'+vendor(first).fileName);assert.equal(links[0].rel,'modulepreload');assert.equal(links[0].crossOrigin,'anonymous');}
  }
});
