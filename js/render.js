'use strict';

// Drawing. Reads the game state and never changes it. Everything on the map goes through hexToScreen /
// screenToHex, so the overhead view could be swapped for a tilted one later without touching rules or tests.

const VIEW_W = 1024, VIEW_H = 688;
const HEX_R = 26;                  // hex radius in pixels (the map is 19 by 12 hexes and has to fit beside the unit panel)
const HEX_SCALE = HEX_R / 34;      // the art and the pixel offsets below were drawn for a radius of 34
const MAP_AREA_W = VIEWPORT.w;     // the map area is the left part of the screen (the unit panel is on the right); view.js has its size
const MAP_TOP = VIEWPORT.y;        // room above the map for the header, the banner and the instruction line
const MECH_SCALE = 1.4;            // sprite pixels to screen pixels (the 40 pixel sprite canvas is about 56 pixels on screen)
// Per class: how far from the centre a mech's guns sit (sideways and forward, in sprite pixels at the old size) and
// how much to shrink the biggest sprite so it still fits its hex.
const CLASS_LOOK = { light: { side: 11, fwd: 16, scale: 1 }, medium: { side: 15, fwd: 20, scale: 1 }, heavy: { side: 18, fwd: 22, scale: 0.97 }, assault: { side: 21, fwd: 24, scale: 0.9 } };
function classOf(mech) { return chassisById(mech.chassisId).cls; }
const FONT = 'bold 13px ui-monospace, Menlo, Consolas, monospace';
const FONT_SMALL = '11px ui-monospace, Menlo, Consolas, monospace';
const MONO = 'ui-monospace, Menlo, Consolas, monospace';

const COLOURS = {
  bg: '#101a2c', panel: 'rgba(5,11,30,0.78)', panelEdge: 'rgba(159,178,200,0.4)', text: '#d8e4f2', dim: '#9fb2c8',
  player: '#4fb3d9', enemy: '#ff5a4a', walk: 'rgba(79,179,217,0.30)', walkEdge: 'rgba(79,179,217,0.9)',
  run: 'rgba(232,161,58,0.28)', runEdge: 'rgba(232,161,58,0.9)', hover: 'rgba(255,255,255,0.18)', warn: '#ffd24a',
  aim: 'rgba(255,90,74,0.9)', aimFill: 'rgba(255,90,74,0.22)', held: '#8a93a3',
};
const MECH_LINE_COLOURS = ['#4fb3d9', '#ffd24a', '#c58bff', '#7ee08a']; // one per player mech, for aim lines

let mapLayout = null;              // layoutFor(...) of the map on screen (view.js), set by buildMapCanvas
let drawHeist = false;             // the battle is a heist: a carrier shows the crate, not a flag; set by drawFrame
let drawClock = 0;                 // the frame's clock, for sprites that animate (the dropship's engines); set by drawFrame
let mapScroll = { x: 0, y: 0 };    // how far the map's picture is scrolled in the viewport (0, 0 for a map that fits)
let mapCanvas = null;               // the whole map, drawn once
let miniCanvas = null;              // a small copy of it for the minimap

function setMapScroll(x, y) { const s = clampScroll(mapLayout, x, y); mapScroll = { x: Math.round(s.x), y: Math.round(s.y) }; } // whole pixels, so the picture is never resampled

function hexPathOn(g, x, y, radius) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 3 * i;
    g[i ? 'lineTo' : 'moveTo'](x + radius * Math.cos(a), y + radius * Math.sin(a));
  }
  g.closePath();
}

// ---------- the projection layer ----------
// The one place that knows how a hex becomes a point on the screen, and back.
function hexToScreen(c, r) {
  const [px, py] = hexInPicture(mapLayout, c, r); // the hex in the map's picture, from view.js
  return pictureToScreen(mapLayout, mapScroll, px, py);
}

// The map hex under a screen point, or null if the point is off the map. Nearest centre wins: with 100-odd
// hexes there is no need for anything cleverer.
function screenToHex(map, x, y) {
  if (!inViewport(x, y)) return null; // the unit panel, the header and the help are not the map
  let best = null;
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const [hx, hy] = hexToScreen(c, r);
      const d = (hx - x) * (hx - x) + (hy - y) * (hy - y);
      if (!best || d < best.d) best = { c, r, d };
    }
  }
  if (!best || best.d > HEX_R * HEX_R) return null; // beyond the inscribed circle is a gap or off the map
  return [best.c, best.r];
}

// Builds the layout and draws the terrain once into an offscreen canvas.
function buildMapCanvas(map) {
  mapLayout = layoutFor(map.cols, map.rows, HEX_R);
  mapScroll = { x: 0, y: 0 };
  miniCanvas = null;
  mapCanvas = makeCanvas(Math.ceil(mapLayout.w + 2 * mapLayout.pad), Math.ceil(mapLayout.h + 2 * mapLayout.pad), g => {
    g.fillStyle = COLOURS.bg; g.fillRect(0, 0, mapLayout.w + 2 * mapLayout.pad, mapLayout.h + 2 * mapLayout.pad);
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        const [x, y] = hexInPicture(mapLayout, c, r);
        drawTerrainHex(g, hexPathOn, map.tiles[r][c], c, r, x, y, HEX_R);
      }
    }
  });
}

// The minimap's picture: the whole map, shrunk (built the first time it is wanted, and again after a new map is built).
function miniPicture() {
  const geo = miniGeometry(mapLayout);
  if (!miniCanvas) {
    miniCanvas = makeCanvas(geo.w, geo.h, g => {
      g.imageSmoothingEnabled = true;
      g.drawImage(mapCanvas, mapLayout.pad, mapLayout.pad, mapLayout.w, mapLayout.h, 0, 0, geo.w, geo.h);
    });
  }
  return { geo, picture: miniCanvas };
}

// The minimap in the corner of the viewport: the terrain, the goal's markers, every living mech as a dot, and a rectangle for what is on screen.
// Only drawn for a map bigger than the viewport (a map that fits has nothing to scroll to).
function minimapShown(view) { return !!view.minimap && !!mapLayout && (mapLayout.maxX > 0 || mapLayout.maxY > 0); }

function drawMinimap(g, state, view) {
  if (!minimapShown(view)) return;
  const { geo, picture } = miniPicture();
  const at = (c, r) => { const [px, py] = hexInPicture(mapLayout, c, r); return [geo.x + (px - mapLayout.pad) * geo.scale, geo.y + (py - mapLayout.pad) * geo.scale]; };
  g.save();
  panel(g, SIDE_PANEL.x, geo.panelY, SIDE_PANEL.w, geo.panelH);
  g.font = FONT_SMALL; g.fillStyle = COLOURS.dim; g.textAlign = 'left'; g.fillText('MAP', SIDE_PANEL.x + 12, geo.panelY + 17);
  g.font = '9px ' + MONO; g.textAlign = 'right'; g.fillText('DRAG THE MAP OR USE THE WHEEL  M: HIDE', SIDE_PANEL.x + SIDE_PANEL.w - 10, geo.panelY + 17, SIDE_PANEL.w - 50); g.textAlign = 'left';
  g.drawImage(picture, geo.x, geo.y);
  g.strokeStyle = COLOURS.panelEdge; g.lineWidth = 1; g.strokeRect(geo.x - 0.5, geo.y - 0.5, geo.w + 1, geo.h + 1);
  const o = state.objective;
  const dot = (c, r, colour, size) => { const [x, y] = at(c, r); g.fillStyle = colour; g.fillRect(x - size / 2, y - size / 2, size, size); };
  if (o && (o.id === 'flag' || o.id === 'heist')) {
    for (const [c, r] of [...o.bases.player.slice(0, 1), ...o.bases.enemy.slice(0, 1)]) dot(c, r, '#ffffff', 3);
    if (o.flag.pos) dot(o.flag.pos[0], o.flag.pos[1], '#ffd24a', 6);
  } else if (o && o.id === 'hill') { for (const [c, r] of o.zone) dot(c, r, '#ffd24a', 3); }
  else if (o && o.id === 'exit') { for (const [c, r] of o.exits.player) dot(c, r, COLOURS.player, 3); for (const [c, r] of o.exits.enemy) dot(c, r, COLOURS.enemy, 3); }
  for (const m of livingMechs(state)) {
    const [x, y] = at(m.pos[0], m.pos[1]);
    g.fillStyle = m.side === 'player' ? COLOURS.player : COLOURS.enemy; g.fillRect(x - 2, y - 2, 4, 4);
    if (view.active === m.id) { g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(x - 3.5, y - 3.5, 7, 7); }
  }
  const rect = miniViewRect(geo, mapScroll);
  g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(geo.x + Math.max(0, rect.x - geo.x), geo.y + Math.max(0, rect.y - geo.y), Math.min(rect.w, geo.w), Math.min(rect.h, geo.h));
  g.restore();
}

// Small arrows on the viewport's edge for the mechs (and a loose flag) that are off screen, in their side's colour.
function drawEdgeArrows(g, state, view) {
  if (mapLayout.maxX === 0 && mapLayout.maxY === 0) return;
  const arrow = (c, r, colour) => {
    const [sx, sy] = hexToScreen(c, r);
    const a = edgeArrow(sx, sy);
    if (!a) return;
    g.save(); g.translate(a.x, a.y); g.rotate(a.angle);
    g.fillStyle = colour; g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(10, 0); g.lineTo(-7, -8); g.lineTo(-7, 8); g.closePath(); g.stroke(); g.fill();
    g.restore();
  };
  g.save();
  g.beginPath(); g.rect(VIEWPORT.x, VIEWPORT.y, VIEWPORT.w, VIEWPORT.h); g.clip();
  for (const m of livingMechs(state)) arrow(m.pos[0], m.pos[1], m.side === 'player' ? COLOURS.player : COLOURS.enemy);
  const o = state.objective;
  if (o && (o.id === 'flag' || o.id === 'heist') && o.flag.pos) arrow(o.flag.pos[0], o.flag.pos[1], '#ffd24a');
  g.restore();
}

// Where a weapon's shots leave a mech, on screen: a little way out from its centre towards the front, to the
// side the weapon is mounted on.
function muzzlePoint(mech, loc) {
  const [x, y] = hexToScreen(mech.pos[0], mech.pos[1]);
  const a = dirAngle(mech.facing) * Math.PI / 180;
  const fx = Math.cos(a), fy = Math.sin(a);
  const rx = -fy, ry = fx; // the mech's right-hand side
  const side = loc === 'RA' ? 1 : loc === 'LA' ? -1 : loc === 'RT' ? 0.6 : loc === 'LT' ? -0.6 : 0;
  const look = CLASS_LOOK[classOf(mech)];
  const fwd = (loc === 'RA' || loc === 'LA' ? look.fwd : loc === 'CT' ? look.fwd * 0.7 : look.fwd * 0.5) * HEX_SCALE;
  return [x + fx * fwd + rx * side * look.side * HEX_SCALE, y + fy * fwd + ry * side * look.side * HEX_SCALE];
}

// ---------- pieces ----------
function fillHex(g, c, r, fill, edge, edgeWidth) {
  const [x, y] = hexToScreen(c, r);
  hexPathOn(g, x, y, HEX_R - 1);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (edge) { g.strokeStyle = edge; g.lineWidth = edgeWidth || 2; g.stroke(); }
}

// Smoke: a haze over each hex of a cloud, thinner on its last round, with a few drifting puffs.
function drawSmoke(g, map, clock) {
  if (!map.smoke) return;
  for (const [key, left] of Object.entries(map.smoke)) {
    const [c, r] = key.split(',').map(Number);
    const [x, y] = hexToScreen(c, r);
    fillHex(g, c, r, left >= 2 ? 'rgba(200,208,218,0.55)' : 'rgba(200,208,218,0.38)', null);
    g.fillStyle = 'rgba(240,244,248,0.22)';
    for (let k = 0; k < 3; k++) {
      const a = clock * 0.4 + k * 2.1 + c * 1.3 + r;
      g.beginPath(); g.arc(x + Math.cos(a) * 9, y + Math.sin(a * 1.3) * 7, 9, 0, Math.PI * 2); g.fill();
    }
  }
}

// Repair bays: a pip for each charge under the bay, lit while it is left; a used-up bay is greyed over.
function drawRepairBays(g, map) {
  for (const [key, left] of Object.entries(map.charges || {})) {
    const [c, r] = key.split(',').map(Number);
    const [x, y] = hexToScreen(c, r);
    if (!left) fillHex(g, c, r, 'rgba(10,12,18,0.55)', null);
    const full = terrainAt(map, c, r).repair ? REPAIR_CHARGES : RESUPPLY_CHARGES;
    for (let i = 0; i < full; i++) {
      const px = x + (i - (full - 1) / 2) * 9, py = y + HEX_R * 0.62;
      g.fillStyle = '#000'; g.fillRect(px - 3.5, py - 3.5, 7, 7);
      g.fillStyle = i < left ? '#7ee08a' : '#2b3340'; g.fillRect(px - 2.5, py - 2.5, 5, 5);
    }
  }
}

// The storm (story weather, looks only): slanting rain over the map and, now and then, a lightning flash. Driven by the clock, so it is the same
// every time for the same moment.
function drawStorm(g, clock) {
  g.save();
  g.beginPath(); g.rect(VIEWPORT.x, VIEWPORT.y, VIEWPORT.w, VIEWPORT.h); g.clip();
  g.fillStyle = 'rgba(12,22,42,0.30)'; g.fillRect(VIEWPORT.x, VIEWPORT.y, VIEWPORT.w, VIEWPORT.h); // the gloom
  g.strokeStyle = 'rgba(200,220,245,0.45)'; g.lineWidth = 1.2;
  g.beginPath();
  for (let i = 0; i < 220; i++) {
    const sx = ((i * 97.3 + clock * 60) % (VIEWPORT.w + 120)) - 60 + VIEWPORT.x;
    const sy = ((i * 53.1 + clock * 520) % (VIEWPORT.h + 40)) - 20 + VIEWPORT.y;
    g.moveTo(sx, sy); g.lineTo(sx - 6, sy + 18);
  }
  g.stroke();
  const flash = (clock % 9.5) < 0.12 || ((clock + 0.25) % 9.5) < 0.06; // a double flicker every few seconds
  if (flash) { g.fillStyle = 'rgba(220,230,255,0.18)'; g.fillRect(VIEWPORT.x, VIEWPORT.y, VIEWPORT.w, VIEWPORT.h); }
  g.restore();
}

// A memory bank (the finale): a tall black cabinet of drives with rows of blinking lights, or a burnt-out shell once destroyed.
function drawBankAt(g, mech, x, y, alpha, flash) {
  const k = HEX_SCALE;
  g.save();
  g.globalAlpha = alpha === undefined ? 1 : alpha;
  g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(-14 * k, -16 * k, 34 * k, 40 * k);
  g.fillStyle = '#000'; g.fillRect(-18 * k, -24 * k, 36 * k, 44 * k);
  g.fillStyle = mech.alive ? '#1c2230' : '#2a2626'; g.fillRect(-17 * k, -23 * k, 34 * k, 42 * k);
  if (mech.alive) {
    g.fillStyle = '#2e3850'; g.fillRect(-17 * k, -23 * k, 34 * k, 4 * k);
    for (let row = 0; row < 6; row++) for (let col = 0; col < 5; col++) {
      const on = Math.sin(drawClock * (3 + ((row * 5 + col) % 7)) + row * 1.7 + col * 2.3) > 0.2;
      g.fillStyle = on ? (row % 3 === 0 ? '#ff5a4a' : '#7fd0ff') : '#16202c';
      g.fillRect((-13 + col * 6) * k, (-16 + row * 6) * k, 3 * k, 2 * k);
    }
    g.strokeStyle = COLOURS.enemy; g.lineWidth = 1.5; g.strokeRect(-17 * k, -23 * k, 34 * k, 42 * k);
    if (flash) { g.globalAlpha *= 0.6; g.fillStyle = '#fff'; g.fillRect(-17 * k, -23 * k, 34 * k, 42 * k); }
  } else {
    g.fillStyle = 'rgba(255,120,40,0.30)'; g.beginPath(); g.arc(0, 0, 8 * k, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// The dropship (story, the defend goal), seen from above, nose to the east: a delta-winged lander on four pads, lit from the north west, with a
// Republic chevron on the wings, three engines idling, and a fuel hose running to a bladder on the ground while it refuels. A broken, scorched
// hull once destroyed.
function drawShipAt(g, mech, x, y, alpha, flash, clock) {
  const k = HEX_SCALE * 1.3; // bigger than a mech: it spills over its bank
  const t = clock || 0;
  const path = pts => { g.beginPath(); pts.forEach(([px, py], i) => g[i ? 'lineTo' : 'moveTo'](px * k, py * k)); g.closePath(); };
  const wing = [[18, -4], [-14, -30], [-26, -30], [-22, -8], [-22, 8], [-26, 30], [-14, 30], [18, 4]];
  const hull = [[38, 0], [30, -6], [10, -10], [-30, -10], [-36, -6], [-36, 6], [-30, 10], [10, 10], [30, 6]];
  g.save();
  g.globalAlpha = alpha === undefined ? 1 : alpha;
  g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,0.38)'; // the shadow, offset to the south east
  g.save(); g.translate(5 * k, 7 * k); path(wing); g.fill(); path(hull); g.fill(); g.restore();
  if (!mech.alive) { // the wreck: half a wing gone, scorched, a smouldering glow
    g.fillStyle = '#2b2a2c'; path([[18, -4], [-14, -30], [-26, -30], [-22, -8], [-22, 4], [-8, 6], [6, 3]]); g.fill();
    g.fillStyle = '#3a3836'; path(hull); g.fill();
    g.fillStyle = 'rgba(255,120,40,0.35)'; g.beginPath(); g.arc(-6 * k, 2 * k, (5 + Math.sin(t * 6)) * k, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#151416'; g.lineWidth = 2; for (const [a, b] of [[-20, -6], [4, 6], [-10, 8]]) { g.beginPath(); g.moveTo(a * k, -8 * k); g.lineTo(b * k, 8 * k); g.stroke(); }
    g.restore(); return;
  }
  // the fuel hose: from the port side down to a fuel bladder on the ground, with a pulse running along it
  const hose = [[-6, 10], [-4, 22], [-14, 30], [-24, 36]];
  g.strokeStyle = '#1b1c1f'; g.lineWidth = 3.5 * k; g.beginPath(); hose.forEach(([px, py], i) => g[i ? 'lineTo' : 'moveTo'](px * k, py * k)); g.stroke();
  g.strokeStyle = '#c9a227'; g.lineWidth = 1.5 * k; g.setLineDash([3 * k, 4 * k]); g.lineDashOffset = -t * 20; g.stroke(); g.setLineDash([]);
  g.fillStyle = '#26323a'; g.beginPath(); g.ellipse(-30 * k, 38 * k, 9 * k, 6 * k, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#3d4f5c'; g.beginPath(); g.ellipse(-31 * k, 36.5 * k, 6 * k, 3.5 * k, 0, 0, Math.PI * 2); g.fill();
  // landing pads
  g.fillStyle = '#2a2c31';
  for (const [px, py] of [[-20, -22], [-20, 22], [16, -9], [16, 9]]) { g.beginPath(); g.arc(px * k, py * k, 3 * k, 0, Math.PI * 2); g.fill(); }
  // the wings: lit on the north side, darker on the south
  const wingShade = g.createLinearGradient(0, -30 * k, 0, 30 * k);
  wingShade.addColorStop(0, '#6c7a90'); wingShade.addColorStop(0.5, '#4d5a6e'); wingShade.addColorStop(1, '#343d4c');
  g.strokeStyle = '#000'; g.lineWidth = 4; path(wing); g.stroke(); path(hull); g.stroke(); // a dark outline under everything, as the mech sprites have
  g.fillStyle = wingShade; path(wing); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; // the lit leading edges
  g.beginPath(); g.moveTo(18 * k, -4 * k); g.lineTo(-14 * k, -30 * k); g.moveTo(18 * k, 4 * k); g.lineTo(-14 * k, 30 * k); g.stroke();
  g.fillStyle = '#7fd0ff'; // the Republic chevron, one on each wing
  for (const sgn of [-1, 1]) { path([[-4, 11 * sgn], [-13, 25 * sgn], [-19, 25 * sgn], [-10, 11 * sgn]]); g.fill(); }
  // the hull
  const hullShade = g.createLinearGradient(0, -10 * k, 0, 10 * k);
  hullShade.addColorStop(0, '#d4d9df'); hullShade.addColorStop(0.45, '#b3bac3'); hullShade.addColorStop(1, '#7f8792');
  g.fillStyle = hullShade; path(hull); g.fill();
  g.strokeStyle = 'rgba(30,34,40,0.55)'; g.lineWidth = 1; // panel lines
  for (const px of [-22, -10, 2]) { g.beginPath(); g.moveTo(px * k, -10 * k); g.lineTo(px * k, 10 * k); g.stroke(); }
  g.beginPath(); g.moveTo(-30 * k, 0); g.lineTo(10 * k, 0); g.stroke();
  // the cockpit glass, with a highlight
  g.fillStyle = '#16253a'; path([[34, 0], [26, -5], [16, -5], [16, 5], [26, 5]]); g.fill();
  g.fillStyle = 'rgba(160,210,255,0.55)'; path([[30, -2], [25, -4], [19, -4], [19, -2]]); g.fill();
  // the engines: three nozzles, idling with a flicker
  for (const py of [-6, 0, 6]) {
    g.fillStyle = '#2a2d33'; g.fillRect(-40 * k, (py - 2.5) * k, 5 * k, 5 * k);
    const glow = 0.45 + 0.25 * Math.sin(t * 9 + py);
    g.fillStyle = `rgba(110,190,255,${glow})`; g.beginPath(); g.ellipse(-43 * k, py * k, (4 + 1.5 * Math.sin(t * 13 + py)) * k, 2 * k, 0, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = COLOURS.player; g.lineWidth = 1.5; path(wing); g.stroke(); path(hull); g.stroke(); // our colour round the edge
  if (flash) { g.globalAlpha *= 0.6; g.fillStyle = '#fff'; path(wing); g.fill(); path(hull); g.fill(); }
  g.restore();
}

// A gun tower (story): a squat concrete emplacement whose turret turns to its target, or a broken stump once destroyed.
function drawTowerAt(g, mech, x, y, facing, alpha, flash) {
  const k = HEX_SCALE;
  g.save();
  g.globalAlpha = alpha === undefined ? 1 : alpha;
  g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(4 * k, 8 * k, 26 * k, 18 * k, 0, 0, Math.PI * 2); g.fill();
  const edge = mech.side === 'enemy' ? COLOURS.enemy : COLOURS.player;
  if (!mech.alive) {
    g.fillStyle = '#2a2a2e'; hexPathOn(g, 0, 0, 18 * k); g.fill();
    g.fillStyle = '#4a4a50'; g.fillRect(-10 * k, -6 * k, 9 * k, 7 * k); g.fillRect(3 * k, -2 * k, 8 * k, 6 * k);
    g.restore(); return;
  }
  g.fillStyle = '#6b6e75'; hexPathOn(g, 0, 0, 20 * k); g.fill();          // the base
  g.strokeStyle = edge; g.lineWidth = 2; hexPathOn(g, 0, 0, 20 * k); g.stroke();
  g.fillStyle = '#8d9098'; hexPathOn(g, 0, -3 * k, 14 * k); g.fill();     // the top
  g.rotate(facing * Math.PI / 3);
  g.fillStyle = '#2d3036'; g.fillRect(-3 * k, -26 * k, 6 * k, 20 * k);     // the barrel (direction 0 is up)
  g.fillStyle = '#44474f'; g.beginPath(); g.arc(0, -3 * k, 9 * k, 0, Math.PI * 2); g.fill();
  g.fillStyle = edge; g.beginPath(); g.arc(0, -3 * k, 3 * k, 0, Math.PI * 2); g.fill();
  if (flash) { g.globalAlpha *= 0.6; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, -3 * k, 16 * k, 0, Math.PI * 2); g.fill(); }
  g.restore();
}

// The prison crawler (story): a long tracked transport with barred windows, pointing the way it drives; a burnt-out hull once destroyed.
function drawCrawlerAt(g, mech, x, y, facing, alpha, flash) {
  const k = HEX_SCALE;
  g.save();
  g.globalAlpha = alpha === undefined ? 1 : alpha;
  g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(4 * k, 6 * k, 30 * k, 18 * k, 0, 0, Math.PI * 2); g.fill();
  g.rotate(facing * Math.PI / 3 - Math.PI / 2); // drawn pointing along +x; direction 0 is up
  g.fillStyle = '#1e2024'; g.fillRect(-30 * k, -17 * k, 60 * k, 8 * k); g.fillRect(-30 * k, 9 * k, 60 * k, 8 * k); // the tracks
  g.fillStyle = mech.alive ? '#8a7d5c' : '#3a352c'; g.fillRect(-26 * k, -11 * k, 52 * k, 22 * k);                  // the hull
  if (mech.alive) {
    g.fillStyle = '#5e553f'; g.fillRect(16 * k, -11 * k, 10 * k, 22 * k);                                            // the cab
    g.fillStyle = '#ffd24a'; g.fillRect(24 * k, -8 * k, 2 * k, 4 * k); g.fillRect(24 * k, 4 * k, 2 * k, 4 * k);     // headlights
    g.fillStyle = '#1b1d22';
    for (let i = 0; i < 4; i++) g.fillRect(-22 * k + i * 9 * k, -7 * k, 6 * k, 14 * k);                            // windows
    g.fillStyle = '#9aa0a8';
    for (let i = 0; i < 4; i++) for (let b = 0; b < 2; b++) g.fillRect(-21 * k + i * 9 * k + b * 3 * k, -7 * k, 1 * k, 14 * k); // bars
    g.strokeStyle = COLOURS.player; g.lineWidth = 2; g.strokeRect(-26 * k, -11 * k, 52 * k, 22 * k);
    if (flash) { g.globalAlpha *= 0.6; g.fillStyle = '#fff'; g.fillRect(-26 * k, -11 * k, 52 * k, 22 * k); }
  }
  g.restore();
}

function drawMechAt(g, mech, x, y, facing, alpha, flash) {
  if (mech.bank) { drawBankAt(g, mech, x, y, alpha, flash); return; }
  if (mech.ship) { drawShipAt(g, mech, x, y, alpha, flash, drawClock); return; }
  if (mech.tower) { drawTowerAt(g, mech, x, y, facing, alpha, flash); return; }
  if (mech.crawler) { drawCrawlerAt(g, mech, x, y, facing, alpha, flash); return; }
  g.save();
  g.globalAlpha = alpha === undefined ? 1 : alpha;
  g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath(); g.ellipse(4 * HEX_SCALE, 6 * HEX_SCALE, 24 * HEX_SCALE, 20 * HEX_SCALE, 0, 0, Math.PI * 2); g.fill();
  g.rotate(facing * Math.PI / 3);
  const cls = classOf(mech);
  const size = SPRITE_SIZE * MECH_SCALE * CLASS_LOOK[cls].scale;
  g.drawImage(mech.alive ? MECH_SPRITES[cls][mech.side] : MECH_WRECK[cls][mech.side], -size / 2, -size / 2, size, size);
  if (flash && mech.alive) { g.globalAlpha *= 0.7; g.drawImage(MECH_FLASH[cls][mech.side], -size / 2, -size / 2, size, size); }
  g.restore();
}

function mechHealth(mech) { // 0 to 1: armour left, of what it started with
  if (mech.model === 'pool') return mech.maxHp ? mech.hp / mech.maxHp : 0;
  let left = 0, total = 0;
  for (const loc of LOCATIONS) {
    left += mech.armour[loc] + mech.structure[loc];
    total += mech.max.armour[loc] + mech.max.structure[loc];
  }
  return total ? left / total : 0;
}

// A small flag on a pole, planted at (x, y): the pole's foot. `colour` is the pennant.
// The prototype crate (the heist): a banded case with a hazard stripe and a blinking light, `scale` 1 on the ground.
function drawCrateIcon(g, x, y, scale) {
  const k = HEX_SCALE * scale;
  g.save(); g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(-12 * k, -6 * k, 28 * k, 18 * k);
  g.fillStyle = '#000'; g.fillRect(-15 * k, -11 * k, 30 * k, 21 * k);
  g.fillStyle = '#5b6470'; g.fillRect(-14 * k, -10 * k, 28 * k, 19 * k);
  g.fillStyle = '#7d8896'; g.fillRect(-14 * k, -10 * k, 28 * k, 5 * k);
  g.fillStyle = '#c9a227'; for (let i = 0; i < 4; i++) g.fillRect((-12 + i * 7) * k, 3 * k, 4 * k, 4 * k);
  g.fillStyle = '#2b3038'; g.fillRect(-4 * k, -10 * k, 2 * k, 19 * k); g.fillRect(6 * k, -10 * k, 2 * k, 19 * k);
  g.fillStyle = Math.sin(drawClock * 6) > 0 ? '#7ee08a' : '#244a2e'; g.fillRect(9 * k, -8 * k, 3 * k, 3 * k);
  g.restore();
}

function drawFlagIcon(g, x, y, colour) {
  g.save();
  g.strokeStyle = '#000'; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 24); g.stroke();
  g.strokeStyle = '#d8e4f2'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 24); g.stroke();
  g.fillStyle = colour; g.strokeStyle = '#000'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x, y - 24); g.lineTo(x + 16, y - 19); g.lineTo(x, y - 13); g.closePath(); g.fill(); g.stroke();
  g.restore();
}

// What the battle's goal puts on the map: the hill zone (tinted by who holds it), the flag and the bases, or the two exits.
function drawObjectiveOverlay(g, state, clock) {
  const o = state.objective;
  if (!o || o.id === 'annihilation') return;
  const pulse = 0.5 + 0.5 * Math.sin(clock * 3);
  const label = (hexes, text, colour) => {
    const [x, y] = hexToScreen(hexes[0][0], hexes[0][1]);
    g.font = 'bold 10px ' + MONO; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = '#000'; g.fillStyle = colour;
    g.strokeText(text, x, y - HEX_R + 12); g.fillText(text, x, y - HEX_R + 12); g.textAlign = 'left';
  };
  const group = (hexes, fill, edge, width) => { for (const [c, r] of hexes) fillHex(g, c, r, fill, edge, width); };
  if (o.id === 'hill') {
    const inside = side => livingMechs(state, side).some(m => o.zone.some(h => h[0] === m.pos[0] && h[1] === m.pos[1]));
    const p = inside('player'), e = inside('enemy');
    const colour = p && !e ? COLOURS.player : e && !p ? COLOURS.enemy : '#ffd24a';
    group(o.zone, `rgba(255,255,255,${0.04 + 0.05 * pulse})`, colour, 3);
    label(o.zone.slice(0, 1), 'HILL', colour);
  } else if (o.id === 'flag') {
    group(o.bases.player, 'rgba(79,179,217,0.14)', 'rgba(79,179,217,0.8)', 2); label(o.bases.player.slice(0, 1), 'YOUR BASE', COLOURS.player);
    group(o.bases.enemy, 'rgba(255,90,74,0.14)', 'rgba(255,90,74,0.8)', 2); label(o.bases.enemy.slice(0, 1), 'ENEMY BASE', COLOURS.enemy);
    if (o.flag.pos) {
      const [x, y] = hexToScreen(o.flag.pos[0], o.flag.pos[1]);
      fillHex(g, o.flag.pos[0], o.flag.pos[1], `rgba(255,210,74,${0.10 + 0.10 * pulse})`, '#ffd24a', 2);
      drawFlagIcon(g, x - 4, y + 10, '#ffd24a');
    }
  } else if (o.id === 'core') { // the doors: who holds them
    const h = mechById(state, o.holder);
    fillHex(g, o.gate[0], o.gate[1], `rgba(255,210,74,${0.06 + 0.06 * pulse})`, '#ffd24a', 2);
    const [x, y] = hexToScreen(o.gate[0], o.gate[1]);
    const text = h.alive ? `THE DOORS: ${h.pilot}` : 'THE DOORS ARE OPEN';
    g.font = 'bold 11px ' + MONO; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = '#000'; g.fillStyle = h.alive ? '#ffd24a' : '#ff7b6b';
    g.strokeText(text, x, y + HEX_R + 12); g.fillText(text, x, y + HEX_R + 12); g.textAlign = 'left';
  } else if (o.id === 'hunt') { // the mark: a turning red target ring
    const m = mechById(state, o.mark);
    if (m.alive) {
      const [x, y] = hexToScreen(m.pos[0], m.pos[1]);
      g.save(); g.translate(x, y); g.rotate(clock * 0.8);
      g.strokeStyle = `rgba(255,90,74,${0.6 + 0.3 * pulse})`; g.lineWidth = 2;
      g.beginPath(); g.arc(0, 0, HEX_R * 1.05, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(HEX_R * 0.85, 0); g.lineTo(HEX_R * 1.3, 0); g.stroke(); }
      g.restore();
    }
  } else if (o.id === 'heist') { // the extraction point, and the crate where it lies
    group(o.bases.player, `rgba(216,177,58,${0.08 + 0.10 * pulse})`, '#ffd24a', 3);
    const low = o.bases.player.reduce((a, b) => (hexToScreen(...b)[1] > hexToScreen(...a)[1] ? b : a));
    const [lx, ly] = hexToScreen(...low);
    g.font = 'bold 11px ' + MONO; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = '#000'; g.fillStyle = '#ffd24a';
    g.strokeText('EXTRACTION', lx + HEX_R * 0.4, ly + HEX_R + 12); g.fillText('EXTRACTION', lx + HEX_R * 0.4, ly + HEX_R + 12); g.textAlign = 'left';
    if (o.flag.pos) {
      const [x, y] = hexToScreen(o.flag.pos[0], o.flag.pos[1]);
      fillHex(g, o.flag.pos[0], o.flag.pos[1], `rgba(255,210,74,${0.10 + 0.12 * pulse})`, '#ffd24a', 2);
      drawCrateIcon(g, x, y, 1);
    }
  } else if (o.id === 'raid') { // the hangar lights up once the towers are down
    const open = targetsLeft(state) === 0;
    group(o.hangar, open ? `rgba(216,177,58,${0.10 + 0.12 * pulse})` : 'rgba(216,177,58,0.05)', open ? '#ffd24a' : 'rgba(216,177,58,0.5)', open ? 3 : 2);
    const low = o.hangar.reduce((a, b) => (hexToScreen(...b)[1] > hexToScreen(...a)[1] ? b : a));
    const [lx, ly] = hexToScreen(...low);
    g.font = 'bold 11px ' + MONO; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = '#000'; g.fillStyle = open ? '#ffd24a' : '#b9a46a';
    const text = open ? `HANGAR: ${runnerName(state)}` : 'HANGAR (TOWERS FIRST)';
    g.strokeText(text, lx - HEX_R, ly + HEX_R + 12); g.fillText(text, lx - HEX_R, ly + HEX_R + 12); g.textAlign = 'left';
  } else if (o.id === 'escape') { // only the player has somewhere to get to
    group(o.exits.player, `rgba(216,177,58,${0.08 + 0.10 * pulse})`, '#ffd24a', 3);
    const low = o.exits.player.reduce((a, b) => (hexToScreen(...b)[1] > hexToScreen(...a)[1] ? b : a)); // the label goes under the pad, clear of the mechs' names
    const [lx, ly] = hexToScreen(...low);
    g.font = 'bold 11px ' + MONO; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = '#000'; g.fillStyle = '#ffd24a';
    g.strokeText('DROPSHIP', lx, ly + HEX_R + 12); g.fillText('DROPSHIP', lx, ly + HEX_R + 12); g.textAlign = 'left';
  } else if (o.id === 'exit') {
    group(o.exits.player, `rgba(79,179,217,${0.10 + 0.08 * pulse})`, COLOURS.player, 3); label(o.exits.player.slice(0, 1), 'YOUR EXIT', COLOURS.player);
    group(o.exits.enemy, `rgba(255,90,74,${0.10 + 0.08 * pulse})`, COLOURS.enemy, 3); label(o.exits.enemy.slice(0, 1), 'ENEMY EXIT', COLOURS.enemy);
  }
}

function drawMechLabel(g, mech, x, y) {
  const w = 32, h = 4, bx = x - w / 2, by = y + HEX_R - 8;
  rect(g, 'rgba(0,0,0,0.6)', bx - 1, by - 1, w + 2, h + 2);
  const f = mechHealth(mech);
  rect(g, f > 0.6 ? '#2f9e63' : f > 0.3 ? '#c9a227' : '#d1642a', bx, by, w * f, h);
  g.font = FONT_SMALL; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = '#000';
  const name = callSign(mech);
  g.strokeText(name, x, y - HEX_R + 10);
  g.fillStyle = mech.side === 'player' ? COLOURS.player : COLOURS.enemy;
  g.fillText(name, x, y - HEX_R + 10);
  if (mech.shutdown) { g.fillStyle = COLOURS.warn; g.strokeText('SHUT DOWN', x, y + 4); g.fillText('SHUT DOWN', x, y + 4); }
  g.textAlign = 'left';
  if (mech.carrying) { if (mech.side === 'player' && drawHeist) drawCrateIcon(g, x + HEX_R * 0.5, y + 2, 0.7); else drawFlagIcon(g, x + HEX_R * 0.55, y + 4, '#ffd24a'); } // the carrier shows the flag, or the crate
}

// A dashed line through the hexes of a planned path, with the ghost of the mech at the end.
function drawPlannedPath(g, mech, from, path, mode, alpha) {
  const colour = mode === 'run' ? COLOURS.runEdge : COLOURS.walkEdge;
  g.save();
  g.globalAlpha = alpha;
  g.strokeStyle = colour; g.lineWidth = 3; g.setLineDash([8, 6]);
  g.beginPath();
  const [sx, sy] = hexToScreen(from[0], from[1]);
  g.moveTo(sx, sy);
  for (const h of path) { const [x, y] = hexToScreen(h[0], h[1]); g.lineTo(x, y); }
  g.stroke();
  g.setLineDash([]);
  g.restore();
  if (path.length) {
    const end = path[path.length - 1], prev = path.length > 1 ? path[path.length - 2] : from;
    const [x, y] = hexToScreen(end[0], end[1]);
    drawMechAt(g, mech, x, y, dirToward(prev, end), 0.45 * alpha);
    fillHex(g, end[0], end[1], null, colour, 3);
  }
}

function panel(g, x, y, w, h) {
  g.fillStyle = COLOURS.panel; g.fillRect(x, y, w, h);
  g.strokeStyle = COLOURS.panelEdge; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function aimLineColour(mechId) {
  const n = parseInt(mechId.slice(1), 10);
  return MECH_LINE_COLOURS[(n - 1 + MECH_LINE_COLOURS.length) % MECH_LINE_COLOURS.length];
}

// ---------- the unit panel ----------
// Each location's box on the paper-doll (x, y, w, h in doll units, from mockup B's front view).
// ---------- the right-hand panel: stats for the player's whole squad, one card per mech ----------
const CARD_W = 202, CARD_H = 104, CARD_GAP = 6;

// One mech's stats as a card at (x, y): name, class and state, an armour bar, a heat bar, the weapons in two columns
// and the movement. `opts`: { current (this is the mech being asked about: its card has a bright edge), slot (the weapon
// being aimed, marked >), heatGhost (the heat it will have if the orders so far are carried out) }.
function drawMechCard(g, mech, x, y, opts = {}) {
  const w = CARD_W, inner = w - 20;
  g.save();
  g.globalAlpha = mech.alive ? 1 : 0.55;
  panel(g, x, y, w, CARD_H);
  const side = mech.side === 'player' ? COLOURS.player : COLOURS.enemy;
  if (opts.current) { g.strokeStyle = side; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, CARD_H - 2); }
  g.textAlign = 'left'; g.font = FONT; g.fillStyle = side;
  g.fillText(mech.pilot ? mech.pilot : `${mech.id}  ${mech.name}`, x + 10, y + 18); // a story pilot's name, or the id and chassis
  g.font = FONT_SMALL; g.fillStyle = !mech.alive || mech.shutdown ? '#ff7b6b' : COLOURS.dim;
  g.textAlign = 'right';
  g.fillText(!mech.alive ? 'DESTROYED' : mech.shutdown ? 'SHUT DOWN' : mech.bank ? 'THE MODEL' : mech.ship ? 'REFUELLING' : mech.tower ? 'FIXED' : mech.crawler ? 'NO GUNS' : mech.pilot ? mech.name : classOf(mech).toUpperCase(), x + w - 10, y + 18);
  g.textAlign = 'left';

  // armour: points in the simple game, a percentage in the advanced one
  const f = mechHealth(mech);
  const bar = (by, fill, frac, label) => {
    rect(g, '#1a2233', x + 10, by, inner, 12);
    rect(g, fill, x + 10, by, inner * Math.max(0, Math.min(1, frac)), 12);
    g.strokeStyle = COLOURS.dim; g.lineWidth = 1; g.strokeRect(x + 10.5, by + 0.5, inner - 1, 11);
    g.fillStyle = '#fff'; g.font = 'bold 10px ' + MONO; g.textAlign = 'center';
    g.fillText(label, x + 10 + inner / 2, by + 9.5);
    g.textAlign = 'left';
  };
  bar(y + 26, f > 0.6 ? '#2f9e63' : f > 0.3 ? '#c9a227' : '#d1642a', f, mech.model === 'pool' ? `ARMOUR ${mech.hp} / ${mech.maxHp}` : `ARMOUR ${Math.round(f * 100)}%`);

  const ghost = opts.heatGhost;
  const planned = ghost !== null && ghost !== undefined && ghost !== mech.heat;
  const heatColour = v => (v > 0.7 ? '#e0452b' : v > 0.4 ? '#e8a13a' : '#4fb3d9');
  bar(y + 42, heatColour(mech.heat / HEAT_MAX), mech.heat / HEAT_MAX, `HEAT ${mech.heat}${planned ? ` -> ${ghost}` : ''} / ${HEAT_MAX}`);
  if (planned && ghost > mech.heat) { // the planned extra heat, a lighter stretch beyond the real one
    rect(g, 'rgba(255,255,255,0.35)', x + 10 + inner * mech.heat / HEAT_MAX, y + 42, inner * (Math.min(HEAT_MAX, ghost) - mech.heat) / HEAT_MAX, 12);
    g.strokeStyle = COLOURS.dim; g.strokeRect(x + 10.5, y + 42.5, inner - 1, 11);
    g.fillStyle = '#fff'; g.font = 'bold 10px ' + MONO; g.textAlign = 'center';
    g.fillText(`HEAT ${mech.heat} -> ${ghost} / ${HEAT_MAX}`, x + 10 + inner / 2, y + 51.5);
    g.textAlign = 'left';
  }

  // weapons, two columns
  g.font = '10px ' + MONO;
  const armed = mech.weapons.filter(w2 => w2.id !== 0);
  armed.forEach((w2, i) => {
    const def = weaponById(w2.id);
    const gone = mech.destroyed && mech.destroyed[w2.loc];
    const off = w2.off || (!gone && mech.model === 'locations' && locationDown(mech, w2.loc));
    const dry = w2.ammo === 0, jammed = w2.jam > 0;
    const tail = gone ? 'LOST' : off ? 'OFF' : jammed ? 'JAMMED' : dry ? 'EMPTY' : w2.ammo === null ? '' : String(w2.ammo);
    g.fillStyle = gone || off || dry || jammed ? '#c26a6a' : w2.slot === opts.slot ? COLOURS.warn : COLOURS.text;
    g.fillText(`${w2.slot === opts.slot ? '>' : ' '}${def.name}${tail ? ' ' + tail : ''}`, x + 6 + (i % 2) * 96, y + 72 + Math.floor(i / 2) * 13);
  });
  g.fillStyle = COLOURS.dim; g.font = '10px ' + MONO;
  g.fillText(`WALK ${walkAllowance(mech)}  RUN ${runAllowance(mech)}  SINKS ${mech.sinks}`, x + 10, y + CARD_H - 8);
  g.restore();
}

// The one card: whichever mech the cursor is over, friend or foe, otherwise the highlighted mech (the one being asked about, or the
// enemy's mech that is acting). `ask` is { mechId, slot, heatGhost } for the highlighted mech. With neither, the slot shows a hint.
function drawCardSlot(g, mech, ask) {
  if (!mech) {
    panel(g, 806, MAP_TOP, CARD_W, CARD_H);
    g.font = FONT_SMALL; g.fillStyle = COLOURS.dim; g.textAlign = 'center';
    g.fillText('HOVER A MECH', 806 + CARD_W / 2, MAP_TOP + CARD_H / 2 - 2);
    g.fillText('FOR ITS STATS', 806 + CARD_W / 2, MAP_TOP + CARD_H / 2 + 14);
    g.textAlign = 'left';
    return;
  }
  const own = !!ask && ask.mechId === mech.id;
  drawMechCard(g, mech, 806, MAP_TOP, { current: own, slot: own ? ask.slot : -1, heatGhost: own ? ask.heatGhost : null });
}

// The combat log shows the last combat round: its heading under the title, then both sides' fire in order (a line starting with
// '#' is a side's heading), the latest lines if there are more than fit.
const LOG_Y = MAP_TOP + CARD_H + 8;
function drawLog(g, lines, header, bottom) { // from under the card down to `bottom` (the help text, or the minimap's panel on a big map)
  const x = 806, y = LOG_Y, w = 202, LOG_H = bottom - LOG_Y, LOG_LINES = Math.floor((LOG_H - 53 - 6) / 14);
  panel(g, x, y, w, LOG_H);
  g.font = FONT_SMALL; g.fillStyle = COLOURS.dim; g.textAlign = 'left';
  g.fillText('COMBAT LOG', x + 12, y + 18);
  g.fillStyle = COLOURS.warn; g.font = 'bold 11px ' + MONO;
  g.fillText(header || 'NO COMBAT YET', x + 12, y + 35, w - 22);
  g.font = FONT_SMALL;
  lines.slice(-LOG_LINES).forEach((line, i) => {
    if (line.startsWith('#')) { g.fillStyle = line.includes('YOUR') ? COLOURS.player : COLOURS.enemy; g.font = 'bold 11px ' + MONO; g.fillText(line.slice(1), x + 12, y + 53 + i * 14); g.font = FONT_SMALL; return; }
    g.fillStyle = line.includes('DESTROYED') || line.includes('SHUT DOWN') || line.includes('EXPLODES') || line.includes('CRITICAL') ? '#ff7b6b' : line.includes('miss') || line.includes('MISS') ? COLOURS.dim : /^P\d /.test(line) ? '#8fd0ea' : /^E\d /.test(line) ? '#ff9a8a' : COLOURS.text; // a shot's line is tinted by who fired it
    g.fillText(line, x + 12, y + 53 + i * 14, w - 22); // squeezed to fit if too long
  });
  g.globalAlpha = 1;
}

function drawHelp(g, lines) {
  g.font = FONT_SMALL; g.fillStyle = COLOURS.dim; g.textAlign = 'left';
  lines.forEach((line, i) => g.fillText(line, 16, VIEW_H - 14 - (lines.length - 1 - i) * 15));
}

// ---------- the move range ----------
// The edges of a set of hexes that face outside it: [x0, y0, x1, y1] on screen, one per boundary edge. `region` is a
// Map keyed by hexKey (the reach of a move). Edge k of a flat-top hex runs from corner k to corner k + 1 and faces
// direction (k + 2) % 6 (see DIR_STEPS in map.js: 0 is up, then clockwise).
function regionBoundaryEdges(region) {
  const edges = [];
  for (const node of region.values()) {
    const [x, y] = hexToScreen(node.c, node.r);
    for (let k = 0; k < 6; k++) {
      const [nc, nr] = neighbour(node.c, node.r, (k + 2) % 6);
      if (region.has(hexKey(nc, nr))) continue;
      const a0 = Math.PI / 3 * k, a1 = Math.PI / 3 * (k + 1);
      edges.push([x + HEX_R * Math.cos(a0), y + HEX_R * Math.sin(a0), x + HEX_R * Math.cos(a1), y + HEX_R * Math.sin(a1)]);
    }
  }
  return edges;
}

// Outline a move range: just the border, nothing filled in. A region of one hex (nowhere to go) draws nothing.
function drawRegionOutline(g, region, colour, width) {
  if (region.size <= 1) return;
  g.save();
  g.strokeStyle = colour; g.lineWidth = width; g.lineCap = 'round';
  g.beginPath();
  for (const [x0, y0, x1, y1] of regionBoundaryEdges(region)) { g.moveTo(x0, y0); g.lineTo(x1, y1); }
  g.stroke();
  g.restore();
}

// ---------- the orders screen ----------
function drawLineBetweenHexes(g, from, to, colour, width, dashed) {
  const a = hexToScreen(from[0], from[1]), b = hexToScreen(to[0], to[1]);
  g.save();
  g.strokeStyle = colour; g.lineWidth = width; g.lineCap = 'round';
  if (dashed) g.setLineDash([9, 7]);
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  g.restore();
}

function signed(n) { return n > 0 ? '+' + n : String(n); }

// A box of lines beside a hex. Each line is { t: text, style: 'title' | 'big' | 'dim' | 'warn' | 'text' }.
function drawInfoBox(g, hex, lines) {
  const heights = { title: 16, big: 22, dim: 14, warn: 14, text: 14 };
  const w = 200, h = 14 + lines.reduce((n, l) => n + heights[l.style], 0);
  const [tx, ty] = hexToScreen(hex[0], hex[1]);
  let x = tx + HEX_R + 8;
  if (x + w > MAP_AREA_W) x = tx - HEX_R - 8 - w;
  const y = Math.max(MAP_TOP, Math.min(VIEW_H - 50 - h, ty - h / 2));
  panel(g, x, y, w, h);
  let ly = y + 18;
  for (const l of lines) {
    if (l.style === 'title') { g.font = FONT; g.fillStyle = COLOURS.text; }
    else if (l.style === 'big') { g.font = 'bold 18px ' + MONO; g.fillStyle = COLOURS.warn; ly += 3; }
    else { g.font = FONT_SMALL; g.fillStyle = l.style === 'warn' ? COLOURS.warn : l.style === 'dim' ? COLOURS.dim : l.style === 'good' ? '#7ee08a' : COLOURS.text; }
    g.fillText(l.t, x + 10, ly);
    ly += heights[l.style];
  }
}

// The callout for a weapon question: the exact number needed, with every modifier.
function weaponCalloutLines(weapon) {
  const s = weapon.status;
  const lines = [
    { t: `${weapon.name} > ${weapon.targetId}`, style: 'title' },
    s.smoke ? { t: 'LANDS  100%', style: 'big' } : { t: `NEED ${s.need}+   ${s.chance}%`, style: 'big' },
  ];
  if (s.smoke) lines.push({ t: `smoke for ${SMOKE_ROUNDS} rounds, 7 hexes`, style: 'dim' }, { t: 'blocks lasers and cannons', style: 'dim' });
  if (weapon.splash) lines.push({ t: `splash ${weapon.splash} on every mech beside`, style: 'warn' }, { t: 'the target (friends too)', style: 'warn' });
  for (const m of s.mods) lines.push({ t: m.name === 'base to-hit' ? `base to-hit ${m.value}+` : `${signed(m.value)} ${m.name}`, style: 'dim' });
  if (weapon.lockText) lines.push({ t: weapon.lockText, style: 'warn' });
  return lines;
}

// The weapon question: valid targets ringed, the cursor's target highlighted with a dashed line from the shooter.
function drawWeaponOverlay(g, state, weapon) {
  for (const id of weapon.validIds) { const m = mechById(state, id); fillHex(g, m.pos[0], m.pos[1], null, 'rgba(255,90,74,0.55)', 2); }
  if (weapon.targetId) {
    const t = mechById(state, weapon.targetId);
    if (weapon.splash) for (const n of neighbours(state.map, t.pos[0], t.pos[1])) fillHex(g, n.c, n.r, 'rgba(255,140,60,0.18)', 'rgba(255,140,60,0.7)', 2); // the splash hexes
    fillHex(g, t.pos[0], t.pos[1], COLOURS.aimFill, COLOURS.aim, 4);
    drawLineBetweenHexes(g, mechById(state, weapon.mechId).pos, t.pos, COLOURS.aim, 3, true);
  }
}

// ---------- projectiles ----------
function drawProjectile(g, p, local) {
  const t = (local - p.t) / p.dur;
  if (t < 0 || t >= 1) return;
  const [fx, fy] = p.from, [tx, ty] = p.to;
  g.lineCap = 'round';
  if (p.kind === 'laser') {
    for (const [col, w] of [[`rgba(255,60,40,${0.35 * (1 - t * 0.5)})`, 14], ['#ff7a5a', 5], ['#fff', 2]]) {
      g.strokeStyle = col; g.lineWidth = w;
      g.beginPath(); g.moveTo(fx, fy); g.lineTo(tx, ty); g.stroke();
    }
    if (Math.random() < 0.6) fxSpark(tx, ty, 2, 120);
  } else if (p.kind === 'cannon') {
    const q = Math.max(0, t - 0.3);
    for (const [col, w] of [['#ffd24a', 4], ['#fff', 1.5]]) {
      g.strokeStyle = col; g.lineWidth = w;
      g.beginPath(); g.moveTo(lerp(fx, tx, q), lerp(fy, ty, q)); g.lineTo(lerp(fx, tx, t), lerp(fy, ty, t)); g.stroke();
    }
  } else {
    const [cx, cy] = p.ctrl, u = 1 - t;
    const x = u * u * fx + 2 * u * t * cx + t * t * tx, y = u * u * fy + 2 * u * t * cy + t * t * ty;
    g.fillStyle = 'rgba(0,0,0,0.3)';  // ground shadow, so the arc reads as height
    g.beginPath(); g.ellipse(lerp(fx, tx, t), lerp(fy, ty, t) + 4, 4, 2.5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.fillRect(x - 3, y - 3, 6, 6);
    g.fillStyle = '#ff9f1c'; g.fillRect(x - 2, y - 2, 4, 4);
    fxPuff(x, y);
  }
}

function drawResult(g, result) {
  g.fillStyle = 'rgba(5,11,30,0.82)'; g.fillRect(0, 0, VIEW_W, VIEW_H);
  g.textAlign = 'center';
  g.font = 'bold 54px ' + MONO;
  g.fillStyle = result.outcome === 'VICTORY' ? '#7ee08a' : result.outcome === 'DEFEAT' ? '#ff7b6b' : COLOURS.warn;
  g.fillText(result.outcome, VIEW_W / 2, 230);
  g.font = FONT; g.fillStyle = COLOURS.text;
  result.lines.forEach((line, i) => g.fillText(line, VIEW_W / 2, 290 + i * 24));
  g.fillStyle = COLOURS.warn;
  g.fillText(result.hint, VIEW_W / 2, 290 + result.lines.length * 24 + 40);
  g.textAlign = 'left';
}

// ---------- the intro and the title card ----------
const INTRO_FONT = 'italic 22px Georgia, "Times New Roman", serif';
const INTRO_COLOUR = '#c8c8c8';
const INTRO_GAP = 30;              // between one line and the next
const INTRO_LINE_H = 32;

// Words wrapped to `maxWidth` pixels, as a list of text lines.
function wrapWords(g, text, maxWidth) {
  const out = [];
  let line = '';
  for (const word of text.split(' ')) {
    const tryLine = line ? line + ' ' + word : word;
    if (line && g.measureText(tryLine).width > maxWidth) { out.push(line); line = word; } else line = tryLine;
  }
  if (line) out.push(line);
  return out;
}

// view = { lines: [{ index, alpha }] } from introFrame. The whole block is laid out up front (all three lines), so a line fading
// in never moves the ones already there. Centred, at most 40 characters wide.
function drawIntro(g, view) {
  g.fillStyle = '#000'; g.fillRect(0, 0, VIEW_W, VIEW_H);
  g.font = INTRO_FONT; g.textAlign = 'center'; g.fillStyle = INTRO_COLOUR;
  const maxWidth = 40 * g.measureText('0').width;
  const wrapped = INTRO_LINES.map(text => wrapWords(g, text, maxWidth));
  const total = wrapped.reduce((n, w) => n + w.length * INTRO_LINE_H, 0) + INTRO_GAP * (wrapped.length - 1);
  let y = (VIEW_H - total) / 2 + INTRO_LINE_H * 0.7;
  wrapped.forEach((rows, index) => {
    const shown = view.lines.find(l => l.index === index);
    rows.forEach(row => {
      if (shown) { g.globalAlpha = shown.alpha; g.fillText(row, VIEW_W / 2, y); }
      y += INTRO_LINE_H;
    });
    y += INTRO_GAP;
  });
  g.globalAlpha = 1; g.textAlign = 'left';
}

function drawBlack(g) { g.fillStyle = '#000'; g.fillRect(0, 0, VIEW_W, VIEW_H); }

// The name, built from hexes: each lit hex pops in a little after the one before (spread across the letters, with a
// scatter so it does not sweep like a wipe), then shimmers gently. `clock` is seconds since the title card appeared.
const TITLE_HEX_R = 9;
const TITLE_CENTRE_X = 345;   // the title block sits left of centre: the background picture keeps its left half clear for text
function drawHexTitle(g, clock) {
  const r = TITLE_HEX_R, cells = titleHexes(TITLE_TEXT);
  const cols = TITLE_TEXT.length * (TITLE_GLYPH_W + TITLE_GLYPH_GAP) - TITLE_GLYPH_GAP;
  const width = (cols - 1) * 1.5 * r + 2 * r, height = (TITLE_GLYPH_H - 1) * Math.sqrt(3) * r + Math.sqrt(3) * r * 1.5;
  const x0 = TITLE_CENTRE_X - width / 2 + r, y0 = 270 + Math.sqrt(3) * r / 2;
  g.save();
  for (const { col, row } of cells) {
    const delay = col * 0.025 + (((col * 7 + row * 13) % 10) / 10) * 0.45;
    const pop = Math.max(0, Math.min(1, (clock - delay) / 0.3));
    if (pop <= 0) continue;
    const x = x0 + col * 1.5 * r, y = y0 + row * Math.sqrt(3) * r + (col % 2 ? Math.sqrt(3) * r / 2 : 0);
    const shimmer = 0.88 + 0.12 * Math.sin(clock * 2.2 + col * 0.55 + row * 0.8);
    const t = row / (TITLE_GLYPH_H - 1);
    g.globalAlpha = pop * shimmer;
    g.shadowColor = 'rgba(79,179,217,0.75)'; g.shadowBlur = 16;
    hexPathOn(g, x, y, (r - 1.5) * (0.6 + 0.4 * pop));
    g.fillStyle = `rgb(${Math.round(120 - 50 * t)},${Math.round(210 - 40 * t)},${Math.round(245 - 30 * t)})`;
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1; g.stroke();
  }
  g.restore();
}

// The title card: the name over a picture (if there is one), and a prompt that pulses. `image` is a loaded Image or canvas, or null,
// in which case a few faint hexes are drawn instead. The picture is scaled to cover the screen, drifts slowly in, and is darkened
// at the top and bottom (and through the middle, under the name) so the text always reads.
function drawTitleCard(g, clock, image, buttons, hover) {
  drawBlack(g);
  if (image) {
    const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
    const zoom = 1 + Math.min(0.08, clock * 0.004);         // a very slow push in
    const scale = Math.max(VIEW_W / w, VIEW_H / h) * zoom;
    g.drawImage(image, (VIEW_W - w * scale) / 2, (VIEW_H - h * scale) / 2, w * scale, h * scale);
    const shade = g.createLinearGradient(0, 0, 0, VIEW_H);
    shade.addColorStop(0, 'rgba(0,0,0,0.25)'); shade.addColorStop(0.45, 'rgba(0,0,0,0.0)'); shade.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = shade; g.fillRect(0, 0, VIEW_W, VIEW_H);
  } else {
    g.strokeStyle = 'rgba(79,179,217,0.10)'; g.lineWidth = 2;
    for (let c = 0; c < 9; c++) for (let r = 0; r < 6; r++) {
      hexPathOn(g, 160 + c * 88, 110 + r * 100 + (c % 2) * 50, 46);
      g.stroke();
    }
  }
  drawHexTitle(g, clock);
  g.textAlign = 'center';
  g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 14;
  g.font = 'italic 20px Georgia, "Times New Roman", serif'; g.fillStyle = INTRO_COLOUR;
  g.fillText('one last mission', TITLE_CENTRE_X, 425);
  g.globalAlpha = 1; g.shadowBlur = 0; g.textAlign = 'left';
  for (const b of buttons || []) drawTitleButton(g, b, b.id === hover, clock);
}

// A big button of the title screen: the label over a small description. The one ENTER would press has a pulsing outline.
function drawTitleButton(g, b, hovered, clock) {
  g.fillStyle = hovered ? 'rgba(79,179,217,0.30)' : 'rgba(5,11,30,0.72)'; g.fillRect(b.x, b.y, b.w, b.h);
  g.lineWidth = b.state === 'selected' ? 2 + Math.sin(clock * 4) * 0.8 : 1;
  g.strokeStyle = b.state === 'selected' || hovered ? COLOURS.player : COLOURS.panelEdge;
  g.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  g.textAlign = 'center';
  g.font = 'bold 18px ' + MONO; g.fillStyle = COLOURS.text; g.fillText(b.label, b.x + b.w / 2, b.y + 24);
  g.font = '11px ' + MONO; g.fillStyle = COLOURS.dim; g.fillText(b.sub, b.x + b.w / 2, b.y + 41);
  g.textAlign = 'left';
}

// ---------- the select screen ----------
// A little picture of a map: each hex a small hex in its terrain colour, with a blue dot on each of your starts and a red one on each of theirs.
function drawMapThumb(g, scenario, x, y, maxW, maxH) {
  const rows = scenario.rows;
  const r = Math.floor(Math.min(maxW / (1.5 * (rows[0].length - 1) + 2), maxH / (Math.sqrt(3) * (rows.length + 0.5)))); // the biggest hexes that fit
  const width = (1.5 * (rows[0].length - 1) + 2) * r;
  const ox = x - width / 2 + r, oy = y + r * Math.sqrt(3) / 2;
  rows.forEach((row, ry) => {
    for (let c = 0; c < row.length; c++) {
      const [ux, uy] = hexCentre(c, ry);
      hexPathOn(g, ox + ux * r, oy + uy * r, r - 0.3);
      g.fillStyle = TERRAIN_FILL[row[c]]; g.fill();
    }
  });
  const dot = (pos, colour) => {
    const [ux, uy] = hexCentre(pos[0], pos[1]);
    g.fillStyle = colour; g.beginPath(); g.arc(ox + ux * r, oy + uy * r, r * 0.55, 0, Math.PI * 2); g.fill();
  };
  const FEATURE_DOT = { W: '#7ee08a', A: '#d8b13a', S: '#7fd0ff' }; // the features stand out from the terrain colours
  if (scenario.withFeatures) scenario.features.forEach(([c, r, t]) => dot([c, r], FEATURE_DOT[t]));
  scenario.playerStarts.forEach(p => dot(p, COLOURS.player));
  scenario.enemyStarts.forEach(p => dot(p, COLOURS.enemy));
}

// view = { buttons, hover, status, statusBad }
function drawSelect(g, view) {
  g.fillStyle = COLOURS.bg; g.fillRect(0, 0, VIEW_W, VIEW_H);
  g.textAlign = 'left'; g.font = 'bold 22px ' + MONO; g.fillStyle = COLOURS.player; g.fillText('FREE PLAY', 16, 38);
  g.font = FONT_SMALL; g.fillStyle = COLOURS.dim; g.fillText('Choose a map, and what it takes to win. You can change both later from the mech bay.', 16, 64);
  g.textAlign = 'right'; g.fillText('MAP SIZE', 752, 36); g.textAlign = 'left';
  for (const b of view.buttons) {
    const hovered = b.id === view.hover && b.state !== 'disabled';
    if (b.id === 'back' || b.id === 'continue' || b.id === 'features' || b.id.startsWith('size:')) { drawBayButton(g, b, hovered); continue; }
    panel(g, b.x, b.y, b.w, b.h);
    if (b.state === 'selected') { g.fillStyle = 'rgba(79,179,217,0.14)'; g.fillRect(b.x, b.y, b.w, b.h); g.strokeStyle = COLOURS.player; g.lineWidth = 3; g.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3); }
    else if (hovered) { g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1); }
    const off = b.state === 'disabled';
    let top = b.y + 22;
    if (b.id.startsWith('map:')) {
      drawMapThumb(g, scenarioFor(b.id.slice(4), view.size || 'small', !!view.features), b.x + b.w / 2, b.y + 10, b.w - 16, 176);
      top = b.y + 208;
    }
    g.font = 'bold 14px ' + MONO; g.fillStyle = off ? '#66738a' : b.state === 'selected' ? COLOURS.player : COLOURS.text; g.fillText(b.label, b.x + 12, top);
    g.font = FONT_SMALL; g.fillStyle = off ? '#66738a' : COLOURS.dim;
    g.font = '11px ' + MONO;
    wrapWords(g, b.sub, b.w - 24).slice(0, 6).forEach((line, i) => g.fillText(line, b.x + 12, top + 18 + i * 14));
    if (off) { g.fillStyle = COLOURS.warn; g.fillText('NOT YET', b.x + b.w - 70, b.y + b.h - 10); }
  }
  const tip = view.buttons.find(b => b.id === view.hover);
  g.font = FONT_SMALL; g.fillStyle = tip && tip.state === 'disabled' ? '#ff9a8a' : COLOURS.text;
  g.fillText(tip ? tip.tip : '', 16, 586);
  g.font = FONT; g.fillStyle = view.statusBad ? '#ff7b6b' : COLOURS.warn; g.fillText(view.status || '', 16, 606);
}

// ---------- the story's screens (campaign.js) ----------
const STORY_FONT = 'italic 21px Georgia, "Times New Roman", serif';

// The story screen. view = { buttons, hover, status, statusBad }. One row per encounter: its number, then its title and place once it is open.
function drawStory(g, view) {
  g.fillStyle = '#000'; g.fillRect(0, 0, VIEW_W, VIEW_H);
  g.textAlign = 'center';
  g.font = 'bold 22px ' + MONO; g.fillStyle = COLOURS.player; g.fillText('ONE LAST MISSION', VIEW_W / 2, 44);
  g.font = 'italic 16px Georgia, "Times New Roman", serif'; g.fillStyle = INTRO_COLOUR; g.fillText('You fought for an ideal. Now you fight for each other.', VIEW_W / 2, 72);
  g.textAlign = 'left';
  for (const b of view.buttons) {
    const hovered = b.id === view.hover && b.state !== 'disabled';
    if (!b.id.startsWith('mission:')) { drawBayButton(g, b, hovered); continue; }
    g.fillStyle = hovered ? 'rgba(79,179,217,0.18)' : b.open ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)'; g.fillRect(b.x, b.y, b.w, b.h);
    g.strokeStyle = hovered ? COLOURS.player : COLOURS.panelEdge; g.lineWidth = 1; g.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    g.font = 'bold 26px ' + MONO; g.fillStyle = b.open ? COLOURS.player : '#3a4558'; g.fillText(String(b.number), b.x + 18, b.y + 37);
    g.font = 'bold 17px ' + MONO; g.fillStyle = b.state === 'normal' ? COLOURS.text : '#66738a'; g.fillText(b.label, b.x + 64, b.y + 25);
    g.font = 'italic 14px Georgia, "Times New Roman", serif'; g.fillStyle = b.open ? INTRO_COLOUR : '#3a4558'; g.fillText(b.sub, b.x + 64, b.y + 44);
    if (b.open && b.state === 'disabled') { g.font = FONT_SMALL; g.fillStyle = COLOURS.warn; g.textAlign = 'right'; g.fillText('NOT BUILT YET', b.x + b.w - 16, b.y + 33); g.textAlign = 'left'; }
  }
  const tip = view.buttons.find(b => b.id === view.hover);
  g.font = FONT_SMALL; g.fillStyle = COLOURS.dim; g.textAlign = 'center';
  g.fillText(tip ? tip.tip : 'ENTER = play the latest mission    P = type an access phrase    ESC = back', VIEW_W / 2, 586);
  g.font = FONT; g.fillStyle = view.statusBad ? '#ff7b6b' : '#7ee08a'; g.fillText(view.status || '', VIEW_W / 2, 606);
  g.textAlign = 'left';
}

// The briefing. view = { enc, ms, buttons, hover }: the mission's name, its lines fading in one by one, then the squad and the job.
function drawBriefing(g, view) {
  const enc = view.enc, n = CAMPAIGN.indexOf(enc) + 1;
  g.fillStyle = '#000'; g.fillRect(0, 0, VIEW_W, VIEW_H);
  g.font = FONT_SMALL; g.fillStyle = COLOURS.dim; g.fillText(`MISSION ${n} OF ${CAMPAIGN.length}`, 120, 70);
  g.font = 'bold 30px ' + MONO; g.fillStyle = COLOURS.text; g.fillText(enc.title, 120, 106);
  g.font = 'italic 15px Georgia, "Times New Roman", serif'; g.fillStyle = COLOURS.dim; g.fillText(enc.place, 120, 132);
  g.font = STORY_FONT; g.fillStyle = INTRO_COLOUR;
  let y = 196;
  enc.briefing.forEach((text, i) => {
    g.globalAlpha = briefingAlpha(i, view.ms);
    for (const row of wrapWords(g, text, 760)) { g.fillText(row, 120, y); y += 30; }
    y += 14;
  });
  g.globalAlpha = briefingAlpha(enc.briefing.length, view.ms); // the squad and the job come in after the last line
  y = Math.max(y + 10, 380);
  g.strokeStyle = COLOURS.panelEdge; g.beginPath(); g.moveTo(120, y - 22); g.lineTo(904, y - 22); g.stroke();
  g.font = FONT_SMALL; g.fillStyle = COLOURS.dim; g.fillText('YOUR SQUAD', 120, y); g.fillText('THE JOB', 520, y);
  squadLines(enc).forEach((m, i) => {
    const holds = enc.gate && view.holder === m.pilot;
    g.font = FONT; g.fillStyle = holds ? '#ffd24a' : COLOURS.player; g.fillText(m.pilot + (holds ? '   HOLDS THE DOORS' : ''), 120, y + 24 + i * 34);
    g.font = FONT_SMALL; g.fillStyle = COLOURS.text; g.fillText(`${m.chassis}   ${m.weapons}`, 120, y + 39 + i * 34);
  });
  if (enc.gate) { // the finale's question, above the pilots' buttons
    g.font = 'italic 18px Georgia, "Times New Roman", serif'; g.fillStyle = view.holder ? INTRO_COLOUR : '#ffd24a'; g.textAlign = 'center';
    g.fillText(view.holder ? `${view.holder} will hold the doors.` : 'Who holds the doors?', VIEW_W / 2 + 40, 600);
    g.textAlign = 'left';
  }
  if (view.status) { g.font = FONT; g.fillStyle = '#ff7b6b'; g.fillText(view.status, 520, 560); }
  g.font = FONT; g.fillStyle = COLOURS.text;
  wrapWords(g, enc.job, 384).forEach((row, i) => g.fillText(row, 520, y + 24 + i * 19));
  g.globalAlpha = 1;
  for (const b of view.buttons) drawBayButton(g, b, b.id === view.hover);
}

// The debrief after a win. view = { enc, ms, buttons, hover, last }: what happened, then the access phrase that opens the next mission.
function drawDebrief(g, view) {
  const enc = view.enc;
  g.fillStyle = '#000'; g.fillRect(0, 0, VIEW_W, VIEW_H);
  g.font = 'bold 30px ' + MONO; g.fillStyle = COLOURS.text; g.fillText(enc.title, 120, 106);
  g.font = 'bold 14px ' + MONO; g.fillStyle = '#7ee08a'; g.fillText('MISSION COMPLETE', 120, 132);
  g.font = STORY_FONT; g.fillStyle = INTRO_COLOUR;
  let y = 196;
  (view.lines || enc.debrief).forEach((text, i) => {
    g.globalAlpha = briefingAlpha(i, view.ms);
    for (const row of wrapWords(g, text, 760)) { g.fillText(row, 120, y); y += 30; }
    y += 14;
  });
  g.globalAlpha = briefingAlpha((view.lines || enc.debrief).length, view.ms);
  g.textAlign = 'center';
  if (view.last || !enc.phrase) {
    g.font = STORY_FONT; g.fillStyle = INTRO_COLOUR; g.fillText('The end.', VIEW_W / 2, 470);
  } else {
    g.font = FONT_SMALL; g.fillStyle = COLOURS.dim; g.fillText('ACCESS PHRASE', VIEW_W / 2, 430);
    g.font = 'bold 40px ' + MONO; g.fillStyle = '#ffd24a'; g.fillText(enc.phrase.split('').join(' '), VIEW_W / 2, 480);
    g.font = FONT_SMALL; g.fillStyle = COLOURS.dim; g.fillText('Write it down. On the story screen it opens the next mission, today or any other day.', VIEW_W / 2, 512);
  }
  g.textAlign = 'left'; g.globalAlpha = 1;
  for (const b of view.buttons) drawBayButton(g, b, b.id === view.hover);
}

// ---------- the mech bay ----------
// view = { bay, report, buttons, hover (a button id or null), status, statusBad }. Drawing only; the layout is in bay.js.
function drawBadge(g, type, x, y, dim) {
  g.save();
  if (dim) g.globalAlpha = 0.45;
  g.fillStyle = type.colour; g.fillRect(x, y, 16, 14);
  g.fillStyle = '#101a2c'; g.font = 'bold 11px ' + MONO; g.textAlign = 'center';
  g.fillText(type.letter, x + 8, y + 11);
  g.restore();
}

function drawBayButton(g, b, hovered) {
  const fill = b.state === 'selected' ? 'rgba(79,179,217,0.30)' : b.state === 'disabled' ? 'rgba(40,48,64,0.55)' : hovered ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.07)';
  g.fillStyle = fill; g.fillRect(b.x, b.y, b.w, b.h);
  g.strokeStyle = b.state === 'selected' ? COLOURS.player : hovered && b.state !== 'disabled' ? '#ffffff' : COLOURS.panelEdge; g.lineWidth = b.state === 'selected' ? 2 : 1;
  g.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  g.fillStyle = b.state === 'disabled' ? '#66738a' : COLOURS.text;
  const tall = b.h >= 30 && b.sub;
  if (b.id === 'fight' || b.id === 'begin') g.font = 'bold 22px ' + MONO; else g.font = FONT;
  if (b.id === 'fight' || b.id === 'begin' || b.id === 'copy' || b.id === 'paste' || b.label.length <= 2 || b.id.startsWith('difficulty') || b.id.startsWith('remove')) {
    g.textAlign = 'center';
    g.fillText(b.label, b.x + b.w / 2, b.y + (tall ? 15 : b.h / 2 + 5));
    if (tall) { g.font = '10px ' + MONO; g.fillStyle = b.state === 'disabled' ? '#66738a' : COLOURS.dim; g.fillText(b.sub, b.x + b.w / 2, b.y + b.h - 6); }
  } else {
    g.textAlign = 'left';
    g.fillText(b.label, b.x + 8, b.y + (tall ? 14 : b.h / 2 + 5));
    if (tall) { g.font = '10px ' + MONO; g.fillStyle = b.state === 'disabled' ? '#66738a' : COLOURS.dim; g.fillText(b.sub, b.x + 8, b.y + b.h - 6); }
  }
  if (b.badge) drawBadge(g, b.badge, b.x + b.w - 22, b.y + 5, b.state === 'disabled');
  g.textAlign = 'left';
}

// The enemy force the next battle will face, as a button: click it for a different one.
function drawEnemyButton(g, b, hovered) {
  g.fillStyle = hovered ? 'rgba(255,90,74,0.22)' : 'rgba(255,90,74,0.10)'; g.fillRect(b.x, b.y, b.w, b.h);
  g.strokeStyle = hovered ? '#ffffff' : 'rgba(255,90,74,0.7)'; g.lineWidth = 1; g.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  g.textAlign = 'left'; g.font = 'bold 11px ' + MONO; g.fillStyle = COLOURS.text; g.fillText(b.label, b.x + 8, b.y + 12, b.w - 100);
  g.font = '10px ' + MONO; g.fillStyle = COLOURS.dim; g.fillText(b.sub, b.x + 8, b.y + 24, b.w - 100);
  g.textAlign = 'right'; g.font = 'bold 11px ' + MONO; g.fillStyle = COLOURS.enemy; g.fillText('NEW ENEMY', b.x + b.w - 8, b.y + 18); g.textAlign = 'left';
}

function drawBay(g, view) {
  const { bay, report } = view;
  g.fillStyle = COLOURS.bg; g.fillRect(0, 0, VIEW_W, VIEW_H);
  g.textAlign = 'left'; g.font = 'bold 22px ' + MONO; g.fillStyle = COLOURS.player; g.fillText('MECH BAY', 16, 38);
  g.font = FONT_SMALL; g.fillStyle = COLOURS.dim;
  g.fillText('START FROM', 16, 70);
  g.textAlign = 'right'; g.font = 'bold 15px ' + MONO;
  g.fillStyle = report.cost > report.budget ? '#ff7b6b' : COLOURS.text;
  g.fillText(`CREDITS ${report.cost} / ${report.budget}`, 1008, 28);
  g.fillStyle = '#1a2233'; g.fillRect(808, 36, 200, 8);
  g.fillStyle = report.cost > report.budget ? '#d1442a' : '#2f9e63'; g.fillRect(808, 36, 200 * Math.min(1, report.cost / report.budget), 8);
  g.textAlign = 'left';

  for (let i = 0; i < SQUAD_MAX; i++) {
    const x = bayColumnX(i), y = BAY_COLUMN_Y, spec = bay.mechs[i];
    panel(g, x, y, BAY_COLUMN_W, BAY_COLUMN_H);
    g.font = FONT; g.fillStyle = COLOURS.player; g.fillText(`MECH ${i + 1}`, x + 8, y + 17);
    if (!spec) {
      g.font = FONT_SMALL; g.fillStyle = COLOURS.dim; g.fillText('EMPTY.  Pick a chassis to add a mech.', x + 8, y + 126);
      continue;
    }
    const chassis = chassisById(spec.chassis), heat = heatReport(spec), cost = mechCost(spec);
    const used = slotsUsed(spec);
    g.drawImage(MECH_SPRITES[chassis.cls].player, x + 8, y + 108, 72, 72);
    g.font = FONT; g.fillStyle = COLOURS.text; g.fillText(chassis.name, x + 90, y + 122);
    g.font = FONT_SMALL; g.fillStyle = COLOURS.dim;
    g.fillText(`${chassis.cls.toUpperCase()}  walks ${chassis.speed}, runs ${Math.floor(chassis.speed * RUN_FACTOR)}`, x + 90, y + 138);
    g.fillText(`weapon slots ${used} of ${chassis.capacity} used`, x + 90, y + 152);
    g.fillStyle = COLOURS.text; g.fillText(`ARMOUR POINTS ${armourPoints(spec)}`, x + 90, y + 166);
    g.fillText(`THIS MECH COSTS ${cost}`, x + 90, y + 180);
    g.font = FONT_SMALL; g.fillStyle = COLOURS.text;
    g.fillText('ARMOUR', x + 8, y + 209); g.fillText(`${spec.armour} of ${ARMOUR_MAX}`, x + 186, y + 209);
    g.fillStyle = COLOURS.dim; g.fillText(`${ARMOUR_COST_PER_LEVEL[chassis.cls]} cr`, x + 266, y + 209);
    g.fillStyle = COLOURS.text; g.fillText('EXTRA SINKS', x + 8, y + 239); g.fillText(`${spec.sinks} of ${SINKS_MAX}`, x + 186, y + 239);
    g.fillStyle = COLOURS.dim; g.fillText(`${SINK_COST} cr`, x + 266, y + 239);
    g.fillStyle = heat.over ? COLOURS.warn : COLOURS.dim;
    g.fillText(heat.over ? `RUNS HOT: firing all makes ${heat.perRound} heat, cools ${heat.standingSinks} standing` : `heat from firing all ${heat.perRound}, cools ${heat.sinks}`, x + 8, y + BAY_COLUMN_H - 10);
  }

  g.font = FONT_SMALL; g.fillStyle = COLOURS.dim;
  const fm = bay.focus.mech, fspec = bay.mechs[fm];
  g.fillText(fspec ? `WEAPON FOR MECH ${fm + 1}, SLOT ${bay.focus.slot + 1}   (click a slot above to choose which slot)` : `Pick a chassis for mech ${fm + 1}, then its weapons`, 16, BAY_PALETTE_Y + 14);

  let lx = 720; // the key to the weapon badges, at the right of the palette heading
  for (const type of Object.values(WEAPON_TYPES)) {
    drawBadge(g, type, lx, BAY_PALETTE_Y + 3, false);
    g.font = FONT_SMALL; g.fillStyle = COLOURS.dim; g.textAlign = 'left'; g.fillText(type.name.toLowerCase(), lx + 20, BAY_PALETTE_Y + 14);
    lx += 24 + type.name.length * 7;
  }

  const tipButton = view.buttons.find(b => b.id === view.hover);
  g.font = FONT_SMALL; g.fillStyle = tipButton && tipButton.state === 'disabled' ? '#ff9a8a' : COLOURS.text;
  g.fillText(tipButton ? tipButton.tip : '', 16, 596);
  for (const b of view.buttons) {
    if (b.id === 'enemy') drawEnemyButton(g, b, b.id === view.hover); else drawBayButton(g, b, b.id === view.hover);
  }

  panel(g, 16, 606, 600, 36);
  g.font = 'bold 15px ' + MONO; g.textAlign = 'left';
  if (report.code) { g.fillStyle = COLOURS.text; g.fillText('CODE  ' + report.code, 26, 629); }
  else { g.fillStyle = '#ff9a8a'; g.fillText('NO CODE YET: ' + report.problems[0], 26, 629); }
  g.font = FONT; g.fillStyle = view.statusBad ? '#ff7b6b' : COLOURS.warn; g.fillText(view.status || '', 16, 670);
  g.font = FONT_SMALL; g.fillStyle = COLOURS.dim; g.textAlign = 'right';
  g.fillText('The code is the whole squad: copy it, or LOAD CODE to type or paste one.  ENTER = fight', 1008, 670);
  g.textAlign = 'left';
}

// ---------- the whole frame ----------
// view = {
//   state, clock, seed, debug, camera { zoom, fx, fy, sx, sy } or null,
//   banner { text, colour }, status, help, log, result or null,
//   active (the mech being asked about or acting, or null), reach { walk, run } (while a move is asked), hover,
//   hoverMech, finder { mechId, path, mode, lines } (the range finder under the cursor), heatGhost (planned heat of
//   the active mech), aim [{ from, to, mechId }] (weapons already locked), weapon { mechId, slot, name, targetId,
//   status, validIds, lockText } (the weapon being asked about), pose(mech), flash (Map id -> until),
//   volley { local, projectiles }
// }
function drawFrame(g, view) {
  const { state } = view;
  drawClock = view.clock;
  drawHeist = !!state.objective && state.objective.id === 'heist';
  g.fillStyle = COLOURS.bg; g.fillRect(0, 0, VIEW_W, VIEW_H);
  g.save();
  const pad = mapLayout.pad;
  g.beginPath(); g.rect(VIEWPORT.x - pad, VIEWPORT.y - pad, VIEWPORT.w + 2 * pad, VIEWPORT.h + 2 * pad); g.clip(); // nothing of the map spills onto the panel, the header or the help
  if (view.camera) {
    const c = view.camera;
    g.translate(VIEW_W / 2 + c.sx, VIEW_H / 2 + c.sy); g.scale(c.zoom, c.zoom); g.translate(-c.fx, -c.fy);
  }
  // the part of the map's picture in the viewport, in whole pixels (the same size at the source and the destination, so it is copied, not resampled)
  const showW = Math.min(Math.ceil(VIEWPORT.w) + 2 * pad, mapCanvas.width - mapScroll.x), showH = Math.min(Math.ceil(VIEWPORT.h) + 2 * pad, mapCanvas.height - mapScroll.y);
  g.drawImage(mapCanvas, mapScroll.x, mapScroll.y, showW, showH, VIEWPORT.x + mapLayout.offX - pad, VIEWPORT.y + mapLayout.offY - pad, showW, showH);
  drawObjectiveOverlay(g, state, view.clock);

  const active = view.active ? mechById(state, view.active) : null;

  // movement range of the mech being asked, as outlines: orange around everything it could reach by running, blue
  // around what it could reach by walking (drawn on top, since the walk range sits inside the run range)
  if (active && view.reach) {
    drawRegionOutline(g, view.reach.run, COLOURS.runEdge, 4);
    drawRegionOutline(g, view.reach.walk, COLOURS.walkEdge, 3);
  }
  if (view.hover && !view.volley && !view.pose) fillHex(g, view.hover[0], view.hover[1], COLOURS.hover, null);

  // the weapons locked so far this turn
  for (const line of view.aim || []) drawLineBetweenHexes(g, line.from, line.to, aimLineColour(line.mechId), 2, false);
  if (view.finder) drawPlannedPath(g, mechById(state, view.finder.mechId), mechById(state, view.finder.mechId).pos, view.finder.path, view.finder.mode, 0.6);
  if (view.weapon) drawWeaponOverlay(g, state, view.weapon);

  // wrecks, then the living; the highlighted mech gets a pulsing ring under its sprite
  for (const mech of state.mechs) if (!mech.alive) drawMechAt(g, mech, ...hexToScreen(mech.pos[0], mech.pos[1]), mech.facing, 1, false);
  if (active && active.alive) {
    const activePose = view.pose ? view.pose(active) : null; // the ring follows the mech while it walks
    const [rx, ry] = activePose ? [activePose.x, activePose.y] : hexToScreen(active.pos[0], active.pos[1]);
    const pulse = Math.sin(view.clock * 7);
    hexPathOn(g, rx, ry, HEX_R - 1);
    g.fillStyle = `rgba(255,255,255,${0.10 + 0.06 * pulse})`; g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 3 + pulse * 1.2; g.stroke();
  }
  for (const mech of livingMechs(state)) {
    const pose = view.pose ? view.pose(mech) : null;
    const [x, y] = pose ? [pose.x, pose.y] : hexToScreen(mech.pos[0], mech.pos[1]);
    drawMechAt(g, mech, x, y, pose ? pose.facing : mech.facing, 1, view.flash && view.flash.get(mech.id) > view.clock);
    drawMechLabel(g, mech, x, y);
  }

  drawRepairBays(g, state.map);
  drawSmoke(g, state.map, view.clock);
  for (const id of view.destruct || []) { // a mech that will self-destruct: its blast radius, pulsing red
    const bomber = mechById(state, id);
    const pulse = 0.5 + 0.5 * Math.sin(view.clock * 9);
    for (const n of neighbours(state.map, bomber.pos[0], bomber.pos[1])) fillHex(g, n.c, n.r, `rgba(255,70,50,${0.12 + 0.1 * pulse})`, 'rgba(255,90,60,0.7)', 2);
    fillHex(g, bomber.pos[0], bomber.pos[1], `rgba(255,70,50,${0.25 + 0.2 * pulse})`, '#ff5a4a', 3);
    const [bx, by] = hexToScreen(bomber.pos[0], bomber.pos[1]);
    g.fillStyle = '#ff7b6b'; g.font = 'bold 11px ' + MONO; g.textAlign = 'center'; g.fillText('BOOM', bx, by - HEX_R + 2); g.textAlign = 'left';
  }
  if (view.volley) for (const p of view.volley.projectiles) drawProjectile(g, p, view.volley.local);
  fxDraw(g, view.clock);

  if (view.finder && view.finder.lines.length) drawInfoBox(g, view.finder.path.length ? view.finder.path[view.finder.path.length - 1] : mechById(state, view.finder.mechId).pos, view.finder.lines);
  if (view.weapon && view.weapon.status) drawInfoBox(g, mechById(state, view.weapon.targetId).pos, weaponCalloutLines(view.weapon));
  g.restore();
  if (state.weather === 'storm') drawStorm(g, view.clock); // over the viewport, in screen space (it does not zoom with the camera)
  drawEdgeArrows(g, state, view);
  drawMinimap(g, state, view);

  // header, banner, instruction, the unit panel, the log and the help
  g.font = FONT_SMALL; g.fillStyle = COLOURS.dim; g.textAlign = 'left';
  const goal = objectiveStatus(state);
  g.fillText(`HEXFIRE   ${state.map.name}   ${goal.name}   ${goal.lines.length ? goal.lines.join('   ') : 'ROUND ' + state.round}`, 16, 22);
  g.textAlign = 'right'; g.fillText(`SEED ${view.seed}`, 1008, 22); g.textAlign = 'left';
  if (view.debug) g.fillText(view.debug, 480, 22);
  if (view.debug2) g.fillText(view.debug2, 380, 38);
  if (view.banner) { g.font = 'bold 22px ' + MONO; g.fillStyle = view.banner.colour; g.fillText(view.banner.text, 16, 50); }
  g.font = FONT; g.fillStyle = COLOURS.warn; g.fillText(view.status || '', 16, 70);
  const cardMech = view.hoverMech || active; // the mech under the cursor, else the highlighted mech (the enemy's too, in its turn)
  drawCardSlot(g, cardMech, active ? { mechId: active.id, slot: view.weapon ? view.weapon.slot : -1, heatGhost: view.heatGhost } : null);
  const mini = minimapShown(view);
  drawLog(g, view.log || [], view.logHeader, mini ? miniGeometry(mapLayout).panelY - 8 : 636);
  drawHelp(g, view.help);
  if (view.result) drawResult(g, view.result);
}
