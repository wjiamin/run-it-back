/* A part that ends right at the end of the video (the bug from a debug report: 2:43.8 of a 2:44 video).
   Once YouTube reaches the end it ignores seeks, and playing restarts from 0:00, which stopped the practice.
   The fake player's video is 29.7 s long, and the part ends at 29.5 s. */
import {test, expect, cover, withSaved, openCover} from '../fixtures.js';

const endingPart = cover('AAAAAAAAAAA', {rangeStart: 25.5, rangeEnd: 29.5});

async function runWholeSection(page, delay){
  await page.addInitScript(ms => { window.__ytDelay = ms; }, delay);
  await withSaved(page, [endingPart]);
  await openCover(page, 'AAAAAAAAAAA');
  await page.click('#sFull');   // the whole section only: 0.75× twice, then 1× three times
  // both 0.75× runs, then on to 1×: the practice carries on instead of getting stuck at the end
  await expect(page.locator('#sSub')).toHaveText(/^1× · run [1-3] of 3$/, {timeout: 40_000});
  return page.evaluate(() => window.__yt.events);
}

test('runs finish just before the end of the video, so it never reaches the end', async ({page}) => {
  const events = await runWholeSection(page, 150);
  expect(events.filter(e => e[1] === 0), 'no ENDED').toEqual([]);
});

test('if the video does reach the end (a slow phone), it is reloaded at the next run and practice carries on', async ({page}) => {
  const events = await runWholeSection(page, 1000);
  expect(events.some(e => e[1] === 0), 'the slow player reached the end').toBe(true);
  expect(events.some(e => e[0] === 'load'), 'the video was reloaded').toBe(true);
  await page.click('#dbgBtn');
  await expect(page.locator('#dbgText')).toHaveValue(/video ended during practice: reloading it/);
});
