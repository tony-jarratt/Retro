'use strict';

// Particles, explosion rings and floating numbers, ported from mockup B. Purely visual: nothing here touches the
// rules or the state, and the random numbers are Math.random (the fight itself is seeded; the sparks need not be).
// Time is in seconds, taken from the game clock, so the effects freeze and speed up with it.

const FX = { parts: [], rings: [], floats: [], shake: 0 };

function rand(a, b) { return a + Math.random() * (b - a); }
function lerp(a, b, t) { return a + (b - a) * t; }

function fxReset() { FX.parts.length = 0; FX.rings.length = 0; FX.floats.length = 0; FX.shake = 0; }

function fxSpark(x, y, n, speed) {
  const colours = ['#ffffff', '#ffe066', '#ff9f1c', '#ff5a2a'];
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), v = rand(0.2, 1) * speed;
    FX.parts.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life: 0, max: rand(0.3, 0.8), c: colours[(Math.random() * colours.length) | 0] });
  }
}

function fxPuff(x, y) {
  FX.parts.push({ kind: 'smoke', x, y, vx: rand(-12, 12), vy: rand(-40, -15), life: 0, max: rand(0.6, 1.1), r: rand(3, 7) });
}

function fxFlash(x, y, r) { FX.parts.push({ kind: 'flash', x, y, vx: 0, vy: 0, life: 0, max: 0.1, r }); }

function fxBoom(x, y, size, now) {
  fxSpark(x, y, Math.round(14 * size), 260 * size);
  fxFlash(x, y, 18 * size);
  FX.rings.push({ x, y, t0: now, max: 34 * size });
}

function fxFloat(x, y, text, now, colour) { FX.floats.push({ x, y, text, t0: now, colour: colour || '#ffffff' }); }

function fxShake(amount) { FX.shake = Math.min(12, FX.shake + amount); }

function fxStep(dt) {
  for (const p of FX.parts) {
    p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 'spark') p.vy += 420 * dt;
  }
  FX.parts = FX.parts.filter(p => p.life < p.max);
  FX.shake = Math.max(0, FX.shake - dt * 30);
}

function fxDraw(g, now) {
  for (const p of FX.parts) {
    const a = 1 - p.life / p.max;
    g.globalAlpha = a;
    if (p.kind === 'spark') { g.fillStyle = p.c; g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
    else if (p.kind === 'smoke') {
      g.globalAlpha = a * 0.5; g.fillStyle = '#9aa0a8';
      g.beginPath(); g.arc(p.x, p.y, p.r * (1 + p.life * 2), 0, Math.PI * 2); g.fill();
    } else { g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill(); }
  }
  g.globalAlpha = 1;

  FX.rings = FX.rings.filter(r => now - r.t0 < 0.4);
  for (const r of FX.rings) {
    const age = (now - r.t0) / 0.4;
    g.strokeStyle = `rgba(255,180,60,${1 - age})`; g.lineWidth = 3;
    g.beginPath(); g.arc(r.x, r.y, r.max * age, 0, Math.PI * 2); g.stroke();
  }

  FX.floats = FX.floats.filter(f => now - f.t0 < 1.1);
  g.font = 'bold 13px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = '#000';
  for (const f of FX.floats) {
    const age = now - f.t0;
    g.globalAlpha = Math.max(0, 1 - age / 1.1);
    g.strokeText(f.text, f.x, f.y - age * 36);
    g.fillStyle = f.colour; g.fillText(f.text, f.x, f.y - age * 36);
  }
  g.globalAlpha = 1; g.textAlign = 'left';
}
