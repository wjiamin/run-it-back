/* Share links: a cover's setup (the video, its beat and the trimmed part, and if wanted the practice plan) packed into
   a link, and read back. It never touches the page.

   Everything is after the "#", so it never reaches a server, not even GitHub: the link only goes where it is sent.
   Progress (where you got to) is never included.

   Version 1:
     #share=1 &v=<video id> &t=<title> &p=<seconds per beat> &a=<a beat's time> &r=<part start>~<part end>
              [&o=<the 1 the counts follow>] [&m=<first marked 1>~<later marked 1>~<beats between them>]
              [&n=<counts per block> &plan=<chill | standard | speed | custom>]
     a custom plan adds pb, pc, pt, pf (block, connect, from-the-top and whole-section speeds, as 0.5x3_0.75x3, with
     "off" after a speed that is switched off) and pg, pco, pto, pte, pfa, pls, plr, prest (see storage.js). */

import {clamp} from './util.js';
import {presets, presetOf} from './storage.js';

const ID = /^[A-Za-z0-9_-]{11}$/;
const STEP_LISTS = {pb: 'blockSteps', pc: 'connectSteps', pt: 'topSteps', pf: 'fullSteps'};
// custom plan numbers: [link key, settings key, lowest, highest] (the same limits as the Practice tab)
const PLAN_NUMBERS = [['pg', 'group', 2, 8], ['pte', 'topEvery', 1, 8], ['pls', 'leadStart', 0, 8], ['plr', 'leadRepeat', 0, 8],
  ['prest', 'rest', 0, 10]];
const PLAN_FLAGS = [['pco', 'connectOn'], ['pto', 'topOn'], ['pfa', 'fullAfter']];

const fix = (x, digits) => String(+x.toFixed(digits));
const stepsText = list => list.map(x => x.rate + 'x' + x.reps + (x.on ? '' : 'off')).join('_');

/**
 * The link for a cover. `base` is the app's address (for example location.origin + location.pathname).
 * With `settings`, the practice plan and counts per block go in too.
 */
export function makeShareLink(base, cover, settings){
  const q = new URLSearchParams();
  q.set('share', '1');
  q.set('v', cover.id);
  if (cover.title) q.set('t', cover.title.slice(0, 100));
  q.set('p', fix(cover.period, 6));
  q.set('a', fix(cover.anchor, 3));
  q.set('r', fix(cover.rangeStart, 3) + '~' + fix(cover.rangeEnd, 3));
  if (cover.oneT != null) q.set('o', fix(cover.oneT, 3));
  if (cover.one1 != null && cover.one2 != null && cover.oneBeats) q.set('m', fix(cover.one1, 3) + '~' + fix(cover.one2, 3) + '~' + cover.oneBeats);
  if (settings){
    q.set('n', settings.counts);
    const name = presetOf(settings);
    q.set('plan', name);
    if (name === 'custom'){
      for (const [key, list] of Object.entries(STEP_LISTS)) q.set(key, stepsText(settings[list]));
      for (const [key, name] of PLAN_NUMBERS) q.set(key, settings[name]);
      for (const [key, name] of PLAN_FLAGS) q.set(key, settings[name] ? 1 : 0);
    }
  }
  return base + '#' + q.toString();
}

/** Is this address's "#..." a share link (even a broken one)? */
export const isShareHash = hash => /^#?share=/.test(hash || '');

/**
 * Read a share link's "#..." part. Returns null if it isn't a usable share link, otherwise
 *   {id, title, beat: {period, anchor, oneT, one1, one2, oneBeats, rangeStart, rangeEnd}, plan, planName, counts}
 * where plan (the plan settings to apply), planName and counts are null when the link has no plan.
 */
export function parseShare(hash){
  if (!isShareHash(hash)) return null;
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  if (q.get('share') !== '1') return null;
  const id = q.get('v');
  if (!ID.test(id || '')) return null;
  const n = key => { const x = parseFloat(q.get(key)); return Number.isFinite(x) ? x : null; };
  const nums = key => (q.get(key) || '').split('~').map(parseFloat);

  const period = n('p'), anchor = n('a'), [rangeStart, rangeEnd] = nums('r');
  if (!(period >= 0.15 && period <= 2) || anchor == null) return null;   // 30 to 400 BPM
  if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || rangeStart < 0 || rangeEnd <= rangeStart) return null;
  const beat = {period, anchor, rangeStart, rangeEnd, oneT: n('o'), one1: null, one2: null, oneBeats: 0};
  const [one1, one2, oneBeats] = nums('m');
  if ([one1, one2, oneBeats].every(Number.isFinite) && oneBeats > 0){ Object.assign(beat, {one1, one2, oneBeats: Math.round(oneBeats)}); }
  else if (beat.oneT != null) beat.one1 = beat.oneT;

  const out = {id, title: (q.get('t') || '').slice(0, 100), beat, plan: null, planName: null, counts: null};
  const planName = q.get('plan');
  if (planName){
    const preset = presets()[planName];
    const plan = preset || (planName === 'custom' ? customPlan(q) : null);
    if (plan){
      out.plan = plan; out.planName = planName;
      out.counts = Math.round(clamp(n('n') || 8, 2, 16));
    }
  }
  return out;
}

/** A custom plan from the link, starting from Standard for anything missing or broken. */
function customPlan(q){
  const plan = presets().standard;
  for (const [key, list] of Object.entries(STEP_LISTS)){
    const text = q.get(key);
    if (text == null) continue;
    const steps = text === '' ? [] : text.split('_').map(s => {
      const m = /^([\d.]+)x(\d+)(off)?$/.exec(s);
      return m && {rate: clamp(Math.round(parseFloat(m[1]) * 100) / 100, 0.25, 2), on: !m[3], reps: clamp(+m[2] || 1, 1, 20)};
    });
    if (steps.every(Boolean)) plan[list] = steps;
  }
  for (const [key, name, lo, hi] of PLAN_NUMBERS){
    const x = parseFloat(q.get(key));
    if (Number.isFinite(x)) plan[name] = clamp(name === 'rest' ? Math.round(x * 2) / 2 : Math.round(x), lo, hi);
  }
  for (const [key, name] of PLAN_FLAGS) if (q.has(key)) plan[name] = q.get(key) === '1';
  return plan;
}
