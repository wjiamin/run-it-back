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
  // round to tenths first, so 59.96 is "1:00.0", not "0:60.0"
  const t = Math.round(Math.max(0, seconds) * 10) / 10, m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
}

/** 0.75 → "0.75×" */
export const rateLabel = rate => rate + '×';

const VIDEO_ID = /^[\w-]{11}$/;
/**
 * Pull the 11-character video id out of any YouTube link (watch, youtu.be, shorts, embed, live) or a bare id.
 * The link can be missing its "https://" ("youtu.be/…", "www.youtube.com/watch?v=…") or come with other text around it,
 * as some apps share it ("Check this out! https://youtu.be/…"). Anything that isn't a real 11-character id is refused.
 */
export function parseYouTubeId(text){
  const s = (text || '').trim();
  if (VIDEO_ID.test(s)) return s;
  const found = s.match(/(?:https?:\/\/)?(?:[\w-]+\.)*(?:youtube\.com|youtu\.be)\/\S*/i);
  if (!found) return null;
  try {
    const url = new URL(/^https?:/i.test(found[0]) ? found[0] : 'https://' + found[0]);
    const id = url.hostname.endsWith('youtu.be') ? url.pathname.slice(1, 12)
      : url.searchParams.get('v') || (url.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{11})/) || [])[1] || '';
    return VIDEO_ID.test(id) ? id : null;
  } catch { return null; }
}
