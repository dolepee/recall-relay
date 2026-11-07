import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {recallDraft} from '../src/cpsc.mjs';
import {externalDependencies} from '../src/external-sources.mjs';
import {assertExecutableSource} from '../src/source-policy.mjs';

test('the documented CPSC example keeps its external prerequisites blocked',async()=>{
  const fixture=JSON.parse(await readFile(new URL('./fixtures/cpsc-20261021.json',import.meta.url),'utf8'));
  const source=recallDraft(fixture.records.find(record=>record.RecallNumber==='27026'));
  const dependencies=externalDependencies(source);
  assert.deepEqual(dependencies.map(d=>d.id),['external-0-0','external-0-2']);
  assert.ok(dependencies.every(d=>d.status==='UNRESOLVED'));
  assert.throws(()=>assertExecutableSource(source,[],[]),/external instructions/);

  const readme=await readFile(new URL('../README.md',import.meta.url),'utf8');
  const walkthrough=readme.slice(readme.indexOf('## Use the app'),readme.indexOf('## Correctness and scope'));
  for(const step of ['Source versions and external instructions','Save\n   external source snapshot','before drafting','do not invent an excerpt'])
    assert.ok(walkthrough.includes(step),`Missing source-review instruction: ${step}`);
});

test('the evaluation guide distinguishes simulated paths from live integrations',async()=>{
  const readme=await readFile(new URL('../README.md',import.meta.url),'utf8');
  const guide=readme.slice(readme.indexOf('## Evaluation quick start'),readme.indexOf('## Read-only sample desk'));
  for(const path of ['/sample','/practice/reconciliation','/practice','/setup','/desk','/evaluation'])
    assert.ok(guide.includes(`https://recall-relay.dolepee.com${path})`),path);
  assert.match(guide,/do not demonstrate live AI inference or a\s+PayPal transaction/);
  assert.match(guide,/AI cannot approve a refund, edit evidence or authorize payment/);
  assert.match(guide,/authenticated PayPal readback matches the original capture and approved amount/);
  assert.match(guide,/Passing those tests is not evidence of a hosted PayPal/);
});
