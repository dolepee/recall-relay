import {createHash} from 'node:crypto';
import {usdCents} from './money.mjs';
import {syncTransaction} from './transaction.mjs';

export const bindingHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=()=>{throw new Error('This provisioned purchase needs manual reconciliation. No claim or refund was created.');};
const identifier=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const scope=v=>typeof v==='string'&&/^[A-Z0-9][A-Z0-9 -]{0,39}$/.test(v);
// This configuration is supplied by the service operator, never by an HTTP body.
// A grant records a reviewed sales-record mapping, not provider proof of a lot.
export function provisionedPurchases(raw,workspace){
  if(!raw)return [];
  const grants=typeof raw==='string'?JSON.parse(raw):raw;
  if(!Array.isArray(grants)||grants.length>50)throw new Error('Purchase provisioning configuration is invalid.');
  const ids=new Set(),captures=new Set();
  for(const g of grants){
    if(!g||g.version!==1||!identifier(g.id)||!identifier(g.workspace)||!identifier(g.operator)||!identifier(g.orderId)||!identifier(g.captureId)||!identifier(g.merchantId)||!identifier(g.referenceId)||!scope(g.sku)||!scope(g.lot)||!Number.isSafeInteger(g.itemOrdinal)||g.itemOrdinal<0||g.itemOrdinal>99||!Number.isSafeInteger(g.itemPaidCents)||g.itemPaidCents<=0||!Number.isSafeInteger(g.captureCents)||g.captureCents<g.itemPaidCents||g.captureCents>100_000_000||!Number.isFinite(Date.parse(g.provisionedAt))||typeof g.salesRecordReference!=='string'||!g.salesRecordReference.trim()||g.salesRecordReference.length>200)throw new Error('Purchase provisioning configuration is invalid.');
    const capture=JSON.stringify([g.merchantId,g.captureId]);
    if(!Number.isFinite(Date.parse(g.expiresAt))||Date.parse(g.expiresAt)<=Date.parse(g.provisionedAt))throw new Error('Purchase provisioning expiry is invalid.');
    if(ids.has(g.id)||captures.has(capture))throw new Error('Duplicate purchase provisioning configuration.');
    ids.add(g.id);captures.add(capture);
  }
  return grants.filter(g=>g.workspace===workspace).map(g=>({...g}));
}

export function verifyProvisionedPurchase(grant,order,capture,now){
  const unit=order?.purchase_units?.[0],embedded=unit?.payments?.captures?.[0];
  const age=Date.parse(now)-Date.parse(capture?.create_time);
  const parent=capture?.supplementary_data?.related_ids?.order_id;
  const expectedParents=[`https://api-m.sandbox.paypal.com/v2/checkout/orders/${grant.orderId}`,`https://api.sandbox.paypal.com/v2/checkout/orders/${grant.orderId}`];
  if(order?.id!==grant.orderId||order.status!=='COMPLETED'||order.purchase_units?.length!==1||unit.reference_id!==grant.referenceId||unit.payee?.merchant_id!==grant.merchantId||capture?.payee?.merchant_id!==grant.merchantId||unit.payments?.captures?.length!==1||embedded?.id!==grant.captureId||embedded.status!=='COMPLETED'||capture?.id!==grant.captureId||capture.status!=='COMPLETED'||(parent?parent!==grant.orderId:!expectedParents.includes(capture?.links?.find(x=>x.rel==='up')?.href))||!Number.isFinite(age)||age<0||age>=180*86400000)fail();
  if(usdCents(unit.amount)!==grant.captureCents||usdCents(embedded.amount)!==grant.captureCents||usdCents(capture.amount)!==grant.captureCents)fail();
  const items=unit.items,breakdown=unit.amount.breakdown;
  if(!Array.isArray(items)||!items.length||items.length>100||!breakdown||usdCents(breakdown.item_total)!==grant.captureCents)fail();
  // No guessed allocation of tax, shipping, discounts or previous refunds.
  for(const [key,value] of Object.entries(breakdown))if(key!=='item_total'&&usdCents(value)!==0)fail();
  if(unit.payments.refunds?.length)fail();
  const seen=new Set();let total=0;
  for(const item of items){
    if(!scope(item.sku)||seen.has(item.sku)||item.quantity!=='1'||(item.tax&&usdCents(item.tax)!==0))fail();
    seen.add(item.sku);total+=usdCents(item.unit_amount);
  }
  const item=items[grant.itemOrdinal];
  if(total!==grant.captureCents||!item||item.sku!==grant.sku||usdCents(item.unit_amount)!==grant.itemPaidCents)fail();
  return {id:`IMPORTED-${bindingHash([grant.merchantId,grant.captureId]).slice(0,12).toUpperCase()}`,version:1,merchantId:grant.merchantId,captureId:grant.captureId,lineId:'PROVISIONED-CAPTURE-LINE',sku:grant.sku,lot:grant.lot,capturedAt:capture.create_time,currency:'USD',linePaidCents:grant.itemPaidCents,lineRefundedCents:0,captureRemainingCents:grant.captureCents,originalCaptureCents:grant.captureCents,provenance:{kind:'OPERATOR_PROVISIONED',grantId:grant.id,operator:grant.operator,provisionedAt:grant.provisionedAt,orderId:grant.orderId,itemOrdinal:grant.itemOrdinal,catalogMapping:'OPERATOR_REVIEWED',providerVerifiedAt:now,grantDigest:bindingHash(grant)}};
}

// Shared by a local SQLite test and one hosted Durable Object per merchant/capture.
// Ownership is capture-global, not keyed by editable SKU, line, amount or workspace.
export class CaptureOwnershipCore{
  constructor(db){this.db=db;db.exec('CREATE TABLE IF NOT EXISTS capture_owner (singleton INTEGER PRIMARY KEY CHECK(singleton=1), data TEXT NOT NULL)');}
  claim(input){
    if(!input||!['merchantId','captureId','workspace','claimId'].every(k=>identifier(input[k])))throw new Error('Invalid capture ownership request.');
    const identity={environment:'SANDBOX',merchantId:input.merchantId,captureId:input.captureId,workspace:input.workspace,claimId:input.claimId,grantId:input.grantId||null,grantDigest:input.grantDigest||null,operator:input.operator||null,provisionedAt:input.provisionedAt||null};
    return syncTransaction(this.db,()=>{
      const current=this.db.prepare('SELECT data FROM capture_owner WHERE singleton=1').get();
      if(current){const owner=JSON.parse(current.data);if(bindingHash(owner.identity)!==bindingHash(identity))throw new Error('This capture is already assigned. Manual reconciliation is required.');return owner;}
      const record={identity,claimedAt:new Date().toISOString()};
      this.db.prepare('INSERT INTO capture_owner VALUES (1,?)').run(JSON.stringify(record));return record;
    });
  }
}
