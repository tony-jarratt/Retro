// STEAM VENTS: floor vents that blow a plume of scalding steam on a cycle.
//
//   idle (3s) -> sputter (0.7s, weak puffs: the warning) -> burst (2s) -> idle ...
//
// While a vent is bursting, its plume:
//   - blocks SIGHT: robots and cameras can't see through it (steamBlocksSight),
//     so you can time a dash past a turret or camera to the moment it fires;
//   - SCALDS anyone standing in it, you and robots alike: lure one in.
// It never stops bullets: you can shoot through it, if you can see what's there.
//
// The plume is drawn as a sprite with PART-transparent texels (alpha between
// 0 and 255), which sprites.js blends over the scene, the same way as glass.

const STEAM_IDLE_TIME = 3.0;      // seconds quiet between bursts
const STEAM_SPUTTER_TIME = 0.7;   // seconds of warning puffs before a burst
const STEAM_BURST_TIME = 2.0;     // seconds a burst lasts
const STEAM_RADIUS = 0.45;        // how far from the vent's centre the plume reaches, in cells
const STEAM_ANIM_FPS = 10;        // frames per second of billowing
const SCALD_DAMAGE = 5;           // your health lost per scald tick...
const SCALD_TICK = 0.4;           // ...every this many seconds in the plume (about 12 a second)
const ROBOT_SCALD_TICK = 1.0;     // a robot in the plume takes 1 hit this often

// The live vents, from the level's vents:
//   x, y      the middle of its cell (where the plume stands)
//   state     'idle', 'sputter' or 'burst'
//   timer     seconds left in this state
const vents = VENTS.map((v, n) => {
  if (MAP[v.y]?.[v.x] !== 0) throw new Error(`VENTS[${n}] at cell (${v.x}, ${v.y}) is not a floor cell.`);
  return { x: v.x + 0.5, y: v.y + 0.5, cellX: v.x, cellY: v.y, state: 'idle', timer: v.delay };
});

// Seconds each thing has spent in steam towards its next scald tick.
let playerScald = 0;
const robotScald = new Map(); // robot -> seconds

function inPlume(vent, x, y, r) {
  return Math.hypot(x - vent.x, y - vent.y) < STEAM_RADIUS + r * 0.5;
}

// Is the straight line from (x1, y1) to (x2, y2) through a bursting plume?
// segmentDistance (textures.js) is the closest the line comes to the vent.
function steamBlocksSight(x1, y1, x2, y2) {
  return vents.some((v) => v.state === 'burst' && segmentDistance(v.x, v.y, x1, y1, x2, y2) < STEAM_RADIUS);
}

function updateSteam(dt) {
  for (const v of vents) {
    v.timer -= dt;
    if (v.timer <= 0) {
      if (v.state === 'idle') { v.state = 'sputter'; v.timer = STEAM_SPUTTER_TIME; }
      else if (v.state === 'sputter') { v.state = 'burst'; v.timer = STEAM_BURST_TIME; }
      else { v.state = 'idle'; v.timer = STEAM_IDLE_TIME; }
    }
  }
  const bursting = vents.filter((v) => v.state === 'burst');

  // Scalding: time in a plume adds up, and every tick of it costs health.
  // Out of the steam, the count starts again from nothing.
  if (bursting.some((v) => inPlume(v, player.x, player.y, PLAYER_RADIUS))) {
    playerScald += dt;
    if (playerScald >= SCALD_TICK) {
      playerScald -= SCALD_TICK;
      damagePlayer(SCALD_DAMAGE);
    }
  } else {
    playerScald = 0;
  }
  for (const e of enemies) {
    if (e.state === 'dead' || !bursting.some((v) => inPlume(v, e.x, e.y, ENEMY_RADIUS))) {
      robotScald.delete(e);
      continue;
    }
    const t = (robotScald.get(e) || 0) + dt;
    if (t >= ROBOT_SCALD_TICK) {
      damageEnemy(e, 1, false); // not your doing: it doesn't turn on you
      robotScald.set(e, t - ROBOT_SCALD_TICK);
    } else {
      robotScald.set(e, t);
    }
  }
}

// Plumes, as sprites for sprites.js. They're effects: shots pass through.
function steamThings(thing) {
  const frame = Math.floor(animTime * STEAM_ANIM_FPS) % STEAM_FRAMES;
  const list = [];
  for (const v of vents) {
    if (v.state === 'burst') list.push(thing(v.x, v.y, STEAM_BURST_FRAMES[frame], { effect: true }));
    if (v.state === 'sputter') list.push(thing(v.x, v.y, STEAM_SPUTTER_FRAMES[frame], { effect: true }));
  }
  return list;
}
