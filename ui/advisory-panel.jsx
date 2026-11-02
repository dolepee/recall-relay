import React,{useEffect,useRef,useState} from 'react';
import {Action,ErrorText,api} from './components.jsx';

// Read-only case context. These are the same three bounded reads exposed to the
// Claim guide; they never include a photograph, a customer's free text, a
// credential, a capture id or a payment action.
export function readCaseContext(caseId,revision,section){
  return api('merchant/case-context',{caseId,revision,section});
}

export function readCaseAdvisory(caseId,revision){
  return api('merchant/case-advisory',{caseId,revision});
}

const sectionLabel={brief:'Case brief',source:'Source requirements',gaps:'Recorded gaps'};
const actorLabel={CUSTOMER:'Customer',MERCHANT:'Merchant',MANUFACTURER:'Manufacturer',PROVIDER:'Provider',UNKNOWN:'Actor unknown'};
const timingLabel={BEFORE_ACTION:'Before the action',AFTER_ACTION:'After the action',AT_SUBMISSION:'At submission',CONDITIONAL:'Conditional',UNSPECIFIED:'Timing not stated'};
const dispositionLabel={FIELD:'Field link',INFORMATION:'Information',MANUAL:'Manual',UNRESOLVED:'Unresolved'};
const clean=value=>typeof value==='string'?value.trim():'';

function FactList({facts}){
  if(!facts||typeof facts!=='object')return null;
  return <dl className="mt-2 grid gap-1 text-[11px] leading-4 text-slate-600 sm:grid-cols-2">
    <div><dt className="inline text-slate-500">Photograph recorded: </dt><dd className="inline font-medium">{facts.photoPresent?'Yes':'No'}</dd></div>
    <div><dt className="inline text-slate-500">Lot matches: </dt><dd className="inline font-medium">{facts.lotMatches?'Yes':'No or not established'}</dd></div>
    <div><dt className="inline text-slate-500">Review revision: </dt><dd className="inline font-medium">{facts.reviewRevision??'Not recorded'}</dd></div>
    <div><dt className="inline text-slate-500">Correction: </dt><dd className="inline font-medium">{facts.correctionState||'None recorded'}</dd></div>
  </dl>;
}

function ReadFacts({item}){
  const [busy,setBusy]=useState(''),[error,setError]=useState(''),[section,setSection]=useState(''),[result,setResult]=useState(null);
  const generation=useRef(0);
  useEffect(()=>{generation.current++;setBusy('');setError('');setSection('');setResult(null);},[item?.id,item?.revision]);
  async function load(next){
    if(!item?.id||!Number.isSafeInteger(item.revision)){setError('Select a saved claim before reading its recorded context.');return;}
    const current=++generation.current;
    setBusy(next);setError('');setResult(null);setSection(next);
    try{
      const value=await readCaseContext(item.id,item.revision,next);
      if(current!==generation.current)return;
      if(!value||value.readOnly!==true||!Array.isArray(value.clauses)||!Array.isArray(value.gaps))throw new Error('The server returned an unexpected read-only response.');
      setResult(value);
    }catch(e){if(current===generation.current)setError(e.message);}
    finally{if(current===generation.current)setBusy('');}
  }
  return <details className="mt-3 border-t border-slate-200 pt-2">
    <summary className="min-h-11 cursor-pointer py-2 text-xs font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-teal-700">Read recorded case facts</summary>
    <p className="mt-1 text-[11px] leading-4 text-slate-500">These three reads return recorded fields, source quotations and gaps. They do not call a model.</p>
    <div className="mt-2 flex flex-wrap gap-2">{Object.entries(sectionLabel).map(([value,label])=><Action key={value} secondary disabled={!!busy} onClick={()=>load(value)}>{busy===value?`Reading ${label.toLowerCase()}…`:label}</Action>)}</div>
    <ErrorText error={error}/>
    {result&&<div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2" aria-label={`Read-only ${sectionLabel[section]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[.08em] text-slate-500">{sectionLabel[section]} · revision {result.revision} · read-only</p>
      <FactList facts={result.facts}/>
      {result.clauses.length>0&&<ul className="mt-2 space-y-1.5">{result.clauses.slice(0,6).map(clause=><li key={clause.citationId} className="border-l-2 border-slate-300 pl-2 text-[11px] leading-4"><p className="break-words text-slate-700">“{clause.quote}”</p><p className="mt-0.5 text-slate-500">{dispositionLabel[clause.disposition]||clause.disposition}{clause.fieldIds?.length?` · ${clause.fieldIds.length} linked field(s)`:''}</p></li>)}</ul>}
      {result.gaps.length>0&&<div className="mt-2"><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-slate-500">Gaps</p><ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] leading-4 text-slate-600">{result.gaps.map((gap,index)=><li key={`${index}-${gap}`} className="break-words">{gap}</li>)}</ul></div>}
      {result.clauses.length===0&&result.gaps.length===0&&<p className="mt-1 text-[11px] leading-4 text-slate-600">No recorded clauses or gaps in this section.</p>}
    </div>}
  </details>;
}

function Clause({clause}){
  return <li className="border-t border-slate-200 py-2 first:border-t-0 first:pt-0">
    <p className="break-words text-[11px] leading-4 text-slate-700">“{clause.quote}”</p>
    <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[10px] leading-4 text-slate-500"><span>{actorLabel[clause.actor]||clause.actor||'Actor unknown'}</span><span>·</span><span>{timingLabel[clause.timing]||clause.timing||'Timing not stated'}</span><span>·</span><span>{dispositionLabel[clause.disposition]||clause.disposition}</span></p>
    {clean(clause.condition)&&<p className="mt-1 break-words text-[11px] leading-4 text-slate-600"><span className="font-medium">Condition: </span>“{clause.condition}”</p>}
    {clean(clause.explanation)&&<p className="mt-1 break-words text-[11px] leading-4 text-slate-600">{clause.explanation}</p>}
  </li>;
}

export function AdvisoryPanel({item}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null);
  const generation=useRef(0);
  const identity=item?`${item.id}:${item.revision}`:'';
  useEffect(()=>{generation.current++;setBusy(false);setError('');setResult(null);},[identity]);
  async function prepare(){
    if(!item?.id||!Number.isSafeInteger(item.revision)){setError('Select a saved claim before preparing an advisory.');return;}
    const current=++generation.current;
    setBusy(true);setError('');setResult(null);
    try{
      const value=await readCaseAdvisory(item.id,item.revision);
      if(current!==generation.current)return;
      if(!value||value.readOnly!==true||!value.status||!Array.isArray(value.clauses)||!Array.isArray(value.gaps))throw new Error('The server returned an unexpected advisory response.');
      if(value.caseId!==item.id||value.revision!==item.revision)throw new Error('This advisory is for a different case revision. Refresh the claim and prepare it again.');
      setResult(value);
    }catch(e){
      if(current!==generation.current)return;
      setError(e.stale||/STALE_(REVISION|CONTEXT)/.test(e.message)?'This claim changed while the advisory was being prepared. Refresh the claim, then prepare it again.':e.message);
    }finally{if(current===generation.current)setBusy(false);}
  }
  if(!item)return <section aria-label="AI advisory" className="h-full overflow-auto p-4"><h2 className="text-base font-semibold">AI advisory</h2><p className="mt-2 text-sm leading-6 text-slate-600">Select a claim to prepare a cited advisory.</p></section>;
  return <section aria-label="AI advisory" className="h-full overflow-auto p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-base font-semibold">AI advisory</h2><p className="mt-1 text-[11px] leading-4 text-slate-500">Advisory · revision {item.revision} · not a recorded fact</p></div><span className="rr-status">{result?.status==='INSUFFICIENT'?'Insufficient source':'Read-only'}</span></div>
    <p className="mt-2 text-[11px] leading-4 text-slate-600">Explains how the recorded source applies to this claim. It cannot inspect the photograph, approve a refund or change evidence.</p>
    <div className="mt-2 flex flex-wrap items-center gap-2"><Action secondary disabled={busy} onClick={prepare}>{busy?'Preparing advisory…':result?'Prepare again':'Prepare advisory'}</Action>{busy&&<p role="status" className="text-[11px] text-slate-600">Reading the selected revision.</p>}</div>
    <ErrorText error={error}/>
    {result&&<div className="mt-2" aria-label="Prepared AI advisory">
      <p className="text-[10px] font-semibold uppercase tracking-[.08em] text-slate-500">{result.status==='CITED'?'Cited advisory':'Source insufficient'}</p>
      {clean(result.summary)&&<p className="mt-1 break-words text-[11px] leading-4 text-slate-700">{result.summary}</p>}
      {result.clauses.length>0?<ul className="mt-2">{result.clauses.map(clause=><Clause key={clause.citationId} clause={clause}/>)}</ul>:<p className="mt-2 text-[11px] leading-4 text-slate-600">No usable cited clause was returned.</p>}
      {result.gaps.length>0&&<div className="mt-2 border-t border-slate-200 pt-2"><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-slate-500">Recorded evidence gaps</p><ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] leading-4 text-slate-600">{result.gaps.map((gap,index)=><li key={`${index}-${gap}`} className="break-words">{gap}</li>)}</ul></div>}
      {result.limitations?.length>0&&<div className="mt-2 border-t border-slate-200 pt-2"><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-slate-500">Limitations</p><ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] leading-4 text-slate-500">{result.limitations.map((limitation,index)=><li key={`${index}-${limitation}`} className="break-words">{limitation}</li>)}</ul></div>}
      <p className="mt-2 border-t border-slate-200 pt-2 text-[10px] leading-4 text-slate-500">Model-assisted explanation only. The recorded review brief and your review controls remain authoritative.</p>
    </div>}
    <ReadFacts item={item}/>
  </section>;
}
