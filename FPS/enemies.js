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

// THE ENEMY TYPES, robots and creatures. The numbers are the whole
// difference between them; the state machine below is shared. Each type
// changes how you fight it:
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
//
// THE LAB'S CREATURES (creatures.js):
//   lurcher  slow and tough, melee only: rears up, then lunges. Back off or sidestep.
//   spitter  frail, keeps its distance and lobs acid where you're standing
//            (acid.js), leaving a burning pool. Its glands are on its back:
//            hits there count double. Get close, and it backs off.
//   brood    the brood mother: rooted, tough, no attack of her own; she
//            BIRTHS larvae while awake, and her belly takes double (brood.js)
//   stalker  fast and frail, nearly invisible in the dark; slashes and runs,
//            and holds off from you while you're lit up (stalker.js)
//
// THE HQ'S INFECTED (infected.js):
//   suit     an office worker the plant virus took. Shambles, GRABS and holds
//            on, and GETS BACK UP unless you finish it while it's down.
//   manager  the one the plant took whole: never fights; keeps out of sight,
//            orders the suits about over the PA, uses the building against
//            you, and re-roots in a planter to heal (manager.js)
//   bloomer  one gone further: rooted to the spot, its head a great bud. Get
//            close and it swells, then BURSTS in a cloud of spores (spores.js).
//   guard    a security officer that kept its training: carries a torch, takes
//            cover, fires bursts from a pistol, reloads, radios (guard.js)
//
// Every type gives these:
//   speed      cells per second (the player does 3)
//   health     hits to destroy
//   aimRange   how close it gets before it stops and aims (for 'melee', its
//              reach to start an attack)
//   weapon     'gun', 'rocket' (explosions.js), 'melee' or 'lob' (creatures.js,
//              acid.js), 'grab' (infected.js: aimRange is its reach), or
//              'spores' (infected.js: aimRange is how close sets it off), or
//              'slash' (stalker.js: aimRange is its reach to start one), or
//              'pistol' (guard.js: the guard's, fired in bursts from cover)
// and these only if it differs from ENEMY_DEFAULTS:
//   charge     seconds of charging (visor brightening) before each shot
//   followUp   if set, the charge for each shot AFTER the first, for as long
//              as it keeps you in its sights: the first shot is your warning,
//              the rest come quicker (owner, 2026-11-06: the walker)
//   damage     per hit: a 'gun' round, a lunge that connects, an acid splash
//   hitNear, hitFar   for 'gun' weapons: the chance to hit at 1 cell, falling
//              in a straight line to hitFar at aimRange
//   backHits   hits taken per shot that lands from behind
//   mobile     false for a turret: it never moves
//   strafe     smart ones sidestep across your aim while charging
//   weave      smart ones also zig-zag at you as they rush in
//   volley, volleyGap   rounds per charge, and seconds between them (the turret's rapid fire)
//   creature   one of the lab's creatures: hears, needs light to see, drops
//              nothing (creatures.js)
//   retreat    creatures that fight at range: closer than this, it backs away
//              (and shows you its back) rather than fire, unless it's cornered
//   rises      shot down, it gets back up unless finished off (infected.js)
//   feeds      wounded, it eats the dead to heal (feeding.js)
//   opensDoors it can open (unlocked, unsealed) doors, like you: the Manager only
const ENEMY_DEFAULTS = {
  charge: 0, followUp: 0, damage: 0, hitNear: 0, hitFar: 0, backHits: 1, mobile: true,
  strafe: false, weave: false, volley: 1, volleyGap: 0, creature: false, retreat: 0, rises: false, feeds: false, opensDoors: false,
};
const ENEMY_REQUIRED = ['speed', 'health', 'aimRange', 'weapon'];
const ENEMY_TYPES = {
  walker:  { speed: 1.5, health: 4, aimRange: 6,   weapon: 'gun',    charge: 1.0, followUp: 0.6, damage: 15, hitNear: 0.8,  hitFar: 0.1,  strafe: true },
  scout:   { speed: 3.0, health: 2, aimRange: 1.6, weapon: 'gun',    charge: 0.5, damage: 8,  hitNear: 0.7,  hitFar: 0.45, strafe: true, weave: true },
  heavy:   { speed: 0.8, health: 6, aimRange: 6,   weapon: 'rocket', charge: 1.8, backHits: 2 },
  turret:  { speed: 0,   health: 4, aimRange: 8,   weapon: 'gun',    charge: 1.2, damage: 6,  hitNear: 0.75, hitFar: 0.35, mobile: false, volley: 5, volleyGap: 0.12 },
  lurcher: { speed: 1.3, health: 5, aimRange: 1.6, weapon: 'melee',              damage: 30, creature: true, feeds: true },
  spitter: { speed: 1.0, health: 3, aimRange: 6,   weapon: 'lob',    charge: 1.3, damage: 15, backHits: 2, creature: true, retreat: 2.5 },
  stalker: { speed: 2.5, health: 3, aimRange: 1.0, weapon: 'slash',              damage: 12, creature: true },
  brood:   { speed: 0,   health: 20, aimRange: 0,  weapon: 'brood', mobile: false, creature: true },
  manager: { speed: 1.6, health: 4,  aimRange: 0,  weapon: 'command',            creature: true, opensDoors: true },
  suit:    { speed: 0.9, health: 3, aimRange: 0.8, weapon: 'grab',             damage: 4,  creature: true, rises: true },
  bloomer: { speed: 0,   health: 2, aimRange: 2.2, weapon: 'spores', charge: 0.9, mobile: false, creature: true },
  guard:   { speed: 1.4, health: 4, aimRange: 6,   weapon: 'pistol', charge: 0.5, damage: 8,  hitNear: 0.7,  hitFar: 0.35, creature: true, opensDoors: true },
};
// Fill in the defaults, so the rest of the code can read any field of any type.
// A misspelt field would otherwise be silently ignored, so it's an error.
for (const [name, type] of Object.entries(ENEMY_TYPES)) {
  for (const field of ENEMY_REQUIRED) {
    if (!(field in type)) throw new Error(`ENEMY_TYPES.${name} has no ${field}.`);
  }
  for (const field of Object.keys(type)) {
    if (!ENEMY_REQUIRED.includes(field) && !(field in ENEMY_DEFAULTS)) throw new Error(`ENEMY_TYPES.${name} has "${field}", which isn't a field enemies have.`);
  }
  ENEMY_TYPES[name] = { ...ENEMY_DEFAULTS, ...type };
}

// The live robots, built once from the starting positions in the level file:
//   type                   a key of ENEMY_TYPES
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
//   elite                  the chairman's EXECUTIVE PROTECTION (the Atrium, owner
//                          2026-11-06): dumb, but tough and quick to fire: ELITE_TOUGH
//                          times the health, ELITE_FIRE times the charge (and a
//                          turret's volley gap), in white and brass (robot-art.js).
//                          Machines can't catch a plant virus: they're still guarding
//                          the chairman, who is inside the mother plant now.
//   wakesOnObjective       a turret that wakes when the objective is first hit (core.js),
//                          not only by a tripwire or a shot
//   strafeDir, strafeTimer which way it's sidestepping (+1 / -1), and for how much longer
//   volleyLeft, volleyTimer rounds of the current volley still to fire, and when the next goes
ENEMIES.forEach((e, n) => {
  if (!ENEMY_TYPES[e.type]) throw new Error(`ENEMIES[${n}] has type "${e.type}". Types: ${Object.keys(ENEMY_TYPES).join(', ')}.`);
  if (e.smart && e.type === 'turret') throw new Error(`ENEMIES[${n}] is a smart turret: turrets are always dumb.`);
  if (e.smart && ENEMY_TYPES[e.type].creature) throw new Error(`ENEMIES[${n}] is a smart ${e.type}: only robots can be smart.`);
  if (e.elite && !ELITE_ROBOT_FRAMES[e.type]) throw new Error(`ENEMIES[${n}] is an elite ${e.type}: only walkers, scouts and turrets come in executive livery.`);
  if (e.elite && e.smart) throw new Error(`ENEMIES[${n}] is elite and smart: the executive detail is dumb.`);
});
const ELITE_TOUGH = 1.5;  // an elite's health, against its type's
const ELITE_FIRE = 0.75;  // an elite's charge times (and a turret's volley gap), against its type's
const enemies = ENEMIES.map((start) => ({
  type: start.type,
  x: start.x,
  y: start.y,
  angle: start.angle,
  // Turrets sleep until a tripwire; creatures in a specimen tank (tank: true)
  // sleep until its glass breaks (creatures.js).
  state: start.type === 'turret' || start.tank ? 'dormant' : 'idle',
  lastSeenX: start.x,
  lastSeenY: start.y,
  moving: false,
  walkTime: 0,
  health: Math.round(ENEMY_TYPES[start.type].health * (start.elite ? ELITE_TOUGH : 1)),
  elite: start.elite === true,
  wakesOnObjective: start.wakesOnObjective === true,
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
  attackTime: 0, // creatures: seconds into the current stage of a melee attack (creatures.js)
  lungeLeft: 0,  // creatures: cells of lunge still to go
  downTime: 0,   // a downed suit: seconds until it gets up; 0 if it never will (infected.js)
  bay: null,     // smart robots: the repair bay it's heading for or docked in (repair.js)
  pair: start.pair || null, // lurchers that hunt together share a tag (creatures.js)
  pairCalled: false, pairCaller: false,
  repairTime: 0, // seconds of welding towards the next hit restored
  onTarget: false, // it's fired and still has you in its sights: its next charge is its followUp
  burn: 0,       // seconds of burning left, from an incendiary round (ammo.js); 0 = not alight
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
  // Creatures need light to spot you (creatures.js); robots see in the dark.
  const range = ENEMY_TYPES[enemy.type].creature ? creatureSightRange(enemy) : SIGHT_RANGE;
  if (dist > range) return false;

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
  const step = ENEMY_TYPES[enemy.type].speed * dt;
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
  enemy.path = findPath(enemy.x, enemy.y, targetX, targetY, ENEMY_TYPES[enemy.type].opensDoors);
  if (enemy.path === null) return false;
  if (enemy.path.length === 0) return stepTowards(enemy, targetX, targetY, dt);
  return stepTowards(enemy, enemy.path[0].x + 0.5, enemy.path[0].y + 0.5, dt);
}

// Tell a walking robot where you are (a camera alarm, or being shot): it
// stops idling and goes to look, by path. One already hunting you is left be.
function alertEnemy(enemy, x, y) {
  if (!ENEMY_TYPES[enemy.type].mobile || enemy.state === 'dead') return;
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
  if (enemy.type === 'brood') return; // she turns herself, slowly (brood.js)
  if (ATTACK_STATES.includes(enemy.state)) return; // a creature mid-attack is already facing you, and won't be put off
  if (enemy.state === 'retreat' || enemy.state === 'repair') return; // fleeing to a bay, or docked: it shows you its back (repair.js)
  if (['hungry', 'feed', 'slash', 'flee', 'lurk', 'cover'].includes(enemy.state)) return; // going to eat or eating (feeding.js); a stalker's own moves (stalker.js); a guard running for cover (guard.js)
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

// The objective's been hit (core.js): the turrets set to guard it wake.
function wakeObjectiveGuards() {
  for (const e of enemies) if (e.wakesOnObjective) wakeTurret(e);
}

// Aiming: face the player, charge up, then fire. Shared by every type.
// A finished charge starts a VOLLEY: `volley` rounds, `volleyGap` apart
// (one round, for everything but the turret). updateVolley fires them.
function aimAndFire(enemy, dt) {
  enemy.angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
  if (enemy.volleyLeft > 0) return; // still firing the last one
  enemy.charge += dt;
  if (enemy.charge >= chargeTime(enemy)) {
    enemy.charge = 0;
    enemy.onTarget = true; // the next one comes quicker, if its type's does (followUp)
    enemy.volleyLeft = ENEMY_TYPES[enemy.type].volley;
    enemy.volleyTimer = 0; // the first round goes this frame
  }
}

// How long this one's next shot takes to charge: its type's charge, or its
// followUp once it has fired and still has you in its sights.
function chargeTime(enemy) {
  const type = ENEMY_TYPES[enemy.type];
  return (enemy.onTarget && type.followUp > 0 ? type.followUp : type.charge) * (enemy.elite ? ELITE_FIRE : 1);
}

// The rounds of a volley, one each time the gap runs out. Each is its own
// shot, with its own chance to hit, as long as the robot can still see you:
// duck out of sight mid-volley and the rest go wide.
function updateVolley(enemy, dt) {
  if (enemy.volleyLeft === 0) return;
  enemy.volleyTimer -= dt;
  if (enemy.volleyTimer > 0) return;
  enemy.volleyLeft -= 1;
  enemy.volleyTimer = ENEMY_TYPES[enemy.type].volleyGap * (enemy.elite ? ELITE_FIRE : 1);
  if (canSee(enemy)) robotFires(enemy, Math.hypot(player.x - enemy.x, player.y - enemy.y));
  else if (ENEMY_TYPES[enemy.type].weapon === 'lob') lobAcid(enemy, enemy.lastSeenX, enemy.lastSeenY); // a spitter lobs it where you were
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
  const step = ENEMY_TYPES[enemy.type].speed * STRAFE_SPEED * dt * enemy.strafeDir;
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
//   retreat, repair   smart robots at half health: to a repair bay and
//          back (repair.js), ignoring you meanwhile
function updateWalker(enemy, dt) {
  const type = ENEMY_TYPES[enemy.type];
  if (enemy.state === 'dormant') return; // a creature asleep in its tank (creatures.js)
  if (type.weapon === 'command') { updateManager(enemy, dt); return; } // manager.js: it thinks for itself
  if (type.weapon === 'melee' && updateMeleeAttack(enemy, dt)) return; // mid-attack (creatures.js)
  if (type.weapon === 'slash' && updateStalker(enemy, dt)) return;      // slashing, running, lurking (stalker.js)
  if (updateInfected(enemy, dt)) return; // grabbing, staggering or getting up (infected.js)
  if (updateRepairing(enemy, dt)) return; // smart, and badly hurt: off to a repair bay (repair.js)
  if (updateFeeding(enemy, dt)) return;   // a wounded lurcher, off to eat the dead (feeding.js)
  if (followOrder(enemy, dt)) return;     // a suit doing what the Manager said (manager.js)
  if (type.weapon === 'pistol' && updateGuard(enemy, dt)) return; // a guard in a fight: cover, bursts, reloads (guard.js)
  const sees = canSee(enemy);
  const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
  if (sees) {
    if (enemy.smart) callForHelp(enemy);
    if (enemy.pair) pairSpotted(enemy); // creatures.js: it calls its partner
    enemy.lastSeenX = player.x;
    enemy.lastSeenY = player.y;
    enemy.state = dist <= type.aimRange ? 'aim' : 'chase';
  } else if (enemy.state === 'chase' || enemy.state === 'aim') {
    enemy.state = 'search';
  }

  // Too close for a ranged creature: it backs away instead of firing, if it can.
  if (sees && type.retreat && dist < type.retreat && retreatStep(enemy, dt)) {
    enemy.state = 'chase';
    enemy.moving = true;
    return;
  }

  if (enemy.state === 'aim' && type.weapon === 'melee') {
    startMeleeAttack(enemy); // creatures.js: it rears up
  } else if (enemy.state === 'aim' && type.weapon === 'slash') {
    startSlash(enemy);       // stalker.js: a hiss, and the blades
  } else if (enemy.state === 'aim' && type.weapon === 'grab') {
    startGrab(enemy);        // infected.js: it takes hold
  } else if (enemy.state === 'aim') {
    aimAndFire(enemy, dt);
    if (enemy.smart && type.strafe) enemy.moving = strafeStep(enemy, dt);
  } else if (enemy.state === 'chase') {
    if (type.weapon === 'slash' && sees && stalkerHoldsOff(enemy, dist)) return; // stalker.js: you're lit up, it waits in the dark
    const flank = enemy.pair ? pairFlankPoint(enemy) : null; // creatures.js: the second of a pair comes round your side
    if (flank) {
      enemy.moving = moveAlongPath(enemy, flank.x, flank.y, dt);
    } else if (enemy.smart && type.weave && sees) {
      enemy.moving = weaveStep(enemy, dt);
    } else {
      // No route (a door shut between you)? It waits, still watching.
      enemy.moving = moveAlongPath(enemy, player.x, player.y, dt);
    }
  } else if (enemy.state === 'search') {
    // Called by its partner (creatures.js): it comes round your side, not after it.
    const flank = enemy.pairCalled ? pairFlankPoint(enemy) : null;
    if (flank) { enemy.moving = moveAlongPath(enemy, flank.x, flank.y, dt); return; }
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
  const type = ENEMY_TYPES.turret;
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
  if (enemy.state === 'dead') { updateDowned(enemy, dt); return; } // infected.js: a downed suit may get up

  updateVolley(enemy, dt); // a volley under way keeps firing whatever else happens

  // Just been shot: spin round to face you first, then carry on as normal.
  if (enemy.turning) {
    if (turnStep(enemy, dt)) enemy.turning = false;
    return;
  }

  const type = ENEMY_TYPES[enemy.type];
  if (type.mobile) updateWalker(enemy, dt);
  else if (type.weapon === 'spores') updateBloomer(enemy, dt); // infected.js
  else if (type.weapon === 'brood') updateBrood(enemy, dt);    // brood.js
  else updateTurret(enemy, dt);

  // Charging only happens while aiming. Leaving 'aim' (you duck out of sight,
  // or back off out of range) throws the charge away: that's your counterplay.
  if (enemy.state !== 'aim') { enemy.charge = 0; enemy.onTarget = false; } // and its next first shot is slow again
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
// it's after you, and held steady while it limps to a repair bay or is welded.
// Its position offsets the timing, so they don't blink in step.
function beaconLit(enemy) {
  if (enemy.state === 'retreat' || enemy.state === 'repair') return true;
  const rate = enemy.state === 'idle' ? BEACON_IDLE_RATE : BEACON_ALERT_RATE;
  return (animTime * rate + enemy.x * 0.37) % 1 < 0.5;
}

function enemyTexture(enemy, viewer) {
  if (enemy.state === 'dead') {
    if (enemy.downTime > 0) return downedTexture(enemy); // infected.js: down, but getting up again
    return corpseTexture(enemy) || WRECK_TEXTURE; // feeding.js: whole, bones or ash; a heap looks the same from every side
  }
  const frames = enemy.smart ? SMART_ROBOT_FRAMES[enemy.type][beaconLit(enemy) ? 'on' : 'off']
    : enemy.elite ? ELITE_ROBOT_FRAMES[enemy.type]                            // robot-art.js: executive livery
    : enemy.type === 'stalker' ? STALKER_FRAMES[stalkerVisibility(enemy)] // stalker.js: seen only as well as it's lit
    : enemy.type === 'guard' && enemy.torchBroken ? GUARD_DARK_FRAMES        // guard-art.js: its torch shot out
    : ROBOT_FRAMES[enemy.type];
  // A creature's attack faces you throughout, so it's only ever seen from the front.
  const attackPose = { windup: 'rear', lunge: 'lunge', recover: 'stand', grab: 'grab', stagger: 'stand', rising: 'rise', swell: 'swell', spent: 'open', slash: 'slash', labour: 'swell', duck: 'duck', reload: 'duck' }[enemy.state];
  if (attackPose) return frames.front[attackPose];
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
  else if (enemy.state === 'feed') pose = 'feed'; // hunched over a body (feeding.js)
  else if (enemy.state === 'root') pose = 'root'; // the Manager, rooted in a planter (manager.js)
  else if (enemy.moving) pose = Math.floor(enemy.walkTime * WALK_FPS) % 2 === 0 ? 'walk1' : 'walk2';
  return frames[view][pose] || frames[view].stand; // a creature asleep in its tank just stands
}
