'use strict';

// Checks for the mech bay (bay.js): the changes, the report, the buttons and the code round trip. Loaded after checks-play.js.

const BAY_SQUAD = [
  { chassis: 5, armour: 1, sinks: 0, weapons: [2, 4, 0] },
  { chassis: 2, armour: 1, sinks: 0, weapons: [2, 0, 0] },
  { chassis: 1, armour: 1, sinks: 0, weapons: [1, 1, 0] },
];

function pressId(bay, id) {
  const b = bayButtons(bay).find(x => x.id === id);
  if (!b) throw new Error(`no bay button ${id}`);
  return bayPress(bay, b);
}

check('bay: opens with the squad it is given, and reports its cost, budget and code', () => {
  const bay = newBay(BAY_SQUAD, 'normal');
  const report = bayReport(bay);
  eq(report.cost, squadCost(BAY_SQUAD));
  eq(report.budget, 120);
  eq(report.problems, []);
  eq(decodeSquad(report.code), { difficulty: 'normal', mechs: BAY_SQUAD });
});

check('bay: the report names every reason the squad cannot fight and gives no code', () => {
  const bay = newBay(BAY_SQUAD, 'hard'); // 118 credits against 100
  let report = bayReport(bay);
  assert(report.problems.some(p => p.startsWith('Over budget by 18')), report.problems.join(' / '));
  eq(report.code, null);
  for (let i = 0; i < SQUAD_MAX; i++) bayRemoveMech(bay, i);
  report = bayReport(bay);
  eq(report.problems, ['Add at least one mech']);
});

check('bay: a bad spec in the bay is reported with its mech number, not hidden', () => {
  const bay = newBay(BAY_SQUAD, 'easy');
  bay.mechs[1].weapons = [3, 5, 0]; // a Jackal cannot carry 6 slots
  assert(bayReport(bay).problems.some(p => p.startsWith('Mech 2:')), 'mech 2 should be named');
});

check('bay: changing a chassis keeps armour and sinks and drops only the weapons that no longer fit, and says so', () => {
  const bay = newBay([{ chassis: 5, armour: 3, sinks: 2, weapons: [3, 5, 0] }], 'easy');
  const note = baySetChassis(bay, 0, 2); // Warden (6) to Jackal (3)
  eq(bay.mechs[0], { chassis: 2, armour: 3, sinks: 2, weapons: [3, 0, 0] });
  assert(note.includes('HAMMER'), note);
  const kept = newBay([{ chassis: 5, armour: 1, sinks: 0, weapons: [2, 4, 0] }], 'easy');
  eq(baySetChassis(kept, 0, 6), ''); // to the Monolith everything still fits, nothing to report
  eq(kept.mechs[0].weapons, [2, 4, 0]);
});

check('bay: adding a mech to an empty slot starts it bare and focuses it', () => {
  const bay = newBay([BAY_SQUAD[0]], 'normal');
  baySetChassis(bay, 2, 3);
  eq(bay.mechs[2], { chassis: 3, armour: 1, sinks: 0, weapons: [0, 0, 0] });
  eq(bay.focus, { mech: 2, slot: 0 });
});

check('bay: weapons obey capacity and the heavy-only rule, and say why when refused', () => {
  const bay = newBay([{ chassis: 2, armour: 1, sinks: 0, weapons: [2, 0, 0] }], 'normal'); // Jackal, 3 slots, Bolt takes 2
  throwsKind(BuildError, 'weapon', () => baySetWeapon(bay, 0, 1, 5)); // Hammer is size 3, only 1 free
  throwsKind(BuildError, 'weapon', () => baySetWeapon(bay, 0, 1, 10)); // Howitzer needs a heavy chassis
  baySetWeapon(bay, 0, 1, 1); // a Flicker (size 1) fits
  throwsKind(BuildError, 'weapon', () => baySetWeapon(bay, 0, 0, 3)); // a Scorcher (3) in the Bolt's place fails: the Flicker holds 1
  baySetWeapon(bay, 0, 0, 1); // replacing the Bolt with a Flicker works (the slot's own weapon is not counted twice)
  eq(bay.mechs[0].weapons, [1, 1, 0]);
});

check('bay: a disabled button refuses with its reason instead of changing anything', () => {
  const bay = newBay([{ chassis: 2, armour: 0, sinks: 0, weapons: [0, 0, 0] }], 'normal');
  const before = JSON.stringify(bay);
  const note = pressId(bay, 'armour:0:-1');
  assert(note.includes('already 0'), note);
  const howitzer = pressId(bay, 'weapon:10');
  assert(howitzer.includes('heavy'), howitzer);
  eq(JSON.stringify(bay), before);
});

check('bay: stepping armour or sinks past their limits throws', () => {
  const bay = newBay(BAY_SQUAD, 'easy');
  throwsKind(BuildError, 'armour', () => bayStep(bay, 0, 'armour', ARMOUR_MAX));
  throwsKind(BuildError, 'sinks', () => bayStep(bay, 0, 'sinks', -1));
  throwsKind(BuildError, 'slot', () => bayStep(newBay([BAY_SQUAD[0]], 'easy'), 2, 'armour', 1));
});

check('bay: the buttons all sit on the screen, inside their column, and none overlap', () => {
  const bay = newBay(BAY_SQUAD, 'normal');
  const buttons = bayButtons(bay);
  for (const b of buttons) {
    assert(b.x >= 0 && b.y >= 0 && b.x + b.w <= 1024 && b.y + b.h <= 688, `${b.id} is off the screen`);
    assert(b.tip && b.tip.length > 0, `${b.id} has no tip`);
  }
  for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
    const a = buttons[i], b = buttons[j];
    const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
    assert(apart, `${a.id} overlaps ${b.id}`);
  }
  eq(bayButtonAt(buttons, buttons[0].x + 1, buttons[0].y + 1).id, buttons[0].id);
});

check('bay: pressing the buttons builds a legal squad whose code round-trips', () => {
  const bay = newBay([{ chassis: 1, armour: 1, sinks: 0, weapons: [0, 0, 0] }], 'easy');
  pressId(bay, 'chassis:0:5'); // Warden
  pressId(bay, 'slot:0:0'); pressId(bay, 'weapon:9'); // Array
  pressId(bay, 'slot:0:1'); pressId(bay, 'weapon:10'); // Howitzer
  pressId(bay, 'armour:0:1'); pressId(bay, 'sinks:0:1'); pressId(bay, 'sinks:0:1');
  pressId(bay, 'chassis:1:2');
  pressId(bay, 'slot:1:0'); pressId(bay, 'weapon:2');
  eq(bay.mechs[0], { chassis: 5, armour: 2, sinks: 2, weapons: [9, 10, 0] });
  const report = bayReport(bay);
  eq(report.problems, [], report.problems.join(' / '));
  const loaded = newBay(BAY_SQUAD, 'easy');
  bayLoadCode(loaded, report.code);
  eq(baySquad(loaded), baySquad(bay));
  eq(loaded.difficulty, 'easy');
});

check('bay: a bad code is refused with a typed error and leaves the bay alone', () => {
  const bay = newBay(BAY_SQUAD, 'normal');
  const before = JSON.stringify(bay);
  throwsKind(BuildCodeError, 'chars', () => bayLoadCode(bay, 'not a code'));
  throwsKind(BuildCodeError, 'length', () => bayLoadCode(bay, ''));
  eq(JSON.stringify(bay), before);
});

check('bay: a code with Excel-style padding (spaces, lower case) still loads', () => {
  const bay = newBay(BAY_SQUAD, 'normal');
  const code = bayReport(bay).code;
  const other = newBay([BAY_SQUAD[2]], 'easy');
  bayLoadCode(other, '  ' + code.toLowerCase() + '\r\n');
  eq(baySquad(other), BAY_SQUAD);
});

check('bay: the bay squad goes straight into a battle', () => {
  const bay = newBay(BAY_SQUAD, 'normal');
  const state = battleFor(baySquad(bay), bay.difficulty);
  eq(state.mechs.filter(m => m.side === 'player').length, 3);
});

check('bay: every suggested squad is legal at every difficulty and its code round-trips', () => {
  assert(SUGGESTED_SQUADS.length >= 3, 'there should be several suggestions');
  for (const q of SUGGESTED_SQUADS) {
    for (const d of Object.keys(DIFFICULTIES)) {
      const bay = newBay(q.mechs, d);
      eq(bayReport(bay).problems, [], `${q.name} at ${d}`);
    }
  }
});

check('bay: the suggestions between them use the heavy weapons, rockets and smoke', () => {
  const ids = new Set(SUGGESTED_SQUADS.flatMap(q => q.mechs.flatMap(m => m.weapons)));
  for (const id of [9, 10, 6, 8]) assert(ids.has(id), `no suggestion uses weapon ${id}`);
});

check('bay: pressing a suggestion replaces the squad, keeps the difficulty and clears unused slots', () => {
  const bay = newBay(BAY_SQUAD, 'hard');
  pressId(bay, 'suggest:2'); // one Warden
  eq(baySquad(bay), SUGGESTED_SQUADS[2].mechs);
  eq(bay.mechs[1], null);
  eq(bay.difficulty, 'hard');
  eq(bayReport(bay).problems, []);
});

check('bay: the armour points shown are the health the mech starts a battle with, and rise with each armour level', () => {
  for (const spec of BAY_SQUAD) {
    eq(armourPoints(spec), makeMech(spec, { id: 'P1', side: 'player', pos: [0, 0], facing: 0, toHit: 9 }).maxHp);
  }
  const low = armourPoints({ chassis: 5, armour: 1, sinks: 0, weapons: [0, 0, 0] });
  const high = armourPoints({ chassis: 5, armour: 5, sinks: 0, weapons: [0, 0, 0] });
  assert(high > low, `${high} should be more than ${low}`);
});

check('bay: every weapon has a type badge (laser, projectile, rocket or misc) and the buttons carry it', () => {
  const expected = { FLICKER: 'L', BOLT: 'L', SCORCHER: 'L', ARRAY: 'L', RATTLER: 'P', HAMMER: 'P', HOWITZER: 'P', STING: 'R', SWARM: 'R', FOGGER: 'M' };
  for (const w of WEAPONS) eq(weaponType(w).letter, expected[w.name], w.name);
  const bay = newBay([{ chassis: 5, armour: 1, sinks: 0, weapons: [2, 4, 0] }], 'normal');
  const buttons = bayButtons(bay);
  eq(buttons.filter(b => b.id.startsWith('weapon:') && b.id !== 'weapon:0').every(b => b.badge), true, 'every palette weapon has a badge');
  eq(buttons.find(b => b.id === 'slot:0:0').badge.letter, 'L');
  eq(buttons.find(b => b.id === 'slot:0:1').badge.letter, 'P');
  eq(buttons.find(b => b.id === 'slot:0:2').badge, undefined, 'an empty slot has none');
  assert(buttons.find(b => b.id === 'weapon:6').tip.includes('(rocket)'), 'the tip names the type');
  throwsKind(BuildError, 'weapon-kind', () => weaponType({ name: 'X', kind: 'plasma' }));
});
