// One place derives a setup's campaign identity and its publication presentation.
// The active campaign reported by the server is authoritative; a setup's own
// publishedCampaign record is history and can never by itself make a setup look
// currently published. The campaign id is built from the recall number and the
// current reviewed digest, so it does not identify the test product: the active
// scenario's SKU and lot must match as well.
export function campaignIdFor(recallNumber,digest){return `CPSC-${recallNumber}-${digest.slice(0,12)}`;}
export function setupCampaignId(row){return row?.review?campaignIdFor(row.source.recallNumber,row.review.digest):null;}
export function publicationState(row,active,{sku,lot}={}){
  if(!row?.review)return {code:'NOT_REVIEWED',active:false,publishedBefore:false,sameFields:false,campaignId:null};
  const campaignId=setupCampaignId(row);
  const sameFields=!!active&&active.id===campaignId;
  const activeNow=sameFields&&active.sku===sku&&active.lot===lot;
  const publishedBefore=!!row.publishedCampaign;
  return {code:activeNow?'ACTIVE':publishedBefore?'PUBLISHED_EARLIER':'NOT_PUBLISHED',active:activeNow,publishedBefore,sameFields,campaignId};
}
export function activeScenarioLabel(active){return active?`${active.product||active.title} · ${active.sku} · ${active.lot}`:null;}
// Publishing replaces the section that held the control the merchant used, so the interface has to
// move focus somewhere stable instead of leaving it on the document. Nothing else moves focus.
export function focusAfterPublication(action,publication){
  return action==='source-activate'&&publication?.active===true?'PUBLISHED_HEADING':null;
}
// Historical wording: it must never read as a present-tense success.
export function publicationNotice(publication,active){
  const label=activeScenarioLabel(active);
  if(!active)return publication.code==='PUBLISHED_EARLIER'?'This setup was published earlier. No sandbox scenario is active now, so future purchases cannot be created until a scenario is published again.':'No sandbox scenario is active yet.';
  if(publication.sameFields)return `These saved instructions are active for a different test product (active now: ${label}). Publishing with the identifiers above replaces the active test product for future purchases; existing claims keep the version they were created under.`;
  if(publication.code==='PUBLISHED_EARLIER')return `This setup was published earlier, but it is not the active sandbox scenario. Active now: ${label}. Publishing it again makes it the active scenario for future test purchases; existing claims keep the version they were created under.`;
  return `Active sandbox scenario: ${label}. Publishing this setup replaces it for future test purchases; existing claims keep the version they were created under.`;
}
