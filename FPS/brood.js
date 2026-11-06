// THE BROOD MOTHER: the lab's spawner. Lab only (owner, 2026-11-06).
//
// She's ROOTED in her nest: she turns, but never moves, and she has no
// attack of her own. Her brood is her weapon. Asleep ('idle') until a noise
// reaches her, she sees you, or she's hurt; then she's 'awake', turning
// slowly to face you, and the clock is running:
//   every BROOD_BIRTH_GAP seconds her belly SWELLS ('labour': it stretches
//   and blazes, with a rising groan) for BROOD_LABOUR seconds, then splits
//   and spills BROOD_LITTER larvae onto the floor in front of her, already
//   swarming (larvae.js does the rest). Never more than BROOD_CAP of hers
//   alive at once: kill the brood, and she makes more.
//
// She's tough (ENEMY_TYPES.brood), but her BELLY is the weak spot: a round
// that lands on it while she's facing you counts double (broodBellyHit,
// called from combat.js). Blasts hurt her like anything else. Dead, she
// leaves a huge body: food for a long while (feeding.js), unless you burn it.

const BROOD_BIRTH_GAP = 6;     // seconds between births, once awake
const BROOD_LABOUR = 1.2;      // seconds of swelling before the larvae come
const BROOD_LITTER = 3;        // larvae per birth
const BROOD_CAP = 10;          // her larvae alive at once, at most
const BROOD_TURN_SPEED = 0.8;  // radians per second she turns to face you
const BROOD_MEAT = 6;          // hits of food on her body (feeding.js)
const BROOD_LIGHT = { colour: [0.35, 0.9, 0.25], radius: 3 };

for (const e of enemies) {
  if (e.type !== 'brood') continue;
  if (THEME_NAME !== 'lab') throw new Error(`A brood mother is in a "${THEME_NAME}" level: she belongs to the lab only.`);
  e.birthTimer = BROOD_BIRTH_GAP / 2; // the first birth comes a little sooner once she wakes
  e.meat = BROOD_MEAT;
}

function broodPack(enemy) {
  return 'brood' + enemies.indexOf(enemy);
}

// A noise (creatures.js, makeNoise) wakes her, as for any creature.
function broodHears(x, y, radius) {
  for (const e of enemies) {
    if (e.type !== 'brood' || e.state !== 'idle') continue;
    const reach = clearLine(x, y, e.x, e.y) ? radius : radius * WALL_MUFFLE;
    if (Math.hypot(e.x - x, e.y - y) <= reach) e.state = 'awake';
  }
}

// Birth: the litter, spread across the floor just in front of her.
function giveBirth(enemy) {
  const pack = broodPack(enemy);
  const alive = larvae.filter((l) => l.pack === pack && l.state !== 'dead').length;
  const count = Math.min(BROOD_LITTER, BROOD_CAP - alive);
  for (let i = 0; i < count; i++) {
    const a = enemy.angle + (i - (count - 1) / 2) * 0.6;
    const x = enemy.x + Math.cos(a) * 0.7, y = enemy.y + Math.sin(a) * 0.7;
    if (MAP[Math.floor(y)]?.[Math.floor(x)] !== 0) continue; // against a wall: that one doesn't make it out
    addLarva(x, y, 'swarm', pack); // larvae.js
  }
}

// Each frame (enemies.js: updateEnemy).
function updateBrood(enemy, dt) {
  if (enemy.state === 'idle') {
    if (canSee(enemy) || enemy.health < ENEMY_TYPES.brood.health) enemy.state = 'awake';
    return;
  }
  // Awake: she turns to face you, slowly.
  const want = Math.atan2(player.y - enemy.y, player.x - enemy.x);
  const diff = angleDiff(want, enemy.angle);
  enemy.angle += Math.sign(diff) * Math.min(Math.abs(diff), BROOD_TURN_SPEED * dt);

  enemy.birthTimer -= dt;
  if (enemy.state === 'awake' && enemy.birthTimer <= BROOD_LABOUR) enemy.state = 'labour';
  if (enemy.state === 'labour' && enemy.birthTimer <= 0) {
    giveBirth(enemy);
    enemy.state = 'awake';
    enemy.birthTimer = BROOD_BIRTH_GAP;
  }
}

// Did this round land on her belly, with her facing you? (combat.js, with
// the texel shotTarget found; the same 90° slice that shows her front.)
function broodBellyHit(enemy, texX, texY) {
  const toPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
  if (Math.abs(angleDiff(toPlayer, enemy.angle)) > Math.PI / 4) return false;
  return inEllipse(texX + 0.5 - 32, texY, BROOD_BELLY.cx - 32, BROOD_BELLY.cy, BROOD_BELLY.rx, BROOD_BELLY.ry) !== null;
}

// Her belly's light (lighting.js): a slow green pulse, blazing as she labours.
function addBroodLights(grid) {
  for (const e of enemies) {
    if (e.type !== 'brood' || e.state === 'dead') continue;
    const level = e.state === 'labour' ? 1.3 : 0.5 + 0.2 * Math.sin(animTime * 2);
    addLight(grid, e.x + Math.cos(e.angle) * 0.4, e.y + Math.sin(e.angle) * 0.4, BROOD_LIGHT.colour, BROOD_LIGHT.radius, level);
  }
}
