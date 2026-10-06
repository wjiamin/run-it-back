// "Listen for the beat" (js/listen.js, js/tempo.js): the phone hears the tempo through the microphone; tapping or
// typing still overrides it. The microphone is played by a made-up click track, so the real listening code runs.
import {test, expect, cover, withSaved, openCover} from '../fixtures.js';

const A = 'AAAAAAAAAAA';
const noBeat = cover(A, {period: 0, anchor: null, rangeStart: null, rangeEnd: null});

/** The microphone hears a steady beat at `bpm` (0: silence), or is refused (`error`). */
function fakeMic(page, {bpm = 0, error = ''} = {}){
  return page.addInitScript(({bpm, error}) => {
    navigator.mediaDevices.getUserMedia = async () => {
      if (error) throw new DOMException('refused', error);
      const ctx = new AudioContext(), dest = ctx.createMediaStreamDestination();
      if (bpm){
        const beat = 60 / bpm, start = ctx.currentTime + 0.1;
        for (let i = 0; i < 30 / beat; i++){
          for (const [freq, t, amp] of [[90, start + i * beat, 0.9], [3000, start + i * beat, 0.3], [5000, start + (i + 0.5) * beat, 0.15]]){
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(amp, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
            osc.connect(gain).connect(dest); osc.start(t); osc.stop(t + 0.1);
          }
        }
      }
      return dest.stream;
    };
  }, {bpm, error});
}

async function beatsTab(page){
  await withSaved(page, [noBeat]);
  await openCover(page, A);
  await expect(page.locator('#panelBeats')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__yt.events.length), 'the video player is ready').toBeGreaterThan(0);
  await expect(page.locator('#bpmLbl')).toHaveText('–');
}

test('Listen plays the video at 1×, hears the tempo and sets it; half or double is one tap away', async ({page}) => {
  await fakeMic(page, {bpm: 124});
  await beatsTab(page);
  await page.click('#listenBtn');
  await expect(page.locator('#listenBtn')).toHaveText('Stop listening');
  await expect(page.locator('#listenMsg')).toContainText('Listening');
  await expect(page.locator('#playBtn'), 'the video plays').toHaveText('❚❚');
  expect(await page.evaluate(() => window.__yt.player.rate), 'at its real speed').toBe(1);

  await expect(page.locator('#listenMsg')).toHaveText(/^Heard about 1\d\d\.\d BPM\. Now mark the 1/, {timeout: 25_000});
  const heard = parseFloat(await page.locator('#bpmLbl').textContent());
  expect(Math.abs(heard - 124), 'within a BPM or so').toBeLessThan(1.5);
  await expect(page.locator('#listenBtn')).toHaveText('Listen for the beat');
  expect(await page.evaluate(() => window.__yt.player.rate), 'back to the speed before').toBe(0.5);

  await expect(page.locator('#listenAlt')).toBeVisible();
  const double = page.locator('[data-listen-bpm]').nth(1);
  await expect(double).toHaveText(/^2\d\d\.\d BPM$/);
  await double.click();
  expect(Math.abs(parseFloat(await page.locator('#bpmLbl').textContent()) - 2 * heard)).toBeLessThan(0.2);

  // typing still overrides it
  await page.fill('#bpmIn', '100');
  await page.click('#bpmSet');
  await expect(page.locator('#bpmLbl')).toHaveText('100.0 BPM');
});

test('silence: it says the music couldn\'t be heard, and sets nothing', async ({page}) => {
  await fakeMic(page);
  await beatsTab(page);
  await page.click('#listenBtn');
  await expect(page.locator('#listenMsg')).toHaveText(/Couldn't hear the music/, {timeout: 25_000});
  await expect(page.locator('#listenMsg')).toHaveClass(/problem/);
  await expect(page.locator('#bpmLbl')).toHaveText('–');
  await expect(page.locator('#listenAlt')).toBeHidden();
});

test('a blocked microphone explains what to do', async ({page}) => {
  await fakeMic(page, {error: 'NotAllowedError'});
  await beatsTab(page);
  await page.click('#listenBtn');
  await expect(page.locator('#listenMsg')).toHaveText(/microphone is blocked/);
  await expect(page.locator('#listenBtn')).toHaveText('Listen for the beat');
});

test('Stop listening stops straight away and sets nothing', async ({page}) => {
  await fakeMic(page, {bpm: 124});
  await beatsTab(page);
  await page.click('#listenBtn');
  await expect(page.locator('#listenMsg')).toContainText('Listening');
  await page.waitForTimeout(1500);
  await page.click('#listenBtn');
  await expect(page.locator('#listenBtn')).toHaveText('Listen for the beat');
  await expect(page.locator('#listenMsg')).toHaveText('');
  await expect(page.locator('#bpmLbl')).toHaveText('–');
});
