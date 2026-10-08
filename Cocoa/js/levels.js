'use strict';

// The levels. Each one draws its factory with the grid helpers (rect, clear) and ramp(); the plan is 160 x 90 and is scaled up to cells by the game.
//   spout    where the chocolate pours from (it pours three cells wide)
//   total    cells poured     rate   ticks between pours (smaller is faster)
//   goal     the vat: cells that reach this rectangle are counted and drained
//   need     cells that must reach the vat     time   seconds allowed
//   helpers  how many of each helper you get (deflect, pipe, solid, heat, guzzle)
//   events   optional things that happen mid-pour: { at: seconds, kind: 'hole' (x, y, w, h: a rectangle cleared) or
//            'spout' (x, y: a second spout), warn: text shown for the 3 seconds before }
// Chocolate only travels sideways by sliding down slopes, so the factories are built from 45 degree ramps.

// A ramp three cells thick that runs down to the right from (x, y) for n cells.
function ramp(g, x, y, n) {
  for (let i = 0; i < n * SCALE; i++) g.cells(x * SCALE + i, y * SCALE + i, 1, 3 * SCALE);
}

const LEVELS = [
  {
    name: 'Warm Up',
    hint: 'The chocolate misses the second ramp. Deflect it.',
    spout: { x: 15, y: 4 }, total: 400, rate: 2, need: 300, time: 90,
    goal: { x: 58, y: 76, w: 40, h: 9 },
    helpers: { deflect: 1 },
    build(g) {
      g.rect(3, 0, 2, 30);
      ramp(g, 5, 25, 30);
      ramp(g, 40, 66, 19);
      g.rect(55, 85, 105, 5);
    },
  },
  {
    name: 'Over the Wall',
    hint: 'A pipe can carry chocolate where it cannot flow.',
    spout: { x: 15, y: 4 }, total: 400, rate: 2, need: 280, time: 120,
    goal: { x: 58, y: 76, w: 40, h: 9 },
    helpers: { pipe: 1 },
    build(g) {
      g.rect(3, 0, 2, 30);
      ramp(g, 5, 25, 55);
      g.rect(35, 0, 3, 56);
      g.rect(55, 85, 105, 5);
    },
  },
  {
    name: 'Wafer Wall',
    hint: 'Wafer melts. Chocolate does not mind.',
    spout: { x: 15, y: 4 }, total: 400, rate: 2, need: 300, time: 120,
    goal: { x: 58, y: 76, w: 40, h: 9 },
    helpers: { heat: 1 },
    build(g) {
      g.rect(3, 0, 2, 30);
      g.rect(35, 0, 2, 40);
      g.rect(35, 40, 2, 15, SOFT);
      ramp(g, 5, 25, 55);
      g.rect(55, 85, 105, 5);
    },
  },
  {
    name: 'The Leak',
    hint: 'The basin has a hole in it. Set some chocolate to plug it.',
    spout: { x: 60, y: 4 }, total: 400, rate: 2, need: 120, time: 120,
    goal: { x: 100, y: 76, w: 45, h: 9 },
    helpers: { solid: 1 },
    build(g) {
      g.rect(44, 58, 30, 5);
      g.clear(50, 58, 6, 5);        // the hole
      g.rect(42, 30, 2, 33);
      g.rect(74, 55, 2, 8);          // the low side the basin spills over
      ramp(g, 76, 57, 27);
      g.rect(105, 85, 55, 5);
    },
  },
  {
    name: 'Pressure Valve',
    hint: 'A thick wafer plug. A guzzler that bursts will blow it open.',
    spout: { x: 15, y: 4 }, total: 400, rate: 2, need: 250, time: 150,
    goal: { x: 58, y: 76, w: 40, h: 9 },
    helpers: { guzzle: 1, heat: 1 },
    build(g) {
      g.rect(3, 0, 2, 30);
      g.rect(35, 0, 5, 40);
      g.rect(35, 40, 5, 19, SOFT);
      ramp(g, 5, 25, 55);
      g.rect(55, 85, 105, 5);
    },
  },
  {
    name: 'Mind the Gap',
    hint: 'One slide is not enough. Chain two of them.',
    spout: { x: 15, y: 4 }, total: 400, rate: 2, need: 210, time: 120,
    goal: { x: 52, y: 76, w: 46, h: 9 },
    helpers: { deflect: 2 },
    build(g) {
      g.rect(3, 0, 2, 30);
      ramp(g, 5, 25, 30);
      g.rect(50, 85, 110, 5);
    },
  },
  {
    name: 'Two Leaks',
    hint: 'A second leak opens mid-pour. Pick up your solidifier and move it.',
    spout: { x: 60, y: 4 }, total: 600, rate: 2, need: 110, time: 120,
    goal: { x: 100, y: 76, w: 45, h: 9 },
    helpers: { solid: 1 },
    events: [{ at: 12, kind: 'hole', x: 60, y: 58, w: 5, h: 5, warn: 'SECOND LEAK' }],
    build(g) {
      g.rect(44, 58, 30, 5);
      g.clear(48, 58, 5, 5);
      g.rect(42, 30, 2, 33);
      g.rect(74, 55, 2, 8);
      ramp(g, 76, 57, 27);
      g.rect(105, 85, 55, 5);
    },
  },
  {
    name: 'Long Way Round',
    hint: 'Two walls, two pipes. Hop each one.',
    spout: { x: 15, y: 4 }, total: 400, rate: 2, need: 250, time: 150,
    goal: { x: 74, y: 76, w: 50, h: 9 },
    helpers: { pipe: 2 },
    build(g) {
      g.rect(3, 0, 2, 15);
      ramp(g, 5, 10, 70);
      g.rect(30, 0, 3, 36);
      g.rect(55, 0, 3, 61);
      g.rect(70, 85, 90, 5);
    },
  },
  {
    name: 'Plug and Pump',
    hint: 'Plug, pipe, and watch the floor: a second leak is coming.',
    spout: { x: 60, y: 4 }, total: 600, rate: 2, need: 120, time: 150,
    goal: { x: 100, y: 76, w: 45, h: 9 },
    helpers: { solid: 1, pipe: 1 },
    events: [{ at: 16, kind: 'hole', x: 62, y: 58, w: 5, h: 5, warn: 'SECOND LEAK' }],
    build(g) {
      g.rect(44, 58, 30, 5);
      g.clear(50, 58, 6, 5);
      g.rect(42, 30, 2, 33);
      g.rect(74, 55, 2, 8);
      ramp(g, 76, 57, 27);
      g.rect(88, 0, 3, 70);
      g.rect(105, 85, 55, 5);
    },
  },
];
