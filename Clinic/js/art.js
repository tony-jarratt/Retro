'use strict';

// Painted pixel art for St Ghoulsby's, built in code. Characters are rounded forms shaded from the top left
// through four-tone colour ramps (highlight, light, shade, deep shade) with a soft coloured edge, as in
// Cocoa Cascade. Rooms are painted once into their own canvases. One art pixel is 2 x 2 screen pixels.

const artCache = {};

const toRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mixRgb = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const mixHex = (a, b, t) => toHex(mixRgb(toRgb(a), toRgb(b), t));

function colourRamp(base) {
  const c = toRgb(base);
  return [toHex(mixRgb(c, [255, 255, 255], 0.45)), base, toHex(mixRgb(c, [30, 10, 50], 0.35)), toHex(mixRgb(c, [12, 0, 28], 0.62))];
}

const PAL = {
  white: ['#ffffff', '#ffffff', '#e4e8f0', '#c0c8d8'],
  dark: colourRamp('#2a2438'),
  black: ['#4a4458', '#26222e', '#16121c', '#0a080e'],
  red: colourRamp('#c02838'),
  gold: colourRamp('#e2b030'),
  wood: colourRamp('#6a3a24'),
  darkWood: colourRamp('#3e2216'),
  vampSkin: ['#f4fbf6', '#d4e2da', '#a4b8b0', '#728a86'],
  burnt: ['#ffd0a8', '#ff8a5a', '#d8503a', '#a02a2a'],
  bandage: ['#fff8e4', '#eadcb4', '#c2ac7c', '#8c7652'],
  docSkin: ['#fff0dc', '#ffd2a8', '#e0a07c', '#b0705a'],
  coat: ['#ffffff', '#eef2f6', '#c8d0dc', '#98a2b4'],
  glove: colourRamp('#58b040'),
  hair: ['#ffffff', '#f0f0f4', '#c4c8d4', '#9aa0b0'],
  ghost: ['#ffffff', '#e8f4ff', '#b8d4f0', '#88a8d0'],
  medusa: colourRamp('#9ad88a'),
  snake: colourRamp('#3a9a3a'),
  dress: colourRamp('#8a3ab0'),
  grey: colourRamp('#6a6478'),
};

function artCanvas(w, h, paint, edge = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const px = (col, i, j, pw = 1, ph = 1) => { x.fillStyle = col; x.fillRect(Math.round(i), Math.round(j), pw, ph); };
  // a box lit from the top left
  const slab = (i, j, pw, ph, pal) => {
    px(pal[1], i, j, pw, ph);
    if (pw > 2) { px(pal[0], i, j, 1, ph); px(pal[2], i + pw - 1, j, 1, ph); }
    if (ph > 1) { px(pal[0], i, j, pw, 1); px(pal[2], i, j + ph - 1, pw, 1); }
    if (pw > 2 && ph > 1) px(pal[3], i + pw - 1, j + ph - 1, 1, 1);
  };
  // a round form lit from the top left; maxY clips it
  const ball = (cx, cy, rx, ry, pal, maxY = 1e9) => {
    for (let j = Math.floor(cy - ry); j <= Math.ceil(cy + ry); j++) for (let i = Math.floor(cx - rx); i <= Math.ceil(cx + rx); i++) {
      if (j > maxY) continue;
      const nx = (i + 0.5 - cx) / rx, ny = (j + 0.5 - cy) / ry, r2 = nx * nx + ny * ny;
      if (r2 > 1) continue;
      const l = -nx * 0.55 - ny * 0.75;
      let k = l > 0.5 ? 0 : l > -0.05 ? 1 : l > -0.55 ? 2 : 3;
      if (r2 > 0.75 && k < 3 && l < 0.2) k++;
      px(pal[k], i, j);
    }
  };
  // a shape given as a half-width for each row (centred on cx), shaded left to right
  const rows = (cx, top, halfWidths, pal) => {
    halfWidths.forEach((hw, n) => {
      if (hw <= 0) return;
      const j = top + n, l = Math.round(cx - hw), r = Math.round(cx + hw);
      for (let i = l; i < r; i++) {
        const t = (i - l) / Math.max(1, r - l);
        px(pal[t < 0.18 ? 0 : t < 0.62 ? 1 : t < 0.9 ? 2 : 3], i, j);
      }
    });
  };
  paint({ px, slab, ball, rows, ctx: x });
  if (edge) softEdge(c);
  return c;
}

// A dark edge in the colour of what it surrounds, not black.
function softEdge(c) {
  const x = c.getContext('2d'), w = c.width, h = c.height;
  const data = x.getImageData(0, 0, w, h).data;
  const alpha = (i, j) => (i < 0 || j < 0 || i >= w || j >= h ? 0 : data[(j * w + i) * 4 + 3]);
  const out = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (alpha(i, j) > 0) continue;
    let r = 0, g = 0, b = 0, n = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (alpha(i + dx, j + dy) > 0) { const k = ((j + dy) * w + i + dx) * 4; r += data[k]; g += data[k + 1]; b += data[k + 2]; n++; }
    }
    if (n) out.push([i, j, toHex([r / n * 0.3, g / n * 0.26, b / n * 0.36])]);
  }
  for (const [i, j, col] of out) { x.fillStyle = col; x.fillRect(i, j, 1, 1); }
}

function cached(key, make) {
  if (!artCache[key]) artCache[key] = make();
  return artCache[key];
}

// Every character canvas is CHAR_W x CHAR_H with the feet on the bottom row, centred, facing right.
const CHAR_W = 28, CHAR_H = 36;
const legStep = (f) => [[-1, 1], [0, 0], [1, -1], [0, 0]][f];

// ---- the patients ----

// kind: 'vampire' | 'mummy'. sick: still has the ailment. f: walk frame 0-3 (only 0 when standing).
function patientSprite(kind, sick, f, blink) {
  return cached(`p-${kind}-${sick}-${f}-${blink}`, () => (kind === 'vampire' ? vampire(sick, f, blink) : mummy(sick, f, blink)));
}

function vampire(sick, f, blink) {
  const cx = 14;
  const skin = sick ? PAL.burnt : PAL.vampSkin;
  return artCanvas(CHAR_W, CHAR_H, ({ px, slab, ball, rows }) => {
    const [dl, dr] = legStep(f);
    // the cape behind everything, flaring out towards the hem, with its high collar
    rows(cx, 11, [5, 6, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10, 10, 11, 11, 11, 11, 11, 10, 9], PAL.black);
    rows(cx - 1, 25, [6, 7, 7, 8, 8, 7], PAL.red);                         // the red lining showing at the hem
    rows(cx, 5, [0, 7, 8, 8, 8, 7], PAL.red);                               // collar, lined in red
    rows(cx, 5, [0, 0, 6.5, 6.5, 6.5], PAL.black);
    // legs and polished shoes
    slab(cx - 4 + dl, 28, 3, 5, PAL.dark); slab(cx + 1 + dr, 28, 3, 5, PAL.dark);
    slab(cx - 5 + dl, 32, 4, 2, PAL.black); px('#8a84a0', cx - 4 + dl, 32); slab(cx + 1 + dr, 32, 4, 2, PAL.black); px('#8a84a0', cx + 2 + dr, 32);
    // body: a black tailcoat over a white shirt front with a red medallion
    ball(cx, 21, 5.5, 8, PAL.dark);
    rows(cx, 15, [2.5, 2.5, 2, 2, 1.5, 1, 0.5], PAL.white);
    ball(cx, 17, 1.4, 1.4, PAL.gold); px(PAL.red[1], cx, 17);
    // arms and pale hands with long nails
    slab(cx - 7, 16, 3, 9, PAL.dark); slab(cx + 4, 16, 3, 9, PAL.dark);
    ball(cx - 5.5, 26, 1.6, 1.6, skin); ball(cx + 5.5, 26, 1.6, 1.6, skin);
    // head with pointed ears
    px(skin[2], cx - 7, 6, 1, 2); px(skin[1], cx - 6, 7, 1, 3); px(skin[1], cx + 6, 7, 1, 3); px(skin[2], cx + 7, 6, 1, 2);
    ball(cx, 9, 6, 6.5, skin);
    // slicked black hair with a widow's peak
    ball(cx, 6, 6.5, 4.5, PAL.black, 5);
    px(PAL.black[1], cx - 1, 5, 3, 2); px(PAL.black[1], cx, 7, 1, 1);
    px(PAL.black[2], cx - 6, 5, 1, 4); px(PAL.black[2], cx + 6, 5, 1, 4);
    // red eyes, looking the way they face
    if (blink) { px('#3a1a20', cx - 3, 9, 2, 1); px('#3a1a20', cx + 2, 9, 2, 1); }
    else { px('#fff4f4', cx - 3, 8, 2, 2); px('#fff4f4', cx + 2, 8, 2, 2); px('#d01830', cx - 2, 8, 1, 2); px('#d01830', cx + 3, 8, 1, 2); }
    px(skin[3], cx - 4, 7, 3, 1); px(skin[3], cx + 2, 7, 3, 1);           // stern brows
    // mouth and fangs
    px('#6a1a2a', cx - 2, 12, 5, 1); px('#ffffff', cx - 2, 13); px('#ffffff', cx + 2, 13);
    if (sick) {
      // peeling sunburn: blisters and a red nose
      px('#ffe8d0', cx - 4, 10); px('#ffe8d0', cx + 3, 11); px('#ffe8d0', cx - 1, 4 + 2);
      ball(cx + 0.5, 10.5, 1.2, 1, colourRamp('#ff3a3a'));
    }
  });
}

function mummy(sick, f, blink) {
  const cx = 14, B = PAL.bandage;
  return artCanvas(CHAR_W, CHAR_H, ({ px, slab, ball, ctx }) => {
    const [dl, dr] = legStep(f);
    slab(cx - 5 + dl, 25, 4, 9, B); slab(cx + 1 + dr, 25, 4, 9, B);       // legs
    ball(cx, 19, 6, 8, B);                                                  // body
    // arms held straight out in front, as mummies do
    slab(cx + 2, 14, 11, 3, B); slab(cx + 1, 17, 11, 2, B);
    ball(cx + 13, 15.5, 1.6, 2, B);
    slab(cx - 7, 15, 3, 8, B);
    ball(cx, 8, 5.8, 6.5, B);                                               // head
    // the wrapping: darker diagonal bands every few rows, painted only onto the mummy itself
    ctx.globalCompositeOperation = 'source-atop';
    for (let j = 3; j < 34; j += 3) for (let i = 0; i < CHAR_W; i++) {
      if ((i + j) % 7 === 0) continue;
      const k = ((j + Math.floor(i / 5)) % 2);
      if (k) px('rgba(110,80,40,0.28)', i, j);
    }
    ctx.globalCompositeOperation = 'source-over';
    // the eye slit, with two glowing eyes
    px('#2a1c10', cx - 4, 7, 9, 3);
    if (!blink) { px('#ffe060', cx - 2, 8); px('#ffe060', cx + 2, 8); px('#fff8c0', cx - 2, 7 + 1); }
    if (sick) {
      // coming undone: gaps where the wrapping has slipped, showing the dark inside
      px('#1a120a', cx - 3, 18, 4, 2); px('#3a2a18', cx - 2, 20, 2, 1);
      px('#1a120a', cx - 4 + dl, 29, 2, 2); px('#1a120a', cx + 3, 4, 2, 2);
    }
  });
}

// ---- the staff ----

function staffSprite(kind, f, blink, working) {
  return cached(`s-${kind}-${f}-${blink}-${working}`, () => {
    if (kind === 'doctor') return doctor(f, blink, working);
    if (kind === 'nurse') return nurse(f, blink, working);
    return medusa(f, blink, working);
  });
}

function doctor(f, blink, working) {
  const cx = 14;
  return artCanvas(CHAR_W, CHAR_H, ({ px, slab, ball, rows }) => {
    const [dl, dr] = legStep(f);
    slab(cx - 4 + dl, 27, 3, 6, PAL.grey); slab(cx + 1 + dr, 27, 3, 6, PAL.grey);
    slab(cx - 5 + dl, 32, 4, 2, PAL.darkWood); slab(cx + 1 + dr, 32, 4, 2, PAL.darkWood);
    rows(cx, 14, [5, 5.5, 6, 6, 6, 6.5, 6.5, 7, 7, 7, 7, 7.5, 7.5, 7.5, 7], PAL.coat);  // lab coat
    px(PAL.coat[3], cx, 15, 1, 13);
    ball(cx - 3, 22, 1.5, 1, ['#80c8ff', '#4a98e0', '#2a6ab0', '#1a4a80']);              // a pen in the pocket
    // arms: one up waving a test tube when working
    slab(cx - 8, 16, 3, 9, PAL.coat); ball(cx - 6.5, 25.5, 1.8, 1.8, PAL.glove);
    if (working && f % 2) {
      slab(cx + 5, 9, 3, 8, PAL.coat); ball(cx + 6.5, 8, 1.8, 1.8, PAL.glove);
      slab(cx + 6, 2, 2, 5, ['#e8fff0', '#b0ffc8', '#60e090', '#30a060']);
    } else { slab(cx + 5, 16, 3, 9, PAL.coat); ball(cx + 6.5, 25.5, 1.8, 1.8, PAL.glove); }
    ball(cx, 9, 5.5, 6, PAL.docSkin);
    // wild white hair sticking out everywhere
    for (const [hx, hy, r] of [[-5, 4, 3], [5, 4, 3], [-7, 8, 2.5], [7, 8, 2.5], [-2, 2, 3], [2.5, 2, 3], [0, 1, 2.5]]) ball(cx + hx, hy + 1, r, r, PAL.hair);
    // goggles pushed up on the forehead
    ball(cx - 2.5, 5, 2, 1.8, PAL.gold); ball(cx + 2.5, 5, 2, 1.8, PAL.gold);
    px('#a0e8ff', cx - 3, 4, 2, 2); px('#a0e8ff', cx + 2, 4, 2, 2);
    if (blink) { px('#2a1a14', cx - 3, 9, 2, 1); px('#2a1a14', cx + 2, 9, 2, 1); }
    else { px('#ffffff', cx - 3, 8, 2, 2); px('#ffffff', cx + 2, 8, 2, 2); px('#1a1a2a', cx - 2, 8, 1, 2); px('#1a1a2a', cx + 3, 8, 1, 2); }
    // a manic grin
    px('#6a1a1a', cx - 3, 12, 7, 2); px('#ffffff', cx - 2, 12, 5, 1);
    px('#ff9a9a', cx - 5, 11); px('#ff9a9a', cx + 5, 11);
  });
}

function nurse(f, blink, working) {
  const cx = 14, G = PAL.ghost;
  return artCanvas(CHAR_W, CHAR_H, ({ px, ball, rows }) => {
    // a sheet that tapers into a wispy tail, rippling as it floats
    const wave = [0, 1, 0, -1][f];
    rows(cx, 10, [6, 7, 7.5, 8, 8, 8, 8.5, 8.5, 8.5, 8.5, 8, 8, 7.5, 7, 6.5, 6], G);
    for (let k = 0; k < 4; k++) ball(cx - 6 + k * 4 + wave * (k % 2 ? 1 : -1), 26.5, 2.2, 2.4 + (k + f) % 2, G);
    ball(cx, 10, 7, 7, G);
    // little sheet arms, one holding a thermometer when working
    ball(cx - 8, 17 + wave, 2, 3, G);
    ball(cx + 8, (working ? 13 : 17) - wave, 2, 3, G);
    if (working) { px('#e0e8f0', cx + 9, 7, 1, 6); px('#e02030', cx + 9, 12, 1, 2); }
    // a nurse's cap with a red cross
    ball(cx, 4, 5, 2.5, PAL.white, 5); px('#ffffff', cx - 5, 5, 10, 1);
    px('#e02030', cx, 2, 1, 3); px('#e02030', cx - 1, 3, 3, 1);
    // big dark eyes and rosy cheeks
    if (blink) { px('#2a3a5a', cx - 4, 10, 3, 1); px('#2a3a5a', cx + 2, 10, 3, 1); }
    else { ball(cx - 2.5, 10, 1.6, 2.2, ['#3a4a6a', '#1a2440', '#101830', '#080c18']); ball(cx + 3.5, 10, 1.6, 2.2, ['#3a4a6a', '#1a2440', '#101830', '#080c18']); px('#ffffff', cx - 3, 9); px('#ffffff', cx + 3, 9); }
    px('#ffb0c0', cx - 5, 12, 2, 1); px('#ffb0c0', cx + 5, 12, 2, 1);
    px('#5a6a8a', cx, 13, 2, 1);
  });
}

function medusa(f, blink, working) {
  const cx = 14, S = PAL.medusa;
  return artCanvas(CHAR_W, CHAR_H, ({ px, slab, ball, rows }) => {
    rows(cx, 15, [5, 5.5, 6, 6.5, 6.5, 7, 7, 7.5, 7.5, 8, 8, 8, 8.5, 8.5, 8.5, 8.5, 8, 8, 7], PAL.dress);
    slab(cx - 2, 15, 5, 2, PAL.gold);                                     // a gold necklace
    slab(cx - 8, 16, 3, 8, S); slab(cx + 5, 16, 3, 8, S);
    ball(cx - 6.5, 24, 1.6, 1.6, S); ball(cx + 6.5, 24, 1.6, 1.6, S);
    ball(cx, 10, 5.5, 6, S);
    // hair of snakes, each with a tiny head and eyes; they sway with the frame
    const sway = [0, 1, 0, -1][f];
    const snakes = [[-7, 6], [-5, 2], [-1, 0], [3, 1], [6, 4], [8, 8], [-8, 10]];
    snakes.forEach(([sx, sy], k) => {
      const s = (k % 2 ? sway : -sway);
      ball(cx + sx * 0.7, sy + 4, 1.4, 2.4, PAL.snake);
      ball(cx + sx + s, sy + 1, 1.8, 1.4, PAL.snake);
      px('#ff3030', cx + sx + s, sy + 1);
    });
    // cat-eye glasses and lipstick
    if (blink) { px('#1a3010', cx - 4, 10, 3, 1); px('#1a3010', cx + 2, 10, 3, 1); }
    else { px('#fff8c0', cx - 4, 9, 3, 2); px('#fff8c0', cx + 2, 9, 3, 2); px('#c03020', cx - 3, 9, 1, 2); px('#c03020', cx + 3, 9, 1, 2); }
    px('#e0b030', cx - 5, 8, 4, 1); px('#e0b030', cx + 1, 8, 5, 1); px('#e0b030', cx - 6, 7); px('#e0b030', cx + 6, 7);
    px('#d02040', cx - 1, 13, 3, 1);
    if (working) px('#d02040', cx, 14);
  });
}

// ---- rooms ----
// Each room is ROOM_W x ROOM_H art pixels: the back wall from the ceiling down to the floorboards.
// roomFront() is the furniture that stands in front of the staff member (a desk), drawn over them.

const ROOM_W = 72, ROOM_H = 58;

function wall(px, base, pattern) {
  const r = colourRamp(base);
  px(r[1], 0, 0, ROOM_W, ROOM_H);
  for (let y = 4; y < 38; y += 6) for (let x = (y / 6) % 2 ? 3 : 0; x < ROOM_W; x += 6) {
    if (pattern === 'damask') { px(r[0], x + 2, y, 1, 1); px(r[0], x + 1, y + 1, 3, 1); px(r[0], x + 2, y + 2, 1, 1); }
    else if (pattern === 'stripe') px(r[2], x, y - 4, 2, 6);
    else if (pattern === 'tile') { px(r[0], x, y - 4, 6, 1); px(r[0], x, y - 4, 1, 6); }
    else if (pattern === 'glyph') { if ((x * 7 + y) % 5 < 2) { px(r[3], x + 1, y, 2, 1); px(r[3], x + 2, y - 2, 1, 2); px(r[3], x + 1, y - 3, 1, 1); } }
  }
  px('#00000040', 0, 0, ROOM_W, 3);                            // shadow under the ceiling
  px(PAL.wood[2], 0, 37, ROOM_W, 1); px(PAL.wood[0], 0, 38, ROOM_W, 1);   // dado rail
  px(PAL.darkWood[1], 0, 39, ROOM_W, 15);                      // wainscot panels
  for (let x = 3; x < ROOM_W; x += 12) { px(PAL.darkWood[2], x, 41, 9, 1); px(PAL.darkWood[2], x, 41, 1, 10); px(PAL.darkWood[0], x + 9, 41, 1, 10); px(PAL.darkWood[0], x, 51, 10, 1); }
  floorboards(px);
}

function floorboards(px) {
  px('#5a3420', 0, 54, ROOM_W, 4);
  px('#7a4a2c', 0, 54, ROOM_W, 1);
  for (let x = 5; x < ROOM_W; x += 11) px('#3a2014', x, 55, 1, 3);
}

function pictureFrame(px, x, y, w, h, inner) {
  px(PAL.gold[2], x, y, w, h); px(PAL.gold[0], x, y, w, 1); px(PAL.gold[0], x, y, 1, h);
  px(inner, x + 2, y + 2, w - 4, h - 4);
}

function roomArt(type) {
  return cached(`room-${type}`, () => artCanvas(ROOM_W, ROOM_H, (a) => PAINT_ROOM[type](a), false));
}

function roomFront(type) {
  return cached(`front-${type}`, () => artCanvas(ROOM_W, ROOM_H, (a) => (PAINT_FRONT[type] || (() => {}))(a), false));
}

// a desk standing from x to x + w with its top at y
function desk(px, slab, x, y, w) {
  slab(x, y, w, 3, PAL.wood);
  slab(x + 1, y + 3, w - 2, 54 - y - 3, PAL.darkWood);
  px(PAL.gold[1], x + 1, y + 3, w - 2, 1);
  for (let i = x + 4; i < x + w - 4; i += 7) { px(PAL.darkWood[2], i, y + 6, 5, 7); px(PAL.darkWood[0], i, y + 6, 5, 1); }
}

const PAINT_ROOM = {
  reception({ px, ball }) {
    wall(px, '#5e1a2c', 'damask');
    // the founder's portrait: Dr Ghoulsby himself, with a monocle
    pictureFrame(px, 4, 8, 16, 20, '#2a2030');
    ball(12, 18, 4, 5, ['#d8e0d0', '#b0c0b0', '#809080', '#506050']);
    px('#1a1a1a', 8, 12, 8, 3); px('#1a1a1a', 11, 9, 2, 3);
    px('#101010', 10, 17); ball(14, 17, 1.4, 1.4, PAL.gold); px('#101010', 14, 17);
    px('#3a2a30', 7, 24, 10, 2);
    // a clock with no hands (time stands still here)
    ball(62, 14, 5, 5, PAL.gold); ball(62, 14, 3.8, 3.8, ['#fffbe8', '#f0e8d0', '#d0c4a0', '#a89870']);
    px('#3a2a20', 62, 11, 1, 1); px('#3a2a20', 62, 17, 1, 1); px('#3a2a20', 59, 14, 1, 1); px('#3a2a20', 65, 14, 1, 1);
    // a potted carnivorous plant
    px(PAL.wood[1], 62, 46, 7, 8); px(PAL.wood[0], 62, 46, 7, 1);
    ball(65, 41, 4, 4, colourRamp('#3a9a3a')); px('#c02020', 63, 41, 5, 1); px('#ffffff', 64, 40); px('#ffffff', 66, 40);
  },
  consult({ px, slab, ball }) {
    wall(px, '#1e4232', 'stripe');
    // bookshelf of dubious medical texts
    slab(2, 6, 16, 48, PAL.darkWood);
    const books = ['#a03030', '#3050a0', '#c0a030', '#307040', '#7a3a8a', '#c06020'];
    for (let shelf = 0; shelf < 4; shelf++) {
      const y = 9 + shelf * 11;
      px(PAL.wood[0], 3, y + 9, 14, 1);
      for (let b = 0; b < 5; b++) { const h = 6 + ((b * 3 + shelf) % 3); px(books[(b + shelf) % 6], 4 + b * 2.6, y + 9 - h, 2, h); }
    }
    ball(10, 15, 2.5, 2.5, ['#ffd0d8', '#f0a0b0', '#c07080', '#904050'], 16);     // a brain in a jar
    px('#a0d0ff60', 7, 11, 7, 6);
    // the eye chart, in letters nobody can read
    px('#f4ecd8', 52, 6, 14, 20); px('#c0b498', 52, 25, 14, 1);
    px('#1a1a1a', 57, 8, 4, 4); px('#1a1a1a', 55, 14, 3, 2); px('#1a1a1a', 60, 14, 3, 2);
    for (let i = 0; i < 4; i++) px('#1a1a1a', 54 + i * 3, 19, 2, 1);
    for (let i = 0; i < 5; i++) px('#1a1a1a', 54 + i * 2.4, 22, 1, 1);
    // skeleton on a stand
    ball(66, 33, 2.5, 2.5, PAL.white); px('#1a1a1a', 65, 33); px('#1a1a1a', 67, 33);
    for (let r = 0; r < 4; r++) px('#e8e8e0', 63, 37 + r * 2, 7, 1);
    px('#e8e8e0', 66, 36, 1, 12); px('#808080', 66, 48, 1, 6); px('#808080', 63, 53, 7, 1);
  },
  coffin({ px, slab, ball }) {
    wall(px, '#2a5478', 'tile');
    // icicles hanging from the ceiling
    for (let x = 2; x < ROOM_W; x += 5) { const l = 2 + (x * 7) % 5; for (let k = 0; k < l; k++) px(k < l - 1 ? '#d8f0ff' : '#ffffff', x + (k > l / 2 ? 0.5 : 0), 3 + k, Math.max(1, 2 - Math.floor(k / 2)), 1); }
    // the freezer unit, humming
    slab(2, 18, 14, 36, ['#f4f8ff', '#d8e0ec', '#a8b4c8', '#7a88a0']);
    px('#7a88a0', 4, 30, 10, 1); slab(12, 22, 2, 6, PAL.grey);
    px('#40c0ff', 5, 21, 3, 2); px('#ff4040', 9, 21, 1, 2);
    // a thermometer showing very cold
    px('#ffffff', 22, 8, 3, 18); px('#2a80ff', 23, 20, 1, 5); ball(23.5, 26, 2, 2, colourRamp('#2a80ff'));
    // the coffin, stood upright and lined with purple satin
    for (let y = 12; y <= 54; y++) {
      const w = y < 18 ? 4 + (y - 12) * (8 / 6) : y > 50 ? 12 - (y - 50) * (4 / 4) * 2 : 12;
      const l = Math.round(54 - w), r = Math.round(54 + w);
      px(PAL.darkWood[1], l, y, r - l, 1); px(PAL.darkWood[0], l, y, 1, 1); px(PAL.darkWood[3], r - 1, y, 1, 1);
      if (y > 14 && y < 52) px(y % 3 ? '#6a3a8a' : '#7a4a9a', l + 2, y, r - l - 4, 1);
    }
    // frost creeping up the coffin's edges
    for (let y = 14; y < 54; y += 3) { px('#e8f8ff', 43 + (y % 2), y, 2, 1); px('#e8f8ff', 64 - (y % 2), y, 2, 1); }
    // a snowflake sign
    ball(32, 12, 5, 5, colourRamp('#3a8ad0'));
    px('#ffffff', 32, 8, 1, 9); px('#ffffff', 28, 12, 9, 1); px('#ffffff', 29, 9, 1, 1); px('#ffffff', 35, 15, 1, 1); px('#ffffff', 35, 9, 1, 1); px('#ffffff', 29, 15, 1, 1);
  },
  rewinder({ px, slab }) {
    wall(px, '#a07a40', 'glyph');
    // painted frieze of little walking pharaoh figures
    for (let x = 4; x < 40; x += 9) { px('#3a6aa0', x, 26, 2, 5); px('#c03020', x + 2, 27, 2, 3); px('#e0b030', x, 25, 3, 1); }
    // a sarcophagus leaning in the corner
    slab(3, 20, 11, 34, PAL.gold); px('#3a6aa0', 5, 24, 7, 3); px('#1a1a1a', 6, 25); px('#1a1a1a', 10, 25);
    for (let y = 30; y < 50; y += 3) px('#3a6aa0', 5, y, 7, 1);
    // the rewinding machine: a timber frame with a big spool (the spool itself is drawn spinning)
    slab(48, 4, 3, 50, PAL.wood); slab(68, 4, 3, 50, PAL.wood); slab(46, 2, 27, 3, PAL.wood);
    px(PAL.grey[1], 51, 14, 17, 1);
  },
  lounge({ px, slab, ball }) {
    wall(px, '#4a2a5a', 'stripe');
    // grandfather clock
    slab(3, 14, 9, 40, PAL.darkWood); ball(7.5, 20, 3, 3, ['#fffbe8', '#f0e8d0', '#d0c4a0', '#a89870']); px('#1a1a1a', 7, 18, 1, 3);
    px(PAL.gold[1], 7, 30, 1, 10); ball(7.5, 41, 1.6, 1.6, PAL.gold);
    // fireplace (the green flames are drawn flickering)
    slab(20, 28, 26, 26, colourRamp('#7a7488')); px('#14101a', 25, 36, 16, 18); slab(18, 26, 30, 3, colourRamp('#8a8498'));
    ball(25, 24, 1.5, 2, PAL.white); ball(41, 24, 1.5, 2, PAL.white); px('#ffd060', 25, 21, 1, 1); px('#ffd060', 41, 21, 1, 1);
    // a portrait of somebody's great aunt, whose eyes follow you
    pictureFrame(px, 25, 6, 16, 14, '#3a3a50');
    ball(33, 14, 3.5, 4, ['#d0d8f0', '#a8b0d0', '#7880a0', '#505070']); px('#ffffff', 31, 13); px('#ffffff', 34, 13);
    // a red velvet sofa
    slab(50, 36, 20, 8, PAL.red); slab(49, 42, 22, 8, PAL.red); slab(49, 38, 3, 12, PAL.red); slab(68, 38, 3, 12, PAL.red);
    px(PAL.darkWood[1], 51, 50, 2, 4); px(PAL.darkWood[1], 67, 50, 2, 4);
    // a bat-shaped cushion
    ball(59, 40, 3, 2, PAL.black); px(PAL.black[1], 55, 39, 2, 1); px(PAL.black[1], 62, 39, 2, 1);
  },
  empty({ px, ball }) {
    // an unused wing: bare stone, cobwebs, a dust sheet over something
    px('#3a3644', 0, 0, ROOM_W, ROOM_H);
    for (let y = 0; y < 54; y += 6) for (let x = (y / 6) % 2 ? -6 : 0; x < ROOM_W; x += 12) {
      px('#46424f', x + 1, y + 1, 10, 4); px('#524e5c', x + 1, y + 1, 10, 1); px('#2c2834', x + 1, y + 5, 11, 1);
    }
    // cobwebs in the top corners
    for (let k = 0; k < 9; k++) { px('#c0c0d0a0', k, 0, 1, 9 - k); }
    for (let k = 0; k < 7; k++) { px('#c0c0d080', ROOM_W - 1 - k, 0, 1, 7 - k); }
    px('#c0c0d0', 0, 4, 5, 1); px('#c0c0d0', 2, 0, 1, 6);
    // a dust sheet over a chair
    ball(30, 48, 9, 7, ['#e8e4dc', '#c8c4bc', '#a09c94', '#787470'], 54);
    px('#787470', 21, 53, 18, 1);
    // a spider on a thread
    px('#d0d0e0', 54, 0, 1, 18); ball(54.5, 19, 1.5, 1.5, PAL.black); px('#ff3030', 54, 19);
    floorboards(px);
    px('#00000060', 0, 0, ROOM_W, ROOM_H);
  },
};

const PAINT_FRONT = {
  reception({ px, slab, ball }) {
    desk(px, slab, 26, 42, 26);
    ball(48, 40, 2, 1.5, PAL.gold, 41); px(PAL.gold[0], 48, 38);                       // the bell
    px('#e8e0c0', 28, 40, 7, 2); px('#a03030', 29, 40, 5, 1);                            // the visitors' book
  },
  consult({ px, slab, ball }) {
    desk(px, slab, 22, 42, 32);
    ball(27, 38, 3, 3, PAL.white, 41); px('#1a1a1a', 25, 37, 2, 2); px('#1a1a1a', 28, 37, 2, 2); px('#1a1a1a', 26, 40, 3, 1);   // a skull
    // the crystal ball's stand (its glow is drawn by the screen)
    px(PAL.gold[1], 48, 40, 5, 2);
  },
};

// ---- small icons for the toolbar ----

function demolishIcon() {
  return cached('icon-demolish', () => artCanvas(24, 24, ({ px, slab, ball }) => {
    // a wrecking ball on a chain
    for (let k = 0; k < 7; k++) px(PAL.grey[k % 2 ? 2 : 0], 8 + k, 2 + k, 1, 1);
    ball(16, 14, 6, 6, PAL.black);
    slab(2, 18, 6, 4, colourRamp('#8a6a5a')); slab(4, 14, 4, 4, colourRamp('#7a5a4a'));
  }));
}

// ---- statues: a patient's own picture, turned to grey stone with a few cracks ----

function statueSprite(kind, sick) {
  return cached(`statue-${kind}-${sick}`, () => {
    const src = patientSprite(kind, sick, 0, false);
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
    const stone = ['#d8d4cc', '#aaa69e', '#8a867e', '#66625c', '#45423e'];
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const lum = (d[i] * 0.3 + d[i + 1] * 0.55 + d[i + 2] * 0.15) / 255;
      const speck = ((i * 2654435761) >>> 28) % 7 === 0 ? 1 : 0;            // a little grain in the stone
      const k = Math.max(0, Math.min(4, Math.floor((1 - lum) * 5) + speck));
      const [r, g, b] = toRgb(stone[k]);
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    // cracks
    x.fillStyle = '#3a3734';
    for (const [cx, cy, steps] of [[11, 14, 6], [17, 22, 5]]) {
      let i = cx;
      for (let j = 0; j < steps; j++) { x.fillRect(i, cy + j, 1, 1); i += j % 2 ? 1 : 0; }
    }
    return c;
  });
}
