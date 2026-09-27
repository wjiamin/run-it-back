/* The practice plan: the ordered list of steps a practice session plays through.

   Order: every block at the block speeds; after each group of blocks (4 by default) that group run together at the
   connect speeds; after every N new blocks (1 by default) everything so far "from the top" at the from-the-top speeds;
   finally the whole trimmed section at the whole-section speeds. For a range of 6 blocks in groups of 4:
     b1 · b2 · top 1–2 · b3 · top 1–3 · b4 · connect 1–4 · b5 · top 1–5 · b6 · connect 5–6 · whole section
   There is no top 1–4 (connect 1–4 just played it) and no top 1–6 (that is the whole section, which runs at the end).

   A step is {kind, part, s, e, rate, reps} plus, depending on kind:
     'block'    block      the block number
     'connect'  a, b       the first and last block of the group
     'top'      a, b       from the first block to the newest one
     'full'                (the whole range)
   `part` names what is being practised ('b3', 'c0', 't5', 'full'); consecutive steps with the same part are the same part
   at different speeds. Pure functions: settings and blocks in, steps out. */

import {clamp, rateLabel} from './util.js';

/** The speed rows that are switched on and usable. */
export const enabledSteps = list => list.filter(x => x.on && x.reps > 0 && x.rate > 0);

/** Blocks per connected run, kept between 2 and 8. */
export const groupSize = settings => clamp(Math.round(settings.group) || 4, 2, 8);

/** Run from the top after every this many new blocks, kept between 1 and 8. */
export const topEvery = settings => clamp(Math.round(settings.topEvery) || 1, 1, 8);

/**
 * @param settings  the saved settings (blockSteps, connectSteps, fullSteps, connectOn, fullAfter, group)
 * @param blockList from grid.blocks()
 * @param range     {s, e} the trimmed range
 * @param mode      'all' for the full plan, 'full' for only the whole-section runs
 */
export function buildPlan(settings, blockList, range, mode){
  const blockSpeeds = enabledSteps(settings.blockSteps);
  const connectSpeeds = enabledSteps(settings.connectSteps);
  const fullSpeeds = enabledSteps(settings.fullSteps);
  const topSpeeds = enabledSteps(settings.topSteps || []);
  const wantConnect = settings.connectOn && connectSpeeds.length > 0;
  const wantTop = settings.topOn && topSpeeds.length > 0;
  const wantFull = settings.fullAfter && fullSpeeds.length > 0;
  const plan = [];

  if (mode !== 'full'){
    const nb = blockList.length, G = groupSize(settings), every = topEvery(settings);
    // with every block speed switched off, still play each block once, unless connected or whole runs will cover them
    const speeds = blockSpeeds.length ? blockSpeeds : (wantConnect || wantFull ? [] : [{rate: 1, reps: 1}]);
    const start = blockList[0];
    for (let g = 0; g * G < nb; g++){
      const group = blockList.slice(g * G, (g + 1) * G), first = group[0], last = group[group.length - 1];
      // a lone block needs no connecting, and neither does a group that is already the whole section (it gets its own run)
      const needsConnect = wantConnect && group.length >= 2 && !(group.length === nb && wantFull);
      for (const b of group){
        for (const sp of speeds) plan.push({kind: 'block', part: 'b' + b.n, block: b.n, s: b.s, e: b.e, rate: sp.rate, reps: sp.reps});
        if (b === last && needsConnect) for (const sp of connectSpeeds){
          plan.push({kind: 'connect', part: 'c' + g, a: first.n, b: last.n, s: first.s, e: last.e, rate: sp.rate, reps: sp.reps});
        }
        // from the top: everything learned so far. Skipped when it would repeat the connected run just played (the first
        // group), or when it is the whole section, which gets its own run at the end.
        const dueFromTop = wantTop && b.n >= 2 && b.n % every === 0;
        const repeatsConnect = b === last && needsConnect && first.n === 1;
        const isWholeSection = b.n === nb && wantFull;
        if (dueFromTop && !repeatsConnect && !isWholeSection) for (const sp of topSpeeds){
          plan.push({kind: 'top', part: 't' + b.n, a: start.n, b: b.n, s: start.s, e: b.e, rate: sp.rate, reps: sp.reps});
        }
      }
    }
  }

  if (mode === 'full' || wantFull){
    const speeds = fullSpeeds.length ? fullSpeeds : [{rate: 1, reps: 1}];
    for (const sp of speeds) plan.push({kind: 'full', part: 'full', s: range.s, e: range.e, rate: sp.rate, reps: sp.reps});
  }
  return plan;
}

/** "block 3", "blocks 1–4 together", "the whole section" */
export function stepLabel(step){
  if (step.kind === 'block') return 'block ' + step.block;
  if (step.kind === 'connect') return 'blocks ' + step.a + '–' + step.b + ' together';
  if (step.kind === 'top') return 'blocks ' + step.a + '–' + step.b + ' from the top';
  return 'the whole section';
}

/** "0.5× ×3 → 0.75× ×3 → 1× ×3" */
export function ladderText(list){
  const on = enabledSteps(list);
  return on.length ? on.map(x => rateLabel(x.rate) + ' ×' + x.reps).join(' → ') : 'none';
}

/**
 * Where a run starts, so it begins with a count-in of `lead` counts (4 = "5, 6, 7, 8").
 * Normally that is the counts just before the part. When the video has no counts before the part (it starts at the very
 * beginning), the count-in loops round instead: it plays the last counts of the part first ("pre-roll"), then jumps to
 * the part's start.
 * @returns {{from:number, preRoll:boolean, countIn:number}} start time, whether it is a pre-roll, and counts of count-in
 */
export function planCountIn(step, lead, period){
  if (lead <= 0) return {from: step.s, preRoll: false, countIn: 0};
  if (step.s - lead * period >= -0.25 * period){
    return {from: Math.max(0, step.s - lead * period), preRoll: false, countIn: lead};
  }
  const from = Math.max(step.s, step.e - lead * period), n = Math.round((step.e - from) / period);
  return n >= 1 ? {from, preRoll: true, countIn: n} : {from: step.s, preRoll: false, countIn: 0};
}

/**
 * Where to continue a plan from saved progress (see storage.js, cover.resume).
 * The progress only counts if the trimmed range and counts per block haven't changed (within half a beat, so a small
 * timing nudge keeps it). Finds the same part at the same speed, else the same part.
 * @param saved {part, rate, counts, rangeStart, rangeEnd}
 * @param now   {s, e, counts, period} the current range, counts per block and seconds per beat
 * @returns the step index, or -1
 */
export function resumeIndex(plan, saved, now){
  if (!saved || saved.counts !== now.counts) return -1;
  const tolerance = now.period / 2;
  if (Math.abs(saved.rangeStart - now.s) > tolerance || Math.abs(saved.rangeEnd - now.e) > tolerance) return -1;
  const sameSpeed = plan.findIndex(st => st.part === saved.part && st.rate === saved.rate);
  return sameSpeed >= 0 ? sameSpeed : plan.findIndex(st => st.part === saved.part);
}

/** The number to show on count-in beat i (from 0): with a 4-count count-in of 8 counts, 5, 6, 7, 8. */
export const countInNumber = (countIn, i, counts) => ((counts - countIn + i) % counts + counts) % counts + 1;
