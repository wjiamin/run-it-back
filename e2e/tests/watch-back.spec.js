// With 📷 Me on, each run is recorded; ▶ Watch back plays it side by side with the video, in step (js/recorder.js).
import {test, expect, cover, withSaved, openCover} from '../fixtures.js';

test.use({permissions: ['camera']});
const A = 'AAAAAAAAAAA';
const shortPart = cover(A, {rangeStart: 1, rangeEnd: 3});   // one block of 4 counts: a run takes about 8 s at 0.5×

async function practiseOneRun(page, {camera}){
  await withSaved(page, [shortPart]);
  await openCover(page, A);
  if (camera){ await page.click('#meBtn'); await expect(page.locator('#meBtn')).toHaveAttribute('aria-pressed', 'true'); }
  await page.click('#sMain');
  await expect(page.locator('#sSub')).toHaveText(/rep 2 of 3|Pause/, {timeout: 25_000});   // the first run is done
}

test('after a run, ▶ Watch back shows the video and your recording side by side, in step', async ({page}) => {
  await practiseOneRun(page, {camera: true});
  await expect(page.locator('#sWatch')).toBeVisible();
  await page.click('#sWatch');

  // side by side: the video in the left half, the recording in the right half
  await expect(page.locator('#reviewBar')).toBeVisible();
  await expect(page.locator('#reviewLbl')).toHaveText('You: block 1 at 0.5×');
  const stage = await page.locator('#stage').boundingBox();
  const video = await page.locator('#playerWrap').boundingBox(), takeBox = await page.locator('#takeVideo').boundingBox();
  expect(video.x + video.width, 'the video is in the left half').toBeLessThanOrEqual(stage.x + stage.width / 2 + 1);
  expect(Math.round(takeBox.x - stage.x), 'the recording is in the right half').toBe(Math.round(stage.width / 2));
  await expect(page.locator('#meBox'), 'the live corner is hidden meanwhile').toBeHidden();
  await expect(page.locator('#sMain'), 'practice has stopped').toHaveText(/Start practice|Continue/);

  // both play from the start of the run, at the speed practised, and stay in step
  await expect.poll(() => page.evaluate(() => !document.querySelector('#takeVideo').paused)).toBe(true);
  const sync = await page.evaluate(() => new Promise(r => setTimeout(() => {
    const p = window.__yt.player, v = document.querySelector('#takeVideo');
    r({rate: p.rate, videoT: p.t, takeT: v.currentTime});
  }, 1500)));
  expect(sync.rate).toBe(0.5);
  // at half speed the recording moves twice as fast as the video: it should be where the video was when recorded
  const take = await page.evaluate(() => window.__app.getTake());
  expect(sync.videoT, 'the video started from the run').toBeGreaterThanOrEqual(take.videoStart - 0.3);
  const expected = take.recordingStart + (sync.videoT - take.videoStart) / take.rate;
  expect(Math.abs(sync.takeT - expected), 'recording in step with the video').toBeLessThan(0.5);

  // it stops at the end of the run; Back to practice returns to the full-width video
  await expect.poll(() => page.evaluate(() => document.querySelector('#takeVideo').paused), {timeout: 15_000}).toBe(true);
  await expect(page.locator('#playBtn')).toHaveText('▶');
  await page.click('#reviewClose');
  await expect(page.locator('#reviewBar')).toBeHidden();
  await expect(page.locator('#takeVideo')).toBeHidden();
  const full = await page.locator('#playerWrap').boundingBox();
  expect(Math.round(full.width)).toBe(Math.round(stage.width));
  await expect(page.locator('#sWatch'), 'the take is still there to watch again').toBeVisible();
});

test('no camera, no recording: no Watch back', async ({page}) => {
  await practiseOneRun(page, {camera: false});
  await expect(page.locator('#sWatch')).toBeHidden();
});

test('the recording is forgotten when you leave the video', async ({page}) => {
  await practiseOneRun(page, {camera: true});
  await expect(page.locator('#sWatch')).toBeVisible();
  await page.click('#backBtn');
  await page.click('#recent [data-id="' + A + '"]');
  await expect(page.locator('#sWatch')).toBeHidden();
});

test('in full screen the watch-back buttons keep clear of the count and the controls', async ({page}) => {
  await page.setViewportSize({width: 844, height: 390});
  await practiseOneRun(page, {camera: true});
  await page.click('#sWatch');
  await page.click('#fsBtn');
  await expect(page.locator('#stage')).toHaveClass(/\bfs\b/);
  await page.waitForTimeout(400);
  const bar = await page.locator('#reviewBar').boundingBox(), count = await page.locator('#fsCount').boundingBox(), controls = await page.locator('#fsBar').boundingBox();
  expect(bar.y, 'below the count').toBeGreaterThanOrEqual(count.y + count.height);
  expect(bar.y + bar.height, 'above the controls').toBeLessThanOrEqual(controls.y);
});
