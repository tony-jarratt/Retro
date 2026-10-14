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
  raiseStone(w, PLAYER, 5, 5); raiseStone(w, RIVAL, 15, 15); raiseStone(w, PLAYER, 8, 8);
  toppleStonesAt(w, [{ u: 5, v: 5 }, { u: 15, v: 15 }]);
  eq([featureAt(w.terrain, 5, 5), featureAt(w.terrain, 15, 15)], [FEATURE.fallenHead, FEATURE.fallenArch]);
  lowerStone(w, PLAYER, 8, 8);
  eq(featureAt(w.terrain, 8, 8), FEATURE.none);
  eq(raiseStone(w, PLAYER, 5, 5), { ok: true }, 'a stone can be raised again where one fell');
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
