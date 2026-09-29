// Fixing the beat in the middle of practising: small and bigger fixes keep your place; counting twice as fast starts again.
import {test, expect, cover, withSaved, openCover, saved} from '../fixtures.js';

const A = 'AAAAAAAAAAA';

/** Practise up to block 3 (as saved earlier), start it, then open the Beats tab. */
async function practisingBlock3(page){
  await withSaved(page, [cover(A, {oneT: 1, one1: 1, one2: 17, oneBeats: 32, rangeStart: 1, rangeEnd: 29,
    resume: {part: 'b3', rate: 0.5, label: 'block 3', counts: 8, rangeStart: 1, rangeEnd: 29, blocks: 7}})]);
  await openCover(page, A);
  await expect(page.locator('#sMain')).toHaveText('Continue from block 3');
  await page.click('#sMain');
  await expect(page.locator('#sTitle')).toHaveText('Block 3 of 7');
  await page.click('#tabBeats');
}
const backToPractice = async page => { await page.click('#tabPractice'); return page.locator('#sMain'); };

test('a small timing nudge keeps your place', async ({page}) => {
  await practisingBlock3(page);
  await page.click('[data-nudge="0.02"]');
  await expect(await backToPractice(page)).toHaveText('Continue from block 3');
});

test('marking the 1 again keeps your place', async ({page}) => {
  await practisingBlock3(page);
  // pause, and mark the 1 half a beat later than before (a later 1 is marked too, so this also changes the tempo a little)
  await page.evaluate(() => window.__yt.player.pauseVideo());
  await expect(page.locator('#playBtn')).toHaveText('▶');
  await page.evaluate(() => { window.__yt.player.t = 1.25; });
  await page.click('#markOne1');
  expect((await saved(page)).videos[A].one1, 'the new 1 was marked').toBeCloseTo(1.25, 2);
  await expect(await backToPractice(page)).toHaveText('Continue from block 3');
});

test('counting twice as fast starts again (the blocks are different)', async ({page}) => {
  await practisingBlock3(page);
  await page.click('#dblBtn');
  await expect(await backToPractice(page)).toHaveText('Start practice');
});
