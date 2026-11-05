export function externalDependencies(source){
 const remedies=source.rootRemedies||source.remedies||[],dependencies=[];
 remedies.forEach((text,p)=>text.split(/(?<=[.!?])\s+(?=[A-Z])/).forEach((quote,i)=>{
  if(!/(?:instructions?[^.!?]{0,160}(?:website|https?:)|(?:following|according to)[^.!?]{0,120}instructions?|register at https?:)/i.test(quote))return;
  const url=quote.match(/https?:\/\/[^\s<>"')]+/i)?.[0]?.replace(/[.,;]+$/,'')||null,id=`external-${p}-${i}`,snapshot=source.externalSnapshots?.find(s=>s.dependencyId===id);
  dependencies.push({id,quote,url,status:snapshot?'REVIEWED_SNAPSHOT':'UNRESOLVED',snapshotDigest:snapshot?.digest||null});
 }));
 for(const [index,snapshot] of (source.externalSnapshots||[]).entries()){
  // An excerpt may not resolve a further instruction by being labelled INFORMATION.
  // Nested references stay manual rather than silently treating the root as complete.
  for(const nested of externalDependencies({remedies:[snapshot.text]}))dependencies.push({...nested,id:`nested-${index}-${nested.id}`,status:'UNRESOLVED',snapshotDigest:null});
 }
 return dependencies;
}
