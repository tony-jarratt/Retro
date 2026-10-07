'use strict';

// A breadth-first search over the real game rules, used only by the tests. It finds the shortest list of
// actions that makes a goal true, so every room's puzzle can be proved solvable. Robots and steam vents are
// ignored (they only cost time), and it only looks inside the room the hero starts in.

const SOLVER_ACTIONS = [];
for (const d of ['N', 'E', 'S', 'W']) SOLVER_ACTIONS.push(['walk', d]);
for (const d of ['N', 'E', 'S', 'W']) SOLVER_ACTIONS.push(['hop', d]);
const ACTION_FN = { walk, hop };

function snapGame(game) {
  const r = cur(game), h = game.hero;
  return {
    room: h.room, x: h.x, y: h.y, face: h.face, carry: h.carry.slice(), delivered: game.delivered.slice(), over: game.over, steps: game.steps,
    crates: r.crates.map((row) => row.slice()), pit: r.pit.map((row) => row.slice()), taken: r.parts.map((p) => p.taken),
  };
}

function restoreGame(game, s) {
  const h = game.hero, r = game.rooms[s.room];
  h.room = s.room; h.x = s.x; h.y = s.y; h.face = s.face; h.carry = s.carry.slice(); h.air = 0;
  game.delivered = s.delivered.slice(); game.over = s.over; game.steps = s.steps;
  r.crates = s.crates.map((row) => row.slice()); r.pit = s.pit.map((row) => row.slice());
  r.parts.forEach((p, i) => { p.taken = s.taken[i]; });
}

function snapKey(s) {
  return `${s.x},${s.y},${s.carry.length},${s.delivered.length}|${s.crates.map((r) => r.join('')).join('/')}|${s.pit.map((r) => r.map((v) => (v ? 1 : 0)).join('')).join('/')}|${s.taken.map((t) => (t ? 1 : 0)).join('')}`;
}

// Returns an array of [action, direction] pairs, or null if no solution was found within the limit.
function solve(game, goal, limit = 400000) {
  const savedHazards = game.hazards, savedInvuln = game.invuln;
  game.hazards = false;
  const startRoom = game.hero.room;
  const start = snapGame(game);
  const seen = new Set([snapKey(start)]);
  let frontier = [{ s: start, path: null }];
  let visited = 0, found = null;
  outer:
  while (frontier.length && !found) {
    const next = [];
    for (const node of frontier) {
      for (const act of SOLVER_ACTIONS) {
        restoreGame(game, node.s);
        game.events.length = 0;
        const res = ACTION_FN[act[0]](game, act[1]);
        game.events.length = 0;
        if (!res.ok) continue;
        if (goal(game)) { found = { prev: node.path, act }; break outer; }
        if (game.hero.room !== startRoom) continue; // wandered into another room that is not the goal
        const s = snapGame(game), key = snapKey(s);
        if (seen.has(key)) continue;
        seen.add(key);
        if (++visited > limit) { found = null; break outer; }
        next.push({ s, path: { prev: node.path, act } });
      }
    }
    frontier = next;
  }
  restoreGame(game, start);
  game.hazards = savedHazards; game.invuln = savedInvuln; game.events.length = 0;
  if (!found) return null;
  const out = [found.act];
  for (let p = found.prev; p; p = p.prev) out.push(p.act);
  return out.reverse();
}

// every action the bot takes, in order, so a test can replay the whole game through the real keyboard layer
const BOT_ACTIONS = [];

function applyActions(game, actions) {
  for (const [name, dir] of actions) {
    BOT_ACTIONS.push([name, dir]);
    const res = ACTION_FN[name](game, dir);
    if (!res.ok) throw new Error(`replay failed: ${name} ${dir} was refused (${res.why || res.kind})`);
  }
}

// ---- a whole game, played by the solver ----
function roomPath(fromIdx, toIdx) { // shortest route through the doorways, as a list of room indexes
  const prev = new Map([[fromIdx, null]]);
  const queue = [fromIdx];
  while (queue.length) {
    const i = queue.shift();
    if (i === toIdx) break;
    for (const dir of Object.keys(ROOMS[i].exits)) {
      const n = ROOMS.findIndex((r) => r.col === ROOMS[i].col + { E: 1, W: -1, N: 0, S: 0 }[dir] && r.row === ROOMS[i].row + { N: -1, S: 1, E: 0, W: 0 }[dir]);
      if (!prev.has(n)) { prev.set(n, i); queue.push(n); }
    }
  }
  const path = [];
  for (let i = toIdx; i !== null; i = prev.get(i)) path.unshift(i);
  return path;
}

function botGoTo(game, roomIdx, log) {
  const path = roomPath(game.hero.room, roomIdx);
  for (const next of path.slice(1)) {
    let sol = solve(game, (g) => g.hero.room === next);
    if (!sol) { resetRoom(game); BOT_ACTIONS.push(['reset']); sol = solve(game, (g) => g.hero.room === next); log.push(`reset in ${ROOMS[game.hero.room].id}`); }
    if (!sol) throw new Error(`stuck in ${ROOMS[game.hero.room].id}: cannot reach ${ROOMS[next].id}`);
    applyActions(game, sol);
    log.push(`${ROOMS[game.hero.room].id}: ${sol.length}`);
  }
}

// Collect every part and deliver them all, one trip per three parts. Returns { game, log }.
function botPlay() {
  BOT_ACTIONS.length = 0;
  const game = createGame();
  game.hazards = false;
  const log = [];
  const launch = ROOM_INDEX.launch;
  let carried = 0;
  PARTS.forEach((part, i) => {
    botGoTo(game, ROOM_INDEX[part.room], log);
    const before = game.hero.carry.length;
    const sol = solve(game, (g) => g.hero.carry.length > before);
    if (!sol) throw new Error(`cannot reach the ${part.name} in ${part.room}`);
    applyActions(game, sol);
    log.push(`${part.id}: ${sol.length}`);
    carried++;
    if (carried === CARRY_MAX || i === PARTS.length - 1) {
      botGoTo(game, launch, log);
      const delivered = game.delivered.length;
      const dsol = solve(game, (g) => g.delivered.length > delivered);
      if (!dsol) throw new Error('cannot reach the rocket');
      applyActions(game, dsol);
      log.push(`delivered: ${dsol.length}`);
      carried = 0;
    }
  });
  return { game, log };
}
