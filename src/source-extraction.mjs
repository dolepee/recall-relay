import {sourceClauses,validateSourceSuggestion} from './source-policy.mjs';
export function sourceDraftInput(source){
 const clauses=sourceClauses(source);if(!clauses.length||clauses.length>24)throw new Error('This notice needs manual review; AI drafting supports one to 24 source sentences.');
 return {title:source.title,clauses:clauses.map(({id,quote})=>({clauseId:id,quote}))};
}
export function validateSourceDraft(raw,source){
 let value;try{value=JSON.parse(raw.trim().replace(/^```json\s*/,'').replace(/\s*```$/,''));}catch{throw new Error('The assistant did not return a usable draft. Review the source manually.');}
 const clauses=sourceDraftInput(source).clauses;
 if(!value||Object.keys(value).join()!=='clauses'||!Array.isArray(value.clauses)||value.clauses.length!==clauses.length)throw new Error('The assistant must classify every source sentence. No draft was saved.');
 const seen=new Set(),requirements=[];
 for(const entry of value.clauses){
  const clause=clauses.find(c=>c.clauseId===entry?.clauseId);
  if(!entry||Object.keys(entry).sort().join()!=='clauseId,kinds'||!clause||seen.has(entry.clauseId)||!Array.isArray(entry.kinds)||entry.kinds.length>3||new Set(entry.kinds).size!==entry.kinds.length||entry.kinds.some(k=>!['PHOTO','TEXT','CONFIRMATION'].includes(k)))throw new Error('The assistant returned an invalid or duplicate sentence classification. No draft was saved.');
  seen.add(entry.clauseId);for(const kind of entry.kinds)requirements.push({kind,quote:clause.quote});
 }
 return validateSourceSuggestion(JSON.stringify({requirements}),source);
}
