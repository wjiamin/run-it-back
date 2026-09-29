// Each video has its own practice plan.
import {test, expect, cover, withSaved, openCover, presetShown, saved} from '../fixtures.js';

const A = 'AAAAAAAAAAA', B = 'BBBBBBBBBBB', C = 'CCCCCCCCCCC';
// a save from before plans were per video: one app-wide plan, Speed run
const oldSettings = {counts: 8, mirror: true, v: 2, blockSteps: [{rate: 0.75, on: true, reps: 2}, {rate: 1, on: true, reps: 2}],
  connectSteps: [{rate: 1, on: true, reps: 2}], fullSteps: [{rate: 1, on: true, reps: 2}], topSteps: [{rate: 1, on: true, reps: 1}],
  connectOn: true, group: 4, topOn: true, topEvery: 4, fullAfter: true, auto: true, musicBlocks: true, musicFull: true,
  leadStart: 4, leadRepeat: 2, rest: 1};

test('videos keep their own plans, and new videos start with the plan used last', async ({page}) => {
  await withSaved(page, [cover(A), cover(B)], oldSettings);
  await openCover(page, A);
  expect(await presetShown(page), 'kept its plan after the upgrade').toBe('Speed run');
  await page.click('#presetSeg [data-preset=chill]');

  await openCover(page, B);
  expect(await presetShown(page), 'changing A left B alone').toBe('Speed run');
  await page.locator('#planMore summary').click();
  await page.fill('#optCounts', '4'); await page.dispatchEvent('#optCounts', 'change');
  await expect(page.locator('#rangeInfo')).toHaveText('40 counts · 10 blocks');

  await openCover(page, A);
  expect(await presetShown(page)).toBe('Chill');
  await expect(page.locator('#rangeInfo'), 'B\'s counts per block left A alone').toHaveText('40 counts · 5 blocks');

  await page.click('#backBtn');
  await page.fill('#urlInput', 'https://youtu.be/' + C); await page.click('#loadForm button');
  expect(await presetShown(page), 'a new video starts with the plan used last').toBe('Chill');
});

test('a shared plan changes only the shared video', async ({page}) => {
  await withSaved(page, [cover(A), cover(B)], oldSettings);
  await page.evaluate(() => { location.hash = 'share=1&v=AAAAAAAAAAA&t=Song+A&p=0.5&a=1&r=5~25&n=8&plan=standard'; });
  await expect(page.locator('#sharedCard')).toContainText('for this video only');
  await page.click('[data-sh=accept]');
  expect(await presetShown(page)).toBe('Standard');
  await openCover(page, B);
  expect(await presetShown(page)).toBe('Speed run');
  const plans = Object.values((await saved(page)).videos).map(v => v.id[0] + v.plan.group + '/' + v.plan.topEvery);
  expect(plans.sort()).toEqual(['A4/1', 'B4/4']);
});
