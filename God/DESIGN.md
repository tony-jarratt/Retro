# Old Stones — design notes

A god game in the spirit of the 1989 original the owner loved: shape the land so your people can settle and
grow, while a rival god does the same. Not on the arcade menu until the prototype proves fun.

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
    house. Once the land joins, its bands of 10 or more march on you from anywhere.
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
- **Known gaps:** both gods pile up unused manna later on, and you have no power to send your own people (a
  rally) yet.

## Test hooks
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
| Marching | bands of 10+ once the land joins |
