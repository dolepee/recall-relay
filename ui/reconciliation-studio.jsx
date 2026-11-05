import React,{useMemo} from 'react';
import {AgStudio,createWidgets} from 'ag-studio-react';
import {merchantStudioTheme} from './studio-theme.mjs';
import {ReconciliationList,ReconciliationDetail,ReconciliationSummary} from './reconciliation-panel.jsx';
export default function ReconciliationStudio(){
 const widgets=useMemo(()=>createWidgets({additionalTypes:[['reconcile-lines','Purchase lines',ReconciliationList],['reconcile-detail','Selected line',ReconciliationDetail],['reconcile-summary','Scope and amounts',ReconciliationSummary]].map(([id,label,comp])=>({id,label,comp,form:p=>p.createDefaults({}),defaultSize:{width:8,height:24}}))}),[]);
 const initialState=useMemo(()=>({pages:[{id:'reconciliation',widgets:{lines:{type:'reconcile-lines',dataMapping:{}},detail:{type:'reconcile-detail',dataMapping:{}},summary:{type:'reconcile-summary',dataMapping:{}}},widgetLayout:{lines:{xTrack:0,yTrack:0,xSpan:7,ySpan:24},detail:{xTrack:7,yTrack:0,xSpan:10,ySpan:24},summary:{xTrack:17,yTrack:0,xSpan:7,ySpan:24}},layout:{minWidth:280,columns:24,rowHeight:28,pagePadding:0,widgetPadding:0}}],selectedPageId:'reconciliation'}),[]);
 return <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200" style={{height:710}}><AgStudio style={{height:'100%',width:'100%'}} data={{sources:[]}} widgets={widgets} theme={merchantStudioTheme} initialState={initialState} mode="view" panels={{edit:{left:[],right:[]},view:{left:[],right:[]}}}/></div>;
}
