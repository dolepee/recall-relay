// Bounded, all-or-nothing counters for the hosted sandbox.
//
// Every scope shares one row shape and one primary key:
//   daily_budget(day TEXT NOT NULL, scope TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(day, scope))
// `day` is the UTC date. A short burst window is encoded in the scope name, so the burst buckets need
// no schema change and no second table.
//
// The numbers below are adjustable application defaults. They pace consumption of the existing
// allowance; they are not evidence of fair allocation and they never raise a ceiling.
//
// Invariant for every admission: a request may perform an AI generation only if, within one serialized
// storage transaction, both the per workspace daily counter and the global daily counter were below
// their existing ceilings and both were incremented together; if either ceiling is reached, neither
// counter changes.

export const DEFAULT_BUDGET_LIMITS=Object.freeze({
  workspacesPerDay:200,
  aiPerWorkspacePerDay:20,
  aiGlobalPerDay:80,
  aiPerWorkspacePerBurst:2,
  aiGlobalPerBurst:5,
  burstWindowSeconds:60,
});

const dayPattern=/^\d{4}-\d{2}-\d{2}$/;
const BURST_PREFIX='ai-burst-';
const ADMISSION_PREFIX='ai-admit-';

// The UTC day key is derived from one clock reading so every scope in a transaction agrees.
export function utcDay(now){
  if(!Number.isFinite(now))return null;
  const day=new Date(now).toISOString().slice(0,10);
  return dayPattern.test(day)?day:null;
}
export function burstBucket(now,windowSeconds){
  const window=Number.isFinite(windowSeconds)&&windowSeconds>0?windowSeconds:DEFAULT_BUDGET_LIMITS.burstWindowSeconds;
  return Math.floor(now/(window*1000));
}
export function burstScope(scope,bucket){return `${scope}#${bucket}`;}
export function dayResetInstant(day){return new Date(Date.parse(day+'T00:00:00.000Z')+86400000).toISOString();}
export function burstResetInstant(bucket,windowSeconds){
  const window=Number.isFinite(windowSeconds)&&windowSeconds>0?windowSeconds:DEFAULT_BUDGET_LIMITS.burstWindowSeconds;
  return new Date((bucket+1)*window*1000).toISOString();
}
// The server states the absolute reset instant in UTC; the interface never computes one.
export function resetLabel(instant){
  return typeof instant==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(instant)?`${instant.slice(0,10)} ${instant.slice(11,16)} UTC`:null;
}

// A refusal carries the server's own reset instant and reason so the interface never computes or
// guesses either one, and so a refusal can never be silent or shown as a success.
export function aiRefusal(admission){
  const resetAt=admission?.resetAt||null,label=resetLabel(resetAt);
  const when=label?` It accepts new drafts again at ${label}.`:'';
  const error=new Error(admission?.reason==='burst'
    ?`The shared AI allowance is pacing new drafts right now.${when} Manual review and existing claims remain available.`
    :`The sandbox AI allowance is used for today.${when} Manual review and existing claims remain available.`);
  error.resetAt=resetAt;
  error.reason=admission?.reason||'daily';
  return error;
}

export class UsageBudgetCore {
  constructor(storage,limits=DEFAULT_BUDGET_LIMITS,{clock=()=>Date.now()}={}){
    this.storage=storage;
    this.limitSource=typeof limits==='function'?limits:()=>limits;
    this.clock=clock;
    storage.sql.exec('CREATE TABLE IF NOT EXISTS daily_budget (day TEXT NOT NULL, scope TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(day,scope)); CREATE TABLE IF NOT EXISTS known_workspaces (id TEXT PRIMARY KEY)');
  }
  limits(){return {...DEFAULT_BUDGET_LIMITS,...this.limitSource()};}
  hasWorkspace(id){return this.storage.sql.exec('SELECT id FROM known_workspaces WHERE id=?',id).toArray().length===1;}
  count(day,scope){return this.storage.sql.exec('SELECT count FROM daily_budget WHERE day=? AND scope=?',day,scope).toArray()[0]?.count||0;}
  bump(day,scope){this.storage.sql.exec('INSERT INTO daily_budget VALUES (?,?,1) ON CONFLICT(day,scope) DO UPDATE SET count=count+1',day,scope);}
  // Both scopes move together: rows from an earlier day and stale burst buckets of the current day
  // are removed in the same transaction that reads and writes the counters.
  prune(day,bucket){
    this.storage.sql.exec('DELETE FROM daily_budget WHERE day < ?',day);
    this.storage.sql.exec('DELETE FROM daily_budget WHERE day = ? AND scope LIKE ? AND scope NOT LIKE ?',day,BURST_PREFIX+'%','%#'+bucket);
  }
  // One transaction. The clock is read once, every limit is tested before anything is written, and
  // the increments are applied together. Nothing is consumed when any ceiling is reached.
  admit(daily=[],burst=[]){
    return this.storage.transactionSync(()=>{
      const now=Number(this.clock()),day=utcDay(now);
      if(day===null)return {admitted:false,reason:'clock',resetAt:null};
      const limits=this.limits(),bucket=burstBucket(now,limits.burstWindowSeconds);
      this.prune(day,bucket);
      const burstScopes=burst.map(entry=>({scope:burstScope(entry.scope,bucket),limit:entry.limit}));
      for(const {scope,limit} of daily)if(this.count(day,scope)>=limit)return {admitted:false,reason:'daily',scope,resetAt:dayResetInstant(day)};
      for(const {scope,limit} of burstScopes)if(this.count(day,scope)>=limit)return {admitted:false,reason:'burst',scope,resetAt:burstResetInstant(bucket,limits.burstWindowSeconds)};
      const admissionId=crypto.randomUUID(),scopes=[...daily,...burstScopes].map(entry=>entry.scope);
      for(const scope of scopes)this.bump(day,scope);
      // The marker row is the durable proof that this admission consumed a unit. Its removal is the
      // refund, so a repeated refund finds no row and cannot decrement twice.
      this.bump(day,ADMISSION_PREFIX+admissionId);
      return {admitted:true,admissionId,day,resetAt:dayResetInstant(day),scopes};
    });
  }
  // Idempotent compensation for an admission whose generation produced no usable text. Fail closed:
  // an admission from another UTC day, or one already refunded, leaves the unit consumed.
  refund(receipt){
    if(!receipt||typeof receipt.admissionId!=='string'||!Array.isArray(receipt.scopes))return false;
    return this.storage.transactionSync(()=>{
      const day=utcDay(Number(this.clock()));
      if(day===null||receipt.day!==day)return false;
      const marker=this.storage.sql.exec('DELETE FROM daily_budget WHERE day=? AND scope=?',day,ADMISSION_PREFIX+receipt.admissionId);
      if((marker.rowsWritten||0)!==1)return false;
      for(const scope of receipt.scopes)this.storage.sql.exec('UPDATE daily_budget SET count=MAX(count-1,0) WHERE day=? AND scope=?',day,scope);
      return true;
    });
  }
  // Read only: what `admit` would decide right now, without consuming anything.
  allowance(daily=[],burst=[]){
    return this.storage.transactionSync(()=>{
      const now=Number(this.clock()),day=utcDay(now);
      if(day===null)return {available:false,reason:'clock',resetAt:null};
      const limits=this.limits(),bucket=burstBucket(now,limits.burstWindowSeconds);
      for(const {scope,limit} of daily)if(this.count(day,scope)>=limit)return {available:false,reason:'daily',resetAt:dayResetInstant(day)};
      for(const {scope,limit} of burst)if(this.count(day,burstScope(scope,bucket))>=limit)return {available:false,reason:'burst',resetAt:burstResetInstant(bucket,limits.burstWindowSeconds)};
      return {available:true,reason:null,resetAt:dayResetInstant(day)};
    });
  }
  aiSpec(workspaceId){
    const limits=this.limits();
    return {
      daily:[{scope:'ai-workspace-'+workspaceId,limit:limits.aiPerWorkspacePerDay},{scope:'ai-total',limit:limits.aiGlobalPerDay}],
      burst:[{scope:BURST_PREFIX+'workspace-'+workspaceId,limit:limits.aiPerWorkspacePerBurst},{scope:BURST_PREFIX+'total',limit:limits.aiGlobalPerBurst}],
    };
  }
  admitAI(workspaceId){const {daily,burst}=this.aiSpec(workspaceId);return this.admit(daily,burst);}
  aiAllowance(workspaceId){const {daily,burst}=this.aiSpec(workspaceId);return this.allowance(daily,burst);}
  // A workspace is either counted and registered, or neither. The counter and the registry insert
  // share one transaction, so a failed insert cannot spend the day's workspace token.
  openWorkspace(id){
    return this.storage.transactionSync(()=>{
      const now=Number(this.clock()),day=utcDay(now);
      if(day===null)return {opened:false,reason:'clock',resetAt:null};
      const limits=this.limits();
      this.prune(day,burstBucket(now,limits.burstWindowSeconds));
      const resetAt=dayResetInstant(day);
      if(this.count(day,'workspaces')>=limits.workspacesPerDay)return {opened:false,reason:'capacity',resetAt};
      this.storage.sql.exec('INSERT INTO known_workspaces VALUES (?)',id);
      this.bump(day,'workspaces');
      return {opened:true,reason:null,resetAt};
    });
  }
}
