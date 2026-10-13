'use strict';

// Rules checks for St Ghoulsby's. Run by tests/run-jsc.sh (no browser needed).

function runAllChecks(print) {
  let failures = 0, passes = 0;
  const check = (name, ok, detail = '') => {
    if (ok) passes++; else { failures++; print(`FAIL ${name}${detail ? ': ' + detail : ''}`); }
  };
  const run = (g, secs) => { for (let i = 0; i < secs / TICK && !g.result; i++) g.tick(); };
  const stats = (g) => `cured=${g.cured} stormed=${g.stormed} sentHome=${g.sentHome} money=${Math.round(g.money)} rep=${g.rep}`;

  // A starter clinic: one of each room, staffed, with a treatment room upstairs so the lift gets used.
  // It copes for the first two nights; after that the rush needs more rooms (see the next check).
  const fullClinic = (seed) => {
    const g = new Clinic({ seed, goal: { cured: 999, money: 1e9 }, money: 4000 });
    g.build('consult', 0, 1); g.build('coffin', 0, 2); g.build('rewinder', 1, 0);
    g.hire('doctor'); g.hire('nurse'); g.hire('nurse');
    return g;
  };

  {
    const g = fullClinic(1);
    const curedKinds = new Set();
    for (let i = 0; i < 2 * NIGHT / TICK; i++) {
      g.tick();
      for (const e of g.events) if (e.type === 'cured') curedKinds.add(g.patientById(e.patientId).ailment);
      g.events.length = 0;
    }
    check('a full clinic cures monsters', g.cured >= 20, stats(g));
    check('a full clinic rarely loses patients', g.stormed + g.sentHome <= 2, stats(g));
    check('a full clinic makes money', g.money > 4000 - 2550, stats(g));
    check('a full clinic gains reputation', g.rep > 50, stats(g));
    check('both ailments get cured', curedKinds.size === 2, [...curedKinds].join(','));
    const stuck = g.patients.filter((p) => g.time - p.arrived > 75);
    check('nobody is stuck in the building', !stuck.length, stuck.map((p) => `${p.name} (${p.want}, floor ${p.floor}, x ${Math.round(p.x)})`).join(', '));
  }

  {
    const lazy = fullClinic(8), busy = fullClinic(8);
    busy.build('consult', 2, 0); busy.hire('doctor'); busy.build('lounge', 0, 3);
    // both players sell any statue as soon as it appears, as a real player would
    for (const g of [lazy, busy]) for (let i = 0; i < 5 * NIGHT / TICK; i++) { g.tick(); for (const st of [...g.statues]) g.sellStatue(st.id); }
    check('by night five the starter clinic is swamped', lazy.stormed >= 10, stats(lazy));
    check('a second crypt and a lounge cope with the rush', busy.stormed < lazy.stormed / 2 && busy.cured > lazy.cured, `${stats(busy)} vs ${stats(lazy)}`);
  }

  {
    const g = fullClinic(2);
    let upstairs = false;
    for (let i = 0; i < 120 / TICK; i++) { g.tick(); if (g.patients.some((p) => p.floor === 1 && p.busy)) upstairs = true; }
    check('mummies ride the lift to the rewinder upstairs', upstairs);
    check('staff reach an upstairs room', g.staff.some((s) => s.kind === 'nurse' && s.floor === 1));
  }

  {
    const g = new Clinic({ seed: 3, goal: { cured: 999, money: 1e9 } });
    g.build('consult', 0, 1); g.hire('doctor');
    run(g, 120);
    check('with no treatment rooms nobody is cured', g.cured === 0, stats(g));
    check('with no treatment rooms they are sent home after diagnosis', g.sentHome >= 5, stats(g));
    check('they still pay for the diagnosis', g.money > 3000 - 400 - 200 - 60, stats(g));
  }

  {
    const g = new Clinic({ seed: 4, goal: { cured: 999, money: 1e9 } });
    g.build('consult', 0, 1);
    run(g, 150);
    check('with no doctor monsters storm out', g.stormed >= 3, stats(g));
    check('storming out costs reputation', g.rep < 50, stats(g));
  }

  {
    const g = new Clinic({ seed: 5, goal: { cured: 999, money: 1e9 } });
    check('cannot build on reception', !g.build('consult', 0, 0).ok);
    check('can build in an empty slot', g.build('consult', 2, 4).ok);
    check('cannot build off the map', !g.canBuild('consult', 3, 0).ok);
    const before = g.money;
    const room = g.roomAt(2, 4);
    const d = g.demolish(room.id);
    check('demolishing refunds half', d.ok && g.money === before + 200, `${g.money} vs ${before}`);
    check('reception cannot be demolished', !g.demolish(g.rooms[0].id).ok);
    g.money = 100;
    const r = g.build('coffin', 0, 3);
    check('cannot build without the money', !r.ok && /£800/.test(r.why), JSON.stringify(r));
    check('cannot hire without the money', !g.hire('doctor').ok);
    let threw = false;
    try { g.build('spaceship', 0, 1); } catch (e) { threw = e instanceof GameError; }
    check('building an unknown room is an error', threw);
    check('the receptionist cannot be fired', !g.fire(g.staff[0].id).ok);
  }

  {
    const g = fullClinic(6);
    run(g, 60);
    const coffin = g.rooms.find((r) => r.type === 'coffin');
    const waiting = coffin.queue.length + (coffin.current ? 1 : 0);
    g.build('coffin', 2, 2);
    g.demolish(coffin.id);
    run(g, 120);
    check('demolishing a busy room sends its patients to another one', g.sentHome === 0 && g.cured > 5, `${stats(g)} waiting=${waiting}`);
  }

  {
    const g = new Clinic({ seed: 7, goal: { cured: 999, money: 1e9 } });
    g.build('consult', 0, 1); g.hire('doctor');
    const before = g.money;
    let paid = 0;
    for (let i = 0; i < (NIGHT + 1) / TICK; i++) { g.tick(); for (const e of g.events) if (e.type === 'payday') paid = -e.amount; g.events.length = 0; }
    check('wages are paid at dawn', paid === STAFF.doctor.wage + STAFF.receptionist.wage, `paid ${paid}`);
    check('the night counter moves on', g.night === 2);
    check('the money reflects wages and fees', g.money !== before);
  }

  {
    const a = fullClinic(9), b = fullClinic(9);
    run(a, 200); run(b, 200);
    check('the same seed plays out the same', stats(a) === stats(b), `${stats(a)} | ${stats(b)}`);
  }

  {
    const g = new Clinic({ seed: 10, goal: { cured: 999, money: 1e9 } });
    run(g, 1200);
    check('a clinic with no doctor loses its reputation', g.result === 'lost' && /reputation/.test(g.loseReason), `${g.result} ${stats(g)}`);
  }

  {
    const g = new Clinic({ seed: 11, goal: { cured: 10, money: 3000 }, money: 4000 });
    g.build('consult', 0, 1); g.build('coffin', 0, 2); g.build('rewinder', 0, 3);
    g.hire('doctor'); g.hire('nurse'); g.hire('nurse');
    run(g, 900);
    check('the goal can be reached', g.result === 'won', `${g.result} ${stats(g)}`);
  }

  {
    const g = new Clinic({ seed: 12, goal: { cured: 999, money: 1e9 } });
    g.build('consult', 0, 1); g.hire('doctor');
    g.build('lounge', 0, 2); g.build('lounge', 0, 3);
    check('lounges slow the loss of patience', g.patienceLoss() < new Clinic().patienceLoss());
  }

  {
    // nobody to see them, so monsters storm out and walk past Medusa's desk
    const g = new Clinic({ seed: 13, goal: { cured: 999, money: 1e9 } });
    g.build('consult', 0, 2);
    run(g, 150);
    check('Medusa turns monsters who storm out to stone', g.petrified >= 3 && g.statues.length === g.petrified, stats(g) + ` petrified=${g.petrified}`);
    const left = g.stormed - g.patients.filter((p) => p.mood === 'stormed').length;
    check('with the lobby full, stormers get away', g.statues.length === STATUE_SPOTS.length && left > g.petrified, `petrified=${g.petrified} stormed=${g.stormed}`);
    check('statues stand in the lobby', g.statues.every((st) => st.x >= slotLeft(0) && st.x < slotLeft(1)), g.statues.map((st) => Math.round(st.x)).join(','));
    check('statues each have their own spot', new Set(g.statues.map((st) => st.x)).size === g.statues.length);
    check('the lobby holds at most five statues', g.statues.length <= STATUE_SPOTS.length, `${g.statues.length}`);

    const plain = new Clinic({ seed: 14 });
    const before = g.patienceLoss();
    const n = g.statues.length;
    check('statues make waiting monsters more nervous', before > plain.patienceLoss() * (1 + 0.1 * n) - 1e-9 && before > plain.patienceLoss());
    const money = g.money;
    g.sellStatue(g.statues[0].id);
    check('selling a statue earns money and removes it', g.money === money + STATUE_PRICE && g.statues.length === n - 1);
    let threw = false;
    try { g.sellStatue(-1); } catch (e) { threw = e instanceof GameError; }
    check('selling a missing statue is an error', threw);
  }

  {
    // a statue costs 2 reputation in all, not the 3 that storming out costs
    const g = new Clinic({ seed: 15, goal: { cured: 999, money: 1e9 } });
    const p = { id: 999, kind: 'vampire', ailment: 'sizzle', name: 'Test', floor: 0, x: 200, dir: -1, ride: null, want: 'reception', roomId: null, busy: false, cured: false, mood: 'ok', patience: 0.001, paid: 0, arrived: 0, shout: null, shoutFor: 0 };
    g.patients.push(p);
    g.rep = 50;
    g.tickPatient(p);
    check('storming out costs 3 reputation', g.rep === 47, `rep ${g.rep}`);
    for (let i = 0; i < 600 && g.patients.includes(p); i++) g.tickPatient(p);
    check('being turned to stone gives 1 back', g.rep === 48 && g.statues.length === 1, `rep ${g.rep} statues ${g.statues.length}`);
  }

  print(`DONE passes=${passes} failures=${failures}`);
}
