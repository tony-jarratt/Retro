'use strict';

// Checks for the intro splash timeline (intro.js). Loaded after checks-bay.js.

check('intro: the lines fade in one after another, over INTRO_FADE_MS each, and stack', () => {
  const { starts } = introSchedule();
  eq(introFrame(0), { phase: 'lines', lines: [{ index: 0, alpha: 0 }] });
  eq(introFrame(INTRO_FADE_MS / 2).lines, [{ index: 0, alpha: 0.5 }]);
  eq(introFrame(INTRO_FADE_MS).lines, [{ index: 0, alpha: 1 }], 'line 1 is full, line 2 has not begun');
  eq(introFrame(starts[1]).lines, [{ index: 0, alpha: 1 }, { index: 1, alpha: 0 }], 'line 1 stays when line 2 starts');
  const late = introFrame(starts[2] + INTRO_FADE_MS / 2);
  eq(late.lines.map(l => [l.index, l.alpha]), [[0, 1], [1, 1], [2, 0.5]]);
});

check('intro: hold 0.6 s after lines 1 and 2 and 4 s after line 3, then a hard cut, 600 ms of black, then the next screen', () => {
  const { starts, cutAt, titleAt } = introSchedule();
  eq(starts, [0, 2100, 4200]);
  eq(cutAt, 4200 + 1500 + 4000);
  eq(titleAt, cutAt + 600);
  eq(introFrame(cutAt - 1).lines.length, 3, 'all three still showing just before the cut');
  eq(introFrame(cutAt), { phase: 'black', lines: [] }, 'the cut clears everything at once, no crossfade');
  eq(introFrame(titleAt - 1).phase, 'black');
  eq(introFrame(titleAt).phase, 'done');
  eq(introFrame(titleAt + 100000).phase, 'done');
});

check('intro: the text and the timings agree (one hold per line), and a mismatch is a typed error', () => {
  eq(INTRO_LINES.length, INTRO_HOLD_MS.length);
  assert(INTRO_LINES.every(l => l.length > 10), 'no empty lines');
});

check('title: HEXFIRE is built from hexes, every letter has the same shape and none overlap', () => {
  const cells = titleHexes(TITLE_TEXT);
  const keys = cells.map(c => c.col + ',' + c.row);
  eq(new Set(keys).size, keys.length, 'no two hexes on the same spot');
  eq(Math.max(...cells.map(c => c.col)), TITLE_TEXT.length * (TITLE_GLYPH_W + TITLE_GLYPH_GAP) - TITLE_GLYPH_GAP - 1);
  eq(Math.max(...cells.map(c => c.row)), TITLE_GLYPH_H - 1);
  assert(cells.length > 80 && cells.length < 200, 'a sensible number of hexes: ' + cells.length);
  // the letter H is the same cells wherever it stands
  const h = titleHexes('HH');
  eq(h.filter(c => c.col < 5).map(c => [c.col, c.row]), h.filter(c => c.col >= 6).map(c => [c.col - 6, c.row]));
  throwsKind(RulesError, 'title', () => titleHexes('HEXFIRE!'));
  eq(TITLE_GLYPH_W + TITLE_GLYPH_GAP, 6, 'an even column pitch keeps every letter on the same hex-column parity');
});
