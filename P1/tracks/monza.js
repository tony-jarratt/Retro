// Monza-inspired circuit: the Temple of Speed. Very long straights, three chicanes, the Lesmo corners and
// the big Parabolica. Not to scale, but the corners come in the right order. See silverstone.js for what
// each field means.
const TRACK_MONZA = {
  name: 'MONZA',
  blurb: 'Huge straights, tight chicanes and the Parabolica',
  lineS: 4000,
  pit: {
    from: 1400,
    to: 8800,
    out: 10200,
    boxes: [2600, 3600, 4600, 5600, 6600, 7600],
    playerBox: 4,   // which of these boxes is the player's (0 = the first); fixed, so every player gets the same one here
  },
  // aiPace is above 1 because the long straights suit the player's full-speed car, so the AI need to be quicker.
  style: { walls: 'corners', nature: 1, ponds: false, buildings: false, aiPace: 1.04 },
  sections: [
    ['Start Straight',     15, 90, 15,  0,    { wing: -1, garages: 1 }],
    ['Rettifilo 1',         6,  6,  6,  4.5,  { stands: [-1] }],
    ['Rettifilo 2',         6,  6,  6, -4.5],
    ['Straight',            8, 22,  8,  0],
    ['Curva Grande',       10, 40, 10,  1.8],
    ['Roggia 1',            5,  5,  5, -4],
    ['Roggia 2',            5,  5,  5,  4],
    ['Link',                6, 12,  6,  0],
    ['Lesmo 1',             6, 12,  6,  3.5],
    ['Lesmo 2',             6, 14,  6,  3.8],
    ['Serraglio',           8, 40,  8,  0],
    ['Ascari 1',            5,  5,  5, -4],
    ['Ascari 2',            5,  5,  5,  4],
    ['Ascari 3',            5,  5,  5, -4],
    ['Back Straight',      10, 130, 10, 0,    { boards: true }],
    ['Parabolica',          8, 40,  8,  3,    { stands: [1] }],
  ],
  // Overhead map: degrees turned by each section (+ = right). Filled in by a search so the loop closes
  // (total 360), does not cross itself, and keeps every corner wider than the road.
  mapTurns: {
    'Start Straight': 15, 'Rettifilo 1': 45, 'Rettifilo 2': -53, 'Straight': -30, 'Curva Grande': 84, 'Roggia 1': -34,
    'Roggia 2': 41, 'Link': 15, 'Lesmo 1': 62, 'Lesmo 2': 76, 'Serraglio': -1, 'Ascari 1': -31, 'Ascari 2': 43,
    'Ascari 3': -42, 'Back Straight': -5, 'Parabolica': 174,
  },
};
