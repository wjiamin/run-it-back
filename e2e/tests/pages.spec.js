// Every page loads without errors and fits a phone screen; the home page's parts show when they should.
import {test, expect, cover, withSaved} from '../fixtures.js';

const pages = ['/', '/privacy.html', '/guides/', '/guides/how-to-learn-a-kpop-dance-cover.html',
  '/guides/mirror-youtube-video-for-dance.html', '/guides/slow-down-youtube-dance-video.html', '/guides/how-to-count-dance-in-8-counts.html'];

for (const path of pages){
  test('loads and fits a phone: ' + path, async ({page}) => {
    await page.setViewportSize({width: 320, height: 640});
    const res = await page.goto(path);
    expect(res.status()).toBe(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scrolling').toBe(true);
  });
}

test('every link between our pages works', async ({page, request}) => {
  const links = new Set();
  for (const path of pages){
    await page.goto(path);
    for (const href of await page.$$eval('a[href]', as => as.map(a => a.href))) if (href.startsWith('http://localhost')) links.add(href.split('#')[0]);
  }
  for (const link of links) expect((await request.get(link)).status(), link).toBe(200);
});

test('home: a new visitor sees no covers and no tip card; the tip card shows once they have a cover', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('#recentCard')).toBeHidden();
  await expect(page.locator('#homeTip')).toBeHidden();
  await withSaved(page, [cover('AAAAAAAAAAA', {resume: {part: 'b2', rate: 1, label: 'block 2', counts: 40}})]);
  await expect(page.locator('#recent')).toContainText('Up to block 2 · 120 BPM');
  await expect(page.locator('#homeTip')).toBeVisible();
});

test('home: the Debug log link in the footer opens the log', async ({page}) => {
  await page.goto('/');
  await page.click('#dbgFootBtn');
  await expect(page.locator('#dbgPanel')).toBeVisible();
  await expect(page.locator('#dbgText')).toHaveValue(/Run It Back debug report/);
});
