import test from 'node:test';import assert from 'node:assert/strict';
import {checkoutCart,providerCart,assertCheckoutItems} from '../src/checkout-cart.mjs';
import {ClaimDesk} from '../src/claims.mjs';import {PayPalSandbox} from '../src/paypal-sandbox.mjs';
test('variable item rows are sent to PayPal and a changed provider allocation is rejected',async()=>{
 const cart=checkoutCart({affectedCents:3875,excludedCents:3400},{sku:'CUP',lot:'A',product:'Cup'});let sent;
 const client=new PayPalSandbox({token:'fake',fetchImpl:async(url,input)=>{sent=JSON.parse(input.body);return new Response(JSON.stringify({id:'ORDER'}),{status:200});}});
 await client.createOrder({cents:7275,cart,requestId:'stable'});assert.equal(sent.purchase_units[0].amount.value,'72.75');assert.equal(sent.purchase_units[0].items[0].unit_amount.value,'38.75');assert.equal(assertCheckoutItems(sent.purchase_units[0],cart).paidCents,3875);
 const wrong=structuredClone(sent.purchase_units[0]);wrong.items[0].sku='OTHER';assert.throws(()=>assertCheckoutItems(wrong,cart));wrong.items=sent.purchase_units[0].items;wrong.amount.breakdown.shipping={currency_code:'USD',value:'1.00'};assert.throws(()=>assertCheckoutItems(wrong,cart));
 for(const input of [{affectedCents:25.99},{excludedCents:0},{captureId:'user-supplied'}])assert.throws(()=>checkoutCart(input,{sku:'CUP'}));
});
test('provider cart is checked before capture dispatch and immutable variable allocation survives capture',async()=>{
 let unit,cart,reference,captures=0,tamper=false;const amount={currency_code:'USD',value:'72.75'},capture={id:'CAPTURE',status:'COMPLETED',amount,create_time:new Date().toISOString()};
 const provider={createOrder:async i=>{cart=i.cart;reference=i.referenceId;unit=providerCart(cart);return {id:'ORDER',links:[{rel:'approve',href:'https://www.sandbox.paypal.com/checkoutnow?token=ORDER'}]};},orderDetails:async()=>({id:'ORDER',status:captures?'COMPLETED':'APPROVED',purchase_units:[{reference_id:reference,...unit,items:tamper?unit.items.slice(1):unit.items,payee:{merchant_id:'M'},payments:captures?{captures:[capture]}:{}}]}),captureOrder:async()=>{captures++;},captureDetails:async()=>capture};
 const desk=new ClaimDesk({provider:async()=>provider});try{desk.publish(true);const checkout=await desk.createCheckout({affectedCents:3875,excludedCents:3400});tamper=true;await assert.rejects(desk.captureCheckout(checkout.id),/item rows/);assert.equal(captures,0);tamper=false;const claim=await desk.captureCheckout(checkout.id);assert.equal(claim.amountCents,3875);assert.deepEqual(claim.allocation,{currency:'USD',originalCents:7275,affectedCents:3875,excludedCents:3400});assert.equal(captures,1);}finally{desk.close();}
});
