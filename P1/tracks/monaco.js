// Monaco-inspired street circuit: tight, twisty, with walls close to the road, a tunnel and a harbour.
// Not to scale, but the corners come in the right order. See silverstone.js for what each field means.
//
// The start/finish straight comes first (the pit entry is at distance 0, just after the last corner).
const TRACK_MONACO = {
  name: 'MONACO',
  blurb: 'Tight streets, a tunnel and walls at the edge',
  lineS: 3600,
  pit: {
    from: 1200,
    to: 7600,
    out: 8800,
    boxes: [2200, 3100, 4000, 4900, 5800, 6700],
    playerBox: 3,   // which of these boxes is the player's (0 = the first); fixed, so every player gets the same one here
  },
  // walls: 'street' puts a wall on both sides all the way round. nature scales trees, bushes and rocks.
  // aiPace scales the AI cars' speed: the tight corners are harder for the player, so the AI slow down too.
  style: { walls: 'street', nature: 0.15, ponds: false, buildings: true, aiPace: 0.9 },
  sections: [
    ['Start Straight',      15, 62, 13,  0,    { wing: -1, garages: 1 }],
    ['Sainte Devote',        6, 10,  6,  4.5,  { stands: [-1] }],
    ['Beau Rivage',          8, 30,  8, -0.8],
    ['Massenet',             6,  8,  6, -3.5],
    ['Casino Square',        6,  8,  6,  3,    { stands: [1] }],
    ['Mirabeau',             5,  6,  5,  4],
    ['Loews Hairpin',        5, 12,  5,  6],
    ['Mirabeau Bas',         5,  6,  5,  4],
    ['Portier',              6,  8,  6,  4],
    ['Tunnel',              10, 50, 10, -0.6,  { tunnel: true }],
    ['Nouvelle Chicane 1',   5,  5,  5, -4.5],
    ['Nouvelle Chicane 2',   5,  5,  5,  4.5],
    ['Tabac',                6, 10,  6, -4,    { harbour: -1 }],
    ['Piscine 1',            4,  5,  4, -4,    { harbour: -1 }],
    ['Piscine 2',            4,  5,  4,  4,    { harbour: -1 }],
    ['Piscine 3',            4,  5,  4, -4,    { harbour: -1 }],
    ['Piscine 4',            4,  5,  4,  4,    { harbour: -1 }],
    ['La Rascasse',          5, 10,  5,  5.5,  { harbour: -1 }],
    ['Anthony Noghes',       5,  6,  5,  4.5],
  ],
  // Overhead map: degrees turned by each section (+ = right). Found with a small search so the loop closes
  // (total 360), does not cross itself, and keeps every corner wider than the road.
  mapTurns: {
    'Start Straight': -9, 'Sainte Devote': 77, 'Beau Rivage': 6, 'Massenet': -71, 'Casino Square': 17, 'Mirabeau': 27,
    'Loews Hairpin': 112, 'Mirabeau Bas': 21, 'Portier': 42, 'Tunnel': -5, 'Nouvelle Chicane 1': -26,
    'Nouvelle Chicane 2': 27, 'Tabac': -63, 'Piscine 1': -11, 'Piscine 2': 47, 'Piscine 3': 7, 'Piscine 4': 31,
    'La Rascasse': 92, 'Anthony Noghes': 39,
  },
};
