// Silverstone-inspired Grand Prix circuit. Not to scale, but the corners come in the right order
// and have roughly the right character. (There used to be a hill column; heights are not used now.)
//
// Each section is [name, enter, hold, leave, curve, scenery]:
//   enter / hold / leave  length in segments (ease into the corner, hold it, ease out)
//   curve                 > 0 turns right, < 0 turns left (about 2 = fast sweeper, 5+ = hairpin)
//   scenery               optional: stands [sides], wing side, garages side, boards true,
//                         harbour side (water beyond the barrier), tunnel true
const TRACK_SILVERSTONE = {
  name: 'SILVERSTONE',
  blurb: 'Fast, flowing corners and long straights',
  lineS: 4000,                      // distance along the track of the start/finish line (see game.js)
  pit: {                            // the pit lane, in distance along the track (the entry is always at 0)
    from: 1400,                     // the entry road has joined the pit lane proper by here
    to: 8800,                       // the pit lane starts to rejoin the track here
    out: 10200,                     // the exit road has rejoined the track here
    boxes: [2600, 3600, 4600, 5600, 6600, 7600],
    playerBox: 2,   // which of these boxes is the player's (0 = the first); fixed, so every player gets the same one here   // centre of each team's box; the player's is the first
  },
  style: { walls: 'corners', nature: 1, ponds: true, aiPace: 1 },
  sections: [
    ['Hamilton Straight',  15, 105, 15,  0, { wing: -1, garages: 1 }],
    ['Abbey',               6,  10,  6,  2.5],
    ['Abbey exit',          6,   6,  6, -2.5],
    ['Farm',               10,  18, 10, -2],
    ['Village',             6,  10,  6,  5, { stands: [1] }],
    ['The Loop',            6,  14,  6, -5.5],
    ['Aintree',             8,  10,  8, -2.5],
    ['Wellington dip',     10,  20, 10,  0],
    ['Wellington Straight', 10, 40, 10,  0, { stands: [-1], boards: true }],
    ['Brooklands',          8,  12,  8, -4],
    ['Luffield',            8,  28,  8,  4.5],
    ['Woodcote',            8,  16,  8,  3, { stands: [1] }],
    ['Link',                6,  24,  6,  0],
    ['Copse',               8,  16,  8,  3.5, { stands: [-1] }],
    ['Maggotts',            6,   8,  6, -3],
    ['Becketts 1',          6,   8,  6,  3.5],
    ['Becketts 2',          6,   8,  6, -3.5],
    ['Chapel',              6,   8,  6,  3],
    ['Hangar Straight',    10,  80, 10,  0, { boards: true }],
    ['Stowe',               8,  18,  8,  3.5, { stands: [-1] }],
    ['Vale',                6,  10,  6, -4.5],
    ['Club',                8,  16,  8,  4],
  ],

  // Overhead map: degrees turned by each section (+ = right / clockwise). The chase view only needs
  // the curve numbers above; the map needs real angles that add up to 360 and make a loop that does
  // not cross itself. These were found with a small search, keeping each corner close to the real one.
  mapTurns: {
    'Hamilton Straight': -27, 'Abbey': 76, 'Abbey exit': 11, 'Farm': 0, 'Village': 124, 'The Loop': -112,
    'Aintree': -6, 'Wellington dip': 20, 'Wellington Straight': 10, 'Brooklands': -73, 'Luffield': 137,
    'Woodcote': 47, 'Link': -38, 'Copse': 95, 'Maggotts': -48, 'Becketts 1': 55, 'Becketts 2': -66,
    'Chapel': 43, 'Hangar Straight': -26, 'Stowe': 96, 'Vale': -117, 'Club': 160,
  },
};
