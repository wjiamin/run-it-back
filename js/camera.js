/* Your camera in a small window over the video ("📷 Me"), so you can see yourself next to the dancers.
   The front camera, shown mirrored like a studio mirror. Nothing leaves the phone: the picture is only shown here.

   The window sits in one corner of the video; drag it and it moves to the nearest corner when you let go.

   Usage:
     const me = selfView({box, video, log, onChange});   // box: the window element, video: a <video> inside it
     await me.start()  → true, or false with me.problem set ('blocked' | 'no camera' | 'unsupported' | 'failed')
     me.stop(); me.on; me.stream (for recording, later)
   It calls onChange() after it starts or stops, so the page can redraw its button. If the phone stops the camera (you
   switched apps), it starts again when you come back, as long as you hadn't turned it off. */

export const CORNERS = ['tl', 'tr', 'bl', 'br'];

/**
 * The corner nearest to where the window was let go: the centre of the window (x, y) inside an area w × h.
 * Returns 'tl', 'tr', 'bl' or 'br'.
 */
export function nearestCorner(x, y, w, h){
  return (y < h / 2 ? 't' : 'b') + (x < w / 2 ? 'l' : 'r');
}

/** Why the camera couldn't start, from the browser's error (see getUserMedia). */
export function cameraProblem(error){
  const name = error && error.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'blocked';
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') return 'no camera';
  return 'failed';
}

export function selfView({box, video, log, onChange = () => {}}){
  let stream = null;
  let wanted = false;       // you turned it on (and not off since)

  function release(){
    for (const track of stream.getTracks()) track.stop();
    stream = null;
    video.srcObject = null;
    box.hidden = true;
  }
  document.addEventListener('visibilitychange', () => {
    if (wanted && !stream && document.visibilityState === 'visible'){ log('camera', 'starting again'); view.start(); }
  });

  const view = {
    get on(){ return !!stream; },
    get stream(){ return stream; },
    problem: '',

    async start(){
      if (stream) return true;
      wanted = true;
      view.problem = '';
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ wanted = false; view.problem = 'unsupported'; onChange(); return false; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'user', width: {ideal: 640}}, audio: false});
      } catch (e){
        wanted = false;
        view.problem = cameraProblem(e);
        log('camera', 'could not start: ' + e.name);
        onChange();
        return false;
      }
      // if the phone stops the camera (another app took it, the page was hidden), show it as off
      for (const track of stream.getVideoTracks()) track.addEventListener('ended', () => {
        if (!stream) return;
        log('camera', 'stopped by the device'); release(); onChange();   // still wanted: starts again when you come back
      });
      video.srcObject = stream;
      box.hidden = false;
      try { await video.play(); } catch {}
      log('camera', 'on');
      onChange();
      return true;
    },

    stop(){
      wanted = false;
      if (!stream) return;
      release();
      log('camera', 'off');
      onChange();
    },
  };
  return view;
}

/**
 * Let the window be dragged inside `area`, snapping to the nearest corner when let go.
 * setCorner(corner) places it (and is called with the new corner after a drag, to remember it).
 */
export function dragToCorners(box, area, setCorner){
  let start = null;
  box.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;   // its close button
    e.preventDefault(); e.stopPropagation();
    box.setPointerCapture(e.pointerId);
    const r = box.getBoundingClientRect();
    start = {x: e.clientX, y: e.clientY, left: r.left, top: r.top};
    box.classList.add('dragging');
  });
  box.addEventListener('pointermove', e => {
    if (!start) return;
    box.style.transform = 'translate(' + (e.clientX - start.x) + 'px,' + (e.clientY - start.y) + 'px)';
  });
  const end = e => {
    if (!start) return;
    const a = area.getBoundingClientRect(), r = box.getBoundingClientRect();
    start = null;
    box.classList.remove('dragging'); box.style.transform = '';
    setCorner(nearestCorner(r.left + r.width / 2 - a.left, r.top + r.height / 2 - a.top, a.width, a.height));
    e.stopPropagation();
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  // a tap on the window shouldn't also play or pause the video underneath
  box.addEventListener('click', e => e.stopPropagation());
}
