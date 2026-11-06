// LEVEL 2: THE HANGAR, sublevel 5, 32 cells wide and 24 tall. The second
// industrial level: everything the workshops taught, and now the security
// network too: cameras and their alarms, smart robots that call for help,
// heavies and their rockets, drones from hives, two keycards, and the CORE.
//
// The route: start bay (top left) -> fuel depot -> pipe works, where the RED
// keycard is -> back to the red door from the start bay -> server room, where
// the BLUE keycard is -> blue doors -> the hangar hall along the bottom.
// The corridor and workshop in the middle link everything up.

LEVELS.push({
  id: 'industrial',
  name: 'THE HANGAR',
  // Where it is in the complex (lift.js: below 0 is a sublevel), and the
  // briefing shown as it opens (campaign.js).
  floor: -5,
  briefing: [
    'THE HANGAR. THE SECURITY NETWORK RUNS FROM HERE:',
    'CAMERAS, TURRETS, AND THE CORE THAT DRIVES THEM.',
    'A CAMERA THAT SEES YOU RAISES THE ALARM. A',
    'TERMINAL SHUTS ITS CAMERAS DOWN. KILL THE CORE.',
  ],

  rows: [
  // x: 0         1         2         3
  //    01234567890123456789012345678901
    '##############R#################', //  0  repair bay (x14): the fuel depot's
    '#.......#..........#....P......#', //  1  start bay | fuel depot | pipe works
    'L.......#..........#....P......#', //  2  exit lift (x0), behind you as you start
    'L.......D....HH....#....P..P...#', //  3
    '#.......#....HH....D....P..P...#', //  4
    '#.......#..........#....P..P...#', //  5
    '#.......T..........T.......P...#', //  6  terminals: depot (x8), pipe works (x19)
    '#.......#..........#.......P...#', //  7
    '####D##########D#########D######', //  8  red door (x4), to corridor (x15), to workshop (x25)
    '#............P...P.............R', //  9  server room | corridor | workshop; repair bay (x31): the workshop's
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
    '########KKK###############R#####', // 23  the security core (x8-10), at the back of the hangar; repair bay (x26)
  ],


  // Doors that need a keycard (doors.js). key is a colour in KEY_COLOURS (textures.js).
  // x and y are CELL coordinates: { x: 4, y: 8 } is MAP[8][4].
  lockedDoors: [
    { x: 4,  y: 8,  key: 'red' },  // start bay down to the server room
    { x: 6,  y: 16, key: 'blue' }, // server room into the hangar
    { x: 15, y: 16, key: 'blue' }, // corridor into the hangar
  ],

  // Objects standing in the level. type is a key of SPRITE_TYPES in sprites.js.
  // x and y are positions like the player's: (4.5, 5.5) is the middle of MAP[5][4].
  // Every lamp is also a light (lighting.js); flicker: true makes it stutter.
  // Drums explode when shot (explosions.js), and set off any others nearby.
  sprites: [
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
  ],

  // Ceiling cells with a working strip light (lighting.js). Every other cell's
  // fitting is dead. x and y are CELL coordinates here: { x: 3, y: 3 } is MAP[3][3].
  // (Computer banks, MAP value 3, also give off a little green light by themselves.)
  ceilingLights: [
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
  ],

  // Robots (enemies.js): type (a key of ENEMY_TYPES: walker, scout, heavy,
  // turret), where each starts, and which way it faces.
  // angle uses the player's convention: 0 = east, PI/2 = south, -PI/2 = north.
  // smart: true gives a walking robot the better brain (strafing, calling for
  // help) and its beacon and chevrons. (This level is a test sandbox, so the
  // smart ones are just a spread for trying them out.)
  enemies: [
    // Fuel depot
    { type: 'walker', x: 16.5, y: 2.5,  angle: Math.PI, smart: true }, // watching the door in from the start bay
    { type: 'scout',  x: 14.5, y: 6.5,  angle: -Math.PI / 2 },
    // Pipe works
    { type: 'walker', x: 22.5, y: 2.5,  angle: Math.PI },      // watching the door in from the depot
    { type: 'heavy',  x: 29.5, y: 2.5,  angle: Math.PI / 2 },  // guarding the red keycard
    { type: 'turret', x: 28.5, y: 1.5,  angle: Math.PI / 2 },  // asleep until the tripwire
    // Server room
    { type: 'walker', x: 10.5, y: 10.5, angle: Math.PI },
    { type: 'scout',  x: 4.5,  y: 14.5, angle: -Math.PI / 2, smart: true },
    // Workshop
    { type: 'heavy',  x: 28.5, y: 12.5, angle: Math.PI, smart: true },
    // Hangar hall
    { type: 'walker', x: 12.5, y: 19.5, angle: -Math.PI / 2 },
    { type: 'scout',  x: 8.5,  y: 21.5, angle: -Math.PI / 2 },
    { type: 'walker', x: 18.5, y: 18.5, angle: Math.PI, smart: true },
    { type: 'heavy',  x: 27.5, y: 20.5, angle: Math.PI },
    { type: 'scout',  x: 29.5, y: 17.5, angle: Math.PI / 2, smart: true },
    { type: 'turret', x: 10.5, y: 21.5, angle: -Math.PI / 2 }, // asleep until the corridor tripwire
    { type: 'turret', x: 20.5, y: 18.5, angle: Math.PI },
  ],

  // SECURITY (security.js). Each zone is a rectangle of cells; cameras,
  // tripwires and terminals each belong to one, and robots and turrets belong
  // to whichever zone they're standing in.
  zones: [
    { id: 'depot',     x: 9,  y: 1,  w: 10, h: 7 },
    { id: 'pipeworks', x: 20, y: 1,  w: 11, h: 7 },
    { id: 'server',    x: 1,  y: 9,  w: 12, h: 7 },
    { id: 'workshop',  x: 18, y: 9,  w: 13, h: 7 },
    { id: 'hangar',    x: 1,  y: 17, w: 30, h: 6 },
  ],

  // Cameras on poles. angle is the middle of their sweep. Seeing you alerts
  // the walking robots in their zone. Shoot one, or use its zone's terminal.
  cameras: [
    { x: 9.5,  y: 6.5,  angle: -0.6,      zone: 'depot' },
    { x: 1.5,  y: 12.5, angle: 0,         zone: 'server' },
    { x: 18.5, y: 9.5,  angle: 0.6,       zone: 'workshop' }, // no terminal for this one: shoot it
    { x: 1.5,  y: 17.5, angle: 0.5,       zone: 'hangar' },
    { x: 30.5, y: 21.5, angle: -2.6,      zone: 'hangar' },
  ],

  // Tripwires: a laser across floor cells x0..x1 of row y, wall to wall.
  // Breaking one wakes the turrets in its zone, which needn't be where the beam is.
  tripwires: [
    { x0: 25, x1: 26, y: 4,  zone: 'pipeworks' }, // the narrow gap between the pipe runs
    { x0: 14, x1: 16, y: 13, zone: 'hangar' },    // across the corridor: the hangar turrets hear you coming
  ],

  // Security terminals: x, y is the 'T' wall cell. Walk up to one and its zone's
  // cameras, tripwires and turrets shut down for good.
  terminals: [
    { x: 8,  y: 6,  zone: 'depot' },     // in the start bay wall: you can switch the depot off before going in
    { x: 19, y: 6,  zone: 'pipeworks' }, // reachable from the depot side
    { x: 13, y: 14, zone: 'server' },    // in the corridor wall: sneak round before using the red door
    { x: 0,  y: 20, zone: 'hangar' },    // deep in the hangar, far left
  ],

  // POWER (power.js): it goes with the lockdown; the breaker is in the
  // workshop, on the long way home.
  breakers: [
    { x: 31, y: 11, face: 'W' },
  ],

  // LOCKDOWN (lockdown.js): the core down, bulkheads seal the hangar's west blue
  // door and the corridor's way up into the depot. The way home is the long one:
  // corridor -> workshop -> pipe works -> depot -> the start bay.
  lockdown: [
    { x: 6,  y: 16 },
    { x: 15, y: 8 },
  ],

  // Things to collect (pickups.js): 'ammo' (+8), 'repair' (+25 armour), 'redkey', 'bluekey',
  // 'charge' (the demolition charge: charge.js),
  // and fire-mode modules for your gun: 'burstmod' (found in the Workshops; and 'automod', though that
  // comes from heavies). Destroyed robots blow up and drop nothing, except
  // the first heavy you bring down: it leaves the automatic module.
  pickups: [
    { type: 'ammo',    x: 6.5,  y: 6.5 },  // start bay: the first room's ammo...
    { type: 'repair',  x: 1.5,  y: 6.5 },  // ...and armour
    { type: 'ammo',    x: 9.5,  y: 1.5 },  // fuel depot, by the drums
    { type: 'ammo',    x: 17.5, y: 1.5 },  // fuel depot, far corner, behind the walker watching the door
    { type: 'repair',  x: 25.5, y: 1.5 },  // pipe works, top of the gap
    { type: 'redkey',  x: 29.5, y: 6.5 },  // pipe works, far corner
    { type: 'ammo',    x: 20.5, y: 1.5 },  // pipe works
    { type: 'bluekey', x: 11.5, y: 14.5 }, // server room, far corner
    { type: 'repair',  x: 1.5,  y: 14.5 }, // server room
    { type: 'ammo',    x: 16.5, y: 14.5 }, // corridor
    { type: 'ammo',    x: 29.5, y: 9.5 },  // workshop
    { type: 'repair',  x: 18.5, y: 15.5 }, // workshop
    { type: 'charge',  x: 29.5, y: 15.5 }, // workshop, far corner: the demolition charge, for the core (charge.js)
    { type: 'repair',  x: 1.5,  y: 22.5 }, // hangar
    { type: 'ammo',    x: 30.5, y: 22.5 }, // hangar
    { type: 'ammo',    x: 16.5, y: 22.5 }, // hangar, middle
    { type: 'ammo',    x: 11.5, y: 10.5 }, // server room (robots drop nothing now: pickups.js)
    { type: 'ammo',    x: 21.5, y: 9.5 },  // workshop, by the door from the corridor
    // ARMOUR-PIERCING ROUNDS (ammo.js): first found here, through the depot door, in plain sight.
    { type: 'piercing', x: 9.5,  y: 6.5 },  // fuel depot, by its door: where you find the type
    { type: 'piercing', x: 29.5, y: 12.5 }, // workshop, by its repair bay
    { type: 'piercing', x: 24.5, y: 21.5 }, // hangar, near the core
  ],

  // Steam vents (steam.js): floor cells that blow scalding, sight-blocking
  // steam on a cycle. delay = seconds before the first burst's warning, so they
  // don't all go off together.
  vents: [
    { x: 15, y: 4,  delay: 0.5 },                               // fuel depot, out in the open
    { x: 15, y: 11, delay: 2.0 },                               // corridor: slip past at the sides
    { x: 22, y: 11, delay: 1.0 },                               // workshop: blinds the camera by the door
    { x: 18, y: 19, delay: 2.5 },                               // hangar, in front of the turret
    { x: 9,  y: 21, delay: 0.2 },                               // hangar, by the scout and the other turret
  ],

  // DRONES (drones.js). Packs hover in place until one sees you or their zone's
  // alarm goes off. Hives are wall panels (cell + face, as for decals) full of
  // drones, released when their zone's alarm goes off.
  dronePacks: [
    { x: 6.5,  y: 12.5, count: 6 },   // server room, among the computer banks
    { x: 28.5, y: 22.0, count: 5 },   // hangar, far corner
  ],
  hives: [
    { x: 31, y: 13, face: 'W', zone: 'workshop', count: 6 }, // the workshop camera sets this off
    { x: 20, y: 23, face: 'N', zone: 'hangar',   count: 6 }, // the hangar cameras set this off
  ],

  // Hand-placed DECALS (decals.js): the signs and scenes that tell a story. The
  // background wear (puddles under leaks, scorch by drums, rusty pipes) is
  // scattered by rules instead. type is a key of DECAL_TYPES.
  //   surface  'floor', 'ceiling' or 'wall'
  //   x, y     the CELL: a floor cell, or for 'wall' the wall cell itself
  //   face     walls only: which side of the wall cell, named by the way it
  //            looks: 'W' is the side you see from the cell to its west
  //   rot      floor/ceiling: quarter turns clockwise. Unturned, a footprint
  //            points north and a floor sign reads to someone facing north.
  //   mirror   optional: flip left to right (alternate feet in a trail)
  decals: [
    // Start bay: straight ahead as you start, and a mech's tracks to the door.
    { surface: 'wall', type: 'mechBay', x: 8, y: 1, face: 'W' },
    { surface: 'wall', type: 'maxLoad', x: 8, y: 2, face: 'W' },
    { surface: 'wall', type: 'insignia', x: 4, y: 0, face: 'S' },
    ...footprints([[2, 4], [3, 4], [4, 4], [5, 4], [6, 4]], 1),
    { surface: 'floor', type: 'puddle', x: 6, y: 2 }, // catching the signs and the strip light as you start
    // Fuel depot: a warning, and the pillar where it was ignored once.
    { surface: 'wall', type: 'noFlame', x: 13, y: 0, face: 'S' },
    { surface: 'wall', type: 'wallScorch', x: 13, y: 3, face: 'W' },
    { surface: 'floor', type: 'scorch', x: 12, y: 3 },
    // Pipe works
    { surface: 'wall', type: 'coolant', x: 24, y: 2, face: 'E' },
    { surface: 'wall', type: 'spares', x: 31, y: 5, face: 'W' },
    { surface: 'ceiling', type: 'stain', x: 26, y: 6 },
    { surface: 'floor', type: 'puddle', x: 26, y: 6 },
    // Server room and corridor
    { surface: 'wall', type: 'battleComp', x: 8, y: 8, face: 'S' },
    { surface: 'wall', type: 'toHangar', x: 17, y: 10, face: 'W' },
    // Workshop: a walker's tracks from the door down to the grille.
    { surface: 'wall', type: 'rearm', x: 31, y: 11, face: 'W' },
    ...footprints([[24, 9], [24, 10], [24, 11], [24, 12], [24, 13], [24, 14], [24, 15]], 2),
    // A fight at the hangar's blue door: scorched both sides.
    { surface: 'wall', type: 'wallScorch', x: 14, y: 16, face: 'N' },
    { surface: 'wall', type: 'wallScorch', x: 14, y: 16, face: 'S' },
    { surface: 'wall', type: 'wallScorch', x: 16, y: 16, face: 'S' },
    { surface: 'floor', type: 'scorch', x: 15, y: 15 },
    { surface: 'floor', type: 'scorch', x: 15, y: 17 },
    { surface: 'ceiling', type: 'scorch', x: 15, y: 17 },
    // Hangar: numbered bays, reading the right way as you come in heading south.
    { surface: 'floor', type: 'bay1', x: 7,  y: 19, rot: 2 },
    { surface: 'floor', type: 'bay2', x: 17, y: 19, rot: 2 },
    { surface: 'floor', type: 'bay3', x: 27, y: 19, rot: 2 },
    { surface: 'wall', type: 'insignia', x: 15, y: 23, face: 'N' },
  ],

  // Where the player starts. angle is in radians: 0 faces +x (east), and
  // because y points down, increasing the angle turns clockwise (to the right).
  playerStart: { x: 2.5, y: 3.5, angle: 0 },
});
