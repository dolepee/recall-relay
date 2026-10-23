import React, {createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore} from 'react';
import {Button} from '@base-ui/react/button';
import {Checkbox} from '@base-ui/react/checkbox';
import {Input} from '@base-ui/react/input';
import {AgStudio, createWidgets} from 'ag-studio-react';
import {studioTheme} from 'ag-studio';
import {clsx} from 'clsx';
import {twMerge} from 'tailwind-merge';
import './style.css';

const cn=(...args)=>twMerge(clsx(args));
const Workspace=createContext(null);
const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
const labels={READY_FOR_APPROVAL:'Ready for approval',REVIEW:'Needs review',MANUAL:'Manual resolution',NOT_MATCHED:'Outside scope',ALREADY_REFUNDED:'Already refunded'};
async function api(path,data) {
  const response=await fetch(`/api/${path}`,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||'The action could not be completed.');
  return result;
}
function Action({children,secondary=false,className,...props}) {
  return <Button className={cn('min-h-11 rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50',secondary?'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50':'bg-teal-700 text-white hover:bg-teal-800',className)} {...props}>{children}</Button>;
}
function Badge({children,active=false}) {return <span className={cn('inline-block rounded px-2 py-1 text-xs font-medium',active?'bg-teal-50 text-teal-800':'bg-slate-100 text-slate-700')}>{children}</span>;}
function ErrorText({error}) {return error?<p role="alert" className="mt-3 rounded border border-slate-300 bg-slate-50 p-3 text-sm text-slate-900">{error}</p>:null;}
const routeLabels={ORIGINAL_PAYMENT_CANDIDATE:'Original-payment refund · review required',NON_REFUND_REMEDY:'Replacement or repair · refund unavailable',MARKETPLACE_RETURN_REQUIRED:'Use the named marketplace return process',CHOICE_REQUIRES_REVIEW:'Several remedy choices · review required',CHECK_REFUND:'Refund by check',STORE_CREDIT:'Store credit',REFUND_ROUTE_UNSPECIFIED:'Refund method needs confirmation'};
function SourceReview() {
  const [number,setNumber]=useState('27-026'),[draft,setDraft]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  async function lookup(event) {
    event.preventDefault();setLoading(true);setError('');setDraft(null);
    try{setDraft(await api('recall-source',{recallNumber:number}));}catch(e){setError(e.message);}finally{setLoading(false);}
  }
  return <section aria-labelledby="source-title" className="mb-6 rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
    <h2 id="source-title" className="text-lg font-semibold text-balance">Look up a public recall</h2>
    <p className="mt-1 max-w-3xl text-sm text-pretty text-slate-600">Read the official remedy before planning refunds. This imports public CPSC information; it does not approve a claim or change the training purchases below.</p>
    <form onSubmit={lookup} className="mt-4 flex flex-wrap items-end gap-3">
      <div><label htmlFor="recall-number" className="mb-2 block text-sm font-medium">CPSC recall number</label><Input id="recall-number" value={number} onChange={e=>{setNumber(e.target.value);setDraft(null);setError('');}} required pattern="[0-9]{2}-?[0-9]{3}" maxLength={6} placeholder="27-026" disabled={loading} className="min-h-11 w-40 rounded-md border border-slate-300 px-3 focus:outline-2 focus:outline-teal-700"/></div>
      <Action type="submit" disabled={loading}>{loading?'Reading CPSC notice…':'Read official remedy'}</Action>
    </form>
    <ErrorText error={error}/>
    <div aria-live="polite" aria-busy={loading}>
      {loading && <p role="status" className="mt-4 text-sm text-slate-600">Retrieving the notice from CPSC. No customer or payment data is sent.</p>}
      {draft && <div className="mt-5 border-t border-slate-200 pt-5">
        <Badge active={draft.route==='ORIGINAL_PAYMENT_CANDIDATE'}>{routeLabels[draft.route]}</Badge>
        <h3 className="mt-3 max-w-4xl text-lg font-semibold text-balance">{draft.title}</h3>
        <a href={draft.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-teal-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-teal-700">Read the original CPSC notice ↗</a>
        <div className="mt-3 grid gap-5 lg:grid-cols-2">
          <div><h4 className="text-sm font-semibold">Remedy excerpt from CPSC</h4>{draft.remedies.map((quote,i)=><blockquote key={i} className="mt-2 border-l-2 border-slate-300 pl-4 text-sm leading-6 text-pretty text-slate-700">{quote}</blockquote>)}</div>
          <div className="rounded-lg bg-slate-50 p-4"><h4 className="text-sm font-semibold">What still needs review</h4><ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">{draft.unresolved.map(item=><li key={item}>{item}</li>)}</ul></div>
        </div>
        <details className="mt-4 text-sm"><summary className="min-h-11 cursor-pointer py-3 font-medium focus-visible:outline-2 focus-visible:outline-teal-700">Product scope and source details</summary><p className="max-w-4xl leading-6 text-pretty text-slate-600">{draft.description}</p><p className="mt-3 text-xs text-slate-500">Recall {draft.recallNumber} · retrieved {new Date(draft.retrievedAt).toLocaleString()} · source review draft</p></details>
      </div>}
    </div>
  </section>;
}
function OrderCell({value}) {
  const {setSelected}=useContext(Workspace);
  return <Button className="min-h-11 text-sm font-semibold text-teal-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-teal-700" onClick={()=>setSelected(String(value))}>{value}</Button>;
}
function CaseReview() {
  const {state,selected,run,busy,error}=useContext(Workspace);
  const item=state.cases.find(c=>c.id===selected);
  if(!item)return <div className="p-5"><h2 className="text-lg font-semibold">Review a purchase</h2><p className="mt-2 text-sm text-slate-600">Select an order in the case list to check its evidence and next action.</p></div>;
  const ready=item.plan.status==='READY_FOR_APPROVAL';
  const prepared=Boolean(item.reservation);
  return <section aria-label="Selected case" className="h-full overflow-auto p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold text-balance">{item.id}</h2><Badge active={ready}>{prepared?'Prepared · not sent':labels[item.plan.status]}</Badge></div>
    <p className="mt-1 text-sm text-slate-500">{item.customer}</p>
    <dl className="my-5 grid grid-cols-2 gap-x-3 gap-y-3 border-y border-slate-200 py-4 text-sm">
      <dt className="text-slate-500">Product / lot</dt><dd className="text-right font-medium">{item.sku} / {item.lot||'Unknown'}</dd>
      <dt className="text-slate-500">Item paid</dt><dd className="text-right font-semibold tabular-nums">{money(item.linePaidCents)}</dd>
      <dt className="text-slate-500">Captured</dt><dd className="text-right tabular-nums">{new Date(item.capturedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</dd>
      <dt className="text-slate-500">Return destination</dt><dd className="text-right">Original PayPal payment</dd>
    </dl>
    <h3 className="text-sm font-semibold">Remedy evidence</h3>
    <p className="mt-1 text-xs text-slate-500">Training records only. No real photos or customer attestations.</p>
    <ul className="my-3 space-y-2 text-sm">
      <li className="flex justify-between gap-3"><span>Product label and lot</span><strong>{item.labelVerified?'Available':'Missing'}</strong></li>
      <li className="flex justify-between gap-3"><span>Remedy confirmation</span><strong>{item.remedyVerified?'Available':'Missing'}</strong></li>
      <li className="flex justify-between gap-3"><span>Merchant review</span><strong>{item.evidence.label?'Reviewed':'Pending'}</strong></li>
    </ul>
    {!state.policyReviewed?<p className="rounded bg-slate-50 p-3 text-sm">Review the notice and product scope above first.</p>:<>
      {!item.evidence.label && <Action secondary disabled={busy||!item.labelVerified||!item.remedyVerified} onClick={()=>run('review-evidence',{id:item.id})}>Review available evidence</Action>}
      {item.plan.reason && <p className="mt-3 text-sm text-pretty text-slate-600">{item.plan.reason}</p>}
      {ready && !prepared && <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50 p-4"><p className="mb-3 text-sm text-teal-950">Prepare exactly <strong>{money(item.plan.action.amountCents)}</strong> for this item. Other items in the order are excluded.</p><Action disabled={busy} onClick={()=>run('prepare',{id:item.id,digest:item.plan.digest})}>Approve and prepare {money(item.plan.action.amountCents)}</Action></div>}
      {prepared && <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50 p-4"><h3 className="font-semibold text-teal-950">Refund prepared</h3><p className="mt-1 text-sm text-pretty text-teal-950">{money(item.reservation.cents)} is reserved in the local journal. No money has been sent.</p><p className="mt-3 text-xs text-slate-600">{state.paymentReason}</p><Action className="mt-3" disabled>Send sandbox refund</Action></div>}
    </>}
    <ErrorText error={error}/>
  </section>;
}

const widgets=createWidgets({additionalTypes:[{id:'case-review',label:'Remedy review',defaultSize:{width:12,height:28},minSize:{width:8,height:16},form:p=>p.createDefaults({}),comp:CaseReview}],overrides:[{id:'grid',options:{createCellRenderer:field=>field.fieldId==='cases.order'?OrderCell:undefined}}]});
const theme=studioTheme.withParams({fontFamily:'system-ui, sans-serif',fontSize:14,studioMinWidth:280,studioMinHeight:400,studioCanvasMinWidth:280,studioWidgetTitleFontSize:18,studioWidgetTitleFontWeight:600});
const media=window.matchMedia('(min-width: 900px)');
const subscribe=callback=>{media.addEventListener('change',callback);return()=>media.removeEventListener('change',callback);};

export default function App() {
  const [state,setState]=useState(null),[loadError,setLoadError]=useState(''),[notice,setNotice]=useState(''),[matches,setMatches]=useState(null),[matching,setMatching]=useState(false),[matchError,setMatchError]=useState(''),[selected,setSelected]=useState('ORDER-1042'),[sku,setSku]=useState(''),[lot,setLot]=useState('LOT-A'),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const wide=useSyncExternalStore(subscribe,()=>media.matches);
  useEffect(()=>{let active=true;api('state').then(data=>{if(active){setState(data);setNotice(data.sampleNotice);}}).catch(e=>active&&setLoadError(e.message));return()=>{active=false;};},[]);
  async function run(path,input) {setBusy(true);setError('');try{setState(await api(path,input));}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function match(event) {event.preventDefault();setMatching(true);setMatchError('');setMatches(null);setSku('');setConfirmed(false);try{setMatches(await api('match',{text:notice}));}catch(e){setMatchError(e.message);}finally{setMatching(false);}}
  const rows=useMemo(()=>state?.cases.map(c=>({order:c.id,product:c.sku,lot:c.lot||'Unknown',status:c.reservation?'Prepared · not sent':labels[c.plan.status],refund:money(c.linePaidCents)}))||[],[state]);
  const data=useMemo(()=>({sources:[{id:'cases',data:rows}]}),[rows]);
  const initialState=useMemo(()=>({pages:[{id:'remedies',widgets:{queue:{type:'grid',dataMapping:{cols:['order','product','lot','status','refund'].map(id=>({id:`cases.${id}`}))},format:{title:{text:'Purchases to review',enabled:true},style:{theme:{rowHeight:52},columnAutoSize:true}}},review:{type:'case-review',dataMapping:{}}},widgetLayout:wide?{queue:{xTrack:0,yTrack:0,xSpan:14,ySpan:38},review:{xTrack:14,yTrack:0,xSpan:10,ySpan:38}}:{queue:{xTrack:0,yTrack:0,xSpan:24,ySpan:26},review:{xTrack:0,yTrack:26,xSpan:24,ySpan:39}},layout:{minWidth:280,columns:24,rowHeight:18,pagePadding:0,widgetPadding:0,widgetBorderEnabled:true,widgetBorderColor:'#e2e8f0',widgetBorderRadius:8}}],selectedPageId:'remedies'}),[wide]);
  return <div className="min-h-dvh bg-slate-50 text-slate-900">
    <a href="#notice" className="sr-only focus:not-sr-only focus:block focus:p-4">Skip to the recall notice</a>
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-8"><a href="/" className="flex min-h-11 items-center gap-3 font-semibold"><span aria-hidden="true" className="flex size-9 items-center justify-center rounded-lg bg-teal-700 text-white">R</span>Recall Relay</a><Badge>Local prototype · training purchases</Badge></div></header>
    <main className="mx-auto max-w-7xl px-5 py-7 sm:px-8">
      <div className="mb-6"><p className="text-sm font-medium text-teal-800">Merchant workbench</p><h1 className="mt-2 text-3xl font-semibold text-balance">Resolve affected purchases.</h1><p className="mt-2 max-w-2xl text-pretty text-slate-600">Match a notice to your catalog, review the remedy, and return the right amount to the original payment.</p></div>
      <SourceReview/>
      {!state?<div role="status" className="rounded-lg border border-slate-200 bg-white p-6">{loadError?<><p>{loadError}</p><Action secondary className="mt-3" onClick={()=>location.reload()}>Retry loading</Action></>:'Loading your workspace…'}</div>:<>
        <section id="notice" aria-labelledby="notice-title" className="mb-6 rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 id="notice-title" className="text-lg font-semibold text-balance">1. Review the notice</h2><p className="mt-1 text-sm text-slate-500">{state.policyReviewed ? "Reviewed training notice. The approved scope is locked." : "An invented training recall. Other text can test matching; refund preparation uses this fixture."}</p></div>{state.policyReviewed && <Badge active>Training policy reviewed</Badge>}</div>
          <form onSubmit={match} className="grid gap-5 lg:grid-cols-2">
            <div><label htmlFor="notice-text" className="mb-2 block text-sm font-medium">Notice text</label><textarea id="notice-text" required minLength={12} maxLength={6000} rows={5} readOnly={state.policyReviewed} value={notice} onChange={e=>{setNotice(e.target.value);setMatches(null);setSku('');setConfirmed(false);}} className="w-full rounded-md border border-slate-300 p-3 text-sm leading-6 focus:outline-2 focus:outline-teal-700"/><div className="mt-3 flex flex-wrap items-center gap-3"><Action type="submit" disabled={matching||state.policyReviewed}>{matching?'Matching catalog…':'Find product matches'}</Action><p role="status" className="text-xs text-slate-500">{matching?'Checking your catalog…':'Exact model matching and keyword search.'}</p></div><ErrorText error={matchError}/></div>
            <div aria-live="polite">{state.policyReviewed?<div className="flex h-full min-h-40 flex-col justify-center rounded-lg border border-teal-200 bg-teal-50 p-5"><h3 className="font-medium text-teal-950">Approved training scope</h3><p className="mt-2 text-sm text-teal-950">CUP-01 · model TR-16 · lot LOT-A</p><p className="mt-2 text-sm text-pretty text-teal-950">Refund the paid item amount after reviewing its label and remedy confirmation. Continue with the purchase cases below.</p></div>:!matches?<div className="flex h-full min-h-40 flex-col justify-center rounded-lg border border-dashed border-slate-300 p-5"><h3 className="font-medium">Find the right product first</h3><p className="mt-2 text-sm text-pretty text-slate-500">Search finds catalog candidates. You confirm the exact model, lot and remedy before any purchase is prepared.</p></div>:<><h3 className="mb-2 text-sm font-semibold">Catalog candidates</h3><div className="space-y-2">{!matches.candidates.length && <p className="rounded bg-slate-50 p-4 text-sm text-slate-600">No catalog matches. Check the brand and model in the original notice, then revise the search.</p>}{matches.candidates.slice(0,3).map(p=><Button key={p.sku} aria-pressed={sku===p.sku} onClick={()=>{setSku(p.sku);setConfirmed(false);}} className={cn('flex min-h-14 w-full items-center justify-between gap-3 rounded-md border p-3 text-left focus-visible:outline-2 focus-visible:outline-teal-700',sku===p.sku?'border-teal-700 bg-teal-50':'border-slate-200 hover:bg-slate-50')}><span><span className="block text-sm font-medium">{p.name}</span><span className="text-xs text-slate-500">{p.sku} · model {p.model}</span></span><span className="shrink-0 text-right text-xs text-slate-500">{p.exactIdentity?'Brand + model found':'Keyword match'}<br/><strong className="tabular-nums text-slate-800">{p.score.toFixed(2)}</strong></span></Button>)}</div><p className="mt-2 text-xs text-pretty text-slate-500">Search rank does not establish eligibility. {matches.elapsedMs.toLocaleString()} ms on this computer.</p></>}</div>
          </form>
          {sku && !state.policyReviewed && <div className="mt-5 border-t border-slate-200 pt-5"><div className="flex flex-wrap items-end gap-4"><label className="text-sm font-medium">Affected lot<Input value={lot} onChange={e=>{setLot(e.target.value);setConfirmed(false);}} className="mt-2 block min-h-11 rounded-md border border-slate-300 px-3 focus:outline-2 focus:outline-teal-700"/></label><p className="max-w-lg text-sm text-slate-600">Training scope: CUP-01 / TR-16 / LOT-A. The merchant is the responsible payer; refund the paid item amount after reviewing the label and remedy confirmation.</p></div><label className="my-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm"><Checkbox.Root checked={confirmed} onCheckedChange={setConfirmed} className="flex size-5 shrink-0 items-center justify-center rounded border border-slate-400 data-checked:border-teal-700 data-checked:bg-teal-700 data-checked:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"><Checkbox.Indicator aria-hidden="true">✓</Checkbox.Indicator></Checkbox.Root>I reviewed the exact product, lot, responsible payer and training remedy.</label><Action disabled={!confirmed||busy} onClick={()=>run('review-policy',{sku,lot,confirmed,notice})}>Confirm training scope</Action><ErrorText error={error}/></div>}
        </section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold text-balance">2. Review and resolve cases</h2><p className="text-sm tabular-nums text-slate-500">{state.cases.length} purchases · {state.cases.filter(c=>c.reservation).length} prepared · 0 refunds sent</p></div>
        <Workspace.Provider value={{state,selected,setSelected,run,busy,error}}><div className={cn('studio-workspace',wide?'h-180':'h-300')}><AgStudio style={{height:'100%',width:'100%'}} key={wide?'wide':'narrow'} data={data} widgets={widgets} theme={theme} initialState={initialState} mode="view" panels={{view:{left:[],right:[]}}} onErrorRaised={e=>console.error('Studio:',e.message||e)}/></div></Workspace.Provider>
        <p className="mt-3 text-xs text-pretty text-slate-500">AG Studio evaluation. Sandbox sending is unavailable until a real test capture is connected. No customer money moves in this training workspace.</p>
      </>}
    </main>
  </div>;
}
