/* Hearing the tempo in recorded sound (the "Listen for the beat" button, see listen.js).
   Pure functions: samples in, a tempo out, so they can be tested with made-up beats.

   How: the sound is cut into short overlapping frames; for each frame, how much louder each pitch band got than in
   the frame before ("spectral flux") marks where notes and drum hits start. A steady beat makes that pattern repeat,
   so the gap at which it best matches itself (autocorrelation) is the beat. Gaps that also match at twice and three
   four times the length (bars), or at half the length (a beat split in two), score higher, and tempos near 120 BPM are slightly preferred, which settles most half/double
   doubts; the other two are still offered.

   Good enough for a rough tempo (within a BPM or two). The two 1s in the Beats tab make it exact. */

const TARGET_RATE = 11025;   // the sound is thinned to about this many samples a second (plenty for drums)
const FRAME = 512;           // samples per frame (about 46 ms)
const HOP = 128;             // samples between frames (about 12 ms)
export const MIN_BPM = 60, MAX_BPM = 200;
/** Below this the beat isn't steady or clear enough to trust (see confidence in tempoFromOnsets). */
export const MIN_CONFIDENCE = 0.1;

/** In-place radix-2 FFT of re/im (length a power of 2). */
export function fft(re, im){
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++){
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j){ [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1){
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len){
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++){
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

/**
 * Where sounds start: one value per frame, high where something new is heard.
 * @returns {{env: Float32Array, frameRate: number}} frameRate: frames per second
 */
export function onsetStrength(samples, sampleRate){
  // thin the sound out, averaging each group of samples (a rough low-pass, so nothing folds back)
  const step = Math.max(1, Math.round(sampleRate / TARGET_RATE)), rate = sampleRate / step;
  const n = Math.floor(samples.length / step), x = new Float32Array(n);
  for (let i = 0; i < n; i++){ let s = 0; for (let k = 0; k < step; k++) s += samples[i * step + k]; x[i] = s / step; }

  const frames = Math.max(0, Math.floor((n - FRAME) / HOP) + 1), bins = FRAME / 2;
  const win = new Float32Array(FRAME).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FRAME - 1)));
  const env = new Float32Array(frames), re = new Float32Array(FRAME), im = new Float32Array(FRAME);
  let prev = new Float32Array(bins), cur = new Float32Array(bins);
  for (let f = 0; f < frames; f++){
    for (let i = 0; i < FRAME; i++){ re[i] = x[f * HOP + i] * win[i]; im[i] = 0; }
    fft(re, im);
    let flux = 0;
    for (let b = 1; b < bins; b++){
      cur[b] = Math.log1p(100 * Math.hypot(re[b], im[b]));
      if (f > 0 && cur[b] > prev[b]) flux += cur[b] - prev[b];
    }
    env[f] = flux;
    [prev, cur] = [cur, prev];
  }
  // keep only what stands out from the moment around it (about half a second), so loud passages don't swamp the rest,
  // and even out the strength of the hits
  const frameRate = rate / HOP, half = Math.round(frameRate * 0.25), out = new Float32Array(frames);
  for (let f = 0; f < frames; f++){
    let s = 0, c = 0;
    for (let k = Math.max(0, f - half); k <= Math.min(frames - 1, f + half); k++){ s += env[k]; c++; }
    out[f] = Math.sqrt(Math.max(0, env[f] - s / c));   // square root: a snare shouldn't count far more than a kick
  }
  return {env: out, frameRate};
}

/** How much the onsets match themselves `lag` frames later (0 = not at all). */
function selfMatch(env, lag){
  let s = 0;
  for (let i = 0; i + lag < env.length; i++) s += env[i] * env[i + lag];
  return s / (env.length - lag);
}

/**
 * The tempo of an onset pattern.
 * @returns {{bpm:number, confidence:number, others:number[]}|null} others: the half and double tempos that are in
 *   range, for the "not right?" choice. confidence: about 0 for noise, towards 1 for a clear steady beat. Null if too short.
 */
export function tempoFromOnsets(env, frameRate){
  const minLag = frameRate * 60 / MAX_BPM, maxLag = frameRate * 60 / MIN_BPM, top = Math.ceil(maxLag * 4) + 3;
  if (env.length < top * 1.5) return null;
  const raw = [];
  for (let lag = 0; lag <= top; lag++) raw[lag] = selfMatch(env, lag);
  if (!(raw[0] > 0)) return {bpm: 0, confidence: 0, others: []};
  // a little smoothing, so a beat that falls between two frames still shows at both
  const r = raw.map((_, i) => i === 0 ? raw[0] : (raw[i - 1] + 2 * raw[i] + (raw[i + 1] ?? raw[i])) / 4);
  const at = x => { const i = Math.floor(x), f = x - i; return r[i] * (1 - f) + r[i + 1] * f; };   // between frames

  let best = 0, bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag += 0.25){
    const bpm = 60 * frameRate / lag;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.8) ** 2);   // a lean towards 120 BPM, where most dance music is
    // a beat repeats in bars of 2 and 4, and splits in two (so three half-beats of a fast song don't pass for a beat)
    const score = (at(lag) + 0.5 * at(2 * lag) + 0.25 * at(4 * lag) + 0.25 * at(lag / 2)) * prior;
    if (score > bestScore){ bestScore = score; best = lag; }
  }
  const bpm = 60 * frameRate / best;

  // how far the peak stands above the typical match in the tempo range, compared with the onsets' own strength
  let mean = 0, count = 0;
  for (let l = Math.ceil(minLag); l <= maxLag; l++){ mean += r[l]; count++; }
  mean /= count;
  const confidence = Math.max(0, Math.min(1, (at(best) - mean) / (r[0] - mean || 1)));
  const others = [bpm / 2, bpm * 2].filter(t => t >= 40 && t <= 300);
  return {bpm, confidence, others};
}

/** The tempo heard in `samples` (mono, `sampleRate` a second). See tempoFromOnsets. */
export function estimateTempo(samples, sampleRate){
  const {env, frameRate} = onsetStrength(samples, sampleRate);
  return tempoFromOnsets(env, frameRate);
}

/** The loudest sample, to tell "too quiet to hear anything" from "no steady beat". */
export function peakLevel(samples){
  let m = 0;
  for (let i = 0; i < samples.length; i++) m = Math.max(m, Math.abs(samples[i]));
  return m;
}
