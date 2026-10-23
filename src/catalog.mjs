// Every product, order and notice in this prototype is fictional test data.
export const catalog = [
  {sku:'CUP-01',name:'Northline Trail insulated travel mug',description:'Double-wall stainless steel coffee tumbler, 16 oz, locking lid, keeps drinks warm. Blue and black.',model:'TR-16'},
  {sku:'CUP-02',name:'Northline Everyday ceramic cup',description:'Ceramic coffee mug, 12 oz, open top, dishwasher safe, no lid.',model:'EC-12'},
  {sku:'BOT-01',name:'Northline Summit water bottle',description:'Stainless steel sports flask, 24 oz, screw cap, carry handle.',model:'SW-24'},
  {sku:'LMP-01',name:'Northline Reading lamp',description:'Adjustable LED desk light with USB power cable and dimmer.',model:'RL-01'},
  {sku:'BAG-01',name:'Northline Daypack',description:'Lightweight nylon backpack, padded straps and water bottle pocket.',model:'DP-20'},
  {sku:'KET-01',name:'Northline Electric kettle',description:'Countertop stainless steel hot water kettle, 1.7 litre, auto shutoff.',model:'EK-17'},
].map(item=>({brand:'Northline',...item}));
export const sampleNotice = 'Fictional training notice: Northline Trail travel mugs, model TR-16, lot LOT-A. The locking lid on the 16 oz insulated stainless steel tumbler may detach. Refund the original item price after the merchant reviews the product label and remedy confirmation. This notice is invented for testing.';

export function samplePurchases(now = new Date()) {
  const date = days => new Date(now.getTime() - days * 86400000).toISOString();
  const base = {version:1,merchantId:'FIXTURE-MERCHANT',sku:'CUP-01',lot:'LOT-A',currency:'USD',linePaidCents:2599,lineRefundedCents:0,captureRemainingCents:5999,capturedAt:date(19)};
  return [
    {...base,id:'ORDER-1042',lineId:'LINE-1',captureId:'FIXTURE-1042',customer:'Alex · test buyer',labelVerified:true,remedyVerified:true},
    {...base,id:'ORDER-1043',lineId:'LINE-1',captureId:'FIXTURE-1043',customer:'Sam · test buyer',labelVerified:true,remedyVerified:false},
    {...base,id:'ORDER-1044',lineId:'LINE-1',captureId:'FIXTURE-1044',customer:'Jules · test buyer',lot:null,labelVerified:false,remedyVerified:true},
    {...base,id:'ORDER-1045',lineId:'LINE-1',captureId:'FIXTURE-1045',customer:'Robin · test buyer',capturedAt:date(195),labelVerified:true,remedyVerified:true},
    {...base,id:'ORDER-1046',lineId:'LINE-1',captureId:'FIXTURE-1046',customer:'Casey · test buyer',lot:'LOT-B',labelVerified:true,remedyVerified:true},
    {...base,id:'ORDER-1047',lineId:'LINE-1',captureId:'FIXTURE-1047',customer:'Taylor · test buyer',sku:'CUP-02',linePaidCents:1899,labelVerified:true,remedyVerified:true},
  ];
}
