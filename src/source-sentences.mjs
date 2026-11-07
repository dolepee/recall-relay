// Retain closing quotation marks on the preceding sentence. This is a bounded
// splitter for reviewed English source text, not a general language parser.
export function sourceSentenceSpans(text){
 const breaks=/(?<=[.!?]["”’']?)\s+(?=[A-Z])/g,spans=[];let start=0,match;
 while((match=breaks.exec(text))){if(text.slice(start,match.index).trim())spans.push({start,end:match.index});start=match.index+match[0].length;}
 if(text.slice(start).trim())spans.push({start,end:text.length});return spans;
}
export const sourceSentences=text=>sourceSentenceSpans(text).map(({start,end})=>text.slice(start,end).trim());
