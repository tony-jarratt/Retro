// FLOOR PLANS (owner, 2026-11-06): stand at one and you see the layout of
// the whole level, rooms and doors, while you're there. Walk away and it's
// gone, so you look, remember the route, and go.
//
// Each setting has its own:
//   industrial   the security TERMINALS (security.js) show the site plan on
//                their screens; a level with no terminals has a wall monitor
//   lab          a WHITEBOARD with the layout sketched on it in marker
//   hq           a FIRE EVACUATION PLAN, framed on the wall
// A level lists its plan signs in `plans` (levels/*.js): { x, y, face }, the
// wall cell and which face of it, as for a wall decal. Their pictures are
// decals (decals.js: makePlanSign).
//
// THE PLAN SHOWS ROOMS ONLY: walls and doorways. No pickups, no props, no
// enemies, no objective: it's the building, not a radar. The one mark on it
// is YOU ARE HERE, where the plan itself is, as on a real one.

const PLAN_RANGE = 1.3;     // cells from the sign's face: standing in front of it
const PLAN_FACING = 1.2;    // radians either side of looking straight at it
const PLAN_MAX_CELL = 5;    // screen pixels per map cell, at most
const PLAN_DECAL = { industrial: 'planScreen', lab: 'planWhiteboard', hq: 'planEvacuation' };

// Every plan in the level: where you stand to read it (the middle of the
// floor cell in front of it), and the wall point it hangs on.
const plans = [];
PLANS.forEach((p, n) => {
  const step = FACE_STEPS[p.face]; // decals.js
  if (!step) throw new Error(`PLANS[${n}] at (${p.x}, ${p.y}) needs face N, S, E or W, not "${p.face}".`);
  if (!takesWallDecals(MAP[p.y]?.[p.x]) || MAP[p.y + step[1]]?.[p.x + step[0]] !== 0) {
    throw new Error(`PLANS[${n}] at cell (${p.x}, ${p.y}) face ${p.face}: that must be a plain wall with floor on its ${p.face} side.`);
  }
  placeDecal('wall', p.x, p.y, p.face, PLAN_DECAL[THEME_NAME], 0);
  plans.push({ wallX: p.x + 0.5 + step[0] * 0.5, wallY: p.y + 0.5 + step[1] * 0.5, hereX: p.x + step[0], hereY: p.y + step[1] });
});
// The industrial sector's terminals are its plans: read from the floor in
// front, on either side (a terminal in a dividing wall has a screen each way).
if (THEME_NAME === 'industrial') {
  for (const t of TERMINALS) {
    const faces = Object.values(FACE_STEPS).filter(([dx, dy]) => MAP[t.y + dy]?.[t.x + dx] === 0);
    if (faces.length === 0) console.warn(`plans.js: the terminal at (${t.x}, ${t.y}) has no floor in front of it, so it shows no plan.`);
    for (const [dx, dy] of faces) plans.push({ wallX: t.x + 0.5 + dx * 0.5, wallY: t.y + 0.5 + dy * 0.5, hereX: t.x + dx, hereY: t.y + dy });
  }
}
if (plans.length === 0) console.warn(`plans.js: level "${CURRENT_LEVEL.id}" has no floor plan anywhere.`);

// The plan you're standing at and looking at, or null (hud.js, each frame).
function planInView() {
  for (const p of plans) {
    const dx = p.wallX - player.x, dy = p.wallY - player.y;
    if (Math.hypot(dx, dy) > PLAN_RANGE) continue;
    if (Math.abs(angleDiff(Math.atan2(dy, dx), player.angle)) > PLAN_FACING) continue; // enemies.js
    return p;
  }
  return null;
}

// What each cell is ON THE PLAN: 'room' (floor), 'door', 'wall' (a wall
// next to a room, so it's drawn), or null (solid rock, or outside: not drawn).
// Windows, grates, tank glass, the lift: all walls, as far as a plan cares.
function planCell(x, y) {
  const cell = MAP[y][x];
  if (cell === 0) return 'room';
  if (cell === DOOR_CELL) return 'door';
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (MAP[y + dy]?.[x + dx] === 0) return 'wall';
  return null;
}

// The three looks, as colours: the panel, its border, walls, doors, the title, YOU ARE HERE.
const PLAN_LOOKS = {
  industrial: { panel: [6, 16, 10], border: [70, 210, 110], wall: [70, 210, 110], door: [190, 255, 200], title: 'SITE PLAN', titleInk: [70, 210, 110], here: [255, 220, 90], band: null },
  lab:        { panel: [228, 230, 226], border: [170, 174, 180], wall: [40, 70, 170], door: null, title: 'LAYOUT', titleInk: [40, 70, 170], here: [200, 50, 40], band: null },
  hq:         { panel: [236, 232, 218], border: [40, 40, 44], wall: [30, 30, 34], door: null, title: 'FIRE EVACUATION PLAN', titleInk: [245, 240, 230], here: [200, 40, 30], band: [200, 40, 30] },
};

// Draw it over the view (hud.js): a panel in the middle of the screen.
// A door is a gap in the wall on paper (a whiteboard or a printed plan), a
// brighter mark on a screen. The marker on a whiteboard skips here and
// there, as marker does.
function drawPlan(pixels, plan) {
  const look = PLAN_LOOKS[THEME_NAME];
  const cols = MAP[0].length, rows = MAP.length;
  const size = Math.max(2, Math.min(PLAN_MAX_CELL, Math.floor(220 / cols), Math.floor(120 / rows)));
  const w = cols * size, h = rows * size;
  const x0 = Math.floor((SCREEN_W - w) / 2), y0 = 30;
  fillRect(pixels, x0 - 6, y0 - 16, w + 12, h + 26, look.border);
  fillRect(pixels, x0 - 4, y0 - 14, w + 8, h + 22, look.panel);
  if (look.band) fillRect(pixels, x0 - 4, y0 - 14, w + 8, 10, look.band);
  drawText(pixels, look.title + '  ' + CURRENT_LEVEL.name, x0, y0 - 11, look.titleInk, 1);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const kind = planCell(x, y);
      if (kind === 'wall' || (kind === 'door' && look.door)) {
        if (THEME_NAME === 'lab' && noise(x, y, 125) < 0.12) continue; // the marker skipped
        fillRect(pixels, x0 + x * size, y0 + y * size, size, size, kind === 'door' ? look.door : look.wall);
      }
    }
  }
  // YOU ARE HERE: where the plan hangs. It blinks on the screen; on paper it's printed.
  if (THEME_NAME !== 'industrial' || Math.floor(animTime * 3) % 2 === 0) {
    fillRect(pixels, x0 + plan.hereX * size + Math.floor(size / 2) - 1, y0 + plan.hereY * size + Math.floor(size / 2) - 1, 3, 3, look.here);
  }
  drawText(pixels, 'YOU ARE HERE', x0 + w - textWidth('YOU ARE HERE', 1), y0 + h + 2, look.here, 1);
}
