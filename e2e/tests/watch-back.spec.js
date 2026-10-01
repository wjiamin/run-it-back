// The Record tab: record yourself over one piece of the video, then ▶ Watch back plays it side by side with the video,
// in step (js/recorder.js).
import {test, expect, cover, withSaved, openCover} from '../fixtures.js';

test.use({permissions: ['camera']});
const A = 'AAAAAAAAAAA';
const shortPart = cover(A, {rangeStart: 1, rangeEnd: 3});

async function recordTab(page){
  await withSaved(page, [shortPart]);
  await openCover(page, A);
  await page.click('#tabRecord');
  await expect(page.locator('#panelRecord')).toBeVisible();
}
async function cameraOn(page){
  await page.click('#rCam');
  await expect(page.locator('#rCam')).toHaveText('📷 Turn camera off');
  await expect(page.locator('#meBox')).toBeVisible();
}
/** ⏺ Record, through the countdown, until the video plays. */
async function startRecording(page){
  await page.click('#rRec');
  await expect(page.locator('#rRec')).toHaveText('■ Stop');
  await expect(page.locator('#playBtn'), 'the video plays after the countdown').toHaveText('❚❚', {timeout: 6000});
}

test('record yourself: a countdown, then it plays and records until you pause', async ({page}) => {
  await recordTab(page);
  await expect(page.locator('#rStatus')).toHaveText('Turn on your camera to start.');
  await expect(page.locator('#rRec')).toBeDisabled();
  await cameraOn(page);
  await expect(page.locator('#rRec')).toBeEnabled();

  await page.click('#rRec');
  await expect(page.locator('#rStatus')).toHaveText(/^Get ready… [123]$/);
  await expect(page.locator('#cue'), 'the countdown shows on the video').toHaveText(/^[123]$/);
  await expect(page.locator('#playBtn'), 'the video waits for the countdown').toHaveText('▶');
  await expect(page.locator('#meBox')).toHaveClass(/\brecording\b/);
  await expect(page.locator('#meBox .meRecBadge')).toBeVisible();
  await expect(page.locator('#playBtn')).toHaveText('❚❚', {timeout: 6000});
  await expect(page.locator('#rStatus')).toHaveText(/^● Recording \d:\d\d$/);
  await page.waitForTimeout(2500);

  await page.click('#playBtn');   // pausing ends it
  await expect(page.locator('#rRec')).toHaveText('⏺ Record');
  await expect(page.locator('#meBox .meRecBadge')).toBeHidden();
  await expect(page.locator('#rStatus')).toHaveText(/^Recorded 0:0\d–0:0\d of the video/);
  await expect(page.locator('#rWatch')).toBeVisible();
  const take = await page.evaluate(() => window.__app.getTake());
  expect(take.videoStart).toBeLessThan(1);
  expect(take.videoEnd - take.videoStart).toBeGreaterThan(1.5);
});

test('▶ Watch back shows the video and your recording side by side, in step, at the speed recorded', async ({page}) => {
  await recordTab(page);
  await cameraOn(page);
  await page.click('#rateSeg button[data-r="0.5"]');
  await startRecording(page);
  await page.waitForTimeout(4000);
  await page.click('#rRec');   // ■ Stop
  await expect(page.locator('#rWatch')).toBeVisible();
  const take = await page.evaluate(() => window.__app.getTake());
  expect(take.rate).toBe(0.5);

  await page.click('#rateSeg button[data-r="1"]');
  await page.locator('#scrub').fill('700');   // somewhere else
  await page.evaluate(() => { window.__seeks = 0; document.querySelector('#takeVideo').addEventListener('seeking', () => window.__seeks++); });
  await page.click('#rWatch');

  // side by side: the video in the left half, the recording in the right half
  await expect(page.locator('#reviewBar')).toBeVisible();
  await expect(page.locator('#reviewLbl')).toHaveText(/^You: 0:0\d–0:0\d$/);
  const stage = await page.locator('#stage').boundingBox();
  const video = await page.locator('#playerWrap').boundingBox(), takeBox = await page.locator('#takeVideo').boundingBox();
  expect(video.x + video.width, 'the video is in the left half').toBeLessThanOrEqual(stage.x + stage.width / 2 + 1);
  expect(Math.round(takeBox.x - stage.x), 'the recording is in the right half').toBe(Math.round(stage.width / 2));
  await expect(page.locator('#meBox'), 'the live camera is hidden meanwhile').toBeHidden();

  // both play from the start of the piece, at the speed recorded, and stay in step
  await expect.poll(() => page.evaluate(() => !document.querySelector('#takeVideo').paused)).toBe(true);
  await page.waitForTimeout(1500);
  const sync = await page.evaluate(() => ({rate: window.__yt.player.rate, videoT: window.__yt.player.t, takeT: document.querySelector('#takeVideo').currentTime}));
  expect(sync.rate).toBe(0.5);
  expect(sync.videoT, 'the video went back to the piece').toBeLessThan(take.videoEnd);
  // at half speed the recording moves twice as fast as the video: it should be where the video was when recorded
  expect(Math.abs(sync.takeT - (take.recordingStart + (sync.videoT - take.videoStart) / take.rate)), 'in step').toBeLessThan(0.5);

  // it stops at the end of the piece, without having jumped the recording about (phones stall when it does)
  await expect.poll(() => page.evaluate(() => document.querySelector('#takeVideo').paused), {timeout: 10_000}).toBe(true);
  await expect(page.locator('#playBtn')).toHaveText('▶');
  expect(await page.evaluate(() => window.__seeks), 'the recording jumped only to its start').toBeLessThanOrEqual(2);

  // Done returns to the full-width video
  await page.click('#reviewClose');
  await expect(page.locator('#reviewBar')).toBeHidden();
  await expect(page.locator('#takeVideo')).toBeHidden();
  const full = await page.locator('#playerWrap').boundingBox();
  expect(Math.round(full.width)).toBe(Math.round(stage.width));
  await expect(page.locator('#rWatch'), 'the recording is still there to watch again').toBeVisible();
});

test('■ during the countdown: nothing is recorded, and it says why', async ({page}) => {
  await recordTab(page);
  await cameraOn(page);
  await page.click('#rRec');
  await page.click('#rRec');
  await expect(page.locator('#rStatus')).toContainText('the video has to play while you record');
  await expect(page.locator('#cue')).toBeHidden();
  await page.waitForTimeout(3500);
  await expect(page.locator('#playBtn'), 'the video doesn\'t start after all').toHaveText('▶');
  await expect(page.locator('#rWatch')).toBeHidden();
});

test('a jump while recording ends the recording there', async ({page}) => {
  await recordTab(page);
  await cameraOn(page);
  await startRecording(page);
  await page.waitForTimeout(2000);
  await page.locator('#scrub').fill('700');
  await expect(page.locator('#rRec')).toHaveText('⏺ Record');
  await expect.poll(() => page.evaluate(() => window.__app.getTake()?.videoEnd)).toBeLessThan(4);
});

test('turning the camera off while recording keeps what was recorded', async ({page}) => {
  await recordTab(page);
  await cameraOn(page);
  await startRecording(page);
  await page.waitForTimeout(2000);
  await page.click('#rCam');
  await expect(page.locator('#meBox')).toBeHidden();
  await expect(page.locator('#rWatch')).toBeVisible();
});

test('practice doesn\'t record, even with the camera on', async ({page}) => {
  await withSaved(page, [shortPart]);
  await openCover(page, A);
  await page.click('#meBtn');
  await expect(page.locator('#meBtn')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#sMain');
  await expect(page.locator('#sSub')).toHaveText(/rep 2 of 3|Pause/, {timeout: 25_000});   // a run is done
  await expect(page.locator('#meBox')).not.toHaveClass(/\brecording\b/);
  expect(await page.evaluate(() => window.__app.getTake())).toBeNull();
});

test('the recording is forgotten when you leave the video', async ({page}) => {
  await recordTab(page);
  await cameraOn(page);
  await startRecording(page);
  await page.waitForTimeout(1500);
  await page.click('#rRec');
  await expect(page.locator('#rWatch')).toBeVisible();
  await page.click('#backBtn');
  await page.click('#recent [data-id="' + A + '"]');
  await page.click('#tabRecord');
  await expect(page.locator('#rWatch')).toBeHidden();
  await expect(page.locator('#rStatus')).toHaveText('Turn on your camera to start.');
});

test('in full screen the watch-back buttons keep clear of the count and the controls', async ({page}) => {
  await page.setViewportSize({width: 844, height: 390});
  await recordTab(page);
  await cameraOn(page);
  await startRecording(page);
  await page.waitForTimeout(1500);
  await page.click('#rRec');
  await page.click('#rWatch');
  await page.click('#fsBtn');
  await expect(page.locator('#stage')).toHaveClass(/\bfs\b/);
  await page.waitForTimeout(400);
  const bar = await page.locator('#reviewBar').boundingBox(), count = await page.locator('#fsCount').boundingBox(), controls = await page.locator('#fsBar').boundingBox();
  expect(bar.y, 'below the count').toBeGreaterThanOrEqual(count.y + count.height);
  expect(bar.y + bar.height, 'above the controls').toBeLessThanOrEqual(controls.y);
});
