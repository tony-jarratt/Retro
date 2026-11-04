// Sprites: flat pictures standing in the world (barrels, columns, lamps, and
// the robots from enemies.js). A sprite is a 1x1-unit picture that always
// turns to face the camera (a "billboard"). Sprites are drawn after the walls,
// column by column, and are hidden wherever a wall is nearer. Where the
// static ones stand is listed in map.js.

// What each kind of sprite looks like, and whether it blocks movement.
const SPRITE_TYPES = {
  barrel: { texture: BARREL_TEXTURE, solid: true },
  column: { texture: COLUMN_TEXTURE, solid: true },
  lamp:   { texture: LAMP_TEXTURE,   solid: false },
};

const SOLID_SPRITE_RADIUS = 0.3; // half-width of a solid sprite's collision box, in cells

// Does a box of half-width r centred on (x, y) overlap any solid sprite?
function hitsSolidSprite(x, y, r) {
  return SPRITES.some((s) => SPRITE_TYPES[s.type].solid &&
    boxesOverlap(x, y, r, s.x, s.y, SOLID_SPRITE_RADIUS));
}

// Everything drawn as a billboard this frame, as seen by `viewer`. Static
// sprites, robots (wrecks included) and pickups go into one list, so they sort
// together: a robot walking behind a barrel is hidden by it, in front it isn't.
//   tex        the picture to draw
//   shade      brightness multiplier (a robot flashes white when you hit it)
//   glowShade  brightness of glowing texels (a robot's eye brightens as it charges)
//   enemy      the robot this is, or null
function spriteThings(viewer) {
  return [
    ...SPRITES.map((s) => ({ x: s.x, y: s.y, tex: SPRITE_TYPES[s.type].texture, shade: 1, glowShade: 1, enemy: null })),
    ...enemies.map((e) => ({
      x: e.x,
      y: e.y,
      tex: enemyTexture(e, viewer),
      shade: e.hurtTime > 0 ? 3 : 1,
      glowShade: e.state === 'aim' ? 1 + 1.5 * e.charge / ROBOT_CHARGE_TIME : 1,
      enemy: e,
    })),
    ...pickups.map((p) => ({ x: p.x, y: p.y, tex: PICKUP_TYPES[p.type].texture, shade: 1, glowShade: 1, enemy: null })),
  ];
}

// Where on screen does this thing's 1x1 square land? Returns null if it's
// behind the viewer. Used both to draw sprites and to test what the
// crosshair is over (combat.js), so the two can never disagree.
function placeOnScreen(thing, viewer) {
  const dirX = Math.cos(viewer.angle);
  const dirY = Math.sin(viewer.angle);
  const rightX = -dirY; // same "right" as in player.js
  const rightY = dirX;

  // CAMERA SPACE. Re-describe the thing's position relative to the eye:
  //   forward = how far in front of us it is, along the view direction
  //   across  = how far to the right of the centre line it is
  // Each is a dot product of the offset with a unit direction: the same
  // "project onto the view direction" idea as the fisheye fix. So `forward`
  // is a perpendicular distance, directly comparable with the wall depths.
  const dx = thing.x - viewer.x;
  const dy = thing.y - viewer.y;
  const forward = dx * dirX + dy * dirY;
  const across = dx * rightX + dy * rightY;
  if (forward < 0.1) return null; // behind us, or so close we're standing in it

  // Same similar triangles as the walls: something 1 unit across at distance
  // `forward` is PROJ_DIST / forward pixels wide, and a point `across` units
  // to the right appears across * PROJ_DIST / forward pixels right of centre.
  const size = PROJ_DIST / forward;
  const left = SCREEN_W / 2 + across * PROJ_DIST / forward - size / 2;
  const top = (SCREEN_H - size) / 2; // same vertical span as a wall at this distance
  return { forward, size, left, top };
}

// depth[col] is the perpendicular distance to the wall drawn in that column.
function renderSprites(pixels, depth, player) {
  const placed = [];
  for (const thing of spriteThings(player)) {
    const spot = placeOnScreen(thing, player);
    if (spot) placed.push({ thing, ...spot });
  }
  // Painter's algorithm: draw the farthest first so nearer ones paint over it.
  placed.sort((a, b) => b.forward - a.forward);
  for (const p of placed) drawSprite(pixels, depth, p);
}

function drawSprite(pixels, depth, { thing, forward, size, left, top }) {
  const tex = thing.tex;
  const fog = fogAmount(forward); // a billboard is flat, so one distance for all of it

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
      // Glowing texels make their own light, so the fog doesn't dim them:
      // a robot's eye shows in the dark before its body does.
      if (tex.glow[texY * TEX_SIZE + texX] === 1) {
        copyTexel(pixels, col, row, tex, texX, texY, thing.shade * thing.glowShade, 0);
      } else {
        copyTexel(pixels, col, row, tex, texX, texY, thing.shade, fog);
      }
    }
  }
}
