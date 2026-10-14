'use strict';

// The gods' powers, bought with manna. Each is cast at a corner of the land (the flood covers the whole world; a stone
// goes on a tile).
//   Swamp      bogs on up to SWAMP_TILES flat, clear squares round the corner; the first walker into each one sinks
//   Earthquake shakes the land within QUAKE_REACH squares into random lumps
//   Volcano    throws up a peak to full height and strews boulders down its sides
//   Flood      the sea rises a step everywhere: every corner above sea level drops by one
//   Stone      a ley stone at the end of the god's line (stones.js); quakes and volcanoes topple stones
// castPower returns { ok: true } or { ok: false, reason }, and charges only for a power that was cast.

const POWERS = [
  { id: 'swamp', name: 'SWAMP', key: '1', cost: 30, reach: 3 },
  { id: 'quake', name: 'QUAKE', key: '2', cost: 60, reach: 3 },
  { id: 'volcano', name: 'VOLCANO', key: '3', cost: 120, reach: 3 },
  { id: 'flood', name: 'FLOOD', key: '4', cost: 250, reach: 0 },
  { id: 'stone', name: 'STONE', key: '5', cost: STONE_COST, reach: 0 }, // a ley stone on the tile (see stones.js)
];
const POWER = Object.fromEntries(POWERS.map((p) => [p.id, p]));
const SWAMP_TILES = 8;
const QUAKE_SHOCKS = 30;    // random raises and lowers in an earthquake
const ROCK_CHANCE = 0.45;   // the chance of a boulder on each square of a volcano's slopes

const POWER_WORDS = { swamp: 'SPREADS A SWAMP', quake: 'SHAKES THE EARTH', volcano: 'RAISES A VOLCANO', flood: 'FLOODS THE WORLD', stone: 'RAISES A STONE' };

function castPower(world, tribe, id, u, v) {
  const p = POWER[id];
  if (!p) throw new RulesError('no-power', `there is no power "${id}"`);
  if (world.tribes[tribe].manna < p.cost) return { ok: false, reason: 'no-manna' };
  const done = id === 'swamp' ? swamp(world, u, v) : id === 'quake' ? quake(world, u, v) : id === 'volcano' ? volcano(world, u, v)
    : id === 'stone' ? raiseStone(world, tribe, u, v) : flood(world);
  if (!done.ok) return done;
  world.tribes[tribe].manna -= p.cost;
  checkFooting(world);
  event(world, id, { tribe, u, v });
  if (tribe !== PLAYER) say(world, `THE DARK GOD ${POWER_WORDS[id]}`);
  return { ok: true };
}

// The tiles whose corners lie within `reach` of corner (u, v), on the map.
function tilesNear(t, u, v, reach) {
  const out = [];
  for (let b = v - reach; b < v + reach; b++) for (let a = u - reach; a < u + reach; a++) if (a >= 0 && b >= 0 && a < t.n && b < t.n) out.push({ u: a, v: b });
  return out;
}

function swamp(world, u, v) {
  const t = copyTerrain(world.terrain);
  const spots = tilesNear(t, u, v, POWER.swamp.reach).filter((p) => isFlat(t, p.u, p.v) && isClear(t, p.u, p.v) && !houseAt(world, p.u, p.v));
  if (!spots.length) return { ok: false, reason: 'no-room' };
  for (const p of world.rng.shuffle(spots).slice(0, SWAMP_TILES)) t.f[p.v * t.n + p.u] = FEATURE.swamp;
  world.terrain = t;
  return { ok: true };
}

function quake(world, u, v) {
  const r = POWER.quake.reach;
  let t = world.terrain, moved = 0;
  for (let i = 0; i < QUAKE_SHOCKS; i++) {
    const a = u + world.rng.int(2 * r + 1) - r, b = v + world.rng.int(2 * r + 1) - r;
    if (a < 0 || b < 0 || a > t.n || b > t.n) continue;
    const shock = reshape(t, a, b, world.rng.next() < 0.5 ? 1 : -1);
    if (shock.ok) { t = shock.terrain; moved++; } // a shock that the land refuses (the sea's edge, the sea bed) just doesn't happen
  }
  if (!moved) return { ok: false, reason: 'no-room' };
  world.terrain = t;
  world.shake = 20;
  toppleStonesAt(world, tilesNear(t, u, v, r));
  return { ok: true };
}

function volcano(world, u, v) {
  let t = world.terrain, rose = 0;
  for (let next = reshape(t, u, v, 1); next.ok; next = reshape(t, u, v, 1)) { t = next.terrain; rose++; }
  if (!rose) return { ok: false, reason: 'no-room' };
  t = copyTerrain(t);
  for (const p of tilesNear(t, u, v, POWER.volcano.reach)) {
    const k = tileCorners(t, p.u, p.v);
    if (Math.min(...k) > 0 && !(isFlat(t, p.u, p.v) && houseAt(world, p.u, p.v)) && world.rng.next() < ROCK_CHANCE) t.f[p.v * t.n + p.u] = FEATURE.rock;
  }
  world.terrain = t;
  world.shake = 30;
  toppleStonesAt(world, tilesNear(t, u, v, POWER.volcano.reach));
  return { ok: true };
}

function flood(world) {
  const t = copyTerrain(world.terrain);
  for (let c = 0; c < t.h.length; c++) if (t.h[c] > 0) t.h[c]--;
  for (let b = 0; b < t.n; b++) for (let a = 0; a < t.n; a++) if (isWater(t, a, b)) t.f[b * t.n + a] = FEATURE.none;
  world.terrain = t;
  return { ok: true };
}
