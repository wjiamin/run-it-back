/* Keeping the screen on while a video is open, so the phone doesn't dim and lock in the middle of practice.

   Uses the browser's Screen Wake Lock (navigator.wakeLock). The browser drops the lock whenever the page is hidden
   (another app, the screen locked by hand), so it is asked for again when the page is visible again. Browsers without
   it (older iPhones) simply behave as before.

   Usage: const screen = keepScreenOn(log); screen.want(true | false); screen.status() for the debug report. */

export function keepScreenOn(log){
  const supported = 'wakeLock' in navigator;
  let wanted = false;
  let lock = null;          // the current WakeLockSentinel
  let asking = false;       // a request is on its way

  async function ask(){
    if (!supported || !wanted || lock || asking || document.visibilityState !== 'visible') return;
    asking = true;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      if (!wanted){ sentinel.release(); return; }   // no longer wanted by the time it came
      lock = sentinel;
      lock.addEventListener('release', () => { lock = null; });
      log('page', 'screen kept on');
    } catch (e){
      log('page', 'the screen could not be kept on: ' + e.name);
    } finally {
      asking = false;
    }
  }

  document.addEventListener('visibilitychange', ask);

  return {
    /** Keep the screen on (true) or let it sleep as usual (false). */
    want(on){
      wanted = on;
      if (on) ask();
      else if (lock){ lock.release(); lock = null; }
    },
    /** For the debug report: "on", "off" or "not supported". */
    status: () => !supported ? 'not supported' : lock ? 'on' : 'off',
  };
}
