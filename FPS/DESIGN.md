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
  after you.

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
| `K` | Security core | The objective. Several `K` cells are one core, 18 hits (blasts count). Doesn't fight back |
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

Levels live in `levels/` as data, one file each, in play order
(`levels/industrial.js`, `levels/lab.js`). Reaching the lift shows LEVEL
COMPLETE; Enter goes on to the next. Both are **test sandboxes** for now, not
designed levels. Play-testing: `index.html?playtest` opens a level chooser,
and L in a game goes back to it; `index.html?level=lab` jumps straight in.

Planned progression (each level teaches one thing on top of the last). The
exact order is still to settle: drones were planned for level 2, and the lab
is now the second sandbox.

1. **Industrial, first** — dumb walkers and scouts, turrets. Learn to tap for
   precision, dodge volleys, use cover and steam. No drones.
2. **Industrial, deeper** — drones arrive. Holding for automatic becomes
   essential; backing off while the gun spins up becomes a skill.
3. **Later** — smart robots mixed in, hives tied to cameras: stealth and
   target priority together.

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

**Stage 1 of the creatures is built** (`creatures.js`, art in
`creature-art.js`): **hearing** and the **lurcher**. The lab has creatures
only: no robots, cameras, tripwires or terminals (owner, 2026-11-05).

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
- **Creatures drop nothing** (so the lab has more ammo lying about), can't
  open doors, and are never smart.

Still to build: spitters and acid pools, larvae (they **bite** and come back,
rather than exploding) and breeding pods, things in the tanks, gas vents, and
the chamber's ending. The vents are still steam.

Levers for difficulty: how many robots, which types, how many smart; where
the cameras look; where repair kits sit (a kit just past a turret's line of
fire, on zero armour, is a real decision).

Every level: **destroy the core, then reach the lift**. The core is the
strategic target as well as the goal: it's the only thing that stops the
turrets and tripwires, so hitting it early makes the rest safer, but it
sets the whole facility on you.

Levels are stored as data and the game moves from one to the next. A level picks its
**theme** (floor, ceiling, lighting; map.js) and its **objective** (core or
chamber). Still to build: a per-level enemy roster and ambience (sound).

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
- **No music** yet.

## 9. Open ideas

- **Smart robots retreat and self-repair** — gives taking cover a purpose,
  and a choice: chase it into danger, or let it come back at full strength.
- Ammo types (the gun's coil colour is reserved for this).
- Rebalancing the sound mix (relative volumes).

---

## 10. Controls

Click to capture the mouse (Esc frees) · WASD move · ←/→ turn · click / ↑
fire (hold to spin up) · M map · V visor · C CRT · N sound · R restart ·
Enter next level (after LEVEL COMPLETE) · with `?playtest`: L level chooser.

---

## 11. Engine vs look and feel

How much of the code is general engine, and how much is this game's look?
(Line counts as of November 2026, ~6,100 lines in all.)

| | Share | Files | To make a different game (e.g. a dungeon crawler) |
|---|---|---|---|
| **Pure engine** | ~28% | `raycaster.js` (walls, floor/ceiling, see-through panels, decal blending), `sprites.js`, `lighting.js`, `reflections.js`, `pathfinding.js`, `doors.js`, `panels.js`, `player.js`, `main.js`, `debug.js` | Unchanged. Torches are flickering lamps; a portcullis is a door that slides up instead of sideways (a small change to `hitDoor`); iron bars are grates. |
| **Reusable systems, new content** | ~47% | `enemies.js`, `combat.js`, `explosions.js`, `steam.js`, `drones.js`, `security.js`, `decals.js`, `pickups.js`, `weapons.js`, `hud.js`, `filter.js`, `sound.js` | The mechanics carry over; the dressing changes. Robots → monsters (same chase/aim/turn behaviour); drones → a swarm of bats (same flocking); steam vents → flame jets; tripwires → pressure plates; cameras → magic wards; drum blasts → fireballs; decals → moss and cracked flagstones; sound keeps its engine, gets new recipes. |
| **Pure look and data** | ~25% | `textures.js` (every picture), `levels/*.js` (the levels), `visor.js` | Replaced: new art and a new layout. Since the art is generated in code, it's the same kind of work as before. |

A *Dungeon Master*-style game would add: grid movement with 90° turns (simpler
than free movement: snap to cell centres and slide between them), melee (a
short-reach version of `shotTarget`), a party with inventory and spells
(genuinely new systems: the biggest piece of work), and a darker palette for
the CRT filter.
