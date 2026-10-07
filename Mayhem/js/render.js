'use strict';

// Everything you see: the board, units, effects, panels, spell cards and the title and setup screens.
// This file only draws. The state it draws lives in `app` (see ui.js).

const PANEL_X = BOARD_X + COLS * CELL;       // the pupils panel starts where the board ends
const BOTTOM_Y = BOARD_Y + ROWS * CELL;      // the message bar sits under the board
const KIND_STYLE = {
  summon: { label: 'PET', color: '#4aa3ff' },
  bolt: { label: 'SPLAT', color: '#ff9a3d' },
  area: { label: 'SPLAT', color: '#ff9a3d' },
  tickle: { label: 'FREEZE', color: '#ff6fb5' },
  self: { label: 'SELF', color: '#f2c94c' },
  blob: { label: 'SLIME', color: '#4cc15a' },
  ink: { label: 'INK', color: '#9b7bff' },
  passage: { label: 'DOOR', color: '#4fd1c5' },
};

function cellCenter(x, y) { return { x: BOARD_X + x * CELL + CELL / 2, y: BOARD_Y + y * CELL + CELL / 2 }; }
function cellFromPx(px, py) {
  const x = Math.floor((px - BOARD_X) / CELL), y = Math.floor((py - BOARD_Y) / CELL);
  return inBounds(x, y) ? { x, y } : null;
}
function rgba(hex, a) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a})`;
}
function inRect(px, py, r) { return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }
// Register a clickable rectangle for this frame. The input code looks these up by id.
function hit(id, x, y, w, h, extra = {}) { app.hits.push({ id, x, y, w, h, ...extra }); }

// ---- effects ----
const CONFETTI = ['#ff4d6d', '#ffd84d', '#4db8ff', '#7dd87a', '#b04dff', '#ff9a3d'];

function spawnConfetti(x, y, n = 18, colors = CONFETTI) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 4;
    app.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2.5, g: 0.16, life: 40 + Math.random() * 30, max: 70,
      color: colors[Math.floor(Math.random() * colors.length)], size: 3 + Math.random() * 3, shape: 'rect', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    });
  }
}
function spawnSparkles(x, y, n = 10, color = '#fff6a0') {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 0.5 + Math.random() * 2;
    app.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.6, g: 0, life: 25 + Math.random() * 20, max: 45, color, size: 3 + Math.random() * 3, shape: 'star', rot: 0, vr: 0.1 });
  }
}
function spawnSplat(x, y, color, n = 14) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3.5;
    app.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, g: 0.12, life: 22 + Math.random() * 14, max: 36, color, size: 3 + Math.random() * 4, shape: 'circ', rot: 0, vr: 0 });
  }
}
function spawnPuff(x, y) {
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    app.particles.push({ x, y, vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 1.2 - 0.4, g: -0.01, life: 28, max: 28, color: 'rgba(255,255,255,0.8)', size: 9 + Math.random() * 6, shape: 'circ', rot: 0, vr: 0, grow: 0.3 });
  }
}
function spawnFloater(x, y, str, color = '#fff', size = 22) { app.floaters.push({ x, y, text: str, color, size, life: 60 }); }
function spawnProjectile(from, to, kind) {
  app.projectiles.push({ x0: from.x, y0: from.y - 18, x1: to.x, y1: to.y - 14, t: 0, dur: Math.max(14, Math.hypot(to.x - from.x, to.y - from.y) / 14), kind });
}

function updateEffects() {
  for (const p of app.particles) { p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life--; p.rot += p.vr; if (p.grow) p.size += p.grow; }
  app.particles = app.particles.filter((p) => p.life > 0);
  for (const f of app.floaters) { f.y -= 0.7; f.life--; }
  app.floaters = app.floaters.filter((f) => f.life > 0);
  for (const pr of app.projectiles) pr.t++;
  const done = app.projectiles.filter((pr) => pr.t >= pr.dur);
  for (const pr of done) {
    if (pr.kind === 'pie') spawnSplat(pr.x1, pr.y1 + 8, '#f2c94c', 12);
    else if (pr.kind === 'glitter') { spawnConfetti(pr.x1, pr.y1 + 8, 22); spawnSparkles(pr.x1, pr.y1 + 8, 10); }
    else if (pr.kind === 'pizza') spawnSplat(pr.x1, pr.y1 + 8, '#e8503a', 12);
  }
  app.projectiles = app.projectiles.filter((pr) => pr.t < pr.dur);
  if (app.banner && --app.banner.ttl <= 0) app.banner = null;
}

function drawParticles() {
  for (const p of app.particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / (p.max * 0.6)));
    if (p.shape === 'rect') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); rrect(-p.size / 2, -p.size / 4, p.size, p.size / 2, 1, p.color); ctx.restore(); }
    else if (p.shape === 'star') star(p.x, p.y, p.size, p.color, 4);
    else circ(p.x, p.y, p.size, p.color);
  }
  ctx.globalAlpha = 1;
  for (const pr of app.projectiles) {
    const k = Math.min(1, pr.t / pr.dur);
    const x = pr.x0 + (pr.x1 - pr.x0) * k, y = pr.y0 + (pr.y1 - pr.y0) * k - Math.sin(k * Math.PI) * 40;
    ell(x, y + 18 - Math.sin(k * Math.PI) * 0, 8, 3, 'rgba(0,0,0,0.2)');
    if (pr.kind === 'pie') { ell(x, y, 9, 4, '#e8eef8'); ell(x, y - 3, 8, 5, '#f2c94c'); circ(x, y - 6, 3, '#fffbe8'); }
    else if (pr.kind === 'pizza') { poly([x - 8, y - 4, x + 8, y - 4, x, y + 9], '#f2c94c'); circ(x - 1, y - 1, 2, '#d63a3a'); circ(x + 3, y - 2, 1.6, '#d63a3a'); }
    else { star(x, y, 9, '#ffd84d', 4); circ(x + 8, y - 6, 2, '#ff4d8d'); circ(x - 8, y + 5, 2, '#4db8ff'); }
  }
  for (const f of app.floaters) {
    ctx.globalAlpha = Math.min(1, f.life / 20);
    text(f.text, f.x, f.y, f.size, f.color, 'center', TITLE_FONT, true);
  }
  ctx.globalAlpha = 1;
}

// ---- the board ----
function drawFloor() {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const px = BOARD_X + x * CELL, py = BOARD_Y + y * CELL;
      const odd = (x + y) % 2;
      ctx.fillStyle = odd ? '#2f3552' : '#383f60'; ctx.fillRect(px, py, CELL, CELL);
      ctx.fillStyle = 'rgba(140,200,255,0.10)'; ctx.fillRect(px, py, CELL, 1); ctx.fillRect(px, py, 1, CELL);
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(px, py + CELL - 2, CELL, 2); ctx.fillRect(px + CELL - 2, py, 2, CELL);
      if ((x * 7 + y * 3) % 5 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.fillRect(px + 10, py + 14, 22, 3); }
    }
  }
  ctx.strokeStyle = '#0d1022'; ctx.lineWidth = 4; ctx.strokeRect(BOARD_X + 2, BOARD_Y + 2, COLS * CELL - 4, ROWS * CELL - 4);
}

const HIGHLIGHT = {
  move: ['rgba(70,160,255,0.38)', '#3b8fe8'],
  attack: ['rgba(255,80,80,0.45)', '#ff5050'],
  target: ['rgba(255,215,70,0.5)', '#e8b820'],
  ready: ['rgba(255,255,255,0.18)', '#ffffff'],
};

function drawHighlights() {
  for (const [key, kind] of app.highlight) {
    const [x, y] = key.split(',').map(Number);
    const [fill, edge] = HIGHLIGHT[kind];
    const px = BOARD_X + x * CELL, py = BOARD_Y + y * CELL;
    const pulse = kind === 'attack' || kind === 'ready' ? 0.75 + 0.25 * Math.sin(app.tick * 0.15) : 1;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = fill; ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
    ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.strokeRect(px + 3, py + 3, CELL - 6, CELL - 6);
    ctx.globalAlpha = 1;
  }
}

function viewOf(u) {
  let v = app.views.get(u.id);
  if (!v) {
    const c = cellCenter(u.x, u.y);
    v = { x: c.x, y: c.y, pop: 1, lunge: null, moving: false };
    app.views.set(u.id, v);
  }
  return v;
}

function updateViews() {
  if (!app.game) return;
  for (const id of [...app.views.keys()]) if (!app.game.units.some((u) => u.id === id)) app.views.delete(id);
  for (const u of app.game.units) {
    const v = viewOf(u), c = cellCenter(u.x, u.y);
    const dx = c.x - v.x, dy = c.y - v.y;
    v.moving = Math.hypot(dx, dy) > 2;
    if (app.fast || Math.hypot(dx, dy) < 0.6) { v.x = c.x; v.y = c.y; } else { v.x += dx * 0.24; v.y += dy * 0.24; }
    if (v.pop < 1) v.pop = Math.min(1, v.pop + 0.07);
    if (v.lunge) { v.lunge.t += 0.09; if (v.lunge.t >= 1) v.lunge = null; }
  }
}

function drawBuffIcons(w, x, y) {
  let i = 0;
  for (const [buff, col] of [['shield', '#4aa3ff'], ['wand', '#ffd84d'], ['wings', '#ffffff']]) {
    if (!w.buffs[buff]) continue;
    const bx = x + 18, by = y - 24 + i * 13;
    circ(bx, by, 6, 'rgba(0,0,0,0.45)');
    if (buff === 'shield') { poly([bx - 3.5, by - 4, bx + 3.5, by - 4, bx + 3.5, by + 1, bx, by + 5, bx - 3.5, by + 1], col); }
    else if (buff === 'wand') { line(bx - 3, by + 3, bx + 3, by - 3, 1.6, '#c9a46a'); star(bx + 3, by - 3, 3, col, 4); }
    else { ell(bx - 2.5, by, 2.5, 4.5, col, 0.4); ell(bx + 2.5, by, 2.5, 4.5, col, -0.4); }
    i++;
  }
}

function drawUnit(u) {
  const g = app.game, v = viewOf(u), owner = g.wizards[u.owner];
  let px = v.x, py = v.y + 20;
  if (v.lunge) { const k = Math.sin(v.lunge.t * Math.PI) * 16; px += v.lunge.dx * k; py += v.lunge.dy * k; }
  const t = app.tick;
  const pop = v.pop;
  // owner ring and shadow
  ell(px, py - 1, 20 * pop, 7 * pop, rgba(owner.color, 0.4));
  ctx.strokeStyle = owner.color; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(px, py - 1, 20 * pop, 7 * pop, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.save(); ctx.translate(px, py); ctx.scale(pop, pop);
  if (u.type === 'wizard') {
    drawFamiliar(owner.familiar, -21, 0, t);
    drawWizardSprite(owner, t, { moving: v.moving });
    drawBuffIcons(owner, 0, 0);
  } else {
    drawCreature(u.type, 0, 0, t, { phase: u.id });
    if (u.fresh) { ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.4 * Math.sin(t * 0.15)})`; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.ellipse(0, -1, 24, 9, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
  }
  if (u.giggle > 0) text('...', 0, -54 + Math.sin(t * 0.3) * 2, 20, '#ffb0d0', 'center', TITLE_FONT, true);
  ctx.restore();
  if (app.selected === u.id) {
    ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(v.x, v.y + 6, 25 + Math.sin(t * 0.2) * 1.5, 0, Math.PI * 2); ctx.stroke();
  }
  if (app.current === u.owner && u.type === 'wizard') {
    poly([v.x - 6, v.y - 36 + Math.sin(t * 0.2) * 3, v.x + 6, v.y - 36 + Math.sin(t * 0.2) * 3, v.x, v.y - 28 + Math.sin(t * 0.2) * 3], owner.color);
  }
}

// Spilled ink (a glossy black puddle) and secret passages (a hidden bookcase door; twins share a colour).
function drawTerrain() {
  for (const t of app.game.terrain) {
    const c = cellCenter(t.x, t.y), tick = app.tick;
    ctx.save();
    if (t.kind === 'ink') {
      ctx.globalAlpha = 0.55 + 0.45 * (t.ttl / INK_ROUNDS); // fades as it dries
      // a flat, irregular blot with a glossy sheen, so it reads as a puddle and not a ball
      ell(c.x, c.y + 14, 26, 12, '#0b0818'); ell(c.x - 10, c.y + 11, 15, 9, '#0b0818'); ell(c.x + 12, c.y + 17, 12, 6, '#0b0818'); ell(c.x + 4, c.y + 9, 9, 5, '#0b0818');
      ell(c.x - 4, c.y + 13, 16, 7, '#171034');
      ctx.strokeStyle = 'rgba(160,120,255,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(c.x - 6, c.y + 12, 11, 4.5, 0, Math.PI * 1.15, Math.PI * 1.75); ctx.stroke();
      circ(c.x + 18, c.y + 8 + Math.sin(tick * 0.05 + t.x) * 1, 1.8, 'rgba(150,110,255,0.7)'); circ(c.x - 19, c.y + 20, 1.6, '#0b0818');
    } else {
      const col = ['#c9a0ff', '#5ee8d0', '#ffb347'][t.pair % 3];
      rrect(c.x - 18, c.y - 26, 36, 52, 3, '#2a1a10'); rrect(c.x - 14, c.y - 22, 28, 44, 2, '#0a0610');
      for (const [k, bc] of [[0, '#8a3a3a'], [1, '#3a5a8a'], [2, '#8a7a3a'], [3, '#3a8a5a']]) rrect(c.x - 15 + k * 8, c.y - 31, 6, 8, 1, bc);
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(tick * 0.08 + t.pair);
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.strokeRect(c.x - 14, c.y - 22, 28, 44);
      circ(c.x, c.y, 5, rgba(col, 0.5));
      if (t.ttl <= 1) { ctx.globalAlpha = 0.9; text('!', c.x + 14, c.y - 24, 16, '#ffb0b0', 'center', TITLE_FONT, true); } // about to seal
    }
    ctx.restore();
  }
}

function drawBoard() {
  drawFloor();
  const g = app.game;
  for (const b of g.blobs) { const c = cellCenter(b.x, b.y); drawBlobSprite(c.x, c.y + 24, app.tick, b.x * 3 + b.y); }
  drawTerrain();
  drawHighlights();
  const sorted = [...g.units].sort((a, b) => viewOf(a).y - viewOf(b).y);
  for (const u of sorted) drawUnit(u);
  if (app.showCursor && app.cursor) {
    const px = BOARD_X + app.cursor.x * CELL, py = BOARD_Y + app.cursor.y * CELL;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.shadowColor = '#fff'; ctx.shadowBlur = 8;
    ctx.strokeRect(px + 2, py + 2, CELL - 4, CELL - 4); ctx.shadowBlur = 0;
  }
  drawParticles();
}

// ---- bars and panels ----
function drawTopBar() {
  const grad = ctx.createLinearGradient(0, 0, 0, BOARD_Y);
  grad.addColorStop(0, '#2a1d5e'); grad.addColorStop(1, '#171236');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, VIEW_W, BOARD_Y);
  ctx.fillStyle = '#ffd400'; ctx.fillRect(0, BOARD_Y - 8, VIEW_W, 8); // hazard tape
  for (let x = -8; x < VIEW_W; x += 24) poly([x, BOARD_Y, x + 12, BOARD_Y, x + 20, BOARD_Y - 8, x + 8, BOARD_Y - 8], '#111');
  text('MAYHEM ACADEMY', 16, 22, 24, '#ffe066', 'left', TITLE_FONT, true);
  if (app.game) {
    text(`Round ${Math.min(app.game.round, MAX_ROUNDS)} of ${MAX_ROUNDS}`, 420, 22, 20, '#fff', 'center');
    text(app.phaseLabel || '', 640, 22, 16, '#bcd0ff', 'center');
  }
  text(Sound.muted ? 'M: sound off' : 'M: sound on', VIEW_W - 14, 22, 12, '#8fa0d0', 'right');
}

function drawSidePanel() {
  const g = app.game;
  ctx.fillStyle = '#1a1838'; ctx.fillRect(PANEL_X, BOARD_Y, VIEW_W - PANEL_X, VIEW_H - BOARD_Y);
  ctx.fillStyle = '#f2c94c'; ctx.fillRect(PANEL_X, BOARD_Y, 3, VIEW_H - BOARD_Y);
  text('PUPILS', PANEL_X + 92, BOARD_Y + 18, 15, '#bcd0ff', 'center', FONT);
  g.wizards.forEach((w, i) => {
    const y = BOARD_Y + 34 + i * 100, x = PANEL_X + 8, cw = VIEW_W - PANEL_X - 16;
    const active = app.current === w.id && w.alive;
    ctx.save();
    if (!w.alive) ctx.globalAlpha = 0.45;
    rrect(x, y, cw, 92, 10, active ? rgba(w.color, 0.28) : 'rgba(255,255,255,0.06)');
    ctx.strokeStyle = active ? w.color : rgba(w.color, 0.55); ctx.lineWidth = active ? 3 : 1.5;
    ctx.beginPath(); ctx.roundRect(x, y, cw, 92, 10); ctx.stroke();
    ctx.save(); ctx.translate(x + 28, y + 76); ctx.scale(1.15, 1.15); drawWizardSprite(w, app.tick, {}); ctx.restore();
    fitText(w.name, x + 58, y + 16, cw - 64, 14, '#fff');
    text(w.human ? 'HUMAN' : 'COMPUTER', x + 58, y + 34, 10, w.human ? '#7dd87a' : '#9fb0d8');
    if (w.alive) {
      text(`Pets: ${creaturesOf(g, w.id).length}`, x + 58, y + 54, 13, '#e6ecff');
      text(`Spells: ${w.hand.filter((h) => !h.used).length}`, x + 58, y + 72, 13, '#e6ecff');
    } else {
      text('IN DETENTION', x + 58, y + 62, 13, '#ffb0b0');
    }
    ctx.restore();
  });
}

function drawBottomBar() {
  ctx.fillStyle = '#171236'; ctx.fillRect(0, BOTTOM_Y, PANEL_X, VIEW_H - BOTTOM_Y);
  ctx.fillStyle = '#f2c94c'; ctx.fillRect(0, BOTTOM_Y, PANEL_X, 3);
  const room = PANEL_X - 32 - (app.showEndTurn ? 150 : 0); // leave space for the End turn button
  fitText(app.status || '', 16, BOTTOM_Y + 22, PANEL_X - 32, 22, '#fff');
  fitText(app.info || '', 16, BOTTOM_Y + 49, room, 15, '#bcd0ff', 'left', FONT);
  fitText(app.hint || '', 16, BOTTOM_Y + 68, room, 13, '#8fa0d0', 'left', FONT);
  if (app.showEndTurn) {
    rrect(PANEL_X - 140, BOTTOM_Y + 36, 124, 38, 10, '#7dd87a');
    text('End turn', PANEL_X - 78, BOTTOM_Y + 55, 18, '#143a14', 'center');
    hit('endturn', PANEL_X - 140, BOTTOM_Y + 36, 124, 38);
  }
}

function drawBanner() {
  const b = app.banner;
  if (!b) return;
  const k = Math.min(1, (b.ttl0 - b.ttl) / 8);
  const y = BOARD_Y + 58 - (1 - k) * 40;
  ctx.font = `bold 28px ${TITLE_FONT}`;
  const w = Math.max(320, ctx.measureText(b.text).width + 60);
  ctx.save(); ctx.globalAlpha = Math.min(1, b.ttl / 10);
  rrect(PANEL_X / 2 - w / 2, y - 28, w, b.sub ? 70 : 48, 24, 'rgba(15,12,40,0.9)');
  ctx.strokeStyle = b.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(PANEL_X / 2 - w / 2, y - 28, w, b.sub ? 70 : 48, 24); ctx.stroke();
  text(b.text, PANEL_X / 2, y - 4, 28, b.color, 'center', TITLE_FONT, true);
  if (b.sub) text(b.sub, PANEL_X / 2, y + 28, 15, '#dfe8ff', 'center', FONT);
  ctx.restore();
}

// ---- spell cards ----
const CARD_W = 108, CARD_H = 170, CARD_GAP = 10;

function cardRect(i) {
  const col = i % 7, row = Math.floor(i / 7);
  return { x: 12 + col * (CARD_W + CARD_GAP), y: BOARD_Y + 76 + row * (CARD_H + CARD_GAP), w: CARD_W, h: CARD_H };
}

function drawSpellCard(item, avail, r, selected, t) {
  const sp = SPELL_BY_ID[item.spell], style = KIND_STYLE[sp.kind];
  const lift = selected ? -8 : 0;
  ctx.save(); ctx.translate(r.x, r.y + lift);
  const usable = !item.used && avail.ok;
  ctx.globalAlpha = usable ? 1 : 0.5;
  if (selected) { ctx.shadowColor = '#ffe066'; ctx.shadowBlur = 18; }
  rrect(0, 0, r.w, r.h, 9, '#fff8e6');
  ctx.shadowBlur = 0;
  ctx.strokeStyle = selected ? '#ffe066' : style.color; ctx.lineWidth = selected ? 4 : 3; ctx.beginPath(); ctx.roundRect(0, 0, r.w, r.h, 9); ctx.stroke();
  rrect(5, 5, r.w - 10, 22, 6, style.color);
  fitText(sp.name, r.w / 2, 16, r.w - 18, 13, '#fff', 'center', FONT, true);
  rrect(7, 31, r.w - 14, 62, 6, '#e8f1ff');
  ctx.save(); ctx.beginPath(); ctx.roundRect(7, 31, r.w - 14, 62, 6); ctx.clip();
  drawSpellIcon(sp, r.w / 2, 62, 46, t);
  ctx.restore();
  text(style.label, 12, 103, 10, style.color, 'left', FONT);
  if (sp.kind === 'summon') {
    const c = CREATURES[sp.creature];
    text(`A${c.atk} D${c.def} M${c.move}${c.flying ? ' fly' : ''}`, r.w - 10, 103, 10, '#556', 'right', FONT);
  }
  ctx.font = `11px ${FONT}`; ctx.fillStyle = '#3a3a55'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  wrapLines(sp.blurb, r.w - 16).slice(0, 4).forEach((ln, i) => ctx.fillText(ln, 8, 119 + i * 12.5));
  text(`${sp.success}%`, r.w - 8, r.h - 9, 12, '#7a5a10', 'right', FONT);
  ctx.restore();
  if (item.used || !avail.ok) {
    ctx.save(); ctx.translate(r.x + r.w / 2, r.y + r.h / 2 + lift); ctx.rotate(-0.35);
    rrect(-46, -13, 92, 26, 5, 'rgba(20,16,50,0.85)');
    text(item.used ? 'USED' : avail.reason.toUpperCase(), 0, 0, item.used ? 16 : 11, item.used ? '#ffb0b0' : '#ffe066', 'center', FONT);
    ctx.restore();
  }
}

function drawSpellbook(ov) {
  const w = ov.wizard, g = app.game;
  ctx.fillStyle = 'rgba(12,8,36,0.94)'; ctx.fillRect(BOARD_X, BOARD_Y, PANEL_X, ROWS * CELL);
  text(`${w.name}'s Spellbook`, PANEL_X / 2, BOARD_Y + 24, 28, w.color, 'center', TITLE_FONT, true);
  text('Pick one spell for this round. Each card can only be used once.', PANEL_X / 2, BOARD_Y + 54, 15, '#dfe8ff', 'center');
  ov.cards.forEach((c, i) => {
    const r = cardRect(i);
    hit('card:' + i, r.x, r.y, r.w, r.h);
    drawSpellCard(c.item, c.avail, r, ov.index === i, app.tick);
  });
  // the "take a nap" button
  const napSel = ov.index === ov.cards.length;
  const nap = { x: 520, y: BOARD_Y + 76 + 2 * (CARD_H + CARD_GAP) + 4, w: 300, h: 38 };
  hit('card:' + ov.cards.length, nap.x, nap.y, nap.w, nap.h);
  rrect(nap.x, nap.y, nap.w, nap.h, 10, napSel ? '#ffe066' : 'rgba(255,255,255,0.12)');
  text("Can't be bothered (skip this round)", nap.x + nap.w / 2, nap.y + nap.h / 2, 16, napSel ? '#3a2a00' : '#dfe8ff', 'center');
  // detail for the highlighted card
  const dy = BOARD_Y + 76 + 2 * (CARD_H + CARD_GAP) - 4;
  if (ov.index < ov.cards.length) {
    const c = ov.cards[ov.index], sp = SPELL_BY_ID[c.item.spell];
    text(sp.name, 18, dy + 12, 20, '#ffe066', 'left', TITLE_FONT);
    ctx.font = `15px ${FONT}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const lines = wrapLines(sp.blurb, 480);
    lines.forEach((ln, i) => ctx.fillText(ln, 18, dy + 36 + i * 18));
    const fy = dy + 36 + lines.length * 18 + 4;
    ctx.font = `italic 15px ${FONT}`; ctx.fillStyle = '#ffb3d9';
    ctx.fillText(`"${sp.flavour}"`, 18, fy);
    const why = c.item.used ? 'Already used.' : (c.avail.ok ? `Works ${sp.success}% of the time.${sp.range ? ` Reaches ${sp.range} squares.` : ''}${sp.note ? ' ' + sp.note : ''}` : c.avail.reason + '.');
    ctx.font = `13px ${FONT}`; ctx.fillStyle = '#9fb0d8';
    wrapLines(why, 440).slice(0, lines.length > 1 ? 2 : 3).forEach((ln, i) => ctx.fillText(ln, 18, fy + 22 + i * 16));
  }
  text('Arrow keys or mouse to look, Enter or click to choose', PANEL_X - 12, BOARD_Y + ROWS * CELL - 12, 13, '#8fa0d0', 'right');
}

function drawHandoff(ov) {
  const w = ov.wizard;
  ctx.fillStyle = 'rgba(12,8,36,0.98)'; ctx.fillRect(BOARD_X, BOARD_Y, PANEL_X, ROWS * CELL);
  ctx.save(); ctx.translate(PANEL_X / 2, BOARD_Y + 270); ctx.scale(3.4, 3.4); drawWizardSprite(w, app.tick, {}); ctx.restore();
  text(`Pass the keyboard to ${w.name}`, PANEL_X / 2, BOARD_Y + 60, 32, w.color, 'center', TITLE_FONT, true);
  text(ov.line, PANEL_X / 2, BOARD_Y + 104, 18, '#dfe8ff', 'center');
  text('Everybody else: look away!', PANEL_X / 2, BOARD_Y + 134, 18, '#ffb3d9', 'center');
  if (Math.floor(app.tick / 30) % 2 === 0) text('Press Enter when ready', PANEL_X / 2, BOARD_Y + 460, 24, '#fff', 'center', FONT, true);
  hit('handoff', BOARD_X, BOARD_Y, PANEL_X, ROWS * CELL);
}

function drawGameOver(ov) {
  const g = app.game, res = g.result;
  ctx.fillStyle = 'rgba(12,8,36,0.82)'; ctx.fillRect(BOARD_X, BOARD_Y, PANEL_X, ROWS * CELL);
  const winners = res.winners.map((id) => g.wizards[id]);
  const title = winners.length === 1 ? `${winners[0].name} wins!` : winners.length === 0 ? 'Nobody wins!' : 'A shared victory!';
  text(title, PANEL_X / 2, BOARD_Y + 110, 46, '#ffe066', 'center', TITLE_FONT, true);
  const why = res.reason === 'bell' ? 'The school bell rang. The most pets wins!' : 'The last pupil standing!';
  text(why, PANEL_X / 2, BOARD_Y + 156, 20, '#dfe8ff', 'center');
  winners.forEach((w, i) => {
    const x = PANEL_X / 2 + (i - (winners.length - 1) / 2) * 130;
    ctx.save(); ctx.translate(x, BOARD_Y + 330); ctx.scale(2.6, 2.6); drawWizardSprite(w, app.tick, {}); ctx.restore();
    fitText(w.name, x, BOARD_Y + 352, 120, 16, w.color, 'center');
  });
  if (Math.floor(app.tick / 30) % 2 === 0) text('Press Enter to play again', PANEL_X / 2, BOARD_Y + 470, 24, '#fff', 'center', FONT, true);
  hit('again', BOARD_X, BOARD_Y, PANEL_X, ROWS * CELL);
}

// ---- title and setup ----
function drawSkyAndCastle(t) {
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, '#0c0a2e'); sky.addColorStop(0.55, '#3a2a7a'); sky.addColorStop(1, '#8a4a9a');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  for (let k = 0; k < 60; k++) circ((k * 137) % VIEW_W, (k * 71) % 380, 1.2 + (k % 3) * 0.4, `rgba(255,255,255,${0.35 + 0.35 * Math.sin(t * 0.05 + k)})`);
  circ(880, 110, 40, '#fff6c8'); circ(896, 100, 36, '#3a2a7a');
  // castle silhouette
  ctx.fillStyle = '#1a1240';
  ctx.fillRect(130, 470, 764, 150);
  for (const [x, w, h] of [[150, 70, 150], [330, 90, 210], [480, 70, 170], [640, 90, 220], [790, 70, 150]]) {
    ctx.fillRect(x, 470 - h + 70, w, h);
    poly([x - 6, 470 - h + 72, x + w / 2, 470 - h - 20, x + w + 6, 470 - h + 72], '#241a58');
  }
  ctx.fillStyle = '#ffd84d';
  for (let k = 0; k < 24; k++) { if ((k * 7 + Math.floor(t / 50)) % 5 === 0) continue; ctx.fillRect(170 + (k % 8) * 85, 430 + Math.floor(k / 8) * 55, 12, 18); }
  ctx.fillStyle = '#0e0a28'; ctx.fillRect(0, 600, VIEW_W, 88);
}

function drawTitleScreen() {
  const t = app.tick;
  drawSkyAndCastle(t);
  // a parade of pets across the bottom
  const kinds = ['guineaPig', 'frog', 'cat', 'hamster', 'owl', 'pony', 'mummy', 'dragon', 'headteacher'];
  kinds.forEach((k, i) => {
    const x = ((t * (0.6 + (i % 3) * 0.25) + i * 130) % (VIEW_W + 120)) - 60;
    drawCreature(k, x, 662, t, { phase: i, scale: 1.1 });
  });
  ctx.save(); ctx.translate(VIEW_W / 2, 160); ctx.rotate(-0.04);
  text('MAYHEM', 0, -46, 108, '#f4ff3a', 'center', TITLE_FONT, true);
  text('ACADEMY', 0, 52, 108, '#ff3d9a', 'center', TITLE_FONT, true);
  ctx.restore();
  text('Wizard school. Zero supervision. Maximum mayhem.', VIEW_W / 2, 272, 22, '#dfe8ff', 'center');
  if (app.mode === 'title') {
    rrect(140, 378, 744, 218, 24, 'rgba(10,8,40,0.74)');
    if (Math.floor(t / 30) % 2 === 0) text('PRESS ENTER OR CLICK TO PLAY', VIEW_W / 2, 410, 30, '#fff', 'center', FONT, true);
    text('1 to 4 pupils on one computer, plus computer pupils. Keyboard and mouse.', VIEW_W / 2, 452, 16, '#bcd0ff', 'center');
    text('Summon feral pets, hurl custard pies and be the last pupil standing.', VIEW_W / 2, 478, 16, '#bcd0ff', 'center');
    hit('start', 0, 0, VIEW_W, VIEW_H);
    rrect(VIEW_W / 2 - 130, 508, 260, 44, 14, '#4a3a9a');
    ctx.strokeStyle = '#b57aff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(VIEW_W / 2 - 130, 508, 260, 44, 14); ctx.stroke();
    text('How to play  (H)', VIEW_W / 2, 530, 20, '#fff', 'center');
    hit('help', VIEW_W / 2 - 130, 508, 260, 44);
    if (!Sound.ctx && !Sound.unsupported) text('Press any key for music', VIEW_W / 2, 574, 14, '#9fb0d8', 'center');
  }
}

function drawSetup() {
  const s = app.setup;
  const rowsN = 2 + s.humans;
  const x0 = 172, w = 680, y0 = 140, h = 130 + rowsN * 46 + 70;
  rrect(x0, y0, w, h, 18, '#0c0828');
  ctx.strokeStyle = '#f2c94c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(x0, y0, w, h, 18); ctx.stroke();
  text('Who is playing?', VIEW_W / 2, y0 + 30, 30, '#ffe066', 'center', TITLE_FONT, true);
  const counter = (row, label, value, minus, plus, y) => {
    const on = s.row === row;
    if (on) rrect(x0 + 14, y - 20, w - 28, 40, 10, 'rgba(255,255,255,0.1)');
    text(label, x0 + 34, y, 20, '#fff');
    rrect(x0 + 400, y - 16, 34, 32, 8, '#3a3a7a'); text('-', x0 + 417, y - 1, 24, '#fff', 'center');
    text(String(value), x0 + 470, y, 26, '#ffe066', 'center');
    rrect(x0 + 504, y - 16, 34, 32, 8, '#3a3a7a'); text('+', x0 + 521, y - 1, 24, '#fff', 'center');
    hit(minus, x0 + 400, y - 16, 34, 32); hit(plus, x0 + 504, y - 16, 34, 32); hit('row:' + row, x0 + 14, y - 20, 380, 40);
  };
  counter(0, 'Human pupils', s.humans, 'h-', 'h+', y0 + 84);
  counter(1, 'Computer pupils', s.ai, 'a-', 'a+', y0 + 130);
  for (let i = 0; i < s.humans; i++) {
    const y = y0 + 176 + i * 46, row = 2 + i, on = s.row === row;
    if (on) rrect(x0 + 14, y - 20, w - 28, 40, 10, 'rgba(255,255,255,0.1)');
    const col = ROBE_COLORS[s.colors[i]].hex;
    ctx.save(); ctx.translate(x0 + 44, y + 17); ctx.scale(0.75, 0.75); drawWizardSprite({ color: col, hat: HATS[(i + 1) % 4], familiar: 'cat' }, app.tick, {}); ctx.restore();
    rrect(x0 + 86, y - 16, 230, 32, 8, on ? '#fff' : 'rgba(255,255,255,0.85)');
    const cursor = on && Math.floor(app.tick / 25) % 2 === 0 ? '|' : '';
    fitText(s.names[i] + cursor, x0 + 96, y, 212, 20, '#222');
    hit('name:' + i, x0 + 86, y - 16, 230, 32);
    ROBE_COLORS.forEach((c, j) => {
      const sx = x0 + 340 + j * 38;
      circ(sx + 14, y, 13, c.hex);
      if (s.colors[i] === j) { ring(sx + 14, y, 16, 3, '#fff'); }
      hit(`color:${i}:${j}`, sx, y - 15, 30, 30);
    });
  }
  const sy = y0 + 176 + s.humans * 46 + 14, on = s.row === rowsN;
  rrect(VIEW_W / 2 - 110, sy, 220, 46, 14, on ? '#ffe066' : '#7dd87a');
  text('START!', VIEW_W / 2, sy + 23, 26, '#2a2000', 'center', TITLE_FONT);
  hit('startgame', VIEW_W / 2 - 110, sy, 220, 46);
  text(`${s.humans + s.ai} pupils in all. Up and Down to move, Left and Right to change, type to name a pupil. Esc goes back.`, VIEW_W / 2, y0 + h - 18, 14, '#9fb0d8', 'center');
}


// ---- the "How to play" pages ----
const HELP_PAGES = 4;

// Draw a paragraph of wrapped text and return the y where the next one can start.
function para(str, x, y, maxW, size, color, lineH = size + 6, italic = false) {
  ctx.font = `${italic ? 'italic ' : ''}${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const lines = wrapLines(str, maxW);
  lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lineH));
  return y + lines.length * lineH;
}

function helpFrame(title, page) {
  drawSkyAndCastle(app.tick);
  rrect(48, 36, 928, 616, 20, 'rgba(10,8,40,0.97)');
  ctx.strokeStyle = '#f2c94c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(48, 36, 928, 616, 20); ctx.stroke();
  text(title, 512, 80, 38, '#ffe066', 'center', TITLE_FONT, true);
  const last = page === HELP_PAGES - 1;
  if (page > 0) { rrect(72, 598, 150, 40, 10, '#3a3a7a'); text('Back', 147, 618, 18, '#fff', 'center'); hit('helpPrev', 72, 598, 150, 40); }
  rrect(802, 598, 150, 40, 10, last ? '#ffe066' : '#7dd87a'); text(last ? 'Got it!' : 'Next', 877, 618, 18, '#1a2a10', 'center'); hit('helpNext', 802, 598, 150, 40);
  for (let i = 0; i < HELP_PAGES; i++) circ(512 + (i - (HELP_PAGES - 1) / 2) * 22, 618, i === page ? 6 : 4, i === page ? '#ffe066' : '#5a5a8a');
  text('Left and Right arrows turn the page. Esc goes back to the title.', 512, 640, 12, '#8fa0d0', 'center');
}

function helpPageGoal() {
  helpFrame('How to play', 0);
  para('Welcome to Mayhem Academy: wizard school with zero supervision. Wreck the other pupils with feral pets and dodgy spells. Last one standing wins.', 90, 130, 844, 20, '#dfe8ff', 26);
  const steps = [
    { n: 1, title: 'Choose a spell', body: 'Everyone secretly picks one card from their spellbook. Each card can only be used once.' },
    { n: 2, title: 'Cast spells', body: 'Spells go off one at a time. Summon feral pets, hurl pies or grab a coffin lid. Some spells fizzle!' },
    { n: 3, title: 'Move and fight', body: 'Send your pets and your pupil after the opposition. Bump into an enemy to fight. The loser goes POOF!' },
  ];
  steps.forEach((st, i) => {
    const x = 84 + i * 292, y = 190;
    rrect(x, y, 276, 290, 16, 'rgba(255,255,255,0.07)');
    circ(x + 32, y + 32, 20, '#ffe066'); text(String(st.n), x + 32, y + 33, 24, '#3a2a00', 'center', TITLE_FONT);
    text(st.title, x + 64, y + 32, 22, '#fff', 'left', TITLE_FONT);
    ctx.save(); ctx.translate(x + 138, y + 150);
    if (i === 0) { rrect(-34, -52, 68, 92, 8, '#fff8e6'); rrect(-30, -48, 60, 16, 5, '#ff9a3d'); drawSpellIcon(SPELL_BY_ID.pie, 0, -4, 38, app.tick); text('85%', 24, 34, 11, '#7a5a10', 'right'); }
    else if (i === 1) { ctx.scale(2.2, 2.2); ctx.translate(0, 26); drawWizardSprite({ color: '#a259e6', hat: 'star' }, app.tick, {}); }
    else { ctx.scale(2.2, 2.2); ctx.translate(-14, 24); drawCreature('cat', 0, 0, app.tick); drawCreature('guineaPig', 30, 0, app.tick, { flip: true, phase: 3 }); }
    ctx.restore();
    para(st.body, x + 16, y + 218, 244, 16, '#dfe8ff', 21);
  });
  para('After 15 rounds the school bell rings, and whoever has the most pets wins. A beaten pupil is sent to detention, and their pets vanish.', 90, 520, 844, 18, '#ffd9a8', 24);
}

function helpPageFight() {
  helpFrame('Moving and fighting', 1);
  // a tiny board: a cat that can walk to blue squares and attack the guinea pig
  const bx = 70, by = 120, c = 56, cols = 5, rows = 3;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { ctx.fillStyle = (x + y) % 2 ? '#e6d5ab' : '#f0e2c0'; ctx.fillRect(bx + x * c, by + y * c, c, c); }
  const catC = { x: 1, y: 1 }, pigC = { x: 2, y: 1 };
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if ((x === catC.x && y === catC.y) || (x === pigC.x && y === pigC.y)) continue;
    if (dist(x, y, catC.x, catC.y) <= 2) { ctx.fillStyle = 'rgba(70,160,255,0.4)'; ctx.fillRect(bx + x * c + 1, by + y * c + 1, c - 2, c - 2); ctx.strokeStyle = '#3b8fe8'; ctx.lineWidth = 2; ctx.strokeRect(bx + x * c + 3, by + y * c + 3, c - 6, c - 6); }
  }
  ctx.fillStyle = 'rgba(255,80,80,0.45)'; ctx.fillRect(bx + pigC.x * c + 1, by + pigC.y * c + 1, c - 2, c - 2);
  ctx.strokeStyle = '#ff5050'; ctx.lineWidth = 2; ctx.strokeRect(bx + pigC.x * c + 3, by + pigC.y * c + 3, c - 6, c - 6);
  for (const [cc, col, type] of [[catC, '#3b9be8', 'cat'], [pigC, '#e63946', 'guineaPig']]) {
    const px = bx + cc.x * c + c / 2, py = by + cc.y * c + c / 2 + 20;
    ell(px, py - 1, 20, 7, rgba(col, 0.4)); ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(px, py - 1, 20, 7, 0, 0, Math.PI * 2); ctx.stroke();
    drawCreature(type, px, py, app.tick, { phase: cc.x });
  }
  text('Blue: where it can walk', bx + 4, by + rows * c + 18, 15, '#7fb8ff', 'left');
  text('Red: who it can attack', bx + 4, by + rows * c + 40, 15, '#ff8a8a', 'left');
  let y = para('Click a glowing pet or pupil, then click a blue square to move or a red square to attack.', 380, 140, 560, 18, '#fff', 24);
  y = para('A pet can move and then attack, once each round. Brand new pets have a dotted ring: they wait until next round.', 380, y + 8, 560, 18, '#dfe8ff', 24);
  y = para('Flyers (the owl and the dragon) go over other things. The Pizza Dragon throws hot pizza from 4 squares away. Pets can eat slime.', 380, y + 8, 560, 18, '#dfe8ff', 24);
  // the dice example
  rrect(70, 372, 884, 200, 16, 'rgba(255,255,255,0.07)');
  text('How a fight works: dice!', 512, 396, 22, '#ffe066', 'center', TITLE_FONT);
  const die = (x, y, n, col) => { rrect(x, y, 44, 44, 9, '#fff'); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(x, y, 44, 44, 9); ctx.stroke(); text(String(n), x + 22, y + 23, 26, '#222', 'center'); };
  drawCreature('cat', 150, 490, app.tick, { scale: 1.3 });
  text('Cat With A Grudge attacks', 150, 512, 14, '#dfe8ff', 'center');
  text('Attack 5', 262, 462, 17, '#fff', 'center'); text('+', 310, 462, 22, '#ffe066', 'center'); die(330, 438, 4, '#e63946'); text('= 9', 410, 462, 24, '#7dd87a', 'center');
  drawCreature('guineaPig', 640, 490, app.tick, { flip: true, scale: 1.3, phase: 2 });
  text('Feral Guinea Pig defends', 640, 512, 14, '#dfe8ff', 'center');
  text('Defence 2', 738, 462, 17, '#fff', 'center'); text('+', 802, 462, 22, '#ffe066', 'center'); die(824, 438, 3, '#3b9be8'); text('= 5', 902, 462, 24, '#ff8a8a', 'center');
  text('9 beats 5, so the guinea pig goes POOF!', 512, 548, 22, '#fff', 'center', TITLE_FONT);
  text('A tie goes to the defender. Pupils fight too: they have Attack 3 and Defence 4.', 512, 574, 14, '#bcd0ff', 'center');
}

function helpPageSpells() {
  helpFrame('Spell cards', 2);
  const rows = [
    { icon: SPELL_BY_ID.guineaPig, kind: 'summon', body: 'Summon a pet on an empty square near your pupil. Each pet has Attack, Defence and Moves, shown as A, D and M on its card.' },
    { icon: SPELL_BY_ID.pie, kind: 'bolt', body: 'Custard Pie hits one pupil or pet up to 6 squares away. Glitter Bomb splats everything in a 3x3 patch, even your own pets!' },
    { icon: SPELL_BY_ID.tickle, kind: 'tickle', body: 'Awkward Silence makes a pet freeze in embarrassment: it cannot move or attack this round.' },
    { icon: SPELL_BY_ID.shield, kind: 'self', body: 'Coffin Lid Shield, Dodgy Wand and Bat Wings make your pupil tougher, hit harder or fly, for the rest of the game.' },
    { icon: SPELL_BY_ID.blob, kind: 'blob', body: 'Canteen Slime spreads every round and poofs any pet it covers. Pupils are slime-proof, and pets can eat it.' },
    { icon: SPELL_BY_ID.ink, kind: 'ink', label: 'BOARD', body: 'They change the floor. Spilled Ink makes any pet on foot slide two squares further when it steps in. Secret Passage opens a hidden door and its twin on the far side of the school: step in one, out of the other. One trip and it collapses, or it seals after three rounds.' },
  ];
  rows.forEach((r, i) => {
    const y = 104 + i * 74;
    rrect(70, y, 884, 66, 12, 'rgba(255,255,255,0.07)');
    drawSpellIcon(r.icon, 120, y + (r.kind === 'summon' ? 28 : 33), r.kind === 'summon' ? 62 : 46, app.tick);
    const st = KIND_STYLE[r.kind];
    rrect(176, y + 8, 92, 22, 8, st.color); text(r.label || st.label, 222, y + 19, 12, '#1a1030', 'center');
    para(r.body, 290, y + 20, 650, 15, '#fff', 19);
  });
  para('Each card works once and has a success chance (like 85%). A spell that fizzles still uses up its card.', 90, 562, 844, 15, '#ffd9a8', 20);
}

function helpPageControls() {
  helpFrame('Controls and tips', 3);
  text('Controls', 270, 130, 24, '#ffe066', 'center', TITLE_FONT);
  const keys = [
    ['Mouse', 'Click squares, cards and buttons'],
    ['Arrows + Enter', 'Move the cursor and choose'],
    ['Tab', 'Jump to your next pet'],
    ['Space', 'End your move'],
    ['Esc', 'Let go of a pet'],
    ['M', 'Sound on or off'],
  ];
  keys.forEach(([k, d], i) => {
    const y = 168 + i * 56;
    rrect(70, y, 400, 46, 10, 'rgba(255,255,255,0.07)');
    rrect(80, y + 8, 124, 30, 7, '#4a3a9a'); text(k, 142, y + 23, 15, '#fff', 'center');
    para(d, 216, y + 23, 244, 15, '#dfe8ff', 18);
  });
  text('Tips', 740, 130, 24, '#ffe066', 'center', TITLE_FONT);
  let y = 164;
  for (const tip of [
    'Summon pets early. A pupil on their own is easy to catch.',
    'A Cardboard Fort makes a handy wall. A Coffin Lid Shield helps your pupil last longer.',
    'Playing with friends? Pass the keyboard, and no peeking at spell choices!',
    'Computer pupils play to win, so keep an eye on them.',
    'Round 15 is the last. Have the most pets when the bell rings!',
    'It is meant to be silly. Enjoy the mayhem!',
  ]) {
    star(512, y + 4, 6, '#ffe066');
    y = para(tip, 534, y + 4, 410, 16, '#fff', 22) + 12;
  }
}

function drawHelp() {
  const p = app.help ? app.help.page : 0;
  [helpPageGoal, helpPageFight, helpPageSpells, helpPageControls][p]();
}

// ---- the whole frame ----
function describeUnit(u) {
  const g = app.game, s = stats(g, u), owner = g.wizards[u.owner];
  const nums = `Attack ${s.atk} - Defence ${s.def} - Moves ${s.move}${s.flying ? ' - flies' : ''}${s.range ? ` - shoots ${s.range} squares` : ''}`;
  if (u.type === 'wizard') {
    const buffs = Object.keys(owner.buffs).filter((b) => owner.buffs[b]);
    return `${owner.name}, a pupil. ${nums}${buffs.length ? ` (${buffs.join(', ')})` : ''}`;
  }
  const state = u.fresh ? ' - just arrived, acts next round' : u.giggle > 0 ? ' - frozen in embarrassment' : '';
  return `${CREATURES[u.type].name} (${owner.name}). ${nums}${state}`;
}

function renderPlay() {
  const g = app.game;
  ctx.fillStyle = '#12102c'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawBoard();
  drawTopBar();
  drawSidePanel();
  drawBottomBar();
  drawBanner();
  const ov = app.overlay;
  if (ov) {
    if (ov.kind === 'spellbook') drawSpellbook(ov);
    else if (ov.kind === 'handoff') drawHandoff(ov);
    else if (ov.kind === 'gameOver') drawGameOver(ov);
    else throw new Error(`render: unknown overlay "${ov.kind}"`);
  }
  void g;
}

function renderFatal() {
  ctx.fillStyle = '#300'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  text('Something went wrong', VIEW_W / 2, 200, 34, '#fff', 'center');
  text(String(app.fatal.message || app.fatal), VIEW_W / 2, 270, 16, '#ffb0b0', 'center');
  text('See the browser console for details, then reload the page.', VIEW_W / 2, 320, 16, '#ffb0b0', 'center');
}

function render() {
  app.hits = [];
  if (app.fatal) { renderFatal(); return; }
  if (app.mode === 'title') drawTitleScreen();
  else if (app.mode === 'help') drawHelp();
  else if (app.mode === 'setup') { drawTitleScreen(); drawSetup(); }
  else renderPlay();
}
