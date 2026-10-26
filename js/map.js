'use strict';

// Hex maths and the map. Flat-top hexes, odd columns shifted down (as in mockup B).
// A hex is [column, row]. Directions are numbered 0 to 5: up, up-right, down-right, down, down-left, up-left.
// No drawing and no DOM in here, so it can be tested on its own.

const DIR_STEPS = [
  [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1]], // even columns
  [[0, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]],   // odd columns
];

function hexKey(c, r) { return c + ',' + r; }
function oddColumn(c) { return ((c % 2) + 2) % 2; }

function makeMap(name, rows) {
  if (!rows.length) throw new MapError('empty', `Map ${name}: it has no rows`);
  const cols = rows[0].length;
  rows.forEach((row, r) => {
    if (row.length !== cols) throw new MapError('ragged', `Map ${name}: row ${r} has ${row.length} columns, row 0 has ${cols}`);
    for (let c = 0; c < cols; c++) {
      if (!TERRAIN[row[c]]) throw new MapError('terrain', `Map ${name}: unknown terrain "${row[c]}" at column ${c}, row ${r}`);
    }
  });
  const charges = {}; // repair bays: hex key -> repairs left (see REPAIR_CHARGES)
  rows.forEach((row, r) => { // repair bays and ammo caches: hex key -> uses left
    for (let c = 0; c < cols; c++) {
      if (TERRAIN[row[c]].repair) charges[hexKey(c, r)] = REPAIR_CHARGES;
      if (TERRAIN[row[c]].resupply) charges[hexKey(c, r)] = RESUPPLY_CHARGES;
    }
  });
  return { name, cols, rows: rows.length, tiles: rows.slice(), charges };
}

// The sensor towers on a map, as [c, r].
function sensorHexes(map) {
  const out = [];
  map.tiles.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (TERRAIN[row[c]].sensor) out.push([c, r]); });
  return out;
}

function inMap(map, c, r) { return c >= 0 && r >= 0 && c < map.cols && r < map.rows; }

// Can a mech ever stand on this hex? (Buildings and peaks cannot be entered.)
function isPassable(map, c, r) { return terrainAt(map, c, r).passable !== false; }

function terrainAt(map, c, r) {
  if (!inMap(map, c, r)) throw new MapError('off-map', `Map ${map.name}: hex ${hexKey(c, r)} is off the map`);
  return TERRAIN[map.tiles[r][c]];
}

function neighbour(c, r, dir) {
  const step = DIR_STEPS[oddColumn(c)][dir];
  return [c + step[0], r + step[1]];
}

function neighbours(map, c, r) {
  const out = [];
  for (let dir = 0; dir < 6; dir++) {
    const [nc, nr] = neighbour(c, r, dir);
    if (inMap(map, nc, nr)) out.push({ c: nc, r: nr, dir });
  }
  return out;
}

// ---- cube coordinates, for distance and lines ----
function toCube(c, r) {
  const x = c, z = r - (c - oddColumn(c)) / 2;
  return [x, -x - z, z];
}
function fromCube(x, y, z) { return [x, z + (x - oddColumn(x)) / 2]; }
function cubeRound(x, y, z) {
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return [rx, ry, rz];
}

function hexDist(c1, r1, c2, r2) {
  const a = toCube(c1, r1), b = toCube(c2, r2);
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

// Every hex on the straight line from a to b, both ends included.
function hexLine(a, b) {
  const n = hexDist(a[0], a[1], b[0], b[1]);
  const ca = toCube(a[0], a[1]), cb = toCube(b[0], b[1]);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    // The tiny nudge settles lines that run exactly along a hex edge the same way every time.
    const x = ca[0] + (cb[0] - ca[0]) * t + 1e-6, y = ca[1] + (cb[1] - ca[1]) * t + 2e-6, z = ca[2] + (cb[2] - ca[2]) * t - 3e-6;
    const [rx, ry, rz] = cubeRound(x, y, z);
    out.push(fromCube(rx, ry, rz));
  }
  return out;
}

// Line of sight: a woods hex strictly between the two ends blocks it; so does a hills hex, unless
// either end stands on higher ground than the hex (a mech on a hill sees over hills).
// Smoke lives on the map as map.smoke, a plain object from hex key to the rounds it has left (so it is copied with the
// state). It blocks line of sight through, into and out of its hexes.
function smokeHexes(map, c, r) { // the hex and its neighbours that are on the map
  return [[c, r]].concat(neighbours(map, c, r).map(n => [n.c, n.r]));
}

function addSmoke(map, hexes, rounds) {
  if (!map.smoke) map.smoke = {};
  for (const [c, r] of hexes) map.smoke[hexKey(c, r)] = Math.max(map.smoke[hexKey(c, r)] || 0, rounds);
}

function fadeSmoke(map) { // one round passes
  if (!map.smoke) return;
  for (const key of Object.keys(map.smoke)) if (--map.smoke[key] <= 0) delete map.smoke[key];
}

function hasLineOfSight(map, a, b) {
  // The line is always traced from the same end, so that A seeing B always means B sees A.
  const swap = a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
  const line = swap ? hexLine(b, a) : hexLine(a, b);
  if (map.smoke) for (const [c, r] of line) if (map.smoke[hexKey(c, r)]) return false;
  const topEnd = Math.max(terrainAt(map, a[0], a[1]).height, terrainAt(map, b[0], b[1]).height);
  for (let i = 1; i < line.length - 1; i++) {
    // A line along the edge of the map can graze a hex just outside it. That hex has no terrain, so it
    // cannot block anything. (The two ends are checked above and must be on the map.)
    if (!inMap(map, line[i][0], line[i][1])) continue;
    const t = terrainAt(map, line[i][0], line[i][1]);
    if (t.blocks) return false;
    if (t.height > topEnd) return false;
  }
  return true;
}

// ---- movement ----
// Every hex a mech can reach from `from` with `allowance` movement points. `blocked` is a Set of hex keys it
// cannot enter. Returns a Map of key -> { c, r, cost, prev } (prev is the key it came from, null at the start).
function reachableHexes(map, from, allowance, blocked) {
  const best = new Map();
  best.set(hexKey(from[0], from[1]), { c: from[0], r: from[1], cost: 0, prev: null });
  const done = new Set();
  for (;;) {
    let cur = null;
    for (const [key, node] of best) {
      if (done.has(key)) continue;
      if (!cur || node.cost < cur.node.cost || (node.cost === cur.node.cost && key < cur.key)) cur = { key, node };
    }
    if (!cur) break;
    done.add(cur.key);
    for (const n of neighbours(map, cur.node.c, cur.node.r)) {
      const key = hexKey(n.c, n.r);
      if (blocked.has(key)) continue;
      if (!isPassable(map, n.c, n.r)) continue;
      const cost = cur.node.cost + terrainAt(map, n.c, n.r).cost;
      if (cost > allowance) continue;
      const old = best.get(key);
      if (!old || cost < old.cost) best.set(key, { c: n.c, r: n.r, cost, prev: cur.key });
    }
  }
  return best;
}

// The hexes to step through to reach [c, r], not including the start.
function pathTo(reach, c, r) {
  let node = reach.get(hexKey(c, r));
  if (!node) throw new MapError('unreachable', `Hex ${hexKey(c, r)} cannot be reached`);
  const path = [];
  while (node.prev !== null) {
    path.unshift([node.c, node.r]);
    node = reach.get(node.prev);
  }
  return path;
}

function pathCost(map, path) {
  let total = 0;
  for (const h of path) total += terrainAt(map, h[0], h[1]).cost;
  return total;
}

// ---- facing ----
function hexCentre(c, r) { return [1.5 * c, Math.sqrt(3) * (r + 0.5 * oddColumn(c))]; }
function angleDeg(a, b) { // direction from hex a to hex b, degrees, 0 = right, positive = down the screen
  const pa = hexCentre(a[0], a[1]), pb = hexCentre(b[0], b[1]);
  return Math.atan2(pb[1] - pa[1], pb[0] - pa[0]) * 180 / Math.PI;
}
function dirAngle(dir) { return -90 + 60 * dir; }

// The direction index nearest to the way from hex a to hex b.
function dirToward(a, b) {
  const steps = Math.round((angleDeg(a, b) + 90) / 60);
  return ((steps % 6) + 6) % 6;
}

// A hit is from behind when the attacker lies in the 120 degree wedge behind the target. The wedge
// edges count as side hits, so only attackers more than 120 degrees round from the front are behind.
function isRearAttack(targetPos, targetFacing, attackerPos) {
  const diff = Math.abs(((angleDeg(targetPos, attackerPos) - dirAngle(targetFacing) + 540) % 360) - 180);
  return diff > 120 + 1e-6;
}
