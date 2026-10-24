import {useEffect,useState} from 'react';
import {api} from './components.jsx';

export function useClaimPhoto(item){
  const [result,setResult]=useState(null);
  const [attempt,setAttempt]=useState(0);
  const id=item?.id,revision=item?.revision,hasPhoto=item?.submission?.hasPhoto===true;
  useEffect(()=>{
    if(!id||!hasPhoto)return;
    let active=true;
    api('merchant/photograph',{id,revision}).then(value=>{
      if(active)setResult({...value,error:'',ready:false});
    }).catch(error=>{
      if(active)setResult({id,revision,error:error.message,photo:null});
    });
    return()=>{active=false;};
  },[id,revision,hasPhoto,attempt]);
  const current=result?.id===id&&result?.revision===revision?result:null;
  return {photo:current?.photo||null,error:current?.error||'',ready:current?.ready===true,loading:hasPhoto&&!current,retry:()=>{setResult(null);setAttempt(value=>value+1);},loaded:()=>setResult(value=>value?.id===id&&value?.revision===revision?{...value,ready:true}:value),failed:()=>setResult(value=>value?.id===id&&value?.revision===revision?{...value,photo:null,ready:false,error:'This photograph could not be displayed. Retry it, or ask the customer for a replacement before reviewing.'}:value)};
}
