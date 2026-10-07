// The pit lane and the pit crew, seen from above in the overhead view.
//
// The rules for the pit lane (the PIT_* constants and pitCentreX() and friends) are in game.js. This
// file draws the pit road, the boxes and the pixel-art crew who work on the car while it is stopped.

const PIT_BOX_LENGTH = 800;   // the painted boxes, in world units
const PIT_BOX_WIDTH = 400;

// ---- The pit road ----
function drawTopPitLane() {
  const count = PIT_OUT_S / SEGMENT_LENGTH;
  const inner = [], outer = [], centre = [];
  for (let i = 0; i <= count; i++) {
    const s = i * SEGMENT_LENGTH, xc = pitCentreX(s), hw = pitHalfWidthX(s);
    inner.push(tdPointAt(s, (xc - hw) * TD_HALF));
    outer.push(tdPointAt(s, (xc + hw) * TD_HALF));
    centre.push(tdPointAt(s, xc * TD_HALF));
  }

  // the road itself, the same asphalt as the track so the entry and exit blend in
  ctx.fillStyle = mixColor('#5E5E62', '#3E4046', weather.wet);
  ctx.beginPath();
  inner.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  for (let i = outer.length - 1; i >= 0; i--) ctx.lineTo(outer[i].x, outer[i].y);
  ctx.closePath();
  ctx.fill();

  // white edge lines where the road is clear of the track, and a dashed line between the two lanes
  let from = -1, to = -1;
  for (let i = 0; i <= count; i++) {
    if (pitWeight(i * SEGMENT_LENGTH) > 0.25) { if (from < 0) from = i; to = i; }
  }
  const stroke = (points, a, b) => {
    ctx.beginPath();
    for (let i = a; i <= b; i++) (i === a ? ctx.moveTo(points[i].x, points[i].y) : ctx.lineTo(points[i].x, points[i].y));
    ctx.stroke();
  };
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 36;
  ctx.lineJoin = 'round';
  stroke(inner, from, to);
  stroke(outer, from, to);
  ctx.setLineDash([240, 240]);
  ctx.lineWidth = 24;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  stroke(centre, from, to);
  ctx.setLineDash([]);

  // the boxes, in the colours of the teams (the player's is in teal)
  ctx.lineWidth = 40;
  PIT_BOX_S.forEach((s, k) => {
    const p = tdPointAt(s, pitBoxX(s) * TD_HALF);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.h);
    ctx.strokeStyle = k === PIT_PLAYER_BOX ? '#00D2BE' : AI_TEAMS[k < PIT_PLAYER_BOX ? k : k - 1].body;
    ctx.strokeRect(-PIT_BOX_LENGTH / 2, -PIT_BOX_WIDTH / 2, PIT_BOX_LENGTH, PIT_BOX_WIDTH);
    ctx.restore();
  });

  // braking boards (3, 2, 1) in the fast lane, then the teal stop line across the whole pit road
  const across = (s, x0, x1, width, colour) => {
    const a = tdPointAt(s, x0 * TD_HALF), b = tdPointAt(s, x1 * TD_HALF);
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };
  const markS = playerBoxS();
  const fast = pitFastX(markS);
  [1200, 800, 400].forEach((back, k) => across(markS - back, fast - 0.3, fast + 0.3, 50 + k * 10, 'rgba(255,255,255,0.8)'));
  across(markS, pitCentreX(markS) - pitHalfWidthX(markS), pitCentreX(markS) + pitHalfWidthX(markS), 60, '#00D2BE');
}

// ---- The crew (pixel art, 10x10, facing up) ----
const crewCache = {};

function crewArt(pose, shirt) {
  const key = pose + shirt;
  if (crewCache[key]) return crewCache[key];
  crewCache[key] = makeArt(10, 10, (put) => {
    const dark = '#222222', glove = '#FFD800';
    if (pose === 'runA') { put(3, 7, dark, 1, 3); put(6, 7, dark, 1, 2); }          // feet
    else if (pose === 'runB') { put(3, 7, dark, 1, 2); put(6, 7, dark, 1, 3); }
    else { put(3, 7, dark, 1, 2); put(6, 7, dark, 1, 2); }
    put(2, 4, shirt, 6, 4);                                                         // shoulders and body
    if (pose === 'runA') { put(1, 2, shirt, 1, 4); put(8, 5, shirt, 1, 4); }        // arms
    else if (pose === 'runB') { put(1, 5, shirt, 1, 4); put(8, 2, shirt, 1, 4); }
    else if (pose === 'work') { put(2, 1, shirt, 1, 4); put(7, 1, shirt, 1, 4); put(2, 1, glove); put(7, 1, glove); }
    else if (pose === 'work2') { put(2, 2, shirt, 1, 3); put(7, 0, shirt, 1, 5); put(2, 2, glove); put(7, 0, glove); }
    else if (pose === 'cheer') { put(0, 2, shirt, 2, 3); put(8, 2, shirt, 2, 3); put(0, 2, glove); put(9, 2, glove); }
    else { put(1, 4, shirt, 1, 4); put(8, 4, shirt, 1, 4); }
    put(3, 3, '#F4F4F4', 4, 4);                                                     // helmet
    put(3, 3, '#101820', 4, 1);                                                     // visor
  });
  return crewCache[key];
}

function lollipopArt(colour) {   // the board the lollipop man holds up: red to stay, green to go
  const key = 'board' + colour;
  if (crewCache[key]) return crewCache[key];
  crewCache[key] = makeArt(10, 10, (put) => {
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const d = Math.hypot(x + 0.5 - 5, y + 0.5 - 5);
        if (d <= 4.8) put(x, y, d > 3.6 ? '#F4F4F4' : colour);
      }
    }
  });
  return crewCache[key];
}

// Have the new tyres gone on yet? (Used to change the tyre colour on the car part way through.)
function pitTyresSwapped() {
  if (raceState !== 'pit' || PIT_MINIGAME) return false;
  if (pitStage === 'done') return true;
  return pitTimer > PIT_CREW_IN + Math.max(0.3, pitDuration - PIT_CREW_IN - PIT_CREW_OUT) * 0.5;
}

// One person, drawn inside the world transform; 1 art pixel is 1 screen pixel. `facing` is the direction they look in.
function drawCrewMember(art, x, y, facing) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing + Math.PI / 2);   // the art faces up
  ctx.scale(1 / tdZoom, 1 / tdZoom);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(art, -art.width / 2, -art.height / 2);
  ctx.restore();
}

// While the car is stopped, four mechanics run out of the garage, change a wheel each, and run back. A
// lollipop man holds a red board in front of the car, then a green one when the car is free to go.
function drawTopCrew() {
  if (PIT_MINIGAME || raceState !== 'pit') return;
  const T = pitDuration, t = pitTimer;
  const fx = Math.cos(tdHeading), fy = Math.sin(tdHeading), rx = -fy, ry = fx;   // forward and right
  const local = (f, r) => ({ x: tdX + fx * f + rx * r, y: tdY + fy * f + ry * r });
  const lerp = (a, b, u) => a + (b - a) * u;
  const garage = 1500;   // how far to the right the garage doors are

  const stations = [
    { f: 230, r: -340 }, { f: 230, r: 340 }, { f: -230, r: -340 }, { f: -230, r: 340 },   // front left, front right, rear left, rear right
  ];

  // q: 0 = at the wheel, 1 = at the garage door. Mechanics on the far side of the car go round the back.
  const route = (st, q) => {
    if (st.r > 0) return local(st.f, lerp(st.r, garage, q));
    if (q < 0.5) return local(lerp(st.f, -900, q / 0.5), lerp(st.r, 0, q / 0.5));
    return local(-900, lerp(0, garage, (q - 0.5) / 0.5));
  };
  // how far from the wheel at time tt
  const away = (tt) => {
    if (tt < PIT_CREW_IN) return 1 - tt / PIT_CREW_IN;
    if (tt > T - PIT_CREW_OUT) return limit((tt - (T - PIT_CREW_OUT)) / PIT_CREW_OUT, 0, 1);
    return 0;
  };

  if (pitStage === 'service') {
    stations.forEach((st) => {
      const q = away(t), p = route(st, q);
      let pose, facing;
      if (q > 0) {   // running: face where they are going
        const ahead = route(st, away(t + 0.04)), behind = route(st, away(t - 0.04));
        facing = Math.atan2(ahead.y - behind.y, ahead.x - behind.x);
        pose = Math.floor(t / 0.08) % 2 ? 'runA' : 'runB';
      } else {       // working: face the car
        facing = tdHeading + (st.r < 0 ? Math.PI / 2 : -Math.PI / 2);
        pose = Math.floor(t / 0.12) % 2 ? 'work' : 'work2';
      }
      drawCrewMember(crewArt(pose, '#00D2BE'), p.x, p.y, facing);
    });
  }

  // the lollipop man stands ahead of the car on the garage side with his board held out in front of it
  const green = pitStage === 'done' || t > T - PIT_CREW_OUT;
  const man = local(950, 380), board = local(950, 150);
  drawCrewMember(crewArt(green ? 'cheer' : 'work', '#FFD800'), man.x, man.y, tdHeading + Math.PI);
  drawCrewMember(lollipopArt(green ? '#30C040' : '#D01010'), board.x, board.y, 0);
}
