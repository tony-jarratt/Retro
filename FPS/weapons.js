// YOUR GUN and its FIRE MODES. There's one gun, the pulse gun, and you never
// switch it: it SPINS UP. Press the trigger and it fires a single accurate
// shot. Keep holding, and after SPIN_UP.burst seconds it starts firing
// bursts; hold on to SPIN_UP.auto and it goes fully automatic. Let go and it
// drops straight back to single. Each step lights another coil on the barrel,
// and the next coil flickers faster and faster as the gun winds up to it.
//
// Upgrade modules you find decide how far it can spin up: without the burst
// module, holding does nothing more than single shots. Every mode fires
// whatever's loaded (ammo.js: standard, incendiary or armour-piercing):
// what changes is how fast the rounds come out, and how accurately. (The
// firing itself, the rays and what they hit, is in combat.js.)
//
// ACCURACY is a CONE. Each round leaves the barrel at a random angle up to
// `cone` radians either side of where you're aiming. The robots are a fixed
// width, so a fixed angle of error matters more the further away they are:
// at 2 cells a little wobble still lands on the hull, at 8 the same wobble
// misses. So hitting depends on the mode's accuracy, the distance, and luck,
// all through one number, and what you see on screen is what happened.
// Moving while you fire widens the cone (MOVING_CONE): stand still to snipe.
//
// LOW AMMO holds it back. Each mode needs `minAmmo` of the loaded type to run: below that the
// gun won't spin up past the best mode your ammo covers (auto -> burst -> single).
//
// Each mode:
//   name       shown when you pick up its module
//   rounds     rounds fired per pull of the trigger (one ammo each)
//   gap        seconds between the rounds of one pull (burst only)
//   cooldown   seconds after a pull before the next
//   cone       the most a round can stray, in radians, either side of the aim
//   climb      extra cone per round within a pull: a burst's recoil climbs
//   recoil     pixels the gun kicks down when it fires (hud.js)
//   minAmmo    the least ammo this mode will run on
const FIRE_MODES = {
  single: { name: 'SINGLE SHOT', rounds: 1, gap: 0,    cooldown: 0.35, cone: 0.006, climb: 0,     recoil: 6, minAmmo: 1 },
  burst:  { name: 'BURST',       rounds: 3, gap: 0.07, cooldown: 0.45, cone: 0.02,  climb: 0.015, recoil: 5, minAmmo: 3 },
  auto:   { name: 'AUTOMATIC',   rounds: 1, gap: 0,    cooldown: 0.12, cone: 0.06,  climb: 0,     recoil: 3, minAmmo: 8 },
  // OVERDRIVE (the Atrium's module, owner 2026-11-06): a fourth coil, past
  // automatic. Hold on and the gun screams: nearly twice as fast, and wilder.
  overdrive: { name: 'OVERDRIVE', rounds: 1, gap: 0,    cooldown: 0.065, cone: 0.09, climb: 0,     recoil: 2, minAmmo: 12 },
};
const MODE_ORDER = ['single', 'burst', 'auto', 'overdrive']; // the spin-up steps, in order
const SPIN_UP = { single: 0, burst: 0.4, auto: 1.2, overdrive: 2.2 };   // seconds of holding the trigger to reach each (owner, 2026-11-06: was 0.5 and 1.5)
const MOVING_CONE = 0.04;   // extra cone, in radians, while you're walking
const MODULE_AMMO = 8;      // an upgrade module comes with some ammo

const WEAPON_MESSAGE_TIME = 1.5; // seconds a module's name shows on screen
const WEAPON_HINT_TIME = 3;      // ...and a message with a second line (how to load a new ammo type)
let weaponMessage = null;
let weaponMessageLine = null; // a smaller second line under it, or null
let weaponMessageTime = 0;

// Can the gun run in this mode right now: is its module fitted, and is there
// the ammo for it?
function modeAvailable(id) {
  return player.modes.includes(id) && roundsLoaded() >= FIRE_MODES[id].minAmmo; // ammo.js
}

// The mode the gun is firing in: the highest step that the time you've held
// the trigger has reached, stepping back down past any you can't run.
function activeModeId() {
  for (let i = MODE_ORDER.length - 1; i > 0; i--) {
    const id = MODE_ORDER[i];
    if (gun.heldTime >= SPIN_UP[id] && modeAvailable(id)) return id;
  }
  return 'single';
}

function currentMode() {
  return FIRE_MODES[activeModeId()];
}

// For the coils (hud.js): how many are lit, and how close the gun is to
// lighting the next one (0 = just started winding, 1 = there; null if it
// isn't winding up to anything).
function spinUpState() {
  const at = MODE_ORDER.indexOf(activeModeId());
  const next = MODE_ORDER[at + 1];
  if (!triggerHeld() || next === undefined || !modeAvailable(next)) return { lit: at + 1, progress: null };
  const from = SPIN_UP[MODE_ORDER[at]];
  return { lit: at + 1, progress: (gun.heldTime - from) / (SPIN_UP[next] - from) };
}

function showWeaponMessage(text, line = null) {
  weaponMessage = text;
  weaponMessageLine = line;
  weaponMessageTime = line ? WEAPON_HINT_TIME : WEAPON_MESSAGE_TIME;
}

// Walking over an upgrade module: it's fitted, and the gun can spin up further.
function collectModule(id) {
  player.ammo += MODULE_AMMO;
  if (player.modes.includes(id)) return;
  player.modes.push(id);
  showWeaponMessage(FIRE_MODES[id].name + ' MODULE');
}

function updateWeapons(dt) {
  weaponMessageTime = Math.max(0, weaponMessageTime - dt);
}
