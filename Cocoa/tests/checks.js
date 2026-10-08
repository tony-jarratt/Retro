'use strict';
// Rules checks and a scripted solution for every level. Run with run-jsc.sh.

function runAllChecks(print) {
  let failures = 0;
  const check = (cond, msg) => { if (!cond) failures++; print((cond ? 'ok: ' : 'FAIL: ') + msg); };
  const throwsPlacement = (fn) => { try { fn(); } catch (e) { return e instanceof PlacementError; } return false; };
  const count = (g, v) => { let n = 0; for (let i = 0; i < g.grid.m.length; i++) if (g.grid.m[i] === v) n++; return n; };

  // A tiny test factory: a flat floor, a spout over it, a vat far away.
  const tiny = (build, helpers = {}, extra = {}) => new Game({
    name: 'test', spout: { x: 10, y: 4 }, total: 30, rate: 1, need: 20, time: 60,
    goal: { x: 100, y: 80, w: 20, h: 5 }, helpers: { deflect: 2, pipe: 2, solid: 2, heat: 2, guzzle: 2, ...helpers },
    build(g) { g.rect(0, 85, 160, 5); if (build) build(g); }, ...extra,
  });
  const run = (g, n) => { g.start(); for (let i = 0; i < n && !g.result; i++) g.tick(); };

  // flow
  let g = tiny();
  run(g, 100);
  check(count(g, CHOC) === g.total, 'poured chocolate lands on the floor and stays');
  let g2 = tiny((x) => x.rect(0, 40, 30, 2));
  run(g2, 100);
  check(count(g2, CHOC) === g2.total, 'a shelf catches the pour');
  check(g.lost === 0, 'nothing is lost off a closed floor');

  // slopes carry chocolate
  g = tiny((x) => ramp(x, 5, 20, 60));
  run(g, 700);
  check(g.lost === 0 && g.grid.get(140, 166) !== WALL, 'a ramp lets chocolate slide down');

  // the same plan always gives the same pour
  const a = tiny((x) => ramp(x, 5, 20, 60)), b = tiny((x) => ramp(x, 5, 20, 60));
  run(a, 200); run(b, 200);
  check(a.grid.m.every((v, i) => v === b.grid.m[i]), 'the same plan gives the same pour');

  // placing helpers
  g = tiny();
  g.place(planHelper({ type: 'heat', x: 50, y: 50 }));
  check(g.left('heat') === 1, 'placing a helper uses one up');
  check(throwsPlacement(() => g.place(planHelper({ type: 'heat', x: 50, y: 85 }))), 'a helper cannot go inside a wall');
  check(throwsPlacement(() => g.place(planHelper({ type: 'pipe', x: 10, y: 10, x2: 100, y2: 10 }))), 'a pipe that is too long is refused');
  g = tiny(null, { deflect: 1 });
  g.place(planHelper({ type: 'deflect', x: 50, y: 50, dir: 1 }));
  check(throwsPlacement(() => g.place(planHelper({ type: 'deflect', x: 90, y: 50, dir: 1 }))), 'you cannot place more helpers than you have');
  g.remove(g.helpers[0].id);
  check(g.left('deflect') === 1 && count(g, PADDLE) === 0, 'removing a helper gives it back and clears its paddle');

  // live play: crew can be placed and picked up while the chocolate runs
  g = tiny(null, { deflect: 1, heat: 2 });
  g.start();
  for (let i = 0; i < 20; i++) g.tick();
  g.place(planHelper({ type: 'deflect', x: 10, y: 30, dir: 1 }));
  check(count(g, PADDLE) === 2 * PADDLE_HALF + 1, 'a deflector can be placed while it pours');
  const dropAt = g.helpers[0];
  g.remove(dropAt.id);
  check(count(g, PADDLE) === 0, 'picking it up clears its slide');
  check(throwsPlacement(() => g.place(planHelper({ type: 'deflect', x: 10, y: 30, dir: 1 }))), 'a crew member you picked up rests before the same kind can be placed again');
  g.place(planHelper({ type: 'heat', x: 80, y: 40 }));
  check(g.helpers.length === 1, 'but another kind of crew is not resting');
  for (let i = 0; i < COOLDOWN + 1; i++) g.tick();
  g.place(planHelper({ type: 'deflect', x: 10, y: 30, dir: 1 }));
  check(g.helpers.length === 2, 'and after the rest it can be placed again');

  // a helper dropped into the stream pushes the chocolate aside
  g = tiny(null, { deflect: 1 });
  g.start();
  for (let i = 0; i < 30; i++) g.tick();
  const stream = [...Array(W * H).keys()].filter((i) => g.grid.m[i] === CHOC)[0];
  g.place({ type: 'deflect', x: stream % W, y: Math.floor(stream / W), dir: 1 });
  check(count(g, PADDLE) === 2 * PADDLE_HALF + 1, 'a deflector can be dropped on top of falling chocolate');

  // reset starts the level again with no crew
  g = tiny();
  g.place(planHelper({ type: 'deflect', x: 50, y: 50, dir: 1 }));
  run(g, 50);
  g.reset();
  check(count(g, CHOC) === 0 && count(g, PADDLE) === 0 && g.helpers.length === 0 && !g.running, 'reset starts the level over with no crew');

  // losing the moment the vat cannot be filled
  g = tiny((x) => x.clear(0, 85, 160, 5), {}, { need: 25 });   // no floor at all: everything spills
  run(g, 300);
  check(g.result === 'lost' && /wasted/.test(g.reason) && g.time < 300, 'the level is lost as soon as too much has spilled');

  // level events
  g = tiny(null, {}, { events: [{ at: 1, kind: 'hole', x: 100, y: 85, w: 10, h: 5, warn: 'TEST' }, { at: 2, kind: 'spout', x: 100, y: 4 }] });
  g.start();
  for (let i = 0; i < 30 - 80; i++) g.tick();
  check(g.warning === null || g.warning.text === 'TEST', 'a warning shows only near an event');
  for (let i = 0; i < 31; i++) g.tick();
  check(g.grid.get(300, 260) === EMPTY && g.pending.length === 1, 'a hole event opens the floor');
  for (let i = 0; i < 30; i++) g.tick();
  check(g.spouts.length === 2, 'a spout event adds a second spout');

  // helpers
  g = tiny((x) => x.rect(0, 40, 30, 2));
  g.place(planHelper({ type: 'solid', x: 10, y: 38 }));
  run(g, 100);
  check(count(g, SET) > 0 && count(g, SET) <= SOLID_CHARGE, 'a solidifier sets chocolate, up to its charge');

  g = tiny((x) => x.rect(0, 40, 30, 2), {}, { total: 120 });
  g.place(planHelper({ type: 'guzzle', x: 10, y: 38 }));
  run(g, 200);
  check(g.helpers[0].burst, 'a guzzler bursts once it has swallowed enough');

  g = tiny((x) => { x.rect(0, 40, 30, 2); x.rect(14, 37, 1, 2, SOFT); });
  g.place(planHelper({ type: 'heat', x: 13, y: 38 }));
  run(g, 60);
  check(count(g, SOFT) === 0, 'a heater melts wafer');

  // ---- every level ----
  // A scripted solution is a list of actions: { at: seconds, place: helper } or { at, take: type } (pick that crew up).
  const P = (at, place) => ({ at, place });
  const SOLUTIONS = [
    [P(0, { type: 'deflect', x: 37, y: 60, dir: 1 })],
    [P(0, { type: 'pipe', x: 30, y: 48, x2: 45, y2: 60 })],
    [P(0, { type: 'heat', x: 34, y: 53 })],
    [P(0, { type: 'solid', x: 52.5, y: 60 })],
    [P(0, { type: 'guzzle', x: 34, y: 53 })],
    [P(0, { type: 'deflect', x: 37, y: 60, dir: 1 }), P(0, { type: 'deflect', x: 47, y: 76, dir: 1 })],
    [P(0, { type: 'solid', x: 50.33, y: 60 }), { at: 10, take: 'solid' }, P(13, { type: 'solid', x: 62.33, y: 60 })],
    [P(0, { type: 'pipe', x: 24, y: 27, x2: 42, y2: 44 }), P(0, { type: 'pipe', x: 49, y: 52, x2: 67, y2: 69 })],
    [P(0, { type: 'solid', x: 52.5, y: 60 }), P(0, { type: 'pipe', x: 83, y: 62, x2: 100, y2: 76 }), { at: 12, take: 'solid' }, P(17, { type: 'solid', x: 64.33, y: 60 })],
  ];
  const playScript = (lv, script) => {
    const game = new Game(lv);
    const queue = script.slice().sort((x, y) => x.at - y.at);
    const apply = () => {
      while (queue.length && queue[0].at * TPS <= game.time) {
        const act = queue.shift();
        if (act.place) game.place(planHelper(act.place));
        else game.remove(game.helpers.find((h) => h.type === act.take).id);
      }
    };
    apply();
    game.start();
    for (let i = 0; i < 30 * lv.time && !game.result; i++) { apply(); game.tick(); }
    return game;
  };
  check(SOLUTIONS.length === LEVELS.length, 'every level has a scripted solution');
  LEVELS.forEach((lv, i) => {
    let built = true;
    try { new Game(lv); } catch (e) { built = false; print(e.message); }
    check(built, `${lv.name}: builds`);
    const none = new Game(lv);
    run(none, 30 * lv.time);
    check(none.result === 'lost', `${lv.name}: doing nothing loses (${none.shown(none.saved)}/${lv.need})`);
    const solved = playScript(lv, SOLUTIONS[i]);
    check(solved.result === 'won', `${lv.name}: the scripted plan wins (${solved.shown(solved.saved)}/${lv.need}, ${solved.reason})`);
    const places = SOLUTIONS[i].filter((a) => a.place);
    if (places.length > 1) {   // every helper in a multi-helper plan is needed
      const last = places[places.length - 1];
      const short = playScript(lv, SOLUTIONS[i].filter((a) => a !== last));
      check(short.result === 'lost', `${lv.name}: the plan with the last helper missing loses (${short.shown(short.saved)}/${lv.need})`);
    }
  });

  print(`DONE failures=${failures}`);
  return failures;
}
