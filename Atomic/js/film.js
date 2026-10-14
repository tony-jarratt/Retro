'use strict';

// Atomic Castle drawn the way Ultimate's Filmation games were (Knight Lore, Alien 8): a 256 x 192 screen in one ink
// colour per room on black, each room boxed in by two brick back walls with arched doorways, masked sprites, a
// coloured border, and a framed panel along the bottom. The rules are in data.js and rules.js;
// free movement and the moving blocks in film-move.js.
// Everything is drawn in black and white first; present() then colours each 8 x 8 cell with its ink, like a Spectrum.

const params = new URLSearchParams(location.search);
// Play-test mode (index.html?playtest): rooms are numbered, G jumps to a room by number, and lives and time never run out.
const PLAYTEST = params.has('playtest');
const SW = 256, SH = 192;
const HX = 10, HY = 5, LV = 10; // half a tile across, half a tile down, one level up (screen pixels)
const BASE_WALL_H = 44;         // the back walls of a room (taller where a doorway is high up)
const WALL_H = BASE_WALL_H;
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
  cellarstairs: { ink: 'cyan', deco: ['pipes', 'shelf'] },
  towerstairs: { ink: 'cyan', deco: ['window', 'dial'] },
  tlanding: { ink: 'white', deco: ['window', 'window'] },
  battlements: { ink: 'cyan', deco: ['window', 'window'] },
  bridge: { ink: 'magenta', deco: ['window', 'vine'] },
  radio: { ink: 'yellow', deco: ['dial', 'window'] },
  clock: { ink: 'green', deco: ['dial', 'dial'] },
  shaft: { ink: 'yellow', deco: ['pipes', 'pipes'] },
  loft: { ink: 'cyan', deco: ['window', 'shelf'] },
  clanding: { ink: 'green', deco: ['pipes', 'shelf'] },
  dungeon: { ink: 'yellow', deco: ['vine', 'pipes'] },
  wine: { ink: 'magenta', deco: ['shelf', 'shelf'] },
  boiler: { ink: 'cyan', deco: ['dial', 'pipes'] },
  chute: { ink: 'red', deco: ['pipes', 'dial'] },
  pump: { ink: 'white', deco: ['dial', 'pipes'] },
  flooded: { ink: 'yellow', deco: ['pipes', 'shelf'] },
  furnace: { ink: 'green', deco: ['dial', 'pipes'] },
  depot: { ink: 'magenta', deco: ['dial', 'pipes'] },
  // the rotation trial (trial.html)
  turntable: { ink: 'cyan', deco: ['window', 'dial'] },
  gallery: { ink: 'yellow', deco: ['pipes', 'shelf'] },
  plinth: { ink: 'green', deco: ['window', 'vine'] },
};
// What the solid squares (#) in each room are dressed as; a room with several picks one per square.
const PROPS = {
  airlock: ['computer'], repair: ['still', 'computer'], observatory: ['computer', 'stone'], range: ['stone'], cafeteria: ['still'],
  launch: ['computer'], control: ['computer', 'computer', 'coil'], reactor: ['stone', 'coil', 'stone'], store: ['barrel'], lounge: ['computer', 'still'],
  greenhouse: ['stone'], vault: ['stone', 'coil'], cellarstairs: ['barrel'], towerstairs: ['coil'], tlanding: ['stone'],
  battlements: ['stone'], radio: ['computer'], loft: ['stone'], clanding: ['barrel'], wine: ['barrel'], boiler: ['still', 'barrel'],
  pump: ['computer', 'still'], flooded: ['barrel'],
};
function propAt(room, x, y) { const kinds = PROPS[room.spec.id] || ['stone']; return kinds[(x * 7 + y * 3) % kinds.length]; }
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
[...SPR.heroFront, ...SPR.heroBack, ...SPR.robot, ...Object.values(SPR.part), SPR.saucer, SPR.life].forEach(smoothSprite);

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
// The camera can look at a room from any of its four corners: app.rot quarter turns. A point on the room's map (x, y)
// is first turned into the room as seen (u, v), where u runs down-right and v down-left on screen as x and y did
// before, and then drawn with the one Filmation projection (Pv). P does both, so most drawing never knows about turns;
// only what depends on which side faces you (the back walls, box faces, pit sides, sprites' facing) works in (u, v).
const TURN = ['N', 'E', 'S', 'W'];
function originFor(room) {
  const rot = app.rot, VW = rot % 2 ? room.H : room.W, VH = rot % 2 ? room.W : room.H;
  return { ox: Math.round(SW / 2 - (VW - VH) * HX / 2), oy: Math.round(PLAY_BOTTOM - 6 - (VW + VH) * HY), rot, W: room.W, H: room.H, VW, VH };
}
function toView(o, x, y) {
  if (o.rot === 0) return [x, y];
  if (o.rot === 1) return [o.H - y, x];
  if (o.rot === 2) return [o.W - x, o.H - y];
  return [y, o.W - x];
}
function viewTile(o, x, y) { const [u, v] = toView(o, x + 0.5, y + 0.5); return [Math.floor(u), Math.floor(v)]; }
// the map square seen at (u, v)
function mapTile(o, u, v) {
  const a = u + 0.5, b = v + 0.5;
  const [x, y] = o.rot === 0 ? [a, b] : o.rot === 1 ? [b, o.H - a] : o.rot === 2 ? [o.W - a, o.H - b] : [o.W - b, a];
  return [Math.floor(x), Math.floor(y)];
}
// a box on the map, as seen: [u0, v0, u1, v1]
function viewBox(o, x0, y0, x1, y1) {
  const [a0, b0] = toView(o, x0, y0), [a1, b1] = toView(o, x1, y1);
  return [Math.min(a0, a1), Math.min(b0, b1), Math.max(a0, a1), Math.max(b0, b1)];
}
const viewDir = (rot, dir) => TURN[(TURN.indexOf(dir) + rot) % 4];   // a compass direction, as seen
const mapDir = (rot, dir) => TURN[(TURN.indexOf(dir) + 4 - rot) % 4]; // a direction on screen, on the map
function Pv(o, u, v, z = 0) { return [fine(o.ox + (u - v) * HX), fine(o.oy + (u + v) * HY - z)]; }
function P(o, x, y, z = 0) { const [u, v] = toView(o, x, y); return Pv(o, u, v, z); }
// a point on a wall of the room as seen: plane {fixed: 'u'|'v', at}, `along` the other axis in tiles, v pixels up
function planePt(o, plane, along, v) { return plane.fixed === 'v' ? Pv(o, along, plane.at, v) : Pv(o, plane.at, along, v); }

// A box from (x0, y0) to (x1, y1) in tiles, z pixels up, h pixels tall. skin.left/right/top dress its faces.
// A face comes as its four corners: top left, top right, bottom right, bottom left.
// After a quarter turn the box's other pair of sides faces you, so the skins swap over.
function box(o, x0, y0, x1, y1, z, h, skin = {}) {
  const [u0, v0, u1, v1] = viewBox(o, x0, y0, x1, y1), turned = o.rot % 2 === 1;
  const left = turned ? skin.right : skin.left, right = turned ? skin.left : skin.right;
  const T = Pv(o, u0, v0, z + h), R = Pv(o, u1, v0, z + h), B = Pv(o, u1, v1, z + h), L = Pv(o, u0, v1, z + h);
  const Rb = Pv(o, u1, v0, z), Bb = Pv(o, u1, v1, z), Lb = Pv(o, u0, v1, z);
  fill([T, R, Rb, Bb, Lb, L]);
  if (left) left(L, B, Bb, Lb);
  if (right) right(B, R, Rb, Bb);
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
const EXIT_PLANES = { N: (o) => ({ fixed: 'v', at: 0 }), W: (o) => ({ fixed: 'u', at: 0 }), S: (o) => ({ fixed: 'v', at: o.VH }), E: (o) => ({ fixed: 'u', at: o.VW }) };
// The room's doorways as seen: { N: {at, base}, ... } by the side of the screen they are on.
function viewExits(o, room) {
  const out = {};
  for (const [dir, at] of Object.entries(room.spec.exits)) {
    const [x, y] = exitTile(room.spec, dir, at), [u, v] = viewTile(o, x, y), side = viewDir(o.rot, dir);
    out[side] = { at: side === 'N' || side === 'S' ? u : v, base: room.h[y][x] * LV };
  }
  return out;
}
// what hangs on each wall of the room: style.deco gives the north and west walls, and the other two copy them
function decoFor(style, dir) { return { N: style.deco[0], W: style.deco[1], S: style.deco[0], E: style.deco[1] }[dir]; }

// The symbols on marked plates and clue plaques, as strokes in a 1 x 1 box; pt(a, b) places a point of the box.
function strokeMark(kind, pt) {
  if (kind === 'ring') { const pts = []; for (let i = 0; i <= 12; i++) { const th = i * Math.PI / 6; pts.push(pt(0.5 + Math.cos(th) * 0.45, 0.5 + Math.sin(th) * 0.45)); } polyline(pts); }
  else if (kind === 'cross') { line(pt(0.1, 0.1), pt(0.9, 0.9)); line(pt(0.1, 0.9), pt(0.9, 0.1)); }
  else if (kind === 'triangle') polyline([pt(0.5, 0.05), pt(0.95, 0.9), pt(0.05, 0.9), pt(0.5, 0.05)]);
  else throw new Error(`strokeMark: unknown mark "${kind}"`);
}
// A framed plaque on a wall, centred `c` tiles along it, showing the mark of the plate that works.
function drawClue(o, plane, c, mark) {
  const pt = (a, v) => planePt(o, plane, a, v);
  const outer = [pt(c - 0.6, 10), pt(c + 0.6, 10), pt(c + 0.6, 36), pt(c - 0.6, 36)];
  const inner = [pt(c - 0.48, 12), pt(c + 0.48, 12), pt(c + 0.48, 34), pt(c - 0.48, 34)];
  fill(outer); edges(outer); edges(inner);
  strokeMark(mark, (a, b) => pt(c - 0.35 + a * 0.7, 31 - b * 16));
}

function drawBackWalls(o, room, style, t) {
  const W = o.VW, H = o.VH, k = 0.35, exits = viewExits(o, room);
  const exitBase = (side) => (exits[side] ? exits[side].base : 0);
  const WALL_H = Math.max(BASE_WALL_H, exitBase('N') + 34, exitBase('W') + 34); // tall enough for a raised doorway
  const at = (side) => (exits[side] ? exits[side].at : undefined);
  const clue = room.spec.clue;
  const clueAt = (side) => { // where the clue plaque is along this wall as seen, if it is on this wall
    if (!clue || clue.side !== mapDir(o.rot, side)) return undefined;
    const [u, v] = viewTile(o, ...exitTile(room.spec, clue.side, clue.at));
    return side === 'N' ? u : v;
  };
  const walls = [
    { plane: { fixed: 'v', at: 0 }, len: W, exit: at('N'), base: exitBase('N'), deco: decoFor(style, mapDir(o.rot, 'N')), clue: clueAt('N') },
    { plane: { fixed: 'u', at: 0 }, len: H, exit: at('W'), base: exitBase('W'), deco: decoFor(style, mapDir(o.rot, 'W')), clue: clueAt('W') },
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
    for (let i = 1; i < w.len - 1; i++) if ((w.exit === undefined || Math.abs(i - w.exit) > 1) && (w.clue === undefined || Math.abs(i - w.clue) > 1)) free.push(i);
    if (free.length) {
      const i = free.reduce((best, c) => (Math.abs(c - w.len * 0.4) < Math.abs(best - w.len * 0.4) ? c : best));
      drawDeco(o, w.plane, i + 0.5, w.deco, t);
    } else console.warn(`room "${room.spec.id}": no free stretch of wall for its ${w.deco}`);
    if (w.exit !== undefined) drawArch(o, w.plane, w.exit, w.base, false);
    if (w.clue !== undefined) drawClue(o, w.plane, w.clue + 0.5, clue.mark);
  }
  line(Pv(o, 0, 0, 0), Pv(o, 0, 0, WALL_H));
  // the tops of the walls, to show how thick they are, and their two cut ends
  const capN = [Pv(o, 0, 0, WALL_H), Pv(o, W, 0, WALL_H), Pv(o, W, -k, WALL_H), Pv(o, -k, -k, WALL_H)];
  const capW = [Pv(o, 0, H, WALL_H), Pv(o, 0, 0, WALL_H), Pv(o, -k, -k, WALL_H), Pv(o, -k, H, WALL_H)];
  const endN = [Pv(o, W, 0, 0), Pv(o, W, 0, WALL_H), Pv(o, W, -k, WALL_H), Pv(o, W, -k, 0)];
  const endW = [Pv(o, 0, H, 0), Pv(o, 0, H, WALL_H), Pv(o, -k, H, WALL_H), Pv(o, -k, H, 0)];
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
  for (let v = 0; v <= o.VH; v++) for (let u = 0; u <= o.VW; u++) dot(...Pv(o, u, v));
  const a = Pv(o, 0, o.VH), b = Pv(o, o.VW, o.VH), c = Pv(o, o.VW, 0), S = 4;
  fill([a, b, c, down(c, S), down(b, S), down(a, S)]);
  fill([down(a, 1), down(b, 1), down(c, 1), down(c, S - 1), down(b, S - 1), down(a, S - 1)], DOTS);
  polyline([a, b, c]); polyline([down(a, S), down(b, S), down(c, S)]);
  line(a, down(a, S)); line(b, down(b, S)); line(c, down(c, S));
}

// The open pits, drawn as holes: black, with a white rim where the hole meets the floor. A narrow pit (one square
// across, with no 2x2 of pit in it anywhere) stays plain black. A wider one shows its far walls dropping away, as
// streaks running down into the dark.
function drawPits(o, room) {
  const pitAt = (a, b) => { const [px, py] = mapTile(o, a, b); return room.pit[py][px]; };
  const regions = pitRegions(room);
  const seen = [];
  for (const region of regions) {
    const wide = region.some(([x, y]) => [[x + 1, y], [x, y + 1], [x + 1, y + 1]].every(([a, b]) => inBounds(room, a, b) && room.pit[b][a]));
    for (const [x, y] of region) { const [u, v] = viewTile(o, x, y); seen.push({ u, v, z: room.h[y][x] * LV, wide }); }
  }
  if (!seen.length) return;
  seen.sort((a, b) => a.u + a.v - b.u - b.v);
  g.save(); clipToPits(o, room);
  for (const { u, v, z } of seen) fill([Pv(o, u, v, z), Pv(o, u + 1, v, z), Pv(o, u + 1, v + 1, z), Pv(o, u, v + 1, z)]);
  // each far edge of a wide hole (one with floor beyond it) hangs a wall down into the pit; nearer walls are drawn later
  for (const { u, v, z, wide } of seen) {
    if (!wide) continue;
    const T = Pv(o, u, v, z), R = Pv(o, u + 1, v, z), L = Pv(o, u, v + 1, z);
    if (u === 0 || !pitAt(u - 1, v)) pitWall(L, T, u + v);
    if (v === 0 || !pitAt(u, v - 1)) pitWall(T, R, u + v);
  }
  g.restore();
  for (const { u, v, z } of seen) { // the rim: wherever the hole meets the floor
    const T = Pv(o, u, v, z), R = Pv(o, u + 1, v, z), B = Pv(o, u + 1, v + 1, z), L = Pv(o, u, v + 1, z);
    if (v === 0 || !pitAt(u, v - 1)) line(T, R);
    if (u === 0 || !pitAt(u - 1, v)) line(L, T);
    if (u + 1 >= o.VW || !pitAt(u + 1, v)) line(R, B);
    if (v + 1 >= o.VH || !pitAt(u, v + 1)) line(B, L);
  }
}
// The open pits grouped into holes: squares of pit that touch side by side belong to the same hole.
function pitRegions(room) {
  const done = room.pit.map((r) => r.map(() => false)), regions = [];
  for (let y = 0; y < room.H; y++) for (let x = 0; x < room.W; x++) {
    if (!room.pit[y][x] || done[y][x]) continue;
    const region = [], todo = [[x, y]]; done[y][x] = true;
    while (todo.length) {
      const [a, b] = todo.pop(); region.push([a, b]);
      for (const [c, d] of [[a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]]) {
        if (inBounds(room, c, d) && room.pit[d][c] && !done[d][c]) { done[d][c] = true; todo.push([c, d]); }
      }
    }
    regions.push(region);
  }
  return regions;
}
// One far wall of a wide pit, hanging from the rim edge a-b: black, with streaks of differing length running down it.
function pitWall(a, b, k) {
  fill([a, b, down(b, 40), down(a, 40)]);
  for (const t of [0.2, 0.5, 0.8]) { const p = lerp(a, b, t), n = 8 + ((k * 7 + t * 10) % 3) * 6; line(down(p, 2), down(p, n)); }
  line(down(a, 2), down(b, 2));
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
  for (let i = 0; i < PARTS.length; i++) if (i < fitted) px(cx, 26 + i * 2, true);
  for (let y = 46; y < 48; y++) for (let x = -3; x <= 3; x++) px(cx + x, y, Math.abs(x) === 3 || y === 47);
  if (flame) for (let y = 48; y < 50; y++) for (let x = -2; x <= 2; x++) if ((x + y + flame) % 2 === 0) px(cx + x, y, true);
  return c;
}

// ---- scenery on the solid squares ----
function ring(cx, cy, rx, ry, n = 14) { const pts = []; for (let i = 0; i < n; i++) { const a = i * Math.PI * 2 / n; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return pts; }
function cylinder(cx, base, rx, ry, h, hoops = []) {
  const top = ring(cx, base - h, rx, ry), bottom = ring(cx, base, rx, ry);
  const front = bottom.filter((p) => p[1] >= base - 0.01);
  fill([[cx - rx, base - h], ...front.slice().reverse().map((p) => p), [cx + rx, base - h]]);
  fill([[cx - rx, base - h], [cx + rx, base - h], [cx + rx, base], [cx - rx, base]]);
  fill(top); edges(top);
  line([cx - rx, base - h], [cx - rx, base]); line([cx + rx, base - h], [cx + rx, base]);
  polyline([[cx + rx, base], ...ring(cx, base, rx, ry, 14).filter((p, i) => i <= 7), [cx - rx, base]]);
  for (const v of hoops) polyline(ring(cx, base - v, rx, ry, 14).filter((p, i) => i <= 7));
  return top;
}
const coilTops = []; // where this frame's Tesla coils end, for the sparks between them

function drawProp(o, kind, x, y, t) {
  const [cx, base] = P(o, x + 0.5, y + 0.5, 0);
  if (kind === 'stone') box(o, x, y, x + 1, y + 1, 0, BLOCK_H, { left: bricks(5), right: bricks(5) });
  else if (kind === 'barrel') { cylinder(cx, base - 1, 7, 3.5, 13, [4, 9]); dot(cx, base - 14); }
  else if (kind === 'computer') {
    box(o, x + 0.1, y + 0.1, x + 0.9, y + 0.9, 0, 22, {
      left: (tl, tr, br, bl) => {
        for (const u of [0.3, 0.7]) {
          const c = lerp(tl, tr, u), r = ring(c[0], c[1] + 6, 2.6, 2.6, 10);
          edges(r);
          const a = t * 5 * (u < 0.5 ? 1 : -1);
          line([c[0], c[1] + 6], [c[0] + Math.cos(a) * 2.4, c[1] + 6 + Math.sin(a) * 2.4]);
        }
        const a = lerp(tl, tr, 0.15), b = lerp(tl, tr, 0.85);
        line(down(a, 13), down(b, 13)); line(down(a, 16), down(b, 16));
      },
      right: (tl, tr, br, bl) => {
        for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
          const on = Math.sin((i * 3 + j * 7 + x * 5 + y * 11) * 12.9898 + Math.floor(t * 3) * 78.233) > 0;
          if (on) { const p = lerp(tl, tr, 0.25 + i * 0.25); dot(p[0], p[1] + 4 + j * 3); }
        }
      },
    });
  } else if (kind === 'coil') {
    cylinder(cx, base - 1, 6, 3, 4);
    cylinder(cx, base - 5, 2, 1, 15, [3, 6, 9, 12]);
    const ball = ring(cx, base - 22, 3.5, 3.5, 12);
    fill(ball); edges(ball);
    coilTops.push([cx, base - 22]);
  } else if (kind === 'still') {
    box(o, x + 0.05, y + 0.05, x + 0.95, y + 0.95, 0, 7, { left: panelled, right: panelled });
    const [tx, ty] = P(o, x + 0.5, y + 0.5, 7);
    const flask = ring(tx - 4, ty - 4, 3.5, 3.5, 12); fill(flask); edges(flask);
    line([tx - 4, ty - 7.5], [tx - 4, ty - 12]);                // its neck
    polyline([[tx - 4, ty - 12], [tx - 1, ty - 14], [tx + 3, ty - 12], [tx + 5, ty - 9], [tx + 5, ty - 6]]); // the tube
    const small = ring(tx + 5, ty - 3, 2.5, 2.5, 10); fill(small); edges(small);
    const b = (t * 6 + x) % 3;
    dot(tx - 5, ty - 3 - b); dot(tx - 3, ty - 2 - ((b + 1.5) % 3));  // bubbles
  } else throw new Error(`drawProp: unknown scenery "${kind}"`);
}

// Sparks between Tesla coils that stand near each other in the same room.
function drawCoilSparks(t) {
  for (let i = 0; i < coilTops.length; i++) for (let j = i + 1; j < coilTops.length; j++) {
    const a = coilTops[i], b = coilTops[j];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 70 || (Math.floor(t * 9) + i + j) % 4 === 0) continue;
    const pts = [a];
    for (let k = 1; k < 6; k++) { const p = lerp(a, b, k / 6); pts.push([p[0], p[1] + Math.sin(t * 40 + k * 2.3 + i) * 3]); }
    pts.push(b);
    polyline(pts);
  }
}

// ---- the moving blocks ----
// The open pits as one clipping shape, so the part of a block below the floor shows only through the holes.
function clipToPits(o, room) { pitOpenings(o, room); g.clip(); }
function pitOpenings(o, room) {
  g.beginPath();
  for (let y = 0; y < room.H; y++) for (let x = 0; x < room.W; x++) {
    if (!room.pit[y][x]) continue;
    const [u, v] = viewTile(o, x, y), z = room.h[y][x] * LV, c = [Pv(o, u, v, z), Pv(o, u + 1, v, z), Pv(o, u + 1, v + 1, z), Pv(o, u, v + 1, z)];
    g.moveTo(c[0][0], c[0][1]); for (const p of c.slice(1)) g.lineTo(p[0], p[1]); g.closePath();
  }
}
// A block from `bottom` to `top` (levels). Over a pit, the part below the floor is drawn as if down inside the hole:
// the block is drawn whole, but clipped to the pit openings plus everything above its own floor-level outline, so it
// never spills over the floor in front and shows no seam where it passes through the floor.
function slab(o, room, x0, y0, x1, y1, bottom, top, skin) {
  const tx = Math.floor((x0 + x1) / 2), ty = Math.floor((y0 + y1) / 2);
  const floor = inBounds(room, tx, ty) && room.pit[ty][tx] ? room.h[ty][tx] : -SOLID;
  if (bottom >= floor) { box(o, x0, y0, x1, y1, bottom * LV, (top - bottom) * LV, skin); return; }
  const [u0, v0, u1, v1] = viewBox(o, x0, y0, x1, y1), z = floor * LV;
  const L = Pv(o, u0, v1, z), B = Pv(o, u1, v1, z), R = Pv(o, u1, v0, z);
  g.save();
  pitOpenings(o, room);
  g.moveTo(L[0], L[1]); g.lineTo(L[0], -50); g.lineTo(R[0], -50); g.lineTo(R[0], R[1]); g.lineTo(B[0], B[1]); g.closePath(); // wound the same way as the openings
  g.clip();
  box(o, x0, y0, x1, y1, bottom * LV, (top - bottom) * LV, skin);
  g.restore();
}

function drawMover(room, o, m, t) {
  const b = m.box;
  if (!b) return;
  const i = 0.03;
  if (m.type === 'lift') { // a single block riding up and down; below the floor it shows only through a pit's opening
    const bottom = room.pit[m.y][m.x] ? b.top - 1 : Math.max(b.top - 1, room.h[m.y][m.x]); // on solid floor it rises out of a slot
    slab(o, room, b.x0 + i, b.y0 + i, b.x1 - i, b.y1 - i, bottom, b.top, { top: (T, R, B, L) => { line(lerp(T, R, 0.5), lerp(L, B, 0.5)); line(lerp(T, L, 0.5), lerp(R, B, 0.5)); } });
  } else if (m.type === 'slider') {
    slab(o, room, b.x0 + i, b.y0 + i, b.x1 - i, b.y1 - i, b.bottom, b.top, { left: panelled, right: panelled, top: (T, R, B, L) => edges([lerp(T, B, 0.25), lerp(R, L, 0.25), lerp(B, T, 0.25), lerp(L, R, 0.25)]) });
  } else if (m.type === 'crumble') {
    const shake = m.falling > 0 ? (Math.floor(t * 30) % 2 ? 0.04 : -0.04) : 0;
    slab(o, room, b.x0 + i + shake, b.y0 + i, b.x1 - i + shake, b.y1 - i, b.top - 1, b.top, {
      left: dotted, right: dotted,
      top: (T, R, B, L) => { polyline([lerp(T, L, 0.3), lerp(T, B, 0.45), lerp(R, B, 0.6)]); line(lerp(T, B, 0.45), lerp(L, B, 0.7)); },
    });
  } else if (m.type === 'ride') {
    const shake = m.falling > 0 ? (Math.floor(t * 30) % 2 ? 0.04 : -0.04) : 0;
    slab(o, room, b.x0 + i + shake, b.y0 + i, b.x1 - i + shake, b.y1 - i, b.top - 1, b.top, {
      left: panelled, right: panelled, top: (T, R, B, L) => edges([lerp(T, B, 0.12), lerp(R, L, 0.12), lerp(B, T, 0.12), lerp(L, R, 0.12)]),
    });
    if (m.mark) { // flat to the screen, like the marks on plates
      const [cx, cy] = P(o, (b.x0 + b.x1) / 2 + shake, (b.y0 + b.y1) / 2, b.top * LV);
      strokeMark(m.mark, (a, v) => [cx - 5 + a * 10, cy - 3.5 + v * 7]);
    }
  } else if (m.type === 'crusher') {
    const top = P(o, m.x + 0.5, m.y + 0.5, b.top * LV), rod = P(o, m.x + 0.5, m.y + 0.5, (room.h[m.y][m.x] + CRUSH_HEIGHT + 4) * LV);
    line(top, rod); line([top[0] + 1, top[1]], [rod[0] + 1, rod[1]]);
    box(o, b.x0 + i, b.y0 + i, b.x1 - i, b.y1 - i, b.bottom * LV, LV, { left: bricks(5), right: bricks(5) });
    const [u0, v0, u1, v1] = viewBox(o, b.x0 + i, b.y0 + i, b.x1 - i, b.y1 - i);
    const L = Pv(o, u0, v1, b.bottom * LV), Bt = Pv(o, u1, v1, b.bottom * LV), R = Pv(o, u1, v0, b.bottom * LV);
    for (const [a, c] of [[L, Bt], [Bt, R]]) for (let k = 0; k < 4; k++) polyline([lerp(a, c, k / 4), down(lerp(a, c, (k + 0.5) / 4), 3), lerp(a, c, (k + 1) / 4)]); // teeth
  } else throw new Error(`drawMover: unknown moving block "${m.type}"`);
}

// ---- what is on each square ----
function drawTile(game, room, o, x, y, t) {
  const h = room.h[y][x], z = h * LV;
  if (room.wall[y][x]) { drawProp(o, propAt(room, x, y), x, y, t); return; }
  if (room.pit[y][x]) return; // drawn before everything else (renderRoom)
  if (h > 0) box(o, x, y, x + 1, y + 1, 0, z, { left: dotted, right: dotted });
  if (room.initial.pit[y][x]) { const d = inset(o, x, y, z, 0.15); edges(d); line(d[0], d[2]); line(d[1], d[3]); } // a filled pit: the crate's lid
  const plate = room.plateAt[y][x];
  if (plate) {
    const pressed = room.crates[y][x] > 0 || (game.hero.x === x && game.hero.y === y);
    const mark = (room.spec.marks || {})[`${x},${y}`], top = pressed ? z : z + 2;
    edges(inset(o, x, y, z, 0.2));
    if (mark) { // drawn flat to the screen rather than in perspective, so the symbols stay easy to tell apart
      const d = inset(o, x, y, top, 0.08), [cx, cy] = P(o, x + 0.5, y + 0.5, top);
      fill(d); edges(d);
      strokeMark(mark, (a, b) => [cx - 5 + a * 10, cy - 3.5 + b * 7]);
    }
    else if (!pressed) { const d = inset(o, x, y, z + 2, 0.3); fill(d, CHECK); edges(d); } else edges(inset(o, x, y, z, 0.3));
  }
  const pad = room.padAt[y][x];
  if (pad) { // a transmitter pad: a disc with its mark, and a shimmer rising off it
    const disc = (r, zz) => { const pts = []; for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; pts.push(P(o, x + 0.5 + Math.cos(a) * r, y + 0.5 + Math.sin(a) * r, zz)); } return pts; };
    const outer = disc(0.46, z + 1);
    fill(outer);
    for (let k = 0; k < 16; k += 2) line(outer[k], outer[k + 1]); // a dashed rim, so a ring mark does not look like a second rim
    const [cx, cy] = P(o, x + 0.5, y + 0.5, z + 1);
    strokeMark(pad, (a, b) => [cx - 6 + a * 12, cy - 4 + b * 8]);
    strokeMark(pad, (a, b) => [cx - 5.5 + a * 11, cy - 3.5 + b * 7]); // drawn twice, so it reads as bold
    for (let k = 0; k < 4; k++) { const rise = (t * 14 + k * 4) % 16; dot(cx - 8 + k * 5.3, cy - 6 - rise); }
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
  const seen = viewDir(o.rot, r.dir);
  blit(SPR.robot[Math.floor(t * 4) % 2], cx, cy + 2, seen === 'W' || seen === 'S');
}

function drawHero(game, o) {
  const f = app.free, room = cur(game);
  if (app.dying > 0 || (game.invuln > 0 && Math.floor(app.tick / 4) % 2)) return;
  const ground = standLevel(game, room, f.x, f.y, f.z);
  if (f.air && ground > NOTHING && f.z - ground > 0.2) { const [gx, gy] = P(o, f.x, f.y, ground * LV); dot(gx - 2, gy); dot(gx, gy + 1); dot(gx + 2, gy); }
  const [sx, sy] = P(o, f.x, f.y, f.z * LV);
  const face = viewDir(o.rot, game.hero.face), back = face === 'N' || face === 'W', flip = face === 'S' || face === 'W';
  const frame = f.air ? 1 : Math.floor(f.walk / 0.275) % 2;
  blit((back ? SPR.heroBack : SPR.heroFront)[frame], sx, sy + 2, flip);
}

function renderRoom(game, t) {
  const room = cur(game), o = originFor(room), style = ROOM_STYLE[room.spec.id];
  coilTops.length = 0;
  drawBackWalls(o, room, style, t);
  drawFloor(o, room);
  // the open pits first: nothing in the room is lower, so nothing should ever be painted over by one
  drawPits(o, room);
  // painter's order: the far squares first, by how far down the screen they are as seen
  const depth = (x, y) => { const [u, v] = viewTile(o, x, y); return u + v; };
  const items = [];
  for (let y = 0; y < room.H; y++) for (let x = 0; x < room.W; x++) items.push({ d: depth(x, y), k: 0, fn: () => drawTile(game, room, o, x, y, t) });
  for (const r of room.robots) items.push({ d: Math.max(depth(r.x, r.y), depth(r.px, r.py)), k: 1, fn: () => drawRobot(room, o, r, t) });
  for (const m of room.movers) {
    if (!m.box) continue;
    const [, , u1, v1] = viewBox(o, m.box.x0, m.box.y0, m.box.x1, m.box.y1);
    items.push({ d: Math.floor(u1 - 0.01) + Math.floor(v1 - 0.01), k: 1, fn: () => drawMover(room, o, m, t) });
  }
  const f = app.free, under = tilesUnder(f.x, f.y, RADIUS);
  items.push({ d: Math.max(...under.map(([x, y]) => depth(x, y))), k: 2, fn: () => drawHero(game, o) });
  items.sort((a, b) => a.d - b.d || a.k - b.k);
  for (const it of items) it.fn();
  const exits = viewExits(o, room);
  for (const side of ['S', 'E']) if (exits[side]) drawArch(o, EXIT_PLANES[side](o), exits[side].at, exits[side].base, true);
  drawCoilSparks(t);
  drawCompass(o);
  for (const s of app.sparks) { dot(s.x, s.y); if (s.life > 12) { dot(s.x - 1, s.y); dot(s.x + 1, s.y); dot(s.x, s.y - 1); dot(s.x, s.y + 1); } }
}

// A compass in the top left corner, laid flat on the floor like the room, with north marked, so you can tell which
// way the room has been turned.
function drawCompass(o) {
  const cx = 24, cy = 36, rx = 14, ry = 7;
  const tip = (dir, k) => { const [du, dv] = DIRS[viewDir(o.rot, dir)]; return [cx + (du - dv) * rx * k, cy + (du + dv) * ry * k]; };
  const disc = ring(cx, cy, rx, ry, 20);
  fill(disc); edges(disc);
  for (const d of TURN) dot(...tip(d, 0.72));
  const n = tip('N', 0.72), s = tip('S', 0.72);
  const side = [-(n[1] - cy) * 0.5, (n[0] - cx) * 0.12]; // across the needle
  fill([n, [cx + side[0], cy + side[1]], [cx - side[0], cy - side[1]]], '#fff');
  edges([s, [cx + side[0], cy + side[1]], [cx - side[0], cy - side[1]]]);
  const [lx, ly] = tip('N', 1.45);
  text('N', Math.round(lx - 2), Math.round(ly - 3));
  paint(0, 2, 6, 5, 'white');
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
  for (let i = 0; i < game.lives; i++) blit(SPR.life, 71 + i * 10, 173); // lives left, above the clock
  const clock = formatTime(game.time);
  text(clock, Math.round(91 - (clock.length * 10 - 1) / 2), 175, 2, 10);
  text('CARRY', 137, 165);
  for (let i = 0; i < CARRY_MAX; i++) {
    const x = 124 + i * 20;
    edges([[x, 174], [x + 15, 174], [x + 15, 188], [x, 188]]);
    const id = game.hero.carry[i];
    if (id) blit(SPR.part[id], x + 8, 187);
  }
  PARTS.forEach((p, i) => { // the rocket's parts, fitted or still missing, in rows of five
    const x = 196 + (i % 5) * 12, y = 176 + Math.floor(i / 5) * 12;
    if (game.delivered.includes(p.id)) blit(SPR.part[p.id], x, y);
    else { dot(x - 2, y - 6); dot(x + 2, y - 6); dot(x - 2, y - 2); dot(x + 2, y - 2); }
  });
}

function drawCaption(game) {
  paint(0, 0, 32, 2, 'white');
  const c = app.caption;
  if (app.goto !== null) centred(`GO TO ROOM ${app.goto}${app.tick % 30 < 15 ? '-' : ' '} (1-${ROOMS.length}, ENTER)`, 4);
  else if (c) {
    const page = Math.min(c.pages.length - 1, Math.floor(c.age / 170));
    c.pages[page].forEach((l, i) => centred(l, 1 + i * 8));
  } else centred(`${PLAYTEST ? `${game.hero.room + 1} ` : ''}${ROOMS[game.hero.room].name.toUpperCase()}`, 4);
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
  if (typeof TRIAL_ROOMS !== 'undefined') centred('THE ROTATION TRIAL', 34);
  if (PLAYTEST) centred('PLAY-TEST MODE. G GOES TO A ROOM', 34);
  for (const [sx, sy] of [[20, 50], [70, 60], [200, 48], [236, 80], [40, 110], [222, 120], [110, 44], [160, 64]]) dot(sx, sy);
  const flame = Math.floor(t * 10) % 2 + 1;
  picture(rocketCanvas(PARTS.length, flame), 92, 52, 40, 80);
  blit(SPR.heroFront[Math.floor(t * 3) % 2], 160, 131);
  blit(SPR.robot[Math.floor(t * 4) % 2], 186, 131, true);
  blit(SPR.saucer, Math.round(128 + Math.sin(t * 0.7) * 90), 52 + Math.round(Math.sin(t * 2) * 3));
  line([20, 134], [236, 134]);
  centred("THE PROFESSOR'S ROCKET IS MISSING NINE", 138);
  centred('PARTS. FIND THEM BEFORE THE SAUCERS', 146);
  centred('LAND. ROBOTS, STEAM AND PITS ARE DEADLY.', 154);
  centred('PRESS SPACE TO START', 169);
  centred('ARROWS WALK SPACE JUMP Z X TURN P PAUSE', 182);
  paint(0, 22, 32, 2, 'green');
  if (app.best) { paint(24, 0, 8, 1, 'green'); text(`BEST ${formatTime(app.best)}`, 194, 1); }
}

function drawEnd(game, kind, t) {
  attr.fill(ZX.white);
  if (kind === 'win') {
    paint(0, 1, 32, 3, 'yellow'); paint(0, 4, 32, 15, 'white'); paint(0, 19, 32, 5, 'cyan');
    centred('LIFT OFF!', 10, 2);
    const rise = Math.min(140, Math.max(0, app.endTimer - 30) * 1.2);
    picture(rocketCanvas(PARTS.length, Math.floor(t * 12) % 2 + 1), 103, 60 - rise, 50, 100);
    line([40, 161], [216, 161]);
    centred(`TIME TO SPARE ${formatTime(game.time)}`, 166);
    if (app.newBest) centred('A NEW BEST TIME!', 175);
  } else {
    paint(0, 1, 32, 3, 'red'); paint(0, 4, 32, 15, 'green'); paint(0, 19, 32, 5, 'white');
    centred(game.loseCause === 'lives' ? 'OUT OF LIVES' : 'THE SAUCERS HAVE LANDED', 10, game.loseCause === 'lives' ? 2 : 1);
    for (let i = 0; i < 3; i++) blit(SPR.saucer, 70 + i * 58, 60 + Math.round(Math.sin(t * 2 + i) * 4) + i * 6);
    line([30, 140], [226, 140]);
    for (const x of [100, 140]) edges([[x, 120], [x + 16, 120], [x + 16, 140], [x, 140]]);
    centred(`PARTS FITTED ${game.delivered.length} OF ${PARTS.length}`, 166);
  }
  if (app.endTimer > 40 && app.tick % 50 < 32) centred('PRESS SPACE TO PLAY AGAIN', 182);
}

// ---- the game ----
const BEST_KEY = 'atomic-castle-best';
const DEATH_LINES = {
  robot: ['Remember, children: robots are only dangerous when they are in the same room as you.', 'Tin robots do not say sorry. It is not in their programming.', 'The Professor would have called that "a learning experience".'],
  vent: ['Steam: nature\'s way of saying "not now".', 'Lightly poached. Please try again.', 'The vents are on a timer. You, it seems, are not.'],
  crusher: ['Flattened. The Professor will want that back in its original shape.', 'Timing is everything. Yours was not.'],
  squashed: ['Squashed between a moving block and a wall. Neither of them apologised.'],
  zap: ['Wrong plate. The Professor did put up a sign. It is just not on this side of the room.', 'Zapped. The right plate is signposted, for those who look around.'],
  pit: ['The pit was deeper than it looked. Pits usually are.', 'Down you go. Mind the gap next time.', 'Gravity: still working, the Professor will be pleased to hear.'],
};
function loadBest() { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (err) { console.warn('Could not read the saved best time:', err); return 0; } }
function saveBest(s) { try { localStorage.setItem(BEST_KEY, String(Math.round(s))); } catch (err) { console.warn('Could not save the best time:', err); } }

const app = {
  mode: 'title', tick: 0, game: null, held: [], lastBump: -1, caption: null, rocketWait: 0, goto: null,
  free: { x: 0, y: 0, z: 0, vz: 0, air: false, jumpDir: null, jumpQueued: 0, pushT: 0, walk: 0 }, // the hero, moving freely (film-move.js)
  slide: null, reveal: SH, border: 'black', borderTimer: 0, loading: 0, sparks: [], pendingEnd: null, endTimer: 0,
  best: loadBest(), newBest: false, fatal: null,
  rot: 0, // quarter turns of the camera around the room (Z and X)
};

function startGame() {
  app.game = createGame();
  initMovers(app.game);
  app.game.lives = LIVES; app.game.deaths = 0; app.dying = 0; app.game.playtest = PLAYTEST; app.goto = null;
  app.mode = 'play'; app.held = []; app.free.jumpQueued = 0; app.rocketWait = 0; app.slide = null; app.sparks = [];
  app.pendingEnd = null; app.newBest = false; app.caption = null; app.loading = 50; app.rot = 0;
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
      case 'teleport': {
        Sound.play('beam'); if (!e.robot) flashBorder('white', 4);
        const r = cur(game);
        sparkle(game, e.fromX, e.fromY, surface(r, e.fromX, e.fromY) * LV + 8, 8); sparkle(game, e.toX, e.toY, surface(r, e.toX, e.toY) * LV + 8, 12);
        break;
      }
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
      case 'die': {
        Sound.play('hit'); flashBorder('red', 30);
        const f = app.free, lines = DEATH_LINES[e.cause];
        if (!lines) throw new Error(`processEvents: no lines for dying by "${e.cause}"`);
        sparkle(game, f.x - 0.5, f.y - 0.5, f.z * LV + 12, 16);
        const said = lines[(game.deaths - 1) % lines.length];
        say(e.lives <= 0 ? said : `${said} ${e.lives === 1 ? 'Last life!' : `${e.lives} lives left.`}`, 300);
        break;
      }
      case 'hit': Sound.play('hit'); flashBorder('red', 30); snapHero(game); say(HIT_LINES[game.hits % HIT_LINES.length] + ` (-${HIT_PENALTY}s)`, 260); break;
      case 'room':
        Sound.play('room'); snapHero(game); app.slide = null; app.sparks = []; app.reveal = PLAY_TOP;
        if (e.first) say(ROOMS[e.room].caption, 340); else app.caption = null;
        break;
      case 'reset': Sound.play('reset'); resetMovers(cur(game)); snapHero(game); app.reveal = PLAY_TOP; say(`Room reset. That cost ${RESET_PENALTY} seconds and a little dignity.`); break;
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

// The arrows walk up, right, down and left as seen, whichever way the room is turned; app.held keeps map directions.
const KEY_DIRS = { ArrowUp: 'N', ArrowRight: 'E', ArrowDown: 'S', ArrowLeft: 'W', w: 'N', d: 'E', s: 'S', a: 'W', W: 'N', D: 'E', S: 'S', A: 'W' };
// Turn the camera a quarter turn (X clockwise, Z anticlockwise). Held arrows keep meaning the same way on screen.
function turnRoom(by) {
  const before = app.rot;
  app.rot = (app.rot + by + 4) % 4;
  app.held = app.held.map((d) => mapDir(app.rot, viewDir(before, d)));
  app.reveal = PLAY_TOP;
  Sound.play('room');
}
function onKeyDown(key) {
  Sound.init();
  if (app.mode === 'title') { if (key === ' ' || key === 'Enter' || key === '0') { Sound.play('choose'); startGame(); return true; } }
  else if (app.mode === 'play') {
    if (app.goto !== null) return gotoKey(key);
    if (PLAYTEST && (key === 'g' || key === 'G')) { app.goto = ''; app.held = []; return true; }
    if (key === 'z' || key === 'Z') { turnRoom(-1); return true; }
    if (key === 'x' || key === 'X') { turnRoom(1); return true; }
    if (key in KEY_DIRS) { const d = mapDir(app.rot, KEY_DIRS[key]); app.held = app.held.filter((x) => x !== d); app.held.push(d); return true; }
    if (key === ' ') { app.free.jumpQueued = 0.25; return true; }
    if (key === 'r' || key === 'R') { resetRoom(app.game); processEvents(app.game); return true; }
    if (key === 'p' || key === 'P' || key === 'Escape') { app.mode = 'paused'; app.held = []; return true; }
  } else if (app.mode === 'paused') {
    if (['p', 'P', 'Escape', 'Enter', ' '].includes(key)) { app.mode = 'play'; return true; }
    if (key === 'r' || key === 'R') { app.mode = 'play'; resetRoom(app.game); processEvents(app.game); return true; }
    if (key === 'q' || key === 'Q') { Sound.play('choose'); app.mode = 'title'; app.game = null; return true; }
  } else if (app.mode === 'win' || app.mode === 'lose') {
    if (app.endTimer > 40 && (key === ' ' || key === 'Enter')) { Sound.play('choose'); app.mode = 'title'; return true; }
  }
  return false;
}
// Typing a room number in play-test mode.
function gotoKey(key) {
  if (key === 'Escape') app.goto = null;
  else if (key === 'Backspace') app.goto = app.goto.slice(0, -1);
  else if (/^[0-9]$/.test(key) && app.goto.length < 2) app.goto += key;
  else if (key === 'Enter') {
    const n = Number(app.goto);
    app.goto = null;
    if (n >= 1 && n <= ROOMS.length) jumpToRoom(n - 1);
    else say(`There is no room ${n}. The rooms go from 1 to ${ROOMS.length}.`);
  }
  return true;
}
// Put the hero in a room at its first doorway (or the start square), as if they had just walked in.
function jumpToRoom(idx) {
  const game = app.game, spec = ROOMS[idx], room = game.rooms[idx];
  const [x, y] = room.start ? [room.start.x, room.start.y] : exitTile(spec, Object.keys(spec.exits)[0], Object.values(spec.exits)[0]);
  const first = !game.seen.has(idx);
  game.hero.room = idx; game.hero.x = x; game.hero.y = y; game.hero.entry = { x, y }; game.hero.air = 0;
  game.seen.add(idx); app.dying = 0; app.rot = 0;
  emit(game, { t: 'room', room: idx, first });
  processEvents(game);
}
function onKeyUp(key) { if (key in KEY_DIRS) { const d = mapDir(app.rot, KEY_DIRS[key]); app.held = app.held.filter((x) => x !== d); } }

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
  if (app.dying > 0) { app.dying -= dt; if (app.dying <= 0 && !game.over) respawn(game); }
  updateMovers(game, dt); processEvents(game);
  if (app.dying <= 0 && !game.over) { stepFree(game, dt); processEvents(game); }
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
      g.fillStyle = '#000'; g.fillRect(40, 60, 176, 64);
      edges([[40, 60], [215, 60], [215, 123], [40, 123]]);
      centred('PAUSED', 66);
      text('P  CARRY ON', 56, 80);
      text(`R  RESET THIS ROOM (-${RESET_PENALTY}S)`, 56, 90);
      text('Q  QUIT TO THE TITLE', 56, 100);
      text('Z X  TURN THE ROOM', 56, 112);
      paint(5, 7, 23, 9, 'white');
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

// Screenshot hook: index.html?still&scene=title|room|win|lose&room=vault&x=..&y=..&ticks=..
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
    app.rot = Number(params.get('rot') || 0);
    if (scene === 'paused') app.mode = 'paused';
    if (scene === 'win' || scene === 'lose') { app.mode = scene; app.endTimer = Number(params.get('t') || 80); if (scene === 'win') game.delivered = PARTS.map((p) => p.id); }
  }
  for (let i = 0; i < Number(params.get('ticks') || 30); i++) stepGame(STEP_MS / 1000);
  // keys=E40,J,N20,Kg: hold a direction for some frames, J to jump (then wait 40 frames), or K and a key name to press it
  for (const tok of (params.get('keys') || '').split(',').filter(Boolean)) {
    if (tok === 'J') { app.held = []; onKeyDown(' '); for (let i = 0; i < 40; i++) stepGame(STEP_MS / 1000); continue; }
    if (tok[0] === 'K') { onKeyDown(tok.slice(1)); stepGame(STEP_MS / 1000); continue; }
    const d = tok[0], n = Number(tok.slice(1));
    if (!'NESW'.includes(d) || !(n > 0)) throw new Error(`keys: cannot read "${tok}"`);
    app.held = [d];
    for (let i = 0; i < n; i++) stepGame(STEP_MS / 1000);
  }
  app.held = [];
  const log = document.createElement('pre'); log.id = 'log'; log.style.display = 'none'; document.body.appendChild(log);
  log.textContent = ['hero', JSON.stringify(app.free), 'square', app.game && app.game.hero.x, app.game && app.game.hero.y, 'room', app.game && cur(app.game).spec.id, 'time', app.game && app.game.time.toFixed(1), 'carry', app.game && app.game.hero.carry.join('/'), 'lives', app.game && app.game.lives].join(' ');
  render();
} else if (!params.has('norun')) requestAnimationFrame(frame); // the tests load the page without starting the loop
