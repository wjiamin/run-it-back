/* Recording each practice run from the camera (📷 Me), to watch back side by side with the video.

   Only the latest take is kept, in memory: it is never saved on the phone or sent anywhere, and it is gone when a new
   run is recorded or the video is closed.

   Keeping the two in step: recording starts a moment before the video really plays (the player takes a little while
   to seek and start). When the video reports it is playing, markPlaying(t) notes the video time t and how far into
   the recording that was; watching back starts the video at t and the recording at that point.

   Usage:
     const rec = runRecorder(log);
     rec.start(stream, {label, rate, end})   a run starts (end: the video time where it stops)
     rec.markPlaying(t)                       the video is playing, at video time t (the first call of a run counts;
                                              any moment works, as long as it is while both are running)
     await rec.finish()                       the run played to the end: keep it as the take
     rec.discard()                            the run was cut short: throw it away
     rec.take                                 {url, label, rate, videoStart, recordingStart, end} or null
     rec.clear()                              forget the take (closing the video) */

/** The first recording format the browser can make: MP4 on iPhones, WebM elsewhere. */
export function pickMimeType(isSupported){
  return ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(isSupported) || '';
}

export const canRecord = () => typeof MediaRecorder !== 'undefined';

/** Where the recording is when the video is at time t: the video runs at the take's speed, the recording in real time. */
export const takeTimeAt = (take, t) => take.recordingStart + (t - take.videoStart) / take.rate;

export function runRecorder(log){
  let recorder = null;      // the MediaRecorder of the run being recorded
  let chunks = [];
  let startedAt = 0;        // performance.now() when recording really began
  let meta = null;          // {label, rate, end, videoStart, recordingStart} of the run being recorded
  let take = null;

  function stopRecorder(){
    const r = recorder;
    recorder = null;
    if (r && r.state !== 'inactive') r.stop();
    return r;
  }

  return {
    get take(){ return take; },
    get recording(){ return !!recorder; },

    start(stream, info){
      stopRecorder();
      if (!canRecord() || !stream) return;
      chunks = []; meta = {...info, videoStart: null, recordingStart: 0}; startedAt = 0;
      try {
        const mimeType = pickMimeType(t => MediaRecorder.isTypeSupported(t));
        recorder = new MediaRecorder(stream, mimeType ? {mimeType} : undefined);
      } catch (e){ log('camera', 'cannot record: ' + e.name); recorder = null; return; }
      recorder.addEventListener('dataavailable', e => { if (e.data && e.data.size) chunks.push(e.data); });
      recorder.addEventListener('start', () => { startedAt = performance.now(); });
      recorder.start();
    },

    markPlaying(t){
      if (!recorder || !meta || meta.videoStart != null) return;
      meta.videoStart = t;
      meta.recordingStart = startedAt ? (performance.now() - startedAt) / 1000 : 0;
    },

    finish(){
      const r = stopRecorder(), info = meta;
      meta = null;
      if (!r || !info || info.videoStart == null) return Promise.resolve(take);
      return new Promise(resolve => {
        r.addEventListener('stop', () => {
          const blob = new Blob(chunks, {type: r.mimeType || 'video/webm'});
          if (!blob.size){ resolve(take); return; }
          if (take) URL.revokeObjectURL(take.url);
          take = {url: URL.createObjectURL(blob), ...info};
          log('camera', 'recorded ' + info.label + ' (' + Math.round(blob.size / 1024) + ' KB)');
          resolve(take);
        }, {once: true});
      });
    },

    discard(){ stopRecorder(); meta = null; chunks = []; },

    clear(){
      this.discard();
      if (take){ URL.revokeObjectURL(take.url); take = null; }
    },
  };
}
