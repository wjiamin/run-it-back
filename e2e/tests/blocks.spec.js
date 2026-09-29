// The block buttons: every group of blocks lines up, whatever the phone width (two-digit labels used to wrap).
import {test, expect, cover, withSaved, openCover} from '../fixtures.js';

for (const width of [320, 360, 390, 430, 1280]){
  test('block groups line up at ' + width + ' px', async ({page}) => {
    await page.setViewportSize({width, height: 900});
    await page.addInitScript(() => { window.__ytDuration = 200; });
    await withSaved(page, [cover('AAAAAAAAAAA', {rangeStart: 1, rangeEnd: 97, dur: 200})]);   // 24 blocks, groups up to 21–24
    await openCover(page, 'AAAAAAAAAAA');
    const groups = await page.$$eval('#chips .cgrp', gs => gs.map(g => ({
      label: g.querySelector('.cl').textContent,
      oneLine: g.querySelector('.cl').getBoundingClientRect().height < 20,
      row: Math.round(g.getBoundingClientRect().top),                          // groups side by side share a row
      blocksTop: Math.round(g.querySelector('.chips').getBoundingClientRect().top),
    })));
    expect(groups.map(g => g.label)).toEqual(['1–4', '5–8', '9–12', '13–16', '17–20', '21–24']);
    for (const g of groups) expect(g.oneLine, g.label + ' label on one line').toBe(true);
    // in each row, every group's blocks start at the same height
    for (const g of groups){
      const first = groups.find(o => o.row === g.row);
      expect(g.blocksTop, 'blocks ' + g.label + ' line up with blocks ' + first.label).toBe(first.blocksTop);
    }
  });
}
