// THE HELMET VISOR (toggle with V): a frame round the view, as if you're
// looking out through the visor of a pilot's helmet.
//
// The visor's opening is a ROUNDED RECTANGLE, with bigger rounding at the
// bottom corners where a helmet narrows towards the chin. For each screen
// pixel we work out how far it is from the edge of that shape (a "signed
// distance": negative inside the opening, positive outside), and that one
// number decides everything:
//   outside       the helmet's metal frame: a bright bevel right at the edge,
//                 a dark rubber seal, then shaded metal with rivets
//   just inside   the glass darkens towards its edge ("vignette")
//   further in    clear glass, with a faint diagonal reflection near the top left
// The visor never changes, so the whole overlay is worked out once at load,
// and applying it each frame is just a pass over the pixels.

const VISOR_TOP_RADIUS = 26;    // corner rounding at the top, in screen pixels
const VISOR_BOTTOM_RADIUS = 44; // ...and at the bottom, where the helmet narrows
const VISOR_TOP = 8;            // frame thickness at the top: room for one line of readout
const VISOR_SIDE = 7;           // ...at the sides
const VISOR_BOTTOM = 10;        // ...and at the bottom, just deep enough for one line of readouts
const VIGNETTE_WIDTH = 18;      // how far into the glass the darkening reaches

let visorOn = false; // off by default (owner, 2026-11-05); V turns it on

// Distance from (px, py) to the edge of a rounded rectangle centred on (cx, cy)
// with half-sizes (hw, hh) and corner radius r: negative inside, positive outside.
// Fold the point into one quarter (abs), measure from the corner circle's
// centre, and handle the straight edges with the max/min.
function roundedRectDistance(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// Per pixel: 0 = glass, 1 = frame. For glass, `visorShade` multiplies the
// colour (vignette) and `visorGlare` is added (reflection); for frame pixels,
// `visorColour` is the frame's own colour.
const visorFrame = new Uint8Array(SCREEN_W * SCREEN_H);
const visorShade = new Float32Array(SCREEN_W * SCREEN_H);
const visorGlare = new Float32Array(SCREEN_W * SCREEN_H);
const visorColour = new Uint8ClampedArray(SCREEN_W * SCREEN_H * 3);

function buildVisor() {
  // The opening runs from VISOR_TOP down to VISOR_BOTTOM above the bottom edge.
  const cx = SCREEN_W / 2;
  const cy = (VISOR_TOP + SCREEN_H - VISOR_BOTTOM) / 2;
  const hw = SCREEN_W / 2 - VISOR_SIDE;
  const hh = (SCREEN_H - VISOR_BOTTOM - VISOR_TOP) / 2;
  const metal = [52, 55, 62];
  for (let y = 0; y < SCREEN_H; y++) {
    for (let x = 0; x < SCREEN_W; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const r = py < cy ? VISOR_TOP_RADIUS : VISOR_BOTTOM_RADIUS;
      const d = roundedRectDistance(px, py, cx, cy, hw, hh, r);
      const p = y * SCREEN_W + x;
      if (d > 0) {
        visorFrame[p] = 1;
        let rgb;
        if (d < 1.5) rgb = [150, 156, 168];                    // bright bevel at the glass edge
        else if (d < 3.5) rgb = [16, 16, 18];                  // rubber seal
        else {
          let f = 0.85 + 0.25 * noise(x >> 1, y >> 1, 64);     // brushed, slightly mottled metal
          f *= 1 - Math.min(0.35, (d - 3.5) / 40);             // a little darker away from the edge
          if ((x + 3) % 22 === 0 && d > 5 && d < 7 && (y < 30 || y > 170)) f = 1.6; // rivets in the corners
          rgb = brighten(metal, f);
        }
        visorColour.set(rgb, p * 3);
      } else {
        // Vignette: full brightness in the middle, darkening over the last
        // VIGNETTE_WIDTH pixels before the edge (a squared curve, so it's gentle at first).
        const t = Math.max(0, 1 + d / VIGNETTE_WIDTH); // 0 well inside, 1 at the edge
        visorShade[p] = 1 - 0.5 * t * t;
        // Reflection: a soft diagonal band of light across the top-left of the glass.
        const band = Math.abs((px * 0.55 + py) - 70);
        visorGlare[p] = band < 10 && px < cx ? 10 * (1 - band / 10) * (1 - px / cx) : 0;
      }
    }
  }
}

buildVisor();

function applyVisor(pixels) {
  for (let p = 0; p < SCREEN_W * SCREEN_H; p++) {
    const i = p * 4;
    if (visorFrame[p] === 1) {
      pixels[i] = visorColour[p * 3];
      pixels[i + 1] = visorColour[p * 3 + 1];
      pixels[i + 2] = visorColour[p * 3 + 2];
    } else if (visorShade[p] < 1 || visorGlare[p] > 0) {
      for (let c = 0; c < 3; c++) pixels[i + c] = pixels[i + c] * visorShade[p] + visorGlare[p];
    }
  }
}
