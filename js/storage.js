/* Saving on this device (browser localStorage). Nothing is sent anywhere.

   Saved shape: {settings, videos}
     settings  see defaultSettings() below; `v` is the settings version, used to upgrade old saves
     videos    one entry per cover, keyed by YouTube id:
       id, title, dur (video length, s), updated (last change, ms)
       period      seconds per beat          } the beat grid: beats sit at anchor + k × period
       anchor      the time of any one beat  }
       rangeStart, rangeEnd                    the trimmed part to learn, on beats
       oneT                                    a marked 1 that the counts follow
       one1, one2, oneBeats                    the two marked 1s and the beats between them (0 when not locked)
       plan                                    this video's practice plan: the PLAN_KEYS fields (see below)
       resume                                  where practice stopped, to continue next time:
                                               {part, rate, label, counts, rangeStart, rangeEnd} (see plan.js resumeIndex)
   The field names are kept short and unchanged so older saves keep loading. */

// the key still says "coverLearner" (the app's first name), so covers saved before the rename still load
const KEY = 'coverLearner.v1';
export const SETTINGS_VERSION = 2;

/** The practice plan settings, also used by "Reset plan to defaults". */
export const defaultPlan = () => ({
  blockSteps: [{rate: 0.5, on: true, reps: 3}, {rate: 0.75, on: true, reps: 3}, {rate: 1, on: true, reps: 3}],
  connectSteps: [{rate: 0.75, on: true, reps: 2}, {rate: 1, on: true, reps: 2}],
  fullSteps: [{rate: 0.75, on: true, reps: 2}, {rate: 1, on: true, reps: 3}],
  topSteps: [{rate: 1, on: true, reps: 1}],
  connectOn: true,     // connect blocks together as you go
  group: 4,            // blocks in each connected run
  topOn: true,         // run everything learned so far from the top as you add blocks
  topEvery: 1,         // ...after every this many new blocks
  fullAfter: true,     // run the whole section after the blocks
  auto: true,          // move on to the next part without waiting
  musicBlocks: true,   // sound during block drills
  musicFull: true,     // sound during connected and whole-section runs
  leadStart: 4,        // count-in when a part starts (4 = 5, 6, 7, 8)
  leadRepeat: 2,       // count-in before each repeat (2 = 7, 8)
  rest: 2,             // seconds of pause after each run-through
});

/* Ready-made plans for the preset buttons. A preset sets these plan fields and leaves the rest (moving on
   automatically, music, counts per block) as they are. */
export const PRESET_KEYS = ['blockSteps', 'connectSteps', 'fullSteps', 'topSteps', 'connectOn', 'group', 'topOn', 'topEvery',
  'fullAfter', 'leadStart', 'leadRepeat', 'rest'];
const ladder = pairs => pairs.map(([rate, reps]) => ({rate, on: true, reps}));
const pick = obj => Object.fromEntries(PRESET_KEYS.map(k => [k, obj[k]]));
export const presets = () => ({
  // slower, more repeats, smaller chunks and a longer breather between runs
  chill: {...pick(defaultPlan()), blockSteps: ladder([[0.5, 4], [0.75, 3], [1, 3]]), connectSteps: ladder([[0.75, 3], [1, 2]]),
    group: 2, topEvery: 2, fullSteps: ladder([[0.75, 2], [1, 3]]), leadRepeat: 4, rest: 3},
  standard: pick(defaultPlan()),
  // skip the slowest speed and most repeats, for when you pick things up fast
  speed: {...pick(defaultPlan()), blockSteps: ladder([[0.75, 2], [1, 2]]), connectSteps: ladder([[1, 2]]),
    topEvery: 4, fullSteps: ladder([[1, 2]]), leadRepeat: 2, rest: 1},
});

/* Each video has its own practice plan (cover.plan): the preset fields plus counts per block, which depends on the
   choreography. Moving on automatically and music stay the same for every video. The plan fields in settings are the
   plan of the open video, and the one a new video starts with (the plan you used last). */
export const PLAN_KEYS = [...PRESET_KEYS, 'counts'];
/** A separate copy of the plan fields of `obj` (settings or a plan). */
export const pickPlan = obj => JSON.parse(JSON.stringify(Object.fromEntries(PLAN_KEYS.map(k => [k, obj[k]]))));

/** Which preset the settings match: 'chill', 'standard', 'speed', or 'custom'. */
export function presetOf(settings){
  const norm = v => Array.isArray(v) ? v.map(x => [x.rate, !!x.on, x.reps]) : v;
  const key = obj => JSON.stringify(PRESET_KEYS.map(k => norm(obj[k])));
  const mine = key(settings);
  return Object.entries(presets()).find(([, p]) => key(p) === mine)?.[0] || 'custom';
}

export const defaultSettings = () => ({
  counts: 8, mirror: true, muted: false, flash: false, click: false, sharePlan: true, v: SETTINGS_VERSION,
  ...defaultPlan(),
});

/** Bring a saved object up to date: fill in new settings, upgrade old versions. Returns null if it isn't a save. */
export function migrate(saved){
  if (!saved || !saved.videos) return null;
  const old = saved.settings || {};
  // the first version kept one list of speeds; carry it over as the block plan
  if (Array.isArray(old.speeds) && !old.blockSteps) old.blockSteps = old.speeds.map(x => ({rate: x.rate, on: !!x.on, reps: x.reps || 3}));
  const settings = Object.assign(defaultSettings(), old);
  // version 2 added count-ins, a pause after each run and connected runs: older saves get the new defaults for those
  if (!(old.v >= SETTINGS_VERSION)){
    const p = defaultPlan();
    Object.assign(settings, {leadStart: p.leadStart, leadRepeat: p.leadRepeat, rest: p.rest, connectOn: p.connectOn,
      group: p.group, connectSteps: p.connectSteps, v: SETTINGS_VERSION});
  }
  delete settings.leadIn; delete settings.speeds;
  // plans became per video: videos saved before that keep the plan they were using
  for (const v of Object.values(saved.videos)) if (v && !v.plan) v.plan = pickPlan(settings);
  saved.settings = settings;
  return saved;
}

export function loadStore(){
  try {
    const store = migrate(JSON.parse(localStorage.getItem(KEY)));
    if (store) return store;
  } catch {}
  return {settings: defaultSettings(), videos: {}};
}

/** @returns {boolean} false if the browser refused (storage blocked or full) */
export function saveStore(store){
  try { localStorage.setItem(KEY, JSON.stringify(store)); return true; } catch { return false; }
}
