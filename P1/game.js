// P1 Racer - milestone 1: pseudo-3D road + basic driving.
// Road projection follows the classic segment technique (OutRun style).

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
// Logical size is 640x480; SCALE multiplies the real pixel count for sharper edges.
// The road is drawn at full resolution; the background, car and HUD are drawn in
// logical coordinates under ctx.scale(SCALE).
const SCALE = 1;
const LW = 640;
const LH = 480;
canvas.width = LW * SCALE;
canvas.height = LH * SCALE;
const WIDTH = canvas.width;
const HEIGHT = canvas.height;

// ---- Settings ----
const STEP = 1 / 60;
const SEGMENT_LENGTH = 200;

const MAX_SPEED = SEGMENT_LENGTH / STEP;
const ACCEL = MAX_SPEED / 5;
const BRAKING = -MAX_SPEED;
const DECEL = -MAX_SPEED / 5;
const OFFROAD_DECEL = -MAX_SPEED / 2;
const OFFROAD_LIMIT = MAX_SPEED / 4;

// ---- Track ----
const segments = [];
let trackLength = 0;

function easeIn(a, b, p) { return a + (b - a) * Math.pow(p, 2); }
function easeInOut(a, b, p) { return a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5); }

// The curve value of every segment of a track: each section eases into its corner, holds it, and eases out.
function trackCurves(track) {
  const curves = [];
  for (const [, enter, hold, leave, curve] of track.sections) {
    for (let n = 0; n < enter; n++) curves.push(easeIn(0, curve, n / enter));
    for (let n = 0; n < hold; n++) curves.push(curve);
    for (let n = 0; n < leave; n++) curves.push(easeInOut(curve, 0, n / leave));
  }
  return curves;
}

// Fill `segments` for a track and place its scenery. loadTrack() below calls this.
function buildTrack(track) {
  trackCurves(track).forEach((curve, index) => segments.push({ index, curve }));
  const ranges = [];
  let start = 0;
  for (const [name, enter, hold, leave, , flags] of track.sections) {
    const end = start + enter + hold + leave;
    ranges.push({ name, start, end, flags: flags || {} });
    if (flags && flags.tunnel) for (let i = start; i < end; i++) segments[i].tunnel = true;
    start = end;
  }
  trackLength = segments.length * SEGMENT_LENGTH;
  buildScenery(ranges, track);
}

// ---- The circuits ----
// Each is in tracks/. These per-track values are set by loadTrack().
let LINE_S = 4000;               // distance along the track of the start/finish line
let LINE_SEG = LINE_S / SEGMENT_LENGTH;
let PIT_LANE_FROM = 1400;        // the entry road has joined the pit lane proper by here
let PIT_LANE_TO = 8800;          // the pit lane starts to rejoin the track here
let PIT_OUT_S = 10200;           // the exit road has rejoined the track here
let PIT_BOX_S = [2600, 3600, 4600, 5600, 6600, 7600];   // centre of each team's box
let PIT_PLAYER_BOX = 2;        // which box is the player's: set per track (pit.playerBox), always towards the middle of the lane so there is room to settle after the entry
function playerBoxS() { return PIT_BOX_S[PIT_PLAYER_BOX]; }
function aiBoxIndex(i) { return i < PIT_PLAYER_BOX ? i : i + 1; }   // the AI cars take the other boxes in order
function aiBoxS(ai) { return PIT_BOX_S[aiBoxIndex(ai.index)]; }
const TRACKS = [TRACK_SILVERSTONE, TRACK_MONACO, TRACK_MONZA, TRACK_SPA, TRACK_SINGAPORE, TRACK_INTERLAGOS];
let currentTrack = TRACKS[0];
let trackIndex = 0;              // the circuit highlighted on the circuit screen

function loadTrack(track) {
  currentTrack = track;
  LINE_S = track.lineS;
  LINE_SEG = LINE_S / SEGMENT_LENGTH;
  PIT_LANE_FROM = track.pit.from;
  PIT_LANE_TO = track.pit.to;
  PIT_OUT_S = track.pit.out;
  PIT_BOX_S = track.pit.boxes;
  if (!Number.isInteger(track.pit.playerBox) || track.pit.playerBox < 0 || track.pit.playerBox >= PIT_BOX_S.length) throw new Error('track ' + track.name + ' needs pit.playerBox to be a box number from 0 to ' + (PIT_BOX_S.length - 1));
  PIT_PLAYER_BOX = track.pit.playerBox;
  segments.length = 0;
  buildTrack(track);
  buildTopTrack(track);
  clearSceneryFromTrack();   // needs the map, so it runs after buildTopTrack
  buildMinimap();
  buildNightLamps();   // only night circuits get lamp posts
}

function findSegment(z) {
  return segments[Math.floor(z / SEGMENT_LENGTH) % segments.length];
}

// ---- Input ----
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  soundUnlock();   // browsers only allow sound after a key press
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'KeyM') { soundToggle(); return; }
  if (paused) { handlePauseKey(e.code); return; }
  if (e.code === 'Escape' && (raceState === 'countdown' || raceState === 'racing' || raceState === 'pit')) { paused = true; pauseChoice = 0; return; }
  if (raceState === 'finished' && (e.code === 'Enter' || e.code === 'Space')) {
    if (session === 'qualifying') startSession('race');   // on to the race tyres, then the lights
    else if (championship) raceState = 'standings';        // championship: the points table
    else resetRace();                                      // a single race is over: back to the first screen
  }
  else if (raceState === 'mode') handleModeKey(e.code);
  else if (raceState === 'standings') handleStandingsKey(e.code);
  else if (raceState === 'champion') handleChampionKey(e.code);
  else if (raceState === 'trophy') handleTrophyKey(e.code);
  else if (raceState === 'track') handleTrackKey(e.code);
  else if (raceState === 'select') handleSelectKey(e.code);
  else if (raceState === 'racing') handleRaceKey(e.code);
  else if (raceState === 'pit') handlePitKey(e.code);
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
// Driver input only counts while racing; after the flag the car brakes to a stop on its own.
const keyLeft = () => raceState === 'racing' && (keys.ArrowLeft || keys.KeyA);
const keyRight = () => raceState === 'racing' && (keys.ArrowRight || keys.KeyD);
const keyGas = () => raceState === 'racing' && (keys.ArrowUp || keys.KeyW);
const keyBrake = () => raceState === 'finished' || raceState === 'pit' || (raceState === 'racing' && (keys.ArrowDown || keys.KeyS));

// ---- State ----
let playerX = 0;    // -1..1 is on the road
let speed = 0;
let wallContact = false;   // touching a solid roadside object this update

// ---- Race state ----
// 'countdown' (lights) -> 'racing' -> 'finished' (results; Enter/Space restarts)
const LAPS = 5;
const QUAL_LAPS = 1;          // qualifying is one timed lap
const COUNTDOWN_SECONDS = 3;
// The start/finish line is 20 segments along the Hamilton Straight, so the grid sits on straight road.
const GRID_GAP = 3200;        // the back of the grid is this far behind the line
const QUAL_RUNUP = 5000;      // qualifying starts this far behind the line, so the timed lap is a flying one

// A weekend is qualifying (one lap alone on the track, to set the grid) and then the race.
let session = 'qualifying';   // 'qualifying' or 'race'
let lineProgress = QUAL_RUNUP;   // distance driven when a car crosses the line to start lap 1
let qualiTime = null;         // the player's qualifying lap
let grid = [];                // qualifying result, fastest first: { who: 'you' or an AI index, name, time }
let playerSlot = 5;           // where the player starts (0 = pole); last unless they qualified
function sessionLaps() { return session === 'qualifying' ? QUAL_LAPS : LAPS; }

// Grid slot k (0 = pole): two columns, the left one half a car ahead of the right. progress is
// distance from the back of the grid, x is the sideways position in playerX units.
function gridSlot(k) {
  const row = Math.floor(k / 2), col = k % 2;
  return { progress: GRID_GAP - 450 - row * 1000 - (col ? 450 : 0), x: col === 0 ? -0.5 : 0.5 };
}
let raceState = 'countdown';
let countdownT = COUNTDOWN_SECONDS;
let goFlashT = 0;
let crossings = 0;      // line crossings: #1 starts lap 1, #(LAPS+1) is the flag
let raceTime = 0;       // seconds since lights out
let lapTime = 0;        // seconds in the current lap (counted from the first line crossing)
let lapTimes = [];
let bestLap = null;
let playerProgress = 0; // distance driven since the grid; used to rank cars
let finalPlace = 0;     // player's place, fixed when they take the flag

// ---- Championship ----
// One round on each circuit (six now) in the order of TRACKS, against the same five teams. Everyone scores
// points for where they finish; the most points after the last round wins the title.
const CHAMP_POINTS = [25, 18, 15, 12, 10, 8];    // for 1st to 6th
let championship = null;       // null for a single race, otherwise { round, points, last }
                               //   points: [you, AI 0, AI 1, ...]; last: the latest race result, for the standings screen
let modeIndex = 0;             // on the first screen: 0 = single race, 1 = championship

// ---- Difficulty ----
// Picked on the first screen (up and down). aiPace scales the rivals' speed. The pit help steps down as it gets harder:
//   limiter     the pit limiter takes the car to 80 km/h as soon as it drives onto the pit road, and the brakes are
//               gentler there. Without it the 80 limit is only a soft slowing once you are in the lane.
//   laneAssist  the car steers itself down the pit lane
//   tierScale   how generous the PERFECT / GOOD / OK stop ratings are (above 1 is more forgiving)
const DIFFICULTIES = [
  { name: 'EASY',   aiPace: 0.92, limiter: true,  laneAssist: true,  tierScale: 1.5, text: 'Slower rivals, full pit help and generous stop ratings.' },
  { name: 'NORMAL', aiPace: 1.0,  limiter: true,  laneAssist: true,  tierScale: 1,   text: 'Rivals at full pace. Pit limiter and lane assist on.' },
  { name: 'HARD',   aiPace: 1.08, limiter: true,  laneAssist: false, tierScale: 1,   text: 'Quicker rivals. The limiter helps, but you steer the pit lane.' },
  { name: 'EXPERT', aiPace: 1.15, limiter: false, laneAssist: false, tierScale: 0.8, text: 'The quickest rivals and no pit help at all.' },
];
let difficultyIndex = 1;       // saved (see save.js), so it is the same next time the game opens
if (saveData.difficulty < DIFFICULTIES.length) difficultyIndex = saveData.difficulty;
else console.warn('Saved difficulty ' + saveData.difficulty + ' does not exist (there are ' + DIFFICULTIES.length + '), using NORMAL');
function difficulty() { return DIFFICULTIES[difficultyIndex]; }
function saveDifficulty() { saveData.difficulty = difficultyIndex; writeSave(); }
let finishCounter = 0;         // counts cars across the flag, so the finishing order is known
let playerFinishSeq = 0;

// ---- The start ----
// You can rev the engine while the lights count down (the car is held). The gas must go down as the
// lights go out: held down early, you get wheelspin for a moment, in proportion to how early.
// Gas down late is just a slower reaction, which is timed and shown.
const LAUNCH_EARLY_OK = 0.15;     // gas down this soon before GO counts as on the lights
const LAUNCH_GREAT = 0.25;        // a reaction at least this quick (seconds after GO) is a great start
const LAUNCH_SPIN_LOSS = 0.5;     // wheelspin takes up to this share off the acceleration...
const LAUNCH_SPIN_TIME = 1.4;     // ...fading away over this many seconds
let launchGasAt = null;           // during the countdown: seconds left when the gas went down (null = not on the gas)
let launchRev = 0;                // engine revs while holding the gas on the grid (0 to 0.2)
let launchSpin = 0;               // wheelspin from a jumped start, 0 to 1, fading
let launchWait = false;           // the lights are out and the gas is not down yet
let launchT = 0;                  // seconds since GO while waiting for the gas
let launchMsg = '', launchMsgT = 0, launchMsgColour = '#FFFFFF';
function rawGas() { return !!(keys.ArrowUp || keys.KeyW); }   // the gas key itself, whatever the state

// The countdown, GO!, and the start and pit-stop messages are drawn with their baseline at this height: high
// up, so they stay clear of the car, which is always at the middle of the screen (about y=240), and the road round it.
const START_MSG_Y = 112;

function launchSay(text, colour) { launchMsg = text; launchMsgColour = colour; launchMsgT = 2.5; }

// The lights have gone out. Was the gas already down?
function launchAtGo() {
  launchSpin = 0;
  launchWait = !rawGas();
  launchT = 0;
  if (launchWait) return;   // reaction is timed when the gas goes down
  const early = launchGasAt === null ? 0 : launchGasAt;
  if (early > LAUNCH_EARLY_OK) {
    launchSpin = limit(early / 1.2, 0.3, 1);
    launchSay('TOO EAGER - WHEELSPIN!', '#F0A040');
    radio('Wheelspin! Wait for the lights.');
  } else {
    launchSay('PERFECT LAUNCH!', '#30E050');
    radio('Perfect launch!');
  }
}

// After GO, with the gas not yet down: time the reaction.
function launchWatch(dt) {
  launchT += dt;
  if (rawGas()) {
    launchWait = false;
    if (launchT <= LAUNCH_GREAT) { launchSay('GREAT START! ' + launchT.toFixed(2) + ' s', '#30E050'); radio('Great start!'); }
    else launchSay('REACTION ' + launchT.toFixed(2) + ' s', '#FFFFFF');
  } else if (launchT > 3) {
    launchWait = false;
  }
}

// ---- Tyres ----
// speed: top speed as a fraction of MAX_SPEED when fresh. grip: traction and cornering (1 = baseline).
// life: seconds of flat-out straight-line driving to wear the tyre out (corners wear it faster).
// wetSpeedLoss / wetGripLoss: fraction of speed / grip lost in full rain (scaled by how wet it is).
//   Negative means the compound gains in the rain: that is what the wet tyre is for.
// wetSlip / drySlip: how much the car slides in full rain / on a dry track (0 = planted, 1 = skating).
// dryWearBoost: extra wear on a dry track (the wet tyre overheats and wears 2.5x as fast).
// rating: pips shown on the selection screen as [speed, grip, life, wet].
const COMPOUNDS = {
  soft: { name: 'SOFT', color: '#E02020', speed: 1.00, grip: 1.20, life: 40,  rating: [3, 3, 1, 1],
          wetSpeedLoss: 0.20, wetGripLoss: 0.55, wetSlip: 1.00, drySlip: 0,    dryWearBoost: 0 },
  hard: { name: 'HARD', color: '#F4F4F4', speed: 0.95, grip: 0.90, life: 100, rating: [2, 2, 3, 2],
          wetSpeedLoss: 0.08, wetGripLoss: 0.30, wetSlip: 0.50, drySlip: 0,    dryWearBoost: 0 },
  wet:  { name: 'WET',  color: '#2A7FE0', speed: 0.86, grip: 0.80, life: 60,  rating: [1, 1, 2, 3],
          wetSpeedLoss: -0.12, wetGripLoss: -0.45, wetSlip: 0.05, drySlip: 0.35, dryWearBoost: 1.5 },
};
const COMPOUND_ORDER = ['soft', 'hard', 'wet'];
let chosenCompound = 'soft';            // kept between races
let tyre = COMPOUNDS[chosenCompound];
let tyreWear = 0;                       // 0 = fresh, 1 = finished

// Worn tyres lose speed and grip, slowly at first and then quickly (wear squared).
// slip (0..1) is how much the car slides: mostly from wet weather on a slippery compound, a little from wear.
function tyreCondition() {
  const w = tyreWear * tyreWear;
  const wet = weather.wet;
  return {
    speed: tyre.speed * (1 - 0.18 * w) * (1 - wet * tyre.wetSpeedLoss),
    grip: tyre.grip * (1 - 0.35 * w) * (1 - wet * tyre.wetGripLoss),
    slip: Math.min(1, (1 - wet) * tyre.drySlip + wet * tyre.wetSlip + tyreWear * 0.15),
  };
}

// ---- Weather ----
// A forecast is picked at random for each race and shown on the grid screen so you can plan tyres.
// start: how wet it is at the lights (0 dry, 0.5 light rain, 1 heavy rain).
// change: at the start of lap `crossing` the weather moves towards `wet` over about 12 seconds.
const FORECASTS = [
  { label: 'DRY',                         start: 0 },
  { label: 'LIGHT RAIN',                  start: 0.5 },
  { label: 'HEAVY RAIN',                  start: 1 },
  { label: 'DRY, HEAVY RAIN FROM LAP 3',  start: 0, change: { crossing: 3, wet: 1 } },
  { label: 'DRY, LIGHT RAIN FROM LAP 4',  start: 0, change: { crossing: 4, wet: 0.5 } },
  { label: 'HEAVY RAIN, DRY FROM LAP 3',  start: 1, change: { crossing: 3, wet: 0 } },
];
const WEATHER_RATE = 0.08;     // how fast the track gets wetter or drier (per second)
const AI_WET_PENALTY = 0.08;   // AI cars lose this fraction of pace in full rain, on top of their tyres
let forecast = FORECASTS[0];
let weather = { wet: 0 };      // current conditions; wet moves towards weatherTarget
let weatherTarget = 0;

function weatherName(wet) { return wet >= 0.75 ? 'HEAVY RAIN' : wet >= 0.25 ? 'LIGHT RAIN' : 'DRY'; }
function weatherColor(wet) { return wet >= 0.75 ? '#6FA8FF' : wet >= 0.25 ? '#9FD0FF' : '#FFD800'; }

function setForecast(f) {
  forecast = f;
  weather = { wet: f.start };
  weatherTarget = f.start;
}

function updateWeather(dt) {
  weather.wet += limit(weatherTarget - weather.wet, -WEATHER_RATE * dt, WEATHER_RATE * dt);
}
const rain = Array.from({ length: 160 }, () => ({ x: Math.random() * LW, y: Math.random() * LH, v: 500 + Math.random() * 300 }));

function updateRain(dt) {
  for (const d of rain) {
    d.y += d.v * dt;
    d.x -= 120 * dt;
    if (d.y > LH) { d.y = -12; d.x = Math.random() * (LW + 100); }
    if (d.x < -10) d.x += LW + 100;
  }
}

function mixColor(a, b, t) {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return 'rgb(' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',') + ')';
}

// First screen: left/right picks single race or championship, up/down picks the difficulty, Enter starts.
function handleModeKey(code) {
  if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(code)) modeIndex = 1 - modeIndex;
  else if (code === 'ArrowUp' || code === 'KeyW') { difficultyIndex = (difficultyIndex + DIFFICULTIES.length - 1) % DIFFICULTIES.length; saveDifficulty(); }
  else if (code === 'ArrowDown' || code === 'KeyS') { difficultyIndex = (difficultyIndex + 1) % DIFFICULTIES.length; saveDifficulty(); }
  else if (code === 'Enter' || code === 'Space') {
    if (modeIndex === 0) raceState = 'track';   // then choose the circuit
    else startChampionship();
  }
}

// The points table between rounds: Enter for the next race (or the final result), Escape to give up.
function handleStandingsKey(code) {
  if (code === 'Enter' || code === 'Space') {
    if (championship.round + 1 < TRACKS.length) { championship.round++; beginRound(); }
    else {
      const place = championshipTable().findIndex(t => t.who === 0);   // 0 = champion
      if (place <= 2) { raceState = 'trophy'; trophyPlace = place; trophyT = 0; soundFanfare(place); }   // a trophy for the top three
      else { raceState = 'champion'; soundFinish(); }
    }
  } else if (code === 'Escape') resetRace();
}

// The trophy screen after the last round, when you finish first, second or third. Enter goes on to the final table.
let trophyPlace = 0;   // 0 gold, 1 silver, 2 bronze
let trophyT = 0;       // seconds on the trophy screen
function handleTrophyKey(code) {
  if (code === 'Enter' || code === 'Space' || code === 'Escape') raceState = 'champion';
}

function handleChampionKey(code) {
  if (code === 'Enter' || code === 'Space' || code === 'Escape') resetRace();
}

// Circuit screen: left/right picks a circuit, Enter confirms and goes on to qualifying there.
function handleTrackKey(code) {
  if (code === 'ArrowLeft' || code === 'KeyA') trackIndex = (trackIndex + TRACKS.length - 1) % TRACKS.length;
  else if (code === 'ArrowRight' || code === 'KeyD') trackIndex = (trackIndex + 1) % TRACKS.length;
  else if (code === 'Escape') raceState = 'mode';
  else if (code === 'Enter' || code === 'Space') {
    if (TRACKS[trackIndex] !== currentTrack) loadTrack(TRACKS[trackIndex]);
    rollForecast();   // now the circuit is known, so its weather applies
    startSession('qualifying');   // put the car and the grid on this circuit, then the tyre screen
  }
}

// Grid screen: left/right picks a compound, Enter/Space starts the lights.
function handleSelectKey(code) {
  let i = COMPOUND_ORDER.indexOf(chosenCompound);
  if (code === 'ArrowLeft' || code === 'KeyA') i = (i + COMPOUND_ORDER.length - 1) % COMPOUND_ORDER.length;
  else if (code === 'ArrowRight' || code === 'KeyD') i = (i + 1) % COMPOUND_ORDER.length;
  else if (code === 'Enter' || code === 'Space') {
    if (session === 'qualifying') for (const ai of ais) ai.qualiTime = aiQualifyingTime(ai);
    raceState = 'countdown';
    return;
  }
  chosenCompound = COMPOUND_ORDER[i];
  tyre = COMPOUNDS[chosenCompound];
  pitTyreChoice = chosenCompound;   // the tyres waiting in the pit start as the ones you chose
}

// ---- Pit lane and pit stops ----
// The pit lane runs beside the Hamilton Straight. Drive in at the entry (just after the last corner): the
// car is held to an 80 km/h limit (no penalty), and braking to a stop with the middle of the car on the
// teal mark in your box starts the stop. The closer you stop to the mark, the faster the crew work.
// 1 / 2 / 3 pick which tyres are waiting for you (soft / hard / wet; 1 is the default).
//
// PIT_MINIGAME = true swaps the stopping-distance stop for the earlier four-wheel timing game (press
// Space with the marker in the green on each wheel). That code is all still here.
const PIT_MINIGAME = false;
const PIT_IN_S = 0;               // distance along the track where the entry road leaves the track (always 0: the seam)
const PIT_LIMIT = MAX_SPEED * 0.25;   // 80 km/h
const PIT_ZONE = 500;             // the stop takes its longest time at this distance from the mark...
const PIT_REACH = 1800;           // ...and the crew will still come to you anywhere within this distance of it
const PIT_STOP_BEST = 2.0;        // seconds for a perfect stop...
const PIT_STOP_WORST = 4.5;       // ...up to this for one at the edge of the zone
const PIT_CREW_IN = 0.45;         // seconds for the crew to run out, and to run back
const PIT_CREW_OUT = 0.5;
const PIT_TIERS = [               // how close to the mark (world units) earns each rating
  { label: 'PERFECT', within: 100, colour: '#30E050', sound: 'perfect' },
  { label: 'GOOD', within: 250, colour: '#E8C800', sound: 'good' },
  { label: 'OK', within: 450, colour: '#F0A040', sound: 'good' },
  { label: 'LONG', within: Infinity, colour: '#E03030', sound: 'slow' },
];

// Where the pit road lies across the track, in playerX units (1 = the track edge). weight is 0 on the
// track and 1 in the pit lane proper, easing in along the entry road and out along the exit road.
// The road has a fast lane on the track side and a row of boxes on the garage side.
function pitWeight(s) {
  if (s < PIT_IN_S || s > PIT_OUT_S) return 0;
  const up = limit((s - PIT_IN_S) / (PIT_LANE_FROM - PIT_IN_S), 0, 1);
  const down = limit((PIT_OUT_S - s) / (PIT_OUT_S - PIT_LANE_TO), 0, 1);
  const w = Math.min(up, down);
  return w * w * (3 - 2 * w);
}
function pitCentreX(s) { return 0.9 + 1.24 * pitWeight(s); }
function pitHalfWidthX(s) { return 0.45 + 0.15 * pitWeight(s); }
function pitFastX(s) { return pitCentreX(s) - 0.33 * pitWeight(s); }
function pitBoxX(s) { return pitCentreX(s) + 0.33 * pitWeight(s); }
function inPitLane(s, x) { return pitWeight(s) >= 0.5 && Math.abs(x - pitCentreX(s)) < pitHalfWidthX(s) + 0.1; }

const PIT_MARKER_RATE = 5;      // minigame: how fast the timing marker swings (radians per second)
const PIT_WHEELS = ['FRONT LEFT', 'FRONT RIGHT', 'REAR LEFT', 'REAR RIGHT'];
const PIT_RESULTS = {           // minigame: wait is seconds before the crew start the next wheel
  perfect: { label: 'PERFECT', wait: 0.3,  color: '#30E050' },
  good:    { label: 'GOOD',    wait: 0.65, color: '#E8C800' },
  slow:    { label: 'SLOW',    wait: 1.2,  color: '#E03030' },
};
let pitTyreChoice = 'soft';     // the tyres waiting in the box (1 / 2 / 3). They start as the tyres you are on, and after a stop as what you just fitted
let pitTyreKey = null;          // compound being fitted during a stop
let pitStops = 0;
let pitStage = 'service';       // 'service' -> 'done' (the minigame used to start at 'braking')
let pitResults = [];
let pitMarkerT = 0;
let pitWaitT = 0;
let pitTimer = 0;               // seconds stationary in the box
let pitDoneT = 0;
let lastPitTime = 0;
let pitDuration = 0;            // how long the crew need, set by how close to the mark you stopped
let pitError = 0;               // how far from the mark the car stopped (world units)
let pitTier = PIT_TIERS[0];
let pitGuns = [false, false, false, false];
let pitLatch = false;           // set once a stop has started, until the car leaves the pit lane

// The pit radio: a short message across the top of the screen.
let radioText = '';
let radioT = 0;
const radioFlags = { wear: false, rain: false, dry: false };
function radio(text) { radioText = text; radioT = 3.5; }

// Hints from the pit wall, said once each time the situation arises.
function radioHints() {
  if (session !== 'race' || raceState !== 'racing') return;
  if (tyreWear > 0.65 && !radioFlags.wear) { radioFlags.wear = true; radio('Tyres are fading. Think about a stop.'); }
  const raining = weather.wet > 0.4, onWets = tyre === COMPOUNDS.wet;
  if (raining && !onWets && !radioFlags.rain) { radioFlags.rain = true; radio('It is raining! Wets would be quicker.'); }
  if (!raining) radioFlags.rain = false;
  if (weather.wet < 0.25 && onWets && !radioFlags.dry) { radioFlags.dry = true; radio('Track is drying. Slicks are quicker.'); }
  if (weather.wet >= 0.25) radioFlags.dry = false;
}

// 1 / 2 / 3 choose the tyres waiting in the pit box.
function handleRaceKey(code) {
  const digit = { Digit1: 0, Digit2: 1, Digit3: 2 }[code];
  if (session === 'qualifying' || digit === undefined) return;
  pitTyreChoice = COMPOUND_ORDER[digit];
}

// The car has stopped in the pit lane near its box.
function startPitStop() {
  raceState = 'pit';
  pitStage = 'service';
  pitTyreKey = pitTyreChoice;
  pitResults = [];
  pitTimer = 0;
  pitMarkerT = 0;
  if (PIT_MINIGAME) { pitWaitT = 0.5; return; }
  pitWaitT = 0;
  pitGuns = [false, false, false, false];
  pitError = Math.abs(tdS - playerBoxS());
  pitTier = PIT_TIERS.find(t => pitError <= t.within * difficulty().tierScale);   // a more forgiving difficulty widens the ratings
  pitDuration = PIT_STOP_BEST + (PIT_STOP_WORST - PIT_STOP_BEST) * limit(pitError / PIT_ZONE, 0, 1);
  soundPit(pitTier.sound);
  const says = { PERFECT: 'Perfect stop! Crew need ', GOOD: 'Good stop. Crew need ', OK: 'Bit off the mark. Crew need ', LONG: 'Long way off. Crew need ' };
  radio(says[pitTier.label] + pitDuration.toFixed(1) + ' s.');
}

function pitMarker() { return 0.5 + 0.5 * Math.sin(pitMarkerT * PIT_MARKER_RATE - Math.PI / 2); }

function handlePitKey(code) {
  if (code !== 'Space' && code !== 'Enter') return;
  if (pitStage !== 'service' || pitWaitT > 0) return;
  const off = Math.abs(pitMarker() - 0.5);
  const result = off < 0.06 ? 'perfect' : off < 0.18 ? 'good' : 'slow';
  pitResults.push(result);
  soundPit(result);
  pitWaitT = PIT_RESULTS[result].wait;
}

function finishPitStop() {
  tyre = COMPOUNDS[pitTyreKey];
  tyreWear = 0;
  pitTyreChoice = pitTyreKey;   // next time the waiting tyres are the ones you now have on
  radioFlags.wear = false;
  lastPitTime = pitTimer;
  pitStops++;
  pitStage = 'done';
  soundPitDone();
  pitDoneT = 0.4;
  radio('Go, go, go! Fresh ' + tyre.name + ' tyres.');
}

// The stopping-distance stop: the crew work for pitDuration seconds, then you are released.
function updatePitByStop(dt) {
  if (pitStage === 'service') {
    pitTimer += dt;
    const workLength = Math.max(0.3, pitDuration - PIT_CREW_IN - PIT_CREW_OUT);
    for (let k = 0; k < 4; k++) {   // an air gun whirrs as each wheel comes off
      if (!pitGuns[k] && pitTimer >= PIT_CREW_IN + workLength * (0.2 + 0.2 * k)) { pitGuns[k] = true; soundGun(); }
    }
    if (pitTimer >= pitDuration) finishPitStop();
  } else {
    pitDoneT -= dt;
    if (pitDoneT <= 0) { raceState = 'racing'; goFlashT = 1; }
  }
}

function updatePit(dt) {
  if (!PIT_MINIGAME) { updatePitByStop(dt); return; }
  if (pitStage === 'braking') {
    if (speed < 1) { pitStage = 'service'; pitTimer = 0; pitMarkerT = 0; pitWaitT = 0.5; }
  } else if (pitStage === 'service') {
    pitTimer += dt;
    if (pitWaitT > 0) {
      pitWaitT -= dt;
      if (pitWaitT <= 0) {
        if (pitResults.length === PIT_WHEELS.length) finishPitStop();
        else pitMarkerT = 0;
      }
    } else {
      pitMarkerT += dt;
    }
  } else {
    pitDoneT -= dt;
    if (pitDoneT <= 0) { raceState = 'racing'; goFlashT = 1; }
  }
}

// ---- AI cars (fictional teams) ----
const AI_TEAMS = [
  { name: 'Apex',    body: '#D01010', pod: '#A80C0C', wing: '#F4F4F4', end: '#7A0808', helmet: '#FFFFFF' },
  { name: 'Vortex',  body: '#2060D0', pod: '#1848A0', wing: '#F4F4F4', end: '#F08020', helmet: '#F08020' },
  { name: 'Solaris', body: '#F08020', pod: '#C06010', wing: '#1E1E1E', end: '#1E1E1E', helmet: '#1E1E1E' },
  { name: 'Nimbus',  body: '#7A3FC0', pod: '#5E2E96', wing: '#F4F4F4', end: '#FFD800', helmet: '#FFD800' },
  { name: 'Verdant', body: '#2E9E3E', pod: '#217A2F', wing: '#F4F4F4', end: '#145A20', helmet: '#FFFFFF' },
];
const AI_PACE_MIN = 0.82;   // slowest AI cruise speed as a fraction of MAX_SPEED
const AI_PACE_MAX = 0.92;   // fastest AI cruise speed
const AI_LOOKAHEAD = 700;   // AI looks this far ahead for traffic
let ais = [];
let gridZ = 0;              // track z where the player starts
let finishProgress = 0;     // progress at which a car takes the flag

// A new weekend: a new forecast and new AI cars. (Qualifying is set up by startSession.)
// Pick the weekend's forecast. A circuit with style.rain above 1 favours a wet start (and a dry one less); with
// no rain setting every forecast is equally likely.
function rollForecast() {
  const rain = currentTrack.style.rain || 1;
  const weights = FORECASTS.map(f => (f.start > 0 ? rain : f.change ? 1 : 1 / rain));
  let pick = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < FORECASTS.length; i++) {
    pick -= weights[i];
    if (pick < 0) { setForecast(FORECASTS[i]); return; }
  }
  setForecast(FORECASTS[FORECASTS.length - 1]);   // only reached by rounding at the very end of the range
}

function newWeekend() {
  rollForecast();
  qualiTime = null;
  grid = [];
  playerSlot = AI_TEAMS.length;   // last, unless qualifying moves them up
  ais = AI_TEAMS.map((team, i) => {
    const pace = AI_PACE_MAX - (AI_PACE_MAX - AI_PACE_MIN) * (i / (AI_TEAMS.length - 1));
    return {
      team, index: i, slot: i,
      cruise: MAX_SPEED * (pace + (Math.random() - 0.5) * 0.02),
      pitBias: (Math.random() - 0.5) * 0.2,   // some cars pit earlier than others
      qualiJitter: (Math.random() - 0.5) * 0.8,
    };
  });
}

// Back to the first screen: choose a single race or the championship.
// ---- Pause ----
// Escape during the countdown, qualifying, the race or a pit stop freezes everything and asks whether to carry on
// or quit to the first screen (which gives up the race, or the whole championship).
let paused = false;
let pauseChoice = 0;           // 0 = resume, 1 = quit to menu

function handlePauseKey(code) {
  if (code === 'ArrowUp' || code === 'KeyW' || code === 'ArrowDown' || code === 'KeyS') pauseChoice = 1 - pauseChoice;
  else if (code === 'Escape') paused = false;
  else if (code === 'Enter' || code === 'Space') {
    paused = false;
    if (pauseChoice === 1) resetRace();
  }
}

function drawPauseMenu() {
  ctx.save();
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, LW, LH);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFD800';
  ctx.font = 'bold 34px monospace';
  ctx.fillText('PAUSED', LW / 2, 170);
  ['RESUME', 'QUIT TO MENU'].forEach((label, i) => {
    const y = 206 + i * 44, selected = i === pauseChoice;
    ctx.fillStyle = selected ? 'rgba(0,210,190,0.3)' : 'rgba(255,255,255,0.08)';
    ctx.fillRect(LW / 2 - 130, y, 260, 34);
    if (selected) { ctx.strokeStyle = '#00D2BE'; ctx.lineWidth = 2; ctx.strokeRect(LW / 2 - 130, y, 260, 34); }
    ctx.fillStyle = selected ? '#FFFFFF' : '#999999';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(label, LW / 2, y + 23);
  });
  ctx.fillStyle = '#CCCCCC';
  ctx.font = '12px monospace';
  if (pauseChoice === 1) ctx.fillText(championship ? 'This gives up the championship.' : 'This gives up the race.', LW / 2, 312);
  ctx.fillText('Up/Down: choose     Enter: select     Esc: resume', LW / 2, 340);
  ctx.restore();
}

function resetRace() {
  paused = false;
  newWeekend();
  startSession('qualifying');
  raceState = 'mode';
  championship = null;
}

function startChampionship() {
  championship = { round: 0, points: new Array(AI_TEAMS.length + 1).fill(0), last: null };
  beginRound();
}

// Load the circuit for the current round and go to the tyre screen for qualifying.
function beginRound() {
  if (TRACKS[championship.round] !== currentTrack) loadTrack(TRACKS[championship.round]);
  newWeekend();
  startSession('qualifying');
}

// The race is over: run the AI cars on to the flag without drawing them, so everyone's position is final.
function completeField() {
  for (let steps = 0; steps < 30 * 300 && !ais.every(a => a.finished); steps++) updateAI(1 / 30);
  const stuck = ais.filter(a => !a.finished);
  if (stuck.length) console.warn('championship: ' + stuck.length + ' AI cars had not finished after the field was run on (' + stuck.map(a => a.team.name + ' at ' + Math.round(a.progress)).join(', ') + '). Ranking them by distance covered.');
}

function finishChampionshipRound() {
  completeField();
  const entries = [{ who: 0, name: 'YOU', seq: playerFinishSeq }];
  for (const ai of ais) entries.push({ who: ai.index + 1, name: ai.team.name.toUpperCase(), seq: ai.finished ? ai.finishSeq : 1e9 - ai.progress });
  entries.sort((a, b) => a.seq - b.seq);
  entries.forEach((e, k) => { e.pts = CHAMP_POINTS[k] || 0; championship.points[e.who] += e.pts; });
  championship.last = entries;
}

// How fast the AI cars go in the overhead view, which depends a little on the circuit.
function aiPace() { return TD_AI_PACE * currentTrack.style.aiPace * difficulty().aiPace; }

// How fast an AI car would go round on its own: the time to cover every segment at its pace, on
// soft tyres (wets if it is raining), plus a little for getting up to speed.
function aiQualifyingTime(ai) {
  const t = COMPOUNDS[forecast.start >= 0.4 ? 'wet' : 'soft'];
  const tyreSpeed = t.speed * (1 - forecast.start * t.wetSpeedLoss);
  let seconds = 0;
  for (const seg of segments) {
    const corner = 1 - Math.min(0.35, Math.abs(seg.curve) * 0.06);
    seconds += SEGMENT_LENGTH / (ai.cruise * corner * (1 - AI_WET_PENALTY * forecast.start) * tyreSpeed * aiPace());
  }
  return seconds + 0.8 + ai.qualiJitter;
}

// Puts everything back on the line for a session and shows the tyre screen.
function startSession(kind) {
  session = kind;
  raceState = 'select';
  tyre = COMPOUNDS[chosenCompound];
  tyreWear = 0;
  setForecast(forecast);   // back to the weather at the start of the forecast
  pitTyreChoice = chosenCompound;   // what is fitted for this session (the tyre screen can change both)
  pitLatch = false;
  radioText = '';
  radioT = 0;
  radioFlags.wear = radioFlags.rain = radioFlags.dry = false;
  pitStops = 0;
  lastPitTime = 0;
  countdownT = COUNTDOWN_SECONDS;
  goFlashT = 0;
  crossings = 0;
  raceTime = 0;
  lapTime = 0;
  lapTimes = [];
  bestLap = null;
  finalPlace = 0;
  finishCounter = 0;
  playerFinishSeq = 0;
  launchGasAt = null;
  launchRev = 0;
  launchSpin = 0;
  launchWait = false;
  launchMsgT = 0;
  speed = 0;

  let start;   // where the player begins: progress and sideways position
  if (kind === 'qualifying') {
    lineProgress = QUAL_RUNUP;
    start = { progress: 0, x: 0 };
  } else {
    lineProgress = GRID_GAP;
    start = gridSlot(playerSlot);
  }
  gridZ = LINE_S - lineProgress;
  finishProgress = lineProgress + sessionLaps() * trackLength;
  playerProgress = start.progress;
  playerX = start.x;

  for (const ai of ais) {   // the AI cars only appear in the race
    const slot = gridSlot(ai.slot);
    ai.homeX = slot.x;
    ai.x = slot.x;
    ai.progress = slot.progress;
    ai.speed = 0;
    ai.finished = false;
    ai.wear = 0;
    ai.crossings = 0;
    ai.pit = null;
    ai.pitStops = 0;
    ai.z = wrap(gridZ + ai.progress, trackLength);
    ai.seg = findSegment(ai.z);
  }
  assignAiTyres();
  tdReset(start.progress, start.x);
}

// Qualifying lap done: set the grid from everyone's times.
function finishQualifying() {
  qualiTime = lapTimes[0];
  grid = [{ who: 'you', name: 'YOU', time: qualiTime }];
  for (const ai of ais) grid.push({ who: ai.index, name: ai.team.name.toUpperCase(), time: ai.qualiTime });
  grid.sort((a, b) => a.time - b.time);
  grid.forEach((g, k) => {
    if (g.who === 'you') playerSlot = k;
    else ais[g.who].slot = k;
  });
}

function currentPlace() {
  let place = 1;
  for (const ai of ais) if (ai.progress > playerProgress) place++;
  return place;
}

// AI tyre choice: wets if rain is forecast, otherwise soft and hard split across the field
// (and softs for a short final run).
function aiPickTyre(ai) {
  if (weatherTarget >= 0.4) return 'wet';
  if (ai.crossings < 2) return ai.index % 2 === 0 ? 'soft' : 'hard';
  return LAPS - ai.crossings + 1 <= 2 ? 'soft' : 'hard';
}

function assignAiTyres() {
  for (const ai of ais) { ai.tyreKey = aiPickTyre(ai); ai.wear = 0; }
}

function aiTyreSpeed(ai) {
  const t = COMPOUNDS[ai.tyreKey];
  const w = ai.wear * ai.wear;
  return t.speed * (1 - 0.18 * w) * (1 - weather.wet * t.wetSpeedLoss);
}

// As an AI car passes the pit entry (distance 0): come in if the tyres are worn out or wrong for the weather.
function aiPitDecision(ai) {
  if (ai.crossings < 1 || ai.crossings >= LAPS || ai.pit || ai.pitStops >= 3) return;
  const wrongTyre = ai.tyreKey === 'wet' ? weatherTarget < 0.3 : weatherTarget > 0.6;
  const worn = ai.crossings <= LAPS - 2 && ai.wear > 0.55 + ai.pitBias;   // not worth it with one lap to go
  if (wrongTyre || worn) ai.pit = { phase: 'in', t: 0, duration: 2.4 + Math.random() * 2.2 };
}

function updateAI(dt) {
  if (session === 'qualifying') return;   // the AI cars are not on the track
  const player = { progress: playerProgress, x: playerX, speed };
  const live = raceState === 'racing' || raceState === 'pit' || raceState === 'finished';
  for (const ai of ais) {
    const t = COMPOUNDS[ai.tyreKey];
    let target = 0;
    if (live && !ai.finished) {
      target = ai.cruise * (1 - Math.min(0.35, Math.abs(ai.seg.curve) * 0.06));   // lift in corners
      target *= (1 - AI_WET_PENALTY * weather.wet) * aiTyreSpeed(ai) * aiPace();
      const cornering = 1 + 0.5 * Math.min(1, Math.abs(ai.seg.curve) / 5);
      const overheating = 1 + t.dryWearBoost * (1 - weather.wet);
      ai.wear = Math.min(1, ai.wear + (dt / t.life) * (0.4 + 0.6 * ai.speed / MAX_SPEED) * cornering * overheating);
    }

    const laneClear = 0.5;   // sideways room an AI car wants round others (playerX units)
    let laneTarget = ai.homeX;
    let laneRate = 0.6;      // how fast it can change lane (playerX units per second)
    if (ai.pit) {
      // Through the pit lane: into the fast lane at 80 km/h, brake to a stop on its own box (in the
      // row on the garage side), wait out the stop, fit fresh tyres, then back down the fast lane and out.
      const s = ai.z, boxS = aiBoxS(ai);   // the player has the middle box
      laneRate = 2.5;                                    // swerving into the lane is quick
      if (pitWeight(s) >= 0.3) target = Math.min(target, PIT_LIMIT);
      if (ai.pit.phase === 'in') {
        laneTarget = pitFastX(s);
        if (s > boxS - 700) ai.pit.phase = 'box';
      }
      if (ai.pit.phase === 'box') {
        laneTarget = pitBoxX(s);
        const left = Math.max(0, boxS - s);
        target = Math.min(target, Math.sqrt(2 * 5000 * left));   // brake to stop on the box
        if (left < 60 && ai.speed < 80) { ai.pit.phase = 'service'; ai.pit.t = 0; }
      } else if (ai.pit.phase === 'service') {
        laneTarget = pitBoxX(s);
        target = 0;
        ai.pit.t += dt;
        if (ai.pit.t >= ai.pit.duration) {
          ai.tyreKey = aiPickTyre(ai);
          ai.wear = 0;
          ai.pitStops++;
          ai.pit.phase = 'out';
        }
      } else if (ai.pit.phase === 'out') {
        laneTarget = pitFastX(s);
        if (s >= PIT_OUT_S) ai.pit = null;   // back on the track
      }
    } else {
      // Find the nearest car ahead in (or near) our lane and sidestep it; match its speed if still stuck behind.
      let ahead = null;
      for (const o of [player, ...ais]) {
        if (o === ai) continue;
        const gap = o.progress - ai.progress;
        if (gap > 0 && gap < AI_LOOKAHEAD && Math.abs(o.x - ai.x) < laneClear && (!ahead || gap < ahead.progress - ai.progress)) ahead = o;
      }
      if (ahead) {
        laneTarget = limit(ai.x + (ai.x >= ahead.x ? 0.5 : -0.5), -0.8, 0.8);
        if (ahead.progress - ai.progress < 250 && Math.abs(ahead.x - ai.x) < laneClear * 0.67) target = Math.min(target, ahead.speed);
      }
    }
    ai.x += limit(laneTarget - ai.x, -laneRate * dt, laneRate * dt);

    ai.speed += limit(target - ai.speed, BRAKING * dt, ACCEL * 0.7 * dt);
    ai.progress += ai.speed * dt;
    const lastZ = ai.z;
    ai.z = wrap(gridZ + ai.progress, trackLength);
    ai.seg = findSegment(ai.z);
    if (ai.z < lastZ - trackLength / 2) aiPitDecision(ai);   // wrapped past distance 0: that is the pit entry
    if (!ai.finished && ai.progress >= finishProgress) { ai.finished = true; ai.finishSeq = ++finishCounter; }

    const crossed = ai.progress < lineProgress ? 0 : Math.floor((ai.progress - lineProgress) / trackLength) + 1;
    if (crossed > ai.crossings) ai.crossings = crossed;
  }
}

// Bumping a car ahead knocks the player's speed down; a faster car coming up from behind is slowed instead.
function handleCollisions(dt) {
  if (session === 'qualifying') return;
  const side = TD_CAR_W, length = TD_CAR_LEN;   // how close two cars must be to touch
  for (const ai of ais) {
    if (tdPitCommit || ai.pit) continue;   // cars in the pit lane pass through each other, so nobody is trapped behind a slow car or shoved into the pit wall
    const rel = ai.progress - playerProgress;
    if (Math.abs(rel) < length && Math.abs(ai.x - playerX) < side) {
      if (rel > 0 && speed > ai.speed) { speed = ai.speed * 0.8; soundBump(); }
      else if (rel <= 0 && ai.speed > speed) ai.speed = speed * 0.9;
      // Ease the cars apart; the push fades to nothing at the edge of contact, so there is no ping-pong.
      playerX += (playerX >= ai.x ? 1 : -1) * (side - Math.abs(ai.x - playerX)) * Math.min(1, dt * 10);
    }
  }
}

function crossLine() {
  crossings++;
  if (forecast.change && crossings === forecast.change.crossing) weatherTarget = forecast.change.wet;
  if (crossings === 1) { lapTime = 0; return; }   // crossing the line from the grid starts lap 1
  lapTimes.push(lapTime);
  bestLap = bestLap === null ? lapTime : Math.min(bestLap, lapTime);
  const record = saveData.bestLaps[currentTrack.name];   // the best ever on this circuit, over every session and difficulty
  if (record === undefined || lapTime < record) { saveData.bestLaps[currentTrack.name] = lapTime; writeSave(); }
  lapTime = 0;
  if (crossings === sessionLaps() + 1) {
    raceState = 'finished';
    if (session === 'qualifying') finishQualifying();
    else {
      finalPlace = currentPlace();
      playerFinishSeq = ++finishCounter;
      if (championship) finishChampionshipRound();
    }
    soundFinish();
  } else {
    soundLap();
    if (session === 'race' && lapTimes.length >= 2 && lapTimes[lapTimes.length - 1] === bestLap) radio('Fastest lap so far: ' + formatTime(bestLap));
  }
}

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
}

function limit(v, lo, hi) { return Math.max(lo, Math.min(v, hi)); }
function wrap(v, max) { while (v >= max) v -= max; while (v < 0) v += max; return v; }

// ---- Rendering ----
// The player's Mercedes-style livery: silver body, teal flap and helmet, tyre band in the compound colour.
function playerLivery() {
  return { body: '#C8CDD2', pod: '#9AA0A6', accent: '#00D2BE', wing: '#F4F4F4', end: '#1E1E1E', helmet: '#00D2BE', tyre: tyre.color };
}

// Rear view of the player's car, used for the close-up in the pit box (the main view is topdown.js).
function drawCar() {
  ctx.save();
  ctx.scale(SCALE, SCALE);
  const cx = LW / 2;
  const bottom = LH - 90 + 58;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(cx, bottom - 4, 52, 7, 0, 0, Math.PI * 2); ctx.fill();
  drawCarSprite(carFrames(playerLivery()), 0, cx, bottom, CAR_ART_SCALE);
  ctx.restore();
}

function drawHud() {
  ctx.save();
  ctx.scale(SCALE, SCALE);
  if (raceState === 'mode') { drawModeSelect(); ctx.restore(); return; }
  if (raceState === 'trophy') { drawTrophyScreen(); ctx.restore(); return; }
  if (raceState === 'standings' || raceState === 'champion') { drawStandings(raceState === 'champion'); ctx.restore(); return; }
  if (raceState === 'track') { drawTrackSelect(); ctx.restore(); return; }
  // speed and position (top right)
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(LW - 112, 8, 104, 22);
  ctx.fillRect(LW - 112, 34, 104, 22);
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#FFD800';
  ctx.fillText(Math.round((speed / MAX_SPEED) * 320) + ' km/h', LW - 14, 24);
  ctx.fillStyle = '#00D2BE';
  ctx.fillText(session === 'qualifying' ? 'QUALIFYING' : 'P' + (raceState === 'finished' ? finalPlace : currentPlace()) + ' / ' + (ais.length + 1), LW - 14, 50);

  // lap panel (top left)
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(8, 8, 150, 62);
  ctx.textAlign = 'left';
  ctx.font = 'bold 14px monospace';
  ctx.fillStyle = '#FFD800';
  ctx.fillText('LAP ' + Math.min(Math.max(crossings, 1), sessionLaps()) + '/' + sessionLaps(), 14, 24);
  ctx.font = '11px monospace';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('TIME ' + (crossings >= 1 ? formatTime(lapTime) : '--:--.---'), 14, 38);
  ctx.fillText('LAST ' + (lapTimes.length ? formatTime(lapTimes[lapTimes.length - 1]) : '--:--.---'), 14, 51);
  ctx.fillStyle = '#00D2BE';
  ctx.fillText('BEST ' + (bestLap !== null ? formatTime(bestLap) : '--:--.---'), 14, 64);

  if (session === 'qualifying') drawQualiPanel();
  else drawLeaderboard();
  drawTyreHud();
  drawMinimap();
  if (raceState === 'select') drawTyreSelect();
  if (raceState === 'pit') { if (PIT_MINIGAME) drawPitStop(); else drawPitStopSimple(); }
  drawPitCallHud();
  drawWeatherHud();
  drawRadio();

  ctx.textAlign = 'center';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#000';
  if (raceState === 'countdown') {
    ctx.font = 'bold 84px monospace';
    ctx.fillStyle = '#FF3030';
    const n = String(Math.ceil(countdownT));
    ctx.strokeText(n, LW / 2, START_MSG_Y);
    ctx.fillText(n, LW / 2, START_MSG_Y);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.strokeText('Rev the engine, but go on GO - too early and the wheels spin', LW / 2, START_MSG_Y + 24);
    ctx.fillText('Rev the engine, but go on GO - too early and the wheels spin', LW / 2, START_MSG_Y + 24);
  } else if (goFlashT > 0) {
    ctx.font = 'bold 84px monospace';
    ctx.fillStyle = '#30FF30';
    ctx.strokeText('GO!', LW / 2, START_MSG_Y);
    ctx.fillText('GO!', LW / 2, START_MSG_Y);
    if (pitStops > 0) {
      ctx.font = 'bold 20px monospace';
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeText('PIT STOP ' + lastPitTime.toFixed(1) + 's', LW / 2, START_MSG_Y + 26);
      ctx.fillText('PIT STOP ' + lastPitTime.toFixed(1) + 's', LW / 2, START_MSG_Y + 26);
    }
  } else if (raceState === 'finished' && session === 'qualifying') {
    drawQualiResult();
  } else if (raceState === 'finished') {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(LW / 2 - 190, 44, 380, 310);
    ctx.fillStyle = '#FFD800';
    ctx.font = 'bold 40px monospace';
    ctx.fillText('FINISH!', LW / 2, 90);
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = '#00D2BE';
    ctx.fillText('P' + finalPlace + ' of ' + (ais.length + 1), LW / 2, 122);
    ctx.font = '18px monospace';
    ctx.fillStyle = '#FFFFFF';
    lapTimes.forEach((t, i) => {
      const isBest = t === bestLap;
      ctx.fillStyle = isBest ? '#00D2BE' : '#FFFFFF';
      ctx.fillText('Lap ' + (i + 1) + '   ' + formatTime(t) + (isBest ? '  best' : ''), LW / 2, 156 + i * 22);
    });
    ctx.fillStyle = '#FFD800';
    ctx.fillText('Race time  ' + formatTime(raceTime), LW / 2, 156 + lapTimes.length * 22 + 10);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '16px monospace';
    ctx.fillText('Pit stops: ' + pitStops, LW / 2, 156 + lapTimes.length * 22 + 34);
    ctx.fillText(championship ? 'Press Enter for the standings' : 'Press Enter to race again', LW / 2, 336);
  }
  if (launchMsgT > 0 && raceState === 'racing') {   // how the start went
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px monospace';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = launchMsgColour;
    ctx.strokeText(launchMsg, LW / 2, START_MSG_Y + 26);
    ctx.fillText(launchMsg, LW / 2, START_MSG_Y + 26);
  }
  ctx.restore();
}

// Current conditions (top right, under the position box) and a warning the lap before a forecast change.
function drawWeatherHud() {
  if (raceState === 'select') return;
  const changing = Math.abs(weatherTarget - weather.wet) > 0.02;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(LW - 112, 60, 104, 20);
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = weatherColor(weather.wet);
  ctx.fillText(weatherName(weather.wet) + (changing ? (weatherTarget > weather.wet ? ' >' : ' <') : ''), LW - 14, 74);

  if (raceState === 'racing' && forecast.change && crossings === forecast.change.crossing - 1) {
    const worse = forecast.change.wet > weather.wet;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(LW / 2 - 110, 36, 220, 18);
    ctx.textAlign = 'center';
    ctx.fillStyle = worse ? '#6FA8FF' : '#FFD800';
    ctx.fillText(worse ? 'RAIN ARRIVING NEXT LAP' : 'TRACK DRYING NEXT LAP', LW / 2, 49);
  }
}

// The tyres waiting in the pit box (1 / 2 / 3), and a banner while you are in the pit lane.
function drawPitCallHud() {
  if (session !== 'race' || raceState === 'select' || raceState === 'finished') return;
  const w = 72, gap = 4, x0 = LW / 2 - (w * 3 + gap * 2) / 2, y = LH - 28;
  ctx.textAlign = 'center';
  ctx.font = '9px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('TYRES WAITING IN THE PITS', LW / 2, y - 4);
  COMPOUND_ORDER.forEach((key, i) => {
    const c = COMPOUNDS[key], x = x0 + i * (w + gap), chosen = key === pitTyreChoice;
    ctx.fillStyle = chosen ? 'rgba(0,210,190,0.4)' : 'rgba(0,0,0,0.65)';
    ctx.fillRect(x, y, w, 20);
    if (chosen) { ctx.strokeStyle = '#00D2BE'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, 20); }
    ctx.fillStyle = c.color;
    ctx.beginPath(); ctx.arc(x + 11, y + 10, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText((i + 1) + ' ' + c.name, x + 21, y + 14);
  });
  if (tdPitCommit && raceState === 'racing') {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(LW / 2 - 160, 60, 320, 18);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFD800';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(difficulty().limiter ? 'PIT LIMITER 80 km/h - brake to stop on the teal line' : 'PIT LANE 80 km/h LIMIT - brake to stop on the teal line', LW / 2, 73);
  }
}

// The pit radio message across the top of the screen.
function drawRadio() {
  if (radioT <= 0) return;
  ctx.globalAlpha = Math.min(1, radioT / 0.4);
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(LW / 2 - 210, 8, 420, 22);
  ctx.textAlign = 'left';
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = '#00D2BE';
  ctx.fillText('RADIO', LW / 2 - 202, 23);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(radioText, LW / 2 - 152, 23);
  ctx.globalAlpha = 1;
}

// The stopping-distance stop: a panel with how well you parked and the crew's progress.
function drawPitStopSimple() {
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(LW / 2 - 130, 40, 260, 78);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFD800';
  ctx.font = 'bold 18px monospace';
  ctx.fillText('PIT STOP', LW / 2, 62);
  ctx.fillStyle = pitTier.colour;
  ctx.font = 'bold 13px monospace';
  ctx.fillText(pitTier.label + ' - ' + Math.round(pitError) + ' from the mark', LW / 2, 80);
  const done = limit(pitTimer / pitDuration, 0, 1);
  ctx.fillStyle = '#222222';
  ctx.fillRect(LW / 2 - 110, 90, 220, 10);
  ctx.fillStyle = pitStage === 'done' ? '#30E050' : '#00D2BE';
  ctx.fillRect(LW / 2 - 110, 90, 220 * done, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '11px monospace';
  ctx.fillText(pitStage === 'done' ? 'GO GO GO!' : pitTimer.toFixed(1) + ' / ' + pitDuration.toFixed(1) + ' s', LW / 2, 112);
}

// Pit box: the car is stopped, wheels are lit up in turn, and the timing bar sits at the top.
function drawPitStop() {
  const cx = LW / 2, cy = LH - 90;
  const wheels = [[-41, 14], [41, 14], [-37, 38], [37, 38]];   // positions on the car sprite
  const serving = pitStage === 'service';

  if (pitStage !== 'braking') {
    const fitted = COMPOUNDS[pitTyreKey].color;
    wheels.forEach(([wx, wy], i) => {
      const side = wx < 0 ? -1 : 1;
      const x = cx + wx, y = cy + wy;
      const crewX = x + side * 30;
      ctx.fillStyle = '#E8C9A0';
      ctx.beginPath(); ctx.arc(crewX, y - 9, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#00A99A';
      ctx.fillRect(crewX - 5, y - 5, 10, 14);

      const result = pitResults[i];
      let color = '#888888', r = 9;
      if (result) {
        color = PIT_RESULTS[result].color;
        ctx.fillStyle = fitted;
        ctx.beginPath(); ctx.arc(x, y, r - 3, 0, Math.PI * 2); ctx.fill();
      } else if (serving && i === pitResults.length) {
        color = '#FFD800';
        r = 9 + 1.5 * Math.sin(performance.now() / 100);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    });
  }

  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(LW / 2 - 190, 50, 380, 116);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFD800';
  ctx.font = 'bold 22px monospace';
  ctx.fillText('PIT STOP', LW / 2, 76);
  ctx.textAlign = 'right';
  ctx.font = '12px monospace';
  ctx.fillStyle = '#FFFFFF';
  if (serving) ctx.fillText(pitTimer.toFixed(1) + 's', LW / 2 + 180, 74);
  ctx.textAlign = 'center';

  let line1 = 'Fitting ' + COMPOUNDS[pitTyreKey].name + ' tyres', line2 = '';
  if (pitStage === 'braking') line1 = 'Coming into the pits...';
  else if (pitStage === 'done') line1 = 'GO GO GO!';
  else line2 = pitResults.length < PIT_WHEELS.length ? PIT_WHEELS[pitResults.length] + ': press SPACE in the green' : 'Finishing up...';
  ctx.font = '13px monospace';
  ctx.fillText(line1, LW / 2, 96);
  ctx.fillStyle = '#CCCCCC';
  ctx.fillText(line2, LW / 2, 112);

  const bx = LW / 2 - 150, by = 120, bw = 300, bh = 18;
  ctx.fillStyle = '#222222';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#8A7A10';
  ctx.fillRect(bx + (0.5 - 0.18) * bw, by, 0.36 * bw, bh);
  ctx.fillStyle = '#30C040';
  ctx.fillRect(bx + (0.5 - 0.06) * bw, by, 0.12 * bw, bh);
  if (serving && pitWaitT <= 0 && pitResults.length < PIT_WHEELS.length) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(bx + pitMarker() * bw - 2, by - 4, 4, bh + 8);
  }
  if (serving && pitWaitT > 0 && pitResults.length > 0) {
    const last = PIT_RESULTS[pitResults[pitResults.length - 1]];
    ctx.fillStyle = last.color;
    ctx.font = 'bold 14px monospace';
    ctx.fillText(last.label, LW / 2, 158);
  }
}

function drawRain() {
  const n = Math.round(rain.length * weather.wet);
  if (n === 0) return;
  ctx.save();
  ctx.scale(SCALE, SCALE);
  ctx.strokeStyle = 'rgba(200,215,230,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    ctx.moveTo(rain[i].x, rain[i].y);
    ctx.lineTo(rain[i].x - 3, rain[i].y + 12);
  }
  ctx.stroke();
  ctx.restore();
}

// Current compound and remaining tread (bottom left).
function drawTyreHud() {
  const x = 8, y = LH - 38;
  const left = 1 - tyreWear;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x, y, 140, 30);
  ctx.fillStyle = tyre.color;
  ctx.beginPath(); ctx.arc(x + 16, y + 15, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(tyre.name[0], x + 16, y + 19);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '11px monospace';
  ctx.fillText(tyre.name + ' ' + Math.round(left * 100) + '%', x + 32, y + 12);
  ctx.fillStyle = '#333';
  ctx.fillRect(x + 32, y + 17, 100, 8);
  ctx.fillStyle = left > 0.5 ? '#30C040' : left > 0.2 ? '#E8C800' : '#E03030';
  ctx.fillRect(x + 32, y + 17, 100 * left, 8);
}

// Tyre choice screen shown on the grid before the lights.
function drawTyreSelect() {
  const cardW = 124, gap = 12;
  const x0 = LW / 2 - (cardW * 3 + gap * 2) / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(currentTrack.name + ' GRAND PRIX' + (championship ? '  -  ROUND ' + (championship.round + 1) + ' OF ' + TRACKS.length : '') + '  [' + difficulty().name + ']', LW / 2, 46);
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(x0 - 16, 56, cardW * 3 + gap * 2 + 32, 264);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFD800';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(session === 'qualifying' ? 'QUALIFYING: CHOOSE TYRES' : 'RACE: CHOOSE YOUR TYRES', LW / 2, 82);
  ctx.fillStyle = weatherColor(forecast.start);
  ctx.font = 'bold 14px monospace';
  ctx.fillText('FORECAST: ' + forecast.label, LW / 2, 104);

  COMPOUND_ORDER.forEach((key, i) => {
    const c = COMPOUNDS[key];
    const cx = x0 + i * (cardW + gap);
    const mid = cx + cardW / 2;
    const selected = key === chosenCompound;
    ctx.fillStyle = selected ? 'rgba(0,210,190,0.25)' : 'rgba(255,255,255,0.08)';
    ctx.fillRect(cx, 116, cardW, 170);
    if (selected) { ctx.strokeStyle = '#00D2BE'; ctx.lineWidth = 2; ctx.strokeRect(cx, 116, cardW, 170); }

    ctx.fillStyle = '#161616';
    ctx.beginPath(); ctx.arc(mid, 150, 24, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = c.color; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(mid, 150, 15, 0, Math.PI * 2); ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(c.name, mid, 192);
    ctx.font = '11px monospace';
    ['SPEED', 'GRIP', 'LIFE', 'WET'].forEach((label, row) => {
      const ry = 212 + row * 16;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#CCCCCC';
      ctx.fillText(label, cx + 8, ry);
      for (let p = 0; p < 3; p++) {
        ctx.fillStyle = p < c.rating[row] ? c.color : '#333333';
        ctx.fillRect(cx + 56 + p * 20, ry - 8, 16, 9);
      }
    });
    ctx.textAlign = 'center';
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '12px monospace';
  ctx.fillText(session === 'qualifying' ? 'Left/Right: choose     Enter: start qualifying' : 'Left/Right: choose     Enter: start the race', LW / 2, 300);
  ctx.fillStyle = '#888888';
  ctx.fillText((session === 'qualifying' ? '' : 'You start P' + (playerSlot + 1) + '   ') + 'M: sound ' + (sound.muted ? 'OFF' : 'ON'), LW / 2, 314);
}

// A panel listing the keys, used by the first screen and the circuit screen.
function drawControlsPanel(cx, cy) {
  const cw = 580, ch = 96;
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(cx, cy, cw, ch);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFD800';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('CONTROLS', cx + 12, cy + 18);
  const rows = [
    [['STEER', 'Left / Right  or  A / D'], ['PIT TYRES', '1 / 2 / 3  soft/hard/wet']],
    [['GAS', 'Up  or  W'], ['PIT STOP', 'stop on the teal line']],
    [['BRAKE', 'Down  or  S'], ['SOUND', 'M  (on / off)']],
  ];
  ctx.font = '12px monospace';
  rows.forEach((pair, r) => pair.forEach(([label, text], c) => {
    const x = cx + 12 + c * 290, y = cy + 40 + r * 18;
    ctx.fillStyle = '#00D2BE';
    ctx.fillText(label, x, y);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(text, x + 92, y);
  }));
}

// Split text into lines of at most `max` characters, breaking at spaces.
function wrapLines(text, max) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    if ((line + ' ' + word).trim().length > max) { lines.push(line); line = word; }
    else line = (line + ' ' + word).trim();
  }
  lines.push(line);
  return lines;
}

// The first screen: single race or championship.
let titleTime = 0;   // seconds, for the moving pictures on the first screen

function drawModeSelect() {
  ctx.fillStyle = '#0B1F12';
  ctx.fillRect(0, 0, LW, LH);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFD800';
  ctx.font = 'bold 34px monospace';
  ctx.fillText('P1 RACER', LW / 2, 60);
  drawTitleArt(titleTime);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '14px monospace';
  ctx.fillText('Choose how to play', LW / 2, 78);

  const modes = [
    { title: 'SINGLE RACE', text: 'Pick any circuit. Qualify to set the grid, then race five laps.' },
    { title: 'CHAMPIONSHIP', text: TRACKS.map(t => t.name).join(', ') + '. Points for every finish: ' + CHAMP_POINTS.join(', ') + '. Win the title!' },
  ];
  const cardW = 280, cardH = 150, gap = 20, x0 = LW / 2 - (2 * cardW + gap) / 2;
  modes.forEach((m, i) => {
    const x = x0 + i * (cardW + gap), y = 92, selected = i === modeIndex;
    ctx.fillStyle = selected ? 'rgba(0,210,190,0.22)' : 'rgba(255,255,255,0.07)';
    ctx.fillRect(x, y, cardW, cardH);
    if (selected) { ctx.strokeStyle = '#00D2BE'; ctx.lineWidth = 3; ctx.strokeRect(x, y, cardW, cardH); }
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(m.title, x + cardW / 2, y + 36);
    ctx.font = '13px monospace';
    ctx.fillStyle = '#CCCCCC';
    wrapLines(m.text, 33).forEach((line, r) => ctx.fillText(line, x + cardW / 2, y + 66 + r * 18));
  });

  // difficulty
  const dy = 256, pillW = 100, pillGap = 8, px0 = x0 + 110;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFD800';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('DIFFICULTY', x0, dy + 16);
  DIFFICULTIES.forEach((d, i) => {
    const px = px0 + i * (pillW + pillGap), selected = i === difficultyIndex;
    ctx.fillStyle = selected ? 'rgba(0,210,190,0.3)' : 'rgba(255,255,255,0.07)';
    ctx.fillRect(px, dy, pillW, 22);
    if (selected) { ctx.strokeStyle = '#00D2BE'; ctx.lineWidth = 2; ctx.strokeRect(px, dy, pillW, 22); }
    ctx.fillStyle = selected ? '#FFFFFF' : '#999999';
    ctx.textAlign = 'center';
    ctx.fillText(d.name, px + pillW / 2, dy + 16);
  });
  ctx.fillStyle = '#CCCCCC';
  ctx.font = '12px monospace';
  ctx.fillText(difficulty().text, LW / 2, dy + 40);

  drawControlsPanel(LW / 2 - 290, 312);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '13px monospace';
  ctx.fillText('Left/Right: mode     Up/Down: difficulty     Enter: start', LW / 2, LH - 22);
  if (!sound.ctx && !sound.unavailable) {   // browsers keep sound off until a key is pressed
    ctx.fillStyle = '#888888';
    ctx.font = '11px monospace';
    ctx.fillText('Press any key to start the music (M mutes)', LW / 2, LH - 6);
  }
}

// The championship points table after a round, or (final = true) the end of the season.
function champColour(who) { return who === 0 ? '#00D2BE' : AI_TEAMS[who - 1].body; }
function champName(who) { return who === 0 ? 'YOU' : AI_TEAMS[who - 1].name.toUpperCase(); }
function championshipTable() {
  const table = championship.points.map((pts, who) => ({ who, pts }));
  table.sort((a, b) => b.pts - a.pts || a.who - b.who);
  return table;
}

function drawStandings(final) {
  ctx.fillStyle = '#0B1F12';
  ctx.fillRect(0, 0, LW, LH);
  const table = championshipTable();
  const champ = table[0].who;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFD800';
  ctx.font = 'bold 26px monospace';
  if (final) {
    ctx.fillText(champ === 0 ? 'YOU ARE THE CHAMPION!' : champName(champ) + ' WIN THE CHAMPIONSHIP', LW / 2, 46);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '14px monospace';
    ctx.fillText(champ === 0 ? 'Brilliant driving over all ' + TRACKS.length + ' circuits.' : 'You finished P' + (table.findIndex(t => t.who === 0) + 1) + ' overall. Go again!', LW / 2, 70);
  } else {
    ctx.fillText('ROUND ' + (championship.round + 1) + ' OF ' + TRACKS.length + ' - ' + currentTrack.name, LW / 2, 46);
  }

  // left: this race's result, with the points scored
  const panel = (x, title, rows, highlightFirst) => {
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(x, 92, 290, 240);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#00D2BE';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(title, x + 14, 114);
    ctx.font = '16px monospace';
    rows.forEach((r, k) => {
      const y = 148 + k * 30;
      if (r.who === 0) { ctx.fillStyle = 'rgba(0,210,190,0.2)'; ctx.fillRect(x + 6, y - 19, 278, 26); }
      ctx.fillStyle = r.colour;
      ctx.fillRect(x + 14, y - 12, 5, 14);
      ctx.fillStyle = k === 0 && highlightFirst ? '#FFD800' : (r.who === 0 ? '#00D2BE' : '#FFFFFF');
      ctx.textAlign = 'left';
      ctx.fillText('P' + (k + 1), x + 26, y);
      ctx.fillText(r.name, x + 70, y);
      ctx.textAlign = 'right';
      ctx.fillText(r.right, x + 276, y);
    });
  };
  panel(24, 'RACE RESULT', championship.last.map(e => ({ who: e.who, name: e.name, colour: champColour(e.who), right: '+' + e.pts })), false);
  panel(326, final ? 'FINAL STANDINGS' : 'CHAMPIONSHIP', table.map(t => ({ who: t.who, name: champName(t.who), colour: champColour(t.who), right: t.pts + ' pts' })), final);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '15px monospace';
  if (final) ctx.fillText('Press Enter to go back to the start', LW / 2, 380);
  else if (championship.round + 1 < TRACKS.length) ctx.fillText('Enter: next race - ' + TRACKS[championship.round + 1].name, LW / 2, 366);
  else ctx.fillText('Enter: see the final result', LW / 2, 366);
  if (!final) {
    ctx.fillStyle = '#888888';
    ctx.font = '12px monospace';
    ctx.fillText('Escape: quit the championship', LW / 2, 388);
  }
}

// How the circuit cards are laid out: one row of tall cards for up to three circuits; four make a 2 x 2
// grid of wide cards (map on the left, text on the right); more than that, two rows of narrower cards.
// The size of each card's map comes from here too, so it is worked out once for the cards and the thumbnails.
function circuitLayout() {
  const n = TRACKS.length, gap = 16;
  const cols = n <= 3 ? n : n === 4 ? 2 : Math.ceil(n / 2), rows = Math.ceil(n / cols);
  const cardW = Math.min(n === 4 ? 300 : 200, Math.floor((LW - 40 - (cols - 1) * gap) / cols));
  const horizontal = rows === 2 && cols === 2;
  const cardH = rows === 1 ? 360 : horizontal ? 190 : 186;
  const textTop = cardH - 112;   // upright cards: the name, description and key hint sit in the bottom 112 pixels
  return horizontal
    ? { cols, rows, gap, cardW, cardH, horizontal, mapW: Math.floor(cardW * 0.5) - 8, mapH: cardH - 12 }
    : { cols, rows, gap, cardW, cardH, horizontal, textTop, mapW: cardW - 8, mapH: textTop - 8 };
}

// The circuit screen: a card with a map for each circuit.
// "BEST 1:21.400" in the corner of a circuit's card, once there is a lap on record.
function drawBestOnCard(t, rightX, y) {
  const best = saveData.bestLaps[t.name];
  if (best === undefined) return;
  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = '11px monospace';
  ctx.fillStyle = '#FFD800';
  ctx.fillText('BEST ' + formatTime(best), rightX, y);
  ctx.restore();
}

function drawTrackSelect() {
  ctx.fillStyle = '#0B1F12';
  ctx.fillRect(0, 0, LW, LH);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFD800';
  ctx.font = 'bold 26px monospace';
  ctx.fillText('CHOOSE YOUR CIRCUIT', LW / 2, 42);

  const L = circuitLayout();
  const gridW = L.cols * L.cardW + (L.cols - 1) * L.gap;
  TRACKS.forEach((t, i) => {
    const col = i % L.cols, row = Math.floor(i / L.cols);
    const x = LW / 2 - gridW / 2 + col * (L.cardW + L.gap), y = 58 + row * (L.cardH + L.gap);
    const selected = i === trackIndex;
    ctx.fillStyle = selected ? 'rgba(0,210,190,0.22)' : 'rgba(255,255,255,0.07)';
    ctx.fillRect(x, y, L.cardW, L.cardH);
    if (selected) { ctx.strokeStyle = '#00D2BE'; ctx.lineWidth = 3; ctx.strokeRect(x, y, L.cardW, L.cardH); }
    if (L.horizontal) {   // map on the left, text on the right
      const mapBox = Math.floor(L.cardW * 0.5);
      ctx.drawImage(t.thumb.canvas, x + 4 + (mapBox - 8 - t.thumb.w) / 2, y + (L.cardH - t.thumb.h) / 2);
      const tx = x + mapBox + 4, tw = L.cardW - mapBox - 12;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 18px monospace';
      ctx.fillText(t.name, tx, y + 44);
      ctx.font = '12px monospace';
      ctx.fillStyle = '#CCCCCC';
      wrapLines(t.blurb, Math.floor(tw / 7.4)).forEach((line, r) => ctx.fillText(line, tx, y + 70 + r * 16));
      drawBestOnCard(t, x + L.cardW - 8, y + L.cardH - 12);
      ctx.textAlign = 'center';
    } else {
      ctx.drawImage(t.thumb.canvas, x + (L.cardW - t.thumb.w) / 2, y + 4 + (L.textTop - 8 - t.thumb.h) / 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(t.name, x + L.cardW / 2, y + L.textTop + 18);
      ctx.font = '12px monospace';
      ctx.fillStyle = '#CCCCCC';
      wrapLines(t.blurb, Math.floor(L.cardW / 7.4)).forEach((line, r) => ctx.fillText(line, x + L.cardW / 2, y + L.textTop + 42 + r * 16));
      drawBestOnCard(t, x + L.cardW - 8, y + L.cardH - 10);
    }
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '13px monospace';
  ctx.fillText('Left/Right: choose     Enter: select     ESC: back', LW / 2, LH - 22);
}

// Qualifying: the five AI times to beat (shown once the lights go out).
function drawQualiPanel() {
  if (raceState === 'select') return;
  const rows = ais.map(ai => ({ name: ai.team.name.slice(0, 3).toUpperCase(), color: ai.team.body, time: ai.qualiTime }));
  rows.sort((a, b) => a.time - b.time);
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(8, 76, 128, rows.length * 14 + 22);
  ctx.textAlign = 'left';
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = '#FFD800';
  ctx.fillText('TO BEAT', 14, 90);
  ctx.font = '11px monospace';
  rows.forEach((row, i) => {
    const y = 90 + (i + 1) * 14 - 1;
    ctx.fillStyle = row.color;
    ctx.fillRect(13, y - 8, 4, 9);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.fillText(String(i + 1), 21, y);
    ctx.fillText(row.name, 33, y);
    ctx.textAlign = 'right';
    ctx.fillText(formatTime(row.time), 131, y);
  });
  ctx.textAlign = 'left';
}

// Qualifying result: the grid, with times and gaps to pole.
function drawQualiResult() {
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(LW / 2 - 190, 44, 380, 310);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFD800';
  ctx.font = 'bold 34px monospace';
  ctx.fillText('QUALIFYING', LW / 2, 86);
  ctx.fillStyle = '#00D2BE';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('You start P' + (playerSlot + 1) + (playerSlot === 0 ? ' - POLE!' : ''), LW / 2, 118);
  ctx.font = '16px monospace';
  grid.forEach((g, k) => {
    const y = 154 + k * 26;
    const me = g.who === 'you';
    if (me) { ctx.fillStyle = 'rgba(0,210,190,0.2)'; ctx.fillRect(LW / 2 - 170, y - 16, 340, 22); }
    ctx.fillStyle = me ? '#00D2BE' : '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.fillText('P' + (k + 1), LW / 2 - 160, y);
    ctx.fillText(g.name, LW / 2 - 110, y);
    ctx.textAlign = 'right';
    ctx.fillText(formatTime(g.time), LW / 2 + 80, y);
    ctx.fillStyle = me ? '#00D2BE' : '#AAAAAA';
    ctx.fillText(k === 0 ? 'POLE' : '+' + (g.time - grid[0].time).toFixed(3), LW / 2 + 165, y);
  });
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('Press Enter for the race', LW / 2, 336);
}

// Live standings: place, team, and the time gap to the car in front (approximate: distance
// gap divided by a fixed reference speed, so the numbers stay steady even at a standstill).
const GAP_REFERENCE_SPEED = MAX_SPEED * 0.7;
function drawLeaderboard() {
  const rows = [{ name: 'YOU', color: '#00D2BE', progress: playerProgress, me: true, tyreColor: tyre.color, inPit: raceState === 'pit' }];
  for (const ai of ais) {
    rows.push({ name: ai.team.name.slice(0, 3).toUpperCase(), color: ai.team.body, progress: ai.progress,
                tyreColor: COMPOUNDS[ai.tyreKey].color, inPit: ai.pit !== null });
  }
  rows.sort((a, b) => b.progress - a.progress);

  const rowH = 14;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(8, 76, 116, rows.length * rowH + 6);
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  rows.forEach((row, i) => {
    const y = 76 + 3 + (i + 1) * rowH - 3;
    ctx.fillStyle = row.color;
    ctx.fillRect(13, y - 8, 4, 9);
    ctx.fillStyle = row.me ? '#00D2BE' : '#FFFFFF';
    ctx.fillText(String(i + 1), 21, y);
    ctx.fillText(row.name, 33, y);
    ctx.fillStyle = row.tyreColor;
    ctx.beginPath(); ctx.arc(66, y - 4, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = row.me ? '#00D2BE' : '#FFFFFF';
    ctx.textAlign = 'right';
    const gap = row.inPit ? 'PIT' : i === 0 ? 'LEAD' : '+' + ((rows[i - 1].progress - row.progress) / GAP_REFERENCE_SPEED).toFixed(2);
    ctx.fillText(gap, 119, y);
    ctx.textAlign = 'left';
  });
}

// ---- Main loop (fixed timestep) ----
const cardLayout = circuitLayout();
for (const t of TRACKS) t.thumb = makeMapCanvas(computeMapPoints(t).pts, cardLayout.mapW, cardLayout.mapH, t.lineS / SEGMENT_LENGTH);   // also checks each map closes
loadTrack(TRACKS[0]);
resetRace();
let last = performance.now();
function frame(now) {
  // One update per displayed frame, so motion matches the screen's refresh rate (60 or 120 Hz).
  // A long gap (tab in the background) is split into steps of at most 1/30 s.
  let remaining = Math.min(0.1, (now - last) / 1000);
  last = now;
  titleTime = now / 1000;
  if (paused) {
    remaining = 0;   // nothing moves while paused, and the engine and rain go quiet
    soundUpdate({ speedPct: 0, gas: false, engineOn: false, slip: 0, offroad: false, wet: 0 });
  }
  while (remaining > 0) {
    const dt = Math.min(remaining, 1 / 30);
    updateTopDown(dt);
    remaining -= dt;
  }
  renderTopDown();
  if (paused) drawPauseMenu();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
