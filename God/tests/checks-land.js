'use strict';

// The land: the one-step rule, raising and lowering, costs, refusals, the map generator, and picking a corner.

// A flat map at height h (with the sea round the edge, pulled into shape).
function flatLand(n, h) {
  const t = makeTerrain(n);
  for (let v = 1; v < n; v++) for (let u = 1; u < n; u++) t.h[v * t.w + u] = Math.min(h, u, v, n - u, n - v);
  checkTerrain(t);
  return t;
}

check('land: the generated map keeps the rule and has two landmasses with sea between', () => {
  const t = generateTerrain(MAP_N, SEED);
  checkTerrain(t);
  assert(!isWater(t, 19, 20), 'the north-west land');
  assert(!isWater(t, 44, 44), 'the south-east land');
  assert(isWater(t, 2, 2) && isWater(t, MAP_N - 3, MAP_N - 3), 'sea in the corners');
  assert(!landPath(t, { u: 19, v: 20 }, { u: 44, v: 44 }), 'a strait between the two lands');
  let flat = 0;
  for (let v = 0; v < MAP_N; v++) for (let u = 0; u < MAP_N; u++) if (isFlat(t, u, v)) flat++;
  assert(flat > 200, `plenty of flat ground to settle (${flat} tiles)`);
});

check('land: the same seed makes the same map, another seed a different one', () => {
  eq(Array.from(generateTerrain(MAP_N, 7).h), Array.from(generateTerrain(MAP_N, 7).h), 'same seed');
  assert(Array.from(generateTerrain(MAP_N, 7).h).join() !== Array.from(generateTerrain(MAP_N, 8).h).join(), 'different seeds');
});

check('land: raising one corner of the sea floor three times grows a hill of 1, then 9, then 25 corners', () => {
  let t = makeTerrain(16);
  const counts = [];
  for (let i = 0; i < 3; i++) { const r = reshape(t, 8, 8, 1); assert(r.ok, r.reason); counts.push(r.changed.length); t = r.terrain; }
  eq(counts, [1, 9, 25]);
  eq([heightAt(t, 8, 8), heightAt(t, 9, 9), heightAt(t, 10, 6), heightAt(t, 11, 8)], [3, 2, 1, 0], 'the cone');
  checkTerrain(t);
});

check('land: lowering is the mirror of raising', () => {
  let t = flatLand(16, 4);
  const counts = [];
  for (let i = 0; i < 2; i++) { const r = reshape(t, 8, 8, -1); assert(r.ok, r.reason); counts.push(r.changed.length); t = r.terrain; }
  eq(counts, [1, 9]);
  eq([heightAt(t, 8, 8), heightAt(t, 7, 9), heightAt(t, 10, 8)], [2, 3, 4]);
});

check('land: a refused change leaves the land alone, and says why', () => {
  const t = flatLand(16, 3), before = Array.from(t.h);
  eq(reshape(t, 0, 5, 1), { ok: false, reason: 'edge' }, 'the edge');
  eq(reshape(t, 1, 5, 1), { ok: false, reason: 'edge' }, 'next to the edge: the hill would lift it');
  eq(reshape(makeTerrain(8), 4, 4, -1), { ok: false, reason: 'sea-bed' }, 'below the sea bed');
  let tall = makeTerrain(20);
  for (let i = 0; i < MAX_H; i++) tall = reshape(tall, 10, 10, 1).terrain;
  eq(reshape(tall, 10, 10, 1), { ok: false, reason: 'max-height' }, 'above the top');
  eq(Array.from(t.h), before, 'unchanged');
});

check('land: off the map is an error, not a refusal', () => {
  const t = makeTerrain(8);
  throwsKind(TerrainError, 'off-map', () => reshape(t, 9, 2, 1));
  throwsKind(TerrainError, 'off-map', () => tileCorners(t, 8, 0));
  throwsKind(TerrainError, 'bad-direction', () => reshape(t, 3, 3, 2));
});

check('land: 1,000 random raises and lowers never break the rule', () => {
  const rng = new Rng(42);
  let t = generateTerrain(MAP_N, SEED), done = 0;
  for (let i = 0; i < 1000; i++) {
    const r = reshape(t, rng.range(0, MAP_N), rng.range(0, MAP_N), rng.chance(50) ? 1 : -1);
    if (r.ok) { t = r.terrain; done++; }
  }
  checkTerrain(t);
  assert(done > 500, `most of them were allowed (${done})`);
});

check('land: shaping costs manna for every corner that moves, and is refused without enough', () => {
  const w = makeWorld(SEED, { manna: 10, people: false });
  // a corner in the middle of a 5 x 5 patch of corners all at the same height
  const level = (u, v) => { for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) if (heightAt(w.terrain, u + a, v + b) !== heightAt(w.terrain, u, v)) return false; return true; };
  let u = 0, v = 0;
  for (let y = 3; y < MAP_N - 3 && !u; y++) for (let x = 3; x < MAP_N - 3; x++) if (heightAt(w.terrain, x, y) > 0 && level(x, y)) { u = x; v = y; break; }
  assert(u, 'found a level patch');
  eq(shapeLand(w, u, v, 1), { ok: true, cost: 1 }, 'one corner');
  eq(w.tribes[PLAYER].manna, 9);
  const big = reshape(w.terrain, u, v, 1);
  assert(big.ok && costOf(big) === 9, `the next step moves 9 corners (${big.changed && big.changed.length})`);
  const before = Array.from(w.terrain.h);
  eq(shapeLand(w, u, v, 1), { ok: true, cost: 9 });
  eq(w.tribes[PLAYER].manna, 0);
  eq(shapeLand(w, u, v, 1), { ok: false, reason: 'no-manna' });
  assert(Array.from(w.terrain.h).join() !== before.join(), 'the paid-for change happened');
  eq(w.message, 'NOT ENOUGH MANNA');
});

check('view: the mouse picks the corner it is over, and a hill hides the land behind it', () => {
  const t = makeTerrain(20), cam = { u: 0, v: 0 };
  for (const [u, v] of [[5, 5], [6, 7], [3, 9]]) {
    const [x, y] = cornerPoint(t, cam, u, v);
    eq(pickCorner(t, cam, x + 0.5, y + 1), { u, v }, `corner (${u}, ${v})`);
  }
  let hill = t;
  for (let i = 0; i < 4; i++) hill = reshape(hill, 8, 8, 1).terrain;
  const behind = cornerPoint(t, cam, 6, 6); // on flat land this is (6, 6); now the hill's front is drawn over it
  const got = pickCorner(hill, cam, behind[0], behind[1] + 1);
  assert(got && got.u + got.v > 12, `picked the hill in front, not the hidden corner (got ${JSON.stringify(got)})`);
  eq(pickCorner(t, cam, 2, 2), null, 'off the land view');
});

check('view: the map book maps tiles to pixels and back', () => {
  for (const [u, v] of [[0, 0], [10, 3], [63, 63], [5, 60]]) {
    const [x, y] = bookPoint(u + 0.5, v + 0.5);
    eq(bookTile(Math.floor(x), Math.floor(y)), { u, v }, `tile (${u}, ${v})`);
  }
  eq(bookTile(BOOK_X, BOOK_Y), null, 'outside the diamond');
});

check('screen: a triangle fills only its own pixels, and two halves of a square leave no gap', () => {
  const s = makeScreen(20, 20);
  fillTri(s, [2, 2], [12, 2], [2, 12], 5);
  fillTri(s, [12, 2], [12, 12], [2, 12], 6);
  let gaps = 0;
  for (let y = 2; y < 12; y++) for (let x = 2; x < 12; x++) if (s.px[y * 20 + x] === 0) gaps++;
  eq(gaps, 0, 'no gaps');
  eq([s.px[0], s.px[13 * 20 + 13]], [0, 0], 'nothing outside');
});

check('land: raising buries what stands round the corner; lowering digs down, leaving stone but not trees or rubble', () => {
  const t = flatLand(16, 3), at = (u, v) => v * t.n + u;
  // the four tiles round corner (8, 8): (7,7) (8,7) (7,8) (8,8)
  const dress = (x) => { x.f[at(7, 7)] = FEATURE.rock; x.f[at(8, 7)] = FEATURE.mine; x.f[at(7, 8)] = FEATURE.tree; x.f[at(8, 8)] = FEATURE.ruin; };
  dress(t);
  const up = reshape(t, 8, 8, 1).terrain;
  eq([up.f[at(7, 7)], up.f[at(8, 7)], up.f[at(7, 8)], up.f[at(8, 8)]], [0, 0, 0, 0], 'raising buries all four');
  const down = reshape(t, 8, 8, -1).terrain;
  eq([down.f[at(7, 7)], down.f[at(8, 7)], down.f[at(7, 8)], down.f[at(8, 8)]], [FEATURE.rock, FEATURE.mine, 0, 0], 'digging keeps the boulder and the mine');
  const shore = flatLand(16, 1);
  shore.f[at(7, 7)] = FEATURE.rock;
  let sunk = shore;
  for (const [u, v] of [[7, 7], [8, 7], [8, 8], [7, 8]]) sunk = reshape(sunk, u, v, -1).terrain;
  eq([isWater(sunk, 7, 7), sunk.f[at(7, 7)]], [true, 0], 'dug right down into the sea: washed away');
  checkTerrain(sunk);
});
