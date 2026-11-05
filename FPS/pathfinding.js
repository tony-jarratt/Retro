// PATHFINDING for the robots: breadth-first search (BFS) over the grid cells.
//
// BFS explores outwards from the start one ring of cells at a time, like a
// ripple: first every cell 1 step away, then every cell 2 steps away, and so
// on. So the first time it reaches the goal, it got there by a shortest
// route. For each cell it reaches, it notes which cell it came from; walking
// those notes backwards from the goal gives the path.
//
// Moves are up/down/left/right only (no diagonals), so a path never cuts a
// wall corner, and a robot following it can't snag on one.

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Which cells a robot can walk through this frame: 1 = yes. Rebuilt every
// frame (updateEnemies), because doors open and close and drums blow up.
let walkableCells = new Uint8Array(0);

function buildWalkableCells() {
  const w = MAP[0].length;
  walkableCells = new Uint8Array(w * MAP.length);
  MAP.forEach((row, y) => row.forEach((cell, x) => {
    // Floor, or a doorway whose door is fully open. Robots can't open doors.
    const open = cell === 0 || (cell === DOOR_CELL && doorAt(x, y).open === 1);
    walkableCells[y * w + x] = open ? 1 : 0;
  }));
  // A cell with a drum or strut standing in it is blocked too.
  for (const p of props) {
    if (SPRITE_TYPES[p.type].solid && p.state !== 'exploded') {
      walkableCells[Math.floor(p.y) * w + Math.floor(p.x)] = 0;
    }
  }
}

// The cells to walk through, in order, to get from the cell containing
// (fromX, fromY) to the cell containing (toX, toY). The start cell isn't
// included; the goal cell is the last entry. Returns [] if they're already in
// the same cell, and null if there's no way through at all.
function findPath(fromX, fromY, toX, toY) {
  const w = MAP[0].length;
  // The walkable map must have been built this frame (updateEnemies does it).
  // Without it, every lookup below reads "undefined" and the walk back along
  // the path never ends: better to say so loudly.
  if (walkableCells.length !== w * MAP.length) {
    throw new Error(`findPath called before buildWalkableCells: walkableCells has ${walkableCells.length} cells, the map ${w * MAP.length}.`);
  }
  const start = Math.floor(fromY) * w + Math.floor(fromX);
  const goal = Math.floor(toY) * w + Math.floor(toX);
  if (start === goal) return [];

  // cameFrom[cell] is the cell we first reached it from; -1 = not reached yet.
  // (Cells are numbered y * width + x, so one number stands for a cell.)
  const cameFrom = new Int32Array(walkableCells.length).fill(-1);
  cameFrom[start] = start;
  const queue = [start]; // cells to explore, nearest first

  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    if (cell === goal) break;
    const cx = cell % w;
    const cy = Math.floor(cell / w);
    for (const [dx, dy] of NEIGHBOURS) {
      const n = (cy + dy) * w + (cx + dx);
      // The goal counts as walkable even if the player is standing in a
      // doorway mid-swing: we only need to reach it, not stand in it.
      if (cameFrom[n] !== -1 || (walkableCells[n] === 0 && n !== goal)) continue;
      cameFrom[n] = cell;
      queue.push(n);
    }
  }

  if (cameFrom[goal] === -1) return null;
  const path = [];
  for (let c = goal; c !== start; c = cameFrom[c]) path.push({ x: c % w, y: Math.floor(c / w) });
  return path.reverse();
}
