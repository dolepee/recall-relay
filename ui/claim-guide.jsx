import React,{useEffect,useRef,useState} from 'react';
import {Action,ErrorText,inputClass} from './components.jsx';

export function ClaimGuide({harness,open,onClose}){
  const [session,setSession]=useState(null);
  const [snapshot,setSnapshot]=useState({messages:[],status:'idle'});
  const [question,setQuestion]=useState('');
  const [error,setError]=useState('');
  const end=useRef(null);
  useEffect(()=>{
    if(!harness)return;
    let active=true,current,update;setSession(null);
    harness.createThread({agentId:'case-guide',title:'Claim guide'}).then(value=>{
      current=value;
      if(!active){value.close();return;}
      update=()=>setSnapshot({messages:[...value.messages],status:value.status});
      value.addEventListener('changed',update);setSession(value);update();
    }).catch(err=>active&&setError(err.message));
    return()=>{active=false;if(current){if(update)current.removeEventListener('changed',update);current.close();}};
  },[harness]);
  useEffect(()=>{if(open)end.current?.scrollIntoView({block:'nearest'});},[snapshot.messages,open]);
  const running=snapshot.status==='running';
  function send(text){if(!session||running||!text.trim())return;setError('');try{session.sendMessage(text.trim());setQuestion('');}catch(err){setError(err.message);}}
  return <aside hidden={!open} aria-label="Claim guide" className="min-h-0 flex-col border-l border-slate-200 bg-white p-4" style={open?{display:'flex'}:undefined}>
    <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Claim guide</h2><Action secondary onClick={onClose}>Close</Action></div>
    <p className="mt-2 text-sm leading-6 text-slate-600">Find a case view or ask what is holding claims up. Review and payment decisions stay with you.</p>
    {!session&&!error&&<p role="status" className="mt-3 text-sm text-slate-600">Opening Claim guide…</p>}
    <div className="mt-4 min-h-0 flex-1 overflow-y-auto" role="log" aria-label="Claim guide conversation" aria-live="polite">
      {!snapshot.messages.length&&<div className="space-y-2">{(harness?.promptStarters||[]).map(prompt=><Action key={prompt.label} secondary className="w-full justify-start text-left" disabled={!session} onClick={()=>send(prompt.prompt)}>{prompt.label}</Action>)}</div>}
      {snapshot.messages.map(message=><div key={message.id} className="mb-4"><p className="mb-1 text-xs font-medium text-slate-500">{message.role==='user'?'You':'Claim guide'}</p>{message.parts.map((part,index)=>part.type==='text'?<p key={index} className="whitespace-pre-wrap break-words text-sm leading-6">{part.text}</p>:part.type==='tool_call'?<p key={index} className="my-2 text-xs font-medium text-teal-800">Changing the claim view</p>:part.type==='error'?<ErrorText key={index} error={part.message}/>:null)}</div>)}
      {running&&<p role="status" className="text-sm text-slate-600">Finding the right view…</p>}
      <div ref={end}/>
    </div>
    <ErrorText error={error}/>
    <form className="mt-3 border-t border-slate-200 pt-3" onSubmit={event=>{event.preventDefault();send(question);}}><label className="text-sm font-medium">Ask about your claims<textarea value={question} onChange={event=>setQuestion(event.target.value)} maxLength={1500} rows={2} className={inputClass} disabled={!session||running} placeholder="Which claims need my review?"/></label><div className="mt-3 flex justify-end">{running?<Action secondary onClick={()=>session.cancel()}>Stop</Action>:<Action type="submit" disabled={!session||!question.trim()}>Ask Claim guide</Action>}</div></form>
  </aside>;
}
