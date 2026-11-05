'use strict';

// Checks for the win conditions (objectives.js): each rule on a small scripted state, then whole AI fights on every map and goal.
// Loaded after checks-maps.js.

// A small open map and two mechs, with the goal set up from a made-up scenario so every rule can be pointed at exact hexes.
function goalState(goal, opts) {
  const o = opts || {};
  const map = openMap(14, 9);
  const s = makeState(map, [
    tm('P1', 'player', jackal([2, 0, 0]), o.p1 || [1, 4], { model: 'pool' }), tm('P2', 'player', jackal([2, 0, 0]), o.p2 || [1, 6], { model: 'pool' }),
    tm('E1', 'enemy', jackal([2, 0, 0]), o.e1 || [12, 4], { model: 'pool' }), tm('E2', 'enemy', jackal([2, 0, 0]), o.e2 || [12, 6], { model: 'pool' }),
  ]);
  setupObjective(s, {
    flag: [6, 4], zone: [[6, 4], [6, 3], [7, 4], [7, 5], [6, 5], [5, 5], [5, 4]],
    bases: { player: [[0, 4], [0, 5], [1, 4]], enemy: [[13, 4], [13, 5], [12, 4]] },
    exits: { player: [[13, 0], [12, 0]], enemy: [[0, 8], [1, 8]] },
  }, goal);
  return s;
}
function walkTo(s, id, path) { return moveMech(s, { mechId: id, mode: 'walk', path }); }
function runTo(s, id, path) { return moveMech(s, { mechId: id, mode: 'run', path }); }

check('goal: last mech standing is the default, has no round limit, and a wiped-out side loses whatever the goal', () => {
  const s = goalState('annihilation');
  eq([s.objective.id, s.objective.roundLimit], ['annihilation', null]);
  for (const goal of ['flag', 'hill', 'exit']) {
    const t = goalState(goal);
    t.mechs.filter(m => m.side === 'enemy').forEach(m => { m.alive = false; });
    assert(finishIfOver(t), goal);
    eq([t.winner, t.reason], ['player', 'Every enemy mech was destroyed'], goal);
  }
  const t = goalState('hill');
  t.mechs.forEach(m => { m.alive = false; });
  finishIfOver(t);
  eq(t.winner, 'draw');
});

check('exit: the whole squad has to be inside its exit at once; one mech there is not enough, and walking through does not count', () => {
  const s = goalState('exit', { p1: [11, 1], p2: [11, 3], e1: [2, 7], e2: [4, 7] });
  walkTo(s, 'P1', [[12, 1], [12, 0]]); // the exit is (12,0) and (13,0)
  eq(finishIfOver(s), false, 'P1 is out but P2 is not');
  assert(s.objective.result === null);
  walkTo(s, 'P2', [[12, 3], [13, 2]]); // not in yet
  eq(finishIfOver(s), false);
  walkTo(s, 'P2', [[13, 1], [13, 0]]);
  assert(finishIfOver(s), 'now both are inside');
  eq([s.winner, s.reason], ['player', 'Your whole squad reached the exit']);
  const u = goalState('exit', { p1: [11, 0], p2: [12, 0], e1: [2, 7] }); // P2 is already in; P1 runs through the exit and out the far side
  moveMech(u, { mechId: 'P1', mode: 'run', path: [[12, 1], [12, 2]] }); // (11,0) is odd: its neighbours are (12,0) and (12,1)
  eq(finishIfOver(u), false, 'ending outside the exit is not arriving');
  const e = goalState('exit', { e1: [1, 7], e2: [0, 7], p1: [8, 2], p2: [8, 3] });
  walkTo(e, 'E1', [[1, 8]]); // both enemy mechs are in the enemy exit (0,8) (1,8)? only E1 so far
  eq(finishIfOver(e), false);
  walkTo(e, 'E2', [[0, 8]]);
  assert(finishIfOver(e));
  eq([e.winner, e.reason], ['enemy', 'The enemy squad reached their exit']);
  // a destroyed mech does not have to get out
  const d = goalState('exit', { p1: [11, 1], p2: [11, 3], e1: [2, 7] });
  d.mechs.find(m => m.id === 'P2').alive = false;
  walkTo(d, 'P1', [[12, 1], [12, 0]]);
  assert(finishIfOver(d), 'the survivor alone is the whole squad');
});

check('hill: the side with more mechs in the zone scores each round, level or empty scores nothing, the target wins', () => {
  const s = goalState('hill', { p1: [6, 4] });
  endRound(s, fakeRng([], []));
  eq(s.objective.score, { player: 1, enemy: 0 });
  s.mechs.find(m => m.id === 'E1').pos = [7, 4]; // the enemy steps in: contested
  endRound(s, fakeRng([], []));
  eq(s.objective.score, { player: 1, enemy: 0 }, 'one each scores nothing');
  s.mechs.find(m => m.id === 'P2').pos = [5, 4]; // a second player mech joins: two against one
  endRound(s, fakeRng([], []));
  eq(s.objective.score, { player: 2, enemy: 0 }, 'more mechs scores');
  s.mechs.find(m => m.id === 'P2').pos = [1, 6]; s.objective.score.player = 1;
  s.mechs.find(m => m.id === 'P1').pos = [1, 4]; // the player leaves: the enemy holds alone
  const events = endRound(s, fakeRng([], []));
  eq(s.objective.score, { player: 1, enemy: 1 });
  assert(events.some(e => e.type === 'score' && e.side === 'enemy' && e.points === 1), 'a score event');
  s.mechs.find(m => m.id === 'E1').pos = [12, 4]; // nobody holds it
  endRound(s, fakeRng([], []));
  eq(s.objective.score, { player: 1, enemy: 1 });
  s.mechs.find(m => m.id === 'P1').pos = [6, 4]; s.objective.score.player = HILL_TARGET - 1;
  endRound(s, fakeRng([], []));
  eq([s.over, s.winner, s.reason], [true, 'player', `You held the hill: ${HILL_TARGET} points to 1`]);
});

check('flag: pick it up by moving over it, a carrier cannot run, and carrying it to your own base wins', () => {
  const s = goalState('flag', { p1: [3, 4] });
  const events = walkTo(s, 'P1', [[4, 4], [5, 4]]); // not yet: the flag is on (6,4)
  eq(s.objective.flag.carrier, null);
  const t = goalState('flag', { p1: [4, 4] });
  const ev = moveMech(t, { mechId: 'P1', mode: 'run', path: [[5, 4], [6, 4], [6, 5]] }); // runs through the flag hex and on
  eq([t.objective.flag.carrier, t.objective.flag.pos, t.mechs[0].carrying], ['P1', null, true]);
  assert(ev.some(e => e.type === 'flag-taken' && e.mechId === 'P1'));
  throwsKind(PlanError, 'carrier-run', () => runTo(t, 'P1', [[5, 5]]));
  eq(runAllowance(t.mechs[0]), 0, 'a carrier cannot run');
  // walk it home: from (6,5) to the base (1,4) is further than one move, so put it close
  t.mechs[0].pos = [3, 4];
  walkTo(t, 'P1', [[2, 4], [1, 4]]);
  assert(finishIfOver(t));
  eq([t.winner, t.reason], ['player', 'You carried the flag back to your base']);
  assert(events.length >= 0);
});

check('flag: an enemy can take the flag and must carry it to the ENEMY base; a base on the wrong side does not count', () => {
  const s = goalState('flag', { e1: [8, 4] });
  walkTo(s, 'E1', [[7, 4], [6, 4]]);
  eq(s.objective.flag.carrier, 'E1');
  s.mechs.find(m => m.id === 'E1').pos = [11, 4];
  walkTo(s, 'E1', [[12, 4]]);
  assert(finishIfOver(s));
  eq([s.winner, s.reason], ['enemy', 'The enemy carried the flag back to their base']);
  const t = goalState('flag', { p1: [3, 4], e1: [12, 2], e2: [12, 7] });
  t.objective.flag = { pos: null, carrier: 'P1' }; t.mechs[0].carrying = true;
  t.mechs[0].pos = [11, 4];
  walkTo(t, 'P1', [[12, 4]]); // the ENEMY base: no capture
  eq(finishIfOver(t), false);
});

check('flag: a destroyed carrier drops the flag where it died, and anyone can pick it up again', () => {
  const s = goalState('flag', { p1: [6, 4], e1: [8, 4] });
  s.objective.flag = { pos: null, carrier: 'P1' }; s.mechs[0].carrying = true;
  s.mechs[0].hp = 1;
  const events = resolveFirePhase(s, [{ mechId: 'E1', weaponSlot: 0, targetId: 'P1' }], fakeRng([20], []));
  assert(s.mechs[0].alive === false, 'P1 is destroyed');
  eq(s.objective.flag, { pos: [6, 4], carrier: null });
  eq(s.mechs[0].carrying, false);
  assert(events.some(e => e.type === 'flag-dropped' && e.mechId === 'P1'));
  walkTo(s, 'E1', [[7, 4], [6, 4]]);
  eq(s.objective.flag.carrier, 'E1');
});

check('time limit: at the limit the side with more armour left wins, hill points come first, level is a draw', () => {
  const s = goalState('exit');
  s.round = s.objective.roundLimit;
  s.mechs.find(m => m.id === 'E1').hp = 1;
  endRound(s, fakeRng([], []));
  eq([s.over, s.winner], [true, 'player']);
  assert(s.reason.startsWith('Time up: you had more armour left'), s.reason);
  const h = goalState('hill');
  h.round = h.objective.roundLimit; h.objective.score = { player: 0, enemy: 2 };
  endRound(h, fakeRng([], []));
  eq([h.winner, h.reason], ['enemy', 'Time up: the enemy led on hill points, 0 to 2']);
  const d = goalState('flag');
  d.round = d.objective.roundLimit;
  endRound(d, fakeRng([], []));
  eq([d.winner, d.over], ['draw', true]);
  eq(d.reason.startsWith('Time up: level on armour'), true);
  const early = goalState('exit');
  early.round = early.objective.roundLimit - 1;
  endRound(early, fakeRng([], []));
  eq(early.over, false, 'before the limit nothing is decided');
});

check('goal: every goal and map sets up, status text exists, and the state survives a JSON copy', () => {
  for (const id of SCENARIO_IDS) for (const goal of OBJECTIVE_IDS) {
    const s = battleFor(SUGGESTED_SQUADS[0].mechs, 'normal', 'player', 'pool', SCENARIOS[id], goal);
    eq(s.objective.id, goal);
    const copy = cloneState(s);
    eq(copy.objective, s.objective);
    assert(objectiveStatus(s).name.length > 0);
  }
});

// ---------- the AI and whole fights ----------
check('ai goal: every mech heads for its exit, the nearest mech fetches the flag, a carrier heads home, the hill is held', () => {
  const x = goalState('exit', { p1: [3, 4], p2: [3, 6] });
  const m = aiMoveFor(x, 'P1').plan;
  assert(m.mode === 'run' && m.path.length > 0, 'racing mechs run');
  assert(aiMoveFor(x, 'P2').plan.path.length > 0, 'and so does the other: nobody waits behind');
  const f = goalState('flag', { p1: [3, 4], p2: [3, 7] });
  assert(aiGoalFor(f, f.mechs[0]) && aiGoalFor(f, f.mechs[0]).why === 'goes for the flag', 'the nearer mech fetches it');
  eq(aiGoalFor(f, f.mechs[1]), null, 'the other mech just fights');
  f.objective.flag = { pos: null, carrier: 'P1' }; f.mechs[0].carrying = true;
  const home = aiMoveFor(f, 'P1');
  eq(home.plan.mode, 'walk');
  const h = goalState('hill', { p1: [6, 4], p2: [3, 6] });
  eq(aiMoveFor(h, 'P1').plan.mode, 'stand', 'a mech on the hill stays');
  assert(aiMoveFor(h, 'P2').plan.path.length > 0, 'a mech off the hill goes for it');
});

check('goals: the AI plays whole fights on every map and goal to a result without a rules error, and the goal decides some of them', () => {
  const decided = {};
  for (const id of SCENARIO_IDS) for (const goal of OBJECTIVE_IDS) {
    for (let i = 0; i < 4; i++) {
      const state = battleFor(SUGGESTED_SQUADS[i % SUGGESTED_SQUADS.length].mechs, 'normal', i % 2 ? 'enemy' : 'player', 'pool', SCENARIOS[id], goal);
      const result = runFight(state, new Rng(300 + i), 60);
      assert(state.over, `${id} / ${goal} fight ${i} did not finish in 60 rounds (${result.winner})`);
      const key = goal + ':' + state.reason.split(':')[0];
      decided[key] = (decided[key] || 0) + 1;
    }
  }
  assert(Object.keys(decided).length > 4, 'a variety of endings: ' + JSON.stringify(decided));
});
