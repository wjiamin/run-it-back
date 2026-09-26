/* The beat grid of a cover.
   Every beat sits at   anchor + k × period   where k is the beat's index (any whole number, negative before the anchor).
   The functions take the saved cover (see storage.js for its fields) plus the counts per block (usually 8), and never touch
   the page. Times are in seconds of video. */

import {clamp} from './util.js';

const EPS = 1e-6;

export const hasGrid = cover => !!cover && cover.period > 0 && cover.anchor != null;
export const hasRange = cover => hasGrid(cover) && cover.rangeStart != null && cover.rangeEnd != null;

/** Time of beat k. */
export const beatTime = (cover, k) => cover.anchor + k * cover.period;
/** Index of the beat closest to time t. */
export const nearestBeat = (cover, t) => Math.round((t - cover.anchor) / cover.period);
/** Index of the beat that time t falls in (the last beat at or before t). */
export const beatAt = (cover, t) => Math.floor((t - cover.anchor) / cover.period + EPS);
/** Time t moved onto the closest beat. */
export const snapToBeat = (cover, t) => beatTime(cover, nearestBeat(cover, t));

/** The first and last beats inside the video. */
export function beatBounds(cover, duration){
  return {
    min: Math.ceil(-cover.anchor / cover.period - EPS),
    max: duration ? Math.floor((duration - cover.anchor) / cover.period + EPS) : 1e9,
  };
}

/**
 * Set the range to the whole song: from the marked 1 where the dance starts (one1) if there is one, otherwise from the
 * first 1 in the video (so the counts line up from the start), otherwise from the first beat; to the last beat.
 */
export function setWholeSong(cover, counts, duration){
  const b = beatBounds(cover, duration);
  let start = b.min;
  if (cover.one1 != null) start = clamp(nearestBeat(cover, cover.one1), b.min, b.max);
  else if (cover.oneT != null){ const one = downbeat(cover); start = one - Math.floor((one - b.min) / counts) * counts; }
  cover.rangeStart = beatTime(cover, start);
  cover.rangeEnd = beatTime(cover, b.max);
}

/**
 * Keep the trimmed range on beats, inside the video and at least one count long.
 * The first time (no range yet) it is the whole song. Changes the cover in place.
 */
export function fixRange(cover, counts, duration){
  if (!hasGrid(cover) || !duration) return;
  if (cover.rangeStart == null || cover.rangeEnd == null) setWholeSong(cover, counts, duration);
  const b = beatBounds(cover, duration);
  let start = nearestBeat(cover, cover.rangeStart), end = nearestBeat(cover, cover.rangeEnd);
  start = clamp(start, b.min, b.max - 1);
  end = clamp(end, start + 1, b.max);
  cover.rangeStart = beatTime(cover, start);
  cover.rangeEnd = beatTime(cover, end);
}

/** The trimmed range cut into blocks of `counts` beats: [{n (from 1), s (start time), e (end time)}]. The last may be shorter. */
export function blocks(cover, counts){
  const len = counts * cover.period;
  const n = Math.max(1, Math.ceil((cover.rangeEnd - cover.rangeStart) / len - EPS));
  return Array.from({length: n}, (_, i) => ({
    n: i + 1,
    s: cover.rangeStart + i * len,
    e: Math.min(cover.rangeEnd, cover.rangeStart + (i + 1) * len),
  }));
}

/**
 * Index of a beat that counts as "1". A marked 1 (oneT) wins, so the counts follow the music;
 * otherwise the counting starts at the trimmed range.
 */
export function downbeat(cover){
  if (cover.oneT != null) return nearestBeat(cover, cover.oneT);
  if (cover.rangeStart != null) return nearestBeat(cover, cover.rangeStart);
  return 0;
}

/** The count (1 to `counts`) of beat k. */
export const countOfBeat = (cover, counts, k) => (((k - downbeat(cover)) % counts) + counts) % counts + 1;

/**
 * Where time t is, for the count display:
 *   {count, block}          inside the range (block numbers start at 1 from the range start)
 *   {count, block:0, lead}  in the count-in, up to one block before the range
 *   {out}                   before or after the range ("before range" / "after range")
 *   null                    no beat set yet
 */
export function whereIs(cover, counts, t){
  if (!hasGrid(cover)) return null;
  const k = beatAt(cover, t);
  const first = cover.rangeStart != null ? nearestBeat(cover, cover.rangeStart) : downbeat(cover);
  const intoRange = k - first;
  if (intoRange < 0){
    return -intoRange <= counts ? {count: countOfBeat(cover, counts, k), block: 0, lead: true} : {out: 'before range'};
  }
  if (cover.rangeEnd != null && t >= cover.rangeEnd - EPS) return {out: 'after range'};
  return {count: countOfBeat(cover, counts, k), block: Math.floor(intoRange / counts) + 1};
}
