// The screen stays on while a video is open (js/wakelock.js), with a pretend wake lock that records what it's asked.
import {test, expect, cover, withSaved, openCover} from '../fixtures.js';

/** A pretend navigator.wakeLock, and a page visibility the test can change (window.__setVisible). */
function fakeWakeLock(){
  window.__lock = {requests: 0, releases: 0, current: null};
  let visible = 'visible';
  Object.defineProperty(document, 'visibilityState', {get: () => visible, configurable: true});
  window.__setVisible = on => {
    visible = on ? 'visible' : 'hidden';
    if (!on && window.__lock.current) window.__lock.current.release();   // the browser drops the lock when hidden
    document.dispatchEvent(new Event('visibilitychange'));
  };
  Object.defineProperty(navigator, 'wakeLock', {configurable: true, value: {
    request: async () => {
      window.__lock.requests++;
      const sentinel = new EventTarget();
      sentinel.release = async () => {
        if (sentinel.released) return;
        sentinel.released = true; window.__lock.releases++; window.__lock.current = null;
        sentinel.dispatchEvent(new Event('release'));
      };
      window.__lock.current = sentinel;
      return sentinel;
    },
  }});
}
const lockState = page => page.evaluate(() => ({requests: window.__lock.requests, releases: window.__lock.releases, on: !!window.__lock.current}));

test('the screen is kept on while a video is open, and let go on the home page', async ({page}) => {
  await page.addInitScript(fakeWakeLock);
  await withSaved(page, [cover('AAAAAAAAAAA')]);
  expect(await lockState(page), 'not on the home page').toEqual({requests: 0, releases: 0, on: false});
  await openCover(page, 'AAAAAAAAAAA');
  await expect.poll(() => lockState(page)).toEqual({requests: 1, releases: 0, on: true});
  await page.click('#dbgBtn');
  await expect(page.locator('#dbgText')).toHaveValue(/screen kept on: on/);
  await page.click('#dbgClose');
  await page.click('#backBtn');
  await expect.poll(() => lockState(page)).toEqual({requests: 1, releases: 1, on: false});
});

test('after switching apps, the screen is kept on again when you come back', async ({page}) => {
  await page.addInitScript(fakeWakeLock);
  await withSaved(page, [cover('AAAAAAAAAAA')]);
  await openCover(page, 'AAAAAAAAAAA');
  await expect.poll(() => lockState(page)).toMatchObject({on: true});
  await page.evaluate(() => window.__setVisible(false));
  await expect.poll(() => lockState(page), 'not asked for while hidden').toEqual({requests: 1, releases: 1, on: false});
  await page.evaluate(() => window.__setVisible(true));
  await expect.poll(() => lockState(page)).toEqual({requests: 2, releases: 1, on: true});
});

test('browsers without a wake lock work as before', async ({page}) => {
  await page.addInitScript(() => { delete Navigator.prototype.wakeLock; });
  await withSaved(page, [cover('AAAAAAAAAAA')]);
  await openCover(page, 'AAAAAAAAAAA');
  await page.click('#dbgBtn');
  await expect(page.locator('#dbgText')).toHaveValue(/screen kept on: not supported/);
});
