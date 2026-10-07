'use strict';

// Tile size in pixels and screen size in tiles. The playfield is COLS x ROWS tiles.
const T = 32, COLS = 32, ROWS = 20;

const ITEM_TYPES = 'gprs'; // g = plain present, p = wrapping paper, s = scissors, r = ribbon
const ENEMY_TYPES = 'DCKP'; // D = dog, C = cat, K = child, P = parent
const FLOOR_TILES = '#=Ti'; // tiles you can stand on

class LevelError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LevelError';
  }
}

// Each screen is described by floors (platform rows), ladders that descend from a floor
// to the next solid tile below, and (col,row) positions for everything that stands on a
// floor. `row` for an item/enemy/prop is the row of the tile it occupies (the tile
// directly above a floor). buildLevel() turns this into the tile grid and validates it.
//
// Grid legend: '#' solid wall/ground, '=' platform (one-way, land on top),
// 'i' ice platform (the elf slides), 'T' ladder top (platform tile with a ladder through it),
// 'H' ladder, '.' empty.
//
// Optional extras: a floor can have `ice: [[from, to], ...]` (columns; ladder tops stay normal
// so you can always stop and climb), and a screen can have `baubles: [{ row, from, to, every, offset }]`:
// a bauble rolls along floor `row` from column `from` to column `to`, one every `every` frames.
const LEVEL_SPECS = [
  {
    name: 'The Living Room', theme: 'living', time: 100, quota: 2,
    hint: 'Collect a present, paper, scissors and ribbon, wrap them at the bench, then deliver to the tree. Jump the rolling baubles!',
    floors: [
      { row: 7, gaps: [[15, 16]], ladders: [10, 26] },
      { row: 11, ladders: [4, 21] },
      { row: 15, gaps: [[7, 8]], ladders: [13, 28] },
    ],
    start: [2, 18], tree: [3, 6], station: [28, 6],
    items: [
      ['g', 19, 18], ['g', 25, 10],
      ['p', 5, 14], ['p', 19, 6],
      ['s', 23, 14], ['s', 13, 6],
      ['r', 7, 10], ['r', 21, 6],
    ],
    enemies: [['D', 23, 18], ['D', 17, 14]],
    baubles: [{ row: 11, from: 30, to: 2, every: 330, offset: 150 }],
  },
  {
    name: 'The Kitchen', theme: 'kitchen', time: 130, quota: 3,
    hint: 'Ice! You slide on the blue floors, so plan your jumps. The cat pounces when you run past.',
    floors: [
      { row: 3, gaps: [[12, 13]], ladders: [6, 24] },
      { row: 7, gaps: [[19, 20]], ladders: [15, 28], ice: [[1, 18]] },
      { row: 11, gaps: [[9, 10], [22, 23]], ladders: [3, 19], ice: [[11, 21]] },
      { row: 15, gaps: [[14, 15]], ladders: [8, 25], ice: [[1, 13]] },
    ],
    start: [2, 18], tree: [28, 18], station: [4, 2],
    items: [
      ['g', 9, 2], ['g', 17, 6], ['g', 6, 10],
      ['r', 21, 2], ['r', 3, 6], ['r', 11, 14],
      ['s', 27, 2], ['s', 23, 6], ['s', 13, 10],
      ['p', 10, 6], ['p', 26, 10], ['p', 21, 14],
    ],
    enemies: [['C', 16, 10], ['D', 12, 14], ['D', 20, 18]],
  },
  {
    name: 'The Bedrooms', theme: 'bedroom', time: 130, quota: 3,
    hint: 'Rolling baubles will bonk you. Children are fast on ladders, so keep moving.',
    floors: [
      { row: 3, span: [1, 12], ladders: [8] },
      { row: 3, span: [19, 30], ladders: [26] },
      { row: 7, gaps: [[15, 16]], ladders: [4, 22] },
      { row: 11, span: [1, 12], ladders: [10] },
      { row: 11, span: [17, 30], ladders: [28] },
      { row: 15, gaps: [[18, 19]], ladders: [6, 20] },
    ],
    start: [2, 18], tree: [29, 10], station: [2, 10],
    items: [
      ['g', 4, 2], ['g', 19, 6], ['g', 14, 14],
      ['s', 21, 2], ['s', 28, 6], ['s', 11, 14],
      ['r', 28, 2], ['r', 7, 10], ['r', 3, 14],
      ['p', 9, 6], ['p', 20, 10], ['p', 24, 14],
    ],
    enemies: [['K', 6, 6], ['K', 25, 14], ['C', 25, 10], ['D', 10, 18]],
    baubles: [
      { row: 7, from: 30, to: 17, every: 280, offset: 90 },
      { row: 15, from: 1, to: 17, every: 300, offset: 200 },
    ],
  },
  {
    name: 'The Landing', theme: 'hall', time: 140, quota: 3,
    hint: 'Sleeping parents wake if you get close, or if you jump nearby. Watch for ice and baubles.',
    floors: [
      { row: 3, gaps: [[12, 13], [18, 19]], ladders: [8, 25] },
      { row: 7, gaps: [[10, 11], [21, 22]], ladders: [5, 16, 27] },
      { row: 11, gaps: [[14, 15]], ladders: [9, 24], ice: [[1, 13]] },
      { row: 15, gaps: [[7, 8], [20, 21]], ladders: [3, 17, 29] },
    ],
    start: [2, 18], tree: [29, 6], station: [3, 10],
    items: [
      ['g', 5, 2], ['g', 18, 6], ['g', 11, 14],
      ['p', 15, 2], ['p', 12, 10], ['p', 25, 14],
      ['s', 22, 2], ['s', 24, 6], ['s', 5, 14],
      ['r', 7, 6], ['r', 20, 10], ['r', 14, 14],
    ],
    enemies: [['P', 13, 6], ['P', 13, 14], ['K', 26, 10], ['C', 20, 18]],
    baubles: [
      { row: 3, from: 30, to: 20, every: 260, offset: 60 },
      { row: 15, from: 30, to: 22, every: 300, offset: 180 },
    ],
  },
  {
    name: "Santa's Workshop", theme: 'workshop', time: 170, quota: 4,
    hint: 'The final rush. Everyone is awake, and it is slippery!',
    floors: [
      { row: 3, gaps: [[9, 10], [22, 23]], ladders: [6, 17, 26], ice: [[11, 21]] },
      { row: 7, gaps: [[13, 14]], ladders: [10, 21] },
      { row: 11, gaps: [[7, 8], [24, 25]], ladders: [14, 19] },
      { row: 15, gaps: [[11, 12], [27, 28]], ladders: [4, 22], ice: [[13, 26]] },
    ],
    start: [2, 18], tree: [29, 6], station: [16, 10],
    items: [
      ['g', 7, 2], ['g', 22, 6], ['g', 11, 10], ['g', 6, 14],
      ['p', 13, 2], ['p', 24, 6], ['p', 3, 10], ['p', 15, 14],
      ['s', 19, 2], ['s', 3, 6], ['s', 22, 10], ['s', 25, 14],
      ['r', 25, 2], ['r', 12, 6], ['r', 28, 10], ['r', 2, 14],
    ],
    enemies: [['D', 20, 18], ['C', 8, 6], ['K', 18, 10], ['P', 16, 2], ['P', 20, 14]],
    baubles: [
      { row: 7, from: 30, to: 15, every: 240, offset: 90 },
      { row: 11, from: 23, to: 9, every: 270, offset: 120 },
    ],
  },
];

function buildLevel(spec, index) {
  const where = `Level ${index + 1} "${spec.name}"`;
  const fail = (message) => { throw new LevelError(`${where}: ${message}`); };

  const grid = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      row.push(r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 ? '#' : '.');
    }
    grid.push(row);
  }

  for (const f of spec.floors) {
    if (!Number.isInteger(f.row) || f.row < 2 || f.row > ROWS - 5) fail(`floor row ${f.row} is out of range`);
    const [from, to] = f.span || [1, COLS - 2];
    if (from < 1 || to > COLS - 2 || from > to) fail(`floor row ${f.row} has a bad span [${from},${to}]`);
    for (let c = from; c <= to; c++) grid[f.row][c] = '=';
    for (const [a, b] of f.gaps || []) {
      if (a < from || b > to || a > b) fail(`gap [${a},${b}] on floor row ${f.row} is outside its span`);
      for (let c = a; c <= b; c++) grid[f.row][c] = '.';
    }
  }
  // Two passes: mark every ladder top first, so a ladder that lands on another ladder is caught.
  for (const f of spec.floors) {
    for (const c of f.ladders || []) {
      if (grid[f.row][c] !== '=') fail(`ladder at col ${c} on floor row ${f.row} is not on a platform tile`);
      grid[f.row][c] = 'T';
    }
  }
  for (const f of spec.floors) {
    for (const c of f.ladders || []) {
      let r = f.row + 1;
      while (grid[r][c] === '.') { grid[r][c] = 'H'; r++; }
      if (r === f.row + 1) fail(`ladder at col ${c} below row ${f.row} has no room to descend`);
      if (grid[r][c] === 'T') fail(`ladder at col ${c} from row ${f.row} lands on another ladder at row ${r}`);
    }
  }

  for (const f of spec.floors) {
    for (const [a, b] of f.ice || []) {
      if (a < 1 || b > COLS - 2 || a > b) fail(`ice [${a},${b}] on floor row ${f.row} is out of range`);
      for (let c = a; c <= b; c++) {
        const t = grid[f.row][c];
        if (t === 'T') continue; // ladder tops stay normal so the player can always stop and climb
        if (t !== '=') fail(`ice [${a},${b}] on floor row ${f.row} covers col ${c}, which is '${t}', not a platform`);
        grid[f.row][c] = 'i';
      }
    }
  }

  const place = (label, c, r) => {
    if (!Number.isInteger(c) || !Number.isInteger(r) || c < 1 || c > COLS - 2 || r < 1 || r > ROWS - 2) {
      fail(`${label} at (${c},${r}) is outside the screen`);
    }
    if (grid[r][c] !== '.') fail(`${label} at (${c},${r}) is inside tile '${grid[r][c]}'`);
    if (!FLOOR_TILES.includes(grid[r + 1][c])) fail(`${label} at (${c},${r}) has no floor beneath it`);
    return { c, r };
  };

  const items = spec.items.map(([type, c, r]) => {
    if (!ITEM_TYPES.includes(type)) fail(`unknown item type '${type}'`);
    return { type, ...place(`item '${type}'`, c, r) };
  });
  for (const type of ITEM_TYPES) {
    const n = items.filter((it) => it.type === type).length;
    if (n < spec.quota) fail(`only ${n} of item '${type}' for a quota of ${spec.quota}`);
  }
  const enemies = spec.enemies.map(([type, c, r]) => {
    if (!ENEMY_TYPES.includes(type)) fail(`unknown enemy type '${type}'`);
    return { type, ...place(`enemy '${type}'`, c, r) };
  });

  const baubles = (spec.baubles || []).map((b, i) => {
    const label = `bauble ${i + 1}`;
    if (!Number.isInteger(b.row) || b.row < 1 || b.row > ROWS - 1) fail(`${label}: row ${b.row} is out of range`);
    const lo = Math.min(b.from, b.to), hi = Math.max(b.from, b.to);
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo === hi || lo < 1 || hi > COLS - 2) {
      fail(`${label}: columns ${b.from} to ${b.to} are invalid`);
    }
    if (!Number.isInteger(b.every) || b.every < 90) fail(`${label}: 'every' must be a whole number of frames, at least 90`);
    for (let c = lo; c <= hi; c++) {
      if (!FLOOR_TILES.includes(grid[b.row][c])) fail(`${label}: no floor at col ${c} on row ${b.row}`);
    }
    return { row: b.row, floorY: b.row * T, x0: (b.from + 0.5) * T, x1: (b.to + 0.5) * T, dir: Math.sign(b.to - b.from), every: b.every, offset: b.offset || 0 };
  });

  return {
    index,
    name: spec.name,
    theme: spec.theme,
    hint: spec.hint,
    time: spec.time,
    quota: spec.quota,
    grid,
    floorRows: spec.floors.map((f) => f.row),
    items,
    enemies,
    baubles,
    start: place('start', ...spec.start),
    tree: place('tree', ...spec.tree),
    station: place('station', ...spec.station),
  };
}

// Tile queries. Anything off-screen counts as solid wall.
function tileAt(lv, c, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return '#';
  return lv.grid[r][c];
}
function isWall(lv, c, r) { return tileAt(lv, c, r) === '#'; }
function hasFloor(lv, c, r) { const t = tileAt(lv, c, r); return t === '#' || t === '=' || t === 'T' || t === 'i'; }
function isLadder(lv, c, r) { const t = tileAt(lv, c, r); return t === 'H' || t === 'T'; }
