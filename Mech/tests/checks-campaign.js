'use strict';

// Checks for the story (campaign.js), the escape goal and reinforcements. Loaded after checks-scroll.js.

check('story: every encounter has a title, a place and its own phrase (all but the last), and the built ones have everything a battle needs', () => {
  eq(CAMPAIGN.length, 7);
  const phrases = new Set();
  CAMPAIGN.forEach((e, i) => {
    assert(e.id && e.title && e.place, `encounter ${i + 1} is missing a name`);
    if (i < CAMPAIGN.length - 1) { assert(e.phrase, `${e.id} has no phrase`); assert(!phrases.has(normalisePhrase(e.phrase)), `${e.id} repeats a phrase`); phrases.add(normalisePhrase(e.phrase)); }
    if (!e.ready) return;
    assert(e.briefing.length && e.debrief.length && e.job, `${e.id} needs a briefing, a job and a debrief`);
    eq(e.squad.length, e.map.playerStarts.length, `${e.id}: a start for every pilot`);
    for (const m of e.squad) { assert(m.pilot, `${e.id}: a squad member has no pilot`); checkCapacity(m.spec); }
  });
  eq(CAMPAIGN[0].ready, true, 'the first encounter is built');
});

check('story: a built encounter\'s starts are on open ground, every start can reach its goal hexes (pad or hangar) and every enemy, and the reinforcements can reach the squad', () => {
  for (const e of CAMPAIGN.filter(x => x.ready)) {
    const s = encounterBattle(e, 'pool');
    for (const m of s.mechs) assert(isPassable(s.map, m.pos[0], m.pos[1]), `${e.id}: ${m.id} starts on ${hexKey(m.pos[0], m.pos[1])}, which cannot be stood on`);
    const goal = s.objective.id === 'escape' ? s.objective.exits.player : s.objective.id === 'raid' ? s.objective.hangar : [s.objective.route[s.objective.route.length - 1]];
    assert(goal.length >= (s.objective.id === 'escape' ? e.squad.length : 1), `${e.id}: the goal needs room`);
    for (const m of s.mechs.filter(x => x.side === 'player' && !x.crawler)) {
      const reach = reachableHexes(s.map, m.pos, 999, new Set());
      assert(goal.some(([c, r]) => reach.has(hexKey(c, r))), `${e.id}: ${m.id} cannot reach the goal`);
      for (const t of s.mechs.filter(x => x.side === 'enemy')) assert([0, 1, 2, 3, 4, 5].some(d => reach.has(hexKey(...neighbour(t.pos[0], t.pos[1], d)))), `${e.id}: ${m.id} cannot get next to ${t.id}`);
    }
    for (const r of s.reserves) {
      const reach = reachableHexes(s.map, r.mech.pos, 999, new Set());
      assert(reach.has(hexKey(...e.map.playerStarts[0])), `${e.id}: reinforcement ${r.mech.id} cannot reach the squad`);
    }
  }
});

check('story: the battle names the pilots, keeps the reinforcements off the map, and uses the mission\'s round limit and first mover', () => {
  const e = encounterById('breakout');
  const s = encounterBattle(e, 'pool');
  eq(s.mechs.filter(m => m.side === 'player').map(callSign), ['VOSS', 'WREN', 'OKAFOR']);
  eq(callSign(mechById(s, 'E1')), 'E1', 'the enemy keeps its ids');
  eq(s.mechs.length, 5, 'three of ours and two of theirs on the map');
  eq(s.reserves.map(r => [r.round, r.mech.id]), [[4, 'E3'], [4, 'E4']]);
  eq([s.objective.id, s.objective.roundLimit, s.first], ['escape', 10, 'player']);
  throwsKind(BuildError, 'encounter', () => encounterBattle(encounterById('dead-ground'), 'pool'));
  throwsKind(BuildError, 'encounter', () => encounterById('nowhere'));
});

check('story: an access phrase ignores case, spaces and dashes, opens the mission after its own, and a wrong one is refused with the reason', () => {
  eq(phraseUnlocks('ASHFALL'), 2);
  eq(phraseUnlocks('  ash fall '), 2);
  eq(phraseUnlocks('open-doors'), 4);
  throwsKind(BuildError, 'phrase', () => phraseUnlocks('swordfish'));
  throwsKind(BuildError, 'phrase', () => phraseUnlocks('   '));
});

check('story: the story screen shows a locked mission as a number only, an open unbuilt one greyed, and ENTER plays the latest built one', () => {
  const b = storyButtons(4);
  const one = b.find(x => x.id === 'mission:breakout'), four = b.find(x => x.id === 'mission:dead-ground'), five = b.find(x => x.id === 'mission:lab');
  eq([one.state, one.label], ['normal', 'BREAKOUT']);
  eq([four.state, four.label], ['disabled', 'DEAD GROUND']);
  assert(four.tip.includes('not built'));
  eq([five.state, five.label], ['disabled', '? ? ?']);
  eq(latestPlayable(4).id, 'column', 'dead ground is open but not built, so ENTER plays the column');
  eq(latestPlayable(1).id, 'breakout');
});

check('escape: the whole living squad on the pad wins; the enemy on the pad does nothing; at the round limit the player has lost', () => {
  const s = goalState('escape', { p1: [11, 1], p2: [11, 3], e1: [2, 7], e2: [4, 7] });
  walkTo(s, 'P1', [[12, 1], [12, 0]]);
  eq(finishIfOver(s), false, 'one of two is out');
  walkTo(s, 'P2', [[12, 3], [13, 2], [13, 1], [13, 0]]);
  assert(finishIfOver(s));
  eq([s.winner, s.reason], ['player', 'Your whole squad got out']);
  const e = goalState('escape', { e1: [13, 1], e2: [12, 1] });
  walkTo(e, 'E1', [[13, 0]]); walkTo(e, 'E2', [[12, 0]]);
  eq(finishIfOver(e), false, 'the pad is not the enemy\'s');
  const t = goalState('escape');
  t.round = t.objective.roundLimit;
  endRound(t, fakeRng([], []));
  eq([t.over, t.winner, t.reason], [true, 'enemy', `Time ran out after round ${t.objective.roundLimit}: not everyone got out`]);
  assert(!OBJECTIVE_IDS.includes('escape'), 'escape is not offered in free play');
});

check('reinforcements: they arrive at the start of their round, on their hex or the nearest free one, and a side waiting for them is not beaten yet', () => {
  const s = goalState('annihilation');
  const spare = (id, pos) => ({ round: 3, mech: tm(id, 'enemy', jackal([2, 0, 0]), pos, { model: 'pool' }) });
  s.reserves = [spare('E3', [1, 4]), spare('E4', [10, 2])]; // E3's hex has P1 standing on it
  s.mechs.filter(m => m.side === 'enemy').forEach(m => { m.alive = false; });
  eq(finishIfOver(s), false, 'two more are coming');
  endRound(s, fakeRng([], [])); // round 1 ends: nobody yet
  eq(s.reserves.length, 2);
  const events = endRound(s, fakeRng([], [])); // round 2 ends, round 3 starts: both arrive
  eq(s.round, 3);
  eq(s.reserves.length, 0);
  eq(events.filter(e => e.type === 'arrive').map(e => e.mechId), ['E3', 'E4']);
  eq(mechById(s, 'E4').pos, [10, 2]);
  const p = mechById(s, 'E3').pos;
  assert(!sameHex(p, [1, 4]) && hexDist(p[0], p[1], 1, 4) === 1, `E3 should step aside to a neighbour, got ${p}`);
  eq(livingMechs(s, 'enemy').map(m => m.id), ['E3', 'E4']);
});

check('story: an AI that only runs for the pad gets out of Breakout often but not always (the mission is tuned for about 60%)', () => {
  const e = encounterById('breakout');
  let out = 0;
  const n = 60;
  for (let seed = 1; seed <= n; seed++) {
    const s = encounterBattle(e, 'pool');
    runFight(s, new Rng(seed), 40);
    assert(s.over, `seed ${seed} never finished`);
    if (s.winner === 'player') out += 1;
  }
  assert(out > n * 0.35 && out < n * 0.85, `the running AI got out ${out} times in ${n}`);
});

// A raid on a small open map: towers T1 and T2 (they never move), one garrison mech, the hangar in the far corner, P2 the runner.
function raidState() {
  const s = makeState(openMap(14, 9), [
    tm('P1', 'player', jackal([2, 0, 0]), [1, 4], { model: 'pool' }), tm('P2', 'player', jackal([2, 0, 0]), [11, 1], { model: 'pool' }),
    tm('E1', 'enemy', jackal([2, 0, 0]), [8, 7], { model: 'pool' }),
    tm('T1', 'enemy', jackal([1, 0, 0]), [6, 4], { model: 'pool' }), tm('T2', 'enemy', jackal([1, 0, 0]), [9, 4], { model: 'pool' }),
  ]);
  s.mechs.filter(m => m.id.startsWith('T')).forEach(m => { m.tower = true; });
  setupObjective(s, { targets: ['T1', 'T2'], hangar: [[13, 0], [12, 0]], runner: 'P2' }, 'raid');
  return s;
}

check('raid: the hangar does nothing while a tower stands; once they are down the runner inside wins, even if it got there first', () => {
  const s = raidState();
  walkTo(s, 'P2', [[11, 0], [12, 0]]); // up, then up-right into the hangar
  eq(finishIfOver(s), false, 'two towers stand');
  eq(objectiveStatus(s).lines.includes('TOWERS STANDING 2 OF 2'), true);
  mechById(s, 'T1').alive = false; mechById(s, 'T2').alive = false;
  const events = [];
  objectiveSync(s, events); // what the fire phase does after the last tower falls
  assert(finishIfOver(s));
  eq([s.winner, s.reason], ['player', 'The towers are down and P2 is in the hangar']);
  eq(events.map(e => e.type), ['hangar']);
});

check('raid: only the runner counts, losing the runner loses the battle, the round limit loses it, and towers never move', () => {
  const s = raidState();
  mechById(s, 'T1').alive = false; mechById(s, 'T2').alive = false;
  mechById(s, 'P1').pos = [12, 1];
  walkTo(s, 'P1', [[12, 0]]);
  eq(finishIfOver(s), false, 'P1 is not the runner');
  const t = raidState();
  mechById(t, 'P2').alive = false; mechById(t, 'P2').hp = 0;
  objectiveSync(t, []);
  assert(finishIfOver(t));
  eq([t.winner, t.reason], ['enemy', 'P2 was destroyed: nobody else can start the heavy']);
  const u = raidState();
  u.round = u.objective.roundLimit;
  endRound(u, fakeRng([], []));
  eq([u.winner, u.reason], ['enemy', `Time ran out after round ${u.objective.roundLimit}: the garrison held the depot`]);
  const v = raidState();
  eq([walkAllowance(mechById(v, 'T1')), runAllowance(mechById(v, 'T1'))], [0, 0]);
  eq(aiMoveFor(v, 'T1').plan.mode, 'stand');
  assert(!OBJECTIVE_IDS.includes('raid'), 'raid is not offered in free play');
});

check('story: the depot puts three gun towers in the yard with the garrison, and OKAFOR is the runner', () => {
  const s = encounterBattle(encounterById('depot'), 'pool');
  eq(s.mechs.filter(m => m.tower).map(m => [m.id, m.name]), [['T1', 'GUN TOWER'], ['T2', 'GUN TOWER'], ['T3', 'GUN TOWER']]);
  eq([s.objective.id, s.objective.runner, callSign(mechById(s, s.objective.runner)), s.objective.targets.length], ['raid', 'P3', 'OKAFOR', 3]);
  eq(s.objective.hangar.length, 8);
});

check('story: an AI playing the depot wins often but not always (tuned for about 55%)', () => {
  let won = 0;
  const n = 60;
  for (let seed = 1; seed <= n; seed++) {
    const s = encounterBattle(encounterById('depot'), 'pool');
    runFight(s, new Rng(seed), 40);
    assert(s.over, `seed ${seed} never finished`);
    if (s.winner === 'player') won += 1;
  }
  assert(won > n * 0.3 && won < n * 0.85, `the AI won ${won} times in ${n}`);
});

// A small map with one repair bay at (5,4), and a damaged P1 standing on it.
function bayState() {
  const rows = Array.from({ length: 9 }, (_, r) => (r === 4 ? '.....W........' : '..............'));
  const s = makeState(makeMap('bays', rows), [
    tm('P1', 'player', jackal([2, 1, 0], 2), [5, 4], { model: 'pool' }), tm('E1', 'enemy', jackal([2, 0, 0], 2), [12, 4], { model: 'pool' }),
  ]);
  const p = mechById(s, 'P1');
  p.hp = p.maxHp - 8; p.weapons[0].off = true;
  return s;
}

check('repair bay: a mech that stood still on it gets armour back (up to its start) and one knocked-out weapon, and the bay loses a charge', () => {
  const s = bayState(), p = mechById(s, 'P1');
  eq(s.map.charges, { '5,4': REPAIR_CHARGES });
  const before = p.hp;
  const events = endRound(s, fakeRng([], []));
  eq(p.hp, before + REPAIR_ARMOUR);
  eq(p.weapons[0].off, false, 'the Bolt is back');
  eq(events.filter(e => e.type === 'repair'), [{ type: 'repair', mechId: 'P1', armour: REPAIR_ARMOUR, weaponId: 2, charges: REPAIR_CHARGES - 1 }]);
  endRound(s, fakeRng([], [])); // 3 points short of full: only those come back
  eq([p.hp, s.map.charges['5,4']], [p.maxHp, REPAIR_CHARGES - 2]);
  const quiet = endRound(s, fakeRng([], [])); // nothing left to fix: no charge used
  eq([quiet.filter(e => e.type === 'repair').length, s.map.charges['5,4']], [0, REPAIR_CHARGES - 2]);
});

check('repair bay: moving on or off it this round repairs nothing, a used-up bay repairs nothing, and the enemy can use one too', () => {
  const s = bayState(), p = mechById(s, 'P1');
  p.moved = 'walk';
  eq(endRound(s, fakeRng([], [])).filter(e => e.type === 'repair').length, 0);
  const t = bayState();
  t.map.charges['5,4'] = 0;
  eq(endRound(t, fakeRng([], [])).filter(e => e.type === 'repair').length, 0);
  const u = bayState();
  const e1 = mechById(u, 'E1'), p1 = mechById(u, 'P1');
  p1.pos = [1, 1]; e1.pos = [5, 4]; e1.hp -= 4;
  eq(endRound(u, fakeRng([], [])).filter(e => e.type === 'repair').map(e => [e.mechId, e.armour]), [['E1', 4]]);
});

check('repair bay: the AI takes a badly damaged mech to a bay in reach and keeps it there while it has something to fix, and says so', () => {
  const s = bayState(), p = mechById(s, 'P1'), e1 = mechById(s, 'E1');
  p.pos = [1, 1];
  e1.pos = [9, 4]; e1.hp = Math.floor(e1.maxHp * 0.4);
  const go = aiMoveFor(s, 'E1');
  eq(go.intent, 'E1 GOES TO REPAIR');
  moveMech(s, go.plan);
  if (!sameHex(e1.pos, [5, 4])) moveMech(s, aiMoveFor(s, 'E1').plan);
  eq(e1.pos, [5, 4], 'it gets there');
  const stay = aiMoveFor(s, 'E1');
  eq([stay.plan.mode, stay.intent], ['stand', 'E1 REPAIRS']);
  e1.hp = e1.maxHp; // fixed: it goes back to fighting
  assert(aiMoveFor(s, 'E1').intent !== 'E1 REPAIRS');
  const far = bayState(), f = mechById(far, 'E1');
  mechById(far, 'P1').pos = [1, 1];
  f.hp = Math.floor(f.maxHp * 0.7); // hurt, but not badly: it fights on
  assert(aiMoveFor(far, 'E1').intent !== 'E1 GOES TO REPAIR');
});

check('escort: the crawler drives three hexes along its road a move, stops short of anyone on the road, and is never asked to fire', () => {
  const s = encounterBattle(encounterById('column'), 'pool');
  const c = mechById(s, s.objective.escort), route = s.objective.route;
  eq([c.pilot, c.crawler, sameHex(c.pos, route[0])], ['CRAWLER', true, true]);
  eq(route.length, 29);
  for (let i = 1; i < route.length; i++) eq(hexDist(...route[i - 1], ...route[i]), 1, 'the road is one joined line');
  const go = aiMoveFor(s, c.id);
  eq(go.plan.path, route.slice(1, 4));
  moveMech(s, go.plan);
  eq(crawlerToGo(s), route.length - 4);
  mechById(s, 'E1').pos = route[5].slice(); // stand on the road two hexes ahead
  const blocked = aiMoveFor(s, c.id);
  eq([blocked.plan.path, blocked.intent], [[route[4]], `${c.id} BLOCKED BY E1`]);
  mechById(s, 'E1').pos = route[4].slice(); // right in front: it waits
  eq(aiMoveFor(s, c.id).plan.mode, 'stand');
  eq(runAllowance(c), 0);
  assert(!newFirePlanner(s, 'player').mechIds.includes(c.id), 'the crawler has no guns and is not asked');
  assert(!aiPlanFire(s, 'player').shots.some(x => x.mechId === c.id), 'nor does it ever blow itself up');
});

check('escort: the crawler at the end of the road wins; the crawler destroyed or the round limit loses', () => {
  const s = encounterBattle(encounterById('column'), 'pool');
  const c = mechById(s, s.objective.escort), route = s.objective.route;
  c.pos = route[route.length - 3].slice();
  moveMech(s, { mechId: c.id, mode: 'walk', path: route.slice(-2) });
  assert(finishIfOver(s));
  eq([s.winner, s.reason], ['player', 'The crawler made it out of the canyon']);
  const t = encounterBattle(encounterById('column'), 'pool');
  mechById(t, t.objective.escort).alive = false;
  objectiveSync(t, []);
  assert(finishIfOver(t));
  eq([t.winner, t.reason], ['enemy', 'The crawler was destroyed']);
  const u = encounterBattle(encounterById('column'), 'pool');
  u.round = u.objective.roundLimit;
  endRound(u, fakeRng([], []));
  eq([u.winner, u.reason], ['enemy', `Time ran out after round ${u.objective.roundLimit}: the crawler is still in the canyon`]);
  assert(!OBJECTIVE_IDS.includes('escort'));
});

check('story: an AI playing the column wins often but not always (tuned for about 55%)', () => {
  let won = 0;
  const n = 60;
  for (let seed = 1; seed <= n; seed++) {
    const s = encounterBattle(encounterById('column'), 'pool');
    runFight(s, new Rng(seed), 40);
    assert(s.over, `seed ${seed} never finished`);
    if (s.winner === 'player') won += 1;
  }
  assert(won > n * 0.3 && won < n * 0.85, `the AI won ${won} times in ${n}`);
});
