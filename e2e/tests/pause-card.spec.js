// While practice has the video paused, our card covers the middle of the picture, where YouTube draws its play button.
import {test, expect, cover, withSaved, openCover} from '../fixtures.js';

/** What is on top at the middle of the video. */
const onTopInMiddle = page => page.evaluate(() => {
  const r = document.querySelector('#stage').getBoundingClientRect();
  const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return el && (el.closest('#pauseCard') ? 'card' : el.id || el.className);
});

test('the card covers YouTube\'s play button in the break between runs, and tapping it skips the break', async ({page}) => {
  await withSaved(page, [cover('AAAAAAAAAAA', {rangeStart: 1, rangeEnd: 3})]);   // one short block (4 counts)
  await openCover(page, 'AAAAAAAAAAA');
  await expect(page.locator('#pauseCard')).toBeHidden();
  await page.click('#sMain');
  await expect(page.locator('#playBtn')).toHaveText('❚❚');
  await expect(page.locator('#pauseCard'), 'hidden while playing').toBeHidden();
  // the first run ends: a 2 s break, the video paused
  await expect(page.locator('#pauseCard')).toBeVisible({timeout: 25_000});
  await expect(page.locator('#pcHead')).toHaveText('Short break');
  await expect(page.locator('#pcAct')).toHaveText('▶ Skip pause');
  expect(await onTopInMiddle(page)).toBe('card');
  await page.click('#pauseCard');
  await expect(page.locator('#pauseCard')).toBeHidden();
  await expect(page.locator('#sSub')).toHaveText(/rep 2 of 3/);
});

test('pausing by tapping the video shows the card; tapping the card carries on', async ({page}) => {
  await withSaved(page, [cover('AAAAAAAAAAA')]);
  await openCover(page, 'AAAAAAAAAAA');
  await page.click('#sMain');
  await expect(page.locator('#playBtn')).toHaveText('❚❚');
  await page.click('#shield');
  await expect(page.locator('#pcHead')).toHaveText('Paused');
  await expect(page.locator('#pcAct')).toHaveText('▶ Resume');
  await page.click('#pauseCard');
  await expect(page.locator('#playBtn')).toHaveText('❚❚');
  await expect(page.locator('#pauseCard')).toBeHidden();
});

test('no card on the Beats tab, where you pause to see the exact frame', async ({page}) => {
  await withSaved(page, [cover('AAAAAAAAAAA')]);
  await openCover(page, 'AAAAAAAAAAA');
  await page.click('#sMain');
  await expect(page.locator('#playBtn')).toHaveText('❚❚');
  await page.click('#tabBeats');
  await page.click('#playBtn');
  await expect(page.locator('#playBtn')).toHaveText('▶');
  await expect(page.locator('#pauseCard')).toBeHidden();
  await page.click('#tabPractice');
  await expect(page.locator('#pauseCard')).toBeVisible();
});
