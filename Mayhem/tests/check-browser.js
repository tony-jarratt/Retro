'use strict';
// Rules and AI checks. Run with tests/run-checks.sh (the page reports its result through its title).
const out = [];
let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; out.push('FAIL: ' + msg); } else out.push('ok: ' + msg); };
const info = (msg) => out.push('info: ' + msg);
window.addEventListener('error', (e) => { failures++; out.push('ERROR: ' + e.message + ' @' + e.filename + ':' + e.lineno); });

const sample = (n) => Array.from({ length: n }, (_, i) => ({ name: 'P' + (i + 1), color: ROBE_COLORS[i].hex, hat: HATS[i % 4], familiar: FAMILIARS[i % 4], human: false }));
const throwsRule = (fn) => { try { fn(); return null; } catch (e) { return e.name === 'RuleError' ? e.message : 'WRONG ERROR ' + e.name + ': ' + e.message; } };
const blank = (n = 2, seed = 1) => { const g = createGame(sample(n), seed); g.events.length = 0; return g; };
// put a creature straight onto the board for a test
const place = (g, owner, type, x, y, fresh = false) => { const u = addUnit(g, { owner, type, x, y }); u.fresh = fresh; return u; };

(async () => {
  try {
    // ---- data ----
    check(SPELLS.length === 19 && Object.keys(CREATURES).length === 10, 'data: 19 spells and 10 creatures');
    check(SPELLS.filter((s) => s.kind === 'summon').every((s) => CREATURES[s.creature]), 'data: every summon spell has a creature');

    // ---- dice ----
    check(Math.abs(winChance(3, 3) - 15 / 36) < 1e-9, `dice: equal numbers win ${(winChance(3, 3) * 100).toFixed(1)}% for the attacker (ties go to the defender)`);
    check(winChance(8, 1) === 1 && winChance(0, 8) === 0, 'dice: a big gap is a certain win or loss');
    const r = new Rng(5); let wins = 0; for (let i = 0; i < 20000; i++) if (rollWins(r, 5, 3)) wins++;
    check(Math.abs(wins / 20000 - winChance(5, 3)) < 0.02, `dice: rolled 5 v 3 matches the odds (${(wins / 200).toFixed(1)}% vs ${(winChance(5, 3) * 100).toFixed(1)}%)`);

    // ---- setting up ----
    for (let n = MIN_WIZARDS; n <= MAX_WIZARDS; n++) {
      const g = createGame(sample(n), 7);
      const cells = new Set(g.units.map((u) => u.x + ',' + u.y));
      check(g.wizards.length === n && cells.size === n && g.units.every((u) => inBounds(u.x, u.y)), `setup: ${n} pupils start on ${n} different squares`);
      check(g.wizards.every((w) => w.hand.length === HAND_SIZE), `setup: ${n} pupils each get ${HAND_SIZE} spells`);
    }
    check(throwsRule(() => createGame(sample(1), 1)) !== null && throwsRule(() => createGame(sample(7), 1)) !== null, 'setup: 1 or 7 pupils is rejected with a RuleError');
    const a1 = createGame(sample(3), 99), a2 = createGame(sample(3), 99);
    check(JSON.stringify(a1.wizards.map((w) => w.hand)) === JSON.stringify(a2.wizards.map((w) => w.hand)), 'setup: the same seed deals the same spells');

    // ---- movement ----
    {
      const g = blank();
      const gp = place(g, 0, 'guineaPig', 5, 5);
      check(reachableCells(g, gp).size === 8, 'move: a guinea pig (1 square) can reach 8 squares in the open');
      const corner = place(g, 0, 'guineaPig', 0, 0);
      check(reachableCells(g, corner).size === 3, 'move: in a corner it can reach 3');
      const frog = place(g, 0, 'frog', 9, 5);
      check(reachableCells(g, frog).size === 48 - 0 || reachableCells(g, frog).size > 8, `move: a frog (3 squares) reaches ${reachableCells(g, frog).size} squares`);
      const fresh = place(g, 0, 'cat', 3, 8, true);
      check(reachableCells(g, fresh).size === 0 && attackTargets(g, fresh).length === 0, 'move: a creature summoned this round can neither move nor attack');
      const giggly = place(g, 0, 'cat', 11, 8); giggly.giggle = 1;
      check(reachableCells(g, giggly).size === 0, 'move: a giggling creature cannot move');
      // blocking: a walker cannot pass a wall of units, a flyer can
      const g2 = blank();
      const walker = place(g2, 0, 'frog', 4, 5), flyer = place(g2, 0, 'owl', 4, 3);
      for (let y = 0; y < ROWS; y++) place(g2, 1, 'fort', 6, y);
      check(![...reachableCells(g2, walker).values()].some((c) => c.x >= 7), 'move: a walker cannot get past a wall of forts');
      check([...reachableCells(g2, flyer).values()].some((c) => c.x >= 7), 'move: a flyer goes over the wall');
      check(![...reachableCells(g2, flyer).values()].some((c) => c.x === 6), 'move: a flyer cannot land on a fort');
      check(throwsRule(() => moveUnit(g2, walker, 9, 9)) !== null, 'move: an impossible move throws a RuleError');
      moveUnit(g2, walker, 5, 5);
      check(walker.x === 5 && walker.moved && reachableCells(g2, walker).size === 0, 'move: after moving, a unit cannot move again');
    }

    // ---- attacking ----
    {
      const g = blank();
      const cat = place(g, 0, 'cat', 5, 5), pig = place(g, 1, 'guineaPig', 6, 5), far = place(g, 1, 'guineaPig', 9, 5);
      const t = attackTargets(g, cat);
      check(t.length === 1 && t[0].unit === pig, 'attack: a cat can attack the neighbour but not the faraway pig');
      const dragon = place(g, 0, 'dragon', 1, 8);
      check(attackTargets(g, dragon).length === 0, 'attack: the dragon has nothing within 4 squares at first');
      dragon.x = 2; dragon.y = 5;
      const dt = attackTargets(g, dragon);
      check(dt.length === 1 && dt[0].unit === pig, 'attack: the dragon shoots the pig 4 squares away but not the one 7 away');
      let kills = 0, tries = 600;
      for (let i = 0; i < tries; i++) {
        const gg = blank(2, 1000 + i);
        const c = place(gg, 0, 'cat', 5, 5), p = place(gg, 1, 'guineaPig', 6, 5);
        gg.events.length = 0;
        if (attackWith(gg, c, { kind: 'unit', unit: p, x: 6, y: 5 })) kills++;
        check_once: if (i === 0) check(c.acted && throwsRule(() => attackWith(gg, c, { kind: 'unit', unit: p, x: 6, y: 5 })) !== null, 'attack: a unit attacks once per turn, a second try throws a RuleError');
      }
      info(`cat (5) vs guinea pig (2): won ${(kills / tries * 100).toFixed(0)}% (odds ${(winChance(5, 2) * 100).toFixed(0)}%)`);
      check(Math.abs(kills / tries - winChance(5, 2)) < 0.07, 'attack: results match the odds');
      const gb = blank();
      const eater = place(gb, 0, 'guineaPig', 5, 5); gb.blobs.push({ x: 6, y: 5, owner: 1 });
      check(attackTargets(gb, eater).some((x) => x.kind === 'blob'), 'attack: a creature can eat slime next to it');
      attackWith(gb, eater, { kind: 'blob', x: 6, y: 5 });
      check(gb.blobs.length === 0, 'attack: eating slime removes it, no dice');
    }

    // ---- spells ----
    {
      const g = blank();
      const w = g.wizards[0], me = unitOf(g, w);
      me.x = 7; me.y = 4; // the middle of the board, so nothing is cut off by an edge
      w.hand = SPELLS.map((s) => ({ spell: s.id, used: false }));
      check(legalCastTargets(g, w, 'guineaPig').length === 24, `spell: a guinea pig can be summoned on ${legalCastTargets(g, w, 'guineaPig').length} squares around a pupil in the open (range 2)`);
      const rival = unitOf(g, g.wizards[1]); rival.x = 14; rival.y = 9; // 7 squares from the pupil: out of range (6)
      check(legalCastTargets(g, w, 'pie').length === 0 && !spellAvailable(g, w, 'pie').ok, 'spell: a pie has no target while nobody is in range');
      rival.x = 13; rival.y = 4;
      check(legalCastTargets(g, w, 'pie').length === 1, 'spell: a pie can hit a pupil exactly 6 squares away');
      check(spellAvailable(g, w, 'shield').ok, 'spell: a shield is available');
      const near = legalCastTargets(g, w, 'guineaPig')[0];
      const savedChance = SPELL_BY_ID.guineaPig.success;
      SPELL_BY_ID.guineaPig.success = 100;
      check(castSpell(g, w, 'guineaPig', near) === true && creaturesOf(g, 0).length === 1, 'spell: summoning puts a creature on the board');
      check(creaturesOf(g, 0)[0].fresh === true, 'spell: the new creature is "fresh" (acts next round)');
      check(w.hand.find((h) => h.spell === 'guineaPig').used, 'spell: the card is used up');
      check(throwsRule(() => castSpell(g, w, 'guineaPig', near)) !== null, 'spell: casting a used card throws a RuleError');
      SPELL_BY_ID.guineaPig.success = savedChance;
      check(throwsRule(() => castSpell(g, w, 'frog', { x: 14, y: 9 })) !== null && w.hand.find((h) => h.spell === 'frog').used === false, 'spell: an out-of-range cast throws and the card is kept');
      SPELL_BY_ID.shield.success = 100; castSpell(g, w, 'shield', { x: me.x, y: me.y });
      check(stats(g, me).def === BASE_WIZARD.def + BUFF_BONUS && !spellAvailable(g, w, 'shield').ok, `spell: shield raises defence to ${BASE_WIZARD.def + BUFF_BONUS} and cannot be cast twice`);
      SPELL_BY_ID.wand.success = 100; castSpell(g, w, 'wand', { x: me.x, y: me.y });
      check(stats(g, me).atk === BASE_WIZARD.atk + BUFF_BONUS, `spell: wand raises attack to ${BASE_WIZARD.atk + BUFF_BONUS}`);
      SPELL_BY_ID.wings.success = 100; castSpell(g, w, 'wings', { x: me.x, y: me.y });
      check(stats(g, me).move === 3 && stats(g, me).flying, 'spell: wings give move 3 and flight');
      SPELL_BY_ID.shield.success = 95; SPELL_BY_ID.wand.success = 90; SPELL_BY_ID.wings.success = 80;
      const before = g.events.length;
      const w1 = g.wizards[1]; w1.hand = [{ spell: 'frog', used: false }];
      SPELL_BY_ID.frog.success = 1; let fizzled = 0;
      for (let i = 0; i < 40; i++) { w1.hand = [{ spell: 'frog', used: false }]; const gg = blank(2, 50 + i); const ww = gg.wizards[0]; ww.hand = [{ spell: 'frog', used: false }]; if (!castSpell(gg, ww, 'frog', legalCastTargets(gg, ww, 'frog')[0])) fizzled++; }
      SPELL_BY_ID.frog.success = 90;
      check(fizzled >= 35, `spell: a 1% spell nearly always fizzles (${fizzled}/40)`);
      void before;
      // no target: used up, fizzles
      const gn = blank(); const wn = gn.wizards[0]; wn.hand = [{ spell: 'pie', used: false }];
      check(castSpell(gn, wn, 'pie', null) === false && wn.hand[0].used && gn.events.some((e) => e.t === 'fizzle'), 'spell: casting with no target fizzles and uses the card');
    }
    {
      // tickle, bolt and area
      const g = blank(); const w = g.wizards[0]; const me = unitOf(g, w);
      const e = place(g, 1, 'cat', me.x + 3, me.y); const ownPig = place(g, 0, 'guineaPig', me.x + 2, me.y + 1);
      w.hand = [{ spell: 'tickle', used: false }, { spell: 'glitter', used: false }, { spell: 'pie', used: false }];
      SPELL_BY_ID.tickle.success = 100;
      castSpell(g, w, 'tickle', { x: e.x, y: e.y });
      check(e.giggle === 1 && reachableCells(g, e).size === 0 && attackTargets(g, e).length === 0, 'spell: a tickled creature can neither move nor attack');
      SPELL_BY_ID.tickle.success = 85;
      check(!legalCastTargets(g, w, 'tickle').some((c) => c.x === me.x && c.y === me.y), 'spell: you cannot tickle yourself');
      const centre = { x: me.x + 2, y: me.y };
      SPELL_BY_ID.glitter.success = 100;
      let hitOwn = 0, hitEnemy = 0;
      for (let i = 0; i < 300; i++) {
        const gg = blank(2, 300 + i); const ww = gg.wizards[0]; const m = unitOf(gg, ww);
        const en = place(gg, 1, 'guineaPig', m.x + 3, m.y), own = place(gg, 0, 'guineaPig', m.x + 2, m.y + 1);
        ww.hand = [{ spell: 'glitter', used: false }];
        castSpell(gg, ww, 'glitter', { x: m.x + 2, y: m.y });
        if (!gg.units.includes(own)) hitOwn++; if (!gg.units.includes(en)) hitEnemy++;
      }
      SPELL_BY_ID.glitter.success = 80;
      check(hitOwn > 100 && hitEnemy > 100, `spell: glitter splats friends and foes in the patch (own ${hitOwn}, enemy ${hitEnemy} of 300)`);
      void centre; void ownPig;
      const gp = blank(); const wp = gp.wizards[0]; const mp = unitOf(gp, wp); const target = unitOf(gp, gp.wizards[1]);
      target.x = mp.x + 4; target.y = mp.y; wp.hand = [{ spell: 'pie', used: false }];
      check(legalCastTargets(gp, wp, 'pie').some((c) => c.x === target.x && c.y === target.y), 'spell: a pie can target an enemy pupil in range');
    }

    // ---- blob ----
    {
      const g = blank(); g.blobs.push({ x: 7, y: 5, owner: 0 });
      const pig = place(g, 1, 'guineaPig', 8, 5);
      let sawSlimed = false;
      for (let i = 0; i < 60 && !sawSlimed; i++) { endRound(g); if (!g.units.includes(pig)) sawSlimed = true; }
      check(g.blobs.length <= BLOB_CAP, `blob: never exceeds ${BLOB_CAP} squares (now ${g.blobs.length})`);
      check(sawSlimed, 'blob: spreading onto a creature slimes it');
      check(g.wizards.every((w) => w.alive), 'blob: pupils are slime-proof');
    }

    // ---- winning ----
    {
      const g = blank();
      const killer = place(g, 0, 'headteacher', 5, 5); const victim = unitOf(g, g.wizards[1]); victim.x = 6; victim.y = 5;
      // fight until the pupil falls (very likely with an 8 attack vs 3 defence)
      let guard = 0;
      while (!g.over && guard++ < 50) { killer.acted = false; killer.fresh = false; attackWith(g, killer, { kind: 'unit', unit: victim, x: victim.x, y: victim.y }); }
      check(g.over && g.result.reason === 'lastStanding' && g.result.winners[0] === 0, 'win: defeating the last rival ends the game with the right winner');
      check(!g.wizards[1].alive && g.events.some((e) => e.t === 'wizardOut'), 'win: the defeated pupil is out');
      const g3 = blank(3);
      const v1 = unitOf(g3, g3.wizards[1]); place(g3, 1, 'guineaPig', 2, 2); place(g3, 1, 'frog', 3, 2);
      removeUnit(g3, v1, 'attack');
      check(!g3.wizards[1].alive && creaturesOf(g3, 1).length === 0 && !g3.over, 'win: a defeated pupil\'s creatures vanish, and the game goes on with two left');
      // the school bell
      const gb = blank(3);
      place(gb, 0, 'guineaPig', 3, 3); place(gb, 1, 'guineaPig', 4, 4); place(gb, 1, 'frog', 5, 5);
      gb.round = MAX_ROUNDS;
      endRound(gb);
      check(gb.over && gb.result.reason === 'bell' && gb.result.winners.length === 1 && gb.result.winners[0] === 1, 'win: the bell goes after round 15 and the most creatures wins');
      const gt = blank(2); gt.round = MAX_ROUNDS; endRound(gt);
      check(gt.result.winners.length === 2, 'win: equal creatures at the bell is a shared win');
    }

    // ---- turn order ----
    {
      const g = blank(4);
      const o1 = turnOrder(g).join(''); g.round = 2; const o2 = turnOrder(g).join('');
      check(o1 === '0123' && o2 === '1230', 'order: the starting pupil rotates each round');
      g.wizards[2].alive = false; check(turnOrder(g).join('') === '130', 'order: defeated pupils are skipped');
    }

    // ---- spilled ink and secret passages ----
    {
      const ink = (g, x, y, ttl = INK_ROUNDS) => addTerrain(g, { kind: 'ink', x, y, owner: 0, ttl });
      const walker = (g, type, x, y) => { const u = place(g, 0, type, x, y); return u; };
      // casting ink
      {
        const g = blank(2, 31), w = g.wizards[0], me = unitOf(g, w); me.x = 7; me.y = 4;
        w.hand = [{ spell: 'ink', used: false }, { spell: 'passage', used: false }]; SPELL_BY_ID.ink.success = 100; SPELL_BY_ID.passage.success = 100;
        castSpell(g, w, 'ink', { x: 7, y: 6 });
        const cells = g.terrain.filter((t) => t.kind === 'ink');
        check(cells.length === 3 && cells.some((c) => c.x === 7 && c.y === 6) && cells.every((c) => dist(c.x, c.y, 7, 6) <= 1), 'ink: a spilled blot covers 3 squares around the target');
        check(cells.every((c) => c.ttl === INK_ROUNDS), `ink: dries after ${INK_ROUNDS} rounds`);
        const again = { spell: 'ink', used: false }; w.hand.push(again); castSpell(g, w, 'ink', { x: 7, y: 6 });
        check(g.terrain.filter((t) => t.kind === 'ink' && t.x === 7 && t.y === 6).length === 1, 'ink: more ink on a puddle does not stack, it keeps it wet');
        for (let i = 0; i < INK_ROUNDS; i++) endRound(g);
        check(g.terrain.filter((t) => t.kind === 'ink').length === 0 && g.events.some((e) => e.t === 'terrainGone'), 'ink: it has all dried up after four rounds, with an event for each square');
        SPELL_BY_ID.ink.success = 85; SPELL_BY_ID.passage.success = 80;
      }
      // sliding
      {
        const g = blank(2, 32); ink(g, 5, 5);
        const frog = walker(g, 'frog', 3, 5);
        moveUnit(g, frog, 5, 5);
        check(frog.x === 7 && frog.y === 5 && g.events.some((e) => e.t === 'slide'), 'slide: a walker that steps in ink slides 2 squares further the way it was heading');
        const g2 = blank(2, 33); ink(g2, 5, 5); const owl = walker(g2, 'owl', 3, 5);
        moveUnit(g2, owl, 5, 5); check(owl.x === 5, 'slide: a flyer is not affected');
        const g3 = blank(2, 34); ink(g3, 5, 5); const f3 = walker(g3, 'frog', 3, 3);
        moveUnit(g3, f3, 5, 5); check(f3.x === 7 && f3.y === 7, 'slide: diagonals work too');
        const g4 = blank(2, 35); ink(g4, 5, 5); const f4 = walker(g4, 'frog', 3, 5); place(g4, 1, 'fort', 6, 5);
        moveUnit(g4, f4, 5, 5); check(f4.x === 5, 'slide: stops before something in the way (no slide at all if the next square is taken)');
        const g5 = blank(2, 36); ink(g5, 5, 5); const f5 = walker(g5, 'frog', 3, 5); place(g5, 1, 'fort', 7, 5);
        moveUnit(g5, f5, 5, 5); check(f5.x === 6, 'slide: or after one square if the second is taken');
        const g6 = blank(2, 37); ink(g6, 13, 7); const f6 = walker(g6, 'frog', 11, 7);
        moveUnit(g6, f6, 13, 7); check(f6.x === 14, 'slide: stops at the edge of the board');
        const g7 = blank(2, 38); ink(g7, 5, 5); const cat = walker(g7, 'cat', 3, 5); const foe = place(g7, 1, 'guineaPig', 8, 5);
        moveUnit(g7, cat, 5, 5);
        check(cat.x === 7 && attackTargets(g7, cat).some((t) => t.unit === foe) && !cat.acted, 'slide: sliding up next to an enemy lets the pet attack it straight away');
        const g8 = blank(2, 39); ink(g8, 5, 5); const f8 = walker(g8, 'frog', 3, 5);
        const before = JSON.stringify([f8.x, f8.y]); const out = moveOutcome(g8, f8, 5, 5);
        check(out.how === 'slide' && out.x === 7 && JSON.stringify([f8.x, f8.y]) === before, 'slide: moveOutcome only looks ahead, it does not move anything');
        const g9 = blank(2, 40); const wz = unitOf(g9, g9.wizards[0]); wz.x = 3; wz.y = 5; ink(g9, 4, 5);
        moveUnit(g9, wz, 4, 5); check(wz.x === 6, 'slide: pupils slip on ink too');
      }
      // doors
      {
        const g = blank(2, 41), w = g.wizards[0], me = unitOf(g, w); me.x = 5; me.y = 3;
        w.hand = [{ spell: 'passage', used: false }]; SPELL_BY_ID.passage.success = 100;
        castSpell(g, w, 'passage', { x: 3, y: 3 });
        const doors = g.terrain.filter((t) => t.kind === 'door');
        check(doors.length === 2 && doors[0].pair === doors[1].pair, 'door: a passage opens two doors that are a pair');
        check(doors.some((d) => d.x === 3 && d.y === 3) && doors.some((d) => d.x === COLS - 1 - 3 && d.y === ROWS - 1 - 3), 'door: the twin appears on the opposite side of the school');
        check(doors.every((d) => d.ttl === PASSAGE_ROUNDS) && PASSAGE_ROUNDS === 3, 'door: it lasts 3 rounds');
        check(!cellFree(g, 3, 3) && !legalCastTargets(g, w, 'guineaPig').some((c) => c.x === 3 && c.y === 3), 'door: nothing can be summoned onto a door');
        const mover = walker(g, 'frog', 4, 3); mover.fresh = false;
        // shut while the twin is occupied, open again once it is clear
        const blocker = place(g, 1, 'fort', 11, 6);
        check(!reachableCells(g, mover).has('3,3'), 'door: it is shut while the far side is occupied');
        g.units.splice(g.units.indexOf(blocker), 1);
        check(reachableCells(g, mover).has('3,3'), 'door: and opens again once the far side is clear');
        moveUnit(g, mover, 3, 3);
        check(mover.x === 11 && mover.y === 6 && mover.moved && g.events.some((e) => e.t === 'teleport'), 'door: stepping in comes out of the twin');
        check(g.terrain.length === 0 && g.events.filter((e) => e.t === 'terrainGone' && e.how === 'used').length === 2, 'door: one trip and the passage collapses (both doors go)');
        const second = walker(g, 'frog', 4, 4); second.fresh = false;
        check(moveOutcome(g, second, 3, 3).how === 'walk', 'door: so nobody else can use it (that square is just floor again)');
        check(attackTargets(g, mover).length >= 0 && mover.moved && !mover.acted, 'door: the pet that came through can still attack from where it landed');
        SPELL_BY_ID.passage.success = 80;
      }
      {
        // flyers use doors too, and unused doors seal after three rounds
        const g = blank(2, 44), w = g.wizards[0], me = unitOf(g, w); me.x = 5; me.y = 3;
        w.hand = [{ spell: 'passage', used: false }]; SPELL_BY_ID.passage.success = 100; castSpell(g, w, 'passage', { x: 3, y: 3 });
        const flyer = walker(g, 'owl', 4, 4); flyer.fresh = false; moveUnit(g, flyer, 3, 3);
        check(flyer.x === 11 && flyer.y === 6 && g.terrain.length === 0, 'door: flyers use doors too, and it collapses behind them');
        const g2 = blank(2, 45), w2 = g2.wizards[0], m2 = unitOf(g2, w2); m2.x = 5; m2.y = 3;
        w2.hand = [{ spell: 'passage', used: false }]; castSpell(g2, w2, 'passage', { x: 3, y: 3 });
        endRound(g2); endRound(g2);
        check(g2.terrain.length === 2, 'door: still there after two rounds');
        endRound(g2);
        check(g2.terrain.length === 0 && g2.events.filter((e) => e.t === 'terrainGone').length === 2, 'door: an unused passage seals itself after three rounds');
        SPELL_BY_ID.passage.success = 80;
      }
      // the twin goes to the nearest free square when the opposite one is taken
      {
        const g = blank(2, 42), w = g.wizards[0], me = unitOf(g, w); me.x = 5; me.y = 3;
        place(g, 1, 'fort', 11, 6); w.hand = [{ spell: 'passage', used: false }]; SPELL_BY_ID.passage.success = 100;
        castSpell(g, w, 'passage', { x: 3, y: 3 });
        const twin = g.terrain.find((t) => t.kind === 'door' && !(t.x === 3 && t.y === 3));
        check(twin && dist(twin.x, twin.y, 11, 6) === 1 && !unitAt(g, twin.x, twin.y), `door: if the opposite square is taken the twin opens right next to it (${twin ? twin.x + ',' + twin.y : 'none'})`);
        SPELL_BY_ID.passage.success = 80;
      }
      // doors and blobs, and who can target what
      {
        const g = blank(2, 43); g.terrain.push({ kind: 'door', x: 5, y: 5, owner: 0, ttl: 6, pair: 1 }, { kind: 'door', x: 9, y: 5, owner: 0, ttl: 6, pair: 1 });
        g.blobs.push({ x: 6, y: 5, owner: 1 });
        for (let i = 0; i < 80; i++) { if (g.blobs.length < 20) g.blobs.push({ x: 6, y: 5 + (i % 3), owner: 1 }); endRound(g); g.terrain.forEach((t) => { t.ttl = 6; }); }
        check(!g.blobs.some((b) => (b.x === 5 && b.y === 5) || (b.x === 9 && b.y === 5)), 'door: the slime never spreads onto a door');
        const w = g.wizards[0]; const me = unitOf(g, w); me.x = 6; me.y = 4; w.hand = [{ spell: 'ink', used: false }, { spell: 'passage', used: false }];
        check(!legalCastTargets(g, w, 'ink').some((c) => c.x === 5 && c.y === 5), 'door: ink cannot be spilled on a door');
        check(!legalCastTargets(g, w, 'passage').some((c) => c.x === 5 && c.y === 5 || c.x === 6 && c.y === 5), 'door: a new passage cannot open on a door or on slime');
        const inkSq = { x: 4, y: 4 }; ink(g, inkSq.x, inkSq.y);
        check(legalCastTargets(g, w, 'ink').some((c) => c.x === me.x && c.y === me.y), 'ink: can be spilled anywhere in range, even under your own pupil');
      }
    }

    // ---- the computer players ----
    const startTime = performance.now();
    const results = {};
    const tally = { ink: 0, passage: 0, slides: 0, doors: 0 };
    const realCast = castSpell, realMove = moveUnit;
    castSpell = (g, w, id, t, o) => { const r = realCast(g, w, id, t, o); if (t && r && (id === 'ink' || id === 'passage')) tally[id]++; return r; };
    moveUnit = (g, u, x, y) => { const how = moveOutcome(g, u, x, y).how; if (how === 'slide') tally.slides++; if (how === 'door') tally.doors++; return realMove(g, u, x, y); };
    for (const n of [2, 3, 4, 6]) {
      const wins = new Array(n).fill(0); let draws = 0, bells = 0, roundsTotal = 0, games = 0, maxRounds = 0;
      for (let seed = 1; seed <= 250; seed++) {
        const res = aiSimulateGame(sample(n), seed * 7919 + n);
        games++; roundsTotal += res.rounds; maxRounds = Math.max(maxRounds, res.rounds);
        if (res.reason === 'bell') bells++;
        if (res.winners.length !== 1) draws++; else wins[res.winners[0]]++;
      }
      results[n] = { wins, draws, bells, avg: roundsTotal / games, maxRounds };
      info(`${n} computer pupils, ${games} games: avg ${ (roundsTotal / games).toFixed(1)} rounds (max ${maxRounds}), ${bells} ended by the bell, ${draws} shared; wins per seat ${wins.map((w) => (w / games * 100).toFixed(0) + '%').join(' ')}`);
    }
    castSpell = realCast; moveUnit = realMove;
    info(`computer pupils spilled ink ${tally.ink} times and opened ${tally.passage} passages; pets slid ${tally.slides} times and went through a door ${tally.doors} times`);
    check(tally.ink > 100 && tally.passage > 100 && tally.slides > 20 && tally.doors > 20, 'ai: the computer pupils cast both new spells, and pets really do slide and use doors');
    check(true, `ai: 1000 full computer-only games finished with no errors (${((performance.now() - startTime) / 1000).toFixed(1)}s)`);
    for (const n of [2, 3, 4, 6]) {
      const r2 = results[n]; const share = r2.wins.map((w) => w / 250);
      check(Math.max(...share) < 1.6 / n + 0.05 && Math.min(...share) > 0.35 / n, `ai: ${n} pupils: no seat wins far more or less than its fair share`);
      check(r2.maxRounds <= MAX_ROUNDS, `ai: ${n} pupils: every game ends within ${MAX_ROUNDS} rounds`);
    }

    // ---- the new terrain on screen ----
    {
      app.mode = 'play'; app.overlay = null;
      const g = createGame(sample(4), 77); g.events.length = 0; app.game = g; app.views.clear(); app.current = 0;
      addTerrain(g, { kind: 'ink', x: 5, y: 5, owner: 0, ttl: 4 }); addTerrain(g, { kind: 'ink', x: 6, y: 5, owner: 0, ttl: 1 });
      addTerrain(g, { kind: 'door', x: 3, y: 3, owner: 0, ttl: 6, pair: 1 }); addTerrain(g, { kind: 'door', x: 11, y: 6, owner: 0, ttl: 1, pair: 1 });
      addTerrain(g, { kind: 'door', x: 2, y: 8, owner: 0, ttl: 5, pair: 2 }); addTerrain(g, { kind: 'door', x: 12, y: 1, owner: 0, ttl: 5, pair: 2 });
      let ok = true; try { render(); } catch (e) { ok = false; failures++; out.push('FAIL: drawing terrain: ' + e.stack); }
      check(ok, 'screen: ink and secret passages draw (including a puddle that is nearly dry and a door about to seal)');
      for (const [x, y, word] of [[5, 5, 'Spilled ink'], [3, 3, 'Secret passage']]) {
        app.showCursor = true; app.cursor = { x, y }; updateApp();
        check(app.info.startsWith(word), `screen: hovering over it explains it ("${app.info.slice(0, 50)}...")`);
      }
      place(g, 1, 'fort', 11, 6); app.cursor = { x: 3, y: 3 }; updateApp();
      check(app.info.includes('shut'), 'screen: a door says when it is shut');
      // every new event is understood by the screen code (an unknown event throws)
      let handled = true;
      try {
        for (const e of [{ t: 'ink', cells: [{ x: 5, y: 5 }] }, { t: 'passage', a: { x: 3, y: 3 }, b: { x: 11, y: 6 } }, { t: 'slide', unit: 1, fromX: 5, fromY: 5, toX: 7, toY: 5 }, { t: 'teleport', unit: 1, fromX: 3, fromY: 3, toX: 11, toY: 6 }, { t: 'terrainGone', kind: 'ink', x: 5, y: 5 }]) handleEvent(e);
      } catch (e) { handled = false; failures++; out.push('FAIL: events: ' + e.message); }
      check(handled, 'screen: the five new events are all handled');
      app.showCursor = false; app.game = null;
    }

    // ---- every screen draws without errors ----
    {
      const tryRender = (label) => { try { render(); return true; } catch (e) { out.push('FAIL: drawing ' + label + ': ' + e.stack); failures++; return false; } };
      app.mode = 'title'; check(tryRender('the title screen'), 'screen: title draws');
      app.mode = 'setup'; app.setup = defaultSetup(); for (let r = 0; r < 4; r++) { app.setup.row = r; app.setup.humans = 1 + r; app.setup.names = DEFAULT_HUMAN_NAMES.slice(); tryRender('setup'); }
      check(true, 'screen: setup draws with 1 to 4 humans');
      const g = createGame(sample(6), 11);
      const w = g.wizards[0]; const me = unitOf(g, w);
      addUnit(g, { owner: 0, type: 'dragon', x: me.x + 1, y: me.y + 1 }).fresh = false;
      for (const type of Object.keys(CREATURES)) addUnit(g, { owner: 1, type, x: 1 + Object.keys(CREATURES).indexOf(type), y: 6 });
      g.blobs.push({ x: 8, y: 3, owner: 0 }, { x: 9, y: 3, owner: 0 });
      w.buffs = { shield: true, wand: true, wings: true };
      app.game = g; app.mode = 'play'; app.current = 0; app.views.clear();
      check(tryRender('the board'), 'screen: board draws with all ten creatures, slime, buffs and six pupils');
      app.showEndTurn = true; app.highlight.set('3,3', 'move'); app.highlight.set('4,3', 'attack'); app.highlight.set('5,3', 'target'); app.highlight.set('6,3', 'ready');
      app.selected = g.units[3].id; app.showCursor = true; app.cursor = { x: 4, y: 6 }; updateApp();
      check(tryRender('highlights') && app.info.length > 0, `screen: highlights, selection and the hover info line draw ("${app.info.slice(0, 40)}...")`);
      for (const kind of ['bolt', 'area', 'pie']) { void kind; }
      spawnProjectile(cellCenter(1, 1), cellCenter(5, 5), 'pie'); spawnProjectile(cellCenter(1, 1), cellCenter(5, 5), 'glitter'); spawnProjectile(cellCenter(1, 1), cellCenter(5, 5), 'pizza');
      spawnConfetti(100, 100); spawnSparkles(100, 100); spawnSplat(100, 100, '#f00'); spawnPuff(100, 100); spawnFloater(100, 100, 'Hi');
      showBanner('A banner', '#ff0', 'with a subtitle');
      for (let i = 0; i < 40; i++) { step(); tryRender('effects'); }
      check(true, 'screen: effects, projectiles and banners animate');
      for (const h of ['pointy', 'wonky', 'star', 'top']) { w.hat = h; tryRender('hat ' + h); }
      check(true, 'screen: all four hats draw');
      w.hand = SPELLS.slice(0, 14).map((sp, i) => ({ spell: sp.id, used: i === 3 }));
      const cards = w.hand.map((item) => ({ item, avail: item.used ? { ok: false, reason: 'Used' } : spellAvailable(g, w, item.spell) }));
      for (let idx = 0; idx <= cards.length; idx++) { app.overlay = { kind: 'spellbook', wizard: w, cards, index: idx }; tryRender('spellbook ' + idx); }
      check(true, 'screen: the spellbook draws for every selection (and the nap button)');
      app.overlay = { kind: 'handoff', wizard: w, line: 'Choose your spell.' }; check(tryRender('handoff'), 'screen: the pass-the-keyboard screen draws');
      g.over = true; g.result = { winners: [0, 1], reason: 'bell' }; app.overlay = { kind: 'gameOver' };
      check(tryRender('game over'), 'screen: the game-over screen draws (shared win)');
      g.result = { winners: [2], reason: 'lastStanding' }; tryRender('game over single');
      app.overlay = null; app.showEndTurn = false; app.highlight.clear(); app.selected = null;
      for (const sp of SPELLS) { try { ctx.save(); drawSpellIcon(sp, 50, 50, 46, 3); ctx.restore(); } catch (e) { failures++; out.push('FAIL: icon ' + sp.id + ': ' + e.message); } }
      check(true, `screen: all ${SPELLS.length} spell icons draw`);
    }

    // ---- the how-to-play pages ----
    {
      app.mode = 'help';
      for (let page = 0; page < HELP_PAGES; page++) {
        app.help = { page };
        try { render(); check(true, `help: page ${page + 1} draws`); } catch (e) { failures++; out.push('FAIL: help page ' + (page + 1) + ': ' + e.stack); }
        check(app.hits.some((h) => h.id === 'helpNext') && (page === 0 || app.hits.some((h) => h.id === 'helpPrev')), `help: page ${page + 1} has its buttons`);
      }
      app.mode = 'title'; render();
      check(app.hits.some((h) => h.id === 'help') && app.hits.some((h) => h.id === 'start'), 'title: has a "How to play" button as well as the start area');
      // the button is registered after the start area, so a click on it wins
      let choice = null; const t1 = runTitle().then((c) => { choice = c; });
      const hb = app.hits.find((h) => h.id === 'help'); app.handler.onClick(hb.x + 5, hb.y + 5); await t1;
      check(choice === 'help', 'title: clicking the button opens help');
      let t2 = runTitle().then((c) => { choice = c; }); app.handler.onKey('h'); await t2; check(choice === 'help', 'title: H opens help');
      t2 = runTitle().then((c) => { choice = c; }); app.handler.onKey('Enter'); await t2; check(choice === 'play', 'title: Enter starts');
      t2 = runTitle().then((c) => { choice = c; }); render(); app.handler.onClick(5, 5); await t2; check(choice === 'play', 'title: clicking anywhere else starts');
      // reading the help pages with the keyboard and mouse
      let finished = false; const h1 = runHelp().then(() => { finished = true; });
      check(app.mode === 'help' && app.help.page === 0, 'help: opens on page 1');
      app.handler.onKey('ArrowRight'); app.handler.onKey('ArrowRight'); check(app.help.page === 2, 'help: Right turns the page');
      app.handler.onKey('ArrowLeft'); check(app.help.page === 1, 'help: Left goes back');
      app.handler.onKey('ArrowLeft'); app.handler.onKey('ArrowLeft'); check(app.help.page === 0 && !finished, 'help: Left on page 1 stays on page 1');
      app.handler.onKey('Escape'); await h1; check(finished, 'help: Esc leaves from any page');
      finished = false; const h2 = runHelp().then(() => { finished = true; });
      for (let i = 0; i < HELP_PAGES - 1; i++) { render(); const nb = app.hits.find((h) => h.id === 'helpNext'); app.handler.onClick(nb.x + 5, nb.y + 5); }
      check(app.help.page === HELP_PAGES - 1 && !finished, 'help: the Next button reaches the last page');
      render(); const done = app.hits.find((h) => h.id === 'helpNext'); app.handler.onClick(done.x + 5, done.y + 5); await h2;
      check(finished, 'help: "Got it!" on the last page returns');
      // Esc on the setup screen goes back
      app.setup = null; let cfg = 'unset'; const s1 = runSetup().then((c) => { cfg = c; }); app.handler.onKey('Escape'); await s1;
      check(cfg === null, 'setup: Esc returns null, which takes you back to the title');
      app.setup = null;
    }

    // ---- the setup screen, driven by keys and clicks ----
    {
      app.mode = 'title'; app.setup = null;
      let cfg = null; const p1 = runSetup().then((c) => { cfg = c; });
      const key = (k) => app.handler.onKey(k);
      render();
      key('ArrowRight'); check(app.setup.humans === 2, 'setup: Right on the first row adds a human');
      key('ArrowDown'); key('ArrowRight'); check(app.setup.ai === 3, 'setup: Right on the second row adds a computer pupil');
      for (let i = 0; i < 6; i++) key('ArrowRight');
      check(app.setup.humans + app.setup.ai <= MAX_WIZARDS && app.setup.ai === 4, `setup: the total is capped at ${MAX_WIZARDS} pupils`);
      key('ArrowUp'); for (let i = 0; i < 10; i++) key('ArrowRight'); check(app.setup.humans === 4 && app.setup.ai === 2, 'setup: humans cap at 4 and the computer count shrinks to fit');
      for (let i = 0; i < 10; i++) key('ArrowLeft'); check(app.setup.humans === 1, 'setup: humans cannot go below 1');
      key('ArrowDown'); key('ArrowLeft'); key('ArrowLeft'); key('ArrowLeft'); check(app.setup.ai === 1, 'setup: with one human at least one computer pupil is kept (2 pupils minimum)');
      key('ArrowDown'); // first name row
      for (let i = 0; i < 20; i++) key('Backspace'); for (const ch of 'Zoe the Great Wizard') key(ch);
      check(app.setup.names[0] === 'Zoe the Great Wizard'.slice(0, NAME_MAX), `setup: typing sets the name and it stops at ${NAME_MAX} letters ("${app.setup.names[0]}")`);
      key('ArrowRight'); check(app.setup.colors[0] === 1, 'setup: Right on a name row changes the robe colour');
      render(); const hitStart = app.hits.find((h) => h.id === 'startgame');
      check(!!hitStart && app.hits.some((h) => h.id === 'name:0') && app.hits.some((h) => h.id === 'color:0:3'), 'setup: the screen registers clickable areas');
      app.handler.onClick(hitStart.x + 5, hitStart.y + 5);
      await p1;
      check(cfg && cfg.humans === 1 && cfg.ai === 1 && cfg.names[0] === 'Zoe the Great Wizard'.slice(0, NAME_MAX), 'setup: clicking START returns the chosen settings');
      const players = buildPlayers(cfg);
      check(players.length === 2 && new Set(players.map((p) => p.color)).size === 2 && players.filter((p) => p.human).length === 1, 'setup: the players built from it have different robe colours');
    }

    // ---- whole games through the real screens, played by the computer, fast ----
    {
      let frames = 0;
      app.fast = true; app.onSleep = () => { step(); if (++frames % 4 === 0) { try { render(); } catch (e) { throw e; } } };
      for (const [humans, ai] of [[0, 2], [0, 4], [0, 6]]) {
        app.fatal = null;
        await runGame({ humans, ai, names: [], colors: [], seed: 4242 + ai });
        check(app.game.over && !app.fatal && app.overlay && app.overlay.kind === 'gameOver', `flow: a fast ${ai}-pupil computer game ran through the real screens and ended (${app.game.round} rounds)`);
      }
      app.onSleep = null;
    }

    // ---- a game with a scripted human, using the real handlers ----
    {
      app.fast = true; app.fatal = null;
      let frames = 0, actions = { spell: 0, target: 0, move: 0, attack: 0, end: 0, pass: 0 };
      app.onSleep = () => { step(); if (++frames % 6 === 0) render(); };
      const rngT = new Rng(77);
      const driver = () => {
        if (!app.handler || !app.game || app.game.over) return;
        render(); // registers clickable areas for this moment
        const ov = app.overlay;
        if (ov && ov.kind === 'handoff') { app.handler.onKey('Enter'); actions.pass++; return; }
        if (ov && ov.kind === 'spellbook') {
          const usable = ov.cards.map((c, i) => i).filter((i) => !ov.cards[i].item.used && ov.cards[i].avail.ok);
          const idx = usable.length && rngT.chance(90) ? rngT.pick(usable) : ov.cards.length;
          const h = app.hits.find((x) => x.id === 'card:' + idx);
          app.handler.onClick(h.x + 3, h.y + 3); actions.spell++; return;
        }
        const targets = [...app.highlight].filter(([, k]) => k === 'target');
        if (targets.length) { const [x, y] = rngT.pick(targets)[0].split(',').map(Number); app.handler.onClick(BOARD_X + x * CELL + 5, BOARD_Y + y * CELL + 5); actions.target++; return; }
        if (app.showEndTurn) {
          const attacks = [...app.highlight].filter(([, k]) => k === 'attack'), moves = [...app.highlight].filter(([, k]) => k === 'move'), ready = [...app.highlight].filter(([, k]) => k === 'ready');
          const clickCell = (key) => { const [x, y] = key.split(',').map(Number); app.handler.onClick(BOARD_X + x * CELL + 5, BOARD_Y + y * CELL + 5); };
          if (attacks.length) { clickCell(rngT.pick(attacks)[0]); actions.attack++; }
          else if (moves.length && rngT.chance(80)) { clickCell(rngT.pick(moves)[0]); actions.move++; }
          else if (ready.length && rngT.chance(85)) clickCell(rngT.pick(ready)[0]);
          else { app.handler.onKey(' '); actions.end++; }
        }
      };
      const timer = setInterval(driver, 0);
      await runGame({ humans: 1, ai: 2, names: ['Tester'], colors: [0], seed: 9001 });
      clearInterval(timer); app.onSleep = null; app.fast = false;
      info(`scripted human played: ${JSON.stringify(actions)}`);
      check(app.game.over && !app.fatal, `flow: a game with a scripted human (spells, targets, moves, attacks) finished without errors in ${app.game.round} rounds`);
      check(actions.spell > 0 && actions.target > 0 && actions.move > 0, 'flow: the scripted human picked spells, chose targets and moved pets');
      // two humans must get the pass-the-keyboard screen
      app.fast = true; let passes = 0;
      app.onSleep = () => { step(); };
      const timer2 = setInterval(() => {
        if (!app.handler || !app.game || app.game.over) return;
        render();
        const ov = app.overlay;
        if (ov && ov.kind === 'handoff') { passes++; app.handler.onKey('Enter'); return; }
        if (ov && ov.kind === 'spellbook') { const h = app.hits.find((x) => x.id === 'card:' + ov.cards.length); app.handler.onClick(h.x + 3, h.y + 3); return; }
        if (app.showEndTurn) app.handler.onKey(' ');
      }, 0);
      const g2 = runGame({ humans: 2, ai: 0, names: ['A', 'B'], colors: [0, 1], seed: 5 });
      for (let i = 0; i < 400 && passes < 2; i++) await new Promise((r) => setTimeout(r, 5));
      clearInterval(timer2); app.onSleep = null;
      check(passes >= 2, `flow: with two humans each gets a pass-the-keyboard screen (${passes} seen)`);
      void g2; app.handler = null; app.fast = false;
    }

    // ---- keyboard and mouse handlers, one at a time ----
    {
      const settle = () => new Promise((r) => setTimeout(r, 0));
      app.fast = true; app.fatal = null; app.onSleep = () => step();
      // spellbook by keyboard
      let g = blank(2, 3); app.game = g; app.mode = 'play'; app.views.clear(); app.overlay = null;
      let w = g.wizards[0];
      w.hand = [{ spell: 'guineaPig', used: false }, { spell: 'frog', used: false }, { spell: 'pie', used: false }];
      let pick = chooseSpell(w); render();
      check(app.overlay.kind === 'spellbook' && app.overlay.index === 0, 'spellbook: opens on the first usable card');
      app.handler.onKey('ArrowRight'); check(app.overlay.index === 1, 'spellbook: Right moves to the next card');
      app.handler.onKey('ArrowRight'); app.handler.onKey('Enter'); // the pie has no target in range, so it cannot be chosen
      check(app.handler !== null && app.status.includes('cannot be used'), 'spellbook: a card with no target cannot be chosen, and a message says so');
      app.handler.onKey('ArrowLeft'); app.handler.onKey('Enter');
      check((await pick) === 'frog' && app.overlay === null, 'spellbook: Enter chooses the highlighted card');
      pick = chooseSpell(w); for (let i = 0; i < 5; i++) app.handler.onKey('ArrowRight'); app.handler.onKey('Enter');
      check((await pick) === null, 'spellbook: the last slot is "take a nap" and returns no spell');
      // picking a square by keyboard
      const targets = legalCastTargets(g, w, 'frog'); const me = unitOf(g, w);
      let cell = chooseCell(w, targets, 'Where?'); render();
      check(app.highlight.size === targets.length && [...app.highlight.values()].every((k) => k === 'target'), 'target: every legal square is highlighted');
      app.handler.onKey('ArrowRight'); app.handler.onKey('Enter');
      const got = await cell;
      check(got.x === me.x + 1 && got.y === me.y && app.highlight.size === 0, 'target: arrow keys move the cursor and Enter picks that square');
      cell = chooseCell(w, targets, 'Where?'); app.handler.onClick(BOARD_X + 10 * CELL + 5, BOARD_Y + 8 * CELL + 5); // far away: not valid
      check(app.handler !== null, 'target: clicking a square that is not highlighted does nothing');
      app.handler.onClick(BOARD_X + (me.x + 2) * CELL + 5, BOARD_Y + me.y * CELL + 5);
      check((await cell).x === me.x + 2, 'target: clicking a highlighted square picks it');
      // a human attacks with the mouse
      g = blank(2, 3); app.game = g; app.views.clear(); w = g.wizards[0]; w.human = true;
      const brute = place(g, 0, 'headteacher', 5, 5), pig = place(g, 1, 'guineaPig', 6, 5);
      const turn = humanMoveTurn(w); render();
      check(app.highlight.get('5,5') === 'ready' && app.showEndTurn, 'move: pets that can act glow, and the End turn button shows');
      const click = (x, y) => app.handler.onClick(BOARD_X + x * CELL + 5, BOARD_Y + y * CELL + 5);
      click(5, 5); check(app.selected === brute.id && app.highlight.get('6,5') === 'attack', 'move: clicking a pet selects it and shows what it can attack in red');
      check([...app.highlight.values()].filter((k) => k === 'move').length === 7, 'move: and where it can walk in blue (a headteacher moves 1: 8 squares less the pig = 7)');
      click(6, 5); await settle(); await settle();
      check(!g.units.includes(pig) && brute.acted, 'move: clicking the red square attacks (a headteacher always beats a guinea pig)');
      check(app.selected === null, 'move: the pet is let go after attacking');
      click(5, 5); check(app.selected === null, 'move: a pet that has acted cannot be picked again');
      app.handler.onKey(' '); await turn;
      check(!app.showEndTurn && app.highlight.size === 0, 'move: Space ends the turn and clears the board');
      // Tab cycles through your pets; Escape lets go
      g = blank(2, 4); app.game = g; app.views.clear(); w = g.wizards[0]; w.human = true;
      const a = place(g, 0, 'frog', 3, 2), b = place(g, 0, 'cat', 3, 7);
      const t2 = humanMoveTurn(w); render();
      app.handler.onKey('Tab'); const first = app.selected; app.handler.onKey('Tab'); const second = app.selected;
      check(first !== null && second !== null && first !== second, 'move: Tab cycles to the next pet that can act');
      app.handler.onKey('Escape'); check(app.selected === null, 'move: Escape lets go of the selected pet');
      void a; void b; app.handler.onKey(' '); await t2;
      app.onSleep = null; app.fast = false;
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
      check(peak > 0.05 && peak < 0.8, `music renders ${seconds.toFixed(1)}s, audible and not clipping (peak ${peak.toFixed(2)}, rms ${Math.sqrt(sumSq / data.length).toFixed(3)})`);
    }
  } catch (e) {
    failures++; out.push('EXCEPTION: ' + e.stack);
  }
  document.getElementById('out').textContent = out.join('\n') + '\nDONE failures=' + failures;
  const problems = out.filter((l) => /^(FAIL|ERROR|EXCEPTION)/.test(l));
  const infos = out.filter((l) => l.startsWith('info:')).map((l) => l.slice(6));
  document.title = `DONE failures=${failures}${problems.length ? ' :: ' + problems.join(' | ') : ''} :: ${infos.join(' || ')}`;
})();
