// THE LEVEL: a hangar complex, 32 cells wide and 24 tall.
//
// It's drawn below as rows of characters, one character per cell, because a
// grid this size is far easier to design and read that way. LEGEND turns each
// character into the number the engine uses, so MAP ends up exactly the same
// plain 2D array of numbers as before: MAP[y][x], 0 = floor, anything else a wall.
//
// Coordinates: x grows to the right, y grows DOWN (like screen pixels).
// One cell is 1 unit wide, so the player at (2.5, 3.5) stands in the middle
// of cell MAP[3][2]. The outer border must be solid; main.js checks this.
//
// The route: start bay (top left) -> fuel depot -> pipe works, where the RED
// keycard is -> back to the red door from the start bay -> server room, where
// the BLUE keycard is -> blue doors -> the hangar hall along the bottom.
// The corridor and workshop in the middle link everything up.

const DOOR_CELL = 9;
const TERMINAL_CELL = 5;
const GLASS_CELL = 6;
const GRATE_CELL = 7;

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
};

const LEVEL = [
// x: 0         1         2         3
//    01234567890123456789012345678901
  '################################', //  0
  '#.......#..........#....P......#', //  1  start bay | fuel depot | pipe works
  '#.......#..........#....P......#', //  2
  '#.......D....HH....#....P..P...#', //  3
  '#.......#....HH....D....P..P...#', //  4
  '#.......#..........#....P..P...#', //  5
  '#.......T..........T.......P...#', //  6  terminals: depot (x8), pipe works (x19)
  '#.......#..........#.......P...#', //  7
  '####D##########D#########D######', //  8  red door (x4), to corridor (x15), to workshop (x25)
  '#............P...P.............#', //  9  server room | corridor | workshop
  '#............W...P.............#', // 10  window: corridor looks into the server room
  '#..C..C..C...W...P.......PP....#', // 11
  '#............P...D.......PP....#', // 12
  '#..C..C..C...P...P.......PP....#', // 13
  '#............T...P.............#', // 14  terminal: server room (x13), reached from the corridor
  '#............P...P.............#', // 15
  '#HHHHHDHHHHHHHHDHHHHHH===HHHHHH#', // 16  blue doors (x6, x15) into the hangar; grille (x22-24) from the workshop
  '#..............................#', // 17  hangar hall
  '#..............................#', // 18
  '#.........H.........H..........#', // 19
  'T.........H.........H..........#', // 20  terminal: hangar (x0)
  '#..............................#', // 21
  '#..............................#', // 22
  '################################', // 23
];

const MAP = LEVEL.map((row, y) => [...row].map((ch, x) => {
  if (!(ch in LEGEND)) throw new Error(`LEVEL row ${y}, column ${x}: "${ch}" is not in LEGEND.`);
  return LEGEND[ch];
}));

// Doors that need a keycard (doors.js). key is a colour in KEY_COLOURS (textures.js).
// x and y are CELL coordinates: { x: 4, y: 8 } is MAP[8][4].
const LOCKED_DOORS = [
  { x: 4,  y: 8,  key: 'red' },  // start bay down to the server room
  { x: 6,  y: 16, key: 'blue' }, // server room into the hangar
  { x: 15, y: 16, key: 'blue' }, // corridor into the hangar
];

// Objects standing in the level. type is a key of SPRITE_TYPES in sprites.js.
// x and y are positions like the player's: (4.5, 5.5) is the middle of MAP[5][4].
// Every lamp is also a light (lighting.js); flicker: true makes it stutter.
// Drums explode when shot (explosions.js), and set off any others nearby.
const SPRITES = [
  // Start bay
  { type: 'lamp',  x: 4.5,  y: 5.5 },
  // Fuel depot: drums in clusters, for chain reactions
  { type: 'drum',  x: 10.5, y: 1.5 },
  { type: 'drum',  x: 11.5, y: 1.5 },
  { type: 'drum',  x: 10.5, y: 2.5 },
  { type: 'drum',  x: 12.5, y: 6.5 },
  { type: 'drum',  x: 16.5, y: 6.5 },
  { type: 'drum',  x: 17.5, y: 6.5 },
  { type: 'drum',  x: 17.5, y: 5.5 },
  { type: 'lamp',  x: 11.5, y: 5.5, flicker: true },
  // Pipe works
  { type: 'lamp',  x: 28.5, y: 4.5 },
  { type: 'drum',  x: 21.5, y: 6.5 },
  { type: 'drum',  x: 22.5, y: 6.5 },
  // Server room
  { type: 'drum',  x: 1.5,  y: 9.5 },
  // Corridor
  { type: 'drum',  x: 14.5, y: 10.5 },
  { type: 'lamp',  x: 15.5, y: 14.5 },
  // Workshop
  { type: 'strut', x: 20.5, y: 10.5 },
  { type: 'strut', x: 20.5, y: 14.5 },
  { type: 'lamp',  x: 28.5, y: 10.5 },
  { type: 'drum',  x: 29.5, y: 13.5 },
  { type: 'drum',  x: 29.5, y: 14.5 },
  // Hangar hall
  { type: 'strut', x: 5.5,  y: 18.5 },
  { type: 'strut', x: 5.5,  y: 21.5 },
  { type: 'strut', x: 15.5, y: 18.5 },
  { type: 'strut', x: 15.5, y: 21.5 },
  { type: 'strut', x: 25.5, y: 18.5 },
  { type: 'strut', x: 25.5, y: 21.5 },
  { type: 'drum',  x: 13.5, y: 21.5 },
  { type: 'drum',  x: 14.5, y: 21.5 },
  { type: 'drum',  x: 23.5, y: 17.5 },
  { type: 'drum',  x: 24.5, y: 17.5 },
  { type: 'lamp',  x: 10.5, y: 17.5 },
  { type: 'lamp',  x: 20.5, y: 17.5 },
];

// Ceiling cells with a working strip light (lighting.js). Every other cell's
// fitting is dead. x and y are CELL coordinates here: { x: 3, y: 3 } is MAP[3][3].
// (Computer banks, MAP value 3, also give off a little green light by themselves.)
const CEILING_LIGHTS = [
  { x: 3,  y: 3 },                // start bay
  { x: 16, y: 3 },                // fuel depot
  { x: 21, y: 2 },                // pipe works, by the door in
  { x: 25, y: 7 },                // pipe works, above the door down: spills into the workshop
  { x: 7,  y: 15, flicker: true }, // server room: mostly lit by its screens
  { x: 15, y: 12, flicker: true }, // corridor
  { x: 15, y: 15 },               // corridor, by the blue door
  { x: 23, y: 10 },               // workshop
  { x: 28, y: 14 },               // workshop
  { x: 3,  y: 19 },               // hangar
  { x: 15, y: 20 },
  { x: 25, y: 20 },
  { x: 29, y: 22, flicker: true },
];

// Robots (enemies.js): type (a key of ROBOT_TYPES: walker, scout, heavy,
// turret), where each starts, and which way it faces.
// angle uses the player's convention: 0 = east, PI/2 = south, -PI/2 = north.
const ENEMIES = [
  // Fuel depot
  { type: 'walker', x: 16.5, y: 2.5,  angle: Math.PI },      // watching the door in from the start bay
  { type: 'scout',  x: 14.5, y: 6.5,  angle: -Math.PI / 2 },
  // Pipe works
  { type: 'walker', x: 22.5, y: 2.5,  angle: Math.PI },      // watching the door in from the depot
  { type: 'heavy',  x: 29.5, y: 2.5,  angle: Math.PI / 2 },  // guarding the red keycard
  { type: 'turret', x: 28.5, y: 1.5,  angle: Math.PI / 2 },  // asleep until the tripwire
  // Server room
  { type: 'walker', x: 10.5, y: 10.5, angle: Math.PI },
  { type: 'scout',  x: 4.5,  y: 14.5, angle: -Math.PI / 2 },
  // Workshop
  { type: 'heavy',  x: 28.5, y: 12.5, angle: Math.PI },
  // Hangar hall
  { type: 'walker', x: 12.5, y: 19.5, angle: -Math.PI / 2 },
  { type: 'scout',  x: 8.5,  y: 21.5, angle: -Math.PI / 2 },
  { type: 'walker', x: 18.5, y: 18.5, angle: Math.PI },
  { type: 'heavy',  x: 27.5, y: 20.5, angle: Math.PI },
  { type: 'scout',  x: 29.5, y: 17.5, angle: Math.PI / 2 },
  { type: 'turret', x: 10.5, y: 21.5, angle: -Math.PI / 2 }, // asleep until the corridor tripwire
  { type: 'turret', x: 20.5, y: 18.5, angle: Math.PI },
];

// SECURITY (security.js). Each zone is a rectangle of cells; cameras,
// tripwires and terminals each belong to one, and robots and turrets belong
// to whichever zone they're standing in.
const ZONES = [
  { id: 'depot',     x: 9,  y: 1,  w: 10, h: 7 },
  { id: 'pipeworks', x: 20, y: 1,  w: 11, h: 7 },
  { id: 'server',    x: 1,  y: 9,  w: 12, h: 7 },
  { id: 'workshop',  x: 18, y: 9,  w: 13, h: 7 },
  { id: 'hangar',    x: 1,  y: 17, w: 30, h: 6 },
];

// Cameras on poles. angle is the middle of their sweep. Seeing you alerts
// the walking robots in their zone. Shoot one, or use its zone's terminal.
const CAMERAS = [
  { x: 9.5,  y: 6.5,  angle: -0.6,      zone: 'depot' },
  { x: 1.5,  y: 12.5, angle: 0,         zone: 'server' },
  { x: 18.5, y: 9.5,  angle: 0.6,       zone: 'workshop' }, // no terminal for this one: shoot it
  { x: 1.5,  y: 17.5, angle: 0.5,       zone: 'hangar' },
  { x: 30.5, y: 21.5, angle: -2.6,      zone: 'hangar' },
];

// Tripwires: a laser across floor cells x0..x1 of row y, wall to wall.
// Breaking one wakes the turrets in its zone, which needn't be where the beam is.
const TRIPWIRES = [
  { x0: 25, x1: 26, y: 4,  zone: 'pipeworks' }, // the narrow gap between the pipe runs
  { x0: 14, x1: 16, y: 13, zone: 'hangar' },    // across the corridor: the hangar turrets hear you coming
];

// Security terminals: x, y is the 'T' wall cell. Walk up to one and its zone's
// cameras, tripwires and turrets shut down for good.
const TERMINALS = [
  { x: 8,  y: 6,  zone: 'depot' },     // in the start bay wall: you can switch the depot off before going in
  { x: 19, y: 6,  zone: 'pipeworks' }, // reachable from the depot side
  { x: 13, y: 14, zone: 'server' },    // in the corridor wall: sneak round before using the red door
  { x: 0,  y: 20, zone: 'hangar' },    // deep in the hangar, far left
];

// Things to collect (pickups.js): 'ammo' (+8), 'health' (+25), 'redkey', 'bluekey'.
// Destroyed robots also drop a 'clip' (+4) where they fall.
const PICKUPS = [
  { type: 'ammo',    x: 6.5,  y: 6.5 },  // start bay
  { type: 'ammo',    x: 9.5,  y: 1.5 },  // fuel depot, by the drums
  { type: 'health',  x: 25.5, y: 1.5 },  // pipe works, top of the gap
  { type: 'redkey',  x: 29.5, y: 6.5 },  // pipe works, far corner
  { type: 'ammo',    x: 20.5, y: 1.5 },  // pipe works
  { type: 'bluekey', x: 11.5, y: 14.5 }, // server room, far corner
  { type: 'health',  x: 1.5,  y: 14.5 }, // server room
  { type: 'ammo',    x: 16.5, y: 14.5 }, // corridor
  { type: 'ammo',    x: 29.5, y: 9.5 },  // workshop
  { type: 'health',  x: 18.5, y: 15.5 }, // workshop
  { type: 'health',  x: 1.5,  y: 22.5 }, // hangar
  { type: 'ammo',    x: 30.5, y: 22.5 }, // hangar
  { type: 'ammo',    x: 16.5, y: 22.5 }, // hangar, middle
];

// Where the player starts. angle is in radians: 0 faces +x (east), and
// because y points down, increasing the angle turns clockwise (to the right).
const PLAYER_START = { x: 2.5, y: 3.5, angle: 0 };
