// LEVEL 2: THE LAB, 24 cells wide and 16 tall. A test sandbox, and for now a
// placeholder: it's built from the industrial sector's pieces until the lab
// gets its own look and its creatures (see DESIGN.md). The glass boxes are
// SPECIMEN TANKS: one floor cell walled in by glass, with pillars at the
// corners. Empty for now; one day, something will be in them.
//
// The route: start (top left) -> the tank hall (right) -> down to the lower
// lab -> the core at the back. The lift is behind you as you start.

LEVELS.push({
  id: 'lab',
  name: 'THE LAB',

  rows: [
  // x: 0         1         2
  //    012345678901234567890123
    '########################', //  0
    'L.........#............#', //  1  exit lift (x0)
    'L.........#..#W#..#W#..#', //  2  specimen tanks
    '#.........D..W.W..W.W..#', //  3
    '#.........#..#W#..#W#..#', //  4
    '#.........#............#', //  5
    '#####D######...........#', //  6
    '#..........#..#W#..#W#.#', //  7  more tanks
    '#..........D..W.W..W.W.#', //  8
    '#..........#..#W#..#W#.#', //  9
    '#..........#...........#', // 10
    '#..........######D######', // 11
    '#......................#', // 12  the lower lab
    '#......................#', // 13
    '#......................#', // 14
    '#########KKK############', // 15  the core (x9-11)
  ],

  sprites: [
    { type: 'lamp', x: 5.5,  y: 5.5, flicker: true },
    { type: 'strut', x: 6.5, y: 13.5 },
    { type: 'strut', x: 15.5, y: 13.5 },
    { type: 'drum', x: 3.5, y: 13.5 },
    { type: 'drum', x: 13.5, y: 14.5 },
  ],

  ceilingLights: [
    { x: 4, y: 2 },
    { x: 16, y: 1, flicker: true },
    { x: 17, y: 10 },
    { x: 5, y: 9, flicker: true },
    { x: 10, y: 13 },
    { x: 20, y: 13 },
  ],

  // Stand-ins until the lab's creatures exist.
  enemies: [
    { type: 'walker', x: 20.5, y: 5.5, angle: Math.PI },
    { type: 'scout',  x: 8.5,  y: 9.5, angle: -Math.PI / 2 },
    { type: 'turret', x: 10.5, y: 13.5, angle: -Math.PI / 2 },
  ],

  zones: [
    { id: 'lab', x: 1, y: 1, w: 22, h: 14 },
  ],
  cameras: [
    { x: 22.5, y: 10.5, angle: -2.4, zone: 'lab' },
  ],
  tripwires: [
    { x0: 12, x1: 22, y: 10, zone: 'lab' }, // across the hall, before the way down: it wakes the core's turret
  ],

  pickups: [
    { type: 'ammo',   x: 8.5,  y: 1.5 },
    { type: 'repair', x: 22.5, y: 1.5 },
    { type: 'ammo',   x: 1.5,  y: 10.5 },
    { type: 'burstmod', x: 12.5, y: 5.5 },
  ],

  vents: [
    { x: 16, y: 5, delay: 0.5 },
  ],

  playerStart: { x: 2.5, y: 3.5, angle: 0 },
});
