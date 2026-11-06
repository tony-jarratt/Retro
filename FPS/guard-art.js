// THE SECURITY GUARD's pictures (guard.js has the behaviour), made with the
// same helpers as the suits (infected-art.js, textures.js).
//
// A building security officer the plant has taken, but not all the way: it
// still stands like one. Pale blue uniform shirt with navy epaulettes, a
// black tie, a gold badge, a radio on its chest with its red light on; navy
// trousers, boots, a holster; a peaked cap. The infection shows at the
// edges: grey-green skin, one milky eye, tendrils creeping out of the collar
// and the cuffs. And always the TORCH, held up at chest height, lens
// forward: in a dark office its light is the first thing you see.
//
// frames[view][pose] like everything else. Poses: stand, walk1, walk2, and
// from the front only (it faces you in a fight):
//   aim    pistol up in both hands, the torch beside it
//   fire   the same, with the muzzle flash
//   duck   crouched in cover: only its head and cap reach eye height, so a
//          shot can still find it, just (owner: "partly" hittable)
// Two sets: GUARD_FRAMES with the torch lit, GUARD_DARK_FRAMES once you've
// shot it out. And its body, with the torch on the floor beside it, lit or not.

const GUARD_SHIRT = [112, 140, 186];
const GUARD_NAVY = [38, 48, 78];
const GUARD_PEAK = [18, 18, 22];
const GUARD_GOLD = [214, 176, 72];
const GUARD_BOOT = [20, 18, 18];
const GUN_METAL = [64, 66, 72];
const TORCH_BODY = [30, 30, 34];
const TORCH_LENS = [255, 248, 210];
const TORCH_DEAD = [84, 84, 78];
const RADIO_LED = [255, 60, 40];
const MUZZLE_FLASH = [255, 230, 140];

// Where the torch's lens sits in each picture, as [dx from the middle, y]:
// drawn there, and a shot that lands within TORCH_HIT_R of it breaks it
// (guard.js). Shots always land on row 32 (combat.js), so every one of these
// is at eye height. Not in the back view (it's in front of the guard) or
// ducked (below the cover).
const TORCH_SPOTS = {
  stand: { front: [-9, 31], right: [13, 31], left: [-13, 31] },
  aim:   { front: [5, 32] },
};
const TORCH_LENS_R = 2;
const TORCH_HIT_R = 2.6;

// The lens (glowing, or dead), in its black bezel.
function torchLens(dx, y, spot, lit, r = TORCH_LENS_R) {
  const d = Math.hypot(dx - spot[0], y + 0.5 - spot[1]);
  if (d < r) return lit ? glowing(TORCH_LENS) : brighten(TORCH_DEAD, 1 - 0.3 * d / r);
  if (d < r + 0.9) return brighten(TORCH_BODY, 1.5);
  return null;
}

// Tendrils of the plant: a wavy green line, here and there, round a point.
function tendril(x, y, dx, cx, cy, spread) {
  if (Math.abs(dx - cx) > spread || Math.abs(y - cy) > 2.5) return null;
  const wave = cy + 1.5 * Math.sin((dx - cx) * 1.3 + cx);
  return Math.abs(y + 0.5 - wave) < 0.7 && noise(x, 0, 470) < 0.75 ? brighten(MOSS, 0.9 + 0.3 * noise(x, y, 471)) : null;
}

function guardLimb(x, y, dx, a, b, w, colour, shade, seed) {
  return suitLimb(x, y, dx, a, b, w, colour, shade, seed); // infected-art.js: cloth with moss, or skin
}

// An arm in a uniform sleeve: shoulder, elbow, hand, with the plant at the cuff.
function guardArm(x, y, dx, shoulder, elbow, hand, shade) {
  const h = inEllipse(dx, y, hand[0], hand[1], 2.2, 2.2);
  if (h !== null) return pallor(x, y, shade * (1.1 - 0.4 * h));
  const wx = hand[0] + (elbow[0] - hand[0]) * 0.28, wy = hand[1] + (elbow[1] - hand[1]) * 0.28;
  if (segmentDistance(dx, y, hand[0], hand[1], wx, wy) < 2.1) return noise(x, y, 472) < 0.5 ? brighten(MOSS, 0.9) : pallor(x, y, shade * 0.9); // the cuff, grown through
  return guardLimb(x, y, dx, elbow, [wx, wy], 2.5, GUARD_SHIRT, shade, 473) ||
         guardLimb(x, y, dx, shoulder, elbow, 2.8, GUARD_SHIRT, shade, 474);
}

// A leg in navy trousers, ending in a boot.
function guardLeg(x, y, dx, hip, knee, ankle, toes, shade) {
  if (y >= ankle[1] - 1 && y < ankle[1] + 3 && dx > Math.min(ankle[0], ankle[0] + toes) - 2.7 && dx < Math.max(ankle[0], ankle[0] + toes) + 2.7) {
    return brighten(GUARD_BOOT, y === ankle[1] - 1 ? 2 : 1);
  }
  return guardLimb(x, y, dx, knee, ankle, 3, GUARD_NAVY, shade * 0.9, 475) ||
         guardLimb(x, y, dx, hip, knee, 3.3, GUARD_NAVY, shade * 0.9, 476);
}

// The peaked cap, centred on (cx, cy) = the middle of its band.
function guardCap(dx, y, cx, cy, front, side) {
  const yy = y + 0.5;
  if (side) {
    if (yy >= cy && yy < cy + 1.3 && dx > cx + 2 && dx < cx + 7.5) return GUARD_PEAK; // the peak, out in front
  } else if (front && yy >= cy + 0.6 && yy < cy + 1.9 && Math.abs(dx - cx) < 5.6) {
    return GUARD_PEAK;
  }
  if (yy >= cy - 0.6 && yy < cy + 0.6 && Math.abs(dx - cx) < 5) return GUARD_PEAK; // the band
  const crown = inEllipse(dx, y, cx, cy - 1.2, 5.4, 3.2);
  if (crown !== null && yy < cy - 0.6) {
    if (front && Math.abs(dx - cx) < 1.1 && yy > cy - 3.2) return GUARD_GOLD; // the cap badge
    return brighten(GUARD_NAVY, 1.15 - 0.35 * crown);
  }
  return null;
}

// From the front or the back. `drop` brings the whole upper body down for
// the crouch: its head comes to rest at eye height.
function guardFrontBackShape(view, pose, lit) {
  const front = view === 'front';
  const duck = pose === 'duck';
  const drop = duck ? 19 : 0;
  return (x, y) => {
    const dx = x + 0.5 - 32;
    const yy = y - drop;

    // Weapons up, from the front: the pistol pointing at you, the torch beside it.
    if (front && (pose === 'aim' || pose === 'fire')) {
      if (pose === 'fire') {
        // The muzzle flash: a hot white core and four spikes, at the muzzle.
        const fx = dx + 1, fy = y + 0.5 - 28, r = Math.hypot(fx, fy);
        if (r < 1.6) return glowing([255, 255, 230]);
        if (r < 5 && Math.min(Math.abs(fx), Math.abs(fy)) < 1.1 - r * 0.15) return glowing(MUZZLE_FLASH);
        if (r < 2.6) return glowing(MUZZLE_FLASH);
      }
      const lens = torchLens(dx, y, TORCH_SPOTS.aim.front, lit);
      if (lens) return lens;
      if (dx > -3 && dx < 1 && y >= 26 && y < 31) return Math.hypot(dx + 1, y + 0.5 - 28) < 0.9 ? [8, 8, 10] : brighten(GUN_METAL, 1 - 0.2 * (y - 26) / 5);
      const arm = guardArm(x, y, dx, [-10, 21], [-8, 29], [-1, 32], 1) || guardArm(x, y, dx, [10, 21], [9, 30], [5, 35], 1);
      if (arm) return arm;
    }
    // Ducked: the pistol held low, ready, the torch's glow just showing.
    if (front && duck) {
      const lens = torchLens(dx, y, [5, 46], lit, 1.5);
      if (lens) return lens;
      if (dx > -4 && dx < 0 && y >= 44 && y < 48) return brighten(GUN_METAL, 0.9);
      const arm = guardArm(x, y, dx, [-10, 40], [-9, 47], [-2, 48], 0.95) || guardArm(x, y, dx, [10, 40], [9, 47], [5, 48.5], 0.95);
      if (arm) return arm;
    }

    const cap = guardCap(dx, yy, 0, 10, front, false);
    if (cap) return cap;
    const head = inEllipse(dx, yy, 0, 14, 4.3, 4.8);
    if (head !== null) {
      if (front) {
        if (yy >= 13 && yy < 14.5 && dx > 0.8 && dx < 3) return [214, 222, 196];        // the milky eye
        if (yy >= 13 && yy < 14.5 && dx < -0.8 && dx > -3) return [28, 30, 26];         // the one still working
        if (yy >= 16.5 && yy < 17.5 && Math.abs(dx) < 1.5) return [60, 34, 36];         // mouth, set hard
        const vine = tendril(x, yy, dx, -2.8, 16, 1.4);                                 // creeping up its cheek
        if (vine) return vine;
      } else if (yy < 16) {
        return brighten(HAIR, 0.55 + 0.2 * noise(x, y, 477)); // cropped short under the cap
      }
      return pallor(x, y, 1.1 - 0.35 * head);
    }
    if (yy >= 18 && yy < 21 && Math.abs(dx) < 2) return pallor(x, y, 0.8); // the neck
    const collar = tendril(x, yy, dx, 0, 20, 6);
    if (collar) return collar;

    // The torso, to the belt.
    if (yy >= 20 && yy < 41 && !(duck && y >= 58)) {
      const halfW = yy < 23 ? 6 + (yy - 20) * 1.3 : 9.5;
      if (Math.abs(dx) < halfW) {
        if (yy < 22.5 && Math.abs(dx) > 6) return brighten(GUARD_NAVY, 1.1);            // epaulettes
        if (yy >= 38 && yy < 40.5) return Math.abs(dx) < 1.3 ? GUARD_GOLD : GUARD_PEAK;  // the belt and buckle
        if (front) {
          if (yy >= 21 && yy < 34 && Math.abs(dx) < 0.8 + (yy - 21) * 0.04) return GUARD_PEAK; // the tie
          if (dx > 3.5 && dx < 6.5 && yy >= 24 && yy < 27.5 && !(yy >= 26.5 && Math.abs(dx - 5) > 0.8)) return GUARD_GOLD; // the badge, a shield
          if (dx > -7 && dx < -3.5 && yy >= 23 && yy < 28) {                            // the radio on its chest
            return Math.hypot(dx + 4.2, yy + 0.5 - 23.8) < 0.7 ? glowing(RADIO_LED) : brighten(TORCH_BODY, 1.2);
          }
          if (Math.abs(Math.abs(dx) - 5) < 2.2 && Math.abs(yy - 30.5) < 0.5) return brighten(GUARD_SHIRT, 0.7); // pocket flaps
        } else {
          if (yy >= 26 && yy < 29) return brighten([188, 190, 186], 1);                  // a reflective band across the back
          const split = Math.abs(dx + Math.sin(yy * 0.6)) < 1.2 && yy > 29 && yy < 37;    // the plant through a split seam
          if (split) return noise(x >> 1, y >> 1, 478) < 0.4 ? glowing(brighten(SPORE_GLOW, 0.7)) : brighten(MOSS, 0.9);
        }
        return cloth(GUARD_SHIRT, x, y, roundShade(dx / halfW), 479);
      }
    }

    // Arms, when they're not up: the torch held out at chest height, the
    // other hand hanging by the holster.
    if (!duck && pose !== 'aim' && pose !== 'fire') {
      const sway = pose === 'walk1' ? 1.5 : pose === 'walk2' ? -1.5 : 0;
      if (front) {
        const lens = torchLens(dx, y, TORCH_SPOTS.stand.front, lit);
        if (lens) return lens;
      }
      const torchArm = guardArm(x, y, dx, [-10, 21], [-12.5, 28], front ? [-9, 33.5] : [-11, 31], 0.95);
      if (torchArm) return torchArm;
      const other = guardArm(x, y, dx, [10, 21], [11.5, 31], [11.5 + sway, 41 - Math.abs(sway)], 0.95);
      if (other) return other;
    }
    if (!duck && dx > 7 && dx < 10.5 && y >= 38 && y < 45) return brighten(GUARD_PEAK, 1.3);  // the holster (empty, when the pistol's out)

    // Legs. Crouched, all you'd see past the cover is its knees and boots.
    if (duck) {
      for (const side of [-1, 1]) {
        if (inEllipse(dx, y, side * 5.5, 59.5, 3.4, 2.5) !== null) return cloth(GUARD_NAVY, x, y, 0.95, 480);
        if (y >= 61 && Math.abs(dx - side * 7) < 2.8) return GUARD_BOOT;
      }
      return null;
    }
    for (const side of [-1, 1]) {
      const lift = (pose === 'walk1' && side < 0) || (pose === 'walk2' && side > 0) ? 3 : 0;
      const leg = guardLeg(x, y, dx, [side * 4.5, 41], [side * 4.8, 50 - lift], [side * 4.6, 59 - lift], 0, 1);
      if (leg) return leg;
    }
    return null;
  };
}

// Side on, facing right: upright, the torch pointing ahead of it.
function guardSideShape(pose, lit) {
  const swing = pose === 'walk1' ? 3 : pose === 'walk2' ? -3 : 0;
  return (x, y) => {
    const dx = x + 0.5 - 32;
    // The torch, and the arm holding it out.
    const lens = Math.abs(y + 0.5 - 31) < TORCH_LENS_R + 0.5 && dx > 12.3 && dx < 14.2 ? (lit ? glowing(TORCH_LENS) : TORCH_DEAD) : null;
    if (lens) return lens;
    if (dx > 7 && dx <= 12.3 && Math.abs(y + 0.5 - 31) < 1.6) return brighten(TORCH_BODY, y === 30 ? 1.8 : 1);
    const near = guardArm(x, y, dx, [1, 22], [3.5, 29], [7.5, 31], 1);
    if (near) return near;

    const cap = guardCap(dx, y, 1, 10, false, true);
    if (cap) return cap;
    const head = inEllipse(dx, y, 1.5, 14, 4.3, 4.8);
    if (head !== null) {
      if (dx < -0.5 && y < 17) return brighten(HAIR, 0.55 + 0.2 * noise(x, y, 477));
      if (dx >= 3.8 && dx < 5 && y >= 13 && y < 14.5) return [214, 222, 196];
      const vine = tendril(x, y, dx, 2, 17, 1.5);
      if (vine) return vine;
      return pallor(x, y, 1.1 - 0.35 * head);
    }
    if (y >= 18 && y < 21 && dx > -1 && dx < 3) return pallor(x, y, 0.8);
    const collar = tendril(x, y, dx, 1, 20, 4);
    if (collar) return collar;

    const torso = inEllipse(dx, y, 0.5, 30, 6, 11.5);
    if (torso !== null && y < 41) {
      if (y >= 38 && y < 40.5) return GUARD_PEAK;                                   // the belt
      if (dx > 2.5 && dx < 5.5 && y >= 22 && y < 26.5) {                            // the radio
        return Math.hypot(dx - 3.5, y + 0.5 - 22.8) < 0.7 ? glowing(RADIO_LED) : brighten(TORCH_BODY, 1.2);
      }
      if (y < 22.5 && dx < 1) return brighten(GUARD_NAVY, 1.1);                     // the epaulette
      return cloth(GUARD_SHIRT, x, y, 1.1 - 0.4 * torso, 481);
    }
    if (dx > -3.5 && dx < 0 && y >= 37 && y < 45) return brighten(GUARD_PEAK, 1.3); // the holster

    for (const [s, shade] of [[swing, 1], [-swing, 0.65]]) {
      const leg = guardLeg(x, y, dx, [0, 41], [1 + s * 0.6, 50], [s * 1.2, 59], 3, shade);
      if (leg) return leg;
    }
    return guardArm(x, y, dx, [-1, 22], [1 - swing * 0.3, 32], [3 - swing * 0.6, 41], 0.6); // the far arm, hanging
  };
}

function makeGuardFrames(lit) {
  const bake = (shape) => makeTexture(GUARD_SHIRT, shape);
  const poses = (make) => ({ stand: make('stand'), walk1: make('walk1'), walk2: make('walk2') });
  const front = (pose) => bake(guardFrontBackShape('front', pose, lit));
  return {
    front: { ...poses(front), aim: front('aim'), fire: front('fire'), duck: front('duck') },
    back:  poses((pose) => bake(guardFrontBackShape('back', pose, lit))),
    right: poses((pose) => bake(guardSideShape(pose, lit))),
    left:  poses((pose) => bake(mirroredShape(guardSideShape(pose, lit), true))),
  };
}

// Dead, on its back, the cap knocked off; the torch on the floor by its hand,
// still lit (and still lighting the floor, guard.js) unless you shot it out.
function makeGuardCorpse(lit) {
  return makeTexture(GUARD_SHIRT, (x, y) => {
    const dx = x + 0.5 - 32;
    // The torch, lying on the floor, lens to the right.
    if (y >= 59 && y < 62 && dx > 17 && dx < 23) return dx > 21.5 ? (lit ? glowing(TORCH_LENS) : TORCH_DEAD) : brighten(TORCH_BODY, y === 59 ? 1.8 : 1);
    // The cap, fallen beside its head.
    const cap = inEllipse(dx, y, -25, 60, 4, 1.8);
    if (cap !== null) return y >= 61 ? GUARD_PEAK : brighten(GUARD_NAVY, 1.1 - 0.3 * cap);
    const head = inEllipse(dx, y, -17, 57, 4, 3.4);
    if (head !== null) return y < 55.5 ? brighten(HAIR, 0.55) : pallor(x, y, 0.85 - 0.25 * head);
    const body = inEllipse(dx, y, -3, 57.5, 11, 4);
    if (body !== null) {
      if (Math.abs(dx + 3) < 1.2 && y < 58) return GUARD_GOLD;        // the buckle... (shirt, belt)
      if (dx > 6) return cloth(GUARD_NAVY, x, y, 0.95 - 0.25 * body, 482);
      if (noise(x >> 1, y >> 1, 483) < 0.12) return brighten(MOSS, 0.9);
      return cloth(GUARD_SHIRT, x, y, 0.95 - 0.25 * body, 484);
    }
    if (segmentDistance(dx, y, 7, 58, 15, 60) < 2.3) return cloth(GUARD_NAVY, x, y, 0.8, 485); // legs
    if (y >= 58 && y < 62 && dx >= 15 && dx < 17.5) return GUARD_BOOT;
    return null;
  });
}

ROBOT_FRAMES.guard = makeGuardFrames(true);
const GUARD_DARK_FRAMES = makeGuardFrames(false);
CORPSE_TEXTURES.guard = makeGuardCorpse(true);
const GUARD_DARK_CORPSE = makeGuardCorpse(false);
