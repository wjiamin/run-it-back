/* Visit counts and the tip link. Both stay off until they are filled in below.
   - Visit counts use GoatCounter (goatcounter.com): no cookies, nothing personal stored, so no cookie banner is needed.
     It counts page views, plus a few named moments (a video loaded, practice started or finished, the app installed,
     the tip link pressed). Never video links or titles. It skips localhost, so testing locally is not counted.
   - The tip link (Ko-fi, Buy Me a Coffee…) shows in the home page footer and when you finish practising a range.
   If you change what is counted, update privacy.html too. */

/** Your GoatCounter code: the "runitback" in runitback.goatcounter.com. Empty = no counting. */
export const GOATCOUNTER_CODE = 'runitback';
/** Your tip page, for example 'https://ko-fi.com/yourname'. Empty = no tip links. */
export const TIP_URL = 'https://ko-fi.com/runitbackcover';

export function setupAnalytics(){
  if (!GOATCOUNTER_CODE) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://gc.zgo.at/count.js';
  script.dataset.goatcounter = 'https://' + GOATCOUNTER_CODE + '.goatcounter.com/count';
  document.head.appendChild(script);
}

/** Count a named moment, for example countEvent('practice-complete'). Does nothing when counting is off or blocked. */
export function countEvent(name){
  try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({path: name, title: name, event: true}); } catch {}
}

/** Point every .tipLink at TIP_URL and show the ones marked data-tip; they stay hidden when there is no tip page. */
export function setupTips(){
  if (!TIP_URL) return;
  for (const a of document.querySelectorAll('.tipLink')){
    a.href = TIP_URL; a.target = '_blank'; a.rel = 'noopener';
    a.addEventListener('click', () => countEvent('tip-click'));
  }
  for (const el of document.querySelectorAll('[data-tip]')) el.hidden = false;
}

export const tipsOn = () => !!TIP_URL;
