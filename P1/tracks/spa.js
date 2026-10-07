// Spa-Francorchamps-inspired circuit: long, sweeping and fast, through the Ardennes forest. The La Source
// hairpin, Eau Rouge and Raidillon, the long Kemmel straight, Les Combes, Pouhon, Stavelot, Blanchimont and
// the Bus Stop chicane. Not to scale, but the corners come in the right order. See silverstone.js for what
// each field means.
const TRACK_SPA = {
  name: 'SPA',
  blurb: 'Eau Rouge, the Kemmel straight and forest all round',
  lineS: 4000,
  pit: {
    from: 1400,
    to: 8800,
    out: 10200,
    boxes: [2600, 3600, 4600, 5600, 6600, 7600],
    playerBox: 1,   // which of these boxes is the player's (0 = the first); fixed, so every player gets the same one here
  },
  // nature above 1 means a dense forest: more trees, bushes, rocks and flowers.
  style: { walls: 'corners', nature: 1.5, ponds: false, buildings: false, aiPace: 1.09 },
  sections: [
    ['Start Straight',    15, 80, 15,  0,    { wing: -1, garages: 1 }],
    ['La Source',          6, 14,  6,  5.5,  { stands: [-1] }],
    ['Eau Rouge 1',        5,  6,  5, -3],
    ['Eau Rouge 2',        5,  6,  5,  3.5],
    ['Raidillon',          5,  6,  5, -2.5],
    ['Kemmel Straight',   10, 120, 10, 0,    { boards: true }],
    ['Les Combes 1',       5,  6,  5,  4,    { stands: [1] }],
    ['Les Combes 2',       5,  6,  5, -4],
    ['Malmedy',            6, 10,  6,  3],
    ['Bruxelles',          6, 12,  6,  5],
    ['Link',               8, 28,  8,  0],
    ['Pouhon',             8, 30,  8, -3.2],
    ['Fagnes 1',           5,  6,  5,  3],
    ['Fagnes 2',           5,  6,  5, -3],
    ['Stavelot',           6, 12,  6,  3.5],
    ['Blanchimont',        8, 54,  8, -1.6],
    ['Back Straight',      8, 56,  8,  0,    { boards: true }],
    ['Bus Stop 1',         5,  5,  5, -4.5,  { stands: [1] }],
    ['Bus Stop 2',         5,  5,  5,  4.5],
  ],
  // Overhead map: degrees turned by each section (+ = right), found with a small search.
  mapTurns: {
    'Start Straight': 24, 'La Source': 165, 'Eau Rouge 1': -53, 'Eau Rouge 2': 30, 'Raidillon': -20, 'Kemmel Straight': -51,
    'Les Combes 1': 45, 'Les Combes 2': -49, 'Malmedy': 56, 'Bruxelles': 119, 'Link': -27, 'Pouhon': -55, 'Fagnes 1': 55,
    'Fagnes 2': -29, 'Stavelot': 112, 'Blanchimont': -24, 'Back Straight': 45, 'Bus Stop 1': -19, 'Bus Stop 2': 37,
  },
};
