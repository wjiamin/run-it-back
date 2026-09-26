/* Tests for the modules that don't touch the page. Open tests.html (served, like the app) to run them. */

import {parseYouTubeId, fmtTime, fmtTimePrecise} from './util.js';
import {fitBeats, eightCountsBetween, periodFromTwoOnes} from './beats.js';
import * as grid from './grid.js';
import {buildPlan, planCountIn, countInNumber, ladderText} from './plan.js';
import {migrate, defaultSettings, SETTINGS_VERSION} from './storage.js';

const results = [];
function test(name, fn){
  try { fn(); results.push({name, ok: true}); }
  catch (e) { results.push({name, ok: false, error: e.message}); }
}
function eq(actual, expected, what = 'value'){
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(what + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}
function near(actual, expected, tolerance, what = 'value'){
  if (!(Math.abs(actual - expected) <= tolerance)) throw new Error(what + ': expected ' + expected + ' ± ' + tolerance + ', got ' + actual);
}

/** Repeatable "random" numbers, roughly normal, so the tap tests don't flake. */
function jitter(seed){
  let s = seed;
  const r = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  return () => { let x = 0; for (let i = 0; i < 6; i++) x += r(); return (x - 3) / Math.sqrt(0.5); };
}
function taps(bpm, beatIndexes, jitterMs, seed = 1, phase = 2.3){
  const g = jitter(seed), p = 60 / bpm;
  return beatIndexes.map(i => phase + i * p + g() * jitterMs / 1000);
}
const range = n => Array.from({length: n}, (_, i) => i);

/* ---- util ---- */
test('parseYouTubeId reads every link style', () => {
  const id = 'dQw4w9WgXcQ';
  for (const link of ['https://www.youtube.com/watch?v=' + id + '&t=5', 'https://youtu.be/' + id + '?si=x', 'https://www.youtube.com/shorts/' + id,
    'https://www.youtube.com/embed/' + id, id]) eq(parseYouTubeId(link), id, link);
  eq(parseYouTubeId('not a link'), null);
});
test('time formatting', () => { eq(fmtTime(83.4), '1:23'); eq(fmtTimePrecise(83.4), '1:23.4'); eq(fmtTimePrecise(5.05), '0:05.0'); });

/* ---- beats ---- */
test('fitBeats: 16 slightly uneven taps at 128 BPM', () => {
  const f = fitBeats(taps(128, range(16), 25));
  near(60 / f.period, 128, 1.5, 'BPM');
});
test('fitBeats: skipped beats and a double tap', () => {
  const t = taps(128, range(16).filter(i => i % 7 !== 3), 25, 2);
  t.push(t[5] + 0.02);
  near(60 / fitBeats(t).period, 128, 1.5, 'BPM');
});
test('fitBeats: a second group of taps much later tightens the tempo', () => {
  const f = fitBeats(taps(128, [...range(16), ...range(8).map(i => 150 + i)], 25, 3));
  near(60 / f.period, 128, 0.3, 'BPM');
});
test('fitBeats: fewer than 4 taps gives nothing', () => { eq(fitBeats([1, 1.5, 2]), null); });
test('fitBeats reports how steady the taps were', () => {
  const steady = fitBeats(taps(120, range(16), 5)).rms, uneven = fitBeats(taps(120, range(16), 60)).rms;
  if (!(steady < uneven)) throw new Error('steady ' + steady + ' should be less than uneven ' + uneven);
});
test('two 1s: a rough tempo finds the right number of 8-counts', () => {
  const P = 60 / 128, one1 = 10, one2 = 10 + 30 * 8 * P;
  eq(eightCountsBetween(one1, one2, 60 / 127, 8), 30, '8-counts from 127 BPM');
  eq(eightCountsBetween(one1, one2, 60 / 130, 8), 30, '8-counts from 130 BPM');
});
test('two 1s: a mark 30 ms late still gives the tempo within 0.05 BPM', () => {
  const P = 60 / 128, one2 = 10 + 30 * 8 * P + 0.03;
  near(60 / periodFromTwoOnes(10, one2, 240), 128, 0.05, 'BPM');
});

/* ---- grid ---- */
const cover = () => ({anchor: 10, period: 0.5, rangeStart: 10, rangeEnd: 26, oneT: 10});   // 120 BPM, 32 counts from 0:10
test('whereIs: counts, blocks and count-in', () => {
  const c = cover();
  eq(grid.whereIs(c, 8, 10.01), {count: 1, block: 1}, 'the 1');
  eq(grid.whereIs(c, 8, 11.51), {count: 4, block: 1}, 'count 4');
  eq(grid.whereIs(c, 8, 14.01), {count: 1, block: 2}, 'block 2');
  eq(grid.whereIs(c, 8, 9.51), {count: 8, block: 0, lead: true}, 'count-in');
  eq(grid.whereIs(c, 8, 26.0), {out: 'after range'}, 'after');
  eq(grid.whereIs(c, 8, 2), {out: 'before range'}, 'before');
  eq(grid.whereIs({period: 0}, 8, 1), null, 'no beat');
});
test('the count follows the marked 1, not the range start', () => {
  const c = cover(); c.rangeStart = 9.5;   // one beat before the 1
  eq(grid.countOfBeat(c, 8, grid.nearestBeat(c, c.rangeStart)), 8);
  eq(grid.whereIs(c, 8, 10.01).count, 1);
});
test('blocks: 32 counts make four 8-count blocks; 33 make five', () => {
  const c = cover();
  eq(grid.blocks(c, 8).length, 4);
  eq(grid.blocks(c, 8)[1], {n: 2, s: 14, e: 18});
  c.rangeEnd = 26.5;
  eq(grid.blocks(c, 8).length, 5);
});
test('fixRange: first range is 4 blocks, and ranges stay inside the video', () => {
  const c = {anchor: 0.3, period: 0.5, rangeStart: null, rangeEnd: null};
  grid.fixRange(c, 8, 120);
  eq([c.rangeStart, c.rangeEnd], [0.3, 16.3]);
  c.rangeStart = 50.1; c.rangeEnd = 500;
  grid.fixRange(c, 8, 120);
  eq([c.rangeStart, c.rangeEnd], [50.3, 119.8]);
});

/* ---- plan ---- */
const blocks5 = [1, 2, 3, 4, 5].map(n => ({n, s: n * 4, e: n * 4 + 4}));
const speeds = rates => rates.map(rate => ({rate, on: true, reps: 1}));
const planSettings = extra => Object.assign({blockSteps: speeds([0.5, 1]), connectSteps: speeds([1]), fullSteps: speeds([1]), connectOn: true, fullAfter: true, group: 2}, extra);
const parts = plan => plan.map(s => s.part + '@' + s.rate).join(' ');
test('plan order: blocks, then each group together, then the whole section', () => {
  eq(parts(buildPlan(planSettings(), blocks5, {s: 4, e: 24}, 'all')),
    'b1@0.5 b1@1 b2@0.5 b2@1 c0@1 b3@0.5 b3@1 b4@0.5 b4@1 c1@1 b5@0.5 b5@1 full@1');
});
test('plan: no connected run when one group is already the whole section', () => {
  const two = blocks5.slice(0, 2);
  eq(parts(buildPlan(planSettings({group: 4}), two, {s: 4, e: 12}, 'all')), 'b1@0.5 b1@1 b2@0.5 b2@1 full@1');
});
test('plan: whole section only', () => { eq(parts(buildPlan(planSettings(), blocks5, {s: 4, e: 24}, 'full')), 'full@1'); });
test('plan: block speeds all off, so only connected and whole runs', () => {
  const s = planSettings(); s.blockSteps.forEach(x => x.on = false);
  eq(parts(buildPlan(s, blocks5, {s: 4, e: 24}, 'all')), 'c0@1 c1@1 full@1');
});
test('plan: everything off still plays each block once', () => {
  const s = planSettings({connectOn: false, fullAfter: false}); s.blockSteps.forEach(x => x.on = false);
  eq(parts(buildPlan(s, blocks5.slice(0, 2), {s: 4, e: 12}, 'all')), 'b1@1 b2@1');
});
test('ladderText', () => { eq(ladderText([{rate: 0.5, on: true, reps: 3}, {rate: 1, on: false, reps: 1}]), '0.5× ×3'); eq(ladderText([]), 'none'); });

/* ---- count-in ---- */
test('count-in: 4 counts before the part', () => {
  eq(planCountIn({s: 10, e: 14}, 4, 0.5), {from: 8, preRoll: false, countIn: 4});
});
test('count-in at the very start of the video loops round from the end of the part', () => {
  eq(planCountIn({s: 0.2, e: 4.2}, 4, 0.5), {from: 2.2, preRoll: true, countIn: 4});
});
test('count-in: none, and the numbers shown', () => {
  eq(planCountIn({s: 10, e: 14}, 0, 0.5), {from: 10, preRoll: false, countIn: 0});
  eq([0, 1, 2, 3].map(i => countInNumber(4, i, 8)), [5, 6, 7, 8]);
  eq([0, 1].map(i => countInNumber(2, i, 8)), [7, 8]);
});

/* ---- storage ---- */
test('migrate: a first-version save gets the new settings and keeps its speeds', () => {
  const old = {settings: {counts: 8, auto: true, leadIn: 0, rest: 0, speeds: [{rate: 0.25, on: false, reps: 3}, {rate: 1, on: true, reps: 2}]}, videos: {x: {id: 'x'}}};
  const s = migrate(old).settings;
  eq(s.blockSteps, [{rate: 0.25, on: false, reps: 3}, {rate: 1, on: true, reps: 2}], 'block speeds');
  eq([s.leadStart, s.leadRepeat, s.rest, s.connectOn, s.group, s.v], [4, 2, 2, true, 4, SETTINGS_VERSION], 'new settings');
  eq(['speeds' in s, 'leadIn' in s], [false, false], 'old fields removed');
});
test('migrate: a current save keeps your choices', () => {
  const s = migrate({settings: Object.assign(defaultSettings(), {rest: 0.5, flash: true}), videos: {}}).settings;
  eq([s.rest, s.flash], [0.5, true]);
});
test('migrate: something that is not a save', () => { eq(migrate(null), null); eq(migrate({settings: {}}), null); });

/* ---- report ---- */
const failed = results.filter(r => !r.ok);
document.getElementById('summary').textContent = failed.length ? failed.length + ' of ' + results.length + ' tests failed' : 'All ' + results.length + ' tests passed';
document.getElementById('summary').className = failed.length ? 'bad' : 'good';
document.getElementById('list').innerHTML = results.map(r =>
  '<li class="' + (r.ok ? 'good' : 'bad') + '">' + (r.ok ? '✓ ' : '✗ ') + r.name + (r.error ? '<br><small>' + r.error.replace(/</g, '&lt;') + '</small>' : '') + '</li>').join('');
window.testResults = results;
