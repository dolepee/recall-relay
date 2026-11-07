import React,{createContext,useContext} from 'react';
import {money,AllocationSummary} from './components.jsx';

export const SampleContext=createContext(null);
const sampleTitles={AWAITING_CUSTOMER:'Waiting',SUBMITTED:'Review',READY_FOR_APPROVAL:'Ready',NEEDS_INFORMATION:'Correction',FAILED:'Payment exception',COMPLETED:'Sample completed'};
const kindLabel={PHOTO:'Photograph',CONFIRMATION:'Confirmation',TEXT:'Written information'};
const requirementState={missing:'Missing',submitted:'Submitted',recorded:'Recorded',reviewed:'Reviewed',correction:'Correction requested'};
const requirementCode=state=>state==='correction'?'NEEDS_INFORMATION':state==='missing'?'AWAITING_CUSTOMER':undefined;
export function SampleStatus({code}){return <span data-code={code==='COMPLETED'?undefined:code} className="rr-status">{sampleTitles[code]||code}</span>;}
function useSampleCase(){const value=useContext(SampleContext);if(!value)throw new Error('Sample desk context is missing.');return value;}

export function SampleOrderCell({value}){const {selected,selectCase,caseForOrder}=useSampleCase();const item=caseForOrder(String(value));return <button type="button" aria-pressed={selected===String(value)} aria-controls="sample-review" title={item.source.product} className="flex min-h-11 w-full min-w-0 flex-col justify-center text-left focus-visible:outline-2 focus-visible:outline-teal-700" onClick={()=>selectCase(String(value))}><span className="max-w-full truncate text-sm font-semibold text-teal-900">{item.source.product}</span><span className="text-xs text-slate-500">{value}</span><span className="text-xs font-medium tabular-nums text-slate-700">{money(item.amountCents)}</span></button>;}

export function SampleCasePanel({headingRef}){
  const {selected,caseForOrder}=useSampleCase(),item=caseForOrder(selected);
  if(!item)return <section id="sample-review" className="p-5"><h2 ref={headingRef} tabIndex={-1} id="sample-review-heading" className="font-semibold">No sample claim in this view</h2><p role="status" className="mt-2 text-sm">Choose another overview category to inspect a fictional claim.</p></section>;
  return <section id="sample-review" aria-labelledby="sample-review-heading" className="h-full overflow-auto p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold  text-slate-500">Selected sample claim</p><h2 ref={headingRef} id="sample-review-heading" tabIndex={-1} className="mt-2 scroll-mt-24 text-xl font-semibold text-balance focus-visible:outline-2 focus-visible:outline-teal-700">{item.source.product}</h2><p className="mt-1 text-sm text-slate-500">{item.order} · revision {item.revision}</p></div><SampleStatus code={item.status.code}/></div>
    <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-700">{item.status.reason}</p>
    <AllocationSummary compact value={{originalCents:item.originalCents,affectedCents:item.amountCents,excludedCents:item.unaffectedCents}} amountCents={item.amountCents}/>
    <h3 className="mt-5 text-sm font-semibold">Recorded evidence</h3>
    <p className="mt-2 text-sm leading-6 text-slate-700">{item.evidence.summary}</p>
    {item.correction?.state==='REQUESTED'&&<div className="mt-4 rounded-md border border-[color:var(--m-warn-line)] bg-[color:var(--m-warn-bg)] p-4"><p className="text-sm font-semibold">Correction requested by the sample merchant</p><p className="mt-2 text-sm leading-6">{item.correction.message}</p></div>}
    {item.payment?.state==='FAILED'&&<div className="mt-4 rounded-md border border-[color:var(--m-danger-line)] bg-[color:var(--m-danger-bg)] p-4"><p className="text-xs font-semibold  text-[color:var(--m-danger)]">Sample payment exception</p><p className="mt-2 text-sm leading-6">The fixture payment record needs attention. No further refund is sent in this sample; no payment provider is connected.</p></div>}
    {item.receipt&&<div className="mt-4 rounded-md border border-slate-300 bg-slate-50 p-4"><p className="text-xs font-semibold  text-slate-600">Sample receipt</p><p className="mt-1 text-2xl font-semibold tabular-nums">{money(item.receipt.amountCents)}</p><p className="mt-1 text-sm leading-6">Fixture record only. No PayPal call was made and no funds moved.</p><p className="mt-2 break-all font-mono text-xs">{item.receipt.reference}</p></div>}
    <p className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">Sample record only. No PayPal login, payment call, workspace creation or AI analysis is involved in viewing this page.</p>
  </section>;
}

export function SourceRequirementsWidget(){
  const {selected,caseForOrder}=useSampleCase(),item=caseForOrder(selected);
  if(!item)return null;
  return <section aria-label="Source-linked requirements" className="h-full overflow-auto p-4">
    <h2 className="text-base font-semibold">Source-linked requirements</h2>
    <p className="mt-1 text-xs leading-5 text-slate-500">{item.source.label}</p>
    <ol className="mt-3 divide-y divide-slate-200 border-y border-slate-200">{item.requirements.map(field=><li key={field.id} className="py-2" title={field.sourceRef}><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold  text-slate-500">{kindLabel[field.kind]}</span><span className="rr-status" data-code={requirementCode(field.state)}>{requirementState[field.state]||field.state}</span></div><p className="mt-1 text-xs leading-4 text-slate-700">“{field.quote}”</p></li>)}</ol></section>;
}

export function PaymentExceptionsWidget(){
  const {selected,caseForOrder}=useSampleCase(),item=caseForOrder(selected);
  if(!item)return null;const p=item.payment;
  const paymentCode=p.state==='FAILED'?'FAILED':p.state==='READY'?'READY_FOR_APPROVAL':undefined;
  return <section aria-label="Payment exception and amount" className="h-full overflow-auto p-4">
    <h2 className="text-base font-semibold">Payment state</h2>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold">Recorded state</span><span data-code={paymentCode} className="rr-status">{p.label}</span></div>
    <dl className="mt-4 space-y-2 text-sm"><div className="flex flex-wrap justify-between gap-2"><dt className="text-slate-500">Amount in record</dt><dd className="font-semibold tabular-nums">{money(p.amountCents)}</dd></div><div className="flex flex-wrap justify-between gap-2"><dt className="text-slate-500">Recorded reference</dt><dd className="break-all font-mono text-xs">{p.reference||'None'}</dd></div></dl>

    <p className="mt-3 text-xs leading-4 text-slate-500">No payment provider is connected to this sample desk.</p>
  </section>;
}

export function AmountSummaryWidget(){
  const {selected,caseForOrder}=useSampleCase(),item=caseForOrder(selected);
  if(!item)return null;
  return <section aria-label="Sample amounts" className="h-full overflow-auto p-4">
    <h2 className="text-base font-semibold">Amounts</h2>
    <dl className="mt-2 space-y-1.5 text-sm"><div className="flex flex-wrap justify-between gap-2"><dt className="text-slate-500">Affected item</dt><dd className="font-semibold tabular-nums">{money(item.amountCents)}</dd></div><div className="flex flex-wrap justify-between gap-2"><dt className="text-slate-500">Unaffected item</dt><dd className="tabular-nums">{money(item.unaffectedCents)}</dd></div><div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-2"><dt className="text-slate-500">Original capture</dt><dd className="font-semibold tabular-nums">{money(item.originalCents)}</dd></div></dl>
  </section>;
}
