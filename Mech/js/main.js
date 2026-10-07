'use strict';

// The game loop, input and the round flow. A round is four steps, in this order (see roundPhases): the first side
// moves each of its mechs, the second side moves each of its mechs, the first side fires, the second side fires.
// The first side is rolled once from the seed and then swaps every round.
//   move   each mech in turn is highlighted. Yours: click a hex and it moves at once, there is nothing to confirm
//          (SPACE, ENTER or right-click = stay put). The computer's mechs move the same way, visibly, one at a time.
//   fire   yours: each weapon that has a target is asked about in turn (click an enemy to lock onto it, SPACE or
//          right-click to skip, ENTER to accept the suggestion), and when the last one is answered the whole side
//          fires as one volley. The computer fires its side the same way.
//   end    after both sides have fired: heat sinks, shutdowns and ammo explosions, then the win check.
//
// Test hooks (used for headless screenshots), as URL parameters:
//   ?seed=7              fix the random seed (the fight, and who goes first, is replayable from its seed)
//   ?keys=Space;click:4,3;hover:5,2;press:fight;Enter   press keys, click or hover hexes, or press a bay button by id, one after another; each waits for
//                        the animations to finish ("wait:1.5" pauses; key names are KeyboardEvent codes)
//   ?freezeMove=0.5 / ?freezeFire=0.9   stop the clock that long into a move or a volley (?freezeSide=player: only that side's volley)
//   ?dt=0.1              advance the game clock this much every frame (headless Chrome runs few frames)
//   ?turbo=300           run that many logic ticks per drawn frame (with ?dt=0.1: a whole fight in a few frames)
//   ?stopresult          stop the key script once the result screen is up
//   ?damage=locations    the advanced damage model (hit locations, lost limbs) instead of the armour pool
//   (none)               opens on the title screen: FREE PLAY (select a map and goal, then the mech bay) or STORY (the intro, then the campaign)
//   ?code=XXXX-...       opens straight on the mech bay with that squad; ?intro plays the story intro
//   ?map=urban&goal=flag the map (basin, urban, mountains) and win condition; the bay keeps these and ?code in the address
//   ?enemy=gunline       a fixed enemy force, by name or number (otherwise a random one each battle, shown in the mech bay)
//   ?fight               skip every menu and the mech bay and go straight to the battle (every other hook below needs this)
//   ?code=XXXX-XXXX-...  the squad code (see code.js): the bay opens with this squad (the bay keeps this parameter up to date,
//                        so reloading the page keeps your squad), and with ?fight it is the squad that fights
//   ?at=P1:6,4;E1:9,4   put mechs on these hexes at the start
//   ?smoke=8,5;10,3      start with a smoke cloud centred on each hex
//   ?difficulty=hard     easy, normal or hard (to see the other enemy squads before the mech bay exists)
//   ?title               show the clock and frame count at the top of the screen

// The bay opens with the squad from ?code=, or else one of these squads (each fits its difficulty's budget): at easy and
// normal a heavy Warden, a Jackal and a Skitter (118 credits); at hard, which has only 100, a Ranger, a Jackal and
// a Skitter (93).
const WARDEN_SQUAD = [
  { chassis: 5, armour: 1, sinks: 0, weapons: [2, 4, 0] },
  { chassis: 2, armour: 1, sinks: 0, weapons: [2, 0, 0] },
  { chassis: 1, armour: 1, sinks: 0, weapons: [1, 1, 0] },
];
const DEFAULT_SQUADS = {
  easy: WARDEN_SQUAD,
  normal: WARDEN_SQUAD,
  hard: [
    { chassis: 3, armour: 1, sinks: 0, weapons: [2, 4, 0] },
    { chassis: 2, armour: 1, sinks: 0, weapons: [2, 0, 0] },
    { chassis: 1, armour: 0, sinks: 0, weapons: [1, 0, 0] },
  ],
};
const DEFAULT_DIFFICULTY = 'normal';
const STEP_SECONDS = 0.3;           // how long one hex of movement takes on screen
const BANNER_SECONDS = 0.7;         // how long a new step's banner shows before its first mech acts
const AI_BEAT_SECONDS = 0.45;       // a short beat before each of the computer's mechs acts, so you can see which one
const AFTER_MOVE_SECONDS = 0.2;     // a pause after a mech has moved
const NOTHING_SECONDS = 0.9;        // how long to hold when a side has nothing to fire at
const FAST_FACTOR = 4;              // holding F plays the animations this much faster
const CAMERA_ZOOM = 1.2;            // how far the camera pushes in on a volley
const CAMERA_EASE = 4;              // how quickly it eases in and out
const LOG_MAX = 24;
const SCRIPT_GAP = 0.15;            // seconds between scripted key presses
const LOCK_LOST_TEXT = { 'target-dead': 'target destroyed', 'no-line-of-sight': 'no line of sight', 'out-of-range': 'out of range', 'too-close': 'too close' };

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const game = {
  state: null,
  lastIntent: {},         // mech id -> the goal line the computer last announced for it
  bay: null, bayHover: null, bayStatus: '', bayStatusBad: false, // the mech bay (bay.js)
  shown: null,            // a copy of the state taken before something resolves, which the animation updates as it goes
  mode: 'pause',          // intro, title, bay, move-ask, moving, pause, fire-ask, firing or result
  seed: 0, rng: null,
  steps: [], stepIndex: -1, // this round's four steps (roundPhases)
  todo: [],               // ids of the mechs still to move in the current move step
  active: null,           // the mech being asked about or acting (it gets the highlight)
  planner: null,          // the weapon questions for the player's fire step (fireplan.js)
  hover: null,
  anim: null,             // the move animation of one mech
  volley: null,           // the volley being played
  flash: new Map(),       // mech id -> clock time its hit flash ends
  log: [], result: null,
  status: '', failed: null, clock: 0, fast: false,
  pauseUntil: 0, pauseThen: null,
  camera: { zoom: 1, fx: VIEW_W / 2, fy: VIEW_H / 2 },
  script: [], scriptWait: 0, freezeMove: undefined, freezeFire: undefined,
};

// ---------- the intro and the title card ----------
// The title card's picture, loaded once at the start. A missing or broken file is reported (not hidden): the card falls back to hexes.
// It is drawn once onto a canvas of its own size, so an SVG with heavy filters is not rendered again every frame (and its own
// animation, which a canvas cannot show, is frozen at its first frame).
const titleImage = new Image();
let titleImageReady = false, titleCanvas = null;
titleImage.onload = () => {
  titleCanvas = document.createElement('canvas');
  titleCanvas.width = titleImage.naturalWidth; titleCanvas.height = titleImage.naturalHeight;
  titleCanvas.getContext('2d').drawImage(titleImage, 0, 0);
  titleImageReady = true;
};
titleImage.onerror = () => console.warn(`The title picture ${TITLE_IMAGE} could not be loaded (missing or not an image), so the title card shows plain hexes instead.`);
titleImage.src = TITLE_IMAGE;

function startIntro() {
  game.mode = 'intro';
  game.introT0 = game.clock;
}

function showTitle() { game.mode = 'title'; game.titleT0 = game.clock; game.titleFocus = 0; game.menuHover = null; }

// ---------- the menus: title, select (a map and a win condition), campaign placeholder ----------
function menuSelection() { // the map and win condition being chosen
  if (!game.menuSel) game.menuSel = newMenuSelection(game.scenarioId || DEFAULT_SCENARIO_ID, game.goal || DEFAULT_OBJECTIVE_ID);
  return game.menuSel;
}

function showSelect() { game.menuSel = null; menuSelection(); game.mode = 'select'; game.menuHover = null; game.menuStatus = ''; game.menuStatusBad = false; }
function showCampaign() { game.mode = 'campaign'; game.menuHover = null; }

function menuButtonList() {
  if (game.mode === 'title') return titleButtons(game.titleFocus);
  if (game.mode === 'select') return selectButtons(menuSelection());
  if (game.mode === 'campaign') return campaignButtons();
  throw new RulesError('menu', `There is no menu in mode "${game.mode}"`);
}
function inMenu() { return game.mode === 'title' || game.mode === 'select' || game.mode === 'campaign'; }

function continueToBay() {
  const sel = menuSelection();
  game.scenarioId = sel.map; game.goal = sel.goal;
  if (game.bay) { game.bay.scenarioId = sel.map; game.bay.goal = sel.goal; }
  openBay();
}

function menuClick(b) {
  if (b.state === 'disabled') { game.menuStatus = b.tip; game.menuStatusBad = true; return; }
  const type = b.action.type;
  if (type === 'play') showSelect();
  else if (type === 'story') startIntro();
  else if (type === 'back') showTitle();
  else if (type === 'continue') continueToBay();
  else { game.menuStatus = selectPress(menuSelection(), b); game.menuStatusBad = false; }
}

// ---------- the mech bay ----------
function openBay() {
  if (!game.bay) game.bay = newBay(game.squad || DEFAULT_SQUADS[game.difficulty || DEFAULT_DIFFICULTY] || WARDEN_SQUAD, game.difficulty || DEFAULT_DIFFICULTY);
  game.bay.scenarioId = game.scenarioId || DEFAULT_SCENARIO_ID; game.bay.goal = game.goal || DEFAULT_OBJECTIVE_ID;
  game.bay.enemyIndex = game.fixedEnemy && game.enemyIndex !== undefined ? game.enemyIndex : Math.floor(Math.random() * ENEMY_FORCES[game.bay.difficulty].length); // a fresh enemy each time the bay opens
  game.mode = 'bay';
  game.bayStatus = ''; game.bayStatusBad = false;
  game.shown = null; game.anim = null; game.volley = null; game.planner = null; game.active = null;
  game.camera = { zoom: 1, fx: VIEW_W / 2, fy: VIEW_H / 2 };
  syncUrl();
}

// The squad code lives in the page address (?code=...), so reloading the page keeps the squad. Only a legal squad has a code,
// so while the squad is illegal the address keeps the last good one.
function syncUrl() {
  const report = bayReport(game.bay);
  if (!report.code) return;
  const url = new URL(location.href);
  const same = url.searchParams.get('code') === report.code && url.searchParams.get('map') === game.bay.scenarioId && url.searchParams.get('goal') === game.bay.goal;
  if (same) return;
  url.searchParams.set('code', report.code);
  url.searchParams.set('map', game.bay.scenarioId); url.searchParams.set('goal', game.bay.goal);
  try { history.replaceState(null, '', url); } catch (err) { console.warn(`Could not put squad code ${report.code} in the address: ${err.message}`); }
}

function bayNote(text, bad) { game.bayStatus = text; game.bayStatusBad = !!bad; }

function bayChanged() { syncUrl(); }

function bayButtonList() { return bayButtons(game.bay); }

function bayRun(action) { // runs an action that may refuse with a BuildError or BuildCodeError, and says why on screen
  try { const note = action(); bayNote(note || '', false); bayChanged(); } catch (err) {
    if (err instanceof BuildError || err instanceof BuildCodeError) bayNote(err.message, true); else throw err;
  }
}

function startFight() {
  const report = bayReport(game.bay);
  if (report.problems.length) { bayNote(report.problems[0], true); return; }
  game.squad = baySquad(game.bay);
  game.difficulty = game.bay.difficulty;
  game.enemyIndex = game.bay.enemyIndex; // the enemy the bay showed is the one you fight
  newGame(undefined, true);
}

function bayClickButton(b) {
  if (b.state === 'disabled') { bayNote(b.tip, true); return; }
  const type = b.action.type;
  if (type === 'fight') startFight();
  else if (type === 'change') showSelect();
  else if (type === 'copy') {
    const code = bayReport(game.bay).code;
    navigator.clipboard.writeText(code).then(() => bayNote('Squad code copied.', false), err => bayNote(`The browser would not copy it (${err.message}). Select the code text instead: ${code}`, true));
  } else if (type === 'paste') {
    const code = bayReport(game.bay).code;
    const text = prompt('Type or paste a squad code:', code || ''); // a plain browser box: typing and pasting always work here
    if (text !== null) bayRun(() => { bayLoadCode(game.bay, text); return 'Squad loaded from the code.'; });
  } else bayRun(() => bayPress(game.bay, b));
}

function world() { return game.shown || game.state; } // what is on screen right now

// A new battle. With no seed it is a new fight against a new enemy force (picked at random) unless `keepEnemy` (the bay already showed you one);
// with a seed (a replay, or a test hook) it keeps the enemy force it had, or takes the one that seed picks.
function newGame(seed, keepEnemy) {
  game.seed = seed === undefined ? Math.floor(Math.random() * 0xffffffff) : seed;
  game.rng = new Rng(game.seed);
  const first = game.rng.int(2) === 0 ? 'player' : 'enemy';
  const difficulty = game.difficulty || DEFAULT_DIFFICULTY;
  if (!game.fixedEnemy && seed === undefined && !keepEnemy) game.enemyIndex = Math.floor(Math.random() * ENEMY_FORCES[difficulty].length);
  if (game.enemyIndex === undefined) game.enemyIndex = pickEnemyForce(difficulty, game.seed);
  game.state = battleFor(game.squad || DEFAULT_SQUADS[difficulty] || WARDEN_SQUAD, difficulty, first, game.damageModel || DEFAULT_DAMAGE_MODEL, SCENARIOS[game.scenarioId || DEFAULT_SCENARIO_ID], game.goal || DEFAULT_OBJECTIVE_ID, game.enemyIndex);
  for (const [id, c, r] of game.placements || []) mechById(game.state, id).pos = [c, r]; // the ?at= test hook
  for (const [c, r] of game.smokeHexes || []) addSmoke(game.state.map, smokeHexes(game.state.map, c, r), SMOKE_ROUNDS); // the ?smoke= test hook
  game.shown = null; game.anim = null; game.volley = null; game.planner = null; game.active = null;
  game.flash.clear(); game.result = null; game.log = []; game.logHeader = ''; game.pauseThen = null;
  game.moveEndsBattle = false; game.lastIntent = {};
  const goal = OBJECTIVES[game.state.objective.id]; // until the first combat the log panel says what the battle is for
  game.logHeader = 'GOAL: ' + goal.name;
  for (const line of wrapText(goal.blurb, 30)) game.log.push(line);
  if (goal.roundLimit) game.log.push(`Time limit: ${goal.roundLimit} rounds.`);
  fxReset();
  buildMapCanvas(game.state.map);
  startRound();
}

// Words wrapped to at most `width` characters a line, for text that is not drawn with a font to measure (the combat log).
function wrapText(text, width) {
  const out = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && (line + ' ' + word).length > width) { out.push(line); line = word; } else line = line ? line + ' ' + word : word;
  }
  if (line) out.push(line);
  return out;
}

// The log lines for what a goal's rules did (a flag picked up, dropped or captured, an exit reached, a hill point).
function logObjectiveEvents(events) {
  for (const e of events) {
    if (e.type === 'flag-taken') logLine(`${e.mechId} PICKS UP THE FLAG`);
    else if (e.type === 'flag-dropped') logLine(`${e.mechId} DROPS THE FLAG`);
    else if (e.type === 'flag-captured') logLine(`${e.mechId} CAPTURES THE FLAG`);
    else if (e.type === 'exit-reached') logLine(`${e.mechId} REACHES THE EXIT`);
    else if (e.type === 'score') logLine(`${sideName(e.side)} HOLD THE HILL: ${e.points}`);
  }
}

function logLine(text) { game.log.push(text); if (game.log.length > LOG_MAX) game.log.splice(0, game.log.length - LOG_MAX); } // oldest first

function debugNotes(notes) { for (const n of notes) console.debug('AI: ' + n); }

function pause(seconds, then) { game.mode = 'pause'; game.pauseUntil = game.clock + seconds; game.pauseThen = then; }

function sideName(side) { return side === 'player' ? 'YOU' : 'ENEMY'; }

// The combat log shows the last combat round: both sides' fire, in order, with what it did. It stays up through the movement
// phases and while you choose your targets, and starts afresh when the next combat round's first volley begins. Each side's
// fire gets a heading line (a line starting with '#').
function startCombatLog(side) {
  if (side === game.state.first) { // the first side to fire starts a new combat round
    game.log = [];
    game.logHeader = `ROUND ${game.state.round}: COMBAT`;
  }
  logLine(side === 'player' ? '#YOUR FIRE' : '#ENEMY FIRE');
}

// ---------- the round ----------
function startRound() {
  const state = game.state;
  game.steps = roundPhases(state.first);
  game.stepIndex = -1;
  nextStep();
}

function currentStep() { return game.steps[game.stepIndex]; }

function nextStep() {
  game.active = null;
  game.stepIndex += 1;
  if (game.stepIndex >= game.steps.length) { finishRound(); return; }
  const step = currentStep();
  game.status = `${step.side === 'player' ? 'Your' : 'Enemy'} ${step.kind === 'move' ? 'move' : 'fire'}.`;
  if (step.kind === 'move') {
    game.todo = livingMechs(game.state, step.side).map(m => m.id);
    pause(BANNER_SECONDS, nextMover);
  } else {
    pause(BANNER_SECONDS, beginFire);
  }
}

// ---------- moving ----------
function nextMover() {
  const state = game.state, step = currentStep();
  if (!game.todo.length) { nextStep(); return; }
  const id = game.todo.shift();
  const mech = mechById(state, id);
  game.active = id;
  if (step.side === 'player') {
    if (mech.shutdown || walkAllowance(mech) === 0) {
      logLine(`${id} cannot move: stays put`);
      moveMech(state, { mechId: id, mode: 'stand', path: [] });
      nextMover();
      return;
    }
    game.mode = 'move-ask';
    game.status = `${id}: where to?  CLICK a hex, or arrows + ENTER (SPACE = stay put)`;
  } else {
    game.status = `${id} is moving...`;
    pause(AI_BEAT_SECONDS, () => {
      const r = aiMoveFor(state, id);
      debugNotes([r.note]);
      if (r.intent && game.lastIntent[id] !== r.intent) logLine(r.intent); // say what the enemy is up to, when its job changes
      game.lastIntent[id] = r.intent || null;
      performMove(r.plan);
    });
  }
}

// What clicking [c, r] would do for the mech being asked: { mode, path } or null if it cannot be reached.
function moveTo(mech, reach, c, r) {
  const key = hexKey(c, r);
  if (key === hexKey(mech.pos[0], mech.pos[1])) return { mode: 'stand', path: [] };
  if (reach.walk.has(key)) return { mode: 'walk', path: pathTo(reach.walk, c, r) };
  if (reach.run.has(key)) return { mode: 'run', path: pathTo(reach.run, c, r) };
  return null;
}

function reachFor(mech) {
  return { walk: reachableFor(game.state, mech.id, 'walk'), run: reachableFor(game.state, mech.id, 'run') };
}

function mechAtHex(c, r) {
  return livingMechs(world()).find(m => m.pos[0] === c && m.pos[1] === r) || null;
}

// The range finder for a move: what it would cost, in movement and in heat, and what the heat would do.
function finderFor(mech, move) {
  if (move.mode === 'stand') return { mechId: mech.id, mode: 'stand', path: [], lines: [{ t: 'STAY PUT', style: 'title' }, { t: 'no heat from moving', style: 'dim' }] };
  const cost = pathCost(game.state.map, move.path), allowance = allowanceFor(mech, move.mode);
  const now = mech.heat, after = Math.min(HEAT_MAX, now + MOVE_HEAT[move.mode]);
  const before = heatStep({ heat: now }), next = heatStep({ heat: after });
  const lines = [
    { t: `${move.mode.toUpperCase()}  ${move.path.length} HEX${move.path.length > 1 ? 'ES' : ''}`, style: 'title' },
    { t: `movement ${cost} of ${allowance}`, style: 'dim' },
    { t: `HEAT ${now} -> ${after}`, style: 'big' },
  ];
  if (next.hit > before.hit) lines.push({ t: `heat ${next.at}: +${next.hit - before.hit} to hit`, style: 'warn' });
  if (next.move > before.move) lines.push({ t: `heat ${next.at}: ${next.move - before.move} less movement`, style: 'warn' });
  if (after >= COOKOFF_HEAT && now < COOKOFF_HEAT) lines.push({ t: `heat ${COOKOFF_HEAT}+: ammo can explode`, style: 'warn' });
  if (after >= HEAT_MAX) lines.push({ t: 'SHUTDOWN at the end of the round', style: 'warn' });
  lines.push({ t: `+${MOVED_HIT_MOD[move.mode]} to hit you, +${MOVED_HIT_MOD[move.mode]} on your shots`, style: 'dim' });
  return { mechId: mech.id, mode: move.mode, path: move.path, lines };
}

// Carry out a move now. A mech that goes nowhere takes no time; one that walks is animated hex by hex.
function performMove(plan) {
  const state = game.state;
  const before = cloneState(state);
  const wasAsking = game.mode === 'move-ask';
  const events = moveMech(state, plan); // throws PlanError for a plan the rules refuse; the loop shows it
  logObjectiveEvents(events);
  game.moveEndsBattle = finishIfOver(state); // a flag captured or an exit reached ends the battle once the mech has got there
  const steps = events.filter(e => e.type === 'step');
  if (!steps.length) { pause(wasAsking ? 0 : AI_BEAT_SECONDS, nextMover); return; } // (a mech that stands cannot end a battle)
  const mech = mechById(state, plan.mechId);
  game.shown = before;
  game.anim = { t0: game.clock, mechId: plan.mechId, steps, after: { pos: mech.pos.slice(), facing: mech.facing } };
  game.mode = 'moving';
  game.status = `${plan.mechId} ${plan.mode === 'run' ? 'runs' : 'walks'}...`;
}

// Where the moving mech is drawn while it animates: between the hexes of its current step.
function animPose(mech) {
  const anim = game.anim;
  if (!anim || mech.id !== anim.mechId) return null;
  const t = (game.clock - anim.t0) / STEP_SECONDS;
  const done = Math.min(anim.steps.length, Math.floor(t));
  if (done >= anim.steps.length) {
    const [x, y] = hexToScreen(anim.after.pos[0], anim.after.pos[1]);
    return { x, y, facing: anim.after.facing };
  }
  const s = anim.steps[done];
  const frac = Math.min(1, t - done);
  const [fx, fy] = hexToScreen(s.from[0], s.from[1]), [tx, ty] = hexToScreen(s.to[0], s.to[1]);
  return { x: fx + (tx - fx) * frac, y: fy + (ty - fy) * frac, facing: dirToward(s.from, s.to) };
}

function updateAnim() {
  const anim = game.anim;
  if (!anim || (game.clock - anim.t0) / STEP_SECONDS < anim.steps.length) return;
  game.anim = null;
  game.shown = null;
  if (game.moveEndsBattle) { game.moveEndsBattle = false; showResult(); return; }
  pause(AFTER_MOVE_SECONDS, nextMover);
}

// ---------- firing ----------
function lockText(q) {
  if (q.cursor !== q.suggestion.targetId) return '';
  if (q.suggestion.reason === 'locked') return 'LOCKED ON ' + q.suggestion.targetId;
  if (q.suggestion.reason === 'lost-lock-nearest') return 'LOCK LOST: ' + (LOCK_LOST_TEXT[q.suggestion.lockLost] || q.suggestion.lockLost);
  return '';
}

function questionStatus() {
  const q = plannerQuestion(game.planner);
  if (q.idle) return `${q.mechId} has no weapon that can fire.  K = SELF-DESTRUCT (hurts everything beside it), SPACE = carry on`;
  const suggestion = q.suggestion.reason === 'locked' ? `${q.cursor}, locked` : q.cursor;
  const who = weaponById(q.weaponId).smoke ? 'any mech (even your own)' : 'an enemy';
  const enter = q.cursor ? `ENTER = ${suggestion}, ` : ''; // smoke has no suggestion when no enemy is in range
  return `${q.mechId} ${q.name}: which target?  CLICK ${who} (${enter}SPACE = skip, K = self-destruct)`;
}

function beginFire() {
  const step = currentStep(), state = game.state;
  if (step.side === 'player') {
    game.planner = newFirePlanner(state, 'player');
    if (plannerDone(game.planner)) {
      game.planner = null;
      startCombatLog('player');
      logLine('Nothing in range to fire at.');
      game.status = 'Nothing in range to fire at.';
      pause(NOTHING_SECONDS, nextStep);
      return;
    }
    game.mode = 'fire-ask';
    afterFireAnswer();
  } else {
    const r = aiPlanFire(state, step.side);
    debugNotes(r.notes);
    if (!r.shots.length) { startCombatLog(step.side); logLine('Enemy: nothing to fire.'); game.status = 'The enemy has nothing to fire at.'; pause(NOTHING_SECONDS, nextStep); return; }
    startVolley(r.shots);
  }
}

// After every answer (and at the start): either the weapons are all answered and the side fires, or the next
// question is put to the player.
function afterFireAnswer() {
  if (plannerDone(game.planner)) {
    const shots = plannerShots(game.planner);
    game.planner = null;
    game.active = null;
    if (!shots.length) { game.status = 'No weapon fired.'; startCombatLog('player'); logLine('You held your fire.'); pause(NOTHING_SECONDS, nextStep); return; }
    startVolley(shots);
    return;
  }
  game.active = plannerQuestion(game.planner).mechId;
  game.status = questionStatus();
}

function startVolley(shots) {
  const state = game.state;
  startCombatLog(currentStep().side); // this combat replaces the last one in the log
  game.shown = cloneState(state); // the copy takes the damage as shots land
  const events = resolveFirePhase(state, shots, game.rng);
  for (const m of game.shown.mechs) m.facing = mechById(state, m.id).facing; // they turn to their targets at once
  const data = buildVolley(events);
  game.volley = { data, t0: game.clock, projectiles: [], local: 0, end: data.duration, endEvents: events.filter(e => e.type === 'flag-dropped') };
  game.active = null;
  game.mode = 'firing';
  game.status = `${currentStep().side === 'player' ? 'You fire' : 'The enemy fires'}...`;
}

function missPoint(from, centre) { // where a shot that missed lands: wide of the target
  const dx = centre[0] - from[0], dy = centre[1] - from[1], len = Math.hypot(dx, dy) || 1;
  const side = Math.random() < 0.5 ? -1 : 1, off = rand(30, 44) * side * HEX_SCALE, past = rand(0, 16);
  return [centre[0] - dy / len * off + dx / len * past, centre[1] + dx / len * off + dy / len * past];
}

function startShot(shot) {
  shot.started = true;
  const w = world();
  if (shot.kind === 'blast') { // a self-destruct: no projectile, a big explosion on the bomber and a blast on each neighbour
    const [bx, by] = hexToScreen(...mechById(w, shot.mechId).pos);
    fxBoom(bx, by, 2.4, game.clock); fxShake(7);
    fxFloat(bx, by - 34, 'SELF-DESTRUCT', game.clock, '#ff7b6b');
    logLine(`${shot.mechId} SELF-DESTRUCTS`);
    shot.points = shot.packets.map(p => hexToScreen(...mechById(w, p.hit.targetId).pos));
    return;
  }
  const shooter = mechById(w, shot.mechId), target = mechById(w, shot.targetId);
  const def = weaponById(shot.weaponId);
  const from = muzzlePoint(shooter, shooter.weapons[shot.slot].loc);
  const centre = hexToScreen(target.pos[0], target.pos[1]);
  const salvo = !!def.missiles; // a rocket pod or a laser array: several missiles or beams
  fxFlash(from[0], from[1], shot.kind === 'missile' ? 9 : 14);
  fxShake(shot.kind === 'cannon' ? 1.5 : shot.kind === 'howitzer' ? 3 : 1);
  const count = salvo ? (shot.hit ? shot.packets.length : def.missiles) : 1;
  shot.points = [];
  for (let k = 0; k < count; k++) {
    const to = shot.hit ? [centre[0] + rand(-10, 10), centre[1] + rand(-10, 10)] : missPoint(from, centre);
    const ctrl = shot.kind === 'missile' || shot.kind === 'smoke' || shot.kind === 'howitzer' ? [(from[0] + to[0]) / 2 + rand(-30, 30), (from[1] + to[1]) / 2 - 80 - k * 6] : null;
    shot.points.push(to);
    game.volley.projectiles.push({ kind: shot.kind === 'smoke' || shot.kind === 'howitzer' ? 'missile' : shot.kind, t: shot.t0 + (salvo ? k * MISSILE_STAGGER : 0), dur: shot.flight, from, to, ctrl });
  }
  if (shot.hit && def.splash) { // the howitzer's splash lands on the neighbours: one point for every packet, the first being the shell itself
    shot.points = shot.packets.map((p, i) => (i === 0 ? shot.points[0] : hexToScreen(...mechById(w, p.hit.targetId).pos)));
  }
}

// The things that came with a hit: a location destroyed, a critical, a mech killed.
function playExtras(extras) {
  for (const x of extras) {
    if (x.type === 'destroyed') logLine(`${x.mechId} ${x.loc} DESTROYED`);
    if (x.type === 'critical') { // a critical hit: one of the target's weapons is knocked out for the rest of the fight
      const name = weaponById(x.weaponId).name;
      const [cx, cy] = hexToScreen(...mechById(game.shown, x.mechId).pos);
      fxBoom(cx, cy, 1.0, game.clock); fxShake(3);
      fxFloat(cx, cy - 30, `CRITICAL! ${name} OFFLINE`, game.clock, '#ffb347');
      logLine(`${x.mechId} CRITICAL: ${name} OFF`);
    }
    if (x.type === 'killed') {
      const [cx, cy] = hexToScreen(...mechById(game.shown, x.mechId).pos);
      fxBoom(cx, cy, 1.6, game.clock); fxShake(5);
      fxFloat(cx, cy - 24, 'DESTROYED', game.clock, '#ff7b6b');
      logLine(`${x.mechId} DESTROYED`);
    }
  }
}

function impactBlast(shot, packet) { // the blast reaches one mech (the last packet is the bomber itself)
  const hit = packet.hit;
  const [x, y] = shot.points[shot.packets.indexOf(packet)];
  applyDamageEvent(game.shown, hit);
  for (const e of packet.extras) applyDamageEvent(game.shown, e);
  fxBoom(x, y, 0.9, game.clock); fxShake(2);
  game.flash.set(hit.targetId, game.clock + 0.18);
  if (hit.targetId !== shot.mechId) {
    fxFloat(x, y - 12, hit.loc ? `${hit.loc} -${hit.damage}` : `-${hit.damage}`, game.clock);
    logLine(`${shot.mechId} BLAST>${hit.targetId} ${hit.loc ? hit.loc + ' ' : ''}-${hit.damage}`);
  }
  playExtras(packet.extras);
}

function impactSmoke(shot, smoke) { // the cloud appears where the rocket lands
  applyDamageEvent(game.shown, smoke);
  const [x, y] = hexToScreen(...mechById(game.shown, smoke.targetId).pos);
  for (let k = 0; k < 14; k++) fxPuff(x + rand(-50, 50), y + rand(-40, 40));
  fxFloat(x, y - 20, 'SMOKE', game.clock, '#c9d3dd');
  logLine(`${shot.mechId} ${weaponById(shot.weaponId).name}>${smoke.targetId} SMOKE ${smoke.rounds} rounds`);
}

function impact(shot, packet) {
  packet.done = true;
  if (packet.hit.type === 'smoke') { impactSmoke(shot, packet.hit); return; }
  if (shot.kind === 'blast' || packet.hit.blast) { impactBlast(shot, packet); return; } // a self-destruct, or a howitzer's splash
  const hit = packet.hit, def = weaponById(shot.weaponId);
  const to = shot.points[shot.packets.indexOf(packet)];
  const direct = shot.packets.filter(p => !p.hit.blast); // not counting a howitzer's splash on the neighbours
  if (!shot.logged) { // the shot's line goes in the log first, then what it did (a salvo's total is known from the start)
    shot.logged = true;
    const total = direct.reduce((n, p) => n + p.hit.damage, 0), heat = direct.reduce((n, p) => n + (p.hit.heat || 0), 0);
    logLine(describeShot(shot, def.missiles ? `${direct.length} hit -${total}` : `${hit.loc ? hit.loc + ' ' : ''}-${hit.damage}`));
    if (heat) logLine(`${shot.targetId} +${heat} HEAT`);
  }
  applyDamageEvent(game.shown, hit);
  for (const x of packet.extras) applyDamageEvent(game.shown, x);
  fxBoom(to[0], to[1], shot.kind === 'missile' ? 0.6 : shot.kind === 'cannon' ? 0.5 : shot.kind === 'howitzer' ? 1.5 : 0.7, game.clock);
  fxShake(shot.kind === 'howitzer' ? 4 : 1.5);
  game.flash.set(shot.targetId, game.clock + 0.18);
  if (shot.kind !== 'missile' && !def.missiles || shot.kind === 'howitzer') fxFloat(to[0], to[1] - 12, hit.loc ? `${hit.loc} -${hit.damage}` : `-${hit.damage}`, game.clock);
  playExtras(packet.extras);
  if (direct.every(p => p.done)) { // rockets heat their target: this is how they "disable" a mech
    const heat = direct.reduce((n, p) => n + (p.hit.heat || 0), 0);
    if (heat) {
      const [hx, hy] = hexToScreen(...mechById(game.shown, shot.targetId).pos);
      fxFloat(hx, hy - 36, `+${heat} HEAT`, game.clock, '#ffb347');
    }
  }
}

function miss(shot) {
  shot.missDone = true;
  const p = shot.points[0];
  fxFloat(p[0], p[1] - 8, `MISS ${describeRoll(shot)}`, game.clock, '#9fb2c8');
  fxSpark(p[0], p[1], 4, 90);
  logLine(describeShot(shot, 'MISS'));
  if (shot.jam) { // a fumble: the weapon jams for the next round
    applyDamageEvent(game.shown, shot.jam);
    const name = weaponById(shot.weaponId).name;
    const [sx, sy] = hexToScreen(...mechById(game.shown, shot.mechId).pos);
    fxFloat(sx, sy - 30, `FUMBLE! ${name} JAMS`, game.clock, '#ffb347');
    logLine(`${shot.mechId} FUMBLE: ${name} JAMMED`);
  }
}

function updateVolley() {
  const v = game.volley;
  v.local = game.clock - v.t0;
  const due = [];
  for (const shot of v.data.shots) {
    if (!shot.started && v.local >= shot.t0) startShot(shot);
    if (!shot.started) continue;
    if (shot.hit) {
      for (const packet of shot.packets) if (!packet.done && v.local >= packet.t) due.push({ shot, packet });
    } else if (!shot.missDone && v.local >= shot.missTime) {
      miss(shot);
    }
  }
  // impacts in time order, then the rules' order, because each hit's damage assumes the earlier ones landed
  due.sort((a, b) => a.packet.t - b.packet.t || a.packet.order - b.packet.order);
  for (const d of due) impact(d.shot, d.packet);
  if (v.local >= v.end) {
    logObjectiveEvents(v.endEvents);
    game.volley = null;
    game.shown = null;
    game.flash.clear();
    if (finishIfOver(game.state)) { showResult(); return; } // a volley can end the fight
    nextStep();
  }
}

// ---------- the end of a round ----------
function finishRound() {
  const state = game.state;
  const events = endRound(state, game.rng);
  for (const e of events) {
    if (e.type === 'shutdown') logLine(`${e.mechId} SHUT DOWN`);
    else if (e.type === 'restart') logLine(`${e.mechId} restarted`);
    else if (e.type === 'score' || e.type === 'flag-dropped') logObjectiveEvents([e]);
    else if (e.type === 'unjam') logLine(`${e.mechId} ${weaponById(e.weaponId).name} is clear again`);
    else if (e.type === 'cookoff') {
      logLine(`${e.mechId} AMMO EXPLODES`);
      const [x, y] = hexToScreen(...mechById(state, e.mechId).pos);
      fxBoom(x, y, 1.2, game.clock); fxShake(4);
    } else if (e.type === 'killed') logLine(`${e.mechId} DESTROYED`);
  }
  if (state.over) { showResult(); return; }
  startRound();
}

function showResult() {
  const state = game.state;
  const count = side => `${livingMechs(state, side).length} of ${state.mechs.filter(m => m.side === side).length}`;
  game.mode = 'result';
  game.active = null;
  game.result = {
    outcome: state.winner === 'player' ? 'VICTORY' : state.winner === 'enemy' ? 'DEFEAT' : 'DRAW',
    lines: [state.reason, `Fought for ${state.round} round${state.round === 1 ? '' : 's'}`, `Your mechs standing: ${count('player')}`, `Enemy mechs standing: ${count('enemy')}`, `Enemy force: ${state.enemyForce}   Seed ${game.seed}`],
  };
  game.status = '';
}

// ---------- input ----------
function mousePoint(e) {
  const box = canvas.getBoundingClientRect();
  return [(e.clientX - box.left) * canvas.width / box.width, (e.clientY - box.top) * canvas.height / box.height];
}

// The cursor is game.hover: the mouse sets it, and so do the arrow keys and WASD (one hex a press, starting from the
// highlighted mech). In the fire phase a mouse cursor resting on an enemy that is a valid target aims at it.
function aimAtCursor() {
  if (game.mode !== 'fire-ask' || !game.hover) return;
  const there = mechAtHex(game.hover[0], game.hover[1]);
  if (there && plannerSetCursor(game.planner, there.id)) game.status = questionStatus();
}
canvas.addEventListener('mousemove', e => {
  if (game.mode === 'intro') return;
  if (inMenu()) { const b = bayButtonAt(menuButtonList(), ...mousePoint(e)); game.menuHover = b ? b.id : null; return; }
  if (game.mode === 'bay') { const b = bayButtonAt(bayButtonList(), ...mousePoint(e)); game.bayHover = b ? b.id : null; return; }
  game.hover = screenToHex(game.state.map, ...mousePoint(e));
  game.cursorFor = null; // the next key press starts again from the highlighted mech
  aimAtCursor();
});
canvas.addEventListener('mouseleave', () => { game.hover = null; game.bayHover = null; });

canvas.addEventListener('click', e => {
  if (game.failed) return;
  if (game.mode === 'intro') { showCampaign(); return; }
  if (inMenu()) { const b = bayButtonAt(menuButtonList(), ...mousePoint(e)); if (b) menuClick(b); return; }
  if (game.mode === 'bay') { const b = bayButtonAt(bayButtonList(), ...mousePoint(e)); if (b) bayClickButton(b); return; }
  const hex = screenToHex(game.state.map, ...mousePoint(e));
  if (!hex) return;
  const there = mechAtHex(hex[0], hex[1]);
  if (game.mode === 'move-ask') {
    const mech = mechById(game.state, game.active);
    const move = moveTo(mech, reachFor(mech), hex[0], hex[1]);
    if (!move) { game.status = 'That hex is out of reach.  ' + game.status; return; }
    performMove({ mechId: mech.id, mode: move.mode, path: move.path });
  } else if (game.mode === 'fire-ask') {
    if (!there) return;
    const q = plannerQuestion(game.planner);
    if (!plannerLock(game.planner, there.id)) { game.status = q.idle ? questionStatus() : `${there.id} is not a valid target for ${q.name} (out of range, out of sight, or not an enemy).`; return; }
    afterFireAnswer();
  }
});

canvas.addEventListener('contextmenu', e => { // right-click = stay put / skip this weapon
  e.preventDefault();
  if (!game.failed && game.mode !== 'bay') stayOrSkip();
});

// K in the fire phase: the mech being asked about will blow itself up instead of firing
function selfDestruct() {
  const mech = plannerQuestion(game.planner).mechId;
  plannerDestruct(game.planner);
  logLine(`${mech} will SELF-DESTRUCT`);
  afterFireAnswer();
}

function stayOrSkip() {
  if (game.mode === 'move-ask') performMove({ mechId: game.active, mode: 'stand', path: [] });
  else if (game.mode === 'fire-ask') { plannerSkip(game.planner); afterFireAnswer(); }
}

// Arrow keys / WASD in the move phase (in the fire phase they step through the targets instead). Flat-top hexes have six neighbours and the keys four directions: up and down go straight, and
// left and right zig-zag (upper then lower neighbour) so that repeated presses run level across the map. The zig-zag
// picks whichever neighbour is nearer the row the cursor started the sweep on (game.cursorY).
const CURSOR_KEYS = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
const CURSOR_DIRS = { up: [0], down: [3], right: [1, 2], left: [5, 4] };

function moveCursor(key) {
  const map = game.state.map;
  const forThis = `${game.mode}:${game.active}`;
  if (!game.hover || game.cursorFor !== forThis) { // start from the highlighted mech
    const mech = mechById(game.state, game.active);
    game.hover = [mech.pos[0], mech.pos[1]];
    game.cursorY = hexToScreen(...game.hover)[1];
  }
  game.cursorFor = forThis;
  const [c, r] = game.hover;
  const options = CURSOR_DIRS[key].map(dir => neighbour(c, r, dir)).filter(([nc, nr]) => inMap(map, nc, nr));
  if (!options.length) return;
  options.sort((a, b) => Math.abs(hexToScreen(...a)[1] - game.cursorY) - Math.abs(hexToScreen(...b)[1] - game.cursorY));
  game.hover = options[0];
  if (key === 'up' || key === 'down') game.cursorY = hexToScreen(...game.hover)[1];
}

addEventListener('paste', e => { // Ctrl or Cmd + V in the bay loads a squad code
  if (game.failed || game.mode !== 'bay') return;
  e.preventDefault();
  const text = e.clipboardData ? e.clipboardData.getData('text') : '';
  bayRun(() => { bayLoadCode(game.bay, text); return 'Squad loaded from the clipboard.'; });
});

addEventListener('keydown', e => {
  if (game.failed) return;
  const modifierKey = e.code.startsWith('Meta') || e.code.startsWith('Control') || e.code.startsWith('Alt') || e.code.startsWith('Shift');
  if (game.mode === 'intro') { // any key skips the story intro to the next screen
    if (e.repeat || modifierKey) return;
    e.preventDefault(); showCampaign();
    return;
  }
  if (inMenu()) {
    if (e.repeat || modifierKey) return;
    if (game.mode === 'title') {
      if (e.code === 'Digit1' || e.code === 'Numpad1') showSelect();
      else if (e.code === 'Digit2' || e.code === 'Numpad2') startIntro();
      else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD' || e.code === 'Tab') game.titleFocus = 1 - game.titleFocus;
      else if (e.code === 'Enter' || e.code === 'Space') menuClick(titleButtons(game.titleFocus)[game.titleFocus]);
    } else if (game.mode === 'select') {
      if (e.code === 'Enter') continueToBay(); else if (e.code === 'Escape' || e.code === 'Backspace') showTitle();
    } else if (e.code === 'Enter' || e.code === 'Escape' || e.code === 'Backspace') showTitle();
    e.preventDefault();
    return;
  }
  if (game.mode === 'bay') { if (e.code === 'Enter') { e.preventDefault(); startFight(); } return; }
  if (CURSOR_KEYS[e.code] && game.mode === 'move-ask') { e.preventDefault(); moveCursor(CURSOR_KEYS[e.code]); return; }
  if (CURSOR_KEYS[e.code] && game.mode === 'fire-ask') { // you fire at mechs, not scenery: the keys step through the valid targets
    e.preventDefault();
    plannerCycle(game.planner, ['up', 'left'].includes(CURSOR_KEYS[e.code]) ? -1 : 1);
    game.hover = null; game.cursorFor = null;
    game.status = questionStatus();
    return;
  }
  if (e.code === 'KeyF') { game.fast = true; return; }
  if (e.code === 'KeyN') { newGame(); return; }
  if (e.code === 'KeyB') { openBay(); return; }
  if (e.code === 'KeyR') { newGame(game.seed); logLine(`Replaying seed ${game.seed}.`); return; }
  if (game.mode === 'result') { if (e.code === 'Enter') newGame(); else if (e.code === 'KeyM') showSelect(); return; }
  if (game.mode === 'move-ask') {
    if (e.code === 'Space' || e.code === 'Escape' || e.code === 'KeyX') { e.preventDefault(); stayOrSkip(); }
    else if (e.code === 'Enter') { // move to the cursor; with the cursor still on the mech itself, stay put
      e.preventDefault();
      const mech = mechById(game.state, game.active);
      const at = game.hover || mech.pos;
      const move = moveTo(mech, reachFor(mech), at[0], at[1]);
      if (!move) game.status = 'That hex is out of reach.  Move the cursor (arrows / WASD) or SPACE = stay put';
      else if (move.mode === 'stand') stayOrSkip();
      else performMove({ mechId: mech.id, mode: move.mode, path: move.path });
    } else if (e.code === 'Backspace') { e.preventDefault(); game.status = 'A move cannot be undone.  ' + game.status; }
  } else if (game.mode === 'fire-ask') {
    const p = game.planner;
    if (e.code === 'Space' || e.code === 'KeyX' || e.code === 'Escape') { e.preventDefault(); stayOrSkip(); }
    else if (e.code === 'Enter') {
      e.preventDefault();
      if (!plannerQuestion(p).cursor) { game.status = plannerQuestion(p).idle ? questionStatus() : 'No enemy in range to aim at.  Click a mech, or SPACE = skip'; return; }
      plannerAccept(p); afterFireAnswer();
    }
    else if (e.code === 'KeyK') { e.preventDefault(); selfDestruct(); }
    else if (e.code === 'Tab') { e.preventDefault(); plannerCycle(p, e.shiftKey ? -1 : 1); game.status = questionStatus(); }
    else if (e.code === 'Backspace') {
      e.preventDefault();
      if (plannerBack(p)) { game.active = plannerQuestion(p).mechId; game.status = questionStatus(); }
      else game.status = 'Nothing to undo.  ' + questionStatus();
    }
  }
});
addEventListener('keyup', e => { if (e.code === 'KeyF') game.fast = false; });

// ---------- the frame ----------
const HELP = {
  'move-ask': ['Click a hex to move the highlighted mech there; it moves at once.  Blue outline = walk range, orange outline = run range.',
    'ARROWS / WASD move the cursor, ENTER = move there (or stay, on your own hex)   SPACE / right-click = stay put   F = fast   N = new battle'],
  'fire-ask': ['Click an enemy to lock the highlighted weapon on it.  When the last weapon is answered, your side fires.',
    'SPACE / right-click = skip   ENTER = lock the aimed target   ARROWS / WASD / TAB = next target   K = self-destruct   BACKSPACE = undo'],
  busy: ['Hold F to speed up.   N = new battle   B = mech bay'],
  result: ['ENTER = new battle.   R = replay this seed.   B = edit your squad in the mech bay.   M = choose another map or goal.'],
};

function busy() { return game.mode === 'moving' || game.mode === 'firing' || game.mode === 'pause'; }

// Test hooks: "click:c,r" and "hover:c,r" act on a hex; anything else is a key code.
function runScript() {
  if (!game.script.length || busy() || game.clock < game.scriptWait) return;
  if (game.stopAtResult && game.mode === 'result') return;
  const token = game.script.shift();
  game.scriptWait = game.clock + SCRIPT_GAP;
  if (token.startsWith('wait:')) { game.scriptWait = game.clock + Number(token.slice(5)); return; }
  if (token.startsWith('press:')) { // a bay button by id, e.g. press:chassis:1:6 or press:fight
    const buttons = inMenu() ? menuButtonList() : bayButtonList();
    const b = buttons.find(x => x.id === token.slice(6));
    if (!b) throw new Error(`The key script asked for button "${token.slice(6)}", which does not exist in the ${game.mode} screen`);
    if (inMenu()) menuClick(b); else bayClickButton(b);
    return;
  }
  if (token.startsWith('click:') || token.startsWith('hover:')) {
    const [c, r] = token.slice(6).split(',').map(Number);
    const [x, y] = hexToScreen(c, r);
    const box = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new MouseEvent(token.startsWith('click:') ? 'click' : 'mousemove', { clientX: box.left + x * box.width / canvas.width, clientY: box.top + y * box.height / canvas.height }));
    return;
  }
  // 'go' is a test token: stay put in the move phase (SPACE), accept the suggestion in the fire phase (ENTER, or SPACE when there is none)
  const code = token === 'go' ? (game.mode === 'move-ask' || (game.mode === 'fire-ask' && !plannerQuestion(game.planner).cursor) ? 'Space' : 'Enter') : token;
  dispatchEvent(new KeyboardEvent('keydown', { code }));
}

function frozen() {
  if (game.anim && game.freezeMove !== undefined && game.clock - game.anim.t0 >= game.freezeMove) return true;
  if (game.volley && game.freezeFire !== undefined && game.clock - game.volley.t0 >= game.freezeFire && (!game.freezeSide || currentStep().side === game.freezeSide)) return true;
  return false;
}

function updateCamera(dt) {
  const want = { zoom: 1, fx: VIEW_W / 2, fy: VIEW_H / 2 };
  if (game.volley && game.volley.data.shots.length) {
    const w = world(), ids = new Set();
    for (const s of game.volley.data.shots) { ids.add(s.mechId); ids.add(s.targetId); }
    const pts = [...ids].map(id => hexToScreen(...mechById(w, id).pos));
    want.zoom = CAMERA_ZOOM;
    want.fx = pts.reduce((n, p) => n + p[0], 0) / pts.length;
    want.fy = pts.reduce((n, p) => n + p[1], 0) / pts.length;
  }
  const k = Math.min(1, dt * CAMERA_EASE), c = game.camera;
  c.zoom += (want.zoom - c.zoom) * k; c.fx += (want.fx - c.fx) * k; c.fy += (want.fy - c.fy) * k;
}

// One step of the game's logic, dt seconds long (0 while frozen for a screenshot).
function tick(dt) {
  game.clock += dt;
  if (game.mode === 'intro') {
    if (introFrame((game.clock - game.introT0) * 1000).phase === 'done') showCampaign();
    runScript(); return;
  }
  if (inMenu()) { runScript(); return; }
  if (game.mode === 'bay') { runScript(); return; }
  fxStep(dt);
  updateAnim();
  if (game.volley) updateVolley();
  if (game.mode === 'pause' && game.clock >= game.pauseUntil) { const then = game.pauseThen; game.pauseThen = null; then(); }
  runScript();
  updateCamera(dt);
  if (dt > 0) for (const m of world().mechs) if (!m.alive && Math.random() < 0.05) { const [x, y] = hexToScreen(...m.pos); fxPuff(x + rand(-10, 10), y + rand(-8, 8)); }
}

// What the move and weapon questions show: built from the planner and the mouse, every frame.
function questionView(view) {
  const state = game.state;
  if (game.mode === 'move-ask') {
    const mech = mechById(state, game.active);
    view.reach = reachFor(mech);
    view.heatGhost = mech.heat;
    if (game.hover) {
      const move = moveTo(mech, view.reach, game.hover[0], game.hover[1]);
      if (move) {
        view.finder = finderFor(mech, move);
        view.heatGhost = Math.min(HEAT_MAX, mech.heat + MOVE_HEAT[move.mode]);
      }
    }
  } else if (game.mode === 'fire-ask') {
    const q = plannerQuestion(game.planner);
    view.aim = plannerAimLines(game.planner, state);
    if (!q.idle) view.weapon = { mechId: q.mechId, slot: q.slot, name: q.name, splash: weaponById(q.weaponId).splash || 0, targetId: q.cursor, status: q.status, validIds: q.targets.map(t => t.targetId), lockText: lockText(q) };
    view.heatGhost = plannerHeat(game.planner, state, q.mechId, q.idle ? 0 : weaponById(q.weaponId).heat);
    view.destruct = Object.keys(game.planner.destruct); // mechs that have chosen to self-destruct
  }
}

function bannerFor() {
  if (game.mode === 'result') return { text: 'FINISHED', colour: COLOURS.dim };
  const step = currentStep();
  if (!step) return null;
  return { text: `${step.side === 'player' ? 'YOUR' : 'ENEMY'} ${step.kind === 'move' ? 'MOVE' : 'FIRE'}`, colour: step.side === 'player' ? COLOURS.player : COLOURS.enemy };
}

let lastTime = null;
function frame(t) {
  try {
    const raw = game.fixedDt !== undefined ? game.fixedDt : lastTime === null ? 0 : Math.min(0.05, (t - lastTime) / 1000);
    lastTime = t;
    const ticks = game.turbo || 1; // test hook: many ticks per drawn frame, to play a whole fight quickly
    for (let i = 0; i < ticks; i++) tick(frozen() ? 0 : raw * (game.fast ? FAST_FACTOR : 1));

    if (game.mode === 'intro' || inMenu()) {
      if (game.mode === 'title') drawTitleCard(ctx, game.clock - game.titleT0, titleImageReady ? titleCanvas : null, menuButtonList(), game.menuHover);
      else if (game.mode === 'select') drawSelect(ctx, { buttons: menuButtonList(), hover: game.menuHover, status: game.menuStatus, statusBad: game.menuStatusBad });
      else if (game.mode === 'campaign') drawCampaign(ctx, { buttons: menuButtonList(), hover: game.menuHover });
      else { const f = introFrame((game.clock - game.introT0) * 1000); if (f.phase === 'lines') drawIntro(ctx, f); else drawBlack(ctx); }
      requestAnimationFrame(frame);
      return;
    }
    if (game.mode === 'bay') {
      drawBay(ctx, { bay: game.bay, report: bayReport(game.bay), buttons: bayButtonList(), hover: game.bayHover, status: game.bayStatus, statusBad: game.bayStatusBad });
      requestAnimationFrame(frame);
      return;
    }
    const w = world();
    const view = {
      state: w, clock: game.clock, seed: game.seed,
      camera: { zoom: game.camera.zoom, fx: game.camera.fx, fy: game.camera.fy, sx: rand(-FX.shake, FX.shake), sy: rand(-FX.shake, FX.shake) },
      banner: bannerFor(), status: game.status, help: HELP[game.mode] || HELP.busy, log: game.log, logHeader: game.logHeader, result: game.result,
      active: game.active, reach: null, hover: game.hover, hoverMech: null, finder: null, heatGhost: null, aim: [], weapon: null,
      pose: game.anim ? animPose : null, flash: game.flash,
      volley: game.volley ? { local: game.volley.local, projectiles: game.volley.projectiles } : null,
      debug: game.debugTitle ? `${game.mode} t=${game.clock.toFixed(2)} frame ${game.frames = (game.frames || 0) + 1} script ${game.script.length}` : null,
      debug2: game.debugTitle ? w.mechs.map(x => `${x.id}@${x.pos[0]},${x.pos[1]}${x.alive ? '' : 'x'}`).join(' ') : null,
    };
    questionView(view);
    if (game.hover) view.hoverMech = mechAtHex(game.hover[0], game.hover[1]);
    drawFrame(ctx, view);
    requestAnimationFrame(frame);
  } catch (err) {
    showFailure(err); // never swallowed: on screen, in the console and in the page title
  }
}

function showFailure(err) {
  game.failed = err;
  console.error(err);
  document.title = 'ERROR ' + (err && err.message ? err.message : err);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(40,0,0,0.92)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#ffd0d0'; ctx.font = FONT; ctx.textAlign = 'left';
  ctx.fillText('Something went wrong:', 24, 48);
  ctx.fillText(`${err && err.name ? err.name : 'Error'}${err && err.kind ? ' (' + err.kind + ')' : ''}: ${err && err.message ? err.message : err}`, 24, 72);
  ctx.fillText('Reload the page to start again.', 24, 108);
}

function applyTestHooks() {
  const q = new URLSearchParams(location.search);
  game.skipBay = q.has('fight');
  if (q.get('map')) { if (!SCENARIOS[q.get('map')]) throw new BuildError('map', `Unknown map "${q.get('map')}" (the maps are ${SCENARIO_IDS.join(', ')})`); game.scenarioId = q.get('map'); }
  game.wantIntro = q.has('intro');
  game.wantBay = !!q.get('code'); // a squad code in the address means a reload: straight to the bay
  if (q.get('goal')) { if (!OBJECTIVES[q.get('goal')]) throw new BuildError('goal', `Unknown win condition "${q.get('goal')}" (they are ${OBJECTIVE_IDS.join(', ')})`); game.goal = q.get('goal'); }
  if (q.get('keys')) game.script = q.get('keys').split(';');
  game.debugTitle = q.has('title');
  if (q.get('dt')) game.fixedDt = Number(q.get('dt'));
  if (q.get('turbo')) game.turbo = Number(q.get('turbo'));
  game.stopAtResult = q.has('stopresult');
  if (q.get('damage')) game.damageModel = q.get('damage'); // pool (the simple game) or locations (the advanced game)
  if (q.get('code')) { const decoded = decodeSquad(q.get('code')); game.squad = decoded.mechs; game.difficulty = decoded.difficulty; } // play a squad code (a typed error is shown on screen)
  if (q.get('at')) game.placements = q.get('at').split(';').map(p => { const [id, hex] = p.split(':'); return [id, ...hex.split(',').map(Number)]; }); // start positions: ?at=P1:6,4;E1:9,4
  if (q.get('smoke')) game.smokeHexes = q.get('smoke').split(';').map(h => h.split(',').map(Number)); // clouds at the start: ?smoke=8,5;10,3
  if (q.get('difficulty')) game.difficulty = q.get('difficulty'); // easy, normal or hard (until the mech bay chooses)
  if (q.get('enemy')) { // an enemy force by number or by name (a test hook): ?enemy=2 or ?enemy=gunline
    const pool = ENEMY_FORCES[game.difficulty || DEFAULT_DIFFICULTY], want = q.get('enemy');
    const index = /^[0-9]+$/.test(want) ? Number(want) : pool.findIndex(f => f.name.toLowerCase() === want.toLowerCase());
    enemyForceOf(game.difficulty || DEFAULT_DIFFICULTY, index); // a typed error for an unknown one
    game.enemyIndex = index; game.fixedEnemy = true;
  }
  if (q.get('freezeMove')) game.freezeMove = Number(q.get('freezeMove'));
  if (q.get('freezeFire')) game.freezeFire = Number(q.get('freezeFire'));
  if (q.get('freezeSide')) game.freezeSide = q.get('freezeSide'); // with freezeFire: only freeze this side's volley (player or enemy)
}

try {
  const seedParam = new URLSearchParams(location.search).get('seed');
  applyTestHooks();
  if (game.skipBay) newGame(seedParam === null ? undefined : Number(seedParam));
  else if (game.wantIntro) startIntro();
  else if (game.wantBay) openBay();
  else showTitle();
  requestAnimationFrame(frame);
} catch (err) {
  showFailure(err);
}
