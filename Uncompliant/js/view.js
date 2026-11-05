'use strict';

// The view of a map that may be bigger than the screen: where the map sits in the viewport, how far it is scrolled, where the camera
// should go, the minimap and the off-screen arrows. Pure maths (no drawing, no DOM), so it is tested like bay.js; render.js and main.js use it.
// A map is drawn once into a picture of its own (`pixelSize` plus a margin of `PICTURE_PAD` pixels all round, so the outlines on the edge hexes are
// not cut off), and the viewport is a window onto that picture. A map no bigger than the viewport is centred across and sits at the top (exactly as
// the game always drew it), and cannot scroll. Scroll positions are in map pixels (0, 0 is the top left of the map itself, not of the margin).

const VIEWPORT = { x: 0, y: 80, w: 790, h: 568 };  // the map area of the screen: left of the unit panel, below the header, above the help
const SCROLL_MARGIN = 3 * 26;                       // the camera keeps what it frames at least this far (pixels) inside the viewport edge
const SIDE_PANEL = { x: 806, w: 202, bottom: 636 };  // the right-hand column (the mech card, the log and, on a big map, the minimap); render.js draws the rest of it
const GLIDE_RATE = 7;                               // how quickly the camera eases to its target (per second)
const PICTURE_PAD = 2;                              // the margin round the map's picture, in pixels
const DRAG_PIXELS = 4;                              // a mouse that moves less than this between press and release was a click, not a drag

// How big the map's picture is, in pixels, for hexes of radius `r`.
function pixelSize(cols, rows, r) { return { w: r * (1.5 * (cols - 1) + 2), h: r * Math.sqrt(3) * (rows + 0.5) }; }

// { w, h, r, pad, offX, offY, maxX, maxY }: the map's size (w, h; its picture is bigger by `pad` all round), where it sits in the viewport when smaller than it (offX, offY), and the furthest
// it can be scrolled (maxX, maxY; 0 when it fits).
function layoutFor(cols, rows, r) {
  if (!(cols >= 1 && rows >= 1 && r > 0)) throw new MapError('layout', `A map of ${cols} x ${rows} hexes of radius ${r} cannot be laid out`);
  const { w, h } = pixelSize(cols, rows, r);
  return { w, h, r, pad: PICTURE_PAD, offX: Math.max(0, (VIEWPORT.w - w) / 2), offY: 0, maxX: Math.max(0, w - VIEWPORT.w), maxY: Math.max(0, h - VIEWPORT.h) };
}

function clampScroll(layout, x, y) { return { x: Math.max(0, Math.min(layout.maxX, x)), y: Math.max(0, Math.min(layout.maxY, y)) }; }

// A hex's centre in the map's own picture (the same for every scroll): the margin plus its place in the map.
function hexInPicture(layout, c, r) {
  const [ux, uy] = hexCentre(c, r);
  return [layout.pad + layout.r + ux * layout.r, layout.pad + layout.r * Math.sqrt(3) / 2 + uy * layout.r];
}

// Where that is on the screen when the view is scrolled to `scroll`.
function pictureToScreen(layout, scroll, px, py) { return [VIEWPORT.x + layout.offX - layout.pad + px - scroll.x, VIEWPORT.y + layout.offY - layout.pad + py - scroll.y]; }
function screenToPicture(layout, scroll, sx, sy) { return [sx - VIEWPORT.x - layout.offX + layout.pad + scroll.x, sy - VIEWPORT.y - layout.offY + layout.pad + scroll.y]; }

function inViewport(sx, sy) { return sx >= VIEWPORT.x && sx < VIEWPORT.x + VIEWPORT.w && sy >= VIEWPORT.y && sy < VIEWPORT.y + VIEWPORT.h; }

// The scroll that puts this hex in the middle of the viewport (as near as the map allows).
function scrollCentredOn(layout, c, r) {
  const [px, py] = hexInPicture(layout, c, r);
  return clampScroll(layout, px - layout.pad - VIEWPORT.w / 2, py - layout.pad - VIEWPORT.h / 2);
}

// The smallest scroll from `current` that keeps every hex (with a hex of room round it) at least `margin` pixels inside the viewport edge. If they
// do not all fit with that margin they are centred instead. A hex already well inside leaves the scroll alone, so the camera does not twitch.
function scrollToShow(layout, current, hexes, margin = SCROLL_MARGIN) {
  if (!hexes.length) return { x: current.x, y: current.y };
  const pts = hexes.map(([c, r]) => { const [px, py] = hexInPicture(layout, c, r); return [px - layout.pad, py - layout.pad]; }); // in map pixels
  const lo = [Math.min(...pts.map(p => p[0])) - layout.r, Math.min(...pts.map(p => p[1])) - layout.r];
  const hi = [Math.max(...pts.map(p => p[0])) + layout.r, Math.max(...pts.map(p => p[1])) + layout.r];
  const axis = (cur, min, max, size) => {
    if (max - min > size - 2 * margin) return (min + max) / 2 - size / 2; // too big for the margin: centre it
    if (min < cur + margin) return min - margin;
    if (max > cur + size - margin) return max - size + margin;
    return cur;
  };
  return clampScroll(layout, axis(current.x, lo[0], hi[0], VIEWPORT.w), axis(current.y, lo[1], hi[1], VIEWPORT.h));
}

// One step of the camera easing toward a target.
function glide(current, target, dt) {
  const k = Math.min(1, dt * GLIDE_RATE);
  return { x: current.x + (target.x - current.x) * k, y: current.y + (target.y - current.y) * k };
}

// Dragging the map: where the scroll goes when the mouse has moved from `from` to `to` since the press (the map follows the mouse).
function dragScroll(layout, startScroll, from, to) { return clampScroll(layout, startScroll.x - (to[0] - from[0]), startScroll.y - (to[1] - from[1])); }
function isDrag(from, to) { return Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]) > DRAG_PIXELS; }

// ---------- the minimap ----------
// A small picture of the whole map at the bottom of the right-hand panel, under the combat log, so it never covers the map. { x, y, w, h, scale,
// panelY, panelH }: the picture's box, and the box of the panel round it (a caption sits above the picture).
function miniGeometry(layout) {
  const scale = Math.min(0.2, (SIDE_PANEL.w - 16) / layout.w);
  const w = Math.round(layout.w * scale), h = Math.round(layout.h * scale);
  const panelH = h + 36, panelY = SIDE_PANEL.bottom - panelH;
  return { x: SIDE_PANEL.x + Math.round((SIDE_PANEL.w - w) / 2), y: panelY + 26, w, h, scale, panelY, panelH };
}
function miniHit(geo, sx, sy) { return sx >= geo.x && sx < geo.x + geo.w && sy >= geo.y && sy < geo.y + geo.h; }
// The scroll that centres the viewport on the point of the minimap that was clicked.
function miniToScroll(layout, geo, sx, sy) {
  return clampScroll(layout, (sx - geo.x) / geo.scale - VIEWPORT.w / 2, (sy - geo.y) / geo.scale - VIEWPORT.h / 2);
}
// The viewport's rectangle on the minimap.
function miniViewRect(geo, scroll) { return { x: geo.x + scroll.x * geo.scale, y: geo.y + scroll.y * geo.scale, w: VIEWPORT.w * geo.scale, h: VIEWPORT.h * geo.scale }; }

// ---------- arrows at the edge for things that are off screen ----------
// For a point on the screen (it may be outside the viewport): null if it is inside, else { x, y, angle } on the viewport's edge, in the direction of the point from the middle.
function edgeArrow(sx, sy, pad = 16) {
  const cx = VIEWPORT.x + VIEWPORT.w / 2, cy = VIEWPORT.y + VIEWPORT.h / 2;
  if (sx >= VIEWPORT.x && sx < VIEWPORT.x + VIEWPORT.w && sy >= VIEWPORT.y && sy < VIEWPORT.y + VIEWPORT.h) return null;
  const dx = sx - cx, dy = sy - cy;
  const k = Math.min((VIEWPORT.w / 2 - pad) / Math.abs(dx || 1e-9), (VIEWPORT.h / 2 - pad) / Math.abs(dy || 1e-9));
  return { x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dy, dx) };
}
