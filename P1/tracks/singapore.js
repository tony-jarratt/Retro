// Singapore-inspired night street circuit: tight 90 degree corners, long walled straights between them,
// the bridge and the bay, all under floodlights. It runs anticlockwise (more left turns than right).
// Not to scale, but the corners come in the right order. See silverstone.js for what each field means.
const TRACK_SINGAPORE = {
  name: 'SINGAPORE',
  blurb: 'A street circuit under floodlights, all tight corners',
  lineS: 3600,
  pit: {
    from: 1200,
    to: 7600,
    out: 8800,
    boxes: [2200, 3100, 4000, 4900, 5800, 6700],
    playerBox: 2,   // which of these boxes is the player's (0 = the first); fixed, so every player gets the same one here
  },
  // night: raced in the dark: floodlit track, lamp posts, headlights and lit windows (see night.js).
  style: { walls: 'street', nature: 0.1, ponds: false, buildings: true, night: true, aiPace: 1 },
  sections: [
    ['Start Straight',    15, 70, 15,  0,    { wing: -1, garages: 1 }],
    ['Turn 1',             5,  6,  5,  4.5,  { stands: [1] }],
    ['Turn 2',             5,  5,  5, -4],
    ['Turn 3',             5,  6,  5, -4.5],
    ['Raffles Boulevard',  8, 24,  8,  0],
    ['Turn 5',             5,  6,  5, -4.5],
    ['Turn 6',             5,  6,  5,  4.5],
    ['Esplanade Drive',    8, 24,  8,  0,    { harbour: -1 }],
    ['Turn 7',             5,  6,  5, -4,    { harbour: -1 }],
    ['Turn 8',             5,  6,  5,  4,    { harbour: -1 }],
    ['Turn 9',             5,  8,  5, -4.5,  { harbour: -1 }],
    ['Anderson Bridge',    8, 20,  8,  0],
    ['Turn 10',            5,  6,  5, -4],
    ['Turn 11',            5,  6,  5, -4.5],
    ['Memorial Straight',  8, 36,  8,  0,    { stands: [-1] }],
    ['Turn 14',            5, 10,  5, -4.5],
    ['Turn 16',            5,  6,  5,  4.5],
    ['Turn 17',            5,  6,  5, -4],
    ['Turn 18',            5,  8,  5, -3.5],
  ],
  // Overhead map: degrees turned by each section (+ = right). This circuit runs anticlockwise, so the
  // angles add up to -360.
  mapTurns: {
    'Start Straight': -16, 'Turn 1': 70, 'Turn 2': -76, 'Turn 3': -91, 'Raffles Boulevard': 0, 'Turn 5': -98, 'Turn 6': 88,
    'Esplanade Drive': -4, 'Turn 7': -62, 'Turn 8': 79, 'Turn 9': -86, 'Anderson Bridge': 27, 'Turn 10': -37, 'Turn 11': -66,
    'Memorial Straight': 17, 'Turn 14': -75, 'Turn 16': 51, 'Turn 17': -42, 'Turn 18': -40,
  },
};
