import test from 'node:test';
import assert from 'node:assert/strict';
import {beginActionFocus,trackFocusNavigation} from '../src/focus-guard.mjs';

// The browser blurs a control that unmounts or becomes disabled, so an action that disables its
// own control while its request runs leaves document.activeElement on <body> without the user
// moving. These checks cover the guard that repairs exactly that loss, and nothing else.
function focusFixture(){
  const doc=new EventTarget();
  doc.visibilityState='visible';
  doc.emit=(type,target,extra={})=>{const event=new Event(type);Object.defineProperties(event,{target:{value:target},...Object.fromEntries(Object.entries(extra).map(([key,value])=>[key,{value}]))});doc.dispatchEvent(event);};
  const element=()=>({ownerDocument:doc,isConnected:true,contains(target){return target===this;},focus(){doc.activeElement=this;doc.emit('focusin',this);}});
  doc.body=element();doc.documentElement=element();
  const trigger=element(),heading=element(),other=element();trigger.focus();
  const request=beginActionFocus(trigger,heading);
  // The browser drops focus to body while the request is in flight.
  const loseFocus=()=>{doc.activeElement=doc.body;};
  return {doc,trigger,heading,other,request,finish:()=>request.finish(),loseFocus};
}

test('an action restores genuinely lost focus to the control that is still mounted',()=>{
  const f=focusFixture();f.loseFocus();assert.equal(f.finish(),true);assert.equal(f.doc.activeElement,f.trigger);
  // Once only: the listeners are gone, so a later loss is not repaired again.
  f.loseFocus();assert.equal(f.finish(),false);assert.equal(f.doc.activeElement,f.doc.body);
});

test('a control that unmounted falls through to the outcome the caller supplies',()=>{
  const f=focusFixture();f.trigger.isConnected=false;f.loseFocus();assert.equal(f.finish(),true);assert.equal(f.doc.activeElement,f.heading);
});

test('a disabled control is not a target, so the outcome is used instead',()=>{
  const f=focusFixture();f.trigger.disabled=true;f.loseFocus();assert.equal(f.finish(),true);assert.equal(f.doc.activeElement,f.heading);
});

test('the outcome target may be a ref or a function resolved at the end of the request',()=>{
  for(const shape of ['ref','function']){
    const f=focusFixture();
    const guard=beginActionFocus(f.trigger,shape==='ref'?{current:f.heading}:()=>f.heading);
    f.trigger.isConnected=false;f.loseFocus();
    assert.equal(guard.finish(),true,shape);assert.equal(f.doc.activeElement,f.heading,shape);
  }
});

test('an action never overrides a deliberate move, even when focus later returns to body',()=>{
  for(const kind of ['focus','pointer','tab']){
    const f=focusFixture();
    if(kind==='focus')f.other.focus();
    if(kind==='pointer')f.doc.emit('pointerdown',f.other);
    if(kind==='tab')f.doc.emit('keydown',f.trigger,{key:'Tab'});
    f.loseFocus();assert.equal(f.finish(),false,kind);assert.equal(f.doc.activeElement,f.doc.body,kind);
  }
});

test('an action keeps a control the user moved to and never steals it back',()=>{
  const f=focusFixture();f.other.focus();assert.equal(f.finish(),false);assert.equal(f.doc.activeElement,f.other);
});

test('a cancelled action, an intact control and a background document move nothing',()=>{
  const cancelled=focusFixture();cancelled.request.cancel();cancelled.loseFocus();assert.equal(cancelled.finish(),false);assert.equal(cancelled.doc.activeElement,cancelled.doc.body);
  // Focus that was never lost is left exactly where it is.
  const intact=focusFixture();assert.equal(intact.finish(),false);assert.equal(intact.doc.activeElement,intact.trigger);
  const hidden=focusFixture();hidden.doc.visibilityState='hidden';hidden.loseFocus();assert.equal(hidden.finish(),false);assert.equal(hidden.doc.activeElement,hidden.doc.body);
});

test('a missing or detached outcome leaves focus alone rather than guessing',()=>{
  for(const context of [null,{isConnected:false}]){
    const f=focusFixture();
    const guard=beginActionFocus(f.trigger,context);
    f.trigger.isConnected=false;f.loseFocus();
    assert.equal(guard.finish(),false,JSON.stringify(context));assert.equal(f.doc.activeElement,f.doc.body);
  }
});

test('an action still owning the displayed record restores its focus',()=>{
  let displayed='setup-a';
  const f=focusFixture();
  const guard=beginActionFocus(f.trigger,f.heading,{owns:()=>displayed==='setup-a'});
  f.trigger.isConnected=false;f.loseFocus();
  assert.equal(guard.finish(),true);assert.equal(f.doc.activeElement,f.heading);
});

test('a response for a record the merchant navigated away from moves nothing',()=>{
  let displayed='setup-a';
  const f=focusFixture();
  const guard=beginActionFocus(f.trigger,f.heading,{owns:()=>displayed==='setup-a'});
  f.trigger.isConnected=false;f.loseFocus();
  displayed='setup-b';
  assert.equal(guard.finish(),false);assert.equal(f.doc.activeElement,f.doc.body);
});

test('the navigation tracker reports lost focus and deliberate movement, then detaches',()=>{
  const f=focusFixture();
  const navigation=trackFocusNavigation(f.trigger);
  assert.equal(navigation.doc,f.doc);assert.equal(navigation.lost(),false);assert.equal(navigation.navigated(),false);
  f.loseFocus();assert.equal(navigation.lost(),true);
  assert.equal(trackFocusNavigation(null),null);
  navigation.stop();
  f.other.focus();assert.equal(navigation.navigated(),false);
});
