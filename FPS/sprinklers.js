// SPRINKLERS: the HQ's fire system still works. Heads on the ceiling (a
// level's `sprinklers`, floor cells, drawn as a decal on the ceiling above).
//
// The heat of a blast within SPRINKLER_TRIGGER cells, with a clear line
// (a wall or a closed door keeps the heat out), sets a head off, and a
// head that's on sets off every other head it has a clear line to within
// SPRINKLER_LINK (they're one system per room). Each runs SPRINKLER_TIME
// seconds: water rains down under it, the floor round it ends up in
// puddles, and every BLOOMER within SPRINKLER_REACH of it is watered, and
// FLOWERS (infected.js): a whole room's bloomers bursting at once.
//
// That's the HQ's chain reaction, the way fuel drums are the industrial
// sector's: set off a drum where the sprinklers will feel it, from far
// enough away, and the room's spores go off while you're not in it. But
// the blast is loud, and every suit in earshot comes.

const SPRINKLER_TRIGGER = 5;   // cells from a blast
const SPRINKLER_LINK = 10;     // cells between heads of one system
const SPRINKLER_TIME = 10;     // seconds it runs
const SPRINKLER_REACH = 2.5;   // cells: a bloomer this close is watered
const SPRINKLER_HISS_GAP = 0.45;

// The heads: x, y (cell), on (running?), time (seconds left), hiss (seconds to the next hiss).
const sprinklers = SPRINKLERS.map((s, n) => {
  if (MAP[s.y]?.[s.x] !== 0) throw new Error(`sprinklers[${n}] at cell (${s.x}, ${s.y}) is not a floor cell.`);
  placeDecal('ceiling', s.x, s.y, null, 'sprinkler', 0); // decals.js
  return { x: s.x, y: s.y, on: false, time: 0, hiss: 0 };
});

function turnOnSprinkler(head) {
  if (head.on) return;
  head.on = true;
  head.time = SPRINKLER_TIME;
  // The floor round it gets wet: a puddle on every floor cell next to it that hasn't got something already.
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = head.x + dx, y = head.y + dy;
      if (MAP[y]?.[x] === 0 && !floorDecals[y * DECAL_W + x]) placeDecal('floor', x, y, null, 'puddle', noise(x, y, 450));
    }
  }
  // The rest of the system comes on with it.
  for (const other of sprinklers) {
    if (!other.on && Math.hypot(other.x - head.x, other.y - head.y) < SPRINKLER_LINK &&
        clearLine(head.x + 0.5, head.y + 0.5, other.x + 0.5, other.y + 0.5)) turnOnSprinkler(other);
  }
}

// A blast at (x, y) (explosions.js).
function sprinklersFeelBlast(x, y) {
  const near = sprinklers.filter((s) => !s.on && Math.hypot(s.x + 0.5 - x, s.y + 0.5 - y) < SPRINKLER_TRIGGER &&
    clearLine(x, y, s.x + 0.5, s.y + 0.5));
  if (near.length === 0) return;
  for (const s of near) turnOnSprinkler(s);
  sfxFireBell(near[0].x + 0.5, near[0].y + 0.5); // sound.js
}

function updateSprinklers(dt) {
  for (const s of sprinklers) {
    if (!s.on) continue;
    s.time -= dt;
    if (s.time <= 0) { s.on = false; continue; }
    s.hiss -= dt;
    if (s.hiss <= 0) { s.hiss = SPRINKLER_HISS_GAP; sfxSprinklerHiss(s.x + 0.5, s.y + 0.5); }
    for (const e of enemies) {
      if (e.state !== 'dead' && Math.hypot(e.x - s.x - 0.5, e.y - s.y - 0.5) < SPRINKLER_REACH) waterBloomer(e); // infected.js
    }
  }
}

// The spray, under each running head (sprites.js). Shots pass through it.
function sprinklerThings(thing) {
  const frame = RAIN_FRAMES[Math.floor(animTime * 12) % RAIN_FRAMES.length];
  return sprinklers.filter((s) => s.on).map((s) => thing(s.x + 0.5, s.y + 0.5, frame, { effect: true }));
}
