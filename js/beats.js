/* Working out the tempo. Two ways:
     1. fitBeats: from taps, which are only roughly on the beat.
     2. Two 1s: mark two downbeats far apart. Knowing roughly how many 8-counts lie between them, the gap gives an exact
        tempo, because any error in the marks is spread over the whole gap.
   Pure functions: times in, numbers out. */

import {median} from './util.js';

/** Best straight line through [index, time] points: time = a + b × index. */
function leastSquares(points){
  let n = 0, sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const [p, x] of points){ n++; sx += p; sy += x; sxy += p * x; sxx += p * p; }
  const den = n * sxx - sx * sx;
  if (n < 2 || Math.abs(den) < 1e-9) return null;
  const b = (n * sxy - sx * sy) / den;
  return {a: (sy - b * sx) / n, b};
}

/**
 * Fit tap times (seconds) to a steady beat.
 * Copes with skipped beats, long gaps and accidental double taps, because each tap is numbered by where the fit so far
 * says it should land, and the fit is redone as taps are added.
 * @returns {{period:number, phase:number, rms:number}|null} seconds per beat, the time of one beat, and how far the taps
 *   strayed from a steady beat (seconds). Null with fewer than 4 usable taps.
 */
export function fitBeats(times){
  const t = [...times].sort((x, y) => x - y);
  if (t.length < 4) return null;
  const gaps = [];
  for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] > 0.05) gaps.push(t[i] - t[i - 1]);
  if (gaps.length < 3) return null;

  let period = median(gaps), phase = t[0];
  const points = [[0, t[0]]];
  for (let i = 1; i < t.length; i++){
    const last = points[points.length - 1][0];
    const index = points.length >= 4 ? Math.round((t[i] - phase) / period) : last + Math.round((t[i] - t[i - 1]) / period);
    if (index === last) continue;   // double tap
    points.push([index, t[i]]);
    const f = leastSquares(points);
    if (f && f.b > 0.1){ phase = f.a; period = f.b; }
  }

  const f = leastSquares(points);
  if (!(f && f.b > 0.1)) return null;
  let squares = 0;
  for (const [p, x] of points){ const r = x - (f.a + f.b * p); squares += r * r; }
  return {period: f.b, phase: f.a, rms: Math.sqrt(squares / points.length)};
}

/** How many 8-counts (of `counts` beats) lie between two marked 1s, judged from a rough tempo. At least 1. */
export function eightCountsBetween(one1, one2, roughPeriod, counts){
  return Math.max(1, Math.round(Math.abs(one2 - one1) / (counts * roughPeriod)));
}

/** The exact seconds per beat from two marked 1s that are `beats` beats apart. */
export function periodFromTwoOnes(one1, one2, beats){
  return Math.abs(one2 - one1) / beats;
}
