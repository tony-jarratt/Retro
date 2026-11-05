// LIGHTING. The level has a LIGHT MAP: a grid of RGB brightness values,
// LIGHT_RES samples per cell in each direction. Every pixel the renderer draws
// is multiplied by the light at its spot in the world, so walls, floor,
// ceiling and sprites are all bright near a lamp and dim away from one.
//
// Each light's contribution is worked out at startup, with shadows: for
// every sample, castRay checks whether a wall stands between it and the light
// (the same line-of-sight test the robots use to see you). It's only redone
// when a nearby door moves (updateDoorLights). Every frame the
// contributions are added up, each scaled by how bright its light is right
// now, which is what lets a lamp flicker without redoing the shadow work.
// Muzzle flashes are added on top while they last.
//
// Glowing texels (screens, bulbs, visors) ignore all this: they make their own light.

const LIGHT_RES = 4;                  // samples per cell, in each direction
const LIGHT_W = MAP[0].length * LIGHT_RES;
const LIGHT_H = MAP.length * LIGHT_RES;
const AMBIENT = [0.3, 0.3, 0.34];     // light everywhere, even far from any lamp: dim, a little cool
const FULL_LIGHT = [1, 1, 1];

// Light colours are multipliers: [1, 1, 1] shows a texture as drawn, more
// than 1 brightens it, and each channel can differ to tint it.
const LAMP_LIGHT = { colour: [1.4, 0.85, 0.35], radius: 4.5 };    // caged sodium lamps
const CEILING_LIGHT = { colour: [0.9, 0.95, 1.05], radius: 3.5 }; // strip lights: cool white
const SCREEN_LIGHT = { colour: [0.15, 0.5, 0.25], radius: 2.5 };  // computer banks: a green spill
const PLAYER_FLASH = { colour: [0.9, 1.2, 1.4], radius: 5 };      // your pulse pistol
const ROBOT_FLASH = { colour: [1.4, 1.0, 0.5], radius: 4.5 };     // a walker's chin gun

// A light map: 3 floats (R, G, B) per sample, row after row like everything else.
function newLightGrid() {
  return new Float32Array(LIGHT_W * LIGHT_H * 3);
}

// Light passes through floor and door cells; wall cells block it.
function isSolidCell(x, y) {
  const cell = MAP[Math.floor(y)][Math.floor(x)];
  return cell !== 0 && cell !== DOOR_CELL;
}

// Add one light into a grid. Brightness falls off smoothly to nothing at the
// light's radius ((1 - d/r) squared), and nothing reaches a sample that a wall
// shadows. Samples inside walls are skipped here; dilateIntoWalls fills them.
// The rectangle of samples a light at (x, y) can possibly reach.
function lightBox(x, y, radius) {
  return {
    sx0: Math.max(0, Math.floor((x - radius) * LIGHT_RES)),
    sx1: Math.min(LIGHT_W - 1, Math.ceil((x + radius) * LIGHT_RES)),
    sy0: Math.max(0, Math.floor((y - radius) * LIGHT_RES)),
    sy1: Math.min(LIGHT_H - 1, Math.ceil((y + radius) * LIGHT_RES)),
  };
}

function addLight(grid, x, y, colour, radius, strength) {
  const { sx0, sx1, sy0, sy1 } = lightBox(x, y, radius);
  for (let sy = sy0; sy <= sy1; sy++) {
    for (let sx = sx0; sx <= sx1; sx++) {
      const px = (sx + 0.5) / LIGHT_RES; // where this sample sits in the world
      const py = (sy + 0.5) / LIGHT_RES;
      const dx = px - x;
      const dy = py - y;
      const d = Math.hypot(dx, dy);
      if (d >= radius || isSolidCell(px, py)) continue;
      // SHADOWS: walk a ray from the light towards the sample. If it hits a
      // wall (or closed door) before getting there, the sample is in shadow.
      if (d > 0.01 && castRay(x, y, dx / d, dy / d).dist < d) continue;
      const f = strength * (1 - d / radius) * (1 - d / radius);
      const i = (sy * LIGHT_W + sx) * 3;
      grid[i] += colour[0] * f;
      grid[i + 1] += colour[1] * f;
      grid[i + 2] += colour[2] * f;
    }
  }
}

// Samples inside walls get no light of their own, but the blending in lightAt
// reaches up to one sample into a wall when lighting its face. So each wall
// sample takes the average of its open neighbours, or a dark seam would
// appear along the bottom of every wall. ("Dilation": growing the lit area
// one sample outwards.) Wall samples only read open ones, so this is safe in place.
function dilateIntoWalls(grid) {
  for (let sy = 0; sy < LIGHT_H; sy++) {
    for (let sx = 0; sx < LIGHT_W; sx++) {
      if (!isSolidCell((sx + 0.5) / LIGHT_RES, (sy + 0.5) / LIGHT_RES)) continue;
      const sum = [0, 0, 0];
      let count = 0;
      for (let ny = sy - 1; ny <= sy + 1; ny++) {
        for (let nx = sx - 1; nx <= sx + 1; nx++) {
          if (nx < 0 || ny < 0 || nx >= LIGHT_W || ny >= LIGHT_H) continue;
          if (isSolidCell((nx + 0.5) / LIGHT_RES, (ny + 0.5) / LIGHT_RES)) continue;
          const j = (ny * LIGHT_W + nx) * 3;
          sum[0] += grid[j];
          sum[1] += grid[j + 1];
          sum[2] += grid[j + 2];
          count++;
        }
      }
      if (count === 0) continue; // deep inside a thick wall: nobody ever sees it
      const i = (sy * LIGHT_W + sx) * 3;
      grid[i] = sum[0] / count;
      grid[i + 1] = sum[1] / count;
      grid[i + 2] = sum[2] / count;
    }
  }
}

// Every static light in the level, gathered from the map data. `kind` says where it came from:
//   'lamp'      a lamp (props with type 'lamp', from SPRITES); `sprite` points back to it
//   'ceiling'   a strip light in one of the CEILING_LIGHTS cells
//   'screen'    a computer bank (MAP value 3), spilling a little green light
// Each gets its own pre-shadowed contribution grid. `flicker` lights stutter;
// `level` is how bright each one is this frame (updateLighting).
const LIGHTS = buildLights();

function buildLights() {
  const lights = [];
  const add = (x, y, kind, settings, flicker, sprite) => {
    const contribution = newLightGrid();
    addLight(contribution, x, y, settings.colour, settings.radius, 1);
    lights.push({
      x, y, kind, colour: settings.colour, radius: settings.radius, flicker, sprite, contribution, level: 1,
      box: lightBox(x, y, settings.radius), // only these samples can be lit by it
    });
  };
  for (const p of props) if (p.type === 'lamp') add(p.x, p.y, 'lamp', LAMP_LIGHT, p.flicker, p);
  for (const c of CEILING_LIGHTS) add(c.x + 0.5, c.y + 0.5, 'ceiling', CEILING_LIGHT, c.flicker === true, null);
  MAP.forEach((row, y) => row.forEach((cell, x) => {
    if (cell === 3) add(x + 0.5, y + 0.5, 'screen', SCREEN_LIGHT, false, null);
  }));
  return lights;
}

// What each ceiling cell's strip light is doing this frame: 'off' (dead or
// no light there), 'on', or 'alarm' (pulsing red). The renderer picks the
// ceiling texture to match.
const ceilingLightState = MAP.map((row) => row.map(() => 'off'));

// ALARMS: a strip light inside a zone whose alarm is going turns red and
// pulses. Rather than redo its shadows in a new colour, its precomputed
// contribution is TINTED: each channel is scaled by alarm colour / normal
// colour, which turns its white light into this red.
const ALARM_COLOUR = [1.8, 0.12, 0.08];
const ALARM_PULSE_SPEED = 6; // radians per second: about one pulse a second

// FLICKER: time is cut into short slices, and each slice the light rolls a
// repeatable random number (noise, from textures.js). Mostly it's on, with a
// little shimmer; now and then it drops almost to nothing.
function flickerLevel(lightIndex, time) {
  const n = noise(Math.floor(time / 0.07), lightIndex, 46);
  return n < 0.18 ? 0.1 : 0.85 + 0.15 * n;
}

// LIGHT THROUGH DOORS. Each light's shadows were worked out with every door
// shut. When a door moves, any light close enough to reach it is redone from
// scratch: castRay already knows how far each door has slid (hitDoor), so
// the redone shadows let light through exactly the gap that's open. As a door
// slides, a shaft of light widens through it into the room beyond.
// Redoing a light is the expensive part of lighting, but it only happens
// while a door is actually moving.
const doorOpenLastLit = DOORS.map((door) => door.open); // each door's position when its lights were last done

function updateDoorLights() {
  DOORS.forEach((door, n) => {
    if (door.open === doorOpenLastLit[n]) return;
    doorOpenLastLit[n] = door.open;
    for (const light of LIGHTS) {
      // Too far away for its light to reach this door's cell at all? Then
      // the door can't change its shadows. (0.75 covers the cell's corners.)
      if (Math.hypot(light.x - (door.x + 0.5), light.y - (door.y + 0.5)) > light.radius + 0.75) continue;
      light.contribution.fill(0);
      addLight(light.contribution, light.x, light.y, light.colour, light.radius, 1);
    }
  });
}

// The light map actually used for drawing this frame.
const lightGrid = newLightGrid();

function updateLighting() {
  updateDoorLights();

  for (let i = 0; i < lightGrid.length; i += 3) {
    lightGrid[i] = AMBIENT[0];
    lightGrid[i + 1] = AMBIENT[1];
    lightGrid[i + 2] = AMBIENT[2];
  }
  const pulse = 0.55 + 0.45 * Math.sin(animTime * ALARM_PULSE_SPEED);
  LIGHTS.forEach((light, n) => {
    light.level = light.flicker ? flickerLevel(n, animTime) : 1;
    light.alarm = light.kind === 'ceiling' && zoneAlarmedAt(light.x, light.y);
    // How much of each channel to add: the light's level, tinted red if alarmed.
    const scale = light.alarm
      ? ALARM_COLOUR.map((a, c) => pulse * a / light.colour[c])
      : [light.level, light.level, light.level];
    // Only the samples inside the light's reach: on a big level, adding every
    // light across the whole grid every frame would be mostly adding zeros.
    const { sx0, sx1, sy0, sy1 } = light.box;
    for (let sy = sy0; sy <= sy1; sy++) {
      for (let i = (sy * LIGHT_W + sx0) * 3; i < (sy * LIGHT_W + sx1 + 1) * 3; i += 3) {
        lightGrid[i] += light.contribution[i] * scale[0];
        lightGrid[i + 1] += light.contribution[i + 1] * scale[1];
        lightGrid[i + 2] += light.contribution[i + 2] * scale[2];
      }
    }
  });
  // A strip light's tube glows only while its light is mostly on, red in an alarm.
  for (const light of LIGHTS) {
    if (light.kind !== 'ceiling') continue;
    ceilingLightState[Math.floor(light.y)][Math.floor(light.x)] = light.alarm ? 'alarm' : light.level > 0.5 ? 'on' : 'off';
  }

  // Muzzle flashes, fading as their flash timers run down. Worked out fresh
  // each frame (shadows and all), which is affordable for a light or two.
  if (gun.flash > 0) {
    addLight(lightGrid, player.x, player.y, PLAYER_FLASH.colour, PLAYER_FLASH.radius, gun.flash / GUN_FLASH_TIME);
  }
  for (const e of enemies) {
    if (e.firedTime > 0) addLight(lightGrid, e.x, e.y, ROBOT_FLASH.colour, ROBOT_FLASH.radius, e.firedTime / ROBOT_FIRE_FLASH);
  }
  // Explosions: a big orange light that dies away with the fireball.
  for (const b of explosions) {
    addLight(lightGrid, b.x, b.y, BLAST_LIGHT.colour, BLAST_LIGHT.radius, 1 - b.time / EXPLOSION_TIME);
  }
  // Rockets light their way as they fly: you see one coming down a dark corridor.
  for (const r of rockets) addLight(lightGrid, r.x, r.y, ROCKET_LIGHT.colour, ROCKET_LIGHT.radius, 1);
  addSecurityLights(lightGrid); // cameras' red spots (security.js)

  dilateIntoWalls(lightGrid);
}

// The light at any point in the world, BLENDED between the four nearest
// samples ("bilinear interpolation"): first along x on the two rows either
// side, then between those two results along y. Without the blending, light
// would change in visible quarter-cell squares.
function lightAt(x, y) {
  const gx = x * LIGHT_RES - 0.5; // position in sample units, samples sitting at whole numbers
  const gy = y * LIGHT_RES - 0.5;
  const x0 = Math.max(0, Math.min(LIGHT_W - 2, Math.floor(gx)));
  const y0 = Math.max(0, Math.min(LIGHT_H - 2, Math.floor(gy)));
  const fx = Math.max(0, Math.min(1, gx - x0)); // how far towards the next sample, 0..1
  const fy = Math.max(0, Math.min(1, gy - y0));
  const i00 = (y0 * LIGHT_W + x0) * 3;
  const i10 = i00 + 3;
  const i01 = i00 + LIGHT_W * 3;
  const i11 = i01 + 3;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const top = lightGrid[i00 + c] + (lightGrid[i10 + c] - lightGrid[i00 + c]) * fx;
    const bottom = lightGrid[i01 + c] + (lightGrid[i11 + c] - lightGrid[i01 + c]) * fx;
    out[c] = top + (bottom - top) * fy;
  }
  return out;
}

// How brightly a lamp sprite's bulb glows: in step with its light, so a
// flickering lamp's bulb flickers too. Anything else glows at full strength.
function spriteGlow(sprite) {
  const light = LIGHTS.find((l) => l.sprite === sprite);
  return light ? light.level : 1;
}
