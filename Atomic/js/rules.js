'use strict';

// The rules of Atomic Castle. Nothing here draws or waits. Every function changes the game and pushes events
// (game.events) that the screen turns into animation and sound, so the rules can be tested, and the room
// puzzles solved by a program, without a screen.

class RuleError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RuleError';
  }
}

// ---- building the game ----
function makeGrid(W, H, fill) { return Array.from({ length: H }, () => Array(W).fill(fill)); }

function createRoomState(spec, index) {
  const W = spec.width, H = spec.rows;
  const room = {
    index, spec, W, H,
    h: makeGrid(W, H, 0), wall: makeGrid(W, H, false), pit: makeGrid(W, H, false), crates: makeGrid(W, H, 0),
    plateAt: makeGrid(W, H, ''), doorAt: makeGrid(W, H, ''),
    robots: [], vents: [], parts: [], rocket: null, start: null, protectedTiles: new Set(),
  };
  const part = PARTS.find((p) => p.room === spec.id);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const hc = spec.height[y][x], oc = spec.objects[y][x];
    if (hc === '#') room.wall[y][x] = true;
    else if ('xyz'.includes(hc)) { room.pit[y][x] = true; room.h[y][x] = { x: 0, y: 1, z: 2 }[hc]; } // the level of the floor once it is filled
    else if (hc in LEVEL_CHARS) room.h[y][x] = LEVEL_CHARS[hc];
    if (oc === '*') room.crates[y][x] = 1;
    else if (oc === '$') { room.parts.push({ x, y, id: part.id, taken: false }); room.protectedTiles.add(`${x},${y}`); }
    else if (oc === 'R') room.rocket = { x, y };
    else if (oc === 'S') { room.start = { x, y }; room.protectedTiles.add(`${x},${y}`); }
    else if ('><^v'.includes(oc)) room.robots.push({ x, y, px: x, py: y, dir: { '>': 'E', '<': 'W', '^': 'N', v: 'S' }[oc], t: 0 });
    else if (oc === '~') room.vents.push({ x, y, offset: room.vents.length * 0.7 });
    else if ('abcdefo'.includes(oc)) room.plateAt[y][x] = oc; // o is a dud: no door has its letter
    else if ('ABCDEF'.includes(oc)) room.doorAt[y][x] = oc;
  }
  for (const [dir, at] of Object.entries(spec.exits)) { const [x, y] = exitTile(spec, dir, at); room.protectedTiles.add(`${x},${y}`); }
  room.initial = snapshotRoom(room); // for resetting the room
  return room;
}

function snapshotRoom(room) {
  return { crates: room.crates.map((r) => r.slice()), pit: room.pit.map((r) => r.slice()), robots: room.robots.map((r) => ({ ...r })) };
}

function createGame() {
  const rooms = ROOMS.map(createRoomState);
  const startRoom = rooms.find((r) => r.start);
  if (!startRoom) throw new Error('no room has a start square (S)');
  const game = {
    rooms, hero: { room: startRoom.index, x: startRoom.start.x, y: startRoom.start.y, face: 'E', carry: [], air: 0, entry: { x: startRoom.start.x, y: startRoom.start.y } },
    delivered: [], time: TIME_LIMIT, elapsed: 0, invuln: 0, over: null, events: [], seen: new Set([startRoom.index]),
    hazards: true, hits: 0, resets: 0, steps: 0,
  };
  emit(game, { t: 'room', room: startRoom.index, first: true });
  return game;
}

// ---- small helpers ----
function emit(game, event) { game.events.push(event); }
function cur(game) { return game.rooms[game.hero.room]; }
function inBounds(room, x, y) { return x >= 0 && y >= 0 && x < room.W && y < room.H; }
function surface(room, x, y) { return room.h[y][x] + room.crates[y][x]; }
function heroLevel(game) { const r = cur(game); return surface(r, game.hero.x, game.hero.y); }
function robotAt(room, x, y) { return room.robots.some((r) => r.x === x && r.y === y); }
function ventAt(room, x, y) { return room.vents.find((v) => v.x === x && v.y === y) || null; }
function isRocket(room, x, y) { return !!room.rocket && room.rocket.x === x && room.rocket.y === y; }

// A door is open while any crate (or the hero) sits on a plate with its letter.
function doorOpen(game, room, letter) {
  const plate = letter.toLowerCase();
  for (let y = 0; y < room.H; y++) for (let x = 0; x < room.W; x++) {
    if (room.plateAt[y][x] !== plate) continue;
    if (room.crates[y][x] > 0) return true;
    if (game.hero.room === room.index && game.hero.x === x && game.hero.y === y) return true;
  }
  return false;
}
function doorClosed(game, room, x, y) { const L = room.doorAt[y][x]; return !!L && !doorOpen(game, room, L); }
// Squares nobody can walk or be pushed into.
function blocked(game, room, x, y) { return room.wall[y][x] || room.pit[y][x] || doorClosed(game, room, x, y) || isRocket(room, x, y); }

function ventState(vent, elapsed) {
  const cycle = VENT.off + VENT.warn + VENT.on;
  const ph = (elapsed + vent.offset) % cycle;
  return ph < VENT.off ? 'off' : ph < VENT.off + VENT.warn ? 'warn' : 'on';
}

// ---- the hero's actions ----
function bump(game, why) {
  emit(game, { t: 'bump', why });
  return { ok: false, kind: 'bump', why };
}

function neighbourIndex(room, dir) {
  if (room.spec.to && room.spec.to[dir]) return ROOM_INDEX[room.spec.to[dir]]; // a staircase to another floor
  const dc = { E: 1, W: -1, N: 0, S: 0 }[dir], dr = { N: -1, S: 1, E: 0, W: 0 }[dir];
  return ROOMS.findIndex((r) => r.col === room.spec.col + dc && r.row === room.spec.row + dr);
}

// Walk one square. Walking into a crate pushes it; off the edge at a doorway goes to the next room.
function walk(game, dir) {
  if (game.over) return { ok: false, kind: 'over' };
  const hero = game.hero, room = cur(game), [dx, dy] = DIRS[dir];
  hero.face = dir;
  const nx = hero.x + dx, ny = hero.y + dy;
  if (!inBounds(room, nx, ny)) return leaveRoom(game, dir);
  if (isRocket(room, nx, ny)) return touchRocket(game);
  if (blocked(game, room, nx, ny)) return bump(game, 'blocked');
  if (room.crates[ny][nx] > 0) return pushCrate(game, dir, nx, ny);
  if (room.h[ny][nx] > heroLevel(game) + 1) return bump(game, 'too high');
  moveHero(game, nx, ny, 'step');
  return { ok: true, kind: 'step' };
}

function leaveRoom(game, dir) {
  const hero = game.hero, room = cur(game);
  const at = room.spec.exits[dir];
  const along = (dir === 'N' || dir === 'S') ? hero.x : hero.y;
  if (at === undefined || along !== at) return bump(game, 'edge');
  const to = game.rooms[neighbourIndex(room, dir)];
  const [x, y] = exitTile(to.spec, OPPOSITE[dir], at);
  if (blocked(game, to, x, y) || to.crates[y][x] > 0) return bump(game, 'doorway blocked');
  hero.room = to.index; hero.x = x; hero.y = y; hero.entry = { x, y }; hero.air = 0;
  const first = !game.seen.has(to.index);
  game.seen.add(to.index);
  emit(game, { t: 'room', room: to.index, first, from: dir });
  collect(game);
  return { ok: true, kind: 'room' };
}

function pushCrate(game, dir, cx, cy) {
  const room = cur(game), [dx, dy] = DIRS[dir];
  const n = room.crates[cy][cx], base = room.h[cy][cx] + n - 1; // the level of the bottom of the top crate
  if (heroLevel(game) !== base) return bump(game, 'wrong level');
  const px = cx + dx, py = cy + dy;
  if (!inBounds(room, px, py)) return bump(game, 'edge');
  if (room.wall[py][px] || doorClosed(game, room, px, py) || isRocket(room, px, py)) return bump(game, 'blocked');
  if (robotAt(room, px, py)) return bump(game, 'robot');
  if (room.protectedTiles.has(`${px},${py}`)) return bump(game, 'protected');
  if (room.pit[py][px]) { // the crate drops in and fills the pit
    room.crates[cy][cx]--; room.pit[py][px] = false;
    emit(game, { t: 'fill', x: px, y: py });
    moveHero(game, cx, cy, 'push');
    return { ok: true, kind: 'fill' };
  }
  if (surface(room, px, py) > base) return bump(game, 'uphill');
  if (room.crates[py][px] >= MAX_STACK) return bump(game, 'stack full');
  room.crates[cy][cx]--; room.crates[py][px]++;
  emit(game, { t: 'push', fromX: cx, fromY: cy, toX: px, toY: py, drop: base - room.h[py][px] });
  moveHero(game, cx, cy, 'push');
  return { ok: true, kind: 'push' };
}

// Hop: leap over a pit, a robot or a steam vent to the square beyond, or hop up onto a crate or a ledge.
function hop(game, dir) {
  if (game.over) return { ok: false, kind: 'over' };
  const hero = game.hero, room = cur(game), [dx, dy] = DIRS[dir];
  hero.face = dir;
  const x1 = hero.x + dx, y1 = hero.y + dy;
  if (!inBounds(room, x1, y1)) return bump(game, 'edge');
  if (room.wall[y1][x1] || doorClosed(game, room, x1, y1) || isRocket(room, x1, y1)) return bump(game, 'blocked');
  const level = heroLevel(game);
  const gap = room.crates[y1][x1] === 0 && (room.pit[y1][x1] || robotAt(room, x1, y1) || !!ventAt(room, x1, y1));
  if (gap) {
    const x2 = x1 + dx, y2 = y1 + dy;
    if (!inBounds(room, x2, y2) || blocked(game, room, x2, y2) || surface(room, x2, y2) > level + 1) return bump(game, 'no landing');
    moveHero(game, x2, y2, 'hop', true);
    return { ok: true, kind: 'leap' };
  }
  if (surface(room, x1, y1) > level + 1) return bump(game, 'too high');
  moveHero(game, x1, y1, 'hop', true);
  return { ok: true, kind: 'hop' };
}

function moveHero(game, x, y, kind, air = false) {
  const hero = game.hero;
  const fromX = hero.x, fromY = hero.y;
  hero.x = x; hero.y = y; hero.air = air ? HOP_TIME : 0;
  game.steps++;
  emit(game, { t: air ? 'hop' : kind, fromX, fromY, toX: x, toY: y });
  collect(game);
  if (!air) checkHazards(game);
}

function collect(game) {
  const hero = game.hero, room = cur(game);
  for (const part of room.parts) {
    if (part.taken || part.x !== hero.x || part.y !== hero.y) continue;
    if (hero.carry.length >= CARRY_MAX) { emit(game, { t: 'full' }); continue; }
    part.taken = true;
    hero.carry.push(part.id);
    emit(game, { t: 'pickup', part: part.id });
  }
}

function touchRocket(game) {
  const hero = game.hero;
  if (hero.carry.length === 0) return bump(game, 'no parts');
  const handed = hero.carry.slice();
  game.delivered.push(...handed);
  hero.carry = [];
  emit(game, { t: 'deliver', parts: handed, total: game.delivered.length });
  if (game.delivered.length === PARTS.length) { game.over = 'win'; emit(game, { t: 'win' }); }
  return { ok: true, kind: 'deliver' };
}

// ---- hazards ----
function hitHero(game, cause) {
  const hero = game.hero;
  if (game.invuln > 0) return;
  game.time -= HIT_PENALTY; game.hits++; game.invuln = INVULN;
  hero.x = hero.entry.x; hero.y = hero.entry.y; hero.air = 0;
  emit(game, { t: 'hit', cause });
  if (game.time <= 0) endGame(game);
}

function checkHazards(game) {
  if (!game.hazards || game.over || game.invuln > 0 || game.hero.air > 0) return;
  const room = cur(game), hero = game.hero;
  if (robotAt(room, hero.x, hero.y)) { hitHero(game, 'robot'); return; }
  const vent = ventAt(room, hero.x, hero.y);
  if (vent && room.crates[vent.y][vent.x] === 0 && ventState(vent, game.elapsed) === 'on') hitHero(game, 'vent');
}

function stepRobot(game, room, r) {
  const [dx, dy] = DIRS[r.dir];
  const nx = r.x + dx, ny = r.y + dy;
  const stuck = !inBounds(room, nx, ny) || blocked(game, room, nx, ny) || room.crates[ny][nx] > 0 ||
    room.robots.some((o) => o !== r && o.x === nx && o.y === ny) || Math.abs(room.h[ny][nx] - room.h[r.y][r.x]) > 1;
  if (stuck) { r.dir = OPPOSITE[r.dir]; r.px = r.x; r.py = r.y; return; }
  r.px = r.x; r.py = r.y; // where it came from, so the screen can slide it across
  r.x = nx; r.y = ny;
}

function endGame(game) {
  if (game.over) return;
  game.time = Math.max(0, game.time);
  game.over = 'lose';
  emit(game, { t: 'lose' });
}

// Advance the clock and the hazards in the room the hero is in. dt is in seconds.
function update(game, dt) {
  if (game.over) return;
  game.time -= dt; game.elapsed += dt;
  game.invuln = Math.max(0, game.invuln - dt);
  const hero = game.hero;
  const wasAir = hero.air > 0;
  hero.air = Math.max(0, hero.air - dt);
  if (game.time <= 0) { endGame(game); return; }
  if (game.hazards) {
    const room = cur(game);
    for (const r of room.robots) {
      r.t += dt;
      while (r.t >= ROBOT_STEP) { r.t -= ROBOT_STEP; stepRobot(game, room, r); }
    }
    if (wasAir && hero.air === 0) checkHazards(game); // landing
    else checkHazards(game);
  }
}

// Put the room back the way it was (parts you already have stay collected). Costs time.
function resetRoom(game) {
  if (game.over) return { ok: false, kind: 'over' };
  const room = cur(game), init = room.initial, hero = game.hero;
  room.crates = init.crates.map((r) => r.slice());
  room.pit = init.pit.map((r) => r.slice());
  room.robots = init.robots.map((r) => ({ ...r }));
  hero.x = hero.entry.x; hero.y = hero.entry.y; hero.air = 0;
  game.time -= RESET_PENALTY; game.resets++; game.invuln = INVULN;
  emit(game, { t: 'reset' });
  if (game.time <= 0) endGame(game);
  return { ok: true, kind: 'reset' };
}
