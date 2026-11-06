// Explosions: fuel drums when you shoot them, and the heavy robot's rockets.
// Anything within a blast's radius with a clear line to it takes damage (less
// the further away), drums caught in a blast go off a moment later, and for
// half a second the fireball lights up the room (lighting.js).

const EXPLOSION_TIME = 0.5;     // seconds a fireball lasts
const CHAIN_DELAY = 0.15;       // seconds before a drum caught in a blast goes off itself
const BLAST_ROBOT_HITS = 3;     // hits a robot takes at the very centre of a blast
const BLAST_LIGHT = { colour: [2.0, 1.2, 0.5], radius: 5.5 };

// The two kinds of blast. damage is to you at the very centre, falling in a
// straight line to 0 at the radius.
const DRUM_BLAST = { radius: 2.0, damage: 60 };
const ROCKET_BLAST = { radius: 1.5, damage: 40 };

const ROCKET_SPEED = 4.0;       // cells per second: a bit faster than you, so dodge sideways, not back
const ROCKET_RADIUS = 0.1;      // half-width of a rocket's collision box
const ROCKET_LIGHT = { colour: [1.2, 0.6, 0.25], radius: 2.5 };

// Fireballs in progress: where, and how many seconds since it went off.
const explosions = [];
// Rockets in flight: position, and direction as a unit vector.
const rockets = [];

// Is there a clear straight line from (x1, y1) to (x2, y2)? The same castRay
// test the robots use to see you: walls and closed doors shield you from a
// blast. Glass and grates don't (castRay sees through them), and the blast
// blows any windows in its radius in anyway (shatterGlassNear).
function clearLine(x1, y1, x2, y2) {
  const d = Math.hypot(x2 - x1, y2 - y1);
  if (d < 0.01) return true;
  return castRay(x1, y1, (x2 - x1) / d, (y2 - y1) / d).dist >= d;
}

// How hard a blast hits at distance d: 1 at the centre, falling in a
// straight line to 0 at its radius.
function blastStrength(blast, d) {
  return Math.max(0, 1 - d / blast.radius);
}

// A blast at (x, y): fireball, damage to robots and you, and drums set off.
function explodeAt(x, y, blast) {
  explosions.push({ x, y, time: 0 });
  sfxExplosion(x, y, blast.radius); // sound.js
  makeNoise(x, y, BLAST_NOISE);      // creatures.js: everything nearby comes to look
  shatterGlassNear(x, y, blast.radius); // panels.js
  stampBlastScorch(x, y); // decals.js: the floor, ceiling and nearby walls are scorched
  if (!blast.spareDrones) blastDrones(x, y, blast.radius); // drones.js
  blastLarvae(x, y, blast.radius); // larvae.js
  blastMoths(x, y, blast.radius);  // pollinators.js
  blastCore(x, y, blast); // core.js: a drum set off by the core hurts it
  blastBays(x, y, blast); // repair.js

  // Robots take up to BLAST_ROBOT_HITS hits: point blank destroys most outright.
  // (A heavy's own rockets hurt robots too: lure one into firing past its friends.)
  for (const e of enemies) {
    if (e.state === 'dead') continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d >= blast.radius || !clearLine(x, y, e.x, e.y)) continue;
    damageEnemy(e, Math.ceil(BLAST_ROBOT_HITS * blastStrength(blast, d)));
  }

  finishDownedNear(x, y, blast.radius); // infected.js: burns the bodies, so they don't get up
  sprinklersFeelBlast(x, y);            // sprinklers.js: the heat sets the fire system off

  const d = Math.hypot(player.x - x, player.y - y);
  if (d < blast.radius && clearLine(x, y, player.x, player.y)) {
    damagePlayer(Math.round(blast.damage * blastStrength(blast, d)));
  }

  // CHAIN REACTION: drums in the blast are lit, and go off after a short
  // delay, so a row of drums goes up one after another.
  for (const other of props) {
    if (other.state !== 'intact' || !SPRITE_TYPES[other.type].explosive) continue;
    const od = Math.hypot(other.x - x, other.y - y);
    if (od < blast.radius && clearLine(x, y, other.x, other.y)) {
      other.state = 'fuse';
      other.fuse = CHAIN_DELAY;
    }
  }
}

function explodeDrum(drum) {
  drum.state = 'exploded';
  explodeAt(drum.x, drum.y, DRUM_BLAST);
}

// A heavy fires: a rocket leaves its launcher heading for where you are NOW.
// It doesn't steer, so moving sideways once it's on its way makes it miss.
function launchRocket(enemy) {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const d = Math.hypot(dx, dy);
  // Start just in front of the robot, so it doesn't hit the robot that fired it.
  const start = ENEMY_RADIUS + ROCKET_RADIUS + 0.05;
  rockets.push({ x: enemy.x + dx / d * start, y: enemy.y + dy / d * start, dirX: dx / d, dirY: dy / d });
}

// What, if anything, would a rocket at (x, y) run into? Panels block it like
// walls do (isWall), so a rocket hitting a window blows it in.
function rocketHitsSomething(x, y) {
  return boxHitsWall(x, y, ROCKET_RADIUS) ||
         hitsSolidSprite(x, y, ROCKET_RADIUS) ||
         boxesOverlap(x, y, ROCKET_RADIUS, player.x, player.y, PLAYER_RADIUS) ||
         enemies.some((e) => e.state !== 'dead' && boxesOverlap(x, y, ROCKET_RADIUS, e.x, e.y, ENEMY_RADIUS));
}

function updateExplosions(dt) {
  for (const p of props) {
    if (p.state !== 'fuse') continue;
    p.fuse -= dt;
    if (p.fuse <= 0) explodeDrum(p);
  }

  // Rockets fly straight. One that would run into something next frame blows
  // up where it is, still in open space, so the blast's clear-line checks work.
  // (Walk backwards: removing one doesn't skip the next.)
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    const nx = r.x + r.dirX * ROCKET_SPEED * dt;
    const ny = r.y + r.dirY * ROCKET_SPEED * dt;
    if (rocketHitsSomething(nx, ny)) {
      rockets.splice(i, 1);
      explodeAt(r.x, r.y, ROCKET_BLAST);
    } else {
      r.x = nx;
      r.y = ny;
    }
  }

  for (let i = explosions.length - 1; i >= 0; i--) {
    explosions[i].time += dt;
    if (explosions[i].time >= EXPLOSION_TIME) explosions.splice(i, 1);
  }
}

// Which frame of the fireball animation to show.
function explosionTexture(b) {
  const frame = Math.min(FIREBALL_FRAMES.length - 1, Math.floor(b.time / EXPLOSION_TIME * FIREBALL_FRAMES.length));
  return FIREBALL_FRAMES[frame];
}
