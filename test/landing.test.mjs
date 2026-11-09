import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const landing=resolve('public/landing.html');
const read=()=>readFile(landing,'utf8');

test('the homepage states the merchant job and the two real entry points',async()=>{
  const html=await read();
  for(const copy of [
    'Recall resolution for merchants',
    'Resolve recall claims. Refund the <em>right item.</em>',
    'Turn a recall notice into clear customer steps, then refund only the affected item to the original PayPal payment.',
    'Guided claim',
    'Practice is simulated. The connected path uses PayPal Sandbox and a test-buyer login.',
    'Practice a complete claim',
    'Sandbox workspace',
    'How it works',
    'Evaluation',
  ]) assert.ok(html.includes(copy),copy);
  assert.match(html,/<a class="btn secondary" href="\/practice">Practice a complete claim<\/a>/);
  assert.match(html,/href="\/desk"/);
  assert.match(html,/href="\/sample"/);
  assert.match(html,/id="relay"/);
  assert.doesNotMatch(html,/recall-relay\.dolepee\.com/);
});

test('the illustrative allocation explains the affected item, exclusion and destination without fake controls',async()=>{
  const html=await read();
  for(const copy of [
    'One order. One affected item.',
    'Illustrative example',
    'Fictional example.',
    'Relay Home cup',
    'Affected item',
    '$25.99',
    'Relay Home tray',
    'Excluded from refund',
    '$34.00',
    'Original purchase',
    '$59.99',
    'Proposed refund',
    'To the original PayPal payment',
    'Only the cup is refunded; you review and approve.',
  ]) assert.ok(html.includes(copy),copy);
  const example=html.slice(html.indexOf('<aside class="example"'),html.indexOf('</aside>',html.indexOf('<aside class="example"')));
  assert.ok(example.length>0);
  assert.doesNotMatch(example,/<button|<form|<input/i,'the example is illustrative, not an approval control');
});

test('the instructions cover the three stages, the decision ingredients and the practice distinction',async()=>{
  const html=await read();
  for(const copy of [
    'One clear path from notice to refund.',
    'Find affected purchases',
    'Compare the notice with each purchase line.',
    'Review evidence',
    'Review the current evidence and request only what is missing.',
    'Approve refund',
    'Refund the affected amount and confirm PayPal’s result.',
    'Everything needed for the decision.',
    'Source requirement',
    'Current evidence',
    'Refund confirmation',
    'Practice or Sandbox?',
    'Practice is simulated. The connected path uses live AI drafting and PayPal test funds.',
    'PayPal Sandbox and a test-buyer login.',
  ]) assert.ok(html.includes(copy),copy);
});

test('the homepage remains self-contained and does not make unsupported claims',async()=>{
  const html=await read();
  assert.doesNotMatch(html,/<script[^>]+src=/i);
  assert.doesNotMatch(html,/<link[^>]+rel="?stylesheet/i);
  assert.doesNotMatch(html,/<img[^>]+src="https?:/i);
  assert.doesNotMatch(html,/testimonial|customer logo|certification|time savings|thousands of|trusted by/i);
  assert.doesNotMatch(html,/named approval|who approved it/i);
});

test('desktop and mobile navigation agree on real destinations',async()=>{
  const html=await read();
  const desktop=html.slice(html.indexOf('<nav class="nav"'),html.indexOf('</nav>',html.indexOf('<nav class="nav"')));
  const mobile=html.slice(html.indexOf('<nav aria-label="Product navigation">',html.indexOf('<details class="mobile-menu"')),html.indexOf('</nav>',html.indexOf('<nav aria-label="Product navigation">',html.indexOf('<details class="mobile-menu"'))));
  const hrefs=block=>[...block.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(hrefs(mobile),hrefs(desktop),'the two menus expose the same destinations in the same order');
  for(const target of hrefs(desktop)){
    assert.ok(target==='#relay'||target==='/practice'||target==='/practice/reconciliation'||target==='/desk'||target==='/setup?example=relay-home',`unexpected destination ${target}`);
  }
  assert.doesNotMatch(html,/href="#"/,'no placeholder links');
  assert.match(html,/id="relay"/);
  assert.match(html,/#relay\{scroll-margin-top:88px\}/,'the anchor clears the sticky header');
});
