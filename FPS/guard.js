// THE SECURITY GUARD: the HQ's gunman (owner, 2026-11-06).
//
// One of the infected (a creature: it hears, and needs light to spot you),
// but its training outlasted whatever the plant did to it. It's the one
// enemy in the building that fights the way you do.
//
//   IT CARRIES A TORCH. A beam of light out in front of it (addGuardLights),
//     sweeping slowly while it's on watch, held on you in a fight. The beam
//     is real light: you can see where it's looking round a corner before
//     it sees you, and if you stand in it, you're lit up, for the guard and
//     for every suit nearby. SHOOT THE TORCH (a round on its lens: TORCH_SPOTS,
//     guard-art.js) and the beam's gone: it has to find you by ear and by
//     what light there is, like any of them. Unhurt, but it knows you're there.
//   IT USES COVER. Once it's after you, it looks for a desk or a plant pot
//     with you on the other side and runs there ('cover'), and DUCKS
//     ('duck'). Ducked, only its head is up at the height your gun shoots:
//     hard to hit, not impossible. Every so often it STANDS UP ('aim'),
//     takes a moment to aim (type.charge), and fires a burst of GUARD_BURST
//     rounds, then ducks again. It moves to new cover when:
//       - you FLANK it: it stands up, sees you're no longer on the far side
//         of its cover, and runs (the run is when it's in the open);
//       - it's hit, or a blast goes off near it: flushed out;
//       - you come right up to it.
//     No cover in reach? It stands and shoots, and keeps looking for some.
//   IT RELOADS. GUARD_CLIP rounds, then GUARD_RELOAD seconds down behind its
//     cover changing the clip ('reload'): the clip dropping, the slide
//     racking. Count its shots.
//   IT RADIOS. When it comes after you, it calls it in: every other guard
//     on the floor comes to where you were (at most every GUARD_RADIO_GAP).
//   IT OPENS DOORS (it has the keys), and the Manager can tell it to wait in
//     ambush (manager.js), but not to come and grab you.
//   DEAD, it drops its ammo, and its torch lies where it fell, still lit,
//     shining across the floor the way it was pointing.
//
// Fields on a guard: rounds (left in its clip), cover ({ x, y, prop } it's
// using or running to), engaged (in a fight with you), timer (for the duck
// and the reload), burstLeft, shotTimer, unseen (seconds up without seeing
// you), flush (something says move), coverTry, radioTimer, torchBroken,
// torchAngle (the way the torch points). radioCalls counts its calls (sound.js).

const GUARD_SIGHT = 8;              // cells: how far it can see you (in full light, or once it's after you)
const GUARD_CLIP = 6;               // rounds per clip
const GUARD_BURST = 3;              // rounds each time it stands up
const GUARD_ROUND_GAP = 0.3;        // seconds between them
const GUARD_DUCK_MIN = 1.2, GUARD_DUCK_MAX = 2.0; // seconds ducked between bursts
const GUARD_RELOAD = 2.0;           // seconds to change the clip
const GUARD_LOST = 1.0;             // seconds stood up without seeing you: it leaves cover to look
const GUARD_TOO_CLOSE = 1.8;        // cells: you're on top of its cover; it moves
const GUARD_RADIO_GAP = 10;         // seconds between radio calls
const COVER_REACH = 6;              // cells from the guard: props it'll consider as cover
const COVER_MIN = 2.5;              // cells from you: no closer than this
const COVER_BEHIND = 0.8;           // cells behind the prop (from you) it crouches; enough to leave the prop's cell
const DESK_SIDESTEP = 0.25;         // cells to your right behind a desk: its head shows beside the monitor, not behind it
const COVER_HOLDS = 0.6;           // radians: the prop has to be within this of the line to you
const COVER_TRY_GAP = 0.5;          // seconds between looks for cover, while it hasn't got any
const COVER_TYPES = ['desk', 'plant', 'strut']; // what it hides behind (never a drum)
const BLAST_FLUSH = 1.5;            // cells beyond a blast's radius that still flush it out
const GUARD_STATES = ['chase', 'aim', 'cover', 'duck', 'reload'];
const TORCH_BEAM = { colour: [1.35, 1.25, 1.0], radius: 6.5, half: 0.32, level: 1.5 };
const TORCH_ON_FLOOR = { radius: 3.5, level: 0.9 }; // a dead guard's torch, lying there
const TORCH_SWEEP = 0.45, TORCH_SWEEP_SPEED = 0.7;  // on watch: radians either way, and how fast

for (const e of enemies) {
  e.radioCalls = 0;
  e.torchBroken = false;
  if (e.type !== 'guard') continue;
  if (THEME_NAME !== 'hq') throw new Error(`A guard is in a "${THEME_NAME}" level: it belongs to the HQ only.`);
  e.rounds = GUARD_CLIP;
  e.cover = null;
  e.engaged = false;
  e.timer = 0;
  e.burstLeft = 0;
  e.shotTimer = 0;
  e.unseen = 0;
  e.flush = false;
  e.coverTry = 0;
  e.radioTimer = 0;
  e.torchAngle = e.angle;
}

function aliveGuards() {
  return enemies.filter((e) => e.type === 'guard' && e.state !== 'dead');
}

// Somewhere to crouch: behind a desk or plant within COVER_REACH of it,
// with (tx, ty) (where it thinks you are) on the far side, and a clear shot
// from there at that spot (props don't block shots: you fire over them).
// The nearest such spot it can walk to; null if none. `avoid` is a prop it
// won't use (the one it's just been flushed from).
function coverSpot(g, tx, ty, avoid) {
  const reach = ENEMY_TYPES.guard.aimRange;
  let best = null, bestDist = Infinity;
  for (const p of props) {
    if (!COVER_TYPES.includes(p.type) || p === avoid) continue;
    if (Math.hypot(p.x - g.x, p.y - g.y) > COVER_REACH) continue;
    if (aliveGuards().some((o) => o !== g && o.cover && o.cover.prop === p)) continue; // another guard's
    const d = Math.hypot(p.x - tx, p.y - ty);
    if (d < 0.01) continue;
    // Straight behind it, from you; and behind a desk, a little to your right
    // as you look, clear of its monitor (which would hide it completely).
    const ux = (p.x - tx) / d, uy = (p.y - ty) / d;
    const side = p.type === 'desk' ? DESK_SIDESTEP : 0;
    const x = p.x + ux * COVER_BEHIND - uy * side, y = p.y + uy * COVER_BEHIND + ux * side;
    const fromYou = d + COVER_BEHIND;
    if (fromYou < COVER_MIN || fromYou > reach) continue;
    if (MAP[Math.floor(y)]?.[Math.floor(x)] !== 0 || enemyBlocked(g, x, y)) continue;
    if (!clearLine(x, y, tx, ty)) continue;
    const dist = Math.hypot(x - g.x, y - g.y);
    if (dist >= bestDist) continue;
    if (findPath(g.x, g.y, x, y, true) === null) continue;
    best = { x, y, prop: p };
    bestDist = dist;
  }
  return best;
}

// Is its cover still between it and where it last saw you?
function coverHolds(g) {
  const c = g.cover;
  if (!c) return false;
  if (Math.hypot(c.prop.x - g.x, c.prop.y - g.y) > 1.1) return false;
  const toProp = Math.atan2(c.prop.y - g.y, c.prop.x - g.x);
  const toYou = Math.atan2(g.lastSeenY - g.y, g.lastSeenX - g.x);
  return Math.abs(angleDiff(toProp, toYou)) < COVER_HOLDS;
}

// Run for cover, if there's any. Returns whether it found some.
function takeCover(g, avoid = null) {
  const spot = coverSpot(g, g.lastSeenX, g.lastSeenY, avoid);
  g.coverTry = COVER_TRY_GAP;
  if (!spot) { g.cover = null; return false; }
  g.cover = spot;
  g.state = 'cover';
  return true;
}

// Stand up (or stand where it is) and get ready to fire a burst.
function standAndAim(g) {
  g.state = 'aim';
  g.charge = 0;
  g.burstLeft = GUARD_BURST;
  g.shotTimer = 0;
  g.unseen = 0;
}

function duck(g, time) {
  g.state = 'duck';
  g.timer = time;
}
function duckTime() {
  return GUARD_DUCK_MIN + Math.random() * (GUARD_DUCK_MAX - GUARD_DUCK_MIN);
}

// It calls it in: the other guards on the floor come to where you are.
function radioIn(g) {
  if (g.radioTimer > 0) return;
  g.radioTimer = GUARD_RADIO_GAP;
  g.radioCalls += 1;
  for (const o of aliveGuards()) if (o !== g && !o.engaged) alertEnemy(o, player.x, player.y);
}

// One round: the shot itself is a robot's (combat.js: the odds, the glass).
function guardFires(g, dist) {
  robotFires(g, dist);
  g.rounds -= 1;
  g.burstLeft -= 1;
  g.shotTimer = GUARD_ROUND_GAP;
}

// Leave the fight and go and look for you (the usual 'search', enemies.js).
function giveUpCover(g) {
  g.cover = null;
  g.engaged = false;
  g.state = 'search';
}

// One frame of fighting, from updateWalker. Returns false if it isn't in a
// fight (on watch, or searching), so the usual state machine runs instead:
// that's what notices you and starts one (it sets 'chase' or 'aim').
function updateGuard(g, dt) {
  g.radioTimer = Math.max(0, g.radioTimer - dt);
  g.coverTry = Math.max(0, g.coverTry - dt);
  if (!GUARD_STATES.includes(g.state)) { g.engaged = false; return false; }
  // A fight starts here: whatever the usual machine said ('chase' or
  // 'aim'), it's a 'chase' to us, which decides on cover first.
  if (!g.engaged) { g.engaged = true; g.state = 'chase'; g.coverTry = 0; radioIn(g); }

  const sees = canSee(g);
  if (sees) { g.lastSeenX = player.x; g.lastSeenY = player.y; }
  const dist = Math.hypot(player.x - g.x, player.y - g.y);
  const face = () => { g.angle = Math.atan2(g.lastSeenY - g.y, g.lastSeenX - g.x); };

  if (g.state === 'chase') {
    // No cover yet: look for some; failing that, shoot from where it stands
    // if it can, or go after you.
    if (g.coverTry <= 0 && takeCover(g)) return true;
    if (sees && dist <= ENEMY_TYPES.guard.aimRange) { standAndAim(g); return true; }
    if (!sees) { giveUpCover(g); return false; }
    g.moving = moveAlongPath(g, player.x, player.y, dt);
    return true;
  }

  if (g.state === 'cover') {
    const c = g.cover;
    if (Math.hypot(c.x - g.x, c.y - g.y) < 0.15) { face(); duck(g, 0.4); return true; } // there: down, then up soon to look
    g.moving = moveAlongPath(g, c.x, c.y, dt);
    if (g.path === null) { g.cover = null; g.state = 'chase'; }
    return true;
  }

  if (g.state === 'reload') {
    face();
    g.timer -= dt;
    if (g.timer <= 0) {
      g.rounds = GUARD_CLIP;
      if (g.cover) duck(g, 0.3); else standAndAim(g);
    }
    return true;
  }

  if (g.state === 'duck') {
    face();
    if (g.rounds === 0) { g.state = 'reload'; g.timer = GUARD_RELOAD; return true; }
    if (g.flush || dist < GUARD_TOO_CLOSE) {
      const from = g.cover && g.cover.prop;
      g.flush = false;
      if (!takeCover(g, from)) standAndAim(g);
      return true;
    }
    g.timer -= dt;
    if (g.timer <= 0) standAndAim(g);
    return true;
  }

  // 'aim': up, aiming, firing its burst.
  face();
  if (g.flush) {
    const from = g.cover && g.cover.prop;
    g.flush = false;
    if (takeCover(g, from)) return true;
  }
  if (!sees) {
    g.unseen += dt;
    if (g.unseen >= GUARD_LOST) giveUpCover(g); // you've gone: it comes looking
    else if (g.cover && g.unseen > 0.4) duck(g, duckTime());
    return true;
  }
  g.unseen = 0;
  if (g.cover && !coverHolds(g)) { if (!takeCover(g, null)) g.cover = null; return true; } // flanked: it runs
  if (dist > ENEMY_TYPES.guard.aimRange) { g.cover = null; g.state = 'chase'; return true; } // you backed off
  g.charge = Math.min(ENEMY_TYPES.guard.charge, g.charge + dt);
  if (g.charge < ENEMY_TYPES.guard.charge) return true;
  g.shotTimer -= dt;
  if (g.shotTimer > 0) return true;
  guardFires(g, dist);
  if (g.rounds === 0) { g.state = 'reload'; g.timer = GUARD_RELOAD; return true; }
  if (g.burstLeft === 0) {
    if (g.cover) duck(g, duckTime());
    else if (!(g.coverTry <= 0 && takeCover(g))) standAndAim(g); // in the open: another burst, unless there's cover now
  }
  return true;
}

// Hit (combat.js, damageEnemy), and still standing: it moves.
function guardHurt(g) {
  if (g.type === 'guard') g.flush = true;
}

// A blast at (x, y) (explosions.js): any guard near enough is flushed out.
function guardsFeelBlast(x, y, radius) {
  for (const g of aliveGuards()) {
    if (Math.hypot(g.x - x, g.y - y) < radius + BLAST_FLUSH) g.flush = true;
  }
}

// The torch shot out (combat.js): no harm to the guard, but it heard that.
function breakTorch(g) {
  g.torchBroken = true;
  g.lastSeenX = player.x;
  g.lastSeenY = player.y;
  if (g.state === 'idle') g.state = 'search';
  turnTowardsPlayer(g);
}

// Which way it's facing as `viewer` sees it, as the four views of enemyTexture.
function viewOf(enemy, viewer) {
  const off = angleDiff(Math.atan2(viewer.y - enemy.y, viewer.x - enemy.x), enemy.angle);
  if (Math.abs(off) <= Math.PI / 4) return 'front';
  if (Math.abs(off) >= 3 * Math.PI / 4) return 'back';
  return off > 0 ? 'right' : 'left';
}

// Did this round land on its torch? (combat.js, with the texel shotTarget found.)
function guardTorchHit(g, texX, texY) {
  if (g.torchBroken || g.state === 'duck' || g.state === 'reload') return false; // ducked, the torch is down behind cover
  const spot = TORCH_SPOTS[g.state === 'aim' ? 'aim' : 'stand'][g.state === 'aim' ? 'front' : viewOf(g, player)];
  if (!spot) return false; // from behind: the torch is in front of it
  return Math.hypot(texX + 0.5 - 32 - spot[0], texY + 0.5 - spot[1]) < TORCH_HIT_R;
}

// Killed (combat.js): it drops its ammo, and the torch falls where it was pointing.
function guardDies(g) {
  if (g.type !== 'guard') return;
  g.torchAngle = torchDirection(g);
  pickups.push({ type: 'ammo', x: g.x, y: g.y });
}

// The way the torch is pointing: at you in a fight, ahead of it on the
// move, and sweeping either side on watch.
function torchDirection(g) {
  if (g.state === 'dead') return g.torchAngle;
  if (g.engaged && g.state !== 'cover') return Math.atan2(g.lastSeenY - g.y, g.lastSeenX - g.x);
  if (g.moving || g.state === 'cover') return g.angle;
  return g.angle + TORCH_SWEEP * Math.sin(animTime * TORCH_SWEEP_SPEED + g.x * 1.3);
}

// The beams (lighting.js), each frame: from every guard's torch, lit or lying on the floor.
function addGuardLights(grid) {
  for (const g of enemies) {
    if (g.type !== 'guard' || g.torchBroken) continue;
    if (g.state === 'dead' && g.downTime === 0 && g.burnt) continue; // burnt with its body
    const a = torchDirection(g);
    g.torchAngle = a;
    if (g.state === 'dead') {
      addBeam(grid, g.x + Math.cos(a) * 0.3, g.y + Math.sin(a) * 0.3, a, TORCH_BEAM.colour, TORCH_ON_FLOOR.radius, TORCH_BEAM.half, TORCH_ON_FLOOR.level);
      continue;
    }
    addBeam(grid, g.x + Math.cos(a) * 0.3, g.y + Math.sin(a) * 0.3, a, TORCH_BEAM.colour, TORCH_BEAM.radius, TORCH_BEAM.half, TORCH_BEAM.level);
  }
}
