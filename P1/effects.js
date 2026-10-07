// Skid marks and tyre smoke, spray and dust, all in the overhead world (world units, like topdown.js).
//
// Skid marks are short dark lines left behind the player's rear wheels while the car is sliding or
// braking hard; they fade away after SKID_LIFE seconds. Particles are soft puffs: spray in the wet
// (from the player and the AI cars), smoke when the player slides on a dry track, dust on the grass.

const SKID_LIFE = 45;       // seconds before a mark has faded away
const SKID_MAX = 800;       // most marks kept at once
const PARTICLE_MAX = 240;

let skids = [];
let particles = [];
let skidLast = null;        // where the rear wheels were last frame, so marks join up
let effectsTime = 0;
let tdSlip = 0;             // how much the player's car is sliding sideways, 0..1

function effectsReset() {
  skids = [];
  particles = [];
  skidLast = null;
  effectsTime = 0;
  tdSlip = 0;
}

function addParticle(x, y, vx, vy, life, size, colour) {
  if (particles.length >= PARTICLE_MAX) particles.shift();
  particles.push({ x, y, vx, vy, life, max: life, size, colour });
}

// braking: the brake key is down (or the car is braking into the pits)
function updateEffects(dt, braking) {
  effectsTime += dt;

  // Sideways slip: how far the car's travel direction has swung away from where it points.
  const fx = Math.cos(tdHeading), fy = Math.sin(tdHeading);
  const sideways = Math.abs(-tdVx * fy + tdVy * fx);
  tdSlip = Math.max(limit(sideways / (MAX_SPEED * 0.22), 0, 1), launchSpin);   // wheelspin counts as slipping

  const rx = -fy, ry = fx;   // to the car's right
  const wheels = [1, -1].map(side => ({
    x: tdX - fx * 250 + rx * 170 * side,
    y: tdY - fy * 250 + ry * 170 * side,
  }));
  const onTarmac = Math.abs(playerX) <= 1.05;

  const locking = braking && speed > MAX_SPEED * 0.5;
  const strength = Math.max(tdSlip > 0.35 ? (tdSlip - 0.35) / 0.65 : 0, locking ? 0.5 : 0);
  if (strength > 0 && (speed > MAX_SPEED * 0.1 || launchSpin > 0.3) && onTarmac) {
    if (skidLast) {
      for (let k = 0; k < 2; k++) {
        skids.push({ x1: skidLast[k].x, y1: skidLast[k].y, x2: wheels[k].x, y2: wheels[k].y, t: effectsTime, a: strength * (1 - 0.5 * weather.wet) });
      }
    }
    skidLast = wheels;
  } else {
    skidLast = null;
  }
  while (skids.length > SKID_MAX || (skids.length > 0 && effectsTime - skids[0].t > SKID_LIFE)) skids.shift();

  const back = (v) => -Math.min(1, speed / MAX_SPEED) * 400 * v;   // puffs drift backwards
  const emit = (pt, kind) => {
    const jitter = () => (Math.random() - 0.5) * 500;
    if (kind === 'spray') addParticle(pt.x, pt.y, fx * back(1) + jitter(), fy * back(1) + jitter(), 0.5 + Math.random() * 0.4, 170 + Math.random() * 120, '215,228,242');
    else if (kind === 'smoke') addParticle(pt.x, pt.y, jitter(), jitter(), 0.7 + Math.random() * 0.5, 220 + Math.random() * 160, '205,205,205');
    else addParticle(pt.x, pt.y, fx * back(0.6) + jitter(), fy * back(0.6) + jitter(), 0.5 + Math.random() * 0.4, 140 + Math.random() * 100, '150,125,75');
  };
  const sp = speed / MAX_SPEED;
  if (!onTarmac && sp > 0.25) emit(wheels[Math.random() < 0.5 ? 0 : 1], 'dust');
  else if (weather.wet > 0.25 && sp > 0.3) { emit(wheels[0], 'spray'); emit(wheels[1], 'spray'); }
  else if (tdSlip > 0.55 && Math.random() < 0.8) emit(wheels[Math.random() < 0.5 ? 0 : 1], 'smoke');

  // the AI cars throw up spray in the rain too
  if (weather.wet > 0.25 && session === 'race') {
    for (const ai of ais) {
      if (ai.speed < MAX_SPEED * 0.35 || Math.random() > 0.5) continue;
      const p = tdPointAt(ai.z, ai.x * TD_HALF);
      addParticle(p.x - Math.cos(p.h) * 300, p.y - Math.sin(p.h) * 300, (Math.random() - 0.5) * 500, (Math.random() - 0.5) * 500,
                  0.5 + Math.random() * 0.4, 170 + Math.random() * 120, '215,228,242');
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

// Called inside the world transform, after the road and before the cars.
function drawTopSkids() {
  ctx.lineCap = 'round';
  ctx.lineWidth = 55;
  for (const s of skids) {
    const fade = 1 - (effectsTime - s.t) / SKID_LIFE;
    ctx.strokeStyle = 'rgba(12,12,16,' + (0.5 * s.a * fade).toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
}

// Called inside the world transform, after the cars.
function drawTopParticles() {
  for (const p of particles) {
    const age = 1 - p.life / p.max;
    ctx.fillStyle = 'rgba(' + p.colour + ',' + (0.32 * (1 - age)).toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (1 + 1.5 * age), 0, Math.PI * 2);
    ctx.fill();
  }
}
