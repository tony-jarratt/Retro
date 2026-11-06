// NIGHT VISION (owner, 2026-11-06): when the POWER goes (power.js), the
// visor switches itself to LOW LIGHT: light amplification, the old grainy
// green picture. No key, no choice: it comes on when the lights die and goes
// off when they come back.
//
// It doesn't add light, it AMPLIFIES what's there (viewLight), and only near
// you: the boost fades to nothing NV_RANGE cells out, so corridors still end
// in black. Then the whole 3D view goes monochrome green, with grain and
// scanlines (applyNightVision). Glowing things (screens, the breaker's neon
// sign) come through as bright smears.
//
// It's not a light, so nothing sees it, but the robots and creatures have
// night vision too: with the power off, the dark doesn't hide you
// (creatures.js, larvae.js). And it takes the visor over: no SCANNER while
// it's on (scanner.js).

const NV_GAIN = 9;          // how much it amplifies the light right beside you
const NV_RANGE = 5;         // cells: beyond this, no boost at all
const NV_BOOT_TIME = 0.5;   // seconds of stuttering as it comes on
const NV_TINT = [0.32, 1.0, 0.42];
const NV_GRAIN = 26;        // the most the grain moves a pixel, out of 255
const NV_SCANLINE = 0.78;   // odd rows' brightness

function nightVisionOn() {
  return power.state === 'off'; // power.js
}

// The light the VIEW draws with at (x, y) (raycaster.js, sprites.js,
// reflections.js): the real light, amplified near you with night vision on.
// The game itself (who can see whom) always uses the real light, lightAt.
function viewLight(x, y) {
  const light = lightAt(x, y); // lighting.js
  if (!nightVisionOn()) return light;
  const near = Math.max(0, 1 - Math.hypot(x - player.x, y - player.y) / NV_RANGE);
  const gain = 1 + (NV_GAIN - 1) * near * near; // falling off fast: the far end of a room stays dark
  return light.map((v) => v * gain);
}

// After the 3D view is drawn and before the HUD (main.js): green, grainy,
// scanlined. While it boots, some frames come through untouched.
function applyNightVision(pixels) {
  if (!nightVisionOn()) return;
  if (power.time < NV_BOOT_TIME && Math.random() < 0.5) return;
  for (let y = 0; y < SCREEN_H; y++) {
    const scan = y % 2 === 1 ? NV_SCANLINE : 1;
    for (let x = 0; x < SCREEN_W; x++) {
      const i = (y * SCREEN_W + x) * 4;
      // The brightest channel, not a weighted average: a red light (the breaker's
      // neon, the emergency strips) comes through as bright as it looks.
      const lum = (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) + (Math.random() - 0.5) * NV_GRAIN) * scan;
      pixels[i] = Math.max(0, Math.min(255, lum * NV_TINT[0]));
      pixels[i + 1] = Math.max(0, Math.min(255, lum * NV_TINT[1]));
      pixels[i + 2] = Math.max(0, Math.min(255, lum * NV_TINT[2]));
    }
  }
}

// On the visor's top rim, where SCAN shows (hud.js).
function drawNightVisionReadout(pixels) {
  if (nightVisionOn()) drawText(pixels, 'LOW LIGHT', READOUT_MARGIN + 30, 1, SCAN_GREEN, 1); // scanner.js's green
}
