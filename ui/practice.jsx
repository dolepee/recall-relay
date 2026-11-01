import React,{useEffect,useState} from 'react';
import {AlertDialog} from '@base-ui/react/alert-dialog';
import {Action,ErrorText,Frame,CorrectionNote,money,inputClass,api,cn} from './components.jsx';

const kindLabel={PHOTO:'Photograph',CONFIRMATION:'Confirmation',TEXT:'Written information'};
const practiceTitles={AWAITING_CUSTOMER:'Waiting for the claim',NEEDS_INFORMATION:'More information needed',SUBMITTED:'With the merchant',MANUAL:'Manual review needed',REVIEW:'Needs review',READY_FOR_APPROVAL:'Ready for simulated refund',RESERVED:'Simulated refund prepared',UNKNOWN:'Simulated refund needs attention',PENDING:'Simulated refund processing',COMPLETED:'Simulated refund recorded',FAILED:'Simulated refund needs attention',CANCELLED:'Simulated refund needs attention'};
function PracticeStatus({code}){return <span className={cn('inline-flex rounded px-2 py-1 text-xs font-semibold',code==='COMPLETED'||code==='READY_FOR_APPROVAL'?'bg-teal-50 text-teal-800':'bg-slate-100 text-slate-700')}>{practiceTitles[code]||code}</span>;}

function Journey({value}){
  const c=value.case;
  const steps=[
    ['Reviewed requirements','Source-linked notice is reviewed for this practice case',true],
    ['Customer evidence',c.submission&&c.missing.length===0?'Evidence complete for this version':'Waiting for the customer',Boolean(c.submission)&&c.missing.length===0],
    ['Correction',c.correction?'Requested and answered on this case':'Optional merchant step',Boolean(c.correction&&c.correction.state==='RESPONDED')],
    ['Merchant review',c.review?'Evidence reviewed for the current version':'Not reviewed for the current version',Boolean(c.review)],
    ['Simulated refund',c.refund?'Recorded, no funds moved':'Not recorded',Boolean(c.refund)],
  ];
  return <ol aria-label="Practice journey" className="mt-4 space-y-2 text-sm">{steps.map(([title,detail,done],i)=><li key={title} className="flex gap-3"><span aria-hidden="true" className={'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold '+(done?'bg-teal-700 text-white':'bg-slate-100 text-slate-600')}>{done?'✓':i+1}</span><span><span className="font-medium">{title}</span><span className="block text-slate-600">{detail}</span></span></li>)}</ol>;
}

function Scenario({value}){
  const s=value.scenario;
  return <section aria-labelledby="practice-source" className="rounded-lg border border-slate-200 bg-white p-5">
    <p className="text-xs font-semibold text-slate-500">{s.sourceLabel}</p>
    <h2 id="practice-source" className="mt-2 text-lg font-semibold text-balance">{s.title}</h2>
    <p className="mt-3 text-sm leading-6 text-slate-600">{s.notice}</p>
    <p className="mt-3 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600">{s.sourceNote}</p>
    <h3 className="mt-5 text-sm font-semibold">Reviewed claim requirements</h3>
    <ol className="mt-3 space-y-3">{s.requirements.map((f,i)=><li key={f.id} className="rounded-md border border-slate-200 p-4"><p className="text-xs font-semibold text-slate-500">{f.citation} · {kindLabel[f.kind]}</p><p className="mt-2 text-sm leading-6">“{f.quote}”</p></li>)}</ol>
    <div className="mt-5 rounded-md border border-dashed border-slate-300 p-4">
      <p className="text-xs font-semibold text-slate-600">{s.recordedDraft.label}</p>
      <p className="mt-2 text-sm leading-6">“{s.recordedDraft.text}”</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{s.recordedDraft.note}</p>
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

function CustomerPanel({value,run,busy,error}){
  const c=value.case;
  const [lot,setLot]=useState(c.submission?.lot||'');
  const [ack,setAck]=useState(c.submission?.acknowledged||false);
  const [extra,setExtra]=useState(c.submission?.extra||{});
  const [photo,setPhoto]=useState(undefined);
  const [fileName,setFileName]=useState('');
  const [reading,setReading]=useState(false);
  const [response,setResponse]=useState('');
  const [localError,setLocalError]=useState('');
  useEffect(()=>{setLot(c.submission?.lot||'');setAck(c.submission?.acknowledged||false);setExtra(c.submission?.extra||{});setPhoto(undefined);setFileName('');setResponse('');setLocalError('');},[c.id,c.revision]);
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
  async function submit(event){event.preventDefault();await run('submit',{revision:c.revision,lot,acknowledged:ack,extra,correctionResponse:response,...(photo===undefined?{}:{photo})});}
  const fields=(value.scenario.requirements||[]).filter(f=>f.kind!=='PHOTO');
  return <section aria-labelledby="practice-customer" className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-medium text-teal-800">Customer view</p><h2 id="practice-customer" className="mt-1 text-xl font-semibold">Your practice claim</h2></div><PracticeStatus code={c.status.code}/></div>
    <p role="status" className="mt-3 text-sm leading-6 text-slate-700">{c.status.reason}</p>
    <CorrectionNote value={c.correction} customer/>
    {c.submission&&c.missing.length>0&&!c.locked&&<div className="mt-4 rounded-md bg-slate-50 p-4"><p className="text-sm font-semibold">Still needed</p><ul className="mt-2 list-disc space-y-2 pl-5 text-sm">{c.missing.map(x=><li key={x}>{x}</li>)}</ul></div>}
    {!c.locked&&<form onSubmit={submit} className="mt-5 border-t border-slate-200 pt-4">
      <label className="block text-sm font-medium" htmlFor="practice-lot">Lot printed on the cup<input id="practice-lot" className={inputClass} value={lot} maxLength={40} onChange={e=>setLot(e.target.value)} disabled={busy} placeholder="For example, LOT-A"/></label>
      <label className="mt-4 block text-sm font-medium" htmlFor="practice-photo">Label photograph<input id="practice-photo" type="file" accept="image/png,image/jpeg" onChange={pickFile} disabled={busy||reading} className="mt-2 block min-h-11 w-full rounded-md border border-slate-300 p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-2 focus-visible:outline-2 focus-visible:outline-teal-700"/></label>
      <p className="mt-2 text-xs text-slate-500">PNG or JPEG, up to 2 MB. Use a disposable image; it stays in this practice session.</p>
      <p role="status" className="mt-2 text-sm text-teal-800">{reading?'Reading image…':fileName?`${fileName} ready to submit`:c.submission?.hasPhoto?'Your previous photograph is saved.':''}</p>
      {photo&&<img src={photo} alt="Photograph selected for this practice claim" className="mt-3 max-h-64 max-w-full rounded-md border border-slate-200 object-contain"/>}
      <label className="mt-4 flex min-h-11 items-start gap-3 py-3 text-sm leading-6"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} disabled={busy} className="mt-1 size-5 shrink-0 accent-teal-700"/>I confirm this is the item from my fictional practice purchase.</label>
      {fields.map(field=>field.kind==='CONFIRMATION'
        ?<label key={field.id} className="mt-3 flex min-h-11 items-start gap-3 rounded-md border border-slate-200 p-4 text-sm leading-6"><input type="checkbox" checked={extra[field.id]===true} onChange={e=>setExtra(old=>({...old,[field.id]:e.target.checked}))} disabled={busy} className="mt-1 size-5 shrink-0 accent-teal-700"/><span>{field.quote}<span className="mt-2 block text-xs text-slate-500">Answering this records your statement; it is not verified for you.</span></span></label>
        :<label key={field.id} className="mt-4 block text-sm font-medium">{field.quote}<textarea className={inputClass} rows={3} value={extra[field.id]||''} maxLength={500} disabled={busy} onChange={e=>setExtra(old=>({...old,[field.id]:e.target.value}))}/></label>)}
      {c.correction?.state==='REQUESTED'&&<label className="mt-5 block text-sm font-medium">Your response to the merchant<textarea className={inputClass} rows={3} value={response} required minLength={3} maxLength={1000} disabled={busy} onChange={e=>setResponse(e.target.value)} placeholder="Describe what you changed or clarify the requested information."/></label>}
      <ErrorText error={localError||error}/>
      <Action type="submit" className="mt-4 w-full sm:w-auto" disabled={busy||reading}>{busy?'Saving practice claim…':c.correction?.state==='REQUESTED'?'Send updated evidence':c.submission?'Update practice claim':'Submit practice claim'}</Action>
      <p className="mt-3 text-xs leading-5 text-slate-500">Reload this page and the practice case stays here. Submitting does not approve a refund or contact anyone.</p>
    </form>}
    {c.refund&&<section aria-label="Simulated refund record" className="mt-5 rounded-lg border border-teal-200 bg-teal-50 p-5"><p className="text-sm font-semibold text-teal-900">Simulated refund · no funds moved</p><h3 className="mt-2 text-2xl font-semibold tabular-nums text-teal-950">{money(c.refund.cents)}</h3><p className="mt-2 text-sm leading-6 text-teal-950">Recorded on this practice case only. No payment provider was contacted and the $34.00 tray stays outside the refund.</p><dl className="mt-3 space-y-2 text-sm"><div className="flex flex-wrap justify-between gap-2"><dt className="text-teal-900">Status</dt><dd className="font-semibold">Simulated · completed</dd></div>{c.refund.reference&&<div className="flex flex-wrap justify-between gap-2"><dt className="text-teal-900">Practice reference</dt><dd className="break-all font-mono text-xs">{c.refund.reference}</dd></div>}</dl></section>}
    <ErrorText error={error}/>
  </section>;
}

function MerchantPanel({value,run,busy,error}){
  const c=value.case;
  const [reviewed,setReviewed]=useState(false);
  const [message,setMessage]=useState('');
  const [replacePhoto,setReplacePhoto]=useState(true);
  const [confirmOpen,setConfirmOpen]=useState(false);
  useEffect(()=>{setReviewed(false);setMessage('');setReplacePhoto(true);setConfirmOpen(false);},[c.id,c.revision]);
  const ready=c.plan.status==='READY_FOR_APPROVAL'&&!c.locked;
  const canReview=!c.locked&&c.submission&&c.missing.length===0&&c.correction?.state!=='REQUESTED'&&!c.review;
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
    <CorrectionNote value={c.correction}/>
    {!c.locked&&c.missing.length>0&&<div className="mt-4 rounded-md bg-slate-50 p-4"><h3 className="text-sm font-semibold">Waiting for the customer</h3><ul className="mt-2 list-disc space-y-2 pl-5 text-sm">{c.missing.map(x=><li key={x}>{x}</li>)}</ul></div>}
    {canReview&&<div className="mt-4 border-t border-slate-200 pt-3"><label className="flex min-h-11 items-start gap-3 py-3 text-sm leading-6"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)} className="mt-1 size-5 shrink-0 accent-teal-700"/>I inspected this version’s photograph and confirmed the lot, purchase confirmation and required responses match the reviewed practice notice.</label><Action secondary disabled={!reviewed||busy} onClick={()=>run('review',{id:c.id,revision:c.revision,confirmed:true})}>Confirm evidence review</Action></div>}
    {!c.locked&&c.submission&&c.correction?.state!=='REQUESTED'&&<details key={`${c.id}-${c.revision}`} className="mt-5 border-t border-slate-200 pt-2"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-teal-800">Request a correction</summary><form onSubmit={e=>{e.preventDefault();run('request-changes',{id:c.id,revision:c.revision,message,replacePhoto});}}><p className="text-sm leading-6 text-slate-600">This clears the current evidence review and shows your message on the customer view. A new review is required before any simulated refund.</p><label className="mt-4 block text-sm font-medium">What should the customer change?<textarea className={inputClass} rows={3} value={message} required minLength={10} maxLength={600} disabled={busy} onChange={e=>setMessage(e.target.value)} placeholder="For example, the lot code is too blurred to read. Please upload a clearer photograph."/></label><label className="flex min-h-11 items-start gap-3 py-3 text-sm leading-6"><input type="checkbox" checked={replacePhoto} onChange={e=>setReplacePhoto(e.target.checked)} disabled={busy} className="mt-1 size-5 shrink-0 accent-teal-700"/>Require a replacement photograph</label><Action type="submit" secondary disabled={busy||message.trim().length<10}>{busy?'Saving request…':'Request customer update'}</Action></form></details>}
    {ready&&<div className="mt-5 rounded-lg border border-teal-200 bg-teal-50 p-4"><p className="mb-3 text-sm text-teal-950">This version is reviewed. Record a <strong>simulated</strong> refund of <strong>{money(value.scenario.affectedCents)}</strong> for the affected cup only.</p><AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}><AlertDialog.Trigger render={<Action disabled={busy}/>}>Record simulated refund</AlertDialog.Trigger><AlertDialog.Portal><AlertDialog.Backdrop className="fixed inset-0 z-40 bg-slate-950/40"/><AlertDialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-6 shadow-xl"><AlertDialog.Title className="text-xl font-semibold text-balance">Confirm simulated refund</AlertDialog.Title><AlertDialog.Description className="mt-3 text-sm leading-6 text-pretty text-slate-600">This records {money(value.scenario.affectedCents)} against {value.case.id} in this practice session. No payment provider is contacted, no credentials are used and no funds move. The {money(value.scenario.unaffectedCents)} tray stays outside the refund.</AlertDialog.Description><div className="mt-6 flex flex-wrap justify-end gap-3"><AlertDialog.Close render={<Action secondary/>}>Go back</AlertDialog.Close><Action disabled={busy} onClick={async()=>{setConfirmOpen(false);await run('approve',{id:value.case.id,confirmed:true});}}>Confirm simulated refund</Action></div></AlertDialog.Popup></AlertDialog.Portal></AlertDialog.Root></div>}
    {c.refund&&<section aria-label="Simulated refund receipt" className="mt-5 rounded-lg border border-teal-200 bg-teal-50 p-5"><p className="text-sm font-medium text-teal-800">Simulated refund receipt · no funds moved</p><h3 className="mt-2 text-3xl font-semibold tabular-nums text-teal-950">{money(c.refund.cents)}</h3><p className="mt-2 text-sm leading-6 text-teal-950">Recorded on this practice case only. No payment provider was contacted.</p><dl className="mt-4 space-y-2 text-sm"><div className="flex flex-wrap justify-between gap-2"><dt className="text-teal-900">Status</dt><dd className="font-semibold">Simulated · completed</dd></div>{c.refund.reference&&<div className="flex flex-wrap justify-between gap-2"><dt className="text-teal-900">Practice reference</dt><dd className="break-all font-mono text-xs">{c.refund.reference}</dd></div>}<div className="flex flex-wrap justify-between gap-2"><dt className="text-teal-900">Unaffected tray</dt><dd>{money(value.scenario.unaffectedCents)} · not refunded</dd></div></dl></section>}
    <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-slate-200 pt-4"><Action secondary disabled={busy} onClick={()=>run('restart',{})}>Start a new practice case</Action><p className="text-xs leading-5 text-slate-500">Attempt {value.attempt}. Reloading keeps this attempt; restart begins a fresh case in the same session.</p></div>
    <ErrorText error={error}/>
  </section>;
}

export default function Practice(){
  const [state,setState]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function refresh(){setError('');try{setState(await api('practice/state'));}catch(e){setError(e.message);}}
  useEffect(()=>{let active=true;api('practice/state').then(v=>active&&setState(v)).catch(e=>active&&setError(e.message));return()=>{active=false;};},[]);
  async function run(action,data){setBusy(true);setError('');try{setState(await api(`practice/${action}`,data));}catch(e){setError(e.message);}finally{setBusy(false);}}
  const customer=state?.role==='customer';
  return <Frame customer={customer} note="Practice · simulated · no payment provider"><title>Practice claim · Recall Relay</title>
    <p className="text-sm font-medium text-teal-800">Practice case · simulated</p>
    <h1 className="mt-2 text-3xl font-semibold text-balance">Run one complete claim, end to end.</h1>
    <p className="mt-3 max-w-3xl text-pretty leading-7 text-slate-600">A reviewed practice notice, one fictional affected cup and its excluded tray. Switch roles below to collect evidence, request a correction, approve it and record a simulated refund. Nothing here contacts a payment provider or a live model.</p>
    {!state?<section className="mt-6 rounded-lg border border-slate-200 bg-white p-6" aria-busy={!error}><p role="status">{error?'This practice case could not be opened.':'Opening your practice case…'}</p><ErrorText error={error}/><Action secondary className="mt-4" disabled={busy} onClick={refresh}>Retry</Action></section>:<>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <div role="group" aria-label="Practice role" className="inline-flex rounded-md border border-slate-300 bg-white p-1">
          <button type="button" aria-pressed={!customer} disabled={busy} onClick={()=>run('role',{role:'merchant'})} className={'min-h-11 rounded px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-teal-700 '+(customer?'text-slate-700 hover:bg-slate-50':'bg-teal-700 text-white')}>Merchant view</button>
          <button type="button" aria-pressed={customer} disabled={busy} onClick={()=>run('role',{role:'customer'})} className={'min-h-11 rounded px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-teal-700 '+(customer?'bg-teal-700 text-white':'text-slate-700 hover:bg-slate-50')}>Customer view</button>
        </div>
        <p className="max-w-xl text-xs leading-5 text-slate-500">{state.boundary.storage} {state.boundary.provider} {state.boundary.assistant}</p>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-6"><Scenario value={state}/><Purchase value={state}/><section className="rounded-lg border border-slate-200 bg-white p-5"><h2 className="text-lg font-semibold">Where this case is</h2><Journey value={state}/></section></div>
        <div>{customer?<CustomerPanel value={state} run={run} busy={busy} error={error}/>:<MerchantPanel value={state} run={run} busy={busy} error={error}/>}</div>
      </div>
      <ErrorText error={state?null:error}/>
    </>}
  </Frame>;
}
