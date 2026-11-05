// Player state, keyboard/mouse input, movement and wall collision.

const MOVE_SPEED = 3.0;           // cells per second
const TURN_SPEED = 2.5;           // radians per second (arrow keys)
const MOUSE_SENSITIVITY = 0.0025; // radians per pixel of mouse movement
const PLAYER_RADIUS = 0.2;        // half-width of the player's collision box, in cells
// You're in an armoured biomechanical suit. ARMOUR is all that stands between
// you and the robots: hits wear it down, and once it's gone the suit is
// BREACHED and the next hit kills you. Repair kits patch it up; nothing heals you.
const PLAYER_MAX_ARMOUR = 100;
const PLAYER_START_AMMO = 12;     // enough for the first fight or two; robots drop clips

// walkTime counts up while you're moving; the HUD uses it to bob the gun.
const player = {
  x: PLAYER_START.x,
  y: PLAYER_START.y,
  angle: PLAYER_START.angle,
  armour: PLAYER_MAX_ARMOUR, // 0 = breached: one more hit and it's over
  ammo: PLAYER_START_AMMO,
  keys: [],             // keycard colours collected, e.g. ['red']
  modes: ['single'],    // fire modes your gun can spin up to (weapons.js), in the order found
  moving: false,        // walking this frame (it spoils your aim: MOVING_CONE)
  walkTime: 0,
};

const keys = {};   // e.code -> true while that key is held, e.g. keys.KeyW
let mouseTurn = 0; // mouse pixels moved since the last frame
let mouseHeld = false; // left button down (with the mouse captured): spins the gun up (weapons.js)

// Is the trigger held down right now (Up arrow or left mouse button)?
function triggerHeld() {
  return keys.ArrowUp === true || mouseHeld;
}

// on: the functions to call for one-off actions:
// { toggleDebug, fire, restart, toggleFilter, toggleVisor, toggleSound }.
function setupInput(canvas, on) {
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (!e.repeat) {
      if (e.code === 'KeyM') on.toggleDebug();
      if (e.code === 'ArrowUp') on.fire(); // one shot per press: held keys repeat, hence !e.repeat
      if (e.code === 'KeyR') on.restart();
      if (e.code === 'KeyC') on.toggleFilter();
      if (e.code === 'KeyV') on.toggleVisor();
      if (e.code === 'KeyN') on.toggleSound();
    }
    if (e.code.startsWith('Arrow')) e.preventDefault(); // stop the page scrolling
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  // If the window loses focus mid-keypress, the keyup never arrives and the
  // player would walk forever. Treat losing focus as releasing everything.
  window.addEventListener('blur', () => {
    for (const code in keys) keys[code] = false;
    mouseHeld = false;
  });

  // Mouse look needs pointer lock: click the view to capture the mouse,
  // Esc to release it. While locked, movementX is the raw sideways motion.
  canvas.addEventListener('click', () => canvas.requestPointerLock());
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) mouseTurn += e.movementX;
  });

  // Left click fires, but only once the mouse is captured: the first click
  // just captures it, so it doesn't waste a shot.
  document.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement === canvas && e.button === 0) {
      mouseHeld = true;
      on.fire();
    }
  });
  document.addEventListener('mouseup', (e) => { if (e.button === 0) mouseHeld = false; });
}

function isWall(x, y) {
  const cell = MAP[Math.floor(y)][Math.floor(x)];
  // A door cell blocks until its door is fully open. (Simpler than colliding
  // with the moving slab itself, and it means you can't get clipped by it.)
  if (cell === DOOR_CELL) return doorAt(Math.floor(x), Math.floor(y)).open < 1;
  return cell !== 0; // walls, and panels: you can't climb through even a broken window
}

// Does a square of half-width r centred on (x, y) overlap a wall (or a door
// that isn't fully open)? Checking the four corners is enough as long as the
// square is smaller than a cell. Robots use this too, with their own r.
function boxHitsWall(x, y, r) {
  return isWall(x - r, y - r) || isWall(x + r, y - r) ||
         isWall(x - r, y + r) || isWall(x + r, y + r);
}

// Do two squares overlap? Only if they're closer than their two half-widths
// on both axes at once.
function boxesOverlap(x1, y1, r1, x2, y2, r2) {
  return Math.abs(x1 - x2) < r1 + r2 && Math.abs(y1 - y2) < r1 + r2;
}

// Would the player, standing at (x, y), overlap a wall, a solid sprite or a robot?
function blocked(x, y) {
  const r = PLAYER_RADIUS;
  return boxHitsWall(x, y, r) ||
         hitsSolidSprite(x, y, r) ||
         enemies.some((enemy) => enemy.state !== 'dead' && boxesOverlap(x, y, r, enemy.x, enemy.y, ENEMY_RADIUS));
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
  player.moving = len > 0;
  if (len === 0) return;
  player.walkTime += dt;
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
