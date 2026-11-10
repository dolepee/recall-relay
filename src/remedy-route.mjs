import {sourceSentences} from './source-sentences.mjs';
// Candidate routing only. It never proves merchant responsibility or payment authority.
export function classifyRemedyRoute(remedies,options){
 const text=remedies.join('\n'),sentences=sourceSentences(text);
 const mentions=sentences.filter(s=>/original (?:form of )?payment|same form of payment/i.test(s));
 // Scope negation to the refund/payment promise. A later availability caveat
 // (for example, a replacement being unavailable) does not deny the promise.
 const caveat=/\b(?:because|since|due to|if|when|while|unless)\b/i;
 const negated=s=>{
  // Remove comma-delimited parentheticals structurally, not by an aside vocabulary.
  const main=String(s).replace(/,\s*[^,]*,\s*/g,' ');
  return /\b(?:not|never|cannot|can't|won't|unable|no longer|unavailable|isn't|aren't|doesn't|don't|instead of|rather than)\b/i.test(main.split(caveat)[0]);
 };
 const original=mentions.some(s=>!negated(s)&&/\brefund/i.test(s));
 const denied=mentions.some(negated);
 const check=/\b(?:in the form of|by|via|using|issue[ds]?|mail(?:ed)?|receive)\s+(?:an?\s+)?(?:refund\s+)?(?:check|cheque)\b|\b(?:check|cheque)\b[^.!?]{0,45}\b(?:mailed|issued|sent)\b/i.test(text);
 const credit=/store credit|gift card/i.test(text),marketplace=/(?:Amazon|Walmart).{0,100}return systems/i.test(text);
 if(!options.includes('Refund'))return 'NON_REFUND_REMEDY';
 if(marketplace)return 'MARKETPLACE_RETURN_REQUIRED';
 if(options.some(o=>o!=='Refund')||original&&denied||credit&&(original||check||/full refund or/i.test(text)))return 'CHOICE_REQUIRES_REVIEW';
 if(check)return 'CHECK_REFUND';if(credit)return 'STORE_CREDIT';
 return original&&!denied?'ORIGINAL_PAYMENT_CANDIDATE':'REFUND_ROUTE_UNSPECIFIED';
}
