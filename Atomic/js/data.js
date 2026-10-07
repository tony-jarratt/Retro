'use strict';

// ---- view (isometric projection) ----
const VIEW_W = 1024, VIEW_H = 688;
const TILE_W = 64, TILE_H = 32, LEVEL_H = 22; // a tile is 64 wide and 32 tall on screen; each height level is 22 pixels

// ---- rules ----
const TIME_LIMIT = 600;        // seconds until the flying saucers arrive
const HIT_PENALTY = 20;        // seconds lost when a robot or a steam vent catches you
const RESET_PENALTY = 10;      // seconds lost for resetting a room
const CARRY_MAX = 3;           // rocket parts you can carry at once
const STEP_TIME = 0.16;        // seconds per step
const HOP_TIME = 0.30;         // seconds per hop
const ROBOT_STEP = 0.7;        // seconds per square for a patrolling robot
const VENT = { off: 2.2, warn: 0.6, on: 1.2 }; // a steam vent's cycle, in seconds
const INVULN = 1.5;            // seconds you cannot be hit again after being caught
const MAX_STACK = 3;           // most crates on one square
const MAX_LEVEL = 3;

// directions: N is up the page of the map (y goes down), so N moves up-right on screen
const DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };

// ---- the six missing rocket parts ----
const PARTS = [
  { id: 'nose', name: 'Nose Cone', room: 'observatory', flavour: 'Pointy end first, as the manual insists.' },
  { id: 'fins', name: 'Stabiliser Fins', room: 'range', flavour: 'For stability. And a little bit of style.' },
  { id: 'panel', name: 'Control Panel', room: 'control', flavour: 'Forty-one switches. Nobody knows what thirty of them do.' },
  { id: 'tank', name: 'Fuel Tank', room: 'reactor', flavour: 'Smells faintly of the future.' },
  { id: 'porthole', name: 'Porthole', room: 'greenhouse', flavour: 'A window onto space, or at least onto the garden.' },
  { id: 'battery', name: 'Atomic Battery', room: 'vault', flavour: 'It glows. It is probably fine.' },
];

// ---- the rooms ----
// Each room has two layers of text, one row per line (y goes down, x goes right).
// height:  . ground (level 0)   1 2 3 raised floor   # a wall (a bank of machinery)   x a pit
// objects: . nothing  * crate  $ rocket part  R the rocket  S where you start
//          > < ^ v a patrolling robot, starting to move east, west, north or south
//          ~ a steam vent   a-f a pressure plate   A-F the door that plate opens
// A pit is x (the floor beneath it is level 0), y (level 1) or z (level 2): filling it leaves a floor at that level.
// exits: the edge (N/E/S/W) and the position along it (x for N and S, y for E and W) of each doorway.
// A doorway leads to the neighbouring room on that side, which must have a matching doorway.
const ROOMS = [
  { id: 'airlock', name: 'Airlock', col: 0, row: 0, exits: { E: 3, S: 1 },
    caption: 'Welcome to Atomic Castle. Please wipe your feet and leave your common sense at the door.',
    height: ['....#..', '....#..', '....#..', '....x..', '....#..', '....#..', '....#..'],
    objects: ['.......', '.......', '.......', 'S.*....', '.......', '.......', '.......'] },
  { id: 'repair', name: 'Robot Repair Bay', col: 1, row: 0, exits: { W: 3, E: 3, S: 4 },
    caption: 'These robots are perfectly safe. Provided they do not touch you.',
    height: ['#.......#', '.........', '.........', '.........', '.........', '.........', '#.......#'],
    objects: ['.........', '...v.....', '.........', '.........', '.........', '.....^...', '.........'] },
  { id: 'observatory', name: 'Observatory', col: 2, row: 0, exits: { W: 3, E: 4, S: 4 },
    caption: 'The Professor studied the stars here. And, occasionally, the neighbours.',
    height: ['...#.....', '...#..222', '...#..222', '...#..222', '...#.....', '...#.....', '.........', '.........', '.........'],
    objects: ['.........', '.........', '.......$.', '.........', '.........', '.........', '.*.......', '.........', '.........'] },
  { id: 'range', name: 'Ray-Gun Range', col: 3, row: 0, exits: { W: 4, S: 7 },
    caption: 'Target practice, 1957. The targets have since formed a union.',
    height: ['.........', '..#####..', '..#...#..', '..#...#..', '..##.##..', '.........', '.........', '...x.....', '.........'],
    objects: ['.........', '.........', '....$....', '.........', '....A....', '.......*.', '..>......', '.a....*..', '.........'] },
  { id: 'cafeteria', name: 'Cafeteria', col: 0, row: 1, exits: { N: 1, E: 3, S: 4 },
    caption: "Today's special is a pit. It is not on the menu, but it is on the floor.",
    height: ['......##.', '......##.', '......##.', '......xx.', '......##.', '......##.', '......##.'],
    objects: ['.........', '.........', '..*......', '.........', '..*......', '.........', '.........'] },
  { id: 'launch', name: 'Launch Bay', col: 1, row: 1, exits: { N: 4, W: 3, E: 3, S: 4 },
    caption: 'The rocket is missing six parts. Please bring them back. Politely.',
    height: ['.........', '.#.....#.', '.........', '.........', '.........', '.........', '.........', '.#.....#.', '.........'],
    objects: ['.........', '.........', '.........', '.........', '....R....', '.........', '.........', '.........', '.........'] },
  { id: 'control', name: 'Control Room', col: 2, row: 1, exits: { N: 4, W: 3, E: 3, S: 4 },
    caption: 'Do not press the red button. Or the other red button. Or, frankly, any button.',
    height: ['.........', '.........', '.........', '.........', '####.####', '.........', '.......##', '.........', '......#..'],
    objects: ['.........', '.........', '..a...*..', '.........', '....A....', '.........', '.b..~*...', '......B.$', '.........'] },
  { id: 'reactor', name: 'Reactor', col: 3, row: 1, exits: { W: 3, N: 7, S: 7 },
    caption: 'Perfectly safe. The Professor said so, shortly before the incident.',
    height: ['.....##..', '.....##..', '.....##..', '.........', '.........', '.........', '.....##..', '.....##..', '.....##..'],
    objects: ['.........', '.........', '.........', '.....~~..', '..*..~~.$', '.....~~..', '.........', '.........', '.........'] },
  { id: 'store', name: 'Storeroom', col: 0, row: 2, exits: { N: 4, E: 3 },
    caption: 'Everything the Professor ever bought, never used, and never threw away.',
    height: ['.....##..', '11...##..', '11...##..', '11...xx..', '11...##..', '.....##..', '.....##..'],
    objects: ['.........', '.........', '.*.......', '.........', '.........', '.........', '.........'] },
  { id: 'lounge', name: 'Lounge', col: 1, row: 2, exits: { N: 4, W: 3, E: 3 },
    caption: 'A relaxing space. Sit down, put your feet up, and avoid the doors.',
    height: ['......#..', '......#..', '......#..', '.........', '......#..', '......#..', '......#..'],
    objects: ['.........', '.........', '....*....', '......A..', '.........', '..a......', '.........'] },
  { id: 'greenhouse', name: 'Greenhouse', col: 2, row: 2, exits: { N: 4, W: 3, E: 3 },
    caption: 'Giant plants. The Professor\'s idea. The plants were not consulted.',
    height: ['.....xxxx', '.....x113', '.....x111', '.....x111', '.....xxxx', '.........', '.........', '.#.....#.', '.........'],
    objects: ['.........', '........$', '.......*.', '.........', '.........', '..^......', '.........', '.........', '.........'] },
  { id: 'vault', name: 'Vault', col: 3, row: 2, exits: { N: 7, W: 3 },
    caption: 'The Atomic Battery is in here. Mind the gap. And the glow.',
    height: ['...1111..', '..x1111x3', '..x1#11x3', '..x11y1x3', '..x1#11x3', '..x1111x3', '.........', '.........', '.........'],
    objects: ['.........', '.........', '.....*...', '....*...$', '.........', '.........', '.........', '.........', '.........'] },
];
const ROOM_INDEX = Object.fromEntries(ROOMS.map((r, i) => [r.id, i]));

// Check the room tables once at load, so a typo fails loudly here instead of during a game.
(function checkRooms() {
  const fail = (room, msg) => { throw new Error(`room "${room.id}": ${msg}`); };
  ROOMS.forEach((room) => {
    const H = room.height.length, W = room.height[0].length;
    if (room.objects.length !== H) fail(room, `objects has ${room.objects.length} rows, height has ${H}`);
    room.height.forEach((row, y) => { if (row.length !== W) fail(room, `height row ${y} is ${row.length} wide, not ${W}`); });
    room.objects.forEach((row, y) => { if (row.length !== W) fail(room, `objects row ${y} is ${row.length} wide, not ${W}`); });
    room.width = W; room.rows = H;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const hc = room.height[y][x], oc = room.objects[y][x];
      if (!'.123#xyz'.includes(hc)) fail(room, `unknown height character "${hc}" at ${x},${y}`);
      if (!'.*$RS><^v~abcdefABCDEF'.includes(oc)) fail(room, `unknown object character "${oc}" at ${x},${y}`);
      if (hc === '#' && oc !== '.') fail(room, `an object at ${x},${y} is inside a wall`);
      if ('xyz'.includes(hc) && oc !== '.') fail(room, `an object at ${x},${y} is in a pit`);
    }
    for (const [dir, at] of Object.entries(room.exits)) {
      const edgeLen = (dir === 'N' || dir === 'S') ? W : H;
      if (!(at >= 0 && at < edgeLen)) fail(room, `exit ${dir} at ${at} is off the edge`);
      const [x, y] = exitTile(room, dir, at);
      if (room.height[y][x] === '#' || 'xyz'.includes(room.height[y][x])) fail(room, `exit ${dir} at ${at} is blocked by a wall or pit`);
    }
    const doors = new Set(), plates = new Set();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const oc = room.objects[y][x];
      if ('abcdef'.includes(oc)) plates.add(oc.toUpperCase());
      if ('ABCDEF'.includes(oc)) doors.add(oc);
    }
    for (const d of doors) if (!plates.has(d)) fail(room, `door ${d} has no plate ${d.toLowerCase()}`);
    for (const p of plates) if (!doors.has(p)) fail(room, `plate ${p.toLowerCase()} has no door ${p}`);
  });
  const neighbour = (room, dir) => ROOMS.find((r) => r.col === room.col + { E: 1, W: -1, N: 0, S: 0 }[dir] && r.row === room.row + { N: -1, S: 1, E: 0, W: 0 }[dir]);
  for (const room of ROOMS) {
    for (const [dir, at] of Object.entries(room.exits)) {
      const n = neighbour(room, dir);
      if (!n) fail(room, `exit ${dir} leads nowhere (no room on that side)`);
      if (n.exits[OPPOSITE[dir]] !== at) fail(room, `exit ${dir} at ${at} does not match ${n.id}'s ${OPPOSITE[dir]} exit (${n.exits[OPPOSITE[dir]]})`);
    }
  }
  for (const part of PARTS) {
    const room = ROOMS.find((r) => r.id === part.room);
    if (!room) throw new Error(`part "${part.id}" is in unknown room "${part.room}"`);
    const n = room.objects.join('').split('$').length - 1;
    if (n !== 1) fail(room, `should hold exactly one part, has ${n}`);
  }
})();

// The tile just inside the room for a doorway on a given edge.
function exitTile(room, dir, at) {
  if (dir === 'N') return [at, 0];
  if (dir === 'S') return [at, room.rows - 1];
  if (dir === 'W') return [0, at];
  return [room.width - 1, at];
}

// ---- captions: dry 1950s educational-film narrator ----
const PICKUP_LINES = {
  nose: 'Nose cone collected. Pointy end first, as the manual insists.',
  fins: 'Stabiliser fins collected. For stability, and a little style.',
  panel: 'Control panel collected. Forty-one switches. Nobody knows what thirty of them do.',
  tank: 'Fuel tank collected. Smells faintly of the future.',
  porthole: 'Porthole collected. A window onto space, or at least the garden.',
  battery: 'Atomic battery collected. It glows. It is probably fine.',
};
const HIT_LINES = [
  'Remember, children: robots are only dangerous when they are in the same room as you.',
  'That is a fairly standard way to lose twenty seconds.',
  'The Professor would have called that "a learning experience".',
  'Back to the door. Dignity is optional.',
];
