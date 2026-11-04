// Enemies: sentry robots. Each one runs a small state machine (like the
// doors), decides whether it can see the player using the renderer's own
// castRay, and picks which picture of itself to show (front, back, a side,
// walking or aiming). They are drawn by sprites.js along with the barrels.
// Where they start is listed in map.js (ENEMIES).

const ENEMY_SPEED = 1.5;                    // cells per second (the player does 3)
const ENEMY_RADIUS = 0.25;                  // half-width of a robot's collision box
const ENEMY_VIEW_CONE = 120 * Math.PI / 180; // how wide an idle robot looks, in total
const SIGHT_RANGE = 10;                     // cells; it can't see further than this
const AIM_RANGE = 3;                        // cells; this close, it stops and aims
const WALK_FPS = 4;                         // walk animation frames per second

// The live robots, built once from the starting positions in map.js:
//   x, y, angle            position and facing (radians, same convention as the player)
//   state                  'idle' -> 'chase' <-> 'aim' -> 'search' -> 'idle'
//   lastSeenX, lastSeenY   where it last saw the player; 'search' walks there
//   moving, walkTime       for the walk animation
const enemies = ENEMIES.map((start) => ({
  x: start.x,
  y: start.y,
  angle: start.angle,
  state: 'idle',
  lastSeenX: start.x,
  lastSeenY: start.y,
  moving: false,
  walkTime: 0,
}));

// The difference between two angles, wrapped into -PI..PI, so that e.g. 350°
// and 10° count as 20° apart, not 340°. atan2 of (sin, cos) does the wrapping.
function angleDiff(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

// Would a robot standing at (x, y) collide with a wall, closed door, solid
// sprite, the player, or another robot?
function enemyBlocked(enemy, x, y) {
  const r = ENEMY_RADIUS;
  return boxHitsWall(x, y, r) ||
         hitsSolidSprite(x, y, r) ||
         boxesOverlap(x, y, r, player.x, player.y, PLAYER_RADIUS) ||
         enemies.some((other) => other !== enemy && boxesOverlap(x, y, r, other.x, other.y, ENEMY_RADIUS));
}

// Can this robot see the player?
function canSee(enemy) {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy);
  if (dist > SIGHT_RANGE) return false;

  // An idle robot only notices you inside the cone in front of it. Once
  // alerted, it keeps track of you whichever way it happens to be facing.
  if (enemy.state === 'idle' && Math.abs(angleDiff(Math.atan2(dy, dx), enemy.angle)) > ENEMY_VIEW_CONE / 2) {
    return false;
  }

  // LINE OF SIGHT: cast a ray from the robot towards the player with the same
  // castRay the renderer uses. If it hits a wall (or a closed door) before it
  // has travelled as far as the player is, something is in the way.
  const hit = castRay(enemy.x, enemy.y, dx / dist, dy / dist);
  return hit.dist > dist;
}

// Take one step towards (targetX, targetY), sliding along walls like the
// player does. Returns false if it couldn't move at all.
function stepTowards(enemy, targetX, targetY, dt) {
  enemy.angle = Math.atan2(targetY - enemy.y, targetX - enemy.x);
  const step = ENEMY_SPEED * dt;
  const newX = enemy.x + Math.cos(enemy.angle) * step;
  const newY = enemy.y + Math.sin(enemy.angle) * step;
  let moved = false;
  if (!enemyBlocked(enemy, newX, enemy.y)) { enemy.x = newX; moved = true; }
  if (!enemyBlocked(enemy, enemy.x, newY)) { enemy.y = newY; moved = true; }
  return moved;
}

// THE ROBOT STATE MACHINE.
//   idle   stand still, facing a fixed way, watching the cone in front
//   chase  saw you: walk straight at you (no pathfinding, so it can snag on corners)
//   aim    within AIM_RANGE and in sight: stop, face you, raise the gun
//   search lost sight of you: walk to where you were last seen, then go idle
function updateEnemy(enemy, dt) {
  const sees = canSee(enemy);
  if (sees) {
    enemy.lastSeenX = player.x;
    enemy.lastSeenY = player.y;
    const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    enemy.state = dist <= AIM_RANGE ? 'aim' : 'chase';
  } else if (enemy.state === 'chase' || enemy.state === 'aim') {
    enemy.state = 'search';
  }

  enemy.moving = false;
  if (enemy.state === 'aim') {
    enemy.angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
  } else if (enemy.state === 'chase') {
    // Blocked while chasing (snagged on a corner)? Keep trying: you might move.
    enemy.moving = stepTowards(enemy, player.x, player.y, dt);
  } else if (enemy.state === 'search') {
    const arrived = Math.hypot(enemy.lastSeenX - enemy.x, enemy.lastSeenY - enemy.y) < 0.2;
    enemy.moving = !arrived && stepTowards(enemy, enemy.lastSeenX, enemy.lastSeenY, dt);
    // Got there, or completely stuck on the way: give up and stand guard here.
    if (!enemy.moving) enemy.state = 'idle';
  }

  if (enemy.moving) enemy.walkTime += dt;
}

function updateEnemies(dt) {
  for (const enemy of enemies) updateEnemy(enemy, dt);
}

// DIRECTIONAL SPRITES. Which picture of the robot should this viewer see?
// Compare the direction from the robot to the viewer with the way the robot
// is facing: viewer straight ahead of it sees its front, straight behind sees
// its back, and in between sees a side. The circle is cut into four 90° slices.
function enemyTexture(enemy, viewer) {
  if (enemy.state === 'aim') return ROBOT_FRAMES.front.aim; // it always faces you while aiming

  const toViewer = Math.atan2(viewer.y - enemy.y, viewer.x - enemy.x);
  const off = angleDiff(toViewer, enemy.angle); // 0 = viewer dead ahead of the robot
  let view;
  if (Math.abs(off) <= Math.PI / 4) view = 'front';
  else if (Math.abs(off) >= 3 * Math.PI / 4) view = 'back';
  else view = off > 0 ? 'right' : 'left'; // positive = clockwise = the robot's right-hand side

  // Walking alternates two frames, WALK_FPS times a second; otherwise stand.
  let pose = 'stand';
  if (enemy.moving) pose = Math.floor(enemy.walkTime * WALK_FPS) % 2 === 0 ? 'walk1' : 'walk2';
  return ROBOT_FRAMES[view][pose];
}
