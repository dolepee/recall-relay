import React,{useEffect,useState} from 'react';
import {AlertDialog} from '@base-ui/react/alert-dialog';
import {Action,ErrorText,Frame,CorrectionNote,money,inputClass,api,cn} from './components.jsx';

const kindLabel={PHOTO:'Photograph',CONFIRMATION:'Confirmation',TEXT:'Written information'};
const practiceTitles={AWAITING_CUSTOMER:'Waiting for the claim',NEEDS_INFORMATION:'More information needed',SUBMITTED:'With the merchant',MANUAL:'Manual review needed',REVIEW:'Needs review',READY_FOR_APPROVAL:'Ready for simulated refund',RESERVED:'Simulated refund prepared',UNKNOWN:'Simulated refund needs attention',PENDING:'Simulated refund processing',COMPLETED:'Simulated refund recorded',FAILED:'Simulated refund needs attention',CANCELLED:'Simulated refund needs attention'};
function PracticeStatus({code}){return <span className={cn('inline-flex rounded px-2 py-1 text-xs font-semibold',code==='COMPLETED'||code==='READY_FOR_APPROVAL'?'bg-teal-50 text-teal-800':'bg-slate-100 text-slate-700')}>{practiceTitles[code]||code}</span>;}

function StageBar({value}){
  const c=value?.case||{};
  const active=c.refund||c.review||c.plan?.status==='READY_FOR_APPROVAL'?2:c.submission||c.correction?1:0;
  const stages=[['Prepare claim','Notice, affected item, instructions'],['Review evidence','Evidence and one correction if needed'],['Approve refund','Affected item only; simulated record']];
  return <ol className="rr-stages practice-stagebar" aria-label="Practice stages">{stages.map(([title,detail],i)=><li key={title} aria-current={i===active?'step':undefined}><b>{String(i+1).padStart(2,'0')} · {title}</b><span className="block font-sans text-[11px] font-normal normal-case tracking-normal text-slate-500">{detail}</span></li>)}</ol>;
}

function stageState(value){
  const c=value?.case||{};
  return c.refund||c.review||c.plan?.status==='READY_FOR_APPROVAL'?2:c.submission||c.correction?1:0;
}

function StageProgress({value}){
  const active=stageState(value);
  const labels=['Prepare claim','Review evidence','Approve refund'];
  return <div className="practice-progress">
    <span>Stage {active+1} of 3</span>
    <b>{labels[active]}</b>
    <div aria-hidden="true"><i style={{width:`${((active+1)/3)*100}%`}}/></div>
  </div>;
}

function MoneyLine({value}){
  return <p className="practice-money" aria-label="Practice amounts">
    <span><b>{money(value.scenario.affectedCents)}</b> affected</span>
    <span aria-hidden="true">·</span>
    <span><b>{money(value.scenario.unaffectedCents)}</b> excluded</span>
    <span aria-hidden="true">·</span>
    <span>Simulated, no funds move</span>
  </p>;
}

function Scenario({value}){
  const s=value.scenario;
  return <section aria-labelledby="practice-source" className="rounded-lg border border-slate-200 bg-white p-5">
    <p className="text-xs font-semibold text-slate-500">{s.sourceLabel}</p>
    <h2 id="practice-source" className="mt-2 text-lg font-semibold text-balance">{s.title}</h2>
    <p className="mt-3 text-sm leading-6 text-slate-600">{s.notice}</p>
    <p className="mt-3 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600">{s.sourceNote}</p>
    <h3 className="mt-5 text-sm font-semibold">Reviewed claim requirements</h3>
    <ol className="mt-3 space-y-3">{s.requirements.map(f=><li key={f.id} className="rounded-md border border-slate-200 p-4"><p className="text-xs font-semibold text-slate-500">{f.citation} · {kindLabel[f.kind]}</p><p className="mt-2 text-sm leading-6">“{f.quote}”</p></li>)}</ol>
    <div className="mt-5 rounded-md border border-dashed border-slate-300 p-4">
      <p className="text-xs font-semibold text-slate-600">{s.exampleDraft.label}</p>
      <p className="mt-2 text-sm leading-6">“{s.exampleDraft.text}”</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{s.exampleDraft.note}</p>
    </div>
  </section>;
}

function Purchase({value}){
  const s=value.scenario;
  return <section aria-labelledby="practice-purchase" className="rounded-lg border border-slate-200 bg-white p-5">
    <h2 id="practice-purchase" className="text-lg font-semibold">Fictional purchase</h2>
    <p className="mt-1 text-sm text-slate-500">{value.case.id} · practice order</p>
    <dl className="mt-4 space-y-3 text-sm">
      <div className="flex justify-between gap-3 border-b border-slate-200 pb-3"><dt className="text-slate-600">Purchase total</dt><dd className="font-semibold tabular-nums">{money(s.totalCents)}</dd></div>
      <div className="flex justify-between gap-3 rounded-md bg-teal-50 p-3"><dt className="text-teal-900">Affected item · {s.sku} · {s.lot}<span className="mt-1 block text-xs text-teal-800">The only line inside this notice</span></dt><dd className="font-semibold tabular-nums text-teal-950">{money(s.affectedCents)}</dd></div>
      <div className="flex justify-between gap-3 rounded-md bg-slate-50 p-3"><dt className="text-slate-600">Relay Home tray<span className="mt-1 block text-xs text-slate-500">Outside the notice · not refunded</span></dt><dd className="font-semibold tabular-nums text-slate-700">{money(s.unaffectedCents)}</dd></div>
      <div className="flex justify-between gap-3"><dt className="text-slate-600">Return destination</dt><dd>Simulated original payment</dd></div>
    </dl>
    <p className="mt-4 text-xs leading-5 text-slate-500">Merchandise is fictional. Nothing here is a real order, a real notice or real money.</p>
  </section>;
}

function CustomerPanel({value,run,busy,error,onRefresh,stale}){
  const c=value.case;
  const [lot,setLot]=useState(c.submission?.lot||'');
  const [ack,setAck]=useState(false);
  const [extra,setExtra]=useState(c.submission?.extra||{});
  const [photo,setPhoto]=useState(undefined);
  const [fileName,setFileName]=useState('');
  const [reading,setReading]=useState(false);
  const [response,setResponse]=useState('');
  const [localError,setLocalError]=useState('');
  useEffect(()=>{setLot(c.submission?.lot||'');setAck(false);setExtra(c.submission?.extra||{});setPhoto(undefined);setFileName('');setResponse('');setLocalError('');},[c.id,c.revision]);
  async function pickFile(event){
    const file=event.target.files?.[0];if(!file)return;
    setLocalError('');setPhoto(undefined);setFileName('');
    if(!['image/png','image/jpeg'].includes(file.type)||file.size>2*1024*1024){setLocalError('Choose a PNG or JPEG image smaller than 2 MB.');event.target.value='';return;}
    setReading(true);
    try{
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('The image could not be read.'));reader.readAsDataURL(file);});
      setPhoto(data);setFileName(file.name);
    }catch(e){setLocalError(e.message);}finally{setReading(false);}
  }
  async function useSample(kind){
    setLocalError('');setReading(true);
    try{
      const responseFetch=await fetch(`/assets/practice-label-${kind}.png`);
      if(!responseFetch.ok)throw new Error('The fictional sample label could not be loaded.');
      const blob=await responseFetch.blob();
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('The image could not be read.'));reader.readAsDataURL(blob);});
      setPhoto(data);setFileName(`fictional-sample-label-${kind}.png`);
    }catch(e){setLocalError(e.message);}finally{setReading(false);}
  }
  async function submit(event){event.preventDefault();await run('submit',{caseId:c.id,attempt:value.attempt,revision:c.revision,lot,acknowledged:ack,extra,correctionResponse:response,...(photo===undefined?{}:{photo})});}
  const fields=(value.scenario.requirements||[]).filter(f=>f.kind!=='PHOTO');
  return <section aria-labelledby="practice-customer" className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-medium text-teal-800">Customer view</p><h2 id="practice-customer" className="mt-1 text-xl font-semibold">Your practice claim</h2></div><PracticeStatus code={c.status.code}/></div>
    <p role="status" className="mt-3 text-sm leading-6 text-slate-700">{c.status.reason}</p>
    <CorrectionNote value={c.correction} customer completed={c.status.code==='COMPLETED'||!!c.receipt} reviewed={!!c.review}/>
    {c.submission&&c.missing.length>0&&!c.locked&&<div className="mt-4 rounded-md bg-slate-50 p-4"><p className="text-sm font-semibold">Still needed</p><ul className="mt-2 list-disc space-y-2 pl-5 text-sm">{c.missing.map(x=><li key={x}>{x}</li>)}</ul></div>}
    {c.submission&&c.missing.length===0&&!c.locked&&c.correction?.state!=='REQUESTED'&&!c.refund&&<section aria-label="Evidence received" className="mt-4 border border-slate-300 bg-white p-4">
      <p className="text-xs font-semibold text-slate-500">Evidence received</p>
      <p className="mt-1 text-lg font-semibold">This version is with the merchant.</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">No review or simulated refund has been recorded. You can edit the submission, but saving a new version clears any prior review.</p>
      <Action className="mt-4" disabled={busy} onClick={()=>run('role',{role:'merchant'})}>Continue as merchant</Action>
    </section>}
    {!c.locked&&<details open={!c.submission||c.correction?.state==='REQUESTED'||c.missing.length>0} className="mt-5 border-t border-slate-200 pt-2"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-teal-800">{c.submission?'Edit submitted evidence':'Add customer evidence'}</summary><form onSubmit={submit} className="pt-2">
      <label className="block text-sm font-medium" htmlFor="practice-lot">Lot printed on the cup<input id="practice-lot" className={inputClass} value={lot} maxLength={40} onChange={e=>setLot(e.target.value)} disabled={busy} placeholder="For example, LOT-A"/></label>
      <div className="mt-4"><p className="text-sm font-medium">Label photograph</p><div className="mt-2 flex flex-wrap gap-2"><Action secondary type="button" disabled={busy||reading} onClick={()=>useSample('a')}>Use fictional sample label A</Action><Action secondary type="button" disabled={busy||reading} onClick={()=>useSample('b')}>Use fictional sample label B</Action></div><p className="mt-2 text-xs leading-5 text-slate-500">Two example labels are provided so this practice case can be completed without a real photo. These are invented product images.</p></div>
      <label className="mt-3 block text-sm font-medium" htmlFor="practice-photo">Or upload a PNG or JPEG under 2 MB<input id="practice-photo" type="file" accept="image/png,image/jpeg" onChange={pickFile} disabled={busy||reading} className="mt-2 block min-h-11 w-full rounded-md border border-slate-300 p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-2 focus-visible:outline-2 focus-visible:outline-teal-700"/></label>
      <p role="status" className="mt-2 text-sm text-teal-800">{reading?'Reading image…':fileName?`${fileName} ready to submit`:c.submission?.hasPhoto?'Your previous photograph is saved.':''}</p>
      {photo&&<img src={photo} alt="Photograph selected for this practice claim" className="mt-3 max-h-64 max-w-full rounded-md border border-slate-200 object-contain"/>}
      <label className="mt-4 flex min-h-11 items-start gap-3 py-3 text-sm leading-6"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} disabled={busy} className="mt-1 size-5 shrink-0 accent-teal-700"/>I confirm this is the item from my fictional practice purchase.</label>
      {fields.map(field=>field.kind==='CONFIRMATION'
        ?<label key={field.id} className="mt-3 flex min-h-11 items-start gap-3 rounded-md border border-slate-200 p-4 text-sm leading-6"><input type="checkbox" checked={extra[field.id]===true} onChange={e=>setExtra(old=>({...old,[field.id]:e.target.checked}))} disabled={busy} className="mt-1 size-5 shrink-0 accent-teal-700"/><span>{field.quote}<span className="mt-2 block text-xs text-slate-500">Answering this records your statement; it is not verified for you.</span></span></label>
        :<label key={field.id} className="mt-4 block text-sm font-medium">{field.quote}<textarea className={inputClass} rows={3} value={extra[field.id]||''} maxLength={500} disabled={busy} onChange={e=>setExtra(old=>({...old,[field.id]:e.target.value}))}/></label>)}
      {c.correction?.state==='REQUESTED'&&<label className="mt-5 block text-sm font-medium">Your response to the merchant<textarea className={inputClass} rows={3} value={response} required minLength={3} maxLength={1000} disabled={busy} onChange={e=>setResponse(e.target.value)} placeholder="Describe what you changed or clarify the requested information."/></label>}
      <ErrorText error={localError||error}/>
      {stale&&<Action secondary type="button" className="mt-3" onClick={onRefresh}>Refresh practice case</Action>}
      <Action type="submit" className="mt-4 w-full sm:w-auto" disabled={busy||reading}>{busy?'Saving practice claim…':c.correction?.state==='REQUESTED'?'Send updated evidence':c.submission?'Update practice claim':'Submit practice claim'}</Action>
      <p className="mt-3 text-xs leading-5 text-slate-500">Reload this page and the practice case stays here. Submitting does not approve a refund or contact anyone. Saving an edited version creates a new revision and clears any recorded review.</p>
    </form></details>}
    {c.refund&&<section aria-label="Simulated refund record" className="mt-5 rounded-lg border border-teal-200 bg-teal-50 p-5"><p className="text-sm font-semibold text-teal-900">Simulated refund · no funds moved</p><h3 className="mt-2 text-2xl font-semibold tabular-nums text-teal-950">{money(c.refund.cents)}</h3><p className="mt-2 text-sm leading-6 text-teal-950">Recorded on this practice case only. No payment provider was contacted and the $34.00 tray stays outside the refund.</p><dl className="mt-3 space-y-2 text-sm"><div className="flex flex-wrap justify-between gap-2"><dt className="text-teal-900">Status</dt><dd className="font-semibold">Simulated · completed</dd></div>{c.refund.reference&&<div className="flex flex-wrap justify-between gap-2"><dt className="text-teal-900">Practice reference</dt><dd className="break-all font-mono text-xs">{c.refund.reference}</dd></div>}</dl></section>}
    {c.unresolved&&<section aria-label="Unresolved simulated refund" className="mt-5 rounded-lg border border-slate-300 bg-slate-50 p-5"><p className="text-sm font-semibold text-slate-900">Simulated refund not recorded</p><p className="mt-2 text-sm leading-6 text-slate-700">A {money(c.unresolved.cents)} attempt is {c.unresolved.state.toLowerCase()} on this practice case. No funds moved and no payment provider was contacted. The merchant can resume a prepared attempt or start a new practice case.</p></section>}
    <ErrorText error={error}/>
  </section>;
}

function MerchantPanel({value,run,busy,error,onRefresh,stale}){
  const c=value.case;
  const [reviewed,setReviewed]=useState(false);
  const [message,setMessage]=useState('');
  const [replacePhoto,setReplacePhoto]=useState(true);
  const [confirmOpen,setConfirmOpen]=useState(false);
  useEffect(()=>{setReviewed(false);setMessage('');setReplacePhoto(true);setConfirmOpen(false);},[c.id,c.revision]);
  const ready=c.plan.status==='READY_FOR_APPROVAL'&&!c.locked&&Boolean(c.plan.digest);
  const canReview=!c.locked&&c.submission&&c.missing.length===0&&c.correction?.state!=='REQUESTED'&&!c.review;
  const binding={caseId:c.id,attempt:value.attempt,revision:c.revision};
  if(!c.submission&&!c.correction) return <section aria-labelledby="practice-merchant" className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
    <p className="text-sm font-medium text-teal-800">Practice setup</p><h2 id="practice-merchant" className="mt-1 text-xl font-semibold">Start with the customer’s evidence</h2>
    <p className="mt-3 text-sm leading-6 text-slate-700">The notice is ready. Add the lot, a fictional label and the required response, then return here to review the claim.</p>
    <Action className="mt-4" onClick={()=>run('role',{role:'customer'})}>Open customer view</Action>
    <ErrorText error={error}/>
  </section>;
  return <section aria-labelledby="practice-merchant" className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-medium text-teal-800">Merchant view</p><h2 id="practice-merchant" className="mt-1 text-xl font-semibold">Review the practice claim</h2></div><PracticeStatus code={c.status.code}/></div>
    <p role="status" className="mt-3 text-sm leading-6 text-slate-700">{c.status.reason}</p>
    <dl className="my-4 grid grid-cols-2 gap-3 border-y border-slate-200 py-4 text-sm">
      <dt className="text-slate-500">Affected item refund</dt><dd className="text-right font-semibold tabular-nums">{money(value.scenario.affectedCents)}</dd>
      <dt className="text-slate-500">Unaffected tray</dt><dd className="text-right tabular-nums">{money(value.scenario.unaffectedCents)} · excluded</dd>
      <dt className="text-slate-500">Customer lot</dt><dd className="text-right">{c.submission?.lot||'Not submitted'}</dd>
      <dt className="text-slate-500">Practice lot</dt><dd className="text-right">{value.scenario.lot}</dd>
      <dt className="text-slate-500">Claim version</dt><dd className="text-right tabular-nums">{c.revision}</dd>
      <dt className="text-slate-500">Destination</dt><dd className="text-right">Simulated original payment</dd>
    </dl>
    {c.photo&&<div><h3 className="text-sm font-semibold">Submitted label photograph</h3><img src={c.photo} alt="Customer-submitted product label for this practice claim" className="mt-3 max-h-64 w-full rounded-md border border-slate-200 object-contain"/><p className="mt-2 text-xs text-slate-500">Version {c.revision}. A practice upload does not establish authenticity or eligibility.</p></div>}
    {(value.scenario.requirements||[]).filter(f=>f.kind!=='PHOTO').map(field=><div key={field.id} className="mt-4 rounded-md border border-slate-200 p-4"><p className="text-sm leading-6">“{field.quote}”</p><p className="mt-2 text-sm font-semibold">Customer response: {field.kind==='CONFIRMATION'?(c.submission?.extra?.[field.id]===true?'Confirmed by customer':'Not confirmed'):(c.submission?.extra?.[field.id]||'Not provided')}</p><p className="mt-2 text-xs text-slate-500">A customer statement needs your review; it does not verify the underlying action.</p></div>)}
    <CorrectionNote value={c.correction} reviewed={!!c.review} completed={c.status.code==='COMPLETED'||!!c.receipt}/>
    {!c.locked&&c.missing.length>0&&<div className="mt-4 rounded-md bg-slate-50 p-4"><h3 className="text-sm font-semibold">Waiting for the customer</h3><ul className="mt-2 list-disc space-y-2 pl-5 text-sm">{c.missing.map(x=><li key={x}>{x}</li>)}</ul></div>}
    {canReview&&<div className="mt-4 border-t border-slate-200 pt-3"><label className="flex min-h-11 items-start gap-3 py-3 text-sm leading-6"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)} className="mt-1 size-5 shrink-0 accent-teal-700"/>I inspected this version’s photograph and confirmed the lot, purchase confirmation and required responses match the reviewed practice notice.</label><Action secondary disabled={!reviewed||busy} onClick={()=>run('review',{...binding,confirmed:true})}>Confirm evidence review</Action></div>}
    {!c.locked&&c.submission&&c.correction?.state!=='REQUESTED'&&<details key={`${c.id}-${c.revision}`} className="mt-5 border-t border-slate-200 pt-2"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-teal-800">Request a correction</summary><form onSubmit={e=>{e.preventDefault();run('request-changes',{...binding,message,replacePhoto});}}><p className="text-sm leading-6 text-slate-600">This clears the current evidence review and shows your message on the customer view. A new review is required before any simulated refund.</p><label className="mt-4 block text-sm font-medium">What should the customer change?<textarea className={inputClass} rows={3} value={message} required minLength={10} maxLength={600} disabled={busy} onChange={e=>setMessage(e.target.value)} placeholder="For example, the lot code is too blurred to read. Please upload a clearer photograph."/></label><label className="flex min-h-11 items-start gap-3 py-3 text-sm leading-6"><input type="checkbox" checked={replacePhoto} onChange={e=>setReplacePhoto(e.target.checked)} disabled={busy} className="mt-1 size-5 shrink-0 accent-teal-700"/>Require a replacement photograph</label><Action type="submit" secondary disabled={busy||message.trim().length<10}>{busy?'Saving request…':'Request customer update'}</Action></form></details>}
    {ready&&<div className="mt-5 rounded-lg border border-teal-200 bg-teal-50 p-4"><p className="mb-3 text-sm text-teal-950">This version is reviewed. Record the <strong>simulated</strong> refund for the affected cup only.</p><AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}><AlertDialog.Trigger render={<Action disabled={busy}/>}>Record simulated refund</AlertDialog.Trigger><AlertDialog.Portal><AlertDialog.Backdrop className="rr-dialog-backdrop fixed inset-0 z-40"/><AlertDialog.Popup className="rr-dialog fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 p-6"><AlertDialog.Title className="text-xl font-semibold text-balance">Confirm simulated refund</AlertDialog.Title><AlertDialog.Description className="mt-3 text-sm leading-6 text-pretty text-slate-600">This records {money(value.scenario.affectedCents)} against {c.id} in this practice session. No payment provider is contacted, no credentials are used and no funds move. The {money(value.scenario.unaffectedCents)} tray stays outside the refund.</AlertDialog.Description><div className="mt-6 flex flex-wrap justify-end gap-3"><AlertDialog.Close render={<Action secondary/>}>Go back</AlertDialog.Close><Action disabled={busy} onClick={async()=>{setConfirmOpen(false);await run('approve',{...binding,confirmed:true,digest:c.plan.digest});}}>Confirm simulated refund</Action></div></AlertDialog.Popup></AlertDialog.Portal></AlertDialog.Root></div>}
    {c.unresolved&&<section aria-label="Unresolved simulated refund" className="mt-5 rounded-lg border border-slate-300 bg-slate-50 p-5"><p className="text-sm font-semibold text-slate-900">Simulated refund not recorded</p><p className="mt-2 text-sm leading-6 text-slate-700">A {money(c.unresolved.cents)} attempt is {c.unresolved.state.toLowerCase()} on this practice case. No funds moved. {c.unresolved.state==='RESERVED'?'Resume the prepared attempt, or start a new practice case.':'This attempt cannot be resumed safely; start a new practice case.'}</p>{c.unresolved.state==='RESERVED'&&<Action className="mt-4" disabled={busy} onClick={()=>run('resume',{...binding,digest:c.plan.digest})}>Resume simulated refund</Action>}</section>}
    {c.refund&&<section aria-label="Simulated refund receipt" className="mt-5 rounded-lg border border-teal-200 bg-teal-50 p-5"><p className="text-sm font-medium text-teal-800">Simulated refund receipt · no funds moved</p><h3 className="mt-2 text-3xl font-semibold tabular-nums text-teal-950">{money(c.refund.cents)}</h3><p className="mt-2 text-sm leading-6 text-teal-950">Recorded on this practice case only. No payment provider was contacted.</p><dl className="mt-4 space-y-2 text-sm"><div className="flex flex-wrap justify-between gap-2"><dt className="text-teal-900">Status</dt><dd className="font-semibold">Simulated · completed</dd></div>{c.refund.reference&&<div className="flex flex-wrap justify-between gap-2"><dt className="text-teal-900">Practice reference</dt><dd className="break-all font-mono text-xs">{c.refund.reference}</dd></div>}<div className="flex flex-wrap justify-between gap-2"><dt className="text-teal-900">Unaffected tray</dt><dd>{money(value.scenario.unaffectedCents)} · not refunded</dd></div></dl></section>}
    <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-slate-200 pt-4"><Action secondary disabled={busy} onClick={()=>run('restart',{})}>Start a new practice case</Action><p className="text-xs leading-5 text-slate-500">Attempt {value.attempt}. Reloading keeps this attempt; restart begins a fresh case in the same session.</p></div>
    <ErrorText error={error}/>
    {stale&&<Action secondary className="mt-3" onClick={onRefresh}>Refresh practice case</Action>}
  </section>;
}

export default function Practice(){
  const [state,setState]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[stale,setStale]=useState(false),[expired,setExpired]=useState(false);
  async function refresh(){setError('');setStale(false);setExpired(false);try{setState(await api('practice/state'));}catch(e){setError(e.message);setExpired(Boolean(e.expired));}}
  useEffect(()=>{let active=true;api('practice/state').then(v=>active&&setState(v)).catch(e=>active&&(setError(e.message),setExpired(Boolean(e.expired))));return()=>{active=false;};},[]);
  async function run(action,data){setBusy(true);setError('');setStale(false);setExpired(false);try{setState(await api(`practice/${action}`,data));}catch(e){setError(e.message);setStale(Boolean(e.stale));setExpired(Boolean(e.expired));}finally{setBusy(false);}}
  const customer=state?.role==='customer';
  return <Frame practice customer={customer} note={`Practice · simulated · ${customer?'customer view':'merchant view'} · no payment provider`}>
    <div className="practice-head">
      <div><p className="text-sm font-medium text-teal-800">Practice claim · simulated</p><h1 className="mt-1">Practice claim.</h1></div>
      {state&&<div role="group" aria-label="Practice role" className="practice-role">
        <button type="button" aria-pressed={!customer} disabled={busy} onClick={()=>run('role',{role:'merchant'})} className={customer?'':'is-active'}>Merchant view</button>
        <button type="button" aria-pressed={customer} disabled={busy} onClick={()=>run('role',{role:'customer'})} className={customer?'is-active':''}>Customer view</button>
      </div>}
    </div>
    <StageProgress value={state||{}}/>
    <StageBar value={state||{}}/>
    {state&&stageState(state)<2&&<MoneyLine value={state}/>}
    {!state?<section className="mt-6 rounded-lg border border-slate-200 bg-white p-6" aria-busy={!error}><p role="status">{error?'This practice case could not be opened.':'Opening your practice case…'}</p><ErrorText error={error}/>{expired&&<Action className="mt-4" disabled={busy} onClick={()=>run('new',{})}>Start a fresh practice case</Action>}<Action secondary className="mt-4" disabled={busy} onClick={refresh}>Retry</Action></section>:<>
      {expired&&<div className="mt-4"><ErrorText error={error}/><Action className="mt-3" disabled={busy} onClick={()=>run('new',{})}>Start a fresh practice case</Action></div>}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div>{customer?<CustomerPanel value={state} run={run} busy={busy} error={error} stale={stale} onRefresh={refresh}/>:<MerchantPanel value={state} run={run} busy={busy} error={error} stale={stale} onRefresh={refresh}/>}</div>
        <aside className="space-y-4">
          <details className="rounded-lg border border-slate-200 bg-white px-5"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Reviewed requirements and practice notice</summary><div className="border-t border-slate-100 pb-5 pt-4"><Scenario value={state}/></div></details>
          <details className="rounded-lg border border-slate-200 bg-white px-5"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Fictional purchase and amounts</summary><div className="border-t border-slate-100 pb-5 pt-4"><Purchase value={state}/></div></details>
        </aside>
      </div>
      <p className="mt-6 max-w-3xl text-xs leading-5 text-slate-500">{state.boundary.storage} {state.boundary.provider} {state.boundary.assistant}</p>
    </>}
  </Frame>;
}
