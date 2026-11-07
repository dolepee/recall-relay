import React,{useEffect,useRef,useState} from 'react';
import {Action,ErrorText,inputClass} from './components.jsx';
import {caseFingerprint} from './advisory-panel.jsx';
import {readClaimAnswer} from './claim-question.mjs';
export function MobileClaimGuide({item,onView,onClose}){
  const [question,setQuestion]=useState(''),[answer,setAnswer]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const current=useRef(item),controller=useRef(null),heading=useRef(null),generation=useRef(0);
  current.current=item;const fingerprint=caseFingerprint(item);
  useEffect(()=>{heading.current?.focus();return()=>{generation.current++;controller.current?.abort();};},[]);
  useEffect(()=>{generation.current++;controller.current?.abort();setAnswer(null);setError('');setBusy(false);},[fingerprint]);
  async function ask(event){
    event.preventDefault();if(busy||!question.trim())return;
    const token=++generation.current;controller.current=new AbortController();setBusy(true);setError('');setAnswer(null);
    try{const value=await readClaimAnswer(question.trim(),()=>current.current,controller.current.signal);if(token!==generation.current)return;setAnswer(value);if(value.view)onView(value.view);}
    catch(e){if(token===generation.current&&e.name!=='AbortError')setError(e.message);}
    finally{if(token===generation.current)setBusy(false);}
  }
  return <section aria-label="Claim guide" className="rr-card mb-4 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 ref={heading} tabIndex={-1} className="text-lg font-semibold">Claim guide</h2><Action secondary onClick={onClose}>Close guide</Action></div><p className="mt-2 text-sm leading-6 text-slate-600">Ask about the selected claim, its source, blockers or workspace amounts. Answers cite recorded facts. Review and payment controls stay separate.</p><p className="mt-2 text-sm font-semibold">{item?`${item.order} · revision ${item.revision}`:'No claim selected · workspace questions available'}</p><form onSubmit={ask} className="mt-3"><label className="text-sm font-medium">Ask about your claims<textarea rows={3} maxLength={1500} className={inputClass} value={question} disabled={busy} placeholder="What is holding up this claim?" onChange={e=>setQuestion(e.target.value)}/></label><Action type="submit" className="mt-3" disabled={busy||!question.trim()}>{busy?'Reading current records…':'Ask Claim guide'}</Action></form><ErrorText error={error}/>{answer&&<div role="status" className="mt-4 border-t border-slate-200 pt-4"><p className="whitespace-pre-wrap break-words text-sm leading-6">{answer.message}</p><p className="mt-3 text-xs text-slate-600">Interpreted with {answer.model}.</p></div>}</section>;
}
