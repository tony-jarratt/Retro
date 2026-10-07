'use strict';

const PLAYER_HALF_W = 9, PLAYER_H = 28;
const WALK_SPEED = 2.4, CLIMB_SPEED = 2, GRAVITY = 0.42, JUMP_VY = -8.2;
const ICE_ACCEL = 0.08, ICE_FRICTION = 0.985, ICE_MAX = 3.0;
const BONK_STUN = 28, BONK_GRACE = 90, BONK_KNOCK = 3.4;

// x is the horizontal centre, y is the feet. States: 'ground', 'air', 'ladder'.
// slide: horizontal speed on ice. airVx: horizontal speed in the air (fixed at take-off,
// so a jump off ice carries the slide). stun/knock: set by a bauble hit.
function createPlayer(lv) {
  const p = {
    inv: { g: false, p: false, s: false, r: false, wrapped: false },
    invuln: 0, noise: 0,
  };
  resetPlayerPosition(p, lv);
  return p;
}

function resetPlayerPosition(p, lv) {
  p.x = (lv.start.c + 0.5) * T;
  p.y = (lv.start.r + 1) * T;
  p.groundY = p.y;
  p.vy = 0;
  p.airVx = 0;
  p.slide = 0;
  p.stun = 0;
  p.knock = 0;
  p.bonk = 0;
  p.state = 'ground';
  p.facing = 1;
  p.moving = false;
  p.anim = 0;
  p.climbAnim = 0;
}

function playerBlocked(lv, x, y, dir) {
  const c = Math.floor((x + dir * PLAYER_HALF_W) / T);
  const top = Math.floor((y - PLAYER_H) / T);
  const bottom = Math.floor((y - 1) / T);
  for (let r = top; r <= bottom; r++) if (isWall(lv, c, r)) return true;
  return false;
}

function playerSupported(lv, x, y) {
  const r = Math.round(y / T);
  if (Math.abs(y - r * T) > 0.01) return false;
  return hasFloor(lv, Math.floor((x - PLAYER_HALF_W + 1) / T), r) ||
         hasFloor(lv, Math.floor((x + PLAYER_HALF_W - 1) / T), r);
}

// True when standing on an ice tile (judged by the tile under the elf's centre).
function playerOnIce(p, lv) {
  return p.state === 'ground' && tileAt(lv, Math.floor(p.x / T), Math.round(p.y / T)) === 'i';
}

// A bauble hit: no life lost. On the ground the elf is knocked back and stunned briefly;
// in the air it is bounced away. Either way it is immune to baubles for a moment.
function bonkPlayer(p, fromX) {
  const away = p.x >= fromX ? 1 : -1;
  p.bonk = BONK_GRACE;
  p.slide = 0;
  if (p.state === 'air') {
    p.airVx = away * WALK_SPEED;
    p.vy = Math.min(p.vy, -3);
  } else {
    p.stun = BONK_STUN;
    p.knock = away * BONK_KNOCK;
  }
}

function slideOnIce(p, lv, dir) {
  if (dir) { p.facing = dir; p.slide += dir * ICE_ACCEL; } else p.slide *= ICE_FRICTION;
  p.slide = Math.max(-ICE_MAX, Math.min(ICE_MAX, p.slide));
  if (!dir && Math.abs(p.slide) < 0.05) p.slide = 0;
  if (!p.slide) return;
  const sd = Math.sign(p.slide);
  const nx = p.x + p.slide;
  if (playerBlocked(lv, nx, p.y, sd)) { p.slide = 0; return; }
  p.x = nx;
  p.anim += Math.abs(p.slide) * 0.125;
  p.moving = dir !== 0 && Math.abs(p.slide) > 0.4;
  if (!dir) p.facing = sd;
}

// inp = { left, right, up, down, jump }. Returns 'jump' on the frame a jump starts.
function updatePlayer(p, lv, inp) {
  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  let event = null;
  p.moving = false;

  if (p.stun > 0) {
    p.stun--;
    if (p.state === 'ground') {
      const kd = Math.sign(p.knock);
      if (kd && !playerBlocked(lv, p.x + p.knock, p.y, kd)) p.x += p.knock; else p.knock = 0;
      p.knock *= 0.88;
      if (!playerSupported(lv, p.x, p.y)) { p.state = 'air'; p.vy = 0; p.airVx = p.knock; p.stun = 0; }
    }
  } else if (p.state === 'ladder') {
    const col = Math.floor(p.x / T);
    const dy = inp.up ? -CLIMB_SPEED : inp.down ? CLIMB_SPEED : 0;
    p.y += dy;
    if (dy) p.climbAnim += 0.22;
    if (dy < 0 && !isLadder(lv, col, Math.floor((p.y - 1) / T))) {
      p.y = (Math.floor((p.y - 1) / T) + 1) * T;
      p.state = 'ground';
    } else if (dy > 0 && !isLadder(lv, col, Math.floor(p.y / T))) {
      p.y = Math.floor(p.y / T) * T;
      p.state = 'ground';
    }
  } else if (p.state === 'ground') {
    const col = Math.floor(p.x / T);
    const nearCentre = Math.abs(p.x - (col + 0.5) * T) <= 14;
    const row = Math.round(p.y / T);
    const onIce = playerOnIce(p, lv);
    if (inp.up && nearCentre && isLadder(lv, col, Math.floor((p.y - 1) / T))) {
      p.state = 'ladder'; p.x = (col + 0.5) * T; p.slide = 0;
    } else if (inp.down && nearCentre && isLadder(lv, col, row)) {
      p.state = 'ladder'; p.x = (col + 0.5) * T; p.slide = 0;
    } else if (inp.jump) {
      p.state = 'air'; p.vy = JUMP_VY; p.airVx = onIce ? p.slide : dir * WALK_SPEED; event = 'jump';
      if (dir) p.facing = dir;
    } else {
      if (onIce) {
        slideOnIce(p, lv, dir);
      } else {
        p.slide = 0;
        if (dir) {
          p.facing = dir;
          const nx = p.x + dir * WALK_SPEED;
          if (!playerBlocked(lv, nx, p.y, dir)) { p.x = nx; p.moving = true; p.anim += 0.3; }
        }
      }
      if (!playerSupported(lv, p.x, p.y)) { p.state = 'air'; p.vy = 0; p.airVx = onIce ? p.slide : 0; }
    }
  }

  if (p.state === 'air') {
    if (p.airVx) {
      const ad = Math.sign(p.airVx);
      p.facing = ad;
      const nx = p.x + p.airVx;
      if (!playerBlocked(lv, nx, p.y, ad)) p.x = nx; else p.airVx = 0;
    }
    p.vy += GRAVITY;
    const y0 = p.y, y1 = p.y + p.vy;
    if (p.vy > 0) {
      const cl = Math.floor((p.x - PLAYER_HALF_W + 1) / T);
      const cr = Math.floor((p.x + PLAYER_HALF_W - 1) / T);
      let landed = false;
      for (let r = Math.ceil(y0 / T); r <= Math.floor(y1 / T); r++) {
        if (hasFloor(lv, cl, r) || hasFloor(lv, cr, r)) {
          p.y = r * T; p.vy = 0; p.state = 'ground'; landed = true;
          p.slide = p.airVx; // only kept if we landed on ice; walking on normal floor resets it
          break;
        }
      }
      if (!landed) p.y = y1;
    } else {
      p.y = y1;
      const head = Math.floor((p.y - PLAYER_H) / T);
      if (isWall(lv, Math.floor((p.x - PLAYER_HALF_W + 1) / T), head) ||
          isWall(lv, Math.floor((p.x + PLAYER_HALF_W - 1) / T), head)) {
        p.y = (head + 1) * T + PLAYER_H; p.vy = 0;
      }
    }
  }

  if (p.state !== 'air') p.groundY = p.y;
  if (p.invuln > 0) p.invuln--;
  if (p.bonk > 0) p.bonk--;
  if (p.noise > 0) p.noise--;
  return event;
}
