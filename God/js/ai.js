'use strict';

// The dark god. Every AI_THINK_TICKS it looks at the corners round a few of its houses and tries raising and
// lowering each on a copy of the land, with the same costs and manna as the player, and makes the move that gains its
// houses the most flat ground for the manna (or saves up). Once it has world.rules.bridgeManna saved, after the grace period,
// it raises a hearth stone and land across the sea towards the player; when the land joins, it lays its ley line
// to the player's houses, and its gatherings walk it (aiStones, stones.js).
// Richer still, it casts a swamp or an earthquake on the player's biggest house (aiPower).

const AI_HOUSES_PER_THINK = 6;  // how many of its houses it looks round each time (picked at random)

// What a change to the land would do for a tribe: the flat ground its houses would gain, houses of its own broken,
// and mines of its own filled in.
// Looks by putting the changed land in place for a moment.
function judgeLand(world, tribe, terrain, base) {
  const real = world.terrain;
  world.terrain = terrain;
  let score = 0, broken = 0;
  for (const h of world.houses) {
    if (h.tribe !== tribe) continue;
    if (isFlat(terrain, h.u, h.v)) score += flatScore(world, h); else broken++;
  }
  const minesLost = world.tribes[tribe].mines - mines(world).filter((m) => m.house && m.house.tribe === tribe).length;
  world.terrain = real;
  return { gain: score - base.flat, broken, minesLost, levelled: base.uneven - unevenness(world, tribe, terrain) };
}
// How far the ground round a tribe's houses is from each house's own height: the sum, over the corners of each
// house's 5 x 5 patch, of how many steps each is above or below. Levelling a patch takes many small moves that
// add no flat squares at first; this rewards each of them, so the dark god works steadily towards a castle.
function unevenness(world, tribe, terrain) {
  let sum = 0;
  for (const h of world.houses) {
    if (h.tribe !== tribe) continue;
    const level = tileCorners(world.terrain, h.u, h.v)[0]; // its height before the move
    for (let v = h.v - 2; v <= h.v + 3; v++) for (let u = h.u - 2; u <= h.u + 3; u++) {
      if (u >= 0 && v >= 0 && u <= terrain.n && v <= terrain.n) sum += Math.abs(terrain.h[v * terrain.w + u] - level);
    }
  }
  return sum;
}

// Whether there is a way over land (no sea tiles, diagonal steps allowed) between two tiles.
function landPath(t, from, to) {
  const seen = new Uint8Array(t.n * t.n), queue = [from];
  seen[from.v * t.n + from.u] = 1;
  while (queue.length) {
    const { u, v } = queue.shift();
    if (u === to.u && v === to.v) return true;
    for (let dv = -1; dv <= 1; dv++) for (let du = -1; du <= 1; du++) {
      const a = u + du, b = v + dv;
      if (a < 0 || b < 0 || a >= t.n || b >= t.n || seen[b * t.n + a] || isWater(t, a, b)) continue;
      seen[b * t.n + a] = 1; queue.push({ u: a, v: b });
    }
  }
  return false;
}

// The rival pair of houses nearest each other: [mine, theirs], or null.
function nearestPair(world, tribe) {
  let best = null, bestD = Infinity;
  for (const a of world.houses) if (a.tribe === tribe) for (const b of world.houses) {
    if (b.tribe === tribe) continue;
    const d = (a.u - b.u) ** 2 + (a.v - b.v) ** 2;
    if (d < bestD) { best = [a, b]; bestD = d; }
  }
  return best;
}

// One step of the bridge: walking the straight line from its house to the rival's, the first sea tile on it gets a
// corner raised. Returns true if it raised something.
function bridgeStep(world, tribe, from, to) {
  const t = world.terrain, steps = Math.ceil(Math.hypot(to.u - from.u, to.v - from.v) * 2);
  for (let i = 1; i < steps; i++) {
    const u = Math.floor(from.u + 0.5 + ((to.u - from.u) * i) / steps), v = Math.floor(from.v + 0.5 + ((to.v - from.v) * i) / steps);
    if (!isWater(t, u, v)) continue;
    for (const [du, dv] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const r = reshape(t, u + du, v + dv, 1);
      if (r.ok && costOf(r) <= world.tribes[tribe].manna) return shapeLand(world, u + du, v + dv, 1, tribe).ok;
    }
    return false; // the next gap cannot be filled (the map's edge, or no manna): wait
  }
  return false;
}

// A tribe's armed strength: everyone it has, housed or walking, times its weapons.
function armedStrength(world, tribe) { return population(world, tribe) * armsOf(world, tribe); }
// The dark god sounds the Call of the Stones, at the rival's nearest house, when it can and is clearly the stronger.
function aiCall(world, tribe) {
  if (!world.powers.has('call') || world.call || world.tribes[tribe].manna < CALL_COST) return false;
  const pair = nearestPair(world, tribe), rival = tribe === PLAYER ? RIVAL : PLAYER;
  if (!pair || armedStrength(world, tribe) < AI_CALL_EDGE * armedStrength(world, rival)) return false;
  const at = reachTileToward(world, tribe, pair[1]);
  return !!at && castPower(world, tribe, 'call', at.u, at.v).ok;
}

// Now and then, when rich, the dark god shakes the earth under the rival's biggest house, or bogs the ground round it.
function aiPower(world, tribe) {
  const me = world.tribes[tribe];
  if (aiCall(world, tribe)) return true;
  const rules = world.rules;
  if (world.tick < rules.grace || me.manna < rules.powerManna || world.tick - me.lastPower < rules.powerGap) return false;
  const targets = world.houses.filter((h) => h.tribe !== tribe && cornerInReach(world, tribe, h.u + 1, h.v + 1)).sort((a, b) => b.level - a.level || b.pop - a.pop);
  if (!targets.length) return false;
  const h = targets[0], id = h.level >= 3 && world.powers.has('quake') ? 'quake' : 'swamp';
  if (!world.powers.has(id)) return false; // no powers in this land
  const r = castPower(world, tribe, id, h.u + 1, h.v + 1);
  if (!r.ok) return false; // nowhere to put it (no room for a swamp): it will think again
  me.lastPower = world.tick;
  return true;
}

// A dry tile with no house or stone on it, at or near (u, v), or null.
function freeTileNear(world, u, v) {
  const t = world.terrain;
  for (let r = 0; r <= 3; r++) for (let b = v - r; b <= v + r; b++) for (let a = u - r; a <= u + r; a++) {
    if (a >= 0 && b >= 0 && a < t.n && b < t.n && !isWater(t, a, b) && !houseAt(world, a, b) && !stoneAt(world, a, b)) return { u: a, v: b };
  }
  return null;
}
// The dark god's ley line, one stone a turn: after the grace period, a hearth by its biggest house; then waystones
// carrying its reach over the bridge it builds (aiThink) and on towards the rival. Returns true if it did something.
function aiStones(world, tribe, pair, joined) {
  const me = world.tribes[tribe], line = world.stones[tribe];
  if (world.tick < world.rules.grace || me.manna < STONE_COST) return false;
  const raise = (spot) => spot && castPower(world, tribe, 'stone', spot.u, spot.v).ok;
  if (!line.length) { // a hearth to start with (and to start again, when its line has fallen)
    if (me.manna < world.rules.bridgeManna) return false; // it waits until it is rich
    const big = world.houses.filter((h) => h.tribe === tribe).sort((a, b) => b.level - a.level || b.pop - a.pop)[0];
    return raise(freeTileNear(world, big.u + 1, big.v + 1));
  }
  if (!joined || !pair) return false;
  // Once the land joins, it only adds stones: each nearer the rival than its end stone, as far as its reach goes.
  const end = line[line.length - 1], dist = (p) => Math.hypot(p.u - pair[1].u, p.v - pair[1].v);
  if (line.length >= 2 && world.houses.some((h) => h.tribe !== tribe && gap(h, end) <= RALLY_RANGE)) return false; // the line is laid
  const spot = line.length < MAX_STONES ? reachTileToward(world, tribe, pair[1]) : null;
  if (spot && dist(spot) < dist(end) - 1) return raise(spot);
  // It can reach no nearer. If an army holds the end stone, take the stone down: the army settles there, and the
  // new village carries its reach on for the next stone.
  const army = world.walkers.find((w) => w.tribe === tribe && w.rally);
  if (line.length >= 2 && army && army.strength >= PILGRIM_MASS) return lowerStone(world, tribe, end.u, end.v).ok;
  return false;
}

function aiThink(world, tribe) {
  const mine = world.houses.filter((h) => h.tribe === tribe);
  if (!mine.length) return null;
  const me = world.tribes[tribe], pair = nearestPair(world, tribe);
  if (aiPower(world, tribe)) return { power: true };
  const joined = !!pair && landPath(world.terrain, pair[0], pair[1]);
  me.joined = joined; // (for the checks)
  if (aiStones(world, tribe, pair, joined)) return { stone: true };
  if (pair && !joined && world.tick >= world.rules.grace && me.manna >= world.rules.bridgeManna) {
    let raised = 0;
    while (raised < AI_BRIDGE_STEPS && bridgeStep(world, tribe, pair[0], pair[1])) raised++;
    if (raised) {
      if (!me.bridging && tribe === RIVAL) say(world, 'THE DARK GOD RAISES LAND FROM THE SEA');
      me.bridging = true;
      event(world, 'bridge', { tribe });
      return { bridge: raised };
    }
    // the gap is beyond its reach: a waystone on the furthest land it can reach, nearer the rival than its others
    const line = world.stones[tribe], spot = line.length && line.length < MAX_STONES - 1 ? reachTileToward(world, tribe, pair[1]) : null;
    const nearer = (p) => Math.hypot(p.u - pair[1].u, p.v - pair[1].v);
    if (spot && line.every((st) => nearer(spot) < nearer(st) - 1) && me.manna >= STONE_COST && castPower(world, tribe, 'stone', spot.u, spot.v).ok) return { stone: true };
  }
  const t = world.terrain;
  const base = { flat: 0, uneven: unevenness(world, tribe, t) };
  for (const h of mine) base.flat += flatScore(world, h);
  const corners = new Map(); // corner index -> [u, v]
  for (const h of world.rng.shuffle(mine).slice(0, AI_HOUSES_PER_THINK)) {
    for (let v = h.v - AI_REACH; v <= h.v + 1 + AI_REACH; v++) for (let u = h.u - AI_REACH; u <= h.u + 1 + AI_REACH; u++) {
      if (u > 0 && v > 0 && u < t.n && v < t.n) corners.set(v * t.w + u, [u, v]);
    }
  }
  let best = null;
  for (const [u, v] of corners.values()) for (const dir of [1, -1]) {
    const r = reshape(t, u, v, dir);
    if (!r.ok || costOf(r) > me.manna) continue;
    const j = judgeLand(world, tribe, r.terrain, base), value = j.gain + 0.4 * j.levelled - 10 * j.broken - 8 * j.minesLost;
    if (value <= 0) continue;
    const worth = value / costOf(r);
    if (!best || worth > best.worth) best = { u, v, dir, worth };
  }
  if (!best) return null;
  const done = shapeLand(world, best.u, best.v, best.dir, tribe);
  if (!done.ok) throw new RulesError('ai-move', `the dark god chose a move it could not make: (${best.u}, ${best.v}) by ${best.dir}: ${done.reason}`);
  return best;
}
