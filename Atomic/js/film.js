'use strict';

// Atomic Castle drawn the way Ultimate's Filmation games were (Knight Lore, Alien 8): a 256 x 192 screen in one ink
// colour per room on black, each room boxed in by two brick back walls with arched doorways, masked sprites, a
// coloured border, and a framed panel along the bottom. The rules are the colour version's (data.js and rules.js).
// Everything is drawn in black and white first; present() then colours each 8 x 8 cell with its ink, like a Spectrum.

const params = new URLSearchParams(location.search);
const SW = 256, SH = 192;
const HX = 10, HY = 5, LV = 10; // half a tile across, half a tile down, one level up (screen pixels)
const WALL_H = 44;              // the back walls of a room
const BLOCK_H = 15;             // a block of stonework inside a room (a # square)
const CRATE_H = LV;
const GATE_H = 22;
const PLAY_TOP = 16, PLAY_BOTTOM = 159; // captions above, the panel below

const ZX = {
  black: [0, 0, 0], blue: [40, 70, 255], red: [255, 50, 50], magenta: [255, 70, 255],
  green: [50, 255, 50], cyan: [50, 255, 255], yellow: [255, 255, 50], white: [255, 255, 255],
};
const ZX_BORDER = { black: '#000', blue: '#0000d7', red: '#d70000', magenta: '#d700d7', green: '#00d700', cyan: '#00d7d7', yellow: '#d7d700', white: '#d7d7d7' };

// one ink per room (neighbouring rooms differ), and what hangs on its back walls
const ROOM_STYLE = {
  airlock: { ink: 'cyan', deco: ['porthole', 'dial'] },
  repair: { ink: 'yellow', deco: ['pipes', 'shelf'] },
  observatory: { ink: 'magenta', deco: ['window', 'window'] },
  range: { ink: 'red', deco: ['target', 'target'] },
  cafeteria: { ink: 'green', deco: ['dial', 'shelf'] },
  launch: { ink: 'white', deco: ['window', 'pipes'] },
  control: { ink: 'cyan', deco: ['dial', 'dial'] },
  reactor: { ink: 'green', deco: ['pipes', 'dial'] },
  store: { ink: 'yellow', deco: ['shelf', 'shelf'] },
  lounge: { ink: 'magenta', deco: ['window', 'porthole'] },
  greenhouse: { ink: 'green', deco: ['vine', 'vine'] },
  vault: { ink: 'yellow', deco: ['dial', 'pipes'] },
};
for (const r of ROOMS) if (!ROOM_STYLE[r.id]) throw new Error(`no Filmation style for room "${r.id}"`);

// ---- the screen ----
// Everything is laid out on the Spectrum's 256 x 192 grid, but drawn at RES times the detail: lines are one fine
// pixel thick, and the sprites and letters are smoothed with the Scale2x pixel-art rule rather than just enlarged.
const RES = 2, PX = 1 / RES;
const view = document.getElementById('screen');
const vctx = view.getContext('2d');
const scr = document.createElement('canvas');
scr.width = SW * RES; scr.height = SH * RES;
const g = scr.getContext('2d', { willReadFrequently: true });
g.setTransform(RES, 0, 0, RES, 0, 0);
g.imageSmoothingEnabled = false; vctx.imageSmoothingEnabled = false;
const fine = (v) => Math.round(v * RES) / RES; // the nearest fine pixel

const attr = new Array(32 * 24).fill(ZX.white);
function paint(col, row, cols, rows, ink) {
  const c = ZX[ink];
  if (!c) throw new Error(`paint: unknown colour "${ink}"`);
  for (let r = row; r < row + rows; r++) for (let k = col; k < col + cols; k++) attr[r * 32 + k] = c;
}

function present() {
  const w = SW * RES, h = SH * RES, cell = 8 * RES;
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const c = d[i] + d[i + 1] + d[i + 2] >= 384 ? attr[Math.floor(y / cell) * 32 + Math.floor(x / cell)] : ZX.black;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  vctx.drawImage(scr, 0, 0, view.width, view.height);
}

// ---- drawing in ink and black ----
function cls() { g.fillStyle = '#000'; g.fillRect(0, 0, SW, SH); }
function dot(x, y) { g.fillStyle = '#fff'; g.fillRect(fine(x), fine(y), PX, PX); }
function line(a, b, colour = '#fff') {
  let x0 = Math.round(a[0] * RES), y0 = Math.round(a[1] * RES); // in fine pixels
  const x1 = Math.round(b[0] * RES), y1 = Math.round(b[1] * RES);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  g.fillStyle = colour;
  for (;;) {
    g.fillRect(x0 * PX, y0 * PX, PX, PX);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function path(pts) { const h = PX / 2; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0] + h, p[1] + h) : g.moveTo(p[0] + h, p[1] + h))); g.closePath(); }
function fill(pts, style = '#000') { path(pts); g.fillStyle = style; g.fill(); }
function edges(pts) { for (let i = 0; i < pts.length; i++) line(pts[i], pts[(i + 1) % pts.length]); }
function polyline(pts) { for (let i = 0; i + 1 < pts.length; i++) line(pts[i], pts[i + 1]); }
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const down = (p, v) => [p[0], p[1] + v];

function pattern(rows) {
  const c = document.createElement('canvas');
  c.width = rows[0].length; c.height = rows.length;
  const cx = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { cx.fillStyle = ch === '#' ? '#fff' : '#000'; cx.fillRect(x, y, 1, 1); }));
  const pat = g.createPattern(c, 'repeat');
  pat.setTransform(new DOMMatrix([PX, 0, 0, PX, 0, 0])); // one pattern dot per fine pixel
  return pat;
}
const DOTS = pattern(['#...', '....', '..#.', '....']);
const CHECK = pattern(['#.', '.#']);

// Scale2x: doubles a black / white / see-through picture, rounding off its staircases instead of making them chunkier.
function smooth2x(src) {
  const w = src.width, h = src.height, sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  const kind = (x, y) => { if (x < 0 || y < 0 || x >= w || y >= h) return 0; const i = (y * w + x) * 4; return sd[i + 3] < 128 ? 0 : sd[i] > 127 ? 2 : 1; };
  const out = document.createElement('canvas');
  out.width = w * 2; out.height = h * 2;
  const oc = out.getContext('2d'), img = oc.createImageData(w * 2, h * 2), od = img.data;
  const put = (x, y, k) => { if (!k) return; const i = (y * w * 2 + x) * 4, v = k === 2 ? 255 : 0; od[i] = od[i + 1] = od[i + 2] = v; od[i + 3] = 255; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P0 = kind(x, y), A = kind(x, y - 1), B = kind(x + 1, y), C = kind(x - 1, y), D = kind(x, y + 1);
    put(2 * x, 2 * y, C === A && C !== D && A !== B ? A : P0);
    put(2 * x + 1, 2 * y, A === B && A !== C && B !== D ? B : P0);
    put(2 * x, 2 * y + 1, D === C && D !== B && C !== A ? C : P0);
    put(2 * x + 1, 2 * y + 1, B === D && B !== A && D !== C ? D : P0);
  }
  oc.putImageData(img, 0, 0);
  return out;
}
function smoothSprite(spr) { spr.fineImg = smooth2x(spr.img); spr.fineFlip = smooth2x(spr.flip); return spr; }
[...SPR.heroFront, ...SPR.heroBack, ...SPR.robot, ...Object.values(SPR.part), SPR.saucer].forEach(smoothSprite);

function blit(spr, cx, footY, flip = false) { g.drawImage(flip ? spr.fineFlip : spr.fineImg, fine(cx - spr.w / 2), fine(footY - spr.h + 1), spr.w, spr.h); }
function picture(c, x, y, w = c.width, h = c.height) { g.drawImage(smooth2x(c), fine(x), fine(y), w, h); }

// ---- text ----
const FONT = Object.fromEntries(Object.entries(GLYPHS).map(([ch, s]) => {
  const c = document.createElement('canvas');
  c.width = 5; c.height = 7;
  const cx = c.getContext('2d');
  cx.fillStyle = '#fff';
  s.split('|').forEach((row, y) => { for (let x = 0; x < 5; x++) if (row[x] === '#') cx.fillRect(x, y, 1, 1); });
  return [ch, smooth2x(c)];
}));
const warnedGlyphs = new Set();
function text(str, x, y, scale = 1, advance = 6 * scale) {
  g.fillStyle = '#fff';
  for (const raw of str) {
    const ch = raw.toUpperCase();
    let glyph = FONT[ch];
    if (!glyph) {
      if (!warnedGlyphs.has(ch)) { warnedGlyphs.add(ch); console.warn(`No glyph for "${ch}" (in "${str}"); drawing ? instead`); }
      glyph = FONT['?'];
    }
    g.drawImage(glyph, x, y, 5 * scale, 7 * scale);
    x += advance;
  }
}
const textWidth = (str, scale = 1) => str.length * 6 * scale - scale;
function centred(str, y, scale = 1, cx = SW / 2) { text(str, Math.round(cx - textWidth(str, scale) / 2), y, scale); }
function wrap(str, width) {
  const out = [];
  let lineStr = '';
  for (const word of str.toUpperCase().split(/\s+/)) {
    if (lineStr && (lineStr + ' ' + word).length > width) { out.push(lineStr); lineStr = word; } else lineStr = lineStr ? lineStr + ' ' + word : word;
  }
  if (lineStr) out.push(lineStr);
  return out;
}
function formatTime(s) { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

// ---- the room's projection ----
function originFor(room) {
  return { ox: Math.round(SW / 2 - (room.W - room.H) * HX / 2), oy: Math.round(PLAY_BOTTOM - 6 - (room.W + room.H) * HY) };
}
function P(o, x, y, z = 0) { return [fine(o.ox + (x - y) * HX), fine(o.oy + (x + y) * HY - z)]; }
// a point on a wall: plane {fixed: 'x'|'y', at}, `along` the other axis in tiles, v pixels up
function planePt(o, plane, along, v) { return plane.fixed === 'y' ? P(o, along, plane.at, v) : P(o, plane.at, along, v); }

// A box from (x0, y0) to (x1, y1) in tiles, z pixels up, h pixels tall. skin.left/right/top dress its faces.
// A face comes as its four corners: top left, top right, bottom right, bottom left.
function box(o, x0, y0, x1, y1, z, h, skin = {}) {
  const T = P(o, x0, y0, z + h), R = P(o, x1, y0, z + h), B = P(o, x1, y1, z + h), L = P(o, x0, y1, z + h);
  const Rb = P(o, x1, y0, z), Bb = P(o, x1, y1, z), Lb = P(o, x0, y1, z);
  fill([T, R, Rb, Bb, Lb, L]);
  if (skin.left) skin.left(L, B, Bb, Lb);
  if (skin.right) skin.right(B, R, Rb, Bb);
  if (skin.top) skin.top(T, R, B, L);
  edges([T, R, B, L]); line(L, Lb); line(B, Bb); line(R, Rb); line(Lb, Bb); line(Bb, Rb);
}
const dotted = (tl, tr, br, bl) => fill([tl, tr, br, bl], DOTS);
function bricks(step) {
  return (tl, tr, br, bl) => {
    const h = bl[1] - tl[1];
    for (let v = 0, k = 0; v < h - 1; v += step, k++) {
      if (v > 0) line(down(tl, v), down(tr, v));
      const top = lerp(tl, tr, k % 2 ? 0.3 : 0.7);
      line(down(top, v + 1), down(top, Math.min(h, v + step) - 1));
    }
  };
}
function panelled(tl, tr, br, bl) {
  const h = bl[1] - tl[1], a = lerp(tl, tr, 0.22), b = lerp(tl, tr, 0.78);
  edges([down(a, 2), down(b, 2), down(b, h - 2), down(a, h - 2)]);
}
function barred(tl, tr, br, bl) {
  const n = Math.max(2, Math.round(Math.abs(tr[0] - tl[0]) / 2));
  for (let i = 1; i < n; i++) line(lerp(tl, tr, i / n), lerp(bl, br, i / n));
}

// ---- the room's walls, floor and doorways ----
// An arch from a0 to a1 along a wall: posts up to `spring` pixels, then a half circle `rise` pixels high.
function archPoints(o, plane, a0, a1, base, spring, rise) {
  const pts = [planePt(o, plane, a0, base)], c = (a0 + a1) / 2, ra = (a1 - a0) / 2;
  for (let i = 0; i <= 12; i++) {
    const th = Math.PI - i * Math.PI / 12;
    pts.push(planePt(o, plane, c + ra * Math.cos(th), base + spring + rise * Math.sin(th)));
  }
  pts.push(planePt(o, plane, a1, base));
  return pts;
}
function drawArch(o, plane, at, base, inFront) {
  const inner = archPoints(o, plane, at - 0.12, at + 1.12, base, 19, 8);
  const outer = archPoints(o, plane, at - 0.45, at + 1.45, base, 19, 12);
  if (inFront) fill([...outer, ...inner.slice().reverse()]); // only the stone frame; you can see through the opening
  else fill(outer);                                          // knocks the opening through the bricks
  polyline(outer); polyline(inner);
  line(outer[0], inner[0]); line(outer[outer.length - 1], inner[inner.length - 1]);
  for (let i = 2; i <= 10; i += 2) line(inner[i], outer[i]); // the stones of the arch
  for (const v of [7, 14]) { line(planePt(o, plane, at - 0.45, base + v), planePt(o, plane, at - 0.12, base + v)); line(planePt(o, plane, at + 1.12, base + v), planePt(o, plane, at + 1.45, base + v)); }
}
const EXIT_PLANES = { N: (room) => ({ fixed: 'y', at: 0 }), W: (room) => ({ fixed: 'x', at: 0 }), S: (room) => ({ fixed: 'y', at: room.H }), E: (room) => ({ fixed: 'x', at: room.W }) };

function drawBackWalls(o, room, style, t) {
  const W = room.W, H = room.H, k = 0.35;
  const walls = [
    { plane: { fixed: 'y', at: 0 }, len: W, exit: room.spec.exits.N, deco: style.deco[0] },
    { plane: { fixed: 'x', at: 0 }, len: H, exit: room.spec.exits.W, deco: style.deco[1] },
  ];
  for (const w of walls) {
    const pt = (a, v) => planePt(o, w.plane, a, v);
    fill([pt(0, 0), pt(w.len, 0), pt(w.len, WALL_H), pt(0, WALL_H)]);
    for (let v = 0, c = 0; v < WALL_H; v += 8, c++) {
      if (v > 0) line(pt(0, v), pt(w.len, v));
      for (let i = 0; i <= w.len; i++) {
        const a = i + (c % 2 ? 0.5 : 0);
        if (a > 0 && a < w.len) line(pt(a, v + 1), pt(a, Math.min(WALL_H, v + 8) - 1));
      }
    }
    const free = [];
    for (let i = 1; i < w.len - 1; i++) if (w.exit === undefined || Math.abs(i - w.exit) > 1) free.push(i);
    if (free.length) {
      const i = free.reduce((best, c) => (Math.abs(c - w.len * 0.4) < Math.abs(best - w.len * 0.4) ? c : best));
      drawDeco(o, w.plane, i + 0.5, w.deco, t);
    } else console.warn(`room "${room.spec.id}": no free stretch of wall for its ${w.deco}`);
    if (w.exit !== undefined) drawArch(o, w.plane, w.exit, 0, false);
  }
  line(P(o, 0, 0, 0), P(o, 0, 0, WALL_H));
  // the tops of the walls, to show how thick they are, and their two cut ends
  const capN = [P(o, 0, 0, WALL_H), P(o, W, 0, WALL_H), P(o, W, -k, WALL_H), P(o, -k, -k, WALL_H)];
  const capW = [P(o, 0, H, WALL_H), P(o, 0, 0, WALL_H), P(o, -k, -k, WALL_H), P(o, -k, H, WALL_H)];
  const endN = [P(o, W, 0, 0), P(o, W, 0, WALL_H), P(o, W, -k, WALL_H), P(o, W, -k, 0)];
  const endW = [P(o, 0, H, 0), P(o, 0, H, WALL_H), P(o, -k, H, WALL_H), P(o, -k, H, 0)];
  for (const f of [capN, capW]) { fill(f, CHECK); edges(f); }
  for (const f of [endN, endW]) { fill(f); edges(f); }
}

function ellipse(o, plane, c, v, ra, rv, n = 16) {
  const pts = [];
  for (let i = 0; i < n; i++) { const th = i * Math.PI * 2 / n; pts.push(planePt(o, plane, c + ra * Math.cos(th), v + rv * Math.sin(th))); }
  return pts;
}
function drawDeco(o, plane, c, kind, t) {
  const pt = (a, v) => planePt(o, plane, a, v);
  if (kind === 'porthole' || kind === 'dial' || kind === 'target') {
    const outer = ellipse(o, plane, c, 26, 0.55, 7);
    fill(outer); edges(outer);
    const inner = ellipse(o, plane, c, 26, 0.38, 4.5);
    edges(inner);
    if (kind === 'porthole') { dot(...pt(c - 0.1, 28)); dot(...pt(c + 0.15, 24)); }
    else if (kind === 'target') edges(ellipse(o, plane, c, 26, 0.16, 2, 8));
    else { const a = Math.sin(t * 1.3 + c) * 1.2; line(pt(c, 26), pt(c + Math.sin(a) * 0.32, 26 + Math.cos(a) * 4)); }
  } else if (kind === 'window') {
    const win = archPoints(o, plane, c - 0.45, c + 0.45, 12, 14, 6);
    fill(win); edges(win);
    line(pt(c, 12), pt(c, 32));
    line(pt(c - 0.45, 22), pt(c + 0.45, 22));
    dot(...pt(c - 0.22, 27)); dot(...pt(c + 0.25, 16)); if (Math.floor(t * 2) % 3) dot(...pt(c + 0.2, 29));
  } else if (kind === 'pipes') {
    for (const d of [-0.2, 0.2]) {
      fill([pt(c + d - 0.08, 0), pt(c + d + 0.08, 0), pt(c + d + 0.08, WALL_H), pt(c + d - 0.08, WALL_H)]);
      line(pt(c + d - 0.08, 0), pt(c + d - 0.08, WALL_H)); line(pt(c + d + 0.08, 0), pt(c + d + 0.08, WALL_H));
      for (const v of [10, 24, 36]) line(pt(c + d - 0.14, v), pt(c + d + 0.14, v));
    }
  } else if (kind === 'shelf') {
    for (const v of [16, 30]) {
      const s = [pt(c - 0.8, v), pt(c + 0.8, v), pt(c + 0.8, v + 9), pt(c - 0.8, v + 9)];
      fill(s); line(s[0], s[1]); line(down(s[0], 1), down(s[1], 1));
      for (const [a, w, hgt] of [[-0.6, 0.3, 6], [-0.15, 0.25, 4], [0.3, 0.35, 7]]) edges([pt(c + a, v + 2), pt(c + a + w, v + 2), pt(c + a + w, v + 1 + hgt), pt(c + a, v + 1 + hgt)]);
    }
  } else if (kind === 'vine') {
    let a = c, v = 0;
    for (let i = 0; i < 26; i++) {
      const na = a + Math.sin(i * 1.7 + c) * 0.12, nv = v + 1.6;
      line(pt(a, v), pt(na, nv)); if (i % 4 === 2) { dot(...pt(na + 0.15, nv + 1)); dot(...pt(na + 0.2, nv)); }
      a = na; v = nv;
    }
  } else throw new Error(`drawDeco: unknown decoration "${kind}"`);
}

function drawFloor(o, room) {
  for (let y = 0; y <= room.H; y++) for (let x = 0; x <= room.W; x++) dot(...P(o, x, y));
  const a = P(o, 0, room.H), b = P(o, room.W, room.H), c = P(o, room.W, 0), S = 4;
  fill([a, b, c, down(c, S), down(b, S), down(a, S)]);
  fill([down(a, 1), down(b, 1), down(c, 1), down(c, S - 1), down(b, S - 1), down(a, S - 1)], DOTS);
  polyline([a, b, c]); polyline([down(a, S), down(b, S), down(c, S)]);
  line(a, down(a, S)); line(b, down(b, S)); line(c, down(c, S));
}

function drawPit(o, room, x, y, z) {
  const T = P(o, x, y, z), R = P(o, x + 1, y, z), B = P(o, x + 1, y + 1, z), L = P(o, x, y + 1, z);
  fill([T, R, B, L]);
  const openLeft = x === 0 || !room.pit[y][x - 1], openRight = y === 0 || !room.pit[y - 1][x];
  g.save(); path([T, R, B, L]); g.clip();
  for (const d of [3, 7, 12, 18]) {
    if (openLeft) line(P(o, x, y + 1, z - d), P(o, x, y, z - d));
    if (openRight) line(P(o, x, y, z - d), P(o, x + 1, y, z - d));
  }
  if (openLeft && openRight) line(T, P(o, x, y, z - 30));
  g.restore();
  if (openRight) line(T, R);
  if (openLeft) line(L, T);
  if (x + 1 >= room.W || !room.pit[y][x + 1]) line(R, B);
  if (y + 1 >= room.H || !room.pit[y + 1][x]) line(B, L);
}

function inset(o, x, y, z, i) { return [P(o, x + i, y + i, z), P(o, x + 1 - i, y + i, z), P(o, x + 1 - i, y + 1 - i, z), P(o, x + i, y + 1 - i, z)]; }

function drawGate(o, room, x, y, z, open) {
  const alongX = (x > 0 && room.wall[y][x - 1]) || (x < room.W - 1 && room.wall[y][x + 1]);
  if (!open) {
    if (alongX) box(o, x, y + 0.38, x + 1, y + 0.62, z, GATE_H, { left: barred });
    else box(o, x + 0.38, y, x + 0.62, y + 1, z, GATE_H, { right: barred });
    return;
  }
  const post = (a0, a1) => (alongX ? box(o, x + a0, y + 0.38, x + a1, y + 0.62, z, GATE_H) : box(o, x + 0.38, y + a0, x + 0.62, y + a1, z, GATE_H));
  post(0, 0.14); post(0.86, 1);
  if (alongX) box(o, x, y + 0.38, x + 1, y + 0.62, z + GATE_H - 5, 5, { left: barred });
  else box(o, x + 0.38, y, x + 0.62, y + 1, z + GATE_H - 5, 5, { right: barred });
}

// The rocket, built row by row. Lights down its middle show how many parts are fitted.
function rocketCanvas(fitted, flame) {
  const W = 25, H = 50, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const r = c.getContext('2d'), cx = 12;
  const px = (x, y, ink) => { r.fillStyle = ink ? '#fff' : '#000'; r.fillRect(x, y, 1, 1); };
  for (let row = 0; row < 44; row++) {
    const w = row < 14 ? Math.round(1 + row * 4 / 14) : 5;
    for (let x = -w - 1; x <= w + 1; x++) px(cx + x, row + 1, Math.abs(x) === w);
    if (row === 14 || row === 24 || row === 43) for (let x = -w; x <= w; x++) px(cx + x, row + 1, true);
    if (row >= 30) {
      const f = Math.floor((row - 30) / 1.6);
      for (let x = 5; x <= 6 + f; x++) { px(cx - x, row + 1, x === 6 + f); px(cx + x, row + 1, x === 6 + f); }
    }
  }
  px(cx, 0, true);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) px(cx + dx, 19 + dy, true); // porthole
  for (let i = 0; i < 6; i++) if (i < fitted) px(cx, 27 + i * 2, true);
  for (let y = 46; y < 48; y++) for (let x = -3; x <= 3; x++) px(cx + x, y, Math.abs(x) === 3 || y === 47);
  if (flame) for (let y = 48; y < 50; y++) for (let x = -2; x <= 2; x++) if ((x + y + flame) % 2 === 0) px(cx + x, y, true);
  return c;
}

// ---- what is on each square ----
function drawTile(game, room, o, x, y, t) {
  const h = room.h[y][x], z = h * LV;
  if (room.wall[y][x]) { box(o, x, y, x + 1, y + 1, 0, BLOCK_H, { left: bricks(5), right: bricks(5) }); return; }
  if (room.pit[y][x]) { drawPit(o, room, x, y, z); return; }
  if (h > 0) box(o, x, y, x + 1, y + 1, 0, z, { left: dotted, right: dotted });
  if (room.initial.pit[y][x]) { const d = inset(o, x, y, z, 0.15); edges(d); line(d[0], d[2]); line(d[1], d[3]); } // a filled pit: the crate's lid
  const plate = room.plateAt[y][x];
  if (plate) {
    const pressed = room.crates[y][x] > 0 || (game.hero.x === x && game.hero.y === y);
    edges(inset(o, x, y, z, 0.2));
    if (!pressed) { const d = inset(o, x, y, z + 2, 0.3); fill(d, CHECK); edges(d); } else edges(inset(o, x, y, z, 0.3));
  }
  const vent = ventAt(room, x, y);
  const state = vent ? ventState(vent, game.elapsed) : null;
  if (vent) {
    edges(inset(o, x, y, z, 0.15));
    if (state !== 'warn' || app.tick % 10 < 5) for (const f of [0.35, 0.5, 0.65]) line(P(o, x + 0.25, y + f, z), P(o, x + 0.75, y + f, z));
  }
  const door = room.doorAt[y][x];
  if (door) drawGate(o, room, x, y, z, !doorClosed(game, room, x, y));
  drawCrates(room, o, x, y, z);
  for (const p of room.parts) {
    if (p.taken || p.x !== x || p.y !== y) continue;
    const [cx, cy] = P(o, x + 0.5, y + 0.5, surface(room, x, y) * LV + 5 + Math.round(Math.sin(t * 3) * 2));
    blit(SPR.part[p.id], cx, cy);
  }
  if (isRocket(room, x, y)) { const [cx, cy] = P(o, x + 0.5, y + 0.5, z); picture(rocketCanvas(game.delivered.length, 0), cx - 12, cy - 47); }
  if (vent && room.crates[y][x] === 0 && state !== 'off') drawSteam(o, x, y, z, state === 'on', t);
}

function drawCrates(room, o, x, y, z) {
  const n = room.crates[y][x], s = app.slide;
  for (let i = 0; i < n; i++) {
    let cx = x, cy = y, cz = z + i * CRATE_H;
    if (s && i === n - 1 && s.toX === x && s.toY === y) { cx = s.fromX + (x - s.fromX) * s.p; cy = s.fromY + (y - s.fromY) * s.p; cz += s.dz * (1 - s.p); }
    box(o, cx + 0.08, cy + 0.08, cx + 0.92, cy + 0.92, cz, CRATE_H, { left: panelled, right: panelled, top: (T, R, B, L) => { line(lerp(T, L, 0.5), lerp(R, B, 0.5)); } });
  }
}

function drawSteam(o, x, y, z, on, t) {
  const [cx, cy] = P(o, x + 0.5, y + 0.5, z);
  const puffs = on ? 5 : 2;
  for (let i = 0; i < puffs; i++) {
    const rise = ((t * 22 + i * 6) % (on ? 30 : 8));
    const px = cx + Math.round(Math.sin(t * 5 + i * 2) * 2), py = cy - 3 - rise, r = on ? 2 + rise / 8 : 1;
    const pts = [];
    for (let k = 0; k < 10; k++) pts.push([px + Math.cos(k * Math.PI / 5) * r * 1.3, py + Math.sin(k * Math.PI / 5) * r]);
    fill(pts, on ? CHECK : '#fff');
  }
}

function robotView(r) {
  const p = Math.min(1, r.t / (ROBOT_STEP * 0.6));
  return { x: r.px + (r.x - r.px) * p, y: r.py + (r.y - r.py) * p };
}

function drawRobot(room, o, r, t) {
  const v = robotView(r);
  const level = room.h[r.y][r.x];
  const [cx, cy] = P(o, v.x + 0.5, v.y + 0.5, level * LV);
  blit(SPR.robot[Math.floor(t * 4) % 2], cx, cy + 2, r.dir === 'W' || r.dir === 'S');
}

function drawHero(game, o) {
  const f = app.free, room = cur(game);
  if (game.invuln > 0 && Math.floor(app.tick / 4) % 2) return;
  const ground = standLevel(game, room, f.x, f.y);
  if (f.air && ground > NOTHING && f.z - ground > 0.2) { const [gx, gy] = P(o, f.x, f.y, ground * LV); dot(gx - 2, gy); dot(gx, gy + 1); dot(gx + 2, gy); }
  const [sx, sy] = P(o, f.x, f.y, f.z * LV);
  const face = game.hero.face, back = face === 'N' || face === 'W', flip = face === 'S' || face === 'W';
  const frame = f.air ? 1 : Math.floor(f.walk / 0.275) % 2;
  blit((back ? SPR.heroBack : SPR.heroFront)[frame], sx, sy + 2, flip);
}

function renderRoom(game, t) {
  const room = cur(game), o = originFor(room), style = ROOM_STYLE[room.spec.id];
  drawBackWalls(o, room, style, t);
  drawFloor(o, room);
  const items = [];
  for (let y = 0; y < room.H; y++) for (let x = 0; x < room.W; x++) items.push({ d: x + y, k: 0, fn: () => drawTile(game, room, o, x, y, t) });
  for (const r of room.robots) items.push({ d: Math.max(r.x + r.y, r.px + r.py), k: 1, fn: () => drawRobot(room, o, r, t) });
  const f = app.free, under = tilesUnder(f.x, f.y, RADIUS);
  items.push({ d: Math.max(...under.map(([x, y]) => x + y)), k: 2, fn: () => drawHero(game, o) });
  items.sort((a, b) => a.d - b.d || a.k - b.k);
  for (const it of items) it.fn();
  for (const dir of ['S', 'E']) {
    const at = room.spec.exits[dir];
    if (at === undefined) continue;
    const [ex, ey] = exitTile(room.spec, dir, at);
    drawArch(o, EXIT_PLANES[dir](room), at, room.h[ey][ex] * LV, true);
  }
  for (const s of app.sparks) { dot(s.x, s.y); if (s.life > 12) { dot(s.x - 1, s.y); dot(s.x + 1, s.y); dot(s.x, s.y - 1); dot(s.x, s.y + 1); } }
}

// ---- the panel along the bottom ----
function drawPanel(game, t) {
  const low = game.time <= 30;
  paint(0, 20, 8, 4, 'cyan'); paint(8, 20, 7, 4, low && app.tick % 30 < 15 ? 'red' : 'yellow'); paint(15, 20, 8, 4, 'white'); paint(23, 20, 9, 4, 'green');
  line([0, 161], [255, 161]); line([0, 190], [255, 190]);
  for (const x of [63, 119, 183]) line([x, 163], [x, 188]);
  // a window on the sky: the saucer crosses it as time runs out and lands on the castle
  edges([[3, 164], [60, 164], [60, 188], [3, 188]]);
  for (const [sx, sy] of [[9, 168], [22, 172], [35, 167], [48, 175], [55, 169], [14, 177], [41, 181]]) if ((sx + Math.floor(t * 2)) % 7) dot(sx, sy);
  line([4, 186], [59, 186]);
  edges([[7, 179], [11, 179], [11, 186], [7, 186]]); edges([[17, 179], [21, 179], [21, 186], [17, 186]]); line([11, 182], [17, 182]);
  for (const x of [7, 9, 11, 17, 19, 21]) dot(x, 178);
  line([14, 176], [14, 181]); dot(14, 175);
  const f = 1 - Math.max(0, game.time) / TIME_LIMIT;
  blit(SPR.saucer, Math.round(48 - f * 34), Math.round(172 + f * 4));
  if (low && app.tick % 20 < 10) { const bx = Math.round(48 - f * 34); line([bx - 2, 175 + f * 4], [bx - 5, 185]); line([bx + 2, 175 + f * 4], [bx + 5, 185]); }
  text('TIME', 74, 165);
  const clock = formatTime(game.time);
  text(clock, Math.round(91 - (clock.length * 10 - 1) / 2), 175, 2, 10);
  text('CARRY', 137, 165);
  for (let i = 0; i < CARRY_MAX; i++) {
    const x = 124 + i * 20;
    edges([[x, 174], [x + 15, 174], [x + 15, 188], [x, 188]]);
    const id = game.hero.carry[i];
    if (id) blit(SPR.part[id], x + 8, 187);
  }
  text('ROCKET', 202, 165);
  PARTS.forEach((p, i) => {
    const x = 191 + i * 11;
    if (game.delivered.includes(p.id)) blit(SPR.part[p.id], x, 187);
    else { dot(x - 2, 182); dot(x + 2, 182); dot(x - 2, 186); dot(x + 2, 186); }
  });
}

function drawCaption(game) {
  paint(0, 0, 32, 2, 'white');
  const c = app.caption;
  if (c) {
    const page = Math.min(c.pages.length - 1, Math.floor(c.age / 170));
    c.pages[page].forEach((l, i) => centred(l, 1 + i * 8));
  } else centred(ROOMS[game.hero.room].name.toUpperCase(), 4);
}

// ---- screens ----
function drawTitle(t) {
  attr.fill(ZX.white);
  const rainbow = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];
  for (let c = 0; c < 32; c++) paint(c, 2, 1, 2, rainbow[(c + Math.floor(t * 8)) % rainbow.length]);
  paint(0, 5, 32, 12, 'yellow');
  paint(0, 17, 32, 3, 'cyan');
  paint(0, 21, 32, 1, app.tick % 50 < 32 ? 'white' : 'black');
  centred('ATOMIC CASTLE', 17, 2);
  for (const [sx, sy] of [[20, 50], [70, 60], [200, 48], [236, 80], [40, 110], [222, 120], [110, 44], [160, 64]]) dot(sx, sy);
  const flame = Math.floor(t * 10) % 2 + 1;
  picture(rocketCanvas(6, flame), 92, 52, 40, 80);
  blit(SPR.heroFront[Math.floor(t * 3) % 2], 160, 131);
  blit(SPR.robot[Math.floor(t * 4) % 2], 186, 131, true);
  blit(SPR.saucer, Math.round(128 + Math.sin(t * 0.7) * 90), 52 + Math.round(Math.sin(t * 2) * 3));
  line([20, 134], [236, 134]);
  centred("THE PROFESSOR'S ROCKET IS MISSING SIX", 138);
  centred('PARTS. FIND THEM BEFORE THE FLYING', 146);
  centred('SAUCERS LAND.', 154);
  centred('PRESS SPACE TO START', 169);
  centred('ARROWS WALK  SPACE HOP  R RESET ROOM', 182);
  paint(0, 22, 32, 2, 'green');
  if (app.best) { paint(24, 0, 8, 1, 'green'); text(`BEST ${formatTime(app.best)}`, 194, 1); }
}

function drawEnd(game, kind, t) {
  attr.fill(ZX.white);
  if (kind === 'win') {
    paint(0, 1, 32, 3, 'yellow'); paint(0, 4, 32, 15, 'white'); paint(0, 19, 32, 5, 'cyan');
    centred('LIFT OFF!', 10, 2);
    const rise = Math.min(140, Math.max(0, app.endTimer - 30) * 1.2);
    picture(rocketCanvas(6, Math.floor(t * 12) % 2 + 1), 103, 60 - rise, 50, 100);
    line([40, 161], [216, 161]);
    centred(`TIME TO SPARE ${formatTime(game.time)}`, 166);
    if (app.newBest) centred('A NEW BEST TIME!', 175);
  } else {
    paint(0, 1, 32, 3, 'red'); paint(0, 4, 32, 15, 'green'); paint(0, 19, 32, 5, 'white');
    centred('THE SAUCERS HAVE LANDED', 10, 1);
    for (let i = 0; i < 3; i++) blit(SPR.saucer, 70 + i * 58, 60 + Math.round(Math.sin(t * 2 + i) * 4) + i * 6);
    line([30, 140], [226, 140]);
    for (const x of [100, 140]) edges([[x, 120], [x + 16, 120], [x + 16, 140], [x, 140]]);
    centred(`PARTS FITTED ${game.delivered.length} OF ${PARTS.length}`, 166);
  }
  if (app.endTimer > 40 && app.tick % 50 < 32) centred('PRESS SPACE TO PLAY AGAIN', 182);
}

// ---- the game ----
const BEST_KEY = 'atomic-castle-best';
function loadBest() { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (err) { console.warn('Could not read the saved best time:', err); return 0; } }
function saveBest(s) { try { localStorage.setItem(BEST_KEY, String(Math.round(s))); } catch (err) { console.warn('Could not save the best time:', err); } }

const app = {
  mode: 'title', tick: 0, game: null, held: [], lastBump: -1, caption: null, rocketWait: 0,
  free: { x: 0, y: 0, z: 0, vz: 0, air: false, jumpDir: null, jumpQueued: 0, pushT: 0, walk: 0 }, // the hero, moving freely (film-move.js)
  slide: null, reveal: SH, border: 'black', borderTimer: 0, loading: 0, sparks: [], pendingEnd: null, endTimer: 0,
  best: loadBest(), newBest: false, fatal: null,
};

function startGame() {
  app.game = createGame();
  app.mode = 'play'; app.held = []; app.free.jumpQueued = 0; app.rocketWait = 0; app.slide = null; app.sparks = [];
  app.pendingEnd = null; app.newBest = false; app.caption = null; app.loading = 50;
  snapHero(app.game);
  processEvents(app.game);
}

function snapHero(game) { placeHero(game); }

function say(str, frames = 230) {
  const lines = wrap(str, 42), pages = [];
  for (let i = 0; i < lines.length; i += 2) pages.push(lines.slice(i, i + 2));
  app.caption = { pages, age: 0, ttl: Math.max(frames, pages.length * 170) };
}
function flashBorder(colour, frames) { app.border = colour; app.borderTimer = frames; }
function sparkle(game, x, y, z, n) {
  const [sx, sy] = P(originFor(cur(game)), x + 0.5, y + 0.5, z);
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; app.sparks.push({ x: sx, y: sy, vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 0.8 - 0.4, life: 24 }); }
}

function processEvents(game) {
  for (const e of game.events) {
    switch (e.t) {
      case 'step': Sound.play('step'); break;
      case 'hop': Sound.play('hop'); break;
      case 'push': Sound.play('push'); app.slide = { fromX: e.fromX, fromY: e.fromY, toX: e.toX, toY: e.toY, p: 0, dz: Math.max(0, e.drop) * LV }; break;
      case 'fill': Sound.play('fill'); say('The pit has been filled. The crate is now part of the floor. It is not complaining.'); break;
      case 'bump':
        if (app.tick - app.lastBump > 14) Sound.play('bump');
        app.lastBump = app.tick;
        if (e.why === 'no parts') say('The rocket is not interested in empty hands. It needs parts.');
        break;
      case 'pickup': Sound.play('pickup'); flashBorder('white', 6); sparkle(game, game.hero.x, game.hero.y, heroLevel(game) * LV + 12, 10); say(PICKUP_LINES[e.part], 320); break;
      case 'full': Sound.play('full'); say('Your hands are full. Take the parts to the rocket first.'); break;
      case 'deliver': {
        Sound.play('deliver'); flashBorder('yellow', 12);
        const r = cur(game).rocket;
        sparkle(game, r.x, r.y, 30, 14);
        say(e.total === PARTS.length ? 'That is the last one. Stand well back.' : `${e.total} of ${PARTS.length} parts fitted. ${PARTS.length - e.total} to go.`, 300);
        break;
      }
      case 'hit': Sound.play('hit'); flashBorder('red', 30); snapHero(game); say(HIT_LINES[game.hits % HIT_LINES.length] + ` (-${HIT_PENALTY}s)`, 260); break;
      case 'room':
        Sound.play('room'); snapHero(game); app.slide = null; app.sparks = []; app.reveal = PLAY_TOP;
        if (e.first) say(ROOMS[e.room].caption, 340); else app.caption = null;
        break;
      case 'reset': Sound.play('reset'); snapHero(game); app.reveal = PLAY_TOP; say(`Room reset. That cost ${RESET_PENALTY} seconds and a little dignity.`); break;
      case 'win': app.pendingEnd = { mode: 'win', delay: 80 }; break;
      case 'lose': app.pendingEnd = { mode: 'lose', delay: 40 }; Sound.play('lose'); break;
      default: throw new Error(`processEvents: unknown event "${e.t}"`);
    }
  }
  game.events.length = 0;
}

function finishGame(kind) {
  app.mode = kind; app.endTimer = 0;
  if (kind === 'win') {
    Sound.play('win');
    const left = Math.ceil(app.game.time);
    app.newBest = left > app.best;
    if (app.newBest) { app.best = left; saveBest(left); }
  }
}

const KEY_DIRS = { ArrowUp: 'N', ArrowRight: 'E', ArrowDown: 'S', ArrowLeft: 'W', w: 'N', d: 'E', s: 'S', a: 'W', W: 'N', D: 'E', S: 'S', A: 'W' };
function onKeyDown(key) {
  Sound.init();
  if (app.mode === 'title') { if (key === ' ' || key === 'Enter' || key === '0') { Sound.play('choose'); startGame(); return true; } }
  else if (app.mode === 'play') {
    if (key in KEY_DIRS) { const d = KEY_DIRS[key]; app.held = app.held.filter((x) => x !== d); app.held.push(d); return true; }
    if (key === ' ') { app.free.jumpQueued = 0.25; return true; }
    if (key === 'r' || key === 'R') { resetRoom(app.game); processEvents(app.game); return true; }
    if (key === 'p' || key === 'P' || key === 'Escape') { app.mode = 'paused'; app.held = []; return true; }
  } else if (app.mode === 'paused') {
    if (['p', 'P', 'Escape', 'Enter', ' '].includes(key)) { app.mode = 'play'; return true; }
  } else if (app.mode === 'win' || app.mode === 'lose') {
    if (app.endTimer > 40 && (key === ' ' || key === 'Enter')) { Sound.play('choose'); app.mode = 'title'; return true; }
  }
  return false;
}
function onKeyUp(key) { if (key in KEY_DIRS) app.held = app.held.filter((x) => x !== KEY_DIRS[key]); }

function stepGame(dt) {
  app.tick++;
  if (app.borderTimer > 0) app.borderTimer--;
  if (app.loading > 0) app.loading--;
  if (app.reveal < SH) app.reveal += 9;
  for (const s of app.sparks) { s.x += s.vx; s.y += s.vy; s.life--; }
  app.sparks = app.sparks.filter((s) => s.life > 0);
  if (app.caption && ++app.caption.age > app.caption.ttl) app.caption = null;
  if (app.slide) { app.slide.p = Math.min(1, app.slide.p + dt / STEP_TIME); if (app.slide.p >= 1) app.slide = null; }
  if (app.mode === 'win' || app.mode === 'lose') { app.endTimer++; return; }
  if (app.mode !== 'play') return;
  const game = app.game;
  if (app.pendingEnd) {
    if (--app.pendingEnd.delay <= 0) { const kind = app.pendingEnd.mode; app.pendingEnd = null; finishGame(kind); }
    freeUpdate(game, dt); processEvents(game);
    return;
  }
  if (!game.over) { stepFree(game, dt); processEvents(game); }
  const before = game.time;
  freeUpdate(game, dt);
  processEvents(game);
  if (before > 30 && game.time <= 30 && !game.over) { Sound.play('alarm'); say('Thirty seconds. The saucers are on the horizon. They look smug.', 260); }
}

function render() {
  const t = app.tick / 60;
  cls();
  if (app.mode === 'title') drawTitle(t);
  else if (app.mode === 'win' || app.mode === 'lose') drawEnd(app.game, app.mode, t);
  else {
    const game = app.game, style = ROOM_STYLE[cur(game).spec.id];
    attr.fill(ZX[style.ink]);
    renderRoom(game, t);
    if (app.reveal < PLAY_BOTTOM) { g.fillStyle = '#000'; g.fillRect(0, Math.max(PLAY_TOP, app.reveal), SW, PLAY_BOTTOM - Math.max(PLAY_TOP, app.reveal) + 1); }
    g.fillStyle = '#000'; g.fillRect(0, 0, SW, PLAY_TOP); g.fillRect(0, PLAY_BOTTOM + 1, SW, SH - PLAY_BOTTOM - 1);
    drawCaption(game);
    drawPanel(game, t);
    if (app.mode === 'paused') {
      g.fillStyle = '#000'; g.fillRect(88, 72, 80, 24);
      edges([[88, 72], [167, 72], [167, 95], [88, 95]]);
      centred('PAUSED', 81);
      paint(11, 9, 10, 3, 'white');
    }
  }
  present();
  // the border: stripes while the game "loads", flashes when something happens
  let border = ZX_BORDER.black;
  if (app.loading > 0) {
    const [a, b] = app.loading > 25 ? ['#d70000', '#00d7d7'] : ['#0000d7', '#d7d700'];
    const off = Math.floor(Math.random() * 40);
    document.body.style.background = `repeating-linear-gradient(${a} ${off}px, ${a} ${off + 6}px, ${b} ${off + 6}px, ${b} ${off + 14}px)`;
    return;
  }
  if (app.borderTimer > 0 && (app.border !== 'red' || app.borderTimer % 6 < 3)) border = ZX_BORDER[app.border];
  document.body.style.background = border;
}

// ---- running ----
function canvasKeys(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const used = onKeyDown(e.key);
  if (used || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Tab'].includes(e.key)) e.preventDefault();
  if (!used && (e.key === 'm' || e.key === 'M')) Sound.muted = !Sound.muted;
}
window.addEventListener('keydown', canvasKeys);
window.addEventListener('keyup', (e) => onKeyUp(e.key));
window.addEventListener('blur', () => { app.held = []; if (app.mode === 'play') app.mode = 'paused'; });
view.addEventListener('mousedown', () => { Sound.init(); if (app.mode === 'title' || ((app.mode === 'win' || app.mode === 'lose') && app.endTimer > 40)) onKeyDown(' '); else if (app.mode === 'paused') onKeyDown('p'); });

function renderFatal() {
  vctx.fillStyle = '#000'; vctx.fillRect(0, 0, view.width, view.height);
  vctx.fillStyle = '#f55'; vctx.font = '24px monospace';
  vctx.fillText('Something went wrong: ' + String(app.fatal.message || app.fatal), 30, 60);
}

const STEP_MS = 1000 / 60;
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(now - last, 100);
  last = now;
  try {
    if (app.fatal) { renderFatal(); return; }
    while (acc >= STEP_MS) { stepGame(STEP_MS / 1000); acc -= STEP_MS; }
    render();
  } catch (err) {
    app.fatal = err; console.error(err);
  }
  requestAnimationFrame(frame);
}

// Screenshot hook: filmation.html?still&scene=title|room|win|lose&room=vault&x=..&y=..&ticks=..
if (params.has('still')) {
  const scene = params.get('scene') || 'title';
  if (scene !== 'title') {
    startGame(); app.loading = 0;
    const game = app.game, idx = ROOM_INDEX[params.get('room') || 'airlock'];
    if (idx === undefined) throw new Error(`no room "${params.get('room')}"`);
    game.hero.room = idx;
    const room = cur(game);
    const [dir, at] = Object.entries(room.spec.exits)[0], [ex, ey] = exitTile(room.spec, dir, at);
    game.hero.x = Number(params.get('x') ?? ex); game.hero.y = Number(params.get('y') ?? ey); game.hero.face = params.get('face') || 'E'; game.hero.entry = { x: game.hero.x, y: game.hero.y };
    if (params.has('carry')) game.hero.carry = params.get('carry').split(',');
    if (params.has('delivered')) game.delivered = params.get('delivered').split(',');
    snapHero(game); say(room.spec.caption, 99999);
    if (scene === 'win' || scene === 'lose') { app.mode = scene; app.endTimer = Number(params.get('t') || 80); if (scene === 'win') game.delivered = PARTS.map((p) => p.id); }
  }
  for (let i = 0; i < Number(params.get('ticks') || 30); i++) stepGame(STEP_MS / 1000);
  // keys=E40,J,N20: hold a direction for some frames, or J to jump (then wait 40 frames); for testing movement
  for (const tok of (params.get('keys') || '').split(',').filter(Boolean)) {
    if (tok === 'J') { app.held = []; onKeyDown(' '); for (let i = 0; i < 40; i++) stepGame(STEP_MS / 1000); continue; }
    const d = tok[0], n = Number(tok.slice(1));
    if (!'NESW'.includes(d) || !(n > 0)) throw new Error(`keys: cannot read "${tok}"`);
    app.held = [d];
    for (let i = 0; i < n; i++) stepGame(STEP_MS / 1000);
  }
  app.held = [];
  const log = document.createElement('pre'); log.id = 'log'; log.style.display = 'none'; document.body.appendChild(log);
  log.textContent = ['hero', JSON.stringify(app.free), 'square', app.game && app.game.hero.x, app.game && app.game.hero.y, 'room', app.game && cur(app.game).spec.id, 'time', app.game && app.game.time.toFixed(1), 'carry', app.game && app.game.hero.carry.join('/')].join(' ');
  render();
} else requestAnimationFrame(frame);
