// Pickups: ammo boxes, suit repair kits, keycards, gun modules, the demolition
// charge. (Destroyed robots drop nothing: they blow up. Only a heavy leaves
// something worth having, the automatic fire module.)
// They're drawn as sprites (sprites.js) and collected by walking over them.
// Where the starting ones lie is listed in the level file (levels/*.js, `pickups`).

const PICKUP_RADIUS = 0.3;       // half-width of the box you have to touch to collect one
const PICKUP_FLASH_TIME = 0.25;  // seconds the screen flashes gold when you collect one

// What each kind looks like, and what collecting it does. collect() returns
// false to refuse: a repair kit is left where it is if your armour is full,
// so it's still there when you need it.
const PICKUP_TYPES = {
  ammo: {
    texture: AMMO_BOX_TEXTURE,
    collect: () => { player.ammo += 8; return true; },
  },
  // The lab's big supply crate: its creatures drop no clips, so its ammo comes in bulk.
  ammocrate: {
    texture: AMMO_CRATE_TEXTURE,
    collect: () => { player.ammo += 20; return true; },
  },
  clip: {
    texture: CLIP_TEXTURE,
    collect: () => { player.ammo += 4; return true; },
  },
  // Patches up your suit's armour, which also seals a breach.
  repair: {
    texture: REPAIR_KIT_TEXTURE,
    collect: () => {
      if (player.armour >= player.maxArmour) return false;
      player.armour = Math.min(player.maxArmour, player.armour + 25);
      return true;
    },
  },
  // Boxes of special rounds (ammo.js): the first of each type is how you find it.
  incendiary: {
    texture: ROUNDS_BOX_TEXTURES.incendiary,
    collect: () => { collectRounds('incendiary'); return true; },
  },
  piercing: {
    texture: ROUNDS_BOX_TEXTURES.piercing,
    collect: () => { collectRounds('piercing'); return true; },
  },
  // REINFORCED PLATING (Genetics): the suit takes 25 more, and the new plates come full.
  plating: {
    texture: PLATING_TEXTURE,
    collect: () => {
      player.maxArmour = PLATED_MAX_ARMOUR;
      player.armour = Math.min(player.maxArmour, player.armour + (PLATED_MAX_ARMOUR - PLAYER_MAX_ARMOUR));
      showWeaponMessage('REINFORCED PLATING', 'ARMOUR UP TO ' + PLATED_MAX_ARMOUR);
      return true;
    },
  },
  // The scanner upgrade (Offices, scanner.js): two walls through, further. (Brings the scanner with it, if you'd somehow not got one.)
  scannerup: {
    texture: SCANNER_UPGRADE_TEXTURE,
    collect: () => { collectScannerUpgrade(); return true; },
  },
  // The OVERDRIVE module (the Atrium, weapons.js): a fourth coil, past automatic.
  overdrivemod: {
    texture: OVERDRIVE_MODULE_TEXTURE,
    collect: () => { collectModule('overdrive'); return true; },
  },
  // The structural scanner (scanner.js): found once, then yours.
  scanner: {
    texture: SCANNER_MODULE_TEXTURE,
    collect: () => { collectScanner(); return true; },
  },
  // Fire-mode upgrade modules for your gun (weapons.js): switched on at once.
  burstmod: {
    texture: BURST_MODULE_TEXTURE,
    collect: () => { collectModule('burst'); return true; },
  },
  automod: {
    texture: AUTO_MODULE_TEXTURE,
    collect: () => { collectModule('auto'); return true; },
  },
  // The demolition charge (charge.js): carry it to the core and it's set.
  charge: {
    texture: CHARGE_TEXTURE,
    collect: () => { player.charge = true; return true; },
  },
  // The lift key (core.js): a lift-key level's objective.
  liftkey: {
    texture: LIFT_KEY_TEXTURE,
    collect: () => { takeLiftKey(); return true; },
  },
  // Keycards: 'redkey', 'bluekey'. Collecting one lets you through doors of
  // that colour (playerCanOpen in doors.js).
  redkey: {
    texture: KEYCARD_TEXTURES.red,
    collect: () => { player.keys.push('red'); return true; },
  },
  bluekey: {
    texture: KEYCARD_TEXTURES.blue,
    collect: () => { player.keys.push('blue'); return true; },
  },
};

// The pickups still lying in the level: a copy of the map's list, so
// collecting one never changes the map data itself.
const pickups = PICKUPS.map((p) => ({ type: p.type, x: p.x, y: p.y }));

function updatePickups() {
  // Walk the list backwards: removing item i with splice shifts everything
  // after it down one place, which a forwards loop would then skip over.
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    if (!boxesOverlap(player.x, player.y, PLAYER_RADIUS, p.x, p.y, PICKUP_RADIUS)) continue;
    if (!PICKUP_TYPES[p.type].collect()) continue;
    pickups.splice(i, 1);
    game.pickupFlash = PICKUP_FLASH_TIME;
  }
}

// A destroyed robot BLOWS UP (owner, 2026-11-06): a fireball over its wreck,
// harmless (explosions.js: robotBlowsUp), and nothing to salvage. Except a
// HEAVY: it leaves the AUTOMATIC fire module, if you haven't got it yet (and
// there isn't one already lying about): bring down a heavy for it. The
// module and the wreck sit at the same distance; the sort in placeSprites
// keeps ties in list order, and pickups come after robots, so it's drawn on top.
function dropSalvage(enemy) {
  robotBlowsUp(enemy); // explosions.js
  if (enemy.type !== 'heavy' || player.modes.includes('auto') || pickups.some((p) => p.type === 'automod')) return;
  pickups.push({ type: 'automod', x: enemy.x, y: enemy.y });
}
