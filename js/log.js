/* The debug log: a short list of recent events and errors, kept on this device only, which the Log panel lets you copy.
   Never log video links, ids or titles. */

const KEY = 'runItBack.log.v1', MAX_ENTRIES = 250;

let entries = readSaved(), saveTimer = 0, listener = null;

function readSaved(){
  try { const saved = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(saved) ? saved : []; } catch { return []; }
}

/** Add an entry. `kind` is a short tag like 'beat' or 'error'. */
export function log(kind, message){
  const d = new Date();
  entries.push({t: d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0'), k: kind, m: String(message).slice(0, 300)});
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  clearTimeout(saveTimer);   // save a moment later, so a burst of entries is one write
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch {} }, 400);
  if (listener) listener();
}

export const logEntries = () => entries;

export function clearLog(){
  entries = [];
  try { localStorage.removeItem(KEY); } catch {}
}

/** Called after every new entry (the Log panel uses it to stay up to date while open). */
export function onLog(fn){ listener = fn; }

// crashes anywhere in the app
window.addEventListener('error', e => log('error', (e.message || 'error') + ' @' + String(e.filename || '').split('/').pop() + ':' + e.lineno));
window.addEventListener('unhandledrejection', e => log('error', 'promise: ' + ((e.reason && e.reason.message) || e.reason)));
