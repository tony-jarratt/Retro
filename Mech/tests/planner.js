'use strict';

// A fight runner (both sides played by the AI) and the squad builder, used by the balance run and the replay
// checks.

// One whole round, both sides played by the AI, following roundPhases: the first side moves each mech, the second
// side moves each mech, then both sides fire at once (planned on the same state, resolved together; the fight stops
// if that leaves a side with no mech), then the end of the round. Returns all the events.
function playRound(state, rng) {
  const events = [];
  for (const phase of roundPhases(state.first)) {
    if (phase.kind === 'move') {
      for (const mech of livingMechs(state, phase.side)) {
        events.push(...moveMech(state, aiMoveFor(state, mech.id).plan));
        if (finishIfOver(state)) return events; // a flag captured or an exit reached ends the battle at once
      }
    } else {
      events.push(...resolveFirePhase(state, aiPlanCombat(state).shots, rng));
      if (finishIfOver(state)) return events;
    }
  }
  events.push(...endRound(state, rng));
  return events;
}

// Fights until one side is gone. Returns { winner: 'player' | 'enemy' | 'draw' | 'timeout', rounds }.
function runFight(state, rng, maxRounds = 40) {
  let rounds = 0;
  while (!state.over && rounds < maxRounds) {
    playRound(state, rng);
    rounds += 1;
  }
  return { winner: state.over ? state.winner : 'timeout', rounds };
}

// ---------- building squads to a budget, for the balance run ----------
// Fills the weapon slots in priority order while the budget allows (keeping money back for `armourReserve`
// armour levels), then spends whatever is left on armour.
function buildToBudget(chassisId, budget, priority, armourReserve) {
  const chassis = chassisById(chassisId);
  const spec = { chassis: chassisId, armour: 0, sinks: 0, weapons: [0, 0, 0] };
  const perLevel = ARMOUR_COST_PER_LEVEL[chassis.cls];
  let spent = chassis.cost + armourReserve * perLevel;
  let slot = 0, room = chassis.capacity;
  for (const id of priority) {
    if (slot >= spec.weapons.length) break;
    const { cost, size } = weaponById(id);
    if (spent + cost <= budget && size <= room) { spec.weapons[slot++] = id; spent += cost; room -= size; }
  }
  spec.armour = Math.min(ARMOUR_MAX, Math.floor((budget - (spent - armourReserve * perLevel)) / perLevel));
  if (spec.armour < 0) throw new BuildError('budget', `${chassis.name} does not fit in ${budget} credits`);
  return spec;
}

// One monolith against three jackals, each side built to the same budget.
function balanceSquads(budget) {
  const priority = [2, 5, 2, 7, 4, 6];
  return {
    super: [buildToBudget(6, budget, priority, 3)],
    trio: [0, 1, 2].map(() => buildToBudget(2, Math.floor(budget / 3), [2, 4, 1, 6], 1)),
  };
}

// Fights the super mech squad against the trio, half the fights with each on the player's side, and returns
// the tally. Nothing here fails a check: the numbers are for the owner to read and tune from.
function balanceRun(budget, fightsPerSide) {
  const squads = balanceSquads(budget);
  const tally = { super: 0, trio: 0, draw: 0, timeout: 0, rounds: 0, fights: 0 };
  for (let i = 0; i < fightsPerSide; i++) {
    for (const superIsPlayer of [true, false]) {
      const state = newBattle({
        playerSpecs: superIsPlayer ? squads.super : squads.trio,
        enemySpecs: superIsPlayer ? squads.trio : squads.super,
        playerToHit: PLAYER_TO_HIT, enemyToHit: PLAYER_TO_HIT,
        first: i % 2 === 0 ? 'player' : 'enemy', // each squad goes first about half the time
      });
      const result = runFight(state, new Rng(1000 + i * 2 + (superIsPlayer ? 0 : 1)));
      tally.fights += 1;
      tally.rounds += result.rounds;
      if (result.winner === 'draw') tally.draw += 1;
      else if (result.winner === 'timeout') tally.timeout += 1;
      else if ((result.winner === 'player') === superIsPlayer) tally.super += 1;
      else tally.trio += 1;
    }
  }
  return { squads, tally };
}

// ---------- shot statistics, for tuning the to-hit numbers ----------
// Plays `fights` AI-vs-AI fights of a squad against a difficulty's enemy squad (sides swapping who goes first) and counts every
// to-hit roll: how many there were, the average chance they were shown with, how many hit, fumbles (natural 1) and criticals
// (natural 20), and how the fights ended.
function shotStats(specs, difficulty, fights) {
  const out = { shots: 0, chance: 0, hits: 0, fumbles: 0, crits: 0, rounds: 0, wins: 0, losses: 0, other: 0 };
  for (let i = 0; i < fights; i++) {
    const state = battleFor(specs, difficulty, i % 2 ? 'enemy' : 'player');
    const rng = new Rng(500 + i);
    let rounds = 0;
    while (!state.over && rounds < 40) {
      for (const e of playRound(state, rng)) {
        if (e.type === 'shot' && e.roll !== null) {
          out.shots += 1; out.hits += e.hit ? 1 : 0; out.chance += (21 - e.need) * 5;
          out.fumbles += e.fumble ? 1 : 0; out.crits += e.roll === 20 ? 1 : 0;
        }
      }
      rounds += 1;
    }
    out.rounds += rounds;
    if (state.winner === 'player') out.wins += 1; else if (state.winner === 'enemy') out.losses += 1; else out.other += 1;
  }
  return out;
}

function shotReport(fights) {
  const lines = ['', `SHOTS: the four suggested squads against each enemy squad, AI v AI, ${fights} fights each`];
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    const total = { shots: 0, chance: 0, hits: 0, fumbles: 0, crits: 0, rounds: 0, wins: 0, losses: 0, other: 0 };
    const perSquad = [];
    for (const q of SUGGESTED_SQUADS) {
      const s = shotStats(q.mechs, difficulty, fights);
      for (const k of Object.keys(total)) total[k] += s[k];
      perSquad.push(`${q.name} ${s.wins}-${s.losses}`);
    }
    const pct = (n, of) => (of ? (100 * n / of).toFixed(0) : '0') + '%';
    lines.push(`  ${difficulty}: ${total.shots} shots, shown chance ${(total.chance / total.shots).toFixed(0)}% on average, ${pct(total.hits, total.shots)} hit, fumbles ${pct(total.fumbles, total.shots)}, crits ${pct(total.crits, total.shots)}, ${(total.rounds / (fights * SUGGESTED_SQUADS.length)).toFixed(1)} rounds; you win-lose: ${perSquad.join(', ')}`);
  }
  return lines;
}

// ---------- the goals: how the battles end ----------
// Plays AI-vs-AI fights of the suggested squads on every map for each goal (sides swapping who goes first) and counts how they end
// (the part of the reason before any colon or number: the goal reached, a wipe-out, or time up) and how long they take.
function goalReport(fightsPerSquad) {
  const lines = ['', `GOALS: the four suggested squads vs the normal enemy on every map, AI v AI, ${fightsPerSquad} fights each squad and map`];
  for (const goal of OBJECTIVE_IDS) {
    const ends = {}, perMap = {};
    let rounds = 0, fights = 0, wins = 0;
    for (const id of SCENARIO_IDS) {
      if (!goalAllowsSize(goal, SCENARIOS[id].size)) continue; // the game does not offer this goal on this size
      perMap[id] = { rounds: 0, fights: 0 };
      for (const q of SUGGESTED_SQUADS) {
        for (let i = 0; i < fightsPerSquad; i++) {
          const force = (i + SUGGESTED_SQUADS.indexOf(q)) % ENEMY_FORCES.normal.length; // every normal enemy force turns up
          const state = battleFor(q.mechs, 'normal', i % 2 ? 'enemy' : 'player', 'pool', SCENARIOS[id], goal, force);
          const rng = new Rng(900 + i);
          let n = 0;
          while (!state.over && n < 60) { playRound(state, rng); n += 1; }
          rounds += n; fights += 1; wins += state.winner === 'player' ? 1 : 0;
          perMap[id].rounds += n; perMap[id].fights += 1;
          const how = state.over ? state.reason.replace(/[0-9]+/g, 'N').replace(/\(N to N\)/, '').replace(/ N to N/, '').replace(/: N points to N/, '') : 'NOT FINISHED';
          ends[how] = (ends[how] || 0) + 1;
        }
      }
    }
    lines.push(`  ${OBJECTIVES[goal].name}: average ${(rounds / fights).toFixed(1)} rounds (${Object.keys(perMap).map(id => `${id} ${(perMap[id].rounds / perMap[id].fights).toFixed(1)}`).join(', ')}), you win ${Math.round(100 * wins / fights)}% of ${fights}; ended by: ${Object.entries(ends).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k.trim()} ${v}`).join('; ')}`);
  }
  return lines;
}
