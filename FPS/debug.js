// Top-down debug view (toggle with M): the map, the player, and every ray.
// Drawn with ordinary canvas calls on its own full-resolution canvas,
// so it stays crisp while the 3D view is chunky.

const DEBUG_CELL = 16; // pixels per map cell

function drawDebug(ctx, player, hits) {
  const rows = MAP.length;
  const cols = MAP[0].length;
  const s = DEBUG_CELL;

  ctx.clearRect(0, 0, cols * s, rows * s);

  // Map cells, then faint grid lines.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = MAP[y][x];
      ctx.fillStyle = cell === 0 ? 'rgba(0, 0, 0, 0.85)' : `rgb(${WALL_COLOURS[cell].join(',')})`;
      ctx.fillRect(x * s, y * s, s, s);
    }
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= cols; x++) line(ctx, x * s, 0, x * s, rows * s);
  for (let y = 0; y <= rows; y++) line(ctx, 0, y * s, cols * s, y * s);

  // Every ray, from the player to where it hit. Map units * s = debug pixels.
  ctx.strokeStyle = 'rgba(255, 220, 80, 0.25)';
  for (const hit of hits) line(ctx, player.x * s, player.y * s, hit.hitX * s, hit.hitY * s);

  // The edge rays and the centre ray, brighter, to show the field of view.
  ctx.strokeStyle = 'rgba(255, 220, 80, 0.9)';
  for (const hit of [hits[0], hits[hits.length >> 1], hits[hits.length - 1]]) {
    line(ctx, player.x * s, player.y * s, hit.hitX * s, hit.hitY * s);
  }

  // The player: a dot showing the collision box size.
  ctx.fillStyle = '#4cf';
  ctx.beginPath();
  ctx.arc(player.x * s, player.y * s, PLAYER_RADIUS * s, 0, Math.PI * 2);
  ctx.fill();
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
