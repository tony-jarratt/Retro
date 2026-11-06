// THE CAMPAIGN: the game from start to end. The levels go in LEVELS order
// (industrial, lab, HQ), each further UP the Veridian Group complex, and
// the screens round them are here:
//
//   TITLE     index.html with no level picked: VERIDIAN over a slow turn of
//             the first level, the premise, the title music.
//   BRIEFING  each level opens on its floor, name, a few lines of what you're
//             walking into, and the objective, over the frozen view.
//   (playing, dead, clear: the game itself)
//   LIFT      LEVEL COMPLETE, Enter: the lift ride up (lift.js), then the
//             next level loads.
//   FINALE    after the last level, the lift goes on up to the ROOF: dawn
//             over the complex, the ending, and what your run took.
//
// Each level is its own page load (map.js reads ?level= once, at the start),
// so the RUN (time, kills, rounds, hits, failures) is kept between them in the
// browser's sessionStorage, which lasts as long as the tab. So is your
// LOADOUT: the armour, ammo and gun modules you take up in the lift go with
// you into the next level (keycards and the charge belong to their level).
// Die there, and you replay it with what you arrived with.
//
// Enter moves things on: handleEnter. The game's state is game.state
// (combat.js): 'title', 'briefing', 'playing', 'dead', 'clear', 'lift', 'finale'.

const GAME_TITLE = 'VERIDIAN';
const TITLE_TURN_SPEED = 0.12;   // radians per second the view turns behind the title
const TITLE_GOLD = [255, 196, 96];
const PREMISE = [
  'SOMETHING WENT WRONG AT THE VERIDIAN GROUP.',
  'THE COMPLEX IS SEALED. NOBODY ANSWERS.',
  'YOU GO IN AT THE BOTTOM, IN THE SUIT,',
  'AND FIGHT YOUR WAY TO THE TOP.',
];
const ENDING = [
  'THE MOTHER PLANT IS ASH.',
  'THE CORE IS DEAD. THE LAB IS BURNING.',
  'ON THE ROOF OF THE VERIDIAN GROUP,',
  'THE SUN COMES UP.',
  'YOUR SUIT IS SCARRED. IT HELD.',
  'BUT SOMEWHERE BELOW, SOMETHING IS STILL GROWING.',
];
const ENDING_LINE_GAP = 2.2;     // seconds between the ending's lines appearing
const RUN_KEY = 'veridian-run';

// THE RUN so far: time (seconds playing), kills, shots (rounds fired),
// hits (rounds that struck something hostile: see countsAsHit), failures
// (times terminated), cleared (levels finished, for the rating's par time),
// and loadout: what you took into the lift, as
// { level (the id of the level it's for), armour, ammo, modes }, or null.
function freshRun() {
  return { time: 0, kills: 0, shots: 0, hits: 0, failures: 0, cleared: 0, loadout: null };
}
function loadRun() {
  try {
    const saved = sessionStorage.getItem(RUN_KEY);
    return saved ? { ...freshRun(), ...JSON.parse(saved) } : freshRun();
  } catch (err) {
    console.warn(`Couldn't read the run's stats from sessionStorage (${err.message}): starting them from zero.`);
    return freshRun();
  }
}
function saveRun() {
  try {
    sessionStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch (err) {
    console.warn(`Couldn't save the run's stats to sessionStorage (${err.message}): the finale's numbers will be short.`);
  }
}
const run = loadRun();

// Arriving by lift: you bring what you had. (Only into the level it was
// packed for: picking another level from the play-test chooser starts fresh.)
function applyLoadout() {
  const kit = run.loadout;
  if (!kit || kit.level !== CURRENT_LEVEL.id || game.state !== 'briefing') return;
  const modesOk = Array.isArray(kit.modes) && kit.modes.length > 0 && kit.modes.every((m) => m in FIRE_MODES);
  if (!Number.isFinite(kit.armour) || !Number.isFinite(kit.ammo) || !modesOk) {
    console.warn(`The saved loadout for "${kit.level}" doesn't make sense (${JSON.stringify(kit)}): starting this level with the usual kit.`);
    return;
  }
  player.armour = Math.max(0, Math.min(PLAYER_MAX_ARMOUR, kit.armour));
  player.ammo = Math.max(0, kit.ammo);
  player.modes = MODE_ORDER.filter((m) => kit.modes.includes(m)); // weapons.js: kept in spin-up order
}

// Everything you've destroyed on this level: robots and creatures (a downed
// suit that would get up doesn't count), drones, larvae, moths.
function levelKills() {
  const dead = (list) => list.filter((t) => t.state === 'dead').length;
  return enemies.filter((e) => e.state === 'dead' && !(e.downTime > 0)).length + dead(drones) + dead(larvae) + dead(moths);
}

// THIS ATTEMPT at this level, for the LEVEL COMPLETE tally. (Its time is
// game.playTime, its kills levelKills(); the page reloads for each level and
// each restart, so these start at zero every time.)
const attempt = { shots: 0, hits: 0 };

// combat.js, each round fired, and whether it struck something hostile.
function countShot(hit) {
  run.shots += 1;
  attempt.shots += 1;
  if (!hit) return;
  run.hits += 1;
  attempt.hits += 1;
}

// What counts as a HIT for accuracy: anything that's fighting you, or a
// target you'd mean to shoot (a camera, the core, a repair bay, a fuel drum
// that's still whole). Not windows, struts, walls, or a corpse that's staying down.
function countsAsHit(target) {
  if (!target) return false;
  if (target.enemy) return target.enemy.state !== 'dead' || target.enemy.downTime > 0; // a downed suit, finished off
  if (target.prop) return (Boolean(SPRITE_TYPES[target.prop.type].explosive) || liveTrap(target.prop)) && target.prop.state !== 'exploded'; // a drum, or a trapped desk (traps.js)
  if (target.bay) return target.bay.health > 0;
  return Boolean(target.camera || target.drone || target.larva || target.moth || target.core);
}

// Accuracy as a whole percentage, or null if nothing was fired (shown as --).
function accuracy(shots, hits) {
  return shots > 0 ? Math.round(100 * hits / shots) : null;
}
function accuracyText(shots, hits) {
  const pct = accuracy(shots, hits);
  return pct === null ? '--' : `${pct}%`;
}
function clockText(seconds) {
  const mins = Math.floor(seconds / 60), secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// THE RATING at the end. Deliberately not shown on screen, only the grade:
// out of 100,
//   accuracy  40 points, in full at RATING_FULL_ACCURACY (spraying on auto
//             has to cost you, but nobody hits every round)
//   speed     35 points, in full at or under par (RATING_PAR_PER_LEVEL for
//             each level cleared), falling off as par / time beyond it
//   survival  25 points, less RATING_FAILURE_COST for each suit failure
const RATING_FULL_ACCURACY = 0.5;
const RATING_PAR_PER_LEVEL = 6 * 60; // seconds: a guess, to tune after play-testing
const RATING_FAILURE_COST = 6;
const RATING_GRADES = [ // from the top: the first whose score you reach
  { min: 90, grade: 'S', title: 'UNSTOPPABLE' },
  { min: 75, grade: 'A', title: 'VETERAN' },
  { min: 60, grade: 'B', title: 'OPERATIVE' },
  { min: 40, grade: 'C', title: 'SURVIVOR' },
  { min: 0, grade: 'D', title: 'SALVAGE' },
];
function runScore() {
  const acc = run.shots > 0 ? run.hits / run.shots : 0;
  const par = Math.max(1, run.cleared) * RATING_PAR_PER_LEVEL;
  const accuracyPoints = 40 * Math.min(1, acc / RATING_FULL_ACCURACY);
  const speedPoints = 35 * Math.min(1, par / Math.max(1, run.time));
  const survivalPoints = Math.max(0, 25 - RATING_FAILURE_COST * run.failures);
  return accuracyPoints + speedPoints + survivalPoints;
}
function runRating() {
  const score = runScore();
  return RATING_GRADES.find((g) => score >= g.min);
}

// How the page opens: the title if no level was asked for, else that level's briefing.
// (With ?playtest and no level, main.js shows the level chooser instead.)
game.state = PAGE_ARGS.has('level') ? 'briefing' : 'title';
applyLoadout();
let titleAwake = false; // the title waits for a first key or click: the browser won't play music before one
let finaleTime = 0;
playTrack(game.state === 'title' ? 'title' : THEME_NAME); // music.js: it starts once there's sound
window.addEventListener('keydown', wakeTitle);
window.addEventListener('pointerdown', wakeTitle);
function wakeTitle() {
  // Wait a moment before Enter counts, so the key that woke it doesn't start the game too.
  if (game.state === 'title' && !titleAwake) setTimeout(() => { titleAwake = true; }, 250);
}

// ENTER: on to whatever's next.
function handleEnter() {
  if (game.state === 'title' && titleAwake) {
    Object.assign(run, freshRun()); // a new run
    saveRun();
    game.state = 'briefing';
    playTrack(THEME_NAME);
  } else if (game.state === 'briefing') {
    game.state = 'playing';
  } else if (game.state === 'clear') {
    const next = nextLevel();
    run.kills += levelKills();
    run.cleared += 1;
    run.loadout = next ? { level: next.id, armour: player.armour, ammo: player.ammo, modes: [...player.modes] } : null;
    saveRun();
    game.state = 'lift';
    startLiftRide(CURRENT_LEVEL.floor, next ? next.floor : ROOF_FLOOR); // lift.js
    playTrack('lift');
  } else if (game.state === 'finale' && finaleTime > ENDING.length * ENDING_LINE_GAP + 2) {
    location.search = PLAYTEST ? '?playtest' : ''; // back to the title
  }
}

// R, once you've died (or finished): this level again, from its briefing.
function restartLevel() {
  if (game.state !== 'dead' && game.state !== 'clear') return;
  if (game.state === 'dead') run.failures += 1;
  saveRun();
  location.search = levelAddress(CURRENT_LEVEL.id); // map.js
}

// Every frame (main.js), paused or not.
function updateCampaign(dt) {
  if (game.state === 'title') player.angle += TITLE_TURN_SPEED * dt;
  if (game.state === 'playing') {
    run.time += dt;
    game.playTime += dt;
  }
  if (game.state === 'lift' && updateLiftRide(dt)) {
    const next = nextLevel();
    if (next) {
      location.search = levelAddress(next.id);
    } else {
      game.state = 'finale';
      finaleTime = 0;
      playTrack('finale');
    }
  }
  if (game.state === 'finale') finaleTime += dt;
}

// The music follows the game: quiet when you die, a flourish when you win.
let lastMusicState = game.state;
function updateCampaignMusic() {
  if (game.state === lastMusicState) return;
  if (game.state === 'dead') stopMusic();
  if (game.state === 'clear') { stopMusic(); musicSting(); }
  lastMusicState = game.state;
}

// Is a whole-screen scene showing, instead of the 3D view?
function cutsceneShowing() {
  return game.state === 'lift' || game.state === 'finale';
}

function drawCutscene(pixels) {
  if (game.state === 'lift') drawLiftRide(pixels);
  else drawFinale(pixels);
  if (visorOn) applyVisor(pixels); // visor.js: you're still looking out of the suit
}

// THE TITLE and THE BRIEFING, over the 3D view (hud.js calls this instead of the HUD).
function drawCampaignScreen(pixels) {
  if (game.state === 'title') {
    tintScreen(pixels, [0, 0, 0], 0.55);
    drawTextCentred(pixels, GAME_TITLE, 34, TITLE_GOLD, 7);
    drawTextCentred(pixels, 'FIGHT YOUR WAY TO THE TOP', 78, HUD_GREEN, 1);
    PREMISE.forEach((line, n) => drawTextCentred(pixels, line, 104 + n * 10, [200, 210, 200], 1));
    if (Math.floor(performance.now() / 600) % 2 === 0) {
      drawTextCentred(pixels, titleAwake ? 'PRESS ENTER TO BEGIN' : 'PRESS ANY KEY', 160, HUD_GREEN, 2);
    }
    return;
  }
  // The briefing.
  tintScreen(pixels, [0, 6, 3], 0.6);
  drawTextCentred(pixels, floorName(CURRENT_LEVEL.floor), 30, HUD_GREEN, 1);
  drawTextCentred(pixels, CURRENT_LEVEL.name, 42, TITLE_GOLD, 4);
  (CURRENT_LEVEL.briefing || []).forEach((line, n) => drawTextCentred(pixels, line, 76 + n * 10, [200, 210, 200], 1));
  drawTextCentred(pixels, OBJECTIVE_LOOK.goal, 126, HUD_WARN, 1); // core.js
  // What you've brought with you.
  const modules = player.modes.filter((m) => m !== 'single').map((m) => FIRE_MODES[m].name);
  const kit = `ARMOUR ${player.armour}   ROUNDS ${player.ammo}` + (modules.length ? `   ${modules.join(' + ')}` : '');
  drawTextCentred(pixels, kit, 138, HUD_GREEN, 1);
  if (Math.floor(performance.now() / 600) % 2 === 0) drawTextCentred(pixels, 'PRESS ENTER', 156, HUD_GREEN, 2);
}

// THE FINALE: dawn over the complex, seen from its roof. A sky fading from
// night blue to orange at the horizon, the sun coming up, the other towers
// of the complex in silhouette with a few windows still lit (and vines up
// them), the roof's parapet in front. The ending comes up a line at a time;
// then the run's numbers.
function drawFinale(pixels) {
  const horizon = 128;
  const rise = Math.min(1, finaleTime / 14); // the sun climbs as you watch
  for (let y = 0; y < SCREEN_H; y++) {
    const t = Math.min(1, y / horizon);
    const sky = mix(mix([16, 20, 54], [120, 70, 110], t), [255, 150, 80], Math.pow(t, 3) * (0.5 + 0.5 * rise));
    for (let x = 0; x < SCREEN_W; x++) putPixel(pixels, x, y, sky);
  }
  // The sun.
  const sunY = Math.round(horizon + 10 - 40 * rise);
  for (let y = 0; y < 170; y++) { // down to the roof: the towers are drawn over its lower half
    for (let x = 180; x < 280; x++) {
      const d = Math.hypot(x - 230, y - sunY);
      if (d < 22) putPixel(pixels, x, y, [255, 226, 150]);
      else if (d < 34) putPixel(pixels, x, y, mix([255, 226, 150], [255, 160, 90], (d - 22) / 12));
    }
  }
  // The towers of the complex, in silhouette.
  for (let n = 0; n < 9; n++) {
    const left = n * 36 + Math.floor(noise(n, 0, 470) * 10) - 6;
    const width = 22 + Math.floor(noise(n, 1, 470) * 14);
    if (n === 6) continue; // a gap in the skyline, where the sun comes up
    const top = 100 + Math.floor(noise(n, 2, 470) * 45);
    for (let y = top; y < SCREEN_H; y++) {
      for (let x = left; x < left + width; x++) {
        const lit = (x - left) % 6 > 2 && (y - top) % 8 > 4 && noise(x >> 2, y >> 3, 471 + n) < 0.12; // a window still lit
        const vine = noise(x, y >> 1, 472) < 0.35 * Math.max(0, (y - top - 30) / 60);
        putPixel(pixels, x, y, lit ? [255, 210, 120] : vine ? [30, 50, 26] : [22, 20, 32]);
      }
    }
  }
  // The roof you're standing on: a parapet, and the lift housing's edge.
  fillRect(pixels, 0, 170, SCREEN_W, 30, [46, 44, 50]);
  fillRect(pixels, 0, 170, SCREEN_W, 2, [90, 80, 80]);

  // The ending, a line at a time, then what the run took.
  const shown = Math.min(ENDING.length, Math.floor(finaleTime / ENDING_LINE_GAP) + 1);
  for (let n = 0; n < shown; n++) drawTextCentred(pixels, ENDING[n], 14 + n * 10, n === ENDING.length - 1 ? HUD_GREEN : [235, 225, 210], 1);
  if (finaleTime > ENDING.length * ENDING_LINE_GAP) {
    const stats = [
      `TIME          ${clockText(run.time)}`,
      `DESTROYED     ${run.kills}`,
      `ROUNDS FIRED  ${run.shots}`,
      `ACCURACY      ${accuracyText(run.shots, run.hits)}`,
      `SUIT FAILURES ${run.failures}`,
    ];
    stats.forEach((line, n) => drawText(pixels, line, 100, 78 + n * 9, HUD_GREEN, 1));
  }
  // A beat later, the grade: the letter big, and what it makes you.
  if (finaleTime > ENDING.length * ENDING_LINE_GAP + 1) {
    const rating = runRating();
    drawText(pixels, 'RATING', 100, 131, HUD_GREEN, 1);
    drawText(pixels, rating.grade, 156, 125, TITLE_GOLD, 3);
    drawText(pixels, rating.title, 172, 131, TITLE_GOLD, 1);
    drawTextCentred(pixels, 'THE END', 150, TITLE_GOLD, 2);
  }
  if (finaleTime > ENDING.length * ENDING_LINE_GAP + 2 && Math.floor(performance.now() / 600) % 2 === 0) {
    drawTextCentred(pixels, 'PRESS ENTER', 182, HUD_GREEN, 1);
  }
}
