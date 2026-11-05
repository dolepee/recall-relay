import {usdAmount,usdCents} from './money.mjs';
// Defaults describe the fictional example; settlement uses the saved cart and
// authenticated provider item rows, never these defaults.
export const EXAMPLE_PRICES=Object.freeze({affectedCents:2599,excludedCents:3400});
export function checkoutCart(input={},policy){
 if(!input||Array.isArray(input)||Object.keys(input).some(k=>!['affectedCents','excludedCents'].includes(k)))throw new Error('Supply the two sandbox item prices only.');
 const prices={...EXAMPLE_PRICES,...input};
 for(const value of Object.values(prices))if(!Number.isSafeInteger(value)||value<1||value>100000)throw new Error('Each sandbox item price must be between $0.01 and $1,000.00.');
 const excludedSku=policy.sku==='RR-UNAFFECTED'?'RR-UNAFFECTED-2':'RR-UNAFFECTED';
 return {version:1,currency:'USD',totalCents:prices.affectedCents+prices.excludedCents,affectedOrdinal:0,lines:[{sku:policy.sku,name:String(policy.product||'Campaign item').slice(0,100),lot:policy.lot,quantity:1,paidCents:prices.affectedCents,affected:true},{sku:excludedSku,name:'Unaffected example item',lot:null,quantity:1,paidCents:prices.excludedCents,affected:false}]};
}
export function providerCart(cart){return {amount:{...usdAmount(cart.totalCents),breakdown:{item_total:usdAmount(cart.totalCents)}},items:cart.lines.map(l=>({sku:l.sku,name:l.name,quantity:'1',unit_amount:usdAmount(l.paidCents)}))};}
export function assertCheckoutItems(unit,cart){
 const fail=()=>{throw new Error('Provider item rows or allocation differ from the saved sandbox cart. Manual reconciliation is required.');};
 if(!cart||cart.version!==1||!Array.isArray(unit?.items)||unit.items.length!==cart.lines.length||usdCents(unit.amount)!==cart.totalCents||!unit.amount.breakdown||usdCents(unit.amount.breakdown.item_total)!==cart.totalCents||unit.payments?.refunds?.length)fail();
 for(const [key,value] of Object.entries(unit.amount.breakdown))if(key!=='item_total'&&usdCents(value)!==0)fail();
 unit.items.forEach((item,i)=>{const expected=cart.lines[i];if(item.sku!==expected.sku||item.quantity!=='1'||usdCents(item.unit_amount)!==expected.paidCents||item.tax&&usdCents(item.tax)!==0)fail();});
 return cart.lines[cart.affectedOrdinal];
}
