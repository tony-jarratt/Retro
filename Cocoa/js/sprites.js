'use strict';

// Painted pixel-art characters, built in code. Every form is a rounded shape shaded from the top left
// through a four-tone colour ramp (highlight, light, shade, deep shade), with a soft coloured edge
// instead of a black outline. One art pixel is one grid cell on screen.

const spriteCache = {};

const toRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mixRgb = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// A four-tone ramp from one base colour.
function colourRamp(base) {
  const c = toRgb(base);
  return [toHex(mixRgb(c, [255, 255, 255], 0.5)), base, toHex(mixRgb(c, [30, 10, 50], 0.32)), toHex(mixRgb(c, [12, 0, 28], 0.6))];
}

const PAL = {
  skin: ['#fff0dc', '#ffd2a8', '#e8a47c', '#b8745a'],
  apron: ['#ffffff', '#f4f4f8', '#d2d6e2', '#a4acc0'],
  boot: colourRamp('#7a4a2a'),
  steel: colourRamp('#9aa4b4'),
  dark: colourRamp('#3a3a4a'),
  white: ['#ffffff', '#ffffff', '#e4e8f0', '#c0c8d8'],
  hat: colourRamp('#ffcc2e'),
  pants: colourRamp('#44558f'),
  cap: colourRamp('#3f8a68'),
  brass: colourRamp('#e2b020'),
};
const SHIRT = {
  heat: colourRamp('#e8503a'), solid: colourRamp('#3a8ae8'), deflect: colourRamp('#f08a2a'), pipe: colourRamp('#2fb8a8'),
};

function artCanvas(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const px = (col, i, j, pw = 1, ph = 1) => { x.fillStyle = col; x.fillRect(i, j, pw, ph); };
  // a box lit from the top left
  const slab = (i, j, pw, ph, pal) => {
    px(pal[1], i, j, pw, ph);
    if (pw > 2) { px(pal[0], i, j, 1, ph); px(pal[2], i + pw - 1, j, 1, ph); }
    if (ph > 1) { px(pal[0], i, j, pw, 1); px(pal[2], i, j + ph - 1, pw, 1); }
    if (pw > 2 && ph > 1) px(pal[3], i + pw - 1, j + ph - 1, 1, 1);
  };
  // a round form lit from the top left; maxY clips it (for a half dome)
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
  paint({ px, slab, ball, ctx: x });
  softEdge(c);
  return c;
}

// A dark edge in the colour of what it surrounds, not black.
function softEdge(c) {
  const x = c.getContext('2d'), w = c.width, h = c.height;
  const data = x.getImageData(0, 0, w, h).data;
  const at = (i, j) => (i < 0 || j < 0 || i >= w || j >= h ? null : data.subarray((j * w + i) * 4, (j * w + i) * 4 + 4));
  const out = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (at(i, j)[3] > 0) continue;
    let r = 0, g = 0, b = 0, n = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const p = at(i + dx, j + dy);
      if (p && p[3] > 0) { r += p[0]; g += p[1]; b += p[2]; n++; }
    }
    if (n) out.push([i, j, toHex([r / n * 0.32, g / n * 0.3, b / n * 0.34])]);
  }
  for (const [i, j, col] of out) { x.fillStyle = col; x.fillRect(i, j, 1, 1); }
}

// ---- the chocolatiers ----
// mood: 'idle' (planning), 'work' (running), 'cheer' (vat full), 'sad' (not enough), 'hold' (arms up, gripping a
// structure: the deflector's slide or the pipe's funnel). f is the animation frame 0-3.
function workerSprite(kind, mood, f, blink) {
  const key = `w-${kind}-${mood}-${f}-${blink}`;
  if (spriteCache[key]) return spriteCache[key];
  const shirt = SHIRT[kind], cx = 13, hold = mood === 'hold', up = mood === 'cheer' || hold;
  spriteCache[key] = artCanvas(30, 30, ({ px, slab, ball }) => {
    const step = mood === 'work' ? f : 0;
    const dl = [-1, 0, 1, 0][step], dr = [1, 0, -1, 0][step];
    // boots and legs
    slab(cx - 4, 24, 3, 2, PAL.pants); slab(cx + 1, 24, 3, 2, PAL.pants);
    slab(cx - 5 + dl, 26 - (step === 1 ? 1 : 0), 4, 3, PAL.boot); slab(cx + 1 + dr, 26 - (step === 3 ? 1 : 0), 4, 3, PAL.boot);
    // body and apron
    ball(cx, 21, 6, 4.2, shirt);
    slab(cx - 3, 18, 6, 6, PAL.apron);
    px(PAL.apron[3], cx, 19, 1, 4);
    // arms
    const armY = up ? 11 + (hold ? f % 2 : 0) : 17;
    const lx = up ? cx - 11 : cx - 9;
    slab(lx, armY, 3, 6, shirt); ball(lx + 1, armY - (up ? 1 : -6), 1.8, 1.8, PAL.skin);
    if (kind === 'pipe' || kind === 'heat' || kind === 'solid' || kind === 'deflect') {
      const swing = mood === 'work' && kind === 'deflect' ? [0, -2, -3, -1][f] : 0;
      const rx = up ? cx + 9 : cx + 6;
      slab(rx, armY + (up ? 0 : swing > -2 ? 0 : -1), 3, 6, shirt); ball(rx + 1, armY - (up ? 1 : -6), 1.8, 1.8, PAL.skin);
      if (!hold) prop(kind, mood, f, cx, px, slab, ball, up, swing);
    }
    // head
    ball(cx - 7.5, 14, 1.6, 2, PAL.skin); ball(cx + 7.5, 14, 1.6, 2, PAL.skin);                 // ears
    ball(cx, 13, 8, 7.5, PAL.skin);
    // eyes
    if (blink) { px('#3a2418', cx - 5, 13, 4, 1); px('#3a2418', cx + 1, 13, 4, 1); } else {
      slab(cx - 5, 11, 4, 5, PAL.white); slab(cx + 1, 11, 4, 5, PAL.white);
      const look = mood === 'sad' ? 1 : hold ? -1 : 0;
      slab(cx - 4, 12 + look, 2, 3, PAL.dark); slab(cx + 2, 12 + look, 2, 3, PAL.dark);
      px('#ffffff', cx - 4, 12 + look, 1, 1); px('#ffffff', cx + 2, 12 + look, 1, 1);
    }
    if (mood === 'sad') { px('#8a5a3a', cx - 5, 10, 3, 1); px('#8a5a3a', cx + 2, 10, 3, 1); }
    // cheeks and mouth
    px('#ff9aa8', cx - 7, 16, 2, 1); px('#ff9aa8', cx + 5, 16, 2, 1);
    if (mood === 'cheer') { slab(cx - 2, 17, 5, 3, ['#6a1818', '#8a2424', '#4a0c0c', '#2a0606']); px('#ff7a8a', cx - 1, 19, 3, 1); }
    else if (mood === 'sad') { px('#a8483a', cx - 2, 18, 5, 1); px('#a8483a', cx - 3, 19, 1, 1); px('#a8483a', cx + 3, 19, 1, 1); }
    else if (mood === 'work' || hold) { slab(cx - 1, 17, 3, 2, ['#6a1818', '#8a2424', '#4a0c0c', '#2a0606']); }
    else { px('#a8483a', cx - 2, 17, 1, 1); px('#a8483a', cx - 1, 18, 3, 1); px('#a8483a', cx + 2, 17, 1, 1); }
    // headgear
    if (kind === 'pipe') {
      slab(cx - 7, 17, 5, 1, colourRamp('#5a3a20')); slab(cx + 2, 17, 5, 1, colourRamp('#5a3a20'));      // moustache
      ball(cx, 6, 8.5, 4.5, PAL.cap, 8); slab(cx - 2, 8, 14, 2, PAL.cap); px('#f0e060', cx, 3, 1, 1);
    } else {
      ball(cx, 7, 8.5, 6, PAL.hat, 8); slab(cx - 9, 8, 18, 2, PAL.hat);
      ball(cx, 4, 2, 2, ['#ffffff', '#fffbd0', '#ffe880', '#e0b840']);
    }
    if (mood === 'sad' || (hold && f % 2)) { ball(cx + 9, 8, 1, 1.5, ['#e8f8ff', '#bfeaff', '#80c8f0', '#4a98c8']); }   // a sweat drop
  });
  return spriteCache[key];
}

function prop(kind, mood, f, cx, px, slab, ball, up, swing) {
  const hx = cx + (up ? 10 : 8);
  if (kind === 'heat') {                                                 // a blowtorch with a flickering flame
    slab(hx, up ? 5 : 15, 2, 6, PAL.steel); slab(hx - 1, up ? 3 : 13, 4, 2, PAL.dark);
    if (mood === 'work' || mood === 'cheer') {
      const top = up ? 0 : 6, sz = [3, 4, 3, 5][f];
      ball(hx + 1, top + 5, 1.8, sz, colourRamp('#ff6a20')); ball(hx + 1, top + 6, 1.1, sz * 0.7, ['#fffbe0', '#ffe060', '#ffb030', '#ff8020']);
    }
  } else if (kind === 'solid') {                                         // a frost sprayer
    slab(hx - 1, 15, 5, 5, colourRamp('#9edcff')); slab(hx + 4, 16, 3, 2, PAL.steel);
    if (mood === 'work' || mood === 'cheer') for (let k = 0; k < 3; k++) {
      const t = (f + k) % 4;
      ball(hx + 8 + t * 1.5, 16.5 + (k - 1) * 1.8, 1 + t * 0.35, 1 + t * 0.35, ['#ffffff', '#e8f8ff', '#bfeaff', '#90d0f0']);
    }
  } else if (kind === 'deflect') {                                       // a big spanner
    const y = (up ? 5 : 8) + swing;
    slab(hx, y + 3, 2, 10, PAL.steel); slab(hx - 1, y, 4, 4, PAL.steel); px('#2a2a3a', hx, y, 2, 2);
  } else if (kind === 'pipe') {                                          // a plunger
    slab(hx, up ? 3 : 10, 2, 9, colourRamp('#a0703a')); ball(hx + 1, up ? 2 : 9, 3, 2.2, colourRamp('#d8402a'), up ? 3 : 10);
  }
}

// ---- the guzzler ----
// stage 0..3 is how full its belly is; stage 3 is nearly bursting.
const GUZZLE_BASE = ['#58c038', '#8cc438', '#e0a030', '#ff5a30'];
function guzzleSprite(stage, mouth, blink) {
  const key = `g-${stage}-${mouth}-${blink}`;
  if (spriteCache[key]) return spriteCache[key];
  const pal = colourRamp(GUZZLE_BASE[stage]), rx = 9 + stage * 0.8, ry = 8 + stage * 0.8, cx = 14, cy = 24 - ry;
  spriteCache[key] = artCanvas(30, 30, ({ px, slab, ball }) => {
    ball(cx - 6, 25, 3.4, 2, pal); ball(cx + 6, 25, 3.4, 2, pal);                            // feet
    ball(cx - rx + 1, cy + 3, 2.5, 3, pal); ball(cx + rx - 1, cy + 3, 2.5, 3, pal);           // stubby arms
    ball(cx, cy, rx, ry, pal);
    ball(cx, cy + ry * 0.35, rx * 0.62, ry * 0.5, ['#f4ffd8', '#d8f4a0', '#a8d870', '#78a848']);   // pale belly
    ball(cx - rx * 0.4, cy - ry * 0.45, 2, 1.4, ['#ffffff', '#ffffff', '#e8f8e0', '#d0e8c0']);       // a glossy highlight
    // the mouth
    const open = mouth ? 4.2 : 2;
    ball(cx, cy - ry * 0.05, 5.5, open, ['#5a1a22', '#3a0c14', '#2a0610', '#1a0208']);
    px('#ffffff', cx - 4, cy - ry * 0.05 - open + 1, 2, 1); px('#ffffff', cx + 2, cy - ry * 0.05 - open + 1, 2, 1);   // teeth
    if (mouth) ball(cx, cy - ry * 0.05 + open * 0.55, 2.6, 1.3, ['#ff9aa8', '#ff7a8a', '#d85a6a', '#a8404c']);        // tongue
    // eyes
    const ey = cy - ry + 3;
    if (blink) { px('#2a1a14', cx - 6, ey + 2, 4, 1); px('#2a1a14', cx + 2, ey + 2, 4, 1); } else {
      ball(cx - 4, ey + 2, 2.6, 2.8, PAL.white); ball(cx + 4, ey + 2, 2.6, 2.8, PAL.white);
      slab(cx - 4, ey + 2, 2, 3, PAL.dark); slab(cx + 3, ey + 2, 2, 3, PAL.dark);
      px('#ffffff', cx - 4, ey + 2, 1, 1); px('#ffffff', cx + 3, ey + 2, 1, 1);
    }
    if (stage === 3) ball(cx + rx - 1, cy - ry + 2, 1, 1.6, ['#e8f8ff', '#bfeaff', '#80c8f0', '#4a98c8']);   // sweat
  });
  return spriteCache[key];
}

// ---- the pipe's outlet mascot ----
function outletSprite(frame) {
  const key = `o-${frame}`;
  if (spriteCache[key]) return spriteCache[key];
  spriteCache[key] = artCanvas(22, 18, ({ px, slab, ball }) => {
    slab(3, 1, 16, 3, PAL.brass);                                                           // flange
    ball(11, 10, 8, 6.5, colourRamp('#2fb8a8'), 15);
    ball(8, 9, 2.4, 2.8, PAL.white); ball(14, 9, 2.4, 2.8, PAL.white);
    slab(8, 9, 2, 3, PAL.dark); slab(14, 9, 2, 3, PAL.dark);
    px('#ffffff', 8, 9, 1, 1); px('#ffffff', 14, 9, 1, 1);
    px('#ff9aa8', 5, 13, 2, 1); px('#ff9aa8', 16, 13, 2, 1);
    if (frame) { slab(9, 13, 5, 3, ['#6a1818', '#8a2424', '#4a0c0c', '#2a0606']); ball(11, 16, 1.4, 1.6, colourRamp('#7a4a28')); }
    else slab(9, 14, 5, 1, ['#6a1818', '#8a2424', '#4a0c0c', '#2a0606']);
  });
  return spriteCache[key];
}

// The burst of a guzzler that has had enough.
function burstSprite(frame) {
  const key = `b-${frame}`;
  if (spriteCache[key]) return spriteCache[key];
  spriteCache[key] = artCanvas(40, 40, ({ px, ball }) => {
    const r = 6 + frame * 4;
    ball(20, 20, r, r, colourRamp('#ff8a20'));
    ball(20, 20, r * 0.62, r * 0.62, ['#fffbe0', '#ffe060', '#ffb030', '#ff8020']);
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4 + frame * 0.4;
      ball(20 + Math.cos(a) * (r + 3), 20 + Math.sin(a) * (r + 3), 2, 2, colourRamp('#ffc040'));
    }
  });
  return spriteCache[key];
}
