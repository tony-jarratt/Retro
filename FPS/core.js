// THE OBJECTIVE: destroy the security core, then reach the exit lift.
//
// In the lab the objective is the BREEDING CHAMBER instead (a level's
// objective: 'chamber', map.js), and in the HQ the MOTHER PLANT
// ('motherplant'). They look, light and read differently (OBJECTIVE_LOOKS
// below), but it's the same thing underneath: K cells that take CORE_HEALTH
// hits (or one demolition charge: charge.js), and everything below works the same.
//
// The first level of each pair has a simpler objective, the LIFT KEY
// ('liftkey'): no K cells, but a 'liftkey' pickup somewhere in the level.
// The lift won't go without it, and taking it is noticed: the whole level
// comes for you, just as if a core had gone down (but the security stays
// on: turrets, cameras and tripwires keep working).
//
// The CORE is a stretch of wall ('K' cells in a level's rows; several cells are one
// core) running the facility's security network. Every turret is wired to
// it: terminals can blind a zone's cameras, but only the core going down
// shuts the turrets, cameras and tripwires off. It doesn't fight back; it
// relies on what's guarding it. It takes CORE_HEALTH hits (shots, or blasts:
// a drum set off next to it is worth having).
//
// When it goes, it takes the whole security network with it, and the
// facility knows: a FACILITY-WIDE ALARM that never stops. Every hive opens,
// every pack wakes, every robot comes looking. Get to the LIFT ('L' cells),
// which unlocks as the core dies. Reach it and the level is done.

const CORE_HEALTH = 18;
const LIFT_RANGE = 1.0;          // cells from the lift's face: walk up to it

// What each kind of objective looks like and what the HUD calls it.
//   textures   [damage][pulse] live frames, and the wreck
//   light      the colour its heart throws into the room
//   goal       shown as the level starts; done, when it goes; liftHint, at a locked lift
//   creatures  its level's enemies are creatures: when it goes, they come loose (creatures.js)
const OBJECTIVE_LOOKS = {
  core: {
    textures: CORE_TEXTURES, dead: CORE_DEAD_TEXTURE, light: { colour: [1.2, 0.15, 0.1], radius: 3 },
    goal: 'DESTROY THE SECURITY CORE', done: 'CORE DESTROYED  GET TO THE LIFT', liftHint: 'LIFT LOCKED  DESTROY THE CORE',
  },
  chamber: {
    textures: CHAMBER_TEXTURES, dead: CHAMBER_DEAD_TEXTURE, light: { colour: [0.25, 0.7, 0.15], radius: 3 },
    goal: 'BURN THE BREEDING CHAMBER', done: 'CHAMBER BURNT  GET TO THE LIFT', liftHint: 'LIFT LOCKED  BURN THE CHAMBER',
    creatures: true,
  },
  motherplant: {
    textures: MOTHER_PLANT_TEXTURES, dead: MOTHER_PLANT_DEAD_TEXTURE, light: { colour: [1.3, 0.85, 0.35], radius: 3.5 },
    goal: 'BURN THE MOTHER PLANT', done: 'MOTHER PLANT BURNT  GET TO THE LIFT', liftHint: 'LIFT LOCKED  BURN THE PLANT',
    creatures: true,
  },
  // No textures or light: there are no K cells. Whether creatures come loose
  // depends on the level: yes if it has any.
  liftkey: {
    textures: null, dead: null, light: null,
    goal: 'FIND THE LIFT KEY', done: 'LIFT KEY TAKEN  GET TO THE LIFT', liftHint: 'LIFT LOCKED  FIND THE LIFT KEY',
    creatures: enemies.some((e) => ENEMY_TYPES[e.type].creature),
  },
};
const OBJECTIVE_LOOK = OBJECTIVE_LOOKS[OBJECTIVE];

// The core's state:
//   health   hits left
//   state    'online' or 'destroyed'
//   cells    its wall cells, each with `front`: the floor point just in front
//            of its face (where its light shines from, and blasts are measured to)
const core = { health: CORE_HEALTH, state: 'online', cells: [] };
const liftCells = [];

// Find the core and lift cells in the map, and the floor in front of each.
MAP.forEach((row, y) => row.forEach((cell, x) => {
  if (cell !== CORE_CELL && cell !== LIFT_CELL) return;
  const face = Object.entries(FACE_STEPS).find(([, [dx, dy]]) => MAP[y + dy]?.[x + dx] === 0);
  if (!face) throw new Error(`${cell === CORE_CELL ? 'Core' : 'Lift'} cell at MAP[${y}][${x}] has no floor beside it, so it can't be reached.`);
  const [dx, dy] = face[1];
  const entry = { x, y, front: { x: x + 0.5 + dx * 0.55, y: y + 0.5 + dy * 0.55 } };
  (cell === CORE_CELL ? core.cells : liftCells).push(entry);
}));
const LIFT_KEYS = PICKUPS.filter((p) => p.type === 'liftkey').length;
if (OBJECTIVE === 'liftkey') {
  if (core.cells.length > 0) throw new Error(`The level's objective is the lift key, but it has K cells in its rows: K cells are for a core, chamber or plant.`);
  if (LIFT_KEYS !== 1) throw new Error(`The level's objective is the lift key, so it needs exactly one 'liftkey' pickup; it has ${LIFT_KEYS}.`);
} else {
  if (core.cells.length === 0) throw new Error(`The level has no ${OBJECTIVE} (K cells in its rows).`);
  if (LIFT_KEYS > 0) throw new Error(`The level has a 'liftkey' pickup, but its objective is "${OBJECTIVE}": only lift-key levels have one.`);
}
if (liftCells.length === 0) throw new Error('The level has no exit lift (L cells in its rows).');

showSecurityMessage(OBJECTIVE_LOOK.goal); // the objective, as the level starts

// How damaged the core looks: 0 healthy, 1 hurt, 2 critical.
function coreDamage() {
  const left = core.health / CORE_HEALTH;
  return left > 0.66 ? 0 : left > 0.33 ? 1 : 2;
}

// The texture for a core cell this frame. The heart pulses (four brightness
// frames, there and back), faster the more damaged it is.
function coreTexture() {
  if (core.state === 'destroyed') return OBJECTIVE_LOOK.dead;
  const rate = [2, 4, 8][coreDamage()];
  const step = Math.floor(animTime * rate * 6) % 6;            // 0 1 2 3 2 1, round and round
  return OBJECTIVE_LOOK.textures[coreDamage()][[0, 1, 2, 3, 2, 1][step]];
}

function liftTexture() {
  return core.state === 'destroyed' ? LIFT_TEXTURES.open : LIFT_TEXTURES.locked;
}

function damageCore(hits) {
  if (core.state !== 'online') return;
  core.health = Math.max(0, core.health - hits);
  if (core.health === 0) destroyCore();
}

// A blast near the core (explosions.js): up to BLAST_ROBOT_HITS, less further
// away, measured to the nearest core cell's face.
function blastCore(x, y, blast) {
  if (core.state !== 'online') return;
  let best = Infinity;
  for (const c of core.cells) best = Math.min(best, Math.hypot(c.front.x - x, c.front.y - y));
  if (best < blast.radius) damageCore(Math.ceil(BLAST_ROBOT_HITS * blastStrength(blast, best)));
}

function destroyCore() {
  core.state = 'destroyed';
  // It goes up along its whole length: a blast at each cell's face (no
  // damage to you, but drones caught in it burn).
  for (const c of core.cells) explodeAt(c.front.x, c.front.y, { radius: 1.2, damage: 0 });
  // The security network dies with it.
  for (const c of cameras) if (c.state === 'watching') c.state = 'offline';
  for (const t of tripwires) t.state = 'offline';
  for (const e of enemies) if (e.type === 'turret' && e.state !== 'dead') e.state = 'offline';
  objectiveDone();
}

// The lift key picked up (pickups.js): the lift will go, and everything knows.
function takeLiftKey() {
  core.state = 'destroyed'; // the objective's done: the lift unlocks (updateCore)
  objectiveDone();
}

// Either way, the objective's done.
function objectiveDone() {
  // The whole facility knows. Infinity: this alarm never runs down.
  for (const z of ZONES) {
    raiseAlarm(z.id);
    alarms[z.id] = Infinity;
  }
  showSecurityMessage(OBJECTIVE_LOOK.done);
  if (OBJECTIVE_LOOK.creatures) creaturesComeLoose(); // creatures.js: every tank breaks, every pod bursts, everything hunts you
}

// The lift's hint while you stand at it with the core still running.
let liftHint = false;

function updateCore() {
  liftHint = false;
  const atLift = liftCells.some((c) => Math.hypot(player.x - c.front.x, player.y - c.front.y) < LIFT_RANGE);
  if (!atLift) return;
  if (core.state === 'destroyed') game.state = 'clear';
  else liftHint = true;
}

// The core's heart (or the chamber's eggs) throws a pulsing light into the room (lighting.js).
function addCoreLights(grid) {
  if (core.state !== 'online' || core.cells.length === 0) return; // a lift-key level has nothing to glow
  const level = 0.6 + 0.4 * Math.sin(animTime * [2, 4, 8][coreDamage()] * Math.PI);
  const { colour, radius } = OBJECTIVE_LOOK.light;
  for (const c of core.cells) addLight(grid, c.front.x, c.front.y, colour, radius, level);
}
