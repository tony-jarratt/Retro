'use strict';

// Turns the events of a fire phase into a timeline the screen can play shot by shot, and applies the damage
// to a copy of the state as each shot lands (so the health bars drop when the shell does, not before).
// The rules resolve the whole volley at once; this is only how it is shown. No drawing and no DOM.

const VOLLEY_GAP = 0.16;          // seconds between the starts of two shots
const VOLLEY_MAX_SPAN = 2.8;      // but the starts never spread over more than this
const VOLLEY_SETTLE = 0.9;        // seconds to let the last explosion play out
const SHOT_FLIGHT = { laser: 0.12, cannon: 0.35, missile: 0.8, smoke: 0.8, blast: 0.5, howitzer: 1.1 }; // launch to impact, by weapon kind
const MISSILE_STAGGER = 0.07;     // seconds between the missiles of one pod
const VOLLEY_ORDER_GAP = 0.01;    // hits on one target keep the rules' order, at least this far apart

// Returns { shots, duration }. Each shot: { mechId, slot, weaponId, kind, targetId, hit, roll, need, t0, flight,
// packets: [{ t, order (the hit's place in the rules' order), hit: the hit event, extras: [destroyed / killed
// events that came with it] }], missTime }.
// Shots start in "first weapons of every mech, then second weapons..." order, so it reads as simultaneous.
function buildVolley(events) {
  const shots = [];
  let current = null, lastPacket = null, order = 0;
  for (const e of events) {
    if (e.type === 'shot') {
      current = {
        mechId: e.mechId, slot: e.slot, weaponId: e.weaponId, kind: e.destruct ? 'blast' : weaponById(e.weaponId).kind,
        targetId: e.targetId, hit: e.hit, roll: e.roll, need: e.need, packets: [],
      };
      shots.push(current);
      lastPacket = null;
    } else if (e.type === 'hit') {
      if (!current) throw new RulesError('volley', 'A hit event came before any shot event');
      lastPacket = { t: 0, order: order++, hit: e, extras: [] };
      current.packets.push(lastPacket);
    } else if (e.type === 'jam') { // a fumble: the weapon jams, shown when the miss is
      if (!current) throw new RulesError('volley', 'A jam event came before any shot event');
      current.jam = e;
    } else if (e.type === 'blast') { // the self-destruct's blast hexes (the hits on each mech follow as packets)
      if (!current) throw new RulesError('volley', 'A blast event came before any shot event');
      current.hexes = e.hexes;
    } else if (e.type === 'smoke') { // the smoke rocket lands: one packet, with the smoke event in place of a hit
      if (!current) throw new RulesError('volley', 'A smoke event came before any shot event');
      lastPacket = { t: 0, order: order++, hit: e, extras: [] };
      current.packets.push(lastPacket);
    } else if (e.type === 'destroyed' || e.type === 'killed' || e.type === 'critical') {
      if (!lastPacket) throw new RulesError('volley', `A ${e.type} event for ${e.mechId} came before any hit event`);
      lastPacket.extras.push(e);
    }
  }
  shots.sort((a, b) => a.slot - b.slot || (a.mechId < b.mechId ? -1 : a.mechId > b.mechId ? 1 : 0));
  const gap = Math.min(VOLLEY_GAP, VOLLEY_MAX_SPAN / Math.max(1, shots.length));
  shots.forEach((shot, i) => {
    shot.t0 = i * gap;
    shot.flight = SHOT_FLIGHT[shot.kind];
    // a missile pod or a laser array lands its missiles or beams one after another
    const salvo = shot.weaponId !== 0 && !!weaponById(shot.weaponId).missiles;
    shot.packets.forEach((packet, k) => { packet.t = shot.t0 + shot.flight + (salvo ? k * MISSILE_STAGGER : 0); });
    shot.missTime = shot.t0 + shot.flight;
  });

  // The rules worked out each hit's damage in their own order (by mech id, then weapon slot), and each hit's
  // steps assume the hits before it on the same target have been applied. So the hits on one target must land
  // in that order here too, however the shots were staggered: a later one is held back just behind the earlier.
  const lastOnTarget = new Map();
  const packets = [];
  for (const shot of shots) for (const packet of shot.packets) packets.push(packet);
  packets.sort((a, b) => a.order - b.order);
  for (const packet of packets) {
    const id = packet.hit.targetId, before = lastOnTarget.get(id);
    if (before !== undefined && packet.t <= before) packet.t = before + VOLLEY_ORDER_GAP;
    lastOnTarget.set(id, packet.t);
  }

  let end = 0;
  for (const shot of shots) {
    for (const packet of shot.packets) end = Math.max(end, packet.t);
    if (!shot.hit) end = Math.max(end, shot.missTime);
  }
  return { shots, duration: shots.length ? end + VOLLEY_SETTLE : 0 };
}

// Applies one damage event (hit, cookoff, destroyed or killed) to a state, the way the rules did. Used on a copy
// of the state taken before the phase, so the picture matches the shots as they land. Throws if the numbers
// would go negative, which would mean the picture has drifted from the rules.
function applyDamageEvent(state, e) {
  if (e.type === 'smoke') { addSmoke(state.map, e.hexes, e.rounds); return; }
  if (e.type === 'hit' || e.type === 'cookoff') {
    const mech = mechById(state, e.type === 'hit' ? e.targetId : e.mechId);
    if (e.heat) mech.heat += e.heat; // rockets heat their target
    for (const step of e.steps) {
      if (step.pool) { // the pool model: one number
        mech.hp -= step.amount;
        if (mech.hp < 0) throw new RulesError('volley-drift', `Showing ${e.type} on ${mech.id} took its armour points below zero`);
        continue;
      }
      const pool = step.rear ? mech.rear : mech.armour;
      pool[step.loc] -= step.armour;
      mech.structure[step.loc] -= step.structure;
      if (pool[step.loc] < 0 || mech.structure[step.loc] < 0) {
        throw new RulesError('volley-drift', `Showing ${e.type} on ${mech.id} ${step.loc} took armour or structure below zero`);
      }
      if (e.type === 'hit' && !step.rear && mech.armour[step.loc] === 0) mech.stripped[step.loc] = true; // as the rules do
    }
  } else if (e.type === 'destroyed') {
    const mech = mechById(state, e.mechId);
    mech.destroyed[e.loc] = true;
    mech.structure[e.loc] = 0; mech.armour[e.loc] = 0; mech.rear[e.loc] = 0;
  } else if (e.type === 'killed') {
    mechById(state, e.mechId).alive = false;
  } else if (e.type === 'jam') {
    mechById(state, e.mechId).weapons[e.slot].jam = e.rounds;
  } else if (e.type === 'critical') {
    const weapon = mechById(state, e.mechId).weapons[e.slot];
    if (weapon.off) throw new RulesError('volley-drift', `Showing a critical on ${e.mechId} slot ${e.slot}, which was already knocked out`);
    weapon.off = true;
  }
}

function isDamageEvent(e) { return e.type === 'hit' || e.type === 'cookoff' || e.type === 'destroyed' || e.type === 'killed' || e.type === 'critical' || e.type === 'smoke'; }

// The dice of one shot in plain words, so a miss can be told from bad luck from a bad position: the d20 rolled against
// the number needed. `shot` is a volley shot (it carries roll and need); `result` is what happened ('miss', '-6', ...).
// A natural 1 always misses and jams the weapon, a 20 always hits and is a critical, which the numbers alone would not show.
function describeRoll(shot) { // short: it has to fit the readout panel
  if (shot.roll === 1) return '1 = JAM';
  if (shot.roll === 20) return '20 = CRIT';
  return `${shot.roll} vs ${shot.need}+`;
}

function describeShot(shot, result) {
  return `${shot.mechId} ${weaponById(shot.weaponId).name}>${shot.targetId} ${result} (${describeRoll(shot)})`;
}
