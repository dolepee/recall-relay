import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PracticeWorkspace,PracticeSessionError} from '../src/practice-workspace.mjs';

// Distinct, deliberately tiny PNGs. Practice uploads are never asserted to be
// authentic evidence; the state machine only checks the file is a real image.
const PHOTO_A='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
const PHOTO_B='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/5ncLrgAAAABJRU5ErkJggg==';
const NOW='2026-11-01T23:30:00.000Z';
const extra=()=>({'practice-lot-confirm':true,'practice-defect':'The handle is cracked near the rim.'});

async function workspace(){
  const dir=await mkdtemp(join(tmpdir(),'relay-practice-'));
  const path=join(dir,'practice.sqlite');
  return {dir,path,open:()=>new PracticeWorkspace({path,now:()=>NOW})};
}

test('one practice session runs the full journey and a correction invalidates review',async()=>{
  const space=await workspace();
  const ws=space.open();
  try{
    const {session,token}=ws.open(null);
    assert.match(token,/^[\w-]{43}$/);
    let view=ws.view(session);
    assert.equal(view.role,'merchant');
    assert.equal(view.case.status.code,'AWAITING_CUSTOMER');
    assert.equal(view.scenario.affectedCents,2599);
    assert.equal(view.scenario.unaffectedCents,3400);
    assert.equal(view.scenario.totalCents,5999);
    assert.ok(view.scenario.requirements.every(r=>r.quote&&r.citation));
    assert.match(view.scenario.sourceNote,/not a CPSC/);
    assert.match(view.scenario.recordedDraft.note,/not a live model response/);

    const draft={revision:0,lot:'LOT-A',acknowledged:true,photo:PHOTO_A,extra:extra()};
    assert.throws(()=>ws.submit(session,draft),/customer view/);
    ws.role(session,'customer');
    assert.equal(ws.open(token).session.role,'customer','the chosen role survives a new request');
    assert.throws(()=>ws.requestChanges(session,{revision:0,message:'x'.repeat(20),replacePhoto:true}),/merchant view/);

    view=ws.submit(session,draft);
    assert.equal(view.case.status.code,'SUBMITTED');
    assert.deepEqual(view.case.missing,[]);
    assert.equal(view.case.submission.lot,'LOT-A');

    ws.role(session,'merchant');
    view=ws.review(session,{revision:view.case.revision,confirmed:true});
    assert.equal(view.case.plan.status,'READY_FOR_APPROVAL');
    assert.equal(view.case.review.revision,view.case.revision);

    view=ws.requestChanges(session,{revision:view.case.revision,message:'The lot code is too blurred to read. Please upload a clearer photograph.',replacePhoto:true});
    assert.equal(view.case.review,null,'a correction must clear the prior review');
    assert.notEqual(view.case.plan.status,'READY_FOR_APPROVAL');
    assert.equal(view.case.status.code,'NEEDS_INFORMATION');
    await assert.rejects(ws.approve(session,{confirmed:true}),/requested changes/);

    ws.role(session,'customer');
    view=ws.submit(session,{revision:view.case.revision,lot:'LOT-A',acknowledged:true,photo:PHOTO_B,extra:extra(),correctionResponse:'I uploaded a clearer label photograph showing LOT-A.'});
    assert.equal(view.case.correction.state,'RESPONDED');
    assert.equal(view.case.review,null);

    ws.role(session,'merchant');
    view=ws.review(session,{revision:view.case.revision,confirmed:true});
    view=await ws.approve(session,{confirmed:true});
    assert.equal(view.case.status.code,'COMPLETED');
    assert.equal(view.case.refund.state,'COMPLETED');
    assert.equal(view.case.refund.cents,2599);
    assert.equal(view.case.refund.currency,'USD');
    assert.match(view.case.refund.reference,/^PRACTICE-REFUND-/);
    assert.match(view.case.status.reason,/No payment provider was contacted/);
    assert.match(view.case.status.reason,/no funds moved/);

    // Reload: a new workspace over the same store still resolves the session.
    ws.close();
    const reopened=space.open();
    try{
      const again=reopened.open(token).session;
      const stored=reopened.view(again);
      assert.equal(stored.case.status.code,'COMPLETED');
      assert.equal(stored.case.refund.reference,view.case.refund.reference);
      assert.equal(stored.case.revision,view.case.revision);
      assert.equal(stored.attempt,1);
    }finally{reopened.close();}
  } finally { await rm(space.dir,{recursive:true,force:true}); }
});

test('two practice sessions cannot read or mutate each other’s case',async()=>{
  const space=await workspace();
  const ws=space.open();
  try{
    const a=ws.open(null).session,b=ws.open(null).session;
    const viewA=ws.view(a),viewB=ws.view(b);
    assert.notEqual(viewA.case.id,viewB.case.id);

    ws.role(a,'customer');
    ws.submit(a,{revision:0,lot:'LOT-A',acknowledged:true,photo:PHOTO_A,extra:extra()});
    ws.role(b,'customer');
    const changed=ws.submit(b,{revision:0,lot:'LOT-OTHER',acknowledged:true,photo:PHOTO_A,extra:extra()});
    assert.equal(changed.case.id,viewB.case.id);
    assert.equal(changed.case.submission.lot,'LOT-OTHER','session B writes only its own claim');

    const storedA=ws.view(a);
    assert.equal(storedA.case.id,viewA.case.id);
    assert.equal(storedA.case.submission.lot,'LOT-A');
    assert.equal(storedA.case.status.code,'SUBMITTED');

    assert.throws(()=>ws.open('x'.repeat(43)),PracticeSessionError);
  } finally { await rm(space.dir,{recursive:true,force:true}); }
});

test('restart begins a fresh practice case in the same session',async()=>{
  const space=await workspace();
  const ws=space.open();
  try{
    const {session}=ws.open(null);
    const first=ws.view(session).case.id;
    ws.role(session,'customer');
    ws.submit(session,{revision:0,lot:'LOT-A',acknowledged:true,photo:PHOTO_A,extra:extra()});
    ws.role(session,'merchant');
    const restarted=ws.restart(session);
    assert.notEqual(restarted.case.id,first);
    assert.equal(ws.view(ws.open(session.token).session).case.id,restarted.case.id,'the restart survives a new request');
    assert.equal(restarted.attempt,2);
    assert.equal(restarted.case.status.code,'AWAITING_CUSTOMER');
    assert.equal(restarted.case.submission,null);
  } finally { await rm(space.dir,{recursive:true,force:true}); }
});

test('the practice provider has no network client or payment adapter import',async()=>{
  const source=await readFile(new URL('../src/practice-provider.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\bfetch\s*\(|https?:\/\//);
  assert.doesNotMatch(source,/paypal-sandbox|PAYPAL_/i);
  const http=await readFile(new URL('../src/practice-http.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(http,/paypal-sandbox|payPalSandbox/i);
});
