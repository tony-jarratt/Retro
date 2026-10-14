'use strict';

// The browser side: the loop, the mouse and keys, and the test hooks.
//   index.html?seed=N        that map for every game (otherwise each game is a new land)
//   index.html?still&scene=title  the title screen (scene=help: with the help card over it)
//   index.html?manna=N       start with more manna (for trying things out)
//   index.html?still&cam=u,v&mx=..&my=..&shape=u,v,dir;u,v,dir&cast=power,u,v;...&stones=u,v;...&armed=power&ticks=N
//                            draws one frame and stops (for screenshots); mx, my are low-res screen pixels;
//                            &ms=.. the clock for animations, &fxage=.. how far into an effect to catch it

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
const screen = makeScreen(LW, LH), presenter = makePresenter(screen);
const numberParam = (name, fallback) => {
  if (!params.has(name)) return fallback;
  const n = Number(params.get(name));
  if (!Number.isFinite(n)) throw new GodError('bad-param', `?${name}=${params.get(name)} is not a number`);
  return n;
};

const app = {
  mode: 'title',      // 'title' (a demo plays behind the title card) or 'play'
  difficulty: FAIR,
  world: null,        // the game being played, or the demo behind the title
  demoTarget: null,   // where the title's camera is drifting to
  mouse: null,        // low-res screen position, or null when off the canvas
  button: null,       // 1 raise, -1 lower, null when no button is held
  lastShape: 0,       // when the held button last shaped the land (ms)
  keys: new Set(), lastScroll: 0,
  wheel: [0, 0],      // swipe or wheel movement not yet turned into a tile's scroll
  paused: false, stopped: false, lastTime: 0, spare: 0,
  music: true,        // M turns the background music off and on
  help: false,        // the help card is open (H); the game waits while it is
  fx: [],             // effects being drawn: splashes, dust, lava
};

// ---- the title screen and starting a game ----
const randomSeed = () => 1 + Math.floor(Math.random() * 99999);
function showTitle() {
  app.mode = 'title';
  app.world = makeWorld(randomSeed(), { ai: [true, true] });
  app.fx = [];
  app.demoTarget = null;
}
function startGame(seed) {
  app.mode = 'play';
  app.world = makeWorld(seed, { manna: numberParam('manna', START_MANNA), difficulty: app.difficulty });
  app.world.pointer = app.mouse;
  app.fx = [];
  app.paused = false;
  musicRandomTune();
  updateHover();
}
// The title's camera drifts from one house to another, a tile at a time.
let demoLastMove = 0;
function driftDemo(now) {
  const w = app.world;
  if (w.over) { showTitle(); return; } // that war is over: start another
  if (now - demoLastMove < 700) return;
  demoLastMove = now;
  if (!app.demoTarget || (w.cam.u === app.demoTarget.u && w.cam.v === app.demoTarget.v)) {
    const h = w.houses.length ? w.houses[Math.floor(Math.random() * w.houses.length)] : { u: MAP_N / 2, v: MAP_N / 2 };
    app.demoTarget = clampCam(w.terrain, { u: h.u - VIEW_N / 2, v: h.v - VIEW_N / 2 });
  }
  w.cam = { u: w.cam.u + Math.sign(app.demoTarget.u - w.cam.u), v: w.cam.v + Math.sign(app.demoTarget.v - w.cam.v) };
}

// ---- input ----
function toLowRes(e) {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * LW, ((e.clientY - r.top) / r.height) * LH];
}
function updateHover() {
  const w = app.world;
  w.hover = app.mouse && app.mode === 'play' ? pickCorner(w.terrain, w.cam, app.mouse[0], app.mouse[1]) : null;
  w.hoverTile = app.mouse && app.mode === 'play' ? pickTile(w.terrain, w.cam, app.mouse[0], app.mouse[1]) : null; // for stones
}
function shapeAtHover(now) {
  const w = app.world;
  app.lastShape = now;
  if (!w.hover) return;
  const r = shapeLand(w, w.hover.u, w.hover.v, app.button);
  Sound.play(r.ok ? (app.button === 1 ? 'raise' : 'lower') : 'buzz');
  updateHover();
}
// A click on the map book moves the view there.
function bookClick([x, y]) {
  const tile = bookTile(x, y);
  if (!tile) return false;
  const w = app.world;
  w.cam = clampCam(w.terrain, { u: tile.u - VIEW_N / 2, v: tile.v - VIEW_N / 2 });
  updateHover();
  return true;
}

// Picking a power: its key, or a click on its name in the panel. Picking it again puts it away.
function arm(id) {
  const w = app.world;
  if (w.armed === id) { w.armed = null; return; }
  if (w.tribes[PLAYER].manna < POWER[id].cost) { say(w, `${POWER[id].name} NEEDS ${POWER[id].cost} MANNA`); Sound.play('buzz'); return; }
  w.armed = id;
}
function powerClick([x, y]) {
  const slot = powerSlots().find((p) => x >= p.x - 2 && x <= p.x + p.w + 2 && y >= p.y - 2 && y <= p.y + p.h + 2);
  if (slot) arm(slot.id);
  return !!slot;
}
const STONE_REFUSALS = { 'no-manna': 'NOT ENOUGH MANNA', sea: 'A STONE WILL NOT STAND IN THE SEA', taken: 'SOMETHING STANDS THERE ALREADY',
  'too-many': `NO MORE THAN ${MAX_STONES} STONES`, 'not-yours': 'THAT IS NOT ONE OF YOUR STONES' };
function castArmed() {
  const w = app.world, id = w.armed, at = id === 'stone' ? w.hoverTile : w.hover;
  if (!at && id !== 'flood') return;
  const r = castPower(w, PLAYER, id, at ? at.u : 0, at ? at.v : 0);
  if (!r.ok) { say(w, id === 'stone' ? STONE_REFUSALS[r.reason] : r.reason === 'no-manna' ? 'NOT ENOUGH MANNA' : `NO ROOM FOR A ${POWER[id].name} THERE`); Sound.play('buzz'); return; }
  if (id === 'stone') return; // stay armed, to lay out a line of stones
  w.armed = null;
  updateHover();
}

canvas.addEventListener('mousemove', (e) => { app.mouse = toLowRes(e); if (app.mode === 'play') app.world.pointer = app.mouse; updateHover(); });
canvas.addEventListener('mouseleave', () => { app.mouse = null; app.world.pointer = null; app.button = null; updateHover(); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  Sound.init();
  e.preventDefault();
  app.mouse = toLowRes(e);
  if (app.help) { app.help = false; return; } // a click closes the help card
  if (app.mode === 'title') { // pick a difficulty, or click anywhere else to begin
    const [x, y] = app.mouse, slot = difficultySlots().find((d) => x >= d.x - 3 && x <= d.x + d.w + 3 && y >= d.y - 3 && y <= d.y + d.h + 3);
    if (slot) app.difficulty = slot.i; else startGame(numberParam('seed', randomSeed()));
    return;
  }
  // a right click lowers; on a Mac trackpad that is a two-finger click, or control-click, and shift-click lowers too
  const lower = e.button === 2 || (e.button === 0 && (e.ctrlKey || e.shiftKey));
  if (e.button === 0 && !lower && bookClick(app.mouse)) return;
  if (e.button === 0 && powerClick(app.mouse)) return;
  if (app.world.armed) { // a power is ready: a click on the land casts it, any other button puts it away
    if (e.button === 0 && !lower) castArmed();
    else if (app.world.armed === 'stone' && app.world.hoverTile) { // take one of your stones down
      const r = lowerStone(app.world, PLAYER, app.world.hoverTile.u, app.world.hoverTile.v);
      if (!r.ok) { say(app.world, STONE_REFUSALS[r.reason]); Sound.play('buzz'); }
    } else app.world.armed = null;
    return;
  }
  if (e.button !== 0 && e.button !== 2) return;
  app.button = lower ? -1 : 1;
  updateHover();
  shapeAtHover(performance.now());
});
window.addEventListener('mouseup', () => { app.button = null; });

// A two-finger swipe on a trackpad, or a mouse wheel (shift + wheel for sideways), pans the view a tile at a time.
// Moves are screen-relative, like the arrow keys: swipe up and the land moves up, showing what is further down.
const WHEEL_STEP = 40; // wheel pixels to a tile
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (app.mode !== 'play') return;
  const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1; // lines or pages, on some mice
  let dx = e.deltaX * scale, dy = e.deltaY * scale;
  if (e.shiftKey && !dx) { dx = dy; dy = 0; }
  app.wheel[0] += dx; app.wheel[1] += dy;
  const across = Math.trunc(app.wheel[0] / WHEEL_STEP), down = Math.trunc(app.wheel[1] / WHEEL_STEP);
  if (!across && !down) return;
  app.wheel[0] -= across * WHEEL_STEP; app.wheel[1] -= down * WHEEL_STEP;
  const w = app.world; // screen right is (+u, -v), screen down is (+u, +v)
  w.cam = clampCam(w.terrain, { u: w.cam.u + across + down, v: w.cam.v - across + down });
  updateHover();
}, { passive: false });

const SCROLL = { ArrowUp: [-1, -1], KeyW: [-1, -1], ArrowDown: [1, 1], KeyS: [1, 1], ArrowLeft: [-1, 1], KeyA: [-1, 1], ArrowRight: [1, -1], KeyD: [1, -1] };
window.addEventListener('keydown', (e) => {
  Sound.init();
  if (e.code === 'KeyM') { app.music = !app.music; say(app.world, app.music ? 'MUSIC ON' : 'MUSIC OFF', 30); }
  if (e.code === 'KeyH') { app.help = !app.help; return; }
  if (app.help) { if (e.code === 'Escape') app.help = false; return; } // nothing else while the help card is up
  if (app.mode === 'title') {
    const pick = DIFFICULTIES.findIndex((_, i) => e.code === `Digit${i + 1}`);
    if (pick >= 0) app.difficulty = pick;
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); startGame(numberParam('seed', randomSeed())); }
    return;
  }
  if (SCROLL[e.code]) { e.preventDefault(); if (!app.keys.has(e.code)) { app.keys.add(e.code); app.lastScroll = 0; } }
  if (e.code === 'KeyP') app.paused = !app.paused;
  const power = POWERS.find((p) => e.code === `Digit${p.key}`);
  if (power && !app.world.over) arm(power.id);
  if (e.code === 'Escape') app.world.armed = null;
  if (app.world.over && e.code === 'Enter') showTitle();
  else if (app.world.over && e.code === 'KeyR') startGame(app.world.seed); // the same land again
});
window.addEventListener('keyup', (e) => app.keys.delete(e.code));

function scroll(now) {
  if (!app.keys.size || now - app.lastScroll < 110) return;
  app.lastScroll = now;
  const w = app.world;
  let du = 0, dv = 0;
  for (const k of app.keys) if (SCROLL[k]) { du += SCROLL[k][0]; dv += SCROLL[k][1]; }
  w.cam = clampCam(w.terrain, { u: w.cam.u + Math.sign(du), v: w.cam.v + Math.sign(dv) });
  updateHover();
}

// The sounds for what has happened since the last frame (the player's people only, one of each kind).
const EVENT_SOUNDS = { settle: 'settle', grew: 'grew', drown: 'drown', broken: 'broken', fight: 'fight', razed: 'fight', repelled: 'fight',
  bridge: 'rumble', win: 'win', lose: 'lose', sink: 'sink', mine: 'mine', armed: 'armed', baa: 'baa',
  stone: 'chime', pilgrims: 'horn', topple: 'crash', lowered: 'crash', swamp: 'swamp', quake: 'quake', volcano: 'volcano', flood: 'flood' };
const EVERYONE_HEARS = new Set(['bridge', 'swamp', 'quake', 'volcano', 'flood', 'baa', 'stone', 'pilgrims', 'topple']);
// Effects to draw for what has happened: splashes, dust where people fight, a volcano's glowing crater.
function makeEffects(world, now) {
  const t = world.terrain, at = (u, v) => Math.min(...tileCorners(t, Math.min(t.n - 1, u), Math.min(t.n - 1, v)));
  for (const e of world.events) {
    if (e.type === 'drown' || (e.type === 'baa' && e.drowned)) app.fx.push({ kind: 'splash', u: e.u + 0.5, v: e.v + 0.5, h: 0, born: now });
    else if (e.type === 'baa' && e.sank) app.fx.push({ kind: 'splash', u: e.u + 0.5, v: e.v + 0.5, h: at(e.u, e.v), born: now });
    else if (e.type === 'sink') app.fx.push({ kind: 'splash', u: e.u + 0.5, v: e.v + 0.5, h: at(e.u, e.v), born: now });
    else if (e.type === 'fight' || e.type === 'razed' || e.type === 'repelled' || e.type === 'topple') app.fx.push({ kind: 'dust', u: e.u + 0.5, v: e.v + 0.5, h: at(e.u, e.v), born: now });
    else if (e.type === 'volcano') app.fx.push({ kind: 'lava', u: e.u, v: e.v, h: heightAt(t, e.u, e.v), born: now });
    else if (e.type === 'quake') for (let i = 0; i < 8; i++) {
      const u = e.u + Math.floor(Math.random() * 7) - 3, v = e.v + Math.floor(Math.random() * 7) - 3;
      if (u >= 0 && v >= 0 && u < t.n && v < t.n) app.fx.push({ kind: 'dust', u: u + 0.5, v: v + 0.5, h: at(u, v), born: now + i * 60 });
    }
  }
  app.fx = app.fx.filter((f) => now - f.born < FX_LIFE[f.kind]);
}
// Now and then a sheep in view bleats.
let lastBaa = 0;
function bleat(world, now) {
  if (now - lastBaa < 9000 || Math.random() > 0.004) return;
  const cam = world.cam;
  if (world.sheep.some((sh) => sh.x >= cam.u && sh.y >= cam.v && sh.x < cam.u + VIEW_N && sh.y < cam.v + VIEW_N)) { Sound.play('baa'); lastBaa = now; }
}
function playEvents(world) {
  const mine = world.events.filter((e) => (e.tribe === PLAYER || e.loser === PLAYER || EVERYONE_HEARS.has(e.type)) && EVENT_SOUNDS[e.type]);
  for (const k of new Set(mine.map((e) => EVENT_SOUNDS[e.type]))) Sound.play(k);
  if (world.events.some((e) => e.type === 'razed' && e.loser === PLAYER)) say(world, 'YOUR PEOPLE ARE UNDER ATTACK');
  for (const e of world.events) if (e.type === 'pilgrims') say(world, e.tribe === PLAYER ? `YOUR PILGRIMS SET OUT, ${e.strength} STRONG` : `THE DARK GOD'S PILGRIMS SET OUT, ${e.strength} STRONG`);
  for (const e of world.events) if (e.type === 'topple') say(world, e.tribe === PLAYER ? 'ONE OF YOUR STONES HAS FALLEN' : 'A DARK STONE HAS FALLEN');
  for (const e of world.events) if (e.type === 'armed') say(world, e.tribe === PLAYER ? `YOUR PEOPLE NOW FIGHT WITH ${WEAPONS[e.weapons]}` : `THE DARK GOD'S PEOPLE NOW HAVE ${WEAPONS[e.weapons]}`);
  world.events.length = 0;
}

// ---- the loop ----
function fail(err) {
  app.stopped = true;
  const w = app.world;
  console.error(`The game stopped at tick ${w.tick} (seed ${w.seed}):`, err);
  document.title = `ERROR ${err.kind || err.name}`;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, 80);
  ctx.fillStyle = '#f44'; ctx.font = '20px monospace';
  ctx.fillText(`Stopped: ${err.name} ${err.kind ? `(${err.kind}) ` : ''}${err.message}`.slice(0, 90), 16, 44);
}
function frame(now) {
  if (app.stopped) return;
  try {
    if (!app.lastTime) app.lastTime = now;
    app.spare = Math.min(app.spare + now - app.lastTime, 250);
    app.lastTime = now;
    const title = app.mode === 'title';
    if (title) driftDemo(now);
    else scroll(now);
    if (app.button && !app.help && now - app.lastShape >= REPEAT_MS) shapeAtHover(now);
    while (app.spare >= TICK_MS) { if (title || (!app.paused && !app.help)) stepWorld(app.world); app.spare -= TICK_MS; }
    musicUpdate(app.music && !app.world.over); // quiet at the end, so the victory or defeat tune is heard
    makeEffects(app.world, now);
    if (title) app.world.events.length = 0; // the demo's battles make no sound
    else { playEvents(app.world); bleat(app.world, now); }
    renderGame(screen, app.world, now, app.fx, { hud: !title });
    if (title) drawTitle(screen, app.difficulty, now);
    if (app.paused && !title && !app.help) outlined(screen, 'PAUSED', LW / 2 - textWidth('PAUSED') / 2, LH / 2, C.snow);
    if (app.help) drawHelp(screen);
    const tuneHint = `H HELP   M MUSIC ${app.music ? 'ON' : 'OFF'}`;
    text(screen, tuneHint, LW - 4 - textWidth(tuneHint), LH - 10, C.grey);
    present(screen, presenter, ctx);
  } catch (err) { fail(err); return; }
  requestAnimationFrame(frame);
}

// Screenshot hooks: draw one frame and stop.
function stillHelp() {
  stillTitle();
  drawHelp(screen);
}
function stillTitle() {
  showTitle();
  for (let i = 0; i < numberParam('ticks', 0); i++) stepWorld(app.world);
  app.world.cam = clampCam(app.world.terrain, { u: 14, v: 15 });
  renderGame(screen, app.world, 1000, [], { hud: false });
  drawTitle(screen, app.difficulty, 0);
}
function stillGame() {
  startGame(numberParam('seed', SEED));
  const w = app.world;
  if (params.has('cam')) { const [u, v] = params.get('cam').split(',').map(Number); w.cam = clampCam(w.terrain, { u, v }); }
  for (const step of (params.get('shape') || '').split(';').filter(Boolean)) {
    const [u, v, dir] = step.split(',').map(Number), r = shapeLand(w, u, v, dir);
    if (!r.ok) console.warn(`still: shaping (${u}, ${v}) by ${dir} was refused (${r.reason})`);
  }
  for (const spell of (params.get('cast') || '').split(';').filter(Boolean)) { // cast=quake,20,22;flood
    const [id, u, v] = spell.split(','), r = castPower(w, PLAYER, id, Number(u || 0), Number(v || 0));
    if (!r.ok) console.warn(`still: casting ${spell} was refused (${r.reason})`);
  }
  for (const spot of (params.get('stones') || '').split(';').filter(Boolean)) { // stones=u,v;u,v (yours, in order)
    const [u, v] = spot.split(',').map(Number), r = castPower(w, PLAYER, 'stone', u, v);
    if (!r.ok) console.warn(`still: a stone at (${u}, ${v}) was refused (${r.reason})`);
  }
  if (params.has('armed')) w.armed = params.get('armed');
  for (let i = 0; i < numberParam('ticks', 0); i++) stepWorld(w);
  if (params.has('mx')) { app.mouse = [numberParam('mx', 0), numberParam('my', 0)]; w.pointer = app.mouse; updateHover(); }
  const ms = numberParam('ms', 1000);
  makeEffects(w, ms - numberParam('fxage', 200)); // effects from what was cast, caught a moment in
  renderGame(screen, w, ms, app.fx);
  if (params.has('mx')) renderGame(screen, w, ms, app.fx); // again, now that the picks (what the mouse can point at) exist
}

if (params.has('still')) {
  try {
    const scene = params.get('scene');
    if (scene === 'title') stillTitle(); else if (scene === 'help') stillHelp(); else stillGame();
    present(screen, presenter, ctx);
    document.title = 'STILL READY';
  } catch (err) { fail(err); }
} else {
  showTitle();
  musicRandomTune();
  requestAnimationFrame(frame);
}
