// AMBUSHES: something creeping up on you (owner, 2026-11-06). Hand-placed in
// a level file, each with a TELL first: you half-notice something, and then
// it happens. Some are DECOYS (`decoy: true`): the tell, and then nothing,
// so every one is a question.
//
// THE LAB: CEILING VENTS (`drops`: floor cells, the vent in the ceiling above).
//   Within DROP_TELL cells it RATTLES, and slime DRIPS from it to the floor.
//   Step under it and it BANGS open: a pale shape falls (DROP_FALL seconds:
//   you see it coming). Back off in time and it splats on the floor and dies.
//   Don't, and it's on your VISOR: the MEMBRANE, a lab-grown jelly that
//   clings by suction. It spreads across most of the glass (you see shapes
//   through it, barely), squelches inside the helmet, sucks LATCH_DRAIN
//   armour a second at the seals (down to a breach, never past: it can't
//   kill you by itself), and your breathing goes to panic. It lets
//   go after LATCH_TIME, or SHAKE IT OFF: spin hard (LATCH_SHAKE radians of
//   turning, faster than it bleeds away). Either way it bursts and leaves the
//   glass smeared (atmosphere.js). Meanwhile, whatever else is about comes.
//
// THE HQ: ROOTS (`roots`: floor cells). Within ROOT_TELL cells the carpet
//   BULGES and splits, moss pushing through, with a creak. Step close and a
//   ROOT lashes up out of the floor and wraps your legs: you're held (slowed,
//   infected.js GRAB_SLOW) and squeezed, ROOT_DAMAGE every ROOT_TICK, until
//   you shoot it (ROOT_HEALTH hits; an incendiary round burns it away in
//   one) or it gives up after ROOT_HOLD seconds and sinks back. Miss its
//   reach and it stays standing, swaying, waiting for you to come close.
//   It's vegetable: the scanner can't see it.

// THE CEILING VENTS ------------------------------------------------------------
const DROP_TELL = 4;          // cells: it starts to rattle and drip
const DROP_RANGE = 0.8;       // cells from under it: it drops
const DROP_FALL = 0.5;        // seconds of falling (your chance to back off)
const DROP_HIT = 0.7;         // cells: still this close when it arrives, and it's on you
const DRIP_GAP = 0.6;         // seconds between drips
const DRIP_FALL = 0.5;        // seconds a drip takes to reach the floor
const LATCH_TIME = 6;         // seconds it clings, unless shaken off
const LATCH_DRAIN = 2;        // armour a second it sucks
const LATCH_SHAKE = 4 * Math.PI; // radians of turning to fling it off (two full turns)...
const LATCH_SHAKE_BLEED = 3;  // ...the count bleeding away at this many radians a second, so it has to be quick
const SQUELCH_GAP = 0.35;     // seconds between squelches

// THE ROOTS --------------------------------------------------------------------
const ROOT_TELL = 4;          // cells: the carpet bulges
const ROOT_RANGE = 1.2;       // cells: it lashes up
const ROOT_RISE = 0.3;        // seconds to rise
const ROOT_REACH = 1.3;       // cells: within this as it rises (or later), it has you
const ROOT_TICK = 0.8;        // seconds between squeezes
const ROOT_DAMAGE = 3;        // armour a squeeze
const ROOT_HOLD = 5;          // seconds it holds before it gives up and sinks
const ROOT_HEALTH = 2;        // hits
const ROOT_AIM_ROW = 52;      // the texture row a shot tests: the gun aims down at it (combat.js), as at larvae

// THE PICTURES -----------------------------------------------------------------
// A ceiling vent: a square grille, slatted. Open, the slats are gone: a black hole.
function makeCeilingVent(open) {
  return makeTexture(DARK_STEEL, (x, y) => {
    if (x < 14 || x > 49 || y < 14 || y > 49) return null;
    if (x < 16 || x > 47 || y < 16 || y > 47) return seeThrough(brighten(STEEL, 0.8), 230); // the frame
    if (open) return seeThrough([6, 6, 6], 245);
    return y % 4 < 2 ? seeThrough([14, 14, 16], 235) : seeThrough(brighten(STEEL, 0.6 + 0.2 * noise(x, y, 140)), 230);
  });
}
// The carpet BULGING, split, with moss pushing through; and TORN, where a root came up.
function makeBulge(torn) {
  return makeTexture([60, 90, 40], (x, y) => {
    const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32) + 4 * noise(x >> 2, y >> 2, 141);
    if (d > 24) return null;
    if (torn && d < 10) return seeThrough([14, 10, 6], 240);                         // the hole
    const crack = Math.abs(Math.sin(Math.atan2(y - 32, x - 32) * 3)) < 0.18 && d < 20; // splits radiating out
    if (crack) return seeThrough(brighten([70, 110, 40], 0.8 + 0.3 * noise(x, y, 142)), 220);
    return seeThrough([20, 26, 14], Math.round(120 * (1 - d / 24)));                  // the swell's shadow
  });
}
DECAL_TYPES.ceilingVent = { surfaces: ['ceiling'], frames: [makeCeilingVent(false)], text: true };
DECAL_TYPES.ceilingVentOpen = { surfaces: ['ceiling'], frames: [makeCeilingVent(true)], text: true };
DECAL_TYPES.bulge = { surfaces: ['floor'], frames: [makeBulge(false)], text: true };
DECAL_TYPES.bulgeTorn = { surfaces: ['floor'], frames: [makeBulge(true)], text: true };

// The membrane falling: a pale, wet, veined blob, a little wider than tall.
const MEMBRANE_COLOUR = [214, 200, 160];
const MEMBRANE_VEIN = [140, 50, 50];
const MEMBRANE_FALLING = makeTexture(MEMBRANE_COLOUR, (x, y) => {
  const dx = x + 0.5 - 32, dy = (y + 0.5 - 32) * 1.4;
  const d = Math.hypot(dx, dy) + 3 * noise(x >> 1, y >> 1, 143);
  if (d > 14) return null;
  if (Math.abs(noise(x >> 1, y >> 1, 144) - 0.5) < 0.05) return MEMBRANE_VEIN;
  return brighten(MEMBRANE_COLOUR, 0.8 + 0.3 * (1 - d / 14));
});
// It splatting on the floor (missed you): a burst of pale jelly, low down.
const MEMBRANE_SPLAT = makeTexture(MEMBRANE_COLOUR, (x, y) => {
  if (y < 52) return null;
  const d = Math.hypot(x + 0.5 - 32, (y + 0.5 - 58) * 2.5) + 5 * noise(x >> 1, y, 145);
  return d < 16 ? brighten(MEMBRANE_COLOUR, 0.7 + 0.3 * noise(x, y, 146)) : null;
});
// A slime drip, a single bead.
const DRIP_TEXTURE = makeTexture([170, 200, 120], (x, y) => (Math.hypot(x + 0.5 - 32, (y + 0.5 - 32) * 0.7) < 1.6 ? glowing([170, 200, 120]) : null));

// A root: a few twisted tendrils up out of the floor, mossy brown, swaying
// (`frame` 0-1); `grabbing`, they curl forward, low, round your legs.
function makeRoot(frame, grabbing) {
  const bark = [92, 70, 42];
  return makeTexture(bark, (x, y) => {
    // A thick central stem out of the torn carpet, so there's something solid to shoot.
    if (y >= ROOT_AIM_ROW - 8) {
      const t = (63 - y) / (63 - (ROOT_AIM_ROW - 8));
      if (Math.abs(x + 0.5 - 32 - (grabbing ? 2 * t : Math.sin(frame * 1.5 + t * 2))) < 4.5 - 2 * t) {
        return brighten(bark, 0.75 + 0.2 * noise(x, y, 153));
      }
    }
    for (let n = 0; n < 4; n++) {
      const base = 24 + n * 5.5;
      const top = grabbing ? 40 + n * 2 : 18 + n * 4;
      if (y < top || y > 63) continue;
      const t = (63 - y) / (63 - top); // 0 at the floor, 1 at the tip
      const sway = (grabbing ? 6 * t * t * (n % 2 ? 1 : -1) : 3 * Math.sin(t * 4 + n + frame * 1.5)) + (n - 1.5) * t * 3;
      const width = 2.4 * (1 - t) + 0.6;
      if (Math.abs(x + 0.5 - (base + sway)) < width) {
        if (noise(x, y, 147 + n) > 0.8) return [70, 110, 40]; // moss
        return brighten(bark, 0.7 + 0.4 * (1 - t) + 0.15 * noise(x, y, 150));
      }
    }
    return null;
  });
}
const ROOT_FRAMES = [makeRoot(0, false), makeRoot(1, false)];
const ROOT_GRAB_FRAMES = [makeRoot(0, true), makeRoot(1, true)];

// THE MEMBRANE ON YOUR VISOR, worked out once: for each screen pixel, how
// much of it the membrane covers (0..1: thick in the middle, ragged at its
// edge, never quite the whole screen), and whether it's on a vein or a sucker.
const membraneCover = new Float32Array(SCREEN_W * SCREEN_H);
const membraneVein = new Uint8Array(SCREEN_W * SCREEN_H);
(function buildMembrane() {
  const cx = SCREEN_W / 2, cy = SCREEN_H / 2 + 6;
  const suckers = [[-40, -20], [35, -30], [-60, 25], [55, 20], [0, 40], [-10, -45], [80, -5]];
  const a0 = 0.2; // the veins' first direction
  for (let y = 0; y < SCREEN_H; y++) {
    for (let x = 0; x < SCREEN_W; x++) {
      const dx = (x - cx) / (SCREEN_W * 0.46), dy = (y - cy) / (SCREEN_H * 0.5);
      const a = Math.atan2(dy, dx);
      const edge = 1 + 0.18 * Math.sin(a * 5 + 1) + 0.1 * Math.sin(a * 11) + 0.15 * (noise(x >> 3, y >> 3, 151) - 0.5);
      const d = Math.hypot(dx, dy) / edge; // under 1: on it
      const p = y * SCREEN_W + x;
      membraneCover[p] = d < 1 ? Math.min(0.85, 0.5 + 0.4 * (1 - d)) : 0;
      // VEINS: a dozen wavering lines spreading out from the middle, each a
      // pixel wide, fading out before the edge; every other one forks.
      if (d < 0.92 && d > 0.05) {
        const radius = d * SCREEN_W * 0.46; // roughly, in pixels from the middle
        for (let k = 0; k < 12; k++) {
          const along = a0 + k * Math.PI / 6 + 0.35 * Math.sin(d * 7 + k * 1.7);
          const fork = along + (k % 2 ? 0.5 * Math.max(0, d - 0.45) : 0);
          if (Math.abs(angleDiff(a, along)) * radius < 0.8 || (k % 2 && d > 0.45 && Math.abs(angleDiff(a, fork)) * radius < 0.7)) membraneVein[p] = 1;
        }
      }
      if (d < 1 && membraneVein[p] === 0 && dx < -0.1 && dy < -0.1 && Math.abs(dx - dy * 0.6 + 0.45) < 0.05) membraneVein[p] = 3; // a wet sheen
      for (const [sx, sy] of suckers) {
        const s = Math.hypot(x - cx - sx, y - cy - sy);
        if (d < 1 && s < 6 && s > 3.5) membraneVein[p] = 2; // a sucker's ring, pressed to the glass
      }
    }
  }
})();

// THE AMBUSHES IN THIS LEVEL ---------------------------------------------------
function checkAmbushSpot(list, n, a) {
  if (MAP[Math.floor(a.y)]?.[Math.floor(a.x)] !== 0) throw new Error(`${list}[${n}] at (${a.x}, ${a.y}) is not on a floor cell.`);
}
const DROPS = CURRENT_LEVEL.drops || [];
const ROOTS = CURRENT_LEVEL.roots || [];
if (DROPS.length && THEME_NAME !== 'lab') throw new Error(`Level "${CURRENT_LEVEL.id}" has ceiling drops: they're the lab's (theme "lab"), not "${THEME_NAME}".`);
if (ROOTS.length && THEME_NAME !== 'hq') throw new Error(`Level "${CURRENT_LEVEL.id}" has roots: they're the HQ's (theme "hq"), not "${THEME_NAME}".`);

// A drop: state 'waiting' -> 'stirring' (rattling, dripping) -> 'falling' -> 'spent';
// a decoy goes 'stirring' -> 'spent' once you're under it (it just stops).
const drops = DROPS.map((d, n) => {
  checkAmbushSpot('drops', n, d);
  const cx = Math.floor(d.x), cy = Math.floor(d.y);
  return { x: cx + 0.5, y: cy + 0.5, decoy: d.decoy === true, state: 'waiting', time: 0, dripTimer: 0,
    vent: placeDecal('ceiling', cx, cy, null, 'ceilingVent', 0) };
});
const drips = [];   // { x, y, time }
const splats = [];  // { x, y, time }: one that missed you, bursting on the floor

// A root: 'waiting' -> 'stirring' (the bulge) -> 'rising' -> 'standing' (swaying,
// reaching) or 'holding' -> 'dead' (shot, or sunk back); a decoy: 'stirring' -> 'spent'.
const roots = ROOTS.map((r, n) => {
  checkAmbushSpot('roots', n, r);
  const cx = Math.floor(r.x), cy = Math.floor(r.y);
  return { x: cx + 0.5, y: cy + 0.5, decoy: r.decoy === true, state: 'waiting', time: 0, health: ROOT_HEALTH, tickTimer: 0, hurtTime: 0,
    bulge: null, cx, cy }; // the carpet's flat until it stirs
});

// You, with the membrane on: null, or { time, shake, squelch, drain }.
let latched = null;

const playerDist = (x, y) => Math.hypot(player.x - x, player.y - y);
const nearAndInView = (x, y, range) => playerDist(x, y) < range && clearLine(x, y, player.x, player.y);

// Is a root holding you? (infected.js, playerHeld.)
function rootHolding() {
  return roots.some((r) => r.state === 'holding');
}

// Is the membrane on your visor? (atmosphere.js: your breathing.)
function membraneOn() {
  return latched !== null;
}

function updateDrops(dt) {
  for (const d of drops) {
    d.time += dt;
    if (d.state === 'waiting' && nearAndInView(d.x, d.y, DROP_TELL)) {
      d.state = 'stirring';
      d.time = 0;
      sfxVentRattle(d.x, d.y); // sound.js
    }
    if (d.state === 'stirring') {
      d.dripTimer -= dt;
      if (d.dripTimer <= 0) { d.dripTimer = DRIP_GAP * (0.7 + 0.6 * Math.random()); drips.push({ x: d.x, y: d.y, time: 0 }); }
      if (playerDist(d.x, d.y) < DROP_RANGE) {
        if (d.decoy) { d.state = 'spent'; continue; } // nothing came. This time.
        d.state = 'falling';
        d.time = 0;
        d.vent.tex = DECAL_TYPES.ceilingVentOpen.frames[0];
        sfxVentBang(d.x, d.y);
      }
    }
    if (d.state === 'falling' && d.time >= DROP_FALL) {
      d.state = 'spent';
      if (playerDist(d.x, d.y) < DROP_HIT && latched === null && game.state === 'playing') {
        latched = { time: 0, shake: 0, squelch: 0, drain: 0, lastAngle: player.angle };
        sfxMembraneSplat(); // on you
      } else {
        splats.push({ x: d.x, y: d.y, time: 0 });
        sfxMembraneMiss(d.x, d.y);
      }
    }
  }
  for (let i = drips.length - 1; i >= 0; i--) {
    drips[i].time += dt;
    if (drips[i].time >= DRIP_FALL) { if (Math.random() < 0.4) sfxDrip(drips[i].x, drips[i].y); drips.splice(i, 1); }
  }
  for (let i = splats.length - 1; i >= 0; i--) if ((splats[i].time += dt) > 1.2) splats.splice(i, 1);
}

function updateLatch(dt) {
  if (!latched) return;
  if (game.state !== 'playing') { latched = null; return; }
  latched.time += dt;
  // SHAKING IT OFF: how far you've turned, bleeding away, so only a quick spin counts.
  const turned = Math.abs(angleDiff(player.angle, latched.lastAngle)); // enemies.js
  latched.lastAngle = player.angle;
  latched.shake = Math.max(0, latched.shake + turned - LATCH_SHAKE_BLEED * dt);
  latched.drain += LATCH_DRAIN * dt;
  // It sucks at the seals: it can wear you all the way down to a BREACH
  // (owner, 2026-11-06), but it can't kill you: that takes something else.
  if (latched.drain >= 1) {
    const n = Math.floor(latched.drain);
    latched.drain -= n;
    if (player.armour > 0) {
      player.armour = Math.max(0, player.armour - n);
      if (player.armour === 0) showSecurityMessage('SUIT BREACH'); // security.js, as combat.js does
    }
  }
  latched.squelch -= dt;
  if (latched.squelch <= 0) { latched.squelch = SQUELCH_GAP * (0.7 + 0.6 * Math.random()); sfxSquelch(); }
  if (latched.time >= LATCH_TIME || latched.shake >= LATCH_SHAKE) {
    latched = null;
    sfxMembraneBurst();
    for (let n = 0; n < 3; n++) grimeVisor('membrane'); // atmosphere.js: it leaves the glass smeared
  }
}

function updateRoots(dt) {
  for (const r of roots) {
    r.time += dt;
    r.hurtTime = Math.max(0, r.hurtTime - dt);
    if (r.state === 'waiting' && nearAndInView(r.x, r.y, ROOT_TELL)) {
      r.state = 'stirring';
      r.time = 0;
      r.bulge = placeDecal('floor', r.cx, r.cy, null, 'bulge', 0, 0); // decals.js
      sfxRootStir(r.x, r.y);
    }
    if (r.state === 'stirring' && playerDist(r.x, r.y) < ROOT_RANGE) {
      if (r.decoy) { r.state = 'spent'; sfxRootStir(r.x, r.y); continue; } // it settles
      r.state = 'rising';
      r.time = 0;
      r.bulge.tex = DECAL_TYPES.bulgeTorn.frames[0];
      sfxRootLash(r.x, r.y);
    }
    if (r.state === 'rising' && r.time >= ROOT_RISE) { r.state = 'standing'; r.time = 0; }
    if (r.state === 'standing' && playerDist(r.x, r.y) < ROOT_REACH && game.state === 'playing') {
      r.state = 'holding';
      r.time = 0;
      r.tickTimer = ROOT_TICK;
    }
    if (r.state === 'holding') {
      r.tickTimer -= dt;
      if (r.tickTimer <= 0) { r.tickTimer = ROOT_TICK; damagePlayer(ROOT_DAMAGE); } // combat.js
      if (r.time >= ROOT_HOLD) { r.state = 'dead'; sfxRootStir(r.x, r.y); } // it gives up and sinks back
    }
  }
}

// A blast (explosions.js) burns any root up in reach.
function blastRoots(x, y, radius) {
  for (const r of roots) if (Math.hypot(r.x - x, r.y - y) < radius) hitRoot(r, 'incendiary');
}

// A round arriving at a root (combat.js).
function hitRoot(r, ammo) {
  if (r.state === 'dead' || r.state === 'spent') return;
  r.health -= ammo === 'incendiary' ? ROOT_HEALTH : 1; // fire: it burns away
  r.hurtTime = 0.1;
  if (r.health > 0) return;
  r.state = 'dead';
  sfxRootDie(r.x, r.y);
}

// Each frame (main.js).
function updateAmbushes(dt) {
  updateDrops(dt);
  updateLatch(dt);
  updateRoots(dt);
}

// What to draw (sprites.js): drips and the falling membrane (effects: shots
// pass through), splats, and the roots (shootable; living, so the scanner
// doesn't see them, scanner.js).
function ambushThings(thing) {
  const list = [];
  for (const d of drips) list.push(thing(d.x, d.y, DRIP_TEXTURE, { effect: true, lift: 0.45 - 0.9 * d.time / DRIP_FALL }));
  for (const d of drops) if (d.state === 'falling') list.push(thing(d.x, d.y, MEMBRANE_FALLING, { effect: true, lift: 0.5 * (1 - d.time / DROP_FALL) }));
  for (const s of splats) list.push(thing(s.x, s.y, MEMBRANE_SPLAT, { effect: true }));
  for (const r of roots) {
    if (r.state !== 'rising' && r.state !== 'standing' && r.state !== 'holding') continue;
    const frame = Math.floor(animTime * 3 + r.x) % 2;
    const tex = r.state === 'holding' ? ROOT_GRAB_FRAMES[frame] : ROOT_FRAMES[frame];
    const lift = r.state === 'rising' ? -0.8 * (1 - r.time / ROOT_RISE) : 0;
    list.push(thing(r.x, r.y, tex, { root: r, lift, shade: r.hurtTime > 0 ? 3 : 1, aimRow: ROOT_AIM_ROW }));
  }
  return list;
}

// The membrane, over the view (hud.js): pale, wet, pulsing, its veins and
// suckers darker, sliding very slightly as it works.
function drawMembrane(pixels) {
  if (!latched) return;
  const pulse = 0.92 + 0.08 * Math.sin(latched.time * 7);
  const slide = Math.floor(latched.time * 2) % 2; // a pixel's shudder
  for (let y = 0; y < SCREEN_H; y++) {
    for (let x = 0; x < SCREEN_W; x++) {
      const p = y * SCREEN_W + ((x + slide) % SCREEN_W);
      const cover = membraneCover[p] * pulse;
      if (cover <= 0) continue;
      const v = membraneVein[p];
      const colour = v === 1 ? MEMBRANE_VEIN : v === 2 ? brighten(MEMBRANE_COLOUR, 0.6) : v === 3 ? [245, 240, 225] : MEMBRANE_COLOUR;
      const i = (y * SCREEN_W + x) * 4;
      for (let c = 0; c < 3; c++) pixels[i + c] += (colour[c] - pixels[i + c]) * cover;
    }
  }
}
