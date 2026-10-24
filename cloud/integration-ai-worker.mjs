// Test-only entry point for the assistant-enabled integration harness (cloud/integration-ai.mjs).
// The shipped worker is cloud/worker.mjs; this file is never deployed.
//
// It does two things and nothing else:
//   1. injects a deterministic assistant binding in place of the Cloudflare Workers AI binding, so the
//      real admission path runs against real workerd and SQLite Durable Objects without a model call;
//   2. exposes a small control surface (clock, adjustable limits, counter inspection) that the harness
//      uses to make the tests deterministic.
//
// Every admission still runs through the shipped UsageBudgetCore transaction. The injection supplies
// only the assistant's return value; it never decides an admission, a counter or a refusal.
import worker,{RecallWorkspace as Workspace,UsageBudget as Budget} from './worker.mjs';

// One scripted step per inference call, served by the harness's outbound handler. The payload is either
// a controlled assistant result or an instruction to fail, so "no usable text" and "the provider
// failed" are both exercised as first-class cases.
const assistant={
  async run(model,inputs){
    const response=await fetch('https://ai.integration.test/v1/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,inputs})});
    const scripted=await response.json();
    if(scripted?.mode==='throw')throw new Error(scripted.message||'Injected inference failure.');
    return scripted.result;
  },
};
const withAssistant=env=>({...env,AI:assistant});

export class UsageBudget extends Budget {
  constructor(ctx,env){
    super(ctx,env);
    this.core.storage.sql.exec('CREATE TABLE IF NOT EXISTS test_controls (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  }
  // Test clock and adjustable limits live in the same SQLite storage as the counters, so a restart
  // cannot silently revert them mid-run.
  control(key){return this.core.storage.sql.exec('SELECT value FROM test_controls WHERE key=?',key).toArray()[0]?.value;}
  setControl(key,value){
    if(value===null)this.core.storage.sql.exec('DELETE FROM test_controls WHERE key=?',key);
    else this.core.storage.sql.exec('INSERT INTO test_controls VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,value);
    return true;
  }
  now(){const value=this.control('now');return value===undefined?Date.now():Number(value);}
  limits(){const value=this.control('limits');return value===undefined?{}:JSON.parse(value);}
  seed(day,scope,count){
    this.core.storage.sql.exec('INSERT INTO daily_budget VALUES (?,?,?) ON CONFLICT(day,scope) DO UPDATE SET count=?',day,scope,count,count);
    return true;
  }
  clear(){this.core.storage.sql.exec('DELETE FROM daily_budget');return true;}
  counters(){return this.core.storage.sql.exec('SELECT day,scope,count FROM daily_budget ORDER BY day,scope').toArray();}
  admitForTest(workspace){return this.core.admitAI(workspace);}
  refundForTest(receipt){return this.core.refund(receipt);}
}

export class RecallWorkspace extends Workspace {
  constructor(ctx,env){super(ctx,withAssistant(env));}
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/__test/budget'){
      const input=await request.json(),budget=env.BUDGET.getByName('daily');
      switch(input.op){
        case 'clock':await budget.setControl('now',input.value===null?null:String(input.value));return Response.json({ok:true});
        case 'limits':await budget.setControl('limits',input.value===null?null:JSON.stringify(input.value));return Response.json({ok:true});
        case 'seed':await budget.seed(input.day,input.scope,input.count);return Response.json({ok:true});
        case 'clear':await budget.clear();return Response.json({ok:true});
        case 'counters':return Response.json({rows:await budget.counters()});
        case 'admit':return Response.json({receipt:await budget.admitForTest(input.workspace)});
        case 'refund':return Response.json({refunded:await budget.refundForTest(input.receipt)});
        default:return Response.json({error:'Unknown control operation.'},{status:400});
      }
    }
    return worker.fetch(request,withAssistant(env),ctx);
  },
};
