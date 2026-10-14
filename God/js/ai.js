'use strict';

// The dark god. Every AI_THINK_TICKS it looks at the corners round a few of its houses and tries raising and
// lowering each on a copy of the land, with the same costs and manna as the player, and makes the move that gains its
// houses the most flat ground for the manna (or saves up). Once it has world.rules.bridgeManna saved, after the grace period,
// it raises land across the sea towards the player; when the land joins, its strong bands march (see nearestFoe).
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
  return { gain: score - base, broken, minesLost };
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

// Now and then, when rich, the dark god shakes the earth under the rival's biggest house, or bogs the ground round it.
function aiPower(world, tribe) {
  const me = world.tribes[tribe];
  const rules = world.rules;
  if (world.tick < rules.grace || me.manna < rules.powerManna || world.tick - me.lastPower < rules.powerGap) return false;
  const targets = world.houses.filter((h) => h.tribe !== tribe).sort((a, b) => b.level - a.level || b.pop - a.pop);
  if (!targets.length) return false;
  const h = targets[0], id = h.level >= 3 ? 'quake' : 'swamp';
  const r = castPower(world, tribe, id, h.u + 1, h.v + 1);
  if (!r.ok) return false; // nowhere to put it (no room for a swamp): it will think again
  me.lastPower = world.tick;
  return true;
}

function aiThink(world, tribe) {
  const mine = world.houses.filter((h) => h.tribe === tribe);
  if (!mine.length) return null;
  const me = world.tribes[tribe], pair = nearestPair(world, tribe);
  if (aiPower(world, tribe)) return { power: true };
  me.marching = !!pair && landPath(world.terrain, pair[0], pair[1]);
  if (pair && !me.marching && world.tick >= world.rules.grace && me.manna >= world.rules.bridgeManna) {
    let raised = 0;
    while (raised < AI_BRIDGE_STEPS && bridgeStep(world, tribe, pair[0], pair[1])) raised++;
    if (raised) {
      if (!me.bridging && tribe === RIVAL) say(world, 'THE DARK GOD RAISES LAND FROM THE SEA');
      me.bridging = true;
      event(world, 'bridge', { tribe });
      return { bridge: raised };
    }
  }
  const t = world.terrain;
  let base = 0;
  for (const h of mine) base += flatScore(world, h);
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
    const j = judgeLand(world, tribe, r.terrain, base), value = j.gain - 10 * j.broken - 8 * j.minesLost;
    if (value <= 0) continue;
    const worth = value / costOf(r);
    if (!best || worth > best.worth) best = { u, v, dir, worth };
  }
  if (!best) return null;
  const done = shapeLand(world, best.u, best.v, best.dir, tribe);
  if (!done.ok) throw new RulesError('ai-move', `the dark god chose a move it could not make: (${best.u}, ${best.v}) by ${best.dir}: ${done.reason}`);
  return best;
}
