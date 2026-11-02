function parseJSON(raw){return JSON.parse(raw.trim().replace(/^```json\s*/,'').replace(/\s*```$/,''));}
const KINDS=['PHOTO','CONFIRMATION','TEXT'];
const PHOTO_CUE=/\b(photo|photograph|photographs|photos|picture|pictures|image|images)\b/i;
const CONFIRM_CUE=/\b(confirm|confirms|confirmed|confirmation|confirmations|attest|attests|attested|attestation|attestations|certify|certifies|certification|certifications|verify|verifies|declare|declares|declaration|declarations)\b/i;
const TEXT_CUE=/\b(enter|provide|send|supply|state|describe|identify|list|include|write|tell(?:\s+us)?)\b(?:(?!\b(?:photo|photos|photograph|photographs|picture|pictures|image|images)\b)[^.!?]){0,60}?\b(?:(?:serial|batch|lot|model|order|item|product)\s+)?(?:number|code|identifier|description|name|address|date|receipt|invoice|amount|price|quantity|size|color)\b/i;

// Applies to assistant output only. The notice may legitimately contain disposal
// attestations, URLs, e-mail destinations or contact text; those are not rejected
// by keyword. A field fails only when its declared response type does not match
// what the quoted instruction actually asks the customer to do.
export function aiFieldProblem({kind,quote}){
  if(/\b(?:do not|must not|not required|not necessary|no (?:photo|photograph|confirmation)|confirmation e-?mail)\b/i.test(quote))return 'This sentence may prohibit information or describe a notification, rather than request customer evidence. Review it manually.';
  if(/\b(?:the )?(?:manufacturer|retailer|merchant|company|firm|we)\s+(?:will|shall|must|may|can)\s+(?:confirm|verify|provide|send|issue|take|supply)\b/i.test(quote))return 'This sentence describes an action by the business. Review the responsible actor before creating a customer field.';
  if(kind==='CONFIRMATION'&&/\b(?:you|consumers?|customers?)\s+(?:will|may|should|can)\s+(?:be sent|receive)\b/i.test(quote))return 'Receiving a confirmation is not a customer attestation request.';
  if(kind==='PHOTO'&&!PHOTO_CUE.test(quote))return 'A photograph field needs a request for a photograph or image.';
  if(kind==='CONFIRMATION'&&!CONFIRM_CUE.test(quote))return 'A confirmation field needs an explicit confirm, attest, certify, verify or declare request, including its noun form.';
  if(kind==='TEXT'&&!TEXT_CUE.test(quote))return 'A written field needs an explicit request for a value, identifier or description, not a photograph.';
  return null;
}

const sentenceBreak=/(?<=[.!?])\s+(?=[A-Z])/g;
const normalize=s=>s.replace(/\s+/g,' ').trim();
function sentenceSpans(text){
  const spans=[];let start=0;let match;sentenceBreak.lastIndex=0;
  while((match=sentenceBreak.exec(text))){
    if(text.slice(start,match.index).trim())spans.push({start,end:match.index});
    start=match.index+match[0].length;
  }
  if(text.slice(start).trim())spans.push({start,end:text.length});
  return spans;
}
// Every remedy sentence remains visible, including sentences the model omits.
export function sourceClauses(source){
  return source.remedies.flatMap((text,p)=>sentenceSpans(text).map((span,i)=>({id:`clause-${p}-${i}`,quote:text.slice(span.start,span.end).trim()})));
}
export function sourceFieldIssue(field){
  const problem=aiFieldProblem(field);
  if(problem)return problem;
  if(/\b(?:if|unless|only when|(?:after|following|once)\b[^.!?]{0,100}\b(?:refund|reimbursement|payment))\b/i.test(field.quote))
    return 'Conditional or post-refund instructions need a manual workflow; they cannot become an always-required field.';
  return null;
}
export function sourceCoverage(source,fields,decisions=[]){
  return sourceClauses(source).map(clause=>{
    const fieldIds=fields.filter(f=>normalize(f.quote).includes(normalize(clause.quote))).map(f=>f.id);
    const decision=decisions.find(d=>d.id===clause.id);
    return {...clause,fieldIds,disposition:fieldIds.length?'FIELD':decision?.disposition||'UNRESOLVED',reason:fieldIds.length?'':decision?.reason||''};
  });
}
// Assistant quotations must cover a complete source sentence, or a contiguous run
// of complete sentences. A shorter fragment is expanded to the one complete
// sentence that contains it, so conditions and destinations survive; an ambiguous
// or cross-sentence fragment is returned with a manual-guidance problem.
export function completeSourceQuote(quote,source){
  const target=normalize(quote);
  for(const remedy of source.remedies){
    const spans=sentenceSpans(remedy);
    for(let first=0;first<spans.length;first++)for(let last=first;last<spans.length;last++){
      if(normalize(remedy.slice(spans[first].start,spans[last].end))===target)return {quote:quote.trim()};
    }
  }
  const candidates=[];
  for(const remedy of source.remedies){
    for(const span of sentenceSpans(remedy)){
      const text=remedy.slice(span.start,span.end).trim();
      if(normalize(text).includes(target))candidates.push(text);
    }
  }
  const unique=[...new Set(candidates.map(normalize))];
  if(unique.length===1)return {quote:candidates.find(text=>normalize(text)===unique[0])};
  return {problem:'The quotation does not belong to one complete source sentence. Select the complete sentence with its conditions, or add it manually.'};
}
// Structural checks only, for a merchant's own exact-source selection. Manual
// choices are not restricted by the assistant's response-type rules.
export function validateManualField({kind,quote},source){
  if(!KINDS.includes(kind)||typeof quote!=='string'||quote.trim().length<12||quote.length>1600||!source.remedies.some(x=>x.includes(quote)))
    throw new Error('A proposed field lacks an exact source quotation. No field was saved.');
  const complete=completeSourceQuote(quote,source);
  if(complete.problem||complete.quote.length>1600)throw new Error('Select one complete source sentence with all its conditions.');
  return {kind,quote:complete.quote,sourceUrl:source.sourceUrl};
}

export function validateSourceSuggestion(raw,source){
  if(typeof raw!=='string'||raw.length>18000)throw new Error('The assistant did not return a usable draft. Review the source manually.');
  const value=parseJSON(raw);
  if(!value||Array.isArray(value)||Object.keys(value).join()!=='requirements'||!Array.isArray(value.requirements)||value.requirements.length>6)throw new Error('Unexpected draft fields. No suggestion was saved.');
  const seen=new Set(),requirements=[],filtered=[];
  for(const r of value.requirements){
    if(!r||Object.keys(r).sort().join()!=='kind,quote'||!KINDS.includes(r.kind)||typeof r.quote!=='string'||r.quote.trim().length<12||r.quote.length>1600||!source.remedies.some(x=>x.includes(r.quote)))
      throw new Error('A proposed field lacks an exact source quotation. No suggestion was saved.');
    const complete=completeSourceQuote(r.quote,source);
    if(complete.problem||complete.quote.length>1600){filtered.push({kind:r.kind,quote:r.quote,reason:complete.problem||'The complete source instruction is too long for one field.'});continue;}
    const quote=complete.quote;
    const problem=aiFieldProblem({kind:r.kind,quote});
    if(problem){filtered.push({kind:r.kind,quote:r.quote,reason:problem});continue;}
    const key=`${r.kind}\u0000${quote}`;
    if(seen.has(key)){filtered.push({kind:r.kind,quote:r.quote,reason:'Duplicate response for this quotation; the first valid response was kept.'});continue;}
    seen.add(key);
    requirements.push({id:`field-${requirements.length+1}`,kind:r.kind,quote,sourceUrl:source.sourceUrl});
  }
  return {requirements,filtered,sourceDigest:source.sourceDigest,paymentAuthorized:false,evidenceVerified:false};
}
