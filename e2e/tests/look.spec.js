// The new look, tried out alongside the classic one (js/look.js, fan.css): the same app, restyled.
import {test, expect, cover, withSaved, openCover} from '../fixtures.js';

const look = page => page.evaluate(() => document.documentElement.dataset.look);
const fanCssOn = page => page.evaluate(() => { const l = document.getElementById('lookCss'); return !!l && !l.disabled; });
const bodyFont = page => page.evaluate(() => getComputedStyle(document.body).fontFamily);
const bodyBg = page => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('the classic look by default: the new one isn\'t loaded', async ({page}) => {
  const requests = [];
  page.on('request', r => { if (/fan\.css|\.woff2/.test(r.url())) requests.push(r.url()); });
  await page.goto('/');
  expect(await look(page)).toBe('classic');
  expect(await fanCssOn(page)).toBe(false);
  await expect(page.locator('#lookBtn')).toHaveText('Try the new look (beta)');
  expect(requests).toEqual([]);
});

test('the footer switches to the new look and back, and the choice is remembered on every page', async ({page}) => {
  await page.goto('/');
  const classicBg = await bodyBg(page);
  await page.click('#lookBtn');
  expect(await look(page)).toBe('fan');
  await expect.poll(() => bodyFont(page)).toContain('Instrument Sans');
  expect(await bodyBg(page), 'the new colours').not.toBe(classicBg);
  await expect(page.locator('#lookBtn')).toHaveText('Back to the classic look');

  await page.reload();
  expect(await look(page), 'remembered').toBe('fan');
  await page.goto('/guides/how-to-count-dance-in-8-counts.html');
  expect(await look(page), 'the guides too').toBe('fan');
  await expect.poll(() => bodyFont(page)).toContain('Instrument Sans');

  await page.goto('/');
  await page.click('#lookBtn');
  expect(await look(page)).toBe('classic');
  expect(await fanCssOn(page)).toBe(false);
  await expect.poll(() => bodyBg(page), 'the classic colours at once').toBe(classicBg);
});

test('a link can choose the look: ?look=fan, and ?look=classic back', async ({page}) => {
  await page.goto('/?look=fan');
  expect(await look(page)).toBe('fan');
  await page.goto('/');
  expect(await look(page), 'remembered from the link').toBe('fan');
  await page.goto('/?look=classic');
  expect(await look(page)).toBe('classic');
  await page.goto('/?look=nonsense');
  expect(await look(page), 'an unknown look is ignored').toBe('classic');
});

test('practice works the same in the new look, and the chosen speed stands out', async ({page}) => {
  await withSaved(page, [cover('AAAAAAAAAAA', {rangeStart: 1, rangeEnd: 3})]);
  await page.goto('/?look=fan');
  await openCover(page, 'AAAAAAAAAAA');
  await page.click('#sMain');
  await expect(page.locator('#playBtn')).toHaveText('❚❚', {timeout: 10_000});
  const speed = page.locator('#rateSeg button[aria-pressed=true]');
  const [bg, fg] = await speed.evaluate(b => [getComputedStyle(b).backgroundColor, getComputedStyle(b).color]);
  expect(bg, 'the selected speed is filled in').not.toBe(fg);
  expect(bg).not.toBe('rgb(255, 255, 255)');
});
