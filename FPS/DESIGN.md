# FPS — Design

A 1980s-industrial first-person shooter on a hand-written raycaster. Plain
JavaScript, no build step, opens straight from `index.html`. Every texture and
sound is generated in code.

This file is the design: what the game is, what's in it, how the pieces
interact, and what's been decided. The code comments explain *how* each piece
works; this explains *what* and *why*.

---

## 1. The fiction

You are a person — a large one — inside an **armoured biomechanical suit**.
Not a mech: man-sized, armoured, augmented. What you see is not a visor but a
**camera feed on a display inside the helmet**, so when the suit takes
damage, the picture degrades: scanlines, a crushed palette, tearing, a failing
tube's colour split. When the suit dies, the display shuts down line by line
and shows **TERMINATED**.

The setting is an **industrial complex**, and each level is a section of it,
deeper in: first the **industrial sector** (riveted steel, hazard stripes,
rust, pipes, green-screen computers, sodium lamps, robots), then the **lab**
(see §7). The look is 80s cyberpunk / BattleTech, not modern.

## 2. Design rules

- **Every fight is a decision.** The best move should keep changing: tap or
  hold the trigger, which robot first, wait for the steam or go, push on or
  find a repair kit.
- **What you see is what happened.** Shots stray inside a visible cone rather
  than rolling hidden dice; robots telegraph their shots (visor glow, rising
  whine); steam visibly hides you.
- **Readable at a glance.** Smart robots carry a beacon and chevrons; the
  gun's coils show its spin-up; the ammo counter is on the gun.
- **Systems, not scripts.** Levels are built from objects whose rules
  interact (alarms, swarms, drums, steam), not one-off scripted moments.
- **Every level has the same arc:** fight through to the **security core**,
  destroy it, then **escape to the lift** while the whole facility comes
  after you. Two ways to destroy it: **shoot it** (18 hits: ammo and noise)
  or find the level's **demolition charge** and set it (time and nerve:
  2 s standing at the core, then 5 s to get clear). Shooting always works,
  so missing the charge never blocks a level. (charge.js)

---

## 3. The player

| | |
|---|---|
| **Armour** | 100, the only bar. Hits drain it. The hit that empties it leaves you alive but **SUIT BREACH**; any hit while breached kills. Only repair kits (+25) restore it. Nothing heals. |
| **Movement** | 3 cells/s, free movement, mouse or arrow keys to turn. |
| **Ammo** | One pool, starts at 12. Shown on the gun's red seven-segment counter. |
| **Visor damage** | Below 60 armour: scanlines. Below 40: palette crush and tearing. Below 20: colour split and flicker. (C forces the full CRT look.) |

### The gun

One pulse gun. You never switch it: it **spins up**.

| Stage | Reached by | Rounds | Accuracy |
|---|---|---|---|
| Single | pressing the trigger | 1 per press | near perfect |
| Burst | holding 0.5 s | 3 rounds, 0.07 s apart | each round wider |
| Automatic | holding 1.5 s | 8 a second | widest |

Letting go drops it back to single. **Modules** found in the level decide how
far it can spin up (burst module, auto module). **Low ammo** holds it back:
burst needs 3, auto needs 8. Walking widens every cone. Lit coils on the
barrel show the stage (count only — colour is reserved for a future ammo type).

---

## 4. The robots

| Type | Hits | Speed | Fights by | Notes |
|---|---|---|---|---|
| Walker | 4 | 1.5 | Stops within 3 cells, charges 1 s, 15 damage | The all-rounder |
| Scout | 2 | 3.0 | Rushes to 1.6 cells, quick 8-damage shots | |
| Heavy | 6 | 0.8 | Rockets from 6 cells (dodge sideways) | Shots in the back count double |
| Turret | 4 | — | 5-round volley, 6 damage each, 8-cell reach | Sleeps until a tripwire or a shot wakes it. Always dumb. |
| Drone | 1 | 2.6 | Weaves in and explodes (~9 damage) | Comes in packs or from hives |

- **All robots** swing round to face you when shot (~0.25 s).
- **Smart** walking robots (`smart: true`; beacon + chevrons, same stats):
  sidestep while charging, scouts zig-zag in, and **seeing you raises their
  zone's alarm** — they're walking cameras, so kill them first.
- Hit chance for robot guns falls with distance (e.g. a walker: 80% at 1
  cell, 30% at 3).
- **Smart robots retreat and repair** (`repair.js`, owner 2026-11-06): at
  half health or less (walker 2, scout 1, heavy 3 hits left) a smart robot
  breaks off for the nearest **repair bay** (`R`) it can reach by path,
  that's free and has repairs left. Tells: its beacon stops blinking and
  stays lit, sparks spit off its hull, and a falling two-note warble. On the
  way it ignores you (but still calls for help if it sees you), and being
  shot DOESN'T turn it round: a fleeing heavy shows you its back. Docked,
  it's welded back 1 hit a second (blue-white flicker and crackle), then
  goes back to where it last saw you. A bay has 3 repairs (one per docking,
  shown as its lamps) and one user at a time; shot out (4 hits) it explodes,
  which usually kills a robot docked in it. No bay reachable: it fights on.
  Choices: chase it, wreck the bay, ambush it there, or let it come back
  whole. The Hangar has three bays (depot, workshop, hangar hall); the
  server room's smart scout has none.

---

## 5. Objects

All placed in a level file (`levels/*.js`), using the cell characters in
`legend.js`. `map.js` picks the level and lays it out for the rest of the code.

### The grid (one character per cell)

| Char | Object | |
|---|---|---|
| `.` | Floor | |
| `#` `H` `P` | Walls: steel, hazard bulkhead, pipes | |
| `C` | Computer bank | Animated, green light |
| `T` | Security terminal | Walk up to it: its zone's **cameras** shut down for good (not tripwires or turrets) |
| `o`, `v` | HQ walls | Office wall; overgrown wall (the HQ's own pieces) |
| `K` | Security core | The objective. Several `K` cells are one core, 18 hits (blasts count), or one **demolition charge**. Doesn't fight back |
| `R` | Repair bay | Damaged smart robots dock here to be welded back to full. 3 repairs (amber lamps), 4 hits to wreck (it blows up: bad news for a robot docked in it). Needs floor on exactly one side |
| `L` | Exit lift | Red lamp until the core is down, then green: reach it to finish |
| `D` | Blast door | Opens on approach; may be locked (`LOCKED_DOORS`) |
| `W` | Wired glass | See through; stops bullets; cracks then shatters; never walkable |
| `=` | Steel grate | See and shoot through; not walkable |

### Placed lists

| List (in a level file) | Object | Behaviour |
|---|---|---|
| `SPRITES` | Drum | Shot: explodes (radius 2, up to 60). Chains to nearby drums. Kills drones, shatters glass, scorches. |
| | Strut | Solid cover |
| | Lamp | Light; can flicker |
| `CEILING_LIGHTS` | Strip light | Turns red and pulses in an alarm |
| `PICKUPS` | Ammo (+8), repair kit (+25 armour), red/blue keycard, burst module | Robots also drop clips (+4); the first heavy destroyed drops the auto module |
| `ZONES` | Security rectangle | Everything security-related belongs to a zone |
| `CAMERAS` | Sweeping camera | 7 cells, 50°, can be shot |
| `TRIPWIRES` | Laser across floor cells | Wakes the zone's turrets only (no alarm). Only the core going down disarms them: they're the obstacle to solve |
| `TERMINALS` | On a `T` cell | |
| `VENTS` | Steam vent | 3 s quiet / 0.7 s sputter / 2 s burst; `delay` staggers them |
| `DRONE_PACKS` | Hovering pack | Wakes when a drone sees you (7 cells) or on its zone's alarm |
| `HIVES` | Wall honeycomb (cell + face) | Releases its drones on its zone's alarm, once |
| `DECALS` | Signs, scorch, footprints, puddles | Visual only (puddles reflect); a rule-based scatter adds background wear |
| `ENEMIES` | Robots | `type`, position, facing, optional `smart` |
| `PLAYER_START` | | |

---

## 6. Events — what sets off what

| Trigger | Result |
|---|---|
| A camera or a smart robot sees you | Zone **alarm** (12 s, renewed while seen): red lights, siren; the zone's walking robots come for you; **packs wake, hives open** |
| A tripwire is broken | **Turrets in its zone wake** — nothing else: no alarm, no lights, no drones, the rest of the zone stays unaware |
| You reach a terminal | The zone's cameras go off for good and its alarm stops. Tripwires and turrets stay live |
| You shoot a robot | It turns to face you; idle ones chase; a sleeping turret wakes |
| A robot is destroyed | Drops a clip (first heavy: the auto module) |
| A drum is shot or caught in a blast | Explodes, chains, damages everything with a clear line, kills drones, shatters glass |
| A rocket hits anything | Blast, radius 1.5, up to 40 |
| A vent bursts | Hides you from robots, cameras and drones; scalds anyone inside |
| A window is shot | Cracks, then shatters; robots firing at you through it hit the glass |
| Armour reaches 0 | SUIT BREACH: the next hit kills |
| The core is destroyed | Every turret, camera and tripwire in the facility goes dead. A **facility-wide alarm** that never stops: every hive opens, every pack wakes, every robot comes. The lift unlocks |
| You stand at the core 2 s carrying the **charge** | It's **set** (silently; being hit doesn't stop you, walking away does). A 5 s fuse, beeping faster, that nothing stops. Then the core goes down in one and the biggest blast in the game goes off: within 1.5 cells of it you're **killed outright**, armour or not |
| You reach the lift (core down) | **LEVEL COMPLETE** |
| You reach the lift (core still up) | "LIFT LOCKED — DESTROY THE CORE" |

### What passes through what

| | Bodies | Sight | Light | Bullets |
|---|---|---|---|---|
| Wall / closed door | ✗ | ✗ | ✗ | ✗ |
| Glass | ✗ | ✓ | ✓ | ✗ until shattered |
| Grate | ✗ | ✓ | ✓ | ✓ |
| Steam burst | ✓ (scalds) | ✗ | ✓ | ✓ |

---

## 7. Levels

### The campaign: VERIDIAN (`campaign.js`, `lift.js`, `music.js`)

The game is called **VERIDIAN** (owner, 2026-11-05). You go in at the bottom
of the Veridian Group complex and fight your way UP: industrial sector
(sublevel 6), the lab (sublevel 3), the HQ (floor 12), then the roof.

- **Title** (`index.html` with no level): VERIDIAN over a slow turn of the
  first level, the premise, the title music. The first key wakes it (the
  browser allows sound only after one); then Enter begins.
- **Briefing**: each level opens on its floor, name, four lines of what
  you're walking into (`briefing` in the level file) and the objective.
- **The lift ride** (LEVEL COMPLETE, Enter): a freight lift's scissor gate,
  the shaft sliding down behind it, each floor passing as a lit landing with
  its number, the indicator counting up, the car humming and shaking, a
  chime on arrival. Then the next level loads. After the last level it goes
  on to the ROOF.
- **Finale**: dawn over the complex from its roof, the ending a line at a
  time ("...something is still growing"), and the run's numbers: time,
  destroyed, rounds fired, accuracy, suit failures, then a beat later a
  RATING: a grade and a title (S UNSTOPPABLE, A VETERAN, B OPERATIVE,
  C SURVIVOR, D SALVAGE). Enter: back to the title.
- **LEVEL COMPLETE** shows that attempt's tally: time, destroyed, accuracy.
- **Accuracy** = hits / rounds fired. A hit is a round that strikes something
  hostile or meant to be shot: a live enemy, a downed suit (finishing it),
  a camera, drone, larva, moth, the core, or a whole fuel drum. Windows,
  struts, walls and corpses don't count.
- **The rating** is kept HIDDEN on screen (owner's choice); only the grade
  shows. Out of 100: accuracy 40 (full at 50%), speed 35 (full at or under
  par = 6 min per level cleared, else par/time), survival 25 (−6 per suit
  failure). S ≥ 90, A ≥ 75, B ≥ 60, C ≥ 40, else D. Constants at the top of
  the rating in `campaign.js`; par is a guess to tune after play-testing.
- **The run's numbers** are kept between levels (each level is a page load)
  in sessionStorage. R after dying replays that level from its briefing,
  and counts a suit failure. Time, rounds and hits from a failed attempt
  stay in the run; kills only count when a level is cleared.
- "Levels completed" was considered and dropped: a run can only end at the
  finale, so it would always read 6/6.
- **Music**: 80s synth, generated (`music.js`): a step sequencer with a saw
  bass, detuned pads, arps with echo, a lead, a drum machine. Tracks: title
  (A minor, heroic), industrial (E minor, driving), lab (cold, a heartbeat),
  HQ (lush sevenths, the pads wavering out of tune), lift (lift music),
  finale (C major at last). Silence when you die; a flourish at LEVEL
  COMPLETE. U toggles it.
- **Your loadout carries up** (owner, 2026-11-05): the armour, ammo and gun
  modules you have at LEVEL COMPLETE go with you into the next level, and
  its briefing shows them. Keycards and the charge stay with their level.
  Die, and you replay the level with what you arrived with. A level picked
  from the play-test chooser starts with the usual kit.
  Arriving breached (armour 0) is possible: the answer is level design,
  not a top-up (owner): **every level's first room has armour and ammo**.

Levels live in `levels/` as data, one file each, in play order
(`levels/industrial.js`, `levels/lab.js`, `levels/hq.js`). Reaching the lift shows LEVEL
COMPLETE; Enter goes on to the next. All are **test sandboxes** for now, not
designed levels. Play-testing: `index.html?playtest` opens a level chooser,
and L in a game goes back to it; `index.html?level=lab` jumps straight in.

THE SIX LEVELS (owner, 2026-11-05: two per setting; the first of each pair
teaches that setting's rules gently with a simpler objective, the LIFT KEY;
the second combines them and ends in a core, chamber or plant). Each is a
journey in and a race back out: the lift is near the start, and the
objective sets the level on you. Every level's first room has armour and ammo.

1. **The Workshops** (sublevel 6, `levels/workshops.js`, lift key). Dumb
   walkers and scouts, steam, drums, a tripwire turret, the red keycard and
   the burst module. A lone walker with its back to you; a drum stack; a
   window that gets shot out; a tripwire you can walk round; the night shift
   asleep in the locker room, seen through a grille, and awake when you come
   back that way with the key. Secret: the paint store by the turret.
2. **The Hangar** (sublevel 5, `levels/industrial.js`, the core). Cameras and
   terminals, smart robots, heavies, drones and hives, red and blue keycards.
3. **Specimen Storage** (sublevel 4, `levels/storage.js`, lift key). Lurchers
   only, and darkness. A lit lurcher at the end of a corridor; a dark tank
   hall with three asleep; a drum between two tanks. The key breaks every
   tank: back through the hall, or the pitch-dark service passage.
4. **Genetics** (sublevel 3, `levels/lab.js`, the breeding chamber).
   Spitters, larvae and pods, tanks.
5. **The Offices** (floor 11, `levels/offices.js`, lift key). Suits and
   bloomers, and the sprinklers. A lone lit suit to shoot down and finish; an
   open plan with a solvent drum to set the sprinklers off from the door; a
   bloomer just inside a meeting room. Back through the meeting rooms, or
   west through the kitchen and print room.
6. **The Atrium** (floor 12, `levels/hq.js`, the mother plant). Moths and
   everything else.

All six are checked to be solvable: every key, the objective, the lift and
every pickup can be reached in order.

**The lift-key objective** (`objective: 'liftkey'`, core.js): no K cells, one
`liftkey` pickup (a gold card). The lift won't go without it; taking it raises
every zone's alarm for good and, on a creature level, sets the creatures loose
(every tank breaks). Unlike the core, the security stays on.

### The lab (planned)

Deeper in the complex, with its own look and its own enemies — genetically
modified creatures — built on the same systems:

- **Look:** stained white tiles, steel benches, green biohazard markings,
  cold flickering fluorescents, slime and acid decals, glowing reflective
  puddles. Steam vents become **toxic gas vents**.
- **Specimen tanks:** glass boxes with something inside, harmless until the
  glass breaks — a careless shot, or a robot firing at you through it.
- **Lurchers** (the walker's role): slow mutants that close in for a heavy
  melee swipe. Keep your distance.
- **Spitters** (the heavy's role): lob acid in a dodgeable arc; it leaves a
  burning puddle on the floor.
- **Larvae** (the drones' role): a scuttling swarm that leaps and chews;
  **breeding pods** on the walls (the hives' role) burst to release them.
- **Noise:** creatures don't watch cameras — they **hear**. Every shot alerts
  creatures within earshot (walls muffle it, as the sound engine already
  does), so an automatic burst brings everything in the area.
- **Objective:** the same arc — destroy the specimen reactor (or burn the
  breeding chamber), and the lab comes loose as you run for the lift.

Built so far: the lab's **look** (`theme: 'lab'`: tiled walls `t`, bench
cabinets `b`, vinyl floor, fluorescent ceiling panels, a colder green-tinged
ambient, slime spills that reflect like puddles, biohazard and warning
stencils) and its **objective**, the breeding chamber (`objective:
'chamber'`: the K cells become a viewport packed with pulsing green eggs; it
works exactly like the core underneath).

**The lab's creatures are built** (behaviour in `creatures.js`, `acid.js`,
`larvae.js`; art in `creature-art.js`). The lab has creatures only: no robots,
cameras, tripwires or terminals (owner, 2026-11-05).

- **Noise:** every round fired is a noise where you stand, carrying 4 cells
  (single), 6 (burst) or 9 (auto); explosions 12. A wall or closed door in
  the way halves it. A creature that hears goes to where the noise was.
  No noise readout on the visor: you judge it by ear and by what comes.
- **Sight needs light:** an unaware creature spots you at 5 cells if you're
  under a light, under 2 in the dark (your own muzzle flash counts). Once
  it's after you, it tracks you at 5 whatever the light.
- **Lurcher:** speed 1.3 (you do 3), 5 hits, 30 damage. In reach (1.6) it
  rears up for 0.6s (eyes flare, a rising screech), then lunges 1.4 cells
  in a straight line at where you were, then stands for 0.7s. Back off
  during the rear-up, or sidestep the lunge, and it misses.
- **Spitter:** frail (3 hits), keeps its distance (range 6) and charges for
  1.3s (its throat sac swells and glows, a rising gurgle), then lobs acid at
  where you're standing. A ring on the floor marks where it lands: move.
  The splash does 15; the POOL burns the cell for 6s (5 every 0.4s), and
  hurts creatures too (lure a lurcher through) and kills larvae. Its glands
  are on its back: hits there count double. Get within 2.5 and it backs
  off rather than fire, showing you its back. Acid eats through glass.
- **Larvae:** the drones' role, on the floor. 1 hit, speed 2.4. Close in,
  they LEAP and BITE (4), scuttle back for a second, and come again. Nests
  lie still until they see you (light again) or hear a noise.
  **Breeding pods** on the walls burst when a noise reaches them.
- **Specimen tanks** (tank glass `g`): two hold a sleeping creature. Break
  a pane (a stray shot, a blast, acid) and it's out; a broken pane is gone
  and the tank is open.
- **Gas vents:** the lab's vents blow green toxic gas: they burn like
  steam, but you can see through gas, so it hides nobody.
- **The lab comes loose:** burning the chamber breaks every tank, bursts
  every pod, turns the lights red, and from then on every creature always
  knows where you are.
- **Creatures drop nothing** (owner: it makes sense for robots, not
  creatures). The lab's ammo comes in big supply crates (`ammocrate`, +20),
  and the automatic module lies in the larvae's nest. They can't open doors
  and are never smart.

### The HQ (third theme, built)

The company's headquarters, where a **plant/fungal virus** got out of the
atrium garden and into the air conditioning (owner's idea: "zombies,
corporate suits who have succumbed to a virus", "botanical atmosphere").
Infected only: no robots (owner, 2026-11-05).

- **Look** (`theme: 'hq'`): office walls `o` (paint over wood panelling,
  ivy creeping up and down), overgrown walls `v` (the atrium's planters),
  carpet tiles going to moss with roots through them, office ceiling tiles
  with skylights where the lights are, warm green ambient and daylight,
  leaf litter, brass signage (VERIDIAN GROUP; GROW WITH US). Desks with
  green-screen terminals and potted plants (`desk`, `plant` sprites).
- **The suit** (`infected.js`, art in `infected-art.js`): a creature (hears,
  needs light, drops nothing). Speed 0.9, 3 hits. It **grabs**: in reach
  (0.8) it takes hold and squeezes 4 every 0.5s, and while anything holds
  you, you move at 40% speed. Shoot it and it lets go and staggers; or drag
  yourself away until it loses its grip (about a second against one).
  It **gets back up**: shot down it's only down, its pustules glowing, for
  6s (twitching for the last 1.5s), then rises in 1.2s with full health.
  **Finish it** on the floor: one shot into the body (the gun aims down at
  it) or a blast.
- **Objective: the mother plant** (`objective: 'motherplant'`): a wall of
  woven roots round a great pulsing bloom, a red tie hanging under it and a
  hand reaching out (the chief executive). Burning it sets the infected
  loose, as the chamber does the lab's creatures.
- **The bloomer** (stage 2; `infected.js`): an infected rooted where it
  stood, its head a great bud. Never moves. Come within 2.2 cells (with a
  clear line; it doesn't need light) and the bud swells and splits with
  light for 0.9s, then BURSTS: a **spore cloud** (`spores.js`), radius 1.6,
  for 6s. In it you take 3 every 0.5s and your visor tints green; nothing
  sees through it (it blocks sight like steam); the burst is a noise (6)
  that brings the suits. The bud regrows in 12s. 2 hits kill it, and it
  bursts as it dies, so shooting it from range sets its cloud off where
  you aren't (but the noise still carries).
- **Sprinklers** (stage 2; `sprinklers.js`, a level's `sprinklers`): the fire
  system still works. A blast within 5 cells, with a clear line, sets a
  head off, and every head it can see within 10 comes on too: one system
  per room. For 10s water rains down, the floor round each head ends up in
  puddles, and every bloomer within 2.5 of a running head is watered and
  FLOWERS at once. The HQ's chain reaction: shoot the solvent drums at the
  bottom of the atrium from the doorway, and its bloomers all go off while
  you're out of reach, but the blast brings every suit in earshot.
- **The pollinators** (stage 3; `pollinators.js`, a level's `moths`): the
  drones' role, in the air. Moths the infection has grown huge, glowing
  green eyespots on their wings. 1 hit each, speed 2.8. A pack CIRCLES a
  skylight until something brighter catches it: your MUZZLE FLASH (every
  round fired within 7 cells, in plain view) or you coming within 2.5.
  They don't hear: noise, spores and blasts round a corner leave them be.
  Swarming, they flutter from side to side and spread out; close in, one
  STINGS (3) and flutters back for 0.8s. Seven against a player who stands
  still: about 39 armour in 4s. Blasts kill them; burning the mother plant
  sets them all loose. HQ: 4 over the open-plan desks, 7 in the atrium
  (where the automatic module is), 5 over the boardroom.

Levers for difficulty: how many robots, which types, how many smart; where
the cameras look; where repair kits sit (a kit just past a turret's line of
fire, on zero armour, is a real decision).

Every level: **destroy the core, then reach the lift**. The core is the
strategic target as well as the goal: it's the only thing that stops the
turrets and tripwires, so hitting it early makes the rest safer, but it
sets the whole facility on you.

Levels are stored as data and the game moves from one to the next. A level picks its
**theme** (floor, ceiling, lighting; map.js: THEMES) and its **objective** (core,
chamber or mother plant). Still to build: a per-level enemy roster and ambience (sound).

---

## 8. Decided — and not doing (for now)

- **No looking up/down.**
- **Gun stays centred as it is.** Gauntlet, arm-cannon and off-centre
  versions were mocked up and rejected.
- **No separate health / med stims.** Armour is everything; the breach is the
  jeopardy.
- **No shootable steam valves** (tried, removed: cameras and drums already
  serve as stationary targets).
- **No robot taking cover** — hiding only makes sense if a robot can repair.
- **Turrets are never smart.**
- **Terminals don't touch tripwires or turrets** (too easy). Tripwires are a
  puzzle to get past; only the core silences them.
- **Tripwires don't raise the alarm**: they only wake turrets.
- **The core doesn't fight back** — it relies on its guards.

## 9. Open ideas

- **Next (agreed 2026-11-06), in order:**
  1. Lab creatures: wounded lurchers **feed on corpses** to heal (burn the
     bodies, or they're food); a **stalker** nearly invisible in the dark,
     seen properly only under light or your muzzle flash; lurchers that
     **hunt in pairs** (one rears up, the other flanks).
  2. **Spawn events**, both kinds: scripted, telegraphed ambushes (a trigger
     such as a room or the lift key; a hatch flashes and a klaxon sounds,
     then enemies drop in), and spawners you must kill (an industrial
     **fabricator** building robots; a lab **brood mother** birthing young).
- Ammo types (the gun's coil colour is reserved for this).
- Rebalancing the sound mix (relative volumes).

---

## 10. Controls

Click to capture the mouse (Esc frees) · WASD move · ←/→ turn · click / ↑
fire (hold to spin up) · N sound · U music · R restart (once you've died) ·
Enter carry on (title, briefing, LEVEL COMPLETE, finale) · P pause (shows
the controls; R and Enter aren't listed, the screens that use them say so;
the page itself has no help text) · with `?playtest` only: M map, V visor,
C CRT, L level chooser.

---

## 11. Engine vs look and feel

How much of the code is general engine, and how much is this game's look?
(Line counts as of November 2026, ~6,100 lines in all.)

| | Share | Files | To make a different game (e.g. a dungeon crawler) |
|---|---|---|---|
| **Pure engine** | ~28% | `raycaster.js` (walls, floor/ceiling, see-through panels, decal blending), `sprites.js`, `lighting.js`, `reflections.js`, `pathfinding.js`, `doors.js`, `panels.js`, `player.js`, `main.js`, `debug.js` | Unchanged. Torches are flickering lamps; a portcullis is a door that slides up instead of sideways (a small change to `hitDoor`); iron bars are grates. |
| **Reusable systems, new content** | ~47% | `enemies.js`, `combat.js`, `explosions.js`, `steam.js`, `drones.js`, `security.js`, `decals.js`, `pickups.js`, `weapons.js`, `hud.js`, `filter.js`, `sound.js` | The mechanics carry over; the dressing changes. Robots → monsters (same chase/aim/turn behaviour); drones → a swarm of bats (same flocking); steam vents → flame jets; tripwires → pressure plates; cameras → magic wards; drum blasts → fireballs; decals → moss and cracked flagstones; sound keeps its engine, gets new recipes. |
| **Pure look and data** | ~25% | `textures.js`, `robot-art.js`, `creature-art.js` (every picture), `levels/*.js` (the levels), `visor.js` | Replaced: new art and a new layout. Since the art is generated in code, it's the same kind of work as before. |

A *Dungeon Master*-style game would add: grid movement with 90° turns (simpler
than free movement: snap to cell centres and slide between them), melee (a
short-reach version of `shotTarget`), a party with inventory and spells
(genuinely new systems: the biggest piece of work), and a darker palette for
the CRT filter.
