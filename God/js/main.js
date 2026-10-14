'use strict';

// The browser side: the loop, the mouse and keys, and the test hooks.
//   index.html?seed=N        another map
//   index.html?manna=N       start with more manna (for trying things out)
//   index.html?still&cam=u,v&mx=..&my=..&shape=u,v,dir;u,v,dir&cast=power,u,v;...&armed=power&ticks=N
//                            draws one frame and stops (for screenshots); mx, my are low-res screen pixels

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
  world: makeWorld(numberParam('seed', SEED), { manna: numberParam('manna', START_MANNA) }),
  mouse: null,        // low-res screen position, or null when off the canvas
  button: null,       // 1 raise, -1 lower, null when no button is held
  lastShape: 0,       // when the held button last shaped the land (ms)
  keys: new Set(), lastScroll: 0,
  wheel: [0, 0],      // swipe or wheel movement not yet turned into a tile's scroll
  paused: false, stopped: false, lastTime: 0, spare: 0,
};

// ---- input ----
function toLowRes(e) {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * LW, ((e.clientY - r.top) / r.height) * LH];
}
function updateHover() {
  const w = app.world;
  w.hover = app.mouse ? pickCorner(w.terrain, w.cam, app.mouse[0], app.mouse[1]) : null;
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
function castArmed() {
  const w = app.world, id = w.armed;
  if (!w.hover && id !== 'flood') return;
  const r = castPower(w, PLAYER, id, w.hover ? w.hover.u : 0, w.hover ? w.hover.v : 0);
  if (!r.ok) { say(w, r.reason === 'no-manna' ? 'NOT ENOUGH MANNA' : `NO ROOM FOR A ${POWER[id].name} THERE`); Sound.play('buzz'); return; }
  w.armed = null;
  updateHover();
}

canvas.addEventListener('mousemove', (e) => { app.mouse = toLowRes(e); updateHover(); });
canvas.addEventListener('mouseleave', () => { app.mouse = null; app.button = null; updateHover(); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  Sound.init();
  e.preventDefault();
  app.mouse = toLowRes(e);
  // a right click lowers; on a Mac trackpad that is a two-finger click, or control-click, and shift-click lowers too
  const lower = e.button === 2 || (e.button === 0 && (e.ctrlKey || e.shiftKey));
  if (e.button === 0 && !lower && bookClick(app.mouse)) return;
  if (e.button === 0 && powerClick(app.mouse)) return;
  if (app.world.armed) { // a power is ready: a click on the land casts it, any other button puts it away
    if (e.button === 0 && !lower) castArmed(); else app.world.armed = null;
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
  if (SCROLL[e.code]) { e.preventDefault(); if (!app.keys.has(e.code)) { app.keys.add(e.code); app.lastScroll = 0; } }
  if (e.code === 'KeyP') app.paused = !app.paused;
  const power = POWERS.find((p) => e.code === `Digit${p.key}`);
  if (power && !app.world.over) arm(power.id);
  if (e.code === 'Escape') app.world.armed = null;
  if (app.world.over && (e.code === 'Enter' || e.code === 'KeyR')) { // a new land, or the same one again
    const seed = e.code === 'KeyR' ? app.world.seed : (app.world.seed * 7919 + 13) % 100000;
    app.world = makeWorld(seed, { manna: numberParam('manna', START_MANNA) });
    updateHover();
  }
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
  bridge: 'rumble', win: 'win', lose: 'lose', sink: 'sink', mine: 'mine', armed: 'armed', swamp: 'swamp', quake: 'quake', volcano: 'volcano', flood: 'flood' };
const EVERYONE_HEARS = new Set(['bridge', 'swamp', 'quake', 'volcano', 'flood']);
function playEvents(world) {
  const mine = world.events.filter((e) => (e.tribe === PLAYER || e.loser === PLAYER || EVERYONE_HEARS.has(e.type)) && EVENT_SOUNDS[e.type]);
  for (const k of new Set(mine.map((e) => EVENT_SOUNDS[e.type]))) Sound.play(k);
  if (world.events.some((e) => e.type === 'razed' && e.loser === PLAYER)) say(world, 'YOUR PEOPLE ARE UNDER ATTACK');
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
    scroll(now);
    if (app.button && now - app.lastShape >= REPEAT_MS) shapeAtHover(now);
    while (app.spare >= TICK_MS) { if (!app.paused) stepWorld(app.world); app.spare -= TICK_MS; }
    playEvents(app.world);
    renderGame(screen, app.world, now);
    if (app.paused) outlined(screen, 'PAUSED', LW / 2 - textWidth('PAUSED') / 2, LH / 2, C.snow);
    present(screen, presenter, ctx);
  } catch (err) { fail(err); return; }
  requestAnimationFrame(frame);
}

if (params.has('still')) {
  try {
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
    if (params.has('armed')) w.armed = params.get('armed');
    for (let i = 0; i < numberParam('ticks', 0); i++) stepWorld(w);
    if (params.has('mx')) { app.mouse = [numberParam('mx', 0), numberParam('my', 0)]; updateHover(); }
    renderGame(screen, w, numberParam('ms', 0));
    present(screen, presenter, ctx);
    document.title = 'STILL READY';
  } catch (err) { fail(err); }
} else {
  requestAnimationFrame(frame);
}
