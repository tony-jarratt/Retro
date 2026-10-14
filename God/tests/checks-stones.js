'use strict';

// Ley stones: raising them in order, gathering at the hearth, pilgrims walking the line, what happens at its end,
// the sea in the way, and stones toppling.

function stoneWorld(h = 2, n = 24) { const w = emptyWorld(h, n); w.tribes[PLAYER].manna = 500; w.tribes[RIVAL].manna = 500; return w; }
function run(w, ticks, until = () => false) { for (let i = 0; i < ticks && !until(); i++) stepWorld(w); }

check('stones: raised in order at a cost, at most six, never in the sea or on another stone', () => {
  const w = stoneWorld();
  eq(castPower(w, PLAYER, 'stone', 5, 5), { ok: true });
  eq(w.tribes[PLAYER].manna, 500 - STONE_COST);
  eq(castPower(w, PLAYER, 'stone', 5, 5), { ok: false, reason: 'taken' });
  for (let i = 1; i < MAX_STONES; i++) eq(castPower(w, PLAYER, 'stone', 5 + i, 8), { ok: true });
  eq(castPower(w, PLAYER, 'stone', 3, 15), { ok: false, reason: 'too-many' });
  eq(w.stones[PLAYER].map((s) => [s.u, s.v]).slice(0, 3), [[5, 5], [6, 8], [7, 8]], 'the line is the order raised');
  eq(castPower(makeWorld(SEED, { people: false, manna: 99 }), PLAYER, 'stone', 2, 2), { ok: false, reason: 'sea' });
  eq(lowerStone(w, RIVAL, 5, 5), { ok: false, reason: 'not-yours' });
  eq(lowerStone(w, PLAYER, 6, 8), { ok: true });
  eq(w.stones[PLAYER].length, MAX_STONES - 1, 'a waystone taken down: the rest stand');
  eq(lowerStone(w, PLAYER, 5, 5), { ok: true });
  eq(w.stones[PLAYER].length, 0, 'the hearth taken down: the whole line comes down');
});

check('stones: walkers near the hearth gather into one band there, and neither settle nor weaken while they wait', () => {
  const w = stoneWorld();
  raiseStone(w, PLAYER, 12, 12);
  addWalker(w, PLAYER, 9.5, 9.5, 3); addWalker(w, PLAYER, 15.5, 10.5, 4); addWalker(w, PLAYER, 2.5, 20.5, 2); // the last is too far
  run(w, 400);
  const gathered = w.walkers.filter((x) => x.gathered);
  eq(gathered.map((x) => [x.strength, Math.floor(x.x), Math.floor(x.y)]), [[7, 12, 12]]);
  eq(w.houses.filter((h) => gap(h, { u: 12, v: 12 }) <= GATHER_RADIUS).length, 0, 'nobody settled near the hearth');
  assert(w.houses.length === 1, 'the far walker settled, as usual');
  run(w, 600);
  eq(gathered[0].strength, 7, 'no wear while gathered');
});

check('stones: a full gathering sets off and walks the line in order; at an empty end it settles', () => {
  const w = stoneWorld(2, 30);
  raiseStone(w, PLAYER, 5, 5); raiseStone(w, PLAYER, 15, 5); raiseStone(w, PLAYER, 15, 20);
  const band = addWalker(w, PLAYER, 5.5, 5.5, PILGRIM_MASS);
  band.gathered = true;
  stepWorld(w);
  assert(band.pilgrim === 1 && w.events.some((e) => e.type === 'pilgrims'), 'it set off for the second stone');
  run(w, 4000, () => band.arrived);
  eq(band.arrived, true, 'it reached the end');
  run(w, 400);
  assert(w.houses.some((h) => h.tribe === PLAYER && gap(h, { u: 15, v: 20 }) <= 3), 'a new village by the end stone');
});

check('stones: pilgrims pass the waystone before the end stone', () => {
  const w = stoneWorld(2, 30);
  raiseStone(w, PLAYER, 5, 5); raiseStone(w, PLAYER, 22, 5); raiseStone(w, PLAYER, 5, 22); // a dogleg: way off to the east
  const band = addWalker(w, PLAYER, 5.5, 5.5, PILGRIM_MASS);
  band.gathered = true;
  let nearWay = false;
  run(w, 4000, () => { if (gap(w.stones[PLAYER][1], { u: band.tu, v: band.tv }) <= 1) nearWay = true; return band.arrived; });
  eq([nearWay, band.arrived], [true, true]);
});

check('stones: at an end stone among the enemy, the band fights', () => {
  const w = stoneWorld(2, 30);
  raiseStone(w, PLAYER, 5, 5); raiseStone(w, PLAYER, 20, 20);
  addHouse(w, RIVAL, 23, 21, 4);
  const band = addWalker(w, PLAYER, 5.5, 5.5, 40);
  band.gathered = true;
  run(w, 4000, () => w.events.some((e) => e.type === 'razed' || e.type === 'repelled'));
  assert(w.events.some((e) => e.type === 'razed' || e.type === 'repelled'), 'it attacked the house');
});

check('stones: pilgrims wait at the shore until the god joins the land', () => {
  const w = stoneWorld(1, 30);
  for (let v = 1; v < 30; v++) for (const u of [14, 15]) w.terrain = reshape(w.terrain, u, v, -1).terrain; // a channel down the middle
  assert(isWater(w.terrain, 14, 10), 'a channel');
  raiseStone(w, PLAYER, 5, 10); raiseStone(w, PLAYER, 24, 10);
  const band = addWalker(w, PLAYER, 5.5, 10.5, PILGRIM_MASS);
  band.gathered = true;
  run(w, 1500);
  assert(w.walkers.includes(band) && band.x < 14 && band.pilgrim, `waiting on the near side (x ${band.x.toFixed(1)})`);
  for (let v = 9; v <= 11; v++) for (const u of [14, 15]) w.terrain = reshape(w.terrain, u, v, 1).terrain; // a causeway
  run(w, 2000, () => band.arrived);
  eq(band.arrived, true, 'crossed and arrived');
});

check('stones: the enemy reaching a stone, or a quake over it, topples it; the line closes up', () => {
  const w = stoneWorld(2, 30);
  raiseStone(w, PLAYER, 5, 5); raiseStone(w, PLAYER, 10, 5); raiseStone(w, PLAYER, 20, 5);
  const band = addWalker(w, PLAYER, 5.5, 5.5, PILGRIM_MASS);
  band.pilgrim = 2; // on its way to the third stone
  addWalker(w, RIVAL, 10.5, 5.5, 1).gathered = true; // stands on our second stone
  stepStones(w);
  eq(w.stones[PLAYER].map((s) => s.u), [5, 20]);
  eq(band.pilgrim, 1, 'still heading for the same stone, now second in line');
  assert(w.events.some((e) => e.type === 'topple'), 'a topple event');
  castPower(w, RIVAL, 'quake', 20, 5);
  eq(w.stones[PLAYER].map((s) => s.u), [5], 'the quake toppled the end stone');
  eq(band.pilgrim, 0, 'the line ends before their stone: they are home');
});

check('stones: if the hearth falls the whole line falls with it: the gathering scatters, pilgrims are walkers again', () => {
  const w = stoneWorld();
  raiseStone(w, PLAYER, 8, 8); raiseStone(w, PLAYER, 16, 8); raiseStone(w, PLAYER, 16, 16);
  const g = addWalker(w, PLAYER, 8.5, 8.5, 9), p = addWalker(w, PLAYER, 12.5, 8.5, 20);
  g.gathered = true; p.pilgrim = 1;
  addWalker(w, RIVAL, 8.5, 8.5, 1);
  stepStones(w);
  eq([g.gathered, p.pilgrim, w.stones[PLAYER].length], [false, 0, 0]);
  eq([featureAt(w.terrain, 8, 8), featureAt(w.terrain, 16, 8), featureAt(w.terrain, 16, 16)], [FEATURE.fallenHead, FEATURE.fallenHead, FEATURE.fallenHead]);
  eq(raiseStone(w, PLAYER, 10, 10), { ok: true }, 'a new line can begin anywhere');
  eq(hearthOf(w, PLAYER), { id: w.stones[PLAYER][0].id, u: 10, v: 10 });
});
