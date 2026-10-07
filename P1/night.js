// Night racing: for circuits whose style says night: true (Singapore).
//
// The world is drawn as normal, then a dark blue layer is laid over the whole screen and holes are cut
// out of it wherever there is light: a floodlit band along the road and the pit lane, a soft pool round
// each lamp post, and a pool ahead of every car's headlights. Glowing lamp heads, headlights, tail lights
// and lit windows are drawn on top, so they shine through the dark. It is dusk-style on purpose: dark
// blue surroundings, but the road and the corners ahead stay clear.

const NIGHT_DARKNESS = 0.56;      // how dark the surroundings are (0 = daylight, 1 = black)
const NIGHT_TINT = '8, 16, 48';   // the colour of the night
const NIGHT_LAMP_EVERY = 5;       // a lamp post every this many segments, on each side

let nightLamps = [];              // world positions of the lamp posts
let nightLayer = null;            // { canvas, g, hole, warm }: the dark layer and the two glow pictures

// Lamp posts just beyond the walls, on both sides (the pit lane is lit separately).
function buildNightLamps() {
  nightLamps = [];
  if (!currentTrack.style.night) return;
  for (let n = 0; n < segments.length; n += NIGHT_LAMP_EVERY) {
    for (const side of [-1, 1]) {
      if (side === 1 && n <= PIT_OUT_S / SEGMENT_LENGTH) continue;
      const p = tdPointAt(n * SEGMENT_LENGTH, side * TD_HALF * 1.75);
      nightLamps.push({ x: p.x, y: p.y });
    }
  }
}

// A soft round glow picture: bright in the middle, fading to nothing at the edge.
function makeGlow(rgb) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(' + rgb + ',1)');
  grad.addColorStop(0.35, 'rgba(' + rgb + ',0.55)');
  grad.addColorStop(1, 'rgba(' + rgb + ',0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return c;
}

function nightSetup() {
  const canvas = document.createElement('canvas');
  canvas.width = LW;
  canvas.height = LH;
  nightLayer = { canvas, g: canvas.getContext('2d'), hole: makeGlow('255,255,255'), warm: makeGlow('255,214,140') };
}

// Drawn over the finished world, in the same screen coordinates as the rest of the scene.
function drawNightLayer() {
  if (!nightLayer) nightSetup();
  const g = nightLayer.g;
  const toX = (wx) => LW / 2 + (wx - tdCamX) * tdZoom;
  const toY = (wy) => LH / 2 + (wy - tdCamY) * tdZoom;
  const onScreen = (sx, sy, margin) => sx > -margin && sx < LW + margin && sy > -margin && sy < LH + margin;

  // the dark layer...
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, LW, LH);
  g.fillStyle = 'rgba(' + NIGHT_TINT + ',' + NIGHT_DARKNESS + ')';
  g.fillRect(0, 0, LW, LH);

  // ...with light cut out of it
  g.globalCompositeOperation = 'destination-out';
  g.save();
  g.translate(LW / 2 - tdCamX * tdZoom, LH / 2 - tdCamY * tdZoom);
  g.scale(tdZoom, tdZoom);
  g.lineJoin = 'round';
  g.lineCap = 'butt';
  g.beginPath();                                    // the floodlit road: a wide soft band and a brighter core
  tdPts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
  g.strokeStyle = 'rgba(0,0,0,0.30)';
  g.lineWidth = 2 * TD_HALF * 1.9;
  g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.50)';
  g.lineWidth = 2 * TD_HALF * 1.35;
  g.stroke();
  g.beginPath();                                    // the pit road is floodlit too
  for (let s = PIT_IN_S; s <= PIT_OUT_S; s += SEGMENT_LENGTH) {
    const p = tdPointAt(s, pitCentreX(s) * TD_HALF);
    (s === PIT_IN_S ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y));
  }
  g.strokeStyle = 'rgba(0,0,0,0.65)';
  g.lineWidth = 2 * TD_HALF * 0.8;
  g.stroke();
  g.restore();

  const hole = (wx, wy, radiusWorld, alpha) => {
    const r = radiusWorld * tdZoom;
    g.globalAlpha = alpha;
    g.drawImage(nightLayer.hole, toX(wx) - r, toY(wy) - r, 2 * r, 2 * r);
  };
  for (const lamp of nightLamps) {
    if (onScreen(toX(lamp.x), toY(lamp.y), 90)) hole(lamp.x, lamp.y, 1700, 0.5);
  }
  const cars = [{ x: tdX, y: tdY, h: tdHeading }];
  if (session === 'race') {
    for (const ai of ais) { const p = tdPointAt(ai.z, ai.x * TD_HALF); cars.push({ x: p.x, y: p.y, h: p.h }); }
  }
  for (const c of cars) {
    hole(c.x + Math.cos(c.h) * 700, c.y + Math.sin(c.h) * 700, 1500, 0.85);   // the pool ahead of the headlights
    hole(c.x, c.y, 800, 0.6);                                                  // and the car itself
  }
  g.globalAlpha = 1;
  ctx.drawImage(nightLayer.canvas, 0, 0, LW, LH);

  // light sources, on top of the dark
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const lamp of nightLamps) {
    const sx = toX(lamp.x), sy = toY(lamp.y);
    if (onScreen(sx, sy, 20)) ctx.drawImage(nightLayer.warm, sx - 14, sy - 14, 28, 28);
  }
  // lit windows in the buildings
  const range = Math.hypot(LW, LH) / 2 / tdZoom + 2500;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.sprites.length === 0) continue;
    if (Math.abs(tdPts[i].x - tdCamX) > range || Math.abs(tdPts[i].y - tdCamY) > range) continue;
    for (const sp of seg.sprites) {
      if (sp.type !== 'building') continue;
      const lateral = tdSpriteLateral(sp.x);
      const bx = toX(tdPts[i].x - tdDirY[i] * lateral), by = toY(tdPts[i].y + tdDirX[i] * lateral);
      for (let k = 0; k < 6; k++) {   // the same windows every frame, from the building's seed
        const a = ((sp.seed * 9301 + k * 49297) % 233280) / 233280, b = ((sp.seed * 7001 + k * 21341) % 233280) / 233280;
        ctx.fillStyle = k % 3 === 0 ? 'rgba(160,200,255,0.8)' : 'rgba(255,214,140,0.85)';
        ctx.fillRect(Math.round(bx - 14 + a * 28), Math.round(by - 10 + b * 20), 2, 2);
      }
    }
  }
  // headlights and tail lights
  for (const c of cars) {
    const fx = Math.cos(c.h), fy = Math.sin(c.h), rx = -fy, ry = fx;
    for (const side of [-1, 1]) {
      ctx.fillStyle = 'rgba(255,255,235,0.95)';
      ctx.fillRect(Math.round(toX(c.x + fx * 330 + rx * 110 * side)) - 1, Math.round(toY(c.y + fy * 330 + ry * 110 * side)) - 1, 2, 2);
      ctx.fillStyle = 'rgba(255,40,40,0.95)';
      ctx.fillRect(Math.round(toX(c.x - fx * 300 + rx * 110 * side)) - 1, Math.round(toY(c.y - fy * 300 + ry * 110 * side)) - 1, 2, 2);
    }
  }
  ctx.restore();
}
