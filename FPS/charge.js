// THE DEMOLITION CHARGE: the other way to take out the objective (the core,
// or the lab's breeding chamber: core.js), without spending your ammo on it.
//
// It's a pickup somewhere in the level (a level's pickups, type 'charge').
// Carrying it, stand at the objective, within CHARGE_REACH of one of its
// wall cells, and keep standing there: after CHARGE_SET_TIME seconds it's
// SET, stuck to the wall. Step away before then and you start again; being
// hit doesn't stop you. Setting it is silent, which matters in the lab,
// where shooting the chamber 18 times wakes everything (creatures.js).
//
// Once it's set, the FUSE runs CHARGE_FUSE seconds, beeping faster and
// faster, and nothing stops it. Then it goes off: the objective goes down
// in one, and the blast is the biggest in the game (CHARGE_BLAST, through
// explodeAt: it hurts robots, sets off drums, and every creature hears it).
// Get clear: within CHARGE_LETHAL of it, with nothing in between, it kills
// you outright, armour or not.

const CHARGE_REACH = 1.0;        // cells from the objective's face: as for the lift (core.js)
const CHARGE_SET_TIME = 2;       // seconds you stand there to set it
const CHARGE_FUSE = 5;           // seconds from set to bang
const CHARGE_BLAST = { radius: 3.5, damage: 90 };
const CHARGE_LETHAL = 1.5;       // cells: this close, it kills you outright
const CHARGE_BEEP_SLOW = 1.0;    // seconds between beeps as the fuse starts...
const CHARGE_BEEP_FAST = 0.1;    // ...and as it ends
const CHARGE_ON_WALL = 0.56;     // where it sits: this far from the cell's centre, just off its face (0.5)

// The charge, once you've got it:
//   state     'carried' (or not yet found: player.charge says which),
//             'set' (on the wall, fuse burning) or 'gone' (it's gone off)
//   setting   seconds you've stood at the objective so far
//   fuse      seconds left
//   beep      seconds to the next beep
//   x, y      where it's stuck
const charge = { state: 'carried', setting: 0, fuse: 0, beep: 0, x: 0, y: 0 };

// The objective's cell you're close enough to set the charge on, or null.
function chargeSpot() {
  let best = null, bestDist = CHARGE_REACH;
  for (const c of core.cells) {
    const d = Math.hypot(player.x - c.front.x, player.y - c.front.y);
    if (d < bestDist) { best = c; bestDist = d; }
  }
  return best;
}

function updateCharge(dt) {
  if (charge.state === 'carried') {
    const spot = player.charge && core.state === 'online' ? chargeSpot() : null;
    if (!spot) { charge.setting = 0; return; } // walked away: start again
    charge.setting += dt;
    if (charge.setting < CHARGE_SET_TIME) return;
    // Set: stuck to the wall, just off its face, on the side you're standing.
    const fx = spot.front.x - (spot.x + 0.5), fy = spot.front.y - (spot.y + 0.5); // towards you
    const len = Math.hypot(fx, fy);
    charge.x = spot.x + 0.5 + fx / len * CHARGE_ON_WALL;
    charge.y = spot.y + 0.5 + fy / len * CHARGE_ON_WALL;
    charge.state = 'set';
    charge.fuse = CHARGE_FUSE;
    charge.beep = CHARGE_BEEP_SLOW;
    player.charge = false;
    sfxChargeSet(charge.x, charge.y); // sound.js
    showSecurityMessage('CHARGE SET  GET CLEAR');
    return;
  }

  if (charge.state !== 'set') return;
  charge.fuse -= dt;
  charge.beep -= dt;
  if (charge.beep <= 0) {
    sfxChargeBeep(charge.x, charge.y);
    // The gap shrinks in a straight line as the fuse burns down.
    charge.beep = CHARGE_BEEP_FAST + (CHARGE_BEEP_SLOW - CHARGE_BEEP_FAST) * Math.max(0, charge.fuse) / CHARGE_FUSE;
  }
  if (charge.fuse > 0) return;

  charge.state = 'gone';
  if (core.state === 'online') destroyCore(); // core.js: it goes down in one (unless you'd already shot it out)
  explodeAt(charge.x, charge.y, CHARGE_BLAST); // explosions.js
  const d = Math.hypot(player.x - charge.x, player.y - charge.y);
  if (d < CHARGE_LETHAL && clearLine(charge.x, charge.y, player.x, player.y)) killPlayer(); // combat.js
}

// The charge on the wall, its lamp blinking (sprites.js). Shots pass through it.
function chargeThings(thing) {
  if (charge.state !== 'set') return [];
  const lit = Math.floor(animTime * 8) % 2 === 0;
  return [thing(charge.x, charge.y, lit ? CHARGE_SET_TEXTURES.lit : CHARGE_SET_TEXTURES.unlit, { effect: true })];
}

// The visor's readouts (hud.js): how far along setting it you are, then the countdown.
function drawChargeReadout(pixels) {
  if (charge.state === 'carried' && charge.setting > 0) {
    drawTextCentred(pixels, 'SETTING CHARGE', 36, HUD_GREEN, 1);
    const w = 60, x = (SCREEN_W - w) >> 1;
    fillRect(pixels, x, 44, w, 4, [0, 40, 16]);
    fillRect(pixels, x, 44, Math.round(w * Math.min(1, charge.setting / CHARGE_SET_TIME)), 4, HUD_GREEN);
  } else if (charge.state === 'set') {
    drawTextCentred(pixels, 'DETONATION ' + Math.ceil(charge.fuse), 36, HUD_WARN, 1);
  }
}
