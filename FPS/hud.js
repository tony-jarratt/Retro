// The HUD (heads-up display): everything drawn flat on top of the 3D view,
// straight into the same pixel buffer: the gun and its ammo counter, the
// crosshair, the health bar, keycards, the damage and pickup flashes, and messages.
// Styled like a green-phosphor CRT readout.

const HUD_GREEN = [120, 255, 150];
const HUD_WARN = [255, 96, 64];
const PA_COLOUR = [255, 214, 120]; // the building's PA: the Manager (manager.js)
const CONTROLS_HINT_TIME = 5; // seconds 'PRESS P FOR CONTROLS' shows as a level starts

// A BITMAP FONT. Each character is a 3x5 grid of pixels: '#' on, '.' off.
// Drawing text is just stamping these grids side by side, 1 pixel apart.
// Only the characters actually used are defined (the HUD's, and the
// stencilled signs in decals.js).
const FONT = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '..#', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  'A': ['.#.', '#.#', '###', '#.#', '#.#'],
  'B': ['##.', '#.#', '##.', '#.#', '##.'],
  'C': ['.##', '#..', '#..', '#..', '.##'],
  'D': ['##.', '#.#', '#.#', '#.#', '##.'],
  'E': ['###', '#..', '##.', '#..', '###'],
  'F': ['###', '#..', '##.', '#..', '#..'],
  'G': ['.##', '#..', '#.#', '#.#', '.##'],
  'H': ['#.#', '#.#', '###', '#.#', '#.#'],
  'I': ['###', '.#.', '.#.', '.#.', '###'],
  'K': ['#.#', '#.#', '##.', '#.#', '#.#'],
  'L': ['#..', '#..', '#..', '#..', '###'],
  'M': ['#.#', '###', '###', '#.#', '#.#'],
  'N': ['###', '#.#', '#.#', '#.#', '#.#'],
  'O': ['.#.', '#.#', '#.#', '#.#', '.#.'],
  'P': ['##.', '#.#', '##.', '#..', '#..'],
  'R': ['##.', '#.#', '##.', '#.#', '#.#'],
  'S': ['.##', '#..', '.#.', '..#', '##.'],
  'T': ['###', '.#.', '.#.', '.#.', '.#.'],
  'U': ['#.#', '#.#', '#.#', '#.#', '###'],
  'V': ['#.#', '#.#', '#.#', '#.#', '.#.'],
  'X': ['#.#', '#.#', '.#.', '#.#', '#.#'],
  'W': ['#.#', '#.#', '###', '###', '#.#'],
  'Y': ['#.#', '#.#', '.#.', '.#.', '.#.'],
  'J': ['..#', '..#', '..#', '#.#', '.#.'],
  'Q': ['.#.', '#.#', '#.#', '##.', '.##'],
  'Z': ['###', '..#', '.#.', '#..', '###'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '.': ['...', '...', '...', '...', '.#.'],
  ',': ['...', '...', '...', '.#.', '#..'],
  ':': ['...', '.#.', '...', '.#.', '...'],
  '-': ['...', '...', '###', '...', '...'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  "'": ['.#.', '.#.', '...', '...', '...'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
  ' ': ['...', '...', '...', '...', '...'],
};

function putPixel(pixels, x, y, rgb) {
  if (x < 0 || x >= SCREEN_W || y < 0 || y >= SCREEN_H) return; // off screen: clipped
  const i = (y * SCREEN_W + x) * 4;
  pixels[i] = rgb[0];
  pixels[i + 1] = rgb[1];
  pixels[i + 2] = rgb[2];
  pixels[i + 3] = 255;
}

function fillRect(pixels, x, y, w, h, rgb) {
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) putPixel(pixels, col, row, rgb);
  }
}

function textWidth(text, scale) {
  return (text.length * 4 - 1) * scale; // 3 pixels per character plus 1 gap, no gap after the last
}

// Draw text with its top-left at (x, y), each font pixel `scale` screen
// pixels square, over a 1-step black shadow so it reads on any background.
function drawText(pixels, text, x, y, rgb, scale) {
  for (const [colour, offset] of [[[0, 0, 0], scale], [rgb, 0]]) {
    for (let n = 0; n < text.length; n++) {
      const glyph = FONT[text[n]];
      if (!glyph) throw new Error(`HUD font has no character "${text[n]}" (in "${text}"); add it to FONT in hud.js.`);
      for (let gy = 0; gy < 5; gy++) {
        for (let gx = 0; gx < 3; gx++) {
          if (glyph[gy][gx] !== '#') continue;
          fillRect(pixels, x + (n * 4 + gx) * scale + offset, y + gy * scale + offset, scale, scale, colour);
        }
      }
    }
  }
}

function drawTextCentred(pixels, text, y, rgb, scale) {
  drawText(pixels, text, Math.floor((SCREEN_W - textWidth(text, scale)) / 2), y, rgb, scale);
}

// Stamp a texture onto the screen as a `size` x `size` square, skipping
// see-through texels. No perspective here: the HUD is flat. It works screen
// pixel by screen pixel, asking which texel lands there (the same "nearest
// texel" lookup the walls use), so any size works, not just whole multiples
// of 64: at 96, every other texel is drawn two pixels wide, the rest one.
function drawTextureFlat(pixels, tex, x, y, size) {
  for (let row = 0; row < size; row++) {
    const ty = Math.floor(row * TEX_SIZE / size);
    for (let col = 0; col < size; col++) {
      const tx = Math.floor(col * TEX_SIZE / size);
      if (isTransparent(tex, tx, ty)) continue;
      const t = (ty * TEX_SIZE + tx) * 4;
      putPixel(pixels, x + col, y + row, [tex.pixels[t], tex.pixels[t + 1], tex.pixels[t + 2]]);
    }
  }
}

// The gun: 1.5x size (96 pixels square) at the bottom centre. It bobs in a
// figure-of-eight as you walk (sideways at the step rate, up and down at
// twice it), and kicks down while its muzzle flash shows.
const GUN_SIZE = 96;
function drawGun(pixels) {
  const bobX = Math.round(Math.sin(player.walkTime * 6) * 4);
  const bobY = Math.round(Math.abs(Math.cos(player.walkTime * 6)) * 4);
  const recoil = gun.flash > 0 ? currentMode().recoil : 0;
  const x = Math.round(SCREEN_W / 2 - GUN_SIZE / 2) + bobX;
  // +18 sinks the gun so its muzzle sits well below the crosshair, with the
  // hand's bottom edge off screen.
  const y = SCREEN_H - GUN_SIZE + 18 + bobY + recoil;
  drawTextureFlat(pixels, GUN_TEXTURES[litCoils()][gun.flash > 0 ? 1 : 0], x, y, GUN_SIZE);
  drawAmmoCounter(pixels, x, y);
}

// THE COILS show the gun spinning up (weapons.js): one lit per mode reached.
// While it winds up towards the next mode, the next coil flickers, on for a
// growing share of each flicker and the flicker itself speeding up, until it
// stays on. `progress` runs 0 -> 1 between one mode and the next.
function litCoils() {
  const { lit, progress } = spinUpState();
  if (progress === null) return lit;
  const rate = 6 + 24 * progress;                          // flickers per second: faster as it nears
  const phase = (animTime * rate) % 1;                     // where we are in this flicker, 0..1
  return phase < progress * progress ? lit + 1 : lit;      // on for a growing share of it
}

// A small gap-centred cross on the exact centre pixel the shot tests.
function drawCrosshair(pixels) {
  const cx = SCREEN_W / 2;
  const cy = SCREEN_H / 2;
  const colour = HUD_GREEN;
  for (const d of [2, 3]) {
    putPixel(pixels, cx + d, cy, colour);
    putPixel(pixels, cx - d, cy, colour);
    putPixel(pixels, cx, cy + d, colour);
    putPixel(pixels, cx, cy - d, colour);
  }
}

// Blend every pixel on screen towards a colour: amount 0 = unchanged, 1 = solid.
function tintScreen(pixels, rgb, amount) {
  for (let i = 0; i < pixels.length; i += 4) {
    for (let c = 0; c < 3; c++) pixels[i + c] += (rgb[c] - pixels[i + c]) * amount;
  }
}

// The readouts run along one line in the visor's bottom rim (visor.js):
// your suit's ARMOUR and its bar on the left, keycards on the right.
const READOUT_Y = SCREEN_H - 6;
const READOUT_MARGIN = 10;

function drawArmour(pixels) {
  const label = 'ARMOUR ' + player.armour;
  const low = player.armour <= 30;
  drawText(pixels, label, READOUT_MARGIN, READOUT_Y, low ? HUD_WARN : HUD_GREEN, 1);
  const x = READOUT_MARGIN + textWidth(label, 1) + 4; // the bar sits just after the label
  const y = READOUT_Y;
  // Breached: no bar, just a blinking warning where it was.
  if (player.armour === 0) {
    if (Math.floor(animTime * 4) % 2 === 0) drawText(pixels, 'SUIT BREACH', x, y, HUD_WARN, 1);
    return;
  }
  fillRect(pixels, x, y, 62, 6, [0, 0, 0]);             // bar border
  fillRect(pixels, x + 1, y + 1, 60, 4, [20, 60, 30]);  // empty part
  // The bar is cut into 5-pixel segments, like an old LED gauge.
  const filled = Math.ceil(12 * player.armour / PLAYER_MAX_ARMOUR); // any armour at all shows a segment
  for (let seg = 0; seg < filled; seg++) {
    fillRect(pixels, x + 1 + seg * 5, y + 1, 4, 4, low ? HUD_WARN : [60, 200, 90]);
  }
}

// THE AMMO COUNTER on the gun: two red seven-segment digits, like an LED
// panel. Each digit is 3 pixels wide and 5 tall, and lights some of its
// seven segments:
//      aaa
//      f b        a top, b top right, c bottom right, d bottom,
//      ggg        e bottom left, f top left, g middle
//      e c
//      ddd
// Unlit segments still glow faintly, as on a real panel. It's drawn straight
// onto the screen each frame, over the gun's dark counter window, so it
// moves with the gun and always shows the live count. Empty, it blinks 00.
const SEGMENTS = {
  a: [[0, 0], [1, 0], [2, 0]], b: [[2, 0], [2, 1], [2, 2]], c: [[2, 2], [2, 3], [2, 4]],
  d: [[0, 4], [1, 4], [2, 4]], e: [[0, 2], [0, 3], [0, 4]], f: [[0, 0], [0, 1], [0, 2]],
  g: [[0, 2], [1, 2], [2, 2]],
};
const DIGIT_SEGMENTS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
const LED_ON = [255, 64, 40];
const LED_OFF = [58, 14, 10];

function drawSegmentDigit(pixels, digit, x, y, lit) {
  // Unlit segments first, then the lit ones over them, so where two segments
  // share a corner pixel, lit wins.
  for (const name in SEGMENTS) for (const [sx, sy] of SEGMENTS[name]) putPixel(pixels, x + sx, y + sy, LED_OFF);
  if (!lit) return;
  for (const name of DIGIT_SEGMENTS[digit]) for (const [sx, sy] of SEGMENTS[name]) putPixel(pixels, x + sx, y + sy, LED_ON);
}

// gunX, gunY: where drawGun put the gun's top-left corner. The counter window
// is texture rows 37-42, centred, so 38 * (GUN_SIZE / 64) down from the top.
function drawAmmoCounter(pixels, gunX, gunY) {
  const shown = Math.min(99, player.ammo);
  const lit = shown > 0 || Math.floor(animTime * 3) % 2 === 0; // empty: blink
  const cx = gunX + GUN_SIZE / 2;
  const top = gunY + Math.round(38 * GUN_SIZE / TEX_SIZE);
  drawSegmentDigit(pixels, Math.floor(shown / 10), cx - 4, top, lit);
  drawSegmentDigit(pixels, shown % 10, cx, top, lit);
}

// The keycards you're carrying: a small card in each colour, just left of the ammo count.
function drawKeys(pixels) {
  const right = SCREEN_W - READOUT_MARGIN; // bottom right of the visor rim
  player.keys.forEach((colour, n) => {
    const x = right - 9 - n * 11;
    fillRect(pixels, x, READOUT_Y, 9, 6, [0, 0, 0]);
    fillRect(pixels, x + 1, READOUT_Y + 1, 7, 4, KEY_COLOURS[colour]);
    fillRect(pixels, x + 1, READOUT_Y + 2, 7, 1, [235, 235, 235]); // stripe
  });
  // The lift key, once it's yours (core.js): a gold card.
  const held = player.keys.length;
  const liftKey = OBJECTIVE === 'liftkey' && core.state === 'destroyed';
  if (liftKey) {
    const x = right - 9 - held * 11;
    fillRect(pixels, x, READOUT_Y, 9, 6, [0, 0, 0]);
    fillRect(pixels, x + 1, READOUT_Y + 1, 7, 4, LIFT_KEY_COLOUR);
    fillRect(pixels, x + 1, READOUT_Y + 2, 7, 1, [235, 235, 235]);
  }
  // The demolition charge, if you're carrying it (charge.js): a khaki block with a red lamp.
  if (player.charge) {
    const x = right - 9 - (held + (liftKey ? 1 : 0)) * 11;
    fillRect(pixels, x, READOUT_Y, 9, 6, [0, 0, 0]);
    fillRect(pixels, x + 1, READOUT_Y + 2, 7, 3, [168, 160, 122]);
    fillRect(pixels, x + 3, READOUT_Y + 1, 3, 1, [60, 62, 66]);
    fillRect(pixels, x + 4, READOUT_Y + 1, 1, 1, [255, 40, 30]);
  }
}

// DEAD: the suit's display shuts down, one raster line at a time. Each row
// of pixels has its own moment to go (a repeatable random time from noise(),
// within SHUTDOWN_TIME): it flares white for an instant, as a CRT line does,
// then fades to black. Then TERMINATED comes up on the dead screen.
const SHUTDOWN_TIME = 1.2;   // seconds until the last line is gone
const LINE_FADE = 0.12;      // seconds each line takes to die
function displayShutdown(pixels, t) {
  for (let y = 0; y < SCREEN_H; y++) {
    const offAt = noise(y, 0, 130) * (SHUTDOWN_TIME - LINE_FADE);
    if (t < offAt) continue;
    const since = t - offAt;
    const row = y * SCREEN_W * 4;
    if (since < 0.03) {
      for (let i = row; i < row + SCREEN_W * 4; i += 4) { pixels[i] = 230; pixels[i + 1] = 255; pixels[i + 2] = 235; } // the flare
      continue;
    }
    const keep = Math.max(0, 1 - since / LINE_FADE);
    for (let i = row; i < row + SCREEN_W * 4; i += 4) for (let k = 0; k < 3; k++) pixels[i + k] *= keep;
  }
}

function drawHud(pixels) {
  if (game.state === 'title' || game.state === 'briefing') { drawCampaignScreen(pixels); return; } // campaign.js
  if (game.state !== 'dead' && !paused) {
    drawGun(pixels);
    if (game.state !== 'clear') drawCrosshair(pixels); // it'd sit on the tally
  }

  // Red damage flash, fading out over PLAYER_HURT_FLASH seconds.
  if (game.hurtFlash > 0) tintScreen(pixels, [200, 0, 0], 0.45 * game.hurtFlash / PLAYER_HURT_FLASH);
  // Gold flash for collecting something.
  if (game.pickupFlash > 0) tintScreen(pixels, [255, 210, 90], 0.3 * game.pickupFlash / PICKUP_FLASH_TIME);
  drawSporeTint(pixels); // spores.js: standing in a spore cloud
  // The helmet visor goes over the view but under the readouts, which sit on
  // its frame like displays built into the helmet (visor.js).
  if (visorOn) applyVisor(pixels);

  drawArmour(pixels);
  drawKeys(pixels);
  if (paused) { drawPauseScreen(pixels); return; } // pause.js: the controls, instead of any messages
  if (game.state === 'dead') displayShutdown(pixels, game.endTime);
  if (game.state === 'playing') {
    if (liftHint) drawTextCentred(pixels, OBJECTIVE_LOOK.liftHint, 40, HUD_WARN, 1); // core.js
    if (lockedDoorHint) {
      drawTextCentred(pixels, lockedDoorHint.toUpperCase() + ' KEYCARD NEEDED', 40, KEY_COLOURS[lockedDoorHint], 1);
    }
    if (sealedDoorHint) drawTextCentred(pixels, 'DOOR SEALED', 40, HUD_WARN, 1); // manager.js
    drawChargeReadout(pixels); // charge.js: setting it, and the fuse
    // The Manager on the PA (manager.js), and its ID badge when you first see it.
    if (paTime > 0) drawTextCentred(pixels, 'PA: ' + paMessage, 30, PA_COLOUR, 1);
    if (badgeTime > 0) {
      fillRect(pixels, 104, 140, 112, 20, [226, 224, 214]);
      fillRect(pixels, 104, 140, 112, 4, LANYARD);
      drawTextCentred(pixels, badgeShown[0], 146, [30, 30, 36], 1);
      drawTextCentred(pixels, badgeShown[1], 153, [80, 80, 90], 1);
    }
    if (weaponMessageTime > 0) drawTextCentred(pixels, weaponMessage, 62, HUD_GREEN, 2); // weapons.js
    if (securityMessageTime > 0) {
      const ok = securityMessage === 'CAMERAS OFFLINE' || securityMessage === OBJECTIVE_LOOK.goal;
      drawTextCentred(pixels, securityMessage, 50, ok ? HUD_GREEN : HUD_WARN, 2);
    }
    // While any alarm is going, a red ALARM blinks at the top of the screen.
    if (Object.values(alarms).some((t) => t > 0) && Math.floor(animTime * 3) % 2 === 0) {
      drawTextCentred(pixels, 'ALARM', 1, HUD_WARN, 1); // on the visor's top rim
    }
  }

  // For the first few seconds, how to find the controls.
  if (game.state === 'playing' && game.playTime < CONTROLS_HINT_TIME) drawTextCentred(pixels, 'PRESS P FOR CONTROLS', 66, HUD_GREEN, 1);

  if (game.state === 'dead' && game.endTime > SHUTDOWN_TIME) {
    drawTextCentred(pixels, 'TERMINATED', 70, HUD_WARN, 4);
    if (game.endTime > SHUTDOWN_TIME + 1) drawTextCentred(pixels, 'PRESS R TO RESTART', 110, HUD_GREEN, 2);
  } else if (game.state === 'clear') {
    drawTextCentred(pixels, 'LEVEL COMPLETE', 60, HUD_GREEN, 4);
    // This attempt's tally (campaign.js); the whole run's waits for the roof.
    const tally = [
      `TIME      ${clockText(game.playTime)}`,
      `DESTROYED ${levelKills()}`,
      `ACCURACY  ${accuracyText(attempt.shots, attempt.hits)}`,
    ];
    fillRect(pixels, 116, 88, 88, 31, [8, 12, 10]); // a dark panel, so it reads over the room
    tally.forEach((line, n) => drawText(pixels, line, 124, 92 + n * 9, HUD_GREEN, 1));
    // The lift goes up: to the next level, or after the last, to the roof (campaign.js).
    drawTextCentred(pixels, nextLevel() ? 'PRESS ENTER TO GO UP' : 'PRESS ENTER FOR THE ROOF', 126, HUD_GREEN, 2);
  }
}
