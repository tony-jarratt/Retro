'use strict';

// All the artwork is drawn in code (no image files). Sprites face right and are drawn with their feet at (0, 0),
// roughly 40 pixels wide and up to 52 tall, so they fit a 56 pixel square.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const FONT = '"Trebuchet MS", Verdana, sans-serif';
const TITLE_FONT = 'Impact, Haettenschweiler, "Arial Narrow Bold", "Arial Black", sans-serif';

// ---- drawing helpers (all use the global ctx) ----
function circ(x, y, r, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function ell(x, y, rx, ry, fill, rot = 0) { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill(); }
function rrect(x, y, w, h, r, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }
function poly(pts, fill) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath(); ctx.fill();
}
function line(x1, y1, x2, y2, w, color) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function ring(x, y, r, w, color) { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
function star(x, y, r, fill, points = 5) {
  const pts = [];
  for (let k = 0; k < points * 2; k++) {
    const rad = k % 2 ? r * 0.45 : r, a = -Math.PI / 2 + (k * Math.PI) / points;
    pts.push(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  poly(pts, fill);
}
function text(str, x, y, size, color, align = 'left', font = FONT, shadow = false) {
  ctx.letterSpacing = font === TITLE_FONT ? '1.5px' : '0px';
  ctx.font = `bold ${size}px ${font}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(str, x + 2, y + 2); }
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}
// Shrink the text until it fits in maxWidth.
function fitText(str, x, y, maxWidth, size, color, align = 'left', font = FONT, shadow = false) {
  let s = size;
  ctx.letterSpacing = font === TITLE_FONT ? '1.5px' : '0px';
  ctx.font = `bold ${s}px ${font}`;
  while (s > 8 && ctx.measureText(str).width > maxWidth) { s -= 1; ctx.font = `bold ${s}px ${font}`; }
  text(str, x, y, s, color, align, font, shadow);
}
// Split text into lines no wider than maxWidth, using the font set on ctx.
function wrapLines(str, maxWidth) {
  const out = [];
  let cur = '';
  for (const word of str.split(' ')) {
    const trial = cur ? `${cur} ${word}` : word;
    if (cur && ctx.measureText(trial).width > maxWidth) { out.push(cur); cur = word; } else cur = trial;
  }
  out.push(cur);
  return out;
}
function mixHex(hex, other, t) { // blend a #rrggbb colour towards another by t (0 to 1)
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex), b = p(other);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const darker = (hex, t = 0.3) => mixHex(hex, '#000000', t);
const lighter = (hex, t = 0.35) => mixHex(hex, '#ffffff', t);

// ---- the creatures ----
const SKIN = '#f6c9a0';
const SPRITES = {
  guineaPig() {
    ell(-4, -9, 15, 9, '#c98b4d'); ell(-5, -11, 8, 5, '#f3e2c4');
    ell(9, -10, 9, 8, '#c98b4d'); ell(14, -8, 5, 4, '#f3e2c4');
    ell(6, -17, 3, 4, '#e8a9a0', -0.3);
    circ(11, -12, 1.6, '#222'); circ(18, -9, 1.8, '#e07a8a');
    line(7, -16, 14, -13, 1.8, '#222'); poly([-14, -14, -12, -21, -9, -15], '#b87a40'); poly([-9, -17, -6, -23, -4, -17], '#b87a40');
    poly([15, -7, 16.5, -3.5, 18, -7], '#fff');
    ell(-8, -1.5, 4, 2, '#e8a9a0'); ell(5, -1.5, 4, 2, '#e8a9a0');
  },
  frog() {
    ell(-11, -3, 7, 4, '#3f9e4c'); ell(11, -3, 7, 4, '#3f9e4c');
    ell(0, -11, 14, 11, '#4cc15a'); ell(0, -6, 9, 6, '#cdf3aa');
    circ(-6, -22, 5.5, '#4cc15a'); circ(6, -22, 5.5, '#4cc15a');
    circ(-6, -22, 3.8, '#fff'); circ(6, -22, 3.8, '#fff');
    circ(-5.5, -21.5, 2.4, '#222'); circ(6.5, -21.5, 2.4, '#222');
    line(-8.5, -22, -6, -19.5, 0.9, '#e63946'); line(8, -22, 5.8, -19.5, 0.9, '#e63946');
    line(-6, -13, 6, -13, 1.8, '#2a7a34');
    rrect(13, -17, 7, 11, 1.5, '#27d3ff'); rrect(13, -14, 7, 3, 0, '#fff'); line(15.5, -17, 17.5, -19, 1.4, '#ccc');
    circ(-9, -11, 1.3, '#3f9e4c'); circ(9, -11, 1.3, '#3f9e4c');
  },
  cat(t) {
    ctx.strokeStyle = '#8c8ca0'; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-10, -9); ctx.bezierCurveTo(-24, -10, -22, -30, -13, -27 + Math.sin(t * 0.1) * 2); ctx.stroke();
    ell(0, -11, 12, 10, '#8c8ca0');
    for (let k = 0; k < 3; k++) line(-5 + k * 4, -18, -4 + k * 4, -12, 1.6, '#5f5f72');
    circ(2, -26, 10, '#8c8ca0');
    poly([-5, -31, -4, -42, 3, -33], '#8c8ca0'); poly([6, -33, 12, -42, 13, -30], '#8c8ca0');
    poly([-3.5, -32, -3.2, -38, 1, -33], '#e8a0a0'); poly([7, -33.5, 10.5, -38, 11, -32], '#e8a0a0');
    ell(-1, -26, 2.4, 3, '#ffe066'); ell(7, -26, 2.4, 3, '#ffe066');
    ell(-1, -26, 0.8, 2.6, '#111'); ell(7, -26, 0.8, 2.6, '#111');
    line(-5, -31, 1, -28, 1.8, '#333'); line(10, -31, 4, -28, 1.8, '#333'); // grumpy brows
    circ(3, -21.5, 1.3, '#e8a0a0'); line(0, -17, 3, -19, 1.2, '#333'); line(3, -19, 6, -17, 1.2, '#333');
    line(6, -22, 14, -23, 0.9, '#eee'); line(6, -21, 14, -20, 0.9, '#eee');
    ell(-5, -1.5, 4, 2, '#6f6f82'); ell(6, -1.5, 4, 2, '#6f6f82');
  },
  owl(t) {
    const flap = Math.sin(t * 0.25) * 3;
    ell(-12, -18 - flap, 4, 11, '#6f523a', 0.25); ell(12, -18 - flap, 4, 11, '#6f523a', -0.25);
    ell(0, -18, 11, 14, '#8b6b4a'); ell(0, -15, 7.5, 10, '#dcc7a2');
    for (let k = 0; k < 3; k++) circ(-3 + k * 3, -13 + (k % 2) * 4, 1.1, '#b89a6e');
    ell(0, -33, 12, 10, '#8b6b4a');
    poly([-11, -38, -8, -46, -4, -39], '#8b6b4a'); poly([11, -38, 8, -46, 4, -39], '#8b6b4a');
    circ(-5, -33, 5.5, '#fff3b0'); circ(5, -33, 5.5, '#fff3b0');
    circ(-5, -33, 2.4, '#222'); circ(5, -33, 2.4, '#222');
    line(-10, -39, -2, -35.5, 2.2, '#3a2a1a'); line(10, -39, 2, -35.5, 2.2, '#3a2a1a');
    poly([-2, -30, 2, -30, 0, -25], '#e8a33a');
    rrect(-7, -9, 14, 9, 1, '#fff'); line(-7, -9, 0, -4, 1, '#bbb'); line(7, -9, 0, -4, 1, '#bbb');
    line(-4, -4, -4, -1, 2, '#e8a33a'); line(4, -4, 4, -1, 2, '#e8a33a');
  },
  pony(t) {
    for (const x of [-9, -3, 5, 11]) line(x, -14, x, -1, 3.4, '#e8e8f0');
    ctx.strokeStyle = '#3a2a5a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ['#2a2040', '#5a3a8a', '#8a6ad0'].forEach((c, i) => {
      ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(-14, -20 + i); ctx.bezierCurveTo(-26, -22 + i, -24, -6 + i * 2, -20, -4 + Math.sin(t * 0.1) * 2); ctx.stroke();
    });
    ell(0, -19, 15, 9, '#fff');
    poly([8, -22, 15, -36, 22, -30, 14, -14], '#fff');
    ell(20, -33, 8, 6.5, '#fff', 0.45);
    poly([21, -38, 24, -52, 26, -38], '#d8d8e8');
    ['#1c1830', '#2e2450', '#47347a', '#6a4aa8', '#8a6ad0'].forEach((c, i) => circ(9 + i * 1.6, -35 + i * 3.4, 3.4, c));
    rrect(17, -37, 12, 4.5, 1.8, '#111'); line(17, -35, 13, -36, 1.4, '#111');
    circ(27, -30, 1.3, '#f5a0b0');
  },
  hamster() {
    circ(0, -21, 21, 'rgba(120,130,150,0.6)');
    ell(0, -15, 12, 10, '#e8b36b'); ell(0, -12, 8, 6, '#fbeacc');
    circ(0, -26, 9, '#e8b36b'); circ(-7, -33, 3.4, '#e8b36b'); circ(7, -33, 3.4, '#e8b36b');
    circ(-7, -33, 1.8, '#f4a0a0'); circ(7, -33, 1.8, '#f4a0a0');
    circ(-3, -27, 1.8, '#222'); circ(3, -27, 1.8, '#222'); circ(0, -24, 1.4, '#e07a8a');
    line(-6.5, -31, -1.5, -28.5, 1.8, '#222'); line(6.5, -31, 1.5, -28.5, 1.8, '#222');
    line(-3, -22, 3, -22, 1.4, '#222'); poly([-2, -22, -1, -20, 0, -22], '#fff'); poly([1, -22, 2, -20, 3, -22], '#fff');
    ring(0, -21, 21, 3, '#6b7280');
    for (const a of [0.3, 1.2, 2.1, 3.0, 3.9, 4.8, 5.7]) circ(Math.cos(a) * 19, -21 + Math.sin(a) * 19, 1.8, '#c5ccd8');
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -21, 15, Math.PI * 1.1, Math.PI * 1.4); ctx.stroke();
  },
  mummy(t) {
    rrect(-8, -14, 6, 14, 2, '#f4f4f4'); rrect(2, -14, 6, 14, 2, '#f4f4f4');
    line(-9, -33, -20, -37, 5, '#f4f4f4'); line(9, -33, 20, -27 + Math.sin(t * 0.12) * 3, 5, '#f4f4f4');
    rrect(-10, -36, 20, 24, 6, '#f8f8f8');
    for (let k = 0; k < 5; k++) line(-10, -33 + k * 5, 10, -29 + k * 5, 1.2, '#d6d6d6');
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(20, -27); ctx.bezierCurveTo(28, -22, 22, -14, 32, -10 + Math.sin(t * 0.12) * 3); ctx.stroke();
    circ(0, -42, 9, '#f4f4f4');
    for (let k = 0; k < 3; k++) line(-8, -45 + k * 4, 8, -43 + k * 4, 1.1, '#d6d6d6');
    rrect(-7, -45, 14, 5, 2, '#555'); circ(-3, -42.5, 1.7, '#fff'); circ(3, -42.5, 1.7, '#fff');
  },
  dragon(t) {
    const flap = Math.sin(t * 0.2) * 4;
    poly([-3, -26, -20, -48 - flap, -8, -42, -3, -52 - flap, 4, -28], '#2a8a45');
    ctx.strokeStyle = '#3fae5a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-10, -14); ctx.bezierCurveTo(-26, -12, -26, -2, -20, -6); ctx.stroke();
    ell(0, -19, 13, 12, '#3fae5a'); ell(3, -15, 8, 8, '#ead77a');
    circ(12, -30, 8.5, '#3fae5a'); ell(19, -29, 6, 4.5, '#3fae5a');
    circ(13, -33, 2.3, '#fff'); circ(13.6, -33, 1.1, '#222'); circ(21, -31, 0.9, '#2a7a34');
    poly([9, -37, 11, -45, 14, -37], '#ead77a');
    poly([20, -27, 35, -22, 25, -17], '#f2c94c'); line(35, -22, 25, -17, 2.4, '#d99a3a');
    circ(26, -23, 2, '#d63a3a'); circ(30, -22, 1.6, '#d63a3a');
    ell(-5, -1.5, 5, 2.5, '#2a8a45'); ell(6, -1.5, 5, 2.5, '#2a8a45');
  },
  headteacher() {
    rrect(-8, -14, 6, 14, 1, '#2b2f4a'); rrect(2, -14, 6, 14, 1, '#2b2f4a');
    ell(-5, -1, 5, 2.4, '#111'); ell(6, -1, 5, 2.4, '#111');
    rrect(-11, -38, 22, 26, 5, '#3a4070');
    poly([-3, -38, 3, -38, 0, -28], '#f4f4f4'); poly([0, -36, -3, -23, 0, -19, 3, -23], '#d63a3a');
    line(-11, -34, -15, -21, 4.5, '#3a4070'); line(11, -34, 15, -21, 4.5, '#3a4070');
    circ(-15, -20, 2.4, SKIN); circ(15, -20, 2.4, SKIN);
    rrect(13, -30, 10, 13, 1, '#c9a46a'); rrect(14.5, -28.5, 7, 10, 0.5, '#fff');
    circ(0, -45, 8.5, SKIN); ell(0, -51, 9, 4, '#9a9aa8'); circ(0, -56, 3, '#9a9aa8');
    ring(-3.6, -45, 3, 1.3, '#333'); ring(3.6, -45, 3, 1.3, '#333'); line(-0.6, -45, 0.6, -45, 1.2, '#333');
    circ(-3.6, -45, 1, '#222'); circ(3.6, -45, 1, '#222');
    line(-6, -49.5, -1, -48, 1.6, '#555'); line(6, -49.5, 1, -48, 1.6, '#555');
    line(-3, -40, 3, -40, 1.3, '#a05a50');
  },
  fort() {
    rrect(-20, -28, 40, 28, 2, '#c9a46a'); rrect(-20, -28, 40, 5, 1, '#b68e55');
    for (let k = 0; k < 4; k++) rrect(-20 + k * 11.5, -34, 7, 7, 1, '#c9a46a');
    rrect(-6, -17, 12, 17, 6, '#7a5a30'); rrect(-20, -14, 40, 4, 0, 'rgba(240,222,160,0.7)');
    line(15, -34, 15, -50, 2, '#6a4a2c'); poly([15, -50, 28, -46, 15, -42], '#e63946');
  },
};

// A creature with a little bounce. The owner's colour ring and any status marks are drawn by the caller.
function drawCreature(type, x, y, t, opts = {}) {
  const sp = SPRITES[type];
  if (!sp) throw new Error(`drawCreature: no sprite for "${type}"`);
  const flying = !!(CREATURES[type] && CREATURES[type].flying);
  ctx.save();
  ctx.translate(x, y - (flying ? 6 + Math.sin(t * 0.12 + (opts.phase || 0)) * 2 : Math.abs(Math.sin(t * 0.08 + (opts.phase || 0))) * 1.5));
  const s = opts.scale || 1;
  ctx.scale((opts.flip ? -1 : 1) * s * (opts.squash || 1), s * (2 - (opts.squash || 1)));
  sp(t);
  ctx.restore();
}

// Slime puddle (drawn into one board square).
function drawBlobSprite(x, y, t, seed = 0) {
  ctx.save(); ctx.translate(x, y);
  const w = Math.sin(t * 0.07 + seed) * 1.5;
  ell(0, -9, 22 + w, 12 - w * 0.4, '#43c25a'); ell(0, -11, 19 + w, 9, '#6fe27a');
  circ(-8, -13, 3, 'rgba(255,255,255,0.65)'); circ(9 + w, -8, 2, 'rgba(255,255,255,0.5)');
  circ(5, -17 + Math.sin(t * 0.1 + seed) * 2, 2.6, 'rgba(255,255,255,0.45)');
  ctx.restore();
}

// ---- the pupils ----
function drawHat(style, col, dark) {
  ell(0, -38, 11.5, 3.2, dark);
  if (style === 'top') {
    rrect(-6.5, -58, 13, 20, 2, col); rrect(-6.5, -45, 13, 3.5, 0, '#f2c94c');
    line(5, -57, 11, -63, 2, '#fff'); line(5, -57, 12, -58, 2, '#ffd84d');
    return;
  }
  poly([-9.5, -38, 9.5, -38, 1, -59], col);
  poly([-9.5, -38, -1, -38, -3, -52], lighter(col, 0.15));
  rrect(-8.5, -43, 17, 3.2, 1, '#f2c94c');
  if (style === 'wonky') poly([1, -59, 12, -55, 4, -51, -1, -52], col);
  if (style === 'star') star(0, -49, 4.5, '#ffd84d');
}

function rect_shine() { line(-5, -35, -2, -35, 1, 'rgba(255,255,255,0.5)'); line(2, -35, 5, -35, 1, 'rgba(255,255,255,0.5)'); }

function drawWizardSprite(w, t, opts = {}) {
  const col = w.color, dark = darker(col, 0.28);
  ell(-4, -1.5, 4.5, 2.4, '#3a2a2a'); ell(5, -1.5, 4.5, 2.4, '#3a2a2a');
  poly([-10, -4, 10, -4, 7, -27, -7, -27], col);
  poly([-10, -4, -2, -4, -3, -27, -7, -27], dark);
  rrect(-7.5, -18, 15, 3.2, 1, '#f2c94c');
  const sway = opts.moving ? Math.sin(t * 0.5) * 3 : 0;
  line(-6, -24, -13, -17 + sway, 4, col); circ(-13, -17 + sway, 2.4, SKIN);
  const wave = Math.sin(t * 0.15) * 1.5;
  line(6, -24, 14, -29 + wave, 4, col); circ(14, -29 + wave, 2.4, SKIN);
  line(14, -29 + wave, 20, -40 + wave, 1.8, '#7a4e2c'); star(20, -41 + wave, 4.2, '#fff6a0');
  circ(0, -33, 8, SKIN);
  ell(-7.5, -35, 2, 3.2, '#3a2a1a'); ell(7.5, -35, 2, 3.2, '#3a2a1a'); // messy hair poking out
  if (w.hat === 'wonky') {
    rrect(-7.5, -36, 15, 5, 2, '#111'); line(-7.5, -34, -9, -35, 1.2, '#111'); rect_shine();
  } else {
    ell(-3, -33, 1.6, 1.3, '#222'); ell(3, -33, 1.6, 1.3, '#222');
    line(-6, -36.5, -1.5, -35.5, 1.5, '#4a3020'); line(6, -38, 1.5, -35.5, 1.5, '#4a3020'); // one eyebrow up
  }
  ctx.strokeStyle = '#a05a50'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-2.5, -29.5); ctx.quadraticCurveTo(1, -28.3, 4.5, -31.2); ctx.stroke(); // smirk
  drawHat(w.hat, col, dark);
}

// The tiny pet that tags along beside a pupil (just for show).
function drawFamiliar(kind, x, y, t) {
  const type = { cat: 'cat', owl: 'owl', frog: 'frog', hamster: 'hamster' }[kind];
  if (!type) throw new Error(`drawFamiliar: unknown familiar "${kind}"`);
  drawCreature(type, x, y, t, { scale: 0.42, phase: 2 });
}

// ---- spell card art ----
function drawSpellIcon(sp, cx, cy, size, t = 0) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(size / 44, size / 44);
  if (sp.kind === 'summon') {
    ctx.translate(0, 24); ctx.scale(0.9, 0.9);
    drawCreature(sp.creature, 0, 0, t);
  } else if (sp.id === 'pie') {
    ell(0, 11, 19, 6, '#e8eef8'); ell(0, 8, 15, 8, '#f2c94c'); ell(0, 4, 12, 6, '#fff3a8');
    circ(0, -2, 7, '#fffbe8'); circ(0, -8, 3, '#e63946');
  } else if (sp.id === 'glitter') {
    const cols = ['#ff4d8d', '#ffd84d', '#4db8ff', '#7dd87a', '#b04dff'];
    for (let k = 0; k < 12; k++) { const a = k * 0.52; circ(Math.cos(a) * (10 + (k % 3) * 5), Math.sin(a) * (10 + (k % 3) * 5), 2.4, cols[k % 5]); }
    star(0, 0, 9, '#fff6a0', 4);
  } else if (sp.id === 'tickle') {
    ell(0, -2, 19, 14, '#fff'); poly([-7, 8, -13, 19, 3, 10], '#fff');
    circ(-8, -2, 2.6, '#444'); circ(0, -2, 2.6, '#444'); circ(8, -2, 2.6, '#444');
  } else if (sp.id === 'shield') {
    poly([-9, -21, 9, -21, 16, -2, 9, 22, -9, 22, -16, -2], '#3b2a22');
    ctx.strokeStyle = '#6b4a3a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-9, -21); ctx.lineTo(9, -21); ctx.lineTo(16, -2); ctx.lineTo(9, 22); ctx.lineTo(-9, 22); ctx.lineTo(-16, -2); ctx.closePath(); ctx.stroke();
    line(0, -12, 0, 8, 3, '#c9b28a'); line(-6, -5, 6, -5, 3, '#c9b28a');
  } else if (sp.id === 'wand') {
    line(-14, 16, 8, -8, 3.5, '#7a4e2c'); star(11, -12, 9, '#ffd84d'); circ(-2, -16, 2, '#fff'); circ(16, 0, 2, '#fff');
  } else if (sp.id === 'wings') {
    ell(-11, 0, 8, 17, '#fff', 0.4); ell(11, 0, 8, 17, '#fff', -0.4);
    ell(-9, 2, 4, 11, '#dbe9ff', 0.4); ell(9, 2, 4, 11, '#dbe9ff', -0.4);
  } else if (sp.id === 'blob') {
    drawBlobSprite(0, 18, t);
  } else if (sp.id === 'ink') {
    ell(0, 14, 22, 9, '#0b0818'); ell(-8, 12, 12, 7, '#0b0818'); ell(10, 16, 9, 5, '#0b0818'); ell(-3, 13, 14, 5, '#171034');
    ctx.strokeStyle = 'rgba(160,120,255,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(-5, 12, 9, 3.5, 0, Math.PI * 1.15, Math.PI * 1.75); ctx.stroke();
    line(8, -20, 0, 2, 2.5, '#d8d0f0'); poly([8, -20, 15, -26, 11, -16], '#d8d0f0'); // a quill
  } else if (sp.id === 'passage') {
    rrect(-16, -22, 32, 44, 3, '#2a1a10'); rrect(-12, -18, 24, 36, 2, '#0a0610');
    for (const [bx, col] of [[-14, '#8a3a3a'], [-8, '#3a5a8a'], [-2, '#8a7a3a'], [4, '#3a8a5a'], [10, '#6a3a8a']]) rrect(bx, -29, 5, 8, 1, col);
    ctx.strokeStyle = '#c9a0ff'; ctx.lineWidth = 3; ctx.strokeRect(-12, -18, 24, 36);
    circ(0, 0, 4, 'rgba(201,160,255,0.55)');
  } else {
    throw new Error(`drawSpellIcon: no icon for "${sp.id}"`);
  }
  ctx.restore();
}
