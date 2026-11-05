// The HUD (heads-up display): everything drawn flat on top of the 3D view,
// straight into the same pixel buffer: the gun, the crosshair, the health
// bar, a robot counter, the red damage flash, and end-of-game messages.
// Styled like a green-phosphor CRT readout.

const HUD_GREEN = [120, 255, 150];
const HUD_WARN = [255, 96, 64];

// A BITMAP FONT. Each character is a 3x5 grid of pixels: '#' on, '.' off.
// Drawing text is just stamping these grids side by side, 1 pixel apart.
// Only the characters the HUD actually uses are defined.
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
  'Y': ['#.#', '#.#', '.#.', '.#.', '.#.'],
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

// Stamp a texture onto the screen at `scale` times its size, skipping
// see-through texels. No perspective here: the HUD is flat.
function drawTextureFlat(pixels, tex, x, y, scale) {
  for (let ty = 0; ty < TEX_SIZE; ty++) {
    for (let tx = 0; tx < TEX_SIZE; tx++) {
      if (isTransparent(tex, tx, ty)) continue;
      const t = (ty * TEX_SIZE + tx) * 4;
      const rgb = [tex.pixels[t], tex.pixels[t + 1], tex.pixels[t + 2]];
      fillRect(pixels, x + tx * scale, y + ty * scale, scale, scale, rgb);
    }
  }
}

// The gun: 2x size at the bottom centre. It bobs in a figure-of-eight as you
// walk (sideways at the step rate, up and down at twice it), and kicks down
// while its muzzle flash shows.
function drawGun(pixels) {
  const scale = 2;
  const bobX = Math.round(Math.sin(player.walkTime * 6) * 4);
  const bobY = Math.round(Math.abs(Math.cos(player.walkTime * 6)) * 4);
  const recoil = gun.flash > 0 ? 6 : 0;
  const x = SCREEN_W / 2 - TEX_SIZE * scale / 2 + bobX;
  // +26 sinks the gun so its muzzle sits well below the crosshair, with the
  // hand's bottom edge off screen.
  const y = SCREEN_H - TEX_SIZE * scale + 26 + bobY + recoil;
  drawTextureFlat(pixels, gun.flash > 0 ? GUN_FLASH_TEXTURE : GUN_TEXTURE, x, y, scale);
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

function drawHealth(pixels) {
  const x = 6;
  const y = SCREEN_H - 12;
  const low = player.health <= 30;
  drawText(pixels, 'HP ' + player.health, x, y - 8, low ? HUD_WARN : HUD_GREEN, 1);
  fillRect(pixels, x, y, 62, 6, [0, 0, 0]);             // bar border
  fillRect(pixels, x + 1, y + 1, 60, 4, [20, 60, 30]);  // empty part
  // The bar is cut into 5-pixel segments, like an old LED gauge.
  const filled = Math.round(12 * player.health / PLAYER_MAX_HEALTH);
  for (let seg = 0; seg < filled; seg++) {
    fillRect(pixels, x + 1 + seg * 5, y + 1, 4, 4, low ? HUD_WARN : [60, 200, 90]);
  }
}

// Bottom right, level with the HP label; red when you're out.
function drawAmmo(pixels) {
  const text = 'AMMO ' + player.ammo;
  const colour = player.ammo === 0 ? HUD_WARN : HUD_GREEN;
  drawText(pixels, text, SCREEN_W - 6 - textWidth(text, 1), SCREEN_H - 20, colour, 1);
}

// The keycards you're carrying: a small card in each colour, under the ammo count.
function drawKeys(pixels) {
  player.keys.forEach((colour, n) => {
    const x = SCREEN_W - 6 - 9 - n * 11;
    fillRect(pixels, x, SCREEN_H - 12, 9, 6, [0, 0, 0]);
    fillRect(pixels, x + 1, SCREEN_H - 11, 7, 4, KEY_COLOURS[colour]);
    fillRect(pixels, x + 1, SCREEN_H - 10, 7, 1, [235, 235, 235]); // stripe
  });
}

function drawHud(pixels) {
  if (game.state !== 'dead') {
    drawGun(pixels);
    drawCrosshair(pixels);
  }

  // Red damage flash, fading out over PLAYER_HURT_FLASH seconds.
  if (game.hurtFlash > 0) tintScreen(pixels, [200, 0, 0], 0.45 * game.hurtFlash / PLAYER_HURT_FLASH);
  // Gold flash for collecting something.
  if (game.pickupFlash > 0) tintScreen(pixels, [255, 210, 90], 0.3 * game.pickupFlash / PICKUP_FLASH_TIME);
  // Dead: the view slowly fills with dark red.
  if (game.state === 'dead') tintScreen(pixels, [90, 0, 0], Math.min(0.75, game.endTime * 0.6));

  drawHealth(pixels);
  drawAmmo(pixels);
  drawKeys(pixels);
  if (game.state === 'playing') {
    if (lockedDoorHint) {
      drawTextCentred(pixels, lockedDoorHint.toUpperCase() + ' KEYCARD NEEDED', 40, KEY_COLOURS[lockedDoorHint], 1);
    }
    if (securityMessageTime > 0) {
      const ok = securityMessage === 'SECURITY OFFLINE';
      drawTextCentred(pixels, securityMessage, 50, ok ? HUD_GREEN : HUD_WARN, 2);
    }
    // While any alarm is going, a red ALARM blinks at the top of the screen.
    if (Object.values(alarms).some((t) => t > 0) && Math.floor(animTime * 3) % 2 === 0) {
      drawTextCentred(pixels, 'ALARM', 6, HUD_WARN, 1);
    }
  }
  const left = enemies.filter((e) => e.state !== 'dead').length;
  const counter = 'ROBOTS ' + left;
  drawText(pixels, counter, SCREEN_W - 6 - textWidth(counter, 1), 6, HUD_GREEN, 1);

  if (game.state === 'dead') {
    drawTextCentred(pixels, 'SCRAPPED', 70, HUD_WARN, 4);
    drawTextCentred(pixels, 'PRESS R TO RESTART', 110, HUD_GREEN, 2);
  } else if (game.state === 'clear') {
    drawTextCentred(pixels, 'LEVEL CLEAR', 70, HUD_GREEN, 4);
    drawTextCentred(pixels, 'PRESS R TO RESTART', 110, HUD_GREEN, 2);
  }
}
