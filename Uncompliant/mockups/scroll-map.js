'use strict';

// A throwaway mockup of a scrollable map: a big hex grid, the game's real sprites at the game's real size, and a camera you can drag, wheel,
// key or minimap around. No battle, no rules: eight stand-in mechs, a selection, an aim line with a range readout and edge arrows.
//   drag / wheel / arrows or WASD   scroll        minimap click or drag   jump there     E   edge-of-screen scrolling on or off
//   click a mech or TAB             select it     F   the camera follows the selection  M   minimap on or off
// Open it straight from disk, or add ?x=0&y=0&sel=P4&hover=E4 (view position in pixels, a mech id) for a screenshot.

(() => { // everything inside one function so none of its names can clash with the game's own globals
const COLS = 31, ROWS = 20;
const VX = 0, VY = MAP_TOP, VW = MAP_AREA_W, VH = VIEW_H - 40 - MAP_TOP; // the viewport: the game's map area
const R = HEX_R, SQ3 = Math.sqrt(3);
const MAP_W = R * (1.5 * (COLS - 1) + 2), MAP_H = R * SQ3 * (ROWS + 0.5);
const REACH = 9; // a laser's longest reach, drawn as a ring round the selected mech

// ---------- the map: deterministic, from the game's terrain letters ----------
function buildRows() {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const g = Array.from({ length: ROWS }, () => Array(COLS).fill('.'));
  const put = (c, r, ch) => { if (c >= 0 && r >= 0 && c < COLS && r < ROWS) g[r][c] = ch; };
  const disc = (cx, cy, rad, ch) => { for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (hexDist(c, r, cx, cy) <= rad) put(c, r, ch); };
  disc(15, 10, 5, '~'); disc(15, 10, 2, '.');                                  // a lake with an island
  for (let c = 6; c < 26; c++) for (const r of [2, 3, 16, 17]) if (rnd() < 0.55) put(c, r, 'H'); // ridges north and south
  for (let c = 21; c < 30; c++) for (let r = 1; r < 8; r++) if ((c % 4 !== 0) && (r % 3 !== 0)) put(c, r, 'B'); // a city block in the north east
  for (let c = 0; c < 9; c++) for (let r = 13; r < 20; r++) if (rnd() < 0.3) put(c, r, 'M');                       // peaks in the south west
  for (let i = 0; i < 90; i++) { const c = Math.floor(rnd() * COLS), r = Math.floor(rnd() * ROWS); if (g[r][c] === '.') g[r][c] = 'T'; }
  for (let i = 0; i < 25; i++) { const c = Math.floor(rnd() * COLS), r = Math.floor(rnd() * ROWS); if (g[r][c] === '.') g[r][c] = 'R'; }
  return g;
}

const MECHS = [
  { id: 'P1', side: 'player', chassisId: 5, pos: [3, 4], facing: 2 }, { id: 'P2', side: 'player', chassisId: 2, pos: [2, 10], facing: 2 },
  { id: 'P3', side: 'player', chassisId: 1, pos: [4, 16], facing: 1 }, { id: 'P4', side: 'player', chassisId: 3, pos: [11, 8], facing: 2 },
  { id: 'E1', side: 'enemy', chassisId: 6, pos: [27, 9], facing: 5 }, { id: 'E2', side: 'enemy', chassisId: 3, pos: [28, 15], facing: 5 },
  { id: 'E3', side: 'enemy', chassisId: 1, pos: [24, 17], facing: 4 }, { id: 'E4', side: 'enemy', chassisId: 4, pos: [19, 11], facing: 5 },
].map(m => Object.assign(m, { alive: true }));

const rows = buildRows().map(r => r.slice());
for (const m of MECHS) rows[m.pos[1]][m.pos[0]] = '.';
const tiles = rows.map(r => r.join(''));

// ---------- drawing the whole map once ----------
const origin = [R, R * SQ3 / 2];
function hexXY(c, r) { const [ux, uy] = hexCentre(c, r); return [origin[0] + ux * R, origin[1] + uy * R]; } // a hex's centre on the big map picture
const mapCanvas = makeCanvas(Math.ceil(MAP_W), Math.ceil(MAP_H), g => {
  g.fillStyle = COLOURS.bg; g.fillRect(0, 0, MAP_W, MAP_H);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const [x, y] = hexXY(c, r); drawTerrainHex(g, hexPathOn, tiles[r][c], c, r, x, y, R); }
});
const MINI_SCALE = 0.15, MINI_W = Math.round(MAP_W * MINI_SCALE), MINI_H = Math.round(MAP_H * MINI_SCALE);
const MINI_X = VX + 10, MINI_Y = VY + VH - MINI_H - 10;
const miniCanvas = makeCanvas(MINI_W, MINI_H, g => { g.imageSmoothingEnabled = true; g.drawImage(mapCanvas, 0, 0, MINI_W, MINI_H); });

// ---------- state ----------
const canvas = document.getElementById('c'), g = canvas.getContext('2d');
const q = new URLSearchParams(location.search);
const view = { x: Number(q.get('x') || 0), y: Number(q.get('y') || 0), tx: 0, ty: 0 };
view.tx = view.x; view.ty = view.y;
const st = { sel: q.get('sel') || 'P4', follow: true, edge: false, mini: true, mouse: [0, 0], inside: false, dragging: false, dragFrom: null, moved: false, keys: new Set(), fps: 0, hoverHex: null, hoverMech: null };
if (q.get('hover')) st.fakeHover = q.get('hover');

function clampView() {
  view.x = Math.max(0, Math.min(MAP_W - VW, view.x)); view.y = Math.max(0, Math.min(MAP_H - VH, view.y));
  view.tx = Math.max(0, Math.min(MAP_W - VW, view.tx)); view.ty = Math.max(0, Math.min(MAP_H - VH, view.ty));
}
function screenXY(c, r) { const [x, y] = hexXY(c, r); return [x - view.x + VX, y - view.y + VY]; }
function onScreen(x, y, pad) { return x >= VX - pad && x <= VX + VW + pad && y >= VY - pad && y <= VY + VH + pad; }
function mechById(id) { return MECHS.find(m => m.id === id); }
function hexAtScreen(sx, sy) {
  let best = null;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const [x, y] = screenXY(c, r), d = (x - sx) ** 2 + (y - sy) ** 2;
    if (d < R * R && (!best || d < best.d)) best = { c, r, d };
  }
  return best && [best.c, best.r];
}
function centreOn(mech) { const [x, y] = hexXY(mech.pos[0], mech.pos[1]); view.tx = x - VW / 2; view.ty = y - VH / 2; clampView(); }
function select(id) { st.sel = id; if (st.follow) centreOn(mechById(id)); }

// ---------- input ----------
function pointer(e) { const b = canvas.getBoundingClientRect(); return [(e.clientX - b.left) * 1024 / b.width, (e.clientY - b.top) * 688 / b.height]; }
function inViewport(p) { return p[0] >= VX && p[0] < VX + VW && p[1] >= VY && p[1] < VY + VH; }
function inMini(p) { return st.mini && p[0] >= MINI_X && p[0] < MINI_X + MINI_W && p[1] >= MINI_Y && p[1] < MINI_Y + MINI_H; }
function jumpFromMini(p) { view.tx = (p[0] - MINI_X) / MINI_SCALE - VW / 2; view.ty = (p[1] - MINI_Y) / MINI_SCALE - VH / 2; clampView(); st.follow = false; }

canvas.addEventListener('mousedown', e => {
  const p = pointer(e);
  if (inMini(p)) { st.miniDrag = true; jumpFromMini(p); return; }
  if (inViewport(p)) { st.dragging = true; st.moved = false; st.dragFrom = { p, x: view.x, y: view.y }; canvas.classList.add('dragging'); }
});
addEventListener('mousemove', e => {
  const p = pointer(e); st.mouse = p; st.inside = inViewport(p);
  if (st.miniDrag) { jumpFromMini(p); return; }
  if (st.dragging) {
    const dx = p[0] - st.dragFrom.p[0], dy = p[1] - st.dragFrom.p[1];
    if (Math.abs(dx) + Math.abs(dy) > 4) st.moved = true;
    if (st.moved) { view.x = view.tx = st.dragFrom.x - dx; view.y = view.ty = st.dragFrom.y - dy; clampView(); st.follow = false; }
  }
});
addEventListener('mouseup', e => {
  const p = pointer(e);
  if (st.dragging && !st.moved && inViewport(p)) { // a click, not a drag: select the mech under the cursor
    const h = hexAtScreen(p[0], p[1]);
    const m = h && MECHS.find(x => x.pos[0] === h[0] && x.pos[1] === h[1]);
    if (m) { st.follow = true; select(m.id); }
  }
  st.dragging = false; st.miniDrag = false; canvas.classList.remove('dragging');
});
canvas.addEventListener('wheel', e => { e.preventDefault(); view.x += e.deltaX; view.y += e.deltaY; view.tx = view.x; view.ty = view.y; clampView(); st.follow = false; }, { passive: false });
addEventListener('keydown', e => {
  if (e.code === 'Tab') { e.preventDefault(); const i = MECHS.findIndex(m => m.id === st.sel); st.follow = true; select(MECHS[(i + 1) % MECHS.length].id); return; }
  if (e.code === 'KeyF') { st.follow = !st.follow; if (st.follow) centreOn(mechById(st.sel)); return; }
  if (e.code === 'KeyE') { st.edge = !st.edge; return; }
  if (e.code === 'KeyM') { st.mini = !st.mini; return; }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) { e.preventDefault(); st.keys.add(e.code); }
});
addEventListener('keyup', e => st.keys.delete(e.code));

// ---------- one frame ----------
let last = null, fpsAcc = 0, fpsN = 0;
function step(dt) {
  const speed = 700; // pixels a second when a key is held
  let dx = 0, dy = 0;
  if (st.keys.has('ArrowLeft') || st.keys.has('KeyA')) dx -= 1;
  if (st.keys.has('ArrowRight') || st.keys.has('KeyD')) dx += 1;
  if (st.keys.has('ArrowUp') || st.keys.has('KeyW')) dy -= 1;
  if (st.keys.has('ArrowDown') || st.keys.has('KeyS')) dy += 1;
  if (st.edge && st.inside && !st.dragging) { // the mouse near the edge of the viewport nudges the view that way
    const m = st.mouse, band = 28;
    if (m[0] < VX + band) dx -= 1; else if (m[0] > VX + VW - band) dx += 1;
    if (m[1] < VY + band) dy -= 1; else if (m[1] > VY + VH - band) dy += 1;
  }
  if (dx || dy) { view.x += dx * speed * dt; view.y += dy * speed * dt; view.tx = view.x; view.ty = view.y; clampView(); st.follow = false; }
  else { const k = Math.min(1, dt * 7); view.x += (view.tx - view.x) * k; view.y += (view.ty - view.y) * k; } // glide to a target (follow, minimap)
}

function drawArrow(x, y, ang, colour) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.fillStyle = colour; g.strokeStyle = '#000'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(10, 0); g.lineTo(-7, -8); g.lineTo(-7, 8); g.closePath(); g.stroke(); g.fill();
  g.restore();
}

function draw(clock) {
  g.fillStyle = COLOURS.bg; g.fillRect(0, 0, 1024, 688);
  g.save();
  g.beginPath(); g.rect(VX, VY, VW, VH); g.clip();
  g.drawImage(mapCanvas, view.x, view.y, VW, VH, VX, VY, VW, VH);

  const sel = mechById(st.sel);
  const hm = st.fakeHover ? mechById(st.fakeHover) : (st.hoverMech || null);
  // the reach ring: every hex exactly REACH hexes from the selected mech
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const d = hexDist(c, r, sel.pos[0], sel.pos[1]);
    if (d !== REACH) continue;
    const [x, y] = screenXY(c, r);
    if (onScreen(x, y, R)) { hexPathOn(g, x, y, R - 3); g.strokeStyle = 'rgba(255,210,74,0.55)'; g.lineWidth = 2; g.stroke(); }
  }
  // the aim line to the mech under the cursor
  if (hm && hm !== sel) {
    const a = screenXY(...sel.pos), b = screenXY(...hm.pos);
    g.setLineDash([8, 6]); g.strokeStyle = '#ff5a4a'; g.lineWidth = 3; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.setLineDash([]);
    const d = hexDist(sel.pos[0], sel.pos[1], hm.pos[0], hm.pos[1]);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    g.font = FONT; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = '#000'; g.fillStyle = d <= REACH ? '#7ee08a' : '#ff9a8a';
    const text = `${sel.id} > ${hm.id}   ${d} hexes${d <= REACH ? '' : '  OUT OF REACH'}`;
    g.strokeText(text, mx, my - 8); g.fillText(text, mx, my - 8); g.textAlign = 'left';
  }
  // the mechs (the game's own drawing and size)
  for (const m of MECHS) {
    const [x, y] = screenXY(...m.pos);
    if (!onScreen(x, y, R * 2)) continue;
    if (m === sel) { const pulse = Math.sin(clock * 7); hexPathOn(g, x, y, R - 1); g.fillStyle = `rgba(255,255,255,${0.10 + 0.06 * pulse})`; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 3 + pulse * 1.2; g.stroke(); }
    drawMechAt(g, m, x, y, m.facing, 1, false);
    g.font = FONT_SMALL; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = '#000'; g.fillStyle = m.side === 'player' ? COLOURS.player : COLOURS.enemy;
    g.strokeText(m.id, x, y - R + 10); g.fillText(m.id, x, y - R + 10); g.textAlign = 'left';
  }
  // arrows at the edge for mechs that are off screen
  for (const m of MECHS) {
    const [x, y] = screenXY(...m.pos);
    if (onScreen(x, y, R * 0.5)) continue;
    const cx = VX + VW / 2, cy = VY + VH / 2, dx = x - cx, dy = y - cy;
    const k = Math.min((VW / 2 - 16) / Math.abs(dx || 1e-9), (VH / 2 - 16) / Math.abs(dy || 1e-9));
    drawArrow(cx + dx * k, cy + dy * k, Math.atan2(dy, dx), m.side === 'player' ? COLOURS.player : COLOURS.enemy);
  }
  g.restore();

  // the minimap
  if (st.mini) {
    g.globalAlpha = 0.9; g.drawImage(miniCanvas, MINI_X, MINI_Y); g.globalAlpha = 1;
    g.strokeStyle = COLOURS.panelEdge; g.lineWidth = 1; g.strokeRect(MINI_X - 0.5, MINI_Y - 0.5, MINI_W + 1, MINI_H + 1);
    for (const m of MECHS) { const [x, y] = hexXY(...m.pos); g.fillStyle = m.side === 'player' ? COLOURS.player : COLOURS.enemy; g.fillRect(MINI_X + x * MINI_SCALE - 2, MINI_Y + y * MINI_SCALE - 2, 4, 4); if (m === sel) { g.strokeStyle = '#fff'; g.strokeRect(MINI_X + x * MINI_SCALE - 3.5, MINI_Y + y * MINI_SCALE - 3.5, 7, 7); } }
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(MINI_X + view.x * MINI_SCALE, MINI_Y + view.y * MINI_SCALE, VW * MINI_SCALE, VH * MINI_SCALE);
  }

  // header and the right-hand panel
  g.textAlign = 'left'; g.font = FONT_SMALL; g.fillStyle = COLOURS.dim;
  g.fillText(`UNCOMPLIANT   SCROLL MOCKUP   MAP ${COLS} x ${ROWS} HEXES   (the map area shows about 19 x 12)`, 16, 22);
  g.font = 'bold 22px ' + MONO; g.fillStyle = COLOURS.player; g.fillText('SCROLL', 16, 50);
  g.font = FONT; g.fillStyle = COLOURS.warn; g.fillText('Drag the map, use the wheel, arrows / WASD, or click the minimap. Click a mech or TAB to select; hover another to aim.', 16, 70);
  panel(g, 806, MAP_TOP, 202, 568);
  const lines = [
    ['VIEW', `${Math.round(view.x)}, ${Math.round(view.y)} px`], ['MAP', `${Math.round(MAP_W)} x ${Math.round(MAP_H)} px`], ['SHOWN', `${Math.round(100 * VW * VH / (MAP_W * MAP_H))}% of the map`],
    ['SELECTED', st.sel], ['HEX', st.hoverHex ? st.hoverHex.join(', ') + ' ' + TERRAIN[tiles[st.hoverHex[1]][st.hoverHex[0]]].name : '-'],
    ['AIM', hm && hm !== sel ? `${sel.id} > ${hm.id}  ${hexDist(sel.pos[0], sel.pos[1], hm.pos[0], hm.pos[1])} hexes` : '-'],
    ['FOLLOW', st.follow ? 'on (F)' : 'off (F)'], ['EDGE SCROLL', st.edge ? 'on (E)' : 'off (E)'], ['MINIMAP', st.mini ? 'on (M)' : 'off (M)'], ['FPS', String(st.fps)],
  ];
  g.font = FONT_SMALL;
  lines.forEach(([k, v], i) => { g.fillStyle = COLOURS.dim; g.fillText(k, 818, MAP_TOP + 28 + i * 34); g.fillStyle = COLOURS.text; g.font = FONT; g.fillText(v, 818, MAP_TOP + 44 + i * 34, 180); g.font = FONT_SMALL; });
  g.fillStyle = COLOURS.dim; g.fillText('Same hexes and sprites', 818, MAP_TOP + 28 + lines.length * 34 + 8); g.fillText('as the game, just a', 818, MAP_TOP + 28 + lines.length * 34 + 22); g.fillText('bigger map.', 818, MAP_TOP + 28 + lines.length * 34 + 36);
  g.fillStyle = COLOURS.dim; g.fillText('Gold ring: a laser\'s longest reach (9 hexes) from the selected mech.', 16, VIEW_H - 14);
}

function frame(t) {
  const dt = last === null ? 0 : Math.min(0.05, (t - last) / 1000); last = t;
  fpsAcc += dt; fpsN++; if (fpsAcc >= 0.5) { st.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  step(dt);
  if (st.inside) { st.hoverHex = hexAtScreen(st.mouse[0], st.mouse[1]); st.hoverMech = st.hoverHex && MECHS.find(m => m.pos[0] === st.hoverHex[0] && m.pos[1] === st.hoverHex[1]) || null; } else { st.hoverHex = null; st.hoverMech = null; }
  draw(t / 1000);
  requestAnimationFrame(frame);
}
clampView();
if (q.get('x') === null && q.get('y') === null) centreOn(mechById(st.sel));
if (q.get('x') !== null || q.get('y') !== null) { view.tx = view.x; view.ty = view.y; }
requestAnimationFrame(frame);

})();
