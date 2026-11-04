// The raycaster: one ray per screen column, walked through the grid with DDA,
// then turned into a vertical wall strip in the pixel buffer.

const SCREEN_W = 320;
const SCREEN_H = 200;
const FOV = 66 * Math.PI / 180; // horizontal field of view, in radians

const CEILING_COLOUR = [56, 56, 56];
const FLOOR_COLOUR = [112, 112, 112];
const WALL_COLOURS = {
  1: [110, 110, 150], // blue-grey stone
  2: [170, 60, 50],   // red brick
  3: [60, 140, 70],   // green
  4: [150, 110, 60],  // wood
};
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
      return { dist, side, cell, hitX: px + rayX * dist, hitY: py + rayY * dist };
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

// Draw ceiling, wall strip and floor for every column into the ImageData.
function renderView(image, hits) {
  const pixels = image.data; // flat RGBA bytes: 4 per pixel, row after row

  for (let col = 0; col < SCREEN_W; col++) {
    const hit = hits[col];
    const wallHeight = PROJ_DIST / hit.perpDist;
    const top = Math.max(0, Math.floor((SCREEN_H - wallHeight) / 2));
    const bottom = Math.min(SCREEN_H, Math.floor((SCREEN_H + wallHeight) / 2));

    const base = WALL_COLOURS[hit.cell];
    const shade = hit.side === 1 ? SIDE_SHADE : 1;
    const wall = [base[0] * shade, base[1] * shade, base[2] * shade];

    for (let row = 0; row < SCREEN_H; row++) {
      const colour = row < top ? CEILING_COLOUR : row < bottom ? wall : FLOOR_COLOUR;
      const i = (row * SCREEN_W + col) * 4;
      pixels[i] = colour[0];
      pixels[i + 1] = colour[1];
      pixels[i + 2] = colour[2];
      pixels[i + 3] = 255; // alpha: fully opaque
    }
  }
}
