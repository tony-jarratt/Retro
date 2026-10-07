// Roadside scenery: objects attached to track segments (seg.sprites). This file decides where
// they go; scenery-art.js draws their pixel art and topdown.js places and collides with them. x is the sideways offset in road half-widths
// (1 = the road edge).

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ranges: [{ name, start, end, flags }] for each track section, from buildTrack(). track.style says what
// kind of place it is: walls ('corners' = barriers on the outside of fast corners, 'street' = walls both
// sides all the way round), nature (how many trees, bushes and rocks), ponds, and buildings.
function buildScenery(ranges, track) {
  const style = track.style;
  const rand = mulberry32(1948);   // fixed seed, so the scenery is the same every race
  for (const seg of segments) seg.sprites = [];
  const add = (n, type, x) => segments[n % segments.length].sprites.push({ type, x, seed: Math.floor(rand() * 1000) });

  // Keep trees away from sections that have stands, buildings or garages on that side.
  const noTrees = { '-1': new Set(), '1': new Set() };
  const water = { '-1': new Set(), '1': new Set() };   // where the harbour is
  for (const r of ranges) {
    const sides = [...(r.flags.stands || [])];
    if (r.flags.wing) sides.push(r.flags.wing);
    if (r.flags.garages) sides.push(r.flags.garages);
    for (const side of sides) for (let n = r.start; n < r.end; n++) noTrees[side].add(n);
    if (r.flags.harbour) for (let n = r.start; n < r.end; n++) { noTrees[r.flags.harbour].add(n); water[r.flags.harbour].add(n); }
  }

  for (let n = 0; n < segments.length; n += 4) {
    for (const side of [-1, 1]) {
      if (rand() < 0.6 * style.nature && !noTrees[side].has(n)) add(n, 'tree', side * (1.45 + rand() * 3.5));
    }
  }

  if (style.walls === 'street') {
    // Walls right at the edge on both sides all the way round (the pit lane is on the right of the start straight).
    for (let n = 0; n < segments.length; n += 2) {
      for (const side of [-1, 1]) {
        if (side === 1 && n <= PIT_OUT_S / SEGMENT_LENGTH) continue;
        add(n, 'barrier', side * 1.15);
      }
    }
  } else {
    // Protection on the outside of corners (curve > 0 turns right, so the outside is on the left):
    // tyre stacks on the tightest corners, barriers on fast ones, hay bales on gentle bends.
    for (const seg of segments) {
      const bend = Math.abs(seg.curve), outside = seg.curve > 0 ? -1 : 1;
      if (bend >= 4 && seg.index % 3 === 0) add(seg.index, 'tyres', outside * 1.3);
      else if (bend >= 2.5 && seg.index % 3 === 0) add(seg.index, 'barrier', outside * 1.3);
      else if (bend >= 1.5 && seg.index % 4 === 0) add(seg.index, 'hay', outside * 1.3);
    }
  }

  // Marshal posts on the outside of the corners that are sharp enough to need one.
  for (const r of ranges) {
    const mid = Math.floor((r.start + r.end) / 2);
    const curve = segments[mid].curve;
    if (Math.abs(curve) >= 3) add(mid, 'marshal', (curve > 0 ? -1 : 1) * 2.2);
  }

  // Bushes, rocks and flowers dotted about the grass.
  for (let n = 2; n < segments.length; n += 5) {
    for (const side of [-1, 1]) {
      if (rand() < 0.3 * style.nature && !noTrees[side].has(n)) add(n, 'bush', side * (1.35 + rand() * 1.3));
    }
  }
  for (let n = 1; n < segments.length; n += 13) {
    const side = rand() < 0.5 ? -1 : 1;
    if (rand() < 0.6 * style.nature && !noTrees[side].has(n)) add(n, 'rock', side * (1.5 + rand() * 2.5));
  }
  for (let n = 3; n < segments.length; n += 7) {
    for (const side of [-1, 1]) {
      if (rand() < 0.3 * style.nature && !noTrees[side].has(n)) add(n, 'flowers', side * (1.3 + rand() * 1.6));
    }
  }

  // A few ponds well away from the track, on alternate sides.
  if (style.ponds) {
    let pondSide = -1;
    for (let n = 60; n < segments.length; n += 150) { add(n, 'pond', pondSide * (4.5 + rand() * 2)); pondSide = -pondSide; }
  }

  // A city: blocks of buildings close behind the walls, except where there is a harbour, a stand, or the pit buildings.
  if (style.buildings) {
    for (let n = 0; n < segments.length; n += 3) {
      for (const side of [-1, 1]) {
        if (noTrees[side].has(n)) continue;
        add(n, 'building', side * (2.1 + rand() * 1.2));
      }
    }
  }

  // The harbour: water beyond the wall with yachts moored on it.
  for (const side of [-1, 1]) {
    const sectionStarts = [...water[side]];
    for (const n of sectionStarts) {
      if (n % 3 === 0) add(n, 'water', side * 2.4);
      if (n % 11 === 0) add(n, 'yacht', side * (2.2 + rand() * 0.7));
    }
  }

  for (const r of ranges) {
    const f = r.flags;
    for (const side of f.stands || []) {
      for (let n = r.start + 6; n < r.end - 6; n += 22) add(n, 'stand', side * 1.9);
    }
    if (f.wing) {
      add(r.start + 35, 'wing', f.wing * 2.3);
      add(r.start + 80, 'wing', f.wing * 2.3);
      add(r.start + 35, 'carpark', f.wing * 3.4);
      add(r.start + 80, 'carpark', f.wing * 3.4);
    }
    if (f.garages) {   // the garages stand well back behind the pit lane
      for (let n = r.start + 13; n < PIT_OUT_S / SEGMENT_LENGTH; n += 10) add(n, 'garage', f.garages * 2.6);
    }
    if (f.boards) {
      let side = -1;
      for (let n = r.start + 8; n < r.end - 8; n += 16) { add(n, 'board', side * 1.4); side = -side; }
    }
  }

  // The pit wall between the track and the pit lane, and the painted PIT sign on the entry road.
  // (it starts a little way into the lane, so a car that joins the entry road late can still reach the fast lane)
  for (let n = Math.ceil((PIT_LANE_FROM + 600) / SEGMENT_LENGTH); n < PIT_LANE_TO / SEGMENT_LENGTH; n += 3) add(n, 'pitwall', 1.1);
  add(2, 'pitsign', 0.953);

  segments[LINE_SEG].sprites.push({ type: 'gantry', x: 0, seed: 0 });   // start/finish gantry, over the line
}

const CROWD_COLOURS = ['#D01010', '#2060D0', '#F0D020', '#FFFFFF', '#2E9E3E', '#F08020'];
const BOARD_COLOURS = ['#D01010', '#2060D0', '#F08020', '#7A3FC0', '#2E9E3E'];
