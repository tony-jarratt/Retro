// AMMO TYPES (owner, 2026-11-06): one gun, three kinds of round. The gun
// still spins up the same way (weapons.js); what changes is what's LOADED.
// Keys 1, 2, 3 load standard, incendiary, armour-piercing. The barrel's
// coils glow in the loaded type's colour, the red counter on the gun shows
// that type's rounds, and the visor's bottom rim names it (hud.js).
//
//   STANDARD (cyan)     the bulk of your ammo: player.ammo, as always.
//   INCENDIARY (orange) for the living. A hit sets a creature or infected
//                       ALIGHT: it burns, lighting itself up (the stalker
//                       included), and takes one more hit when the burning
//                       ends, BURN_TIME later (hitting it again while it
//                       burns starts the burning over: it's still one more
//                       hit, so spacing your shots counts). Anything that
//                       dies burning is BURNT: a suit doesn't get up, the
//                       lurchers can't eat it, a bloomer burns instead of
//                       bursting. It counts double on the breeding chamber
//                       and the mother plant. Nothing extra on machines.
//                       THE CATCH: its muzzle flash is big and bright: it
//                       lights YOU up for the creatures, and moths see it
//                       from twice as far.
//   ARMOUR-PIERCING     for machines and crowds. Each round counts DOUBLE on
//   (white)             a robot, a repair bay or the security core (a heavy's
//                       back, already double, takes 4), and it goes THROUGH
//                       the first thing it hits into the next (a suit behind
//                       a suit, a guard behind its desk) and through glass,
//                       cracking it on the way. Nothing extra on creatures.
//
// Special rounds come only in their own boxes, placed in the levels: none
// are dropped. You DISCOVER each type as you climb: armour-piercing first
// turns up in the industrial level, incendiary in storage. Until you've
// picked up a type's first box, its key does nothing; the first box tells
// you which key loads it. Run a special type dry and the gun drops back to
// standard. What you've found, and how many of each you have, go up in the
// lift with the rest of your loadout (campaign.js).

// Each type: its key, its name (the visor; the box's message), the coil
// colour, its muzzle flash (the gun's star: hot centre and edge; the light
// it throws: colour and radius), and how much further than usual moths see
// that flash (pollinators.js).
const AMMO_TYPES = {
  standard:   { key: 1, name: 'STANDARD',   coil: [90, 230, 255],  star: [[230, 255, 255], [90, 210, 255]], light: [0.9, 1.2, 1.4], radius: 5, mothReach: 1 },
  incendiary: { key: 2, name: 'INCENDIARY', coil: [255, 130, 30],  star: [[255, 245, 190], [255, 120, 20]], light: [2.2, 1.2, 0.4], radius: 8, mothReach: 2 },
  piercing:   { key: 3, name: 'PIERCING',   coil: [235, 240, 255], star: [[255, 255, 255], [190, 200, 225]], light: [1.2, 1.25, 1.4], radius: 5, mothReach: 1 },
};
const AMMO_ORDER = ['standard', 'incendiary', 'piercing'];
const SPECIAL_AMMO = ['incendiary', 'piercing'];
const ROUNDS_PER_BOX = 6;    // a box of special rounds
const BURN_TIME = 1.5;       // seconds a creature burns before the burning's extra hit
const PIERCE_THROUGH = 2;    // things one armour-piercing round can hit
const VISOR_SHOWS_AMMO = true; // the loaded type on the visor's rim (hud.js); for when the visor's configurable

// How many rounds of this type you have.
function roundsOf(type) {
  return type === 'standard' ? player.ammo : player.rounds[type];
}

// How many of the loaded type: what the gun's counter shows, and what the fire modes need (weapons.js).
function roundsLoaded() {
  return roundsOf(player.loaded);
}

// A round leaves the barrel (combat.js). A special type run dry: back to standard.
function spendRound() {
  if (player.loaded === 'standard') { player.ammo -= 1; return; }
  player.rounds[player.loaded] -= 1;
  if (player.rounds[player.loaded] > 0) return;
  player.loaded = 'standard';
  showWeaponMessage('STANDARD ROUNDS'); // weapons.js
}

// Keys 1-3 (player.js). A type you haven't found does nothing; one you've run out of says so.
function loadAmmo(type) {
  if (paused || game.state !== 'playing' || player.loaded === type) return;
  if (type !== 'standard' && !player.found.includes(type)) return;
  if (roundsOf(type) === 0) { showWeaponMessage('NO ' + AMMO_TYPES[type].name + ' ROUNDS'); return; }
  player.loaded = type;
  sfxLoadAmmo(); // sound.js
}

// Walking over a box (pickups.js). The first of its type: you've found it, and how to load it.
function collectRounds(type) {
  player.rounds[type] += ROUNDS_PER_BOX;
  if (player.found.includes(type)) return;
  player.found.push(type);
  showWeaponMessage(AMMO_TYPES[type].name + ' ROUNDS', `PRESS ${AMMO_TYPES[type].key} TO LOAD`);
}

// INCENDIARY: a round arriving at a creature, alive or downed (combat.js,
// before the hit's damage, so a round that kills it kills it burning).
function ignite(enemy) {
  if (!ENEMY_TYPES[enemy.type].creature) return;
  if (enemy.state === 'dead') { if (enemy.downTime > 0) burnUp(enemy); return; } // a downed suit: it burns where it lies
  enemy.burn = BURN_TIME;
}

// Dying while it burns (combat.js, damageEnemy): it's ash, and a suit stays down.
// (The brood mother is too big to burn away: her body stays.)
function burnUp(enemy) {
  enemy.burn = 0;
  enemy.downTime = 0;
  if (enemy.type !== 'brood') enemy.burnt = true;
}

// Is this one dying burning? (combat.js asks as it dies: a burning bloomer doesn't burst.)
function burning(enemy) {
  return enemy.burn > 0;
}

// Each frame (main.js): the burning runs down, then takes its hit.
function updateBurning(dt) {
  for (const e of enemies) {
    if (e.state === 'dead' || e.burn <= 0) continue;
    if (e.burn > dt) { e.burn -= dt; continue; }
    damageEnemy(e, 1, false); // still burning as it lands, so if it dies, it's burnt
    e.burn = 0;
  }
}

// What the objective takes from one round of this type (core.js): armour-piercing
// is made for the core, fire for the chamber and the plant.
function objectiveHits(type) {
  if (type === 'piercing' && OBJECTIVE === 'core') return 2;
  if (type === 'incendiary' && (OBJECTIVE === 'chamber' || OBJECTIVE === 'motherplant')) return 2;
  return 1;
}

// The flames on a burning creature, as sprites (sprites.js). They're
// effects: shots pass through. Listed after the creatures, so at the same
// spot they're drawn on top.
function flameThings(thing) {
  const frame = Math.floor(animTime * 10) % FLAME_FRAMES.length;
  return enemies.filter((e) => e.state !== 'dead' && e.burn > 0).map((e) => thing(e.x, e.y, FLAME_FRAMES[frame], { effect: true }));
}

// A burning creature lights the room round it, flickering (lighting.js).
const BURN_LIGHT = { colour: [1.6, 0.8, 0.25], radius: 2.5 };
function addBurnLights(lightGrid) {
  for (const e of enemies) {
    if (e.state === 'dead' || e.burn <= 0) continue;
    addLight(lightGrid, e.x, e.y, BURN_LIGHT.colour, BURN_LIGHT.radius, 0.8 + 0.2 * Math.sin(animTime * 37 + e.x));
  }
}
