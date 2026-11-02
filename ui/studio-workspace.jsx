import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {AgStudio,createWidgets} from 'ag-studio-react';
import {studioTheme} from 'ag-studio';
import {caseAssistant} from './case-assistant.mjs';
import {ClaimGuide} from './claim-guide.jsx';

const ink='#0E1417',paper='#F3EEE2',card='#FBF8F0',cobalt='#1B3FD8',rule='rgba(14,20,23,.17)',ruleStrong='rgba(14,20,23,.34)',muted='#5C6669';
const theme=studioTheme.withParams({
  accentColor:cobalt,backgroundColor:paper,foregroundColor:ink,textColor:ink,subtleTextColor:muted,
  borderColor:rule,borderWidth:1,borderRadius:2,fontFamily:'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',fontSize:14,
  studioMinWidth:280,studioMinHeight:400,studioCanvasMinWidth:280,
  studioWrapperBackgroundColor:paper,studioWrapperBorder:[1,rule],studioWrapperBorderRadius:2,
  studioCanvasBackgroundColor:paper,studioCanvasBorder:[1,rule],studioCanvasBorderRadius:2,studioCanvasGridLineColor:'rgba(14,20,23,.07)',
  studioWidgetBackgroundColor:card,studioWidgetBorder:[1,rule],studioWidgetBorderRadius:2,studioWidgetPadding:0,
  studioWidgetTitleTextColor:ink,studioWidgetTitleFontSize:16,studioWidgetTitleFontWeight:600,
  studioWidgetSubtitleTextColor:muted,studioWidgetCaptionTextColor:muted,
  gridAccentColor:cobalt,gridFontFamily:'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',gridFontSize:14,gridCellTextColor:ink,
  gridHeaderBackgroundColor:'#EAE3D4',gridHeaderTextColor:ink,gridHeaderFontFamily:'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',gridHeaderFontSize:11,gridHeaderFontWeight:600,
  gridDataBackgroundColor:card,gridOddRowBackgroundColor:card,gridRowBorder:[1,'rgba(14,20,23,.12)'],gridHeaderRowBorder:[2,ruleStrong],gridRowHeight:56,
});

export default function StudioWorkspace({data,initialState,onView,ClaimReview,OrderCell,guideOpen,onGuideClose,customize}){
  const [harness,setHarness]=useState(null);
  const ready=useCallback(({api})=>setHarness(caseAssistant(onView)({api})),[onView]);
  useEffect(()=>()=>harness?.dispose?.(),[harness]);
  const widgets=useMemo(()=>createWidgets({additionalTypes:[{id:'connected-case',label:'Customer claim',defaultSize:{width:15,height:24},minSize:{width:10,height:20},form:p=>p.createDefaults({}),comp:ClaimReview}],overrides:[{id:'grid',options:{createCellRenderer:field=>field.fieldId==='claims.order'?OrderCell:undefined}}]}),[ClaimReview,OrderCell]);
  return <div className="rr-workspace grid min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white" style={{gridTemplateColumns:guideOpen?'minmax(0,1fr) 18rem':'minmax(0,1fr)'}}><div className="min-h-0 min-w-0"><AgStudio style={{height:'100%',width:'100%'}} data={data} widgets={widgets} theme={theme} initialState={initialState} mode={customize?'edit':'view'} panels={{edit:{left:[],right:[]},view:{left:[],right:[]}}} onStudioReady={ready} onErrorRaised={event=>console.error('Studio:',event.errorDetails?.join('; ')||'Workspace error')}/></div><ClaimGuide harness={harness} open={guideOpen} onClose={onGuideClose}/></div>;
}
