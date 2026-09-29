/* Shared set-up for the browser tests. Every page:
     - gets the pretend YouTube player (fake-youtube.js) instead of YouTube's, and a stand-in picture for thumbnails
     - has visit counting blocked, so tests never reach GoatCounter
     - collects page errors in `errors`; each test checks it is empty at the end
   and helpers to put saved covers on the device and open one. */
import {test as base, expect} from '@playwright/test';
import fs from 'node:fs';

const fakeYouTube = fs.readFileSync(new URL('./fake-youtube.js', import.meta.url), 'utf8');
const picture = fs.readFileSync(new URL('../icons/icon-192.png', import.meta.url));

/** Set a page up as above. Page errors are added to `errors`. */
export async function prepare(page, errors){
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://www.youtube.com/iframe_api', r => r.fulfill({body: fakeYouTube, contentType: 'text/javascript'}));
  await page.route('https://i.ytimg.com/**', r => r.fulfill({body: picture, contentType: 'image/png'}));
  await page.route('https://gc.zgo.at/**', r => r.abort());
}

export const test = base.extend({
  errors: async ({}, use) => { await use([]); },
  page: async ({page, errors}, use) => {
    await prepare(page, errors);
    await use(page);
    expect(errors, 'page errors').toEqual([]);
  },
  /** A second device: its own browser, with nothing saved. Its page errors count too. */
  otherDevice: async ({browser, errors}, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await prepare(page, errors);
    await use(page);
    await context.close();
  },
});
export {expect};

/** A saved cover with its beat set: 120 BPM, the part 0:05 to 0:25 (5 blocks of 8), in a 29.7 s video. */
export const cover = (id, extra = {}) => ({id, title: 'Song ' + id[0], period: 0.5, anchor: 1, rangeStart: 5, rangeEnd: 25, dur: 29.7,
  updated: Date.now(), ...extra});

/** Start the app with these saved covers (and settings; null = defaults), as if they were saved earlier. */
export async function withSaved(page, videos, settings = null){
  await page.goto('/');
  await page.evaluate(save => localStorage.setItem('coverLearner.v1', JSON.stringify(save)),
    {settings, videos: Object.fromEntries(videos.map(v => [v.id, v]))});
  await page.reload();
}

/** Open a saved cover from My covers (going back home first if a video is open). */
export async function openCover(page, id){
  if (await page.isVisible('#backBtn')) await page.click('#backBtn');
  await page.click(`#recent [data-id="${id}"]`);
  await expect(page.locator('#viewPlayer')).toBeVisible();
}

/** The preset button lit up, or 'custom'. */
export const presetShown = page => page.locator('#presetSeg [aria-pressed=true]').textContent({timeout: 1000}).catch(() => 'custom');

/** What the app has saved on the device. */
export const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('coverLearner.v1')));
