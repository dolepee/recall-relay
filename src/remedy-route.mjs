import {sourceSentences} from './source-sentences.mjs';
// Candidate routing only. It never proves merchant responsibility or payment authority.
export function classifyRemedyRoute(remedies,options){
 const text=remedies.join('\n'),sentences=sourceSentences(text);
 const mentions=sentences.filter(s=>/original (?:form of )?payment|same form of payment/i.test(s));
 // Scope negation to the refund/payment promise. A later availability caveat
 // (for example, a replacement being unavailable) does not deny the promise.
 const caveat=/\b(?:because|since|due to|if|when|while|unless)\b/i;
 const denial=/\b(?:not|never|cannot|can't|won't|unable|no longer|unavailable|isn't|aren't|doesn't|don't|instead of|rather than)\b/i;
 // Only one sentence-final caveat about replacement/stock availability is
 // ignorable. Any leading, medial, repeated or payment-bearing caveat is manual.
 const pureCaveat=/^\b(?:because|since|due to|if|when|while|unless)\b\s+(?:an?\s+|the\s+)?(?:replacement|substitute|stock|inventory|supply|product|item)\b(?:\s+(?:is|are|was|were|be|been|being))?(?:\s+(?:currently|temporarily|still|presently|not|no longer)){0,3}\s+(?:available|unavailable|in stock|out of stock)\s*[.!?]?$/i;
 const caveatAssessment=s=>{
  const text=String(s),matches=[...text.matchAll(/\b(?:because|since|due to|if|when|while|unless)\b/gi)];
  const trailing=matches.length===1&&matches[0].index>0&&pureCaveat.test(text.slice(matches[0].index));
  return {ambiguous:matches.length>0&&!trailing,negated:denial.test(trailing?text.slice(0,matches[0].index):text)};
 };
 const assessed=mentions.map(s=>({s,...caveatAssessment(s)}));
 const original=assessed.some(({s,negated})=>!negated&&/\brefund/i.test(s));
 const denied=assessed.some(x=>x.negated);
 const ambiguous=assessed.some(x=>x.ambiguous);
 const check=/\b(?:in the form of|by|via|using|issue[ds]?|mail(?:ed)?|receive)\s+(?:an?\s+)?(?:refund\s+)?(?:check|cheque)\b|\b(?:check|cheque)\b[^.!?]{0,45}\b(?:mailed|issued|sent)\b/i.test(text);
 const credit=/store credit|gift card/i.test(text),marketplace=/(?:Amazon|Walmart).{0,100}return systems/i.test(text);
 if(!options.includes('Refund'))return 'NON_REFUND_REMEDY';
 if(marketplace)return 'MARKETPLACE_RETURN_REQUIRED';
 if(options.some(o=>o!=='Refund')||original&&denied||original&&ambiguous||credit&&(original||check||/full refund or/i.test(text)))return 'CHOICE_REQUIRES_REVIEW';
 if(check)return 'CHECK_REFUND';if(credit)return 'STORE_CREDIT';
 return original&&!denied?'ORIGINAL_PAYMENT_CANDIDATE':'REFUND_ROUTE_UNSPECIFIED';
}
