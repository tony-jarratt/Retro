// POWER FAILURE (owner, 2026-11-06): the lights die, and you find your way
// by the emergency strips until you throw a BREAKER.
//
// It FAILS: the lights flicker and buzz for POWER_FAIL_TIME, a deep clunk,
// then every strip light drops to a faint, steady red (EMERGENCY_COLOUR),
// lamps go out, and the room falls almost dark (EMERGENCY_AMBIENT). What
// glows by itself still does: computer screens, terminals, the core, burning
// creatures, spores, your muzzle flash, the breaker's neon sign.
//
// When it fails:
//   - the LOCKDOWN (lockdown.js: the Hangar, Genetics, the Atrium): the
//     bulkheads come down and the power goes with them; the escape is in the dark
//   - a SCRIPTED CUT on Storage and the Offices (not the Workshops: the first
//     level keeps its lights): the first time you reach the level's
//     `powerCut` spot ({ x, y, radius })
// While it's off, the visor's NIGHT VISION is on (nightvision.js).
// A level that can lose its power must have a BREAKER (`breakers`: { x, y,
// face }, wall cells, like a decal): walk up to one and face it, and it's
// thrown. The lights stutter back on.

const POWER_FAIL_TIME = 2.0;      // seconds of flickering before they die
const POWER_RESTORE_TIME = 1.0;   // seconds of stuttering as they come back
const EMERGENCY_COLOUR = [0.42, 0.05, 0.03]; // a strip light on the emergency circuit: faint red
const EMERGENCY_AMBIENT = 0.3;    // the ambient light, as a share of the theme's, with the power off
const BREAKER_RANGE = 1.3;        // cells from the breaker's face
const BREAKER_FACING = 0.9;       // radians either side of looking at it

// The power: 'on', 'failing' (flickering, about to die), 'off', or
// 'restoring' (stuttering back); `time` in that state so far.
const power = { state: 'on', time: 0 };
let powerCutDone = false; // the level's scripted cut has happened

const POWER_CUT = CURRENT_LEVEL.powerCut || null;
const breakers = (CURRENT_LEVEL.breakers || []).map((b, n) => {
  const step = FACE_STEPS[b.face]; // decals.js
  if (!step) throw new Error(`breakers[${n}] at (${b.x}, ${b.y}) needs face N, S, E or W, not "${b.face}".`);
  if (!takesWallDecals(MAP[b.y]?.[b.x]) || MAP[b.y + step[1]]?.[b.x + step[0]] !== 0) {
    throw new Error(`breakers[${n}] at cell (${b.x}, ${b.y}) face ${b.face}: that must be a plain wall with floor on its ${b.face} side.`);
  }
  const decal = placeDecal('wall', b.x, b.y, b.face, 'breakerOn', 0);
  const wallX = b.x + 0.5 + step[0] * 0.5, wallY = b.y + 0.5 + step[1] * 0.5;
  return { wallX, wallY, glowX: wallX + step[0] * 0.3, glowY: wallY + step[1] * 0.3, decal };
});
if ((POWER_CUT || LOCKDOWN.length > 0) && breakers.length === 0) {
  throw new Error(`Level "${CURRENT_LEVEL.id}" can lose its power (a powerCut or a lockdown) but has no breaker to bring it back.`);
}

// The power goes (lockdown.js, or the scripted cut below).
function powerFail() {
  if (power.state !== 'on') return;
  power.state = 'failing';
  power.time = 0;
  sfxPowerFailing(); // sound.js: the buzz
}

function setBreakers(on) {
  for (const b of breakers) b.decal.tex = DECAL_TYPES[on ? 'breakerOn' : 'breakerOff'].frames[0];
}

// Each frame (main.js).
function updatePower(dt) {
  power.time += dt;
  if (POWER_CUT && !powerCutDone && Math.hypot(player.x - POWER_CUT.x, player.y - POWER_CUT.y) < POWER_CUT.radius) {
    powerCutDone = true;
    powerFail();
  }
  if (power.state === 'failing' && power.time >= POWER_FAIL_TIME) {
    power.state = 'off';
    power.time = 0;
    setBreakers(false);
    showSecurityMessage('POWER FAILURE'); // security.js
    sfxPowerDown(); // sound.js: the clunk
  } else if (power.state === 'restoring' && power.time >= POWER_RESTORE_TIME) {
    power.state = 'on';
    power.time = 0;
  } else if (power.state === 'off') {
    for (const b of breakers) {
      const dx = b.wallX - player.x, dy = b.wallY - player.y;
      if (Math.hypot(dx, dy) > BREAKER_RANGE || Math.abs(angleDiff(Math.atan2(dy, dx), player.angle)) > BREAKER_FACING) continue;
      power.state = 'restoring';
      power.time = 0;
      setBreakers(true);
      showSecurityMessage('POWER RESTORED');
      sfxBreaker(b.wallX, b.wallY); // sound.js
      break;
    }
  }
}

// The breaker's NEON sign (decals.js) lights the wall and floor round it in
// red while the power's not on: you can spot it down a dark corridor (lighting.js).
const BREAKER_GLOW = { colour: [1.3, 0.16, 0.1], radius: 3 };
function addBreakerLights(grid) {
  if (power.state === 'on') return;
  for (const b of breakers) addLight(grid, b.glowX, b.glowY, BREAKER_GLOW.colour, BREAKER_GLOW.radius, 1);
}

// How a static light shines this frame, given the power (lighting.js):
// null to leave it be, or { scale: [r, g, b] multipliers on its normal light }.
//   failing / restoring   flickering at full colour
//   off                   strip lights on the emergency circuit, everything else dark
function powerLightScale(light, n) {
  if (power.state === 'on' || light.kind === 'screen') return null; // screens have their own supply
  if (power.state === 'failing' || power.state === 'restoring') {
    const f = flickerLevel(n, animTime); // lighting.js
    return { scale: [f, f, f] };
  }
  if (light.kind === 'ceiling') return { scale: EMERGENCY_COLOUR.map((e, c) => e / light.colour[c]) };
  return { scale: [0, 0, 0] };
}

// The ambient light this frame (lighting.js).
function ambientLight() {
  return power.state === 'off' ? AMBIENT.map((a) => a * EMERGENCY_AMBIENT) : AMBIENT;
}
