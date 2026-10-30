import test from 'node:test';
import assert from 'node:assert/strict';
import pages from '../cloud/pages-worker.mjs';

test('Pages serves the landing document at the root and keeps the workbench routes',async()=>{
  const seen=[];
  const env={ASSETS:{fetch:async request=>{seen.push(new URL(request.url));return new Response('app');}},BACKEND:{fetch:async request=>new Response(request.url)}};
  const landing=await pages.fetch(new Request('https://recall-relay.test/'),env);
  assert.equal(landing.status,200);assert.equal(seen.at(-1).pathname,'/landing.html');
  assert.equal(landing.headers.get('Cache-Control'),'no-store');
  for(const path of ['/desk','/setup','/desk?purchase=test','/claim?workspace=example']){
    const response=await pages.fetch(new Request('https://recall-relay.test'+path),env);
    assert.equal(response.status,200);assert.equal(seen.at(-1).pathname,'/');
    assert.equal(response.headers.get('Cache-Control'),'no-store');
  }
  assert.equal(await (await pages.fetch(new Request('https://recall-relay.test/api/merchant/state'),env)).text(),'https://recall-relay.test/api/merchant/state');
  assert.equal((await pages.fetch(new Request('https://recall-relay.test/.env'),env)).status,404);
  assert.equal((await pages.fetch(new Request('https://recall-relay.test/landing.html'),env)).status,404);
  // The training workspace is local-only; the hosted site must not expose it.
  assert.equal((await pages.fetch(new Request('https://recall-relay.test/training'),env)).status,404);
});

test('hashed public assets are immutable while private API cache policy stays intact',async()=>{
  const env={ASSETS:{fetch:async()=>new Response('asset')},BACKEND:{fetch:async()=>new Response('private',{headers:{'Cache-Control':'no-store'}})}};
  assert.equal((await pages.fetch(new Request('https://example.com/assets/main-1234abcd.js'),env)).headers.get('Cache-Control'),'public, max-age=31536000, immutable');
  assert.equal((await pages.fetch(new Request('https://example.com/assets/unversioned.js'),env)).headers.get('Cache-Control'),null);
  assert.equal((await pages.fetch(new Request('https://example.com/api/claim/state'),env)).headers.get('Cache-Control'),'no-store');
});

test('Pages follows its own document redirect so the landing page resolves at the root',async()=>{
  const seen=[];
  const env={ASSETS:{fetch:async request=>{
    const path=new URL(request.url).pathname;seen.push(path);
    if(path==='/landing.html')return new Response(null,{status:308,headers:{Location:'/landing'}});
    if(path==='/landing')return new Response('<h1>landing</h1>',{headers:{'Content-Type':'text/html; charset=utf-8'}});
    return new Response('app');
  }},BACKEND:{fetch:async()=>new Response('api')}};
  const response=await pages.fetch(new Request('https://recall-relay.test/'),env);
  assert.equal(response.status,200);
  assert.equal(await response.text(),'<h1>landing</h1>');
  assert.deepEqual(seen,['/landing.html','/landing']);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal(response.headers.get('Content-Type'),'text/html; charset=utf-8');
  assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
});
