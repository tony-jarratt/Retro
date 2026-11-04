// THE 80s SCREEN FILTER (toggle with C). Two period tricks, applied to the
// finished frame, HUD and all, just before it goes on screen.
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

let crtFilterOn = false; // off by default: press C to see it

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

function applyCrtFilter(pixels) {
  for (let y = 0; y < SCREEN_H; y++) {
    const scan = y % 2 === 1 ? SCANLINE_SHADE : 1;
    for (let x = 0; x < SCREEN_W; x++) {
      const i = (y * SCREEN_W + x) * 4;
      // The nudge for this position: -0.47 to +0.47, times the strength.
      // (x & 3 is x mod 4: which column of the repeating 4x4 tile we're in.)
      const nudge = ((BAYER_4X4[y & 3][x & 3] + 0.5) / 16 - 0.5) * DITHER_STRENGTH;
      const c = nearestPaletteColour(pixels[i] + nudge, pixels[i + 1] + nudge, pixels[i + 2] + nudge);
      pixels[i] = c[0] * scan;
      pixels[i + 1] = c[1] * scan;
      pixels[i + 2] = c[2] * scan;
    }
  }
}
