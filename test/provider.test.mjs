import test from 'node:test';
import assert from 'node:assert/strict';
import { PayPalSandbox } from '../src/paypal-sandbox.mjs';
import { RefundJournal } from '../src/journal.mjs';
import { planClaim } from '../src/plan.mjs';
import { policy, evidence, purchase, now } from '../fixtures.mjs';

test('a provider success with missing, different or inexact money stays unresolved', () => {
  const journal = new RefundJournal();
  try {
    const plan = planClaim({ policy, evidence, purchase, now });
    const row = journal.reserve(plan, {actor:'fixture-merchant',digest:plan.digest}, 5999);
    journal.begin(row.request_id);
    for (const amount of [undefined, {value:'25.98',currency_code:'USD'}, {value:'25.99',currency_code:'EUR'}, {value:'25.990',currency_code:'USD'}, {value:25.99,currency_code:'USD'}, {value:'2.599e1',currency_code:'USD'}]) {
      assert.throws(() => journal.observe(row.request_id, {id:'TEST-REFUND',status:'COMPLETED',amount}));
      assert.equal(journal.get(row.request_id).state, 'UNKNOWN');
      assert.equal(journal.get(row.request_id).refund_id, null);
    }
    assert.equal(journal.observe(row.request_id, {id:'TEST-REFUND',status:'COMPLETED',amount:{value:'25.99',currency_code:'USD'}}).state, 'COMPLETED');
  } finally { journal.close(); }
});

test('OAuth, order and capture contracts stay on sandbox with exact cents and stable request IDs', async () => {
  const calls = [];
  const client = await PayPalSandbox.fromCredentials({clientId:'fixture-client',clientSecret:'fixture-secret',fetchImpl:async(url,init)=>{
    calls.push({url,init});
    return {ok:true,json:async()=>url.endsWith('/token')?{access_token:'fixture-token',token_type:'Bearer',expires_in:300}:{id:'TEST-RESOURCE',status:'CREATED'}};
  }});
  assert.equal(calls[0].url, 'https://api-m.sandbox.paypal.com/v1/oauth2/token');
  assert.equal(calls[0].init.body, 'grant_type=client_credentials');
  assert.equal(Buffer.from(calls[0].init.headers.Authorization.slice(6),'base64').toString(), 'fixture-client:fixture-secret');
  await client.createOrder({cents:2599,requestId:'create-fixture'});
  assert.deepEqual(JSON.parse(calls[1].init.body).purchase_units[0].amount, {value:'25.99',currency_code:'USD'});
  await client.captureOrder({orderId:'TEST-ORDER',requestId:'capture-fixture'});
  assert.equal(calls[2].url, 'https://api-m.sandbox.paypal.com/v2/checkout/orders/TEST-ORDER/capture');
  assert.equal(calls[2].init.headers['PayPal-Request-Id'], 'capture-fixture');
  await client.captureDetails('TEST-CAPTURE');
  await client.details('TEST-REFUND');
  for (const call of calls) {
    assert.equal(new URL(call.url).origin, 'https://api-m.sandbox.paypal.com');
    assert.equal(call.init.redirect, 'manual');
  }
  const count = calls.length;
  await assert.rejects(client.createOrder({cents:25.99,requestId:'bad-cents'}), /integer cents/);
  await assert.rejects(client.captureOrder({orderId:'../../other',requestId:'bad-id'}), /resource ID/);
  await assert.rejects(client.captureOrder({orderId:'TEST-ORDER'}), /stable request ID/);
  assert.equal(calls.length, count);
});

test('authentication fails without leaking provider body or accepting malformed tokens', async () => {
  await assert.rejects(PayPalSandbox.fromCredentials({clientId:'test',clientSecret:'test',fetchImpl:async()=>({ok:false,status:401,json:async()=>({sensitive:'do not echo'})})}), /^Error: PayPal sandbox authentication HTTP 401\.$/);
  await assert.rejects(PayPalSandbox.fromCredentials({clientId:'test',clientSecret:'test',fetchImpl:async()=>({ok:true,json:async()=>({token_type:'Bearer',expires_in:300})})}), /access token/);
});

test('provider redirects are rejected without forwarding credentials to another destination', async () => {
  const calls=[];
  const fetchImpl=async(url,init)=>{calls.push({url,init});return new Response(null,{status:302,headers:{Location:'https://untrusted.example/'}});};
  await assert.rejects(PayPalSandbox.fromCredentials({clientId:'test',clientSecret:'test',fetchImpl}),/authentication HTTP 302/);
  const client=new PayPalSandbox({token:'disposable-test-token',fetchImpl});
  await assert.rejects(client.details('TEST-REFUND'),/HTTP 302/);
  assert.equal(calls.length,2);
  assert(calls.every(call=>call.init.redirect==='manual'&&new URL(call.url).origin==='https://api-m.sandbox.paypal.com'));
});

test('refund readback rejects unrelated captures, wrong amounts and untrusted parent origins', async () => {
  const reservation = {capture:'TEST-CAPTURE',cents:2599,currency:'USD'};
  const valid = {id:'TEST-REFUND',status:'COMPLETED',amount:{value:'25.99',currency_code:'USD'},links:[{rel:'up',href:'https://api.sandbox.paypal.com/v2/payments/captures/TEST-CAPTURE'}]};
  let body = valid;
  const client = new PayPalSandbox({token:'fixture-token',fetchImpl:async()=>({ok:true,json:async()=>body})});
  assert.deepEqual(await client.verifiedRefund(reservation,'TEST-REFUND'),valid);
  for (const bad of [
    {...valid,id:'OTHER-REFUND'},
    {...valid,amount:{value:'25.98',currency_code:'USD'}},
    {...valid,status:'CREATED'},
    {...valid,links:[]},
    ...['https://api.sandbox.paypal.com/v2/payments/captures/OTHER-CAPTURE',
        'https://api.paypal.com/v2/payments/captures/TEST-CAPTURE',
        'https://api.sandbox.paypal.com.attacker.example/v2/payments/captures/TEST-CAPTURE']
      .map(href=>({...valid,links:[{rel:'up',href}]})),
  ]) {
    body=bad;
    await assert.rejects(client.verifiedRefund(reservation,'TEST-REFUND'));
  }
});
