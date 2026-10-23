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
