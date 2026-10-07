// Interlagos-inspired circuit (Sao Paulo): short, hilly in real life, anticlockwise, and famous for sudden
// rain. The Senna S, the Descida do Lago, Ferradura, Laranja, Pinheirinho, Bico de Pato, Mergulho and Juncao,
// then the climb back to the start straight. Not to scale, but the corners come in the right order. See
// silverstone.js for what each field means.
const TRACK_INTERLAGOS = {
  name: 'INTERLAGOS',
  blurb: 'Short and twisty, anticlockwise, with the Senna S',
  lineS: 3800,
  pit: {
    from: 1300,
    to: 8200,
    out: 9600,
    boxes: [2400, 3300, 4200, 5100, 6000, 6900],
    playerBox: 3,   // which of these boxes is the player's (0 = the first); fixed, so every player gets the same one here
  },
  // nature above 1 means a dense forest: more trees, bushes, rocks and flowers.
  // rain above 1 makes a wet start more likely in the weekend forecast (see rollForecast in game.js): Interlagos is known for it.
  style: { walls: 'corners', nature: 1.2, ponds: false, buildings: false, rain: 2, aiPace: 1 },
  sections: [
    ['Start Straight',    15, 70, 15,  0,    { wing: -1, garages: 1 }],
    ['Senna S 1',          5,  6,  5, -4.5,  { stands: [-1] }],
    ['Senna S 2',          5,  6,  5,  4],
    ['Curva do Sol',       6, 12,  6, -3.5],
    ['Reta Oposta',        8, 60,  8,  0,    { boards: true, stands: [1] }],
    ['Descida do Lago',    5,  8,  5, -4.5],
    ['Ferradura 1',        6, 14,  6, -3.5],
    ['Ferradura 2',        6, 14,  6, -3],
    ['Laranja',            6, 12,  6, -3.2],
    ['Pinheirinho',        5,  6,  5, -4],
    ['Bico de Pato 1',     5,  6,  5,  3.5],
    ['Bico de Pato 2',     5,  6,  5, -4],
    ['Mergulho',           6, 16,  6, -2.8],
    ['Juncao',             5,  8,  5,  3.5],
    ['Subida dos Boxes',   8, 26,  8, -1.5],
  ],
  // Overhead map: degrees turned by each section (+ = right). This circuit runs anticlockwise, so the
  // angles add up to -360.
  mapTurns: {
    'Start Straight': -54, 'Senna S 1': -99, 'Senna S 2': 55, 'Curva do Sol': -60, 'Reta Oposta': 21, 'Descida do Lago': -48,
    'Ferradura 1': -19, 'Ferradura 2': -22, 'Laranja': -41, 'Pinheirinho': -32, 'Bico de Pato 1': 64, 'Bico de Pato 2': -66,
    'Mergulho': -35, 'Juncao': 26, 'Subida dos Boxes': -49,
  },
};
