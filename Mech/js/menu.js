'use strict';

// The menus: the title screen's two buttons, the free play select screen (a map and a win condition) and the campaign placeholder.
// Pure logic and layout like bay.js (no drawing, no DOM), so it can be tested; render.js draws it, main.js wires it.
// A button is { id, x, y, w, h, label, sub, state: 'normal' | 'selected' | 'disabled', tip, action }; bayButtonAt (bay.js) finds the
// one under a point, and a disabled button explains itself in its tip.

function newMenuSelection(scenarioId, goalId, size = 'small') {
  if (!MAP_THEMES.includes(scenarioId)) throw new BuildError('map', `Unknown map "${scenarioId}"`);
  if (!MAP_SIZES.includes(size)) throw new BuildError('size', `Unknown map size "${size}"`);
  if (!OBJECTIVES[goalId]) throw new BuildError('goal', `Unknown win condition "${goalId}"`);
  return { map: scenarioId, goal: goalId, size };
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
    const s = scenarioFor(id, sel.size);
    out.push({ id: 'map:' + id, x: 16 + i * 332, y: 84, w: 320, h: 270, label: s.name, sub: s.blurb, state: sel.map === id ? 'selected' : 'normal', tip: s.blurb, action: { type: 'map', id } });
  });
  OBJECTIVE_IDS.forEach((id, i) => {
    const o = OBJECTIVES[id];
    out.push({ id: 'goal:' + id, x: 16 + i * 250, y: 366, w: 242, h: 160, label: o.name, sub: o.blurb, state: !o.ready ? 'disabled' : sel.goal === id ? 'selected' : 'normal', tip: o.ready ? o.blurb : o.name + ' is not playable yet', action: { type: 'goal', id } });
  });
  MAP_SIZES.forEach((size, i) => out.push({ id: 'size:' + size, x: 760 + i * 124, y: 12, w: 120, h: 40, label: size.toUpperCase(), sub: size === 'small' ? '19 x 12' : '31 x 20', state: sel.size === size ? 'selected' : 'normal',
    tip: size === 'small' ? 'The small map (19 x 12) fits on the screen: quick battles' : 'The large map (31 x 20) is about 2.5 times the area and scrolls: room to manoeuvre, and the goals take longer', action: { type: 'size', size } }));
  out.push({ id: 'back', x: 16, y: 620, w: 140, h: 44, label: 'BACK', sub: '', state: 'normal', tip: 'Back to the title screen', action: { type: 'back' } });
  out.push({ id: 'continue', x: 818, y: 616, w: 190, h: 52, label: 'CONTINUE', sub: '', state: 'normal', tip: 'Build your squad for this map and goal (ENTER)', action: { type: 'continue' } });
  return out;
}

function campaignButtons() {
  return [{ id: 'back', x: 16, y: 620, w: 140, h: 44, label: 'BACK', sub: '', state: 'normal', tip: 'Back to the title screen', action: { type: 'back' } }];
}

// Applies a map or win condition card to the selection. A disabled card refuses with its reason, as in the bay. Returns a note.
function selectPress(sel, button) {
  if (button.state === 'disabled') return button.tip;
  const a = button.action;
  if (a.type === 'map') sel.map = newMenuSelection(a.id, sel.goal, sel.size).map;
  else if (a.type === 'goal') sel.goal = newMenuSelection(sel.map, a.id, sel.size).goal;
  else if (a.type === 'size') sel.size = newMenuSelection(sel.map, sel.goal, a.size).size;
  else throw new BuildError('action', `selectPress cannot apply a ${a.type} button`);
  return '';
}
