'use strict';

// Every tuning number for Hexfire lives in this file, so balancing never means touching the rules.
// All names here are original. Costs are in credits.

// ---------- body locations ----------
const LOCATIONS = ['HD', 'CT', 'RT', 'LT', 'RA', 'LA', 'RL', 'LL'];
const LOC_NAMES = {
  HD: 'HEAD', CT: 'CENTRE TORSO', RT: 'RIGHT TORSO', LT: 'LEFT TORSO',
  RA: 'RIGHT ARM', LA: 'LEFT ARM', RL: 'RIGHT LEG', LL: 'LEFT LEG',
};
// How likely each location is to be hit (relative weights).
const HIT_WEIGHTS = { HD: 1, CT: 3, RT: 2, LT: 2, RA: 2, LA: 2, RL: 2, LL: 2 };
// Share of a mech's armour / structure each location gets (relative weights; see armourAt, structureAt).
const ARMOUR_PATTERN = { HD: 2, CT: 4, RT: 3, LT: 3, RA: 3, LA: 3, RL: 3, LL: 3 };
const STRUCTURE_PATTERN = { HD: 3, CT: 5, RT: 4, LT: 4, RA: 3, LA: 3, RL: 4, LL: 4 };
const REAR_LOCS = ['CT', 'RT', 'LT'];   // only torsos have rear armour
const REAR_ARMOUR_FRACTION = 0.4;       // rear armour = this share of the front armour, rounded
// Where excess damage goes when a location is destroyed. The head and centre torso have no entry: they kill the mech.
const CARRY_TO = { RA: 'RT', LA: 'LT', RL: 'RT', LL: 'LT', RT: 'CT', LT: 'CT' };
const KILL_LOCS = ['HD', 'CT'];
const ARM_OF_TORSO = { RT: 'RA', LT: 'LA' }; // a destroyed torso takes the arm on its side with it
const LEG_LOCS = ['RL', 'LL'];
const ARM_LOCS = ['RA', 'LA'];
// Arms and legs go out of action as soon as their ARMOUR is shot away ("stripped"), well before their structure is
// gone: a stripped arm cannot use its weapons, one stripped leg halves the mech's speed and stops it running, and
// both legs stripped stop it moving. Structure behind the armour still absorbs hits, and when it is gone the limb is
// destroyed and the excess carries inward as before. Torsos and the head are not affected by being stripped.
const LIMB_LOCS = ARM_LOCS.concat(LEG_LOCS);

// ---------- damage model ----------
// 'pool' (the default, the simple game): each mech has ONE pool of armour points. Every hit comes straight off it;
// at zero the mech is destroyed. No hit locations, no lost limbs. A hit has a small chance of a critical that
// knocks out one of the target's weapons for the rest of the fight.
// 'locations' (the advanced game): the eight-location model with armour and structure per location, destroyed
// arms, legs and torsos, and stripped limbs (see LOCATIONS and LIMB_LOCS above).
const DAMAGE_MODELS = ['pool', 'locations'];
const DEFAULT_DAMAGE_MODEL = 'pool';
const POOL_SCALE = 0.4;        // (0.6 gave fights of 17 rounds at the median, 0.4 gives 12, 0.3 gives 10) pool = (a mech's armour + structure over all its locations) x this: in the location game a mech
                               // died when its head or centre torso went, which takes much less than all of its points
// Criticals and fumbles come from the to-hit roll itself: a natural 20 hits and knocks out one of the target's working weapons for
// good, a natural 1 misses and jams the firing weapon (it cannot fire in the shooter's next fire step; JAM_ROUNDS counts round ends).
const JAM_ROUNDS = 2;

// ---------- builds ----------
const ARMOUR_MAX = 7;           // armour level, 0 to 7
const SINKS_MAX = 7;            // extra heat sinks, 0 to 7
const SINK_COST = 3;            // credits per extra heat sink
const MAX_WEAPONS = 3;          // a mech makes at most three attacks a round: its build lists exactly three weapon slots (0 = empty)
// There are no fixed mounting positions. A weapon's picture and its mount (which limb the advanced damage model hangs it
// on) are assigned by slot number: first weapon right arm, second left arm, third centre torso.
const MOUNT_LOCS = ['RA', 'LA', 'CT'];
const SQUAD_MAX = 3;            // mechs per squad
// Credits per armour level. Roughly proportional to the armour points a level gives on that class, so armour
// costs about the same per point whatever the chassis (a level is about 15 points on a light, 38 on an assault).
const ARMOUR_COST_PER_LEVEL = { light: 2, medium: 3, heavy: 4, assault: 5 };

// Chassis ids 1 to 15 fit the code's 4 bits. capacity: how many weapon slots' worth of weapons it can carry (a weapon's `size`
// is how many it takes), shared out over at most MAX_WEAPONS weapons: heavier chassis carry bigger guns, not more of them.
// speed: walking movement points (running is 1.5x). Kept low so that a round's move is a fraction of the map. sinks: heat removed per round. armourScale / structureScale: size of the
// armour and structure patterns for this chassis.
const CHASSIS = [
  { id: 1, name: 'SKITTER',  cls: 'light',   speed: 5, sinks: 3, armourScale: 0.6, structureScale: 1,   cost: 12, capacity: 3 },
  { id: 2, name: 'JACKAL',   cls: 'light',   speed: 4, sinks: 4, armourScale: 0.7, structureScale: 1,   cost: 18, capacity: 3 },
  { id: 3, name: 'RANGER',   cls: 'medium',  speed: 3, sinks: 5, armourScale: 0.9, structureScale: 1.5, cost: 26, capacity: 5 },
  { id: 4, name: 'BULWARK',  cls: 'medium',  speed: 3, sinks: 5, armourScale: 1.1, structureScale: 2,   cost: 30, capacity: 5 },
  { id: 5, name: 'WARDEN',   cls: 'heavy',   speed: 2, sinks: 7, armourScale: 1.3, structureScale: 2.5, cost: 44, capacity: 6 },
  { id: 6, name: 'MONOLITH', cls: 'assault', speed: 2, sinks: 9, armourScale: 1.6, structureScale: 3.2, cost: 60, capacity: 7 },
];

// Weapon ids 1 to 7 fit the code's 3 bits per slot (0 = empty slot).
// dmg: damage per hit (per missile for pods). heat: added when fired. ammo: shots carried (null = none needed).
// size: the weapon slots it takes up on a chassis (see `capacity` in CHASSIS): small guns 1, ordinary 2, heavy 3.
// range: farthest hex of the short / medium / long bands. minRange: closest hex it can fire at.
// missiles: a pod fires this many missiles; one to-hit roll, then a cluster roll decides how many land.
const HEAVY_MIN_CAPACITY = 6; // chassis capacity needed to mount the heavy weapons below
const WEAPONS = [
  // Lasers: the longest direct-fire reach, low damage, no ammo, moderate heat. They need line of sight, so woods
  // and hills hide a mech from them. (Flicker 3, Bolt 6, Scorcher 10 damage.)
  { id: 1, name: 'FLICKER',  kind: 'laser',   size: 1, dmg: 3,  heat: 1, ammo: null, range: [3, 6, 9],  minRange: 0, cost: 4 },
  { id: 2, name: 'BOLT',     kind: 'laser',   size: 2, dmg: 6,  heat: 3, ammo: null, range: [3, 6, 9],  minRange: 0, cost: 10 },
  { id: 3, name: 'SCORCHER', kind: 'laser',   size: 3, dmg: 10, heat: 6, ammo: null, range: [3, 5, 7],  minRange: 0, cost: 18 },
  // Cannons: big damage, short-to-medium reach, scarce ammo, and slow shells: moverFactor multiplies the penalty for
  // a target that moved this round (walk +2, run +4 instead of +1, +2), so they are poor against fast raiders.
  { id: 4, name: 'RATTLER',  kind: 'cannon',  size: 2, dmg: 6,  heat: 1, ammo: 14,   range: [2, 4, 6],  minRange: 0, cost: 8,  moverFactor: 2 },
  { id: 5, name: 'HAMMER',   kind: 'cannon',  size: 3, dmg: 12, heat: 3, ammo: 8,    range: [2, 4, 6],  minRange: 0, cost: 16, moverFactor: 2 },
  // Rockets: indirect (no line of sight needed, +1 to hit without it), a minimum range, and each missile that lands
  // adds heatOnHit to the TARGET: the way to "disable" a mech is to cook it past the heat thresholds.
  { id: 6, name: 'STING',    kind: 'missile', size: 1, dmg: 2,  heat: 1, ammo: 12,   range: [4, 7, 10], minRange: 2, cost: 7,  missiles: 4, heatOnHit: 1, indirect: true },
  { id: 7, name: 'SWARM',    kind: 'missile', size: 2, dmg: 2,  heat: 2, ammo: 8,    range: [4, 7, 10], minRange: 2, cost: 11, missiles: 6, heatOnHit: 1, indirect: true },
  // Smoke rockets: indirect and they always land (no roll). They lay a cloud over the target mech and its six neighbours
  // for SMOKE_ROUNDS rounds. Smoke blocks line of sight through, into and out of its hexes, so lasers and cannons
  // cannot fire across it (rockets can). Any mech can be the target, even the shooter's own: a defensive screen.
  { id: 8, name: 'FOGGER',   kind: 'smoke',   size: 1, dmg: 0,  heat: 1, ammo: 4,    range: [4, 7, 10], minRange: 0, cost: 6,  smoke: true },
  { id: 9,  name: 'ARRAY',    kind: 'laser',   size: 3, dmg: 3,  heat: 5, ammo: null, range: [3, 6, 9],  minRange: 0, cost: 16, missiles: 4, minCapacity: HEAVY_MIN_CAPACITY },
  { id: 10, name: 'HOWITZER', kind: 'howitzer', size: 3, dmg: 18, heat: 4, ammo: 4,   range: [5, 8, 11], minRange: 4, cost: 20, moverFactor: 3, indirect: true, splash: 6, minCapacity: HEAVY_MIN_CAPACITY },
];
// The heavy weapons (they need a heavy or assault chassis, minCapacity 6). They keep the three-attacks cap but make each
// attack more brutal:
//  LASER ARRAY: one attack that is four beams. One to-hit roll, then the cluster roll decides how many beams land
//    (the same table as rockets), each for `dmg`. Needs line of sight, like any laser. `missiles` is the beam count.
//  HOWITZER: indirect (no line of sight, +1 without it, a minimum range), one huge shell, and `splash` damage to every
//    mech in the six hexes around the target, friend or foe (the self-destruct blast). A very slow shell: its mover
//    penalty is tripled, so it punishes mechs that stand still. A miss does nothing at all.
const SMOKE_ROUNDS = 2;   // placed in a round, a cloud blocks the rest of that round and all of the next
// Missile cluster roll (d20, index = roll - 1): share of the pod's missiles that land, at least one. Each entry of the old d10 table twice.
const CLUSTER_SHARE = [0.25, 0.25, 0.5, 0.5, 0.5, 0.5, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 1, 1, 1, 1, 1, 1];

// ---------- difficulty ----------
// budget: credits the player may spend. enemyToHit: the enemy's base to-hit number (the d20 roll needed before modifiers: lower is better, so a harder enemy has a lower one).
const PLAYER_TO_HIT = 5;       // the number to roll on a d20 before modifiers (see the to-hit section of DESIGN.md)
const DIFFICULTIES = {
  easy:   { code: 0, name: 'EASY',   budget: 140, enemyToHit: 7 },
  normal: { code: 1, name: 'NORMAL', budget: 120, enemyToHit: 5 },
  hard:   { code: 2, name: 'HARD',   budget: 100, enemyToHit: 3 },
};

// Enemy forces: a pool of squads for each difficulty, one picked at random for each battle (see pickEnemyForce in rules.js). Same spec shape
// as a player build: chassis id, armour level, extra sinks, a weapon id per slot. Each costs within about 8% of its difficulty's enemy cost (87
// easy, 118 normal, 144 hard), against player budgets of 140, 120 and 100, so the fight gets harder both because the enemy is bigger and
// because the player has less to spend. The first force of each is the squad this game always fought before the pools existed. Names stay
// clear of the tabletop game's vocabulary (no 'lance').
const ENEMY_FORCES = {
  easy: [
    { name: 'ESCORT', blurb: 'A medium with two small raiders: the plain squad.', mechs: [
      { chassis: 4, armour: 1, sinks: 0, weapons: [2, 0, 0] },
      { chassis: 1, armour: 1, sinks: 0, weapons: [1, 1, 0] },
      { chassis: 1, armour: 1, sinks: 0, weapons: [1, 1, 0] },
    ] },
    { name: 'RAIDERS', blurb: 'Three fast lights with lasers.', mechs: [
      { chassis: 2, armour: 1, sinks: 0, weapons: [2, 1, 0] },
      { chassis: 2, armour: 1, sinks: 0, weapons: [2, 1, 0] },
      { chassis: 1, armour: 1, sinks: 0, weapons: [1, 1, 0] },
    ] },
    { name: 'GUNLINE', blurb: 'A medium with a cannon and a laser, a Jackal and a Skitter.', mechs: [
      { chassis: 3, armour: 1, sinks: 0, weapons: [2, 4, 0] },
      { chassis: 2, armour: 1, sinks: 0, weapons: [2, 0, 0] },
      { chassis: 1, armour: 0, sinks: 0, weapons: [1, 0, 0] },
    ] },
    { name: 'ROCKETEERS', blurb: 'Rocket pods on a medium and a light: they heat you from a distance.', mechs: [
      { chassis: 3, armour: 1, sinks: 0, weapons: [6, 6, 0] },
      { chassis: 2, armour: 1, sinks: 0, weapons: [7, 0, 0] },
      { chassis: 1, armour: 0, sinks: 0, weapons: [1, 0, 0] },
    ] },
    { name: 'BRAWLERS', blurb: 'Cannons up close: slow shells, big hits.', mechs: [
      { chassis: 4, armour: 1, sinks: 0, weapons: [4, 4, 0] },
      { chassis: 2, armour: 1, sinks: 0, weapons: [4, 0, 0] },
      { chassis: 1, armour: 0, sinks: 0, weapons: [1, 0, 0] },
    ] },
  ],
  normal: [
    { name: 'HEAVY SCREEN', blurb: 'A heavy Warden screened by a Jackal and a Skitter.', mechs: [
      { chassis: 5, armour: 1, sinks: 0, weapons: [2, 4, 0] },
      { chassis: 2, armour: 1, sinks: 0, weapons: [2, 0, 0] },
      { chassis: 1, armour: 1, sinks: 0, weapons: [1, 1, 0] },
    ] },
    { name: 'SIEGE LINE', blurb: 'A Warden with the laser array and the howitzer, and two Skitters.', mechs: [
      { chassis: 5, armour: 1, sinks: 0, weapons: [9, 10, 0] },
      { chassis: 1, armour: 1, sinks: 0, weapons: [1, 1, 0] },
      { chassis: 1, armour: 0, sinks: 0, weapons: [1, 0, 0] },
    ] },
    { name: 'STRIKE WING', blurb: 'Two well-cooled Jackals and a Ranger: fast and hard to pin down.', mechs: [
      { chassis: 2, armour: 2, sinks: 1, weapons: [2, 1, 0] },
      { chassis: 2, armour: 2, sinks: 1, weapons: [2, 1, 0] },
      { chassis: 3, armour: 1, sinks: 0, weapons: [2, 4, 0] },
    ] },
    { name: 'ROCKET SCREEN', blurb: 'Two Rangers with rockets and smoke, and a Skitter.', mechs: [
      { chassis: 3, armour: 2, sinks: 1, weapons: [2, 6, 8] },
      { chassis: 3, armour: 1, sinks: 0, weapons: [6, 6, 8] },
      { chassis: 1, armour: 0, sinks: 0, weapons: [1, 0, 0] },
    ] },
    { name: 'HAMMER WING', blurb: 'Hammer cannons on a Bulwark and a Jackal.', mechs: [
      { chassis: 4, armour: 1, sinks: 0, weapons: [5, 4, 0] },
      { chassis: 2, armour: 1, sinks: 0, weapons: [5, 0, 0] },
      { chassis: 1, armour: 1, sinks: 0, weapons: [1, 1, 0] },
    ] },
  ],
  hard: [
    { name: 'MONOLITH COLUMN', blurb: 'An assault Monolith with a Ranger and a Skitter.', mechs: [
      { chassis: 6, armour: 1, sinks: 0, weapons: [2, 0, 0] },
      { chassis: 3, armour: 1, sinks: 0, weapons: [2, 4, 0] },
      { chassis: 1, armour: 1, sinks: 0, weapons: [1, 1, 0] },
    ] },
    { name: 'STEEL WALL', blurb: 'A Warden with a Scorcher and a Hammer, a Bulwark and a Skitter.', mechs: [
      { chassis: 5, armour: 2, sinks: 0, weapons: [3, 5, 0] },
      { chassis: 4, armour: 1, sinks: 0, weapons: [2, 4, 0] },
      { chassis: 1, armour: 0, sinks: 0, weapons: [1, 0, 0] },
    ] },
    { name: 'GHOST PACK', blurb: 'Three heavily armoured, well-cooled Jackals.', mechs: [
      { chassis: 2, armour: 4, sinks: 2, weapons: [2, 1, 0] },
      { chassis: 2, armour: 4, sinks: 2, weapons: [2, 1, 0] },
      { chassis: 2, armour: 4, sinks: 2, weapons: [2, 1, 0] },
    ] },
    { name: 'ARTILLERY PARK', blurb: 'A Warden with the howitzer and a Hammer, a rocket Ranger and a Skitter.', mechs: [
      { chassis: 5, armour: 1, sinks: 0, weapons: [10, 5, 0] },
      { chassis: 3, armour: 1, sinks: 0, weapons: [6, 6, 8] },
      { chassis: 1, armour: 1, sinks: 0, weapons: [1, 0, 0] },
    ] },
    { name: 'STORM FRONT', blurb: 'A Monolith with the laser array, a Ranger and a smoke Skitter.', mechs: [
      { chassis: 6, armour: 1, sinks: 0, weapons: [9, 0, 0] },
      { chassis: 3, armour: 1, sinks: 0, weapons: [2, 6, 0] },
      { chassis: 1, armour: 1, sinks: 0, weapons: [8, 1, 0] },
    ] },
  ],
};
// The first force of each difficulty, for code and tests that want one fixed enemy squad.
const ENEMY_SQUADS = { easy: ENEMY_FORCES.easy[0].mechs, normal: ENEMY_FORCES.normal[0].mechs, hard: ENEMY_FORCES.hard[0].mechs };

// ---------- movement and heat ----------
const RUN_FACTOR = 1.5;                         // run allowance = floor(speed * this)
const MOVE_HEAT = { stand: 0, walk: 1, run: 2 };
const HEAT_MAX = 30;                            // at this heat at the end of a round the mech shuts down
const SHUTDOWN_RECOVER = 15;                    // a shut-down mech restarts once it cools below this
const COOL_FACTOR = 0.5;                         // each heat sink removes this much heat a round (rounded down): below 1, heat lingers
const STAND_COOLING = 2;                        // extra heat removed for standing still
const HOLD_FIRE_COOLING = 2;                    // extra heat removed for firing nothing this round
// From each heat level: to-hit penalty and movement points lost. The last matching row applies.
const HEAT_STEPS = [
  { at: 8,  hit: 2, move: 0 },
  { at: 14, hit: 4, move: 1 },
  { at: 20, hit: 6, move: 2 },
];
const COOKOFF_HEAT = 20;                        // from this heat, ammo may explode at the end of a round
const COOKOFF_ROLL = 6;                         // it does on a d20 roll of this or less (30%)
const COOKOFF_DAMAGE = 10;                      // straight to the structure of the location holding the ammo

// ---------- to-hit ----------
const BAND_NAMES = ['short', 'medium', 'long'];
const RANGE_STEP_HEXES = 2;                     // +1 to the number needed for every this many hexes after the first: 1-2 hexes +0, 3-4 +1, ... 9-10 +4
// The target's weight class: light mechs are harder to hit, big ones easier.
const SIZE_MOD = { light: 2, medium: 0, heavy: -2, assault: -4 };
const MOVED_HIT_MOD = { stand: 0, walk: 2, run: 4 }; // applies to the attacker's and the target's movement alike
const SHUTDOWN_TARGET_MOD = -4;                 // a shut-down target is easier to hit
const INDIRECT_NO_LOS_MOD = 2;                  // missiles do not need line of sight, but are less accurate without it
const NEED_MIN = 3;                             // a natural 1 always misses (a need of 3 is 90%)
const NEED_MAX = 19;                            // a natural 20 always hits (a need of 19 is 10%)

// ---------- terrain ----------
// cost: movement points to enter. cover: added to the target number when the target stands here.
// blocks: stops line of sight through it. height: hills see over hills. cool: extra heat removed when standing here.
// passable: false (buildings, peaks) means no mech can ever enter the hex; left out, a hex can be entered.
const TERRAIN = {
  '.': { name: 'clear',  cost: 1, cover: 0, blocks: false, height: 0, cool: 0 },
  'T': { name: 'woods',  cost: 2, cover: 2, blocks: true,  height: 0, cool: 0 },
  'H': { name: 'hills',  cost: 2, cover: 0, blocks: false, height: 1, cool: 0 },
  '~': { name: 'water',  cost: 2, cover: 0, blocks: false, height: 0, cool: 5 }, // water is the big cooler: a Jackal sheds 1 from its sinks, 3 standing, 8 in water
  'R': { name: 'rubble', cost: 2, cover: 0, blocks: false, height: 0, cool: 0 },
  'B': { name: 'building', cost: 1, cover: 2, blocks: true, height: 0, cool: 0, passable: false },
  'M': { name: 'peak',     cost: 1, cover: 0, blocks: true, height: 2, cool: 0, passable: false },
  // The story's own ground (the freight yard): concrete is clear ground by another look, a container stack is a building by another look,
  // and a landing pad is clear ground marked for a dropship.
  'c': { name: 'concrete',  cost: 1, cover: 0, blocks: false, height: 0, cool: 0 },
  'C': { name: 'containers', cost: 1, cover: 2, blocks: true, height: 0, cool: 0, passable: false },
  'P': { name: 'landing pad', cost: 1, cover: 0, blocks: false, height: 0, cool: 0 },
  'd': { name: 'moon dust', cost: 1, cover: 0, blocks: false, height: 0, cool: 0 },   // the depot's moon: clear ground
  'G': { name: 'hangar',    cost: 1, cover: 0, blocks: false, height: 0, cool: 0 },   // the raid's goal hexes
  'f': { name: 'salt flat', cost: 1, cover: 0, blocks: false, height: 0, cool: 0 },   // the marsh's open ground
  'r': { name: 'reeds',     cost: 2, cover: 2, blocks: true,  height: 0, cool: 0 },   // the marsh's woods: cover, slow, block sight
  's': { name: 'shale',     cost: 1, cover: 0, blocks: false, height: 0, cool: 0 },   // the canyon floor: clear ground
  'Q': { name: 'road',      cost: 1, cover: 0, blocks: false, height: 0, cool: 0 },   // the prison crawler's road (the escort goal follows it)
  'W': { name: 'repair bay', cost: 1, cover: 0, blocks: false, height: 0, cool: 0, repair: true }, // see REPAIR_ARMOUR
  'k': { name: 'hall floor', cost: 1, cover: 0, blocks: false, height: 0, cool: 0 },  // the core's great hall: clear ground
  'D': { name: 'great doors', cost: 1, cover: 0, blocks: false, height: 0, cool: 0 }, // the one way into the hall (clear: whoever stands in it blocks it)
  'A': { name: 'ammo cache', cost: 1, cover: 0, blocks: false, height: 0, cool: 0, resupply: true }, // see RESUPPLY_CHARGES
};

// Repair bays (terrain with `repair`): a mech that stood still on one for the round (it may fire) is repaired at the end of the round: up to
// REPAIR_ARMOUR armour points back (never above what it started with) and one weapon knocked out by a critical back online. Each repair uses
// one of the bay's REPAIR_CHARGES; a mech with nothing to repair uses none. Armour is only repaired in the armour-pool game.
const REPAIR_ARMOUR = 5;
const REPAIR_CHARGES = 3;
// Ammo caches (terrain with `resupply`): the same deal for ammunition. A mech that stood still on one has every weapon that uses ammo filled back
// up to what it carries at the start. RESUPPLY_CHARGES a cache; a mech with nothing to fill uses none.
const RESUPPLY_CHARGES = 2;

// The prison crawler (story, the escort goal): it drives this many hexes along its road in its side's move step, stopping short of anything on it.
const CRAWLER_SPEED = 3;

// Self-destruct: a mech may blow itself up in the fire phase instead of firing. Every mech in the six hexes around it,
// friend or foe, takes this much damage (a hit like any other, so a location is rolled in the advanced game); the
// bomber is destroyed. It gives a mech with no weapons left something to do.
const SELF_DESTRUCT_DAMAGE = 15;
