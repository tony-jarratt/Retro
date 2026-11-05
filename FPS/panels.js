// See-through panels: windows of wired glass, and steel bar grilles.
//
// Like a door, a panel is a thin slab across the MIDDLE of its cell (rays find
// it with hitPanel in raycaster.js). Unlike a wall, a ray that hits one doesn't
// stop: it notes the panel and carries on to the solid wall behind, and the
// renderer then draws the panels over that wall, farthest first.
//
// What gets through each kind:
//              you/robots  sight  light  bullets
//   glass      no          yes    yes    no: it takes the hit (2 hits shatter it)
//   grate      no          yes    yes    yes
// A shattered window is just its frame and jagged teeth: you still can't climb
// through, but sight and bullets now pass.

const GLASS_HITS = 2;          // hits to shatter a window: the first only cracks it
const GLASS_BURST_TIME = 0.4;  // seconds the falling fragments are shown
const GLASS_BURST_LIGHT = { colour: [0.5, 0.6, 0.65], radius: 1.5 }; // a glint as it goes

// One entry per glass or grate cell in MAP, built once at startup:
//   x, y        its cell
//   horizontal  true if it runs east-west (walls or other panels to its left and right)
//   kind        'glass' or 'grate'
//   state       glass: 'intact' -> 'cracked' -> 'shattered'; a grate stays 'intact'
const PANELS = findPanels();

// Shatterings in progress: where, and seconds since. Shown as falling glass.
const glassBursts = [];

function isPanelCell(cell) {
  return cell === GLASS_CELL || cell === GRATE_CELL;
}

function findPanels() {
  // Its two ends must be held by something solid (a wall, or the next panel
  // in a long window), and its two faces must open onto floor.
  const isHeld = (x, y) => { const c = MAP[y]?.[x]; return c !== undefined && c !== 0 && c !== DOOR_CELL; };
  const isFloor = (x, y) => MAP[y]?.[x] === 0;

  const panels = [];
  MAP.forEach((row, y) => row.forEach((cell, x) => {
    if (!isPanelCell(cell)) return;
    const horizontal = isHeld(x - 1, y) && isHeld(x + 1, y) && isFloor(x, y - 1) && isFloor(x, y + 1);
    const vertical = isHeld(x, y - 1) && isHeld(x, y + 1) && isFloor(x - 1, y) && isFloor(x + 1, y);
    if (!horizontal && !vertical) {
      throw new Error(`Panel at MAP[${y}][${x}] must be held by walls or panels at both ends, with floor on both faces.`);
    }
    panels.push({ x, y, horizontal, kind: cell === GLASS_CELL ? 'glass' : 'grate', state: 'intact' });
  }));
  return panels;
}

function panelAt(x, y) {
  return PANELS.find((p) => p.x === x && p.y === y);
}

function panelTexture(panel) {
  return panel.kind === 'grate' ? GRATE_TEXTURE : GLASS_TEXTURES[panel.state];
}

// Does this panel stop a bullet? Only glass that isn't broken yet.
function stopsBullets(panel) {
  return panel.kind === 'glass' && panel.state !== 'shattered';
}

// Of the panels a ray passed (castRay's hit.panes, nearest first), the first
// one that stops bullets and is nearer than maxDist, or null.
function firstBulletStop(panes, maxDist) {
  return panes.find((pane) => stopsBullets(pane.panel) && pane.dist < maxDist) || null;
}

// A bullet from (x1, y1) towards (x2, y2): the window that catches it on
// the way, or null if it gets there.
function glassInTheWay(x1, y1, x2, y2) {
  const d = Math.hypot(x2 - x1, y2 - y1);
  if (d < 0.01) return null;
  const pane = firstBulletStop(castRay(x1, y1, (x2 - x1) / d, (y2 - y1) / d).panes, d);
  return pane ? pane.panel : null;
}

// A shot hits this window: it cracks, and the next hit shatters it.
function hitGlass(panel) {
  if (panel.state === 'intact' && GLASS_HITS > 1) panel.state = 'cracked';
  else if (panel.state !== 'shattered') shatterGlass(panel);
}

function shatterGlass(panel) {
  if (panel.state === 'shattered') return;
  panel.state = 'shattered';
  glassBursts.push({ x: panel.x + 0.5, y: panel.y + 0.5, time: 0 });
}

// A blast at (x, y) blows in every window within its radius that it can
// reach (measured to the middle of the pane).
function shatterGlassNear(x, y, radius) {
  for (const panel of PANELS) {
    if (panel.kind !== 'glass' || panel.state === 'shattered') continue;
    const cx = panel.x + 0.5;
    const cy = panel.y + 0.5;
    if (Math.hypot(cx - x, cy - y) < radius && clearLine(x, y, cx, cy)) shatterGlass(panel);
  }
}

function updatePanels(dt) {
  // Walk backwards: removing one doesn't skip the next.
  for (let i = glassBursts.length - 1; i >= 0; i--) {
    glassBursts[i].time += dt;
    if (glassBursts[i].time >= GLASS_BURST_TIME) glassBursts.splice(i, 1);
  }
}

// Which frame of the falling-glass animation to show.
function glassBurstTexture(burst) {
  const frame = Math.min(GLASS_BURST_FRAMES.length - 1, Math.floor(burst.time / GLASS_BURST_TIME * GLASS_BURST_FRAMES.length));
  return GLASS_BURST_FRAMES[frame];
}
