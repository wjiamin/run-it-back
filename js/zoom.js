/* Zooming in on the video, to follow one member of a group. Pinch (or Ctrl + scroll, or a trackpad pinch) to zoom, drag
   to move around.

   A zoom is {s, cx, cy}: the scale (1 = the whole picture, up to MAX_ZOOM) and the point of the picture shown in the
   middle, as fractions of the picture (0..1, as it looks on screen, mirrored or not). The picture never slides off its
   own area: the view stays inside it.

   The maths is kept apart from the page (and tested); zoomGestures() turns pinches, drags and the mouse wheel into it.

   Usage:
     const layer = zoomTransform(videoRect, zoom)    → {x, y, s}: the CSS translate(x, y) scale(s) that shows the zoom,
                                                        for a layer the size of the stage with its origin top left
     zoomGestures(el, {rect, get, set})             el: the element the gestures happen on; rect(): the video's area on
                                                        screen; get() / set(zoom): the current zoom */

export const MAX_ZOOM = 4;
export const NO_ZOOM = Object.freeze({s: 1, cx: 0.5, cy: 0.5});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** The zoom made valid: scale 1 to MAX_ZOOM, and the view kept inside the picture. */
export function clampZoom({s, cx, cy}){
  s = clamp(Number.isFinite(s) ? s : 1, 1, MAX_ZOOM);
  const half = 0.5 / s;
  return {s, cx: clamp(Number.isFinite(cx) ? cx : 0.5, half, 1 - half), cy: clamp(Number.isFinite(cy) ? cy : 0.5, half, 1 - half)};
}

export const isZoomed = zoom => !!zoom && zoom.s > 1.001;

/** Zoom by `factor` around the point (px, py) of the view (fractions of the video area), which stays where it is. */
export function zoomAround(zoom, px, py, factor){
  const {s, cx, cy} = clampZoom(zoom), s2 = clamp(s * factor, 1, MAX_ZOOM);
  // the picture point under (px, py) before, and the new centre that keeps it there
  const u = cx - 0.5 / s + px / s, v = cy - 0.5 / s + py / s;
  return clampZoom({s: s2, cx: u - px / s2 + 0.5 / s2, cy: v - py / s2 + 0.5 / s2});
}

/** Move the view by (dx, dy) screen pixels, for a video area w × h pixels (dragging right shows more of the left). */
export function panBy(zoom, dx, dy, w, h){
  const {s, cx, cy} = clampZoom(zoom);
  return clampZoom({s, cx: cx - dx / (s * w), cy: cy - dy / (s * h)});
}

/** The CSS transform, translate(x, y) scale(s) from the top left, of a stage-sized layer holding the video. */
export function zoomTransform(rect, zoom){
  const {s, cx, cy} = clampZoom(zoom);
  const left = cx - 0.5 / s, top = cy - 0.5 / s;   // the view's top left, as fractions of the picture
  return {x: rect.x * (1 - s) - left * s * rect.w, y: rect.y * (1 - s) - top * s * rect.h, s};
}

/**
 * Pinch (two fingers), drag (one finger or the mouse, when zoomed in) and Ctrl + wheel (also what a trackpad pinch sends)
 * on `el`. A plain scroll still scrolls the page.
 * Returns {justMoved()}: true right after a drag or pinch, so a tap handler can ignore the tap that ends it.
 */
export function zoomGestures(el, {rect, get, set}){
  const pointers = new Map();   // pointerId → {x, y}
  let moved = false, movedAt = 0, start = null;

  const local = (x, y) => { const r = rect(), b = el.getBoundingClientRect(); return {px: (x - b.left - r.x) / r.w, py: (y - b.top - r.y) / r.h}; };
  const midpoint = () => { const [a, b] = [...pointers.values()]; return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y)}; };

  el.addEventListener('pointerdown', e => {
    pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
    moved = false;
    start = pointers.size === 2 ? midpoint() : {x: e.clientX, y: e.clientY};
    // keep getting this finger's moves even if it slides off; the browser can refuse (a pointer that's already gone)
    if (pointers.size === 2 || isZoomed(get())) try { el.setPointerCapture(e.pointerId); } catch {}
  });
  el.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (!p || !start) return;
    const r = rect();
    if (pointers.size === 2){
      p.x = e.clientX; p.y = e.clientY;
      const m = midpoint(), at = local(m.x, m.y);
      if (start.d > 0 && m.d > 0) set(panBy(zoomAround(get(), at.px, at.py, m.d / start.d), m.x - start.x, m.y - start.y, r.w, r.h));
      start = m; moved = true;
    } else if (isZoomed(get())){
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;   // still a tap
      set(panBy(get(), dx, dy, r.w, r.h));
      p.x = e.clientX; p.y = e.clientY; moved = true;
    }
  });
  const end = e => {
    pointers.delete(e.pointerId);
    if (moved) movedAt = performance.now();
    start = pointers.size === 1 ? {...[...pointers.values()][0]} : null;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const at = local(e.clientX, e.clientY);
    set(zoomAround(get(), at.px, at.py, Math.exp(-e.deltaY / 400)));
  }, {passive: false});

  return {justMoved: () => performance.now() - movedAt < 350};
}
