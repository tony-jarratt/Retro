// Enemies: the robots. Each one runs a small state machine (like the doors),
// decides whether it can see the player using the renderer's own castRay, and
// picks which picture of itself to show (front, back, a side, walking or
// aiming). They are drawn by sprites.js along with the drums. Where they
// start, and what type each is, is listed in the level file (levels/*.js, `enemies`).

const ENEMY_RADIUS = 0.25;                   // half-width of a robot's collision box
const ENEMY_VIEW_CONE = 120 * Math.PI / 180; // how wide an idle robot looks, in total
const SIGHT_RANGE = 10;                      // cells; nothing sees further than this
const WALK_FPS = 4;                          // walk animation frames per second
const TURRET_SWEEP_SPEED = 0.7;              // radians per second an awake turret turns while looking
const SHOT_TURN_SPEED = 12;                  // radians per second a shot robot spins round to face you: half a turn in 0.25s
const STRAFE_SPEED = 0.7;                    // a smart robot sidesteps at this fraction of its walking speed
const STRAFE_MIN = 0.6, STRAFE_MAX = 1.3;    // seconds it keeps sidestepping one way before switching
const BEACON_IDLE_RATE = 1;                  // a smart robot's beacon: blinks a second while it hasn't seen you...
const BEACON_ALERT_RATE = 5;                 // ...and fast once it has: it's calling you in

// THE ROBOT TYPES. The numbers are the whole difference between them; the
// state machine below is shared. Each type changes how you fight it:
//   walker  the all-rounder
//   scout   twice as fast, dies to two hits, and doesn't stop at range: it
//           rushes in close, firing quick weak shots
//   heavy   slow and armoured (6 hits), stands off at range and fires rockets
//           you can see coming and sidestep (explosions.js). Hits from behind
//           count double: flank it.
//   turret  never moves. Sleeps until a tripwire wakes it (security.js), then
//           turns slowly on the spot looking for you, with a long reach. When
//           it fires, it fires a VOLLEY: five quick rounds, each a fresh chance
//           to hit. Don't get caught in its line of fire.
//
// SMART robots (smart: true in a level's enemies) are any walking type with a
// better brain, marked by a blinking beacon and chevrons on the hull. Same
// health, same gun; on top of the usual state machine they:
//   - STRAFE: sidestep across your aim while charging, so a careful single
//     shot can miss (scouts also weave from side to side as they rush you);
//   - CALL FOR HELP: seeing you raises their zone's alarm, exactly like a
//     camera would: every robot in the zone hears, and drone hives open.
//     Kill the smart one first. Turrets are never smart.
// speed      cells per second (the player does 3)
// health     hits to destroy
// aimRange   how close it gets before it stops and aims
// charge     seconds of charging (visor brightening) before each shot
// damage, hitNear, hitFar   for 'gun' weapons: damage per hit, and the chance
//            to hit at 1 cell, falling in a straight line to hitFar at aimRange
// backHits   hits taken per shot that lands from behind
// strafe     smart ones sidestep across your aim while charging
// weave      smart ones also zig-zag at you as they rush in
// volley, volleyGap   rounds per charge, and seconds between them (the turret's rapid fire)
const ROBOT_TYPES = {
  walker: { speed: 1.5, health: 4, aimRange: 3,   charge: 1.0, weapon: 'gun',    damage: 15, hitNear: 0.8,  hitFar: 0.3,  backHits: 1, mobile: true,  strafe: true,  weave: false, volley: 1, volleyGap: 0 },
  scout:  { speed: 3.0, health: 2, aimRange: 1.6, charge: 0.5, weapon: 'gun',    damage: 8,  hitNear: 0.7,  hitFar: 0.45, backHits: 1, mobile: true,  strafe: true,  weave: true,  volley: 1, volleyGap: 0 },
  heavy:  { speed: 0.8, health: 6, aimRange: 6,   charge: 1.8, weapon: 'rocket', damage: 0,  hitNear: 0,    hitFar: 0,    backHits: 2, mobile: true,  strafe: false, weave: false, volley: 1, volleyGap: 0 },
  turret: { speed: 0,   health: 4, aimRange: 8,   charge: 1.2, weapon: 'gun',    damage: 6,  hitNear: 0.75, hitFar: 0.35, backHits: 1, mobile: false, strafe: false, weave: false, volley: 5, volleyGap: 0.12 },
};

// The live robots, built once from the starting positions in the level file:
//   type                   a key of ROBOT_TYPES
//   x, y, angle            position and facing (radians, same convention as the player)
//   state                  walking robots: 'idle' -> 'chase' <-> 'aim' -> 'search' -> 'idle'
//                          turrets: 'dormant' -> 'idle' <-> 'aim', or 'offline'
//                          either: 'dead' (a wreck) from any state
//   lastSeenX, lastSeenY   where it last saw (or was told about) the player; 'search' walks there
//   moving, walkTime       for the walk animation
//   health                 hits left (combat.js)
//   charge                 seconds spent charging its shot while aiming
//   hurtTime, firedTime    seconds left of its white hit flash / muzzle flash
//   path                   the cells it's following this frame (pathfinding.js), or null
//   turning                true while it's spinning round to face whoever shot it
//   smart                  the better brain (see above)
//   strafeDir, strafeTimer which way it's sidestepping (+1 / -1), and for how much longer
//   volleyLeft, volleyTimer rounds of the current volley still to fire, and when the next goes
ENEMIES.forEach((e, n) => {
  if (e.smart && e.type === 'turret') throw new Error(`ENEMIES[${n}] is a smart turret: turrets are always dumb.`);
});
const enemies = ENEMIES.map((start) => ({
  type: start.type,
  x: start.x,
  y: start.y,
  angle: start.angle,
  state: start.type === 'turret' ? 'dormant' : 'idle',
  lastSeenX: start.x,
  lastSeenY: start.y,
  moving: false,
  walkTime: 0,
  health: ROBOT_TYPES[start.type].health,
  charge: 0,
  hurtTime: 0,
  firedTime: 0,
  path: null,
  turning: false,
  smart: start.smart === true,
  strafeDir: Math.random() < 0.5 ? -1 : 1,
  strafeTimer: 0,
  volleyLeft: 0,
  volleyTimer: 0,
}));

// The difference between two angles, wrapped into -PI..PI, so that e.g. 350°
// and 10° count as 20° apart, not 340°. atan2 of (sin, cos) does the wrapping.
function angleDiff(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

// Would a robot standing at (x, y) collide with a wall, closed door, solid
// sprite, the player, or another robot? (Wrecks aren't solid.)
function enemyBlocked(enemy, x, y) {
  const r = ENEMY_RADIUS;
  return boxHitsWall(x, y, r) ||
         hitsSolidSprite(x, y, r) ||
         boxesOverlap(x, y, r, player.x, player.y, PLAYER_RADIUS) ||
         enemies.some((other) => other !== enemy && other.state !== 'dead' &&
           boxesOverlap(x, y, r, other.x, other.y, ENEMY_RADIUS));
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
  // A burst of steam in the way hides you too (steam.js).
  return hit.dist > dist && !steamBlocksSight(enemy.x, enemy.y, player.x, player.y);
}

// Is this robot facing away from the player (so the player sees its back)?
// The same 90° slice that enemyTexture uses to pick the 'back' picture.
function isFacingAway(enemy) {
  const toPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
  return Math.abs(angleDiff(toPlayer, enemy.angle)) >= 3 * Math.PI / 4;
}

// Take one step towards (targetX, targetY), sliding along walls like the
// player does. Returns false if it couldn't move at all.
function stepTowards(enemy, targetX, targetY, dt) {
  enemy.angle = Math.atan2(targetY - enemy.y, targetX - enemy.x);
  const step = ROBOT_TYPES[enemy.type].speed * dt;
  const newX = enemy.x + Math.cos(enemy.angle) * step;
  const newY = enemy.y + Math.sin(enemy.angle) * step;
  let moved = false;
  if (!enemyBlocked(enemy, newX, enemy.y)) { enemy.x = newX; moved = true; }
  if (!enemyBlocked(enemy, enemy.x, newY)) { enemy.y = newY; moved = true; }
  return moved;
}

// Walk towards (targetX, targetY) by the shortest route through the grid
// (pathfinding.js): head for the middle of the next cell on the path, or
// straight at the target once in the same cell. Returns false if it didn't
// move, including when there's no route at all (say, a closed door between).
// The path is kept on the robot so the debug map can draw it.
function moveAlongPath(enemy, targetX, targetY, dt) {
  enemy.path = findPath(enemy.x, enemy.y, targetX, targetY);
  if (enemy.path === null) return false;
  if (enemy.path.length === 0) return stepTowards(enemy, targetX, targetY, dt);
  return stepTowards(enemy, enemy.path[0].x + 0.5, enemy.path[0].y + 0.5, dt);
}

// Tell a walking robot where you are (a camera alarm, or being shot): it
// stops idling and goes to look, by path. One already hunting you is left be.
function alertEnemy(enemy, x, y) {
  if (!ROBOT_TYPES[enemy.type].mobile || enemy.state === 'dead') return;
  enemy.lastSeenX = x;
  enemy.lastSeenY = y;
  if (enemy.state === 'idle' || enemy.state === 'search') enemy.state = 'search';
}

// SHOT: whatever it was doing, a robot that's hit swings round to face you.
// Not instantly: it turns at SHOT_TURN_SPEED, so a shot in the back buys you
// a moment. Turning takes over from its state machine until it's facing you
// (updateEnemy). An offline turret has been shut down and doesn't react.
function turnTowardsPlayer(enemy) {
  if (enemy.state === 'dead' || enemy.state === 'offline') return;
  // Already facing you (say, a robot aiming at you): nothing to turn, and
  // pausing it would let rapid fire freeze it in place.
  const want = Math.atan2(player.y - enemy.y, player.x - enemy.x);
  if (Math.abs(angleDiff(want, enemy.angle)) > 0.1) enemy.turning = true;
}

// One frame of turning: rotate towards you by at most SHOT_TURN_SPEED * dt,
// the short way round. Returns true once it's facing you.
function turnStep(enemy, dt) {
  const want = Math.atan2(player.y - enemy.y, player.x - enemy.x);
  const diff = angleDiff(want, enemy.angle);
  const step = SHOT_TURN_SPEED * dt;
  if (Math.abs(diff) <= step) {
    enemy.angle = want;
    return true;
  }
  enemy.angle += Math.sign(diff) * step;
  return false;
}

// Wake a sleeping turret (a tripwire, or being shot). An offline one stays off.
function wakeTurret(enemy) {
  if (enemy.type === 'turret' && enemy.state === 'dormant') enemy.state = 'idle';
}

// Aiming: face the player, charge up, then fire. Shared by every type.
// A finished charge starts a VOLLEY: `volley` rounds, `volleyGap` apart
// (one round, for everything but the turret). updateVolley fires them.
function aimAndFire(enemy, dt) {
  enemy.angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
  if (enemy.volleyLeft > 0) return; // still firing the last one
  enemy.charge += dt;
  if (enemy.charge >= ROBOT_TYPES[enemy.type].charge) {
    enemy.charge = 0;
    enemy.volleyLeft = ROBOT_TYPES[enemy.type].volley;
    enemy.volleyTimer = 0; // the first round goes this frame
  }
}

// The rounds of a volley, one each time the gap runs out. Each is its own
// shot, with its own chance to hit, as long as the robot can still see you:
// duck out of sight mid-volley and the rest go wide.
function updateVolley(enemy, dt) {
  if (enemy.volleyLeft === 0) return;
  enemy.volleyTimer -= dt;
  if (enemy.volleyTimer > 0) return;
  enemy.volleyLeft -= 1;
  enemy.volleyTimer = ROBOT_TYPES[enemy.type].volleyGap;
  if (canSee(enemy)) robotFires(enemy, Math.hypot(player.x - enemy.x, player.y - enemy.y));
  else { enemy.firedTime = ROBOT_FIRE_FLASH / 2; sfxRobotShot(enemy); } // still fires, at where you were
}

// SMART: sidestep across your line of fire while charging. It goes one way
// for a random while (STRAFE_MIN to STRAFE_MAX seconds), then the other, and
// turns back early if it bumps into something. "Across" is at right angles
// to the line between you: if that line's direction is (cos a, sin a), the
// sideways direction is (-sin a, cos a). Returns whether it moved.
function strafeStep(enemy, dt) {
  enemy.strafeTimer -= dt;
  if (enemy.strafeTimer <= 0) {
    enemy.strafeDir = -enemy.strafeDir;
    enemy.strafeTimer = STRAFE_MIN + Math.random() * (STRAFE_MAX - STRAFE_MIN);
  }
  const a = Math.atan2(player.y - enemy.y, player.x - enemy.x);
  const step = ROBOT_TYPES[enemy.type].speed * STRAFE_SPEED * dt * enemy.strafeDir;
  const nx = enemy.x - Math.sin(a) * step;
  const ny = enemy.y + Math.cos(a) * step;
  if (enemyBlocked(enemy, nx, ny)) {
    enemy.strafeDir = -enemy.strafeDir;
    return false;
  }
  enemy.x = nx;
  enemy.y = ny;
  return true;
}

// SMART scouts: rush at you zig-zagging, half towards you and half sideways
// (the sideways half flips with strafeDir, on the same timer as strafing).
function weaveStep(enemy, dt) {
  enemy.strafeTimer -= dt;
  if (enemy.strafeTimer <= 0) {
    enemy.strafeDir = -enemy.strafeDir;
    enemy.strafeTimer = (STRAFE_MIN + Math.random() * (STRAFE_MAX - STRAFE_MIN)) / 2; // twitchier
  }
  const a = Math.atan2(player.y - enemy.y, player.x - enemy.x);
  const mx = Math.cos(a) - Math.sin(a) * enemy.strafeDir;
  const my = Math.sin(a) + Math.cos(a) * enemy.strafeDir;
  return stepTowards(enemy, enemy.x + mx, enemy.y + my, dt);
}

// SMART: seeing you raises the alarm in its zone, like a camera.
function callForHelp(enemy) {
  const zone = ZONES.find((z) => inZone(z, enemy.x, enemy.y));
  if (zone) raiseAlarm(zone.id); // security.js
}

// THE WALKING ROBOTS' STATE MACHINE (walker, scout, heavy).
//   idle   stand still, facing a fixed way, watching the cone in front
//   chase  saw you: follow the shortest path to you
//   aim    within its aimRange and in sight: stop, face you, charge, fire
//   search lost sight of you (or was alerted): follow the path to where you
//          were last seen, round corners if need be, then go idle
function updateWalker(enemy, dt) {
  const type = ROBOT_TYPES[enemy.type];
  const sees = canSee(enemy);
  if (sees) {
    if (enemy.smart) callForHelp(enemy);
    enemy.lastSeenX = player.x;
    enemy.lastSeenY = player.y;
    const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    enemy.state = dist <= type.aimRange ? 'aim' : 'chase';
  } else if (enemy.state === 'chase' || enemy.state === 'aim') {
    enemy.state = 'search';
  }

  if (enemy.state === 'aim') {
    aimAndFire(enemy, dt);
    if (enemy.smart && type.strafe) enemy.moving = strafeStep(enemy, dt);
  } else if (enemy.state === 'chase') {
    if (enemy.smart && type.weave && sees) {
      enemy.moving = weaveStep(enemy, dt);
    } else {
      // No route (a door shut between you)? It waits, still watching.
      enemy.moving = moveAlongPath(enemy, player.x, player.y, dt);
    }
  } else if (enemy.state === 'search') {
    const arrived = Math.hypot(enemy.lastSeenX - enemy.x, enemy.lastSeenY - enemy.y) < 0.2;
    enemy.moving = !arrived && moveAlongPath(enemy, enemy.lastSeenX, enemy.lastSeenY, dt);
    // Got there, or no way through / completely stuck: give up and stand guard here.
    if (!enemy.moving) enemy.state = 'idle';
  }
}

// THE TURRET'S STATE MACHINE.
//   dormant  asleep, sees nothing, until a tripwire (or a shot) wakes it
//   idle     awake: turning slowly on the spot, watching the cone in front
//   aim      sees you within range: face you, charge, fire
//   offline  shut down at a security terminal; never wakes again
function updateTurret(enemy, dt) {
  if (enemy.state === 'dormant' || enemy.state === 'offline') return;
  const type = ROBOT_TYPES.turret;
  const sees = canSee(enemy) && Math.hypot(player.x - enemy.x, player.y - enemy.y) <= type.aimRange;
  enemy.state = sees ? 'aim' : 'idle';
  if (enemy.state === 'aim') aimAndFire(enemy, dt);
  else enemy.angle += TURRET_SWEEP_SPEED * dt;
}

function updateEnemy(enemy, dt) {
  enemy.hurtTime = Math.max(0, enemy.hurtTime - dt);
  enemy.firedTime = Math.max(0, enemy.firedTime - dt);
  enemy.path = null; // only set while it's following one this frame
  enemy.moving = false;
  if (enemy.state === 'dead') return;

  updateVolley(enemy, dt); // a volley under way keeps firing whatever else happens

  // Just been shot: spin round to face you first, then carry on as normal.
  if (enemy.turning) {
    if (turnStep(enemy, dt)) enemy.turning = false;
    return;
  }

  if (ROBOT_TYPES[enemy.type].mobile) updateWalker(enemy, dt);
  else updateTurret(enemy, dt);

  // Charging only happens while aiming. Leaving 'aim' (you duck out of sight,
  // or back off out of range) throws the charge away: that's your counterplay.
  if (enemy.state !== 'aim') enemy.charge = 0;
  if (enemy.moving) enemy.walkTime += dt;
}

function updateEnemies(dt) {
  buildWalkableCells(); // doors and drums change, so the walkable map is redone each frame
  for (const enemy of enemies) updateEnemy(enemy, dt);
}

// DIRECTIONAL SPRITES. Which picture of the robot should this viewer see?
// Compare the direction from the robot to the viewer with the way the robot
// is facing: viewer straight ahead of it sees its front, straight behind sees
// its back, and in between sees a side. The circle is cut into four 90° slices.
// A smart robot's beacon: a slow blink while it's unaware of you, fast once
// it's after you. Its position offsets the timing, so they don't blink in step.
function beaconLit(enemy) {
  const rate = enemy.state === 'idle' ? BEACON_IDLE_RATE : BEACON_ALERT_RATE;
  return (animTime * rate + enemy.x * 0.37) % 1 < 0.5;
}

function enemyTexture(enemy, viewer) {
  if (enemy.state === 'dead') return WRECK_TEXTURE; // a heap looks the same from every side
  const frames = enemy.smart ? SMART_ROBOT_FRAMES[enemy.type][beaconLit(enemy) ? 'on' : 'off'] : ROBOT_FRAMES[enemy.type];
  if (enemy.state === 'aim') {
    // It always faces you while aiming, so only the front is ever needed.
    return enemy.firedTime > 0 ? frames.front.fire : frames.front.aim;
  }

  const toViewer = Math.atan2(viewer.y - enemy.y, viewer.x - enemy.x);
  const off = angleDiff(toViewer, enemy.angle); // 0 = viewer dead ahead of the robot
  let view;
  if (Math.abs(off) <= Math.PI / 4) view = 'front';
  else if (Math.abs(off) >= 3 * Math.PI / 4) view = 'back';
  else view = off > 0 ? 'right' : 'left'; // positive = clockwise = the robot's right-hand side

  // Turrets: asleep or awake. Walkers alternate two frames while walking,
  // WALK_FPS times a second; otherwise they stand.
  let pose = 'stand';
  if (enemy.state === 'dormant' || enemy.state === 'offline') pose = 'dormant';
  else if (enemy.moving) pose = Math.floor(enemy.walkTime * WALK_FPS) % 2 === 0 ? 'walk1' : 'walk2';
  return frames[view][pose];
}
