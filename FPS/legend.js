// THE CELL LEGEND, shared by every level, and the list of levels.
//
// A level's map is drawn as rows of characters, one per cell, because a grid
// is far easier to design and read that way. LEGEND turns each character into
// the number the engine uses, so MAP ends up a plain 2D array of numbers:
// MAP[y][x], 0 = floor, anything else a wall.
//
// Coordinates: x grows to the right, y grows DOWN (like screen pixels).
// One cell is 1 unit wide, so the player at (2.5, 3.5) stands in the middle
// of cell MAP[3][2]. The outer border must be solid; main.js checks this.
//
// Each level is a file in levels/ that adds itself to LEVELS. map.js then
// picks one (see there) and lays it out for the rest of the game.

const DOOR_CELL = 9;
const TERMINAL_CELL = 5;
const GLASS_CELL = 6;
const GRATE_CELL = 7;
const CORE_CELL = 8;
const LIFT_CELL = 10;

const LEGEND = {
  '.': 0,         // floor
  '#': 1,         // riveted steel plates
  'H': 2,         // hazard bulkhead
  'C': 3,         // computer bank (animated; gives off a little green light)
  'P': 4,         // pipes
  'T': TERMINAL_CELL, // security terminal set into the wall (see TERMINALS below)
  'D': DOOR_CELL, // sliding blast door: must sit in a gap in a straight wall
  'W': GLASS_CELL, // window of wired glass: see through, stops bullets, shatters (panels.js)
  '=': GRATE_CELL, // steel bar grille: see and shoot through, can't walk through
  'K': CORE_CELL,  // the security core: destroy it (core.js). Several K cells are one core.
  'L': LIFT_CELL,  // the exit lift: reach it once the core is down, and the level is done
};

// Every level, in the order you play them. Each levels/*.js file pushes one.
const LEVELS = [];

// A trail of footprint decals, one per cell, alternating feet (for DECALS).
const footprints = (cells, rot) => cells.map(([x, y], n) => ({ surface: 'floor', type: 'footprint', x, y, rot, mirror: n % 2 === 1 }));
