import {LEDGER_LIMITS,previewLedger} from './ledger-preview.mjs';
export const CSV_LIMIT_BYTES=256*1024;
export const CSV_FIELDS=[
 ['orderId','Order reference',true,128],['declaredLineId','Item reference',true,128],
 ['sku','Product SKU',false,80],['lot','Lot code',false,80],['captureId','PayPal capture reference',false,128],
 ['capturedAt','Capture date',false,40],['status','Capture status',false,40],['quantity','Quantity'],
 ['itemPaid','Item paid (USD)'],['refunded','Prior item refunds (USD)'],['tax','Item tax (USD)'],['shipping','Item shipping (USD)']
].map(([key,label,required=false,max])=>({key,label,required,max}));
const aliases={orderId:['orderid','order','orderreference'],declaredLineId:['declaredlineid','lineid','itemreference'],sku:['sku','productsku'],lot:['lot','lotcode'],captureId:['captureid','capture','paypalcapturereference'],capturedAt:['capturedat','capturedate'],status:['status','capturestatus'],quantity:['quantity','qty'],itemPaid:['itempaid','itempaidusd'],refunded:['refunded','prioritemrefundsusd'],tax:['tax','itemtaxusd'],shipping:['shipping','itemshippingusd']};
const normalized=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
export function suggestMapping(headers){return Object.fromEntries(CSV_FIELDS.map(f=>{const matches=headers.flatMap((h,i)=>aliases[f.key].includes(normalized(h))?[String(i)]:[]);return [f.key,matches.length===1?matches[0]:''];}));}
// CSV is data only: never evaluate cells, formulas, HTML or arbitrary properties.
export function parseLedgerCsv(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>CSV_LIMIT_BYTES)throw new Error('Use a CSV file under 256 KB.');
 text=text.replace(/^\uFEFF/,'');const records=[];let row=[],cell='',quoted=false,closed=false;
 const pushCell=()=>{row.push(cell);cell='';closed=false;if(row.length>60)throw new Error('Use at most 60 columns.');};
 const pushRow=()=>{pushCell();if(row.some(v=>v.trim()))records.push(row);row=[];if(records.length>LEDGER_LIMITS.lines+1)throw new Error('Use at most 200 purchase lines.');};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
  if(c===','){pushCell();continue;}
  if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;pushRow();continue;}
  if(c==='"'){if(cell||closed)throw new Error('A quoted CSV cell must start with a quote.');quoted=true;continue;}
  if(closed)throw new Error('Use a comma or line break after a closing quote.');cell+=c;
 }
 if(quoted)throw new Error('A quoted CSV cell is missing its closing quote.');
 if(cell||row.length||closed)pushRow();
 if(records.length<2)throw new Error('Include column headings and at least one purchase line.');
 const headers=records.shift().map(h=>h.trim());
 if(headers.some(h=>!h)||new Set(headers.map(h=>h.toLowerCase())).size!==headers.length)throw new Error('Give every column a unique, nonempty heading.');
 if(records.some(r=>r.length!==headers.length))throw new Error('Each purchase row must have the same number of columns as the headings.');
 return {headers,rows:records};
}
function usd(s){if(!s||s.toUpperCase()==='UNKNOWN')return null;if(!/^\d+(?:\.\d{1,2})?$/.test(s))throw new Error('Use USD dollars such as 38.75; leave blank if unknown.');const [whole,fraction='']=s.split('.');const n=Number(whole)*100+Number(fraction.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n>LEDGER_LIMITS.cents)throw new Error('Use an amount no greater than 1,000,000.00 USD.');return n;}
export function mapLedgerCsv(table,mapping,edits={},label='Imported purchase CSV'){
 const errors=[],values=table.rows.map((cells,index)=>Object.fromEntries(CSV_FIELDS.map(f=>[f.key,String(edits[index]?.[f.key]??(mapping[f.key]!==''&&mapping[f.key]!=null?cells[Number(mapping[f.key])]??'':'')).trim()])));
 for(const f of CSV_FIELDS)if(f.required&&(mapping[f.key]===''||mapping[f.key]==null))errors.push({field:f.key,message:`Choose a column for ${f.label.toLowerCase()}.`});
 const chosen=Object.values(mapping).filter(v=>v!==''&&v!=null);if(new Set(chosen).size!==chosen.length)errors.push({message:'Map each CSV column to only one field.'});
 const groups=new Map();
 values.forEach((v,row)=>{
  const fail=(field,message)=>errors.push({row,field,message});
  for(const f of CSV_FIELDS){if(f.required&&!v[f.key])fail(f.key,'Enter a reference.');if(f.max&&(v[f.key].length>f.max||/[\u0000-\u001f]/.test(v[f.key])))fail(f.key,`Use at most ${f.max} characters without line breaks or control characters.`);}
  if(v.capturedAt&&!Number.isFinite(Date.parse(v.capturedAt)))fail('capturedAt','Use a valid capture date, or leave blank if unknown.');
  let quantity=null;if(v.quantity&&v.quantity.toUpperCase()!=='UNKNOWN'){quantity=Number(v.quantity);if(!/^\d+$/.test(v.quantity)||!Number.isSafeInteger(quantity)||quantity<1||quantity>10000)fail('quantity','Use a whole quantity from 1 to 10000, or leave blank if unknown.');}
  const amounts={};for(const [key,target] of [['itemPaid','itemPaidCents'],['refunded','refundedCents'],['tax','taxCents'],['shipping','shippingCents']]){try{amounts[target]=usd(v[key]);}catch(e){fail(key,e.message);}}
  if(amounts.refundedCents!==null&&amounts.itemPaidCents!==null&&amounts.refundedCents>amounts.itemPaidCents)fail('refunded','Prior item refunds cannot exceed the item paid amount.');
  const metadata={orderId:v.orderId,captureId:v.captureId||null,capturedAt:v.capturedAt||null,status:v.status||null};
  let group=groups.get(v.orderId);if(!group){group={...metadata,lines:[]};groups.set(v.orderId,group);}else if(['captureId','capturedAt','status'].some(k=>group[k]!==metadata[k]))fail('orderId','Rows for this order disagree on capture reference, date or status. Correct the order rows.');
  if(group.lines.some(l=>l.declaredLineId===v.declaredLineId))fail('declaredLineId','Use a unique item reference within this order.');
  group.lines.push({declaredLineId:v.declaredLineId,sku:v.sku||null,lot:v.lot||null,quantity,...amounts});
 });
 if(groups.size>LEDGER_LIMITS.orders)errors.push({message:'Use at most 50 orders.'});
 const ledger={version:1,currency:'USD',source:{kind:'merchant-ledger',label:label.slice(0,160)||'Imported purchase CSV',reference:null},orders:[...groups.values()]};
 if(!errors.length)try{previewLedger(ledger,null);}catch(e){errors.push({message:e.message});}
 return {values,errors,ledger:errors.length?null:ledger};
}
export const CSV_TEMPLATE='orderId,declaredLineId,sku,lot,captureId,capturedAt,status,quantity,itemPaid,refunded,tax,shipping\nFICTIONAL-ORDER,ITEM,CUP-01,LOT-A,FICTIONAL-CAPTURE,2026-11-01T12:00:00Z,COMPLETED,1,38.75,10.00,0.00,0.00\n';
