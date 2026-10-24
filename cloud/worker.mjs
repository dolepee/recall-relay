import {DurableObject} from 'cloudflare:workers';
import {ClaimDeskCore} from '../src/claims-core.mjs';
import {RefundJournalCore} from '../src/journal-core.mjs';
import {cloudSql} from '../src/cloud-sql.mjs';
import {claimRoutes} from '../src/claims-http.mjs';
import {SourceWorkspace} from '../src/source-workspace.mjs';
import {HostedAI} from '../src/cloud-ai.mjs';
import {PayPalSandbox} from '../src/paypal-sandbox.mjs';
import {routeWorkspace,boundedJSON} from '../src/cloud-routing.mjs';
import {UsageBudgetCore,aiRefusal,resetLabel} from '../src/cloud-budget.mjs';

const json=(value,status=200,headers={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',...headers}});

// One Durable Object named `daily` holds every counter, so admissions are serialized. The table, the
// primary key, the binding and the hosting layout are unchanged.
export class UsageBudget extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.core=new UsageBudgetCore(ctx.storage,()=>this.limits(),{clock:()=>this.now()});}
  // Adjustable limits and clock. The shipped values live in src/cloud-budget.mjs; nothing here raises
  // a ceiling, and the daily counters always bind before the burst windows.
  limits(){return {};}
  now(){return Date.now();}
  hasWorkspace(id){return this.core.hasWorkspace(id);}
  openWorkspace(id){return this.core.openWorkspace(id);}
  admitAI(workspaceId){return this.core.admitAI(workspaceId);}
  aiAllowance(workspaceId){return this.core.aiAllowance(workspaceId);}
  refundAI(receipt){return this.core.refund(receipt);}
}

class HostedDesk extends ClaimDeskCore {
  constructor(options,id){super(options);this.workspaceId=id;}
  merchantView(claim){const view=super.merchantView(claim);view.claimUrl=`/claim?workspace=${this.workspaceId}#${claim.access}`;return view;}
  merchantState(){return {...super.merchantState(),hosted:true};}
  async createCheckout(){
    if(this.db.prepare('SELECT count(*) AS n FROM checkouts').get().n>=6)throw new Error('This sandbox workspace has reached its test-purchase limit. Existing claims and receipts remain available.');
    return super.createCheckout();
  }
}

export class RecallWorkspace extends DurableObject {
  async handle(input){
    const db=cloudSql(this.ctx.storage),journal=new RefundJournalCore(db);
    const desk=new HostedDesk({journal,origin:input.origin,provider:()=>PayPalSandbox.fromCredentials({clientId:this.env.PAYPAL_SANDBOX_CLIENT_ID,clientSecret:this.env.PAYPAL_SANDBOX_CLIENT_SECRET})},input.workspace);
    const budget=this.env.BUDGET.getByName('daily');
    const ai=new HostedAI(this.env.AI,async()=>{
      const admission=await budget.admitAI(input.workspace);
      if(!admission?.admitted)throw aiRefusal(admission);
      return admission;
    },this.env.AI_ENABLED===true,{
      refund:receipt=>budget.refundAI(receipt),
      allowance:()=>budget.aiAllowance(input.workspace),
    });
    const sourceWorkspace=new SourceWorkspace(db,{ai});
    let status=404,value={error:'Unknown action.'};
    const res={setHeader(){}};
    const req={method:input.method,headers:{origin:input.origin,'content-type':input.contentType,authorization:input.owner?'Bearer '+desk.merchantKey():input.authorization}};
    const route=claimRoutes(desk,{origin:input.origin,ai,sourceWorkspace,body:async()=>input.body,json:(_res,code,data)=>{status=code;value=data;}});
    if(input.path==='/api/merchant/login')return {status:403,value:{error:'Hosted workspaces use the private browser session. Open the merchant desk to begin.'}};
    await route(req,res,input.path);
    return {status,value};
  }
}

export default {
  async fetch(request,env){
    try{
      const url=new URL(request.url);
      if(!env.PUBLIC_ORIGINS.includes(url.origin))return json({error:'Unknown application origin.'},403);
      if(!url.pathname.startsWith('/api/merchant/')&&!url.pathname.startsWith('/api/claim/'))return json({error:'Unknown action.'},404);
      if(!['GET','POST'].includes(request.method))return json({error:'Unsupported method.'},405);
      if(request.method==='POST'&&(request.headers.get('origin')!==url.origin||request.headers.get('content-type')!=='application/json'))return json({error:'Same-origin JSON requests required.'},403);
      let session=routeWorkspace(url,request.headers.get('cookie'));
      const registry=env.BUDGET.getByName('daily');
      if(!session.newSecret&&!await registry.hasWorkspace(session.id)){
        if(!session.owner)return json({error:'This customer workspace was not found.'},404);
        session=routeWorkspace(url,'');
      }
      if(session.newSecret){
        const opening=await registry.openWorkspace(session.id);
        if(!opening?.opened){
          const label=resetLabel(opening?.resetAt);
          return json({error:`The sandbox is at capacity today.${label?` New desks open again at ${label}.`:''} Please return later.`,resetAt:opening?.resetAt||null},429);
        }
      }
      const input={workspace:session.id,owner:session.owner,path:url.pathname,method:request.method,origin:url.origin,contentType:request.headers.get('content-type'),authorization:request.headers.get('authorization')||'',body:request.method==='POST'?await boundedJSON(request):{}};
      const result=await env.WORKSPACES.getByName(session.id).handle(input);
      return json(result.value,result.status,session.newSecret?{'Set-Cookie':`rr_workspace=${session.newSecret}; HttpOnly; SameSite=Lax; Path=/; Max-Age=7776000${url.protocol==='https:'?'; Secure':''}`}:{ });
    }catch(error){return json({error:error instanceof Error?error.message:'The sandbox could not complete this request.'},400);}
  },
};
