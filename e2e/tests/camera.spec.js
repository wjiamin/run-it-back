// 📷 Me: your camera in a corner of the video (js/camera.js), using Chromium's pretend camera.
import {test, expect, cover, withSaved, openCover, saved} from '../fixtures.js';

test.use({permissions: ['camera']});
const A = 'AAAAAAAAAAA';
const cameraShowing = page => page.evaluate(() => {
  const v = document.querySelector('#meVideo');
  return !document.querySelector('#meBox').hidden && !!v.srcObject && v.videoWidth > 0;
});
const tracksLive = page => page.evaluate(() => window.__tracks ? window.__tracks.filter(t => t.readyState === 'live').length : -1);
/** Remember the camera tracks the app gets, to check they are really stopped. */
const watchTracks = () => {
  const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async c => { const s = await real(c); window.__tracks = s.getTracks(); return s; };
};

test('📷 Me shows you in a corner, and turns the camera off again', async ({page}) => {
  await page.addInitScript(watchTracks);
  await withSaved(page, [cover(A)]);
  await openCover(page, A);
  await page.click('#meBtn');
  await expect(page.locator('#meBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => cameraShowing(page)).toBe(true);
  expect(await page.locator('#meBox').getAttribute('class')).toContain('br');
  expect(await page.$eval('#meVideo', v => getComputedStyle(v).transform), 'mirrored').toBe('matrix(-1, 0, 0, 1, 0, 0)');
  await page.click('#meBtn');
  await expect(page.locator('#meBox')).toBeHidden();
  expect(await tracksLive(page), 'the camera is really off').toBe(0);
});

test('drag it to another corner: it goes to the nearest one and remembers it', async ({page}) => {
  await withSaved(page, [cover(A)]);
  await openCover(page, A);
  await page.click('#meBtn');
  await expect.poll(() => cameraShowing(page)).toBe(true);
  const stage = await page.locator('#stage').boundingBox(), box = await page.locator('#meBox').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(stage.x + 40, stage.y + 40, {steps: 8});   // towards the top left
  await page.mouse.up();
  await expect(page.locator('#meBox')).toHaveClass(/\btl\b/);
  expect((await saved(page)).settings.meCorner).toBe('tl');
  const after = await page.locator('#meBox').boundingBox();
  expect(after.x - stage.x).toBeLessThan(20); expect(after.y - stage.y).toBeLessThan(20);
});

test('tapping the camera window doesn\'t play or pause the video', async ({page}) => {
  await withSaved(page, [cover(A)]);
  await openCover(page, A);
  await page.click('#meBtn');
  await expect.poll(() => cameraShowing(page)).toBe(true);
  await page.click('#meBox', {position: {x: 20, y: 60}});
  await page.waitForTimeout(400);
  await expect(page.locator('#playBtn')).toHaveText('▶');
});

test('going back to the home page turns the camera off', async ({page}) => {
  await page.addInitScript(watchTracks);
  await withSaved(page, [cover(A)]);
  await openCover(page, A);
  await page.click('#meBtn');
  await expect.poll(() => cameraShowing(page)).toBe(true);
  await page.click('#backBtn');
  await expect.poll(() => tracksLive(page)).toBe(0);
  await openCover(page, A);
  await expect(page.locator('#meBox')).toBeHidden();
  await expect(page.locator('#meBtn')).toHaveAttribute('aria-pressed', 'false');
});

test('a blocked camera explains what to do', async ({page}) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
  await withSaved(page, [cover(A)]);
  await openCover(page, A);
  await page.click('#meBtn');
  await expect(page.locator('#meNote')).toHaveText(/camera is blocked/);
  await expect(page.locator('#meBtn')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#meBox')).toBeHidden();
});

test('the five buttons under the video fit a small phone', async ({page}) => {
  await page.setViewportSize({width: 320, height: 640});
  await withSaved(page, [cover(A)]);
  await openCover(page, A);
  const cut = await page.$$eval('#ctlOpts > .btn', bs => bs.filter(b => b.offsetParent && b.scrollWidth > b.clientWidth + 1).map(b => b.textContent));
  expect(cut, 'buttons whose text doesn\'t fit').toEqual([]);
});
