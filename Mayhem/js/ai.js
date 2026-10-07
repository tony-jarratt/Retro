'use strict';

// The computer pupils. Deliberately simple and readable: each choice scores the options and takes the best,
// with a little randomness so games differ. All randomness comes from game.rng, so a seed replays exactly.

function nearestEnemyDist(game, ownerId, x, y) {
  let best = Infinity;
  for (const u of game.units) if (u.owner !== ownerId) best = Math.min(best, dist(x, y, u.x, u.y));
  return best;
}

// How much a target is worth hitting.
function unitValue(game, u) {
  if (u.type === 'wizard') return 12;
  const s = stats(game, u);
  return (s.atk + s.def) / 2 + 1 + (s.flying ? 1 : 0);
}

// How good a splat patch centred on (cx, cy) would be for this pupil: enemies hit count for, our own count against.
function patchValue(game, wizard, cx, cy, power) {
  const me = unitOf(game, wizard);
  let total = 0;
  for (const u of game.units) {
    if (u === me || dist(u.x, u.y, cx, cy) > 1) continue;
    const gain = unitValue(game, u) * winChance(power, stats(game, u).def);
    total += u.owner === wizard.id ? -gain : gain;
  }
  return total;
}

// ---- choosing a spell ----
function aiChooseSpell(game, wizard) {
  const me = unitOf(game, wizard);
  if (!me) return null;
  const mine = creaturesOf(game, wizard.id).length;
  const enemies = enemyUnits(game, wizard.id);
  const nearEnemy = nearestEnemyDist(game, wizard.id, me.x, me.y);
  let best = null, bestScore = 0.4;
  const seen = new Set();
  for (const item of wizard.hand) {
    if (item.used || seen.has(item.spell)) continue;
    seen.add(item.spell);
    const sp = SPELL_BY_ID[item.spell];
    if (!spellAvailable(game, wizard, sp.id).ok) continue;
    const p = sp.success / 100;
    let score = 0;
    switch (sp.kind) {
      case 'summon': {
        const c = CREATURES[sp.creature];
        let v = c.atk + c.def + c.move * 0.5 + (c.flying ? 1.5 : 0) + c.range * 0.5;
        if (sp.creature === 'fort') v = nearEnemy <= 4 ? 7 : 1.5;
        score = p * v * (mine < 3 ? 1.4 : mine >= 6 ? 0.5 : 1);
        break;
      }
      case 'bolt': {
        const targets = legalCastTargets(game, wizard, sp.id);
        const hitsWizard = targets.some((c) => unitAt(game, c.x, c.y).type === 'wizard');
        score = p * (6 + (hitsWizard ? 6 : 0));
        break;
      }
      case 'area': {
        const centres = legalCastTargets(game, wizard, sp.id);
        const bestPatch = Math.max(...centres.map((c) => patchValue(game, wizard, c.x, c.y, sp.power)));
        score = bestPatch > 0 ? p * bestPatch * 0.6 : 0;
        break;
      }
      case 'tickle': {
        const strongest = Math.max(...legalCastTargets(game, wizard, sp.id).map((c) => stats(game, unitAt(game, c.x, c.y)).atk));
        score = strongest >= 5 ? p * strongest * 0.7 : p;
        break;
      }
      case 'self':
        score = p * ({ shield: 5 + (nearEnemy <= 4 ? 3 : 0), wand: 4.5, wings: 3 }[sp.buff]);
        break;
      case 'blob':
        score = p * (enemies.length > mine + 2 ? 4 : 0.8);
        break;
      case 'ink':
        score = enemies.length ? p * 2.2 : 0;
        break;
      case 'passage':
        score = p * 2.0;
        break;
      default:
        throw new Error(`aiChooseSpell: unknown spell kind "${sp.kind}"`);
    }
    score += game.rng.next() * 1.2;
    if (score > bestScore) { bestScore = score; best = sp.id; }
  }
  return best; // null means take a nap this round
}


// ---- choosing where to cast ----
function aiChooseTarget(game, wizard, spellId) {
  const sp = SPELL_BY_ID[spellId];
  const targets = legalCastTargets(game, wizard, spellId);
  if (!targets.length) return null;
  const me = unitOf(game, wizard);
  let best = null, bestScore = -Infinity;
  for (const c of targets) {
    let score = 0;
    switch (sp.kind) {
      case 'self':
        score = 0;
        break;
      case 'summon': {
        const d = nearestEnemyDist(game, wizard.id, c.x, c.y);
        if (sp.creature === 'fort') score = -Math.abs(dist(c.x, c.y, me.x, me.y) - 1) - d * 0.1; // a wall close to home
        else score = -d + (creaturesOf(game, wizard.id).length === 0 && dist(c.x, c.y, me.x, me.y) <= 1 ? 1.5 : 0);
        break;
      }
      case 'bolt': {
        const u = unitAt(game, c.x, c.y);
        score = unitValue(game, u) * winChance(sp.power, stats(game, u).def);
        break;
      }
      case 'area':
        score = patchValue(game, wizard, c.x, c.y, sp.power);
        break;
      case 'tickle': {
        const u = unitAt(game, c.x, c.y);
        score = stats(game, u).atk + (stats(game, u).range ? 2 : 0);
        break;
      }
      case 'blob': {
        let near = 0;
        for (const u of game.units) {
          if (dist(u.x, u.y, c.x, c.y) <= 1) near += u.owner === wizard.id ? -1 : (u.type === 'wizard' ? 0 : 1);
        }
        score = near * 2 - nearestEnemyDist(game, wizard.id, c.x, c.y) * 0.3;
        break;
      }
      case 'ink': { // in the way of the enemy, and away from our own pets
        const own = creaturesOf(game, wizard.id).filter((u) => dist(u.x, u.y, c.x, c.y) <= 2).length;
        score = -nearestEnemyDist(game, wizard.id, c.x, c.y) * 0.5 - own * 1.5;
        break;
      }
      case 'passage': // a door close to us, so the twin on the far side is a shortcut for our pets
        score = -dist(c.x, c.y, me.x, me.y) * 0.5;
        break;
      default:
        throw new Error(`aiChooseTarget: unknown spell kind "${sp.kind}"`);
    }
    score += game.rng.next() * 0.5;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return { x: best.x, y: best.y };
}

// ---- moving a unit ----
// Roughly how worried a unit should be about standing at (x, y): enemies that could reach it next turn.
function dangerAt(game, unit, x, y) {
  const mine = stats(game, unit);
  let danger = 0;
  for (const e of game.units) {
    if (e.owner === unit.owner) continue;
    const es = stats(game, e);
    if (es.atk <= 0) continue;
    const reach = Math.max(es.move + 1, es.range);
    if (dist(e.x, e.y, x, y) <= reach) danger += winChance(es.atk, mine.def);
  }
  return danger * (unit.type === 'wizard' ? 12 : (mine.atk + mine.def) / 2 + 1);
}

// Decide what one unit does this turn: { to: {x, y} | null, attack: target | null }, or null if it can do nothing.
function aiPlanUnit(game, unit) {
  if (unit.fresh || unit.giggle > 0 || unit.acted) return null;
  const s = stats(game, unit);
  const options = [{ x: unit.x, y: unit.y, stay: true }];
  for (const cell of reachableCells(game, unit).values()) options.push({ x: cell.x, y: cell.y, stay: false });
  const isWizard = unit.type === 'wizard';
  let best = null, bestScore = -Infinity;
  for (const opt of options) {
    const at = opt.stay ? opt : moveOutcome(game, unit, opt.x, opt.y); // where it would really end up (a slide, or through a door)
    let attackScore = 0, chosen = null;
    for (const t of attackTargets(game, unit, at.x, at.y)) {
      const v = t.kind === 'blob' ? 2.5 : unitValue(game, t.unit) * winChance(s.atk, stats(game, t.unit).def);
      if (v > attackScore) { attackScore = v; chosen = t; }
    }
    const d = nearestEnemyDist(game, unit.owner, at.x, at.y);
    const approach = isWizard || !Number.isFinite(d) ? 0 : -0.3 * d;
    const company = isWizard ? 0.2 * creaturesOf(game, unit.owner).filter((c) => dist(c.x, c.y, at.x, at.y) <= 2).length : 0;
    const danger = dangerAt(game, unit, at.x, at.y) * (isWizard ? 0.15 : 0.1);
    const score = attackScore + approach + company - danger + game.rng.next() * 0.3;
    if (score > bestScore) { bestScore = score; best = { opt, chosen }; }
  }
  if (!best) return null;
  return { to: best.opt.stay ? null : { x: best.opt.x, y: best.opt.y }, attack: best.chosen };
}

// Do a plan straight away (used by the computer-only simulation; the screen does it step by step with animation).
function aiExecutePlan(game, unit, plan) {
  if (plan.to) moveUnit(game, unit, plan.to.x, plan.to.y);
  if (plan.attack && !game.over) attackWith(game, unit, plan.attack);
}

// ---- a whole round with every pupil played by the computer ----
function aiPlayRound(game) {
  const order = turnOrder(game);
  for (const id of order) {
    const w = game.wizards[id];
    w.choice = aiChooseSpell(game, w);
  }
  for (const id of order) {
    const w = game.wizards[id];
    if (!w.alive || !w.choice) continue;
    castSpell(game, w, w.choice, aiChooseTarget(game, w, w.choice));
    if (game.over) return;
  }
  for (const id of order) {
    const w = game.wizards[id];
    if (!w.alive) continue;
    const units = game.units.filter((u) => u.owner === id).sort((a, b) => (a.type === 'wizard') - (b.type === 'wizard'));
    for (const u of units) {
      if (!game.units.includes(u) || game.over) continue;
      const plan = aiPlanUnit(game, u);
      if (plan) aiExecutePlan(game, u, plan);
    }
    if (game.over) return;
  }
  endRound(game);
}

function aiSimulateGame(players, seed) {
  const game = createGame(players, seed);
  let rounds = 0;
  while (!game.over) {
    if (++rounds > MAX_ROUNDS + 2) throw new Error(`simulation did not finish: seed ${seed}, round ${game.round}`);
    aiPlayRound(game);
    game.events.length = 0;
  }
  return { game, rounds, winners: game.result.winners, reason: game.result.reason };
}
