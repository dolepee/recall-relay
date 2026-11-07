// Bounded lexical cues, shared by publication coverage and advisory labels.
// An unmatched sentence is not proof that no condition exists; a human still
// reviews the complete notice. Matched conditions stay manual for execution.
const conditionCue=/\b(?:if|unless|when|where|whenever|wherever|provided that|(?:provided|providing)\s+(?:(?:that\s+)?(?:you|they|we|consumers?|customers?|the|your|a|an)\b)|on condition that|in (?:the )?event|in case|(?:as|so) long as|only (?:when|if|after)|depending on|subject to|(?:for\s+)?(?:consumers?|customers?)\s+(?:who|with|without)|only\s+for)\b/i;
export function sourceConditionQuote(quote){
 const match=conditionCue.exec(quote);if(!match)return null;
 const tail=quote.slice(match.index).split(/[,;.!?]/,1)[0].trim();
 // A customer qualifier ends before the main obligation/outcome, not after it.
 return /^(?:for\s+)?(?:consumers?|customers?)\s+(?:who|with|without)\b/i.test(tail)?tail.split(/\s+(?:will|must|should|shall|need to|are required to)\b/i,1)[0].trim():tail;
}
export function hasSourceCondition(quote){return conditionCue.test(quote);}
