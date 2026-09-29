// The logic tests in tests.html (js/tests.js), run in a browser so they're part of the same run.
import {test, expect} from '../fixtures.js';

test('the logic tests in tests.html all pass', async ({page}) => {
  await page.goto('/tests.html');
  await expect(page.locator('#summary')).toHaveText(/tests (passed|failed)/);
  const failed = await page.evaluate(() => window.testResults.filter(r => !r.ok).map(r => r.name + ': ' + r.error));
  expect(failed).toEqual([]);
});
