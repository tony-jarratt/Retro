// The raycaster: one ray per screen column, walked through the grid with DDA,
// then turned into a vertical textured wall strip in the pixel buffer.
// Floor and ceiling are drawn first, row by row, then walls, then sprites.

const SCREEN_W = 320;
const SCREEN_H = 200;
const FOV = 66 * Math.PI / 180; // horizontal field of view, in radians

const SIDE_SHADE = 0.6; // north/south-facing walls are drawn at 60% brightness

// DISTANCE FOG. Every pixel is blended towards FOG_COLOUR according to how far
// away the thing it shows is: untouched up to FOG_START, fully fog colour from
// FOG_END on, and a straight-line blend in between. Black reads as darkness
// ("light diminishing"); a dark orange-brown like [58, 42, 34] reads as smog.
const FOG_COLOUR = [0, 0, 0];
const FOG_START = 1.5; // cells
const FOG_END = 11;    // cells

// How much fog at this distance: 0 = none, 1 = all fog.
function fogAmount(dist) {
  return Math.min(1, Math.max(0, (dist - FOG_START) / (FOG_END - FOG_START)));
}

// Distance from the eye to an imaginary flat screen, measured in pixels,
// chosen so that SCREEN_W pixels span exactly FOV. A wall 1 unit tall at
// distance d then appears PROJ_DIST / d pixels tall (similar triangles).
const PROJ_DIST = (SCREEN_W / 2) / Math.tan(FOV / 2);

// Cast one ray from (px, py) in direction (rayX, rayY), which must be unit
// length. Returns where it hit the first SOLID thing (a wall or a closed
// door) and how far along the ray that was. Glass and grates don't stop it:
// each one it passes is noted in hit.panes, nearest first, and it carries on.
// So one cast answers both "what's the wall behind?" (sight, light, blasts)
// and "what's in front of it?" (drawing, and bullets, which glass stops).
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

  const panes = []; // see-through panels passed on the way, nearest first

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
    if (cell === DOOR_CELL) {
      const doorHit = hitDoor(doorAt(mapX, mapY), px, py, rayX, rayY);
      if (doorHit) return { ...doorHit, panes };
      continue; // passed through the open part: carry on walking the grid
    }
    if (isPanelCell(cell)) {
      const paneHit = hitPanel(panelAt(mapX, mapY), px, py, rayX, rayY);
      if (paneHit) panes.push(paneHit);
      continue; // note it, and look on through it
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

      // Which face of the wall cell we hit, named by the way it looks (for
      // decals.js): heading east, we hit the side that looks west, and so on.
      const face = side === 0 ? (rayX > 0 ? 'W' : 'E') : (rayY > 0 ? 'N' : 'S');

      return { dist, side, cell, hitX, hitY, wallX, face, cellX: mapX, cellY: mapY, panes };
    }
  }
}

// DOORS. A door is a thin slab across the MIDDLE of its cell, not a whole
// block, so the DDA's "stop at the cell edge" answer is wrong for it. When the
// walk steps into a door cell, we work out where the ray crosses the door's
// centre line directly. It's a hit if that crossing is inside this cell AND on
// the part of the door that hasn't slid away; otherwise the ray carries on.
//
// The door slides towards +x (or +y) into the wall beside it, so the solid
// part covers `along` from door.open to 1, and the gap is 0 to door.open.
function hitDoor(door, px, py, rayX, rayY) {
  const cross = crossCentreLine(door, px, py, rayX, rayY);
  if (!cross) return null;
  if (cross.along < door.open) return null; // went through the gap

  // Texture column: measured from the door's leading edge, so the picture
  // slides along with the door instead of the door sliding over the picture.
  // No mirror flip here (unlike walls): seen from either side, the handle
  // drawn at the leading edge stays at the edge that moves, as a real one would.
  const wallX = cross.along - door.open;
  return { dist: cross.dist, side: door.horizontal ? 1 : 0, cell: DOOR_CELL, hitX: cross.hitX, hitY: cross.hitY, wallX, door };
}

// Where does the ray cross the centre line of a door's or panel's cell?
// `slab` has x, y (its cell) and horizontal. Returns null if it doesn't
// cross inside this cell, else the distance, the point, and `along`: how far
// across the cell the crossing is, 0 to 1.
function crossCentreLine(slab, px, py, rayX, rayY) {
  // A horizontal slab lies along y = slab.y + 0.5; a vertical one along
  // x = slab.x + 0.5. Distance along the (unit) ray to reach that line:
  const dist = slab.horizontal ? (slab.y + 0.5 - py) / rayY : (slab.x + 0.5 - px) / rayX;
  const hitX = px + rayX * dist;
  const hitY = py + rayY * dist;

  // Outside 0..1 the ray reaches the centre line only after leaving the cell
  // (it clips the corner and goes on to hit whatever is beside it). If the
  // ray runs parallel to the slab, dist is Infinity and `along` is NaN; the
  // comparison is false for NaN too, so that also counts as a miss.
  const along = slab.horizontal ? hitX - slab.x : hitY - slab.y;
  if (!(along >= 0 && along < 1)) return null;
  return { dist, hitX, hitY, along };
}

// PANELS (panels.js): the same thin slab as a door, but it never slides, and
// a hit on one doesn't end the ray (see castRay).
function hitPanel(panel, px, py, rayX, rayY) {
  const cross = crossCentreLine(panel, px, py, rayX, rayY);
  if (!cross) return null;
  return { dist: cross.dist, side: panel.horizontal ? 1 : 0, hitX: cross.hitX, hitY: cross.hitY, wallX: cross.along, panel };
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
    for (const pane of hit.panes) pane.perpDist = pane.dist * Math.cos(relAngle); // same fix for each panel

    hits[col] = hit;
  }
  return hits;
}

// Which picture a wall hit shows. A door shows its own lock colour, a
// security terminal whether it's armed or safe, the core its damage, the lift
// whether it's open, and an animated wall this frame's picture.
function textureForHit(hit) {
  if (hit.door) return doorTexture(hit.door);
  if (hit.cell === TERMINAL_CELL) return terminalTexture(hit.cellX, hit.cellY);
  if (hit.cell === CORE_CELL) return coreTexture();   // core.js
  if (hit.cell === LIFT_CELL) return liftTexture();
  if (hit.cell === REPAIR_CELL) return bayTexture(hit.cellX, hit.cellY); // repair.js
  return wallTexture(hit.cell);
}

// THE PIXEL DEPTH BUFFER. How far away the sprite drawn at each screen pixel
// is, or Infinity where there's no sprite. Walls only ever needed one depth per
// column (a wall strip fills its column top to bottom), but a sprite covers
// only some of a column's rows, so to draw a window in front of some sprites
// and behind others we need to know, pixel by pixel, what's already there.
const pixelDepth = new Float32Array(SCREEN_W * SCREEN_H);

// Draw the whole 3D view into the ImageData: floor and ceiling first, then
// a textured wall strip for every column on top of them, then sprites, and
// last the glass and grates, see-through, over whatever is behind them.
function renderView(image, hits, player) {
  const pixels = image.data; // flat RGBA bytes: 4 per pixel, row after row

  const placed = placeSprites(player); // sprites.js: needed by the puddles as well as for drawing
  renderFloorCeiling(pixels, player, hits, placed);

  for (let col = 0; col < SCREEN_W; col++) drawWallStrip(pixels, col, hits[col], player);

  // Each column's wall distance is the depth buffer that lets walls hide sprites.
  const depth = hits.map((hit) => hit.perpDist);
  pixelDepth.fill(Infinity);
  renderSprites(pixels, depth, placed);
  renderPanes(pixels, hits, player);
}

// One column's strip of wall, door or panel. For a panel (hit.panel set), each
// texel is mixed with what's already on screen by its alpha (fully clear
// texels change nothing), and only where no nearer sprite has been drawn.
function drawWallStrip(pixels, col, hit, player) {
  const wallHeight = PROJ_DIST / hit.perpDist;

  // The wall's true top edge on screen. When you stand close it is taller
  // than the screen and wallTop goes negative; the texture maths below
  // still uses the true edge, so the visible slice comes from the middle.
  const wallTop = (SCREEN_H - wallHeight) / 2;

  // Draw the rows whose pixel centre (row + 0.5) lies on the wall.
  const top = Math.max(0, Math.ceil(wallTop - 0.5));
  const bottom = Math.min(SCREEN_H, Math.ceil(wallTop + wallHeight - 0.5));

  const tex = hit.panel ? panelTexture(hit.panel) : textureForHit(hit);
  // The Math.min guards against wallX rounding to exactly 1.0, which would
  // index one column past the edge of the texture.
  const texX = Math.min(TEX_SIZE - 1, Math.floor(hit.wallX * TEX_SIZE));
  const shade = hit.side === 1 ? SIDE_SHADE : 1;
  const fog = fogAmount(hit.perpDist); // the whole strip is at one distance

  const light = wallLight(hit, player).map((v) => v * shade);
  const decal = wallDecalAt(hit); // rust, scorch, a sign... or null (decals.js)

  for (let row = top; row < bottom; row++) {
    // How far down the wall this pixel is (0 = top edge, 1 = bottom edge),
    // scaled to a texture row. This one division stretches or squashes the
    // 64-texel column to fit however tall the strip is on screen.
    const texY = Math.min(TEX_SIZE - 1, Math.floor((row + 0.5 - wallTop) / wallHeight * TEX_SIZE));
    if (hit.panel) {
      if (pixelDepth[row * SCREEN_W + col] < hit.perpDist) continue; // a sprite in front of the panel here
      blendTexel(pixels, col, row, tex, texX, texY, light, fog);
    } else if (glows(tex, texX, texY)) {
      copyTexel(pixels, col, row, tex, texX, texY, FULL_LIGHT, 0); // a screen or lamp: unlit, no fog
    } else {
      copyTexel(pixels, col, row, tex, texX, texY, light, fog);
    }
    if (decal) blendDecal(pixels, col, row, decal, texX, texY, light, fog); // over the wall, lit the same
  }
}

// The light on a strip of wall. The light map lives in the open space in
// front of walls, so look it up a little way out from the face, on the
// viewer's side. (The light map is flat, so one lookup does the whole strip.)
function wallLight(hit, player) {
  const lx = hit.side === 0 ? hit.hitX + (player.x < hit.hitX ? -0.05 : 0.05) : hit.hitX;
  const ly = hit.side === 1 ? hit.hitY + (player.y < hit.hitY ? -0.05 : 0.05) : hit.hitY;
  return viewLight(lx, ly); // nightvision.js: lightAt, amplified with the power off
}

// GLASS AND GRATES. Each column's panels are drawn FARTHEST FIRST (the
// painter's algorithm again), each one over what's behind it: so through a
// window you see a grate, and through the grate the wall.
function renderPanes(pixels, hits, player) {
  for (let col = 0; col < SCREEN_W; col++) {
    const panes = hits[col].panes;
    for (let i = panes.length - 1; i >= 0; i--) drawWallStrip(pixels, col, panes[i], player);
  }
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
function renderFloorCeiling(pixels, player, hits, placed) {
  const dirX = Math.cos(player.angle);
  const dirY = Math.sin(player.angle);
  // The vector from the centre of the screen to its right edge, for a screen
  // 1 unit in front of the eye (same "right" as in player.js).
  const halfWidth = Math.tan(FOV / 2);
  const planeX = -dirY * halfWidth;
  const planeY = dirX * halfWidth;
  const horizon = SCREEN_H / 2;
  const columnSprites = spritesByColumn(placed); // for the puddles (reflections.js)

  for (let row = horizon; row < SCREEN_H; row++) {
    const d = 0.5 * PROJ_DIST / (row + 0.5 - horizon);
    const ceilingRow = SCREEN_H - 1 - row;
    const fog = fogAmount(d); // the whole row is at one distance, so one fog value

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

      // Floor and ceiling share a lookup: the light map is flat, so the spot
      // on the ceiling gets the same light as the spot on the floor below it.
      const light = viewLight(floorX, floorY);
      copyTexel(pixels, col, row, FLOOR_TEXTURE, texX, texY, light, fog);
      // A puddle, oil, scorch... laid over the floor in this cell (decals.js).
      const cellX = Math.floor(floorX), cellY = Math.floor(floorY);
      const floorDecal = floorDecalAt(cellX, cellY);
      if (floorDecal) {
        blendDecal(pixels, col, row, floorDecal, texX, texY, light, fog);
        // Standing water mirrors the room (reflections.js). Only worth doing
        // if this floor point is in front of the wall: beyond it, the wall
        // will be drawn over this pixel anyway.
        if (d < hits[col].perpDist && isWater(floorDecal, texX, texY)) {
          reflectInPuddle(pixels, col, row, d, floorX, floorY, screenX, hits[col], columnSprites[col], player);
        }
      }

      // Only cells with a working strip light show one lit (red in an alarm);
      // the rest have a dark fixture.
      const state = ceilingLightState[cellY]?.[cellX];
      const ceiling = state === 'on' ? CEILING_TEXTURE : state === 'alarm' ? CEILING_ALARM_TEXTURE : CEILING_DARK_TEXTURE;
      if (glows(ceiling, texX, texY)) {
        copyTexel(pixels, col, ceilingRow, ceiling, texX, texY, FULL_LIGHT, 0);
      } else {
        copyTexel(pixels, col, ceilingRow, ceiling, texX, texY, light, fog);
      }
      const ceilingDecal = ceilingDecalAt(cellX, cellY);
      if (ceilingDecal) blendDecal(pixels, col, ceilingRow, ceilingDecal, texX, texY, light, fog);
    }
  }
}

// Does this texel give off its own light? Glowing texels (screens, strip
// lights, a robot's visor) are drawn at full brightness through the fog, so
// lights still show in the haze after everything around them has faded.
function glows(tex, texX, texY) {
  return tex.glow[texY * TEX_SIZE + texX] === 1;
}

// Like copyTexel, but for see-through texels: the lit, fogged texel colour is
// blended with what's already on screen, by the texel's alpha (0..255):
//     screen = screen + (texel - screen) * alpha / 255
// The same lerp as fog, just with alpha as the amount. Alpha 0 changes nothing.
function blendTexel(pixels, x, y, tex, texX, texY, light, fog) {
  const t = (texY * TEX_SIZE + texX) * 4;
  const a = tex.pixels[t + 3] / 255;
  if (a === 0) return;
  const i = (y * SCREEN_W + x) * 4;
  for (let c = 0; c < 3; c++) {
    const lit = tex.pixels[t + c] * light[c];
    const fogged = lit + (FOG_COLOUR[c] - lit) * fog;
    pixels[i + c] += (fogged - pixels[i + c]) * a;
  }
}

// Copy one texel of `tex` to screen pixel (x, y): multiplied by `light` (an
// [r, g, b] of multipliers, so coloured light tints it), then blended with
// FOG_COLOUR by `fog` (0 = pure texel, 1 = pure fog). The blend is the usual
// "lerp", a + (b - a) * t, done separately for red, green and blue.
function copyTexel(pixels, x, y, tex, texX, texY, light, fog) {
  const t = (texY * TEX_SIZE + texX) * 4; // 4 bytes per texel (RGBA)...
  const i = (y * SCREEN_W + x) * 4;       // ...and 4 per screen pixel
  for (let c = 0; c < 3; c++) {
    const lit = tex.pixels[t + c] * light[c];
    pixels[i + c] = lit + (FOG_COLOUR[c] - lit) * fog;
  }
  pixels[i + 3] = 255; // alpha: fully opaque
}
