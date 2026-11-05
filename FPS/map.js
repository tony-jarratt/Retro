// WHICH LEVEL, and laying it out for the rest of the game.
//
// The level comes from the page address: index.html?level=lab plays the lab.
// With no ?level, you start at the first level, as a player would. Going to
// a new level reloads the page with a new ?level (like R reloads to restart),
// so every piece of state starts fresh, the same simple trick.
//
// PLAY-TESTING: index.html?playtest shows a level chooser before the game
// starts (main.js), and L in a game goes back to it.
//
// Everything below just copies the chosen level's data into the names the
// rest of the code has always used (MAP, SPRITES, ENEMIES, ...), so no other
// file needs to know there's more than one level.

const PAGE_ARGS = new URLSearchParams(location.search);
const PLAYTEST = PAGE_ARGS.has('playtest');

function levelById(id) {
  const level = LEVELS.find((l) => l.id === id);
  if (!level) throw new Error(`There is no level "${id}". Levels: ${LEVELS.map((l) => l.id).join(', ')}.`);
  return level;
}

const CURRENT_LEVEL = PAGE_ARGS.has('level') ? levelById(PAGE_ARGS.get('level')) : LEVELS[0];

// The page address for another level, keeping ?playtest if it's on.
function levelAddress(id) {
  return '?' + (PLAYTEST ? 'playtest&' : '') + 'level=' + id;
}

// The level after this one, or null after the last.
function nextLevel() {
  return LEVELS[LEVELS.indexOf(CURRENT_LEVEL) + 1] || null;
}

const MAP = CURRENT_LEVEL.rows.map((row, y) => [...row].map((ch, x) => {
  if (!(ch in LEGEND)) throw new Error(`Level "${CURRENT_LEVEL.id}" row ${y}, column ${x}: "${ch}" is not in LEGEND.`);
  return LEGEND[ch];
}));

// A level may leave out any list it doesn't use: it just has none of those.
const LOCKED_DOORS   = CURRENT_LEVEL.lockedDoors   || [];
const SPRITES        = CURRENT_LEVEL.sprites       || [];
const CEILING_LIGHTS = CURRENT_LEVEL.ceilingLights || [];
const ENEMIES        = CURRENT_LEVEL.enemies       || [];
const ZONES          = CURRENT_LEVEL.zones         || [];
const CAMERAS        = CURRENT_LEVEL.cameras       || [];
const TRIPWIRES      = CURRENT_LEVEL.tripwires     || [];
const TERMINALS      = CURRENT_LEVEL.terminals     || [];
const PICKUPS        = CURRENT_LEVEL.pickups       || [];
const VENTS          = CURRENT_LEVEL.vents         || [];
const DRONE_PACKS    = CURRENT_LEVEL.dronePacks    || [];
const HIVES          = CURRENT_LEVEL.hives         || [];
const LARVA_PACKS    = CURRENT_LEVEL.larvae        || [];
const PODS           = CURRENT_LEVEL.pods          || [];
const SPRINKLERS     = CURRENT_LEVEL.sprinklers    || [];
const DECALS         = CURRENT_LEVEL.decals        || [];
const PLAYER_START   = CURRENT_LEVEL.playerStart;
if (!PLAYER_START) throw new Error(`Level "${CURRENT_LEVEL.id}" has no playerStart.`);

// THE LOOK: everything that changes with the level's theme, in one place.
// (Wall looks aren't here: they're picked per cell in the rows themselves,
// so a level can mix them.) A new theme is a new entry.
//   ambient       light everywhere, even far from any lamp (lighting.js)
//   ceilingLight  its ceiling lights' colour and reach (lighting.js)
//   floor         makes its floor texture (textures.js)
//   ceiling       makes its ceiling texture, with its light panels glowing
//                 in the colour given, or switched off for null (textures.js)
//   ceilingGlow   the colour its ceiling lights glow, lit
//   ventGas       its vents blow toxic gas, not steam: drawn green, and thin
//                 enough to see through (textures.js, steam.js)
//   spill         the floor decal scattered about as spills (decals.js)
// floor and ceiling are little arrow functions, not the makers themselves,
// because the makers are in textures.js, which loads after this file.
const THEMES = {
  industrial: {
    ambient: [0.3, 0.3, 0.34],                             // dim, a little cool
    ceilingLight: { colour: [0.9, 0.95, 1.05], radius: 3.5 }, // strip lights: cool white
    floor: () => makeDiamondPlate(),
    ceiling: (glow) => makeGirders(glow),
    ceilingGlow: [255, 214, 150],
    ventGas: false,
    spill: 'oil',
  },
  lab: {
    ambient: [0.26, 0.31, 0.29],                              // colder, with a sickly green cast
    ceilingLight: { colour: [0.85, 1.05, 1.15], radius: 3.8 }, // fluorescent panels: cold blue-white
    floor: () => makeLabFloor(),
    ceiling: (glow) => makeLabCeiling(glow),
    ceilingGlow: [215, 245, 255],
    ventGas: true,
    spill: 'slime',
  },
  hq: {
    ambient: [0.3, 0.33, 0.25],                              // warm, close, green
    ceilingLight: { colour: [1.15, 1.1, 0.88], radius: 4 },   // daylight through the skylights
    floor: () => makeHqFloor(),
    ceiling: (glow) => makeHqCeiling(glow),
    ceilingGlow: [240, 240, 205],
    ventGas: true,
    spill: 'leaves',
  },
};
const THEME_NAME = CURRENT_LEVEL.theme || 'industrial';
if (!(THEME_NAME in THEMES)) throw new Error(`Level "${CURRENT_LEVEL.id}" has theme "${THEME_NAME}". Themes: ${Object.keys(THEMES).join(', ')}.`);
const THEME = THEMES[THEME_NAME];

// THE OBJECTIVE: what the level's K cells are, and so what you're told to
// destroy (core.js). The mechanics are the same either way.
const OBJECTIVE_KINDS = ['core', 'chamber', 'motherplant'];
const OBJECTIVE = CURRENT_LEVEL.objective || 'core';
if (!OBJECTIVE_KINDS.includes(OBJECTIVE)) throw new Error(`Level "${CURRENT_LEVEL.id}" has objective "${OBJECTIVE}". Objectives: ${OBJECTIVE_KINDS.join(', ')}.`);
