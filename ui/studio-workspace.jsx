import React,{useMemo} from 'react';
import {AgStudio,createWidgets} from 'ag-studio-react';
import {studioTheme} from 'ag-studio';
import {caseAssistant} from './case-assistant.mjs';

const theme=studioTheme.withParams({fontFamily:'system-ui, sans-serif',fontSize:14,studioMinWidth:280,studioMinHeight:400,studioCanvasMinWidth:280,studioWidgetTitleFontSize:18,studioWidgetTitleFontWeight:600});

export default function StudioWorkspace({data,initialState,onView,ClaimReview,OrderCell}){
  const assistant=useMemo(()=>caseAssistant(onView),[onView]);
  const widgets=useMemo(()=>createWidgets({additionalTypes:[{id:'connected-case',label:'Customer claim',defaultSize:{width:12,height:35},minSize:{width:8,height:20},form:p=>p.createDefaults({}),comp:ClaimReview}],overrides:[{id:'grid',options:{createCellRenderer:field=>field.fieldId==='claims.order'?OrderCell:undefined}}]}),[ClaimReview,OrderCell]);
  return <div className="h-220"><AgStudio style={{height:'100%',width:'100%'}} data={data} widgets={widgets} theme={theme} initialState={initialState} mode="edit" ai={assistant} panels={{edit:{left:[],right:['ai']},view:{left:[],right:[]}}} onErrorRaised={e=>console.error('Studio:',e.message||e)}/></div>;
}
