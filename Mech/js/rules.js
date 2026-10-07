'use strict';

// The Hexfire rules engine. No drawing and no DOM, so it can be tested on its own.
// The state is a plain object. The action functions (moveMech, resolveFirePhase, endRound) change it in place
// and return a list of events for the UI and the tests to read.
//
// A round goes: the first side moves each of its mechs, then the second side moves each of its mechs, then the
// first side fires, then the second side fires (see roundPhases). Everything is sequential, so a mech destroyed by
// the first side's volley cannot fire back in the second side's, and a target that is in range when you choose it
// is still in range when you fire. Anything impossible throws a typed error (see errors.js); nothing falls back
// to a default silently.

// ---------- lookups ----------
function chassisById(id) {
  const c = CHASSIS.find(x => x.id === id);
  if (!c) throw new BuildError('chassis', `Unknown chassis id ${id}`);
  return c;
}

function weaponById(id) {
  const w = WEAPONS.find(x => x.id === id);
  if (!w) throw new BuildError('part', `Unknown weapon id ${id}`);
  return w;
}

function difficultyOf(name) {
  const d = DIFFICULTIES[name];
  if (!d) throw new BuildError('difficulty', `Unknown difficulty "${name}"`);
  return d;
}

function sameHex(a, b) { return a[0] === b[0] && a[1] === b[1]; }

// ---------- builds ----------
// A build ("spec") is { chassis: id, armour: 0-7, sinks: 0-7, weapons: [weapon id per slot, 0 = empty] }.
function armourAt(chassis, level, loc) { return Math.round(level * chassis.armourScale * ARMOUR_PATTERN[loc]); }
function rearArmourAt(chassis, level, loc) {
  return REAR_LOCS.includes(loc) ? Math.round(armourAt(chassis, level, loc) * REAR_ARMOUR_FRACTION) : 0;
}
function structureAt(chassis, loc) { return Math.round(chassis.structureScale * STRUCTURE_PATTERN[loc]); }

function wholeNumber(value, min, max, what) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new BuildError(what, `${what} must be a whole number from ${min} to ${max}, got ${value}`);
  }
}

// Returns the chassis. Throws BuildError if the build breaks the rules.
function validateMech(spec) {
  const chassis = chassisById(spec.chassis);
  wholeNumber(spec.armour, 0, ARMOUR_MAX, 'armour');
  wholeNumber(spec.sinks, 0, SINKS_MAX, 'sinks');
  if (!Array.isArray(spec.weapons) || spec.weapons.length !== MAX_WEAPONS) {
    throw new BuildError('slots', `A mech has ${MAX_WEAPONS} weapon slots, the build lists ${Array.isArray(spec.weapons) ? spec.weapons.length : 'none'}`);
  }
  for (const id of spec.weapons) {
    if (id !== 0) weaponById(id);
  }
  return chassis;
}

// How many weapon slots' worth of weapons the build carries, against what its chassis can take.
function slotsUsed(spec) { return spec.weapons.reduce((sum, id) => sum + (id === 0 ? 0 : weaponById(id).size), 0); }

function checkCapacity(spec) {
  const chassis = validateMech(spec), used = slotsUsed(spec);
  for (const id of spec.weapons) {
    const w = id === 0 ? null : weaponById(id);
    if (w && w.minCapacity && chassis.capacity < w.minCapacity) throw new BuildError('too-heavy', `${w.name} needs a heavy or assault chassis, ${chassis.name} is too small`);
  }
  if (used > chassis.capacity) throw new BuildError('capacity', `${chassis.name} carries ${chassis.capacity} slots of weapons, the build needs ${used}`);
}

function mechCost(spec) {
  const chassis = validateMech(spec);
  let total = chassis.cost + spec.armour * ARMOUR_COST_PER_LEVEL[chassis.cls] + spec.sinks * SINK_COST;
  for (const id of spec.weapons) {
    if (id !== 0) total += weaponById(id).cost;
  }
  return total;
}

function squadCost(specs) { return specs.reduce((sum, spec) => sum + mechCost(spec), 0); }

function validateSquad(specs, difficultyName) {
  if (!Array.isArray(specs) || specs.length < 1 || specs.length > SQUAD_MAX) {
    throw new BuildError('count', `A squad has 1 to ${SQUAD_MAX} mechs, got ${Array.isArray(specs) ? specs.length : 'none'}`);
  }
  const budget = difficultyOf(difficultyName).budget;
  const cost = squadCost(specs); // also validates every mech
  for (const spec of specs) checkCapacity(spec);
  if (cost > budget) throw new BuildError('budget', `The squad costs ${cost} credits, the ${difficultyName} budget is ${budget}`);
  return cost;
}

// For the mech bay's heat warning (warn, never forbid): heat made by firing every weapon once, against what
// the mech sheds each round.
function heatReport(spec) {
  const chassis = validateMech(spec);
  let perRound = 0;
  for (const id of spec.weapons) {
    if (id !== 0) perRound += weaponById(id).heat;
  }
  const sinks = chassis.sinks + spec.sinks;
  return { perRound, sinks, standingSinks: sinks + STAND_COOLING, over: perRound > sinks + STAND_COOLING };
}

// ---------- state ----------
// The armour pool of the simple damage model: what the health bar starts at (also shown in the mech bay).
function armourPoints(spec) {
  const chassis = validateMech(spec);
  let total = 0;
  for (const loc of LOCATIONS) total += armourAt(chassis, spec.armour, loc) + structureAt(chassis, loc);
  return Math.max(1, Math.round(total * POOL_SCALE));
}

function makeMech(spec, { id, side, pos, facing, toHit, model = DEFAULT_DAMAGE_MODEL }) {
  const chassis = validateMech(spec);
  if (!DAMAGE_MODELS.includes(model)) throw new BuildError('model', `Unknown damage model "${model}"`);
  const armour = {}, rear = {}, structure = {}, destroyed = {}, stripped = {};
  for (const loc of LOCATIONS) {
    armour[loc] = armourAt(chassis, spec.armour, loc);
    rear[loc] = rearArmourAt(chassis, spec.armour, loc);
    structure[loc] = structureAt(chassis, loc);
    destroyed[loc] = false;
    stripped[loc] = false;   // armour shot away (a hit took it to zero, or hit it when it had none)
  }
  const maxHp = armourPoints(spec);
  return {
    id, side, name: chassis.name, chassisId: chassis.id, spec: JSON.parse(JSON.stringify(spec)),
    pos: pos.slice(), facing, toHit,
    model, hp: maxHp, maxHp,       // the pool model: armour points left, and at the start
    armour, rear, structure, destroyed, stripped,   // the location model
    max: { armour: Object.assign({}, armour), rear: Object.assign({}, rear), structure: Object.assign({}, structure) },
    weapons: spec.weapons.map((wid, slot) => ({ slot, id: wid, loc: MOUNT_LOCS[slot], ammo: wid === 0 ? null : weaponById(wid).ammo, off: false, jam: 0 })), // off: knocked out by a critical; jam: rounds left on a fumble's jam
    heat: 0, sinks: chassis.sinks + spec.sinks, shutdown: false, alive: true,
    carrying: false,  // holding the flag (capture the flag): it cannot run
    moved: 'stand',   // how it moved in the last move phase: stand, walk or run
    fired: false,     // did it fire a weapon this round (a mech that held its fire cools faster)
    locks: {},        // weapon slot -> id of the mech that weapon was last fired at
  };
}

function makeState(map, mechs, first = 'player') {
  if (first !== 'player' && first !== 'enemy') throw new RulesError('first', `The first side must be 'player' or 'enemy', got "${first}"`);
  const ids = new Set(), spots = new Set();
  for (const m of mechs) {
    if (ids.has(m.id)) throw new RulesError('duplicate-id', `Two mechs share the id ${m.id}`);
    ids.add(m.id);
    if (m.side !== 'player' && m.side !== 'enemy') throw new RulesError('side', `Mech ${m.id} has side "${m.side}"`);
    if (!inMap(map, m.pos[0], m.pos[1])) throw new RulesError('start', `Mech ${m.id} starts off the map at ${hexKey(m.pos[0], m.pos[1])}`);
    const key = hexKey(m.pos[0], m.pos[1]);
    if (spots.has(key)) throw new RulesError('start', `Two mechs start on hex ${key}`);
    spots.add(key);
  }
  return { map, mechs, round: 1, first, over: false, winner: null };
}

// A battle from two lists of builds on the scenario map. Ids are P1, P2... and E1, E2...
function newBattle({ playerSpecs, enemySpecs, playerToHit = PLAYER_TO_HIT, enemyToHit, first = 'player', model = DEFAULT_DAMAGE_MODEL, scenario = SCENARIO, goal = DEFAULT_OBJECTIVE_ID }) {
  const map = makeMap(scenario.name, scenario.rows);
  const mechs = [];
  const place = (specs, side, starts, facing, toHit, prefix) => {
    if (specs.length > starts.length) throw new BuildError('count', `The scenario has ${starts.length} starting hexes for the ${side} side, got ${specs.length} mechs`);
    specs.forEach((spec, i) => mechs.push(makeMech(spec, { id: prefix + (i + 1), side, pos: starts[i], facing, toHit, model })));
  };
  place(playerSpecs, 'player', scenario.playerStarts, scenario.playerFacing, playerToHit, 'P');
  place(enemySpecs, 'enemy', scenario.enemyStarts, scenario.enemyFacing, enemyToHit, 'E');
  const state = makeState(map, mechs, first);
  state.scenarioId = scenario.id || null;
  setupObjective(state, scenario, goal);
  return state;
}

// The normal battle: the player's squad (checked against the budget) against the fixed enemy squad.
// Which of a difficulty's enemy forces a battle with this seed fights: an independent small random stream of its own, so picking the enemy
// never changes the dice of a seed. (A new battle with no seed rolls a random one; this is for replays and tests.)
function pickEnemyForce(difficultyName, seed) {
  difficultyOf(difficultyName);
  return new Rng((seed ^ 0x5eed1e55) >>> 0).int(ENEMY_FORCES[difficultyName].length);
}

function enemyForceOf(difficultyName, index) {
  const pool = ENEMY_FORCES[difficultyName];
  if (!pool) throw new BuildError('difficulty', `Unknown difficulty "${difficultyName}"`);
  if (!Number.isInteger(index) || index < 0 || index >= pool.length) throw new BuildError('enemy', `${difficultyName} has ${pool.length} enemy forces, not number ${index}`);
  return pool[index];
}

function battleFor(playerSpecs, difficultyName, first = 'player', model = DEFAULT_DAMAGE_MODEL, scenario = SCENARIO, goal = DEFAULT_OBJECTIVE_ID, enemyIndex = 0) {
  validateSquad(playerSpecs, difficultyName);
  const force = enemyForceOf(difficultyName, enemyIndex);
  const state = newBattle({ playerSpecs, enemySpecs: force.mechs, enemyToHit: difficultyOf(difficultyName).enemyToHit, first, model, scenario, goal });
  state.enemyForce = force.name;
  return state;
}

function cloneState(state) { return JSON.parse(JSON.stringify(state)); }

function mechById(state, id) {
  const m = state.mechs.find(x => x.id === id);
  if (!m) throw new RulesError('no-mech', `No mech with id ${id}`);
  return m;
}

function byId(a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }

// Living mechs, sorted by id (so nothing depends on the order of state.mechs). side is optional.
function livingMechs(state, side) {
  return state.mechs.filter(m => m.alive && (!side || m.side === side)).sort(byId);
}

function otherSide(side) { return side === 'player' ? 'enemy' : 'player'; }

function checkWinner(state) {
  const p = livingMechs(state, 'player').length, e = livingMechs(state, 'enemy').length;
  if (p > 0 && e > 0) return state.objective && state.objective.result ? state.objective.result.winner : null; // both sides alive: only the goal can end it
  return p > 0 ? 'player' : e > 0 ? 'enemy' : 'draw'; // a side with nothing left loses, whatever the goal
}

// Ends the battle if one side has no mech left. Returns true if it is over.
function finishIfOver(state) {
  const winner = checkWinner(state);
  if (winner !== null && !state.over) {
    const eliminated = livingMechs(state, 'player').length === 0 || livingMechs(state, 'enemy').length === 0;
    state.winner = winner; state.over = true;
    state.reason = reasonText(state, eliminated ? 'annihilated' : state.objective.result.code, winner);
  }
  return state.over;
}

// The four steps of a round, in order: the first side moves, the second side moves, the first side fires,
// the second side fires.
function roundPhases(first) {
  const second = otherSide(first);
  return [{ kind: 'move', side: first }, { kind: 'move', side: second }, { kind: 'fire', side: first }, { kind: 'fire', side: second }];
}

// Could this mech ever do damage with a weapon again, ignoring shutdown (which passes)? It needs a weapon that does damage (smoke
// does not), is not knocked out, not in a destroyed or stripped location, and has ammo (or needs none).
function canEverFire(mech) {
  return mech.alive && mech.weapons.some(w => w.id !== 0 && weaponById(w.id).dmg > 0 && !w.off && !locationDown(mech, w.loc) && (w.ammo === null || w.ammo > 0));
}

// ---------- heat and movement allowance ----------
function heatStep(mech) {
  let step = { hit: 0, move: 0 };
  for (const s of HEAT_STEPS) {
    if (mech.heat >= s.at) step = s;
  }
  return step;
}

// Is this location out of action? Destroyed, or (an arm or a leg) with its armour shot away.
function locationDown(mech, loc) { return mech.destroyed[loc] || (LIMB_LOCS.includes(loc) && mech.stripped[loc]); }

function legsLost(mech) { return LEG_LOCS.filter(l => locationDown(mech, l)).length; }

function walkAllowance(mech) {
  if (!mech.alive || mech.shutdown) return 0;
  const lost = legsLost(mech);
  if (lost >= 2) return 0;
  const base = chassisById(mech.chassisId).speed;
  const speed = (lost === 1 ? Math.ceil(base / 2) : base) - heatStep(mech).move;
  return Math.max(1, speed);
}

function runAllowance(mech) {
  const walk = walkAllowance(mech);
  if (walk === 0 || legsLost(mech) > 0 || mech.carrying) return 0;
  return Math.floor(walk * RUN_FACTOR);
}

function allowanceFor(mech, mode) {
  if (mode === 'stand') return 0;
  if (mode === 'walk') return walkAllowance(mech);
  if (mode === 'run') return runAllowance(mech);
  throw new PlanError('mode', `Unknown move mode "${mode}"`);
}

function occupiedKeys(state, exceptId) {
  const keys = new Set();
  for (const m of state.mechs) {
    if (m.alive && m.id !== exceptId) keys.add(hexKey(m.pos[0], m.pos[1]));
  }
  return keys;
}

// Every hex the mech could reach in this mode (a Map, see reachableHexes in map.js). Use pathTo for a plan's path.
function reachableFor(state, mechId, mode) {
  const mech = mechById(state, mechId);
  return reachableHexes(state.map, mech.pos, allowanceFor(mech, mode), occupiedKeys(state, mech.id));
}

// ---------- movement ----------
// A move plan is { mechId, mode: 'stand' | 'walk' | 'run', path: [[c, r], ...] } (the hexes to step through,
// not including where the mech stands).
function validateMovePlan(state, plan) {
  const mech = mechById(state, plan.mechId);
  const who = `Move plan for ${mech.id}`;
  if (!mech.alive) throw new PlanError('dead-mech', `${who}: the mech is destroyed`);
  if (!Array.isArray(plan.path)) throw new PlanError('path', `${who}: the path is missing`);
  if (plan.mode === 'stand') {
    if (plan.path.length) throw new PlanError('stand-path', `${who}: a mech that stands cannot have a path`);
    return;
  }
  if (plan.mode !== 'walk' && plan.mode !== 'run') throw new PlanError('mode', `${who}: unknown mode "${plan.mode}"`);
  if (mech.shutdown) throw new PlanError('shutdown', `${who}: the mech is shut down and cannot move`);
  if (!plan.path.length) throw new PlanError('empty-path', `${who}: ${plan.mode} needs a path (use 'stand' to stay put)`);
  if (plan.mode === 'run' && mech.carrying) throw new PlanError('carrier-run', `${who}: a mech carrying the flag cannot run`);
  const allowance = allowanceFor(mech, plan.mode);
  if (allowance <= 0) throw new PlanError('cannot-' + plan.mode, `${who}: the mech cannot ${plan.mode} (allowance ${allowance})`);
  const occupied = occupiedKeys(state, mech.id);
  const seen = new Set([hexKey(mech.pos[0], mech.pos[1])]);
  let prev = mech.pos, cost = 0;
  for (const hex of plan.path) {
    const key = hexKey(hex[0], hex[1]);
    if (!inMap(state.map, hex[0], hex[1])) throw new PlanError('off-map', `${who}: hex ${key} is off the map`);
    if (hexDist(prev[0], prev[1], hex[0], hex[1]) !== 1) throw new PlanError('not-adjacent', `${who}: hex ${key} does not touch the previous hex`);
    if (seen.has(key)) throw new PlanError('revisit', `${who}: the path visits hex ${key} twice`);
    if (!isPassable(state.map, hex[0], hex[1])) throw new PlanError('impassable', `${who}: hex ${key} is ${terrainAt(state.map, hex[0], hex[1]).name}, which no mech can enter`);
    if (occupied.has(key)) throw new PlanError('occupied', `${who}: hex ${key} is occupied by another mech`);
    seen.add(key);
    cost += terrainAt(state.map, hex[0], hex[1]).cost;
    if (cost > allowance) throw new PlanError('too-far', `${who}: the path costs ${cost} movement, the ${plan.mode} allowance is ${allowance}`);
    prev = hex;
  }
}

// Moves one mech now, as in its plan, and returns the events: a 'step' for each hex entered (for the animation)
// and then 'moved' (nothing at all for a mech that stands). Every living mech gets a move each round, a standing
// one included, because this is what records how it moved (which the to-hit odds use) and adds the heat. The
// mechs move one at a time, so two can never be after the same hex: a plan into an occupied hex is refused by
// validateMovePlan.
function moveMech(state, plan) {
  validateMovePlan(state, plan);
  const mech = mechById(state, plan.mechId);
  const events = [];
  const start = mech.pos.slice();
  let prev = start;
  plan.path.forEach((hex, step) => {
    events.push({ type: 'step', step, mechId: mech.id, from: prev.slice(), to: hex.slice() });
    prev = hex;
  });
  mech.moved = plan.mode;
  if (plan.path.length) {
    mech.pos = prev.slice();
    mech.facing = dirToward(plan.path.length > 1 ? plan.path[plan.path.length - 2] : start, prev);
    events.push({ type: 'moved', mechId: mech.id, from: start, to: mech.pos.slice(), mode: plan.mode });
  }
  mech.heat = Math.min(HEAT_MAX, mech.heat + MOVE_HEAT[plan.mode]);
  objectiveAfterMove(state, mech, plan.path, events);
  return events;
}

// ---------- the fire phase: questions the UI and the planners ask ----------
// The weapon slots of a mech that can fire now: the mech is working and not shut down, the weapon's location is
// not destroyed, it is not jammed, and there is ammo left.
function eligibleWeapons(state, mechId) {
  const mech = mechById(state, mechId);
  if (!mech.alive || mech.shutdown) return [];
  return mech.weapons
    .filter(w => w.id !== 0 && !w.off && !w.jam && !locationDown(mech, w.loc) && (w.ammo === null || w.ammo > 0))
    .map(w => w.slot);
}

// Can this weapon fire at this target now, and what are the odds? Returns { valid: false, reason } with the
// reason one of self, friendly, target-dead, too-close, out-of-range, no-line-of-sight; or, when valid,
// { valid: true, dist, band, need, chance, mods } where `need` is the d20 number to equal or beat.
//
// Lasers and cannon need line of sight. Indirect weapons (rockets, the howitzer) need range but not line of sight, and firing
// without it adds INDIRECT_NO_LOS_MOD to the number needed.
function targetStatus(state, attackerId, slot, targetId) {
  const attacker = mechById(state, attackerId), target = mechById(state, targetId);
  const entry = attacker.weapons[slot];
  if (!entry || entry.id === 0) throw new PlanError('no-weapon', `${attackerId} has no weapon in slot ${slot}`);
  const weapon = weaponById(entry.id);
  const dist = hexDist(attacker.pos[0], attacker.pos[1], target.pos[0], target.pos[1]);
  const no = reason => ({ valid: false, reason, targetId, dist });
  if (weapon.smoke) { // smoke lands on any mech in range, friend, foe or the shooter itself: no roll, no line of sight
    if (!target.alive) return no('target-dead');
    if (dist < weapon.minRange) return no('too-close');
    const reach = weapon.range.findIndex(rg => dist <= rg);
    if (reach < 0) return no('out-of-range');
    return { valid: true, reason: 'ok', targetId, dist, band: BAND_NAMES[reach], need: NEED_MIN, chance: 100, mods: [], smoke: true };
  }
  if (target.id === attacker.id) return no('self');
  if (target.side === attacker.side) return no('friendly');
  if (!target.alive) return no('target-dead');
  if (dist < weapon.minRange) return no('too-close');
  const band = weapon.range.findIndex(r => dist <= r);
  if (band < 0) return no('out-of-range');
  const sees = hasLineOfSight(state.map, attacker.pos, target.pos);
  if (!sees && !weapon.indirect) return no('no-line-of-sight');

  const mods = [
    { name: 'base to-hit', value: attacker.toHit },
    { name: `range ${dist} hexes`, value: Math.floor((dist - 1) / RANGE_STEP_HEXES) },
    { name: 'target size', value: SIZE_MOD[chassisById(target.chassisId).cls] },
    { name: 'you moved', value: MOVED_HIT_MOD[attacker.moved] },
    { name: 'they moved', value: MOVED_HIT_MOD[target.moved] * (weapon.moverFactor || 1) }, // slow shells are worse against movers
    { name: 'heat', value: heatStep(attacker).hit },
    { name: 'cover', value: terrainAt(state.map, target.pos[0], target.pos[1]).cover },
    { name: 'target shut down', value: target.shutdown ? SHUTDOWN_TARGET_MOD : 0 },
    { name: 'no line of sight', value: sees ? 0 : INDIRECT_NO_LOS_MOD },
  ].filter(m => m.value !== 0 || m.name === 'base to-hit');
  const raw = mods.reduce((sum, m) => sum + m.value, 0);
  const need = Math.min(NEED_MAX, Math.max(NEED_MIN, raw));
  return { valid: true, reason: 'ok', targetId, dist, band: BAND_NAMES[band], need, chance: (21 - need) * 5, mods };
}

// The enemies this weapon can fire at, nearest first (ties by id), each with its targetStatus.
function validTargets(state, attackerId, slot) {
  const attacker = mechById(state, attackerId);
  const smoke = weaponById(attacker.weapons[slot].id).smoke;
  return (smoke ? livingMechs(state) : livingMechs(state, otherSide(attacker.side)))
    .map(t => targetStatus(state, attackerId, slot, t.id))
    .filter(s => s.valid)
    .sort((a, b) => a.dist - b.dist || (a.targetId < b.targetId ? -1 : 1));
}

// Where this weapon should aim by default (lock-on and follow). Returns { targetId, reason, lockLost }:
// reason 'locked' (still valid), 'nearest' (no lock yet), 'lost-lock-nearest' (the lock broke; lockLost says
// why) or 'none' (nothing valid at all; targetId is null).
function defaultTarget(state, attackerId, slot) {
  const attacker = mechById(state, attackerId);
  const lock = attacker.locks[slot];
  let lockLost = null;
  if (lock !== undefined) {
    const status = targetStatus(state, attackerId, slot, lock);
    if (status.valid) return { targetId: lock, reason: 'locked', lockLost: null };
    lockLost = status.reason;
  }
  // smoke is offered on anyone, but is suggested on an enemy
  const options = validTargets(state, attackerId, slot).filter(s => !s.smoke || mechById(state, s.targetId).side !== attacker.side);
  if (!options.length) return { targetId: null, reason: 'none', lockLost };
  return { targetId: options[0].targetId, reason: lockLost ? 'lost-lock-nearest' : 'nearest', lockLost };
}

// ---------- the fire phase ----------
// A fire plan is a list of { mechId, weaponSlot, targetId }, one for each weapon that fires. A weapon left out
// is held. Returns the targetStatus of each shot, in the order given, all worked out on the state as it is NOW
// (before any damage in the volley). Throws PlanError for anything that cannot be fired: the mech is dead, the
// weapon cannot fire, a weapon is listed twice, or the target is not a valid target (out of range, out of sight,
// not an enemy...). With sequential turns nothing moves between choosing a target and firing, so an invalid shot
// is a bug in whoever made the plan.
function validateFirePlan(state, shots) {
  const seen = new Set();
  const destructing = new Set(shots.filter(s => s.destruct).map(s => s.mechId));
  return shots.map(shot => {
    if (shot.destruct) { // a self-destruct: the mech does nothing else this phase
      const who = `Fire plan, ${shot.mechId} self-destruct`;
      const mech = mechById(state, shot.mechId);
      if (!mech.alive) throw new PlanError('dead-mech', `${who}: the mech is destroyed`);
      if (mech.shutdown) throw new PlanError('ineligible', `${who}: a shut-down mech cannot self-destruct`);
      if (seen.has(shot.mechId + '/destruct')) throw new PlanError('duplicate-weapon', `${who}: listed twice`);
      seen.add(shot.mechId + '/destruct');
      if (shots.some(s => !s.destruct && s.mechId === shot.mechId)) throw new PlanError('destruct-and-fire', `${who}: a mech that self-destructs cannot also fire`);
      return { valid: true, reason: 'ok', targetId: mech.id, dist: 0, destruct: true };
    }
    const who = `Fire plan, ${shot.mechId} slot ${shot.weaponSlot}`;
    const mech = mechById(state, shot.mechId);
    if (!mech.alive) throw new PlanError('dead-mech', `${who}: the mech is destroyed`);
    if (destructing.has(shot.mechId)) throw new PlanError('destruct-and-fire', `${who}: a mech that self-destructs cannot also fire`);
    if (!eligibleWeapons(state, mech.id).includes(shot.weaponSlot)) {
      throw new PlanError('ineligible', `${who}: that weapon cannot fire (missing, destroyed, out of ammo, or the mech is shut down)`);
    }
    const key = shot.mechId + '/' + shot.weaponSlot;
    if (seen.has(key)) throw new PlanError('duplicate-weapon', `${who}: the weapon is already firing at another target (a salvo cannot be split)`);
    seen.add(key);
    const status = targetStatus(state, shot.mechId, shot.weaponSlot, shot.targetId);
    if (!status.valid) throw new PlanError(status.reason, `${who}: cannot fire at ${shot.targetId} (${status.reason})`);
    return status;
  });
}

// A weapon that heats its target (rockets) does so for every packet that lands. The target's heat is capped at HEAT_MAX
// and the heat actually added is returned (it goes in the hit event so the screen can show it).
function addTargetHeat(target, weapon) {
  if (!weapon.heatOnHit) return 0;
  const added = Math.min(HEAT_MAX - target.heat, weapon.heatOnHit);
  target.heat += added;
  return added;
}

function rollLocation(rng) {
  let total = 0;
  for (const loc of LOCATIONS) total += HIT_WEIGHTS[loc];
  let n = rng.int(total);
  for (const loc of LOCATIONS) {
    n -= HIT_WEIGHTS[loc];
    if (n < 0) return loc;
  }
  throw new RulesError('hit-weights', 'Hit location weights did not add up');
}

function destroyLocation(mech, loc, list) {
  if (mech.destroyed[loc]) return;
  mech.destroyed[loc] = true;
  mech.structure[loc] = 0;
  mech.armour[loc] = 0;
  mech.rear[loc] = 0;
  list.push(loc);
  if (KILL_LOCS.includes(loc)) mech.alive = false;
  if (ARM_OF_TORSO[loc]) destroyLocation(mech, ARM_OF_TORSO[loc], list);
}

// Armour first (rear armour for a rear hit on a torso), then structure; when a location is destroyed the excess
// carries inward. Damage to an already destroyed location carries inward at once. A location whose front armour
// reaches zero in a hit is marked stripped (see LIMB_LOCS). ignoreArmour is for ammo explosions (armour untouched). Returns { steps: [{ loc, armour, structure, rear }], destroyed: [loc], killed }.
function applyDamage(mech, loc, damage, rear, ignoreArmour) {
  const wasAlive = mech.alive;
  const steps = [], destroyed = [];
  let remaining = damage, cur = loc;
  for (let guard = 0; remaining > 0 && cur; guard++) {
    if (guard > 20) throw new RulesError('damage-loop', `Damage to ${mech.id} ${loc} did not settle`);
    if (mech.destroyed[cur]) { cur = CARRY_TO[cur]; continue; }
    const useRear = rear && REAR_LOCS.includes(cur);
    const pool = useRear ? mech.rear : mech.armour;
    const step = { loc: cur, armour: 0, structure: 0, rear: useRear };
    if (!ignoreArmour) {
      step.armour = Math.min(pool[cur], remaining);
      pool[cur] -= step.armour;
      remaining -= step.armour;
    }
    if (remaining > 0) {
      step.structure = Math.min(mech.structure[cur], remaining);
      mech.structure[cur] -= step.structure;
      remaining -= step.structure;
    }
    steps.push(step);
    if (!ignoreArmour && !useRear && pool[cur] === 0) mech.stripped[cur] = true; // the armour is gone: an arm or leg here is out of action
    if (mech.structure[cur] === 0) {
      destroyLocation(mech, cur, destroyed);
      cur = CARRY_TO[cur];
    } else {
      break;
    }
  }
  return { steps, destroyed, killed: wasAlive && !mech.alive };
}

// One hit of blast damage on a mech: the pool model takes it straight off, the location model rolls a location (or, for the
// bomber's own destruction, takes it all in the centre torso). Pushes the hit event, and destroyed / killed events.
function blastHit(target, byId, damage, rng, events, own) {
  if (target.model === 'pool') {
    const dealt = Math.min(target.hp, damage);
    target.hp -= dealt;
    events.push({ type: 'hit', mechId: byId, slot: -1, targetId: target.id, loc: null, rear: false, damage, heat: 0, blast: true, steps: [{ pool: true, amount: dealt }] });
    if (target.hp === 0 && target.alive) { target.alive = false; events.push({ type: 'killed', mechId: target.id }); }
  } else {
    const loc = own ? 'CT' : rollLocation(rng);
    const result = applyDamage(target, loc, damage, false, false);
    events.push({ type: 'hit', mechId: byId, slot: -1, targetId: target.id, loc, rear: false, damage, heat: 0, blast: true, steps: result.steps });
    for (const d of result.destroyed) events.push({ type: 'destroyed', mechId: target.id, loc: d });
    if (result.killed) events.push({ type: 'killed', mechId: target.id });
  }
}

// The bomber blows up: every living mech in the six hexes around it, friend or foe, takes SELF_DESTRUCT_DAMAGE (in id order),
// then the bomber is destroyed. A bomber that was already destroyed earlier in the same volley still goes off (a volley is simultaneous).
function resolveSelfDestruct(state, bomber, rng, events) {
  const spots = neighbours(state.map, bomber.pos[0], bomber.pos[1]);
  const victims = livingMechs(state)
    .filter(m => m.id !== bomber.id && spots.some(n => n.c === m.pos[0] && n.r === m.pos[1]))
    .sort(byId);
  events.push({ type: 'shot', mechId: bomber.id, slot: -1, weaponId: 0, targetId: bomber.id, roll: null, need: null, hit: true, destruct: true });
  events.push({ type: 'blast', mechId: bomber.id, hexes: spots.map(n => [n.c, n.r]) });
  for (const v of victims) blastHit(v, bomber.id, SELF_DESTRUCT_DAMAGE, rng, events, false);
  if (bomber.alive) blastHit(bomber, bomber.id, bomber.model === 'pool' ? bomber.hp : bomber.armour.CT + bomber.structure.CT, rng, events, true);
}

// Every attack in the plan is checked and its odds worked out against the state at the START of the volley, so
// damage within the volley is simultaneous: a mech destroyed in this volley still fires, and a target killed by
// one shot does not make a later shot invalid. Shots are rolled in a fixed order (by mech id, then weapon slot),
// so the result never depends on the order of the plan or of state.mechs. Afterwards each weapon that fired adds
// its heat, uses a round of ammo and locks onto its target, and each mech turns to face the target of its first
// weapon.
function resolveFirePhase(state, shots, rng) {
  const statuses = validateFirePlan(state, shots);
  const list = shots.map((shot, i) => ({ shot, status: statuses[i] }))
    .sort((a, b) => (a.shot.mechId < b.shot.mechId ? -1 : a.shot.mechId > b.shot.mechId ? 1 : a.shot.weaponSlot - b.shot.weaponSlot));
  const startFacing = new Map(state.mechs.map(m => [m.id, m.facing]));
  const events = [];

  for (const { shot, status } of list) {
    if (shot.destruct) { resolveSelfDestruct(state, mechById(state, shot.mechId), rng, events); continue; }
    const attacker = mechById(state, shot.mechId), target = mechById(state, shot.targetId);
    const weapon = weaponById(attacker.weapons[shot.weaponSlot].id);
    if (weapon.smoke) { // no roll: the cloud lands over the target and its neighbours
      const hexes = smokeHexes(state.map, target.pos[0], target.pos[1]);
      events.push({ type: 'shot', mechId: attacker.id, slot: shot.weaponSlot, weaponId: weapon.id, targetId: target.id, roll: null, need: null, hit: true, smoke: true });
      events.push({ type: 'smoke', mechId: attacker.id, slot: shot.weaponSlot, targetId: target.id, hexes, rounds: SMOKE_ROUNDS });
      addSmoke(state.map, hexes, SMOKE_ROUNDS);
      continue;
    }
    const roll = rng.d20();
    const hit = roll !== 1 && (roll === 20 || roll >= status.need);
    const event = { type: 'shot', mechId: attacker.id, slot: shot.weaponSlot, weaponId: weapon.id, targetId: target.id, roll, need: status.need, hit };
    events.push(event);
    if (roll === 1) { // a fumble: the weapon jams until the end of the shooter's next round
      attacker.weapons[shot.weaponSlot].jam = JAM_ROUNDS;
      event.fumble = true;
      events.push({ type: 'jam', mechId: attacker.id, slot: shot.weaponSlot, weaponId: weapon.id, rounds: JAM_ROUNDS });
    }
    if (!hit) continue;
    let packets = 1;
    if (weapon.missiles) {
      const cluster = rng.d20();
      packets = Math.max(1, Math.round(weapon.missiles * CLUSTER_SHARE[cluster - 1]));
      event.missiles = packets;
    }
    const rear = isRearAttack(target.pos, startFacing.get(target.id), attacker.pos);
    for (let i = 0; i < packets; i++) {
      if (target.model === 'pool') { // one pool: the damage comes straight off it
        const dealt = Math.min(target.hp, weapon.dmg);
        target.hp -= dealt;
        const heat = addTargetHeat(target, weapon);
        events.push({ type: 'hit', mechId: attacker.id, slot: shot.weaponSlot, targetId: target.id, loc: null, rear: false, damage: weapon.dmg, heat, steps: [{ pool: true, amount: dealt }] });
        if (target.hp === 0 && target.alive) { target.alive = false; events.push({ type: 'killed', mechId: target.id }); }
      } else {
        const loc = rollLocation(rng);
        const result = applyDamage(target, loc, weapon.dmg, rear, false);
        const heat = addTargetHeat(target, weapon);
        events.push({ type: 'hit', mechId: attacker.id, slot: shot.weaponSlot, targetId: target.id, loc, rear, damage: weapon.dmg, heat, steps: result.steps });
        for (const d of result.destroyed) events.push({ type: 'destroyed', mechId: target.id, loc: d });
        if (result.killed) events.push({ type: 'killed', mechId: target.id });
      }
    }
    if (target.model === 'pool' && target.alive) { // a critical (a natural 20): one per shot that hit, however many missiles landed
      if (roll === 20) {
        const working = target.weapons.filter(w => w.id !== 0 && !w.off);
        if (working.length) {
          const out = working[rng.int(working.length)];
          out.off = true;
          events.push({ type: 'critical', mechId: target.id, slot: out.slot, weaponId: out.id, byId: attacker.id });
        }
      }
    }
    if (weapon.splash) { // the shell's blast: every living mech beside the target, friend or foe, takes the splash damage
      const around = neighbours(state.map, target.pos[0], target.pos[1]);
      const near = livingMechs(state).filter(m => m.id !== target.id && around.some(n => n.c === m.pos[0] && n.r === m.pos[1])).sort(byId);
      for (const m of near) blastHit(m, attacker.id, weapon.splash, rng, events, false);
    }
  }

  const firstShot = new Map();
  for (const { shot } of list) {
    if (shot.destruct) continue;
    const attacker = mechById(state, shot.mechId);
    const weapon = attacker.weapons[shot.weaponSlot];
    attacker.heat = Math.min(HEAT_MAX, attacker.heat + weaponById(weapon.id).heat);
    attacker.fired = true;
    if (weapon.ammo !== null) weapon.ammo -= 1;
    attacker.locks[shot.weaponSlot] = shot.targetId;
    if (!firstShot.has(attacker.id)) firstShot.set(attacker.id, shot.targetId);
  }
  for (const [id, targetId] of firstShot) {
    const attacker = mechById(state, id), target = mechById(state, targetId);
    attacker.facing = dirToward(attacker.pos, target.pos);
  }
  objectiveSync(state, events); // a destroyed flag carrier drops the flag
  return events;
}

// ---------- the end of a round ----------
// For each living mech, in id order: shut down at full heat; an ammo explosion from COOKOFF_HEAT up (a d20 roll);
// then the heat sinks (plus extra for standing still or standing in water); a shut-down mech restarts once it
// has cooled. Then the win check (a side with no mech loses; both sides gone is a draw), and if the fight goes on the next round starts with the other side going first.
// Returns events.
// Heat a mech's sinks remove in a round, before standing still and terrain.
function sinkCooling(mech) { return Math.floor(mech.sinks * COOL_FACTOR); }

function endRound(state, rng) {
  const events = [];
  for (const mech of livingMechs(state)) {
    const wasShutdown = mech.shutdown;
    const peak = mech.heat;
    if (peak >= HEAT_MAX && !mech.shutdown) {
      mech.shutdown = true;
      events.push({ type: 'shutdown', mechId: mech.id, heat: peak });
    }
    if (peak >= COOKOFF_HEAT) {
      const loaded = mech.weapons.filter(w => w.id !== 0 && w.ammo !== null && w.ammo > 0 && !mech.destroyed[w.loc]);
      if (loaded.length) {
        const store = loaded.reduce((best, w) => (w.ammo > best.ammo ? w : best));
        const roll = rng.d20();
        if (roll <= COOKOFF_ROLL) {
          store.ammo = 0;
          if (mech.model === 'pool') { // the explosion damages the mech directly
            const dealt = Math.min(mech.hp, COOKOFF_DAMAGE);
            mech.hp -= dealt;
            events.push({ type: 'cookoff', mechId: mech.id, slot: store.slot, loc: null, damage: COOKOFF_DAMAGE, steps: [{ pool: true, amount: dealt }] });
            if (mech.hp === 0) { mech.alive = false; events.push({ type: 'killed', mechId: mech.id }); }
          } else {
            const result = applyDamage(mech, store.loc, COOKOFF_DAMAGE, false, true);
            events.push({ type: 'cookoff', mechId: mech.id, slot: store.slot, loc: store.loc, damage: COOKOFF_DAMAGE, steps: result.steps });
            for (const d of result.destroyed) events.push({ type: 'destroyed', mechId: mech.id, loc: d });
            if (result.killed) events.push({ type: 'killed', mechId: mech.id });
          }
        }
      }
    }
    if (!mech.alive) continue;
    const cooling = sinkCooling(mech) + (mech.moved === 'stand' ? STAND_COOLING : 0) + (mech.fired ? 0 : HOLD_FIRE_COOLING) + terrainAt(state.map, mech.pos[0], mech.pos[1]).cool;
    mech.heat = Math.max(0, mech.heat - cooling);
    mech.fired = false;
    for (const w of mech.weapons) {
      if (w.jam > 0) {
        w.jam -= 1;
        if (w.jam === 0) events.push({ type: 'unjam', mechId: mech.id, slot: w.slot, weaponId: w.id });
      }
    }
    if (wasShutdown && mech.heat < SHUTDOWN_RECOVER) {
      mech.shutdown = false;
      events.push({ type: 'restart', mechId: mech.id, heat: mech.heat });
    }
  }
  fadeSmoke(state.map);
  objectiveAfterRound(state, events); // the hill scores and the round limit may end the battle
  if (finishIfOver(state)) {
    events.push({ type: 'over', winner: state.winner });
  } else {
    state.round += 1;
    state.first = otherSide(state.first); // the sides swap who goes first
  }
  return events;
}
