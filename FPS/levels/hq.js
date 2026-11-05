// LEVEL 3: THE HQ, 28 cells wide and 22 tall. A test sandbox. The company's
// headquarters, where the plant virus got out of the atrium garden: offices
// going green, daylight through the skylights, and the staff still at work,
// in a way. Its enemies are the INFECTED (infected.js): suits that grab and
// hold on, and get back up unless you finish them on the floor; and
// bloomers, rooted where they stood, that burst in clouds of spores
// (spores.js) when you come close, or when the sprinklers water them
// (sprinklers.js); and the pollinators, packs of infected moths circling the
// skylights, that your muzzle flash brings down on you (pollinators.js).
//
// The route: the lift and the front desk (top left) -> the open-plan office
// -> through the atrium garden -> the boardroom at the back, where the
// mother plant has taken root. The executive suite (top right) is optional:
// the demolition charge is in the office at the back of it.

LEVELS.push({
  id: 'hq',
  name: 'THE HQ',
  floor: 12,
  briefing: [
    "HEAD OFFICE. THE ATRIUM GARDEN WAS THE CHAIRMAN'S",
    'PRIDE. THE STAFF NEVER WENT HOME.',
    'FINISH THEM ON THE FLOOR, OR THEY GET UP.',
    'AND MIND THE FLOWERS.',
  ],
  theme: 'hq',              // floor, ceiling and lighting (map.js)
  objective: 'motherplant', // the K cells are the mother plant (core.js)

  // o = office wall, v = overgrown (legend.js). W is glass: the office partitions.
  rows: [
  // x: 0         1         2
  //    0123456789012345678901234567
    'oooooooooooooooooooooooooooo', //  0
    'o.....o..........o.........o', //  1  front desk | open-plan office | exec suite lounge
    'L.....o..........o.........o', //  2  exit lift (x0)
    'L.....D..........D.........o', //  3
    'o.....o..........o.........o', //  4
    'o.....W..........ooooDoooooo', //  5  glass partition (x6) | the exec office's door (x21)
    'o.....W..........o.........o', //  6  the exec office: the charge
    'o.....o..........o.........o', //  7
    'o.....o..........o.........o', //  8
    'ooDoooooooDooooooooooooooooo', //  9  two ways down into the atrium (x2, x10)
    'v..........................v', // 10  the atrium garden
    'v..........................v', // 11
    'v....vv...........vv.......v', // 12  planters
    'v....vv...........vv.......v', // 13
    'v..........................v', // 14
    'v..........................v', // 15
    'v..........................v', // 16
    'vvvvvvvvvvvvvDvvvvvvvvvvvvvv', // 17  the boardroom's door (x13)
    'oooooo................oooooo', // 18  the boardroom
    'oooooo................oooooo', // 19
    'oooooo................oooooo', // 20
    'ooooooooooooKKKooooooooooooo', // 21  the mother plant (x12-14)
  ],

  // Office furniture: desks with their terminals still on, and the potted
  // plants that started it all (sprites.js).
  sprites: [
    { type: 'plant', x: 5.5,  y: 1.5 },  // front desk
    { type: 'desk',  x: 3.5,  y: 4.5 },
    // Open plan: two rows of desks.
    { type: 'desk',  x: 9.5,  y: 3.5 },
    { type: 'desk',  x: 12.5, y: 3.5 },
    { type: 'desk',  x: 15.5, y: 3.5 },
    { type: 'desk',  x: 9.5,  y: 6.5 },
    { type: 'desk',  x: 12.5, y: 6.5 },
    { type: 'plant', x: 16.5, y: 8.5 },
    // Exec suite.
    { type: 'plant', x: 26.5, y: 1.5 },
    { type: 'desk',  x: 24.5, y: 7.5 },
    { type: 'plant', x: 18.5, y: 8.5 },
    // The atrium.
    { type: 'plant', x: 2.5,  y: 14.5 },
    { type: 'plant', x: 11.5, y: 12.5 },
    { type: 'plant', x: 14.5, y: 14.5 },
    { type: 'plant', x: 24.5, y: 11.5 },
    { type: 'plant', x: 25.5, y: 15.5 },
    // Two drums of cleaning solvent, left at the bottom of the atrium. Shoot
    // them from the doorway (x10, y9) and the blast sets the sprinklers off.
    { type: 'drum',  x: 10.5, y: 16.5 },
    { type: 'drum',  x: 11.5, y: 16.5 },
    // The boardroom.
    { type: 'plant', x: 6.5,  y: 18.5 },
    { type: 'plant', x: 21.5, y: 18.5 },
  ],

  // Skylights: the theme's warm daylight (map.js). None of them flicker:
  // daylight doesn't, and an unlit cell's ceiling is plain tiles.
  ceilingLights: [
    { x: 3, y: 2 },
    { x: 9, y: 2 },
    { x: 14, y: 5 },
    { x: 10, y: 8 },
    { x: 22, y: 2 },
    { x: 24, y: 6 },
    { x: 3, y: 11 },
    { x: 9, y: 14 },
    { x: 14, y: 11 },
    { x: 15, y: 16 },
    { x: 21, y: 14 },
    { x: 25, y: 11 },
    { x: 9, y: 19 },
    { x: 18, y: 19 },
  ],

  // THE INFECTED (infected.js). They hear your shots like any creature, and
  // see you sooner in the light. Shoot one down and it's only down: finish it.
  enemies: [
    // The open-plan office, at their desks.
    { type: 'suit', x: 11.5, y: 2.5,  angle: Math.PI },
    { type: 'suit', x: 14.5, y: 6.5,  angle: Math.PI / 2 },
    { type: 'suit', x: 8.5,  y: 8.5,  angle: 0 },
    // The exec suite.
    { type: 'suit', x: 24.5, y: 3.5,  angle: Math.PI },
    { type: 'suit', x: 21.5, y: 7.5,  angle: -Math.PI / 2 },
    // The atrium: a crowd in the garden.
    { type: 'suit', x: 8.5,  y: 11.5, angle: Math.PI / 2 },
    { type: 'suit', x: 9.5,  y: 15.5, angle: -Math.PI / 2 },
    { type: 'suit', x: 16.5, y: 15.5, angle: Math.PI },
    { type: 'suit', x: 22.5, y: 11.5, angle: Math.PI },
    { type: 'suit', x: 22.5, y: 15.5, angle: Math.PI },
    // The boardroom: the board, still in session.
    { type: 'suit', x: 10.5, y: 19.5, angle: -Math.PI / 2 },
    { type: 'suit', x: 16.5, y: 19.5, angle: -Math.PI / 2 },
    // BLOOMERS, rooted. One just inside the exec suite, waiting for whoever
    // comes through the door; two by each of the atrium's planters; one
    // beside the mother plant.
    { type: 'bloomer', x: 19.5, y: 4.5,  angle: Math.PI },
    { type: 'bloomer', x: 7.5,  y: 12.5, angle: 0 },
    { type: 'bloomer', x: 4.5,  y: 13.5, angle: 0 },
    { type: 'bloomer', x: 17.5, y: 13.5, angle: 0 },
    { type: 'bloomer', x: 20.5, y: 12.5, angle: 0 },
    { type: 'bloomer', x: 17.5, y: 20.5, angle: 0 },
  ],

  // POLLINATORS (pollinators.js): packs of moths, each circling a skylight
  // (put them on a ceiling light's cell). A shot in plain view of them, or
  // coming too close, brings the whole pack. A small one over the open-plan
  // desks; the big one in the atrium, where the automatic module is; one
  // over the boardroom.
  moths: [
    { x: 9.5,  y: 2.5,  count: 4 },
    { x: 14.5, y: 11.5, count: 7 },
    { x: 18.5, y: 19.5, count: 5 },
  ],

  // SPRINKLER heads (sprinklers.js), floor cells under them. The atrium's
  // six are one system, over the bloomers by the planters; the boardroom
  // has its own.
  sprinklers: [
    { x: 4, y: 11 }, { x: 7, y: 14 }, { x: 13, y: 12 },
    { x: 19, y: 11 }, { x: 18, y: 15 }, { x: 24, y: 13 },
    { x: 13, y: 19 }, { x: 17, y: 19 },
  ],

  // The infected drop nothing, so, as in the lab, the ammo comes in crates.
  pickups: [
    { type: 'ammocrate', x: 1.5,  y: 7.5 },  // behind the front desk
    { type: 'burstmod',  x: 16.5, y: 1.5 },  // open plan, far corner
    { type: 'ammo',      x: 7.5,  y: 1.5 },
    { type: 'repair',    x: 26.5, y: 4.5 },  // exec lounge
    { type: 'charge',    x: 26.5, y: 7.5 },  // the exec office: the demolition charge (charge.js)
    { type: 'ammocrate', x: 18.5, y: 6.5 },
    { type: 'automod',   x: 1.5,  y: 16.5 }, // atrium, far corner
    { type: 'ammocrate', x: 26.5, y: 10.5 },
    { type: 'repair',    x: 13.5, y: 10.5 },
    { type: 'ammo',      x: 7.5,  y: 18.5 }, // boardroom
  ],

  // Signs, and fallen leaves drifting through the atrium. (More leaves and
  // damp are scattered by the rules in decals.js.)
  decals: [
    // Facing you as you start: the company's name over the front desk.
    { surface: 'wall', type: 'company',    x: 6,  y: 2,  face: 'W' },
    { surface: 'wall', type: 'frontDesk',  x: 6,  y: 4,  face: 'W' },
    { surface: 'wall', type: 'growWithUs', x: 17, y: 7,  face: 'W' },
    { surface: 'wall', type: 'execSuite',  x: 17, y: 2,  face: 'E' },
    { surface: 'wall', type: 'atrium',     x: 9,  y: 9,  face: 'N' },
    { surface: 'wall', type: 'boardRoom',  x: 5,  y: 19, face: 'E' },
    { surface: 'floor', type: 'leaves', x: 12, y: 11 },
    { surface: 'floor', type: 'leaves', x: 13, y: 13 },
    { surface: 'floor', type: 'leaves', x: 4,  y: 15 },
    { surface: 'floor', type: 'leaves', x: 20, y: 15 },
    { surface: 'floor', type: 'leaves', x: 13, y: 16 },
  ],

  playerStart: { x: 1.5, y: 3.5, angle: 0 },
});
