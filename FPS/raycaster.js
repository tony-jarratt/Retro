// The raycaster: one ray per screen column, walked through the grid with DDA,
// then turned into a vertical textured wall strip in the pixel buffer.

const SCREEN_W = 320;
const SCREEN_H = 200;
const FOV = 66 * Math.PI / 180; // horizontal field of view, in radians

const CEILING_COLOUR = [56, 56, 56];
const FLOOR_COLOUR = [112, 112, 112];
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

// Draw ceiling, textured wall strip and floor for every column into the ImageData.
function renderView(image, hits) {
  const pixels = image.data; // flat RGBA bytes: 4 per pixel, row after row

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

    for (let row = 0; row < top; row++) setPixel(pixels, col, row, CEILING_COLOUR);

    for (let row = top; row < bottom; row++) {
      // How far down the wall this pixel is (0 = top edge, 1 = bottom edge),
      // scaled to a texture row. This one division stretches or squashes the
      // 64-texel column to fit however tall the strip is on screen.
      const texY = Math.min(TEX_SIZE - 1, Math.floor((row + 0.5 - wallTop) / wallHeight * TEX_SIZE));
      const t = (texY * TEX_SIZE + texX) * 3;
      const i = (row * SCREEN_W + col) * 4;
      pixels[i] = tex.pixels[t] * shade;
      pixels[i + 1] = tex.pixels[t + 1] * shade;
      pixels[i + 2] = tex.pixels[t + 2] * shade;
      pixels[i + 3] = 255;
    }

    for (let row = bottom; row < SCREEN_H; row++) setPixel(pixels, col, row, FLOOR_COLOUR);
  }
}

function setPixel(pixels, x, y, colour) {
  const i = (y * SCREEN_W + x) * 4;
  pixels[i] = colour[0];
  pixels[i + 1] = colour[1];
  pixels[i + 2] = colour[2];
  pixels[i + 3] = 255; // alpha: fully opaque
}
