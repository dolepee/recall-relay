import { createServer } from 'node:http';
import { mkdirSync, chmodSync, writeFileSync } from 'node:fs';
import { createServer as createViteServer } from 'vite';
import { planClaim } from './src/plan.mjs';
import { RefundJournal } from './src/journal.mjs';
import { matchCatalog } from './src/matcher.mjs';
import { catalog, sampleNotice, samplePurchases } from './src/catalog.mjs';
import { fetchRecallDraft } from './src/cpsc.mjs';
import { ClaimDesk } from './src/claims.mjs';
import { claimRoutes } from './src/claims-http.mjs';
import { PayPalSandbox } from './src/paypal-sandbox.mjs';
import {LocalAI} from './src/local-ai.mjs';
import {SourceWorkspace} from './src/source-workspace.mjs';
import {builtAssets} from './src/static-assets.mjs';
import {existsSync} from 'node:fs';

try{process.loadEnvFile('.env');}catch(error){if(error.code!=='ENOENT')throw error;}
const port = Number(process.env.RECALL_RELAY_PORT||4318);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('RECALL_RELAY_PORT must be an integer between 1024 and 65535.');
const production=process.argv.includes('--production');
if(production&&!existsSync('dist/index.html'))throw new Error('Run npm run build before npm start.');
const origin = `http://127.0.0.1:${port}`;
mkdirSync('.local',{recursive:true});
const desk=new ClaimDesk({path:'.local/connected-claims.sqlite',origin,provider:()=>PayPalSandbox.fromCredentials({clientId:process.env.PAYPAL_SANDBOX_CLIENT_ID,clientSecret:process.env.PAYPAL_SANDBOX_CLIENT_SECRET})});
const ai=new LocalAI();
const sourceWorkspace=new SourceWorkspace(desk.db,{ai});
chmodSync('.local/connected-claims.sqlite',0o600);
writeFileSync('.local/merchant-url.txt',`${origin}/desk#merchant=${desk.merchantKey()}\n`,{mode:0o600});
chmodSync('.local/merchant-url.txt',0o600);
const journal = new RefundJournal('.local/fixture-refunds.sqlite');
journal.db.exec('CREATE TABLE IF NOT EXISTS workspace (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
const read = (key, fallback) => {
  const row=journal.db.prepare('SELECT value FROM workspace WHERE key=?').get(key);
  return row?JSON.parse(row.value):fallback;
};
const persist = (key,value) => journal.db.prepare('INSERT INTO workspace VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));
const purchases = read('purchases',samplePurchases());
persist('purchases',purchases);
// This boundary deliberately cannot dispatch invented captures to PayPal.
// A separate sandbox capture import must be verified before enabling dispatch.
const policy = {id:'TRAINING-RECALL',version:1,sourceUrl:'https://example.com/fictional-recall',remedy:'REFUND',settlingMerchantId:'FIXTURE-MERCHANT',skus:['CUP-01'],lots:['LOT-A'],requiredEvidence:['label','remedy']};
let reviewed = read('policy-reviewed',false);
const evidence = new Map(read('evidence',[]));
const vite = production?null:await createViteServer({server:{middlewareMode:true,hmr:{host:'127.0.0.1'},fs:{deny:['.env','.env.*','*.{crt,pem,key,p12,pfx,cer,der}','.npmrc','.yarnrc.yml','**/.git/**','**/.local/**','**/.cache/**']}},appType:'spa'});
const serveAssets=production?builtAssets('dist'):null;
function currentPlan(purchase) {
  return planClaim({policy:{...policy,reviewedBy:reviewed?'local-test-merchant':null},purchase,evidence:evidence.get(purchase.id)||{},now:new Date().toISOString()});
}
function state() {
  return {mode:'fictional-training',sampleNotice,catalog,policyReviewed:reviewed,paymentAvailable:false,
    paymentReason:'Connect and verify a real sandbox capture before sending a refund. These orders are fictional.',
    cases:purchases.map(p=>({...p,plan:currentPlan(p),evidence:evidence.get(p.id)||{},reservation:journal.db.prepare('SELECT * FROM refunds WHERE merchant=? AND capture=? AND line=?').get(p.merchantId,p.captureId,p.lineId)||null}))};
}
function json(res,status,value) { res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(value)); }
async function body(req) {
  let text='';
  for await (const chunk of req) {text+=chunk;if(text.length>3000000)throw new Error('Request is too large. Choose an image smaller than 2 MB.');}
  return JSON.parse(text||'{}');
}
const handleClaims=claimRoutes(desk,{json,body,origin,sourceWorkspace,ai});
const server=createServer(async(req,res)=>{
  res.setHeader('Referrer-Policy','no-referrer');
  if(req.headers.host!==`127.0.0.1:${port}` && req.headers.host!==`localhost:${port}`) return json(res,403,{error:'Local host required.'});
  const path=new URL(req.url,origin).pathname;
  let decoded;
  try {decoded=decodeURIComponent(path);}catch{return json(res,400,{error:'Invalid path.'});}
  if(decoded.split(/[\\/]/).some(part=>['.local','.cache','.git'].includes(part)||/^\.env(?:\.|$)/.test(part)))
    return json(res,404,{error:'Not found.'});
  if(!path.startsWith('/api/')) return production?serveAssets(req,res,path):vite.middlewares(req,res);
  if(await handleClaims(req,res,path))return;
  try {
    if(req.method==='GET' && path==='/api/state')return json(res,200,state());
    if(req.method!=='POST')return json(res,405,{error:'Unsupported method.'});
    if(![origin,`http://localhost:${port}`].includes(req.headers.origin) || req.headers['content-type']!=='application/json')return json(res,403,{error:'Same-origin JSON requests required.'});
    const input=await body(req);
    if(path==='/api/recall-source')return json(res,200,await fetchRecallDraft(input.recallNumber));
    if(path==='/api/match')return json(res,200,await matchCatalog(input.text));
    if(path==='/api/review-policy') {
      if(input.sku!=='CUP-01'||input.lot!=='LOT-A'||input.confirmed!==true)throw new Error('This training notice only covers CUP-01, lot LOT-A. Verify the stated model and remedy.');
      if(input.notice!==sampleNotice)throw new Error('Matching accepts other text, but preparing refunds currently requires the unchanged fictional training notice.');
      reviewed=true;persist('policy-reviewed',true);return json(res,200,state());
    }
    const purchase=purchases.find(p=>p.id===input.id);
    if(!purchase)throw new Error('Unknown order.');
    if(path==='/api/review-evidence') {
      if(!reviewed)throw new Error('Review the notice first.');
      if(!purchase.labelVerified || !purchase.remedyVerified)throw new Error('This case is missing the required training evidence.');
      evidence.set(purchase.id,{label:{reviewedBy:'local-test-merchant',record:'fictional-label'},remedy:{reviewedBy:'local-test-merchant',record:'fictional-remedy'}});
      persist('evidence',[...evidence]);
      return json(res,200,state());
    }
    if(path==='/api/prepare') {
      const plan=currentPlan(purchase);
      const row=journal.reserve(plan,{actor:'local-test-merchant',digest:input.digest},purchase.captureRemainingCents);
      return json(res,200,state());
    }
    return json(res,404,{error:'Unknown action.'});
  } catch(error) {return json(res,400,{error:error.message});}
});
server.listen(port,'127.0.0.1',()=>console.log(`Recall Relay local prototype: ${origin}`));
process.on('SIGINT',async()=>{server.close();ai.close();journal.close();desk.close();await vite?.close();process.exit(0);});
