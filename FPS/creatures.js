// THE LAB'S CREATURES: how they sense you and how they attack. They're in
// the same `enemies` list as the robots and run the same walking state
// machine (enemies.js); a type with `creature: true` in ENEMY_TYPES differs in:
//
//   HEARING. Robots answer to cameras and alarms; creatures answer to NOISE.
//     Every round you fire is a noise where you stand, and the faster the gun
//     is spinning the further it carries. Explosions carry furthest. A wall in
//     the way halves it. A creature that hears goes to look where the noise
//     WAS (its 'search' state), not straight at you.
//   SIGHT THAT NEEDS LIGHT. An unaware creature only spots you close up in
//     the dark, and much further off if you're standing in light, including
//     the light of your own muzzle flash. Once it's after you, it keeps track
//     of you whatever the light.
//   MELEE. Instead of charging a gun, a lurcher in reach REARS UP (the
//     warning: 'windup'), then LUNGES in a straight line at where you were
//     when it committed ('lunge'), then needs a moment to recover
//     ('recover'). Back off during the wind-up, or step aside as it lunges,
//     and it misses. It's slow, so on open floor you can always back away;
//     what makes it dangerous is a corridor, a corner, or a second one.
//   Creatures drop nothing when they die, and are never smart.
//
// Also here:
//   SPECIMEN TANKS. A creature listed with tank: true sleeps in a tank (one
//     floor cell walled in by tank glass, 'g') until a pane of it breaks:
//     your stray shot, a blast, or a spitter's acid. Then it comes for you.
//   THE CREATURES COME LOOSE. Burning the breeding chamber or the mother
//     plant (core.js) breaks every tank, bursts every pod, wakes every larva,
//     and from then on every creature always knows where you are. The
//     lights go red. Run.
//   PAIRS. Lurchers placed with the same `pair` tag hunt together. The one
//     that spots you calls (a two-voice cry), and its partner comes too. The
//     one further from you doesn't come straight in: it swings round to your
//     side, a quarter turn from its partner, so dodging one walks you into
//     the other.
// Feeding on the dead is in feeding.js; the stalker in stalker.js.
// The spitter's acid is in acid.js; the larvae and their pods in larvae.js;
// the HQ's infected suits in infected.js.

// How far each noise carries, in cells.
const SHOT_NOISE = { single: 4, burst: 6, auto: 9, overdrive: 10 }; // one round, by the gun's mode
const BLAST_NOISE = 12;
const WALL_MUFFLE = 0.5;   // a wall (or closed door) in the way: the noise carries half as far

const CREATURE_SIGHT = 5;  // cells: how far an aware creature tracks you, and an unaware one sees you in full light
const DARK_SIGHT = 0.35;   // in darkness an unaware one sees only this fraction as far (under 2 cells)

// The lurcher's attack. reach is centre to centre: closer than this as it
// lunges, and the claws connect.
const LURCHER_WINDUP = 0.6;       // seconds reared up before it lunges
const LURCHER_LUNGE_DIST = 1.4;   // cells
const LURCHER_LUNGE_SPEED = 5;    // cells per second: the lunge takes about 0.3s
const LURCHER_REACH = 0.6;
const LURCHER_RECOVER = 0.7;      // seconds it stands there afterwards: shoot it

const ATTACK_STATES = ['windup', 'lunge', 'recover'];
const PAIR_FLANK = 1.5;     // cells from you: where a pair's second lurcher heads, off to your side
const LOOSE_CALL_GAP = 1.5; // once the lab is loose: seconds between creatures being told where you are

let creaturesLoose = false;
let looseTimer = 0;

// A tank creature must have tank glass beside it, or nothing could ever wake it.
enemies.forEach((e, n) => {
  if (e.state !== 'dormant' || !ENEMY_TYPES[e.type].creature) return;
  const x = Math.floor(e.x), y = Math.floor(e.y);
  if (![[0, -1], [0, 1], [1, 0], [-1, 0]].some(([dx, dy]) => MAP[y + dy]?.[x + dx] === TANK_GLASS_CELL)) {
    throw new Error(`ENEMIES[${n}] (${e.type} at ${e.x}, ${e.y}) is in a tank (tank: true), but there's no tank glass ('g') beside its cell.`);
  }
});

// Pairs: each tag names exactly two lurchers.
const pairTags = {};
enemies.forEach((e, n) => {
  if (!e.pair) return;
  if (e.type !== 'lurcher') throw new Error(`ENEMIES[${n}] is a ${e.type} with pair "${e.pair}": only lurchers hunt in pairs.`);
  pairTags[e.pair] = (pairTags[e.pair] || 0) + 1;
});
for (const [tag, count] of Object.entries(pairTags)) {
  if (count !== 2) throw new Error(`Pair "${tag}" has ${count} lurchers: a pair is two.`);
}

function partnerOf(enemy) {
  return enemy.pair ? enemies.find((o) => o !== enemy && o.pair === enemy.pair) : null;
}

// One of a pair has seen you: it cries out, and its partner knows where you are.
function pairSpotted(enemy) {
  if (!enemy.pair || enemy.pairCalled) return;
  const partner = partnerOf(enemy);
  enemy.pairCalled = true;
  enemy.pairCaller = true; // sound.js plays the cry from this one
  partner.pairCalled = true;
  alertEnemy(partner, player.x, player.y);
}

// Where the second of a pair should head instead of straight at you: a
// quarter turn round you from its partner, on whichever side is nearer,
// PAIR_FLANK cells out. Only while its partner is alive and either nearer
// to you or already attacking; null otherwise (or if neither spot is floor).
function pairFlankPoint(enemy) {
  const partner = partnerOf(enemy);
  if (!partner || partner.state === 'dead') return null;
  const mine = Math.hypot(player.x - enemy.x, player.y - enemy.y);
  const theirs = Math.hypot(player.x - partner.x, player.y - partner.y);
  if (!ATTACK_STATES.includes(partner.state) && theirs >= mine) return null; // I'm the nearer one: straight in
  const a = Math.atan2(partner.y - player.y, partner.x - player.x);
  const spots = [a + Math.PI / 2, a - Math.PI / 2]
    .map((b) => ({ x: player.x + Math.cos(b) * PAIR_FLANK, y: player.y + Math.sin(b) * PAIR_FLANK }))
    .filter((p) => MAP[Math.floor(p.y)]?.[Math.floor(p.x)] === 0)
    .sort((p, q) => Math.hypot(p.x - enemy.x, p.y - enemy.y) - Math.hypot(q.x - enemy.x, q.y - enemy.y));
  return spots[0] || null;
}

// A sleeping creature wakes: it goes to look for you where you are now.
function wakeCreature(enemy) {
  if (enemy.state !== 'dormant') return;
  enemy.state = 'search';
  enemy.lastSeenX = player.x;
  enemy.lastSeenY = player.y;
}

// A pane of tank glass has gone (panels.js): whatever was in that tank is out.
function tankBroken(panel) {
  for (const e of enemies) {
    if (e.state !== 'dormant' || !ENEMY_TYPES[e.type].creature) continue;
    if (Math.abs(Math.floor(e.x) - panel.x) + Math.abs(Math.floor(e.y) - panel.y) === 1) wakeCreature(e);
  }
}

// The chamber is burning (core.js).
function creaturesComeLoose() {
  creaturesLoose = true;
  looseTimer = 0;
  for (const panel of PANELS) if (panel.tank) shatterGlass(panel);
  burstAllPods(); // larvae.js
  wakeAllMoths(); // pollinators.js
}

function updateCreatures(dt) {
  if (!creaturesLoose) return;
  looseTimer -= dt;
  if (looseTimer > 0) return;
  looseTimer = LOOSE_CALL_GAP;
  makeNoise(player.x, player.y, Infinity); // every creature, everywhere, hears where you are
}

// A ranged creature backing off: a step straight away from you. Returns
// whether it moved (if it's cornered, it stands and fights instead).
function retreatStep(enemy, dt) {
  return stepTowards(enemy, 2 * enemy.x - player.x, 2 * enemy.y - player.y, dt);
}

// A noise at (x, y) carrying `radius` cells: every creature that hears it
// goes to look. One already after you carries on.
function makeNoise(x, y, radius) {
  for (const e of enemies) {
    if (e.state === 'dead' || !ENEMY_TYPES[e.type].creature) continue;
    const reach = clearLine(x, y, e.x, e.y) ? radius : radius * WALL_MUFFLE;
    if (Math.hypot(e.x - x, e.y - y) <= reach) alertEnemy(e, x, y);
  }
  larvaeHear(x, y, radius); // larvae.js: waiting larvae, and the pods
  broodHears(x, y, radius); // brood.js: the brood mother wakes
}

// How far this creature can see you right now. Unaware (idle, or searching
// for a noise), it depends on the light where you stand: ambient (about
// 0.3) is dark, under a strip light (about 1.3) is full sight.
function creatureSightRange(enemy) {
  const full = enemy.type === 'guard' ? GUARD_SIGHT : CREATURE_SIGHT; // a guard sees further (guard.js)
  if (enemy.state !== 'idle' && enemy.state !== 'search') return full;
  return full * darkVisibility();
}

// How visible the light makes you: DARK_SIGHT in the dark, up to 1 in full light.
function playerVisibility() {
  const [r, g, b] = lightAt(player.x, player.y);
  return Math.min(1, Math.max(DARK_SIGHT, ((r + g + b) / 3 - 0.2) / 0.8));
}

// How well the creatures see you for SIGHT: as playerVisibility, except that
// with the power off they have night vision, as you do (nightvision.js).
// (A stalker's dislike of light still goes by the real light: stalker.js.)
function darkVisibility() {
  return nightVisionOn() ? 1 : playerVisibility();
}

// Called by updateWalker when a melee creature is in reach and sees you.
function startMeleeAttack(enemy) {
  enemy.state = 'windup';
  enemy.attackTime = 0;
}

// One frame of the attack, if one is under way. Returns false if it isn't,
// so the usual state machine runs instead. Once started, an attack always
// plays out: rearing up, the lunge, the recovery.
function updateMeleeAttack(enemy, dt) {
  if (!ATTACK_STATES.includes(enemy.state)) return false;
  enemy.attackTime += dt;

  if (enemy.state === 'windup') {
    // Keeps turning to follow you while it rears up...
    enemy.angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    if (enemy.attackTime >= LURCHER_WINDUP) {
      // ...then commits: the lunge goes where you are NOW, in a straight line.
      enemy.state = 'lunge';
      enemy.attackTime = 0;
      enemy.lungeLeft = LURCHER_LUNGE_DIST;
    }
    return true;
  }

  if (enemy.state === 'lunge') {
    const step = Math.min(LURCHER_LUNGE_SPEED * dt, enemy.lungeLeft);
    const nx = enemy.x + Math.cos(enemy.angle) * step;
    const ny = enemy.y + Math.sin(enemy.angle) * step;
    const blocked = enemyBlocked(enemy, nx, ny);
    if (!blocked) { enemy.x = nx; enemy.y = ny; }
    enemy.lungeLeft -= step;
    if (Math.hypot(player.x - enemy.x, player.y - enemy.y) < LURCHER_REACH) {
      damagePlayer(ENEMY_TYPES[enemy.type].damage);
      enemy.state = 'recover';
      enemy.attackTime = 0;
    } else if (blocked || enemy.lungeLeft <= 0) {
      enemy.state = 'recover'; // missed: it stumbles to a halt
      enemy.attackTime = 0;
    }
    return true;
  }

  // Recovering: it stands, then comes for you again.
  if (enemy.attackTime >= LURCHER_RECOVER) {
    enemy.state = 'chase';
    enemy.lastSeenX = player.x;
    enemy.lastSeenY = player.y;
  }
  return true;
}
