'use strict';

// The maps ("scenarios"). Each is 19 columns by 12 rows (the renderer and the unit panel are laid out for that size), flat-top hexes with
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
}

const SCENARIO_IDS = Object.keys(SCENARIOS);
const DEFAULT_SCENARIO_ID = 'basin';
const SCENARIO = SCENARIOS[DEFAULT_SCENARIO_ID]; // what a battle uses when it is not told which map to play
