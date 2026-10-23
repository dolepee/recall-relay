import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {Buffer} from 'node:buffer';
import {syncTransaction} from './transaction.mjs';
import { planClaim } from './plan.mjs';
import { usdCents } from './money.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const TOTAL = 5999, ITEM = 2599;
export const campaign = Object.freeze({
  id: 'SAMPLE-CUP-RECALL', version: 1, title: 'Cup refund campaign · sandbox example',
  product: 'Relay Home cup', sku: 'CUP-01', lot: 'LOT-A', remedy: 'REFUND',
  notice: 'Fictional refund exercise: CUP-01, lot LOT-A is eligible for an item-price refund after the merchant reviews a product-label photo and your purchase confirmation. This is not a real safety recall or product-safety advice.',
  requirements: ['Enter the lot printed on the item.', 'Upload a photograph of the product label.', 'Confirm this is the item from your linked purchase.'],
  sourceUrl: 'https://example.com/fictional-recall',
});

function photoValue(photo) {
  if (photo == null) return null;
  if (typeof photo !== 'string' || photo.length > 2800000) throw new Error('Choose a PNG or JPEG image smaller than 2 MB.');
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(photo);
  if (!match) throw new Error('Only PNG and JPEG photographs are accepted.');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 2 * 1024 * 1024 || bytes.length < 20 || bytes.toString('base64') !== match[2]) throw new Error('Invalid image file.');
  const valid = match[1] === 'png' ? bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) : bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217;
  if (!valid) throw new Error('The file content does not match its image type.');
  // File validation is not evidence of ownership, authenticity or eligibility.
  return photo;
}

export class ClaimDeskCore {
  constructor({ journal, provider, now = () => new Date().toISOString(), origin = 'http://127.0.0.1:4318' }) {
    this.journal = journal; this.db = journal.db;
    this.provider = provider; this.now = now; this.origin = origin;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS claim_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS checkouts (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS claims (id TEXT PRIMARY KEY, access_hash TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS refund_hints (request_id TEXT PRIMARY KEY, refund_id TEXT NOT NULL);
    `);
    if (!this.setting('merchant-key')) this.setSetting('merchant-key', secret());
  }
  setting(key) { return this.db.prepare('SELECT value FROM claim_settings WHERE key=?').get(key)?.value; }
  setSetting(key,value) { this.db.prepare('INSERT INTO claim_settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value); }
  activeCampaign(){const value=this.setting('active-campaign');return value?JSON.parse(value):campaign;}
  campaignFor(claim){return claim.campaign||campaign;}
  merchantKey() { return this.setting('merchant-key'); }
  authenticateMerchant(value) { return typeof value === 'string' && hash(value) === hash(this.merchantKey()); }
  saveCheckout(value) { this.db.prepare('INSERT INTO checkouts VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(value.id,JSON.stringify(value)); }
  checkout(id) { const row=this.db.prepare('SELECT data FROM checkouts WHERE id=?').get(id); if(!row)throw new Error('Unknown sandbox purchase.');return JSON.parse(row.data); }
  saveClaim(value) { this.db.prepare('INSERT INTO claims VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(value.id,hash(value.access),JSON.stringify(value)); }
  claim(id) { const row=this.db.prepare('SELECT data FROM claims WHERE id=?').get(id);if(!row)throw new Error('Claim not found.');return JSON.parse(row.data); }
  authorizeCustomer(access) {
    if (typeof access !== 'string' || !/^[\w-]{43}$/.test(access)) throw new Error('This private claim link is invalid.');
    const row=this.db.prepare('SELECT data FROM claims WHERE access_hash=?').get(hash(access));
    if(!row)throw new Error('This private claim link is invalid.');return JSON.parse(row.data);
  }
  publish(confirmed) { if(confirmed!==true)throw new Error('Review the fictional campaign before publishing.');this.setSetting('published','yes');return this.merchantState(); }
  async createCheckout() {
    if(this.setting('published')!=='yes')throw new Error('Review and publish the sandbox campaign first.');
    const value={id:randomUUID(),createRequest:randomUUID(),captureRequest:randomUUID(),state:'CREATING',createdAt:this.now(),campaign:this.activeCampaign()};
    this.saveCheckout(value);
    const provider=await this.provider();
    const order=await provider.createOrder({cents:TOTAL,requestId:value.createRequest,referenceId:value.id,returnUrl:`${this.origin}/desk?purchase=${value.id}`,cancelUrl:`${this.origin}/desk?cancelled=${value.id}`});
    const href=order.links?.find(l=>['approve','payer-action'].includes(l.rel))?.href;
    if(typeof order.id!=='string' || !href || new URL(href).origin!=='https://www.sandbox.paypal.com')throw new Error('PayPal did not return a sandbox approval link.');
    Object.assign(value,{orderId:order.id,approvalUrl:href,state:'AWAITING_APPROVAL'});this.saveCheckout(value);
    return value;
  }
  async captureCheckout(id) {
    let value=this.checkout(id);
    if(value.claimId)return this.merchantView(this.claim(value.claimId));
    if(!value.orderId)throw new Error('The purchase setup is incomplete. Start another sandbox purchase.');
    const provider=await this.provider();
    let order=await provider.orderDetails(value.orderId);
    if(order.id!==value.orderId)throw new Error('PayPal returned a different order.');
    // Re-read after the await: a second request may already have started capture.
    value=this.checkout(id);
    if(value.claimId)return this.merchantView(this.claim(value.claimId));
    if(order.status!=='COMPLETED') {
      if(value.state==='CAPTURE_ATTEMPTED')throw new Error('The capture is unresolved. Refresh its status; no second capture will be sent.');
      if(order.status!=='APPROVED')throw new Error('Approve the purchase in PayPal Sandbox first.');
      value.state='CAPTURE_ATTEMPTED';this.saveCheckout(value);
      await provider.captureOrder({orderId:value.orderId,requestId:value.captureRequest});
      order=await provider.orderDetails(value.orderId);
    }
    const units=order.purchase_units, unit=units?.[0], capture=unit?.payments?.captures?.[0];
    if(order.id!==value.orderId || order.status!=='COMPLETED' || units?.length!==1 || unit.reference_id!==value.id || usdCents(unit.amount)!==TOTAL || unit.payments?.captures?.length!==1 || !capture?.id || capture.status!=='COMPLETED' || usdCents(capture.amount)!==TOTAL || !unit.payee?.merchant_id)
      throw new Error('The completed purchase does not match this sandbox order.');
    const details=await provider.captureDetails(capture.id);
    if(details.id!==capture.id || details.status!=='COMPLETED' || usdCents(details.amount)!==TOTAL || !Number.isFinite(Date.parse(details.create_time)))throw new Error('The original capture could not be verified.');
    // Another reconciliation request may have bound the same order in the meantime.
    const existing=this.checkout(id);
    if(existing.claimId)return this.merchantView(this.claim(existing.claimId));
    const policy=value.campaign||campaign;
    const claim={id:value.id,campaign:policy,access:secret(),createdAt:this.now(),purchase:{id:`RR-${value.id.slice(0,8).toUpperCase()}`,version:1,merchantId:unit.payee.merchant_id,captureId:capture.id,lineId:`${policy.sku}-LINE`,sku:policy.sku,lot:policy.lot,capturedAt:details.create_time,currency:'USD',linePaidCents:ITEM,lineRefundedCents:0,captureRemainingCents:TOTAL},submission:null,revision:0,review:null};
    syncTransaction(this.db,()=>{this.saveClaim(claim);value.state='CAPTURED';value.claimId=claim.id;this.saveCheckout(value);});
    return this.merchantView(claim);
  }
  reservation(claim) {return this.db.prepare('SELECT * FROM refunds WHERE merchant=? AND capture=? AND line=?').get(claim.purchase.merchantId,claim.purchase.captureId,claim.purchase.lineId)||null;}
  missing(claim) {
    const s=claim.submission, missing=[];
    if(!s?.lot)missing.push('Enter the lot printed on your item.');
    if(!s?.photo)missing.push('Add a photograph of the product label.');
    if(!s?.acknowledged)missing.push('Confirm this is the item from your linked purchase.');
    for(const field of this.campaignFor(claim).fields||[]){
      if(field.kind==='CONFIRMATION'&&s?.extra?.[field.id]!==true)missing.push('Confirm the source requirement: '+field.quote);
      if(field.kind==='TEXT'&&!s?.extra?.[field.id]?.trim())missing.push('Provide the requested information: '+field.quote);
    }
    return missing;
  }
  plan(claim) {
    if(claim.correction?.state==='REQUESTED')return {status:'REVIEW',reason:'The customer must respond to the requested changes before a fresh evidence review.',purchaseId:claim.purchase.id};
    const policy=this.campaignFor(claim);
    const review=claim.review && claim.review.revision===claim.revision ? {label:{reviewedBy:'local-merchant',revision:claim.revision,submissionHash:claim.review.submissionHash}} : {};
    return planClaim({policy:{...policy,reviewedBy:this.setting('published')==='yes'?'local-merchant':null,settlingMerchantId:claim.purchase.merchantId,skus:[policy.sku],lots:[policy.lot],requiredEvidence:['label']},purchase:{...claim.purchase,lot:claim.submission?.lot||null},evidence:review,now:this.now()});
  }
  status(claim) {
    const row=this.reservation(claim);
    if(row)return {code:row.state,reason:row.state==='COMPLETED'?'PayPal confirmed your refund.':row.state==='PENDING'?'PayPal is processing your refund.':'The merchant is checking the payment result. No additional refund has been sent.'};
    if(!claim.submission)return {code:'AWAITING_CUSTOMER',reason:'Complete your claim below.'};
    if(claim.correction?.state==='REQUESTED')return {code:'NEEDS_INFORMATION',reason:'The merchant requested a change. Read the message and update your claim below.'};
    if(this.missing(claim).length)return {code:'NEEDS_INFORMATION',reason:'Your claim is saved. Add the missing information below.'};
    if(claim.submission.lot!==this.campaignFor(claim).lot)return {code:'MANUAL',reason:'The lot differs from this campaign. The merchant must review your case manually.'};
    const plan=this.plan(claim);
    if(plan.status==='MANUAL')return {code:'MANUAL',reason:plan.reason};
    return claim.review ? {code:plan.status,reason:plan.reason||'Evidence reviewed. Waiting for merchant approval.'} : {code:'SUBMITTED',reason:'Your claim is with the merchant for review.'};
  }
  customerView(claim) {
    const row=this.reservation(claim);
    const correction=claim.correction?(({photoHash,...visible})=>visible)(claim.correction):null;
    return {id:claim.id,order:claim.purchase.id,campaign:this.campaignFor(claim),amountCents:ITEM,currency:'USD',status:this.status(claim),missing:this.missing(claim),revision:claim.revision,correction,submittedAt:claim.submission?.submittedAt||null,submission:claim.submission?{lot:claim.submission.lot,acknowledged:claim.submission.acknowledged,hasPhoto:!!claim.submission.photo,extra:claim.submission.extra||{}}:null,locked:!!row,receipt:row?.state==='COMPLETED'?{refundId:row.refund_id,amountCents:row.cents,currency:row.currency,status:'COMPLETED',destination:'Original PayPal payment'}:null};
  }
  customerState(access) {return this.customerView(this.authorizeCustomer(access));}
  submit(access,input) {
    const claim=this.authorizeCustomer(access);
    if(this.reservation(claim))throw new Error('This claim is already in payment review. Its submitted evidence is locked.');
    if(input.revision!==claim.revision)throw new Error('This claim changed in another window. Refresh before submitting.');
    const lot=typeof input.lot==='string'?input.lot.trim().toUpperCase():'';
    if(lot.length>40 || (lot && !/^[A-Z0-9 -]+$/.test(lot)))throw new Error('Use the letters and numbers printed on the lot label.');
    const photo=input.photo===undefined?claim.submission?.photo||null:photoValue(input.photo);
    const extra=input.extra===undefined?claim.submission?.extra||{}:input.extra;
    const fields=this.campaignFor(claim).fields||[];
    if(!extra||Array.isArray(extra)||typeof extra!=='object'||Object.keys(extra).some(id=>!fields.some(f=>f.id===id&&f.kind!=='PHOTO')))throw new Error('Unexpected claim fields. Refresh this claim.');
    for(const field of fields){const v=extra[field.id];if(v!==undefined&&((field.kind==='CONFIRMATION'&&typeof v!=='boolean')||(field.kind==='TEXT'&&(typeof v!=='string'||v.length>500))))throw new Error('Check the source requirement responses; text must be under 500 characters.');}
    // Later edits must not silently restore the photograph the merchant returned.
    // Keep this constraint until a new correction supersedes the current request.
    if(claim.correction?.replacePhoto&&(!photo||hash(photo)===claim.correction.photoHash))throw new Error('Upload a different photograph to answer the merchant’s request. Your previous photograph is still saved.');
    if(claim.correction?.state==='REQUESTED'){
      const response=typeof input.correctionResponse==='string'?input.correctionResponse.trim():'';
      if(response.length<3||response.length>1000)throw new Error('Describe your response to the merchant in 3–1,000 characters.');
      claim.correction={...claim.correction,state:'RESPONDED',response,respondedAt:this.now()};
    }
    claim.revision++;claim.review=null;
    claim.submission={lot,photo,extra,acknowledged:input.acknowledged===true,submittedAt:this.now()};
    this.saveClaim(claim);return this.customerView(claim);
  }
  merchantView(claim) {return {...this.customerView(claim),plan:this.plan(claim),review:claim.review,photo:claim.submission?.photo||null,claimUrl:`/claim#${claim.access}`,payment:this.reservation(claim)};}
  merchantState() {
    return {mode:'real-sandbox',campaign:this.activeCampaign(),published:this.setting('published')==='yes',cases:this.db.prepare('SELECT data FROM claims ORDER BY rowid DESC').all().map(row=>this.merchantView(JSON.parse(row.data))),checkouts:this.db.prepare('SELECT data FROM checkouts ORDER BY rowid DESC').all().map(row=>JSON.parse(row.data))};
  }
  requestChanges(id,{revision,message,replacePhoto}) {
    const claim=this.claim(id);
    if(this.reservation(claim))throw new Error('This claim is already in payment review. Its submitted evidence is locked.');
    if(!claim.submission||revision!==claim.revision)throw new Error('Refresh and inspect the current submission before requesting a change.');
    if(claim.correction?.state==='REQUESTED')throw new Error('A change request is already waiting for the customer.');
    const text=typeof message==='string'?message.trim():'';
    if(text.length<10||text.length>600||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))throw new Error('Explain the needed change in 10–600 characters.');
    if(typeof replacePhoto!=='boolean')throw new Error('Choose whether a replacement photograph is required.');
    claim.revision++;claim.review=null;
    claim.correction={state:'REQUESTED',message:text,replacePhoto,requestedAt:this.now(),revision:claim.revision,photoHash:claim.submission.photo?hash(claim.submission.photo):null};
    this.saveClaim(claim);return this.merchantView(claim);
  }
  review(id,{revision,confirmed}) {
    const claim=this.claim(id);
    if(this.reservation(claim))throw new Error('The approved payment has already been recorded.');
    if(claim.correction?.state==='REQUESTED'||confirmed!==true || revision!==claim.revision || this.missing(claim).length || claim.submission?.lot!==this.campaignFor(claim).lot)throw new Error('Review the current label photo and matching lot before confirming this case.');
    claim.review={revision,submissionHash:hash(JSON.stringify(claim.submission)),reviewedAt:this.now()};
    this.saveClaim(claim);return this.merchantView(claim);
  }
  async approve(id,{digest}) {
    let claim=this.claim(id),previous=this.reservation(claim);
    if(previous) {
      if(previous.digest!==digest)throw new Error('Approval does not match the recorded refund.');
      return this.merchantView(claim);
    }
    const provider=await this.provider();
    const capture=await provider.captureDetails(claim.purchase.captureId);
    if(capture.id!==claim.purchase.captureId || capture.status!=='COMPLETED' || usdCents(capture.amount)!==TOTAL)throw new Error('The capture changed or has another refund. Reconciliation is required.');
    claim=this.claim(id);
    const row=this.journal.reserve(this.plan(claim),{actor:'local-merchant',digest},TOTAL);
    if(row.replay)return this.merchantView(claim);
    const attempt=this.journal.begin(row.request_id);
    const response=await provider.refund(attempt);
    if(typeof response.id!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(response.id))throw new Error('The refund result is unresolved. No repeat refund will be sent.');
    // Persist a lookup hint before readback; a crash here can resume safely.
    this.db.prepare('INSERT INTO refund_hints VALUES (?,?)').run(row.request_id,response.id);
    const observed=await provider.verifiedRefund(row,response.id);
    this.journal.observe(row.request_id,observed);
    return this.merchantView(this.claim(id));
  }
  async reconcile(id) {
    const claim=this.claim(id),row=this.reservation(claim);
    if(!row)throw new Error('There is no payment attempt to check.');
    const refundId=this.db.prepare('SELECT refund_id FROM refund_hints WHERE request_id=?').get(row.request_id)?.refund_id;
    if(!refundId)throw new Error('PayPal did not return a refund reference. Manual reconciliation is required; another refund will not be sent.');
    const provider=await this.provider();
    this.journal.observe(row.request_id,await provider.verifiedRefund(row,refundId));
    return this.merchantView(claim);
  }
  close(){this.journal.close();}
}
