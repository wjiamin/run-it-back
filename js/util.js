/* Small helpers used across the app. Nothing here keeps state. */

export const $ = selector => document.querySelector(selector);
export const $$ = selector => document.querySelectorAll(selector);

export const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

export function median(values){
  const s = [...values].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const HTML_ESCAPES = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};
export const escapeHtml = text => String(text).replace(/[&<>"']/g, c => HTML_ESCAPES[c]);

/** 83.4 → "1:23" */
export function fmtTime(seconds){
  const t = Math.max(0, seconds), m = Math.floor(t / 60), s = Math.floor(t % 60);
  return m + ':' + String(s).padStart(2, '0');
}

/** 83.4 → "1:23.4" */
export function fmtTimePrecise(seconds){
  const t = Math.max(0, seconds), m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
}

/** 0.75 → "0.75×" */
export const rateLabel = rate => rate + '×';

/** Pull the 11-character video id out of any YouTube link (watch, youtu.be, shorts, embed, live) or a bare id. */
export function parseYouTubeId(text){
  const s = (text || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const url = new URL(s);
    if (url.hostname.includes('youtu.be')) return url.pathname.slice(1, 12) || null;
    const v = url.searchParams.get('v');
    if (v) return v.slice(0, 11);
    const m = url.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{11})/);
    if (m) return m[1];
  } catch {}
  return null;
}
