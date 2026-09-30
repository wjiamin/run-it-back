/* Recording yourself from the camera (📷 Me), to watch back side by side with the video.

   A recording is made in one of two ways: ⏺ on the camera window (any time, until ■), or automatically for each
   practice run. Only the latest recording is kept, in memory: it is never saved on the phone or sent anywhere, and it
   is gone when a new one is made or the video is closed.

   Keeping the two in step: while recording, the video may play, pause, jump and change speed. The recording notes
   each stretch the video played continuously: where it started in the video, where that was in the recording, how
   long it lasted and at what speed. Watching back replays the stretches in order, each from its own starting point.

   Usage:
     const rec = runRecorder(log, onChange);           onChange(): the recording started, stopped or was thrown away
     rec.start(stream, {label, manual})                 start recording (manual: from ⏺, not a practice run)
     rec.playing(t, rate)                               the video is playing at video time t: starts a stretch if none is
                                                        open (call it any time while playing; it is only counted once)
     rec.stopped()                                      the video paused, jumped or changed speed: the stretch ends
     await rec.finish()                                 stop and keep it as the take (if the video played at all)
     rec.discard(), rec.clear()                         throw away the one being made / also forget the take
     rec.take          {url, label ('' for ⏺), stretches: [{videoStart, videoEnd, recordingStart, rate}]} or null
     rec.recording, rec.manual, rec.seconds            being made? from ⏺? how long so far */

/** The first recording format the browser can make: MP4 on iPhones, WebM elsewhere. */
export function pickMimeType(isSupported){
  return ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(isSupported) || '';
}

export const canRecord = () => typeof MediaRecorder !== 'undefined';

/** Where the recording is when the video is at time t, within a stretch (the recording runs in real time). */
export const takeTimeAt = (stretch, t) => stretch.recordingStart + (t - stretch.videoStart) / stretch.rate;

/** Stretches shorter than this (seconds of recording) are left out: a blip between a jump and a pause. */
const MIN_STRETCH = 0.3;

/**
 * The stretches the video played while recording, from the times it was seen playing and stopping.
 * `seconds` is always how far into the recording it is. Kept apart from the recorder so it can be tested.
 */
export function stretchTimeline(){
  const stretches = [];
  let open = null;   // {videoStart, recordingStart, rate}
  return {
    playing(t, rate, seconds){ if (!open) open = {videoStart: t, recordingStart: seconds, rate}; },
    stopped(seconds){
      if (!open) return;
      const length = seconds - open.recordingStart;
      if (length >= MIN_STRETCH) stretches.push({...open, videoEnd: open.videoStart + length * open.rate});
      open = null;
    },
    get stretches(){ return stretches; },
  };
}

export function runRecorder(log, onChange = () => {}){
  let current = null;       // the recording being made: {recorder, chunks, stopped (a promise), details, timeline}
  let startedAt = 0;        // performance.now() when it really began
  let take = null;

  const seconds = () => startedAt ? (performance.now() - startedAt) / 1000 : 0;
  /** Stop the recording being made (if any) and forget it; returns it. */
  function stopCurrent(){
    const c = current;
    current = null;
    if (c && c.recorder.state !== 'inactive') c.recorder.stop();
    return c;
  }

  const rec = {
    get take(){ return take; },
    get recording(){ return !!current; },
    get manual(){ return !!current && !!current.details.manual; },
    get seconds(){ return current ? seconds() : 0; },

    start(stream, details){
      stopCurrent();
      if (!canRecord() || !stream) return false;
      let recorder;
      try {
        const mimeType = pickMimeType(t => MediaRecorder.isTypeSupported(t));
        recorder = new MediaRecorder(stream, mimeType ? {mimeType} : undefined);
      } catch (e){ log('camera', 'cannot record: ' + e.name); onChange(); return false; }
      // each recording keeps its own pieces, so a late piece of an old one never lands in a new one
      const chunks = [];
      const stopped = new Promise(resolve => recorder.addEventListener('stop', resolve, {once: true}));
      recorder.addEventListener('dataavailable', e => { if (e.data && e.data.size) chunks.push(e.data); });
      recorder.addEventListener('start', () => { if (current && current.recorder === recorder) startedAt = performance.now(); });
      current = {recorder, chunks, stopped, details, timeline: stretchTimeline()};
      startedAt = 0;
      recorder.start();
      if (details.manual) log('camera', 'recording');
      onChange();
      return true;
    },

    playing(t, rate){ if (current && startedAt) current.timeline.playing(t, rate, seconds()); },
    stopped(){ if (current && startedAt) current.timeline.stopped(seconds()); },

    async finish(){
      if (!current) return take;
      if (startedAt) current.timeline.stopped(seconds());
      const {recorder, chunks, stopped, details, timeline} = stopCurrent();
      const stretches = timeline.stretches, label = details.label || 'your recording';
      if (!stretches.length){
        if (details.manual) log('camera', 'recording stopped: the video didn\'t play, so there is nothing to compare');
        onChange();
        return take;
      }
      await stopped;   // (also when the camera was turned off and stopped it first)
      const blob = new Blob(chunks, {type: recorder.mimeType || 'video/webm'});
      if (blob.size){
        if (take) URL.revokeObjectURL(take.url);
        take = {url: URL.createObjectURL(blob), label: details.label || '', stretches};
        log('camera', 'recorded ' + label + ': ' + stretches.length + ' stretch' + (stretches.length > 1 ? 'es' : '') +
          ' (' + Math.round(blob.size / 1024) + ' KB)');
      }
      onChange();
      return take;
    },

    discard(){ if (stopCurrent()) onChange(); },

    clear(){
      rec.discard();
      if (take){ URL.revokeObjectURL(take.url); take = null; onChange(); }
    },
  };
  return rec;
}
