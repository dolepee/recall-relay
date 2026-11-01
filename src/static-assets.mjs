import {readFile,realpath} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.ico':'image/x-icon'};
// The reviewed landing document answers /; the workbench keeps its own routes.
const appPages=new Set(['/desk','/setup','/claim','/training']);
export function builtAssets(directory){
  const root=resolve(directory);
  return async(req,res,path)=>{
    const fail=code=>{res.writeHead(code,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end(code===405?'Method not allowed':code===500?'Unable to serve app':'Not found');};
    if(!['GET','HEAD'].includes(req.method))return fail(405);
    let decoded;try{decoded=decodeURIComponent(path);}catch{return fail(404);}
    if(decoded.includes('\\')||decoded.includes('\0')||decoded.split('/').some(p=>p==='..'||p.startsWith('.')))return fail(404);
    const document=decoded==='/'?'landing.html':appPages.has(decoded)?'index.html':null;
    if(!document&&!decoded.startsWith('/assets/'))return fail(404);
    const target=resolve(root,document||'.'+decoded);
    if(!target.startsWith(root+sep)||!types[extname(target)])return fail(404);
    try{
      const canonicalRoot=await realpath(root),canonical=await realpath(target);
      if(!canonical.startsWith(canonicalRoot+sep))return fail(404);
      const data=await readFile(canonical);
      res.writeHead(200,{'Content-Type':types[extname(target)],'Content-Length':data.length,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':document?'no-store':'public, max-age=31536000, immutable'});
      res.end(req.method==='HEAD'?undefined:data);
    }catch(error){return fail(['ENOENT','ENOTDIR'].includes(error.code)?404:500);}
  };
}
