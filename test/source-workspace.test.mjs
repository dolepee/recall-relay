import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {SourceWorkspace,sourcePrompt,validateSourceSuggestion,validateManualField,validateView,assistCases} from '../src/source-workspace.mjs';
import {ClaimDesk} from '../src/claims.mjs';
import {campaignIdFor} from '../src/publication.mjs';

const quote='Upload a photo of the label and confirm the product serial number.';
const source={title:'Public notice',remedies:[quote],sourceUrl:'https://www.cpsc.gov/Recalls/2026/Example',sourceDigest:'a'.repeat(64)};
const raw=JSON.stringify({requirements:[{kind:'PHOTO',quote}]});
function fixture(generate=async()=>raw){const db=new DatabaseSync(':memory:');return {db,ws:new SourceWorkspace(db,{loadSource:async()=>structuredClone(source),ai:{status:()=>({available:true,model:'test-double'}),generate}})};}
test('source fields require exact quotations; generated authority and invented instructions fail',()=>{
  assert.equal(validateSourceSuggestion(raw,source).paymentAuthorized,false);
  assert.throws(()=>validateSourceSuggestion(JSON.stringify({requirements:[{kind:'PHOTO',quote:'Destroy your item immediately.'}]}),source));
  assert.throws(()=>validateSourceSuggestion(JSON.stringify({requirements:[],approved:true}),source));
  assert.throws(()=>validateSourceSuggestion(JSON.stringify({requirements:[{kind:'PAY',quote}]}),source));
});
test('source review binds selected fields to current revision and source, without publishing payments',async()=>{
  const {db,ws}=fixture();const imported=await ws.import('27026');const suggested=await ws.suggest(imported.id,1);
  assert.throws(()=>ws.review(imported.id,{revision:1,fieldIds:['field-1'],confirmed:true}));
  assert.throws(()=>ws.review(imported.id,{revision:2,fieldIds:['invented'],confirmed:true}));
  const reviewed=ws.review(imported.id,{revision:2,fieldIds:['field-1'],confirmed:true});
  assert.equal(reviewed.review.fields[0].quote,quote);assert.equal(reviewed.review.paymentAuthorized,false);
  assert.equal(reviewed.review.sourceDigest,source.sourceDigest);assert.equal((await ws.state()).setups.length,1);
  // Without a desk the state cannot name an active campaign, and it must say so rather than guess.
  assert.equal((await ws.state()).activeCampaign,null);
  db.close();
});
test('concurrent source suggestion cannot replace a reviewed revision',async()=>{
  let release;const {db,ws}=fixture(()=>new Promise(resolve=>{release=resolve;}));
  const row=await ws.import('27026');const pending=ws.suggest(row.id,1);
  ws.save({...row,revision:2,review:{sentinel:true}});release(raw);
  await assert.rejects(pending,/changed while drafting/);assert.equal(ws.get(row.id).review.sentinel,true);db.close();
});
test('merchant can supply a missing source field without AI and cannot introduce invented text',async()=>{
  const {db,ws}=fixture();const row=await ws.import('27026');
  assert.throws(()=>ws.addField(row.id,{revision:1,kind:'TEXT',quote:'Supply your bank account number.'}));
  const amended=ws.addField(row.id,{revision:1,kind:'PHOTO',quote});
  assert.equal(amended.suggestion.requirements[0].origin,'MERCHANT_SOURCE_SELECTION');assert.equal(amended.review,null);
  assert.throws(()=>ws.addField(row.id,{revision:2,kind:'PHOTO',quote}));db.close();
});
test('case assistant has a closed view vocabulary and computes its answer from current states',async()=>{
  assert.equal(validateView('WAITING'),'WAITING');
  assert.equal(validateView('REVIEW'),'REVIEW');
  assert.throws(()=>validateView('WAITING; send_refund()'));
  assert.throws(()=>validateView('{"view":"READY","refund":true}'));
  assert.throws(()=>validateView('{"view":"delete_all"}'));
  const ai={generate:async()=>'{"view":"WAITING"}',status:()=>({model:'test-double'})};
  const desk={merchantState:()=>({cases:[{order:'RR-1',status:{code:'NEEDS_INFORMATION',reason:'Add a photo.'}},{order:'RR-2',status:{code:'COMPLETED',reason:'Confirmed.'}}]})};
  const result=await assistCases(ai,desk,'who still owes a photo?');assert.equal(result.view,'WAITING');assert.match(result.message,/RR-1: Add a photo/);assert.doesNotMatch(result.message,/RR-2/);
  ai.generate=async()=>'{"view":"UNSUPPORTED"}';assert.equal((await assistCases(ai,desk,'Refund everybody')).view,null);
});

test('regenerating source suggestions preserves merchant fields and invalidates review',async()=>{
  const {db,ws}=fixture();try{
    let row=await ws.import('27026');
    row=ws.addField(row.id,{revision:row.revision,kind:'TEXT',quote});
    const merchant=row.suggestion.requirements[0];
    row=ws.review(row.id,{revision:row.revision,fieldIds:[merchant.id],confirmed:true});
    row=await ws.suggest(row.id,row.revision);
    assert.deepEqual(row.suggestion.requirements[0],merchant);
    assert.equal(row.suggestion.requirements.length,2);
    assert.equal(row.suggestion.requirements[1].kind,'PHOTO');
    assert.equal(row.review,null);
  }finally{db.close();}
});

test('empty suggestions keep merchant selections and failed overflow leaves the reviewed setup untouched',async()=>{
  let response=JSON.stringify({requirements:[]});
  const {db,ws}=fixture(async()=>response);
  try{
    let row=await ws.import('27026');
    const quotes=Array.from({length:7},(_,i)=>`Provide the source identifier for product number ${i+1}.`);
    row.source.remedies.push(...quotes);ws.save(row);
    row=ws.addField(row.id,{revision:row.revision,kind:'TEXT',quote:quotes[0]});
    const merchant=row.suggestion.requirements[0];
    row=await ws.suggest(row.id,row.revision);
    assert.deepEqual(row.suggestion.requirements,[merchant]);
    response=JSON.stringify({requirements:quotes.slice(1).map(quote=>({kind:'TEXT',quote}))});
    row=ws.review(row.id,{revision:row.revision,fieldIds:[merchant.id],confirmed:true});
    await assert.rejects(ws.suggest(row.id,row.revision),/exceeds six/);
    assert.deepEqual(ws.get(row.id),row);
    // A duplicate of the merchant quote consumes no additional slot.
    response=JSON.stringify({requirements:quotes.slice(0,6).map(quote=>({kind:'TEXT',quote}))});
    row=await ws.suggest(row.id,row.revision);
    assert.equal(row.suggestion.requirements.length,6);
    assert.deepEqual(row.suggestion.requirements[0],merchant);
    assert.equal(new Set(row.suggestion.requirements.map(f=>f.id)).size,6);
    assert.equal(row.review,null);
  }finally{db.close();}
});

test('regeneration retains unchanged field identities without reusing replaced field identities',async()=>{
  let response=raw;const {db,ws}=fixture(async()=>response);
  try{
    let row=await ws.import('27026');
    const other='Confirm that the label identifier has been supplied.';
    row.source.remedies.push(other);ws.save(row);
    row=await ws.suggest(row.id,row.revision);const original=row.suggestion.requirements[0];
    response=JSON.stringify({requirements:[{kind:'CONFIRMATION',quote:other},{kind:'PHOTO',quote}]});
    row=await ws.suggest(row.id,row.revision);
    assert.deepEqual(row.suggestion.requirements[1],original);
    assert.notEqual(row.suggestion.requirements[0].id,original.id);
    const added=row.suggestion.requirements[0];
    response=JSON.stringify({requirements:[{kind:'TEXT',quote},{kind:'CONFIRMATION',quote:other}]});
    row=await ws.suggest(row.id,row.revision);
    assert.deepEqual(row.suggestion.requirements[1],added);
    assert.notEqual(row.suggestion.requirements[0].id,original.id);
    assert.equal(new Set(row.suggestion.requirements.map(f=>f.id)).size,2);
  }finally{db.close();}
});

test('a merchant field added during inference wins over the stale generated result',async()=>{
  let release;const {db,ws}=fixture(()=>new Promise(resolve=>{release=resolve;}));
  try{
    const row=await ws.import('27026'),pending=ws.suggest(row.id,row.revision);
    const amended=ws.addField(row.id,{revision:row.revision,kind:'TEXT',quote});
    release(raw);await assert.rejects(pending,/changed while drafting/);
    assert.deepEqual(ws.get(row.id),amended);
  }finally{db.close();}
});

// --- Active-setup publication: the state response names the campaign a purchase would really use. ---
const quotesFor=n=>[`Upload a photograph of the label for notice ${n}.`,`Confirm the printed serial number for notice ${n}.`];
const sourceFor=n=>({title:`Notice ${n}`,recallNumber:n,products:[{name:`Product ${n}`}],route:'ORIGINAL_PAYMENT_CANDIDATE',sourceUrl:'https://www.cpsc.gov/Recalls/2026/Example',sourceDigest:String(n).padEnd(64,'b').slice(0,64),remedies:quotesFor(n)});
function deskFixture({ai}={}){
  const desk=new ClaimDesk({path:':memory:',provider:async()=>{throw new Error('No payment transport in this test.');}});
  const ws=new SourceWorkspace(desk.db,{loadSource:async n=>structuredClone(sourceFor(n)),ai:ai||{status:()=>({available:true,model:'test-double'}),generate:async()=>JSON.stringify({requirements:[{kind:'PHOTO',quote:quotesFor('27026')[0]}]})}});
  return {desk,ws};
}
async function preparedSetup(desk,ws,n,{sku,lot,publish}){
  let row=await ws.import(n);
  row=ws.addField(row.id,{revision:row.revision,kind:'PHOTO',quote:quotesFor(n)[0]});
  row=ws.review(row.id,{revision:row.revision,fieldIds:row.suggestion.requirements.map(f=>f.id),confirmed:true});
  if(publish)row=ws.activate(row.id,{revision:row.revision,sku,lot,confirmed:true},desk);
  return row;
}
test('source state names the authoritative active campaign while each setup keeps its own history',async()=>{
  const {desk,ws}=deskFixture();
  try{
    assert.equal((await ws.state(desk)).activeCampaign,null); // Nothing published yet: nothing is active.
    const a=await preparedSetup(desk,ws,'27026',{sku:'FIXTURE-A',lot:'LOT-A',publish:true});
    let state=await ws.state(desk);
    assert.equal(state.activeCampaign.id,campaignIdFor('27026',a.review.digest));
    assert.equal(state.activeCampaign.sku,'FIXTURE-A');
    const b=await preparedSetup(desk,ws,'27027',{sku:'FIXTURE-B',lot:'LOT-B',publish:true});
    state=await ws.state(desk);
    assert.equal(state.activeCampaign.id,campaignIdFor('27027',b.review.digest));
    assert.equal(state.activeCampaign.lot,'LOT-B');
    // A keeps its historical record; the state does not present it as the current publication.
    const storedA=state.setups.find(s=>s.id===a.id);
    assert.equal(storedA.publishedCampaign.id,campaignIdFor('27026',a.review.digest));
    assert.notEqual(state.activeCampaign.id,storedA.publishedCampaign.id);
    // A previously published setup is republishable again with its own current revision.
    const republished=ws.activate(a.id,{revision:storedA.revision,sku:'FIXTURE-A',lot:'LOT-A',confirmed:true},desk);
    assert.equal((await ws.state(desk)).activeCampaign.id,republished.publishedCampaign.id);
    assert.equal(desk.activeCampaign().sku,'FIXTURE-A');
  }finally{desk.close();}
});
test('source state stays truthful for async callers and for a workspace without AI availability',async()=>{
  const {desk,ws}=deskFixture({ai:{status:()=>({available:false,model:'test-double'})}}); // No availability() at all.
  try{
    await preparedSetup(desk,ws,'27026',{sku:'FIXTURE-A',lot:'LOT-A',publish:true});
    const [first,second]=await Promise.all([ws.state(desk),ws.state(desk)]);
    assert.deepEqual(first.activeCampaign,second.activeCampaign);
    assert.equal(first.activeCampaign.id,campaignIdFor('27026',first.setups[0].review.digest));
    assert.equal(first.ai.available,false);
    // A caller that omits the desk still gets a well-formed, non-guessing response.
    const bare=await ws.state();
    assert.equal(bare.activeCampaign,null);
    assert.equal(bare.setups.length,1);
  }finally{desk.close();}
});

const notice=(remedies,number='27-000')=>({title:`Notice ${number}`,remedies,sourceUrl:`https://www.cpsc.gov/Recalls/2026/${number}`,sourceDigest:'c'.repeat(64)});
const draft=requirements=>JSON.stringify({requirements});

test('hosted 27-020 and 27-026 failures keep correct fields and drop mistyped ones',()=>{
  const remedy020='Consumers should stop using the recalled dressers immediately if they are not anchored to the wall, place them in an area that children cannot access and contact Romorgniz for a full refund. Consumers will be asked to write in permanent marker "RECALLED" on the top, front and sides of the dresser, remove all drawers and send photos of the marked and disassembled dresser to Romorgnizrecall@outlook.com. Consumers should then dispose of the product.';
  const failing020=draft([
    {kind:'PHOTO',quote:'Consumers will be asked to write in permanent marker "RECALLED" on the top, front and sides of the dresser, remove all drawers and send photos of the marked and disassembled dresser to Romorgnizrecall@outlook.com.'},
    {kind:'TEXT',quote:'write in permanent marker "RECALLED" on the top, front and sides of the dresser'},
    {kind:'CONFIRMATION',quote:'Consumers should stop using the recalled dressers immediately if they are not anchored to the wall'},
    {kind:'TEXT',quote:'place them in an area that children cannot access'},
    {kind:'CONFIRMATION',quote:'contact Romorgniz for a full refund'},
  ]);
  const result020=validateSourceSuggestion(failing020,notice([remedy020],'27-020'));
  assert.deepEqual(result020.requirements.map(f=>f.kind),['PHOTO']);
  assert.equal(result020.filtered.length,4);
  assert.ok(result020.filtered.some(f=>/confirmation field/.test(f.reason)));
  assert.ok(result020.filtered.some(f=>/written field/.test(f.reason)));

  const remedy026='Consumers should submit a photograph with the word "RECALL" written on the front of the crystal cup in permanent black marker. Consumers should attest to proper disposal of the recalled cup following the instructions on the firm\'s website. Register at example.com to receive your refund. Consumers should stop using the recalled cup immediately.';
  const failing026=draft([
    {kind:'PHOTO',quote:'Consumers should submit a photograph with the word "RECALL" written on the front of the crystal cup in permanent black marker.'},
    {kind:'CONFIRMATION',quote:'Consumers should attest to proper disposal of the recalled cup following the instructions on the firm\'s website.'},
    {kind:'TEXT',quote:'Register at example.com to receive your refund.'},
    {kind:'TEXT',quote:'Consumers should stop using the recalled cup immediately.'},
  ]);
  const result026=validateSourceSuggestion(failing026,notice([remedy026],'27-026'));
  assert.deepEqual(result026.requirements.map(f=>f.kind),['PHOTO','CONFIRMATION']);
  assert.match(result026.requirements[1].quote,/attest to proper disposal/);
  assert.equal(result026.filtered.length,2);
});

test('held-out compound and conditional instructions keep their conditions and types',()=>{
  const source=notice([
    'If the cup has a cracked rim, remove the lid and submit a photograph of the damaged rim and the lot code.',
    "If you disposed of the cup, attest that you followed the disposal instructions on the firm's website.",
    'Where the label is unreadable, provide the serial number printed on the base.',
  ],'27-099');
  const raw=draft([
    {kind:'PHOTO',quote:'If the cup has a cracked rim, remove the lid and submit a photograph of the damaged rim and the lot code.'},
    {kind:'CONFIRMATION',quote:"If you disposed of the cup, attest that you followed the disposal instructions on the firm's website."},
    {kind:'TEXT',quote:'Where the label is unreadable, provide the serial number printed on the base.'},
  ]);
  const result=validateSourceSuggestion(raw,source);
  assert.equal(result.filtered.length,0);
  assert.deepEqual(result.requirements.map(f=>f.kind),['PHOTO','CONFIRMATION','TEXT']);
  assert.match(result.requirements[0].quote,/If the cup has a cracked rim/);
  assert.match(result.requirements[2].quote,/Where the label is unreadable/);
});

test('the assistant prompt carries positive and negative examples for each response type',()=>{
  assert.match(sourcePrompt,/Positive examples/);
  assert.match(sourcePrompt,/Negative examples/);
  assert.match(sourcePrompt,/remove all drawers/);
  assert.match(sourcePrompt,/attest to proper disposal/);
  assert.match(sourcePrompt,/Submit a disposal attestation/);
  assert.match(sourcePrompt,/batch number printed on the base/);
  assert.match(sourcePrompt,/include every condition, preparation step and destination/i);
  assert.doesNotMatch(sourcePrompt,/smallest/i);
  assert.match(sourcePrompt,/do not quote a fragment/i);
  assert.match(sourcePrompt,/Stop-use advice is not an attestation request/);
});

test('manual exact-source selections are not restricted by assistant response-type rules',async()=>{
  const manual=validateManualField({kind:'TEXT',quote:'Register at example.com to receive your refund.'},notice(['Register at example.com to receive your refund.'],'27-098'));
  assert.equal(manual.kind,'TEXT');
  const db=new DatabaseSync(':memory:');
  const source=notice(['Register at example.com to receive your refund.'],'27-098');
  const ws=new SourceWorkspace(db,{loadSource:async()=>structuredClone(source),ai:{status:()=>({available:true,model:'test-double'}),generate:async()=>draft([])}});
  const row=await ws.import('27098');
  const amended=ws.addField(row.id,{revision:row.revision,kind:'TEXT',quote:source.remedies[0]});
  assert.equal(amended.suggestion.requirements[0].kind,'TEXT');
  assert.equal(amended.suggestion.requirements[0].origin,'MERCHANT_SOURCE_SELECTION');
  db.close();
});

test('a saved draft reports filtered fields so the setup never implies completeness',async()=>{
  const source=notice([
    'Consumers should submit a photograph with the word "RECALL" written on the front of the crystal cup in permanent black marker.',
    'Consumers should attest to proper disposal of the recalled cup following the instructions on the firm\'s website.',
    'Register at example.com to receive your refund.',
    'Consumers should stop using the recalled cup immediately.',
  ],'27-026');
  const db=new DatabaseSync(':memory:');
  const ws=new SourceWorkspace(db,{loadSource:async()=>structuredClone(source),ai:{status:()=>({available:true,model:'test-double'}),generate:async()=>draft([
    {kind:'PHOTO',quote:source.remedies[0]},
    {kind:'CONFIRMATION',quote:source.remedies[1]},
    {kind:'TEXT',quote:source.remedies[2]},
    {kind:'TEXT',quote:source.remedies[3]},
  ])}});
  const imported=await ws.import('27026');
  const row=await ws.suggest(imported.id,1);
  assert.equal(row.suggestion.requirements.length,2);
  assert.equal(row.suggestion.filtered.length,2);
  assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO','CONFIRMATION']);
  const reviewed=ws.review(row.id,{revision:row.revision,fieldIds:row.suggestion.requirements.map(f=>f.id),confirmed:true});
  assert.equal(reviewed.review.fields.length,2);
  db.close();
});

test('type checks allow stop-use dates, delivery destinations and disposal attestations',()=>{
  const source=notice([
    'Provide the date you stopped using the product.',
    'Send a photograph to recall@example.com showing the marked cup.',
    "Attest that you disposed of the cup following the instructions at https://example.com/disposal.",
  ],'27-097');
  const raw=draft([
    {kind:'TEXT',quote:'Provide the date you stopped using the product.'},
    {kind:'PHOTO',quote:'Send a photograph to recall@example.com showing the marked cup.'},
    {kind:'CONFIRMATION',quote:'Attest that you disposed of the cup following the instructions at https://example.com/disposal.'},
  ]);
  const result=validateSourceSuggestion(raw,source);
  assert.equal(result.filtered.length,0);
  assert.deepEqual(result.requirements.map(f=>f.kind),['TEXT','PHOTO','CONFIRMATION']);
});

test('noun-form disposal attestations and batch-number requests survive response typing',()=>{
  const source=notice([
    "Submit a disposal attestation through the firm's website.",
    'Send the batch number printed on the base.',
  ],'27-096');
  const raw=draft([
    {kind:'CONFIRMATION',quote:"Submit a disposal attestation through the firm's website."},
    {kind:'TEXT',quote:'Send the batch number printed on the base.'},
  ]);
  const result=validateSourceSuggestion(raw,source);
  assert.equal(result.filtered.length,0);
  assert.deepEqual(result.requirements.map(f=>f.kind),['CONFIRMATION','TEXT']);
  assert.match(result.requirements[0].quote,/attestation/);
  assert.match(result.requirements[1].quote,/batch number/);
});

test('duplicate model quotations are filtered after response typing instead of discarding the draft',()=>{
  const remedy='Consumers should submit a photograph with the word "RECALL" written on the front of the crystal cup in permanent black marker. Consumers should attest to proper disposal of the recalled cup following the instructions on the firm\'s website.';
  const source=notice([remedy],'27-026');
  const photo='Consumers should submit a photograph with the word "RECALL" written on the front of the crystal cup in permanent black marker.';
  const disposal='Consumers should attest to proper disposal of the recalled cup following the instructions on the firm\'s website.';
  const result=validateSourceSuggestion(draft([
    {kind:'TEXT',quote:photo},
    {kind:'PHOTO',quote:photo},
    {kind:'CONFIRMATION',quote:disposal},
  ]),source);
  assert.deepEqual(result.requirements.map(f=>f.kind),['PHOTO','CONFIRMATION']);
  assert.equal(result.filtered.length,1);
  const duplicate=validateSourceSuggestion(draft([
    {kind:'PHOTO',quote:photo},
    {kind:'PHOTO',quote:photo},
  ]),source);
  assert.equal(duplicate.requirements.length,1);
  assert.equal(duplicate.filtered.length,1);
  assert.match(duplicate.filtered[0].reason,/Duplicate response/);
});

test('held-out live fragments expand to their complete conditions and destinations',()=>{
  const remedy='If the label is damaged, remove the outer sleeve and email a photograph of the serial plate and the broken latch to recalls@example.invalid. Customers must attest that they followed the disposal instructions at https://example.invalid/return. If the serial plate cannot be photographed, enter the serial number printed on the receipt.';
  const source=notice([remedy],'27-095');
  const fragments=validateSourceSuggestion(draft([
    {kind:'PHOTO',quote:'email a photograph of the serial plate and the broken latch'},
    {kind:'CONFIRMATION',quote:'attest that they followed the disposal instructions at https://example.invalid/return'},
    {kind:'TEXT',quote:'enter the serial number printed on the receipt'},
  ]),source);
  assert.equal(fragments.filtered.length,0);
  assert.deepEqual(fragments.requirements.map(f=>f.kind),['PHOTO','CONFIRMATION','TEXT']);
  assert.match(fragments.requirements[0].quote,/If the label is damaged, remove the outer sleeve/);
  assert.match(fragments.requirements[0].quote,/recalls@example.invalid/);
  assert.match(fragments.requirements[1].quote,/Customers must attest/);
  assert.match(fragments.requirements[1].quote,/https:\/\/example.invalid\/return/);
  assert.match(fragments.requirements[2].quote,/If the serial plate cannot be photographed/);
});

test('an ambiguous fragment is filtered with guidance rather than guessed into one sentence',()=>{
  const source=notice([
    'Provide the batch number printed on the base. If the label is missing, provide the batch number printed on the base.',
  ],'27-094');
  const result=validateSourceSuggestion(draft([
    {kind:'TEXT',quote:'batch number printed on the base'},
  ]),source);
  assert.equal(result.requirements.length,0);
  assert.equal(result.filtered.length,1);
  assert.match(result.filtered[0].reason,/one complete source sentence/);
});

test('a compound instruction can carry a photograph and an explicit attestation for the same quotation',async()=>{
  const compound='Submit a photograph of the marked cup and attest that you disposed of it according to the posted instructions.';
  const source=notice([compound],'27-093');
  const result=validateSourceSuggestion(draft([
    {kind:'PHOTO',quote:compound},
    {kind:'CONFIRMATION',quote:compound},
  ]),source);
  assert.equal(result.filtered.length,0);
  assert.deepEqual(result.requirements.map(f=>f.kind),['PHOTO','CONFIRMATION']);

  const duplicate=validateSourceSuggestion(draft([
    {kind:'PHOTO',quote:compound},
    {kind:'PHOTO',quote:compound},
  ]),source);
  assert.equal(duplicate.requirements.length,1);
  assert.equal(duplicate.filtered.length,1);
  assert.match(duplicate.filtered[0].reason,/Duplicate response/);

  const db=new DatabaseSync(':memory:');
  const ws=new SourceWorkspace(db,{loadSource:async()=>structuredClone(source),ai:{status:()=>({available:true,model:'test-double'}),generate:async()=>draft([{kind:'PHOTO',quote:compound}])}});
  let row=await ws.import('27093');
  row=ws.addField(row.id,{revision:row.revision,kind:'PHOTO',quote:compound});
  row=ws.addField(row.id,{revision:row.revision,kind:'CONFIRMATION',quote:compound});
  assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO','CONFIRMATION']);
  assert.throws(()=>ws.addField(row.id,{revision:row.revision,kind:'CONFIRMATION',quote:compound}),/Choose a new requirement/);
  row=await ws.suggest(row.id,row.revision);
  assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO','CONFIRMATION']);
  db.close();
});
