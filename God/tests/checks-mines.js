'use strict';

// Mines and weapons: houses dig mines in their own boulders, mines arm a tribe, arms tip fights.

function rockAt(w, u, v) { w.terrain.f[v * w.terrain.n + u] = FEATURE.rock; }

check('mines: a hut with a boulder in its patch digs one mine in it; a tent does not', () => {
  const w = emptyWorld();
  rockAt(w, 11, 11); rockAt(w, 9, 9);
  const h = addHouse(w, PLAYER, 10, 10, 2);
  eq(h.level >= MINE_LEVEL, true);
  stepMines(w);
  const dug = [featureAt(w.terrain, 9, 9), featureAt(w.terrain, 11, 11)].filter((f) => f === FEATURE.mine).length;
  eq(dug, 1, 'one mine a house');
  eq([w.tribes[PLAYER].mines, w.tribes[PLAYER].weapons], [1, 1]);
  assert(w.events.some((e) => e.type === 'mine') && w.events.some((e) => e.type === 'armed'), 'mine and armed events');
  const w2 = emptyWorld();
  for (const [u, v] of [[9, 9], [10, 9], [11, 9], [12, 9], [9, 10], [12, 10], [9, 11], [12, 11], [9, 12], [10, 12], [11, 12], [12, 12]]) bump(w2, u, v);
  rockAt(w2, 13, 13);
  const tent = addHouse(w2, PLAYER, 10, 10, 1);
  eq(tent.level, 1);
  stepMines(w2);
  eq(featureAt(w2.terrain, 13, 13), FEATURE.rock, 'a tent does not dig');
});

check('mines: a boulder nearer another house is not yours to dig', () => {
  const w = emptyWorld();
  rockAt(w, 12, 10);
  const a = addHouse(w, PLAYER, 10, 10, 2), b = addHouse(w, RIVAL, 13, 10, 2);
  stepMines(w);
  eq(featureAt(w.terrain, 12, 10), FEATURE.mine);
  eq([w.tribes[PLAYER].mines, w.tribes[RIVAL].mines], [0, 1], 'it is b\'s');
  void a; void b;
});

check('mines: the more mines, the better the weapons; a mine with no house near does not count', () => {
  const w = emptyWorld(2, 40);
  for (let i = 0; i < 6; i++) { rockAt(w, 5 + i * 5, 6); addHouse(w, PLAYER, 5 + i * 5, 5, 2); }
  stepMines(w);
  eq([w.tribes[PLAYER].mines, WEAPONS[w.tribes[PLAYER].weapons]], [6, 'STEEL']);
  w.houses.splice(0, 3);
  stepMines(w);
  eq([w.tribes[PLAYER].mines, WEAPONS[w.tribes[PLAYER].weapons]], [3, 'IRON'], 'abandoned mines stop counting');
});

check('mines: moving the land under a mine fills it in', () => {
  const w = emptyWorld();
  w.tribes[PLAYER].manna = 10;
  rockAt(w, 12, 12);
  addHouse(w, PLAYER, 10, 10, 2);
  stepMines(w);
  eq(featureAt(w.terrain, 12, 12), FEATURE.mine);
  shapeLand(w, 13, 13, 1);
  eq(featureAt(w.terrain, 12, 12), FEATURE.none);
});

check('mines: weapons tip the odds and the losses in a fight', () => {
  const w = emptyWorld();
  w.rng = fakeRng([0.55]);
  eq(fight(w, 10, 10, 1, 1), { aWins: false, left: 5 }, 'even: 0.55 is over the 1/2 needed');
  w.rng = fakeRng([0.55]);
  eq(fight(w, 10, 10, 2, 1), { aWins: true, left: 8 }, 'steel against clubs: a wins below 2/3, and loses 10 / (2 x 2)');
  w.tribes[PLAYER].weapons = 3;
  w.rng = fakeRng([0.5]);
  const a = addWalker(w, PLAYER, 8.5, 8.5, 6), b = addWalker(w, RIVAL, 8.6, 8.5, 9);
  walkerFights(w);
  eq(w.walkers.map((x) => [x.tribe, x.strength]), [[PLAYER, 4]], '6 x 2 = 12 against 9: wins below 12/21, keeps 6 - floor(9/4)');
  void a; void b;
});
