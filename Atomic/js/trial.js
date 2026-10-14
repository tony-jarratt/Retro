'use strict';

// The rotation trial: three small rooms, each hiding something you only see by turning the camera (Z and X).
// trial.html loads this after data.js; it swaps the castle for these rooms and three of the rocket parts.
//   Turntable: a part tucked into the corner of an L of tall blocks that faces away from you.
//   Gallery: a part at the end of a path through pits, behind a high ridge.
//   Plinth: a part on a high plinth whose staircase is round the back.
const TRIAL_ROOMS = [
  { id: 'turntable', name: 'Turntable Hall', col: 0, row: 0, exits: { E: 5 },
    caption: 'Press Z or X to turn the room. The Professor hid three parts where you will not see them from here.',
    height: ['.........', '.........', '.........', '.........', '.......3.', '.......3.', '.....333.', '.........', '.........'],
    objects: ['.........', '.........', '.R.......', '.........', '.........', '......$..', '.........', '.S.......', '.........'] },
  { id: 'gallery', name: 'Gallery of Pits', col: 1, row: 0, exits: { W: 5, E: 5 },
    caption: 'There is a path behind the ridge. Most of it is floor. Some of it is not.',
    height: ['...x...xx', '.x.x.x.xx', 'xx...x...', '33333333.', '.........', '.........', '.........'],
    objects: ['.........', '$........', '.........', '.........', '.........', '.........', '.........'] },
  { id: 'plinth', name: 'The Plinth', col: 2, row: 0, exits: { W: 5 },
    caption: 'The part is on top. There is a way up. It is simply very shy.',
    height: ['.........', '.........', '.........', '..h1i2j3.', '..3333333', '..3333333', '..3333333', '..3333333', '.........'],
    objects: ['.........', '.........', '.........', '.........', '.........', '.........', '.....$...', '.........', '.........'] },
];
const TRIAL_PARTS = { nose: 'turntable', fins: 'gallery', gyro: 'plinth' };

ROOMS.splice(0, ROOMS.length, ...TRIAL_ROOMS);
PARTS.splice(0, PARTS.length, ...PARTS.filter((p) => p.id in TRIAL_PARTS).map((p) => ({ ...p, room: TRIAL_PARTS[p.id] })));
for (const id of Object.keys(ROOM_INDEX)) delete ROOM_INDEX[id];
ROOMS.forEach((r, i) => { ROOM_INDEX[r.id] = i; });
checkRooms();
