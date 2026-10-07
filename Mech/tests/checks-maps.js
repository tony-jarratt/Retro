'use strict';

// Checks for the maps (scenarios.js), the impassable terrain and the hex groups the win conditions use. Loaded after checks-intro.js.

function allHexGroups(s) { return { flag: [s.flag], zone: s.zone, 'player base': s.bases.player, 'enemy base': s.bases.enemy, 'player exit': s.exits.player, 'enemy exit': s.exits.enemy }; }

check('maps: every map is 19 x 12, uses known terrain and has three starts a side on clear ground', () => {
  assert(SCENARIO_IDS.length >= 3, 'basin, urban and mountains');
  for (const id of SCENARIO_IDS) {
    const s = SCENARIOS[id];
    eq(s.id, id);
    const map = makeMap(s.name, s.rows);
    eq([map.cols, map.rows], [19, 12], id);
    eq([s.playerStarts.length, s.enemyStarts.length], [3, 3], id);
    for (const [c, r] of [...s.playerStarts, ...s.enemyStarts]) eq(map.tiles[r][c], '.', `${id}: start ${c},${r} is clear ground`);
    assert(s.name && s.blurb, id + ' has a name and a blurb');
  }
});

check('maps: every start can reach every enemy start, and the sides start at least 11 hexes apart', () => {
  for (const id of SCENARIO_IDS) {
    const s = SCENARIOS[id], map = makeMap(s.name, s.rows);
    for (const from of s.playerStarts) {
      const reach = reachableHexes(map, from, 999, new Set());
      for (const to of s.enemyStarts) {
        assert(reach.has(hexKey(to[0], to[1])), `${id}: ${hexKey(...from)} cannot reach ${hexKey(...to)}`);
        assert(hexDist(from[0], from[1], to[0], to[1]) >= 11, `${id}: starts ${hexKey(...from)} and ${hexKey(...to)} are too close`);
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
  eq(buttons.filter(b => b.id.startsWith('map:')).map(b => b.id), SCENARIO_IDS.map(id => 'map:' + id));
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
    eq(selectPress(sel, selectButtons(sel).find(x => x.id === 'goal:' + id)), '');
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
  const all = [...titleButtons(0), ...selectButtons(newMenuSelection('basin', 'annihilation')), ...campaignButtons()];
  const sets = [titleButtons(0), selectButtons(newMenuSelection('basin', 'annihilation')), campaignButtons()];
  for (const b of all) assert(b.x >= 0 && b.y >= 0 && b.x + b.w <= 1024 && b.y + b.h <= 688, `${b.id} is off the screen`);
  for (const buttons of sets) for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
    const a = buttons[i], b = buttons[j];
    assert(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.id} overlaps ${b.id}`);
  }
});

check('menu: unknown maps and win conditions are typed errors, and the bay names its map and goal', () => {
  throwsKind(BuildError, 'map', () => newMenuSelection('moon', 'annihilation'));
  throwsKind(BuildError, 'goal', () => newMenuSelection('basin', 'tag'));
  const bay = newBay(BAY_SQUAD, 'normal');
  bay.scenarioId = 'urban'; bay.goal = 'annihilation';
  const change = bayButtons(bay).find(b => b.id === 'change');
  eq([change.label, change.sub], ['DEAD CITY', 'LAST MECH STANDING']);
  eq(bayButtons(newBay(BAY_SQUAD, 'normal')).find(b => b.id === 'change').label, 'THE BASIN', 'the default map is the basin');
});
