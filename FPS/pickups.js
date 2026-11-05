// Pickups: ammo boxes, suit repair kits, keycards, gun modules, and clips dropped by destroyed robots.
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
  clip: {
    texture: CLIP_TEXTURE,
    collect: () => { player.ammo += 4; return true; },
  },
  // Patches up your suit's armour, which also seals a breach.
  repair: {
    texture: REPAIR_KIT_TEXTURE,
    collect: () => {
      if (player.armour >= PLAYER_MAX_ARMOUR) return false;
      player.armour = Math.min(PLAYER_MAX_ARMOUR, player.armour + 25);
      return true;
    },
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

// A destroyed robot drops a clip on its wreck. Both sprites then sit at the
// same distance; the sort in placeSprites keeps ties in list order, and
// pickups come after robots in that list, so the clip is drawn on top.
// A heavy drops the AUTOMATIC fire module instead, if you haven't got it yet
// (and there isn't one already lying about): bring down a heavy for it.
function dropClip(enemy) {
  const wantModule = enemy.type === 'heavy' && !player.modes.includes('auto') &&
    !pickups.some((p) => p.type === 'automod');
  pickups.push({ type: wantModule ? 'automod' : 'clip', x: enemy.x, y: enemy.y });
}
