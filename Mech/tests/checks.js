'use strict';

// The checks for the Hexfire rules, data and squad code. Runs in a browser (check.html) or in macOS jsc
// (run-jsc.sh). runAllChecks(log) returns { passed, failed, lines } and also logs each line.

const CHECKS = [];
function check(name, fn) { CHECKS.push({ name, fn }); }

function assert(cond, message) { if (!cond) throw new Error('assertion failed: ' + (message || '')); }
function eq(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message || 'values differ'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function throwsKind(Cls, kind, fn) {
  try {
    fn();
  } catch (e) {
    if (!(e instanceof Cls)) throw new Error(`expected ${Cls.name}, got ${e && e.name}: ${e && e.message}`);
    if (e.kind !== kind) throw new Error(`expected kind "${kind}", got "${e.kind}": ${e.message}`);
    return;
  }
  throw new Error(`expected ${Cls.name} (${kind}) but nothing was thrown`);
}

// A random number source that returns the values it is given, and complains if it runs out or is asked for
// something else. d20 values feed rng.d20(); int values feed rng.int(n) (hit locations).
function fakeRng(d20s, ints) {
  const d = d20s.slice(), n = (ints || []).slice();
  return {
    d20() { if (!d.length) throw new Error('fakeRng: out of d20 values'); return d.shift(); },
    int(limit) {
      if (!n.length) throw new Error('fakeRng: out of int values');
      const v = n.shift();
      if (v >= limit) throw new Error(`fakeRng: int ${v} is not below ${limit}`);
      return v;
    },
    left() { return d.length + n.length; },
  };
}
// rng.int(16) values that pick each hit location (weights HD 1, CT 3, RT 2, LT 2, RA 2, LA 2, RL 2, LL 2).
const LOCN = { HD: 0, CT: 1, RT: 4, LT: 6, RA: 8, LA: 10, RL: 12, LL: 14 };

function openMap(cols, rows, fill) { return makeMap('test', Array.from({ length: rows }, () => (fill || '.').repeat(cols))); }
function tm(id, side, spec, pos, opts) {
  const o = opts || {};
  // most of the rules checks are about the location model (hit locations, destroyed limbs), so that is the helper's
  // default; pass { model: 'pool' } for the simple game
  return makeMech(spec, { id, side, pos, facing: o.facing === undefined ? 0 : o.facing, toHit: o.toHit === undefined ? 7 : o.toHit, model: o.model || 'locations' });
}
function jackal(weapons, armour) { return { chassis: 2, armour: armour || 0, sinks: 0, weapons }; }
const S_BOLT = jackal([2, 0, 0]);
const S_HAMMER = jackal([5, 0, 0]);
const S_STING = jackal([6, 0, 0]);
const S_SWARM = jackal([7, 0, 0]);
const S_DUMMY = jackal([0, 0, 0]);

// ======================================================================
// data and builds
// ======================================================================
check('data: ids fit the code, capacities and sizes are consistent, and mounts are real locations', () => {
  eq(MAX_WEAPONS, 3);
  for (const loc of MOUNT_LOCS) assert(LOCATIONS.includes(loc), 'mount location ' + loc);
  assert(MOUNT_LOCS.length >= MAX_WEAPONS, 'a mount for every weapon slot');
  const cap = cls => Math.max(...CHASSIS.filter(c => c.cls === cls).map(c => c.capacity));
  assert(cap('light') <= cap('medium') && cap('medium') <= cap('heavy') && cap('heavy') <= cap('assault'), 'heavier classes carry at least as much');
  eq(['light', 'medium', 'heavy', 'assault'].map(cap), [3, 5, 6, 7], 'the agreed capacities');
  for (const w of WEAPONS) assert(Number.isInteger(w.size) && w.size >= 1 && w.size <= 3, 'weapon size 1 to 3: ' + w.name);
  eq(new Set(CHASSIS.map(c => c.id)).size, CHASSIS.length, 'chassis ids unique');
  for (const c of CHASSIS) {
    assert(c.id >= 1 && c.id <= 15, 'chassis id fits 4 bits: ' + c.name);
    assert(Number.isInteger(c.capacity) && c.capacity >= 3, 'capacity holds at least three small weapons: ' + c.name);
    assert(ARMOUR_COST_PER_LEVEL[c.cls] > 0, 'armour cost for class ' + c.cls);
  }
  eq(new Set(WEAPONS.map(w => w.id)).size, WEAPONS.length, 'weapon ids unique');
  for (const w of WEAPONS) {
    assert(w.id >= 1 && w.id <= 15, 'weapon id fits 4 bits (0 is an empty slot): ' + w.name);
    assert(w.range[0] < w.range[1] && w.range[1] < w.range[2], 'ranges rise: ' + w.name);
    assert(!w.smoke || (w.dmg === 0 && w.kind === 'smoke'), 'smoke does no damage: ' + w.name);
    assert(w.kind !== 'missile' || w.missiles > 0, 'missile pod has missiles: ' + w.name);
  }
  for (const loc of LOCATIONS) {
    assert(HIT_WEIGHTS[loc] > 0 && ARMOUR_PATTERN[loc] > 0 && STRUCTURE_PATTERN[loc] > 0, 'patterns cover ' + loc);
  }
  eq(CLUSTER_SHARE.length, 20, 'cluster table has a share for every d20 roll');
});

check('build: mechCost adds chassis, armour, sinks and weapons', () => {
  // Skitter 12 + armour 2 x 2 + sinks 1 x 3 + Bolt 10 + Rattler 8
  eq(mechCost({ chassis: 1, armour: 2, sinks: 1, weapons: [2, 4, 0] }), 37);
  // Monolith 60 + armour 4 x 5 + nothing else
  eq(mechCost({ chassis: 6, armour: 4, sinks: 0, weapons: [0, 0, 0] }), 80);
});

check('build: validateMech rejects every kind of bad build', () => {
  throwsKind(BuildError, 'chassis', () => validateMech({ chassis: 99, armour: 0, sinks: 0, weapons: [] }));
  throwsKind(BuildError, 'armour', () => validateMech({ chassis: 1, armour: 8, sinks: 0, weapons: [0, 0, 0] }));
  throwsKind(BuildError, 'armour', () => validateMech({ chassis: 1, armour: -1, sinks: 0, weapons: [0, 0, 0] }));
  throwsKind(BuildError, 'armour', () => validateMech({ chassis: 1, armour: 1.5, sinks: 0, weapons: [0, 0, 0] }));
  throwsKind(BuildError, 'sinks', () => validateMech({ chassis: 1, armour: 0, sinks: 8, weapons: [0, 0, 0] }));
  throwsKind(BuildError, 'slots', () => validateMech({ chassis: 1, armour: 0, sinks: 0, weapons: [0, 0] }));
  throwsKind(BuildError, 'slots', () => validateMech({ chassis: 1, armour: 0, sinks: 0, weapons: [0, 0, 0, 0] }));
  throwsKind(BuildError, 'part', () => validateMech({ chassis: 1, armour: 0, sinks: 0, weapons: [15, 0, 0] }));
  eq(validateMech({ chassis: 1, armour: 7, sinks: 7, weapons: [7, 7, 7] }).name, 'SKITTER');
});

check('build: validateSquad checks size and budget', () => {
  const one = { chassis: 1, armour: 0, sinks: 0, weapons: [0, 0, 0] }; // 12 credits
  throwsKind(BuildError, 'count', () => validateSquad([], 'normal'));
  throwsKind(BuildError, 'count', () => validateSquad([one, one, one, one], 'normal'));
  throwsKind(BuildError, 'difficulty', () => validateSquad([one], 'nightmare'));
  eq(validateSquad([one, one, one], 'hard'), 36);
  throwsKind(BuildError, 'budget', () => validateSquad([{ chassis: 6, armour: 7, sinks: 7, weapons: [5, 5, 1] }], 'easy'));
  // capacity: a Jackal carries 3 slots' worth, so a Bolt and a Hammer (2 + 3) do not fit, and a Flicker, Bolt does
  throwsKind(BuildError, 'capacity', () => validateSquad([{ chassis: 2, armour: 0, sinks: 0, weapons: [2, 5, 0] }], 'normal'));
  throwsKind(BuildError, 'capacity', () => validateSquad([{ chassis: 1, armour: 0, sinks: 0, weapons: [7, 7, 0] }], 'normal'));
  eq(validateSquad([{ chassis: 2, armour: 0, sinks: 0, weapons: [1, 2, 0] }], 'normal'), 18 + 4 + 10, 'Flicker + Bolt = 3 slots');
  eq(validateSquad([{ chassis: 6, armour: 0, sinks: 0, weapons: [5, 3, 1] }], 'normal'), 60 + 16 + 18 + 4, 'a full assault: 3 + 3 + 1 = 7');
  eq(slotsUsed({ chassis: 5, armour: 0, sinks: 0, weapons: [2, 4, 8] }), 5);
});

check('build: the enemy squads together use every weight class, and each fits a sensible budget', () => {
  const classes = new Set();
  for (const name of Object.keys(DIFFICULTIES)) for (const spec of ENEMY_SQUADS[name]) classes.add(chassisById(spec.chassis).cls);
  eq([...classes].sort(), ['assault', 'heavy', 'light', 'medium'], 'every class turns up in some enemy squad');
  const cost = name => squadCost(ENEMY_SQUADS[name]);
  assert(cost('easy') < cost('normal') && cost('normal') < cost('hard'), 'the enemy gets stronger with difficulty');
  assert(cost('normal') <= DIFFICULTIES.normal.budget + 5, 'the normal enemy is about what the player can build');
});

check('build: shipped enemy squads are valid builds', () => {
  for (const name of Object.keys(DIFFICULTIES)) {
    const squad = ENEMY_SQUADS[name];
    assert(squad.length >= 1 && squad.length <= SCENARIO.enemyStarts.length, `${name} squad size`);
    squadCost(squad); // validates every mech
  }
});

check('build: heatReport compares heat made with heat shed', () => {
  // Jackal sinks 4, standing 6. Scorcher 6 + Hammer 3 = 9 heat.
  const r = heatReport(jackal([3, 5, 0]));
  eq(r, { perRound: 9, sinks: 4, standingSinks: 6, over: true });
  eq(heatReport(jackal([1, 0, 0])).over, false);
});

check('state: makeMech sizes armour, rear armour and structure from the chassis', () => {
  const m = makeMech({ chassis: 6, armour: 4, sinks: 2, weapons: [3, 5, 2] }, { id: 'P1', side: 'player', pos: [0, 0], facing: 0, toHit: 9 });
  eq(m.armour.CT, 26);              // round(4 x 1.6 x 4)
  eq(m.rear.CT, 10);                // round(26 x 0.4)
  eq(m.rear.RA, 0);                 // only torsos have rear armour
  eq(m.structure.CT, 16);           // round(3.2 x 5)
  eq(m.sinks, 11);                  // 9 + 2 extra
  eq(m.weapons[1], { slot: 1, id: 5, loc: 'LA', ammo: weaponById(5).ammo, off: false, jam: 0 });
  eq(m.weapons.map(w => w.loc), MOUNT_LOCS, 'mounts follow the slot number: right arm, left arm, centre torso');
  eq(m.weapons[0].ammo, null);
  eq(makeMech(jackal([0, 0, 0], 0), { id: 'X', side: 'enemy', pos: [0, 0], facing: 0, toHit: 9 }).armour.CT, 0);
});

check('state: makeState rejects bad starts', () => {
  const map = openMap(5, 5);
  throwsKind(RulesError, 'duplicate-id', () => makeState(map, [tm('A', 'player', S_DUMMY, [0, 0]), tm('A', 'enemy', S_DUMMY, [1, 1])]));
  throwsKind(RulesError, 'start', () => makeState(map, [tm('A', 'player', S_DUMMY, [9, 0])]));
  throwsKind(RulesError, 'start', () => makeState(map, [tm('A', 'player', S_DUMMY, [1, 1]), tm('B', 'enemy', S_DUMMY, [1, 1])]));
  throwsKind(RulesError, 'side', () => makeState(map, [tm('A', 'nobody', S_DUMMY, [1, 1])]));
});

check('state: the scenario map is valid and its starting hexes are clear ground', () => {
  const map = makeMap(SCENARIO.name, SCENARIO.rows);
  for (const [c, r] of SCENARIO.playerStarts.concat(SCENARIO.enemyStarts)) {
    assert(inMap(map, c, r), `start ${c},${r} is on the map`);
    eq(terrainAt(map, c, r).name, 'clear', `start ${c},${r}`);
  }
  const state = battleFor([{ chassis: 3, armour: 2, sinks: 0, weapons: [2, 4, 0] }], 'normal');
  eq(state.mechs.length, 4);
  eq(state.mechs.map(m => m.id), ['P1', 'E1', 'E2', 'E3']);
  eq(state.mechs[1].toHit, 5);
  eq(battleFor([{ chassis: 3, armour: 2, sinks: 0, weapons: [2, 4, 0] }], 'hard').mechs[1].toHit, 3);
  throwsKind(BuildError, 'budget', () => battleFor([{ chassis: 6, armour: 7, sinks: 7, weapons: [5, 5, 1] }], 'normal'));
});

check('scenario: nobody can fire on the first round, and a first move is a fraction of the way across (the first playtest)', () => {
  const map = makeMap(SCENARIO.name, SCENARIO.rows);
  const longestReach = Math.max(...WEAPONS.map(w => w.range[2]));
  const longestRun = Math.max(...CHASSIS.map(c => Math.floor(c.speed * RUN_FACTOR)));
  let closest = Infinity;
  for (const a of SCENARIO.playerStarts) for (const b of SCENARIO.enemyStarts) closest = Math.min(closest, hexDist(a[0], a[1], b[0], b[1]));
  assert(closest > longestReach, `the sides start ${closest} hexes apart, but a weapon reaches ${longestReach}`);
  assert(longestRun * 2 < closest, `two mechs running flat out (${longestRun} + ${longestRun}) could meet in one move from ${closest} apart`);
  assert(longestReach < map.cols * 0.6, `weapon reach ${longestReach} is too much of a map ${map.cols} wide`);
  // every start can get to every enemy start (nothing walls the map in)
  for (const a of SCENARIO.playerStarts) {
    const reach = reachableHexes(map, a, 999, new Set());
    for (const b of SCENARIO.enemyStarts) assert(reach.has(hexKey(b[0], b[1])), `${hexKey(a[0], a[1])} cannot reach ${hexKey(b[0], b[1])}`);
  }
  eq([map.cols, map.rows], [19, 12]);
});

check('map: makeMap rejects bad maps', () => {
  throwsKind(MapError, 'empty', () => makeMap('x', []));
  throwsKind(MapError, 'ragged', () => makeMap('x', ['...', '..']));
  throwsKind(MapError, 'terrain', () => makeMap('x', ['..?']));
  throwsKind(MapError, 'off-map', () => terrainAt(openMap(3, 3), 3, 0));
});

// ======================================================================
// hex maths
// ======================================================================
check('hex: neighbours in each direction, both column parities', () => {
  eq([0, 1, 2, 3, 4, 5].map(d => neighbour(2, 2, d)), [[2, 1], [3, 1], [3, 2], [2, 3], [1, 2], [1, 1]], 'even column');
  eq([0, 1, 2, 3, 4, 5].map(d => neighbour(3, 2, d)), [[3, 1], [4, 2], [4, 3], [3, 3], [2, 3], [2, 2]], 'odd column');
  const map = openMap(8, 8);
  eq(neighbours(map, 3, 3).length, 6);
  eq(neighbours(map, 0, 0).length, 2, 'corner');
  for (let c = 0; c < 6; c++) {
    for (let r = 0; r < 6; r++) {
      for (let d = 0; d < 6; d++) {
        const [nc, nr] = neighbour(c, r, d);
        eq(hexDist(c, r, nc, nr), 1, `neighbour ${d} of ${c},${r} is 1 away`);
        eq(neighbour(nc, nr, (d + 3) % 6), [c, r], `the opposite direction comes back from ${c},${r} dir ${d}`);
      }
    }
  }
});

check('hex: distance', () => {
  eq(hexDist(0, 0, 0, 0), 0);
  eq(hexDist(0, 0, 3, 0), 3);
  eq(hexDist(1, 6, 10, 2), 9);
  eq(hexDist(2, 2, 2, 5), 3);
  for (let i = 0; i < 40; i++) {
    const a = [(i * 7) % 11, (i * 5) % 9], b = [(i * 3) % 13, (i * 11) % 9];
    eq(hexDist(a[0], a[1], b[0], b[1]), hexDist(b[0], b[1], a[0], a[1]), 'symmetric');
  }
});

check('hex: a line runs from end to end, one hex at a time', () => {
  for (let i = 0; i < 40; i++) {
    const a = [(i * 7) % 11, (i * 5) % 9], b = [(i * 3) % 13, (i * 11) % 9];
    const line = hexLine(a, b);
    eq(line.length, hexDist(a[0], a[1], b[0], b[1]) + 1, 'length');
    eq(line[0], a);
    eq(line[line.length - 1], b);
    for (let k = 1; k < line.length; k++) eq(hexDist(line[k - 1][0], line[k - 1][1], line[k][0], line[k][1]), 1, 'adjacent');
  }
});

check('hex: line of sight (woods, hills, symmetry)', () => {
  const clear = openMap(9, 5);
  assert(hasLineOfSight(clear, [0, 2], [8, 2]), 'clear ground');
  // woods in the middle of a row blocks; woods at an end does not
  const woods = makeMap('t', ['.........', '.........', '....T....', '.........', '.........']);
  assert(!hasLineOfSight(woods, [2, 2], [6, 2]), 'woods between blocks');
  assert(hasLineOfSight(woods, [2, 2], [4, 2]), 'woods at the end does not block');
  assert(hasLineOfSight(woods, [4, 2], [4, 0]), 'standing in woods can see out');
  // hills between block, unless an end stands on a hill (straight down column 4, rows 1 and 2 are hills)
  const hills = makeMap('t', ['.....', '....H', '....H', '.....']);
  assert(!hasLineOfSight(hills, [4, 0], [4, 3]), 'two hills between ground and ground block');
  assert(hasLineOfSight(hills, [4, 1], [4, 3]), 'a mech on a hill sees over the next hill');
  assert(hasLineOfSight(hills, [4, 0], [4, 1]), 'looking at a hill');
  // A line of sight is the same both ways, for every pair of hexes on the real map.
  const map = makeMap(SCENARIO.name, SCENARIO.rows);
  let pairs = 0;
  for (let c1 = 0; c1 < map.cols; c1++) for (let r1 = 0; r1 < map.rows; r1++) {
    for (let c2 = 0; c2 < map.cols; c2++) for (let r2 = 0; r2 < map.rows; r2++) {
      eq(hasLineOfSight(map, [c1, r1], [c2, r2]), hasLineOfSight(map, [c2, r2], [c1, r1]), `LOS ${c1},${r1} <-> ${c2},${r2}`);
      pairs++;
    }
  }
  assert(pairs > 10000, 'checked every pair');
});

check('hex: reachable hexes and paths', () => {
  const map = openMap(9, 9);
  eq(reachableHexes(map, [4, 4], 1, new Set()).size, 7, 'start + 6 neighbours');
  eq(reachableHexes(map, [4, 4], 2, new Set()).size, 19, 'start + 6 + 12');
  const woods = makeMap('t', ['.....', '.....', '..T..', '.....', '.....']);
  const reach = reachableHexes(woods, [0, 2], 3, new Set());
  eq(reach.get(hexKey(2, 2)).cost > 2, true, 'going through woods costs more than the distance');
  const blocked = reachableHexes(map, [4, 4], 1, new Set([hexKey(4, 3)]));
  eq(blocked.has(hexKey(4, 3)), false, 'blocked hexes cannot be entered');
  const path = pathTo(reachableHexes(map, [4, 4], 3, new Set()), 7, 4);
  eq(path.length, 3);
  eq(path[path.length - 1], [7, 4]);
  eq(pathCost(map, path), 3);
  throwsKind(MapError, 'unreachable', () => pathTo(reachableHexes(map, [4, 4], 1, new Set()), 8, 8));
});

check('hex: facing and rear attacks', () => {
  for (const [c, r] of [[2, 2], [3, 3]]) {
    for (let d = 0; d < 6; d++) eq(dirToward([c, r], neighbour(c, r, d)), d, `dirToward ${d} from ${c},${r}`);
  }
  const at = [3, 3];
  const behind = neighbour(3, 3, 3); // directly below a target that faces up
  assert(isRearAttack(at, 0, behind), 'directly behind');
  assert(!isRearAttack(at, 0, neighbour(3, 3, 0)), 'directly in front');
  assert(!isRearAttack(at, 0, neighbour(3, 3, 2)), 'the edge of the rear wedge counts as the side');
  assert(!isRearAttack(at, 0, neighbour(3, 3, 4)), 'the other edge');
  assert(isRearAttack(at, 0, [3, 6]), 'three hexes straight behind');
  assert(isRearAttack(at, 2, neighbour(3, 3, 5)), 'facing changes what is behind');
});

// ======================================================================
// movement
// ======================================================================
check('move: allowances (heat, lost legs, shutdown, running)', () => {
  const jk = tm('A', 'player', S_DUMMY, [2, 2]);       // a Jackal
  const speed = chassisById(2).speed;                  // the numbers below follow the data, not a hardcoded speed
  eq(walkAllowance(jk), speed);
  eq(runAllowance(jk), Math.floor(speed * RUN_FACTOR));
  jk.heat = 13; eq(walkAllowance(jk), speed);
  jk.heat = 14; eq(walkAllowance(jk), speed - 1);
  jk.heat = 20; eq(walkAllowance(jk), speed - 2);
  jk.heat = 0;
  jk.destroyed.RL = true;
  eq(walkAllowance(jk), Math.ceil(speed / 2), 'one leg: half, rounded up');
  eq(runAllowance(jk), 0, 'one leg: no running');
  jk.destroyed.LL = true;
  eq(walkAllowance(jk), 0, 'two legs: immobile');
  const mono = tm('B', 'player', S_DUMMY, [3, 3]); mono.chassisId = 6; mono.heat = 25;
  eq(walkAllowance(mono), 1, 'never below 1 while it has a leg to stand on');
  const sd = tm('C', 'player', S_DUMMY, [4, 4]); sd.shutdown = true;
  eq(walkAllowance(sd), 0);
  const dead = tm('D', 'player', S_DUMMY, [5, 5]); dead.alive = false;
  eq(walkAllowance(dead), 0);
  throwsKind(PlanError, 'mode', () => allowanceFor(jk, 'fly'));
});

check('move: validateMovePlan rejects what cannot be done', () => {
  const state = makeState(openMap(12, 9), [tm('P1', 'player', S_DUMMY, [2, 3]), tm('E1', 'enemy', S_DUMMY, [3, 3])]);
  const p = (mode, path) => ({ mechId: 'P1', mode, path });
  validateMovePlan(state, p('stand', []));
  validateMovePlan(state, p('walk', [[2, 2]]));
  throwsKind(PlanError, 'stand-path', () => validateMovePlan(state, p('stand', [[2, 2]])));
  throwsKind(PlanError, 'empty-path', () => validateMovePlan(state, p('walk', [])));
  throwsKind(PlanError, 'mode', () => validateMovePlan(state, p('skip', [[2, 2]])));
  throwsKind(PlanError, 'path', () => validateMovePlan(state, { mechId: 'P1', mode: 'walk' }));
  throwsKind(PlanError, 'not-adjacent', () => validateMovePlan(state, p('walk', [[2, 1]])));
  throwsKind(PlanError, 'occupied', () => validateMovePlan(state, p('walk', [[3, 3]])), 'E1 stands on 3,3');
  throwsKind(PlanError, 'off-map', () => validateMovePlan(state, p('walk', [[2, 2], [2, 1], [2, 0], [2, -1]])));
  throwsKind(PlanError, 'revisit', () => validateMovePlan(state, p('walk', [[2, 2], [2, 3]])), 'back onto the start hex');
  throwsKind(PlanError, 'revisit', () => validateMovePlan(state, p('walk', [[2, 2], [3, 1], [2, 2]])));
  throwsKind(RulesError, 'no-mech', () => validateMovePlan(state, { mechId: 'ZZ', mode: 'stand', path: [] }));
  // too far: a hex that costs more than a walk allows but no more than a run allows
  const reach = reachableFor(state, 'P1', 'run');
  const far = [...reach.values()].find(n => n.cost > walkAllowance(state.mechs[0]));
  const farPath = pathTo(reach, far.c, far.r);
  validateMovePlan(state, p('run', farPath));
  throwsKind(PlanError, 'too-far', () => validateMovePlan(state, p('walk', farPath)));
  // shut down, destroyed, one leg lost
  state.mechs[0].shutdown = true;
  throwsKind(PlanError, 'shutdown', () => validateMovePlan(state, p('walk', [[2, 2]])));
  state.mechs[0].shutdown = false;
  state.mechs[0].destroyed.RL = true;
  throwsKind(PlanError, 'cannot-run', () => validateMovePlan(state, p('run', [[2, 2]])));
  state.mechs[0].alive = false;
  throwsKind(PlanError, 'dead-mech', () => validateMovePlan(state, p('stand', [])));
});

check('move: moveMech walks and runs a mech at once: position, facing, heat, the moved mode and its events', () => {
  const state = makeState(openMap(12, 9), [tm('P1', 'player', S_DUMMY, [2, 3]), tm('P2', 'player', S_DUMMY, [6, 6]), tm('E1', 'enemy', S_DUMMY, [10, 3])]);
  const [p1, p2, e1] = state.mechs;
  const events1 = moveMech(state, { mechId: 'P1', mode: 'walk', path: pathTo(reachableFor(state, 'P1', 'walk'), 4, 3) });
  eq(p1.pos, [4, 3]); eq(p1.heat, 1); eq(p1.moved, 'walk');
  eq(p2.pos, [6, 6], 'nobody else moved');
  const steps1 = events1.filter(e => e.type === 'step');
  eq(steps1.length, 2, 'one step per hex');
  eq([steps1[0].from, steps1[1].to, steps1[0].to], [[2, 3], [4, 3], steps1[1].from], 'the steps chain from the start to the destination');
  eq(events1[events1.length - 1], { type: 'moved', mechId: 'P1', from: [2, 3], to: [4, 3], mode: 'walk' });
  moveMech(state, { mechId: 'P2', mode: 'run', path: pathTo(reachableFor(state, 'P2', 'run'), 6, 3) });
  eq(p2.pos, [6, 3]); eq(p2.heat, 2); eq(p2.moved, 'run'); eq(p2.facing, 0, 'it ran straight up');
  eq(e1.pos, [10, 3]); eq(e1.heat, 0);
});

check('move: standing still adds no heat and no steps, but still records that the mech stood', () => {
  const state = makeState(openMap(8, 5), [tm('P1', 'player', S_DUMMY, [2, 2], { facing: 3 })]);
  const m = state.mechs[0];
  m.moved = 'run';
  const events = moveMech(state, { mechId: 'P1', mode: 'stand', path: [] });
  eq(events, []);
  eq([m.moved, m.heat, m.facing, m.pos], ['stand', 0, 3, [2, 2]]);
  m.shutdown = true; // a shut-down mech can still be told to stand
  moveMech(state, { mechId: 'P1', mode: 'stand', path: [] });
  throwsKind(PlanError, 'shutdown', () => moveMech(state, { mechId: 'P1', mode: 'walk', path: [[2, 1]] }));
});

check('move: heat from moving is capped, and facing follows the last step', () => {
  const state = makeState(openMap(8, 8), [tm('P1', 'player', S_DUMMY, [2, 4], { facing: 0 })]);
  state.mechs[0].heat = 29;
  moveMech(state, { mechId: 'P1', mode: 'run', path: [[3, 4], [4, 4]] });
  eq(state.mechs[0].heat, 30);
  eq(state.mechs[0].facing, dirToward([3, 4], [4, 4]));
});

check('move: mechs move one at a time, so a hex a mech has just taken is occupied, and one it has left is free', () => {
  const state = makeState(openMap(7, 5), [tm('P1', 'player', S_DUMMY, [2, 1]), tm('P2', 'player', S_DUMMY, [3, 3])]);
  moveMech(state, { mechId: 'P1', mode: 'walk', path: [[3, 1]] });
  throwsKind(PlanError, 'occupied', () => moveMech(state, { mechId: 'P2', mode: 'walk', path: [[3, 2], [3, 1]] }));
  eq(state.mechs[1].pos, [3, 3], 'a refused move changes nothing');
  eq(state.mechs[1].heat, 0);
  moveMech(state, { mechId: 'P2', mode: 'walk', path: [[2, 3], [2, 2], [2, 1]] }); // 2,1 is the hex P1 left
  eq(state.mechs[1].pos, [2, 1]);
});

check('move: roundPhases gives move, move, fire, fire, first side first, and the sides swap each round', () => {
  eq(roundPhases('player').map(p => `${p.side} ${p.kind}`), ['player move', 'enemy move', 'player fire', 'enemy fire']);
  eq(roundPhases('enemy').map(p => `${p.side} ${p.kind}`), ['enemy move', 'player move', 'enemy fire', 'player fire']);
  const s = makeState(openMap(8, 5), [tm('P1', 'player', S_BOLT, [1, 1]), tm('E1', 'enemy', S_BOLT, [6, 1])], 'enemy'); // armed, or it would be a stalemate
  eq([s.round, s.first], [1, 'enemy']);
  endRound(s, fakeRng([], []));
  eq([s.round, s.first], [2, 'player']);
  endRound(s, fakeRng([], []));
  eq([s.round, s.first], [3, 'enemy']);
  throwsKind(RulesError, 'first', () => makeState(openMap(8, 5), [tm('P1', 'player', S_DUMMY, [1, 1])], 'nobody'));
  eq(newBattle({ playerSpecs: [S_DUMMY], enemySpecs: [S_DUMMY], enemyToHit: 5, first: 'enemy' }).first, 'enemy');
  eq(battleFor([{ chassis: 3, armour: 2, sinks: 0, weapons: [2, 4, 6] }], 'normal', 'enemy').first, 'enemy');
});

check('move: finishIfOver ends the fight as soon as one side has no mech left', () => {
  const s = makeState(openMap(8, 5), [tm('P1', 'player', S_DUMMY, [1, 1]), tm('E1', 'enemy', S_DUMMY, [6, 1]), tm('E2', 'enemy', S_DUMMY, [6, 3])]);
  eq(finishIfOver(s), false);
  s.mechs[1].alive = false;
  eq([finishIfOver(s), s.over], [false, false], 'one enemy left');
  s.mechs[2].alive = false;
  eq([finishIfOver(s), s.over, s.winner], [true, true, 'player']);
});

check('fire: the result of a volley never depends on the order of the mech list or the plan', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const a = newBattle({ playerSpecs: balanceSquads(120).trio, enemySpecs: balanceSquads(120).trio, enemyToHit: 5 });
    const rng0 = new Rng(seed * 31);
    for (let k = 0; k < 2 + (seed % 5) && !a.over; k++) playRound(a, rng0);
    if (a.over) continue;
    for (const side of ['player', 'enemy']) for (const m of livingMechs(a, side)) moveMech(a, aiMoveFor(a, m.id).plan);
    const b = cloneState(a);
    b.mechs.reverse();
    const sa = [...aiPlanFire(a, 'player').shots, ...aiPlanFire(a, 'enemy').shots];
    const sb = [...aiPlanFire(b, 'player').shots, ...aiPlanFire(b, 'enemy').shots];
    eq(sb.length, sa.length, 'the same plan either way');
    const fa = resolveFirePhase(a, sa, new Rng(seed));
    const fb = resolveFirePhase(b, sb.slice().reverse(), new Rng(seed));
    eq(fb, fa, `fire events, seed ${seed}`);
    eq(b.mechs.slice().sort(byId), a.mechs.slice().sort(byId), `fire state, seed ${seed}`);
  }
});

// ======================================================================
// to-hit and the queries the UI uses
// ======================================================================
function pair(attackerSpec, aPos, targetSpec, tPos, map, opts) {
  return makeState(map || openMap(14, 9), [tm('P1', 'player', attackerSpec, aPos, opts && opts.attacker), tm('E1', 'enemy', targetSpec, tPos, opts && opts.target)]);
}

check('to-hit: need, chance and every modifier', () => {
  // Bolt ranges 3 / 6 / 9. (2,2) to (4,2) is 2 hexes. The tests' pilots have toHit 7 and the dummy is a light mech (+2 for its size), so the base number is 9.
  let s = pair(S_BOLT, [2, 2], S_DUMMY, [4, 2]);
  let st = targetStatus(s, 'P1', 0, 'E1');
  eq([st.valid, st.dist, st.band, st.need, st.chance], [true, 2, 'short', 9, 60]);
  s = pair(S_BOLT, [0, 4], S_DUMMY, [6, 4]);
  eq(targetStatus(s, 'P1', 0, 'E1').band, 'medium'); eq(targetStatus(s, 'P1', 0, 'E1').need, 11, '6 hexes: +2 for range');
  s = pair(S_BOLT, [0, 4], S_DUMMY, [8, 4]);
  st = targetStatus(s, 'P1', 0, 'E1');
  eq([st.band, st.need, st.chance], ['long', 12, 45], '8 hexes: +3 for range');
  s.mechs[0].moved = 'walk'; eq(targetStatus(s, 'P1', 0, 'E1').need, 14, 'attacker walked +2');
  s.mechs[0].moved = 'run'; eq(targetStatus(s, 'P1', 0, 'E1').need, 16, 'attacker ran +4');
  s.mechs[0].moved = 'stand';
  s.mechs[1].moved = 'walk'; eq(targetStatus(s, 'P1', 0, 'E1').need, 14, 'target walked +2');
  s.mechs[1].moved = 'run'; eq(targetStatus(s, 'P1', 0, 'E1').need, 16, 'target ran +4');
  s.mechs[1].moved = 'stand';
  s.mechs[0].heat = 8; eq(targetStatus(s, 'P1', 0, 'E1').need, 14, 'heat 8: +2');
  s.mechs[0].heat = 14; eq(targetStatus(s, 'P1', 0, 'E1').need, 16, 'heat 14: +4');
  s.mechs[0].heat = 20; eq(targetStatus(s, 'P1', 0, 'E1').need, 18, 'heat 20: +6');
  s.mechs[0].heat = 0;
  s.mechs[1].shutdown = true; eq(targetStatus(s, 'P1', 0, 'E1').need, 8, 'shut-down target -4');
  s.mechs[1].shutdown = false;
  // cover: target standing in woods
  const woods = makeMap('t', Array.from({ length: 9 }, (_, r) => (r === 2 ? '..T..' : '.....')));
  s = pair(S_BOLT, [0, 2], S_DUMMY, [2, 2], woods);
  eq(targetStatus(s, 'P1', 0, 'E1').need, 11, 'woods +2');
  eq(targetStatus(s, 'P1', 0, 'E1').mods.map(m => m.name), ['base to-hit', 'target size', 'cover'], 'only modifiers that do something are listed');
});

check('to-hit: the number is clamped to 3..19 (natural 1 misses, natural 20 hits)', () => {
  let s = pair(S_BOLT, [2, 2], S_DUMMY, [4, 2], null, { attacker: { toHit: 1 } });
  s.mechs[1].shutdown = true;
  let st = targetStatus(s, 'P1', 0, 'E1');
  eq([st.need, st.chance], [3, 90], 'best case is 90%');
  s = pair(S_BOLT, [0, 4], S_DUMMY, [8, 4], null, { attacker: { toHit: 17 } });
  st = targetStatus(s, 'P1', 0, 'E1');
  eq([st.need, st.chance], [19, 10], 'worst case is 10%');
});

check('to-hit: reasons a weapon cannot fire at a target', () => {
  const map = makeMap('t', Array.from({ length: 9 }, (_, r) => (r === 4 ? '....T....' : '.........')));
  const s = makeState(map, [
    tm('P1', 'player', jackal([2, 6, 0]), [0, 4]), tm('P2', 'player', S_DUMMY, [0, 6]),
    tm('E1', 'enemy', S_DUMMY, [8, 4]), tm('E2', 'enemy', S_DUMMY, [1, 4]), tm('E3', 'enemy', S_DUMMY, [4, 1]),
  ]);
  eq(targetStatus(s, 'P1', 0, 'P1').reason, 'self');
  eq(targetStatus(s, 'P1', 0, 'P2').reason, 'friendly');
  eq(targetStatus(s, 'P1', 0, 'E1').reason, 'no-line-of-sight', 'woods in the way');
  eq(targetStatus(s, 'P1', 1, 'E2').reason, 'too-close', 'Sting minimum range');
  eq(targetStatus(s, 'P1', 0, 'E2').valid, true, 'a laser can fire point blank');
  eq(targetStatus(s, 'P1', 0, 'E3').valid, true, 'E3 is 5 away, inside the Bolt\'s 9');
  const far = pair(S_BOLT, [0, 4], S_DUMMY, [13, 4]);
  eq(targetStatus(far, 'P1', 0, 'E1').reason, 'out-of-range', '13 hexes is past the Bolt\'s 9');
});

check('to-hit: dead targets and empty slots', () => {
  const s = pair(S_BOLT, [2, 2], S_DUMMY, [4, 2]);
  s.mechs[1].alive = false;
  eq(targetStatus(s, 'P1', 0, 'E1').reason, 'target-dead');
  throwsKind(PlanError, 'no-weapon', () => targetStatus(s, 'P1', 1, 'E1'));
});
