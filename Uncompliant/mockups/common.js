'use strict';
// Shared by the two fire-sequence mockups (throwaway). Armour model, weapon timeline,
// particles and the HUD pieces. Placeholder art only: nothing here is final.

const W = 1024, H = 688;
const FONT = 'bold 13px ui-monospace, Menlo, Consolas, monospace';
const HEAT_MAX = 30;

// Hit locations on the target. r = [x, y, w, h] on a 64x64 front-view grid (the target's own
// right is on the viewer's left). max = armour points. w = hit weight.
const LOCS = {
  HD: { name: 'HEAD',         r: [26, 4, 12, 10],  max: 9,  w: 1 },
  CT: { name: 'CENTRE TORSO', r: [26, 16, 12, 20], max: 20, w: 3 },
  RT: { name: 'RIGHT TORSO',  r: [15, 14, 11, 22], max: 14, w: 2 },
  LT: { name: 'LEFT TORSO',   r: [38, 14, 11, 22], max: 14, w: 2 },
  RA: { name: 'RIGHT ARM',    r: [3, 14, 12, 28],  max: 10, w: 2 },
  LA: { name: 'LEFT ARM',     r: [49, 14, 12, 28], max: 10, w: 2 },
  RL: { name: 'RIGHT LEG',    r: [17, 38, 11, 24], max: 14, w: 2 },
  LL: { name: 'LEFT LEG',     r: [36, 38, 11, 24], max: 14, w: 2 },
};

// One volley: two lasers, an autocannon burst, a missile salvo. start/gap/dur are seconds.
const WEAPONS = [
  { id: 'laser', label: 'LASER', n: 2, start: 0.7, gap: 0.4,  dur: 0.35, dmg: 6, heat: 4 },
  { id: 'ac',    label: 'AC',    n: 5, start: 1.9, gap: 0.1,  dur: 0.22, dmg: 4, heat: 1 },
  { id: 'lrm',   label: 'MSL',   n: 6, start: 3.1, gap: 0.08, dur: 1.0,  dmg: 2, heat: 1 },
];

const S = { armour: {}, flashUntil: {}, log: [], heat: 0, parts: [], rings: [], floats: [],
            shots: [], seqStart: 0, shake: 0, lastDmg: 0 };

function rand(a, b) { return a + Math.random() * (b - a); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rect(g, c, x, y, w, h) { g.fillStyle = c; g.fillRect(x, y, w, h); }
function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  if (draw) draw(g);
  return c;
}

function resetArmour() {
  for (const k in LOCS) { S.armour[k] = LOCS[k].max; S.flashUntil[k] = 0; }
  S.log.length = 0;
  S.floats.length = 0;
}
resetArmour();

function pickLoc() {
  let total = 0;
  for (const k in LOCS) total += LOCS[k].w;
  let n = Math.random() * total;
  for (const k in LOCS) { n -= LOCS[k].w; if (n < 0) return k; }
  throw new Error('pickLoc: hit weights did not add up');
}

function seqActive() { return S.shots.some(s => !s.hit); }

// Returns false (and does nothing) if the last volley is still playing.
function startSequence(now) {
  if (seqActive()) return false;
  S.shots = [];
  S.seqStart = now;
  S.lastDmg = 0;
  for (const w of WEAPONS) {
    for (let i = 0; i < w.n; i++) {
      S.shots.push({ w, i, t0: now + w.start + i * w.gap, loc: pickLoc(), started: false, hit: false });
    }
  }
  return true;
}

// A laser lands almost at once; everything else lands when its projectile arrives.
function impactTime(s) { return s.w.id === 'laser' ? s.t0 + 0.05 : s.t0 + s.w.dur; }

function applyHit(s, now) {
  const before = S.armour[s.loc];
  S.armour[s.loc] = Math.max(0, before - s.w.dmg);
  S.flashUntil[s.loc] = now + 0.18;
  S.lastDmg += s.w.dmg;
  S.log.unshift(`${s.w.label.padEnd(5)} ${s.loc}  -${s.w.dmg}` + (before > 0 && S.armour[s.loc] === 0 ? '  ARMOUR GONE' : ''));
  if (S.log.length > 9) S.log.length = 9;
}

// hooks = { onStart(shot, now), onImpact(shot, now) } supplied by each mockup.
function stepShots(now, hooks) {
  for (const s of S.shots) {
    if (!s.started && now >= s.t0) {
      s.started = true;
      S.heat = Math.min(HEAT_MAX, S.heat + s.w.heat);
      hooks.onStart(s, now);
    }
    if (s.started && !s.hit && now >= impactTime(s)) {
      s.hit = true;
      applyHit(s, now);
      hooks.onImpact(s, now);
    }
  }
}

// ---- particles ----
function spark(x, y, n, speed) {
  const cols = ['#ffffff', '#ffe066', '#ff9f1c', '#ff5a2a'];
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), v = rand(0.2, 1) * speed;
    S.parts.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3,
                   life: 0, max: rand(0.3, 0.8), c: cols[(Math.random() * cols.length) | 0] });
  }
}
function puff(x, y) {
  S.parts.push({ kind: 'smoke', x, y, vx: rand(-12, 12), vy: rand(-40, -15), life: 0, max: rand(0.6, 1.1), r: rand(3, 7) });
}
function flashAt(x, y, r) { S.parts.push({ kind: 'flash', x, y, vx: 0, vy: 0, life: 0, max: 0.1, r }); }
function boom(x, y, size, now) {
  spark(x, y, 14, 260 * size);
  flashAt(x, y, 18 * size);
  S.rings.push({ x, y, t0: now, max: 34 * size });
}
function addFloat(x, y, text, now) { S.floats.push({ x, y, text, t0: now }); }

function stepWorld(dt) {
  for (const p of S.parts) {
    p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 'spark') p.vy += 420 * dt;
  }
  S.parts = S.parts.filter(p => p.life < p.max);
  S.heat = Math.max(0, S.heat - dt * 1.2);
  S.shake = Math.max(0, S.shake - dt * 30);
}

function drawParts(g) {
  for (const p of S.parts) {
    const a = 1 - p.life / p.max;
    g.globalAlpha = a;
    if (p.kind === 'spark') { g.fillStyle = p.c; g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
    else if (p.kind === 'smoke') {
      g.globalAlpha = a * 0.5; g.fillStyle = '#9aa0a8';
      g.beginPath(); g.arc(p.x, p.y, p.r * (1 + p.life * 2), 0, Math.PI * 2); g.fill();
    } else { g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill(); }
  }
  g.globalAlpha = 1;
}

function drawRings(g, now) {
  S.rings = S.rings.filter(r => now - r.t0 < 0.4);
  for (const r of S.rings) {
    const age = (now - r.t0) / 0.4;
    g.strokeStyle = `rgba(255,180,60,${1 - age})`;
    g.lineWidth = 3;
    g.beginPath(); g.arc(r.x, r.y, r.max * age, 0, Math.PI * 2); g.stroke();
  }
}

function drawFloats(g, now) {
  S.floats = S.floats.filter(f => now - f.t0 < 1);
  g.font = FONT; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = '#000';
  for (const f of S.floats) {
    const age = now - f.t0;
    g.globalAlpha = 1 - age;
    g.strokeText(f.text, f.x, f.y - age * 40);
    g.fillStyle = '#fff';
    g.fillText(f.text, f.x, f.y - age * 40);
  }
  g.globalAlpha = 1; g.textAlign = 'left';
}

// ---- HUD ----
function panel(g, x, y, w, h) {
  g.fillStyle = 'rgba(5,11,30,0.72)';
  g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(159,178,200,0.4)';
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function drawDoll(g, x, y, k) {
  g.font = FONT; g.fillStyle = '#9fb2c8'; g.textAlign = 'left';
  g.fillText('TARGET ARMOUR', x, y - 8);
  for (const key in LOCS) {
    const [rx, ry, rw, rh] = LOCS[key].r;
    const f = S.armour[key] / LOCS[key].max;
    g.fillStyle = f > 0.66 ? '#2f9e63' : f > 0.33 ? '#c9a227' : f > 0 ? '#d1642a' : '#a82828';
    const px = x + (rx - 3) * k, py = y + (ry - 4) * k;
    g.fillRect(px, py, rw * k - 1, rh * k - 1);
    g.fillStyle = '#fff'; g.font = 'bold 10px ui-monospace, Menlo, monospace'; g.textAlign = 'center';
    g.fillText(String(S.armour[key]), px + (rw * k) / 2, py + (rh * k) / 2 + 4);
  }
  g.textAlign = 'left';
}

function drawLog(g, x, y) {
  g.font = '12px ui-monospace, Menlo, monospace'; g.textAlign = 'left';
  S.log.forEach((line, i) => {
    g.globalAlpha = 1 - i * 0.09;
    g.fillStyle = line.includes('GONE') ? '#ff7b6b' : '#d8e4f2';
    g.fillText(line, x, y + i * 15);
  });
  g.globalAlpha = 1;
}

function drawHeat(g, x, y, w) {
  const f = S.heat / HEAT_MAX;
  g.font = FONT; g.fillStyle = '#9fb2c8'; g.textAlign = 'left';
  g.fillText('HEAT', x, y - 6);
  rect(g, '#1a2233', x, y, w, 10);
  rect(g, f > 0.7 ? '#e0452b' : f > 0.4 ? '#e8a13a' : '#4fb3d9', x, y, w * f, 10);
  g.strokeStyle = '#9fb2c8'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, 9);
}

function bindControls(fire) {
  addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); fire(); }
    if (e.code === 'KeyR') resetArmour();
  });
  addEventListener('pointerdown', fire);
  // ?auto fires once on load, so the page can be captured without a keyboard.
  if (location.search.includes('auto')) setTimeout(fire, 300);
}
