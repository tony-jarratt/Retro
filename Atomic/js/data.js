'use strict';

// The castle: the ground floor, a cellar and a tower joined by staircases, nine rocket parts and moving blocks.

// ---- rules ----
const TIME_LIMIT = 900;        // seconds until the flying saucers arrive
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

// ---- the nine missing rocket parts ----
const PARTS = [
  { id: 'nose', name: 'Nose Cone', room: 'observatory', flavour: 'Pointy end first, as the manual insists.' },
  { id: 'fins', name: 'Stabiliser Fins', room: 'range', flavour: 'For stability. And a little bit of style.' },
  { id: 'panel', name: 'Control Panel', room: 'control', flavour: 'Forty-one switches. Nobody knows what thirty of them do.' },
  { id: 'tank', name: 'Fuel Tank', room: 'reactor', flavour: 'Smells faintly of the future.' },
  { id: 'porthole', name: 'Porthole', room: 'greenhouse', flavour: 'A window onto space, or at least onto the garden.' },
  { id: 'battery', name: 'Atomic Battery', room: 'vault', flavour: 'It glows. It is probably fine.' },
  { id: 'gyro', name: 'Gyroscope', room: 'boiler', flavour: 'It knows which way is up, which is more than can be said for the Professor.' },
  { id: 'legs', name: 'Landing Legs', room: 'depot', flavour: 'For arriving with dignity.' },
  { id: 'antenna', name: 'Radio Antenna', room: 'radio', flavour: 'So the rocket can phone home.' },
];

// ---- the rooms ----
// Each room has two layers of text, one row per line (y goes down, x goes right).
// height:  . ground (level 0)   1 2 3 raised floor   # a wall (a bank of machinery)   x a pit
// objects: . nothing  * crate  $ rocket part  R the rocket  S where you start
//          > < ^ v a patrolling robot, starting to move east, west, north or south
//          ~ a steam vent   a-f a pressure plate   A-F the door that plate opens
//          o a dud plate: looks like a pressure plate, opens nothing, and is wired to the mains (costs a life)
//          @ a transmitter pad: step or hop onto it and you are sent to the other pad with the same mark (see marks)
// A pit is x (the floor beneath it is level 0), y (level 1) or z (level 2): filling it leaves a floor at that level.
// exits: the edge (N/E/S/W) and the position along it (x for N and S, y for E and W) of each doorway.
// A doorway leads to the neighbouring room on that side, which must have a matching doorway.
// Filmation additions:
//   h i j in height are half steps (levels 0.5, 1.5, 2.5), for staircases you can walk up without jumping.
//   to: { E: 'roomid' } sends a doorway to a room on another floor (a staircase) instead of the neighbour on the map;
//       that room's opposite doorway must lead back, at the same position.
//   marks: { 'x,y': 'ring' | 'cross' | 'triangle' } symbols on plates, so that real and dud plates can be told apart,
//       and on transmitter pads, which come in twins with the same mark.
//   clue: { side, at, mark } a plaque painted on a wall (N/E/S/W, `at` along it like an exit) showing the real plate's
//       mark. Put it on the south or east wall and it is out of sight until the room is turned.
//   area: which floor a room is on (ground, cellar or tower). The cellar and the tower are drawn on the map far away
//       from the ground floor (rows 20+ and 10+) so their rooms never neighbour it by accident.
//   movers: the moving blocks (see film-move.js):
//     { type: 'lift', x, y, low, high, period, offset }   a block that rises and falls between two levels
//     { type: 'slider', x, y, dir, dist, period, offset, top }   a block that glides back and forth dist squares
//     { type: 'crumble', x, y, level }   a block over a pit that gives way a moment after you stand on it
//     { type: 'crusher', x, y, period, offset }   a block that slams down onto a square from above
//     { type: 'ride', x, y, dir, dist, mark, trap }   a block that waits until you stand on it, then glides dist squares
//         and stays there (stand on it again to go back; with nobody on it, it comes to your side of the room).
//         A trap ride stops wherever it gets to and crumbles; its mark says which ride is which (see clue).
const ROOMS = [
  { id: 'airlock', name: 'Airlock', col: 0, row: 0, exits: { E: 3, S: 1 },
    caption: 'Welcome to Atomic Castle. Please wipe your feet and leave your common sense at the door.',
    height: ['....#..', '....#..', '....#..', '....x..', '....#..', '....#..', '....#..'],
    objects: ['.......', '.......', '.......', 'S.*....', '.......', '.......', '.......'] },
  { id: 'repair', name: 'Robot Repair Bay', col: 1, row: 0, exits: { W: 3, E: 3, S: 4 },
    caption: 'These robots are perfectly safe. Provided they do not touch you. Step onto a transmitter pad and it sends you to its twin. The robots have worked that out too.',
    height: ['#.......#', '.........', '.........', '.........', '.........', '.........', '#.......#'],
    objects: ['......@..', '..v......', '.........', '.........', '.........', '.....^...', '..@......'],
    marks: { '6,0': 'ring', '2,6': 'ring' } },
  { id: 'observatory', name: 'Observatory', col: 2, row: 0, exits: { W: 3, E: 4, S: 4 },
    caption: 'The Professor studied the stars here. The stairs to the telescope are round the back, where they do not spoil the view. Z and X turn the room.',
    height: ['...#h1i2.', '...#.2222', '...#.2222', '...#.2222', '...#.....', '...#.....', '.........', '.........', '.........'],
    objects: ['.........', '.........', '.......$.', '.........', '.........', '.........', '.........', '.........', '.........'] },
  { id: 'range', name: 'Ray-Gun Range', col: 3, row: 0, exits: { W: 4, S: 7, E: 8 },
    caption: 'Target practice, 1957. The targets have since formed a union. The plate that opens their gate is somewhere it cannot be shot at.',
    height: ['.........', '..#####..', '..#...#..', '..#...#..', '..##.##..', '.........', '.........', '...x.....', '.........'],
    objects: ['...a.....', '.........', '....$....', '.........', '....A....', '.......*.', '..>......', '......*..', '.........'] },
  { id: 'cafeteria', name: 'Cafeteria', col: 0, row: 1, exits: { N: 1, E: 3, S: 4 },
    caption: "Today's special is a pit. It is not on the menu, but it is on the floor.",
    height: ['......##.', '......##.', '......##.', '......xx.', '......##.', '......##.', '......##.'],
    objects: ['.........', '.........', '..*......', '.........', '..*......', '.........', '.........'] },
  { id: 'launch', name: 'Launch Bay', col: 1, row: 1, exits: { N: 4, W: 3, E: 3, S: 4 },
    caption: 'The rocket is missing nine parts. Please bring them back. Politely.',
    height: ['.........', '.#.....#.', '.........', '.........', '.........', '.........', '.........', '.#.....#.', '.........'],
    objects: ['.........', '.........', '.........', '.........', '....R....', '.........', '.........', '.........', '.........'] },
  { id: 'control', name: 'Control Room', col: 2, row: 1, exits: { N: 4, W: 3, E: 3, S: 4 },
    caption: 'Do not press the red button. Or the other red button. Or, frankly, any button. The wiring diagram is on the wall.',
    height: ['.........', '.........', '.........', '.........', '####.####', '.........', '.......##', '.........', '......#..'],
    objects: ['.........', '.........', '..a...*..', '.........', '....A....', '.........', '....~*...', '......B.$', '.b.o.o...'],
    marks: { '1,8': 'triangle', '3,8': 'ring', '5,8': 'cross' }, clue: { side: 'E', at: 1, mark: 'triangle' } },
  { id: 'reactor', name: 'Reactor', col: 3, row: 1, exits: { W: 3, N: 7, S: 7 },
    caption: 'Perfectly safe. The Professor said so, shortly before the incident.',
    height: ['.....##..', '.....##..', '.....##..', '........3', '.......33', '.........', '.....##..', '.....##..', '.....##..'],
    objects: ['.........', '.........', '.........', '.....~~$.', '..*..~~..', '.....~~..', '.........', '.........', '.........'] },
  { id: 'store', name: 'Storeroom', col: 0, row: 2, exits: { N: 4, E: 3, W: 5 },
    caption: 'Everything the Professor ever bought, never used, and never threw away. Two of the plates are jokes. The receipt says which.',
    height: ['.....##..', '11...##..', '11...##..', '11.......', '11...##..', '.....##..', '.....##..'],
    objects: ['.........', '...o.....', '.........', '..o*.A...', '.........', '...a.....', '.........'],
    marks: { '3,1': 'ring', '2,3': 'cross', '3,5': 'triangle' }, clue: { side: 'S', at: 2, mark: 'triangle' } },
  { id: 'lounge', name: 'Lounge', col: 1, row: 2, exits: { N: 4, W: 3, E: 3 },
    caption: 'A relaxing space. One plate opens the door. The other two are wired to the mains. The Professor put up a sign, somewhere.',
    height: ['......#..', '......#..', '......#..', '.........', '......#..', '......#..', '......#..'],
    objects: ['.........', '.........', '....*....', '......A..', '.........', '.o.o.a...', '.........'],
    marks: { '1,5': 'cross', '3,5': 'triangle', '5,5': 'ring' }, clue: { side: 'S', at: 4, mark: 'ring' } },
  { id: 'greenhouse', name: 'Greenhouse', col: 2, row: 2, exits: { N: 4, W: 3, E: 3 },
    caption: 'Giant plants. The Professor\'s idea. The plants were not consulted.',
    height: ['.....xxxx', '.....x113', '.....x111', '.....x111', '.....xxxx', '.........', '.........', '.#.....#.', '.........'],
    objects: ['.........', '........$', '.......*.', '.........', '.........', '..^......', '.........', '.........', '.........'] },
  { id: 'vault', name: 'Vault', col: 3, row: 2, exits: { N: 7, W: 3 },
    caption: 'The Atomic Battery is in here. Mind the gap. And the glow.',
    height: ['...1111..', '..x1111x3', '..x1#11x3', '..x11y1x3', '..x1#11x3', '..x1111x3', '.........', '.........', '.........'],
    objects: ['.........', '.........', '.....*...', '....*...$', '.........', '.........', '.........', '.........', '.........'] },
  // ---- staircases off the ground floor ----
  { id: 'cellarstairs', name: 'Cellar Stairs', area: 'ground', col: -1, row: 2, exits: { E: 5, W: 5 }, to: { W: 'clanding' },
    caption: 'Mind the stairs. The Professor installed them himself, from a kit.',
    height: ['.......', '.#.#...', '.......', '.....33', '.....33', '.h1i2j3', '.h1i2j3'],
    objects: ['.......', '.......', '.......', '.......', '.......', '.......', '.......'] },
  { id: 'towerstairs', name: 'Tower Stairs', area: 'ground', col: 4, row: 0, exits: { W: 8, N: 5 }, to: { N: 'tlanding' },
    caption: 'The stairs to the tower. The crushing blocks are there to discourage salesmen.',
    height: ['.....33', '.#.#.33', '.....33', '.....jj', '.....22', '.....ii', '.....11', '.....hh', '.......'],
    objects: ['.......', '.......', '.......', '.......', '.......', '.......', '.......', '.......', '.......'],
    movers: [{ type: 'crusher', x: 5, y: 4, period: 2.6 }, { type: 'crusher', x: 6, y: 4, period: 2.6 }] },

  // ---- the tower ----
  { id: 'tlanding', name: 'Tower Landing', area: 'tower', col: 0, row: 10, exits: { S: 5, E: 2 }, to: { S: 'towerstairs' },
    caption: 'Moving floors. The Professor called them "labour-saving". Only one of them goes all the way. The sign is behind you.',
    height: ['.#.....#.', '.........', '.........', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx', '.........', '.#.....#.'],
    objects: ['.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........'],
    movers: [
      { type: 'ride', x: 1, y: 6, dir: 'N', dist: 3, mark: 'cross' },
      { type: 'ride', x: 4, y: 6, dir: 'N', dist: 1, mark: 'ring', trap: true },
      { type: 'ride', x: 7, y: 6, dir: 'N', dist: 1, mark: 'triangle', trap: true },
    ],
    clue: { side: 'S', at: 2, mark: 'cross' } },
  { id: 'battlements', name: 'Battlements', area: 'tower', col: 1, row: 10, exits: { W: 2, E: 2, S: 4 },
    caption: 'The battlements. A guard patrols behind the parapet, where the saucers cannot see it. Neither can you.',
    height: ['#.#.#.#.#', '.........', '.........', '3333.3333', 'xxxx.xxxx'],
    objects: ['.........', '.........', '.>.......', '.........', '.........'] },
  { id: 'bridge', name: 'Crumbling Bridge', area: 'tower', col: 2, row: 10, exits: { W: 2, E: 2 },
    caption: 'The bridge has been replaced by three obliging blocks. Two of them are less obliging than they look. The Professor left a note.',
    height: ['..xxxxx..', '..xxxxx..', '..xxxxx..', '..xxxxx..', '..xxxxx..', '..xxxxx..', '..xxxxx..'],
    objects: ['.........', '.........', '.........', '.........', '.........', '.........', '.........'],
    movers: [
      { type: 'ride', x: 2, y: 1, dir: 'E', dist: 2, mark: 'cross', trap: true },
      { type: 'ride', x: 2, y: 3, dir: 'E', dist: 2, mark: 'ring', trap: true },
      { type: 'ride', x: 2, y: 5, dir: 'E', dist: 4, mark: 'triangle' },
    ],
    clue: { side: 'S', at: 4, mark: 'triangle' } },
  { id: 'radio', name: 'Radio Room', area: 'tower', col: 3, row: 10, exits: { W: 2, S: 4 },
    caption: 'The Professor once heard Venus on this set. He built a matter transmitter to pop over and ask. Step onto a pad and it sends you to its twin.',
    height: ['..#...#..', '###...###', '.........', '.........', '.........', '.........', '.........', '......###', '......#..'],
    objects: ['@@.....@.', '.........', '.........', '.........', '..@...@..', '.........', '.<.......', '.........', '.......@$'],
    marks: { '0,0': 'ring', '1,0': 'triangle', '7,0': 'cross', '2,4': 'ring', '6,4': 'cross', '7,8': 'triangle' } },
  { id: 'clock', name: 'Clock Room', area: 'tower', col: 1, row: 11, exits: { N: 4, E: 4 },
    caption: 'The clock room. The pendulums keep perfect time, and anyone who gets in their way.',
    height: ['xxxx.xxxx', 'xxxx.xxxx', 'xxxx.xxxx', 'xxxx.xxxx', 'xxxx.....', 'xxxxxxxxx'],
    objects: ['.........', '.........', '.........', '.........', '.........', '.........'],
    movers: [{ type: 'slider', x: 1, y: 1, dir: 'E', dist: 6, period: 3, top: 1 }, { type: 'slider', x: 7, y: 3, dir: 'W', dist: 6, period: 3, top: 1, offset: 1.5 }] },
  { id: 'shaft', name: 'Lift Shaft', area: 'tower', col: 2, row: 11, exits: { W: 4, E: 4 },
    caption: 'The lifts were installed in 1952 and have been going up and down ever since.',
    height: ['...xxx222', '...xxx222', '...xxx222', '...xxx222', '...xxx222', '...xxx222', '...xxx222', '...xxx222', '...xxx222'],
    objects: ['.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........'],
    movers: [{ type: 'lift', x: 3, y: 4, low: 0, high: 2, period: 4 }, { type: 'lift', x: 5, y: 4, low: 0, high: 2, period: 4, offset: 2 }] },
  { id: 'loft', name: 'Pigeon Loft', area: 'tower', col: 3, row: 11, exits: { W: 4, N: 4 },
    caption: 'The pigeons left in 1955, taking the good seed with them.',
    height: ['.#.....#.', '.........', 'xxxxxxxxx', 'xxxxxxxxx', '.........', '.........', '.........', '.#.....#.', '.........'],
    objects: ['.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........'],
    movers: [{ type: 'slider', x: 1, y: 3, dir: 'E', dist: 6, period: 6 }] },

  // ---- the cellar ----
  { id: 'clanding', name: 'Cellar Landing', area: 'cellar', col: 2, row: 20, exits: { E: 5, W: 4, S: 4 }, to: { E: 'cellarstairs' },
    caption: 'The cellars. Damp, dark, and full of things the Professor would rather you did not mention.',
    height: ['.......##', '........#', '.........', '.........', '.........', '.........', '.........', '.........', '#........'],
    objects: ['.........', '.........', '.........', '..~......', '..~......', '..~......', '.........', '.........', '.........'] },
  { id: 'dungeon', name: 'Dungeon Corridor', area: 'cellar', col: 1, row: 20, exits: { E: 4, W: 2, S: 1 },
    caption: 'Built by the previous owner, who had a very different idea of fun. Not all of the floor behind the rubble is floor.',
    height: ['x...x...x', 'x.x.x.x.x', '..x...x..', '33333333.', '.........'],
    objects: ['.........', '.........', '.........', '.........', '...>.....'] },
  { id: 'wine', name: 'Wine Cellar', area: 'cellar', col: 0, row: 20, exits: { E: 2, S: 4 },
    caption: 'The Professor\'s finest vintage, Chateau Isotope 1951, glows gently in the dark. The wine rack is too high to climb, so the cellarman uses the transmitter. One pad goes to the cupboard.',
    height: ['..####...', '##.......', '.........', '.........', '.........', '222222222', '.........', '.#.....#.', '.........'],
    objects: ['@........', '.........', '.........', '..>...@..', '.........', '.........', '.........', '...@.@...', '.........'],
    marks: { '0,0': 'ring', '3,7': 'ring', '6,3': 'cross', '5,7': 'cross' } },
  { id: 'boiler', name: 'Boiler Room', area: 'cellar', col: 0, row: 21, exits: { N: 4, S: 4 },
    caption: 'It runs on coal, atomic power and the Professor\'s optimism.',
    height: ['.........', '.........', '.....33..', '.....33..', '.........', '.........', '.##......', '.#.......', '.........'],
    objects: ['.........', '.........', '......$~.', '........~', '.......~.', '.........', '.........', '.........', '.........'],
    movers: [{ type: 'lift', x: 7, y: 3, low: 0, high: 3, period: 4 }] },
  { id: 'chute', name: 'Coal Chute', area: 'cellar', col: 1, row: 21, exits: { N: 1, E: 1, S: 4 },
    caption: 'Coal goes down it. So, if you are careless, do you.',
    height: ['.........', '.........', '.........', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx', '.........', '.........', '.........'],
    objects: ['.........', '.........', '.........', '.........', '.........', '.........', '.........', '>........', '.........'],
    movers: [{ type: 'slider', x: 4, y: 5, dir: 'N', dist: 2, period: 4.5 }] },
  { id: 'pump', name: 'Pump Room', area: 'cellar', col: 2, row: 21, exits: { N: 4, W: 1, S: 4 },
    caption: 'The pumps pump. Nobody knows what. Do not stand still.',
    height: ['.........', '.#.....#.', '.........', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx', '.........', '.#.....#.', '.........'],
    objects: ['.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........'],
    movers: [0, 1, 2].map((i) => ({ type: 'lift', x: 4, y: 3 + i, low: -1.5, high: 1, period: 3, offset: i })) },
  { id: 'flooded', name: 'Flooded Store', area: 'cellar', col: 0, row: 22, exits: { N: 4, E: 4 },
    caption: 'Not actually flooded. The Professor just liked the name. The stockroom is staff only, through the transmitter. Step on the pad and it sends you to its twin.',
    height: ['......xx.', '......xx.', '######xx.', '......xx.', '.#....xx.', '...#..xx.', '......xx.', '..#...xx.', '......xx.'],
    objects: ['.........', '.@.......', '.........', '.........', '...*.....', '.........', '.*.......', '.........', '@........'],
    marks: { '1,1': 'ring', '0,8': 'ring' } },
  { id: 'furnace', name: 'Furnace', area: 'cellar', col: 1, row: 22, exits: { W: 4, N: 4, E: 4 },
    caption: 'The furnace. Hot, heavy and in a hurry.',
    height: ['xxxx.xxxx', 'xxxx.xxxx', 'xxxx.xxxx', 'xxxx.xxxx', '.........'],
    objects: ['.........', '.........', '.........', '.........', '.........'],
    movers: [[4, 1], [4, 3], [2, 4], [6, 4]].map(([x, y], i) => ({ type: 'crusher', x, y, period: 2.2, offset: i * 0.55 })) },
  { id: 'depot', name: 'Fuel Depot', area: 'cellar', col: 2, row: 22, exits: { W: 4, N: 4 },
    caption: 'Rocket fuel, stored safely over a bottomless pit. Three trolleys, one island. The delivery note is on the wall.',
    height: ['.........', '.........', '.........', '.xxxxxxx.', '.xxxxxxx.', '.xxx.xxx.', '.xxxxxxx.', '.xxxxxxx.', '.........'],
    objects: ['.........', '.........', '.........', '.........', '.........', '....$....', '.........', '.........', '.........'],
    movers: [
      { type: 'ride', x: 4, y: 3, dir: 'S', dist: 1, mark: 'ring' },
      { type: 'ride', x: 1, y: 6, dir: 'E', dist: 2, mark: 'cross', trap: true },
      { type: 'ride', x: 7, y: 4, dir: 'W', dist: 2, mark: 'triangle', trap: true },
    ],
    clue: { side: 'E', at: 1, mark: 'ring' } },
];
const MARK_KINDS = ['ring', 'cross', 'triangle'];
// the floor level of each raised-floor character in a room's height rows
const LEVEL_CHARS = { 1: 1, 2: 2, 3: 3, h: 0.5, i: 1.5, j: 2.5 };
const ROOM_INDEX = Object.fromEntries(ROOMS.map((r, i) => [r.id, i]));

// Check the room tables once at load, so a typo fails loudly here instead of during a game.
function checkRooms() {
  const fail = (room, msg) => { throw new Error(`room "${room.id}": ${msg}`); };
  ROOMS.forEach((room) => {
    const H = room.height.length, W = room.height[0].length;
    if (room.objects.length !== H) fail(room, `objects has ${room.objects.length} rows, height has ${H}`);
    room.height.forEach((row, y) => { if (row.length !== W) fail(room, `height row ${y} is ${row.length} wide, not ${W}`); });
    room.objects.forEach((row, y) => { if (row.length !== W) fail(room, `objects row ${y} is ${row.length} wide, not ${W}`); });
    room.width = W; room.rows = H;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const hc = room.height[y][x], oc = room.objects[y][x];
      if (!'.123hij#xyz'.includes(hc)) fail(room, `unknown height character "${hc}" at ${x},${y}`);
      if (!'.*$RS><^v~abcdefABCDEFo@'.includes(oc)) fail(room, `unknown object character "${oc}" at ${x},${y}`);
      if (hc === '#' && oc !== '.') fail(room, `an object at ${x},${y} is inside a wall`);
      if ('xyz'.includes(hc) && oc !== '.') fail(room, `an object at ${x},${y} is in a pit`);
    }
    for (const [dir, at] of Object.entries(room.exits)) {
      const edgeLen = (dir === 'N' || dir === 'S') ? W : H;
      if (!(at >= 0 && at < edgeLen)) fail(room, `exit ${dir} at ${at} is off the edge`);
      const [x, y] = exitTile(room, dir, at);
      if (room.height[y][x] === '#' || 'xyz'.includes(room.height[y][x])) fail(room, `exit ${dir} at ${at} is blocked by a wall or pit`);
      if (room.objects[y][x] === '@') fail(room, `exit ${dir} at ${at} is on a transmitter pad`);
    }
    const doors = new Set(), plates = new Set();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const oc = room.objects[y][x];
      if ('abcdef'.includes(oc)) plates.add(oc.toUpperCase());
      if ('ABCDEF'.includes(oc)) doors.add(oc);
    }
    for (const d of doors) if (!plates.has(d)) fail(room, `door ${d} has no plate ${d.toLowerCase()}`);
    for (const [key, mark] of Object.entries(room.marks || {})) {
      const [x, y] = key.split(',').map(Number);
      if (!MARK_KINDS.includes(mark)) fail(room, `unknown mark "${mark}" at ${key}`);
      if (!(y >= 0 && y < H && x >= 0 && x < W) || !'abcdefo@'.includes(room.objects[y][x])) fail(room, `mark at ${key} is not on a plate or pad`);
    }
    const padMarks = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (room.objects[y][x] !== '@') continue;
      const mark = (room.marks || {})[`${x},${y}`];
      if (!mark) fail(room, `the transmitter pad at ${x},${y} has no mark`);
      padMarks.push(mark);
    }
    for (const mark of new Set(padMarks)) if (padMarks.filter((m) => m === mark).length !== 2) fail(room, `there should be two ${mark} pads, not ${padMarks.filter((m) => m === mark).length}`);
    if (room.clue) {
      const c = room.clue, len = (c.side === 'N' || c.side === 'S') ? W : H;
      if (!'NESW'.includes(c.side) || !(c.at >= 1 && c.at < len - 1)) fail(room, `clue on ${c.side} at ${c.at} is not on a wall`);
      const shown = [...Object.values(room.marks || {}), ...(room.movers || []).map((m) => m.mark)];
      if (!shown.includes(c.mark)) fail(room, `clue shows "${c.mark}", which no plate or block has`);
      if (room.exits[c.side] !== undefined && Math.abs(room.exits[c.side] - c.at) <= 1) fail(room, `clue on ${c.side} is in the way of the doorway`);
    }
    for (const p of plates) if (!doors.has(p)) fail(room, `plate ${p.toLowerCase()} has no door ${p}`);
  });
  const neighbour = (room, dir) => (room.to && room.to[dir] ? ROOMS.find((r) => r.id === room.to[dir]) : null) || ROOMS.find((r) => r.col === room.col + { E: 1, W: -1, N: 0, S: 0 }[dir] && r.row === room.row + { N: -1, S: 1, E: 0, W: 0 }[dir]);
  for (const room of ROOMS) {
    for (const [dir, at] of Object.entries(room.exits)) {
      const n = neighbour(room, dir);
      if (!n) fail(room, `exit ${dir} leads nowhere (no room on that side)`);
      if (n.exits[OPPOSITE[dir]] !== at) fail(room, `exit ${dir} at ${at} does not match ${n.id}'s ${OPPOSITE[dir]} exit (${n.exits[OPPOSITE[dir]]})`);
      if (room.to && room.to[dir] && (!n.to || n.to[OPPOSITE[dir]] !== room.id)) fail(room, `staircase ${dir} to ${n.id} does not lead back`);
    }
  }
  const MOVER_FIELDS = { lift: ['low', 'high', 'period'], slider: ['dir', 'dist', 'period'], crumble: [], crusher: ['period'], ride: ['dir', 'dist'] };
  for (const room of ROOMS) {
    if (!['ground', 'cellar', 'tower', undefined].includes(room.area)) fail(room, `unknown area "${room.area}"`);
    for (const m of room.movers || []) {
      const need = MOVER_FIELDS[m.type];
      if (!need) fail(room, `unknown moving block "${m.type}"`);
      for (const f of need) if (m[f] === undefined) fail(room, `${m.type} at ${m.x},${m.y} has no ${f}`);
      const tiles = [[m.x, m.y]];
      if (m.mark !== undefined && !MARK_KINDS.includes(m.mark)) fail(room, `${m.type} at ${m.x},${m.y} has unknown mark "${m.mark}"`);
      if (m.type === 'slider' || m.type === 'ride') for (let i = 1; i <= m.dist; i++) tiles.push([m.x + DIRS[m.dir][0] * i, m.y + DIRS[m.dir][1] * i]);
      for (const [x, y] of tiles) {
        if (!(x >= 0 && y >= 0 && x < room.width && y < room.rows)) fail(room, `${m.type} at ${m.x},${m.y} goes off the room at ${x},${y}`);
        if (room.height[y][x] === '#') fail(room, `${m.type} at ${m.x},${m.y} runs into a wall at ${x},${y}`);
        if (room.objects[y][x] !== '.') fail(room, `${m.type} at ${m.x},${m.y} is on top of an object at ${x},${y}`);
      }
      if (m.type === 'crumble' && !'xyz'.includes(room.height[m.y][m.x])) fail(room, `crumbling block at ${m.x},${m.y} is not over a pit`);
    }
  }
  for (const part of PARTS) {
    const room = ROOMS.find((r) => r.id === part.room);
    if (!room) throw new Error(`part "${part.id}" is in unknown room "${part.room}"`);
    const n = room.objects.join('').split('$').length - 1;
    if (n !== 1) fail(room, `should hold exactly one part, has ${n}`);
  }
}
checkRooms();

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
  gyro: 'Gyroscope collected. It knows which way is up, which is more than can be said for the Professor.',
  legs: 'Landing legs collected. For arriving with dignity.',
  antenna: 'Radio antenna collected. So the rocket can phone home.',
};
const HIT_LINES = [
  'Remember, children: robots are only dangerous when they are in the same room as you.',
  'That is a fairly standard way to lose twenty seconds.',
  'The Professor would have called that "a learning experience".',
  'Back to the door. Dignity is optional.',
];
