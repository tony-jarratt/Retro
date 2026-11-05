// THE LIFT RIDE: the cut scene between levels (campaign.js). You stand in
// an industrial freight lift and look out through its scissor gate at the
// shaft going by: the concrete wall and its steel beams sliding DOWN as you
// go up, and every floor you pass a lit landing with its number on it. The
// indicator over the gate counts up; the car hums and shakes, harder the
// faster it goes, and clunks past each floor. It slows, a chime, and the
// doors open on the next level.
//
// It's drawn straight into the pixel buffer, no raycasting: a few layers,
// back to front, like a theatre set. The shaft (everything behind the gate)
// is worked out pixel by pixel from the car's height H; then the landings
// and their signs; then the gate, a lattice in front; then the car itself
// over everything outside the gate's opening.

const LIFT_TIME = 7.5;           // seconds, door to door
const LIFT_START = 0.8;          // seconds standing before it moves...
const LIFT_STOP = 6.4;           // ...and when it arrives
const LIFT_FLOOR_GAP = 150;      // pixels of shaft between floors
const ROOF_FLOOR = 20;           // the roof, above the HQ (the finale)
if (ROOF_FLOOR <= LEVELS[LEVELS.length - 1].floor) throw new Error(`ROOF_FLOOR (${ROOF_FLOOR}) must be above the last level's floor (${LEVELS[LEVELS.length - 1].floor}).`);
const LIFT_GATE = { x0: 84, x1: 236, y0: 34, y1: 172 }; // the opening you look out of
const LIFT_EYE = 112;            // the screen row at eye level: a landing's sill passes 50 rows below it

const SHAFT_CONCRETE = [92, 90, 86];
const SHAFT_STEEL = [64, 68, 76];
const CAR_STEEL = [70, 74, 82];

// The name a floor number goes by, on the signs and the indicator.
function floorName(n) {
  if (n === ROOF_FLOOR) return 'ROOF';
  if (n < 0) return 'SUBLEVEL ' + -n;
  if (n === 0) return 'GROUND';
  return 'FLOOR ' + n;
}

// A ride from floor `from` to floor `to`:
//   time    seconds since it set off
//   height  pixels of shaft risen so far
//   passed  the last floor gone by (for the clunk and the indicator)
//   hum     the motor's sound voice
const ride = { from: 0, to: 0, time: 0, height: 0, passed: 0, hum: null };

function startLiftRide(from, to) {
  ride.from = from;
  ride.to = to;
  ride.time = 0;
  ride.height = 0;
  ride.passed = from;
  sfxLiftClunk(); // sound.js: the gate slams
}

// How far up it is, 0 to 1: still, then speeding up and slowing down
// smoothly (an "ease in-out": half a cosine wave), then still again.
function liftProgress(t) {
  const u = Math.min(1, Math.max(0, (t - LIFT_START) / (LIFT_STOP - LIFT_START)));
  return 0.5 - 0.5 * Math.cos(Math.PI * u);
}

// Advance the ride. Returns true once it's over.
function updateLiftRide(dt) {
  ride.time += dt;
  const total = (ride.to - ride.from) * LIFT_FLOOR_GAP;
  const was = ride.height;
  ride.height = total * liftProgress(ride.time);
  const speed = (ride.height - was) / Math.max(dt, 0.001); // pixels per second
  const floor = ride.from + Math.floor((ride.height + LIFT_FLOOR_GAP / 2) / LIFT_FLOOR_GAP);
  if (floor !== ride.passed) {
    ride.passed = floor;
    sfxLiftClunk();
  }
  if (audioReady()) {
    if (!ride.hum) ride.hum = makeVoice('triangle'); // sound.js
    // At your own position: full volume, dead centre.
    steerVoice(ride.hum, player.x, player.y, 0.05 + Math.min(0.12, speed / 4000), 45 + speed * 0.06);
  }
  if (ride.time >= LIFT_STOP && ride.time - dt < LIFT_STOP) sfxLiftChime();
  if (ride.time < LIFT_TIME) return false;
  if (ride.hum) { stopVoice(ride.hum); ride.hum = null; }
  return true;
}

// The landing's colour of light: cold in the labs, warm in the offices,
// sodium-orange in the industrial sublevels.
function landingLight(floor) {
  if (floor >= 0) return [210, 196, 150];
  if (floor === -3) return [176, 200, 200];
  return [200, 150, 90];
}

function drawLiftRide(pixels) {
  const { x0, x1, y0, y1 } = LIFT_GATE;
  const H = Math.round(ride.height); // whole pixels, so everything lands on the grid
  const floors = ride.to - ride.from;
  // Where floor k's sill is on screen: level with the car's when H has risen k gaps.
  const sillY = (k) => LIFT_EYE + 50 + (H - k * LIFT_FLOOR_GAP);

  // 1. THE SHAFT WALL, behind everything. World height h runs up the shaft;
  //    a screen row y shows h = H - (y - LIFT_EYE), so as H grows, everything slides down.
  for (let y = y0; y < y1; y++) {
    const h = H - (y - LIFT_EYE);
    const nearest = Math.round(h / LIFT_FLOOR_GAP);
    const lit = 0.45 + 0.6 * Math.exp(-Math.pow((h - nearest * LIFT_FLOOR_GAP) / 70, 2)); // brighter near a landing
    for (let x = x0; x < x1; x++) {
      let c;
      const hy = Math.floor(h);
      if (x < x0 + 10 || x >= x1 - 10) c = brighten(SHAFT_STEEL, x % 10 < 2 ? 1.3 : 0.9);  // the guide rails
      else if (((hy % 50) + 50) % 50 < 6) c = brighten(SHAFT_STEEL, ((hy % 50) + 50) % 50 === 0 ? 1.4 : 1); // a steel beam
      else c = brighten(SHAFT_CONCRETE, 0.85 + 0.2 * noise(x >> 1, hy >> 1, 460));
      putPixel(pixels, x, y, brighten(c, lit));
    }
  }

  // 2. THE LANDINGS: a lit doorway out onto each floor, with its sign over it.
  for (let k = 0; k <= floors; k++) {
    const sill = Math.round(sillY(k));
    if (sill - 120 > y1 || sill < y0) continue; // nowhere near the gate
    const floor = ride.from + k;
    const light = landingLight(floor);
    for (let y = Math.max(y0, sill - 104); y < Math.min(y1, sill); y++) {
      const depth = (y - (sill - 104)) / 104; // 0 at the lintel, 1 at the sill
      for (let x = x0 + 22; x < x1 - 22; x++) {
        let c = brighten(light, 0.55 + 0.35 * depth);                          // the corridor beyond, lit
        if (floor > 0 && (x < x0 + 30 || x >= x1 - 30)) c = brighten(LEAF, 0.7 + 0.4 * noise(x >> 2, y >> 2, 461)); // the offices: going green
        putPixel(pixels, x, y, c);
      }
    }
    fillRect(pixels, x0 + 22, sill, x1 - x0 - 44, 4, [40, 40, 44]);             // the sill
    fillRect(pixels, x0 + 22, sill - 108, x1 - x0 - 44, 4, [40, 40, 44]);       // the lintel
    const name = floorName(floor);
    const signY = sill - 124;
    if (signY > y0 - 10 && signY < y1) {
      const left = Math.floor(160 - textWidth(name, 1) / 2); // whole pixels: a half-pixel x would put colours in the wrong bytes
      fillRect(pixels, left - 4, signY - 3, textWidth(name, 1) + 8, 11, [200, 170, 40]); // a yellow stencil plate
      drawText(pixels, name, left, signY, [20, 18, 14], 1);
    }
  }

  // 3. THE GATE: a scissor lattice, in front of the shaft.
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const u = x - x0, v = y - y0;
      const bar = u % 19 < 2 || (u + v) % 38 < 2 || ((u - v) % 38 + 38) % 38 < 2;
      if (bar) putPixel(pixels, x, y, (u % 19 === 0 || (u + v) % 38 === 0) ? [120, 124, 130] : [38, 40, 46]);
    }
  }

  // 4. THE CAR, over everything outside the opening: steel walls in panels,
  //    the floor, the ceiling and its lamp.
  const lamp = ride.time < LIFT_STOP && noise(Math.floor(ride.time * 20), 0, 462) < 0.06 ? 0.6 : 1; // a stutter now and then
  for (let y = 0; y < SCREEN_H; y++) {
    for (let x = 0; x < SCREEN_W; x++) {
      if (x >= x0 && x < x1 && y >= y0 && y < y1) continue;
      let c;
      if (y < 16) c = (x > 110 && x < 210 && y > 4 && y < 11) ? [255, 250, 220] : brighten(CAR_STEEL, 0.6);
      else if (y >= 176) c = brighten([60, 62, 66], (((x >> 3) + (y >> 3)) & 1) ? 0.9 : 1.1); // checker plate
      else {
        c = brighten(CAR_STEEL, 0.85 + 0.1 * noise(x >> 2, y >> 2, 463));
        if (x % 40 === 0) c = brighten(CAR_STEEL, 0.55);                                   // panel seams
        if ((x % 40 === 4 || x % 40 === 36) && y % 24 === 12) c = brighten(CAR_STEEL, 1.5); // rivets
      }
      putPixel(pixels, x, y, brighten(c, lamp * (0.7 + 0.3 * (1 - Math.abs(x - 160) / 160))));
    }
  }
  // The gate's frame, hazard-striped along the sill.
  fillRect(pixels, x0 - 4, y0 - 4, x1 - x0 + 8, 4, [40, 42, 48]);
  fillRect(pixels, x0 - 4, y0, 4, y1 - y0, [40, 42, 48]);
  fillRect(pixels, x1, y0, 4, y1 - y0, [40, 42, 48]);
  for (let x = x0 - 4; x < x1 + 4; x++) for (let y = y1; y < y1 + 4; y++) putPixel(pixels, x, y, hazard(x, y, false)); // textures.js

  // The floor indicator over the gate: an arrow, and where you are.
  const shown = floorName(ride.passed);
  fillRect(pixels, 120, 18, 80, 12, [10, 6, 6]);
  drawText(pixels, shown, Math.floor(160 - textWidth(shown, 1) / 2) + 4, 21, [255, 70, 40], 1);
  if (ride.time > LIFT_START && ride.time < LIFT_STOP) {
    for (let r = 0; r < 4; r++) fillRect(pixels, 126 - r, 21 + r, 1 + r * 2, 1, [255, 70, 40]); // the up arrow
  }
  // The controls, on the wall beside the gate: one button lit.
  fillRect(pixels, 250, 84, 22, 52, [44, 46, 52]);
  for (let b = 0; b < 4; b++) fillRect(pixels, 257, 90 + b * 11, 8, 6, b === 0 ? [255, 200, 80] : [90, 92, 96]);

  // 5. The car shakes, more the faster it goes: the whole picture jolts a pixel.
  const speed = Math.sin(Math.PI * Math.min(1, Math.max(0, (ride.time - LIFT_START) / (LIFT_STOP - LIFT_START))));
  if (speed > 0.2 && noise(Math.floor(ride.time * 30), 1, 464) < speed * 0.5) shiftPicture(pixels, noise(Math.floor(ride.time * 30), 2, 464) < 0.5 ? 1 : -1);

  // 6. Arriving: it fades to black as the doors open on the next floor.
  if (ride.time > LIFT_TIME - 0.6) tintScreen(pixels, [0, 0, 0], (ride.time - (LIFT_TIME - 0.6)) / 0.6);
}

// Move the whole picture `dy` rows up or down (filling the gap with the row next to it).
function shiftPicture(pixels, dy) {
  const row = SCREEN_W * 4;
  if (dy > 0) {
    pixels.copyWithin(row * dy, 0, pixels.length - row * dy);
  } else {
    pixels.copyWithin(0, row * -dy, pixels.length);
  }
}
