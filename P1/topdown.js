// Overhead view (Micro Machines style): the car steers freely on a 2D map of the circuit.
//
// The map position is turned back into the numbers the race rules use (distance along the track =
// playerProgress, sideways offset across the road = playerX), so laps, tyres, weather, pit stops,
// AI and standings in game.js work from it.

const TD_ZOOM = 0.04;          // screen pixels per world unit when standing still (closest zoom)
const TD_ZOOM_FAR = 0.032;     // zoomed out to this at top speed, to see further ahead
const TD_HALF = 700;           // half the road width in world units: playerX = +-1 is the road edge
const TD_WALL = 1.6;           // invisible wall just outside the kerb, in playerX units
const TD_WALL_PIT = 2.9;       // ...and out beyond the pit lane, while the car is alongside it
const TD_GRASS_WEAR = 1;       // tyres wear this many times faster on the grass (1 = no extra wear; slowing down is penalty enough)
const TD_CAR_W = 0.4;          // two cars touch when closer than this sideways (playerX units)...
const TD_CAR_LEN = 650;        // ...and this far apart along the track (world units)
// How far solid roadside objects reach in world units (their size plus half a car), by type.
const TD_HIT = {
  tree: 480, bush: 260, rock: 230, hay: 230, tyres: 270, barrier: 240, board: 230, stand: 430, wing: 600, garage: 410,
  gantry: 0, pond: 0, carpark: 0, marshal: 0, flowers: 0,   // ground-level or too far out to reach
  building: 0, water: 0, yacht: 0,
  pitwall: 210, pitsign: 0,
};
const TD_AI_PACE = 0.65;       // AI cars are slower here: the player has to steer round the corners
const TD_CAMERA_LEAD = 0.35;   // the camera looks this many seconds ahead of the car

let tdPts = [];                // centreline point at the start of each segment (plus a closing point)
let tdHead = [];               // heading at each of those points (radians, 0 = east, clockwise on screen)
let tdDirX = [], tdDirY = [];  // unit direction of each segment
let tdX = 0, tdY = 0, tdHeading = 0, tdVx = 0, tdVy = 0;   // the player's car
let tdS = 0;                   // distance along the track
let tdIndex = 0;               // segment the car is on
let tdCamX = 0, tdCamY = 0;
let tdZoom = TD_ZOOM;          // current zoom, between TD_ZOOM and TD_ZOOM_FAR
let tdInLane = false;           // the car is in the pit lane
let tdPitCommit = false;        // the car has driven onto the pit entry road: the limiter is on and the lane assist steers
let tdLastBeep = 0;            // last countdown number that beeped

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

// ---- Map geometry ----
// Each section turns by the angle given in track.mapTurns, spread over its segments in proportion to
// the section's curve profile (so a corner is tightest where its curve value is largest).
// The centreline of a track as points on the map, and the heading at each. Pure: it does not touch the
// track that is loaded, so the circuit screen can draw every circuit.
function computeMapPoints(track) {
  const turns = track.mapTurns;
  if (!turns) throw new Error('track ' + track.name + ' has no mapTurns, so the overhead view cannot draw it');
  const curves = trackCurves(track);

  let x = 0, y = 0, h = 0, first = 0, maxDh = 0;
  const pts = [{ x: 0, y: 0 }];
  const head = [0];
  for (const [name, enter, hold, leave] of track.sections) {
    const count = enter + hold + leave;
    const turn = (turns[name] || 0) * Math.PI / 180;
    let total = 0;
    for (let i = 0; i < count; i++) total += Math.abs(curves[first + i]);
    for (let i = 0; i < count; i++) {
      const weight = total > 0 ? Math.abs(curves[first + i]) / total : 1 / count;
      const dh = turn * weight;
      maxDh = Math.max(maxDh, Math.abs(dh));
      const mid = h + dh / 2;
      x += Math.cos(mid) * SEGMENT_LENGTH;
      y += Math.sin(mid) * SEGMENT_LENGTH;
      h += dh;
      pts.push({ x, y });
      head.push(h);
    }
    first += count;
  }
  const n = curves.length;

  // Spread any gap between the end and the start along the whole lap.
  const gx = x, gy = y;
  for (let i = 0; i <= n; i++) { pts[i].x -= gx * i / n; pts[i].y -= gy * i / n; }
  const gap = Math.hypot(gx, gy) / (n * SEGMENT_LENGTH);
  if (gap > 0.03) console.warn('overhead map of ' + track.name + ' does not close well: gap of ' + Math.round(gx) + ',' + Math.round(gy) + ' units (' + (gap * 100).toFixed(1) + '% of the lap). Check mapTurns adds up to 360.');
  if (Math.abs(h) < 2 * Math.PI - 0.05 || Math.abs(h) > 2 * Math.PI + 0.05) console.warn('overhead map of ' + track.name + ' turns ' + Math.round(h * 180 / Math.PI) + ' degrees in total, expected 360.');
  const radius = SEGMENT_LENGTH / maxDh;
  if (radius < TD_HALF * 1.1) console.warn('overhead map of ' + track.name + ' has a corner with radius ' + Math.round(radius) + ' units, tighter than the road is wide (' + TD_HALF + '). The inside edge will fold over.');
  return { pts, head };
}

// Make the loaded track's map the one the game uses.
function buildTopTrack(track) {
  const map = computeMapPoints(track);
  tdPts = map.pts;
  tdHead = map.head;
  tdDirX = []; tdDirY = [];
  for (let i = 0; i < tdPts.length - 1; i++) {
    const dx = tdPts[i + 1].x - tdPts[i].x, dy = tdPts[i + 1].y - tdPts[i].y;
    const len = Math.hypot(dx, dy);
    tdDirX.push(dx / len);
    tdDirY.push(dy / len);
  }
  tdPitPoints = null;   // the pit road moves with the track
}

// World position and heading at distance s along the track, `lateral` world units to the right of the centreline.
function tdPointAt(s, lateral) {
  const n = segments.length;
  const sw = wrap(s, trackLength);
  const i = Math.min(n - 1, Math.floor(sw / SEGMENT_LENGTH));
  const f = (sw - i * SEGMENT_LENGTH) / SEGMENT_LENGTH;
  const a = tdPts[i], b = tdPts[i + 1];
  return {
    x: a.x + (b.x - a.x) * f - tdDirY[i] * lateral,
    y: a.y + (b.y - a.y) * f + tdDirX[i] * lateral,
    h: tdHead[i] + (tdHead[i + 1] - tdHead[i]) * f,
    i,
  };
}

// Find where a world point sits on the track: distance along it and sideways offset (right = positive).
// Only looks near the previous segment (hint) so a track that passes close to itself cannot confuse it.
function tdLocate(x, y, hint) {
  const n = segments.length;
  const from = hint < 0 ? 0 : hint - 25;
  const count = hint < 0 ? n : 51;
  let best = null;
  for (let c = 0; c < count; c++) {
    const i = (((from + c) % n) + n) % n;
    const dx = tdDirX[i], dy = tdDirY[i];
    const px = x - tdPts[i].x, py = y - tdPts[i].y;
    const t = limit(px * dx + py * dy, 0, SEGMENT_LENGTH);
    const cx = px - dx * t, cy = py - dy * t;
    const d2 = cx * cx + cy * cy;
    if (!best || d2 < best.d2) best = { i, t, d2, lateral: -cx * dy + cy * dx };
  }
  return { index: best.i, s: best.i * SEGMENT_LENGTH + best.t, lateral: best.lateral };
}

// Roadside objects use offsets in road half-widths (1 = road edge), set in scenery.js. They are pushed
// out here to keep a sensible gap between the kerb and the trees, stands and buildings.
function tdSpriteLateral(x) {
  return Math.sign(x) * TD_HALF * (1.2 + (Math.abs(x) - 1) * 1.5);
}

// Put the car on the track `progress` units from the start of the session's grid, `lateral` across (playerX units).
function tdReset(progress, lateral) {
  const s = wrap(gridZ + progress, trackLength);
  const p = tdPointAt(s, lateral * TD_HALF);
  tdX = p.x; tdY = p.y; tdHeading = p.h;
  tdVx = 0; tdVy = 0;
  tdS = s;
  tdIndex = p.i;
  tdCamX = tdX; tdCamY = tdY;
  tdZoom = TD_ZOOM;
  tdLastBeep = 0;
  tdInLane = false;
  tdPitCommit = false;
  effectsReset();
}

// ---- Driving ----
function tdShiftSideways(amount) {   // move the car across the road by `amount` world units
  tdX += -tdDirY[tdIndex] * amount;
  tdY += tdDirX[tdIndex] * amount;
}

function updateTopDown(dt) {
  const cond = tyreCondition();
  updateRain(dt);
  updateWeather(dt);
  if (radioT > 0) radioT -= dt;
  if (raceState === 'trophy') trophyT += dt;

  if (raceState === 'countdown') {
    countdownT -= dt;
    if (countdownT <= 0) { raceState = 'racing'; goFlashT = 1; soundGo(); launchAtGo(); }
    else if (Math.ceil(countdownT) !== tdLastBeep) { tdLastBeep = Math.ceil(countdownT); soundCountdown(); }
  }
  if (goFlashT > 0) goFlashT -= dt;
  if (launchMsgT > 0) launchMsgT -= dt;

  // On the grid the gas revs the engine but the car is held. Note when it went down, to judge the start.
  if (raceState === 'countdown') {
    const gas = rawGas();
    if (gas && launchGasAt === null) launchGasAt = countdownT;
    if (!gas) launchGasAt = null;
    launchRev += ((gas ? 0.2 : 0) - launchRev) * Math.min(1, dt * 6);
  } else {
    launchRev += (0 - launchRev) * Math.min(1, dt * 10);
  }
  if (launchWait && raceState === 'racing') launchWatch(dt);
  launchSpin = Math.max(0, launchSpin - dt / LAUNCH_SPIN_TIME);   // wheelspin fades away
  if (raceState === 'racing' || raceState === 'pit') { raceTime += dt; lapTime += dt; }

  const speedPercent = speed / MAX_SPEED;

  // Steering turns the car (it cannot turn while stopped). Grip sharpens the turn.
  const steerDir = keyLeft() ? -1 : keyRight() ? 1 : 0;
  const turnRate = (3.2 - 1.2 * speedPercent) * Math.min(1, speed / (MAX_SPEED * 0.12)) * limit(0.55 + 0.45 * cond.grip, 0.6, 1.1);
  tdHeading += steerDir * turnRate * dt;
  if (tdPitCommit && difficulty().laneAssist && !steerDir && raceState === 'racing') {
    // Lane assist: steer along the fast lane, and out of the exit road, unless the player is steering.
    const look = tdS + 800;   // a short look-ahead, so the car is in the fast lane before the pit wall starts
    const ahead = tdPointAt(look, pitFastX(wrap(look, trackLength)) * TD_HALF);
    const diff = angleDiff(Math.atan2(ahead.y - tdY, ahead.x - tdX), tdHeading);
    tdHeading += limit(diff * 5 * dt, -turnRate * dt, turnRate * dt);
  }

  if (keyGas()) speed += ACCEL * cond.grip * (1 - LAUNCH_SPIN_LOSS * launchSpin) * dt;   // wheelspin: less drive
  else if (keyBrake()) speed += BRAKING * (tdPitCommit && difficulty().limiter ? 0.4 : 1) * dt;   // gentler brakes in the pit lane, so stopping on the mark is doable
  else speed += DECEL * dt;
  if (steerDir !== 0) speed -= speed * 0.2 * speedPercent * dt;   // a little scrub in corners
  if ((playerX < -1 || playerX > 1) && speed > OFFROAD_LIMIT) speed += OFFROAD_DECEL * dt;
  speed = limit(speed, 0, MAX_SPEED * cond.speed);

  // The car's velocity chases its heading. Slippery tyres chase slowly, so the car slides on.
  const follow = Math.min(1, dt * 14 * (1 - 0.85 * cond.slip));
  tdVx += (Math.cos(tdHeading) * speed - tdVx) * follow;
  tdVy += (Math.sin(tdHeading) * speed - tdVy) * follow;
  tdX += tdVx * dt;
  tdY += tdVy * dt;

  if (raceState === 'pit') {
    // Glide over into the box and line up with the road.
    const lateral = tdLocate(tdX, tdY, tdIndex).lateral;
    tdShiftSideways((pitBoxX(tdS) * TD_HALF - lateral) * Math.min(1, dt * 2));
    tdHeading += angleDiff(Math.atan2(tdDirY[tdIndex], tdDirX[tdIndex]), tdHeading) * Math.min(1, dt * 3);
    updatePit(dt);
  }

  // Work out where that puts the car on the track.
  const loc = tdLocate(tdX, tdY, tdIndex);
  tdIndex = loc.index;
  let ds = loc.s - tdS;
  if (ds > trackLength / 2) ds -= trackLength;
  else if (ds < -trackLength / 2) ds += trackLength;
  tdS = loc.s;
  playerProgress += ds;
  playerX = loc.lateral / TD_HALF;

  // The pit lane: an 80 km/h limit (no penalty), and braking to a stop near your box starts the stop.
  tdInLane = inPitLane(tdS, playerX);
  // Driving onto the entry road (out past the edge of the track) switches on the pit limiter and the lane assist.
  const onEntryRoad = pitWeight(tdS) > 0.12 && playerX > 1.08 && playerX < pitCentreX(tdS) + pitHalfWidthX(tdS) + 0.2;
  if (!tdPitCommit && onEntryRoad && raceState === 'racing' && session === 'race') {
    tdPitCommit = true;
    radio('Box, box! ' + (difficulty().limiter ? 'Limiter on. ' : 'Mind the 80. ') + COMPOUNDS[pitTyreChoice].name + ' tyres ready.');
    soundLimiter();
  }
  if (tdPitCommit && (tdS > PIT_OUT_S || playerX < 0.8 || session !== 'race')) tdPitCommit = false;
  if (tdPitCommit && difficulty().limiter && speed > PIT_LIMIT) speed += (PIT_LIMIT - speed) * Math.min(1, dt * 14);   // the limiter: down to 80 km/h almost at once
  else if (!difficulty().limiter && tdInLane && speed > PIT_LIMIT) speed = Math.max(PIT_LIMIT, speed + BRAKING * 0.5 * dt);   // no limiter: the car only slows gently once it is in the lane
  if (!tdInLane) pitLatch = false;
  if (raceState === 'racing' && session === 'race' && tdInLane && !pitLatch) {
    if (Math.abs(tdS - playerBoxS()) < PIT_REACH && speed < MAX_SPEED * 0.04) { pitLatch = true; startPitStop(); }
  }

  // Count a lap when progress passes the line (the same thresholds the AI cars use).
  if (raceState === 'racing') {
    const crossed = playerProgress < lineProgress ? 0 : Math.floor((playerProgress - lineProgress) / trackLength) + 1;
    while (raceState === 'racing' && crossings < crossed) crossLine();
  }

  // Walls: the edge of the world, plus solid roadside objects. The car is eased against the face it
  // hit, with a big hit on first contact and then a scrape; with the gas held it keeps a crawl so it
  // can always drive away.
  const before = playerX;
  let touching = false;
  const wall = tdS <= PIT_OUT_S + 400 ? TD_WALL_PIT : TD_WALL;
  if (Math.abs(playerX) > wall) {
    touching = true;
    playerX += (limit(playerX, -wall, wall) - playerX) * Math.min(1, dt * 12);
  }
  for (const sp of segments[tdIndex].sprites) {
    const reach = TD_HIT[sp.type];
    if (!reach) continue;
    const at = tdSpriteLateral(sp.x) / TD_HALF, r = reach / TD_HALF;
    if (Math.abs(playerX - at) < r) {
      touching = true;
      playerX += (at + (playerX < at ? -r : r) - playerX) * Math.min(1, dt * 12);
    }
  }
  if (touching) {
    if (wallContact) speed = Math.max(speed - MAX_SPEED * 0.3 * dt, keyGas() ? MAX_SPEED * 0.12 : 0);
    else { speed *= 0.5; soundWall(); }
  }
  wallContact = touching;
  tdShiftSideways((playerX - before) * TD_HALF);

  // Tyre wear: faster driving, sharper corners and driving on the grass use the tyres up quicker.
  if (raceState === 'racing') {
    const cornering = 1 + 0.5 * Math.min(1, Math.abs(segments[tdIndex].curve) / 5);
    const overheating = 1 + tyre.dryWearBoost * (1 - weather.wet);
    const grass = Math.abs(playerX) > 1 ? TD_GRASS_WEAR : 1;
    tyreWear = Math.min(1, tyreWear + (dt / tyre.life) * (0.4 + 0.6 * speedPercent) * cornering * overheating * grass);
  }

  radioHints();
  musicUpdate(raceState === 'mode' || raceState === 'track');   // title music on the menus
  updateAI(dt);
  const beforeBump = playerX;
  handleCollisions(dt);
  tdShiftSideways((playerX - beforeBump) * TD_HALF);

  updateEffects(dt, !!keyBrake());
  soundUpdate({
    speedPct: Math.max(speed / MAX_SPEED, launchRev, launchSpin * 0.2),   // revs count as speed for the engine note
    gas: !!keyGas(),
    engineOn: raceState === 'countdown' || raceState === 'racing' || raceState === 'pit',
    slip: tdSlip,
    offroad: Math.abs(playerX) > 1,
    wet: raceState === 'racing' || raceState === 'pit' ? weather.wet : 0,   // rain is only heard out on the track, not on the menus
  });

  const zoomTarget = TD_ZOOM + (TD_ZOOM_FAR - TD_ZOOM) * Math.min(1, speed / MAX_SPEED);
  tdZoom += (zoomTarget - tdZoom) * Math.min(1, dt * 2.5);

  const tx = tdX + tdVx * TD_CAMERA_LEAD, ty = tdY + tdVy * TD_CAMERA_LEAD;
  tdCamX += (tx - tdCamX) * Math.min(1, dt * 6);
  tdCamY += (ty - tdCamY) * Math.min(1, dt * 6);
}

// ---- Pixel-art car, seen from above (nose up) ----
// Same idea as the rear-view car in sprites.js: left half only, mirrored, run-length coded, 12x25 pixels.
// It uses the same letters and carPalette(), so the same liveries work.
const TOP_CAR_LEFT = [
  'E1W5', 'E1a4W1', '.4B2', '.4B2', '.3B3',
  'T2.1B3', 'T2s1B3', 'c2.1B3', 'T2.1B3',
  '.3B1V2', '.3B1H2',
  '.2P2B1K1', '.2P2B1K1', '.2P2B1K1', '.2P2B1K1',
  'T3P1B1K1', 'T3P1B2', 'c3P1B2', 'T3P1B2', 'T3.1B2', 'T3.1B2', 'T3.1B2', 'T3.2B1',
  'E1a5', 'E1W4R1',
];
const TOP_CAR_ART = TOP_CAR_LEFT.map((rle, y) => {
  const left = rle.replace(/(.)(\d+)/g, (m, ch, n) => ch.repeat(Number(n)));
  if (left.length !== 6) throw new Error('overhead car art row ' + y + ' is ' + left.length + ' pixels wide, expected 6: ' + rle);
  return left + [...left].reverse().map(ch => (ch === 'h' ? 'b' : ch)).join('');
});
const topCarCache = {};

function topCarFrame(livery) {
  const key = [livery.body, livery.pod, livery.accent, livery.wing, livery.end, livery.helmet, livery.tyre].join('|');
  if (topCarCache[key]) return topCarCache[key];
  const pal = carPalette(livery);
  const cv = document.createElement('canvas');
  cv.width = TOP_CAR_ART[0].length;
  cv.height = TOP_CAR_ART.length;
  const g = cv.getContext('2d');
  TOP_CAR_ART.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      if (!pal[ch]) throw new Error('overhead car art uses "' + ch + '" (row ' + y + ') but the palette has no colour for it');
      g.fillStyle = pal[ch];
      g.fillRect(x, y, 1, 1);
    });
  });
  topCarCache[key] = cv;
  return cv;
}

// Called inside the world transform. One art pixel is one screen pixel, so the car keeps the same size at any zoom.
function drawTopCar(x, y, heading, livery) {
  const frame = topCarFrame(livery);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(100, 120, 330, 650, heading + Math.PI / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(heading + Math.PI / 2);   // the art has its nose up
  ctx.scale(1 / tdZoom, 1 / tdZoom);   // cars keep their pixel size at any zoom
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(frame, -frame.width / 2, -frame.height / 2);
  ctx.restore();
}

// ---- Drawing the map ----
function drawTopGround() {
  const tile = 3200;
  const halfW = LW / 2 / tdZoom + tile, halfH = LH / 2 / tdZoom + tile;
  ctx.fillStyle = mixColor('#0F9E10', '#0D6A12', weather.wet);
  const ix0 = Math.floor((tdCamX - halfW) / tile), ix1 = Math.floor((tdCamX + halfW) / tile);
  const iy0 = Math.floor((tdCamY - halfH) / tile), iy1 = Math.floor((tdCamY + halfH) / tile);
  for (let ix = ix0; ix <= ix1; ix++) {
    for (let iy = iy0; iy <= iy1; iy++) {
      if ((ix + iy) % 2 === 0) ctx.fillRect(ix * tile, iy * tile, tile, tile);
    }
  }
}

function drawTopRoad() {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(tdPts[0].x, tdPts[0].y);
  for (let i = 1; i < tdPts.length; i++) ctx.lineTo(tdPts[i].x, tdPts[i].y);
  ctx.closePath();

  const dash = trackLength / (2 * Math.round(trackLength / (6 * SEGMENT_LENGTH)));   // whole dashes round the lap
  ctx.setLineDash([]);
  ctx.strokeStyle = '#D01010';
  ctx.lineWidth = 2 * TD_HALF * 1.16;
  ctx.stroke();
  ctx.setLineDash([dash, dash]);
  ctx.strokeStyle = '#EEEEEE';
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = mixColor('#5E5E62', '#3E4046', weather.wet);
  ctx.lineWidth = 2 * TD_HALF;
  ctx.stroke();
  ctx.setLineDash([2.5 * SEGMENT_LENGTH, 3.5 * SEGMENT_LENGTH]);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 45;
  ctx.stroke();
  ctx.setLineDash([]);

  // the tunnel: a darker, roofed stretch of road between grey walls
  for (let i = 0; i < segments.length; i++) {
    if (!segments[i].tunnel) continue;
    let j = i;
    while (j + 1 < segments.length && segments[j + 1].tunnel) j++;
    ctx.beginPath();
    for (let k = i; k <= j + 1; k++) (k === i ? ctx.moveTo(tdPts[k].x, tdPts[k].y) : ctx.lineTo(tdPts[k].x, tdPts[k].y));
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#2A2A30';
    ctx.lineWidth = 2 * TD_HALF * 1.3;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(10,10,16,0.82)';
    ctx.lineWidth = 2 * TD_HALF * 1.02;
    ctx.stroke();
    i = j;
  }

  // chequered start/finish line
  ctx.save();
  ctx.translate(tdPts[LINE_SEG].x, tdPts[LINE_SEG].y);
  ctx.rotate(Math.atan2(tdDirY[LINE_SEG], tdDirX[LINE_SEG]));
  const squares = 12, size = 2 * TD_HALF / squares;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < squares; col++) {
      ctx.fillStyle = (row + col) % 2 ? '#111111' : '#FFFFFF';
      ctx.fillRect(row * size - size, -TD_HALF + col * size, size, size);
    }
  }
  ctx.restore();
}

// ---- Keeping scenery off the track ----
// Scenery is placed beside the stretch of road it belongs to, but the lap passes close to itself in
// places, so an object beside one stretch could end up on another. clearSceneryFromTrack() removes any
// object whose footprint comes within the kerb of ANY part of the track. The gantry is kept: it is
// meant to span the road.
const TD_CLEARANCE = TD_HALF * 1.16 + 100;   // kerb edge plus a little room, in world units
const TD_PIT_CLEARANCE = TD_HALF * 0.6 + 100;   // half the pit road plus a little room
const TD_GUARD_EXEMPT = new Set(['gantry', 'pitwall', 'pitsign', 'barrier']);   // these are meant to be on or beside the road (street walls too)
let tdPitPoints = null;

function tdDistanceToPitRoad(x, y) {
  if (!tdPitPoints) {
    tdPitPoints = [];
    for (let s = PIT_IN_S; s <= PIT_OUT_S; s += 100) tdPitPoints.push(tdPointAt(s, pitCentreX(s) * TD_HALF));
  }
  let best = Infinity;
  for (const p of tdPitPoints) best = Math.min(best, Math.hypot(x - p.x, y - p.y));
  return best;
}

function tdDistanceToTrack(x, y) {
  let best = Infinity;
  for (let i = 0; i < segments.length; i++) {
    const dx = tdDirX[i], dy = tdDirY[i];
    const px = x - tdPts[i].x, py = y - tdPts[i].y;
    const t = limit(px * dx + py * dy, 0, SEGMENT_LENGTH);
    best = Math.min(best, Math.hypot(px - dx * t, py - dy * t));
  }
  return best;
}

// Points round an object's footprint (corners, edge middles and centre) in world coordinates.
function tdFootprint(sp, i) {
  const art = sceneryArt(sp);
  const unit = 1 / TD_ZOOM_FAR;   // sprites cover the most world when zoomed right out, so check for that
  const lateral = tdSpriteLateral(sp.x);
  const cx = tdPts[i].x - tdDirY[i] * lateral, cy = tdPts[i].y + tdDirX[i] * lateral;
  if (!art.rotate) {   // round objects: the centre and eight points on a circle
    const r = Math.max(art.canvas.width, art.canvas.height) / 2 * unit;
    const round = [{ x: cx, y: cy }];
    for (let k = 0; k < 8; k++) round.push({ x: cx + Math.cos(k * Math.PI / 4) * r, y: cy + Math.sin(k * Math.PI / 4) * r });
    return round;
  }
  const c = tdDirX[i], s = tdDirY[i];   // objects that follow the track are rotated with it
  const hw = art.canvas.width / 2 * unit, hh = art.canvas.height / 2 * unit;
  const points = [];
  for (const u of [-1, 0, 1]) {
    for (const v of [-1, 0, 1]) {
      const lx = u * hw, ly = v * hh;
      points.push({ x: cx + lx * c - ly * s, y: cy + lx * s + ly * c });
    }
  }
  return points;
}

function clearSceneryFromTrack() {
  const removed = {};
  for (let i = 0; i < segments.length; i++) {
    segments[i].sprites = segments[i].sprites.filter((sp) => {
      if (TD_GUARD_EXEMPT.has(sp.type)) return true;
      const onTrack = tdFootprint(sp, i).some(p => tdDistanceToTrack(p.x, p.y) < TD_CLEARANCE || tdDistanceToPitRoad(p.x, p.y) < TD_PIT_CLEARANCE);
      if (onTrack) removed[sp.type] = (removed[sp.type] || 0) + 1;
      return !onTrack;
    });
  }
  const total = Object.values(removed).reduce((a, b) => a + b, 0);
  if (total > 0) console.warn('scenery guard removed ' + total + ' objects that overlapped the track: ' + JSON.stringify(removed));
}

// The painted grid: six boxes in two staggered columns just behind the line.
function drawTopGrid() {
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 50;
  ctx.lineJoin = 'miter';
  for (let k = 0; k <= AI_TEAMS.length; k++) {
    const slot = gridSlot(k);
    const p = tdPointAt(LINE_S - GRID_GAP + slot.progress, slot.x * TD_HALF);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.h);
    ctx.strokeRect(-420, -230, 840, 460);
    ctx.restore();
  }
}

// Roadside objects from scenery.js seen from above, drawn from the pixel art in scenery-art.js.
function drawTopScenery() {
  const range = Math.hypot(LW, LH) / 2 / tdZoom + 3500;
  const unit = 1 / tdZoom;   // world units in one art pixel, so art pixels stay screen pixels
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.sprites.length === 0) continue;
    if (Math.abs(tdPts[i].x - tdCamX) > range || Math.abs(tdPts[i].y - tdCamY) > range) continue;
    const angle = Math.atan2(tdDirY[i], tdDirX[i]);
    for (const sp of seg.sprites) {
      const art = sceneryArt(sp);
      const lateral = tdSpriteLateral(sp.x);
      ctx.save();
      ctx.translate(tdPts[i].x - tdDirY[i] * lateral, tdPts[i].y + tdDirX[i] * lateral);
      if (art.shadow) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(art.shadow.dx * unit, art.shadow.dy * unit, art.shadow.rx * unit, art.shadow.ry * unit, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (art.rotate) ctx.rotate(angle);
      ctx.scale(unit, unit);
      ctx.drawImage(art.canvas, -art.canvas.width / 2, -art.canvas.height / 2);
      ctx.restore();
    }
  }
}

function tdLivery(ai) {
  const t = ai.team;
  return { body: t.body, pod: t.pod, accent: t.end, wing: t.wing, end: t.end, helmet: t.helmet, tyre: COMPOUNDS[ai.tyreKey].color };
}

function renderTopDown() {
  ctx.save();
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = mixColor('#12B013', '#0E7415', weather.wet);
  ctx.fillRect(0, 0, LW, LH);

  ctx.save();
  ctx.translate(LW / 2 - tdCamX * tdZoom, LH / 2 - tdCamY * tdZoom);
  ctx.scale(tdZoom, tdZoom);
  drawTopGround();
  drawTopRoad();
  drawTopPitLane();
  drawTopGrid();
  drawTopSkids();
  drawTopScenery();
  if (session === 'race') {   // the AI cars are not on the track in qualifying
    for (const ai of ais) {
      const p = tdPointAt(ai.z, ai.x * TD_HALF);
      drawTopCar(p.x, p.y, p.h, tdLivery(ai));
    }
  }
  const mine = playerLivery();
  if (pitTyresSwapped()) mine.tyre = COMPOUNDS[pitTyreKey].color;   // the new tyres go on part way through the stop
  drawTopCar(tdX, tdY, tdHeading, mine);
  drawTopCrew();
  drawTopParticles();
  ctx.restore();

  if (weather.wet > 0) {   // damp, dull light
    ctx.fillStyle = 'rgba(25,35,45,' + (0.22 * weather.wet) + ')';
    ctx.fillRect(0, 0, LW, LH);
  }
  if (currentTrack.style.night) drawNightLayer();   // dark with floodlit road, lamps and headlights
  ctx.restore();

  // The wheel-timing minigame (PIT_MINIGAME) puts the crew round a rear-view close-up of the car.
  if (PIT_MINIGAME && raceState === 'pit' && pitStage !== 'braking') {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    drawCar();
  }
  drawRain();
  drawHud();
}
