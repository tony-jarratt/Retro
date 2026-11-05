// THE LAB'S CREATURES: how they sense you and how they attack. They're in
// the same `enemies` list as the robots and run the same walking state
// machine (enemies.js); a type with `creature: true` in ROBOT_TYPES differs in:
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

// How far each noise carries, in cells.
const SHOT_NOISE = { single: 4, burst: 6, auto: 9 }; // one round, by the gun's mode
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

// A noise at (x, y) carrying `radius` cells: every creature that hears it
// goes to look. One already after you carries on.
function makeNoise(x, y, radius) {
  for (const e of enemies) {
    if (e.state === 'dead' || !ROBOT_TYPES[e.type].creature) continue;
    const reach = clearLine(x, y, e.x, e.y) ? radius : radius * WALL_MUFFLE;
    if (Math.hypot(e.x - x, e.y - y) <= reach) alertEnemy(e, x, y);
  }
}

// How far this creature can see you right now. Unaware (idle, or searching
// for a noise), it depends on the light where you stand: ambient (about
// 0.3) is dark, under a strip light (about 1.3) is full sight.
function creatureSightRange(enemy) {
  if (enemy.state !== 'idle' && enemy.state !== 'search') return CREATURE_SIGHT;
  const [r, g, b] = lightAt(player.x, player.y);
  const lit = Math.min(1, Math.max(DARK_SIGHT, ((r + g + b) / 3 - 0.2) / 0.8));
  return CREATURE_SIGHT * lit;
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
      damagePlayer(ROBOT_TYPES[enemy.type].damage);
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
