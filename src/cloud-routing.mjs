import {createHash,randomBytes} from 'node:crypto';
export const workspaceHash=secret=>createHash('sha256').update(secret).digest('hex');
export function routeWorkspace(url,cookie){
  const owner=/(?:^|;\s*)rr_workspace=([A-Za-z0-9_-]{43})(?:;|$)/.exec(cookie||'')?.[1];
  if(url.pathname.startsWith('/api/claim/')){
    const id=url.searchParams.get('workspace');
    if(!/^[a-f0-9]{64}$/.test(id||''))throw new Error('Open the complete private customer claim link.');
    return {id,owner:false,newSecret:null};
  }
  if(owner)return {id:workspaceHash(owner),owner:true,newSecret:null};
  if(!['/api/merchant/state','/api/merchant/sources'].includes(url.pathname))throw new Error('Open the merchant desk before using its actions.');
  const newSecret=randomBytes(32).toString('base64url');
  return {id:workspaceHash(newSecret),owner:true,newSecret};
}

export async function boundedJSON(request,max=3000000){
  if(Number(request.headers.get('content-length')||0)>max)throw new Error('Request is too large.');
  if(!request.body)return {};
  const reader=request.body.getReader(),chunks=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>max){await reader.cancel();throw new Error('Request is too large.');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder().decode(bytes)||'{}');
}
