import {sourceConditionQuote} from './source-conditions.mjs';
// Conservative anchors for a bounded reader aid. These are not a general
// semantic verifier; unsupported actor/sequence combinations are withheld.
export function advisoryFidelityIssue(quote,value){
 const q=quote.toLowerCase(),e=value.explanation.toLowerCase();
 let actor='UNKNOWN';
 const conditional=sourceConditionQuote(quote);
 const subject=conditional&&quote.trimStart().startsWith(conditional)&&q.includes(',')?q.slice(q.indexOf(',')+1).trim():q;
 if(/^(?:consumers?|customers?|you)\b/.test(subject)||/^(?:upload|submit|provide|confirm|attest|stop|do not|never|unplug|cut|remove|contact|register|return)\b/.test(subject))actor='CUSTOMER';
 else if(/^(?:the )?(?:manufacturer|company|firm|we)\b/.test(q))actor='MANUFACTURER';
 else if(/^(?:the )?(?:merchant|retailer)\b/.test(q))actor='MERCHANT';
 else if(/^(?:paypal|the payment provider)\b/.test(q))actor='PROVIDER';
 if(value.actor!=='UNKNOWN'&&value.actor!==actor)return 'Actor lacks a supported source anchor.';
 const before=/\bbefore\b|prior to/.test(q),after=/\bafter\b|following|upon receipt|once (?:the |your )?(?:refund|payment)/.test(q),at=/\bat (?:the time of )?submission\b|\bwhen submitting\b/.test(q);
 const expected=conditional?'CONDITIONAL':before&&!after?'BEFORE_ACTION':after&&!before?'AFTER_ACTION':at?'AT_SUBMISSION':'UNSPECIFIED';
 if(value.timing!==expected)return 'Timing differs from the supported source sequence.';
 if(conditional){if(value.condition?.replace(/[,;.!?]+$/,'').toLowerCase()!==conditional.toLowerCase())return 'A complete applicability condition was not preserved.';}
 else if(value.condition!==null&&!quote.includes(value.condition))return 'Condition is not in the source.';
 if(!conditional&&value.condition!==null&&!before&&!after)return 'An unconditional instruction gained a condition.';
 for(const term of ['unplug','cut','only','dispose','destroy','remove','stop using'])if(q.includes(term)&&!e.includes(term))return 'A critical action or qualifier was omitted.';
 for(const modal of ['may','should','must'])if(new RegExp('\\b'+modal+'\\b').test(q)&&!new RegExp('\\b'+modal+'\\b').test(e))return 'Source modality was changed or omitted.';
 if(/\b(?:do not|must not|never)\b/.test(q)){
  if(!/\b(?:not|never|prohibit)\b/.test(e))return 'A prohibition was omitted.';
  if(!conditional&&/\b(?:if|unless|when|until)\b/.test(e))return 'An unconditional prohibition was narrowed.';
 }
 for(const trigger of ['before','after','until'])if(new RegExp('\\b'+trigger+'\\b').test(e)&&!new RegExp('\\b'+trigger+'\\b').test(q))return 'The explanation introduced a sequence.';
 for(const n of q.match(/\b\d+(?:\.\d+)?\b/g)||[])if(!new RegExp('\\b'+n.replace('.','\\.')+'\\b').test(e))return 'A source number was omitted.';
 return null;
}
