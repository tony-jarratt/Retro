'use strict';

// The maps ("scenarios"). Each theme comes small (19 x 12, which fits the screen) and large (31 x 20, which scrolls; see view.js), flat-top hexes with
// odd columns shifted down, three starting hexes a side, and the hex groups the win conditions use:
//   centre  the hex the flag sits on and the hill is built round, chosen on dry ground (default [9, 5], the middle of the map)
//   flag    the hex a flag sits on (capture the flag): the centre
//   zone    the hill (king of the hill): seven hexes, the centre and its six neighbours
//   bases   where each side takes the flag (capture the flag)
//   exits   where each side must get a mech to (get to the exit): in the other side's half, in a corner
// Starting hexes are clear ground. Every start can reach every enemy start (a test checks this for each map).
// The map letters are the terrain in TERRAIN (data.js).

const SCENARIOS = {
  basin: {
    id: 'basin',
    theme: 'basin', size: 'small',
    name: 'THE BASIN',
    blurb: 'A lake in the middle and a ridge in the north split the field into two lanes, with woods and rubble for cover.',
    // A lake in the middle and a ridge of hills in the north split the map into a northern and a southern lane, with
    // woods and rubble for cover and for breaking lines of sight.
    rows: [
      '..........R........',
      '...TT..HHHH........',
      '...T..H.HHHH..TT...',
      '....T.......T.T....',
      '.....TR.~~~..R.....',
      '.....T.~~~~~..T....',
      '...R...~~~~~.......',
      '......~~~~~..T.R...',
      '.....~..~~..T......',
      '....T~....H.RTT....',
      '..TT..R..HHH..TT...',
      '...T....R..........',
    ],
    // The player starts at the left edge, the enemy at the right: about 16 hexes apart, further than any weapon reaches (10), so
    // nobody can fire on the first round, and a mech's move (2 to 7 hexes) is a fraction of the way across.
    playerStarts: [[1, 2], [0, 5], [1, 8]],
    enemyStarts: [[17, 3], [18, 6], [17, 9]],
    centre: [9, 9],   // the middle of the map is the lake, so the flag and the hill go on the dry ground south of it
    playerFacing: 2,  // direction index, see map.js (0 = up, then clockwise)
    enemyFacing: 5,
  },
  urban: {
    id: 'urban',
    theme: 'urban', size: 'small',
    name: 'DEAD CITY',
    blurb: 'City blocks you cannot walk through or see through. Short sight lines, plenty of cover, rockets and shells over the roofs.',
    rows: [
      '...BB..R.....BB....',
      '...BB.........BB...',
      '....R.BBB..........',
      '...RR.BBB...R..BB..',
      '......BBB...R..BB..',
      '..B..R......R..B...',
      '..B..R.B.......B...',
      '......R.BB...BB....',
      '.....B...B...BB.BB.',
      '.BB...R.......R.B..',
      '....B.......BBB....',
      '....B..R....BBB....',
    ],
    playerStarts: [[1, 2], [0, 5], [1, 8]],
    enemyStarts: [[17, 3], [18, 6], [17, 9]],
    playerFacing: 2,
    enemyFacing: 5,
  },
  mountains: {
    id: 'mountains',
    theme: 'mountains', size: 'small',
    name: 'THE RANGE',
    blurb: 'Peaks nobody can cross or see over, ridges, and a stream in the middle. Narrow passes and long lanes of fire.',
    rows: [
      'M.....HH....HH.....',
      'M....HHH..H.HH.....',
      '....HHH..HH.....M..',
      '..M..HH...~~.......',
      '..MM..H..~~~..HH...',
      '.......~~~~.H.HHM..',
      '....HH..~~~...MM...',
      '...HHH...~~..HH....',
      '..MM..H...H..HHH...',
      '..M...HH.HH...M....',
      '......HH.....MM...M',
      '....HH.......M...MM',
    ],
    centre: [9, 9],   // the stream runs through the middle, so the flag and the hill go on the hills south of it
    playerStarts: [[1, 2], [0, 5], [1, 8]],
    enemyStarts: [[17, 3], [18, 6], [17, 9]],
    playerFacing: 2,
    enemyFacing: 5,
  },
  'basin-large': {
    id: 'basin-large',
    theme: 'basin', size: 'large',
    name: 'THE BASIN',
    blurb: 'A big lake and a northern ridge; the flag and hill are on the dry ground south of the lake.',
    rows: [
      '.....................R....T....',
      '....TTHHHHHHHTHTHHHHH.HH.H.....',
      '......HHH.HHHH.~HH..H..HH......',
      '....T..HHHHHHHH~~~..HHHHHH.T...',
      '......T...T~~~~~~~~~..T........',
      '.......R.~~~~~~~~~~~~~T........',
      '...T..TT.~~~~~~~~~~~~~TT.T.....',
      '.......T.~~~~~~~~~~~~~.........',
      '.......T.~~~~~~~~~~~~~.........',
      '....T....~~~~~~~~~~~~~..T......',
      '.........~~~~~~~~~~~~~..T......',
      '........T~~~~~~~~~~~~~....TR...',
      '......TT.T~~~~~~~~~~~.T........',
      '......T.....~~~~~~~....TT......',
      '.........T....~~~T...RT....R...',
      '.......TT....H..HH.T.TT.TT.....',
      '....R............T.......T.....',
      '....T..RT........H.......T.....',
      '............T...HT..TT.........',
      '.......T.......T..T...T..T.....',
    ],
    centre: [15, 16],
    playerStarts: [[1, 4], [0, 9], [1, 15]],
    enemyStarts: [[29, 4], [30, 10], [29, 15]],
    playerFacing: 2,
    enemyFacing: 5,
    bases: { player: [[0, 8], [0, 9], [0, 10], [1, 8], [1, 9]], enemy: [[30, 9], [30, 10], [30, 11], [29, 9], [29, 10]] },
    exits: { player: [[30, 0], [29, 0], [28, 0], [30, 1], [29, 1]], enemy: [[0, 19], [1, 19], [2, 19], [0, 18], [1, 18]] },
  },
  'urban-large': {
    id: 'urban-large',
    theme: 'urban', size: 'large',
    name: 'DEAD CITY',
    blurb: 'A whole city of blocks you cannot cross or see through, with a plaza in the middle.',
    rows: [
      '..........R....................',
      '...BBB...BBB..BBBB...BBB...B...',
      '...BBB.R.BBB...BBB...BBB.B.B...',
      '..RBBB...BBBR..BBB...BBB...BB..',
      '.....R..B..R...BR.....RR.......',
      '.........R..R.....R.....B.B....',
      '...BBB...BBB.B.BBB...BBB...BBB.',
      '...BBB...BBB..BBBB...BBB..BBBB.',
      '...BBB...BBB....BB...BBB..BBB..',
      '..........B...........B........',
      '...B....B..........B....B......',
      '...BBB...BBB.........BBB...B...',
      '...BBB...BBB.....B...BBB.B.BBB.',
      '...BBB...BBB...BBB...BBB..BBBB.',
      '.....R..B....R.....B...R.......',
      '..................R.......RB...',
      '...BBB...BBB...BBB...BBB...B...',
      '...BBB...BBB...BBB...BBB.B.BBB.',
      '....BB...BBB...BBBB..BBB...BBB.',
      '....................R...R..B...',
    ],
    centre: [15, 10],
    playerStarts: [[1, 4], [0, 9], [1, 15]],
    enemyStarts: [[29, 4], [30, 10], [29, 15]],
    playerFacing: 2,
    enemyFacing: 5,
    bases: { player: [[0, 8], [0, 9], [0, 10], [1, 8], [1, 9]], enemy: [[30, 9], [30, 10], [30, 11], [29, 9], [29, 10]] },
    exits: { player: [[30, 0], [29, 0], [28, 0], [30, 1], [29, 1]], enemy: [[0, 19], [1, 19], [2, 19], [0, 18], [1, 18]] },
  },
  'mountains-large': {
    id: 'mountains-large',
    theme: 'mountains', size: 'large',
    name: 'THE RANGE',
    blurb: 'Peaks nobody can cross or see over, hill ridges, passes and a stream.',
    rows: [
      '..........H..RMM..H.H..........',
      '........MMM..HHM~H..T.....HH...',
      '......HHM.M.H.H.~...M.H........',
      '.....T..MMM......~MMMH.........',
      '...H....MM.H....HHMMM...MM.....',
      '......T.H.H.....~H.HH..HMM.....',
      '...HH....H.MMM..~........HHH...',
      '...H.MMT...M.M.H.H.MM..T..H....',
      '.....MMMH...H.~.H..MMH..HMMH...',
      '.....TMMH....~..H.HM..H..MM....',
      '......H......~....HMM.HH.MH....',
      '....H.HHH....H......THH....H...',
      '...H....H..HHMMM...H.H.H.......',
      '..MM..HMMM...MMMH...HMMM.......',
      '..M..T.MMR.....~.H...MHM.......',
      '...MTH.MMM.H.H..HHH..HMM...T...',
      '.........H.R.....H....H........',
      '............HT...~...H.........',
      '.............HH..~...R...HH....',
      '...HH..H..HH.HH.~H..H..RH......',
    ],
    centre: [15, 10],
    playerStarts: [[1, 4], [0, 9], [1, 15]],
    enemyStarts: [[29, 4], [30, 10], [29, 15]],
    playerFacing: 2,
    enemyFacing: 5,
    bases: { player: [[0, 8], [0, 9], [0, 10], [1, 8], [1, 9]], enemy: [[30, 9], [30, 10], [30, 11], [29, 9], [29, 10]] },
    exits: { player: [[30, 0], [29, 0], [28, 0], [30, 1], [29, 1]], enemy: [[0, 19], [1, 19], [2, 19], [0, 18], [1, 18]] },
  },
};

// The map features (free play, when the select screen turns them on): a repair bay and an ammo cache for each side and one sensor tower in the
// middle to fight over. The player's bay and cache are placed by hand on clear ground about a quarter of the way in, and the enemy's are their
// mirror image (the column mirrored, the row the same: the maps are an odd number of columns wide, so the mirror hex sits the same way), so
// both sides have the same walk to theirs. The tower stands on the middle column, the same distance from both, off the hill and the flag (on
// the basins it is an island in the lake). Every feature replaces the terrain under it.
const MAP_FEATURES = {
  basin:             { bay: [4, 4], cache: [3, 8],  sensor: [9, 5] },
  urban:             { bay: [4, 4], cache: [3, 8],  sensor: [9, 2] },
  mountains:         { bay: [3, 3], cache: [3, 9],  sensor: [9, 3] },
  'basin-large':     { bay: [6, 7], cache: [7, 14], sensor: [15, 8] },
  'urban-large':     { bay: [6, 6], cache: [6, 14], sensor: [15, 5] },
  'mountains-large': { bay: [7, 6], cache: [6, 14], sensor: [15, 6] },
};

// The hex groups: the flag and the hill at the centre, a base round each side's starts, and an exit in the far corner of the other side's
// half (the player's in the north east, the enemy's in the south west). A map may name its own.
for (const scenario of Object.values(SCENARIOS)) {
  const centre = scenario.centre || [9, 5];
  scenario.centre = centre;
  scenario.flag = centre.slice();
  scenario.zone = [centre.slice(), ...[0, 1, 2, 3, 4, 5].map(dir => neighbour(centre[0], centre[1], dir))];
  if (!scenario.bases) scenario.bases = { player: [[0, 4], [0, 5], [0, 6], [1, 4], [1, 5]], enemy: [[18, 5], [18, 6], [18, 7], [17, 5], [17, 6]] };
  if (!scenario.exits) scenario.exits = { player: [[18, 0], [17, 0], [16, 0], [18, 1], [17, 1]], enemy: [[0, 11], [1, 11], [2, 11], [0, 10], [1, 10]] };
  scenario.features = featureHexes(scenario);
  scenario.featureRows = scenario.rows.map((row, r) => row.split('').map((t, c) => (scenario.features.find(f => f[0] === c && f[1] === r) || [0, 0, t])[2]).join(''));
}

// A map's features as [c, r, terrain letter]: its bay and cache, their mirror images for the enemy, and the tower. Each has to stand on ground
// a mech can enter, clear of the starts and the goals' hexes, and the tower on the middle column.
function featureHexes(scenario) {
  const spots = MAP_FEATURES[scenario.id];
  if (!spots) throw new MapError('features', `Map ${scenario.id} has no features placed (MAP_FEATURES)`);
  const cols = scenario.rows[0].length, mirror = ([c, r]) => [cols - 1 - c, r];
  const out = [[...spots.bay, 'W'], [...mirror(spots.bay), 'W'], [...spots.cache, 'A'], [...mirror(spots.cache), 'A'], [...spots.sensor, 'S']];
  if (spots.sensor[0] !== (cols - 1) / 2) throw new MapError('features', `Map ${scenario.id}: the sensor tower at ${hexKey(...spots.sensor)} is not on the middle column ${(cols - 1) / 2}`);
  const taken = [...scenario.playerStarts, ...scenario.enemyStarts, ...scenario.zone, scenario.flag, ...scenario.bases.player, ...scenario.bases.enemy, ...scenario.exits.player, ...scenario.exits.enemy];
  for (const [c, r, t] of out) {
    const under = TERRAIN[scenario.rows[r][c]];
    if (under.passable === false) throw new MapError('features', `Map ${scenario.id}: the ${TERRAIN[t].name} at ${hexKey(c, r)} is on ${under.name}, which cannot be entered`);
    if (taken.some(h => h[0] === c && h[1] === r)) throw new MapError('features', `Map ${scenario.id}: the ${TERRAIN[t].name} at ${hexKey(c, r)} is on a start or a goal hex`);
  }
  return out;
}

const SCENARIO_IDS = Object.keys(SCENARIOS);      // every map, in both sizes
const MAP_THEMES = ['basin', 'urban', 'mountains']; // what the menu offers; each comes in a small and a large size
const MAP_SIZES = ['small', 'large'];

// The map of a theme in a size: the small one is the theme's own id, the large one has '-large' after it. With `features` it is a copy whose
// rows have the bays, caches and the sensor tower in them.
function scenarioFor(theme, size, features = false) {
  if (!MAP_THEMES.includes(theme)) throw new BuildError('map', `Unknown map "${theme}" (the maps are ${MAP_THEMES.join(', ')})`);
  if (!MAP_SIZES.includes(size)) throw new BuildError('size', `Unknown map size "${size}" (small or large)`);
  const s = SCENARIOS[size === 'large' ? theme + '-large' : theme];
  return features ? { ...s, rows: s.featureRows, withFeatures: true } : s;
}
const DEFAULT_SCENARIO_ID = 'basin';
const SCENARIO = SCENARIOS[DEFAULT_SCENARIO_ID]; // what a battle uses when it is not told which map to play
