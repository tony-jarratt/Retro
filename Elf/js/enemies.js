'use strict';

const ENEMY_DEFS = {
  D: { kind: 'dog', w: 34, h: 22, speed: 1.2 },
  C: { kind: 'cat', w: 26, h: 20, speed: 1.3 },
  K: { kind: 'child', w: 18, h: 30, speed: 1.15 },
  P: { kind: 'parent', w: 24, h: 46, speed: 1.0 },
};

const CHILD_AWAKE_TICKS = 900; // about 15 seconds of chasing, then back to bed
const CHILD_WAKE_DIST = 120;   // the elf this close on the same floor wakes a sleeping child

function createEnemy(spec) {
  const def = ENEMY_DEFS[spec.type];
  if (!def) throw new LevelError(`Unknown enemy type '${spec.type}' at (${spec.c},${spec.r})`);
  return {
    type: spec.type, kind: def.kind, w: def.w, h: def.h, speed: def.speed,
    x: (spec.c + 0.5) * T, y: (spec.r + 1) * T,
    dir: Math.random() < 0.5 ? -1 : 1,
    state: def.kind === 'parent' ? 'asleep' : 'walk',
    timer: 0, anim: 0, climbDir: 0, awakeTimer: CHILD_AWAKE_TICKS,
  };
}

// Move one step along the floor. Returns false if blocked by a wall or the edge of a platform.
function enemyStep(e, lv, dir, speed) {
  const nx = e.x + dir * speed;
  const c = Math.floor((nx + dir * (e.w / 2)) / T);
  const r = Math.round(e.y / T);
  if (isWall(lv, c, r - 1) || !hasFloor(lv, c, r)) return false;
  e.x = nx;
  e.anim += speed * 0.12;
  return true;
}

function sameFloor(e, pl) { return Math.abs(pl.groundY - e.y) < 8; }

function updateDog(e, lv) {
  if (e.state === 'sniff') {
    if (--e.timer <= 0) e.state = 'walk';
    return;
  }
  if (Math.random() < 0.003) { e.state = 'sniff'; e.timer = 40; return; }
  if (!enemyStep(e, lv, e.dir, e.speed)) e.dir = -e.dir;
}

// Cats patrol, pause now and then, and pounce when the elf is on the same floor in front of them.
function updateCat(e, lv, pl) {
  if (e.state === 'pause') {
    if (--e.timer <= 0) e.state = 'walk';
    return;
  }
  if (e.state === 'dash') {
    if (--e.timer <= 0 || !enemyStep(e, lv, e.dir, 3.2)) { e.state = 'pause'; e.timer = 30; }
    return;
  }
  const dx = pl.x - e.x;
  if (sameFloor(e, pl) && Math.abs(dx) < 170 && Math.sign(dx) === e.dir) {
    e.state = 'dash'; e.timer = 40;
    return;
  }
  if (Math.random() < 0.004) { e.state = 'pause'; e.timer = 50; return; }
  if (!enemyStep(e, lv, e.dir, e.speed)) e.dir = -e.dir;
}

// Find the nearest ladder on this platform that leads up (want -1) or down (want +1).
function nearestLadder(e, lv, want) {
  const row = Math.round(e.y / T);
  const col = Math.floor(e.x / T);
  let left = col, right = col;
  while (hasFloor(lv, left - 1, row) && !isWall(lv, left - 1, row - 1)) left--;
  while (hasFloor(lv, right + 1, row) && !isWall(lv, right + 1, row - 1)) right++;
  let best = null;
  for (let c = left; c <= right; c++) {
    const leads = want < 0 ? isLadder(lv, c, row - 1) : isLadder(lv, c, row);
    if (leads && (best === null || Math.abs(c - col) < Math.abs(best - col))) best = c;
  }
  return best;
}

function elfNearChild(e, pl) {
  return Math.abs(pl.x - e.x) < CHILD_WAKE_DIST && Math.abs(pl.groundY - e.y) < 64;
}

// Children chase the elf, using ladders to change floors. After a while they go back to sleep
// (once the elf is out of range) and stay put until the elf comes close again.
function updateChild(e, lv, pl) {
  if (e.state === 'asleep') {
    if (elfNearChild(e, pl)) { e.state = 'waking'; e.timer = 30; }
    return;
  }
  if (e.state === 'waking') {
    if (--e.timer <= 0) { e.state = 'walk'; e.awakeTimer = CHILD_AWAKE_TICKS; }
    return;
  }
  if (e.state === 'walk' && --e.awakeTimer <= 0) {
    if (!elfNearChild(e, pl)) { e.state = 'asleep'; return; }
    e.awakeTimer = 0; // elf still close: stay up and check again next tick
  }
  if (e.state === 'ladder') {
    e.y += e.climbDir * e.speed;
    e.anim += 0.15;
    const col = Math.floor(e.x / T);
    if (e.climbDir < 0 && !isLadder(lv, col, Math.floor((e.y - 1) / T))) {
      e.y = (Math.floor((e.y - 1) / T) + 1) * T;
      e.state = 'walk';
    } else if (e.climbDir > 0 && !isLadder(lv, col, Math.floor(e.y / T))) {
      e.y = Math.floor(e.y / T) * T;
      e.state = 'walk';
    }
    return;
  }
  let targetX = pl.x;
  const dy = pl.groundY - e.y;
  if (Math.abs(dy) > 20) {
    const want = dy < 0 ? -1 : 1;
    const c = nearestLadder(e, lv, want);
    if (c === null) {
      if (!enemyStep(e, lv, e.dir, e.speed)) e.dir = -e.dir;
      return;
    }
    targetX = (c + 0.5) * T;
    if (Math.abs(e.x - targetX) < 2) {
      e.x = targetX; e.state = 'ladder'; e.climbDir = want;
      return;
    }
  }
  const dx = targetX - e.x;
  if (Math.abs(dx) > 2) {
    e.dir = Math.sign(dx);
    enemyStep(e, lv, e.dir, e.speed);
  }
}

// Parents sleep until the elf gets close or jumps nearby, then wander and grumpily chase on their own floor.
function updateParent(e, lv, pl) {
  const dx = pl.x - e.x;
  if (e.state === 'asleep') {
    const close = Math.abs(dx) < 170 && Math.abs(pl.groundY - e.y) < 64;
    const noisy = pl.noise > 0 && Math.abs(dx) < 320 && Math.abs(pl.groundY - e.y) < 140;
    if (close || noisy) { e.state = 'waking'; e.timer = 45; }
    return;
  }
  if (e.state === 'waking') {
    if (--e.timer <= 0) e.state = 'walk';
    return;
  }
  if (sameFloor(e, pl) && Math.abs(dx) < 260) {
    e.dir = Math.sign(dx) || e.dir;
    enemyStep(e, lv, e.dir, 1.2);
  } else if (!enemyStep(e, lv, e.dir, e.speed)) {
    e.dir = -e.dir;
  }
}

function updateEnemy(e, lv, pl) {
  switch (e.kind) {
    case 'dog': return updateDog(e, lv);
    case 'cat': return updateCat(e, lv, pl);
    case 'child': return updateChild(e, lv, pl);
    case 'parent': return updateParent(e, lv, pl);
    default: throw new Error(`updateEnemy: unknown kind '${e.kind}'`);
  }
}

// Slightly shrunken hitboxes so near misses feel fair.
function enemyCaughtPlayer(e, pl) {
  if (e.state === 'asleep' || e.state === 'waking') return false;
  const ex0 = e.x - e.w / 2 + 4, ex1 = e.x + e.w / 2 - 4;
  const ey0 = e.y - e.h + 4, ey1 = e.y - 1;
  const px0 = pl.x - 6, px1 = pl.x + 6;
  const py0 = pl.y - PLAYER_H + 4, py1 = pl.y - 2;
  return ex0 < px1 && ex1 > px0 && ey0 < py1 && ey1 > py0;
}
