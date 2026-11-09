import {IncidentOverview} from './incident-overview.jsx';
import {casesForView} from '../src/case-views.mjs';
import {ProgressiveWorkspace} from './progressive-workspace.jsx';
import React,{useContext,useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {Frame} from './components.jsx';
import {SampleContext,SampleStatus,SampleCasePanel,SourceRequirementsWidget,PaymentExceptionsWidget,AmountSummaryWidget} from './sample-widgets.jsx';
import {SAMPLE_CASES,DEFAULT_SAMPLE_ORDER,caseForOrder} from './sample-data.mjs';

const overviewCases=SAMPLE_CASES.map(c=>({...c,id:c.order,payment:{...c.payment,cents:c.payment.amountCents}}));
const loadStudio=()=>import('./sample-studio.jsx');
const media=typeof window==='undefined'?null:window.matchMedia('(min-width: 1100px)');
const subscribe=callback=>{if(!media)return()=>{};media.addEventListener('change',callback);return()=>media.removeEventListener('change',callback);};
function useWide(){return useSyncExternalStore(subscribe,()=>media?.matches===true,()=>false);}

function SampleMobile({selected,selectCase,caseForOrder}){
  const {visibleCases}=useContext(SampleContext);
  const list=useRef(null),listHeading=useRef(null),review=useRef(null),reviewHeading=useRef(null);
  const [focusRequest,setFocusRequest]=useState(0);
  function choose(order){selectCase(order);setFocusRequest(n=>n+1);}
  useEffect(()=>{
    if(!focusRequest)return;
    reviewHeading.current?.focus({preventScroll:true});
    review.current?.scrollIntoView({block:'start'});
  },[focusRequest]);
  function backToList(){
    list.current?.scrollIntoView({block:'start'});
    listHeading.current?.focus({preventScroll:true});
  }
  return <div className="grid gap-4">
    <section ref={list} id="sample-list" aria-labelledby="sample-list-heading" className="rr-card scroll-mt-24 p-4"><h2 ref={listHeading} id="sample-list-heading" tabIndex={-1} className="text-base font-semibold focus-visible:outline-2 focus-visible:outline-teal-700">Sample claims</h2><p className="mt-1 text-xs leading-5 text-slate-500">Choose a claim.</p><div className="mt-3 space-y-2">{visibleCases.map(item=><button key={item.order} type="button" aria-pressed={selected===item.order} aria-controls="sample-review" onClick={()=>choose(item.order)} className="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 p-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-teal-700"><span className="min-w-0"><span className="block font-semibold leading-tight">{item.source.product.replace(/\s+insulated travel mug$/i,' mug')}</span><span className="mt-1 block text-xs text-slate-500">{item.order}</span></span><SampleStatus code={item.status.code}/></button>)}</div></section>
    <div ref={review} className="rr-card scroll-mt-24"><button type="button" className="rr-action m-4 mb-0 inline-flex min-h-11 items-center justify-center px-4 py-2" data-secondary="true" aria-controls="sample-list" onClick={backToList}>Back to sample list</button><SampleCasePanel headingRef={reviewHeading}/></div>
    <div className="rr-card"><SourceRequirementsWidget/></div>
    <div className="rr-card"><PaymentExceptionsWidget/></div>
    <div className="rr-card"><AmountSummaryWidget/></div>
  </div>;
}

export default function SampleDesk(){
  const [selected,setSelected]=useState(DEFAULT_SAMPLE_ORDER),[view,setView]=useState('ALL');
  const visibleCases=useMemo(()=>casesForView(SAMPLE_CASES,view),[view]);
  const current=visibleCases.some(c=>c.order===selected)?selected:visibleCases[0]?.order||'';
  useEffect(()=>{document.title='Read-only sample desk · Recall Relay';},[]);
  const wide=useWide();
  const value=useMemo(()=>({selected:current,selectCase:setSelected,caseForOrder:order=>order?caseForOrder(order):null,visibleCases}),[current,visibleCases]);
  return <Frame merchant sample note="Read-only sample">
    <div className="rr-sample-banner mb-5" role="note"><strong>Six fictional claims.</strong> No login, payment or AI call.</div>
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-slate-500">Read-only sample</p><h1 className="mt-2 text-2xl font-semibold text-balance">Inspect a sample claim.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Six states. No setup, login or payment.</p></div><div className="flex flex-wrap gap-2"><a className="rr-action inline-flex items-center justify-center px-4 py-2" data-secondary="true" href="/practice">Practice journey</a><a className="rr-action rr-action--primary inline-flex items-center justify-center px-4 py-2" href="/desk">Open sandbox desk</a></div></div>
    <SampleContext.Provider value={value}><div className="rr-card mb-4"><IncidentOverview cases={overviewCases} view={view} onView={setView} simulated/></div>{wide?<ProgressiveWorkspace load={loadStudio} fallback={<SampleMobile selected={current} selectCase={setSelected} caseForOrder={caseForOrder}/>}/>:<SampleMobile selected={current} selectCase={setSelected} caseForOrder={caseForOrder}/>}</SampleContext.Provider>
    <p className="mt-4 text-xs leading-5 text-slate-500">Fixture only. Not a merchant workspace or payment record; no funds moved.</p>
  </Frame>;
}
