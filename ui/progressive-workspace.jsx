import React,{Component,useEffect,useRef,useState} from 'react';

class WorkspaceBoundary extends Component {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<><p role="status" className="mb-4 text-sm">Studio could not open. The standard workspace remains available.</p>{this.props.fallback}</>:this.props.children;}
}

// Keep ordinary controls usable during a cold Studio download. Once someone
// starts using them (or the download is slow), never replace their focused form.
export function ProgressiveWorkspace({load,fallback,componentProps={},delayMs=10000}){
  const [loaded,setLoaded]=useState(null),[status,setStatus]=useState('loading');
  const [open,setOpen]=useState(false);
  const keepStandard=useRef(false),workspace=useRef(null),requested=useRef(false);
  useEffect(()=>{if(open&&requested.current)workspace.current?.focus();},[open]);
  useEffect(()=>{
    let active=true;
    const timer=setTimeout(()=>{if(active){keepStandard.current=true;setStatus('slow');}},delayMs);
    Promise.resolve().then(load).then(module=>{
      if(!active)return;
      clearTimeout(timer);setLoaded(()=>module.default);setStatus('ready');
      if(!keepStandard.current)setOpen(true);
    },()=>{if(active){clearTimeout(timer);setStatus('failed');}});
    return()=>{active=false;clearTimeout(timer);};
  },[load,delayMs]);
  const Studio=loaded;
  if(open&&Studio)return <div ref={workspace} tabIndex={-1} aria-label="Studio workspace"><WorkspaceBoundary fallback={fallback}><Studio {...componentProps}/></WorkspaceBoundary></div>;
  return <div>
    <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-slate-600">
      <p role="status">{status==='loading'?'Studio is loading. You can use the standard workspace now.':status==='slow'?'The Studio download is taking longer. Continue in the standard workspace.':status==='failed'?'Studio could not download. Continue in the standard workspace, or reload this page to retry.':'Studio is ready. Your standard workspace stays open until you choose to switch.'}</p>
      {Studio&&<button type="button" className="rr-action min-h-11 px-4 py-2" onClick={()=>{requested.current=true;setOpen(true);}}>Open Studio workspace</button>}
    </div>
    <div onFocusCapture={()=>{keepStandard.current=true;}} onPointerDownCapture={()=>{keepStandard.current=true;}}>{fallback}</div>
  </div>;
}
