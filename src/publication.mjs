import {trackFocusNavigation} from './focus-guard.mjs';

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
// Keep this request alive through the React commit that removes the publish control.
// A temporary return to body does not erase deliberate navigation during either request.
export function beginPublicationFocus(trigger,setupId){
  const navigation=trackFocusNavigation(trigger);
  if(!navigation)return null;
  let cancelled=false;
  const cancel=()=>{cancelled=true;navigation.stop();};
  return {cancel,finish({setupId:displayedSetupId,publication,heading}){
    const lost=navigation.lost();
    const restore=!cancelled&&!navigation.navigated()&&lost&&!trigger.isConnected&&displayedSetupId===setupId&&publication?.active===true&&heading?.isConnected&&navigation.doc.visibilityState!=='hidden';
    cancel();
    if(restore)heading.focus();
    return !!restore;
  }};
}
// Historical wording: it must never read as a present-tense success.
export function publicationNotice(publication,active){
  const label=activeScenarioLabel(active);
  if(!active)return publication.code==='PUBLISHED_EARLIER'?'This setup was published earlier. No sandbox scenario is active now, so future purchases cannot be created until a scenario is published again.':'No sandbox scenario is active yet.';
  if(publication.sameFields)return `These saved instructions are active for a different test product (active now: ${label}). Publishing with the identifiers above replaces the active test product for future purchases; existing claims keep the version they were created under.`;
  if(publication.code==='PUBLISHED_EARLIER')return `This setup was published earlier, but it is not the active sandbox scenario. Active now: ${label}. Publishing it again makes it the active scenario for future test purchases; existing claims keep the version they were created under.`;
  return `Active sandbox scenario: ${label}. Publishing this setup replaces it for future test purchases; existing claims keep the version they were created under.`;
}
