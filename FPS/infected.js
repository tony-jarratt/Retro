// THE HQ'S INFECTED: office workers taken by the plant virus. They're
// creatures (creatures.js): they hear your gunfire, need light to spot you,
// and drop nothing. The SUIT (ENEMY_TYPES, enemies.js) differs from the
// lab's creatures in two ways:
//
//   IT GRABS. One that reaches you takes hold ('grab'): it squeezes the
//     armour off you (its damage every GRAB_TICK seconds), and while anything
//     has hold of you, you move at GRAB_SLOW of your speed. Two ways out:
//     shoot it, and it loses its grip and staggers back ('stagger'); or drag
//     yourself away, slowly, until you're GRAB_BREAK away and it lets go.
//     One is a nuisance. Three in a corridor is how you die.
//   IT GETS BACK UP. Shot down, it isn't dead, just DOWN: lying there with
//     its pustules glowing, for SUIT_DOWN_TIME seconds. Near the end it
//     TWITCHES (your warning), then it gets up ('rising', on its knees, then
//     its feet) with its health back, and comes for you again. To stop it for
//     good, FINISH it while it's down: one more shot into the body on the
//     floor (the gun aims down at it), or a blast.
//
// A downed suit is 'dead' to everything else in the game (it doesn't block,
// see or hear), with downTime counting; a finished one has downTime 0.

const GRAB_TICK = 0.5;          // seconds between squeezes
const GRAB_SLOW = 0.4;          // your speed while one has hold of you
const GRAB_HOLD = 0.55;         // cells, centre to centre: it pulls itself after you to stay this close...
const GRAB_BREAK = 1.0;         // ...and drag it further than this, and it loses its grip
const STAGGER_TIME = 0.8;       // seconds it reels after losing its grip
const SUIT_DOWN_TIME = 6;       // seconds a downed suit lies there before it gets up
const SUIT_TWITCH_TIME = 1.5;   // the last this-many seconds of that, it twitches
const SUIT_RISE_TIME = 1.2;     // seconds to get to its feet
const SUIT_RISE_RETRY = 0.5;    // something on top of it: it tries again this much later
const INFECTED_STATES = ['grab', 'stagger', 'rising'];

// Is anything holding on to you? (player.js slows you.)
function playerHeld() {
  return enemies.some((e) => e.state === 'grab') || rootHolding(); // ambush.js: or a root has your legs
}

// Called by updateWalker when a grabbing creature is in reach and sees you.
function startGrab(enemy) {
  enemy.state = 'grab';
  enemy.attackTime = 0;
}

// It lets go: shot, or dragged too far.
function loseGrip(enemy) {
  enemy.state = 'stagger';
  enemy.attackTime = 0;
}

// One frame of grabbing, staggering or getting up, if it's doing one. Returns
// false if it isn't, so the usual state machine runs instead.
function updateInfected(enemy, dt) {
  if (!INFECTED_STATES.includes(enemy.state)) return false;
  enemy.attackTime += dt;
  const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);

  if (enemy.state === 'grab') {
    enemy.angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    if (dist > GRAB_HOLD) enemy.moving = stepTowards(enemy, player.x, player.y, dt); // hanging on as you pull away
    if (Math.hypot(player.x - enemy.x, player.y - enemy.y) > GRAB_BREAK) { loseGrip(enemy); return true; }
    if (enemy.attackTime >= GRAB_TICK) {
      enemy.attackTime -= GRAB_TICK;
      damagePlayer(ENEMY_TYPES[enemy.type].damage);
    }
    return true;
  }

  // Staggering back, or getting up: then it's after you again.
  enemy.angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
  if (enemy.attackTime >= (enemy.state === 'stagger' ? STAGGER_TIME : SUIT_RISE_TIME)) {
    enemy.state = 'chase';
    enemy.lastSeenX = player.x;
    enemy.lastSeenY = player.y;
  }
  return true;
}

// Shot down (combat.js, damageEnemy): a type that rises is only down.
function knockedDown(enemy) {
  if (ENEMY_TYPES[enemy.type].rises) enemy.downTime = SUIT_DOWN_TIME;
}

// Shot (or blasted) while down: finished, for good.
function finishOff(enemy) {
  if (enemy.downTime <= 0) return;
  enemy.downTime = 0;
}

// A blast at (x, y) finishes every downed body within `radius` with a clear line (explosions.js).
function finishDownedNear(x, y, radius) {
  for (const e of enemies) {
    if (e.state === 'dead' && e.downTime > 0 && Math.hypot(e.x - x, e.y - y) < radius && clearLine(x, y, e.x, e.y)) finishOff(e);
  }
}

// A downed body, each frame (enemies.js): counting down, then getting up.
function updateDowned(enemy, dt) {
  if (enemy.downTime <= 0) return; // finished, or never going to get up
  enemy.downTime -= dt;
  if (enemy.downTime > 0) return;
  // Something standing on it (you, or another of them): it tries again in a moment.
  if (enemyBlocked(enemy, enemy.x, enemy.y)) { enemy.downTime = SUIT_RISE_RETRY; return; }
  enemy.state = 'rising';
  enemy.attackTime = 0;
  enemy.health = ENEMY_TYPES[enemy.type].health;
  enemy.angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
}

// The body on the floor (enemies.js, enemyTexture): twitching, near the end.
function downedTexture(enemy) {
  const frames = DOWNED_TEXTURES[enemy.type];
  const twitching = enemy.downTime < SUIT_TWITCH_TIME && Math.floor(animTime * 7 + enemy.x) % 2 === 0;
  return twitching ? frames.twitch : frames.down;
}

// THE BLOOMER (ENEMY_TYPES 'bloomer'): rooted to the spot, so it never moves
// and never chases. It doesn't need to see you: get within its aimRange,
// with nothing in between, and it feels you there.
//   idle    the bud closed
//   swell   it's felt you: the bud swells and splits for `charge` seconds
//           (your warning; backing off now won't stop it)
//   spent   it's BURST: a spore cloud where it stands (spores.js). The bud
//           grows back after BLOOMER_REGROW seconds, and it's idle again.
// Kill it (2 hits) and it bursts as it dies, unless it's spent: so shoot it
// from a distance, and its cloud goes off where you aren't. But a cloud
// bursting is a noise, and the suits come to see.
// Water makes it flower too (sprinklers.js): a quick swell, then the burst.
const BLOOMER_REGROW = 12;
const BLOOMER_WATERED = 0.6; // watered, it starts its swell this far through

function updateBloomer(enemy, dt) {
  const type = ENEMY_TYPES[enemy.type];
  if (enemy.state === 'idle') {
    const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    if (dist < type.aimRange && clearLine(enemy.x, enemy.y, player.x, player.y)) {
      enemy.state = 'swell';
      enemy.attackTime = 0;
    }
    return;
  }
  enemy.attackTime += dt;
  if (enemy.state === 'swell' && enemy.attackTime >= type.charge) {
    enemy.state = 'spent';
    enemy.attackTime = 0;
    sporeBurst(enemy.x, enemy.y); // spores.js
  } else if (enemy.state === 'spent' && enemy.attackTime >= BLOOMER_REGROW) {
    enemy.state = 'idle';
  }
}

// Watered by a sprinkler: it flowers, whether you're near or not.
function waterBloomer(enemy) {
  if (ENEMY_TYPES[enemy.type].weapon !== 'spores' || enemy.state !== 'idle') return;
  enemy.state = 'swell';
  enemy.attackTime = ENEMY_TYPES[enemy.type].charge * BLOOMER_WATERED;
}

// About to die (combat.js): a bloomer bursts as it goes, if it has spores left.
function bloomerDies(enemy) {
  if (ENEMY_TYPES[enemy.type].weapon === 'spores' && enemy.state !== 'spent') sporeBurst(enemy.x, enemy.y);
}
