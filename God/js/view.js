'use strict';

// Where things land on screen. The view shows a VIEW_N x VIEW_N window of tiles whose top-left tile is the camera
// (cam.u, cam.v). A corner (u, v) at height h is drawn at
//   x = VIEW_OX + (a - b) * HX,  y = VIEW_OY + (a + b) * HY - h * HZ,  where a = u - cam.u, b = v - cam.v.

function project(cam, u, v, h) { // cam.dx, cam.dy: a shake of the screen, in pixels (drawing only)
  const a = u - cam.u, b = v - cam.v;
  return [VIEW_OX + (cam.dx || 0) + (a - b) * HX, VIEW_OY + (cam.dy || 0) + (a + b) * HY - h * HZ];
}
function cornerPoint(t, cam, u, v) { return project(cam, u, v, heightAt(t, u, v)); }

function clampCam(t, cam) {
  const top = t.n - VIEW_N;
  return { u: Math.max(0, Math.min(top, cam.u)), v: Math.max(0, Math.min(top, cam.v)) };
}

// The tiles in view, back to front (the order they are painted in).
function tilesInView(cam) {
  const out = [];
  for (let s = 0; s <= 2 * (VIEW_N - 1); s++) {
    for (let a = Math.max(0, s - VIEW_N + 1); a <= Math.min(s, VIEW_N - 1); a++) out.push({ u: cam.u + a, v: cam.v + s - a });
  }
  return out;
}
// A tile is painted as two triangles split along its NE-SW diagonal (level across the screen): the back one
// [NW, NE, SW] and the front one [NE, SE, SW], as indices into the corners [NW, NE, SE, SW]. Split this way a hill's
// front faces fall away from the viewer; split the other way they show a vertical crease and look like a box corner.
const TILE_SPLIT = [[0, 1, 3], [1, 2, 3]];
function tileTriangles(t, cam, u, v) {
  const p = [[u, v], [u + 1, v], [u + 1, v + 1], [u, v + 1]].map(([a, b]) => cornerPoint(t, cam, a, b));
  return TILE_SPLIT.map(([i, j, l]) => [p[i], p[j], p[l]]);
}

function inTriangle(p, [a, b, c]) {
  const side = (p1, p2) => (p[0] - p2[0]) * (p1[1] - p2[1]) - (p1[0] - p2[0]) * (p[1] - p2[1]);
  const d1 = side(a, b), d2 = side(b, c), d3 = side(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

// The corner the mouse is over: find the front-most tile drawn under the point (so a hill hides what is behind it),
// then the nearest of that tile's corners. Null if the point is not on the land view.
function pickCorner(t, cam, x, y) {
  let hit = null;
  for (const { u, v } of tilesInView(cam)) {
    if (tileTriangles(t, cam, u, v).some((tri) => inTriangle([x, y], tri))) hit = { u, v };
  }
  if (!hit) return null;
  let best = null, bestD = Infinity;
  for (const [du, dv] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    const [px, py] = cornerPoint(t, cam, hit.u + du, hit.v + dv), d = (px - x) ** 2 + (py - y) ** 2;
    if (d < bestD) { bestD = d; best = { u: hit.u + du, v: hit.v + dv }; }
  }
  return best;
}

// ---- the map book: one screen pixel per tile, drawn as a diamond 2n wide and n tall ----
const bookPoint = (u, v) => [BOOK_X + (u - v) + MAP_N, BOOK_Y + (u + v) / 2];
function bookTile(px, py) { // the tile under a book pixel, or null
  const a = px - BOOK_X - MAP_N, b = py - BOOK_Y;
  const u = Math.floor(b + a / 2), v = Math.floor(b - a / 2);
  return u >= 0 && v >= 0 && u < MAP_N && v < MAP_N ? { u, v } : null;
}
