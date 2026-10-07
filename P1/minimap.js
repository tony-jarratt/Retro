// A small map of the whole circuit in the bottom right corner, north at the top like the main view.
// The circuit is drawn once into a small canvas; drawMinimap() draws that and then a dot for each car on
// top: team colours for the AI cars, teal with a white ring for you. The circuit screen reuses
// makeMapCanvas() for the little map on each circuit's card.

const MINIMAP_MAX_W = 130;  // the panel fits the track's shape, up to this size in screen pixels
const MINIMAP_MAX_H = 120;
const MINIMAP_PAD = 7;     // room round the track inside the panel
const MINIMAP_MARGIN = 8;  // gap between the panel and the screen edge

let minimap = null;        // { canvas, w, h, minX, minY, scale, offX, offY }

// Draw a circuit (a list of map points) into a canvas that fits within maxW x maxH, with a white tick at
// the start/finish line (segment lineSeg). Returns the canvas and how world points map onto it.
function makeMapCanvas(points, maxW, maxH, lineSeg) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const maxInnerW = maxW - 2 * MINIMAP_PAD, maxInnerH = maxH - 2 * MINIMAP_PAD;
  const scale = Math.min(maxInnerW / (maxX - minX), maxInnerH / (maxY - minY));   // fit the whole track
  const w = Math.ceil((maxX - minX) * scale) + 2 * MINIMAP_PAD;                     // and size the panel to it
  const h = Math.ceil((maxY - minY) * scale) + 2 * MINIMAP_PAD;
  const offX = MINIMAP_PAD, offY = MINIMAP_PAD;
  const to = (p) => ({ x: offX + (p.x - minX) * scale, y: offY + (p.y - minY) * scale });

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.65)';
  g.fillRect(0, 0, w, h);

  // the track: a dark outline with a light centre
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  points.forEach((p, i) => { const q = to(p); (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)); });
  g.closePath();
  g.strokeStyle = '#15151A';
  g.lineWidth = 6;
  g.stroke();
  g.strokeStyle = '#C4C4CC';
  g.lineWidth = 3;
  g.stroke();

  // the start/finish line: a short white tick across the track
  const a = to(points[lineSeg]), b = to(points[lineSeg + 1]);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
  g.strokeStyle = '#FFFFFF';
  g.lineWidth = 2;
  g.lineCap = 'butt';
  g.beginPath();
  g.moveTo(a.x - nx * 4, a.y - ny * 4);
  g.lineTo(a.x + nx * 4, a.y + ny * 4);
  g.stroke();

  return { canvas, w, h, minX, minY, scale, offX, offY };
}

function buildMinimap() {
  minimap = makeMapCanvas(tdPts, MINIMAP_MAX_W, MINIMAP_MAX_H, LINE_SEG);
}

function drawMinimap() {
  if (!minimap) throw new Error('drawMinimap() was called before buildMinimap()');
  const x0 = LW - MINIMAP_MARGIN - minimap.w, y0 = LH - MINIMAP_MARGIN - minimap.h;
  ctx.drawImage(minimap.canvas, x0, y0);

  const dot = (wx, wy, radius, fill, ring, ringWidth) => {
    const x = x0 + minimap.offX + (wx - minimap.minX) * minimap.scale;
    const y = y0 + minimap.offY + (wy - minimap.minY) * minimap.scale;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = ring;
    ctx.lineWidth = ringWidth;
    ctx.stroke();
  };
  if (session === 'race') {   // the AI cars are not on the track in qualifying
    for (const ai of ais) {
      const p = tdPointAt(ai.z, 0);   // centreline is plenty accurate at this size
      dot(p.x, p.y, 2.5, ai.team.body, '#000000', 1);
    }
  }
  dot(tdX, tdY, 3.5, '#00D2BE', '#FFFFFF', 1.5);
}
