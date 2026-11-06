// LEVEL 3: SPECIMEN STORAGE, sublevel 4, 28 cells wide and 20 tall. The
// first of the lab's two levels: LURCHERS ONLY, and the rules that make
// creatures different from robots. They need light to see you, and they
// hear your gunfire. So this level is dark, and it rewards a quiet gun.
//
// THE ROUTE IN: the lift lobby (top left, safe) -> the long corridor ->
// down into the tank hall (dark, rows of specimen tanks, some of them
// occupied) -> the cold store -> the office, where the LIFT KEY is.
//
// THE BEATS:
//   - The first lurcher stands at the far end of the corridor, under a
//     light. It sees you long before it reaches you, and it's slow: back
//     off as it rears up, and shoot it.
//   - The tank hall is dark. You come in under the one light by the door,
//     which is where they'll see you: step out of it. Three of the tanks
//     hold something asleep. A drum stands between two of them: a blast
//     breaks glass.
//   - The cold store: two more, waiting in the dark: a PAIR, hunting together.
//
// THE RACE BACK: taking the lift key wakes the whole level, and EVERY TANK
// BREAKS. Back through the tank hall, with whatever was in the tanks now
// loose in it; or the long way, the pitch-dark service passage down the
// west side (two more in it, but no tanks), which comes out at the lobby.

LEVELS.push({
  id: 'storage',
  name: 'SPECIMEN STORAGE',
  floor: -4,
  theme: 'lab',
  objective: 'liftkey',
  briefing: [
    'SPECIMEN STORAGE. WHAT THEY BRED, THEY KEPT',
    'DOWN HERE, ASLEEP IN TANKS. NOT ALL OF IT STAYED.',
    "IT CAN'T SEE YOU IN THE DARK. IT CAN HEAR YOU.",
    'THE LIFT KEY IS IN THE COLD STORE OFFICE.',
  ],

  // t = tiled wall, b = bench cabinets, g = tank glass (legend.js). The tanks' pillars are steel (#).
  rows: [
  // x: 0         1         2
  //    0123456789012345678901234567
    'tttttttttttttttttttttttttttt', //  0
    't......ttttttttttttttttttttt', //  1  the lift lobby
    'L......t...................t', //  2  the lift (x0) | the long corridor
    'L......D...................t', //  3
    't......t...................t', //  4
    't......ttttttttttDtttttttttt', //  5  the way down into the tank hall (x17)
    'tttDtttt...................t', //  6  lobby -> service passage (x3) | the tank hall
    't......t.#g#.#g#.#g#.#g#...t', //  7  tanks: centres (10,8) (14,8) (18,8) (22,8)
    't......t.g.g.g.g.g.g.g.g...t', //  8
    't......t.#g#.#g#.#g#.#g#...t', //  9
    't......D...................t', // 10  service passage <-> tank hall (x7)
    't......t...#g#.#g#.#g#.....t', // 11  tanks: centres (12,12) (16,12) (20,12)
    't......t...g.g.g.g.g.g.....t', // 12
    't......t...#g#.#g#.#g#.....t', // 13
    't......t...................t', // 14  an aisle below the tanks (glass needs floor on both faces)
    't......ttttttttttttttttttDtt', // 15  tank hall -> cold store (x25)
    't......t.......t...........t', // 16  service passage | the office | the cold store
    't......D.......D...........t', // 17  office doors: west (x7), east (x15)
    't......t.......t...........t', // 18
    'ttttttttttttttttbbbbbbbbbbbt', // 19
  ],

  sprites: [
    { type: 'drum',  x: 12.5, y: 8.5 },  // between two tanks: a blast here breaks them both
    { type: 'strut', x: 24.5, y: 12.5 },
    { type: 'strut', x: 18.5, y: 16.5 },
  ],

  // Few lights, on purpose: in the dark they see you only close up.
  ceilingLights: [
    { x: 3,  y: 3 },                 // the lobby
    { x: 12, y: 3 },
    { x: 24, y: 3 },                 // over the first lurcher
    { x: 17, y: 6 },                 // the tank hall's door: step out of it
    { x: 25, y: 11, flicker: true },
    { x: 11, y: 16 },                // the office
    { x: 21, y: 17, flicker: true }, // the cold store
    { x: 3,  y: 8 },                 // the top of the service passage; the rest is dark
  ],

  enemies: [
    { type: 'lurcher', x: 24.5, y: 3.5,  angle: Math.PI },      // the first: lit, at the end of the corridor
    { type: 'lurcher', x: 24.5, y: 9.5,  angle: Math.PI },      // the tank hall
    { type: 'lurcher', x: 9.5,  y: 10.5, angle: 0 },
    { type: 'lurcher', x: 14.5, y: 8.5,  angle: 0, tank: true }, // asleep in the tanks
    { type: 'lurcher', x: 22.5, y: 8.5,  angle: Math.PI, tank: true },
    { type: 'lurcher', x: 16.5, y: 12.5, angle: Math.PI / 2, tank: true },
    // A PAIR (pair: same tag, creatures.js) hunts together: one calls the
    // other, and the further one swings round to your side.
    { type: 'lurcher', x: 19.5, y: 16.5, angle: Math.PI, pair: 'cold' },      // the cold store
    { type: 'lurcher', x: 24.5, y: 17.5, angle: Math.PI, pair: 'cold' },
    { type: 'lurcher', x: 3.5,  y: 12.5, angle: -Math.PI / 2, pair: 'passage' }, // the service passage
    { type: 'lurcher', x: 2.5,  y: 16.5, angle: -Math.PI / 2, pair: 'passage' },
  ],

  // Creatures drop nothing: the ammo comes in crates.
  pickups: [
    { type: 'ammocrate', x: 5.5,  y: 1.5 },  // the lobby: the first room's ammo...
    { type: 'repair',    x: 5.5,  y: 5.5 },  // ...and armour
    { type: 'ammo',      x: 8.5,  y: 4.5 },  // the corridor
    { type: 'ammocrate', x: 26.5, y: 6.5 },  // the tank hall, far corner
    { type: 'ammocrate', x: 26.5, y: 18.5 }, // the cold store
    { type: 'liftkey',   x: 9.5,  y: 16.5 }, // the office: the objective
    { type: 'repair',    x: 13.5, y: 18.5 },
    { type: 'ammo',      x: 26.5, y: 14.5 },  // the tank hall's bottom aisle
    { type: 'ammo',      x: 1.5,  y: 9.5 },  // the service passage
    { type: 'ammocrate', x: 1.5,  y: 17.5 },
    // INCENDIARY ROUNDS (ammo.js): first found here, at the end of the long corridor.
    { type: 'incendiary', x: 26.5, y: 2.5 },
    { type: 'incendiary', x: 17.5, y: 16.5 }, // the cold store
  ],

  vents: [
    { x: 23, y: 16, delay: 1.0 }, // the cold store: gas, which burns but hides nobody
  ],

  // CEILING VENTS (ambush.js): rattle and drip, then drop the membrane on you.
  // One is a decoy.
  drops: [
    { x: 13.5, y: 3.5 },               // the long corridor
    { x: 20.5, y: 2.5, decoy: true },  // ...and further along it, nothing. This time.
    { x: 3.5,  y: 12.5 },              // the service passage
    { x: 19.5, y: 17.5 },              // the cold store, just off its flickering light
  ],

  // No blackout here (owner): only the Hangar (with its lockdown) and the Offices lose their power.

  // The floor plan (plans.js): a whiteboard along the long corridor.
  plans: [
    { x: 14, y: 1, face: 'S' },
  ],

  decals: [
    { surface: 'wall', type: 'specimens', x: 27, y: 3,  face: 'W' },  // the end of the corridor
    { surface: 'wall', type: 'keepOut',   x: 16, y: 5,  face: 'N' },  // either side of the way down
    { surface: 'wall', type: 'biohazard', x: 18, y: 5,  face: 'N' },
    { surface: 'wall', type: 'biohazard', x: 24, y: 15, face: 'N' },
    // Something has dragged itself from the tanks towards the cold store.
    { surface: 'floor', type: 'slime', x: 15, y: 10 },
    { surface: 'floor', type: 'slime', x: 19, y: 10 },
    { surface: 'floor', type: 'slime', x: 23, y: 12 },
    { surface: 'floor', type: 'slime', x: 25, y: 13 },
  ],

  playerStart: { x: 1.5, y: 3.5, angle: 0 },
});
