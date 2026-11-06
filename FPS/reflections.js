// REFLECTIONS in puddles.
//
// A flat mirror on the floor shows the room upside down: what you see in it
// is exactly what you'd see if the whole room were flipped to hang BELOW the
// floor, its walls running from height 0 down to -1 and its ceiling at -1.
// So for a puddle pixel we keep the ray going straight on, downwards through
// the floor, into that flipped room, and see what it meets.
//
// The ray for screen row `row` drops k = (row + 0.5 - horizon) pixels per
// PROJ_DIST pixels forward (the same slope that floor casting uses). Starting
// at eye height 0.5, at forward distance D it has reached height
//     0.5 - D * k / PROJ_DIST
// In the flipped room, height -h is the reflection of real height h. So at
// distance D the reflection shows the real thing at height
//     h = D * k / PROJ_DIST - 0.5
// That one line is the whole trick. For the wall in this column (distance D
// from castRays) it says which row of the wall's texture shows up; if h is
// over 1, the ray passed over the wall's (flipped) top and met the flipped
// ceiling first, at the distance where h = 1: D = 1.5 * PROJ_DIST / k.
// Sprites work the same way: each one this column passes through, between
// the puddle and the wall, is checked at its own distance.
//
// Simplifications: the ceiling's decals and any glass or grates aren't
// reflected, and nor is the floor (a mirror on the floor can't see the floor).

const PUDDLE_REFLECTIVITY = 0.8;  // how much of the reflection shows: 0 = none, 1 = a perfect mirror
const PUDDLE_DIM = 0.9;           // water reflects a little less light than it receives
const RIPPLE = 0.03;              // how far ripples bend the reflection (fraction of the slope)

// For each screen column, the placed sprites (sprites.js) that cover it.
// placed is farthest first, so each column's list is too.
function spritesByColumn(placed) {
  const columns = [];
  for (let col = 0; col < SCREEN_W; col++) columns.push([]);
  for (const p of placed) {
    const colStart = Math.max(0, Math.ceil(p.left - 0.5));
    const colEnd = Math.min(SCREEN_W, Math.ceil(p.left + p.size - 0.5));
    for (let col = colStart; col < colEnd; col++) columns[col].push(p);
  }
  return columns;
}

// A texel's colour, lit and fogged: the same maths as copyTexel, returned
// rather than written to the screen.
function litTexel(tex, texX, texY, light, fog) {
  const t = (texY * TEX_SIZE + texX) * 4;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const lit = tex.pixels[t + c] * light[c];
    out[c] = lit + (FOG_COLOUR[c] - lit) * fog;
  }
  return out;
}

// Which texture row shows at height h (0 = foot, 1 = top) of a wall or sprite.
function rowAtHeight(h) {
  return Math.max(0, Math.min(TEX_SIZE - 1, Math.floor((1 - h) * TEX_SIZE)));
}

// Mix the reflection into screen pixel (col, row), which shows a puddle.
//   d               the floor distance of this pixel (from floor casting)
//   floorX, floorY  the floor point, for the ripples
//   screenX         this column's position across the screen, -1..1
//   hit             this column's wall hit (castRays)
//   sprites         the sprites covering this column, farthest first
function reflectInPuddle(pixels, col, row, d, floorX, floorY, screenX, hit, sprites, player) {
  // Ripples: wobble the slope a little, by an amount that moves across the
  // water over time, so the reflection shimmers instead of sitting still.
  const ripple = Math.sin(floorX * 23 + animTime * 3.1) + Math.sin(floorY * 29 - animTime * 2.3);
  const k = (row + 0.5 - SCREEN_H / 2) * (1 + RIPPLE * ripple);

  // THE FAR THING: the wall in this column, or the ceiling above it.
  let colour;
  let farDist;
  const h = hit.perpDist * k / PROJ_DIST - 0.5;
  if (h <= 1) {
    farDist = hit.perpDist;
    const tex = textureForHit(hit);
    const texX = Math.min(TEX_SIZE - 1, Math.floor(hit.wallX * TEX_SIZE));
    const texY = rowAtHeight(h);
    const shade = hit.side === 1 ? SIDE_SHADE : 1;
    colour = glows(tex, texX, texY)
      ? litTexel(tex, texX, texY, FULL_LIGHT, 0)
      : litTexel(tex, texX, texY, wallLight(hit, player).map((v) => v * shade), fogAmount(farDist));
  } else {
    // The ceiling, at the distance where the ray meets the flipped ceiling.
    // Strip lights glow, so they show in the water at full brightness.
    farDist = 1.5 * PROJ_DIST / k;
    const dirX = Math.cos(player.angle), dirY = Math.sin(player.angle);
    const halfWidth = Math.tan(FOV / 2);
    const cx = player.x + farDist * (dirX - dirY * halfWidth * screenX); // same as floor casting
    const cy = player.y + farDist * (dirY + dirX * halfWidth * screenX);
    const texX = Math.min(TEX_SIZE - 1, Math.floor((cx - Math.floor(cx)) * TEX_SIZE));
    const texY = Math.min(TEX_SIZE - 1, Math.floor((cy - Math.floor(cy)) * TEX_SIZE));
    const state = ceilingLightState[Math.floor(cy)]?.[Math.floor(cx)];
    const tex = state === 'on' ? CEILING_TEXTURE : state === 'alarm' ? CEILING_ALARM_TEXTURE : CEILING_DARK_TEXTURE;
    colour = glows(tex, texX, texY)
      ? litTexel(tex, texX, texY, FULL_LIGHT, 0)
      : litTexel(tex, texX, texY, viewLight(cx, cy), fogAmount(farDist));
  }

  // THE SPRITES between the puddle and that far thing, farthest first, each
  // painted over what's behind it (the painter's algorithm, in the mirror).
  // One nearer than the puddle point can't appear: there the ray hasn't gone
  // below the floor yet.
  for (const p of sprites) {
    if (p.forward <= d || p.forward >= farDist) continue;
    if (p.thing.lift !== 0) continue; // off the floor (a glob, a leaping larva): not worth mirroring
    const hs = p.forward * k / PROJ_DIST - 0.5;
    if (hs < 0 || hs > 1) continue; // the ray passes under or over its reflection
    const texX = Math.min(TEX_SIZE - 1, Math.floor((col + 0.5 - p.left) / p.size * TEX_SIZE));
    const texY = rowAtHeight(hs);
    if (isTransparent(p.thing.tex, texX, texY)) continue;
    const seen = glows(p.thing.tex, texX, texY)
      ? litTexel(p.thing.tex, texX, texY, p.glowLight, 0) // a robot's visor glints in the water
      : litTexel(p.thing.tex, texX, texY, p.light, p.fog);
    // Steam is part see-through: mix it in by its alpha (solid texels have 255).
    const a = p.thing.tex.pixels[(texY * TEX_SIZE + texX) * 4 + 3] / 255;
    colour = colour.map((c, n) => c + (seen[n] - c) * a);
  }

  // Mix it into the puddle that's already drawn there.
  const i = (row * SCREEN_W + col) * 4;
  for (let c = 0; c < 3; c++) {
    pixels[i + c] += (colour[c] * PUDDLE_DIM - pixels[i + c]) * PUDDLE_REFLECTIVITY;
  }
}
