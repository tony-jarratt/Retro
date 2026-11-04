// Startup and the main loop: input -> move -> cast rays -> draw -> repeat.

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
  if (MAP[Math.floor(PLAYER_START.y)][Math.floor(PLAYER_START.x)] !== 0) {
    throw new Error(`PLAYER_START (${PLAYER_START.x}, ${PLAYER_START.y}) is inside a wall.`);
  }
}

checkMap();
setupInput(screenCanvas, () => {
  debugOn = !debugOn;
  debugCanvas.style.display = debugOn ? 'block' : 'none';
});

let lastTime = performance.now();

function frame(now) {
  // Seconds since the last frame, so speed doesn't depend on frame rate.
  // Capped at 0.1s: after the tab has been in the background, rAF resumes
  // with a huge gap, and one giant step could carry the player through a wall.
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  updatePlayer(dt);
  const hits = castRays(player);
  renderView(frameImage, hits);
  screenCtx.putImageData(frameImage, 0, 0);
  if (debugOn) drawDebug(debugCtx, player, hits);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
