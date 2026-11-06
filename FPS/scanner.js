// THE SCANNER (owner, 2026-11-06): the suit's structural scanner, a
// maintenance tool for finding what's behind the walls. X switches it on and
// off (a toggle: so the cost is real, not something you peek and drop).
//
// SCANNING, the view is VECTOR: no textures, no light, only lines in green
// phosphor. Wall corners and edges, door frames, a faint grid on the floor.
// And it sees ONE WALL THROUGH: the room behind the nearest wall, fainter.
// Everything fades out by SCAN_RANGE (SCAN_RANGE_MK2 with the upgrade).
//
// IT ONLY SEES SOLID THINGS: walls, doors, robots and their wrecks, turrets,
// drones, cameras, props (drums, struts, desks), and the things lying about
// (pickups). Nothing ANIMAL or VEGETABLE: no creatures, no infected, no
// larvae or moths, no bodies, no potted plants. So in the industrial sector
// it shows you the walker waiting round the corner; in the lab it shows you
// the building and nothing that's hunting you in it.
//
// THE COST: you walk at SCAN_SLOW speed while it's on (the suit's power goes
// to the scanner), and with no textures you can't tell an amber trapped
// screen from a green one, or a red keycard door from any other.
//
// You FIND it: a module at the end of the Workshops, by the lift key, just as
// the alarm brings everything out for you (its first pickup tells you the key);
// then it goes up in the lift with you (campaign.js). THE UPGRADE, in the
// Offices, sees TWO walls through, and further (SCAN_RANGE_MK2).

const SCAN_RANGE = 8;          // cells: nothing further shows
const SCAN_RANGE_MK2 = 12;     // ...with the upgrade
const SCAN_SLOW = 0.67;        // your walking speed while scanning: a third slower (owner, 2026-11-06: was half)
const SCAN_BEHIND = 0.5;       // how bright what's behind a wall is, against what's in front
const SCAN_GREEN = [70, 230, 120];
const SCAN_GRID = 0.005;       // floor grid line half-width, in cells per cell of distance: about a pixel wide near and far
const SCAN_TICK = 0.7;         // seconds between the sweep's ticks (sound.js)
const SCAN_SWEEP = 1.6;        // seconds for the sweep line to cross the screen

let scanTickTimer = 0;

// X (player.js).
function toggleScanner() {
  if (paused || game.state !== 'playing' || !player.scanner) return;
  player.scanning = !player.scanning;
  sfxScanToggle(player.scanning); // sound.js
}

// The module, picked up (pickups.js).
function collectScanner() {
  if (player.scanner) return;
  player.scanner = true;
  showWeaponMessage('STRUCTURAL SCANNER', 'PRESS X TO SCAN'); // weapons.js
}

// The upgrade (pickups.js).
function collectScannerUpgrade() {
  player.scanner = true;
  player.scannerMk2 = true;
  showWeaponMessage('SCANNER UPGRADE', 'TWO WALLS DEEP  RANGE ' + SCAN_RANGE_MK2);
}

// How far it sees, and how many walls through.
function scanRange() { return player.scannerMk2 ? SCAN_RANGE_MK2 : SCAN_RANGE; }
function scanWalls() { return player.scannerMk2 ? 2 : 1; }

// Each frame (main.js): it switches off when the level ends, and ticks while on.
function updateScanner(dt) {
  if (game.state !== 'playing') player.scanning = false;
  if (!player.scanning) return;
  scanTickTimer -= dt;
  if (scanTickTimer <= 0) { scanTickTimer = SCAN_TICK; sfxScanTick(); }
}

// Does the scanner see this sprite? Solid, not living, not growing.
function scannerSees(thing) {
  if (thing.effect || thing.larva || thing.moth || thing.root) return false; // a root (ambush.js) is vegetable
  if (thing.enemy) return !ENEMY_TYPES[thing.enemy.type].creature; // a robot, standing or wrecked
  if (thing.prop) return thing.prop.type !== 'plant' && thing.prop.type !== 'lamp';
  return true; // drones, cameras, pickups, the charge
}

// How bright a line is at distance d: full close to, nothing at the scan's range.
function scanFade(d) {
  return Math.max(0, 1 - d / scanRange());
}

function scanPixel(pixels, x, y, level) {
  if (x < 0 || x >= SCREEN_W || y < 0 || y >= SCREEN_H || level <= 0) return;
  const i = (y * SCREEN_W + x) * 4;
  // Lines add up (a corner seen through a wall over a floor line is brighter), capped by the colour.
  for (let c = 0; c < 3; c++) pixels[i + c] = Math.min(255, pixels[i + c] + SCAN_GREEN[c] * level);
}

// Past the first wall: march on through the solid cells (walls are a cell
// or two thick) to the open space beyond, and cast again from there.
// Returns the second hit, its dist measured from the player; or null.
function hitBeyond(hit, rayX, rayY) {
  for (let t = 0.02; t < 3; t += 0.05) {
    const x = hit.hitX + rayX * t, y = hit.hitY + rayY * t;
    const cell = MAP[Math.floor(y)]?.[Math.floor(x)];
    if (cell === undefined) return null;
    if (cell !== 0) continue;
    if (hit.dist + t > scanRange()) return null;
    const next = castRay(x, y, rayX, rayY);
    return { ...next, dist: hit.dist + t + next.dist };
  }
  return null;
}

// One column's wall outline: its top and bottom edge, and (if this column
// starts a new face) a vertical line down it: a corner, a door frame.
function drawScanWall(pixels, col, perp, newFace, level) {
  const h = PROJ_DIST / perp;
  const top = Math.round((SCREEN_H - h) / 2), bottom = Math.round((SCREEN_H + h) / 2) - 1;
  scanPixel(pixels, col, top, level);
  scanPixel(pixels, col, bottom, level);
  if (newFace) for (let y = Math.max(0, top); y <= Math.min(SCREEN_H - 1, bottom); y++) scanPixel(pixels, col, y, level * 0.8);
}

// Are two neighbouring columns' hits on different faces? A face is one
// side of one straight run of wall: same side, same grid line (or the same door).
function faceKey(hit) {
  if (!hit) return null;
  if (hit.door) return 'door' + hit.door.x + ',' + hit.door.y;
  return hit.side === 0 ? 'x' + Math.round(hit.hitX) : 'y' + Math.round(hit.hitY);
}

// THE SCAN VIEW, instead of renderView (main.js).
function renderScanView(image, hits, player) {
  const pixels = image.data;
  for (let i = 0; i < pixels.length; i += 4) { pixels[i] = 0; pixels[i + 1] = 6; pixels[i + 2] = 3; pixels[i + 3] = 255; }

  const dirX = Math.cos(player.angle), dirY = Math.sin(player.angle);
  const halfWidth = Math.tan(FOV / 2);
  const planeX = -dirY * halfWidth, planeY = dirX * halfWidth;

  // THE FLOOR: grid lines where it's open floor, near you.
  const horizon = SCREEN_H / 2;
  for (let row = horizon; row < SCREEN_H; row++) {
    const d = 0.5 * PROJ_DIST / (row + 0.5 - horizon);
    if (d > scanRange()) continue;
    const w = SCAN_GRID * d + 0.003;
    for (let col = 0; col < SCREEN_W; col++) {
      if (d > hits[col].perpDist) continue; // the floor beyond the wall isn't seen from here
      const screenX = 2 * (col + 0.5) / SCREEN_W - 1;
      const fx = player.x + d * (dirX + planeX * screenX), fy = player.y + d * (dirY + planeY * screenX);
      const onLine = Math.abs(fx - Math.round(fx)) < w || Math.abs(fy - Math.round(fy)) < w;
      if (onLine) scanPixel(pixels, col, row, 0.3 * scanFade(d));
    }
  }

  // THE WALLS, layer by layer: layers[0] is what you'd see, layers[1] the
  // wall behind that, (with the upgrade) layers[2] the one behind that.
  // Drawn deepest first, each fainter by SCAN_BEHIND than the one in front.
  const range = scanRange();
  const layers = [hits];
  for (let k = 1; k <= scanWalls(); k++) {
    const prev = layers[k - 1], next = new Array(SCREEN_W);
    for (let col = 0; col < SCREEN_W; col++) {
      const relAngle = Math.atan((2 * (col + 0.5) / SCREEN_W - 1) * halfWidth);
      const a = player.angle + relAngle;
      const hit = prev[col];
      next[col] = hit && hit.dist < range ? hitBeyond(hit, Math.cos(a), Math.sin(a)) : null;
      if (next[col]) next[col].perpDist = next[col].dist * Math.cos(relAngle);
    }
    layers.push(next);
  }
  // How deep each column can be seen into: to the last wall the scan reaches.
  const behindDepth = new Float32Array(SCREEN_W);
  for (let col = 0; col < SCREEN_W; col++) {
    let deepest = hits[col].perpDist;
    for (const layer of layers) if (layer[col]) deepest = layer[col].perpDist;
    behindDepth[col] = deepest;
  }
  for (let k = layers.length - 1; k >= 0; k--) {
    const layer = layers[k];
    for (let col = 0; col < SCREEN_W; col++) {
      const h = layer[col];
      if (!h || h.dist > range) continue;
      const newFace = col > 0 && faceKey(layer[col - 1]) !== faceKey(h);
      drawScanWall(pixels, col, h.perpDist, newFace, Math.pow(SCAN_BEHIND, k) * scanFade(h.dist));
    }
  }

  // THE SOLID THINGS: each as an outline, bright in front of the nearest
  // wall, dim behind it (and not at all behind the second).
  for (const p of placeSprites(player)) { // sprites.js
    if (!scannerSees(p.thing) || p.forward > range) continue;
    const { thing, size, left, top, forward } = p;
    const opaque = (col, row) => {
      const tx = Math.floor((col + 0.5 - left) / size * TEX_SIZE), ty = Math.floor((row + 0.5 - top) / size * TEX_SIZE);
      return tx >= 0 && tx < TEX_SIZE && ty >= 0 && ty < TEX_SIZE && !isTransparent(thing.tex, tx, ty);
    };
    const c0 = Math.max(0, Math.floor(left)), c1 = Math.min(SCREEN_W - 1, Math.ceil(left + size));
    const r0 = Math.max(0, Math.floor(top)), r1 = Math.min(SCREEN_H - 1, Math.ceil(top + size));
    for (let col = c0; col <= c1; col++) {
      if (behindDepth[col] < forward) continue; // behind the second wall too
      // Bright in front of the nearest wall; a wall fainter for each one it's behind.
      let walls = 0;
      for (let k = 0; k < layers.length - 1; k++) if (layers[k][col] && layers[k][col].perpDist < forward) walls = k + 1;
      const level = Math.pow(SCAN_BEHIND, walls) * scanFade(forward);
      for (let row = r0; row <= r1; row++) {
        if (!opaque(col, row)) continue;
        if (opaque(col - 1, row) && opaque(col + 1, row) && opaque(col, row - 1) && opaque(col, row + 1)) continue; // inside, not edge
        scanPixel(pixels, col, row, level);
      }
    }
  }

  // The sweep: a faint bright line rolling down the screen, and SCAN on the visor's top rim.
  const sweep = Math.floor((animTime / SCAN_SWEEP % 1) * SCREEN_H);
  for (let col = 0; col < SCREEN_W; col++) scanPixel(pixels, col, sweep, 0.12);
}

// SCAN, blinking on the top rim (hud.js), while it's on.
function drawScanReadout(pixels) {
  if (player.scanning && Math.floor(animTime * 2) % 2 === 0) drawText(pixels, 'SCAN', READOUT_MARGIN + 30, 1, SCAN_GREEN, 1);
}
