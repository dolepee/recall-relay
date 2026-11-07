import {caseFingerprint} from './advisory-panel.jsx';
// Shared by the Studio tool and narrow-screen ordinary controls. A claim can
// change without its evidence revision changing (review/payment/source changes).
export async function readClaimAnswer(question,getCase,signal){
  const item=getCase(),fingerprint=caseFingerprint(item);
  const response=await fetch('/api/merchant/claim-question',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,...(item?{caseId:item.id,revision:item.revision}:{})}),signal});
  const value=await response.json();if(!response.ok)throw new Error(value.error||'The guide is unavailable.');
  if(caseFingerprint(getCase())!==fingerprint)throw new Error('The selected claim changed while answering. Ask again for the current claim.');
  if(value.readOnly!==true||typeof value.message!=='string'||!Array.isArray(value.citations))throw new Error('The guide did not return cited records.');
  if(item&&(!value.selected||value.selected.caseId!==item.id||value.selected.revision!==item.revision))throw new Error('The answer is for a different case revision. Refresh and ask again.');
  return value;
}
