'use strict';

// The rules of Mayhem Academy. Nothing here draws or waits: every function changes the game state and
// pushes events (game.events) that the screen turns into animation and sound. That keeps the rules testable
// on their own, and lets computer-only games run in a blink.

class RuleError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RuleError';
  }
}

const DIRS8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

// Where each pupil starts, by how many are playing.
// Spaced so every pupil has rivals at similar distances (the first version put one pupil between two others
// and it lost far too often).
const START_CELLS = {
  2: [[1, 4], [13, 5]],
  3: [[3, 1], [11, 1], [7, 9]],
  4: [[1, 1], [13, 1], [1, 8], [13, 8]],
  5: [[1, 2], [7, 0], [13, 2], [11, 9], [3, 9]],
  6: [[1, 2], [7, 0], [13, 2], [13, 7], [7, 9], [1, 7]],
};

// ---- small helpers ----
function inBounds(x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS; }
function dist(ax, ay, bx, by) { return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); } // diagonals count as one
function unitAt(game, x, y) { return game.units.find((u) => u.x === x && u.y === y) || null; }
function blobAt(game, x, y) { return game.blobs.find((b) => b.x === x && b.y === y) || null; }
function cellFree(game, x, y) { return inBounds(x, y) && !unitAt(game, x, y) && !blobAt(game, x, y) && !doorAt(game, x, y); }

// ---- terrain: spilled ink and secret passages (both fade after a few rounds) ----
function terrainAt(game, x, y) { return game.terrain.find((t) => t.x === x && t.y === y) || null; }
function inkAt(game, x, y) { const t = terrainAt(game, x, y); return t && t.kind === 'ink' ? t : null; }
function doorAt(game, x, y) { const t = terrainAt(game, x, y); return t && t.kind === 'door' ? t : null; }
function partnerDoor(game, door) { return game.terrain.find((t) => t.kind === 'door' && t.pair === door.pair && t !== door) || null; }

function addTerrain(game, tile) {
  const old = game.terrain.find((t) => t.kind === 'ink' && tile.kind === 'ink' && t.x === tile.x && t.y === tile.y);
  if (old) { old.ttl = tile.ttl; return old; } // more ink on a puddle just keeps it wet
  game.terrain.push(tile);
  return tile;
}

// The twin of a new door goes on the opposite side of the school; if that square is taken, the nearest free one.
function findPartnerCell(game, door) {
  const wantX = COLS - 1 - door.x, wantY = ROWS - 1 - door.y;
  for (let r = 0; r <= Math.max(COLS, ROWS); r++) {
    for (let y = wantY - r; y <= wantY + r; y++) {
      for (let x = wantX - r; x <= wantX + r; x++) {
        if (Math.max(Math.abs(x - wantX), Math.abs(y - wantY)) !== r) continue;
        if (inBounds(x, y) && cellFree(game, x, y) && !terrainAt(game, x, y) && !(x === door.x && y === door.y)) return { x, y };
      }
    }
  }
  return null;
}

// Where a unit really ends up after it moves to (x, y): through the twin door, sliding on ink, or just there.
// Does not change anything, so the computer players can use it to look ahead.
function moveOutcome(game, unit, x, y) {
  const door = doorAt(game, x, y);
  if (door) {
    const twin = partnerDoor(game, door);
    if (twin) return { x: twin.x, y: twin.y, how: 'door' };
  }
  if (inkAt(game, x, y) && !stats(game, unit).flying) {
    const dx = Math.sign(x - unit.x), dy = Math.sign(y - unit.y);
    let sx = x, sy = y;
    for (let i = 0; i < INK_SLIDE; i++) {
      const nx = sx + dx, ny = sy + dy;
      if (!inBounds(nx, ny) || unitAt(game, nx, ny) || blobAt(game, nx, ny) || doorAt(game, nx, ny)) break;
      sx = nx; sy = ny;
    }
    if (sx !== x || sy !== y) return { x: sx, y: sy, how: 'slide' };
  }
  return { x, y, how: 'walk' };
}
function unitOf(game, wizard) { return game.units.find((u) => u.id === wizard.unitId) || null; } // null once defeated
function creaturesOf(game, ownerId) { return game.units.filter((u) => u.owner === ownerId && u.type !== 'wizard'); }
function enemyUnits(game, ownerId) { return game.units.filter((u) => u.owner !== ownerId); }
function emit(game, event) { game.events.push(event); }

// A unit's current numbers (a pupil's depend on the spells they have cast).
function stats(game, unit) {
  if (unit.type === 'wizard') {
    const b = game.wizards[unit.owner].buffs;
    return {
      atk: BASE_WIZARD.atk + (b.wand ? BUFF_BONUS : 0),
      def: BASE_WIZARD.def + (b.shield ? BUFF_BONUS : 0),
      move: b.wings ? 3 : BASE_WIZARD.move,
      flying: b.wings,
      range: 0,
    };
  }
  return CREATURES[unit.type];
}

// Attack beats defence if (attack + a die) is higher than (defence + a die). Ties go to the defender.
function rollWins(rng, atk, def) {
  const a = atk + rng.range(1, 6);
  const d = def + rng.range(1, 6);
  return a > d;
}

function winChance(atk, def) {
  let wins = 0;
  for (let a = 1; a <= 6; a++) for (let d = 1; d <= 6; d++) if (atk + a > def + d) wins++;
  return wins / 36;
}

// ---- setting up ----
function dealHand(rng) {
  const total = SPELLS.reduce((sum, sp) => sum + sp.weight, 0);
  const hand = [];
  for (let i = 0; i < HAND_SIZE; i++) {
    let r = rng.int(total);
    for (const sp of SPELLS) {
      r -= sp.weight;
      if (r < 0) { hand.push({ spell: sp.id, used: false }); break; }
    }
  }
  const order = (id) => SPELLS.findIndex((sp) => sp.id === id);
  hand.sort((a, b) => order(a.spell) - order(b.spell));
  return hand;
}

function addUnit(game, { owner, type, x, y }) {
  const unit = { id: game.nextUnitId++, owner, type, x, y, fresh: type !== 'wizard', moved: false, acted: false, giggle: 0 };
  game.units.push(unit);
  return unit;
}

// players: [{ name, color, hat, familiar, human }]. The same seed always deals the same game.
function createGame(players, seed) {
  if (players.length < MIN_WIZARDS || players.length > MAX_WIZARDS) {
    throw new RuleError(`a game needs ${MIN_WIZARDS} to ${MAX_WIZARDS} pupils, not ${players.length}`);
  }
  const rng = new Rng(seed);
  const game = { rng, seed, wizards: [], units: [], blobs: [], terrain: [], nextPairId: 1, round: 1, nextUnitId: 1, events: [], over: false, result: null };
  players.forEach((p, i) => {
    const [x, y] = START_CELLS[players.length][i];
    const wizard = {
      id: i, name: p.name, color: p.color, hat: p.hat, familiar: p.familiar, human: !!p.human,
      alive: true, hand: dealHand(rng), choice: null, buffs: { shield: false, wand: false, wings: false }, unitId: null,
    };
    wizard.unitId = addUnit(game, { owner: i, type: 'wizard', x, y }).id;
    game.wizards.push(wizard);
  });
  return game;
}

// Pupils act in this order. It rotates each round so nobody always goes first.
function turnOrder(game) {
  const n = game.wizards.length;
  const order = [];
  for (let i = 0; i < n; i++) {
    const w = game.wizards[(game.round - 1 + i) % n];
    if (w.alive) order.push(w.id);
  }
  return order;
}

// ---- finishing the game ----
function checkOver(game) {
  if (game.over) return;
  const alive = game.wizards.filter((w) => w.alive);
  if (alive.length <= 1) {
    game.over = true;
    game.result = { winners: alive.map((w) => w.id), reason: 'lastStanding' };
    emit(game, { t: 'over', result: game.result });
  }
}

// The school bell: whoever has the most creatures left wins (a tie is shared).
function ringBell(game) {
  const counts = game.wizards.filter((w) => w.alive).map((w) => ({ id: w.id, n: creaturesOf(game, w.id).length }));
  const best = Math.max(...counts.map((c) => c.n));
  game.over = true;
  game.result = { winners: counts.filter((c) => c.n === best).map((c) => c.id), reason: 'bell' };
  emit(game, { t: 'over', result: game.result });
}

function defeatWizard(game, wizardId) {
  const w = game.wizards[wizardId];
  w.alive = false;
  for (const u of game.units.filter((x) => x.owner === wizardId)) removeUnit(game, u, 'vanish');
  emit(game, { t: 'wizardOut', wizard: wizardId });
  checkOver(game);
}

function removeUnit(game, unit, how) {
  const i = game.units.indexOf(unit);
  if (i === -1) throw new RuleError(`unit ${unit.id} (${unit.type}) is not on the board`);
  game.units.splice(i, 1);
  emit(game, { t: 'poof', x: unit.x, y: unit.y, type: unit.type, owner: unit.owner, how });
  if (unit.type === 'wizard') defeatWizard(game, unit.owner);
}

// ---- casting spells ----
function cellsInRange(cx, cy, range) {
  const cells = [];
  for (let y = cy - range; y <= cy + range; y++) {
    for (let x = cx - range; x <= cx + range; x++) if (inBounds(x, y)) cells.push({ x, y });
  }
  return cells;
}

function legalCastTargets(game, wizard, spellId) {
  const sp = SPELL_BY_ID[spellId];
  if (!sp) throw new RuleError(`there is no spell called "${spellId}"`);
  const me = unitOf(game, wizard);
  if (!me) return [];
  if (sp.kind === 'self') return [{ x: me.x, y: me.y }];
  const near = cellsInRange(me.x, me.y, sp.range);
  switch (sp.kind) {
    case 'summon':
    case 'blob':
      return near.filter((c) => cellFree(game, c.x, c.y));
    case 'bolt':
      return near.filter((c) => { const u = unitAt(game, c.x, c.y); return u && u.owner !== wizard.id; });
    case 'tickle':
      return near.filter((c) => { const u = unitAt(game, c.x, c.y); return u && u.owner !== wizard.id && u.type !== 'wizard'; });
    case 'area':
      return near.filter((c) => c.x !== me.x || c.y !== me.y);
    case 'ink':
      return near.filter((c) => !doorAt(game, c.x, c.y));
    case 'passage':
      return near.filter((c) => cellFree(game, c.x, c.y) && !terrainAt(game, c.x, c.y));
    default:
      throw new RuleError(`spell "${spellId}" has an unknown kind "${sp.kind}"`);
  }
}

// Can this spell be picked right now? (Used to grey out cards.)
function spellAvailable(game, wizard, spellId) {
  const sp = SPELL_BY_ID[spellId];
  if (sp.kind === 'self' && wizard.buffs[sp.buff]) return { ok: false, reason: 'Already working' };
  if (legalCastTargets(game, wizard, spellId).length === 0) {
    return { ok: false, reason: sp.kind === 'summon' || sp.kind === 'blob' || sp.kind === 'passage' ? 'No room nearby' : 'Nothing in range' };
  }
  return { ok: true, reason: '' };
}

function resolveHit(game, atk, defender, via) {
  const win = rollWins(game.rng, atk, stats(game, defender).def);
  emit(game, { t: 'hit', x: defender.x, y: defender.y, win, via });
  if (win) removeUnit(game, defender, via);
  return win;
}

// Cast one spell from a pupil's hand. target is a {x, y} from legalCastTargets, or null if there is nowhere to cast it
// (the spell is still used up). Returns true if the spell worked, false if it fizzled.
function castSpell(game, wizard, spellId, target) {
  const sp = SPELL_BY_ID[spellId];
  if (!sp) throw new RuleError(`there is no spell called "${spellId}"`);
  if (!wizard.alive) throw new RuleError(`${wizard.name} is in detention and cannot cast`);
  const item = wizard.hand.find((h) => h.spell === spellId && !h.used);
  if (!item) throw new RuleError(`${wizard.name} has no unused ${sp.name}`);
  const me = unitOf(game, wizard);
  item.used = true;

  const fizzle = (message) => {
    emit(game, { t: 'fizzle', wizard: wizard.id, spell: spellId, x: me.x, y: me.y, message });
    return false;
  };
  if (!target) return fizzle('There was nowhere for it to go!');
  if (!legalCastTargets(game, wizard, spellId).some((c) => c.x === target.x && c.y === target.y)) {
    item.used = false; // not a real cast: give the card back
    throw new RuleError(`${sp.name} cannot be cast at ${target.x},${target.y}`);
  }
  emit(game, { t: 'cast', wizard: wizard.id, spell: spellId, x: target.x, y: target.y });
  if (!game.rng.chance(sp.success)) return fizzle(game.rng.pick(FIZZLES));

  switch (sp.kind) {
    case 'summon': {
      const unit = addUnit(game, { owner: wizard.id, type: sp.creature, x: target.x, y: target.y });
      emit(game, { t: 'summon', unit: unit.id, x: unit.x, y: unit.y, type: unit.type, owner: wizard.id });
      break;
    }
    case 'bolt': {
      emit(game, { t: 'throw', fromX: me.x, fromY: me.y, toX: target.x, toY: target.y, kind: 'pie' });
      resolveHit(game, sp.power, unitAt(game, target.x, target.y), 'splat');
      break;
    }
    case 'area': {
      emit(game, { t: 'throw', fromX: me.x, fromY: me.y, toX: target.x, toY: target.y, kind: 'glitter' });
      const victims = game.units.filter((u) => u !== me && dist(u.x, u.y, target.x, target.y) <= 1);
      for (const v of victims) if (game.units.includes(v)) resolveHit(game, sp.power, v, 'splat');
      break;
    }
    case 'tickle': {
      const unit = unitAt(game, target.x, target.y);
      unit.giggle = 1;
      emit(game, { t: 'tickle', unit: unit.id, x: unit.x, y: unit.y });
      break;
    }
    case 'self': {
      wizard.buffs[sp.buff] = true;
      emit(game, { t: 'buff', wizard: wizard.id, buff: sp.buff, x: me.x, y: me.y });
      break;
    }
    case 'blob': {
      game.blobs.push({ x: target.x, y: target.y, owner: wizard.id });
      emit(game, { t: 'blob', x: target.x, y: target.y });
      break;
    }
    case 'ink': {
      const cells = [{ x: target.x, y: target.y }];
      const around = DIRS8.map(([dx, dy]) => ({ x: target.x + dx, y: target.y + dy })).filter((c) => inBounds(c.x, c.y) && !doorAt(game, c.x, c.y));
      cells.push(...game.rng.shuffle(around).slice(0, 2)); // a blot of three squares
      for (const c of cells) addTerrain(game, { kind: 'ink', x: c.x, y: c.y, owner: wizard.id, ttl: INK_ROUNDS });
      emit(game, { t: 'ink', cells });
      break;
    }
    case 'passage': {
      const twin = findPartnerCell(game, target);
      if (!twin) return fizzle('The walls were too busy.');
      const pair = game.nextPairId++;
      addTerrain(game, { kind: 'door', x: target.x, y: target.y, owner: wizard.id, ttl: PASSAGE_ROUNDS, pair });
      addTerrain(game, { kind: 'door', x: twin.x, y: twin.y, owner: wizard.id, ttl: PASSAGE_ROUNDS, pair });
      emit(game, { t: 'passage', a: { x: target.x, y: target.y }, b: twin });
      break;
    }
    default:
      throw new RuleError(`spell "${spellId}" has an unknown kind "${sp.kind}"`);
  }
  return true;
}

// ---- moving and attacking ----
// The squares a unit could move to this turn, as a Map of "x,y" to { x, y, steps }.
function reachableCells(game, unit) {
  const s = stats(game, unit);
  const reach = new Map();
  if (unit.fresh || unit.giggle > 0 || unit.moved || unit.acted || s.move <= 0) return reach;
  const seen = new Map([[`${unit.x},${unit.y}`, 0]]);
  let frontier = [[unit.x, unit.y]];
  for (let step = 1; step <= s.move; step++) {
    const next = [];
    for (const [cx, cy] of frontier) {
      for (const [dx, dy] of DIRS8) {
        const x = cx + dx, y = cy + dy, key = `${x},${y}`;
        if (!inBounds(x, y) || seen.has(key)) continue;
        const blocked = !!unitAt(game, x, y) || !!blobAt(game, x, y);
        if (blocked && !s.flying) continue; // walkers cannot pass things; flyers go over them
        seen.set(key, step);
        next.push([x, y]);
        if (!blocked) reach.set(key, { x, y, steps: step });
      }
    }
    frontier = next;
  }
  for (const [key, cell] of [...reach]) { // a door is shut while its twin is occupied
    const door = doorAt(game, cell.x, cell.y);
    if (!door) continue;
    const twin = partnerDoor(game, door);
    if (!twin || unitAt(game, twin.x, twin.y) || blobAt(game, twin.x, twin.y)) reach.delete(key);
  }
  return reach;
}

// What this unit could attack from (fromX, fromY): enemies next to it, anything in range for shooters,
// and slime next to it (which it just eats).
function attackTargets(game, unit, fromX = unit.x, fromY = unit.y) {
  const s = stats(game, unit);
  if (unit.fresh || unit.giggle > 0 || unit.acted || s.atk <= 0) return [];
  const out = [];
  for (const u of game.units) {
    if (u.owner === unit.owner) continue;
    const d = dist(fromX, fromY, u.x, u.y);
    if (d <= 1 || (s.range > 0 && d <= s.range)) out.push({ kind: 'unit', unit: u, x: u.x, y: u.y });
  }
  for (const b of game.blobs) {
    if (dist(fromX, fromY, b.x, b.y) <= 1) out.push({ kind: 'blob', x: b.x, y: b.y });
  }
  return out;
}

function unitCanAct(game, unit) {
  return reachableCells(game, unit).size > 0 || attackTargets(game, unit).length > 0;
}

function moveUnit(game, unit, x, y) {
  if (!reachableCells(game, unit).has(`${x},${y}`)) throw new RuleError(`${unit.type} cannot move to ${x},${y}`);
  const out = moveOutcome(game, unit, x, y); // worked out before the unit moves, since the slide goes the way it was heading
  emit(game, { t: 'move', unit: unit.id, fromX: unit.x, fromY: unit.y, toX: x, toY: y });
  if (out.how !== 'walk') emit(game, { t: out.how === 'door' ? 'teleport' : 'slide', unit: unit.id, fromX: x, fromY: y, toX: out.x, toY: out.y });
  unit.x = out.x;
  unit.y = out.y;
  unit.moved = true;
  if (out.how === 'door') { // one trip, and the passage collapses behind you
    const used = doorAt(game, x, y), twin = partnerDoor(game, used);
    for (const d of [used, twin]) {
      game.terrain.splice(game.terrain.indexOf(d), 1);
      emit(game, { t: 'terrainGone', kind: 'door', x: d.x, y: d.y, how: 'used' });
    }
  }
}

// target is one of the entries from attackTargets. Returns true if the attack landed.
function attackWith(game, attacker, target) {
  const legal = attackTargets(game, attacker).some((t) => t.kind === target.kind &&
    (t.kind === 'blob' ? t.x === target.x && t.y === target.y : t.unit === target.unit));
  if (!legal) throw new RuleError(`${attacker.type} cannot attack ${target.x},${target.y} from where it stands`);
  attacker.acted = true;
  if (target.kind === 'blob') {
    game.blobs.splice(game.blobs.findIndex((b) => b.x === target.x && b.y === target.y), 1);
    emit(game, { t: 'blobEat', x: target.x, y: target.y, by: attacker.id });
    return true;
  }
  const ranged = dist(attacker.x, attacker.y, target.x, target.y) > 1;
  emit(game, { t: 'attack', attacker: attacker.id, type: attacker.type, fromX: attacker.x, fromY: attacker.y, toX: target.x, toY: target.y, ranged });
  return resolveHit(game, stats(game, attacker).atk, target.unit, 'attack');
}

// ---- end of a round ----
function spreadBlobs(game) {
  for (const blob of game.rng.shuffle(game.blobs)) {
    if (game.blobs.length >= BLOB_CAP) break;
    if (!game.rng.chance(BLOB_SPREAD_PCT)) continue;
    const options = DIRS8.map(([dx, dy]) => ({ x: blob.x + dx, y: blob.y + dy }))
      .filter((c) => inBounds(c.x, c.y) && !blobAt(game, c.x, c.y) && !doorAt(game, c.x, c.y))
      .filter((c) => { const u = unitAt(game, c.x, c.y); return !u || u.type !== 'wizard'; }); // pupils are slime-proof
    if (!options.length) continue;
    const to = game.rng.pick(options);
    const victim = unitAt(game, to.x, to.y);
    if (victim) removeUnit(game, victim, 'slimed');
    game.blobs.push({ x: to.x, y: to.y, owner: blob.owner });
    emit(game, { t: 'blobSpread', fromX: blob.x, fromY: blob.y, x: to.x, y: to.y });
  }
}

function endRound(game) {
  if (game.over) return;
  spreadBlobs(game);
  for (const u of game.units) {
    u.fresh = false;
    u.moved = false;
    u.acted = false;
    if (u.giggle > 0) u.giggle--;
  }
  for (const t of [...game.terrain]) { // ink dries and passages seal themselves
    if (--t.ttl > 0) continue;
    game.terrain.splice(game.terrain.indexOf(t), 1);
    emit(game, { t: 'terrainGone', kind: t.kind, x: t.x, y: t.y });
  }
  game.round++;
  if (!game.over && game.round > MAX_ROUNDS) {
    emit(game, { t: 'bell' });
    ringBell(game);
  }
}
