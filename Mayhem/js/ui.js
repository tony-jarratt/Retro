'use strict';

// The game flow and everything that waits for a player. Each phase of a round is an async function that
// awaits input (or a short pause for animation), so the code reads in the same order as the rules:
// pick spells in secret, cast them, move and fight, then the end of the round.

const app = {
  mode: 'title',          // title | setup | play
  tick: 0, fatal: null, fast: false,
  game: null, setup: null,
  banner: null, status: '', info: '', hint: '', phaseLabel: '',
  highlight: new Map(),   // "x,y" -> 'move' | 'attack' | 'target' | 'ready'
  cursor: { x: 7, y: 4 }, showCursor: false, hoverCell: null,
  selected: null, current: null, showEndTurn: false,
  overlay: null,          // { kind: 'spellbook' | 'handoff' | 'gameOver', ... }
  hits: [], particles: [], floaters: [], projectiles: [], views: new Map(),
  handler: null, sleepers: [],
};

// ---- waiting ----
function sleep(ms) {
  if (app.fast) { if (app.onSleep) app.onSleep(); return Promise.resolve(); } // tests use onSleep to keep animating
  return new Promise((resolve) => app.sleepers.push({ left: ms, resolve }));
}
function updateSleepers(dtMs) {
  for (const s of app.sleepers) s.left -= dtMs;
  const due = app.sleepers.filter((s) => s.left <= 0);
  app.sleepers = app.sleepers.filter((s) => s.left > 0);
  for (const s of due) s.resolve();
}
// Wait for a player. makeHandler(done) returns { onKey(key, event) -> bool, onClick(x, y), onMove(x, y) }.
function waitFor(makeHandler) {
  return new Promise((resolve) => {
    app.handler = makeHandler((value) => { app.handler = null; resolve(value); });
  });
}
function hitAtPoint(px, py) {
  for (let i = app.hits.length - 1; i >= 0; i--) if (inRect(px, py, app.hits[i])) return app.hits[i];
  return null;
}
function showBanner(textStr, color = '#ffe066', sub = '', frames = 90) { app.banner = { text: textStr, color, sub, ttl: frames, ttl0: frames }; }

// ---- turning rule events into pictures and sounds ----
function unitById(id) { return app.game.units.find((u) => u.id === id) || null; }

function handleEvent(e) {
  const g = app.game;
  switch (e.t) {
    case 'cast': { const c = cellCenter(e.x, e.y); spawnSparkles(c.x, c.y + 10, 8); Sound.play('cast'); break; }
    case 'fizzle': {
      const c = cellCenter(e.x, e.y);
      spawnFloater(c.x, c.y - 30, 'Fizzle!', '#ffb0b0', 24); spawnPuff(c.x, c.y + 10);
      showBanner(`${g.wizards[e.wizard].name} fizzles!`, '#ffb0b0', e.message, 120);
      Sound.play('fizzle');
      break;
    }
    case 'summon': {
      const u = unitById(e.unit);
      if (u) viewOf(u).pop = 0;
      const c = cellCenter(e.x, e.y); spawnSparkles(c.x, c.y + 12, 12); Sound.play('summon');
      break;
    }
    case 'throw': spawnProjectile(cellCenter(e.fromX, e.fromY), cellCenter(e.toX, e.toY), e.kind); Sound.play('throw'); break;
    case 'attack': {
      const u = unitById(e.attacker);
      if (u) viewOf(u).lunge = { dx: Math.sign(e.toX - e.fromX), dy: Math.sign(e.toY - e.fromY), t: 0 };
      if (e.ranged) spawnProjectile(cellCenter(e.fromX, e.fromY), cellCenter(e.toX, e.toY), 'pizza');
      break;
    }
    case 'hit': {
      const c = cellCenter(e.x, e.y);
      if (e.win) {
        spawnConfetti(c.x, c.y + 8, 20); spawnSplat(c.x, c.y + 8, '#f2c94c', 8);
        spawnFloater(c.x, c.y - 26, HIT_WORDS[Math.floor(Math.random() * HIT_WORDS.length)], '#ffe066', 26);
        Sound.play('hit');
      } else {
        spawnFloater(c.x, c.y - 26, MISS_WORDS[Math.floor(Math.random() * MISS_WORDS.length)], '#ffffff', 22);
        Sound.play('miss');
      }
      break;
    }
    case 'poof': {
      const c = cellCenter(e.x, e.y);
      spawnPuff(c.x, c.y + 8); spawnConfetti(c.x, c.y + 8, 14, [g.wizards[e.owner].color, '#ffffff', '#ffd84d']);
      Sound.play('poof');
      break;
    }
    case 'ink': { for (const c of e.cells) { const q = cellCenter(c.x, c.y); spawnSplat(q.x, q.y + 10, '#4a3a90', 9); } Sound.play('ink'); break; }
    case 'passage': {
      for (const d of [e.a, e.b]) { const q = cellCenter(d.x, d.y); spawnSparkles(q.x, q.y, 14, '#c9a0ff'); }
      Sound.play('passage');
      break;
    }
    case 'slide': { const q = cellCenter(e.toX, e.toY); spawnFloater(q.x, q.y - 34, 'Oh dear.', '#bcb0ff', 22); Sound.play('slide'); break; }
    case 'teleport': {
      for (const [x, y] of [[e.fromX, e.fromY], [e.toX, e.toY]]) { const q = cellCenter(x, y); spawnSparkles(q.x, q.y, 12, '#c9a0ff'); }
      Sound.play('teleport');
      break;
    }
    case 'terrainGone': { const q = cellCenter(e.x, e.y); spawnPuff(q.x, q.y + 8); break; }
    case 'tickle': { const c = cellCenter(e.x, e.y); spawnFloater(c.x, c.y - 30, 'Awkward...', '#ff9ac8', 24); Sound.play('tickle'); break; }
    case 'buff': {
      const c = cellCenter(e.x, e.y); spawnSparkles(c.x, c.y, 14);
      spawnFloater(c.x, c.y - 34, { shield: 'Coffin lid!', wand: 'Dodgy.', wings: 'Flap. Flap.' }[e.buff], '#ffe066', 22);
      Sound.play('buff');
      break;
    }
    case 'blob': { const c = cellCenter(e.x, e.y); spawnSplat(c.x, c.y + 10, '#6fe27a', 14); Sound.play('blob'); break; }
    case 'blobSpread': { const c = cellCenter(e.x, e.y); spawnSplat(c.x, c.y + 10, '#6fe27a', 6); break; }
    case 'blobEat': { const c = cellCenter(e.x, e.y); spawnSplat(c.x, c.y + 10, '#6fe27a', 10); spawnFloater(c.x, c.y - 24, 'Gulp!', '#8df09a', 22); Sound.play('hit'); break; }
    case 'wizardOut': showBanner(`${g.wizards[e.wizard].name} is sent to detention!`, '#ffb0b0', '', 130); Sound.play('out'); break;
    case 'bell': showBanner('The school bell rings!', '#ffe066', 'The most pets wins', 140); Sound.play('bell'); break;
    case 'move': Sound.play('step'); break;
    case 'over': break;
    default: throw new Error(`handleEvent: unknown event "${e.t}"`);
  }
}

function drain() {
  const g = app.game;
  for (const e of g.events) handleEvent(e);
  g.events.length = 0;
}

// ---- title and setup ----
// The title screen. Resolves to 'play' or 'help'.
function runTitle() {
  app.mode = 'title';
  return waitFor((done) => ({
    onKey: (key) => {
      if (key === 'Enter' || key === ' ') { Sound.play('choose'); done('play'); return true; }
      if (key === 'h' || key === 'H' || key === 'F1') { Sound.play('tick'); done('help'); return true; }
      return false;
    },
    onClick: (px, py) => {
      const h = hitAtPoint(px, py);
      if (h && h.id === 'help') { Sound.play('tick'); done('help'); } else { Sound.play('choose'); done('play'); }
    },
    onMove: () => {},
  }));
}

// The "How to play" pages. Resolves when the player is finished.
function runHelp() {
  app.mode = 'help';
  app.help = { page: 0 };
  return waitFor((done) => {
    const go = (d) => {
      const n = app.help.page + d;
      if (n < 0) return;
      if (n >= HELP_PAGES) { Sound.play('choose'); done(); return; }
      app.help.page = n; Sound.play('tick');
    };
    return {
      onKey(key) {
        if (key === 'ArrowRight' || key === 'Enter' || key === ' ') { go(1); return true; }
        if (key === 'ArrowLeft') { go(-1); return true; }
        if (key === 'Escape' || key === 'Backspace') { Sound.play('choose'); done(); return true; }
        return false;
      },
      onClick(px, py) {
        const h = hitAtPoint(px, py);
        if (!h) return;
        if (h.id === 'helpPrev') go(-1); else if (h.id === 'helpNext') go(1);
      },
      onMove() {},
    };
  });
}

async function titleFlow() {
  for (;;) {
    const choice = await runTitle();
    if (choice !== 'help') return;
    await runHelp();
  }
}

function defaultSetup() { return { humans: 1, ai: 2, names: DEFAULT_HUMAN_NAMES.slice(), colors: [0, 1, 2, 3], row: 0 }; }

function runSetup() {
  app.mode = 'setup';
  const s = app.setup || (app.setup = defaultSetup());
  s.row = 0;
  return waitFor((done) => {
    const rows = () => 2 + s.humans + 1; // two counters, a name row for each human, then START
    const clamp = () => {
      s.humans = Math.max(1, Math.min(MAX_HUMANS, s.humans));
      s.ai = Math.max(Math.max(0, MIN_WIZARDS - s.humans), Math.min(MAX_WIZARDS - s.humans, s.ai));
      s.row = Math.min(s.row, rows() - 1);
    };
    const start = () => {
      Sound.play('choose');
      done({ humans: s.humans, ai: s.ai, names: s.names.slice(0, s.humans), colors: s.colors.slice(0, s.humans) });
    };
    const usedByOthers = (i, c) => s.colors.slice(0, s.humans).some((x, j) => j !== i && x === c);
    const cycleColor = (i, d) => {
      let c = s.colors[i];
      for (let n = 0; n < ROBE_COLORS.length; n++) { c = (c + d + ROBE_COLORS.length) % ROBE_COLORS.length; if (!usedByOthers(i, c)) break; }
      s.colors[i] = c;
    };
    const setColor = (i, c) => {
      const other = s.colors.findIndex((x, j) => j !== i && j < s.humans && x === c);
      if (other >= 0) s.colors[other] = s.colors[i]; // swap with whoever had it
      s.colors[i] = c;
    };
    return {
      onKey(key) {
        const nameRow = s.row >= 2 && s.row < 2 + s.humans ? s.row - 2 : -1;
        if (key === 'Escape') { Sound.play('tick'); done(null); return true; }
        if (key === 'ArrowDown' || key === 'Tab') s.row = (s.row + 1) % rows();
        else if (key === 'ArrowUp') s.row = (s.row - 1 + rows()) % rows();
        else if (key === 'ArrowLeft' || key === 'ArrowRight') {
          const d = key === 'ArrowRight' ? 1 : -1;
          if (s.row === 0) s.humans += d; else if (s.row === 1) s.ai += d; else if (nameRow >= 0) cycleColor(nameRow, d); else return true;
        } else if (key === 'Enter') { if (s.row === rows() - 1) { start(); return true; } s.row++; }
        else if (nameRow >= 0 && key === 'Backspace') s.names[nameRow] = s.names[nameRow].slice(0, -1);
        else if (nameRow >= 0 && key.length === 1 && /[A-Za-z0-9 '.!-]/.test(key) && s.names[nameRow].length < NAME_MAX) s.names[nameRow] += key;
        else return nameRow >= 0 && key.length === 1; // swallow other letters on a name row so "m" does not mute
        clamp(); Sound.play('tick');
        return true;
      },
      onClick(px, py) {
        const h = hitAtPoint(px, py);
        if (!h) return;
        if (h.id === 'h-') s.humans--; else if (h.id === 'h+') s.humans++;
        else if (h.id === 'a-') s.ai--; else if (h.id === 'a+') s.ai++;
        else if (h.id === 'startgame') { start(); return; }
        else if (h.id.startsWith('row:')) s.row = Number(h.id.slice(4));
        else if (h.id.startsWith('name:')) s.row = 2 + Number(h.id.slice(5));
        else if (h.id.startsWith('color:')) { const [, i, j] = h.id.split(':').map(Number); setColor(i, j); s.row = 2 + i; }
        clamp(); Sound.play('tick');
      },
      onMove() {},
    };
  });
}

function shuffled(list) { return new Rng((Math.random() * 4294967296) >>> 0).shuffle(list); }

function buildPlayers(cfg) {
  const humanColors = cfg.colors.slice(0, cfg.humans);
  const freeColors = ROBE_COLORS.map((c, i) => i).filter((i) => !humanColors.includes(i));
  const aiNames = shuffled(AI_NAMES.filter((n) => !cfg.names.includes(n)));
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const players = [];
  for (let i = 0; i < cfg.humans; i++) {
    players.push({ name: (cfg.names[i] || '').trim() || DEFAULT_HUMAN_NAMES[i], color: ROBE_COLORS[humanColors[i]].hex, hat: pick(HATS), familiar: pick(FAMILIARS), human: true });
  }
  for (let j = 0; j < cfg.ai; j++) {
    players.push({ name: aiNames[j], color: ROBE_COLORS[freeColors[j]].hex, hat: pick(HATS), familiar: pick(FAMILIARS), human: false });
  }
  return shuffled(players); // so the human pupils are not always in the same corners
}

// ---- screens that wait ----
function handoff(w, line) {
  app.overlay = { kind: 'handoff', wizard: w, line };
  app.status = `Pass the keyboard to ${w.name}.`; app.hint = 'Press Enter when only this pupil is looking.';
  return waitFor((done) => ({
    onKey: (key) => { if (key === 'Enter' || key === ' ') { Sound.play('choose'); app.overlay = null; done(); return true; } return false; },
    onClick: () => { Sound.play('choose'); app.overlay = null; done(); },
    onMove: () => {},
  }));
}

function chooseSpell(w) {
  const g = app.game;
  const cards = w.hand.map((item) => ({ item, avail: item.used ? { ok: false, reason: 'Used' } : spellAvailable(g, w, item.spell) }));
  const total = cards.length + 1; // the last slot is "can't be bothered"
  const usable = (i) => i === cards.length || (!cards[i].item.used && cards[i].avail.ok);
  const ov = app.overlay = { kind: 'spellbook', wizard: w, cards, index: Math.max(0, cards.findIndex((c, i) => usable(i))) };
  app.current = w.id;
  app.status = `${w.name}: choose a spell. Everyone else, no peeking!`;
  app.hint = 'Arrow keys or mouse to look, Enter or click to choose.';
  return waitFor((done) => {
    const pick = () => {
      if (!usable(ov.index)) { Sound.play('tick'); app.status = 'That card cannot be used right now. Pick another.'; return; }
      Sound.play('choose'); app.overlay = null;
      done(ov.index === cards.length ? null : cards[ov.index].item.spell);
    };
    return {
      onKey(key) {
        const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 };
        if (key in moves) { const n = ov.index + moves[key]; if (n >= 0 && n < total) { ov.index = n; Sound.play('tick'); } return true; }
        if (key === 'Enter' || key === ' ') { pick(); return true; }
        return false;
      },
      onMove(px, py) { const h = hitAtPoint(px, py); if (h && h.id.startsWith('card:')) ov.index = Number(h.id.slice(5)); },
      onClick(px, py) { const h = hitAtPoint(px, py); if (h && h.id.startsWith('card:')) { ov.index = Number(h.id.slice(5)); pick(); } },
    };
  });
}

// Pick one of the given squares. Returns the {x, y} chosen.
function chooseCell(w, cells, prompt) {
  const valid = new Set(cells.map((c) => `${c.x},${c.y}`));
  app.highlight.clear();
  for (const k of valid) app.highlight.set(k, 'target');
  app.status = prompt; app.hint = 'Click a gold square, or use the arrow keys and press Enter.';
  const me = unitOf(app.game, w);
  app.cursor = { x: me.x, y: me.y };
  return waitFor((done) => {
    const choose = (c) => {
      if (!valid.has(`${c.x},${c.y}`)) { Sound.play('tick'); return; }
      app.highlight.clear(); app.showCursor = false; Sound.play('choose'); done({ x: c.x, y: c.y });
    };
    return {
      onKey(key) {
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
        if (d) { app.showCursor = true; app.cursor = { x: Math.max(0, Math.min(COLS - 1, app.cursor.x + d[0])), y: Math.max(0, Math.min(ROWS - 1, app.cursor.y + d[1])) }; Sound.play('tick'); return true; }
        if (key === 'Enter' || key === ' ') { choose(app.cursor); return true; }
        return false;
      },
      onMove(px, py) { const c = cellFromPx(px, py); if (c) { app.cursor = c; app.showCursor = false; } },
      onClick(px, py) { const c = cellFromPx(px, py); if (c) choose(c); },
    };
  });
}

// ---- a human's move turn ----
function humanMoveTurn(w) {
  const g = app.game;
  return waitFor((done) => {
    const st = { sel: null, busy: false, finished: false, auto: false };
    const mine = () => g.units.filter((u) => u.owner === w.id);
    const actionable = () => mine().filter((u) => unitCanAct(g, u));
    const finish = () => {
      if (st.finished) return;
      st.finished = true; app.highlight.clear(); app.selected = null; app.showEndTurn = false; done();
    };
    const refresh = () => {
      app.highlight.clear();
      if (st.sel && !g.units.includes(st.sel)) st.sel = null;
      app.selected = st.sel ? st.sel.id : null;
      app.showEndTurn = true;
      if (st.sel) {
        for (const c of reachableCells(g, st.sel).values()) app.highlight.set(`${c.x},${c.y}`, 'move');
        for (const t of attackTargets(g, st.sel)) app.highlight.set(`${t.x},${t.y}`, 'attack');
        app.status = `${describeUnit(st.sel)}`;
        app.hint = 'Blue squares: move there. Red squares: attack. Esc to let go.';
      } else {
        for (const u of actionable()) app.highlight.set(`${u.x},${u.y}`, 'ready');
        app.status = `${w.name}: pick a pet or your pupil (the glowing squares).`;
        app.hint = 'Click or Enter to pick - Tab: next pet - Space or End turn: finish';
      }
      if (!g.over && actionable().length === 0 && !st.auto) {
        st.auto = true;
        app.status = `${w.name} has nothing left to move.`;
        sleep(500).then(finish);
      }
    };
    const useCell = async (cell) => {
      if (st.busy || st.finished) return;
      st.busy = true;
      try {
        const u = unitAt(g, cell.x, cell.y);
        if (u && u.owner === w.id && unitCanAct(g, u)) { st.sel = st.sel === u ? null : u; Sound.play('tick'); }
        else if (st.sel) {
          const sel = st.sel;
          if (reachableCells(g, sel).has(`${cell.x},${cell.y}`)) {
            moveUnit(g, sel, cell.x, cell.y); drain(); await sleep(350);
            if (attackTargets(g, sel).length === 0) st.sel = null; // stay selected only if it can still attack
          } else {
            const target = attackTargets(g, sel).find((t) => t.x === cell.x && t.y === cell.y);
            if (target) { attackWith(g, sel, target); drain(); await sleep(750); st.sel = null; }
            else st.sel = null;
          }
        } else if (u && u.owner === w.id) {
          app.status = u.fresh ? 'That one only just arrived. It can move next round.' : u.giggle > 0 ? 'That one is frozen in embarrassment!' : 'That one has nothing to do right now.';
        }
      } catch (err) {
        if (!(err instanceof RuleError)) throw err;
        console.warn('Move not allowed:', err.message);
        app.status = err.message;
      } finally {
        st.busy = false;
      }
      if (g.over) { finish(); return; }
      refresh();
    };
    refresh();
    return {
      onMove(px, py) { const c = cellFromPx(px, py); if (c) { app.cursor = c; app.showCursor = false; } },
      onClick(px, py) {
        const h = hitAtPoint(px, py);
        if (h && h.id === 'endturn') { finish(); return; }
        const c = cellFromPx(px, py);
        if (c) { app.cursor = c; useCell(c); }
      },
      onKey(key) {
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
        if (d) { app.showCursor = true; app.cursor = { x: Math.max(0, Math.min(COLS - 1, app.cursor.x + d[0])), y: Math.max(0, Math.min(ROWS - 1, app.cursor.y + d[1])) }; return true; }
        if (key === 'Enter') { useCell(app.cursor); return true; }
        if (key === ' ') { finish(); return true; }
        if (key === 'Escape') { st.sel = null; refresh(); return true; }
        if (key === 'Tab') {
          const list = actionable();
          if (list.length) { const i = list.indexOf(st.sel); st.sel = list[(i + 1) % list.length]; app.cursor = { x: st.sel.x, y: st.sel.y }; app.showCursor = true; refresh(); }
          return true;
        }
        return false;
      },
    };
  });
}

async function aiMoveTurn(w) {
  const g = app.game;
  const units = g.units.filter((u) => u.owner === w.id).sort((a, b) => (a.type === 'wizard') - (b.type === 'wizard'));
  for (const u of units) {
    if (!w.alive || g.over) return;
    if (!g.units.includes(u)) continue;
    const plan = aiPlanUnit(g, u);
    if (!plan || (!plan.to && !plan.attack)) continue;
    app.selected = u.id; await sleep(220);
    if (plan.to) { moveUnit(g, u, plan.to.x, plan.to.y); drain(); await sleep(380); }
    if (plan.attack && !g.over) { attackWith(g, u, plan.attack); drain(); await sleep(750); }
    app.selected = null;
  }
}

// ---- one round ----
async function castTurn(w) {
  const g = app.game;
  app.current = w.id; app.highlight.clear();
  if (!w.choice) {
    const me = unitOf(g, w), c = cellCenter(me.x, me.y);
    app.status = `${w.name} can't be bothered.`; spawnFloater(c.x, c.y - 40, 'Meh.', '#bcd0ff', 26);
    await sleep(700);
    return;
  }
  const sp = SPELL_BY_ID[w.choice];
  showBanner(`${w.name} casts ${sp.name}!`, w.color, sp.flavour, 120);
  app.status = `${w.name} casts ${sp.name}!`; app.hint = '';
  await sleep(1000);
  const targets = legalCastTargets(g, w, sp.id);
  let target = null;
  if (targets.length) {
    if (sp.kind === 'self') target = targets[0];
    else if (w.human) target = await chooseCell(w, targets, `${w.name}: where should the ${sp.name} go?`);
    else target = aiChooseTarget(g, w, sp.id);
  }
  castSpell(g, w, sp.id, target); drain();
  await sleep(1200);
}

async function moveTurn(w) {
  const g = app.game;
  app.current = w.id; app.selected = null; app.highlight.clear();
  if (!g.units.some((u) => u.owner === w.id && unitCanAct(g, u))) return; // nothing that can move or fight
  showBanner(`${w.name}'s move`, w.color, '', 70);
  app.status = `${w.name}'s move.`;
  await sleep(600);
  if (w.human) await humanMoveTurn(w); else await aiMoveTurn(w);
  app.selected = null; app.highlight.clear();
}

async function playRound(game) {
  const order = turnOrder(game);
  const humans = game.wizards.filter((w) => w.human && w.alive).length;
  app.phaseLabel = 'Choose your spells';
  Sound.play('round');
  showBanner(`Round ${game.round}`, '#ffe066', game.round === MAX_ROUNDS ? 'The last round! The bell rings after it.' : '', 100);
  app.status = `Round ${game.round}: everyone picks a spell in secret.`;
  await sleep(1000);
  for (const id of order) {
    const w = game.wizards[id];
    if (!w.alive) continue;
    if (!w.human) { w.choice = aiChooseSpell(game, w); continue; }
    if (humans > 1) await handoff(w, 'Choose your spell for this round.');
    w.choice = await chooseSpell(w);
  }
  app.overlay = null;
  app.phaseLabel = 'Casting spells';
  for (const id of order) {
    const w = game.wizards[id];
    if (!w.alive) continue;
    await castTurn(w);
    if (game.over) return;
  }
  app.phaseLabel = 'Move and fight';
  for (const id of order) {
    const w = game.wizards[id];
    if (!w.alive) continue;
    await moveTurn(w);
    if (game.over) return;
  }
  app.phaseLabel = 'End of round'; app.current = null;
  endRound(game); drain();
  await sleep(game.blobs.length ? 800 : 300);
}

async function showGameOver(game) {
  app.current = null; app.highlight.clear(); app.selected = null; app.showEndTurn = false;
  app.phaseLabel = 'Game over';
  if (!game.result) throw new Error('showGameOver called before the game finished');
  app.overlay = { kind: 'gameOver' };
  Sound.play('win');
  app.status = game.result.winners.length === 1 ? `${game.wizards[game.result.winners[0]].name} wins!` : 'A shared victory!';
  app.hint = '';
  if (app.fast) return;
  await waitFor((done) => ({
    onKey: (key) => { if (key === 'Enter' || key === ' ') { Sound.play('choose'); done(); return true; } return false; },
    onClick: () => { Sound.play('choose'); done(); },
    onMove: () => {},
  }));
}

async function runGame(cfg) {
  const seed = cfg.seed !== undefined ? cfg.seed : (Math.random() * 4294967296) >>> 0;
  const game = createGame(buildPlayers(cfg), seed);
  app.game = game; app.mode = 'play'; app.overlay = null;
  app.views.clear(); app.particles = []; app.floaters = []; app.projectiles = []; app.highlight.clear();
  app.selected = null; app.current = null; app.showEndTurn = false; app.banner = null;
  app.status = 'Welcome to Mayhem Academy!'; app.hint = '';
  showBanner('Mayhem Academy', '#ffe066', 'Be the last pupil standing!', 110);
  await sleep(1300);
  while (!game.over) await playRound(game);
  drain();
  await showGameOver(game);
}

async function mainFlow() {
  let screen = 'title';
  for (;;) {
    if (screen === 'title') { await titleFlow(); screen = 'setup'; }
    const cfg = await runSetup();
    if (cfg === null) { screen = 'title'; continue; } // Escape on the setup screen goes back to the title
    await runGame(cfg); // and after a game, back to setup so you can go again
  }
}

function failFlow(err) {
  app.fatal = err;
  console.error(err);
}

// Called every frame to keep the status line and the hover information up to date.
function updateApp() {
  if (app.overlay && app.overlay.kind === 'gameOver' && app.tick % 25 === 0) spawnConfetti(80 + Math.random() * (PANEL_X - 160), BOARD_Y + 20, 14);
  app.info = '';
  if (app.mode !== 'play' || !app.game || (app.overlay && app.overlay.kind !== 'gameOver')) return;
  const c = app.showCursor ? app.cursor : app.hoverCell;
  if (!c) return;
  const u = unitAt(app.game, c.x, c.y);
  if (u) app.info = describeUnit(u);
  else if (blobAt(app.game, c.x, c.y)) app.info = 'Canteen Slime. It gums up any creature it spreads onto. Pupils are slime-proof; creatures can eat it.';
  else {
    const t = terrainAt(app.game, c.x, c.y);
    if (t && t.kind === 'ink') app.info = `Spilled ink. Pets on foot slide ${INK_SLIDE} squares further when they step in. Dries in ${t.ttl} round${t.ttl === 1 ? '' : 's'}.`;
    else if (t) {
      const twin = partnerDoor(app.game, t);
      const shut = !twin || unitAt(app.game, twin.x, twin.y) || blobAt(app.game, twin.x, twin.y);
      app.info = `Secret passage. Step in and come out of its twin${shut ? ' (shut: the other side is occupied)' : ''}. Collapses after one trip, or in ${t.ttl} round${t.ttl === 1 ? '' : 's'}.`;
    }
  }
}
