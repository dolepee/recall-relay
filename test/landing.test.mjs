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
  // Guard 02: a repeat approval resumes the one reserved request after re-checking the capture.
  assert.doesNotMatch(html,/finds it reserved and stops/i);
  assert.match(html,/resumes that one request and re-checks the capture first/);
});

test('the receipt promises only what the product receipt exposes',async()=>{
  const html=await readFile(landing,'utf8');
  // The product receipt shows a status, an amount and a refund reference; it exposes no timestamp.
  assert.doesNotMatch(html,/\d{2}:\d{2}\s*UTC/);
  assert.doesNotMatch(html,/One timestamp/i);
  assert.match(html,/<dt>Status<\/dt>/);
  assert.match(html,/from PayPal's confirmation of the refund/);
  // Footer sits on light paper, so it must keep the default focus outline.
  assert.doesNotMatch(html,/\.foot :focus-visible/);
});

test('the landing page offers the simulated practice claim beside, not instead of, the sandbox desk',async()=>{
  const html=await readFile(landing,'utf8');
  assert.match(html,/href="\/practice"/);
  assert.match(html,/Try a practice claim/);
  assert.match(html,/practice simulated, no PayPal account needed/);
  assert.match(html,/simulated practice claim — no PayPal account needed/);
  // The connected sandbox desk keeps its existing entry points.
  assert.match(html,/href="\/desk"/);
  assert.match(html,/href="\/sample"/);
  assert.match(html,/Open the sandbox desk/);
  assert.doesNotMatch(html,/Practice claim only/i);
});

test('the landing example uses the active 27026 crystal-cup source and no dresser copy',async()=>{
  const html=await readFile(landing,'utf8');
  assert.match(html,/Crystal Glass Cups with Loose Crystal Chips/);
  assert.match(html,/CPSC 27-026/);
  assert.match(html,/Consumer will be asked to fill out an online form and submit a photograph/);
  assert.match(html,/permanent black marker/);
  assert.match(html,/SCENARIO-ITEM · LOT-A/);
  assert.doesNotMatch(html,/Romorgniz|six-drawer|dresser|drawers|RECALLED|CPSC 27-020|RZ-6D/);
});
