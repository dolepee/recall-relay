import {studioTheme} from 'ag-studio';
const ink='#142337',paper='#F5F7FA',card='#FFFFFF',cobalt='#315CF5',rule='#DEE5EE',ruleStrong='#C3CEDC',muted='#596779';
export const merchantStudioTheme=studioTheme.withParams({
  accentColor:cobalt,backgroundColor:paper,foregroundColor:ink,textColor:ink,subtleTextColor:muted,
  borderColor:rule,borderWidth:1,borderRadius:12,fontFamily:'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',fontSize:14,
  studioMinWidth:280,studioMinHeight:400,studioCanvasMinWidth:280,
  studioWrapperBackgroundColor:paper,studioWrapperBorder:[1,rule],studioWrapperBorderRadius:12,
  studioCanvasBackgroundColor:paper,studioCanvasBorder:[1,rule],studioCanvasBorderRadius:12,studioCanvasGridLineColor:'#EEF2F7',
  studioWidgetBackgroundColor:card,studioWidgetBorder:[1,rule],studioWidgetBorderRadius:12,studioWidgetPadding:0,
  studioWidgetTitleTextColor:ink,studioWidgetTitleFontSize:16,studioWidgetTitleFontWeight:600,
  studioWidgetSubtitleTextColor:muted,studioWidgetCaptionTextColor:muted,
  gridAccentColor:cobalt,gridFontFamily:'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',gridFontSize:14,gridCellTextColor:ink,
  gridHeaderBackgroundColor:'#EEF2F7',gridHeaderTextColor:ink,gridHeaderFontFamily:'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',gridHeaderFontSize:12,gridHeaderFontWeight:600,
  gridDataBackgroundColor:card,gridOddRowBackgroundColor:card,gridRowBorder:[1,'#DEE5EE'],gridHeaderRowBorder:[2,ruleStrong],gridRowHeight:56,
});
