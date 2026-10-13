'use strict';

// Free movement for the Filmation look, as in Knight Lore: the hero walks smoothly rather than square by square,
// has to jump to get up onto anything, and stops at the edge of a pit (but can fall in if a jump falls short).
// The room itself stays on the grid of rules.js: crates, plates, doors, robots and vents work as they always did.
// The hero's square for the rules (game.hero.x, y) is kept as the square under the middle of their feet.

const SPEED = 3.2;          // tiles a second
const RADIUS = 0.28;        // half the width of the hero's footprint, in tiles
const STAND = 0.15;         // half the width of what has to be under the hero for them to stand on it
const STEP_UP = 0.3;        // levels you can walk up without jumping (so a crate or a ledge needs a jump)
const JUMP_V = 11;          // levels a second, straight up, when a jump starts
const GRAVITY = 40;         // levels a second, every second
const PUSH_TIME = 0.14;     // seconds of leaning on a crate before it moves
const NUDGE = 2.5;          // tiles a second that you are slid sideways to line up with a gap, a crate or a doorway
const SOLID = 99, NOTHING = -99;

// The height of the top of a square for walking: walls, shut doors and the rocket are solid, a pit has no floor.
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

function standLevel(game, room, px, py) {
  let best = NOTHING;
  for (const [x, y] of tilesUnder(px, py, STAND)) best = Math.max(best, tileTop(game, room, x, y));
  return best;
}

// Try to move the hero by (dx, dy). Returns the square that stopped them, or null if they moved.
// A square the hero already overlaps never stops them, so a door shutting on top of them cannot trap them.
function tryMove(game, room, f, dx, dy) {
  const before = new Set(tilesUnder(f.x, f.y, RADIUS).map(([x, y]) => `${x},${y}`));
  for (const [x, y] of tilesUnder(f.x + dx, f.y + dy, RADIUS)) {
    if (before.has(`${x},${y}`)) continue;
    const top = tileTop(game, room, x, y);
    if (top === NOTHING ? !f.air : top > f.z + STEP_UP) return [x, y];
  }
  f.x += dx; f.y += dy;
  return null;
}

// Lean on a crate long enough and it slides one square, by the same rules as pushing on the grid.
function shoveCrate(game, dir, cx, cy) {
  const room = cur(game), [dx, dy] = DIRS[dir];
  const n = room.crates[cy][cx], base = room.h[cy][cx] + n - 1;
  if (Math.round(app.free.z) !== base) return bump(game, 'wrong level');
  const px = cx + dx, py = cy + dy;
  if (!inBounds(room, px, py)) return bump(game, 'edge');
  if (room.wall[py][px] || doorClosed(game, room, px, py) || isRocket(room, px, py)) return bump(game, 'blocked');
  if (robotAt(room, px, py)) return bump(game, 'robot');
  if (room.protectedTiles.has(`${px},${py}`)) return bump(game, 'protected');
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

// Put the hero in the middle of their square for the rules (after a room change, a hit or a reset).
function placeHero(game) {
  const f = app.free;
  f.x = game.hero.x + 0.5; f.y = game.hero.y + 0.5; f.z = heroLevel(game);
  f.vz = 0; f.air = false; f.jumpDir = null; f.pushT = 0;
  game.hero.air = 0;
}

function syncSquare(game) {
  const f = app.free, room = cur(game), hero = game.hero;
  const x = Math.min(room.W - 1, Math.max(0, Math.floor(f.x))), y = Math.min(room.H - 1, Math.max(0, Math.floor(f.y)));
  const moved = x !== hero.x || y !== hero.y;
  hero.x = x; hero.y = y; hero.air = f.air ? 1 : 0;
  if (moved && !f.air) collect(game);
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
      const ahead = stop[0] === laneX && stop[1] === laneY;
      const centre = Math.floor(f[side]) + 0.5, off = centre - f[side];
      if (!ahead || Math.abs(off) > 0.02) f[side] += Math.sign(off) * Math.min(Math.abs(off), NUDGE * dt); // slide into line
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
  const ground = standLevel(game, room, f.x, f.y);
  if (f.air) {
    f.vz -= GRAVITY * dt; f.z += f.vz * dt;
    if (f.vz <= 0 && f.z <= ground) { f.z = ground; f.air = false; f.vz = 0; f.jumpDir = null; Sound.play('step'); }
  } else if (ground < f.z - 0.01) { f.air = true; f.vz = 0; f.jumpDir = null; } // walked off a ledge
  else f.z = ground;
  if (f.air && ground === NOTHING && f.z < room.h[Math.floor(f.y)][Math.floor(f.x)] - 1.2) { // down a pit
    syncSquare(game);
    if (game.invuln > 0) placeHeroAtEntry(game); else hitHero(game, 'pit');
    return;
  }
  syncSquare(game);
}

function placeHeroAtEntry(game) { game.hero.x = game.hero.entry.x; game.hero.y = game.hero.entry.y; placeHero(game); }

// The clock, the robots and what can hurt you. Like update() in rules.js, but a robot has to actually touch you
// (so you can jump over one), and a steam vent only catches you with your feet on it.
function freeUpdate(game, dt) {
  if (game.over) return;
  game.time -= dt; game.elapsed += dt;
  game.invuln = Math.max(0, game.invuln - dt);
  app.rocketWait -= dt;
  if (game.time <= 0) { endGame(game); return; }
  const room = cur(game), f = app.free;
  for (const r of room.robots) {
    r.t += dt;
    while (r.t >= ROBOT_STEP) { r.t -= ROBOT_STEP; stepRobot(game, room, r); }
  }
  if (game.invuln > 0) return;
  for (const r of room.robots) {
    const v = robotView(r);
    if (Math.hypot(v.x + 0.5 - f.x, v.y + 0.5 - f.y) < 0.6 && f.z < room.h[r.y][r.x] + 0.9) { hitHero(game, 'robot'); return; }
  }
  const vent = ventAt(room, game.hero.x, game.hero.y);
  if (!f.air && vent && room.crates[vent.y][vent.x] === 0 && ventState(vent, game.elapsed) === 'on') hitHero(game, 'vent');
}
