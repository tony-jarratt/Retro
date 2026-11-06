// THE MANAGER: the HQ's thinking enemy (owner, 2026-11-06).
//
// An infected manager the plant took completely: it kept the mind, the
// authority and the habit of giving orders. It's the plant's voice in the
// building. It's weak (ENEMY_TYPES.manager) and never fights you itself.
// It RUNS THE FLOOR:
//
//   IT KEEPS AWAY. Awake ('command'), it stays out of your line of sight,
//     STAY_MIN to STAY_MAX cells off, and moves on when you get close or
//     can see it. You have to hunt it.
//   IT GIVES ORDERS, every ORDER_GAP seconds, to the suits within
//     COMMAND_RANGE of it, and ANNOUNCES each one over the building's PA
//     (a line on your visor and a chime). What it says is what it's doing:
//       SURROUND  "ALL STAFF TO THE EAST WING": its suits stop coming
//                 straight at you and spread out to close in from every
//                 side (each gets a point round you to head for);
//       AMBUSH    "PLEASE RETURN TO YOUR DESKS": suits that can't see you
//                 stand still, out of sight, until you come within
//                 SPRING_RANGE, or the order runs out and they all come;
//       FIRE DRILL  it sets off the sprinklers nearest you (sprinklers.js),
//                 so the bloomers there FLOWER in your way;
//       LIGHTS OUT  it cuts the ceiling lights round you for LIGHTS_OUT_TIME,
//                 and tells its suits where you are: they don't need to see;
//       SEAL DOOR it seals the door nearest you for SEAL_TIME (doors.js).
//   IT RE-ROOTS. Down to REROOT_AT hits, it goes to a planter (an
//     overgrown 'v' cell, or a potted plant) away from you, roots into it
//     and heals, REROOT_HEAL seconds a hit. Rooted, it gives no orders: a
//     window, if you can find it.
//   IT OPENS DOORS: the only infected that can (enemies.js: opensDoors).
//     Its suits can follow it through while the door's open.
//   KILL IT, and the PA dies in a screech of feedback; every suit it was
//     running staggers, and goes back to shambling.
//
// When you first get a look at it, its ID BADGE comes up on your visor:
// a level can name it (`badge: ['NAME', 'JOB TITLE']` on its ENEMIES entry).

const STAY_MIN = 6, STAY_MAX = 10;   // cells from you it likes to be
const COMMAND_RANGE = 14;            // cells: the suits it runs
const ORDER_GAP = 9;                 // seconds between orders
const FIRST_ORDER = 2;               // seconds after it wakes before the first
const ORDER_TIME = 10;               // seconds a surround or ambush order lasts
const SURROUND_RADIUS = 1.3;         // cells from you: where each suit is sent
const SPRING_RANGE = 2.5;            // cells: an ambushing suit this close springs
const LIGHTS_REACH = 5;              // cells from you: the lights it cuts
const LIGHTS_OUT_TIME = 12;          // seconds they stay off (the last second, they stutter back)
const SPRINKLER_REACH_FROM_YOU = 7;  // cells: the heads it can set off
const SEAL_REACH = 5;                // cells from you: the doors it can seal
const SEAL_TIME = 10;                // seconds a door stays sealed
const REROOT_AT = 2;                 // hits left: it goes to re-root
const REROOT_HEAL = 2.5;             // seconds per hit, rooted
const PA_TIME = 4;                   // seconds a PA line stays on the visor
const BADGE_TIME = 4;                // seconds the ID badge shows
const BADGE_RANGE = 9;               // cells: close enough to read its badge
const DEFAULT_BADGE = ['D. HARLOW', 'REGIONAL OPERATIONS MANAGER'];
const ORDERS = ['surround', 'fire', 'ambush', 'lights', 'seal'];

let paMessage = null;   // the PA line on the visor (hud.js), and how long it has left
let paTime = 0;
let paNew = false;      // a line just went out: sound.js chimes and talks
let paFeedback = false; // a manager just died: sound.js screeches
let badgeShown = null;  // the badge on the visor: [name, title], and how long it has left
let badgeTime = 0;

for (const [n, e] of ENEMIES.entries()) {
  const live = enemies[n];
  if (live.type !== 'manager') continue;
  if (THEME_NAME !== 'hq') throw new Error(`A manager is in a "${THEME_NAME}" level: it belongs to the HQ only.`);
  live.badge = e.badge || DEFAULT_BADGE;
  live.badgeSeen = false;
  live.orderTimer = FIRST_ORDER;
  live.orderIndex = 0;
  live.spot = null;
}
for (const e of enemies) e.order = null; // a suit's current order: { kind, x, y, until }

function announce(text) {
  paMessage = text;
  paTime = PA_TIME;
  paNew = true;
}

// The compass word for a direction (x grows east, y grows south).
function compassWord(dx, dy) {
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'EAST' : 'WEST') : (dy > 0 ? 'SOUTH' : 'NORTH');
}

// The suits this manager runs: up, and within COMMAND_RANGE of it.
function commandedSuits(m) {
  return enemies.filter((e) => e.type === 'suit' && e.state !== 'dead' && Math.hypot(e.x - m.x, e.y - m.y) <= COMMAND_RANGE);
}

// A floor point the manager can walk to that meets `good(x, y)` (cell
// middles), scored by `score` (lower is better); null if none. Searches the
// cells within `reach` of (cx, cy).
function findSpot(m, cx, cy, reach, good, score) {
  let best = null, bestScore = Infinity;
  for (let y = Math.floor(cy - reach); y <= Math.floor(cy + reach); y++) {
    for (let x = Math.floor(cx - reach); x <= Math.floor(cx + reach); x++) {
      if (MAP[y]?.[x] !== 0) continue;
      const px = x + 0.5, py = y + 0.5;
      if (!good(px, py)) continue;
      const s = score(px, py);
      if (s >= bestScore) continue;
      if (findPath(m.x, m.y, px, py, true) === null) continue; // it opens doors
      best = { x: px, y: py };
      bestScore = s;
    }
  }
  return best;
}

// Somewhere out of your sight, STAY_MIN..STAY_MAX from you, nearest to it.
function hidingSpot(m) {
  return findSpot(m, player.x, player.y, STAY_MAX, (x, y) => {
    const d = Math.hypot(x - player.x, y - player.y);
    return d >= STAY_MIN && d <= STAY_MAX && !clearLine(x, y, player.x, player.y);
  }, (x, y) => Math.hypot(x - m.x, y - m.y));
}

// Beside a planter ('v' cells) or a potted plant, as far from you as it can.
function besidePlanter(x, y) {
  const cx = Math.floor(x), cy = Math.floor(y);
  if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => MAP[cy + dy]?.[cx + dx] === OVERGROWN_CELL)) return true;
  return props.some((p) => p.type === 'plant' && Math.hypot(p.x - x, p.y - y) < 1.2 && Math.hypot(p.x - x, p.y - y) > 0.5); // next to the pot, not in it
}
function planterSpot(m) {
  return findSpot(m, m.x, m.y, 12, besidePlanter, (x, y) => -Math.hypot(x - player.x, y - player.y));
}

// THE ORDERS. Each returns false if it can't be given right now (no suits,
// no sprinklers near you...), and the manager tries the next one.
function orderSurround(m, suits) {
  const going = suits.filter((s) => s.state !== 'grab');
  if (going.length < 2) return false;
  // Each suit gets a point round you, spread evenly, starting from the side it's on.
  const start = Math.atan2(going[0].y - player.y, going[0].x - player.x);
  let cx = 0, cy = 0;
  going.forEach((s, n) => {
    const a = start + n * 2 * Math.PI / going.length;
    let x = player.x + Math.cos(a) * SURROUND_RADIUS, y = player.y + Math.sin(a) * SURROUND_RADIUS;
    if (MAP[Math.floor(y)]?.[Math.floor(x)] !== 0) { x = player.x; y = player.y; } // in a wall: just come at you
    s.order = { kind: 'go', x, y, until: animTime + ORDER_TIME };
    alertEnemy(s, player.x, player.y);
    cx += s.x; cy += s.y;
  });
  announce(`ALL STAFF TO THE ${compassWord(cx / going.length - player.x, cy / going.length - player.y)} WING. THANK YOU.`);
  return true;
}

function orderAmbush(m, suits) {
  const hidden = suits.filter((s) => s.state !== 'grab' && !canSee(s) && Math.hypot(s.x - player.x, s.y - player.y) > SPRING_RANGE);
  if (hidden.length === 0) return false;
  for (const s of hidden) s.order = { kind: 'hold', until: animTime + ORDER_TIME };
  announce('PLEASE RETURN TO YOUR DESKS. WORK CONTINUES AS NORMAL.');
  return true;
}

function orderFireDrill() {
  const near = sprinklers.filter((s) => !s.on && Math.hypot(s.x + 0.5 - player.x, s.y + 0.5 - player.y) <= SPRINKLER_REACH_FROM_YOU);
  if (near.length === 0) return false;
  near.sort((a, b) => Math.hypot(a.x + 0.5 - player.x, a.y + 0.5 - player.y) - Math.hypot(b.x + 0.5 - player.x, b.y + 0.5 - player.y));
  turnOnSprinkler(near[0]); // sprinklers.js: its whole room comes on with it
  sfxFireBell(near[0].x + 0.5, near[0].y + 0.5);
  announce('FIRE DRILL IN PROGRESS. PLEASE REMAIN CALM.');
  return true;
}

function orderLightsOut(m, suits) {
  const near = LIGHTS.filter((l) => l.kind === 'ceiling' && !(l.cut > 0) && Math.hypot(l.x - player.x, l.y - player.y) <= LIGHTS_REACH);
  if (near.length === 0) return false;
  for (const l of near) l.cut = LIGHTS_OUT_TIME;
  for (const s of suits) alertEnemy(s, player.x, player.y); // they don't need to see you: they've been told
  announce('ENERGY SAVING MEASURES ARE NOW IN EFFECT.');
  return true;
}

function orderSealDoor() {
  const near = DOORS.filter((d) => d.lock === null && !(d.sealed > 0) && !doorwayOccupied(d) &&
    Math.hypot(d.x + 0.5 - player.x, d.y + 0.5 - player.y) <= SEAL_REACH);
  if (near.length === 0) return false;
  near.sort((a, b) => Math.hypot(a.x + 0.5 - player.x, a.y + 0.5 - player.y) - Math.hypot(b.x + 0.5 - player.x, b.y + 0.5 - player.y));
  near[0].sealed = SEAL_TIME; // doors.js
  announce('THE MEETING WILL CONTINUE WITHOUT YOU.');
  return true;
}

function giveOrder(m) {
  const suits = commandedSuits(m);
  const give = { surround: orderSurround, ambush: orderAmbush, fire: orderFireDrill, lights: orderLightsOut, seal: orderSealDoor };
  for (let tries = 0; tries < ORDERS.length; tries++) {
    const kind = ORDERS[m.orderIndex % ORDERS.length];
    m.orderIndex += 1;
    if (give[kind](m, suits)) return;
  }
  // Nothing it can do from here this time: it'll try again next gap.
}

// A suit following an order (called from updateWalker before its own
// thinking). Returns true if the order decided what it does this frame.
function followOrder(enemy, dt) {
  const order = enemy.order;
  if (!order) return false;
  const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
  if (animTime > order.until) {
    enemy.order = null;
    if (order.kind === 'hold') alertEnemy(enemy, player.x, player.y); // the wait's over: they all come
    return false;
  }
  if (order.kind === 'hold') {
    if (dist <= SPRING_RANGE) { enemy.order = null; return false; } // you walked into it
    enemy.angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    return true; // standing still, out of sight, waiting
  }
  // 'go': to its point round you. Close to you already, or there: it's on you.
  if (dist < 2 || Math.hypot(order.x - enemy.x, order.y - enemy.y) < 0.4) { enemy.order = null; return false; }
  enemy.state = 'search';
  enemy.moving = moveAlongPath(enemy, order.x, order.y, dt);
  if (enemy.path === null) { enemy.order = null; return false; }
  return true;
}

// THE MANAGER'S OWN STATE MACHINE (from updateWalker).
//   idle     at its desk, until it sees you, hears a noise, is shot, or
//            any of its suits goes after you
//   command  awake: keeping away, giving orders
//   reroot   badly hurt: walking to a planter
//   root     rooted in it, healing; no orders
function updateManager(m, dt) {
  if (m.state === 'idle') {
    // It wakes if it sees you, or the moment any suit it runs is after you:
    // they're all one network.
    const staffAlerted = commandedSuits(m).some((s) => ['chase', 'aim', 'grab'].includes(s.state));
    if (canSee(m) || staffAlerted || m.health < ENEMY_TYPES.manager.health) m.state = 'command';
    return;
  }
  if (m.state === 'search' || m.state === 'chase' || m.state === 'aim') m.state = 'command'; // alerted, or shot

  if (m.state === 'root') {
    m.attackTime += dt;
    if (m.attackTime >= REROOT_HEAL) {
      m.attackTime -= REROOT_HEAL;
      m.health += 1;
    }
    if (m.health >= ENEMY_TYPES.manager.health) { m.state = 'command'; m.spot = null; m.orderTimer = FIRST_ORDER; }
    return;
  }

  if (m.state === 'command' && m.health <= REROOT_AT) {
    m.spot = planterSpot(m);
    if (m.spot) {
      m.state = 'reroot';
      announce('I WILL BE OUT OF THE OFFICE FOR A SHORT WHILE.');
    }
  }
  if (m.state === 'reroot') {
    if (Math.hypot(m.spot.x - m.x, m.spot.y - m.y) < 0.2) { m.state = 'root'; m.attackTime = 0; return; }
    m.moving = moveAlongPath(m, m.spot.x, m.spot.y, dt);
    if (m.path === null) { m.state = 'command'; m.spot = null; }
    return;
  }

  // Commanding: keep out of your sight, and give orders.
  if (canSee(m)) { m.lastSeenX = player.x; m.lastSeenY = player.y; }
  const dist = Math.hypot(player.x - m.x, player.y - m.y);
  const exposed = dist < STAY_MIN || clearLine(m.x, m.y, player.x, player.y);
  if (exposed && (!m.spot || Math.hypot(m.spot.x - m.x, m.spot.y - m.y) < 0.2)) m.spot = hidingSpot(m);
  if (m.spot && Math.hypot(m.spot.x - m.x, m.spot.y - m.y) >= 0.2) {
    m.moving = moveAlongPath(m, m.spot.x, m.spot.y, dt);
    if (m.path === null) m.spot = null;
  } else {
    m.angle = Math.atan2(player.y - m.y, player.x - m.x); // watching, directing
  }
  m.orderTimer -= dt;
  if (m.orderTimer <= 0) {
    m.orderTimer = ORDER_GAP;
    giveOrder(m);
  }
}

// Killed (combat.js, via damageEnemy): the PA dies, and its suits reel.
function managerDies(m) {
  if (m.type !== 'manager') return;
  for (const s of commandedSuits(m)) {
    s.order = null;
    if (s.state !== 'dead') loseGrip(s); // infected.js: staggers back (and lets go of you)
  }
  announce('- - - SIGNAL LOST - - -');
  paFeedback = true;
}

// Each frame (main.js): timers, the badge, lights coming back on.
function updateManagers(dt) {
  paTime = Math.max(0, paTime - dt);
  badgeTime = Math.max(0, badgeTime - dt);
  for (const l of LIGHTS) if (l.cut > 0) l.cut -= dt;
  for (const d of DOORS) if (d.sealed > 0) d.sealed -= dt;
  for (const m of enemies) {
    if (m.type !== 'manager' || m.badgeSeen || m.state === 'dead') continue;
    // You get a look at it: in front of you, in range, nothing in the way, and lit enough to read.
    const dx = m.x - player.x, dy = m.y - player.y;
    const d = Math.hypot(dx, dy);
    const [r, g, b] = lightAt(m.x, m.y);
    if (d <= BADGE_RANGE && Math.abs(angleDiff(Math.atan2(dy, dx), player.angle)) < 0.5 &&
        clearLine(player.x, player.y, m.x, m.y) && (r + g + b) / 3 > 0.5) {
      m.badgeSeen = true;
      badgeShown = m.badge;
      badgeTime = BADGE_TIME;
    }
  }
}
