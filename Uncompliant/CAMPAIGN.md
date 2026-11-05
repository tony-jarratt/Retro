# Uncompliant: the campaign (draft 2, 2026-10-25)

**Built:** all seven encounters are playable from STORY (2026-10-25), with the story screen, briefings, debriefs and access phrases. The text below is the plan they were built from; the code (`js/campaign.js`) has the final words.

**Something to fight over in every mission** (the owner, 2026-10-25: these "add strategy within a mission"). Each mission gets one contested map feature:
- 1 Breakout: the pad (and the gates the reinforcements come through).
- 2 The Depot: repair bays (3 charges, stand still to repair; the enemy uses them too).
- 3 The Column: the road itself (anything on it stops the crawler) and a repair bay on the ledge.
- 4 Dead Ground: the dropship (their lights go straight for it) and the water (a lot of cooling; their team runs hot).
- 5 The Lab: the crate (its carrier is slowed and hunted) and the compound's two gates, with a repair bay inside the west one.
- 6 The Partner: one road up the hill, and two ammo caches (the howitzer only carries 4 shells).
- 7 The Core: the gate. Whoever holds it keeps the waves out, and takes their fire.
- **Decided (2026-10-25): the sacrifice belongs to the finale**, where it is most emotional: one pilot holds the way in while the others go on, and the player chooses who.
- Ideas for the rest: a **resupply crate** for a mission that leans on missiles or the howitzer (6, The Partner, is the natural one); a **sacrifice**: one mech has to hold a tile to keep a route open while the others go on (the finale, "who stays behind", or Dead Ground); field repair caches in the marsh. Implementation notes are in DESIGN.md, Story campaign.

A fixed, linear story in seven encounters. No mech bay (free play is the sandbox), no damage carried over, no saving:
winning an encounter shows an **access phrase** that unlocks the next one from the STORY screen. Each encounter has its
own hand-made map, a fixed squad of named pilots, a fixed enemy, and a briefing and debrief in the intro's voice.
Everything below is a draft to rewrite together.

## The thread

The Consortium did not conquer the world, it **bought** it, and now it runs it the way a consultancy runs a client:
every town, mine and worker is a line in the **Model**, the plan held in the memory banks of the core at Halcyon.
The Model decides what is kept, what is merged and what is "rationalised". The Free Republics lost the war.
"Wipe the slate clean" is literal: erase the Model, and nobody is a line item any more.

The tone is cold, not comic. The Consortium speaks in calm corporate language and means every word of it; our
people quote it back with contempt. Line troops are **compliance** units, the hunter squads are **turnaround teams**,
commanders are **partners**. Use the jargon sparingly: one phrase in a briefing lands, three is a sketch show.
(All original; check against the trademark policy.)

## The pilots (fixed)

| Pilot | Who | First flies |
|---|---|---|
| **VOSS** | The old sergeant. Holds the remnant together. Dry, tired, never leaves anyone. | 1 |
| **WREN** | The youngest. Scout, fast, reckless. Her town was "rationalised" last spring. | 1 |
| **OKAFOR** | Engineer. Can start any mech ever built, and steal most of them. | 1 |
| **HALE** | A Republic colonel, freed from the prison column. Knows where the Model is kept. | 3 |
| **SABLE** | A Consortium analyst who defects at the lab. She helped build the Model. Nobody trusts her. | 5 |

---

## 1. BREAKOUT
**Map:** the freight yard at Tollan spaceport (container stacks as blocks, landing pads, rubble).
**Goal:** get the whole squad to the dropship pad (exit) by the end of round 10; at least two have to make it (fewer than two left alive and the mission is lost). **Enemy:** two unarmoured compliance lights; a Ranger and a Jackal arrive at the gates on round 4.
**Squad:** VOSS Jackal (Bolt, Flicker), WREN Skitter (Flicker, Flicker), OKAFOR Jackal (Rattler), all at armour 2.

> They found us at Tollan. Someone sold us for the price of a meal.
> The dropship is fueled, and the pad is four hundred metres of open yard away.
> Don't fight them. Run.

*Debrief:* The dropship clears the atmosphere with rounds still rattling off the hull. VOSS: "Everyone here? Good. Now we need better iron."
**Access phrase: ASHFALL**

## 2. THE DEPOT
**Map:** Garnet depot on a moon, a crater ringed with hills; three gun towers and a hangar.
**Repair bays:** two (one safe behind the spires, one by the hangar under the Bolt tower). **Goal:** destroy the three gun towers, then OKAFOR into the hangar (lose OKAFOR and you lose); 14 rounds. **Enemy:** three unarmoured gun towers (two Flickers, a Bolt by the hangar) and a light garrison (an unarmoured Jackal and Skitter).
**Squad:** as before.

> Garnet depot services the Consortium's heavy walkers. Three gun towers watch the yard.
> Take the towers down and OKAFOR can have a heavy running in ten minutes.
> She says five. She is lying, but not by much.

*Debrief:* A Warden walks out of the hangar with VOSS at the controls and the Consortium's paint still wet on it.
**Access phrase: IRONGATE**

## 3. THE COLUMN
**Map:** a canyon road; a slow prison crawler on the road, high ground on both sides.
**Goal:** escort: the crawler drives itself 3 hexes a round along the road and has to reach the east end by round 14; anything on the road stops it. It cannot fight. **Enemy:** the column's escort (two Jackals), and their reserve (a Ranger and a Skitter) comes up the canyon on round 3. A repair bay on the north ledge.
**Squad:** VOSS Warden (Bolt, Rattler), WREN Skitter, OKAFOR Jackal.

> Three hundred Republic soldiers are being moved through the Shale canyon. The order calls it a redeployment of surplus labour.
> We have stopped the column and opened the doors. Now we walk them out.
> Keep the crawler moving. Anything on the road stops it, theirs or ours.

*Debrief:* Among the prisoners, a colonel named HALE asks for a mech and a map. "You want to hurt them? I know where they keep the Model."
**Access phrase: OPEN DOORS**

## 4. DEAD GROUND
**Map:** a salt marsh in a storm: water, reeds (woods), short sight lines.
**Goal:** keep the dropship standing until the end of round 8. **Enemy:** a turnaround team: their lights are raiders that go straight for the dropship, the rest hunt you; more arrive from the south, north and east over rounds 2 to 5.
**Squad:** VOSS Warden, HALE Bulwark, WREN Skitter.

> The Consortium has brought in a turnaround team. They are sent when a problem has gone on too long.
> The dropship needs eight minutes of fuel, and the marsh is the only cover for a hundred kilometres.
> Their fast ones will go for the ship. Stay in the water: they run hot.

*Debrief:* HALE draws the core at Halcyon in the mud with a stick. "The banks only open to a partner's credentials. There is one partner on this side of the world, and a lab that builds what guards him."
**Access phrase: SALT MARSH**

## 5. THE LAB
**Map:** a research compound: walls, labs (blocks), a test range.
**Goal:** take the prototype crate from the vault and carry it to the extraction pad (the carrier cannot run, everything hunts the carrier, a fallen carrier drops it); 14 rounds. **Enemy:** two guards and the PROTOTYPE walker (a Warden with the laser array); the alarm brings two more through the east gate on round 5.
**Squad:** HALE Bulwark, OKAFOR Ranger, WREN Skitter.

> The core is guarded by walkers we cannot match. The Vantor lab builds a gun that can.
> Take the prototype. Leave the staff.
> One of them has asked to come with us. HALE says no. OKAFOR says we need her.

*Debrief:* The crate holds a howitzer. SABLE, the analyst who asked to come, holds the manual, and admits she helped write the Model. She comes with us. Nobody sleeps near her.
**Access phrase: FIRST LIGHT**

## 6. THE PARTNER
**Map:** a hilltop estate, the partner's walled grounds; one way up.
**Goal:** destroy the partner's mech (marked); the rest do not matter. **Enemy:** the partner in a Monolith with a bodyguard.
**Squad:** VOSS Warden (howitzer), SABLE Ranger, WREN Skitter.

> Partner Calloway signed off the plan for three provinces, and he never leaves his estate.
> His credentials open the core. Bring him down and his guard will break.
> SABLE knows the estate. VOSS is watching her.

*Debrief:* SABLE pulls the credentials from the wreck and hands them to VOSS without a word. WREN asks if that means she can be trusted now. Nobody answers.
**Access phrase: NO TERMS**

## 7. THE CORE
**Map:** the core at Halcyon: three memory banks in a great hall, doors on every side.
**Goal:** destroy the three memory banks. Defenders arrive in waves. **Enemy:** everything left.
**Squad:** VOSS Warden, HALE Bulwark, WREN Skitter (or the player's choice of who stays behind? see open questions).

> This is the mission. The one we told ourselves about.
> Three banks. Every town, every mine, every one of us is written in them.
> Wipe the slate clean, and bring each other home.

*Ending:* the banks go dark. Across the world, the Model asks for its next instruction and gets none. (Ending text to write together; one version if everyone lives, one if not.)

---

## What has to be built

- **Story screen:** the encounter list (locked ones greyed), a box for an access phrase, briefing before the battle, debrief and phrase after a win, retry after a loss.
- **Campaign data:** per encounter: map, goal, squad (pilot names on the cards), enemy, text, phrase.
- **Four new goals:** destroy targets (static structures with armour), escort (a crawler that moves on its own), survive N rounds, kill the marked mech. Plus **reinforcements** (enemy arriving on a set round) for 1 and 7.
- **Seven hand-made maps** (freight yard, crater depot, canyon, marsh, compound, estate, hall).
- **Pilot names** shown on the mech card and in the combat log ("WREN HITS E2").

## Open questions

1. Do pilots ever die in the story (scripted), or only in a battle you lose?
2. Mission 4 (survive) is the breather. Keep, or cut to six?
3. Should the finale let the player pick which three pilots go?
4. Difficulty: one fixed difficulty, or the story at easy / normal / hard (the phrase could carry it)?
5. Access phrases: words (above) or short codes? Phrases are typed, so case and spaces are ignored.
