// Top-down debug view (toggle with M): the map, the player, and every ray.
// Drawn with ordinary canvas calls on its own full-resolution canvas,
// so it stays crisp while the 3D view is chunky.

const DEBUG_CELL = 10; // pixels per map cell (the 32x24 level makes a 320x240 map)

function drawDebug(ctx, player, hits) {
  const rows = MAP.length;
  const cols = MAP[0].length;
  const s = DEBUG_CELL;

  ctx.clearRect(0, 0, cols * s, rows * s);

  // Map cells, then faint grid lines.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = MAP[y][x];
      const empty = cell === 0 || cell === DOOR_CELL || isPanelCell(cell);
      ctx.fillStyle = empty ? 'rgba(0, 0, 0, 0.85)' : `rgb(${TEXTURES[cell].colour.join(',')})`;
      ctx.fillRect(x * s, y * s, s, s);
    }
  }

  // Doors: a thick line across the middle of the cell, for the part not yet
  // slid away. Locked doors are drawn in their key's colour.
  ctx.lineWidth = 3;
  for (const door of DOORS) {
    ctx.strokeStyle = `rgb(${(door.lock ? KEY_COLOURS[door.lock] : TEXTURES[DOOR_CELL].colour).join(',')})`;
    if (door.horizontal) line(ctx, (door.x + door.open) * s, (door.y + 0.5) * s, (door.x + 1) * s, (door.y + 0.5) * s);
    else line(ctx, (door.x + 0.5) * s, (door.y + door.open) * s, (door.x + 0.5) * s, (door.y + 1) * s);
  }
  // Panels, as thinner lines: glass pale blue (dashed once it's shattered), grates grey.
  ctx.lineWidth = 2;
  for (const p of PANELS) {
    ctx.strokeStyle = p.kind === 'grate' ? '#999' : p.state === 'cracked' ? '#cef' : '#7bd';
    if (p.state === 'shattered') ctx.setLineDash([2, 2]);
    if (p.horizontal) line(ctx, p.x * s, (p.y + 0.5) * s, (p.x + 1) * s, (p.y + 0.5) * s);
    else line(ctx, (p.x + 0.5) * s, p.y * s, (p.x + 0.5) * s, (p.y + 1) * s);
    ctx.setLineDash([]);
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

  // Props: solid ones filled (at their collision size), others as rings.
  // Explosive drums are orange until they blow, then a dim ring.
  for (const p of props) {
    const solid = SPRITE_TYPES[p.type].solid && p.state !== 'exploded';
    ctx.strokeStyle = ctx.fillStyle = p.state === 'exploded' ? '#666' : SPRITE_TYPES[p.type].explosive ? '#f84' : '#eee';
    ctx.beginPath();
    ctx.arc(p.x * s, p.y * s, SOLID_SPRITE_RADIUS * s, 0, Math.PI * 2);
    if (solid) ctx.fill();
    else ctx.stroke();
  }

  // Security: zone outlines (red while alarmed), tripwire beams, terminals,
  // and each camera's view cone.
  for (const z of ZONES) {
    ctx.strokeStyle = alarms[z.id] > 0 ? 'rgba(255, 60, 40, 0.8)' : 'rgba(120, 200, 255, 0.25)';
    ctx.strokeRect(z.x * s + 1, z.y * s + 1, z.w * s - 2, z.h * s - 2);
  }
  ctx.strokeStyle = '#f33';
  for (const t of tripwires) if (t.state === 'armed') line(ctx, t.x0 * s, (t.y + 0.5) * s, (t.x1 + 1) * s, (t.y + 0.5) * s);
  for (const term of terminals) {
    ctx.fillStyle = term.state === 'safe' ? '#4f8' : '#f44';
    ctx.fillRect((term.x + 0.25) * s, (term.y + 0.25) * s, 0.5 * s, 0.5 * s);
  }
  for (const c of cameras) {
    ctx.strokeStyle = ctx.fillStyle = c.state === 'watching' ? '#f66' : '#666';
    ctx.fillRect((c.x - 0.15) * s, (c.y - 0.15) * s, 0.3 * s, 0.3 * s);
    if (c.state !== 'watching') continue;
    for (const side of [-1, 1]) {
      const a = c.angle + side * CAMERA_CONE / 2;
      line(ctx, c.x * s, c.y * s, (c.x + Math.cos(a) * CAMERA_RANGE) * s, (c.y + Math.sin(a) * CAMERA_RANGE) * s);
    }
  }

  // Steam vents: a ring, filled white while bursting.
  for (const v of vents) {
    ctx.strokeStyle = ctx.fillStyle = v.state === 'burst' ? '#fff' : v.state === 'sputter' ? '#aaa' : '#666';
    ctx.beginPath();
    ctx.arc(v.x * s, v.y * s, STEAM_RADIUS * s, 0, Math.PI * 2);
    if (v.state === 'burst') ctx.fill();
    else ctx.stroke();
  }

  // Lights: a small cross coloured by kind, dim while it's flickering off.
  const LIGHT_COLOURS = { lamp: '#fa4', ceiling: '#cdf', screen: '#4f8' };
  for (const light of LIGHTS) {
    ctx.strokeStyle = LIGHT_COLOURS[light.kind];
    ctx.globalAlpha = 0.4 + 0.6 * light.level;
    line(ctx, (light.x - 0.2) * s, light.y * s, (light.x + 0.2) * s, light.y * s);
    line(ctx, light.x * s, (light.y - 0.2) * s, light.x * s, (light.y + 0.2) * s);
    ctx.globalAlpha = 1;
  }

  // Pickups: small squares, gold for ammo, white for repair kits, keycards in their colour.
  const PICKUP_COLOURS = { repair: '#fff', redkey: '#f44', bluekey: '#48f' };
  for (const p of pickups) {
    ctx.fillStyle = PICKUP_COLOURS[p.type] || '#fc4';
    ctx.fillRect((p.x - 0.15) * s, (p.y - 0.15) * s, 0.3 * s, 0.3 * s);
  }

  // Robots: a dot coloured by state, with a line showing which way each faces,
  // and a dashed line through the cells of the path it's following (pathfinding.js).
  const STATE_COLOURS = { idle: '#a33', chase: '#f22', aim: '#ff0', search: '#f80', dead: '#555', dormant: '#775', offline: '#333' };
  for (const enemy of enemies) {
    if (enemy.path && enemy.path.length > 0) {
      ctx.strokeStyle = STATE_COLOURS[enemy.state];
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(enemy.x * s, enemy.y * s);
      for (const cell of enemy.path) ctx.lineTo((cell.x + 0.5) * s, (cell.y + 0.5) * s);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = ctx.strokeStyle = STATE_COLOURS[enemy.state];
    ctx.beginPath();
    ctx.arc(enemy.x * s, enemy.y * s, ENEMY_RADIUS * s, 0, Math.PI * 2);
    ctx.fill();
    line(ctx, enemy.x * s, enemy.y * s,
      (enemy.x + Math.cos(enemy.angle) * 0.7) * s, (enemy.y + Math.sin(enemy.angle) * 0.7) * s);
  }

  // Drones: small dots, dim while waiting; hives as squares on their wall.
  for (const d of drones) {
    if (d.state === 'dead') continue;
    ctx.fillStyle = d.state === 'swarm' ? '#f4f' : '#848';
    ctx.fillRect((d.x - 0.1) * s, (d.y - 0.1) * s, 0.2 * s, 0.2 * s);
  }
  for (const h of hives) {
    ctx.strokeStyle = h.state === 'empty' ? '#555' : '#f4f';
    ctx.strokeRect((h.x + 0.2) * s, (h.y + 0.2) * s, 0.6 * s, 0.6 * s);
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
