'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const START_LIVES = 3;
const HI_SCORE_KEY = 'elf-bow-hiscore';
// index.html?playtest: play-test keys (N finishes the level, K loses a life). The same switch name as the other games.
const PLAYTEST = new URLSearchParams(location.search).has('playtest');

let LEVELS;
try {
  LEVELS = LEVEL_SPECS.map(buildLevel);
} catch (err) {
  console.error(err);
  drawFatal(err.message);
  throw err;
}

const G = {
  mode: 'title', // title | intro | play | dying | levelDone | gameOver | victory
  modeTimer: 0, tick: 0, paused: false,
  lives: START_LIVES, score: 0, hiScore: loadHiScore(),
  lv: null, bg: null, player: null, enemies: [], items: [], spawners: [], baubles: [], winEvents: [], winTimer: 0,
  delivered: 0, carried: [], timeLeft: 0, bonus: 0, deathReason: '',
  particles: [], floaters: [], snow: [], fullCooldown: 0,
};

for (let i = 0; i < 70; i++) G.snow.push({ x: Math.random() * VIEW_W, y: Math.random() * (VIEW_H - OY), r: 1 + Math.random() * 1.8, v: 0.3 + Math.random() * 0.7 });

function loadHiScore() {
  try {
    return Number(localStorage.getItem(HI_SCORE_KEY)) || 0;
  } catch (err) {
    console.warn('Could not read the saved high score:', err);
    return 0;
  }
}

function saveHiScore() {
  if (G.score <= G.hiScore) return;
  G.hiScore = G.score;
  try {
    localStorage.setItem(HI_SCORE_KEY, String(G.score));
  } catch (err) {
    console.warn('Could not save the high score:', err);
  }
}

// ---------- input ----------
const keys = {};
let jumpQueued = false;
const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'Enter'];

window.addEventListener('keydown', (e) => {
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  Sound.init();
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Space') jumpQueued = true;
  if (e.code === 'KeyM') Sound.muted = !Sound.muted;
  if (e.code === 'KeyP' && (G.mode === 'play' || G.mode === 'intro')) G.paused = !G.paused;
  if ((e.code === 'Enter' || e.code === 'Space') && (G.mode === 'title' || G.mode === 'gameOver' || G.mode === 'victory')) startGame();
  if (PLAYTEST && G.mode === 'play') {
    if (e.code === 'KeyN') finishLevel();
    if (e.code === 'KeyK') die('dog');
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k of Object.keys(keys)) keys[k] = false; if (G.mode === 'play') G.paused = true; });

// ---------- game flow ----------
function startGame() {
  G.lives = START_LIVES;
  G.score = 0;
  startLevel(0);
}

function startLevel(i) {
  const lv = LEVELS[i];
  G.lv = lv;
  G.bg = renderBackground(lv);
  G.items = lv.items.map((it) => ({ ...it, taken: false }));
  G.carried = [];
  G.enemies = lv.enemies.map(createEnemy);
  G.spawners = createSpawners(lv);
  G.baubles = [];
  G.winEvents = [];
  G.winTimer = 120;
  G.player = createPlayer(lv);
  G.delivered = 0;
  G.timeLeft = lv.time;
  G.particles = [];
  G.floaters = [];
  G.paused = false;
  jumpQueued = false;
  setMode('intro', 110);
}

function setMode(mode, timer = 0) { G.mode = mode; G.modeTimer = timer; }

function respawn() {
  resetPlayerPosition(G.player, G.lv);
  G.player.invuln = 120;
  G.enemies = G.lv.enemies.map(createEnemy);
  G.spawners = createSpawners(G.lv);
  G.baubles = [];
  if (G.deathReason === 'time') G.timeLeft = G.lv.time;
  setMode('play');
}

// A bauble hit knocks one item out of the elf's hands and it goes back where it started: the last
// item picked up. A wrapped present comes undone first, so the other three items stay in hand.
function loseOneItem(p) {
  const inv = p.inv;
  if (inv.wrapped) {
    inv.wrapped = false;
    for (const it of G.carried) inv[it.type] = true;
  }
  if (!G.carried.length) return false;
  const lost = G.carried.pop();
  inv[lost.type] = false;
  lost.taken = false;
  return true;
}

function die(reason) {
  G.deathReason = reason;
  G.lives--;
  Sound.play('caught');
  burst(G.player.x, G.player.y - 14, '#ffd84d', 18);
  setMode('dying', 80);
}

function finishLevel() {
  G.bonus = Math.ceil(G.timeLeft) * 10;
  G.score += G.bonus;
  Sound.play('win');
  setMode('levelDone', 170);
}

function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.5;
    const life = 30 + Math.random() * 20;
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life, maxLife: life, color, size: 1.5 + Math.random() * 2 });
  }
}

function floater(x, y, str, color = '#fff') { G.floaters.push({ x, y, text: str, color, life: 50 }); }

function near(p, c, r, rx = 22, ry = 20) {
  return Math.abs(p.x - (c + 0.5) * T) < rx && Math.abs((p.y - 14) - ((r + 1) * T - 14)) < ry;
}

function updateInteractions() {
  const p = G.player;
  if (G.fullCooldown > 0) G.fullCooldown--;
  for (const it of G.items) {
    if (it.taken || !near(p, it.c, it.r, 18, 24)) continue;
    if (p.inv[it.type]) {
      if (G.fullCooldown === 0) { floater(p.x, p.y - 50, 'Already carrying one!', '#ffb0b0'); Sound.play('full'); G.fullCooldown = 60; }
      continue;
    }
    it.taken = true;
    G.carried.push(it);
    p.inv[it.type] = true;
    G.score += 10;
    Sound.play('pickup');
    burst((it.c + 0.5) * T, (it.r + 1) * T - 14, '#fff6a0', 8);
  }
  const s = G.lv.station;
  if (p.inv.g && p.inv.p && p.inv.s && p.inv.r && !p.inv.wrapped && near(p, s.c, s.r, 26, 24)) {
    p.inv.g = p.inv.p = p.inv.s = p.inv.r = false;
    p.inv.wrapped = true;
    G.score += 50;
    Sound.play('wrap');
    burst(p.x, p.y - 20, '#ff4d8d', 16);
    floater(p.x, p.y - 56, 'Wrapped! +50', '#ffe066');
  }
  const tr = G.lv.tree;
  if (p.inv.wrapped && near(p, tr.c, tr.r, 34, 26)) {
    p.inv.wrapped = false;
    G.carried = [];
    G.delivered++;
    G.score += 100;
    Sound.play('deliver');
    burst((tr.c + 0.5) * T, (tr.r + 1) * T - 40, '#ffd84d', 22);
    floater(p.x, p.y - 56, 'Delivered! +100', '#7dff7a');
  }
}

// Every so often an owl pops up in a random window, or a star twinkles in one.
function updateWindowEvents() {
  if (!G.bg || !G.bg.windows.length) return;
  for (const e of G.winEvents) e.t++;
  G.winEvents = G.winEvents.filter((e) => e.t < e.dur);
  if (--G.winTimer > 0) return;
  G.winTimer = 240 + Math.random() * 420;
  const free = G.bg.windows.map((w, i) => i).filter((i) => !G.winEvents.some((e) => e.win === i));
  if (!free.length) return;
  const owl = Math.random() < 0.55;
  G.winEvents.push({
    win: free[Math.floor(Math.random() * free.length)], type: owl ? 'owl' : 'star', t: 0, dur: owl ? 280 : 200,
    dx: (Math.random() < 0.5 ? -24 : 14) + (Math.random() - 0.5) * 8, sy: 0.18 + Math.random() * 0.18, // keeps the star inside a pane, off the window bars
  });
}

function updateEffects() {
  updateWindowEvents();
  for (const q of G.particles) { q.x += q.vx; q.y += q.vy; q.vy += 0.06; q.life--; }
  G.particles = G.particles.filter((q) => q.life > 0);
  for (const f of G.floaters) { f.y -= 0.6; f.life--; }
  G.floaters = G.floaters.filter((f) => f.life > 0);
  for (const f of G.snow) {
    f.y += f.v; f.x += Math.sin((G.tick + f.r * 50) * 0.02) * 0.3;
    if (f.y > VIEW_H - OY) { f.y = -4; f.x = Math.random() * VIEW_W; }
  }
}

function updatePlay() {
  const p = G.player;
  const inp = {
    left: keys.ArrowLeft || keys.KeyA, right: keys.ArrowRight || keys.KeyD,
    up: keys.ArrowUp || keys.KeyW, down: keys.ArrowDown || keys.KeyS,
    jump: jumpQueued,
  };
  jumpQueued = false;
  if (updatePlayer(p, G.lv, inp) === 'jump') { Sound.play('jump'); p.noise = 40; }

  for (const e of G.enemies) {
    const before = e.state;
    updateEnemy(e, G.lv, p);
    if (before === 'asleep' && e.state === 'waking') Sound.play('wake');
  }
  const bauble = updateObstacles(G, p);
  if (bauble) {
    bonkPlayer(p, bauble.x);
    Sound.play('bonk');
    burst(p.x, p.y - 16, '#ffd84d', 10);
    floater(p.x, p.y - 56, loseOneItem(p) ? 'Bonk! Dropped one!' : 'Bonk!', '#ffd84d');
  }
  if (playerOnIce(p, G.lv) && Math.abs(p.slide) > 1.2 && Math.random() < 0.25) burst(p.x, p.y - 2, '#e8f6ff', 1);
  updateInteractions();
  if (G.delivered >= G.lv.quota) { finishLevel(); return; }

  if (p.invuln === 0) {
    const hit = G.enemies.find((e) => enemyCaughtPlayer(e, p));
    if (hit) { die(hit.kind); return; }
  }

  const before = Math.ceil(G.timeLeft);
  G.timeLeft -= 1 / 60;
  if (G.timeLeft <= 10 && Math.ceil(G.timeLeft) < before) Sound.play('tick');
  if (G.timeLeft <= 0) { G.timeLeft = 0; die('time'); }
}

function step() {
  G.tick++;
  if (G.paused) return;
  updateEffects();
  switch (G.mode) {
    case 'intro':
      if (--G.modeTimer <= 0) setMode('play');
      break;
    case 'play':
      updatePlay();
      break;
    case 'dying':
      if (--G.modeTimer <= 0) {
        if (G.lives <= 0) { saveHiScore(); Sound.play('gameover'); setMode('gameOver'); } else respawn();
      }
      break;
    case 'levelDone':
      if (--G.modeTimer <= 0) {
        if (G.lv.index + 1 < LEVELS.length) startLevel(G.lv.index + 1);
        else { saveHiScore(); setMode('victory'); }
      }
      break;
    default:
      break;
  }
}

function render() {
  if (G.mode === 'title') { drawTitle(G, G.tick); return; }
  drawGame(G);
  if (G.mode === 'gameOver') drawEndScreen(G, 'GAME OVER', '#e63946', 'The children woke up before the presents were wrapped...');
  if (G.mode === 'victory') drawEndScreen(G, 'CHRISTMAS SAVED!', '#f2c94c', 'Every present wrapped, every bow tied. Well done, elf!');
}

let last = performance.now(), acc = 0;
const STEP_MS = 1000 / 60;
function frame(now) {
  acc += Math.min(now - last, 100);
  last = now;
  while (acc >= STEP_MS) { step(); acc -= STEP_MS; }
  musicUpdate(G.mode === 'title');
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
