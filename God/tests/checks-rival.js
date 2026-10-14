'use strict';

// The rival: fights, attacks on houses, the dark god's land-shaping, its bridge across the sea and ley line, the end.

// A random source that returns the values it is given (for rng.next()), and complains if it runs out.
function fakeRng(values) {
  const left = values.slice();
  return {
    next() { if (!left.length) throw new Error('fakeRng: out of values'); return left.shift(); },
    shuffle(list) { return list.slice(); },
  };
}

check('rival: when two rival walkers meet, the stronger usually wins, and the winner is worn down', () => {
  for (const [roll, winner, left] of [[0.5, PLAYER, 6], [0.8, RIVAL, 1]]) {
    const w = emptyWorld();
    w.rng = fakeRng([roll]);
    const a = addWalker(w, PLAYER, 8.5, 8.5, 8), b = addWalker(w, RIVAL, 8.6, 8.5, 5);
    a.age = b.age = 0;
    walkerFights(w);
    eq(w.walkers.length, 1);
    eq([w.walkers[0].tribe, w.walkers[0].strength], [winner, left], `roll ${roll} (player wins below 8/13)`);
    void a; void b;
  }
});

check('rival: a walker that beats a rival house razes it and walks on; one that loses is gone and weakens it', () => {
  const w = emptyWorld();
  const h = addHouse(w, RIVAL, 10, 10, 6);
  w.rng = fakeRng([0.1]);
  const a = addWalker(w, PLAYER, 10.5, 10.5, 12);
  eq(attackHouse(w, a, h), true);
  eq([w.houses.length, a.strength], [0, 12 - 3]);
  const h2 = addHouse(w, RIVAL, 14, 14, 20);
  w.rng = fakeRng([0.9]);
  const b = addWalker(w, PLAYER, 14.5, 14.5, 4);
  eq(attackHouse(w, b, h2), false);
  eq([w.walkers.includes(b), h2.pop], [false, 18]);
});

check('rival: a walker senses the other tribe nearby, and heads for it', () => {
  const w = emptyWorld();
  addHouse(w, RIVAL, 12, 12, 5);
  const a = addWalker(w, PLAYER, 8.5, 8.5, 3);
  eq(nearestFoe(w, a), { u: 12, v: 12 });
  const far = addWalker(w, PLAYER, 2.5, 20.5, 3);
  eq(nearestFoe(w, far), null, 'too far to sense');
});

check('rival: the dark god only makes moves it can pay for, and gains flat ground by them', () => {
  const w = makeWorld(SEED, { ai: [false, false] });
  const own = () => w.houses.filter((h) => h.tribe === RIVAL).reduce((n, h) => n + flatScore(w, h), 0);
  let moves = 0;
  for (let i = 0; i < 200; i++) {
    const before = own(), r = aiThink(w, RIVAL);
    if (r && !r.bridge && !r.power && !r.stone) { moves++; assert(own() > before, `move ${moves} gained ground (${before} -> ${own()})`); }
    checkTerrain(w.terrain); checkWorld(w);
    for (let k = 0; k < AI_THINK_TICKS; k++) stepWorld(w);
  }
  assert(moves > 0, 'it did something');
});

check('rival: with manna to spare after the grace period, the dark god bridges to your land and lays its ley line to you', () => {
  const w = makeWorld(SEED, { ai: [false, false] });
  const pair = nearestPair(w, RIVAL);
  eq(landPath(w.terrain, pair[0], pair[1]), false, 'apart to begin with');
  w.tick = AI_GRACE_TICKS;
  for (let i = 0; i < 200 && !w.tribes[RIVAL].joined; i++) { w.tribes[RIVAL].manna = 500; aiThink(w, RIVAL); }
  eq(w.tribes[RIVAL].joined, true, 'the land joins');
  for (let i = 0; i < 5; i++) { w.tribes[RIVAL].manna = 500; aiThink(w, RIVAL); }
  const line = w.stones[RIVAL], end = line[line.length - 1];
  assert(line.length >= 2, `a ley line: hearth and more (${line.length} stones)`);
  assert(w.houses.some((h) => h.tribe === PLAYER && gap(h, end) <= SCENT), 'its end stone is by your houses');
  checkTerrain(w.terrain);
});

check('rival: a tribe with no houses and no walkers loses the game', () => {
  const w = makeWorld(SEED, { ai: [false, false] });
  w.houses = w.houses.filter((h) => h.tribe !== RIVAL);
  w.walkers = w.walkers.filter((x) => x.tribe !== RIVAL);
  stepWorld(w);
  eq(w.over, { winner: PLAYER });
  assert(w.events.some((e) => e.type === 'win'), 'a win event');
  const tick = w.tick;
  stepWorld(w);
  eq(w.tick, tick + 1, 'the clock moves');
  eq(w.over, { winner: PLAYER }, 'and nothing else happens');
});

check('rival: two dark gods left to fight it out for 15 minutes keep the rules (balance report)', () => {
  for (const seed of [SEED, 7, 42]) {
    const w = makeWorld(seed, { ai: [true, true] });
    let minute = 0;
    for (; minute < 15 && !w.over; minute++) for (let i = 0; i < 1200; i++) stepWorld(w);
    const report = [PLAYER, RIVAL].map((t) => `${t === PLAYER ? 'good' : 'evil'} ${w.houses.filter((h) => h.tribe === t).length} houses ${population(w, t)} people ${Math.floor(w.tribes[t].manna)} manna`);
    print(`     seed ${seed}: after ${minute} min ${w.over ? `winner ${w.over.winner === PLAYER ? 'good' : 'evil'}` : 'no winner'}: ${report.join(', ')}`);
  }
});
