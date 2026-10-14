# Old Stones — design notes

A god game in the spirit of the 1989 original the owner loved: shape the land so your people can settle and
grow, while a rival god does the same.

## Decisions so far
- **The original's core, plus a twist of our own**, chosen after play-testing the prototype. Candidates: tides,
  visible battle odds, seasons.
- **Classic good vs evil gods.**
- **Amiga 16-colour look.** Everything is drawn into a 512x344 palette-indexed screen (`raster.js`) and shown
  at 2x, so no in-between colours can appear.
- **Square tiles, not hexes** (owner's choice for now). This keeps the faceted diamond look of the original.
- **Prototype first:** one map, raise and lower land, two tribes, manna, a simple rival god.
- **No trademark names in the game.** `inspiredBy` goes on the menu card only.

## The land
- **Grid:** 64x64 tiles, so 65x65 corner heights from 0 (sea) to 7. Each tile is drawn as two triangles split
  along its level NE-SW diagonal. Split the other way, hills looked like box corners.
- **The rule:** every corner is within one step of all 8 of its neighbours. Raising or lowering a corner pushes
  its neighbours along, and costs 1 manna per corner moved, so tall hills get expensive fast.
- **Refusals** (the edge, too high, the sea bed, no manna) are returned values, shown on the message line with
  a buzz.
- **Lighting:** light comes from the viewer's left, so slopes facing down-left are lit and slopes facing
  down-right are shaded. A faint grid on land lets you count squares of flat ground.

## Status
- **M1 (the land): built.**
  - Terrain, rendering, the map book (click to move the view), the cursor with raise/lower costs,
    scrolling by two-finger swipe / mouse wheel (shift + wheel sideways), arrows/WASD or clicking the book, and raising and lowering with a manna counter (no income yet).
  - P pauses. Lowering: right click, two-finger click, control-click or shift-click (for Mac trackpads).
  - Screen-edge scrolling was left out, because it fights with using the mouse to shape the land.
- **M2 (the people): built.**
  - Walkers wander towards flat ground and settle on a flat tile with no house within 2 squares.
  - A house's level (tent, hut, cottage, house, castle) comes from the flat ground at its height in the 5x5
    around it that is nearer to it than to any other house. Ties go to the older house.
  - Houses fill up and earn manna by level. A flag on a pole rises as the house fills.
  - A full house sends half its people out. Walkers move into their tribe's houses that have room, but never the
    house they just left.
  - Homeless walkers lose a tenth of their number every 6 s, so wandering crowds don't build up for ever.
  - Lowering land into the sea drowns walkers, and a house on ground that is no longer flat lets its people out.
  - Left alone, the starting island fills to about 9 houses (mostly huts and cottages) in 3 minutes and then
    stalls. More room has to come from the god flattening land, which is the point.
- **M3 (the rival): built, ready for the first play-test.**
  - **The dark god's tribe** (red) starts on the other island. A sea strait a few tiles wide runs between the
    islands.
  - **Fights:** rival walkers that come within 0.6 tiles fight. A side of strength a beats strength b with chance
    a/(a+b), and the winner loses half the loser's strength.
  - **Attacking houses:** a walker that reaches a rival house fights its people. If it wins, the house is razed;
    if it loses, the walker is gone and the house loses half the walker's strength.
  - **Senses:** walkers sense the other tribe 5 squares away and head for it.
  - **The dark god's land-shaping:** every 1.5 s it tries each corner round a few of its houses, both up and
    down, on a copy of the land, and makes the move that gains the most flat ground per manna.
  - **The bridge:** after 3 minutes, with 120 manna saved, it raises land across the sea towards your nearest
    house. Once the land joins, its bands of 10 or more marched on you from anywhere; that hidden march has been
    replaced by ley stones (below).
  - **Breaking your houses was tried and dropped:** the people walk out at full strength and resettle, so it
    helped you.
  - **Winning and losing:** the population tug-of-war bar shows the balance. A tribe with no houses and no
    walkers loses. Enter starts a new land and R replays the same one.
  - **Balance so far:** a player who does nothing loses in about 6–15 minutes. Dark god against dark god goes
    either way.
- **Rocks and trees: built.**
  - **Placement:** forests of round trees on the low ground, pines on ground of height 3 and up, and boulders
    mostly on the hills.
  - **Effect:** nobody can settle on a square with one, and it doesn't count as a house's flat ground.
  - **Clearing:** moving any corner of the square clears it, which costs the usual manna. The dark god clears
    land too, because it scores moves by flat ground gained.
  - **Map book:** they show in the book as dark green and grey dots.
- **Powers: built.**
  - **Arming and casting:** keys 1–4, or click a power's name in the panel, to arm it. The next click on the
    land casts it, and Esc cancels.
  - **Swamp (30):** bogs on up to 8 flat squares within 3. The first walker into each one sinks, and that
    fills it in.
  - **Quake (60):** 30 random raises and lowers within 3 squares, which break houses.
  - **Volcano (120):** a peak to full height with boulders on its slopes.
  - **Flood (250):** every corner above the sea drops one step.
  - **What you see:** the screen shakes, and the cursor shows the area of land the armed power will hit.
  - **The dark god:** after 3 minutes, with 160 manna, it casts a quake (on a cottage or bigger) or a swamp at
    your biggest house, at most every 40 s.
- **Mines and weapons: built** (owner's choice, so that flattening isn't the only thing that pays).
  - **Digging:** a hut or bigger with a boulder in its patch digs one mine in it, and the boulder becomes a
    pithead. The patch is the 5x5 tiles it is nearest to.
  - **Weapons:** a tribe's working mines set its weapons: clubs, then bronze at 1 mine (x1.3), iron at 3
    (x1.6) and steel at 6 (x2).
  - **Fights:** armed strength sets the odds of every fight, and the losses too.
  - **Abandoned mines:** a mine with no house near enough stops counting.
  - **Clearing:** moving the land under a mine fills it in. The dark god counts that as a cost, so it keeps its
    own rocks near its houses.
  - **On screen:** the panel shows each side's weapons and mine count, and armed walkers carry a blade
    coloured bronze, iron or steel.
- **Background music: built.** `js/music.js` has three chip tunes that loop: Old Stones (D dorian, 84 bpm,
  mysterious; the owner's favourite), Market Day (G major, 116 bpm, jaunty) and Green Hills (D major, 96 bpm,
  pastoral). Each game picks one at random.
  Each has a pulse lead, a harp arpeggio, a triangle bass and a soft drum, adapted from Elf's chip engine. The
  music sits under the sound effects. M toggles it, and it goes quiet when a game ends.
- **Charm and identity: built.**
  - **Name:** Old Stones, after the owner's favourite tune.
  - **Title screen:** two dark gods fight a demo war behind the title, while the camera drifts from house to
    house. A how-to card sits in front.
  - **Difficulty:** Gentle, Fair or Cruel (`DIFFICULTIES`). It sets the dark god's grace period, bridge and power
    thresholds, how often it uses powers, and its starting manna. Fair is the old numbers.
  - **Starting and ending:** Enter or a click begins. At the end, Enter returns to the title and R replays the
    same land.
  - **Fields:** each house's patch of farmland is drawn as crop fields with furrows.
  - **Life:** chimney smoke from cottages and up, foam washing on the shore, splashes when people drown or sink,
    dust and sparks where they fight, and a glowing, smoking crater with lava streams after a volcano.
  - **Inspect:** hovering over a house or walker shows a tag with what it is, its people or strength, and its
    weapons. On a dark one it also shows your nearest band's odds of winning, which is a cheap trial of the
    "visible odds" twist.
- **Sheep: built** (a nod to Powermonger). About 7 per island graze with their heads down, then amble a tile
  or two. The sea and swamps take them (with a last bleat and a splash). A lamb appears every 25 s while there
  are fewer than 16. They bleat now and then when in view, and hovering shows "A SHEEP. IT IS GRAZING." They are
  purely for charm and play no part in the rules.
- **Ley stones: built** (the owner's idea, refined together). This is how a god gathers its people and sends them
  somewhere without ever ordering them about.
  - **Raising:** power 5, STONE, costs 20 manna. Each click raises a stone at the end of your ley line, so the
    line is the order the stones were raised. Up to 6 stones. Shift-click takes one of yours down.
  - **The hearth:** your walkers within 5 squares of your first stone are drawn to it and merge into one waiting
    gathering. While gathering they don't settle and don't wear down. So a hearth near your villages turns their
    growth into an army; the trade-off is meant.
  - **Pilgrims:** at 20 strong (*tbd*) the gathering sets off along the line, carrying pennants. It finds its
    way over land by shortest path, so it uses any bridge, and waits at the shore if there's none. At the last
    stone it fights a foe within 5 squares, or settles a new village.
  - **Toppling:** a stone topples when a rival walker reaches it, when a quake or volcano covers it, or when the
    sea does. The line closes up behind a fallen waystone. If the hearth falls, the whole line falls with it
    (owner's call): every stone leaves a fallen head or arch, the gathering scatters, pilgrims become ordinary
    walkers, and the god starts a new line from scratch. Taking down your own hearth clears your whole line the
    same way, but leaves no rubble.
  - **The dark god** lays the same kind of line instead of the old hidden march. After the grace period it
    raises a hearth by its biggest house, bridges the strait, then places a waystone on its bridge and an end
    stone by your nearest house. It moves the end stone if your houses there are gone.
  - **The look:** your stones are Easter Island heads with a blue topknot; the dark god's are single Stonehenge
    arches with a red glow. The ley lines are beads of light in each god's colour, and each hearth shows its
    count, for example 12/20.
  - **Sounds:** a chime when a stone is raised, a horn when pilgrims set out, and a crash when a stone falls.
- **Campaign: built** (it replaces Gentle, Fair and Cruel). There are five fixed lands, `LANDS` in data.js:

  | Land | What's different | Powers |
  |---|---|---|
  | 1. The Green Isles | gentle, open | stones only |
  | 2. The Pinewoods | thick forest | + swamp |
  | 3. The Stony Shore | boulders everywhere, Fair rules | + quake |
  | 4. The Narrow Sea | thin strait, Cruel rules | + volcano |
  | 5. The Dark God's Home | it starts with two villages | + flood |

  - **What a land sets:** its map style (`MAP_STYLE` in terrain.js: island size, strait width, forests, rock),
    the dark god's rules, and which powers both gods have. Powers not yet earned show dark and are refused.
  - **Seeds:** chosen from ten tried, so that a player who does nothing lasts about: never falls, 9, 7, 7 and 5
    minutes (before god's reach; see below for after).
  - **Progress:** winning a land opens the next. It's remembered in localStorage (`oldstones.reached`), with a
    warning and a fresh start if storage is blocked.
  - **Title screen:** shows the land and what's new there; 1–5 replays a land you've reached.
- **Times, stars, ruins, the Call and ambience: built.**
  - **Times and stars:** a winning time per land, with stars: three at par or better (par 10, 12, 14, 15 and 18
    minutes, *tbd*), two within half as long again, one for any win. The best time per land is kept in
    localStorage (`oldstones.best`) and shown on the title card and the victory card ("NEW BEST"). A clock sits in
    the bottom-left corner during play.
  - **The Call of the Stones:** power 6, 500 manna, earned in land 5. It needs the two lands joined, and can be
    sounded once. Every house on both sides empties, and everyone marches to the chosen tile, under a column of
    light, for one last battle. Nobody settles or wears down on the way. The dark god sounds it when it is 1.5
    times your armed strength.
  - **Ruins:** a razed house leaves rubble, and a toppled stone leaves a fallen head or broken arch. These block
    building until the land is reshaped. A stone taken down by its own god leaves nothing.
  - **Ambient sound:** surf when the shore is in view, and birdsong over quiet land (not while pilgrims march or
    the Call is sounded).
  - **Power row:** names only now; the cost shows when a power is armed, and on the help card.
- **God's reach: built** (tied to the stones).
  - **The rule:** a god can shape land and cast powers only within 5 squares of its own houses and stones. The
    flood is exempt, since it covers the world anyway. Stones must be raised within reach too, so you reach across
    the sea by raising stones one beyond another.
  - **On screen:** land beyond your reach is veiled, and the panel says "BEYOND YOUR REACH" when you point there.
  - **The dark god** is bound the same way. It builds its bridge in hops, with a waystone wherever the gap is
    beyond its reach, then only adds stones nearer you. When it can get no nearer, its pilgrims fight or settle
    at the end stone, and their villages carry its reach on. It casts powers only on houses within its reach.
  - **Sandboxes:** test worlds without people have no limit (`reachRule`).
  - **Timings with reach and seasons** (after re-picking the Pinewoods and Narrow Sea maps): a passive player lasts
    14 / 9 / 6 / 5 / 3 minutes across the five lands.
  - **Stones:** placing a stone returns you to raise and lower (owner's preference); press 5 again for another.
- **Seasons, tips, and the frame: built.**
  - **Seasons:** a year of four 60-second seasons, starting in spring. Spring grows everything x1.5. Summer
    parches the lowest land (height 1: growth x0.5). Autumn is the harvest (manna x1.5). Winter snows in the high
    land (height 3+: no growth or manna; elsewhere growth x0.6) and wanderers wear twice as fast. On screen: snow
    on the high land, sandy parched lowlands, golden fields and turning trees, and a season icon in the panel.
    Test worlds without people have no seasons.
  - **Tips:** the first land only. Each tip shows once, the first time it matters (flattening, clearing, reach,
    raising a stone, laying a path, the seasons, the dark god's bridge), one at a time, in a gold box.
  - **Frame:** carved stonework round the screen with gold studs. The top panel has two tablets (manna, people
    and the tug of war; season, clock, land and weapons), a message line, and a row of power tablets. The keys
    sit on a bottom strip.
- **Bury or dig: built** (owner's idea). Raising a corner buries what stands on the four tiles round it. Lowering
  digs down, so boulders, mines and fallen stones stay while trees, rubble and bogs go; anything sunk into the sea
  is washed away. Building up clears land for farms but sits high (snowed in each winter); digging down keeps
  your mines (and weapons) but sits low (parched in summer, nearer the flood). Campaign timings after this, with
  the dark god's home moved to map 404: a passive player lasts about 20+ / 11 / 6 / 6 / 4 minutes.
- **On the arcade menu** (games.js) as "Old Stones", credited "inspired by Populous (1989)".
- **Known gaps:** both gods pile up unused manna later on, and you have no power to send your own people (a
  rally) yet.

## Test hooks
- `index.html?playtest`: all five lands open on the title screen, and saved progress is left alone. Atomic
  Castle and Elf use the same switch name.
- `tests/run-jsc.sh`: the rules checks.
- `index.html?seed=N`: another map.
- `index.html?manna=N`: more manna for trying things out.
- `index.html?still&cam=u,v&mx=..&my=..&shape=u,v,dir;...&ticks=N`: draws one frame, then sets the title to
  `STILL READY`.

## Numbers to tune (data.js)
| Number | Value |
|---|---|
| Starting manna | 40 |
| Cost per corner | 1 |
| Max height | 7 |
| View | 10x10 tiles |
| Growth / manna by level | `GROWTH`, `MANNA` in data.js |
| House spacing | 3 (`HOUSE_GAP`) |
| Homeless walkers | lose a tenth every 6 s (`WEAKEN_S`) |
| Dark god bridge | after 3 min, with 120 manna, 3 corners a turn |
| Ley stones | 20 manna each, up to 6; hearth pull 5 squares; pilgrims set out at 20 |
