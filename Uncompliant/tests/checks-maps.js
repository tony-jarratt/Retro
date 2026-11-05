'use strict';

// Checks for the maps (scenarios.js), the impassable terrain and the hex groups the win conditions use. Loaded after checks-intro.js.

function allHexGroups(s) { return { flag: [s.flag], zone: s.zone, 'player base': s.bases.player, 'enemy base': s.bases.enemy, 'player exit': s.exits.player, 'enemy exit': s.exits.enemy }; }

check('maps: every map is 19 x 12 (small) or 31 x 20 (large), uses known terrain and has three starts a side on clear ground', () => {
  eq(SCENARIO_IDS.length, 6, 'three themes in two sizes');
  for (const id of SCENARIO_IDS) {
    const s = SCENARIOS[id];
    eq(s.id, id);
    const map = makeMap(s.name, s.rows);
    eq([map.cols, map.rows], s.size === 'large' ? [31, 20] : [19, 12], id);
    eq(s.id.endsWith('-large'), s.size === 'large', id + ': the id says the size');
    eq(scenarioFor(s.theme, s.size), s, id + ': scenarioFor finds it');
    eq([s.playerStarts.length, s.enemyStarts.length], [3, 3], id);
    for (const [c, r] of [...s.playerStarts, ...s.enemyStarts]) eq(map.tiles[r][c], '.', `${id}: start ${c},${r} is clear ground`);
    assert(s.name && s.blurb, id + ' has a name and a blurb');
  }
});

check('maps: every start can reach every enemy start, and the sides start far apart (11 hexes on a small map, 22 on a large one)', () => {
  for (const id of SCENARIO_IDS) {
    const s = SCENARIOS[id], map = makeMap(s.name, s.rows);
    for (const from of s.playerStarts) {
      const reach = reachableHexes(map, from, 999, new Set());
      for (const to of s.enemyStarts) {
        assert(reach.has(hexKey(to[0], to[1])), `${id}: ${hexKey(...from)} cannot reach ${hexKey(...to)}`);
        assert(hexDist(from[0], from[1], to[0], to[1]) >= (s.size === 'large' ? 22 : 11), `${id}: starts ${hexKey(...from)} and ${hexKey(...to)} are too close`);
      }
    }
  }
});

check('maps: the flag, hill, bases and exits are on the map, passable, reachable from the starts, and each group is joined up', () => {
  for (const id of SCENARIO_IDS) {
    const s = SCENARIOS[id], map = makeMap(s.name, s.rows);
    const reach = reachableHexes(map, s.playerStarts[0], 999, new Set());
    for (const [name, hexes] of Object.entries(allHexGroups(s))) {
      assert(hexes.length >= 1, `${id}: ${name} is empty`);
      for (const [c, r] of hexes) {
        assert(inMap(map, c, r), `${id}: ${name} hex ${c},${r} is off the map`);
        assert(isPassable(map, c, r), `${id}: ${name} hex ${c},${r} is ${terrainAt(map, c, r).name}, which cannot be entered`);
        assert(reach.has(hexKey(c, r)), `${id}: ${name} hex ${c},${r} cannot be reached from the player's starts`);
      }
      // joined up: every hex touches another one of the group (a single hex is trivially fine)
      for (const [c, r] of hexes) {
        if (hexes.length > 1) assert(hexes.some(([c2, r2]) => hexDist(c, r, c2, r2) === 1), `${id}: ${name} hex ${c},${r} stands apart from the rest of its group`);
      }
    }
    eq(s.zone.length, 7, id + ': the hill is seven hexes');
    assert(s.zone.every(([c, r]) => hexDist(c, r, s.flag[0], s.flag[1]) <= 1), id + ': the hill is the flag hex and its neighbours');
    const keys = Object.values(allHexGroups(s)).flat().map(h => hexKey(...h));
    // exits and bases never overlap each other
    const exitKeys = new Set([...s.exits.player, ...s.exits.enemy].map(h => hexKey(...h)));
    assert(![...s.bases.player, ...s.bases.enemy].some(h => exitKeys.has(hexKey(...h))), id + ': a base is also an exit');
    assert(keys.length > 0);
  }
});

check('terrain: buildings and peaks cannot be entered, cannot be seen through, and are drawn', () => {
  for (const letter of ['B', 'M']) {
    eq(TERRAIN[letter].passable, false);
    eq(TERRAIN[letter].blocks, true);
  }
  const map = makeMap('t', ['.....', '..B..', '.....', '..M..', '.....']);
  const reach = reachableHexes(map, [0, 0], 99, new Set());
  eq(reach.has(hexKey(2, 1)), false, 'the building is not in reach');
  eq(reach.has(hexKey(2, 3)), false, 'the peak is not in reach');
  assert(reach.has(hexKey(4, 4)), 'but the far corner is, round them');
  eq(hasLineOfSight(map, [2, 0], [2, 2]), false, 'a building blocks the view');
  eq(hasLineOfSight(map, [2, 2], [2, 4]), false, 'a peak blocks the view');
  eq(isPassable(map, 0, 0), true);
});

check('terrain: a move plan through a building is refused with a typed error naming the terrain', () => {
  const map = makeMap('t', ['.....', '.....', '..B..', '.....', '.....']);
  const s = makeState(map, [tm('P1', 'player', jackal([2, 0, 0]), [1, 2]), tm('E1', 'enemy', S_DUMMY, [4, 4])]);
  throwsKind(PlanError, 'impassable', () => moveMech(s, { mechId: 'P1', mode: 'walk', path: [[2, 2]] }));
  moveMech(s, { mechId: 'P1', mode: 'walk', path: [[1, 3]] }); // a clear hex is fine
});

check('maps: scenarioFor refuses an unknown theme or size with a typed error', () => {
  throwsKind(BuildError, 'map', () => scenarioFor('moon', 'small'));
  throwsKind(BuildError, 'size', () => scenarioFor('basin', 'huge'));
  eq(scenarioFor('basin', 'small'), SCENARIO);
});

check('maps: a battle can be played on any map, with the squad on its starts and the map name in the state', () => {
  for (const id of SCENARIO_IDS) {
    const s = SCENARIOS[id];
    const state = battleFor([{ chassis: 2, armour: 1, sinks: 0, weapons: [2, 0, 0] }], 'normal', 'player', 'pool', s);
    eq(state.scenarioId, id);
    eq(state.map.name, s.name);
    eq(state.mechs.filter(m => m.side === 'player').map(m => m.pos), [s.playerStarts[0]]);
    eq(state.mechs.filter(m => m.side === 'enemy').map(m => m.pos), s.enemyStarts);
  }
  eq(battleFor([{ chassis: 2, armour: 1, sinks: 0, weapons: [2, 0, 0] }], 'normal').scenarioId, DEFAULT_SCENARIO_ID, 'the default map is the basin');
});

check('maps: the AI plays whole fights on every map without a rules error', () => {
  for (const id of SCENARIO_IDS) {
    for (const first of ['player', 'enemy']) {
      const state = battleFor(SUGGESTED_SQUADS[0].mechs, 'normal', first, 'pool', SCENARIOS[id]);
      const result = runFight(state, new Rng(77), 60);
      assert(result.rounds > 0, id);
    }
  }
});

// ---------- the menus ----------
check('menu: the title has FREE PLAY and STORY side by side, and the focus marks the one ENTER presses', () => {
  const b = titleButtons(0);
  eq(b.map(x => x.id), ['play', 'story']);
  eq(b.map(x => x.state), ['selected', 'normal']);
  eq(titleButtons(1).map(x => x.state), ['normal', 'selected']);
  assert(b[0].x + b[0].w < b[1].x, 'they do not overlap');
});

check('menu: the select screen has a card for every map and win condition, and choosing one acts at once', () => {
  const sel = newMenuSelection('basin', 'annihilation');
  let buttons = selectButtons(sel);
  eq(buttons.filter(b => b.id.startsWith('map:')).map(b => b.id), MAP_THEMES.map(id => 'map:' + id));
  eq(buttons.filter(b => b.id.startsWith('size:')).map(b => [b.id, b.state]), [['size:small', 'selected'], ['size:large', 'normal']]);
  selectPress(sel, buttons.find(b => b.id === 'size:large'));
  eq(sel.size, 'large');
  eq(selectButtons(sel).find(b => b.id === 'size:large').state, 'selected');
  eq(selectButtons(sel).find(b => b.id === 'map:basin').sub, scenarioFor('basin', 'large').blurb, 'the cards show the chosen size');
  sel.size = 'small';
  eq(buttons.filter(b => b.id.startsWith('goal:')).map(b => b.id), OBJECTIVE_IDS.map(id => 'goal:' + id));
  eq(buttons.find(b => b.id === 'map:basin').state, 'selected');
  selectPress(sel, buttons.find(b => b.id === 'map:urban'));
  eq(sel.map, 'urban');
  buttons = selectButtons(sel);
  eq(buttons.find(b => b.id === 'map:urban').state, 'selected');
  eq(buttons.find(b => b.id === 'map:basin').state, 'normal');
  assert(buttons.some(b => b.id === 'continue') && buttons.some(b => b.id === 'back'));
});

check('menu: every win condition can be chosen, and one that is not ready would be greyed with its reason', () => {
  const sel = newMenuSelection('basin', 'annihilation');
  for (const id of OBJECTIVE_IDS) {
    eq(OBJECTIVES[id].ready, true, id + ' is playable');
    selectPress(sel, selectButtons(sel).find(x => x.id === 'goal:' + id));
    eq(sel.goal, id);
  }
  OBJECTIVES.annihilation.ready = false; // pretend one is unfinished
  try {
    const b = selectButtons(sel).find(x => x.id === 'goal:annihilation');
    eq(b.state, 'disabled');
    assert(selectPress(sel, b).includes('not playable yet'));
    eq(sel.goal, 'exit', 'a disabled card changes nothing');
  } finally { OBJECTIVES.annihilation.ready = true; }
});

check('menu: the cards sit on the screen and none overlap', () => {
  const all = [...titleButtons(0), ...selectButtons(newMenuSelection('basin', 'annihilation')), ...storyButtons(1), ...briefingButtons(encounterById('core'), 'VOSS'), ...debriefButtons()];
  const sets = [titleButtons(0), selectButtons(newMenuSelection('basin', 'annihilation')), storyButtons(1), briefingButtons(encounterById('core'), 'VOSS'), debriefButtons()];
  for (const b of all) assert(b.x >= 0 && b.y >= 0 && b.x + b.w <= 1024 && b.y + b.h <= 688, `${b.id} is off the screen`);
  for (const buttons of sets) for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
    const a = buttons[i], b = buttons[j];
    assert(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.id} overlaps ${b.id}`);
  }
});

check('menu: unknown maps and win conditions are typed errors, and the bay names its map and goal', () => {
  throwsKind(BuildError, 'map', () => newMenuSelection('moon', 'annihilation'));
  throwsKind(BuildError, 'goal', () => newMenuSelection('basin', 'tag'));
  throwsKind(BuildError, 'size', () => newMenuSelection('basin', 'annihilation', 'huge'));
  const bay = newBay(BAY_SQUAD, 'normal');
  bay.scenarioId = 'urban'; bay.goal = 'annihilation';
  const change = bayButtons(bay).find(b => b.id === 'change');
  eq([change.label, change.sub], ['DEAD CITY', 'LAST MECH STANDING']);
  eq(bayButtons(newBay(BAY_SQUAD, 'normal')).find(b => b.id === 'change').label, 'THE BASIN', 'the default map is the basin');
});

check('menu: the small maps are only for last mech standing: other goals need a large map, the menu says so and moves you there', () => {
  eq(OBJECTIVES.annihilation.sizes, ['small', 'large']);
  for (const goal of ['flag', 'hill', 'exit']) eq(OBJECTIVES[goal].sizes, ['large'], goal);
  throwsKind(BuildError, 'size-goal', () => newMenuSelection('basin', 'flag', 'small'));
  newMenuSelection('basin', 'annihilation', 'small'); // fine
  newMenuSelection('basin', 'flag', 'large');         // fine
  const sel = newMenuSelection('urban', 'annihilation', 'small');
  eq(selectButtons(sel).find(b => b.id === 'size:small').state, 'selected', 'small is on offer for a straight fight');
  const note = selectPress(sel, selectButtons(sel).find(b => b.id === 'goal:hill'));
  assert(note.includes('needs room') && note.includes('LARGE'), note);
  eq([sel.goal, sel.size], ['hill', 'large'], 'choosing the hill took the selection to the large map');
  const small = selectButtons(sel).find(b => b.id === 'size:small');
  eq(small.state, 'disabled');
  assert(small.tip.includes('only for LAST MECH STANDING'), small.tip);
  const before = JSON.stringify(sel);
  assert(selectPress(sel, small).includes('LAST MECH STANDING'), 'a disabled SMALL says why');
  eq(JSON.stringify(sel), before, 'and changes nothing');
  selectPress(sel, selectButtons(sel).find(b => b.id === 'goal:annihilation'));
  eq(sel.size, 'large', 'going back to a straight fight leaves the size as it is');
  selectPress(sel, selectButtons(sel).find(b => b.id === 'size:small'));
  eq(sel.size, 'small', 'and small is available again');
});

// ---------- map features (free play: repair bays, ammo caches, a sensor tower) ----------
check('features: every map has a bay and a cache a side, mirrored, and one sensor tower on the middle column, on ground a mech can stand on and reach', () => {
  for (const id of SCENARIO_IDS) {
    const s = SCENARIOS[id], cols = s.rows[0].length;
    const f = scenarioFor(s.theme, s.size, true);
    eq(f.withFeatures, true, id);
    eq(f.features.map(x => x[2]).sort().join(''), 'AASWW', `${id}: two bays, two caches, one tower`);
    for (const t of ['W', 'A']) {
      const [a, b] = f.features.filter(x => x[2] === t);
      eq([b[0], b[1]], [cols - 1 - a[0], a[1]], `${id}: the enemy's ${TERRAIN[t].name} is the mirror of the player's`);
      assert(a[0] < cols / 2, `${id}: the first ${TERRAIN[t].name} is on the player's half`);
    }
    const map = makeMap(f.name, f.rows);
    for (const [c, r, t] of f.features) {
      eq(map.tiles[r][c], t, `${id}: ${hexKey(c, r)}`);
      const pr = reachableHexes(map, s.playerStarts[0], 999, new Set()), er = reachableHexes(map, s.enemyStarts[0], 999, new Set());
      assert(pr.has(hexKey(c, r)) && er.has(hexKey(c, r)), `${id}: both sides can reach the ${TERRAIN[t].name} at ${hexKey(c, r)}`);
    }
    eq(sensorHexes(map), [f.features.find(x => x[2] === 'S').slice(0, 2)]);
    eq(Object.keys(map.charges).length, 4, `${id}: the bays and caches have charges`);
    eq(scenarioFor(s.theme, s.size).rows, s.rows, `${id}: without features the map is unchanged`);
    eq(sensorHexes(makeMap(s.name, s.rows)).length, 0);
  }
});

check('features: a side with a living mech on the sensor tower gets -1 on every shot; the other side does not; a destroyed holder gives nothing', () => {
  const rows = Array.from({ length: 9 }, (_, r) => r === 7 ? '.S............' : '..............');
  const s = makeState(makeMap('test', rows), [
    tm('P1', 'player', jackal([2, 0, 0]), [4, 4], { model: 'pool' }), tm('P2', 'player', jackal([2, 0, 0]), [1, 5], { model: 'pool' }),
    tm('E1', 'enemy', jackal([2, 0, 0]), [7, 4], { model: 'pool' }),
  ]);
  const shot = (a, t) => targetStatus(s, a, 0, t);
  const before = { p: shot('P1', 'E1'), e: shot('E1', 'P1') };
  eq([holdsSensor(s, 'player'), before.p.mods.some(m => m.name === 'sensor tower')], [false, false], 'nobody on the tower: no bonus');
  mechById(s, 'P2').pos = [1, 7];
  eq(holdsSensor(s, 'player'), true);
  const held = shot('P1', 'E1');
  eq(held.need, before.p.need - 1);
  const mod = held.mods.find(m => m.name === 'sensor tower');
  eq(mod && mod.value, -1, 'the shot breakdown names it');
  eq(shot('E1', 'P1').need, before.e.need, 'the enemy does not get it');
  mechById(s, 'P2').alive = false;
  eq(shot('P1', 'E1').need, before.p.need, 'the holder destroyed: the bonus is gone');
  mechById(s, 'P2').alive = true;
  eq(objectiveStatus(s).lines.slice(-1), ['SENSOR TOWER: YOURS (-1 TO HIT)']);
});

check('features: the AI sends its one mech nearest a free sensor tower (in range) and that mech stays on it; the rest fight', () => {
  const rows = Array.from({ length: 9 }, (_, r) => r === 4 ? '......S.......' : '..............');
  const s = makeState(makeMap('test', rows), [
    tm('P1', 'player', jackal([2, 0, 0]), [1, 2], { model: 'pool' }),
    tm('E1', 'enemy', jackal([2, 0, 0]), [10, 4], { model: 'pool' }), tm('E2', 'enemy', jackal([2, 0, 0]), [12, 7], { model: 'pool' }),
  ]);
  setupObjective(s, {}, 'annihilation');
  eq(aiSensorGoal(s, mechById(s, 'E1')).intent, 'E1 GOES FOR THE SENSOR TOWER');
  eq(aiSensorGoal(s, mechById(s, 'E2')), null, 'only the nearest one goes');
  mechById(s, 'E1').pos = [6, 4];
  eq(aiSensorGoal(s, mechById(s, 'E1')).intent, 'E1 HOLDS THE SENSOR TOWER');
  eq(aiMoveFor(s, 'E1').plan.mode, 'stand', 'the holder stays put');
  eq(aiSensorGoal(s, mechById(s, 'E2')), null, 'the side holds it: nobody else goes');
});

check('features: the select screen turns them on and off, the map cards and the bay say so, and a battle with them has the bays and the tower', () => {
  const sel = newMenuSelection('basin', 'annihilation', 'large');
  eq(sel.features, false, 'off to start with');
  let b = selectButtons(sel).find(x => x.id === 'features');
  eq([b.label, b.state], ['FEATURES: OFF', 'normal']);
  selectPress(sel, b);
  b = selectButtons(sel).find(x => x.id === 'features');
  eq([sel.features, b.label, b.state], [true, 'FEATURES: ON', 'selected']);
  const bay = newBay(BAY_SQUAD, 'normal');
  bay.scenarioId = 'urban'; bay.goal = 'annihilation'; bay.features = true;
  eq(bayButtons(bay).find(x => x.id === 'change').sub, 'LAST MECH STANDING + FEATURES');
  const state = battleFor(SUGGESTED_SQUADS[0].mechs, 'normal', 'player', 'pool', scenarioFor('urban', 'large', true));
  eq(sensorHexes(state.map).length, 1);
  eq(Object.keys(state.map.charges).length, 4);
  for (const id of SCENARIO_IDS) { // whole fights on every map with features, without a rules error
    const s = SCENARIOS[id];
    assert(runFight(battleFor(SUGGESTED_SQUADS[0].mechs, 'normal', 'player', 'pool', scenarioFor(s.theme, s.size, true)), new Rng(31), 60).rounds > 0, id);
  }
});

// ---------- infantry (free play: the INFANTRY switch) ----------
// A small map with a building at [6, 2] and woods at [6, 6]: P1 and E1 are mechs, I1 ours and J1 theirs are squads.
function squadState(at) {
  const rows = Array.from({ length: 9 }, (_, r) => r === 2 ? '......B.......' : r === 6 ? '......T.......' : '..............');
  const a = at || {};
  const s = makeState(makeMap('test', rows), [
    tm('P1', 'player', jackal([2, 0, 0]), a.p1 || [1, 4], { model: 'pool' }), tm('E1', 'enemy', jackal([2, 0, 0]), a.e1 || [12, 4], { model: 'pool' }),
    makeSquad('I1', 'player', a.i1 || [3, 4], 2), makeSquad('J1', 'enemy', a.j1 || [10, 4], 5),
  ]);
  setupObjective(s, {}, 'annihilation');
  return s;
}

check('infantry: a squad has one armour point, walks 3, never runs, can go into a building (a mech cannot), and does not count as a mech left', () => {
  const s = squadState({ i1: [5, 2] });
  const i1 = mechById(s, 'I1');
  eq([i1.infantry, i1.hp, i1.maxHp, i1.model, walkAllowance(i1), runAllowance(i1)], [true, 1, 1, 'pool', 3, 0]);
  assert(reachableFor(s, 'I1', 'walk').has('6,2'), 'the squad can step into the building');
  mechById(s, 'P1').pos = [7, 2];
  throwsKind(PlanError, 'impassable', () => moveMech(s, { mechId: 'P1', mode: 'walk', path: [[6, 2]] }));
  moveMech(s, { mechId: 'I1', mode: 'walk', path: [[6, 2]] });
  eq(mechById(s, 'I1').pos, [6, 2]);
  eq(mechsLeft(s, 'player'), 1, 'the squad is not a mech');
  mechById(s, 'P1').alive = false;
  eq(checkWinner(s), 'enemy', 'a side with only squads left has lost');
});

check('infantry: rifles fire only at enemy squads within 2 hexes: 50% in the open, 35% in woods, 25% in a building; one hit destroys', () => {
  const s = squadState({ i1: [4, 4], j1: [6, 4] });
  eq(targetStatus(s, 'I1', 0, 'J1').chance, 50);
  eq(targetStatus(s, 'I1', 0, 'E1').reason, 'out-of-range');
  mechById(s, 'E1').pos = [5, 5];
  eq(targetStatus(s, 'I1', 0, 'E1').reason, 'not-a-squad');
  mechById(s, 'J1').pos = [6, 6]; mechById(s, 'I1').pos = [5, 5]; mechById(s, 'E1').pos = [12, 4];
  eq(targetStatus(s, 'I1', 0, 'J1').chance, 35, 'in the woods');
  mechById(s, 'J1').pos = [6, 2]; mechById(s, 'I1').pos = [5, 2];
  eq(targetStatus(s, 'I1', 0, 'J1').chance, 25, 'in a building');
  mechById(s, 'J1').pos = [6, 4]; mechById(s, 'I1').pos = [4, 4];
  const events = resolveFirePhase(s, [{ mechId: 'I1', weaponSlot: 0, targetId: 'J1' }], fakeRng([15], []));
  eq(events.some(e => e.type === 'killed' && e.mechId === 'J1'), true);
});

check('infantry: a mech shooting a squad uses its cover in place of size and cover; a mech prefers a mech target; spotting is -1 and guides rockets', () => {
  const s = squadState({ p1: [2, 4], j1: [6, 4], e1: [6, 7] });
  const open = targetStatus(s, 'P1', 0, 'J1');
  eq(open.mods.some(m => m.name === 'target size' || m.name === 'dug in'), false, 'in the open: no size bonus, no cover');
  mechById(s, 'J1').pos = [6, 6];
  eq(targetStatus(s, 'P1', 0, 'J1').mods.find(m => m.name === 'dug in').value, 3);
  eq(defaultTarget(s, 'P1', 0).targetId, 'E1', 'the mech before the squad');
  mechById(s, 'I1').pos = [10, 7]; // out of sight of E1? within 6 and clear: it spots
  const spotted = targetStatus(s, 'P1', 0, 'E1');
  eq(spotted.mods.find(m => m.name === 'spotted').value, -1);
  mechById(s, 'I1').alive = false;
  eq(targetStatus(s, 'P1', 0, 'E1').need, spotted.need + 1, 'no spotter, no bonus');
});

check('infantry: the AI takes a free sensor tower with a squad, spots from cover near its mechs, and goes for an enemy squad spotting by its mechs', () => {
  const rows = Array.from({ length: 9 }, (_, r) => r === 4 ? '.......S......' : r === 6 ? '...T..........' : '..............');
  const s = makeState(makeMap('test', rows), [
    tm('P1', 'player', jackal([2, 0, 0]), [1, 6], { model: 'pool' }), tm('E1', 'enemy', jackal([2, 0, 0]), [9, 6], { model: 'pool' }),
    makeSquad('I1', 'player', [5, 4], 2), makeSquad('I2', 'player', [1, 7], 2),
  ]);
  setupObjective(s, {}, 'annihilation');
  eq(aiMoveFor(s, 'I1').intent, 'I1 GOES FOR THE SENSOR TOWER');
  eq(aiMoveFor(s, 'I2').intent, 'I2 MOVES UP TO SPOT', 'the other squad makes for the woods beside P1');
  mechById(s, 'I2').pos = [3, 6];
  eq(aiMoveFor(s, 'I2').intent, 'I2 SPOTS FROM THE WOODS');
  eq(aiMoveFor(s, 'I2').plan.mode, 'stand');
  s.mechs.push(makeSquad('J1', 'enemy', [0, 4], 5)); // an enemy squad within 4 of P1, nearer I2 than I1
  eq(aiMoveFor(s, 'I2').intent, 'I2 GOES FOR THEIR SQUAD J1');
  eq(aiMoveFor(s, 'E1').plan.mechId, 'E1', 'a mech still plans its own move');
});

check('infantry: the select screen switch adds two squads a side, and whole AI fights with them run on every map without a rules error', () => {
  const sel = newMenuSelection('basin', 'annihilation', 'large');
  eq(selectButtons(sel).find(b => b.id === 'infantry').label, 'INFANTRY: OFF');
  selectPress(sel, selectButtons(sel).find(b => b.id === 'infantry'));
  eq([sel.infantry, selectButtons(sel).find(b => b.id === 'infantry').label], [true, 'INFANTRY: ON']);
  for (const id of SCENARIO_IDS) for (const goal of ['annihilation', 'flag', 'hill', 'exit']) {
    const sc = SCENARIOS[id];
    if (!goalAllowsSize(goal, sc.size)) continue;
    const st = addSquads(battleFor(SUGGESTED_SQUADS[0].mechs, 'normal', 'player', 'pool', scenarioFor(sc.theme, sc.size, true), goal), sc);
    eq(st.mechs.filter(m => m.infantry).map(m => m.id), ['I1', 'I2', 'J1', 'J2'], id);
    assert(runFight(st, new Rng(11), 60).rounds > 0, `${id} ${goal}`);
  }
});
