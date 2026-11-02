import React,{useMemo} from 'react';
import {AgStudio,createWidgets} from 'ag-studio-react';
import {merchantStudioTheme} from './studio-workspace.jsx';
import {SampleOrderCell,SampleCasePanel,SourceRequirementsWidget,PaymentExceptionsWidget,AmountSummaryWidget} from './sample-widgets.jsx';
import {sampleRows} from './sample-data.mjs';

const widgetTypes=[
  {id:'sample-case',label:'Selected sample claim',defaultSize:{width:8,height:24},minSize:{width:6,height:16},form:p=>p.createDefaults({}),comp:SampleCasePanel},
  {id:'sample-source',label:'Source requirements',defaultSize:{width:9,height:9},minSize:{width:6,height:7},form:p=>p.createDefaults({}),comp:SourceRequirementsWidget},
  {id:'sample-payment',label:'Payment state',defaultSize:{width:9,height:7},minSize:{width:6,height:6},form:p=>p.createDefaults({}),comp:PaymentExceptionsWidget},
  {id:'sample-amount',label:'Amounts',defaultSize:{width:9,height:7},minSize:{width:6,height:5},form:p=>p.createDefaults({}),comp:AmountSummaryWidget},
];

export default function SampleStudio(){
  const widgets=useMemo(()=>createWidgets({additionalTypes:widgetTypes,overrides:[{id:'grid',options:{createCellRenderer:field=>field.fieldId==='sample.order'?SampleOrderCell:undefined}}]}),[]);
  const data=useMemo(()=>({sources:[{id:'sample',data:sampleRows}]}),[]);
  const initialState=useMemo(()=>({pages:[{id:'sample',widgets:{
    queue:{type:'grid',dataMapping:{cols:[{id:'sample.order'},{id:'sample.status'}]},format:{title:{text:'Sample claim queue',enabled:true},style:{theme:{rowHeight:74},columnAutoSize:false,columnWidth:130}}},
    review:{type:'sample-case',dataMapping:{}},
    source:{type:'sample-source',dataMapping:{}},
    payment:{type:'sample-payment',dataMapping:{}},
    amount:{type:'sample-amount',dataMapping:{}},
  },widgetLayout:{
    queue:{xTrack:0,yTrack:0,xSpan:7,ySpan:24},
    review:{xTrack:7,yTrack:0,xSpan:8,ySpan:24},
    source:{xTrack:15,yTrack:0,xSpan:9,ySpan:12},
    payment:{xTrack:15,yTrack:12,xSpan:9,ySpan:6},
    amount:{xTrack:15,yTrack:18,xSpan:9,ySpan:6},
  },layout:{minWidth:280,columns:24,rowHeight:24,pagePadding:0,widgetPadding:0,widgetBorderEnabled:true,widgetBorderColor:'rgba(14,20,23,.17)',widgetBorderRadius:2}}],selectedPageId:'sample'}),[]);
  return <div className="rr-workspace rr-sample-studio grid min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white" style={{gridTemplateColumns:'minmax(0,1fr)'}}><div className="min-h-0 min-w-0"><AgStudio style={{height:'100%',width:'100%'}} data={data} widgets={widgets} theme={merchantStudioTheme} initialState={initialState} mode="view" panels={{edit:{left:[],right:[]},view:{left:[],right:[]}}} onErrorRaised={event=>console.error('Sample Studio:',event.errorDetails?.join('; ')||'Workspace error')}/></div></div>;
}
