'use strict';

// The mech bay: where you build your squad before a battle. Pure logic and layout (no drawing, no DOM), so it can be tested.
// A bay is { difficulty, mechs: [spec | null, spec | null, spec | null], focus: { mech, slot } }. A spec is the same
// { chassis, armour, sinks, weapons: [id, id, id] } the rules use, so the squad goes straight into a battle or the squad code.
// Every click is applied at once (there is nothing to confirm). A button that cannot be used right now is drawn greyed with the
// reason as its tip, so a refused choice is always explained on screen.

const BAY_COLUMN_W = 320, BAY_COLUMN_GAP = 12, BAY_LEFT = 16, BAY_COLUMN_Y = 90, BAY_COLUMN_H = 380;
const BAY_PALETTE_Y = 478;

// The badge on every weapon in the bay: laser, projectile (cannons and the howitzer), rocket (missile pods) or misc (smoke).
const WEAPON_TYPES = {
  laser: { letter: 'L', name: 'LASER', colour: '#ff7b6b' },
  projectile: { letter: 'P', name: 'PROJECTILE', colour: '#e8a13a' },
  rocket: { letter: 'R', name: 'ROCKET', colour: '#7ee08a' },
  misc: { letter: 'M', name: 'MISC', colour: '#9fb2c8' },
};
const WEAPON_TYPE_OF_KIND = { laser: 'laser', cannon: 'projectile', howitzer: 'projectile', missile: 'rocket', smoke: 'misc' };

function weaponType(weapon) {
  const type = WEAPON_TYPE_OF_KIND[weapon.kind];
  if (!type) throw new BuildError('weapon-kind', `${weapon.name} is a "${weapon.kind}" weapon, which has no badge`);
  return WEAPON_TYPES[type];
}

function bayColumnX(i) { return BAY_LEFT + i * (BAY_COLUMN_W + BAY_COLUMN_GAP); }

function newBay(specs, difficulty) {
  difficultyOf(difficulty); // throws for an unknown name
  if (specs.length < 1 || specs.length > SQUAD_MAX) throw new BuildError('count', `A bay holds 1 to ${SQUAD_MAX} mechs, got ${specs.length}`);
  const mechs = [];
  for (let i = 0; i < SQUAD_MAX; i++) mechs.push(i < specs.length ? copySpec(specs[i]) : null);
  return { difficulty, mechs, focus: { mech: 0, slot: 0 }, enemyIndex: 0 };
}

// Squads to start from. Each costs 100 credits or less, so every one is legal at every difficulty. Choosing one replaces the
// squad in the bay (the difficulty stays), and you can change anything afterwards.
const SUGGESTED_SQUADS = [
  { name: 'BALANCED', blurb: 'A medium with a cannon and laser, a Jackal and a Skitter: the all-rounder (93 credits)', mechs: [
    { chassis: 3, armour: 1, sinks: 0, weapons: [2, 4, 0] },
    { chassis: 2, armour: 1, sinks: 0, weapons: [2, 0, 0] },
    { chassis: 1, armour: 0, sinks: 0, weapons: [1, 0, 0] }] },
  { name: 'LIGHT RUSH', blurb: 'Three fast lights with lasers and a sink each: make for the water, which cools them (96 credits)', mechs: [
    { chassis: 2, armour: 1, sinks: 1, weapons: [2, 1, 0] },
    { chassis: 2, armour: 1, sinks: 1, weapons: [2, 1, 0] },
    { chassis: 1, armour: 1, sinks: 0, weapons: [1, 1, 0] }] },
  { name: 'HEAVY ARTILLERY', blurb: 'One Warden with a laser array and a howitzer, two extra sinks: brutal but alone (94 credits)', mechs: [
    { chassis: 5, armour: 2, sinks: 2, weapons: [9, 10, 0] }] },
  { name: 'ROCKETS+SMOKE', blurb: 'A Ranger with a laser, rockets and smoke, and a Jackal with rockets: heat them up from cover (95 credits)', mechs: [
    { chassis: 3, armour: 2, sinks: 1, weapons: [2, 6, 8] },
    { chassis: 2, armour: 1, sinks: 0, weapons: [2, 6, 0] }] },
];

function copySpec(spec) { return { chassis: spec.chassis, armour: spec.armour, sinks: spec.sinks, weapons: spec.weapons.slice() }; }

function baySquad(bay) { return bay.mechs.filter(m => m).map(copySpec); }

// Cost, budget, every reason the squad cannot fight yet, and the squad code (null while there are problems).
function bayReport(bay) {
  const specs = baySquad(bay);
  const budget = difficultyOf(bay.difficulty).budget;
  const problems = [];
  let cost = 0;
  if (!specs.length) problems.push('Add at least one mech');
  specs.forEach((spec, i) => {
    cost += mechCost(spec);
    try { checkCapacity(spec); } catch (e) { if (e instanceof BuildError) problems.push(`Mech ${i + 1}: ${e.message}`); else throw e; }
  });
  if (cost > budget) problems.push(`Over budget by ${cost - budget} credits (${cost} of ${budget})`);
  const code = problems.length ? null : encodeSquad(bay.difficulty, specs);
  return { cost, budget, problems, code };
}

// Why a weapon cannot go in a slot (null if it can). `slot` is the slot being filled; what is already there is replaced.
function weaponProblem(spec, slot, weaponId) {
  if (weaponId === 0) return null;
  const chassis = chassisById(spec.chassis), w = weaponById(weaponId);
  if (w.minCapacity && chassis.capacity < w.minCapacity) return `${w.name} needs a heavy or assault chassis`;
  const others = spec.weapons.reduce((sum, id, s) => sum + (s === slot || id === 0 ? 0 : weaponById(id).size), 0);
  if (others + w.size > chassis.capacity) return `${chassis.name} has ${chassis.capacity - others} slot${chassis.capacity - others === 1 ? '' : 's'} free, ${w.name} needs ${w.size}`;
  return null;
}

// ---------- changes. Each returns a note for the status line ('' when there is nothing to say) ----------
function baySetDifficulty(bay, name) {
  difficultyOf(name);
  bay.difficulty = name;
  return '';
}

// Put a chassis in a bay slot: a new mech if the slot was empty, otherwise a change of chassis that keeps the armour, sinks and as
// many of the weapons as still fit (in slot order). Anything dropped is named in the note.
function baySetChassis(bay, i, chassisId) {
  const chassis = chassisById(chassisId);
  const old = bay.mechs[i];
  bay.focus = { mech: i, slot: 0 };
  if (!old) { bay.mechs[i] = { chassis: chassisId, armour: 1, sinks: 0, weapons: [0, 0, 0] }; return ''; }
  const spec = { chassis: chassisId, armour: old.armour, sinks: old.sinks, weapons: [0, 0, 0] };
  const dropped = [];
  old.weapons.forEach((id, s) => {
    if (id === 0) return;
    if (weaponProblem(spec, s, id)) dropped.push(weaponById(id).name);
    else spec.weapons[s] = id;
  });
  bay.mechs[i] = spec;
  return dropped.length ? `${chassis.name} cannot carry ${dropped.join(' and ')}: removed` : '';
}

function bayRemoveMech(bay, i) {
  if (!bay.mechs[i]) throw new BuildError('slot', `Bay slot ${i + 1} is already empty`);
  bay.mechs[i] = null;
  return '';
}

function bayStep(bay, i, field, delta) {
  const spec = bay.mechs[i];
  if (!spec) throw new BuildError('slot', `Bay slot ${i + 1} has no mech`);
  const max = field === 'armour' ? ARMOUR_MAX : SINKS_MAX;
  const next = spec[field] + delta;
  if (next < 0 || next > max) throw new BuildError(field, `${field} must stay from 0 to ${max}, asked for ${next}`);
  spec[field] = next;
  return '';
}

function baySetWeapon(bay, i, slot, weaponId) {
  const spec = bay.mechs[i];
  if (!spec) throw new BuildError('slot', `Bay slot ${i + 1} has no mech`);
  const why = weaponProblem(spec, slot, weaponId);
  if (why) throw new BuildError('weapon', why);
  spec.weapons[slot] = weaponId;
  return '';
}

// A different enemy force from the same pool (never the same one again). `draw` is a number from 0 up to (not including) 1, from the caller's
// random source, so this stays testable.
function bayNewEnemy(bay, draw) {
  const n = ENEMY_FORCES[bay.difficulty].length;
  if (n < 2) throw new BuildError('enemy', `${bay.difficulty} has only one enemy force`);
  bay.enemyIndex = ((bay.enemyIndex || 0) + 1 + Math.floor(draw * (n - 1))) % n;
  return '';
}

function baySetSquad(bay, specs) {
  const fresh = newBay(specs, bay.difficulty);
  bay.mechs = fresh.mechs; bay.focus = fresh.focus;
  return '';
}

// Replace the whole bay from a squad code (a typed BuildCodeError for a bad code, and the bay is untouched).
function bayLoadCode(bay, text) {
  const decoded = decodeSquad(text);
  const fresh = newBay(decoded.mechs, decoded.difficulty);
  bay.difficulty = fresh.difficulty; bay.mechs = fresh.mechs; bay.focus = fresh.focus;
}

// ---------- the buttons ----------
// bayButtons(bay) lists every button with its rectangle, label, state ('normal', 'selected' or 'disabled'), a tip (shown on hover,
// and the reason when disabled) and its action. Actions of type fight, copy and paste are for the caller; the rest go to bayPress.
function weaponTip(w) {
  const type = weaponType(w).name.toLowerCase();
  const reach = `${w.range[2]} hexes` + (w.minRange ? `, not closer than ${w.minRange}` : '');
  const what = w.smoke ? 'lays a smoke cloud that blocks sight' : w.splash ? `${w.dmg} damage to the target and ${w.splash} to every mech beside it, friend or foe`
    : w.missiles ? `${w.missiles} ${w.kind === 'laser' ? 'beams' : 'missiles'} of ${w.dmg}, a roll decides how many land` : `${w.dmg} damage`;
  const bits = [`${w.name} (${type}): ${what}`, `heat ${w.heat}`, `reach ${reach}`, w.ammo ? `${w.ammo} shots` : 'no ammo', w.indirect ? 'needs no line of sight' : 'needs line of sight', `size ${w.size}`, `${w.cost} credits`];
  return bits.join(', ');
}

function bayButtons(bay) {
  const out = [];
  const add = (id, x, y, w, h, label, state, tip, action, sub) => out.push({ id, x, y, w, h, label, sub: sub || '', state, tip, action });
  const report = bayReport(bay);

  ['easy', 'normal', 'hard'].forEach((name, k) => {
    const d = DIFFICULTIES[name];
    add('difficulty:' + name, 250 + k * 118, 12, 112, 36, d.name, bay.difficulty === name ? 'selected' : 'normal',
      `${d.name}: ${d.budget} credits to spend, enemy base to-hit ${d.enemyToHit}+ (lower is better)`, { type: 'difficulty', name }, `${d.budget} cr`);
  });

  for (let i = 0; i < SQUAD_MAX; i++) {
    const x = bayColumnX(i), y = BAY_COLUMN_Y, spec = bay.mechs[i];
    CHASSIS.forEach((c, k) => {
      const mine = spec && spec.chassis === c.id;
      add(`chassis:${i}:${c.id}`, x + 4 + (k % 3) * 106, y + 30 + Math.floor(k / 3) * 38, 100, 34, c.name, mine ? 'selected' : 'normal',
        `${c.name}: ${c.cls}, walks ${c.speed}, ${c.sinks} heat sinks, carries ${c.capacity} slots of weapons, ${c.cost} credits${spec ? '. Changing keeps your armour, sinks and the weapons that fit' : ''}`,
        { type: 'chassis', mech: i, chassis: c.id }, `${c.cls} ${c.cost} cr`);
    });
    if (!spec) continue;
    const chassis = chassisById(spec.chassis);
    add(`remove:${i}`, x + BAY_COLUMN_W - 74, y + 3, 70, 20, 'REMOVE', 'normal', `Take mech ${i + 1} out of the squad`, { type: 'remove', mech: i });
    for (const [row, field, label, max, unit] of [[0, 'armour', 'ARMOUR', ARMOUR_MAX, ARMOUR_COST_PER_LEVEL[chassis.cls]], [1, 'sinks', 'EXTRA SINKS', SINKS_MAX, SINK_COST]]) {
      const ry = y + 192 + row * 30;
      const lowest = spec[field] <= 0, highest = spec[field] >= max;
      add(`${field}:${i}:-1`, x + 150, ry, 28, 24, '-', lowest ? 'disabled' : 'normal', lowest ? `${label} is already 0` : `One less ${label.toLowerCase()}, saves ${unit} credits`, { type: 'step', mech: i, field, delta: -1 });
      add(`${field}:${i}:1`, x + 232, ry, 28, 24, '+', highest ? 'disabled' : 'normal', highest ? `${label} is already at its top, ${max}` : `One more ${label.toLowerCase()}, costs ${unit} credits`, { type: 'step', mech: i, field, delta: 1 });
    }
    spec.weapons.forEach((id, s) => {
      const focused = bay.focus.mech === i && bay.focus.slot === s;
      const w = id ? weaponById(id) : null;
      add(`slot:${i}:${s}`, x + 4, y + 252 + s * 34, BAY_COLUMN_W - 8, 30, w ? `${s + 1}  ${w.name}` : `${s + 1}  - empty -`, focused ? 'selected' : 'normal',
        w ? weaponTip(w) : `Weapon slot ${s + 1} is empty. Pick a weapon below to fill it`, { type: 'slot', mech: i, slot: s }, w ? `size ${w.size}  ${w.cost} cr` : '');
      if (w) out[out.length - 1].badge = weaponType(w);
    });
  }

  const scenario = scenarioFor(bay.scenarioId || DEFAULT_SCENARIO_ID, bay.mapSize || 'small', !!bay.features), objective = OBJECTIVES[bay.goal || DEFAULT_OBJECTIVE_ID];
  add('change', 612, 12, 188, 36, scenario.name + (scenario.size === 'large' ? ' (LARGE)' : ''), 'normal', `The map is ${scenario.name} (${scenario.size}${bay.features ? ', with features' : ''}) and the goal is ${objective.name}. Click to change them`, { type: 'change' }, objective.name + (bay.features ? ' + FEATURES' : '') + (bay.infantry ? ' + INFANTRY' : ''));
  SUGGESTED_SQUADS.forEach((q, k) => add(`suggest:${k}`, 100 + k * 134, 52, 128, 28, q.name, 'normal', q.blurb, { type: 'suggest', index: k }));
  const force = enemyForceOf(bay.difficulty, bay.enemyIndex || 0);
  add('enemy', 644, 52, 364, 28, `ENEMY: ${force.name}  ${squadCost(force.mechs)} cr`, 'normal',
    `${force.name}: ${force.blurb} Click for a different enemy force.`, { type: 'enemy' }, force.mechs.map(m => chassisById(m.chassis).name).join(', '));

  // the weapon palette fills the focused slot
  const fm = bay.focus.mech, fspec = bay.mechs[fm];
  const choices = [{ id: 0, name: 'EMPTY', size: 0, cost: 0 }, ...WEAPONS];
  choices.forEach((w, k) => {
    const x = BAY_LEFT + (k % 6) * 166, y = BAY_PALETTE_Y + 22 + Math.floor(k / 6) * 40;
    const here = fspec && fspec.weapons[bay.focus.slot] === w.id;
    const why = !fspec ? 'Pick a chassis for that mech first' : weaponProblem(fspec, bay.focus.slot, w.id);
    add(`weapon:${w.id}`, x, y, 160, 36, w.name, why ? 'disabled' : here ? 'selected' : 'normal',
      why || (w.id ? weaponTip(weaponById(w.id)) : 'Leave this slot empty'), { type: 'weapon', id: w.id }, w.id ? `size ${w.size}  ${w.cost} cr` : '');
    if (w.id) out[out.length - 1].badge = weaponType(w);
  });

  // the code row and the fight button
  add('copy', 624, 606, 70, 36, 'COPY', report.code ? 'normal' : 'disabled', report.code ? 'Copy the squad code to the clipboard' : 'There is no code until the squad is legal: ' + report.problems[0], { type: 'copy' });
  add('paste', 702, 606, 150, 36, 'LOAD CODE', 'normal', 'Type or paste a squad code into a box and load it (Ctrl or Cmd + V in the bay does it too)', { type: 'paste' });
  add('fight', 862, 600, 146, 48, 'FIGHT', report.problems.length ? 'disabled' : 'normal', report.problems.length ? report.problems[0] : 'Start the battle (ENTER)', { type: 'fight' });
  return out;
}

function bayButtonAt(buttons, x, y) {
  return buttons.find(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) || null;
}

// Applies a bay button's action. A disabled button is refused here too: the note says why. Returns the note for the status line.
function bayPress(bay, button) {
  if (button.state === 'disabled') return button.tip;
  const a = button.action;
  switch (a.type) {
    case 'difficulty': return baySetDifficulty(bay, a.name);
    case 'chassis': return baySetChassis(bay, a.mech, a.chassis);
    case 'remove': return bayRemoveMech(bay, a.mech);
    case 'step': return bayStep(bay, a.mech, a.field, a.delta);
    case 'enemy': return bayNewEnemy(bay, Math.random());
    case 'suggest': return baySetSquad(bay, SUGGESTED_SQUADS[a.index].mechs);
    case 'slot': bay.focus = { mech: a.mech, slot: a.slot }; return '';
    case 'weapon': return baySetWeapon(bay, bay.focus.mech, bay.focus.slot, a.id);
    default: throw new BuildError('action', `bayPress cannot apply a ${a.type} button`);
  }
}
