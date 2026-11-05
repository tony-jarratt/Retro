// ACID: the spitter's weapon (enemies.js, creatures.js).
//
// A spitter lobs a GLOB at the spot where you're standing as it fires. The
// glob flies in an arc and lands there whatever you do, so the counter is to
// move: a ring on the floor marks where it will come down. Where it lands:
//   - a SPLASH: anyone within GLOB_SPLASH of it takes the hit;
//   - a POOL of acid fills that floor cell for ACID_POOL_TIME seconds,
//     burning whoever stands in it: you, a lurcher you've lured through it
//     (it doesn't avoid them), and any larva, which it kills outright.
// A glob that meets a window or tank glass on the way eats straight through
// it instead: the glass shatters, and a tank's creature is loose.
// Globs and pools glow, lighting the floor round them green (lighting.js).

const GLOB_SPLASH = 0.7;          // cells from where it lands: the splash catches you
const GLOB_TIME_BASE = 0.45;      // seconds a glob is in the air: this...
const GLOB_TIME_PER_CELL = 0.09;  // ...plus this per cell it travels (6 cells: about 1s)
const GLOB_ARC = 0.25;            // how high the arc rises, in cells, plus...
const GLOB_ARC_PER_CELL = 0.05;   // ...this per cell of distance
const GLOB_START_LIFT = 0.2;      // the spitter's mouth, above eye height
const GLOB_END_LIFT = -0.45;      // the floor, below eye height (the sprite's middle)
const ACID_POOL_TIME = 6;         // seconds a pool burns
const ACID_TICK = 0.4;            // you: ACID_DAMAGE every this many seconds in a pool
const ACID_DAMAGE = 5;
const ACID_CREATURE_TICK = 1.0;   // a creature in a pool takes 1 hit this often
const ACID_BUBBLE_RATE = 4;       // pool decal frames per second
const ACID_LIGHT = { colour: [0.35, 1.0, 0.25], radius: 1.8 };
const GLOB_LIGHT = { colour: [0.4, 1.2, 0.3], radius: 1.6 };

// Globs in flight:
//   x0, y0, x1, y1   where it was spat from and where it will land
//   t                0 at the mouth, 1 on landing
//   time             seconds the whole flight takes
//   arc              how high it rises
//   glass            the window or tank pane it will hit instead, or null
const globs = [];

// Pools burning:
//   x, y      the floor cell
//   time      seconds left
//   under     the floor decal it covers (a puddle, a footprint...), put back when it dries
const pools = [];

let acidTimer = 0;                 // your time in a pool since the last burn
const acidCreatureTimers = new Map(); // creature -> its time in a pool since its last burn

// A spitter lobs a glob at (tx, ty).
function lobAcid(enemy, tx, ty) {
  enemy.firedTime = ROBOT_FIRE_FLASH; // shows its 'fire' pose (enemies.js)
  const glass = glassInTheWay(enemy.x, enemy.y, tx, ty);
  const x1 = glass ? glass.x + 0.5 : tx;
  const y1 = glass ? glass.y + 0.5 : ty;
  const dist = Math.hypot(x1 - enemy.x, y1 - enemy.y);
  globs.push({
    x0: enemy.x, y0: enemy.y, x1, y1, t: 0, glass,
    time: GLOB_TIME_BASE + GLOB_TIME_PER_CELL * dist,
    arc: GLOB_ARC + GLOB_ARC_PER_CELL * dist,
  });
  sfxSpit(enemy); // sound.js
}

// Where a glob is now, and how high: a straight line across the floor, and
// a parabola up and down (4t(1-t) is 0 at both ends and 1 in the middle).
function globPosition(g) {
  return {
    x: g.x0 + (g.x1 - g.x0) * g.t,
    y: g.y0 + (g.y1 - g.y0) * g.t,
    lift: GLOB_START_LIFT + (GLOB_END_LIFT - GLOB_START_LIFT) * g.t + 4 * g.arc * g.t * (1 - g.t),
  };
}

function globLands(g) {
  sfxAcidSplash(g.x1, g.y1); // sound.js
  if (g.glass) { shatterGlass(g.glass); return; } // panels.js: it eats through
  if (Math.hypot(player.x - g.x1, player.y - g.y1) < GLOB_SPLASH) damagePlayer(ENEMY_TYPES.spitter.damage);
  const x = Math.floor(g.x1), y = Math.floor(g.y1);
  if (MAP[y]?.[x] !== 0) return; // landed in a doorway: it splashes, but there's no floor to pool on
  const pool = pools.find((p) => p.x === x && p.y === y);
  if (pool) { pool.time = ACID_POOL_TIME; return; } // topped up
  pools.push({ x, y, time: ACID_POOL_TIME, under: floorDecals[y * DECAL_W + x] });
}

function inPool(x, y) {
  return pools.some((p) => p.x === Math.floor(x) && p.y === Math.floor(y));
}

function updateAcid(dt) {
  for (let i = globs.length - 1; i >= 0; i--) {
    const g = globs[i];
    g.t += dt / g.time;
    if (g.t >= 1) {
      globs.splice(i, 1);
      globLands(g);
    }
  }

  for (let i = pools.length - 1; i >= 0; i--) {
    const p = pools[i];
    p.time -= dt;
    if (p.time <= 0) {
      floorDecals[p.y * DECAL_W + p.x] = p.under; // dried up: the floor as it was
      pools.splice(i, 1);
      continue;
    }
    // It bubbles: the decal flips between its frames (decals.js).
    placeDecal('floor', p.x, p.y, null, 'acid', (Math.floor(animTime * ACID_BUBBLE_RATE) % 2) / 2 + 0.01, 0, false);
  }

  // Burning whoever's standing in one.
  if (inPool(player.x, player.y)) {
    acidTimer += dt;
    if (acidTimer >= ACID_TICK) { acidTimer -= ACID_TICK; damagePlayer(ACID_DAMAGE); }
  } else {
    acidTimer = 0;
  }
  for (const e of enemies) {
    if (e.state === 'dead' || !inPool(e.x, e.y)) { acidCreatureTimers.delete(e); continue; }
    const t = (acidCreatureTimers.get(e) || 0) + dt;
    if (t >= ACID_CREATURE_TICK) { damageEnemy(e, 1, false); acidCreatureTimers.set(e, t - ACID_CREATURE_TICK); }
    else acidCreatureTimers.set(e, t);
  }
  for (const l of larvae) if (l.state !== 'dead' && inPool(l.x, l.y)) destroyLarva(l); // larvae.js
}

// Globs in flight and their landing rings, as sprites (sprites.js). Shots pass through both.
function acidThings(thing) {
  const ring = ACID_TARGET_FRAMES[Math.floor(animTime * 6) % ACID_TARGET_FRAMES.length];
  const list = [];
  for (const g of globs) {
    const at = globPosition(g);
    list.push(thing(at.x, at.y, ACID_GLOB_TEXTURE, { effect: true, lift: at.lift }));
    if (!g.glass) list.push(thing(g.x1, g.y1, ring, { effect: true }));
  }
  return list;
}

// Their green glow (lighting.js). A pool fades out over its last second.
function addAcidLights(grid) {
  for (const g of globs) {
    const at = globPosition(g);
    addLight(grid, at.x, at.y, GLOB_LIGHT.colour, GLOB_LIGHT.radius, 1);
  }
  for (const p of pools) {
    const level = Math.min(1, p.time) * (0.75 + 0.25 * Math.sin(animTime * 7 + p.x));
    addLight(grid, p.x + 0.5, p.y + 0.5, ACID_LIGHT.colour, ACID_LIGHT.radius, level);
  }
}
