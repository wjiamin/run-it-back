/* Display ads (Google AdSense), switched on by the settings below (empty = off, and nothing is loaded).

   Ads only go in the spaces marked <div class="adSlot" data-ad="home|guide" hidden></div>: on the home page and the
   guides. Never on the video or the practice and record tabs: YouTube already plays its own ads in the video, and
   practice needs the screen.

   A space stays hidden until AdSense's script has loaded, and is hidden again if the script is blocked (ad blockers,
   offline), so there is never an empty box. In the EEA, UK and Switzerland, AdSense needs your visitors' consent first:
   turn on its consent message in AdSense (Privacy & messaging); it shows on these pages by itself.

   To switch ads on:
     1. Get your site approved in AdSense, and put your ads.txt where AdSense says (see README.md).
     2. Set ADSENSE_CLIENT to your publisher ID ('ca-pub-…'), and each AD_SLOTS entry to the ID of a display ad unit.
     3. Change CACHE in sw.js, so phones that installed the app fetch the new files.
   If you change where ads show, update privacy.html too. */

/** Your AdSense publisher ID, for example 'ca-pub-1234567890123456'. Empty = no ads. */
export const ADSENSE_CLIENT = '';
/** The display ad unit for each kind of space (AdSense → Ads → By ad unit). An empty one stays hidden. */
export const AD_SLOTS = {home: '', guide: ''};

const SCRIPT = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

export const adsOn = (client = ADSENSE_CLIENT) => !!client;

/**
 * Fill the ad spaces on this page. `log` (optional) notes in the debug log whether the ads script loaded.
 * `config` is for testing; normally the settings above.
 */
export function setupAds(log, {client = ADSENSE_CLIENT, slots = AD_SLOTS, src = SCRIPT} = {}){
  if (!adsOn(client)) return;
  const spaces = [...document.querySelectorAll('.adSlot[data-ad]')].filter(el => slots[el.dataset.ad]);
  for (const el of document.querySelectorAll('[data-ads]')) el.hidden = false;   // e.g. the ads section in privacy.html
  if (!spaces.length) return;

  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = src + '?client=' + encodeURIComponent(client);
  script.onload = () => {
    if (log) log('page', 'ads: script loaded');
    for (const el of spaces) fill(el, client, slots[el.dataset.ad]);
  };
  script.onerror = () => { if (log) log('page', 'ads: script blocked or offline'); };
  document.head.appendChild(script);
}

/** Put one responsive ad unit in the space, under a small "Advertisement" label, and show it. */
function fill(el, client, slot){
  if (el.querySelector('ins.adsbygoogle')) return;
  const label = document.createElement('div');
  label.className = 'adLabel';
  label.textContent = 'Advertisement';
  const ins = document.createElement('ins');
  ins.className = 'adsbygoogle';
  ins.style.display = 'block';
  ins.dataset.adClient = client;
  ins.dataset.adSlot = slot;
  ins.dataset.adFormat = 'auto';
  ins.dataset.fullWidthResponsive = 'true';
  el.replaceChildren(label, ins);
  el.hidden = false;
  try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch {}
}
