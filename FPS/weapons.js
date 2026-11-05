// WEAPONS: what you carry, and how each one fires. The firing itself (rays,
// what they hit) is in combat.js; this file is the table of differences.
//
// Kept deliberately simple:
//   - ONE ammo pool (player.ammo). Each weapon just spends it differently.
//   - You keep everything you pick up. Q cycles; 1, 2, 3 pick one directly.
//   - Picking up a new weapon puts it straight in your hands.
//
// Each weapon:
//   name       shown when you pick it up or switch to it
//   short      shown by the ammo count
//   key        the number key that selects it
//   cost       ammo per shot
//   cooldown   seconds between shots
//   auto       true: keeps firing while the trigger is held
//   pellets    rays per shot, fanned evenly across...
//   spread     ...this total angle in radians (0 = dead straight)
//   jitter     a random wobble added to each shot's aim, radians either way
//   range      cells: a pellet that reaches further than this does nothing
//   recoil     pixels the gun kicks down when it fires
//   textures   [normal, firing] first-person pictures (textures.js)
//   flash      the colour of its muzzle flash's light (lighting.js)
const WEAPONS = {
  pistol: {
    name: 'PULSE PISTOL', short: 'PULSE', key: 'Digit1',
    cost: 1, cooldown: 0.35, auto: false, pellets: 1, spread: 0, jitter: 0, range: Infinity, recoil: 6,
    textures: PISTOL_TEXTURES, flash: [0.9, 1.2, 1.4],
  },
  // Up close, most of its five pellets land on the same robot: a walker in one
  // shot. At range they've fanned out so far that one hits, if any.
  scatter: {
    name: 'SCATTER CANNON', short: 'SCATTER', key: 'Digit2',
    cost: 3, cooldown: 0.8, auto: false, pellets: 5, spread: 0.2,  jitter: 0, range: 5, recoil: 12,
    textures: SCATTER_TEXTURES, flash: [1.6, 1.0, 0.4],
  },
  // Hold the trigger: eight rounds a second, each wandering a little. It
  // shreds anything in front of it, and your ammo with it.
  autocannon: {
    name: 'AUTOCANNON', short: 'AUTO', key: 'Digit3',
    cost: 1, cooldown: 0.12, auto: true, pellets: 1, spread: 0, jitter: 0.04, range: Infinity, recoil: 3,
    textures: AUTOCANNON_TEXTURES, flash: [1.5, 1.3, 0.6],
  },
};
const WEAPON_ORDER = ['pistol', 'scatter', 'autocannon']; // the order Q cycles through

const WEAPON_MESSAGE_TIME = 1.5; // seconds a weapon's name shows on screen
let weaponMessage = null;
let weaponMessageTime = 0;

function currentWeapon() {
  return WEAPONS[player.weapon];
}

function selectWeapon(id) {
  if (!player.weapons.includes(id) || player.weapon === id) return;
  player.weapon = id;
  gun.cooldown = 0; // a fresh weapon is ready at once
  weaponMessage = WEAPONS[id].name;
  weaponMessageTime = WEAPON_MESSAGE_TIME;
}

// Q: the next weapon you're carrying, in WEAPON_ORDER, wrapping round.
function cycleWeapon() {
  const owned = WEAPON_ORDER.filter((id) => player.weapons.includes(id));
  selectWeapon(owned[(owned.indexOf(player.weapon) + 1) % owned.length]);
}

// Walking over a weapon: new ones join your kit and go straight into your
// hands; one you already have is worth its ammo instead.
const WEAPON_PICKUP_AMMO = 8;
function collectWeapon(id) {
  player.ammo += WEAPON_PICKUP_AMMO;
  if (player.weapons.includes(id)) return;
  player.weapons.push(id);
  selectWeapon(id);
}

function updateWeapons(dt) {
  weaponMessageTime = Math.max(0, weaponMessageTime - dt);
}
