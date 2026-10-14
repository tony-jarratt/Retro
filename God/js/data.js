'use strict';

// Every number the game is tuned by, and the 16 colours it is drawn in.

// ---- the land ----
const MAP_N = 64;          // tiles across; the corners are (MAP_N + 1) square
const MAX_H = 7;           // the highest a corner can go; 0 is sea level
const SEED = 1989;         // the default map

// ---- the god's power ----
const START_MANNA = 40;
const COST_PER_CORNER = 1; // raising or lowering costs this for every corner that moves
const REPEAT_MS = 120;     // holding the mouse button repeats a raise or lower this often

// ---- the people ----
const PLAYER = 0, RIVAL = 1;     // tribe indices: you (the good god) and the dark god
const WALK_SPEED = 1.2;          // tiles a second
const HOUSE_GAP = 3;             // houses stand at least this far apart (counting diagonal steps)
const WEAKEN_S = 6;              // every this many seconds a walker with nowhere to live loses a tenth of its people (at least one)
// A house's level comes from how much flat ground it has to itself (its own tile included, out of 25):
// the lowest count for each level, tent to castle.
const LEVEL_NAMES = ['TENT', 'HUT', 'COTTAGE', 'HOUSE', 'CASTLE'];
const LEVEL_FROM = [1, 3, 9, 16, 23];
const CAP = [4, 8, 16, 30, 50];               // the most people a house of each level holds
const GROWTH = [0.1, 0.18, 0.3, 0.45, 0.7];   // people born a second
const MANNA = [0.05, 0.12, 0.25, 0.4, 0.65];  // manna a second
const START_PEOPLE = 3;                       // in the first house; two walkers set out beside it
const SCENT = 5;                 // a walker can sense the other tribe this many squares away, and heads for it
const FIGHT_RANGE = 0.6;         // rival walkers this close (in tiles) fight

// ---- ley stones: the gods' way of gathering their people and sending them somewhere ----
// A tribe's stones, in the order they were raised, make its ley line. Walkers near the first (the hearth) gather
// there; at PILGRIM_MASS the gathering sets off along the line, and at the last stone fights or settles.
const STONE_COST = 20;
const GOD_REACH = 5;             // a god can shape land and cast powers within this many squares of its houses and stones
const CALL_COST = 500;           // the Call of the Stones: everyone, on both sides, to one place for a last battle
const AI_CALL_EDGE = 1.5;        // the dark god calls when its armed strength is this many times the player's
const MAX_STONES = 6;
const GATHER_RADIUS = 5;         // walkers this near the hearth (counting diagonal steps) answer its pull
const PILGRIM_MASS = 20;         // a gathering this strong sets off down the ley line

// ---- sheep (a nod to Powermonger): they graze, wander, and drown like anyone else ----
const SHEEP_START = 7;           // on each island at the start
const SHEEP_MAX = 16;            // a lamb turns up now and then while there are fewer than this
const SHEEP_SPEED = 0.35;        // tiles a second
const LAMB_TICKS = 25 * 20;      // how often a lamb may appear

// ---- mines and weapons ----
// A house of MINE_LEVEL or more with a boulder in its patch of land (the 5 x 5 it is nearest to) digs a mine in it,
// one mine a house. A tribe's mines decide its weapons, which multiply its strength in every fight.
const MINE_LEVEL = 2;                                  // a hut or better
const WEAPONS = ['CLUBS', 'BRONZE', 'IRON', 'STEEL'];
const WEAPON_FROM = [0, 1, 3, 6];                      // the mines a tribe needs for each
const WEAPON_FACTOR = [1, 1.3, 1.6, 2];

// ---- the dark god ----
const AI_THINK_TICKS = 30;       // it considers the land every 1.5 s
const AI_REACH = 2;              // the corners it considers: this far round each of its houses
const AI_BRIDGE_MANNA = 120;     // with this much manna saved it builds land across the sea towards you...
const AI_GRACE_TICKS = 3 * 60 * 20; // ...but not in the first 3 minutes
const AI_BRIDGE_STEPS = 3;       // corners it raises each time it works on the bridge
const AI_POWER_MANNA = 160;      // after the grace period, with this much saved, it casts a swamp or earthquake on you...
const AI_POWER_GAP = 40 * 20;    // ...at most every 40 s

// How hard the dark god plays: when it starts on you, what it saves before bridging or casting, how often it casts, and
// the manna it starts with. FAIR_RULES are the numbers above; each land in the campaign has its own.
const FAIR_RULES = { grace: AI_GRACE_TICKS, bridgeManna: AI_BRIDGE_MANNA, powerManna: AI_POWER_MANNA, powerGap: AI_POWER_GAP, rivalManna: START_MANNA };

// The campaign: five lands, each harder, each a fixed map. The seeds were picked (from ten tried) so that a player
// who does nothing lasts about: never falls, 9, 7, 7 and 5 minutes. A land sets the map (MAP_STYLE in terrain.js), the dark
// god's rules, which powers both gods have (the stone always), and how many villages the dark god starts with.
const MIN = 60 * 20; // ticks in a minute
// Stars for a win: three at or under a land's par time, two within half as long again, one for any win. *tbd* from play.
const PAR_MINUTES = [10, 12, 14, 15, 18];
function starsFor(land, seconds) {
  const par = PAR_MINUTES[land] * 60;
  return seconds <= par ? 3 : seconds <= par * 1.5 ? 2 : 1;
}
const LANDS = [
  { name: 'THE GREEN ISLES', seed: 2024, intro: 'LEARN TO SHAPE THE LAND. YOU HAVE STONES.', powers: [], rivalHomes: 1,
    map: { mass: 0.22, strait: 2.5, forests: 6, wood: 0.5, rock: 0.5 },
    rules: { grace: 6 * MIN, bridgeManna: 220, powerManna: 99999, powerGap: 99 * MIN, rivalManna: 25 } },
  { name: 'THE PINEWOODS', seed: 11, intro: 'THICK FORESTS TO CLEAR. NEW: SWAMP.', powers: ['swamp'], rivalHomes: 1,
    map: { mass: 0.2, strait: 2, forests: 20, wood: 0.9, rock: 0.8 },
    rules: { grace: 5 * MIN, bridgeManna: 180, powerManna: 240, powerGap: 75 * 20, rivalManna: 30 } },
  { name: 'THE STONY SHORE', seed: 1989, intro: 'BOULDERS EVERYWHERE: DIG MINES. NEW: QUAKE.', powers: ['swamp', 'quake'], rivalHomes: 1,
    map: { mass: 0.2, strait: 2, forests: 10, wood: 0.6, rock: 3 }, rules: FAIR_RULES },
  { name: 'THE NARROW SEA', seed: 11, intro: 'A NARROW SEA: THE DARK GOD IS CLOSE. NEW: VOLCANO.', powers: ['swamp', 'quake', 'volcano'], rivalHomes: 1,
    map: { mass: 0.22, strait: 1.2, forests: 12, wood: 0.75, rock: 1.2 },
    rules: { grace: 2 * MIN, bridgeManna: 80, powerManna: 110, powerGap: 25 * 20, rivalManna: 70 } },
  { name: "THE DARK GOD'S HOME", seed: 2024, intro: 'IT HOLDS TWO VILLAGES. NEW: FLOOD, AND THE CALL.', powers: ['swamp', 'quake', 'volcano', 'flood', 'call'], rivalHomes: 2,
    map: { mass: 0.2, strait: 2, forests: 12, wood: 0.75, rock: 1.5 },
    rules: { grace: 90 * 20, bridgeManna: 70, powerManna: 90, powerGap: 20 * 20, rivalManna: 100 } },
];

// ---- the screen ----
const LW = 512, LH = 344;  // the low-res screen the game draws into, shown at 2x
const VIEW_N = 10;         // the land view shows this many tiles each way
const HX = 20, HY = 10, HZ = 10; // half a tile across, half a tile down, one step of height (low-res pixels)
const VIEW_OX = 256, VIEW_OY = 136; // where the view's top corner (at sea level) sits on screen
const BOOK_X = 14, BOOK_Y = 6;      // the top left of the map book's page
const TICK_MS = 50;        // the rules run 20 times a second

// ---- the 16 colours (index -> RGB), the Amiga way ----
const PALETTE = [
  '#000000', // 0 black
  '#10306a', // 1 deep sea
  '#2050b0', // 2 sea
  '#4a80e0', // 3 sea glint
  '#e8cc7a', // 4 sand
  '#88e050', // 5 grass, lit
  '#50b030', // 6 grass
  '#2a7a20', // 7 grass, shaded
  '#b08858', // 8 rock, lit
  '#6e4e30', // 9 rock, shaded / earth
  '#f4f4f4', // 10 snow
  '#9aa0b0', // 11 stone grey
  '#3a2414', // 12 dark earth
  '#d83a28', // 13 red (the dark god)
  '#f0d040', // 14 gold (the cursor, the writing)
  '#f0a880', // 15 skin
];
const C = { black: 0, deep: 1, sea: 2, glint: 3, sand: 4, grassLit: 5, grass: 6, grassDark: 7, rockLit: 8, rock: 9,
  snow: 10, grey: 11, earth: 12, red: 13, gold: 14, skin: 15 };
