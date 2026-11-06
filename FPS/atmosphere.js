// ATMOSPHERE: the building closing in (owner, 2026-11-06: "more of the
// claustrophobia, kept original"). Four things, none of them rules you play
// by, all of them the feel of being shut inside a suit, inside a building:
//
//   BREATHING     always there, quiet: your own breath inside the helmet. It
//                 quickens and gets louder when something's wrong (armour
//                 low, something has hold of you, you're in the dark, you've
//                 just been hit) and eases off slowly when it isn't. A hit
//                 makes it catch (sound.js, sfxSuitHit); a breach adds a hiss
//                 of air (sound.js). When you die, it stops.
//   THE BUILDING  sounds from the other side of a wall: a servo, claws on
//                 tile, shuffling steps. Pure atmosphere: they come from a
//                 random spot behind a wall near you, NOT from where anything
//                 is, so they're no hint. But they're the sound of what's still
//                 alive in the level: the more there is, the more often you
//                 hear it, of its kind, and once everything is dead, silence.
//   THE OLD PA    on a level with no Manager, the PA still plays its old
//                 automated announcements on a loop, cheerful and wrong.
//   VISOR GRIME   spores and acid leave smears on the visor that clear
//                 slowly; steam and gas mist it from the edges in.
// (LOCKDOWN, the fourth idea, is in lockdown.js.)

// BREATHING ------------------------------------------------------------------
const BREATH_CALM = 4.6;      // seconds a breath takes, calm
const BREATH_PANIC = 1.5;     // ...and at its most frightened
const BREATH_VOL_CALM = 0.025;
const BREATH_VOL_PANIC = 0.09;
const STRESS_RISE = 1.5;      // how fast you tense up (per second)
const STRESS_FALL = 0.12;     // ...and calm down: slowly
let stress = 0;               // 0 calm .. 1 as bad as it gets
let breathTimer = 1;          // seconds until the next breath

// How bad things are right now, 0..1: the worst of these.
function stressNow() {
  const lowArmour = Math.max(0, Math.min(1, (50 - player.armour) / 40)); // from 50 armour down, full at 10
  const dark = (1 - playerVisibility()) * 0.45;                       // creatures.js
  return Math.max(lowArmour, dark, player.armour === 0 ? 1 : 0, playerHeld() ? 1 : 0, membraneOn() ? 1 : 0, game.hurtFlash > 0 ? 0.7 : 0); // ambush.js: the membrane
}

function updateBreathing(dt) {
  const target = stressNow();
  stress += Math.max(-STRESS_FALL * dt, Math.min(STRESS_RISE * dt, target - stress));
  breathTimer -= dt;
  if (breathTimer > 0) return;
  const period = BREATH_CALM + (BREATH_PANIC - BREATH_CALM) * stress;
  const vol = BREATH_VOL_CALM + (BREATH_VOL_PANIC - BREATH_VOL_CALM) * stress;
  sfxBreath(true, period * 0.32, vol);                    // in...
  sfxBreath(false, period * 0.42, vol * 0.8, period * 0.36); // ...and out
  breathTimer = period * (0.95 + 0.1 * Math.random());     // never quite metronomic
}

// THE BUILDING ---------------------------------------------------------------
const BUILDING_GAP_MIN = 9;    // seconds between sounds, with a level full of things
const BUILDING_GAP_MAX = 18;
const BUILDING_FULL = 8;       // this many alive and it's as busy as it gets; fewer, quieter
const BUILDING_NEAR = 3;       // cells: a sound comes from this far...
const BUILDING_FAR = 8;        // ...to this far away, always behind a wall
let buildingTimer = BUILDING_GAP_MIN;

// What's still alive, by the kind of sound it makes.
function aliveByKind() {
  const count = { machine: 0, creature: 0, infected: 0 };
  for (const e of enemies) {
    if (e.state === 'dead') continue;
    const t = ENEMY_TYPES[e.type];
    if (!t.creature) count.machine += 1;
    else if (THEME_NAME === 'hq') count.infected += 1;
    else count.creature += 1;
  }
  count.machine += drones.filter((d) => d.state !== 'dead').length;   // drones.js
  count.creature += larvae.filter((l) => l.state !== 'dead').length;  // larvae.js
  count.infected += moths.filter((m) => m.state !== 'dead').length;   // pollinators.js
  return count;
}

// A floor point between BUILDING_NEAR and BUILDING_FAR from you with a wall
// between, or null if a few random tries find none (a big open room: it
// just stays quiet this time).
function behindAWall() {
  for (let n = 0; n < 24; n++) {
    const a = Math.random() * Math.PI * 2;
    const d = BUILDING_NEAR + Math.random() * (BUILDING_FAR - BUILDING_NEAR);
    const x = player.x + Math.cos(a) * d, y = player.y + Math.sin(a) * d;
    if (MAP[Math.floor(y)]?.[Math.floor(x)] !== 0) continue;
    if (castRay(player.x, player.y, Math.cos(a), Math.sin(a)).dist < d) return { x, y }; // a wall in between
  }
  return null;
}

function updateBuildingSounds(dt) {
  buildingTimer -= dt;
  if (buildingTimer > 0) return;
  const count = aliveByKind();
  const total = count.machine + count.creature + count.infected;
  const busy = Math.min(1, total / BUILDING_FULL);
  // Fewer alive: longer between sounds (up to twice as long); none: silence, checked again in a while.
  buildingTimer = (BUILDING_GAP_MIN + Math.random() * (BUILDING_GAP_MAX - BUILDING_GAP_MIN)) * (2 - busy);
  if (total === 0) return;
  // Which kind: in proportion to what's alive.
  let pick = Math.random() * total;
  const kind = ['machine', 'creature', 'infected'].find((k) => (pick -= count[k]) < 0);
  const spot = behindAWall();
  if (spot) sfxBuilding(kind, spot.x, spot.y); // sound.js
}

// THE OLD PA -----------------------------------------------------------------
const OLD_PA_FIRST = 25;           // seconds into the level before the first
const OLD_PA_GAP_MIN = 45;
const OLD_PA_GAP_MAX = 75;
const OLD_PA_CUT = 0.2;            // the chance a line cuts out half-way
const OLD_PA_LINES = {
  industrial: [
    'SHIFT B REPORT TO THE HANGAR FLOOR',
    'SAFETY RECORD: 418 DAYS WITHOUT INCIDENT',
    'EAR DEFENDERS MUST BE WORN IN THE TEST BAYS',
    'ALL SYSTEMS NOMINAL',
    'MAINTENANCE CREWS, PLEASE CLOCK OUT',
  ],
  lab: [
    'CONTAINMENT NOMINAL',
    'SPECIMEN FEEDING WILL BEGIN AT 14:00',
    'PLEASE DO NOT TAP ON THE GLASS',
    'ALL VISITORS MUST BE ESCORTED',
    'DECONTAMINATION CYCLE COMPLETE',
  ],
  hq: [
    'VERIDIAN: GROWING TOGETHER',
    'ALL STAFF PLEASE REMAIN AT YOUR DESKS',
    'THE ATRIUM CAFE IS NOW OPEN',
    'THE BOARD MEETS AT 15:00',
    'THANK YOU FOR YOUR PATIENCE',
  ],
};
const HAS_MANAGER = enemies.some((e) => e.type === 'manager'); // its PA is its own (manager.js)
let oldPaTimer = OLD_PA_FIRST;
let oldPaLast = -1;

function updateOldPa(dt) {
  if (HAS_MANAGER) return;
  oldPaTimer -= dt;
  if (oldPaTimer > 0) return;
  oldPaTimer = OLD_PA_GAP_MIN + Math.random() * (OLD_PA_GAP_MAX - OLD_PA_GAP_MIN);
  const lines = OLD_PA_LINES[THEME_NAME];
  let n = Math.floor(Math.random() * lines.length);
  if (n === oldPaLast) n = (n + 1) % lines.length; // never the same twice running
  oldPaLast = n;
  let line = lines[n];
  if (Math.random() < OLD_PA_CUT) line = line.slice(0, Math.ceil(line.length / 2)) + ' - -'; // the tape's going
  announce(line); // manager.js: on the visor, with the chime and the voice (sound.js)
}

// VISOR GRIME ----------------------------------------------------------------
// A smear: where it is on the screen, its size, colour, and how long it has
// left. It's grainy (noise picks which pixels it covers) and fades as it goes.
const GRIME_LIFE = 10;          // seconds a smear takes to clear
const GRIME_MAX = 14;           // smears at once
const MIST_CLEAR = 4;           // seconds for a full mist to clear
const GRIME_LOOKS = {
  spores: { colour: [190, 200, 90], size: [6, 12], count: 2 },
  acid:   { colour: [120, 210, 70], size: [8, 16], count: 3 },
  membrane: { colour: [214, 200, 160], size: [14, 26], count: 3 }, // ambush.js: what it leaves when it bursts
};
const MIST_COLOUR = { steam: [210, 215, 220], gas: [150, 200, 140] };
const smears = [];
let mist = 0;          // 0 clear .. 1 fogged
let mistKind = 'steam';

// Something hit the visor (spores.js, acid.js, steam.js).
function grimeVisor(kind) {
  if (kind === 'steam' || kind === 'gas') { mist = 1; mistKind = kind; return; }
  const look = GRIME_LOOKS[kind];
  if (!look) { console.warn(`grimeVisor: no look for "${kind}"; nothing drawn.`); return; }
  for (let n = 0; n < look.count; n++) {
    if (smears.length >= GRIME_MAX) smears.shift(); // the oldest gives way
    // Mostly towards the edges, where your eye isn't.
    const a = Math.random() * Math.PI * 2, d = 0.35 + 0.6 * Math.random();
    smears.push({
      x: SCREEN_W / 2 + Math.cos(a) * d * SCREEN_W / 2, y: SCREEN_H / 2 + Math.sin(a) * d * SCREEN_H / 2,
      r: look.size[0] + Math.random() * (look.size[1] - look.size[0]), colour: look.colour,
      seed: Math.floor(Math.random() * 1000), life: GRIME_LIFE,
    });
  }
}

function updateGrime(dt) {
  for (const s of smears) s.life -= dt;
  for (let i = smears.length - 1; i >= 0; i--) if (smears[i].life <= 0) smears.splice(i, 1);
  mist = Math.max(0, mist - dt / MIST_CLEAR);
}

// Drawn on the glass (hud.js), before the visor's frame.
function drawGrime(pixels) {
  for (const s of smears) {
    const fade = Math.min(1, s.life / (GRIME_LIFE * 0.5)) * 0.55; // full for half its life, then clearing
    const r = Math.ceil(s.r);
    for (let y = Math.floor(s.y) - r; y <= Math.floor(s.y) + r; y++) {
      for (let x = Math.floor(s.x) - r; x <= Math.floor(s.x) + r; x++) {
        if (x < 0 || x >= SCREEN_W || y < 0 || y >= SCREEN_H) continue;
        const d = Math.hypot(x - s.x, (y - s.y) * 1.3) / s.r; // a little wider than tall: it's been wiped by nothing
        if (d >= 1 || noise(x, y, s.seed) < 0.35 + 0.4 * d) continue; // grainy, thinner at the edge
        const i = (y * SCREEN_W + x) * 4;
        for (let c = 0; c < 3; c++) pixels[i + c] += (s.colour[c] - pixels[i + c]) * fade;
      }
    }
  }
  if (mist <= 0) return;
  // Mist creeps in from the edges: nothing in the middle, thickest at the rim.
  const colour = MIST_COLOUR[mistKind];
  for (let y = 0; y < SCREEN_H; y++) {
    for (let x = 0; x < SCREEN_W; x++) {
      const ex = Math.abs(x - SCREEN_W / 2) / (SCREEN_W / 2), ey = Math.abs(y - SCREEN_H / 2) / (SCREEN_H / 2);
      const edge = Math.max(0, Math.hypot(ex, ey) / 1.2 - (1 - mist) * 0.6 - 0.3);
      if (edge <= 0) continue;
      const a = Math.min(0.7, edge * 1.6) * (0.85 + 0.15 * noise(x >> 2, y >> 2, 130));
      const i = (y * SCREEN_W + x) * 4;
      for (let c = 0; c < 3; c++) pixels[i + c] += (colour[c] - pixels[i + c]) * a;
    }
  }
}

// Each frame while you're playing (main.js).
function updateAtmosphere(dt) {
  updateBreathing(dt);
  updateBuildingSounds(dt);
  updateOldPa(dt);
  updateGrime(dt);
}
