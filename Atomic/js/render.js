'use strict';

// Everything you see in the game: the isometric rooms, the HUD, the title, help and ending screens.
// This file only draws. The state it draws lives in `app` (see ui.js) and in the game (rules.js).

const WALL_LEVELS = 1.7;   // how tall a bank of machinery is, in levels (low enough not to hide you)
const SLAB = 14;           // how thick the edge of a floor looks
const PIT_DEPTH = 1;       // a pit is drawn this many levels deep

// ---- projection ----
function roomOrigin(room) {
  return { ox: VIEW_W / 2, oy: 372 - (room.W + room.H) * 8 };
}
// screen position of the top corner of tile (x, y)'s top face at level 0 (float coordinates allowed)
function project(o, x, y) { return { sx: o.ox + (x - y) * TILE_W / 2, sy: o.oy + (x + y) * TILE_H / 2 }; }

// ---- a look for every room ----
// floor: the two checkerboard colours of the ground. wall: what a wall square is dressed as. backdrop: the scene behind
// the room. sky: the three colours of the sky. pit: the glow in a pit (r,g,b). props: free-standing scenery just outside
// the floor (x and y can be off the edge); arcs: pairs of props joined by lightning.
const THEMES = {
  airlock:     { sky: ['#050b1e', '#0b1a3a', '#14305a'], floor: ['#6b8aa8', '#5f7d9a'], wall: 'console', backdrop: 'earth', pit: '70,140,255', props: [], arcs: [] },
  repair:      { sky: ['#0d0f14', '#1a1e26', '#2a2f3a'], floor: ['#4a525e', '#424a55'], wall: 'toolbox', backdrop: 'gears', pit: '255,150,60',
                 props: [{ type: 'tesla', x: -0.7, y: 1.5 }, { type: 'tesla', x: -0.7, y: 4.5 }], arcs: [[0, 1]] },
  observatory: { sky: ['#03030f', '#0a0a2a', '#1a1a4a'], floor: ['#3a3f8f', '#333884'], wall: 'dish', backdrop: 'moon', pit: '140,120,255',
                 props: [{ type: 'tesla', x: 1.5, y: -0.7 }, { type: 'tesla', x: 5.5, y: -0.7 }], arcs: [[0, 1]] },
  range:       { sky: ['#2a1030', '#7a2a40', '#e8803a'], floor: ['#c79a5a', '#bd9050'], wall: 'target', backdrop: 'sand', pit: '255,180,90', props: [], arcs: [] },
  cafeteria:   { sky: ['#1a0a24', '#3a1040', '#5a1a5a'], floor: ['#f0b8c8', '#e6a8ba'], wall: 'counter', backdrop: 'neon', pit: '255,120,200', props: [], arcs: [] },
  launch:      { sky: ['#0a1030', '#3a2a5a', '#f08a4a'], floor: ['#8d949e', '#838a94'], wall: 'gantry', backdrop: 'dawn', pit: '255,200,120', props: [], arcs: [] },
  control:     { sky: ['#020812', '#06182e', '#0a2a4a'], floor: ['#16355a', '#12304f'], wall: 'console', backdrop: 'hexgrid', pit: '60,220,255',
                 props: [{ type: 'tesla', x: -0.7, y: 1.5 }, { type: 'tesla', x: -0.7, y: 6.5 }], arcs: [[0, 1]] },
  reactor:     { sky: ['#041208', '#0a2a12', '#1a4a1a'], floor: ['#2f5a3a', '#295233'], wall: 'tesla', backdrop: 'core', pit: '125,255,106', props: [], arcs: [] },
  store:       { sky: ['#1a1008', '#3a2412', '#5a3a1a'], floor: ['#a1713f', '#946838'], wall: 'shelf', backdrop: 'dust', pit: '255,200,120', props: [], arcs: [] },
  lounge:      { sky: ['#2a0a14', '#4a1424', '#6a1a30'], floor: ['#b04040', '#a23838'], wall: 'lamp', backdrop: 'atomic', pit: '255,120,120', props: [], arcs: [] },
  greenhouse:  { sky: ['#06201a', '#0e4a30', '#2a7a4a'], floor: ['#58b060', '#4ea458'], wall: 'plant', backdrop: 'jungle', pit: '120,255,180', props: [], arcs: [] },
  vault:       { sky: ['#0a0804', '#1a1408', '#2a2010'], floor: ['#6a6254', '#5f574a'], wall: 'gear', backdrop: 'gold', pit: '255,210,90',
                 props: [{ type: 'tesla', x: 6.5, y: -0.7 }, { type: 'tesla', x: -0.7, y: 6.5 }], arcs: [] },
};
const MONO_HUES = { airlock: '#8fd0ff', repair: '#ffb347', observatory: '#b9a0ff', range: '#ff9a5a', cafeteria: '#ff8ac8', launch: '#ffd36a',
                    control: '#6ae6ff', reactor: '#8dff7a', store: '#e8b36a', lounge: '#ff7a7a', greenhouse: '#7aff9a', vault: '#ffd24a' };
for (const id of Object.keys(THEMES)) THEMES[id].mono = MONO_HUES[id]; // the one hue each room is drawn in, in the monochrome look
const WALL_STYLES = ['console', 'toolbox', 'dish', 'target', 'counter', 'gantry', 'tesla', 'shelf', 'lamp', 'plant', 'gear'];
const BACKDROPS = ['earth', 'gears', 'moon', 'sand', 'neon', 'dawn', 'hexgrid', 'core', 'dust', 'atomic', 'jungle', 'gold'];
function themeOf(room) { return THEMES[room.spec.id]; }

function hash01(n) { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }

// ---- lightning and tesla coils ----
function drawArc(x1, y1, x2, y2, t, seed, width = 2) {
  const n = 9, pts = [], flick = Math.floor(t / 3);
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const off = i === 0 || i === n ? 0 : (hash01(flick * 7 + i * 13 + seed * 31) - 0.5) * 18;
    pts.push([x1 + (x2 - x1) * k + off * 0.4, y1 + (y2 - y1) * k + off]);
  }
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.shadowColor = '#7fd6ff'; ctx.shadowBlur = 12;
  for (const [col, w] of [['rgba(127,214,255,0.55)', width * 3], ['#ffffff', width]]) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  ctx.restore();
}
function arcOn(t, seed) { return (Math.floor(t / 7) + seed) % 6 !== 0; } // mostly crackling, with brief gaps

// A tesla coil standing on (sx, baseY), h pixels tall. Returns the position of its tip.
function drawTeslaCoil(sx, baseY, h, t, seed) {
  ell(sx, baseY, 15, 6.5, 'rgba(0,0,0,0.3)');
  ell(sx, baseY - 2, 13, 5.5, '#4a5568'); rrect(sx - 12, baseY - 9, 24, 8, 2, '#6b7a8f'); ell(sx, baseY - 9, 12, 4.5, '#8d99a8');
  poly([sx - 7, baseY - 9, sx + 7, baseY - 9, sx + 3.5, baseY - h * 0.78, sx - 3.5, baseY - h * 0.78], '#c9d3dd');
  poly([sx - 7, baseY - 9, sx - 1, baseY - 9, sx - 0.5, baseY - h * 0.78, sx - 3.5, baseY - h * 0.78], '#e8eef4');
  for (let k = 0; k < 4; k++) { // copper windings
    const y = baseY - 14 - k * ((h * 0.7) / 4);
    ell(sx, y, 8.5 - k * 0.9, 2.6, '#b87333');
  }
  const ty = baseY - h * 0.78;
  ctx.save(); ctx.strokeStyle = '#8d99a8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(sx, ty, 15, 5.5, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); // the toroid
  const tipY = baseY - h;
  ctx.save(); ctx.shadowColor = '#7fd6ff'; ctx.shadowBlur = 16 + 6 * Math.sin(t * 0.3 + seed);
  circ(sx, tipY + 6, 9, '#dfe8f2'); circ(sx - 2.5, tipY + 3.5, 3, 'rgba(255,255,255,0.9)');
  ctx.restore();
  return { x: sx, y: tipY + 4 };
}
// a few short sparks leaping off a coil's tip
function drawCrackle(tip, t, seed) {
  for (let k = 0; k < 2; k++) {
    if (!arcOn(t + k * 3, seed + k)) continue;
    const a = -Math.PI / 2 + (hash01(Math.floor(t / 4) + seed * 5 + k) - 0.5) * 2.4;
    drawArc(tip.x, tip.y, tip.x + Math.cos(a) * (18 + 12 * hash01(seed + k)), tip.y + Math.sin(a) * (18 + 12 * hash01(seed + k * 3)), t, seed + k, 1.4);
  }
}

// ---- backdrops, behind the floating room ----
function gearShape(cx, cy, r, teeth, rot, fill) {
  ctx.fillStyle = fill; ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) { const a = rot + (i * Math.PI) / teeth, rr = i % 2 ? r * 0.84 : r; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
  circ(cx, cy, r * 0.28, 'rgba(0,0,0,0.35)');
}
const BACKDROP_DRAW = {
  earth(t) { // the Earth, a long way down
    const g = ctx.createRadialGradient(150, 790, 200, 150, 790, 330); g.addColorStop(0, 'rgba(120,190,255,0.5)'); g.addColorStop(1, 'rgba(120,190,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 380, 500, 308);
    circ(150, 800, 300, '#1f5fae'); ctx.save(); ctx.beginPath(); ctx.arc(150, 800, 300, 0, Math.PI * 2); ctx.clip();
    ell(90, 560, 90, 40, '#3f9a52', 0.3); ell(260, 600, 120, 50, '#4aa65a', -0.2); ell(40, 650, 60, 40, '#3f9a52');
    for (let k = 0; k < 4; k++) ell(60 + k * 70 + ((t * 0.1) % 20), 540 + k * 28, 60, 8, 'rgba(255,255,255,0.45)');
    ctx.restore();
  },
  gears(t) { gearShape(180, 520, 150, 14, t * 0.004, 'rgba(70,80,95,0.55)'); gearShape(880, 440, 120, 12, -t * 0.005, 'rgba(70,80,95,0.5)'); gearShape(520, 650, 90, 10, t * 0.006, 'rgba(70,80,95,0.4)'); },
  moon(t) {
    const n = ctx.createRadialGradient(300, 260, 10, 300, 260, 300); n.addColorStop(0, 'rgba(180,100,255,0.28)'); n.addColorStop(1, 'rgba(180,100,255,0)');
    ctx.fillStyle = n; ctx.fillRect(0, 0, 700, 620);
    const m = ctx.createRadialGradient(840, 210, 20, 840, 210, 190); m.addColorStop(0, 'rgba(255,240,200,0.25)'); m.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = m; ctx.fillRect(600, 0, 424, 460);
    circ(840, 210, 100, '#e8e2cc'); for (const [dx, dy, r] of [[-30, -20, 18], [25, 15, 26], [-10, 50, 14], [40, -40, 12]]) circ(840 + dx, 210 + dy, r, 'rgba(120,115,95,0.35)');
  },
  sand(t) {
    circ(512, 470, 150, 'rgba(255,220,140,0.9)'); circ(512, 470, 110, '#ffe9a8');
    for (const [x, w, h] of [[-40, 260, 120], [210, 200, 80], [680, 260, 110], [880, 200, 150]]) poly([x, 620, x + w * 0.2, 620 - h, x + w * 0.8, 620 - h, x + w, 620], '#4a2030');
  },
  neon(t) {
    const on = Math.floor(t / 90) % 7 !== 0;
    ctx.save(); ctx.shadowColor = '#ff4dc4'; ctx.shadowBlur = on ? 26 : 4;
    ctx.strokeStyle = on ? '#ff7ad8' : '#6a2a5a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.font = 'bold 74px Impact, sans-serif'; ctx.textAlign = 'center'; ctx.strokeText('DINER', 512, 200);
    ctx.beginPath(); ctx.moveTo(380, 240); ctx.lineTo(644, 240); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.shadowColor = '#4dd8ff'; ctx.shadowBlur = 18; ctx.strokeStyle = '#6ae0ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(160, 300, 60, 22, 0, 0, Math.PI * 2); ctx.moveTo(130, 290); ctx.lineTo(160, 250); ctx.lineTo(190, 290); ctx.stroke(); ctx.restore();
  },
  dawn(t) {
    const g = ctx.createLinearGradient(0, 380, 0, 620); g.addColorStop(0, 'rgba(255,170,90,0)'); g.addColorStop(1, 'rgba(255,170,90,0.55)'); ctx.fillStyle = g; ctx.fillRect(0, 380, VIEW_W, 240);
    ctx.fillStyle = '#ffd9a0'; ctx.beginPath(); ctx.arc(512, 620, 120, Math.PI, 0); ctx.fill();
    for (const [x, y, s] of [[160, 200, 0.7], [860, 160, 0.5], [700, 300, 0.4]]) { ctx.globalAlpha = 0.6; drawSaucer(x, y, t, s); ctx.globalAlpha = 1; }
  },
  hexgrid(t) {
    ctx.strokeStyle = 'rgba(60,220,255,0.12)'; ctx.lineWidth = 1;
    for (let y = 70; y < 620; y += 36) for (let x = (Math.floor(y / 36) % 2) * 31; x < VIEW_W; x += 62) { ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; ctx[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * 20, y + Math.sin(a) * 20); } ctx.closePath(); ctx.stroke(); }
    ctx.save(); ctx.translate(880, 180); ctx.strokeStyle = 'rgba(60,255,160,0.5)'; ctx.lineWidth = 2; for (const r of [30, 60, 90]) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.rotate(t * 0.03); const g = ctx.createLinearGradient(0, 0, 90, 0); g.addColorStop(0, 'rgba(60,255,160,0.5)'); g.addColorStop(1, 'rgba(60,255,160,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 90, -0.3, 0.05); ctx.closePath(); ctx.fill(); ctx.restore();
  },
  core(t) {
    const p = 0.7 + 0.3 * Math.sin(t * 0.05);
    const g = ctx.createRadialGradient(512, 340, 10, 512, 340, 340); g.addColorStop(0, `rgba(180,255,120,${0.5 * p})`); g.addColorStop(0.5, 'rgba(60,200,90,0.18)'); g.addColorStop(1, 'rgba(60,200,90,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, 640);
    ctx.strokeStyle = `rgba(160,255,120,${0.25 * p})`; ctx.lineWidth = 3; for (const r of [120, 200, 280]) { ctx.beginPath(); ctx.arc(512, 340, r + 8 * Math.sin(t * 0.04 + r), 0, Math.PI * 2); ctx.stroke(); }
  },
  dust(t) {
    const g = ctx.createRadialGradient(512, 100, 10, 512, 100, 420); g.addColorStop(0, 'rgba(255,220,150,0.25)'); g.addColorStop(1, 'rgba(255,220,150,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, 640);
    for (let k = 0; k < 40; k++) circ((k * 211 + t * (0.1 + (k % 5) * 0.03)) % VIEW_W, (k * 97 + t * 0.05 * ((k % 3) + 1)) % 600, 1 + (k % 3) * 0.6, 'rgba(255,230,180,0.35)');
  },
  atomic(t) {
    ctx.strokeStyle = 'rgba(60,200,190,0.16)'; ctx.lineWidth = 2;
    for (let k = 0; k < 36; k++) { const a = (k / 36) * Math.PI * 2 + t * 0.002; ctx.beginPath(); ctx.moveTo(512, 330); ctx.lineTo(512 + Math.cos(a) * 700, 330 + Math.sin(a) * 700); ctx.stroke(); }
    for (const [x, y] of [[140, 130], [880, 120], [120, 480], [900, 500], [512, 90]]) { ctx.save(); ctx.translate(x, y); ctx.strokeStyle = 'rgba(255,220,120,0.4)'; for (const r of [0, 1.05, 2.1]) { ctx.beginPath(); ctx.ellipse(0, 0, 36, 13, r, 0, Math.PI * 2); ctx.stroke(); } circ(0, 0, 5, 'rgba(255,220,120,0.5)'); ctx.restore(); }
  },
  jungle(t) {
    for (const [x, y, rot, s] of [[-30, 300, -0.3, 1.3], [60, 500, 0.4, 1.1], [980, 280, 0.35, 1.3], [1040, 480, -0.3, 1.2], [200, 130, 0.9, 0.8], [840, 100, -0.8, 0.9]]) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot + Math.sin(t * 0.01 + x) * 0.03); ctx.scale(s, s);
      ell(0, 0, 130, 38, 'rgba(10,60,30,0.7)'); line(-120, 0, 120, 0, 3, 'rgba(60,160,90,0.5)'); ctx.restore();
    }
    for (let k = 0; k < 14; k++) circ((k * 173) % VIEW_W, (k * 59 + t * 0.2) % 600, 2, 'rgba(200,255,200,0.25)');
  },
  gold(t) {
    ctx.save(); ctx.translate(512, 340);
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2 + t * 0.002; ctx.fillStyle = `rgba(255,200,80,${0.05 + 0.05 * Math.sin(t * 0.03 + k)})`; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 700, a, a + 0.12); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    gearShape(130, 150, 90, 12, t * 0.004, 'rgba(200,160,60,0.18)'); gearShape(900, 520, 110, 14, -t * 0.003, 'rgba(200,160,60,0.18)');
  },
};

// ---- background ----
const STARS = Array.from({ length: 90 }, (_, i) => ({ x: (i * 197) % VIEW_W, y: (i * 89 + (i % 7) * 31) % 600, r: 0.8 + (i % 3) * 0.5, p: i * 0.7 }));
function drawSpace(t, theme = null) {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  const sky = theme ? theme.sky : ['#050b1e', '#0b1a3a', '#14305a'];
  g.addColorStop(0, sky[0]); g.addColorStop(0.6, sky[1]); g.addColorStop(1, sky[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  for (const s of STARS) circ(s.x, s.y, s.r, `rgba(255,255,255,${(theme ? 0.25 : 0.35) + 0.35 * Math.sin(t * 0.04 + s.p)})`);
  if (theme) { BACKDROP_DRAW[theme.backdrop](t); return; }
  // the title and help screens: a ringed planet, because of course
  ctx.save(); ctx.translate(880, 150);
  circ(0, 0, 44, '#e8903a'); ell(-10, -8, 30, 14, 'rgba(255,255,255,0.12)', -0.4);
  ctx.strokeStyle = 'rgba(243,233,201,0.85)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(0, 0, 76, 14, -0.3, Math.PI, Math.PI * 2); ctx.stroke();
  ctx.restore();
  ctx.save(); ctx.translate(880, 150); ctx.strokeStyle = 'rgba(243,233,201,0.85)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(0, 0, 76, 14, -0.3, 0, Math.PI); ctx.stroke(); ctx.restore();
}

// ---- tiles ----
function levelAt(room, x, y) { // the floor level of a square for drawing the sides of its neighbours; pits are lower, walls are skipped
  if (!inBounds(room, x, y)) return null;
  if (room.wall[y][x]) return Infinity;
  if (room.pit[y][x]) return -PIT_DEPTH;
  return room.h[y][x];
}
function faceHeight(room, x, y, nx, ny, level) { // how much of this tile's side shows toward the neighbour at (nx, ny)
  const n = levelAt(room, nx, ny);
  if (n === null) return level * LEVEL_H + SLAB;
  if (n === Infinity) return 0;
  return Math.max(0, (level - n) * LEVEL_H);
}

function drawFloorTile(room, x, y, o, t) {
  const { sx, sy } = project(o, x, y);
  const level = room.h[y][x], top = sy - level * LEVEL_H;
  const checker = (x + y) % 2 === 0, th = themeOf(room);
  const ground = th.floor[checker ? 0 : 1];
  const raisedTop = mixHex(ground, '#f3e9c9', 0.62);
  const topCol = level > 0 ? raisedTop : ground;
  const left = faceHeight(room, x, y, x, y + 1, level), right = faceHeight(room, x, y, x + 1, y, level);
  const leftCol = level > 0 ? darker(raisedTop, 0.38) : darker(ground, 0.5), rightCol = level > 0 ? darker(raisedTop, 0.22) : darker(ground, 0.34);
  if (left > 0) poly([sx - TILE_W / 2, top + TILE_H / 2, sx, top + TILE_H, sx, top + TILE_H + left, sx - TILE_W / 2, top + TILE_H / 2 + left], leftCol);
  if (right > 0) poly([sx + TILE_W / 2, top + TILE_H / 2, sx, top + TILE_H, sx, top + TILE_H + right, sx + TILE_W / 2, top + TILE_H / 2 + right], rightCol);
  isoTop(sx, top, topCol);
  // a thin chrome edge and a little sheen
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(sx - TILE_W / 2, top + TILE_H / 2); ctx.lineTo(sx, top); ctx.lineTo(sx + TILE_W / 2, top + TILE_H / 2); ctx.stroke();
  if (level > 0) { // raised floors get an orange safety stripe along their front edges
    if (left > 0) line(sx - TILE_W / 2 + 4, top + TILE_H / 2 + 5, sx - 3, top + TILE_H + 4, 3, PAL.orange);
    if (right > 0) line(sx + TILE_W / 2 - 4, top + TILE_H / 2 + 5, sx + 3, top + TILE_H + 4, 3, PAL.orange);
  }
}

function drawPitTile(room, x, y, o, t) {
  const { sx, sy } = project(o, x, y);
  const top = sy + PIT_DEPTH * LEVEL_H;
  isoTop(sx, top, '#04060f');
  const g = ctx.createRadialGradient(sx, top + TILE_H / 2, 2, sx, top + TILE_H / 2, 30);
  const pg = themeOf(room).pit;
  g.addColorStop(0, `rgba(${pg},0.45)`); g.addColorStop(1, `rgba(${pg},0)`);
  ctx.fillStyle = g; isoTop(sx, top, g);
  for (let k = 0; k < 3; k++) circ(sx - 10 + ((x * 7 + y * 5 + k * 13) % 20), top + 10 + ((x * 3 + k * 7) % 12), 0.9, `rgba(255,255,255,${0.4 + 0.4 * Math.sin(t * 0.05 + k + x)})`);
  // the tile's rim, so the hole reads as a hole
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(sx - TILE_W / 2, sy + TILE_H / 2); ctx.lineTo(sx, sy); ctx.lineTo(sx + TILE_W / 2, sy + TILE_H / 2); ctx.stroke();
  // the far walls of the hole
  poly([sx - TILE_W / 2, sy + TILE_H / 2, sx, sy, sx, top, sx - TILE_W / 2, top + TILE_H / 2 - (top - sy) + (top - sy)], 'rgba(8,14,34,0.0)');
}

const WALL_DRAW = {
  console(sx, top, hgt, t, x, y) { // a bank of blinking machinery with tape reels or an aerial
    isoBlock(sx, top, hgt, '#5b7289', '#33485e', '#46607a');
    for (let k = 0; k < 4; k++) line(sx - TILE_W / 2 + 6, top + TILE_H / 2 + 14 + k * 7, sx - 6, top + TILE_H + 14 + k * 7, 1.6, 'rgba(0,0,0,0.35)');
    for (let k = 0; k < 3; k++) { const on = Math.sin(t * 0.08 + x * 1.7 + y * 2.3 + k * 2) > 0; circ(sx + 10 + k * 9, top + TILE_H + 12 - k * 4, 2.6, on ? [PAL.atom, PAL.mustard, PAL.red][k] : '#27323d'); }
    rrect(sx + 8, top + TILE_H + 24, 22, 10, 2, '#1a222b');
    if ((x * 3 + y * 5) % 3 === 0) { line(sx, top + 4, sx, top - 12, 2, PAL.chrome); circ(sx, top - 13, 2.4, PAL.red); }
    else { ctx.save(); ctx.translate(sx, top + TILE_H / 2); ctx.scale(1, 0.5); circ(-8, 0, 7, '#d8e0e8'); circ(8, 0, 7, '#d8e0e8'); circ(-8, 0, 2.5, '#33485e'); circ(8, 0, 2.5, '#33485e'); ctx.restore(); }
  },
  toolbox(sx, top, hgt) { // a huge red tool chest
    isoBlock(sx, top, hgt, '#c0392b', '#7a1f16', '#9a2a1e');
    for (let k = 0; k < 3; k++) { rrect(sx - TILE_W / 2 + 8, top + TILE_H / 2 + 8 + k * 14, TILE_W / 2 - 14, 10, 2, '#8a2218'); rrect(sx - 22 + 4, top + TILE_H / 2 + 11 + k * 14, 12, 3, 1, PAL.chrome); }
    for (let k = 0; k < 2; k++) rrect(sx + 6, top + TILE_H + 8 + k * 16, TILE_W / 2 - 12, 12, 2, '#b8362a');
    line(sx - 14, top + 4, sx + 14, top + 12, 3, PAL.chromeDark); circ(sx - 14, top + 4, 3, PAL.chrome); // a spanner left on top
  },
  dish(sx, top, hgt, t, x, y) { // a radio telescope dish on a cabinet
    isoBlock(sx, top, hgt * 0.6, '#3a3f6f', '#242850', '#2e3360');
    const by = top - 2;
    line(sx, by + 6, sx, by - 14, 4, PAL.chromeDark);
    ctx.save(); ctx.translate(sx, by - 16); ctx.rotate(Math.sin(t * 0.01 + x) * 0.5 - 0.5);
    ell(0, 0, 26, 12, PAL.chrome); ell(0, 1, 22, 9, '#e8eef4'); line(0, 0, 0, -22, 2, PAL.chromeDark); circ(0, -23, 3, PAL.red); ctx.restore();
    circ(sx + 14, top + hgt * 0.6 + TILE_H * 0.7, 2.6, Math.sin(t * 0.1 + y) > 0 ? PAL.atom : '#27323d');
  },
  target(sx, top, hgt) { // a wooden target board
    isoBlock(sx, top, hgt, '#a0713a', '#6a4620', '#845a2c');
    for (const [cx, cy, rot] of [[sx - TILE_W / 4, top + TILE_H * 0.78 + 8, -0.55], [sx + TILE_W / 4, top + TILE_H * 0.78 + 8, 0.55]]) {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(0.55, 1); ctx.rotate(0);
      circ(0, 0, 14, '#f3e9c9'); circ(0, 0, 10, PAL.red); circ(0, 0, 6, '#f3e9c9'); circ(0, 0, 3, PAL.red); ctx.restore();
    }
    line(sx - 16, top + 6, sx + 16, top + 14, 3, '#5a3a18'); poly([sx + 18, top + 8, sx + 32, top + 10, sx + 22, top + 18], PAL.red); // a stuck dart with a flight
  },
  counter(sx, top, hgt) { // a diner counter with a milkshake
    isoBlock(sx, top, hgt * 0.7, '#e88aa8', '#a34a68', '#c86788');
    isoTop(sx, top - 2, '#dfe8f0'); line(sx - TILE_W / 2, top + TILE_H / 2 + hgt * 0.7 - 6, sx, top + TILE_H + hgt * 0.7 - 6, 3, PAL.chrome);
    rrect(sx - 4, top - 12, 9, 15, 2, 'rgba(255,255,255,0.8)'); rrect(sx - 3, top - 7, 7, 9, 1, '#ff8ab8'); circ(sx + 0.5, top - 14, 3, PAL.red); // a milkshake
    ell(sx - 18, top + hgt * 0.7 + TILE_H * 0.65, 8, 4, PAL.red); line(sx - 18, top + hgt * 0.7 + TILE_H * 0.65 + 3, sx - 18, top + hgt * 0.7 + TILE_H * 0.65 + 14, 3, PAL.chrome); // a stool
  },
  gantry(sx, top, hgt) { // a lattice launch tower
    ctx.strokeStyle = '#d9532a'; ctx.lineWidth = 4; ctx.lineCap = 'butt';
    const w = TILE_W / 2 - 8, by = top + hgt + TILE_H * 0.5;
    ctx.beginPath(); ctx.moveTo(sx - w, by); ctx.lineTo(sx - w, top + 10); ctx.moveTo(sx + w, by); ctx.lineTo(sx + w, top + 10); ctx.moveTo(sx, by + 14); ctx.lineTo(sx, top + 22); ctx.stroke();
    ctx.lineWidth = 2.4; ctx.beginPath();
    for (let k = 0; k < 4; k++) { const y0 = top + 12 + k * ((hgt - 6) / 4), y1 = y0 + (hgt - 6) / 4; ctx.moveTo(sx - w, y0 + 20); ctx.lineTo(sx + w, y1 + 20); ctx.moveTo(sx + w, y0 + 20); ctx.lineTo(sx - w, y1 + 20); }
    ctx.stroke();
    rrect(sx - w - 2, top + 6, w * 2 + 4, 8, 2, '#f08a4a'); circ(sx, top + 2, 3, PAL.red);
  },
  tesla(sx, top, hgt, t, x, y, room) { // a tesla coil on a stubby plinth, arcing to its neighbours
    isoBlock(sx, top + hgt * 0.55, hgt * 0.45, '#4a5568', '#2a3342', '#394255');
    const tip = drawTeslaCoil(sx, top + hgt * 0.55 + TILE_H * 0.5 + 2, hgt * 0.95 + 26, t, x * 3 + y);
    const here = { x: sx, y: tip.y };
    drawCrackle(tip, t, x * 5 + y * 3);
    const o = roomOrigin(room);
    for (const [nx, ny] of [[x + 1, y], [x, y + 1]]) {
      if (!inBounds(room, nx, ny) || !room.wall[ny][nx] || !arcOn(t, x + ny)) continue;
      const p = project(o, nx, ny);
      drawArc(here.x, here.y + 3, p.sx, p.sy - (hgt * 0.95 + 26) + TILE_H * 0.5 + (hgt * 0.55 + 2) + 0 + 4, t, x * 7 + nx + ny, 2);
    }
  },
  shelf(sx, top, hgt) { // storeroom shelving, full of boxes
    isoBlock(sx, top, hgt, '#7a5230', '#4a3018', '#624020');
    for (let k = 0; k < 3; k++) {
      const y = top + TILE_H / 2 + 10 + k * 15;
      line(sx - TILE_W / 2 + 4, y + 3, sx - 4, y + TILE_H / 2 + 3, 2, '#2a1a0a');
      for (let b = 0; b < 3; b++) rrect(sx - TILE_W / 2 + 6 + b * 9, y - 6 + b * 4.5, 8, 8, 1, ['#c9a46a', '#d9532a', '#6aa0c8'][(b + k) % 3]);
      for (let b = 0; b < 2; b++) rrect(sx + 6 + b * 10, y + 2 - b * 3, 8, 8, 1, ['#c9a46a', '#f2c94c', '#8a5a9a'][(b + k) % 3]);
    }
  },
  lamp(sx, top, hgt, t, x, y) { // a lounge cabinet with a lava lamp
    isoBlock(sx, top + hgt * 0.4, hgt * 0.6, '#5a2a6a', '#34183f', '#46204f');
    const by = top + hgt * 0.4, ly = by - 4;
    rrect(sx - 7, ly - 30, 14, 34, 6, 'rgba(255,140,200,0.35)'); rrect(sx - 7, ly + 2, 14, 5, 2, PAL.chromeDark);
    for (let k = 0; k < 3; k++) circ(sx + Math.sin(t * 0.03 + k * 2 + x) * 3, ly - 6 - k * 9 + Math.sin(t * 0.04 + k + y) * 4, 4.5 - k * 0.8, 'rgba(255,90,170,0.9)');
    ctx.save(); ctx.shadowColor = '#ff5aaa'; ctx.shadowBlur = 14; circ(sx, ly - 14, 2, 'rgba(255,200,230,0.6)'); ctx.restore();
  },
  plant(sx, top, hgt, t, x, y) { // an enormous potted plant
    const potY = top + hgt + TILE_H * 0.35;
    rrect(sx - 14, potY - 14, 28, 16, 3, '#b8562a'); ell(sx, potY - 14, 14, 5, '#d9743a'); ell(sx, potY - 14, 11, 3.5, '#4a2a14');
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI / 2 + (k - 3) * 0.5 + Math.sin(t * 0.02 + k + x) * 0.05, len = 34 + (k % 3) * 12;
      ctx.save(); ctx.translate(sx, potY - 14); ctx.rotate(a + Math.PI / 2);
      ell(0, -len / 2, 7, len / 2, ['#2f9e4a', '#3cb85a', '#278a3e'][k % 3]); line(0, 0, 0, -len, 1.2, 'rgba(255,255,255,0.35)'); ctx.restore();
    }
    circ(sx + 12, potY - 62, 5, '#ff7ab8'); circ(sx + 12, potY - 62, 2, '#ffe066');
  },
  gear(sx, top, hgt, t, x, y) { // a vault wall: dark steel with a great turning gear
    isoBlock(sx, top, hgt, '#4a4a52', '#2a2a30', '#38383f');
    ctx.save(); ctx.translate(sx + TILE_W / 4, top + TILE_H * 0.78 + 6); ctx.scale(0.6, 1);
    gearShape(0, 0, 17, 10, t * 0.02 * ((x + y) % 2 ? 1 : -1), '#d9a82a'); circ(0, 0, 5, '#4a4a52'); ctx.restore();
    rrect(sx - TILE_W / 2 + 8, top + TILE_H / 2 + 10, 14, 6, 2, '#d9a82a'); circ(sx - 16, top + TILE_H + 8, 2.4, Math.sin(t * 0.09 + x) > 0 ? PAL.red : '#3a1a1a');
  },
};

function drawWallTile(room, x, y, o, t) {
  const { sx, sy } = project(o, x, y);
  const style = themeOf(room).wall;
  const hgt = (style === 'tesla' ? 2.0 : WALL_LEVELS) * LEVEL_H, top = sy - hgt;
  const edge = (nx, ny) => (inBounds(room, nx, ny) ? 0 : SLAB);
  // the base slab below every kind of wall, so the room's edge looks solid
  const slab = Math.max(edge(x, y + 1), edge(x + 1, y));
  if (slab) isoBlock(sx, sy, 0, 'rgba(0,0,0,0)', darker(themeOf(room).floor[0], 0.5), darker(themeOf(room).floor[0], 0.34));
  WALL_DRAW[style](sx, top, hgt + slab, t, x, y, room);
}

function drawPlate(room, x, y, o, pressed) {
  const { sx, sy } = project(o, x, y);
  const top = sy - room.h[y][x] * LEVEL_H, cy = top + TILE_H / 2;
  ell(sx, cy, 17, 8.5, '#33485e');
  ell(sx, cy - (pressed ? 0 : 1.5), 14, 7, pressed ? '#3fbf5a' : '#d93a3a');
  ell(sx - 3, cy - (pressed ? 1 : 3), 6, 2.6, 'rgba(255,255,255,0.4)');
}

function drawDoorTile(game, room, x, y, o, t) {
  const { sx, sy } = project(o, x, y);
  const closed = doorClosed(game, room, x, y), L = room.doorAt[y][x];
  const level = room.h[y][x], base = sy - level * LEVEL_H;
  if (closed) {
    const hgt = LEVEL_H * 1.7, top = base - hgt;
    isoBlock(sx, top, hgt, '#f3e9c9', '#bfb28b', '#d9cca2');
    for (let k = 0; k < 3; k++) { // chevrons
      const yy = top + TILE_H + 8 + k * 9;
      poly([sx + 4, yy, sx + 22, yy - 6, sx + 22, yy - 1, sx + 4, yy + 5], k % 2 ? PAL.orange : PAL.mustard);
    }
    circ(sx - TILE_W / 4, top + TILE_H * 0.75 + 4, 4, PAL.red);
    text(L, sx, top + TILE_H / 2, 13, '#7a4a10', 'center', TITLE_FONT);
  } else { // the door has slid down into the floor: tracks and a green light
    const cy = base + TILE_H / 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(sx - 14, cy - 5, 28, 10);
    circ(sx, cy, 3.4, '#3fbf5a');
  }
}

function drawVent(room, vent, o, game, t) {
  const { sx, sy } = project(o, vent.x, vent.y);
  const top = sy - room.h[vent.y][vent.x] * LEVEL_H, cy = top + TILE_H / 2;
  const plugged = room.crates[vent.y][vent.x] > 0;
  ell(sx, cy, 17, 8.5, '#1b2530');
  for (let k = -2; k <= 2; k++) line(sx + k * 5 - 3, cy - 5, sx + k * 5 + 3, cy + 5, 1.6, '#475a6c');
  if (plugged) return;
  const st = ventState(vent, game.elapsed);
  if (st === 'warn') {
    const f = Math.floor(t / 5) % 2 === 0;
    ell(sx, cy, 17, 8.5, f ? 'rgba(242,116,42,0.7)' : 'rgba(242,116,42,0.25)');
    for (let k = 0; k < 3; k++) circ(sx + (k - 1) * 5, cy - 8 - ((t * 0.6 + k * 7) % 18), 2.4, 'rgba(255,255,255,0.5)');
  } else if (st === 'on') {
    for (let k = 0; k < 9; k++) {
      const up = (t * 3 + k * 9) % 70;
      circ(sx + Math.sin(k * 2 + t * 0.2) * 5, cy - 4 - up, 7 - up * 0.07, `rgba(220,245,255,${0.75 - up / 110})`);
    }
    ell(sx, cy, 17, 8.5, 'rgba(180,230,255,0.75)');
  } else {
    circ(sx + Math.sin(t * 0.1) * 2, cy - 8 - ((t * 0.3) % 8), 1.8, 'rgba(255,255,255,0.3)');
  }
}

function drawExitMarker(room, dir, at, o, t) {
  const [x, y] = exitTile(room.spec, dir, at);
  const { sx, sy } = project(o, x, y);
  const top = sy - room.h[y][x] * LEVEL_H, cx = sx, cy = top + TILE_H / 2;
  // screen direction of leaving: N is up-right, E is down-right, S is down-left, W is up-left
  const v = { N: [1, -0.5], E: [1, 0.5], S: [-1, 0.5], W: [-1, -0.5] }[dir];
  const len = Math.hypot(v[0], v[1]), ux = v[0] / len, uy = v[1] / len, px = -uy, py = ux;
  const pulse = 0.65 + 0.35 * Math.sin(t * 0.12);
  for (let k = 0; k < 2; k++) {
    const d = -6 + k * 11;
    const bx = cx + ux * d * 1.2, by = cy + uy * d * 0.8;
    poly([bx + ux * 9, by + uy * 5, bx + px * 11, by + py * 6, bx + px * 11 - ux * 4, by + py * 6 - uy * 2.5, bx + ux * 4, by + uy * 2.5, bx - px * 11 - ux * 4, by - py * 6 - uy * 2.5, bx - px * 11, by - py * 6],
      `rgba(242,185,35,${pulse * (0.55 + k * 0.4)})`);
  }
}

// ---- the rocket on its launch pad ----
function drawRocket(game, room, o, t) {
  const { sx, sy } = project(o, room.rocket.x, room.rocket.y);
  const cx = sx, base = sy + TILE_H / 2;
  const have = new Set(game.delivered);
  const ghost = (fn) => { ctx.save(); ctx.globalAlpha = 0.22; ctx.setLineDash([4, 4]); fn(); ctx.restore(); };
  ell(cx, base + 4, 38, 15, 'rgba(0,0,0,0.35)');
  ell(cx, base, 34, 13, '#5a6a7c'); ell(cx, base - 3, 30, 11, '#8d99a8'); // the pad
  ctx.save(); ctx.translate(cx, base - 4);
  // body (the fuel tank section)
  const body = () => { rrect(-14, -78, 28, 66, 12, PAL.cream); rrect(-14, -78, 11, 66, 10, '#fff'); rect_band(-14, -56, 28, 5, PAL.orange); rect_band(-14, -36, 28, 5, PAL.orange); };
  const nose = () => { poly([0, -128, 14, -78, -14, -78], PAL.red); poly([0, -128, 5, -78, -3, -78], '#f06a6a'); };
  const fins = () => { poly([-14, -22, -34, 6, -14, -4], PAL.chrome); poly([14, -22, 34, 6, 14, -4], PAL.chromeDark); poly([0, -20, 0, 8, 6, -4], PAL.chrome); };
  const port = () => { circ(0, -64, 9, PAL.chrome); circ(0, -64, 6, '#7fd6ff'); circ(-2, -66, 2, 'rgba(255,255,255,0.8)'); };
  const panel = () => { rrect(-9, -46, 18, 9, 2, '#3a4a5c'); circ(-4, -41.5, 1.5, PAL.atom); circ(0, -41.5, 1.5, PAL.red); circ(4, -41.5, 1.5, PAL.mustard); };
  const battery = () => { rrect(-6, -24, 12, 14, 2, '#2a3a2a'); ctx.shadowColor = PAL.atom; ctx.shadowBlur = 10; circ(0, -17, 3.4, PAL.atom); ctx.shadowBlur = 0; };
  (have.has('tank') ? body : () => ghost(body))();
  (have.has('nose') ? nose : () => ghost(nose))();
  (have.has('fins') ? fins : () => ghost(fins))();
  (have.has('porthole') ? port : () => ghost(port))();
  (have.has('panel') ? panel : () => ghost(panel))();
  (have.has('battery') ? battery : () => ghost(battery))();
  if (have.size === PARTS.length) { // all there: a nervous glow
    ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 0.2); ell(0, -50, 30, 70, 'rgba(255,240,170,0.25)');
  }
  ctx.restore();
}

// ---- drawing in a role (see the monochrome look in sprites.js) ----
const OUTLINE = [[-2, 0], [2, 0], [0, -2], [0, 2], [-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]];
function withRole(kind, fn) {
  if (!look.supported) { fn(); return; }
  try {
    if (kind === 'actor') { // a dark outline behind anything that moves, strong in monochrome and soft in colour
      const strong = look.mono;
      for (const [dx, dy] of (strong ? OUTLINE : OUTLINE.slice(0, 4))) {
        ctx.save(); ctx.translate(dx * (strong ? 1 : 0.75), dy * (strong ? 1 : 0.75)); if (!strong) ctx.globalAlpha *= 0.5;
        look.role = 'ink'; fn(); look.role = null; ctx.restore();
      }
    }
    look.role = look.mono ? kind : null; fn();
  } finally { look.role = null; }
}
// what a thing is, from its draw layer: floors, walls and scenery; then interactive scenery; then things that move
function kindOf(layer) { return layer < 0.5 ? 'scenery' : layer < 1.5 || layer === 2.5 ? 'accent' : 'actor'; }

// ---- the whole room ----
function renderRoom(game, t) {
  const room = cur(game), o = roomOrigin(room), hero = game.hero;
  const items = []; // [depth, layer, draw]
  for (let y = 0; y < room.H; y++) for (let x = 0; x < room.W; x++) {
    const d = x + y;
    if (room.wall[y][x]) items.push([d, 0, () => drawWallTile(room, x, y, o, t), `${x},${y}`]);
    else if (room.pit[y][x]) items.push([d, 0, () => drawPitTile(room, x, y, o, t)]);
    else {
      items.push([d, 0, () => drawFloorTile(room, x, y, o, t), `${x},${y}`]);
      if (room.plateAt[y][x]) {
        const letter = room.plateAt[y][x].toUpperCase();
        items.push([d, 0.5, () => drawPlate(room, x, y, o, doorOpen(game, room, letter))]);
      }
      if (room.doorAt[y][x]) items.push([d, 1, () => drawDoorTile(game, room, x, y, o, t)]);
    }
  }
  for (const [dir, at] of Object.entries(room.spec.exits)) { const [x, y] = exitTile(room.spec, dir, at); items.push([x + y, 0.6, () => drawExitMarker(room, dir, at, o, t)]); }
  for (const v of room.vents) items.push([v.x + v.y, 0.7, () => drawVent(room, v, o, game, t)]);
  const th = themeOf(room);
  th.props.forEach((prop, i) => items.push([prop.x + prop.y, 0.2, () => {
    const { sx, sy } = project(o, prop.x, prop.y);
    const tip = drawTeslaCoil(sx, sy + TILE_H / 2 + 4, 108, t, i * 11 + 3);
    drawCrackle(tip, t, i * 7 + 1);
  }]));
  th.arcs.forEach(([a, b], k) => items.push([Math.max(th.props[a].x + th.props[a].y, th.props[b].x + th.props[b].y) + 0.3, 2.5, () => {
    if (!arcOn(t, k)) return;
    const pa = project(o, th.props[a].x, th.props[a].y), pb = project(o, th.props[b].x, th.props[b].y);
    drawArc(pa.sx, pa.sy + TILE_H / 2 + 4 - 104, pb.sx, pb.sy + TILE_H / 2 + 4 - 104, t, k * 9, 2.4);
  }]));
  if (room.rocket) items.push([room.rocket.x + room.rocket.y, 2, () => drawRocket(game, room, o, t)]);
  // crates (a sliding one is drawn part-way along its push)
  for (let y = 0; y < room.H; y++) for (let x = 0; x < room.W; x++) {
    for (let k = 0; k < room.crates[y][x]; k++) {
      const slide = app.view.crateSlide && app.view.crateSlide.toX === x && app.view.crateSlide.toY === y && k === room.crates[y][x] - 1 ? app.view.crateSlide : null;
      items.push([x + y + (slide ? (slide.fromX + slide.fromY - x - y) * (1 - slide.p) : 0), 1.5 + k * 0.01, () => {
        let gx = x, gy = y, lift = (room.h[y][x] + k) * LEVEL_H;
        if (slide) { gx = slide.fromX + (x - slide.fromX) * slide.p; gy = slide.fromY + (y - slide.fromY) * slide.p; lift = lift + (slide.dropFrom - 0) * 0 + slide.dz * (1 - slide.p); }
        const { sx, sy } = project(o, gx, gy);
        drawCrateAt(sx, sy - lift - LEVEL_H);
      }]);
    }
  }
  for (const part of room.parts) if (!part.taken) items.push([part.x + part.y, 2, () => { const { sx, sy } = project(o, part.x, part.y); drawPart(part.id, sx, sy - room.h[part.y][part.x] * LEVEL_H + TILE_H / 2, t); }]);
  for (const r of room.robots) {
    const f = Math.min(1, r.t / (ROBOT_STEP * 0.4));
    const gx = r.px + (r.x - r.px) * f, gy = r.py + (r.y - r.py) * f;
    items.push([gx + gy + 0.2, 3, () => { const { sx, sy } = project(o, gx, gy); drawRobot(sx, sy - (room.h[r.y][r.x]) * LEVEL_H + TILE_H / 2 + 4, r.dir, t); }]);
  }
  // the hero
  const hv = app.view.hero;
  const drawHero = () => {
    if (game.invuln > 0 && Math.floor(t / 4) % 2) return;
    const { sx, sy } = project(o, hv.x, hv.y);
    const arc = hv.air > 0 ? Math.sin((1 - hv.air / HOP_TIME) * Math.PI) * 16 : 0;
    const gy = sy - hv.z * LEVEL_H + TILE_H / 2 + 4;
    ctx.save(); ctx.strokeStyle = `rgba(255,224,120,${0.55 + 0.25 * Math.sin(t * 0.15)})`; ctx.lineWidth = 2.5; // a glowing ring so you are easy to find
    ctx.beginPath(); ctx.ellipse(sx, gy, 17, 7.5, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    drawApprentice(sx, gy - arc, hero.face, t, { moving: hv.moving, air: false });
  };
  items.push([hv.x + hv.y + 0.3, 3.5, drawHero]);
  items.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  look.hue = th.mono;
  const fade = new Set(heroOccluders(game).map((c) => `${c.x},${c.y}`)); // whatever stands in front of you is drawn see-through
  for (const it of items) {
    if (it[3] && fade.has(it[3])) { ctx.save(); ctx.globalAlpha = 0.6; withRole(kindOf(it[1]), it[2]); ctx.restore(); }
    else withRole(kindOf(it[1]), it[2]);
  }
}

// The wall and raised-floor squares that cover the hero (crates are left solid), judged on screen (from the squares in front of the hero).
function heroOccluders(game) {
  const room = cur(game), o = roomOrigin(room), hv = app.view.hero;
  const hp = project(o, hv.x, hv.y), hx = hp.sx, hy = hp.sy - hv.z * LEVEL_H + TILE_H / 2 + 4;
  const rect = { x0: hx - 12, x1: hx + 12, y0: hy - 54, y1: hy };
  const depth = hv.x + hv.y, found = [];
  for (let y = 0; y < room.H; y++) for (let x = 0; x < room.W; x++) {
    if (x + y <= depth + 0.4 || x + y > depth + 4) continue;
    if (room.pit[y][x]) continue;
    const wall = room.wall[y][x];
    if (!wall && room.h[y][x] <= hv.z + 0.6) continue; // a floor no higher than the hero's feet hides nothing
    const p = project(o, x, y), body = wall ? WALL_LEVELS * LEVEL_H : room.h[y][x] * LEVEL_H;
    if (p.sx - TILE_W / 2 < rect.x1 && p.sx + TILE_W / 2 > rect.x0 && p.sy - body < rect.y1 - 6 && p.sy + TILE_H > rect.y0) found.push({ x, y });
  }
  return found;
}
function heroHidden(game) { return heroOccluders(game).length > 0; }

// ---- HUD ----
function formatTime(s) { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

function drawPartIcon(id, x, y, scale, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(scale, scale);
  const parts = {
    nose() { poly([0, -26, 8, -6, -8, -6], PAL.red); ell(0, -6, 8, 2.4, '#a02424'); },
    fins() { poly([-11, 0, -3, -20, 2, -20, 2, -3], PAL.chrome); poly([11, 0, 3, -20, -2, -20, -2, -3], PAL.chromeDark); },
    panel() { rrect(-11, -18, 22, 15, 2.5, '#3a4a5c'); for (let i = 0; i < 3; i++) circ(-6 + i * 6, -12, 2, [PAL.red, PAL.atom, PAL.mustard][i]); },
    tank() { rrect(-6, -24, 12, 22, 5, PAL.cream); rect_band(-6, -16, 12, 3, PAL.orange); },
    porthole() { circ(0, -11, 10, PAL.chrome); circ(0, -11, 6.5, '#7fd6ff'); },
    battery() { rrect(-6, -21, 12, 18, 2.5, '#2a3a2a'); circ(0, -11, 3.6, PAL.atom); },
  };
  parts[id]();
  ctx.restore();
}

function drawHUD(game) {
  // top bar
  const g = ctx.createLinearGradient(0, 0, 0, 62);
  g.addColorStop(0, '#0e1d3a'); g.addColorStop(1, '#091428');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, 62);
  ctx.fillStyle = PAL.orange; ctx.fillRect(0, 60, VIEW_W, 3);
  for (let x = 0; x < VIEW_W; x += 22) poly([x, 60, x + 12, 60, x + 20, 63, x + 8, 63], '#111');
  text('SAUCERS ARRIVE IN', 20, 17, 12, '#8fb4e8', 'left', FONT);
  text(formatTime(game.time), 20, 42, 34, game.time < 60 ? '#ff5a4a' : '#fff6c8', 'left', TITLE_FONT);
  fitText(cur(game).spec.name.toUpperCase(), VIEW_W / 2, 32, 360, 30, PAL.tealLight, 'center', TITLE_FONT, true);
  // mini-map
  const mx = VIEW_W - 130, my = 8;
  ROOMS.forEach((r, i) => {
    const x = mx + r.col * 29, y = my + r.row * 16;
    const seen = game.seen.has(i), here = game.hero.room === i;
    rrect(x, y, 26, 13, 3, here ? PAL.orange : seen ? '#3a5a8a' : '#18263f');
    if (r.id === 'launch') text('R', x + 13, y + 7, 10, '#fff', 'center');
    const part = PARTS.find((p) => p.room === r.id);
    if (part && seen && !game.delivered.includes(part.id) && !game.rooms[i].parts[0].taken) circ(x + 20, y + 6.5, 2.4, PAL.atom);
  });
  // bottom bar
  ctx.fillStyle = '#091428'; ctx.fillRect(0, 622, VIEW_W, 66);
  ctx.fillStyle = PAL.orange; ctx.fillRect(0, 622, VIEW_W, 3);
  text('CARRYING', 18, 640, 11, '#8fb4e8', 'left', FONT);
  for (let i = 0; i < CARRY_MAX; i++) {
    rrect(86 + i * 40, 628, 36, 28, 5, 'rgba(255,255,255,0.08)');
    const id = game.hero.carry[i];
    if (id) drawPartIcon(id, 104 + i * 40, 653, 0.95);
  }
  text('ROCKET', 232, 640, 11, '#8fb4e8', 'left', FONT);
  PARTS.forEach((p, i) => {
    const have = game.delivered.includes(p.id);
    rrect(286 + i * 34, 628, 30, 28, 5, have ? 'rgba(125,255,106,0.18)' : 'rgba(255,255,255,0.06)');
    drawPartIcon(p.id, 301 + i * 34, 653, 0.8, have ? 1 : 0.25);
  });
  text('Arrows: walk and push   Space: hop   R: reset room (-10s)   V: look   P: pause', VIEW_W - 16, 640, 12, '#8fb4e8', 'right', FONT);
  const cap = app.caption;
  if (cap) {
    ctx.globalAlpha = Math.min(1, cap.ttl / 25);
    fitText(cap.text, VIEW_W / 2, 667, VIEW_W - 60, 17, '#fff6c8', 'center', FONT);
    ctx.globalAlpha = 1;
  }
}

// ---- screens ----
function drawSaucer(x, y, t, s = 1) {
  ctx.save(); ctx.translate(x, y + Math.sin(t * 0.05 + x) * 4); ctx.scale(s, s);
  ell(0, 4, 38, 7, 'rgba(0,0,0,0.25)');
  ell(0, -4, 36, 11, PAL.chrome); ell(0, -7, 36, 8, '#e8eef4'); ell(0, -4, 36, 11, 'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.ellipse(0, -4, 36, 11, 0, 0, Math.PI); ctx.fillStyle = PAL.chromeDark; ctx.fill();
  ell(0, -14, 14, 11, 'rgba(120,230,255,0.75)'); ell(-4, -17, 4, 3, 'rgba(255,255,255,0.7)');
  for (let k = -2; k <= 2; k++) circ(k * 13, -1, 2.2, [PAL.red, PAL.mustard, PAL.atom, PAL.mustard, PAL.red][k + 2]);
  ctx.restore();
}

function drawBigRocket(x, base, scale, t, flame) {
  ctx.save(); ctx.translate(x, base); ctx.scale(scale, scale);
  if (flame) {
    for (let k = 0; k < 6; k++) { const f = 30 + Math.random() * 30 + k * 4; ell(0, 8 + f / 2, 14 - k * 1.6, f / 1.4, `rgba(${255},${190 - k * 25},${40},${0.7 - k * 0.1})`); }
  }
  poly([-14, -22, -38, 8, -14, -2], PAL.chrome); poly([14, -22, 38, 8, 14, -2], PAL.chromeDark);
  rrect(-16, -92, 32, 90, 14, PAL.cream); rrect(-16, -92, 12, 90, 12, '#fff'); rect_band(-16, -68, 32, 6, PAL.orange); rect_band(-16, -42, 32, 6, PAL.orange);
  poly([0, -150, 16, -92, -16, -92], PAL.red); poly([0, -150, 6, -92, -4, -92], '#f06a6a');
  circ(0, -76, 10, PAL.chrome); circ(0, -76, 7, '#7fd6ff'); circ(-2.5, -78.5, 2.4, 'rgba(255,255,255,0.8)');
  ctx.restore();
}

function drawTitleScreen() {
  const t = app.tick;
  drawSpace(t);
  drawSaucer(150, 130, t, 1.2); drawSaucer(840, 70, t + 40, 0.8);
  // the castle: a rocket-age skyline of towers, domes and dishes
  for (const [x, w, h] of [[40, 70, 130], [130, 90, 190], [250, 60, 110], [330, 80, 160], [470, 70, 120], [560, 60, 150], [900, 90, 170]]) {
    ctx.fillStyle = '#10213f'; ctx.fillRect(x, 580 - h, w, h);
    ell(x + w / 2, 580 - h, w / 2, 15, '#16294d');
    for (let k = 0; k < 3; k++) circ(x + 14 + k * ((w - 28) / 2), 580 - h + 34 + (k % 2) * 26, 3, k % 2 ? PAL.mustard : '#7fd6ff');
  }
  ctx.fillStyle = '#0a1630'; ctx.fillRect(0, 580, VIEW_W, 108);
  ctx.fillStyle = PAL.orange; ctx.fillRect(0, 580, VIEW_W, 3);
  drawBigRocket(770, 620, 1.55, t, false);
  text('ATOMIC', VIEW_W / 2, 78, 100, PAL.orange, 'center', TITLE_FONT, true);
  text('CASTLE', VIEW_W / 2, 168, 100, PAL.tealLight, 'center', TITLE_FONT, true);
  text("The Professor's rocket is missing six parts. The saucers land at dawn.", VIEW_W / 2, 238, 20, '#dfe8ff', 'center');
  if (app.mode === 'title') {
    rrect(70, 290, 520, 230, 22, 'rgba(8,16,38,0.78)');
    if (Math.floor(t / 30) % 2 === 0) text('PRESS ENTER OR CLICK TO PLAY', 330, 336, 26, '#fff', 'center', FONT, true);
    text('Push crates. Hop gaps. Dodge robots. Rebuild a rocket.', 330, 384, 16, '#bcd0ff', 'center');
    rrect(220, 420, 220, 42, 12, '#24406e'); text('How to play  (H)', 330, 441, 19, '#fff', 'center');
    app.hits.push({ id: 'help', x: 220, y: 420, w: 220, h: 42 });
    app.hits.push({ id: 'start', x: 0, y: 0, w: VIEW_W, h: VIEW_H, under: true });
    if (!Sound.ctx && !Sound.unsupported) text('Press any key for music', 330, 486, 13, '#8fb4e8', 'center');
    text(`V: switch the look (now ${look.mono ? 'monochrome' : 'colour'})`, 330, 528 - 2, 13, '#8fb4e8', 'center');
    if (app.best) text(`Best launch: ${formatTime(app.best)} to spare`, 330, 506, 14, PAL.mustard, 'center');
  }
}

const HELP_PAGES = 3;
function helpFrame(title, page) {
  drawSpace(app.tick);
  rrect(48, 40, 928, 608, 20, 'rgba(8,16,38,0.96)');
  ctx.strokeStyle = PAL.orange; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(48, 40, 928, 608, 20); ctx.stroke();
  text(title, 512, 84, 40, PAL.tealLight, 'center', TITLE_FONT, true);
  const last = page === HELP_PAGES - 1;
  if (page > 0) { rrect(72, 596, 150, 40, 10, '#24406e'); text('Back', 147, 616, 18, '#fff', 'center'); app.hits.push({ id: 'helpPrev', x: 72, y: 596, w: 150, h: 40 }); }
  rrect(802, 596, 150, 40, 10, last ? PAL.mustard : '#4fd16a'); text(last ? 'To the castle!' : 'Next', 877, 616, 17, '#12210e', 'center'); app.hits.push({ id: 'helpNext', x: 802, y: 596, w: 150, h: 40 });
  for (let i = 0; i < HELP_PAGES; i++) circ(512 + (i - 1) * 22, 616, i === page ? 6 : 4, i === page ? PAL.orange : '#456');
  text('Left and Right arrows turn the page. Esc goes back.', 512, 640, 12, '#8fb4e8', 'center');
}
function para(str, x, y, maxW, size, color, lineH = size + 6) {
  ctx.font = `${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.letterSpacing = '0px';
  const lines = wrapLines(str, maxW);
  lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lineH));
  return y + lines.length * lineH;
}

function drawHelp() {
  const page = app.help.page, t = app.tick;
  if (page === 0) {
    helpFrame('The mission', 0);
    let y = para("Professor Zenith has vanished in the middle of an experiment. His rocket sits in the Launch Bay, missing six parts, scattered through the castle by robots with strong opinions about tidiness.", 90, 140, 844, 20, '#dfe8ff', 27);
    y = para('Bring all six parts back and launch before the flying saucers arrive. You have ten minutes. Nobody asked you to do this, but here you are.', 90, y + 10, 844, 20, '#dfe8ff', 27);
    const items = [['nose', 'Nose Cone'], ['fins', 'Fins'], ['panel', 'Control Panel'], ['tank', 'Fuel Tank'], ['porthole', 'Porthole'], ['battery', 'Atomic Battery']];
    items.forEach(([id, name], i) => { const x = 150 + i * 150; drawPart(id, x, 410 + Math.sin(t * 0.05 + i) * 2, t + i * 10); text(name, x, 440, 15, '#fff6c8', 'center'); });
    para('You can carry three parts at a time. Walk into the rocket in the Launch Bay to hand them over. A robot or a blast of steam costs you twenty seconds and sends you back to the door, but never ends the game. Only the clock does.', 90, 490, 844, 18, '#ffd9a8', 25);
  } else if (page === 1) {
    helpFrame('Pushing and climbing', 1);
    para('Walk into a crate to push it. It slides one square and you follow. Crates cannot be pushed uphill, but a crate pushed off a ledge drops down, and onto another crate if there is one below.', 90, 130, 844, 19, '#dfe8ff', 26);
    // a little diagram: you, a crate, a pit and a ledge
    ctx.save(); ctx.translate(380, 232); ctx.scale(1.6, 1.6);
    const o = { ox: 0, oy: 0 };
    const levels = [0, 0, 0, 0, 2, 2];
    for (let x = 0; x < 6; x++) {
      const { sx, sy } = project(o, x, 0), lv = levels[x], top = sy - lv * LEVEL_H;
      if (x === 3) { isoTop(sx, sy + LEVEL_H, '#04060f'); ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx - TILE_W / 2, sy + TILE_H / 2); ctx.lineTo(sx, sy); ctx.lineTo(sx + TILE_W / 2, sy + TILE_H / 2); ctx.stroke(); continue; }
      const face = lv > 0 ? lv * LEVEL_H + 10 : 10;
      poly([sx - TILE_W / 2, top + TILE_H / 2, sx, top + TILE_H, sx, top + TILE_H + face, sx - TILE_W / 2, top + TILE_H / 2 + face], lv > 0 ? '#9a8f6e' : '#176b66');
      poly([sx + TILE_W / 2, top + TILE_H / 2, sx, top + TILE_H, sx, top + TILE_H + face, sx + TILE_W / 2, top + TILE_H / 2 + face], lv > 0 ? '#b8ad8a' : '#1d857e');
      isoTop(sx, top, lv > 0 ? '#e6dcbc' : (x % 2 ? '#24a096' : '#2bb3a8'));
    }
    { const { sx, sy } = project(o, 1, 0); drawCrateAt(sx, sy - LEVEL_H); }
    { const { sx, sy } = project(o, 0, 0); drawApprentice(sx, sy + TILE_H / 2 + 4, 'E', t, {}); }
    ctx.restore();
    text('Push the crate along. Fill the pit, or hop it. Climb the crate to reach the ledge.', 512, 420, 16, '#fff6c8', 'center');
    text('Space hops: over a gap, a robot or a steam vent, or up onto a crate.', 512, 470, 18, PAL.tealLight, 'center');
    para('You climb one level on your own, so a crate then a ledge makes a staircase. To climb a crate, walk up to it and press Space (walking into it pushes it). Fill a pit by pushing a crate into it, and the crate becomes the floor.', 90, 510, 844, 18, '#dfe8ff', 25);
    text('Stuck? Press R to put the room back as it was. It costs ten seconds.', 512, 582, 16, '#ffd9a8', 'center');
  } else {
    helpFrame('Hazards and controls', 2);
    const rx = 150, ry = 250;
    ctx.save(); ctx.translate(rx, ry); ctx.scale(1.8, 1.8); drawRobot(0, 0, 'E', t); ctx.restore(); text('Tin robots', rx, ry + 34, 17, '#fff6c8', 'center');
    para('They patrol back and forth. Hop over them, or trap one behind a crate.', rx - 60, ry + 62, 200, 15, '#dfe8ff', 20);
    const px = 400;
    ctx.save(); ctx.translate(px, ry); ctx.scale(1.8, 1.8);
    ell(0, -2, 17, 8.5, '#1b2530'); for (let k = -2; k <= 2; k++) line(k * 5 - 3, -7, k * 5 + 3, 3, 1.6, '#475a6c');
    for (let k = 0; k < 6; k++) circ(Math.sin(k * 2 + t * 0.2) * 5, -8 - ((t * 3 + k * 9) % 60), 7, 'rgba(220,245,255,0.55)');
    ctx.restore();
    text('Steam vents', px, ry + 34, 17, '#fff6c8', 'center');
    para('They blast on a timer. Wait for the quiet, or plug one with a crate.', px - 70, ry + 62, 200, 15, '#dfe8ff', 20);
    const dx = 650;
    ctx.save(); ctx.translate(dx, ry); ctx.scale(1.8, 1.8); ell(0, 0, 16, 8, '#33485e'); ell(0, -1.5, 13, 6.5, '#d93a3a'); ell(-3, -3, 5, 2.4, 'rgba(255,255,255,0.4)'); ctx.restore();
    text('Plates and doors', dx, ry + 34, 17, '#fff6c8', 'center');
    para('A crate on a plate holds its matching door open.', dx - 70, ry + 62, 200, 15, '#dfe8ff', 20);
    const keys = [['Arrows or WASD', 'Walk, and push crates'], ['Space', 'Hop'], ['R', 'Reset the room (-10 s)'], ['V', 'Optional monochrome look'], ['P', 'Pause'], ['M', 'Sound on or off']];
    keys.forEach(([k, d], i) => { const y = 392 + i * 33; rrect(120, y - 14, 170, 28, 7, '#24406e'); text(k, 205, y, 15, '#fff', 'center'); text(d, 310, y, 16, '#dfe8ff', 'left'); });
    text('The arrows go along the room: Up goes up-right on screen, Right goes down-right.', 512, 598 - 4, 14, '#ffd9a8', 'center');
  }
}

function drawEndScreen(game, kind) {
  const t = app.tick;
  drawSpace(t);
  if (kind === 'win') {
    const rise = Math.min(1, app.endTimer / 140);
    drawBigRocket(512, 520 - rise * rise * 520, 1.6, t, true);
    text('LAUNCH!', 512, 110, 90, PAL.orange, 'center', TITLE_FONT, true);
    text('The rocket is away, with ' + formatTime(game.time) + ' to spare.', 512, 180, 24, '#fff6c8', 'center');
    text('The saucers will be so disappointed.', 512, 214, 18, '#dfe8ff', 'center');
    if (app.newBest) text('A new best!', 512, 250, 20, PAL.atom, 'center');
    ctx.fillStyle = '#0a1630'; ctx.fillRect(0, 560, VIEW_W, 128);
    ctx.fillStyle = PAL.orange; ctx.fillRect(0, 560, VIEW_W, 4);
  } else {
    drawSaucer(512, 250 + Math.sin(t * 0.04) * 6, t, 3);
    text('THE SAUCERS HAVE ARRIVED', 512, 110, 60, '#ff5a4a', 'center', TITLE_FONT, true);
    text('They are very disappointed in your timekeeping.', 512, 170, 22, '#fff6c8', 'center');
    text(`Parts delivered: ${game.delivered.length} of ${PARTS.length}`, 512, 420, 22, '#dfe8ff', 'center');
    PARTS.forEach((p, i) => drawPartIcon(p.id, 322 + i * 74, 480, 1.6, game.delivered.includes(p.id) ? 1 : 0.22));
  }
  if (app.endTimer > 60 && Math.floor(t / 30) % 2 === 0) text('Press Enter to try again', 512, 610, 24, '#fff', 'center', FONT, true);
  app.hits.push({ id: 'again', x: 0, y: 0, w: VIEW_W, h: VIEW_H });
}

function drawBriefing() {
  drawSpace(app.tick);
  rrect(130, 110, 764, 420, 20, 'rgba(8,16,38,0.95)');
  ctx.strokeStyle = PAL.orange; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(130, 110, 764, 420, 20); ctx.stroke();
  text('INCOMING TRANSMISSION', 512, 150, 34, PAL.orange, 'center', TITLE_FONT, true);
  const lines = [
    '"Greetings, apprentice. If you are reading this, I have either launched',
    'myself into orbit or lost my keys again. The rocket needs six parts.',
    'The robots have hidden them. I cannot imagine why.',
    'Do hurry. The saucers do not wait. They have never once waited."',
  ];
  lines.forEach((l, i) => text(l, 512, 215 + i * 34, 20, '#dfe8ff', 'center', FONT));
  text('Professor Zenith', 512, 380, 22, PAL.mustard, 'center', TITLE_FONT);
  drawApprentice(512, 470, 'S', app.tick, {});
  if (Math.floor(app.tick / 30) % 2 === 0) text('Press Enter to begin', 512, 510, 22, '#fff', 'center', FONT, true);
  app.hits.push({ id: 'begin', x: 0, y: 0, w: VIEW_W, h: VIEW_H });
}

function drawPauseOverlay() {
  ctx.fillStyle = 'rgba(5,10,28,0.7)'; ctx.fillRect(0, 62, VIEW_W, 560);
  text('PAUSED', 512, 300, 80, PAL.orange, 'center', TITLE_FONT, true);
  text('Press P or click to carry on', 512, 370, 22, '#fff', 'center');
  app.hits.push({ id: 'resume', x: 0, y: 0, w: VIEW_W, h: VIEW_H });
}

function renderFatal() {
  ctx.fillStyle = '#300'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  text('Something went wrong', VIEW_W / 2, 200, 34, '#fff', 'center');
  text(String(app.fatal.message || app.fatal), VIEW_W / 2, 270, 16, '#ffb0b0', 'center');
  text('See the browser console for details, then reload the page.', VIEW_W / 2, 320, 16, '#ffb0b0', 'center');
}

// ---- effects ----
function spawnDust(sx, sy, n = 8, col = 'rgba(255,255,255,0.7)') {
  for (let i = 0; i < n; i++) app.particles.push({ x: sx, y: sy, vx: (Math.random() - 0.5) * 2.4, vy: -Math.random() * 1.6, g: 0.05, life: 22 + Math.random() * 12, max: 34, size: 2 + Math.random() * 3, color: col });
}
function spawnSparks(sx, sy, n = 14, col = '#fff6a0') {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3; app.particles.push({ x: sx, y: sy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, g: 0.08, life: 26 + Math.random() * 16, max: 42, size: 2 + Math.random() * 2.5, color: col, star: true }); }
}
function updateEffects() {
  for (const p of app.particles) { p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life--; }
  app.particles = app.particles.filter((p) => p.life > 0);
  if (app.caption && --app.caption.ttl <= 0) app.caption = null;
}
function drawParticles() {
  for (const p of app.particles) {
    ctx.globalAlpha = Math.max(0, p.life / (p.max * 0.7));
    if (p.star) star(p.x, p.y, p.size * 1.6, p.color, 4); else circ(p.x, p.y, p.size, p.color);
  }
  ctx.globalAlpha = 1;
}

function render() {
  app.hits = [];
  if (app.fatal) { renderFatal(); return; }
  if (app.mode === 'title') drawTitleScreen();
  else if (app.mode === 'help') drawHelp();
  else if (app.mode === 'brief') drawBriefing();
  else if (app.mode === 'win' || app.mode === 'lose') drawEndScreen(app.game, app.mode);
  else {
    look.hue = themeOf(cur(app.game)).mono;
    withRole('scenery', () => drawSpace(app.tick, themeOf(cur(app.game))));
    if (!look.mono) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0, 63, VIEW_W, 559); } // calm the backdrop so the room stands out
    renderRoom(app.game, app.tick);
    withRole('accent', drawParticles);
    drawHUD(app.game);
    if (app.mode === 'paused') drawPauseOverlay();
    if (app.flash > 0) { ctx.fillStyle = `rgba(255,70,50,${app.flash * 0.4})`; ctx.fillRect(0, 62, VIEW_W, 560); }
  }
}
