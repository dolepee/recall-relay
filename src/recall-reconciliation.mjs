import {createHash} from 'node:crypto';
import {advisoryPrompt,validateAdvisory} from './case-advisory.mjs';
import {projectReconciliation} from './reconciliation-projection.mjs';
export function reconcileLedger(input,policy,claims=[],now){
  const result=projectReconciliation(input,policy,claims,now,value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,24));
  const digest=createHash('sha256').update(JSON.stringify({scope:result.scope,ledger:result.ledger,lines:result.lines})).digest('hex');
  return {...result,digest};
}

export async function reconciliationAdvice(ai,desk,input){
  if(!input||Object.keys(input).join()!=='planId'||typeof input.planId!=='string')throw new Error('Choose a saved reconciliation plan.');
  const row=desk.db.prepare('SELECT data FROM reconciliation_plans WHERE id=?').get(input.planId);
  if(!row)throw new Error('Unknown reconciliation plan.');
  const plan=JSON.parse(row.data),context={clauses:plan.scope.clauses.map(c=>({citationId:c.id,quote:c.quote}))};
  if(!context.clauses.length)throw new Error('This plan has no source clauses to interpret.');
  const status=ai.advisoryStatus?.()||ai.status();if(!status.available)throw new Error('AI is unavailable. Read the complete source quotations.');
  const raw=await ai.generate(advisoryPrompt,{clauses:context.clauses},{maxTokens:3500,advisory:true});
  return {planId:plan.id,model:status.model,readOnly:true,clauses:validateAdvisory(raw,context)};
}
