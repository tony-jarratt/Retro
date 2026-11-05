// Doors: where they are, and their open/close state machine. They open by
// themselves when you come near. How rays see a door (a thin slab across the
// middle of its cell) is in raycaster.js, hitDoor; how light gets through as
// one opens is in lighting.js, updateDoorLights.

const DOOR_SPEED = 1.0;          // fraction of the doorway per second: 1s to open or close
const DOOR_OPEN_TIME = 2.0;      // seconds a door stays open after you've moved away
const DOOR_TRIGGER_RANGE = 1.3;  // cells from the door's centre: about one cell away, head-on

// One entry per door cell in MAP, built once at startup:
//   x, y        the door's cell
//   horizontal  true if it runs east-west (walls to its left and right)
//   open        how far it has slid away: 0 = shut, 1 = fully open
//   state       'closed' -> 'opening' -> 'open' -> 'closing' -> 'closed'
//   timer       seconds left before an open door starts closing
//   lock        null, or the colour of keycard it needs ('red', 'blue'), from LOCKED_DOORS
const DOORS = findDoors();

// The key colour of the locked door you're standing at without its card, or
// null. The HUD shows "RED KEYCARD NEEDED" while this is set.
let lockedDoorHint = null;

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
    const locked = LOCKED_DOORS.find((l) => l.x === x && l.y === y);
    doors.push({ x, y, horizontal, open: 0, state: 'closed', timer: 0, lock: locked ? locked.key : null });
  }));
  // Every lock in the map must sit on a real door, and need a real key.
  for (const l of LOCKED_DOORS) {
    if (MAP[l.y]?.[l.x] !== DOOR_CELL) {
      throw new Error(`LOCKED_DOORS entry at cell (${l.x}, ${l.y}) is not on a door (MAP value ${DOOR_CELL}).`);
    }
    if (!KEY_COLOURS[l.key]) {
      throw new Error(`LOCKED_DOORS entry at cell (${l.x}, ${l.y}) needs key "${l.key}", which is not in KEY_COLOURS.`);
    }
  }
  return doors;
}

// Can the player open this door? Unlocked doors always; locked ones only
// once you're carrying the matching keycard.
function playerCanOpen(door) {
  return door.lock === null || player.keys.includes(door.lock);
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

// Is the player close enough to set the door off? Measured from the middle
// of the door's cell, so standing in the next cell along, facing it, counts,
// but brushing past diagonally (1.41 away) doesn't.
function playerNearDoor(door) {
  return Math.hypot(player.x - (door.x + 0.5), player.y - (door.y + 0.5)) <= DOOR_TRIGGER_RANGE;
}

// The door state machine:
//   closed   -> opening  when you come near
//   opening  -> open     once fully slid away
//   open     -> closing  DOOR_OPEN_TIME after you've moved away, if the doorway is clear
//   closing  -> opening  if you come back near before it shuts
//   closing  -> closed   once shut
// A locked door ignores you until you have its keycard: that's the only
// difference, one extra condition on the very first step.
function updateDoors(dt) {
  lockedDoorHint = null;
  for (const door of DOORS) {
    const near = playerNearDoor(door);
    if (near && !playerCanOpen(door)) lockedDoorHint = door.lock;
    if (near && playerCanOpen(door) && (door.state === 'closed' || door.state === 'closing')) door.state = 'opening';

    if (door.state === 'opening') {
      door.open = Math.min(1, door.open + DOOR_SPEED * dt);
      if (door.open === 1) {
        door.state = 'open';
        door.timer = DOOR_OPEN_TIME;
      }
    } else if (door.state === 'open') {
      // The countdown only runs once you've walked away; while you're near
      // it's held at full.
      door.timer = near ? DOOR_OPEN_TIME : door.timer - dt;
      // Time's up, but never shut on anyone: wait until the doorway is clear.
      if (door.timer <= 0 && !doorwayOccupied(door)) door.state = 'closing';
    } else if (door.state === 'closing') {
      door.open = Math.max(0, door.open - DOOR_SPEED * dt);
      if (door.open === 0) door.state = 'closed';
    }
  }
}
