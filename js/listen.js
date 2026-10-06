/* Listening for the beat through the microphone, while the video plays out loud (the Beats tab).

   The YouTube player's sound can't be read by the page, so the phone listens to it instead. The sound is only analysed
   here, on the phone (tempo.js), and thrown away straight after: it is never saved or sent anywhere. Echo cancellation
   and noise suppression are turned off, since they treat music as noise to remove.

   Usage:
     const result = await listenForTempo({seconds, onProgress, signal, log});
       → {bpm, confidence, others} or {problem: 'blocked' | 'no mic' | 'unsupported' | 'quiet' | 'unsure' | 'stopped'}
     onProgress(secondsSoFar); signal: an AbortSignal, to stop early (→ 'stopped') */

import {estimateTempo, peakLevel, MIN_CONFIDENCE} from './tempo.js';

/** Quieter than this at its loudest, nothing was really heard (the sound is off, or in headphones). */
const QUIET = 0.02;

export const canListen = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
  window.AudioContext && window.AudioWorkletNode);

export async function listenForTempo({seconds = 12, onProgress = () => {}, signal, log = () => {}}){
  if (!canListen()) return {problem: 'unsupported'};
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false}});
  } catch (e){
    log('beat', 'microphone: ' + e.name);
    return {problem: e.name === 'NotAllowedError' || e.name === 'SecurityError' ? 'blocked' : 'no mic'};
  }
  const ctx = new AudioContext();
  const chunks = [];
  try {
    await ctx.audioWorklet.addModule(new URL('./listen-worklet.js', import.meta.url));
    const source = ctx.createMediaStreamSource(stream), node = new AudioWorkletNode(ctx, 'collect'), mute = ctx.createGain();
    mute.gain.value = 0;   // the worklet only runs when connected through to the speakers: connect it silently
    node.port.onmessage = e => chunks.push(e.data);
    source.connect(node); node.connect(mute); mute.connect(ctx.destination);
    if (ctx.state === 'suspended') await ctx.resume();
    log('beat', 'listening (' + ctx.sampleRate + ' Hz)');
    const started = performance.now();
    await new Promise(resolve => {
      const tick = setInterval(() => {
        const s = (performance.now() - started) / 1000;
        onProgress(Math.min(s, seconds));
        if (s >= seconds || (signal && signal.aborted)){ clearInterval(tick); resolve(); }
      }, 200);
    });
  } catch (e){
    log('beat', 'listening failed: ' + e.name);
    return {problem: 'unsupported'};
  } finally {
    for (const t of stream.getTracks()) t.stop();
    ctx.close().catch(() => {});
  }
  if (signal && signal.aborted) return {problem: 'stopped'};

  const samples = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks){ samples.set(c, at); at += c.length; }
  const level = peakLevel(samples);
  if (level < QUIET){ log('beat', 'heard nothing (peak ' + level.toFixed(3) + ')'); return {problem: 'quiet'}; }
  const result = estimateTempo(samples, ctx.sampleRate);
  log('beat', 'heard ' + (result ? result.bpm.toFixed(1) + ' BPM, confidence ' + result.confidence.toFixed(2) : 'too little'));
  if (!result || result.confidence < MIN_CONFIDENCE) return {problem: 'unsure'};
  return result;
}
