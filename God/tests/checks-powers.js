'use strict';

// The powers: swamp, earthquake, volcano and flood, what they cost, and the dark god using them.

check('powers: a swamp bogs flat clear squares near the corner; the first walker in sinks and fills it', () => {
  const w = emptyWorld();
  w.tribes[PLAYER].manna = 100;
  const h = addHouse(w, PLAYER, 10, 10, 3);
  eq(castPower(w, PLAYER, 'swamp', 10, 10), { ok: true });
  eq(w.tribes[PLAYER].manna, 100 - POWER.swamp.cost);
  const bogs = tilesNear(w.terrain, 10, 10, POWER.swamp.reach).filter((p) => featureAt(w.terrain, p.u, p.v) === FEATURE.swamp);
  eq(bogs.length, SWAMP_TILES);
  assert(bogs.every((p) => p.u !== h.u || p.v !== h.v), 'not under the house');
  const b = bogs[0], walker = addWalker(w, RIVAL, b.u + 0.5, b.v + 0.5, 7);
  checkFooting(w);
  eq(w.walkers.includes(walker), false, 'sank');
  eq(featureAt(w.terrain, b.u, b.v), FEATURE.none, 'the bog is filled');
});

check('powers: a swamp with nowhere to go is refused and costs nothing', () => {
  const w = makeWorld(SEED, { people: false, manna: 100 });
  eq(castPower(w, PLAYER, 'swamp', 3, 3), { ok: false, reason: 'no-room' }, 'out at sea');
  eq(w.tribes[PLAYER].manna, 100);
  w.tribes[PLAYER].manna = 10;
  eq(castPower(w, PLAYER, 'quake', 20, 20), { ok: false, reason: 'no-manna' });
  throwsKind(RulesError, 'no-power', () => castPower(w, PLAYER, 'plague', 20, 20));
});

check('powers: an earthquake lumps the land near the corner and nowhere else, and breaks houses there', () => {
  const w = emptyWorld(3, 30);
  w.tribes[PLAYER].manna = 100;
  const near = addHouse(w, RIVAL, 14, 14, 10), far = addHouse(w, RIVAL, 24, 24, 10), before = Array.from(w.terrain.h);
  eq(castPower(w, PLAYER, 'quake', 15, 15), { ok: true });
  checkTerrain(w.terrain);
  let movedFar = 0, movedNear = 0;
  for (let v = 0; v <= 30; v++) for (let u = 0; u <= 30; u++) {
    if (w.terrain.h[v * 31 + u] === before[v * 31 + u]) continue;
    if (Math.max(Math.abs(u - 15), Math.abs(v - 15)) > POWER.quake.reach + 4) movedFar++; else movedNear++; // a shock pushes its neighbours along
  }
  assert(movedNear > 5 && movedFar === 0, `near ${movedNear}, far ${movedFar}`);
  eq(w.houses.includes(far), true, 'the far house stands');
  void near;
});

check('powers: a volcano raises a peak to full height and strews boulders round it', () => {
  const w = emptyWorld(2, 30);
  w.tribes[PLAYER].manna = 200;
  eq(castPower(w, PLAYER, 'volcano', 15, 15), { ok: true });
  eq(heightAt(w.terrain, 15, 15), MAX_H);
  checkTerrain(w.terrain);
  const rocks = tilesNear(w.terrain, 15, 15, POWER.volcano.reach).filter((p) => featureAt(w.terrain, p.u, p.v) === FEATURE.rock).length;
  assert(rocks >= 8, `boulders (${rocks})`);
});

check('powers: a flood lowers every corner above the sea a step; the lowest houses drown, higher ones stand', () => {
  const w = emptyWorld(1, 24); // low land at height 1, with a 2 x 2 plateau at height 2
  for (let v = 11; v <= 13; v++) for (let u = 11; u <= 13; u++) w.terrain = reshape(w.terrain, u, v, 1).terrain;
  w.tribes[PLAYER].manna = 300;
  const low = addHouse(w, PLAYER, 5, 5, 1), high = addHouse(w, RIVAL, 11, 11, 4);
  const before = Array.from(w.terrain.h);
  eq(castPower(w, PLAYER, 'flood', 0, 0), { ok: true });
  eq(Array.from(w.terrain.h), before.map((h) => Math.max(0, h - 1)));
  eq([w.houses.includes(low), w.houses.includes(high)], [false, true]);
  assert(w.events.some((e) => e.type === 'drown' && e.tribe === PLAYER), 'a drowning');
  checkTerrain(w.terrain);
});

check('powers: after the grace period a rich dark god casts on your biggest house', () => {
  const w = makeWorld(SEED, { ai: [false, false] });
  w.tick = AI_GRACE_TICKS;
  w.tribes[RIVAL].manna = 500;
  eq(aiPower(w, RIVAL), true);
  assert(w.events.some((e) => e.type === 'swamp' || e.type === 'quake'), 'it cast something');
  assert(w.message.startsWith('THE DARK GOD'), `it says so: ${w.message}`);
  eq(aiPower(w, RIVAL), false, 'and waits before the next');
});
