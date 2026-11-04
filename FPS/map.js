// The level: a plain 2D array, indexed MAP[row][col], i.e. MAP[y][x].
//   0          = empty floor
//   any other  = solid wall; the number picks its colour (WALL_COLOURS in raycaster.js)
//
// Coordinates: x grows to the right, y grows DOWN (like screen pixels).
// One grid cell is 1 unit wide, so the player at (2.5, 2.5) stands in the
// middle of cell MAP[2][2].
//
// The outer border must be solid walls, so every ray is guaranteed to hit
// something. main.js checks this at startup.

const MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 0, 0, 1],
  [1, 0, 0, 3, 0, 0, 3, 0, 0, 0, 2, 0, 2, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0, 1],
  [1, 0, 0, 3, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 4, 4, 4, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 4, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 2, 0, 1],
  [1, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 4, 0, 1, 0, 0, 2, 0, 2, 0, 1],
  [1, 0, 0, 0, 0, 0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

// Where the player starts. angle is in radians: 0 faces +x (east), and
// because y points down, increasing the angle turns clockwise (to the right).
const PLAYER_START = { x: 2.5, y: 2.5, angle: 0 };
