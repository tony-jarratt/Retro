'use strict';

// Checks for the AI, the guided fire planner and the volley timeline (M3). Loaded after checks-code.js.

// A mid-sized fight to draw states from: the balance squads on the real map, both sides played by the AI.
function sampleBattle(model) {
  const squads = balanceSquads(120);
  return newBattle({ playerSpecs: squads.trio, enemySpecs: squads.super.concat(squads.trio.slice(0, 2)), enemyToHit: 5, model });
}

// ======================================================================
// the AI
// ======================================================================
// Plays one round the way the game does, but with a hook on every action, returning what happened.
function aiRound(s, rng, hooks) {
  for (const phase of roundPhases(s.first)) {
    if (phase.kind === 'move') {
      for (const mech of livingMechs(s, phase.side)) {
        const r = aiMoveFor(s, mech.id);
        if (hooks && hooks.move) hooks.move(s, mech, r);
        moveMech(s, r.plan);
        if (finishIfOver(s)) return;
      }
    } else {
      const r = aiPlanFire(s, phase.side);
      if (hooks && hooks.fire) hooks.fire(s, phase.side, r);
      resolveFirePhase(s, r.shots, rng);
      if (finishIfOver(s)) return;
    }
  }
  endRound(s, rng);
}

check('ai: every move and every volley it plans is legal, for many rounds of many fights', () => {
  let checked = 0;
  for (let seed = 1; seed <= 15; seed++) {
    const s = sampleBattle(), rng = new Rng(seed);
    for (let round = 0; round < 12 && !s.over; round++) {
      aiRound(s, rng, {
        move: (st, mech, r) => { validateMovePlan(st, r.plan); checked++; },
        fire: (st, side, r) => { validateFirePlan(st, r.shots); checked += r.shots.length; },
      });
    }
  }
  assert(checked > 400, 'checked plans: ' + checked);
});

check('ai: it explains every move decision in one line that starts with the mech', () => {
  const s = sampleBattle();
  for (const id of ['E1', 'E2', 'E3']) {
    const { plan, note } = aiMoveFor(s, id);
    eq(plan.mechId, id);
    assert(note.length > 15 && note.startsWith(id + ' '), 'note: ' + note);
  }
  throwsKind(PlanError, 'dead-mech', () => { s.mechs.find(m => m.id === 'E1').alive = false; aiMoveFor(s, 'E1'); });
});

check('ai: it stands still when shut down, too hot or alone, and says why', () => {
  const s = sampleBattle();
  mechById(s, 'E1').shutdown = true;
  mechById(s, 'E2').heat = 15;
  const e1 = aiMoveFor(s, 'E1'), e2 = aiMoveFor(s, 'E2');
  eq([e1.plan.mode, e2.plan.mode], ['stand', 'stand']);
  assert(e1.note.includes('shut down'), e1.note);
  assert(e2.note.includes('cooling'), e2.note);
  for (const m of s.mechs) if (m.side === 'player') m.alive = false;
  assert(aiMoveFor(s, 'E3').note.includes('no enemies'), aiMoveFor(s, 'E3').note);
  eq(aiPlanFire(s, 'enemy').shots.length, 0, 'nothing to shoot at');
});

check('ai: a mech with no view of the enemy works its way to one (a wall of woods in the way)', () => {
  const map = makeMap('t', ['..............', '..............', '.....T........', '.....T........', '.....T........', '.....T........', '..............', '..............', '..............']);
  const s = makeState(map, [tm('P1', 'player', jackal([2, 0, 0]), [3, 3]), tm('E1', 'enemy', jackal([2, 0, 0]), [9, 3])]);
  let fired = false;
  for (let i = 0; i < 6 && !fired; i++) {
    moveMech(s, aiMoveFor(s, 'P1').plan);
    fired = validTargets(s, 'P1', 0).length > 0;
  }
  assert(fired, 'it got to a hex that sees E1, ending on ' + hexKey(...s.mechs[0].pos));
});

check('ai: it never stalls: against a player who stands still it closes in and fires within a few rounds, from any start', () => {
  for (const [name, chassis] of [['skitter', 1], ['ranger', 3], ['monolith', 6]]) {
    for (const row of [1, 4, 6, 9]) {
      const spec = { chassis, armour: 2, sinks: 0, weapons: [2, 0, 0] };
      const s = newBattle({ playerSpecs: [S_DUMMY], enemySpecs: [spec], enemyToHit: 5 });
      s.mechs[1].pos = [18, row]; // an enemy at the far edge
      const rng = new Rng(3);
      let fired = null;
      for (let round = 1; round <= 14 && fired === null; round++) {
        moveMech(s, { mechId: 'P1', mode: 'stand', path: [] });
        moveMech(s, aiMoveFor(s, 'E1').plan);
        const events = resolveFirePhase(s, aiPlanFire(s, 'enemy').shots, rng);
        if (events.some(x => x.type === 'shot')) fired = round;
        endRound(s, rng);
        if (s.over) fired = round;
      }
      assert(fired !== null, `a ${name} starting on row ${row} never got into range of a player standing still`);
    }
  }
});

check('ai: it always walks, never runs, however far the enemy is (running is for the player)', () => {
  const far = makeState(openMap(30, 9), [tm('P1', 'player', jackal([2, 0, 0]), [1, 4]), tm('E1', 'enemy', S_DUMMY, [28, 4])]);
  const plan = aiMoveFor(far, 'P1').plan;
  eq(plan.mode, 'walk');
  assert(plan.path.length > 0 && pathCost(far.map, plan.path) <= walkAllowance(far.mechs[0]), 'it walks as far as it can');
  for (let seed = 1; seed <= 20; seed++) {
    const s = sampleBattle(), rng = new Rng(seed);
    for (let round = 0; round < 8 && !s.over; round++) aiRound(s, rng, { move: (st, mech, r) => assert(r.plan.mode !== 'run', `a run in seed ${seed}`) });
  }
});

check('ai: it is deterministic, and its targets follow each weapon\'s lock', () => {
  const s = sampleBattle();
  eq(aiMoveFor(s, 'E1'), aiMoveFor(s, 'E1'));
  eq(aiPlanFire(s, 'enemy'), aiPlanFire(s, 'enemy'));
  const t = pair(jackal([2, 4, 0]), [2, 2], S_DUMMY, [5, 2]);
  t.mechs.push(tm('E2', 'enemy', S_DUMMY, [3, 3]));
  t.mechs[0].locks = { 0: 'E1' };
  const shots = aiPlanFire(t, 'player').shots;
  eq(shots.find(x => x.weaponSlot === 0).targetId, 'E1', 'locked on E1, though E2 is nearer');
  eq(shots.find(x => x.weaponSlot === 1).targetId, 'E2', 'no lock: the nearest');
});

check('ai: it holds weapons rather than head for shutdown, and says so', () => {
  const s = pair(jackal([2, 2, 0]), [2, 2], S_DUMMY, [5, 2]);
  s.mechs[0].heat = 21; // a Bolt makes 3: the first reaches 24, the second would reach 27 (the cap is 26)
  const r = aiPlanFire(s, 'player');
  eq(r.shots.length, 1, 'the first Bolt takes it to 24, the second would take it to 27');
  assert(r.notes.some(n => n.includes('holds BOLT') && n.includes('heat')), r.notes.join(' | '));
  s.mechs[0].heat = 0;
  eq(aiPlanFire(s, 'player').shots.length, 2, 'cool: both fire');
});

check('ai: after it moves, what it fires at is what it can really see from where it ended up', () => {
  const s = pair(jackal([2, 0, 0]), [1, 4], S_DUMMY, [8, 4]);
  moveMech(s, aiMoveFor(s, 'P1').plan);
  const shots = aiPlanFire(s, 'player').shots;
  eq(shots.length, 1);
  validateFirePlan(s, shots); // would throw if the target were not valid from the real position
});

// ======================================================================
// the fire planner's model
// ======================================================================
function planState() {
  // P1 has a Bolt (slot 0), a Hammer (1); P2 a Sting (slot 0: minimum range 2). E1 is 2 away from P1, E2 6 away,
  // E3 far off. Well-armoured enemies, so a test volley does not kill them.
  return makeState(openMap(16, 9), [
    tm('P1', 'player', jackal([2, 5, 0]), [2, 4]),
    tm('P2', 'player', jackal([6, 0, 0]), [2, 6]),
    tm('E1', 'enemy', jackal([0, 0, 0], 7), [4, 4]), tm('E2', 'enemy', jackal([0, 0, 0], 7), [8, 4]), tm('E3', 'enemy', jackal([0, 0, 0], 7), [15, 8]),
  ]);
}

function whatIsAsked(p) { const q = plannerQuestion(p); return q ? `${q.mechId} ${q.name}` : 'done'; }

check('planner: it asks about each weapon that can fire and has a target, mech by mech, and lists the rest as skipped', () => {
  const s = planState();
  const p = newFirePlanner(s, 'player');
  eq(p.items.map(i => `${i.mechId}:${i.slot}:${i.name}`), ['P1:0:BOLT', 'P1:1:HAMMER', 'P2:0:STING']);
  s.mechs[0].destroyed.LA = true; // the Hammer's arm
  s.mechs[1].weapons[0].ammo = 0;
  eq(newFirePlanner(s, 'player').items.map(i => i.name), ['BOLT', 'NO WEAPONS'], 'destroyed and empty weapons are not asked about; the weaponless mech gets its own question');
  const far = planState();
  far.mechs[2].pos = [15, 4]; far.mechs[3].pos = [15, 5]; far.mechs[4].pos = [15, 8];
  const f = newFirePlanner(far, 'player');
  eq(f.items.length, 0);
  eq(f.skipped.map(x => x.name), ['BOLT', 'HAMMER', 'STING'], 'weapons with nothing in range are listed, not asked');
  assert(plannerDone(f) && plannerQuestion(f) === null, 'nothing to ask: done at once');
  eq(plannerShots(f), []);
});

check('planner: the cursor starts on the suggestion (the lock, else the nearest), and says why when a lock is lost', () => {
  const s = planState();
  let p = newFirePlanner(s, 'player');
  let q = plannerQuestion(p);
  eq([q.suggestion.targetId, q.suggestion.reason, q.cursor], ['E1', 'nearest', 'E1']);
  assert(q.status.need >= 3 && q.status.chance === (21 - q.status.need) * 5, 'the odds are the real ones');
  s.mechs[0].locks = { 0: 'E2', 1: 'E2' };
  p = newFirePlanner(s, 'player');
  q = plannerQuestion(p);
  eq([q.suggestion.targetId, q.suggestion.reason], ['E2', 'locked'], 'the Bolt follows E2');
  s.mechs[3].pos = [9, 1]; // E2 steps out of the Hammer's reach (6) from P1 (2,4): 9,1 is 7 away (the Bolt reaches 9)
  p = newFirePlanner(s, 'player');
  plannerAccept(p);
  q = plannerQuestion(p);
  eq([q.name, q.suggestion.targetId, q.suggestion.reason, q.suggestion.lockLost], ['HAMMER', 'E1', 'lost-lock-nearest', 'out-of-range']);
});

check('planner: accepting all the way through fires everything at the suggestions, and the plan is valid', () => {
  const s = planState();
  s.mechs[0].locks = { 0: 'E2' };
  const p = newFirePlanner(s, 'player');
  while (!plannerDone(p)) plannerAccept(p);
  eq(plannerShots(p), [
    { mechId: 'P1', weaponSlot: 0, targetId: 'E2' },
    { mechId: 'P1', weaponSlot: 1, targetId: 'E1' },
    { mechId: 'P2', weaponSlot: 0, targetId: 'E1' }]);
  validateFirePlan(s, plannerShots(p));
  resolveFirePhase(s, plannerShots(p), new Rng(4));
  eq(s.mechs[0].locks, { 0: 'E2', 1: 'E1' });
});

check('planner: lock, skip, cycle and hover set the answers, and an invalid target changes nothing', () => {
  const s = planState();
  const p = newFirePlanner(s, 'player');
  const seen = [];
  for (let i = 0; i < 4; i++) { seen.push(plannerQuestion(p).cursor); plannerCycle(p, 1); }
  eq(seen, ['E1', 'E2', 'E1', 'E2'], 'E3 is out of range, so it is never offered');
  plannerCycle(p, -1);
  eq(plannerQuestion(p).cursor, 'E2', 'backwards wraps to the end');
  eq(plannerSetCursor(p, 'E1'), true); eq(plannerQuestion(p).cursor, 'E1');
  eq(plannerSetCursor(p, 'E3'), false, 'out of range'); eq(plannerSetCursor(p, 'P2'), false, 'not an enemy');
  eq(plannerQuestion(p).cursor, 'E1', 'a refused hover changes nothing');
  eq(plannerLock(p, 'E3'), false, 'cannot lock an invalid target');
  eq(whatIsAsked(p), 'P1 BOLT', 'still on the same question');
  eq(plannerLock(p, 'E2'), true);
  eq(p.choices[0], 'E2');
  eq(plannerQuestion(p).cursor, 'E1', 'the cursor starts afresh on the next weapon');
  plannerSkip(p);
  eq(p.choices[1], null);
  plannerCycle(p, 1); plannerAccept(p);
  assert(plannerDone(p));
  eq(plannerShots(p), [{ mechId: 'P1', weaponSlot: 0, targetId: 'E2' }, { mechId: 'P2', weaponSlot: 0, targetId: 'E2' }], 'a skipped weapon is not in the shots');
  throwsKind(PlanError, 'planner-done', () => plannerAccept(p));
  throwsKind(PlanError, 'planner-done', () => plannerSkip(p));
  throwsKind(PlanError, 'planner-done', () => plannerLock(p, 'E1'));
});

check('planner: back undoes the last answer, at every point, keeping the others', () => {
  const s = planState();
  const p = newFirePlanner(s, 'player');
  eq(plannerBack(p), false, 'nothing to undo yet');
  plannerCycle(p, 1); plannerAccept(p);          // Bolt at E2
  plannerSkip(p);                                // Hammer skipped
  plannerAccept(p);                              // Sting at the default
  assert(plannerDone(p));
  eq(plannerBack(p), true); eq(whatIsAsked(p), 'P2 STING');
  eq(plannerBack(p), true); eq(whatIsAsked(p), 'P1 HAMMER', 'the skip is undone');
  eq(p.choices[1], false, 'unanswered again, not skipped');
  eq(p.choices[0], 'E2', 'the Bolt answer is kept');
  plannerCycle(p, 1); plannerAccept(p); plannerAccept(p);
  eq(plannerShots(p).length, 3);
  eq(plannerShots(p)[0].targetId, 'E2');
  while (plannerBack(p)) { /* undo everything */ }
  eq(whatIsAsked(p), 'P1 BOLT');
  eq(p.choices, [false, false, false]);
  eq(plannerBack(p), false, 'cannot go back past the first question');
});

check('planner: planned heat counts the weapons locked so far, and the aim lines run from mech to target', () => {
  const s = planState();
  const p = newFirePlanner(s, 'player');
  eq(plannerHeat(p, s, 'P1'), 0);
  eq(plannerHeat(p, s, 'P1', 3), 3, 'plus the weapon being asked about');
  plannerAccept(p);                              // the Bolt (3)
  eq(plannerHeat(p, s, 'P1'), 3);
  plannerSkip(p);                                // the Hammer, skipped: adds nothing
  eq(plannerHeat(p, s, 'P1'), 3);
  s.mechs[0].heat = 29;
  eq(plannerHeat(p, s, 'P1'), 30, 'capped');
  eq(plannerAimLines(p, s), [{ mechId: 'P1', slot: 0, from: [2, 4], to: [4, 4], targetId: 'E1' }]);
});

// ======================================================================
// the volley timeline and the damage replay
// ======================================================================
// Runs a fight and records every volley (the state before it, its events, the state after) and every end of round.
function fightEvents(seed, model) {
  const s = sampleBattle(model), rng = new Rng(seed), volleys = [], ends = [];
  let rounds = 0;
  while (!s.over && rounds++ < 25) {
    for (const phase of roundPhases(s.first)) {
      if (phase.kind === 'move') {
        for (const mech of livingMechs(s, phase.side)) moveMech(s, aiMoveFor(s, mech.id).plan);
      } else {
        const before = cloneState(s);
        const fire = resolveFirePhase(s, aiPlanFire(s, phase.side).shots, rng);
        volleys.push({ before, fire, after: cloneState(s) });
        if (finishIfOver(s)) break;
      }
    }
    if (s.over) break;
    const before = cloneState(s);
    const end = endRound(s, rng);
    ends.push({ before, end, after: cloneState(s) });
  }
  return { volleys, ends };
}

function sameDamage(a, b, label) {
  for (const m of a.mechs) {
    const o = mechById(b, m.id);
    eq([m.armour, m.rear, m.structure, m.destroyed, m.stripped, m.alive, m.hp, m.weapons.map(w => w.off)], [o.armour, o.rear, o.structure, o.destroyed, o.stripped, o.alive, o.hp, o.weapons.map(w => w.off)], `${label}: ${m.id}`);
  }
}

check('volley: replaying the damage events on the earlier state gives exactly the rules\' state', () => {
  let hits = 0, kills = 0, cookoffs = 0, crits = 0;
  for (const model of ['pool', 'locations']) for (let seed = 1; seed <= 30; seed++) {
    const { volleys, ends } = fightEvents(seed, model);
    for (const v of volleys) {
      const shown = cloneState(v.before);
      for (const e of v.fire) if (isDamageEvent(e)) { applyDamageEvent(shown, e); if (e.type === 'hit') hits++; if (e.type === 'killed') kills++; if (e.type === 'critical') crits++; }
      sameDamage(shown, v.after, `volley, seed ${seed}`);
    }
    for (const e of ends) {
      const shown = cloneState(e.before);
      for (const ev of e.end) if (isDamageEvent(ev)) { applyDamageEvent(shown, ev); if (ev.type === 'cookoff') cookoffs++; }
      sameDamage(shown, e.after, `end of round, seed ${seed}`);
    }
  }
  assert(hits > 400 && kills > 20 && crits > 5, `enough fighting to mean something: ${hits} hits, ${kills} kills, ${crits} criticals (${cookoffs} cook-offs)`);
});

// Plays a volley the way the screen does: every hit lands at its time (ties by the rules' order), applied to a
// copy of the state taken before the phase. The copy must end up exactly as the rules left it.
function playVolleyOn(before, events) {
  const v = buildVolley(events), shown = cloneState(before), due = [];
  for (const s of v.shots) for (const p of s.packets) due.push(p);
  due.sort((a, b) => a.t - b.t || a.order - b.order);
  for (const p of due) { applyDamageEvent(shown, p.hit); for (const x of p.extras) applyDamageEvent(shown, x); }
  return shown;
}

check('volley: playing the shots in the order the screen plays them gives exactly the rules\' state', () => {
  let packets = 0, sameTarget = 0;
  for (const model of ['pool', 'locations']) for (let seed = 1; seed <= 40; seed++) {
    for (const v of fightEvents(seed, model).volleys) {
      sameTarget += v.fire.filter(e => e.type === 'hit').length;
      packets += buildVolley(v.fire).shots.reduce((n, s) => n + s.packets.length, 0);
      sameDamage(playVolleyOn(v.before, v.fire), v.after, `volley, seed ${seed}`);
    }
  }
  assert(packets > 800, 'enough hits to mean something: ' + packets);
});

check('volley: hits on one target are kept in the rules\' order, and keep a gap, even when their shots would cross', () => {
  const s = planState();
  // two mechs hit E1 with weapons whose flights differ: a slow missile pod fired first, a laser fired second
  const events = resolveFirePhase(s, [
    { mechId: 'P1', weaponSlot: 0, targetId: 'E1' }, { mechId: 'P1', weaponSlot: 1, targetId: 'E1' }, { mechId: 'P2', weaponSlot: 0, targetId: 'E1' }], fakeRng([20, 20, 20, 20, 20, 20, 20, 20], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]));
  const v = buildVolley(events);
  const packets = v.shots.flatMap(x => x.packets).sort((a, b) => a.order - b.order);
  assert(packets.length >= 3, 'several hits on E1: ' + packets.length);
  for (let i = 1; i < packets.length; i++) assert(packets[i].t > packets[i - 1].t, `hit ${i} lands after hit ${i - 1}`);
});

check('volley: the timeline has every shot and every hit, in a sensible order, and ends', () => {
  let shots = 0;
  for (let seed = 1; seed <= 12; seed++) {
    for (const r of fightEvents(seed).volleys) {
      const v = buildVolley(r.fire);
      const want = r.fire.filter(e => e.type === 'shot').length;
      eq(v.shots.length, want);
      eq(v.shots.reduce((n, s) => n + s.packets.length, 0), r.fire.filter(e => e.type === 'hit').length, 'one packet per hit event');
      eq(v.shots.reduce((n, s) => n + s.packets.reduce((m, p) => m + p.extras.length, 0), 0),
        r.fire.filter(e => e.type === 'destroyed' || e.type === 'killed' || e.type === 'critical').length, 'every destroyed, killed and critical event is attached to a hit');
      let lastT0 = -1, latest = 0;
      for (const s of v.shots) {
        assert(s.t0 >= lastT0, 'shots start in order'); lastT0 = s.t0;
        for (const p of s.packets) { assert(p.t >= s.t0 + SHOT_FLIGHT[s.kind] - 1e-9, 'lands after it flies'); latest = Math.max(latest, p.t); }
        assert(s.hit === (s.packets.length > 0), 'a shot is a hit exactly when it has packets');
      }
      if (want) {
        assert(v.duration >= latest + VOLLEY_SETTLE - 1e-9, 'lets the last impact play out');
        assert(v.duration <= VOLLEY_MAX_SPAN + SHOT_FLIGHT.missile + 6 * MISSILE_STAGGER + VOLLEY_SETTLE + 1e-9, 'never drags on: ' + v.duration);
      } else {
        eq(v.duration, 0, 'no shots, no time');
      }
      shots += want;
    }
  }
  assert(shots > 100, 'shots checked: ' + shots);
});

check('volley: shots start first weapons first (all mechs), then second weapons', () => {
  const s = planState();
  const events = resolveFirePhase(s, [
    { mechId: 'P1', weaponSlot: 1, targetId: 'E1' }, { mechId: 'P1', weaponSlot: 0, targetId: 'E1' },
    { mechId: 'P2', weaponSlot: 0, targetId: 'E2' }], new Rng(9));
  const v = buildVolley(events);
  eq(v.shots.map(x => `${x.mechId}${x.slot}`), ['P10', 'P20', 'P11']);
});

check('volley: a damage event that would not match the rules is refused, not shown', () => {
  const s = planState();
  const bad = { type: 'hit', targetId: 'E1', steps: [{ loc: 'CT', armour: 99, structure: 0, rear: false }] };
  throwsKind(RulesError, 'volley-drift', () => applyDamageEvent(s, bad));
  throwsKind(RulesError, 'volley', () => buildVolley([{ type: 'destroyed', mechId: 'E1', loc: 'RA' }]));
  throwsKind(RulesError, 'volley', () => buildVolley([{ type: 'hit', targetId: 'E1', steps: [] }]));
  eq(buildVolley([]), { shots: [], duration: 0 });
});

check('ai roles: lights go for water, heavies for cover, mediums for either; rockets cook the hottest target', () => {
  // a strip of clear ground with one water hex and one woods hex both within a light's reach
  const rows = ['..........', '....~.T...', '..........', '..........', '..........'];
  const mk = chassisSpec => {
    const s = makeState(makeMap('roles', rows), [tm('P1', 'player', S_DUMMY, [9, 2]), tm('E1', 'enemy', chassisSpec, [3, 2])]);
    return aiMoveFor(s, 'E1').plan;
  };
  const light = mk(jackal([2, 0, 0]));
  const lastOf = p => p.path.length ? p.path[p.path.length - 1] : null;
  const heavy = mk({ chassis: 5, armour: 2, sinks: 0, weapons: [2, 0, 0] });
  assert(light.path.length > 0 && heavy.path.length > 0, 'both move');
  const t = (state, hex) => terrainAt(state.map, hex[0], hex[1]);
  const s0 = makeState(makeMap('roles', rows), []);
  assert(t(s0, lastOf(light)).cool > 0, 'the light mech ends in water: ' + JSON.stringify(lastOf(light)));
  assert(t(s0, lastOf(heavy)).cover > 0 || t(s0, lastOf(heavy)).cool === 0, 'the heavy does not go for water');
  // missiles pick the hotter of two valid targets, though the other is nearer
  const s = makeState(openMap(16, 9), [tm('E1', 'enemy', S_SWARM, [2, 4]), tm('P1', 'player', S_DUMMY, [5, 4]), tm('P2', 'player', S_DUMMY, [8, 4])]);
  mechById(s, 'P2').heat = 12;
  const fire = aiPlanFire(s, 'enemy').shots;
  eq(fire.map(x => x.targetId), ['P2']);
});

check('describeShot: the roll against the number needed, for hits and misses, with the always-miss and always-hit rolls noted', () => {
  const shot = { mechId: 'P1', weaponId: 2, targetId: 'E2', roll: 7, need: 15 };
  eq(describeShot(shot, 'MISS'), 'P1 BOLT>E2 MISS (7 vs 15+)');
  eq(describeShot({ ...shot, roll: 17 }, '-6'), 'P1 BOLT>E2 -6 (17 vs 15+)');
  eq(describeRoll({ roll: 1, need: 3 }), '1 = JAM');
  eq(describeRoll({ roll: 20, need: 19 }), '20 = CRIT');
  assert(describeShot({ ...shot, roll: 20 }, '-6').length <= 34, 'fits the readout');
  assert(describeShot({ ...shot, roll: 7 }, 'MISS') !== describeShot({ ...shot, roll: 13 }, 'MISS'), 'near misses read differently from wild ones');
});

check('smoke on screen: the volley shows the cloud landing, and the replay matches the rules', () => {
  const s = pair(S_FOG, [2, 2], S_DUMMY, [6, 2]);
  const before = cloneState(s);
  const events = resolveFirePhase(s, [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }], fakeRng([], []));
  const v = buildVolley(events);
  eq(v.shots.length, 1);
  eq([v.shots[0].kind, v.shots[0].packets.length, v.shots[0].packets[0].hit.type], ['smoke', 1, 'smoke']);
  assert(v.shots[0].packets[0].t >= SHOT_FLIGHT.smoke, 'lands after it flies');
  const shown = cloneState(before);
  eq(shown.map.smoke, undefined, 'no cloud before the rocket lands');
  applyDamageEvent(shown, v.shots[0].packets[0].hit);
  eq(shown.map.smoke, s.map.smoke, 'the same cloud as the rules laid');
  assert(isDamageEvent(events[1]), 'a smoke event is replayed with the others');
});

check('ai smoke: a mech screens itself from a shooter, blinds a camper in the water, and otherwise holds the rocket', () => {
  const smokeShot = (state, id) => aiPlanFire(state, 'enemy').shots.filter(x => x.mechId === id && x.weaponSlot === 0);
  const medium = { chassis: 3, armour: 1, sinks: 0, weapons: [8, 0, 0] };
  // an enemy laser has a clear view of it: it smokes itself
  const threatened = makeState(openMap(16, 9), [tm('E1', 'enemy', medium, [9, 4]), tm('P1', 'player', S_BOLT, [4, 4])]);
  eq(smokeShot(threatened, 'E1'), [{ mechId: 'E1', weaponSlot: 0, targetId: 'E1' }]);
  // once the cloud stands the shooter has no view, so it does not smoke again
  const [c, r] = [9, 4];
  addSmoke(threatened.map, smokeHexes(threatened.map, c, r), 2);
  eq(smokeShot(threatened, 'E1'), [], 'already screened');
  // nobody can shoot it and nobody is camping: held
  const calm = makeState(openMap(16, 9), [tm('E1', 'enemy', medium, [9, 4]), tm('P1', 'player', S_DUMMY, [4, 4])]);
  eq(smokeShot(calm, 'E1'), []);
  // an enemy cooling in the water is blinded
  const rows = Array.from({ length: 9 }, (_, y) => (y === 4 ? '....~...........' : '................'));
  const camper = makeState(makeMap('camp', rows), [tm('E1', 'enemy', medium, [9, 4]), tm('P1', 'player', S_DUMMY, [4, 4])]);
  eq(smokeShot(camper, 'E1'), [{ mechId: 'E1', weaponSlot: 0, targetId: 'P1' }]);
  // and the plan it makes is one the rules accept
  const plan = aiPlanFire(camper, 'enemy').shots;
  eq(validateFirePlan(camper, plan).length, plan.length);
});

check('planner: a weaponless mech gets one question of its own; K (self-destruct) drops the mech\'s other weapons, goes in the plan, and Back undoes it', () => {
  const s = planState();
  s.mechs[1].weapons[0].ammo = 0; // P2's only weapon is empty
  const p = newFirePlanner(s, 'player');
  eq(p.items.map(i => `${i.mechId}:${i.name}:${!!i.idle}`), ['P1:BOLT:false', 'P1:HAMMER:false', 'P2:NO WEAPONS:true']);
  // P1 locks the Bolt, then decides to self-destruct at the Hammer: the lock is dropped and P2's question is next
  plannerAccept(p);
  eq(plannerQuestion(p).name, 'HAMMER');
  plannerDestruct(p);
  eq(whatIsAsked(p), 'P2 NO WEAPONS');
  eq(plannerShots(p), [{ mechId: 'P1', destruct: true }]);
  // the idle question: no suggestion, nothing to lock, skipping is fine
  eq([plannerQuestion(p).cursor, plannerQuestion(p).idle], [null, true]);
  eq(plannerLock(p, 'E1'), false, 'nothing can be aimed at');
  plannerDestruct(p);
  eq(plannerShots(p), [{ mechId: 'P1', destruct: true }, { mechId: 'P2', destruct: true }]);
  eq(whatIsAsked(p), 'done');
  // Back takes the last choice back, and then the first
  eq(plannerBack(p), true);
  eq([whatIsAsked(p), plannerShots(p)], ['P2 NO WEAPONS', [{ mechId: 'P1', destruct: true }]]);
  eq(plannerBack(p), true);
  eq([whatIsAsked(p), plannerShots(p)], ['P1 HAMMER', [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }]], 'the Bolt lock is back');
  plannerSkip(p); plannerSkip(p);
  eq(plannerShots(p), [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }]);
  // every plan the planner makes is one the rules accept
  const q = newFirePlanner(planState(), 'player');
  plannerDestruct(q); plannerSkip(q);
  eq(validateFirePlan(planState(), plannerShots(q)).length, plannerShots(q).length);
});

check('self-destruct on screen: the volley shows the blast and the replay matches the rules, in both damage models', () => {
  for (const model of ['pool', 'locations']) {
    const s = bombState(model);
    const before = cloneState(s);
    const events = resolveFirePhase(s, [{ mechId: 'P1', destruct: true }], fakeRng([], [LOCN.CT, LOCN.CT]));
    const v = buildVolley(events);
    eq(v.shots.length, 1);
    eq([v.shots[0].kind, v.shots[0].hexes.length > 0], ['blast', true]);
    eq(v.shots[0].packets.map(pk => pk.hit.targetId), ['E1', 'P2', 'P1']);
    const shown = cloneState(before);
    for (const e of events) if (isDamageEvent(e)) applyDamageEvent(shown, e);
    const view = st => st.mechs.map(m => [m.id, m.alive, m.hp, m.armour, m.structure, m.destroyed]);
    eq(view(shown), view(s), model + ': the picture matches the rules');
  }
});

check('ai self-destruct: a mech with no weapon left blows up beside more enemies than friends, never otherwise, and walks in to get there', () => {
  const map = openMap(16, 9);
  const ring = neighbours(map, 8, 4);
  const dud = { model: 'pool' };
  const mk = (...others) => makeState(map, [tm('E1', 'enemy', S_DUMMY, [8, 4], dud), ...others]);
  const at = (id, side, i, spec) => tm(id, side, spec || jackal([0, 0, 0], 3), [ring[i].c, ring[i].r], dud);
  eq(aiPlanFire(mk(at('P1', 'player', 0)), 'enemy').shots, [{ mechId: 'E1', destruct: true }], 'one enemy beside it');
  eq(aiPlanFire(mk(at('P1', 'player', 0), at('E2', 'enemy', 1)), 'enemy').shots, [], 'a friend is as close as the enemy: no');
  eq(aiPlanFire(mk(at('P1', 'player', 0), at('P2', 'player', 1), at('E2', 'enemy', 2)), 'enemy').shots, [{ mechId: 'E1', destruct: true }], 'two enemies beside one friend: yes');
  eq(aiPlanFire(mk(tm('P1', 'player', S_DUMMY, [14, 8], dud)), 'enemy').shots, [], 'nobody beside it: no');
  // a mech that can still shoot never blows itself up
  const armed = makeState(map, [tm('E1', 'enemy', S_BOLT, [8, 4], dud), at('P1', 'player', 0)]);
  assert(!aiPlanFire(armed, 'enemy').shots.some(x => x.destruct), 'armed: fires instead');
  // far from the enemy it walks closer
  const far = makeState(map, [tm('E1', 'enemy', S_DUMMY, [14, 4], dud), tm('P1', 'player', S_DUMMY, [2, 4], dud)]);
  const plan = aiMoveFor(far, 'E1').plan;
  assert(plan.path.length > 0 && hexDist(plan.path[plan.path.length - 1][0], plan.path[plan.path.length - 1][1], 2, 4) < hexDist(14, 4, 2, 4), 'it closes the distance');
  // two weaponless mechs, one a side, settle it: the fight ends
  const duel = makeState(openMap(16, 9), [tm('P1', 'player', S_DUMMY, [2, 4], dud), tm('E1', 'enemy', S_DUMMY, [13, 4], dud)]);
  const rng = new Rng(5);
  let rounds = 0;
  while (!duel.over && rounds < 40) { playRound(duel, rng); rounds++; }
  assert(duel.over, 'ended after ' + rounds + ' rounds');
});

check('heavy weapons on screen: the replay matches the rules for a howitzer volley and an array volley, in both damage models', () => {
  for (const model of ['pool', 'locations']) {
    const map = openMap(16, 9), o = { model };
    const ring = neighbours(map, 9, 4);
    const s = makeState(map, [
      tm('P1', 'player', jackal([9, 10, 0]), [2, 4], o), tm('E1', 'enemy', jackal([0, 0, 0], 7), [9, 4], o), tm('E2', 'enemy', jackal([0, 0, 0], 7), [ring[3].c, ring[3].r], o),
    ]);
    const before = cloneState(s);
    const plan = [{ mechId: 'P1', weaponSlot: 0, targetId: 'E1' }, { mechId: 'P1', weaponSlot: 1, targetId: 'E1' }];
    const events = resolveFirePhase(s, plan, fakeRng([19, 20, 19], [LOCN.RT, LOCN.RT, LOCN.RT, LOCN.RT, LOCN.RT, LOCN.RT, LOCN.RT, LOCN.RT, LOCN.RT, LOCN.RT]));
    const v = buildVolley(events);
    eq(v.shots.map(sh => sh.kind), ['laser', 'howitzer']);
    const howitzer = v.shots[1];
    assert(howitzer.packets.some(pk => pk.hit.blast), 'the splash is a packet of the howitzer shot');
    const salvo = v.shots[0];
    assert(salvo.packets.length > 1, 'the array lands several beams');
    assert(salvo.packets[1].t > salvo.packets[0].t, 'one after another');
    const shown = cloneState(before);
    for (const e of events) if (isDamageEvent(e)) applyDamageEvent(shown, e);
    const view = st => st.mechs.map(m => [m.id, m.alive, m.hp, m.armour, m.structure]);
    eq(view(shown), view(s), model + ': the picture matches the rules');
  }
});

check('ai: it plans legal shots with the heavy weapons, and holds the howitzer rather than splash more friends than enemies', () => {
  const map = openMap(16, 9);
  const ring = neighbours(map, 9, 4);
  const o = { model: 'pool' };
  const gun = { chassis: 5, armour: 1, sinks: 0, weapons: [10, 9, 0] };
  const base = () => [tm('E1', 'enemy', gun, [2, 4], o), tm('P1', 'player', S_DUMMY, [9, 4], o)];
  const alone = makeState(map, base());
  const plan = aiPlanFire(alone, 'enemy').shots;
  eq(plan.map(x => x.weaponSlot), [0, 1], 'both heavy weapons fire at the player');
  eq(validateFirePlan(alone, plan).length, plan.length);
  // two of its own friends beside the target: the howitzer is held, the array still fires
  const crowded = makeState(map, [...base(), tm('E2', 'enemy', S_DUMMY, [ring[0].c, ring[0].r], o), tm('E3', 'enemy', S_DUMMY, [ring[1].c, ring[1].r], o)]);
  const held = aiPlanFire(crowded, 'enemy');
  eq(held.shots.map(x => x.weaponSlot), [1], 'only the array');
  assert(held.notes.some(n => n.includes('splash')), 'and it says why');
  // an enemy beside the target as well as a friend: the splash is worth it
  const mixed = makeState(map, [...base(), tm('E2', 'enemy', S_DUMMY, [ring[0].c, ring[0].r], o), tm('P2', 'player', S_DUMMY, [ring[2].c, ring[2].r], o)]);
  assert(aiPlanFire(mixed, 'enemy').shots.some(x => x.weaponSlot === 0), 'one friend, one enemy: fire');
});
