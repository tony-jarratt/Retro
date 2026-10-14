'use strict';

// The land: a height for every corner of a square grid of tiles. Corner (u, v) is at index v * W + u, W = n + 1.
// The rule that holds everywhere: every corner is within one step of all eight of its neighbours. So a tile's four
// corners are always some height m or m + 1, and raising or lowering a corner pushes its neighbours along with it,
// which is how a hill grows. The corners round the edge of the map stay at sea level, so the map is an island.

// Things standing on a tile (t.f, one per tile, index v * n + u): nobody can settle there, and it is not flat ground
// for a house, until the god clears it by moving a corner of the tile (raising buries anything; lowering leaves stone).
// Swamps come from the power, mines are dug in boulders; ruins are what a razed house leaves, and a toppled stone lies
// where it fell (a head for the good god, a broken arch for the dark god).
const FEATURE = { none: 0, tree: 1, pine: 2, rock: 3, swamp: 4, mine: 5, ruin: 6, fallenHead: 7, fallenArch: 8 };

// Stone that digging down leaves standing.
const STONY = new Set([FEATURE.rock, FEATURE.mine, FEATURE.fallenHead, FEATURE.fallenArch]);

function makeTerrain(n) {
  return { n, w: n + 1, h: new Int8Array((n + 1) * (n + 1)), f: new Uint8Array(n * n) };
}
function copyTerrain(t) { return { n: t.n, w: t.w, h: t.h.slice(), f: t.f.slice() }; }
function featureAt(t, u, v) { tileCorners(t, u, v); return t.f[v * t.n + u]; } // (tileCorners checks it is on the map)
const isClear = (t, u, v) => featureAt(t, u, v) === FEATURE.none;

function cornerIndex(t, u, v) {
  if (!Number.isInteger(u) || !Number.isInteger(v) || u < 0 || v < 0 || u > t.n || v > t.n) {
    throw new TerrainError('off-map', `corner (${u}, ${v}) is not on the ${t.n} x ${t.n} map`);
  }
  return v * t.w + u;
}
const heightAt = (t, u, v) => t.h[cornerIndex(t, u, v)];
const onEdge = (t, u, v) => u === 0 || v === 0 || u === t.n || v === t.n;

// The eight neighbours of a corner index that are on the map.
function neighbours(t, c) {
  const u = c % t.w, v = (c - u) / t.w, out = [];
  for (let dv = -1; dv <= 1; dv++) for (let du = -1; du <= 1; du++) {
    if (!du && !dv) continue;
    const a = u + du, b = v + dv;
    if (a >= 0 && b >= 0 && a <= t.n && b <= t.n) out.push(b * t.w + a);
  }
  return out;
}

// ---- tiles ----
function tileCorners(t, u, v) { // NW, NE, SE, SW
  if (!Number.isInteger(u) || !Number.isInteger(v) || u < 0 || v < 0 || u >= t.n || v >= t.n) {
    throw new TerrainError('off-map', `tile (${u}, ${v}) is not on the ${t.n} x ${t.n} map`);
  }
  const c = v * t.w + u;
  return [t.h[c], t.h[c + 1], t.h[c + t.w + 1], t.h[c + t.w]];
}
function isWater(t, u, v) { return tileCorners(t, u, v).every((h) => h === 0); }
function isFlat(t, u, v) { const k = tileCorners(t, u, v); return k[0] > 0 && k.every((h) => h === k[0]); }

// ---- shaping the land ----
// Raise (dir +1) or lower (dir -1) the corner (u, v) one step, pushing its neighbours along to keep the rule.
// Works on a copy, so a refused change leaves the land as it was. Refusals are ordinary outcomes, returned:
//   { ok: true, terrain, changed: [corner indices] }  or  { ok: false, reason: 'edge' | 'max-height' | 'sea-bed' }
function reshape(t, u, v, dir) {
  if (dir !== 1 && dir !== -1) throw new TerrainError('bad-direction', `reshape: dir must be 1 or -1, got ${dir}`);
  const c0 = cornerIndex(t, u, v);
  if (onEdge(t, u, v)) return { ok: false, reason: 'edge' };
  if (dir === 1 && t.h[c0] >= MAX_H) return { ok: false, reason: 'max-height' };
  if (dir === -1 && t.h[c0] <= 0) return { ok: false, reason: 'sea-bed' };
  const out = copyTerrain(t), changed = [c0];
  out.h[c0] += dir;
  const queue = [c0];
  while (queue.length) {
    const c = queue.shift();
    for (const nb of neighbours(out, c)) {
      const gap = (out.h[c] - out.h[nb]) * dir; // how far the neighbour has been left behind
      if (gap <= 1) continue;
      const nu = nb % out.w, nv = (nb - nu) / out.w;
      if (onEdge(out, nu, nv)) return { ok: false, reason: 'edge' }; // the hill would have to lift the sea's edge
      out.h[nb] = out.h[c] - dir;
      changed.push(nb); queue.push(nb);
    }
  }
  // What stood on the four tiles round a moved corner. Raising buries everything; lowering digs down, so the stone
  // stays (boulders, mines, fallen stones) while trees, rubble and bogs go. Anything left in the sea goes too.
  for (const c of changed) {
    const cu = c % out.w, cv = (c - cu) / out.w;
    for (const [tu, tv] of [[cu - 1, cv - 1], [cu, cv - 1], [cu - 1, cv], [cu, cv]]) {
      if (tu < 0 || tv < 0 || tu >= out.n || tv >= out.n) continue;
      const i = tv * out.n + tu, k = [out.h[tv * out.w + tu], out.h[tv * out.w + tu + 1], out.h[(tv + 1) * out.w + tu + 1], out.h[(tv + 1) * out.w + tu]];
      if (dir === 1 || !STONY.has(out.f[i]) || k.every((h) => h === 0)) out.f[i] = FEATURE.none;
    }
  }
  return { ok: true, terrain: out, changed };
}
const costOf = (result) => result.changed.length * COST_PER_CORNER;

// Throws if the rule is broken anywhere: a corner out of range, two neighbours more than a step apart, or the edge lifted.
function checkTerrain(t) {
  for (let v = 0; v <= t.n; v++) for (let u = 0; u <= t.n; u++) {
    const c = v * t.w + u, h = t.h[c];
    if (h < 0 || h > MAX_H) throw new RulesError('height', `corner (${u}, ${v}) is at height ${h}, outside 0..${MAX_H}`);
    if (onEdge(t, u, v) && h !== 0) throw new RulesError('edge', `edge corner (${u}, ${v}) is at height ${h}, not sea level`);
    if (u < t.n && v < t.n && t.f[v * t.n + u] && tileCorners(t, u, v).every((k) => k === 0)) {
      throw new RulesError('feature-in-sea', `tile (${u}, ${v}) is sea but has feature ${t.f[v * t.n + u]} on it`);
    }
    for (const nb of neighbours(t, c)) {
      if (Math.abs(t.h[nb] - h) > 1) {
        const nu = nb % t.w, nv = (nb - nu) / t.w;
        throw new RulesError('slope', `corners (${u}, ${v}) at ${h} and (${nu}, ${nv}) at ${t.h[nb]} are more than a step apart`);
      }
    }
  }
}

// ---- a new map ----
// Two landmasses with a sea strait between them, a few tiles wide, so the tribes start apart. Each is a soft-edged lump of low ground, roughened with many
// small hills and the odd tall one, then rounded to whole steps and pulled down until the rule holds everywhere.
// How a map is made (a land in the campaign can change any of these; the defaults are an ordinary map):
//   mass: each island's size, as a share of the map; strait: how wide the sea between them is;
//   forests: how many woods; wood: how thick they are; rock: how many boulders (1 = ordinary)
const MAP_STYLE = { mass: 0.2, strait: 2, forests: 12, wood: 0.75, rock: 1 };

function generateTerrain(n, seed, style = MAP_STYLE) {
  const rng = new Rng(seed), t = makeTerrain(n);
  const masses = [{ u: n * 0.3, v: n * 0.32, r: n * style.mass }, { u: n * 0.7, v: n * 0.68, r: n * style.mass }];
  const hills = [];
  for (const m of masses) {
    for (let i = 0; i < 14; i++) {
      const a = rng.next() * Math.PI * 2, d = Math.sqrt(rng.next()) * m.r;
      hills.push({ u: m.u + Math.cos(a) * d, v: m.v + Math.sin(a) * d, r: 1.5 + rng.next() * 2.5, a: i < 2 ? 3 + rng.next() * 2 : 0.6 + rng.next() * 1.4 });
    }
  }
  for (let i = 0; i < 4; i++) hills.push({ u: 8 + rng.next() * (n - 16), v: 8 + rng.next() * (n - 16), r: 1.5 + rng.next() * 1.5, a: 1.2 + rng.next() });
  for (let v = 0; v <= n; v++) for (let u = 0; u <= n; u++) {
    if (onEdge(t, u, v)) continue;
    let s = -0.4;
    for (const m of masses) { // a lump of land about 1.5 high, falling away to the sea at its rim
      const d = Math.hypot(u - m.u, v - m.v) / m.r;
      s += 1.9 / (1 + Math.exp((d - 1) * 6));
    }
    for (const b of hills) s += b.a * Math.exp(-((u - b.u) ** 2 + (v - b.v) ** 2) / (2 * b.r * b.r));
    const strait = (u + v - n) / Math.SQRT2; // distance from the line between the two lands
    s -= 4 * Math.exp(-(strait * strait) / (2 * style.strait * style.strait));
    t.h[v * t.w + u] = Math.max(0, Math.min(MAX_H, Math.round(s)));
  }
  // pull every corner down to at most one above its lowest neighbour, until nothing moves
  for (let moved = true; moved;) {
    moved = false;
    for (let c = 0; c < t.h.length; c++) {
      let low = t.h[c];
      for (const nb of neighbours(t, c)) low = Math.min(low, t.h[nb] + 1);
      if (low < t.h[c]) { t.h[c] = low; moved = true; }
    }
  }
  placeFeatures(t, rng, style);
  checkTerrain(t);
  return t;
}

// Forests of round trees on the low ground, pines higher up, and boulders mostly on the hills. Nothing on the sea or
// the sandy shore.
function placeFeatures(t, rng, style) {
  const forests = Array.from({ length: style.forests }, () => ({ u: rng.next() * t.n, v: rng.next() * t.n, r: 2 + rng.next() * 2.5 }));
  for (let v = 0; v < t.n; v++) for (let u = 0; u < t.n; u++) {
    const k = tileCorners(t, u, v), lo = Math.min(...k), hi = Math.max(...k);
    if (lo === 0) continue;
    let wood = 0.04;
    for (const f of forests) wood += style.wood * Math.exp(-((u - f.u) ** 2 + (v - f.v) ** 2) / (2 * f.r * f.r));
    const roll = rng.next();
    if (roll < (hi >= 3 ? 0.06 : 0.015) * style.rock) t.f[v * t.n + u] = FEATURE.rock;
    else if (roll < wood) t.f[v * t.n + u] = hi >= 3 ? FEATURE.pine : FEATURE.tree;
  }
}
