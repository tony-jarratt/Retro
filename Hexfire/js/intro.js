'use strict';

// The intro splash: three lines of text fade in one after another on black, stacked, then a hard cut to black, a short wait, and
// the title card. Pure timeline (no drawing, no DOM): introFrame(elapsedMs) says what is on screen, so it can be tested.
// Everything to edit is here: the lines and the timings.

const INTRO_LINES = [
  'The Consortium bought the world. The Free Republics raised what armies they could, and lost.',
  'Ragged, unpaid, outgunned, you still have one last mission: to wipe the slate clean.',
  'You fought for an ideal. Now you fight for each other.',
];
const INTRO_FADE_MS = 1500;          // each line fades in over this long
const INTRO_HOLD_MS = [600, 600, 4000]; // how long to hold after each line has finished fading in, before the next line (or the cut)
const TITLE_IMAGE = 'img/loading-bg.svg'; // the picture behind the title card (a photo or an SVG with a width and height, wide is best); if the file is missing the card falls back to plain hexes, with a console warning
const INTRO_BLACK_MS = 600;          // the hard cut: nothing on screen this long before the title card

// Where each line starts, and when everything is cleared.
function introSchedule() {
  if (INTRO_HOLD_MS.length !== INTRO_LINES.length) throw new RulesError('intro', `${INTRO_LINES.length} intro lines but ${INTRO_HOLD_MS.length} hold times`);
  const starts = [];
  let t = 0;
  for (let i = 0; i < INTRO_LINES.length; i++) { starts.push(t); t += INTRO_FADE_MS + INTRO_HOLD_MS[i]; }
  return { starts, cutAt: t, titleAt: t + INTRO_BLACK_MS };
}

// What is on screen `ms` after the intro started: { phase: 'lines' | 'black' | 'done', lines: [{ index, alpha }] }.
// Lines stack (an earlier line stays at full strength), and the cut clears them all at once, with no crossfade.
function introFrame(ms) {
  const { starts, cutAt, titleAt } = introSchedule();
  if (ms >= titleAt) return { phase: 'done', lines: [] };
  if (ms >= cutAt) return { phase: 'black', lines: [] };
  const lines = [];
  starts.forEach((start, index) => {
    if (ms >= start) lines.push({ index, alpha: Math.min(1, (ms - start) / INTRO_FADE_MS) });
  });
  return { phase: 'lines', lines };
}

// ---------- the title, built from hexes ----------
// A 5 x 7 pixel font for the letters of the title, one string per row, X = a lit hex. The hexes sit on the map's own layout (flat-top,
// odd columns half a hex lower), so every letter leans a little, the way the hex map does.
const TITLE_TEXT = 'HEXFIRE';
const TITLE_GLYPHS = {
  H: ['X...X', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
  E: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'],
  X: ['X...X', 'X...X', '.X.X.', '..X..', '.X.X.', 'X...X', 'X...X'],
  F: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'X....'],
  I: ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', 'XXXXX'],
  R: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X.X..', 'X..X.', 'X...X'],
};
const TITLE_GLYPH_W = 5, TITLE_GLYPH_H = 7, TITLE_GLYPH_GAP = 1; // gap in columns; an even width + gap keeps every letter on the same column parity

// The lit hexes of a text as [{ col, row }], columns counted across the whole title. An unknown letter is an error (no silent blank).
function titleHexes(text) {
  const cells = [];
  [...text].forEach((ch, n) => {
    const glyph = TITLE_GLYPHS[ch];
    if (!glyph) throw new RulesError('title', `The title font has no letter "${ch}"`);
    if (glyph.length !== TITLE_GLYPH_H || glyph.some(row => row.length !== TITLE_GLYPH_W)) throw new RulesError('title', `The glyph for "${ch}" is not ${TITLE_GLYPH_W} x ${TITLE_GLYPH_H}`);
    glyph.forEach((rowText, row) => {
      for (let c = 0; c < TITLE_GLYPH_W; c++) if (rowText[c] === 'X') cells.push({ col: n * (TITLE_GLYPH_W + TITLE_GLYPH_GAP) + c, row });
    });
  });
  return cells;
}
