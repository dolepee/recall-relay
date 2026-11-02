// The connected desk is content-sized. A 1280px reader should never have to
// discover the primary action by scrolling inside a panel: the Studio widgets grow
// to the measured height of their content, and the page supplies the only scroll.
export const STUDIO_ROW_HEIGHT=24;
export const STUDIO_WORKSPACE_ROWS=47;
export const STUDIO_WORKSPACE_HEIGHT=STUDIO_WORKSPACE_ROWS*STUDIO_ROW_HEIGHT+48;
export const STUDIO_WIDGET_MIN_ROWS=Object.freeze({
  queue:STUDIO_WORKSPACE_ROWS,
  review:STUDIO_WORKSPACE_ROWS,
  coverage:12,
  exceptions:9,
  brief:14,
  advisory:12,
});
export const STUDIO_WIDGET_LAYOUT={
  queue:{xTrack:0,yTrack:0,xSpan:6,ySpan:STUDIO_WIDGET_MIN_ROWS.queue},
  review:{xTrack:6,yTrack:0,xSpan:11,ySpan:STUDIO_WIDGET_MIN_ROWS.review},
  coverage:{xTrack:17,yTrack:0,xSpan:7,ySpan:STUDIO_WIDGET_MIN_ROWS.coverage},
  exceptions:{xTrack:17,yTrack:12,xSpan:7,ySpan:STUDIO_WIDGET_MIN_ROWS.exceptions},
  brief:{xTrack:17,yTrack:21,xSpan:7,ySpan:STUDIO_WIDGET_MIN_ROWS.brief},
  advisory:{xTrack:17,yTrack:35,xSpan:7,ySpan:STUDIO_WIDGET_MIN_ROWS.advisory},
};

const rowsFor=(id,contentHeights,rowHeight)=>Math.max(
  STUDIO_WIDGET_MIN_ROWS[id]||1,
  contentHeights[id]?Math.ceil((contentHeights[id]+2)/rowHeight):0,
);

// Pure layout calculation. `contentHeights` are measured scroll heights from the
// rendered panels; missing panels simply keep their minimum height. The review and
// queue share the full left column, while the context rail is stacked and can push
// the page taller than the review when a correction or long quote needs it.
export function fitStudioLayout({widgetLayout=STUDIO_WIDGET_LAYOUT,contentHeights={},rowHeight=STUDIO_ROW_HEIGHT}={}){
  const coverageRows=rowsFor('coverage',contentHeights,rowHeight);
  const exceptionRows=rowsFor('exceptions',contentHeights,rowHeight);
  const briefRows=rowsFor('brief',contentHeights,rowHeight);
  const advisoryRows=rowsFor('advisory',contentHeights,rowHeight);
  const reviewRows=Math.max(STUDIO_WORKSPACE_ROWS,rowsFor('review',contentHeights,rowHeight));
  const contextRows=coverageRows+exceptionRows+briefRows+advisoryRows;
  const rows=Math.max(reviewRows,contextRows,STUDIO_WORKSPACE_ROWS);
  const start=(id)=>widgetLayout[id]||{};
  const layout={
    queue:{...start('queue'),yTrack:0,ySpan:rows},
    review:{...start('review'),yTrack:0,ySpan:rows},
    coverage:{...start('coverage'),yTrack:0,ySpan:coverageRows},
    exceptions:{...start('exceptions'),yTrack:coverageRows,ySpan:exceptionRows},
    brief:{...start('brief'),yTrack:coverageRows+exceptionRows,ySpan:briefRows},
    advisory:{...start('advisory'),yTrack:coverageRows+exceptionRows+briefRows,ySpan:advisoryRows},
  };
  return {layout,rows,height:rows*rowHeight+48};
}
