import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {AgStudio,createWidgets} from 'ag-studio-react';
import {studioTheme} from 'ag-studio';
import {caseAssistant} from './case-assistant.mjs';
import {ClaimGuide} from './claim-guide.jsx';

const theme=studioTheme.withParams({fontFamily:'system-ui, sans-serif',fontSize:14,studioMinWidth:280,studioMinHeight:400,studioCanvasMinWidth:280,studioWidgetTitleFontSize:16,studioWidgetTitleFontWeight:600});

export default function StudioWorkspace({data,initialState,onView,ClaimReview,OrderCell,guideOpen,onGuideClose,customize}){
  const [harness,setHarness]=useState(null);
  const ready=useCallback(({api})=>setHarness(caseAssistant(onView)({api})),[onView]);
  useEffect(()=>()=>harness?.dispose?.(),[harness]);
  const widgets=useMemo(()=>createWidgets({additionalTypes:[{id:'connected-case',label:'Customer claim',defaultSize:{width:15,height:24},minSize:{width:10,height:20},form:p=>p.createDefaults({}),comp:ClaimReview}],overrides:[{id:'grid',options:{createCellRenderer:field=>field.fieldId==='claims.order'?OrderCell:undefined}}]}),[ClaimReview,OrderCell]);
  return <div className="rr-workspace grid min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white" style={{gridTemplateColumns:guideOpen?'minmax(0,1fr) 18rem':'minmax(0,1fr)'}}><div className="min-h-0 min-w-0"><AgStudio style={{height:'100%',width:'100%'}} data={data} widgets={widgets} theme={theme} initialState={initialState} mode={customize?'edit':'view'} panels={{edit:{left:[],right:[]},view:{left:[],right:[]}}} onStudioReady={ready} onErrorRaised={event=>console.error('Studio:',event.errorDetails?.join('; ')||'Workspace error')}/></div><ClaimGuide harness={harness} open={guideOpen} onClose={onGuideClose}/></div>;
}
