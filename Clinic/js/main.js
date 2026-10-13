'use strict';

// St Ghoulsby's Infirmary: the screen, the mouse and the sounds. The rules live in sim.js.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = 480, H = 300, PIX = canvas.width / W;
const UI_FONT = '"Trebuchet MS", Verdana, sans-serif';
const TITLE_FONT = 'Georgia, "Times New Roman", serif';

// Layout, in art pixels. Floor f's floorboards are at FLOOR_Y[f]; its room is ROOM_H tall above that.
const FLOOR_Y = [236, 174, 112];
const BUILD_L = 44, BUILD_R = 436, ROOF_Y = 50;
const HUD_H = 16, TOOLBAR_Y = 252;
const SPEEDS = [0, 1, 2, 4];

const TOOLS = [
  ...BUILDABLE.map((type) => ({ id: type, kind: 'room', label: ROOMS[type].name, cost: ROOMS[type].cost })),
  ...HIREABLE.map((kind) => ({ id: kind, kind: 'hire', label: `Hire ${STAFF[kind].name}`, cost: STAFF[kind].hire })),
  { id: 'demolish', kind: 'demolish', label: 'Knock down', cost: 0 },
];
const TOOL_W = 52, TOOL_GAP = 2;

const ui = {
  screen: 'title',
  game: null,
  speed: 1,
  tool: null,            // a TOOLS entry, or null
  mouse: null,           // { x, y } in art pixels, or null when off the canvas
  ticker: [],            // { text, kind, until }
  hintFlash: 0,
  carry: 0,              // real seconds not yet simulated
  last: 0,
  shake: 0,
  glares: [],           // { fromX, toX, until }: Medusa's petrifying stare, drawn for a moment
};

let particles = [];

function newGame() {
  ui.game = new Clinic({ seed: Math.floor(Math.random() * 1e9) });
  ui.speed = 1; ui.tool = null; ui.ticker = []; ui.glares = []; particles = [];
  ui.screen = 'play';
  say('St Ghoulsby\'s is open for business. Medusa is on reception.', 'info');
}

function say(text, kind = 'info') {
  ui.ticker.push({ text, kind, until: performance.now() + 6000 });
  if (ui.ticker.length > 3) ui.ticker.shift();
}

// ---- positions

const roomTop = (floor) => FLOOR_Y[floor] - ROOM_H;
const feetY = (e) => {
  if (!e.ride) return FLOOR_Y[e.floor];
  const t = Math.min(1, e.ride.t / e.ride.dur);
  const ease = t * t * (3 - 2 * t);
  return FLOOR_Y[e.ride.from] + (FLOOR_Y[e.ride.to] - FLOOR_Y[e.ride.from]) * ease;
};

function slotUnder(x, y) {
  for (let f = 0; f < FLOORS; f++) {
    if (y >= roomTop(f) && y < FLOOR_Y[f]) {
      const s = slotOf(x);
      if (s >= 0 && s < SLOTS) return { floor: f, slot: s };
    }
  }
  return null;
}

function personUnder(x, y) {
  const g = ui.game;
  const near = (e) => !e.ride && Math.abs(e.x - x) < 7 && y < feetY(e) + 1 && y > feetY(e) - 30;
  const p = [...g.patients].reverse().find(near);
  if (p) return { type: 'patient', who: p };
  const s = [...g.staff].reverse().find(near);
  if (s) return { type: 'staff', who: s };
  const st = [...g.statues].reverse().find((t) => Math.abs(t.x - x) < 7 && y < FLOOR_Y[0] + 1 && y > FLOOR_Y[0] - 30);
  if (st) return { type: 'statue', who: st };
  return null;
}

// ---- the backdrop: sky, graveyard, the building's shell and the street. Painted once.

let backdrop = null;
function getBackdrop() {
  if (backdrop) return backdrop;
  backdrop = artCanvas(W, H, ({ px, slab, ball, ctx: b }) => {
    // night sky
    const sky = b.createLinearGradient(0, 0, 0, 240);
    sky.addColorStop(0, '#0c0a24'); sky.addColorStop(0.6, '#2a1c4a'); sky.addColorStop(1, '#4a2a5a');
    b.fillStyle = sky; b.fillRect(0, 0, W, 252);
    const rng = makeRng(7);
    for (let i = 0; i < 90; i++) px(rng() < 0.2 ? '#ffffff' : '#a8a0d0', Math.floor(rng() * W), Math.floor(rng() * 150));
    // a big moon
    ball(452, 40, 18, 18, ['#fffbe8', '#f4ecc8', '#d8cc9c', '#b0a070']);
    ball(446, 34, 3, 3, ['#e8dcb0', '#d8cc9c', '#c8bc8c', '#b0a070']); ball(458, 46, 4, 3, ['#e8dcb0', '#d8cc9c', '#c8bc8c', '#b0a070']);
    // distant hills and dead trees
    for (let x = 0; x < W; x++) { const h = 200 + Math.sin(x / 37) * 8 + Math.sin(x / 13) * 3; px('#1e1430', x, h, 1, 52); }
    for (const tx of [14, 456]) {
      px('#120c1c', tx, 160, 3, 80);
      for (let k = 0; k < 6; k++) px('#120c1c', tx + (k % 2 ? 3 : -6), 165 + k * 9, 6, 1);
      px('#120c1c', tx - 8, 158, 6, 1); px('#120c1c', tx + 3, 152, 1, 8); px('#120c1c', tx + 3, 152, 6, 1);
    }
    // graveyard to the left, beyond the railings
    for (const [gx, gh] of [[4, 10], [16, 14], [30, 9]]) {
      slab(gx, 236 - gh, 7, gh, colourRamp('#6a6880')); ball(gx + 3.5, 236 - gh, 3.5, 2.5, colourRamp('#6a6880'), 236 - gh);
      px('#3a3848', gx + 3, 236 - gh + 2, 1, 4); px('#3a3848', gx + 2, 236 - gh + 3, 3, 1);
    }
    for (let x = 0; x < 44; x += 4) { px('#1a1620', x, 222, 1, 14); px('#1a1620', x, 220, 1, 1); }
    px('#1a1620', 0, 225, 44, 1);
    // the roof: a slate mansard with dormers, gargoyles and a chimney
    for (let y = 26; y < ROOF_Y; y++) {
      const inset = (ROOF_Y - y) * 0.9, l = BUILD_L - 6 + inset, r = BUILD_R + 6 - inset;
      px((y % 4 === 0) ? '#22243a' : '#34364e', l, y, r - l, 1);
      if (y % 4 === 2) for (let x = l + (y % 8 ? 0 : 4); x < r; x += 8) px('#22243a', x, y, 1, 2);
    }
    px('#4a4a62', BUILD_L - 6, ROOF_Y - 2, BUILD_R - BUILD_L + 12, 2);
    slab(372, 6, 12, 26, colourRamp('#5a4a52')); px('#2a2028', 371, 6, 14, 2);
    for (const dx of [96, 330]) {
      slab(dx, 30, 18, 18, colourRamp('#3a3448')); px('#2a2236', dx - 1, 28, 20, 2);
      px('#ffd070', dx + 4, 35, 10, 10); px('#3a3448', dx + 8, 35, 1, 10); px('#3a3448', dx + 4, 39, 10, 1);
    }
    for (const gx of [BUILD_L - 8, BUILD_R - 2]) {
      ball(gx + 5, 40, 5, 4, colourRamp('#6a6880')); px('#ff3a30', gx + 3, 39); px('#ff3a30', gx + 7, 39);
      px('#5a5870', gx, 38, 2, 2); px('#5a5870', gx + 8, 38, 2, 2);
    }
    // the sign board on the roof (the name is lettered on by the screen)
    slab(170, 29, 140, 17, colourRamp('#3a1a14')); px(PAL.gold[1], 172, 31, 136, 1); px(PAL.gold[2], 172, 43, 136, 1);
    // the building's stone shell: outer walls and the slabs between floors
    const stone = colourRamp('#5a5468');
    for (let f = 0; f <= FLOORS; f++) {
      const y = f === 0 ? FLOOR_Y[0] : FLOOR_Y[f - 1] - ROOM_H - 4;
      slab(BUILD_L, y, BUILD_R - BUILD_L, 4, stone);
    }
    slab(BUILD_L, ROOF_Y, 4, FLOOR_Y[0] - ROOF_Y, stone);
    slab(BUILD_R - 4, ROOF_Y, 4, FLOOR_Y[0] - ROOF_Y, stone);
    // the entrance arch in the left wall
    px('#2a1c2a', BUILD_L, roomTop(0) + 14, 4, ROOM_H - 14);
    ball(BUILD_L + 2, roomTop(0) + 14, 6, 6, colourRamp('#5a5468'), roomTop(0) + 14);
    px('#ffd070', BUILD_L - 3, roomTop(0) + 18, 2, 3);
    // the lift shaft: a cage with chains
    const shaftL = SLOT_X0 + SLOTS * SLOT_W, shaftR = BUILD_R - 4;
    for (let f = 0; f < FLOORS; f++) {
      const t = roomTop(f);
      px('#16121e', shaftL, t, shaftR - shaftL, ROOM_H);
      for (let x = shaftL + 2; x < shaftR; x += 4) px('#2a2436', x, t, 1, ROOM_H);
      px(PAL.gold[2], shaftL, t, 1, ROOM_H); px(PAL.gold[2], shaftR - 1, t, 1, ROOM_H);
      // the floor indicator dial above the gate
      ball(LIFT_X, t + 5, 3, 3, PAL.gold); px('#1a1a1a', LIFT_X, t + 3, 1, 3);
      px('#5a3420', shaftL, FLOOR_Y[f] - 4, shaftR - shaftL, 4); px('#7a4a2c', shaftL, FLOOR_Y[f] - 4, shaftR - shaftL, 1);
    }
    px('#8a8a9a', LIFT_X - 1, ROOF_Y + 4, 1, FLOOR_Y[0] - ROOF_Y - 8); px('#8a8a9a', LIFT_X + 1, ROOF_Y + 4, 1, FLOOR_Y[0] - ROOF_Y - 8);
    // the street: cobbles and a path to the door
    px('#2a2430', 0, 240, W, 12);
    for (let y = 241; y < 252; y += 3) for (let x = (y % 2) * 3; x < W; x += 6) { px('#3a3442', x, y, 5, 2); px('#4a4452', x, y, 5, 1); }
    // a gas lamp by the door
    px('#1a1620', 34, 200, 2, 36); slab(31, 194, 8, 7, colourRamp('#2a2430')); px('#ffe8a0', 33, 196, 4, 4);
  }, false);
  return backdrop;
}

// ---- drawing

function drawImageAt(img, x, y, flip = false, alpha = 1) {
  ctx.globalAlpha = alpha;
  if (flip) {
    ctx.save(); ctx.translate(Math.round(x) + img.width, Math.round(y)); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0); ctx.restore();
  } else ctx.drawImage(img, Math.round(x), Math.round(y));
  ctx.globalAlpha = 1;
}

function text(str, x, y, { size = 7, color = '#f0e4d0', align = 'left', bold = true, font = UI_FONT, shadow = true } = {}) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${font}`;
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText(str, x + 0.6, y + 0.6); }
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}

function panel(x, y, w, h, fill = 'rgba(20,12,28,0.9)', edge = '#8a6a3a') {
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function drawScene(now) {
  const g = ui.game;
  ctx.drawImage(getBackdrop(), 0, 0);
  drawSky(now);
  text('ST GHOULSBY\'S', 240, 41, { size: 11, color: '#ffd24a', align: 'center', font: TITLE_FONT });
  for (let f = 0; f < FLOORS; f++) for (let s = 0; s < SLOTS; s++) {
    const room = g ? g.roomAt(f, s) : (f === 0 && s === 0 ? { type: 'reception' } : null);
    ctx.drawImage(roomArt(room ? room.type : 'empty'), slotLeft(s), roomTop(f));
    if (room) drawRoomLife(room, now);
  }
  drawLamps(now);
  // the walls between room slots
  for (let f = 0; f < FLOORS; f++) for (let s = 1; s < SLOTS; s++) {
    ctx.fillStyle = '#1a1420'; ctx.fillRect(slotLeft(s) - 1, roomTop(f), 2, ROOM_H);
    ctx.fillStyle = '#5a5468'; ctx.fillRect(slotLeft(s) - 1, roomTop(f), 1, ROOM_H);
  }
  if (!g) return;
  for (const s of g.staff) drawStaff(s, now);
  for (const room of g.rooms) {
    const kind = ROOMS[room.type].staff;
    if (!kind || room.staffId || Math.floor(now / 500) % 2) continue;
    const label = `NO ${STAFF[kind].name.toUpperCase()}`, cx = slotLeft(room.slot) + SLOT_W / 2, cy = roomTop(room.floor) + 22;
    ctx.fillStyle = '#c02020'; ctx.fillRect(cx - 22, cy - 7, 44, 10);
    ctx.strokeStyle = '#ffe0a0'; ctx.lineWidth = 1; ctx.strokeRect(cx - 21.5, cy - 6.5, 43, 9);
    text(label, cx, cy + 0.5, { size: 6.5, align: 'center', color: '#ffffff' });
  }
  for (const room of g.rooms) if (PAINT_FRONT[room.type]) ctx.drawImage(roomFront(room.type), slotLeft(room.slot), roomTop(room.floor));
  for (const room of g.rooms) if (room.type === 'consult') drawCrystalBall(room, now);
  for (const st of g.statues) drawStatue(st);
  drawGlares(now);
  for (const p of g.patients) drawPatient(p, now);
  for (const e of [...g.patients, ...g.staff]) if (e.ride) drawLiftCage(e);
}

function drawSky(now) {
  // bats flitting round the chimney, and the occasional flash of lightning
  for (let i = 0; i < 4; i++) {
    const t = now / 1000 * (0.4 + i * 0.07) + i * 1.7;
    const bx = 380 + Math.cos(t) * (30 + i * 12), by = 18 + Math.sin(t * 1.7) * 8 + i * 3;
    const flap = Math.floor(now / 90 + i) % 2;
    ctx.fillStyle = '#0a0612';
    ctx.fillRect(Math.round(bx) - 1, Math.round(by), 3, 2);
    ctx.fillRect(Math.round(bx) - 4, Math.round(by) - flap, 3, 1); ctx.fillRect(Math.round(bx) + 2, Math.round(by) - flap, 3, 1);
  }
  if (Math.random() < 0.02) addParticle({ x: 376 + Math.random() * 6, y: 4, vx: 4, vy: -5, ttl: 3, size: 3, color: 'rgba(160,150,180,0.4)', grow: 1.5 });
  const flash = (now % 23000) < 140 || ((now % 23000) > 260 && (now % 23000) < 330);
  if (flash) { ctx.fillStyle = 'rgba(220,220,255,0.18)'; ctx.fillRect(0, 0, W, 252); }
}

// candlelight pooling in each room, flickering
function drawLamps(now) {
  const g = ui.game;
  for (let f = 0; f < FLOORS; f++) for (let s = 0; s < SLOTS; s++) {
    const room = g ? g.roomAt(f, s) : (f === 0 && s === 0);
    if (!room) continue;
    const cx = slotLeft(s) + SLOT_W / 2, cy = roomTop(f) + 6;
    const flick = 0.85 + 0.15 * Math.sin(now / 130 + f * 3 + s * 7) * Math.sin(now / 57 + s);
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy + 10, 60);
    grad.addColorStop(0, `rgba(255,200,120,${0.22 * flick})`); grad.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = grad; ctx.fillRect(slotLeft(s), roomTop(f), SLOT_W, ROOM_H);
    // the candle chandelier
    ctx.fillStyle = '#2a2018'; ctx.fillRect(cx, roomTop(f), 1, 4); ctx.fillRect(cx - 5, roomTop(f) + 4, 11, 1);
    for (const dx of [-5, 0, 5]) {
      ctx.fillStyle = '#f0e8d8'; ctx.fillRect(cx + dx, roomTop(f) + 2, 1, 2);
      ctx.fillStyle = flick > 0.9 ? '#fff0a0' : '#ffb040'; ctx.fillRect(cx + dx, roomTop(f) + 1, 1, 1);
    }
  }
}

// moving parts of each room
function drawRoomLife(room, now) {
  const x0 = slotLeft(room.slot), y0 = roomTop(room.floor), busy = !!room.current;
  if (room.type === 'lounge') {
    for (let k = 0; k < 5; k++) {
      const h = 5 + Math.abs(Math.sin(now / 110 + k * 1.3)) * 7;
      ctx.fillStyle = k % 2 ? '#60ff80' : '#30c060';
      ctx.fillRect(x0 + 27 + k * 3, y0 + 54 - h, 2, h);
    }
    ctx.fillStyle = '#c0ffd0'; ctx.fillRect(x0 + 30, y0 + 50, 6, 2);
    // the portrait's eyes follow the mouse
    const look = ui.mouse ? Math.sign(ui.mouse.x - (x0 + 33)) : 0;
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x0 + 31 + (look > 0 ? 1 : 0), y0 + 13, 1, 1); ctx.fillRect(x0 + 34 + (look > 0 ? 1 : 0), y0 + 13, 1, 1);
    // the clock's pendulum
    const swing = Math.sin(now / 500) * 2;
    ctx.fillStyle = PAL.gold[1]; ctx.fillRect(x0 + 7 + Math.round(swing), y0 + 40, 2, 2);
  } else if (room.type === 'rewinder') {
    const a = busy ? now / 90 : 0, cx = x0 + 59.5, cy = y0 + 14;
    ctx.fillStyle = PAL.wood[2]; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAL.bandage[1]; ctx.beginPath(); ctx.arc(cx, cy, busy ? 6 : 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = PAL.wood[0]; ctx.lineWidth = 1;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a + k * Math.PI / 2) * 8, cy + Math.sin(a + k * Math.PI / 2) * 8); ctx.stroke(); }
  } else if (room.type === 'coffin' && busy && Math.random() < 0.3) {
    addParticle({ x: x0 + 44 + Math.random() * 20, y: y0 + 12, vx: (Math.random() - 0.5) * 6, vy: 8, ttl: 2, size: 1, color: '#ffffff' });
  }
}

function drawCrystalBall(room, now) {
  const x = slotLeft(room.slot) + 50.5, y = roomTop(room.floor) + 37;
  const glow = room.current ? 0.6 + 0.4 * Math.sin(now / 120) : 0.25;
  const grad = ctx.createRadialGradient(x, y, 0, x, y, 10);
  grad.addColorStop(0, `rgba(200,120,255,${glow})`); grad.addColorStop(1, 'rgba(200,120,255,0)');
  ctx.fillStyle = grad; ctx.fillRect(x - 10, y - 10, 20, 20);
  ctx.fillStyle = '#c8a0ff'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 1, 1);
}

function walkFrame(e, now) { return e.walking ? Math.floor(now / 140 + e.id) % 4 : 0; }
const blinking = (e, now) => (now + e.id * 977) % 3800 < 140;

function drawStaff(s, now) {
  const g = ui.game;
  const room = s.roomId && g.roomById(s.roomId);
  const working = !!(room && room.current && g.staffedAndReady(room));
  const f = s.kind === 'nurse' ? Math.floor(now / 200 + s.id) % 4 : s.kind === 'receptionist' ? Math.floor(now / 400) % 4 : (working ? Math.floor(now / 250) % 2 : walkFrame(s, now));
  const img = staffSprite(s.kind, f, blinking(s, now), working);
  const bob = s.kind === 'nurse' ? Math.round(Math.sin(now / 300 + s.id) * 1.5) - 3 : 0;
  drawImageAt(img, s.x - CHAR_W / 2, feetY(s) - CHAR_H + bob, s.dir < 0, s.kind === 'nurse' ? 0.88 : 1);
  if (s.kind === 'receptionist' && ui.glares.some((gl) => gl.until > now)) {
    ctx.fillStyle = '#f0ff60'; ctx.fillRect(Math.round(s.x) - 4, feetY(s) - CHAR_H + 9, 3, 2); ctx.fillRect(Math.round(s.x) + 2, feetY(s) - CHAR_H + 9, 3, 2);
  }
  if (s.shout) speech(s.x, feetY(s) - CHAR_H - 2, s.shout);
  if (isHovered(s)) outline(s);
}

function drawPatient(p, now) {
  const g = ui.game;
  const room = p.busy && g.roomById(p.roomId) || null;
  let x = p.x, y = feetY(p), flip = p.dir < 0;
  const sick = !p.cured;
  if (room && room.type === 'coffin') y -= 3;
  if (room && room.type === 'rewinder') flip = Math.floor(now / 160) % 2 === 0;    // spun round and round
  const img = patientSprite(p.kind, sick, walkFrame(p, now), blinking(p, now));
  drawImageAt(img, x - CHAR_W / 2, y - CHAR_H, flip);
  if (room && room.type === 'coffin') {
    ctx.fillStyle = 'rgba(200,235,255,0.35)'; ctx.fillRect(Math.round(x) - 8, Math.round(y) - CHAR_H + 2, 16, CHAR_H - 2);
  }
  if (room && room.type === 'rewinder') {
    ctx.strokeStyle = PAL.bandage[1]; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y - 18 + Math.sin(now / 80) * 4); ctx.lineTo(slotLeft(room.slot) + 59.5, roomTop(room.floor) + 14); ctx.stroke();
  }
  // the ailment on show
  if (sick && !p.busy && !p.ride) {
    if (p.kind === 'vampire' && Math.random() < 0.25) {
      addParticle({ x: x + (Math.random() - 0.5) * 8, y: y - 32, vx: (Math.random() - 0.5) * 4, vy: -10, ttl: 1.2, size: 1.5, grow: 1.5, color: 'rgba(200,200,210,0.55)' });
    }
    if (p.kind === 'mummy') {
      ctx.strokeStyle = PAL.bandage[1]; ctx.lineWidth = 1.5;
      const back = -p.dir;
      ctx.beginPath(); ctx.moveTo(x + back * 3, y - 14);
      ctx.quadraticCurveTo(x + back * 10, y - 6 + Math.sin(now / 150 + p.id), x + back * (14 + (p.walking ? Math.sin(now / 100) * 2 : 0)), y - 1);
      ctx.lineTo(x + back * 22, y - 1);
      ctx.stroke();
    }
  }
  if (p.cured && Math.random() < 0.15) addParticle({ x: x + (Math.random() - 0.5) * 14, y: y - 20 - Math.random() * 14, vx: 0, vy: -6, ttl: 0.6, size: 1, color: '#fff4a0' });
  // how they feel
  if (!p.busy && !p.ride && p.want !== 'exit') {
    const stuck = !p.roomId && !g.rooms.some((r) => r.type === p.want);
    if (stuck) { puff(x + 6, y - 36, '#4a7ad0', '?', now); }
    else if (p.mood === 'cross') { puff(x + 6, y - 36, '#e83030', '!!', now); }
    else if (p.mood === 'fed up') { puff(x + 6, y - 36, '#9a94a8', '...', now); }
  }
  if (p.shout) speech(x, y - 38, p.shout);
  if (isHovered(p)) outline(p);
}

function puff(x, y, color, str, now) {
  const b = Math.sin(now / 200) * 0.6;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y + b, 6, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  text(str, x, y + 2.2 + b, { size: 5, color: '#ffffff', align: 'center', shadow: false });
}

function speech(x, y, str) {
  ctx.font = `bold 6px ${UI_FONT}`;
  const w = ctx.measureText(str).width + 6;
  const bx = Math.max(2, Math.min(W - w - 2, x - w / 2));
  ctx.fillStyle = '#fffbe8'; ctx.fillRect(bx, y - 8, w, 9);
  ctx.fillRect(Math.round(x) - 1, y + 1, 3, 2);
  text(str, bx + 3, y - 1.5, { size: 6, color: '#3a1a14', shadow: false });
}

function drawLiftCage(e) {
  const y = feetY(e);
  ctx.strokeStyle = PAL.gold[1]; ctx.lineWidth = 1;
  ctx.strokeRect(LIFT_X - 10.5, y - 38.5, 21, 39);
  for (let x = LIFT_X - 7; x < LIFT_X + 10; x += 4) { ctx.fillStyle = 'rgba(226,176,48,0.8)'; ctx.fillRect(x, y - 38, 1, 38); }
}

function drawStatue(st) {
  drawImageAt(statueSprite(st.kind, st.sick), st.x - CHAR_W / 2, FLOOR_Y[0] - CHAR_H, st.dir < 0);
  if (isHovered(st)) outline({ x: st.x, floor: 0 });
}

// Medusa's stare: a crackling yellow-green beam from her eyes to the rude monster
function drawGlares(now) {
  ui.glares = ui.glares.filter((gl) => gl.until > now);
  for (const gl of ui.glares) {
    const y = FLOOR_Y[0] - CHAR_H + 10;
    ctx.globalAlpha = Math.min(1, (gl.until - now) / 300);
    ctx.strokeStyle = '#f0ff60'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gl.fromX, y);
    for (let k = 1; k <= 6; k++) ctx.lineTo(gl.fromX + (gl.toX - gl.fromX) * k / 6, y + 4 * k / 6 + (k < 6 ? (Math.random() - 0.5) * 3 : 0));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function isHovered(e) {
  if (!ui.mouse || ui.mouse.y >= TOOLBAR_Y) return false;
  const h = personUnder(ui.mouse.x, ui.mouse.y);
  return !!h && h.who === e;
}

function outline(e) {
  ctx.strokeStyle = ui.tool && ui.tool.kind === 'demolish' ? '#ff5050' : '#ffe080';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(e.x, feetY(e), 8, 2.5, 0, 0, Math.PI * 2); ctx.stroke();
}

// ---- the HUD, the hint ribbon, the ticker and the toolbar

const SPEED_BTN = (i) => ({ x: 404 + i * 18, y: 2, w: 16, h: 12 });

function drawHud() {
  const g = ui.game;
  ctx.fillStyle = '#1a1018'; ctx.fillRect(0, 0, W, HUD_H);
  ctx.fillStyle = '#8a6a3a'; ctx.fillRect(0, HUD_H - 1, W, 1);
  text(`£${Math.round(g.money).toLocaleString('en-GB')}`, 6, 11, { size: 9, color: g.money < 0 ? '#ff6050' : '#ffd24a' });
  // reputation as a bar
  text('REPUTATION', 74, 10.5, { size: 5.5, color: '#b8a8c8' });
  ctx.fillStyle = '#3a2a3a'; ctx.fillRect(110, 5, 60, 6);
  ctx.fillStyle = g.rep < 25 ? '#e83030' : g.rep < 50 ? '#e0a030' : '#58c040'; ctx.fillRect(110, 5, 60 * g.rep / 100, 6);
  text(`${Math.round(g.rep)}%`, 174, 10.5, { size: 6.5 });
  text(`CURED ${g.cured} / ${g.goal.cured}`, 200, 10.5, { size: 7, color: '#c0f0a0' });
  const into = (g.time % NIGHT) / NIGHT, mins = Math.floor(18 * 60 + into * 12 * 60) % (24 * 60);
  const hh = Math.floor(mins / 60), mm = Math.floor(mins / 10) * 10 % 60;
  const clock = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')}${hh >= 12 ? 'pm' : 'am'}`;
  text(`NIGHT ${g.night}  ${clock}`, 288, 10.5, { size: 7, color: '#c8b8ff' });
  ['❚❚', '▶', '▶▶', '▶▶▶'].forEach((label, i) => {
    const b = SPEED_BTN(i), on = ui.speed === SPEEDS[i];
    ctx.fillStyle = on ? '#8a6a3a' : '#2e2230'; ctx.fillRect(b.x, b.y, b.w, b.h);
    text(label, b.x + b.w / 2, b.y + 8.5, { size: 5.5, align: 'center', color: on ? '#fff4d0' : '#9a8aa0', shadow: false });
  });
}

// What to do next, worked out from the state of the clinic: { text, tool } where tool is the id of the
// toolbar button to press (it glows), or null. Says why when something is stuck.
function hint() {
  const g = ui.game;
  const has = (t) => g.rooms.some((r) => r.type === t);
  const build = (type, why) => (ui.tool && ui.tool.id === type
    ? { text: `Now click an empty room (the dark ones) to build the ${ROOMS[type].name}.`, tool: null, slots: true }
    : { text: `${why} Click the glowing ${ROOMS[type].name.toUpperCase()} button.`, tool: type });
  if (!has('consult')) return build('consult', 'Monsters are waiting! First they need a doctor to see them.');
  const unstaffed = g.rooms.find((r) => ROOMS[r.type].staff && !r.staffId);
  if (unstaffed) {
    const kind = ROOMS[unstaffed.type].staff;
    return { text: `Nobody works in the ${ROOMS[unstaffed.type].name}. Click the glowing HIRE ${STAFF[kind].name.toUpperCase()} button.`, tool: kind };
  }
  if (!has('coffin')) return build('coffin', 'Vampires have Daylight Sizzle.');
  if (!has('rewinder')) return build('rewinder', 'Mummies are Unravelling.');
  if (g.statues.length >= 2) return { text: `${g.statues.length} statues are making monsters nervous. Click one to sell it for £${STATUE_PRICE}.`, tool: null };
  const busiest = g.rooms.filter((r) => r.type !== 'reception').reduce((b, r) => (!b || r.queue.length > b.queue.length ? r : b), null);
  if (busiest && busiest.queue.length >= 4) return build(busiest.type, `Long queue at the ${ROOMS[busiest.type].name}: build another one.`);
  if (!has('lounge') && g.patients.some((p) => p.mood !== 'ok' && p.want !== 'exit')) return build('lounge', 'Monsters are getting fed up.');
  return { text: `Keep them coming! Goal: cure ${g.goal.cured} monsters and bank £${g.goal.money.toLocaleString('en-GB')}.`, tool: null };
}

// The hint sits on the street, just above the buttons it talks about.
function drawHint(now) {
  const h = hint();
  ctx.font = `bold 8px ${UI_FONT}`;
  const w = ctx.measureText(h.text).width + 20, x = (W - w) / 2, y = 239;
  const pulse = 0.5 + 0.5 * Math.sin(now / 250);
  ctx.fillStyle = 'rgba(30,14,30,0.94)'; ctx.fillRect(x, y, w, 12);
  ctx.strokeStyle = `rgba(255,210,74,${0.5 + 0.5 * pulse})`; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 11);
  text(h.text, W / 2, y + 9, { size: 8, color: '#ffe8b0', align: 'center' });
  // the button to press glows, with an arrow bouncing on it
  const i = TOOLS.findIndex((t) => t.id === h.tool);
  if (i >= 0) {
    const r = toolRect(i);
    ctx.strokeStyle = `rgba(255,230,100,${0.6 + 0.4 * pulse})`; ctx.lineWidth = 2;
    ctx.strokeRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
    const ay = r.y + 8 + Math.sin(now / 150) * 3, ax = r.x + r.w / 2;
    ctx.fillStyle = '#ffe060';
    ctx.beginPath(); ctx.moveTo(ax - 6, ay); ctx.lineTo(ax + 6, ay); ctx.lineTo(ax, ay + 7); ctx.fill();
    ctx.fillRect(ax - 2, ay - 6, 4, 6);
  }
  // with a room picked, the empty rooms pulse to say "click me"
  if (h.slots || (ui.tool && ui.tool.kind === 'room')) {
    const g = ui.game;
    for (let f = 0; f < FLOORS; f++) for (let sl = 0; sl < SLOTS; sl++) {
      if (g.roomAt(f, sl) || !g.canBuild(ui.tool.id, f, sl).ok) continue;
      ctx.strokeStyle = `rgba(128,255,128,${0.25 + 0.5 * pulse})`; ctx.lineWidth = 1;
      ctx.strokeRect(slotLeft(sl) + 2.5, roomTop(f) + 2.5, SLOT_W - 5, ROOM_H - 5);
    }
  }
}

// Messages about what just happened, along the top under the money.
function drawTicker(now) {
  ui.ticker = ui.ticker.filter((t) => t.until > now);
  const t = ui.ticker[ui.ticker.length - 1];
  if (!t) return;
  ctx.globalAlpha = Math.min(1, (t.until - now) / 600);
  ctx.font = `bold 7px ${UI_FONT}`;
  const w = ctx.measureText(t.text).width + 14;
  ctx.fillStyle = 'rgba(30,16,30,0.85)'; ctx.fillRect((W - w) / 2, HUD_H + 1, w, 10);
  text(t.text, 240, HUD_H + 8.5, { size: 7, color: t.kind === 'bad' ? '#ff9a80' : t.kind === 'money' ? '#ffd24a' : '#e0d8f0', align: 'center' });
  ctx.globalAlpha = 1;
}

function toolRect(i) { return { x: 4 + i * (TOOL_W + TOOL_GAP), y: TOOLBAR_Y + 3, w: TOOL_W, h: 44 }; }

function toolIcon(t, now) {
  if (t.kind === 'room') return roomArt(t.id);
  if (t.kind === 'hire') return staffSprite(t.id, Math.floor(now / 300) % 4, false, false);
  return demolishIcon();
}

function drawToolbar(now) {
  const g = ui.game;
  ctx.fillStyle = '#20141c'; ctx.fillRect(0, TOOLBAR_Y, W, H - TOOLBAR_Y);
  ctx.fillStyle = '#8a6a3a'; ctx.fillRect(0, TOOLBAR_Y, W, 1);
  TOOLS.forEach((t, i) => {
    const r = toolRect(i), on = ui.tool === t;
    const afford = g.money >= t.cost;
    const hover = ui.mouse && inside(ui.mouse, r);
    ctx.fillStyle = on ? '#5a3a2a' : hover ? '#3a2834' : '#2c1e28'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = on ? '#ffd24a' : '#5a4450'; ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    const icon = toolIcon(t, now);
    ctx.globalAlpha = afford ? 1 : 0.4;
    if (t.kind === 'room') ctx.drawImage(icon, r.x + 4, r.y + 3, 44, 35 * 44 / 72 + 3);
    else ctx.drawImage(icon, Math.round(r.x + r.w / 2 - icon.width / 2), r.y + 1);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(20,10,20,0.8)'; ctx.fillRect(r.x + 1, r.y + 29, r.w - 2, 14);
    const words = t.kind === 'room' ? ROOMS[t.id].name.split(' ') : t.kind === 'hire' ? ['HIRE', STAFF[t.id].name.toUpperCase()] : ['KNOCK', 'DOWN'];
    text(words[0], r.x + r.w / 2, r.y + 35, { size: 5.5, align: 'center', color: '#f0e4d0' });
    text(words.slice(1).join(' '), r.x + r.w / 2, r.y + 41.5, { size: 5.5, align: 'center', color: '#f0e4d0' });
    if (t.cost) {
      ctx.font = `bold 6px ${UI_FONT}`;
      const pw = ctx.measureText(`£${t.cost}`).width + 4;
      ctx.fillStyle = 'rgba(20,10,20,0.85)'; ctx.fillRect(r.x + r.w - pw - 1, r.y + 1, pw, 8);
      text(`£${t.cost}`, r.x + r.w - pw / 2 - 1, r.y + 7, { size: 6, align: 'center', color: afford ? '#ffd24a' : '#ff7060', shadow: false });
    }
  });
  // the goal
  const gx = 4 + TOOLS.length * (TOOL_W + TOOL_GAP) + 4, gw = W - gx - 4;
  panel(gx, TOOLBAR_Y + 3, gw, 44, '#2c1e28', '#5a4450');
  text('THE BOARD\'S GOAL', gx + gw / 2, TOOLBAR_Y + 12, { size: 6, align: 'center', color: '#c8a050' });
  const bar = (y, label, have, need, col) => {
    text(label, gx + 5, y, { size: 5.5, color: '#e0d8f0' });
    ctx.fillStyle = '#3a2a3a'; ctx.fillRect(gx + 5, y + 2, gw - 10, 4);
    ctx.fillStyle = col; ctx.fillRect(gx + 5, y + 2, (gw - 10) * Math.max(0, Math.min(1, have / need)), 4);
  };
  bar(TOOLBAR_Y + 22, `Cure ${g.goal.cured} monsters (${g.cured})`, g.cured, g.goal.cured, '#58c040');
  bar(TOOLBAR_Y + 36, `Bank £${g.goal.money.toLocaleString('en-GB')}`, g.money, g.goal.money, '#ffd24a');
}

const inside = (m, r) => m.x >= r.x && m.x < r.x + r.w && m.y >= r.y && m.y < r.y + r.h;

// The box by the mouse saying what is under it, and what a click would do.
function drawTooltip() {
  const g = ui.game, m = ui.mouse;
  if (!m || m.y >= TOOLBAR_Y || m.y < HUD_H) {
    if (m && m.y >= TOOLBAR_Y) {
      const i = TOOLS.findIndex((t, k) => inside(m, toolRect(k)));
      if (i >= 0) {
        const t = TOOLS[i];
        const blurb = t.kind === 'room' ? ROOMS[t.id].blurb : t.kind === 'hire' ? `Wages £${STAFF[t.id].wage} a night. Click to hire now.` : 'Click a room to knock it down for half its cost back, or a member of staff to fire them.';
        tooltip(m.x, TOOLBAR_Y - 2, [t.label + (t.cost ? `  £${t.cost}` : ''), blurb], true);
      }
    }
    return;
  }
  const lines = [];
  let bad = false;
  const who = personUnder(m.x, m.y);
  const at = slotUnder(m.x, m.y);
  if (ui.tool && ui.tool.kind === 'room') {
    if (!at) return;
    const can = g.canBuild(ui.tool.id, at.floor, at.slot);
    lines.push(can.ok ? `Build a ${ROOMS[ui.tool.id].name} here: £${ROOMS[ui.tool.id].cost}` : can.why);
    bad = !can.ok;
  } else if (who && who.type === 'patient') {
    const p = who.who;
    lines.push(`${p.name} the ${p.kind}`);
    lines.push(p.cured ? 'Cured, and very grateful' : p.diagnosed ? `Has ${AILMENTS[p.ailment].name}` : 'Not diagnosed yet');
    if (p.want !== 'exit') lines.push(`Looking for: ${ROOMS[p.want].name}`, `Patience: ${p.mood === 'ok' ? 'fine' : p.mood}`);
    else if (!p.cured) lines.push(p.mood === 'stormed' ? 'Storming out!' : 'Going home uncured');
  } else if (who && who.type === 'statue') {
    const st = who.who;
    lines.push(`A statue of ${st.name}`, `Click to sell it to the Gargoyle Gallery: £${STATUE_PRICE}`, 'Statues make waiting monsters nervous');
  } else if (who && who.type === 'staff') {
    const s = who.who, room = s.roomId && g.roomById(s.roomId);
    if (ui.tool && ui.tool.kind === 'demolish') { lines.push(s.kind === 'receptionist' ? 'Medusa cannot be fired' : `Fire ${s.name}`); bad = true; }
    else lines.push(`${s.name}, ${STAFF[s.kind].name}`, room ? `Works in the ${ROOMS[room.type].name}` : 'Waiting for a room to work in', `Wages £${STAFF[s.kind].wage} a night`);
  } else if (at) {
    const room = g.roomAt(at.floor, at.slot);
    if (!room) lines.push('An empty wing. Pick a room below to build here.');
    else if (ui.tool && ui.tool.kind === 'demolish') {
      bad = true;
      lines.push(ROOMS[room.type].fixed ? 'Reception has to stay' : `Knock down the ${ROOMS[room.type].name}: get £${ROOMS[room.type].cost / 2} back`);
    } else {
      const def = ROOMS[room.type];
      lines.push(def.name);
      if (def.blurb) lines.push(def.blurb);
      if (def.staff) {
        const s = room.staffId && g.staffById(room.staffId);
        lines.push(s ? `Staff: ${s.name}` : `No ${STAFF[def.staff].name}! Hire one below.`);
        if (!s) bad = true;
        lines.push(`Queue: ${room.queue.length}${room.current ? ` (seeing ${g.patientById(room.current).name})` : ''}`);
      }
    }
  }
  if (lines.length) tooltip(m.x, m.y, lines, false, bad);
}

function tooltip(x, y, lines, above, bad = false) {
  ctx.font = `bold 6.5px ${UI_FONT}`;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 10, h = lines.length * 8.5 + 5;
  let bx = Math.max(2, Math.min(W - w - 2, x + 8)), by = above ? y - h : y + 10;
  if (by + h > TOOLBAR_Y) by = y - h - 6;
  panel(bx, by, w, h, 'rgba(24,14,26,0.94)', bad ? '#e05040' : '#c8a050');
  lines.forEach((l, i) => text(l, bx + 5, by + 9 + i * 8.5, { size: 6.5, color: i === 0 ? (bad ? '#ff9a80' : '#ffe8b0') : '#d8d0e4' }));
}

// the room under the mouse lit up to show what a click would do
function drawSlotHighlight() {
  const g = ui.game, m = ui.mouse;
  if (!m || !ui.tool || ui.tool.kind === 'hire') return;
  const at = slotUnder(m.x, m.y);
  if (!at) return;
  const room = g.roomAt(at.floor, at.slot);
  let col = null;
  if (ui.tool.kind === 'room') col = g.canBuild(ui.tool.id, at.floor, at.slot).ok ? '#80ff80' : '#ff5050';
  else if (ui.tool.kind === 'demolish' && room && !personUnder(m.x, m.y)) col = ROOMS[room.type].fixed ? '#806060' : '#ff5050';
  if (!col) return;
  ctx.strokeStyle = col; ctx.lineWidth = 1;
  ctx.strokeRect(slotLeft(at.slot) + 0.5, roomTop(at.floor) + 0.5, SLOT_W - 1, ROOM_H - 1);
  ctx.globalAlpha = 0.12; ctx.fillStyle = col; ctx.fillRect(slotLeft(at.slot), roomTop(at.floor), SLOT_W, ROOM_H); ctx.globalAlpha = 1;
  if (ui.tool.kind === 'room' && !room) { ctx.globalAlpha = 0.5; ctx.drawImage(roomArt(ui.tool.id), slotLeft(at.slot), roomTop(at.floor)); ctx.globalAlpha = 1; }
}

// ---- particles

function addParticle(p) { particles.push({ vx: 0, vy: 0, ttl: 1, size: 1, grow: 0, ...p, age: 0 }); }

function updateParticles(dt) {
  for (const p of particles) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.size += p.grow * dt; }
  particles = particles.filter((p) => p.age < p.ttl);
}

function drawParticles() {
  for (const p of particles) {
    const a = 1 - p.age / p.ttl;
    ctx.globalAlpha = Math.max(0, a);
    if (p.text) text(p.text, p.x, p.y, { size: 7, color: p.color, align: 'center' });
    else { ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), Math.ceil(p.size), Math.ceil(p.size)); }
  }
  ctx.globalAlpha = 1;
}

function floatMoney(amount, x, y) {
  addParticle({ text: `${amount >= 0 ? '+' : '-'}£${Math.abs(amount)}`, x, y, vy: -12, ttl: 1.6, color: amount >= 0 ? '#ffe060' : '#ff7060' });
}

function dust(x, y) {
  for (let i = 0; i < 24; i++) addParticle({ x: x + (Math.random() - 0.5) * 60, y: y + 40 + Math.random() * 14, vx: (Math.random() - 0.5) * 30, vy: -10 - Math.random() * 20, ttl: 1 + Math.random(), size: 2 + Math.random() * 2, grow: 2, color: 'rgba(180,170,190,0.6)' });
}

// What the rules reported this tick: sounds, money floating up, and messages.
function handleEvents() {
  const g = ui.game;
  for (const e of g.events) {
    const roomY = (f) => roomTop(f) + 14;
    if (e.type === 'message') say(e.text, e.kind);
    else if (e.type === 'cash') { floatMoney(e.amount, e.x, roomY(e.floor)); Sound.play('cash'); }
    else if (e.type === 'built') { floatMoney(e.amount, e.x, roomY(e.floor)); dust(e.x, roomTop(e.floor)); Sound.play('build'); ui.shake = 0.15; }
    else if (e.type === 'demolished') { floatMoney(e.amount, e.x, roomY(e.floor)); dust(e.x, roomTop(e.floor)); Sound.play('demolish'); ui.shake = 0.3; }
    else if (e.type === 'hired') { floatMoney(e.amount, 40, roomY(0)); Sound.play('hire'); }
    else if (e.type === 'fired') { for (let i = 0; i < 12; i++) addParticle({ x: e.x, y: FLOOR_Y[e.floor] - 16, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, ttl: 0.8, size: 3, grow: 3, color: 'rgba(200,190,210,0.6)' }); Sound.play('fire'); }
    else if (e.type === 'payday') { addParticle({ text: `Wages -£${-e.amount}`, x: 30, y: 26, vy: 6, ttl: 2.5, color: '#ff8060' }); Sound.play('payday'); }
    else if (e.type === 'cured') {
      for (let i = 0; i < 18; i++) addParticle({ x: e.x, y: FLOOR_Y[e.floor] - 18, vx: (Math.random() - 0.5) * 50, vy: -Math.random() * 50, ttl: 1, size: 1.5, color: ['#fff4a0', '#a0ffb0', '#ffb0e0'][i % 3] });
      Sound.play('cured');
    }
    else if (e.type === 'stormed') Sound.play('storm');
    else if (e.type === 'petrified') {
      ui.glares.push({ fromX: e.fromX, toX: e.x, until: performance.now() + 600 });
      for (let i = 0; i < 16; i++) addParticle({ x: e.x + (Math.random() - 0.5) * 12, y: FLOOR_Y[0] - Math.random() * 30, vx: (Math.random() - 0.5) * 20, vy: -Math.random() * 15, ttl: 0.9, size: 2, grow: 1, color: 'rgba(190,186,176,0.7)' });
      Sound.play('stone'); ui.shake = 0.12;
    }
    else if (e.type === 'statueSold') { floatMoney(e.amount, e.x, FLOOR_Y[0] - 40); dust(e.x, roomTop(0)); Sound.play('cash'); }
    else if (e.type === 'sentHome') Sound.play('sad');
    else if (e.type === 'lift') Sound.play('ding');
    else if (e.type === 'arrive') Sound.play('creak');
    else if (e.type === 'won') Sound.play('win');
    else if (e.type === 'lost') Sound.play('lose');
  }
  g.events.length = 0;
}

// ---- screens

function drawTitle(now) {
  drawScene(now);
  // a parade of patients shuffling along the street
  for (let i = 0; i < 5; i++) {
    const x = ((now / 1000 * 22 + i * 70) % (W + 60)) - 30;
    const kind = i % 2 ? 'mummy' : 'vampire';
    const img = patientSprite(kind, true, Math.floor(now / 140 + i) % 4, false);
    ctx.drawImage(img, Math.round(x - CHAR_W / 2), 250 - CHAR_H);
  }
  ctx.fillStyle = 'rgba(10,6,20,0.55)'; ctx.fillRect(0, 0, W, H);
  // the title, dripping
  ctx.font = `bold 40px ${TITLE_FONT}`; ctx.textAlign = 'center';
  ctx.fillStyle = '#0a0410'; ctx.fillText('St Ghoulsby\'s', 241.5, 101.5);
  const grad = ctx.createLinearGradient(0, 70, 0, 102);
  grad.addColorStop(0, '#d8ff90'); grad.addColorStop(1, '#4aa030');
  ctx.fillStyle = grad; ctx.fillText('St Ghoulsby\'s', 240, 100);
  for (let k = 0; k < 9; k++) {
    const dx = 140 + k * 25 + (k * 37) % 11, len = 3 + ((k * 13) % 7) + Math.abs(Math.sin(now / 900 + k)) * 6;
    ctx.fillStyle = '#4aa030'; ctx.fillRect(dx, 99, 2, len); ctx.beginPath(); ctx.arc(dx + 1, 99 + len, 1.6, 0, Math.PI * 2); ctx.fill();
  }
  text('INFIRMARY FOR THE UNWELL UNDEAD', 240, 122, { size: 9, color: '#ffd24a', align: 'center' });
  text('Build rooms, hire staff and cure monsters of their ridiculous ailments.', 240, 142, { size: 7, align: 'center', color: '#e0d8f0' });
  if (Math.floor(now / 600) % 2) text('CLICK TO OPEN THE DOORS', 240, 172, { size: 9, align: 'center', color: '#ffffff' });
  text('Inspired by Theme Hospital', 240, 290, { size: 6, align: 'center', color: '#8a7a9a' });
}

function drawEnd() {
  const g = ui.game;
  ctx.fillStyle = 'rgba(10,6,20,0.75)'; ctx.fillRect(0, 0, W, H);
  panel(110, 70, 260, 140, '#1e1222', g.result === 'won' ? '#ffd24a' : '#e05040');
  const won = g.result === 'won';
  text(won ? 'A TRIUMPH OF MEDICINE!' : 'ST GHOULSBY\'S IS CLOSED', 240, 96, { size: 12, align: 'center', color: won ? '#ffd24a' : '#ff8070', font: TITLE_FONT });
  text(won ? 'The Board of Ghouls is delighted.' : g.loseReason, 240, 114, { size: 7, align: 'center' });
  const rows = [['Monsters cured', g.cured], ['Stormed out', g.stormed], ['Sent home uncured', g.sentHome], ['Money in the bank', `£${Math.round(g.money).toLocaleString('en-GB')}`], ['Nights', g.night]];
  rows.forEach(([k, v], i) => { text(k, 150, 134 + i * 11, { size: 7, color: '#c8b8d8' }); text(String(v), 330, 134 + i * 11, { size: 7, align: 'right', color: '#ffe8b0' }); });
  text('Click to play again', 240, 202, { size: 7, align: 'center', color: '#ffffff' });
}

// ---- input

function toArt(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}

canvas.addEventListener('mousemove', (e) => { ui.mouse = toArt(e); });
canvas.addEventListener('mouseleave', () => { ui.mouse = null; });
canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); ui.tool = null; });

canvas.addEventListener('mousedown', (e) => {
  Sound.init();
  if (e.button !== 0) return;
  const m = toArt(e);
  ui.mouse = m;
  if (ui.screen === 'title') { newGame(); return; }
  const g = ui.game;
  if (g.result) { newGame(); return; }
  for (let i = 0; i < SPEEDS.length; i++) if (inside(m, SPEED_BTN(i))) { ui.speed = SPEEDS[i]; Sound.play('click'); return; }
  if (m.y >= TOOLBAR_Y) {
    const i = TOOLS.findIndex((t, k) => inside(m, toolRect(k)));
    if (i < 0) return;
    const t = TOOLS[i];
    if (t.kind === 'hire') {
      const r = g.hire(t.id);
      if (!r.ok) { say(r.why, 'bad'); Sound.play('nope'); }
      else say(`${r.staff.name} has joined St Ghoulsby's.`);
      return;
    }
    ui.tool = ui.tool === t ? null : t;
    Sound.play('click');
    return;
  }
  const clicked = personUnder(m.x, m.y);
  if (clicked && clicked.type === 'statue' && (!ui.tool || ui.tool.kind === 'demolish')) { g.sellStatue(clicked.who.id); return; }
  if (!ui.tool) return;
  const at = slotUnder(m.x, m.y);
  if (ui.tool.kind === 'room') {
    if (!at) return;
    const r = g.build(ui.tool.id, at.floor, at.slot);
    if (!r.ok) { say(r.why, 'bad'); Sound.play('nope'); }
    return;
  }
  if (ui.tool.kind === 'demolish') {
    const who = personUnder(m.x, m.y);
    if (who && who.type === 'staff') {
      const r = g.fire(who.who.id);
      if (!r.ok) { say(r.why, 'bad'); Sound.play('nope'); } else say(`${who.who.name} has been let go.`);
      return;
    }
    const room = at && g.roomAt(at.floor, at.slot);
    if (!room) return;
    const r = g.demolish(room.id);
    if (!r.ok) { say(r.why, 'bad'); Sound.play('nope'); }
  }
});

window.addEventListener('keydown', (e) => {
  Sound.init();
  if (ui.screen !== 'play') return;
  if (e.key === 'Escape') ui.tool = null;
  else if (e.key === ' ') { ui.speed = ui.speed ? 0 : 1; e.preventDefault(); }
  else if (e.key >= '1' && e.key <= '3') ui.speed = SPEEDS[Number(e.key)];
  else if (e.key === 'm' || e.key === 'M') Sound.muted = !Sound.muted;
});

// ---- the main loop

function frame(now) {
  const dt = Math.min(0.1, (now - (ui.last || now)) / 1000);
  ui.last = now;
  ctx.setTransform(PIX, 0, 0, PIX, 0, 0);
  ctx.imageSmoothingEnabled = false;
  if (ui.screen === 'title') {
    drawTitle(now);
  } else {
    const g = ui.game;
    if (!g.result) {
      ui.carry += dt * ui.speed;
      while (ui.carry >= TICK) { g.tick(); ui.carry -= TICK; }
    }
    handleEvents();
    if (ui.shake > 0) {
      ui.shake -= dt;
      ctx.translate(Math.round((Math.random() - 0.5) * 3), Math.round((Math.random() - 0.5) * 3));
    }
    drawScene(now);
    drawSlotHighlight();
    drawParticles();
    ctx.setTransform(PIX, 0, 0, PIX, 0, 0);
    drawHud();
    drawTicker(now);
    drawToolbar(now);
    drawHint(now);
    if (ui.speed === 0 && !g.result) text('PAUSED  (SPACE)', 240, 140, { size: 14, align: 'center', color: '#ffffff' });
    drawTooltip();
    if (g.result) drawEnd();
  }
  updateParticles(dt);
  requestAnimationFrame(frame);
}

if (!window.NO_LOOP) requestAnimationFrame(frame);
