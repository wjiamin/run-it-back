// Sharing a practice as a link, and opening one.
import {test, expect, cover, withSaved, openCover, presetShown, saved} from '../fixtures.js';

const A = 'AAAAAAAAAAA';
const toLocal = link => link.replace(/^https?:\/\/[^/]+\/(run-it-back\/)?/, '/');

async function makeLink(page, {withPlan}){
  await withSaved(page, [cover(A, {oneT: 1, one1: 1, one2: 17, oneBeats: 32, resume: {part: 'b1', rate: 1, label: 'block 1', counts: 40}})]);
  await openCover(page, A);
  await page.click('#presetSeg [data-preset=chill]');
  await page.click('#shareBtn');
  await expect(page.locator('#sharePlanInfo')).toContainText('Chill plan, 8 counts per block');
  if (!withPlan) await page.click('.switchRow');
  return page.inputValue('#shareLink');
}

test('the Share button shows only while practising, and Copy copies the link', async ({page, context}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await expect(page.locator('#shareBtn')).toBeHidden();
  const link = await makeLink(page, {withPlan: true});
  await expect(page.locator('#shareBtn')).toBeVisible();
  expect(link).toContain('#share=1&');
  expect(link).toContain('plan=chill');
  expect(link, 'progress is not shared').not.toContain('b1');
  await page.click('#shareCopy');
  await expect(page.locator('#shareMsg')).toHaveText(/Copied/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  await page.keyboard.press('Escape');
  await expect(page.locator('#sharePanel')).toBeHidden();
});

test('the plan switch takes the plan out of the link', async ({page}) => {
  const link = await makeLink(page, {withPlan: false});
  expect(link).not.toContain('plan=');
});

test('a new user opens a link with a plan: the beat, part and plan are set, ready to practise', async ({page, otherDevice: friend}) => {
  const link = await makeLink(page, {withPlan: true});
  await friend.goto(toLocal(link));
  await expect(friend.locator('#sharedCard')).toContainText('Shared practice');
  await expect(friend.locator('#sharedCard')).toContainText('120 BPM · 0:05–0:25 · 5 blocks');
  await expect(friend.locator('#sharedCard')).toContainText('Chill plan, 8 counts per block, for this video only');
  expect(friend.url(), 'the link is taken out of the address').not.toContain('share=');
  await friend.click('[data-sh=accept]');
  await expect(friend.locator('#tabPractice')).toHaveAttribute('aria-selected', 'true');
  expect(await presetShown(friend)).toBe('Chill');
  const v = (await saved(friend)).videos[A];
  expect([v.period, v.anchor, v.rangeStart, v.rangeEnd, v.one2, v.resume]).toEqual([0.5, 1, 5, 25, 17, undefined]);
  await friend.click('#sMain');
  await expect(friend.locator('#sTitle')).toHaveText('Block 1 of 5');
  await expect(friend.locator('#sSub')).toHaveText('0.5× · rep 1 of 4');
});

test('someone who already has the video can keep their own beat', async ({page}) => {
  const link = await makeLink(page, {withPlan: false});
  // the same device, but with its own beat for that video (100 BPM)
  await withSaved(page, [cover(A, {period: 0.6, anchor: 1, rangeStart: 5.2, rangeEnd: 20.2})]);
  await page.goto(toLocal(link));
  await expect(page.locator('#sharedCard')).toContainText('You already have this video');
  await page.click('[data-sh=mine]');
  await expect(page.locator('#viewPlayer')).toBeVisible();
  const v = (await saved(page)).videos[A];
  expect([v.period, v.rangeStart, v.rangeEnd]).toEqual([0.6, 5.2, 20.2]);
});

test('a broken link pasted into an open tab explains itself', async ({page}) => {
  await page.goto('/');
  await page.evaluate(() => { location.hash = 'share=1&v=bad'; });
  await expect(page.locator('#sharedCard')).toContainText("This share link doesn't work");
  await page.click('[data-sh=close]');
  await expect(page.locator('#sharedCard')).toBeHidden();
});
