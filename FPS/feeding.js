// FEEDING: wounded lurchers eat the dead to heal.
//
// A lurcher (a type with `feeds: true`) that's down to FEED_AT hits or
// fewer stops hunting you and goes to the nearest creature corpse it can
// reach within FEED_RANGE steps. It hunches over the body and eats: one hit
// back every FEED_TIME seconds, each one taken from the corpse. A corpse has
// CORPSE_MEAT hits of food; eaten clean, it's bones.
//
// On its way ('hungry') and while it eats ('feed'), it ignores you, doesn't
// turn when shot, and its eyes dim: it's the creatures' version of a robot
// going for repair (repair.js), but YOU make the food. Kill a pack in a
// corridor and you've laid out a meal for whatever comes next.
//
// DENY IT: a blast or a pool of acid BURNS a corpse to ash, and ash is no
// food. Drums and spitters' acid get a new use.
//
// Fields on a dead creature: meat (food left) and burnt. On a feeder: meal
// (the corpse it's after).

const FEED_AT = 2;        // hits left: at this or fewer, a feeder goes to eat
const FEED_RANGE = 12;    // path steps: how far it'll go for a meal
const FEED_TIME = 1.5;    // seconds per hit restored
const CORPSE_MEAT = 2;    // hits of food on a body
const FEED_REACH = 0.55;  // how close it stands to the body to eat (it stays to one side, so you see both)

// A body that can still be eaten.
function edible(corpse) {
  return corpse.state === 'dead' && corpse.downTime === 0 && ENEMY_TYPES[corpse.type].creature &&
         !corpse.burnt && corpse.meat > 0;
}

// Every creature body starts with its meat; burnt flag off.
for (const e of enemies) {
  e.meat = CORPSE_MEAT;
  e.burnt = false;
  e.meal = null;
}

function wantsFood(enemy) {
  return ENEMY_TYPES[enemy.type].feeds && enemy.health <= FEED_AT;
}

// The nearest body it can walk to (within FEED_RANGE steps) that nobody else is eating.
function nearestMeal(enemy) {
  let best = null, bestSteps = FEED_RANGE + 1;
  for (const corpse of enemies) {
    if (!edible(corpse)) continue;
    if (enemies.some((other) => other !== enemy && other.meal === corpse && other.state !== 'dead')) continue;
    const path = findPath(enemy.x, enemy.y, corpse.x, corpse.y);
    if (path !== null && path.length < bestSteps) { best = corpse; bestSteps = path.length; }
  }
  return best;
}

function stopFeeding(enemy) {
  enemy.meal = null;
  enemy.state = 'search'; // back to where it last knew you were
}

// Called from the walking state machine (enemies.js) before anything else.
// Returns true if eating (or going to eat) took this frame.
function updateFeeding(enemy, dt) {
  if (enemy.state === 'feed') {
    const corpse = enemy.meal;
    if (!edible(corpse)) { stopFeeding(enemy); return false; } // burnt, or eaten clean
    enemy.angle = Math.atan2(corpse.y - enemy.y, corpse.x - enemy.x);
    enemy.attackTime += dt;
    if (enemy.attackTime >= FEED_TIME) {
      enemy.attackTime -= FEED_TIME;
      enemy.health += 1;
      corpse.meat -= 1;
    }
    if (enemy.health >= ENEMY_TYPES[enemy.type].health) stopFeeding(enemy);
    return true;
  }

  if (enemy.state === 'hungry') {
    const corpse = enemy.meal;
    if (!edible(corpse)) { stopFeeding(enemy); return false; }
    if (Math.hypot(corpse.x - enemy.x, corpse.y - enemy.y) < FEED_REACH + 0.1) {
      enemy.state = 'feed';
      enemy.attackTime = 0;
      return true;
    }
    // Head for a spot just short of the body, on its own side of it.
    const d = Math.hypot(enemy.x - corpse.x, enemy.y - corpse.y) || 1;
    const tx = corpse.x + (enemy.x - corpse.x) / d * FEED_REACH;
    const ty = corpse.y + (enemy.y - corpse.y) / d * FEED_REACH;
    enemy.moving = moveAlongPath(enemy, tx, ty, dt);
    if (enemy.path === null) { stopFeeding(enemy); return false; } // no way to it now
    return true;
  }

  if (!wantsFood(enemy)) return false;
  const corpse = nearestMeal(enemy);
  if (!corpse) return false;
  enemy.meal = corpse;
  enemy.state = 'hungry';
  enemy.turning = false;
  return true;
}

// A blast (explosions.js) burns every body in reach with a clear line to it.
function burnCorpsesNear(x, y, radius) {
  for (const e of enemies) {
    if (e.state !== 'dead' || e.burnt || !ENEMY_TYPES[e.type].creature) continue;
    if (e.downTime > 0) continue; // a downed suit: infected.js finishes it off instead
    if (Math.hypot(e.x - x, e.y - y) < radius && clearLine(x, y, e.x, e.y)) e.burnt = true;
  }
}

// Acid (acid.js) eats any body lying in a pool.
function burnCorpsesInPools() {
  for (const e of enemies) {
    if (e.state === 'dead' && !e.burnt && e.downTime === 0 && ENEMY_TYPES[e.type].creature && inPool(e.x, e.y)) e.burnt = true;
  }
}

// What a dead creature looks like: whole, picked clean, or burnt.
function corpseTexture(enemy) {
  if (enemy.burnt) return ASH_TEXTURE;
  if (enemy.meat <= 0) return BONES_TEXTURE;
  if (enemy.type === 'guard' && enemy.torchBroken) return GUARD_DARK_CORPSE; // guard-art.js: its torch on the floor, dead
  return CORPSE_TEXTURES[enemy.type];
}
