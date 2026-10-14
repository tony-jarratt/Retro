'use strict';

// The people: settling, house levels from flat ground, growth, manna, walkers leaving and moving in, weakening,
// drowning and broken houses.

// An empty world on a small map: flat land at height h with the sea round the edge.
function emptyWorld(h = 2, n = 24) {
  const w = makeWorld(SEED, { people: false, manna: 0 });
  w.terrain = flatLand(n, h);
  return w;
}
// Raise one corner of a tile (so the tile is no longer flat).
function bump(w, u, v) { w.terrain = reshape(w.terrain, u, v, 1).terrain; }

check('people: a house with a 5 x 5 of flat ground to itself is a castle; hemmed in by hills it is a tent', () => {
  const w = emptyWorld();
  const castle = addHouse(w, PLAYER, 10, 10, 1);
  eq([flatScore(w, castle), castle.level], [25, 5]);
  const w2 = emptyWorld();
  for (const [u, v] of [[9, 9], [10, 9], [11, 9], [12, 9], [9, 10], [12, 10], [9, 11], [12, 11], [9, 12], [10, 12], [11, 12], [12, 12]]) bump(w2, u, v);
  checkTerrain(w2.terrain);
  const tent = addHouse(w2, PLAYER, 10, 10, 1);
  eq([flatScore(w2, tent), tent.level], [1, 1], 'only its own tile is flat');
});

check('people: two houses share the ground between them by nearness, the older one winning ties', () => {
  const w = emptyWorld();
  const a = addHouse(w, PLAYER, 8, 10, 1), b = addHouse(w, PLAYER, 11, 10, 1);
  // a's 5 x 5 is columns 6..10, b's is 9..13. Column 9 is nearer a; column 10 is nearer b except at its two ends,
  // which are 2 steps from both (counting diagonal steps) and so go to the older house, a.
  eq([flatScore(w, a), flatScore(w, b)], [22, 18]);
  const c = addHouse(w, PLAYER, 14, 10, 1);
  eq([flatScore(w, a), flatScore(w, b), flatScore(w, c)], [22, 15, 18], 'b loses most of column 13 to c');
});

check('people: a walker settles on flat ground with room, and not on a slope or next to a house', () => {
  const w = emptyWorld();
  bump(w, 6, 6);
  for (const [u, v, ok] of [[5, 5, false], [10, 10, true]]) eq(canSettle(w, u, v), ok, `(${u}, ${v})`);
  addHouse(w, PLAYER, 10, 10, 1);
  eq([canSettle(w, 12, 10), canSettle(w, 13, 10)], [false, true], 'HOUSE_GAP');
  const walker = addWalker(w, PLAYER, 15.5, 15.5, 3);
  stepWorld(w);
  eq(w.walkers.length, 0, 'settled where it stood');
  const h = houseAt(w, 15, 15);
  assert(h && Math.floor(h.pop) === 3 && h.tribe === PLAYER, `a house of 3 at (15, 15): ${JSON.stringify(h)}`);
  eq(w.events.map((e) => e.type), ['settle']);
  void walker;
});

check('people: a walker too big for its new house leaves the rest walking', () => {
  const w = emptyWorld();
  addHouse(w, PLAYER, 10, 10, 1); addHouse(w, PLAYER, 10, 16, 1); addHouse(w, PLAYER, 16, 13, 1);
  addWalker(w, PLAYER, 13.5, 13.5, 30);
  stepWorld(w);
  const h = houseAt(w, 13, 13);
  assert(h, 'settled');
  // the rest walk on (and the house, full at once, sends half of its own out too)
  assert(w.walkers.length >= 1, 'some walk on');
  eq(w.walkers.reduce((n, x) => n + x.strength, 0) + Math.floor(h.pop), 30, 'nobody lost');
  assert(h.pop <= CAP[h.level - 1], 'the house is not over its cap');
});

check('people: a house fills at its level\'s rate, earns manna, and when full sends half out', () => {
  const w = emptyWorld();
  const h = addHouse(w, PLAYER, 10, 10, 1);
  for (let i = 0; i < 20; i++) stepWorld(w); // one second
  assert(Math.abs(h.pop - (1 + GROWTH[4])) < 1e-9, `grew by GROWTH[castle]: ${h.pop}`);
  assert(Math.abs(w.tribes[PLAYER].manna - MANNA[4]) < 1e-9, `earned MANNA[castle]: ${w.tribes[PLAYER].manna}`);
  h.pop = CAP[4] - 0.01;
  stepWorld(w);
  eq(w.walkers.length, 1, 'a walker set out');
  eq(w.walkers[0].strength, CAP[4] / 2);
  eq(w.walkers[0].left, h.id);
});

check('people: a walker moves into one of its houses with room, but not the one it just left', () => {
  const w = emptyWorld();
  const a = addHouse(w, PLAYER, 10, 10, 2), b = addHouse(w, PLAYER, 14, 10, 2);
  const walker = addWalker(w, PLAYER, 10.5, 10.5, 3, a.id);
  stepWorld(w);
  eq([a.pop > 2 && a.pop < 3, w.walkers.length], [true, 1], 'did not go back into the house it left');
  walker.x = 14.5; walker.y = 10.5; walker.tu = 14; walker.tv = 10;
  stepWorld(w);
  eq(w.walkers.length, 0, 'moved into the other one');
  assert(b.pop >= 5, `b took them in: ${b.pop}`);
});

check('people: a walker with nowhere to live loses a tenth of its people every so often, and is gone in the end', () => {
  const w = emptyWorld();
  const walker = addWalker(w, PLAYER, 2.5, 2.5, 20);
  walker.tu = 3; walker.age = WEAKEN_S - DT / 2; // on its way to the next tile, about to tire
  stepWorld(w);
  eq(walker.strength, 18);
  walker.strength = 1; walker.age = WEAKEN_S - DT / 2;
  stepWorld(w);
  eq(w.walkers.length, 0);
  assert(w.events.some((e) => e.type === 'perish'), 'a perish event');
});

check('people: lowering the land into the sea drowns walkers; a house on broken ground lets its people out', () => {
  const w = emptyWorld(1);
  w.tribes[PLAYER].manna = 100;
  addWalker(w, PLAYER, 5.5, 5.5, 4);
  const h = addHouse(w, PLAYER, 12, 12, 6);
  for (const [u, v] of [[5, 5], [6, 5], [6, 6], [5, 6]]) shapeLand(w, u, v, -1);
  eq(w.walkers.length, 0, 'drowned');
  assert(w.events.some((e) => e.type === 'drown' && e.lost === 4), 'a drown event');
  shapeLand(w, 13, 13, 1);
  eq(w.houses.includes(h), false, 'the house is gone');
  eq(w.walkers.length, 1);
  eq(w.walkers[0].strength, Math.floor(h.pop), 'its people walk out');
});

check('people: left alone for ten minutes a tribe settles its island and stays sound', () => {
  const w = makeWorld(SEED, { ai: [false, false] });
  for (let i = 0; i < 10 * 60 * 20; i++) stepWorld(w);
  const houses = w.houses.filter((h) => h.tribe === PLAYER).length;
  assert(houses >= 3, `it spread (${houses} houses); trees and rocks leave less room than bare land`);
  assert(w.houses.some((h) => h.level >= 3), 'something better than a hut');
  assert(population(w, PLAYER) < 1000, `it did not run away (${population(w, PLAYER)} people)`);
});

check('sheep: a flock grazes on dry land for ten minutes, and the sea takes any whose pasture sinks', () => {
  const w = makeWorld(SEED, { ai: [false, false], reach: false });
  assert(w.sheep.length >= 10, `a flock on each island (${w.sheep.length})`);
  for (let i = 0; i < 10 * 60 * 20; i++) {
    stepWorld(w);
    for (const sh of w.sheep) assert(!isWater(w.terrain, Math.floor(sh.x), Math.floor(sh.y)), `sheep ${sh.id} is in the sea at tick ${w.tick}`);
  }
  assert(w.sheep.length >= 8 && w.sheep.length <= SHEEP_MAX, `still a flock (${w.sheep.length})`);
  const sh = w.sheep[0], u = Math.floor(sh.x), v = Math.floor(sh.y);
  sh.graze = 1000; // standing still
  w.tribes[PLAYER].manna = 999;
  for (let k = 0; k < MAX_H && !isWater(w.terrain, u, v); k++) for (const [a, b] of [[u, v], [u + 1, v], [u + 1, v + 1], [u, v + 1]]) shapeLand(w, a, b, -1);
  stepWorld(w);
  eq(w.sheep.includes(sh), false, 'drowned');
  assert(w.events.some((e) => e.type === 'baa' && e.drowned), 'with a last bleat');
});
