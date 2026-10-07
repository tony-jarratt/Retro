// Pixel art for the roadside scenery, seen from above. Like the cars, it is drawn in code: each
// sprite is built pixel by pixel into a small canvas the first time it is needed, then reused.
//
// One art pixel is one screen pixel at the overhead zoom (25 world units), and a sprite's centre
// is where the object sits. Objects that line up with the track (stands, barriers, buildings...)
// are rotated to follow it; round ones (trees, bushes) are not.

// put(x, y, colour, width = 1, height = 1) paints a block of pixels.
function makeArt(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  draw((x, y, colour, rw, rh) => { g.fillStyle = colour; g.fillRect(x, y, rw || 1, rh || 1); }, w, h);
  return cv;
}

function clampInt(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.floor(v))); }

// Fill a blob made of overlapping discs. tones: dark to light. Light comes from the top left, and
// the outline is drawn in the darkest tone.
function blobArt(w, h, discs, tones, rand, noise) {
  return makeArt(w, h, (put) => {
    const grid = [];
    for (let y = 0; y < h; y++) {
      grid.push([]);
      for (let x = 0; x < w; x++) {
        let tone = -1;
        for (const [cx, cy, r] of discs) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
          if (d > r) continue;
          const lit = 0.62 - (dx * 0.55 + dy * 0.8) / r * 0.3 - (d / r) * 0.25 + (rand() - 0.5) * noise;
          tone = Math.max(tone, clampInt(lit * tones.length, 0, tones.length - 1));
        }
        grid[y].push(tone);
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (grid[y][x] < 0) continue;
        const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => (grid[y + oy] || [])[x + ox] === undefined || grid[y + oy][x + ox] < 0);
        put(x, y, tones[edge ? 0 : grid[y][x]]);
      }
    }
  });
}

const TREE_TONES = [
  ['#12441A', '#1E6128', '#2D7E37', '#4A9C4F'],
  ['#154A2C', '#1F6A3C', '#2E8A50', '#53AB6C'],
  ['#6E3010', '#9C4A16', '#C97122', '#E89E3A'],   // autumn
  ['#1A5030', '#26733C', '#37914B', '#62B462'],
];

function treeArt(seed) {
  const rand = mulberry32(seed + 17);
  const discs = [[13, 13, 11]];
  for (let i = 0; i < 4; i++) discs.push([13 + (rand() - 0.5) * 10, 13 + (rand() - 0.5) * 10, 6 + rand() * 3]);
  return blobArt(26, 26, discs, TREE_TONES[seed % TREE_TONES.length], rand, 0.35);
}

function pineArt(seed) {
  const rand = mulberry32(seed + 5);
  const tones = ['#0B3019', '#14502A', '#1F7339', '#33935A'];
  return makeArt(26, 26, (put) => {
    const grid = [];
    for (let y = 0; y < 26; y++) {
      grid.push([]);
      for (let x = 0; x < 26; x++) {
        const dx = x + 0.5 - 13, dy = y + 0.5 - 13, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
        const reach = 6.5 + 5.5 * Math.pow(Math.abs(Math.cos(3 * a)), 1.6);   // six pointed branches
        grid[y].push(d <= reach ? clampInt((1 - d / reach) * 3.4 + 0.6 + (rand() - 0.5) * 0.7, 0, 3) : -1);
      }
    }
    for (let y = 0; y < 26; y++) {
      for (let x = 0; x < 26; x++) {
        if (grid[y][x] < 0) continue;
        const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => (grid[y + oy] || [])[x + ox] === undefined || grid[y + oy][x + ox] < 0);
        put(x, y, tones[edge ? 0 : grid[y][x]]);
      }
    }
  });
}

function bushArt(seed) {
  const rand = mulberry32(seed + 31);
  const discs = [[7, 7, 6], [4.5, 8, 3.5], [9.5, 5.5, 3.5]];
  return blobArt(14, 14, discs, TREE_TONES[(seed + 1) % 2 === 0 ? 3 : 0], rand, 0.3);
}

function rockArt(seed) {
  const rand = mulberry32(seed + 77);
  return blobArt(12, 10, [[6, 5, 4.6], [4, 6, 3], [8.5, 5, 3]], ['#4A4D52', '#6C7077', '#8E939A', '#B4B9BF'], rand, 0.4);
}

function hayArt() {   // a round bale seen from the end: rings of straw
  return makeArt(12, 12, (put) => {
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 12; x++) {
        const d = Math.hypot(x + 0.5 - 6, y + 0.5 - 6);
        if (d > 5.6) continue;
        const ring = Math.floor(d) % 2 === 0;
        put(x, y, d > 4.6 ? '#8A6A1E' : ring ? '#D8B23C' : '#E9CB5A');
      }
    }
    put(5, 5, '#8A6A1E', 2, 2);
  });
}

function tyresArt() {   // three stacked tyres seen from above, white-banded, lined up along the track
  return makeArt(26, 10, (put) => {
    [[5, 5], [13, 5], [21, 5]].forEach(([cx, cy], i) => {
      for (let y = 0; y < 10; y++) {
        for (let x = cx - 5; x < cx + 5; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (d > 4.7) continue;
          put(x, y, d < 1.6 ? '#050505' : d < 2.6 ? '#2A2A2A' : d < 3.6 ? (i % 2 ? '#E8E8E8' : '#D01010') : '#151515');
        }
      }
    });
  });
}

function barrierArt() {   // a length of armco/concrete barrier with red and white blocks
  return makeArt(24, 6, (put) => {
    put(0, 0, '#9A9A9A', 24, 1);
    put(0, 1, '#F2F2F2', 24, 3);
    for (let i = 0; i < 24; i += 12) put(i, 1, '#D01010', 6, 3);
    put(0, 4, '#B0B0B0', 24, 1);
    put(0, 5, '#6A6A6A', 24, 1);
  });
}

function boardArt(seed) {   // an advertising board on two posts
  const colour = BOARD_COLOURS[seed % BOARD_COLOURS.length];
  const rand = mulberry32(seed + 3);
  return makeArt(24, 6, (put) => {
    put(0, 0, '#444444', 24, 1);
    put(0, 1, colour, 24, 4);
    put(0, 5, '#444444', 24, 1);
    for (let x = 2; x < 20; x += 3 + Math.floor(rand() * 3)) put(x, 2, '#FFFFFF', 2, 2);
    put(20, 2, '#FFD800', 2, 2);
  });
}

function standArt(seed) {
  return makeArt(56, 24, (put) => {
    put(0, 0, '#3A3F46', 56, 6);
    put(0, 0, '#5A616B', 56, 1);
    for (let x = 0; x < 56; x += 7) put(x, 1, '#2A2E34', 1, 5);
    put(0, 6, '#8A9099', 56, 18);
    for (let row = 0; row < 4; row++) {
      put(0, 7 + row * 4 + 3, '#6E747C', 56, 1);
      for (let col = 0; col < 13; col++) {
        const colour = CROWD_COLOURS[(col * 5 + row * 3 + seed) % CROWD_COLOURS.length];
        put(2 + col * 4, 7 + row * 4, colour, 2, 2);
        put(2 + col * 4, 7 + row * 4 + 2, '#2A2E34', 2, 1);
      }
    }
    put(0, 22, '#5E646C', 56, 2);
  });
}

function wingArt() {   // the large pit and paddock building
  return makeArt(84, 38, (put) => {
    put(0, 0, '#B8BDC4', 84, 38);
    put(0, 0, '#FFFFFF', 84, 3);
    put(0, 3, '#D4D8DE', 84, 1);
    put(0, 35, '#8C929A', 84, 3);
    for (let i = 0; i < 10; i++) {
      put(5 + i * 8, 8, '#2F4C66', 6, 7);
      put(5 + i * 8, 8, '#5E86A8', 6, 1);
      put(5 + i * 8, 22, '#2F4C66', 6, 7);
      put(5 + i * 8, 22, '#5E86A8', 6, 1);
    }
    put(0, 17, '#00D2BE', 84, 3);
    put(0, 20, '#00A292', 84, 1);
    put(6, 31, '#9AA0A8', 8, 3);     // rooftop units
    put(66, 31, '#9AA0A8', 10, 3);
    put(30, 31, '#7A8088', 6, 3);
  });
}

function garageArt(seed) {
  return makeArt(64, 20, (put) => {
    put(0, 0, '#9CA2AA', 64, 20);
    put(0, 0, '#E4E7EB', 64, 3);
    put(0, 17, '#6E747C', 64, 3);
    for (let i = 0; i < 5; i++) {
      put(3 + i * 12, 5, CROWD_COLOURS[(i + seed) % CROWD_COLOURS.length], 10, 3);
      put(3 + i * 12, 8, '#26292E', 10, 8);
      put(4 + i * 12, 14, '#3A3F46', 8, 2);
    }
  });
}

function gantryArt() {   // spans the track: 8 pixels along it, 76 across
  return makeArt(8, 76, (put) => {
    for (const y of [0, 70]) {
      put(1, y, '#2A2A2A', 6, 6);
      put(2, y + 1, '#5A5A5A', 3, 2);
    }
    put(2, 6, '#2A2A2A', 1, 64);
    put(5, 6, '#2A2A2A', 1, 64);
    for (let y = 6; y < 70; y++) {
      for (let k = 0; k < 2; k++) put(3 + k, y, ((y >> 1) + k) % 2 ? '#111111' : '#F0F0F0');
    }
  });
}

function pondArt(seed) {
  const rand = mulberry32(seed + 9);
  return makeArt(46, 32, (put) => {
    const discs = [[23, 16, 13], [13, 15, 9], [33, 17, 10], [22, 22, 8]];
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 46; x++) {
        let depth = -1;
        for (const [cx, cy, r] of discs) {
          const d = Math.hypot((x + 0.5 - cx) * 1.15, y + 0.5 - cy);
          if (d <= r) depth = Math.max(depth, 1 - d / r);
        }
        if (depth < 0) continue;
        const shade = depth < 0.12 ? '#6B5A3A' : depth < 0.3 ? '#2E78B8' : depth < 0.65 ? '#2A6FAE' : '#245F96';
        put(x, y, shade);
      }
    }
    for (let i = 0; i < 6; i++) put(10 + Math.floor(rand() * 26), 8 + Math.floor(rand() * 16), '#9AD0F2');   // sparkles
    for (let i = 0; i < 7; i++) put(6 + Math.floor(rand() * 34), 2 + Math.floor(rand() * 28), '#2F8A3A');     // reeds
  });
}

function carparkArt(seed) {
  const rand = mulberry32(seed + 21);
  return makeArt(56, 28, (put) => {
    put(0, 0, '#5C5F66', 56, 28);
    put(0, 0, '#8C9098', 56, 1);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 7; col++) {
        const x = 2 + col * 8, y = 2 + row * 9;
        put(x - 1, y - 1, '#D8D8D8', 1, 8);       // bay line
        if (rand() < 0.7) {
          put(x + 1, y, CROWD_COLOURS[Math.floor(rand() * CROWD_COLOURS.length)], 5, 6);
          put(x + 2, y + 1, '#1E2630', 3, 2);       // windscreen
        }
      }
    }
  });
}

function marshalArt(seed) {   // a marshal post seen from above, with a flag
  return makeArt(14, 14, (put) => {
    put(2, 2, '#7A4A22', 9, 9);
    put(3, 3, '#D07A26', 7, 7);
    put(3, 3, '#F0A040', 7, 1);
    put(3, 3, '#F0A040', 1, 7);
    put(10, 1, '#444444', 1, 4);
    put(11, 1, seed % 2 ? '#FFD800' : '#2E9E3E', 2, 2);
  });
}

function flowersArt(seed) {
  const rand = mulberry32(seed + 61);
  const colours = ['#F4F4F4', '#FFD800', '#E85AA0', '#8A5AE8'];
  return makeArt(10, 10, (put) => {
    for (let i = 0; i < 6; i++) {
      const x = 1 + Math.floor(rand() * 8), y = 1 + Math.floor(rand() * 8);
      put(x, y, colours[(seed + i) % colours.length]);
      if (i % 2 === 0) put(x + 1, y, '#2F8A3A');
    }
  });
}

function pitwallArt() {   // the low wall between the track and the pit lane
  return makeArt(24, 6, (put) => {
    put(0, 0, '#2A5FA8', 24, 1);
    put(0, 1, '#F2F2F2', 24, 3);
    for (let x = 4; x < 24; x += 8) put(x, 1, '#CBD2D9', 1, 3);
    put(0, 4, '#B8B8B8', 24, 1);
    put(0, 5, '#6A6A6A', 24, 1);
  });
}

function pitsignArt() {   // PIT and an arrow, painted on the entry road
  const glyph = {
    P: ['###', '#.#', '###', '#..', '#..'],
    I: ['###', '.#.', '.#.', '.#.', '###'],
    T: ['###', '.#.', '.#.', '.#.', '.#.'],
    '>': ['#..', '##.', '###', '##.', '#..'],
  };
  return makeArt(16, 7, (put) => {
    let x = 0;
    for (const ch of ['P', 'I', 'T', '>']) {
      glyph[ch].forEach((row, y) => [...row].forEach((c, k) => { if (c === '#') put(x + k, 1 + y, '#F4F4F4'); }));
      x += ch === 'T' ? 5 : 4;
    }
  });
}

// A rooftop seen from above: terracotta, cream, grey or pink, sometimes with a pool in a courtyard.
const ROOFS = [
  ['#B8553A', '#CF6B4A', '#E08560'],   // terracotta
  ['#C9B98F', '#DCCFA6', '#EEE3BE'],   // cream
  ['#6E737C', '#868B94', '#A0A5AE'],   // grey
  ['#C98E86', '#DBA59D', '#EBBFB7'],   // pink
];
function buildingArt(seed) {
  const rand = mulberry32(seed + 41);
  const w = 34 + (seed % 3) * 8, h = 26 + (seed % 2) * 10;
  const tones = ROOFS[seed % ROOFS.length];
  return makeArt(w, h, (put) => {
    put(0, 0, '#3A3A40', w, h);                     // outline and shadow
    put(1, 1, tones[1], w - 3, h - 3);
    put(1, 1, tones[2], w - 3, 2);                  // lit top edge
    put(1, 1, tones[2], 2, h - 3);
    put(w - 3, 1, tones[0], 2, h - 3);              // shaded right and bottom edges
    put(1, h - 3, tones[0], w - 3, 2);
    for (let i = 0; i < 4; i++) {                   // roof units, skylights and chimneys
      const x = 4 + Math.floor(rand() * (w - 12)), y = 4 + Math.floor(rand() * (h - 10));
      put(x, y, i % 2 ? '#9AA0A8' : '#5E86A8', 4, 3);
    }
    if (seed % 4 === 3) { put(w / 2 - 5, h / 2 - 4, '#2C7CC0', 10, 7); put(w / 2 - 5, h / 2 - 4, '#6AB4E8', 10, 1); }   // a pool
  });
}

function waterArt(seed) {   // flat harbour water, so that overlapping tiles blend into one
  const rand = mulberry32(seed + 13);
  return makeArt(64, 48, (put) => {
    put(0, 0, '#2A78B8', 64, 48);
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(rand() * 60), y = Math.floor(rand() * 46);
      put(x, y, rand() < 0.5 ? '#3A8CCC' : '#2268A6', 3 + Math.floor(rand() * 4), 1);
    }
    for (let i = 0; i < 6; i++) put(Math.floor(rand() * 62), Math.floor(rand() * 46), '#BFE3FA');
  });
}

function yachtArt(seed) {   // a yacht seen from above, pointing along the track
  const deck = seed % 2 ? '#B98A52' : '#E8E8E8';
  return makeArt(40, 14, (put) => {
    const hull = (x, y, w, h, c) => put(x, y, c, w, h);
    hull(2, 3, 30, 8, '#F4F4F4');          // hull
    hull(32, 4, 4, 6, '#F4F4F4');          // bow tapering
    hull(36, 5, 2, 4, '#F4F4F4');
    hull(38, 6, 1, 2, '#F4F4F4');
    hull(3, 4, 26, 6, deck);               // deck
    hull(8, 5, 12, 4, '#E8E8E8');          // cabin
    hull(10, 6, 8, 2, '#4A6A88');          // windows
    hull(2, 3, 30, 1, '#2A5FA8');          // stripe
    put(0, 5, '#9AD0F2', 2, 4);            // wake
  });
}

// make: builds the canvas for a variant. rotate: turn with the track. shadow: soft ground shadow
// (offset and size in art pixels). variants: how many different looks to cache.
const SCENERY_ART = {
  tree:    { variants: 8, make: (v) => (v % 4 === 3 ? pineArt(v) : treeArt(v)), rotate: false, shadow: { dx: 3, dy: 3, rx: 11, ry: 9 } },
  bush:    { variants: 4, make: bushArt, rotate: false, shadow: { dx: 1.5, dy: 1.5, rx: 6, ry: 5 } },
  rock:    { variants: 3, make: rockArt, rotate: false, shadow: { dx: 1.5, dy: 1.5, rx: 5, ry: 4 } },
  hay:     { variants: 1, make: hayArt, rotate: false, shadow: { dx: 1.5, dy: 1.5, rx: 6, ry: 5 } },
  tyres:   { variants: 1, make: tyresArt, rotate: true, shadow: { dx: 1.5, dy: 1.5, rx: 12, ry: 5 } },
  barrier: { variants: 1, make: barrierArt, rotate: true, shadow: null },
  board:   { variants: 5, make: boardArt, rotate: true, shadow: null },
  stand:   { variants: 3, make: standArt, rotate: true, shadow: null },
  wing:    { variants: 1, make: wingArt, rotate: true, shadow: null },
  garage:  { variants: 2, make: garageArt, rotate: true, shadow: null },
  gantry:  { variants: 1, make: gantryArt, rotate: true, shadow: null },
  pond:    { variants: 3, make: pondArt, rotate: false, shadow: null },
  carpark: { variants: 2, make: carparkArt, rotate: true, shadow: null },
  marshal: { variants: 2, make: marshalArt, rotate: false, shadow: { dx: 2, dy: 2, rx: 6, ry: 5 } },
  flowers: { variants: 4, make: flowersArt, rotate: false, shadow: null },
  pitwall: { variants: 1, make: pitwallArt, rotate: true, shadow: null },
  building: { variants: 12, make: buildingArt, rotate: true, shadow: { dx: 3, dy: 3, rx: 16, ry: 12 } },
  water:   { variants: 4, make: waterArt, rotate: true, shadow: null },
  yacht:   { variants: 4, make: yachtArt, rotate: true, shadow: { dx: 2, dy: 2, rx: 17, ry: 5 } },
  pitsign: { variants: 1, make: pitsignArt, rotate: true, shadow: null },
};
const sceneryArtCache = {};

// The picture for a scenery object: { canvas, rotate, shadow }.
function sceneryArt(sp) {
  const spec = SCENERY_ART[sp.type];
  if (!spec) throw new Error('no scenery art for object type "' + sp.type + '"');
  const variant = sp.seed % spec.variants;
  const key = sp.type + ':' + variant;
  if (!sceneryArtCache[key]) sceneryArtCache[key] = { canvas: spec.make(variant), rotate: spec.rotate, shadow: spec.shadow };
  return sceneryArtCache[key];
}
