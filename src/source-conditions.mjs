// Bounded lexical cues, shared by publication coverage and advisory labels.
// An unmatched sentence is not proof that no condition exists; a human still
// reviews the complete notice. Matched conditions stay manual for execution.
const conditionCue=/\b(?:if|unless|when|where|whenever|wherever|provided that|(?:provided|providing)\s+(?:(?:that\s+)?(?:you|they|we|consumers?|customers?|the|your|a|an)\b)|on condition that|in (?:the )?event|in case|(?:as|so) long as|only (?:when|if|after)|depending on|subject to|for (?:consumers?|customers?) (?:who|with))\b/i;
export function sourceConditionQuote(quote){
 const match=conditionCue.exec(quote);if(!match)return null;
 return quote.slice(match.index).split(/[,;.!?]/,1)[0].trim();
}
export function hasSourceCondition(quote){return conditionCue.test(quote);}
