// The level: a plain 2D array, indexed MAP[row][col], i.e. MAP[y][x].
//   0          = empty floor
//   9          = a sliding door (DOOR_CELL); must sit in a gap in a straight wall
//   any other  = solid wall; the number picks its texture (TEXTURES in textures.js)
//
// Coordinates: x grows to the right, y grows DOWN (like screen pixels).
// One grid cell is 1 unit wide, so the player at (2.5, 2.5) stands in the
// middle of cell MAP[2][2].
//
// The outer border must be solid walls, so every ray is guaranteed to hit
// something. main.js checks this at startup.

const DOOR_CELL = 9;

const MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 0, 0, 1],
  [1, 0, 0, 3, 0, 0, 3, 0, 0, 0, 2, 0, 2, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0, 1],
  [1, 0, 0, 3, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 9, 1, 1, 1, 1, 1, 1, 9, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 4, 4, 4, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 4, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 2, 0, 1],
  [1, 0, 4, 0, 0, 0, 0, 0, 9, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 4, 0, 1, 0, 0, 2, 0, 2, 0, 1],
  [1, 0, 0, 0, 0, 0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

// Objects standing in the level. type is a key of SPRITE_TYPES in sprites.js.
// x and y are positions like the player's: (4.5, 4.5) is the middle of MAP[4][4].
const SPRITES = [
  // Top-left room, among the green pillars, and the corridor east of it
  { type: 'lamp',   x: 4.5,  y: 4.5 },
  { type: 'lamp',   x: 8.5,  y: 2.5 },
  { type: 'barrel', x: 8.5,  y: 1.5 },
  { type: 'barrel', x: 9.5,  y: 1.5 },
  { type: 'barrel', x: 14.5, y: 1.5 },
  // Bottom-left room
  { type: 'column', x: 4.5,  y: 11.5 },
  { type: 'column', x: 4.5,  y: 13.5 },
  { type: 'barrel', x: 1.5,  y: 13.5 },
  // Bottom-right room
  { type: 'lamp',   x: 11.5, y: 11.5 },
  { type: 'barrel', x: 14.5, y: 8.5 },
];

// Sentry robots (enemies.js): where each starts and which way it faces.
// angle uses the player's convention: 0 = east, PI/2 = south, -PI/2 = north.
const ENEMIES = [
  { x: 13.5, y: 5.5,  angle: Math.PI },      // far end of the first room, watching west
  { x: 11.5, y: 3.5,  angle: Math.PI / 2 },  // inside the red U, watching its opening
  { x: 5.5,  y: 9.5,  angle: -Math.PI / 2 }, // behind the first door, watching it
  { x: 11.5, y: 13.5, angle: -Math.PI / 2 }, // bottom-right room, watching north
];

// Where the player starts. angle is in radians: 0 faces +x (east), and
// because y points down, increasing the angle turns clockwise (to the right).
const PLAYER_START = { x: 2.5, y: 2.5, angle: 0 };
