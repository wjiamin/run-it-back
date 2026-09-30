// Zooming in on your member (js/zoom.js): 🔍, drag, pinch, Ctrl + scroll and the keys; remembered per video.
import {test, expect, cover, withSaved, openCover, saved} from '../fixtures.js';

const A = 'AAAAAAAAAAA', B = 'BBBBBBBBBBB';
/** The layer's scale, and whether the video still covers its whole area (the view never leaves the picture). */
const zoomState = page => page.evaluate(() => {
  const m = new DOMMatrix(getComputedStyle(document.querySelector('#zoomLayer')).transform);
  const stage = document.querySelector('#stage').getBoundingClientRect(), wrap = document.querySelector('#playerWrap').getBoundingClientRect();
  const maskT = document.querySelector('#maskT').getBoundingClientRect(), maskB = document.querySelector('#maskB').getBoundingClientRect();
  // the picture is the wrap minus YouTube's title strips (hidden under the masks); it must cover the area between the masks
  const strip = 96 * m.a;
  return {s: +m.a.toFixed(3), covers: wrap.left <= stage.left + 1 && wrap.right >= stage.right - 1 &&
    wrap.top + strip <= maskT.bottom + 1 && wrap.bottom - strip >= maskB.top - 1};
});
const center = async page => { const b = await page.locator('#shield').boundingBox(); return {x: b.x + b.width / 2, y: b.y + b.height / 2, b}; };

test('🔍 zooms in on the middle, is remembered for that video only, and 🔍 again shows the whole picture', async ({page}) => {
  await withSaved(page, [cover(A), cover(B)]);
  await openCover(page, A);
  await page.click('#vZoomBtn');
  await expect(page.locator('#vZoomBtn')).toHaveAttribute('aria-pressed', 'true');
  expect(await zoomState(page)).toEqual({s: 2, covers: true});
  await expect.poll(async () => (await saved(page)).videos[A].zoom).toEqual({s: 2, cx: 0.5, cy: 0.5});
  await openCover(page, B);
  expect((await zoomState(page)).s, 'another video is not zoomed').toBe(1);
  await openCover(page, A);
  expect((await zoomState(page)).s, 'remembered').toBe(2);
  await page.click('#vZoomBtn');
  expect((await zoomState(page)).s).toBe(1);
  await expect.poll(async () => (await saved(page)).videos[A].zoom).toBeUndefined();
});

test('drag to move: it stops at the edge of the picture, and a drag doesn\'t play or pause', async ({page}) => {
  await withSaved(page, [cover(A)]);
  await openCover(page, A);
  await page.click('#vZoomBtn');
  const {x, y} = await center(page);
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 900, y + 900, {steps: 10}); await page.mouse.up();
  await page.waitForTimeout(450);
  expect(await zoomState(page), 'still covering the video area').toEqual({s: 2, covers: true});
  await expect.poll(async () => (await saved(page)).videos[A].zoom).toEqual({s: 2, cx: 0.25, cy: 0.25});
  await expect(page.locator('#playBtn'), 'the drag didn\'t start the video').toHaveText('▶');
  await page.mouse.click(x, y);
  await expect(page.locator('#playBtn'), 'a tap still plays').toHaveText('❚❚');
});

test('Ctrl + scroll zooms around the pointer; a plain scroll doesn\'t zoom', async ({page}) => {
  await withSaved(page, [cover(A)]);
  await openCover(page, A);
  const {x, y} = await center(page);
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -300);
  expect((await zoomState(page)).s, 'plain scroll').toBe(1);
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -300); await page.keyboard.up('Control');
  const s = (await zoomState(page)).s;
  expect(s).toBeGreaterThan(1.5); expect(s).toBeLessThan(2.5);
});

test('pinch with two fingers zooms in', async ({page}) => {
  await withSaved(page, [cover(A)]);
  await openCover(page, A);
  const {x, y} = await center(page);
  await page.evaluate(({x, y}) => {
    const el = document.querySelector('#shield');
    const fire = (type, id, px) => el.dispatchEvent(new PointerEvent(type, {pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: px, clientY: y, bubbles: true}));
    fire('pointerdown', 1, x - 20); fire('pointerdown', 2, x + 20);
    for (let d = 20; d <= 60; d += 10){ fire('pointermove', 1, x - d); fire('pointermove', 2, x + d); }
    fire('pointerup', 1, x - 60); fire('pointerup', 2, x + 60);
  }, {x, y});
  const s = (await zoomState(page)).s;
  expect(s, 'fingers three times as far apart: about 3×').toBeGreaterThan(2.5);
  expect((await zoomState(page)).covers).toBe(true);
});

test('keys: + zooms in, − out, 0 back to the whole picture; Mirror keeps the same dancer in view', async ({page}) => {
  await withSaved(page, [cover(A)]);
  await openCover(page, A);
  await page.locator('#stage').click({position: {x: 5, y: 5}}); await page.click('#playBtn');   // focus the page, keep paused
  await page.keyboard.press('+'); await page.keyboard.press('+');
  expect((await zoomState(page)).s).toBeCloseTo(1.5625, 2);
  await page.keyboard.press('-');
  expect((await zoomState(page)).s).toBeCloseTo(1.25, 2);
  await page.keyboard.press('0');
  expect((await zoomState(page)).s).toBe(1);
  // zoom in on the left, then mirror: the view moves to the right, where that dancer now is
  await page.evaluate(() => { document.querySelector('#vZoomBtn').click(); });
  const {b} = await center(page);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width, b.y + b.height / 2, {steps: 5}); await page.mouse.up();
  await expect.poll(async () => (await saved(page)).videos[A].zoom?.cx).toBe(0.25);
  await page.click('#mirrorBtn');
  await expect.poll(async () => (await saved(page)).videos[A].zoom?.cx).toBe(0.75);
});

test('the seek bar stays usable on a small phone, and 🔍 sits on the video, out of the camera window\'s way', async ({page}) => {
  await page.setViewportSize({width: 320, height: 640});
  await withSaved(page, [cover(A)]);
  await openCover(page, A);
  expect((await page.locator('#scrub').boundingBox()).width, 'seek bar width').toBeGreaterThan(60);
  const stage = await page.locator('#stage').boundingBox(), btn = await page.locator('#vZoomBtn').boundingBox();
  expect(btn.x - stage.x, 'bottom left').toBeLessThan(stage.width / 2);
  expect(btn.y - stage.y).toBeGreaterThan(stage.height / 2);
  // with the camera window in the bottom-left corner, the button moves to the right
  await page.evaluate(() => { const box = document.querySelector('#meBox'); box.classList.remove('br'); box.classList.add('bl'); box.hidden = false; });
  const moved = await page.locator('#vZoomBtn').boundingBox();
  expect(moved.x - stage.x, 'bottom right').toBeGreaterThan(stage.width / 2);
});
