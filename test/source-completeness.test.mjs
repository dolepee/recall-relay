import test from 'node:test';
import assert from 'node:assert/strict';
import {SourceWorkspace} from '../src/source-workspace.mjs';
import {assertExecutableCampaign} from '../src/source-policy.mjs';
import {ClaimDesk} from '../src/claims.mjs';

const source=quote=>({title:'Synthetic completeness test',recallNumber:'TEST',sourceDigest:'c'.repeat(64),sourceUrl:'https://example.invalid/fixture',route:'ORIGINAL_PAYMENT_CANDIDATE',remedies:[quote]});
function fixture(quote,kinds){
  const desk=new ClaimDesk({path:':memory:',provider:async()=>{throw new Error('No provider call');}});
  const ws=new SourceWorkspace(desk.db,{loadSource:async()=>source(quote),ai:{status:()=>({available:true,model:'controlled'}),generate:async()=>JSON.stringify({clauses:[{clauseId:'clause-0-0',kinds}]})}});
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

test('the canonical response change requires a fresh review of older published sources',()=>{
  assert.throws(()=>assertExecutableCampaign({sourceDigest:'fixture',sourcePolicyVersion:8,sourceRemedies:['Upload a photograph of the item and submit your order number.'],fields:[{id:'p',kind:'PHOTO',quote:'Upload a photograph of the item and submit your order number.'}]}),/Review and republish/);
});
