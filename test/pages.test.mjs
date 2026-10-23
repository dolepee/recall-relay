import test from 'node:test';
import assert from 'node:assert/strict';
import pages from '../cloud/pages-worker.mjs';

test('Pages app routes request the canonical asset root and preserve API origin',async()=>{
  const seen=[];
  const env={ASSETS:{fetch:async request=>{seen.push(new URL(request.url));return new Response('app');}},BACKEND:{fetch:async request=>new Response(request.url)}};
  for(const path of ['/','/setup','/desk?purchase=test','/claim?workspace=example']){
    const response=await pages.fetch(new Request('https://recall-relay.test'+path),env);
    assert.equal(response.status,200);assert.equal(seen.at(-1).pathname,'/');
    assert.equal(response.headers.get('Cache-Control'),'no-store');
  }
  assert.equal(await (await pages.fetch(new Request('https://recall-relay.test/api/merchant/state'),env)).text(),'https://recall-relay.test/api/merchant/state');
  assert.equal((await pages.fetch(new Request('https://recall-relay.test/.env'),env)).status,404);
});

test('hashed public assets are immutable while private API cache policy stays intact',async()=>{
  const env={ASSETS:{fetch:async()=>new Response('asset')},BACKEND:{fetch:async()=>new Response('private',{headers:{'Cache-Control':'no-store'}})}};
  assert.equal((await pages.fetch(new Request('https://example.com/assets/main-1234abcd.js'),env)).headers.get('Cache-Control'),'public, max-age=31536000, immutable');
  assert.equal((await pages.fetch(new Request('https://example.com/assets/unversioned.js'),env)).headers.get('Cache-Control'),null);
  assert.equal((await pages.fetch(new Request('https://example.com/api/claim/state'),env)).headers.get('Cache-Control'),'no-store');
});
