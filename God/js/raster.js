'use strict';

// A low-res screen where every pixel is one of the 16 palette colours, so the game can never show a colour the
// Amiga could not. Canvas shapes would be smoothed into in-between colours, so triangles are filled here by hand.
// Everything but present() is plain arithmetic, so it runs in the jsc checks too.

function makeScreen(w, h) { return { w, h, px: new Uint8Array(w * h) }; }
function clearScreen(s, colour) { s.px.fill(colour); }

function plot(s, x, y, colour) {
  x = Math.floor(x); y = Math.floor(y);
  if (x >= 0 && y >= 0 && x < s.w && y < s.h) s.px[y * s.w + x] = colour;
}
function fillRect(s, x, y, w, h, colour) {
  for (let j = Math.max(0, y); j < Math.min(s.h, y + h); j++) for (let i = Math.max(0, x); i < Math.min(s.w, x + w); i++) s.px[j * s.w + i] = colour;
}

// Fills the pixels whose centres are inside the triangle. Two triangles that share an edge cover each pixel once,
// so the land has no cracks.
function fillTri(s, a, b, c, colour) {
  const ys = [a, b, c].sort((p, q) => p[1] - q[1]), [p0, p1, p2] = ys;
  const y0 = Math.max(0, Math.ceil(p0[1] - 0.5)), y1 = Math.min(s.h - 1, Math.ceil(p2[1] - 0.5) - 1);
  const at = (p, q, y) => (q[1] === p[1] ? p[0] : p[0] + ((q[0] - p[0]) * (y - p[1])) / (q[1] - p[1]));
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5, xa = at(p0, p2, yc), xb = yc < p1[1] ? at(p0, p1, yc) : at(p1, p2, yc);
    const l = Math.max(0, Math.ceil(Math.min(xa, xb) - 0.5)), r = Math.min(s.w - 1, Math.ceil(Math.max(xa, xb) - 0.5) - 1);
    for (let x = l, i = y * s.w + l; x <= r; x++, i++) s.px[i] = colour;
  }
}
function fillQuad(s, a, b, c, d, colour) { fillTri(s, a, b, c, colour); fillTri(s, a, c, d, colour); }

function line(s, [x0, y0], [x1, y1], colour) {
  x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.floor(x1); y1 = Math.floor(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  for (let err = dx + dy; ;) {
    plot(s, x0, y0, colour);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// ---- sprites: rows of characters, each a palette key in `key` ('.' is see-through) ----
function makeSprite(rows, key) {
  const h = rows.length, w = rows[0].length, px = new Int8Array(w * h).fill(-1);
  rows.forEach((row, y) => {
    if (row.length !== w) throw new RulesError('sprite', `sprite row ${y} is ${row.length} wide, not ${w}: "${row}"`);
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      if (!(ch in key)) throw new RulesError('sprite', `sprite uses "${ch}", which is not in its key`);
      px[y * w + x] = key[ch];
    });
  });
  return { w, h, px };
}
function blit(s, sp, x, y, flip = false) {
  x = Math.round(x); y = Math.round(y);
  for (let j = 0; j < sp.h; j++) for (let i = 0; i < sp.w; i++) {
    const c = sp.px[j * sp.w + (flip ? sp.w - 1 - i : i)];
    if (c >= 0) plot(s, x + i, y + j, c);
  }
}

// ---- text, in the 5 x 7 font ----
const FONT = Object.fromEntries(Object.entries(GLYPHS).map(([ch, rows]) => [ch, rows.split('|')]));
const textWidth = (str) => str.length * 6 - 1;
function text(s, str, x, y, colour) {
  for (const raw of str.toUpperCase()) {
    const glyph = FONT[raw];
    if (!glyph) throw new RulesError('glyph', `the font has no "${raw}" (in "${str}")`);
    glyph.forEach((row, j) => { for (let i = 0; i < 5; i++) if (row[i] === '#') plot(s, x + i, y + j, colour); });
    x += 6;
  }
}
// Text with a black outline, so it reads over the land.
function outlined(s, str, x, y, colour) {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) text(s, str, x + dx, y + dy, C.black);
  text(s, str, x, y, colour);
}

// Copies the screen onto a canvas at 2x. The only part that needs a browser: makePresenter is called once at start.
const RGB = PALETTE.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
function makePresenter(s) {
  const canvas = document.createElement('canvas');
  canvas.width = s.w; canvas.height = s.h;
  const ctx = canvas.getContext('2d');
  return { canvas, ctx, img: ctx.createImageData(s.w, s.h) };
}
function present(s, buf, ctx) {
  const d = buf.img.data;
  for (let i = 0; i < s.px.length; i++) {
    const rgb = RGB[s.px[i]];
    d[i * 4] = rgb[0]; d[i * 4 + 1] = rgb[1]; d[i * 4 + 2] = rgb[2]; d[i * 4 + 3] = 255;
  }
  buf.ctx.putImageData(buf.img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buf.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
}
