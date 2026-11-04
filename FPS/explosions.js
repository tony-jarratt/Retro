// Exploding fuel drums. Shoot a drum and it goes up in a fireball: anything
// within BLAST_RADIUS with a clear line to it takes damage (less the further
// away), other drums caught in the blast go off a moment later, and for half
// a second the fireball lights up the room (lighting.js).

const BLAST_RADIUS = 2.0;       // cells
const BLAST_DAMAGE = 60;        // damage to you at the very centre, falling to 0 at BLAST_RADIUS
const EXPLOSION_TIME = 0.5;     // seconds the fireball lasts
const CHAIN_DELAY = 0.15;       // seconds before a drum caught in a blast goes off itself
const BLAST_LIGHT = { colour: [2.0, 1.2, 0.5], radius: 5.5 };

// Fireballs in progress: where, and how many seconds since it went off.
const explosions = [];

// Is there a clear straight line from (x1, y1) to (x2, y2)? The same castRay
// test the robots use to see you: walls and closed doors shield you from a blast.
function clearLine(x1, y1, x2, y2) {
  const d = Math.hypot(x2 - x1, y2 - y1);
  if (d < 0.01) return true;
  return castRay(x1, y1, (x2 - x1) / d, (y2 - y1) / d).dist >= d;
}

// How hard the blast hits at distance d: 1 at the centre, falling in a
// straight line to 0 at BLAST_RADIUS.
function blastStrength(d) {
  return Math.max(0, 1 - d / BLAST_RADIUS);
}

function explodeDrum(drum) {
  drum.state = 'exploded';
  explosions.push({ x: drum.x, y: drum.y, time: 0 });

  // Robots take up to ROBOT_HEALTH hits: point blank destroys one outright.
  for (const e of enemies) {
    if (e.state === 'dead') continue;
    const d = Math.hypot(e.x - drum.x, e.y - drum.y);
    if (d >= BLAST_RADIUS || !clearLine(drum.x, drum.y, e.x, e.y)) continue;
    const hits = Math.ceil(ROBOT_HEALTH * blastStrength(d));
    for (let i = 0; i < hits && e.state !== 'dead'; i++) damageEnemy(e);
  }

  const d = Math.hypot(player.x - drum.x, player.y - drum.y);
  if (d < BLAST_RADIUS && clearLine(drum.x, drum.y, player.x, player.y)) {
    damagePlayer(Math.round(BLAST_DAMAGE * blastStrength(d)));
  }

  // CHAIN REACTION: other drums in the blast are lit, and go off after a
  // short delay, so a row of drums goes up one after another.
  for (const other of props) {
    if (other.state !== 'intact' || !SPRITE_TYPES[other.type].explosive) continue;
    const od = Math.hypot(other.x - drum.x, other.y - drum.y);
    if (od < BLAST_RADIUS && clearLine(drum.x, drum.y, other.x, other.y)) {
      other.state = 'fuse';
      other.fuse = CHAIN_DELAY;
    }
  }
}

function updateExplosions(dt) {
  for (const p of props) {
    if (p.state !== 'fuse') continue;
    p.fuse -= dt;
    if (p.fuse <= 0) explodeDrum(p);
  }
  // Walk backwards so removing a finished fireball doesn't skip the next one.
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
