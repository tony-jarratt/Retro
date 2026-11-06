// LOCKDOWN (owner, 2026-11-06): on the second level of each setting (the
// Hangar, Genetics, the Atrium), destroying the objective locks the floor
// down. A moment after it goes, BULKHEADS slam shut across the doors the
// level lists in `lockdown` (levels/*.js: { x, y }, door cells), for good.
// The way you came in is cut, the POWER fails with it (power.js: faint red
// emergency light until you throw a breaker), and you have to find another
// way back to the lift, through the rooms you skipped. The floor plans show the sealed doors in red (plans.js).
//
// A bulkhead is a door sealed forever (doors.js: `sealed` = Infinity, as the
// Manager's seals but never running out), with its own heavy look
// (textures.js) and its own slam (sound.js). One that's open when the
// lockdown comes shuts as soon as its doorway is clear.
//
// Checked at load: with every bulkhead shut, there must still be a way from
// the objective to the lift, or the level can't be finished.

const LOCKDOWN_DELAY = 2.5;   // seconds after the objective goes: its message first, then the slam
const LOCKDOWN_MESSAGE = 'LOCKDOWN  BULKHEADS SEALED';
const LOCKDOWN = CURRENT_LEVEL.lockdown || [];
let lockdownTimer = null;     // seconds until it comes, once the objective's gone; null before

const bulkheads = LOCKDOWN.map((b, n) => {
  const door = doorAt(b.x, b.y);
  if (!door) throw new Error(`lockdown[${n}] at cell (${b.x}, ${b.y}) is not a door.`);
  door.bulkhead = false; // true once it's come down
  door.slammed = false;  // its slam heard (it slams when it's fully shut)
  return door;
});
for (const d of DOORS) if (!bulkheads.includes(d)) { d.bulkhead = false; d.slammed = false; }

// The check: can you walk from the objective to the lift with the bulkheads
// shut? Floor and every other door count as open (you'll have its card by then).
(function checkLockdownRoute() {
  if (bulkheads.length === 0) return;
  const open = (x, y) => (MAP[y]?.[x] === 0 || MAP[y]?.[x] === DOOR_CELL) && !bulkheads.some((d) => d.x === x && d.y === y);
  const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const nextTo = (cell, x, y) => steps.some(([dx, dy]) => MAP[y + dy]?.[x + dx] === cell);
  const seen = new Set();
  const queue = [];
  MAP.forEach((row, y) => row.forEach((c, x) => { if (c === 0 && nextTo(CORE_CELL, x, y)) { queue.push([x, y]); seen.add(x + ',' + y); } }));
  if (queue.length === 0) throw new Error(`Level "${CURRENT_LEVEL.id}" has a lockdown but no objective (K cells) to start it from.`);
  while (queue.length > 0) {
    const [x, y] = queue.shift();
    if (nextTo(LIFT_CELL, x, y)) return; // the lift's reachable
    for (const [dx, dy] of steps) {
      const k = (x + dx) + ',' + (y + dy);
      if (!seen.has(k) && open(x + dx, y + dy)) { seen.add(k); queue.push([x + dx, y + dy]); }
    }
  }
  throw new Error(`Level "${CURRENT_LEVEL.id}": with its lockdown bulkheads shut (${LOCKDOWN.map((b) => `${b.x},${b.y}`).join(' ')}), there is no way from the objective to the lift.`);
})();

// The objective's gone (core.js): the lockdown is coming.
function startLockdown() {
  if (bulkheads.length > 0 && lockdownTimer === null) lockdownTimer = LOCKDOWN_DELAY;
}

// Each frame (main.js).
function updateLockdown(dt) {
  if (lockdownTimer !== null && lockdownTimer > 0) {
    lockdownTimer -= dt;
    if (lockdownTimer <= 0) {
      for (const d of bulkheads) { d.bulkhead = true; d.sealed = Infinity; } // doors.js: shut, for good
      showSecurityMessage(LOCKDOWN_MESSAGE); // security.js
      powerFail(); // power.js: and the power goes with them
    }
  }
  for (const d of bulkheads) {
    if (d.bulkhead && !d.slammed && d.open === 0) { d.slammed = true; sfxBulkheadSlam(d); } // sound.js
  }
}
