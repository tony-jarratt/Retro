// Sprites: flat pictures standing in the world (fuel drums, struts, lamps, and
// the robots from enemies.js). A sprite is a 1x1-unit picture that always
// turns to face the camera (a "billboard"). Sprites are drawn after the walls,
// column by column, and are hidden wherever a wall is nearer. Where the
// static ones stand is listed in the level file (levels/*.js).

// What each kind of sprite looks like, whether it blocks movement, and
// whether shooting it sets it off (explosions.js).
const SPRITE_TYPES = {
  drum:   { texture: DRUM_TEXTURE,   solid: true,  explosive: true },
  strut:  { texture: STRUT_TEXTURE,  solid: true,  explosive: false },
  lamp:   { texture: LAMP_TEXTURE,   solid: false, explosive: false },
};

const SOLID_SPRITE_RADIUS = 0.3; // half-width of a solid sprite's collision box, in cells

// The objects actually standing in the level: a copy of the map's SPRITES,
// so that blowing up a drum never changes the map data itself.
//   state   'intact', 'fuse' (caught in a blast, about to go off), or 'exploded'
//   fuse    seconds until a 'fuse' drum explodes
const props = SPRITES.map((s) => ({ type: s.type, x: s.x, y: s.y, flicker: s.flicker === true, state: 'intact', fuse: 0 }));

// Does a box of half-width r centred on (x, y) overlap any solid sprite?
// An exploded drum's remains aren't solid.
function hitsSolidSprite(x, y, r) {
  return props.some((p) => SPRITE_TYPES[p.type].solid && p.state !== 'exploded' &&
    boxesOverlap(x, y, r, p.x, p.y, SOLID_SPRITE_RADIUS));
}

// Everything drawn as a billboard this frame, as seen by `viewer`. Props,
// robots (wrecks included), pickups and explosions go into one list, so they
// sort together: a robot walking behind a drum is hidden by it, in front it isn't.
//   tex        the picture to draw
//   shade      brightness multiplier (a robot flashes white when you hit it)
//   glowShade  brightness of glowing texels (a robot's eye brightens as it
//              charges; a flickering lamp's bulb dims with its light)
//   enemy      the robot this is, or null
//   prop       the prop (drum, strut, lamp) this is, or null
//   camera     the security camera this is, or null
//   drone      the drone this is (drones.js), or null
//   effect     true for an explosion, rocket or laser beam: you can see it, but shots pass through
function spriteThings(viewer) {
  const thing = (x, y, tex, extra) => ({ x, y, tex, shade: 1, glowShade: 1, enemy: null, prop: null, camera: null, drone: null, effect: false, ...extra });
  return [
    ...props.map((p) => thing(p.x, p.y, p.state === 'exploded' ? DRUM_WRECK_TEXTURE : SPRITE_TYPES[p.type].texture,
      { glowShade: spriteGlow(p), prop: p })),
    ...enemies.map((e) => thing(e.x, e.y, enemyTexture(e, viewer), {
      shade: e.hurtTime > 0 ? 3 : 1,
      glowShade: e.state === 'aim' ? 1 + 1.5 * e.charge / ROBOT_TYPES[e.type].charge : 1,
      enemy: e,
    })),
    ...pickups.map((p) => thing(p.x, p.y, PICKUP_TYPES[p.type].texture)),
    ...securityThings(thing), // cameras and tripwire beams (security.js)
    ...steamThings(thing),    // plumes of steam (steam.js)
    ...droneThings(thing),    // the swarm (drones.js)
    ...rockets.map((r) => thing(r.x, r.y, ROCKET_TEXTURE, { effect: true })),
    ...glassBursts.map((g) => thing(g.x, g.y, glassBurstTexture(g), { effect: true })), // panels.js
    // Explosions come last: one drawn at the same spot as its drum's remains
    // ties on distance, and ties keep list order, so the fireball goes on top.
    ...explosions.map((b) => thing(b.x, b.y, explosionTexture(b), { effect: true })),
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

// Every sprite on screen this frame, FARTHEST FIRST, with where it lands and
// how it's lit. Worked out once per frame and used twice: to draw the
// sprites, and to show them reflected in puddles (reflections.js).
function placeSprites(player) {
  const placed = [];
  for (const thing of spriteThings(player)) {
    const spot = placeOnScreen(thing, player);
    if (!spot) continue;
    const g = thing.shade * thing.glowShade;
    placed.push({
      thing, ...spot,
      fog: fogAmount(spot.forward), // a billboard is flat, so one distance for all of it
      // Likewise one light for all of it: the light map at the spot it stands on.
      light: lightAt(thing.x, thing.y).map((v) => v * thing.shade),
      glowLight: [g, g, g],
    });
  }
  // Painter's algorithm: draw the farthest first so nearer ones paint over it.
  placed.sort((a, b) => b.forward - a.forward);
  return placed;
}

// depth[col] is the perpendicular distance to the wall drawn in that column.
function renderSprites(pixels, depth, placed) {
  for (const p of placed) drawSprite(pixels, depth, p);
}

function drawSprite(pixels, depth, { thing, forward, size, left, top, fog, light, glowLight }) {
  const tex = thing.tex;

  // As for walls: the columns and rows whose pixel centres fall on the sprite.
  const colStart = Math.max(0, Math.ceil(left - 0.5));
  const colEnd = Math.min(SCREEN_W, Math.ceil(left + size - 0.5));
  const rowStart = Math.max(0, Math.ceil(top - 0.5));
  const rowEnd = Math.min(SCREEN_H, Math.ceil(top + size - 0.5));

  for (let col = colStart; col < colEnd; col++) {
    // THE DEPTH BUFFER. depth[col] is how far away the wall in this column is.
    // If that wall is nearer than the sprite, it hides this whole column of
    // the sprite: that's how a pillar can cover half a drum.
    if (depth[col] < forward) continue;

    const texX = Math.min(TEX_SIZE - 1, Math.floor((col + 0.5 - left) / size * TEX_SIZE));
    for (let row = rowStart; row < rowEnd; row++) {
      const texY = Math.min(TEX_SIZE - 1, Math.floor((row + 0.5 - top) / size * TEX_SIZE));
      if (isTransparent(tex, texX, texY)) continue; // see-through: keep what's behind
      // Note how far away this pixel's sprite is, so glass and grates drawn
      // afterwards know whether they're in front of it (raycaster.js, renderPanes).
      pixelDepth[row * SCREEN_W + col] = forward;
      // Glowing texels make their own light, so neither the light map nor the
      // fog dims them: a robot's visor shows in the dark before its body does.
      if (glows(tex, texX, texY)) {
        copyTexel(pixels, col, row, tex, texX, texY, glowLight, 0);
      } else if (tex.pixels[(texY * TEX_SIZE + texX) * 4 + 3] < 255) {
        blendTexel(pixels, col, row, tex, texX, texY, light, fog); // part see-through: steam
      } else {
        copyTexel(pixels, col, row, tex, texX, texY, light, fog);
      }
    }
  }
}
