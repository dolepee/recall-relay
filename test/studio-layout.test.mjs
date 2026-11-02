import assert from 'node:assert/strict';
import test from 'node:test';
import {STUDIO_ROW_HEIGHT,STUDIO_WIDGET_LAYOUT,STUDIO_WORKSPACE_HEIGHT,STUDIO_WORKSPACE_ROWS} from '../ui/studio-layout.mjs';

// The five-panel desk is taller than the old one-screen workspace. Page-level scrolling
// is intentional; the canvas must fit inside the workspace so AG Studio does not add a
// second, nested scrollbar around the queue, review and context rail.
test('the connected Studio layout keeps the primary review and context rail readable',()=>{
  const expected=['queue','review','coverage','exceptions','brief','advisory'];
  assert.deepEqual(Object.keys(STUDIO_WIDGET_LAYOUT),expected);
  const maxY=Math.max(...expected.map(id=>STUDIO_WIDGET_LAYOUT[id].yTrack+STUDIO_WIDGET_LAYOUT[id].ySpan));
  assert.equal(maxY,STUDIO_WORKSPACE_ROWS,'the workspace rows match the lowest panel');
  assert.ok(STUDIO_WORKSPACE_HEIGHT>maxY*STUDIO_ROW_HEIGHT,'the workspace is taller than the canvas');
  assert.equal(STUDIO_WORKSPACE_HEIGHT,maxY*STUDIO_ROW_HEIGHT+48);

  const queue=STUDIO_WIDGET_LAYOUT.queue,review=STUDIO_WIDGET_LAYOUT.review;
  assert.equal(queue.xTrack,0);
  assert.equal(review.xTrack,queue.xSpan,'the review follows the queue without a gap');
  assert.equal(review.xSpan,11,'the review keeps a wide primary column');
  assert.equal(review.xTrack+review.xSpan,17,'the context rail starts after the review');
  assert.equal(review.ySpan,47,'the review and queue use the full vertical canvas');

  for(const id of ['coverage','exceptions','brief','advisory']){
    const panel=STUDIO_WIDGET_LAYOUT[id];
    assert.equal(panel.xTrack,17,`${id} sits in the context rail`);
    assert.equal(panel.xSpan,7,`${id} keeps a readable rail width`);
    assert.ok(panel.ySpan>=9,`${id} is not compressed into a tiny row band`);
  }
  assert.equal(STUDIO_WIDGET_LAYOUT.coverage.yTrack,0);
  assert.equal(STUDIO_WIDGET_LAYOUT.exceptions.yTrack,12);
  assert.equal(STUDIO_WIDGET_LAYOUT.brief.yTrack,21);
  assert.equal(STUDIO_WIDGET_LAYOUT.advisory.yTrack,35);
  assert.equal(STUDIO_WIDGET_LAYOUT.advisory.yTrack+STUDIO_WIDGET_LAYOUT.advisory.ySpan,47);
});
