'use strict';
// Rules, room puzzles and a solver-played full game. Run with tests/run-checks.sh.
const out = [];
let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; out.push('FAIL: ' + msg); } else out.push('ok: ' + msg); };
const info = (msg) => out.push('info: ' + msg);
window.addEventListener('error', (e) => { failures++; out.push('ERROR: ' + e.message + ' @' + e.filename + ':' + e.lineno); });

// A tiny game with one hand-made room, so each rule can be tested on its own.
function mini(height, objects, exits = {}) {
  const spec = { id: objects.join('').includes('$') ? 'observatory' : 'testroom', name: 'Test', col: 0, row: 0, exits, height, objects, width: height[0].length, rows: height.length, caption: '' };
  const game = createGame();
  game.rooms[0] = createRoomState(spec, 0);
  const s = game.rooms[0].start;
  game.hero.room = 0; game.hero.x = s ? s.x : 0; game.hero.y = s ? s.y : 0; game.hero.entry = { x: game.hero.x, y: game.hero.y };
  game.hazards = false; game.events.length = 0;
  return game;
}
const room0 = (g) => g.rooms[0];
const hero = (g) => `${g.hero.x},${g.hero.y}`;
const events = (g) => g.events.map((e) => e.t);

(async () => {
try {
  // ---- walking and levels ----
  {
    const g = mini(['...'], ['S..']);
    check(walk(g, 'E').ok && hero(g) === '1,0', 'walk: moves one square');
    check(walk(g, 'E').ok && hero(g) === '2,0', 'walk: and another');
    check(!walk(g, 'E').ok && events(g).includes('bump'), 'walk: the edge of the room stops you with a bump');
    const h = mini(['.12'], ['S..']);
    check(walk(h, 'E').ok && hero(h) === '1,0', 'level: you step up one level on your own');
    check(walk(h, 'E').ok && hero(h) === '2,0', 'level: and another');
    const j = mini(['.2.'], ['S..']);
    check(!walk(j, 'E').ok && hero(j) === '0,0', 'level: you cannot step up two levels');
    const k = mini(['2.'], ['S.']);
    check(walk(k, 'E').ok && hero(k) === '1,0', 'level: you can step down any distance');
    const w = mini(['.#.'], ['S..']);
    check(!walk(w, 'E').ok, 'walk: a wall stops you');
    const pit = mini(['.x.'], ['S..']);
    check(!walk(pit, 'E').ok, 'pit: you cannot walk into a pit');
  }
  // ---- pushing and stacking ----
  {
    const g = mini(['.....'], ['S*...']);
    check(walk(g, 'E').kind === 'push' && room0(g).crates[0][2] === 1 && room0(g).crates[0][1] === 0 && hero(g) === '1,0', 'push: walking into a crate pushes it, and you follow');
    walk(g, 'E'); walk(g, 'E');
    check(room0(g).crates[0][4] === 1 && hero(g) === '3,0', 'push: it slides along');
    check(!walk(g, 'E').ok && room0(g).crates[0][4] === 1, 'push: but not off the edge of the room');
    const w = mini(['..#..'], ['S*...']);
    check(!walk(w, 'E').ok, 'push: or into a wall');
    const flat = mini(['.....'], ['S**..']);
    check(!walk(flat, 'E').ok && room0(flat).crates[0][1] === 1, 'push: a crate cannot be shoved on top of another on the flat floor');
    const stack = mini(['11..'], ['S**.']);
    check(walk(stack, 'E').kind === 'push' && room0(stack).crates[0][2] === 2 && room0(stack).crates[0][1] === 0, 'stack: a crate pushed off a ledge lands on top of the crate below (a stack of 2)');
    check(surface(room0(stack), 2, 0) === 2 && heroLevel(stack) === 1, 'stack: surface height counts the crates');
    const full = mini(['33..'], ['S*..']); room0(full).crates[0][2] = 3;
    check(!walk(full, 'E').ok && room0(full).crates[0][2] === 3, `stack: no more than ${MAX_STACK} high`);
    const uphill = mini(['...1'], ['S*..']); walk(uphill, 'E');
    check(room0(uphill).crates[0][2] === 1 && !walk(uphill, 'E').ok && room0(uphill).crates[0][3] === 0, 'push: a crate cannot be pushed uphill onto a higher floor');
    const ledge = mini(['11...'], ['S*...']);
    walk(ledge, 'E');
    check(room0(ledge).crates[0][2] === 1 && room0(ledge).h[0][2] === 0 && events(ledge).includes('push'), 'drop: a crate pushed off a ledge lands on the lower floor');
    check(!walk(ledge, 'E').ok, 'drop: and you cannot push it while you stand on the ledge above it');
    const below = mini(['.1.'], ['S*.']); room0(below).h[0][1] = 1;
    check(!walk(below, 'E').ok, 'level: you cannot push a crate that is on a higher level than you');
    const pit = mini(['...x.'], ['S*...']);
    walk(pit, 'E');
    check(walk(pit, 'E').kind === 'fill' && !room0(pit).pit[0][3] && room0(pit).crates[0][2] === 0 && events(pit).includes('fill'), 'pit: pushing a crate into a pit fills it, and the crate is used up');
    check(walk(pit, 'E').ok && hero(pit) === '3,0', 'pit: you can then walk across');
    const prot = mini(['.....'], ['S*..$']);
    walk(prot, 'E'); walk(prot, 'E');
    check(room0(prot).crates[0][3] === 1 && !walk(prot, 'E').ok, 'push: a crate cannot be pushed onto a part, so it can never be buried');
    const rob = mini(['.....'], ['S*>..']);
    check(!walk(rob, 'E').ok, 'push: a crate cannot be pushed into a robot');
  }
  // ---- hopping ----
  {
    const g = mini(['..x..'], ['S....']);
    walk(g, 'E');
    check(hop(g, 'E').kind === 'leap' && hero(g) === '3,0', 'hop: leaps over a pit to the square beyond');
    const g2 = mini(['.....'], ['S.~..']);
    walk(g2, 'E');
    check(hop(g2, 'E').kind === 'leap' && hero(g2) === '3,0', 'hop: leaps over a steam vent');
    const g3 = mini(['.....'], ['S.>..']);
    walk(g3, 'E');
    check(hop(g3, 'E').kind === 'leap' && hero(g3) === '3,0', 'hop: leaps over a robot');
    const g4 = mini(['...'], ['S*.']);
    check(hop(g4, 'E').kind === 'hop' && hero(g4) === '1,0' && heroLevel(g4) === 1, 'hop: hops up onto a crate (you now stand a level higher)');
    check(walk(g4, 'E').ok && hero(g4) === '2,0' && heroLevel(g4) === 0, 'hop: and you can walk off the far side');
    const g5 = mini(['..2'], ['S*.']);
    hop(g5, 'E');
    check(hero(g5) === '1,0' && walk(g5, 'E').ok && hero(g5) === '2,0', 'stairs: a crate (level 1) is a step up onto a level 2 floor');
    const g6 = mini(['..2'], ['S..']); walk(g6, 'E');
    check(!hop(g6, 'E').ok && hero(g6) === '1,0', 'hop: cannot hop up two levels');
    const g7 = mini(['.x3'], ['S..']);
    check(!hop(g7, 'E').ok && hero(g7) === '0,0', 'hop: cannot leap onto a landing that is too high');
    const g8 = mini(['.x#'], ['S..']);
    check(!hop(g8, 'E').ok, 'hop: cannot leap into a wall');
    const g9 = mini(['..'], ['S.']);
    check(hop(g9, 'E').kind === 'hop' && hero(g9) === '1,0', 'hop: on flat ground a hop is one square');
    const g10 = mini(['.1.'], ['S.*']); walk(g10, 'E');
    check(hero(g10) === '1,0' && hop(g10, 'E').ok && heroLevel(g10) === 1, 'hop: from a raised floor you can hop onto a crate beside it');
  }
  // ---- plates and doors ----
  {
    const g = mini(['........'], ['S*..a.A.']);
    const closed = (gg, x) => doorClosed(gg, room0(gg), x, 0);
    check(closed(g, 6), 'door: closed at the start');
    walk(g, 'E'); walk(g, 'E'); walk(g, 'E');
    check(room0(g).crates[0][4] === 1 && !closed(g, 6), 'door: a crate on the plate opens it');
    walk(g, 'E');
    check(room0(g).crates[0][5] === 1 && !closed(g, 6), 'door: it stays open while you stand on the plate yourself');
    const shut = mini(['...'], ['S*A']);
    check(!walk(shut, 'E').ok && room0(shut).crates[0][1] === 1, 'door: a crate cannot be pushed into a closed door');
    const g3 = mini(['......'], ['S.a..A']);
    walk(g3, 'E'); walk(g3, 'E');
    check(!closed(g3, 5), 'door: standing on the plate opens it too');
    walk(g3, 'E');
    check(closed(g3, 5), 'door: and it closes when you step off');
    walk(g3, 'E');
    check(!walk(g3, 'E').ok && hero(g3) === '4,0', 'door: a closed door stops you');
  }
  // ---- doorways between rooms ----
  {
    const g = createGame();
    g.hazards = false;
    check(g.hero.room === ROOM_INDEX.airlock && hero(g) === '0,3', 'start: in the Airlock at the start square');
    g.hero.x = 1; g.hero.y = 6; g.events.length = 0;
    const r = walk(g, 'S');
    check(r.kind === 'room' && g.hero.room === ROOM_INDEX.cafeteria && hero(g) === '1,0', 'doorway: leaving the Airlock by the south doorway arrives in the Cafeteria at the top');
    check(g.hero.entry.x === 1 && g.hero.entry.y === 0, 'doorway: the arrival square is remembered as the entry');
    check(g.events.some((e) => e.t === 'room' && e.first), 'doorway: the first visit is flagged');
    g.hero.x = 2; g.hero.y = 0;
    check(!walk(g, 'N').ok, 'doorway: the edge is solid where there is no doorway');
    g.hero.x = 1; g.hero.y = 0;
    check(walk(g, 'N').kind === 'room' && g.hero.room === ROOM_INDEX.airlock && hero(g) === '1,6', 'doorway: and back again');
    check(!g.events.filter((e) => e.t === 'room').slice(-1)[0].first, 'doorway: a second visit is not "first"');
  }
  // ---- parts and the rocket ----
  {
    const g = createGame(); g.hazards = false;
    const obs = ROOM_INDEX.observatory;
    g.hero.room = obs; g.hero.x = 6; g.hero.y = 2;
    walk(g, 'E');
    check(g.hero.carry.length === 1 && g.hero.carry[0] === 'nose' && g.events.some((e) => e.t === 'pickup'), 'part: walking onto it picks it up');
    check(g.rooms[obs].parts[0].taken, 'part: and it is marked taken');
    g.hero.carry = ['fins', 'panel', 'tank']; g.rooms[obs].parts[0].taken = false; g.hero.x = 7; g.hero.y = 2;
    g.hero.x = 6; g.hero.y = 2; g.events.length = 0;
    walk(g, 'E');
    check(g.hero.carry.length === 3 && g.events.some((e) => e.t === 'full') && !g.rooms[obs].parts[0].taken, 'part: your hands are full at 3, and the part stays where it is');
    const launch = ROOM_INDEX.launch;
    g.hero.room = launch; g.hero.x = 3; g.hero.y = 4; g.hero.face = 'E'; g.events.length = 0;
    check(walk(g, 'E').kind === 'deliver' && g.delivered.length === 3 && g.hero.carry.length === 0, 'rocket: walking into it delivers what you carry');
    g.hero.carry = ['nose', 'porthole', 'battery']; g.hero.x = 3; g.hero.y = 4;
    walk(g, 'E');
    check(g.over === 'win' && g.events.some((e) => e.t === 'win'), 'rocket: delivering all six parts wins the game');
    const e = createGame(); e.hero.room = launch; e.hero.x = 3; e.hero.y = 4;
    check(!walk(e, 'E').ok && e.rocketWin === undefined, 'rocket: with nothing to deliver, it just bumps');
  }
  // ---- robots, vents, hits and the clock ----
  {
    const g = mini(['.....'], ['S.>..']); g.hazards = true;
    const robot = room0(g).robots[0];
    check(robot.x === 2 && robot.dir === 'E', 'robot: starts where it was drawn, heading east');
    update(g, ROBOT_STEP + 0.01); check(robot.x === 3, 'robot: moves one square each step');
    update(g, ROBOT_STEP); update(g, ROBOT_STEP);
    check(robot.dir === 'W' && robot.x === 4, 'robot: turns round when it reaches the edge');
    const g2 = mini(['.....'], ['S.>.*']); g2.hazards = true; const r2 = room0(g2).robots[0];
    update(g2, ROBOT_STEP); update(g2, ROBOT_STEP);
    check(r2.dir === 'W', 'robot: turns round at a crate too (a crate can trap a robot)');
    // being caught
    const h = mini(['.....'], ['S>...']); h.hazards = true; h.time = 100;
    walk(h, 'E');
    check(h.time === 100 - HIT_PENALTY && hero(h) === '0,0' && h.events.some((e) => e.t === 'hit' && e.cause === 'robot'), `hit: stepping into a robot costs ${HIT_PENALTY} seconds and sends you back to the entry`);
    check(h.invuln > 0, 'hit: and gives you a moment of safety');
    walk(h, 'E'); walk(h, 'E');
    check(h.time === 100 - HIT_PENALTY, 'hit: no second penalty while you are safe');
    update(h, INVULN + 0.1);
    check(h.invuln === 0, 'hit: the safety wears off');
    // hop over a robot
    const j = mini(['.....'], ['S.>..']); j.hazards = true; j.time = 100; walk(j, 'E');
    j.hero.x = 1; j.hero.y = 0; j.hero.air = 0; j.time = 100; j.invuln = 0;
    hop(j, 'E');
    update(j, 0.05);
    check(j.time <= 100 && j.time > 100 - 1 && hero(j) === '3,0', 'hop: leaping over a robot costs nothing');
    // vents
    const v = mini(['....'], ['S~..']); v.hazards = true; v.time = 100;
    const vent = room0(v).vents[0];
    const states = new Set(); for (let t = 0; t < 4; t += 0.1) states.add(ventState(vent, t));
    check(states.has('off') && states.has('warn') && states.has('on'), 'vent: cycles through off, warning and blast');
    v.elapsed = VENT.off + VENT.warn + 0.1; walk(v, 'E');
    check(v.time === 100 - HIT_PENALTY, 'vent: standing on one during a blast costs time');
    const v2 = mini(['....'], ['S~..']); v2.hazards = true; v2.time = 100; v2.elapsed = 0.1; walk(v2, 'E');
    check(v2.time === 100 && hero(v2) === '1,0', 'vent: crossing while it is off is safe');
    const v3 = mini(['.....'], ['S*~..'].map((r) => r)); // a crate pushed onto a vent plugs it
    v3.hazards = true; v3.time = 100; walk(v3, 'E');
    v3.elapsed = VENT.off + VENT.warn + 0.1; v3.invuln = 0; update(v3, 0.01);
    check(room0(v3).crates[0][2] === 1 && v3.time > 99, 'vent: a crate on a vent plugs it');
    // the clock
    const c = mini(['....'], ['S...']); c.time = 1; update(c, 0.5); check(!c.over, 'clock: still going');
    update(c, 0.6); check(c.over === 'lose' && c.events.some((e) => e.t === 'lose'), 'clock: the saucers arrive when it hits zero');
    check(!walk(c, 'E').ok, 'clock: and nothing moves after that');
  }
  // ---- resetting a room ----
  {
    const g = mini(['....'], ['S*..']); g.time = 100;
    walk(g, 'E'); walk(g, 'E');
    resetRoom(g);
    check(room0(g).crates[0][1] === 1 && room0(g).crates[0][3] === 0 && hero(g) === '0,0' && g.time === 100 - RESET_PENALTY, `reset: puts the crates back, you at the entry, and costs ${RESET_PENALTY} seconds`);
    const p = createGame(); p.hazards = false; const obs = ROOM_INDEX.observatory;
    p.rooms[obs].parts[0].taken = true; p.hero.room = obs; p.hero.x = 1; p.hero.y = 1; p.hero.entry = { x: 0, y: 3 };
    resetRoom(p);
    check(p.rooms[obs].parts[0].taken, 'reset: a part you already have stays collected');
  }
  // ---- every room is solvable ----
  {
    for (const room of ROOMS) {
      const idx = ROOM_INDEX[room.id];
      const entries = [];
      if (room.objects.join('').includes('S')) { for (let y = 0; y < room.rows; y++) { const x = room.objects[y].indexOf('S'); if (x >= 0) entries.push({ x, y, label: 'start' }); } }
      for (const [dir, at] of Object.entries(room.exits)) { const [x, y] = exitTile(room, dir, at); entries.push({ x, y, label: `in via ${dir}` }); }
      const targets = Object.keys(room.exits).map((d) => ({ kind: 'exit', dir: d }));
      const part = PARTS.find((p) => p.room === room.id);
      if (part) targets.push({ kind: 'part', part });
      const lens = [];
      const reach = {}; // reach[from][to]
      let partOk = !part;
      for (const entry of entries) {
        for (const t of targets) {
          const tag = t.kind === 'exit' ? t.dir : 'part';
          if (t.kind === 'exit' && entry.label === `in via ${t.dir}`) continue;
          const g = createGame(); g.hazards = false;
          g.hero.room = idx; g.hero.x = entry.x; g.hero.y = entry.y; g.hero.entry = { x: entry.x, y: entry.y };
          const nIdx = t.kind === 'exit' ? ROOMS.findIndex((r) => r.col === room.col + { E: 1, W: -1, N: 0, S: 0 }[t.dir] && r.row === room.row + { N: -1, S: 1, E: 0, W: 0 }[t.dir]) : -1;
          const sol = t.kind === 'exit' ? solve(g, (gg) => gg.hero.room === nIdx) : solve(g, (gg) => gg.hero.carry.length > 0);
          reach[entry.label] = reach[entry.label] || {};
          reach[entry.label][tag] = !!sol;
          if (sol) { lens.push(sol.length); if (t.kind === 'part') partOk = true; }
        }
      }
      // some barriers only open from one side (a pit with no crates on the far side). That is a gate, not a trap, so each
      // pair of doorways must connect in at least one direction.
      const problems = [];
      const dirs = Object.keys(room.exits);
      for (let i = 0; i < dirs.length; i++) for (let j = i + 1; j < dirs.length; j++) {
        const a = dirs[i], b = dirs[j];
        if (!(reach[`in via ${a}`] && reach[`in via ${a}`][b]) && !(reach[`in via ${b}`] && reach[`in via ${b}`][a])) problems.push(`${a}-${b}`);
      }
      if (!partOk) problems.push('the part');
      check(problems.length === 0, `room ${room.name}: ${dirs.length} doorways${part ? ' and the ' + part.name : ''} all connect (${lens.length} routes, ${lens.length ? Math.min(...lens) + ' to ' + Math.max(...lens) : 'none'} moves)${problems.length ? ' CANNOT: ' + problems.join(', ') : ''}`);
      if (part) { const g = createGame(); g.hazards = false; g.hero.room = idx; const e0 = entries.find((e) => e.label !== 'start') || entries[0]; g.hero.x = e0.x; g.hero.y = e0.y; const sol = solve(g, (gg) => gg.hero.carry.length > 0); if (sol) info(`${room.id}: the ${part.id} takes ${sol.length} moves from ${e0.label}`); }
    }
  }
  // ---- a whole game, played by the solver ----
  {
    let result = null, err = null;
    try { result = botPlay(); } catch (e) { err = e; }
    if (err) { failures++; out.push('FAIL: the solver could not finish the game: ' + err.message); }
    else {
      const g = result.game;
      check(g.over === 'win' && g.delivered.length === PARTS.length, `game: the solver collected all ${PARTS.length} parts and launched the rocket`);
      const secs = g.steps * STEP_TIME;
      info(`full game by the solver: ${g.steps} moves (about ${Math.round(secs)} seconds of walking, against ${TIME_LIMIT}); resets: ${result.log.filter((l) => l.startsWith('reset')).length}`);
      check(secs < TIME_LIMIT * 0.55, `game: a perfect run takes about ${Math.round(secs)} of the ${TIME_LIMIT} seconds, leaving room for mistakes`);
    }
  }
  // ---- every screen draws ----
  {
    const tryRender = (label) => { try { render(); return true; } catch (e) { failures++; out.push('FAIL: drawing ' + label + ': ' + e.stack); return false; } };
    app.mode = 'title'; check(tryRender('the title screen'), 'screen: title draws');
    app.mode = 'help'; for (let p = 0; p < HELP_PAGES; p++) { app.help.page = p; tryRender('help ' + p); } check(true, 'screen: all help pages draw');
    app.mode = 'brief'; check(tryRender('the briefing'), 'screen: the briefing draws');
    startGame();
    for (const room of ROOMS) {
      const g = app.game, idx = ROOM_INDEX[room.id];
      g.hero.room = idx; const e = Object.entries(room.exits)[0]; const [ex, ey] = exitTile(room, e[0], e[1]); g.hero.x = ex; g.hero.y = ey; snapHero(g);
      for (let i = 0; i < 5; i++) stepGame(1 / 60);
      if (!tryRender('room ' + room.id)) break;
    }
    check(true, `screen: all ${ROOMS.length} rooms draw (floors, platforms, walls, pits, doors, plates, vents, robots, crates and the rocket)`);
    app.mode = 'paused'; check(tryRender('pause'), 'screen: pause draws');
    app.game.over = 'win'; app.game.delivered = PARTS.map((p) => p.id); app.mode = 'win'; app.endTimer = 0; tryRender('win'); app.endTimer = 300; tryRender('win late');
    app.game.over = 'lose'; app.mode = 'lose'; tryRender('lose'); check(true, 'screen: launch and saucer endings draw');
    for (const pid of PARTS.map((p) => p.id)) { app.mode = 'play'; app.game.over = null; app.game.delivered = []; app.game.hero.carry = [pid]; tryRender('carrying ' + pid); }
    check(true, 'screen: every part icon draws');
  }

  // ---- every room has its own look ----
  {
    check(Object.keys(THEMES).sort().join() === ROOMS.map((r) => r.id).sort().join(), 'look: every room has a theme, and there are no stray ones');
    check(ROOMS.every((r) => WALL_STYLES.includes(THEMES[r.id].wall) && typeof WALL_DRAW[THEMES[r.id].wall] === 'function'), 'look: every theme uses a wall style that exists');
    check(ROOMS.every((r) => typeof BACKDROP_DRAW[THEMES[r.id].backdrop] === 'function'), 'look: every theme uses a backdrop that exists');
    const floors = new Set(ROOMS.map((r) => THEMES[r.id].floor[0])), walls = new Set(ROOMS.map((r) => THEMES[r.id].wall)), backs = new Set(ROOMS.map((r) => THEMES[r.id].backdrop));
    check(floors.size === ROOMS.length && backs.size === ROOMS.length, `look: ${floors.size} different floors and ${backs.size} different backdrops across ${ROOMS.length} rooms`);
    info(`wall styles in use: ${[...walls].join(', ')}`);
    const coilRooms = ROOMS.filter((r) => THEMES[r.id].props.some((p) => p.type === 'tesla') || THEMES[r.id].wall === 'tesla').map((r) => r.id);
    check(coilRooms.length >= 4, `look: tesla coils in ${coilRooms.length} rooms (${coilRooms.join(', ')})`);
    check(THEMES.reactor.props.length === 0 && THEMES.reactor.wall === 'tesla', 'look: the Reactor\'s walls are the coils');
    // the arcs reference real props
    check(ROOMS.every((r) => THEMES[r.id].arcs.every(([a, b]) => THEMES[r.id].props[a] && THEMES[r.id].props[b])), 'look: every arc joins two coils that exist');
    startGame();
    for (const room of ROOMS) { app.game.hero.room = ROOM_INDEX[room.id]; for (const tick of [0, 5, 31, 77, 142]) { app.tick = tick; render(); } }
    check(true, 'look: all themes draw at several moments of their animation');
  }

  // ---- the monochrome look ----
  {
    check(look.supported, 'mono: this browser can do the monochrome look');
    check(loadLook() === 'colour' || (() => { try { return localStorage.getItem(LOOK_KEY) !== null; } catch (e) { return false; } })(), 'look: colour is the default (monochrome is only used if you choose it)');
    // colour conversion
    look.hue = '#00ff00';
    const conv = (role, c) => { look.role = role; const v = toneColor(c); look.role = null; return parseColor(v); };
    const white = conv('actor', '#ffffff'), dark = conv('actor', '#202020'), sceneryWhite = conv('scenery', '#ffffff'), sceneryDark = conv('scenery', '#000000');
    check(white.r > 230 && white.g > 230 && white.b > 220, 'mono: an actor\'s white stays near white');
    check(dark.r > 120 && dark.r < 185, 'mono: even an actor\'s dark detail stays fairly light, so it is easy to see');
    check(sceneryWhite.g > sceneryWhite.r + 30 && sceneryWhite.g < 200, 'mono: scenery is tinted with the room\'s hue and kept dim');
    check(sceneryDark.g < 40, 'mono: and its shadows are dark');
    check(conv('ink', '#ff8800').r === 0 && conv('ink', '#ff8800').g === 0, 'mono: the outline colour is black');
    check(conv('actor', 'rgba(255,0,0,0.5)').a === 0.5, 'mono: transparency is kept');
    look.role = null; look.hue = '#8fd0ff';
    const saveFill = ctx.fillStyle; ctx.fillStyle = '#123456'; check(ctx.fillStyle === '#123456', 'mono: with no role, colours are left alone'); ctx.fillStyle = saveFill;
    look.role = 'actor'; ctx.fillStyle = '#ff0000'; const toned = ctx.fillStyle; look.role = null;
    check(toned !== '#ff0000', 'mono: with a role set, colours are converted as they are set');
    const grad = ctx.createLinearGradient(0, 0, 10, 10); look.role = 'scenery'; grad.addColorStop(0, '#ff0000'); look.role = null; ctx.fillStyle = grad;
    check(true, 'mono: gradients can be toned too');
    // the same scene in both looks: the player stands out much more in mono
    startGame(); const g = app.game; g.hazards = false; g.hero.x = 1; g.hero.y = 3; g.hero.face = 'E'; snapHero(g); app.tick = 40;
    const lum = (cx, cy) => { const d = ctx.getImageData(Math.round(cx) - 3, Math.round(cy) - 3, 6, 6).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; return sum / (d.length / 4) / 255; };
    const room = cur(g), o = roomOrigin(room);
    const heroAt = () => { const p = project(o, 1, 3); return { x: p.sx, y: p.sy + TILE_H / 2 + 4 - 18 }; };
    const floorAt = () => { const p = project(o, 1, 1); return { x: p.sx, y: p.sy + TILE_H / 2 }; }; // a floor square beyond the hero
    const contrast = (mono) => { look.mono = mono; app.mode = 'play'; render(); const h = heroAt(), f = floorAt(); return lum(h.x, h.y) - lum(f.x, f.y); };
    const cMono = contrast(true), cColour = contrast(false);
    info(`player contrast against the floor: monochrome ${cMono.toFixed(2)}, colour ${cColour.toFixed(2)}`);
    check(cMono > 0.35, `mono: the player is much brighter than the floor (by ${cMono.toFixed(2)} of full brightness)`);
    check(cMono > cColour + 0.1, 'mono: and clearly easier to see than in colour');
    // everything draws in both looks
    let drewAll = true;
    for (const mono of [true, false]) {
      look.mono = mono;
      for (const room2 of ROOMS) {
        g.hero.room = ROOM_INDEX[room2.id]; const e = Object.entries(room2.exits)[0]; const [ex, ey] = exitTile(room2, e[0], e[1]); g.hero.x = ex; g.hero.y = ey; snapHero(g);
        try { app.tick += 7; render(); } catch (err) { drewAll = false; failures++; out.push(`FAIL: drawing ${room2.id} in ${mono ? 'mono' : 'colour'}: ${err.message}`); }
        if (look.role !== null) { drewAll = false; failures++; out.push('FAIL: a draw role was left set after drawing ' + room2.id); }
      }
    }
    check(drewAll, 'mono: all 12 rooms draw in both looks, and no draw role is left set behind');
    check(ROOMS.every((r) => /^#[0-9a-f]{6}$/i.test(THEMES[r.id].mono)) && new Set(ROOMS.map((r) => THEMES[r.id].mono)).size >= 10, 'mono: every room has its own hue');
    // the V key
    startGame(); look.mono = true;
    const saved = (() => { try { return localStorage.getItem(LOOK_KEY); } catch (e) { return null; } })();
    check(onKeyDown('v') && !look.mono && app.caption && app.caption.text.includes('Colour'), 'mono: V switches to colour and says so');
    check(onKeyDown('V') && look.mono && app.caption.text.includes('Monochrome'), 'mono: and back again');
    onKeyDown('v'); let stored = null; try { stored = localStorage.getItem(LOOK_KEY); } catch (e) { stored = 'colour'; }
    check(stored === 'colour', 'mono: the choice is remembered');
    app.mode = 'title'; check(onKeyDown('v') && look.mono, 'mono: V works on the title screen too');
    app.mode = 'help'; check(onKeyDown('v') && !look.mono, 'mono: and in the help');
    look.mono = true; setLook(true, false);
    try { if (saved !== null) localStorage.setItem(LOOK_KEY, saved); } catch (e) { /* nothing to restore */ }
    look.mono = true;
  }

  // ---- seeing what is going on, in colour ----
  {
    look.mono = false;
    startGame(); const g = app.game; g.hazards = false;
    g.hero.room = ROOM_INDEX.control;
    const place = (x, y) => { g.hero.x = x; g.hero.y = y; snapHero(g); return heroHidden(g); };
    check(place(2, 3) === true, 'visible: standing behind a wall bank, you are flagged as hidden (so the wall in front of you fades)');
    check(place(2, 6) === false, 'visible: out in front of it you are not');
    g.hero.room = ROOM_INDEX.airlock; check(place(0, 6) === false, 'visible: in the open, with nothing in front of you, you are not "hidden"');
    g.hero.room = ROOM_INDEX.observatory; check(place(5, 2) === true, 'visible: behind a raised platform is hidden too');
    g.hero.room = ROOM_INDEX.control;
    place(2, 3); let ok = true; try { render(); } catch (e) { ok = false; failures++; out.push('FAIL: drawing the x-ray: ' + e.stack); } check(ok && look.role === null, 'visible: the see-through walls draw and leave no draw role set');
    // the things in front of you are drawn see-through: the hero's pixel is brighter than with them solid
    const o = roomOrigin(cur(g)), p = project(o, 2, 3);
    const region = () => ctx.getImageData(Math.round(p.sx) - 30, Math.round(p.sy) - 50, 60, 70).data;
    check(heroOccluders(g).length > 0 && heroOccluders(g).every((c) => c.x + c.y > 5), 'visible: the squares in front of you are found');
    app.mode = 'play'; render(); const faded = Array.from(region());
    const realOccluders = heroOccluders; heroOccluders = () => []; render(); const solid = Array.from(region()); heroOccluders = realOccluders;
    check(look.role === null && ctx.globalAlpha === 1, 'visible: fading leaves no draw role or transparency set behind');
    let changed = 0; for (let i = 0; i < faded.length; i += 4) if (Math.abs(faded[i] - solid[i]) + Math.abs(faded[i + 1] - solid[i + 1]) + Math.abs(faded[i + 2] - solid[i + 2]) > 30) changed++;
    info(`pixels that change when the walls in front are see-through: ${changed}`);
    check(changed > 150, 'visible: the walls in front of you really are drawn differently (see-through) when they cover you');
    { // crates in front of you stay solid
      g.hero.room = ROOM_INDEX.airlock; g.hero.x = 0; g.hero.y = 6; snapHero(g);
      const rm = cur(g), keep = rm.crates[6][1]; rm.crates[6][1] = 2;
      check(!heroOccluders(g).some((c) => c.x === 1 && c.y === 6), 'visible: a crate stack in front of you is not faded');
      rm.crates[6][1] = keep;
    }
    check(WALL_LEVELS <= 1.8, 'visible: walls are lower than before, so they hide less');
  }

  // ---- the flow, with real key presses ----
  {
    app.mode = 'title';
    check(onKeyDown('Enter') && app.mode === 'brief', 'flow: Enter on the title opens the mission briefing');
    check(onKeyDown('Enter') && app.mode === 'play' && app.game && !app.game.over, 'flow: Enter again starts the game');
    app.mode = 'title';
    check(onKeyDown('h') && app.mode === 'help' && app.help.page === 0, 'flow: H opens the help');
    onKeyDown('ArrowRight'); onKeyDown('ArrowRight'); check(app.help.page === 2, 'flow: Right turns the pages');
    onKeyDown('ArrowLeft'); check(app.help.page === 1, 'flow: Left turns back');
    onKeyDown('Escape'); check(app.mode === 'title', 'flow: Esc leaves the help');
    app.mode = 'help'; app.help.page = 2; onKeyDown('Enter'); check(app.mode === 'title', 'flow: Enter on the last page returns to the title');
    app.mode = 'title'; render(); const hb = app.hits.find((h) => h.id === 'help'); onClick(hb.x + 5, hb.y + 5); check(app.mode === 'help', 'flow: clicking "How to play" opens it');
    app.mode = 'title'; render(); onClick(900, 600); check(app.mode === 'brief', 'flow: clicking anywhere else starts');
    onKeyDown('Enter');
  }

  // ---- playing, with held keys ----
  {
    startGame(); const g = app.game; g.hazards = false;
    const runFor = (seconds) => { for (let i = 0; i < seconds * 60; i++) stepGame(1 / 60); };
    check(`${g.hero.x},${g.hero.y}` === '0,3', 'play: you start in the Airlock');
    onKeyDown('ArrowRight'); runFor(0.55);
    check(g.hero.x >= 2 && g.hero.x <= 4, `play: holding Right walks and pushes (now at x=${g.hero.x}; each step takes ${STEP_TIME}s)`);
    check(g.rooms[0].crates[3][3] === 1 || g.rooms[0].crates[3][4] === 1 || !g.rooms[0].pit[3][4], 'play: the crate got pushed along');
    onKeyUp('ArrowRight'); const x1 = g.hero.x; runFor(0.5);
    check(g.hero.x === x1, 'play: letting go stops you');
    const h2 = createGame(); app.game = h2; h2.hazards = false; h2.hero.x = 3; h2.hero.y = 3; h2.rooms[0].crates[3][2] = 0; snapHero(h2); app.cooldown = 0; app.held = [];
    h2.hero.face = 'E'; onKeyDown(' '); runFor(0.4);
    check(h2.hero.x === 5 && h2.hero.y === 3, 'play: Space hops over the pit in the direction you face');
    app.mode = 'play'; onKeyDown('p'); check(app.mode === 'paused', 'play: P pauses');
    const tBefore = h2.time; for (let i = 0; i < 120; i++) stepGame(1 / 60); check(h2.time === tBefore, 'play: the clock stops while paused');
    onKeyDown('p'); check(app.mode === 'play', 'play: and P carries on');
    const t0 = h2.time; onKeyDown('r'); check(Math.abs(h2.time - (t0 - RESET_PENALTY)) < 0.01 && app.caption && app.caption.text.includes('reset'), 'play: R resets the room (-10 s) and says so');
    const t1 = h2.time; for (let i = 0; i < 60; i++) stepGame(1 / 60); check(Math.abs((t1 - h2.time) - 1) < 0.05, 'play: the clock counts down in real time');
  }

  // ---- being caught, parts and winning ----
  {
    startGame(); let g = app.game;
    g.hero.room = ROOM_INDEX.repair; g.hero.x = 0; g.hero.y = 1; g.hero.entry = { x: 0, y: 3 }; snapHero(g);
    const r = g.rooms[ROOM_INDEX.repair].robots[0]; r.x = 1; r.y = 1; r.px = 1; r.py = 1; r.dir = 'S';
    const t0 = g.time; g.events.length = 0; app.held = []; app.cooldown = 0; g.invuln = 0; g.hero.face = 'E';
    onKeyDown('ArrowRight'); stepGame(1 / 60); onKeyUp('ArrowRight');
    check(Math.abs(g.time - (t0 - HIT_PENALTY)) < 0.1 && g.hero.y === 3 && app.flash > 0 && !!app.caption, 'hit: a robot costs 20 seconds, flashes the screen, shows a line and sends you to the door');
    startGame(); g = app.game; g.hazards = false;
    g.hero.room = ROOM_INDEX.observatory; g.hero.x = 6; g.hero.y = 2; snapHero(g); app.cooldown = 0; app.held = []; g.hero.face = 'E';
    onKeyDown('ArrowRight'); stepGame(1 / 60); onKeyUp('ArrowRight');
    check(g.hero.carry.includes('nose') && !!app.caption && app.caption.text.includes('Nose cone'), 'parts: picking one up says so in the narrator\'s voice');
    g.hero.room = ROOM_INDEX.launch; g.hero.x = 3; g.hero.y = 4; snapHero(g); app.cooldown = 0; g.hero.face = 'E';
    onKeyDown('ArrowRight'); stepGame(1 / 60); onKeyUp('ArrowRight');
    check(g.delivered.length === 1 && app.caption.text.includes('1 of 6'), 'parts: handing it over to the rocket counts it');
    g.hero.carry = PARTS.map((p) => p.id).filter((id) => id !== 'nose'); g.hero.x = 3; g.hero.y = 4; snapHero(g); app.cooldown = 0; g.time = 123.4;
    const bestBefore = app.best; app.best = 0;
    onKeyDown('ArrowRight'); for (let i = 0; i < 200 && app.mode === 'play'; i++) stepGame(1 / 60); onKeyUp('ArrowRight');
    check(app.mode === 'win' && app.newBest && app.best === 124, `win: delivering the sixth part launches the rocket and records the best time (${app.best}s)`);
    check(!onKeyDown('Enter'), 'win: Enter is ignored for the first moment, so a stray key press does not skip the ending');
    app.endTimer = 100; check(onKeyDown('Enter') && app.mode === 'brief', 'win: then Enter goes round again');
    app.best = bestBefore;
    startGame(); g = app.game; g.time = 0.05; for (let i = 0; i < 10; i++) stepGame(1 / 60);
    for (let i = 0; i < 80 && app.mode === 'play'; i++) stepGame(1 / 60);
    check(app.mode === 'lose' && g.over === 'lose', 'lose: when the clock runs out the saucers arrive');
    startGame(); g = app.game; g.time = 30.01; app.caption = null; for (let i = 0; i < 3; i++) stepGame(1 / 60);
    check(!!app.caption && app.caption.text.includes('Thirty seconds'), 'clock: a warning at thirty seconds');
  }

  // ---- the solver's whole game, replayed through the real keyboard and clock ----
  {
    startGame(); const g = app.game; g.hazards = false;
    const arrow = { N: 'ArrowUp', E: 'ArrowRight', S: 'ArrowDown', W: 'ArrowLeft' };
    let frames = 0, replayed = 0;
    for (const act of BOT_ACTIONS) {
      while (app.cooldown > 0 && frames < 400000) { stepGame(1 / 60); frames++; }
      if (act[0] === 'reset') { onKeyDown('r'); }
      else if (act[0] === 'walk') { onKeyDown(arrow[act[1]]); stepGame(1 / 60); frames++; onKeyUp(arrow[act[1]]); }
      else { g.hero.face = act[1]; onKeyDown(' '); stepGame(1 / 60); frames++; }
      replayed++;
    }
    for (let i = 0; i < 400 && app.mode === 'play'; i++) { stepGame(1 / 60); frames++; }
    const secs = (frames / 60).toFixed(0);
    check(app.mode === 'win' && g.delivered.length === PARTS.length, `replay: the solver's ${replayed} moves, played through real key presses and the real clock (${secs} seconds), win the game`);
    info(`replayed ${replayed} moves in ${secs} game seconds, ${Math.round(g.time)} left on the clock`);
  }

  // ---- every event the rules can send is understood ----
  {
    startGame(); const g = app.game;
    const sample = [{ t: 'step' }, { t: 'hop' }, { t: 'push', fromX: 1, fromY: 3, toX: 2, toY: 3, drop: 1 }, { t: 'fill', x: 4, y: 3 }, { t: 'bump', why: 'blocked' }, { t: 'bump', why: 'no parts' }, { t: 'pickup', part: 'nose' }, { t: 'full' },
      { t: 'deliver', parts: ['nose'], total: 1 }, { t: 'deliver', parts: ['nose'], total: 6 }, { t: 'hit', cause: 'robot' }, { t: 'room', room: 1, first: true }, { t: 'reset' }, { t: 'lose' }];
    let okAll = true;
    try { g.events.push(...sample); g.hero.room = ROOM_INDEX.launch; processEvents(g); } catch (e) { okAll = false; failures++; out.push('FAIL: events: ' + e.message); }
    check(okAll, 'events: every kind the rules send is handled by the screen code');
    let threw = false; try { g.events.push({ t: 'nonsense' }); processEvents(g); } catch (e) { threw = true; g.events.length = 0; }
    check(threw, 'events: an unknown event is an error, not silently ignored');
  }

  // ---- sound and music ----
  {
    Sound.init();
    if (Sound.ctx) {
      let bad = 0;
      for (const name of Object.keys(SOUNDS)) { try { Sound.play(name); } catch (e) { bad++; out.push('FAIL: sound ' + name + ': ' + e.message); failures++; } }
      check(bad === 0, `sound: all ${Object.keys(SOUNDS).length} effects play without errors`);
      musicUpdate(true); check(musicState.playing, 'music: starts when wanted'); musicUpdate(false); check(!musicState.playing, 'music: stops when not wanted');
    } else out.push('skip: no Web Audio here');
    check(MUSIC_SONG.length === 256, 'music: the tune is 16 bars of 16 steps');
    const realUpdate = musicUpdate; musicUpdate = () => {};
    const realCtx = Sound.ctx, rate = 22050, seconds = MUSIC_SONG.length * MUSIC_STEP + 1.5;
    const off = new OfflineAudioContext(1, Math.ceil(rate * seconds), rate);
    Sound.ctx = off; musicState.gain = null; musicState.playing = false;
    musicStart();
    for (let st = 0; st < MUSIC_SONG.length; st++) musicScheduleStep(st, 0.08 + st * MUSIC_STEP);
    const data = (await off.startRendering()).getChannelData(0);
    let peak = 0, sumSq = 0;
    for (let i = 0; i < data.length; i++) { peak = Math.max(peak, Math.abs(data[i])); sumSq += data[i] * data[i]; }
    Sound.ctx = realCtx; musicState.gain = null; musicState.playing = false; musicUpdate = realUpdate;
    info(`music: ${MUSIC_BPM} bpm, ${seconds.toFixed(1)}s loop, peak ${peak.toFixed(2)}, rms ${Math.sqrt(sumSq / data.length).toFixed(3)}`);
    check(peak > 0.05 && peak < 0.8, `music renders ${seconds.toFixed(1)}s, audible and not clipping (peak ${peak.toFixed(2)})`);
  }
} catch (e) {
  failures++; out.push('EXCEPTION: ' + e.stack);
}
document.getElementById('out').textContent = out.join('\n') + '\nDONE failures=' + failures;
const problems = out.filter((l) => /^(FAIL|ERROR|EXCEPTION)/.test(l));
const infos = out.filter((l) => l.startsWith('info:')).map((l) => l.slice(6));
document.title = `DONE failures=${failures}${problems.length ? ' :: ' + problems.join(' | ') : ''} :: ${infos.join(' || ')}`;
})();
