// LEVEL 4: GENETICS, sublevel 3, 24 cells wide and 16 tall. The second lab
// level: the lurchers again, and now the spitters, the stalkers, the larvae
// and their pods, the BROOD MOTHER, and the BREEDING CHAMBER. It has the
// lab's own look (stained white tiles, bench cabinets, cold fluorescents,
// slime), its own objective, the BREEDING CHAMBER, and its own enemies: the
// lab's CREATURES (creatures.js), which hear you rather than watch for you,
// so there are no cameras, tripwires or terminals here. The
// glass boxes are SPECIMEN TANKS: one floor cell walled in by tank glass ('g'),
// with steel pillars at the corners. Two of them hold something asleep.
//
// The route: start (top left) -> the specimen hall (right) -> the one door
// down to the lower lab -> the chamber at the back. The side room (left)
// is optional. The lift is behind you as you start.

LEVELS.push({
  id: 'lab',
  name: 'GENETICS',
  floor: -3,
  briefing: [
    'GENETICS. THIS IS WHERE THEY WERE BRED.',
    'SOME SPIT ACID: MOVE WHEN THE FLOOR GLOWS.',
    'THE SMALL ONES COME IN SWARMS, AND THE PODS',
    'ON THE WALLS BURST AT A NOISE. BURN THE CHAMBER.',
  ],
  theme: 'lab',         // floor, ceiling and lighting (map.js)
  objective: 'chamber', // the K cells are the breeding chamber (core.js)

  // t = tiled wall, b = bench cabinets, g = tank glass (legend.js). The tanks' pillars are steel (#).
  rows: [
  // x: 0         1         2
  //    012345678901234567890123
    'tttttbbbtttttttttttttttt', //  0
    'L.........t............t', //  1  exit lift (x0)
    'L.........t..#g#..#g#..t', //  2  specimen tanks
    't.........D..g.g..g.g..t', //  3
    't.........t..#g#..#g#..t', //  4
    't.........t............t', //  5
    'tttttDtttttt...........t', //  6
    't..........t..#g#..#g#.t', //  7  more tanks
    'b..........D..g.g..g.g.b', //  8  side room (left) | specimen hall
    'b..........t..#g#..#g#.b', //  9
    't..........t...........t', // 10
    'tttttttttttttttttDtttttt', // 11  the only way down (x17)
    't......................t', // 12  the lower lab
    't......................t', // 13
    't......................t', // 14
    'tttbbbtttKKKtttbbbtttttt', // 15  the breeding chamber (x9-11)
  ],

  sprites: [
    { type: 'strut', x: 6.5, y: 13.5 },
    { type: 'strut', x: 15.5, y: 13.5 },
    { type: 'drum', x: 3.5, y: 13.5 },
    { type: 'drum', x: 13.5, y: 14.5 },
  ],

  // Fluorescent panels. Lit mostly from above, so plenty of them, and a few
  // that stutter.
  ceilingLights: [
    { x: 4, y: 2 },
    { x: 7, y: 4, flicker: true },
    { x: 16, y: 1, flicker: true },
    { x: 13, y: 5 },
    { x: 17, y: 10 },
    { x: 5, y: 9, flicker: true },
    { x: 3, y: 13 },
    { x: 10, y: 13 },
    { x: 20, y: 13, flicker: true },
  ],

  // THE CREATURES (creatures.js). They hear every shot (further in burst and
  // auto), and spot you much sooner under a light than in the dark.
  //   lurcher  melee: rears up, then lunges. Back off or sidestep.
  //   spitter  lobs acid where you stand. Keep moving; get behind it.
  // tank: true sleeps in a specimen tank until its glass breaks.
  enemies: [
    // The specimen hall: a lurcher out of sight of the door in, and a
    // spitter guarding the way down, under the light by the door.
    { type: 'lurcher', x: 21.5, y: 5.5,  angle: Math.PI },
    { type: 'spitter', x: 22.5, y: 10.5, angle: Math.PI },
    // In the tanks. A stray shot, a blast or the spitter's acid lets them out.
    { type: 'lurcher', x: 19.5, y: 3.5,  angle: Math.PI / 2, tank: true },
    { type: 'spitter', x: 15.5, y: 8.5,  angle: 0, tank: true },
    // The lower lab, round the chamber. Shooting down here wakes them all, and the pods.
    { type: 'lurcher', x: 4.5,  y: 12.5, angle: 0, pair: 'lower' },           // a pair: they hunt together
    { type: 'lurcher', x: 10.5, y: 13.5, angle: -Math.PI / 2, pair: 'lower' },
    // STALKERS (stalker.js): nearly invisible in the dark. One in the specimen
    // hall's dark end, past the tanks; one between the lower lab's lights.
    { type: 'stalker', x: 22.5, y: 8.5,  angle: Math.PI },
    { type: 'stalker', x: 16.5, y: 14.5, angle: Math.PI },
    // THE BROOD MOTHER (brood.js), rooted in her nest at the lower lab's far
    // end. Once she's awake she births larvae every few seconds until she
    // dies: her belly takes double. Burn the chamber while she pours them out.
    { type: 'brood',   x: 21.5, y: 13.5, angle: Math.PI },
    { type: 'spitter', x: 19.5, y: 13.5, angle: Math.PI },
  ],

  // LARVAE (larvae.js): a nest in the side room, lying on the automatic
  // module. You'll want auto for them, and auto is loud.
  larvae: [
    { x: 5.5, y: 8.5, count: 6 },
  ],
  // Breeding pods on the wall either side of the chamber (cell + face, as
  // for decals). A noise that reaches one bursts it; burning the chamber bursts both.
  pods: [
    { x: 7,  y: 15, face: 'N', count: 5 },
    { x: 13, y: 15, face: 'N', count: 5 },
  ],

  // LOCKDOWN (lockdown.js): the chamber burnt, a bulkhead seals the specimen
  // hall's door to the start room. The way home is through the side room, past
  // whatever's left of its larvae.
  lockdown: [
    { x: 10, y: 3 },
  ],

  // Creatures drop nothing, so the lab's ammo comes in big supply crates (+20).
  pickups: [
    { type: 'ammocrate', x: 8.5,  y: 1.5 },  // start room: the first room's ammo...
    { type: 'repair',    x: 1.5,  y: 5.5 },  // ...and armour
    { type: 'repair',    x: 22.5, y: 1.5 },
    { type: 'ammo',      x: 12.5, y: 5.5 },
    { type: 'ammo',      x: 12.5, y: 9.5 },  // specimen hall
    { type: 'plating',   x: 1.5,  y: 7.5 },  // side room, under the larvae: REINFORCED PLATING, this level's upgrade
    { type: 'ammocrate', x: 1.5,  y: 10.5 }, // side room
    { type: 'charge',    x: 1.5,  y: 9.5 },  // side room, past the larvae: the quiet way to burn the chamber (charge.js)
    { type: 'ammocrate', x: 21.5, y: 12.5 }, // lower lab
    { type: 'repair',    x: 1.5,  y: 14.5 }, // lower lab
    // Incendiary rounds (ammo.js), for the way down: they count double on the breeding chamber.
    { type: 'incendiary', x: 22.5, y: 10.5 }, // specimen hall, by the way down
    { type: 'incendiary', x: 6.5,  y: 7.5 },  // side room
  ],

  vents: [
    { x: 16, y: 5, delay: 0.5 },
  ],

  // CEILING VENTS (ambush.js): rattle and drip, then drop the membrane on you.
  // One is a decoy.
  drops: [
    { x: 17.5, y: 5.5 },               // the specimen hall, between the tanks
    { x: 13.5, y: 9.5, decoy: true },
    { x: 8.5,  y: 9.5 },               // the side room, with its larvae
    { x: 5.5,  y: 13.5 },              // the lower lab
  ],

  // No blackout here (owner): only the Hangar (with its lockdown) and the Offices lose their power.

  // The floor plan (plans.js): a whiteboard in the specimen hall, before the way down.
  plans: [
    { x: 23, y: 5, face: 'W' },
  ],

  // Signs, and a trail of slime from the tanks down to the chamber. (More
  // slime and damp are scattered by the rules in decals.js.)
  decals: [
    // The brood mother's nest: slime all round her.
    { surface: 'floor', type: 'slime', x: 20, y: 13 },
    { surface: 'floor', type: 'slime', x: 21, y: 12 },
    { surface: 'floor', type: 'slime', x: 22, y: 14 },
    // Facing you as you start.
    { surface: 'wall', type: 'genetics',  x: 10, y: 2, face: 'W' },
    { surface: 'wall', type: 'biohazard', x: 10, y: 4, face: 'W' },
    // The far wall of the specimen hall, as you come through the door.
    { surface: 'wall', type: 'specimens', x: 23, y: 3, face: 'W' },
    // Either side of the door down.
    { surface: 'wall', type: 'keepOut',   x: 16, y: 11, face: 'N' },
    { surface: 'wall', type: 'biohazard', x: 18, y: 11, face: 'N' },
    // Flanking the chamber.
    { surface: 'wall', type: 'biohazard', x: 8,  y: 15, face: 'N' },
    { surface: 'wall', type: 'biohazard', x: 12, y: 15, face: 'N' },
    // Something has been dragged from the tanks to the chamber.
    { surface: 'floor', type: 'slime', x: 17, y: 8 },  // just outside the tank's glass
    { surface: 'floor', type: 'slime', x: 17, y: 10 },
    { surface: 'floor', type: 'slime', x: 16, y: 12 },
    { surface: 'floor', type: 'slime', x: 12, y: 13 },
    { surface: 'floor', type: 'slime', x: 10, y: 14 },
  ],

  playerStart: { x: 2.5, y: 3.5, angle: 0 },
});
