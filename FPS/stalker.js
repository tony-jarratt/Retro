// THE STALKER: a creature you see properly only in light.
//
// It hunts like any creature (it hears, and needs light to spot you), but:
//   - it's FAST (nearly your speed) and FRAIL (3 hits);
//   - it HITS AND RUNS: in reach it hisses and slashes almost at once
//     ('slash'), then backs off into the darkest spot it can find a few
//     cells from you ('flee'), and comes again from wherever that is;
//   - it DISLIKES LIGHT: if you're standing lit up (a lamp, or your own
//     muzzle flash) when it gets close, it holds off in the dark nearby
//     ('lurk'), circling, instead of closing. It can't wait for ever:
//     after STALKER_LURK_TIME it comes anyway, and won't hold off again
//     for STALKER_LURK_COOLDOWN.
//   - it's nearly INVISIBLE in the dark: its frames fade with the light
//     where it stands (stalkerVisibility; creature-art.js has the art).
//
// So the counter is light: stand under a lamp and make it come to you, or
// fire to light it up, which is loud, and brings everything else.

const STALKER_WINDUP = 0.25;        // seconds of hiss before the slash lands
const STALKER_REACH = 1.0;          // cells, centre to centre: the slash connects
const STALKER_FLEE_TIME = 2.0;      // seconds at most it runs before turning back
const STALKER_LURK_TIME = 4.0;      // seconds it'll hold off from a lit-up player
const STALKER_LURK_COOLDOWN = 4.0;  // seconds before it'll hold off again
const STALKER_LURK_RANGE = 4.0;     // cells: closer than this to a lit-up player, it holds off
const STALKER_LIT = 0.7;            // playerVisibility (creatures.js) at which you count as lit up
const STALKER_SPOT_MIN = 3, STALKER_SPOT_MAX = 5; // how far from you its dark spots are
const STALKER_STATES = ['slash', 'flee', 'lurk'];
// The light where it stands, as the visibility level of its frames (0-3).
const STALKER_LIGHT_STEPS = [0.45, 0.7, 1.0];

for (const e of enemies) {
  e.lurkCooldown = 0;
  e.spot = null; // where it's running or lurking to
}

// How visible it is: 0 (a shimmer) to 3 (fully seen), from the light on it.
function stalkerVisibility(enemy) {
  const [r, g, b] = lightAt(enemy.x, enemy.y);
  const level = (r + g + b) / 3;
  return STALKER_LIGHT_STEPS.filter((step) => level >= step).length;
}

// The darkest floor cell STALKER_SPOT_MIN to STALKER_SPOT_MAX cells from
// you that it can walk to, as a point in that cell's middle; null if none.
// Ties go to the one nearer the stalker. (Run only when it starts running
// or lurking, so a few dozen path searches now and then is fine.)
function darkSpot(enemy) {
  let best = null, bestScore = Infinity;
  const px = Math.floor(player.x), py = Math.floor(player.y);
  for (let y = py - STALKER_SPOT_MAX; y <= py + STALKER_SPOT_MAX; y++) {
    for (let x = px - STALKER_SPOT_MAX; x <= px + STALKER_SPOT_MAX; x++) {
      if (MAP[y]?.[x] !== 0) continue;
      const d = Math.hypot(x + 0.5 - player.x, y + 0.5 - player.y);
      if (d < STALKER_SPOT_MIN || d > STALKER_SPOT_MAX) continue;
      const [r, g, b] = lightAt(x + 0.5, y + 0.5);
      const score = (r + g + b) / 3 + 0.02 * Math.hypot(x + 0.5 - enemy.x, y + 0.5 - enemy.y);
      if (score >= bestScore) continue;
      if (findPath(enemy.x, enemy.y, x + 0.5, y + 0.5) === null) continue;
      best = { x: x + 0.5, y: y + 0.5 };
      bestScore = score;
    }
  }
  return best;
}

// Called by updateWalker when the stalker's in reach and sees you.
function startSlash(enemy) {
  enemy.state = 'slash';
  enemy.attackTime = 0;
}

// Called by updateWalker as it chases: is it close to you while you're
// lit up, and not out of patience? Then it holds off in the dark.
function stalkerHoldsOff(enemy, dist) {
  if (enemy.lurkCooldown > 0 || dist > STALKER_LURK_RANGE || playerVisibility() < STALKER_LIT) return false;
  enemy.spot = darkSpot(enemy);
  if (!enemy.spot) return false;
  enemy.state = 'lurk';
  enemy.attackTime = 0;
  return true;
}

// One frame of slashing, running or lurking, if it's doing one. Returns
// false if not, so the usual state machine runs instead.
function updateStalker(enemy, dt) {
  enemy.lurkCooldown = Math.max(0, enemy.lurkCooldown - dt);
  if (!STALKER_STATES.includes(enemy.state)) return false;
  enemy.attackTime += dt;

  if (enemy.state === 'slash') {
    enemy.angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    if (enemy.attackTime < STALKER_WINDUP) return true;
    if (Math.hypot(player.x - enemy.x, player.y - enemy.y) < STALKER_REACH && clearLine(enemy.x, enemy.y, player.x, player.y)) {
      damagePlayer(ENEMY_TYPES[enemy.type].damage);
    }
    enemy.state = 'flee';
    enemy.attackTime = 0;
    enemy.spot = darkSpot(enemy);
    return true;
  }

  // Running off, or holding off: to its dark spot, then back to the hunt.
  // Lurking, it watches you; once you're out of the light, it comes.
  const lurking = enemy.state === 'lurk';
  const done = lurking
    ? enemy.attackTime >= STALKER_LURK_TIME || playerVisibility() < STALKER_LIT
    : enemy.attackTime >= STALKER_FLEE_TIME;
  const there = !enemy.spot || Math.hypot(enemy.spot.x - enemy.x, enemy.spot.y - enemy.y) < 0.2;
  if (done || (!lurking && there)) {
    if (lurking) enemy.lurkCooldown = STALKER_LURK_COOLDOWN;
    enemy.state = 'chase';
    enemy.lastSeenX = player.x;
    enemy.lastSeenY = player.y;
    enemy.spot = null;
    return false;
  }
  if (!there) enemy.moving = moveAlongPath(enemy, enemy.spot.x, enemy.spot.y, dt);
  if (lurking && !enemy.moving) enemy.angle = Math.atan2(player.y - enemy.y, player.x - enemy.x); // waiting: watching you
  return true;
}
