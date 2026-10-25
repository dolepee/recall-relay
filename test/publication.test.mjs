import test from 'node:test';
import assert from 'node:assert/strict';
import {campaignIdFor,setupCampaignId,publicationState,publicationNotice,activeScenarioLabel,beginPublicationFocus} from '../src/publication.mjs';

const row=(recallNumber,digest,publishedCampaign)=>({source:{recallNumber},review:{digest},...(publishedCampaign?{publishedCampaign}:{})});
const digest=n=>String(n).repeat(64).slice(0,64);
const A=row('27026',digest('a'),{id:campaignIdFor('27026',digest('a')),sku:'FIXTURE-A',lot:'LOT-A'});
const B=row('27027',digest('b'),{id:campaignIdFor('27027',digest('b')),sku:'FIXTURE-B',lot:'LOT-B'});
const activeFor=(r,sku,lot)=>({id:setupCampaignId(r),sku,lot,product:'Fixture product',title:'Sandbox scenario'});

test('a previously published setup is not currently published once another scenario is active',()=>{
  const active=activeFor(B,'FIXTURE-B','LOT-B');
  const state=publicationState(A,active,{sku:'FIXTURE-A',lot:'LOT-A'});
  assert.equal(state.active,false);
  assert.equal(state.publishedBefore,true);
  assert.equal(state.code,'PUBLISHED_EARLIER');
  assert.equal(state.sameFields,false);
  // The setup keeps its historical record; only the presentation is derived from the active campaign.
  assert.equal(A.publishedCampaign.id,campaignIdFor('27026',digest('a')));
  assert.equal(publicationState(B,active,{sku:'FIXTURE-B',lot:'LOT-B'}).code,'ACTIVE');
});

test('a matching campaign id is not enough: the active product and lot must match too',()=>{
  // Same recall number and same reviewed digest, so the id is identical, but the active
  // scenario carries a different SKU and lot.
  const active=activeFor(A,'FIXTURE-A2','LOT-A2');
  for(const selection of [{sku:'FIXTURE-A',lot:'LOT-A'},{sku:'FIXTURE-A2',lot:'LOT-A'},{sku:'FIXTURE-A',lot:'LOT-A2'}]){
    const state=publicationState(A,active,selection);
    assert.equal(state.campaignId,active.id,JSON.stringify(selection));
    assert.equal(state.active,false,JSON.stringify(selection));
    assert.equal(state.sameFields,true,JSON.stringify(selection));
    assert.notEqual(state.code,'ACTIVE');
  }
  assert.equal(publicationState(A,active,{sku:'FIXTURE-A2',lot:'LOT-A2'}).code,'ACTIVE');
  // An edited review changes the id, so the saved setup no longer matches the active scenario.
  const edited={...A,review:{digest:digest('c')}};
  assert.equal(publicationState(edited,active,{sku:'FIXTURE-A2',lot:'LOT-A2'}).active,false);
});

test('inactive, unpublished and draft setups never present as currently published',()=>{
  const active=activeFor(B,'FIXTURE-B','LOT-B');
  assert.equal(publicationState({...A,publishedCampaign:undefined},active,{sku:'FIXTURE-A',lot:'LOT-A'}).code,'NOT_PUBLISHED');
  assert.equal(publicationState({...A,review:null,publishedCampaign:A.publishedCampaign},active,{sku:'FIXTURE-A',lot:'LOT-A'}).code,'NOT_REVIEWED');
  // No scenario active at all: a historical record is still not a current publication.
  assert.equal(publicationState(A,null,{sku:'FIXTURE-A',lot:'LOT-A'}).code,'PUBLISHED_EARLIER');
  assert.equal(publicationState(A,null,{sku:'FIXTURE-A',lot:'LOT-A'}).active,false);
});

function focusFixture(){
  const doc=new EventTarget();
  doc.visibilityState='visible';
  doc.emit=(type,target,extra={})=>{const event=new Event(type);Object.defineProperties(event,{target:{value:target},...Object.fromEntries(Object.entries(extra).map(([key,value])=>[key,{value}]))});doc.dispatchEvent(event);};
  const element=()=>({ownerDocument:doc,isConnected:true,contains(target){return target===this;},focus(){doc.activeElement=this;doc.emit('focusin',this);}});
  doc.body=element();doc.documentElement=element();
  const trigger=element(),heading=element(),other=element();trigger.focus();
  const request=beginPublicationFocus(trigger,'setup-a');
  const finish=(overrides={})=>request.finish({setupId:'setup-a',publication:{active:true},heading,...overrides});
  const removeTrigger=()=>{trigger.isConnected=false;doc.activeElement=doc.body;};
  return {doc,trigger,heading,other,request,finish,removeTrigger};
}
test('publication restores genuinely lost focus to its mounted outcome once',()=>{
  const f=focusFixture();f.removeTrigger();assert.equal(f.finish(),true);assert.equal(f.doc.activeElement,f.heading);
  f.doc.activeElement=f.doc.body;assert.equal(f.finish(),false);
});
test('publication preserves deliberate navigation even when focus later returns to body',()=>{
  for(const kind of ['focus','pointer','tab']){
    const f=focusFixture();
    if(kind==='focus')f.other.focus();
    if(kind==='pointer')f.doc.emit('pointerdown',f.other);
    if(kind==='tab')f.doc.emit('keydown',f.trigger,{key:'Tab'});
    f.removeTrigger();assert.equal(f.finish(),false,kind);assert.equal(f.doc.activeElement,f.doc.body,kind);
  }
});
test('publication does not steal focus from another mounted control',()=>{
  const f=focusFixture();f.trigger.isConnected=false;f.other.focus();assert.equal(f.finish(),false);assert.equal(f.doc.activeElement,f.other);
});
test('publication cannot focus another selected setup, failed publication, or missing outcome',()=>{
  for(const context of [{setupId:'setup-b'},{publication:{active:false}},{publication:null},{heading:null},{heading:{isConnected:false}}]){
    const f=focusFixture();f.removeTrigger();assert.equal(f.finish(context),false);assert.equal(f.doc.activeElement,f.doc.body);
  }
});
test('cancelled publication and a still-mounted trigger never move focus',()=>{
  const f=focusFixture();f.request.cancel();f.removeTrigger();assert.equal(f.finish(),false);
  const g=focusFixture();g.doc.activeElement=g.doc.body;assert.equal(g.finish(),false);
  assert.equal(beginPublicationFocus(null,'setup-a'),null);
});
test('publication does not focus a background document',()=>{
  const f=focusFixture();f.removeTrigger();f.doc.visibilityState='hidden';assert.equal(f.finish(),false);
});

test('historical wording never reads as a present-tense publication success',()=>{
  const active=activeFor(B,'FIXTURE-B','LOT-B');
  const earlier=publicationNotice(publicationState(A,active,{sku:'FIXTURE-A',lot:'LOT-A'}),active);
  assert.match(earlier,/published earlier/);
  assert.match(earlier,/not the active sandbox scenario/);
  assert.match(earlier,/Active now: Fixture product · FIXTURE-B · LOT-B/);
  assert.doesNotMatch(earlier,/Sandbox scenario published\./);
  const sameFields=publicationNotice(publicationState(A,activeFor(A,'FIXTURE-A2','LOT-A2'),{sku:'FIXTURE-A',lot:'LOT-A'}),activeFor(A,'FIXTURE-A2','LOT-A2'));
  assert.match(sameFields,/different test product/);
  assert.doesNotMatch(sameFields,/^Sandbox scenario published/);
  assert.match(publicationNotice(publicationState(A,null,{sku:'FIXTURE-A',lot:'LOT-A'}),null),/No sandbox scenario is active/);
  assert.equal(activeScenarioLabel(active),'Fixture product · FIXTURE-B · LOT-B');
});
