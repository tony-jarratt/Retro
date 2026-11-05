// SPORE CLOUDS: what a bloomer bursts into (infected.js). A cloud hangs where
// it burst for SPORE_TIME seconds, thinning out over the last SPORE_FADE:
//   - it BURNS: in it, you take SPORE_DAMAGE every SPORE_TICK seconds, and
//     your visor tints with it. (The infected are immune: it's theirs.)
//   - it BLOCKS SIGHT, like steam (steam.js, steamBlocksSight): nothing sees
//     through it, either way, and its glowing motes light the room a little.
//   - bursting is a NOISE (creatures.js): the suits nearby come to look.
// Drawn as a handful of drifting billboards (sprites.js), shots pass through.

const SPORE_RADIUS = 1.6;      // cells
const SPORE_TIME = 6;          // seconds a cloud hangs
const SPORE_FADE = 1.5;        // seconds over which it thins out at the end
const SPORE_TICK = 0.5;
const SPORE_DAMAGE = 3;
const SPORE_NOISE = 6;         // cells: how far the burst carries
const SPORE_TINT = [170, 200, 70];
const SPORE_LIGHT = { colour: [0.5, 0.65, 0.2], radius: 2.2 };
const SPORE_PUFFS = [[0, 0, 0], [0.6, 0.3, 0.15], [-0.5, 0.45, -0.1], [0.2, -0.6, 0.25], [-0.45, -0.4, 0.05]]; // [dx, dy, lift] of each billboard

// Clouds hanging: x, y, and seconds left.
const clouds = [];
let sporeTimer = 0; // your time in spores since the last burn

function sporeBurst(x, y) {
  clouds.push({ x, y, time: SPORE_TIME });
  makeNoise(x, y, SPORE_NOISE); // creatures.js
  sfxSporeBurst(x, y);          // sound.js
}

// How thick a cloud is now: 1, thinning to 0 over its last SPORE_FADE seconds.
function cloudThickness(c) {
  return Math.min(1, c.time / SPORE_FADE);
}

function inSpores(x, y) {
  return clouds.some((c) => cloudThickness(c) > 0.3 && Math.hypot(x - c.x, y - c.y) < SPORE_RADIUS);
}

// Does the line from (x1, y1) to (x2, y2) pass through a cloud? (Thin at the edges: it counts within 80% of its radius.)
function sporesBlockSight(x1, y1, x2, y2) {
  return clouds.some((c) => cloudThickness(c) > 0.3 && segmentDistance(c.x, c.y, x1, y1, x2, y2) < SPORE_RADIUS * 0.8);
}

function updateSpores(dt) {
  for (let i = clouds.length - 1; i >= 0; i--) {
    clouds[i].time -= dt;
    if (clouds[i].time <= 0) clouds.splice(i, 1);
  }
  if (inSpores(player.x, player.y)) {
    sporeTimer += dt;
    if (sporeTimer >= SPORE_TICK) { sporeTimer -= SPORE_TICK; damagePlayer(SPORE_DAMAGE); }
  } else {
    sporeTimer = 0;
  }
}

// The cloud's billboards (sprites.js), each drifting slowly round its spot.
function sporeThings(thing) {
  const list = [];
  clouds.forEach((c, n) => {
    if (cloudThickness(c) < 0.15) return;
    SPORE_PUFFS.forEach(([dx, dy, lift], k) => {
      const t = animTime * 0.4 + k * 1.3 + n;
      const frame = SPORE_FRAMES[Math.floor(animTime * 5 + k) % SPORE_FRAMES.length];
      list.push(thing(c.x + dx + 0.15 * Math.sin(t), c.y + dy + 0.15 * Math.cos(t * 1.3), frame, { effect: true, lift: lift * cloudThickness(c) }));
    });
  });
  return list;
}

// Their glowing motes (lighting.js).
function addSporeLights(grid) {
  for (const c of clouds) addLight(grid, c.x, c.y, SPORE_LIGHT.colour, SPORE_LIGHT.radius, cloudThickness(c));
}

// In a cloud, your visor fills with it (hud.js).
function drawSporeTint(pixels) {
  if (inSpores(player.x, player.y)) tintScreen(pixels, SPORE_TINT, 0.3);
}
