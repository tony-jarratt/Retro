// SECURITY: cameras, tripwires, terminals and alarms. Everything belongs to a
// ZONE, a rectangle of cells listed in the level file (levels/*.js), and that's what links them up:
//
//   cameras    sweep back and forth. One that sees you raises its zone's
//              alarm, and every walking robot in the zone comes for you,
//              by path. Shoot one (one hit) to kill it, ideally before it spots you.
//   tripwires  laser beams across narrow passages. Break one and the turrets
//              in its zone wake up (enemies.js) — quietly: no alarm, no red
//              lights, nobody else told. Step over? There's no jumping.
//   terminals  wall panels. Walk up to one and its zone's CAMERAS shut down for
//              good. Tripwires and turrets stay live: they're wired to the
//              security core (core.js), and only destroying it stops them.
//   alarms     while a zone's alarm is going (ALARM_TIME), its strip lights
//              pulse red (lighting.js) and the HUD says so.

const CAMERA_RANGE = 7;                    // cells
const CAMERA_CONE = 50 * Math.PI / 180;    // how wide a camera sees, in total
const CAMERA_SWEEP = 0.8;                  // radians either side of its set direction
const CAMERA_SWEEP_SPEED = 0.6;            // how fast it pans (radians of phase per second)
const ALARM_TIME = 12;                     // seconds an alarm keeps going after the last trigger
const TERMINAL_RANGE = 1.3;                // cells from a terminal's middle: standing right in front of it
const SECURITY_MESSAGE_TIME = 2.5;         // seconds the HUD shows "CAMERAS OFFLINE" etc.
const CAMERA_SPOT = { colour: [0.9, 0.08, 0.05], radius: 1.6 }; // the red patch a camera throws where it's looking

function zoneById(id) {
  return ZONES.find((z) => z.id === id);
}

function inZone(zone, x, y) {
  return x >= zone.x && x < zone.x + zone.w && y >= zone.y && y < zone.y + zone.h;
}

// Every sensor and terminal must name a real zone; check as they're built.
function checkZone(what, n, id) {
  if (!zoneById(id)) throw new Error(`${what}[${n}] names zone "${id}", which is not in ZONES.`);
  return id;
}

// The live security objects, copied from map.js so the map data never changes.
//   cameras:   state 'watching', 'offline' or 'destroyed'; angle sweeps about `base`
//   tripwires: state 'armed' or 'offline'; a beam along y + 0.5 from x0 to x1 + 1
//   terminals: state 'armed' or 'safe'; x, y is its WALL cell (TERMINAL_CELL in MAP)
const cameras = CAMERAS.map((c, n) => {
  if (MAP[Math.floor(c.y)]?.[Math.floor(c.x)] !== 0) throw new Error(`CAMERAS[${n}] at (${c.x}, ${c.y}) is not on a floor cell.`);
  return { x: c.x, y: c.y, base: c.angle, angle: c.angle, zone: checkZone('CAMERAS', n, c.zone), state: 'watching', phase: n * 1.7 };
});

const tripwires = TRIPWIRES.map((t, n) => {
  // A beam runs between two walls, across floor cells x0..x1 on row y.
  const solid = (x) => { const c = MAP[t.y]?.[x]; return c !== undefined && c !== 0 && c !== DOOR_CELL; };
  let floor = true;
  for (let x = t.x0; x <= t.x1; x++) if (MAP[t.y]?.[x] !== 0) floor = false;
  if (!solid(t.x0 - 1) || !solid(t.x1 + 1) || !floor) {
    throw new Error(`TRIPWIRES[${n}] on row ${t.y} must cross floor cells ${t.x0}..${t.x1} with a wall at each end.`);
  }
  return { x0: t.x0, x1: t.x1, y: t.y, zone: checkZone('TRIPWIRES', n, t.zone), state: 'armed' };
});

const terminals = TERMINALS.map((t, n) => {
  if (MAP[t.y]?.[t.x] !== TERMINAL_CELL) throw new Error(`TERMINALS[${n}] at cell (${t.x}, ${t.y}) is not a terminal (MAP value ${TERMINAL_CELL}).`);
  return { x: t.x, y: t.y, zone: checkZone('TERMINALS', n, t.zone), state: 'armed' };
});

const alarms = {};              // zone id -> seconds of alarm left
let securityMessage = null;     // e.g. 'CAMERAS OFFLINE', shown on the HUD for a moment
let securityMessageTime = 0;

function showSecurityMessage(text) {
  securityMessage = text;
  securityMessageTime = SECURITY_MESSAGE_TIME;
}

// Is (x, y) inside a zone whose alarm is going? (The lights there turn red.)
function zoneAlarmedAt(x, y) {
  if (creaturesLoose) return true; // creatures.js: the objective's burning, and every light goes red
  return ZONES.some((z) => alarms[z.id] > 0 && inZone(z, x, y));
}

// Something in a zone has spotted you (a camera, or a smart robot): the
// alarm goes off, the red lights pulse, every walking robot in the zone comes
// for you, and its drones wake (drones.js).
function raiseAlarm(zoneId) {
  if (!(alarms[zoneId] > 0)) showSecurityMessage('ALARM');
  alarms[zoneId] = ALARM_TIME;
  droneAlarm(zoneId); // drones.js: waiting packs wake, hives release
  const zone = zoneById(zoneId);
  for (const e of enemies) if (inZone(zone, e.x, e.y)) alertEnemy(e, player.x, player.y);
}

// A tripwire broken: the turrets in its zone wake up. That's all. No alarm,
// so the rest of the zone doesn't know you're there. The message only shows
// when a turret actually wakes, not every frame you stand in the beam.
function tripTurrets(zoneId) {
  const zone = zoneById(zoneId);
  let woke = false;
  for (const e of enemies) {
    if (e.type !== 'turret' || e.state !== 'dormant' || !inZone(zone, e.x, e.y)) continue;
    wakeTurret(e);
    woke = true;
  }
  if (woke) showSecurityMessage('TURRETS ONLINE');
}

// Does a camera see you right now? In its cone, in range, nothing in the way.
function cameraSeesPlayer(cam) {
  const dx = player.x - cam.x;
  const dy = player.y - cam.y;
  if (Math.hypot(dx, dy) > CAMERA_RANGE) return false;
  if (Math.abs(angleDiff(Math.atan2(dy, dx), cam.angle)) > CAMERA_CONE / 2) return false;
  return clearLine(cam.x, cam.y, player.x, player.y) && !steamBlocksSight(cam.x, cam.y, player.x, player.y);
}

// Is the player's collision box across a tripwire's beam?
function playerBreaksBeam(t) {
  const beamY = t.y + 0.5;
  return Math.abs(player.y - beamY) < PLAYER_RADIUS &&
         player.x + PLAYER_RADIUS > t.x0 && player.x - PLAYER_RADIUS < t.x1 + 1;
}

// Shut a zone down from its terminal.
// Shut a zone's cameras down from its terminal, and quieten its alarm (but
// not the facility-wide one after the core goes: that never stops).
function disableZone(zoneId) {
  for (const c of cameras) if (c.zone === zoneId && c.state === 'watching') c.state = 'offline';
  if (alarms[zoneId] !== Infinity) alarms[zoneId] = 0;
  showSecurityMessage('CAMERAS OFFLINE');
}

// Called from combat.js when a shot lands on a camera.
function shootCamera(cam) {
  cam.state = 'destroyed';
}

function updateSecurity(dt) {
  securityMessageTime = Math.max(0, securityMessageTime - dt);
  for (const id in alarms) alarms[id] = Math.max(0, alarms[id] - dt);

  for (const cam of cameras) {
    if (cam.state !== 'watching') continue;
    // Pan back and forth: a sine wave of the time, so it eases at each end.
    cam.angle = cam.base + Math.sin(animTime * CAMERA_SWEEP_SPEED + cam.phase) * CAMERA_SWEEP;
    if (cameraSeesPlayer(cam)) raiseAlarm(cam.zone);
  }
  for (const t of tripwires) {
    if (t.state === 'armed' && playerBreaksBeam(t)) tripTurrets(t.zone);
  }
  for (const term of terminals) {
    if (term.state !== 'armed') continue;
    if (Math.hypot(player.x - (term.x + 0.5), player.y - (term.y + 0.5)) <= TERMINAL_RANGE) {
      term.state = 'safe';
      disableZone(term.zone);
    }
  }
}

// The terminal texture for the wall cell a ray hit.
function terminalTexture(cellX, cellY) {
  const term = terminals.find((t) => t.x === cellX && t.y === cellY);
  return TERMINAL_TEXTURES[term.state];
}

// Cameras and beams, as sprites for sprites.js. A beam is a row of short
// glowing dashes a quarter of a cell apart; from any angle they join up into
// a line. Beams are `effect`s: shots pass through them.
function securityThings(thing) {
  const list = cameras.map((c) => thing(c.x, c.y, CAMERA_TEXTURES[c.state], { camera: c }));
  for (const t of tripwires) {
    if (t.state !== 'armed') continue;
    for (let x = t.x0 + 0.125; x < t.x1 + 1; x += 0.25) list.push(thing(x, t.y + 0.5, BEAM_TEXTURE, { effect: true }));
  }
  return list;
}

// Lights for lighting.js: each watching camera throws a dim red patch on the
// floor where it's looking, so you can see its sweep coming.
function addSecurityLights(grid) {
  for (const c of cameras) {
    if (c.state !== 'watching') continue;
    const sx = c.x + Math.cos(c.angle) * 1.8;
    const sy = c.y + Math.sin(c.angle) * 1.8;
    // Skip it if the spot would land inside a wall or round a corner from the camera.
    if (MAP[Math.floor(sy)]?.[Math.floor(sx)] !== 0 || !clearLine(c.x, c.y, sx, sy)) continue;
    addLight(grid, sx, sy, CAMERA_SPOT.colour, CAMERA_SPOT.radius, 1);
  }
}
