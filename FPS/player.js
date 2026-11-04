// Player state, keyboard/mouse input, movement and wall collision.

const MOVE_SPEED = 3.0;           // cells per second
const TURN_SPEED = 2.5;           // radians per second (arrow keys)
const MOUSE_SENSITIVITY = 0.0025; // radians per pixel of mouse movement
const PLAYER_RADIUS = 0.2;        // half-width of the player's collision box, in cells

const player = { x: PLAYER_START.x, y: PLAYER_START.y, angle: PLAYER_START.angle };

const keys = {};   // e.code -> true while that key is held, e.g. keys.KeyW
let mouseTurn = 0; // mouse pixels moved since the last frame

function setupInput(canvas, onToggleDebug) {
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyM' && !e.repeat) onToggleDebug();
    if (e.code.startsWith('Arrow')) e.preventDefault(); // stop the page scrolling
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  // If the window loses focus mid-keypress, the keyup never arrives and the
  // player would walk forever. Treat losing focus as releasing everything.
  window.addEventListener('blur', () => {
    for (const code in keys) keys[code] = false;
  });

  // Mouse look needs pointer lock: click the view to capture the mouse,
  // Esc to release it. While locked, movementX is the raw sideways motion.
  canvas.addEventListener('click', () => canvas.requestPointerLock());
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) mouseTurn += e.movementX;
  });
}

function isWall(x, y) {
  return MAP[Math.floor(y)][Math.floor(x)] !== 0;
}

// Would a square of half-width PLAYER_RADIUS centred on (x, y) overlap a wall
// or a solid sprite? For walls, checking the four corners is enough because
// the square is smaller than a cell.
function blocked(x, y) {
  const r = PLAYER_RADIUS;
  return isWall(x - r, y - r) || isWall(x + r, y - r) ||
         isWall(x - r, y + r) || isWall(x + r, y + r) ||
         hitsSolidSprite(x, y, r);
}

function updatePlayer(dt) {
  // Turning: arrow keys at a fixed rate, plus whatever the mouse did.
  if (keys.ArrowLeft) player.angle -= TURN_SPEED * dt;
  if (keys.ArrowRight) player.angle += TURN_SPEED * dt;
  player.angle += mouseTurn * MOUSE_SENSITIVITY;
  mouseTurn = 0;

  // Facing direction, and the direction to our right (facing rotated 90°
  // clockwise; with y pointing down that is (-dirY, dirX)).
  const dirX = Math.cos(player.angle);
  const dirY = Math.sin(player.angle);
  const rightX = -dirY;
  const rightY = dirX;

  let forward = 0;
  let strafe = 0;
  if (keys.KeyW) forward += 1;
  if (keys.KeyS) forward -= 1;
  if (keys.KeyD) strafe += 1;
  if (keys.KeyA) strafe -= 1;

  let moveX = dirX * forward + rightX * strafe;
  let moveY = dirY * forward + rightY * strafe;
  const len = Math.hypot(moveX, moveY);
  if (len === 0) return;
  moveX /= len; // normalise, so moving diagonally isn't ~1.4x faster
  moveY /= len;

  // Move one axis at a time. If x is blocked but y isn't, you still slide
  // along the wall instead of sticking to it.
  const step = MOVE_SPEED * dt;
  const newX = player.x + moveX * step;
  if (!blocked(newX, player.y)) player.x = newX;
  const newY = player.y + moveY * step;
  if (!blocked(player.x, newY)) player.y = newY;
}
