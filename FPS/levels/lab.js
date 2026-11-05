// LEVEL 2: THE LAB, 24 cells wide and 16 tall. A test sandbox. It has the
// lab's own look (stained white tiles, bench cabinets, cold fluorescents,
// slime), its own objective, the BREEDING CHAMBER, and its own enemies: the
// lab's CREATURES (creatures.js), which hear you rather than watch for you,
// so there are no cameras, tripwires or terminals here. The
// glass boxes are SPECIMEN TANKS: one floor cell walled in by glass, with
// steel pillars at the corners. Empty for now; one day, something will be in them.
//
// The route: start (top left) -> the specimen hall (right) -> the one door
// down to the lower lab -> the chamber at the back. The side room (left)
// is optional. The lift is behind you as you start.

LEVELS.push({
  id: 'lab',
  name: 'THE LAB',
  theme: 'lab',         // floor, ceiling and lighting (map.js)
  objective: 'chamber', // the K cells are the breeding chamber (core.js)

  // t = tiled wall, b = bench cabinets (legend.js). The tanks' pillars are steel (#).
  rows: [
  // x: 0         1         2
  //    012345678901234567890123
    'tttttbbbtttttttttttttttt', //  0
    'L.........t............t', //  1  exit lift (x0)
    'L.........t..#W#..#W#..t', //  2  specimen tanks
    't.........D..W.W..W.W..t', //  3
    't.........t..#W#..#W#..t', //  4
    't.........t............t', //  5
    'tttttDtttttt...........t', //  6
    't..........t..#W#..#W#.t', //  7  more tanks
    'b..........D..W.W..W.W.b', //  8  side room (left) | specimen hall
    'b..........t..#W#..#W#.b', //  9
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

  // LURCHERS. They hear every shot (further in burst and auto), and spot you
  // much sooner under a light than in the dark.
  enemies: [
    // The specimen hall: two, out of sight of the door in. A careless burst
    // at one brings the other.
    { type: 'lurcher', x: 21.5, y: 5.5,  angle: Math.PI },
    { type: 'lurcher', x: 17.5, y: 1.5,  angle: Math.PI / 2 },
    // The side room: one, in the dark at the far end.
    { type: 'lurcher', x: 2.5,  y: 8.5,  angle: 0 },
    // The lower lab: three, around the chamber. Shooting down here wakes them all.
    { type: 'lurcher', x: 4.5,  y: 12.5, angle: 0 },
    { type: 'lurcher', x: 10.5, y: 13.5, angle: -Math.PI / 2 },
    { type: 'lurcher', x: 19.5, y: 13.5, angle: Math.PI },
  ],

  // Creatures drop no clips, so there's more ammo lying about than in the hangar.
  pickups: [
    { type: 'ammo',   x: 8.5,  y: 1.5 },
    { type: 'repair', x: 22.5, y: 1.5 },
    { type: 'ammo',   x: 1.5,  y: 10.5 },
    { type: 'burstmod', x: 12.5, y: 5.5 },
    { type: 'ammo',   x: 22.5, y: 9.5 },  // specimen hall, far corner
    { type: 'ammo',   x: 21.5, y: 12.5 }, // lower lab
    { type: 'repair', x: 1.5,  y: 14.5 }, // lower lab
  ],

  vents: [
    { x: 16, y: 5, delay: 0.5 },
  ],

  // Signs, and a trail of slime from the tanks down to the chamber. (More
  // slime and damp are scattered by the rules in decals.js.)
  decals: [
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
