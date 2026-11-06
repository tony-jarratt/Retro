// LEVEL 1: THE WORKSHOPS, sublevel 6, 32 cells wide and 24 tall. The
// bottom of the complex, and the first thing you play: it teaches the gun
// and the robots one idea at a time, then makes you race home.
//
// THE ROUTE IN: the lift bay (top left, safe: ammo and a repair kit) ->
// the machine shop -> the foreman's office (the red keycard and the burst
// module) -> the service corridor and its red door -> the loading bay ->
// dispatch, where the LIFT KEY is.
//
// THE BEATS:
//   - The first walker stands alone under a light with its back to you. Tap.
//   - The machine blocks are cover; the next walker stands by a drum stack
//     under a NO NAKED FLAME sign. One shot.
//   - Through a grille in the shop's west wall you can see the locker room,
//     and the night shift standing asleep in it: that's the way home.
//   - The foreman's office looks down on the shop through glass. Its walker
//     sees you and shoots the window out: glass only holds so long.
//   - The loading bay's tripwire is straight in front of you as you come in,
//     and it wakes the turret in the far corner. Look, and there's a way
//     round the crates. Or set off the drums either side of the turret.
//
// THE RACE BACK: taking the lift key sets the whole sublevel's alarm off,
// and everything still standing comes for you. Short and violent, through
// the locker room (the night shift's awake now) and its red door into the
// lift bay; or long, back the way you came, past whatever you left alive.
//
// THE SECRET: the paint store off the loading bay, ammo and a repair kit,
// its door right beside the turret's nose.

LEVELS.push({
  id: 'workshops',
  name: 'THE WORKSHOPS',
  floor: -6,
  objective: 'liftkey',
  briefing: [
    'THE VERIDIAN GROUP COMPLEX WENT INTO LOCKDOWN',
    'THREE DAYS AGO. NOTHING HAS COME OUT SINCE.',
    'ITS SECURITY ROBOTS SHOOT ANYTHING THAT MOVES.',
    'THE LIFT UP NEEDS A KEY. DISPATCH HAS ONE.',
  ],

  rows: [
  // x: 0         1         2         3
  //    01234567890123456789012345678901
    '################################', //  0
    '#......#..............#........#', //  1  lift bay | machine shop | foreman's office
    'L......#..............#.......C#', //  2  the lift (x0)
    'L......D..............W.......C#', //  3  shop door (x7) | the office's window on the shop (x22)
    '#......#...HH....HH...W........#', //  4  machine blocks
    '#......#...HH....HH...#........#', //  5
    '#......#..............#........#', //  6
    '###D####..............#####D####', //  7  red door to the lockers (x3) | the office door (x27)
    '#......=..............#........#', //  8  locker room | grille (x7) | service corridor
    '#......=..............D........#', //  9  shop door to the corridor (x22)
    '#......#..............#........#', // 10
    '#......###PPPPP########........#', // 11  pipes along the shop's south wall
    '####D#CCCC#################D####', // 12  lockers -> dispatch (x4) | red door into the loading bay (x27)
    '#...........#..................#', // 13  dispatch | loading bay
    '#...........#..........HH......#', // 14  crates; the tripwire runs x25-30
    '#...........D..........HH......#', // 15  dispatch's door (x12)
    '#...........#..........HH......#', // 16
    '#...........#..........HH......#', // 17
    '#############..................#', // 18
    '#...........#..................#', // 19  the paint store (secret)
    '#...........#..................#', // 20
    '#...........D..................#', // 21  its door (x12), by the turret
    '#...........#..................#', // 22
    '################################', // 23
  ],

  lockedDoors: [
    { x: 3,  y: 7,  key: 'red' }, // lift bay <-> locker room: the short way home
    { x: 27, y: 12, key: 'red' }, // service corridor -> loading bay
  ],

  sprites: [
    // The machine shop: the drum stack the second walker stands by.
    { type: 'drum',  x: 18.5, y: 9.5 },
    { type: 'drum',  x: 19.5, y: 9.5 },
    { type: 'drum',  x: 20.5, y: 9.5 },
    { type: 'lamp',  x: 8.5,  y: 1.5 },
    // The loading bay: drums either side of the turret, and struts for cover.
    { type: 'drum',  x: 14.5, y: 21.5 },
    { type: 'drum',  x: 16.3, y: 21.5 }, // under 2 cells from the other, so one sets the other off
    { type: 'strut', x: 18.5, y: 17.5 },
    { type: 'strut', x: 26.5, y: 20.5 },
    { type: 'strut', x: 21.5, y: 13.5 },
    // Dispatch and the lockers.
    { type: 'lamp',  x: 10.5, y: 17.5, flicker: true },
  ],

  ceilingLights: [
    { x: 3,  y: 3 },                // lift bay
    { x: 10, y: 2 },                // over the first walker
    { x: 15, y: 6 },
    { x: 20, y: 8 },                // over the drums
    { x: 26, y: 3 },                // the office
    { x: 26, y: 10, flicker: true }, // the service corridor
    { x: 17, y: 15 },               // the loading bay
    { x: 27, y: 16 },
    { x: 20, y: 21 },
    { x: 5,  y: 15 },               // dispatch
    { x: 4,  y: 10, flicker: true }, // the locker room
    { x: 6,  y: 20 },               // the paint store
  ],

  // Robots (enemies.js): no smart ones yet, and no cameras. The night shift
  // in the locker room faces away from the grille.
  enemies: [
    { type: 'walker', x: 10.5, y: 2.5,  angle: 0 },           // the first: alone, lit, back to the door
    { type: 'scout',  x: 15.5, y: 8.5,  angle: -Math.PI / 2 },
    { type: 'walker', x: 19.5, y: 8.4,  angle: Math.PI },     // by the drums
    { type: 'walker', x: 25.5, y: 4.5,  angle: Math.PI },     // the office: watching the window
    { type: 'scout',  x: 28.5, y: 5.5,  angle: Math.PI },
    { type: 'walker', x: 19.5, y: 15.5, angle: -0.3 },        // the loading bay
    { type: 'scout',  x: 28.5, y: 19.5, angle: -Math.PI / 2 },
    { type: 'turret', x: 15.5, y: 21.5, angle: -Math.PI / 4 }, // asleep until the tripwire
    { type: 'walker', x: 6.5,  y: 15.5, angle: 0 },           // dispatch, facing its door
    // The night shift.
    { type: 'walker', x: 2.5,  y: 9.5,  angle: Math.PI },
    { type: 'walker', x: 5.5,  y: 10.5, angle: Math.PI / 2 },
    { type: 'scout',  x: 2.5,  y: 8.3,  angle: Math.PI },
  ],

  // Security zones (security.js): no cameras or terminals here, but the
  // zones say whose alarm is whose when the lift key goes.
  zones: [
    { id: 'liftbay',  x: 1,  y: 1,  w: 6,  h: 6 },
    { id: 'shop',     x: 8,  y: 1,  w: 14, h: 10 },
    { id: 'office',   x: 23, y: 1,  w: 8,  h: 6 },
    { id: 'corridor', x: 23, y: 8,  w: 8,  h: 4 },
    { id: 'lockers',  x: 1,  y: 8,  w: 6,  h: 4 },
    { id: 'dispatch', x: 1,  y: 13, w: 11, h: 5 },
    { id: 'bay',      x: 13, y: 13, w: 18, h: 10 },
    { id: 'store',    x: 1,  y: 19, w: 11, h: 4 },
  ],
  tripwires: [
    { x0: 25, x1: 30, y: 14, zone: 'bay' }, // straight across the way in: go round the crates
  ],

  pickups: [
    { type: 'ammo',     x: 5.5,  y: 1.5 },  // the lift bay: the first room's ammo...
    { type: 'repair',   x: 5.5,  y: 5.5 },  // ...and armour
    { type: 'ammo',     x: 8.5,  y: 6.5 },  // the shop
    { type: 'redkey',   x: 29.5, y: 1.5 },  // the foreman's office
    { type: 'burstmod', x: 29.5, y: 5.5 },
    { type: 'repair',   x: 29.5, y: 10.5 }, // the service corridor
    { type: 'ammo',     x: 29.5, y: 13.5 }, // the loading bay
    { type: 'ammo',     x: 22.5, y: 21.5 },
    { type: 'liftkey',  x: 2.5,  y: 14.5 }, // dispatch: the objective
    { type: 'ammo',     x: 10.5, y: 13.5 },
    { type: 'ammo',     x: 2.5,  y: 20.5 }, // the paint store
    { type: 'repair',   x: 2.5,  y: 21.5 },
    { type: 'ammo',     x: 6.5,  y: 19.5 },
  ],

  vents: [
    { x: 14, y: 7,  delay: 0.5 }, // the shop floor
    { x: 20, y: 2,  delay: 2.0 },
    { x: 25, y: 10, delay: 1.0 }, // the corridor: slip past
    { x: 19, y: 18, delay: 3.0 }, // the loading bay
  ],

  // The floor plan (plans.js): a wall monitor in the foreman's office, by the red
  // keycard: look before you plan the way home.
  plans: [
    { x: 31, y: 4, face: 'W' },
  ],

  decals: [
    { surface: 'wall', type: 'insignia',  x: 3,  y: 0,  face: 'S' },  // over the lift bay
    { surface: 'wall', type: 'spares',    x: 7,  y: 5,  face: 'E' },  // inside the shop door
    { surface: 'wall', type: 'noFlame',   x: 19, y: 11, face: 'N' },  // over the drums
    { surface: 'wall', type: 'coolant',   x: 12, y: 11, face: 'N' },
    { surface: 'wall', type: 'mechBay',   x: 20, y: 12, face: 'S' },  // the loading bay
    { surface: 'wall', type: 'maxLoad',   x: 31, y: 17, face: 'W' },
    { surface: 'wall', type: 'rearm',     x: 0,  y: 15, face: 'E' },  // dispatch
    // The night shift's tracks, from the lockers down to dispatch.
    ...footprints([[4, 11], [4, 13], [4, 14], [4, 15], [4, 16]], 2),
  ],

  playerStart: { x: 1.5, y: 2.5, angle: 0 },
});
