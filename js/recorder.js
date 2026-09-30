/* Recording yourself from the camera (📷 Me), to watch back side by side with the video.

   A recording is one piece of the video, played straight through: it has a clear start and end, so watching it back is
   easy to follow. It is made in one of two ways: ⏺ on the camera window, or automatically for each practice run. It
   starts when the video plays, and ends at ■ or as soon as the video stops playing straight on (a pause, a jump, a
   speed change, an ad). Only the latest recording is kept, in memory: it is never saved on the phone or sent anywhere,
   and it is gone when a new one is made or the video is closed.

   Usage:
     const rec = runRecorder(log, onChange);           onChange(): the recording started, ended or was thrown away
     rec.start(stream, {label, manual})                 start recording (manual: from ⏺, not a practice run)
     rec.playing(t, rate)                               the video is playing at video time t: the piece starts here if it
                                                        hasn't yet (call it any time while playing; only the first counts)
     await rec.stopped()                                the video paused, jumped or changed speed: the recording ends
                                                        there, if its piece had started
     await rec.finish()                                 stop now and keep it as the take (if the video played at all)
     rec.discard(), rec.clear()                         throw away the one being made / also forget the take
     rec.take          {url, label, videoStart, videoEnd, recordingStart, rate} or null  (label '' for ⏺)
     rec.recording, rec.manual, rec.seconds            being made? from ⏺? how long so far */

/** The first recording format the browser can make: MP4 on iPhones, WebM elsewhere. */
export function pickMimeType(isSupported){
  return ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(isSupported) || '';
}

export const canRecord = () => typeof MediaRecorder !== 'undefined';

/** Where the recording is when the video is at time t (the recording runs in real time, the video at `rate`). */
export const takeTimeAt = (take, t) => take.recordingStart + (t - take.videoStart) / take.rate;

/** Pieces shorter than this (seconds of recording) aren't kept: nothing really played. */
const MIN_PIECE = 0.3;

/**
 * The piece of video recorded, from where it started ({videoStart, recordingStart, rate}) and how far into the recording
 * it ended (`seconds`); null when it is too short to keep.
 */
export function pieceUntil(start, seconds){
  const length = seconds - start.recordingStart;
  return length >= MIN_PIECE ? {...start, videoEnd: start.videoStart + length * start.rate} : null;
}

export function runRecorder(log, onChange = () => {}){
  let current = null;       // the recording being made: {recorder, chunks, stopped (a promise), details, start}
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
      current = {recorder, chunks, stopped, details, start: null};
      startedAt = 0;
      recorder.start();
      if (details.manual) log('camera', 'recording');
      onChange();
      return true;
    },

    playing(t, rate){ if (current && startedAt && !current.start) current.start = {videoStart: t, recordingStart: seconds(), rate}; },
    stopped(){ return current && current.start ? rec.finish() : Promise.resolve(take); },

    async finish(){
      if (!current) return take;
      const piece = current.start && pieceUntil(current.start, seconds());
      const {recorder, chunks, stopped, details} = stopCurrent();
      if (!piece){
        if (details.manual) log('camera', 'recording stopped: the video didn\'t play, so there is nothing to compare');
        onChange();
        return take;
      }
      await stopped;   // (also when the camera was turned off and stopped it first)
      const blob = new Blob(chunks, {type: recorder.mimeType || 'video/webm'});
      if (blob.size){
        if (take) URL.revokeObjectURL(take.url);
        take = {url: URL.createObjectURL(blob), label: details.label || '', ...piece};
        log('camera', 'recorded ' + (details.label || 'your recording') + ': ' + (piece.videoEnd - piece.videoStart).toFixed(1) +
          ' s of video (' + Math.round(blob.size / 1024) + ' KB)');
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
