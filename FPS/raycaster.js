// The raycaster: one ray per screen column, walked through the grid with DDA,
// then turned into a vertical textured wall strip in the pixel buffer.
// Floor and ceiling are drawn first, row by row, then walls, then sprites.

const SCREEN_W = 320;
const SCREEN_H = 200;
const FOV = 66 * Math.PI / 180; // horizontal field of view, in radians

const SIDE_SHADE = 0.6; // north/south-facing walls are drawn at 60% brightness

// Distance from the eye to an imaginary flat screen, measured in pixels,
// chosen so that SCREEN_W pixels span exactly FOV. A wall 1 unit tall at
// distance d then appears PROJ_DIST / d pixels tall (similar triangles).
const PROJ_DIST = (SCREEN_W / 2) / Math.tan(FOV / 2);

// Cast one ray from (px, py) in direction (rayX, rayY), which must be unit
// length. Returns where it hit and how far along the ray that was.
//
// DDA ("digital differential analyser"): instead of creeping along the ray in
// small steps (slow, and can skip corners), jump straight from one grid line
// to the next. A ray crosses two kinds of grid line: vertical ones (x = whole
// number) and horizontal ones (y = whole number). We track the distance along
// the ray to the next line of each kind, always take whichever is nearer,
// step into the cell on the other side, and stop when that cell is a wall.
function castRay(px, py, rayX, rayY) {
  let mapX = Math.floor(px); // the cell we're currently in
  let mapY = Math.floor(py);

  // How far along the ray it takes to cross one whole cell in x (or y).
  // The ray is unit length, so moving 1 unit in x needs 1/|rayX| of ray.
  // If rayX is 0 this is Infinity, meaning "never crosses a vertical line",
  // which is exactly right, and JS gives us that for free (1/0 = Infinity).
  const deltaX = Math.abs(1 / rayX);
  const deltaY = Math.abs(1 / rayY);

  // Which way we step through the grid, and the distance along the ray to
  // the FIRST vertical / horizontal grid line. That first one is only a
  // fraction of a cell away, depending on where in our cell we stand.
  let stepX, stepY, sideX, sideY;
  if (rayX < 0) { stepX = -1; sideX = (px - mapX) * deltaX; }
  else          { stepX = 1;  sideX = (mapX + 1 - px) * deltaX; }
  if (rayY < 0) { stepY = -1; sideY = (py - mapY) * deltaY; }
  else          { stepY = 1;  sideY = (mapY + 1 - py) * deltaY; }

  // The DDA walk. Each pass crosses exactly one grid line: the nearer one.
  // side records which kind we crossed last: 0 = a vertical line (so we hit
  // an east/west-facing wall face), 1 = a horizontal line (north/south face).
  while (true) {
    let dist, side;
    if (sideX < sideY) {
      dist = sideX;      // distance to the line we're crossing now
      sideX += deltaX;   // the next vertical line is one more cell along
      mapX += stepX;
      side = 0;
    } else {
      dist = sideY;
      sideY += deltaY;
      mapY += stepY;
      side = 1;
    }

    const cell = MAP[mapY]?.[mapX];
    if (cell === undefined) {
      throw new Error(`Ray left the map at cell (${mapX}, ${mapY}), cast from ` +
        `(${px.toFixed(2)}, ${py.toFixed(2)}); the map border must be solid walls`);
    }
    if (cell !== 0) {
      const hitX = px + rayX * dist;
      const hitY = py + rayY * dist;

      // Where along the wall face the ray hit, from 0 to 1. This picks the
      // texture column. On a vertical line (side 0) x is a whole number, so
      // the position along the wall is the fractional part of y, and vice versa.
      let wallX = side === 0 ? hitY - Math.floor(hitY) : hitX - Math.floor(hitX);

      // Without this, textures come out mirrored on two of the four wall
      // directions. Example: facing east (rayX > 0), your right is +y, so wallX
      // grows from left to right as you look along the wall, which is correct.
      // Facing west, your right is -y, so wallX shrinks left to right; flip it.
      if ((side === 0 && rayX < 0) || (side === 1 && rayY > 0)) wallX = 1 - wallX;

      return { dist, side, cell, hitX, hitY, wallX };
    }
  }
}

// Cast one ray per screen column and return the hits (also used by the
// debug view to draw the rays).
function castRays(player) {
  const hits = new Array(SCREEN_W);
  const halfWidth = Math.tan(FOV / 2); // half-width of the flat screen at distance 1

  for (let col = 0; col < SCREEN_W; col++) {
    // Where this column sits on the flat screen: -1 = left edge, +1 = right.
    const screenX = 2 * (col + 0.5) / SCREEN_W - 1;

    // The angle of this column's ray relative to where the player faces.
    // We space columns evenly across a FLAT screen (hence atan), not evenly
    // in angle; equal angle steps would bend straight walls slightly.
    const relAngle = Math.atan(screenX * halfWidth);
    const rayAngle = player.angle + relAngle;
    const hit = castRay(player.x, player.y, Math.cos(rayAngle), Math.sin(rayAngle));

    // FISHEYE FIX. hit.dist is the true straight-line distance from the eye
    // to the wall. Rays near the screen edges travel further to reach the same
    // flat wall than the centre ray does, so using hit.dist would make walls
    // shrink towards the edges and bulge in the middle: the fisheye effect.
    // What we actually want is the distance measured straight ahead, i.e.
    // perpendicular to the screen. That is the ray's length projected onto the
    // view direction: dist * cos(angle between ray and view direction).
    hit.perpDist = hit.dist * Math.cos(relAngle);

    hits[col] = hit;
  }
  return hits;
}

// Draw the whole 3D view into the ImageData: floor and ceiling first, then
// a textured wall strip for every column on top of them, then sprites.
function renderView(image, hits, player) {
  const pixels = image.data; // flat RGBA bytes: 4 per pixel, row after row

  renderFloorCeiling(pixels, player);

  for (let col = 0; col < SCREEN_W; col++) {
    const hit = hits[col];
    const wallHeight = PROJ_DIST / hit.perpDist;

    // The wall's true top edge on screen. When you stand close it is taller
    // than the screen and wallTop goes negative; the texture maths below
    // still uses the true edge, so the visible slice comes from the middle.
    const wallTop = (SCREEN_H - wallHeight) / 2;

    // Draw the rows whose pixel centre (row + 0.5) lies on the wall.
    const top = Math.max(0, Math.ceil(wallTop - 0.5));
    const bottom = Math.min(SCREEN_H, Math.ceil(wallTop + wallHeight - 0.5));

    const tex = TEXTURES[hit.cell];
    // The Math.min guards against wallX rounding to exactly 1.0, which would
    // index one column past the edge of the texture.
    const texX = Math.min(TEX_SIZE - 1, Math.floor(hit.wallX * TEX_SIZE));
    const shade = hit.side === 1 ? SIDE_SHADE : 1;

    for (let row = top; row < bottom; row++) {
      // How far down the wall this pixel is (0 = top edge, 1 = bottom edge),
      // scaled to a texture row. This one division stretches or squashes the
      // 64-texel column to fit however tall the strip is on screen.
      const texY = Math.min(TEX_SIZE - 1, Math.floor((row + 0.5 - wallTop) / wallHeight * TEX_SIZE));
      copyTexel(pixels, col, row, tex, texX, texY, shade);
    }
  }

  // Each column's wall distance is the depth buffer that lets walls hide sprites.
  const depth = hits.map((hit) => hit.perpDist);
  renderSprites(pixels, depth, player);
}

// FLOOR AND CEILING CASTING
// The eye is at height 0.5, halfway up a wall that is 1 tall. By the same
// similar triangles as the wall height, a floor point at perpendicular
// distance d appears (0.5 * PROJ_DIST / d) pixels below the horizon.
// Turn that round, and each screen row below the horizon shows the floor at
// one fixed distance:
//     d = 0.5 * PROJ_DIST / (pixels below the horizon)
// A screen row is a line across the floor parallel to the screen, so d is
// already a perpendicular distance and there's no fisheye to correct here.
// The ceiling is the floor's mirror image: the row the same number of pixels
// ABOVE the horizon looks at the same (x, y) spot, just on the ceiling.
//
// This also fills in the pixels that walls will cover. That's wasted work,
// but it keeps the two passes independent.
function renderFloorCeiling(pixels, player) {
  const dirX = Math.cos(player.angle);
  const dirY = Math.sin(player.angle);
  // The vector from the centre of the screen to its right edge, for a screen
  // 1 unit in front of the eye (same "right" as in player.js).
  const halfWidth = Math.tan(FOV / 2);
  const planeX = -dirY * halfWidth;
  const planeY = dirX * halfWidth;
  const horizon = SCREEN_H / 2;

  for (let row = horizon; row < SCREEN_H; row++) {
    const d = 0.5 * PROJ_DIST / (row + 0.5 - horizon);
    const ceilingRow = SCREEN_H - 1 - row;

    for (let col = 0; col < SCREEN_W; col++) {
      const screenX = 2 * (col + 0.5) / SCREEN_W - 1; // same as in castRays
      // The floor point under this pixel. The direction (dir + plane * screenX)
      // goes exactly 1 unit forward for any screenX, so scaling it by d lands
      // at perpendicular distance d, under this column.
      const floorX = player.x + d * (dirX + planeX * screenX);
      const floorY = player.y + d * (dirY + planeY * screenX);

      // As with walls: the fractional part of the position picks the texel,
      // so the texture repeats once per grid cell.
      const texX = Math.min(TEX_SIZE - 1, Math.floor((floorX - Math.floor(floorX)) * TEX_SIZE));
      const texY = Math.min(TEX_SIZE - 1, Math.floor((floorY - Math.floor(floorY)) * TEX_SIZE));
      copyTexel(pixels, col, row, FLOOR_TEXTURE, texX, texY, 1);
      copyTexel(pixels, col, ceilingRow, CEILING_TEXTURE, texX, texY, 1);
    }
  }
}

// Copy one texel of `tex`, scaled by `shade`, to screen pixel (x, y).
function copyTexel(pixels, x, y, tex, texX, texY, shade) {
  const t = (texY * TEX_SIZE + texX) * 4; // 4 bytes per texel (RGBA)...
  const i = (y * SCREEN_W + x) * 4;       // ...and 4 per screen pixel
  pixels[i] = tex.pixels[t] * shade;
  pixels[i + 1] = tex.pixels[t + 1] * shade;
  pixels[i + 2] = tex.pixels[t + 2] * shade;
  pixels[i + 3] = 255; // alpha: fully opaque
}
