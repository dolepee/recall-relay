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

import {fitStudioLayout} from '../ui/studio-layout.mjs';

test('panel heights follow measured content instead of a guessed fixed height',()=>{
  const ownerFixture=fitStudioLayout({contentHeights:{review:1377,coverage:336,exceptions:214,brief:443,advisory:286}});
  assert.ok(ownerFixture.layout.review.ySpan >= 58,'the review row span covers 1,377px of content');
  assert.ok(ownerFixture.layout.coverage.ySpan >= 15,'source coverage covers 336px');
  assert.ok(ownerFixture.layout.brief.ySpan >= 19,'the review brief covers 443px');
  assert.equal(ownerFixture.height,ownerFixture.rows*24+48);
  assert.ok(ownerFixture.layout.advisory.yTrack+ownerFixture.layout.advisory.ySpan<=ownerFixture.rows,'the context rail fits inside the page');
  assert.equal(ownerFixture.layout.exceptions.yTrack,ownerFixture.layout.coverage.ySpan,'exceptions follow coverage');

  const guideOpen=fitStudioLayout({contentHeights:{review:1481,coverage:336,exceptions:310,brief:561,advisory:334}});
  assert.ok(guideOpen.layout.review.ySpan >= 63,'guide-open review covers 1,481px');
  assert.ok(guideOpen.layout.brief.ySpan >= 24,'guide-open brief covers 561px');
  assert.ok(guideOpen.rows>ownerFixture.rows,'opening the guide can grow the page rather than clip a panel');

  const short=fitStudioLayout({contentHeights:{review:500,coverage:120,exceptions:80,brief:100,advisory:100}});
  assert.equal(short.rows,47,'short panels keep the minimum readable workspace');
  assert.equal(short.layout.coverage.ySpan,12,'minimum context heights are preserved');
});
