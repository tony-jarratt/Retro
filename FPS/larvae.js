// LARVAE: the lab's swarm, in the drones' role (drones.js), but on the floor
// and with teeth rather than a bomb.
//
// Each larva is small, scuttles fast, and dies to a single hit, so like the
// drones they're what the gun's automatic mode is for, but auto is loud, and
// in the lab noise brings everything else (creatures.js). A larva that gets
// close LEAPS at you: if it connects it BITES, then scuttles back and comes
// again. A bite is small; a swarm of them isn't.
//
// Where they come from:
//   PACKS (a level's larvae): a nest of them lying still until one sees you
//     (in the light, like any creature) or a noise reaches them. Then the
//     whole pack comes.
//   PODS (a level's pods): fleshy breeding pods on a wall, cell + face like
//     the drones' hives. A noise that reaches one bursts it, and it spills
//     its larvae one after another. Burning the chamber bursts them all.
//
// The swarm steers like the drones: towards you (straight, or along a path),
// plus a skittering wobble, plus separation so they spread out. They can't
// open doors, they die in acid, and blasts kill them.

const LARVA_SPEED = 2.4;          // cells per second: a little slower than you
const LARVA_RADIUS = 0.15;
const LARVA_SIGHT = 5;            // cells, in full light (creatures.js: playerVisibility)
const LARVA_WOBBLE = 0.7;         // how hard it skitters from side to side
const LARVA_WOBBLE_RATE = 9;      // radians per second
const LARVA_SPACING = 0.5;        // closer than this to another, it pushes away
const LARVA_LEAP_RANGE = 1.1;     // this close, with a clear line, it leaps
const LARVA_LEAP_SPEED = 5.5;
const LARVA_LEAP_TIME = 0.28;     // seconds a leap lasts if it misses
const LARVA_LEAP_HEIGHT = 0.25;   // how high it springs, in cells
const LARVA_BITE_REACH = 0.4;
const LARVA_BITE = 4;
const LARVA_RECOIL_TIME = 1.0;    // seconds it scuttles back after a leap, before coming again
const LARVA_RECOIL_SPEED = 2.0;
const LARVA_ANIM_FPS = 10;
const POD_RELEASE_GAP = 0.35;     // seconds between larvae spilling from a pod

// Every larva:
//   x, y        position
//   state       'waiting', 'swarm', 'leap', 'recoil' or 'dead'
//   pack        which pack or pod it came from, so one waking wakes them all
//   phase       where in its wobble it starts
//   timer       seconds left of a leap or recoil
//   dirX, dirY  the leap's (or recoil's) direction
//   leapTime    how far into its leap it is, for the height of its spring
const larvae = [];

function addLarva(x, y, state, pack) {
  larvae.push({ x, y, state, pack, phase: Math.random() * Math.PI * 2, timer: 0, dirX: 0, dirY: 0, leapTime: 0 });
}

LARVA_PACKS.forEach((p, n) => {
  if (MAP[Math.floor(p.y)]?.[Math.floor(p.x)] !== 0) throw new Error(`larvae[${n}] at (${p.x}, ${p.y}) is not on a floor cell.`);
  for (let i = 0; i < p.count; i++) {
    const a = i * 2 * Math.PI / p.count;
    addLarva(p.x + Math.cos(a) * 0.3, p.y + Math.sin(a) * 0.3, 'waiting', 'pack' + n);
  }
});

// The pods. Their larvae come out onto the floor cell in front.
//   state    'loaded' -> 'releasing' -> 'empty'
//   left     larvae still inside
//   timer    seconds until the next comes out
const pods = PODS.map((p, n) => {
  const [dx, dy] = FACE_STEPS[p.face] || [NaN, NaN];
  if (!takesWallDecals(MAP[p.y]?.[p.x]) || MAP[p.y + dy]?.[p.x + dx] !== 0) {
    throw new Error(`pods[${n}] at cell (${p.x}, ${p.y}) face ${p.face}: that must be a plain wall with floor on its ${p.face} side.`);
  }
  placeDecal('wall', p.x, p.y, p.face, 'pod', 0); // decals.js
  return { ...p, outX: p.x + dx + 0.5, outY: p.y + dy + 0.5, state: 'loaded', left: p.count, timer: 0, pack: 'pod' + n };
});

function wakeLarvaPack(pack) {
  for (const l of larvae) if (l.pack === pack && l.state === 'waiting') l.state = 'swarm';
}

function burstPod(pod) {
  if (pod.state !== 'loaded') return;
  pod.state = 'releasing';
  pod.timer = 0;
}

function burstAllPods() {
  for (const p of pods) burstPod(p);
  for (const l of larvae) if (l.state === 'waiting') l.state = 'swarm';
}

// A noise (creatures.js, makeNoise): waiting packs it reaches wake, and pods
// it reaches burst. A wall in the way halves it, as for the creatures.
function larvaeHear(x, y, radius) {
  const reaches = (px, py) => Math.hypot(px - x, py - y) <= (clearLine(x, y, px, py) ? radius : radius * WALL_MUFFLE);
  for (const l of larvae) if (l.state === 'waiting' && reaches(l.x, l.y)) wakeLarvaPack(l.pack);
  for (const p of pods) if (p.state === 'loaded' && reaches(p.outX, p.outY)) burstPod(p);
}

function larvaSees(l) {
  const dx = player.x - l.x, dy = player.y - l.y;
  const dist = Math.hypot(dx, dy);
  if (dist > LARVA_SIGHT * darkVisibility()) return false; // creatures.js: it needs light
  return clearLine(l.x, l.y, player.x, player.y) && !steamBlocksSight(l.x, l.y, player.x, player.y);
}

// Shot, blasted or burnt: it bursts, leaving a smear of slime on the floor.
function destroyLarva(l) {
  if (l.state === 'dead') return;
  l.state = 'dead';
  const x = Math.floor(l.x), y = Math.floor(l.y);
  if (MAP[y]?.[x] === 0 && !floorDecals[y * DECAL_W + x]) placeDecal('floor', x, y, null, 'slime', noise(x, y, 130));
  sfxLarvaSquish(l); // sound.js
}

function blastLarvae(x, y, radius) {
  for (const l of larvae) if (l.state !== 'dead' && Math.hypot(l.x - x, l.y - y) < radius) destroyLarva(l);
}

// Move by (mx, my), one axis at a time so it slides along walls. Returns whether it moved at all.
function larvaMove(l, mx, my) {
  let moved = false;
  if (!boxHitsWall(l.x + mx, l.y, LARVA_RADIUS)) { l.x += mx; moved = true; }
  if (!boxHitsWall(l.x, l.y + my, LARVA_RADIUS)) { l.y += my; moved = true; }
  return moved;
}

// The way to you: straight if there's a clear line, else along the path. null if there's none.
function larvaHeading(l) {
  const dx = player.x - l.x, dy = player.y - l.y;
  const dist = Math.hypot(dx, dy);
  if (clearLine(l.x, l.y, player.x, player.y)) return { x: dx / dist, y: dy / dist, clear: true };
  const path = findPath(l.x, l.y, player.x, player.y);
  if (!path || path.length === 0) return null;
  const tx = path[0].x + 0.5 - l.x, ty = path[0].y + 0.5 - l.y;
  const t = Math.hypot(tx, ty) || 1;
  return { x: tx / t, y: ty / t, clear: false };
}

function updateLarva(l, dt) {
  if (l.state === 'waiting') {
    if (larvaSees(l)) { wakeLarvaPack(l.pack); sfxLarvaChitter(l); }
    return;
  }

  if (l.state === 'leap') {
    l.timer -= dt;
    l.leapTime += dt;
    const moved = larvaMove(l, l.dirX * LARVA_LEAP_SPEED * dt, l.dirY * LARVA_LEAP_SPEED * dt);
    const bit = Math.hypot(player.x - l.x, player.y - l.y) < LARVA_BITE_REACH;
    if (bit) { damagePlayer(LARVA_BITE); sfxLarvaBite(l); }
    if (bit || !moved || l.timer <= 0) {
      // Bitten or missed: scuttle back the way it came, then come again.
      l.state = 'recoil';
      l.timer = LARVA_RECOIL_TIME;
      l.dirX = -l.dirX;
      l.dirY = -l.dirY;
    }
    return;
  }

  if (l.state === 'recoil') {
    l.timer -= dt;
    larvaMove(l, l.dirX * LARVA_RECOIL_SPEED * dt, l.dirY * LARVA_RECOIL_SPEED * dt);
    if (l.timer <= 0) l.state = 'swarm';
    return;
  }

  // Swarming.
  const head = larvaHeading(l);
  if (!head) return; // shut out (a closed door): it waits
  const dist = Math.hypot(player.x - l.x, player.y - l.y);
  if (head.clear && dist < LARVA_LEAP_RANGE) {
    l.state = 'leap';
    l.timer = LARVA_LEAP_TIME;
    l.leapTime = 0;
    l.dirX = head.x;
    l.dirY = head.y;
    return;
  }
  const wobble = Math.sin(animTime * LARVA_WOBBLE_RATE + l.phase) * LARVA_WOBBLE;
  let mx = head.x - head.y * wobble;
  let my = head.y + head.x * wobble;
  for (const o of larvae) {
    if (o === l || o.state === 'dead' || o.state === 'waiting') continue;
    const ox = l.x - o.x, oy = l.y - o.y;
    const od = Math.hypot(ox, oy);
    if (od > 0 && od < LARVA_SPACING) {
      const push = 1.5 * (1 - od / LARVA_SPACING);
      mx += ox / od * push;
      my += oy / od * push;
    }
  }
  const len = Math.hypot(mx, my) || 1;
  larvaMove(l, mx / len * LARVA_SPEED * dt, my / len * LARVA_SPEED * dt);
}

function updateLarvae(dt) {
  for (const p of pods) {
    if (p.state !== 'releasing') continue;
    p.timer -= dt;
    if (p.timer > 0) continue;
    addLarva(p.outX, p.outY, 'swarm', p.pack);
    sfxPodBurst(p); // sound.js
    p.left -= 1;
    p.timer = POD_RELEASE_GAP;
    if (p.left === 0) {
      p.state = 'empty';
      placeDecal('wall', p.x, p.y, p.face, 'podEmpty', 0); // split open
    }
  }
  for (const l of larvae) if (l.state !== 'dead') updateLarva(l, dt);
}

// Live larvae, as sprites (sprites.js). They scuttle a frame out of step with
// each other; mid-leap, they spring up off the floor.
function larvaThings(thing) {
  return larvae.filter((l) => l.state !== 'dead').map((l, n) => {
    if (l.state === 'leap') {
      const t = Math.min(1, l.leapTime / LARVA_LEAP_TIME);
      return thing(l.x, l.y, LARVA_FRAMES[2], { larva: l, lift: LARVA_LEAP_HEIGHT * Math.sin(Math.PI * t), aimRow: LARVA_AIM_ROW - 3 });
    }
    const moving = l.state !== 'waiting';
    const frame = moving ? (Math.floor(animTime * LARVA_ANIM_FPS) + n) % 2 : 0;
    return thing(l.x, l.y, LARVA_FRAMES[frame], { larva: l, aimRow: LARVA_AIM_ROW });
  });
}
