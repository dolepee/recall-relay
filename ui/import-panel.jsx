import React,{useRef,useState} from 'react';
import {Action,ErrorText,api,inputClass,money} from './components.jsx';

const known=value=>value!==null&&value!==undefined&&Number.isSafeInteger(value)&&value>=0;
const amount=value=>known(value)?money(value):'Unknown';
const fileLimit=512*1024;
const readFile=file=>typeof file.text==='function'?file.text():new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error||new Error('read failed'));reader.readAsText(file);});
const disposition={
  AFFECTED:{label:'Affected · candidate',code:'CANDIDATE'},
  UNAFFECTED:{label:'Unaffected'},
  MANUAL:{label:'Manual',code:'MANUAL'},
};

function DeclaredAmount({label,value}){
  return <div className="flex flex-wrap justify-between gap-2"><dt className="text-slate-500">{label}</dt><dd className={`tabular-nums ${known(value)?'':'font-semibold text-[color:var(--m-warn)]'}`}>{amount(value)}</dd></div>;
}

function Count({label,value}){
  return <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-1 last:border-0"><dt className="text-xs font-semibold uppercase tracking-[.08em] text-slate-500">{label}</dt><dd className="text-lg font-semibold tabular-nums">{value}</dd></div>;
}

function OrderPreview({order,index,rows}){
  const capture=order.captureId||rows[0]?.declaredCaptureId||null;
  return <section className="rr-card min-w-0 p-4" aria-label={`Declared order ${order.orderId}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h4 className="break-all text-base font-semibold">{order.orderId}</h4><p className="mt-1 break-all font-mono text-xs text-slate-500">Declared capture: {capture||'none declared'}</p><p className="mt-1 break-words text-xs text-slate-500">{order.capturedAt||'No declared date'} · {order.status||'No declared status'}</p></div>
      <div className="flex flex-wrap items-center gap-2"><span className="rr-status" data-code="MANUAL">Capture unverified</span><span className="rr-status">Provider facts not checked</span></div>
    </div>
    <div className="mt-3 min-w-0 space-y-3">{rows.map(row=><article key={`${row.lineIndex}-${row.declaredLineId}`} className="min-w-0 border-t border-slate-200 pt-3" aria-label={`Declared line ${row.declaredLineId}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><p className="break-all font-semibold">{row.sku||'SKU not declared'} · lot {row.lot||'not declared'}</p><p className="mt-1 break-all text-xs text-slate-500">Declared line {row.declaredLineId} · quantity {row.quantity??'unknown'}</p></div>
        <span className="rr-status" data-code={disposition[row.disposition]?.code}>{disposition[row.disposition]?.label||row.disposition}</span>
      </div>
      <dl className="mt-2 grid gap-1.5 text-xs sm:grid-cols-2 xl:grid-cols-4"><DeclaredAmount label="Item total after discounts" value={row.itemPaidCents}/><DeclaredAmount label="Tax" value={row.taxCents}/><DeclaredAmount label="Shipping" value={row.shippingCents}/><DeclaredAmount label="Prior refunds" value={row.refundedCents}/></dl>
      <p className="mt-2 text-xs leading-5 text-slate-700"><span className="font-semibold">Declared candidate: </span>{row.disposition==='AFFECTED'?amount(row.candidateCents):'Not counted'}</p>
      {row.reasons?.length?<ul className="mt-1 list-disc space-y-1 break-words pl-4 text-xs leading-5 text-slate-600">{row.reasons.map((reason,i)=><li key={`${i}-${reason}`}>{reason}</li>)}</ul>:null}
      <p className="mt-1 text-xs leading-4 text-slate-500">Allocation: none established. Verification: {row.verification==='UNVERIFIED'?'declared only, unverified':row.verification}. An imported capture is not purchase provenance.</p>
    </article>)}</div>
  </section>;
}

export function ImportPanel(){
  const [text,setText]=useState(''),[fileName,setFileName]=useState(''),[busy,setBusy]=useState(false),[reading,setReading]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null),[notice,setNotice]=useState('');
  const fileRef=useRef(null),readGeneration=useRef(0),previewGeneration=useRef(0);
  function invalidate(){previewGeneration.current++;setResult(null);setNotice('');setError('');setBusy(false);}
  function editText(value){invalidate();setText(value);}
  async function chooseFile(event){
    const file=event.target.files?.[0];
    if(!file)return;
    const generation=++readGeneration.current;
    previewGeneration.current++;
    setText('');setResult(null);setNotice('');setError('');setBusy(false);setFileName(file.name);setReading(true);
    if(file.size>fileLimit){if(generation===readGeneration.current){setError(`${file.name} is ${Math.ceil(file.size/1024)} KB; choose a ledger file under 512 KB.`);setReading(false);}return;}
    try{
      const value=await readFile(file);
      if(generation!==readGeneration.current)return;
      setText(value);setNotice(`Loaded ${file.name}. Review the declaration, then preview it.`);
    }
    catch{
      if(generation!==readGeneration.current)return;
      setText('');setError(`${file.name} could not be read. Paste the JSON instead.`);
    }
    finally{if(generation===readGeneration.current)setReading(false);}
  }
  async function preview(event){
    event.preventDefault();
    const generation=++previewGeneration.current;
    setError('');setResult(null);setNotice('');
    let payload;
    try{payload=JSON.parse(text);}catch{if(generation===previewGeneration.current)setError('That is not valid JSON. Fix the paste or choose another file.');return;}
    setBusy(true);
    try{
      const value=await api('merchant/import-preview',payload);
      if(generation!==previewGeneration.current)return;
      if(!value||value.mode!=='DECLARED_PREVIEW'||!Array.isArray(value.orders)||!Array.isArray(value.lines)||!value.summary){setError('The server returned an unexpected preview response. Reload the desk and try again.');return;}
      setResult(value);
    }
    catch(e){if(generation===previewGeneration.current)setError(e.message);}
    finally{if(generation===previewGeneration.current)setBusy(false);}
  }
  function clear(){readGeneration.current++;previewGeneration.current++;setText('');setFileName('');setError('');setResult(null);setNotice('');setReading(false);setBusy(false);if(fileRef.current)fileRef.current.value='';}
  return <details className="rr-card mb-4 px-5" aria-label="Import existing purchases">
    <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2 py-3 text-sm focus-visible:outline-2 focus-visible:outline-teal-700"><span className="font-semibold">Import existing purchases</span><span className="text-xs text-slate-600">Declared ledger · read-only preview</span></summary>
    <div className="border-t border-slate-100 pb-5 pt-4">
      <p className="max-w-3xl text-sm leading-6 text-slate-600">A declared order export is classified against the published product and lot. The server returns affected, unaffected and manual lines; nothing is stored, no provider is contacted and imported rows have no refund or approval action. The published scope comes from the server, so without a published campaign every line stays manual.</p>
      <form className="mt-4" onSubmit={preview} aria-busy={busy}>
        <div className="flex flex-wrap items-center gap-3"><label className="text-sm font-medium" htmlFor="ledger-file">Choose a JSON ledger file</label><input ref={fileRef} id="ledger-file" type="file" accept=".json,application/json" onChange={chooseFile} disabled={busy} className="max-w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold"/></div>
        <p className="mt-1 text-xs leading-5 text-slate-500">Or paste the version-1 ledger below. {fileName?`Selected file: ${fileName}.`:''}</p>
        <label className="mt-3 block text-sm font-medium" htmlFor="ledger-json">Ledger JSON</label>
        <textarea id="ledger-json" value={text} onChange={event=>editText(event.target.value)} rows={8} spellCheck={false} disabled={busy||reading} className={`${inputClass} font-mono text-xs leading-5`} placeholder={'{"version":1,"currency":"USD","source":{"kind":"merchant-ledger","label":"Order export","reference":null},"orders":[…]}'}/>
        <div className="mt-3 flex flex-wrap items-center gap-3"><Action type="submit" disabled={busy||reading||!text.trim()}>{busy?'Reading declared ledger…':'Preview declared import'}</Action><Action type="button" secondary disabled={busy||(!text&&!result)} onClick={clear}>Clear</Action>{reading&&<p role="status" className="text-sm text-slate-600">Reading the selected file…</p>}{busy&&<p role="status" className="text-sm text-slate-600">Checking the declared data with the server…</p>}</div>
        <ErrorText error={error}/>
        {notice&&<p role="status" className="mt-3 text-sm leading-6 text-slate-600">{notice}</p>}
      </form>
      {result&&<div className="mt-6" aria-label="Declared import preview">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold  text-slate-500">Declared preview · read-only</p><h3 className="mt-1 text-lg font-semibold">What this import would mean</h3></div><span className="text-xs text-slate-500">Currency {result.currency} · {result.orders.length} declared {result.orders.length===1?'order':'orders'}</span></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <section className="rr-card p-4" aria-label="Declared candidate value"><p className="text-xs font-semibold  text-slate-500">Declared candidate value</p><p className="mt-2 text-2xl font-semibold tabular-nums">{money(result.summary.candidateCents)}</p><p className="mt-1 text-xs leading-5 text-slate-600">Declared balances on affected lines. Not a verified refundable amount or recall liability.</p></section>
          <section className="rr-card p-4" aria-label="Verified refundable amount"><p className="text-xs font-semibold  text-slate-500">Verified refundable amount</p><p className="mt-2 text-lg font-semibold text-[color:var(--m-warn)]">{amount(result.summary.verifiedRefundableCents)}</p><p className="mt-1 text-xs leading-5 text-slate-600">No capture has been verified or bound to this workspace.</p></section>
          <section className="rr-card p-4" aria-label="Confirmed refunds"><p className="text-xs font-semibold  text-slate-500">Confirmed refunds</p><p className="mt-2 text-lg font-semibold text-[color:var(--m-warn)]">{amount(result.summary.confirmedRefundCents)}</p><p className="mt-1 text-xs leading-5 text-slate-600">No provider receipt exists for this preview.</p></section>
          <section className="rr-card p-4" aria-label="Line counts"><p className="text-xs font-semibold  text-slate-500">Line counts</p><dl className="mt-2 space-y-1"><Count label="Affected" value={result.summary.affectedCount}/><Count label="Unaffected" value={result.summary.unaffectedCount}/><Count label="Manual" value={result.summary.manualCount}/></dl><p className="mt-2 text-xs leading-5 text-slate-600">Zero is a recorded value; a manual line is not counted.</p></section>
        </div>
        <section className="rr-card mt-3 p-4" aria-label="Import scope and provenance">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold  text-slate-500">Scope and provenance</p><h4 className="mt-1 text-base font-semibold">Server-applied scope, declared source</h4></div><span className="rr-status">Not persisted</span></div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <div><dt className="text-slate-500">Published scope</dt><dd className="break-all font-semibold">{result.scope?.sku?(<>SKU {result.scope.sku} · lot {result.scope.lot||'not set'}</>):'No published scope'}</dd></div>
            <div><dt className="text-slate-500">Source</dt><dd className="break-words font-semibold">{result.source?.label||'Not declared'}</dd></div>
            <div><dt className="text-slate-500">Source reference</dt><dd className="break-all font-mono text-xs">{result.source?.reference||'None'}</dd></div>
            <div><dt className="text-slate-500">Provider checked</dt><dd className="font-semibold">{result.providerChecked?'Yes':'No'}</dd></div>
            <div><dt className="text-slate-500">Payment authority</dt><dd className="font-semibold">{result.paymentAllowed?'Allowed':'Not allowed'}</dd></div>
          </dl>
          <p className="mt-3 rounded-md border border-[color:var(--m-warn-line)] bg-[color:var(--m-warn-bg)] p-3 text-xs leading-5">The browser supplied declared order data only. Workspace ownership, merchant identity, import time, capture binding, allocation and provider facts are not established by this preview.</p>
        </section>
        <div className="mt-5 space-y-3">{result.orders.map((order,index)=><OrderPreview key={`${index}-${order.orderId}`} order={order} index={index} rows={result.lines.filter(row=>row.orderIndex===index)}/>)}</div>
        <section className="rr-card mt-3 border-[color:var(--m-danger-line)] p-4" aria-label="No refund or approval action">
          <h4 className="text-base font-semibold">No refund or approval from imported rows</h4>
          <p className="mt-1 text-sm leading-6 text-slate-600">An imported capture cannot authorize a refund. Workspace ownership, provider readback and a stable capture-line allocation are required first. Duplicate capture declarations stay manual until reconciled; a renamed order or line does not create a new allocation.</p>
        </section>
      </div>}
    </div>
  </details>;
}
