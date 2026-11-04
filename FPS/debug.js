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
      const empty = cell === 0 || cell === DOOR_CELL;
      ctx.fillStyle = empty ? 'rgba(0, 0, 0, 0.85)' : `rgb(${TEXTURES[cell].colour.join(',')})`;
      ctx.fillRect(x * s, y * s, s, s);
    }
  }

  // Doors: a thick line across the middle of the cell, for the part not yet slid away.
  ctx.strokeStyle = `rgb(${TEXTURES[DOOR_CELL].colour.join(',')})`;
  ctx.lineWidth = 3;
  for (const door of DOORS) {
    if (door.horizontal) line(ctx, (door.x + door.open) * s, (door.y + 0.5) * s, (door.x + 1) * s, (door.y + 0.5) * s);
    else line(ctx, (door.x + 0.5) * s, (door.y + door.open) * s, (door.x + 0.5) * s, (door.y + 1) * s);
  }
  ctx.lineWidth = 1;
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

  // Sprites: solid ones filled (at their collision size), others as rings.
  ctx.strokeStyle = ctx.fillStyle = '#eee';
  for (const sprite of SPRITES) {
    ctx.beginPath();
    ctx.arc(sprite.x * s, sprite.y * s, SOLID_SPRITE_RADIUS * s, 0, Math.PI * 2);
    if (SPRITE_TYPES[sprite.type].solid) ctx.fill();
    else ctx.stroke();
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
