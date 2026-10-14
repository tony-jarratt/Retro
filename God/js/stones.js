'use strict';

// Ley stones. Each god raises stones on the land; its stones, in the order they were raised, are its ley line
// (world.stones[tribe] = [{ id, u, v }, ...]). The first is the hearth: the god's walkers within GATHER_RADIUS of it
// are drawn there and gather into one band (a walker with `gathered` set). When the gathering is PILGRIM_MASS strong
// it sets off as pilgrims (`pilgrim` = the index of the stone it is heading for) and walks the line stone by stone.
// At the last stone it is home: it fights whatever foe is near, or settles. Nobody is ever ordered about: the god only
// raises and takes down stones. A stone topples when the rival's walkers reach it, when a quake or volcano covers it,
// or when the sea does; the line closes up behind it.

// The stone on a tile, of either god: { tribe, index, stone }, or null.
function stoneAt(world, u, v) {
  for (let tribe = 0; tribe < world.stones.length; tribe++) {
    const index = world.stones[tribe].findIndex((s) => s.u === u && s.v === v);
    if (index >= 0) return { tribe, index, stone: world.stones[tribe][index] };
  }
  return null;
}
const hearthOf = (world, tribe) => world.stones[tribe][0] || null;

// Raise a stone at the end of a god's ley line. Returns { ok: true } or { ok: false, reason }.
function raiseStone(world, tribe, u, v) {
  const t = world.terrain;
  if (u < 0 || v < 0 || u >= t.n || v >= t.n) throw new TerrainError('off-map', `a stone at tile (${u}, ${v}) is off the map`);
  if (isWater(t, u, v)) return { ok: false, reason: 'sea' };
  if (stoneAt(world, u, v) || houseAt(world, u, v)) return { ok: false, reason: 'taken' };
  if (t.f[v * t.n + u] === FEATURE.fallenHead || t.f[v * t.n + u] === FEATURE.fallenArch) t.f[v * t.n + u] = FEATURE.none; // raised again where one fell
  if (world.stones[tribe].length >= MAX_STONES) return { ok: false, reason: 'too-many' };
  world.stones[tribe].push({ id: world.nextId++, u, v });
  return { ok: true };
}

// Take a stone out of a god's line; `why` is 'lowered' (by its god) or 'toppled'. A toppled stone lies where it fell.
// If it was the hearth, the whole line comes down with it: its gathering scatters, its pilgrims are just walkers again,
// and the god starts a new line from scratch. Otherwise pilgrims bound for a later stone carry on along the shortened line.
function removeStone(world, tribe, index, why) {
  const line = world.stones[tribe], t = world.terrain;
  if (!line[index]) throw new RulesError('no-stone', `tribe ${tribe} has no stone ${index} to remove`);
  const gone = index === 0 ? line.splice(0) : line.splice(index, 1);
  for (const st of gone) if (why !== 'lowered' && !isWater(t, st.u, st.v)) t.f[st.v * t.n + st.u] = tribe === PLAYER ? FEATURE.fallenHead : FEATURE.fallenArch;
  for (const w of world.walkers) {
    if (w.tribe !== tribe) continue;
    if (index === 0) { w.gathered = false; w.pilgrim = 0; continue; }
    if (w.pilgrim > index) w.pilgrim--;
    if (w.pilgrim >= line.length) w.pilgrim = 0; // the line ends before their stone now: they are home
  }
  event(world, why === 'lowered' ? 'lowered' : 'topple', { tribe, u: gone[0].u, v: gone[0].v, hearth: index === 0, count: gone.length });
}
function lowerStone(world, tribe, u, v) {
  const at = stoneAt(world, u, v);
  if (!at || at.tribe !== tribe) return { ok: false, reason: 'not-yours' };
  removeStone(world, tribe, at.index, 'lowered');
  return { ok: true };
}
// Topple every stone on the given tiles (a list of { u, v }).
function toppleStonesAt(world, tiles) {
  for (const p of tiles) {
    const at = stoneAt(world, p.u, p.v);
    if (at) removeStone(world, at.tribe, at.index, 'toppled');
  }
}

// Each tick: stones in the sea or reached by the rival's walkers topple; a full gathering sets off down the line.
function stepStones(world) {
  const t = world.terrain;
  for (let tribe = 0; tribe < world.stones.length; tribe++) {
    for (let i = world.stones[tribe].length - 1; i >= 0; i--) {
      const s = world.stones[tribe][i];
      const raided = world.walkers.some((w) => w.tribe !== tribe && Math.floor(w.x) === s.u && Math.floor(w.y) === s.v);
      if (isWater(t, s.u, s.v) || raided) removeStone(world, tribe, i, 'toppled');
    }
    if (world.stones[tribe].length < 2 || !hearthOf(world, tribe)) continue; // a hearth alone (or none): no one sets out
    for (const w of world.walkers) {
      if (w.tribe === tribe && w.gathered && w.strength >= PILGRIM_MASS) {
        w.gathered = false; w.pilgrim = 1; w.from = null;
        event(world, 'pilgrims', { tribe, u: w.tu, v: w.tv, strength: w.strength });
      }
    }
  }
}

// How a walker feels the stones: { target, weight } for nextTile to steer by, or null. Pilgrims head for their next
// stone; anyone else near their own hearth is drawn to it, except a band that has walked the line and is home.
function stonePull(world, w) {
  if (world.call) return { target: world.call, weight: 16 }; // the Call of the Stones: everyone goes
  const line = world.stones[w.tribe];
  if (w.pilgrim) return line[w.pilgrim] ? { target: line[w.pilgrim], weight: 14 } : null;
  const hearth = hearthOf(world, w.tribe);
  if (hearth && !w.arrived && gap(hearth, { u: w.tu, v: w.tv }) <= GATHER_RADIUS) return { target: hearth, weight: 12 };
  return null;
}

// How many steps over dry land (diagonal steps allowed) each tile is from a target tile, as an array indexed
// v * n + u; -1 where there is no way over land. Pilgrims and gatherers follow it downhill, so they find a bridge
// wherever it is; with no way at all they make straight for the stone and wait at the shore.
function landSteps(t, target) {
  const steps = new Int32Array(t.n * t.n).fill(-1), queue = [target];
  steps[target.v * t.n + target.u] = 0;
  for (let i = 0; i < queue.length; i++) {
    const { u, v } = queue[i], d = steps[v * t.n + u];
    for (let dv = -1; dv <= 1; dv++) for (let du = -1; du <= 1; du++) {
      const a = u + du, b = v + dv;
      if (a < 0 || b < 0 || a >= t.n || b >= t.n || steps[b * t.n + a] >= 0 || isWater(t, a, b)) continue;
      steps[b * t.n + a] = d + 1; queue.push({ u: a, v: b });
    }
  }
  return steps;
}

// ---- a god's reach ----
// A god can touch the land only near its own: within GOD_REACH squares (diagonal steps count one) of its houses and
// its stones. Raising stones, each within reach of the last, is how a god reaches across the sea. A world made
// without people (the checks' sandboxes) has no limit. Returns a 0/1 map indexed v * n + u, or null for no limit.
function reachMap(world, tribe) {
  if (!world.reachRule) return null;
  const t = world.terrain, n = t.n, map = new Uint8Array(n * n);
  const mark = (cu, cv) => {
    for (let v = Math.max(0, cv - GOD_REACH); v <= Math.min(n - 1, cv + GOD_REACH); v++) {
      for (let u = Math.max(0, cu - GOD_REACH); u <= Math.min(n - 1, cu + GOD_REACH); u++) map[v * n + u] = 1;
    }
  };
  for (const h of world.houses) if (h.tribe === tribe) mark(h.u, h.v);
  for (const st of world.stones[tribe]) mark(st.u, st.v);
  return map;
}
function tileInReach(world, tribe, u, v) {
  const map = reachMap(world, tribe);
  return !map || map[v * world.terrain.n + u] === 1;
}
// A corner is in reach if any of the four tiles round it is.
function cornerInReach(world, tribe, u, v) {
  const map = reachMap(world, tribe), n = world.terrain.n;
  if (!map) return true;
  return [[u - 1, v - 1], [u, v - 1], [u - 1, v], [u, v]].some(([a, b]) => a >= 0 && b >= 0 && a < n && b < n && map[b * n + a] === 1);
}
// The free dry tile within a god's reach that is nearest a target (to reach towards it), or null.
function reachTileToward(world, tribe, target) {
  const t = world.terrain, map = reachMap(world, tribe);
  let best = null, bestD = Infinity;
  for (let v = 0; v < t.n; v++) for (let u = 0; u < t.n; u++) {
    if ((map && !map[v * t.n + u]) || isWater(t, u, v) || houseAt(world, u, v) || stoneAt(world, u, v)) continue;
    const d = Math.hypot(u - target.u, v - target.v);
    if (d < bestD) { best = { u, v }; bestD = d; }
  }
  return best;
}
