/* Tests for the modules that don't touch the page. Open tests.html (served, like the app) to run them. */

import {parseYouTubeId, fmtTime, fmtTimePrecise} from './util.js';
import {fitBeats, eightCountsBetween, periodFromTwoOnes} from './beats.js';
import * as grid from './grid.js';
import {buildPlan, planCountIn, countInNumber, ladderWords, resumeIndex} from './plan.js';
import {Practice} from './practice.js';
import {migrate, defaultSettings, SETTINGS_VERSION, presets, presetOf, pickPlan, PLAN_KEYS} from './storage.js';
import {makeShareLink, parseShare, isShareHash} from './share.js';
import {nearestCorner, cameraProblem} from './camera.js';

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
test('time formatting', () => { eq(fmtTime(83.4), '1:23'); eq(fmtTimePrecise(83.4), '1:23.4'); eq(fmtTimePrecise(5.04), '0:05.0'); });
test('time formatting never shows 60 seconds', () => { eq(fmtTimePrecise(59.96), '1:00.0'); eq(fmtTimePrecise(119.97), '2:00.0'); eq(fmtTimePrecise(0.04), '0:00.0'); });
test('parseYouTubeId: links without https://, with other text around them, and broken ids', () => {
  const id = 'dQw4w9WgXcQ';
  for (const link of ['youtu.be/' + id, 'www.youtube.com/watch?v=' + id, 'm.youtube.com/watch?v=' + id + '&t=10', 'youtube.com/shorts/' + id,
    'Check this out! https://youtu.be/' + id + '?si=x', 'https://music.youtube.com/watch?v=' + id + '&list=abc']) eq(parseYouTubeId(link), id, link);
  for (const bad of ['https://www.youtube.com/watch?v=abc', 'https://youtu.be/', 'https://example.com/watch?v=' + id, 'youtube.com'])
    eq(parseYouTubeId(bad), null, bad);
});

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
test('fixRange: the first range is the whole song, and ranges stay inside the video', () => {
  const c = {anchor: 0.3, period: 0.5, rangeStart: null, rangeEnd: null};
  grid.fixRange(c, 8, 120);
  eq([c.rangeStart, c.rangeEnd], [0.3, 119.8], 'whole song');
  c.rangeStart = 50.1; c.rangeEnd = 500;
  grid.fixRange(c, 8, 120);
  eq([c.rangeStart, c.rangeEnd], [50.3, 119.8], 'clamped');
});
test('whole song starts at the first 1 of the video, or at the marked start of the dance', () => {
  const c = {anchor: 10, period: 0.5, oneT: 10};          // a 1 at 0:10, so 1s every 4 s: 2, 6, 10 …
  grid.setWholeSong(c, 8, 120);
  eq([c.rangeStart, c.rangeEnd], [2, 120], 'first 1 in the video');
  c.one1 = 10;                                            // the dance starts at 0:10
  grid.setWholeSong(c, 8, 120);
  eq(c.rangeStart, 10, 'the marked start');
  eq(grid.countOfBeat(c, 8, grid.nearestBeat(c, c.rangeStart)), 1, 'starts on a 1');
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
test('from the top after every new block, skipping repeats of connected runs and of the whole section', () => {
  const s = planSettings({topOn: true, topEvery: 1, topSteps: speeds([1])});
  eq(parts(buildPlan(s, blocks5, {s: 4, e: 24}, 'all')),
    'b1@0.5 b1@1 b2@0.5 b2@1 c0@1 b3@0.5 b3@1 t3@1 b4@0.5 b4@1 c1@1 t4@1 b5@0.5 b5@1 full@1');
});
test('from the top every 2 blocks, without connecting', () => {
  const s = planSettings({connectOn: false, topOn: true, topEvery: 2, blockSteps: speeds([1]), topSteps: speeds([0.75, 1])});
  eq(parts(buildPlan(s, blocks5, {s: 4, e: 24}, 'all')), 'b1@1 b2@1 t2@0.75 t2@1 b3@1 b4@1 t4@0.75 t4@1 b5@1 full@1');
});
test('a from-the-top step runs from the first block to the newest', () => {
  const s = planSettings({connectOn: false, fullAfter: false, topOn: true, topEvery: 1, blockSteps: speeds([1]), topSteps: speeds([1])});
  const top = buildPlan(s, blocks5.slice(0, 3), {s: 4, e: 16}, 'all').find(st => st.part === 't3');
  eq([top.kind, top.a, top.b, top.s, top.e], ['top', 1, 3, 4, 16]);
});
test('ladderWords', () => {
  const st = (rate, reps, on = true) => ({rate, on, reps});
  eq(ladderWords([st(0.5, 3), st(0.75, 3), st(1, 3)]), '0.5× → 0.75× → 1×, 3 runs each');
  eq(ladderWords([st(0.5, 4), st(1, 3), st(2, 1, false)]), '0.5× (4 runs) → 1× (3 runs)');
  eq(ladderWords([st(1, 1)]), '1×, 1 run');
  eq(ladderWords([]), 'none');
});
test('presets: the defaults are Standard, and each preset is recognised', () => {
  eq(presetOf(defaultSettings()), 'standard');
  for (const [name, p] of Object.entries(presets())) eq(presetOf({...defaultSettings(), ...p}), name, name);
});
test('presets: changing anything in the plan makes it Custom; other options do not', () => {
  const s = defaultSettings(); s.blockSteps[0].reps = 5; eq(presetOf(s), 'custom');
  const t = {...defaultSettings(), auto: false, musicBlocks: false, counts: 4}; eq(presetOf(t), 'standard');
});

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

/* ---- continue where you left off ---- */
const twoBlockPlan = () => buildPlan(planSettings({connectOn: false}), blocks5.slice(0, 2), {s: 4, e: 12}, 'all');   // b1@0.5 b1@1 b2@0.5 b2@1 full@1
const here = {s: 4, e: 12, counts: 8, period: 0.5, blocks: 2};
test('resume: finds the same part at the same speed', () => {
  eq(resumeIndex(twoBlockPlan(), {part: 'b2', rate: 1, counts: 8, rangeStart: 4, rangeEnd: 12}, here), 3);
});
test('resume: same part if that speed is gone, and nothing if the range or counts changed', () => {
  eq(resumeIndex(twoBlockPlan(), {part: 'b2', rate: 0.6, counts: 8, rangeStart: 4, rangeEnd: 12}, here), 2, 'speed gone');
  eq(resumeIndex(twoBlockPlan(), {part: 'b2', rate: 1, counts: 8, rangeStart: 4.2, rangeEnd: 12}, here), 3, 'small nudge keeps it');
  eq(resumeIndex(twoBlockPlan(), {part: 'b2', rate: 1, counts: 8, rangeStart: 8, rangeEnd: 12}, here), -1, 'range changed');
  eq(resumeIndex(twoBlockPlan(), {part: 'b2', rate: 1, counts: 4, rangeStart: 4, rangeEnd: 12}, here), -1, 'counts changed');
  eq(resumeIndex(twoBlockPlan(), null, here), -1, 'nothing saved');
});
test('resume: after fixing the beat, kept while there are about as many blocks and each end moved less than a block', () => {
  const saved = {part: 'b2', rate: 1, counts: 8, blocks: 2};
  const long = buildPlan(planSettings({connectOn: false}), blocks5, {s: 4, e: 24}, 'all'), here5 = {s: 4, e: 24, counts: 8, period: 0.5, blocks: 5};
  eq(resumeIndex(long, {part: 'b3', rate: 1, counts: 8, blocks: 4, rangeStart: 4, rangeEnd: 23.8}, here5) > 0, true, 'a new tempo added a last block');
  eq(resumeIndex(long, {part: 'b3', rate: 1, counts: 8, blocks: 7, rangeStart: 4, rangeEnd: 24}, here5), -1, 'two blocks more');
  eq(resumeIndex(twoBlockPlan(), {...saved, rangeStart: 3.4, rangeEnd: 11.2}, here), 3, '1 marked again: moved under a block (4 s)');
  eq(resumeIndex(twoBlockPlan(), {...saved, rangeStart: 0, rangeEnd: 12}, here), -1, 'moved a whole block');
  eq(resumeIndex(twoBlockPlan(), {...saved, blocks: 4, rangeStart: 4, rangeEnd: 12}, here), -1, 'counting twice as fast: the part stays, the blocks double');
  eq(resumeIndex(twoBlockPlan(), {part: 'b2', rate: 1, counts: 8, rangeStart: 3.4, rangeEnd: 11.2}, here), -1, 'older progress without blocks: strict');
});

/* ---- the practice session, with a pretend player and clock ---- */
function fakeSession(plan, settings = {}){
  const timers = [], events = [];
  const env = {
    settings: Object.assign({leadStart: 0, leadRepeat: 0, rest: 1, auto: true}, settings),
    period: () => 0.5,
    seek: t => events.push('seek ' + t), play: () => {}, pause: () => {},
    onStep: st => events.push('step ' + st.part + '@' + st.rate), onFinish: () => events.push('finish'), onChange: () => {},
    log: () => {}, now: () => 0,
    setTimer: (fn, ms) => timers.push(fn), clearTimer: () => {},
  };
  const s = new Practice(plan, 'all', 0, env);
  const where = () => s.done ? 'done' : s.step.part + '@' + s.step.rate + ' rep ' + (s.rep + 1) + (s.pausing ? ' (pause)' : '') + (s.waiting ? ' (waiting)' : '');
  const finishRun = () => s.segmentEnd();                           // the playhead reached the end of the part
  const endPause = () => { const fn = timers.shift(); if (fn) fn(); };
  return {s, events, where, finishRun, endPause};
}
const repsPlan = () => buildPlan(planSettings({connectOn: false, fullAfter: false, blockSteps: [{rate: 0.5, on: true, reps: 2}, {rate: 1, on: true, reps: 2}]}),
  blocks5.slice(0, 2), {s: 4, e: 12}, 'all');   // b1@0.5 ×2, b1@1 ×2, b2@0.5 ×2, b2@1 ×2

test('practice: runs, pauses and steps in order', () => {
  const f = fakeSession(repsPlan());
  f.s.start();
  eq(f.where(), 'b1@0.5 rep 1');
  f.finishRun(); eq(f.where(), 'b1@0.5 rep 2 (pause)');
  f.endPause(); eq(f.where(), 'b1@0.5 rep 2');
  f.finishRun(); eq(f.where(), 'b1@1 rep 1 (pause)');
  f.endPause(); f.finishRun(); f.endPause(); f.finishRun(); f.endPause();
  eq(f.where(), 'b2@0.5 rep 1');
});
test('practice: waits for you between parts when "move on automatically" is off', () => {
  const f = fakeSession(repsPlan(), {auto: false});
  f.s.start();
  for (let i = 0; i < 3; i++){ f.finishRun(); f.endPause(); }
  f.finishRun();
  eq(f.where(), 'b2@0.5 rep 1 (waiting)');
  f.s.continueNow(); eq(f.where(), 'b2@0.5 rep 1');
});
test('Again while playing restarts the run, and it does not count', () => {
  const f = fakeSession(repsPlan());
  f.s.start(); f.finishRun(); f.endPause();                     // on rep 2
  f.s.again(); eq(f.where(), 'b1@0.5 rep 2');
  eq(f.events.filter(e => e.startsWith('seek')).length, 3, 'seeks (start, rep 2, again)');
});
test('Again in the pause redoes the run that just finished', () => {
  const f = fakeSession(repsPlan());
  f.s.start(); f.finishRun();                                   // rep 1 done, pausing before rep 2
  f.s.again(); eq(f.where(), 'b1@0.5 rep 1');
  f.finishRun(); f.endPause(); eq(f.where(), 'b1@0.5 rep 2');
});
test('Again after a step ends goes back to that step, at its speed', () => {
  const f = fakeSession(repsPlan());
  f.s.start(); f.finishRun(); f.endPause(); f.finishRun();      // b1@0.5 finished, pausing before b1@1
  f.s.again(); eq(f.where(), 'b1@0.5 rep 2');
  eq(f.events.slice(-2)[0], 'step b1@0.5', 'the speed is set again');
});
test('Again after the end replays the last run', () => {
  const f = fakeSession(repsPlan().slice(0, 1));                // one step, 2 reps
  f.s.start(); f.finishRun(); f.endPause(); f.finishRun();
  eq(f.where(), 'done');
  f.s.again(); eq(f.where(), 'b1@0.5 rep 2');
});
test('Skip goes to the next speed', () => {
  const f = fakeSession(repsPlan());
  f.s.start();
  f.s.skip(); eq(f.where(), 'b1@1 rep 1');
  f.s.skip(); eq(f.where(), 'b2@0.5 rep 1');
});
test('Skip in the pause before a new step just starts it', () => {
  const f = fakeSession(repsPlan());
  f.s.start(); f.finishRun(); f.endPause(); f.finishRun();      // pausing before b1@1
  f.s.skip(); eq(f.where(), 'b1@1 rep 1');
});
test('Skip on the last step finishes the plan', () => {
  const f = fakeSession(repsPlan().slice(0, 1));
  f.s.start(); f.s.skip();
  eq(f.where(), 'done'); eq(f.events.slice(-1)[0], 'finish');
});
test('the skip button knows where it goes', () => {
  const f = fakeSession(repsPlan());
  const target = () => { const t = f.s.skipTarget; return t && (t.from ? t.from.part + '@' + t.from.rate : '-') + ' → ' + (t.to ? t.to.part + '@' + t.to.rate : 'finish'); };
  f.s.start();
  eq(target(), 'b1@0.5 → b1@1', 'next speed of the same block');
  f.s.skip(); eq(target(), 'b1@1 → b2@0.5', 'last speed: next block');
  f.finishRun(); f.endPause(); f.finishRun();                   // b1@1 done, pausing before b2@0.5
  eq(target(), 'b1@1 → b2@0.5', 'in the pause before b2: start it');
  const g = fakeSession(repsPlan().slice(0, 1)); g.s.start();
  eq((() => { const t = g.s.skipTarget; return t.to; })(), null, 'last step: finish');
});
test('a stopped session ignores its pause timer', () => {
  const f = fakeSession(repsPlan());
  f.s.start(); f.finishRun(); f.s.stop(); f.endPause();
  eq(f.s.pausing, true, 'still in the pause: the timer did nothing');
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
test('migrate: videos saved before plans were per video keep the plan they were using', () => {
  const settings = {...defaultSettings(), ...presets().speed, counts: 6, auto: false};
  const saved = migrate({settings, videos: {a: {id: 'a'}, b: {id: 'b', plan: {...pickPlan(defaultSettings())}}}});
  eq(presetOf(saved.videos.a.plan), 'speed'); eq(saved.videos.a.plan.counts, 6);
  eq(presetOf(saved.videos.b.plan), 'standard', 'a video with its own plan keeps it');
  eq(Object.keys(saved.videos.a.plan), PLAN_KEYS, 'only plan fields (not auto or music)');
  saved.videos.a.plan.blockSteps[0].reps = 9;
  eq(saved.settings.blockSteps[0].reps, 2, 'a separate copy');
});
test('migrate: something that is not a save', () => { eq(migrate(null), null); eq(migrate({settings: {}}), null); });

/* ---- share links ---- */
const BASE = 'https://example.com/run-it-back/';
const sharedCover = () => ({id: 'dQw4w9WgXcQ', title: 'Supernatural – Dance Practice (Mirrored) & more', period: 0.495634, anchor: 32.4,
  oneT: 32.4, one1: 32.4, one2: 103.7, oneBeats: 144, rangeStart: 20.5, rangeEnd: 163.8, resume: {part: 'b5'}, dur: 164});
const hashOf = link => link.slice(link.indexOf('#'));
test('share link: the beat and part come back, and progress is left out', () => {
  const link = makeShareLink(BASE, sharedCover(), null);
  eq(link.startsWith(BASE + '#share=1&'), true, 'starts with the app address');
  const got = parseShare(hashOf(link));
  eq([got.id, got.title], ['dQw4w9WgXcQ', 'Supernatural – Dance Practice (Mirrored) & more']);
  eq(got.beat, {period: 0.495634, anchor: 32.4, rangeStart: 20.5, rangeEnd: 163.8, oneT: 32.4, one1: 32.4, one2: 103.7, oneBeats: 144});
  eq([got.plan, got.planName, got.counts], [null, null, null], 'no plan');
  eq(link.includes('resume') || link.includes('b5'), false, 'no progress');
});
test('share link: a preset plan goes in by name, with counts per block', () => {
  const s = {...defaultSettings(), ...presets().chill, counts: 6};
  const link = makeShareLink(BASE, sharedCover(), s);
  eq(link.includes('plan=chill'), true);
  const got = parseShare(hashOf(link));
  eq([got.planName, got.counts, presetOf({...defaultSettings(), ...got.plan})], ['chill', 6, 'chill']);
});
test('share link: a custom plan comes back exactly', () => {
  const s = defaultSettings();
  s.blockSteps = [{rate: 0.6, on: true, reps: 5}, {rate: 0.8, on: false, reps: 2}, {rate: 1, on: true, reps: 1}];
  s.connectSteps = []; Object.assign(s, {group: 3, topOn: false, topEvery: 2, rest: 1.5, leadStart: 8, leadRepeat: 0, fullAfter: false});
  const got = parseShare(hashOf(makeShareLink(BASE, sharedCover(), s)));
  eq(got.planName, 'custom');
  for (const k of Object.keys(got.plan)) eq(got.plan[k], s[k], k);
});
test('share link: only the first 1 marked', () => {
  const c = {...sharedCover(), one1: null, one2: null, oneBeats: 0};
  const got = parseShare(hashOf(makeShareLink(BASE, c, null)));
  eq([got.beat.oneT, got.beat.one1, got.beat.one2, got.beat.oneBeats], [32.4, 32.4, null, 0]);
});
test('share link: broken or strange links are refused, out-of-range values are limited', () => {
  const good = hashOf(makeShareLink(BASE, sharedCover(), null));
  eq(isShareHash(good), true); eq(isShareHash('#other'), false); eq(isShareHash(''), false);
  eq(parseShare('#share=2&v=dQw4w9WgXcQ&p=0.5&a=1&r=2~10'), null, 'unknown version');
  eq(parseShare('#share=1&v=<script>&p=0.5&a=1&r=2~10'), null, 'bad video id');
  eq(parseShare('#share=1&v=dQw4w9WgXcQ&p=abc&a=1&r=2~10'), null, 'no tempo');
  eq(parseShare('#share=1&v=dQw4w9WgXcQ&p=5&a=1&r=2~10'), null, 'impossible tempo');
  eq(parseShare('#share=1&v=dQw4w9WgXcQ&p=0.5&a=1&r=10~2'), null, 'part ends before it starts');
  eq(parseShare('#share=1&v=dQw4w9WgXcQ&p=0.5&a=1'), null, 'no part');
  const odd = parseShare('#share=1&v=dQw4w9WgXcQ&p=0.5&a=1&r=2~10&n=99&plan=custom&pb=9x99_nonsense&pg=50&prest=0.3');
  eq([odd.counts, odd.plan.group, odd.plan.rest, odd.plan.blockSteps], [16, 8, 0.5, presets().standard.blockSteps]);
  eq(parseShare('#share=1&v=dQw4w9WgXcQ&p=0.5&a=1&r=2~10&plan=mystery').plan, null, 'unknown preset: no plan');
});

/* ---- your camera ---- */
test('the camera window goes to the nearest corner', () => {
  eq([nearestCorner(10, 10, 400, 300), nearestCorner(390, 20, 400, 300), nearestCorner(30, 280, 400, 300), nearestCorner(300, 200, 400, 300)],
    ['tl', 'tr', 'bl', 'br']);
});
test('camera errors become a reason to show', () => {
  eq(['NotAllowedError', 'SecurityError', 'NotFoundError', 'NotReadableError', 'OverconstrainedError', 'AbortError'].map(name => cameraProblem({name})),
    ['blocked', 'blocked', 'no camera', 'no camera', 'no camera', 'failed']);
  eq(cameraProblem(undefined), 'failed');
});

/* ---- report ---- */
const failed = results.filter(r => !r.ok);
document.getElementById('summary').textContent = failed.length ? failed.length + ' of ' + results.length + ' tests failed' : 'All ' + results.length + ' tests passed';
document.getElementById('summary').className = failed.length ? 'bad' : 'good';
document.getElementById('list').innerHTML = results.map(r =>
  '<li class="' + (r.ok ? 'good' : 'bad') + '">' + (r.ok ? '✓ ' : '✗ ') + r.name + (r.error ? '<br><small>' + r.error.replace(/</g, '&lt;') + '</small>' : '') + '</li>').join('');
window.testResults = results;
