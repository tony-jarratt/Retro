'use strict';

// The campaign: every land makes a sound map with the islands apart, the right starting villages, and only its powers.

check('lands: each makes two islands with the sea between, a village for you and the dark god\'s villages', () => {
  LANDS.forEach((L, i) => {
    const w = makeWorld(L.seed, { land: i });
    checkTerrain(w.terrain);
    eq([w.houses.filter((h) => h.tribe === PLAYER).length, w.houses.filter((h) => h.tribe === RIVAL).length], [1, L.rivalHomes], L.name);
    const pair = nearestPair(w, RIVAL);
    eq(landPath(w.terrain, pair[0], pair[1]), false, `${L.name}: the islands start apart`);
    eq(w.rules, L.rules, `${L.name}: its own rules`);
  });
});

check('lands: a power not yet earned is refused for both gods; the stone is always there', () => {
  const w = makeWorld(LANDS[0].seed, { land: 0 });
  w.tribes[PLAYER].manna = w.tribes[RIVAL].manna = 999;
  eq(castPower(w, PLAYER, 'quake', 20, 20), { ok: false, reason: 'locked' });
  eq(castPower(w, RIVAL, 'swamp', 44, 44), { ok: false, reason: 'locked' });
  const home = w.houses.find((h) => h.tribe === PLAYER);
  eq(castPower(w, PLAYER, 'stone', home.u + 2, home.v).ok || castPower(w, PLAYER, 'stone', home.u - 2, home.v).ok, true, 'a stone');
  const w3 = makeWorld(LANDS[2].seed, { land: 2 });
  eq([...w3.powers].sort(), ['quake', 'stone', 'swamp']);
});

check('lands: in the first land the rich dark god casts nothing; in the second only swamps', () => {
  for (const [i, allowed] of [[0, []], [1, ['swamp']]]) {
    const w = makeWorld(LANDS[i].seed, { land: i, ai: [false, false] });
    w.tick = LANDS[i].rules.grace;
    for (let k = 0; k < 5; k++) { w.tribes[RIVAL].manna = 999; w.tribes[RIVAL].lastPower = -1e9; aiPower(w, RIVAL); }
    const cast = [...new Set(w.events.filter((e) => ['swamp', 'quake', 'volcano', 'flood'].includes(e.type)).map((e) => e.type))];
    eq(cast.filter((c) => !allowed.includes(c)), [], `${LANDS[i].name} cast only what it may`);
  }
});
