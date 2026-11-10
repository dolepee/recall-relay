import test from 'node:test';
import assert from 'node:assert/strict';
import {SourceWorkspace} from '../src/source-workspace.mjs';
import {assertExecutableCampaign,sourceInstructionProfile} from '../src/source-policy.mjs';
import {sourceDraftInput} from '../src/source-extraction.mjs';
import {ClaimDesk} from '../src/claims.mjs';

const source=remedies=>({title:'Synthetic completeness test',recallNumber:'TEST',sourceDigest:'c'.repeat(64),sourceUrl:'https://example.invalid/fixture',route:'ORIGINAL_PAYMENT_CANDIDATE',remedies});
function fixture(quote,kinds){
  const remedies=Array.isArray(quote)?quote:[quote];
  const clauses=sourceDraftInput({remedies}).clauses;
  const values=Array.isArray(kinds[0])?kinds:[kinds];
  const byClause=clauses.map((_,index)=>values[index]||[]);
  const desk=new ClaimDesk({path:':memory:',provider:async()=>{throw new Error('No provider call');}});
  const ws=new SourceWorkspace(desk.db,{loadSource:async()=>source(remedies),ai:{status:()=>({available:true,model:'controlled'}),generate:async()=>JSON.stringify({clauses:clauses.map((clause,index)=>({clauseId:clause.clauseId,kinds:byClause[index]}))})}});
  return {desk,ws};
}
function reviewAll(ws,row,decisions=[]){
  return ws.review(row.id,{revision:row.revision,fieldIds:row.suggestion.requirements.map(f=>f.id),confirmed:true,clauseDecisions:decisions});
}
function activate(ws,row,desk){
  return ws.activate(row.id,{revision:row.revision,sku:'CUP',lot:'LOT-A',confirmed:true},desk);
}

for(const [name,quote] of [
  ['order number','Upload a photograph of the item and submit your order number.'],
  ['address','Upload a photograph of the item and submit your address.'],
]){
  test(`photo plus ${name}: both responses survive to publication`,async()=>{
    const {desk,ws}=fixture(quote,['PHOTO','TEXT']);
    try{
      let row=await ws.suggest((await ws.import('TEST')).id,1);
      assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO','TEXT']);
      row=reviewAll(ws,row);
      assert.equal(row.review.coverage[0].disposition,'FIELD');
      assert.ok(activate(ws,row,desk).publishedCampaign);
    }finally{desk.close();}
  });

  test(`photo plus ${name}: photo-only is unresolved and an INFORMATION note cannot waive it`,async()=>{
    const {desk,ws}=fixture(quote,['PHOTO']);
    try{
      let row=await ws.suggest((await ws.import('TEST')).id,1);
      assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO']);
      row=reviewAll(ws,row,[{id:'clause-0-0',disposition:'INFORMATION',reason:'This does not make the missing written response optional.'}]);
      assert.equal(row.review.coverage[0].disposition,'UNRESOLVED');
      assert.deepEqual(row.review.coverage[0].missingKinds,['TEXT']);
      assert.throws(()=>activate(ws,row,desk),/missing responses|manual|unresolved/i);
    }finally{desk.close();}
  });

  test(`photo plus ${name}: manual TEXT addition completes the form`,async()=>{
    const {desk,ws}=fixture(quote,['PHOTO']);
    try{
      let row=await ws.suggest((await ws.import('TEST')).id,1);
      row=ws.addField(row.id,{revision:row.revision,kind:'TEXT',quote});
      row=reviewAll(ws,row);
      assert.equal(row.review.coverage[0].disposition,'FIELD');
      assert.ok(activate(ws,row,desk).publishedCampaign);
    }finally{desk.close();}
  });
}

test('Provide proof of purchase is a canonical TEXT response',async()=>{
  const quote='Provide proof of purchase.';
  const {desk,ws}=fixture(quote,['TEXT']);
  try{
    let row=await ws.suggest((await ws.import('TEST')).id,1);
    assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['TEXT']);
    assert.equal(row.suggestion.filtered.length,0);
    assert.equal(ws.get(row.id).suggestion.requirements[0].kind,'TEXT');
  }finally{desk.close();}
});

test('a value only pictured on the label does not create a separate TEXT requirement',async()=>{
  const quote='Upload one photograph of the label showing your name and the date written on the product.';
  const {desk,ws}=fixture(quote,['TEXT','PHOTO']);
  try{
    let row=await ws.suggest((await ws.import('TEST')).id,1);
    assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO']);
    assert.equal(row.suggestion.filtered.length,1);
    assert.match(row.suggestion.filtered[0].reason,/written field|photograph/i);
    row=reviewAll(ws,row);
    assert.equal(row.review.coverage[0].disposition,'FIELD');
    assert.ok(activate(ws,row,desk).publishedCampaign);
  }finally{desk.close();}
});

test('a rejected proposal cannot leave coverage FIELD',async()=>{
  const quote='Upload a photograph of the item and submit your order number.';
  const {desk,ws}=fixture(quote,['CONFIRMATION']);
  try{
    let row=await ws.suggest((await ws.import('TEST')).id,1);
    assert.deepEqual(row.suggestion.requirements,[]);
    assert.equal(row.suggestion.filtered.length,1);
    row=reviewAll(ws,row);
    assert.notEqual(row.review.coverage[0].disposition,'FIELD');
    assert.throws(()=>activate(ws,row,desk),/missing responses|manual|unresolved/i);
  }finally{desk.close();}
});

test('ordinary informational narratives remain publishable beside a valid photo',async()=>{
  for(const narrative of ['The manufacturer will send a confirmation email.','The manufacturer will also send a confirmation email.','The manufacturer will then send a confirmation email.','The manufacturer will promptly send a confirmation email.','The retailer will automatically send a receipt.','The manufacturer will send a confirmation email; the retailer will send a receipt.','The manufacturer will send a confirmation email and the retailer will send a receipt.','Refunds take six weeks.','Refunds take 4-6 weeks.','The retailer will still send a receipt.','Payments take 4–6 weeks.']){
    const quote='Upload a photograph of the item.';
    const {desk,ws}=fixture([quote,narrative],[[ 'PHOTO' ],[]]);
    try{
      let row=await ws.suggest((await ws.import('TEST')).id,1);
      assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO'],narrative);
      row=reviewAll(ws,row,[{id:'clause-1-0',disposition:'INFORMATION',reason:'Business notification or settlement timing; no customer response requested.'}]);
      assert.equal(row.review.coverage[1].disposition,'INFORMATION',narrative);
      assert.ok(activate(ws,row,desk).publishedCampaign,narrative);
    }finally{desk.close();}
  }
});

test('INFORMATION cannot waive a customer take-to-store handoff',async()=>{
  for(const handoff of ['Take the product to the store.','Take the product to the retailer.']){
    const {desk,ws}=fixture(['Upload a photograph of the item.',handoff],[['PHOTO'],[]]);
    try{
      let row=await ws.suggest((await ws.import('TEST')).id,1);
      row=reviewAll(ws,row,[{id:'clause-1-0',disposition:'INFORMATION',reason:'Attempt to waive a physical handoff.'}]);
      assert.equal(row.review.coverage[1].disposition,'MANUAL',handoff);
      assert.throws(()=>activate(ws,row,desk),/manual|handoff|photograph/i,handoff);
    }finally{desk.close();}
  }
});

test('unknown customer-shaped prefixes fail closed instead of becoming INFORMATION',async()=>{
  for(const instruction of ['Carefully upload a photograph of the item.','Kindly submit your order number.']){
    const {desk,ws}=fixture(['Upload a photograph of the item.',instruction],[['PHOTO'],[]]);
    try{
      let row=await ws.suggest((await ws.import('TEST')).id,1);
      row=reviewAll(ws,row,[{id:'clause-1-0',disposition:'INFORMATION',reason:'Attempt to waive an unsupported customer instruction.'}]);
      assert.equal(row.review.coverage[1].disposition,'MANUAL',instruction);
      assert.throws(()=>activate(ws,row,desk),/manual|unsupported/i,instruction);
    }finally{desk.close();}
  }
});

test('a later implicit imperative after a business narrative does not inherit its subject',async()=>{
  for(const instruction of ['The manufacturer will send a confirmation email; provide your order number.','The manufacturer will send a confirmation email; send your order number.']){
    const {desk,ws}=fixture(['Upload a photograph of the item.',instruction],[['PHOTO'],[]]);
    try{
      let row=await ws.suggest((await ws.import('TEST')).id,1);
      row=reviewAll(ws,row,[{id:'clause-1-0',disposition:'INFORMATION',reason:'Attempt to waive a later implicit customer imperative.'}]);
      assert.equal(row.review.coverage[1].disposition,'MANUAL',instruction);
      assert.throws(()=>activate(ws,row,desk),/manual|unsupported/i,instruction);
    }finally{desk.close();}
  }
});

test('business nouns in a customer instruction are not positive business subjects',async()=>{
  for(const instruction of ['Contact the manufacturer and provide your order number.','Speak to the retailer and provide your order number.']){
    const {desk,ws}=fixture(['Upload a photograph of the item.',instruction],[['PHOTO'],[]]);
    try{
      let row=await ws.suggest((await ws.import('TEST')).id,1);
      row=reviewAll(ws,row,[{id:'clause-1-0',disposition:'INFORMATION',reason:'Attempt to waive a customer instruction that mentions a business as its object.'}]);
      assert.equal(row.review.coverage[1].disposition,'MANUAL',instruction);
      assert.throws(()=>activate(ws,row,desk),/manual|unsupported/i,instruction);
    }finally{desk.close();}
  }
});

test('every parser connector after a completed business action keeps a later imperative manual',async()=>{
  for(const connector of [';','and','then','also']){
    for(const verb of ['provide','send']){
      const instruction=`The manufacturer will send a confirmation email ${connector} ${verb} your order number.`;
      const {desk,ws}=fixture(['Upload a photograph of the item.',instruction],[['PHOTO'],[]]);
      try{
        let row=await ws.suggest((await ws.import('TEST')).id,1);
        row=reviewAll(ws,row,[{id:'clause-1-0',disposition:'INFORMATION',reason:'Attempt to waive a later imperative after a completed business action.'}]);
        assert.equal(row.review.coverage[1].disposition,'MANUAL',instruction);
        assert.throws(()=>activate(ws,row,desk),/manual|unsupported/i,instruction);
      }finally{desk.close();}
    }
  }
});

test('a later explicit customer instruction after a business narrative remains accounted and manual',async()=>{
  const quote='The manufacturer will also send a confirmation email, then consumers must upload a photograph.';
  const {desk,ws}=fixture(quote,['PHOTO']);
  try{
    let row=await ws.suggest((await ws.import('TEST')).id,1);
    assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO']);
    row=reviewAll(ws,row);
    assert.equal(row.review.coverage[0].disposition,'MANUAL');
    assert.throws(()=>activate(ws,row,desk),/manual|handoff/i);
  }finally{desk.close();}
});

test('a supported whole controlled notice keeps every response and allows INFORMATION narratives',async()=>{
  const notice=[
    'Upload a photograph of the item and submit your order number.',
    'The manufacturer will send a confirmation email.',
    'Refunds take six weeks.',
  ];
  const {desk,ws}=fixture(notice,[['PHOTO','TEXT'],[],[]]);
  try{
    let row=await ws.suggest((await ws.import('TEST')).id,1);
    assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO','TEXT']);
    row=reviewAll(ws,row,[{id:'clause-1-0',disposition:'INFORMATION',reason:'Business notification; no customer response requested.'},{id:'clause-2-0',disposition:'INFORMATION',reason:'Settlement timing only; no customer response requested.'}]);
    assert.equal(row.review.coverage[1].disposition,'INFORMATION');
    assert.equal(row.review.coverage[2].disposition,'INFORMATION');
    assert.ok(activate(ws,row,desk).publishedCampaign);
  }finally{desk.close();}
});

test('values explicitly printed inside the photo object do not create TEXT',async()=>{
  const quote='Take a photograph of your name and address printed on the label.';
  const {desk,ws}=fixture(quote,['PHOTO']);
  try{
    let row=await ws.suggest((await ws.import('TEST')).id,1);
    assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO']);
    assert.deepEqual(sourceInstructionProfile(quote).kinds,['PHOTO']);
    row=reviewAll(ws,row);
    assert.equal(row.review.coverage[0].disposition,'FIELD');
    assert.ok(activate(ws,row,desk).publishedCampaign);
  }finally{desk.close();}
});

test('a waived nominal confirmation remains informational',async()=>{
  const quote='No confirmation is required.';
  const {desk,ws}=fixture(['Upload a photograph of the item.',quote],[['PHOTO'],[]]);
  try{
    let row=await ws.suggest((await ws.import('TEST')).id,1);
    assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO']);
    assert.deepEqual(sourceInstructionProfile(quote).kinds,[]);
    row=reviewAll(ws,row,[{id:'clause-1-0',disposition:'INFORMATION',reason:'The source explicitly waives confirmation.'}]);
    assert.equal(row.review.coverage[1].disposition,'INFORMATION');
    assert.ok(activate(ws,row,desk).publishedCampaign);
  }finally{desk.close();}
});

test('nominal confirmation obligations survive tense changes and future waivers stay informational',async()=>{
  for(const quote of ['Your disposal attestation will be required.','Your confirmation must be provided.','Your confirmation must be received by the manufacturer.','Your confirmation is mandatory.','Your confirmation will be needed.','Your confirmation will be sent.','Your confirmation has been sent.']){
    const {desk,ws}=fixture(['Upload a photograph of the item.',quote],[['PHOTO'],['CONFIRMATION']]);
    try{
      let row=await ws.suggest((await ws.import('TEST')).id,1);
      assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO','CONFIRMATION'],quote);
      row=reviewAll(ws,row,[{id:'clause-1-0',disposition:'INFORMATION',reason:'Attempt to waive a nominal confirmation obligation.'}]);
      assert.equal(row.review.coverage[1].disposition,'MANUAL',quote);
      assert.throws(()=>activate(ws,row,desk),/manual|missing|unresolved/i,quote);
    }finally{desk.close();}
  }
  for(const quote of ['No confirmation will be required.','Confirmation will not be required.']){
    const {desk,ws}=fixture(['Upload a photograph of the item.',quote],[['PHOTO'],[]]);
    try{
      let row=await ws.suggest((await ws.import('TEST')).id,1);
      assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO'],quote);
      assert.deepEqual(sourceInstructionProfile(quote).kinds,[],quote);
      row=reviewAll(ws,row,[{id:'clause-1-0',disposition:'INFORMATION',reason:'The source explicitly waives confirmation in the future.'}]);
      assert.equal(row.review.coverage[1].disposition,'INFORMATION',quote);
      assert.ok(activate(ws,row,desk).publishedCampaign,quote);
    }finally{desk.close();}
  }
});

test('an incoming confirmation via email stays informational while customer email submission stays blocked',async()=>{
  const positive='Consumers will receive a confirmation via email.';
  {
    const {desk,ws}=fixture(['Upload a photograph of the item.',positive],[['PHOTO'],[]]);
    try{
      let row=await ws.suggest((await ws.import('TEST')).id,1);
      assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO']);
      assert.deepEqual(sourceInstructionProfile(positive).kinds,[]);
      row=reviewAll(ws,row,[{id:'clause-1-0',disposition:'INFORMATION',reason:'Incoming confirmation notification; no customer response requested.'}]);
      assert.equal(row.review.coverage[1].disposition,'INFORMATION');
      assert.ok(activate(ws,row,desk).publishedCampaign);
    }finally{desk.close();}
  }
  {
    const negative='Submit your confirmation via email.';
    const {desk,ws}=fixture(['Upload a photograph of the item.',negative],[['PHOTO'],[]]);
    try{
      let row=await ws.suggest((await ws.import('TEST')).id,1);
      row=reviewAll(ws,row,[{id:'clause-1-0',disposition:'INFORMATION',reason:'Attempt to waive an email submission.'}]);
      assert.equal(row.review.coverage[1].disposition,'MANUAL');
      assert.throws(()=>activate(ws,row,desk),/manual|email|handoff|unresolved/i);
    }finally{desk.close();}
  }
});

test('a confirmation received by the manufacturer remains a manual handoff',async()=>{
  const quote='Your confirmation must be received by the manufacturer.';
  const {desk,ws}=fixture(['Upload a photograph of the item.',quote],[['PHOTO'],['CONFIRMATION']]);
  try{
    let row=await ws.suggest((await ws.import('TEST')).id,1);
    assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO','CONFIRMATION']);
    row=reviewAll(ws,row,[{id:'clause-1-0',disposition:'INFORMATION',reason:'Attempt to waive the manufacturer handoff.'}]);
    assert.equal(row.review.coverage[1].disposition,'MANUAL');
    assert.throws(()=>activate(ws,row,desk),/manual|missing|unresolved/i);
  }finally{desk.close();}
});

test('known incoming confirmation notifications stay informational',async()=>{
  for(const quote of ['Your confirmation has been sent by the manufacturer.','Your confirmation will be issued by the manufacturer.','Your confirmation will be sent to you.','You will receive a confirmation.']){
    const {desk,ws}=fixture(['Upload a photograph of the item.',quote],[['PHOTO'],[]]);
    try{
      let row=await ws.suggest((await ws.import('TEST')).id,1);
      assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO'],quote);
      assert.deepEqual(sourceInstructionProfile(quote).kinds,[],quote);
      row=reviewAll(ws,row,[{id:'clause-1-0',disposition:'INFORMATION',reason:'Known incoming notification; no customer response requested.'}]);
      assert.equal(row.review.coverage[1].disposition,'INFORMATION',quote);
      assert.ok(activate(ws,row,desk).publishedCampaign,quote);
    }finally{desk.close();}
  }
});

test('a pictured modifier does not cross any hard clause boundary',async()=>{
  for(const quote of [
    'Include a photograph of the label showing the serial number; your order number.',
    'Include a photograph of the label showing the serial number; your name and address.',
    'Include a photograph of the label showing the serial number; your name; your order number.',
    'Include a photograph of the label showing the serial number; your order number printed on the label.',
  ]){
    const {desk,ws}=fixture(['Upload a photograph of the item.',quote],[['PHOTO'],['PHOTO']]);
    try{
      let row=await ws.suggest((await ws.import('TEST')).id,1);
      assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO','PHOTO'],quote);
      row=reviewAll(ws,row,[{id:'clause-1-0',disposition:'INFORMATION',reason:'Attempt to waive the later written object.'}]);
      assert.notEqual(row.review.coverage[1].disposition,'FIELD',quote);
      assert.notEqual(row.review.coverage[1].disposition,'INFORMATION',quote);
      assert.throws(()=>activate(ws,row,desk),/manual|missing|unresolved/i,quote);
    }finally{desk.close();}
  }
});

test('a positive attestation survives a separate confirmation waiver',async()=>{
  const quote='No confirmation is required, but your disposal attestation is required.';
  assert.deepEqual(sourceInstructionProfile(quote).kinds,['CONFIRMATION']);
  const {desk,ws}=fixture(['Upload a photograph of the item.',quote],[['PHOTO'],[]]);
  try{
    let row=await ws.suggest((await ws.import('TEST')).id,1);
    row=reviewAll(ws,row,[{id:'clause-1-0',disposition:'INFORMATION',reason:'Attempt to waive the surviving attestation.'}]);
    assert.notEqual(row.review.coverage[1].disposition,'INFORMATION');
    assert.throws(()=>activate(ws,row,desk),/manual|missing|unresolved|unsupported/i);
  }finally{desk.close();}
});

test('a coordinated written object after a photo retains a TEXT obligation',async()=>{
  for(const quote of ['Include a photograph of the label and your order number.','Supply a photograph of the label, your name and address.']){
    const {desk,ws}=fixture(['Upload a photograph of the item.',quote],[['PHOTO'],['PHOTO']]);
    try{
      let row=await ws.suggest((await ws.import('TEST')).id,1);
      assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO','PHOTO'],quote);
      row=reviewAll(ws,row,[{id:'clause-1-0',disposition:'INFORMATION',reason:'Attempt to publish a photo while omitting the written object.'}]);
      assert.notEqual(row.review.coverage[1].disposition,'FIELD',quote);
      assert.notEqual(row.review.coverage[1].disposition,'INFORMATION',quote);
      assert.throws(()=>activate(ws,row,desk),/manual|missing|unresolved/i,quote);
    }finally{desk.close();}
  }
});

test('a label showing a written value remains pictured evidence only',async()=>{
  const quote='Include a photograph of the label showing your order number.';
  const {desk,ws}=fixture(quote,['PHOTO']);
  try{
    let row=await ws.suggest((await ws.import('TEST')).id,1);
    assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO']);
    row=reviewAll(ws,row);
    assert.equal(row.review.coverage[0].disposition,'FIELD');
    assert.ok(activate(ws,row,desk).publishedCampaign);
  }finally{desk.close();}
});

test('a compound photo-object name is never a TEXT request',async()=>{
  for(const verb of ['Include','Supply','Provide','Send','Submit']){
    for(const noun of ['photograph','photo','image','picture']){
      const quote=`${verb} two order number ${noun}s.`;
      const {desk,ws}=fixture(['Upload a photograph of the item.',quote],[['PHOTO'],['TEXT']]);
      try{
        let row=await ws.suggest((await ws.import('TEST')).id,1);
        assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO'],quote);
        assert.equal(row.suggestion.filtered.length,1,quote);
        row=reviewAll(ws,row,[{id:'clause-1-0',disposition:'INFORMATION',reason:'Attempt to turn a compound photo name into text.'}]);
        assert.equal(row.review.coverage[1].disposition,'MANUAL',quote);
        assert.throws(()=>activate(ws,row,desk),/manual|photograph|missing|unsupported/i,quote);
      }finally{desk.close();}
    }
  }
});

test('unknown non-waived nominals remain manual without a pronoun',async()=>{
  for(const quote of ['Disposal attestation is essential.','Your disposal attestation is essential.']){
    assert.deepEqual(sourceInstructionProfile(quote).kinds,['CONFIRMATION'],quote);
    const {desk,ws}=fixture(['Upload a photograph of the item.',quote],[['PHOTO'],['CONFIRMATION']]);
    try{
      let row=await ws.suggest((await ws.import('TEST')).id,1);
      assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO','CONFIRMATION'],quote);
      row=reviewAll(ws,row,[{id:'clause-1-0',disposition:'INFORMATION',reason:'Attempt to waive an unknown positive nominal.'}]);
      assert.equal(row.review.coverage[1].disposition,'MANUAL',quote);
      assert.throws(()=>activate(ws,row,desk),/manual|missing|unresolved/i,quote);
    }finally{desk.close();}
  }
});

test('a parsed text request does not gain an extra confirmation kind',()=>{
  assert.deepEqual(sourceInstructionProfile('Enter confirmation number.').kinds,['TEXT']);
});

test('mandatory noun-form attestations remain obligations and cannot be waived',async()=>{
  const quote='Your disposal attestation is required.';
  const {desk,ws}=fixture(['Upload a photograph of the item.',quote],[['PHOTO'],['CONFIRMATION']]);
  try{
    let row=await ws.suggest((await ws.import('TEST')).id,1);
    assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO','CONFIRMATION']);
    assert.equal(row.suggestion.filtered.length,0);
    row=reviewAll(ws,row,[{id:'clause-1-0',disposition:'INFORMATION',reason:'Attempt to waive a mandatory attestation.'}]);
    assert.equal(row.review.coverage[1].disposition,'MANUAL');
    assert.throws(()=>activate(ws,row,desk),/manual|missing|unresolved/i);
  }finally{desk.close();}
});

test('a misproposed TEXT for a multi-photo instruction cannot bypass the photo guard',async()=>{
  const {desk,ws}=fixture(['Upload a photograph of the item.','Include two photographs of the label.'],[['PHOTO'],['TEXT']]);
  try{
    let row=await ws.suggest((await ws.import('TEST')).id,1);
    assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO']);
    assert.equal(row.suggestion.filtered.length,1);
    row=reviewAll(ws,row,[{id:'clause-1-0',disposition:'INFORMATION',reason:'Attempt to waive a second photograph as text.'}]);
    assert.equal(row.review.coverage[1].disposition,'MANUAL');
    assert.throws(()=>activate(ws,row,desk),/manual|photograph|missing/i);
  }finally{desk.close();}
});

test('ambiguous supply/include/provide/send/submit verbs classify a singular photo correctly',async()=>{
  for(const verb of ['Include','Supply','Provide','Send','Submit']){
    const quote=`${verb} a photograph of the label.`;
    const {desk,ws}=fixture(quote,['PHOTO']);
    try{
      let row=await ws.suggest((await ws.import('TEST')).id,1);
      assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO'],quote);
      row=reviewAll(ws,row);
      assert.equal(row.review.coverage[0].disposition,'FIELD',quote);
      assert.ok(activate(ws,row,desk).publishedCampaign,quote);
    }finally{desk.close();}
  }
});

test('ambiguous supply/include/provide/send/submit multiple-photo instructions stay manual',async()=>{
  for(const verb of ['Include','Supply','Provide','Send','Submit']){
    const quote=`${verb} two photographs of the label.`;
    const {desk,ws}=fixture(['Upload a photograph of the item.',quote],[['PHOTO'],['TEXT']]);
    try{
      let row=await ws.suggest((await ws.import('TEST')).id,1);
      assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO'],quote);
      assert.equal(row.suggestion.filtered.length,1,quote);
      row=reviewAll(ws,row,[{id:'clause-1-0',disposition:'INFORMATION',reason:'Attempt to waive multiple photographs as text.'}]);
      assert.equal(row.review.coverage[1].disposition,'MANUAL',quote);
      assert.throws(()=>activate(ws,row,desk),/manual|photograph|missing/i,quote);
    }finally{desk.close();}
  }
});

test('a written value shown in a photograph remains TEXT',async()=>{
  for(const quote of ['Provide the lot number shown in the photograph.','Describe the lot number shown in the photograph.','Enter the lot number shown in the photograph.']){
    const {desk,ws}=fixture(['Upload a photograph of the item.',quote],[['PHOTO'],['TEXT']]);
    try{
      let row=await ws.suggest((await ws.import('TEST')).id,1);
      assert.deepEqual(row.suggestion.requirements.map(f=>f.kind),['PHOTO','TEXT'],quote);
      row=reviewAll(ws,row);
      assert.equal(row.review.coverage[1].disposition,'FIELD',quote);
      assert.ok(activate(ws,row,desk).publishedCampaign,quote);
    }finally{desk.close();}
  }
});

test('the canonical response change requires a fresh review of older published sources',()=>{
  assert.throws(()=>assertExecutableCampaign({sourceDigest:'fixture',sourcePolicyVersion:8,sourceRemedies:['Upload a photograph of the item and submit your order number.'],fields:[{id:'p',kind:'PHOTO',quote:'Upload a photograph of the item and submit your order number.'}]}),/Review and republish/);
});
