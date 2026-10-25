// One place decides whether an in-flight action genuinely lost the keyboard focus, and where it
// should return. A request must stay alive through the React commit that removes or disables the
// control that started it: the browser blurs a control that unmounts or becomes disabled, so
// document.activeElement falls back to <body> even though the user never moved.
export function trackFocusNavigation(trigger){
  const doc=trigger?.ownerDocument;
  if(!doc)return null;
  let navigated=false;
  const onFocus=event=>{if(event.target!==trigger&&event.target!==doc.body&&event.target!==doc.documentElement)navigated=true;};
  const onPointer=event=>{if(!trigger.contains(event.target))navigated=true;};
  const onKey=event=>{if(event.key==='Tab')navigated=true;};
  doc.addEventListener('focusin',onFocus,{capture:true});
  doc.addEventListener('pointerdown',onPointer,{capture:true});
  doc.addEventListener('keydown',onKey,{capture:true});
  return {
    doc,
    navigated:()=>navigated,
    // A temporary return to body, a detached control or a missing active element is lost focus.
    lost(){const active=doc.activeElement;return !active||active===doc.body||active===doc.documentElement||!active.isConnected;},
    stop(){doc.removeEventListener('focusin',onFocus,{capture:true});doc.removeEventListener('pointerdown',onPointer,{capture:true});doc.removeEventListener('keydown',onKey,{capture:true});},
  };
}
// Repair the focus an ordinary action lost, never a deliberate move. The control that started the
// request keeps the focus while it is still mounted and usable; otherwise focus moves to the
// outcome the caller supplies (a heading or a notice). `target` may be an element, a React ref or
// a function returning the element, so it is resolved after the request's commit. `owns` reports
// whether the displayed record still belongs to the request that produced the outcome: a response
// for a setup the merchant has navigated away from never moves focus.
export function beginActionFocus(trigger,target,{owns=()=>true}={}){
  const navigation=trackFocusNavigation(trigger);
  if(!navigation)return null;
  let cancelled=false;
  const cancel=()=>{cancelled=true;navigation.stop();};
  return {cancel,finish(){
    const lost=navigation.lost();
    const restore=!cancelled&&!navigation.navigated()&&lost&&navigation.doc.visibilityState!=='hidden'&&owns()===true;
    cancel();
    if(!restore)return false;
    const usable=element=>!!element&&element.isConnected&&element.disabled!==true;
    const outcome=typeof target==='function'?target():(target?.current??target);
    const next=usable(trigger)?trigger:usable(outcome)?outcome:null;
    if(!next)return false;
    next.focus();
    return true;
  }};
}
