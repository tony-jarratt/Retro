'use strict';

// The win conditions. Last mech standing is always in force: a side with no mech left loses, whatever the goal. On top of that a battle has one
// goal, set up in state.objective (plain JSON, so cloneState and the replays keep working):
//   annihilation  destroy every enemy mech (no round limit)
//   flag          capture the flag: pick it up (a move that passes through or ends on its hex), carry it to your base (a carrier cannot run), and a
//                 destroyed carrier drops it where it died
//   hill          king of the hill: at the end of each round the side with MORE living mechs in the zone scores a point (level scores nothing); first to HILL_TARGET wins
//   exit          get to the exit: when every living mech of a side is inside its side's exit hexes at once, that side wins (the slowest mech sets the pace)
//   raid          (story only) destroy every target (the gun towers, ids in `targets`), then the runner (one named mech of the player's) has to
//                 stand in the hangar. If the runner is destroyed the player has lost; at the round limit too
//   core          (story only, the finale) destroy every target (`targets`: the memory banks). One of the player's mechs (`holder`) starts in the
//                 gate, the only way into the hall, and holds it. The round limit loses
//   hunt          (story only) destroy the marked enemy mech (`mark`); the rest do not matter. The round limit loses
//   heist         (story only) capture the flag one way: the player picks up the crate (`flag`, the same rules: a carrier cannot run, a destroyed
//                 carrier drops it) and carries it to its extraction hexes (`bases.player`); the enemy cannot pick it up. The round limit loses
//   defend        (story only) hold out until the end of round `rounds` with `protect` (one of the player's units, the dropship) still standing.
//                 It destroyed and the player has lost
//   escort        (story only) the prison crawler (`escort`, one of the player's units, no guns) drives itself along `route` (a list of road hexes)
//                 and has to reach its end. It destroyed, or the round limit, and the player has lost
//   escape        (story only) the player's whole living squad has to reach its exit before the round limit, and at least `minOut` of them
//                 have to be alive to do it: once fewer are left the player has lost. The enemy only hunts. At the limit the player has lost
//                 (the dropship has gone), whatever the armour
// Every goal but annihilation has a round limit; at the limit the battle is decided on points (hill), then armour left, else a draw.
// The goal's own rules run from three hooks the rules call: objectiveAfterMove, objectiveSync (a carrier destroyed) and objectiveAfterRound.

const HILL_TARGET = 4;

const OBJECTIVES = {
  annihilation: {
    id: 'annihilation', name: 'LAST MECH STANDING', ready: true, roundLimit: null, sizes: ['small', 'large'],
    blurb: 'Destroy every enemy mech.',
  },
  flag: {
    id: 'flag', name: 'CAPTURE THE FLAG', ready: true, roundLimit: 20, sizes: ['large'],
    blurb: 'Grab the flag from the middle of the map and carry it back to your base. A carrier cannot run, and a destroyed carrier drops the flag.',
  },
  hill: {
    id: 'hill', name: 'KING OF THE HILL', ready: true, roundLimit: 15, sizes: ['large'],
    blurb: `Hold the hill in the middle. Each round the side with more mechs on it scores a point; first to ${HILL_TARGET} wins.`,
  },
  exit: {
    id: 'exit', name: 'GET TO THE EXIT', ready: true, roundLimit: 15, sizes: ['large'],
    blurb: 'Get your whole squad into your exit hexes before the enemy gets theirs into theirs. The slowest mech sets the pace.',
  },
  escape: { // a story goal: not offered in free play (story: true keeps it out of OBJECTIVE_IDS)
    id: 'escape', name: 'ESCAPE', ready: true, roundLimit: 10, sizes: ['small', 'large'], story: true, minOut: 2,
    blurb: 'Get your whole squad to the exit before time runs out, at least two of you. The enemy only has to stop you.',
  },
};
OBJECTIVES.raid = { // a story goal
  id: 'raid', name: 'RAID', ready: true, roundLimit: 14, sizes: ['small', 'large'], story: true,
  blurb: 'Destroy the gun towers, then get the runner into the hangar. Lose the runner and you have lost.',
};
OBJECTIVES.core = { // a story goal: the finale
  id: 'core', name: 'THE CORE', ready: true, roundLimit: 12, sizes: ['small', 'large'], story: true,
  blurb: 'Destroy the three memory banks. One of you holds the doors.',
};
OBJECTIVES.hunt = { // a story goal
  id: 'hunt', name: 'HUNT', ready: true, roundLimit: 14, sizes: ['small', 'large'], story: true,
  blurb: 'Destroy the marked mech. Nothing else matters.',
};
OBJECTIVES.heist = { // a story goal
  id: 'heist', name: 'HEIST', ready: true, roundLimit: 14, sizes: ['small', 'large'], story: true,
  blurb: 'Take the crate and carry it to the extraction point. A carrier cannot run, and a destroyed carrier drops it.',
};
OBJECTIVES.defend = { // a story goal
  id: 'defend', name: 'DEFEND', ready: true, roundLimit: null, sizes: ['small', 'large'], story: true,
  blurb: 'Keep the dropship standing until it has refuelled. Their raiders will go for it.',
};
OBJECTIVES.escort = { // a story goal
  id: 'escort', name: 'ESCORT', ready: true, roundLimit: 14, sizes: ['small', 'large'], story: true,
  blurb: 'Keep the prison crawler alive until it reaches the end of the road. Anything on the road stops it.',
};
const OBJECTIVE_IDS = Object.keys(OBJECTIVES).filter(id => !OBJECTIVES[id].story); // the free play goals
// Which map sizes a goal can be played on (`sizes` above): the small maps are only big enough for a straight fight; the flag, the hill and the exit
// need room, so they are large-map goals. The menu and the address enforce it; the rules and the tests can still run any goal on any map.
function goalAllowsSize(goalId, size) { return OBJECTIVES[goalId].sizes.includes(size); }
const DEFAULT_OBJECTIVE_ID = 'annihilation';

// ---------- setting up ----------
function setupObjective(state, scenario, goalId) {
  const def = OBJECTIVES[goalId];
  if (!def) throw new RulesError('goal', `Unknown win condition "${goalId}"`);
  const o = { id: goalId, roundLimit: def.roundLimit, result: null };
  if (goalId === 'flag' || goalId === 'heist') {
    o.flag = { pos: scenario.flag.slice(), carrier: null };
    o.bases = scenario.bases;
  } else if (goalId === 'hill') {
    o.zone = scenario.zone;
    o.score = { player: 0, enemy: 0 };
    o.target = HILL_TARGET;
  } else if (goalId === 'exit' || goalId === 'escape') {
    o.exits = scenario.exits;
    if (goalId === 'escape') o.minOut = def.minOut;
  } else if (goalId === 'core') {
    o.targets = scenario.targets.slice(); o.gate = scenario.gate; o.holder = scenario.holder;
  } else if (goalId === 'hunt') {
    o.mark = scenario.mark; o.home = scenario.markHome;
  } else if (goalId === 'defend') {
    o.protect = scenario.protect; o.rounds = scenario.rounds;
  } else if (goalId === 'escort') {
    o.escort = scenario.escort; o.route = scenario.route;
  } else if (goalId === 'raid') {
    o.targets = scenario.targets.slice(); o.hangar = scenario.hangar; o.runner = scenario.runner;
  }
  state.objective = o;
}

function inGroup(group, pos) { return group.some(h => h[0] === pos[0] && h[1] === pos[1]); }

// The raid: are the targets all down, and is the runner (alive) in the hangar? Decides the battle either way.
function targetsLeft(state) { return state.objective.targets.filter(id => mechById(state, id).alive).length; }
function raidCheck(state, events) {
  const o = state.objective, runner = mechById(state, o.runner);
  if (!runner.alive) { o.result = { winner: 'enemy', code: 'raid-runner' }; return; }
  if (targetsLeft(state) === 0 && inGroup(o.hangar, runner.pos)) { o.result = { winner: 'player', code: 'raid' }; events.push({ type: 'hangar', mechId: runner.id }); }
}

// The escape: too few left alive to get out loses; every survivor on the pad wins. Checked after moves and after every fire phase, so the
// last straggler dying with the rest already on the pad wins too.
function escapeCheck(state) {
  const o = state.objective, squad = livingMechs(state, 'player');
  if (squad.length < o.minOut) { o.result = { winner: 'enemy', code: 'escape-lost' }; return; }
  if (squad.every(m => inGroup(o.exits.player, m.pos))) o.result = { winner: 'player', code: 'escape' }; // the whole squad is out
}

// ---------- the hooks ----------
// Called by moveMech after a mech has moved along `path`. May start the flag moving with the mech, and may decide the battle.
function objectiveAfterMove(state, mech, path, events) {
  const o = state.objective;
  if (!o || o.result || !path.length) return;
  if (o.id === 'raid') { raidCheck(state, events); return; }
  if (o.id === 'escort') {
    if (mech.id === o.escort && sameHex(mech.pos, o.route[o.route.length - 1])) { o.result = { winner: 'player', code: 'escort' }; events.push({ type: 'crawler-out', mechId: mech.id }); }
    return;
  }
  if (o.id === 'flag' || (o.id === 'heist' && mech.side === 'player')) { // (in a heist only the player can pick the crate up)
    const f = o.flag;
    if (!f.carrier && f.pos && path.some(h => h[0] === f.pos[0] && h[1] === f.pos[1])) {
      f.carrier = mech.id; f.pos = null; mech.carrying = true;
      events.push({ type: 'flag-taken', mechId: mech.id });
    }
    if (f.carrier === mech.id && inGroup(o.bases[mech.side], mech.pos)) {
      o.result = { winner: mech.side, code: o.id };
      events.push({ type: 'flag-captured', mechId: mech.id });
    }
  } else if (o.id === 'escape' && mech.side === 'player') {
    if (inGroup(o.exits.player, mech.pos)) events.push({ type: 'exit-reached', mechId: mech.id });
    escapeCheck(state);
  } else if (o.id === 'exit') {
    const squad = livingMechs(state, mech.side);
    if (inGroup(o.exits[mech.side], mech.pos)) events.push({ type: 'exit-reached', mechId: mech.id });
    if (squad.every(m => inGroup(o.exits[mech.side], m.pos))) o.result = { winner: mech.side, code: 'exit' }; // the whole squad is out
  }
}

// Called after damage may have destroyed the flag carrier: the flag drops where the carrier stood.
function objectiveSync(state, events) {
  const o = state.objective;
  if (o && o.id === 'raid' && !o.result) { raidCheck(state, events); return; }
  if (o && o.id === 'escape' && !o.result) { escapeCheck(state); return; }
  if (o && o.id === 'core' && !o.result) { if (targetsLeft(state) === 0) o.result = { winner: 'player', code: 'core' }; return; }
  if (o && o.id === 'hunt' && !o.result) { if (!mechById(state, o.mark).alive) o.result = { winner: 'player', code: 'hunt' }; return; }
  if (o && o.id === 'defend' && !o.result) { if (!mechById(state, o.protect).alive) o.result = { winner: 'enemy', code: 'defend-lost' }; return; }
  if (o && o.id === 'escort' && !o.result) { if (!mechById(state, o.escort).alive) o.result = { winner: 'enemy', code: 'escort-lost' }; return; } // the last tower may fall with the runner already inside, or the runner may die
  if (!o || (o.id !== 'flag' && o.id !== 'heist') || !o.flag.carrier) return;
  const carrier = mechById(state, o.flag.carrier);
  if (carrier.alive) return;
  o.flag.pos = carrier.pos.slice(); o.flag.carrier = null; carrier.carrying = false;
  events.push({ type: 'flag-dropped', mechId: carrier.id, pos: o.flag.pos.slice() });
}

// Called by endRound once the round's heat and explosions are done: the hill scores, then the round limit.
function objectiveAfterRound(state, events) {
  const o = state.objective;
  if (!o || o.result) return;
  objectiveSync(state, events);
  if (o.result) return; // (the raid's runner may have died in the heat, or got in)
  if (o.id === 'defend' && state.round >= o.rounds) { o.result = { winner: 'player', code: 'defend' }; return; } // refuelled, and still standing
  if (o.id === 'hill') {
    const inside = side => livingMechs(state, side).filter(m => inGroup(o.zone, m.pos)).length;
    const p = inside('player'), e = inside('enemy');
    if (p !== e) {
      const side = p > e ? 'player' : 'enemy';
      o.score[side] += 1;
      events.push({ type: 'score', side, points: o.score[side] });
      if (o.score[side] >= o.target) { o.result = { winner: side, code: 'hill' }; return; }
    }
  }
  if (o.roundLimit && state.round >= o.roundLimit) {
    const hp = sideHealth(state, 'player'), he = sideHealth(state, 'enemy');
    if (o.id === 'raid') o.result = { winner: 'enemy', code: 'raid-late' };
    else if (o.id === 'heist') o.result = { winner: 'enemy', code: 'heist-late' };
    else if (o.id === 'hunt') o.result = { winner: 'enemy', code: 'hunt-late' };
    else if (o.id === 'core') o.result = { winner: 'enemy', code: 'core-late' };
    else if (o.id === 'escort') o.result = { winner: 'enemy', code: 'escort-late' };
    else if (o.id === 'escape') o.result = { winner: 'enemy', code: 'escape-late' }; // the squad did not all get out in time
    else if (o.id === 'hill' && o.score.player !== o.score.enemy) o.result = { winner: o.score.player > o.score.enemy ? 'player' : 'enemy', code: 'time-points' };
    else if (hp !== he) o.result = { winner: hp > he ? 'player' : 'enemy', code: 'time-armour' };
    else o.result = { winner: 'draw', code: 'time-draw' };
  }
}

// The armour points a side has left in total (the pool of each living mech, or its armour and structure in the advanced damage model).
function sideHealth(state, side) {
  let total = 0;
  for (const m of livingMechs(state, side)) {
    if (m.model === 'pool') total += m.hp;
    else for (const loc of LOCATIONS) total += m.armour[loc] + m.structure[loc];
  }
  return total;
}

// ---------- telling the player ----------
// How far along its road the crawler is: its index in the route (it never leaves the road).
function crawlerIndex(state) {
  const o = state.objective, m = mechById(state, o.escort);
  const i = o.route.findIndex(h => sameHex(h, m.pos));
  if (i < 0) throw new RulesError('crawler', `The crawler ${m.id} is at ${hexKey(m.pos[0], m.pos[1])}, which is not on its road`);
  return i;
}
function crawlerToGo(state) { return state.objective.route.length - 1 - crawlerIndex(state); }

// The crawler's move: up to CRAWLER_SPEED hexes on along its road, stopping short of the first hex anyone stands on. Returns { plan, note, intent }:
// intent names what blocks it (for the log), or null.
function crawlerMove(state, mech) {
  const o = state.objective, route = o.route;
  const taken = occupiedKeys(state, mech.id);
  const i = crawlerIndex(state), path = [];
  let blocker = null;
  for (let k = i + 1; k < route.length && path.length < walkAllowance(mech); k++) {
    if (taken.has(hexKey(route[k][0], route[k][1]))) { blocker = livingMechs(state).find(m => sameHex(m.pos, route[k])); break; }
    path.push(route[k]);
  }
  const intent = blocker ? `${mech.id} BLOCKED BY ${blocker.id}` : null;
  if (!path.length) return { plan: { mechId: mech.id, mode: 'stand', path: [] }, note: `${mech.id} waits: ${blocker ? blocker.id + ' is on the road' : 'at the end of the road'}`, intent };
  return { plan: { mechId: mech.id, mode: 'walk', path }, note: `${mech.id} drives ${path.length} hexes along the road`, intent };
}

function callSignOf(state, id) { const m = mechById(state, id); return m.pilot || m.id; }

function runnerName(state) { const m = mechById(state, state.objective.runner); return m.pilot || m.id; }

// Why the battle ended, in words, from the player's side.
function reasonText(state, code, winner) {
  const you = winner === 'player';
  const hp = sideHealth(state, 'player'), he = sideHealth(state, 'enemy');
  const o = state.objective;
  switch (code) {
    case 'annihilated': return winner === 'draw' ? 'Every mech on both sides was destroyed' : you ? 'Every enemy mech was destroyed' : 'All your mechs were destroyed';
    case 'flag': return you ? 'You carried the flag back to your base' : 'The enemy carried the flag back to their base';
    case 'exit': return you ? 'Your whole squad reached the exit' : 'The enemy squad reached their exit';
    case 'escape': return 'Your whole squad got out';
    case 'core': return 'The memory banks are dark';
    case 'core-late': return `Time ran out after round ${o.roundLimit}: the banks are still running`;
    case 'hunt': return `${mechById(state, o.mark).name} is down`;
    case 'hunt-late': return `Time ran out after round ${o.roundLimit}: ${mechById(state, o.mark).name} is still standing`;
    case 'heist': return 'You got the crate out';
    case 'heist-late': return `Time ran out after round ${o.roundLimit}: the crate never got out`;
    case 'defend': return `You held out for ${o.rounds} rounds: the dropship is fuelled`;
    case 'defend-lost': return 'The dropship was destroyed';
    case 'escort': return 'The crawler made it out of the canyon';
    case 'escort-lost': return 'The crawler was destroyed';
    case 'escort-late': return `Time ran out after round ${o.roundLimit}: the crawler is still in the canyon`;
    case 'raid': return `The towers are down and ${runnerName(state)} is in the hangar`;
    case 'raid-runner': return `${runnerName(state)} was destroyed: nobody else can start the heavy`;
    case 'raid-late': return `Time ran out after round ${o.roundLimit}: the garrison held the depot`;
    case 'escape-lost': { const n = livingMechs(state, 'player').length; return n ? `Only ${n} of you left: it takes ${o.minOut} to get out` : 'All your mechs were destroyed'; }
    case 'escape-late': return `Time ran out after round ${o.roundLimit}: not everyone got out`;
    case 'hill': return `${you ? 'You' : 'The enemy'} held the hill: ${o.score.player} points to ${o.score.enemy}`;
    case 'time-points': return `Time up: ${you ? 'you' : 'the enemy'} led on hill points, ${o.score.player} to ${o.score.enemy}`;
    case 'time-armour': return `Time up: ${you ? 'you' : 'the enemy'} had more armour left (${hp} to ${he})`;
    case 'time-draw': return `Time up: level on armour (${hp} each), a draw`;
    default: throw new RulesError('reason', `Unknown reason code "${code}"`);
  }
}

// What the screen shows about the goal during a battle: { name, lines }, from the player's side.
function objectiveStatus(state) {
  const o = state.objective || { id: DEFAULT_OBJECTIVE_ID, roundLimit: null };
  const def = OBJECTIVES[o.id];
  const lines = [];
  if (o.roundLimit) lines.push(`ROUND ${state.round} OF ${o.roundLimit}`);
  if (o.id === 'hill') lines.push(`HILL  YOU ${o.score.player}  ENEMY ${o.score.enemy}  (FIRST TO ${o.target})`);
  if (o.id === 'escape') lines.push(`SQUAD: ${livingMechs(state, 'player').length} LEFT, ${o.minOut} MUST GET OUT`);
  if (o.id === 'defend') lines.push(`REFUELLING: ROUND ${state.round} OF ${o.rounds}`);
  if (o.id === 'escort') lines.push(`CRAWLER: ${crawlerToGo(state)} HEXES TO GO`);
  if (o.id === 'raid') lines.push(targetsLeft(state) ? `TOWERS STANDING ${targetsLeft(state)} OF ${o.targets.length}` : `TOWERS DOWN: ${runnerName(state)} TO THE HANGAR`);
  if (o.id === 'core') { const h = mechById(state, o.holder); lines.push(`BANKS STANDING ${targetsLeft(state)} OF ${o.targets.length}   THE DOORS: ${h.pilot || h.id}${h.alive ? '' : ' (FALLEN)'}`); }
  if (o.id === 'hunt') { const m = mechById(state, o.mark); lines.push(`TARGET: ${m.name} ${m.alive ? `ARMOUR ${m.hp} / ${m.maxHp}` : 'DOWN'}`); }
  if (o.id === 'heist') lines.push(o.flag.carrier ? `CRATE: ${callSignOf(state, o.flag.carrier)} CARRIES IT` : 'CRATE: ON THE GROUND');
  if (o.id === 'flag') lines.push(o.flag.carrier ? `FLAG: ${o.flag.carrier} CARRIES IT` : o.flag.pos ? 'FLAG: ON THE GROUND' : 'FLAG: LOST');
  if (sensorHexes(state.map).length) { // (not the goal, but the header is where the battle's standing is told)
    const you = holdsSensor(state, 'player'), them = holdsSensor(state, 'enemy');
    lines.push(`SENSOR TOWER: ${you && them ? 'BOTH SIDES' : you ? 'YOURS (-1 TO HIT)' : them ? 'THEIRS (-1 TO HIT)' : 'NOBODY'}`);
  }
  return { name: def.name, lines };
}
