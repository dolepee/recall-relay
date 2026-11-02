// A static, read-only fixture for the sample desk. These are not customer
// records, payment evidence or model output. Nothing in this module imports the
// API, a provider, a workspace or an AI runtime.
export const SAMPLE_SOURCE={
  id:'SAMPLE-NOTICE-TR-16',
  label:'Fictional sample notice · Northline TR-16',
  title:'Northline Trail insulated travel mug · sample notice',
  url:'https://example.invalid/sample-notice',
  note:'Written for this sample. It is not a CPSC notice, a manufacturer instruction or a real recall.',
  product:'Northline Trail insulated travel mug',
  sku:'CUP-01',lot:'LOT-A',
  requirements:[
    {id:'req-photo',kind:'PHOTO',quote:'Photograph the product label and the model number printed on the base.',sourceRef:'Sample notice · photograph instruction'},
    {id:'req-confirm',kind:'CONFIRMATION',quote:'Confirm that the affected travel mug was purchased for personal use.',sourceRef:'Sample notice · confirmation instruction'},
    {id:'req-lot',kind:'TEXT',quote:'Enter the lot code printed on the base of the mug.',sourceRef:'Sample notice · lot instruction'},
  ],
  // FIELD is a link from a source quote to a field. It is not a coverage score.
  coverage:[
    {id:'cov-photo',quote:'Photograph the product label and the model number printed on the base.',fieldIds:['req-photo'],disposition:'FIELD',reason:''},
    {id:'cov-confirm',quote:'Confirm that the affected travel mug was purchased for personal use.',fieldIds:['req-confirm'],disposition:'FIELD',reason:''},
    {id:'cov-lot',quote:'Enter the lot code printed on the base of the mug.',fieldIds:['req-lot'],disposition:'FIELD',reason:''},
  ],
};
const requirement=(id,state,detail)=>({...SAMPLE_SOURCE.requirements.find(x=>x.id===id),state,detail});
const base={
  source:SAMPLE_SOURCE,
  amountCents:2599,
  originalCents:5999,
  unaffectedCents:3400,
  revision:3,
  payment:{state:'NOT_STARTED',label:'No payment attempted',amountCents:2599,reference:null},
  receipt:null,
};
export const SAMPLE_CASES=[
  {...base,order:'RR-SAMPLE-01',status:{code:'AWAITING_CUSTOMER',reason:'Waiting for the sample customer to provide the label photograph, lot and confirmation.'},revision:0,
    evidence:{submitted:false,summary:'No evidence submitted yet.'},requirements:[
      requirement('req-photo','missing','Missing from the sample evidence.'),
      requirement('req-confirm','missing','Missing from the sample evidence.'),
      requirement('req-lot','missing','Missing from the sample evidence.'),
    ]},
  {...base,order:'RR-SAMPLE-02',status:{code:'SUBMITTED',reason:'Sample evidence has arrived and is waiting for a merchant review.'},revision:2,
    evidence:{submitted:true,summary:'Photograph, lot and confirmation recorded as submitted.'},requirements:[
      requirement('req-photo','submitted','A fixture image is recorded. It has not been checked by a person in this sample.'),
      requirement('req-confirm','recorded','The sample customer confirmation is recorded, not independently verified.'),
      requirement('req-lot','submitted','LOT-A is recorded from the sample claim.'),
    ]},
  {...base,order:'RR-SAMPLE-03',status:{code:'READY_FOR_APPROVAL',reason:'The sample evidence is reviewed for revision 3 and ready for a recorded merchant decision. No refund has been attempted.'},revision:3,payment:{state:'READY',label:'Ready for a sample merchant decision',amountCents:2599,reference:null},
    evidence:{submitted:true,summary:'Merchant review is recorded for revision 3.'},requirements:[
      requirement('req-photo','reviewed','Recorded as reviewed for revision 3.'),
      requirement('req-confirm','reviewed','Recorded as reviewed for revision 3.'),
      requirement('req-lot','reviewed','LOT-A recorded and reviewed for revision 3.'),
    ]},
  {...base,order:'RR-SAMPLE-04',status:{code:'NEEDS_INFORMATION',reason:'A sample correction was requested: the label photograph needs to be clearer.'},revision:4,
    correction:{state:'REQUESTED',message:'The sample label photograph is out of focus. Upload a clearer image showing the model number and lot code.',replacePhoto:true},
    evidence:{submitted:true,summary:'The earlier photograph is recorded; a replacement is requested.'},requirements:[
      requirement('req-photo','correction','Replacement requested in this sample.'),
      requirement('req-confirm','recorded','The sample customer confirmation is recorded, not independently verified.'),
      requirement('req-lot','submitted','LOT-A is recorded from the sample claim.'),
    ]},
  {...base,order:'RR-SAMPLE-05',status:{code:'FAILED',reason:'The sample payment record needs attention. No further refund is sent in this sample.'},revision:3,
    payment:{state:'FAILED',label:'Sample payment exception',amountCents:2599,reference:'SAMPLE-REQUEST-05'},
    evidence:{submitted:true,summary:'Merchant review is recorded for revision 3.'},requirements:[
      requirement('req-photo','reviewed','Recorded as reviewed for revision 3.'),
      requirement('req-confirm','reviewed','Recorded as reviewed for revision 3.'),
      requirement('req-lot','reviewed','LOT-A recorded and reviewed for revision 3.'),
    ]},
  {...base,order:'RR-SAMPLE-06',status:{code:'COMPLETED',reason:'Sample receipt only. No PayPal call was made and no funds moved.'},revision:3,
    payment:{state:'SAMPLE_COMPLETED',label:'Sample receipt recorded',amountCents:2599,reference:'SAMPLE-RF-06'},
    receipt:{amountCents:2599,currency:'USD',reference:'SAMPLE-RF-06'},
    evidence:{submitted:true,summary:'Merchant review is recorded for revision 3.'},requirements:[
      requirement('req-photo','reviewed','Recorded as reviewed for revision 3.'),
      requirement('req-confirm','reviewed','Recorded as reviewed for revision 3.'),
      requirement('req-lot','reviewed','LOT-A recorded and reviewed for revision 3.'),
    ]},
];
const sampleStatusLabel={AWAITING_CUSTOMER:'Waiting',SUBMITTED:'Review',READY_FOR_APPROVAL:'Ready',NEEDS_INFORMATION:'Correction',FAILED:'Exception',COMPLETED:'Completed'};
export const sampleRows=SAMPLE_CASES.map(c=>({order:c.order,status:sampleStatusLabel[c.status.code]||c.status.code,amount:c.amountCents,product:SAMPLE_SOURCE.product}));
export const caseForOrder=order=>SAMPLE_CASES.find(c=>c.order===order)||SAMPLE_CASES[0];
export const DEFAULT_SAMPLE_ORDER='RR-SAMPLE-03';
