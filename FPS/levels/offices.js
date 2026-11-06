// LEVEL 5: THE OFFICES, floor 11, 28 cells wide and 20 tall. The first of
// head office's two levels: SUITS and BLOOMERS, and the sprinklers. It
// teaches the two rules of the infected: a suit you've shot down gets up
// again unless you finish it on the floor, and a bloomer bursts in spores if
// you come close (or if the sprinklers water it).
//
// THE ROUTE IN: the lift lobby (top left, safe) -> the corridor -> the
// open-plan office -> down through the archive -> the facilities office,
// where the LIFT KEY is.
//
// THE BEATS:
//   - The first suit is alone in the corridor under a light. Shoot it down,
//     watch it twitch, and finish it before it gets up.
//   - The open-plan office: four suits among the desks, and two bloomers by
//     the planter in the middle. There's a drum by the far wall: set it off
//     from the corridor door and the sprinklers come on, and the bloomers
//     burst while you're out of reach (but the suits hear it).
//   - The first meeting room has a bloomer just inside the door, and a
//     repair kit beside it.
//   - The archive: one bloomer, two drums, a sprinkler over it.
//   - THE MANAGER, in meeting room 2: once it's awake it runs the floor
//     over the PA (surround, ambush, fire drill, lights out, sealed doors)
//     and keeps out of your sight. Hunt it down and the suits fall apart.
//
// THE RACE BACK: taking the lift key sets every suit on the floor hunting
// you. Back up through the meeting rooms (the bloomer by the door), or the
// long way west, through the kitchen and the print room, to the lobby.

LEVELS.push({
  id: 'offices',
  name: 'THE OFFICES',
  floor: 11,
  theme: 'hq',
  objective: 'liftkey',
  briefing: [
    'FLOOR 11. THE PLANTS ARE COMING THROUGH THE',
    'CEILING TILES, AND THE STAFF ARE STILL AT WORK.',
    'SHOOT ONE DOWN AND FINISH IT, OR IT GETS UP.',
    'THE FACILITIES OFFICE HAS THE LIFT KEY.',
  ],

  // o = office wall, v = overgrown (legend.js). W is glass: the meeting rooms' partition.
  rows: [
  // x: 0         1         2
  //    0123456789012345678901234567
    'oooooooooooooooooooooooooooo', //  0
    'o.....o....................o', //  1  the lift lobby | the corridor
    'L.....o....................o', //  2  the lift (x0)
    'L.....D....................o', //  3
    'o.....o....................o', //  4
    'o.....ooooDooooooDooooooDooo', //  5  doors down: open plan (x10, x17), the first meeting room (x24)
    'oooDooo..............o.....o', //  6  lobby -> print room (x3) | open plan | meeting room 1
    'o.....o..............W.....o', //  7  glass between the open plan and meeting room 1
    'o.....o..............W.....o', //  8
    'o.....o......vv......oooDooo', //  9  the planter | meeting room 1 -> 2 (x24)
    'o.....o......vv......o.....o', // 10  print room | open plan | meeting room 2
    'o.....o..............o.....o', // 11
    'o.....o..............o.....o', // 12
    'oooDooooooooooDoooooooooDooo', // 13  print room -> kitchen (x3), open plan -> archive (x14), meeting room 2 -> facilities (x24)
    'o.........o......o.........o', // 14  the kitchen | the archive | facilities
    'o.........o......o.........o', // 15
    'o.........D......D.........o', // 16  kitchen <-> archive (x10), archive <-> facilities (x17)
    'o.........o......o.........o', // 17
    'o.........o......o.........o', // 18
    'oooooooooooooooooooooooooooo', // 19
  ],

  sprites: [
    { type: 'desk',  x: 9.5,  y: 7.5 },  // the open plan
    { type: 'desk',  x: 17.5, y: 7.5 },
    { type: 'desk',  x: 9.5,  y: 11.5 },
    { type: 'desk',  x: 17.5, y: 11.5 },
    { type: 'plant', x: 7.5,  y: 12.5 },
    { type: 'plant', x: 20.5, y: 6.5 },
    { type: 'drum',  x: 20.5, y: 12.5 }, // cleaning solvent: the sprinklers will feel it go
    { type: 'drum',  x: 11.5, y: 17.5 }, // the archive
    { type: 'drum',  x: 12.5, y: 17.5 },
    { type: 'plant', x: 1.5,  y: 14.5 }, // the kitchen
    { type: 'desk',  x: 24.5, y: 15.5 }, // facilities
  ],

  ceilingLights: [
    { x: 3,  y: 3 },   // the lobby
    { x: 15, y: 2 },   // over the first suit
    { x: 23, y: 2 },
    { x: 9,  y: 8 },   // the open plan
    { x: 15, y: 11 },
    { x: 19, y: 7 },
    { x: 23, y: 7 },   // meeting rooms
    { x: 25, y: 11 },
    { x: 3,  y: 9 },   // the print room
    { x: 5,  y: 15 },  // the kitchen
    { x: 13, y: 17 },  // the archive
    { x: 22, y: 16 },  // facilities
  ],

  enemies: [
    { type: 'suit', x: 15.5, y: 2.5,  angle: Math.PI },      // the first: alone, lit
    { type: 'suit', x: 8.5,  y: 9.5,  angle: 0 },            // the open plan, at their desks
    { type: 'suit', x: 12.5, y: 11.5, angle: -Math.PI / 2 },
    { type: 'suit', x: 18.5, y: 9.5,  angle: Math.PI },
    { type: 'suit', x: 15.5, y: 7.5,  angle: Math.PI / 2 },
    { type: 'suit', x: 24.5, y: 11.5, angle: -Math.PI / 2 }, // meeting room 2
    // THE MANAGER (manager.js): in meeting room 2, running the floor. It
    // never fights; it keeps out of sight, orders the suits about over the
    // PA, and re-roots in the open plan's planter (or a pot plant) to heal.
    { type: 'manager', x: 22.5, y: 10.5, angle: 0, badge: ['D. HARLOW', 'REGIONAL OPERATIONS MANAGER'] },
    { type: 'suit', x: 2.5,  y: 10.5, angle: Math.PI / 2 },  // the print room
    { type: 'suit', x: 4.5,  y: 15.5, angle: 0 },            // the kitchen
    { type: 'suit', x: 7.5,  y: 17.5, angle: Math.PI },
    { type: 'suit', x: 20.5, y: 15.5, angle: Math.PI },      // facilities
    { type: 'suit', x: 23.5, y: 17.5, angle: Math.PI },
    { type: 'bloomer', x: 11.5, y: 8.5,  angle: 0 },         // by the planter
    { type: 'bloomer', x: 16.5, y: 10.5, angle: 0 },
    { type: 'bloomer', x: 24.5, y: 7.5,  angle: 0 },         // just inside meeting room 1
    { type: 'bloomer', x: 14.5, y: 15.5, angle: 0 },         // the archive
  ],

  // Sprinkler heads (sprinklers.js). The open plan's link up with meeting
  // room 1's through the glass; the archive and kitchen have their own.
  sprinklers: [
    { x: 11, y: 9 }, { x: 17, y: 9 }, { x: 14, y: 7 }, { x: 24, y: 6 },
    { x: 14, y: 16 },
    { x: 5,  y: 16 },
  ],

  // The infected drop nothing: the ammo comes in crates.
  pickups: [
    { type: 'ammocrate', x: 4.5,  y: 1.5 },  // the lobby: the first room's ammo...
    { type: 'repair',    x: 4.5,  y: 5.5 },  // ...and armour
    { type: 'ammo',      x: 25.5, y: 1.5 },  // the corridor's far end
    { type: 'ammocrate', x: 7.5,  y: 6.5 },  // the open plan
    { type: 'repair',    x: 25.5, y: 6.5 },  // meeting room 1, beside its bloomer
    { type: 'ammo',      x: 22.5, y: 12.5 }, // meeting room 2
    { type: 'ammocrate', x: 1.5,  y: 17.5 }, // the kitchen
    { type: 'repair',    x: 8.5,  y: 14.5 },
    { type: 'ammo',      x: 16.5, y: 18.5 }, // the archive
    { type: 'liftkey',   x: 25.5, y: 17.5 }, // facilities: the objective
    { type: 'ammo',      x: 18.5, y: 14.5 },
  ],

  decals: [
    { surface: 'wall', type: 'company',    x: 27, y: 2,  face: 'W' },  // the end of the corridor
    { surface: 'wall', type: 'growWithUs', x: 6,  y: 9,  face: 'E' },  // the open plan's west wall
    { surface: 'wall', type: 'boardRoom',  x: 27, y: 7,  face: 'W' },  // meeting room 1
    { surface: 'floor', type: 'leaves', x: 13, y: 8 },
    { surface: 'floor', type: 'leaves', x: 15, y: 10 },
    { surface: 'floor', type: 'leaves', x: 14, y: 14 },
  ],

  playerStart: { x: 1.5, y: 3.5, angle: 0 },
});
