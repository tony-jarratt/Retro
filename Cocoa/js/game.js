'use strict';

// Cocoa Cascade: the rules. Nothing in here touches the page, so the checks can run it anywhere.
// The factory is a 480 x 270 grid of cells (drawn 2 screen pixels each). Levels are drawn on a coarser
// 160 x 90 plan and scaled up by SCALE; everything measured in cells below is scaled the same way.
// Chocolate is a liquid that
// falls, slides down slopes and pools, falling-sand style. You place a few helpers while the
// factory is still, then press START and watch the chocolate run.

const SCALE = 3, W = 160 * SCALE, H = 90 * SCALE, TPS = 30;
const EMPTY = 0, WALL = 1, SOFT = 2, CHOC = 3, SET = 4, PADDLE = 5;
const HELPERS = ['deflect', 'pipe', 'solid', 'heat', 'guzzle'];
const PADDLE_HALF = Math.floor(5 * SCALE); // a deflector is 2 * PADDLE_HALF + 1 cells long
const PIPE_MAX = 45 * SCALE; // longest pipe, in cells, inlet to outlet
const SOLID_CHARGE = 40 * SCALE * SCALE;    // cells a solidifier can set before it is spent
const GUZZLE_CAPACITY = 60 * SCALE * SCALE; // cells a guzzler swallows before it bursts
const GUZZLE_BLAST = 8 * SCALE;     // blast radius of a burst guzzler
const REACH = 3 * SCALE;            // radius of a solidifier, heater or guzzler's mouth
const UNIT = SCALE * SCALE;  // cells in one plan cell: counts shown to the player are divided by this
const MOUTH = Math.round(1.5 * SCALE); // a spout or pipe inlet is 2 * MOUTH + 1 cells wide
const COOLDOWN = 2 * TPS;     // a crew member you pick up needs this long before you can place that kind again
const WARN_SECS = 3;        // how long before a level event the warning shows
const PAR_SECS = 50;        // finish a level within this many seconds of pouring for the third star
const SETTLE_TICKS = 90;    // the level is over once nothing has moved for this long

class GameError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GameError';
  }
}

class PlacementError extends GameError {
  constructor(message) {
    super(message);
    this.name = 'PlacementError';
  }
}

// Small deterministic random numbers, so the same plan always gives the same pour.
class Rng {
  constructor(seed = 12345) { this.s = seed >>> 0; }
  next() {
    this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0;
    return this.s / 4294967296;
  }
}

class Grid {
  constructor() { this.m = new Uint8Array(W * H); }
  get(x, y) { return x < 0 || y < 0 || x >= W || y >= H ? WALL : this.m[y * W + x]; }
  set(x, y, v) { if (x >= 0 && y >= 0 && x < W && y < H) this.m[y * W + x] = v; }
  // cells() takes cell coordinates; rect() and clear() take plan coordinates, which are scaled up.
  cells(x, y, w, h, v = WALL) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, v);
  }
  rect(x, y, w, h, v = WALL) { this.cells(x * SCALE, y * SCALE, w * SCALE, h * SCALE, v); }
  clear(x, y, w, h) { this.rect(x, y, w, h, EMPTY); }
  eachInDisc(cx, cy, r, fn) {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r) fn(cx + i, cy + j);
  }
}

// The cells a deflector covers: a diagonal of 2 * PADDLE_HALF + 1 cells centred on (x, y).
// dir 1 runs like "\" (down to the right), dir -1 like "/".
function paddleCells(x, y, dir) {
  const cells = [];
  for (let k = -PADDLE_HALF; k <= PADDLE_HALF; k++) cells.push([x + k * dir, y + k]);
  return cells;
}

class Game {
  constructor(level) {
    this.level = level;
    this.grid = new Grid();
    level.build(this.grid);
    const sc = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v * SCALE]));
    this.spout = sc(level.spout);
    this.goal = sc(level.goal);
    this.total = level.total * SCALE * SCALE; // cells poured
    this.need = level.need * SCALE * SCALE;   // cells that must reach the vat
    const { spout, goal } = this;
    if (this.grid.get(spout.x, spout.y) !== EMPTY) throw new GameError(`${level.name}: the spout at ${spout.x},${spout.y} is inside a wall`);
    if (goal.w < 1 || goal.h < 1) throw new GameError(`${level.name}: the goal has no size`);
    this.base = this.grid.m.slice(); // the factory with no helpers and no chocolate
    this.helpers = [];
    this.nextId = 1;
    this.running = false;
    this.result = null; // 'won' or 'lost'
    this.reason = '';
    this.events = [];   // for the sound: { type }
    this.resetRun();
  }

  resetRun() {
    this.grid.m.set(this.base);
    for (const h of this.helpers) this.stamp(h);
    this.stampedGrid = this.grid.m.slice();
    this.rng = new Rng();
    this.time = 0;
    this.steps = 0;
    this.emitted = 0;
    this.saved = 0;
    this.lost = 0;
    this.quiet = 0;
    this.lastMoved = 0;
    this.chocNow = 0;
    this.cool = {};
    this.spouts = [{ ...this.spout }];
    this.pending = (this.level.events || []).slice().sort((a, b) => a.at - b.at);
    this.result = null;
    this.reason = '';
    this.running = false;
    for (const h of this.helpers) { h.charge = h.type === 'solid' ? SOLID_CHARGE : 0; h.swallowed = 0; h.burst = false; }
  }

  // 1 star for winning, 2 if under a fifth of the chocolate was spilled, 3 if it was also quick.
  get stars() {
    if (this.result !== 'won') return 0;
    if (this.lost > 0.2 * this.total) return 1;
    return this.time <= PAR_SECS * TPS ? 3 : 2;
  }
  shown(cells) { return Math.round(cells / UNIT); }
  get timeLeft() { return this.level.time * TPS - this.time; }
  left(type) { return (this.level.helpers[type] || 0) - this.helpers.filter((h) => h.type === type).length; }

  stamp(h) {
    if (h.type === 'deflect') for (const [x, y] of paddleCells(h.x, h.y, h.dir)) this.grid.set(x, y, PADDLE);
  }

  start() {
    if (this.running || this.result) return;
    this.running = true;
    this.events.push({ type: 'start' });
  }

  // Start the level again from the beginning, with no crew placed.
  reset() {
    this.helpers = [];
    this.resetRun();
    this.events.push({ type: 'reset' });
  }

  // The next level event if it is close, so the screen can warn about it.
  get warning() {
    const next = this.pending[0];
    if (!next || !this.running) return null;
    const left = next.at * TPS - this.time;
    return left <= WARN_SECS * TPS ? { text: next.warn || 'WARNING', secs: Math.max(1, Math.ceil(left / TPS)) } : null;
  }

  // ---- placing helpers (before the pour, and live while it runs) ----

  // h is { type, x, y, dir } for a deflector, { type, x, y } for the others,
  // and { type: 'pipe', x, y, x2, y2 } for a pipe from its inlet (x, y) to its outlet (x2, y2).
  // Chocolate in the way is pushed aside; walls, wafer and set chocolate block a helper.
  place(h) {
    if (this.result) throw new PlacementError('The level is over.');
    if (!HELPERS.includes(h.type)) throw new GameError(`unknown helper "${h.type}"`);
    if (this.left(h.type) <= 0) throw new PlacementError('You have none of those left.');
    if (this.cool[h.type] > 0) throw new PlacementError(`Resting: ${Math.ceil(this.cool[h.type] / TPS)}s until you can place that again.`);
    const g = this.grid;
    const free = (x, y) => { const m = g.get(x, y); return m === EMPTY || m === CHOC; };
    if (h.type === 'deflect') {
      for (const [x, y] of paddleCells(h.x, h.y, h.dir)) if (!free(x, y)) throw new PlacementError('The deflector does not fit there.');
    } else if (h.type === 'pipe') {
      if (!free(h.x, h.y) || !free(h.x2, h.y2)) throw new PlacementError('A pipe needs empty cells at both ends.');
      if (Math.hypot(h.x2 - h.x, h.y2 - h.y) > PIPE_MAX) throw new PlacementError('That pipe is too long.');
      if (h.x === h.x2 && h.y === h.y2) throw new PlacementError('A pipe needs two different ends.');
    } else if (!free(h.x, h.y)) {
      throw new PlacementError('That spot is taken.');
    }
    const placed = { ...h, id: this.nextId++, charge: h.type === 'solid' ? SOLID_CHARGE : 0, swallowed: 0, burst: false };
    this.helpers.push(placed);
    this.stamp(placed);
    this.events.push({ type: 'place' });
    return placed;
  }

  // Take a crew member away. While the chocolate is running that kind of crew then rests for a couple of seconds.
  remove(id) {
    if (this.result) throw new PlacementError('The level is over.');
    const at = this.helpers.findIndex((h) => h.id === id);
    if (at === -1) throw new GameError(`no helper with id ${id}`);
    const [gone] = this.helpers.splice(at, 1);
    if (gone.type === 'deflect') for (const [x, y] of paddleCells(gone.x, gone.y, gone.dir)) if (this.grid.get(x, y) === PADDLE) this.grid.set(x, y, EMPTY);
    if (this.running) this.cool[gone.type] = COOLDOWN;
    this.events.push({ type: 'remove' });
  }

  // The helper nearest (x, y) within a few cells, or null.
  helperAt(x, y) {
    let best = null, bestD = 5;
    for (const h of this.helpers) {
      const pts = h.type === 'deflect' ? paddleCells(h.x, h.y, h.dir) : h.type === 'pipe' ? [[h.x, h.y], [h.x2, h.y2]] : [[h.x, h.y]];
      for (const [px, py] of pts) {
        const d = Math.hypot(px - x, py - y);
        if (d < bestD) { best = h; bestD = d; }
      }
    }
    return best;
  }

  // ---- running ----

  tick() {
    if (!this.running || this.result) return;
    this.time++;
    for (const k of Object.keys(this.cool)) if (this.cool[k] > 0) this.cool[k]--;
    while (this.pending.length && this.pending[0].at * TPS <= this.time) this.fire(this.pending.shift());
    let moved = 0;
    for (let i = 0; i < SCALE; i++) { // finer cells take more steps to cover the same ground
      this.steps++;
      this.emit();
      this.runHelpers();
      moved += this.flow();
      this.drain();
    }
    this.lastMoved = moved;
    if (this.saved >= this.need) return this.finish('won', `${this.shown(this.saved)} cells reached the vat`);
    // lose the moment the vat cannot be filled any more
    if (this.saved + this.chocNow + (this.total - this.emitted) < this.need) return this.finish('lost', 'too much chocolate was wasted: the vat cannot be filled');
    const pouring = this.emitted < this.total;
    this.quiet = moved === 0 && !pouring ? this.quiet + 1 : 0;
    if (this.quiet >= SETTLE_TICKS) this.finish('lost', `only ${this.shown(this.saved)} of the ${this.shown(this.need)} cells needed reached the vat`);
    else if (this.timeLeft <= 0) this.finish('lost', 'out of time');
  }

  // Something happens in the factory: a floor gives way, or a second spout opens.
  fire(ev) {
    if (ev.kind === 'hole') this.grid.clear(ev.x, ev.y, ev.w, ev.h);
    else if (ev.kind === 'spout') this.spouts.push({ x: ev.x * SCALE, y: ev.y * SCALE });
    else throw new GameError(`${this.level.name}: unknown event kind "${ev.kind}"`);
    this.events.push({ type: 'event', text: ev.warn || 'WARNING' });
  }

  finish(result, reason) {
    this.result = result;
    this.reason = reason;
    this.running = false;
    this.events.push({ type: result });
  }

  emit() {
    if (this.steps % (this.level.rate * SCALE) >= SCALE) return;
    for (const sp of this.spouts) {
      for (let dx = -MOUTH; dx <= MOUTH; dx++) {
        if (this.emitted < this.total && this.grid.get(sp.x + dx, sp.y) === EMPTY) {
          this.grid.set(sp.x + dx, sp.y, CHOC);
          this.emitted++;
        }
      }
    }
  }

  runHelpers() {
    const g = this.grid;
    for (const h of this.helpers) {
      if (h.type === 'pipe') {
        // swallow one cell from the three-wide mouth and spit it out of the far end
        if (g.get(h.x2, h.y2) !== EMPTY) continue;
        for (let dx = -MOUTH; dx <= MOUTH; dx++) {
          if (g.get(h.x + dx, h.y) === CHOC) { g.set(h.x + dx, h.y, EMPTY); g.set(h.x2, h.y2, CHOC); break; }
        }
      } else if (h.type === 'solid' && h.charge > 0) {
        g.eachInDisc(h.x, h.y, REACH, (x, y) => { if (h.charge > 0 && g.get(x, y) === CHOC) { g.set(x, y, SET); h.charge--; } });
      } else if (h.type === 'heat' && this.steps % (3 * SCALE) < SCALE) {
        g.eachInDisc(h.x, h.y, REACH, (x, y) => {
          const m = g.get(x, y);
          if (m === SET) g.set(x, y, CHOC);
          else if (m === SOFT) g.set(x, y, EMPTY);
        });
      } else if (h.type === 'guzzle' && !h.burst) {
        g.eachInDisc(h.x, h.y, REACH, (x, y) => {
          if (!h.burst && g.get(x, y) === CHOC) { g.set(x, y, EMPTY); h.swallowed++; if (h.swallowed >= GUZZLE_CAPACITY) h.burst = true; }
        });
        if (h.burst) {
          g.eachInDisc(h.x, h.y, GUZZLE_BLAST, (x, y) => {
            const m = g.get(x, y);
            if (m === SOFT || m === SET || m === CHOC) g.set(x, y, EMPTY);
          });
          this.events.push({ type: 'boom', x: h.x, y: h.y });
        }
      }
    }
  }

  // One step of the liquid. Returns how many cells moved.
  flow() {
    const g = this.grid, rng = this.rng;
    const done = new Uint8Array(W * H);
    let moved = 0, count = 0;
    const go = (x, y, nx, ny) => { g.set(x, y, EMPTY); g.set(nx, ny, CHOC); done[ny * W + nx] = 1; moved++; };
    for (let y = H - 1; y >= 0; y--) {
      const leftFirst = (y + this.steps) % 2 === 0;
      for (let i = 0; i < W; i++) {
        const x = leftFirst ? i : W - 1 - i;
        if (g.get(x, y) !== CHOC) continue;
        count++;
        if (done[y * W + x]) continue;
        if (g.get(x, y + 1) === EMPTY) { go(x, y, x, y + 1); continue; }
        if (rng.next() < 0.5) continue; // thick: slides and spreads slowly
        const dirs = rng.next() < 0.5 ? [-1, 1] : [1, -1];
        let done2 = false;
        for (const d of dirs) { // slide down a slope
          if (g.get(x + d, y) === EMPTY && g.get(x + d, y + 1) === EMPTY) { go(x, y, x + d, y + 1); done2 = true; break; }
        }
        if (done2) continue;
        for (const d of dirs) { // or spread out towards a drop up to three cells away, so pools level out
          let k = 2;
          while (k <= 3 && g.get(x + d * (k - 1), y) === EMPTY && g.get(x + d * k, y) === EMPTY && g.get(x + d * k, y + 1) !== EMPTY) k++;
          if (k <= 3 && g.get(x + d * (k - 1), y) === EMPTY && g.get(x + d * k, y) === EMPTY && g.get(x + d * k, y + 1) === EMPTY) { go(x, y, x + d * k, y); break; }
        }
      }
    }
    this.chocNow = count;
    return moved;
  }

  // Cells in the vat are counted and drained; cells off the bottom of the factory are spilled.
  drain() {
    const g = this.grid, { x, y, w, h } = this.goal;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (g.get(i, j) === CHOC) { g.set(i, j, EMPTY); this.saved++; }
    }
    for (let i = 0; i < W; i++) if (g.get(i, H - 1) === CHOC) { g.set(i, H - 1, EMPTY); this.lost++; }
  }
}

// For tests and screenshots: a helper written in plan coordinates, converted to cells.
function planHelper(h) {
  const out = { ...h };
  for (const k of ['x', 'y', 'x2', 'y2']) if (k in out) out[k] = Math.round(out[k] * SCALE);
  return out;
}
