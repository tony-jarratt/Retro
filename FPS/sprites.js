// Sprites: flat pictures standing in the world (barrels, columns, lamps).
// A sprite is a 1x1-unit picture that always turns to face the camera (a
// "billboard"). Sprites are drawn after the walls, column by column, and are
// hidden wherever a wall is nearer. Where they stand is listed in map.js.

// What each kind of sprite looks like, and whether it blocks movement.
const SPRITE_TYPES = {
  barrel: { texture: BARREL_TEXTURE, solid: true },
  column: { texture: COLUMN_TEXTURE, solid: true },
  lamp:   { texture: LAMP_TEXTURE,   solid: false },
};

const SOLID_SPRITE_RADIUS = 0.3; // half-width of a solid sprite's collision box, in cells

// Does a box of half-width r centred on (x, y) overlap any solid sprite?
// Two boxes overlap when they're closer than their two half-widths on both axes.
function hitsSolidSprite(x, y, r) {
  return SPRITES.some((s) => SPRITE_TYPES[s.type].solid &&
    Math.abs(x - s.x) < r + SOLID_SPRITE_RADIUS &&
    Math.abs(y - s.y) < r + SOLID_SPRITE_RADIUS);
}

// depth[col] is the perpendicular distance to the wall drawn in that column.
function renderSprites(pixels, depth, player) {
  const dirX = Math.cos(player.angle);
  const dirY = Math.sin(player.angle);
  const rightX = -dirY; // same "right" as in player.js
  const rightY = dirX;

  // CAMERA SPACE. Re-describe each sprite's position relative to the eye:
  //   forward = how far in front of us it is, along the view direction
  //   across  = how far to the right of the centre line it is
  // Each is a dot product of the offset with a unit direction: the same
  // "project onto the view direction" idea as the fisheye fix. So `forward`
  // is a perpendicular distance, directly comparable with the wall depths.
  const visible = [];
  for (const sprite of SPRITES) {
    const dx = sprite.x - player.x;
    const dy = sprite.y - player.y;
    const forward = dx * dirX + dy * dirY;
    const across = dx * rightX + dy * rightY;
    if (forward < 0.1) continue; // behind us, or so close we're standing in it
    visible.push({ sprite, forward, across });
  }

  // Painter's algorithm: draw the farthest first so nearer ones paint over it.
  visible.sort((a, b) => b.forward - a.forward);
  for (const v of visible) drawSprite(pixels, depth, v);
}

function drawSprite(pixels, depth, { sprite, forward, across }) {
  const tex = SPRITE_TYPES[sprite.type].texture;

  // Same similar triangles as the walls: something 1 unit across at distance
  // `forward` is PROJ_DIST / forward pixels wide, and a point `across` units
  // to the right appears across * PROJ_DIST / forward pixels right of centre.
  const size = PROJ_DIST / forward;
  const centreX = SCREEN_W / 2 + across * PROJ_DIST / forward;
  const left = centreX - size / 2;
  const top = (SCREEN_H - size) / 2; // same vertical span as a wall at this distance

  // As for walls: the columns and rows whose pixel centres fall on the sprite.
  const colStart = Math.max(0, Math.ceil(left - 0.5));
  const colEnd = Math.min(SCREEN_W, Math.ceil(left + size - 0.5));
  const rowStart = Math.max(0, Math.ceil(top - 0.5));
  const rowEnd = Math.min(SCREEN_H, Math.ceil(top + size - 0.5));

  for (let col = colStart; col < colEnd; col++) {
    // THE DEPTH BUFFER. depth[col] is how far away the wall in this column is.
    // If that wall is nearer than the sprite, it hides this whole column of
    // the sprite: that's how a pillar can cover half a barrel.
    if (depth[col] < forward) continue;

    const texX = Math.min(TEX_SIZE - 1, Math.floor((col + 0.5 - left) / size * TEX_SIZE));
    for (let row = rowStart; row < rowEnd; row++) {
      const texY = Math.min(TEX_SIZE - 1, Math.floor((row + 0.5 - top) / size * TEX_SIZE));
      if (isTransparent(tex, texX, texY)) continue; // see-through: keep what's behind
      copyTexel(pixels, col, row, tex, texX, texY, 1);
    }
  }
}
