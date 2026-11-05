'use strict';

// Checks for the enemy forces (ENEMY_FORCES in data.js): legal builds, cost bands, variety, the per-battle pick and the bay's enemy button.
// Loaded after checks-goals.js.

const FORCE_TIER_COST = { easy: 87, normal: 118, hard: 144 }; // what the one fixed squad of each difficulty cost before there were pools

check('forces: every difficulty has at least five forces with different names and different make-ups', () => {
  for (const d of Object.keys(DIFFICULTIES)) {
    const pool = ENEMY_FORCES[d];
    assert(pool.length >= 5, `${d} has ${pool.length} forces`);
    eq(new Set(pool.map(f => f.name)).size, pool.length, d + ': names differ');
    eq(new Set(pool.map(f => JSON.stringify(f.mechs))).size, pool.length, d + ': squads differ');
    for (const f of pool) assert(f.blurb.length > 10 && !/lance|clan/i.test(f.name + f.blurb), `${d} ${f.name}: a blurb, and no tabletop vocabulary`);
  }
});

check('forces: every force is a legal build that fits the map and costs within 8% of its difficulty\'s enemy cost', () => {
  for (const d of Object.keys(DIFFICULTIES)) {
    for (const f of ENEMY_FORCES[d]) {
      assert(f.mechs.length >= 1 && f.mechs.length <= 3, `${d} ${f.name} size`);
      for (const spec of f.mechs) checkCapacity(spec); // throws BuildError for a bad build
      const cost = squadCost(f.mechs), tier = FORCE_TIER_COST[d];
      assert(cost >= tier * 0.92 && cost <= tier * 1.08, `${d} ${f.name} costs ${cost}, outside 8% of ${tier}`);
    }
  }
  eq(ENEMY_SQUADS.normal, ENEMY_FORCES.normal[0].mechs, 'the old fixed squads are the first force of each pool');
});

check('forces: the pick from a seed is repeatable, differs between seeds, reaches every force, and never touches the dice', () => {
  for (const d of Object.keys(DIFFICULTIES)) {
    const seen = new Set();
    for (let seed = 1; seed <= 200; seed++) {
      const a = pickEnemyForce(d, seed);
      eq(pickEnemyForce(d, seed), a, 'same seed, same force');
      assert(a >= 0 && a < ENEMY_FORCES[d].length);
      seen.add(a);
    }
    eq(seen.size, ENEMY_FORCES[d].length, d + ': every force turns up in 200 seeds');
  }
  const r = new Rng(5), before = r.next();
  pickEnemyForce('normal', 5);
  eq(new Rng(5).next(), before, 'the pick used a stream of its own');
});

check('forces: a battle fights the force it is given, names it in the state, and refuses a force that does not exist', () => {
  for (let i = 0; i < ENEMY_FORCES.normal.length; i++) {
    const s = battleFor(SUGGESTED_SQUADS[0].mechs, 'normal', 'player', 'pool', SCENARIO, 'annihilation', i);
    eq(s.enemyForce, ENEMY_FORCES.normal[i].name);
    eq(s.mechs.filter(m => m.side === 'enemy').map(m => m.chassisId), ENEMY_FORCES.normal[i].mechs.map(m => m.chassis));
  }
  throwsKind(BuildError, 'enemy', () => battleFor(SUGGESTED_SQUADS[0].mechs, 'normal', 'player', 'pool', SCENARIO, 'annihilation', 9));
  eq(battleFor(SUGGESTED_SQUADS[0].mechs, 'normal').enemyForce, 'HEAVY SCREEN', 'the default is the first force');
});

check('forces: the AI plays every force on every difficulty to a result', () => {
  for (const d of Object.keys(DIFFICULTIES)) {
    ENEMY_FORCES[d].forEach((f, i) => {
      const s = battleFor(SUGGESTED_SQUADS[1].mechs, d, 'player', 'pool', SCENARIO, 'annihilation', i);
      runFight(s, new Rng(40 + i), 60);
      assert(s.over, `${d} ${f.name} did not finish`);
    });
  }
});

check('bay: it shows the next enemy force as a button, and a new enemy is always a different one from the same pool', () => {
  const bay = newBay(BAY_SQUAD, 'normal');
  const first = bayButtons(bay).find(b => b.id === 'enemy');
  assert(first.label.includes(ENEMY_FORCES.normal[0].name) && first.label.includes(String(squadCost(ENEMY_FORCES.normal[0].mechs))) && first.sub.includes('JACKAL'), first.label + ' / ' + first.sub);
  assert(first.tip.includes('different enemy'), first.tip);
  for (let draw = 0; draw < 1; draw += 0.07) {
    const before = bay.enemyIndex;
    bayNewEnemy(bay, draw);
    assert(bay.enemyIndex !== before && bay.enemyIndex >= 0 && bay.enemyIndex < ENEMY_FORCES.normal.length, `draw ${draw}: ${before} -> ${bay.enemyIndex}`);
  }
  bay.difficulty = 'hard'; bay.enemyIndex = 2;
  assert(bayButtons(bay).find(b => b.id === 'enemy').label.includes(ENEMY_FORCES.hard[2].name), 'follows the difficulty');
  const bays = bayButtons(bay);
  bayPress(bay, bays.find(b => b.id === 'enemy'));
  assert(bay.enemyIndex !== 2, 'pressing the button rerolls');
});

// ---------- the report ----------
function forceReport(fights) {
  const lines = ['', `FORCES: each enemy force against the four suggested squads, AI v AI, ${fights} fights each (you win - lose)`];
  for (const d of Object.keys(DIFFICULTIES)) {
    const cells = ENEMY_FORCES[d].map((f, i) => {
      let w = 0, l = 0;
      for (const q of SUGGESTED_SQUADS) for (let k = 0; k < fights; k++) {
        const s = battleFor(q.mechs, d, k % 2 ? 'enemy' : 'player', 'pool', SCENARIO, 'annihilation', i);
        runFight(s, new Rng(700 + k), 40);
        if (s.winner === 'player') w++; else if (s.winner === 'enemy') l++;
      }
      return `${f.name} ${w}-${l}`;
    });
    lines.push(`  ${d}: ${cells.join(', ')}`);
  }
  return lines;
}
