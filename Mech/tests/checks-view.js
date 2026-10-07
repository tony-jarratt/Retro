'use strict';

// Checks for the renderer's geometry and drawing. These need a canvas, so they only run in a browser
// (check.html), not in jsc. Loaded after checks-play.js.

function viewFor(state, activeId) {
  const sel = activeId ? mechById(state, activeId) : null;
  return {
    state, clock: 0, seed: 1, camera: null, debug: null,
    banner: { text: 'YOUR MOVE', colour: '#4fb3d9' }, status: 'test', help: ['help'], log: [], result: null,
    active: activeId || null, reach: sel ? { walk: reachableFor(state, sel.id, 'walk'), run: reachableFor(state, sel.id, 'run') } : null,
    hover: sel ? [sel.pos[0] + 1, sel.pos[1]] : null, hoverMech: null, finder: null, heatGhost: null, aim: [], weapon: null,
    pose: null, flash: new Map(), volley: null,
  };
}

const VIEW_SQUAD = [{ chassis: 3, armour: 2, sinks: 0, weapons: [2, 4, 6] }, { chassis: 2, armour: 1, sinks: 0, weapons: [2, 1, 0] }];

check('view: every hex converts to the screen and back to itself', () => {
  const map = makeMap(SCENARIO.name, SCENARIO.rows);
  buildMapCanvas(map);
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const [x, y] = hexToScreen(c, r);
      eq(screenToHex(map, x, y), [c, r], `centre of ${c},${r}`);
      eq(screenToHex(map, x + HEX_R * 0.5, y + HEX_R * 0.3), [c, r], `inside ${c},${r}`);
    }
  }
});

check('view: neighbouring hexes are drawn the right distance apart, and points off the map hit nothing', () => {
  const map = makeMap(SCENARIO.name, SCENARIO.rows);
  buildMapCanvas(map);
  for (const [c, r] of [[3, 3], [4, 3], [0, 0]]) {
    for (const n of neighbours(map, c, r)) {
      const a = hexToScreen(c, r), b = hexToScreen(n.c, n.r);
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      assert(Math.abs(d - Math.sqrt(3) * HEX_R) < 1e-6, `${c},${r} to ${n.c},${n.r} is ${d}`);
    }
  }
  eq(screenToHex(map, 0, 0), null);
  eq(screenToHex(map, VIEW_W - 5, VIEW_H - 5), null);
  eq(screenToHex(map, 900, 300), null, 'the unit panel');
});

check('view: the map fits the screen beside the unit panel and below the banner', () => {
  const map = makeMap(SCENARIO.name, SCENARIO.rows);
  buildMapCanvas(map);
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const [x, y] = hexToScreen(c, r);
      const halfHeight = HEX_R * Math.sqrt(3) / 2; // a flat-top hex is wider than it is tall
      assert(x - HEX_R >= 0 && x + HEX_R <= MAP_AREA_W, `hex ${c},${r} x=${x}`);
      assert(y - halfHeight >= MAP_TOP - 1 && y + halfHeight <= VIEW_H - 40, `hex ${c},${r} y=${y}`);
    }
  }
  assert(MAP_TOP >= 78, 'room above the map for the header, the banner and the instruction line');
  throwsKind(MapError, 'terrain', () => drawTerrainHex(makeCanvas(10, 10, () => {}).getContext('2d'), hexPathOn, '?', 0, 0, 5, 5, 5));
});

check('view: the move and fire screens draw in every state: range finder, heat ghost, aim lines, weapon callout', () => {
  const state = battleFor(VIEW_SQUAD, 'normal');
  buildMapCanvas(state.map);
  const g = makeCanvas(VIEW_W, VIEW_H, () => {}).getContext('2d');
  drawFrame(g, viewFor(state, null));
  // the move question with a range finder (several kinds of line) and a heat ghost
  const reach = reachableFor(state, 'P1', 'walk');
  const dest = [...reach.values()].find(n => n.cost > 0);
  const view = viewFor(state, 'P1');
  view.finder = { mechId: 'P1', mode: 'walk', path: pathTo(reach, dest.c, dest.r), lines: [{ t: 'WALK 2 HEXES', style: 'title' }, { t: 'movement 2 of 5', style: 'dim' }, { t: 'HEAT 0 -> 1', style: 'big' }, { t: 'heat 8: +1 to hit', style: 'warn' }, { t: 'x', style: 'text' }] };
  view.heatGhost = 3;
  drawFrame(g, view);
  view.finder = { mechId: 'P1', mode: 'stand', path: [], lines: [{ t: 'STAY PUT', style: 'title' }] };
  drawFrame(g, view);
  // the weapon question: the sides close enough that weapons have targets, with an aim line already drawn
  state.mechs[0].pos = [6, 4]; state.mechs[3].pos = [8, 4];
  const p = newFirePlanner(state, 'player');
  const q = plannerQuestion(p);
  assert(q && q.targets.length > 0, 'a weapon question');
  const v2 = viewFor(state, q.mechId);
  v2.weapon = { mechId: q.mechId, slot: q.slot, name: q.name, targetId: q.cursor, status: q.status, validIds: q.targets.map(t => t.targetId), lockText: 'LOCKED ON E1' };
  v2.aim = [{ mechId: 'P1', from: [6, 4], to: [8, 4], targetId: 'E1' }];
  v2.heatGhost = 4; v2.reach = null; v2.log = ['#YOUR FIRE', 'P1 BOLT>E1 CT -6', 'E1 DESTROYED', '#ENEMY FIRE', 'E2 BOLT>P1 MISS (4 vs 7+)'].concat(Array.from({ length: 12 }, (_, i) => 'filler line ' + i)); v2.logHeader = 'ROUND 3: COMBAT';
  v2.banner = { text: 'YOUR FIRE', colour: '#4fb3d9' };
  drawFrame(g, v2);
  // the enemy's turn: one of its mechs highlighted and walking (a pose), banner in red
  const v3 = viewFor(state, 'E1');
  v3.reach = null; v3.banner = { text: 'ENEMY MOVE', colour: '#ff5a4a' };
  v3.pose = mech => (mech.id === 'E1' ? { x: 500, y: 300, facing: 4 } : null);
  drawFrame(g, v3);
  // a mech that has chosen to self-destruct is marked, with its blast hexes; a weaponless mech's question has no weapon overlay
  const v4 = viewFor(state, 'P1');
  v4.destruct = ['P1', 'P2']; v4.weapon = null; v4.banner = { text: 'YOUR FIRE', colour: '#4fb3d9' };
  drawFrame(g, v4);
});

check('view: a volley, wrecks and the result screen all draw', () => {
  const state = battleFor(VIEW_SQUAD, 'normal');
  buildMapCanvas(state.map);
  const g = makeCanvas(VIEW_W, VIEW_H, () => {}).getContext('2d');
  const view = viewFor(state, null);
  view.camera = { zoom: 1.2, fx: 600, fy: 300, sx: 1, sy: -1 };
  view.volley = { local: 0.1, projectiles: ['laser', 'cannon', 'missile'].map(kind => ({ kind, t: 0, dur: 0.5, from: [300, 300], to: [500, 320], ctrl: [400, 200] })) };
  view.flash.set('E1', 1);
  view.banner = { text: 'ENEMY FIRE', colour: '#ff5a4a' };
  fxBoom(400, 300, 1, 0); fxFloat(400, 300, 'CT -6', 0);
  drawFrame(g, view);
  state.mechs[3].alive = false; state.mechs[3].shutdown = true;
  view.volley = null; view.camera = null;
  view.result = { outcome: 'VICTORY', lines: ['Fought for 3 rounds', 'Seed 1'] };
  drawFrame(g, view);
  view.result = { outcome: 'DEFEAT', lines: [] };
  drawFrame(g, view);
  fxReset();
});

check('view: a move range is outlined by its boundary edges only, and every edge faces away from the region', () => {
  const state = battleFor(VIEW_SQUAD, 'normal');
  buildMapCanvas(state.map);
  const start = [8, 5];
  const flower = new Map([[hexKey(...start), { c: start[0], r: start[1] }]]);
  for (const n of neighbours(state.map, start[0], start[1])) flower.set(hexKey(n.c, n.r), { c: n.c, r: n.r });
  eq(regionBoundaryEdges(flower).length, 18, 'a hex and its six neighbours: 18 outer edges, none shared between members');
  eq(regionBoundaryEdges(new Map([[hexKey(...start), { c: start[0], r: start[1] }]])).length, 6, 'one hex: all six edges');
  // for any real reach: the edge midpoints lie just outside the region (they face a hex that is not in it)
  const reach = reachableFor(state, 'P2', 'run');
  const edges = regionBoundaryEdges(reach);
  assert(edges.length > 6, 'a real range has a border');
  for (const [x0, y0, x1, y1] of edges) {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const inside = [...reach.values()].filter(n => { const [hx, hy] = hexToScreen(n.c, n.r); return Math.hypot(hx - mx, hy - my) < HEX_R * 0.9; }).length;
    eq(inside, 1, 'each border edge belongs to exactly one hex of the region (the one next to it is outside)');
  }
  const g = makeCanvas(VIEW_W, VIEW_H, () => {}).getContext('2d');
  drawRegionOutline(g, reach, '#fff', 3);
  drawRegionOutline(g, new Map([[hexKey(...start), { c: start[0], r: start[1] }]]), '#fff', 3); // nowhere to go: draws nothing
});

function opaquePixels(canvas) {
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++;
  return n;
}

check('view: each weight class has its own sprite for each side, and heavier classes are drawn bigger', () => {
  const counts = [];
  for (const cls of MECH_CLASSES) {
    for (const side of ['player', 'enemy']) {
      const sprite = MECH_SPRITES[cls][side];
      eq([sprite.width, sprite.height], [SPRITE_SIZE, SPRITE_SIZE]);
      assert(opaquePixels(sprite) > 100, `${cls} ${side} has something drawn`);
      assert(MECH_FLASH[cls][side] && MECH_WRECK[cls][side], `${cls} ${side} has flash and wreck versions`);
    }
    counts.push(opaquePixels(MECH_SPRITES[cls].player));
  }
  for (let i = 1; i < counts.length; i++) assert(counts[i] > counts[i - 1], `${MECH_CLASSES[i]} (${counts[i]} pixels) is bigger than ${MECH_CLASSES[i - 1]} (${counts[i - 1]})`);
  assert(new Set(MECH_CLASSES.map(c => MECH_SPRITES[c].player.toDataURL())).size === 4, 'four different pictures');
  assert(MECH_SPRITES.light.player.toDataURL() !== MECH_SPRITES.light.enemy.toDataURL(), 'the two sides are coloured differently');
  for (const cls of MECH_CLASSES) assert(CLASS_LOOK[cls].scale > 0 && CLASS_LOOK[cls].side > 0, 'a muzzle and scale entry for ' + cls);
});

check('view: every chassis draws with its class sprite, its guns sit wider on bigger mechs, and the panel names the class', () => {
  const g = makeCanvas(VIEW_W, VIEW_H, () => {}).getContext('2d');
  const state = battleFor(VIEW_SQUAD, 'normal');
  buildMapCanvas(state.map);
  const sides = new Set();
  for (const chassis of CHASSIS) {
    const spec = { chassis: chassis.id, armour: 1, sinks: 0, weapons: [0, 0, 0] };
    const mech = makeMech(spec, { id: 'P9', side: 'player', pos: [5, 5], facing: 2, toHit: 9 });
    eq(classOf(mech), chassis.cls);
    drawMechAt(g, mech, 300, 300, 2, 1, false);
    drawMechAt(g, mech, 300, 300, 2, 1, true);
    drawMechCard(g, mech, 806, 80, {});
    mech.alive = false; drawMechAt(g, mech, 300, 300, 2, 1, false);
    const wide = muzzlePoint(mech, 'RA'), centre = hexToScreen(5, 5);
    sides.add(`${chassis.cls}:${Math.round(Math.hypot(wide[0] - centre[0], wide[1] - centre[1]))}`);
  }
  const reach = { light: 0, medium: 0, heavy: 0, assault: 0 };
  for (const entry of sides) { const [cls, d] = entry.split(':'); reach[cls] = Number(d); }
  assert(reach.light < reach.medium && reach.medium < reach.heavy && reach.heavy < reach.assault, 'guns sit further out on bigger mechs: ' + JSON.stringify(reach));
});

check('view: mech health runs from 1 (new) down towards 0 as it is hit, in both damage models', () => {
  const pool = makeMech({ chassis: 3, armour: 2, sinks: 0, weapons: [2, 4, 6] }, { id: 'P1', side: 'player', pos: [0, 0], facing: 0, toHit: 9 });
  eq(mechHealth(pool), 1);
  pool.hp = Math.round(pool.maxHp / 2);
  assert(Math.abs(mechHealth(pool) - 0.5) < 0.05, 'half the pool: ' + mechHealth(pool));
  pool.hp = 0;
  eq(mechHealth(pool), 0);
  const loc = makeMech({ chassis: 3, armour: 2, sinks: 0, weapons: [2, 4, 6] }, { id: 'P2', side: 'player', pos: [0, 0], facing: 0, toHit: 9, model: 'locations' });
  eq(mechHealth(loc), 1);
  loc.armour.CT = 0;
  assert(mechHealth(loc) < 1 && mechHealth(loc) > 0.8, 'a little armour gone: ' + mechHealth(loc));
  for (const l of LOCATIONS) { loc.armour[l] = 0; loc.structure[l] = 0; }
  eq(mechHealth(loc), 0);
});

check('view: the card slot draws for both damage models, with knocked-out weapons marked and the enemy card', () => {
  const g = makeCanvas(VIEW_W, VIEW_H, () => {}).getContext('2d');
  buildMapCanvas(makeMap(SCENARIO.name, SCENARIO.rows));
  for (const model of ['pool', 'locations']) {
    const mech = makeMech({ chassis: 5, armour: 2, sinks: 0, weapons: [2, 4, 0] }, { id: 'P1', side: 'player', pos: [3, 3], facing: 2, toHit: 9, model });
    drawCardSlot(g, mech, { mechId: 'P1', slot: 0, heatGhost: 8 });
    mech.weapons[0].off = true; mech.hp = Math.round(mech.maxHp * 0.3);
    drawCardSlot(g, mech, { mechId: 'P1', slot: 1, heatGhost: null });
    drawCardSlot(g, mech, null);
    drawCardSlot(g, null, null); // nothing to show: the hint
    mech.side = 'enemy'; mech.alive = false;
    drawMechCard(g, mech, 806, 478, { current: true });
  }
});

check('view: a shot leaves a mech from the side its weapon is mounted on', () => {
  const state = battleFor([{ chassis: 3, armour: 2, sinks: 0, weapons: [2, 4, 6] }], 'normal');
  buildMapCanvas(state.map);
  const m = state.mechs[0]; // facing direction 2 (down-right)
  const right = muzzlePoint(m, 'RA'), left = muzzlePoint(m, 'LA'), centre = hexToScreen(m.pos[0], m.pos[1]);
  const a = dirAngle(m.facing) * Math.PI / 180, forward = [Math.cos(a), Math.sin(a)];
  const across = p => (p[0] - centre[0]) * -forward[1] + (p[1] - centre[1]) * forward[0]; // positive on the mech's right
  assert(across(right) > 10 && across(left) < -10, `right ${across(right)}, left ${across(left)}`);
  assert((right[0] - centre[0]) * forward[0] + (right[1] - centre[1]) * forward[1] > 10, 'out towards the front');
});

check('view: smoke draws over its hexes (both a fresh and a fading cloud) and the smoke callout reads as always landing', () => {
  const g = makeCanvas(VIEW_W, VIEW_H, () => {}).getContext('2d');
  const map = makeMap(SCENARIO.name, SCENARIO.rows);
  buildMapCanvas(map);
  drawSmoke(g, map, 0); // no smoke: nothing to draw, and no error
  addSmoke(map, smokeHexes(map, 5, 4), 2);
  addSmoke(map, smokeHexes(map, 9, 6), 1);
  drawSmoke(g, map, 1.5);
  const lines = weaponCalloutLines({ name: 'FOGGER', targetId: 'E1', status: { band: 'medium', dist: 5, need: 2, chance: 100, mods: [], smoke: true }, lockText: '' });
  assert(lines.some(l => l.t.includes('100%')) && !lines.some(l => l.t.includes('NEED')), 'smoke shows 100% and no need number');
  assert(lines.some(l => l.t.includes('blocks lasers')), 'says what it does');
});

check('view: the howitzer shows its splash hexes while aiming, and its callout warns that friends are hit too', () => {
  const g = makeCanvas(VIEW_W, VIEW_H, () => {}).getContext('2d');
  const state = battleFor(VIEW_SQUAD, 'normal');
  buildMapCanvas(state.map);
  state.mechs[0].pos = [6, 4]; state.mechs[3].pos = [12, 4];
  const view = viewFor(state, 'P1');
  view.weapon = { mechId: 'P1', slot: 0, name: 'HOWITZER', splash: 6, targetId: 'E1', status: { band: 'long', dist: 6, need: 8, chance: 30, mods: [{ name: 'base to-hit', value: 9 }], valid: true }, validIds: ['E1'], lockText: '' };
  drawFrame(g, view);
  const lines = weaponCalloutLines(view.weapon);
  assert(lines.some(l => l.t.includes('splash 6')) && lines.some(l => l.t.includes('friends')), 'the warning');
});

check('view: the title card draws with and without a picture, and the picture covers the screen', () => {
  const c = document.createElement('canvas'); c.width = VIEW_W; c.height = VIEW_H;
  const g = c.getContext('2d');
  drawTitleCard(g, 0, null);
  const picture = document.createElement('canvas'); picture.width = 300; picture.height = 100; // a wrong shape on purpose
  const pg = picture.getContext('2d'); pg.fillStyle = '#ff0000'; pg.fillRect(0, 0, 300, 100);
  drawTitleCard(g, 0, picture);
  const corner = g.getImageData(2, VIEW_H - 3, 1, 1).data;
  assert(corner[0] > 20, 'the picture reaches the corner of the screen, not a letterbox (red channel ' + corner[0] + ')');
});

check('view: every map builds, fits the screen and draws every terrain, and the menu screens draw', () => {
  for (const id of SCENARIO_IDS) {
    const s = SCENARIOS[id], map = makeMap(s.name, s.rows);
    buildMapCanvas(map); // throws MapError('layout') if it does not fit
    const state = battleFor(SUGGESTED_SQUADS[0].mechs, 'normal', 'player', 'pool', s);
    const c = document.createElement('canvas'); c.width = VIEW_W; c.height = VIEW_H;
    drawFrame(c.getContext('2d'), viewFor(state, 'P1'));
  }
  const c = document.createElement('canvas'); c.width = VIEW_W; c.height = VIEW_H;
  const g = c.getContext('2d');
  drawTitleCard(g, 1, null, titleButtons(0), 'story');
  drawSelect(g, { buttons: selectButtons(newMenuSelection('urban', 'annihilation')), hover: 'goal:flag', status: 'x', statusBad: true });
  drawCampaign(g, { buttons: campaignButtons(), hover: 'back' });
  const bay = newBay(BAY_SQUAD, 'normal');
  bay.scenarioId = 'mountains';
  drawBay(g, { bay, report: bayReport(bay), buttons: bayButtons(bay), hover: 'change', status: '', statusBad: false });
});
