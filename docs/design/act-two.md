# Storm Atlas: Arsenal overhaul and Act II

Status: approved direction (2026-10-25). Owner: lead (root thread). This file is the shared contract for the builders, judges and iterators. Builders may refine the numbers below. If they do, they update this file in the same change and say why.

## Goals

1. **1942-scale firepower, fast.** Every pickup makes the ship visibly and audibly stronger right away. There are no per-sector caps and no "power full" dead ends. A clean run through sector 1 should end with a screen-wide wall of fire, flanking escorts and missiles.
2. **A hit costs your arsenal, and you can win it back.** When you take a hit, your gained power and equipment scatter as floating salvage tokens. They drift and bounce around the playfield for a short window, and you can fly through them to recover them. So the main risk is losing the arsenal, not dying. A careless player is soon flying a bare plane; a careful one stays a monster.
3. **Sectors 1–3 are the warm-up.** Keep their content. With the new arsenal they will feel easier. That is intended: they teach the loop and let players feel powerful.
4. **Act II (sectors 4–6) is the real game.** Denser, faster, armored and aware of the arsenal, so that even a fully equipped fighter has to sweat.

## Part 1: Arsenal (power and equipment)

### Player state contract (`game.player`)

Simulation (`src/game.js`) owns these fields. Presentation (`render.js`, `ui.js`, `main.js`, `sfx.js`, `sequences.js`) only reads them.

| Field | Type | Meaning |
| --- | --- | --- |
| `level`, `power` | integer ≥ 1, uncapped | Main gun power. Keep both fields and keep them equal; existing readers use both. Sorties (and `selectShip`) start at 2; a scatter or respawn leaves 1. |
| `escorts` | integer 0–6, even | Number of side fighters (1942 style). Pickups add a pair at a time. |
| `escortSlots` | array of `{x, y, side, rank}` | World positions of each escort, updated every tick by the simulation. They follow the player with a spring lag. Focus pulls them into a tight forward formation. |
| `sidewinder` | integer ≥ 0, uncapped | Sidewinder missile rack level. |
| `shield` | integer 0–`shieldCap` | Shield charges. Each charge fully absorbs one hit, with no scatter and no hull loss. |
| `shieldCap` | integer, 3 | Most charges any ship can hold (round 2). S pickups at the cap become +1 power. |
| `maxShield` | integer | Display hint only: the highest charge count reached this life (at least 1 for Manta). Never above `shieldCap`. |
| `magnetBoost` | seconds ≥ 0 | Round 2. Time left on the roll-to-recover magnet pulse: 0.35 s after a roll ends, the pickup magnet is ×1.8. |
| `reflector` | seconds ≥ 0 | Reflector shield time remaining. |
| `signature` | integer ≥ 0, uncapped | Level of the ship-unique system (see below). |
| `orbitals` | array of `{x, y, angle, cool}` | Wraith signature only; empty for the other ships. |
| `drones` | 0 | Deprecated; always 0. Wraith drones become orbitals. |
| `arsenal` | number | Derived total "worth" of the loadout, for HUD and music intensity: `level-1 + escorts + sidewinder*1.5 + signature*1.5 + shield`. |

### Pickup types

Pickups keep the existing shape `{x, y, r, type, age, vy}`. New optional fields: `vx`, `salvage` (bool), `value` (integer, the number of levels carried), `life` (seconds left, salvage only).

| `type` | Glyph | Effect |
| --- | --- | --- |
| `power` | P (gold) | `level += value` (value defaults to 1). |
| `escort` | E (white-blue) | +2 escorts up to 6. Past 6, it gives +2 power instead. Never wasted. |
| `sidewinder` | M (amber) | `sidewinder += 1`. |
| `shield` | S (cyan) | `shield += 1` (Manta gets +2), up to `shieldCap` (3). At the cap the pickup gives +1 power instead. This replaces the old non-Manta "+1 hull" behaviour. |
| `reflector` | R (violet) | `reflector += 6` seconds. |
| `signature` | ★ (ship colour) | `signature += 1`. |
| `bomb` | B | +1 bomb, up to 4. With a full bay it gives +1 power instead. |

Drops:
- Authored `drop:` fields in sectors 1–3 stay as they are.
- Add drops so a strong sector-1 run ends around power 8–10 with one or two escort pairs, a sidewinder rack and a signature level.
- Random drops roll more often than before. Weights (tunable): power 50, escort 12, sidewinder 12, signature 9, shield 9, reflector 8.
- Round 2: the opening beats of sector 1 carry guaranteed power, and wiping a whole formation drops a squadron bonus (see "Simulation notes (arsenal round 2)").
- Carriers and minibosses drop two or three items.
- The old `POWER_MILESTONES` cap and the "final boss guarantees level five" rule are removed. Score extends stay.

### Firepower scaling

The fire cadence stays around 0.09–0.105 s. Everything below scales with `level` and has **no maximum**. Past the authored table, extra levels keep adding damage, so a pickup is never wasted.

- **Main gun:**
  - Stream count grows to a structural ceiling around level 8. Kestrel goes to 9 or more streams; Manta to quad guns plus heavier missile salvos; Wraith to triple rails with more pierce.
  - Past the ceiling, each level adds about 6% damage and slightly larger shots.
  - The game must *look* like 1942 at high power: dense parallel tracer columns, not a thin fan.
- **Escorts:**
  - Each escort fires a lighter copy of its ship's weapon: Kestrel escorts fire twin cannons, Manta escorts fire mini-rockets, Wraith escorts fire thin rails.
  - Escorts have no hit box against bullets; the player is the only hurtbox.
  - Focus collapses the escorts forward to concentrate fire. Unfocused, they spread wide to cover the flanks.
- **Sidewinders:** periodic volleys of fast homing missiles from the wings. Volley size is `2*min(sidewinder,3)`. Cadence shortens with level, to a floor around 0.35 s. Damage grows past level 3. They use their own shot kind `sidewinder`, with a smoke trail.
- **Signature systems (one per ship):**
  - **Kestrel: "Hellfire Wings."** Angled flak cannons on the wings, plus rear guns firing backward and out. They cover the flanks and the rear, which suits the balanced striker. Each level adds a pair of guns and fire rate. Shot kind `flak`.
  - **Manta: "Hammer Torpedoes."** Heavy, slow-accelerating straight torpedoes that pierce small craft and burst on large targets and bosses. They are a boss-killer. Manta also starts each life with 1 shield charge and gains +2 per shield pickup. Shot kind `torpedo`.
  - **Wraith: "Ghost Orbitals."** Orbitals circle the ship at about 46 px. Each orbital fires small rails (shot kind `orbital`) and *eats* enemy bullets it touches, then needs about 0.6 s to cool down before it can eat again. The count equals `signature`, shown up to about 6; further levels speed up the cooldown and firing.
- **Reflector shield:**
  - While `reflector > 0`, enemy bullets entering a ring about 44 px around the player bounce back up as player shots (kind `reflect`). They aim at the nearest enemy and deal moderate damage.
  - Each reflected bullet drains 0.06 s, so dense curtains burn through it.
  - The reflector does not stop enemy body contact or the Crown's lance.
  - Act II introduces **void rounds** (`kind:"void"`), which ignore the reflector and orbitals.
- **Shot budget:** cap live player shots at about 650, dropping the oldest small shots first, and keep the frame budget. Act II raises the enemy bullet cap from 700 to about 900.

### Hit, scatter, recover

Order of resolution when a hit lands and `invuln <= 0`:

1. If `shield > 0`: consume one charge. There is no scatter and no hull loss. Keep the existing shield events.
2. Otherwise, **scatter**:
   - Everything above a bare ship drops: `level-1` power, all escorts, sidewinder, signature, and reflector time. Reflector time is lost, not dropped.
   - Bundle it into at most about 10 salvage tokens: power splits across several `power` tokens with `value` greater than 1, and each equipment level is its own token.
   - About 20% of the power value burns away and is lost (round down, minimum 0). The scatter itself has to hurt a little.
   - Tokens burst outward at 200–340 px/s from the impact point (round 2; was 160–280). They then damp, drift and bounce off the playfield edges (x 24–516, y 70–860), sinking slowly.
   - Each token lives 9 s and blinks for its last 2.5 s.
   - The collection magnet radius grows (focus makes it larger), so a brave sweep recovers most of the haul.
   - The player keeps level 1 and the base loadout.
3. Then the existing hull logic runs: `hp--`, invuln, life loss and respawn. The invuln after a scatter hit is 2.0 s (round 2; round 1 used 1.6 s), shorter than the old 2.35 s, so recovering under fire is a decision. Losing a life also scatters if anything is still held. On respawn the ship is bare, and the tokens from that hit are still floating.

Salvage that is not picked up expires with a small fizzle. Salvage survives a sector transition only if it is on screen during the interlude; then it drifts toward the player and is collected automatically, because sector clears are celebratory.

Drills start with a loadout matching the sector (for example, Vesper: power 6, one escort pair, sidewinder 1; Crown: power 10, two pairs, sidewinder 2, signature 2).

### Events contract (simulation → presentation and audio)

Keep every existing event. Add these:

- `arsenalScatter {x, y, value: levelsDropped, tokens}`
- `salvageRecover {x, y, value: type, amount}`. Round 2: this replaces `pickup` for salvage; ordinary pickups still emit `pickup`. `amount` is the levels the token carried.
- `salvageExpire {x, y, value: type}`
- `escortJoin {value: escortCount}`
- `sidewinderLaunch {value: count}` (coalesce to one per tick)
- `reflect {value: countThisTick}` (coalesce)
- `reflectorUp`, `reflectorDown`
- `signatureUp {value: level}`
- `shieldUp {value: charges}`
- `orbitalEat {value: countThisTick}` (coalesce)
- `powerUp {value: level}` already exists; it now fires at every level, uncapped.
- `squadronBonus {x, y, value: craftWiped, drops: 2}` (round 2): the last kill of a fully wiped formation.

Audio must voice-limit the new high-rate events (`reflect`, `orbitalEat`, `sidewinderLaunch`), so that full power never turns to noise.

### Simulation notes (arsenal round 1)

These are additions and refinements made while building the simulation. Every field and event above is unchanged.

- **Player shot kinds:** `shot`, `lance`, `missile` and `pierce` are unchanged. The new kinds are `escort`, `sidewinder`, `flak`, `torpedo`, `orbital` and `reflect`.
  - Escort shots carry a `style` field: `"cannon"` (Kestrel), `"rocket"` (Manta) or `"rail"` (Wraith; these pierce).
  - Kestrel's rear flak moves downward (`vy > 0`).
  - The kind `drone` is no longer emitted.
- **Extra event fields:**
  - `arsenalScatter` also has `burned` (power levels lost). Its `value` is the total of the token values (power levels plus equipment levels).
  - Torpedo bursts reuse `missileHit`, with `torpedo: true`.
  - New optional event `torpedoLaunch {value: count}`. Presentation may ignore it.
- **`powerUp`:** fires once per pickup, with `value` set to the new level. A multi-level salvage token raises several levels with one event.
- **Salvage tokens:**
  - Escort tokens carry pairs in `value`. Sidewinder and signature tokens carry levels.
  - For the first 0.8 s after a scatter (round 2; was 0.6 s), tokens cannot be magnetized or collected. This is the burst phase, so a hit always actually scatters.
  - Tokens burst to about 140–240 px (round 2; was 115–200 px), then sink at 24 px/s.
  - The salvage magnet is 64 px, or 100 px in focus (round 2; was 84 / 130 px). Ordinary pickups stay at 70 / 105 px. A roll ending multiplies both by 1.8 for 0.35 s.
  - Salvage life is paused during the sector-clear interlude. Whatever the interlude does not collect is cleared at the next sector and counted in `stats.salvageLost`.
- **Manta shield:** `maxShield` starts at 1 for Manta (it was 2). Drills give Manta 2 charges.
- **Drops:**
  - Ordinary kills drop from the weight table at these rates: scout 3.5%, wing 4%, ace 15%, bomber 25%, turret 25%.
  - Carriers add 1 bonus item and minibosses add 2, on top of their authored drop.
  - Each flagship drops 1 power plus 1 bonus item, collected automatically during the interlude.
  - Bonus items follow a fixed ladder: escort, sidewinder, signature, power, reflector, shield, escort, sidewinder, signature, power, and so on. So sector 1 always yields one escort pair, a sidewinder rack and a signature level.
- **Summary and stats:** new fields `arsenalPeak`, `scatters` and `salvageRecovered`. Stats also track `salvageLost`, `reflected`, `orbitalEats` and (round 2) `squadronBonuses`.
- **Orbitals:** orbital objects also carry an internal `fire` clock.

### Simulation notes (arsenal round 2)

These changes answer the round-1 judges. Where they change the contract above, the line above has been updated too.

- **Boss guard clock (bosses reward power).**
  - In round 1 every loadout killed a sector 1–3 flagship in exactly 22 s: guard floors were tied to fixed ages (`BOSS_LEARN_AGES` 10 / 18 / 22).
  - Each boss now has an effective learn age, `age + learnShift`. Phase changes, guard floors and the final guard end all use it. Reactor, lance and fire cadences still run on `age`.
  - Damage soaked by a guard floor is smoothed into an absorbed rate (share of max HP per second, about 0.4 s window). While guarded, `learnShift += max(0, rate − par) × K × dt`, with `K = 2.6`.
  - `par` (`BOSS_GUARD_PAR`) is 0.22 for Vesper, 0.19 for Aurelia and 0.17 for the Crown. That is roughly what the sector's drill kit deals, so a sector-matched kit keeps the authored pacing and only surplus firepower speeds things up.
  - Why `par` exists: measured boss DPS of a maxed kit (power 15, 6 escorts, sidewinder 4, signature 4) is only about 2.3× the Vesper drill kit. A purely linear rule (`par = 0`) cannot give both targets. Any K that brings maxed down to 13 s also brings drill down to 17–18 s.
  - Each phase still lasts at least 55% of its authored window: phase 1 ≥ 5.5 s, phase 2 ≥ 4.4 s, phase 3 ≥ 2.2 s, measured from the phase's start. The shift is capped per phase so it never banks past that point.
  - `guardUntil` is the real `age` at which the current guard will end if no more damage lands, re-computed every tick while guarded. So `guardUntil − age` stays a valid countdown, and it now falls faster than real time.
  - The boss also carries `learnShift`, `phaseStart`, `absorbRate` and `guardAbsorb` (internal).
  - Kill times for an invulnerable bot that tracks the boss with fire held:
    - Vesper: drill kit 20.0–20.9 s, maxed 12.4–14.2 s.
    - Aurelia: drill 21.3–21.9 s, maxed 17.2–18.8 s.
    - Crown: drill 21.3–21.8 s, maxed 18.6–19.9 s.
    - The Crown and Aurelia have more HP per unit of firepower, so they need a bigger arsenal to reach the floor (about 12 s).
- **Shield cap 3 (every ship).**
  - The owner's "no caps" is about power. Shield charges are protection, not power.
  - With uncapped stacking, a stocked Manta absorbed 8 of 13 hits in a sector-1 run without scattering. It opted out of the lose-it-and-win-it-back loop that this overhaul is about.
  - Manta keeps its identity: it starts each life with 1 charge and gains 2 per S pickup, so it reaches the cap fastest.
  - S pickups at the cap become +1 power, so they are never wasted. A partial top-up (Manta at 2) just fills the bank.
- **Ramp ("insanely powerful right away").**
  - Sorties start at power 2.
  - Sector 1's opening beats carry guaranteed power: the left wing of the 0.6 s split, the centre scout of the 4.7 s drift, and the 7.5 s wing's carrier (as before).
  - Engaged no-hit bot (fire held, lines up under the lowest enemy, detours to pickups):
    - power 4 at 5.7–9.0 s;
    - power 6 at 9.6–11.9 s;
    - first escort pair at 9.1–14.4 s;
    - it reaches Vesper at power 17–23 with 2–6 escorts.
  - A mortal dodging bot reaches Vesper at power 14–23, against 3–10 in round 1. Most of the extra comes from squadron bonuses.
  - The old "a strong sector-1 run ends around power 8–10" target is retired.
- **Squadron bonus (1942 style).**
  - Formation waves get a squad id: drift (3 scouts), split, wing (fighters only), ace, bomber and cross (fighters only). Carriers fly outside the squadron.
  - When every craft of a squad is killed (by any player damage, including bombs and splash), the last kill's fan adds 1 power plus 1 item from the weight table without power. The event is `squadronBonus`.
  - A craft that leaves the screen deletes the squad, which spoils the bonus.
  - Squads are cleared when a flagship spawns or a stage advances. `stats.squadronBonuses` counts payouts.
  - Formation scouts and wings no longer roll the random drop table; they pay out through the squadron bonus. Heavies (bomber, ace, turret) still roll.
- **Scatter tuning.**
  - Salvage magnet 64 px (100 px focused). Ordinary pickups stay at 70 / 105 px.
  - Burst 200–340 px/s, so tokens travel about 140–240 px before they settle into the 24 px/s sink.
  - Salvage grace 0.8 s; post-scatter invuln 2.0 s.
  - Roll-to-recover: when a roll ends, `magnetBoost` = 0.35 s and every pickup magnet is ×1.8 (salvage 115 / 180 px).
- **Wraith density.**
  - A 4th rail at power 10 and a 5th at 14, 12 px apart. Past three rails the per-rail damage is multiplied by 3/n, so the total volley stays on the three-rail curve and single-target DPS is unchanged.
  - Orbitals fire twin rails (±3 px) at half damage each, so output is the same with twice the shots.
- **Other.**
  - Bomb pickups at the 4-bomb cap give +1 power.
  - `selectShip` resets to a bare sortie loadout: power 2, no escorts, sidewinder, signature, reflector or orbitals, and the ship's starting shield.
  - A stage advance adds uncollected salvage to `stats.salvageLost` before clearing it.
  - Contact cues (`railHit`, `bossCoreHit`, `bossArmorHit`, `chipHit`) respect the per-target impact cooldown. A pierce shot may cut in once the cooldown is at or below 0.04 s. Maxed Wraith on Vesper drops from 36.6 to about 15 cues/s.
  - Missile and torpedo burst cues (`missileHit` and burst `bossArmorHit`) are not cooldown-gated, as before; maxed Manta makes about 18 per second.
  - Particles: at 380, decorative particles are dropped instead of shifting the array. Critical kinds (boss, phase, ring, bomb, scatter, damage, shield, power, pickup, roll) may overflow to 520. The seeded random stream is unchanged by the cap.
  - Homing shots find their target and the nearest enemy in one loop, with no per-shot closure.

### HUD

- Replace the five-pip "LV" meter and the mobile `n/5` text with an uncapped power number plus a compact equipment row: E count, M level, ★ level, S charges, and an R bar while active.
- On scatter, the HUD briefly shows a red "ARSENAL LOST" flash, and the recovered tokens tick back in.

### Readability rule

Enemy bullets must stay readable through full player firepower. Player shots stay in a cool, low-alpha, thin palette. Enemy bullets keep their bright cores and dark outlines and are drawn above player shots. Salvage tokens are large, outlined and pulsing.

## Part 2: Act II (sectors 4–6)

### Shared Act II systems

- **Armored targets:** hull sections with destructible turret children (1942 and Raiden style battleships and fortresses). The hull has a large HP pool and a fixed score value. Turrets each fire their own patterns, and destroying turrets reduces pressure.
- **Interceptor squadrons:** 1942-style formations of 5–7 that enter from the bottom or sides, loop and leave. Killing the whole squadron drops a bonus pickup.
- **Scavengers:** small fast drones that fly toward floating salvage and steal it. A scavenger carrying salvage glows; killing it drops that salvage back. This makes the scatter feel urgent in Act II.
- **Void rounds:** dark violet bullets with a ring edge. The reflector and orbitals cannot stop them. They are used sparingly, as the counter to a maxed loadout.
- **Destructible bullets:** slow homing mines and missiles that player fire can shoot down, so firepower matters defensively too.
- **Pressure:**
  - Bullet speed is +15–25% over sector 3.
  - Fire density is 1.5–2×.
  - Enemy HP scales on a separate Act II curve tuned against a fully equipped DPS, not the old `1+(stage-1)*.22`.
- **Lightning and weather:** each sector has its own weather. The `lightningAt` schedule extends to the new sectors.
- **Campaign:** introduce `CAMPAIGN_STAGES` (the last playable sector). Victory happens after the last built sector. Every "final sector" check (`stage>=3`) must use it. After the Crown falls in a campaign that continues, play an "ACT II" card ("The Crown was only the gate.") instead of the victory outro.

### Sector 4: IRON MONSOON (build first)

- **Tagline:** "The real fleet rides the typhoon."
- **Coordinates:** N 33°12′ E 171°05′.
- **Flagship:** LEVIATHAN, class SUPER-DREADNOUGHT.
- **Setting:** night typhoon over the enemy battle line. The sea is dark green-black with white storm crests, wind-driven diagonal rain and frequent lightning (a period of about 4.5 s, with a white-gold cast). Battleship wakes and silhouettes scroll below. It must read as a new place at a glance, not as sector 2 recoloured. Procedural art is fine. If an existing painting is reused, it must be heavily regraded and layered.
- **Length:** about 95 s before the flagship (`stageGoal[4] ≈ 95`).
- **Sector beats:**
  1. Opening squadron loops that let a powered player feel strong for about 10 s.
  2. The first armored destroyer hull: 3–4 turrets, scrolling down the centre-left.
  3. Scavengers released into a mid-sector bullet curtain.
  4. Twin gunboat lines with crossing aimed streams.
  5. A minefield corridor of destructible mines that burst radially if left alone.
  6. A cruiser hull with 6 turrets and void-round batteries, as the mid-sector peak.
  7. A breather, then a final pincer of interceptor squadrons plus lane sweeps.
- **Music:** new `sector4`, `warning4` and `boss4` cues. Heavier and faster than sectors 1–3: low brass ostinato and taiko, in a minor key, around 160 bpm. The ambience bed is typhoon wind, rain on metal and distant thunder.
- **Flagship LEVIATHAN** (multi-part super-battleship that fills most of the screen width):
  - **Phase 1, "Deck guns":** four destructible deck turrets with separate patterns (aimed triple streams, rotating fans, flak bursts, broadside rows). The core takes 25% damage while any turret lives. Destroying a turret awards points and drops an item.
  - **Phase 2, "Broadside":** the hull rolls its batteries out. Alternating left and right walls of bullets with readable gaps. Destructible homing torpedoes that firepower must shoot down. Void rounds enter the mix.
  - **Phase 3, "Monsoon engine":** an exposed core spins counter-rotating spirals and launches scavengers at any floating salvage. It ends in a desperation curtain on a guard floor.
  - HP is tuned so a fully equipped ship takes about 60–80 s and a bare ship about 3 times longer. Use the existing learn-age guard floors so each phase plays out. Since round 2 those floors run on the effective learn age (see "Boss guard clock"); give LEVIATHAN its own `BOSS_GUARD_PAR` entry and learn windows.
  - Drill: LEVIATHAN unlocks after encountering it. Raise the `bossSeen` and `bestClears` limits from 3 to `CAMPAIGN_STAGES`.

### Sector 5: SKYFORGE (planned, not built yet)

- **Tagline:** "Above the storm, the factories fly."
- **Setting:** high altitude above a cloud sea at dusk, with a flying fortress fleet and aerial factories. Cloud layers parallax over and under the player.
- **New threats:**
  - Bomber boxes with tail gunners.
  - Flak bands: timed bursting rows that mark their altitude first.
  - Interceptor aces that dodge player fire lines.
- **Flagship HALCYON:** a flying-wing mothership with three bays.
  - It launches squadrons and sweeps a lattice of laser bars, telegraphed with gaps.
  - In phase 3 it fires reflector-proof void lattices and EMP pulses that briefly disable escorts.

### Sector 6: ZERO MERIDIAN (planned, not built yet)

- **Tagline:** "Where the long meridian ends."
- **Setting:** the stratosphere at eclipse. The sea is a distant curve, the sky is black-blue and auroras pulse with the music.
- **Final flagship THE SOVEREIGN:** a mirror-ship that copies the player's current arsenal in its patterns (spread, missiles or rails).
  - In phase 2 it steals the player's salvage on any hit.
  - Its final form is a full-screen bullet ballet with void and destructible bullet layers.
  - Its defeat triggers the true ending.

## Process

- **Workflow:**
  1. Arsenal: two build → judge → iterate rounds, then merge.
  2. Sector 4: two build → judge → iterate rounds, then merge.
  3. Pause for player feedback before sector 5.
- **Builders own files** so they can work in parallel on one checkout:
  - The simulation builder owns `src/game.js`, `src/progress.js` and `test/*.mjs`.
  - The presentation builder owns `src/render.js`, `src/ui.js`, `src/main.js`, `src/sfx.js`, `src/audio.js`, `src/sequences.js`, `index.html` (field-manual copy only) and the CSS.
- **Contract changes:** any change to the contract above is written into this file.
- **Done means:**
  - `npm test` passes.
  - `npm run build` passes.
  - `qa/browser.mjs` passes against the dev server.
  - No console errors.
  - The frame time stays steady with a full arsenal in a dense scene.
