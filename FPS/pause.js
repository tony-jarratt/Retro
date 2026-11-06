// PAUSE: P stops the game and shows the controls over the frozen view, in
// the HUD's green, like a display inside the helmet. P again carries on.
//
// While paused, main.js skips every update (nothing moves, no timer runs)
// but keeps drawing, so V and C (play-testing) still change the look. The sound is
// suspended too (sound.js), and a click won't fire.

let paused = false;

function togglePause() {
  if (game.state !== 'playing') return; // nothing to pause once you've won or died
  paused = !paused;
  pauseSound(paused);  // sound.js
  mouseTurn = 0;       // player.js: don't turn by however far the mouse moved meanwhile
}

// The controls, as [keys, what they do]. The map, visor and CRT keys, and
// the level chooser, only exist when play-testing (main.js). R and Enter
// aren't listed: the screens where they do something say so.
const CONTROLS = [
  ['WASD', 'MOVE'],
  ['LEFT / RIGHT', 'TURN'],
  ['CLICK / UP', 'FIRE  HOLD TO SPIN UP'],
  ['1 2 3', 'LOAD STANDARD  INCENDIARY  PIERCING'],
  ['CLICK VIEW', 'CAPTURE MOUSE'],
  ['ESC', 'FREE MOUSE'],
  ...(PLAYTEST ? [['M', 'MAP'], ['V', 'VISOR'], ['C', 'CRT']] : []),
  ['N', 'SOUND'],
  ['U', 'MUSIC'],
  ...(PLAYTEST ? [['L', 'LEVEL CHOOSER']] : []),
];

const PAUSE_DIM = 0.65;       // how far the view darkens behind the text
const PAUSE_KEY_COLUMN = 150; // keys end here (right-aligned); what they do starts a little after

function drawPauseScreen(pixels) {
  tintScreen(pixels, [0, 8, 4], PAUSE_DIM);
  drawTextCentred(pixels, 'PAUSED', 22, HUD_GREEN, 3);
  CONTROLS.forEach(([keys, action], n) => {
    const y = 50 + n * 9;
    drawText(pixels, keys, PAUSE_KEY_COLUMN - textWidth(keys, 1), y, HUD_GREEN, 1);
    drawText(pixels, action, PAUSE_KEY_COLUMN + 10, y, [80, 170, 100], 1);
  });
  if (Math.floor(performance.now() / 500) % 2 === 0) { // blinks: animTime is frozen
    drawTextCentred(pixels, 'PRESS P TO CARRY ON', 50 + CONTROLS.length * 9 + 8, HUD_GREEN, 1);
  }
}
