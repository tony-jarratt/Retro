'use strict';

// Checks for the fire phase, lock-on, damage and the end of a round. Loaded after checks.js.

function sjackal(weapons) { return jackal(weapons, 0); }

// ======================================================================
// the queries the UI asks
// ======================================================================
check('fire: eligibleWeapons skips destroyed, empty, shut down and dead', () => {
  const s = pair(sjackal([2, 5, 2]), [2, 2], S_DUMMY, [4, 2]);
  const m = s.mechs[0];
  eq(eligibleWeapons(s, 'P1'), [0, 1, 2]);
  m.destroyed.LA = true; // slot 1 (Hammer) is in the left arm
  eq(eligibleWeapons(s, 'P1'), [0, 2]);
  m.destroyed.LA = false;
  m.weapons[1].ammo = 0;
  eq(eligibleWeapons(s, 'P1'), [0, 2], 'out of ammo');
  m.weapons[1].ammo = 3;
  eq(eligibleWeapons(s, 'P1'), [0, 1, 2]);
  m.shutdown = true; eq(eligibleWeapons(s, 'P1'), [], 'shut down');
  m.shutdown = false; m.alive = false; eq(eligibleWeapons(s, 'P1'), [], 'dead');
  eq(eligibleWeapons(pair(S_DUMMY, [2, 2], S_DUMMY, [4, 2]), 'P1'), [], 'no weapons at all');
});

check('fire: validTargets is nearest first and leaves out what cannot be hit', () => {
  const s = makeState(openMap(14, 9), [
    tm('P1', 'player', S_BOLT, [0, 4]), tm('P2', 'player', S_DUMMY, [1, 4]),
    tm('E1', 'enemy', S_DUMMY, [4, 4]), tm('E2', 'enemy', S_DUMMY, [2, 4]), tm('E3', 'enemy', S_DUMMY, [13, 4]), tm('E4', 'enemy', S_DUMMY, [6, 4]),
  ]);
  eq(validTargets(s, 'P1', 0).map(t => t.targetId), ['E2', 'E1', 'E4'], 'E3 is out of range, P2 is a friend');
  s.mechs[5].alive = false;
  eq(validTargets(s, 'P1', 0).map(t => t.targetId), ['E2', 'E1']);
  // a tie on distance goes to the lower id (3,3 and 4,4 both touch 3,4)
  const t = makeState(openMap(14, 9), [tm('P1', 'player', S_BOLT, [3, 4]), tm('E2', 'enemy', S_DUMMY, [4, 4]), tm('E1', 'enemy', S_DUMMY, [3, 3])]);
  eq(validTargets(t, 'P1', 0).map(x => x.targetId), ['E1', 'E2']);
});

function lockState() {
  return makeState(openMap(14, 9), [
    tm('P1', 'player', sjackal([2, 6, 0]), [0, 4]),
    tm('E1', 'enemy', S_DUMMY, [2, 4]), tm('E2', 'enemy', S_DUMMY, [6, 4]),
  ]);
}

check('lock-on: first round defaults to the nearest valid enemy', () => {
  const s = lockState();
  eq(defaultTarget(s, 'P1', 0), { targetId: 'E1', reason: 'nearest', lockLost: null });
  eq(defaultTarget(s, 'P1', 1).targetId, 'E1');
});

check('lock-on: each weapon keeps its own lock, firing sets it, holding keeps it', () => {
  const s = lockState();
  // Bolt (slot 0) fires at E2 and misses (roll 5 against need 6); the Sting (slot 1) is held.
  resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E2' }], fakeRng([9], []));
  eq(s.mechs[0].locks, { 0: 'E2' });
  eq(defaultTarget(s, 'P1', 0), { targetId: 'E2', reason: 'locked', lockLost: null }, 'the Bolt follows E2');
  eq(defaultTarget(s, 'P1', 1).reason, 'nearest', 'the held Sting has no lock yet');
  // Next round the Sting fires at E2 and the Bolt is held: the Bolt keeps its lock.
  resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 1, targetId: 'E2' }], fakeRng([1], []));
  eq(s.mechs[0].locks, { 0: 'E2', 1: 'E2' }, 'holding keeps the lock');
  // A new pick replaces the lock.
  resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([1], []));
  eq(s.mechs[0].locks[0], 'E1');
  eq(s.mechs[0].locks[1], 'E2', 'the other weapon is not affected');
});

check('lock-on: a lock breaks with the right reason and falls back to the nearest', () => {
  let s = lockState();
  s.mechs[0].locks[0] = 'E2';
  s.mechs[2].alive = false;
  eq(defaultTarget(s, 'P1', 0), { targetId: 'E1', reason: 'lost-lock-nearest', lockLost: 'target-dead' });

  s = lockState();
  s.mechs[0].locks[0] = 'E2';
  s.mechs[2].pos = [13, 4];
  eq(defaultTarget(s, 'P1', 0), { targetId: 'E1', reason: 'lost-lock-nearest', lockLost: 'out-of-range' });

  s = lockState();
  s.mechs[0].locks[1] = 'E1'; // the Sting has a minimum range of 2; E1 is 2 away, so move the lock target in close
  s.mechs[1].pos = [1, 4];
  eq(defaultTarget(s, 'P1', 1), { targetId: 'E2', reason: 'lost-lock-nearest', lockLost: 'too-close' });

  s = lockState();
  s.mechs[0].locks[0] = 'E2';
  s.map.tiles[4] = '....T.........'; // woods at 4,4 between P1 and E2, E1 is in front of it
  eq(defaultTarget(s, 'P1', 0), { targetId: 'E1', reason: 'lost-lock-nearest', lockLost: 'no-line-of-sight' });
  s.mechs[1].pos = [8, 4]; // now E1 is behind the woods as well
  eq(defaultTarget(s, 'P1', 0), { targetId: null, reason: 'none', lockLost: 'no-line-of-sight' });

  s = lockState();
  s.mechs[1].alive = false; s.mechs[2].alive = false;
  eq(defaultTarget(s, 'P1', 0), { targetId: null, reason: 'none', lockLost: null });
});

check('lock-on: two weapons on one mech can follow different targets', () => {
  const s = lockState();
  s.mechs[0].locks = { 0: 'E1', 1: 'E2' };
  eq(defaultTarget(s, 'P1', 0).targetId, 'E1');
  eq(defaultTarget(s, 'P1', 1).targetId, 'E2');
});

// ======================================================================
// fire plans
// ======================================================================
check('fire plan: bad plans are rejected, and nothing changes when one is', () => {
  const s = makeState(openMap(14, 9), [
    tm('P1', 'player', sjackal([2, 5, 0]), [2, 2]), tm('P2', 'player', S_DUMMY, [3, 2]),
    tm('E1', 'enemy', S_DUMMY, [4, 2]), tm('E2', 'enemy', S_DUMMY, [13, 8]),
  ]);
  const shot = (mechId, weaponSlot, targetId) => ({ mechId, weaponSlot, targetId });
  throwsKind(PlanError, 'ineligible', () => validateFirePlan(s, [shot('P1', 2, 'E1')])); // empty slot
  throwsKind(PlanError, 'duplicate-weapon', () => validateFirePlan(s, [shot('P1', 0, 'E1'), shot('P1', 0, 'E1')]));
  throwsKind(PlanError, 'out-of-range', () => validateFirePlan(s, [shot('P1', 0, 'E2')]));
  throwsKind(PlanError, 'friendly', () => validateFirePlan(s, [shot('P1', 0, 'P2')]));
  throwsKind(PlanError, 'self', () => validateFirePlan(s, [shot('P1', 0, 'P1')]));
  throwsKind(RulesError, 'no-mech', () => validateFirePlan(s, [shot('P1', 0, 'ZZ')]));
  s.mechs[0].destroyed.LA = true;
  throwsKind(PlanError, 'ineligible', () => validateFirePlan(s, [shot('P1', 1, 'E1')]));
  s.mechs[0].destroyed.LA = false;
  s.mechs[2].alive = false;
  throwsKind(PlanError, 'target-dead', () => validateFirePlan(s, [shot('P1', 0, 'E1')]));
  s.mechs[2].alive = true;
  s.mechs[0].alive = false;
  throwsKind(PlanError, 'dead-mech', () => validateFirePlan(s, [shot('P1', 0, 'E1')]));
  s.mechs[0].alive = true;
  const before = JSON.stringify(s);
  throwsKind(PlanError, 'out-of-range', () => resolveFirePhase(s, [shot('P1', 0, 'E1'), shot('P1', 1, 'E2')], fakeRng([20, 20], [1, 1])));
  eq(JSON.stringify(s), before, 'a rejected plan changes nothing');
  eq(validateFirePlan(s, []).length, 0, 'an empty plan (everything held) is fine');
});

check('fire plan: shots in one volley are all judged on the state before it, so killing a target does not make later shots invalid', () => {
  // E1 has 1 point of structure left in its centre torso. P1 and P2 both fire at it; whichever shot goes first
  // kills it, and the other must still be fired (and hit the wreck), not "lost: the target is dead".
  const s = makeState(openMap(14, 9), [
    tm('P1', 'player', S_HAMMER, [2, 4]), tm('P2', 'player', S_HAMMER, [2, 5]), tm('E1', 'enemy', S_DUMMY, [4, 4]),
  ]);
  s.mechs[2].structure.CT = 1; s.mechs[2].armour.CT = 0;
  const events = resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }, { mechId: 'P2', weaponSlot: 0, targetId: 'E1' }], fakeRng([20, 20], [LOCN.CT, LOCN.CT]));
  eq(events.filter(e => e.type === 'shot').length, 2, 'both shots were fired');
  eq(s.mechs[2].alive, false);
  eq(events.filter(e => e.type === 'killed').length, 1, 'killed once');
});

check('fire plan: missiles are indirect: they fly without line of sight, at a +2 penalty, and still need range', () => {
  const woods = makeMap('t', Array.from({ length: 9 }, (_, r) => (r === 4 ? '....T.........' : '..............')));
  const s = makeState(woods, [tm('P1', 'player', jackal([2, 6, 0]), [2, 4]), tm('E1', 'enemy', S_DUMMY, [6, 4])]);
  eq(targetStatus(s, 'P1', 0, 'E1').reason, 'no-line-of-sight', 'a laser cannot see through the woods');
  const st = targetStatus(s, 'P1', 1, 'E1');
  eq([st.valid, st.band, st.need], [true, 'short', 7 + 1 + 2 + 2], 'toHit 7, range 4 hexes +1, light target +2, no line of sight +2');
  eq(st.mods.map(m => m.name), ['base to-hit', 'range 4 hexes', 'target size', 'no line of sight']);
  const clear = pair(jackal([2, 6, 0]), [2, 2], S_DUMMY, [6, 2]);
  eq(targetStatus(clear, 'P1', 1, 'E1').mods.some(m => m.name === 'no line of sight'), false, 'with a clear view there is no penalty');
  eq(validTargets(s, 'P1', 0).length, 0, 'the laser has nothing to aim at');
  eq(validTargets(s, 'P1', 1).map(t => t.targetId), ['E1'], 'the pod does');
  s.mechs[1].pos = [13, 4];
  eq(targetStatus(s, 'P1', 1, 'E1').reason, 'out-of-range', 'indirect fire still has a range');
  // and it really fires, without a line of sight
  s.mechs[1].pos = [6, 4];
  const events = resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 1, targetId: 'E1' }], fakeRng([20, 15], [1, 1, 1, 1, 1, 1]));
  eq(events[0].type, 'shot'); eq(events[0].need, 12);
  assert(events.some(e => e.type === 'hit'), 'the missiles landed');
});

// ======================================================================
// resolving shots
// ======================================================================
function fireOne(attackerSpec, targetSpec, aPos, tPos, rolls, locs, opts) {
  const s = pair(attackerSpec, aPos, targetSpec, tPos, null, opts);
  const rng = fakeRng(rolls, locs);
  const events = resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], rng);
  return { s, events, rng, target: s.mechs[1], attacker: s.mechs[0] };
}

check('shots: hit when the roll meets the number; a natural 1 always misses, a natural 20 always hits', () => {
  // need 9 (toHit 9, short range, both standing)
  for (const [roll, hit] of [[20, true], [12, true], [9, true], [8, false], [3, false], [1, false]]) {
    const r = fireOne(S_BOLT, S_DUMMY, [2, 2], [4, 2], [roll], [LOCN.CT]);
    const shot = r.events.find(e => e.type === 'shot');
    eq([shot.roll, shot.need, shot.hit], [roll, 9, hit], 'roll ' + roll);
    eq(r.rng.left(), hit ? 0 : 1, 'a miss does not roll a hit location');
  }
  // need clamps to 3: a natural 1 still misses, a 2 misses, a 3 hits
  const best = { attacker: { toHit: 1 } };
  eq(fireOne(S_BOLT, S_DUMMY, [2, 2], [4, 2], [1], [LOCN.CT], best).events[0].hit, false);
  eq(fireOne(S_BOLT, S_DUMMY, [2, 2], [4, 2], [2], [LOCN.CT], best).events[0].hit, false);
  eq(fireOne(S_BOLT, S_DUMMY, [2, 2], [4, 2], [3], [LOCN.CT], best).events[0].hit, true);
  // need clamps to 19: an 18 misses, a 19 and a natural 20 hit
  const worst = { attacker: { toHit: 17 } };
  eq(fireOne(S_BOLT, S_DUMMY, [0, 4], [8, 4], [18], [LOCN.CT], worst).events[0].hit, false);
  eq(fireOne(S_BOLT, S_DUMMY, [0, 4], [8, 4], [19], [LOCN.CT], worst).events[0].hit, true);
  eq(fireOne(S_BOLT, S_DUMMY, [0, 4], [8, 4], [20], [LOCN.CT], worst).events[0].hit, true);
});

check('shots: the odds shown before firing are the odds used', () => {
  const s = pair(S_BOLT, [0, 4], S_DUMMY, [6, 4]);
  const shown = targetStatus(s, 'P1', 0, 'E1').need;
  const events = resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([1], []));
  eq(events[0].need, shown);
});

check('damage: armour, then structure, then carry-over inward', () => {
  // Jackal structure: HD 3, CT 5, RT/LT 4, arms 3, legs 4. Armour is 0 apart from what we set.
  const r = (() => {
    const s = pair(S_HAMMER, [2, 2], S_DUMMY, [4, 2]);
    s.mechs[1].armour.LA = 3;
    const events = resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20], [LOCN.LA]));
    return { s, events, t: s.mechs[1] };
  })();
  const hit = r.events.find(e => e.type === 'hit');
  eq(hit.loc, 'LA'); eq(hit.damage, 12);
  eq(hit.steps, [
    { loc: 'LA', armour: 3, structure: 3, rear: false },
    { loc: 'LT', armour: 0, structure: 4, rear: false },
    { loc: 'CT', armour: 0, structure: 2, rear: false },
  ]);
  eq(r.events.filter(e => e.type === 'destroyed').map(e => e.loc), ['LA', 'LT']);
  eq(r.t.structure.CT, 3);
  eq(r.t.alive, true);
  eq(r.t.armour.LA, 0);
});

check('damage: armour absorbs without touching structure', () => {
  const s = pair(S_BOLT, [2, 2], jackal([0, 0, 0], 0), [4, 2]);
  s.mechs[1].armour.RA = 10;
  resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20], [LOCN.RA]));
  eq(s.mechs[1].armour.RA, 4);
  eq(s.mechs[1].structure.RA, 3);
});

check('damage: head or centre torso destroyed kills the mech', () => {
  let r = fireOne(S_HAMMER, S_DUMMY, [2, 2], [4, 2], [20], [LOCN.HD]);
  eq(r.target.alive, false);
  eq(r.events.filter(e => e.type === 'killed').map(e => e.mechId), ['E1']);
  r = fireOne(S_HAMMER, S_DUMMY, [2, 2], [4, 2], [20], [LOCN.CT]);
  eq(r.target.alive, false);
  r = fireOne(S_BOLT, S_DUMMY, [2, 2], [4, 2], [20], [LOCN.CT]); // 6 damage, CT has 5
  eq(r.target.alive, false);
  r = fireOne(S_BOLT, S_DUMMY, [2, 2], [4, 2], [20], [LOCN.LL]); // a leg does not kill
  eq(r.target.alive, true);
  eq(r.target.destroyed.LL, true);
  eq(r.target.structure.LT, 2, 'the 2 left over from the leg carried to the left torso');
  eq(r.target.structure.CT, 5);
});

check('damage: a destroyed side torso takes its arm and weapons with it', () => {
  const r = fireOne(S_BOLT, sjackal([2, 5, 2]), [2, 2], [4, 2], [20], [LOCN.RT]);
  const t = r.target;
  eq([t.destroyed.RT, t.destroyed.RA], [true, true]);
  eq(t.destroyed.LA, false);
  eq(t.structure.CT, 3, 'the 2 left over carried to the centre torso');
  eq(eligibleWeapons(r.s, 'E1'), [1, 2], 'the right-arm Bolt (0) is gone with its torso; the left-arm Hammer and the centre-torso Bolt remain');
});

check('damage: hits on an already destroyed location carry inward at once', () => {
  const s = pair(S_BOLT, [2, 2], S_DUMMY, [4, 2]);
  s.mechs[1].destroyed.RA = true; s.mechs[1].structure.RA = 0;
  resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20], [LOCN.RA]));
  eq(s.mechs[1].structure.RT, 0, 'the arm was gone, so the right torso took the 6');
  eq(s.mechs[1].destroyed.RT, true);
});

check('damage: leg loss slows the mech; both legs leave it immobile but alive', () => {
  const s = pair(S_HAMMER, [2, 2], S_DUMMY, [4, 2]);
  const t = s.mechs[1];
  resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20], [LOCN.RL]));
  eq(t.destroyed.RL, true);
  eq(walkAllowance(t), Math.ceil(chassisById(2).speed / 2));
  t.destroyed.LL = true;
  eq(walkAllowance(t), 0);
  eq(t.alive, true);
});

check('damage: torso hits from behind use rear armour', () => {
  const rearHit = (aPos, tPos) => {
    const s = pair(S_BOLT, aPos, S_DUMMY, tPos, null, { target: { facing: 0 } }); // the target faces up
    s.mechs[1].armour.CT = 9; s.mechs[1].rear.CT = 5;
    resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20], [LOCN.CT]));
    return s.mechs[1];
  };
  let t = rearHit([3, 5], [3, 3]);   // the attacker is directly behind the target
  eq([t.rear.CT, t.armour.CT, t.structure.CT], [0, 9, 4]);
  t = rearHit([3, 1], [3, 3]);       // the attacker is in front
  eq([t.rear.CT, t.armour.CT, t.structure.CT], [5, 3, 5]);
  const s = pair(S_BOLT, [3, 5], S_DUMMY, [3, 3], null, { target: { facing: 0 } });
  s.mechs[1].armour.RA = 4; s.mechs[1].rear.RA = 0;
  resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20], [LOCN.RA]));
  eq(s.mechs[1].armour.RA, 0, 'arms have no rear armour: a hit from behind uses the front value');
});

check('missiles: one roll to hit, then a cluster roll for how many land, each on its own location', () => {
  // Swarm has 6 missiles of 2 damage.
  const run = (cluster, spec) => {
    const locs = [LOCN.LA, LOCN.RA, LOCN.LL, LOCN.RL, LOCN.CT, LOCN.HD];
    return fireOne(spec, S_DUMMY, [2, 2], [4, 2], [20, cluster], locs);
  };
  let r = run(15, S_SWARM);
  let hits = r.events.filter(e => e.type === 'hit');
  eq(hits.length, 6); eq(hits.map(h => h.loc), ['LA', 'RA', 'LL', 'RL', 'CT', 'HD']); eq(hits.every(h => h.damage === 2), true);
  eq(r.events[0].missiles, 6);
  eq(run(1, S_SWARM).events.filter(e => e.type === 'hit').length, 2, '25% of 6 is 1.5, rounded to 2');
  eq(run(7, S_SWARM).events.filter(e => e.type === 'hit').length, 5, '75% of 6 is 4.5, rounded to 5');
  eq(run(1, S_STING).events.filter(e => e.type === 'hit').length, 1, 'at least one missile always lands');
  eq(run(7, S_STING).events.filter(e => e.type === 'hit').length, 3);
  eq(run(19, S_STING).events.filter(e => e.type === 'hit').length, 4);
  // no hit, no cluster roll
  const miss = fireOne(S_SWARM, S_DUMMY, [2, 2], [4, 2], [1], []);
  eq(miss.events.map(e => e.type), ['shot', 'jam'], 'a natural 1 is a miss with a jam, and nothing else is rolled');
});

check('fire: each weapon uses its own heat and ammo, locks on, and the mech turns to face its first target', () => {
  const s = makeState(openMap(14, 9), [
    tm('P1', 'player', sjackal([5, 2, 0]), [2, 3], { facing: 3 }),
    tm('E1', 'enemy', S_DUMMY, [2, 1]), tm('E2', 'enemy', S_DUMMY, [2, 5]),
  ]);
  const events = resolveFirePhase(s, [
    { mechId: 'P1', weaponSlot: 1, targetId: 'E2' },
    { mechId: 'P1', weaponSlot: 0, targetId: 'E1' },
  ], fakeRng([2, 2], []));
  const p = s.mechs[0];
  eq(p.heat, 6, 'Hammer 3 + Bolt 3');
  eq(p.weapons[0].ammo, weaponById(5).ammo - 1);
  eq(p.weapons[1].ammo, null);
  eq(p.locks, { 0: 'E1', 1: 'E2' });
  eq(p.facing, 0, 'the first weapon (slot 0) was aimed at E1, straight up');
  eq(events.filter(e => e.type === 'shot').map(e => e.slot), [0, 1], 'shots resolve in slot order, whatever the plan order');
  // heat is capped
  p.heat = 28;
  resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 1, targetId: 'E1' }], fakeRng([1], []));
  eq(p.heat, 30);
});

check('fire: a mech destroyed in a volley still fires, and a double kill is a draw', () => {
  const s = pair(S_HAMMER, [2, 2], S_HAMMER, [4, 2]);
  for (const m of s.mechs) { m.structure.CT = 1; m.armour.CT = 0; }
  const events = resolveFirePhase(s, [
    { mechId: 'E1', weaponSlot: 0, targetId: 'P1' },
    { mechId: 'P1', weaponSlot: 0, targetId: 'E1' },
  ], fakeRng([20, 20], [LOCN.CT, LOCN.CT]));
  eq(s.mechs.map(m => m.alive), [false, false]);
  eq(events.filter(e => e.type === 'killed').map(e => e.mechId), ['P1', 'E1'], 'E1 shoots first (ids sort E before P), so P1 dies first');
  eq(events.filter(e => e.type === 'shot').length, 2, 'the second mech fired after it was already dead');
  endRound(s, fakeRng([], []));
  eq([s.over, s.winner], [true, 'draw']);
});

check('fire: a mech killed by an earlier shot still gets its own shot away', () => {
  const s = pair(S_HAMMER, [2, 2], S_HAMMER, [4, 2]);
  s.mechs[1].armour.RA = 10;
  // E1 shoots first (ids sort E before P) and kills P1 with a centre-torso hit; P1's shot still lands.
  const events = resolveFirePhase(s, [
    { mechId: 'P1', weaponSlot: 0, targetId: 'E1' },
    { mechId: 'E1', weaponSlot: 0, targetId: 'P1' },
  ], fakeRng([20, 20], [LOCN.CT, LOCN.RA]));
  eq(s.mechs[0].alive, false);
  eq(s.mechs[1].alive, true);
  eq([s.mechs[1].armour.RA, s.mechs[1].structure.RA], [0, 1], 'the dead mech\'s shot stripped the arm: 12 damage, 10 armour, 2 structure');
  eq(events.filter(e => e.type === 'hit').length, 2, 'both shots landed');
});

// ======================================================================
// the end of a round
// ======================================================================
check('end of round: heat sinks, standing and water cooling, never below zero', () => {
  const sink = (setup) => {
    const s = pair(S_DUMMY, [2, 2], S_DUMMY, [9, 2]);
    const m = s.mechs[0];
    m.heat = 10;
    setup(s, m);
    endRound(s, fakeRng([], []));
    return m.heat;
  };
  const base = Math.floor(4 * COOL_FACTOR); // the test mech has 4 sinks, and each removes COOL_FACTOR of a heat point
  assert(COOL_FACTOR < 1, 'heat lingers: sinks remove less than one heat point each');
  eq(sink(() => {}), 10 - (base + STAND_COOLING + HOLD_FIRE_COOLING), 'sinks + standing + held fire');
  eq(sink((s, m) => { m.moved = 'walk'; }), 10 - (base + HOLD_FIRE_COOLING), 'moved: sinks + held fire');
  eq(sink((s, m) => { m.fired = true; }), 10 - (base + STAND_COOLING), 'fired: sinks + standing');
  eq(sink((s, m) => { m.moved = 'walk'; m.fired = true; }), 10 - base, 'moved and fired: sinks only');
  eq(sink((s, m) => { m.heat = 20; m.fired = true; s.map.tiles[2] = '..~' + '.'.repeat(11); }), 20 - (base + STAND_COOLING + TERRAIN['~'].cool), 'standing in water: sinks + stand + water');
  assert(TERRAIN['~'].cool >= 4, 'water cools a mech a lot more than standing still does');
  eq(sink((s, m) => { m.heat = 20; m.moved = 'walk'; m.fired = true; s.map.tiles[2] = '..~' + '.'.repeat(11); }), 20 - (base + TERRAIN['~'].cool), 'water cools a mech that ended its move there too');
  // the fired flag is for one round only
  const s2 = pair(S_DUMMY, [2, 2], S_DUMMY, [9, 2]);
  s2.mechs[0].fired = true; s2.mechs[0].moved = 'walk';
  endRound(s2, fakeRng([], []));
  eq(s2.mechs[0].fired, false, 'reset for the next round');
  eq(sink((s, m) => { m.heat = 2; }), 0, 'floored at zero');
  eq(sink((s, m) => { m.sinks = 30; }), 0, 'more cooling than heat');
});

check('end of round: shutdown at full heat, restart once cooled below 15', () => {
  const s = pair(S_DUMMY, [2, 2], S_DUMMY, [9, 2]);
  const m = s.mechs[0];
  m.heat = 30;
  let events = endRound(s, fakeRng([], []));
  eq(m.shutdown, true);
  eq(events.filter(e => e.type === 'shutdown').map(e => e.mechId), ['P1']);
  const per = Math.floor(m.sinks * COOL_FACTOR) + STAND_COOLING + HOLD_FIRE_COOLING;
  eq(m.heat, 30 - per);
  eq(events.some(e => e.type === 'restart'), false, 'not the round it shut down');
  events = endRound(s, fakeRng([], []));
  eq([m.heat, m.shutdown], [30 - 2 * per, true]);
  events = endRound(s, fakeRng([], []));
  eq([m.heat, m.shutdown], [30 - 3 * per, false]);
  eq(events.filter(e => e.type === 'restart').map(e => e.mechId), ['P1']);
  // a shut-down mech cannot fire or move
  m.shutdown = true;
  eq(eligibleWeapons(pair(S_BOLT, [2, 2], S_DUMMY, [4, 2]), 'P1').length, 1);
  throwsKind(PlanError, 'shutdown', () => validateMovePlan(s, { mechId: 'P1', mode: 'walk', path: [[2, 1]] }));
});

check('end of round: ammo cook-off from heat 20 up', () => {
  const setup = (heat, spec) => {
    const s = pair(spec, [2, 2], S_DUMMY, [9, 2]);
    s.mechs[0].heat = heat;
    return s;
  };
  // Hammer in the right arm: ammo 10. Cook-off does 10 straight to the arm's structure (3), carrying 7 into the
  // right torso (4), then 3 into the centre torso (5).
  let s = setup(20, S_HAMMER);
  let events = endRound(s, fakeRng([5], []));
  let m = s.mechs[0];
  eq(m.weapons[0].ammo, 0);
  eq([m.destroyed.RA, m.destroyed.RT, m.structure.CT], [true, true, 2]);
  eq(events.filter(e => e.type === 'cookoff').length, 1);
  // a roll above the limit does nothing
  s = setup(20, S_HAMMER);
  endRound(s, fakeRng([7], []));
  eq(s.mechs[0].weapons[0].ammo, weaponById(5).ammo);
  // below heat 20: no roll at all (the fake rng would throw if asked)
  endRound(setup(19, S_HAMMER), fakeRng([], []));
  // no ammo weapons: no roll
  endRound(setup(25, S_BOLT), fakeRng([], []));
  // armour is ignored by the explosion: 50 points of armour on the arm do not save it
  s = setup(20, S_HAMMER);
  s.mechs[0].armour.RA = 50;
  endRound(s, fakeRng([1], []));
  eq(s.mechs[0].destroyed.RA, true);
  // an explosion can kill
  s = setup(20, S_HAMMER);
  s.mechs[0].structure.RA = 1; s.mechs[0].structure.RT = 1; s.mechs[0].structure.CT = 1;
  events = endRound(s, fakeRng([1], []));
  eq(s.mechs[0].alive, false);
  eq(events.filter(e => e.type === 'killed').length, 1);
  eq([s.over, s.winner], [true, 'enemy']);
});

check('end of round: win check and the round counter', () => {
  const s = pair(S_BOLT, [2, 2], S_BOLT, [9, 2]); 
  endRound(s, fakeRng([], []));
  eq([s.round, s.over, s.winner], [2, false, null]);
  s.mechs[1].alive = false;
  const events = endRound(s, fakeRng([], []));
  eq([s.round, s.over, s.winner], [2, true, 'player'], 'the round does not advance once the fight is over');
  eq(events[events.length - 1], { type: 'over', winner: 'player' });
  eq(checkWinner(pair(S_BOLT, [2, 2], S_BOLT, [9, 2])), null);
});

// ======================================================================
// whole fights
// ======================================================================
check('fights: the same seed gives the same fight, and fights finish', () => {
  const squads = balanceSquads(120);
  const fight = seed => {
    const s = newBattle({ playerSpecs: squads.super, enemySpecs: squads.trio, enemyToHit: 5 });
    const result = runFight(s, new Rng(seed));
    return { json: JSON.stringify(s), result };
  };
  const a = fight(7), b = fight(7);
  eq(a.json, b.json, 'replay');
  eq(a.result, b.result);
  let different = false;
  for (let seed = 8; seed < 14; seed++) if (fight(seed).json !== a.json) different = true;
  assert(different, 'other seeds give other fights');
  assert(a.result.winner !== 'timeout', 'the fight ended (' + a.result.winner + ' after ' + a.result.rounds + ' rounds)');
});

check('fights: the normal battle runs to a result on every difficulty', () => {
  for (const name of Object.keys(DIFFICULTIES)) {
    const player = [buildToBudget(3, DIFFICULTIES[name].budget / 2, [2, 4, 7], 2), buildToBudget(2, DIFFICULTIES[name].budget / 2, [2, 4], 2)];
    const s = battleFor(player, name);
    const result = runFight(s, new Rng(5));
    assert(s.over || result.winner === 'timeout', 'state is consistent for ' + name);
    assert(result.rounds <= 40, name);
  }
});

// ======================================================================
// limbs: armour shot away puts an arm or a leg out of action
// ======================================================================
function limbTarget(armour) { // an enemy with a Bolt in the right arm, a Hammer in the left arm, and a Bolt in the centre torso
  const s = pair(S_BOLT, [2, 2], jackal([2, 5, 2], 0), [4, 2]);
  const t = s.mechs[1];
  for (const loc of LOCATIONS) t.armour[loc] = armour;
  return { s, t };
}
function shootAt(s, loc, weapon) { // the player's Hammer or Bolt hits the enemy in `loc`
  return resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20], [LOCN[loc]]));
}

check('limbs: an arm whose armour is shot away cannot use its weapon, though its structure is intact', () => {
  const s = pair(S_HAMMER, [2, 2], jackal([2, 5, 2], 0), [4, 2]);
  const t = s.mechs[1];
  t.armour.RA = 10; // the Hammer does 12: 10 off the armour, 2 into structure (3), leaving 1
  shootAt(s, 'RA');
  eq([t.armour.RA, t.structure.RA, t.destroyed.RA, t.stripped.RA], [0, 1, false, true]);
  assert(locationDown(t, 'RA'), 'the arm is out of action');
  eq(eligibleWeapons(s, 'E1'), [1, 2], 'the Bolt in the right arm is off; the left arm and the centre torso still fire');
  // structure behind the armour still absorbs: one more point destroys the arm, and the rest carries inward
  t.armour.RT = 0;
  resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20], [LOCN.RA]));
  eq([t.destroyed.RA, t.structure.RA], [true, 0]);
  eq(t.structure.RT < structureAt(chassisById(2), 'RT'), true, 'the excess carried into the right torso');
});

check('limbs: a hit that leaves armour on the limb does not strip it', () => {
  const s = pair(S_HAMMER, [2, 2], jackal([2, 5, 2], 0), [4, 2]);
  const t = s.mechs[1];
  t.armour.LA = 20;
  resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20], [LOCN.LA]));
  eq([t.armour.LA, t.stripped.LA], [8, false]);
  eq(eligibleWeapons(s, 'E1'), [0, 1, 2], 'every weapon still works');
});

check('limbs: a limb built with no armour works until it is hit, then is stripped by the first hit', () => {
  const s = pair(S_BOLT, [2, 2], jackal([2, 5, 2], 0), [4, 2]); // armour level 0 everywhere
  const t = s.mechs[1];
  eq(eligibleWeapons(s, 'E1'), [0, 1, 2], 'nothing is down before the first hit');
  eq(LIMB_LOCS.some(l => t.stripped[l]), false);
  resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20], [LOCN.LA])); // 6 damage: 3 structure, then the left torso
  eq(t.stripped.LA, true);
  assert(!eligibleWeapons(s, 'E1').includes(1), 'the left arm weapon is off');
});

check('limbs: one stripped leg halves speed and stops running; both stripped stop the mech; hits do it too', () => {
  const speed = chassisById(2).speed;
  const s = pair(S_BOLT, [2, 2], jackal([2, 0, 0], 3), [4, 2]);
  const t = s.mechs[1];
  eq([walkAllowance(t), runAllowance(t)], [speed, Math.floor(speed * RUN_FACTOR)]);
  t.stripped.RL = true;
  eq([walkAllowance(t), runAllowance(t)], [Math.ceil(speed / 2), 0], 'one leg down: half speed, no running');
  t.stripped.LL = true;
  eq([walkAllowance(t), runAllowance(t)], [0, 0], 'both legs down: cannot move');
  eq(aiMoveFor(s, 'E1').plan.mode, 'stand');
  assert(aiMoveFor(s, 'E1').note.includes('cannot move'), aiMoveFor(s, 'E1').note);
  throwsKind(PlanError, 'cannot-walk', () => validateMovePlan(s, { mechId: 'E1', mode: 'walk', path: [[5, 2]] }));
  // done by real hits: strip the right leg, then the left
  const u = pair(S_HAMMER, [2, 2], jackal([2, 0, 0], 1), [4, 2]);
  for (const loc of ['RL', 'LL']) u.mechs[1].armour[loc] = 4;
  resolveFirePhase(u, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20], [LOCN.RL]));
  eq(walkAllowance(u.mechs[1]), Math.ceil(speed / 2));
  u.mechs[0].heat = 0; u.mechs[0].weapons[0].ammo = 10;
  resolveFirePhase(u, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20], [LOCN.LL]));
  eq(walkAllowance(u.mechs[1]), 0);
});

check('limbs: torsos and the head are not put out of action by losing their armour, and neither are rear hits or cook-offs', () => {
  const s = pair(S_HAMMER, [2, 2], jackal([2, 5, 2], 0), [4, 2]);
  const t = s.mechs[1];
  t.armour.CT = 12; // the Hammer does exactly 12: the armour goes, the structure stays; the weapon in the centre torso (slot 2) must keep working
  resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20], [LOCN.CT]));
  eq(t.armour.CT, 0);
  assert(eligibleWeapons(s, 'E1').includes(2), 'a torso weapon works with its armour gone');
  assert(!LIMB_LOCS.includes('LT') && !LIMB_LOCS.includes('CT') && !LIMB_LOCS.includes('HD'), 'only arms and legs');
  // a rear hit takes the REAR armour, which strips nothing
  const r = pair(S_BOLT, [3, 5], jackal([2, 0, 0], 0), [3, 3], null, { target: { facing: 0 } });
  r.mechs[1].rear.CT = 5; r.mechs[1].armour.CT = 9;
  resolveFirePhase(r, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20], [LOCN.CT]));
  eq([r.mechs[1].rear.CT, r.mechs[1].stripped.CT], [0, false], 'rear armour gone, front armour untouched');
  // an ammo explosion goes through the armour: the limb is destroyed, but its armour is not "shot away"
  const c = pair(S_HAMMER, [2, 2], S_DUMMY, [9, 2]);
  c.mechs[0].heat = 20; c.mechs[0].armour.RA = 50;
  endRound(c, fakeRng([1], []));
  eq([c.mechs[0].destroyed.RA, c.mechs[0].stripped.RA, c.mechs[0].armour.RA], [true, false, 0], 'destroyed (armour zeroed with it), not stripped');
});

// ======================================================================
// the pool model (the simple game): one armour pool, and criticals
// ======================================================================
function poolPair(attackerSpec, targetSpec, aPos, tPos, hp) {
  const s = pair(attackerSpec, aPos || [2, 2], targetSpec, tPos || [4, 2], null, { attacker: { model: 'pool' }, target: { model: 'pool' } });
  if (hp !== undefined) { s.mechs[1].hp = hp; s.mechs[1].maxHp = Math.max(s.mechs[1].maxHp, hp); }
  return s;
}

check('pool: a mech has one pool of armour points, from its chassis and armour level, and the default model is the pool', () => {
  eq(DEFAULT_DAMAGE_MODEL, 'pool');
  const heavy = makeMech({ chassis: 5, armour: 2, sinks: 0, weapons: [2, 4, 0] }, { id: 'P1', side: 'player', pos: [0, 0], facing: 0, toHit: 9 });
  eq(heavy.model, 'pool');
  let total = 0;
  for (const loc of LOCATIONS) total += heavy.armour[loc] + heavy.structure[loc];
  eq([heavy.hp, heavy.maxHp], [Math.round(total * POOL_SCALE), Math.round(total * POOL_SCALE)]);
  const small = makeMech({ chassis: 1, armour: 0, sinks: 0, weapons: [1, 0, 0] }, { id: 'P2', side: 'player', pos: [1, 0], facing: 0, toHit: 9 });
  assert(small.hp >= 1 && small.hp < heavy.hp, 'a bare light mech has fewer points than an armoured heavy: ' + small.hp + ' vs ' + heavy.hp);
  for (const [chassisId, armour] of [[1, 1], [3, 4], [6, 7]]) {
    const a = makeMech({ chassis: chassisId, armour, sinks: 0, weapons: [0, 0, 0] }, { id: 'X', side: 'player', pos: [0, 0], facing: 0, toHit: 9 });
    const b = makeMech({ chassis: chassisId, armour: armour + 1 > ARMOUR_MAX ? armour : armour + 1, sinks: 0, weapons: [0, 0, 0] }, { id: 'X', side: 'player', pos: [0, 0], facing: 0, toHit: 9 });
    assert(b.hp >= a.hp, 'more armour never means fewer points');
  }
  throwsKind(BuildError, 'model', () => makeMech(S_DUMMY, { id: 'X', side: 'player', pos: [0, 0], facing: 0, toHit: 9, model: 'nonsense' }));
  eq(newBattle({ playerSpecs: [S_DUMMY], enemySpecs: [S_DUMMY], enemyToHit: 5 }).mechs[0].model, 'pool');
  eq(newBattle({ playerSpecs: [S_DUMMY], enemySpecs: [S_DUMMY], enemyToHit: 5, model: 'locations' }).mechs[0].model, 'locations');
});

check('pool: a hit comes straight off the pool, with no location roll, and the mech dies at zero', () => {
  const s = poolPair(S_BOLT, S_DUMMY, [2, 2], [4, 2], 20);
  const rng = fakeRng([19], []); // a 19 hits without a critical, and no int is asked for, so no location is rolled
  const events = resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], rng);
  eq(s.mechs[1].hp, 14, 'the Bolt does 6');
  eq(rng.left(), 0, 'nothing else was rolled');
  eq(events.filter(e => e.type === 'hit').map(e => [e.loc, e.damage, e.steps]), [[null, 6, [{ pool: true, amount: 6 }]]]);
  // overkill is clamped to what is left, and the kill is reported once
  s.mechs[1].hp = 4;
  const kill = resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20], []));
  eq([s.mechs[1].hp, s.mechs[1].alive], [0, false]);
  eq(kill.find(e => e.type === 'hit').steps, [{ pool: true, amount: 4 }], 'only 4 points were left to take');
  eq(kill.filter(e => e.type === 'killed').length, 1);
  assert(!kill.some(e => e.type === 'critical'), 'a mech that has just died takes no critical');
});

check('pool: a natural 20 is a critical that knocks out one working weapon, for good, with no extra roll; a 19 only hits', () => {
  const s = poolPair(S_BOLT, jackal([2, 5, 4], 0), [2, 2], [4, 2], 50);
  const t = s.mechs[1];
  // a 20 to hit, and int(3) picks the working weapon at index 2: the Rattler in slot 2
  let events = resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20], [2]));
  eq(events.filter(e => e.type === 'critical'), [{ type: 'critical', mechId: 'E1', slot: 2, weaponId: 4, byId: 'P1' }]);
  eq(t.weapons.map(w => w.off), [false, false, true]);
  eq(eligibleWeapons(s, 'E1'), [0, 1], 'the knocked-out weapon is no longer eligible');
  // the next critical picks among the two that still work
  events = resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20], [0]));
  eq(events.find(e => e.type === 'critical').slot, 0);
  eq(eligibleWeapons(s, 'E1'), [1]);
  // a 19 hits but is not a critical, and asks for no pick
  const rng = fakeRng([19], []);
  events = resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], rng);
  assert(events.some(e => e.type === 'hit') && !events.some(e => e.type === 'critical'), 'a 19 hits without a critical');
  eq(rng.left(), 0);
  eq(t.weapons.filter(w => w.off).length, 2);
  // with nothing left to knock out, a critical does nothing and asks for no pick
  for (const w of t.weapons) w.off = true;
  const none = resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20], []));
  assert(!none.some(e => e.type === 'critical'));
  eq(eligibleWeapons(s, 'E1'), [], 'a mech with every weapon knocked out can only move');
  // the location model has no weapon criticals: a 20 just hits
  const loc = pair(S_BOLT, [2, 2], jackal([2, 5, 4], 0), [4, 2]);
  const lr = fakeRng([20], [LOCN.CT]);
  assert(!resolveFirePhase(loc, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], lr).some(e => e.type === 'critical'));
  eq(lr.left(), 0);
});

check('pool: a missile salvo is ONE critical however many missiles land, and a miss rolls nothing more', () => {
  const s = poolPair(S_SWARM, jackal([2, 5, 0], 0), [2, 2], [4, 2], 80);
  // a 20 to hit, cluster 15 (all 6 missiles), then the pick of the weapon to knock out
  const rng = fakeRng([20, 15], [1]);
  const events = resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], rng);
  eq(events.filter(e => e.type === 'hit').length, 6);
  eq(events.filter(e => e.type === 'critical').length, 1);
  eq(rng.left(), 0);
  const miss = poolPair(S_BOLT, jackal([2, 5, 0], 0), [2, 2], [4, 2], 80);
  const r2 = fakeRng([2], []); // a miss: nothing else is rolled
  resolveFirePhase(miss, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], r2);
  eq(r2.left(), 0);
});

check('fumble: a natural 1 jams the weapon for exactly the next round, and only that weapon', () => {
  const s = pair(jackal([2, 1, 0]), [2, 2], S_DUMMY, [4, 2]);
  const p = s.mechs[0];
  const events = resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }, { mechId: 'P1', weaponSlot: 1, targetId: 'E1' }], fakeRng([1, 2], []));
  eq(events.find(e => e.type === 'jam'), { type: 'jam', mechId: 'P1', slot: 0, weaponId: 2, rounds: JAM_ROUNDS });
  eq(events.filter(e => e.type === 'shot').map(e => !!e.fumble), [true, false]);
  eq(p.weapons.map(w => w.jam), [JAM_ROUNDS, 0, 0]);
  eq(eligibleWeapons(s, 'P1'), [1], 'the jammed weapon cannot fire');
  throwsKind(PlanError, 'ineligible', () => resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20], [1])));
  // the end of the round it fumbled in: still jammed for the next round
  s.mechs[1].alive = true;
  let end = endRound(s, fakeRng([], []));
  eq(p.weapons[0].jam, JAM_ROUNDS - 1);
  assert(!end.some(e => e.type === 'unjam'), 'not cleared yet');
  eq(eligibleWeapons(s, 'P1'), [1], 'still jammed through the next round');
  // the end of the next round clears it
  end = endRound(s, fakeRng([], []));
  eq(p.weapons[0].jam, 0);
  eq(end.filter(e => e.type === 'unjam'), [{ type: 'unjam', mechId: 'P1', slot: 0, weaponId: 2 }]);
  eq(eligibleWeapons(s, 'P1'), [0, 1]);
});

check('fumble: a jammed weapon is not a lost weapon (the mech can still ever fire), and a fumble with ammo still costs the shot', () => {
  const s = pair(S_HAMMER, [2, 2], S_DUMMY, [4, 2], null, { attacker: { model: 'pool' }, target: { model: 'pool' } });
  const ammo = s.mechs[0].weapons[0].ammo;
  resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([1], []));
  eq(eligibleWeapons(s, 'P1'), []);
  assert(canEverFire(s.mechs[0]), 'a jam is temporary');
  eq(s.mechs[0].weapons[0].ammo, ammo - 1, 'the round of ammo is spent');
  eq(newFirePlanner(s, 'player').items.map(i => i.name), ['WEAPONS JAMMED'], 'the screen says why there is nothing to fire');
});

check('pool: an ammo explosion damages the mech directly; the location model still rolls locations', () => {
  const s = poolPair(S_HAMMER, S_DUMMY, [2, 2], [9, 2], 30);
  s.mechs[0].heat = 20;
  s.mechs[0].hp = 30;
  const events = endRound(s, fakeRng([1], []));
  eq(s.mechs[0].hp, 30 - COOKOFF_DAMAGE);
  eq(events.find(e => e.type === 'cookoff').steps, [{ pool: true, amount: COOKOFF_DAMAGE }]);
  s.mechs[0].heat = 20; s.mechs[0].weapons[0].ammo = 5; s.mechs[0].hp = 6;
  const kill = endRound(s, fakeRng([1], []));
  eq([s.mechs[0].alive, kill.some(e => e.type === 'killed')], [false, true]);
  // the location model is untouched: it still rolls a location (the fake rng must be given an int)
  const loc = pair(S_BOLT, [2, 2], S_DUMMY, [4, 2]);
  const rng = fakeRng([20], [LOCN.CT]);
  resolveFirePhase(loc, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], rng);
  eq(rng.left(), 0);
  eq(loc.mechs[1].model, 'locations');
});

check('pool: a mech whose every weapon is knocked out is passed over by the AI and the planner', () => {
  const s = pair(jackal([2, 1, 0]), [2, 2], S_DUMMY, [5, 2], null, { attacker: { model: 'pool' }, target: { model: 'pool' } });
  for (const w of s.mechs[0].weapons) w.off = true;
  eq(aiPlanFire(s, 'player').shots, []);
  eq(newFirePlanner(s, 'player').items.map(i => [i.name, i.idle]), [['NO WEAPONS', true]], 'only the weaponless mech question is left');
});

// ======================================================================
// weapon roles: lasers see far, cannons are slow shells, rockets heat their target
// ======================================================================
check('weapons: lasers have the longest direct-fire reach, cannons are short and scarce, rockets are indirect and heat', () => {
  const reach = kind => Math.max(...WEAPONS.filter(w => w.kind === kind).map(w => w.range[2]));
  assert(reach('laser') > reach('cannon'), 'a laser outreaches a cannon: ' + reach('laser') + ' vs ' + reach('cannon'));
  assert(reach('missile') >= reach('laser'), 'rockets reach at least as far as lasers');
  for (const w of WEAPONS.filter(x => x.kind === 'laser')) assert(w.ammo === null && w.dmg <= 10, w.name + ': no ammo, modest damage');
  for (const w of WEAPONS.filter(x => x.kind === 'cannon')) assert(w.ammo !== null && w.ammo <= 14 && w.moverFactor === 2, w.name + ': scarce ammo and slow shells');
  for (const w of WEAPONS.filter(x => x.kind === 'missile')) assert(w.heatOnHit > 0 && w.minRange > 0, w.name + ': heats its target and has a minimum range');
  assert(Math.max(...WEAPONS.filter(x => x.kind === 'cannon').map(w => w.dmg)) > Math.max(...WEAPONS.filter(x => x.kind === 'laser').filter(w => w.name !== 'SCORCHER').map(w => w.dmg)), 'a cannon hits harder than an ordinary laser');
});

check('cannons: a target that moved is twice as hard to hit with a cannon, and no harder with a laser or rockets', () => {
  const mods = (spec, moved) => { const s = pair(spec, [2, 2], S_DUMMY, [4, 2]); s.mechs[1].moved = moved; return targetStatus(s, 'P1', 0, 'E1').mods.find(m => m.name === 'they moved'); };
  eq(mods(S_HAMMER, 'stand'), undefined, 'a standing target: no penalty');
  eq(mods(S_HAMMER, 'walk').value, 4, 'a cannon: walk +4');
  eq(mods(S_HAMMER, 'run').value, 8, 'a cannon: run +8');
  eq(mods(S_BOLT, 'walk').value, 2, 'a laser: walk +2');
  eq(mods(S_BOLT, 'run').value, 4, 'a laser: run +4');
  eq(mods(S_SWARM, 'run').value, 4, 'rockets: run +4');
  // so a cannon needs more than a laser to hit a runner at the same range
  const c = pair(S_HAMMER, [2, 2], S_DUMMY, [4, 2]), l = pair(S_BOLT, [2, 2], S_DUMMY, [4, 2]);
  c.mechs[1].moved = 'run'; l.mechs[1].moved = 'run';
  assert(targetStatus(c, 'P1', 0, 'E1').need > targetStatus(l, 'P1', 0, 'E1').need, 'cannon vs a runner is the worse shot');
});

check('rockets: every missile that lands heats the target, capped at the heat limit, on both damage models, and the replay agrees', () => {
  for (const model of ['pool', 'locations']) {
    const s = pair(S_SWARM, [2, 2], jackal([2, 0, 0], 3), [4, 2], null, { attacker: { model }, target: { model } });
    if (model === 'pool') { s.mechs[1].hp = 100; s.mechs[1].maxHp = 100; }
    const t = s.mechs[1];
    const before = cloneState(s);
    // to-hit 19, cluster roll 15 (all 6 missiles land); locations for the location model; (a 19 is not a critical)
    const events = resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([19, 15], [1, 1, 1, 1, 1, 1]));
    const hits = events.filter(e => e.type === 'hit');
    eq(hits.length, 6);
    eq(hits.map(h => h.heat), [1, 1, 1, 1, 1, 1], 'one heat for each missile that landed');
    eq(t.heat, 6, `${model}: the target is 6 hotter`);
    const shown = cloneState(before);
    for (const e of events) if (isDamageEvent(e)) applyDamageEvent(shown, e);
    eq(shown.mechs[1].heat, 6, `${model}: the replay shows the same heat`);
    // capped at the limit: the heat actually added is what is reported
    t.heat = 28;
    const again = resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([19, 15], [1, 1, 1, 1, 1, 1]));
    eq(t.heat, HEAT_MAX);
    eq(again.filter(e => e.type === 'hit').map(h => h.heat), [1, 1, 0, 0, 0, 0], 'only the first two had room: 28 to 30');
  }
  // lasers and cannons do not heat the target
  const l = pair(S_BOLT, [2, 2], S_DUMMY, [4, 2]);
  resolveFirePhase(l, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20], [1]));
  eq(l.mechs[1].heat, 0);
  // a mech cooked to the limit shuts down at the end of the round
  const hot = pair(S_BOLT, [2, 2], S_BOLT, [9, 2]);
  hot.mechs[1].heat = HEAT_MAX;
  assert(endRound(hot, fakeRng([], [])).some(e => e.type === 'shutdown'), 'shutdown');
});

// ======================================================================
// smoke rockets
// ======================================================================
const S_FOG = jackal([8, 0, 0]);

check('smoke: it blocks line of sight through, into and out of its hexes, both ways round', () => {
  const clear = openMap(14, 9);
  eq(hasLineOfSight(clear, [2, 2], [6, 2]), true);
  for (const [name, hex] of [['through', [4, 2]], ['into', [6, 2]], ['out of', [2, 2]]]) {
    const m = openMap(14, 9);
    addSmoke(m, [hex], 2);
    eq(hasLineOfSight(m, [2, 2], [6, 2]), false, `smoke ${name}`);
    eq(hasLineOfSight(m, [6, 2], [2, 2]), false, `smoke ${name}, from the other end`);
  }
  const off = openMap(14, 9);
  addSmoke(off, [[4, 6]], 2);
  eq(hasLineOfSight(off, [2, 2], [6, 2]), true, 'smoke elsewhere does nothing');
});

check('smoke rocket: it can be aimed at an enemy, a friend or the shooter, needs no line of sight, and always lands', () => {
  const s = makeState(openMap(14, 9), [tm('P1', 'player', S_FOG, [2, 2]), tm('P2', 'player', S_DUMMY, [4, 5]), tm('E1', 'enemy', S_DUMMY, [8, 2])]);
  for (const id of ['P1', 'P2', 'E1']) {
    const st = targetStatus(s, 'P1', 0, id);
    eq([st.valid, st.chance, st.smoke], [true, 100, true], 'valid target ' + id);
  }
  eq(targetStatus(s, 'P1', 0, 'E1').band, 'medium');
  eq(validTargets(s, 'P1', 0).map(t => t.targetId).sort(), ['E1', 'P1', 'P2'], 'every mech in range is offered');
  // out of range: the cloud's reach is 10
  const far = makeState(openMap(30, 9), [tm('P1', 'player', S_FOG, [1, 2]), tm('E1', 'enemy', S_DUMMY, [20, 2])]);
  eq(targetStatus(far, 'P1', 0, 'E1').reason, 'out-of-range');
  // the suggestion is the nearest ENEMY, never a friend or the mech itself
  eq(defaultTarget(s, 'P1', 0).targetId, 'E1');
  // and a dead mech is not a target
  s.mechs[2].alive = false;
  eq(targetStatus(s, 'P1', 0, 'E1').reason, 'target-dead');
  // a laser still cannot fire at a friend
  const l = makeState(openMap(14, 9), [tm('P1', 'player', S_BOLT, [2, 2]), tm('P2', 'player', S_DUMMY, [4, 2])]);
  eq(targetStatus(l, 'P1', 0, 'P2').reason, 'friendly');
});

check('smoke rocket: a volley lays a 7-hex cloud for the set rounds, with no dice, spending ammo and heat', () => {
  const s = pair(S_FOG, [2, 2], S_DUMMY, [6, 2]);
  const rng = fakeRng([], []); // any roll would throw
  const events = resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], rng);
  eq(events.map(e => e.type), ['shot', 'smoke']);
  eq([events[0].hit, events[0].roll, events[0].need], [true, null, null]);
  eq(events[1].hexes.length, 7);
  assert(events[1].hexes.some(h => h[0] === 6 && h[1] === 2), 'centred on the target');
  eq(Object.keys(s.map.smoke).length, 7);
  assert(Object.values(s.map.smoke).every(n => n === SMOKE_ROUNDS), 'every hex has the full duration');
  eq(s.mechs[0].weapons[0].ammo, weaponById(8).ammo - 1);
  eq(s.mechs[0].heat, weaponById(8).heat);
  eq(s.mechs[1].heat, 0, 'the target is not harmed');
  assert(s.mechs[1].hp === s.mechs[1].maxHp || s.mechs[1].alive, 'the target is untouched');
  // a cloud at the edge of the map only covers the hexes that are on it
  const corner = pair(S_FOG, [2, 2], S_DUMMY, [0, 0]);
  const e2 = resolveFirePhase(corner, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([], []));
  assert(e2[1].hexes.length < 7 && e2[1].hexes.every(h => inMap(corner.map, h[0], h[1])), 'only hexes on the map');
});

check('smoke: lasers and cannon cannot fire through it, rockets can (with the no-line-of-sight penalty), and it clears after its rounds', () => {
  const mk = spec => {
    const s = pair(spec, [2, 2], S_DUMMY, [7, 2]);
    addSmoke(s.map, [[4, 2]], SMOKE_ROUNDS);
    return s;
  };
  eq(targetStatus(mk(S_BOLT), 'P1', 0, 'E1').reason, 'no-line-of-sight');
  eq(targetStatus(mk(S_HAMMER), 'P1', 0, 'E1').reason, 'no-line-of-sight');
  const rocket = targetStatus(mk(S_SWARM), 'P1', 0, 'E1');
  eq(rocket.valid, true);
  assert(rocket.mods.some(m => m.name === 'no line of sight'), 'rockets pay the indirect penalty');
  // the cloud lasts its rounds and no longer
  const s = mk(S_BOLT);
  endRound(s, fakeRng([], []));
  eq(s.map.smoke['4,2'], SMOKE_ROUNDS - 1, 'one round gone');
  eq(targetStatus(s, 'P1', 0, 'E1').valid, false, 'still blocking in the next round');
  endRound(s, fakeRng([], []));
  eq(s.map.smoke['4,2'], undefined, 'gone after its rounds');
  eq(targetStatus(s, 'P1', 0, 'E1').valid, true, 'the line is open again');
});

check('smoke does no damage, so a mech with only smoke has no weapon that can do damage', () => {
  const s = makeState(openMap(14, 9), [tm('P1', 'player', S_FOG, [2, 2]), tm('E1', 'enemy', S_BOLT, [9, 2])]);
  eq([canEverFire(s.mechs[0]), canEverFire(s.mechs[1])], [false, true]);
});

// ======================================================================
// self-destruct
// ======================================================================
function bombState(model) {
  // P1 (the bomber) at 4,4; E1 and P2 (a friend) beside it; E2 two hexes away, out of the blast
  const map = openMap(14, 9);
  const ring = neighbours(map, 4, 4);
  const o = { model };
  const s = makeState(map, [
    tm('P1', 'player', S_DUMMY, [4, 4], o), tm('P2', 'player', jackal([0, 0, 0], 7), [ring[1].c, ring[1].r], o),
    tm('E1', 'enemy', jackal([0, 0, 0], 7), [ring[0].c, ring[0].r], o), tm('E2', 'enemy', jackal([0, 0, 0], 7), [8, 4], o),
  ]);
  return s;
}

check('self-destruct: every mech in the six hexes around the bomber, friend or foe, takes the blast damage, and the bomber is destroyed (pool model)', () => {
  const s = bombState('pool');
  const hp = id => mechById(s, id).hp;
  const before = { P2: hp('P2'), E1: hp('E1'), E2: hp('E2') };
  const events = resolveFirePhase(s, [{ mechId: 'P1', destruct: true }], fakeRng([], []));
  eq(events.map(e => e.type), ['shot', 'blast', 'hit', 'hit', 'hit', 'killed']);
  eq(events[0].destruct, true);
  eq(events[1].hexes.length, neighbours(s.map, 4, 4).length);
  eq(events.filter(e => e.type === 'hit').map(e => e.targetId), ['E1', 'P2', 'P1'], 'victims in id order, then the bomber itself');
  eq(before.P2 - hp('P2'), Math.min(before.P2, SELF_DESTRUCT_DAMAGE), 'a friend is hurt too');
  eq(before.E1 - hp('E1'), Math.min(before.E1, SELF_DESTRUCT_DAMAGE), 'so is an enemy');
  eq(hp('E2'), before.E2, 'a mech two hexes away is safe');
  eq([mechById(s, 'P1').alive, hp('P1')], [false, 0], 'the bomber is gone');
  // a blast that finishes a mech kills it
  const t = bombState('pool');
  mechById(t, 'E1').hp = 5;
  const e2 = resolveFirePhase(t, [{ mechId: 'P1', destruct: true }], fakeRng([], []));
  eq([mechById(t, 'E1').alive, e2.filter(e => e.type === 'killed').map(e => e.mechId)], [false, ['E1', 'P1']]);
});

check('self-destruct: the location model rolls a location for each victim, and the bomber loses its centre torso', () => {
  const s = bombState('locations');
  const before = mechById(s, 'E1').armour.CT + mechById(s, 'E1').structure.CT;
  // two victims: a centre-torso hit for each
  const events = resolveFirePhase(s, [{ mechId: 'P1', destruct: true }], fakeRng([], [LOCN.CT, LOCN.CT]));
  const hits = events.filter(e => e.type === 'hit');
  eq(hits.map(h => [h.targetId, h.loc, h.damage, h.blast]), [['E1', 'CT', SELF_DESTRUCT_DAMAGE, true], ['P2', 'CT', SELF_DESTRUCT_DAMAGE, true], ['P1', 'CT', hits[2].damage, true]]);
  eq(mechById(s, 'E1').armour.CT + mechById(s, 'E1').structure.CT, before - SELF_DESTRUCT_DAMAGE);
  eq(mechById(s, 'P1').alive, false);
  assert(mechById(s, 'P1').destroyed.CT, 'its centre torso is destroyed');
  eq(events.some(e => e.type === 'killed' && e.mechId === 'P1'), true);
});

check('self-destruct: a mech does nothing else that phase, a shut-down mech cannot, and a destroyed one still goes off with the volley', () => {
  const s = bombState('pool');
  const armed = makeState(openMap(14, 9), [tm('P1', 'player', S_BOLT, [4, 4]), tm('E1', 'enemy', S_DUMMY, [6, 4])]);
  throwsKind(PlanError, 'destruct-and-fire', () => validateFirePlan(armed, [{ mechId: 'P1', destruct: true }, { mechId: 'P1', weaponSlot: 0, targetId: 'E1' }]));
  throwsKind(PlanError, 'destruct-and-fire', () => validateFirePlan(armed, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }, { mechId: 'P1', destruct: true }]));
  throwsKind(PlanError, 'duplicate-weapon', () => validateFirePlan(s, [{ mechId: 'P1', destruct: true }, { mechId: 'P1', destruct: true }]));
  mechById(s, 'P1').shutdown = true;
  throwsKind(PlanError, 'ineligible', () => validateFirePlan(s, [{ mechId: 'P1', destruct: true }]));
  mechById(s, 'P1').shutdown = false; mechById(s, 'P1').alive = false;
  throwsKind(PlanError, 'dead-mech', () => validateFirePlan(s, [{ mechId: 'P1', destruct: true }]));
  // a bomber killed by an earlier shot in the same volley still blows up, and is not destroyed twice
  const v = makeState(openMap(14, 9), [tm('P1', 'player', S_DUMMY, [4, 4], { model: 'pool' }), tm('E1', 'enemy', S_BOLT, [6, 4], { model: 'pool' }), tm('P2', 'player', jackal([0, 0, 0], 7), [4, 5], { model: 'pool' })]);
  mechById(v, 'P1').hp = 1;
  const events = resolveFirePhase(v, [{ mechId: 'E1', weaponSlot: 0, targetId: 'P1' }, { mechId: 'P1', destruct: true }], fakeRng([20, 1], [0, 0, 0, 0]));
  eq(events.filter(e => e.type === 'killed' && e.mechId === 'P1').length, 1, 'killed once');
  assert(events.some(e => e.type === 'hit' && e.blast && e.targetId === 'P2'), 'the blast still went off');
});

check('self-destruct: a bomber on the edge of the map blasts only the hexes that exist, and does not hit anything beyond', () => {
  const s = makeState(openMap(14, 9), [tm('P1', 'player', S_DUMMY, [0, 0], { model: 'pool' }), tm('E1', 'enemy', jackal([0, 0, 0], 7), [1, 0], { model: 'pool' }), tm('E2', 'enemy', jackal([0, 0, 0], 7), [3, 3], { model: 'pool' })]);
  const events = resolveFirePhase(s, [{ mechId: 'P1', destruct: true }], fakeRng([], []));
  assert(events[1].hexes.length < 6 && events[1].hexes.every(h => inMap(s.map, h[0], h[1])), 'only hexes on the map');
  eq(events.filter(e => e.type === 'hit').map(e => e.targetId), ['E1', 'P1']);
});

// ======================================================================
// the heavy weapons: laser array and howitzer
// ======================================================================
const S_ARRAY = jackal([9, 0, 0]), S_HOWITZER = jackal([10, 0, 0]);

check('heavy weapons: an array is four beams on one attack, a howitzer an indirect shell with splash; both are heavy-only and take 3 slots', () => {
  const arr = weaponById(9), how = weaponById(10);
  eq([arr.kind, arr.missiles, arr.dmg, arr.size, arr.ammo], ['laser', 4, 3, 3, null]);
  eq([how.indirect, how.splash, how.minRange, how.size], [true, 6, 4, 3]);
  assert(how.dmg > weaponById(5).dmg, 'a howitzer shell outweighs the Hammer');
  assert(how.range[2] >= Math.max(...WEAPONS.filter(w => w.id !== 10).map(w => w.range[2])), 'the howitzer reaches furthest');
  assert(how.moverFactor > weaponById(5).moverFactor, 'a slower shell than the cannons');
  for (const w of [arr, how]) assert(w.minCapacity === HEAVY_MIN_CAPACITY, w.name + ' needs a heavy chassis');
  throwsKind(BuildError, 'too-heavy', () => validateSquad([{ chassis: 3, armour: 0, sinks: 0, weapons: [10, 0, 0] }], 'normal'));
  throwsKind(BuildError, 'too-heavy', () => validateSquad([{ chassis: 4, armour: 0, sinks: 0, weapons: [9, 0, 0] }], 'normal'));
  eq(validateSquad([{ chassis: 5, armour: 0, sinks: 0, weapons: [9, 10, 0] }], 'normal'), 44 + 16 + 20, 'a Warden carries both: 3 + 3 = its 6 slots');
  eq(validateSquad([{ chassis: 6, armour: 0, sinks: 0, weapons: [10, 9, 1] }], 'normal'), 60 + 20 + 16 + 4, 'a Monolith: 3 + 3 + 1 = its 7 slots');
});

check('laser array: one to-hit roll, then a cluster roll for how many of the four beams land, each for 3; it still needs line of sight', () => {
  const dmg = weaponById(9).dmg;
  for (const [cluster, beams] of [[19, 4], [7, 3], [1, 1]]) {
    const s = pair(S_ARRAY, [2, 2], S_DUMMY, [4, 2], null, { attacker: { model: 'pool' }, target: { model: 'pool' } });
    const t = s.mechs[1];
    t.hp = t.maxHp = 60;
    const events = resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20, cluster, 1], [])); // hit, cluster, no critical
    eq(events.filter(e => e.type === 'hit').length, beams, `cluster roll ${cluster}: ${beams} beams`);
    eq(60 - t.hp, beams * dmg);
    eq(s.mechs[0].heat, weaponById(9).heat, 'one attack, one dose of heat');
  }
  const miss = pair(S_ARRAY, [2, 2], S_DUMMY, [4, 2]);
  eq(resolveFirePhase(miss, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([1], [])).filter(e => e.type === 'hit').length, 0, 'a miss lands no beam');
  const blocked = pair(S_ARRAY, [2, 2], S_DUMMY, [7, 2]);
  addSmoke(blocked.map, [[4, 2]], 2);
  eq(targetStatus(blocked, 'P1', 0, 'E1').reason, 'no-line-of-sight', 'a laser, not indirect: smoke stops it');
});

check('howitzer: indirect with a minimum range, a tripled mover penalty, and no line of sight needed', () => {
  const s = pair(S_HOWITZER, [2, 2], S_DUMMY, [8, 2]);
  const st = targetStatus(s, 'P1', 0, 'E1');
  eq([st.valid, st.band], [true, 'medium']);
  eq(targetStatus(pair(S_HOWITZER, [2, 2], S_DUMMY, [4, 2]), 'P1', 0, 'E1').reason, 'too-close');
  eq(targetStatus(pair(S_HOWITZER, [2, 2], S_DUMMY, [4 + 3, 2]), 'P1', 0, 'E1').valid, true, 'a minimum of 4 is fine at 5');
  eq(targetStatus(pair(S_HOWITZER, [0, 4], S_DUMMY, [13, 4]), 'P1', 0, 'E1').reason, 'out-of-range');
  const mod = moved => { const t = pair(S_HOWITZER, [2, 2], S_DUMMY, [8, 2]); t.mechs[1].moved = moved; return targetStatus(t, 'P1', 0, 'E1').mods.find(m => m.name === 'they moved'); };
  eq([mod('walk').value, mod('run').value], [6, 12], 'walk +6, run +12');
  // smoke does not stop a shell: it gets the usual indirect penalty and fires
  const smoked = pair(S_HOWITZER, [2, 2], S_DUMMY, [8, 2]);
  addSmoke(smoked.map, [[8, 2]], 2); // a cloud over the target
  const through = targetStatus(smoked, 'P1', 0, 'E1');
  eq(through.valid, true);
  assert(through.mods.some(m => m.name === 'no line of sight'), 'the indirect penalty');
});

check('howitzer: the shell and its splash, on mechs of both sides beside the target, none on a miss, the target not hit twice', () => {
  const build = model => {
    const map = openMap(16, 9), o = { model };
    const ring = neighbours(map, 9, 4);
    const s = makeState(map, [
      tm('P1', 'player', S_HOWITZER, [2, 4], o), tm('P2', 'player', jackal([0, 0, 0], 7), [ring[1].c, ring[1].r], o),
      tm('E1', 'enemy', jackal([0, 0, 0], 7), [9, 4], o), tm('E2', 'enemy', jackal([0, 0, 0], 7), [ring[3].c, ring[3].r], o), tm('E3', 'enemy', jackal([0, 0, 0], 7), [14, 8], o),
    ]);
    return s;
  };
  const s = build('pool');
  const hp = id => mechById(s, id).hp, before = Object.fromEntries(s.mechs.map(m => [m.id, m.hp]));
  const events = resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20, 1], []));
  const hits = events.filter(e => e.type === 'hit');
  eq(hits.map(h => [h.targetId, h.damage, !!h.blast]), [['E1', 18, false], ['E2', 6, true], ['P2', 6, true]], 'the shell, then the splash on E2 and P2 in id order');
  eq([before.E1 - hp('E1'), before.E2 - hp('E2'), before.P2 - hp('P2')], [18, 6, 6]);
  eq([hp('E3'), hp('P1')], [before.E3, before.P1], 'a far mech and the shooter are untouched');
  // a miss does nothing at all
  const m = build('pool');
  const missed = resolveFirePhase(m, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([1], []));
  eq(missed.filter(e => e.type === 'hit').length, 0);
  eq(m.mechs.map(x => x.hp), build('pool').mechs.map(x => x.hp));
  // the location model rolls a location for the shell and for each splash
  const l = build('locations');
  const le = resolveFirePhase(l, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20], [LOCN.CT, LOCN.CT, LOCN.CT]));
  eq(le.filter(e => e.type === 'hit').map(h => [h.targetId, h.loc]), [['E1', 'CT'], ['E2', 'CT'], ['P2', 'CT']]);
  // splash that finishes a mech kills it
  const k = build('pool');
  mechById(k, 'E2').hp = 3;
  const ke = resolveFirePhase(k, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([20, 1], []));
  eq(ke.filter(e => e.type === 'killed').map(e => e.mechId), ['E2']);
});

// ======================================================================
// combat: both sides fire at once
// ======================================================================
check('combat: both sides fire in one resolution, a mech destroyed in it still shoots, and mutual destruction is a draw', () => {
  const s = pair(S_BOLT, [2, 2], S_BOLT, [4, 2], null, { attacker: { model: 'pool' }, target: { model: 'pool' } });
  s.mechs[0].hp = 3; s.mechs[1].hp = 3; // one Bolt hit (6) kills either
  const events = resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }, { mechId: 'E1', weaponSlot: 0, targetId: 'P1' }], fakeRng([20, 20], []));
  eq(events.filter(e => e.type === 'shot').map(e => [e.mechId, e.hit]), [['E1', true], ['P1', true]].sort((a, b) => (a[0] < b[0] ? -1 : 1)), 'both fired and both hit, whoever died first');
  eq(s.mechs.map(m => m.alive), [false, false], 'both are destroyed');
  assert(finishIfOver(s));
  eq([s.winner, s.reason], ['draw', 'Every mech on both sides was destroyed']);
});

check('combat: the order of the two sides\' shots in the list does not change what happens', () => {
  const build = () => {
    const s = makeState(openMap(14, 9), [tm('P1', 'player', jackal([2, 4, 0]), [2, 4], { model: 'pool' }), tm('P2', 'player', jackal([2, 0, 0]), [2, 6], { model: 'pool' }),
      tm('E1', 'enemy', jackal([2, 4, 0]), [5, 4], { model: 'pool' }), tm('E2', 'enemy', jackal([2, 0, 0]), [5, 6], { model: 'pool' })]);
    return s;
  };
  const player = [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }, { mechId: 'P2', weaponSlot: 0, targetId: 'E2' }];
  const enemy = [{ mechId: 'E1', weaponSlot: 1, targetId: 'P1' }, { mechId: 'E2', weaponSlot: 0, targetId: 'P2' }];
  const a = build(), b = build();
  const ea = resolveFirePhase(a, [...player, ...enemy], new Rng(9)), eb = resolveFirePhase(b, [...enemy, ...player], new Rng(9));
  eq(JSON.stringify(a), JSON.stringify(b), 'the same state');
  eq(JSON.stringify(ea), JSON.stringify(eb), 'the same events in the same order');
});

check('combat: aiPlanCombat plans both sides on the same state before anything resolves, the player\'s shots first', () => {
  const s = pair(S_BOLT, [2, 2], S_BOLT, [5, 2], null, { attacker: { model: 'pool' }, target: { model: 'pool' } });
  const plan = aiPlanCombat(s);
  eq(plan.shots.map(x => x.mechId), ['P1', 'E1']);
  const before = JSON.stringify(s);
  aiPlanCombat(s);
  eq(JSON.stringify(s), before, 'planning changes nothing');
  const events = resolveFirePhase(s, plan.shots, new Rng(3));
  eq(events.filter(e => e.type === 'shot').length, 2);
});
