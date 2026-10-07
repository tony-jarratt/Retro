'use strict';

// The game flow: screens, keyboard and mouse, and turning rule events into pictures and sounds.

const BEST_KEY = 'atomic-castle-best';
const LOOK_KEY = 'atomic-castle-look';

function loadBest() {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (err) { console.warn('Could not read the saved best time:', err); return 0; }
}
function saveBest(seconds) {
  try { localStorage.setItem(BEST_KEY, String(Math.round(seconds))); } catch (err) { console.warn('Could not save the best time:', err); }
}

// The look: full colour by default. V switches to an optional monochrome look (tried, and colour won), and the choice is remembered.
function loadLook() {
  try { const v = localStorage.getItem(LOOK_KEY); return v === null ? 'colour' : v; } catch (err) { console.warn('Could not read the saved look:', err); return 'colour'; }
}
function setLook(mono, announce = true) {
  look.mono = !!mono && look.supported;
  try { localStorage.setItem(LOOK_KEY, look.mono ? 'mono' : 'colour'); } catch (err) { console.warn('Could not save the look:', err); }
  if (announce && app.game) say(look.mono ? 'Monochrome look. Press V to go back to colour.' : 'Colour look. Press V for monochrome.', 200);
}
look.mono = loadLook() === 'mono' && look.supported;

const app = {
  mode: 'title',   // title | help | brief | play | paused | win | lose
  tick: 0, fatal: null, game: null, help: { page: 0 },
  hits: [], particles: [], caption: null, flash: 0, best: loadBest(), newBest: false, endTimer: 0, pendingEnd: null,
  view: { hero: { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, p: 1, dur: STEP_TIME, moving: false, air: 0 }, crateSlide: null },
  held: [], hopQueued: 0, cooldown: 0, lastBump: -1, lastDoors: '',
};

// ---- starting ----
function startGame() {
  app.game = createGame();
  app.mode = 'play'; app.particles = []; app.caption = null; app.flash = 0; app.pendingEnd = null; app.newBest = false;
  app.held = []; app.hopQueued = 0; app.cooldown = 0; app.view.crateSlide = null; app.lastDoors = doorSignature(app.game);
  snapHero(app.game);
  processEvents(app.game);
}

function doorSignature(game) {
  const room = cur(game);
  let sig = '';
  for (let y = 0; y < room.H; y++) for (let x = 0; x < room.W; x++) if (room.doorAt[y][x]) sig += doorClosed(game, room, x, y) ? 'c' : 'o';
  return sig;
}

// ---- the hero's picture follows the hero's square ----
function snapHero(game) {
  const v = app.view.hero;
  v.x = v.fx = v.tx = game.hero.x; v.y = v.fy = v.ty = game.hero.y; v.z = v.fz = v.tz = heroLevel(game); v.p = 1; v.moving = false;
}
function glideHero(game, dur) {
  const v = app.view.hero;
  v.fx = v.x; v.fy = v.y; v.fz = v.z;
  v.tx = game.hero.x; v.ty = game.hero.y; v.tz = heroLevel(game);
  v.p = 0; v.dur = dur; v.moving = true;
}
function updateView(dt) {
  const v = app.view.hero;
  if (app.game) v.air = app.game.hero.air;
  if (v.p < 1) {
    v.p = Math.min(1, v.p + dt / v.dur);
    v.x = v.fx + (v.tx - v.fx) * v.p; v.y = v.fy + (v.ty - v.fy) * v.p; v.z = v.fz + (v.tz - v.fz) * v.p;
    if (v.p >= 1) v.moving = false;
  }
  const s = app.view.crateSlide;
  if (s) { s.p = Math.min(1, s.p + dt / STEP_TIME); if (s.p >= 1) app.view.crateSlide = null; }
}

// ---- events from the rules ----
function say(textStr, frames = 230) { app.caption = { text: textStr, ttl: frames }; }

function roomPoint(game, x, y) { const room = cur(game), o = roomOrigin(room), p = project(o, x, y); return { sx: p.sx, sy: p.sy - room.h[y][x] * LEVEL_H + TILE_H / 2 }; }

function processEvents(game) {
  for (const e of game.events) {
    switch (e.t) {
      case 'step': Sound.play('step'); break;
      case 'hop': Sound.play('hop'); break;
      case 'push': {
        Sound.play('push');
        app.view.crateSlide = { fromX: e.fromX, fromY: e.fromY, toX: e.toX, toY: e.toY, p: 0, dz: Math.max(0, e.drop) * LEVEL_H };
        const p = roomPoint(game, e.fromX, e.fromY); spawnDust(p.sx, p.sy + 6, 5);
        break;
      }
      case 'fill': { Sound.play('fill'); const p = roomPoint(game, e.x, e.y); spawnDust(p.sx, p.sy, 12); spawnSparks(p.sx, p.sy, 6, '#9ad7ff'); say('The pit has been filled. The crate is now part of the floor. It is not complaining.'); break; }
      case 'bump': {
        if (app.tick - app.lastBump > 14) Sound.play('bump');
        app.lastBump = app.tick;
        if (e.why === 'no parts') say('The rocket is not interested in empty hands. It needs parts.');
        break;
      }
      case 'pickup': { Sound.play('pickup'); const p = roomPoint(game, game.hero.x, game.hero.y); spawnSparks(p.sx, p.sy - 20, 16); say(PICKUP_LINES[e.part], 320); break; }
      case 'full': Sound.play('full'); say('Your hands are full. Take the parts to the rocket first.'); break;
      case 'deliver': {
        Sound.play('deliver');
        const r = cur(game).rocket, p = roomPoint(game, r.x, r.y); spawnSparks(p.sx, p.sy - 80, 26, '#ffd84d');
        say(e.total === PARTS.length ? 'That is the last one. Stand well back.' : `${e.total} of ${PARTS.length} parts fitted. ${PARTS.length - e.total} to go.`, 300);
        break;
      }
      case 'hit': {
        Sound.play('hit'); app.flash = 1; snapHero(game);
        say(HIT_LINES[game.hits % HIT_LINES.length] + ` (-${HIT_PENALTY}s)`, 260);
        break;
      }
      case 'room': {
        Sound.play('room'); snapHero(game); app.view.crateSlide = null;
        const room = ROOMS[e.room];
        if (e.first) say(room.caption, 340);
        app.lastDoors = doorSignature(game);
        break;
      }
      case 'reset': Sound.play('reset'); snapHero(game); say(`Room reset. That cost ${RESET_PENALTY} seconds and a little dignity.`); break;
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

// ---- input ----
const KEY_DIRS = { ArrowUp: 'N', ArrowRight: 'E', ArrowDown: 'S', ArrowLeft: 'W', w: 'N', d: 'E', s: 'S', a: 'W', W: 'N', D: 'E', S: 'S', A: 'W' };

function onKeyDown(key) {
  Sound.init();
  const game = app.game;
  if ((key === 'v' || key === 'V') && app.mode !== 'win' && app.mode !== 'lose' && app.mode !== 'brief') {
    if (!look.supported) { if (app.game) say('This browser cannot do the monochrome look.'); return true; }
    setLook(!look.mono); return true;
  }
  if (app.mode === 'title') {
    if (key === 'Enter' || key === ' ') { Sound.play('choose'); app.mode = 'brief'; return true; }
    if (key === 'h' || key === 'H' || key === 'F1') { Sound.play('tick'); app.mode = 'help'; app.help.page = 0; return true; }
  } else if (app.mode === 'help') {
    const last = HELP_PAGES - 1;
    if (key === 'ArrowRight' || key === 'Enter' || key === ' ') { if (app.help.page >= last) { Sound.play('choose'); app.mode = 'title'; } else { app.help.page++; Sound.play('tick'); } return true; }
    if (key === 'ArrowLeft') { if (app.help.page > 0) { app.help.page--; Sound.play('tick'); } return true; }
    if (key === 'Escape' || key === 'Backspace') { Sound.play('choose'); app.mode = 'title'; return true; }
  } else if (app.mode === 'brief') {
    if (key === 'Enter' || key === ' ') { Sound.play('choose'); startGame(); return true; }
    if (key === 'Escape') { app.mode = 'title'; return true; }
  } else if (app.mode === 'play') {
    if (key in KEY_DIRS) { const d = KEY_DIRS[key]; app.held = app.held.filter((x) => x !== d); app.held.push(d); return true; }
    if (key === ' ') { app.hopQueued = 14; return true; }
    if (key === 'r' || key === 'R') { resetRoom(game); processEvents(game); return true; }
    if (key === 'p' || key === 'P' || key === 'Escape') { app.mode = 'paused'; app.held = []; return true; }
  } else if (app.mode === 'paused') {
    if (key === 'p' || key === 'P' || key === 'Escape' || key === 'Enter' || key === ' ') { app.mode = 'play'; return true; }
  } else if (app.mode === 'win' || app.mode === 'lose') {
    if (app.endTimer > 40 && (key === 'Enter' || key === ' ')) { Sound.play('choose'); app.mode = 'brief'; return true; }
  }
  return false;
}

function onKeyUp(key) {
  if (key in KEY_DIRS) app.held = app.held.filter((x) => x !== KEY_DIRS[key]);
}

function onClick(px, py) {
  Sound.init();
  const list = app.hits;
  let hit = null;
  for (let i = list.length - 1; i >= 0 && !hit; i--) { const h = list[i]; if (!h.under && px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) hit = h; }
  if (!hit) hit = list.find((h) => h.under && px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) || null;
  if (!hit) return;
  if (app.mode === 'title') { if (hit.id === 'help') onKeyDown('h'); else onKeyDown('Enter'); }
  else if (app.mode === 'help') { if (hit.id === 'helpNext') onKeyDown('ArrowRight'); else if (hit.id === 'helpPrev') onKeyDown('ArrowLeft'); }
  else if (app.mode === 'brief') onKeyDown('Enter');
  else if (app.mode === 'paused') onKeyDown('p');
  else if (app.mode === 'win' || app.mode === 'lose') onKeyDown('Enter');
}

// ---- one step of the game (1/60 s) ----
function stepGame(dt) {
  app.tick++;
  updateEffects();
  if (app.flash > 0) app.flash = Math.max(0, app.flash - dt * 2.5);
  updateView(dt);
  if (app.mode === 'win' || app.mode === 'lose') { app.endTimer++; return; }
  if (app.mode !== 'play') return;
  const game = app.game;
  if (app.pendingEnd) {
    if (--app.pendingEnd.delay <= 0) { const kind = app.pendingEnd.mode; app.pendingEnd = null; finishGame(kind); }
    update(game, dt); processEvents(game);
    return;
  }
  app.cooldown -= dt;
  if (app.hopQueued > 0) app.hopQueued--;
  if (app.cooldown <= 0 && !game.over) {
    let result = null, dur = STEP_TIME;
    if (app.hopQueued > 0) { app.hopQueued = 0; result = hop(game, game.hero.face); dur = HOP_TIME; }
    else if (app.held.length) result = walk(game, app.held[app.held.length - 1]);
    if (result) {
      const wasRoom = result.kind === 'room';
      if (result.ok && !wasRoom) glideHero(game, dur);
      app.cooldown = result.ok ? dur : 0.09;
      processEvents(game);
    }
  }
  const th = themeOf(cur(game));
  if ((th.wall === 'tesla' || th.props.length) && app.tick % 160 === 40) Sound.play('zap'); // a faint crackle from the coils
  const before = game.time;
  update(game, dt);
  processEvents(game);
  if (before > 30 && game.time <= 30 && !game.over) { Sound.play('alarm'); say('Thirty seconds. The saucers are on the horizon. They look smug.', 260); }
  const sig = doorSignature(game);
  if (sig !== app.lastDoors) { if (app.lastDoors !== '') Sound.play('door'); app.lastDoors = sig; }
}
