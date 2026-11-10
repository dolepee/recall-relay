import {sourceSentenceSpans as sentenceSpans} from './source-sentences.mjs';
import {hasSourceCondition} from './source-conditions.mjs';
import {externalDependencies,externalActionParts} from './external-sources.mjs';
function parseJSON(raw){return JSON.parse(raw.trim().replace(/^```json\s*/,'').replace(/\s*```$/,''));}
const KINDS=['PHOTO','CONFIRMATION','TEXT'];
const PHOTO_CUE=/\b(photo|photograph|photographing|photographs|photos|picture|pictures|image|images)\b/i;
const CONFIRM_CUE=/\b(confirm|confirms|confirmed|confirmation|confirmations|attest|attests|attested|attestation|attestations|certify|certifies|certification|certifications|verify|verifies|declare|declares|declaration|declarations)\b/i;
const TEXT_CUE=/\b(enter|provide|send|supply|state|describe|identify|list|include|write|tell(?:\s+us)?)\b(?:(?!\b(?:photo|photos|photograph|photographs|picture|pictures|image|images)\b)[^.!?]){0,60}?\b(?:(?:serial|batch|lot|model|order|item|product)\s+)?(?:number|code|identifier|description|name|address|date|receipt|invoice|amount|price|quantity|size|color)\b/i;


// Supported executable grammar for a photograph response. The object is deliberately
// a closed vocabulary rather than free text: an unrecognized word is a residual
// instruction, not something this form can execute. This is not a claim of general
// natural-language understanding; it is a conservative supported subset.
const PHOTO_OBJECT_WORDS=new Set(`a an the this that these those your its their our one two both
product products label labels sample cup cups item items unit units device devices dresser lamp packaging box carton container
rim latch plate serial number numbers code codes lot name date address receipt invoice order orders claim claims purchase purchases card cards form forms
photo photograph photographs picture pictures image images side sides front back top bottom panel panels marking markings model models base bases identifier identifiers description descriptions amount price quantity size color registration return e-mail sticker tag sleeve cap lid
marked damaged destroyed broken recalled affected disassembled personal original provided showing shows printed written must be legible shipping
and or of on in with for notice ui test fixture setup manufacturer firm retailer company brand
word recall crystal glass permanent black marker`.split(/\s+/));
const PHOTO_RETURN_OBJECTS=new Set(['address','addresses','label','labels','receipt','receipts','policy','policies','instruction','instructions','period','periods','window','windows','shipping']);
const photoObjectTokens=object=>[...object.matchAll(/[A-Za-z0-9][A-Za-z0-9'’.-]*/g)].map(match=>match[0].toLowerCase().replace(/[’']s$/,'').replace(/^[.-]+|[.-]+$/g,''));
function photoObjectIssue(object){
  const tokens=photoObjectTokens(object);
  if(!tokens.length)return null;
  for(let i=0;i<tokens.length;i++){
    const word=tokens[i],next=tokens[i+1],previous=tokens[i-1];
    // A handoff noun can decorate a label, but it cannot become a second action.
    if(word==='return'&&!PHOTO_RETURN_OBJECTS.has(next||''))return 'The response combines a photograph with an unsupported return or handoff. Keep this instruction manual.';
    // An email noun can name a photographed receipt; the verb form would take
    // a determiner and must not become a second handoff.
    if(word==='email'){
      if(!['receipt','receipts','invoice','invoices','confirmation','confirmations','message','messages'].includes(next||''))return 'The response introduces an unsupported e-mail action. Keep this instruction manual.';
      continue;
    }
    // A passive source phrase is descriptive; any other 'by' would introduce a destination.
    if(word==='by'){
      if(previous!=='provided')return 'The response introduces an unsupported destination or means. Keep this instruction manual.';
      continue;
    }
    if(!PHOTO_OBJECT_WORDS.has(word)&&!/^\d+$/.test(word))return 'The response contains unsupported residual wording. Keep this instruction manual.';
  }
  return null;
}
function photoResidualIssue(quote){
  if(!PHOTO_CUE.test(quote))return null;
  if(/\b(?:do not|must not|should not|not required|not necessary)\b/i.test(quote))return null;
  // Drop the same actor and modal prefixes the executable boundary already accepts.
  const instruction=quote.trim().replace(/^(?:consumers?|customers?|you)\s+(?:(?:(?:are|will be)\s+(?:asked|required)\s+to\s+)|(?:(?:need|have)\s+to\s+)|(?:(?:should|must|shall|may|can|will)\s+))?(?:immediately\s+)?/i,'').replace(/^please\s+/i,'');
  // A recognized response verb after a connector starts another supported response.
  // Everything else remains in the photograph clause and must fit the closed object grammar.
  const first=instruction.replace(/(?:(?:\b(?:and|then|also)\s+)|(?:;\s*))(?=(?:upload|submit|send|email|e-mail|take|provide|enter|supply|state|describe|identify|list|include|write|tell(?:\s+us)?|confirm|attest|certify|verify|declare)\b)/gi,' |SECOND| ').split(' |SECOND| ')[0];
  const match=/^(?:(?:fill out|complete) (?:an?|the) (?:online )?form and )?(?:upload|submit|send|email|e-mail|take|provide|photograph)\b[\s\S]*?\b(?:photographs?|photos?|pictures?|images?)\b\s*(?:of|showing)?\s*([\s\S]*)$/i.exec(first);
  return match?photoObjectIssue(match[1]):null;
}
const accompanyingText=/\b(?:send|submit|upload|provide)\b[^.!?]{0,160}\b(?:along with|together with|and include)\s+(?:your |the )?(?:name|address|postcode|postal code|telephone number|phone number)\b/i;
// Dots in an e-mail destination do not end the request for a following value.
const textRequest=quote=>TEXT_CUE.test(quote.replace(/[^\s@<>]+@[^\s@<>]+/g,'destination'))||accompanyingText.test(quote);

// A response instruction is executable only when every response segment and every
// connector/object token is consumed by the supported grammar. This is a bounded
// parser, not a general semantic understanding of the notice.
const PHOTO_VERBS=/^(?:upload|submit|submitting|send|e-?mail|take|provide|photograph|photographing)$/i;
const TEXT_VERBS=/^(?:enter|provide|send|e-?mail|submit|supply|state|describe|identify|list|include|write|tell)$/i;
const CONFIRM_VERBS=/^(?:confirm|attest|certify|verify|declare)$/i;
const PHOTO_PREFIX_WORDS=new Set(`a an the this that these those your its their our one two both any each every all a single clear digital new original marked damaged destroyed recalled provided`.split(/\s+/));
const ACTOR_PREFIX=/^(?:(?:consumers?|customers?|you)\s+(?:(?:(?:are|will be)\s+(?:asked|required)\s+to\s+)|(?:(?:need|have)\s+to\s+)|(?:(?:should|must|shall|may|can|will)\s+))?(?:immediately\s+)?|please\s+)/i;
const FIRM_PREFIX=/^(?:the\s+)?(?:firm|manufacturer|retailer|company)\s+will\s+ask\s+(?:consumers?|customers?|you)\s+to\s+/i;
const TEXT_OBJECT_WORDS=new Set(`a an the this that these those your my its their our one two both
serial serials lot lots order orders purchase purchase's product products item items unit units device devices
number numbers code codes identifier identifiers id ids sku skus batch batches model models tracking
name names address addresses postcode postcodes postal zip zipcode e-mail email phone telephone contact
date dates time times receipt receipts invoice invoices proof purchase purchases amount amounts price prices cost costs quantity quantities size sizes color colour model
description descriptions detail details reason reasons damage damaged condition condition defect defects issue issue
label labels sample samples packaging box boxes carton cartons container containers base bases
original linked affected recalled new used opened sealed full
printed writing written shown showing marked engraved stamped listed
on in at of from for with and or
must be legible
submission claim claims ownership disposed disposal proper has have been was were is are you it they them
belongs this that from linked
first last home shipping billing work notice notices required step steps described mention mentions
photo photograph photographs picture pictures image images`.split(/\s+/));
const CONFIRM_OBJECT_WORDS=new Set(`a an the this that these those your my its their our one two both
submission claim claims ownership disposed disposal proper commitment product products item items unit units device devices
serial serials lot lots order orders purchase purchases number numbers code codes identifier identifiers id ids
has have been was were is are you it they them belongs from linked original affected recalled new used opened sealed
of to in on at for with by and or the
label labels sample samples packaging box boxes carton cartons container containers base bases
provided showing shown printed written marked engraved stamped verified complete completed required step steps described notice notices mention mentions
photo photograph photographs picture pictures image images
disposed disposed_of`.split(/\s+/));
function responseVerb(word){return PHOTO_VERBS.test(word)||TEXT_VERBS.test(word)||CONFIRM_VERBS.test(word);}
const TEXT_VALUE_NOUN=/\b(?:serial|lot|order|tracking|model|batch|sku|item|product)\s+(?:number|numbers|code|codes)|\b(?:name|names|address|addresses|postcode|postcodes|postal|zip|zipcode|phone|telephone|contact|date|dates|receipt|receipts|invoice|invoices|amount|amounts|price|prices|quantity|quantities)\b/i;
function photoTextOutside(segment){
  const photo=/\b(?:photographs?|photos?|pictures?|images?)\b/i.exec(segment);
  if(!photo)return false;
  const before=segment.slice(0,photo.index),after=segment.slice(photo.index+photo[0].length);
  // A written value before a connector is a separate object. Without a
  // connector, "order-number image" is a photo object name, not a TEXT request.
  if(TEXT_VALUE_NOUN.test(before)&&/(?:[;,]|\b(?:and|then|also|plus)\b)/i.test(before))return true;
  if(/\b(?:along with|together with|plus|and include|and provide|and submit)\b[\s\S]*\b(?:name|address|order|serial|lot|code|number|postal|phone|receipt|invoice)\b/i.test(after))return true;
  // "label showing the product name" and "name and address printed on the
  // label" keep those values inside the physical photo object.
  if(/\b(?:showing|displaying|marked\s+with|printed\s+with|with|bearing|(?:printed|written|shown|displayed|visible|marked)\s+(?:on|in))\b/i.test(after))return false;
  return /(?:[,;]|\b(?:and|plus)\b)\s*(?:(?:your|the|a|an|its|their)\s+)?(?:order|serial|lot|name|address|number|code|postal|phone|receipt|invoice|barcode)\b/i.test(after);
}
function photoObjectRequest(segment){
  const photo=/(?:^|\s)(?:photographs?|photos?|pictures?|images?)\b/i.exec(segment);
  if(!photo)return false;
  const before=segment.slice(0,photo.index);
  // A written value is a TEXT request only with a positive written-reference
  // relationship ("lot number shown in the photograph"). A compound photo name
  // such as "order number image" is not such a relationship and stays PHOTO.
  if(!TEXT_VALUE_NOUN.test(before))return true;
  return !/\b(?:shown|printed|visible|displayed|written|readable|legible|appearing)\s+(?:in|on)\b[^.!?]*$/i.test(before);
}
function responseKinds(word,segment){
  let kind;
  if(CONFIRM_VERBS.test(word))kind='CONFIRMATION';
  // These verbs inherently ask for written content even if the wording mentions
  // a photograph as the place where that content appears.
  else if(/^(?:enter|state|describe|identify|list|write|tell)$/i.test(word))kind='TEXT';
  else if(/^(?:include|supply)$/i.test(word))kind=photoObjectRequest(segment)?'PHOTO':'TEXT';
  else if(/^(?:upload|take|submitting|photograph(?:ing)?)$/i.test(word))kind='PHOTO';
  // provide/send/submit/e-mail are ambiguous until the parsed object is known.
  else if(/\b(?:attestations?|confirmations?|certifications?|declarations?)\b/i.test(segment))kind='CONFIRMATION';
  else kind=photoObjectRequest(segment)?'PHOTO':'TEXT';
  return kind==='PHOTO'&&photoTextOutside(segment)?['PHOTO','TEXT']:[kind];
}
function objectTokens(value){return photoObjectTokens(value);}
const TEXT_OBJECT_CORE=new Set(`serial serials lot lots order orders purchase purchases product products item items unit units device devices
number numbers code codes identifier identifiers id ids sku skus batch batches model models tracking
name names address addresses postcode postcodes postal zip zipcode e-mail email phone telephone contact
date dates receipt receipts invoice invoices proof amount amounts price prices cost costs quantity quantities size sizes color colour
description descriptions detail details reason reasons damage damaged condition condition defect defects issue issue
label labels sample samples packaging box boxes carton cartons container containers base bases
submission claim claims ownership disposed disposal commitment notice notices step steps original linked affected recalled new used opened sealed
photo photograph photographs picture pictures image images`.split(/\s+/));
function unsupportedCharacterIssue(value){
  const leftover=String(value).replace(/[A-Za-z0-9\s'’"“”‘.,;:!?()\/&+@\-—–]/g,'');
  return leftover?'The response contains an unsupported character or script. Keep this instruction manual.':null;
}
function closedObjectIssue(kind,object){
  const tokens=objectTokens(object);
  if(!tokens.length)return kind==='TEXT'?'A written response needs a value or description. Keep this instruction manual.':'A confirmation response needs a statement to confirm. Keep this instruction manual.';
  const allowed=kind==='TEXT'?TEXT_OBJECT_WORDS:CONFIRM_OBJECT_WORDS;
  for(const token of tokens){
    if(!allowed.has(token)&&!/^\d+$/.test(token))return 'The response contains an unsupported word in its object. Keep this instruction manual.';
  }
  if(kind==='TEXT'&&![...TEXT_OBJECT_CORE].some(word=>new RegExp(`\\b${word}\\b`,'i').test(object)))return 'A written response needs a supported value or description. Keep this instruction manual.';
  if(kind==='CONFIRMATION'&&![...TEXT_OBJECT_CORE].some(word=>new RegExp(`\\b${word}\\b`,'i').test(object)))return 'A confirmation response needs a supported statement. Keep this instruction manual.';
  if(/[\s,](?:and|or|for|to|of|with|by|from|at|in|on)\s*$/i.test(object.replace(/[.!?;:,]+$/,'').trim()))return 'The response ends with an unconsumed connector. Keep this instruction manual.';
  if(kind==='CONFIRMATION'&&/\bto\b/i.test(object)&&!/\bbelongs\s+to\s+(?:this|the)\s+claim\b/i.test(object))return 'The confirmation uses an unsupported destination or relation. Keep this instruction manual.';
  return null;
}
function responseObjectIssue(kind,segment){
  const characterIssue=unsupportedCharacterIssue(segment);
  if(characterIssue)return characterIssue;
  if(kind==='PHOTO'){
    const match=/(?:^|\s)(?:photographs?|photos?|pictures?|images?)\b\s*(?:of|showing)?\s*([\s\S]*)$/i.exec(segment);
    if(match){
      const prefix=segment.slice(0,match.index);
      for(const token of objectTokens(prefix)){
        if(!PHOTO_PREFIX_WORDS.has(token)&&!/^\d+$/.test(token))return 'The photograph response contains an unsupported object modifier. Keep this instruction manual.';
      }
      return photoObjectIssue(match[1]);
    }
    const verb=/^(?:photograph)\s+([\s\S]+)$/i.exec(segment.trim());
    return verb?photoObjectIssue(verb[1]):'A photograph response needs a supported object. Keep this instruction manual.';
  }
  const object=segment.trim().replace(/^[:\s]+/,'');
  return closedObjectIssue(kind,object);
}
function mandatoryCustomerIssue(quote){
  const parts=quote.split(/[;—–:]|\b(?:and|then|also|but)\b/i);
  return parts.some(part=>/^(?:consumers?|customers?|you)\s+(?:(?:must|shall)(?!\s+not)\b|(?:are|is)\s+required\s+to\b|(?:need|have)\s+to\b|will\s+be\s+asked\s+to\b)/i.test(part.trim()));
}
const PROHIBITION_CONTINUATION=/^(?:do not|must not|should not|never|not required|not necessary|no)\b/i;
const PROHIBITION_OBJECT_START=/^(?:its|their|his|her|the|a|an|this|that|these|those|your|our|all|any|each|every|both|it|them)\b/i;
function prohibitionObjectAllowed(part){
  if(!PROHIBITION_OBJECT_START.test(part))return false;
  const tokens=photoObjectTokens(part);
  return Boolean(tokens.length)&&tokens.every(token=>PHOTO_OBJECT_WORDS.has(token)||/^\d+$/.test(token));
}
const businessSubject=/^(?:the\s+)?(?:manufacturer|retailer|merchant|company|firm|brand|we|it)\b/i;
function positiveBusinessPrefix(value){
  return /^(?:the\s+)?(?:manufacturer|retailer|merchant|company|firm|brand|we|it)(?:\s+(?:will|shall|must|may|can|should|is|are|has|have|also|then|still|now|just|already|even|only|again|soon|later|[a-z]+ly)){1,6}\s*$/i.test(value)
    && !/\b(?:consumers?|customers?|you|please)\b/i.test(value);
}
const businessActionVerb=/^(?:send|sent|provide|provides|issue|issues|email|e-mail)$/i;
const businessConnector=/[;,:—–]|\b(?:and|then|also|but)\b/i;
function firstBusinessAction(beforeText,word){
  if(!businessActionVerb.test(word))return false;
  // The actor must be the subject of the current clause, not merely a business
  // noun in the object ("contact the manufacturer"). Hard connectors start a new
  // clause; "also" remains an adverb until the first business action completes.
  const clause=beforeText.split(/[;,:—–]|\b(?:and|then|but)\b/i).at(-1).trim();
  return positiveBusinessPrefix(clause);
}

function parseResponseGrammar(quote){
  let text=quote.trim().replace(FIRM_PREFIX,'').replace(ACTOR_PREFIX,'').replace(/^please\s+/i,'').replace(/^(?:(?:fill out|complete)\s+(?:an?|the)\s+(?:online\s+)?form\s+and\s+)/i,'');
  // A conditional or preparatory prefix can precede the response. The condition
  // itself stays in sourceInstructionProfile's issues, but it must not hide the
  // response kind from the same parser used for coverage and publication.
  const firstResponseWord=/\b(?:upload|submit|submitting|send|e-?mail|take|provide|photograph|photographing|enter|supply|state|describe|identify|list|include|write|tell|confirm|attest|certify|verify|declare)\b/i.exec(text);
  if(firstResponseWord&&firstResponseWord.index>0){
    const prefix=text.slice(0,firstResponseWord.index).trim();
    if(/^(?:if|when|where|unless|for|only for|before|after|at|once|upon|by)\b/i.test(prefix)||/\b(?:without|who|with|damaged|unreadable|cannot|not|remove|unplug|cut|write)\b/i.test(prefix))text=text.slice(firstResponseWord.index);
  }
  const prohibitionScope=quote.replace(/\((?:not (?:required|necessary)|optional)\)/gi,'');
  const prohibited=/\b(?:do not|must not|should not|not required|not necessary)\b/i.test(prohibitionScope)||/^(?:not|no)\b/i.test(text);
  if(prohibited){
    // A prohibition is information, but a later affirmative response after a
    // separator is still parsed. Do not swallow the rest of the sentence.
    const separator=/[;—–]|:(?=\s)|\b(?:and|then|also|but)\b/i.exec(text);
    if(!separator)return {issue:null,segments:[],consumed:text,remainder:'',customerIssue:false};
    const rest=text.slice(separator.index+separator[0].length).trim();
    if(!rest)return {issue:null,segments:[],consumed:text,remainder:'',customerIssue:false};
    // "..., but a photo is not required" waives the photo, not the preceding
    // written request. Keep the preceding response for canonical classification;
    // the waiver itself remains a manual issue in sourceInstructionProfile.
    if(/^(?:a|the|no)?\s*(?:photo|photograph|picture|image)s?\s+(?:is|are)\s+not\s+(?:required|necessary)\b/i.test(rest)){
      text=text.slice(0,separator.index).trim();
    }else{
    const responseStart=/^(?:upload|submit|submitting|send|e-?mail|take|provide|photograph|photographing|enter|supply|state|describe|identify|list|include|write|tell|confirm|attest|certify|verify|declare)\b/i;
    const tailParts=rest.split(/[;—–]|:(?=\s)|\b(?:and|then|also|but)\b/i).map(part=>part.trim()).filter(Boolean);
    let firstResponse=-1;
    for(const [index,part] of tailParts.entries()){
      if(responseStart.test(part)){firstResponse=index;break;}
      if(PROHIBITION_CONTINUATION.test(part)||prohibitionObjectAllowed(part))continue;
      return {issue:'The instruction after a prohibition is unsupported. Keep this instruction manual.',segments:[],consumed:text.slice(0,separator.index+separator[0].length),remainder:rest,customerIssue:true};
    }
    if(firstResponse<0)return {issue:null,segments:[],consumed:text,remainder:'',customerIssue:false};
    text=rest.slice(rest.indexOf(tailParts[firstResponse]));
    }
  }
  const matches=[...text.matchAll(/\b(?:upload|submit|submitting|send|e-?mail|take|provide|photograph|photographing|enter|supply|state|describe|identify|list|include|write|tell|confirm|attest|certify|verify|declare)\b/gi)];
  const verbs=[];
  for(const match of matches){
    const word=match[0].toLowerCase();
    const before=text.slice(0,match.index).trim().split(/\s+/).at(-1)||'';
    if(!responseVerb(word))continue;
    // The photograph noun can follow any supported modifier ('one clear photograph',
    // 'a digital photograph'), not only a determiner. A verb position still starts
    // a new response segment.
    if(word==='photograph'&&(PHOTO_PREFIX_WORDS.has(before.toLowerCase())||/^\d+$/.test(before)))continue;
    const beforeText=text.slice(0,match.index),afterText=text.slice(match.index+match[0].length).trim();
    // A positive business subject with no customer actor is a notification
    // context. Do not enumerate adverbs; the subject and absence of a customer
    // actor are the boundary. Notification verbs are skipped, while later
    // customer instructions keep their own verb and remain parseable.
    if(firstBusinessAction(beforeText,word))continue;
    // "Take six weeks" and "take 4-6 weeks" are timing narrative. A non-duration
    // "take the product to the store" remains a customer handoff and is manual.
    if(word==='take'&&!/^(?:(?:a|an|the|your|one|two|three|both|any|each|clear|digital|new|original|marked|damaged|destroyed|recalled|provided)\s+)*(?:photograph|photo|picture|image)s?\b/i.test(afterText)){
      const duration=/^(?:(?:about|approximately|around|up to|as long as|another|a further|\d+(?:\s*[-–—]\s*\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|four\s+to\s+six)\s+)*(?:business\s+)?(?:hours?|days?|weeks?|months?|years?)\b/i.test(afterText);
      if(duration)continue;
    }
    if(word==='email'||word==='e-mail'){
      if(/^(?:receipt|receipts|invoice|invoices|confirmation|confirmations|message|messages)\b/i.test(afterText))continue;
      if(/\bby\s*$/i.test(beforeText)||/\b(?:receive|receives|received|receiving)\s+(?:an?|the|your)?\s*$/i.test(beforeText)||/(?:\b(?:a|an|the|your|confirmation|receipt|invoice|message)\s*)$/i.test(beforeText))continue;
    }
    verbs.push({...match,word});
  }
  if(!verbs.length)return {issue:null,segments:[],consumed:text,remainder:'',customerIssue:false};
  const prefix=text.slice(0,verbs[0].index).trim();
  if(prefix&&!/^(?:(?:and|then|also|please)\s*)+$/i.test(prefix)){
    // A parser error is customer-facing unless the prefix is positively a known
    // business/no-action narrative. Absence of "you/consumer" is not evidence of
    // non-customer context: an unknown prefix is ambiguous and fails closed.
    const knownBusiness=positiveBusinessPrefix(prefix);
    // A business notification followed by an explicit customer instruction is
    // still a customer response. Strip the narrative lead and parse the later
    // instruction; a business notification alone remains non-customer.
    const laterCustomer=/(?:\b(?:and|then|also|but)\b|[,;])\s*(?:then\s+)?(?:consumers?|customers?|you|please)\s+(?:(?:must|should|shall|may|can|will|need|have)\s*)?$/i.test(prefix);
    if(laterCustomer){
      const offset=verbs[0].index;text=text.slice(offset);
      for(const verb of verbs)verb.index-=offset;
    }else return {issue:'The instruction begins with an unsupported phrase. Keep this instruction manual.',segments:[],consumed:'',remainder:text,customerIssue:!knownBusiness};
  }
  const allKinds=new Set();
  for(let i=0;i<verbs.length;i++){
    const start=verbs[i].index+verbs[i][0].length,end=verbs[i+1]?.index??text.length;
    let segment=text.slice(start,end).replace(/[\s,;:—–-]*(?:(?:and|then|also)\s*)?$/i,'').trim();
    if(verbs[i].word==='tell')segment=segment.replace(/^us\s+/i,'');
    for(const kind of responseKinds(verbs[i].word,segment))allKinds.add(kind);
  }
  const segments=[];
  for(let i=0;i<verbs.length;i++){
    const start=verbs[i].index+verbs[i][0].length;
    const end=verbs[i+1]?.index??text.length;
    let segment=text.slice(start,end).replace(/[\s,;:—–-]*(?:(?:and|then|also)\s*)?$/i,'').trim();
    if(verbs[i].word==='tell')segment=segment.replace(/^us\s+/i,'');
    const kinds=responseKinds(verbs[i].word,segment);
    const issue=responseObjectIssue(kinds[0],segment);
    if(issue)return {issue,segments,consumed:text.slice(0,start),remainder:text.slice(start),kinds:[...allKinds],customerIssue:true};
    segments.push({kind:kinds[0],kinds,text:segment});
  }
  return {issue:null,segments,consumed:text,remainder:'',kinds:[...allKinds],customerIssue:false};
}

// One response-classification source for drafting, coverage and publication.
// If the bounded parser cannot consume a required segment, the issue is retained
// and the whole instruction remains manual; a kind is never inferred by a
// different regex in a later layer.
function parsedKinds(parser){
  const found=new Set((parser.kinds||[]).filter(kind=>KINDS.includes(kind)));
  for(const segment of parser.segments)for(const kind of segment.kinds||[segment.kind])if(KINDS.includes(kind))found.add(kind);
  return KINDS.filter(kind=>found.has(kind));
}
function nominalKinds(quote){
  const waived=/\b(?:no|not)\s+(?:a\s+|an\s+|the\s+)?(?:photo|photograph|picture|image)s?\b|\b(?:photo|photograph|picture|image)s?\b[^.!?]{0,30}\b(?:is|are)\s+not\s+(?:required|necessary)\b/i.test(quote);
  const kinds=[];
  if(!waived&&/\b(?:photo|photograph|picture|image)s?\b[^.!?]{0,80}\b(?:is|are)\s+(?:required|requested|needed)\b/i.test(quote))kinds.push('PHOTO');
  const mandatoryConfirmation=quote.split(/[;,]|\b(?:but|and|then|also)\b/i).some(part=>{
    if(!/\b(?:attestations?|confirmations?|certifications?|declarations?)\b[^.!?]{0,80}\b(?:is|are)\s+(?:required|requested|needed)\b/i.test(part))return false;
    if(/\b(?:confirmation|confirmations)\s+e-?mail\b/i.test(part))return false;
    return !/\b(?:no|not)\s+(?:a\s+|an\s+|the\s+)?(?:attestations?|confirmations?|certifications?|declarations?)\b|\b(?:attestations?|confirmations?|certifications?|declarations?)\b[^.!?]{0,30}\b(?:is|are)\s+not\s+(?:required|necessary)\b/i.test(part);
  });
  if(mandatoryConfirmation)kinds.push('CONFIRMATION');
  return kinds;
}
function canonicalKinds(quote){
  const parser=parseResponseGrammar(quote);
  const found=new Set([...parsedKinds(parser),...nominalKinds(quote)]);
  return KINDS.filter(kind=>found.has(kind));
}
export function canonicalResponseKinds(quote){
  return canonicalKinds(quote);
}

// A business notification can be followed by a genuine customer instruction.
// Keep the latter available for field selection and manual review rather than
// treating the whole sentence as business-only.
function hasLaterCustomerInstruction(quote){
  return /\b(?:and|then|also|but|[,;])\s*(?:then\s+)?(?:consumers?|customers?|you)\b[^.!?]{0,160}\b(?:upload|submit|send|provide|enter|supply|state|describe|identify|list|include|write|tell|confirm|attest|certify|verify|declare)\b/i.test(quote);
}

// Applies to assistant output only. The notice may legitimately contain disposal
// attestations, URLs, e-mail destinations or contact text; those are not rejected
// by keyword. A field fails only when its declared response type does not match
// what the quoted instruction actually asks the customer to do.
export function aiFieldProblem({kind,quote}){
  // Scope response typing to the relevant part of a mixed sentence. The full
  // quotation remains attached, and publication keeps mixed waivers manual.
  const typedQuote=quote.replace(/\((?:not (?:required|necessary)|optional)\)/gi,'');
  const parts=typedQuote.split(/;|\bbut\b/i);
  const relevant=parts.filter(part=>kind==='PHOTO'?PHOTO_CUE.test(part):kind==='TEXT'?textRequest(part):CONFIRM_CUE.test(part));
  const candidate=relevant.length?relevant.join('; '):typedQuote;
  const responseQuote=((kind==='TEXT'&&textRequest(candidate))||(kind==='CONFIRMATION'&&CONFIRM_CUE.test(candidate)))?candidate.replace(/\b(?:a |an |the )?(?:photo|photograph|picture|image)s?\s+(?:is|are)\s+not (?:required|necessary)\b|\bno (?:photo|photograph|picture|image)s? (?:is|are) (?:required|necessary)\b/gi,''):candidate;
  if(!hasLaterCustomerInstruction(quote)&&/\b(?:do not|must not|not required|not necessary|no (?:photo|photograph|confirmation)|confirmation e-?mail)\b/i.test(responseQuote))return 'This sentence may prohibit information or describe a notification, rather than request customer evidence. Review it manually.';
  const explicitPhoto=/\b(?:upload|submit|send|e-?mail|take|provide)\b/i.test(quote)||/(?:^|[;,:]\s*|\b(?:consumers?|customers?|you)\s+(?:(?:should|must|shall|may|can)\s+|(?:will be|are)\s+asked to\s+|need to\s+)?)photograph\s+/i.test(quote)||/\b(?:photo|photograph|picture|image)s?\b[^.!?]{0,80}\b(?:is|are)\s+(?:required|requested|needed)\b/i.test(quote);
  if(kind==='PHOTO'&&!explicitPhoto&&/\b(?:the )?(?:manufacturer|retailer|merchant|company|firm)\s+(?:receives?|has received|received)\b[^.!?]{0,120}\b(?:photo|photograph|image|proof|evidence)\b/i.test(quote)&&/\b(?:consumers?|customers?|you)\s+(?:will|may|can|should)\s+receive\b/i.test(quote))return 'Business receipt of evidence and a later refund do not request another customer response.';
  const businessAction=/\b(?:the )?(?:manufacturer|retailer|merchant|company|firm|we)\s+(?:will|shall|must|may|can)\s+(?:confirm|verify|provide|send|issue|take|supply)\b/i.test(quote);
  if(businessAction&&!hasLaterCustomerInstruction(quote))return 'This sentence describes an action by the business. Review the responsible actor before creating a customer field.';
  if(kind==='CONFIRMATION'&&/\b(?:you|consumers?|customers?)\s+(?:will|may|should|can)\s+(?:be sent|receive)\b/i.test(quote))return 'Receiving a confirmation is not a customer attestation request.';
  const parser=parseResponseGrammar(quote);
  if(!canonicalKinds(quote).includes(kind)){
    if(kind==='TEXT')return 'A written field needs an explicit request for a value, identifier or description, not a photograph.';
    if(parser.issue)return parser.issue;
    if(kind==='PHOTO')return 'A photograph field needs a request for a photograph or image.';
    return 'A confirmation field needs an explicit confirm, attest, certify, verify or declare request, including its noun form.';
  }
  // Writing a marking or a code physically onto the product is a preparation
  // step, not a separate TEXT response. A genuine written value remains valid.
  if(kind==='TEXT'&&/\bwrite\b/i.test(quote)&&!TEXT_CUE.test(quote)&&!TEXT_VALUE_NOUN.test(quote))
    return 'A written field needs a value, identifier or description request; this wording describes a physical marking or preparation step.';
  // The kind is canonical. Any parser issue remains attached to the sentence and
  // blocks publication/field acceptance later; it must not reject a field that
  // correctly represents one recognized response in a mixed instruction.
  return null;
}

const RESPONSE_VERB_SOURCE='(?:upload|submit|submitting|send|e-?mail|take|provide|photograph|photographing|enter|supply|state|describe|identify|list|include|write|tell(?:\\s+us)?|confirm|attest|certify|verify|declare)';
function responseClauseParts(quote){
  const separator=new RegExp(`(\\s*[;:—–]\\s*|\\s+(?:and|then|also)\\s+)(?=${RESPONSE_VERB_SOURCE}\\b)`,'gi');
  return quote.split(separator).filter((part,index)=>index%2===0&&part.trim()).map(part=>part.trim());
}
function sameResponseQuote(left,right){
  const clean=value=>normalize(value).replace(/[;:—–,]+$/,'').trim();
  return clean(left)===clean(right);
}
function fieldLinksClause(field,clause){
  if(normalize(field.quote).includes(normalize(clause.quote)))return true;
  return responseClauseParts(clause.quote).some(part=>sameResponseQuote(part,field.quote));
}

const normalize=s=>s.replace(/\s+/g,' ').trim();
// Every remedy sentence remains visible, including sentences the model omits.
export function sourceClauses(source){
  return source.remedies.flatMap((text,p)=>sentenceSpans(text).map((span,i)=>({id:`clause-${p}-${i}`,quote:text.slice(span.start,span.end).trim()})));
}
export const SOURCE_POLICY_VERSION=9;
// A bounded executable subset, not a general natural-language policy engine.
// A destination matters only when the customer is being asked to send something
// out. Business notifications and the noun "email" are not customer submissions.
function customerOutgoingDestination(quote){
  const clauses=String(quote).split(/(?:[;—–]|:(?=\s)|\b(?:and|then|also|but)\b)/i);
  const verbs=/\b(?:send|sent|submit(?:ted)?|upload(?:ed)?|provide[ds]?|e-?mail)\b/gi;
  for(const clause of clauses){
    for(const match of clause.matchAll(verbs)){
      const word=match[0].toLowerCase();
      const after=clause.slice(match.index+match[0].length);
      if(word.startsWith('e-mail')||word==='email'){
        if(!/^\s+(?:a|an|the|your|this|these|those|photograph|photo|image|picture|label|serial|lot|code|number|document|evidence)\b/i.test(after))continue;
      }
      const before=clause.slice(0,match.index);
      const subject=(before.match(/\b(?:you|consumers?|customers?|manufacturer|retailer|company|firm|brand|we|it)\b/gi)||[]).at(-1)?.toLowerCase();
      if(subject&&/^(?:manufacturer|retailer|company|firm|brand|we|it)$/.test(subject))continue;
      const passive=/\b(?:(?:must|should|shall|are|is|will|can)\s+be|(?:is|are|was|were|will\s+be|can\s+be)\s+required\s+to\s+be|required\s+to\s+be)\s*$/i.test(before);
      const passiveIncoming=word==='sent'&&/^\s*(?:you|consumers?|customers?)\b/i.test(before)&&/\b(?:will|shall|must|should|are|is)\s+be\s*$/i.test(before)&&/^\s+(?:a|an|the|your)?\s*(?:confirmation|receipt|invoice|notice|message|label)s?\b/i.test(after);
      if(passiveIncoming)continue;
      const imperative=/^\s*(?:please\s+)?(?:send|submit|upload|provide|e-?mail)\b/i.test(clause);
      if(!subject&&!passive&&!imperative)continue;
      if(/\b(?:by|via|through|using)\s+(?:e-?mail|email|(?:the\s+)?(?:manufacturer|retailer|company|firm|brand)?\s*(?:portal|web ?site|registration page|online form))\b/i.test(after)||/\bto\s+[^\s@]+@[^\s@]+/i.test(after)||/\b(?:by|via)\s+e-?mail(?:ing)?\s+[^\s@]+@[^\s@]+/i.test(after))return true;
    }
  }
  return false;
}
// Drafts may retain richer quotations for review; only direct, unconditional,
// pre-refund customer responses with one photo can become an executable form.
export function sourceInstructionProfile(quote){
  const parser=parseResponseGrammar(quote);
  const kinds=canonicalKinds(quote);
  const issues=[];
  const direct=/^(?:(?:consumers?|customers?|you)\s+(?:(?:should|must|shall)\s+|(?:will be|are)\s+asked to\s+|need to\s+)|(?:the )?(?:firm|manufacturer|retailer|company) will ask (?:consumers?|customers?|you) to\s+)?(?:(?:fill out|complete) (?:an?|the) (?:online )?form and )?(?:upload|submit|send|email|e-mail|take|provide|enter|supply|state|describe|identify|list|include|write|tell|confirm|attest|certify|verify|declare)\b/i;
  const conditional=hasSourceCondition(quote);
  // These customer handoffs are not performed by this portal. Merely collecting
  // a photograph cannot establish a physical return, registration or inbox reply.
  // Negative advice does not itself ask the customer to perform a handoff.
  const instruction=quote.trim().replace(/^(?:consumers?|customers?|you)\s+(?:(?:(?:are|will be)\s+(?:asked|required)\s+to\s+)|(?:(?:need|have)\s+to\s+)|(?:(?:should|must|shall|may|can|will)\s+))?(?:immediately\s+)?/i,'');
  const negative=/\b(?:do not|must not|should not|not required|not necessary|no (?:photo|photograph|confirmation))\b/i.test(quote);
  const affirmative=/^(?:please\s+)?(?:stop using|unplug|remove|destroy|cut|write|fill out|complete|return|ship|mail|contact|register|reply|e-?mail|send|submit|upload|provide|sign in|log in)\b/i.test(instruction);
  // Receiving a label/confirmation, or being told an action is not required,
  // is information rather than an affirmative instruction to perform a handoff.
  const actionStart='(?:^(?:please\\s+)?|(?:[,;:—–]\\s*|\\b(?:and|then|also)\\s+))';
  const handoffPatterns=[
    new RegExp(actionStart+'(?:return|ship|mail)\\s+(?:(?:back|immediately|promptly|directly)\\s+){0,2}(?:the|your|this|these|those|a|an|all|any|each|every|recalled|affected|it|them|products?|items?|units?|devices?|garments?|to)\\b','i'),
    new RegExp(actionStart+'contact\\b[^.!?]{0,160}\\b(?:refund|remedy)\\b','i'),
    new RegExp(actionStart+'(?:register|sign in|log in|(?:fill out|complete) (?:an?|the) (?:online )?registration form)\\b','i'),
    new RegExp(actionStart+'reply\\b[^.!?]{0,160}\\b(?:e-?mail|confirmation)\\b','i'),
    new RegExp(actionStart+'e-?mail\\b(?!\\s+(?:receipt|receipts|invoice|invoices|confirmation|confirmations|message|messages)\\b)','i'),
  ];
  // The executable subset has a positive response shape. A second action after
  // the response is not automatically a response: returns, registration, email
  // and similar handoffs make the whole instruction manual.
  const nonResponseVerb=/^(?:(?:please|also|then)\s+)?(?:return|ship|mail|contact|register|sign in|log in|reply|e-?mail)\b/i;
  const residualParts=quote.split(/(?:;|:|—|–|\band\b|\bthen\b|\balso\b)/i).slice(1).map(part=>part.trim()).filter(Boolean);
  const secondHandoff=residualParts.some(part=>nonResponseVerb.test(part)&&!/^(?:return\s+(?:address(?:es)?|label(?:s)?|polic(?:y|ies)|instruction(?:s)?|period(?:s)?|window(?:s)?|shipping)|e-?mail\s+(?:receipt(?:s)?|invoice(?:s)?|confirmation(?:s)?|message(?:s)?))\b/i.test(part));
  // A response verb does not excuse an unconsumed object, connector,
  // prerequisite or cutoff; parser issues stay manual below.
  const outgoingVerb='(?:send|submit|upload|provide|e-?mail)';
  const externalDestination=!negative&&customerOutgoingDestination(quote);
  const prerequisite=/\b(?:after|once|upon|following)\b[^.!?]{0,100}\b(?:return(?:ing|ed)?|send(?:ing)? back|ship(?:ping)? back|hav(?:e|ing) (?:returned|shipped|sent))\b/i.test(quote);
  const applicability=/\b(?:for|only for)\s+(?:purchases?|products?|items?|orders?)\s+(?:made|purchased|bought|placed|ordered)\b|\b(?:orders?|purchases?|products?|items?)\s+(?:placed|made|purchased|bought|ordered)\s+(?:before|after|on|by)\b|\b(?:except|excluding|other than)\b/i.test(quote);
  // A remedy narrative can carry a cutoff without asking for customer evidence.
  // INFORMATION may explain that sentence, but it cannot make the cutoff safe.
  const remedyConstraint=/\b(?:refunds?|reimbursements?|payments?|remedy|remedies|replacements?|eligibility|qualify|qualifies)\b[^.!?]{0,140}\b(?:after|before|once|upon|only for|only to|for\s+(?:orders?|purchases?)\s+(?:made|purchased|bought|placed|ordered|from|through|at|with|in|on|by|only|exclusively)|placed|purchased|bought|ordered|except|excluding|other than)\b/i.test(quote);
  const externalAction=(affirmative&&(handoffPatterns.some(pattern=>pattern.test(instruction))||externalDependencies({remedies:[quote]}).length>0||secondHandoff))||externalDestination||externalActionParts(quote).slice(1).some(part=>externalDependencies({remedies:[part]}).length>0);
  if(kinds.length&&/\b(?:do not|must not|not required|not necessary|optional)\b/i.test(quote))issues.push('Mixed optional or prohibited responses need a manual workflow; this form cannot make a waived response mandatory.');
  if(parser.issue)issues.push(parser.issue);
  if(mandatoryCustomerIssue(quote)&&(!parser.segments.length||parser.issue||parser.remainder))issues.push('An unrecognized mandatory customer instruction must be handled manually; the parser could not consume it.');
  if(externalAction)issues.push('An external customer handoff needs a manual workflow; this portal does not complete returns, manufacturer contact, registration or email submission.');
  if(externalDestination)issues.push('Submitting evidence outside this portal needs a manual workflow; this form cannot deliver an email or third-party portal response.');
  if(prerequisite)issues.push('A return or other prerequisite needs a manual workflow; this form cannot establish that an outside action happened first.');
  if(applicability||remedyConstraint)issues.push('Purchase eligibility, date cutoffs and exceptions need a manual workflow; this form cannot establish who or what qualifies.');
  if(!direct.test(quote.trim())||conditional)issues.push('Conditional or indirect instructions need a manual workflow; this form supports only direct unconditional customer responses.');
  if(/\b(?:(?:after|following|once|on|upon)\b[^.!?]{0,100}\b(?:refund|reimbursement|payment)|(?:refund|reimbursement|payment)\b[^.!?]{0,60}\b(?:received|arrives|issued|paid))\b/i.test(quote))issues.push('Post-refund timing needs a manual workflow; this form collects evidence before refund review.');
  const photoCount=[...quote.matchAll(/\b(?:photos?|photographs?|pictures?|images?)\b/gi)].length===1&&!/\b(?:photos|photographs|pictures|images)\b|\b(?:two|three|four|multiple|separate|distinct|several|[2-9]|[1-9][0-9]+)\s+(?:(?:distinct|separate|required)\s+)?(?:photo|photograph|picture|image)\b|\b(?:both|each|every|all)\s+(?:sides?|views?|angles?)\b/i.test(quote)?1:null;
  if(kinds.includes('PHOTO')&&photoCount!==1)issues.push('The required photograph count is multiple or unclear. This form supports exactly one photograph; keep this instruction manual.');
  return {actor:'CUSTOMER',conditional,externalAction,applicability:issues.some(i=>i.startsWith('Conditional'))?'UNSUPPORTED':'UNCONDITIONAL',purchaseApplicability:applicability,parserIssue:parser.issue,parser,phase:issues.some(i=>i.startsWith('Post-refund'))?'UNSUPPORTED':'BEFORE_REFUND',photoCount,kinds,issues};
}
export function sourceFieldIssue(field){
  const problem=aiFieldProblem(field);if(problem)return problem;
  if(sentenceSpans(field.quote).length!==1)return 'One field must quote one complete source sentence. Separate sentences need their own response obligations.';
  const profile=sourceInstructionProfile(field.quote);
  return profile.issues.find(issue=>issue.startsWith('Conditional'))||profile.issues[0]||null;
}
export function sourceCoverage(source,fields,decisions=[]){
  return sourceClauses(source).map(clause=>{
    const profile=sourceInstructionProfile(clause.quote);
    const linked=fields.filter(f=>fieldLinksClause(f,clause));
    const obligations=profile.kinds.map(kind=>({id:`${clause.id}-${kind}`,kind,actor:profile.actor,applicability:profile.applicability,phase:profile.phase,evidenceCount:kind==='PHOTO'?profile.photoCount:null,fieldIds:linked.filter(f=>f.kind===kind).map(f=>f.id)}));
    const missing=obligations.filter(o=>!o.fieldIds.length).map(o=>o.kind);
    const decision=decisions.find(d=>d.id===clause.id);
    const phaseIssue=profile.issues.find(i=>i.startsWith('Post-refund'));
    // Eligibility, timing and destination constraints survive even when the
    // sentence requests no customer response. An INFORMATION decision explains
    // the narrative; it cannot waive an unsupported cutoff or handoff.
    const parserIssue=profile.parser?.customerIssue?profile.parser.issue:null;
    const nonWaivableIssue=parserIssue||profile.issues.find(i=>/^(?:Purchase eligibility|Residual timing|Post-refund|An external customer handoff|Submitting evidence outside|A return or other prerequisite|An unrecognized mandatory customer instruction|The instruction after a prohibition)/.test(i));
    const conditionalIssue=profile.issues.find(i=>i.startsWith('Conditional'));
    const issue=phaseIssue||nonWaivableIssue||((profile.conditional||profile.externalAction)?(conditionalIssue||profile.issues[0]):null)||(profile.kinds.length?profile.issues[0]||linked.map(sourceFieldIssue).find(Boolean)||null:null);
    // A merchant's explicit MANUAL decision dominates any derived FIELD result.
    // It is a veto, not a note attached to an executable obligation. INFORMATION
    // is never allowed to waive a detected, still-missing customer response.
    let disposition,reason;
    if(decision?.disposition==='MANUAL'){
      disposition='MANUAL';reason=decision.reason;
    }else if(issue){
      disposition='MANUAL';reason=issue;
    }else if(obligations.length){
      if(missing.length){
        disposition='UNRESOLVED';
        reason=`Missing response: ${missing.join(', ')}.${decision?.disposition==='INFORMATION'?' Information cannot waive a required customer response.':''}`;
      }else{
        disposition='FIELD';reason='';
      }
    }else if(linked.length){
      disposition='MANUAL';reason='Selected field does not establish a supported customer response.';
    }else{
      disposition=decision?.disposition||'UNRESOLVED';reason=decision?.reason||'';
    }
    return {...clause,fieldIds:linked.map(f=>f.id),obligations,missingKinds:missing,issue,disposition,reason};
  });
}
export function assertExecutableSource(source,fields,decisions=[]){
  if(externalDependencies(source).some(d=>d.status==='UNRESOLVED'))throw new Error('Review every source obligation: referenced external instructions need a reviewed public-text snapshot before publication. Their contents have not been ingested.');
  const issue=fields.map(sourceFieldIssue).find(Boolean);if(issue)throw new Error(issue);
  const coverage=sourceCoverage(source,fields,decisions);
  if(coverage.some(c=>['UNRESOLVED','MANUAL'].includes(c.disposition)))throw new Error('Review every source obligation before publishing. Missing responses and manual steps cannot publish a connected form.');
  if(fields.filter(f=>f.kind==='PHOTO').length!==1)throw new Error('This version supports exactly one required photograph and additional confirmations or text fields. Keep other evidence workflows manual.');
  return coverage;
}
export function assertExecutableCampaign(policy){
  if(!policy.sourceDigest)return; // Server-authored fictional fixtures; imported public notices carry a digest.
  if(policy.sourcePolicyVersion!==SOURCE_POLICY_VERSION||!Array.isArray(policy.sourceRemedies))throw new Error('Review and republish the source instructions under the current policy before starting or binding another purchase. Existing claims keep their saved instructions.');
  assertExecutableSource({remedies:policy.sourceRemedies,rootRemedies:policy.sourceRootRemedies,externalSnapshots:policy.sourceExternalSnapshots},policy.fields||[],policy.coverage||[]);
}
// Assistant quotations must cover a complete source sentence, or a contiguous run
// of complete sentences. A shorter fragment is expanded to the one complete
// sentence that contains it, so conditions and destinations survive; an ambiguous
// or cross-sentence fragment is returned with a manual-guidance problem.
export function completeSourceQuote(quote,source){
  const target=normalize(quote);
  for(const remedy of source.remedies){
    const spans=sentenceSpans(remedy);
    for(let first=0;first<spans.length;first++)for(let last=first;last<spans.length;last++){
      if(normalize(remedy.slice(spans[first].start,spans[last].end))===target)return {quote:quote.trim()};
    }
  }
  const candidates=[];
  for(const remedy of source.remedies){
    for(const span of sentenceSpans(remedy)){
      const text=remedy.slice(span.start,span.end).trim();
      if(normalize(text).includes(target))candidates.push(text);
    }
  }
  const unique=[...new Set(candidates.map(normalize))];
  if(unique.length===1)return {quote:candidates.find(text=>normalize(text)===unique[0])};
  return {problem:'The quotation does not belong to one complete source sentence. Select the complete sentence with its conditions, or add it manually.'};
}
// Structural checks only, for a merchant's own exact-source selection. Manual
// choices are not restricted by the assistant's response-type rules.
export function validateManualField({kind,quote},source){
  if(!KINDS.includes(kind)||typeof quote!=='string'||quote.trim().length<12||quote.length>1600||!source.remedies.some(x=>x.includes(quote)))
    throw new Error('A proposed field lacks an exact source quotation. No field was saved.');
  const complete=completeSourceQuote(quote,source);
  if(complete.problem||complete.quote.length>1600)throw new Error('Select one complete source sentence with all its conditions.');
  return {kind,quote:complete.quote,sourceUrl:source.externalSnapshots?.find(s=>s.text.includes(complete.quote))?.url||source.sourceUrl};
}

export function validateSourceSuggestion(raw,source){
  if(typeof raw!=='string'||raw.length>18000)throw new Error('The assistant did not return a usable draft. Review the source manually.');
  const value=parseJSON(raw);
  if(!value||Array.isArray(value)||Object.keys(value).join()!=='requirements'||!Array.isArray(value.requirements)||value.requirements.length>6)throw new Error('Unexpected draft fields. No suggestion was saved.');
  const seen=new Set(),requirements=[],filtered=[];
  for(const r of value.requirements){
    if(!r||Object.keys(r).sort().join()!=='kind,quote'||!KINDS.includes(r.kind)||typeof r.quote!=='string'||r.quote.trim().length<12||r.quote.length>1600||!source.remedies.some(x=>x.includes(r.quote)))
      throw new Error('A proposed field lacks an exact source quotation. No suggestion was saved.');
    const complete=completeSourceQuote(r.quote,source);
    if(complete.problem||complete.quote.length>1600){filtered.push({kind:r.kind,quote:r.quote,reason:complete.problem||'The complete source instruction is too long for one field.'});continue;}
    const quote=complete.quote;
    const problem=aiFieldProblem({kind:r.kind,quote});
    if(problem){filtered.push({kind:r.kind,quote:r.quote,reason:problem});continue;}
    const key=`${r.kind}\u0000${quote}`;
    if(seen.has(key)){filtered.push({kind:r.kind,quote:r.quote,reason:'Duplicate response for this quotation; the first valid response was kept.'});continue;}
    seen.add(key);
    requirements.push({id:`field-${requirements.length+1}`,kind:r.kind,quote,sourceUrl:source.externalSnapshots?.find(s=>s.text.includes(quote))?.url||source.sourceUrl});
  }
  return {requirements,filtered,sourceDigest:source.sourceDigest,paymentAuthorized:false,evidenceVerified:false};
}
