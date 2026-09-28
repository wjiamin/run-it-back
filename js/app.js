/* Run It Back: the app. It holds the state, drives the YouTube player, connects the practice session to it, and keeps
   the page in step. The logic lives in modules that never touch the page (and have tests in tests.js):
     beats.js    tempo from taps or from two marked 1s
     grid.js     beats, counts, blocks and the trimmed range
     plan.js     the practice steps, count-ins, and where to continue
     practice.js the practice session (runs, pauses, count-ins, Again and skipping ahead)
     storage.js  saving on this device
   and two small helpers that do:
     log.js      the debug log
     pwa.js      installing to the home screen and working offline

   The page updates in two ways:
     - on events (a button, a player state change), the matching update... or render... function redraws its part;
     - tick() runs every animation frame for everything tied to the playhead: time, count, count-in, ads, clicks, and
       moving the practice session along.

   Sections, in order: state · helpers · debug report · YouTube player · video layout and full screen · practice session ·
   beat check · every frame · Beats tab · trim window · Practice tab · home and screens · wiring · start */

import {$, $$, clamp, escapeHtml, fmtTime, fmtTimePrecise, rateLabel, parseYouTubeId} from './util.js';
import {fitBeats, eightCountsBetween, periodFromTwoOnes} from './beats.js';
import * as grid from './grid.js';
import {buildPlan, enabledSteps, groupSize, topEvery, ladderWords, stepLabel, countInNumber, resumeIndex} from './plan.js';
import {Practice} from './practice.js';
import {setupInstall} from './pwa.js';
import {setupAnalytics, setupTips, countEvent, tipsOn} from './site.js';
import {loadStore, saveStore, defaultPlan, presets, presetOf} from './storage.js';
import {log, logEntries, clearLog, onLog} from './log.js';

/** Shown in the debug log, so we can tell which build a device runs. Change it with every release. */
const APP_VERSION = '2026-09-28-i';

/* ---------- state ---------- */

const store = loadStore();          // settings and saved covers (see storage.js)
const settings = store.settings;
let cover = null;                   // the open cover: an entry of store.videos

// YouTube player
let player = null;
let playerReady = false;
let playing = false;
let duration = 0;                   // the video's own length in seconds (never an ad's)
let rate = 1;                       // playback speed
let lastPlayerState = '';           // for the debug log
let clockRaw = -1, clockRawAt = 0;  // see currentTime()

// screen
let tab = 'beats';                  // 'beats' or 'practice'
let scrubbing = false;              // dragging the seek bar
let shownCountKey = '';             // what the count display shows, so it only redraws when that changes

// Beats tab
let taps = [];                      // tap times, seconds of video
let lastFit = null;                 // fitBeats() of the taps

// practice (see "practice session")
let session = null;

// sound
let userMuted = !!settings.muted;   // you pressed mute
let soundOff = userMuted;           // the player is muted now (by you, or because the plan has the music off)

// trim window
let zoomed = false, zoomView = null;
let draggingHandle = null;          // 's' or 'e' while a handle is dragged
let previewTime = 0, lastPreviewAt = 0;

// full screen
let fsOn = false;
let fsFallback = false;             // our own full-window layout, used when the browser won't go full screen
let fsBrowser = false;              // the browser's real full screen
let idleTimer = 0;

// ads
let adPlaying = false;              // detected from the player's length
let adUnlocked = false;             // the Ad? button: video unlocked by hand

// beat check
let audio = null;                   // Web Audio context for the click, created on a tap
let nextClickBeat = -1;
let flashTimer = 0, lastFlashBeat = null;

/* ---------- helpers for the open cover ---------- */

const counts = () => settings.counts;
const hasGrid = () => grid.hasGrid(cover);
const hasRange = () => grid.hasRange(cover);
const blocks = () => grid.blocks(cover, counts());
const blockLen = () => counts() * cover.period;
const beatTime = k => grid.beatTime(cover, k);
const nearestBeat = t => grid.nearestBeat(cover, t);
const beatAt = t => grid.beatAt(cover, t);
const snap = t => grid.snapToBeat(cover, t);
const countOfBeat = k => grid.countOfBeat(cover, counts(), k);
const rangeCounts = () => nearestBeat(cover.rangeEnd) - nearestBeat(cover.rangeStart);
const fixRange = () => grid.fixRange(cover, counts(), duration);
const bpm = () => 60 / cover.period;

let saveFailed = false;
function save(){
  if (!saveStore(store) && !saveFailed){ saveFailed = true; log('error', 'could not save: browser storage is blocked or full'); }
}
/** Save after changing the open cover (also marks it as recently used, for the home list). */
function saveCover(){ if (cover) cover.updated = Date.now(); save(); }

/* ---------- debug report ---------- */

function debugReport(){
  const nav = navigator, lines = [];
  const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || nav.standalone;
  lines.push('Run It Back debug report', 'version: ' + APP_VERSION, 'time: ' + new Date().toString(), 'browser: ' + nav.userAgent,
    'screen: ' + screen.width + 'x' + screen.height + ' @' + (window.devicePixelRatio || 1) + 'x, window ' + innerWidth + 'x' + innerHeight +
    ' (' + (innerWidth > innerHeight ? 'landscape' : 'portrait') + '), touch ' + (('ontouchstart' in window) || nav.maxTouchPoints > 0 ? 'yes' : 'no') +
    ', home-screen app ' + (standalone ? 'yes' : 'no'));

  lines.push('', '--- state');
  const inPlayer = !$('#viewPlayer').hidden;
  lines.push('screen: ' + (inPlayer ? 'player, ' + tab + ' tab' : 'home'));
  if (cover && inPlayer){
    lines.push('beat: ' + (hasGrid() ? bpm().toFixed(2) + ' BPM' : 'not set') +
      (lastFit ? ', tap steadiness ' + Math.round(lastFit.rms * 1000) + ' ms' : '') +
      (cover.one1 != null ? ', 1 marked at ' + fmtTimePrecise(cover.one1) : ', no 1 marked') +
      (cover.oneBeats ? ', later 1 at ' + fmtTimePrecise(cover.one2) + ' (' + cover.oneBeats / counts() + ' eight-counts apart)' : '') +
      ', flash ' + (settings.flash ? 'on' : 'off') + ', click ' + (settings.click ? 'on' : 'off'));
    lines.push('video: length ' + (duration || '?') + ' s, ' + (playerReady ? (playing ? 'playing' : 'not playing') : 'player not ready') +
      ', speed ' + rate + 'x, sound ' + (soundOff ? 'off' : 'on') + ', ad ' + (adPlaying ? 'playing' : adUnlocked ? 'unlocked by hand' : 'no'));
    lines.push('full screen: ' + (fsOn ? (fsFallback ? 'on (fallback layout)' : 'on (browser)') : 'off'));
    if (hasRange()) lines.push('range: ' + fmtTimePrecise(cover.rangeStart) + ' to ' + fmtTimePrecise(cover.rangeEnd) + ', ' + rangeCounts() + ' counts, ' + blocks().length + ' blocks');
    lines.push('practice: ' + (!session ? 'not running' : session.done ? 'complete'
      : 'step ' + (session.index + 1) + ' of ' + session.plan.length + ', rep ' + (session.rep + 1) +
        (session.waiting ? ', waiting for you' : '') + (session.pausing ? ', pausing' : '')));
  }
  lines.push('settings: ' + JSON.stringify(settings));

  const entries = logEntries();
  lines.push('', '--- log (oldest first, ' + entries.length + ' entries)');
  for (const e of entries) lines.push(e.t + '  ' + e.k.padEnd(9) + ' ' + e.m);
  return lines.join('\n');
}
function renderDebug(){ const box = $('#dbgText'); box.value = debugReport(); box.scrollTop = box.scrollHeight; }
function openDebug(){ $('#dbgPanel').hidden = false; $('#dbgMsg').textContent = ''; renderDebug(); $('#dbgClose').focus(); }
function closeDebug(){ $('#dbgPanel').hidden = true; ($('#viewHome').hidden ? $('#dbgBtn') : $('#dbgFootBtn')).focus(); }
async function copyDebug(){
  const text = debugReport(), box = $('#dbgText'), msg = $('#dbgMsg');
  try { await navigator.clipboard.writeText(text); msg.textContent = 'Copied. Paste it into the chat.'; return; } catch {}
  // older browsers: select the text and use the old copy command
  try {
    box.focus(); box.select(); box.setSelectionRange(0, box.value.length);
    msg.textContent = document.execCommand('copy') ? 'Copied. Paste it into the chat.' : 'Select all the text and copy it by hand.';
  } catch { msg.textContent = 'Select all the text and copy it by hand.'; }
}

/* ---------- YouTube player ---------- */

const STATE = {ENDED: 0, PLAYING: 1, PAUSED: 2, CUED: 5};   // the YouTube player's state codes that we use

let apiPromise = null;
function loadYouTubeApi(){
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    if (window.YT && YT.Player) return resolve();
    window.onYouTubeIframeAPIReady = resolve;
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => { apiPromise = null; reject(new Error('offline')); };
    document.head.appendChild(script);
  });
  return apiPromise;
}

function showStageMessage(text){ const m = $('#stageMsg'); m.hidden = !text; m.textContent = text || ''; }

async function openCover(id){
  cover = store.videos[id] || (store.videos[id] = {id, title: '', period: 0, anchor: null, rangeStart: null, rangeEnd: null, updated: Date.now()});
  taps = []; lastFit = null;
  if (session){ session.stop(); session = null; }
  playerReady = false; duration = cover.dur || 0; clockRaw = -1; shownCountKey = ''; zoomed = false;
  adUnlocked = false; adPlaying = false; lastPlayerState = ''; setMore(false);
  log('video', 'open: ' + (hasGrid() ? 'beat set (' + bpm().toFixed(1) + ' BPM)' : 'no beat yet') + ', stored length ' + (cover.dur || 'none'));
  setRate(1);
  showView('player'); showStageMessage('Loading video…');
  countEvent('video-open');
  setTab(hasGrid() ? 'practice' : 'beats');
  $('#heading').textContent = cover.title || 'Loading…';

  try { await loadYouTubeApi(); }
  catch {
    log('error', 'the YouTube player script did not load (offline or blocked)');
    showStageMessage('Could not reach YouTube. Check your connection and try again.');
    return;
  }
  if (player && player.cueVideoById){   // the player already exists: swap the video
    player.cueVideoById(id); playerReady = true; player.setPlaybackRate(rate); applySound(); showStageMessage('');
    return;
  }
  player = new YT.Player('player', {
    videoId: id,
    playerVars: {playsinline: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, iv_load_policy: 3, cc_load_policy: 0,
      enablejsapi: 1, origin: location.origin},
    events: {onReady: onPlayerReady, onStateChange: onPlayerState, onError: onPlayerError},
  });
}

function captionsOff(){ try { player.unloadModule('captions'); player.unloadModule('cc'); } catch {} }

function onPlayerReady(){
  playerReady = true;
  log('player', 'ready');
  showStageMessage(''); player.setPlaybackRate(rate); captionsOff(); applySound(); readVideoInfo(false); layoutVideo();
}

/* The video's title and length are read only while it is cued, before anything plays. Once it plays, an ad can report its
   own length, and that must never replace the real one, because the trimmed range is clamped to it. The length is saved. */
function acceptDuration(d, fromCue){
  if (!d || (duration && !fromCue) || d === duration) return;
  duration = d;
  if (cover){ cover.dur = d; save(); }
  log('video', 'length ' + d + ' s' + (fromCue ? ' (read while cued)' : ''));
  refreshAll();
}
function readVideoInfo(fromCue){
  if (!player.getVideoData || playing) return;
  const info = player.getVideoData();
  if (info && info.title && cover){ cover.title = info.title; save(); $('#heading').textContent = info.title; }
  acceptDuration(player.getDuration() || 0, fromCue);
}

function onPlayerState(e){
  playerReady = true;
  playing = e.data === STATE.PLAYING;
  // log the main states, but not the constant play and pause of a running practice (it logs its own steps)
  const name = {[STATE.ENDED]: 'ended', [STATE.PLAYING]: 'playing', [STATE.PAUSED]: 'paused', [STATE.CUED]: 'cued'}[e.data];
  if (name && name !== lastPlayerState && !(session && (e.data === STATE.PLAYING || e.data === STATE.PAUSED))) log('player', name);
  if (name) lastPlayerState = name;

  $('#playBtn').textContent = playing ? '❚❚' : '▶';
  if (e.data === STATE.CUED) readVideoInfo(true);
  if (e.data === STATE.PLAYING){ showStageMessage(''); captionsOff(); if (player.setPlaybackRate) player.setPlaybackRate(rate); }
  if (e.data === STATE.ENDED && sessionRunning()) session.segmentEnd();   // the part ran to the very end of the video
  clockRaw = -1;
  updateSessionUI(); bumpControls();
}

function onPlayerError(e){
  const code = e.data;
  log('error', 'YouTube player error ' + code);
  showStageMessage(code === 101 || code === 150 ? "This video's owner doesn't allow it to play here. Try another upload of the same practice video."
    : code === 100 ? 'Video not found or private.'
    : code === 2 ? "That link doesn't look like a valid video."
    : 'Could not play this video (error ' + code + ').');
}

/** The playhead in seconds. The player's clock only updates a few times a second, so in between it is extrapolated. */
function currentTime(){
  if (!playerReady || !player || !player.getCurrentTime) return 0;
  const raw = player.getCurrentTime(), now = performance.now();
  if (raw !== clockRaw){ clockRaw = raw; clockRawAt = now; return raw; }
  return playing ? raw + (now - clockRawAt) / 1000 * rate : raw;
}

function seek(t){
  if (!playerReady) return;
  const wasPlaying = playing;
  player.seekTo(Math.max(0, t), true);
  clockRaw = -1; nextClickBeat = -1;
  if (!wasPlaying) player.pauseVideo();   // seeking a paused or unstarted video would otherwise start it
}
function play(){ if (playerReady) player.playVideo(); }
function pause(){ if (playerReady) player.pauseVideo(); }
function togglePlay(){ if (!playerReady) return; playing ? player.pauseVideo() : player.playVideo(); }
function setRate(r){ rate = r; if (playerReady && player.setPlaybackRate) player.setPlaybackRate(r); syncControls(); }
function setMirror(on){ settings.mirror = on; save(); syncControls(); }

function toggleMute(){
  if (!playerReady) return;
  userMuted = !soundOff;
  soundOff = userMuted;
  if (soundOff) player.mute(); else player.unMute();
  settings.muted = userMuted; save(); syncControls();
  log('sound', 'you turned the sound ' + (soundOff ? 'off' : 'on'));
}
/** Whether the plan wants music now: the block drills and the connected/whole runs each have their own setting. */
function musicWanted(){
  if (!session || session.done || session.waiting) return true;
  return session.plan[session.index].kind === 'block' ? settings.musicBlocks : settings.musicFull;
}
/** Mute or unmute the player to match your mute button and the plan. */
function applySound(){
  if (!playerReady || !player.mute) return;
  soundOff = !musicWanted() || userMuted;
  if (soundOff) player.mute(); else player.unMute();
  syncControls();
}

/* ---------- video layout and full screen ---------- */

/* Fit a 16:9 video inside the stage. The iframe is taller than the video by TITLE_STRIP above and below, and black masks
   cover that strip, which is where YouTube draws its title bar. */
const TITLE_STRIP = 96;
function layoutVideo(){
  const stage = $('#stage'), W = stage.clientWidth, H = stage.clientHeight;
  if (!W || !H) return;
  // in full screen keep the video inside the safe area, so a phone's notch or home bar doesn't push it off-centre
  let left = 0, right = 0, top = 0, bottom = 0;
  if (fsOn){
    const safe = getComputedStyle($('#safeProbe'));
    left = parseFloat(safe.paddingLeft) || 0; right = parseFloat(safe.paddingRight) || 0;
    top = parseFloat(safe.paddingTop) || 0; bottom = parseFloat(safe.paddingBottom) || 0;
  }
  const availW = W - left - right, availH = H - top - bottom;
  const vidH = Math.min(availH, availW * 9 / 16), vidW = vidH * 16 / 9, wrap = $('#playerWrap');
  wrap.style.width = vidW + 'px'; wrap.style.height = (vidH + 2 * TITLE_STRIP) + 'px';
  wrap.style.left = (left + (availW - vidW) / 2) + 'px'; wrap.style.top = (top + (availH - vidH) / 2 - TITLE_STRIP) + 'px';
  $('#maskT').style.height = Math.max(0, top + (availH - vidH) / 2) + 'px';
  $('#maskB').style.height = Math.max(0, bottom + (availH - vidH) / 2) + 'px';
}

/* Full screen moves the controls into the stage: the play bar into #fsBar at the bottom, the count into #fsCount in the
   corner. Leaving puts them back. */
function setFs(on){
  fsOn = on;
  setTimeout(() => log('fullscreen', fsOn ? 'on, ' + (fsFallback ? 'fallback layout' : 'browser full screen') +
    ', stage ' + $('#stage').clientWidth + 'x' + $('#stage').clientHeight : 'off'), 250);
  const stage = $('#stage');
  stage.classList.toggle('fs', on); stage.classList.toggle('pseudo', on && fsFallback);
  document.body.classList.toggle('noscroll', on && fsFallback);
  document.body.classList.toggle('fsmode', on);
  if (on){
    $('#fsBar').append($('#ctlMain'), $('#ctlOpts'));
    $('#fsCount').prepend($('#countRow'));
  } else {
    $('#ctlMainHome').append($('#ctlMain'));
    $('#ctlOptsHome').append($('#ctlOpts'));
    $('#ctlMain').insertBefore($('#countRow'), $('#ctlMain .bar'));
    stage.classList.remove('idle'); setMore(false); clearTimeout(idleTimer);
  }
  syncControls(); requestAnimationFrame(layoutVideo); setTimeout(layoutVideo, 150);
  if (on) bumpControls();
}
/** The ⋯ button in full screen shows or hides speed, mirror and the practice buttons. */
function setMore(on){ $('#stage').classList.toggle('more', on); $('#moreBtn').setAttribute('aria-pressed', on); }

async function toggleFs(){
  const stage = $('#stage');
  if (fsOn){
    if (fsBrowser && (document.fullscreenElement || document.webkitFullscreenElement)) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else { fsFallback = false; fsBrowser = false; setFs(false); }
    return;
  }
  const request = stage.requestFullscreen || stage.webkitRequestFullscreen;
  fsFallback = !request;
  if (!request) return setFs(true);
  // Use the browser's full screen where allowed (its change event calls setFs). Some browsers, and iPhone Safari, never
  // answer or refuse, so after a moment fall back to our own full-window layout.
  const useFallback = why => { if (!fsOn){ log('fullscreen', why + ', using the fallback layout'); fsFallback = true; setFs(true); } };
  try {
    const p = request.call(stage);
    if (p && p.then) await Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('no answer')), 800))]);
    await new Promise(r => setTimeout(r, 150));
    useFallback('the browser did not go full screen');
  } catch { useFallback('the browser refused full screen'); }
}
function onFullscreenChange(){
  const el = document.fullscreenElement || document.webkitFullscreenElement;
  if (el === $('#stage')){ fsBrowser = true; fsFallback = false; setFs(true); }
  else if (fsOn && fsBrowser){ fsBrowser = false; setFs(false); }
}

/** In full screen the controls fade while playing; any touch or mouse movement brings them back. */
function bumpControls(){
  const stage = $('#stage');
  if (!fsOn) return;
  stage.classList.remove('idle'); clearTimeout(idleTimer);
  if (playing) idleTimer = setTimeout(() => { if (fsOn && playing) stage.classList.add('idle'); }, 3000);
}

/* ---------- practice session ----------
   The session itself is in practice.js. Here it gets connected to the player and the page, and its progress is saved on
   the cover so you can continue where you left off. */

/** What the practice session needs from the app (see practice.js). */
const practiceEnv = {
  settings,
  period: () => cover.period,
  seek, play, pause, log,
  now: () => performance.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: id => clearTimeout(id),
  onStep: step => { setRate(step.rate); applySound(); rememberProgress(step); },
  onFinish: () => { applySound(); forgetProgress(); countEvent('practice-complete'); },
  onChange: () => updateSessionUI(),
};

const sessionRunning = () => !!session && session.running;
/** The step being played, or the one just finished while waiting for you. */
const currentStep = () => session ? session.current : null;
function currentBlockNum(){ const st = currentStep(); return st && st.kind === 'block' ? st.block : 0; }
/** The first and last block the current step covers. */
function currentSpan(){
  const st = currentStep();
  return !st ? null : st.kind === 'block' ? [st.block, st.block] : st.kind === 'connect' || st.kind === 'top' ? [st.a, st.b] : null;
}

const buildCurrentPlan = mode => buildPlan(settings, blocks(), {s: cover.rangeStart, e: cover.rangeEnd}, mode);

/** Build the plan and start at the first step matching `isStart(step, index)` (or the first step). */
function startSession(mode, isStart){
  if (!hasRange()) return;
  if (session) session.stop();
  const plan = buildCurrentPlan(mode);
  if (!plan.length) return;
  const index = Math.max(0, plan.findIndex(isStart));
  session = new Practice(plan, mode, index, practiceEnv);
  log('practice', 'start (' + mode + '): ' + plan.length + ' steps, from step ' + (index + 1));
  session.start();
}
const gotoBlock = n => startSession('all', st => st.kind === 'block' && st.block === n);
const gotoConnect = g => startSession('all', st => st.part === 'c' + g);
const startFull = () => startSession('full', () => true);
const startFromBeginning = () => startSession('all', (_, i) => i === 0);
function restartPart(){
  const st = currentStep();
  if (!st) return;
  if (session.mode === 'full') return startFull();
  startSession('all', s => s.part === st.part);
}

function endSession(why){
  if (!session) return;
  log('practice', 'stopped: ' + (why || 'the trim, plan or beat was changed'));
  session.stop(); session = null; applySound(); updateSessionUI();
}

/** The big practice button: start (or continue where you left off), carry on after a pause or wait, or play/pause. */
function onMainButton(){
  if (!session){
    countEvent('practice-start');
    const resume = resumePoint();
    return resume ? startSession('all', (_, i) => i === resume.index) : startFromBeginning();
  }
  if (session.done) return startFromBeginning();
  if (session.waiting || session.pausing) return session.continueNow();
  togglePlay();
}
function again(){ if (session) session.again(); }
function skipAhead(){ if (session) session.skip(); }

/* Continue where you left off: each full-plan step that starts is saved on the cover (cover.resume), and cleared when
   the plan finishes. It only applies while the range and counts per block are unchanged (see plan.js resumeIndex). */
function rememberProgress(step){
  if (session.mode !== 'all') return;
  cover.resume = {part: step.part, rate: step.rate, label: stepLabel(step), counts: counts(), rangeStart: cover.rangeStart, rangeEnd: cover.rangeEnd};
  saveCover();
}
function forgetProgress(){ if (cover.resume && session.mode === 'all'){ delete cover.resume; saveCover(); } }
/** Where the saved progress continues: {index, step} in the full plan, or null (nothing saved, or it's the first step). */
function resumePoint(){
  if (!hasRange() || !cover.resume) return null;
  const plan = buildCurrentPlan('all');
  const index = resumeIndex(plan, cover.resume, {s: cover.rangeStart, e: cover.rangeEnd, counts: counts(), period: cover.period});
  return index > 0 ? {index, step: plan[index]} : null;
}

/* ---------- beat check: flash and click ---------- */

function beatFlash(isOne){
  if (!settings.flash) return;
  const ring = $('#flash'), num = $('#cNum');
  ring.classList.toggle('one', isOne); ring.classList.add('on'); num.classList.add('pulse');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { ring.classList.remove('on'); num.classList.remove('pulse'); }, 90);
}

/** Browsers only allow sound to start from a tap, so this is called from one. */
function ensureAudio(){
  try {
    if (!audio){ const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; audio = new AC(); }
    if (audio.state === 'suspended') audio.resume();
  } catch (e) { log('error', 'click sound unavailable: ' + e.message); return null; }
  return audio;
}
function beep(when, accent){
  const osc = audio.createOscillator(), gain = audio.createGain();
  osc.frequency.value = accent ? 1760 : 1100;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, when + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
  osc.connect(gain).connect(audio.destination); osc.start(when); osc.stop(when + 0.08);
}
/** Schedule clicks a moment ahead on the audio clock, turning video time into real time with the playback speed. */
function scheduleClicks(t){
  if (!settings.click || !audio || !playing || !hasGrid() || adPlaying || (session && session.pausing)){ nextClickBeat = -1; return; }
  const firstAhead = Math.ceil((t - cover.anchor) / cover.period - 0.02);
  if (nextClickBeat < firstAhead) nextClickBeat = firstAhead;
  for (;;){
    const wait = (beatTime(nextClickBeat) - t) / rate;   // seconds of real time until that beat
    if (wait > 0.2) break;
    if (wait > -0.03) beep(audio.currentTime + Math.max(0, wait), countOfBeat(nextClickBeat) === 1);
    nextClickBeat++;
  }
}

/* ---------- every frame ---------- */

function tick(){
  requestAnimationFrame(tick);
  if (!cover || $('#viewPlayer').hidden) return;
  if (!duration && playerReady && !playing && player.getDuration) acceptDuration(player.getDuration() || 0, false);
  const t = currentTime();
  watchForAds();
  updateTimeUI(t);
  const countIn = countInNow(t);
  updateCountUI(t, countIn);
  scheduleClicks(t);
  followSession(t);
  showCue(countIn);
}

/* An ad is playing when the player reports a different length from the video's own. Practice waits, and the video is
   unlocked so you can press the ad's own Skip button. */
function watchForAds(){
  const reported = playerReady && playing && duration && player.getDuration ? player.getDuration() : 0;
  const wasAd = adPlaying;
  adPlaying = reported > 0 && Math.abs(reported - duration) > 1.5;
  if (adPlaying !== wasAd) log('ad', adPlaying ? 'ad detected (the player reports ' + reported.toFixed(0) + ' s, the video is ' + duration + ' s)' : 'ad ended');
  $('#stage').classList.toggle('ad', adPlaying || adUnlocked);
  const note = $('#adNote');
  const msg = adPlaying ? 'An ad is playing. Tap the video to use its Skip button when it appears. Your practice waits until the ad ends.'
    : adUnlocked ? 'The video is unlocked, so you can tap it. Press Ad? again to lock it.' : '';
  if (note.textContent !== msg){ note.textContent = msg; note.hidden = !msg; }
  if (wasAd && !adPlaying && sessionRunning()) session.startRun(0);   // the ad ended: restart this run properly
}

function updateTimeUI(t){
  if (!scrubbing && duration) $('#scrub').value = Math.round(t / duration * 1000);
  $('#timeLbl').textContent = fmtTime(t) + ' / ' + fmtTime(duration);
  if (!$('#pBody').hidden && duration && hasRange()){
    const p = pct(t), head = $('#tPlay');
    head.style.display = p < 0 || p > 100 ? 'none' : ''; head.style.left = p + '%';
  }
}

/** The count-in number (5, 6, 7, 8) if a practice run is in its count-in now, else 0. */
function countInNow(t){
  if (!sessionRunning() || !playing || adPlaying || session.countIn <= 0) return 0;
  const inCountIn = session.preRoll || t < session.plan[session.index].s - cover.period * 0.25;
  if (!inCountIn) return 0;
  const i = Math.floor((t - session.from) / cover.period + 0.15);
  return i >= 0 && i < session.countIn ? countInNumber(session.countIn, i, counts()) : 0;
}

function updateCountUI(t, countIn){
  const where = adPlaying ? null : countIn ? {count: countIn, block: 0, lead: true} : grid.whereIs(cover, counts(), t);
  const key = adPlaying ? 'ad' : where ? (where.out || where.block + ':' + where.count) : '-';
  const beatsVisible = playing && hasGrid() && !adPlaying;
  if (key !== shownCountKey){
    shownCountKey = key;
    $('#cNum').textContent = where && !where.out ? where.count : '–';
    $('#cLbl').textContent = adPlaying ? 'ad playing' : !where ? 'no beat yet' : where.out ? where.out : where.lead ? 'count-in' : 'Block ' + where.block;
    [...$('#cSegs').children].forEach((seg, i) => seg.classList.toggle('on', !!where && !where.out && i + 1 === where.count));
    if (beatsVisible) beatFlash(countOfBeat(beatAt(t)) === 1);
  }
  // outside the range the count shows '–', but the flash should still mark every beat
  if (beatsVisible && settings.flash && where && where.out){
    const k = beatAt(t);
    if (k !== lastFlashBeat){ lastFlashBeat = k; beatFlash(countOfBeat(k) === 1); }
  }
}

/** Move the practice along when the playhead reaches the end of a run; stop it if you scrubbed away. */
function followSession(t){
  if (!sessionRunning() || !playing || adPlaying || performance.now() <= session.ignoreUntil) return;
  const st = session.plan[session.index];
  if (t >= st.e && t < st.e + 1.5) session.segmentEnd();
  else if (t < session.from - 1.5 || t >= st.e + 1.5){
    endSession('the playhead left the part (at ' + t.toFixed(1) + ' s, expected ' + session.from.toFixed(1) + ' to ' + st.e.toFixed(1) + ' s)');
  }
}

/** The big count-in number over the video. */
function showCue(countIn){
  const cue = countIn ? String(countIn) : '', el = $('#cue');
  if (el.textContent !== cue){ el.textContent = cue; el.hidden = !cue; }
}

/* ---------- Beats tab ----------
   Step 1 sets a rough tempo (taps or a typed BPM). Steps 2 and 3 mark two 1s; the gap between them makes the tempo exact
   (beats.js). The marks are saved on the cover as one1/one2/oneBeats, and oneT is the 1 the counts follow. */

/** After any change to the beat: stop practice, keep the range on the new beats, save and redraw. */
function beatChanged(){
  endSession('the beat was changed');
  fixRange(); saveCover(); refreshAll(); shownCountKey = '';
}

function applyTaps(){
  lastFit = fitBeats(taps);
  if (taps.length % 4 === 0){
    log('beat', 'taps ' + taps.length + ': ' + (lastFit ? (60 / lastFit.period).toFixed(1) + ' BPM, steadiness ' + Math.round(lastFit.rms * 1000) + ' ms' : 'could not find a steady beat yet'));
  }
  if (lastFit){ cover.period = lastFit.period; cover.anchor = lastFit.phase; forgetLaterOne(); beatChanged(); }
  updateBeatsUI();
}
function tap(){
  if (!playerReady || !cover || adPlaying) return;
  taps.push(currentTime());
  applyTaps();
  if (navigator.vibrate) navigator.vibrate(8);
  const button = $('#tapBtn'); button.classList.add('hit'); setTimeout(() => button.classList.remove('hit'), 90);
}
function undoTap(){
  if (!taps.length) return;
  log('beat', 'undo tap');
  taps.pop();
  if (taps.length >= 4) applyTaps(); else { lastFit = null; updateBeatsUI(); }
}
function resetTaps(){ taps = []; lastFit = null; updateBeatsUI(); }

/** Before changing the tempo, put the grid's anchor on the range start, so the range stays put while the beats around it move. */
function anchorOnRange(){ if (hasRange()) cover.anchor = cover.rangeStart; }

/** A typed BPM. With no beat yet, the playhead counts as a beat until you mark a 1. */
function applyBpm(value){
  if (!cover) return;
  if (!(value >= 40 && value <= 300)){ log('beat', 'typed BPM rejected: ' + value); return; }
  log('beat', 'typed BPM ' + value + (hasGrid() ? '' : ' (no beat yet, so the playhead counts as a beat)'));
  if (hasGrid()){ anchorOnRange(); cover.period = 60 / value; }
  else { cover.period = 60 / value; cover.anchor = currentTime(); }
  forgetLaterOne(); lastFit = null; beatChanged();
}

/** Step 2: the 1 where the dance starts. It becomes the 1 the counts follow and the start of the trimmed range. */
function markFirstOne(){
  if (!hasGrid() || !playerReady || adPlaying) return;
  const t = currentTime(), C = counts();
  // keep the range's length (the whole song, unless you trimmed it); fixRange stops it at the end of the video
  const rangeLength = hasRange() ? cover.rangeEnd - cover.rangeStart : duration;
  cover.one1 = t; cover.oneT = t;
  if (cover.one2 != null && Math.abs(cover.one2 - t) >= C * cover.period * 0.9){
    cover.oneBeats = eightCountsBetween(t, cover.one2, cover.period, C) * C;   // a later 1 is already marked: re-lock
    lockTempoFromTwoOnes();
  } else {
    cover.anchor += t - snap(t);   // slide the grid so a beat sits exactly on this 1
  }
  cover.rangeStart = t; cover.rangeEnd = t + rangeLength;
  log('beat', 'marked the 1 where the part starts (' + fmtTimePrecise(t) + ')');
  lastFit = null; taps = [];
  beatChanged();
}

/** Step 3: a later 1. The gap to the first 1 sets the exact tempo. */
function markLaterOne(){
  if (!hasGrid() || !playerReady || adPlaying) return;
  const t = currentTime(), C = counts();
  if (cover.one1 == null){ $('#oneStatus').textContent = 'Mark the 1 where the dance starts first (step 2).'; return; }
  if (Math.abs(t - cover.one1) < C * cover.period * 0.9){
    $('#oneStatus').textContent = 'That is less than one 8-count away. Skip further ahead and try again.';
    return;
  }
  const before = bpm();
  cover.one2 = t;
  cover.oneBeats = eightCountsBetween(cover.one1, t, cover.period, C) * C;
  lockTempoFromTwoOnes();
  log('beat', 'marked a later 1: ' + cover.oneBeats / C + ' eight-counts apart, tempo ' + before.toFixed(2) + ' → ' + bpm().toFixed(2) + ' BPM');
  lastFit = null; taps = [];
  beatChanged();
}

function lockTempoFromTwoOnes(){
  if (cover.one1 == null || cover.one2 == null || !cover.oneBeats) return;
  cover.period = periodFromTwoOnes(cover.one1, cover.one2, cover.oneBeats);
  cover.anchor = cover.one1; cover.oneT = cover.one1;
}

/** The gap is a guess from the rough tempo: − and + fix it when the guess is one 8-count out. */
function changeGap(delta){
  if (!cover.oneBeats) return;
  const C = counts(), n = cover.oneBeats / C + delta;
  if (n < 1) return;
  cover.oneBeats = n * C; lockTempoFromTwoOnes();
  log('beat', 'gap changed to ' + n + ' eight-counts: ' + bpm().toFixed(2) + ' BPM');
  beatChanged();
}

/** A tapped or typed tempo replaces the two-1s tempo (the 1 itself stays). */
function forgetLaterOne(){ if (cover){ cover.one2 = null; cover.oneBeats = 0; } }

/** The "Move the video" buttons: pause and step the playhead, to land exactly on a 1. */
function stepVideo(seconds){ if (!playerReady) return; if (playing) player.pauseVideo(); seek(Math.max(0, currentTime() + seconds)); }

/** The Fine-tune buttons. */
function nudgeTiming(seconds){
  cover.anchor += seconds;
  if (hasRange()){ cover.rangeStart += seconds; cover.rangeEnd += seconds; }
  for (const f of ['oneT', 'one1', 'one2']) if (cover[f] != null) cover[f] += seconds;   // the marked 1s move with the count
  log('beat', 'adjusted: timing ' + seconds + ' s');
  beatChanged();
}
function nudgeTempo(change, what){
  anchorOnRange(); cover.period = change(cover.period); forgetLaterOne();
  log('beat', 'adjusted: ' + what);
  beatChanged();
}

function updateBeatsUI(){
  const ready = hasGrid();
  $('#bpmLbl').textContent = ready ? bpm().toFixed(1) + ' BPM' : '–';
  let sub = ready ? 'Counting every ' + (cover.period * 1000).toFixed(0) + ' ms' : taps.length ? taps.length + ' taps so far, need 4' : 'Not set yet';
  if (ready && lastFit && taps.length >= 8){
    const ms = lastFit.rms * 1000;
    sub += ms < 25 ? ' · steady taps' : ms < 45 ? ' · taps a little uneven' : ' · taps uneven. Try half speed, or type the BPM';
  }
  $('#bpmSub').textContent = sub;
  $('#tapN').textContent = taps.length ? '(' + taps.length + ')' : '';
  $('#toPractice').disabled = !ready;
  $('#undoTap').disabled = !taps.length;
  if (document.activeElement !== $('#bpmIn')) $('#bpmIn').value = ready ? bpm().toFixed(cover.oneBeats ? 2 : 1) : '';
  $$('[data-nudge],[data-bpm],#halfBtn,#dblBtn').forEach(b => b.disabled = !ready);

  const hasFirst = ready && cover.one1 != null, locked = hasFirst && cover.one2 != null && cover.oneBeats > 0;
  $('#markOne1').disabled = !ready; $('#markOne2').disabled = !hasFirst;
  $('#markOne1').textContent = hasFirst ? 'Move the 1 here' : 'This is a 1';
  $('#gapRow').hidden = !locked;
  if (locked) $('#gapLbl').textContent = cover.oneBeats / counts() + ' eight-counts between the two 1s';
  $('#oneStatus').textContent = !ready ? 'Set a rough tempo first (step 1).'
    : locked ? '✓ Tempo locked from the two 1s: ' + bpm().toFixed(2) + ' BPM. The count now follows your 1. If it drifts, the gap above may be one 8-count out: try − or +.'
    : hasFirst ? '✓ The 1 is at ' + fmtTimePrecise(cover.one1) + '. Now mark a later 1 to make the tempo exact.'
    : '';
}

/* ---------- trim window ----------
   A bar for the whole video (or a zoomed part of it) with two handles for the start and end of the part to learn. */

const trimView = () => zoomed && zoomView ? zoomView : [0, duration || 1];
/** Time t as a percentage across the trim bar. */
function pct(t){ const [a, b] = trimView(); return (t - a) / (b - a) * 100; }
function tFromX(x){
  const r = $('#tIn').getBoundingClientRect(), [a, b] = trimView();
  return a + clamp((x - r.left) / r.width, 0, 1) * (b - a);
}
function setZoomView(){
  const span = cover.rangeEnd - cover.rangeStart, pad = Math.max(6, span * 0.25);
  zoomView = [Math.max(0, cover.rangeStart - pad), Math.min(duration, cover.rangeEnd + pad)];
}

function updateTrim(){
  if (!hasRange() || !duration) return;
  const a = clamp(pct(cover.rangeStart), 0, 100), b = clamp(pct(cover.rangeEnd), 0, 100);
  $('#tSel').style.left = a + '%'; $('#tSel').style.width = Math.max(0, b - a) + '%';
  $('#tHS').style.left = a + '%'; $('#tHE').style.left = b + '%';
  $('#tTicks').innerHTML = blocks().slice(1).map(bl => {
    const p = pct(bl.s);
    return p > 0 && p < 100 ? '<i class="tTick" style="left:' + p + '%"></i>' : '';
  }).join('');
  $('#tHS').setAttribute('aria-valuetext', fmtTimePrecise(cover.rangeStart));
  $('#tHE').setAttribute('aria-valuetext', fmtTimePrecise(cover.rangeEnd));
  $('#zoomBtn').setAttribute('aria-pressed', zoomed);
}
/** Redraw the range labels, bar and block list (while dragging). */
function updateRangeLite(){
  $('#tsLbl').textContent = fmtTimePrecise(cover.rangeStart); $('#teLbl').textContent = fmtTimePrecise(cover.rangeEnd);
  const nb = blocks().length, startCount = countOfBeat(nearestBeat(cover.rangeStart));
  $('#rangeInfo').textContent = rangeCounts() + ' counts · ' + nb + ' block' + (nb > 1 ? 's' : '') +
    (startCount !== 1 ? ' · starts on ' + startCount + ', not a 1' : '');
  updateTrim(); renderChips();
}
function updateRangeUI(){ if (zoomed) setZoomView(); updateRangeLite(); }

/** The frame to show while moving a handle: the start itself, or a moment before the end. */
const previewFor = which => which === 's' ? cover.rangeStart : Math.max(cover.rangeStart, cover.rangeEnd - 2 * cover.period);

/** Move a handle to time t, on a beat. Dragging with a marked 1 snaps to 1s; the ◀ 1 ▶ buttons still move one count. */
function moveHandle(which, t, preview, snapToOne){
  const b = grid.beatBounds(cover, duration);
  let k = nearestBeat(t);
  if (snapToOne && cover.oneT != null){ const one = grid.downbeat(cover), C = counts(); k = one + Math.round((k - one) / C) * C; }
  if (which === 's'){ k = clamp(k, b.min, nearestBeat(cover.rangeEnd) - 1); cover.rangeStart = beatTime(k); }
  else { k = clamp(k, nearestBeat(cover.rangeStart) + 1, b.max); cover.rangeEnd = beatTime(k); }
  updateRangeLite();
  if (preview){
    previewTime = previewFor(which);
    const now = performance.now();
    if (now - lastPreviewAt > 120){ lastPreviewAt = now; seek(previewTime); }   // at most ~8 seeks a second
  }
}
function commitRange(seekTo){
  if (hasRange()) log('range', fmtTimePrecise(cover.rangeStart) + ' to ' + fmtTimePrecise(cover.rangeEnd) + ', ' + rangeCounts() + ' counts, ' + blocks().length + ' blocks');
  saveCover(); endSession();
  if (seekTo != null) seek(seekTo);
  updateSessionUI();
}
function setRangeEdgeToNow(which){
  const t = snap(currentTime());
  if (which === 's'){
    cover.rangeStart = t;
    if (cover.rangeEnd <= t + cover.period / 2) cover.rangeEnd = t + 4 * blockLen();
  } else {
    if (t <= cover.rangeStart + cover.period / 2) return;
    cover.rangeEnd = t;
  }
  fixRange(); if (zoomed) setZoomView(); updateRangeLite(); commitRange();
}

/* ---------- Practice tab ---------- */

function stepRow(x, i){
  return '<div class="srow" data-i="' + i + '"><input type="checkbox" data-f="on"' + (x.on ? ' checked' : '') + ' aria-label="Use this speed">' +
    '<label class="num"><input type="number" data-f="rate" min="0.25" max="2" step="0.05" value="' + x.rate + '" aria-label="Speed">×</label>' +
    '<label class="num"><input type="number" data-f="reps" min="1" max="20" step="1" value="' + x.reps + '" aria-label="Repeats">repeats</label>' +
    '<span class="mv"><button class="ico" data-mv="-1" aria-label="Move up">↑</button><button class="ico" data-mv="1" aria-label="Move down">↓</button>' +
    '<button class="ico" data-rm aria-label="Remove">✕</button></span></div>';
}
/** Draw the four speed lists and fill in the options from the settings. */
function renderSteps(){
  for (const [key, el] of [['blockSteps', $('#planB')], ['connectSteps', $('#planC')], ['topSteps', $('#planT')], ['fullSteps', $('#planF')]]){
    el.innerHTML = settings[key].map(stepRow).join('') || '<p class="muted small" style="margin:0">No speeds yet. Add one below.</p>';
  }
  $('#optFullAfter').checked = settings.fullAfter; $('#optAuto').checked = settings.auto; $('#optConnectOn').checked = settings.connectOn;
  $('#optTopOn').checked = settings.topOn; $('#optTopEvery').value = settings.topEvery;
  $('#optMusicB').checked = settings.musicBlocks; $('#optMusicF').checked = settings.musicFull;
  $('#optCounts').value = settings.counts; $('#optGroup').value = settings.group; $('#optRest').value = settings.rest;
  $('#optLeadS').value = settings.leadStart; $('#optLeadR').value = settings.leadRepeat;
  showPreset();
}

const PRESET_INFO = {
  chill: 'Slower, with more repeats, smaller chunks and longer breaks.',
  standard: 'Each block slow, medium, then full speed, 3 runs each. Connected in fours.',
  speed: 'Starts at 0.75×, fewer repeats, short breaks. For when you pick things up fast.',
  custom: 'Your own plan. Pick a preset to start from one of these instead.',
};
/** Light up the preset the plan matches (none when it has been customised). */
function showPreset(){
  const name = presetOf(settings);
  $$('#presetSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.preset === name));
  $('#presetInfo').textContent = PRESET_INFO[name];
}
function planChanged(){
  log('plan', 'plan or options changed');
  showPreset();
  endSession();
  if (hasRange()) updateRangeLite();
  updateSessionUI();
}

/** The block list: blocks in groups, each group followed by its "together" button. */
function renderChips(){
  if (!hasRange()) return;
  const list = blocks(), G = groupSize(settings);
  let html = '';
  for (let g = 0; g * G < list.length; g++){
    const group = list.slice(g * G, (g + 1) * G), a = group[0].n, b = group[group.length - 1].n;
    html += '<div class="cgrp"><div class="cl">' + (group.length > 1 ? 'Blocks ' + a + '–' + b : 'Block ' + a) + '</div><div class="chips">' +
      group.map(x => '<button class="chip" data-n="' + x.n + '"><b>' + x.n + '</b><span>' + Math.round((x.e - x.s) / cover.period) + ' counts</span></button>').join('') +
      (settings.connectOn && group.length > 1 ? '<button class="chip conn" data-c="' + g + '"><b>▶ ' + a + '–' + b + '</b><span>together</span></button>' : '') +
      '</div></div>';
  }
  $('#chips').innerHTML = html;
  markPlaying();
}
function markPlaying(){
  const span = currentSpan();
  $$('.chip[data-n]').forEach(c => c.classList.toggle('playing', !!span && +c.dataset.n >= span[0] && +c.dataset.n <= span[1]));
}

/** The skip button says where it goes: the next speed of this part, the next part, or the end. */
function skipButtonText(){
  const target = session && session.skipTarget;
  if (!target) return '⏭ Next speed';
  if (!target.to) return '⏭ Finish';
  if (target.from && target.from.part === target.to.part) return '⏭ Next speed: ' + rateLabel(target.to.rate);
  return '⏭ Next: ' + stepLabel(target.to);
}

/** "Blocks 1–4 together", "Block 3 of 12" … for the practice card. */
function stepTitle(st, nb){
  if (st.kind === 'full') return 'Whole section';
  if (st.kind === 'connect') return 'Blocks ' + st.a + '–' + st.b + ' together';
  if (st.kind === 'top') return 'From the top: blocks ' + st.a + '–' + st.b;
  return 'Block ' + st.block + ' of ' + nb;
}

/** The practice card, the mini bar in full screen, and which buttons are usable. */
function updateSessionUI(){
  if (!hasRange()) return;
  const nb = blocks().length, s = session;
  const resume = s ? null : resumePoint();
  let title, sub, main, progress = 0;
  if (!s && resume){
    title = 'Welcome back';
    sub = 'Last time you got to ' + stepLabel(resume.step) + ' at ' + rateLabel(resume.step.rate) + '.';
    main = 'Continue from ' + stepLabel(resume.step);
  } else if (!s){
    title = 'Ready when you are';
    // one line per part of the plan (the sub line keeps line breaks, see .sess #sSub)
    sub = [nb + ' block' + (nb > 1 ? 's' : '') + ', each at ' + ladderWords(settings.blockSteps),
      settings.connectOn && nb > 1 ? 'Every ' + groupSize(settings) + ' blocks together: ' + ladderWords(settings.connectSteps) : '',
      settings.topOn && nb > 1 ? 'From the top after every ' + (topEvery(settings) === 1 ? 'new block' : topEvery(settings) + ' new blocks') + ': ' + ladderWords(settings.topSteps) : '',
      settings.fullAfter ? 'Then the whole section: ' + ladderWords(settings.fullSteps) : ''].filter(Boolean).join('\n');
    main = 'Start practice';
  } else if (s.done){
    title = 'Range complete 🎉'; sub = 'Nice work. Start again, or run the whole section.'; main = 'Start again'; progress = 1;
  } else if (s.waiting){
    const prev = s.plan[s.index - 1], next = s.plan[s.index], label = stepLabel(prev);
    title = label.charAt(0).toUpperCase() + label.slice(1) + ' done';
    sub = 'Ready for ' + stepLabel(next) + '?';
    main = next.kind === 'block' ? 'Start block ' + next.block : next.kind === 'connect' ? 'Connect blocks ' + next.a + '–' + next.b
      : next.kind === 'top' ? 'Run from the top' : 'Run whole section';
    progress = s.index / s.plan.length;
  } else {
    const st = s.plan[s.index];
    title = stepTitle(st, nb);
    sub = s.pausing ? 'Pause. Tap Skip to go now.' : rateLabel(st.rate) + ' · ' + (st.kind === 'block' ? 'rep ' : 'run ') + (s.rep + 1) + ' of ' + st.reps;
    main = s.pausing ? 'Skip pause' : playing ? 'Pause' : 'Resume';
    progress = (s.index + s.rep / st.reps) / s.plan.length;
  }
  $('#sTitle').textContent = title; $('#sSub').textContent = sub; $('#sMain').textContent = main;
  $('#sProg').style.width = Math.round(progress * 100) + '%';
  $('#sTip').hidden = !(tipsOn() && s && s.done);

  // ◀ Block / Block ▶ move between blocks of the full plan
  const block = currentBlockNum(), span = currentSpan();
  const canMove = !!s && s.mode === 'all' && !s.done && enabledSteps(settings.blockSteps).length > 0;
  $('#sPrev').disabled = !canMove || (block ? block <= 1 : false);
  $('#sNext').disabled = !canMove || (block ? block >= nb : !(span && span[1] < nb));
  $('#sRestart').disabled = !s || s.done;
  $('#sFromStart').hidden = !resume;
  // Again redoes the run playing or the one just finished; the skip button moves on, and says where to
  $('#sAgain').disabled = $('#mAgain').disabled = !s || (!s.running && !s.lastRun);
  const skip = skipButtonText();
  $('#sSkip').textContent = skip; $('#mSkip').title = skip; $('#mSkip').setAttribute('aria-label', skip);
  $('#sSkip').disabled = $('#mSkip').disabled = !s || s.done;
  $('#mSub').textContent = s && !s.done ? title + ' · ' + sub : title;
  $('#fsStat').textContent = s && !s.done ? title + ' · ' + sub : '';
  $('#mMain').textContent = main;
  $('#mPrev').disabled = $('#sPrev').disabled; $('#mNext').disabled = $('#sNext').disabled;
  // the plan sets the speed while it runs
  const planControlsSpeed = !!s && !s.done && !s.waiting;
  $$('#rateSeg button').forEach(b => b.disabled = planControlsSpeed);
  markPlaying();
}

function updatePracticeUI(){
  const ok = hasGrid() && !!duration;
  $('#pMsg').hidden = ok; $('#pBody').hidden = !ok;
  if (!ok){ $('#pMsg').textContent = hasGrid() ? 'Loading the video length…' : 'Set the beat first. Tap along on the Beats tab, then come back here.'; return; }
  fixRange();
  updateRangeUI(); updateSessionUI();
}
function refreshAll(){ fixRange(); updateBeatsUI(); if (tab === 'practice') updatePracticeUI(); }

/* ---------- home and screens ---------- */

function renderHome(){
  const ids = Object.keys(store.videos).sort((a, b) => store.videos[b].updated - store.videos[a].updated);
  $('#recentCard').hidden = !ids.length;
  $('#recent').innerHTML = ids.map(id => {
    const v = store.videos[id];
    const status = !v.period ? 'Beat not set yet' : (v.resume ? 'Up to ' + v.resume.label + ' · ' : 'Ready to practise · ') + (60 / v.period).toFixed(0) + ' BPM';
    // YouTube's own thumbnail; the grey box behind it shows when offline
    return '<li><button class="open" data-id="' + escapeHtml(id) + '"><span class="thumb"><img src="https://i.ytimg.com/vi/' + encodeURIComponent(id) + '/mqdefault.jpg" alt="" loading="lazy" onerror="this.remove()"></span>' +
      '<span class="meta"><span class="t">' + escapeHtml(v.title || id) + '</span><span class="muted small">' + status + '</span></span></button>' +
      '<button class="ghost" data-del="' + escapeHtml(id) + '" aria-label="Remove this cover">✕</button></li>';
  }).join('');
  // ask for a tip only once someone has used the app
  $('#homeTip').hidden = !(tipsOn() && ids.length);
}

function showView(view){
  if (view === 'home' && fsOn){
    if (fsBrowser && document.fullscreenElement) document.exitFullscreen();
    fsFallback = false; fsBrowser = false; setFs(false);
  }
  $('#viewHome').hidden = view !== 'home'; $('#viewPlayer').hidden = view !== 'player';
  $('#backBtn').hidden = view === 'home';
  document.body.classList.toggle('pm', view === 'player');
  if (view === 'home'){
    endSession('you went back to the list');
    $('#heading').textContent = 'Run It Back'; renderHome();
    if (player && player.pauseVideo && playerReady) player.pauseVideo();
  } else requestAnimationFrame(layoutVideo);
}

function setTab(name){
  tab = name;
  $('#tabBeats').setAttribute('aria-selected', name === 'beats'); $('#tabPractice').setAttribute('aria-selected', name === 'practice');
  $('#panelBeats').hidden = name !== 'beats'; $('#panelPractice').hidden = name !== 'practice';
  if (name === 'beats' && !hasGrid() && rate === 1) setRate(0.5);   // half speed makes tapping the beat easier
  if (name === 'practice') updatePracticeUI(); else updateBeatsUI();
}

/** Make the toggle buttons match the state. */
function syncControls(){
  $('#adBtn').setAttribute('aria-pressed', adUnlocked);
  $('#flashBtn').setAttribute('aria-pressed', !!settings.flash); $('#clickBtn').setAttribute('aria-pressed', !!settings.click);
  $$('#rateSeg button').forEach(b => b.setAttribute('aria-pressed', Math.abs(+b.dataset.r - rate) < 1e-6));
  $('#mirrorBtn').setAttribute('aria-pressed', settings.mirror); $('#playerWrap').classList.toggle('mirror', settings.mirror);
  $('#muteBtn').textContent = soundOff ? '🔇' : '🔊'; $('#muteBtn').setAttribute('aria-pressed', soundOff);
  $('#fsBtn').textContent = fsOn ? '✕' : '⛶'; $('#fsBtn').setAttribute('aria-label', fsOn ? 'Exit full screen' : 'Full screen');
}

/* ---------- wiring: buttons and inputs ---------- */

function wireHome(){
  $('#loadForm').addEventListener('submit', e => {
    e.preventDefault();
    const id = parseYouTubeId($('#urlInput').value), err = $('#homeErr');
    if (!id){ err.hidden = false; err.textContent = "That doesn't look like a YouTube link. Copy the address from the video page."; return; }
    err.hidden = true; $('#urlInput').value = ''; openCover(id);
  });
  $('#recent').addEventListener('click', e => {
    const open = e.target.closest('[data-id]'), del = e.target.closest('[data-del]');
    if (open) openCover(open.dataset.id);
    if (del && confirm('Remove this cover and its saved beat and range?')){ delete store.videos[del.dataset.del]; save(); renderHome(); }
  });
  $('#backBtn').addEventListener('click', () => showView('home'));
}

function wirePlayerControls(){
  $('#playBtn').addEventListener('click', togglePlay);
  // tapping the video: if practice is waiting for you or pausing between runs, carry on; otherwise play or pause
  $('#shield').addEventListener('click', () => { if (session && (session.waiting || session.pausing)) onMainButton(); else togglePlay(); });
  $('#muteBtn').addEventListener('click', toggleMute);
  $('#fsBtn').addEventListener('click', toggleFs);
  $('#moreBtn').addEventListener('click', () => { setMore(!$('#stage').classList.contains('more')); bumpControls(); });
  $('#rateSeg').addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b && !b.disabled) setRate(+b.dataset.r); });
  $('#mirrorBtn').addEventListener('click', () => setMirror(!settings.mirror));
  $('#adBtn').addEventListener('click', () => { adUnlocked = !adUnlocked; log('ad', 'Ad? button ' + (adUnlocked ? 'on (video unlocked)' : 'off')); syncControls(); });
  $('#flashBtn').addEventListener('click', () => { settings.flash = !settings.flash; save(); log('check', 'flash ' + (settings.flash ? 'on' : 'off')); syncControls(); });
  $('#clickBtn').addEventListener('click', () => {
    settings.click = !settings.click;
    if (settings.click) ensureAudio();
    save(); nextClickBeat = -1; log('check', 'click ' + (settings.click ? 'on' : 'off')); syncControls();
  });
  // if Click was left on, the first tap anywhere starts the audio
  document.addEventListener('pointerdown', () => { if (settings.click && !audio) ensureAudio(); }, true);

  const scrub = $('#scrub');
  scrub.addEventListener('input', () => { scrubbing = true; $('#timeLbl').textContent = fmtTime(scrub.value / 1000 * duration) + ' / ' + fmtTime(duration); });
  scrub.addEventListener('change', () => { seek(scrub.value / 1000 * duration); scrubbing = false; });

  $('#tabBeats').addEventListener('click', () => setTab('beats'));
  $('#tabPractice').addEventListener('click', () => setTab('practice'));
  $('#toPractice').addEventListener('click', () => setTab('practice'));

  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  ['pointermove', 'pointerdown', 'touchstart'].forEach(ev => $('#stage').addEventListener(ev, bumpControls, {passive: true}));
  new ResizeObserver(layoutVideo).observe($('#stage'));
}

function wireBeatsTab(){
  $('#tapBtn').addEventListener('pointerdown', e => { e.preventDefault(); tap(); });
  $('#tapBtn').addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
  $('#resetTaps').addEventListener('click', resetTaps);
  $('#undoTap').addEventListener('click', undoTap);
  $('#bpmSet').addEventListener('click', () => applyBpm(+$('#bpmIn').value));
  $('#bpmIn').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); applyBpm(+$('#bpmIn').value); } });
  $('#markOne1').addEventListener('click', markFirstOne);
  $('#markOne2').addEventListener('click', markLaterOne);
  $('#gapMinus').addEventListener('click', () => changeGap(-1));
  $('#gapPlus').addEventListener('click', () => changeGap(1));
  $('#panelBeats').addEventListener('click', e => {
    const step = e.target.closest('[data-step]'), timing = e.target.closest('[data-nudge]'), tempo = e.target.closest('[data-bpm]');
    if (step) return stepVideo(+step.dataset.step);
    if (!hasGrid()) return;
    if (timing) nudgeTiming(+timing.dataset.nudge);
    else if (tempo) nudgeTempo(p => 60 / (60 / p + +tempo.dataset.bpm), 'tempo ' + tempo.dataset.bpm + ' BPM');
    else if (e.target.id === 'halfBtn') nudgeTempo(p => p * 2, 'count half as fast');
    else if (e.target.id === 'dblBtn') nudgeTempo(p => p / 2, 'count twice as fast');
  });
}

function wireTrim(){
  for (const [id, which] of [['tHS', 's'], ['tHE', 'e']]){
    const handle = $('#' + id);
    handle.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); handle.setPointerCapture(e.pointerId);
      draggingHandle = which; previewTime = previewFor(which); handle.classList.add('drag');
    });
    handle.addEventListener('pointermove', e => { if (draggingHandle === which) moveHandle(which, tFromX(e.clientX), true, true); });
    const end = () => { if (draggingHandle !== which) return; draggingHandle = null; handle.classList.remove('drag'); commitRange(previewTime); };
    handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
    handle.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const beats = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? counts() : 1);
      moveHandle(which, (which === 's' ? cover.rangeStart : cover.rangeEnd) + beats * cover.period, true); commitRange(previewTime);
    });
  }
  $('#tTrack').addEventListener('pointerdown', e => { if (!e.target.closest('.tHead') && duration) seek(tFromX(e.clientX)); });
  $('#zoomBtn').addEventListener('click', () => { if (!hasRange()) return; zoomed = !zoomed; if (zoomed) setZoomView(); updateTrim(); });
  $('#wholeBtn').addEventListener('click', () => {
    if (!hasGrid() || !duration) return;
    grid.setWholeSong(cover, counts(), duration);
    fixRange(); zoomed = false; updateRangeUI(); commitRange(cover.rangeStart);
  });
  $('#rsNow').addEventListener('click', () => setRangeEdgeToNow('s'));
  $('#reNow').addEventListener('click', () => setRangeEdgeToNow('e'));
  $('.nudges').addEventListener('click', e => {
    const b = e.target.closest('[data-tn]');
    if (!b || !hasRange()) return;
    const [which, beats] = b.dataset.tn.split(':');
    moveHandle(which, (which === 's' ? cover.rangeStart : cover.rangeEnd) + (+beats) * cover.period, true);
    if (zoomed) setZoomView();
    updateTrim(); commitRange(previewTime);
  });
}

function wirePracticeTab(){
  // speed rows: edit a value
  $('#panelPractice').addEventListener('change', e => {
    const list = e.target.closest('[data-list]'), row = e.target.closest('.srow'), field = e.target.dataset.f;
    if (!list || !row || !field) return;
    const item = settings[list.dataset.list][+row.dataset.i];
    if (field === 'on') item.on = e.target.checked;
    if (field === 'rate'){ item.rate = clamp(Math.round((+e.target.value || 1) * 100) / 100, 0.25, 2); e.target.value = item.rate; }
    if (field === 'reps'){ item.reps = clamp(Math.round(+e.target.value) || 1, 1, 20); e.target.value = item.reps; }
    save(); planChanged();
  });
  // speed rows: add, move, remove
  $('#panelPractice').addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (add){ settings[add.dataset.add].push({rate: 1, on: true, reps: 3}); save(); renderSteps(); return planChanged(); }
    const list = e.target.closest('[data-list]'), row = e.target.closest('.srow');
    if (!list || !row) return;
    const rows = settings[list.dataset.list], i = +row.dataset.i, move = e.target.closest('[data-mv]');
    if (e.target.closest('[data-rm]')) rows.splice(i, 1);
    else if (move){ const j = i + +move.dataset.mv; if (j < 0 || j >= rows.length) return; [rows[i], rows[j]] = [rows[j], rows[i]]; }
    else return;
    save(); renderSteps(); planChanged();
  });

  // options
  const checkbox = (id, key) => $(id).addEventListener('change', e => { settings[key] = e.target.checked; save(); planChanged(); });
  checkbox('#optFullAfter', 'fullAfter'); checkbox('#optAuto', 'auto'); checkbox('#optConnectOn', 'connectOn');
  checkbox('#optMusicB', 'musicBlocks'); checkbox('#optMusicF', 'musicFull'); checkbox('#optTopOn', 'topOn');
  const number = (id, key, lo, hi, fallback, step = 1) => $(id).addEventListener('change', e => {
    const v = +e.target.value;
    settings[key] = clamp(Number.isFinite(v) ? Math.round(v / step) * step : fallback, lo, hi);
    e.target.value = settings[key]; save(); planChanged();
  });
  number('#optCounts', 'counts', 2, 16, 8);
  number('#optGroup', 'group', 2, 8, 4);
  number('#optTopEvery', 'topEvery', 1, 8, 1);
  number('#optRest', 'rest', 0, 10, 2, 0.5);
  number('#optLeadS', 'leadStart', 0, 8, 4);
  number('#optLeadR', 'leadRepeat', 0, 8, 2);
  $('#presetSeg').addEventListener('click', e => {
    const b = e.target.closest('[data-preset]');
    if (!b) return;
    Object.assign(settings, presets()[b.dataset.preset]);   // presets() makes fresh copies
    log('plan', 'preset ' + b.dataset.preset);
    save(); renderSteps(); planChanged();
  });
  $('#resetPlan').addEventListener('click', () => { Object.assign(settings, defaultPlan()); save(); renderSteps(); planChanged(); });

  // session buttons (the card, and the mini bar in full screen)
  $('#sMain').addEventListener('click', onMainButton);
  $('#mMain').addEventListener('click', onMainButton);
  $('#sFromStart').addEventListener('click', startFromBeginning);
  for (const id of ['#sAgain', '#mAgain']) $(id).addEventListener('click', again);
  for (const id of ['#sSkip', '#mSkip']) $(id).addEventListener('click', skipAhead);
  for (const [cardId, miniId, dir] of [['#sPrev', '#mPrev', -1], ['#sNext', '#mNext', 1]]){
    for (const id of [cardId, miniId]) $(id).addEventListener('click', () => {
      const block = currentBlockNum(), span = currentSpan(), st = currentStep();
      // from a from-the-top run, ◀ goes back to its newest block; from a connected run, to its first block;
      // ▶ goes to the block after either; from the whole section, to the last block
      if (block) gotoBlock(block + dir);
      else if (st && st.kind === 'top') gotoBlock(dir < 0 ? st.b : st.b + 1);
      else if (span) gotoBlock(dir < 0 ? span[0] : span[1] + 1);
      else gotoBlock(blocks().length);
    });
  }
  $('#sRestart').addEventListener('click', restartPart);
  $('#sFull').addEventListener('click', startFull);
  $('#chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    if (chip.dataset.c != null) gotoConnect(+chip.dataset.c); else gotoBlock(+chip.dataset.n);
  });
}

function wireKeyboard(){
  document.addEventListener('keydown', e => {
    const el = document.activeElement;
    const typing = /INPUT|TEXTAREA/.test(el.tagName) && el.type !== 'range';
    if (!cover || $('#viewPlayer').hidden || typing) return;
    const k = e.key.toLowerCase();
    if (k === ' '){ e.preventDefault(); togglePlay(); }
    else if (k === 't') tap();
    else if (k === 'm') setMirror(!settings.mirror);
    else if (k === 'f') toggleFs();
    else if (k === 'a') again();
    else if (k === 'n') skipAhead();
    else if (k === 'escape' && fsOn && fsFallback) toggleFs();
    else if (k === 'arrowleft' || k === 'arrowright'){
      if (el.classList && el.classList.contains('tHead')) return;   // the trim handles use the arrows themselves
      e.preventDefault();
      const stepBy = hasGrid() ? cover.period : 2;
      seek(currentTime() + (k === 'arrowleft' ? -stepBy : stepBy));
    }
  });
}

function wireDebugPanel(){
  $('#dbgBtn').addEventListener('click', openDebug); $('#dbgFootBtn').addEventListener('click', openDebug);
  $('#dbgClose').addEventListener('click', closeDebug);
  $('#dbgCopy').addEventListener('click', copyDebug);
  $('#dbgClear').addEventListener('click', () => { clearLog(); log('start', 'log cleared'); $('#dbgMsg').textContent = 'Cleared.'; });
  $('#dbgPanel').addEventListener('click', e => { if (e.target === $('#dbgPanel')) closeDebug(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#dbgPanel').hidden){ e.preventDefault(); closeDebug(); } });
  onLog(() => { if (!$('#dbgPanel').hidden) renderDebug(); });
  document.addEventListener('visibilitychange', () => log('page', document.hidden ? 'hidden (screen locked or app switched)' : 'visible again'));
  window.addEventListener('orientationchange', () => setTimeout(() => log('page', 'rotated: window ' + innerWidth + 'x' + innerHeight), 300));
}

/* ---------- start ---------- */

$('#cSegs').innerHTML = '<i class="one"></i>' + '<i></i>'.repeat(7);
wireHome(); wirePlayerControls(); wireBeatsTab(); wireTrim(); wirePracticeTab(); wireKeyboard(); wireDebugPanel();
setupInstall(log);
setupAnalytics(); setupTips();
renderSteps(); syncControls(); renderHome();
requestAnimationFrame(tick);
log('start', 'app ' + APP_VERSION + ', window ' + innerWidth + 'x' + innerHeight + ' @' + (window.devicePixelRatio || 1) + 'x, ' + Object.keys(store.videos).length + ' saved covers');

// for testing from the browser console
window.__app = {getPlayer: () => player};
