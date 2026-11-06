// REPAIR BAYS, and the smart robots that use them.
//
// A repair bay is a wall fixture ('R' cells in a level's rows): a recess
// with two welding arms and three amber lamps, one per repair it has left.
//
// A SMART walking robot that's down to half its health or less breaks off
// the fight and walks to the nearest bay it can reach (by path), its
// beacon held steady and sparks spitting off its hull. It ignores you on the
// way (except to call for help if it sees you: it's still smart), and being
// shot doesn't turn it round: a fleeing robot shows you its back, and a
// heavy's back takes double. At the bay it backs in, the arms weld it, and it
// gets REPAIR_RATE hits back a second. At full health it goes back to where
// it last saw you.
//
// The choices: chase it (into its own zone), shoot out the bay (BAY_HEALTH
// hits; then nothing in that room can repair), ambush it at the bay, or let
// it go and meet it again at full strength. Each bay has BAY_CHARGES
// repairs, so a fight can't go round for ever; one robot uses a bay at a time.
//
// A robot with no bay it can reach (all used up, shot out, taken, or behind
// a door: robots can't open doors) just fights on.
//
// States on the robot (enemies.js):
//   retreat  walking to its bay (enemy.bay)
//   repair   docked: being welded

const BAY_CHARGES = 3;
const BAY_HEALTH = 4;             // hits (shots, or blasts) to wreck a bay
const REPAIR_RATE = 1;            // hits restored per second, docked
const DOCK_DEPTH = 0.35;          // how far in front of the bay's face a docked robot stands
const BAY_LAMP_LIGHT = { colour: [0.9, 0.55, 0.15], radius: 1.6, level: 0.5 };
const WELD_LIGHT = { colour: [0.7, 0.85, 1.3], radius: 2.8 };
const SPARK_FPS = 12;

// Every bay in the map:
//   x, y      its wall cell
//   dock      the floor point in front of it where a robot stands to be repaired
//   facing    the way a docked robot faces: out into the room
//   charges   repairs left
//   health    hits left; 0 = wrecked
//   user      the robot that has claimed it (on its way, or docked), or null
const bays = [];
MAP.forEach((row, y) => row.forEach((cell, x) => {
  if (cell !== REPAIR_CELL) return;
  const faces = Object.values(FACE_STEPS).filter(([dx, dy]) => MAP[y + dy]?.[x + dx] === 0);
  if (faces.length !== 1) {
    throw new Error(`Repair bay at MAP[${y}][${x}] has floor on ${faces.length} sides: it needs exactly one, so robots know which way to dock.`);
  }
  const [dx, dy] = faces[0];
  bays.push({
    x, y,
    dock: { x: x + 0.5 + dx * (0.5 + DOCK_DEPTH), y: y + 0.5 + dy * (0.5 + DOCK_DEPTH) },
    facing: Math.atan2(dy, dx),
    charges: BAY_CHARGES,
    health: BAY_HEALTH,
    user: null,
  });
}));

function bayAt(cellX, cellY) {
  return bays.find((b) => b.x === cellX && b.y === cellY);
}

function bayUsable(bay) {
  return bay.health > 0 && bay.charges > 0;
}

// Does this robot want a repair? Smart walking robots only, at half health or less.
function wantsRepair(enemy) {
  const type = ENEMY_TYPES[enemy.type];
  return enemy.smart && type.mobile && enemy.health <= type.health / 2;
}

// The nearest bay this robot can walk to, by path length, that's free and
// has repairs left; or null.
function nearestBay(enemy) {
  let best = null, bestSteps = Infinity;
  for (const bay of bays) {
    if (!bayUsable(bay) || bay.user) continue;
    const path = findPath(enemy.x, enemy.y, bay.dock.x, bay.dock.y);
    if (path !== null && path.length < bestSteps) { best = bay; bestSteps = path.length; }
  }
  return best;
}

// Back to the hunt: to where it last saw you (it never forgets that).
function leaveBay(enemy) {
  if (enemy.bay && enemy.bay.user === enemy) enemy.bay.user = null;
  enemy.bay = null;
  enemy.state = 'search';
}

// Called from the walking robots' state machine (enemies.js) before it does
// anything else. Returns true if retreating or repairing took this frame.
function updateRepairing(enemy, dt) {
  if (enemy.state === 'repair') {
    const bay = enemy.bay;
    if (bay.health === 0) { leaveBay(enemy); return false; } // shot out from under it: fight on
    enemy.angle = bay.facing;
    enemy.repairTime += dt;
    while (enemy.repairTime >= 1 / REPAIR_RATE && enemy.health < ENEMY_TYPES[enemy.type].health) {
      enemy.repairTime -= 1 / REPAIR_RATE;
      enemy.health += 1;
    }
    if (enemy.health >= ENEMY_TYPES[enemy.type].health) leaveBay(enemy);
    return true;
  }

  if (enemy.state === 'retreat') {
    const bay = enemy.bay;
    if (bay.health === 0) { leaveBay(enemy); return false; } // its bay's gone: fight on
    if (canSee(enemy)) {
      callForHelp(enemy); // enemies.js: it still raises the alarm as it goes
      enemy.lastSeenX = player.x;
      enemy.lastSeenY = player.y;
    }
    if (Math.hypot(bay.dock.x - enemy.x, bay.dock.y - enemy.y) < 0.15) {
      enemy.state = 'repair';
      enemy.repairTime = 0;
      bay.charges -= 1; // used as it docks: the lamp goes out now, so you can see it
      return true;
    }
    enemy.moving = moveAlongPath(enemy, bay.dock.x, bay.dock.y, dt);
    // No route any more (a door shut behind it)? Give the bay up and fight.
    // (Just blocked, say by you in the doorway, it keeps trying.)
    if (enemy.path === null) { leaveBay(enemy); return false; }
    return true;
  }

  if (!wantsRepair(enemy)) return false;
  const bay = nearestBay(enemy);
  if (!bay) return false;
  bay.user = enemy;
  enemy.bay = bay;
  enemy.state = 'retreat';
  enemy.turning = false;
  enemy.volleyLeft = 0;
  return true;
}

// A round, or a blast, on a bay. A wrecked bay goes up in a small blast of
// its own (no damage to you) and nothing can repair there again.
function damageBay(bay, hits) {
  if (bay.health === 0) return;
  bay.health = Math.max(0, bay.health - hits);
  if (bay.health > 0) return;
  bay.charges = 0;
  explodeAt(bay.dock.x, bay.dock.y, { radius: 1.0, damage: 0, spareDrones: true }); // explosions.js
}

// A blast near any bays (explosions.js): hits as for a robot, measured to its face.
function blastBays(x, y, blast) {
  for (const bay of bays) {
    if (bay.health === 0) continue;
    const d = Math.hypot(bay.dock.x - x, bay.dock.y - y);
    if (d < blast.radius) damageBay(bay, Math.ceil(BLAST_ROBOT_HITS * blastStrength(blast, d)));
  }
}

// Each frame: let go of a bay whose robot has died on the way or in the cradle.
function updateRepairBays() {
  for (const bay of bays) {
    if (bay.user && bay.user.state === 'dead') bay.user = null;
  }
}

function bayWelding(bay) {
  return bay.user !== null && bay.user.state === 'repair';
}

// The picture for a bay's wall cell (raycaster.js).
function bayTexture(cellX, cellY) {
  const bay = bayAt(cellX, cellY);
  if (bay.health === 0) return REPAIR_BAY_WRECK;
  const weld = bayWelding(bay) ? 1 + Math.floor(animTime * SPARK_FPS) % 2 : 0;
  return REPAIR_BAY_TEXTURES[bay.charges][weld];
}

// Lights (lighting.js): a little amber from a bay with repairs left, and a
// harsh blue-white flicker while one's welding.
function addRepairLights(grid) {
  for (const bay of bays) {
    if (bay.health === 0) continue;
    if (bay.charges > 0) addLight(grid, bay.dock.x, bay.dock.y, BAY_LAMP_LIGHT.colour, BAY_LAMP_LIGHT.radius, BAY_LAMP_LIGHT.level);
    if (bayWelding(bay)) addLight(grid, bay.dock.x, bay.dock.y, WELD_LIGHT.colour, WELD_LIGHT.radius, 0.4 + 0.6 * Math.random());
  }
}

// Sparks over every robot retreating or being welded (sprites.js). They're
// nudged a hair towards the viewer so they always draw over the robot.
function repairThings(thing, viewer) {
  const tex = SPARK_TEXTURES[Math.floor(animTime * SPARK_FPS) % SPARK_TEXTURES.length];
  return enemies.filter((e) => e.state === 'retreat' || e.state === 'repair').map((e) => {
    const d = Math.hypot(viewer.x - e.x, viewer.y - e.y) || 1;
    return thing(e.x + (viewer.x - e.x) / d * 0.05, e.y + (viewer.y - e.y) / d * 0.05, tex, { effect: true });
  });
}
