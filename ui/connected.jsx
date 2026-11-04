import React,{createContext,useContext,useEffect,useMemo,useState,useSyncExternalStore,lazy,Suspense,Component,useRef} from 'react';
import {Button} from '@base-ui/react/button';
import {AlertDialog} from '@base-ui/react/alert-dialog';
import {views,casesForView} from '../src/case-views.mjs';
import {useClaimPhoto} from './use-claim-photo.mjs';
import {Action,ErrorText,Status,Frame,AllocationSummary,Receipt,CorrectionNote,inputClass,money,titles,api} from './components.jsx';
import {beginActionFocus} from '../src/focus-guard.mjs';
import {projectClaimState} from './connected-state.mjs';
import {ImportPanel} from './import-panel.jsx';
import {AdvisoryPanel} from './advisory-panel.jsx';
import {ProvisionedPurchases} from './provisioned-panel.jsx';
import {STUDIO_ROW_HEIGHT,STUDIO_WIDGET_LAYOUT,STUDIO_WORKSPACE_HEIGHT} from './studio-layout.mjs';
// The recorded workflow states are authored for the customer's private claim page, and the
// merchant desk reuses them. Only the customer-directed wording is re-expressed here for the
// merchant: audience-neutral text, and any dynamic reason such as a manual policy outcome,
// falls through to the recorded reason unchanged.
const merchantStatusReasons={
  'PayPal confirmed your refund.':'PayPal confirmed the refund to the customer.',
  'PayPal is processing your refund.':'PayPal is processing the refund to the customer.',
  'The refund is reserved but has not been sent. The merchant can resume it after checking the original payment.':'The refund is reserved but has not been sent. Check the original payment to resume it.',
  'The merchant is checking the payment result. No additional refund has been sent.':'The payment result is being checked. No additional refund has been sent.',
  'Complete your claim below.':'Waiting for the customer to complete their claim.',
  'The merchant requested a change. Read the message and update your claim below.':'You requested a correction. Waiting for the customer to update their claim.',
  'Your claim is saved. Add the missing information below.':'The customer’s claim is saved. Waiting for the missing information.',
  'The lot differs from this campaign. The merchant must review your case manually.':'The customer’s lot differs from this campaign. Review this case manually.',
  'Your claim is with the merchant for review.':'The claim is with you for review.',
  'Evidence reviewed. Waiting for merchant approval.':'Evidence reviewed. Waiting for your approval.',
};
const merchantReason=reason=>merchantStatusReasons[reason]||reason;
const DeskContext=createContext(null);
function CaseCell({value,api,eGridCell}){const {state,selectCase,selected}=useContext(DeskContext);const item=state.cases.find(c=>c.order===String(value));
  // Keep the order column inside the queue panel. A content-sized order column can
  // otherwise grow past the panel and hide the status; cap each column at half the
  // viewport, then let AG Grid distribute the remaining space. The full product
  // title remains in the title attribute and in the selected review heading.
  useEffect(()=>{
    if(!api||!eGridCell||typeof api.autoSizeAllColumns!=='function')return;
    const viewport=eGridCell.closest('.ag-center-cols-viewport')||eGridCell.closest('.ag-grid-viewport')||eGridCell.closest('.ag-body-viewport');
    if(!viewport)return;
    let timer=0;
    const fit=()=>{
      clearTimeout(timer);
      timer=setTimeout(()=>{
        const width=viewport.clientWidth;
        if(width>0)api.autoSizeAllColumns({defaultMaxWidth:Math.max(100,Math.floor(width/2)),scaleUpToFitGridWidth:true});
      },0);
    };
    fit();
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(fit);
    observer?.observe(viewport);
    return()=>{clearTimeout(timer);observer?.disconnect();};
  },[api,eGridCell]);
  return <Button aria-pressed={selected===String(value)} aria-controls="claim-review" title={item?.campaign.product} className="flex min-h-11 w-full min-w-0 flex-col justify-center text-left focus-visible:outline-2 focus-visible:outline-teal-700" onClick={()=>selectCase(String(value))}><span className="max-w-full truncate text-sm font-semibold text-teal-900">{item?.campaign.product||value}</span><span className="text-xs text-slate-500">{value}</span><span className="text-xs font-medium tabular-nums text-slate-700">{money(item?.amountCents||0)}</span></Button>;}

const fieldKind={PHOTO:'Photograph',CONFIRMATION:'Confirmation',TEXT:'Written information'};
const dispositionLabel={FIELD:'Field link',INFORMATION:'Information',MANUAL:'Manual',UNRESOLVED:'Unresolved'};
function selectedItem(context){return context.state?.cases.find(c=>c.order===context.selected);}
function ConnectedCoverageWidget(){
  const context=useContext(DeskContext),item=selectedItem(context);
  if(!item)return <section className="h-full overflow-auto p-4"><h2 className="text-base font-semibold">Source coverage</h2><p className="mt-2 text-sm leading-6 text-slate-600">Select a claim to inspect its source coverage.</p></section>;
  const coverage=item.campaign.coverage||[],fields=item.campaign.fields||[];
  return <section aria-label="Source coverage" className="h-full overflow-auto p-4">
    <h2 className="text-base font-semibold">Source coverage</h2>
    <p className="mt-1 text-xs leading-5 text-slate-500">{item.campaign.title||'Published campaign'} · {item.order}</p>
    {coverage.length?<ol className="mt-3 divide-y divide-slate-200 border-y border-slate-200">{coverage.map(entry=>{const linked=fields.filter(field=>(entry.fieldIds||[]).includes(field.id));return <li key={entry.id} className="py-2.5"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold  text-slate-500">{dispositionLabel[entry.disposition]||entry.disposition}</span><span className="rr-status" data-code={entry.disposition==='FIELD'?'READY_FOR_APPROVAL':entry.disposition==='UNRESOLVED'?'UNRESOLVED':entry.disposition==='MANUAL'?'MANUAL':undefined}>{dispositionLabel[entry.disposition]||entry.disposition}</span></div><p className="mt-1 text-xs leading-4 text-slate-700">“{entry.quote}”</p>{linked.length?<p className="mt-1 text-xs leading-4 text-slate-500">Linked to {linked.map(field=>fieldKind[field.kind]||field.kind).join(', ')}</p>:null}{entry.reason?<p className="mt-1 text-xs leading-4 text-slate-500">{entry.reason}</p>:null}</li>})}</ol>:<div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3"><p className="text-xs leading-5 text-slate-600">This campaign has no coverage entries. Older campaigns can lack them; review the published fields below.</p><ul className="mt-2 space-y-2">{fields.map(field=><li key={field.id} className="text-xs leading-4 text-slate-700"><span className="font-semibold">{fieldKind[field.kind]||field.kind}:</span> “{field.quote}”</li>)}</ul></div>}
    <p className="mt-2 text-xs leading-4 text-slate-500">A FIELD entry is a quote link, not a completeness score.</p>
  </section>;
}
function ConnectedExceptionsWidget(){
  const context=useContext(DeskContext),item=selectedItem(context);
  if(!item)return <section className="h-full overflow-auto p-4"><h2 className="text-base font-semibold">Exceptions and amounts</h2><p className="mt-2 text-sm leading-6 text-slate-600">Select a claim to inspect its blockers and recorded amounts.</p></section>;
  const projection=projectClaimState(item);
  return <section aria-label="Exceptions and amounts" className="h-full overflow-auto p-4">
    <h2 className="text-base font-semibold">Exceptions and amounts</h2>
    <p className="mt-1 text-xs leading-5 text-slate-500">{item.order} · revision {item.revision}</p>
    <div className="mt-3"><p className="text-xs font-semibold  text-slate-500">Recorded blockers</p>{projection.blockers.length?<ul className="mt-1 space-y-1.5 text-xs leading-4 text-slate-700">{projection.blockers.map((blocker,index)=><li key={`${index}-${blocker}`} className="border-l-2 border-[color:var(--m-warn-line)] pl-2">{blocker}</li>)}</ul>:<p className="mt-1 text-xs leading-5 text-slate-600">{projection.settlementComplete?'Settlement complete; no blocker recorded.':'No recorded blockers.'}</p>}</div>
    <dl className="mt-3 space-y-1.5 border-t border-slate-200 pt-2 text-xs"><div className="flex flex-wrap justify-between gap-2"><dt className="text-slate-500">Item refund</dt><dd className="font-semibold tabular-nums">{money(item.amountCents)}</dd></div><div className="flex flex-wrap justify-between gap-2"><dt className="text-slate-500">Payment</dt><dd className="text-right">{projection.paymentLabel}</dd></div>{item.receipt&&<div className="flex flex-wrap justify-between gap-2"><dt className="text-slate-500">Receipt</dt><dd className="break-all text-right font-mono text-xs">{item.receipt.refundId}</dd></div>}</dl>
    {projection.lockNote&&<p className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs leading-4 text-slate-600">{projection.lockNote}</p>}
  </section>;
}
function ConnectedAdvisoryWidget(){
  const context=useContext(DeskContext),item=selectedItem(context);
  return <AdvisoryPanel item={item}/>;
}
function ConnectedReviewBrief(){
  const context=useContext(DeskContext),item=selectedItem(context);
  if(!item)return <section className="h-full overflow-auto p-4"><h2 className="text-base font-semibold">Recorded review brief</h2><p className="mt-2 text-sm leading-6 text-slate-600">Select a claim to build its review brief.</p></section>;
  const fields=item.campaign.fields||[];
  const projection=projectClaimState(item);
  const response=field=>field.kind==='PHOTO'?(item.submission?.hasPhoto?'Photograph submitted':'Missing'):field.kind==='CONFIRMATION'?(item.submission?.extra?.[field.id]===true?'Confirmed by customer':'Not confirmed'):(item.submission?.extra?.[field.id]||'Not provided');
  return <section aria-label="Recorded review brief" className="h-full overflow-auto p-4">
    <h2 className="text-base font-semibold">Recorded review brief</h2>
    <p className="mt-1 text-xs leading-5 text-slate-500">Recorded facts for {item.order}; no model call.</p>
    <div className="mt-3"><p className="text-xs font-semibold  text-slate-500">Source requirements</p><ul className="mt-1 space-y-2">{fields.map(field=><li key={field.id} className="border-b border-slate-200 pb-2 text-xs leading-4"><p className="text-slate-700">“{field.quote}”</p><p className="mt-1 text-slate-500">{fieldKind[field.kind]||field.kind} · {response(field)}</p></li>)}</ul></div>
    <div className="mt-3"><p className="text-xs font-semibold  text-slate-500">Missing or unresolved</p>{item.missing?.length?<ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-4 text-slate-700">{item.missing.map(missing=><li key={missing}>{missing}</li>)}</ul>:<p className="mt-1 text-xs leading-4 text-slate-600">No missing customer information recorded.</p>}</div>
    {item.correction&&<div className="mt-3 border-t border-slate-200 pt-2"><p className="text-xs font-semibold  text-slate-500">Latest correction</p><p className="mt-1 text-xs leading-4 text-slate-700">{item.correction.state}: {item.correction.message}</p>{item.correction.response&&<p className="mt-1 text-xs leading-4 text-slate-500">Customer response: {item.correction.response}</p>}</div>}
    <div className="mt-3 border-t border-slate-200 pt-2 text-xs leading-4 text-slate-600"><p>Status: {projection.planLabel}{projection.planReason?` — ${projection.planReason}`:''}</p><p className="mt-1">Evidence review: {item.review?'Recorded':'Not recorded'} · revision {item.revision}</p>{projection.lockNote&&<p className="mt-1">{projection.lockNote}</p>}</div>
  </section>;
}
// The three connected panels normally live in the Studio workspace beside the claim review.
// When that workspace is unavailable (the fallback desk), they are mounted here instead, so the
// guard follows whether the standalone panels were actually mounted rather than the viewport.
function MobileReviewExtras({always=false}){
  const {wide}=useContext(DeskContext);
  if(wide&&!always)return null;
  return <div className="mt-5 space-y-3"><details className="rr-card p-4" open={wide||undefined}><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-700">Source coverage</summary><ConnectedCoverageWidget/></details><details className="rr-card p-4" open={wide||undefined}><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-700">Exceptions and amounts</summary><ConnectedExceptionsWidget/></details><details className="rr-card p-4" open={wide||undefined}><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-700">Recorded review brief</summary><ConnectedReviewBrief/></details><details className="rr-card p-4" open={wide||undefined}><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-700">AI advisory</summary><ConnectedAdvisoryWidget/></details></div>;
}

function MerchantCase({inlineExtras=false}){
  const {state,selected,run,busy,error:operationError,focusToken,restoreCaseFocus,wide}=useContext(DeskContext),item=state.cases.find(c=>c.order===selected);
  const error=operationError?.scope==='case'&&operationError.id===item?.id?operationError.message:'';
  const heading=useRef(null),lastFocusToken=useRef(0);
  const photograph=useClaimPhoto(item);
  useEffect(()=>{if(focusToken===lastFocusToken.current)return;lastFocusToken.current=focusToken;if(item){heading.current?.focus({preventScroll:true});if(!wide)heading.current?.scrollIntoView({block:'start'});}},[focusToken,item?.id,wide]);
  const [reviewed,setReviewed]=useState(false),[confirmOpen,setConfirmOpen]=useState(false);
  const [changeMessage,setChangeMessage]=useState(''),[replacePhoto,setReplacePhoto]=useState(true);
  useEffect(()=>{setReviewed(false);setConfirmOpen(false);setChangeMessage('');setReplacePhoto(true);},[item?.id,item?.revision]);
  if(!item)return <section className="p-5"><h2 className="text-lg font-semibold">Review a customer claim</h2><p className="mt-2 text-sm leading-6 text-slate-600">Select an order to see its evidence and next action.</p></section>;
  return <section id="claim-review" className="h-full overflow-auto p-5 sm:p-6" aria-label="Customer claim review"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h2 ref={heading} tabIndex={-1} className="rr-case-heading text-lg font-semibold text-balance">{item.campaign.product}</h2><p className="mt-1 text-xs text-slate-500">{item.order}</p></div><Status code={item.status.code} merchant/></div><p className="mt-3 text-sm leading-6 text-slate-600">{merchantReason(item.status.reason)}</p>{item.receipt&&<Receipt value={item.receipt}/>}<div className="rr-connected-review-layout mt-5"><div className="min-w-0"><dl className="grid grid-cols-2 gap-3 border-y border-slate-200 py-4 text-sm"><dt className="text-slate-500">Customer lot</dt><dd className="text-right">{item.submission?.lot||'Not submitted'}</dd><dt className="text-slate-500">Campaign lot</dt><dd className="text-right">{item.campaign.lot}</dd><dt className="text-slate-500">Linked purchase</dt><dd className="text-right">{item.submission?.acknowledged?'Confirmed by customer':'Not confirmed'}</dd></dl>
    <a href={item.claimUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-teal-700">Open private customer claim ↗</a>
    {item.submission?.hasPhoto&&<div className="mt-4" aria-busy={photograph.loading}><h3 className="text-sm font-semibold">Submitted photograph</h3>{item.campaign.fields?.find(field=>field.kind==='PHOTO')&&<p className="mt-2 text-sm leading-6 text-slate-600">{item.campaign.fields.find(field=>field.kind==='PHOTO').quote}</p>}{photograph.loading?<div className="mt-3 flex min-h-48 items-center justify-center rounded-md bg-slate-50 text-sm text-slate-600" role="status">Loading this claim’s photograph…</div>:photograph.error?<><ErrorText error={photograph.error}/><Action secondary className="mt-3" onClick={photograph.retry}>Retry photograph</Action></>:<img key={`${item.id}-${item.revision}`} src={photograph.photo} onLoad={photograph.loaded} onError={photograph.failed} alt="Customer-submitted photograph for merchant review" className="mt-3 max-h-96 w-full rounded-md border border-slate-200 object-contain"/>}<p className="mt-2 text-xs leading-5 text-slate-500">Claim version {item.revision}. A file upload does not establish authenticity or eligibility.</p></div>}
    {(item.campaign.fields||[]).filter(f=>f.kind!=='PHOTO').map(field=><div key={field.id} className="mt-4 rounded-md border border-slate-200 p-4"><p className="text-sm leading-6">{field.quote}</p><p className="mt-2 text-sm font-semibold">Customer response: {field.kind==='CONFIRMATION'?(item.submission?.extra?.[field.id]===true?'Confirmed by customer':'Not confirmed'):(item.submission?.extra?.[field.id]||'Not provided')}</p><p className="mt-2 text-xs text-slate-500">A customer statement requires your review; it does not verify the underlying action.</p></div>)}
    <CorrectionNote value={item.correction} reviewed={!!item.review} completed={item.status.code==='COMPLETED'||!!item.receipt}/>
    {!item.locked&&item.missing.length>0&&<div className="mt-4 rounded-md bg-slate-50 p-4"><h3 className="text-sm font-semibold">Waiting for the customer</h3><ul className="mt-2 list-disc space-y-2 pl-5 text-sm">{item.missing.map(x=><li key={x}>{x}</li>)}</ul></div>}
    {!item.locked&&item.submission&&item.missing.length===0&&item.submission.lot===item.campaign.lot&&!item.review&&item.correction?.state!=='REQUESTED'&&<div className="mt-4 border-t border-slate-200 pt-3"><label className="flex min-h-11 items-start gap-3 py-3 text-sm leading-6"><input type="checkbox" checked={reviewed} disabled={busy||!photograph.ready} onChange={e=>setReviewed(e.target.checked)} className="mt-1 size-5 shrink-0 accent-teal-700 focus-visible:outline-2 focus-visible:outline-teal-700"/>I inspected this photograph and confirmed the item, lot, purchase confirmation and required responses match the published campaign.</label><Action secondary disabled={!reviewed||busy||!photograph.ready} onClick={()=>run('review',{id:item.id,revision:item.revision,confirmed:true})}>Confirm evidence review</Action></div>}
    {!item.locked&&item.submission&&item.correction?.state!=='REQUESTED'&&<details key={`${item.id}-${item.revision}`} className="mt-5 border-t border-slate-200 pt-2"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-700">Ask the customer for a correction</summary><form onSubmit={event=>{event.preventDefault();run('request-changes',{id:item.id,revision:item.revision,message:changeMessage,replacePhoto});}}><p className="text-sm leading-6 text-slate-600">Explain what needs fixing. This removes the current evidence approval and shows your message on the customer’s private page. It does not send an email.</p><label className="mt-4 block text-sm font-medium">What should the customer change?<textarea value={changeMessage} onChange={e=>setChangeMessage(e.target.value)} required minLength={10} maxLength={600} rows={3} disabled={busy} className={inputClass} placeholder="For example, the lot number is too blurred to read. Please upload a clearer photograph."/></label><label className="flex min-h-11 items-start gap-3 py-3 text-sm leading-6"><input type="checkbox" checked={replacePhoto} onChange={e=>setReplacePhoto(e.target.checked)} disabled={busy} className="mt-1 size-5 shrink-0 accent-teal-700 focus-visible:outline-2 focus-visible:outline-teal-700"/>Require a replacement photograph</label><Action type="submit" secondary disabled={busy||changeMessage.trim().length<10}>{busy?'Saving request…':'Request customer update'}</Action></form></details>}
    {item.plan.status==='READY_FOR_APPROVAL'&&(!item.locked||item.payment?.state==='RESERVED')&&<div className="mt-5 rounded-lg border border-teal-200 bg-teal-50 p-4"><p className="mb-3 text-sm text-teal-950">The reviewed claim is ready for an item-only refund of <strong>{money(item.amountCents)}</strong>. Only the affected item allocation is eligible for this refund.</p><AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}><AlertDialog.Trigger render={<Action disabled={busy}/>}>{item.payment?.state==='RESERVED'?'Review reserved refund':'Review refund'}</AlertDialog.Trigger><AlertDialog.Portal><AlertDialog.Backdrop className="rr-dialog-backdrop fixed inset-0 z-40"/><AlertDialog.Popup className="rr-dialog fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 p-6"><AlertDialog.Title className="text-xl font-semibold text-balance">Review Sandbox refund</AlertDialog.Title><AlertDialog.Description className="mt-3 text-sm leading-6 text-pretty text-slate-600">Return {money(item.amountCents)} to the original PayPal payment for {item.order}. This sends a real Sandbox API request using test funds. The payment cannot be undone.</AlertDialog.Description><div className="mt-6 flex flex-wrap justify-end gap-3"><AlertDialog.Close render={<Action secondary/>}>Go back</AlertDialog.Close><Action disabled={busy} onClick={async()=>{setConfirmOpen(false);await run('approve',{id:item.id,digest:item.plan.digest});restoreCaseFocus();}}>Approve {money(item.amountCents)} Sandbox refund</Action></div></AlertDialog.Popup></AlertDialog.Portal></AlertDialog.Root></div>}
    {item.payment&&item.payment.state!=='RESERVED'&&<Action secondary className="mt-4" disabled={busy} onClick={()=>run('reconcile',{id:item.id})}>{busy?'Checking PayPal…':'Check PayPal status'}</Action>}<ErrorText error={error}/></div><aside className="rr-case-money"><AllocationSummary value={item.allocation} amountCents={item.amountCents}/></aside></div><MobileReviewExtras always={inlineExtras}/>
  </section>;
}
const StudioWorkspace=lazy(()=>import('./studio-workspace.jsx'));
class WorkspaceBoundary extends Component {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?this.props.fallback:this.props.children;}
}
function BasicCaseWorkspace({rows,loading=false}){
  const {selectCase,selected}=useContext(DeskContext);
  return <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]"><section className="rounded-lg border border-slate-200 bg-white p-5"><h3 className="font-semibold">Customer claims</h3>{loading&&<p className="mt-2 text-sm leading-6 text-slate-600" role="status">The interactive workspace is loading. You can review claims here now.</p>}<div className="mt-3 space-y-2">{rows.length?rows.map(row=><Button key={row.order} aria-pressed={selected===row.order} aria-controls="claim-review" className="flex min-h-11 w-full flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 p-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-teal-700" onClick={()=>selectCase(row.order)}><span className="min-w-0"><span className="block font-semibold text-teal-900">{row.product}</span><span className="mt-1 block text-xs text-slate-500">{row.order}</span></span><span>{row.status}</span><span className="tabular-nums">{row.refund}</span></Button>):<p className="text-sm text-slate-600">No claims in this view. Choose another case view to continue.</p>}</div></section><div className="rounded-lg border border-slate-200 bg-white"><MerchantCase inlineExtras/></div></div>;
}
// The five-panel Studio needs the full desktop width to keep the queue, review and
// context rail readable; narrower viewports use the ordinary single-column controls.
const media=window.matchMedia('(min-width: 1280px)');
const subscribe=cb=>{media.addEventListener('change',cb);return()=>media.removeEventListener('change',cb);};
function PurchasePanel({state,run,busy}){
  const hasProvisioned=Array.isArray(state?.provisionedPurchases)&&state.provisionedPurchases.length>0;
  return <details className="rr-card px-5" open={state.cases.length===0}><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-700">Create sandbox purchase</summary><div className="border-t border-slate-100 pb-5 pt-3"><p className="max-w-3xl text-sm leading-6 text-slate-600">Approving a test purchase needs a PayPal Sandbox personal buyer account. Create one through the official <a className="inline-flex min-h-11 items-center font-semibold text-teal-800 underline focus-visible:outline-2 focus-visible:outline-teal-700" href="https://developer.paypal.com/sandbox-testing/accounts" target="_blank" rel="noreferrer">PayPal Sandbox accounts documentation</a> and never use a live PayPal login or real card details.</p><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Create a $59.99 test purchase: the $25.99 campaign item and an unaffected $34 item. Open the approval link, sign in and approve it yourself, return here, then use Verify approved purchase for that same order to create its private claim. New purchases use the active instructions; existing claims keep their own version.</p><Action className="mt-4" secondary={hasProvisioned} disabled={busy} onClick={()=>run('checkout',{})}>Create sandbox purchase</Action><div className="mt-3 space-y-3">{state.checkouts.filter(c=>!c.claimId).map(c=><div key={c.id} className="flex flex-wrap items-center gap-3 rounded-md bg-slate-50 p-3"><span className="text-xs tabular-nums text-slate-600">{c.orderId?`Purchase …${c.orderId.slice(-6)}`:'Purchase setup incomplete'}</span>{c.approvalUrl&&<a href={c.approvalUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-800 underline focus-visible:outline-2 focus-visible:outline-teal-700">Approve in PayPal Sandbox ↗</a>}{!c.orderId&&<Action secondary disabled={busy} onClick={()=>run('resume-checkout',{id:c.id})}>Resume purchase setup</Action>}{c.orderId&&<Action secondary disabled={busy} onClick={()=>run('capture',{id:c.id})}>Verify approved purchase</Action>}</div>)}</div></div></details>;
}

export function MerchantDesk(){
  const [state,setState]=useState(null),[error,setError]=useState(null),[busy,setBusy]=useState(false),[selected,setSelected]=useState(''),[reviewed,setReviewed]=useState(false);
  const [view,setView]=useState('ALL'),[guideOpen,setGuideOpen]=useState(false),[focusToken,setFocusToken]=useState(0),[notice,setNotice]=useState(null),[focusPending,setFocusPending]=useState(null);
  const guideToggle=useRef(null),viewSelect=useRef(null),outcomeNotice=useRef(null),claimsHeading=useRef(null),lastRepair=useRef(0);
  const onView=useMemo(()=>value=>setView(value),[]);
  const wide=useSyncExternalStore(subscribe,()=>media.matches);
  async function refresh(){const data=await api('merchant/state');setState(data);}
  useEffect(()=>{let active=true;(async()=>{const fragment=new URLSearchParams(location.hash.slice(1));const key=fragment.get('merchant');if(key){history.replaceState(null,'',location.pathname+location.search);await api('merchant/login',{key});}if(active)await refresh();})().catch(e=>active&&setError({scope:'workspace',message:e.message}));return()=>{active=false;};},[]);
  async function run(action,data){
    const caseAction=['review','request-changes','approve','reconcile'].includes(action);
    const bindAction=action==='bind-purchase';
    const reference=caseAction?state?.cases.find(item=>item.id===data?.id)?.order:null;
    setBusy(true);setError(null);setNotice(null);
    try{
      const result=await api(`merchant/${action}`,data);
      try{await refresh();}
      catch(refreshError){
        // A durable bind is already recorded server-side. Losing the follow-up refresh must not
        // discard the confirmed answer and invite the merchant to bind the same capture again.
        if(action!=='bind-purchase')throw refreshError;
        setError({scope:'workspace',message:'The binding was recorded, but the desk could not refresh. Use Refresh claims to load the recorded claim.'});
      }
      if(bindAction){
        if(!result?.order)throw new Error('The server did not return the bound claim.');
        setView('ALL');selectCase(result.order);
        setNotice({message:`${result.order}: provisioned purchase bound. Provider facts and the allocation are now recorded for review.`,view:'ALL',order:result.order});
        return result;
      }
      if(caseAction&&!casesForView([result],view).length){
        const nextView=result.status.code==='READY_FOR_APPROVAL'?'READY':result.status.code==='COMPLETED'?'COMPLETED':['AWAITING_CUSTOMER','NEEDS_INFORMATION'].includes(result.status.code)?'WAITING':['SUBMITTED','REVIEW'].includes(result.status.code)?'REVIEW':['UNKNOWN','PENDING','RESERVED','FAILED','CANCELLED'].includes(result.status.code)?'PAYMENT':'MANUAL';
        const outcome=action==='request-changes'?'Update requested. This claim is now waiting for the customer.':action==='review'?'Evidence review saved. This claim is ready for merchant approval.':merchantReason(result.status.reason);
        setNotice({message:`${result.order}: ${outcome}`,view:nextView,order:result.order});
      }
      return result;
    }catch(e){setError({scope:caseAction?'case':'workspace',id:caseAction?data?.id:undefined,message:reference?`${reference}: ${e.message}`:e.message});try{await refresh();}catch{}return null;}finally{setBusy(false);}
  }
  async function reload(event){
    // The control is disabled while the desk reloads, so the browser blurs it: repair that loss
    // afterwards, keeping the control while it is still mounted and otherwise landing on the
    // heading of the desk that was refreshed.
    const focus=beginActionFocus(event?.currentTarget,claimsHeading);
    setBusy(true);setError(null);
    try{await refresh();}catch(e){setError({scope:'workspace',message:e.message});}
    finally{setBusy(false);if(focus)setFocusPending(focus);}
  }
  useEffect(()=>{if(!focusPending)return;setFocusPending(null);focusPending.finish();},[focusPending]);
  const rows=useMemo(()=>(state?casesForView(state.cases,view):[]).map(c=>({order:c.order,product:c.campaign.product,status:({AWAITING_CUSTOMER:'Awaiting customer',NEEDS_INFORMATION:'Needs information',SUBMITTED:'Review evidence',REVIEW:'Review evidence',READY_FOR_APPROVAL:'Ready to approve',MANUAL:'Manual review',COMPLETED:'Refund confirmed'}[c.status.code]||titles[c.status.code]),refund:money(c.amountCents)})),[state,view]);
  const activeSelected=rows.some(row=>row.order===selected)?selected:rows[0]?.order||'';
  function selectCase(order){setSelected(order);setFocusToken(value=>value+1);}
  // After a refund attempt the Confirm control unmounts or is disabled, so focus can fall to <body>.
  // Repair it via the existing case-heading focus token, but only when focus was actually lost.
  function restoreCaseFocus(){const active=document.activeElement;if(active&&active!==document.body&&active!==document.documentElement&&active.isConnected)return;setFocusToken(value=>value+1);}
  // When the repaired case is no longer in the current view there is no case review to
  // focus, so the token repair goes to a target that is mounted whenever the view is
  // empty: the outcome notice, or the case view selector that can bring the case back.
  useEffect(()=>{if(focusToken===lastRepair.current)return;lastRepair.current=focusToken;if(activeSelected)return;const target=outcomeNotice.current||viewSelect.current;if(target)target.focus({preventScroll:true});},[focusToken,activeSelected]);
  const data=useMemo(()=>({sources:[{id:'claims',data:rows}]}),[rows]);
  const initialState=useMemo(()=>({pages:[{id:'claims',widgets:{queue:{type:'grid',dataMapping:{cols:['order','status'].map(id=>({id:`claims.${id}`}))},format:{title:{text:'Claim queue',enabled:true},style:{theme:{rowHeight:84},columnAutoSize:false,columnWidth:120}}},review:{type:'connected-case',dataMapping:{}},coverage:{type:'connected-coverage',dataMapping:{}},exceptions:{type:'connected-exceptions',dataMapping:{}},brief:{type:'connected-brief',dataMapping:{}},advisory:{type:'connected-advisory',dataMapping:{}}},widgetLayout:STUDIO_WIDGET_LAYOUT,layout:{minWidth:280,columns:24,rowHeight:STUDIO_ROW_HEIGHT,pagePadding:0,widgetPadding:0,widgetBorderEnabled:true,widgetBorderColor:'#DEE5EE',widgetBorderRadius:12}}],selectedPageId:'claims'}),[]);
  const selectedCaseId=state?.cases.find(item=>item.order===activeSelected)?.id;
  const getCase=useMemo(()=>()=>state?.cases.find(item=>item.order===activeSelected)||null,[state,activeSelected]);
  const workspaceError=error&&(error.scope==='workspace'||error.id!==selectedCaseId)?error.message:'';
  return <Frame merchant>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><div><h1 ref={claimsHeading} tabIndex={-1} className="rr-desk-heading text-2xl font-semibold text-balance">Claims</h1><p className="mt-1 text-sm leading-6 text-slate-600">Review evidence and resolve refunds to the original payment.</p></div><Action secondary disabled={busy} onClick={reload}>{busy?'Updating…':'Refresh claims'}</Action></div>
    <ErrorText error={workspaceError}/>
    {!state?<section className="rounded-lg border border-slate-200 bg-white p-6" aria-busy={!error}><p role="status">{error?'Your desk could not be opened.':'Opening your merchant desk…'}</p>{error&&<Action secondary className="mt-4" disabled={busy} onClick={reload}>Retry loading desk</Action>}</section>:<>
      {state.cases.length===0&&!state.campaign.scenario&&<section aria-label="Start your first claim form" className="rr-card mb-6 p-6 sm:p-8"><h2 className="text-xl font-semibold text-balance">From a notice to a resolved claim.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Prepare the requirements once, then keep each customer’s evidence and refund together.</p><ol className="my-6 grid gap-4 text-sm sm:grid-cols-3"><li><strong className="block">Prepare instructions</strong><span className="mt-1 block leading-6 text-slate-600">Import a notice and review its source-linked fields.</span></li><li><strong className="block">Collect evidence</strong><span className="mt-1 block leading-6 text-slate-600">Connect a verified test purchase and share its private claim page.</span></li><li><strong className="block">Review and resolve</strong><span className="mt-1 block leading-6 text-slate-600">Request corrections or approve the exact item refund.</span></li></ol><a href="/setup" className="rr-action rr-action--primary inline-flex min-h-11 items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">Prepare claim instructions</a></section>}
      <details className="rr-card rr-workspace-setup mb-5" open={!state.cases.length}><summary className="min-h-11 cursor-pointer py-3 font-semibold">Workspace setup and purchase tools</summary><div className={`mb-4 grid items-start gap-3 ${state.published?'md:grid-cols-2':''}`}><details className="rr-card px-5" open={!state.published&&!!state.campaign.scenario}><summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2 py-3 text-sm focus-visible:outline-2 focus-visible:outline-teal-700"><span className="font-semibold">{state.campaign.scenario?state.campaign.title:'Fictional practice campaign'}</span><span className="text-xs text-slate-600">{state.published?'Published instructions':'Not published'}</span></summary><div className="border-t border-slate-100 py-4"><p className="max-w-3xl text-sm leading-6 text-slate-600">{state.campaign.notice}</p><a href={state.campaign.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-teal-800 underline">Read the source instructions</a>{!state.published&&<><label className="mt-3 flex min-h-11 items-start gap-3 py-3 text-sm leading-6"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)} className="mt-1 size-5 shrink-0 accent-teal-700 focus-visible:outline-2 focus-visible:outline-teal-700"/>I reviewed this fictional product, lot and refund remedy. Customer evidence requires a separate review.</label><Action disabled={busy||!reviewed} onClick={()=>run('publish',{confirmed:true})}>Publish sandbox claim campaign</Action></>}</div></details>
      {state.published&&<PurchasePanel state={state} run={run} busy={busy}/>}</div>
      <ProvisionedPurchases state={state} run={run} busy={busy}/>
      <ImportPanel/></details>
      {state.cases.length?<>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><label className="text-sm font-medium">Case view<select ref={viewSelect} className="ml-3 min-h-11 rounded-md border border-slate-300 bg-white px-3" value={view} onChange={e=>setView(e.target.value)}>{Object.entries(views).map(([value,label])=><option key={value} value={value}>{label} ({casesForView(state.cases,value).length})</option>)}</select></label><div className="flex flex-wrap items-center gap-3">{wide&&<Action secondary ref={guideToggle} aria-expanded={guideOpen} onClick={()=>setGuideOpen(open=>!open)}>Claim guide</Action>}<span className="text-xs tabular-nums text-slate-500">{state.cases.length} {state.cases.length===1?'claim':'claims'}</span></div></div>
        {notice&&<div ref={outcomeNotice} tabIndex={-1} role="status" className="rr-outcome-notice mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-teal-200 bg-teal-50 px-4 py-3"><p className="text-sm leading-6 text-teal-950">{notice.message}</p><Action secondary onClick={()=>{setView(notice.view);selectCase(notice.order);setNotice(null);}}>Open updated claim</Action></div>}
        <DeskContext.Provider value={{state,selected:activeSelected,selectCase,run,busy,error,focusToken,restoreCaseFocus,wide}}>{wide?<WorkspaceBoundary fallback={<BasicCaseWorkspace rows={rows}/>}><Suspense fallback={<BasicCaseWorkspace rows={rows} loading/>}><StudioWorkspace data={data} initialState={initialState} height={STUDIO_WORKSPACE_HEIGHT} onView={onView} getCase={getCase} ClaimReview={MerchantCase} OrderCell={CaseCell} CoverageWidget={ConnectedCoverageWidget} ExceptionsWidget={ConnectedExceptionsWidget} BriefWidget={ConnectedReviewBrief} AdvisoryWidget={ConnectedAdvisoryWidget} guideOpen={guideOpen} onGuideClose={()=>{setGuideOpen(false);guideToggle.current?.focus();}}/></Suspense></WorkspaceBoundary>:<BasicCaseWorkspace rows={rows}/>}</DeskContext.Provider>
      </>:state.published?<section className="rr-card border-dashed p-6"><h2 className="font-semibold">Ready for your first customer claim.</h2><p className="mt-2 text-sm leading-6 text-slate-600">Use Create sandbox purchase above. Its payment is verified before the private customer page is created.</p></section>:null}
      <footer className="mt-5 text-xs leading-5 text-slate-500">Fictional merchandise and PayPal Sandbox. AG Studio’s evaluation watermark is retained. {!state.hosted&&<><a href="/practice" className="ml-2 inline-flex min-h-11 items-center text-teal-800 underline focus-visible:outline-2 focus-visible:outline-teal-700">Run one simulated practice claim</a><a href="/training" className="ml-4 inline-flex min-h-11 items-center text-teal-800 underline focus-visible:outline-2 focus-visible:outline-teal-700">Separate training workspace</a></>}</footer>
    </>}
  </Frame>;
}
