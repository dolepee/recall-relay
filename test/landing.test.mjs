import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const landing=resolve('public/landing.html');

test('the landing document states its sandbox scope and stays self-contained',async()=>{
  const html=await readFile(landing,'utf8');
  for(const label of [
    'Sandbox evaluation',
    'Test funds · fictional merchandise',
    'Sandbox workspace · <em>test funds</em>',
    'Sandbox example',
    'Example controls',
    'Sandbox test record',
    'Not a real PayPal transaction',
  ]) assert.ok(html.includes(label),label);
  assert.match(html,/href="\/desk"/);
  assert.doesNotMatch(html,/recall-relay\.dolepee\.com/);
  assert.doesNotMatch(html,/Design prototype/);
  assert.doesNotMatch(html,/<script[^>]+src=/i);
  assert.doesNotMatch(html,/<link[^>]+rel="?stylesheet/i);
  assert.doesNotMatch(html,/<img[^>]+src="https?:/i);
});

test('landing copy describes what approval and the sandbox desk actually record',async()=>{
  const html=await readFile(landing,'utf8');
  // The journal records the generic actor `local-merchant`, not a person's name.
  assert.doesNotMatch(html,/named approval/i);
  assert.doesNotMatch(html,/who approved it/i);
  assert.match(html,/explicit merchant approval/);
  assert.match(html,/recorded against the revision it was made on/);
  // The desk opens the visitor's own workspace; the illustrated claim is not seeded.
  assert.doesNotMatch(html,/Follow this exact claim/i);
  assert.match(html,/your own workspace on test funds/);
  assert.match(html,/an example, not a record waiting in your desk/);
});
