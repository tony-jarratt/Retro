// Startup and the main loop:
// input -> doors -> move -> robots -> combat -> lighting -> cast rays -> draw -> HUD -> CRT filter -> repeat.

const screenCanvas = document.getElementById('screen');
screenCanvas.width = SCREEN_W;   // the canvas really is 320x200 pixels;
screenCanvas.height = SCREEN_H;  // CSS stretches it up (see index.html)
const screenCtx = screenCanvas.getContext('2d');

// Our pixel buffer. We write RGBA bytes into it ourselves, then copy the
// whole thing onto the canvas once per frame with putImageData.
const frameImage = screenCtx.createImageData(SCREEN_W, SCREEN_H);

const debugCanvas = document.getElementById('debug');
debugCanvas.width = MAP[0].length * DEBUG_CELL;
debugCanvas.height = MAP.length * DEBUG_CELL;
const debugCtx = debugCanvas.getContext('2d');
let debugOn = false;

// Catch a broken map now, with a clear message, rather than as a confusing
// crash halfway through a frame.
function checkMap() {
  const width = MAP[0].length;
  MAP.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`MAP row ${y} has ${row.length} cells; row 0 has ${width}. All rows must be the same length.`);
    }
    row.forEach((cell, x) => {
      if (cell !== 0 && !TEXTURES[cell]) {
        throw new Error(`MAP[${y}][${x}] is ${cell}, which has no entry in TEXTURES.`);
      }
      const onBorder = y === 0 || y === MAP.length - 1 || x === 0 || x === width - 1;
      if (onBorder && cell === 0) {
        throw new Error(`MAP[${y}][${x}] is on the border but empty; the border must be solid walls.`);
      }
    });
  });
  SPRITES.forEach((s, n) => {
    if (!SPRITE_TYPES[s.type]) {
      throw new Error(`SPRITES[${n}] has type "${s.type}", which is not in SPRITE_TYPES.`);
    }
    const cell = MAP[Math.floor(s.y)]?.[Math.floor(s.x)];
    if (cell !== 0) {
      const where = cell === undefined ? 'outside the map' : 'inside a wall';
      throw new Error(`SPRITES[${n}] (${s.type} at ${s.x}, ${s.y}) is ${where}.`);
    }
  });
  CEILING_LIGHTS.forEach((c, n) => {
    if (MAP[c.y]?.[c.x] !== 0) {
      throw new Error(`CEILING_LIGHTS[${n}] at cell (${c.x}, ${c.y}) is outside the map or not a floor cell.`);
    }
  });
  PICKUPS.forEach((p, n) => {
    if (!PICKUP_TYPES[p.type]) {
      throw new Error(`PICKUPS[${n}] has type "${p.type}", which is not in PICKUP_TYPES.`);
    }
    if (MAP[Math.floor(p.y)]?.[Math.floor(p.x)] !== 0) {
      throw new Error(`PICKUPS[${n}] (${p.type} at ${p.x}, ${p.y}) is outside the map or not on a floor cell.`);
    }
  });
  enemies.forEach((enemy, n) => {
    if (MAP[Math.floor(enemy.y)]?.[Math.floor(enemy.x)] !== 0) {
      throw new Error(`ENEMIES[${n}] at (${enemy.x}, ${enemy.y}) is outside the map or not on a floor cell.`);
    }
    if (enemyBlocked(enemy, enemy.x, enemy.y)) {
      throw new Error(`ENEMIES[${n}] at (${enemy.x}, ${enemy.y}) overlaps a wall, sprite, the player or another robot.`);
    }
  });
  if (MAP[Math.floor(PLAYER_START.y)]?.[Math.floor(PLAYER_START.x)] !== 0) {
    throw new Error(`PLAYER_START (${PLAYER_START.x}, ${PLAYER_START.y}) is outside the map or inside a wall.`);
  }
  if (blocked(PLAYER_START.x, PLAYER_START.y)) {
    throw new Error(`PLAYER_START (${PLAYER_START.x}, ${PLAYER_START.y}) is too close to a wall or solid sprite to move.`);
  }
}

checkMap();
setupInput(screenCanvas, {
  // M (the map), C (the CRT look) and V (the visor) are play-testing tools:
  // in the game proper the keys do nothing.
  toggleDebug: () => {
    if (!PLAYTEST) return;
    debugOn = !debugOn;
    debugCanvas.style.display = debugOn ? 'block' : 'none';
  },
  fire: playerFire,
  restart: restartLevel, // campaign.js: R, once it's over
  toggleFilter: () => { if (PLAYTEST) crtFilterOn = !crtFilterOn; },
  toggleVisor: () => { if (PLAYTEST) visorOn = !visorOn; },
  toggleSound,
  toggleMusic, // music.js
  enter: handleEnter, // campaign.js: on to whatever's next
  togglePause, // pause.js
  loadAmmo,    // ammo.js: keys 1-3
  toggleScanner, // scanner.js: X
  // Play-testing: I makes you invulnerable (and again, not): hits still flash, but cost nothing.
  toggleInvulnerable: () => {
    if (!PLAYTEST) return;
    player.invulnerable = !player.invulnerable;
    if (player.invulnerable) player.armour = player.maxArmour;
  },
});

// THE PLAY-TEST LEVEL CHOOSER: with ?playtest and no level picked yet, show a
// button per level instead of starting the game. Picking one reloads the page
// with that level (map.js).
function showLevelChooser() {
  const box = document.getElementById('chooser');
  LEVELS.forEach((level, n) => {
    const button = document.createElement('button');
    button.textContent = `${n + 1}  ${level.name}`;
    button.addEventListener('click', () => { location.search = levelAddress(level.id); });
    box.appendChild(button);
  });
  box.style.display = 'flex';
  box.querySelector('button').focus(); // so Enter or Space picks straight away
}

let lastTime = performance.now();

function frame(now) {
  // Seconds since the last frame, so speed doesn't depend on frame rate.
  // Capped at 0.1s: after the tab has been in the background, rAF resumes
  // with a huge gap, and one giant step could carry the player through a wall.
  // And never below 0: on the very first frame, rAF's timestamp can be a
  // little EARLIER than the performance.now() taken at load, and a negative
  // step would make every countdown timer count up instead.
  const dt = Math.max(0, Math.min((now - lastTime) / 1000, 0.1));
  lastTime = now;

  // Paused (pause.js): nothing updates, so nothing moves and no timer runs,
  // but the frozen view is still drawn, with the controls over it.
  if (!paused) {
    animTime += dt; // drives animated walls (textures.js)
    updateCampaign(dt); // campaign.js: the title's turn, the lift ride, the finale
    updateDoors(dt);
    if (game.state === 'playing') { // once you've won or died, everyone stops
      updatePlayer(dt);
      updatePickups();
      updateSteam(dt);    // before security and robots, so they see this frame's plumes
      updateSecurity(dt); // before the robots, so an alarm this frame sends them moving at once
      updateEnemies(dt);
      updateDrones(dt);
      updateLarvae(dt);   // larvae.js
      updateAcid(dt);     // acid.js: globs in flight, pools burning
      updateSpores(dt);   // spores.js: clouds hanging, burning you
      updateSprinklers(dt); // sprinklers.js: running heads water the bloomers
      updatePollinators(dt); // pollinators.js: the moths
      updateCreatures(dt); // creatures.js: once the lab's loose, they always know where you are
      updateCharge(dt);   // charge.js: setting the demolition charge, and its fuse
      updateCore();       // the objective: has the core gone, are you at the lift? (core.js)
      updateRepairBays(); // repair.js: free the bay of a robot that died on its way
      updateManagers(dt); // manager.js: the PA, the badge, cut lights and sealed doors running down
      updateTraps(dt);    // traps.js: trapped terminals you've come too close to
      updateBurning(dt);  // ammo.js: creatures alight from incendiary rounds
      updateLockdown(dt); // lockdown.js: bulkheads coming down
      updatePower(dt);    // power.js: power cuts, and the breakers
      updateAmbushes(dt); // ambush.js: ceiling vents and roots
      updateAtmosphere(dt); // atmosphere.js: your breathing, the building, the old PA, the visor's grime
    }
    updateCombat(dt);
    updateWeapons(dt);
    updateScanner(dt); // scanner.js: off when the level's over; its tick
    updatePanels(dt); // falling glass
    updateExplosions(dt); // outside the "playing" check, so a fireball finishes even if it killed you
    updateLighting(); // after combat, so this frame's muzzle flashes light the scene
    updateSound(dt);  // the sounds that keep going: whines, buzzes, beeps (sound.js)
  }
  updateCampaignMusic(); // campaign.js: silence when you die, a flourish when you win
  updateMusic();         // music.js: book the next few notes
  let hits = null;
  if (cutsceneShowing()) {
    drawCutscene(frameImage.data); // campaign.js: the lift ride or the finale, instead of the 3D view
  } else {
    hits = castRays(player);
    if (player.scanning) renderScanView(frameImage, hits, player); // scanner.js: the vector view
    else renderView(frameImage, hits, player);
    drawHud(frameImage.data); // flat on top of the 3D view, same buffer
  }
  // Last of all, so it covers the HUD too: the full CRT look if you've asked
  // for it (C), otherwise however much your visor's damage calls for.
  // (Once you're dead the display has shut down: see drawHud.)
  if (crtFilterOn) applyCrtFilter(frameImage.data);
  else if (game.state !== 'dead') applyDamageFilter(frameImage.data, player.armour, dt);
  screenCtx.putImageData(frameImage, 0, 0);
  if (debugOn && hits) drawDebug(debugCtx, player, hits);

  requestAnimationFrame(frame);
}

if (PLAYTEST && !PAGE_ARGS.has('level')) showLevelChooser();
else requestAnimationFrame(frame);
