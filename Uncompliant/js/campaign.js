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

// The salt marsh: salt flats, pools and channels of water (a lot of cooling), reeds that hide and slow you. The dropship sits on a dry bank (P)
// in the west; the turnaround team comes from the east, and more of them from the north and south edges.
const MARSH_ROWS = [
  'ffff~~~ff~~~~~fffffffrfff',
  'frrf~~~ff~~~~ffffff~rrrff',
  'frrff~fff~~~fffrr~~~rrrff',
  'fff~f~~rf~~fffrrff~~~~fff',
  'fff~~~~rr~~ffffff~~~~~~ff',
  'ffff~frrrffffrrfff~~~f~ff',
  'ff~ffPffffffrrrff~fffrfff',
  'f~~ffffffffffrfr~~~~ffrff',
  'ff~fffrrfffffff~~~~frrrff',
  'ffffffrrfrffrrf~~~~~fffff',
  'fffffffrffffrrff~~~ffrrff',
  'ffffffrfrffffffffffffrrff',
];

// The Vantor research compound: scrub and woods in the west with the extraction pad (P) on the edge, the compound's walls (buildings) with a
// gate on each side, lab blocks round the vault in the middle, and a repair bay just inside the west gate.
const VANTOR_ROWS = [
  '.T..TT....................R',
  '..T.......BBBBBBBBBBBBBBB..',
  '....T.....BcccccccccccccB.R',
  '......T...BccBBcccccBBccBR.',
  'P.........BccBcccccccBccB..',
  'P.........ccccccccccccccB..',
  'P......T..ccccccccccccccc..',
  'P.........BccBccccccccccc..',
  '..T.......BccBBccccccBccB..',
  '.....T....BcWcccccccBBccB.R',
  '.T........BBBBBBBBBBBBBBBR.',
  '...T..T....................',
];

// Partner Calloway's estate: open scrub below in the west with an ammo cache in the trees; a hill ringed by cliffs (peaks) with ONE way up, a road
// through the cliff in the south west; on top, a lawn, the house, garden trees, a south wall with a gap, and a second ammo cache by the ramp.
const ESTATE_ROWS = [
  '.............MMMMHHHHHHHH',
  '..TT.....R...MH...TT.....',
  '.....TT....T.MH...T......',
  '.T...........MH.....BB...',
  '.............MH.....BBB..',
  '........TT...MH..........',
  '...T....TA...MH..........',
  '.............MH.QA.....T.',
  '.R.....R.....MQQ.......T.',
  '....T.....T.QQH...TT.....',
  '..T..T.......MHHHBBBHBBBH',
  '.............MMMMMMMMMMMM',
];

// The core at Halcyon: the great hall in the west (polished floor, pillars, the three memory banks against the far wall), the outer wall with ONE
// gate (D), and the plaza in the east where the waves arrive.
const HALCYON_ROWS = [
  'kkkkkkkkkkkkkkkBccccccccc',
  'kkkkkkkkkkkkkkkBccRcccccc',
  'kkkkkBkkkBkkkkkBccccccRcc',
  'kkkkkkkkkkkkBkkBccccccccc',
  'kkkkkkkkkkkkkkkBcccccRccc',
  'kkkkkkkkkkkkkkkBccccccccc',
  'kkkkkkkkkkkkkkkDccccccccc',
  'kkkkkkkkkkkkkkkBcRccccccc',
  'kkkkkkkkkkkkBkkBccccccccc',
  'kkkkkBkkkBkkkkkBcccRccccc',
  'kkkkkkkkkkkkkkkBccccccRcc',
  'kkkkkkkkkkkkkkkBccccccccc',
];

// ---------- the encounters ----------
// ready: false means the encounter is written but not built yet (the story screen says so). Everything a battle needs is on a ready one:
// map (rows, starts, facings), goal and roundLimit, squad, enemies, reserves ({ round, pos, facing, spec }: reinforcements), first (who moves first),
// for the finale: banks ({ pos, spec }: the memory banks, ids B1, B2...; they never move or fire), gate (the one way in: the holder, chosen on the
// briefing from the squad, starts there and the other pilots take the map's starts in order) and debriefFallen (the ending if the holder fell;
// {HOLDER} is replaced by the name);
// for a hunt: markHome (the hex the mark, always the first enemy, keeps to);
// for a heist: crate (the hex it starts on; the extraction is the map's P hexes); an enemy spec may have a `name` (shown instead of its chassis);
// for a defence: protect ({ pos, spec, name }: what has to survive, one of the player's units that never moves or fires) and rounds (how long);
// weather: 'storm' draws rain over the map (looks only);
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
    job: 'Get the whole squad onto the landing pad on the far side of the yard. The dropship leaves after round 10, and it will not leave with fewer than two of you. More of them will come.',
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
  {
    id: 'dead-ground', title: 'DEAD GROUND', place: 'The salt marsh, in a storm', ready: true,
    briefing: [
      'The Consortium has brought in a turnaround team. They are sent when a problem has gone on too long.',
      'The dropship needs eight minutes of fuel, and the marsh is the only cover for a hundred kilometres.',
      'Their fast ones will go for the ship. Stay in the water: they run hot.',
    ],
    job: 'Keep the dropship standing until it has refuelled at the end of round 8. Their light mechs will go straight for it; the rest will come for you. Water cools you a lot; reeds hide you.',
    debrief: [
      'The dropship lifts out of the storm with the turnaround team still firing into the rain.',
      'HALE draws the core at Halcyon on a fogged window. "The banks only open to a partner\'s credentials. There is one partner on this side of the world, and a lab that builds what guards him."',
    ],
    phrase: 'SALT MARSH',
    map: { name: 'THE SALT MARSH', rows: MARSH_ROWS, playerStarts: [[3, 6], [7, 6], [5, 8]], playerFacing: 2, enemyStarts: [[24, 3], [24, 6], [24, 9]], enemyFacing: 5 },
    goal: 'defend', rounds: 8, first: 'player', weather: 'storm',
    protect: { pos: [5, 6], spec: storyEnemy(6, [0, 0, 0], 2), name: 'DROPSHIP' }, // a Monolith-sized hull, no guns. Tuned with the raiders so the AI playing your side wins about 72%: the breather of the story (very sensitive to when raiders arrive: the southern one a round later gives 92%)
    squad: [storyPilot('VOSS', 5, [2, 4, 0], 2), storyPilot('HALE', 4, [2, 7, 0], 2), storyPilot('WREN', 1, [1, 1, 0], 2)],
    enemyName: 'TURNAROUND TEAM',
    enemies: [storyEnemy(1, [2, 1, 0], 1), storyEnemy(3, [7, 2, 0], 1), storyEnemy(2, [3, 0, 0], 1)], // a Skitter and a Jackal (Scorcher) raid; the Ranger fights
    reserves: [
      { round: 2, pos: [8, 11], facing: 0, spec: storyEnemy(1, [2, 1, 0], 1) }, // an early raider from the south: the threat is not only from the east
      { round: 3, pos: [24, 0], facing: 4, spec: storyEnemy(4, [3, 2, 0], 1) },
      { round: 3, pos: [12, 11], facing: 0, spec: storyEnemy(1, [2, 1, 0], 1) },
      { round: 4, pos: [12, 0], facing: 3, spec: storyEnemy(1, [2, 1, 0], 1) },
      { round: 5, pos: [16, 0], facing: 3, spec: storyEnemy(2, [3, 0, 0], 1) },
    ],
  },
  {
    id: 'lab', title: 'THE LAB', place: 'The Vantor research compound', ready: true,
    briefing: [
      'The core is guarded by walkers we cannot match. The Vantor lab builds a gun that can.',
      'Take the prototype. Leave the staff.',
      'One of them has asked to come with us. HALE says no. OKAFOR says we need her.',
    ],
    job: 'Get into the compound, take the prototype crate from the vault and carry it back to the extraction pad. Whoever carries it cannot run, and everything they have will hunt the carrier. A carrier who goes down drops it. 14 rounds.',
    debrief: [
      'The crate holds a howitzer. SABLE, the analyst who asked to come, holds the manual, and admits she helped write the Model.',
      'She comes with us. Nobody sleeps near her.',
    ],
    phrase: 'FIRST LIGHT',
    map: { name: 'VANTOR RESEARCH COMPOUND', rows: VANTOR_ROWS, playerStarts: [[2, 4], [2, 6], [1, 5]], playerFacing: 2, enemyStarts: [[15, 2], [15, 9], [22, 6]], enemyFacing: 5 },
    goal: 'heist', roundLimit: 14, first: 'player', crate: [19, 6],
    squad: [storyPilot('HALE', 4, [2, 7, 0], 3), storyPilot('OKAFOR', 3, [4, 2, 0], 3), storyPilot('WREN', 1, [1, 1, 0], 3)],
    enemyName: 'VANTOR SECURITY',
    // two guards and the prototype walker with its laser array. Tuned so the AI playing your side wins about 53%: two security turrets as well
    // won 2%, and even one 18%, so there are none
    enemies: [storyEnemy(1, [1, 1, 0], 0), storyEnemy(2, [2, 0, 0], 0), { ...storyEnemy(5, [9, 2, 0], 0), name: 'PROTOTYPE' }],
    reserves: [ // the alarm: more come through the east gate
      { round: 5, pos: [26, 6], facing: 5, spec: storyEnemy(2, [2, 1, 0], 1) },
      { round: 5, pos: [26, 7], facing: 5, spec: storyEnemy(1, [1, 1, 0], 0) },
    ],
  },
  {
    id: 'partner', title: 'THE PARTNER', place: "Partner Calloway's estate", ready: true,
    briefing: [
      'Partner Calloway signed off the plan for three provinces, and he never leaves his estate.',
      'His credentials open the core. Bring him down and his guard will break.',
      'SABLE knows the estate. There is one road up. VOSS has the howitzer, and four shells.',
    ],
    job: "Destroy Calloway's mech, marked in red. Nothing else matters. He keeps to his house on the hill; there is one road up. The howitzer fires over walls but carries 4 shells: the ammo caches refill it. 14 rounds.",
    debrief: [
      'SABLE pulls the credentials from the wreck and hands them to VOSS without a word.',
      'WREN asks if that means she can be trusted now. Nobody answers.',
    ],
    phrase: 'NO TERMS',
    map: { name: "CALLOWAY'S ESTATE", rows: ESTATE_ROWS, playerStarts: [[0, 4], [1, 6], [0, 8]], playerFacing: 2, enemyStarts: [[21, 6], [17, 3], [18, 8]], enemyFacing: 4 },
    goal: 'hunt', roundLimit: 14, first: 'player', markHome: [21, 6],
    squad: [storyPilot('VOSS', 5, [10, 2, 0], 2), storyPilot('SABLE', 3, [2, 6, 0], 2), storyPilot('WREN', 1, [1, 1, 0], 2)],
    enemyName: "CALLOWAY'S GUARD",
    enemies: [{ ...storyEnemy(6, [9, 5, 0], 2), name: 'CALLOWAY' }, storyEnemy(4, [2, 4, 0], 1), storyEnemy(2, [2, 1, 0], 1)],
  },
  {
    id: 'core', title: 'THE CORE', place: 'Halcyon', ready: true, phrase: null, // the last one has no phrase: there is nothing after it
    briefing: [
      'This is the mission. The one we told ourselves about.',
      'Three banks. Every town, every mine, every one of us is written in them. There is one way into the hall, and someone has to hold it.',
      'Wipe the slate clean, and bring each other home.',
    ],
    job: 'Destroy the three memory banks. Whoever holds the doors starts in the gate, alone; while they stand there, nothing outside can get in. 12 rounds.',
    debrief: [
      'The banks go dark. Across the world, the Model asks for its next instruction and gets none.',
      '{HOLDER} walks out of the doors last, scorched black, and does not say a word for an hour. Then: "Is it done?" It is done. Everyone comes home.',
    ],
    debriefFallen: [
      'The banks go dark. Across the world, the Model asks for its next instruction and gets none.',
      'They find {HOLDER} in the doorway, still facing out. Nothing got past. The rest of them come home, and they bring {HOLDER} with them.',
    ],
    map: { name: 'THE CORE AT HALCYON', rows: HALCYON_ROWS, playerStarts: [[13, 5], [13, 7], [12, 6]], playerFacing: 5, enemyStarts: [[6, 5], [6, 7]], enemyFacing: 2 },
    goal: 'core', roundLimit: 12, first: 'player', gate: [15, 6],
    squad: [storyPilot('VOSS', 5, [10, 2, 0], 2), storyPilot('HALE', 4, [2, 7, 0], 2), storyPilot('WREN', 1, [1, 1, 0], 2), storyPilot('SABLE', 3, [2, 6, 0], 2)],
    enemyName: 'THE CORE GARRISON',
    // Tuned so the AI playing your side wins about 55% averaged over who holds the doors (VOSS 68%, HALE 56%, WREN 71%, SABLE 25%: the choice
    // matters), and the holder is still standing in only 10% to 32% of the wins. Armoured banks and guards, and a Warden in the waves, won under 10%.
    enemies: [storyEnemy(3, [2, 4, 0], 0), storyEnemy(2, [2, 1, 0], 0)], // the hall's own guard
    banks: [
      { pos: [3, 2], spec: storyEnemy(6, [0, 0, 0], 0) },
      { pos: [1, 6], spec: storyEnemy(6, [0, 0, 0], 0) },
      { pos: [3, 10], spec: storyEnemy(6, [0, 0, 0], 0) },
    ],
    reserves: [ // the waves, in the plaza
      { round: 3, pos: [24, 3], facing: 4, spec: storyEnemy(2, [2, 1, 0], 1) },
      { round: 3, pos: [24, 8], facing: 4, spec: storyEnemy(1, [1, 1, 0], 1) },
      { round: 5, pos: [24, 6], facing: 4, spec: storyEnemy(4, [2, 4, 0], 1) },
      { round: 5, pos: [20, 0], facing: 3, spec: storyEnemy(2, [7, 0, 0], 1) },
      { round: 7, pos: [24, 3], facing: 4, spec: storyEnemy(2, [2, 1, 0], 1) },
    ],
  },
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
function encounterScenario(enc, holder) {
  const hexesOf = letter => { const out = []; enc.map.rows.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === letter) out.push([c, r]); }); return out; };
  const pads = hexesOf('P'), hangar = hexesOf('G');
  if ((enc.goal === 'escape' || enc.goal === 'heist') && !pads.length) throw new MapError('exit', `Encounter ${enc.id}: an escape map needs landing pad (P) hexes`);
  if (enc.goal === 'raid' && !hangar.length) throw new MapError('hangar', `Encounter ${enc.id}: a raid map needs hangar (G) hexes`);
  const protect = enc.protect ? 'P' + (enc.squad.length + 1) : null;
  const route = enc.crawler ? roadRoute(enc.map.rows, enc.crawler.from, enc.crawler.to) : null;
  if (enc.goal === 'escort' && !route) throw new BuildError('crawler', `Encounter ${enc.id}: an escort needs a crawler`);
  const runner = enc.goal === 'raid' ? 'P' + (enc.squad.findIndex(m => m.pilot === enc.runner) + 1) : null;
  if (runner === 'P0') throw new BuildError('runner', `Encounter ${enc.id}: the runner ${enc.runner} is not in the squad`);
  let playerStarts = enc.map.playerStarts, holderId = null;
  if (enc.gate) { // the finale: the holder starts in the gate, the others take the starts in order
    const h = enc.squad.findIndex(m => m.pilot === holder);
    if (h < 0) throw new BuildError('holder', `Choose who holds the doors (one of ${enc.squad.map(m => m.pilot).join(', ')})`);
    let k = 0;
    playerStarts = enc.squad.map((m, i) => (i === h ? enc.gate : enc.map.playerStarts[k++]));
    holderId = 'P' + (h + 1);
  }
  return { id: enc.id, name: enc.map.name, rows: enc.map.rows, playerStarts, enemyStarts: enc.map.enemyStarts,
    playerFacing: enc.map.playerFacing, enemyFacing: enc.map.enemyFacing, exits: { player: pads, enemy: [] },
    hangar, runner, targets: enc.banks ? enc.banks.map((b, i) => 'B' + (i + 1)) : (enc.towers || []).map((t, i) => 'T' + (i + 1)),
    gate: enc.gate || null, holder: holderId,
    route, escort: route ? 'P' + (enc.squad.length + 1) : null, protect, rounds: enc.rounds || null,
    flag: enc.crate || null, bases: { player: pads, enemy: [] }, mark: enc.goal === 'hunt' ? 'E1' : null, markHome: enc.markHome || null };
}

// A new battle for an encounter: the squad gets its pilots' names, the reinforcements wait in state.reserves for their round.
function encounterBattle(enc, model = DEFAULT_DAMAGE_MODEL, first = enc.first, holder = null) {
  if (!enc.ready) throw new BuildError('encounter', `${enc.title} is not built yet`);
  const enemyToHit = difficultyOf(STORY_DIFFICULTY).enemyToHit;
  for (const m of enc.squad) checkCapacity(m.spec);
  const scenario = encounterScenario(enc, holder);
  const map = makeMap(scenario.name, scenario.rows);
  const towers = (enc.towers || []).map((t, i) => { // made before the battle so newBattle's checks (a free, open hex for everyone) cover them too
    if (!inMap(map, t.pos[0], t.pos[1]) || !isPassable(map, t.pos[0], t.pos[1])) throw new MapError('tower', `Encounter ${enc.id}: tower ${i + 1} stands at ${hexKey(t.pos[0], t.pos[1])}, which is off the map or cannot be stood on`);
    checkCapacity(t.spec);
    const m = makeMech(t.spec, { id: 'T' + (i + 1), side: 'enemy', pos: t.pos, facing: enc.map.enemyFacing, toHit: enemyToHit, model });
    m.tower = true; m.name = 'GUN TOWER';
    return m;
  });
  const extra = towers.slice();
  (enc.banks || []).forEach((b, i) => { // the finale's memory banks: the enemy's, never moving or firing
    if (!inMap(map, b.pos[0], b.pos[1]) || !isPassable(map, b.pos[0], b.pos[1])) throw new MapError('bank', `Encounter ${enc.id}: bank ${i + 1} stands at ${hexKey(b.pos[0], b.pos[1])}, which is off the map or cannot be stood on`);
    checkCapacity(b.spec);
    const m = makeMech(b.spec, { id: 'B' + (i + 1), side: 'enemy', pos: b.pos, facing: 2, toHit: enemyToHit, model });
    m.tower = true; m.bank = true; m.name = 'MEMORY BANK';
    extra.push(m);
  });
  if (enc.crawler) { // the prison crawler: the player's, after the squad, at the start of its road
    checkCapacity(enc.crawler.spec);
    const m = makeMech(enc.crawler.spec, { id: scenario.escort, side: 'player', pos: scenario.route[0], facing: enc.map.playerFacing, toHit: PLAYER_TO_HIT, model });
    m.crawler = true; m.name = 'PRISON CRAWLER'; m.pilot = 'CRAWLER';
    extra.push(m);
  }
  if (enc.protect) { // the thing to defend: the player's, after the squad; it never moves and has no guns (a tower that is ours)
    checkCapacity(enc.protect.spec);
    const m = makeMech(enc.protect.spec, { id: scenario.protect, side: 'player', pos: enc.protect.pos, facing: enc.map.playerFacing, toHit: PLAYER_TO_HIT, model });
    m.tower = true; m.ship = true; m.name = enc.protect.name; m.pilot = enc.protect.name;
    extra.push(m);
  }
  const state = newBattle({ playerSpecs: enc.squad.map(m => m.spec), enemySpecs: enc.enemies, enemyToHit, first, model, scenario, goal: enc.goal });
  state.weather = enc.weather || null;
  enc.enemies.forEach((spec, i) => { if (spec.name) mechById(state, 'E' + (i + 1)).name = spec.name; });
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

// The debrief's lines after a win: the finale has two endings, by whether the pilot who held the doors is still standing.
function debriefLines(enc, state) {
  const o = state.objective;
  if (!enc.debriefFallen || !o.holder) return enc.debrief;
  const h = mechById(state, o.holder);
  return (h.alive ? enc.debrief : enc.debriefFallen).map(line => line.split('{HOLDER}').join(h.pilot));
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

// The briefing's buttons. The finale asks who holds the doors first: a button per pilot (keys 1 to 4), and BEGIN waits for a choice.
function briefingButtons(enc, holder) {
  const out = [{ id: 'back', x: 16, y: 620, w: 140, h: 44, label: 'BACK', sub: '', state: 'normal', tip: 'Back to the story screen', action: { type: 'story' } }];
  const asks = !!(enc && enc.gate);
  if (asks) enc.squad.forEach((m, i) => out.push({ id: 'holder:' + m.pilot, x: 230 + i * 140, y: 616, w: 130, h: 52, label: m.pilot, sub: chassisById(m.spec.chassis).name,
    state: holder === m.pilot ? 'selected' : 'normal', tip: `${m.pilot} holds the doors (${i + 1})`, action: { type: 'holder', pilot: m.pilot } }));
  const ready = !asks || enc.squad.some(m => m.pilot === holder);
  out.push({ id: 'begin', x: 818, y: 616, w: 190, h: 52, label: 'BEGIN', sub: '', state: ready ? 'normal' : 'disabled', tip: ready ? 'Start the mission (ENTER)' : 'First choose who holds the doors', action: { type: 'begin' } });
  return out;
}

function debriefButtons() {
  return [{ id: 'continue', x: 818, y: 616, w: 190, h: 52, label: 'CONTINUE', sub: '', state: 'normal', tip: 'On to the story screen (ENTER)', action: { type: 'story' } }];
}

// How strongly briefing line `index` shows, `ms` after the briefing opened (0 to 1).
function briefingAlpha(index, ms) { return Math.max(0, Math.min(1, (ms - index * BRIEF_LINE_MS) / BRIEF_FADE_MS)); }
