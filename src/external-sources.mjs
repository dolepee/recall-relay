import {sourceSentences} from './source-sentences.mjs';
const customerAction=part=>part.trim().replace(/^(?:consumers?|customers?|you)\s+/i,'');
const prohibitedAction=part=>/^(?:(?:do|must|should|shall|can|may|need)\s+not|never|not\b|(?:are|is|will be)\s+not\s+(?:required|asked|expected)|do not need to)\b/i.test(customerAction(part));
// Keep affirmative actions with all of their timing modifiers and destinations.
// Only a prohibited action needs separation from a later prerequisite. Unknown
// prerequisite grammar retains its reference rather than being discarded.
export const externalActionParts=quote=>quote.split(/;|\bbut\b|\band\s+(?=(?:visit|go to|access|register|log in|sign in|contact|obtain|get|request|complete|send|submit|upload|provide)\b)/i).flatMap(part=>prohibitedAction(part)?part.split(/\s+(?:until|unless|before|after)\s+/i):[part]);
export function externalDependencies(source){
 const remedies=source.rootRemedies||source.remedies||[],dependencies=[];
 remedies.forEach((text,p)=>sourceSentences(text).forEach((quote,i)=>{
  // Assess each action, so a forbidden destination is not a required source.
  // A separate affirmative registration/upload still needs its own review.
  const actions=externalActionParts(quote);
  const referenced=actions.filter(part=>{
   if(prohibitedAction(part))return false;
   const instructionReference=/(?:instructions?[^.!?]{0,160}(?:web ?site|online|www\.|https?:)|(?:following|according to)[^.!?]{0,120}instructions?|register at https?:)/i.test(part);
   const webDestination=/(?:https?:\/\/|www\.|\b(?:web ?site|recall portal|online portal|(?:recall )?registration page)\b)/i.test(part);
   const offsiteAction=/\b(?:visit|go to|access|register|log in|sign in|contact|obtain|get|request|complete|send|submit|upload|provide)\b/i.test(part);
   return instructionReference||webDestination&&offsiteAction;
  });
  if(!referenced.length)return;
  const reference=referenced.join(' ').match(/(?:https?:\/\/|www\.)[^\s<>"')]+/i)?.[0]?.replace(/[.,;]+$/,'');
  const url=reference?(/^www\./i.test(reference)?'https://'+reference:reference):null,id=`external-${p}-${i}`,snapshot=source.externalSnapshots?.find(s=>s.dependencyId===id);
  dependencies.push({id,quote,url,status:snapshot?'REVIEWED_SNAPSHOT':'UNRESOLVED',snapshotDigest:snapshot?.digest||null});
 }));
 for(const [index,snapshot] of (source.externalSnapshots||[]).entries()){
  // An excerpt may not resolve a further instruction by being labelled INFORMATION.
  // Nested references stay manual rather than silently treating the root as complete.
  for(const nested of externalDependencies({remedies:[snapshot.text]}))dependencies.push({...nested,id:`nested-${index}-${nested.id}`,status:'UNRESOLVED',snapshotDigest:null});
 }
 return dependencies;
}
