import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AgStudio,createWidgets} from 'ag-studio-react';
import {studioTheme} from 'ag-studio';
import {caseAssistant} from './case-assistant.mjs';
import {ClaimGuide} from './claim-guide.jsx';
import {STUDIO_ROW_HEIGHT,STUDIO_WIDGET_LAYOUT,STUDIO_WORKSPACE_HEIGHT,fitStudioLayout} from './studio-layout.mjs';

const ink='#0E1417',paper='#F3EEE2',card='#FBF8F0',cobalt='#1B3FD8',rule='rgba(14,20,23,.17)',ruleStrong='rgba(14,20,23,.34)',muted='#5C6669';
export const merchantStudioTheme=studioTheme.withParams({
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
const theme=merchantStudioTheme;

// The panels are height:100% scroll containers. Their scrollHeight is therefore
// clamped to the current allocation once a panel has been made large enough, which
// would make every later fit pass monotonic. Measure a temporary unconstrained box
// instead so shorter claims and closed forms can give rows back.
function intrinsicContentHeight(node){
  const previous={height:node.style.height,minHeight:node.style.minHeight,overflow:node.style.overflow};
  const scrollTop=node.scrollTop;
  node.style.height='auto';
  node.style.minHeight='0';
  node.style.overflow='visible';
  const height=Math.max(node.scrollHeight,Math.ceil(node.getBoundingClientRect().height));
  node.style.height=previous.height;
  node.style.minHeight=previous.minHeight;
  node.style.overflow=previous.overflow;
  node.scrollTop=scrollTop;
  return height;
}

export default function StudioWorkspace({data,initialState,height,onView,getCase,ClaimReview,OrderCell,CoverageWidget,ExceptionsWidget,BriefWidget,AdvisoryWidget,guideOpen,onGuideClose}){
  const [harness,setHarness]=useState(null);
  const [workspaceHeight,setWorkspaceHeight]=useState(()=>height||STUDIO_WORKSPACE_HEIGHT);
  const studioApi=useRef(null),fitTimer=useRef(0),workspaceRef=useRef(null);
  const getCaseRef=useRef(getCase);
  useEffect(()=>{getCaseRef.current=getCase;},[getCase]);

  // AG Studio lays widgets out on a fixed row grid. Increasing that grid once to a
  // guessed height just moves the nested scrollbar. Measure the actual panel content
  // instead and grow the rows until every section fits; the page then owns scrolling.
  const fitContent=useCallback(()=>{
    const api=studioApi.current,root=workspaceRef.current;
    if(!api||!root)return;
    const selectors={review:'#claim-review',coverage:'[aria-label="Source coverage"]',exceptions:'[aria-label="Exceptions and amounts"]',brief:'[aria-label="Recorded review brief"]',advisory:'[aria-label="AI advisory"]'};
    const contentHeights={};
    for(const [id,selector] of Object.entries(selectors)){
      const node=root.querySelector(selector);
      if(node)contentHeights[id]=intrinsicContentHeight(node);
    }
    const state=api.getState();
    const page=state.pages?.[0];
    if(!page)return;
    const next=fitStudioLayout({widgetLayout:page.widgetLayout,contentHeights,rowHeight:STUDIO_ROW_HEIGHT});
    const current=page.widgetLayout||{};
    const changed=Object.keys(next.layout).some(id=>{
      const a=current[id]||{},b=next.layout[id];
      return a.yTrack!==b.yTrack||a.ySpan!==b.ySpan||a.xTrack!==b.xTrack||a.xSpan!==b.xSpan;
    });
    if(changed){
      api.setState({...state,pages:state.pages.map((candidate,index)=>index===0?{...candidate,widgetLayout:next.layout}:candidate)});
    }
    setWorkspaceHeight(previous=>previous===next.height?previous:next.height);
  },[height]);

  useEffect(()=>{
    const root=workspaceRef.current;
    if(!root)return;
    const schedule=()=>{clearTimeout(fitTimer.current);fitTimer.current=setTimeout(fitContent,40);};
    schedule();
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(schedule);
    observer?.observe(root);
    root.querySelectorAll('section').forEach(node=>observer?.observe(node));
    const mutation=typeof MutationObserver==='undefined'?null:new MutationObserver(schedule);
    mutation?.observe(root,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['src','open','aria-busy']});
    root.addEventListener('load',schedule,true);
    window.addEventListener('resize',schedule);
    return()=>{clearTimeout(fitTimer.current);observer?.disconnect();mutation?.disconnect();root.removeEventListener('load',schedule,true);window.removeEventListener('resize',schedule);};
  },[data,initialState,guideOpen,fitContent]);

  const ready=useCallback(({api})=>{studioApi.current=api;setHarness(caseAssistant(onView,()=>getCaseRef.current?.())({api}));(typeof requestAnimationFrame==='function'?requestAnimationFrame:callback=>setTimeout(callback,0))(()=>fitContent());},[onView,fitContent]);
  useEffect(()=>()=>harness?.dispose?.(),[harness]);
  const widgets=useMemo(()=>createWidgets({additionalTypes:[{id:'connected-case',label:'Customer claim',defaultSize:{width:9,height:24},minSize:{width:7,height:20},form:p=>p.createDefaults({}),comp:ClaimReview},{id:'connected-coverage',label:'Source coverage',defaultSize:{width:8,height:10},minSize:{width:6,height:7},form:p=>p.createDefaults({}),comp:CoverageWidget},{id:'connected-exceptions',label:'Exceptions and amounts',defaultSize:{width:8,height:7},minSize:{width:6,height:5},form:p=>p.createDefaults({}),comp:ExceptionsWidget},{id:'connected-brief',label:'Recorded review brief',defaultSize:{width:8,height:7},minSize:{width:6,height:5},form:p=>p.createDefaults({}),comp:BriefWidget},{id:'connected-advisory',label:'AI advisory',defaultSize:{width:8,height:9},minSize:{width:6,height:7},form:p=>p.createDefaults({}),comp:AdvisoryWidget}],overrides:[{id:'grid',options:{createCellRenderer:field=>field.fieldId==='claims.order'?OrderCell:undefined}}]}),[ClaimReview,OrderCell,CoverageWidget,ExceptionsWidget,BriefWidget,AdvisoryWidget]);
  return <div ref={workspaceRef} className="rr-workspace grid min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white" style={{height:`${workspaceHeight}px`,maxHeight:'none',gridTemplateColumns:guideOpen?'minmax(0,1fr) 18rem':'minmax(0,1fr)'}}><div className="min-h-0 min-w-0"><AgStudio style={{height:'100%',width:'100%'}} data={data} widgets={widgets} theme={theme} initialState={initialState} mode="view" panels={{edit:{left:[],right:[]},view:{left:[],right:[]}}} onStudioReady={ready} onErrorRaised={event=>console.error('Studio:',event.errorDetails?.join('; ')||'Workspace error')}/></div><ClaimGuide harness={harness} open={guideOpen} onClose={onGuideClose}/></div>;
}
