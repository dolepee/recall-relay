import {sourceConditionQuote,hasSourceCondition} from './source-conditions.mjs';
// Conservative anchors for a bounded reader aid. These are not a general
// semantic verifier; unsupported actor/sequence combinations are withheld.
export function advisoryFidelityIssue(quote,value){
 const q=quote.toLowerCase(),e=value.explanation.toLowerCase();
 let actor='UNKNOWN';
 const conditional=sourceConditionQuote(quote);
 if(hasSourceCondition(quote)&&!conditional)return 'The customer qualifier boundary is ambiguous; read the complete source.';
 let subject=conditional&&quote.trimStart().startsWith(conditional)&&q.includes(',')?q.slice(q.indexOf(',')+1).trim():q;
 if(/^(?:before|after|following|upon receipt)\b[^,]+,\s*/i.test(subject))subject=subject.replace(/^(?:before|after|following|upon receipt)\b[^,]+,\s*/i,'');
 subject=subject.replace(/^please\s+/i,'');
 if(conditional&&/^(?:for\s+)?(?:consumers?|customers?)\s+(?:who|with|without)\b/i.test(conditional)&&/^they\b/.test(subject))actor='CUSTOMER';
 else if(/^(?:consumers?|customers?|you)\b/.test(subject)||/^(?:upload|submit|provide|enter|supply|state|describe|identify|list|include|write|tell|photograph|confirm|attest|stop|do not|never|unplug|cut|remove|contact|register|return)\b/.test(subject))actor='CUSTOMER';
 else if(/^(?:the )?(?:manufacturer|company|firm|we)\b/.test(subject))actor='MANUFACTURER';
 else if(/^(?:the )?(?:merchant|retailer)\b/.test(subject))actor='MERCHANT';
 else if(/^(?:paypal|the payment provider)\b/.test(subject))actor='PROVIDER';
 if(value.actor!=='UNKNOWN'&&value.actor!==actor)return 'Actor lacks a supported source anchor.';
 // A changed negation or swapped actor/object is not a paraphrase; it changes
 // the instruction. Withhold it rather than presenting a confident inversion.
 const qNeg=/\b(?:not|never|no|without|unreadable|ineligible|unavailable)\b/.test(q);
 // A caveat such as "this does not confirm" is not an instruction negation.
 const eCore=e.replace(/\b(?:does not|do not|is not|are not)\s+(?:confirm|verify|establish|mean|prove|record|indicate|imply|authorize|guarantee)[^.;]*/gi,'');
 const eNeg=/\b(?:not|never|no|without|unreadable|ineligible|unavailable|prohibited)\b/.test(eCore);
 if(qNeg!==eNeg)return 'Negation differs from the source.';
 if(actor==='MANUFACTURER'&&/^(?:consumers?|customers?|you)\b/.test(e))return 'The explanation changes the responsible actor.';
 // A closed outcome polarity set catches the common inversion that changes a
 // promise into a refusal without changing negation or actor. It is deliberately
 // narrow; an unrecognized outcome is not treated as semantically verified.
 const positiveOutcome=/\b(?:issue|issued|issuing|provide|provided|providing|pay|paid|paying|refund|refunded|refunding|approve|approved|approving|replace|replaced|replacing|ship|shipped|shipping|send|sent|sending|honor|honored|deliver|delivered|delivering)\b/i;
 const negativeOutcome=/\b(?:decline|declined|declining|deny|denied|denying|refuse|refused|refusing|reject|rejected|rejecting|withhold|withheld|withholding|cancel|cancelled|canceled|cancelling|canceling|stop|stopped|stopping|delay|delayed|delaying|ignore|ignored|ignoring)\b/i;
 if(positiveOutcome.test(q)&&negativeOutcome.test(e))return 'The explanation reverses a supported outcome.';
 if(negativeOutcome.test(q)&&positiveOutcome.test(e))return 'The explanation reverses a supported outcome.';
 if(/\bfrom\s+(?:the\s+)?(?:consumer|customers?|you)\b/i.test(e)&&!/\bfrom\s+(?:the\s+)?(?:consumer|customers?|you)\b/i.test(q))return 'The explanation reverses the customer/provider direction.';
 const identifiers=['serial number','order number','lot code','model number','batch number','item number','product number','receipt number','claim number','tracking number'];
 for(const term of identifiers)if(new RegExp('\\b'+term.replace(/ /g,'\\s+')+'\\b','i').test(e)&&!new RegExp('\\b'+term.replace(/ /g,'\\s+')+'\\b','i').test(q))return 'The explanation introduced an identifier not present in the source.';
 for(const [sourceTerm,expected] of [['serial number','serial'],['order number','order'],['lot code','lot'],['model number','model'],['unreadable','unreadable']]){
  if(new RegExp('\\b'+sourceTerm.replace(/ /g,'\\s+')+'\\b','i').test(q)&&!new RegExp('\\b'+expected+'\\b','i').test(e))return 'A required source identifier or condition was changed.';
 }
 const before=/\bbefore\b|prior to/.test(q),after=/\bafter\b|following|upon receipt|once (?:the |your )?(?:refund|payment)|\bonce\b[^.!?]{0,80}\b(?:receives?|received|arrives?|arrived|completed)\b/.test(q),at=/\bat (?:the time of )?submission\b|\bwhen submitting\b/.test(q);
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
