'use strict';

// The state of a game and the rules that change it, one tick (TICK_MS) at a time.
//
// People: a walker wanders the land looking for flat ground. On a flat tile with no house too near, it settles and
// becomes a house. A house's level (tent to castle) comes from the flat ground it has to itself; it fills up with
// people at its level's rate, earns its god manna, and when full sends out a walker with half its people. Land that
// stops being flat under a house breaks it (its people walk out); water drowns walkers, and houses with them.

const DT = TICK_MS / 1000;

// opts.land: a land of the campaign (an index into LANDS), which sets the map, the dark god's rules and the powers;
// without one it is an ordinary map with every power and FAIR_RULES.
function makeWorld(seed, opts = {}) {
  const land = opts.land === undefined ? null : LANDS[opts.land];
  if (opts.land !== undefined && !land) throw new WorldError('no-land', `there is no land ${opts.land} (0 to ${LANDS.length - 1})`);
  const terrain = generateTerrain(MAP_N, seed, land ? { ...MAP_STYLE, ...land.map } : MAP_STYLE), rules = land ? land.rules : FAIR_RULES;
  const world = {
    land: opts.land ?? null, rules, // rules: how hard the dark god plays (data.js)
    powers: new Set(land ? [...land.powers, 'stone'] : POWERS.map((p) => p.id)), // the powers both gods have here
    seed, terrain, tick: 0, rng: new Rng(seed ^ 0x5eed), over: null, // over: { winner } once a tribe is wiped out
    shake: 0,             // ticks of the screen shaking after an earthquake or volcano
    tribes: [0, 1].map((i) => ({ side: i === PLAYER ? 'good' : 'evil', manna: opts.manna ?? (i === PLAYER ? START_MANNA : rules.rivalManna), bridging: false, bridgeAt: null, lastPower: 0, mines: 0, weapons: 0 })),
    houses: [], walkers: [], sheep: [], stones: [[], []], nextId: 1,
    events: [],           // what happened since the screen last looked: { type, tribe, u, v, ... }
    cam: { u: 0, v: 0 },
    hover: null,          // the corner under the mouse
    armed: null,          // the power the player has picked, cast by the next click on the land
    message: '', messageTicks: 0,
  };
  if (opts.people !== false) {
    const home = startingTile(world, MAP_N * 0.3, MAP_N * 0.32);
    addHouse(world, PLAYER, home.u, home.v, START_PEOPLE);
    addWalker(world, PLAYER, home.u + 0.5, home.v + 0.5, 1);
    addWalker(world, PLAYER, home.u + 0.5, home.v + 0.5, 1);
    world.cam = clampCam(terrain, { u: home.u - VIEW_N / 2, v: home.v - VIEW_N / 2 });
    for (const [cu, cv] of [[0.7, 0.68], [0.8, 0.58]].slice(0, land ? land.rivalHomes : 1)) {
      const dark = startingTile(world, MAP_N * cu, MAP_N * cv);
      addHouse(world, RIVAL, dark.u, dark.v, START_PEOPLE);
      addWalker(world, RIVAL, dark.u + 0.5, dark.v + 0.5, 1);
      addWalker(world, RIVAL, dark.u + 0.5, dark.v + 0.5, 1);
    }
    for (const home of [{ u: MAP_N * 0.3, v: MAP_N * 0.32 }, { u: MAP_N * 0.7, v: MAP_N * 0.68 }]) {
      for (let i = 0; i < SHEEP_START; i++) {
        const spot = grassNear(world, Math.floor(home.u) + world.rng.int(13) - 6, Math.floor(home.v) + world.rng.int(13) - 6);
        if (spot) addSheep(world, spot.u + 0.5, spot.v + 0.5);
      }
    }
  }
  world.ai = opts.ai ?? [false, true]; // which tribes the computer plays
  world.contest = opts.contest ?? opts.people !== false; // false: a sandbox that never ends (for the checks)
  return world;
}

// The flat, clear tile nearest a point (and not close to another house), for a tribe's first house.
function startingTile(world, cu, cv) {
  let best = null, bestD = Infinity;
  for (let v = 0; v < MAP_N; v++) for (let u = 0; u < MAP_N; u++) {
    const d = (u - cu) ** 2 + (v - cv) ** 2;
    if (d < bestD && isFlat(world.terrain, u, v) && isClear(world.terrain, u, v) && !world.houses.some((h) => gap(h, { u, v }) < 4)) { best = { u, v }; bestD = d; }
  }
  if (!best) throw new WorldError('no-flat-land', `seed ${world.seed}: there is no flat land anywhere for a first house`);
  return best;
}

function say(world, message, ticks = 50) { world.message = message; world.messageTicks = ticks; }
const event = (world, type, fields) => world.events.push({ type, ...fields });

// ---- sheep ----
// A sheep grazes for a while (head down), then ambles to a spot a tile or two away on dry land, and grazes again.
function addSheep(world, x, y) {
  const sh = { id: world.nextId++, x, y, tx: x, ty: y, graze: 20 + world.rng.int(80) };
  world.sheep.push(sh);
  return sh;
}
// A dry land tile at or near (u, v) with nothing standing on it, or null.
function grassNear(world, u, v) {
  const t = world.terrain;
  for (let r = 0; r <= 3; r++) for (let b = v - r; b <= v + r; b++) for (let a = u - r; a <= u + r; a++) {
    if (a >= 0 && b >= 0 && a < t.n && b < t.n && !isWater(t, a, b) && isClear(t, a, b)) return { u: a, v: b };
  }
  return null;
}
function stepSheep(world) {
  const t = world.terrain;
  for (const sh of world.sheep) {
    if (sh.graze > 0) { sh.graze--; continue; }
    const dx = sh.tx - sh.x, dy = sh.ty - sh.y, d = Math.hypot(dx, dy), step = SHEEP_SPEED * DT;
    if (d > step) { sh.x += (dx / d) * step; sh.y += (dy / d) * step; continue; }
    sh.x = sh.tx; sh.y = sh.ty;
    sh.graze = 40 + world.rng.int(120); // 2 to 8 seconds with its head down
    const tx = sh.x + (world.rng.next() * 3 - 1.5), ty = sh.y + (world.rng.next() * 3 - 1.5);
    if (tx > 0 && ty > 0 && tx < t.n && ty < t.n && !isWater(t, Math.floor(tx), Math.floor(ty))) { sh.tx = tx; sh.ty = ty; }
  }
  // the land moves under sheep too: the sea and the swamps take them
  world.sheep = world.sheep.filter((sh) => {
    const u = Math.floor(sh.x), v = Math.floor(sh.y);
    if (isWater(t, u, v)) { event(world, 'baa', { u, v, drowned: true }); return false; }
    if (featureAt(t, u, v) === FEATURE.swamp) { t.f[v * t.n + u] = FEATURE.none; event(world, 'baa', { u, v, sank: true }); return false; }
    return true;
  });
  if (world.tick % LAMB_TICKS === 0 && world.sheep.length && world.sheep.length < SHEEP_MAX) { // a lamb, beside its mother
    const mum = world.sheep[world.rng.int(world.sheep.length)], spot = grassNear(world, Math.floor(mum.x), Math.floor(mum.y));
    if (spot) addSheep(world, spot.u + 0.5, spot.v + 0.5);
  }
}

// ---- people ----
function addHouse(world, tribe, u, v, pop) {
  if (!isFlat(world.terrain, u, v) || !isClear(world.terrain, u, v)) throw new RulesError('house-not-flat', `tribe ${tribe} cannot build on tile (${u}, ${v}): it is not flat and clear`);
  const h = { id: world.nextId++, tribe, u, v, level: 1, pop: 0 };
  world.houses.push(h);
  h.level = houseLevel(world, h);
  h.pop = Math.min(pop, CAP[h.level - 1]);
  return h;
}
function addWalker(world, tribe, x, y, strength, left = null) { // `left`: the id of the house they set out from
  const w = { id: world.nextId++, tribe, x, y, strength, tu: Math.floor(x), tv: Math.floor(y), from: null, age: 0, left,
    gathered: false, pilgrim: 0, arrived: false }; // at its god's hearth stone; walking to stone `pilgrim`; done (stones.js)
  world.walkers.push(w);
  return w;
}
const houseAt = (world, u, v) => world.houses.find((h) => h.u === u && h.v === v) || null;
const gap = (a, b) => Math.max(Math.abs(a.u - b.u), Math.abs(a.v - b.v));

// Somewhere a walker could settle: flat, clear of trees and rocks, no stone, and no house within HOUSE_GAP - 1 squares.
function canSettle(world, u, v) {
  return isFlat(world.terrain, u, v) && isClear(world.terrain, u, v) && !stoneAt(world, u, v) && !world.houses.some((h) => gap(h, { u, v }) < HOUSE_GAP);
}

// The flat ground a house has to itself: the tiles in the 5 x 5 around it that are flat at its height and clear, have no other
// house on them, and are nearer to it than to any other house (ties go to the older house).
function houseLand(world, house) {
  const t = world.terrain, level = tileCorners(t, house.u, house.v)[0], out = [];
  for (let v = house.v - 2; v <= house.v + 2; v++) for (let u = house.u - 2; u <= house.u + 2; u++) {
    if (u < 0 || v < 0 || u >= t.n || v >= t.n || !isFlat(t, u, v) || !isClear(t, u, v) || tileCorners(t, u, v)[0] !== level) continue;
    const mine = gap(house, { u, v });
    if (world.houses.some((o) => o !== house && (gap(o, { u, v }) < mine || (gap(o, { u, v }) === mine && o.id < house.id)))) continue;
    out.push({ u, v });
  }
  return out;
}
const flatScore = (world, house) => houseLand(world, house).length;
function houseLevel(world, house) {
  const score = flatScore(world, house);
  let level = 1;
  for (let i = 0; i < LEVEL_FROM.length; i++) if (score >= LEVEL_FROM[i]) level = i + 1;
  return level;
}

// Where a walker heads next: a neighbouring tile that is not sea, the flatter its surroundings the better, never
// straight back where it came from unless there is nowhere else. A stone calling it (stonePull) outweighs the rest.
function nextTile(world, w) {
  const t = world.terrain, u0 = w.tu, v0 = w.tv, options = [], foe = nearestFoe(world, w), pull = stonePull(world, w);
  const road = pull ? landSteps(t, pull.target) : null, onRoad = road && road[v0 * t.n + u0] >= 0; // the way over land to the stone
  for (let dv = -1; dv <= 1; dv++) for (let du = -1; du <= 1; du++) {
    const u = u0 + du, v = v0 + dv;
    if ((!du && !dv) || u < 0 || v < 0 || u >= t.n || v >= t.n || isWater(t, u, v)) continue;
    let flat = 0;
    for (let b = v - 1; b <= v + 1; b++) for (let a = u - 1; a <= u + 1; a++) if (a >= 0 && b >= 0 && a < t.n && b < t.n && isFlat(t, a, b) && isClear(t, a, b)) flat++;
    const back = w.from && w.from.u === u && w.from.v === v, h = houseAt(world, u, v);
    const room = h && h.tribe === w.tribe && h.id !== w.left && h.pop < CAP[h.level - 1] - 1;
    const closer = foe && gap(foe, { u, v }) < gap(foe, { u: u0, v: v0 }) ? 8 : 0; // the other tribe is near: go for it
    const drawn = !pull ? 0 : onRoad ? pull.weight * (road[v0 * t.n + u0] - road[v * t.n + u]) // a stone calls: along the way over land,
      : pull.weight * (Math.hypot(pull.target.u - u0, pull.target.v - v0) - Math.hypot(pull.target.u - u, pull.target.v - v)); // or straight at it
    const home = pull ? 0 : (canSettle(world, u, v) || room ? 6 : 0); // answering a stone, they don't look for a home
    options.push({ u, v, score: flat + home + closer + drawn + world.rng.next() * 3 - (back ? 20 : 0) });
  }
  if (!options.length) return null; // an islet of one tile: stay put
  options.sort((a, b) => b.score - a.score);
  return options[0];
}

// The nearest rival house or walker within SCENT squares of a walker, as a tile { u, v }, or null.
function nearestFoe(world, w) {
  const here = { u: w.tu, v: w.tv };
  let best = null, bestD = SCENT + 1;
  for (const h of world.houses) if (h.tribe !== w.tribe && gap(h, here) < bestD) { best = { u: h.u, v: h.v }; bestD = gap(h, here); }
  for (const o of world.walkers) {
    const at = { u: Math.floor(o.x), v: Math.floor(o.y) };
    if (o.tribe !== w.tribe && gap(at, here) < bestD) { best = at; bestD = gap(at, here); }
  }
  return best;
}

// A fight between two sides of strength a and b: a wins with chance a / (a + b), and the winner loses half the
// loser's strength (keeping at least one). Returns { aWins, left }.
// Weapons multiply each side: fa and fb. The odds go by armed strength, and the winner loses half the loser's armed
// strength, counted in its own (armed) people.
function fight(world, a, b, fa = 1, fb = 1) {
  const aWins = world.rng.next() < (a * fa) / (a * fa + b * fb);
  return { aWins, left: aWins ? Math.max(1, a - Math.floor((b * fb) / (2 * fa))) : Math.max(1, b - Math.floor((a * fa) / (2 * fb))) };
}
const armsOf = (world, tribe) => WEAPON_FACTOR[world.tribes[tribe].weapons];

// ---- mines ----
// The house a tile belongs to: the nearest within 2 squares (diagonal steps count one), the older house on a tie.
function ownerOf(world, u, v) {
  let best = null, bestD = 3;
  for (const h of world.houses) {
    const d = gap(h, { u, v });
    if (d < bestD || (d === bestD && best && h.id < best.id)) { best = h; bestD = d; }
  }
  return best;
}
// Every mine on the map with the house it belongs to (null if no house is near enough to work it).
function mines(world) {
  const t = world.terrain, out = [];
  for (let v = 0; v < t.n; v++) for (let u = 0; u < t.n; u++) if (t.f[v * t.n + u] === FEATURE.mine) out.push({ u, v, house: ownerOf(world, u, v) });
  return out;
}
// Houses big enough dig a mine in a boulder of their own; then each tribe's weapons follow its working mines.
function stepMines(world) {
  const t = world.terrain, all = mines(world), working = new Set(all.filter((m) => m.house).map((m) => m.house));
  for (const h of world.houses) {
    if (h.level < MINE_LEVEL || working.has(h)) continue;
    dig: for (let v = h.v - 2; v <= h.v + 2; v++) for (let u = h.u - 2; u <= h.u + 2; u++) {
      if (u < 0 || v < 0 || u >= t.n || v >= t.n || t.f[v * t.n + u] !== FEATURE.rock || ownerOf(world, u, v) !== h) continue;
      t.f[v * t.n + u] = FEATURE.mine;
      all.push({ u, v, house: h }); working.add(h);
      event(world, 'mine', { tribe: h.tribe, u, v });
      break dig; // one mine a house
    }
  }
  world.tribes.forEach((tr, i) => {
    tr.mines = all.filter((m) => m.house && m.house.tribe === i).length;
    let level = 0;
    for (let k = 0; k < WEAPON_FROM.length; k++) if (tr.mines >= WEAPON_FROM[k]) level = k;
    if (level > tr.weapons) event(world, 'armed', { tribe: i, weapons: level });
    tr.weapons = level;
  });
}

// Rival walkers that come close fight; the loser is gone.
function walkerFights(world) {
  for (let i = 0; i < world.walkers.length; i++) for (let j = i + 1; j < world.walkers.length; j++) {
    const a = world.walkers[i], b = world.walkers[j];
    if (a.tribe === b.tribe || Math.hypot(a.x - b.x, a.y - b.y) > FIGHT_RANGE) continue;
    const r = fight(world, a.strength, b.strength, armsOf(world, a.tribe), armsOf(world, b.tribe)), winner = r.aWins ? a : b, loser = r.aWins ? b : a;
    winner.strength = r.left;
    event(world, 'fight', { tribe: winner.tribe, loser: loser.tribe, u: Math.floor(loser.x), v: Math.floor(loser.y) });
    world.walkers.splice(world.walkers.indexOf(loser), 1);
    return walkerFights(world); // the list changed: start again
  }
}

// A walker that reaches a rival house attacks it: if it wins the house is razed and it walks on; if not it is lost
// and the house loses half its armed strength in people.
function attackHouse(world, w, h) {
  const r = fight(world, w.strength, Math.max(1, Math.floor(h.pop)), armsOf(world, w.tribe), armsOf(world, h.tribe));
  if (r.aWins) {
    w.strength = r.left;
    world.houses.splice(world.houses.indexOf(h), 1);
    event(world, 'razed', { tribe: w.tribe, loser: h.tribe, u: h.u, v: h.v });
    return true;
  }
  h.pop = Math.max(0, h.pop - Math.floor((w.strength * armsOf(world, w.tribe)) / (2 * armsOf(world, h.tribe))));
  world.walkers.splice(world.walkers.indexOf(w), 1);
  event(world, 'repelled', { tribe: h.tribe, loser: w.tribe, u: h.u, v: h.v });
  return false;
}

function stepWalker(world, w) {
  if (w.gathered) return; // waiting at the hearth stone for the rest
  if (!w.pilgrim) w.age += DT; // pilgrims are kept going by faith
  if (w.age >= WEAKEN_S) { // wandering wears them down
    w.age -= WEAKEN_S;
    w.strength -= Math.max(1, Math.floor(w.strength / 10));
    if (w.strength < 1) { world.walkers.splice(world.walkers.indexOf(w), 1); event(world, 'perish', { tribe: w.tribe, u: w.tu, v: w.tv }); return; }
  }
  const cx = w.tu + 0.5, cy = w.tv + 0.5, dx = cx - w.x, dy = cy - w.y, d = Math.hypot(dx, dy), step = WALK_SPEED * DT;
  if (d > step) { w.x += (dx / d) * step; w.y += (dy / d) * step; return; }
  w.x = cx; w.y = cy;
  const home = houseAt(world, w.tu, w.tv);
  if (home && home.tribe !== w.tribe && !attackHouse(world, w, home)) return;
  const line = world.stones[w.tribe];
  if (w.pilgrim && line[w.pilgrim] && gap(line[w.pilgrim], { u: w.tu, v: w.tv }) <= 1) { // reached its stone: on to the next
    w.pilgrim = w.pilgrim + 1 < line.length ? w.pilgrim + 1 : 0; // or, at the last, they are home
    if (!w.pilgrim) { w.arrived = true; event(world, 'arrived', { tribe: w.tribe, u: w.tu, v: w.tv }); }
  }
  if (!w.pilgrim && !w.arrived && line[0] && w.tu === line[0].u && w.tv === line[0].v) { w.gathered = true; return; } // at the hearth: gather
  if (w.pilgrim || stonePull(world, w)) { // on the way to a stone: no settling or moving in on the road
    const next = nextTile(world, w);
    if (next) { w.from = { u: w.tu, v: w.tv }; w.tu = next.u; w.tv = next.v; }
    return;
  }
  if (home && home.tribe === w.tribe && home.id !== w.left && home.pop < CAP[home.level - 1] - 1) { // one of ours with room: move in
    const room = Math.floor(CAP[home.level - 1] - home.pop), joining = Math.min(room, w.strength);
    home.pop += joining; w.strength -= joining;
    event(world, 'join', { tribe: w.tribe, u: home.u, v: home.v });
    if (w.strength < 1) { world.walkers.splice(world.walkers.indexOf(w), 1); return; }
  }
  if (canSettle(world, w.tu, w.tv)) { // arrived somewhere to live; any who don't fit walk on
    const h = addHouse(world, w.tribe, w.tu, w.tv, w.strength);
    event(world, 'settle', { tribe: w.tribe, u: h.u, v: h.v });
    w.strength = Math.floor(w.strength - h.pop);
    if (w.strength < 1) { world.walkers.splice(world.walkers.indexOf(w), 1); return; }
  }
  const next = nextTile(world, w);
  if (next) { w.from = { u: w.tu, v: w.tv }; w.tu = next.u; w.tv = next.v; }
}

// Walkers of the same tribe on the same tile join up.
function mergeWalkers(world) {
  for (let i = 0; i < world.walkers.length; i++) {
    const a = world.walkers[i];
    for (let j = world.walkers.length - 1; j > i; j--) {
      const b = world.walkers[j];
      if (b.tribe === a.tribe && Math.floor(b.x) === Math.floor(a.x) && Math.floor(b.y) === Math.floor(a.y)) {
        a.strength += b.strength;
        a.gathered = a.gathered || b.gathered; // joining a gathering, or a band of pilgrims, makes you one of them
        a.pilgrim = Math.max(a.pilgrim, b.pilgrim);
        if (a.pilgrim) a.gathered = false;
        world.walkers.splice(j, 1);
      }
    }
  }
}

// Land that has moved under people: walkers in the sea drown (or in a swamp sink), houses that are no longer on flat
// ground break up.
function checkFooting(world) {
  const t = world.terrain;
  world.walkers = world.walkers.filter((w) => {
    const u = Math.floor(w.x), v = Math.floor(w.y);
    if (isWater(t, u, v)) { event(world, 'drown', { tribe: w.tribe, u, v, lost: w.strength }); return false; }
    if (featureAt(t, u, v) === FEATURE.swamp) { // it swallows them, and is filled
      t.f[v * t.n + u] = FEATURE.none;
      event(world, 'sink', { tribe: w.tribe, u, v, lost: w.strength });
      return false;
    }
    return true;
  });
  world.houses = world.houses.filter((h) => {
    if (isFlat(t, h.u, h.v)) return true;
    const people = Math.max(1, Math.floor(h.pop));
    if (isWater(t, h.u, h.v)) event(world, 'drown', { tribe: h.tribe, u: h.u, v: h.v, lost: people });
    else { event(world, 'broken', { tribe: h.tribe, u: h.u, v: h.v }); addWalker(world, h.tribe, h.u + 0.5, h.v + 0.5, people); }
    return false;
  });
}

function stepHouses(world) {
  for (const h of world.houses) {
    const level = houseLevel(world, h);
    if (level !== h.level) {
      event(world, level > h.level ? 'grew' : 'shrank', { tribe: h.tribe, u: h.u, v: h.v, level });
      h.level = level;
    }
    const cap = CAP[h.level - 1];
    if (h.pop - cap >= 1) addWalker(world, h.tribe, h.u + 0.5, h.v + 0.5, Math.floor(h.pop - cap), h.id); // shrunk: the overflow leaves
    h.pop = Math.min(cap, h.pop + GROWTH[h.level - 1] * DT);
    world.tribes[h.tribe].manna += MANNA[h.level - 1] * DT;
    if (h.pop >= cap) { // full: half of them set out to find somewhere new
      const leaving = Math.floor(cap / 2);
      h.pop -= leaving;
      addWalker(world, h.tribe, h.u + 0.5, h.v + 0.5, leaving, h.id);
      event(world, 'leave', { tribe: h.tribe, u: h.u, v: h.v });
    }
  }
}

// How many people a tribe has, housed and walking.
function population(world, tribe) {
  let n = 0;
  for (const h of world.houses) if (h.tribe === tribe) n += h.pop;
  for (const w of world.walkers) if (w.tribe === tribe) n += w.strength;
  return Math.floor(n);
}

// ---- the god's hand ----
const REFUSALS = { edge: 'THE SEA AT THE EDGE WILL NOT MOVE', 'max-height': 'NO HIGHER', 'sea-bed': 'THAT IS THE SEA BED', 'no-manna': 'NOT ENOUGH MANNA' };

// Raise (dir 1) or lower (dir -1) a corner for a tribe's god, paying for every corner that moves. Returns
// { ok: true, cost } or { ok: false, reason }; a refusal to the player also puts a message up.
function shapeLand(world, u, v, dir, tribe = PLAYER) {
  const r = reshape(world.terrain, u, v, dir);
  if (!r.ok) { if (tribe === PLAYER) say(world, REFUSALS[r.reason]); return r; }
  const cost = costOf(r);
  if (cost > world.tribes[tribe].manna) { if (tribe === PLAYER) say(world, REFUSALS['no-manna']); return { ok: false, reason: 'no-manna' }; }
  world.terrain = r.terrain;
  world.tribes[tribe].manna -= cost;
  checkFooting(world);
  return { ok: true, cost };
}

// ---- a tick ----
function stepWorld(world) {
  world.tick++;
  if (world.messageTicks > 0 && --world.messageTicks === 0) world.message = '';
  if (world.shake > 0) world.shake--;
  if (world.over) return;
  for (const w of world.walkers.slice()) if (world.walkers.includes(w)) stepWalker(world, w);
  mergeWalkers(world);
  walkerFights(world);
  checkFooting(world);
  stepStones(world);
  stepHouses(world);
  stepMines(world);
  stepSheep(world);
  if (world.tick % AI_THINK_TICKS === 0) world.ai.forEach((on, tribe) => { if (on) aiThink(world, tribe); });
  checkWorld(world);
  const alive = world.tribes.map((_, i) => world.houses.some((h) => h.tribe === i) || world.walkers.some((w) => w.tribe === i));
  if (world.contest && (!alive[PLAYER] || !alive[RIVAL])) {
    world.over = { winner: alive[PLAYER] ? PLAYER : alive[RIVAL] ? RIVAL : null };
    event(world, alive[PLAYER] ? 'win' : 'lose', { tribe: PLAYER });
  }
}

// Throws if the people are somewhere they cannot be.
function checkWorld(world) {
  const t = world.terrain;
  for (const h of world.houses) {
    if (!isFlat(t, h.u, h.v)) throw new RulesError('house-not-flat', `house ${h.id} at (${h.u}, ${h.v}) is not on flat ground (tick ${world.tick})`);
    if (!(h.pop >= 0 && h.pop <= CAP[h.level - 1])) throw new RulesError('house-pop', `house ${h.id} has ${h.pop} people, cap ${CAP[h.level - 1]} (tick ${world.tick})`);
  }
  for (const w of world.walkers) {
    if (isWater(t, Math.floor(w.x), Math.floor(w.y))) throw new RulesError('walker-in-sea', `walker ${w.id} is in the sea at (${w.x}, ${w.y}) (tick ${world.tick})`);
    if (!(w.strength >= 1)) throw new RulesError('walker-strength', `walker ${w.id} has strength ${w.strength} (tick ${world.tick})`);
  }
  world.tribes.forEach((tr, i) => { if (!(tr.manna >= 0)) throw new RulesError('manna', `tribe ${i} has ${tr.manna} manna (tick ${world.tick})`); });
}
