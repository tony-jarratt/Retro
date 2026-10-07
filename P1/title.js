// The moving pictures on the first screen: a strip of road along the top with the six cars racing along it,
// and a waving chequered flag either side of the title. drawTitleArt(t) takes the time in seconds.

const TITLE_ROAD_H = 26;
const TITLE_CAR_SPEEDS = [112, 104, 96, 88, 80, 72];   // pixels per second, fastest first, so the pack keeps shuffling
const TITLE_CAR_GAP = 130;                             // distance between cars at the start of the pack
const TITLE_SPARK_LIFE = 0.4;                          // seconds a spark lasts

let titleSparks = [];      // { x, y, vx, vy, age }: little sparks where one car passes another
let titlePrev = null;      // { t, xs, ys } from the last frame, to spot a car passing another

function titleCarLiveries() {
  const player = { body: '#C8CDD2', pod: '#9AA0A6', accent: '#00D2BE', wing: '#F4F4F4', end: '#1E1E1E', helmet: '#00D2BE', tyre: '#E01010' };
  return [player].concat(AI_TEAMS.map(t => ({ body: t.body, pod: t.pod, accent: t.body, wing: t.wing, end: t.end, helmet: t.helmet, tyre: '#E01010' })));
}

function drawTitleRoad(t) {
  ctx.fillStyle = '#2A2A2E';
  ctx.fillRect(0, 0, LW, TITLE_ROAD_H);
  for (let x = -((t * 60) % 40); x < LW; x += 40) {   // the dashed centre line slides past
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(Math.round(x), TITLE_ROAD_H / 2 - 1, 20, 2);
  }
  for (let x = -((t * 60) % 16), k = 0; x < LW; x += 8, k++) {   // red and white kerb along the bottom edge
    ctx.fillStyle = k % 2 ? '#D01010' : '#F4F4F4';
    ctx.fillRect(Math.round(x), TITLE_ROAD_H, 8, 3);
  }
  const liveries = titleCarLiveries();
  const span = LW + 2 * TITLE_CAR_GAP;
  const xs = liveries.map((l, i) => ((t * TITLE_CAR_SPEEDS[i] + (liveries.length - i) * TITLE_CAR_GAP) % span) - TITLE_CAR_GAP / 2);
  const ys = liveries.map((l, i) => TITLE_ROAD_H / 2 + (i % 2 ? 4 : -4) + Math.round(Math.sin(t * 3 + i) * 1.5));   // two lanes, with a little weave
  updateTitleSparks(t, xs, ys);
  liveries.forEach((livery, i) => {
    const frame = topCarFrame(livery);
    ctx.save();
    ctx.translate(Math.round(xs[i]), ys[i]);
    ctx.rotate(Math.PI / 2);   // the art has its nose up; this points it right
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(frame, -frame.width / 2, -frame.height / 2);
    ctx.restore();
  });
  for (const sp of titleSparks) {   // the sparks, over the cars
    ctx.fillStyle = sp.age < TITLE_SPARK_LIFE * 0.5 ? '#FFF6B0' : '#FF9A20';
    ctx.globalAlpha = 1 - sp.age / TITLE_SPARK_LIFE;
    ctx.fillRect(Math.round(sp.x), Math.round(sp.y), 2, 2);
  }
  ctx.globalAlpha = 1;
}

// A spark burst where a car pulls level with the one in front. Cars that wrap round off screen are ignored.
function updateTitleSparks(t, xs, ys) {
  const dt = titlePrev ? Math.min(0.1, Math.max(0, t - titlePrev.t)) : 0;
  for (const sp of titleSparks) { sp.age += dt; sp.x += sp.vx * dt; sp.y += sp.vy * dt; }
  titleSparks = titleSparks.filter(sp => sp.age < TITLE_SPARK_LIFE);
  if (titlePrev) {
    for (let i = 0; i < xs.length; i++) {
      for (let j = 0; j < xs.length; j++) {
        if (i === j) continue;
        const was = titlePrev.xs[i] - titlePrev.xs[j], now = xs[i] - xs[j];
        const passed = was < 0 && now >= 0 && Math.abs(now - was) < 40;   // car i went from behind j to ahead of it
        if (!passed || xs[i] < 0 || xs[i] > LW) continue;
        for (let k = 0; k < 5; k++) {
          titleSparks.push({ x: xs[i] - 10, y: (ys[i] + ys[j]) / 2, vx: -30 - Math.random() * 60, vy: (Math.random() - 0.5) * 50, age: 0 });
        }
      }
    }
  }
  titlePrev = { t, xs, ys };
}

// A chequered flag on a pole, rippling in columns. x, y is the top of the pole; the flag hangs to its right.
function drawTitleFlag(x, y, t, flip) {
  const cols = 28, colW = 2, rows = 5, sq = 6;   // 28 columns of 2 px = 56 px wide, 5 rows of 6 px = 30 px tall
  ctx.fillStyle = '#B0B0B8';
  ctx.fillRect(x - 2, y, 3, 56);
  ctx.fillStyle = '#FFD800';
  ctx.fillRect(x - 3, y - 2, 5, 3);
  for (let c = 0; c < cols; c++) {
    const wave = Math.sin(c * 0.45 - t * 6) * (1 + c * 0.12);   // the free end ripples most
    const shade = Math.cos(c * 0.45 - t * 6) * 0.18;             // darker where the cloth tilts away
    const cx = flip ? x - (c + 1) * colW : x + 1 + c * colW;
    for (let r = 0; r < rows; r++) {
      const black = (Math.floor(c / 3) + r) % 2 === 0;
      const v = Math.round((black ? 25 : 245) * (1 + (black ? -shade : shade)));
      ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      ctx.fillRect(cx, Math.round(y + 2 + r * sq + wave), colW, sq);
    }
  }
}

function drawTitleArt(t) {
  drawTitleRoad(t);
  drawTitleFlag(76, 32, t, false);
  drawTitleFlag(LW - 76, 32, t + 1.3, true);
}
