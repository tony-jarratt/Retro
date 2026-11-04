// Startup and the main loop: input -> doors -> move -> robots -> cast rays -> draw -> repeat.

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
setupInput(screenCanvas, () => {
  debugOn = !debugOn;
  debugCanvas.style.display = debugOn ? 'block' : 'none';
}, useDoor);

let lastTime = performance.now();

function frame(now) {
  // Seconds since the last frame, so speed doesn't depend on frame rate.
  // Capped at 0.1s: after the tab has been in the background, rAF resumes
  // with a huge gap, and one giant step could carry the player through a wall.
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  updateDoors(dt);
  updatePlayer(dt);
  updateEnemies(dt);
  const hits = castRays(player);
  renderView(frameImage, hits, player);
  screenCtx.putImageData(frameImage, 0, 0);
  if (debugOn) drawDebug(debugCtx, player, hits);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
