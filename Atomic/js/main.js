'use strict';

const params = new URLSearchParams(location.search);

function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (VIEW_W / r.width), y: (e.clientY - r.top) * (VIEW_H / r.height) };
}

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const used = onKeyDown(e.key);
  if (used || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Tab'].includes(e.key)) e.preventDefault();
  if (!used && (e.key === 'm' || e.key === 'M')) Sound.muted = !Sound.muted;
});
window.addEventListener('keyup', (e) => onKeyUp(e.key));
window.addEventListener('blur', () => { app.held = []; if (app.mode === 'play') app.mode = 'paused'; });
canvas.addEventListener('mousedown', (e) => { e.preventDefault(); const p = canvasPoint(e); onClick(p.x, p.y); });
window.addEventListener('contextmenu', (e) => e.preventDefault());

// A steady 60 steps a second whatever the screen refresh rate.
const STEP_MS = 1000 / 60;
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(now - last, 100);
  last = now;
  try {
    while (acc >= STEP_MS) { stepGame(STEP_MS / 1000); acc -= STEP_MS; }
    musicUpdate(app.mode === 'title' || app.mode === 'help' || app.mode === 'brief');
    render();
  } catch (err) {
    app.fatal = err; console.error(err);
  }
  requestAnimationFrame(frame);
}
if (!params.has('norun')) requestAnimationFrame(frame); // tests load the page without starting the loop
