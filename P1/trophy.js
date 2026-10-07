// The trophy screen at the end of a championship (top three only): a pixel-art cup, gold, silver or bronze,
// with twinkling stars, and falling confetti for the winner. drawTrophyScreen() uses trophyPlace and trophyT
// from game.js.

const TROPHY_SCALE = 8;
const TROPHY_METALS = [
  { name: 'GOLD',   main: '#FFD800', light: '#FFF2A8', dark: '#B88A00' },
  { name: 'SILVER', main: '#C8CDD6', light: '#F4F6FA', dark: '#80868F' },
  { name: 'BRONZE', main: '#CD7F32', light: '#EBB070', dark: '#8A4F1A' },
];
const trophyCache = {};

// 24 x 22 pixels, symmetrical. Everything is drawn as filled blocks from the top down.
function trophyArt(place) {
  if (trophyCache[place]) return trophyCache[place];
  const m = TROPHY_METALS[place], wood = '#3A2A1A', plate = '#E8E0C8';
  trophyCache[place] = makeArt(24, 22, (put) => {
    const row = (y, x0, x1, c) => put(x0, y, c || m.main, x1 - x0 + 1, 1);
    // handles
    put(1, 1, m.dark, 3, 1); put(0, 2, m.dark, 2, 5); put(1, 7, m.dark, 5, 1);
    put(20, 1, m.dark, 3, 1); put(22, 2, m.dark, 2, 5); put(18, 7, m.dark, 5, 1);
    // the cup, narrowing towards the stem
    row(0, 2, 21, m.light);
    for (let y = 1; y <= 2; y++) row(y, 3, 20);
    for (let y = 3; y <= 5; y++) row(y, 4, 19);
    for (let y = 6; y <= 8; y++) row(y, 5, 18);
    for (let y = 9; y <= 10; y++) row(y, 7, 16);
    row(11, 9, 14);
    put(5, 2, m.light, 2, 6);    // a shine down the left side
    put(16, 3, m.dark, 3, 6);    // and a shadow down the right
    // stem and foot
    put(10, 12, m.main, 4, 4); put(9, 13, m.main, 6, 1);
    put(7, 16, m.dark, 10, 2);
    // plinth
    put(4, 18, wood, 16, 4);
    put(9, 19, plate, 6, 2);
  });
  return trophyCache[place];
}

function drawTrophyScreen() {
  const place = trophyPlace, t = trophyT, m = TROPHY_METALS[place];
  ctx.fillStyle = '#0B1F12';
  ctx.fillRect(0, 0, LW, LH);

  // a soft glow behind the cup
  const g = ctx.createRadialGradient(LW / 2, 200, 10, LW / 2, 200, 190);
  g.addColorStop(0, 'rgba(255,240,160,0.30)');
  g.addColorStop(1, 'rgba(255,240,160,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LW, LH);

  if (place === 0) drawTrophyConfetti(t);

  ctx.textAlign = 'center';
  ctx.fillStyle = m.main;
  ctx.font = 'bold 30px monospace';
  ctx.fillText(place === 0 ? 'YOU ARE THE CHAMPION!' : place === 1 ? 'SECOND IN THE CHAMPIONSHIP!' : 'THIRD IN THE CHAMPIONSHIP!', LW / 2, 56);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '14px monospace';
  ctx.fillText(place === 0 ? 'Brilliant driving over all ' + TRACKS.length + ' circuits.' : 'A podium finish. Go again for gold!', LW / 2, 82);

  const art = trophyArt(place), w = art.width * TROPHY_SCALE, h = art.height * TROPHY_SCALE;
  const bob = Math.round(Math.sin(t * 2) * 3);   // the cup floats gently
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(art, Math.round(LW / 2 - w / 2), 112 + bob, w, h);

  // twinkling stars round the cup
  [[-150, 30], [150, 50], [-110, 150], [120, 160], [-60, -4], [70, 0]].forEach(([dx, dy], i) => {
    const phase = (t * 1.5 + i * 0.37) % 1;
    const size = Math.round(2 + 6 * Math.sin(phase * Math.PI));   // grows then shrinks
    const x = LW / 2 + dx, y = 150 + dy;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x - size, y, 2 * size + 1, 1);
    ctx.fillRect(x, y - size, 1, 2 * size + 1);
  });

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 16px monospace';
  ctx.fillText(m.name + ' TROPHY', LW / 2, 332);
  if (t > 1.5 && Math.floor(t * 2) % 2 === 0) {   // blinks, after the fanfare
    ctx.font = '15px monospace';
    ctx.fillText('Press Enter to see the final table', LW / 2, 390);
  }
}

function drawTrophyConfetti(t) {
  const colours = ['#FFD800', '#00D2BE', '#D01010', '#2060D0', '#F08020', '#7A3FC0', '#2E9E3E', '#FFFFFF'];
  for (let i = 0; i < 70; i++) {
    const speed = 50 + (i % 5) * 22;
    const x = (i * 97) % LW + Math.sin(t * 2 + i) * 12;
    const y = ((t * speed + i * 53) % (LH + 40)) - 20;
    ctx.fillStyle = colours[i % colours.length];
    ctx.fillRect(Math.round(x), Math.round(y), 5, i % 2 ? 3 : 5);
  }
}
