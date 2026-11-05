// THE 80s SCREEN FILTER. Two period tricks, applied to the finished frame,
// HUD and all, just before it goes on screen. Press C to have it on all the
// time; otherwise it creeps in as your VISOR TAKES DAMAGE (applyDamageFilter,
// at the bottom), along with tearing and a failing tube's colour split.
//
// 1. A FIXED PALETTE WITH ORDERED DITHERING. Machines of the era could only
//    show a few dozen colours, and that limit is a big part of the look.
//    Every pixel is snapped to the nearest colour in PALETTE. Snapping alone
//    gives harsh bands where shades jump from one palette colour to the next,
//    so first each pixel gets a small nudge from a 4x4 "Bayer" matrix, which
//    is different for each position in a repeating 4x4 tile. Neighbouring
//    pixels then round in different directions, and from a distance the mix
//    of two palette colours reads as the shade in between.
//
// 2. SCANLINES. Every other row is a little darker, like the dark gaps
//    between the lines a CRT tube draws.

// 32 colours picked for the hangar: greys and steel blues, rust and sodium
// orange, hazard yellow, olive, phosphor green, warning reds, and two neons.
const PALETTE = [
  [0, 0, 0], [24, 22, 26], [44, 42, 48], [68, 66, 74],
  [96, 94, 104], [132, 130, 140], [176, 174, 184], [232, 230, 238],
  [28, 36, 52], [44, 58, 80], [66, 86, 112], [98, 122, 150],
  [52, 30, 20], [86, 48, 28], [128, 72, 36], [170, 104, 52],
  [206, 128, 40], [240, 170, 60], [250, 214, 100], [255, 244, 190],
  [220, 186, 32], [40, 52, 30], [70, 86, 44], [110, 128, 64],
  [60, 200, 90], [150, 255, 160], [120, 20, 20], [200, 40, 30],
  [255, 96, 64], [20, 60, 64], [220, 60, 180], [70, 210, 230],
];

// The Bayer matrix: the numbers 0-15 laid out so that any small patch has
// both high and low values spread evenly through it. That evenness is what
// makes the dither a fine, regular pattern rather than noise.
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const DITHER_STRENGTH = 28; // how far (0-255 scale) the nudge can move a channel: roughly the gap between palette shades
const SCANLINE_SHADE = 0.8;

let crtFilterOn = false; // off by default: C turns it on (when play-testing)

// The palette colour closest to (r, g, b): a straight search through all 32,
// measuring distance in RGB space (squared, since we only compare).
function nearestPaletteColour(r, g, b) {
  let best = PALETTE[0];
  let bestDist = Infinity;
  for (const c of PALETTE) {
    const d = (r - c[0]) * (r - c[0]) + (g - c[1]) * (g - c[1]) + (b - c[2]) * (b - c[2]);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

// The full filter. `crush` (0..1) blends each pixel from its true colour
// towards its dithered palette colour: 1 is the whole effect, 0.5 halfway,
// 0 skips the palette search altogether. `scanShade` is how bright the
// in-between rows are (SCANLINE_SHADE for the full look, 1 for none).
function applyCrtFilter(pixels, crush = 1, scanShade = SCANLINE_SHADE) {
  for (let y = 0; y < SCREEN_H; y++) {
    const scan = y % 2 === 1 ? scanShade : 1;
    for (let x = 0; x < SCREEN_W; x++) {
      const i = (y * SCREEN_W + x) * 4;
      if (crush > 0) {
        // The nudge for this position: -0.47 to +0.47, times the strength.
        // (x & 3 is x mod 4: which column of the repeating 4x4 tile we're in.)
        const nudge = ((BAYER_4X4[y & 3][x & 3] + 0.5) / 16 - 0.5) * DITHER_STRENGTH;
        const c = nearestPaletteColour(pixels[i] + nudge, pixels[i + 1] + nudge, pixels[i + 2] + nudge);
        for (let k = 0; k < 3; k++) pixels[i + k] += (c[k] - pixels[i + k]) * crush;
      }
      if (scan !== 1) for (let k = 0; k < 3; k++) pixels[i + k] *= scan;
    }
  }
}

// VISOR DAMAGE. The visor is a camera feed on a screen inside your suit, so
// as the suit's ARMOUR falls (passed in as `health`, 0-100), the display fails:
//   below 60   scanlines creep in, darker the more you're hurt
//   below 40   the palette starts to crush, and the picture TEARS: for a
//              frame, a band of rows jumps sideways
//   below 20   the crush at its worst (MAX_CRUSH), a COLOUR SPLIT (the red
//              image slides off the green and blue, like a failing tube), and flicker
// Healing cleans it back up. Each effect is a 0..1 amount worked out from
// your health, so it all fades in smoothly rather than switching on.
const DAMAGE_START = 60, CRUSH_START = 40, SPLIT_START = 20;
// How far each effect goes at its worst. Kept well short of the full CRT
// look, so that even breached you can still see what's going on.
const MAX_CRUSH = 0.45;       // palette crush: 0.45 of the way to the 32 colours
const MAX_SCAN_DARKEN = 0.1;  // in-between rows lose at most 10% of their brightness
const MAX_SPLIT = 1;          // pixels the red image slides off
const FLICKER_CHANCE = 0.03, FLICKER_SHADE = 0.9;
const TEAR_RATE = 5;          // tears per second at 0 health (fewer when less hurt)
const TEAR_TIME = 0.06;       // seconds a tear lasts: about four frames
const tears = [];             // tears showing: { y, h, shift, time }

// 0 at `from` health and above, rising in a straight line to 1 at `to`.
function damageRamp(health, from, to) {
  return Math.min(1, Math.max(0, (from - health) / (from - to)));
}

// Slide row y's pixels `shift` to the right (left if negative), filling the
// gap from the edge. A copy of the row first, so pixels aren't read after
// they've already been moved.
function shiftRow(pixels, y, shift) {
  const start = y * SCREEN_W * 4;
  const row = pixels.slice(start, start + SCREEN_W * 4);
  for (let x = 0; x < SCREEN_W; x++) {
    const from = Math.min(SCREEN_W - 1, Math.max(0, x - shift));
    for (let k = 0; k < 3; k++) pixels[start + x * 4 + k] = row[from * 4 + k];
  }
}

function applyDamageFilter(pixels, health, dt) {
  // Tears come and go even as you heal, so update them first.
  for (let i = tears.length - 1; i >= 0; i--) {
    tears[i].time -= dt;
    if (tears[i].time <= 0) tears.splice(i, 1);
  }
  if (health >= DAMAGE_START) return;

  const tearing = damageRamp(health, CRUSH_START, 0);
  if (Math.random() < TEAR_RATE * tearing * dt) {
    const h = 2 + Math.floor(Math.random() * 10);
    const shift = (8 + Math.floor(Math.random() * 17)) * (Math.random() < 0.5 ? -1 : 1); // 8-24 pixels, either way
    tears.push({ y: Math.floor(Math.random() * (SCREEN_H - h)), h, shift, time: TEAR_TIME });
  }
  for (const t of tears) for (let y = t.y; y < t.y + t.h; y++) shiftRow(pixels, y, t.shift);

  // Colour split: the red channel alone, shifted right by 1-2 pixels. Walking
  // each row right to left means every pixel reads its left neighbour's red
  // before that neighbour has been changed.
  const split = Math.round(MAX_SPLIT * damageRamp(health, SPLIT_START, 0) + 0.49);
  if (health < SPLIT_START && split > 0) {
    for (let y = 0; y < SCREEN_H; y++) {
      const row = y * SCREEN_W * 4;
      for (let x = SCREEN_W - 1; x >= split; x--) pixels[row + x * 4] = pixels[row + (x - split) * 4];
    }
  }

  // Scanlines and crush together, in one pass of the CRT filter.
  const scanShade = 1 - MAX_SCAN_DARKEN * damageRamp(health, DAMAGE_START, SPLIT_START);
  applyCrtFilter(pixels, MAX_CRUSH * damageRamp(health, CRUSH_START, SPLIT_START), scanShade);

  // Flicker: now and then, the whole picture dips.
  if (health < SPLIT_START && Math.random() < FLICKER_CHANCE) {
    for (let i = 0; i < pixels.length; i += 4) for (let k = 0; k < 3; k++) pixels[i + k] *= FLICKER_SHADE;
  }
}
