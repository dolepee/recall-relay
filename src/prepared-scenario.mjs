import {createHash} from 'node:crypto';
// Complete merchant-authored test notice, never a CPSC record or a real recall.
export const exampleNotice = Object.freeze({
 id:'EXAMPLE-RH-1', version:1,
 title:'Relay Home cup · fictional merchant test notice',
 description:'Fictional Relay Home cups with test SKU RH-CUP and lot LOT-A are included. The Relay Home tray is excluded. This example is for software evaluation only: use a sample label, never damage or dispose of a real product.',
 remedies:[
  'Upload one photograph of the sample label showing the product name and lot code.',
  'Enter the lot code printed on the sample label.',
  'Confirm that this submission belongs to this claim.',
  'The merchant reviews the submitted evidence and refunds only the affected cup to the original payment using PayPal Sandbox test funds.',
 ],
});
export function preparedScenario(){
 const fields={title:exampleNotice.title,description:exampleNotice.description,remedies:[...exampleNotice.remedies],options:['Refund'],products:[{name:'Relay Home cup',model:'RH-CUP',description:'Fictional test product · LOT-A'}],retailers:['Relay Home (fictional)'],contact:'No manufacturer contact: software evaluation only.',recallDate:'',lastPublished:'2026-11-07'};
 const sourceUrl='https://recall-relay.dolepee.com/assets/relay-home-notice-v1.html';
 return {...fields,kind:'SOURCE_REVIEW_DRAFT',originType:'MERCHANT_TEST_NOTICE',recallNumber:exampleNotice.id,sourceUrl,retrievedAt:new Date().toISOString(),sourceDigest:createHash('sha256').update(JSON.stringify({id:exampleNotice.id,version:exampleNotice.version,sourceUrl,...fields})).digest('hex'),route:'ORIGINAL_PAYMENT_CANDIDATE',requirements:fields.remedies.map(quote=>({quote,sourceUrl})),paymentAuthorized:false,reviewNotes:[{id:'clause-3-0',disposition:'INFORMATION',reason:'Merchant settlement description, not an additional customer evidence response.'}]};
}
