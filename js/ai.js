'use strict';

// The computer opponent. Plain and easy to read, not a search. It moves one mech at a time, from the state as it
// is at that moment, and then fires its whole side's weapons, and returns plans plus one line of reasoning per
// decision so odd behaviour can be diagnosed. No drawing and no DOM, so it is tested like the rules.
//
// Move: get to a hex it can shoot the nearest enemy from, then hold a good firing range with a clear view (and
// cover if it can); stand still to cool when hot. It never runs: running in from across the map made the first
// playtest feel unfair, and running is for the player.
// Fire: every weapon at its default target (lock-on and follow), holding weapons that would push the mech
// towards shutdown.

const AI_RANGE = 4;          // the range, in hexes, it tries to hold
const AI_STAND_HEAT = 14;    // at this heat it stands still to cool
const AI_HEAT_CAP = 26;      // it holds a weapon rather than go above this heat
const AI_NO_VIEW_PENALTY = 3;
const AI_REPAIR_BELOW = 0.5;  // a mech below this share of its armour, or with a weapon knocked out, goes to a repair bay...
const AI_REPAIR_RANGE = 8;
const AI_SENSOR_RANGE = 10; // a side that holds no sensor tower sends the mech nearest a free one, if it is within this many hexes
const AI_RAID_RANGE = 3;      // the defend goal: a raider closes to this many hexes of the dropship

// The defend goal (story): the enemy's lights are raiders, sent for the thing the player is protecting.
function aiIsRaider(state, mech) {
  const o = state.objective;
  return !!o && o.id === 'defend' && mech.side === 'enemy' && chassisById(mech.chassisId).cls === 'light' && mechById(state, o.protect).alive;
}    // ...if one with charges left is within this many hexes // when fine-tuning, a hex with no line of sight to the target counts as this many hexes further off

// Roles come from the weight class. Lights are raiders: they want water (cooling lets them keep firing). Heavies and
// assaults are anchors: they want cover (woods hide them from lasers). Mediums are flexible: they value either, so they
// take whichever is nearer and gives them a shot. The result is a bonus, in hexes, for standing on a given terrain.
function terrainAffinity(mech, terrain) {
  const water = terrain.cool > 0, cover = terrain.cover > 0;
  const cls = chassisById(mech.chassisId).cls;
  if (cls === 'light') return water ? 2 : cover ? 0.5 : 0;
  if (cls === 'medium') return water || cover ? 1.25 : 0;
  return cover ? 2 : 0; // heavy, assault
}

// The longest prefix of a path (a list of hexes to step through) that costs no more than `allowance`.
function pathWithin(map, path, allowance) {
  let cost = 0;
  const out = [];
  for (const hex of path) {
    cost += terrainAt(map, hex[0], hex[1]).cost;
    if (cost > allowance) break;
    out.push(hex);
  }
  return out;
}

// What the battle's goal asks of this mech, or null (it just fights): { hexes, run, why, intent, hold }, the hexes it is heading for (it takes the
// nearest it can reach), whether it should run, a line for the screen, and how close (in hexes) counts as there (0 = on one of them).
// Roles, so the side does not all do the same thing:
//   exit   every mech heads for its exit, running when it can (the whole squad has to get there, so nobody waits behind)
//   defend (story) the enemy's lights are raiders: they run for the dropship (`protect`) and shoot it first (aiPlanFire); the rest hunt
//   escape (story) the player's side runs for its exit as above; the enemy has no goal and hunts
//   hill   every mech goes for the hill (a mech already on it holds it)
//   flag   the mech carrying the flag walks it home; with a loose flag the nearest mech fetches it; with a friendly carrier the nearest other
//          mech escorts it; a mech left over (the slowest, when there are at least two of them) guards its own base. When the enemy has
//          the flag nobody guards: everyone hunts the carrier (see aiMoveFor and aiPlanFire).
function aiGoalFor(state, mech) {
  const o = state.objective;
  if (!o || o.id === 'annihilation') return null;
  const mobile = livingMechs(state, mech.side).filter(m => !m.shutdown && walkAllowance(m) > 0);
  const near = (m, pos) => hexDist(m.pos[0], m.pos[1], pos[0], pos[1]);
  if (o.id === 'defend') {
    if (!aiIsRaider(state, mech)) return null;
    const ship = mechById(state, o.protect);
    const near = [];
    for (let c = 0; c < state.map.cols; c++) for (let r = 0; r < state.map.rows; r++) {
      const d = hexDist(c, r, ship.pos[0], ship.pos[1]);
      if (d >= 1 && d <= AI_RAID_RANGE && isPassable(state.map, c, r)) near.push([c, r]);
    }
    return { hexes: near, run: true, why: 'goes for the dropship', intent: `${mech.id} GOES FOR THE DROPSHIP`, hold: AI_RAID_RANGE };
  }
  if (o.id === 'raid') { // a story goal: when the AI plays the player's side (the tests) it fights until the towers are down, then the runner goes in
    if (mech.side !== 'player' || mech.id !== o.runner || targetsLeft(state) > 0) return null;
    return { hexes: o.hangar, run: true, why: 'heads for the hangar', intent: `${mech.id} HEADS FOR THE HANGAR`, hold: 0 };
  }
  if (o.id === 'escape') { // a story goal: the player's side runs for the exit (when the AI plays it, in the tests); the enemy just hunts
    return mech.side === 'player' ? { hexes: o.exits.player, run: true, why: 'heads for the exit', intent: `${mech.id} HEADS FOR THE EXIT`, hold: 0 } : null;
  }
  if (o.id === 'exit') {
    return { hexes: o.exits[mech.side], run: true, why: 'heads for the exit', intent: `${mech.id} HEADS FOR THE EXIT`, hold: 0 };
  }
  if (o.id === 'hill') {
    if (inGroup(o.zone, mech.pos)) return { hexes: [mech.pos], run: false, why: 'holds the hill', intent: `${mech.id} HOLDS THE HILL`, hold: 0 };
    return { hexes: o.zone, run: true, why: 'goes for the hill', intent: `${mech.id} GOES FOR THE HILL`, hold: 0 };
  }
  if (o.id === 'core') { // the finale: the holder holds the gate (when the AI plays the player's side, in the tests); everyone else fights
    if (mech.side !== 'player' || mech.id !== o.holder) return null;
    return { hexes: [o.gate], run: false, why: 'holds the doors', intent: `${mech.id} HOLDS THE DOORS`, hold: 0 };
  }
  if (o.id === 'hunt') { // the marked mech keeps to its home ground (its guard comes out to fight); the player's side (the tests) just fights
    if (mech.id !== o.mark) return null;
    return { hexes: [o.home], run: false, why: 'keeps to the house', intent: `${mech.id} KEEPS TO THE HOUSE`, hold: 2 };
  }
  if (o.id === 'heist' && mech.side === 'enemy') return null; // a heist: the enemy cannot pick the crate up, so it hunts (the carrier first, see aiMoveFor)
  if (o.id === 'flag' || o.id === 'heist') {
    if (mech.carrying) return { hexes: o.bases[mech.side], run: false, why: 'carries the flag home', intent: `${mech.id} CARRIES THE FLAG HOME`, hold: 0 };
    const enemyHas = livingMechs(state, otherSide(mech.side)).some(m => m.carrying);
    if (enemyHas) return null; // everyone hunts the carrier
    const friend = mobile.find(m => m.carrying);
    const others = mobile.filter(m => !m.carrying);
    let fetcher = null, escort = null;
    if (o.flag.pos) fetcher = others.slice().sort((a, b) => near(a, o.flag.pos) - near(b, o.flag.pos) || (a.id < b.id ? -1 : 1))[0];
    else if (friend) escort = others.slice().sort((a, b) => near(a, friend.pos) - near(b, friend.pos) || (a.id < b.id ? -1 : 1))[0];
    if (fetcher && fetcher.id === mech.id) return { hexes: [o.flag.pos], run: true, why: 'goes for the flag', intent: `${mech.id} GOES FOR THE FLAG`, hold: 0 };
    if (escort && escort.id === mech.id) return { hexes: [friend.pos], run: false, why: `escorts ${friend.id}`, intent: `${mech.id} ESCORTS ${friend.id}`, hold: 1 };
    const rest = others.filter(m => !(fetcher && fetcher.id === m.id) && !(escort && escort.id === m.id));
    if (rest.length >= 2 || (rest.length === 1 && others.length >= 3)) {
      const guard = rest.slice().sort((a, b) => walkAllowance(a) - walkAllowance(b) || (a.id < b.id ? -1 : 1))[0];
      if (guard.id === mech.id) return { hexes: o.bases[mech.side], run: false, why: 'guards its base', intent: `${mech.id} GUARDS THE BASE`, hold: 4 };
    }
  }
  return null;
}

// A repair bay as a goal (see repairAtBays): a mech already on a bay with charges stays while it has anything to fix; a badly damaged one
// (under AI_REPAIR_BELOW of its armour, or a weapon knocked out) heads for the nearest bay with charges within AI_REPAIR_RANGE. Otherwise null.
// Ammo caches likewise: a mech with an ammo weapon run dry heads for a cache with uses left in reach.
function aiRepairGoal(state, mech) {
  const charges = state.map.charges || {};
  const here = serviceFor(state, mech, mech.pos);
  if (here) return { hexes: [mech.pos], run: false, why: here.kind === 'repair' ? 'repairs on the bay' : 'reloads at the cache', intent: here.kind === 'repair' ? `${mech.id} REPAIRS` : `${mech.id} RELOADS`, hold: 0 };
  const broken = mech.weapons.some(w => w.id !== 0 && w.off);
  const badly = mech.model === 'pool' && mech.hp < mech.maxHp * AI_REPAIR_BELOW;
  const dry = mech.weapons.some(w => w.id !== 0 && w.ammo === 0);
  const points = Object.keys(charges).filter(k => charges[k] > 0).map(k => k.split(',').map(Number)).filter(([c, r]) => hexDist(mech.pos[0], mech.pos[1], c, r) <= AI_REPAIR_RANGE);
  const bays = points.filter(([c, r]) => terrainAt(state.map, c, r).repair), caches = points.filter(([c, r]) => terrainAt(state.map, c, r).resupply);
  if ((broken || badly) && bays.length) return { hexes: bays, run: false, why: 'goes to a repair bay', intent: `${mech.id} GOES TO REPAIR`, hold: 0 };
  if (dry && caches.length) return { hexes: caches, run: false, why: 'goes to an ammo cache', intent: `${mech.id} GOES TO RELOAD`, hold: 0 };
  return null;
}

// A sensor tower as a goal: a mech standing on one stays there (spotting for its side); a side that holds none sends its one mech nearest a free
// tower within AI_SENSOR_RANGE (one mech, so the rest still fight). Otherwise null. It comes after the battle's goal, so a mech with a job to do
// (the flag, the hill, the exit) does that instead.
function aiSensorGoal(state, mech) {
  const towers = sensorHexes(state.map);
  if (!towers.length) return null;
  if (towers.some(t => sameHex(t, mech.pos))) return { hexes: [mech.pos], run: false, why: 'spots from the sensor tower', intent: `${mech.id} HOLDS THE SENSOR TOWER`, hold: 0 };
  if (holdsSensor(state, mech.side)) return null;
  const free = towers.filter(t => !livingMechs(state).some(m => sameHex(m.pos, t)));
  const near = (m, t) => hexDist(m.pos[0], m.pos[1], t[0], t[1]);
  const mobile = livingMechs(state, mech.side).filter(m => !m.shutdown && walkAllowance(m) > 0 && !m.crawler);
  let best = null; // the side's mech nearest any free tower in range
  for (const t of free) for (const m of mobile) {
    const d = near(m, t);
    if (d <= AI_SENSOR_RANGE && (!best || d < best.d || (d === best.d && m.id < best.m.id))) best = { m, t, d };
  }
  if (!best || best.m.id !== mech.id) return null;
  return { hexes: [best.t], run: false, why: 'goes for the sensor tower', intent: `${mech.id} GOES FOR THE SENSOR TOWER`, hold: 0 };
}

// Moves toward a goal along the cheapest route across the whole map, as far as one move allows (a run if it should run and can). Returns
// a plan, a note and the goal's intent line, or null if no goal hex can be reached (then the mech just fights). A mech within `hold` hexes of
// the goal stays where it is, so a guard does not walk into the hexes it is guarding.
function aiMoveToGoal(state, mech, goal, blocked) {
  const everywhere = reachableHexes(state.map, mech.pos, 999, blocked);
  const here = hexKey(mech.pos[0], mech.pos[1]);
  let best = null;
  for (const [c, r] of goal.hexes) {
    const node = everywhere.get(hexKey(c, r));
    if (node && (!best || node.cost < best.node.cost)) best = { c, r, node };
  }
  if (!best) return null;
  const stand = why => ({ plan: { mechId: mech.id, mode: 'stand', path: [] }, note: `${mech.id} stands still: ${why}`, intent: goal.intent });
  if (hexKey(best.c, best.r) === here || best.node.cost === 0) return stand(goal.why);
  const closest = Math.min(...goal.hexes.map(([c, r]) => hexDist(mech.pos[0], mech.pos[1], c, r)));
  if (closest <= goal.hold) return stand(`${goal.why}, close enough`);
  const run = goal.run && runAllowance(mech) > walkAllowance(mech) && mech.heat + MOVE_HEAT.run < AI_STAND_HEAT;
  const mode = run ? 'run' : 'walk';
  const path = pathWithin(state.map, pathTo(everywhere, best.c, best.r), allowanceFor(mech, mode));
  if (!path.length) return stand(`${goal.why}, but cannot take a step`);
  const end = path[path.length - 1];
  return { plan: { mechId: mech.id, mode, path }, note: `${mech.id} ${mode}s to ${hexKey(end[0], end[1])}: ${goal.why} (${best.node.cost} movement away)`, intent: goal.intent };
}

// Plans one mech's move. Returns { plan, note }: a move plan the rules accept, and a line of reasoning.
//
// A mech that can already shoot something from where it stands fine-tunes its position within this move: the
// reachable hex nearest the range it likes, with a view of the target and cover if possible. A mech that has
// nothing to shoot goes for the nearest hex it could shoot from, working out the route across the whole map, and
// walks as far along it as one move allows. (Scoring only the hexes of one move made slow mechs stall: right
// distance, no view, and every step toward a view looked worse than staying.)
function aiMoveFor(state, mechId) {
  const mech = mechById(state, mechId);
  if (!mech.alive) throw new PlanError('dead-mech', `aiMoveFor: ${mechId} is destroyed`);
  const stand = reason => ({ plan: { mechId, mode: 'stand', path: [] }, note: `${mech.id} stands still: ${reason}` });
  const enemies = livingMechs(state, otherSide(mech.side));
  if (!enemies.length) return stand('no enemies left');
  if (mech.crawler) return crawlerMove(state, mech); // the prison crawler (story) only ever drives along its road
  if (mech.shutdown) return stand('shut down');
  if (walkAllowance(mech) === 0) return stand('cannot move');
  if (mech.heat >= AI_STAND_HEAT) return stand(`cooling down at heat ${mech.heat}`);

  const blocked = occupiedKeys(state, mech.id);
  const repair = aiRepairGoal(state, mech);
  if (repair) { const moved = aiMoveToGoal(state, mech, repair, blocked); if (moved) return moved; } // (a bay someone stands on cannot be reached)
  const goal = aiGoalFor(state, mech);
  if (goal) { const moved = aiMoveToGoal(state, mech, goal, blocked); if (moved) return moved; }
  const sensor = goal ? null : aiSensorGoal(state, mech);
  if (sensor) { const moved = aiMoveToGoal(state, mech, sensor, blocked); if (moved) return moved; }

  let nearest = null;
  for (const e of enemies) {
    const d = hexDist(mech.pos[0], mech.pos[1], e.pos[0], e.pos[1]);
    if (!nearest || d < nearest.d) nearest = { e, d };
  }
  const carrier = enemies.find(e => e.carrying); // an enemy with the flag is the target that matters
  if (carrier) nearest = { e: carrier, d: hexDist(mech.pos[0], mech.pos[1], carrier.pos[0], carrier.pos[1]) };
  const target = nearest.e;
  const slots = eligibleWeapons(state, mech.id);
  const canFireNow = slots.some(slot => validTargets(state, mech.id, slot).length > 0);

  let path = [], why = '';
  if (canFireNow) {
    const reach = reachableHexes(state.map, mech.pos, allowanceFor(mech, 'walk'), blocked);
    let best = null;
    for (const [key, node] of reach) {
      const sees = hasLineOfSight(state.map, [node.c, node.r], target.pos);
      const score = Math.abs(hexDist(node.c, node.r, target.pos[0], target.pos[1]) - AI_RANGE) + (sees ? 0 : AI_NO_VIEW_PENALTY) - terrainAffinity(mech, terrainAt(state.map, node.c, node.r));
      if (!best || score < best.score || (score === best.score && node.cost < best.node.cost)) best = { key, node, score };
    }
    if (best.node.cost > 0) path = pathTo(reach, best.node.c, best.node.r);
    why = `can already fire; best hex against ${target.id} (range ${nearest.d})`;
  } else {
    const everywhere = reachableHexes(state.map, mech.pos, 999, blocked);
    const ownKey = hexKey(mech.pos[0], mech.pos[1]);
    const reachOfMech = Math.max(0, ...slots.map(slot => weaponById(mech.weapons[slot].id).range[2]));
    let goal = null;
    for (const [key, node] of everywhere) {
      if (key === ownKey) continue;
      const dist = hexDist(node.c, node.r, target.pos[0], target.pos[1]);
      if (dist > reachOfMech || !hasLineOfSight(state.map, [node.c, node.r], target.pos)) continue;
      const rank = [node.cost - terrainAffinity(mech, terrainAt(state.map, node.c, node.r)), Math.abs(dist - AI_RANGE)];
      if (!goal || rank[0] < goal.rank[0] || (rank[0] === goal.rank[0] && rank[1] < goal.rank[1])) goal = { key, node, rank };
    }
    if (goal) {
      path = pathWithin(state.map, pathTo(everywhere, goal.node.c, goal.node.r), allowanceFor(mech, 'walk'));
      why = `heads for ${goal.key}, a hex it can shoot ${target.id} from (${goal.node.cost} movement away)`;
    } else {
      // no hex has a shot (no weapons, or the target cannot be seen from anywhere): just close the distance
      const reach = reachableHexes(state.map, mech.pos, allowanceFor(mech, 'walk'), blocked);
      let best = null;
      for (const [key, node] of reach) {
        const d = hexDist(node.c, node.r, target.pos[0], target.pos[1]);
        if (!best || d < best.d || (d === best.d && node.cost < best.node.cost)) best = { key, node, d };
      }
      if (best.node.cost > 0) path = pathTo(reach, best.node.c, best.node.r);
      why = `no shot from anywhere against ${target.id}; closing the distance`;
    }
  }
  if (!path.length) return stand(`${why}; already as close as it can get`);
  const end = path[path.length - 1];
  return { plan: { mechId, mode: 'walk', path }, note: `${mech.id} walks to ${hexKey(end[0], end[1])}: ${why}` };
}

// Where a smoke rocket should go, or null to hold it. A mech screens ITSELF when an enemy with a laser or cannon could
// shoot it right now (smoke blocks line of sight, so it is not asked again while the cloud stands, and its own rockets
// still fire out through it): the classic defence of a medium mech. Otherwise it blinds an enemy standing on cooling
// ground (water), where the laser campers sit. Returns { targetId, reason }.
function aiSmokeTarget(state, mech, slot) {
  const valid = validTargets(state, mech.id, slot).map(s => s.targetId);
  const enemies = livingMechs(state, otherSide(mech.side));
  const direct = (e, from) => e.weapons.some(w => {
    if (w.id === 0 || w.off) return false;
    const def = weaponById(w.id);
    return (def.kind === 'laser' || def.kind === 'cannon') && hexDist(e.pos[0], e.pos[1], from[0], from[1]) <= def.range[2];
  });
  if (valid.includes(mech.id) && enemies.some(e => hasLineOfSight(state.map, e.pos, mech.pos) && direct(e, mech.pos))) {
    return { targetId: mech.id, reason: 'screens itself from direct fire' };
  }
  const camper = enemies.find(e => valid.includes(e.id) && terrainAt(state.map, e.pos[0], e.pos[1]).cool > 0 && !(state.map.smoke && state.map.smoke[hexKey(e.pos[0], e.pos[1])]));
  if (camper) return { targetId: camper.id, reason: 'blinds an enemy cooling in the water' };
  return { targetId: null, reason: 'none' };
}

// Both sides' fire for the combat step, planned on the same state before anything resolves (so neither plan sees the other's results).
// Returns { shots, notes } with the player's shots first.
function aiPlanCombat(state) {
  const p = aiPlanFire(state, 'player'), e = aiPlanFire(state, 'enemy');
  return { shots: [...p.shots, ...e.shots], notes: [...p.notes, ...e.notes] };
}

// Plans a whole side's fire. Returns { shots: [{ mechId, weaponSlot, targetId }...], notes: [...] }.
function aiPlanFire(state, side) {
  const shots = [], notes = [];
  for (const mech of livingMechs(state, side)) {
    const slots = eligibleWeapons(state, mech.id);
    // a mech that can do no more damage with a weapon blows itself up when that takes more enemies than friends with it
    if (!mech.shutdown && !canEverFire(mech) && !mech.tower && !mech.crawler) { // (a gun tower or the prison crawler never blows itself up)
      const around = neighbours(state.map, mech.pos[0], mech.pos[1]);
      const next = state.mechs.filter(m => m.alive && m.id !== mech.id && around.some(n => n.c === m.pos[0] && n.r === m.pos[1]));
      const foes = next.filter(m => m.side !== mech.side).length, friends = next.length - foes;
      if (foes > friends) { shots.push({ mechId: mech.id, destruct: true }); notes.push(`${mech.id} has no weapons left and self-destructs: ${foes} enemies and ${friends} friends beside it`); continue; }
    }
    if (!slots.length) { notes.push(`${mech.id} has no weapon that can fire`); continue; }
    let committed = 0;
    for (const slot of slots) {
      const weapon = weaponById(mech.weapons[slot].id);
      let aim = weapon.smoke ? aiSmokeTarget(state, mech, slot) : defaultTarget(state, mech.id, slot);
      if (weapon.kind === 'missile' && aim.targetId !== null) { // rockets heat their target, so cook the hottest one
        const hottest = validTargets(state, mech.id, slot).map(t => mechById(state, t.targetId)).sort((x, y) => y.heat - x.heat)[0];
        if (hottest.heat > mechById(state, aim.targetId).heat) aim = { ...aim, targetId: hottest.id, reason: `hottest target, heat ${hottest.heat}` };
      }
      const carrier = livingMechs(state, otherSide(mech.side)).find(e => e.carrying); // the enemy with the flag is the target that matters
      if (!weapon.smoke && carrier && validTargets(state, mech.id, slot).some(s => s.targetId === carrier.id)) aim = { targetId: carrier.id, reason: 'shoots the flag carrier' };
      const mark = state.objective && state.objective.id === 'hunt' && mech.side === 'player' ? state.objective.mark : null; // the player's side (the tests) shoots the mark first
      if (!weapon.smoke && mark && validTargets(state, mech.id, slot).some(s => s.targetId === mark)) aim = { targetId: mark, reason: 'shoots the mark' };
      const bank = state.objective && state.objective.id === 'core' && mech.side === 'player' ? validTargets(state, mech.id, slot).find(s => state.objective.targets.includes(s.targetId)) : null;
      if (!weapon.smoke && bank) aim = { targetId: bank.targetId, reason: 'shoots a memory bank' }; // and the finale's banks
      const ship = aiIsRaider(state, mech) ? state.objective.protect : null; // a raider shoots the dropship when it can
      if (!weapon.smoke && ship && validTargets(state, mech.id, slot).some(s => s.targetId === ship)) aim = { targetId: ship, reason: 'raids the dropship' };
      if (weapon.splash && aim.targetId !== null) { // the howitzer's splash hurts friends too: hold it if more friends than enemies stand beside the target
        const t = mechById(state, aim.targetId);
        const beside = state.mechs.filter(m => m.alive && m.id !== t.id && neighbours(state.map, t.pos[0], t.pos[1]).some(n => n.c === m.pos[0] && n.r === m.pos[1]));
        const friends = beside.filter(m => m.side === mech.side).length, foes = beside.length - friends;
        if (friends > foes) { notes.push(`${mech.id} holds ${weapon.name}: the splash on ${t.id} would hit ${friends} friends and ${foes} enemies`); continue; }
      }
      if (aim.targetId === null) { notes.push(`${mech.id} holds ${weapon.name}: no target`); continue; }
      if (mech.heat + committed + weapon.heat > AI_HEAT_CAP) { notes.push(`${mech.id} holds ${weapon.name}: heat ${mech.heat + committed} is too high`); continue; }
      committed += weapon.heat;
      shots.push({ mechId: mech.id, weaponSlot: slot, targetId: aim.targetId });
      notes.push(`${mech.id} fires ${weapon.name} at ${aim.targetId} (${aim.reason})`);
    }
  }
  return { shots, notes };
}
