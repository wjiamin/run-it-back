/* Installing to the home screen, and working offline.
   - Registers the service worker (sw.js), which keeps a copy of the app for offline use and makes sure an update
     never mixes old and new files.
   - Shows how to install: an Install button where the browser offers one (Chrome, Android), and the Share-menu steps
     on iPhone and iPad, where Safari has no button.
   - Marks the page when it runs as an installed app, for the status-bar styles in styles.css. */

import {$} from './util.js';

export const isInstalled = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const isAppleMobile = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function setupInstall(log){
  if ('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(e => log('error', 'offline support unavailable: ' + e.message));
  }
  if (isInstalled()){ document.documentElement.classList.add('standalone'); return; }

  const card = $('#installCard'), button = $('#installBtn'), iosTip = $('#iosInstallTip');
  if (isAppleMobile()){ iosTip.hidden = false; card.hidden = false; }

  // Chrome and Android: the browser says when it can install, and we show our own button for it
  let offer = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); offer = e; button.hidden = false; card.hidden = false; });
  button.addEventListener('click', async () => {
    if (!offer) return;
    offer.prompt();
    const {outcome} = await offer.userChoice;
    log('page', 'install ' + outcome);
    offer = null; button.hidden = true; card.hidden = iosTip.hidden;
  });
  window.addEventListener('appinstalled', () => { log('page', 'installed'); card.hidden = true; });
}
