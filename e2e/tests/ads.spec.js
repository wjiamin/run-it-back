// Display ads (js/ads.js): off until set up; once on, only on the home page and the guides, and never an empty box.
import {test, expect, cover, withSaved, openCover} from '../fixtures.js';

const GUIDE = '/guides/how-to-count-dance-in-8-counts.html';
const ADS = /pagead2\.googlesyndication\.com/;
const ON = {client: 'ca-pub-0000000000000000', slots: {home: '111', guide: '222'}};
/** Switch ads on in the page, as the settings in ads.js would. */
const switchOn = (page, config = ON) => page.evaluate(c => import('/js/ads.js').then(m => m.setupAds(null, c)), config);
/** AdSense's script, played by a stand-in that just says it ran. */
const fakeAdSense = page => page.route(ADS, r => r.fulfill({contentType: 'text/javascript', body: 'window.__adsenseRan = true;'}));

test('ads are off until set up: no spaces show, and nothing is loaded from Google', async ({page}) => {
  const requests = [];
  page.on('request', r => { if (ADS.test(r.url())) requests.push(r.url()); });
  for (const path of ['/', GUIDE, '/privacy.html']){
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    for (const slot of await page.locator('.adSlot').all()) await expect(slot).toBeHidden();
  }
  await expect(page.locator('[data-ads]'), 'the privacy page doesn\'t mention ads').toBeHidden();
  expect(requests).toEqual([]);
});

test('switched on, a guide shows one labelled ad after the article', async ({page}) => {
  await fakeAdSense(page);
  await page.goto(GUIDE);
  await switchOn(page);
  const slot = page.locator('.adSlot[data-ad="guide"]');
  await expect(slot).toBeVisible();
  await expect(slot.locator('.adLabel')).toHaveText('Advertisement');
  const ins = slot.locator('ins.adsbygoogle');
  await expect(ins).toHaveAttribute('data-ad-client', ON.client);
  await expect(ins).toHaveAttribute('data-ad-slot', '222');
  expect(await page.evaluate(() => window.__adsenseRan && window.adsbygoogle.length)).toBe(1);
  const scriptSrc = await page.evaluate(() => document.querySelector('script[src*="googlesyndication"]').src);
  expect(scriptSrc).toContain('client=' + ON.client);
});

test('switched on, the home page has one ad space, and the video page has none', async ({page}) => {
  await fakeAdSense(page);
  await withSaved(page, [cover('AAAAAAAAAAA')]);
  await switchOn(page);
  await expect(page.locator('#viewHome .adSlot[data-ad="home"]')).toBeVisible();
  await openCover(page, 'AAAAAAAAAAA');
  expect(await page.locator('#viewPlayer .adSlot').count()).toBe(0);
});

test('a space without an ad unit, or a blocked ads script, leaves no empty box', async ({page}) => {
  await page.route(ADS, r => r.abort());
  await page.goto(GUIDE);
  await switchOn(page);
  await page.waitForTimeout(500);
  await expect(page.locator('.adSlot[data-ad="guide"]'), 'blocked').toBeHidden();

  await page.unroute(ADS);
  await fakeAdSense(page);
  await page.goto(GUIDE);
  await switchOn(page, {client: ON.client, slots: {home: '111', guide: ''}});
  await page.waitForTimeout(500);
  await expect(page.locator('.adSlot[data-ad="guide"]'), 'no ad unit for guides').toBeHidden();
});

test('switched on, the privacy page explains the ads', async ({page}) => {
  await page.goto('/privacy.html');
  await switchOn(page, {...ON, slots: {}});
  await expect(page.locator('[data-ads]')).toBeVisible();
  await expect(page.locator('[data-ads] h2')).toHaveText('Ads');
});
