'use strict';

// Pixel art, drawn in code from rects into small offscreen canvases (no image files), as in P1's sprites.js.
// Placeholder art: original designs, no Battletech shapes.

function rect(g, colour, x, y, w, h) { g.fillStyle = colour; g.fillRect(x, y, w, h); }

function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  draw(g);
  return c;
}

const SIDE_COLOURS = {
  player: { body: '#6d7f95', hi: '#9fb2c8', lo: '#3d4958', accent: '#e2572b' },
  enemy:  { body: '#6f7f5c', hi: '#a2b58a', lo: '#3f4a36', accent: '#e6d34a' },
};
const OUTLINE = '#1b2028', VISOR = '#ffb347', GUN = '#111';

// One top-down sprite per weight class, 40 x 40, facing up, drawn from rects and recoloured per side. The heavier the
// class, the broader and more armoured it looks, so the class can be told at a glance:
//   light   slim and quick: thin legs, a narrow body, small arm guns
//   medium  the balanced standard mech: arm weapons, a shoulder pod
//   heavy   broad torso, thick legs, big arm cannon and shoulder pods
//   assault huge: wide armoured torso, massive legs and arm cannon, two shoulder missile racks
const SPRITE_SIZE = 40;
const MECH_CLASSES = ['light', 'medium', 'heavy', 'assault'];

function drawLight(g, c) {
  for (const x of [14, 23]) { rect(g, OUTLINE, x, 23, 4, 12); rect(g, c.lo, x + 1, 24, 2, 10); rect(g, OUTLINE, x - 1, 33, 6, 3); }   // thin legs, small feet
  rect(g, OUTLINE, 13, 12, 14, 13); rect(g, c.body, 14, 13, 12, 11); rect(g, c.hi, 14, 13, 12, 2); rect(g, c.lo, 15, 21, 10, 2);        // narrow torso
  rect(g, c.accent, 14, 17, 1, 3); rect(g, c.accent, 25, 17, 1, 3);
  rect(g, OUTLINE, 18, 15, 4, 4); rect(g, VISOR, 19, 16, 2, 2);                                                                          // cockpit
  for (const x of [9, 28]) { rect(g, OUTLINE, x, 11, 4, 12); rect(g, c.body, x + 1, 12, 2, 10); rect(g, c.hi, x + 1, 12, 1, 10); }       // thin arms
  rect(g, GUN, 10, 6, 2, 6); rect(g, GUN, 28, 6, 2, 6);                                                                                  // small guns
  rect(g, c.accent, 19, 9, 2, 3);                                                                                                        // head sensor
}

function drawMedium(g, c) { // the original sprite, centred in the larger canvas
  g.save(); g.translate(4, 4);
  rect(g, OUTLINE, 9, 18, 5, 11); rect(g, OUTLINE, 18, 18, 5, 11);
  rect(g, c.lo, 10, 18, 3, 10); rect(g, c.lo, 19, 18, 3, 10);
  rect(g, OUTLINE, 8, 7, 16, 13); rect(g, c.body, 9, 8, 14, 11); rect(g, c.hi, 9, 8, 14, 2);
  rect(g, c.lo, 12, 16, 8, 3);
  rect(g, c.accent, 9, 13, 2, 4); rect(g, c.accent, 21, 13, 2, 4);
  for (const x of [3, 23]) { rect(g, OUTLINE, x, 6, 6, 16); rect(g, c.body, x + 1, 7, 4, 14); rect(g, c.hi, x + 1, 7, 1, 14); }
  rect(g, GUN, 4, 1, 2, 6); rect(g, GUN, 7, 1, 2, 6);
  rect(g, GUN, 24, 0, 3, 7);
  rect(g, OUTLINE, 18, 4, 5, 6);
  rect(g, c.accent, 19, 5, 1, 2); rect(g, c.accent, 21, 5, 1, 2); rect(g, c.accent, 19, 8, 1, 1); rect(g, c.accent, 21, 8, 1, 1);
  rect(g, OUTLINE, 13, 10, 6, 6); rect(g, VISOR, 14, 11, 4, 2);
  g.restore();
}

function drawHeavy(g, c) {
  for (const x of [10, 23]) { rect(g, OUTLINE, x, 24, 8, 14); rect(g, c.lo, x + 1, 25, 6, 12); rect(g, c.body, x + 2, 25, 4, 4); rect(g, OUTLINE, x - 1, 35, 10, 4); }   // thick legs, big feet
  rect(g, OUTLINE, 8, 9, 24, 19); rect(g, c.body, 9, 10, 22, 17); rect(g, c.hi, 9, 10, 22, 2); rect(g, c.lo, 10, 22, 20, 4);          // broad torso with a lower plate
  rect(g, c.hi, 19, 12, 2, 10);                                                                                                         // spine ridge
  rect(g, c.accent, 10, 14, 2, 6); rect(g, c.accent, 28, 14, 2, 6);
  rect(g, OUTLINE, 16, 12, 8, 5); rect(g, VISOR, 17, 13, 6, 2);                                                                         // cockpit visor
  for (const x of [2, 32]) {                                                                                                            // arms with shoulder pods
    rect(g, OUTLINE, x, 8, 6, 20); rect(g, c.body, x + 1, 9, 4, 18); rect(g, c.hi, x + 1, 9, 1, 18); rect(g, c.lo, x + 1, 24, 4, 3);
    rect(g, OUTLINE, x, 5, 6, 7); rect(g, c.lo, x + 1, 6, 4, 5); rect(g, c.accent, x + 2, 7, 1, 1); rect(g, c.accent, x + 4, 7, 1, 1); rect(g, c.accent, x + 2, 9, 1, 1); rect(g, c.accent, x + 4, 9, 1, 1);
  }
  rect(g, GUN, 3, 0, 4, 6); rect(g, GUN, 33, 0, 4, 6);                                                                                   // arm cannon
}

function drawAssault(g, c) {
  for (const x of [7, 22]) { rect(g, OUTLINE, x, 25, 11, 14); rect(g, c.lo, x + 1, 26, 9, 12); rect(g, c.body, x + 2, 26, 7, 5); rect(g, c.hi, x + 2, 26, 7, 1); rect(g, OUTLINE, x - 1, 36, 13, 4); }   // massive legs and feet
  rect(g, OUTLINE, 5, 8, 30, 22); rect(g, c.body, 6, 9, 28, 20); rect(g, c.hi, 6, 9, 28, 2);                                          // wide armoured torso
  rect(g, c.lo, 7, 22, 26, 6); rect(g, c.hi, 18, 12, 4, 10);
  for (const x of [8, 29]) { rect(g, c.accent, x, 13, 3, 2); rect(g, c.accent, x, 17, 3, 2); }                                         // armour stripes
  rect(g, OUTLINE, 14, 11, 12, 5); rect(g, VISOR, 15, 12, 10, 2);                                                                      // wide visor slit
  for (const x of [0, 35]) {                                                                                                          // huge arms
    rect(g, OUTLINE, x, 7, 5, 23); rect(g, c.body, x + 1, 8, 3, 21); rect(g, c.hi, x + 1, 8, 1, 21); rect(g, c.accent, x + 1, 26, 3, 2);
  }
  rect(g, GUN, 1, 0, 3, 8); rect(g, GUN, 36, 0, 3, 8);                                                                                 // arm cannon
  for (const x of [6, 28]) {                                                                                                          // shoulder missile racks
    rect(g, OUTLINE, x, 3, 8, 7); rect(g, c.lo, x + 1, 4, 6, 5);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) rect(g, c.accent, x + 2 + i * 2, 5 + j * 2, 1, 1);
  }
}

const CLASS_DRAWERS = { light: drawLight, medium: drawMedium, heavy: drawHeavy, assault: drawAssault };

// A copy of a sprite with a colour laid over it (source-atop keeps the shape): bright to flash a mech that was
// hit, dark for a wreck.
function tintedSprite(sprite, colour) {
  return makeCanvas(sprite.width, sprite.height, g => {
    g.drawImage(sprite, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    rect(g, colour, 0, 0, sprite.width, sprite.height);
  });
}

// Every sprite, built once: MECH_SPRITES[class][side], and the hit-flash and wreck versions.
const MECH_SPRITES = {}, MECH_FLASH = {}, MECH_WRECK = {};
for (const cls of MECH_CLASSES) {
  MECH_SPRITES[cls] = {}; MECH_FLASH[cls] = {}; MECH_WRECK[cls] = {};
  for (const side of ['player', 'enemy']) {
    const sprite = makeCanvas(SPRITE_SIZE, SPRITE_SIZE, g => CLASS_DRAWERS[cls](g, SIDE_COLOURS[side]));
    MECH_SPRITES[cls][side] = sprite;
    MECH_FLASH[cls][side] = tintedSprite(sprite, 'rgba(255,245,210,0.85)');
    MECH_WRECK[cls][side] = tintedSprite(sprite, 'rgba(10,8,6,0.72)');
  }
}

// ---------- terrain ----------
// A cheap stable pseudo-random number from a hex and a number, so the scatter on a hex never changes.
function hashHex(c, r, k) {
  const v = Math.sin(c * 12.9898 + r * 78.233 + k * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

const TERRAIN_FILL = { '.': '#66764a', T: '#35603a', H: '#8c7248', '~': '#2d5d8c', R: '#6d6a62', B: '#3e4047', M: '#5b5750', c: '#5d6066', C: '#33363c', P: '#4a4d52', d: '#77736c', G: '#3b3530', W: '#2f4a3c' };
const CONTAINER_COLOURS = ['#a8432f', '#2f6e8f', '#c08a2a', '#3f7a4f', '#7a4f8f', '#8f8a80']; // painted freight containers

// Draws one hex of terrain centred on (x, y). `size` is the hex radius in pixels; the scatter was designed for a
// radius of 34, so its offsets and sizes are scaled by size / 34. The map is drawn once into an offscreen canvas
// by render.js, so this is not in the frame loop.
function drawTerrainHex(g, hexPath, kind, c, r, x, y, size) {
  const k = size / 34;
  hexPath(g, x, y, size);
  g.fillStyle = TERRAIN_FILL[kind];
  g.fill();
  if (kind === '.') {
    for (let i = 0; i < 4; i++) rect(g, '#76865a', x + (hashHex(c, r, i) - 0.5) * 40 * k, y + (hashHex(c, r, i + 9) - 0.5) * 36 * k, Math.max(2, 3 * k), 2);
  } else if (kind === 'T') {
    for (let i = 0; i < 4; i++) {
      const tx = x + (hashHex(c, r, i) - 0.5) * 36 * k, ty = y + (hashHex(c, r, i + 5) - 0.5) * 32 * k;
      g.fillStyle = '#245030'; g.beginPath(); g.arc(tx, ty, 7 * k, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3f7a45'; g.beginPath(); g.arc(tx - 2 * k, ty - 2 * k, 3 * k, 0, Math.PI * 2); g.fill();
    }
  } else if (kind === 'H') {
    g.strokeStyle = '#a88b5c'; g.lineWidth = 1.5;
    hexPath(g, x, y, size * 0.66); g.stroke();
    hexPath(g, x, y, size * 0.33); g.stroke();
  } else if (kind === '~') {
    g.strokeStyle = '#5b95c8'; g.lineWidth = 1.5;
    for (const dy of [-8, 4, 14]) {
      g.beginPath(); g.moveTo(x - 14 * k, y + dy * k);
      g.quadraticCurveTo(x - 7 * k, y + (dy - 4) * k, x, y + dy * k);
      g.quadraticCurveTo(x + 7 * k, y + (dy + 4) * k, x + 14 * k, y + dy * k);
      g.stroke();
    }
  } else if (kind === 'R') {
    for (let i = 0; i < 5; i++) rect(g, '#8a867c', x + (hashHex(c, r, i) - 0.5) * 38 * k, y + (hashHex(c, r, i + 3) - 0.5) * 32 * k, Math.max(3, 6 * k), Math.max(2, 5 * k));
  } else if (kind === 'B') { // a city block: a lit roof, a dark side, and a few windows
    g.fillStyle = '#2b2c31'; g.fillRect(x - 17 * k, y - 11 * k, 34 * k, 28 * k);
    g.fillStyle = '#5b5e68'; g.fillRect(x - 17 * k, y - 17 * k, 34 * k, 12 * k);
    g.fillStyle = '#444752'; g.fillRect(x - 12 * k, y - 15 * k, 12 * k, 8 * k);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = hashHex(c, r, i + 20) > 0.5 ? '#d6b25e' : '#15161a';
      g.fillRect(x - 14 * k + (i % 3) * 11 * k, y - 4 * k + Math.floor(i / 3) * 10 * k, 5 * k, 5 * k);
    }
  } else if (kind === 'M') { // a peak: a dark face, a lit face and a snow cap
    g.fillStyle = '#403c37'; g.beginPath(); g.moveTo(x - 24 * k, y + 16 * k); g.lineTo(x - 4 * k, y - 20 * k); g.lineTo(x + 8 * k, y + 16 * k); g.closePath(); g.fill();
    g.fillStyle = '#7b756b'; g.beginPath(); g.moveTo(x - 4 * k, y - 20 * k); g.lineTo(x + 12 * k, y - 4 * k); g.lineTo(x + 26 * k, y + 16 * k); g.lineTo(x + 8 * k, y + 16 * k); g.closePath(); g.fill();
    g.fillStyle = '#e6e8ec'; g.beginPath(); g.moveTo(x - 4 * k, y - 20 * k); g.lineTo(x - 11 * k, y - 8 * k); g.lineTo(x - 4 * k, y - 11 * k); g.lineTo(x + 3 * k, y - 7 * k); g.closePath(); g.fill();
  } else if (kind === 'c') { // concrete: slab seams and an oil stain or two
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x - 20 * k, y + (hashHex(c, r, 1) - 0.5) * 20 * k); g.lineTo(x + 20 * k, y + (hashHex(c, r, 2) - 0.5) * 20 * k); g.stroke();
    if (hashHex(c, r, 3) > 0.6) { g.fillStyle = 'rgba(20,20,24,0.35)'; g.beginPath(); g.ellipse(x + (hashHex(c, r, 4) - 0.5) * 24 * k, y + (hashHex(c, r, 5) - 0.5) * 20 * k, 7 * k, 4 * k, 0, 0, Math.PI * 2); g.fill(); }
  } else if (kind === 'C') { // a stack of two freight containers, each with a lit top and ribbed side
    for (let i = 0; i < 2; i++) {
      const col = CONTAINER_COLOURS[Math.floor(hashHex(c, r, 30 + i) * CONTAINER_COLOURS.length)];
      const cy = y - 4 * k + i * 15 * k - 6 * k;
      g.fillStyle = '#16181c'; g.fillRect(x - 18 * k, cy + 2 * k, 36 * k, 13 * k);
      g.fillStyle = col; g.fillRect(x - 18 * k, cy, 36 * k, 12 * k);
      g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x - 18 * k, cy, 36 * k, 3 * k);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let j = 0; j < 6; j++) g.fillRect(x - 15 * k + j * 6 * k, cy + 4 * k, 1.5 * k, 7 * k);
    }
  } else if (kind === 'd') { // moon dust: small craters
    for (let i = 0; i < 2; i++) {
      if (hashHex(c, r, 40 + i) < 0.45) continue;
      const cx = x + (hashHex(c, r, 42 + i) - 0.5) * 30 * k, cy = y + (hashHex(c, r, 44 + i) - 0.5) * 26 * k, rad = (3 + hashHex(c, r, 46 + i) * 4) * k;
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1; g.beginPath(); g.arc(cx + 0.5, cy + 0.5, rad, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
    }
  } else if (kind === 'G') { // the hangar floor: hazard stripes and the shadow of the roof
    g.save(); hexPath(g, x, y, size); g.clip();
    g.fillStyle = '#c9a227';
    for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(x + i * 10 * k - 4 * k, y - size); g.lineTo(x + i * 10 * k + 4 * k, y - size); g.lineTo(x + i * 10 * k + 4 * k - size, y + size); g.lineTo(x + i * 10 * k - 4 * k - size, y + size); g.closePath(); g.globalAlpha = 0.18; g.fill(); }
    g.restore();
  } else if (kind === 'W') { // a repair bay: a green-lit plate with a wrench on it
    g.strokeStyle = '#7ee08a'; g.lineWidth = 2; hexPath(g, x, y, size * 0.72); g.stroke();
    g.save(); g.translate(x, y - 2 * k); g.rotate(-Math.PI / 4);
    g.fillStyle = '#cfe8d6';
    g.fillRect(-2.5 * k, -4 * k, 5 * k, 18 * k);                                   // the handle
    g.beginPath(); g.arc(0, -8 * k, 7 * k, 0, Math.PI * 2); g.fill();             // the head
    g.fillStyle = '#2f4a3c'; g.fillRect(-2.5 * k, -16 * k, 5 * k, 9 * k);           // the jaw
    g.restore();
  } else if (kind === 'P') { // a landing pad: a painted ring and hazard marks
    g.strokeStyle = '#d8b13a'; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 15 * k, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#d8b13a';
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; g.fillRect(x + Math.cos(a) * 21 * k - 2 * k, y + Math.sin(a) * 21 * k - 2 * k, 4 * k, 4 * k); }
  } else {
    throw new MapError('terrain', `drawTerrainHex: no art for terrain "${kind}"`);
  }
  hexPath(g, x, y, size);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.stroke();
}
