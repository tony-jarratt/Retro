'use strict';

const OY = 48; // height of the HUD bar above the playfield
const VIEW_W = COLS * T, VIEW_H = ROWS * T + OY;
const FONT = '"Trebuchet MS", Verdana, sans-serif';
const TITLE_FONT = 'Georgia, "Times New Roman", serif';

const THEMES = {
  living:   { wall: ['#4a1c3a', '#2a0f2c'], paper: 'rgba(255,215,140,0.06)', plank: '#9b6a3c', hi: '#d9a066', lo: '#5c3a1e' },
  kitchen:  { wall: ['#15474a', '#0b2a33'], paper: 'rgba(255,255,255,0.06)', plank: '#b98a52', hi: '#ecc088', lo: '#6a4a26' },
  bedroom:  { wall: ['#34286a', '#1a1440'], paper: 'rgba(255,255,255,0.07)', plank: '#8a6a4a', hi: '#c9a57a', lo: '#523a22' },
  hall:     { wall: ['#4a3322', '#26180e'], paper: 'rgba(255,200,120,0.06)', plank: '#7a4e2c', hi: '#c08a52', lo: '#46280f' },
  workshop: { wall: ['#14452a', '#0a2616'], paper: 'rgba(255,230,120,0.06)', plank: '#a0723a', hi: '#e0aa66', lo: '#5a3a18' },
};

// ---------- drawing helpers ----------
function circ(g, x, y, r, fill) { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
function ell(g, x, y, rx, ry, fill, rot = 0) { g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill(); }
function rrect(g, x, y, w, h, r, fill) { g.fillStyle = fill; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); }
function poly(g, pts, fill) {
  g.fillStyle = fill; g.beginPath(); g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath(); g.fill();
}
function line(g, x1, y1, x2, y2, w, color) {
  g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
}
function text(str, x, y, size, color, align = 'left', font = FONT, shadow = false) {
  ctx.font = `bold ${size}px ${font}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(str, x + 2, y + 2); }
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}

// ---------- static background (rendered once per level) ----------
function drawWindow(g, x, y, w, h, seed) {
  rrect(g, x - 5, y - 5, w + 10, h + 10, 6, '#e8d3a8');
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  const sky = g.createLinearGradient(x, y, x, y + h);
  sky.addColorStop(0, '#0a1440'); sky.addColorStop(1, '#335a9a');
  g.fillStyle = sky; g.fillRect(x, y, w, h);
  for (let k = 0; k < 9; k++) {
    circ(g, x + ((seed * 37 + k * 53) % w), y + ((seed * 17 + k * 29) % Math.floor(h * 0.6)), 1.2, 'rgba(255,255,255,0.85)');
  }
  circ(g, x + w * 0.78, y + h * 0.28, 7, '#fff6c8');
  circ(g, x + w * 0.78 + 3, y + h * 0.28 - 2, 6, '#1a2a66');
  ell(g, x + w * 0.25, y + h + 6, w * 0.6, h * 0.28, '#eef4ff');
  ell(g, x + w * 0.85, y + h + 8, w * 0.5, h * 0.22, '#dfe9fb');
  g.restore();
  line(g, x + w / 2, y, x + w / 2, y + h, 3, '#e8d3a8');
  line(g, x, y + h / 2, x + w, y + h / 2, 3, '#e8d3a8');
  poly(g, [x - 5, y - 5, x + 14, y - 5, x + 6, y + h + 5, x - 5, y + h + 5], 'rgba(190,40,60,0.85)');
  poly(g, [x + w + 5, y - 5, x + w - 14, y - 5, x + w - 6, y + h + 5, x + w + 5, y + h + 5], 'rgba(190,40,60,0.85)');
}

function areaClear(lv, c0, r0, c1, r1) {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (tileAt(lv, c, r) !== '.') return false;
  return true;
}

const RESERVED = { kitchen: [[10, 15, 21, 18]], bedroom: [[11, 15, 17, 18]], hall: [[13, 15, 22, 18]], workshop: [[5, 15, 29, 18]], living: [[13, 15, 20, 18]] }; // [c0, r0, c1, r1] kept free of windows

// Draws the windows and returns their glass rectangles (used for the owl / shooting star events).
function placeWindows(g, lv) {
  const reserved = RESERVED[lv.theme] || [];
  const wins = [];
  const zones = [0, ...[...new Set(lv.floorRows)].sort((a, b) => a - b)];
  zones.forEach((z, i) => {
    const next = i + 1 < zones.length ? zones[i + 1] : ROWS - 1;
    const r0 = z === 0 ? 2 : z + 1;
    if (next - r0 < 3) return;
    const shift = (i * 4) % 6;
    for (let c0 = 3 + shift; c0 + 3 <= COLS - 3; c0 += 7) {
      if (areaClear(lv, c0, r0, c0 + 2, r0 + 1) && !reserved.some(([a, b, c, d]) => c0 <= c && c0 + 2 >= a && r0 <= d && r0 + 1 >= b)) {
        drawWindow(g, c0 * T, r0 * T, 3 * T, 2 * T, c0 + z);
        wins.push({ x: c0 * T, y: r0 * T, w: 3 * T, h: 2 * T, c0, r0 });
      }
    }
  });
  return wins;
}

// ---------- small wall decorations for the upper floors (sparse, in clear spots only) ----------
// Each draws inside a 2x2-tile slot whose top-left corner is (x, y).
const DECOR_DRAW = {
  clock(g, x, y) {
    circ(g, x + 32, y + 28, 16, '#5a3820'); circ(g, x + 32, y + 28, 13, '#efe3bd');
    for (let k = 0; k < 4; k++) circ(g, x + 32 + Math.cos(k * Math.PI / 2) * 10, y + 28 + Math.sin(k * Math.PI / 2) * 10, 1.2, '#5a3820');
    line(g, x + 32, y + 28, x + 32, y + 20, 1.8, '#333'); line(g, x + 32, y + 28, x + 38, y + 31, 1.8, '#333');
  },
  picture(g, x, y) {
    rrect(g, x + 10, y + 8, 44, 34, 3, '#7a4e2c');
    const sky = g.createLinearGradient(0, y + 12, 0, y + 38); sky.addColorStop(0, '#16215a'); sky.addColorStop(1, '#4a6fb0');
    g.fillStyle = sky; g.fillRect(x + 14, y + 12, 36, 26);
    circ(g, x + 42, y + 19, 4, '#fff6c8'); ell(g, x + 28, y + 40, 22, 8, '#eef4ff');
    poly(g, [x + 24, y + 36, x + 30, y + 22, x + 36, y + 36], '#2f9e4a');
  },
  wreath(g, x, y) {
    g.strokeStyle = '#2f9e4a'; g.lineWidth = 8; g.beginPath(); g.arc(x + 32, y + 28, 14, 0, Math.PI * 2); g.stroke();
    for (let k = 0; k < 6; k++) circ(g, x + 32 + Math.cos(k * 1.05) * 14, y + 28 + Math.sin(k * 1.05) * 14, 2, '#e63946');
    poly(g, [x + 32, y + 42, x + 24, y + 50, x + 26, y + 40], '#e63946'); poly(g, [x + 32, y + 42, x + 40, y + 50, x + 38, y + 40], '#e63946');
  },
  stockings(g, x, y) {
    line(g, x + 6, y + 10, x + 58, y + 10, 2, '#6a4a2c');
    for (const [sx, col] of [[16, '#d63a3a'], [40, '#2f9e4a']]) {
      rrect(g, x + sx, y + 10, 12, 20, 2, col); ell(g, x + sx + 7, y + 31, 8, 4, col); rrect(g, x + sx - 1, y + 10, 14, 5, 2, '#fff');
    }
  },
  shelf(g, x, y) {
    rrect(g, x + 4, y + 36, 56, 5, 2, '#6a4a2c');
    rrect(g, x + 10, y + 18, 8, 18, 1, '#3b82f6'); rrect(g, x + 19, y + 22, 7, 14, 1, '#e63946'); rrect(g, x + 27, y + 16, 8, 20, 1, '#2f9e4a');
    rrect(g, x + 42, y + 26, 10, 10, 2, '#f2f2f2'); ell(g, x + 47, y + 26, 5, 2, '#a05a2c');
  },
  pots(g, x, y) {
    line(g, x + 6, y + 10, x + 58, y + 10, 2.5, '#6b7280');
    for (const [px, len] of [[16, 12], [34, 16], [50, 10]]) {
      line(g, x + px, y + 10, x + px, y + 10 + len, 1.5, '#6b7280'); rrect(g, x + px - 7, y + 10 + len, 14, 11, 3, '#b87333');
    }
  },
  star(g, x, y) {
    circ(g, x + 32, y + 28, 15, '#7a4e2c'); circ(g, x + 32, y + 28, 12, '#a8703c');
    const pts = []; for (let k = 0; k < 10; k++) { const r = k % 2 ? 4.5 : 10, a = -Math.PI / 2 + k * Math.PI / 5; pts.push(x + 32 + Math.cos(a) * r, y + 28 + Math.sin(a) * r); }
    poly(g, pts, '#ffd84d');
  },
  bunting(g, x, y) {
    g.strokeStyle = '#6a4a2c'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + 2, y + 10); g.quadraticCurveTo(x + 32, y + 26, x + 62, y + 10); g.stroke();
    for (let k = 0; k < 5; k++) {
      const t = (k + 0.5) / 5, fx = x + 2 + 60 * t, fy = y + 10 + 12 * Math.sin(Math.PI * t) * 1.0;
      poly(g, [fx - 5, fy, fx + 5, fy, fx, fy + 11], ['#e63946', '#f2f2f2', '#2f9e4a', '#f2c94c', '#3b82f6'][k]);
    }
  },
  hooks(g, x, y) {
    rrect(g, x + 4, y + 10, 56, 6, 2, '#6a4a2c');
    rrect(g, x + 8, y + 16, 16, 28, 4, '#7c4dbd'); rrect(g, x + 5, y + 18, 5, 18, 2, '#7c4dbd');
    for (let k = 0; k < 5; k++) rrect(g, x + 29, y + 16 + k * 5, 8, 4, 1, k % 2 ? '#fff' : '#d63a3a'); // scarf
    poly(g, [x + 44, y + 28, x + 56, y + 28, x + 50, y + 16], '#2f9e4a'); circ(g, x + 50, y + 15, 2.5, '#fff'); // hat
  },
  pegboard(g, x, y) {
    rrect(g, x + 6, y + 8, 52, 40, 3, '#c9a46a');
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) circ(g, x + 12 + c * 8.5, y + 16 + r * 12, 1, 'rgba(0,0,0,0.3)');
    line(g, x + 16, y + 16, x + 16, y + 34, 3, '#8a5a34'); rrect(g, x + 11, y + 13, 11, 5, 1, '#9aa5b1'); line(g, x + 38, y + 14, x + 38, y + 38, 2.5, '#9aa5b1');
  },
};
const DECOR_BY_THEME = {
  living: ['picture', 'wreath', 'stockings', 'clock'],
  kitchen: ['clock', 'pots', 'shelf', 'star'],
  bedroom: ['picture', 'shelf', 'bunting', 'clock'],
  hall: ['picture', 'clock', 'hooks', 'wreath'],
  workshop: ['clock', 'shelf', 'pegboard', 'star'],
};

function seeded(n) { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); }

// At most one piece per floor zone (and not every zone), placed where 2x2 tiles are clear and no window is near.
function placeDecor(g, lv, wins) {
  const kinds = DECOR_BY_THEME[lv.theme];
  const zones = [0, ...[...new Set(lv.floorRows)].sort((a, b) => a - b)];
  zones.forEach((z, i) => {
    const next = i + 1 < zones.length ? zones[i + 1] : ROWS - 1;
    if (next === ROWS - 1) return; // the ground floor has its own props
    const r0 = z === 0 ? 2 : z + 1;
    if (next - r0 < 3 || seeded(lv.index * 17 + i * 31 + 1) > 0.7) return;
    const spots = [];
    for (let c = 1; c <= COLS - 3; c++) {
      const nearWindow = wins.some((w) => w.r0 === r0 && c <= w.c0 + 3 && c + 1 >= w.c0 - 1);
      if (!nearWindow && areaClear(lv, c, r0, c + 1, r0 + 1)) spots.push(c);
    }
    if (!spots.length) return;
    const c = spots[Math.floor(seeded(lv.index * 7 + i * 13 + 5) * spots.length)];
    DECOR_DRAW[kinds[Math.floor(seeded(lv.index * 5 + i * 3 + 2) * kinds.length)]](g, c * T, r0 * T);
  });
}

function garlandY(x) { return 36 + 11 * Math.sin(Math.PI * (((x - 32) % 192) / 192)); }

function drawProps(g, theme) {
  const gy = ROWS * T - T; // top of the ground floor
  if (theme === 'living') { // fireplace, within the ground-floor zone (gy - 90 .. gy)
    const fx = 15 * T, fw = 112;
    rrect(g, fx, gy - 82, fw, 82, 4, '#7a3b2e');
    for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(fx + 2, gy - 62 + k * 22, fw - 4, 2); } // brickwork
    rrect(g, fx + 20, gy - 56, fw - 40, 56, 26, '#1b0c0c'); // opening
    ell(g, fx + fw / 2, gy - 10, 22, 12, 'rgba(255,150,40,0.85)');
    ell(g, fx + fw / 2, gy - 14, 11, 18, 'rgba(255,220,90,0.9)');
    rrect(g, fx - 6, gy - 92, fw + 12, 10, 3, '#5b3a22'); // mantel
    for (let i = 0; i < 3; i++) {
      const sx = fx + 8 + i * 40;
      poly(g, [sx, gy - 82, sx + 8, gy - 82, sx + 4, gy - 54], ['#d63a3a', '#2f9e4a', '#d63a3a'][i]);
      rrect(g, sx - 1, gy - 84, 10, 5, 2, '#fff');
    }
  } else if (theme === 'kitchen') {
    // Everything fits in the 96px between the floor above and the ground (gy - 88 .. gy).
    const fx = 10 * T; // fridge
    rrect(g, fx, gy - 88, 56, 88, 6, '#e8edf2'); rrect(g, fx, gy - 88, 56, 88, 6, 'rgba(0,0,0,0.08)');
    rrect(g, fx + 2, gy - 86, 52, 84, 5, '#f4f7fa');
    g.fillStyle = '#c3ccd6'; g.fillRect(fx + 2, gy - 52, 52, 3);
    rrect(g, fx + 44, gy - 80, 4, 20, 2, '#8a94a0'); rrect(g, fx + 44, gy - 44, 4, 28, 2, '#8a94a0');
    rrect(g, fx + 10, gy - 76, 16, 14, 2, '#e63946'); rrect(g, fx + 10, gy - 60, 12, 10, 2, '#f2c94c'); // fridge magnets/notes
    const cx = 12 * T + 16; // counter with sink
    rrect(g, cx, gy - 52, 6 * T - 16, 52, 3, '#b98a52');
    rrect(g, cx - 4, gy - 58, 6 * T - 8, 8, 3, '#e8e2d0');
    for (let i = 0; i < 4; i++) {
      rrect(g, cx + 8 + i * 42, gy - 42, 36, 36, 3, '#9c7040');
      rrect(g, cx + 8 + i * 42 + 15, gy - 38, 6, 3, 1, '#e8d3a8');
    }
    rrect(g, cx + 20, gy - 62, 48, 6, 3, '#9aa5b1'); // sink
    line(g, cx + 44, gy - 62, cx + 44, gy - 78, 4, '#9aa5b1'); line(g, cx + 44, gy - 78, cx + 54, gy - 78, 4, '#9aa5b1');
    rrect(g, cx + 108, gy - 70, 30, 12, 3, '#d9a066'); // tray of cookies
    for (let i = 0; i < 3; i++) circ(g, cx + 116 + i * 9, gy - 74, 5, '#c98a4a');
    const sx = 18 * T + 16; // stove
    rrect(g, sx, gy - 56, 64, 56, 4, '#4b5360'); rrect(g, sx + 8, gy - 38, 48, 28, 3, '#2a2f38');
    rrect(g, sx + 14, gy - 32, 36, 16, 2, '#1a1e24');
    rrect(g, sx - 2, gy - 60, 68, 6, 3, '#6b7480');
    rrect(g, sx + 10, gy - 76, 24, 16, 3, '#c0392b'); rrect(g, sx + 8, gy - 78, 28, 4, 2, '#8e2a20'); // pot
    ell(g, sx + 22, gy - 84, 6, 4, 'rgba(255,255,255,0.35)'); ell(g, sx + 26, gy - 92, 5, 3, 'rgba(255,255,255,0.25)'); // steam
    rrect(g, sx + 40, gy - 66, 18, 4, 2, '#9aa5b1');
  } else if (theme === 'bedroom') {
    // A single bed that fits in the ground-floor zone (gy - 88 .. gy).
    const bx = 12 * T;
    rrect(g, bx, gy - 26, 140, 18, 4, '#6a4a2c'); // frame
    rrect(g, bx, gy - 8, 8, 8, 2, '#4a3220'); rrect(g, bx + 132, gy - 8, 8, 8, 2, '#4a3220'); // legs
    rrect(g, bx - 4, gy - 62, 10, 54, 4, '#6a4a2c'); // headboard
    rrect(g, bx + 134, gy - 44, 8, 36, 3, '#6a4a2c'); // footboard
    rrect(g, bx + 6, gy - 40, 128, 18, 6, '#d63a3a'); // duvet
    for (let i = 0; i < 5; i++) rrect(g, bx + 14 + i * 24, gy - 40, 10, 18, 3, '#fff');
    rrect(g, bx + 8, gy - 50, 34, 14, 7, '#fff'); // pillow
  } else if (theme === 'hall') {
    // Grandfather clock and potted plant, both within the ground-floor zone (gy - 88 .. gy).
    const kx = 13.5 * T;
    rrect(g, kx, gy - 88, 34, 88, 4, '#5a3820');
    rrect(g, kx + 4, gy - 84, 26, 26, 13, '#f2e6c8');
    line(g, kx + 17, gy - 71, kx + 17, gy - 78, 1.5, '#333'); line(g, kx + 17, gy - 71, kx + 22, gy - 69, 1.5, '#333');
    rrect(g, kx + 6, gy - 52, 22, 42, 3, '#3a2412');
    ell(g, kx + 17, gy - 30, 5, 5, '#e0b040'); // pendulum
    rrect(g, kx - 3, gy - 6, 40, 6, 2, '#46280f');
    const px = 21 * T;
    rrect(g, px - 12, gy - 20, 24, 20, 3, '#7a4e2c'); rrect(g, px - 14, gy - 22, 28, 5, 2, '#96623a');
    for (let i = 0; i < 5; i++) ell(g, px + (i - 2) * 6, gy - 36 - (i % 2) * 6, 5, 13, '#2f9e4a', (i - 2) * 0.35);
  } else if (theme === 'workshop') {
    drawWorkshopProps(g, gy);
  }
}

// Workshop ground floor, all within gy - 88 .. gy: workbench, toy machine with conveyor, toy shelf.
function drawWorkshopProps(g, gy) {
  const giftBox = (x, y, w, h, col) => {
    rrect(g, x, y, w, h, 2, col);
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(x + w / 2 - 1.5, y, 3, h); g.fillRect(x, y + h / 2 - 1.5, w, 3);
    circ(g, x + w / 2 - 3, y - 2, 2.5, '#fff'); circ(g, x + w / 2 + 3, y - 2, 2.5, '#fff');
  };
  const cog = (cx, cy, r, col) => {
    circ(g, cx, cy, r, col);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      rrect(g, cx + Math.cos(a) * r - 3.5, cy + Math.sin(a) * r - 3.5, 7, 7, 2, col);
    }
    circ(g, cx, cy, r * 0.55, 'rgba(0,0,0,0.25)'); circ(g, cx, cy, r * 0.22, '#e6c34a');
  };

  // --- workbench with pegboard (x 6..10 tiles) ---
  const bx = 6 * T;
  rrect(g, bx, gy - 86, 132, 44, 3, '#b58b55');
  for (let r = 0; r < 3; r++) for (let c = 0; c < 12; c++) circ(g, bx + 8 + c * 10.5, gy - 78 + r * 14, 1.1, 'rgba(0,0,0,0.3)');
  line(g, bx + 18, gy - 76, bx + 18, gy - 56, 4, '#8a5a34'); rrect(g, bx + 10, gy - 80, 16, 7, 2, '#9aa5b1'); // hammer
  line(g, bx + 50, gy - 78, bx + 50, gy - 50, 3, '#9aa5b1'); // spanner
  circ(g, bx + 50, gy - 80, 5, 'rgba(0,0,0,0)'); g.strokeStyle = '#9aa5b1'; g.lineWidth = 3; g.beginPath(); g.arc(bx + 50, gy - 80, 5, 0, 7); g.stroke();
  poly(g, [bx + 78, gy - 78, bx + 104, gy - 70, bx + 78, gy - 62], '#cfd6e0'); rrect(g, bx + 70, gy - 78, 9, 16, 2, '#d63a3a'); // saw
  rrect(g, bx - 2, gy - 42, 136, 7, 2, '#7a4e2c'); // bench top
  rrect(g, bx + 4, gy - 35, 8, 35, 2, '#6a4a2c'); rrect(g, bx + 120, gy - 35, 8, 35, 2, '#6a4a2c');
  rrect(g, bx + 12, gy - 18, 108, 5, 2, '#6a4a2c');
  rrect(g, bx + 14, gy - 54, 30, 12, 3, '#d63a3a'); rrect(g, bx + 32, gy - 62, 12, 8, 2, '#c0392b'); // toy train
  circ(g, bx + 21, gy - 42, 4, '#333'); circ(g, bx + 37, gy - 42, 4, '#333');
  rrect(g, bx + 46, gy - 50, 18, 8, 2, '#2f9e4a'); circ(g, bx + 51, gy - 42, 3, '#333'); circ(g, bx + 60, gy - 42, 3, '#333');
  giftBox(bx + 92, gy - 54, 22, 12, '#3b82f6');

  // --- toy machine with a conveyor of wrapped presents (x 13..21 tiles) ---
  const mx = 13 * T;
  rrect(g, mx, gy - 74, 64, 74, 6, '#4b5563'); rrect(g, mx + 4, gy - 70, 56, 66, 4, '#6b7280');
  cog(mx + 22, gy - 40, 17, '#8b95a3'); cog(mx + 46, gy - 52, 11, '#a3acb8');
  rrect(g, mx + 8, gy - 20, 26, 10, 2, '#1f2937');
  poly(g, [mx + 14, gy - 86, mx + 50, gy - 86, mx + 42, gy - 74, mx + 22, gy - 74], '#9aa5b1'); // funnel
  circ(g, mx + 52, gy - 66, 3, '#e63946'); circ(g, mx + 52, gy - 58, 3, '#7dff7a'); // indicator lights
  rrect(g, mx + 64, gy - 22, 8 * T - 64 - 20, 8, 3, '#374151'); // belt
  for (let i = 0; i < 6; i++) circ(g, mx + 72 + i * 28, gy - 12, 6, '#4b5563');
  g.fillStyle = 'rgba(255,255,255,0.18)'; for (let i = 0; i < 9; i++) g.fillRect(mx + 70 + i * 18, gy - 21, 8, 2);
  giftBox(mx + 80, gy - 40, 20, 18, '#e63946'); giftBox(mx + 122, gy - 38, 18, 16, '#f2c94c'); giftBox(mx + 164, gy - 42, 22, 20, '#3b82f6');

  // --- toy shelf and rocking horse (x 23..29 tiles) ---
  const sx = 23 * T;
  rrect(g, sx, gy - 54, 4 * T, 6, 2, '#7a4e2c');
  giftBox(sx + 8, gy - 74, 20, 20, '#2f9e4a'); giftBox(sx + 34, gy - 68, 16, 14, '#ff4d8d');
  circ(g, sx + 68, gy - 64, 8, '#c9a46a'); circ(g, sx + 68, gy - 76, 5.5, '#c9a46a'); circ(g, sx + 63, gy - 80, 2.5, '#c9a46a'); circ(g, sx + 73, gy - 80, 2.5, '#c9a46a'); // teddy
  rrect(g, sx + 92, gy - 84, 9, 30, 2, '#d63a3a'); rrect(g, sx + 94, gy - 90, 5, 6, 1, '#2b2b2b'); // toy soldier
  circ(g, sx + 96.5, gy - 78, 3, '#f6c9a0');
  // rocking horse on the floor
  const hx = 27 * T + 16;
  g.strokeStyle = '#8a5a34'; g.lineWidth = 4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(hx - 26, gy - 8); g.quadraticCurveTo(hx, gy + 2, hx + 26, gy - 8); g.stroke();
  line(g, hx - 10, gy - 8, hx - 8, gy - 26, 3, '#a8703c'); line(g, hx + 12, gy - 8, hx + 10, gy - 26, 3, '#a8703c');
  ell(g, hx, gy - 32, 18, 9, '#c9a46a');
  poly(g, [hx + 10, gy - 38, hx + 20, gy - 58, hx + 30, gy - 44, hx + 18, gy - 34], '#c9a46a');
  circ(g, hx + 24, gy - 52, 1.8, '#222'); poly(g, [hx + 16, gy - 56, hx + 18, gy - 64, hx + 21, gy - 56], '#8a5a34');
  line(g, hx + 12, gy - 54, hx + 8, gy - 38, 4, '#d63a3a'); line(g, hx - 17, gy - 34, hx - 24, gy - 24, 3, '#d63a3a');
  rrect(g, hx - 6, gy - 44, 14, 6, 2, '#2f9e4a'); // saddle
}

function drawTile(g, th, ch, c, r) {
  const x = c * T, y = r * T;
  if (ch === 'i') {
    const ice = g.createLinearGradient(0, y + 4, 0, y + T);
    ice.addColorStop(0, '#eaf9ff'); ice.addColorStop(0.5, '#a9dcf5'); ice.addColorStop(1, '#5b9ad0');
    rrect(g, x, y + 4, T, T - 4, 3, ice);
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(x, y + 4, T, 3);
    g.fillStyle = 'rgba(255,255,255,0.3)'; poly(g, [x + 18, y + 10, x + 27, y + 10, x + 19, y + 20, x + 12, y + 20], 'rgba(255,255,255,0.3)');
    line(g, x + 5, y + 14, x + 12, y + 20, 1.2, 'rgba(255,255,255,0.55)'); line(g, x + 12, y + 20, x + 10, y + 27, 1.2, 'rgba(255,255,255,0.55)');
    if ((c * 5 + r) % 3 === 0) poly(g, [x + 7, y + T, x + 15, y + T, x + 11, y + T + 10], '#d3f0ff');
    if ((c * 7 + r) % 4 === 1) poly(g, [x + 20, y + T, x + 25, y + T, x + 22, y + T + 6], '#d3f0ff');
  } else if (ch === '=' || ch === 'T') {
    rrect(g, x, y + 4, T, T - 4, 2, th.plank);
    g.fillStyle = th.hi; g.fillRect(x, y + 5, T, 3);
    g.fillStyle = th.lo; g.fillRect(x, y + T - 5, T, 5);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + T - 1, y + 8, 1, T - 14);
    // candy-cane trim along the top edge
    for (let k = 0; k < 4; k++) {
      g.fillStyle = k % 2 ? '#fff' : '#d63a3a';
      g.beginPath(); g.moveTo(x + k * 8, y + 4); g.lineTo(x + k * 8 + 8, y + 4); g.lineTo(x + k * 8 + 5, y); g.lineTo(x + k * 8 - 3, y); g.closePath(); g.fill();
    }
  } else if (ch === '#') {
    g.fillStyle = r === ROWS - 1 ? '#4a2c1a' : '#2a1a14'; g.fillRect(x, y, T, T);
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x + 2, y + 2, T - 4, 3);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + T - 3, T, 3);
    if (r === ROWS - 1) { // gingerbread floor with icing
      g.fillStyle = '#fff';
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k <= 4; k++) g.quadraticCurveTo(x + k * 8 + 4, y + 10 + (c % 2) * 3, x + (k + 1) * 8, y + 3);
      g.lineTo(x + T, y); g.closePath(); g.fill();
    }
  }
  if (ch === 'H' || ch === 'T') {
    const top = ch === 'T' ? y - 10 : y;
    rrect(g, x + 7, top, 4, y + T - top, 2, '#b07a3a');
    rrect(g, x + 21, top, 4, y + T - top, 2, '#b07a3a');
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + 8, top, 1, y + T - top); g.fillRect(x + 22, top, 1, y + T - top);
    for (let k = ch === 'T' ? 4 : 6; k < T; k += 16) rrect(g, x + 7, y + k, 18, 4, 1, '#d9a066');
  }
}

function renderBackground(lv) {
  const cv = document.createElement('canvas');
  cv.width = VIEW_W; cv.height = ROWS * T;
  const g = cv.getContext('2d');
  const th = THEMES[lv.theme];
  const grad = g.createLinearGradient(0, 0, 0, ROWS * T);
  grad.addColorStop(0, th.wall[0]); grad.addColorStop(1, th.wall[1]);
  g.fillStyle = grad; g.fillRect(0, 0, VIEW_W, ROWS * T);
  g.fillStyle = th.paper;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if ((r + c) % 2) continue;
      const cx = c * T + T / 2, cy = r * T + T / 2;
      poly(g, [cx, cy - 6, cx + 5, cy, cx, cy + 6, cx - 5, cy], th.paper);
    }
  }
  const wins = placeWindows(g, lv);
  placeDecor(g, lv, wins);
  cv.windows = wins;
  drawProps(g, lv.theme);
  // garland rope
  g.strokeStyle = '#1f7a3a'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath();
  for (let x = 32; x <= VIEW_W - 32; x += 4) { if (x === 32) g.moveTo(x, garlandY(x)); else g.lineTo(x, garlandY(x)); }
  g.stroke();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) drawTile(g, th, lv.grid[r][c], c, r);
  return cv;
}

// ---------- item icons (centred on 0,0, about 26px across) ----------
function drawItemIcon(g, type, scale = 1) {
  g.save(); g.scale(scale, scale);
  if (type === 'g') {
    rrect(g, -11, -8, 22, 17, 2, '#c9a46a'); g.fillStyle = '#a9854d'; g.fillRect(-11, 5, 22, 4);
    g.fillStyle = '#efe0b8'; g.fillRect(-2, -8, 4, 17);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(-11, -8, 22, 3);
  } else if (type === 'p') {
    g.rotate(-0.4);
    rrect(g, -6, -12, 12, 24, 3, '#d63a3a');
    for (let k = 0; k < 4; k++) circ(g, -2 + (k % 2) * 5, -7 + k * 5, 1.6, '#fff');
    ell(g, 0, -12, 6, 2.5, '#f08080'); ell(g, 0, 12, 6, 2.5, '#a82828');
    rrect(g, 7, 2, 6, 10, 2, '#f0f0f0');
  } else if (type === 's') {
    line(g, -8, -10, 6, 4, 3, '#cfd6e0'); line(g, 8, -10, -6, 4, 3, '#cfd6e0');
    circ(g, -7, 8, 5, 'rgba(0,0,0,0)'); g.strokeStyle = '#f08a24'; g.lineWidth = 3;
    g.beginPath(); g.arc(-7, 8, 4.5, 0, 7); g.stroke(); g.beginPath(); g.arc(7, 8, 4.5, 0, 7); g.stroke();
  } else if (type === 'r') {
    circ(g, 0, 0, 11, '#f2f2f2'); circ(g, 0, 0, 8, '#ff4d8d'); circ(g, 0, 0, 3.5, '#f2f2f2');
    g.strokeStyle = '#ff4d8d'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(8, 6); g.bezierCurveTo(16, 8, 14, 14, 8, 12); g.stroke();
  } else if (type === 'w') {
    rrect(g, -11, -8, 22, 18, 2, '#2f9e4a'); g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let k = 0; k < 3; k++) g.fillRect(-9 + k * 8, -6, 3, 3);
    g.fillStyle = '#e63946'; g.fillRect(-2, -8, 4, 18); g.fillRect(-11, -1, 22, 4);
    poly(g, [0, -8, -8, -15, -3, -8], '#e63946'); poly(g, [0, -8, 8, -15, 3, -8], '#e63946'); circ(g, 0, -8, 2.5, '#f2c94c');
  }
  g.restore();
}

function drawItems(G, t) {
  for (const it of G.items) {
    if (it.taken) continue;
    const x = (it.c + 0.5) * T, y = (it.r + 1) * T - 14 + Math.sin(t * 0.08 + it.c) * 2.5;
    ell(ctx, x, (it.r + 1) * T - 2 + OY, 9, 3, 'rgba(0,0,0,0.3)');
    ctx.save(); ctx.translate(x, y + OY);
    ctx.shadowColor = 'rgba(255,240,150,0.9)'; ctx.shadowBlur = 10;
    drawItemIcon(ctx, it.type);
    ctx.restore();
    if ((t + it.c * 13) % 90 < 10) circ(ctx, x + 10, y + OY - 10, 2, '#fff');
  }
}

// ---------- scenery: tree and wrapping bench ----------
function drawTree(G, t) {
  const g = ctx, lv = G.lv;
  const x = (lv.tree.c + 0.5) * T, y = (lv.tree.r + 1) * T + OY;
  g.save(); g.translate(x, y);
  ell(g, 0, 0, 36, 5, 'rgba(0,0,0,0.3)');
  rrect(g, -5, -14, 10, 14, 2, '#6b3f1d');
  const tiers = [[-12, 40, 56], [-34, 32, 46], [-54, 24, 36]];
  for (const [ty, tw, th] of tiers) {
    const grad = g.createLinearGradient(0, ty - th, 0, ty);
    grad.addColorStop(0, '#2fb35a'); grad.addColorStop(1, '#14703a');
    poly(g, [0, ty - th * 0.75, tw, ty, -tw, ty], grad);
  }
  for (let k = 0; k < 14; k++) {
    const a = k * 2.4, ly = -16 - (k % 7) * 9, lw = 8 + (6 - (k % 7)) * 4;
    const lx = Math.sin(a) * lw * 0.7;
    circ(g, lx, ly - 4, 2.6, ['#ff4d4d', '#ffd84d', '#4dd2ff', '#ff8cf0'][(k + Math.floor(t / 20)) % 4]);
  }
  const sp = 1 + Math.sin(t * 0.1) * 0.15;
  poly(g, [0, -86 * sp, 4, -78, 12, -78, 6, -72, 8, -64, 0, -69, -8, -64, -6, -72, -12, -78, -4, -78], '#ffd84d');
  for (let i = 0; i < G.delivered; i++) {
    g.save(); g.translate(-26 + i * 15, -9); g.scale(0.55, 0.55); drawItemIcon(g, 'w'); g.restore();
  }
  g.restore();
}

function drawStation(G, t) {
  const g = ctx, lv = G.lv, p = G.player;
  const x = (lv.station.c + 0.5) * T, y = (lv.station.r + 1) * T + OY;
  const ready = p.inv.g && p.inv.p && p.inv.s && p.inv.r && !p.inv.wrapped;
  g.save(); g.translate(x, y);
  ell(g, 0, 0, 28, 4, 'rgba(0,0,0,0.3)');
  rrect(g, -22, -24, 44, 8, 2, '#c58b55'); rrect(g, -20, -16, 5, 16, 1, '#8a5a34'); rrect(g, 15, -16, 5, 16, 1, '#8a5a34');
  rrect(g, -16, -32, 12, 8, 2, '#d63a3a'); circ(g, 8, -29, 5, '#ff4d8d'); circ(g, 8, -29, 2, '#f2f2f2');
  if (ready) {
    g.shadowColor = '#ffe066'; g.shadowBlur = 16 + Math.sin(t * 0.2) * 6;
    rrect(g, -20, -58, 40, 18, 8, '#ffe066'); g.shadowBlur = 0;
    text('WRAP!', 0, -49, 12, '#7a4a00', 'center');
    g.restore(); g.save(); g.translate(x, y - 5 + Math.sin(t * 0.2) * 3);
    poly(g, [-5, -38, 5, -38, 0, -32], '#ffe066');
  } else {
    rrect(g, -18, -52, 36, 16, 6, 'rgba(0,0,0,0.5)');
    text('BOW', 0, -44, 11, '#f2c94c', 'center');
  }
  g.restore();
}

// ---------- window events: an owl pops up, or a star twinkles ----------
function smooth(u) { const k = Math.max(0, Math.min(1, u)); return k * k * (3 - 2 * k); }

function drawOwl(g, win, e) {
  const p = e.t / e.dur;
  const rise = smooth(Math.min(p / 0.15, (1 - p) / 0.15));
  const x = win.x + win.w / 2 + e.dx, y = win.y + win.h + OY + (1 - rise) * 48;
  const look = Math.sin(e.t * 0.05) * 1.8;
  const blink = e.t % 110 < 7;
  ell(g, x, y - 15, 13, 17, '#8b6b4a'); ell(g, x, y - 11, 8.5, 12, '#dcc7a2');
  for (let k = 0; k < 3; k++) circ(g, x + (k - 1) * 4, y - 12 + (k % 2) * 4, 1.2, '#b89a6e');
  ell(g, x - 13, y - 14, 4, 12, '#6f523a', 0.2); ell(g, x + 13, y - 14, 4, 12, '#6f523a', -0.2);
  ell(g, x, y - 32, 13, 11, '#8b6b4a');
  poly(g, [x - 12, y - 38, x - 8, y - 46, x - 4, y - 39], '#8b6b4a'); poly(g, [x + 12, y - 38, x + 8, y - 46, x + 4, y - 39], '#8b6b4a');
  for (const ex of [-5.5, 5.5]) {
    circ(g, x + ex, y - 33, 5.5, '#fff3b0');
    if (blink) rrect(g, x + ex - 5.5, y - 38.5, 11, 6, 2, '#8b6b4a'); else circ(g, x + ex + look, y - 33, 2.6, '#222');
  }
  poly(g, [x - 2, y - 30, x + 2, y - 30, x, y - 25], '#e8a33a');
}

// A bright four-point star that fades in, twinkles for a few seconds, then fades out.
function drawTwinkleStar(g, win, e) {
  const p = e.t / e.dur;
  const fade = smooth(Math.min(p / 0.2, (1 - p) / 0.2));
  const sx = win.x + win.w / 2 + e.dx, sy = win.y + OY + win.h * e.sy;
  const spike = (x, y, size, phase) => {
    const k = size * (0.6 + 0.4 * Math.sin(e.t * 0.22 + phase)), w = k * 0.17;
    poly(g, [x, y - k, x + w, y - w, x + k, y, x + w, y + w, x, y + k, x - w, y + w, x - k, y, x - w, y - w], '#fffbe0');
  };
  g.save();
  g.globalAlpha = fade;
  const glow = g.createRadialGradient(sx, sy, 0, sx, sy, 20);
  glow.addColorStop(0, 'rgba(255,246,200,0.55)'); glow.addColorStop(1, 'rgba(255,246,200,0)');
  g.fillStyle = glow; g.fillRect(sx - 20, sy - 20, 40, 40);
  g.shadowColor = '#fff6c8'; g.shadowBlur = 8;
  spike(sx, sy, 15, 0);
  spike(sx - 17, sy + 9, 6, 2); spike(sx + 15, sy - 8, 5, 4);
  g.restore();
}

function drawWindowEvents(G) {
  const g = ctx;
  for (const e of G.winEvents) {
    const win = G.bg.windows[e.win];
    g.save();
    g.beginPath(); g.rect(win.x, win.y + OY, win.w, win.h); g.clip();
    if (e.type === 'owl') drawOwl(g, win, e); else drawTwinkleStar(g, win, e);
    g.restore();
  }
}

function drawBaubles(G) {
  const g = ctx;
  for (const b of G.baubles) {
    const r = BAUBLE_R * Math.min(1, b.age / BAUBLE_GROW);
    const cx = b.x, cy = b.floorY - r + OY;
    ell(g, cx, b.floorY + OY - 1, r * 0.9, 3, 'rgba(0,0,0,0.3)');
    g.save(); g.translate(cx, cy);
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.clip();
    g.fillStyle = b.color; g.fillRect(-r, -r, 2 * r, 2 * r);
    g.rotate(b.spin);
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(-r, -r * 0.25, 2 * r, r * 0.5);
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(-r * 0.25, -r, r * 0.5, 2 * r);
    g.rotate(-b.spin);
    const shade = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    shade.addColorStop(0, 'rgba(255,255,255,0.8)'); shade.addColorStop(0.35, 'rgba(255,255,255,0)'); shade.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = shade; g.fillRect(-r, -r, 2 * r, 2 * r);
    g.restore();
    g.save(); g.translate(cx, cy); g.rotate(b.spin);
    rrect(g, -3, -r - 3, 6, 5, 1.5, '#e6c34a'); // cap
    g.restore();
  }
}

// ---------- characters (all drawn facing +x, feet at the origin) ----------
function drawElf(p, t) {
  if ((p.invuln > 0 || p.bonk > 0) && Math.floor(t / 4) % 2) return;
  const g = ctx;
  g.save(); g.translate(p.x, p.y + OY);
  ell(g, 0, 0, 10, 3, 'rgba(0,0,0,0.3)');
  const climbing = p.state === 'ladder', air = p.state === 'air';
  g.scale(climbing ? 1 : p.facing, 1);
  const sw = p.moving ? Math.sin(p.anim) * 4 : 0;
  const cs = climbing ? Math.sin(p.climbAnim) * 4 : 0;
  const la = climbing ? cs : air ? 3 : sw;
  line(g, -3, -10, -3 + la, -3, 4.5, '#d63a3a'); line(g, 3, -10, 3 - la, -3, 4.5, '#f2f2f2');
  ell(g, -2 + la, -1.5, 4.5, 2.6, '#f2c94c'); ell(g, 4 - la, -1.5, 4.5, 2.6, '#f2c94c');
  // tunic
  poly(g, [-6, -10, 6, -10, 7, -22, -7, -22], '#2f9e4a');
  poly(g, [-6, -10, -1, -10, -2, -22, -7, -22], '#3cc05c');
  g.fillStyle = '#6b3f1d'; g.fillRect(-6.5, -14, 13, 2.5); g.fillStyle = '#f2c94c'; g.fillRect(-1.5, -14.5, 3.5, 3.5);
  // arms
  const ay = climbing ? [-24 + cs, -24 - cs] : [-13 + sw * 0.5, -13 - sw * 0.5];
  line(g, -6, -20, -8, ay[0], 3.5, '#2f9e4a'); line(g, 6, -20, 8, ay[1], 3.5, '#2f9e4a');
  circ(g, -8, ay[0], 2.3, '#f6c9a0'); circ(g, 8, ay[1], 2.3, '#f6c9a0');
  // the signature bow
  poly(g, [0, -19, -9, -25, -9, -14], '#e63946'); poly(g, [0, -19, 9, -25, 9, -14], '#e63946');
  poly(g, [0, -19, -9, -25, -7, -19], '#ff7a85'); circ(g, 0, -19, 2.8, '#f2c94c');
  // head
  poly(g, [-6, -28, -13, -31, -6, -24], '#f6c9a0'); poly(g, [6, -28, 13, -31, 6, -24], '#f6c9a0');
  circ(g, 0, -27, 7, '#f6c9a0');
  if (!climbing) { circ(g, 3, -27, 1.4, '#222'); circ(g, 4.5, -24.5, 1, 'rgba(230,80,80,0.6)'); }
  else { circ(g, -2.5, -27, 1.3, '#222'); circ(g, 2.5, -27, 1.3, '#222'); }
  // hat
  poly(g, [-7.5, -31, 7.5, -31, -1, -46], '#d63a3a'); poly(g, [-7.5, -31, 0, -31, -4, -42], '#ef5a5a');
  ell(g, 0, -31, 8.5, 3, '#fff'); circ(g, -2, -46, 3.2, '#fff'); circ(g, -2, -43, 1.3, '#f2c94c');
  if (p.stun > 0) { // dizzy stars circling the head
    for (let k = 0; k < 3; k++) {
      const a = t * 0.3 + k * 2.09;
      poly(g, [Math.cos(a) * 11, -50 + Math.sin(a) * 3 - 3, Math.cos(a) * 11 + 2, -50 + Math.sin(a) * 3, Math.cos(a) * 11, -50 + Math.sin(a) * 3 + 3, Math.cos(a) * 11 - 2, -50 + Math.sin(a) * 3], '#ffd84d');
    }
  }
  if (p.inv.wrapped) { g.save(); g.translate(0, -58 + Math.sin(t * 0.15) * 1.5); g.scale(0.7, 0.7); drawItemIcon(g, 'w'); g.restore(); }
  g.restore();
}

function drawDog(e, t) {
  const g = ctx; g.save(); g.translate(e.x, e.y + OY); g.scale(e.dir, 1);
  ell(g, 0, 0, 16, 3, 'rgba(0,0,0,0.3)');
  const s = e.state === 'sniff' ? 0 : Math.sin(e.anim * 2) * 4;
  line(g, -10, -9, -10 + s, -1, 4, '#7a4a24'); line(g, 13, -9, 13 + s, -1, 4, '#7a4a24');
  line(g, -5, -9, -5 - s, -1, 4, '#8f5a2c'); line(g, 8, -9, 8 - s, -1, 4, '#8f5a2c');
  line(g, -14, -15, -21, -21 + Math.sin(t * 0.4) * 3, 4, '#b9773f');
  ell(g, 0, -13, 15, 8, '#b9773f'); ell(g, 1, -9, 11, 4, '#dca56e');
  const hy = e.state === 'sniff' ? -9 : -18;
  circ(g, 14, hy, 7, '#b9773f'); ell(g, 20, hy + 2, 5, 3.5, '#dca56e'); circ(g, 24, hy + 1, 1.8, '#222');
  circ(g, 16, hy - 2, 1.5, '#111'); ell(g, 11, hy - 4, 3, 6, '#7a4a24', 0.4);
  line(g, 10, hy - 6, 6, hy - 14, 2.5, '#8b5a2b'); line(g, 6, hy - 14, 3, hy - 13, 2, '#8b5a2b'); line(g, 6, hy - 14, 8, hy - 18, 2, '#8b5a2b');
  line(g, 8, -14, 10, -9, 3, '#d63a3a');
  g.restore();
}

function drawCat(e, t) {
  const g = ctx; g.save(); g.translate(e.x, e.y + OY); g.scale(e.dir, 1);
  ell(g, 0, 0, 14, 3, 'rgba(0,0,0,0.3)');
  const dash = e.state === 'dash';
  const s = e.state === 'pause' ? 0 : Math.sin(e.anim * (dash ? 3 : 2)) * 4;
  line(g, -8, -8, -8 + s, -1, 3.5, '#6f6f82'); line(g, 10, -8, 10 + s, -1, 3.5, '#6f6f82');
  line(g, -4, -8, -4 - s, -1, 3.5, '#8c8ca0'); line(g, 6, -8, 6 - s, -1, 3.5, '#8c8ca0');
  g.strokeStyle = '#8c8ca0'; g.lineWidth = 4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-11, -12); g.bezierCurveTo(-20, -14, -18, -26, -12, -24 + Math.sin(t * 0.2) * 3); g.stroke();
  ell(g, 0, -11, 12, 6.5, '#8c8ca0');
  for (let k = 0; k < 3; k++) line(g, -5 + k * 5, -16, -4 + k * 5, -11, 1.5, '#5f5f72');
  circ(g, 12, -15, 6, '#8c8ca0');
  poly(g, [8, -19, 9, -26, 13, -20], '#8c8ca0'); poly(g, [13, -19, 16, -25, 17, -17], '#8c8ca0');
  ell(g, 14, -16, 1.6, 2.2, dash ? '#ff5050' : '#7dff7a'); ell(g, 14, -16, 0.5, 2, '#111');
  line(g, 17, -14, 22, -15, 1, '#eee'); line(g, 17, -13, 22, -12, 1, '#eee');
  g.restore();
}

function drawChild(e, t) {
  const g = ctx; g.save(); g.translate(e.x, e.y + OY);
  ell(g, 0, 0, 9, 3, 'rgba(0,0,0,0.3)');
  const climbing = e.state === 'ladder';
  const asleep = e.state === 'asleep', waking = e.state === 'waking';
  g.scale(climbing ? 1 : e.dir, 1);
  const s = asleep || waking ? 0 : Math.sin(e.anim * 2) * 4;
  if (asleep) g.rotate(0.12);
  line(g, -3, -12, -3 + s, -3, 4.5, '#3b7fc4'); line(g, 3, -12, 3 - s, -3, 4.5, '#3b7fc4');
  ell(g, -3 + s, -1.5, 4, 2.4, '#e06a9a'); ell(g, 3 - s, -1.5, 4, 2.4, '#e06a9a');
  rrect(g, -7, -25, 14, 15, 4, '#4aa3df');
  for (const [sx, sy] of [[-3, -20], [3, -16], [-1, -13]]) circ(g, sx, sy, 1.4, '#fff');
  const ay = climbing ? [-27 + s, -27 - s] : [-14 - s * 0.5, -14 + s * 0.5];
  line(g, -7, -22, -9, ay[0], 3.5, '#4aa3df'); line(g, 7, -22, 9, ay[1], 3.5, '#4aa3df');
  circ(g, -9, ay[0], 2.2, '#f6c9a0'); circ(g, 9, ay[1], 2.2, '#f6c9a0');
  circ(g, 0, -31, 7, '#f6c9a0');
  ell(g, 0, -35, 7.5, 4, '#6b3f1d'); poly(g, [-6, -37, -3, -44, 0, -37], '#6b3f1d'); poly(g, [0, -37, 4, -45, 6, -37], '#6b3f1d');
  circ(g, climbing ? -2.5 : 3, -31, 1.3, '#222'); if (climbing) circ(g, 2.5, -31, 1.3, '#222');
  line(g, climbing ? -4.5 : 1, -34, climbing ? -0.5 : 5, -32.5, 1.3, '#4a2a10');
  if (asleep) {
    g.rotate(-0.12);
    text('Z', 10, -42 - (t % 60) / 4, 11, '#cfe0ff', 'left');
    text('z', 17, -53 - (t % 60) / 4, 8, '#cfe0ff', 'left');
  } else if (waking) {
    text('!', 0, -52 + Math.sin(t * 0.5) * 2, 18, '#ff4040', 'center');
  }
  g.restore();
}

function drawParent(e, t) {
  const g = ctx; g.save(); g.translate(e.x, e.y + OY);
  ell(g, 0, 0, 12, 3.5, 'rgba(0,0,0,0.3)');
  const asleep = e.state === 'asleep';
  g.scale(e.dir, 1);
  const s = asleep || e.state === 'waking' ? 0 : Math.sin(e.anim * 2) * 3.5;
  if (asleep) g.rotate(0.12);
  line(g, -4, -14, -4 + s, -3, 5, '#d8b79a'); line(g, 4, -14, 4 - s, -3, 5, '#d8b79a');
  ell(g, -4 + s, -1.5, 5, 2.6, '#b04a6a'); ell(g, 4 - s, -1.5, 5, 2.6, '#b04a6a');
  rrect(g, -10, -38, 20, 28, 7, '#7c4dbd'); g.fillStyle = '#6a3aa8'; g.fillRect(-10, -24, 20, 3);
  line(g, 0, -37, 0, -11, 1.5, '#5a2a98');
  line(g, -10, -33, -11, -18 + s, 4, '#7c4dbd'); line(g, 10, -33, 11, -18 - s, 4, '#7c4dbd');
  circ(g, -11, -18 + s, 2.6, '#f1c7a2'); circ(g, 11, -18 - s, 2.6, '#f1c7a2');
  circ(g, 0, asleep ? -39 : -43, 8.5, '#f1c7a2');
  const hy = asleep ? -39 : -43;
  ell(g, -1, hy - 6, 8.5, 4, '#b9b9c4');
  if (asleep) {
    line(g, 0, hy, 4, hy, 1.5, '#333'); line(g, 4, hy, 8, hy, 1.5, '#333');
    g.rotate(-0.12);
    text('Z', 14, -52 - (t % 60) / 4, 13, '#cfe0ff', 'left');
    text('z', 22, -64 - (t % 60) / 4, 10, '#cfe0ff', 'left');
  } else {
    circ(g, 4, hy, 1.5, '#222');
    line(g, 1, hy - 4, 7, hy - 2, 1.6, '#444');
    if (e.state === 'waking') text('!', 0, -62 + Math.sin(t * 0.5) * 2, 20, '#ff4040', 'center');
  }
  g.restore();
}

function drawEnemies(G, t) {
  for (const e of G.enemies) {
    if (e.kind === 'dog') drawDog(e, t);
    else if (e.kind === 'cat') drawCat(e, t);
    else if (e.kind === 'child') drawChild(e, t);
    else drawParent(e, t);
  }
}

// ---------- effects ----------
function drawParticles(G) {
  for (const p of G.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    circ(ctx, p.x, p.y + OY, p.size, p.color);
  }
  ctx.globalAlpha = 1;
  for (const f of G.floaters) {
    ctx.globalAlpha = Math.min(1, f.life / 20);
    text(f.text, f.x, f.y + OY, 16, f.color, 'center', FONT, true);
  }
  ctx.globalAlpha = 1;
}

function drawLights(t) {
  for (let k = 0, x = 32; x <= VIEW_W - 32; x += 24, k++) {
    const on = (Math.floor(t / 25) + k) % 3 !== 0;
    const col = ['#ff4d4d', '#ffd84d', '#4dd2ff', '#7dff7a'][k % 4];
    ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = on ? 12 : 0;
    circ(ctx, x, garlandY(x) + 5 + OY, 3.6, on ? col : '#444');
    ctx.restore();
  }
}

function drawSnow(G) {
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  for (const f of G.snow) { ctx.beginPath(); ctx.arc(f.x, f.y + OY, f.r, 0, Math.PI * 2); ctx.fill(); }
}

// ---------- HUD ----------
function drawElfHead(x, y) {
  const g = ctx;
  circ(g, x, y, 7, '#f6c9a0'); poly(g, [x - 8, y - 3, x + 8, y - 3, x - 1, y - 18], '#d63a3a');
  ell(g, x, y - 3, 8.5, 3, '#fff'); circ(g, x - 1, y - 18, 3, '#fff');
  circ(g, x - 2.5, y + 1, 1.2, '#222'); circ(g, x + 2.5, y + 1, 1.2, '#222');
  poly(g, [x, y + 8, x - 7, y + 4, x - 7, y + 12], '#e63946'); poly(g, [x, y + 8, x + 7, y + 4, x + 7, y + 12], '#e63946');
}

function drawHUD(G) {
  const g = ctx;
  g.fillStyle = '#0b1026'; g.fillRect(0, 0, VIEW_W, OY);
  g.fillStyle = '#f2c94c'; g.fillRect(0, OY - 3, VIEW_W, 3);
  text('SCORE', 16, 14, 11, '#9fb0d8');
  text(String(G.score).padStart(6, '0'), 16, 34, 22, '#fff');
  text('LIVES', 150, 14, 11, '#9fb0d8');
  for (let i = 0; i < G.lives; i++) drawElfHead(162 + i * 26, 34);
  text('KIT', 270, 14, 11, '#9fb0d8');
  ['g', 'p', 's', 'r'].forEach((k, i) => {
    const x = 270 + i * 34;
    rrect(g, x, 22, 30, 22, 5, G.player.inv[k] ? 'rgba(242,201,76,0.35)' : 'rgba(255,255,255,0.07)');
    g.globalAlpha = G.player.inv[k] ? 1 : 0.25;
    g.save(); g.translate(x + 15, 33); drawItemIcon(g, k, 0.62); g.restore();
    g.globalAlpha = 1;
  });
  text('>', 412, 33, 18, '#9fb0d8', 'center');
  rrect(g, 426, 22, 30, 22, 5, G.player.inv.wrapped ? 'rgba(242,201,76,0.35)' : 'rgba(255,255,255,0.07)');
  g.globalAlpha = G.player.inv.wrapped ? 1 : 0.25;
  g.save(); g.translate(441, 33); drawItemIcon(g, 'w', 0.62); g.restore(); g.globalAlpha = 1;
  text('DELIVERED', 500, 14, 11, '#9fb0d8');
  for (let i = 0; i < G.lv.quota; i++) {
    g.globalAlpha = i < G.delivered ? 1 : 0.25;
    g.save(); g.translate(512 + i * 30, 33); drawItemIcon(g, 'w', 0.72); g.restore();
  }
  g.globalAlpha = 1;
  text('TIME', 680, 14, 11, '#9fb0d8');
  text(`SCREEN ${G.lv.index + 1}/${LEVELS.length}`, 1008, 14, 11, '#9fb0d8', 'right');
  const frac = Math.max(0, G.timeLeft / G.lv.time);
  rrect(g, 680, 24, 240, 16, 8, 'rgba(255,255,255,0.1)');
  rrect(g, 680, 24, Math.max(10, 240 * frac), 16, 8, frac > 0.5 ? '#3cc05c' : frac > 0.25 ? '#f2c94c' : '#e63946');
  text(String(Math.ceil(G.timeLeft)), 1008, 34, 22, G.timeLeft < 15 ? '#ff6b6b' : '#fff', 'right');
}

// ---------- overlays and screens ----------
function dim(alpha) { ctx.fillStyle = `rgba(5,8,25,${alpha})`; ctx.fillRect(0, OY, VIEW_W, VIEW_H - OY); }

// Split a string into lines no wider than maxWidth, using the font currently set on ctx.
function wrapText(str, maxWidth) {
  const out = [];
  let cur = '';
  for (const word of str.split(' ')) {
    const trial = cur ? `${cur} ${word}` : word;
    if (cur && ctx.measureText(trial).width > maxWidth) { out.push(cur); cur = word; } else cur = trial;
  }
  out.push(cur);
  return out;
}

function drawPanel(lines) {
  rrect(ctx, 192, OY + 190, 640, 220, 18, 'rgba(8,12,40,0.88)');
  ctx.strokeStyle = '#f2c94c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(192, OY + 190, 640, 220, 18); ctx.stroke();
  let y = OY + 232;
  for (const [str, size, color, font] of lines) {
    ctx.font = `bold ${size}px ${font || FONT}`;
    const wrapped = wrapText(str, 580);
    wrapped.forEach((part, k) => text(part, 512, y + k * (size + 4), size, color, 'center', font || FONT, true));
    y += 44 + (wrapped.length - 1) * (size + 4);
  }
}

function drawTitle(G, t) {
  const g = ctx;
  const sky = g.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, '#060a24'); sky.addColorStop(1, '#1c2f6a');
  g.fillStyle = sky; g.fillRect(0, 0, VIEW_W, VIEW_H);
  for (let k = 0; k < 40; k++) circ(g, (k * 97) % VIEW_W, (k * 53) % 300, 1.3, `rgba(255,255,255,${0.4 + 0.4 * Math.sin(t * 0.05 + k)})`);
  ell(g, 300, VIEW_H + 70, 500, 100, '#e9f1ff'); ell(g, 800, VIEW_H + 80, 420, 90, '#d8e5fb');
  text('ALWAYS TIME', 512, 120, 70, '#f2c94c', 'center', TITLE_FONT, true);
  text('FOR A BOW', 512, 195, 70, '#e63946', 'center', TITLE_FONT, true);
  text("An elf's Christmas Eve wrapping dash", 512, 255, 22, '#cfe0ff', 'center', FONT);
  const fake = { x: 0, y: 0, facing: 1, state: 'ground', moving: true, anim: t * 0.2, climbAnim: 0, invuln: 0, inv: { wrapped: true } };
  g.save(); g.translate(512, 450); g.scale(2.6, 2.6); g.translate(0, -OY);
  drawElf(fake, t);
  g.restore();
  text('Arrows / WASD: move and climb     Space: jump     P: pause     M: mute', 512, 520, 17, '#cfe0ff', 'center');
  text('Collect a present, paper, scissors and ribbon. Wrap them at the bench.', 512, 548, 17, '#cfe0ff', 'center');
  text('Deliver to the tree. Dodge dogs, cats, children and parents!', 512, 574, 17, '#cfe0ff', 'center');
  if (Math.floor(t / 30) % 2 === 0) text('PRESS ENTER TO START', 512, 632, 26, '#fff', 'center', FONT, true);
  if (G.hiScore > 0) text(`HIGH SCORE ${String(G.hiScore).padStart(6, '0')}`, 512, 656, 15, '#f2c94c', 'center');
  if (!Sound.ctx && !Sound.unsupported) text('Press any key for music', 512, 599, 14, '#9fb0d8', 'center');
}

function drawIntro(G) {
  dim(0.55);
  drawPanel([
    [`SCREEN ${G.lv.index + 1}`, 18, '#9fb0d8'],
    [G.lv.name.toUpperCase(), 40, '#f2c94c', TITLE_FONT],
    [`Wrap and deliver ${G.lv.quota} present${G.lv.quota > 1 ? 's' : ''}`, 22, '#fff'],
    [G.lv.hint, 15, '#cfe0ff'],
  ]);
}

function drawDeath(G) {
  const msg = { dog: 'Woof! The dog caught you!', cat: 'Hiss! The cat got you!', child: 'A child spotted you!', parent: 'A parent woke up!', time: 'Out of time!' }[G.deathReason] || 'Caught!';
  text(msg, 512, OY + 320, 34, '#fff', 'center', TITLE_FONT, true);
}

function drawLevelDone(G) {
  dim(0.5);
  drawPanel([
    ['SCREEN COMPLETE!', 40, '#f2c94c', TITLE_FONT],
    [`Time bonus  +${G.bonus}`, 24, '#fff'],
    [`Score ${G.score}`, 22, '#cfe0ff'],
  ]);
}

function drawEndScreen(G, title, color, subtitle) {
  dim(0.7);
  drawPanel([
    [title, 44, color, TITLE_FONT],
    [subtitle, 20, '#cfe0ff'],
    [`Final score ${G.score}`, 26, '#fff'],
    ['Press ENTER to play again', 20, '#f2c94c'],
  ]);
}

function drawFatal(message) {
  ctx.fillStyle = '#300'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  text('Could not start the game', 512, 200, 32, '#fff', 'center');
  text(message, 512, 280, 16, '#ffb0b0', 'center');
  text('See the browser console for details.', 512, 330, 16, '#ffb0b0', 'center');
}

function drawGame(G) {
  const t = G.tick;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.drawImage(G.bg, 0, OY);
  drawWindowEvents(G);
  drawLights(t);
  drawTree(G, t);
  drawStation(G, t);
  drawItems(G, t);
  drawEnemies(G, t);
  drawBaubles(G);
  if (G.mode === 'dying') {
    ctx.save(); ctx.translate(G.player.x, G.player.y + OY - 14);
    ctx.rotate(G.modeTimer * 0.35); ctx.translate(-G.player.x, -(G.player.y + OY - 14));
    drawElf({ ...G.player, invuln: 0, bonk: 0, stun: 0 }, t);
    ctx.restore();
  } else drawElf(G.player, t);
  drawParticles(G);
  drawSnow(G);
  drawHUD(G);
  if (G.mode === 'intro') drawIntro(G);
  else if (G.mode === 'dying') drawDeath(G);
  else if (G.mode === 'levelDone') drawLevelDone(G);
  else if (G.paused) { dim(0.6); text('PAUSED', 512, OY + 300, 56, '#f2c94c', 'center', TITLE_FONT, true); }
}
