'use strict';

// The menus: the title screen's two buttons and the free play select screen (a map and a win condition). The story's screens are in campaign.js.
// Pure logic and layout like bay.js (no drawing, no DOM), so it can be tested; render.js draws it, main.js wires it.
// A button is { id, x, y, w, h, label, sub, state: 'normal' | 'selected' | 'disabled', tip, action }; bayButtonAt (bay.js) finds the
// one under a point, and a disabled button explains itself in its tip.

function newMenuSelection(scenarioId, goalId, size = 'small', features = false, infantry = false) {
  if (!MAP_THEMES.includes(scenarioId)) throw new BuildError('map', `Unknown map "${scenarioId}"`);
  if (!MAP_SIZES.includes(size)) throw new BuildError('size', `Unknown map size "${size}"`);
  if (!OBJECTIVES[goalId]) throw new BuildError('goal', `Unknown win condition "${goalId}"`);
  if (!goalAllowsSize(goalId, size)) throw new BuildError('size-goal', `${OBJECTIVES[goalId].name} needs a large map; the small maps are for LAST MECH STANDING`);
  return { map: scenarioId, goal: goalId, size, features, infantry };
}

// The title screen: FREE PLAY and STORY, side by side under the title. `focus` (0 or 1) is the one ENTER would press.
function titleButtons(focus) {
  const x0 = 147, y = 455;
  return [
    { id: 'play', x: x0, y, w: 190, h: 50, label: 'FREE PLAY', sub: 'pick a map and a goal', state: focus === 0 ? 'selected' : 'normal', tip: 'Choose a map and a win condition, build your squad and fight', action: { type: 'play' } },
    { id: 'story', x: x0 + 206, y, w: 190, h: 50, label: 'STORY', sub: 'the campaign', state: focus === 1 ? 'selected' : 'normal', tip: 'The story campaign', action: { type: 'story' } },
  ];
}

// The select screen: one card per map, one per win condition, then BACK and CONTINUE. A win condition the game cannot play yet is
// greyed with the reason.
function selectButtons(sel) {
  const out = [];
  MAP_THEMES.forEach((id, i) => {
    const s = scenarioFor(id, sel.size, sel.features);
    out.push({ id: 'map:' + id, x: 16 + i * 332, y: 84, w: 320, h: 270, label: s.name, sub: s.blurb, state: sel.map === id ? 'selected' : 'normal', tip: s.blurb, action: { type: 'map', id } });
  });
  OBJECTIVE_IDS.forEach((id, i) => {
    const o = OBJECTIVES[id];
    out.push({ id: 'goal:' + id, x: 16 + i * 250, y: 366, w: 242, h: 160, label: o.name, sub: o.blurb, state: !o.ready ? 'disabled' : sel.goal === id ? 'selected' : 'normal', tip: o.ready ? o.blurb : o.name + ' is not playable yet', action: { type: 'goal', id } });
  });
  MAP_SIZES.forEach((size, i) => out.push({ id: 'size:' + size, x: 760 + i * 124, y: 12, w: 120, h: 40, label: size.toUpperCase(), sub: size === 'small' ? '19 x 12' : '31 x 20', state: !goalAllowsSize(sel.goal, size) ? 'disabled' : sel.size === size ? 'selected' : 'normal',
    tip: !goalAllowsSize(sel.goal, size) ? `The small maps are only for LAST MECH STANDING: ${OBJECTIVES[sel.goal].name} needs the room of a large map` : size === 'small' ? 'The small map (19 x 12) fits on the screen: quick battles (last mech standing only)' : 'The large map (31 x 20) is about 2.5 times the area and scrolls: room to manoeuvre, and the goals take longer', action: { type: 'size', size } }));
  out.push({ id: 'infantry', x: 248, y: 12, w: 196, h: 40, label: sel.infantry ? 'INFANTRY: ON' : 'INFANTRY: OFF', sub: 'two squads a side', state: sel.infantry ? 'selected' : 'normal',
    tip: sel.infantry ? 'Two infantry squads a side, moved by the computer: they spot for the mechs and fight each other. Click to play without them' : 'Click to add two infantry squads a side. The computer moves them, yours too: they spot for your mechs (-1 to hit) and fight only each other', action: { type: 'infantry' } });
  out.push({ id: 'features', x: 452, y: 12, w: 196, h: 40, label: sel.features ? 'FEATURES: ON' : 'FEATURES: OFF', sub: 'bays, caches, sensor', state: sel.features ? 'selected' : 'normal',
    tip: sel.features ? 'Repair bays, ammo caches and a sensor tower are on the maps. Click to play the bare maps' : 'Click to put a repair bay and an ammo cache on each side and a sensor tower (-1 to hit for whoever holds it) in the middle', action: { type: 'features' } });
  out.push({ id: 'back', x: 16, y: 620, w: 140, h: 44, label: 'BACK', sub: '', state: 'normal', tip: 'Back to the title screen', action: { type: 'back' } });
  out.push({ id: 'continue', x: 818, y: 616, w: 190, h: 52, label: 'CONTINUE', sub: '', state: 'normal', tip: 'Build your squad for this map and goal (ENTER)', action: { type: 'continue' } });
  return out;
}

// Applies a map or win condition card to the selection. A disabled card refuses with its reason, as in the bay. Returns a note.
function selectPress(sel, button) {
  if (button.state === 'disabled') return button.tip;
  const a = button.action;
  if (a.type === 'map') sel.map = newMenuSelection(a.id, sel.goal, sel.size).map;
  else if (a.type === 'goal') { // a goal that needs a large map takes the selection to LARGE, and says so
    const size = goalAllowsSize(a.id, sel.size) ? sel.size : 'large';
    const moved = size !== sel.size;
    sel.goal = newMenuSelection(sel.map, a.id, size).goal; sel.size = size;
    return moved ? `${OBJECTIVES[a.id].name} needs room, so the map is now LARGE.` : '';
  }
  else if (a.type === 'size') sel.size = newMenuSelection(sel.map, sel.goal, a.size).size;
  else if (a.type === 'features') sel.features = !sel.features;
  else if (a.type === 'infantry') sel.infantry = !sel.infantry;
  else throw new BuildError('action', `selectPress cannot apply a ${a.type} button`);
  return '';
}
