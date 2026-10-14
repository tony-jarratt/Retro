'use strict';

// Ruins, fallen stones, the Call of the Stones, and stars for a win.

check('ruins: a razed house leaves rubble that nobody can build on until the land is reshaped', () => {
  const w = emptyWorld();
  const h = addHouse(w, RIVAL, 10, 10, 2);
  w.rng = fakeRng([0.01]);
  attackHouse(w, addWalker(w, PLAYER, 10.5, 10.5, 30), h);
  eq(featureAt(w.terrain, 10, 10), FEATURE.ruin);
  eq(canSettle(w, 10, 10), false);
  w.tribes[PLAYER].manna = 10;
  shapeLand(w, 11, 11, 1);
  eq(featureAt(w.terrain, 10, 10), FEATURE.none, 'cleared');
});

check('ruins: a toppled stone lies where it fell, a head or an arch; one taken down by its god leaves nothing', () => {
  const w = emptyWorld();
  raiseStone(w, PLAYER, 5, 5); raiseStone(w, PLAYER, 8, 8); raiseStone(w, PLAYER, 11, 11); raiseStone(w, RIVAL, 15, 15);
  toppleStonesAt(w, [{ u: 8, v: 8 }, { u: 15, v: 15 }]);
  eq([featureAt(w.terrain, 8, 8), featureAt(w.terrain, 15, 15)], [FEATURE.fallenHead, FEATURE.fallenArch]);
  lowerStone(w, PLAYER, 11, 11);
  eq(featureAt(w.terrain, 11, 11), FEATURE.none);
  eq(raiseStone(w, PLAYER, 8, 8), { ok: true }, 'a stone can be raised again where one fell');
});

check('the call: refused while the lands are apart; once joined it empties every house and ends in one battle', () => {
  const apart = makeWorld(SEED, { ai: [false, false] });
  apart.tribes[PLAYER].manna = 999;
  const home = apart.houses.find((h) => h.tribe === PLAYER);
  eq(castPower(apart, PLAYER, 'call', home.u, home.v), { ok: false, reason: 'apart' });
  const w = emptyWorld(2, 30);
  w.contest = true;
  w.tribes[PLAYER].manna = 999;
  addHouse(w, PLAYER, 5, 5, 20); addHouse(w, PLAYER, 9, 5, 20); addHouse(w, RIVAL, 24, 24, 10);
  eq(castPower(w, PLAYER, 'call', 15, 15), { ok: true });
  eq([w.houses.length, w.walkers.length, w.tribes[PLAYER].manna], [0, 3, 999 - CALL_COST]);
  w.tribes[PLAYER].manna = 999;
  eq(castPower(w, PLAYER, 'call', 15, 15), { ok: false, reason: 'called' });
  for (let i = 0; i < 4000 && !w.over; i++) stepWorld(w);
  assert(w.over, 'the last battle was fought');
  eq(w.houses.length, 0, 'nobody settled on the way');
});

check('the call: the dark god sounds it only when it is clearly the stronger, and only where it has the power', () => {
  const w = emptyWorld(2, 30);
  addHouse(w, PLAYER, 5, 5, 10); addHouse(w, RIVAL, 20, 20, 10);
  w.tribes[RIVAL].manna = 999;
  eq(aiCall(w, RIVAL), false, 'even: no call');
  w.houses[1].pop = 50;
  eq(aiCall(w, RIVAL), true, 'five times as strong: the call');
  const w5 = makeWorld(LANDS[3].seed, { land: 3 });
  eq(w5.powers.has('call'), false, 'not earned before the last land');
});

check('stars: three at par or better, two within half as long again, one for any win', () => {
  const par = PAR_MINUTES[0] * 60;
  eq([starsFor(0, par - 1), starsFor(0, par), starsFor(0, par * 1.5), starsFor(0, par * 1.5 + 1)], [3, 3, 2, 1]);
});

check('seasons: spring grows faster, summer parches the lowlands, autumn brings manna, winter snows in the high land', () => {
  const w = emptyWorld(1, 30);
  w.seasons = true;
  for (let v = 15; v <= 22; v++) for (let u = 15; u <= 22; u++) w.terrain = reshape(w.terrain, u, v, 1).terrain;
  for (let k = 0; k < 1; k++) for (let v = 16; v <= 21; v++) for (let u = 16; u <= 21; u++) w.terrain = reshape(w.terrain, u, v, 1).terrain;
  const low = addHouse(w, PLAYER, 5, 5, 1), high = addHouse(w, PLAYER, 18, 18, 1);
  eq([tileCorners(w.terrain, 5, 5)[0], tileCorners(w.terrain, 18, 18)[0]], [1, 3], 'a low house and a high one');
  const year = [];
  for (const name of ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER']) {
    w.tick = SEASONS.findIndex((x) => x.name === name) * SEASON_TICKS + 1;
    low.pop = high.pop = 1; w.tribes[PLAYER].manna = 0;
    stepHouses(w);
    year.push([name, +(low.pop - 1).toFixed(4), +(high.pop - 1).toFixed(4), w.tribes[PLAYER].manna]);
  }
  const g = (h) => GROWTH[h.level - 1] * DT;
  eq(year.map((y) => y[0]), ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER']);
  eq(year[0][1], +(g(low) * 1.5).toFixed(4), 'spring: half as fast again');
  eq(year[1][1], +(g(low) * 0.5).toFixed(4), 'summer: the low house parched');
  eq(year[1][2], +(g(high)).toFixed(4), 'summer: the high house as usual');
  eq(year[3][2], 0, 'winter: the high house snowed in');
  const m = (h) => MANNA[h.level - 1] * DT;
  assert(Math.abs(year[2][3] - 1.5 * (m(low) + m(high))) < 1e-9, `autumn: half as much manna again (${year[2][3]})`);
  assert(Math.abs(year[3][3] - m(low)) < 1e-9, `winter: only the low house earns (${year[3][3]})`);
});

check('seasons: they turn every SEASON_TICKS, starting in spring, and a sandbox has none', () => {
  const w = makeWorld(SEED, { ai: [false, false] });
  eq(seasonOf(w).name, 'SPRING');
  w.tick = SEASON_TICKS * 3 + 5;
  eq(seasonOf(w).name, 'WINTER');
  w.tick = SEASON_TICKS * 4;
  eq(seasonOf(w).name, 'SPRING', 'a year goes round');
  eq(seasonOf(emptyWorld()).name, 'NONE');
});

check('the call: nobody stops to gather at a hearth on the way to the last battle', () => {
  const w = emptyWorld(2, 30);
  w.contest = true;
  w.tribes[RIVAL].manna = 999;
  raiseStone(w, RIVAL, 20, 20); raiseStone(w, RIVAL, 22, 22);
  addHouse(w, PLAYER, 5, 5, 20); addHouse(w, RIVAL, 25, 25, 10);
  eq(castPower(w, RIVAL, 'call', 6, 6), { ok: true });
  const band = addWalker(w, RIVAL, 20.5, 20.5, 5); // standing on its own hearth
  for (let i = 0; i < 100; i++) stepWorld(w);
  eq(band.gathered, false);
});
