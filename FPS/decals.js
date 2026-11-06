// DECALS: wear and tear laid over the walls, floor and ceiling. Puddles, oil,
// old blast scorch, rust runs, damp, mech footprints, and stencilled signs.
//
// A decal is a mostly see-through 64x64 picture belonging to ONE surface of
// ONE cell: a floor cell, a ceiling cell, or one face of a wall cell. The
// renderer draws the surface as usual, then, if that spot has a decal, blends
// the decal's texel over it with blendTexel (the same alpha blend as glass),
// using the surface's own light and fog. So a scorch mark under a sodium lamp
// is lit orange, and one far down a corridor fades into the dark like the wall.
//
// Where decals go comes from three places, in this order (later ones replace
// earlier ones on the same surface):
//   1. RULES (scatterDecals): a repeatable pseudo-random scatter, so it looks
//      the same every load. Leaks drip puddles and stain the ceiling, old
//      blasts scorch the ground near fuel drums, pipes rust and leak oil.
//   2. HAND-PLACED, from a level's decals (levels/*.js): signs, footprint trails, a fight
//      that happened in a doorway. The things that tell a story.
//   3. EXPLOSIONS during play stamp fresh scorch marks (stampBlastScorch).
//
// Each placed decal is { tex, rot, mirror }: rot turns it 0-3 quarter turns
// clockwise (floor and ceiling only; walls keep "down" down so rust still
// runs downwards), and mirror flips it left to right. A few variants, turned
// and flipped, keep two puddles from ever looking quite the same.

// THE PICTURES ----------------------------------------------------------------

// An irregular round outline: the radius at angle `a`, wobbling around
// `base` with a couple of sine waves whose phase depends on `seed`. Used for
// puddles, oil, scorch and stains, so none of them is a perfect circle.
function blobRadius(a, base, seed) {
  return base * (1 + 0.22 * Math.sin(3 * a + seed) + 0.12 * Math.sin(5 * a + 2.3 * seed) + 0.06 * Math.sin(9 * a + seed * 4.1));
}

// For a texel: its distance from the blob's centre as a fraction of the
// blob's edge in that direction. Under 1 is inside the blob.
function blobT(x, y, cx, cy, base, seed) {
  const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
  return Math.hypot(dx, dy) / blobRadius(Math.atan2(dy, dx), base, seed);
}

// Standing water: dark (it mirrors the dark ceiling), a lighter wet rim,
// a few glints, and a damp halo on the floor around it.
function makePuddle(v) {
  const shape = (x, y) => blobT(x, y, 32 + v * 2, 31 - v, 21 + v * 2, v * 1.7 + 0.4);
  // Which texels are open water, for the reflections (reflections.js).
  const water = new Uint8Array(TEX_SIZE * TEX_SIZE);
  for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) water[y * TEX_SIZE + x] = shape(x, y) < 0.9 ? 1 : 0;
  const tex = makeTexture([30, 36, 44], (x, y) => {
    const t = shape(x, y);
    if (t < 0.9) {
      if (noise(x, y, 80 + v) < 0.025) return seeThrough([150, 170, 185], 220); // glint
      return seeThrough([34, 42, 54], 220);
    }
    if (t < 1) return seeThrough([100, 112, 122], 190); // the wet edge catching the light
    if (t < 1.25) return seeThrough([0, 0, 0], 70 * (1.25 - t) / 0.25); // damp floor round it
    return null;
  });
  tex.water = water;
  return tex;
}

// An oil slick: near-black, with rings of rainbow sheen ("thin-film
// interference": light bouncing off the top and bottom of the oil film).
function makeOil(v) {
  const sheen = [[110, 60, 140], [50, 120, 110], [150, 130, 50]];
  return makeTexture([20, 18, 16], (x, y) => {
    const t = blobT(x, y, 30 + v * 4, 33, 19 + v * 3, v * 2.9 + 1.1);
    if (t >= 1) return null;
    const band = Math.floor((t * 5 + noise(x >> 2, y >> 2, 82) * 0.8) % 3);
    if (t > 0.35 && t < 0.85 && noise(x, y, 83) < 0.55) return seeThrough(sheen[band], 130);
    return seeThrough([16, 14, 12], 210);
  });
}

// THE LAB'S SPILLS: a pool of green slime, something that leaked out of a
// tank. Glossy, so like water it mirrors the room (reflections.js), with a
// paler crust round its edge where it's drying.
// Fallen leaves (the HQ's spill), dried and browning, in a loose drift.
function makeLeaves(v) {
  return makeTexture([110, 100, 50], (x, y) => {
    if (blobT(x, y, 31 + v * 3, 33, 20 + v * 3, v * 1.9 + 0.4) >= 1) return null;
    const leaf = leafAt(x, y, 360 + v * 10, () => 0.55); // textures.js
    if (!leaf) return null;
    return seeThrough(mix(leaf, [140, 104, 50], 0.35 + 0.4 * noise(x >> 3, y >> 3, 361 + v)), 235);
  });
}

// A sprinkler head on the ceiling (sprinklers.js): a brass rosette with a red bulb.
function makeSprinklerHead() {
  return makeTexture([190, 160, 80], (x, y) => {
    const r = Math.hypot(x + 0.5 - 32, y + 0.5 - 32);
    if (r < 2) return [200, 40, 30];                          // the glass bulb
    if (r < 5) return brighten([196, 164, 84], 1.2 - 0.1 * r); // the deflector
    if (r < 6) return [80, 66, 40];
    return null;
  });
}

function makeSlime(v) {
  const shape = (x, y) => blobT(x, y, 31 + v * 3, 32, 18 + v * 3, v * 2.3 + 0.7);
  const water = new Uint8Array(TEX_SIZE * TEX_SIZE);
  for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) water[y * TEX_SIZE + x] = shape(x, y) < 0.85 ? 1 : 0;
  const tex = makeTexture([60, 120, 40], (x, y) => {
    const t = shape(x, y);
    if (t < 0.85) {
      if (noise(x, y, 84 + v) < 0.03) return seeThrough([200, 255, 160], 230); // a bubble catching the light
      return seeThrough(brighten([50, 110, 30], 0.85 + 0.3 * noise(x >> 2, y >> 2, 86)), 215);
    }
    if (t < 1) return seeThrough([150, 170, 90], 200);                  // the drying crust
    if (t < 1.2) return seeThrough([40, 60, 20], 80 * (1.2 - t) / 0.2); // a stain soaked into the floor round it
    return null;
  });
  tex.water = water;
  return tex;
}

// A biohazard symbol stencilled on a wall (onBiohazard, textures.js).
function makeBiohazardSign() {
  const paint = [120, 210, 60];
  return makeTexture(paint, (x, y) => {
    if (noise(x >> 1, y >> 1, 96) < 0.08) return null;
    return onBiohazard(x, y, 32, 32, 2.2) ? seeThrough(brighten(paint, 0.85 + 0.25 * noise(x >> 2, y >> 2, 97)), 210) : null;
  });
}

// Old blast scorch on the floor or ceiling: black in the middle, fading out
// through brown, with soot thrown outwards in streaks.
function makeScorch(v) {
  return makeTexture([20, 16, 12], (x, y) => {
    const dx = x + 0.5 - 32, dy = y + 0.5 - 32;
    const a = Math.atan2(dy, dx);
    const t = blobT(x, y, 32, 32, 19 + v * 3, v * 3.3 + 2);
    // Streaks: thin wedges of soot reaching out past the main burn.
    const streak = noise(Math.floor((a + Math.PI) * 9), v, 84);
    const reach = 1 + 0.7 * streak * streak;
    if (t >= reach) return null;
    const f = t < 1 ? 1 - 0.25 * t : 0.75 * (reach - t) / (reach - 1);
    const alpha = 250 * f * (0.85 + 0.15 * noise(x, y, 85 + v));
    return seeThrough(mix([6, 5, 4], [55, 38, 24], Math.min(1, t * t)), alpha);
  });
}

// A square steam vent grille: steel slats over a dark, rust-stained pit.
function makeVent() {
  return makeTexture(DARK_STEEL, (x, y) => {
    const inX = Math.abs(x + 0.5 - 32), inY = Math.abs(y + 0.5 - 32);
    const edge = Math.max(inX, inY);
    if (edge >= 20) return edge < 22 ? seeThrough(RUST, 120) : null; // rust stain round it
    if (edge >= 17) return brighten(STEEL, 0.9 + 0.2 * noise(x, y, 118)); // frame
    if (x % 5 < 2) return brighten(STEEL, 0.75);                        // slats
    return [10, 10, 12];
  });
}

// A drone hive set into a wall (drones.js): a steel panel of hexagonal
// cells. `loaded`, each cell holds a sleeping drone, its red eye showing;
// once the hive has released them, the cells are dark and empty.
function makeHive(loaded) {
  return makeTexture([60, 62, 58], (x, y) => {
    if (x < 6 || x >= 58 || y < 8 || y >= 56) return null;
    if (x < 8 || x >= 56 || y < 10 || y >= 54) return brighten(DARK_STEEL, 1.2); // frame
    // A honeycomb: rows of cells 12 wide, every other row shifted half a cell.
    const row = Math.floor((y - 10) / 11);
    const cx = (x - 8 + (row % 2) * 6) % 12 - 6, cy = (y - 10) % 11 - 5.5;
    const d = Math.max(Math.abs(cx) * 0.87 + Math.abs(cy) * 0.5, Math.abs(cy)); // a hexagon-ish distance
    if (d > 4.6) return brighten([60, 62, 58], 0.9 + 0.2 * noise(x, y, 119));  // the walls between cells
    if (loaded && Math.hypot(cx, cy) < 1.3) return [230, 50, 35];              // a sleeping drone's eye
    return [12, 12, 14];                                                       // inside a cell
  });
}

// A breeding pod (larvae.js): a fleshy sac grown over the wall, veined,
// with larvae curled up inside showing through as glowing shapes. Burst, it
// hangs open and empty, a dark split down the middle.
function makePod(loaded) {
  return makeTexture([150, 120, 110], (x, y) => {
    const dx = x + 0.5 - 32, dy = y + 0.5 - 32;
    const r = Math.hypot(dx / 22, dy / 26);
    if (r >= 1) return r < 1.12 ? seeThrough([60, 40, 36], 140) : null; // a stain where it's grown into the wall
    if (!loaded && Math.abs(dx) < 4 + 6 * (1 - r)) return [24, 12, 12]; // split open
    if (loaded) {
      for (const [cx, cy] of [[-8, -10], [7, -4], [-5, 8], [8, 12]]) {
        if (Math.hypot(dx - cx, (dy - cy) * 1.6) < 4.5) return [110 + 60 * (1 - r), 200, 80 + 30 * noise(x, y, 131)];
      }
    }
    const vein = Math.abs(Math.sin(dx * 0.4 + dy * 0.25 + 3 * noise(x >> 3, y >> 3, 132))) < 0.1;
    return brighten(vein ? [100, 60, 70] : [170, 135, 120], (1.15 - 0.5 * r) * (0.9 + 0.15 * noise(x >> 1, y >> 1, 133)));
  });
}

// A pool of a spitter's acid (acid.js): bright, bubbling green. Two frames,
// so it seethes. It isn't water: nothing reflects in it.
function makeAcidPool(v) {
  const shape = (x, y) => blobT(x, y, 32, 32, 22, 2.1);
  return makeTexture([100, 220, 60], (x, y) => {
    const t = shape(x, y);
    if (t < 0.9) {
      if (noise(x, y, 134 + v) < 0.05) return seeThrough([230, 255, 200], 255); // bubbles
      return seeThrough(brighten([90, 210, 50], 0.8 + 0.35 * noise(x >> 1, (y >> 1) + v * 3, 136)), 235);
    }
    if (t < 1.1) return seeThrough([40, 80, 20], 200 * (1.1 - t) / 0.2); // the floor scorched round it
    return null;
  });
}

// A round floor drain: a steel rim and slotted cover.
function makeDrain() {
  return makeTexture(DARK_STEEL, (x, y) => {
    const r = Math.hypot(x + 0.5 - 32, y + 0.5 - 32);
    if (r >= 15) return r < 17 ? seeThrough([0, 0, 0], 90) : null; // a grimy ring round it
    if (r >= 12.5) return brighten(STEEL, 0.9 + 0.2 * noise(x, y, 86));
    if (y % 4 < 2 && Math.abs(x - 32) < 10) return [8, 8, 10]; // the slots
    return brighten(DARK_STEEL, 1.1);
  });
}

// One oily footprint of a walking mech: the walkers are reverse-jointed, so
// three big toes splayed forward and a spur behind. Points "up" (towards -y)
// before any rotation.
function makeFootprint() {
  const toes = [[20, 12], [32, 8], [44, 12]];
  return makeTexture([30, 26, 22], (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    const onToe = toes.some(([tx, ty]) => segmentDistance(px, py, 32, 36, tx, ty) < 4.5);
    const onPad = Math.hypot(px - 32, py - 38) < 8.5;
    const onSpur = segmentDistance(px, py, 32, 40, 32, 57) < 3;
    if (!onToe && !onPad && !onSpur) return null;
    if (noise(x >> 1, y >> 1, 87) < 0.1) return null; // a few scuffed gaps
    return seeThrough([14, 12, 10], 225);
  });
}

// Soot rising up a wall from an old blast at its foot: widest and darkest
// low down, narrowing and thinning towards the top.
function makeWallScorch(v) {
  return makeTexture([20, 16, 12], (x, y) => {
    const up = (64 - y) / 64;                            // 0 at the floor, 1 at the ceiling
    const width = 16 + 14 * up + 6 * Math.sin(y * 0.2 + v * 2); // the plume spreads and wavers as it rises
    const off = Math.abs(x + 0.5 - (32 + v * 4 - 2)) / width;
    if (off >= 1) return null;
    const alpha = 250 * Math.sqrt(1 - off) * (1 - 0.6 * up) * (0.8 + 0.2 * noise(x >> 1, y >> 1, 88 + v));
    return seeThrough(mix([6, 5, 4], [50, 34, 22], off * off), alpha);
  });
}

// Rust running down from a line of rivets: a few orange-brown streaks, each
// starting at its own height and fading as it runs.
function makeRustRun(v) {
  const streaks = [];
  for (let n = 0; n < 7; n++) {
    streaks.push({ x: 4 + Math.floor(noise(n, v, 89) * 56), start: 6 + Math.floor(noise(n, v, 90) * 20), len: 15 + noise(n, v, 91) * 35 });
  }
  return makeTexture(RUST, (x, y) => {
    for (const s of streaks) {
      const along = (y - s.start) / s.len;
      if (along < 0 || along > 1) continue;
      const w = along < 0.1 ? 2 : 1; // a blob where it starts, then a thin run
      if (Math.abs(x - s.x) <= w - (y % 7 === 0 ? 1 : 0)) {
        return seeThrough(brighten(RUST, 0.9 + 0.3 * noise(x, y, 92)), 200 * (1 - along));
      }
    }
    return null;
  });
}

// Damp rising up a wall: a dark patch with a pale tide mark at its edge.
function makeDamp(v) {
  return makeTexture([40, 44, 38], (x, y) => {
    const t = blobT(x, y, 30 + v * 6, 64, 30 + v * 4, v * 2.2 + 0.9);
    if (t >= 1) return null;
    if (t > 0.9) return seeThrough([150, 140, 110], 90); // tide mark
    return seeThrough([22, 26, 20], 120 * (0.5 + 0.5 * t));
  });
}

// A water stain on the ceiling: rings of tide marks where a leak has spread.
function makeCeilingStain(v) {
  return makeTexture([70, 55, 35], (x, y) => {
    const t = blobT(x, y, 32, 32, 15 + v * 5, v * 3.7 + 0.2);
    if (t >= 1) return null;
    const ring = (t * 4) % 1 > 0.82;
    return seeThrough(ring ? [95, 75, 45] : [55, 45, 30], ring ? 170 : 90);
  });
}

// STENCILS. Signs sprayed through a stencil: the 3x5 FONT from hud.js, each
// font pixel `scale` texels square, centred on the tile, with flecks of paint
// worn away. `lines` is [[text, scale, y], ...]. An optional border paints a
// thin line round the tile, as for a parking bay on the floor.
function makeStencil(lines, paint, border) {
  for (const [text] of lines) {
    for (const ch of text) {
      if (!FONT[ch]) throw new Error(`Stencil "${text}" uses "${ch}", which is not in FONT (hud.js).`);
    }
  }
  return makeTexture(paint, (x, y) => {
    if (noise(x >> 1, y >> 1, 93) < 0.1) return null; // chips worn off, two texels at a time
    const coat = seeThrough(brighten(paint, 0.85 + 0.25 * noise(x >> 2, y >> 2, 94)), 200);
    if (border && (x === 3 || x === 60 || y === 3 || y === 60)) return coat;
    for (const [text, scale, top] of lines) {
      const left = Math.floor((TEX_SIZE - textWidth(text, scale)) / 2);
      const gy = Math.floor((y - top) / scale);
      const col = Math.floor((x - left) / scale);
      if (gy < 0 || gy >= 5 || col < 0 || x - left >= textWidth(text, scale)) continue;
      const n = Math.floor(col / 4), gx = col % 4;
      if (gx < 3 && FONT[text[n]][gy][gx] === '#') return coat;
    }
    return null;
  });
}

// A unit insignia: a stencilled hexagon with a lightning bolt through it.
function makeInsignia() {
  const paint = [200, 190, 160];
  const bolt = [[38, 10], [26, 32], [36, 32], [24, 54]];
  return makeTexture(paint, (x, y) => {
    if (noise(x >> 1, y >> 1, 95) < 0.1) return null;
    const dx = Math.abs(x + 0.5 - 32), dy = Math.abs(y + 0.5 - 32);
    const hex = Math.max(dx * 0.866 + dy * 0.5, dy); // distance-like measure for a hexagon with flat top and bottom
    const onRing = hex > 22 && hex < 26;
    let onBolt = false;
    for (let i = 0; i < bolt.length - 1; i++) {
      if (segmentDistance(x + 0.5, y + 0.5, bolt[i][0], bolt[i][1], bolt[i + 1][0], bolt[i + 1][1]) < 2.5) onBolt = true;
    }
    return onRing || onBolt ? seeThrough(paint, 200) : null;
  });
}

// THE FLOOR PLANS on the wall (plans.js), one look per setting. Each is a
// little framed picture of a plan in the middle of the wall face: you can
// tell what it is from across a room, and walk up to read it.
//   screen      the industrial sector's: a wall monitor, green lines on black
//   whiteboard  the lab's: a whiteboard with the layout sketched in blue marker
//   evacuation  the HQ's: a FIRE EVACUATION PLAN, a red band over a printed plan
function makePlanSign(kind) {
  const look = {
    screen:     { frame: [58, 62, 68], face: [8, 20, 12], ink: [70, 210, 110], band: null, glow: true },
    whiteboard: { frame: [170, 174, 180], face: [228, 230, 226], ink: [40, 70, 170], band: null, glow: false },
    evacuation: { frame: [40, 40, 44], face: [236, 232, 218], ink: [30, 30, 34], band: [200, 40, 30], glow: false },
  }[kind];
  // A made-up plan: a few rooms' worth of lines, the same on every sign.
  const lines = (x, y) => (x === 22 || x === 41 || y === 30 || y === 44 || (x === 31 && y < 37) || (y === 37 && x > 31)) &&
    !(x === 31 && y > 32 && y < 35) && !(y === 37 && x > 35 && x < 38);
  return makeTexture(look.face, (x, y) => {
    if (x < 16 || x > 47 || y < 20 || y > 49) return null;
    if (x < 18 || x > 45 || y < 22 || y > 47) return brighten(look.frame, 0.9 + 0.2 * noise(x, y, 120)); // the frame
    if (look.band && y < 27) return y === 24 && x > 20 && x < 43 && x % 2 === 0 ? [245, 240, 230] : look.band; // red band, a line of 'text'
    if (kind === 'whiteboard' && y > 45 && x > 36) return [200, 50, 40];         // a red marker on its ledge
    if (x >= 22 && x <= 41 && y >= 30 && y <= 44 && lines(x, y)) {
      if (kind === 'whiteboard' && noise(x, y, 121) < 0.15) return look.face;     // marker skips
      return look.glow ? glowing(look.ink) : look.ink;
    }
    if (kind === 'evacuation' && Math.hypot(x - 27, y - 40) < 1.6) return [200, 40, 30]; // YOU ARE HERE
    if (kind === 'screen' && y === 25 && x > 20 && x < 34) return glowing(look.ink);     // its title line
    return look.glow ? glowing(brighten(look.face, 1 + 0.3 * (y % 2))) : brighten(look.face, 0.95 + 0.08 * noise(x, y, 122));
  });
}

// A BREAKER box on the wall (power.js): a grey steel box with a big lever,
// DOWN with a red lamp while the power's off, UP with a green one once it's
// thrown. A yellow-and-black band says what it is from across a dark room.
function makeBreaker(on) {
  const box = [118, 122, 128];
  return makeTexture(box, (x, y) => {
    if (x < 20 || x > 43 || y < 14 || y > 50) return null;
    if (x < 21 || x > 42 || y < 15 || y > 49) return DARK_STEEL;               // its edge
    if (y >= 17 && y < 21) return hazard(x, y, false);                         // the warning band
    const lamp = Math.hypot(x + 0.5 - 37, y + 0.5 - 26);
    if (lamp < 2.2) return glowing(on ? [60, 255, 90] : [255, 40, 30]);
    if (x >= 26 && x <= 29) {                                                  // the lever: in its slot...
      const top = on ? 25 : 36, bottom = on ? 34 : 45;
      if (y >= top && y <= bottom) return brighten([200, 40, 30], y === top ? 1.4 : 1);
      if (y >= 24 && y <= 46) return [26, 26, 30];
    }
    return brighten(box, 0.9 + 0.12 * noise(x, y, 123));
  });
}

const STENCIL_WHITE = [205, 200, 185];
const STENCIL_YELLOW = [215, 175, 40];
const STENCIL_RED = [190, 50, 35];
const STENCIL_GREEN = [90, 170, 50];
const STENCIL_BRASS = [206, 170, 86]; // the HQ's brass lettering

// Every kind of decal: its variant pictures, and which surfaces it may go on.
// Hand-placed decals in a level file name one of these as `type`.
const DECAL_TYPES = {
  puddle:     { surfaces: ['floor'],            frames: [0, 1, 2].map(makePuddle) },
  oil:        { surfaces: ['floor'],            frames: [0, 1].map(makeOil) },
  scorch:     { surfaces: ['floor', 'ceiling'], frames: [0, 1].map(makeScorch) },
  drain:      { surfaces: ['floor'],            frames: [makeDrain()] },
  vent:       { surfaces: ['floor'],            frames: [makeVent()] },
  hive:       { surfaces: ['wall'],             frames: [makeHive(true)], text: true },
  hiveEmpty:  { surfaces: ['wall'],             frames: [makeHive(false)], text: true },
  footprint:  { surfaces: ['floor'],            frames: [makeFootprint()] },
  stain:      { surfaces: ['ceiling'],          frames: [0, 1].map(makeCeilingStain) },
  wallScorch: { surfaces: ['wall'],             frames: [0, 1].map(makeWallScorch) },
  rust:       { surfaces: ['wall'],             frames: [0, 1].map(makeRustRun) },
  damp:       { surfaces: ['wall'],             frames: [0, 1].map(makeDamp) },
  insignia:   { surfaces: ['wall'],             frames: [makeInsignia()], text: true },
  breakerOff:     { surfaces: ['wall'], text: true, frames: [makeBreaker(false)] },         // power.js
  breakerOn:      { surfaces: ['wall'], text: true, frames: [makeBreaker(true)] },
  planScreen:     { surfaces: ['wall'], text: true, frames: [makePlanSign('screen')] },     // plans.js
  planWhiteboard: { surfaces: ['wall'], text: true, frames: [makePlanSign('whiteboard')] },
  planEvacuation: { surfaces: ['wall'], text: true, frames: [makePlanSign('evacuation')] },
  // Signs (text: true means never mirrored, or they'd read backwards).
  bay1:       { surfaces: ['floor'], text: true, frames: [makeStencil([['BAY', 3, 9], ['1', 5, 30]], STENCIL_YELLOW, true)] },
  bay2:       { surfaces: ['floor'], text: true, frames: [makeStencil([['BAY', 3, 9], ['2', 5, 30]], STENCIL_YELLOW, true)] },
  bay3:       { surfaces: ['floor'], text: true, frames: [makeStencil([['BAY', 3, 9], ['3', 5, 30]], STENCIL_YELLOW, true)] },
  mechBay:    { surfaces: ['wall'], text: true, frames: [makeStencil([['MECH BAY', 2, 10], ['01', 5, 26]], STENCIL_WHITE)] },
  maxLoad:    { surfaces: ['wall'], text: true, frames: [makeStencil([['MAX LOAD', 2, 20], ['80 TONS', 2, 34]], STENCIL_YELLOW)] },
  noFlame:    { surfaces: ['wall'], text: true, frames: [makeStencil([['NO', 3, 8], ['NAKED', 2, 28], ['FLAME', 2, 42]], STENCIL_RED)] },
  coolant:    { surfaces: ['wall'], text: true, frames: [makeStencil([['COOLANT', 2, 22]], STENCIL_WHITE)] },
  spares:     { surfaces: ['wall'], text: true, frames: [makeStencil([['ACTUATOR', 2, 20], ['SPARES', 2, 34]], STENCIL_WHITE)] },
  battleComp: { surfaces: ['wall'], text: true, frames: [makeStencil([['BATTLE', 2, 20], ['COMPUTER', 2, 34]], STENCIL_WHITE)] },
  toHangar:   { surfaces: ['wall'], text: true, frames: [makeStencil([['TO', 2, 20], ['HANGAR', 2, 34]], STENCIL_YELLOW)] },
  rearm:      { surfaces: ['wall'], text: true, frames: [makeStencil([['REARM', 2, 20], ['REPAIR', 2, 34]], STENCIL_WHITE)] },
  // The lab's.
  slime:      { surfaces: ['floor'],            frames: [0, 1, 2].map(makeSlime) },
  leaves:     { surfaces: ['floor'],            frames: [0, 1, 2].map(makeLeaves) },
  sprinkler:  { surfaces: ['ceiling'],          frames: [makeSprinklerHead()] },
  acid:       { surfaces: ['floor'],            frames: [0, 1].map(makeAcidPool) },
  pod:        { surfaces: ['wall'],             frames: [makePod(true)], text: true },
  podEmpty:   { surfaces: ['wall'],             frames: [makePod(false)], text: true },
  biohazard:  { surfaces: ['wall'], text: true, frames: [makeBiohazardSign()] },
  genetics:   { surfaces: ['wall'], text: true, frames: [makeStencil([['GENETICS', 2, 20], ['LAB 2', 2, 34]], STENCIL_GREEN)] },
  specimens:  { surfaces: ['wall'], text: true, frames: [makeStencil([['SPECIMEN', 2, 20], ['HALL', 2, 34]], STENCIL_GREEN)] },
  keepOut:    { surfaces: ['wall'], text: true, frames: [makeStencil([['DANGER', 2, 20], ['KEEP OUT', 2, 34]], STENCIL_RED)] },
  // The HQ's signs, in brass, and the company's cheerful slogans.
  company:    { surfaces: ['wall'], text: true, frames: [makeStencil([['VERIDIAN', 2, 20], ['GROUP', 2, 34]], STENCIL_BRASS)] },
  frontDesk:  { surfaces: ['wall'], text: true, frames: [makeStencil([['FRONT', 2, 20], ['DESK', 2, 34]], STENCIL_BRASS)] },
  execSuite:  { surfaces: ['wall'], text: true, frames: [makeStencil([['EXEC', 2, 20], ['SUITE', 2, 34]], STENCIL_BRASS)] },
  boardRoom:  { surfaces: ['wall'], text: true, frames: [makeStencil([['BOARD', 2, 20], ['ROOM', 2, 34]], STENCIL_BRASS)] },
  atrium:     { surfaces: ['wall'], text: true, frames: [makeStencil([['ATRIUM', 2, 26]], STENCIL_BRASS)] },
  growWithUs: { surfaces: ['wall'], text: true, frames: [makeStencil([['GROW', 2, 20], ['WITH US', 2, 34]], STENCIL_GREEN, true)] },
};

// WHERE THEY ARE -------------------------------------------------------------

const DECAL_W = MAP[0].length;

// One slot per cell for each surface: a placed decal, or null. Walls have one
// array per FACE, named by the way the face looks: the 'N' face of a wall
// cell is its top side, the one you see from the cell to its north.
const floorDecals = new Array(DECAL_W * MAP.length).fill(null);
const ceilingDecals = new Array(DECAL_W * MAP.length).fill(null);
const wallDecals = { N: [], S: [], E: [], W: [] };
for (const face in wallDecals) wallDecals[face] = new Array(DECAL_W * MAP.length).fill(null);

// Which way each face looks, as a step to the cell it faces.
const FACE_STEPS = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

// Plain walls carry decals; computer banks, terminals, doors, panels and
// the lab's cabinets (they have their own placard) don't.
function takesWallDecals(cell) {
  return cell === 1 || cell === 2 || cell === 4 || cell === LAB_TILE_CELL || cell === OFFICE_WALL_CELL;
}

// Put decal `type` on a surface. `pick` (0..1) chooses the variant, and the
// rot and mirror unless they're given, so a scatter driven by noise() comes
// out the same every load.
function placeDecal(surface, x, y, face, type, pick, rot, mirror) {
  const kind = DECAL_TYPES[type];
  const variant = kind.frames[Math.floor(pick * kind.frames.length) % kind.frames.length];
  const decal = {
    tex: variant,
    rot: surface === 'wall' ? 0 : (rot !== undefined ? rot : Math.floor(pick * 37) % 4),
    mirror: mirror !== undefined ? mirror : !kind.text && Math.floor(pick * 53) % 2 === 1,
  };
  const i = y * DECAL_W + x;
  if (surface === 'floor') floorDecals[i] = decal;
  else if (surface === 'ceiling') ceilingDecals[i] = decal;
  else wallDecals[face][i] = decal;
  return decal; // (power.js swaps a breaker's picture when it's thrown)
}

// 1. THE RULES. noise(x, y, seed) is a repeatable "random" number for each
// cell, so the scatter is the same every load. Each rule uses its own seed,
// so a cell that's leaky isn't automatically also oily.
function scatterDecals() {
  const isFloor = (x, y) => MAP[y]?.[x] === 0;
  const nearDrum = (x, y) => props.some((p) => p.type === 'drum' && Math.hypot(p.x - (x + 0.5), p.y - (y + 0.5)) < 1.6);
  const hasCeilingLight = (x, y) => CEILING_LIGHTS.some((c) => c.x === x && c.y === y);
  // What gets spilt on the floor: oil in the industrial sector, slime in the lab (map.js: THEMES).
  const spill = THEME.spill;

  MAP.forEach((row, y) => row.forEach((cell, x) => {
    if (cell === 0) {
      const nextToPipes = Object.values(FACE_STEPS).some(([dx, dy]) => MAP[y + dy]?.[x + dx] === 4);
      if (noise(x, y, 100) < 0.05 && !hasCeilingLight(x, y)) {
        // A leak: a stain on the ceiling, and the puddle it drips into.
        placeDecal('ceiling', x, y, null, 'stain', noise(x, y, 101));
        placeDecal('floor', x, y, null, 'puddle', noise(x, y, 102));
      } else if (nearDrum(x, y) && noise(x, y, 103) < 0.3) {
        // Fuel and sparks: someone's had a fire here before.
        placeDecal('floor', x, y, null, 'scorch', noise(x, y, 104));
        if (noise(x, y, 105) < 0.4) placeDecal('ceiling', x, y, null, 'scorch', noise(x, y, 106));
      } else if (nextToPipes && noise(x, y, 107) < 0.25) {
        placeDecal('floor', x, y, null, spill, noise(x, y, 108)); // pipes leak
      } else if (noise(x, y, 109) < 0.03) {
        placeDecal('floor', x, y, null, 'drain', 0);
      } else if (noise(x, y, 110) < 0.04) {
        placeDecal('floor', x, y, null, spill, noise(x, y, 111));
      }
      return;
    }
    if (!takesWallDecals(cell)) return;
    for (const face in FACE_STEPS) {
      const [dx, dy] = FACE_STEPS[face];
      if (!isFloor(x + dx, y + dy)) continue; // nobody can see this face
      const r = noise(x * 4 + dx + 1, y * 4 + dy + 1, 112); // one number per face
      if (nearDrum(x + dx, y + dy) && r < 0.35) placeDecal('wall', x, y, face, 'wallScorch', noise(x, y, 113));
      else if (cell === 4 && r < 0.3) placeDecal('wall', x, y, face, 'rust', noise(x, y, 114));
      else if (cell === 1 && r < 0.1) placeDecal('wall', x, y, face, 'rust', noise(x, y, 115));
      else if (cell === 1 && r < 0.17) placeDecal('wall', x, y, face, 'damp', noise(x, y, 116));
      else if (cell === LAB_TILE_CELL && r < 0.12) placeDecal('wall', x, y, face, 'damp', noise(x, y, 118));
      else if (cell === OFFICE_WALL_CELL && r < 0.1) placeDecal('wall', x, y, face, 'damp', noise(x, y, 119));
    }
  }));
}

// 2. HAND-PLACED, from the level file. Checked first, with clear messages.
function placeMapDecals() {
  DECALS.forEach((d, n) => {
    const kind = DECAL_TYPES[d.type];
    if (!kind) throw new Error(`DECALS[${n}] has type "${d.type}", which is not in DECAL_TYPES.`);
    if (!kind.surfaces.includes(d.surface)) {
      throw new Error(`DECALS[${n}] (${d.type}) is on "${d.surface}", but that type only goes on: ${kind.surfaces.join(', ')}.`);
    }
    const cell = MAP[d.y]?.[d.x];
    if (d.surface === 'wall') {
      if (!FACE_STEPS[d.face]) throw new Error(`DECALS[${n}] (${d.type}) needs face N, S, E or W, not "${d.face}".`);
      const [dx, dy] = FACE_STEPS[d.face];
      if (!takesWallDecals(cell) || MAP[d.y + dy]?.[d.x + dx] !== 0) {
        throw new Error(`DECALS[${n}] (${d.type}) at cell (${d.x}, ${d.y}) face ${d.face}: that must be a plain wall with floor on its ${d.face} side.`);
      }
    } else if (cell !== 0) {
      throw new Error(`DECALS[${n}] (${d.type}) at cell (${d.x}, ${d.y}) must be on a floor cell.`);
    }
    placeDecal(d.surface, d.x, d.y, d.face, d.type, noise(d.x, d.y, 117), d.rot, d.mirror);
  });
}

scatterDecals();
placeMapDecals();
for (const v of VENTS) placeDecal('floor', v.x, v.y, null, 'vent', 0, 0); // every steam vent's grille (steam.js)
for (const h of HIVES) placeDecal('wall', h.x, h.y, h.face, 'hive', 0);   // every drone hive (drones.js)

// 3. EXPLOSIONS (explosions.js calls this). The floor and ceiling of the cell
// the blast is in get scorched, and so does any plain wall face close enough.
// Math.random is fine here: unlike the scatter, this is a one-off event.
function stampBlastScorch(x, y) {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (MAP[cy]?.[cx] !== 0) {
    console.warn(`stampBlastScorch: blast at (${x.toFixed(2)}, ${y.toFixed(2)}) is not in a floor cell; no scorch stamped.`);
    return;
  }
  placeDecal('floor', cx, cy, null, 'scorch', Math.random());
  placeDecal('ceiling', cx, cy, null, 'scorch', Math.random());
  // The wall to the east of this cell shows its W face, and so on round.
  // "Close enough" = the blast is within 0.8 of that wall.
  const walls = [
    { dx: 1, dy: 0, face: 'W', gap: cx + 1 - x },
    { dx: -1, dy: 0, face: 'E', gap: x - cx },
    { dx: 0, dy: 1, face: 'N', gap: cy + 1 - y },
    { dx: 0, dy: -1, face: 'S', gap: y - cy },
  ];
  for (const w of walls) {
    if (w.gap < 0.8 && takesWallDecals(MAP[cy + w.dy]?.[cx + w.dx])) {
      placeDecal('wall', cx + w.dx, cy + w.dy, w.face, 'wallScorch', Math.random());
    }
  }
}

// DRAWING --------------------------------------------------------------------

// The decal on a surface, or null. A wall hit knows its cell and face (castRay).
function floorDecalAt(cellX, cellY) {
  return floorDecals[cellY * DECAL_W + cellX];
}

function ceilingDecalAt(cellX, cellY) {
  return ceilingDecals[cellY * DECAL_W + cellX];
}

function wallDecalAt(hit) {
  if (hit.door || hit.panel || !takesWallDecals(hit.cell)) return null;
  return wallDecals[hit.face][hit.cellY * DECAL_W + hit.cellX];
}

// Blend a decal's texel over screen pixel (x, y). (texX, texY) is the texel of
// the SURFACE under that pixel; the decal's own rotation and mirroring are
// applied to find which of its texels lands there. A quarter turn clockwise
// sends texel (x, y) to (63 - y, x), so turning the lookup the other way
// round, (x, y) reads from (y, 63 - x).
function decalTexelIndex(decal, texX, texY) {
  let dx = decal.mirror ? TEX_SIZE - 1 - texX : texX;
  let dy = texY;
  for (let r = 0; r < decal.rot; r++) {
    const t = dx;
    dx = dy;
    dy = TEX_SIZE - 1 - t;
  }
  return dy * TEX_SIZE + dx;
}

function blendDecal(pixels, x, y, decal, texX, texY, light, fog) {
  const i = decalTexelIndex(decal, texX, texY);
  blendTexel(pixels, x, y, decal.tex, i % TEX_SIZE, Math.floor(i / TEX_SIZE), light, fog);
}

// Is this texel of a decal open water, which reflects? Only puddles have a
// `water` mask (makePuddle); 1 marks the water itself, not its rim.
function isWater(decal, texX, texY) {
  return decal.tex.water !== undefined && decal.tex.water[decalTexelIndex(decal, texX, texY)] === 1;
}
