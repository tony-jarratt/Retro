// DRONES: a swarm enemy, made for the gun's automatic mode.
//
// Each drone is small, hovers at eye height, darts from side to side as it
// flies, and dies to a single hit. One at a time they're hard to hit; sprayed
// at as a cloud, they drop fast. Their attack is themselves: a drone that
// reaches you blows up (a small blast, through explodeAt, so it can also set
// off drums, scorch walls and blow in windows).
//
// Where they come from:
//   PACKS (a level's dronePacks): a group hovering quietly in place until one
//     of them sees you, or an alarm goes off in their zone. Then the whole pack comes.
//   HIVES (a level's hives): honeycomb panels in a wall, each holding a pack.
//     An alarm in the hive's zone (a camera spotting you, a tripwire) releases
//     them one after another. Then the hive is empty for good.
//
// THE SWARM. An awake drone steers by adding up three urges each frame:
//   1. towards you: straight at you if it can see you, otherwise along its
//      shortest path (pathfinding.js), like the walkers;
//   2. a sideways DART: its own sine wave across its line of flight, so it
//      weaves and a single shot aimed where it was misses where it is;
//   3. SEPARATION: away from any other drone that's too close, so the pack
//      spreads into a cloud instead of piling into one point.
// Add the three, scale to its speed, move. That's all it takes to look like a
// swarm ("boids" add a third urge, matching your neighbours' heading; the
// drones don't need it, because they all fly at you anyway).

const DRONE_SPEED = 2.6;          // cells per second: a little SLOWER than you (3.0), so backing off buys time to spin the gun up
const DRONE_RADIUS = 0.12;        // collision box half-width
const DRONE_SIGHT = 7;            // cells: how far a waiting drone can see you
const DRONE_STRIKE_RANGE = 0.4;   // this close to you, it goes off
const DRONE_DART = 0.9;           // how hard it weaves, compared with flying straight
const DRONE_DART_RATE = 5;        // radians per second of its weave: about 0.8 weaves a second
const DRONE_SPACING = 0.6;        // cells: closer than this to another drone, it pushes away
const DRONE_RELEASE_GAP = 0.3;    // seconds between drones leaving a hive
const DRONE_ANIM_FPS = 12;        // rotor frames per second
const DRONE_BLAST = { radius: 0.9, damage: 12, spareDrones: true }; // its kamikaze blast (explosions.js)

// Every drone in the level, from packs and released from hives:
//   x, y     position
//   state    'waiting' (a pack not yet woken), 'swarm' (coming for you), or 'dead'
//   pack     which pack or hive it came from, so one waking wakes them all
//   zone     the security zone it answers to
//   phase    where in its weave it starts, so they don't all weave in step
const drones = [];

// The hives, from the level's hives. A hive's drones are released from the
// floor cell in front of it, one every DRONE_RELEASE_GAP seconds.
//   state    'loaded' -> 'releasing' -> 'empty'
//   left     drones still inside
//   timer    seconds until the next leaves
const hives = HIVES.map((h, n) => {
  const [dx, dy] = FACE_STEPS[h.face] || [NaN, NaN];
  if (!takesWallDecals(MAP[h.y]?.[h.x]) || MAP[h.y + dy]?.[h.x + dx] !== 0) {
    throw new Error(`HIVES[${n}] at cell (${h.x}, ${h.y}) face ${h.face}: that must be a plain wall with floor on its ${h.face} side.`);
  }
  if (!ZONES.some((z) => z.id === h.zone)) throw new Error(`HIVES[${n}] belongs to zone "${h.zone}", which is not in ZONES.`);
  return { ...h, outX: h.x + dx + 0.5, outY: h.y + dy + 0.5, state: 'loaded', left: h.count, timer: 0, pack: 'hive' + n };
});

function addDrone(x, y, state, pack, zone) {
  drones.push({ x, y, state, pack, zone, phase: Math.random() * Math.PI * 2 });
}

// The packs, waiting where map.js put them, in a loose ring so they don't
// start on top of each other.
DRONE_PACKS.forEach((p, n) => {
  if (MAP[Math.floor(p.y)]?.[Math.floor(p.x)] !== 0) throw new Error(`DRONE_PACKS[${n}] at (${p.x}, ${p.y}) is not on a floor cell.`);
  const zone = ZONES.find((z) => inZone(z, p.x, p.y));
  for (let i = 0; i < p.count; i++) {
    const a = i * 2 * Math.PI / p.count;
    addDrone(p.x + Math.cos(a) * 0.3, p.y + Math.sin(a) * 0.3, 'waiting', 'pack' + n, zone ? zone.id : null);
  }
});

function wakePack(pack) {
  for (const d of drones) if (d.pack === pack && d.state === 'waiting') d.state = 'swarm';
}

// Called by security.js when a zone's alarm goes off: its waiting packs wake,
// and its loaded hives start releasing.
function droneAlarm(zoneId) {
  for (const d of drones) if (d.zone === zoneId && d.state === 'waiting') d.state = 'swarm';
  for (const h of hives) if (h.zone === zoneId && h.state === 'loaded') { h.state = 'releasing'; h.timer = 0; }
}

// Can this drone see you? The same castRay line-of-sight as the robots, and
// steam hides you from them too.
function droneSees(d) {
  const dx = player.x - d.x, dy = player.y - d.y;
  const dist = Math.hypot(dx, dy);
  if (dist > DRONE_SIGHT) return false;
  return castRay(d.x, d.y, dx / dist, dy / dist).dist > dist && !steamBlocksSight(d.x, d.y, player.x, player.y);
}

// Shot, or caught in a blast: a puff of fireball, no damage of its own.
function destroyDrone(d) {
  if (d.state === 'dead') return;
  d.state = 'dead';
  explosions.push({ x: d.x, y: d.y, time: EXPLOSION_TIME * 0.4 }); // start part-way: a small, quick pop
  sfxDronePop(d); // sound.js
}

// It reached you: it goes off.
function droneStrikes(d) {
  d.state = 'dead';
  explodeAt(d.x, d.y, DRONE_BLAST);
}

// The direction a swarming drone wants to fly towards you, as a unit vector:
// straight at you if there's a clear line, else towards the middle of the
// next cell on its path. null if it has no way to reach you.
function droneHeading(d) {
  const dx = player.x - d.x, dy = player.y - d.y;
  const dist = Math.hypot(dx, dy);
  if (castRay(d.x, d.y, dx / dist, dy / dist).dist > dist) return { x: dx / dist, y: dy / dist };
  const path = findPath(d.x, d.y, player.x, player.y);
  if (!path || path.length === 0) return null;
  const tx = path[0].x + 0.5 - d.x, ty = path[0].y + 0.5 - d.y;
  const t = Math.hypot(tx, ty) || 1;
  return { x: tx / t, y: ty / t };
}

function updateDrone(d, dt) {
  if (d.state === 'waiting') {
    if (droneSees(d)) wakePack(d.pack);
    return;
  }
  if (Math.hypot(player.x - d.x, player.y - d.y) < DRONE_STRIKE_RANGE) {
    droneStrikes(d);
    return;
  }
  const head = droneHeading(d);
  if (!head) return; // shut out (a closed door): hover where it is

  // 1. towards you, 2. the dart across its line of flight, 3. separation.
  const dart = Math.sin(animTime * DRONE_DART_RATE + d.phase) * DRONE_DART;
  let mx = head.x + -head.y * dart;
  let my = head.y + head.x * dart;
  for (const o of drones) {
    if (o === d || o.state !== 'swarm') continue;
    const ox = d.x - o.x, oy = d.y - o.y;
    const od = Math.hypot(ox, oy);
    if (od > 0 && od < DRONE_SPACING) {
      const push = 1.5 * (1 - od / DRONE_SPACING);
      mx += ox / od * push;
      my += oy / od * push;
    }
  }
  const len = Math.hypot(mx, my) || 1;
  const step = DRONE_SPEED * dt;
  // One axis at a time, like everything else, so it slides along walls.
  const nx = d.x + mx / len * step;
  if (!boxHitsWall(nx, d.y, DRONE_RADIUS)) d.x = nx;
  const ny = d.y + my / len * step;
  if (!boxHitsWall(d.x, ny, DRONE_RADIUS)) d.y = ny;
}

function updateDrones(dt) {
  for (const h of hives) {
    if (h.state !== 'releasing') continue;
    h.timer -= dt;
    if (h.timer > 0) continue;
    addDrone(h.outX, h.outY, 'swarm', h.pack, h.zone);
    h.left -= 1;
    h.timer = DRONE_RELEASE_GAP;
    if (h.left === 0) {
      h.state = 'empty';
      placeDecal('wall', h.x, h.y, h.face, 'hiveEmpty', 0); // the cells go dark
    }
  }
  for (const d of drones) if (d.state !== 'dead') updateDrone(d, dt);
}

// A blast at (x, y) takes out every drone within its radius (explosions.js):
// lure a swarm past some drums. Drones' own blasts spare each other, or the
// first one to reach you would take half its pack with it.
function blastDrones(x, y, radius) {
  for (const d of drones) {
    if (d.state !== 'dead' && Math.hypot(d.x - x, d.y - y) < radius) destroyDrone(d);
  }
}

// Live drones, as sprites for sprites.js. Each spins its rotors a frame out
// of step with the next, so a pack doesn't flicker in unison.
function droneThings(thing) {
  return drones.filter((d) => d.state !== 'dead').map((d, n) => {
    const frame = (Math.floor(animTime * DRONE_ANIM_FPS) + n) % DRONE_FRAMES.length;
    return thing(d.x, d.y, DRONE_FRAMES[frame], { drone: d });
  });
}
