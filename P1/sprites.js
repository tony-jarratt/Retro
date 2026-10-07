// Pixel-art cars. The car is a 48x30 pixel rear view written as text: only the left half is
// drawn (24 columns) and mirrored, so it is always symmetrical. Each row is run-length coded:
// a letter followed by how many pixels of it, e.g. "T5E2a17" = 5 tyre, 2 endplate, 17 accent.
//
// Letters (colours come from carPalette):
//   . clear      H helmet   V visor     K/k airbox and halo
//   B body (h = highlight on the left, mirrored to shade on the right)
//   P sidepod (p = shade)   a wing flap in the team accent colour
//   W/w/x rear wing main plane, light edge, shadow    E wing endplate
//   T/t/g tyre, top highlight, groove    c tyre compound colour band
//   s suspension   D/d diffuser and fins   R rain light   X exhaust
const CAR_ART_SCALE = 2;   // screen pixels per art pixel at the player's distance

const CAR_ART_LEFT = [
  '.17K7',
  '.17K2H5',
  '.17K2H2V3',
  '.17K2H5',
  '.1t6.11k1K5',
  '.1T6.11k1K5',
  '.1T6.11k1K5',
  '.1T6.11k1K5',
  '.1c6.10h1B6',
  '.1T6s8.2h1B6',
  '.1T6s8.2h1B6',
  '.1T6.10h1B6',
  't11.5h1B7',
  'T11.1p1P5h1B5',
  'T11.1p1P5h1B5',
  'g11.1p1P5h1B5',
  'T5E2T4.1p1P5h1B5',
  'T5E2a17',
  'T5E2a17',
  'T5E2w17',
  'T5E2W17',
  'T5E2W17',
  'T5E2x17',
  'c5E2c4.1p1P5h1B4k1',
  'T5E2T4.1p1P5h1B5',
  'g5E2g4.1p1P5h1B5',
  'T5E2T3W14',
  'T5E2T3x11X3',
  'g11D12R1',
  'g11D3d1D3d1D3d1D1',
];

// Expand each row and add its mirror image. Throws if a row is not exactly 24 pixels wide.
const CAR_ART = CAR_ART_LEFT.map((rle, y) => {
  const left = rle.replace(/(.)(\d+)/g, (m, ch, n) => ch.repeat(Number(n)));
  if (left.length !== 24) throw new Error('car art row ' + y + ' is ' + left.length + ' pixels wide, expected 24: ' + rle);
  const right = [...left].reverse().map(ch => (ch === 'h' ? 'b' : ch)).join('');
  return left + right;
});

function shadeColour(hex, factor) {
  const channels = [1, 3, 5].map(i => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * factor)));
  return '#' + channels.map(v => v.toString(16).padStart(2, '0')).join('');
}

// livery: { body, pod, accent, wing, end, helmet, tyre } as '#RRGGBB'
function carPalette(c) {
  return {
    B: c.body, h: shadeColour(c.body, 1.15), b: shadeColour(c.body, 0.8),
    P: c.pod, p: shadeColour(c.pod, 0.7),
    a: c.accent, W: c.wing, w: shadeColour(c.wing, 1.1), x: shadeColour(c.wing, 0.7),
    E: c.end, H: c.helmet, V: '#101820', K: '#1A1A1A', k: '#333333',
    T: '#121212', t: '#2E2E2E', g: '#242424', c: c.tyre,
    s: '#555555', D: '#1C1C1C', d: '#333333', R: '#FF2020', X: '#222222',
  };
}

// Five frames per livery, leaning from hard left to hard right. Each row is shifted sideways in
// proportion to its height above the bottom, which tips the car without redrawing it.
const CAR_LEANS = [-4, -2, 0, 2, 4];
const CAR_PAD = 4;
const carFrameCache = {};

function carFrames(livery) {
  const key = [livery.body, livery.pod, livery.accent, livery.wing, livery.end, livery.helmet, livery.tyre].join('|');
  if (carFrameCache[key]) return carFrameCache[key];

  const pal = carPalette(livery);
  const h = CAR_ART.length, w = CAR_ART[0].length;
  const frames = CAR_LEANS.map(lean => {
    const cv = document.createElement('canvas');
    cv.width = w + CAR_PAD * 2;
    cv.height = h;
    const g = cv.getContext('2d');
    for (let y = 0; y < h; y++) {
      const shift = Math.round(lean * (h - 1 - y) / (h - 1));
      for (let x = 0; x < w; x++) {
        const ch = CAR_ART[y][x];
        if (ch === '.') continue;
        if (!pal[ch]) throw new Error('car art uses "' + ch + '" (row ' + y + ') but the palette has no colour for it');
        g.fillStyle = pal[ch];
        g.fillRect(x + CAR_PAD + shift, y, 1, 1);
      }
    }
    return cv;
  });
  carFrameCache[key] = frames;
  return frames;
}

// (x, y) is the bottom centre of the car, px is screen pixels per art pixel,
// lean runs from -1 (hard left) to 1 (hard right).
function drawCarSprite(frames, lean, x, y, px) {
  const frame = frames[Math.max(-2, Math.min(2, Math.round(lean * 2))) + 2];
  ctx.imageSmoothingEnabled = px >= 1;   // crisp pixels up close, smooth when the car is tiny
  ctx.drawImage(frame, Math.round(x - frame.width * px / 2), Math.round(y - frame.height * px), frame.width * px, frame.height * px);
}
