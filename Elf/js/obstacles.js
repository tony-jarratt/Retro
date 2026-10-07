'use strict';

// Rolling baubles. Each spawner in the level data releases a bauble every `every` frames; it
// rolls along its floor from x0 to x1 and then disappears. Hitting one never costs a life
// (see bonkPlayer in player.js).
const BAUBLE_R = 11, BAUBLE_SPEED = 1.8, BAUBLE_SPAWN_CLEAR = 96, BAUBLE_GROW = 20;
const BAUBLE_COLORS = ['#e63946', '#3b82f6', '#f2c94c', '#2f9e4a', '#ff4d8d'];

function createSpawners(lv) {
  return lv.baubles.map((b, i) => ({ ...b, timer: b.offset, color: BAUBLE_COLORS[i % BAUBLE_COLORS.length] }));
}

function baubleHitsPlayer(b, p) {
  if (p.state === 'ladder') return false;
  if (Math.abs(p.x - b.x) >= BAUBLE_R + 6) return false;
  const feetBelowTop = p.y - 2 > b.floorY - 2 * BAUBLE_R + 3; // feet are low enough to touch it
  const headAboveFloor = p.y - PLAYER_H + 4 < b.floorY - 3;
  return feetBelowTop && headAboveFloor;
}

// Advance spawners and baubles one frame. Returns the bauble that hit the player this frame, or null.
function updateObstacles(G, p) {
  for (const s of G.spawners) {
    if (--s.timer > 0) continue;
    // Don't drop a bauble on top of the elf: wait a little and try again.
    const tooClose = Math.abs(p.x - s.x0) < BAUBLE_SPAWN_CLEAR && Math.abs(p.y - s.floorY) < 40;
    if (tooClose) { s.timer = 30; continue; }
    G.baubles.push({ x: s.x0, floorY: s.floorY, dir: s.dir, x1: s.x1, color: s.color, spin: 0, age: 0 });
    s.timer = s.every;
  }
  let hit = null;
  for (const b of G.baubles) {
    b.x += b.dir * BAUBLE_SPEED;
    b.spin += b.dir * BAUBLE_SPEED / BAUBLE_R;
    b.age++;
    if (!hit && p.bonk === 0 && p.invuln === 0 && baubleHitsPlayer(b, p)) hit = b;
  }
  G.baubles = G.baubles.filter((b) => (b.dir > 0 ? b.x <= b.x1 : b.x >= b.x1));
  return hit;
}
