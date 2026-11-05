import {projectReconciliation} from '../src/reconciliation-projection.mjs';
const stamp='2026-11-01T12:00:00Z';
export const exampleScope={id:'FICTIONAL-SCOPE',sku:'CUP-01',lot:'LOT-A',coverage:[{id:'fictional-notice',quote:'This fictional exercise covers CUP-01, lot LOT-A. It is not a real recall notice.'}]};
const order=(id,capture,lot,paid=1000,refunded=0)=>({orderId:id,captureId:capture,capturedAt:stamp,status:'COMPLETED',lines:[{declaredLineId:'ITEM',sku:'CUP-01',lot,quantity:1,itemPaidCents:paid,taxCents:0,shippingCents:0,refundedCents:refunded}]});
const ledger={version:1,currency:'USD',source:{kind:'merchant-ledger',label:'Fictional example ledger',reference:'SYNTHETIC-ONLY'},orders:[order('LINKED-EXAMPLE','SYNTHETIC-LINKED','LOT-A',3875,1000),order('MISSING-LOT','SYNTHETIC-MISSING',null,1200),order('OTHER-LOT','SYNTHETIC-OTHER','LOT-B',1800),order('DUPLICATE-1','SYNTHETIC-DUP','LOT-A'),order('DUPLICATE-2','SYNTHETIC-DUP','LOT-A'),order('NEEDS-BINDING','SYNTHETIC-UNBOUND','LOT-A',2100)]};
const claims=[{id:'FICTIONAL-CLAIM',revision:0,createdAt:stamp,campaign:exampleScope,purchase:{id:'LINKED-EXAMPLE',captureId:'SYNTHETIC-LINKED',sku:'CUP-01',lot:'LOT-A',linePaidCents:3875,lineRefundedCents:1000}}];
export function examplePlan(corrected=false){
 const corrections=corrected?[{rowKey:'1:0',lot:'LOT-A',reason:'Fictional planning assumption only. Customer lot evidence is still missing.'}]:[];
 const result=projectReconciliation({ledger,corrections},exampleScope,claims,stamp);
 return {...result,synthetic:true,id:corrected?'EXAMPLE-CORRECTED':'EXAMPLE-ORIGINAL',lines:result.lines.map(r=>({...r,evidence:r.evidence?{...r.evidence,provenance:'SYNTHETIC_FIXTURE'}:null}))};
}
