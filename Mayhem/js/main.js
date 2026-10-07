'use strict';

// Wiring: keyboard, mouse and the frame loop. The game itself is in ui.js (flow) and rules.js (rules).

const params = new URLSearchParams(location.search);

function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (VIEW_W / r.width), y: (e.clientY - r.top) * (VIEW_H / r.height) };
}

window.addEventListener('keydown', (e) => {
  Sound.init();
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const used = app.handler && app.handler.onKey ? app.handler.onKey(e.key, e) : false;
  if (used || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Tab'].includes(e.key)) e.preventDefault();
  if (!used && (e.key === 'm' || e.key === 'M')) Sound.muted = !Sound.muted;
});

canvas.addEventListener('mousemove', (e) => {
  const p = canvasPoint(e);
  app.hoverCell = app.overlay && app.overlay.kind !== 'gameOver' ? null : cellFromPx(p.x, p.y);
  if (app.handler && app.handler.onMove) app.handler.onMove(p.x, p.y);
});
canvas.addEventListener('mouseleave', () => { app.hoverCell = null; });
canvas.addEventListener('mousedown', (e) => {
  Sound.init();
  e.preventDefault();
  const p = canvasPoint(e);
  if (app.handler && app.handler.onClick) app.handler.onClick(p.x, p.y);
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

// The game runs at a steady 60 steps a second whatever the screen refresh rate.
const STEP_MS = 1000 / 60;
let last = performance.now(), acc = 0;
function step() {
  app.tick++;
  updateSleepers(STEP_MS);
  updateViews();
  updateEffects();
  updateApp();
}
function frame(now) {
  acc += Math.min(now - last, 100);
  last = now;
  while (acc >= STEP_MS) { step(); acc -= STEP_MS; }
  try {
    musicUpdate(app.mode === 'title' || app.mode === 'setup');
    render();
  } catch (err) {
    failFlow(err);
  }
  requestAnimationFrame(frame);
}

if (!params.has('norun')) { // tests load the page without starting the game
  mainFlow().catch(failFlow);
  requestAnimationFrame(frame);
}
