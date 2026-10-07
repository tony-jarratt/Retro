'use strict';

// All the artwork is drawn in code (no image files): 1950s rocket-age cartoon sci-fi. Chrome, turquoise,
// atomic orange, cream and a lot of rivets.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
// Wrap the colour setters (and gradient stops) so the look can convert every colour without touching the art code.
(function installTone() {
  const proto = CanvasRenderingContext2D.prototype;
  for (const prop of ['fillStyle', 'strokeStyle', 'shadowColor']) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (!desc || !desc.set) { look.supported = false; console.warn(`Monochrome look unavailable: cannot wrap ${prop}`); return; }
    Object.defineProperty(ctx, prop, { configurable: true, get() { return desc.get.call(ctx); }, set(v) { desc.set.call(ctx, look.role && typeof v === 'string' ? toneColor(v) : v); } });
  }
  for (const name of ['createLinearGradient', 'createRadialGradient']) {
    const orig = proto[name];
    ctx[name] = (...args) => {
      const g = orig.apply(ctx, args), add = g.addColorStop.bind(g);
      g.addColorStop = (offset, color) => add(offset, look.role && typeof color === 'string' ? toneColor(color) : color);
      return g;
    };
  }
})();
// ---- the monochrome look (a nod to the one-colour rooms of the old isometric games) ----
// When look.mono is on and a draw role is set, every colour the drawing code uses is converted on the way in.
// Roles: 'scenery' dim tints of the room's hue; 'accent' brighter tints (doors, plates, vents, arcs); 'actor' near white
// (you, crates, robots, parts); 'ink' black (the outline drawn behind an actor). With no role, colours are untouched.
const look = { mono: false, role: null, hue: '#8fd0ff', supported: true };
const toneCache = new Map();
function parseColor(str) {
  let m = /^#([0-9a-f]{3})$/i.exec(str);
  if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16), a: 1 };
  m = /^#([0-9a-f]{6})$/i.exec(str);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(str);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  return null;
}
function toneColor(str) {
  const key = `${look.role}|${look.hue}|${str}`;
  const hit = toneCache.get(key);
  if (hit !== undefined) return hit;
  const c = parseColor(str);
  let out = str;
  if (c) {
    const L = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
    if (look.role === 'ink') out = `rgba(0,0,0,${c.a})`;
    else {
      const hue = parseColor(look.hue);
      const level = look.role === 'scenery' ? 0.08 + 0.52 * Math.pow(L, 1.2) : look.role === 'accent' ? 0.24 + 0.58 * Math.pow(L, 0.9) : 0.5 + 0.5 * L;
      const base = look.role === 'actor' ? { r: 245, g: 245, b: 238 } : hue;
      out = `rgba(${Math.round(base.r * level)},${Math.round(base.g * level)},${Math.round(base.b * level)},${c.a})`;
    }
  }
  if (toneCache.size > 6000) toneCache.clear();
  toneCache.set(key, out);
  return out;
}
const FONT = '"Trebuchet MS", Verdana, sans-serif';
const TITLE_FONT = 'Impact, Haettenschweiler, "Arial Narrow Bold", "Arial Black", sans-serif';

const PAL = {
  space: '#08122a', teal: '#2bb3a8', tealDark: '#1d7f78', tealLight: '#6fe0d4', orange: '#f2742a', orangeDark: '#b84d14',
  cream: '#f3e9c9', creamDark: '#cfc29a', chrome: '#c9d3dd', chromeDark: '#8d99a8', red: '#d93a3a', mustard: '#e8b923',
  navy: '#14233f', navyLight: '#24406e', atom: '#7dff6a',
};

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
function fitText(str, x, y, maxWidth, size, color, align = 'left', font = FONT, shadow = false) {
  let s = size;
  ctx.letterSpacing = font === TITLE_FONT ? '1.5px' : '0px';
  ctx.font = `bold ${s}px ${font}`;
  while (s > 8 && ctx.measureText(str).width > maxWidth) { s -= 1; ctx.font = `bold ${s}px ${font}`; }
  text(str, x, y, s, color, align, font, shadow);
}
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
function mixHex(hex, other, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex), b = p(other);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const darker = (hex, t = 0.3) => mixHex(hex, '#000000', t);
const lighter = (hex, t = 0.35) => mixHex(hex, '#ffffff', t);

// ---- isometric blocks ----
// (sx, sy) is the screen position of the top corner of the tile's top face; z is the height of the block's top.
function isoTop(sx, sy, fill) { poly([sx, sy, sx + TILE_W / 2, sy + TILE_H / 2, sx, sy + TILE_H, sx - TILE_W / 2, sy + TILE_H / 2], fill); }
function isoBlock(sx, sy, height, top, left, right) {
  // left face (south-west), right face (south-east), then the top face
  poly([sx - TILE_W / 2, sy + TILE_H / 2, sx, sy + TILE_H, sx, sy + TILE_H + height, sx - TILE_W / 2, sy + TILE_H / 2 + height], left);
  poly([sx + TILE_W / 2, sy + TILE_H / 2, sx, sy + TILE_H, sx, sy + TILE_H + height, sx + TILE_W / 2, sy + TILE_H / 2 + height], right);
  isoTop(sx, sy, top);
}
function rivet(x, y) { circ(x, y, 1.6, 'rgba(0,0,0,0.35)'); circ(x - 0.4, y - 0.4, 0.9, 'rgba(255,255,255,0.7)'); }

// ---- the hero: the Professor's reluctant apprentice, in a silver jumpsuit and a fishbowl helmet ----
function drawApprentice(x, y, face, t, opts = {}) {
  // (x, y) is the point on the ground between the feet
  const dir = { N: 1, E: 1, S: -1, W: -1 }[face];
  ctx.save(); ctx.translate(x, y);
  const bob = opts.moving ? Math.abs(Math.sin(t * 0.5)) * 2 : 0;
  const lift = opts.air ? -10 : 0;
  ctx.translate(0, lift - bob);
  ell(0, 2 - lift, 11, 4, 'rgba(0,0,0,0.3)');
  ctx.scale(dir, 1);
  const sw = opts.moving ? Math.sin(t * 0.6) * 3 : 0;
  line(-3, -10, -3 + sw, -1, 4.5, '#aab6c4'); line(3, -10, 3 - sw, -1, 4.5, '#cfd8e2');
  ell(-3 + sw, -0.5, 4.5, 2.4, PAL.orange); ell(3 - sw, -0.5, 4.5, 2.4, PAL.orange);
  rrect(-7, -26, 14, 18, 5, '#cfd8e2'); rrect(-7, -26, 6, 18, 4, '#aab6c4');
  rrect(-7, -17, 14, 3, 1, PAL.orange); circ(0, -15.5, 2, PAL.mustard);
  line(-7, -23, -11, -15 - sw, 3.5, '#cfd8e2'); line(7, -23, 11, -15 + sw, 3.5, '#cfd8e2');
  circ(-11, -15 - sw, 2.4, '#f6c9a0'); circ(11, -15 + sw, 2.4, '#f6c9a0');
  // spanner in one hand
  line(11, -15 + sw, 15, -21 + sw, 2, PAL.chromeDark); circ(15.5, -22 + sw, 2.6, PAL.chrome);
  // head, with goggles, in a fishbowl helmet
  circ(0, -33, 8, '#f6c9a0');
  ell(-6, -35, 2, 3, '#4a2e1a'); ell(6, -35, 2, 3, '#4a2e1a');
  rrect(-6.5, -36.5, 13, 5, 2.5, PAL.orange); circ(-3, -34, 2.2, '#fff'); circ(3, -34, 2.2, '#fff');
  circ(-3, -34, 1, '#222'); circ(3, -34, 1, '#222');
  ctx.strokeStyle = '#8a4a40'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-2, -29); ctx.quadraticCurveTo(1, -28, 4, -30); ctx.stroke(); // a half-smile
  ctx.fillStyle = 'rgba(190,235,255,0.22)'; ctx.beginPath(); ctx.arc(0, -33, 12.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, -33, 12.5, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -33, 9.5, Math.PI * 1.15, Math.PI * 1.5); ctx.stroke();
  rrect(-8, -22, 16, 3, 1.5, PAL.chromeDark); // helmet collar
  line(5, -45, 5, -52, 1.5, PAL.chrome); circ(5, -53, 2, PAL.red); // antenna
  ctx.restore();
}

// ---- the patrolling tin robot ----
function drawRobot(x, y, face, t, opts = {}) {
  ctx.save(); ctx.translate(x, y);
  ell(0, 2, 12, 4.5, 'rgba(0,0,0,0.3)');
  const dir = { N: 1, E: 1, S: -1, W: -1 }[face];
  ctx.scale(dir, 1);
  const wob = Math.sin(t * 0.45) * 1.2;
  rrect(-9, -4 + wob, 18, 5, 2, PAL.chromeDark);       // feet
  rrect(-8, -22 + wob, 16, 19, 3, '#d9a441');           // body: brass tin
  rrect(-8, -22 + wob, 6, 19, 3, '#f0c566');
  rrect(-6, -19 + wob, 12, 8, 2, '#222'); circ(-2, -15 + wob, 1.6, PAL.atom); circ(2, -15 + wob, 1.6, PAL.red); // dials
  rrect(-6, -10 + wob, 12, 2, 1, PAL.orangeDark);
  line(-8, -17 + wob, -13, -11 + wob, 3, PAL.chromeDark); line(8, -17 + wob, 13, -11 + wob, 3, PAL.chromeDark); // arms
  rrect(-7, -33 + wob, 14, 11, 3, '#e8b94a');           // head
  circ(-2.5, -28 + wob, 2.6, '#fff'); circ(2.5, -28 + wob, 2.6, '#fff'); circ(-2.5, -28 + wob, 1.1, PAL.red); circ(2.5, -28 + wob, 1.1, PAL.red);
  line(-4, -31.5 + wob, -1, -30.5 + wob, 1.4, '#3a2a10'); line(4, -31.5 + wob, 1, -30.5 + wob, 1.4, '#3a2a10'); // a sulky brow
  line(0, -33 + wob, 0, -39 + wob, 1.5, PAL.chrome); circ(0, -40 + wob, 2.2, PAL.red + ''); // antenna
  ctx.save(); ctx.translate(0, -12 + wob); ctx.rotate(t * 0.15); line(0, 0, 0, -5, 2, PAL.chrome); circ(0, -5, 2, PAL.chrome); ctx.restore(); // a wind-up key
  ctx.restore();
}

// ---- a crate: an atomic supply cube. (sx, topY) is the top corner of its top face; it is one level tall ----
function drawCrateAt(sx, topY) {
  isoBlock(sx, topY, LEVEL_H, '#f08a3c', '#b8561a', '#d46a22');
  // cream tape across the top, and rivets
  poly([sx - 8, topY + TILE_H / 2 - 4, sx + 8, topY + TILE_H / 2 + 4, sx + 12, topY + TILE_H / 2 + 2, sx - 4, topY + TILE_H / 2 - 6], 'rgba(255,240,200,0.7)');
  rivet(sx - 25, topY + TILE_H / 2 + 4); rivet(sx + 25, topY + TILE_H / 2 + 4);
  // an atom symbol on the right-hand face
  ctx.save(); ctx.translate(sx + TILE_W / 4, topY + TILE_H + LEVEL_H / 2 - 4); ctx.scale(1, 0.8);
  ctx.strokeStyle = 'rgba(255,240,200,0.85)'; ctx.lineWidth = 1.3;
  for (const r of [0, 1.05, 2.1]) { ctx.beginPath(); ctx.ellipse(0, 0, 7.5, 2.8, r, 0, Math.PI * 2); ctx.stroke(); }
  circ(0, 0, 1.6, 'rgba(255,240,200,0.9)');
  ctx.restore();
  line(sx - 28, topY + TILE_H + 4, sx - 4, topY + TILE_H + 10, 1.4, 'rgba(255,240,200,0.45)'); // a stencilled line on the left face
}

// ---- a rocket part, glowing and bobbing ----
function drawPart(id, x, y, t) {
  ctx.save(); ctx.translate(x, y - 8 + Math.sin(t * 0.07) * 3);
  const glow = 0.5 + 0.3 * Math.sin(t * 0.12);
  ctx.shadowColor = '#fff6a0'; ctx.shadowBlur = 14 * glow + 6;
  const parts = {
    nose() { poly([0, -34, 10, -8, -10, -8], PAL.red); poly([0, -34, 4, -8, -2, -8], '#f06a6a'); ell(0, -8, 10, 3, '#a02424'); },
    fins() { poly([-14, 0, -4, -26, 2, -26, 2, -4], PAL.chrome); poly([14, 0, 4, -26, -2, -26, -2, -4], PAL.chromeDark); rrect(-3, -28, 6, 28, 2, PAL.chrome); },
    panel() { rrect(-14, -24, 28, 20, 3, '#3a4a5c'); for (let i = 0; i < 4; i++) circ(-9 + i * 6, -16, 2.3, [PAL.red, PAL.atom, PAL.mustard, PAL.tealLight][i]); rrect(-10, -10, 20, 4, 1, '#222'); },
    tank() { rrect(-8, -30, 16, 28, 7, PAL.cream); rrect(-8, -30, 6, 28, 6, '#fff'); rect_band(-8, -20, 16, 4, PAL.orange); rect_band(-8, -10, 16, 4, PAL.orange); },
    porthole() { circ(0, -14, 13, PAL.chrome); circ(0, -14, 9, '#7fd6ff'); circ(-3, -17, 3, 'rgba(255,255,255,0.8)'); for (let k = 0; k < 8; k++) rivet(Math.cos(k * 0.785) * 11, -14 + Math.sin(k * 0.785) * 11); },
    battery() { rrect(-8, -26, 16, 24, 3, '#2a3a2a'); rrect(-4, -30, 8, 5, 1, PAL.chromeDark); ctx.shadowBlur = 20; circ(0, -14, 5, PAL.atom); star(0, -14, 8, 'rgba(125,255,106,0.5)', 6); },
  };
  (parts[id] || parts.nose)();
  ctx.restore();
}
function rect_band(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
