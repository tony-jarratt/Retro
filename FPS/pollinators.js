// THE POLLINATORS: the HQ's swarm, in the drones' role (drones.js) and the
// larvae's (larvae.js), but in the air. Moths the infection has grown huge.
//
// Each one dies to a single hit, and they come in packs, so like the drones
// they're what the gun's automatic mode is for. But they're MOTHS:
//   - DRAWN TO LIGHT. A pack circles one of the skylights, round and round
//     its home cell, until something brighter catches it: your MUZZLE FLASH.
//     Every round you fire within MOTH_FLASH_RANGE, with a clear line to
//     them, brings the whole pack. (They don't hear: a burst of spores or a
//     blast round the corner won't wake them, but a shot in plain view will.)
//   - Or you come too close (MOTH_SENSE), in plain view.
// Then they SWARM: towards you (straight, or along a path), fluttering from
// side to side, spreading out. Close in, one STINGS (MOTH_STING), then
// flutters back for a moment before coming again. Shot, it drops to the
// floor. Blasts kill them; burning the mother plant sets them all loose.

const MOTH_SPEED = 2.8;           // cells per second: a little slower than you
const MOTH_RADIUS = 0.12;
const MOTH_SENSE = 2.5;           // cells: this close, in plain view, and it comes
const MOTH_FLASH_RANGE = 7;       // cells: a muzzle flash this close, in plain view, brings the pack
const MOTH_CIRCLE = 0.35;         // cells: how wide it circles its light
const MOTH_CIRCLE_SPEED = 1.6;    // radians per second
const MOTH_FLUTTER = 0.9;         // how hard it veers from side to side
const MOTH_FLUTTER_RATE = 11;     // radians per second
const MOTH_SPACING = 0.45;        // closer than this to another, it pushes away
const MOTH_STING_RANGE = 0.45;
const MOTH_STING = 3;
const MOTH_RECOIL_TIME = 0.8;     // seconds it flutters back after stinging
const MOTH_RECOIL_SPEED = 2.2;
const MOTH_FALL_TIME = 0.4;       // seconds a shot moth takes to drop to the floor
const MOTH_BOB = 0.06;            // cells it bobs up and down as it flies
const MOTH_ANIM_FPS = 14;         // wingbeats

// Every moth:
//   x, y          position
//   state         'circling', 'swarm', 'recoil', 'falling' or 'dead'
//   pack          which pack it came from, so one waking wakes them all
//   homeX, homeY  the light it circles (the middle of its pack's cell)
//   phase         where in its circle and flutter it starts
//   timer         seconds left of a recoil or a fall
//   dirX, dirY    the recoil's direction
const moths = [];

MOTH_PACKS.forEach((p, n) => {
  if (MAP[Math.floor(p.y)]?.[Math.floor(p.x)] !== 0) throw new Error(`moths[${n}] at (${p.x}, ${p.y}) is not on a floor cell.`);
  for (let i = 0; i < p.count; i++) {
    const phase = i * 2 * Math.PI / p.count;
    moths.push({ x: p.x, y: p.y, state: 'circling', pack: n, homeX: p.x, homeY: p.y, phase, timer: 0, dirX: 0, dirY: 0 });
  }
});

function wakeMothPack(pack) {
  for (const m of moths) if (m.pack === pack && m.state === 'circling') m.state = 'swarm';
}

// The mother plant's burning (creatures.js): every pack comes.
function wakeAllMoths() {
  for (const m of moths) if (m.state === 'circling') m.state = 'swarm';
}

// You fired, at (x, y) (combat.js): every pack that can see the flash comes.
// `reach` scales how far: an incendiary round's flash is seen from further (ammo.js).
function mothsSeeFlash(x, y, reach = 1) {
  for (const m of moths) {
    if (m.state === 'circling' && Math.hypot(m.x - x, m.y - y) < MOTH_FLASH_RANGE * reach && clearLine(m.x, m.y, x, y)) wakeMothPack(m.pack);
  }
}

// Shot: it drops to the floor.
function destroyMoth(m) {
  if (m.state === 'falling' || m.state === 'dead') return;
  m.state = 'falling';
  m.timer = MOTH_FALL_TIME;
  sfxMothSplat(m); // sound.js
}

function blastMoths(x, y, radius) {
  for (const m of moths) if (Math.hypot(m.x - x, m.y - y) < radius) destroyMoth(m);
}

// Move by (mx, my), one axis at a time so it slides along walls.
function mothMove(m, mx, my) {
  if (!boxHitsWall(m.x + mx, m.y, MOTH_RADIUS)) m.x += mx;
  if (!boxHitsWall(m.x, m.y + my, MOTH_RADIUS)) m.y += my;
}

// The way to you: straight if there's a clear line, else along the path. null if there's none.
function mothHeading(m) {
  const dx = player.x - m.x, dy = player.y - m.y;
  const dist = Math.hypot(dx, dy);
  if (clearLine(m.x, m.y, player.x, player.y)) return { x: dx / dist, y: dy / dist };
  const path = findPath(m.x, m.y, player.x, player.y);
  if (!path || path.length === 0) return null;
  const tx = path[0].x + 0.5 - m.x, ty = path[0].y + 0.5 - m.y;
  const t = Math.hypot(tx, ty) || 1;
  return { x: tx / t, y: ty / t };
}

function updateMoth(m, dt) {
  if (m.state === 'falling') {
    m.timer -= dt;
    if (m.timer <= 0) m.state = 'dead';
    return;
  }
  if (m.state === 'circling') {
    const a = animTime * MOTH_CIRCLE_SPEED + m.phase;
    m.x = m.homeX + Math.cos(a) * MOTH_CIRCLE;
    m.y = m.homeY + Math.sin(a) * MOTH_CIRCLE;
    if (Math.hypot(player.x - m.x, player.y - m.y) < MOTH_SENSE && clearLine(m.x, m.y, player.x, player.y)) wakeMothPack(m.pack);
    return;
  }
  if (m.state === 'recoil') {
    m.timer -= dt;
    mothMove(m, m.dirX * MOTH_RECOIL_SPEED * dt, m.dirY * MOTH_RECOIL_SPEED * dt);
    if (m.timer <= 0) m.state = 'swarm';
    return;
  }

  // Swarming.
  const head = mothHeading(m);
  if (!head) return; // shut out (a closed door): it waits
  if (Math.hypot(player.x - m.x, player.y - m.y) < MOTH_STING_RANGE) {
    damagePlayer(MOTH_STING);
    sfxMothSting(m); // sound.js
    m.state = 'recoil';
    m.timer = MOTH_RECOIL_TIME;
    m.dirX = -head.x;
    m.dirY = -head.y;
    return;
  }
  const flutter = Math.sin(animTime * MOTH_FLUTTER_RATE + m.phase * 3) * MOTH_FLUTTER;
  let mx = head.x - head.y * flutter;
  let my = head.y + head.x * flutter;
  for (const o of moths) {
    if (o === m || o.state !== 'swarm') continue;
    const ox = m.x - o.x, oy = m.y - o.y;
    const od = Math.hypot(ox, oy);
    if (od > 0 && od < MOTH_SPACING) {
      const push = 1.5 * (1 - od / MOTH_SPACING);
      mx += ox / od * push;
      my += oy / od * push;
    }
  }
  const len = Math.hypot(mx, my) || 1;
  mothMove(m, mx / len * MOTH_SPEED * dt, my / len * MOTH_SPEED * dt);
}

function updatePollinators(dt) {
  for (const m of moths) if (m.state !== 'dead') updateMoth(m, dt);
}

// Live moths as sprites (sprites.js), flapping out of step with each other
// and bobbing as they fly. A shot one drops to the floor, wings still; shots
// pass through it on the way down.
function mothThings(thing) {
  const list = [];
  moths.forEach((m, n) => {
    if (m.state === 'dead') return;
    if (m.state === 'falling') {
      list.push(thing(m.x, m.y, MOTH_FRAMES[1], { effect: true, lift: -0.45 * (1 - m.timer / MOTH_FALL_TIME) }));
      return;
    }
    const frame = MOTH_FRAMES[(Math.floor(animTime * MOTH_ANIM_FPS) + n) % 2];
    list.push(thing(m.x, m.y, frame, { moth: m, lift: MOTH_BOB * Math.sin(animTime * 5 + m.phase) }));
  });
  return list;
}
