// BOOBY-TRAPPED TERMINALS: the HQ's proximity mines (owner, 2026-11-06).
//
// When the building fell, a security guard set off the company's
// DATA-SECURITY PROTOCOL before the virus took him: some desk terminals
// were armed to destroy themselves, and whatever is on them, rather than let
// anyone reach them. They're still armed.
//
// THE TELL: an ordinary desk's screen is green, lines of work scrolling
// down it. A trapped one is AMBER, a boxed, centred lock screen with a
// blinking cursor (textures.js: deskScreen). Across a dark office it's just
// a different glow among the green; look properly, and it's obvious.
//
// IT GOES OFF when YOU come within TRAP_RANGE of it with nothing in the
// way (nothing else sets it off: the infected walk past). Its screen
// flashes red and it shrieks, and TRAP_FUSE seconds later it blows: a
// drum's blast (explosions.js), which hurts whatever is near, sets off
// drums and other trapped desks, and burns the bodies. Back off fast and
// you live.
//
// OR USE IT. A round into its screen, or a blast reaching it, sets it off at
// once, from wherever you are: clear it safely, or wait for the suits to
// shuffle past it. The guards know which desks are trapped and won't hide
// behind one (guard.js).
//
// THE OBJECTIVE DONE (the lift key taken, the mother plant burnt: core.js)
// and the protocol is over: every trap still armed goes SAFE, its screen
// back to green.
//
// Which desks: TRAP_SHARE of a level's desks (at least one) are picked at
// random each time the level starts, never one within TRAP_START_CLEAR of
// where you start, so you can't learn where they are, only how to spot them.
// A desk prop's `trap`: null, or { state: 'armed' | 'alarm' | 'blown' |
// 'safe', time } (time: seconds of the alarm so far).

const TRAP_SHARE = 0.1;         // of the desks (owner: "about 10%")
const TRAP_RANGE = 1.5;         // cells: this close, it goes
const TRAP_FUSE = 0.8;          // seconds of alarm before it blows
const TRAP_START_CLEAR = 4;     // cells from your start: no trap this close
const TRAP_CURSOR_RATE = 1.5;   // blinks per second, armed
const TRAP_ALARM_RATE = 8;      // flashes per second, about to go
const TRAP_WARNING = 'TERMINAL SELF-DESTRUCT';

for (const p of props) p.trap = null;
(function armTraps() {
  if (THEME_NAME !== 'hq') return; // only head office's terminals were rigged
  const desks = props.filter((p) => p.type === 'desk');
  const choices = desks.filter((p) => Math.hypot(p.x - PLAYER_START.x, p.y - PLAYER_START.y) >= TRAP_START_CLEAR);
  const count = Math.min(choices.length, Math.max(1, Math.round(desks.length * TRAP_SHARE)));
  if (count === 0) {
    console.warn(`traps.js: ${desks.length} desks in this HQ level, none of them ${TRAP_START_CLEAR}+ cells from the start: no trapped terminal.`);
    return;
  }
  for (let n = 0; n < count; n++) {
    const pick = choices.splice(Math.floor(Math.random() * choices.length), 1)[0];
    pick.trap = { state: 'armed', time: 0 };
  }
})();

// Is this prop a trap that can still go off? (Shots, chains and the guards' choice of cover ask.)
function liveTrap(p) {
  return p.trap !== null && (p.trap.state === 'armed' || p.trap.state === 'alarm');
}

// It goes off: the alarm, then the blast.
function triggerTrap(p) {
  if (p.trap.state !== 'armed') return;
  p.trap.state = 'alarm';
  p.trap.time = 0;
  showSecurityMessage(TRAP_WARNING); // security.js
  sfxTrapAlarm(p);                   // sound.js
}

// Blown: by its fuse, a shot or a blast. The blast is a drum's.
function blowTrap(p) {
  p.trap.state = 'blown';
  explodeDrum(p); // explosions.js: it's 'exploded' now, a wreck, no longer solid
}

// The objective's done (core.js): the protocol stands down.
function disarmTraps() {
  for (const p of props) if (liveTrap(p) && p.trap.state === 'armed') p.trap.state = 'safe';
}

// Each frame (main.js).
function updateTraps(dt) {
  for (const p of props) {
    if (!liveTrap(p)) continue;
    if (p.trap.state === 'armed') {
      if (Math.hypot(player.x - p.x, player.y - p.y) < TRAP_RANGE && clearLine(p.x, p.y, player.x, player.y)) triggerTrap(p);
      continue;
    }
    p.trap.time += dt;
    if (p.trap.time >= TRAP_FUSE) blowTrap(p);
  }
}

// The picture of a desk (sprites.js): a trapped one's amber screen, or its
// red alarm; null for anything else (it looks as usual).
function trapTexture(p) {
  if (!liveTrap(p)) return null;
  const set = TRAP_DESK_TEXTURES[p.trap.state === 'alarm' ? 'alarm' : 'armed'];
  const rate = p.trap.state === 'alarm' ? TRAP_ALARM_RATE : TRAP_CURSOR_RATE;
  return set[Math.floor(animTime * rate * 2) % 2];
}
