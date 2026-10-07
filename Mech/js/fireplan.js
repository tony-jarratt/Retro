'use strict';

// The model behind the player's fire phase: one question for each weapon that can fire, "which target?", asked
// mech by mech, weapon by weapon. When the last weapon is answered the side fires as one volley; there is no
// summary to confirm. No drawing and no DOM, so it is tested like the rules.
//
// A planner is a plain object (so it can be copied for Back):
//   mechIds   the living mechs on the side, in id order
//   items     one entry for every weapon that can fire and has a valid target:
//             { mechId, slot, weaponId, name, targets (validTargets, nearest first), def (defaultTarget) }
//   skipped   the weapons that can fire but have nothing in range or in view: { mechId, slot, name }
//   index     the question being asked (items.length means every weapon has been answered)
//   choices   per item: false = not answered yet, null = skipped, or a target id (false rather than undefined,
//             because Back copies the planner as JSON, which turns undefined into null, meaning "skipped")
//   cursor    the target under the cursor, or null to mean "the saved choice, else the suggestion"
//   destruct  mechId -> true for a mech that will self-destruct (it fires nothing else)
//   history   snapshots for Back

function newFirePlanner(state, side) {
  const items = [], skipped = [];
  const mechIds = livingMechs(state, side).map(m => m.id);
  for (const id of mechIds) {
    const mech = mechById(state, id);
    // a mech with no weapon that can fire gets one question of its own, so it can still choose to self-destruct
    if (!mech.shutdown && eligibleWeapons(state, id).length === 0) {
      items.push({ mechId: id, slot: -1, weaponId: 0, name: mech.weapons.some(w => w.jam > 0) ? 'WEAPONS JAMMED' : 'NO WEAPONS', targets: [], idle: true, def: { targetId: null, reason: 'none', lockLost: null } });
      continue;
    }
    for (const slot of eligibleWeapons(state, id)) {
      const weapon = weaponById(mech.weapons[slot].id);
      const targets = validTargets(state, id, slot);
      if (!targets.length) { skipped.push({ mechId: id, slot, name: weapon.name }); continue; }
      items.push({ mechId: id, slot, weaponId: weapon.id, name: weapon.name, targets, def: defaultTarget(state, id, slot) });
    }
  }
  return { side, mechIds, items, skipped, index: 0, choices: items.map(() => false), cursor: null, destruct: {}, history: [] };
}

function plannerDone(p) { return p.index >= p.items.length; }

// What is being asked now, or null when every weapon has been answered:
//   { mechId, slot, weaponId, name, targets, idle (a mech with no weapon to ask about), suggestion ({ targetId, reason,
//     lockLost } from defaultTarget), cursor (a target id), status (the cursor's targetStatus) }
function plannerQuestion(p) {
  if (plannerDone(p)) return null;
  const item = p.items[p.index];
  const saved = p.choices[p.index];
  const cursor = p.cursor !== null ? p.cursor : typeof saved === 'string' ? saved : item.def.targetId;
  return {
    mechId: item.mechId, slot: item.slot, weaponId: item.weaponId, name: item.name, targets: item.targets, idle: !!item.idle, suggestion: item.def,
    cursor, status: item.targets.find(t => t.targetId === cursor),
  };
}

function plannerSnapshot(p) { return JSON.stringify({ index: p.index, choices: p.choices, cursor: p.cursor, destruct: p.destruct }); }

function plannerAnswer(p, value) {
  p.history.push(plannerSnapshot(p));
  p.choices[p.index] = value;
  p.index += 1;
  p.cursor = null;
}

// Lock the current weapon onto a target. Returns false (and changes nothing) if that is not a valid target for it.
function plannerLock(p, targetId) {
  const q = plannerQuestion(p);
  if (!q) throw new PlanError('planner-done', 'There is no weapon left to aim');
  if (!q.targets.some(t => t.targetId === targetId)) return false;
  plannerAnswer(p, targetId);
  return true;
}

// Lock onto whatever the cursor is on (the suggestion, unless the cursor was moved).
function plannerAccept(p) {
  const q = plannerQuestion(p);
  if (!q) throw new PlanError('planner-done', 'There is no weapon left to aim');
  plannerLock(p, q.cursor);
}

function plannerSkip(p) {
  if (plannerDone(p)) throw new PlanError('planner-done', 'There is no weapon left to skip');
  plannerAnswer(p, null);
}

// The mech being asked about self-destructs instead of firing: everything it had locked is dropped, its other weapons are
// not asked about, and the next question is the next mech's. Back undoes it.
function plannerDestruct(p) {
  const q = plannerQuestion(p);
  if (!q) throw new PlanError('planner-done', 'There is no mech left to ask');
  p.history.push(plannerSnapshot(p));
  p.destruct[q.mechId] = true;
  let last = p.index;
  p.items.forEach((item, i) => { if (item.mechId === q.mechId) { p.choices[i] = null; last = Math.max(last, i); } });
  p.index = last + 1;
  p.cursor = null;
}

// Move the cursor to the next (dir 1) or previous (dir -1) valid target, wrapping round.
function plannerCycle(p, dir) {
  const q = plannerQuestion(p);
  if (!q) return;
  const ids = q.targets.map(t => t.targetId);
  const at = Math.max(0, ids.indexOf(q.cursor));
  p.cursor = ids[(at + dir + ids.length) % ids.length];
}

// Put the cursor on a particular target (a mouse hover). Returns false if it is not a valid target for this weapon.
function plannerSetCursor(p, targetId) {
  const q = plannerQuestion(p);
  if (!q || !q.targets.some(t => t.targetId === targetId)) return false;
  p.cursor = targetId;
  return true;
}

// Undo the last answer. Returns false if there is nothing to undo.
function plannerBack(p) {
  if (!p.history.length) return false;
  Object.assign(p, JSON.parse(p.history.pop()));
  return true;
}

// The shots to put in the fire plan: every answered weapon that was not skipped, and a self-destruct for each mech that chose it.
function plannerShots(p) {
  const shots = [];
  p.items.forEach((item, i) => {
    if (typeof p.choices[i] === 'string') shots.push({ mechId: item.mechId, weaponSlot: item.slot, targetId: p.choices[i] });
  });
  for (const id of p.mechIds) if (p.destruct[id]) shots.push({ mechId: id, destruct: true });
  return shots;
}

// Heat the mech will have after firing what is locked so far, plus `extra` (the weapon being asked about).
function plannerHeat(p, state, mechId, extra = 0) {
  const mech = mechById(state, mechId);
  let heat = mech.heat + extra;
  p.items.forEach((item, i) => {
    if (item.mechId === mechId && typeof p.choices[i] === 'string') heat += weaponById(item.weaponId).heat;
  });
  return Math.min(HEAT_MAX, heat);
}

// The aim lines of the weapons locked so far: { mechId, slot, from, to, targetId } in hex coordinates.
function plannerAimLines(p, state) {
  const lines = [];
  p.items.forEach((item, i) => {
    if (typeof p.choices[i] !== 'string') return;
    lines.push({ mechId: item.mechId, slot: item.slot, from: mechById(state, item.mechId).pos, to: mechById(state, p.choices[i]).pos, targetId: p.choices[i] });
  });
  return lines;
}
