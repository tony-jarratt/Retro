'use strict';

// St Ghoulsby's Infirmary: the rules. Nothing here draws, so the checks can run it without a browser.
// The clinic is a side-on cutaway: FLOORS floors of SLOTS room slots, with a lift at the right-hand end.
// Positions are in art pixels: x across the screen, and a floor number (0 is the ground floor).

const TICK = 1 / 20;                 // seconds per tick
const NIGHT = 90;                    // seconds per night shift (wages are paid at dawn)
const FLOORS = 3, SLOTS = 5;
const SLOT_X0 = 48, SLOT_W = 72;     // slot s spans SLOT_X0 + s * SLOT_W .. + SLOT_W
const LIFT_X = SLOT_X0 + SLOTS * SLOT_W + 12;
const DOOR_X = 30, OFFSCREEN_X = -16;
const WALK = 26, FLOAT = 30;         // pixels per second
const LIFT_SECS = 1.1;               // seconds per floor
const MAX_PATIENTS = 28;

const ROOMS = {
  reception: { name: 'Reception', cost: 0, staff: 'receptionist', time: 1.5, fixed: true },
  consult: { name: 'Consulting Crypt', cost: 400, staff: 'doctor', time: 5, fee: 60, blurb: 'A doctor works out what ails them' },
  coffin: { name: 'Coffin Cooler', cost: 800, staff: 'nurse', time: 7, fee: 200, blurb: 'Cures Daylight Sizzle' },
  rewinder: { name: 'Bandage Rewinder', cost: 1000, staff: 'nurse', time: 8, fee: 260, blurb: 'Cures Unravelling' },
  lounge: { name: 'Gloom Lounge', cost: 300, blurb: 'Waiting monsters stay calm for longer' },
};
const BUILDABLE = ['consult', 'coffin', 'rewinder', 'lounge'];
const STAFF = {
  receptionist: { name: 'Receptionist', hire: 0, wage: 15 },
  doctor: { name: 'Doctor', hire: 200, wage: 45 },
  nurse: { name: 'Nurse', hire: 150, wage: 30 },
};
const HIREABLE = ['doctor', 'nurse'];
const AILMENTS = {
  sizzle: { name: 'Daylight Sizzle', monster: 'vampire', room: 'coffin' },
  unravel: { name: 'Unravelling', monster: 'mummy', room: 'rewinder' },
};

const NAMES = {
  vampire: ['Count Vlad', 'Lady Nocturna', 'Baron Fangsworth', 'Countess Batilda', 'Sir Neckbiter', 'Vincent', 'Duchess Drac', 'Old Nosferatu'],
  mummy: ['Ramesses', 'Tutty', 'Queen Nefer', 'Pharaoh Phil', 'Cleo', 'Amun-Ra-Ra', 'Imhotep Jr', 'Aunt Ankh'],
};
const STORM_LINES = ['I\'m off to the witch doctor!', 'Disgraceful! One star!', 'I could have died! Again!', 'Pah! I\'ll heal myself!', 'My lawyer is a banshee!'];
const MEDUSA_LINES = ['Manners!', 'Rude.', 'Hissss!', 'Take a seat. Forever.', 'Next!', 'Stone me...'];
const STATUE_PRICE = 75;
const STATUE_NERVES = 0.1;           // each statue in the lobby makes waiting monsters lose patience 10% faster
const MEDUSA_REACH = 14;             // how far past her desk Medusa's glare reaches
const STATUE_SPOTS = [5, 14, 23, 57, 66];   // where statues stand in the lobby, either side of the desk (x within slot 0)
const HOME_LINES = { sizzle: 'No Coffin Cooler? Back to my crypt, then.', unravel: 'No Bandage Rewinder? I\'ll use sticky tape.' };

const slotLeft = (s) => SLOT_X0 + s * SLOT_W;
const slotOf = (x) => Math.floor((x - SLOT_X0) / SLOT_W);

// A small seeded random number generator, so a game with a given seed always plays out the same way.
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class GameError extends Error {}

class Clinic {
  constructor(opts = {}) {
    this.rng = makeRng(opts.seed ?? 1);
    this.goal = opts.goal ?? { cured: 60, money: 12000 };
    this.money = opts.money ?? 3000;
    this.rep = 50;
    this.time = 0;               // seconds since the doors opened
    this.night = 1;
    this.cured = 0; this.stormed = 0; this.sentHome = 0; this.seen = 0;
    this.result = null;          // 'won' | 'lost' once the game is over
    this.loseReason = '';
    this.nextId = 1;
    this.rooms = [];             // { id, type, floor, slot, queue: [patient ids], current: patient id | null, timer, staffId }
    this.staff = [];             // { id, kind, name, floor, x, dir, roomId, ride, walking }
    this.patients = [];          // see admit()
    this.statues = [];           // { id, kind, sick, name, x, dir }: monsters Medusa turned to stone
    this.petrified = 0;
    this.events = [];            // for the screen: sounds, floating money, messages. The screen empties it.
    this.log = [];               // { text, at } newest last
    this.arrivalIn = opts.firstArrival ?? 3;
    this.ailments = opts.ailments ?? Object.keys(AILMENTS);
    this.addRoom('reception', 0, 0);
    this.addStaff('receptionist', this.rooms[0].id);
  }

  say(text, kind = 'info') { this.log.push({ text, at: this.time, kind }); this.events.push({ type: 'message', text, kind }); }
  emit(ev) { this.events.push(ev); }

  roomAt(floor, slot) { return this.rooms.find((r) => r.floor === floor && r.slot === slot) || null; }
  roomById(id) { return this.rooms.find((r) => r.id === id) || null; }
  patientById(id) { return this.patients.find((p) => p.id === id) || null; }
  staffById(id) { return this.staff.find((s) => s.id === id) || null; }

  addRoom(type, floor, slot) {
    const room = { id: this.nextId++, type, floor, slot, queue: [], current: null, timer: 0, staffId: null };
    this.rooms.push(room);
    return room;
  }

  addStaff(kind, roomId = null) {
    const names = { receptionist: ['Medusa'], doctor: ['Dr Frankenfurter', 'Dr Jekyll-Hyde', 'Dr Igorovich', 'Dr Moreau-ish'], nurse: ['Nurse Wisp', 'Nurse Boo', 'Nurse Mistral', 'Nurse Shroud'] }[kind];
    const n = this.staff.filter((s) => s.kind === kind).length;
    const room = roomId ? this.roomById(roomId) : null;
    const s = {
      id: this.nextId++, kind, name: names[n % names.length], floor: 0,
      x: room ? staffX(room) : DOOR_X, dir: 1, roomId: null, ride: null, walking: false, shout: null, shoutFor: 0,
    };
    this.staff.push(s);
    if (room) { room.staffId = s.id; s.roomId = room.id; }
    return s;
  }

  // ---- what the player can do. Each returns { ok, why } so the screen can say why something didn't happen.

  canBuild(type, floor, slot) {
    const def = ROOMS[type];
    if (!def || def.fixed) throw new GameError(`"${type}" is not a room you can build`);
    if (floor < 0 || floor >= FLOORS || slot < 0 || slot >= SLOTS) return { ok: false, why: 'That is not a room slot' };
    if (this.roomAt(floor, slot)) return { ok: false, why: 'Something is already built there' };
    if (this.money < def.cost) return { ok: false, why: `${def.name} costs £${def.cost}` };
    return { ok: true };
  }

  build(type, floor, slot) {
    const can = this.canBuild(type, floor, slot);
    if (!can.ok) return can;
    const def = ROOMS[type];
    this.money -= def.cost;
    const room = this.addRoom(type, floor, slot);
    this.emit({ type: 'built', roomId: room.id, floor, x: slotLeft(slot) + SLOT_W / 2, amount: -def.cost });
    return { ok: true, room };
  }

  // Knocks a room down for half its cost back. Whoever was in it or queueing goes and finds another one.
  demolish(roomId) {
    const room = this.roomById(roomId);
    if (!room) throw new GameError(`no room with id ${roomId}`);
    const def = ROOMS[room.type];
    if (def.fixed) return { ok: false, why: `The ${def.name} can't be knocked down` };
    const refund = Math.floor(def.cost / 2);
    this.money += refund;
    for (const pid of [...room.queue, room.current]) {
      const p = pid && this.patientById(pid);
      if (p) { p.roomId = null; p.busy = false; }
    }
    const s = room.staffId && this.staffById(room.staffId);
    if (s) s.roomId = null;
    this.rooms = this.rooms.filter((r) => r !== room);
    this.emit({ type: 'demolished', floor: room.floor, x: slotLeft(room.slot) + SLOT_W / 2, amount: refund });
    return { ok: true, refund };
  }

  canHire(kind) {
    const def = STAFF[kind];
    if (!def || !HIREABLE.includes(kind)) throw new GameError(`"${kind}" is not staff you can hire`);
    if (this.money < def.hire) return { ok: false, why: `Hiring a ${def.name} costs £${def.hire}` };
    return { ok: true };
  }

  hire(kind) {
    const can = this.canHire(kind);
    if (!can.ok) return can;
    this.money -= STAFF[kind].hire;
    const s = this.addStaff(kind);
    s.x = OFFSCREEN_X;
    this.emit({ type: 'hired', staffId: s.id, floor: 0, x: DOOR_X, amount: -STAFF[kind].hire });
    return { ok: true, staff: s };
  }

  fire(staffId) {
    const s = this.staffById(staffId);
    if (!s) throw new GameError(`no staff member with id ${staffId}`);
    if (s.kind === 'receptionist') return { ok: false, why: 'Medusa has a contract. Nobody argues with Medusa.' };
    const room = s.roomId && this.roomById(s.roomId);
    if (room) room.staffId = null;
    this.staff = this.staff.filter((t) => t !== s);
    this.emit({ type: 'fired', floor: s.floor, x: s.x });
    return { ok: true };
  }

  // ---- the simulation

  tick() {
    if (this.result) return;
    this.time += TICK;
    const night = Math.floor(this.time / NIGHT) + 1;
    if (night > this.night) { this.night = night; this.payday(); }
    this.arrivalIn -= TICK;
    if (this.arrivalIn <= 0) {
      if (this.patients.length < MAX_PATIENTS) this.admit();
      this.arrivalIn = this.arrivalGap();
    }
    for (const s of this.staff) this.tickStaff(s);
    for (const room of this.rooms) this.tickRoom(room);
    for (const p of [...this.patients]) this.tickPatient(p);
    this.checkEnd();
  }

  // More reputation, more monsters at the door: one every 10 s at 0%, one every 4 s at 100%,
  // and word spreads, so each night brings them 15% faster than the last.
  arrivalGap() { return (10 - this.rep * 0.06) * Math.pow(0.85, this.night - 1) * (0.75 + this.rng() * 0.5); }

  payday() {
    const wages = this.staff.reduce((t, s) => t + STAFF[s.kind].wage, 0);
    this.money -= wages;
    this.emit({ type: 'payday', amount: -wages });
    this.say(`Dawn. Night ${this.night - 1} is over: £${wages} paid in wages.`, 'money');
  }

  admit() {
    const ailment = this.ailments[Math.floor(this.rng() * this.ailments.length)];
    const kind = AILMENTS[ailment].monster;
    const names = NAMES[kind];
    const p = {
      id: this.nextId++, kind, ailment, name: names[Math.floor(this.rng() * names.length)],
      floor: 0, x: OFFSCREEN_X, dir: 1, ride: null, walking: false,
      want: 'reception',      // the room type they are looking for, or 'exit'
      roomId: null,           // the room they are queueing for or in
      busy: false,            // being seen in a room
      diagnosed: false, cured: false, mood: 'ok', shout: null, shoutFor: 0,
      patience: 1,            // falls while they wait; at 0 they storm out
      paid: 0,
      arrived: this.time,
    };
    this.patients.push(p);
    this.seen++;
    this.emit({ type: 'arrive', patientId: p.id });
  }

  lounges() { return this.rooms.filter((r) => r.type === 'lounge').length; }

  // Each lounge makes waiting monsters lose patience 25% slower, up to three lounges.
  // and each statue in the lobby makes them 10% more nervous.
  patienceLoss() { return (1 / 50) * (1 - 0.25 * Math.min(3, this.lounges())) * (1 + STATUE_NERVES * this.statues.length); }

  // Everyone storming out has to pass the reception desk, and Medusa does not tolerate rudeness.
  inMedusasGaze(p) {
    const desk = this.rooms.find((r) => r.type === 'reception');
    const medusa = desk && desk.staffId && this.staffById(desk.staffId);
    return !!medusa && p.floor === 0 && !p.ride && p.x <= staffX(desk) + MEDUSA_REACH;
  }

  // Turns a patient to stone where they stand. A statue can't spread bad reviews, so this gives back
  // some of the reputation they cost by storming out.
  petrify(p) {
    const desk = this.rooms.find((r) => r.type === 'reception');
    const medusa = this.staffById(desk.staffId);
    this.patients = this.patients.filter((q) => q !== p);
    const x = this.freeStatueSpots().reduce((best, sx) => (Math.abs(sx - p.x) < Math.abs(best - p.x) ? sx : best));
    const statue = { id: this.nextId++, kind: p.kind, sick: !p.cured, name: p.name, x, dir: p.dir };
    this.statues.push(statue);
    this.petrified++;
    this.rep = Math.min(100, this.rep + 1);
    medusa.shout = MEDUSA_LINES[this.petrified % MEDUSA_LINES.length]; medusa.shoutFor = 2.5;
    this.say(`Medusa turned ${p.name} to stone. Statues tell no tales, so the bad review never gets out.`, 'info');
    this.emit({ type: 'petrified', statueId: statue.id, x, fromX: medusa.x });
  }

  freeStatueSpots() {
    return STATUE_SPOTS.map((dx) => slotLeft(0) + dx).filter((x) => !this.statues.some((st) => st.x === x));
  }

  sellStatue(id) {
    const statue = this.statues.find((st) => st.id === id);
    if (!statue) throw new GameError(`no statue with id ${id}`);
    this.statues = this.statues.filter((st) => st !== statue);
    this.money += STATUE_PRICE;
    this.emit({ type: 'statueSold', x: statue.x, amount: STATUE_PRICE });
    this.say(`The statue of ${statue.name} went to the Gargoyle Gallery for £${STATUE_PRICE}.`, 'money');
    return { ok: true };
  }

  tickPatient(p) {
    if (p.shoutFor > 0) { p.shoutFor -= TICK; if (p.shoutFor <= 0) p.shout = null; }
    if (p.want === 'exit') {
      p.roomId = null;
      if (p.mood === 'stormed' && !p.spared && this.inMedusasGaze(p)) {
        if (this.freeStatueSpots().length) { this.petrify(p); return; }
        p.spared = true;
        this.say(`The lobby is full of statues, so Medusa had to let ${p.name} go. Sell some statues!`, 'bad');
      }
      if (this.moveTo(p, 0, OFFSCREEN_X, WALK)) this.patients = this.patients.filter((q) => q !== p);
      return;
    }
    if (p.busy) return;               // the room ticks them
    p.patience -= this.patienceLoss() * TICK;
    p.mood = p.patience < 0.3 ? 'cross' : p.patience < 0.6 ? 'fed up' : 'ok';
    if (p.patience <= 0) { this.stormOut(p); return; }

    let room = p.roomId && this.roomById(p.roomId);
    if (!room) {
      room = this.chooseRoom(p);
      if (!room) {
        if (ROOMS[p.want] && AILMENTS[p.ailment].room === p.want) { this.sendHome(p); return; }
        this.moveTo(p, 0, this.lobbySpot(p), WALK);      // nowhere to go yet: hang about in the lobby
        return;
      }
      p.roomId = room.id;
      room.queue.push(p.id);
    }
    const idx = room.queue.indexOf(p.id);
    const spot = queueX(room, idx);
    const there = this.moveTo(p, room.floor, spot, WALK);
    if (there && idx === 0 && !room.current && this.staffedAndReady(room)) {
      room.queue.shift();
      room.current = p.id;
      room.timer = ROOMS[room.type].time;
      p.busy = true;
      p.x = useX(room);
      p.dir = -1;                     // facing whoever is treating them
      this.emit({ type: 'enter', roomId: room.id, patientId: p.id });
    }
  }

  // Where a lost patient loiters: spread out across the lobby so they don't stand on each other.
  lobbySpot(p) { return slotLeft(0) + 8 + (p.id * 7) % 30; }

  chooseRoom(p) {
    const rooms = this.rooms.filter((r) => r.type === p.want);
    if (!rooms.length) return null;
    const cost = (r) => r.queue.length + (r.current ? 1 : 0) + (r.staffId ? 0 : 4) + Math.abs(r.floor - p.floor) * 0.5;
    return rooms.reduce((best, r) => (cost(r) < cost(best) ? r : best));
  }

  staffedAndReady(room) {
    if (!ROOMS[room.type].staff) return false;
    const s = room.staffId && this.staffById(room.staffId);
    return !!s && s.floor === room.floor && !s.ride && Math.abs(s.x - staffX(room)) < 1;
  }

  tickRoom(room) {
    if (!room.current || !this.staffedAndReady(room)) return;     // treatment pauses while the staff member is away
    room.timer -= TICK;
    if (room.timer > 0) return;
    const p = this.patientById(room.current);
    room.current = null;
    if (!p) return;
    p.busy = false;
    p.roomId = null;
    const def = ROOMS[room.type];
    if (room.type === 'reception') {
      p.want = 'consult';
    } else if (room.type === 'consult') {
      p.diagnosed = true;
      p.want = AILMENTS[p.ailment].room;
      this.pay(p, def.fee, room);
      this.emit({ type: 'diagnosed', patientId: p.id, roomId: room.id });
    } else {
      p.cured = true;
      p.want = 'exit';
      p.patience = 1;
      p.mood = 'cured';
      this.pay(p, def.fee, room);
      this.cured++;
      this.rep = Math.min(100, this.rep + 2);
      this.shout(p, 'Cured! Marvellous!');
      this.emit({ type: 'cured', patientId: p.id, roomId: room.id, floor: room.floor, x: p.x });
    }
  }

  pay(p, amount, room) {
    this.money += amount;
    p.paid += amount;
    this.emit({ type: 'cash', amount, floor: room.floor, x: slotLeft(room.slot) + SLOT_W / 2 });
  }

  shout(p, text) { p.shout = text; p.shoutFor = 3; }

  stormOut(p) {
    this.leaveQueue(p);
    p.want = 'exit';
    p.mood = 'stormed';
    this.stormed++;
    this.rep = Math.max(0, this.rep - 3);
    this.shout(p, STORM_LINES[this.stormed % STORM_LINES.length]);
    this.say(`${p.name} got fed up of waiting and stormed out.`, 'bad');
    this.emit({ type: 'stormed', patientId: p.id });
  }

  sendHome(p) {
    this.leaveQueue(p);
    p.want = 'exit';
    p.mood = 'sent home';
    this.sentHome++;
    this.rep = Math.max(0, this.rep - 1);
    this.shout(p, HOME_LINES[p.ailment]);
    this.say(`${p.name} has ${AILMENTS[p.ailment].name}, but there's no ${ROOMS[AILMENTS[p.ailment].room].name} to cure it.`, 'bad');
    this.emit({ type: 'sentHome', patientId: p.id });
  }

  leaveQueue(p) {
    const room = p.roomId && this.roomById(p.roomId);
    if (room) room.queue = room.queue.filter((id) => id !== p.id);
    p.roomId = null;
  }

  tickStaff(s) {
    if (s.shoutFor > 0) { s.shoutFor -= TICK; if (s.shoutFor <= 0) s.shout = null; }
    let room = s.roomId && this.roomById(s.roomId);
    if (!room) {
      room = this.rooms.find((r) => ROOMS[r.type].staff === s.kind && !r.staffId) || null;
      if (room) { room.staffId = s.id; s.roomId = room.id; }
    }
    const speed = s.kind === 'nurse' ? FLOAT : WALK;
    if (room) this.moveTo(s, room.floor, staffX(room), speed);
    else this.moveTo(s, 0, slotLeft(0) + 40 + (s.id * 5) % 20, speed);   // nothing to do: wait in the lobby
  }

  // Walks (and rides the lift) towards a floor and x. Returns true once there.
  moveTo(e, floor, x, speed) {
    e.walking = false;
    if (e.ride) {
      e.ride.t += TICK;
      if (e.ride.t >= e.ride.dur) { e.floor = e.ride.to; e.ride = null; }
      return false;
    }
    const goalX = e.floor === floor ? x : LIFT_X;
    const dx = goalX - e.x;
    if (Math.abs(dx) > 0.01) {
      const step = Math.min(Math.abs(dx), speed * TICK);
      e.x += Math.sign(dx) * step;
      e.dir = Math.sign(dx);
      e.walking = true;
      return false;
    }
    if (e.floor !== floor) {
      e.ride = { from: e.floor, to: floor, t: 0, dur: Math.abs(floor - e.floor) * LIFT_SECS };
      this.emit({ type: 'lift' });
      return false;
    }
    return true;
  }

  checkEnd() {
    if (this.cured >= this.goal.cured && this.money >= this.goal.money) {
      this.result = 'won';
      this.emit({ type: 'won' });
    } else if (this.money < -1000) {
      this.result = 'lost'; this.loseReason = 'The bank has foreclosed. The bats have repossessed the belfry.';
      this.emit({ type: 'lost' });
    } else if (this.rep <= 0) {
      this.result = 'lost'; this.loseReason = 'Your reputation is dead, and not in the good way. Nobody will come.';
      this.emit({ type: 'lost' });
    }
  }
}

// Inside a room slot: patients queue on the left (spilling into the room next door if the line is long),
// the staff member stands in the middle and the patient being seen stands on the right.
const queueX = (room, idx) => slotLeft(room.slot) + 26 - 8 * idx;
const staffX = (room) => slotLeft(room.slot) + 38;
const useX = (room) => slotLeft(room.slot) + 56;
