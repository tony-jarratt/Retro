'use strict';
const noop = () => {};
const out = [];
let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; out.push('FAIL: ' + msg); } else out.push('ok: ' + msg); };
const origLog = console.log; console.log = (...a) => out.push(a.join(' '));
window.addEventListener('error', (e) => { failures++; out.push('ERROR: ' + e.message + ' @' + e.filename + ':' + e.lineno); });
(async () => {
try {
// ---- 1. reachability ----
function reachable(lv) {
  const standable = (c, r) => !isWall(lv, c, r) && hasFloor(lv, c, r + 1);
  const seen = new Set();
  const key = (c, r) => `${c},${r}`;
  const queue = [[lv.start.c, lv.start.r]];
  const push = (c, r) => { if (!seen.has(key(c, r)) && !isWall(lv, c, r)) { seen.add(key(c, r)); queue.push([c, r]); } };
  seen.add(key(lv.start.c, lv.start.r));
  while (queue.length) {
    const [c, r] = queue.shift();
    const ladderHere = isLadder(lv, c, r);
    if (ladderHere) {
      if (isLadder(lv, c, r - 1) || standable(c, r - 1)) push(c, r - 1);
      if (isLadder(lv, c, r + 1) || standable(c, r + 1)) push(c, r + 1);
    }
    if (standable(c, r) && isLadder(lv, c, r + 1)) push(c, r + 1);
    if (!standable(c, r)) continue;
    for (const d of [-1, 1]) {
      if (isWall(lv, c + d, r)) continue;
      if (standable(c + d, r)) push(c + d, r);
      else { let rr = r; while (!standable(c + d, rr) && rr < ROWS) rr++; if (rr < ROWS) push(c + d, rr); } // walk off and fall
      for (const k of [2, 3]) if (standable(c + d * k, r)) push(c + d * k, r); // jump a 1-2 tile gap
    }
  }
  return (cell) => seen.has(key(cell.c, cell.r));
}

LEVELS.forEach((lv) => {
  const ok = reachable(lv);
  check(ok(lv.tree), `${lv.name}: tree reachable`);
  check(ok(lv.station), `${lv.name}: station reachable`);
  for (const it of lv.items) check(ok(it), `${lv.name}: item ${it.type} at (${it.c},${it.r}) reachable`);
});

// ---- bad data raises typed errors ----
const bad = JSON.parse(JSON.stringify(LEVEL_SPECS[0]));
bad.items[0] = ['g', 3, 3];
try { buildLevel(bad, 0); check(false, 'floating item rejected'); } catch (e) { check(e.name === 'LevelError', `floating item rejected: ${e.message}`); }

// ---- 2. physics ----
{
  const lv = LEVELS[0];
  const p = createPlayer(lv);
  const x0 = p.x, y0 = p.y;
  updatePlayer(p, lv, { right: true, jump: true });
  let frames = 1;
  while (p.state === 'air' && frames < 200) { updatePlayer(p, lv, {}); frames++; }
  check(p.state === 'ground' && p.y === y0, `jump lands back on the floor (${frames} frames)`);
  console.log(`   jump distance ${(p.x - x0).toFixed(0)}px`);
  check(p.x - x0 > 80 && p.x - x0 < 100, 'jump covers about 3 tiles');
  // climb the ladder at col 13 (floor 15 -> ground)
  const q = createPlayer(lv);
  q.x = 13.5 * T; q.y = 19 * T; q.groundY = q.y;
  for (let i = 0; i < 120; i++) updatePlayer(q, lv, { up: true });
  check(q.state === 'ground' && q.y === 15 * T, `climbs ladder to the floor above (y=${q.y}, state=${q.state})`);
  for (let i = 0; i < 120; i++) updatePlayer(q, lv, { down: true });
  check(q.state === 'ground' && q.y === 19 * T, `climbs back down (y=${q.y}, state=${q.state})`);
}

// ---- ice ----
{
  const lv = LEVELS[1]; // kitchen: ice on floor row 7, cols 1-18 (ladder top at col 15 stays normal)
  check(tileAt(lv, 5, 7) === 'i' && tileAt(lv, 15, 7) === 'T', 'kitchen has ice, with the ladder top left normal');
  const p = createPlayer(lv);
  p.x = 3.5 * T; p.y = 7 * T; p.groundY = p.y;
  for (let i = 0; i < 60; i++) updatePlayer(p, lv, { right: true });
  const xHeld = p.x, slideHeld = p.slide;
  check(slideHeld > 2.5, `ice: speed builds up while holding right (${slideHeld.toFixed(2)})`);
  for (let i = 0; i < 20; i++) updatePlayer(p, lv, {});
  check(p.slide > 1 && p.x > xHeld + 30, `ice: keeps sliding after releasing (slide ${p.slide.toFixed(2)}, +${(p.x - xHeld).toFixed(0)}px)`);
  for (let i = 0; i < 600 && p.slide !== 0; i++) updatePlayer(p, lv, {});
  check(p.slide === 0 || p.state !== 'ground', 'ice: eventually stops (or leaves the ice)');
  // a jump off ice carries momentum
  const q = createPlayer(lv);
  q.x = 3.5 * T; q.y = 7 * T; q.groundY = q.y;
  for (let i = 0; i < 50; i++) updatePlayer(q, lv, { right: true });
  const jx = q.x;
  updatePlayer(q, lv, { jump: true });
  let n = 0; while (q.state === 'air' && n++ < 200) updatePlayer(q, lv, {});
  check(q.x - jx > 110, `ice: jump carries the slide (${(q.x - jx).toFixed(0)}px vs 94px from a standing start)`);
  // normal floor is unchanged
  const w = createPlayer(LEVELS[0]);
  for (let i = 0; i < 10; i++) updatePlayer(w, LEVELS[0], { right: true });
  for (let i = 0; i < 2; i++) updatePlayer(w, LEVELS[0], {});
  const wx = w.x; updatePlayer(w, LEVELS[0], {});
  check(wx === w.x, 'normal floor: stops dead when you let go');
}

// ---- baubles ----
{
  const lv = LEVELS[0]; // living room: bauble lane on floor row 11, cols 30 -> 2
  check(lv.baubles.length === 1 && lv.baubles[0].dir === -1, 'living room has one leftward bauble lane');
  startGame();
  startLevel(0);
  setMode('play');
  const pl = G.player;
  pl.x = 15.5 * T; pl.y = 11 * T; pl.groundY = pl.y; pl.invuln = 0;
  G.baubles = [{ x: pl.x + 14, floorY: 11 * T, dir: -1, x1: 2.5 * T, color: '#f00', spin: 0, age: 40 }];
  const livesBefore = G.lives;
  const hit = updateObstacles(G, pl);
  check(hit !== null, 'bauble hits an elf standing in its path');
  bonkPlayer(pl, hit.x);
  check(pl.stun > 0 && pl.bonk > 0 && G.lives === livesBefore, 'bonk stuns but costs no life');
  const x0 = pl.x;
  let guard = 0; while (pl.stun > 0 && guard++ < 100) updatePlayer(pl, lv, { right: true }); // input is ignored while stunned
  check(pl.x < x0 - 15 && pl.x > x0 - 45 && pl.stun === 0, `bonk knocks the elf away from the bauble (${(pl.x - x0).toFixed(0)}px) and the stun wears off`);
  // a jumping elf clears it
  const jp = createPlayer(lv); jp.x = 15.5 * T; jp.y = 11 * T; jp.groundY = jp.y; jp.state = 'air'; jp.y = 11 * T - 40;
  check(!baubleHitsPlayer({ x: jp.x, floorY: 11 * T, dir: 1 }, jp), 'an elf 40px up is clear of a bauble');
  // spawner timing
  G.baubles = []; G.spawners = createSpawners(lv);
  G.spawners[0].timer = 2;
  const far = createPlayer(lv);
  updateObstacles(G, far); updateObstacles(G, far);
  check(G.baubles.length === 1, 'spawner releases a bauble when its timer runs out');
  const near = createPlayer(lv); near.x = lv.baubles[0].x0; near.y = 11 * T;
  G.baubles = []; G.spawners[0].timer = 1;
  updateObstacles(G, near);
  check(G.baubles.length === 0 && G.spawners[0].timer === 30, 'spawner waits instead of dropping a bauble on the elf');
  startLevel(0); setMode('intro', 0);
}

// ---- bad ice / bauble data raises typed errors ----
{
  const expectError = (mutate, what) => {
    const spec = JSON.parse(JSON.stringify(LEVEL_SPECS[1]));
    mutate(spec);
    try { buildLevel(spec, 1); check(false, `${what} rejected`); } catch (e) { check(e.name === 'LevelError', `${what} rejected: ${e.message}`); }
  };
  expectError((sp) => { sp.floors[0].ice = [[11, 14]]; }, 'ice over a gap');
  expectError((sp) => { sp.baubles = [{ row: 3, from: 2, to: 20, every: 200 }]; }, 'bauble over a gap');
  expectError((sp) => { sp.baubles = [{ row: 7, from: 2, to: 10, every: 20 }]; }, 'bauble with a tiny interval');
}

// ---- scenery and window events ----
{
  for (const lv of LEVELS) check(renderBackground(lv).windows.length >= 2, `${lv.name}: background has windows for events`);
  startLevel(1); setMode('play');
  G.winTimer = 1;
  step();
  check(G.winEvents.length === 1, 'a window event starts when the timer runs out');
  const type = G.winEvents[0].type, dur = G.winEvents[0].dur;
  for (let i = 0; i < dur + 2; i++) { G.winTimer = 999; step(); }
  check(G.winEvents.length === 0, `the ${type} event ends and is removed`);
  startLevel(0); setMode('intro', 0);
}

// ---- title music ----
{
  check(MUSIC_SONG.length === 256, 'title tune is 16 bars of 16 steps');
  check(MUSIC_SONG.filter((e) => e.lead).length >= 80, 'tune has a lead melody');
  Sound.init();
  if (Sound.ctx) {
    musicUpdate(true);
    check(musicState.playing && musicState.step >= 1, 'music starts and queues notes when wanted');
    musicUpdate(false);
    check(!musicState.playing, 'music stops when not wanted');
    Sound.muted = true; musicUpdate(true);
    check(!musicState.playing, 'music does not start while muted');
    Sound.muted = false;
  } else out.push('skip: no Web Audio here, so the live music start/stop checks were skipped');
  // Render the whole loop offline: it should be audible and not clip.
  const realUpdate = musicUpdate; musicUpdate = () => {}; // keep the game's own frame loop from touching the offline render
  const realCtx = Sound.ctx, rate = 22050, seconds = MUSIC_SONG.length * MUSIC_STEP + 1.5;
  const off = new OfflineAudioContext(1, Math.ceil(rate * seconds), rate);
  Sound.ctx = off; musicState.gain = null; musicState.playing = false;
  musicStart();
  for (let st = 0; st < MUSIC_SONG.length; st++) musicScheduleStep(st, 0.08 + st * MUSIC_STEP);
  const data = (await off.startRendering()).getChannelData(0);
  let peak = 0, sumSq = 0;
  for (let i = 0; i < data.length; i++) { peak = Math.max(peak, Math.abs(data[i])); sumSq += data[i] * data[i]; }
  Sound.ctx = realCtx; musicState.gain = null; musicState.playing = false; musicUpdate = realUpdate;
  const rms = Math.sqrt(sumSq / data.length);
  check(peak > 0.05 && peak < 0.8, `music renders ${seconds.toFixed(1)}s, audible and not clipping (peak ${peak.toFixed(2)}, rms ${rms.toFixed(3)})`);
}

// ---- 3. scripted playthrough with random input ----
{
  const press = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code }));
  press('keydown', 'Enter');
  const codes = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];
  let levelsSeen = new Set();
  for (let i = 0; i < 40000; i++) {
    if (i % 25 === 0) { for (const c of codes) press('keyup', c); press('keydown', codes[Math.floor(Math.random() * codes.length)]); }
    if (i % 3000 === 2999) press('keydown', 'KeyN'); // play-test key: skip level
    step();
    if (i % 5 === 0) render();
    if (G.lv) levelsSeen.add(G.lv.index);
    if (G.mode === 'gameOver' || G.mode === 'victory') press('keydown', 'Enter');
  }
  check(true, `random playthrough ran 40000 steps without exceptions (levels visited: ${[...levelsSeen].join(',')})`);
}




} catch (e) { failures++; out.push('EXCEPTION: ' + e.stack); }
document.getElementById('out').textContent = out.join('\n') + '\nDONE failures=' + failures;
// run-checks.sh reads the result from the page title (the music check needs real time to render audio).
const problems = out.filter((l) => /^(FAIL|ERROR|EXCEPTION)/.test(l));
const musicLine = out.find((l) => l.includes('music renders')) || 'music check did not run';
document.title = `DONE failures=${failures}${problems.length ? ' :: ' + problems.join(' | ') : ''} :: ${musicLine}`;
})();
