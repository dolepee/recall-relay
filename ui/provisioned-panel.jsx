import React,{useState} from 'react';
import {Action,ErrorText,money,titles} from './components.jsx';

// A provisioned purchase is created by an operator for one workspace before any claim exists.
// The browser can only name the grant it wants bound: the server decides whether this
// authenticated workspace owns it, reads the provider once and records the allocation. No
// capture reference, amount or "verified" flag is ever supplied by the page.

const known=value=>value!==null&&value!==undefined&&Number.isSafeInteger(value)&&value>=0;
const amount=value=>known(value)?money(value):'Unknown';
const mappingLabel=value=>value==='OPERATOR_REVIEWED'?'Operator-reviewed mapping':'Mapping not reviewed';
const stamp=value=>{if(!value)return 'time not recorded';const date=new Date(value);return Number.isNaN(date.getTime())?'time not recorded':`${date.toISOString().slice(0,16).replace('T',' ')} UTC`;};
const boundOrder=grant=>typeof grant?.boundOrder==='string'?grant.boundOrder:typeof grant?.claimOrder==='string'?grant.claimOrder:null;
const statusLabel=code=>titles[code]||(code?String(code).replaceAll('_',' ').toLowerCase():'Recorded');
const kindLabel=value=>value==='OPERATOR_PROVISIONED'?'Operator-provisioned':(value?String(value).replaceAll('_',' ').toLowerCase():'Kind not recorded');
function Provenance({value}){
  if(!value||typeof value!=='object')return null;
  return <div className="mt-3 min-w-0 border-t border-teal-200 pt-3" aria-label="Purchase provenance">
    <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-teal-900">Purchase provenance</p>
    <dl className="mt-2 grid gap-1 text-[11px] leading-4 text-teal-950 sm:grid-cols-2">
      <div><dt className="inline text-teal-800">Kind: </dt><dd className="inline font-medium">{kindLabel(value.kind)}</dd></div>
      <div><dt className="inline text-teal-800">Operator: </dt><dd className="inline break-words font-medium">{value.operator||'Operator not recorded'}</dd></div>
      <div><dt className="inline text-teal-800">Provisioned: </dt><dd className="inline font-medium">{stamp(value.provisionedAt)}</dd></div>
      <div><dt className="inline text-teal-800">Catalog mapping: </dt><dd className="inline font-medium">{mappingLabel(value.catalogMapping)}</dd></div>
      <div className="sm:col-span-2"><dt className="inline text-teal-800">Provider readback at binding: </dt><dd className="inline font-medium">{stamp(value.providerVerifiedAt)}</dd></div>
    </dl>
    <p className="mt-2 break-words text-[11px] leading-4 text-teal-900">Provider readback confirms the binding at that time. It does not verify the lot, item contents or source instructions.</p>
  </div>;
}

function Grant({grant,busy,confirming,onAsk,onCancel,onBind}){
  const order=boundOrder(grant);
  return <li className="min-w-0 border-t border-slate-200 py-3 first:border-0" aria-label={`Provisioned purchase ${grant.sku||'SKU not recorded'}`}>
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1">
        <p className="min-w-0 break-all text-sm font-semibold">{grant.sku||'SKU not recorded'} · lot {grant.lot||'not recorded'}</p>
        <p className="mt-1 min-w-0 break-all font-mono text-[11px] leading-4 text-slate-500">Grant {grant.grantId}</p>
        <p className="mt-1 min-w-0 break-words text-xs leading-5 text-slate-700">Item paid {amount(grant.itemPaidCents)} · capture {amount(grant.captureCents)}</p>
        <p className="mt-1 min-w-0 break-words text-[11px] leading-4 text-slate-500">{mappingLabel(grant.catalogMapping)} · provisioned by {grant.operator||'an operator not recorded'} · {stamp(grant.provisionedAt)}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span className="rr-status">Operator-recorded</span>
        {order?<span className="rr-status" data-code="COMPLETED">Bound to {order}</span>:confirming?null:<Action secondary disabled={busy} onClick={()=>onAsk(grant.grantId)}>Bind purchase</Action>}
      </div>
    </div>
    {confirming&&<div className="mt-3 min-w-0 rounded-md border border-[color:var(--m-warn-line)] bg-[color:var(--m-warn-bg)] p-3" role="group" aria-label={`Confirm binding ${grant.grantId}`}>
      <p className="text-xs leading-5">Binding reads the provider once and records a permanent allocation to this workspace. It cannot be moved to another workspace or claim afterwards, and a capture that is already allocated cannot be bound again.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2"><Action disabled={busy} onClick={()=>onBind(grant.grantId)}>{busy?'Binding and checking the provider…':'Bind and record'}</Action><Action secondary disabled={busy} onClick={onCancel}>Cancel</Action></div>
    </div>}
  </li>;
}

export function ProvisionedPurchases({state,run,busy=false}){
  const [confirming,setConfirming]=useState(null),[bound,setBound]=useState(null),[boundGrants,setBoundGrants]=useState({}),[error,setError]=useState('');
  // No field, no panel: an older backend keeps the desk exactly as it was.
  const grants=Array.isArray(state?.provisionedPurchases)?state.provisionedPurchases:null;
  if(!grants)return null;
  const rows=grants.map(grant=>(boundGrants[grant.grantId]?{...grant,boundOrder:boundGrants[grant.grantId]}:grant));
  async function bind(grantId){
    setError('');
    const result=await run('bind-purchase',{grantId});
    setConfirming(null);
    if(!result||typeof result.order!=='string'){setError('No claim was recorded for that purchase. Check the provider record before trying again.');return;}
    setBound(result);setBoundGrants(current=>({...current,[grantId]:result.order}));
  }
  return <details className="rr-card mb-4 px-5" aria-label="Provisioned purchases" open={!!bound}>
    <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2 py-3 text-sm focus-visible:outline-2 focus-visible:outline-teal-700"><span className="font-semibold">Provisioned purchases</span><span className="text-xs text-slate-600">{grants.length?`${grants.length} available · operator-provisioned`:'None for this workspace'}</span></summary>
    <div className="border-t border-slate-100 pb-5 pt-4">
      <p className="max-w-3xl text-sm leading-6 text-slate-600">These purchases were provisioned for this workspace by an operator. Binding one asks the server to read that capture at the provider and record it here; the page names the grant only, so it cannot choose an amount, a capture or a verified outcome. Missing items, unclear quantity, tax, shipping, discount splits and prior refunds stay in manual review.</p>
      {grants.length?<ul className="mt-4 min-w-0 space-y-3">{rows.map(grant=><Grant key={grant.grantId} grant={grant} busy={busy} confirming={confirming===grant.grantId} onAsk={id=>{setError('');setConfirming(id);}} onCancel={()=>setConfirming(null)} onBind={bind}/>)}</ul>:<p className="mt-4 text-sm leading-6 text-slate-600">Nothing is provisioned here yet. An operator has to attach a captured payment to this workspace before it can appear.</p>}
      {bound&&<section className="mt-4 min-w-0 rounded-md border border-teal-200 bg-teal-50 p-4" aria-label="Recorded binding">
        <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-teal-900">Recorded</p>
        <h4 className="mt-1 break-words text-base font-semibold text-teal-950">{bound.order} · {statusLabel(bound.status?.code)}</h4>
        <p className="mt-1 text-sm leading-6 text-teal-950">Refundable amount {amount(bound.amountCents)}. The amount follows the capture the server read, so it is not a fixed item price.</p>
        <p className="mt-2 break-words text-xs leading-5 text-teal-900">Binding is recorded evidence for this claim. It is not a refund or an approval: refunding still needs the usual evidence review.</p>
        <Provenance value={bound.purchaseProvenance}/>
      </section>}
      <ErrorText error={error}/>
      <dl className="mt-4 grid gap-2 border-t border-slate-200 pt-3 text-[11px] leading-4 text-slate-500 sm:grid-cols-3" aria-label="Recorded and advisory values">
        <div><dt className="font-semibold text-slate-700">Recorded</dt><dd className="mt-0.5">Held by the server or read back from the provider: claim state, allocation and refund references.</dd></div>
        <div><dt className="font-semibold text-slate-700">Operator-recorded</dt><dd className="mt-0.5">Entered when this purchase was provisioned. The server matches it to the provider before a claim exists.</dd></div>
        <div><dt className="font-semibold text-slate-700">Advisory</dt><dd className="mt-0.5">Declared or estimated figures no provider has confirmed. They never authorize a refund.</dd></div>
      </dl>
      {state?.workspaceId&&<p className="mt-3 break-all font-mono text-[11px] text-slate-500">Workspace reference {state.workspaceId} · reference only, not an authorization</p>}
    </div>
  </details>;
}
