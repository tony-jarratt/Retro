'use strict';

// The story campaign: seven encounters played in order, each with its own map, a fixed squad of named pilots, a fixed enemy, a briefing
// before and a debrief after. Nothing is saved: winning an encounter shows its ACCESS PHRASE, and typing that phrase on the story screen
// unlocks the next one (and every one before it). The words live here; CAMPAIGN.md has the story they come from.
// Pure logic and layout like menu.js (no drawing, no DOM), so it can be tested; render.js draws it, main.js wires it.

const STORY_DIFFICULTY = 'normal';   // the enemy's aim in the story (DIFFICULTIES[...].enemyToHit)
const BRIEF_LINE_MS = 1300;          // the briefing's lines fade in one after another, this far apart
const BRIEF_FADE_MS = 900;           // each over this long

// A squad member: a pilot's name and the mech they fly (the same spec shape as a mech bay build).
const storyPilot = (name, chassis, weapons, armour = 1) => ({ pilot: name, spec: { chassis, armour, sinks: 0, weapons } });
const storyEnemy = (chassis, weapons, armour = 1) => ({ chassis, armour, sinks: 0, weapons });

// ---------- the maps ----------
// The same letters as the free play maps (TERRAIN in data.js), plus the story's own: c concrete, C a container stack (cannot be entered or
// seen through), P a landing pad. A map's exit is every P hex on it.
const TOLLAN_ROWS = [
  'cccCCCCccCCCCcccCCCcccccccc',
  'cccCCCCccCCCCcccCCCcccRcccc',
  'ccccccccccRccccccccccRccccc',
  'CCcccCCCcccccCCCCcccccccccc',
  'CCcccCCCcc~~cCCCCcccccccPPP',
  'cccccRcccc~~ccccccCcccRcPPP',
  'cccccRccccc~ccccccCcccccPPP',
  'CCcccCCCCcccccCCCcccccRcccc',
  'CCcccCCCCccRccCCCcccccccccc',
  'cccccccccccccRccccccccccccc',
  'cccCCCccCCCCcccCCCCccRccccc',
  'cccCCCccCCCCcccCCCCcccccccc',
];

// Garnet depot, on a moon: dust and crater rims in the west, rock spires (peaks), the depot's yard of concrete and sheds in the east, the hangar
// (G) on the east edge. The three gun towers stand in the yard. Two repair bays (W): a safe one behind the spires on your side, and one by the
// hangar door, under the Bolt tower.
const GARNET_ROWS = [
  'ddddddMMddddddcccccBBcccc',
  'ddHHdddMddddcccccccBBcccc',
  'dHHddddddRddcccBccccccccc',
  'ddddRddddddcccBBcccccBccc',
  'ddddddMMddddcccccccccBcGG',
  'ddddWMMMdddccccccRcccccGG',
  'ddRddddddddcccBBcccccccGG',
  'dddddddRdddccccBcccBBcWGG',
  'ddHHddddddddcccccccBBcccc',
  'dddHHdddMMddcccRcccccccBc',
  'ddddddddMdddcccccBBcccccc',
  'dddddRddddddccccBBBcccccc',
];

// The Shale canyon: cliffs (peaks) along both sides with ledges (hills) under them, the shale floor, a creek, and the road the prison crawler
// follows from the west edge to the east (Q). A repair bay up on the north ledge.
const SHALE_ROWS = [
  'MMMMHHHMMMMMMMHHHMMMMMMMHHHMM',
  'MMHHHsHHMMMMHHssHHMMMMHHsHHMM',
  'MHHsssssHHMHHssWssHHMHHsssHHM',
  'HssRssssssHssssRssssHsssssssH',
  'sssssMsssssssQssssssMssssssss',
  'sssssssssQQQQsQQsQsssssssQQQQ',
  'QQQQQQQQQsssssssQsQQsQQQQssss',
  'ssssRsssssMsssssssssQssssssss',
  'HsssssHHssssssHHss~~sssHHsssH',
  'MHHssHHMHHssHHMMH~~ssHHMMHssM',
  'MMHHHMMMMHHHMMMMMHHHHMMMMHHMM',
  'MMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
];

// The crawler's road: the shortest way from `from` to `to` over road (Q) hexes only. A road that does not join up is a MapError.
function roadRoute(rows, from, to) {
  const map = makeMap('road', rows);
  const prev = new Map([[hexKey(from[0], from[1]), null]]);
  let ring = [from];
  while (ring.length && !prev.has(hexKey(to[0], to[1]))) {
    const next = [];
    for (const [c, r] of ring) for (const n of neighbours(map, c, r)) {
      const key = hexKey(n.c, n.r);
      if (map.tiles[n.r][n.c] !== 'Q' || prev.has(key)) continue;
      prev.set(key, [c, r]); next.push([n.c, n.r]);
    }
    ring = next;
  }
  if (!prev.has(hexKey(to[0], to[1]))) throw new MapError('road', `The road does not join ${hexKey(from[0], from[1])} to ${hexKey(to[0], to[1])}`);
  const route = [];
  for (let at = to; at; at = prev.get(hexKey(at[0], at[1]))) route.unshift(at);
  return route;
}

// ---------- the encounters ----------
// ready: false means the encounter is written but not built yet (the story screen says so). Everything a battle needs is on a ready one:
// map (rows, starts, facings), goal and roundLimit, squad, enemies, reserves ({ round, pos, facing, spec }: reinforcements), first (who moves first),
// for an escort: crawler ({ from, to, spec }: the prison crawler drives along the road from `from` to `to`; it is the player's, with no guns),
// and for a raid: towers ({ pos, spec }: gun towers, ids T1, T2...; they never move) and runner (the pilot who has to reach the hangar).
const CAMPAIGN = [
  {
    id: 'breakout', title: 'BREAKOUT', place: 'Tollan spaceport, the freight yard', ready: true,
    briefing: [
      'They found us at Tollan. Someone sold us for the price of a meal.',
      'The dropship is fueled, and the pad is four hundred metres of open yard away.',
      "Don't fight them. Run.",
    ],
    job: 'Get the whole squad onto the landing pad on the far side of the yard. The dropship leaves after round 10. More of them will come.',
    debrief: [
      'The dropship clears the atmosphere with rounds still rattling off the hull.',
      'VOSS counts heads twice. "Everyone here? Good. Now we need better iron."',
    ],
    phrase: 'ASHFALL',
    map: { name: 'TOLLAN FREIGHT YARD', rows: TOLLAN_ROWS, playerStarts: [[0, 5], [1, 5], [0, 6]], playerFacing: 2, enemyStarts: [[13, 5], [19, 9]], enemyFacing: 5 },
    goal: 'escape', roundLimit: 10, first: 'player',
    squad: [storyPilot('VOSS', 2, [2, 1, 0], 2), storyPilot('WREN', 1, [1, 1, 0], 2), storyPilot('OKAFOR', 2, [4, 0, 0], 2)],
    enemyName: 'TOLLAN COMPLIANCE',
    enemies: [storyEnemy(2, [2, 1, 0], 0), storyEnemy(1, [1, 1, 0], 0)], // yard guards, unarmoured. Tuned so that a squad that only runs (the AI) gets out 60% of the time
    reserves: [
      { round: 4, pos: [21, 11], facing: 0, spec: storyEnemy(3, [2, 4, 0]) },
      { round: 4, pos: [22, 0], facing: 3, spec: storyEnemy(2, [2, 0, 0]) },
    ],
  },
  {
    id: 'depot', title: 'THE DEPOT', place: 'Garnet depot, on the moon', ready: true,
    briefing: [
      "Garnet depot services the Consortium's heavy walkers. Three gun towers watch the yard.",
      'Take the towers down and OKAFOR can have a heavy running in ten minutes.',
      'She says five. She is lying, but not by much.',
    ],
    job: 'Destroy the three gun towers, then get OKAFOR into the hangar on the far side of the yard. If OKAFOR goes down, nobody else can start the heavy. 14 rounds.',
    debrief: [
      "A Warden walks out of the hangar with VOSS at the controls and the Consortium's paint still wet on it.",
      'OKAFOR is already under the next one, swearing at it.',
    ],
    phrase: 'IRONGATE',
    map: { name: 'GARNET DEPOT', rows: GARNET_ROWS, playerStarts: [[0, 4], [1, 5], [0, 6]], playerFacing: 2, enemyStarts: [[18, 2], [16, 7]], enemyFacing: 5 },
    goal: 'raid', roundLimit: 14, first: 'player', runner: 'OKAFOR',
    squad: [storyPilot('VOSS', 2, [2, 1, 0], 2), storyPilot('WREN', 1, [1, 1, 0], 2), storyPilot('OKAFOR', 2, [4, 0, 0], 2)],
    enemyName: 'GARNET GARRISON',
    enemies: [storyEnemy(2, [2, 0, 0], 0), storyEnemy(1, [1, 1, 0], 0)],
    towers: [ // two light guns and a Bolt by the hangar door. Tuned so that the AI playing your side wins about 55% (a garrison with a Bulwark won 0%)
      { pos: [13, 3], spec: storyEnemy(4, [1, 0, 0], 0) },
      { pos: [20, 5], spec: storyEnemy(4, [2, 0, 0], 0) },
      { pos: [17, 9], spec: storyEnemy(4, [1, 0, 0], 0) },
    ],
  },
  {
    id: 'column', title: 'THE COLUMN', place: 'The Shale canyon', ready: true,
    briefing: [
      'Three hundred Republic soldiers are being moved through the Shale canyon. The order calls it a redeployment of surplus labour.',
      'We have stopped the column and opened the doors. Now we walk them out.',
      'Keep the crawler moving. Anything on the road stops it, theirs or ours.',
    ],
    job: 'Get the prison crawler to the east end of the canyon road. It drives itself and cannot fight. If it is destroyed, or still in the canyon after round 14, the mission fails. Their reserve will come up the canyon to meet it.',
    debrief: [
      'The crawler grinds out of the canyon mouth with its doors hanging open and three hundred people walking beside it.',
      'Among them, a colonel named HALE asks for a mech and a map. "You want to hurt them? I know where they keep the Model."',
    ],
    phrase: 'OPEN DOORS',
    map: { name: 'THE SHALE CANYON', rows: SHALE_ROWS, playerStarts: [[1, 4], [2, 7], [0, 5]], playerFacing: 2, enemyStarts: [[8, 3], [11, 7]], enemyFacing: 5 },
    goal: 'escort', roundLimit: 14, first: 'player',
    crawler: { from: [0, 6], to: [28, 5], spec: storyEnemy(6, [0, 0, 0], 2) }, // a Monolith hull with no guns: big and easy to hit. Tuned with the escort and the reserve so the AI playing your side wins about 55% (armour 3 won 100%)
    squad: [storyPilot('VOSS', 5, [2, 4, 0], 2), storyPilot('WREN', 1, [1, 1, 0], 2), storyPilot('OKAFOR', 2, [4, 0, 0], 2)],
    enemyName: 'THE COLUMN ESCORT',
    enemies: [storyEnemy(2, [2, 0, 0], 1), storyEnemy(2, [7, 0, 0], 1)],
    reserves: [
      { round: 3, pos: [28, 3], facing: 5, spec: storyEnemy(3, [2, 4, 0], 1) },
      { round: 3, pos: [28, 7], facing: 5, spec: storyEnemy(1, [1, 1, 0], 0) },
    ],
  },
  { id: 'dead-ground', title: 'DEAD GROUND', place: 'The salt marsh', ready: false, phrase: 'SALT MARSH' },
  { id: 'lab', title: 'THE LAB', place: 'The Vantor research compound', ready: false, phrase: 'FIRST LIGHT' },
  { id: 'partner', title: 'THE PARTNER', place: "Partner Calloway's estate", ready: false, phrase: 'NO TERMS' },
  { id: 'core', title: 'THE CORE', place: 'Halcyon', ready: false, phrase: null }, // the last one has no phrase: there is nothing after it
];

function encounterById(id) {
  const e = CAMPAIGN.find(x => x.id === id);
  if (!e) throw new BuildError('encounter', `There is no story encounter "${id}" (they are ${CAMPAIGN.map(x => x.id).join(', ')})`);
  return e;
}

// ---------- access phrases ----------
// People type these, so case, spaces and punctuation do not matter: "open doors", "OPENDOORS" and "Open-Doors" are the same phrase.
function normalisePhrase(text) { return String(text).toUpperCase().replace(/[^A-Z0-9]/g, ''); }

// How many encounters a phrase unlocks: encounter i's phrase opens encounter i + 1, so the count is i + 2. A phrase that opens nothing is a
// BuildError the story screen shows.
function phraseUnlocks(text) {
  const want = normalisePhrase(text);
  if (!want) throw new BuildError('phrase', 'Type the access phrase from the end of a mission.');
  const i = CAMPAIGN.findIndex(e => e.phrase && normalisePhrase(e.phrase) === want);
  if (i < 0) throw new BuildError('phrase', `"${String(text).trim()}" is not an access phrase.`);
  return i + 2;
}

// ---------- the battle ----------
// The scenario object newBattle wants, from an encounter's map: the exits are its landing pad hexes.
function encounterScenario(enc) {
  const hexesOf = letter => { const out = []; enc.map.rows.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === letter) out.push([c, r]); }); return out; };
  const pads = hexesOf('P'), hangar = hexesOf('G');
  if (enc.goal === 'escape' && !pads.length) throw new MapError('exit', `Encounter ${enc.id}: an escape map needs landing pad (P) hexes`);
  if (enc.goal === 'raid' && !hangar.length) throw new MapError('hangar', `Encounter ${enc.id}: a raid map needs hangar (G) hexes`);
  const route = enc.crawler ? roadRoute(enc.map.rows, enc.crawler.from, enc.crawler.to) : null;
  if (enc.goal === 'escort' && !route) throw new BuildError('crawler', `Encounter ${enc.id}: an escort needs a crawler`);
  const runner = enc.goal === 'raid' ? 'P' + (enc.squad.findIndex(m => m.pilot === enc.runner) + 1) : null;
  if (runner === 'P0') throw new BuildError('runner', `Encounter ${enc.id}: the runner ${enc.runner} is not in the squad`);
  return { id: enc.id, name: enc.map.name, rows: enc.map.rows, playerStarts: enc.map.playerStarts, enemyStarts: enc.map.enemyStarts,
    playerFacing: enc.map.playerFacing, enemyFacing: enc.map.enemyFacing, exits: { player: pads, enemy: [] },
    hangar, runner, targets: (enc.towers || []).map((t, i) => 'T' + (i + 1)),
    route, escort: route ? 'P' + (enc.squad.length + 1) : null };
}

// A new battle for an encounter: the squad gets its pilots' names, the reinforcements wait in state.reserves for their round.
function encounterBattle(enc, model = DEFAULT_DAMAGE_MODEL, first = enc.first) {
  if (!enc.ready) throw new BuildError('encounter', `${enc.title} is not built yet`);
  const enemyToHit = difficultyOf(STORY_DIFFICULTY).enemyToHit;
  for (const m of enc.squad) checkCapacity(m.spec);
  const scenario = encounterScenario(enc);
  const map = makeMap(scenario.name, scenario.rows);
  const towers = (enc.towers || []).map((t, i) => { // made before the battle so newBattle's checks (a free, open hex for everyone) cover them too
    if (!inMap(map, t.pos[0], t.pos[1]) || !isPassable(map, t.pos[0], t.pos[1])) throw new MapError('tower', `Encounter ${enc.id}: tower ${i + 1} stands at ${hexKey(t.pos[0], t.pos[1])}, which is off the map or cannot be stood on`);
    checkCapacity(t.spec);
    const m = makeMech(t.spec, { id: 'T' + (i + 1), side: 'enemy', pos: t.pos, facing: enc.map.enemyFacing, toHit: enemyToHit, model });
    m.tower = true; m.name = 'GUN TOWER';
    return m;
  });
  const extra = towers.slice();
  if (enc.crawler) { // the prison crawler: the player's, after the squad, at the start of its road
    checkCapacity(enc.crawler.spec);
    const m = makeMech(enc.crawler.spec, { id: scenario.escort, side: 'player', pos: scenario.route[0], facing: enc.map.playerFacing, toHit: PLAYER_TO_HIT, model });
    m.crawler = true; m.name = 'PRISON CRAWLER'; m.pilot = 'CRAWLER';
    extra.push(m);
  }
  const state = newBattle({ playerSpecs: enc.squad.map(m => m.spec), enemySpecs: enc.enemies, enemyToHit, first, model, scenario, goal: enc.goal });
  if (extra.length) state.mechs = makeState(state.map, state.mechs.concat(extra), first).mechs; // makeState refuses two mechs on one hex
  enc.squad.forEach((m, i) => { mechById(state, 'P' + (i + 1)).pilot = m.pilot; });
  state.objective.roundLimit = enc.roundLimit;
  state.enemyForce = enc.enemyName;
  state.encounterId = enc.id;
  state.reserves = (enc.reserves || []).map((r, i) => {
    if (!inMap(state.map, r.pos[0], r.pos[1]) || !isPassable(state.map, r.pos[0], r.pos[1])) throw new MapError('reserve', `Encounter ${enc.id}: reinforcement ${i + 1} arrives at ${hexKey(r.pos[0], r.pos[1])}, which is off the map or cannot be stood on`);
    checkCapacity(r.spec);
    return { round: r.round, mech: makeMech(r.spec, { id: 'E' + (enc.enemies.length + i + 1), side: 'enemy', pos: r.pos, facing: r.facing, toHit: enemyToHit, model }) };
  });
  return state;
}

// What the screen calls a mech: its pilot's name in the story, otherwise its id.
function callSign(mech) { return mech.pilot || mech.id; }

// The squad as the briefing lists it: "VOSS  JACKAL  BOLT, FLICKER".
function squadLines(enc) {
  return enc.squad.map(m => ({ pilot: m.pilot, chassis: chassisById(m.spec.chassis).name, weapons: m.spec.weapons.filter(id => id !== 0).map(id => weaponById(id).name).join(', ') }));
}

// ---------- the screens ----------
// The story screen: one row per encounter (an unlocked, built one can be played; a locked one shows only its number), then BACK and the
// phrase box. `unlocked` is how many encounters are open.
function storyButtons(unlocked) {
  const out = CAMPAIGN.map((e, i) => {
    const open = i < unlocked;
    const state = !open || !e.ready ? 'disabled' : 'normal';
    const tip = !open ? `Locked. The access phrase from the end of mission ${i} opens it.` : !e.ready ? `${e.title} is written but not built yet.` : `Play ${e.title} (ENTER plays the latest one open)`;
    return { id: 'mission:' + e.id, x: 160, y: 96 + i * 66, w: 704, h: 56, label: open ? e.title : '? ? ?', sub: open ? e.place : 'locked', number: i + 1, open, state, tip, action: { type: 'mission', id: e.id } };
  });
  out.push({ id: 'back', x: 16, y: 620, w: 140, h: 44, label: 'BACK', sub: '', state: 'normal', tip: 'Back to the title screen', action: { type: 'back' } });
  out.push({ id: 'phrase', x: 748, y: 616, w: 260, h: 52, label: 'ACCESS PHRASE', sub: 'type one to open a mission', state: 'normal', tip: 'Type the access phrase from the end of a mission to open the next one (P)', action: { type: 'phrase' } });
  return out;
}

// The encounter ENTER plays on the story screen: the latest one open that is built.
function latestPlayable(unlocked) {
  for (let i = Math.min(unlocked, CAMPAIGN.length) - 1; i >= 0; i--) if (CAMPAIGN[i].ready) return CAMPAIGN[i];
  return null;
}

function briefingButtons() {
  return [
    { id: 'back', x: 16, y: 620, w: 140, h: 44, label: 'BACK', sub: '', state: 'normal', tip: 'Back to the story screen', action: { type: 'story' } },
    { id: 'begin', x: 818, y: 616, w: 190, h: 52, label: 'BEGIN', sub: '', state: 'normal', tip: 'Start the mission (ENTER)', action: { type: 'begin' } },
  ];
}

function debriefButtons() {
  return [{ id: 'continue', x: 818, y: 616, w: 190, h: 52, label: 'CONTINUE', sub: '', state: 'normal', tip: 'On to the story screen (ENTER)', action: { type: 'story' } }];
}

// How strongly briefing line `index` shows, `ms` after the briefing opened (0 to 1).
function briefingAlpha(index, ms) { return Math.max(0, Math.min(1, (ms - index * BRIEF_LINE_MS) / BRIEF_FADE_MS)); }
