// Doors: where they are, their open/close state machine, and the "use" key.
// How rays see a door (a thin slab across the middle of its cell) is in
// raycaster.js, hitDoor.

const DOOR_SPEED = 1.0;     // fraction of the doorway per second: 1s to open or close
const DOOR_OPEN_TIME = 3.0; // seconds a door stays open before closing by itself
const USE_REACH = 1.5;      // how far ahead, in cells, you can reach to open a door

// One entry per door cell in MAP, built once at startup:
//   x, y        the door's cell
//   horizontal  true if it runs east-west (walls to its left and right)
//   open        how far it has slid away: 0 = shut, 1 = fully open
//   state       'closed' -> 'opening' -> 'open' -> 'closing' -> 'closed'
//   timer       seconds left before an open door starts closing
const DOORS = findDoors();

function findDoors() {
  const isSolid = (x, y) => { const c = MAP[y]?.[x]; return c !== undefined && c !== 0 && c !== DOOR_CELL; };
  const isFloor = (x, y) => MAP[y]?.[x] === 0;

  const doors = [];
  MAP.forEach((row, y) => row.forEach((cell, x) => {
    if (cell !== DOOR_CELL) return;
    // A door must sit in a gap in a straight wall: solid on two opposite
    // sides, floor on the other two (the rooms it connects).
    const horizontal = isSolid(x - 1, y) && isSolid(x + 1, y) && isFloor(x, y - 1) && isFloor(x, y + 1);
    const vertical = isSolid(x, y - 1) && isSolid(x, y + 1) && isFloor(x - 1, y) && isFloor(x + 1, y);
    if (!horizontal && !vertical) {
      throw new Error(`Door at MAP[${y}][${x}] must have walls on two opposite sides and floor on the other two.`);
    }
    doors.push({ x, y, horizontal, open: 0, state: 'closed', timer: 0 });
  }));
  return doors;
}

function doorAt(x, y) {
  return DOORS.find((door) => door.x === x && door.y === y);
}

// Is the player or a working robot standing (even partly) in this door's
// cell? The cell is a box of half-width 0.5 centred on (door.x + 0.5,
// door.y + 0.5). A wreck doesn't count, or the door would never close again.
function doorwayOccupied(door) {
  const cx = door.x + 0.5;
  const cy = door.y + 0.5;
  return boxesOverlap(player.x, player.y, PLAYER_RADIUS, cx, cy, 0.5) ||
         enemies.some((enemy) => enemy.state !== 'dead' &&
           boxesOverlap(enemy.x, enemy.y, ENEMY_RADIUS, cx, cy, 0.5));
}

// The door state machine. Each state only ever moves to the next one, apart
// from 'closing', which useDoor can send back to 'opening'.
function updateDoors(dt) {
  for (const door of DOORS) {
    if (door.state === 'opening') {
      door.open = Math.min(1, door.open + DOOR_SPEED * dt);
      if (door.open === 1) {
        door.state = 'open';
        door.timer = DOOR_OPEN_TIME;
      }
    } else if (door.state === 'open') {
      door.timer -= dt;
      // Time's up, but never shut on anyone: wait until the doorway is clear.
      if (door.timer <= 0 && !doorwayOccupied(door)) door.state = 'closing';
    } else if (door.state === 'closing') {
      door.open = Math.max(0, door.open - DOOR_SPEED * dt);
      if (door.open === 0) door.state = 'closed';
    }
  }
}

// The "use" key (E or Space). Step forward from the player along the view
// direction, a quarter cell at a time, to the first cell that isn't floor.
// If that's a door within reach, open it. A wall in the way means nothing to use.
function useDoor() {
  const dirX = Math.cos(player.angle);
  const dirY = Math.sin(player.angle);
  for (let d = 0.25; d <= USE_REACH; d += 0.25) {
    const x = Math.floor(player.x + dirX * d);
    const y = Math.floor(player.y + dirY * d);
    const cell = MAP[y][x];
    if (cell === 0) continue;
    if (cell === DOOR_CELL) {
      const door = doorAt(x, y);
      if (door.state === 'closed' || door.state === 'closing') door.state = 'opening';
    }
    return;
  }
}
