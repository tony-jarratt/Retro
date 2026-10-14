'use strict';

// Drawing a frame: the land view, the map book and the panel, all into the 16-colour screen.

// ---- the land ----
// Light comes from the viewer's left (the +v side) and from above, so slopes facing down-left are lit and slopes facing
// down-right are shaded, like the cut faces at the front. A facet is lit, plain or shaded by how much it turns
// towards that light compared with flat ground.
const LIGHT = (() => { const l = [-0.35, 1, 1.4], m = Math.hypot(...l); return l.map((x) => x / m); })();
const RISE = 0.6; // one step of height, in tiles, for the lighting
function facetShade(p0, p1, p2) {
  const e1 = [p1[0] - p0[0], p1[1] - p0[1], (p1[2] - p0[2]) * RISE], e2 = [p2[0] - p0[0], p2[1] - p0[1], (p2[2] - p0[2]) * RISE];
  let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  if (n[2] < 0) n = n.map((x) => -x);
  const d = (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / Math.hypot(...n);
  return d > LIGHT[2] + 0.05 ? 0 : d < LIGHT[2] - 0.05 ? 2 : 1; // 0 lit, 1 plain, 2 shaded
}
// The colour of a facet from its corner heights: sea, sandy shore, grass, rock, snow.
const LAND = { sand: [C.sand, C.sand, C.rockLit], grass: [C.grassLit, C.grass, C.grassDark], rock: [C.rockLit, C.rock, C.earth], snow: [C.snow, C.snow, C.grey] };
// The grid line drawn over a facet of each colour: a shade darker.
const GRID = { [C.sand]: C.rockLit, [C.grassLit]: C.grass, [C.grass]: C.grassDark, [C.grassDark]: C.earth, [C.rockLit]: C.rock,
  [C.rock]: C.earth, [C.earth]: C.earth, [C.snow]: C.grey, [C.grey]: C.grey };
// The season paints the land: snow on the high land in winter, the lowest land parched in summer.
const PARCHED = [C.sand, C.rockLit, C.rock];
function facetColour(heights, shade, season = 'NONE') {
  const lo = Math.min(...heights), hi = Math.max(...heights);
  if (hi === 0) return C.sea;
  if (lo === 0) return LAND.sand[shade];
  if (hi >= MAX_H || (season === 'WINTER' && lo >= HIGH_LAND)) return LAND.snow[shade];
  if (hi >= 5) return LAND.rock[shade];
  if (season === 'SUMMER' && hi <= LOW_LAND) return PARCHED[shade];
  return LAND.grass[shade];
}

// The land, back to front a diagonal row at a time, with the people standing on each row drawn straight after it,
// so a hill in front hides whoever is behind it.
function drawLand(s, world, ms) {
  const t = world.terrain, cam = world.cam, glintFrame = Math.floor(ms / 400), people = peopleByRow(world, ms), fields = fieldTiles(world);
  const season = seasonOf(world).name;
  const reach = world.ai[PLAYER] ? null : reachMap(world, PLAYER); // dim what a human player cannot touch (not in the title demo)
  let row = 0;
  for (const { u, v } of tilesInView(cam)) {
    const r = u - cam.u + v - cam.v;
    if (r !== row) { drawPeople(s, people.get(row)); row = r; }
    const k = [[u, v], [u + 1, v], [u + 1, v + 1], [u, v + 1]].map(([a, b]) => [a, b, heightAt(t, a, b)]);
    const pts = k.map(([a, b, h]) => project(cam, a, b, h));
    const colours = TILE_SPLIT.map(([i, j, l]) => {
      const c = facetColour([k[i][2], k[j][2], k[l][2]], facetShade(k[i], k[j], k[l]), season);
      fillTri(s, pts[i], pts[j], pts[l], c);
      return c;
    });
    // a faint line along each tile's two back edges, so the squares of flat ground can be counted
    if (colours[0] !== C.sea) { line(s, pts[0], pts[1], GRID[colours[0]]); line(s, pts[0], pts[3], GRID[colours[0]]); }
    if (t.f[v * t.n + u] === FEATURE.swamp) { // a bog: dark murky water filling most of the square
      const mid = project(cam, u + 0.5, v + 0.5, k[0][2]), bog = pts.map((p) => [mid[0] + (p[0] - mid[0]) * 0.75, mid[1] + (p[1] - mid[1]) * 0.75]);
      fillQuad(s, bog[0], bog[1], bog[2], bog[3], C.earth);
      fillRect(s, Math.round(mid[0]) - 6, Math.round(mid[1]) + 1, 3, 1, C.grassDark);
      fillRect(s, Math.round(mid[0]) + 3, Math.round(mid[1]) - 2, 2, 1, C.deep);
    }
    if (fields.has(v * t.n + u)) { // a house's farmland: a field of crops with furrows across it
      const mid = project(cam, u + 0.5, v + 0.5, k[0][2]), f = pts.map((p) => [mid[0] + (p[0] - mid[0]) * 0.8, mid[1] + (p[1] - mid[1]) * 0.8]);
      const crop = { AUTUMN: [C.gold, C.rockLit], WINTER: [C.snow, C.grey], SUMMER: [C.sand, C.rockLit] }[season] || [C.grassLit, C.sand]; // golden at harvest
      fillQuad(s, f[0], f[1], f[2], f[3], crop[0]);
      for (const d of [0.25, 0.5, 0.75]) line(s, lerp2(f[0], f[3], d), lerp2(f[1], f[2], d), crop[1]);
    }
    if (reach && !reach[v * t.n + u]) { for (const [i, j, l] of TILE_SPLIT) veilTri(s, pts[i], pts[j], pts[l], C.black); } // beyond your reach
    if (k.every((c) => c[2] === 0)) { // foam where the sea meets the land, washing in and out
      const mid = project(cam, u + 0.5, v + 0.5, 0), wash = Math.floor(ms / 500) % 2 ? 0.1 : 0.2;
      for (const [du, dv, i, j] of [[0, -1, 0, 1], [1, 0, 1, 2], [0, 1, 2, 3], [-1, 0, 3, 0]]) {
        const a = u + du, b = v + dv;
        if (a < 0 || b < 0 || a >= t.n || b >= t.n || isWater(t, a, b)) continue;
        line(s, lerp2(pts[i], mid, wash), lerp2(pts[j], mid, wash), C.snow);
      }
    }
    if (k.every((c) => c[2] === 0)) { // a glint on the water, moving now and then
      const g = ((u * 73856093) ^ (v * 19349663) ^ (glintFrame * 83492791)) >>> 0;
      if (g % 3 === 0) {
        const [cx, cy] = project(cam, u + 0.5, v + 0.5, 0), ox = (g >> 4) % 13 - 6, oy = (g >> 8) % 5 - 2;
        fillRect(s, Math.round(cx + ox), Math.round(cy + oy), 3, 1, C.glint);
      }
    }
  }
  drawPeople(s, people.get(row));
}

const lerp2 = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
// The tiles that are some house's farmland (its patch of flat ground, not counting the house's own tile), as a set of
// tile indices, for the houses in or near the view.
function fieldTiles(world) {
  const t = world.terrain, cam = world.cam, out = new Set();
  for (const h of world.houses) {
    if (h.u < cam.u - 3 || h.v < cam.v - 3 || h.u > cam.u + VIEW_N + 2 || h.v > cam.v + VIEW_N + 2) continue;
    for (const p of houseLand(world, h)) if (p.u !== h.u || p.v !== h.v) out.add(p.v * t.n + p.u);
  }
  return out;
}

// The height of the land under a point (bilinear across the tile's corners).
function groundAt(t, x, y) {
  const u = Math.min(t.n - 1, Math.floor(x)), v = Math.min(t.n - 1, Math.floor(y)), fx = x - u, fy = y - v;
  const [nw, ne, se, sw] = tileCorners(t, u, v);
  return nw * (1 - fx) * (1 - fy) + ne * fx * (1 - fy) + se * fx * fy + sw * (1 - fx) * fy;
}
// Every tree, rock, house, sheep and walker in view, as draw calls grouped by the diagonal row of tiles they stand on.
// Each house, stone, walker and sheep drawn also leaves its box on screen in world.picks, so the mouse can point at it.
function peopleByRow(world, ms) {
  const t = world.terrain, cam = world.cam, rows = new Map();
  world.picks = [];
  const add = (u, v, y, draw) => {
    const a = u - cam.u, b = v - cam.v;
    if (a < 0 || b < 0 || a >= VIEW_N || b >= VIEW_N) return;
    if (!rows.has(a + b)) rows.set(a + b, []);
    rows.get(a + b).push({ y, draw });
  };
  for (let b = cam.v; b < cam.v + VIEW_N; b++) for (let a = cam.u; a < cam.u + VIEW_N; a++) { // trees and rocks
    const f = featureAt(t, a, b);
    if (!f) continue;
    const autumn = seasonOf(world).name === 'AUTUMN' && AUTUMN_SPRITES[f], snowy = seasonOf(world).name === 'WINTER' && WINTER_SPRITES[f];
    const [x, y] = project(cam, a + 0.5, b + 0.5, groundAt(t, a + 0.5, b + 0.5)), sp = autumn || snowy || FEATURE_SPRITES[f];
    add(a, b, y, (s) => blit(s, sp, x - Math.floor(sp.w / 2), y - sp.h + 3, (a * 7 + b * 3) % 2 === 1));
  }
  for (const h of world.houses) {
    const [x, y] = project(cam, h.u + 0.5, h.v + 0.5, tileCorners(t, h.u, h.v)[0]);
    add(h.u, h.v, y, (s) => drawHouse(s, h, x, y, ms));
    const sp = SPRITES[h.tribe].house[h.level - 1];
    world.picks.push({ house: h, x0: x - sp.w / 2, x1: x + sp.w / 2, y0: y - sp.h + 3, y1: y + 3, y });
  }
  world.stones.forEach((line, tribe) => line.forEach((st, index) => {
    const [x, y] = project(cam, st.u + 0.5, st.v + 0.5, groundAt(t, st.u + 0.5, st.v + 0.5)), sp = STONE_SPRITES[tribe];
    add(st.u, st.v, y, (s) => blit(s, sp, x - Math.floor(sp.w / 2), y - sp.h + 3));
    world.picks.push({ stone: st, tribe, index, x0: x - sp.w / 2, x1: x + sp.w / 2, y0: y - sp.h + 3, y1: y + 3, y });
  }));
  for (const sh of world.sheep) {
    const [x, y] = project(cam, sh.x, sh.y, groundAt(t, sh.x, sh.y));
    const left = (sh.tx - sh.x) - (sh.ty - sh.y) < 0, sp = SHEEP_SPRITES[sh.graze > 0 ? 2 : Math.floor((world.tick + sh.id) / 8) % 2];
    add(Math.floor(sh.x), Math.floor(sh.y), y, (s) => blit(s, sp, x - Math.floor(sp.w / 2), y - sp.h + 2, left));
    world.picks.push({ sheep: sh, x0: x - 6, x1: x + 6, y0: y - 9, y1: y + 2, y });
  }
  for (const w of world.walkers) {
    const [x, y] = project(cam, w.x, w.y, groundAt(t, w.x, w.y));
    add(Math.floor(w.x), Math.floor(w.y), y, (s) => drawWalker(s, world, w, x, y));
    world.picks.push({ walker: w, x0: x - 5, x1: x + 5, y0: y - 12, y1: y + 2, y });
  }
  return rows;
}
function drawPeople(s, list) {
  if (!list) return;
  list.sort((a, b) => a.y - b.y);
  for (const p of list) p.draw(s);
}
function drawHouse(s, h, x, y, ms) {
  const sp = SPRITES[h.tribe].house[h.level - 1];
  blit(s, sp, x - Math.floor(sp.w / 2), y - sp.h + 3);
  if (h.level >= 3) for (let i = 0; i < 3; i++) { // smoke from the chimney, curling up and away
    const age = (ms / 1600 + i / 3 + h.id * 0.37) % 1, size = age < 0.3 ? 3 : age < 0.7 ? 2 : 1;
    fillRect(s, Math.round(x - 3 + age * 5 + Math.sin(age * 6 + h.id) * 1.5), Math.round(y - sp.h + 2 - age * 14), size, size, age < 0.5 ? C.grey : C.snow);
  }
  // a flag on a pole beside it, raised as the house fills up
  const px = x + Math.ceil(sp.w / 2), top = y - sp.h - 2, fill = h.pop / CAP[h.level - 1];
  line(s, [px, y + 1], [px, top], C.black);
  const fy = Math.round(y - 3 - fill * (y - 3 - top));
  fillRect(s, px + 1, fy, 4, 3, TRIBE_COLOURS[h.tribe].c);
}
function drawWalker(s, world, w, x, y) {
  const tick = world.tick;
  const sp = SPRITES[w.tribe].walker[Math.floor((tick + w.id * 3) / 6) % 2];
  const flip = (w.tu + 0.5 - w.x) - (w.tv + 0.5 - w.y) < 0; // face the way they walk
  blit(s, sp, x - Math.floor(sp.w / 2), y - sp.h + 1, flip);
  const arms = world.tribes[w.tribe].weapons;
  if (arms) { // a blade in hand, bronze, iron or steel
    const bx = Math.round(x) + (flip ? -4 : 4), by = Math.round(y) - sp.h + 3;
    line(s, [bx, by], [bx, by + 4], [C.sand, C.grey, C.snow][arms - 1]);
  }
  if (w.pilgrim) { // pilgrims carry a pennant in their god's colour
    const px = Math.round(x) + (flip ? 3 : -3), top = Math.round(y) - sp.h - 6;
    line(s, [px, top], [px, Math.round(y) - 2], C.black);
    fillRect(s, px + (flip ? -4 : 1), top, 4, 3, TRIBE_COLOURS[w.tribe].c);
  } else if (w.strength >= 10) fillRect(s, Math.round(x) - 1, Math.round(y) - sp.h - 2, 3, 3, C.gold); // a strong band carries a standard
}

// The cut faces along the front two edges of the view, like a slice of cake: earth above the sea, water below.
function drawSkirt(s, t, cam) {
  const DEPTH = 6;
  const face = (u0, v0, u1, v1, earth) => {
    const h0 = heightAt(t, u0, v0), h1 = heightAt(t, u1, v1);
    const top0 = project(cam, u0, v0, h0), top1 = project(cam, u1, v1, h1), sea0 = project(cam, u0, v0, 0), sea1 = project(cam, u1, v1, 0);
    const bot0 = [sea0[0], sea0[1] + DEPTH], bot1 = [sea1[0], sea1[1] + DEPTH];
    fillQuad(s, sea0, sea1, bot1, bot0, C.deep);
    if (h0 || h1) { fillQuad(s, top0, top1, sea1, sea0, earth); line(s, top0, top1, C.grassDark); }
  };
  for (let a = 0; a < VIEW_N; a++) {
    face(cam.u + a, cam.v + VIEW_N, cam.u + a + 1, cam.v + VIEW_N, C.rock);  // the front-left side
    face(cam.u + VIEW_N, cam.v + a, cam.u + VIEW_N, cam.v + a + 1, C.earth); // the front-right side
  }
}

function drawCursor(s, t, cam, corner, ms, armed, hoverTile) {
  if (!corner) return;
  const [x, y] = cornerPoint(t, cam, corner.u, corner.v), c = Math.floor(ms / 250) % 2 ? (armed ? C.red : C.gold) : C.snow;
  if (armed === 'stone' && hoverTile) { // the tile the stone would stand on
    const q = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([a, b]) => cornerPoint(t, cam, hoverTile.u + a, hoverTile.v + b));
    for (let i = 0; i < 4; i++) line(s, q[i], q[(i + 1) % 4], c);
    return;
  }
  const r = armed ? POWER[armed].reach : 0;
  if (r) { // the square of land the power will touch, drawn on the ground
    const at = (a, b) => { const cu = Math.max(0, Math.min(t.n, a)), cv = Math.max(0, Math.min(t.n, b)); return project(cam, cu, cv, heightAt(t, cu, cv)); };
    const ring = [];
    for (let i = -r; i < r; i++) ring.push([corner.u + i, corner.v - r]);
    for (let i = -r; i < r; i++) ring.push([corner.u + r, corner.v + i]);
    for (let i = r; i > -r; i--) ring.push([corner.u + i, corner.v + r]);
    for (let i = r; i > -r; i--) ring.push([corner.u - r, corner.v + i]);
    ring.forEach((p, i) => line(s, at(...p), at(...ring[(i + 1) % ring.length]), c));
  }
  line(s, [x - 5, y], [x, y - 3], c); line(s, [x, y - 3], [x + 5, y], c); line(s, [x + 5, y], [x, y + 3], c); line(s, [x, y + 3], [x - 5, y], c);
  plot(s, x, y, c);
}

// ---- the map book ----
function drawBook(s, game) {
  const t = game.terrain, cam = game.cam;
  fillRect(s, BOOK_X - 6, BOOK_Y - 4, 2 * MAP_N + 12, MAP_N + 8, C.earth);  // the cover
  fillRect(s, BOOK_X - 3, BOOK_Y - 2, 2 * MAP_N + 6, MAP_N + 4, C.snow);   // the pages
  fillRect(s, BOOK_X + MAP_N, BOOK_Y - 2, 1, MAP_N + 4, C.grey);           // the spine
  for (let py = 0; py < MAP_N; py++) for (let px = 0; px < 2 * MAP_N; px++) {
    const tile = bookTile(BOOK_X + px, BOOK_Y + py);
    if (!tile) continue;
    const k = tileCorners(t, tile.u, tile.v), lo = Math.min(...k), hi = Math.max(...k);
    const f = t.f[tile.v * t.n + tile.u];
    plot(s, BOOK_X + px, BOOK_Y + py, f === FEATURE.rock || f === FEATURE.ruin || f === FEATURE.fallenHead || f === FEATURE.fallenArch ? C.grey : f === FEATURE.mine ? C.black : f === FEATURE.swamp ? C.earth : f ? C.grassDark
      : hi === 0 ? C.sea : lo === 0 ? C.sand : hi >= MAX_H ? C.snow : hi >= 5 ? C.rock : hi >= 3 ? C.grass : C.grassLit);
  }
  for (const h of game.houses) { // each house a dot in its tribe's colour
    const [x, y] = bookPoint(h.u + 0.5, h.v + 0.5);
    fillRect(s, Math.floor(x) - 1, Math.floor(y), 2, 2, TRIBE_COLOURS[h.tribe].c);
  }
  const N = VIEW_N, q = [[0, 0], [N, 0], [N, N], [0, N]].map(([a, b]) => bookPoint(cam.u + a, cam.v + b));
  for (let i = 0; i < 4; i++) line(s, q[i], q[(i + 1) % 4], C.gold);
}

// ---- the frame and the panel: carved stone round the view, with tablets for the readouts ----
const PANEL_H = 78, STRIP_Y = LH - 12;   // the stone panel along the top; the strip along the bottom
const COL_A = 156, COL_B = 332, COL_W = 168; // the two readout tablets
// Stonework: dark earth laid in courses, with lighter mortar lines.
function stonework(s, x, y, w, h) {
  fillRect(s, x, y, w, h, C.earth);
  for (let j = y + 7; j < y + h; j += 8) fillRect(s, x, j, w, 1, C.rock);
  for (let j = y, row = 0; j < y + h; j += 8, row++) for (let i = x + (row % 2 ? 12 : 0); i < x + w; i += 24) fillRect(s, i, j, 1, Math.min(7, y + h - j), C.rock);
}
// A tablet: a black panel with a carved rim, lit along its top and left.
function tablet(s, x, y, w, h) {
  fillRect(s, x - 2, y - 2, w + 4, h + 4, C.black);
  fillRect(s, x - 1, y - 1, w + 2, 1, C.rockLit); fillRect(s, x - 1, y - 1, 1, h + 2, C.rockLit);
  fillRect(s, x - 1, y + h, w + 2, 1, C.rock); fillRect(s, x + w, y - 1, 1, h + 2, C.rock);
  fillRect(s, x, y, w, h, C.black);
}
function drawFrame(s) {
  stonework(s, 0, 0, LW, PANEL_H);
  stonework(s, 0, PANEL_H, 6, STRIP_Y - PANEL_H);
  stonework(s, LW - 6, PANEL_H, 6, STRIP_Y - PANEL_H);
  stonework(s, 0, STRIP_Y, LW, LH - STRIP_Y);
  fillRect(s, 6, PANEL_H, LW - 12, 1, C.black); fillRect(s, 6, STRIP_Y - 1, LW - 12, 1, C.black); // the view's edge
  for (const [x, y] of [[6, PANEL_H], [LW - 7, PANEL_H], [6, STRIP_Y - 1], [LW - 7, STRIP_Y - 1]]) { // gold studs at its corners
    fillRect(s, x - 2, y - 1, 5, 3, C.gold); fillRect(s, x - 1, y - 2, 3, 5, C.gold);
  }
}

// Little pictures for the seasons, 5 x 5 drawn at 2x, keyed by letter.
const SEASON_ICONS = {
  SPRING: ['.p.p.', 'ppypp', '.ppp.', '..g..', '.gg..'],
  SUMMER: ['y.y.y', '.yyy.', 'yyyyy', '.yyy.', 'y.y.y'],
  AUTUMN: ['...oo', '..ooo', '.ooo.', 'ooo..', 'b....'],
  WINTER: ['w.w.w', '.www.', 'ww.ww', '.www.', 'w.w.w'],
};
const ICON_KEY = { p: C.skin, y: C.gold, g: C.grass, o: C.rockLit, b: C.rock, w: C.snow };
function drawIcon(s, rows, x, y) { rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') fillRect(s, x + i * 2, y + j * 2 - 1, 2, 2, ICON_KEY[row[i]]); }); }

function drawPanel(s, game, hoverCost, beyond) {
  const manna = game.tribes[PLAYER].manna, houses = game.houses.filter((h) => h.tribe === PLAYER).length;
  // left tablet: manna, people, and the tug of war with the dark god
  tablet(s, COL_A - 4, 6, COL_W, 42);
  text(s, `MANNA ${Math.floor(manna)}`, COL_A, 9, C.gold);
  fillRect(s, COL_A, 18, COL_W - 8, 5, C.earth);
  fillRect(s, COL_A, 18, Math.min(COL_W - 8, Math.floor((manna * (COL_W - 8)) / 250)), 5, C.gold);
  text(s, `PEOPLE ${population(game, PLAYER)}   HOUSES ${houses}`, COL_A, 28, C.snow);
  const mine = population(game, PLAYER), theirs = population(game, RIVAL), bar = COL_W - 8, split = Math.round((bar * mine) / Math.max(1, mine + theirs));
  fillRect(s, COL_A, 38, split, 5, TRIBE_COLOURS[PLAYER].c);
  fillRect(s, COL_A + split, 38, bar - split, 5, TRIBE_COLOURS[RIVAL].c);
  fillRect(s, COL_A + bar / 2, 36, 1, 9, C.snow);
  // right tablet: the season and the time, the land, and each side's arms
  tablet(s, COL_B - 4, 6, COL_W, 42);
  const season = seasonOf(game), time = clock(game.over ? game.over.seconds : game.tick * DT);
  if (game.seasons) { drawIcon(s, SEASON_ICONS[season.name], COL_B, 9); text(s, season.name, COL_B + 14, 9, C.snow); }
  text(s, time, COL_B + COL_W - 8 - textWidth(time), 9, C.grey);
  const land = game.land === null || game.land === undefined ? 'FREE PLAY' : `${game.land + 1}: ${LANDS[game.land].name}`;
  text(s, land, COL_B, 19, C.gold);
  for (const [tribe, y, who] of [[PLAYER, 29, 'YOU'], [RIVAL, 38, 'DARK']]) {
    const tr = game.tribes[tribe];
    text(s, `${who} ${WEAPONS[tr.weapons]} ${tr.mines} ${tr.mines === 1 ? 'MINE' : 'MINES'}`, COL_B, y, TRIBE_COLOURS[tribe].c);
  }
  // the message tablet: news, or what the cursor is about to do
  tablet(s, COL_A - 4, 53, COL_B + COL_W - COL_A, 9);
  if (game.message) text(s, game.message, COL_A, 54, C.gold);
  else if (game.armed) {
    const p = POWER[game.armed], how = { flood: 'CLICK ANYWHERE', stone: 'CLICK TO RAISE, SHIFT-CLICK TO TAKE DOWN', call: 'CLICK WHERE THE LAST BATTLE IS' }[p.id] || 'CLICK THE LAND';
    text(s, `${p.name} (${p.cost}): ${how}`, COL_A, 54, C.red);
  } else if (beyond) text(s, 'BEYOND YOUR REACH: RAISE A STONE NEARER', COL_A, 54, C.grey);
  else if (hoverCost) text(s, `RAISE ${hoverCost.raise}   LOWER ${hoverCost.lower}`, COL_A, 54, C.snow);
  // the powers, each on its own little tablet: gold when you can afford it, red-rimmed when ready to cast
  for (const slot of powerSlots()) {
    tablet(s, slot.x, slot.y, slot.w, slot.h);
    if (slot.id === game.armed) { fillRect(s, slot.x - 1, slot.y - 1, slot.w + 2, 1, C.red); fillRect(s, slot.x - 1, slot.y + slot.h, slot.w + 2, 1, C.red); }
    const colour = !game.powers.has(slot.id) ? C.earth : manna >= POWER[slot.id].cost ? C.gold : C.grey; // dark: not earned in this land
    text(s, slot.label, slot.x + Math.round((slot.w - textWidth(slot.label)) / 2), slot.y + 1, colour);
  }
}
// Where each power's tablet sits in the panel (also where a click picks it).
function powerSlots() {
  const x0 = COL_A - 4, span = LW - 8 - x0, w = Math.floor(span / POWERS.length) - 3;
  return POWERS.map((p, i) => ({ id: p.id, label: `${p.key} ${p.name}`, x: x0 + i * (w + 3), y: 66, w, h: 9 }));
}
// A tip from the first land, in a gold-edged box above the bottom strip.
function drawTip(s, str) {
  const lines = wrapText(str, 60), w = Math.max(...lines.map(textWidth)) + 16, h = lines.length * 10 + 8;
  const x = Math.round(LW / 2 - w / 2), y = STRIP_Y - h - 6;
  fillRect(s, x - 2, y - 2, w + 4, h + 4, C.gold);
  fillRect(s, x, y, w, h, C.black);
  lines.forEach((l, i) => text(s, l, Math.round(LW / 2 - textWidth(l) / 2), y + 5 + i * 10, C.snow));
}
// The strip along the bottom: the keys to remember.
function drawStrip(s, music) {
  const keys = `H HELP   P PAUSE   M MUSIC ${music ? 'ON' : 'OFF'}`;
  text(s, keys, 10, STRIP_Y + 3, C.sand);
  const name = 'OLD STONES';
  text(s, name, LW - 10 - textWidth(name), STRIP_Y + 3, C.gold);
}

// A little star, gold when earned, dark when not.
const STAR = ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '##...##'];
function drawStar(s, x, y, earned) {
  STAR.forEach((row, j) => { for (let i = 0; i < 7; i++) if (row[i] === '#') plot(s, x + i, y + j, earned ? C.gold : C.earth); });
}
function drawStars(s, cx, y, n) { for (let i = 0; i < 3; i++) drawStar(s, cx - 13 + i * 9, y, i < n); }
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

// The end of a game: a card over the land.
function drawEnd(s, game) {
  if (!game.over) return;
  const won = game.over.winner === PLAYER, land = game.land, next = land !== null && land + 1 < LANDS.length ? LANDS[land + 1] : null;
  const title = won ? 'VICTORY' : 'DEFEAT';
  const lines = !won ? ['YOUR PEOPLE ARE GONE.', 'THE DARK GOD HAS THIS LAND.']
    : next ? ['THE DARK GOD IS DRIVEN OUT.', `ON TO ${next.name}.`]
    : land !== null ? ['THE DARK GOD IS NO MORE.', 'THE WORLD IS YOURS.'] : ['THE DARK GOD IS NO MORE.', 'YOUR PEOPLE HAVE THE LAND.'];
  const keys = !won ? 'R TRY AGAIN    ENTER TITLE SCREEN' : next ? 'ENTER ON TO THE NEXT LAND    R PLAY AGAIN' : 'ENTER TITLE SCREEN    R PLAY AGAIN';
  const timed = won && land !== null, w = Math.max(230, textWidth(keys) + 20), h = timed ? 104 : 78, x = Math.round(LW / 2 - w / 2), y = 140;
  fillRect(s, x - 2, y - 2, w + 4, h + 4, won ? TRIBE_COLOURS[PLAYER].c : C.red);
  fillRect(s, x, y, w, h, C.black);
  outlined(s, title, Math.round(LW / 2 - textWidth(title) / 2), y + 8, C.gold);
  lines.forEach((l, i) => outlined(s, l, Math.round(LW / 2 - textWidth(l) / 2), y + 26 + i * 11, C.snow));
  if (timed) { // the time it took, its stars, and whether it is the best yet
    const secs = game.over.seconds, t = `TIME ${clock(secs)}${game.over.newBest ? '  NEW BEST' : ''}`;
    outlined(s, t, Math.round(LW / 2 - textWidth(t) / 2), y + 52, game.over.newBest ? C.gold : C.snow);
    drawStars(s, LW / 2, y + 64, starsFor(land, secs));
  }
  outlined(s, keys, Math.round(LW / 2 - textWidth(keys) / 2), y + h - 16, C.grey);
}

// ---- ley lines: a dotted line in each god's colour from each stone to the next, and the gathering at each hearth ----
function drawLeyLines(s, game, ms) {
  const t = game.terrain, cam = game.cam;
  if (game.call) { // the Call of the Stones: a column of light where everyone is going
    const [x, y] = project(cam, game.call.u + 0.5, game.call.v + 0.5, groundAt(t, game.call.u + 0.5, game.call.v + 0.5));
    for (let k = 0; k < 70; k += 2) {
      const wob = Math.round(Math.sin(ms / 120 + k / 6) * 1.5);
      fillRect(s, Math.round(x) - 2 + wob, Math.round(y) - k, 4, 2, (k + Math.floor(ms / 80)) % 6 < 3 ? C.gold : C.snow);
    }
  }
  const at = (st) => project(cam, st.u + 0.5, st.v + 0.5, groundAt(t, st.u + 0.5, st.v + 0.5));
  game.stones.forEach((line, tribe) => {
    for (let i = 0; i + 1 < line.length; i++) {
      const [x0, y0] = at(line[i]), [x1, y1] = at(line[i + 1]), n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 5);
      for (let k = 0; k <= n; k++) { // beads of light running along the line, each with a dark rim so it shows on any ground
        if ((k + Math.floor(ms / 250)) % 3 === 0) continue;
        const bx = Math.round(x0 + ((x1 - x0) * k) / n) - 1, by = Math.round(y0 + ((y1 - y0) * k) / n) - 1;
        fillRect(s, bx - 1, by, 4, 2, C.black);
        fillRect(s, bx, by, 2, 1, TRIBE_COLOURS[tribe].c);
      }
    }
    if (!line.length) return;
    const g = game.walkers.find((w) => w.tribe === tribe && w.gathered), count = `${g ? g.strength : 0}/${PILGRIM_MASS}`;
    const [x, y] = at(line[0]), sp = STONE_SPRITES[tribe];
    if (line[0].u >= cam.u && line[0].v >= cam.v && line[0].u < cam.u + VIEW_N && line[0].v < cam.v + VIEW_N) {
      outlined(s, count, Math.round(x - textWidth(count) / 2), Math.round(y - sp.h - 8), TRIBE_COLOURS[tribe].c);
    }
  });
}

// ---- short-lived effects (made from the world's events by main.js): { kind, u, v, h, born } ----
const FX_LIFE = { splash: 700, dust: 600, lava: 10000 };
function drawEffects(s, game, fx, ms) {
  for (const e of fx) {
    const age = (ms - e.born) / FX_LIFE[e.kind];
    if (age < 0 || age >= 1) continue;
    const [x, y] = project(game.cam, e.u, e.v, e.h);
    if (e.kind === 'splash') { // a ring spreading on the water, and drops thrown up
      const r = 2 + age * 12;
      for (let i = 0; i < 10; i++) plot(s, x + Math.cos(i * 0.63) * r, y + Math.sin(i * 0.63) * r * 0.5, C.snow);
      for (const dx of [-2, 0, 2]) plot(s, x + dx * (1 + age * 2), y - Math.sin(age * Math.PI) * (8 - Math.abs(dx)), C.glint);
    } else if (e.kind === 'dust') { // a scuffle: puffs of dust, sparks at first
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + e.u, r = 2 + age * 9;
        fillRect(s, Math.round(x + Math.cos(a) * r), Math.round(y - 4 + Math.sin(a) * r * 0.6 - age * 4), age < 0.5 ? 3 : 2, age < 0.5 ? 3 : 2, i % 2 ? C.sand : C.grey);
      }
      if (age < 0.35) for (let i = 0; i < 4; i++) plot(s, x + Math.cos(i * 1.6 + ms / 40) * 4, y - 5 + Math.sin(i * 1.6 + ms / 40) * 3, C.gold);
    } else if (e.kind === 'lava') { // a glowing crater with lava trickling down, and smoke billowing up
      for (let i = 0; i < 26; i++) {
        const g = ((i * 73 + Math.floor(ms / 110)) * 2654435761) >>> 0, a = (g % 628) / 100, r = (g >> 10) % 6;
        plot(s, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.5, (g >> 5) % 3 ? C.red : C.gold);
      }
      for (const dir of [-1, 1]) for (let i = 0; i < 10; i++) { // two streams down the front slopes
        const flow = (i + ms / 160) % 10;
        plot(s, x + dir * flow * 1.6, y + flow * 1.1, flow < 5 ? C.gold : C.red);
      }
      for (let i = 0; i < 4; i++) {
        const rise = (ms / 1800 + i / 4) % 1, size = rise < 0.5 ? 4 : 3;
        fillRect(s, Math.round(x - 1 + Math.sin(rise * 5 + i) * 3), Math.round(y - 5 - rise * 26), size, size, rise < 0.3 ? C.earth : rise < 0.6 ? C.grey : C.snow);
      }
    }
  }
}

// The house or walker under the mouse (the one in front, if they overlap), or null.
function pickedThing(game) {
  if (!game.pointer || !game.picks) return null;
  const [px, py] = game.pointer;
  let best = null;
  for (const p of game.picks) if (px >= p.x0 && px <= p.x1 && py >= p.y0 && py <= p.y1 && (!best || p.y > best.y)) best = p;
  return best;
}
// The chance that a band of `mine` beats the rival thing of strength `theirs`, with both sides' weapons.
function oddsAgainst(game, mine, theirs, rivalTribe) {
  const a = mine * armsOf(game, PLAYER), b = theirs * armsOf(game, rivalTribe);
  return a / (a + b);
}
// A tag over what the mouse points at: what it is, how many, its weapons, and for the dark god's, your odds against it.
function drawInspect(s, game) {
  const p = pickedThing(game);
  if (!p) return;
  if (p.sheep) return drawTag(s, p, [p.sheep.graze > 0 ? 'A SHEEP. IT IS GRAZING.' : 'A SHEEP. IT IS GOING SOMEWHERE.'], C.snow);
  if (p.stone) {
    const line = game.stones[p.tribe], who = p.tribe === PLAYER ? 'YOUR' : 'DARK';
    const g = game.walkers.find((w) => w.tribe === p.tribe && w.gathered);
    const lines = p.index === 0 ? [`${who} HEARTH STONE`, `${g ? g.strength : 0}/${PILGRIM_MASS} GATHERED`, line.length < 2 ? 'NO PATH YET: RAISE ANOTHER' : `THEN ON TO ${line.length - 1} MORE`]
      : p.index === line.length - 1 ? [`${who} END STONE`, 'PILGRIMS FIGHT OR SETTLE HERE'] : [`${who} WAYSTONE ${p.index} OF ${line.length - 1}`];
    return drawTag(s, p, lines, TRIBE_COLOURS[p.tribe].c);
  }
  const thing = p.house || p.walker, tribe = thing.tribe, tr = game.tribes[tribe];
  const lines = [];
  if (p.house) lines.push(`${tribe === PLAYER ? 'YOUR' : 'DARK'} ${LEVEL_NAMES[thing.level - 1]} ${Math.floor(thing.pop)}/${CAP[thing.level - 1]}`);
  else lines.push(`${tribe === PLAYER ? 'YOUR' : 'DARK'} ${thing.pilgrim ? 'PILGRIMS' : thing.gathered ? 'GATHERING' : 'BAND'} OF ${thing.strength}`);
  lines.push(`${WEAPONS[tr.weapons]}${tr.weapons ? ` X${WEAPON_FACTOR[tr.weapons]}` : ''}`);
  if (tribe !== PLAYER) {
    const at = p.house ? { x: thing.u + 0.5, y: thing.v + 0.5 } : thing;
    let near = null, d = 9;
    for (const w of game.walkers) if (w.tribe === PLAYER && Math.hypot(w.x - at.x, w.y - at.y) < d) { near = w; d = Math.hypot(w.x - at.x, w.y - at.y); }
    const theirs = p.house ? Math.max(1, Math.floor(thing.pop)) : thing.strength;
    lines.push(near ? `YOUR ${near.strength}: ${Math.round(oddsAgainst(game, near.strength, theirs, tribe) * 100)}% TO WIN` : 'NO BAND OF YOURS NEAR');
  }
  drawTag(s, p, lines, TRIBE_COLOURS[tribe].c);
}
// A tag of a few lines above the thing pointed at, in a box edged with `edge`; a third line is in gold.
function drawTag(s, p, lines, edge) {
  const w = Math.max(...lines.map(textWidth)) + 8, h = lines.length * 9 + 5;
  const x = Math.round(Math.max(8, Math.min(LW - w - 8, (p.x0 + p.x1) / 2 - w / 2))), y = Math.round(Math.max(PANEL_H + 4, p.y0 - h - 3));
  fillRect(s, x - 1, y - 1, w + 2, h + 2, edge);
  fillRect(s, x, y, w, h, C.black);
  lines.forEach((l, i) => text(s, l, x + 4, y + 3 + i * 9, i === 2 ? C.gold : C.snow));
}

// ---- the title screen, drawn over a demo of two dark gods at war ----
const TITLE_LINES = ['SHAPE THE LAND. GROW YOUR PEOPLE.', "WIPE OUT THE DARK GOD'S PEOPLE TO WIN."];

// The help card (H, on the title screen or in play): headings, each followed by a paragraph wrapped to fit.
const HELP = [
  ["YOU ARE THE GOD OF THE BLUE PEOPLE.", "WIPE OUT THE DARK GOD'S PEOPLE TO WIN."],
  ['THE LAND', 'CLICK RAISES THE LAND, SHIFT-CLICK (OR RIGHT-CLICK) LOWERS IT. IT COSTS MANNA. YOUR PEOPLE SETTLE ON FLAT '
    + 'GROUND, AND THE MORE FLAT LAND A HOUSE HAS AROUND IT THE BIGGER IT GROWS: TENT, HUT, COTTAGE, HOUSE, CASTLE. BIG '
    + 'HOUSES EARN MORE MANNA. TREES AND BOULDERS BLOCK BUILDING. RAISING THE LAND BURIES THEM. LOWERING IT DIGS DOWN: '
    + 'TREES GO, BUT BOULDERS AND MINES STAY.'],
  ['MINES', 'A HUT OR BIGGER WITH A BOULDER IN ITS LAND DIGS A MINE. MORE MINES, BETTER WEAPONS.'],
  ['POWERS', 'PRESS THE KEY, THEN CLICK THE LAND. 1 SWAMP 30, 2 QUAKE 60, 3 VOLCANO 120, 4 FLOOD 250, 5 STONE 20, '
    + '6 CALL 500. THE CALL OF THE STONES EMPTIES EVERY HOUSE ON BOTH SIDES AND SENDS EVERYONE TO ONE PLACE FOR A LAST '
    + 'BATTLE. IT NEEDS THE LANDS JOINED. RAZED HOUSES AND FALLEN STONES LEAVE RUINS UNTIL THE LAND IS RESHAPED.'],
  ['STONES (5)', 'RAISE A LINE OF STONES. YOUR PEOPLE NEAR THE FIRST GATHER THERE. AT 20 THEY WALK THE LINE, AND FIGHT OR '
    + 'SETTLE AT ITS END. ENEMIES OR QUAKES TOPPLE STONES, AND IF THE FIRST FALLS, THE WHOLE LINE FALLS WITH IT.'],
  ["YOUR REACH", 'YOU CAN SHAPE THE LAND AND CAST POWERS ONLY WITHIN 5 SQUARES OF YOUR HOUSES AND STONES. LAND BEYOND IS '
    + 'SHOWN DIMMED. TO REACH ACROSS THE SEA, RAISE STONES ONE BEYOND ANOTHER. THE DARK GOD IS BOUND THE SAME WAY.'],
  ['THE CAMPAIGN', 'FIVE LANDS, EACH HARDER THAN THE LAST. WIN ONE TO REACH THE NEXT, AND EARN A NEW POWER AS YOU GO. '
    + 'POWERS NOT YET EARNED ARE SHOWN DARK. WIN QUICKLY FOR UP TO THREE STARS.'],
  ['LOOKING ABOUT', 'SWIPE, MOUSE WHEEL, ARROWS OR CLICK THE MAP BOOK. POINT AT THINGS TO INSPECT THEM. P PAUSES, M MUSIC, H HELP.'],
];
function wrapText(str, maxChars) {
  const out = [];
  let lineStr = '';
  for (const word of str.split(' ')) {
    if (lineStr && (lineStr + ' ' + word).length > maxChars) { out.push(lineStr); lineStr = word; } else lineStr = lineStr ? lineStr + ' ' + word : word;
  }
  if (lineStr) out.push(lineStr);
  return out;
}
function drawHelp(s) {
  const w = 492, x = Math.round(LW / 2 - w / 2), maxChars = Math.floor((w - 24) / 6);
  const lines = [];
  for (const [heading, body] of HELP) { lines.push({ str: heading, heading: true }); for (const l of wrapText(body, maxChars)) lines.push({ str: l }); }
  const h = 12 + lines.length * 11 + 14, y = Math.round(LH / 2 - h / 2);
  fillRect(s, x - 2, y - 2, w + 4, h + 4, C.earth);
  fillRect(s, x, y, w, h, C.black);
  lines.forEach((l, i) => text(s, l.str, x + (l.heading ? 8 : 14), y + 8 + i * 11, l.heading ? C.gold : C.snow));
  const close = 'H OR ESC TO CLOSE';
  text(s, close, Math.round(LW / 2 - textWidth(close) / 2), y + h - 12, C.grey);
}

function drawTitle(s, land, reached, best, ms) {
  const title = 'OLD STONES', scale = 5, tw = title.length * 6 * scale - scale, tx = Math.round(LW / 2 - tw / 2);
  bigText(s, title, tx + 3, 21, C.black, scale);
  bigText(s, title, tx + 2, 20, C.earth, scale);
  bigText(s, title, tx, 18, C.gold, scale);
  const sub = 'A GOD GAME';
  outlined(s, sub, Math.round(LW / 2 - textWidth(sub) / 2), 62, C.snow);
  const L = LANDS[land], lines = [
    { str: TITLE_LINES[0], c: C.snow }, { str: TITLE_LINES[1], c: C.snow }, { str: '', c: C.snow },
    { str: `LAND ${land + 1} OF ${LANDS.length}: ${L.name}`, c: C.gold }, { str: L.intro, c: C.snow },
  ];
  const bestSecs = best[land];
  lines.push({ str: bestSecs ? `BEST ${clock(bestSecs)}` : 'NOT WON YET', c: C.grey, stars: bestSecs ? starsFor(land, bestSecs) : 0 });
  if (reached > 0) lines.push({ str: `1 TO ${reached + 1}: PICK A LAND YOU HAVE REACHED`, c: C.grey });
  const w = 330, h = 18 + lines.length * 11 + 12, x = Math.round(LW / 2 - w / 2), y = 300 - h;
  fillRect(s, x - 2, y - 2, w + 4, h + 4, C.earth);
  fillRect(s, x, y, w, h, C.black);
  lines.forEach((l, i) => {
    const lx = Math.round(LW / 2 - (textWidth(l.str) + (l.stars ? 32 : 0)) / 2);
    text(s, l.str, lx, y + 8 + i * 11, l.c);
    if (l.stars) drawStars(s, lx + textWidth(l.str) + 19, y + 8 + i * 11, l.stars);
  });
  const help = 'H FOR HELP';
  text(s, help, Math.round(LW / 2 - textWidth(help) / 2), y + h - 12, C.grey);
  if (Math.floor(ms / 500) % 2 === 0) {
    const go = 'PRESS ENTER OR CLICK TO BEGIN';
    outlined(s, go, Math.round(LW / 2 - textWidth(go) / 2), y + h + 6, C.gold);
  }
}

// opts.hud false: just the land and its people (the title screen's backdrop).
function renderGame(s, game, ms, fx = [], opts = {}) {
  clearScreen(s, C.black);
  const real = game.cam;
  if (game.shake > 0) game.cam = { ...real, dx: Math.round(Math.sin(ms / 23) * 3), dy: Math.round(Math.cos(ms / 31) * 2) }; // the earth shakes
  drawLand(s, game, ms);
  drawSkirt(s, game.terrain, game.cam);
  drawLeyLines(s, game, ms);
  drawEffects(s, game, fx, ms);
  if (opts.hud === false) { game.cam = real; return; }
  const thing = pickedThing(game);
  if (!thing || game.armed) drawCursor(s, game.terrain, game.cam, game.hover, ms, game.armed, game.hoverTile);
  game.cam = real;
  drawFrame(s);
  drawBook(s, game);
  drawPanel(s, game, game.hover ? hoverCosts(game, game.hover) : null, game.hover && !cornerInReach(game, PLAYER, game.hover.u, game.hover.v));
  drawStrip(s, opts.music !== false);
  if (!game.armed) drawInspect(s, game);
  drawEnd(s, game);
}
// What raising and lowering the corner would cost ('-' when it can't be done).
function hoverCosts(game, corner) {
  if (!cornerInReach(game, PLAYER, corner.u, corner.v)) return null; // the panel says it is beyond reach
  const r = reshape(game.terrain, corner.u, corner.v, 1), l = reshape(game.terrain, corner.u, corner.v, -1);
  return { raise: r.ok ? costOf(r) : '-', lower: l.ok ? costOf(l) : '-' };
}
