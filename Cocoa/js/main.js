'use strict';

// Cocoa Cascade: drawing, mouse and keys. The rules live in game.js.

const CW = 640, CH = 400, RES = 1.5;           // drawing is in 640 x 400 units; the canvas has RES pixels to each
const CELL = CW / W, PLAY_H = H * CELL;         // one grid cell, in drawing units
const TOOLS = [
  { id: 'deflect', label: 'DEFLECT', key: '1', color: '#ff9a3c', help: 'Click to place a paddle. R flips it.' },
  { id: 'pipe', label: 'PIPE', key: '2', color: '#c9c9d6', help: 'Click the inlet, then the outlet.' },
  { id: 'solid', label: 'SOLIDIFY', key: '3', color: '#5fd4ff', help: 'Sets chocolate that touches it.' },
  { id: 'heat', label: 'HEATER', key: '4', color: '#ff4d3a', help: 'Melts wafer and set chocolate.' },
  { id: 'guzzle', label: 'GUZZLER', key: '5', color: '#7ddc4f', help: 'Swallows chocolate, then bursts.' },
];
const BUTTONS = { tool0: 0, startX: 440, startW: 100, speedX: 540, speedW: 50, menuX: 590, menuW: 50, toolW: 88 };

const Sound = {
  ctx: null, muted: false,
  init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { if (!this.warned) console.warn('Web Audio is not supported here; the game will be silent.'); this.warned = true; return; }
    if (!this.ctx) this.ctx = new AC();
    if (this.ctx.state === 'suspended') this.ctx.resume().catch((e) => console.warn('Could not resume audio:', e));
  },
  tone(freq, dur, type = 'square', vol = 0.06, when = 0, slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + when, osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  },
  // A low rumble that follows how much chocolate is moving (0 to 1).
  hum(level) {
    if (!this.ctx) return;
    if (!this.humGain) {
      const osc = this.ctx.createOscillator(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
      osc.type = 'sawtooth'; osc.frequency.value = 62;
      filter.type = 'lowpass'; filter.frequency.value = 180;
      gain.gain.value = 0;
      osc.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
      osc.start();
      this.humGain = gain; this.humOsc = osc;
    }
    this.humGain.gain.setTargetAtTime(this.muted ? 0 : level * 0.035, this.ctx.currentTime, 0.12);
    this.humOsc.frequency.setTargetAtTime(58 + level * 14, this.ctx.currentTime, 0.2);
  },
  play(type) {
    switch (type) {
      case 'place': this.tone(520, 0.08); this.tone(780, 0.08, 'square', 0.05, 0.06); break;
      case 'remove': this.tone(300, 0.1, 'square', 0.05, 0, 150); break;
      case 'start': this.tone(220, 0.25, 'sawtooth', 0.05, 0, 440); break;
      case 'boom': this.tone(120, 0.5, 'sawtooth', 0.1, 0, 30); break;
      case 'warn': [0, 0.28].forEach((w) => { this.tone(880, 0.14, 'square', 0.06, w); this.tone(660, 0.14, 'square', 0.06, w + 0.14); }); break;
      case 'event': this.tone(90, 0.7, 'sawtooth', 0.12, 0, 28); this.tone(200, 0.3, 'square', 0.05, 0, 60); break;
      case 'won': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, 'square', 0.06, i * 0.12)); break;
      case 'lost': [330, 262, 196].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.08, i * 0.16)); break;
      default: break;
    }
  },
};

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const layer = document.createElement('canvas');
layer.width = W; layer.height = H;
const lctx = layer.getContext('2d');
const image = lctx.createImageData(W, H);
const pixels = new Uint32Array(image.data.buffer);

const ui = {
  screen: 'title', levelIndex: 0, game: null, tool: 'deflect', dir: 1, pipeStart: null,
  hover: null, burstAt: {}, readySecs: 0, lastWarn: '', shake: 0, lastSaved: 0, splashAcc: 0, message: '', messageUntil: 0, speed: 1, muted: false, best: {},
};

// ---- saved progress ----
function loadBest() {
  try {
    ui.best = JSON.parse(localStorage.getItem('cocoa-stars') || '{}');
  } catch (e) {
    console.warn('Could not read saved progress:', e);
    ui.best = {};
  }
}
function saveBest(name, stars) {
  if ((ui.best[name] || 0) >= stars) return;
  ui.best[name] = stars;
  try {
    localStorage.setItem('cocoa-stars', JSON.stringify(ui.best));
  } catch (e) {
    console.warn('Could not save progress:', e);
  }
}

// ---- screens ----
const READY_SECS = 4;       // time to place crew before the chocolate starts on its own
function startLevel(i) {
  ui.readySecs = READY_SECS; ui.lastWarn = ''; ui.burstAt = {};
  particles.length = 0; ui.lastSaved = 0; ui.splashAcc = 0; ui.shake = 0;
  ui.levelIndex = i;
  ui.game = new Game(LEVELS[i]);
  ui.screen = 'play';
  ui.pipeStart = null;
  ui.tool = TOOLS.find((t) => ui.game.left(t.id) > 0 || t.id === 'deflect').id;
  for (const t of TOOLS) if (ui.game.level.helpers[t.id]) { ui.tool = t.id; break; }
}

function say(text) { ui.message = text; ui.messageUntil = performance.now() + 2200; }

function tryPlace(cx, cy) {
  const g = ui.game;
  try {
    if (ui.tool === 'pipe') {
      if (!ui.pipeStart) {
        if (g.left('pipe') <= 0) throw new PlacementError('You have none of those left.');
        ui.pipeStart = { x: cx, y: cy };
        return;
      }
      const s = ui.pipeStart;
      ui.pipeStart = null;
      g.place({ type: 'pipe', x: s.x, y: s.y, x2: cx, y2: cy });
    } else {
      g.place({ type: ui.tool, x: cx, y: cy, dir: ui.dir });
    }
  } catch (e) {
    if (!(e instanceof PlacementError)) throw e;
    say(e.message);
  }
}

// SPACE: pour now if the chocolate has not started, otherwise start the level again.
function toggleRun() {
  const g = ui.game;
  if (!g.running && !g.result) { g.start(); ui.readySecs = 0; return; }
  g.reset();
  particles.length = 0; ui.readySecs = READY_SECS; ui.lastWarn = ''; ui.burstAt = {}; ui.lastSaved = 0; ui.splashAcc = 0; ui.shake = 0;
}

// ---- input ----
function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * CW / r.width, y: (e.clientY - r.top) * CH / r.height };
}

canvas.addEventListener('mousemove', (e) => {
  const p = toCanvas(e);
  ui.hover = p.y < PLAY_H ? { x: Math.floor(p.x / CELL), y: Math.floor(p.y / CELL) } : null;
});
canvas.addEventListener('mouseleave', () => { ui.hover = null; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  Sound.init();
  const p = toCanvas(e);
  if (ui.screen === 'title') {
    const row = Math.floor((p.y - 108) / 42), idx = (p.x < 320 ? 0 : 5) + row;
    if (row >= 0 && row < 5 && idx < LEVELS.length) startLevel(idx);
    return;
  }
  const g = ui.game;
  if (g.result) { resultClick(); return; }
  if (p.y >= PLAY_H) { toolbarClick(p.x); return; }
  const cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL);
  if (e.button === 2) {
    const h = g.helperAt(cx, cy);
    if (h) removeHelper(h);
    else ui.pipeStart = null;
  } else {
    const near = !ui.pipeStart ? g.helperAt(cx, cy) : null;
    if (near && near.type !== 'pipe') {            // click a crew member to pick them up, then click again to put them down
      removeHelper(near);
      ui.tool = near.type;
      if (near.dir) ui.dir = near.dir;
      say(g.running ? 'Picked up. That kind of crew rests for a moment.' : 'Picked up. Click to put them down.');
    } else {
      tryPlace(cx, cy);
    }
  }
});

function removeHelper(h) {
  try { ui.game.remove(h.id); } catch (e) { if (!(e instanceof PlacementError)) throw e; say(e.message); }
}

function toolbarClick(x) {
  if (x < BUTTONS.toolW * TOOLS.length) { ui.tool = TOOLS[Math.floor(x / BUTTONS.toolW)].id; ui.pipeStart = null; }
  else if (x >= BUTTONS.startX && x < BUTTONS.startX + BUTTONS.startW) toggleRun();
  else if (x >= BUTTONS.speedX && x < BUTTONS.speedX + BUTTONS.speedW) ui.speed = ui.speed === 1 ? 3 : 1;
  else if (x >= BUTTONS.menuX) ui.screen = 'title';
}

function resultClick() {
  const g = ui.game;
  if (g.result === 'won' && ui.levelIndex + 1 < LEVELS.length) startLevel(ui.levelIndex + 1);
  else if (g.result === 'won') ui.screen = 'title';
  else toggleRun();
}

window.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  Sound.init();
  if (e.key === 'm' || e.key === 'M') { Sound.muted = !Sound.muted; return; }
  if (ui.screen === 'title') {
    const n = Number(e.key);
    if (n >= 1 && n <= LEVELS.length) startLevel(n - 1);
    return;
  }
  const g = ui.game;
  if (e.key === 'Escape') { ui.screen = 'title'; return; }
  if (e.key === ' ') { e.preventDefault(); if (g.result) resultClick(); else toggleRun(); return; }
  if (e.key === 'Enter' && g.result) { resultClick(); return; }
  if (e.key === 'r' || e.key === 'R') { ui.dir = -ui.dir; return; }
  if (e.key === 'f' || e.key === 'F') { ui.speed = ui.speed === 1 ? 3 : 1; return; }
  if (e.key === 'Backspace' || e.key === 'z' || e.key === 'Z') {
    e.preventDefault();
    const last = g.helpers[g.helpers.length - 1];
    if (last) removeHelper(last);
    return;
  }
  const tool = TOOLS.find((t) => t.key === e.key);
  if (tool) { ui.tool = tool.id; ui.pipeStart = null; }
});

// ---- drawing ----
const MONO = '"Courier New", monospace';
const rgba = (r, g, b) => (255 << 24) | (b << 16) | (g << 8) | r;

const open = (grid, x, y) => { const v = grid.get(x, y); return v === EMPTY || v === CHOC; };
function edgeDist(grid, x, y, dx, dy, max) {
  for (let k = 1; k <= max; k++) if (open(grid, x + dx * k, y + dy * k)) return k;
  return max + 1;
}
const pack = (r, g, b) => (255 << 24) | (Math.max(0, Math.min(255, b)) << 16) | (Math.max(0, Math.min(255, g)) << 8) | Math.max(0, Math.min(255, r));

// Every cell is lit from the top left: bevelled steel with brass trim, wafer, glossy chocolate.
function cellColor(grid, x, y) {
  const v = grid.get(x, y), n = (x * 7 + y * 13) % 5;
  switch (v) {
    case WALL: {
      const up = edgeDist(grid, x, y, 0, -1, 3), dn = edgeDist(grid, x, y, 0, 1, 2), lf = edgeDist(grid, x, y, -1, 0, 1), rt = edgeDist(grid, x, y, 1, 0, 1);
      if (up === 1) return pack(246, 206, 92);
      if (up === 2) return pack(206, 152, 48);
      if (up === 3) return pack(190, 204, 218);
      if (dn === 1) return pack(30, 38, 48);
      if (dn === 2) return pack(52, 62, 76);
      const mx = x % 48, my = y % 48;
      let r = 100 + n * 2 - my * 0.25, g = 114 + n * 2 - my * 0.25, b = 132 + n * 2 - my * 0.2;
      if (mx === 0 || my === 0) { r -= 40; g -= 40; b -= 38; } else if (mx === 1 || my === 1) { r += 16; g += 16; b += 18; }
      const rv = (mx === 6 || mx === 41) && (my === 6 || my === 41);
      if (rv) { r = 214; g = 222; b = 232; } else if ((mx === 7 || mx === 42) && (my === 7 || my === 42)) { r -= 50; g -= 50; b -= 46; }
      if (lf === 1) { r += 34; g += 34; b += 34; } else if (rt === 1) { r -= 34; g -= 34; b -= 30; }
      return pack(r, g, b);
    }
    case SOFT: {
      const up = edgeDist(grid, x, y, 0, -1, 1), tx = x % 10, ty = y % 10;
      if (up === 1) return pack(255, 232, 160);
      if (tx === 0 || ty === 0) return pack(150, 100, 44);
      if (tx === 1 || ty === 1) return pack(244, 208, 140);
      if (tx === 9 || ty === 9) return pack(190, 136, 70);
      return pack(220 + n, 170 + n, 96 + n);
    }
    case SET: {
      const up = edgeDist(grid, x, y, 0, -1, 2), lf = edgeDist(grid, x, y, -1, 0, 1);
      if (up === 1) return pack(190, 128, 82);
      if (up === 2) return pack(140, 88, 54);
      if (lf === 1) return pack(128, 78, 48);
      return (x * 3 + y * 5) % 23 === 0 ? pack(150, 98, 64) : pack(96 + n * 2, 56 + n, 34);
    }
    case PADDLE: {
      if (open(grid, x, y - 1)) return pack(255, 240, 160);
      if (open(grid, x, y + 1)) return pack(138, 90, 16);
      return (x + y) % 9 === 0 ? pack(255, 228, 130) : pack(226, 170, 64);
    }
    case CHOC: {
      let d = 0;
      while (d < 7 && grid.get(x, y - 1 - d) === CHOC) d++;
      if (grid.get(x, y - 1) !== CHOC && !open(grid, x, y - 1)) d = 7;
      let r, g, b;
      if (d === 0) { r = 206; g = 134; b = 82; } else if (d === 1) { r = 164; g = 98; b = 56; } else if (d === 2) { r = 132; g = 74; b = 42; }
      else if (d === 3) { r = 108; g = 60; b = 32; } else { r = 86; g = 46; b = 24; }
      r += (y % 3) * 3; g += (y % 3) * 2;
      if (d <= 2 && (x * 13 + y * 7) % 41 === 0) return pack(244, 196, 148);
      if (open(grid, x - 1, y)) { r += 22; g += 14; b += 8; } else if (open(grid, x + 1, y)) { r -= 14; g -= 10; b -= 6; }
      return pack(r, g, b);
    }
    default: return 0;
  }
}

// Each factory has its own colours: brick, dusk sky and lamp glow.
const THEMES = [
  { brick: [34, 48, 60], sky: ['#2a2060', '#a8507a', '#ffb070'], glow: '255,200,110' },   // teal brick, plum dusk
  { brick: [28, 58, 52], sky: ['#103a50', '#3a9a8a', '#d8f0b0'], glow: '190,255,200' },   // mint
  { brick: [64, 44, 30], sky: ['#40201a', '#c07038', '#ffd890'], glow: '255,190,90' },    // caramel
  { brick: [56, 34, 62], sky: ['#2a1050', '#b04a8a', '#ffa8c0'], glow: '255,170,220' },   // berry
  { brick: [30, 38, 58], sky: ['#0a1030', '#2a3a7a', '#8aa8e8'], glow: '170,200,255' },   // midnight
];
const backdrops = {};
function getBackdrop(i) {
  const k = i % THEMES.length;
  if (!backdrops[k]) backdrops[k] = buildBackdrop(THEMES[k]);
  return backdrops[k];
}

// The walls, windows, lamps, girders and pipes behind everything. Drawn once per theme, at full resolution.
function buildBackdrop(theme) {
  const c = document.createElement('canvas');
  c.width = CW * RES; c.height = PLAY_H * RES;
  const b = c.getContext('2d');
  b.scale(RES, RES);
  const rng = new Rng(77);
  b.fillStyle = '#0c1318'; b.fillRect(0, 0, CW, PLAY_H);
  const BW = 30, BH = 13;                                                   // bricks
  for (let row = 0; row * BH < PLAY_H; row++) for (let x = row % 2 ? -BW / 2 : 0; x < CW; x += BW) {
    const t = rng.next(), y = row * BH;
    b.fillStyle = `rgb(${theme.brick[0] + t * 14}, ${theme.brick[1] + t * 14}, ${theme.brick[2] + t * 14})`; b.fillRect(x + 1, y + 1, BW - 2, BH - 2);
    b.fillStyle = 'rgba(255,255,255,0.08)'; b.fillRect(x + 1, y + 1, BW - 2, 1);
    b.fillStyle = 'rgba(0,0,0,0.28)'; b.fillRect(x + 1, y + BH - 2, BW - 2, 1);
  }
  for (const wx of [70, 200, 330, 460]) {                                   // windows onto a dusk skyline
    b.fillStyle = '#0a0f12'; b.fillRect(wx - 5, 33, 70, 52);
    const sky = b.createLinearGradient(0, 38, 0, 80);
    sky.addColorStop(0, theme.sky[0]); sky.addColorStop(0.55, theme.sky[1]); sky.addColorStop(1, theme.sky[2]);
    b.fillStyle = sky; b.fillRect(wx, 38, 60, 42);
    b.fillStyle = '#ffe8b0'; b.beginPath(); b.arc(wx + 44, 66, 6, 0, Math.PI * 2); b.fill();
    b.fillStyle = '#2a1840';
    for (const [bx, bw, bh] of [[0, 14, 16], [14, 10, 24], [24, 16, 12], [40, 8, 20], [48, 12, 14]]) b.fillRect(wx + bx, 80 - bh, bw, bh);
    b.fillRect(wx + 17, 46, 4, 10); b.fillRect(wx + 42, 52, 3, 8);          // chimneys
    b.fillStyle = 'rgba(40,24,60,0.55)'; b.beginPath(); b.arc(wx + 19, 42, 5, 0, Math.PI * 2); b.arc(wx + 24, 38, 4, 0, Math.PI * 2); b.fill();
    b.fillStyle = '#ffd070'; for (const [lx, ly] of [[3, 68], [7, 72], [17, 60], [20, 64], [28, 72], [43, 62], [52, 70]]) b.fillRect(wx + lx, ly, 2, 2);
    b.fillStyle = '#0a0f12'; b.fillRect(wx + 28, 38, 4, 42); b.fillRect(wx, 56, 60, 3);
    b.fillStyle = 'rgba(255,255,255,0.12)'; b.fillRect(wx, 38, 27, 1);
  }
  for (const gy of [100, 222, 330]) {                                       // girders
    const gr = b.createLinearGradient(0, gy, 0, gy + 10);
    gr.addColorStop(0, '#6a8294'); gr.addColorStop(0.2, '#4a606e'); gr.addColorStop(1, '#222e36');
    b.fillStyle = gr; b.fillRect(0, gy, CW, 10);
    b.fillStyle = '#1a242a';
    for (let x = 0; x < CW; x += 22) { b.beginPath(); b.moveTo(x, gy + 10); b.lineTo(x + 11, gy + 28); b.lineTo(x + 22, gy + 10); b.lineTo(x + 18, gy + 10); b.lineTo(x + 11, gy + 21); b.lineTo(x + 4, gy + 10); b.fill(); }
    b.fillStyle = '#b8c8d4'; for (let x = 8; x < CW; x += 44) b.fillRect(x, gy + 3, 2, 2);
  }
  const cyl = (horizontal, x, y, len, w) => {                                // shaded copper pipes
    const g = horizontal ? b.createLinearGradient(0, y - w / 2, 0, y + w / 2) : b.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    g.addColorStop(0, '#3a2010'); g.addColorStop(0.28, '#b06c3c'); g.addColorStop(0.42, '#f0b478'); g.addColorStop(0.7, '#a86a3c'); g.addColorStop(1, '#3a2010');
    b.fillStyle = g;
    if (horizontal) b.fillRect(x, y - w / 2, len, w); else b.fillRect(x - w / 2, y, w, len);
    for (let d = 36; d < len; d += 84) {
      b.fillStyle = '#e2b020';
      if (horizontal) { b.fillRect(x + d, y - w / 2 - 2, 6, w + 4); b.fillStyle = '#fff0a0'; b.fillRect(x + d, y - w / 2 - 2, 2, w + 4); }
      else { b.fillRect(x - w / 2 - 2, y + d, w + 4, 6); b.fillStyle = '#fff0a0'; b.fillRect(x - w / 2 - 2, y + d, w + 4, 2); }
    }
  };
  cyl(true, 0, 22, CW, 11);
  cyl(false, 600, 22, 310, 13);
  cyl(false, 250, 100, 122, 9);
  cyl(false, 430, 222, 108, 9);
  for (const lx of [135, 265, 395, 525]) {                                    // hanging lamps with a warm glow
    b.strokeStyle = '#1a1210'; b.lineWidth = 1; b.beginPath(); b.moveTo(lx, 27); b.lineTo(lx, 52); b.stroke();
    const glow = b.createRadialGradient(lx, 62, 2, lx, 62, 90);
    glow.addColorStop(0, `rgba(${theme.glow},0.30)`); glow.addColorStop(1, `rgba(${theme.glow},0)`);
    b.fillStyle = glow; b.fillRect(lx - 90, 0, 180, 160);
    b.fillStyle = '#e2b020'; b.beginPath(); b.moveTo(lx - 5, 52); b.lineTo(lx + 5, 52); b.lineTo(lx + 11, 62); b.lineTo(lx - 11, 62); b.fill();
    b.fillStyle = '#fff0a0'; b.fillRect(lx - 3, 62, 6, 2);
  }
  const clock = (cx, cy) => {                                                  // a wall clock
    b.fillStyle = '#e2b020'; b.beginPath(); b.arc(cx, cy, 19, 0, Math.PI * 2); b.fill();
    b.fillStyle = '#f6efe0'; b.beginPath(); b.arc(cx, cy, 15, 0, Math.PI * 2); b.fill();
    b.fillStyle = '#3a2418'; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; b.fillRect(cx + Math.sin(a) * 12 - 1, cy - Math.cos(a) * 12 - 1, 2, 2); }
  };
  clock(335, 166);
  const tank = (tx, ty, tw, th) => {                                           // a glass chocolate tank
    const gl = b.createLinearGradient(tx, 0, tx + tw, 0);
    gl.addColorStop(0, '#1a2a34'); gl.addColorStop(0.2, '#4a6a7c'); gl.addColorStop(0.35, '#2a4050'); gl.addColorStop(1, '#10181e');
    b.fillStyle = gl; b.fillRect(tx, ty, tw, th);
    const ch = b.createLinearGradient(tx, 0, tx + tw, 0);
    ch.addColorStop(0, '#2a1608'); ch.addColorStop(0.25, '#9a5a30'); ch.addColorStop(0.4, '#6a3a1c'); ch.addColorStop(1, '#2a1608');
    b.fillStyle = ch; b.fillRect(tx + 3, ty + th * 0.34, tw - 6, th * 0.66 - 3);
    b.fillStyle = '#e2b020'; b.fillRect(tx - 5, ty - 6, tw + 10, 8); b.fillRect(tx - 5, ty + th - 4, tw + 10, 8);
    b.fillStyle = '#fff0a0'; b.fillRect(tx - 5, ty - 6, tw + 10, 2);
    b.fillStyle = 'rgba(255,255,255,0.18)'; b.fillRect(tx + 8, ty + 6, 6, th - 14);
  };
  tank(480, 186, 78, 142);
  b.fillStyle = '#12191d'; b.fillRect(0, PLAY_H - 12, CW, 12);               // hazard stripe along the floor
  for (let x = -12; x < CW; x += 24) {
    b.fillStyle = '#e2b020'; b.beginPath(); b.moveTo(x, PLAY_H); b.lineTo(x + 12, PLAY_H - 12); b.lineTo(x + 24, PLAY_H - 12); b.lineTo(x + 12, PLAY_H); b.fill();
  }
  const vig = b.createRadialGradient(CW / 2, PLAY_H / 2, 120, CW / 2, PLAY_H / 2, 420);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  b.fillStyle = vig; b.fillRect(0, 0, CW, PLAY_H);
  return c;
}

function drawGear(cx, cy, r, teeth, angle, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = angle + i * Math.PI / teeth, rr = i % 2 ? r : r * 1.18;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1f2c33'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2); ctx.fill();
}

// A tiny crew member in the background, walking along a girder. dir 1 faces right.
function backgroundWalker(kind, x, footY, dir, t, i) {
  const sprite = workerSprite(kind, 'work', Math.floor(t * 6 + i) % 4, 0), k = 0.36 * CELL;
  ctx.save();
  ctx.globalAlpha = 0.75; ctx.imageSmoothingEnabled = true;
  ctx.translate(x, footY);
  ctx.scale(dir, 1);
  ctx.drawImage(sprite, -sprite.width * k / 2, -sprite.height * k, sprite.width * k, sprite.height * k);
  ctx.restore();
}

function drawAmbient(now) {
  const t = now / 1000;
  // a conveyor carrying chocolate bars along the middle girder
  ctx.fillStyle = '#12191d'; ctx.fillRect(0, 212, CW, 10);
  ctx.fillStyle = '#2a3640';
  for (let x = -((t * 40) % 12); x < CW; x += 12) ctx.fillRect(x, 218, 6, 2);
  for (let i = 0; i < 9; i++) {
    const bx = ((t * 40 + i * 76) % (CW + 40)) - 20;
    ctx.fillStyle = '#4a2810'; ctx.fillRect(bx, 203, 16, 9);
    ctx.fillStyle = '#7a4a24'; ctx.fillRect(bx, 203, 16, 2);
    ctx.fillStyle = '#e2b020'; ctx.fillRect(bx + 4, 203, 2, 9); ctx.fillRect(bx + 10, 203, 2, 9);
  }
  // two small workers pacing the top and bottom girders
  const pace = (speed, span, phase) => { const u = ((t * speed + phase) % (2 * span)); return u < span ? [u, 1] : [2 * span - u, -1]; };
  { const [u, d] = pace(16, 440, 40); backgroundWalker('pipe', 60 + u, 100, d, t, 0); }
  { const [u, d] = pace(12, 380, 200); backgroundWalker('solid', 30 + u, 330, d, t, 2); }
  // a piston that thumps and hisses
  ctx.save(); ctx.translate(-176, 0);
  const ph = (Math.sin(t * 3) + 1) / 2;
  ctx.fillStyle = '#26323a'; ctx.fillRect(556, 236, 20, 62);
  ctx.fillStyle = '#4a5e6a'; ctx.fillRect(558, 236, 4, 62);
  const rodY = 244 + ph * 34;
  ctx.fillStyle = '#9aa8b4'; ctx.fillRect(563, 220, 6, rodY - 220 + 14);
  ctx.fillStyle = '#c8d4de'; ctx.fillRect(563, 220, 2, rodY - 220 + 14);
  ctx.fillStyle = '#e2b020'; ctx.fillRect(552, rodY + 12, 28, 6);
  if (ph > 0.9) { ctx.fillStyle = 'rgba(230,236,240,0.4)'; ctx.beginPath(); ctx.arc(552, 268, 5, 0, Math.PI * 2); ctx.arc(580, 268, 5, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  drawGear(470, 150, 24, 12, t * 0.5, '#2a3c48');
  drawGear(508, 174, 16, 9, -t * 0.5 * 12 / 9 + 0.2, '#2a3c48');
  drawGear(330, 272, 20, 10, t * 0.4, '#2a3c48');
  for (const [sx, sy, k] of [[250, 100, 0], [430, 222, 1.7], [600, 120, 3.1]]) {   // steam from the pipe joints
    for (let i = 0; i < 5; i++) {
      const p = ((t * 0.3 + i / 5 + k) % 1);
      ctx.fillStyle = `rgba(226, 234, 240, ${0.26 * (1 - p)})`;
      ctx.beginPath(); ctx.arc(sx + Math.sin(p * 6 + k) * 6, sy - p * 46, 4 + p * 10, 0, Math.PI * 2); ctx.fill();
    }
  }
  const a1 = t * 0.4, a2 = t * 0.4 / 12;                                      // the clock hands
  ctx.strokeStyle = '#3a2418'; ctx.lineCap = 'round';
  ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(335, 166); ctx.lineTo(335 + Math.sin(a1) * 11, 166 - Math.cos(a1) * 11); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(335, 166); ctx.lineTo(335 + Math.sin(a2) * 7, 166 - Math.cos(a2) * 7); ctx.stroke();
  ctx.lineCap = 'butt';
  for (let i = 0; i < 9; i++) {                                               // bubbles in the tank
    const p = (t * 0.22 + i * 0.37) % 1, bx = 488 + ((i * 53) % 62), by = 326 - p * 100;
    if (by < 186 + 142 * 0.34) continue;
    ctx.fillStyle = `rgba(255, 220, 170, ${0.55 * (1 - p)})`;
    ctx.beginPath(); ctx.arc(bx + Math.sin(t * 2 + i) * 2, by, 1.5 + (i % 3), 0, Math.PI * 2); ctx.fill();
  }
}

function drawVat(g) {
  const v = g.goal, x = v.x * CELL, y = v.y * CELL, w = v.w * CELL, h = v.h * CELL;
  ctx.fillStyle = '#0e1114'; ctx.fillRect(x, y, w, h);                                       // the cavity
  const fill = Math.min(1, g.saved / g.need);
  ctx.fillStyle = '#6a3a1e'; ctx.fillRect(x, y + h * (1 - fill), w, h * fill);              // chocolate level
  ctx.fillStyle = '#9a5a30'; if (fill > 0) ctx.fillRect(x, y + h * (1 - fill), w, 2);
  ctx.fillStyle = 'rgba(180, 220, 255, 0.10)'; ctx.fillRect(x + 4, y, 8, h);                 // glass glint
  ctx.strokeStyle = '#c28a52'; ctx.lineWidth = 4; ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#e2b020'; ctx.fillRect(x - 6, y - 8, w + 12, 6);                          // brass rim
  ctx.fillStyle = '#2a343c'; ctx.fillRect(x + w / 2 - 28, y - 26, 56, 16);                   // name plate
  ctx.fillStyle = '#ffd24a'; ctx.font = `bold 11px ${MONO}`; ctx.textAlign = 'center';
  ctx.fillText('CHOC VAT', x + w / 2, y - 14);
}

function drawNozzle(g) {
  const sx = g.spout.x * CELL, w = (2 * MOUTH + 1) * CELL;
  ctx.fillStyle = '#2a343c'; ctx.fillRect(sx - w / 2 - 6, 14, w + 12, 26);                   // outer collar
  ctx.fillStyle = '#c28a52'; ctx.fillRect(sx - w / 2 - 3, 16, w + 6, 22);
  ctx.fillStyle = '#e2b020'; ctx.fillRect(sx - w / 2 - 6, 36, w + 12, 4);
  ctx.fillStyle = '#7a4a28'; ctx.fillRect(sx - w / 2, 38, w, g.spout.y * CELL - 38 > 0 ? 3 : 0);
}

// The crew are drawn smaller than their art: CHAR_SCALE of full size, resampled from a pixel-doubled copy so the
// pixels stay clean.
const CHAR_SCALE = 0.7;
const scaledSprites = new WeakMap();
function charImage(sprite) {
  let c = scaledSprites.get(sprite);
  if (!c) {
    const up = document.createElement('canvas');
    up.width = sprite.width * 4; up.height = sprite.height * 4;
    const u = up.getContext('2d');
    u.imageSmoothingEnabled = false; u.drawImage(sprite, 0, 0, up.width, up.height);
    c = document.createElement('canvas');
    c.width = Math.round(sprite.width * 2 * CHAR_SCALE); c.height = Math.round(sprite.height * 2 * CHAR_SCALE);
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(up, 0, 0, c.width, c.height);
    scaledSprites.set(sprite, c);
  }
  return c;
}
// Draw a sprite at CHAR_SCALE with its feet-centre at (cx, cy), in drawing units.
function drawScaled(sprite, cx, cy) {
  const w = sprite.width * CELL * CHAR_SCALE, h = sprite.height * CELL * CHAR_SCALE;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(charImage(sprite), cx - w / 2, cy - h + CELL * CHAR_SCALE, w, h);
}

// Draw a character on an anti-gravity pad. (fx, fy) is where its feet are, in grid cells; lift raises it off the pad.
function drawCharacter(sprite, fx, fy, lift = 0) {
  const k = CHAR_SCALE, cx = Math.round(fx) * CELL, cy = Math.round(fy) * CELL;
  const glow = ctx.createRadialGradient(cx, cy + 4 * CELL * k, 2, cx, cy + 4 * CELL * k, 16 * CELL * k);
  glow.addColorStop(0, 'rgba(120, 220, 255, 0.35)'); glow.addColorStop(1, 'rgba(120, 220, 255, 0)');
  ctx.fillStyle = glow; ctx.fillRect(cx - 16 * CELL * k, cy - 4 * CELL * k, 32 * CELL * k, 16 * CELL * k);
  const pad = (dy, rx, ry, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(cx, cy + dy * CELL * k, rx * CELL * k, ry * CELL * k, 0, 0, Math.PI * 2); ctx.fill(); };
  pad(2, 12, 3, '#1e2a34'); pad(1, 12, 2.6, '#5a6e80'); pad(0.6, 10, 1.8, '#a8bccc');
  ctx.fillStyle = '#e2b020'; ctx.fillRect(cx - 12 * CELL * k, cy + CELL * k, 2 * CELL * k, CELL * k); ctx.fillRect(cx + 10 * CELL * k, cy + CELL * k, 2 * CELL * k, CELL * k);
  drawScaled(sprite, cx, cy - lift * CELL * k);
}

// How the crew feel: planning, working, delighted (vat full) or glum (not enough).
function crewMood(g) {
  if (g.result === 'won') return 'cheer';
  if (g.result === 'lost') return 'sad';
  return g.running ? 'work' : 'idle';
}
const blinkNow = (now, id) => (Math.floor(now / 140) + id * 7) % 23 === 0 ? 1 : 0;
const cheerLift = (now, id) => Math.round(Math.abs(Math.sin(now / 140 + id)) * 5);

function drawWorker(h, tool, now) {
  const g = ui.game, px = h.x * CELL, py = h.y * CELL, mood = crewMood(g), blink = blinkNow(now, h.id);
  ctx.save();
  ctx.strokeStyle = tool.color; ctx.globalAlpha = 0.35; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.arc(px, py, REACH * CELL, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  const bob = mood === 'idle' ? Math.round(Math.sin(now / 300 + h.id)) : 0;
  const lift = mood === 'cheer' ? cheerLift(now, h.id) : 0;
  if (h.type === 'guzzle') {
    if (h.burst) {
      ui.burstAt[h.id] = ui.burstAt[h.id] || now;
      const age = now - ui.burstAt[h.id];
      if (age < 600) { const s = burstSprite(Math.min(2, Math.floor(age / 200))); ctx.drawImage(s, (h.x - 20) * CELL, (h.y - 20) * CELL, s.width * CELL, s.height * CELL); }
      ctx.restore();
      return;
    }
    delete ui.burstAt[h.id];
    const stage = Math.min(3, Math.floor(4 * h.swallowed / GUZZLE_CAPACITY));
    const shake = stage === 3 && g.running ? (Math.floor(now / 50) % 2 ? 1 : -1) : 0;
    drawCharacter(guzzleSprite(stage, g.running || mood === 'cheer' ? Math.floor(now / 200) % 2 : 0, blink), h.x + shake, h.y + 7 + bob, lift);
  } else {
    drawCharacter(workerSprite(h.type, mood, Math.floor(now / 140) % 4, blink), h.x, h.y + 7 + bob, lift);
    if (h.type === 'solid') {
      ctx.fillStyle = '#000'; ctx.fillRect(px - 12, py + 11 * CELL, 24, 4); ctx.fillStyle = tool.color; ctx.fillRect(px - 12, py + 11 * CELL, 24 * Math.max(0, h.charge / SOLID_CHARGE), 4);
    }
  }
  ctx.restore();
}

// The deflector worker IS the slide's support: he stands under it with his arms up, gripping it at its middle.
function drawDeflectCrew(h, now) {
  const g = ui.game, strain = g.running ? Math.floor(now / 200) % 4 : 0;
  const cells = paddleCells(h.x, h.y, h.dir), a = cells[0], z = cells[cells.length - 1];
  const x1 = a[0] * CELL + CELL / 2, y1 = a[1] * CELL + CELL / 2, x2 = z[0] * CELL + CELL / 2, y2 = z[1] * CELL + CELL / 2;
  ctx.lineCap = 'round';                                                                // the brass chute he is holding up
  ctx.strokeStyle = '#6a4208'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(x1, y1 + 1); ctx.lineTo(x2, y2 + 1); ctx.stroke();
  ctx.strokeStyle = '#d8a030'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = '#fff0a0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x1, y1 - 1.5); ctx.lineTo(x2, y2 - 1.5); ctx.stroke();
  ctx.fillStyle = '#6a4208'; ctx.beginPath(); ctx.arc(x1, y1, 3, 0, Math.PI * 2); ctx.arc(x2, y2, 3, 0, Math.PI * 2); ctx.fill();
  ctx.lineCap = 'butt';
  drawCharacter(workerSprite('deflect', 'hold', strain, blinkNow(now, h.id)), h.x, h.y + 13);
}

// The plumber holds the funnel up over the inlet; the little mascot at the outlet spits the chocolate out.
function drawPipeCrew(h, now) {
  const g = ui.game, mood = crewMood(g);
  drawCharacter(workerSprite('pipe', 'hold', g.running ? Math.floor(now / 200) % 4 : 0, blinkNow(now, h.id)), h.x, h.y + 11);
  const out = outletSprite(g.running && Math.floor(now / 220) % 2 || mood === 'cheer' ? 1 : 0);
  drawScaled(out, h.x2 * CELL, (h.y2 + 3) * CELL);
}

function drawHelpers(g, now) {
  for (const h of g.helpers) {
    const tool = TOOLS.find((t) => t.id === h.type);
    if (h.type === 'pipe') {
      const x1 = h.x * CELL + CELL / 2, y1 = h.y * CELL + CELL / 2, x2 = h.x2 * CELL + CELL / 2, y2 = h.y2 * CELL + CELL / 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#2a343c'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = '#b8bcc8'; ctx.lineWidth = 6; ctx.stroke();
      ctx.strokeStyle = '#eef0f6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x1, y1 - 1.5); ctx.lineTo(x2, y2 - 1.5); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = '#e2b020'; ctx.beginPath();                                                     // the hazard funnel over the inlet
      const mw = MOUTH * CELL + 4; ctx.moveTo(x1 - mw, y1 - 7); ctx.lineTo(x1 + mw, y1 - 7); ctx.lineTo(x1 + 4, y1 + 3); ctx.lineTo(x1 - 4, y1 + 3); ctx.fill();
      ctx.fillStyle = '#2a343c'; ctx.fillRect(x1 - mw + 4, y1 - 7, 4, 3); ctx.fillRect(x1 + mw - 8, y1 - 7, 4, 3);
      drawPipeCrew(h, now);
    } else if (h.type === 'deflect') {
      drawDeflectCrew(h, now);
    } else {
      drawWorker(h, tool, now);
    }
  }
}

function drawPanel(x, y, w, h, fill = '#2a343c') {
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, y, w, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, y + h - 2, w, 2);
  ctx.fillStyle = '#9aa8b4';
  for (const [rx, ry] of [[x + 3, y + 3], [x + w - 5, y + 3], [x + 3, y + h - 5], [x + w - 5, y + h - 5]]) ctx.fillRect(rx, ry, 2, 2);
}

function drawTitle(now) {
  const t = now / 1000;
  ctx.drawImage(getBackdrop(0), 0, 0, CW, PLAY_H);
  ctx.fillStyle = '#1f2c33'; ctx.fillRect(0, PLAY_H, CW, CH - PLAY_H);
  drawAmbient(now);
  // the logo, in chocolate
  ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  ctx.font = 'bold 50px "Trebuchet MS", Verdana, sans-serif';
  const logo = (txt, y) => {
    ctx.strokeStyle = '#1a0c06'; ctx.lineWidth = 9; ctx.strokeText(txt, CW / 2, y + 4);
    ctx.strokeStyle = '#e2b020'; ctx.lineWidth = 6; ctx.strokeText(txt, CW / 2, y);
    const g = ctx.createLinearGradient(0, y - 38, 0, y + 6);
    g.addColorStop(0, '#ffe2b0'); g.addColorStop(0.45, '#d8904c'); g.addColorStop(0.55, '#8a4a22'); g.addColorStop(1, '#4a2410');
    ctx.fillStyle = g; ctx.fillText(txt, CW / 2, y);
  };
  logo('COCOA CASCADE', 62);
  ctx.fillStyle = '#f0d8c0'; ctx.font = `bold 13px ${MONO}`;
  ctx.fillText('Place your crew. Open the valve. Fill the vat.', CW / 2, 92);
  LEVELS.forEach((lv, i) => {
    const col = i < 5 ? 0 : 1, row = i % 5, x = 14 + col * 312, y = 108 + row * 42;
    drawPanel(x, y, 300, 38, '#33424c');
    ctx.fillStyle = '#10181e'; ctx.fillRect(x + 6, y + 5, 28, 28);
    ctx.fillStyle = '#ffd24a'; ctx.font = `bold 18px ${MONO}`; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), x + 20, y + 26);
    const featured = TOOLS.find((tl) => lv.helpers[tl.id]);
    if (featured) { const sp = toolSprite(featured.id), sc = CELL * 0.6; ctx.imageSmoothingEnabled = false; ctx.drawImage(sp, x + 38, y + 4, sp.width * sc, sp.height * sc); }
    ctx.textAlign = 'left'; ctx.fillStyle = '#f0d8c0'; ctx.font = `bold 13px ${MONO}`;
    ctx.fillText(lv.name.toUpperCase(), x + 70, y + 15);
    ctx.fillStyle = '#9ab0bc'; ctx.font = `9px ${MONO}`;
    let hint = lv.hint;
    while (ctx.measureText(hint).width > 224 && hint.length > 8) hint = hint.slice(0, -2);
    ctx.fillText(hint === lv.hint ? hint : hint.trimEnd() + '..', x + 70, y + 30);
    const stars = ui.best[lv.name] || 0;
    ctx.textAlign = 'right'; ctx.font = `bold 13px ${MONO}`;
    for (let k = 0; k < 3; k++) { ctx.fillStyle = k < stars ? '#ffd24a' : '#2a3640'; ctx.fillText('\u2605', x + 294 - (2 - k) * 14, y + 15); }
  });
  // the crew parade along the bottom
  const parade = [['heat'], ['solid'], ['deflect'], ['pipe'], ['guzzle'], ['heat'], ['pipe']];
  parade.forEach(([k], i) => {
    const x = ((t * 34 + i * 100) % 760) - 60;
    const fy = (PLAY_H + 2) / CELL - 3;
    const sprite = k === 'guzzle' ? guzzleSprite(0, Math.floor(t * 3) % 2, 0) : workerSprite(k, 'work', Math.floor(t * 7 + i) % 4, 0);
    const bob = k === 'guzzle' ? Math.round(Math.abs(Math.sin(t * 6 + i)) * 2) : 0;
    drawScaled(sprite, x, (fy - bob) * CELL);
  });
  ctx.textAlign = 'center'; ctx.fillStyle = '#9ab0bc'; ctx.font = `12px ${MONO}`;
  ctx.fillText('CLICK A FACTORY OR PRESS ITS NUMBER   -   M MUTES', CW / 2, 386);
}

function drawPlay(now) {
  const g = ui.game, lv = g.level;
  ctx.save();
  if (ui.shake > 0) ctx.translate((Math.random() - 0.5) * ui.shake * 14, (Math.random() - 0.5) * ui.shake * 14);
  ctx.drawImage(getBackdrop(ui.levelIndex), 0, 0, CW, PLAY_H);
  drawAmbient(now);
  drawVat(g);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) pixels[y * W + x] = cellColor(g.grid, x, y);
  lctx.putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(layer, 0, 0, W * CELL, PLAY_H);
  ctx.imageSmoothingEnabled = true;
  drawNozzle(g);
  drawHelpers(g, now);
  drawGhost(g);
  drawParticles();
  ctx.restore();
  // heads-up: a riveted plate with little readouts
  drawPanel(0, 0, CW, 20, '#2a343c');
  ctx.textAlign = 'left'; ctx.font = `bold 13px ${MONO}`;
  ctx.fillStyle = '#ffd24a'; ctx.fillText(`${ui.levelIndex + 1}. ${lv.name.toUpperCase()}`, 10, 14);
  const secs = Math.max(0, Math.ceil(g.timeLeft / TPS));
  const readout = (x, label, value, color) => {
    ctx.fillStyle = '#0a1210'; ctx.fillRect(x, 3, 112, 14);
    ctx.textAlign = 'left'; ctx.fillStyle = '#7a8a84'; ctx.font = `bold 9px ${MONO}`; ctx.fillText(label, x + 4, 13);
    ctx.textAlign = 'right'; ctx.fillStyle = color; ctx.font = `bold 11px ${MONO}`; ctx.fillText(value, x + 108, 14);
  };
  readout(290, 'VAT', `${g.shown(g.saved)}/${lv.need}`, g.saved >= g.need ? '#7dffa0' : '#ffb04a');
  readout(407, 'SPILLED', String(g.shown(g.lost)), g.lost ? '#ff7a6a' : '#7dffa0');
  readout(524, 'TIME', String(secs), secs < 15 ? '#ff7a6a' : '#7dffa0');
  drawToolbar(g);
  const t = performance.now();
  let note = t < ui.messageUntil ? ui.message : ui.pipeStart ? 'Now click where the pipe comes out.' : g.running ? '' : (TOOLS.find((x) => x.id === ui.tool).help + '  Right-click removes.');
  if (!g.running && !g.result && t >= ui.messageUntil && !ui.pipeStart) note = lv.hint;
  if (note && !g.result) {
    ctx.textAlign = 'center'; ctx.font = `13px ${MONO}`;
    const w = ctx.measureText(note).width + 24;
    drawPanel((CW - w) / 2, PLAY_H - 30, w, 22, 'rgba(26, 34, 40, 0.92)');
    ctx.fillStyle = t < ui.messageUntil ? '#ffb0a0' : '#f0d8c0'; ctx.fillText(note, CW / 2, PLAY_H - 15);
  }
  const warn = g.warning;
  if (warn) {                                                         // a flashing warning before something goes wrong
    const flash = Math.floor(t / 250) % 2;
    drawPanel(CW / 2 - 130, 24, 260, 22, flash ? '#8a1a1a' : '#5a1212');
    ctx.fillStyle = '#ffe0a0'; ctx.font = `bold 13px ${MONO}`; ctx.textAlign = 'center';
    ctx.fillText(`\u26A0 ${warn.text} IN ${warn.secs}`, CW / 2, 39);
  }
  if (!g.running && !g.result) {                                      // the countdown
    ctx.textAlign = 'center'; ctx.font = `bold 44px ${MONO}`;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(`POUR IN ${Math.max(1, Math.ceil(ui.readySecs))}`, CW / 2 + 2, 118);
    ctx.fillStyle = '#ffd24a'; ctx.fillText(`POUR IN ${Math.max(1, Math.ceil(ui.readySecs))}`, CW / 2, 116);
    ctx.font = `bold 12px ${MONO}`; ctx.fillStyle = '#f0d8c0'; ctx.fillText('Get your crew in place. SPACE pours now.', CW / 2, 138);
  }
  if (g.result) drawResult(g);
}

function drawGhost(g) {
  const h = ui.hover;
  if (!h || g.result) return;
  const tool = TOOLS.find((t) => t.id === ui.tool);
  ctx.globalAlpha = 0.6; ctx.fillStyle = tool.color; ctx.strokeStyle = tool.color; ctx.lineWidth = 2;
  const px = h.x * CELL + CELL / 2, py = h.y * CELL + CELL / 2;
  if (ui.tool === 'deflect') {
    for (const [x, y] of paddleCells(h.x, h.y, ui.dir)) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
  } else if (ui.tool === 'pipe') {
    const s = ui.pipeStart;
    if (s) { ctx.beginPath(); ctx.moveTo(s.x * CELL + CELL / 2, s.y * CELL + CELL / 2); ctx.lineTo(px, py); ctx.stroke(); }
    ctx.fillRect(px - 5, py - 3, 10, 6);
  } else {
    ctx.beginPath(); ctx.arc(px, py, REACH * CELL, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(px, py - 4, 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function toolSprite(id) {
  return id === 'guzzle' ? guzzleSprite(0, 0, 0) : id === 'pipe' ? workerSprite('pipe', 'idle', 0, 0) : workerSprite(id, 'idle', 0, 0);
}

function drawToolbar(g) {
  drawPanel(0, PLAY_H, CW, CH - PLAY_H, '#232d34');
  ctx.textAlign = 'center';
  TOOLS.forEach((t, i) => {
    const x = i * BUTTONS.toolW, left = g.left(t.id), has = (g.level.helpers[t.id] || 0) > 0, on = ui.tool === t.id;
    drawPanel(x + 3, PLAY_H + 3, BUTTONS.toolW - 6, CH - PLAY_H - 6, on ? '#56687a' : '#34434f');
    if (on) { ctx.strokeStyle = t.color; ctx.lineWidth = 2; ctx.strokeRect(x + 4, PLAY_H + 4, BUTTONS.toolW - 8, CH - PLAY_H - 8); }
    ctx.globalAlpha = has ? 1 : 0.3;
    const s = toolSprite(t.id), sc = CELL * 0.8;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(s, x + 6, PLAY_H + 3, s.width * sc, s.height * sc);
    ctx.globalAlpha = 1;
    if (g.cool[t.id] > 0) {                                           // resting after being picked up
      ctx.fillStyle = 'rgba(8, 12, 16, 0.72)'; ctx.fillRect(x + 4, PLAY_H + 4, BUTTONS.toolW - 8, CH - PLAY_H - 8);
      ctx.fillStyle = '#ffb070'; ctx.font = `bold 16px ${MONO}`; ctx.textAlign = 'center';
      ctx.fillText(`${Math.ceil(g.cool[t.id] / TPS)}s`, x + BUTTONS.toolW / 2, PLAY_H + 26);
      return;
    }
    ctx.fillStyle = has ? '#ffd24a' : '#5a6a74'; ctx.font = `bold 20px ${MONO}`; ctx.textAlign = 'right';
    ctx.fillText(has ? String(left) : '-', x + BUTTONS.toolW - 8, PLAY_H + 20);
    ctx.fillStyle = has ? t.color : '#5a6a74'; ctx.font = `bold 8px ${MONO}`; ctx.textAlign = 'center';
    ctx.textAlign = 'right';
    ctx.fillText(`${t.key} ${t.label}`, x + BUTTONS.toolW - 7, PLAY_H + 32);
  });
  ctx.font = `bold 11px ${MONO}`; ctx.textAlign = 'center';
  const btn = (x, w, label, color, lamp) => {
    drawPanel(x + 3, PLAY_H + 3, w - 6, CH - PLAY_H - 6, '#34434f');
    ctx.fillStyle = color; ctx.fillText(label, x + w / 2, PLAY_H + 25);
    if (lamp) { ctx.fillStyle = lamp; ctx.beginPath(); ctx.arc(x + 12, PLAY_H + 20, 3, 0, Math.PI * 2); ctx.fill(); }
  };
  const live = g.running || g.result;
  btn(BUTTONS.startX, BUTTONS.startW, live ? 'RESTART' : 'POUR NOW', live ? '#ffb070' : '#7ddc4f', g.running ? '#7dffa0' : '#552020');
  btn(BUTTONS.speedX, BUTTONS.speedW, ui.speed === 1 ? 'x1' : 'x3', '#c9d2dc');
  btn(BUTTONS.menuX, BUTTONS.menuW, 'MENU', '#c9d2dc');
}

function drawResult(g) {
  drawPanel(120, 100, 400, 152, 'rgba(24, 32, 38, 0.96)');
  ctx.strokeStyle = g.result === 'won' ? '#7ddc4f' : '#ff7a6a'; ctx.lineWidth = 3; ctx.strokeRect(124, 104, 392, 144);
  ctx.textAlign = 'center'; ctx.font = `bold 28px ${MONO}`;
  ctx.fillStyle = g.result === 'won' ? '#7ddc4f' : '#ff7a6a';
  ctx.fillText(g.result === 'won' ? 'VAT FULL!' : 'NOT ENOUGH', CW / 2, 154);
  ctx.font = `13px ${MONO}`; ctx.fillStyle = '#f0d8c0';
  ctx.fillText(g.reason, CW / 2, 178);
  if (g.result === 'won') {
    ctx.font = `bold 22px ${MONO}`;
    for (let k = 0; k < 3; k++) { ctx.fillStyle = k < g.stars ? '#ffd24a' : '#3a4650'; ctx.fillText('\u2605', CW / 2 + (k - 1) * 26, 202); }
    ctx.font = `10px ${MONO}`; ctx.fillStyle = '#9ab0bc';
    ctx.fillText(g.stars === 3 ? 'PERFECT' : g.stars === 2 ? 'FASTER THAN 50 SECONDS FOR THE THIRD STAR' : 'SPILL LESS THAN A FIFTH FOR THE SECOND STAR', CW / 2, 216);
  }
  ctx.font = `13px ${MONO}`; ctx.fillStyle = '#9ab0bc';
  const last = ui.levelIndex + 1 >= LEVELS.length;
  ctx.fillText(g.result === 'won' ? (last ? 'CLICK OR SPACE FOR THE MENU' : 'CLICK OR SPACE FOR THE NEXT FACTORY') : 'CLICK OR SPACE TO TRY AGAIN', CW / 2, 238);
}

// ---- particles and juice ----
const particles = [];
const confettiColors = ['#ff5a64', '#ffd24a', '#7ddc4f', '#5fd4ff', '#b57aff', '#ff9a3c'];
function addParticle(p) { particles.push({ ttl: 1, g: 0, size: 2, ...p, age: 0 }); }
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    if (p.age >= p.ttl) { particles.splice(i, 1); continue; }
    p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.spin !== undefined) p.rot += p.spin * dt;
  }
}
function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, (1 - p.age / p.ttl) * 1.6));
    ctx.fillStyle = p.color;
    if (p.rot !== undefined) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size); ctx.restore(); }
    else ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
  ctx.globalAlpha = 1;
}
function celebrate() {
  for (let i = 0; i < 150; i++) {
    addParticle({ x: Math.random() * CW, y: -10 - Math.random() * 60, vx: (Math.random() - 0.5) * 60, vy: 20 + Math.random() * 60, g: 90, ttl: 3.2 + Math.random(),
      size: 3 + Math.random() * 3, color: confettiColors[i % confettiColors.length], rot: Math.random() * 6, spin: (Math.random() - 0.5) * 12 });
  }
}
function explode(cellX, cellY) {
  const x = cellX * CELL, y = cellY * CELL;
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 170;
    addParticle({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, g: 220, ttl: 0.6 + Math.random() * 0.7, size: 2 + Math.floor(Math.random() * 3),
      color: ['#fffbe0', '#ffe060', '#ffb030', '#ff6a20', '#7a4a28'][i % 5] });
  }
  ui.shake = 0.5;
}
// Little effects that come from what is going on, once per frame.
function ambientJuice(g, dt) {
  const lv = g.level;
  if (g.running) {
    const delta = g.saved - ui.lastSaved;
    ui.splashAcc += Math.max(0, delta);
    while (ui.splashAcc >= 10) {
      ui.splashAcc -= 10;
      const v = g.goal;
      addParticle({ x: (v.x + 4 + Math.random() * (v.w - 8)) * CELL, y: v.y * CELL, vx: (Math.random() - 0.5) * 40, vy: -40 - Math.random() * 60, g: 260, ttl: 0.5, size: 2, color: ['#c88a52', '#9a5a30', '#e8b080'][Math.floor(Math.random() * 3)] });
    }
    if (Math.random() < dt * 6 && g.emitted < g.total) addParticle({ x: g.spout.x * CELL + (Math.random() - 0.5) * 12, y: 42, vx: 0, vy: 20, g: 300, ttl: 0.6, size: 2, color: '#9a5a30' });
    for (const h of g.helpers) {
      if (h.type === 'heat' && Math.random() < dt * 40) addParticle({ x: (h.x + 6) * CELL, y: (h.y - 4) * CELL, vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 40, g: 40, ttl: 0.5, size: 2, color: Math.random() < 0.5 ? '#ffb030' : '#ffe060' });
      if (h.type === 'solid' && h.charge > 0 && Math.random() < dt * 30) addParticle({ x: (h.x + 8) * CELL + (Math.random() - 0.5) * 10, y: (h.y - 1) * CELL + (Math.random() - 0.5) * 10, vx: 20 + Math.random() * 20, vy: (Math.random() - 0.5) * 20, g: 0, ttl: 0.5, size: 2, color: Math.random() < 0.5 ? '#ffffff' : '#bfeaff' });
    }
  }
  ui.lastSaved = g.saved;
  if (ui.shake > 0) ui.shake = Math.max(0, ui.shake - dt);
  Sound.hum(g.running ? Math.min(1, g.lastMoved / 400) : 0);
}

// ---- the loop ----
let last = performance.now(), acc = 0;
function frame(now) {
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  const dt = Math.min(0.1, (now - last) / 1000);
  acc += Math.min(100, now - last) * ui.speed;
  last = now;
  if (ui.screen === 'play') {
    const g = ui.game;
    while (acc >= 1000 / TPS) { g.tick(); acc -= 1000 / TPS; }
    for (const ev of g.events.splice(0)) {
      Sound.play(ev.type);
      if (ev.type === 'boom') explode(ev.x, ev.y);
      if (ev.type === 'event') ui.shake = 0.5;
      if (ev.type === 'won') { saveBest(g.level.name, g.stars); celebrate(); }
    }
    if (!g.running && !g.result && ui.readySecs > 0) {      // the countdown to the pour
      ui.readySecs -= dt;
      if (ui.readySecs <= 0) g.start();
    }
    const warn = g.warning;
    if (warn && ui.lastWarn !== warn.text) { ui.lastWarn = warn.text; Sound.play('warn'); }
    if (!warn) ui.lastWarn = '';
    ambientJuice(g, dt);
    updateParticles(dt);
    drawPlay(now);
  } else {
    acc = 0;
    Sound.hum(0);
    drawTitle(now);
  }
  requestAnimationFrame(frame);
}
loadBest();
requestAnimationFrame(frame);
