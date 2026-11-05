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
const DECALS         = CURRENT_LEVEL.decals        || [];
const PLAYER_START   = CURRENT_LEVEL.playerStart;
if (!PLAYER_START) throw new Error(`Level "${CURRENT_LEVEL.id}" has no playerStart.`);

// THE LOOK: which set of floor, ceiling and lighting the level uses
// (textures.js, lighting.js, decals.js). Wall looks are picked per cell in
// the rows themselves, so a level can mix them.
const THEMES = ['industrial', 'lab'];
const THEME = CURRENT_LEVEL.theme || 'industrial';
if (!THEMES.includes(THEME)) throw new Error(`Level "${CURRENT_LEVEL.id}" has theme "${THEME}". Themes: ${THEMES.join(', ')}.`);

// THE OBJECTIVE: what the level's K cells are, and so what you're told to
// destroy (core.js). The mechanics are the same either way.
const OBJECTIVE_KINDS = ['core', 'chamber'];
const OBJECTIVE = CURRENT_LEVEL.objective || 'core';
if (!OBJECTIVE_KINDS.includes(OBJECTIVE)) throw new Error(`Level "${CURRENT_LEVEL.id}" has objective "${OBJECTIVE}". Objectives: ${OBJECTIVE_KINDS.join(', ')}.`);
