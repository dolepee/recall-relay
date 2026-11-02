// The default connected workspace is deliberately taller than a 1280x720 viewport.
// Five detailed panels need page-level scrolling; squeezing them into one screen creates
// several tiny nested scrollers and the queue can lose its virtualised rows.
export const STUDIO_ROW_HEIGHT=24;
export const STUDIO_WORKSPACE_ROWS=47;
export const STUDIO_WORKSPACE_HEIGHT=STUDIO_WORKSPACE_ROWS*STUDIO_ROW_HEIGHT+48;
export const STUDIO_WIDGET_LAYOUT={
  queue:{xTrack:0,yTrack:0,xSpan:6,ySpan:47},
  review:{xTrack:6,yTrack:0,xSpan:11,ySpan:47},
  coverage:{xTrack:17,yTrack:0,xSpan:7,ySpan:12},
  exceptions:{xTrack:17,yTrack:12,xSpan:7,ySpan:9},
  brief:{xTrack:17,yTrack:21,xSpan:7,ySpan:14},
  advisory:{xTrack:17,yTrack:35,xSpan:7,ySpan:12},
};
