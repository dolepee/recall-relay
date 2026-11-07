export function externalDependencies(source){
 const remedies=source.rootRemedies||source.remedies||[],dependencies=[];
 remedies.forEach((text,p)=>text.split(/(?<=[.!?])\s+(?=[A-Z])/).forEach((quote,i)=>{
  const instructionReference=/(?:instructions?[^.!?]{0,160}(?:web ?site|online|www\.|https?:)|(?:following|according to)[^.!?]{0,120}instructions?|register at https?:)/i.test(quote);
  const webDestination=/(?:https?:\/\/|www\.|\b(?:web ?site|recall portal|online portal)\b)/i.test(quote);
  const offsiteAction=/\b(?:visit|go to|access|register|log in|sign in|contact|obtain|get|request|complete)\b/i.test(quote);
  // A claim-number or registration prerequisite can exist without the word
  // "instructions". Never fetch or treat an offsite action as already done.
  if(!instructionReference&&!(webDestination&&offsiteAction))return;
  const reference=quote.match(/(?:https?:\/\/|www\.)[^\s<>"')]+/i)?.[0]?.replace(/[.,;]+$/,'');
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
