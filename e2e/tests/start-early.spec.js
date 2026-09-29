// Pressing Start while the video is still loading (the player isn't ready yet) must still start the practice.
import {test, expect, cover, withSaved, openCover} from '../fixtures.js';

test('Start pressed before the video has loaded: practice starts once it is ready', async ({page}) => {
  await page.addInitScript(() => { window.__ytReady = 2000; });   // a slow connection
  await withSaved(page, [cover('AAAAAAAAAAA')]);
  await openCover(page, 'AAAAAAAAAAA');
  await page.click('#sMain');   // straight away, while it still says "Loading video…"
  await expect(page.locator('#sTitle')).toHaveText('Block 1 of 5');
  // the video actually plays: the count moves on from the count-in into the block
  await expect.poll(() => page.evaluate(() => window.__yt.player && window.__yt.player.t), {timeout: 15_000}).toBeGreaterThan(5.5);
});
