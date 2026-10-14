'use strict';

// Free movement, as in Knight Lore: the hero walks smoothly rather than square by square, has to jump to get up onto
// anything (stairs apart), and stops at the edge of a pit (but falls in if a jump falls short or a block shoves them).
// The room itself stays on the grid of rules.js: crates, plates, doors, robots and vents work on squares.
// The hero's square for the rules (game.hero.x, y) is kept as the square under the middle of their feet.
// The moving blocks (lifts, sliders, crumbling blocks and crushers) live here too.

const SPEED = 3.2;          // tiles a second
const RADIUS = 0.28;        // half the width of the hero's footprint, in tiles
const HERO_H = 2.2;         // how tall the hero is, in levels
const STEP_UP = 0.55;       // levels you can walk up or down without jumping (a stair step, but not a crate)
const JUMP_V = 11;          // levels a second, straight up, when a jump starts
const GRAVITY = 40;         // levels a second, every second
const PUSH_TIME = 0.14;     // seconds of leaning on a crate before it moves
const NUDGE = 2.5;          // tiles a second that you are slid sideways to line up with a gap, a crate or a doorway
const SOLID = 99, NOTHING = -99;
const LIVES = 5;
const DEATH_TIME = 1.1;     // seconds between losing a life and coming back at the doorway
const CRUMBLE_DELAY = 0.5;  // seconds a crumbling block holds you
const CRUMBLE_GONE = 3;     // seconds before it is back
const CRUSH_HEIGHT = 3;     // levels above the floor a crusher waits
const RIDE_WAIT = 0.45;     // seconds a ride waits after you step on before it sets off
const RIDE_SPEED = 2.2;     // tiles a second

// ---- moving blocks ----
// Each block's position comes from the clock (game.elapsed), so they all keep to time whatever the hero does.
// A block's box: x0..x1, y0..y1 in tiles, bottom..top in levels.

// 0 at rest, rising to 1 and back, with a pause at each end: rest 15%, move 35%, rest 15%, move 35%.
function swing(t, period, offset = 0) {
  const p = ((((t + offset) % period) + period) % period) / period;
  const ease = (u) => (1 - Math.cos(Math.PI * u)) / 2;
  if (p < 0.15) return 0;
  if (p < 0.5) return ease((p - 0.15) / 0.35);
  if (p < 0.65) return 1;
  return 1 - ease((p - 0.65) / 0.35);
}

// How far down a crusher is: 0 up (waiting), 1 down on the floor. It drops fast and climbs back slowly.
function crusherDrop(t, period, offset = 0) {
  const p = ((((t + offset) % period) + period) % period) / period;
  if (p < 0.45) return 0;
  if (p < 0.55) return ((p - 0.45) / 0.1) ** 2;
  if (p < 0.75) return 1;
  return 1 - (p - 0.75) / 0.25;
}

function makeMover(spec) { return { ...spec, offset: spec.offset || 0, box: null, dx: 0, dy: 0, falling: 0, gone: 0, pos: 0, goal: 0, armed: 0, wasRidden: false }; }
function initMovers(game) { for (const room of game.rooms) room.movers = (room.spec.movers || []).map(makeMover); }

function moverBox(room, m, t) {
  if (m.type === 'lift') {
    const top = m.low + (m.high - m.low) * swing(t, m.period, m.offset);
    return { x0: m.x, y0: m.y, x1: m.x + 1, y1: m.y + 1, bottom: -SOLID, top };
  }
  if (m.type === 'slider') {
    const d = m.dist * swing(t, m.period, m.offset), [dx, dy] = DIRS[m.dir], top = m.top || 0;
    const x = m.x + dx * d, y = m.y + dy * d;
    return { x0: x, y0: y, x1: x + 1, y1: y + 1, bottom: top - 1, top };
  }
  if (m.type === 'crumble') {
    if (m.gone > 0) return null;
    const top = m.level || 0;
    return { x0: m.x, y0: m.y, x1: m.x + 1, y1: m.y + 1, bottom: top - 1, top };
  }
  if (m.type === 'ride') {
    if (m.gone > 0) return null;
    const [dx, dy] = DIRS[m.dir], d = m.dist * m.pos, top = m.top || 0;
    return { x0: m.x + dx * d, y0: m.y + dy * d, x1: m.x + dx * d + 1, y1: m.y + dy * d + 1, bottom: top - 1, top };
  }
  if (m.type === 'crusher') {
    const bottom = room.h[m.y][m.x] + CRUSH_HEIGHT * (1 - crusherDrop(t, m.period, m.offset));
    return { x0: m.x, y0: m.y, x1: m.x + 1, y1: m.y + 1, bottom, top: bottom + 1 };
  }
  throw new Error(`moverBox: unknown moving block "${m.type}"`);
}

const footOverlaps = (b, px, py, r = RADIUS) => b.x0 < px + r && b.x1 > px - r && b.y0 < py + r && b.y1 > py - r;
const centreIn = (b, px, py) => px >= b.x0 && px < b.x1 && py >= b.y0 && py < b.y1;

// The block the hero is standing on, if any.
function ridingOn(room, f) {
  if (f.air) return null;
  return room.movers.find((m) => m.box && centreIn(m.box, f.x, f.y) && Math.abs(m.box.top - f.z) < 0.05) || null;
}

// Move the blocks to where the clock says, carrying and shoving the hero, and setting crumbling blocks off.
function updateMovers(game, dt) {
  const room = cur(game), f = app.free, t = game.elapsed;
  const riding = ridingOn(room, f);
  for (const m of room.movers) {
    if (m.type === 'crumble') {
      if (m.gone > 0) { m.gone -= dt; if (m.gone <= 0) m.falling = 0; }
      else if (m.falling > 0) { m.falling -= dt; if (m.falling <= 0) { m.gone = CRUMBLE_GONE; Sound.play('fill'); } }
      else if (m === riding) m.falling = CRUMBLE_DELAY;
    }
    if (m.type === 'ride') stepRide(m, m === riding, f, dt);
    const old = m.box, box = moverBox(room, m, t);
    m.dx = old && box ? box.x0 - old.x0 : 0; m.dy = old && box ? box.y0 - old.y0 : 0;
    m.box = box;
    if (!box || app.dying > 0 || game.over) continue;
    if (m === riding) { // carried along; a lift's rise and fall is handled by standing on its top
      if (m.dx || m.dy) shoveHero(game, room, f, m.dx, m.dy, m);
      f.z = box.top;
      continue;
    }
    // a block moving into the hero's side shoves them; one coming down on them crushes them
    if (footOverlaps(box, f.x, f.y, RADIUS - 0.02) && box.top > f.z + 0.05 && box.bottom < f.z + HERO_H) {
      if (m.type === 'crusher') { if (game.hazards) die(game, 'crusher'); continue; }
      if (m.dx || m.dy) {
        const nx = m.dx > 0 ? box.x1 + RADIUS - f.x : m.dx < 0 ? box.x0 - RADIUS - f.x : 0;
        const ny = m.dy > 0 ? box.y1 + RADIUS - f.y : m.dy < 0 ? box.y0 - RADIUS - f.y : 0;
        shoveHero(game, room, f, nx, ny, m);
      }
    }
  }
}

// A ride (pos 0 at home, 1 at the far end) sets off a moment after you step onto it, for whichever end it is not at.
// With nobody on it, a good ride drifts to the end nearer the hero; a trap crumbles as soon as it stops.
function stepRide(m, ridden, f, dt) {
  if (m.gone > 0) {
    m.gone -= dt;
    if (m.gone <= 0) { m.gone = 0; m.falling = 0; m.pos = 0; m.goal = 0; m.armed = 0; m.wasRidden = false; }
    return;
  }
  if (m.falling > 0) { m.falling -= dt; if (m.falling <= 0) { m.gone = CRUMBLE_GONE; Sound.play('fill'); } return; }
  const atEnd = m.pos === m.goal;
  if (ridden && !m.wasRidden && atEnd) m.armed = RIDE_WAIT; // just stepped on
  m.wasRidden = ridden;
  if (m.armed > 0) {
    m.armed -= dt;
    if (m.armed <= 0) { m.armed = 0; if (ridden) m.goal = 1 - m.goal; }
  } else if (!ridden && !m.trap && atEnd) {
    const [dx, dy] = DIRS[m.dir], along = (f.x - m.x - 0.5) * dx + (f.y - m.y - 0.5) * dy; // the hero, along the ride's track
    m.goal = along > m.dist / 2 ? 1 : 0;
  }
  if (m.pos !== m.goal) {
    const step = RIDE_SPEED * dt / m.dist;
    m.pos = m.goal > m.pos ? Math.min(m.goal, m.pos + step) : Math.max(m.goal, m.pos - step);
    if (m.pos === m.goal && m.trap && m.goal === 1) m.falling = CRUMBLE_DELAY;
  }
}

// Push the hero by (dx, dy) whatever is underfoot (a shove can put you over a pit); a wall in the way squashes them.
function shoveHero(game, room, f, dx, dy, mover) {
  const stop = blockerAt(game, room, f, f.x + dx, f.y + dy, true, mover);
  if (stop) { if (!stop.box) die(game, 'squashed'); return; }
  f.x += dx; f.y += dy;
}

// ---- the room as solid shapes ----
// The height of the top of a square: walls, shut doors and the rocket are solid, a pit has no floor.
function tileTop(game, room, x, y) {
  if (!inBounds(room, x, y)) return SOLID;
  if (room.wall[y][x] || doorClosed(game, room, x, y) || isRocket(room, x, y)) return SOLID;
  if (room.pit[y][x]) return NOTHING;
  return surface(room, x, y);
}

function tilesUnder(px, py, r) {
  const out = [];
  for (let y = Math.floor(py - r); y <= Math.floor(py + r - 1e-6); y++) for (let x = Math.floor(px - r); x <= Math.floor(px + r - 1e-6); x++) out.push([x, y]);
  return out;
}

// What the hero would stand on with the middle of their feet at (px, py) and at height z: the square, or the top
// of a block below their feet (not one hanging above them).
function standLevel(game, room, px, py, z) {
  let best = tileTop(game, room, Math.floor(px), Math.floor(py));
  for (const m of room.movers) if (m.box && centreIn(m.box, px, py) && m.box.top <= z + STEP_UP + 0.01) best = Math.max(best, m.box.top);
  return best;
}

// What stops the hero's footprint going to (nx, ny): a square ({x, y}) or a block ({box}), or null.
// Things the hero already overlaps never stop them, so a door shutting on them cannot trap them.
// A pit stops you walking unless a block you could step onto is over it; a shove (`shoved`) carries you over one.
function blockerAt(game, room, f, nx, ny, shoved = false, ignore = null) {
  const before = new Set(tilesUnder(f.x, f.y, RADIUS).map(([x, y]) => `${x},${y}`));
  const stepOnto = (x, y) => room.movers.some((m) => m.box && m.box.x0 < x + 1 && m.box.x1 > x && m.box.y0 < y + 1 && m.box.y1 > y && Math.abs(m.box.top - f.z) <= STEP_UP);
  for (const [x, y] of tilesUnder(nx, ny, RADIUS)) {
    if (before.has(`${x},${y}`)) continue;
    const top = tileTop(game, room, x, y);
    if (top === NOTHING) { if (!f.air && !shoved && !stepOnto(x, y)) return { x, y }; }
    else if (top > f.z + STEP_UP) return { x, y };
  }
  for (const m of room.movers) {
    const b = m.box;
    if (!b || m === ignore || footOverlaps(b, f.x, f.y)) continue;
    if (footOverlaps(b, nx, ny) && b.top > f.z + STEP_UP && b.bottom < f.z + HERO_H) return { box: b, mover: m };
  }
  return null;
}

function tryMove(game, room, f, dx, dy) {
  const stop = blockerAt(game, room, f, f.x + dx, f.y + dy);
  if (stop) return stop;
  f.x += dx; f.y += dy;
  return null;
}

// Lean on a crate long enough and it slides one square, by the same rules as pushing on the grid.
function shoveCrate(game, dir, cx, cy) {
  const room = cur(game), [dx, dy] = DIRS[dir];
  const n = room.crates[cy][cx], base = room.h[cy][cx] + n - 1;
  if (Math.abs(app.free.z - base) > 0.05) return bump(game, 'wrong level');
  const px = cx + dx, py = cy + dy;
  if (!inBounds(room, px, py)) return bump(game, 'edge');
  if (room.wall[py][px] || doorClosed(game, room, px, py) || isRocket(room, px, py)) return bump(game, 'blocked');
  if (robotAt(room, px, py)) return bump(game, 'robot');
  if (room.protectedTiles.has(`${px},${py}`)) return bump(game, 'protected');
  if (room.movers.some((m) => m.box && m.box.x0 < px + 1 && m.box.x1 > px && m.box.y0 < py + 1 && m.box.y1 > py)) return bump(game, 'block');
  if (room.pit[py][px]) {
    room.crates[cy][cx]--; room.pit[py][px] = false;
    emit(game, { t: 'fill', x: px, y: py });
    return { ok: true, kind: 'fill' };
  }
  if (surface(room, px, py) > base) return bump(game, 'uphill');
  if (room.crates[py][px] >= MAX_STACK) return bump(game, 'stack full');
  room.crates[cy][cx]--; room.crates[py][px]++;
  emit(game, { t: 'push', fromX: cx, fromY: cy, toX: px, toY: py, drop: base - room.h[py][px] });
  return { ok: true, kind: 'push' };
}

// ---- the hero ----
// Put the hero in the middle of their square for the rules (after a room change, a death or a reset).
function placeHero(game) {
  const f = app.free;
  f.x = game.hero.x + 0.5; f.y = game.hero.y + 0.5; f.z = heroLevel(game);
  f.vz = 0; f.air = false; f.jumpDir = null; f.pushT = 0;
  game.hero.air = 0;
  const room = cur(game);
  for (const m of room.movers) m.box = moverBox(room, m, game.elapsed);
}

function syncSquare(game, landed = false) {
  const f = app.free, room = cur(game), hero = game.hero;
  const x = Math.min(room.W - 1, Math.max(0, Math.floor(f.x))), y = Math.min(room.H - 1, Math.max(0, Math.floor(f.y)));
  const moved = x !== hero.x || y !== hero.y;
  hero.x = x; hero.y = y; hero.air = f.air ? 1 : 0;
  if ((moved || landed) && !f.air) {
    collect(game); // pick up what you walk or land on
    if (room.padAt[y][x] && teleport(game).ok) placeHero(game); // a transmitter pad
  }
}

function stepFree(game, dt) {
  const f = app.free, room = cur(game), hero = game.hero;
  if (f.jumpQueued > 0) f.jumpQueued -= dt;
  const held = app.held.length ? app.held[app.held.length - 1] : null;

  if (!f.air && f.jumpQueued > 0) {
    f.jumpQueued = 0; f.air = true; f.vz = JUMP_V; f.jumpDir = held || hero.face; hero.face = f.jumpDir;
    Sound.play('hop');
  }
  const dir = f.air ? f.jumpDir : held;
  if (dir) {
    hero.face = dir;
    const [dx, dy] = DIRS[dir], d = SPEED * dt;
    const along = dx !== 0 ? 'x' : 'y', side = along === 'x' ? 'y' : 'x';
    const laneX = Math.floor(f.x) + dx, laneY = Math.floor(f.y) + dy; // the square straight ahead of the hero's middle
    const leaving = along === 'x' ? (dx > 0 ? f.x + RADIUS + d > room.W : f.x - RADIUS - d < 0) : (dy > 0 ? f.y + RADIUS + d > room.H : f.y - RADIUS - d < 0);
    if (leaving && !f.air && room.spec.exits[dir] === (along === 'x' ? hero.y : hero.x)) {
      const res = leaveRoom(game, dir);
      if (res.ok) { placeHero(game); return; }
    }
    const stop = tryMove(game, room, f, dx * d, dy * d);
    if (stop) {
      const ahead = !stop.box && stop.x === laneX && stop.y === laneY;
      const centre = Math.floor(f[side]) + 0.5, off = centre - f[side];
      if (!stop.box && (!ahead || Math.abs(off) > 0.02)) f[side] += Math.sign(off) * Math.min(Math.abs(off), NUDGE * dt); // slide into line
      if (ahead && !f.air && inBounds(room, laneX, laneY)) {
        if (isRocket(room, laneX, laneY)) {
          if (app.rocketWait <= 0) { touchRocket(game); app.rocketWait = 1.2; }
        } else if (room.crates[laneY][laneX] > 0 && Math.abs(off) < 0.12) {
          f.pushT += dt;
          if (f.pushT >= PUSH_TIME) f.pushT = shoveCrate(game, dir, laneX, laneY).ok ? 0 : -0.5;
        } else f.pushT = 0;
      }
    } else {
      f.pushT = 0;
      if (!f.air) { f.walk += SPEED * dt; if (f.walk >= 0.55) { f.walk -= 0.55; Sound.play('step'); } }
    }
  } else f.pushT = 0;

  // up and down
  const ground = standLevel(game, room, f.x, f.y, f.z);
  let landed = false;
  if (f.air) {
    f.vz -= GRAVITY * dt; f.z += f.vz * dt;
    if (f.vz <= 0 && f.z <= ground) { f.z = ground; f.air = false; f.vz = 0; f.jumpDir = null; landed = true; Sound.play('step'); }
  } else if (ground < f.z - STEP_UP) { f.air = true; f.vz = 0; f.jumpDir = null; } // walked off a ledge
  else f.z = ground; // walking up or down a stair step, or riding a block
  if (f.air && ground === NOTHING && f.z < room.h[Math.floor(f.y)][Math.floor(f.x)] - 1.2) { // down a pit
    syncSquare(game);
    if (game.invuln > 0) placeHeroAtEntry(game); else die(game, 'pit');
    return;
  }
  syncSquare(game, landed);
}

// Robots, steam, pits, crushers, dud plates and being squashed cost a life. You come back at the doorway you came in by, with
// the room left as it is; with no lives left the game is lost.
function die(game, cause) {
  if (game.over || app.dying > 0 || game.invuln > 0) return;
  if (!game.playtest) game.lives--; // play-test mode (index.html?playtest) never runs out of lives
  game.deaths++;
  emit(game, { t: 'die', cause, lives: game.lives });
  app.dying = DEATH_TIME; app.held = [];
  if (game.lives <= 0) { game.over = 'lose'; game.loseCause = 'lives'; emit(game, { t: 'lose' }); }
}
function respawn(game) { placeHeroAtEntry(game); game.invuln = INVULN; }

function placeHeroAtEntry(game) { game.hero.x = game.hero.entry.x; game.hero.y = game.hero.entry.y; placeHero(game); }

// Put a room's crumbling blocks back (when the room is reset).
function resetMovers(room) { for (const m of room.movers) { m.falling = 0; m.gone = 0; m.pos = 0; m.goal = 0; m.armed = 0; m.wasRidden = false; } }

// The clock, the robots and what can hurt you. Like update() in rules.js, but a robot has to actually touch you
// (so you can jump over one), and a steam vent only catches you with your feet on it.
function freeUpdate(game, dt) {
  if (game.over) return;
  if (!game.playtest) game.time -= dt; // nor out of time
  game.elapsed += dt;
  game.invuln = Math.max(0, game.invuln - dt);
  app.rocketWait -= dt;
  if (game.time <= 0) { game.loseCause = 'time'; endGame(game); return; }
  const room = cur(game), f = app.free;
  if (!game.hazards) return; // the tests switch robots and vents off
  for (const r of room.robots) {
    r.t += dt;
    while (r.t >= ROBOT_STEP) { r.t -= ROBOT_STEP; stepRobot(game, room, r); }
  }
  if (game.invuln > 0 || app.dying > 0) return;
  for (const r of room.robots) {
    const v = robotView(r);
    if (Math.hypot(v.x + 0.5 - f.x, v.y + 0.5 - f.y) < 0.6 && f.z < room.h[r.y][r.x] + 0.9) { die(game, 'robot'); return; }
  }
  const vent = ventAt(room, game.hero.x, game.hero.y);
  if (!f.air && vent && room.crates[vent.y][vent.x] === 0 && ventState(vent, game.elapsed) === 'on') { die(game, 'vent'); return; }
  const hx = game.hero.x, hy = game.hero.y;
  if (!f.air && room.plateAt[hy][hx] === 'o' && room.crates[hy][hx] === 0) die(game, 'zap');
}
