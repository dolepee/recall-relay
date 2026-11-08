import React from 'react';
import {Button} from '@base-ui/react/button';
import {clsx} from 'clsx';
import {twMerge} from 'tailwind-merge';
import {RelayMark} from './system.jsx';
export const cn=(...v)=>twMerge(clsx(v));
export const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
export const titles={AWAITING_CUSTOMER:'Waiting for your claim',NEEDS_INFORMATION:'More information needed',SUBMITTED:'With the merchant',MANUAL:'Manual review needed',READY_FOR_APPROVAL:'Ready for refund',REVIEW:'Needs review',RESERVED:'Refund reserved',UNKNOWN:'Checking payment',PENDING:'Refund processing',COMPLETED:'Refund confirmed',FAILED:'Payment needs attention',CANCELLED:'Payment needs attention'};
export const inputClass='rr-input mt-2 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700';
export function Action({children,secondary=false,className,...props}){return <Button data-secondary={secondary?'true':'false'} className={cn('rr-action rr-btn inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50',secondary?'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50':'bg-teal-700 text-white hover:bg-teal-800',className)} {...props}>{children}</Button>;}
export function ErrorText({error}){return error?<p role="alert" className="rr-error mt-4 rounded-md border border-slate-300 bg-slate-50 p-4 text-sm text-slate-900">{error}</p>:null;}
export function Status({code}){return <span data-code={code} className="rr-status inline-flex rounded px-2 py-1 text-xs font-semibold">{titles[code]||code}</span>;}
export function CorrectionNote({value,customer=false,reviewed=false,completed=false}){if(!value)return null;const Heading=customer?'h2':'h3';const heading=value.state==='REQUESTED'?(customer?'The merchant needs an update':'Waiting for the customer’s update'):completed?(customer?'Your update is complete':'Change request closed'):reviewed?(customer?'Your update has been reviewed':'Customer response reviewed'):'Customer response recorded';const photoNote=value.replacePhoto?(value.state==='REQUESTED'?'A replacement photograph is required.':completed||reviewed?'A replacement photograph was included in this update.':'A replacement photograph was submitted for review.'):null;const footer=completed?(customer?'Your refund is confirmed. This page shows the latest request and response.':'This claim is complete; the latest request and response remain visible.'):reviewed?(customer?'The merchant has reviewed your update.':'Review recorded for this claim version.'):(customer?'Your update is with the merchant. It does not approve a refund.':'Review the current evidence before approving a refund.');return <section aria-label="Latest change request" className="rr-note mt-4 rounded-md border border-slate-300 bg-slate-50 p-4"><Heading className="font-semibold text-balance">{heading}</Heading><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{value.message}</p>{photoNote&&<p className="mt-2 text-sm font-medium">{photoNote}</p>}{value.response&&<div className="mt-3 border-t border-slate-200 pt-3"><p className="text-xs font-medium text-slate-600">Customer response</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{value.response}</p><p className="mt-2 text-xs text-slate-500">{footer}</p></div>}</section>;}
const merchantNav=[['Claims','/desk'],['Prepare claim','/setup'],['Guided claim','/practice']];
export function Frame({children,customer=false,sourceReview=false,note,merchant=false,sample=false,title}){
  const active=sample?'/sample':sourceReview?'/setup':'/desk';
  const links=<>{merchantNav.map(([label,href])=><a key={href} href={href} aria-current={href===active?'page':undefined}>{label}</a>)}</>;
  return <><title>{title||(customer?'Your recall claim · Recall Relay':sourceReview?'Prepare claim · Recall Relay':sample?'Sample claims · Recall Relay':'Claims · Recall Relay')}</title>
    <div className={cn('rr-app rr-product-shell',customer?'merchant-shell rr-customer-shell':'merchant-shell')}>
      <a href="#main" className="rr-skip">Skip to main content</a>
      <header className="rr-header"><div className="rr-header__inner">
        <a className="rr-lockup" href="/" aria-label="Recall Relay, home"><RelayMark/><span><span className="rr-lockup__name">Recall <i>Relay</i></span><span className="rr-lockup__sub">{customer?'Private claim':'Recall resolution'}</span></span></a>
        {!customer&&<><nav aria-label="Merchant navigation" className="rr-nav">{links}</nav><details className="rr-mobile-menu" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}}><summary>Menu</summary><nav aria-label="Merchant navigation">{links}<a href="/sample">Sample claims</a><a href="/">Home</a></nav></details></>}
        <p className="rr-header__note">{note||(sample?'Read-only · fictional claims':sourceReview?'Sandbox · prepare instructions':'PayPal Sandbox · test funds')}</p>
      </div></header>
      <main id="main" className="rr-main">{children}</main>
    </div>
  </>;
}
export function AllocationSummary({value,amountCents,compact=false}){
  return <section className={cn('rr-allocation',compact&&'rr-allocation--compact')} aria-label="Refund allocation">
    <h3>Refund summary</h3>
    <dl className="rr-amounts">
      <div><dt>{value?'Affected item':'Item refund'}</dt><dd>{money(value?.affectedCents??amountCents)}</dd></div>
      {value?<><div><dt>Excluded items</dt><dd>{money(value.excludedCents)}</dd></div><div><dt>Original purchase</dt><dd>{money(value.originalCents)}</dd></div></>:<div><dt>Original / excluded breakdown</dt><dd>Unavailable</dd></div>}
      <div><dt>Destination</dt><dd className="rr-destination">Original PayPal payment</dd></div>
    </dl>
    {!value&&<p className="rr-muted">The original purchase breakdown is not recorded for this claim.</p>}
  </section>;
}
export async function api(path,data,token){const response=await fetch(`/api/${path}${path.startsWith('claim/')&&new URLSearchParams(location.search).has('workspace')?'?workspace='+encodeURIComponent(new URLSearchParams(location.search).get('workspace')):''}`,{method:data===undefined?'GET':'POST',headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});const result=await response.json();if(!response.ok){const error=new Error(result.error||'Unable to complete this action.');error.reason=typeof result.reason==='string'?result.reason:(typeof result.code==='string'?result.code:null);error.stale=result.stale===true||/^STALE_(CONTEXT|REVISION)$/.test(error.reason||'');error.expired=result.expired===true;throw error;}return result;}
export function Receipt({value}){return <section aria-label="Refund receipt" className="rr-receipt mt-5 rounded-lg border border-teal-200 bg-teal-50 p-5"><p className="text-sm font-medium text-teal-800">PayPal-confirmed sandbox refund</p><h2 className="mt-2 text-3xl font-semibold tabular-nums text-teal-950">{money(value.amountCents)}</h2><p className="mt-2 text-sm text-teal-950">Returned to the original PayPal payment using test funds.</p><dl className="mt-4 space-y-2 text-sm"><div className="flex flex-wrap justify-between gap-2"><dt className="text-teal-900">Status</dt><dd className="font-semibold">Completed</dd></div><div className="flex flex-wrap justify-between gap-2"><dt className="text-teal-900">Refund reference</dt><dd className="break-all font-mono text-xs">{value.refundId}</dd></div></dl></section>;}
