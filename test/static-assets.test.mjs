import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {builtAssets} from '../src/static-assets.mjs';

test('built server serves only app routes and contained assets, including safe HEAD responses',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'relay-assets-'));
  try{
    const root=join(dir,'dist');await mkdir(join(root,'assets'),{recursive:true});
    await writeFile(join(root,'index.html'),'<h1>app</h1>');await writeFile(join(root,'assets','app-12345678.js'),'console.log(1)');
    await writeFile(join(dir,'secret.js'),'private');await symlink(join(dir,'secret.js'),join(root,'assets','escape.js'));
    const serve=builtAssets(root);
    async function request(path,method='GET'){const out={};await serve({method},{writeHead:(status,headers)=>Object.assign(out,{status,headers}),end:body=>out.body=body},path);return out;}
    assert.equal((await request('/claim')).body.toString(),'<h1>app</h1>');
    const js=await request('/assets/app-12345678.js');assert.equal(js.status,200);assert.match(js.headers['Cache-Control'],/immutable/);
    const head=await request('/desk','HEAD');assert.equal(head.status,200);assert.equal(head.body,undefined);assert.equal(head.headers['Cache-Control'],'no-store');
    for(const path of ['/.env','/server.mjs','/no-such-page','/assets/%2e%2e/secret.js','/assets/escape.js','/assets/%5csecret.js','/assets/no.json','/assets/%00.js'])assert.equal((await request(path)).status,404,path);
    assert.equal((await request('/desk','POST')).status,405);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('the root document is the reviewed landing page while the workbench keeps its routes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'relay-landing-'));
  try{
    const root=join(dir,'dist');await mkdir(root,{recursive:true});
    await writeFile(join(root,'landing.html'),'<h1>landing</h1>');await writeFile(join(root,'index.html'),'<h1>app</h1>');
    const serve=builtAssets(root);
    async function request(path){const out={};await serve({method:'GET'},{writeHead:(status,headers)=>Object.assign(out,{status,headers}),end:body=>out.body=body},path);return out;}
    const landing=await request('/');
    assert.equal(landing.status,200);assert.equal(landing.body.toString(),'<h1>landing</h1>');
    assert.equal(landing.headers['Content-Type'],'text/html; charset=utf-8');
    assert.equal(landing.headers['Cache-Control'],'no-store');
    assert.equal(landing.headers['X-Content-Type-Options'],'nosniff');
    for(const path of ['/desk','/setup','/claim','/training'])assert.equal((await request(path)).body.toString(),'<h1>app</h1>',path);
    assert.equal((await request('/landing.html')).status,404);
  }finally{await rm(dir,{recursive:true,force:true});}
});
