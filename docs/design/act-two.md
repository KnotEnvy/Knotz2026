# Storm Atlas: Arsenal overhaul and Act II

Status: approved direction (2026-10-25). Owner: lead (root thread). This file is the shared contract for the builders, judges and iterators. Builders may refine the numbers below. If they do, they update this file in the same change and say why.

## Goals

1. **1942-scale firepower, fast.** Every pickup makes the ship visibly and audibly stronger right away. There are no per-sector caps and no "power full" dead ends. A clean run through sector 1 should end with a screen-wide wall of fire, flanking escorts and missiles.
2. **A hit costs your arsenal, and you can win it back.** When you take a hit, your gained power and equipment scatter as floating salvage tokens. They drift and bounce around the playfield for a short window, and you can fly through them to recover them. So the main risk is losing the arsenal, not dying. A careless player is soon flying a bare plane; a careful one stays a monster.
3. **Sectors 1–3 are Act I.** (Superseded 2026-10-30 by Part 3: Act I now ramps toward Act II on a slower, authored power curve.)
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
| `shieldCap` | integer, 3 | Most charges any ship can hold (round 2). Charges fill the bank to the cap; each charge past it becomes +1 power (round 3). The simulation clamps `shield` and `maxShield` to the cap in `_syncArsenal`. |
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
| `escort` | E (white-blue) | +2 escorts up to 6. Past 6, it gives +1 power instead (round 3; was +2). Never wasted. |
| `sidewinder` | M (amber) | `sidewinder += 1`. |
| `shield` | S (cyan) | `shield += 1` (Manta gets +2), up to `shieldCap` (3). Overflow counts per charge (round 3): each charge that does not fit is +1 power. So Manta at 2/3 banks one charge and gains 1 power, and at 3/3 gains 2 power. This replaces the old non-Manta "+1 hull" behaviour. |
| `reflector` | R (violet) | `reflector += 6` seconds. |
| `signature` | ★ (ship colour) | `signature += 1`. |
| `bomb` | B | +1 bomb, up to 4. With a full bay it gives +1 power instead and reports `pickup` with value `"power"` plus `powerUp` (round 3), so presentation plays one power cue and no bomb cue. |

Drops:
- Authored `drop:` fields in sectors 1–3 stay as they are.
- Add drops so a strong sector-1 run ends around power 8–10 with one or two escort pairs, a sidewinder rack and a signature level.
- Random drops roll more often than before. Weights (tunable): power 50, escort 12, sidewinder 12, signature 9, shield 9, reflector 8.
- Round 2: the opening beats of sector 1 carry guaranteed power, and wiping a whole formation drops a squadron bonus (see "Simulation notes (arsenal round 2)").
- Round 3: the squadron bonus is one equipment item (never power). Generated drops are kit-aware. Power after sector 1 comes from authored drops, flagship spoils and overflow conversions. See "Simulation notes (arsenal round 3)" for the power curve that Act II is tuned against.
- Carriers and minibosses drop two or three items.
- The old `POWER_MILESTONES` cap and the "final boss guarantees level five" rule are removed. Score extends stay.

### Firepower scaling

The fire cadence stays around 0.09–0.105 s. Everything below scales with `level` and has **no maximum**. Past the authored table, extra levels keep adding damage, so a pickup is never wasted.

- **Main gun:**
  - Stream count grows to a structural ceiling around level 8. Kestrel goes to 9 or more streams; Manta to quad guns plus heavier missile salvos; Wraith to triple rails with more pierce.
  - Past the ceiling, each level adds about 6% damage and slightly larger shots. Round 3: the visual radius grows by `1.6 × ln(1 + over/6)` px with no hard stop (`over = level − 8`), and the collision radius (`hitR`) by half that.
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
- `squadronBonus {x, y, value: craftWiped, drops: 1}` (round 2; `drops` is 1 since round 3): the last kill of a fully wiped formation.
- `pickup` (round 3): a bomb picked up with a full bay reports `value: "power"` (plus `powerUp`), not `"bomb"`.

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
  - Round 3: burst cues (`missileHit` and burst `bossArmorHit`) are gated per target by `e.burstCooldown` (0.085 s). Damage, splash and particles are not gated.
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
  - Ordinary kills drop from the weight table at these rates: scout 3.5%, wing 4%, ace 15%, bomber 25%, turret 25%. Round 3 multiplies them by about 0.7: scout 2.5%, wing 3%, ace 10%, bomber 18%, turret 18%.
  - Carriers add 1 bonus item and minibosses add 2, on top of their authored drop.
  - Each flagship drops 1 power plus 1 bonus item, collected automatically during the interlude.
  - Bonus items follow a fixed ladder. Round 3: six starter rungs (escort, sidewinder, signature, power, reflector, shield), then an equipment-only cycle (sidewinder, escort, signature, reflector, shield). Rungs the kit can't hold are skipped. So sector 1 always yields one escort pair, a sidewinder rack and a signature level.
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
  - S pickups at the cap become +1 power, so they are never wasted. A partial top-up (Manta at 2) just fills the bank. (Superseded in round 3: overflow counts per charge.)
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
  - (Superseded in round 3: these arrivals snowballed to power 50–90 at the Crown. See "Simulation notes (arsenal round 3)".)
- **Squadron bonus (1942 style).**
  - Formation waves get a squad id: drift (3 scouts), split, wing (fighters only), ace, bomber and cross (fighters only). Carriers fly outside the squadron.
  - When every craft of a squad is killed (by any player damage, including bombs and splash), the last kill's fan adds 1 power plus 1 item from the weight table without power. The event is `squadronBonus`. (Round 3: one equipment item, no power.)
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
  - Missile and torpedo burst cues (`missileHit` and burst `bossArmorHit`) are not cooldown-gated, as before; maxed Manta makes about 18 per second. (Round 3: gated per target, see below.)
  - Particles: at 380, decorative particles are dropped instead of shifting the array. Critical kinds (boss, phase, ring, bomb, scatter, damage, shield, power, pickup, roll and, since round 3, explode) may overflow to 520. The seeded random stream is unchanged by the cap.
  - Homing shots find their target and the nearest enemy in one loop, with no per-shot closure.

### Simulation notes (arsenal round 3)

These changes stop the round-2 snowball and set the power curve that Act II is tuned against. Where they change the contract above, the line above has been updated too.

- **Why.** In round 2, an engaged no-hit pilot reached Vesper at power 18–27, Aurelia at 49–58 and the Crown at 79–91, and every flagship died at the 12 s floor. The squadron bonus (1 power plus 1 item per wipe) and overflow conversions at a full kit compounded each other.
- **Changes.**
  - The squadron bonus is one item from the equipment table, never power (`SQUADRON_BONUS_DROPS = 1`).
  - Escort overflow is +1 power per surplus pair (was +2).
  - Shield overflow counts per charge. This raises Manta's curve: an authored S at a full bank is worth +2, which puts Manta about 5 levels above the other ships at Aurelia and about 8 at the Crown.
  - Generated drops are kit-aware. Random rolls, ladder rungs and the squadron item never offer an escort pair to a full wing or an S to a full bank:
    - a random roll that lands there drops nothing;
    - the ladder skips to the next rung;
    - the squadron item re-rolls among the equipment the kit can hold.
    Authored drops keep their type, and anything that reaches a full kit still converts at pickup.
  - The bonus ladder is six starter rungs (escort, sidewinder, signature, power, reflector, shield), then an equipment-only cycle (sidewinder, escort, signature, reflector, shield). Power past sector 1 comes from authored drops, flagship spoils and conversions.
  - Random drop chances are multiplied by about 0.7: scout 2.5%, wing 3%, ace 10%, bomber 18%, turret 18%.
  - Sector 1 is the power warm-up. Every split's lead wing, the bomber pair's lead and every drift's centre scout carry power (6 guaranteed levels). Enemy content is unchanged; only `drop:` fields were added.
- **Power curve.** Arrival power at each flagship. For the engaged pilot, the value is the default seed with the range over 6 seeds in brackets:

| Bot | Ship | Vesper | Aurelia | Crown |
| --- | --- | --- | --- | --- |
| Engaged pilot (the regression bot) | Kestrel | 13 [13–15] | 24 [23–27] | 38 [36–39] |
| | Manta | 13 [13–14] | 30 [27–30] | 47 [42–48] |
| | Wraith | 14 [13–14] | 26 [23–27] | 36 [36–43] |
| Engaged greedy (chases every pickup) | Kestrel | 14 [13–17] | 27 [24–29] | 39 [37–43] |
| | Manta | 15 [15–17] | 30 [28–32] | 46 [45–51] |
| | Wraith | 15 [13–17] | 27 [23–27] | 41 [37–42] |
| Mortal dodger, lives refilled (6-seed mean) | Kestrel | 6.2 | 9.0 | 16.3 |
| | Manta | 14.8 | 27.8 | 40.3 |
| | Wraith | 4.5 | 13.5 | 21.5 |

  - The engaged pilot is the regression bot: fire held, lines up under the lowest enemy, detours to pickups within 300 px, invulnerable. `test/arsenal-r3.test.mjs` pins its arrivals at Vesper 12–16, Aurelia 22–32 and the Crown 35–50 for all three ships. The greedy bot is the feel judge's bot A; the dodger is its bot B with lives refilled.
  - A mortal Kestrel or Wraith dodger arrives far lower: it scatters 8–10 times in sector 1. Manta's shields keep its dodger close to the engaged curve.
- **Ramp (engaged pilot).** Power 4 at 8.8–9.2 s (worst of 6 seeds: 10.1 s). Power 6 at 16.7–17.3 s (worst 17.8 s). First escort pair at 8.3–12.9 s (worst 14.4 s).
- **Boss kill times.** Invulnerable bot tracking the flagship with fire held, in seconds:

| Ship | Vesper: drill / arrival / P25 kit | Aurelia: drill / arrival / P25 kit | Crown: drill / arrival / P25 kit |
| --- | --- | --- | --- |
| Kestrel | 20.9 / 14.8 (P13) / 12.2 | 21.9 / 14.3 (P24) / 16.4 | 21.8 / 13.0 (P38) / 17.6 |
| Manta | 20.7 / 14.0 (P13) / 12.1 | 21.3 / 12.1 (P30) / 15.0 | 21.4 / 12.1 (P47) / 16.5 |
| Wraith | 20.0 / 13.0 (P14) / 12.1 | 21.5 / 12.3 (P26) / 14.7 | 21.3 / 12.1 (P36) / 16.2 |

  Vesper no longer sits on the floor at arrival for Kestrel and Manta; Aurelia and the Crown still reach it for strong arrival kits.
- **Act II tuning reference (required).** Sector 4 (LEVIATHAN and the Act II HP curve) must be tuned against a **power-25 full-kit DPS**:
  - The kit is power 25, 6 escorts, sidewinder 4, signature 4, shield 3.
  - Measured raw flagship DPS (guard ignored, invulnerable tracking bot): Kestrel 1,820, Manta 2,090, Wraith 2,110. The Crown drill kit is 1,020–1,110 for comparison.
  - Strong players arrive above the reference: the engaged pilot's Crown kits measure 3,150 (Kestrel P38 M14 ★12), 4,620 (Manta P47 M16 ★12) and 4,150 (Wraith P36 M21 ★11). Round 2's were 4,950–6,620.
  - Sidewinder and signature levels are uncapped and now carry much of the late growth: M14–21 and ★11–12 at the Crown. Re-measure DPS from the arrival kits rather than from power alone. Consider diminishing returns for those levels before Act II if arrival DPS outruns the guard floors.
- **Shot growth.** `overpowerGrowth(over) = 1.6 × ln(1 + over/6)` px, with `over = level − 8`:
  - about +0.9 px at power 13, +1.8 at 20, +2.5 at 30, +3.3 at 50 and +4.1 at 80, with no hard stop (was `min(2.5, over × 0.12)`).
  - Main-gun shots carry `hitR`, the collision radius, which grows at half that rate. `r` stays the visual radius. Damage scaling is unchanged.
- **Burst cue gate.** Each enemy carries `burstCooldown`, decremented with `impactCooldown`. Burst `missileHit` / `bossArmorHit` events fire only when it is 0 or less, then reset it to 0.085 s. Damage, splash and the particle random stream are untouched; a test runs the same duel with and without the gate and checks boss HP tick for tick. On a Manta flagship duel, missile and armour cues fall from 19–24/s to 11–13/s; the remainder includes the ordinary contact armour cue.
- **Other.**
  - `explode` is a critical particle kind.
  - `_syncArsenal` clamps `shield` and `maxShield` to `SHIELD_CAP`.
  - `stats.squadronBonuses` still counts one per wipe; the regression test checks it against the `squadronBonus` events.
- **Known cost, deferred to the human playtest.** Less power means slower kills for players who keep getting hit. Over 10 seeds of the mortal dodger (no lives refill), clearing sector 1 dropped from 5/10 to 2/10 for Kestrel and from 5/10 to 2/10 for Wraith; Manta still clears 10/10. Deaths cluster after the 42 s split. Restoring sector-1 random rates or removing the 42 s split power did not change this; the cause is the lower power level in the 40–50 s stretch. Sector 1–3 enemy content is unchanged, as instructed.

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
  - HP is tuned so a fully equipped ship takes about 60–80 s and a bare ship about 3 times longer. "Fully equipped" means the power-25 full-kit reference in "Simulation notes (arsenal round 3)", not a Crown arrival kit. Use the existing learn-age guard floors so each phase plays out. Since round 2 those floors run on the effective learn age (see "Boss guard clock"); give LEVIATHAN its own `BOSS_GUARD_PAR` entry and learn windows.
  - Drill: LEVIATHAN unlocks after encountering it. Raise the `bossSeen` and `bestClears` limits from 3 to `CAMPAIGN_STAGES`.

### Sector 4 build contract (shared by the four sector-4 builders)

The simulation owns state. Everyone else reads it. Builders may extend this contract, but they must write any change here.

**Campaign**
- `export const CAMPAIGN_STAGES = 4` from `src/game.js`. Presentation modules import it from there.
- Every "final sector" check (`stage>=3`, `stage===3` used to mean "last", `Math.min(3, …)`, `clamp(…,1,3)`, `[...][stage]` tables) is replaced by `CAMPAIGN_STAGES`, or extended to index 4.
- After the Crown falls in a campaign (not a drill):
  - `_transition` runs about 6.5 s instead of 3.5 s, and the event `actTwo {x, y}` fires once.
  - Then the stage advances to 4 as usual.
  - Victory comes after sector 4's flagship (`stage >= CAMPAIGN_STAGES`).
- `INTERLUDE_LENGTH` (timeline) stays 3.5. Readers of the act II interlude use `game._transitionLength`, which the simulation sets to the real length so the progress helpers stay correct.
- **Drills:** `startDrill(4)` exists. `progress.js` raises the `bossSeen` and `bestClears` limits to `CAMPAIGN_STAGES`. Drill 4 starts with the power-25 reference kit: power 25, 6 escorts, sidewinder 4, signature 4, shield 3.

**Sector 4 enemy types** (`e.type`)

| Type | What it is | Key fields | Notes |
| --- | --- | --- | --- |
| `interceptor` | 1942-style red squadron fighter. Flies scripted loop paths in formations of 5–7, entering from the bottom or sides. | `e.squad`, `e.path` (`"loop"`, `"sweep"`, `"rise"`) | Low HP, fast; fires short aimed bursts. Squadron wipe uses the existing squadron bonus. |
| `gunboat` | Surface craft on the sea. | (none) | Slow, medium HP; aimed triple streams. Draw it at sea level, under the air enemies. |
| `hull` | Armored warship section that scrolls down. | `e.hullClass` (`"destroyer"` or `"cruiser"`), `e.w`, `e.h` (body half-extents for drawing and collision), `e.turrets` (child ids) | Huge HP pool. Takes 35% damage while any of its turrets lives. Never fires itself. Body contact does not hurt the player; it's a ship below. Bullets pass over it. |
| `hullTurret` | Destructible gun on a hull or on LEVIATHAN. | `e.parentId`, `e.ox`, `e.oy` (offset from parent), `e.aim` (radians, toward the player), `e.gun` (`"triple"`, `"fan"`, `"flak"`, `"void"`, `"broadside"`) | Position = parent + offset each tick. Dies with its parent. Its own HP. |
| `scavenger` | Small fast drone that steals floating salvage. | `e.targetPickupId`, `e.carrying` (stolen pickup record or null) | A carrying scavenger flees upward and off-screen; the salvage is lost if it escapes. Killing it drops the carried pickup back, with `salvage` still true. Spawns only when salvage exists, or in authored beats. |
| `mine` | Destructible drifting mine. | `e.fuse` (seconds to burst) | Shootable (low HP). When the fuse runs out, it bursts into a radial ring. |
| `torpedoEnemy` | Destructible homing torpedo, fired by LEVIATHAN phase 2 and cruisers. | (none) | Slow homing, low HP, shootable; hurts on contact. |

**Bullets:** sector 4 uses `kind:"void"` for some turret and boss patterns. Act II raises the bullet cap to 900.

**HP:** an Act II curve, tuned so the power-25 reference kit clears sector-4 popcorn instantly. Hulls take about 4–8 s of focused fire (as built in round 2: destroyer 4–9 s, cruiser 7–18 s; see "Simulation notes (sector 4, round 2)"). LEVIATHAN takes about 60–80 s with the reference kit.

**Flagship LEVIATHAN** (`this.boss`, `stage === 4`)
- `boss.name = "LEVIATHAN"`.
- `boss.w` and `boss.h` are the collision half-extents, much wider than the 98×55 used by earlier bosses: about 210×80.
- Four deck turrets are separate `hullTurret` enemies with `parentId = boss.id`. They are listed in `boss.turrets`.
- Phase 1: while any deck turret lives, core damage is ×0.25.
- `boss.broadside` (0..1) is how far the batteries have rolled out in phase 2. `boss.broadsideSide` is −1 or 1, the side currently firing.
- `boss.core` (0..1) is how far the phase-3 core is exposed.

**New events**
- `squadronEnter {value: count}`
- `hullEnter {value: hullClass}`
- `hullDown {value: hullClass}`
- `turretDown {value: gun}`
- `scavengerSteal {value: pickupType}`
- `scavengerDrop`
- `scavengerEscape`
- `mineBurst`
- `torpedoLaunch` (enemy). Distinct from the player torpedo cue; the presentation reads `value === "enemy"`.
- `broadside {value: side}`
- `coreExposed`
- `actTwo`
- `flakEat {x, y, value: count}` (round 2): Kestrel flak shots ate `count` ordinary enemy bullets this frame. Coalesced to one event per frame; `x, y` is the first eat.

Existing boss events (`bossEnter`, `bossPhase`, `bossGuard`, `bossShot`, `bossDown`) carry `stage === 4` as before.
- Round 2: LEVIATHAN's `bossDown {x, y, value: 4}` also carries `w, h, angle, broadside, core`: the hull's last pose. Presentation can draw a sinking LEVIATHAN after `boss` is null (the event fires in the same frame `boss` becomes null). Earlier flagships keep the plain event.

**Presentation and world**
- `SECTOR_NAMES[4] = "IRON MONSOON"`, `FLAGSHIP_NAMES[4] = "LEVIATHAN"`, `FLAGSHIP_CLASSES[4] = "SUPER-DREADNOUGHT"`, plus coordinates and tagline from above.
- `lightningAt` covers stage 4, with a period of about 4.5 s. The white-gold cast is a presentation choice.
- Music cues: `sector4`, `warning4`, `boss4`.
- The sector-4 ambience bed is the typhoon bed.

**World and story notes (sector 4, round 1)**
- **Background ownership from sector 4.** `background.js` exports `worldPaintsStage(stage)`, which is true for `stage >= 4`. When it is true, the world layer paints the whole sea and its weather:
  - `drawCoast(c, scroll, 4)` (art.js) blits the procedural Iron Monsoon sea and returns true. `drawAtlasScenery(c, 4)` also paints it, so `makeSceneTile(4)` is safe.
  - `WorldAmbience.begin/drawSurface/drawAir/drawTransitions` take the real stage (4).
  - render.js skips its own sector 1–3 dressing: `drawWeatherTile`, `drawActiveWeather`, `drawTerrainLights`, the light-shaft blit and the three flow-line bands. The lead agreed to apply this in render.js. Until then, teal weather-tile streaks show over the typhoon. A `seas[3]` fill of `#040b0a` suits it.
- **Interlude length.** `timeline.js` adds `interludeLength(game)` (`game._transitionLength` when set, else `INTERLUDE_LENGTH`). `interludeProgress` uses it. `actTwoInterlude(game)` is true during the long Crown→sector 4 interlude. `ACT_TWO_STAGE = 4` is exported from timeline for presentation code.
- **Lightning.** `lightningAt(time, 4)` strikes on a 4.5 s period, using the same strike shape as sectors 2–3, so thunder timing rules are unchanged. The playfield and page console draw sector-4 strikes white-gold.
- **Act II interstitial** (`sequences.js`). On the long interlude: FLAGSHIP DOWN (0–1.3 s), then the sector-3 tally until 3.3 s (footer "THE CROWN FALLS · THE GATE OPENS"), then the ACT II card from 3.1 s to the end of the interlude. The card has letterbox bars, two white-gold strikes, "ACT II", "The Crown was only the gate." and "AHEAD · SECTOR 04 — IRON MONSOON · LEVIATHAN". Under it, the background's cloud deck closes into the dark typhoon palette (cover palette 4) with lightning inside the cloud. The page console's interlude wash switches to the storm variant (`body[data-interlude="act2"]`). The Act II sector intro card runs 3.4 s (not 2.6 s). Audio cue timing can key off the same `actTwo` event and `game._transitionLength`.
- **Cover palettes.** `COVER` in background.js is keyed 1–4 by sector, and 5 is the dawn after the final flagship (it used to be 4).
- **Page console.** `body[data-sector="4"]` gets the typhoon backdrop. `body[data-jam]` is set during short typhoon link dropouts in sector 4. Log lines are added for `actTwo`, `hullEnter`, `hullDown`, `scavengerSteal` (throttled), `broadside` and `coreExposed`.
- **Markup for 4 sectors.** index.html has a 4th node in the console route and the pause hold route (`data-node="4"`, `li[data-sector="4"]`), with CSS positions at 12.5/37.5/62.5/87.5%. These match `routePosition` in pause.js. It also has drill button `data-drill="4"` and mastery badge `data-mastery="4"`.

**Builder file ownership (sector 4)**
- **Simulation:** `src/game.js`, `src/progress.js`, `test/*`, `qa/*`.
- **Combat rendering:** `src/render.js`, `src/ui.js`, `src/pause.js`. This covers enemy and LEVIATHAN art and the HUD.
- **World and story:** `src/background.js`, `src/art.js`, `src/timeline.js`, `src/ambience.js`, `src/sequences.js`, `src/cinema.js`, `src/frontend.js`, `src/main.js`, `index.html`, CSS.
- **Audio:** `src/music.js`, `src/soundscape.js`, `src/sfx.js`, `src/audio.js`.

### Simulation notes (sector 4)

Refinements made while building the sector-4 simulation. Every field and event in the build contract above keeps its name and meaning; the items below are additions.

**Extra fields (all optional for readers)**
- `hull.turretsAlive` and `boss.turretsAlive`: live child turrets. `turrets` keeps every child id, dead ones included, so presentation can still draw wrecked mounts. The ×0.35 hull and ×0.25 core rules use `turretsAlive > 0`.
- LEVIATHAN keeps its deck turrets (and the ×0.25 rule) until they are shot, in any phase. `boss.leviathan` is true. Earlier bosses now also carry `w`/`h` (98×55, unchanged collision).
- Interceptors, scavengers and enemy torpedoes set `e.angle` to their full heading (`atan2(-vx, vy)`; 0 = nose down, as for the other enemies). Interceptors also carry `side`, and `hidden` while they wait below or beside the field. Hidden craft are not hit by shots, homing or contact.
- Mines carry `fuse` (counts down); enemy torpedoes carry `heading` and `speed`. Hull turrets carry `aim` (radians, slewing toward the player at 2.6 rad/s).
- Pickups now carry a unique `id` (so `scavenger.targetPickupId` can point at one).
- Flak turret shells are ordinary bullets with `fuse` and `burst`. When the fuse runs out they turn into a ring.
- `game.threat` (0–0.88 since round 2; was 0–1.25): the Act II rank (see below). `game.bulletCap` reports the live cap (700, or 900 in Act II).
- Round 2: `player.r` (hurtbox) is 7 for Kestrel and Wraith, 9 for Manta, in every sector. `stats.flakEats` counts bullets eaten by Kestrel flak.

**Extra event fields**
- `squadronEnter` also carries `path` and `side`; `x, y` is the entry point (clamped to the field).
- `torpedoLaunch` (enemy) and `mineBurst` are coalesced per frame and carry `count`.
- `scavengerDrop` and `scavengerEscape` carry the pickup type as `value`.
- `actTwo` carries `value: 4`.

**Behaviour**
- Surface ships (hulls, hull turrets, gunboats) never hurt on contact. A shot over a live turret hits the turret, and a shot flying up a live turret's column passes over the hull to reach it. LEVIATHAN's body still hurts on contact, like the earlier flagships.
- Scavengers hunt for up to 8–11 s, sniping only while they have no salvage target. They steal any salvage older than 0.4 s, then flee upward. Shot down, they drop the salvage back with `salvage: true` and at least 5 s of life. In the sector, a scatter calls 2 scavengers 0.6 s later (round 2; was 1.1 s). If the ship was kitted when it scattered (threat ≥ 0.5), they cut in from both side edges level with the salvage; a ship that was already stripped meets them diving from the top corners. They fly at 330 px/s toward salvage (round 2; was 285). LEVIATHAN phase 3 launches 2 every 3.8 s while salvage floats. At most 4 are alive at once.
- Interceptors fly scripted paths: `loop` (dive, 1.5 loops, climb out), `rise` (from below the field up a side lane, drifting toward the centre) and `sweep` (across on a dipping arc). Squads have 5–6 craft, staggered 0.17–0.2 s. Each craft fires an entry burst and a mid-path burst; a low-threat ship (threat < 0.3) meets only the mid-path burst. Round 2 adds the kitted-ship bursts in "Simulation notes (sector 4, round 2)".
- The Act II interlude after the Crown (campaign only) is 6.5 s. Drills never play it.

**Threat rank (Act II is "aware of the arsenal").** Without this, density cannot make a full kit sweat. A power-25 kit deletes every source before it fires (peak 116 bullets), while the same density kills a bare ship.
- Round 2 curve: `threat = 0.88 × tanh(max(0, arsenal − 6) / 37)`. It rises at 0.15/s and falls at 0.35/s. A non-finite arsenal gives threat 0.
  - A bare ship sits at 0; a power-12 mid kit (power 12, 2 escorts, sidewinder 1, signature 1, shield 1) at about 0.25; the reference kit at 0.69; Crown-arrival kits at 0.85–0.87. Kits keep growing through the sector, so a reference kit ends it near 0.8.
  - Round 1 used `clamp((arsenal − 6) / 44, 0, 1.25)`. That put the reference kit at 0.89 and every Crown-arrival kit at the 1.25 cap, and in-sector drops pinned all kitted play at the cap by about 75 s, so the rank was effectively binary.
  - Each sector opens on a power trip, and a scatter eases the pressure while the pilot rebuilds.
- Act II enemy cooldowns are multiplied by `_pace() = 1.8 / (1 + 1.61t + 0.66t²)`: 1.8 at threat 0, 1.17 at 0.3, about 0.74 for the reference kit and 0.62 for an arrival kit. (Round 1's `1.8 / (1 + 1.61t)` gave 0.74 for the reference kit and 0.60 at its 1.25 cap; the round-1 note that said "0.69 at threat 1" was wrong.) Bullet speed is multiplied by `1 + 0.1t + 0.05t²` (+12% at the top).
- Volleys grow with threat. The share `v = min(1, threat / 0.75)` is full from about a power-30 full kit upward:
  - interceptor bursts 1→4 rounds (`1 + round(3v)`);
  - gunboat bursts 2→4 volleys;
  - triple turrets 3→5 ways above 0.55;
  - fan turrets 9→12 bullets;
  - flak rings 10→15;
  - mine rings 12→18;
  - cruiser void batteries 3→5 ways above 0.65.
- LEVIATHAN's own guns use a milder `_bossPace() = 1.35 / (1 + 0.45t + 0.2t²)`: 1.35 bare, 0.96 for the reference kit, 0.88 at the top. The second broadside row and the 5-way void spread need threat > 0.6. That keeps the round-1 pattern for the reference kit; round 1's gates were 0.8 and 0.7 on the old curve.
- **Rescue drops.** Squadron leads, gunboats and one torpedo per LEVIATHAN salvo carry a power level only while `threat < 0.5`, so a stripped ship can rebuild without feeding a full kit's snowball.
- **Void awareness.** While the ship flies 2+ orbitals or a live reflector, the last round of each interceptor burst and every third gunboat or turret volley is `void`. Without this, a Wraith arrival kit scattered 1.5 times on average, against 9 for Kestrel.

**Numbers as built**
- Act II HP (×1.35 per later Act II sector):
  - interceptor 55, scavenger 45, torpedo 42, mine 120, gunboat 900;
  - destroyer 5,600 with 3 turrets of 1,100;
  - cruiser 9,000 with 6 turrets of 1,600 (round 2; was 1,250).
- LEVIATHAN:
  - core 145,000 HP; 4 deck turrets of 1,800 HP (triple, fan, flak, broadside); each turret drops power plus a ladder item and scores 3,000.
  - Learn windows 24 / 46 / 68 s. `BOSS_GUARD_PAR[4] = 0.016`, which is the reference kit's share per second. Guard K is 20 for this boss (2.6 for the others), because its per-second share is small.
- Kill times, invulnerable tracker that shoots turrets first and collects drops:

| Kit | Kestrel | Manta | Wraith |
| --- | --- | --- | --- |
| Power-25 reference | 68.0 s | 67.2 s | 67.8 s |
| Crown arrival | 63.5 s | 56.7 s | 59.9 s |
| Bare (power 2) | 193 s | 193 s | 182 s |

  Bare is 2.7–2.8× the reference. Without drops, a bare ship takes about 360 s. Round 2 numbers are in "Simulation notes (sector 4, round 2)".
- **Balance bot.** A dodging pilot with human limits: reaction latency, attention, re-plan interval and aim noise. The "average" pilot (0.3 s latency) is calibrated to the round-3 mortal dodger: a bare Kestrel scatters 3–10 times in sector 1. With a Crown kit, neither pilot scatters in sector 3.

  Sector 4 plus LEVIATHAN, 6 seeds per row:

| Pilot | Kit | Clears (Kestrel / Manta / Wraith) | Mean scatters (Kestrel / Manta / Wraith) |
| --- | --- | --- | --- |
| Good | Crown arrival | 5/6, 6/6, 6/6 | 9.2, 4.5, 2.8 |
| Good | Reference | 4/6, 6/6, 6/6 | 9.8, 5.8, 3.0 |
| Good | Bare | 0/6, 4/6, 4/6 | — |
| Average | Crown arrival | 1/6, 6/6, 6/6 | — |
| Average | Reference | 5/6, 6/6, 6/6 | — |
| Average | Bare | 0/6, 3/6, 3/6 | — |

  - Peak enemy bullets in these runs: 90–128.
  - Simulation cost: 0.01–0.023 ms per 120 Hz tick.
- **Known costs for the judges.**
  - Kestrel is the hardest ship in Act II. It has the largest hitbox of the fast ships and no defensive signature. At power 2, its three parallel streams make a 16 px column with no homing, so a bare Kestrel cannot clear Act II sources: 0 of 12 bare runs cleared.
  - Kestrel arriving with a full kit clears, but sweats hardest (9–10 scatters).
  - Wraith's orbitals still make it the safest ship.

### Simulation notes (sector 4, round 2)

Round-2 balance pass after the four round-1 judges. The owner's goal: sector 4 makes even a fully equipped fighter sweat, sectors 1–3 stay warm-ups, and popcorn still melts.

**Kestrel ("Hellfire Wings" screen and hurtbox)**
- In its first 0.3 s of flight (about 230 px from the wing), each Kestrel flak shot eats one ordinary enemy bullet on contact and is spent. It never eats `void` rounds. Each frame emits one coalesced `flakEat {value: count}`; `stats.flakEats` counts them.
  - The range is a tuning choice. A screen over the whole flight made Kestrel the safest ship (1.3 scatters with the reference kit). With no eat at all it averaged 8.8 scatters.
- The Kestrel hurtbox is 7 (was 8), the same as Wraith, in every sector.
- Mortal sector-1 dodger (round-3 bot, 10 seeds, no lives refill): Kestrel clears sector 1 in 9/10 runs (was 2/10). The hurtbox alone gives 7/10 and the flak eat alone 6/10. Manta (10/10) and Wraith (2/10) are unchanged.
- In sector 3, the Crown-kit calibration bot still takes 0–2 sector hits and never scatters, so the warm-up stays a warm-up.

**Threat rank.** This round's curve, pace and gates are in "Simulation notes (sector 4)" above. Measured over good-pilot runs (8 seeds), mean / maximum through the sector:
- reference kit 0.69–0.72 / 0.82;
- Crown arrival 0.82–0.84 / 0.87;
- mid kit 0.49–0.51 / 0.71;
- bare 0.00–0.19 / 0.03–0.50.

A first scatter with the reference kit drops threat from 0.82 to 0.44 two seconds later, which is about 50% slower fire, mostly during the 2 s invulnerability. Recovered salvage brings it back to 0.69 by five seconds. That's a breather, not a mercy button.

**Sector separation (kitted Manta and Wraith)**
- Against a full kit, interceptors live about 0.3 s once visible. Half died before their entry burst and almost none reached a second, so per-craft extra volleys alone changed nothing.
- At threat ≥ 0.65 (`SECOND_BURST_THREAT`):
  - interceptors fire their entry burst as soon as they clear the field edge, as up to three narrow 3-way rounds (0.07 rad apart);
  - interceptors that survive add a third burst 0.85 s after the mid-path burst;
  - gunboats add a re-aimed 2-volley follow-up burst 0.9 s after each burst.
  - The pincer squadrons are interceptors, so they get all of this.
- Cruiser turrets have 1,600 HP (was 1,250). Torpedo pairs start at 3.5 s and repeat every 3.2 s (was 4.5 s / 4.4 s).
- Variants tried and dropped, all within seed noise:
  - more void rounds in interceptor bursts;
  - a third lane row;
  - a 3-volley gunboat follow-up;
  - a cruiser void follow-up;
  - gunboat streams that lead the target.

**Weak kits against hulls.** Hull turrets (including LEVIATHAN's deck turrets) take ×1.5 damage while threat < 0.3. With drops removed:
- bare destroyer turrets fall in 11.8 s for Kestrel (was 17.5), 45.8 s for Manta (was 68.5) and 6.2 s for Wraith (was 9.1);
- bare cruiser turrets fall in 34.8 s for Kestrel (was 40.5) and 26.8 s for Wraith (was 31.0). Bare Manta still cannot silence the cruiser alone (about 44 DPS); in real runs its rescue drops grow it first.

**Scavengers and mines**
- The call-in comes 0.6 s after a scatter, and scavengers fly at 330 px/s toward salvage.
- A kitted scatter (threat ≥ 0.5) brings the pair in from the side edges, level with the salvage cloud (its mean height − 40, clamped to 140–720); otherwise they dive from the top corners.
- Forced mid-sector scatter, good pilot, reference kit (16 scatters per ship), per scatter:

| Ship | Steals | Escapes | Shot back | Levels recovered |
| --- | --- | --- | --- | --- |
| Kestrel | 1.38 | 0.38 | 1.00 | 31.1 |
| Manta | 1.50 | 0.00 | 1.50 | 28.9 |
| Wraith | 1.56 | 0.19 | 1.38 | 28.6 |

  Round 1 gave 0 steals and about 32–33 levels recovered. With the round-2 call-in but the old top-corner dive, steals stayed at 0–0.06.
- Mine fuses are 3.5–5.0 s (was 5.2–7.4 s). Kitted ships still shoot almost every mine (0–1.6 bursts per run). Mid kits now meet 1–7 bursts per run and bare kits 10–17.

**Pacing and presentation payloads**
- The opening squadron enters at 2.5 s (was 0.8 s), so the 3.4 s intro card no longer hides it. The opening is re-spaced: `loopR` 4.9, `riseL` 7.2, `sweepL` 9.5, destroyer 12 (was 3.6 / 6.4 / 9 / 11.5).
  - Delaying only `loopL` made the first two squads arrive almost together. A weak ship then took its first hit at about 5 s and missed the opening rescue drops (the average Kestrel's mid kit fell to 5/12 clears).
- Void rounds are never smaller than r 5 (`_bullet` clamps them; interceptor voids were 4.4).
- LEVIATHAN sways ±20 px (was ±34). Bow, stern and the 22 px broadside extension stay inside 0–540. `w`/`h` stay 210×80, matching the drawing.
- LEVIATHAN's `bossDown` carries its last pose (see the contract's "New events").

**LEVIATHAN kill times** (invulnerable tracker, shooting turrets first):

| Kit | Kestrel | Manta | Wraith |
| --- | --- | --- | --- |
| Reference | 68.0 s | 67.2 s | 67.8 s |
| Crown arrival | 63.5 s | 56.7 s | 59.9 s |
| Mid (P12) | 108.7 s | 99.8 s | 102.1 s |
| Bare | 183 s (was 193) | 179 s (was 193) | 173 s (was 182) |

- Bare deck-turret clearing takes 26–36 s (was 36–51 s), because of the weak-kit turret bonus.
- A test now pins Crown-arrival kills at 52–72 s.

**Balance bot, sector 4 plus LEVIATHAN** (the round-1 dodging bot, seeds 0, 5, 6, 7, 8, 9, 99, 1234; the scratch scripts are not kept in the repo):
- Hits include shield hits.
- Steals include phase-3 steals.
- Phase times are means over clearing runs.

| Pilot | Ship | Kit | Clears | Sector hits | Scatters (sector + boss) | Steals | Mine bursts | LEVIATHAN phases 1/2/3 (s, clears) | Threat, sector (mean / max) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Good | Kestrel | Reference | 8/8 | 4.9 | 5.6 (0.8 + 4.9) | 1.6 | 0.0 | 28.5 / 26.9 / 34.3 | 0.72 / 0.82 |
| Good | Kestrel | Crown arrival | 8/8 | 3.9 | 4.1 (0.5 + 3.6) | 0.6 | 0.0 | 22.3 / 24.6 / 30.4 | 0.82 / 0.87 |
| Good | Kestrel | Mid (P12) | 8/8 | 6.0 | 7.8 (1.4 + 6.4) | 2.6 | 2.3 | 30.8 / 32.3 / 55.4 | 0.51 / 0.71 |
| Good | Kestrel | Bare | 1/8 | 10.6 | 14.6 (9.0 + 5.6) | 2.4 | 17.4 | 42.1 / 39.0 / 58.5 | 0.01 / 0.10 |
| Good | Manta | Reference | 7/8 | 6.1 | 7.4 (0.5 + 6.9) | 0.5 | 0.1 | 23.4 / 23.3 / 29.4 | 0.72 / 0.81 |
| Good | Manta | Crown arrival | 8/8 | 6.3 | 6.6 (0.4 + 6.3) | 1.4 | 0.0 | 20.5 / 20.4 / 28.4 | 0.83 / 0.88 |
| Good | Manta | Mid (P12) | 5/8 | 6.3 | 13.4 (1.4 + 12.0) | 1.8 | 0.9 | 32.1 / 31.3 / 53.0 | 0.50 / 0.70 |
| Good | Manta | Bare | 3/8 | 10.4 | 14.1 (3.9 + 10.3) | 2.1 | 9.5 | 30.0 / 21.9 / 32.3 | 0.19 / 0.50 |
| Good | Wraith | Reference | 6/8 | 6.3 | 8.0 (1.4 + 6.6) | 2.0 | 0.8 | 23.6 / 22.7 / 32.1 | 0.69 / 0.79 |
| Good | Wraith | Crown arrival | 8/8 | 3.8 | 3.5 (0.3 + 3.3) | 0.5 | 0.0 | 20.5 / 19.4 / 21.4 | 0.84 / 0.87 |
| Good | Wraith | Mid (P12) | 8/8 | 5.1 | 6.9 (1.3 + 5.6) | 2.8 | 3.4 | 25.9 / 27.3 / 43.3 | 0.49 / 0.70 |
| Good | Wraith | Bare | 2/8 | 9.9 | 18.0 (7.5 + 10.5) | 4.4 | 12.4 | 29.6 / 38.5 / 56.5 | 0.10 / 0.44 |
| Average | Kestrel | Reference | 7/8 | 4.9 | 7.8 (0.9 + 6.9) | 3.0 | 0.6 | 24.1 / 21.7 / 49.6 | 0.70 / 0.80 |
| Average | Kestrel | Crown arrival | 8/8 | 4.6 | 6.3 (0.8 + 5.5) | 1.9 | 0.0 | 26.5 / 24.6 / 34.5 | 0.82 / 0.87 |
| Average | Kestrel | Mid (P12) | 6/8 | 8.4 | 13.3 (3.8 + 9.5) | 6.6 | 6.5 | 37.5 / 34.1 / 49.9 | 0.41 / 0.62 |
| Average | Kestrel | Bare | 0/8 | 12.1 | 13.0 (11.8 + 1.3) | 2.8 | 16.4 | — | 0.00 / 0.03 |
| Average | Manta | Reference | 6/8 | 8.1 | 11.0 (1.6 + 9.4) | 2.1 | 0.1 | 26.0 / 29.5 / 42.5 | 0.70 / 0.79 |
| Average | Manta | Crown arrival | 8/8 | 6.8 | 6.9 (0.6 + 6.3) | 0.9 | 0.3 | 20.8 / 23.4 / 30.4 | 0.81 / 0.88 |
| Average | Manta | Mid (P12) | 5/8 | 7.9 | 13.0 (1.6 + 11.4) | 1.6 | 0.8 | 28.0 / 36.3 / 58.8 | 0.52 / 0.71 |
| Average | Manta | Bare | 2/8 | 11.0 | 17.6 (4.9 + 12.8) | 3.9 | 12.4 | 35.3 / 45.8 / 82.2 | 0.16 / 0.44 |
| Average | Wraith | Reference | 8/8 | 7.4 | 7.9 (2.1 + 5.8) | 3.4 | 1.6 | 29.6 / 27.3 / 38.5 | 0.66 / 0.79 |
| Average | Wraith | Crown arrival | 6/8 | 7.9 | 10.4 (3.0 + 7.4) | 2.6 | 0.3 | 23.2 / 22.3 / 32.8 | 0.78 / 0.87 |
| Average | Wraith | Mid (P12) | 5/8 | 7.3 | 12.3 (2.8 + 9.5) | 4.6 | 3.5 | 25.1 / 26.7 / 42.5 | 0.48 / 0.69 |
| Average | Wraith | Bare | 0/8 | 11.8 | 18.5 (9.4 + 9.1) | 2.8 | 11.6 | — | 0.08 / 0.34 |

With 16 seeds, good pilots with the reference kit clear 16/16 (Kestrel), 14/16 (Manta) and 14/16 (Wraith), with sector hits of 4.9 / 6.1 / 5.4 and scatters of 4.8 / 8.1 / 6.8. With Crown-arrival kits they clear 15–16/16, with 4.1–6.8 sector hits.

Round 1, same bot and seeds, for comparison:

| Pilot, kit | Kestrel (clears, sector hits, scatters) | Manta | Wraith |
| --- | --- | --- | --- |
| Good, reference | 7/8, 2.8, 6.5 | 8/8, 4.5, 5.6 | 8/8, 3.3, 3.1 |
| Good, Crown arrival | 8/8, 5.1, 8.4 | 8/8, 4.6, 4.8 | 8/8, 2.3, 3.6 |
| Good, mid | 6/8, 6.9, 12.8 | 7/8, 3.0, 5.5 | 8/8, 4.6, 4.8 |
| Good, bare | 0/8 | 8/8 | 3/8 |
| Average, reference | 5/8, 4.4, 12.0 | 7/8, 5.1, 7.1 | 8/8, 2.0, 3.3 |
| Average, Crown arrival | 4/8, 6.6, 12.8 | 8/8, 4.9, 6.0 | 8/8, 1.8, 2.8 |
| Average, mid | 0/8 | 6/8 | 7/8 |

- Peak enemy bullets are now 101–129 (round 1: 87–128). Kitted ships still wipe 93–100% of squadrons, so popcorn still melts.

**Known costs for the judges**
- Bare Manta got harder: the good pilot clears 3/8 (round 1: 8/8; 6/12 on 12 seeds), because of shorter mine fuses, steals and the denser opening. Bare Kestrel stays near hopeless (1/8). Bare Wraith is about where it was (2/8; round 1 3/8).
- With Crown-arrival kits, Manta and Wraith now take 3.8–7.9 sector hits (round 1: 1.8–4.9), and the average Wraith clears 6/8 (round 1: 8/8). That is the intended "sweat", but it is also the largest felt change.
- The rank (0–0.88) is no longer comparable with round-1 values. Anything keyed to the old 1.25 cap must use the new gates.

### Sector 5: SKYFORGE (build now)

Status: approved direction (2026-10-31). The owner's verdict on Act I and sector 4: "completely the right direction." Sectors 5 and 6 complete Act II, and Act III will be the final act (not planned yet). Each sector is built, judged and iterated until all four judges score it 8.5 or higher, with no P0 or P1 left open. Each sector gets at most three rounds; after that, the lead reports to the owner.

- **Tagline:** "Above the storm, the factories fly."
- **Coordinates:** N 35°40′ E 176°20′. The route runs east along the meridian: sector 4 is at E 171°, sector 6 sits on the 180th meridian.
- **Flagship:** HALCYON, class FLYING-WING CARRIER.
- **Setting:** high altitude at dusk, above the typhoon's cloud sea.
  - Two parallax cloud decks: a slow violet floor below, and torn amber wisps that pass *over* the player (kept thin, so they never hide bullets).
  - Aerial factory platforms, contrails and a magenta-gold sun low on the horizon.
  - The typhoon from sector 4 is still visible below as lightning glowing inside the cloud floor: a soft violet flicker on a period of about 7 s.
  - At a glance it must read as a new altitude, not as sector 4 recoloured. Procedural art is fine. `worldPaintsStage(5)` is already true, so the world layer owns the whole background.
- **Transition from sector 4:** after LEVIATHAN sinks, the normal 3.5 s interlude plays as a climb. The cover cloud deck rises through the typhoon into dusk light. There is no act card.
- **Length:** about 100 s before the flagship (`stageGoal[5] ≈ 100`).

**What's new in sector 5**
- **Threats from below.** Bomber boxes climb up from the bottom edge and overtake the player. Their tail gunners fire back down at the player as they pass. Fair warning comes first: shadows, an engine-drone cue and an edge marker about 1.2 s before entry.
- **Flak bands.** A horizontal row marks its altitude first, then bursts into short-range shrapnel with readable gaps. These are the vertical counterpart to sector 4's lane sweeps.
- **Sky aces.** Interceptors that sidestep the player's main-gun firing line. The player's answer is homing fire: sidewinders, Manta torpedoes and Wraith orbitals, or the escort spread.
- **Foundries.** Armored flying factory platforms whose bay modules launch drone popcorn until the bays are destroyed. They are this sector's version of sector 4's hulls.

**Sector beats** (times are suggestions; place drops by the Act I rule: each item is collected before the attack it answers)
1. **2.5–12 s:** interceptor squadrons over the cloud sea, a power trip. The first sky-ace pair debuts at about 10 s, right after a sidewinder or signature drop.
2. **About 14 s:** the first bomber box climbs from below, teaching that threats now come from below.
3. **About 24 s:** a corridor of three flak bands, with drifting popcorn.
4. **About 34 s:** foundry 1, whose bays launch drones. Scavengers answer any scatter, as in sector 4.
5. **About 48 s:** a sky-ace wing plus flak bands.
6. **About 60 s:** the mid-sector peak: two bomber boxes (one climbing, one diving) over foundry 2, a larger one with void-round batteries.
7. **About 80 s:** a breather, then an interceptor pincer through a flak gauntlet, with sky aces, before HALCYON.

**Flagship HALCYON** (a flying-wing mothership spanning about 80% of the width, `boss.w` × `boss.h` ≈ 220×70)
- **Phase 1, "Three bays":** three destructible bay modules (child enemies, as with LEVIATHAN's turrets) launch interceptor squadrons. The core takes 25% damage while any bay lives. Each bay destroyed drops an item.
- **Phase 2, "Lattice":** HALCYON sweeps a lattice of laser bars. Each bar is telegraphed (a thin marked line for about 0.9 s), then fires for about 0.6–1.0 s, and always leaves a readable gap. A bar hurts on contact unless the player is rolling. The reflector and orbitals can't stop it.
- **Phase 3, "Eclipse protocol":** reflector-proof void lattices, plus EMP pulses that disable the player's escorts for about 2 s.
  - Each EMP charges as a visible ring for about 1.2 s.
  - Disabled escorts visibly go dark and stop firing.
  - A barrel roll during the pulse protects the escorts.
  - The phase ends in a desperation curtain on its guard floor.
- **Kill time:** about 65–85 s with the sector-5 reference kit, and about 3× that for a bare ship. HALCYON gets its own learn windows and `BOSS_GUARD_PAR` entry.
- **Death:** the wing breaks apart and falls through the cloud floor. Its `bossDown` carries its last pose, as LEVIATHAN's does.

**Music and ambience**
- New `sector5`, `warning5` and `boss5` cues: soaring and tense, about 150 bpm. Use string ostinatos and synth arpeggios in a bright mode that darkens (Lydian to Dorian), over sector 4's low drums, kept lighter. They must sound like a climb, not like the typhoon again.
- The ambience bed: thin high-altitude wind, distant engine drones and the clank of the factories.

### Sector 5 build contract (shared by the four sector-5 builders)

The simulation owns state, and everyone else reads it. Builders may extend this contract, but must write any change here.

**Campaign**
- **Campaign length.** `CAMPAIGN_STAGES = 5` for this build; sector 6 will raise it to 6. Victory comes after HALCYON for now.
- **Interlude.** LEVIATHAN → sector 5 uses the normal interlude. There's no `actTwo` event.
- **Remove hard-coded counts.** Presentation removes the four-sector assumptions it still has: the console route, the pause hold-track nodes, the hangar mission route, the drill buttons and the mastery badges. Each is generated from `CAMPAIGN_STAGES` (or extended to 6 and hidden past `CAMPAIGN_STAGES`), so sector 6 needs no markup work. Route positions are computed, not fixed percentages.
- **Drills.** `startDrill(5)` exists. HALCYON unlocks after the player encounters it. Drill 5 starts with the sector-5 reference kit, which the simulation defines.
- **Reference kit.** The simulation measures what a strong player carries into sector 5: the kit-ledger collector from sector 4, without hits. It records that kit as the sector-5 reference in "Simulation notes (sector 5)". The Act II HP for sector 5 (`_actTwoScale`, currently ×1.35) is re-tuned against it.

**Sector 5 enemy types** (`e.type`)

| Type | What it is | Key fields | Notes |
| --- | --- | --- | --- |
| `boxBomber` | Heavy four-engine bomber, flying in boxes of 3–4. | `e.box` (formation id), `e.climb` (true when entering from the bottom), `e.gunners` (child ids) | High HP. Body contact hurts (it's in the air). A climbing box enters from y > 900, overtakes the player and leaves at the top. A box wipe uses the squadron bonus. |
| `tailGunner` | Destructible gun on a box bomber. | `e.parentId`, `e.ox`, `e.oy`, `e.aim` | Fires aimed bursts toward the player. Dies with its parent. |
| `skyAce` | Elusive interceptor. | `e.dodge` (seconds of sidestep left), `e.lane` | Sidesteps when a main-gun shot column is within about 40 px, on a cooldown, so it isn't immortal. Homing weapons and escort spread counter it. Leads its aim. |
| `foundry` | Armored flying factory platform. | `e.w`, `e.h`, `e.bays` (child ids) | Like a `hull`: huge HP, 35% damage while any bay lives, never fires itself. It's in the air, but body contact does NOT hurt; it flies above the player's layer. Bullets pass under it. |
| `foundryBay` | Bay module on a foundry, or on HALCYON. | `e.parentId`, `e.ox`, `e.oy`, `e.launch` (seconds to the next launch) | Launches `drone` popcorn on a cadence that scales with threat. Its own HP. Dies with its parent. |
| `drone` | Popcorn launched from a bay. | (none) | Dies to one volley. A short aimed shot, or a kamikaze dive toward the player. |

**Hazards** (a new `game.hazards` array; the presentation draws them, the simulation collides them)

| Kind | Fields | Behaviour |
| --- | --- | --- |
| `flakBand` | `y`, `gaps: [x…]`, `gapW`, `warn`, `age`, `state` (`"mark"` or `"burst"`) | Marks its altitude for `warn` seconds (about 1.0), then bursts into short-lived shrapnel bullets along the row, except in the gaps. It is gone after the burst. |
| `laser` | `orient` (`"h"` or `"v"`), `pos`, `from`, `to` (span), `warn`, `on`, `age`, `state` (`"warn"`, `"fire"` or `"off"`), `void` (bool) | A telegraph line during `warn`, then a beam during `on`. It hurts on contact unless the player is rolling. Void lasers are not stopped by the reflector or orbitals (no laser is). |
| `emp` | `x`, `y`, `r`, `charge`, `state` (`"charge"` or `"pulse"`) | When it pulses, escorts are disabled for about 2 s (`player.empTime` seconds, readable by the HUD) unless the player is rolling. |

**Player field:** `player.empTime`, in seconds, is greater than 0 while the escorts are disabled.

**New events**
- `boxEnter {value: climb?"climb":"dive"}`: fires about 1.2 s before entry, so presentation can show the edge warning.
- `flakMark {y}` and `flakBurst {y}`.
- `skyAceDodge`, throttled.
- `foundryEnter`, `foundryDown`, `bayDown {value: parent}` and `droneLaunch`, throttled.
- `laserWarn {orient, pos}`, `laserFire` and `empCharge`.
- `empPulse {value: hitEscorts}` and `empClear`.
- `wingBreak`: HALCYON's death. `bossDown` carries `w, h, angle` and the bays still alive.

Existing boss events carry `stage === 5`.

**Presentation and world**
- `SECTOR_NAMES[5] = "SKYFORGE"`, `FLAGSHIP_NAMES[5] = "HALCYON"`, `FLAGSHIP_CLASSES[5] = "FLYING-WING CARRIER"`, plus the coordinates and tagline above. The kicker reads `ACT II · SECTOR 05`.
- `lightningAt(time, 5)`: a soft violet flicker under the cloud floor, on a period of about 7 s. Thunder is muffled and distant.
- The cover palette gains the dusk climb. Renumber the final dawn palette, keeping it last.
- The page console gets a `body[data-sector="5"]` dusk backdrop and log lines for the new events.
- Hazards must be readable in every effects mode:
  - flak marks and laser warnings read on reduced effects;
  - the EMP ring, and escorts going dark, are clear;
  - nothing in the over-player cloud layer hides bullets or hazards.

**Builder file ownership (sector 5)**
- **Simulation:** `src/game.js`, `src/progress.js`, `test/*` and `qa/*`, plus this contract's "Simulation notes (sector 5)".
- **Combat rendering:** `src/render.js`, `src/ui.js` and `src/pause.js`. This covers enemy, hazard and HALCYON art, the HUD (the EMP state) and the pause route.
- **World and story:**
  - `src/background.js`, `src/art.js`, `src/timeline.js`, `src/ambience.js`;
  - `src/sequences.js`, `src/cinema.js`, `src/frontend.js`, `src/main.js`;
  - `index.html`, the CSS, `README.md` and `PLAYTEST.md`.
- **Audio:** `src/music.js`, `src/soundscape.js`, `src/sfx.js` and `src/audio.js`.
- Builders don't commit; Luna does the git work.

### Simulation notes (sector 5)

Status: round 3 (2026-10-31, simulation and audio iterator), after the round-2 judging (feel 8.0, correctness 9.0, visuals 7.5, performance 9.2, audio 9.0). Round 2 followed the round-1 judging (feel 8.0, correctness 9.0, visuals 6.5, performance 9.3, audio 8.0). **The events and fields come first**, so presentation builders can build against them. Tuning numbers, the drop schedule and the bot tables follow. Every name in the build contract keeps its meaning; the items below are additions or precise definitions.

#### Round 3 summary

**The hesitant-pilot cliff (feel P1).** Measured before changing anything (scripts in `~/knotz2026-dev-archive/s5-sim/r3/`):
- **Clears are noisy.** At 48 runs a row, an unchanged row moves by ±4. Every lever below was screened on 64 seeds (192 runs a row) by total hits, then the final pick was checked on 128 seeds (seeds 100–227). The round-2 16-seed rows are kept for comparison.
- **Every failing run dies inside HALCYON, mostly in phase 3. None dies in the sector.** The sector spends the life budget; HALCYON collects it.
- **HALCYON alone is a large share of the gap.** HALCYON flown alone from a full hull and three lives (`hal5`) clears: reference kit, average 70%, hesitant 59%; P25 kit, average 74%, hesitant 59%.
  - Hesitant P25 pilots who reach HALCYON with every life and full hull clear 10 of 21; average P25 pilots in the same state clear 25 of 34.
  - The hesitant pilot takes only about 1.7 more hits a run than the average one (sector +0.8, HALCYON +0.9). The life budget is tight enough that this costs a fifth of the clears.
- **The sector's aimed fire is diffuse.**
  - At P25, hits per run by source (average → hesitant): interceptors 2.3 → 3.0 (mostly spawned more than 330 px away), tail gunners 2.0 → 2.5, foundry 2's void batteries 2.0 → 2.2, sky aces 1.8 → 2.0.
  - Tail gunners are the only source with close, fast fire: about one hit a run from under 200 px with under 0.6 s of flight.
  - Hits peak in the 50–80 s window: the ace wing, then foundry 2's batteries with both boxes' gunners.
- **What did not help** (64 seeds, within noise):
  - Each of the sector levers alone: the notch full point at 0.85, `FLAK_GAP` 95, the gunner 2-way gate at 0.7, the ace 3-way gate at 0.7, the void battery 5-way gate at 0.75, interceptor early bursts from 0.75. Each changed hesitant P25 total hits by 0.4 or less.
  - A tail-gunner standoff (fire only from 150 px above the ship, not 90). It helped average reference pilots (149 → 160/192) and not hesitant ones, so it was dropped.
- **What did help: a HALCYON pace ease for a mid kit.** Its cooldowns run longer when the ship arrived below the reference kit.
  - Keyed only on the live threat, the ease also catches reference pilots who scatter mid-fight. Average reference clears then rose to 175/192 (44/48), past the sweat ceiling.
  - So the ease is mostly keyed on the threat at spawn, with a small live share.
- **Changes** (all sector 5 only; sectors 1–4 stay bit-identical):
  - `_sectorFive` is full at `SECTOR_FIVE_FULL = 0.85` (was 0.75). A P25 kit (~0.66) meets about 73% of the notch.
  - Sky-ace streams go 3-way above `ACE_WIDE_THREAT = 0.7` (was 0.6).
  - Foundry void batteries go 5-way above `VOID_BATTERY_WIDE_THREAT_S5 = 0.75` (sector 4's deck batteries keep 0.65).
  - `_halcyonPace()` = `_bossPace() × (1 + 0.35·f(spawn threat) + 0.08·f(threat))`, with `f(t) = clamp((0.84 − t) / 0.24, 0, 1)` (`HALCYON_EASE_*`). `boss.easeThreat` holds the threat at spawn. It covers the wingtip fans, lattices, rows, EMP cadence, hangar drones and bay launches.
    - The reference kit (≥ 0.84) meets the authored flagship.
    - A P25 kit at threat 0.68 meets cooldowns about 1.29× longer.
    - A ship at threat 0.6 or less (a scattered arrival, or a bare ship) meets 1.43×.
  - The tail gunners, interceptors, `FLAK_GAP` and the laser gaps are unchanged.
- **EMP (feel P2).** The ring grows with the rank: `r = 120 + 50 × clamp((threat − 0.6) / 0.24, 0, 1)`, rounded, read at spawn (`EMP_RADIUS_FULL = 170`). The lead (0.6 s), the charge (1.2 s) and the roll rule are unchanged.
  - Per pulse in a sustained phase 3 (invulnerable, wing up, reference kit), the average pilot is caught 28% of the time, against 14% at 120 px. The good pilot is caught 41% (was 18%).
  - Per fight that reaches phase 3, reference kit, wing hits per fight (K/M/W): average 0.48/0.70/0.85 (round 2: 0.28/0.57/0.33); hesitant 0.48–0.61; good 1.2–1.6 (round 2: 0.2–0.8). The bot never rolls, so these are worst cases.
- **Owner decision: no mercy life.** Entering sector 5 with two lives or fewer gives no extra life.

**Bots, round 2 code → round 3** (128 seeds, 100–227; values are Kestrel, Manta, Wraith, then the total):

| Pilot | Kit | Round 2 code | Round 3 |
| --- | --- | --- | --- |
| Good | Reference | 127, 128, 128 (383/384) | 128, 128, 128 (384/384) |
| Average | Reference | 95, 102, 104 (301/384, 78%, 37.6/48) | 100, 105, 111 (316/384, 82%, 39.5/48) |
| Average | P25 | 81, 79, 85 (245/384, 64%) | 108, 93, 111 (312/384, 81%) |
| Average | Real arrival | 76/121, 73/114, 68/108 (217/343, 63%) | 93/121, 90/114, 91/108 (274/343, 80%) |
| Hesitant | Reference | 66, 80, 80 (226/384, 59%, 28.2/48) | 83, 80, 90 (253/384, 66%, 31.6/48) |
| Hesitant | P25 | 52, 49, 60 (161/384, 42%, 20.1/48) | 83, 62, 90 (235/384, 61%, 29.4/48) |
| Hesitant | Real arrival | 48/107, 44/104, 27/95 (119/306, 39%) | 59/107, 53/104, 57/95 (169/306, 55%) |

- **Mid kit (P12)**, 64 seeds (100–163): good 188 → 192/192; average 87 → 133/192 (45% → 69%); hesitant 37 → 75/192 (19% → 39%).
- **Good pilot, reference kit, sector hits**: 4.3–4.4 / 4.5–4.7 / 5.4–5.7 (round 2 code: 4.4–4.6 / 4.5–4.7 / 5.3–5.7).
- **Real arrival** reuses each pilot's measured sector-5 arrival kit (`campaign45`, unchanged sector-4 code), cached per seed. It starts at threat 0 with full hull and three lives, as in round 2.
- **The round-2 seed set** (16 seeds, comparable with the round-2 table), round 3 code:
  - Good: reference 48/48, P25 48/48, mid 48/48, real arrival 48/48.
  - Average: reference 41/48, P25 34/48, mid 31/48, real arrival 31/41.
  - Hesitant: reference 37/48, P25 28/48, mid 22/48, real arrival 28/40.
  - On 16 seeds alone these rows read high. The 128-seed table above is the measure.
- **The trade.** Every HALCYON or sector lever measured helped the average and hesitant pilots about equally at the same kit; none favoured a slower reader. So hesitant reference and average reference rise together.
  - With the live share at 0.12 (the `c9` candidate), hesitant reference reaches 264/384 (33.0/48), but average reference reaches 335/384 (41.9/48).
  - Round 3 keeps the sweat ceiling instead.

#### Round 2 summary

**The under-kitted wall (feel P1).** Round 1 eased off too early: a P25 kit (threat 0.65–0.75 in the sector) already met the full sector-5 notch and about ×2.0 heavies, and HALCYON held it for 96–114 s. Measured first, then fixed:
- **Real arrival kits.** A new campaign runner (`campaign45`) flies sector 4 and LEVIATHAN with the dodging pilot from the P25 sector-4 kit, then records what it carries into sector 5. Median arrival kits (seeds 0–18, 16 per ship):

| Pilot | Reaches sector 5 | Power (q25 / median / q75) | Escorts | Sidewinder | Signature | Shield | Lives | Hull |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Good | 48/48 | K 34/35/42, M 19/24/36, W 20/28/34 | 4–6 | 8–10 | 4–10 | 1–2 | 3.7–4.0 | 3.4–3.8 |
| Average | 41/48 | K 10/15/25, M 10/18/19, W 6/10/18 | 0–6 | 3–9 | 4–10 | 1–2 | 2.6–3.4 | 2.9–3.6 |
| Hesitant | 40/48 | K 14/19/26, M 8/9/14, W 8/11/14 | 0–6 | 5–11 | 2–10 | 1–2 | 2.5–3.4 | 3.5–3.6 |
| Mortal | 4/48 | P4–14 | 0–6 | 0–7 | 0–7 | 1–2 | 2–3 | 2.5–4 |

  - An average pilot arrives well below the P25 kit in power (about P15) but with most of its equipment. A mortal pilot rarely reaches sector 5 at all (4/48), so sector 5 is not tuned for it.
- **Changes** (all sector 5 only; sector 4 stays bit-identical):
  - `RESCUE_THREAT_S5 = 0.6` (sector 4 keeps `RESCUE_THREAT` 0.5): leads pay rescue power up to threat 0.6. The 48 s ace wing now has a rescue lead.
  - The sector-5 notch (`_sectorFive`) fades in from threat 0.15 and is full at 0.75 (was 0.6).
  - Heavies: `HEAVY_FULL_THREAT = 0.84` on an eased ramp (`HEAVY_EASE` 1.6). The reference kit still meets ×2.2; a P25 kit at threat 0.68 meets ×1.84 (round 1: ×2.09).
  - **HALCYON campaign mercy** (`_halcyonMercy`, never in drills, as Act I's flagship mercy): HP ×0.55 at arsenal 30 or less, rising linearly to full at arsenal 100. A reference pilot arrives at arsenal about 117, so it meets full HP; the reference kill is held by the learn windows anyway.
- **HALCYON's bays (visual P2).** Bays get up to ×2.6 HP from threat 0.7 to 0.84 (`HALCYON_BAY_RANK`), read at spawn. With the reference kit, the last bay now falls at 12.5–17.8 s (round 1: 6.7–8.8 s). Weaker kits are unchanged.
- **Reflector (feel P2).** The reflector beat moved from 44.5 s to 43.5 s. The engaged collector now picks it up at 44.9–45.3 s in 22 of 24 runs (round 1: 45.9–46.4 s, 19 of 24), 3.8 s before the ace wing fires. The test now requires the pickup on every ship.
- **EMP (feel P2).** The ring leads the ship: it is centred where the ship will be in 0.6 s (`EMP_LEAD`). Holding a straight line is caught; a turn or a roll escapes. Damage and duration are unchanged.
- **EMP resets (correctness P2-3, perf P1-A).** A scatter, a lost life, HALCYON's death and a sector change clear `player.empTime` and send `empClear {value: "reset"}`.
- **Hesitant pilot (feel P2).** A new bot profile: latency 0.3 s, and hazard telegraphs (flak marks, laser warnings, EMP rings) noticed 0.25 s late.

**Bots, before and after** (clears; seeds 0, 5–9, 99, 1234, 11–18; values are Kestrel, Manta, Wraith, then the total):

| Pilot | Kit | Round 1 | Round 2 |
| --- | --- | --- | --- |
| Good | Reference | 16, 16, 16 (48/48) | 16, 16, 16 (48/48) |
| Good | P25 | 15, 16, 16 (47/48) | 16, 16, 16 (48/48) |
| Good | Mid (P12) | 11, 15, 13 (39/48) | 16, 16, 15 (47/48) |
| Good | Bare | 0, 0, 0 (0/48) | 1, 6, 0 (7/48) |
| Good | Real arrival | 16/16, 16/16, 13/16 (45/48) | 16/16, 16/16, 16/16 (48/48) |
| Average | Reference | 12, 16, 11 (39/48) | 12, 11, 13 (36/48) |
| Average | P25 | 2, 5, 4 (11/48) | 11, 9, 13 (33/48) |
| Average | Mid | 1, 0, 1 (2/48) | 7, 10, 6 (23/48) |
| Average | Bare | 0, 0, 0 (0/48) | 0, 0, 0 (0/48) |
| Average | Real arrival | 4/14, 2/13, 2/14 (8/41) | 10/14, 8/13, 9/14 (27/41) |
| Hesitant | Reference | 3, 7, 8 (18/48) | 8, 11, 10 (29/48) |
| Hesitant | P25 | 2, 4, 2 (8/48) | 4, 7, 9 (20/48) |
| Hesitant | Mid | 0, 0, 1 (1/48) | 2, 1, 9 (12/48) |
| Hesitant | Bare | 0, 0, 0 (0/48) | 0, 0, 0 (0/48) |
| Hesitant | Real arrival | — | 2/13, 6/13, 7/14 (15/40) |
| Mortal | Real arrival | 0/4 | 0/4 |

- "Real arrival" flies sector 5 from each pilot's own measured arrival kit, at threat 0 with a full hull and three lives (the same start as the other rows).
- **Flown straight on from LEVIATHAN** (the lives, hull and bombs it has left): average 3/41 → 13/41, hesitant 10/40, good 48/48. Lives decide it: of the average pilots, the 12 who arrive with one or two lives clear none, those with three clear 4/16, and those with four clear 9/13.
- **Sector 4 with the same bot and the P25 kit** (unchanged code): good 48/48, average 41/48, hesitant 40/48, mortal 4/48.
- **Hits** (sector / HALCYON, K/M/W), average pilot: reference 6.9/7.8/8.9 and 9.4/14.7/10.3; P25 8.3/8.8/10.8 and 11.4/17.0/10.3 (round 1: 8.8/10.0/11.4 and 13.6/17.7/12.8). Good pilot, reference: 4.9/4.6/6.4 and 3.4/6.8/4.2.
- **The gradient now runs like sector 4's.** For the average pilot: reference 75%, P25 69%, real arrival 66%, mid 48%, bare 0%. Round 1 had reference 81%, P25 23%, mid 4%.

#### Events and fields for presentation

**Campaign**
- `CAMPAIGN_STAGES = 5`. LEVIATHAN → sector 5 is an ordinary 3.5 s interlude (`_transitionLength` 3.5, no `actTwo`). Victory follows HALCYON. Entering sector 5 adds one hull point and one bomb, as sector 4 entry does.
- `stageGoal[5] = 100`. Sector 5 has no lane sweeps (`lane` events); flak bands take their place.
- `startDrill(5)` starts HALCYON with the sector-5 reference kit (below). `progress.js` already follows `CAMPAIGN_STAGES`, so `bossSeen`, `bestClears` and drill records accept 5.

**Sector-5 reference kit** (measured; see "Reference kit" below): **power 43, 6 escorts, sidewinder 12, signature 12, shield 3** (threat about 0.86). Drill 5 uses it. HUD readers should expect power in the 40s and sidewinder/signature levels past 10 in sector 5.

**Enemies** (all in `game.enemies`; every one sets `e.angle`, 0 = nose down, as before):

| Type | Fields | Notes |
| --- | --- | --- |
| `boxBomber` | `box` (formation id), `climb` (true: enters from the bottom, nose up, `angle = π`; false: dives from the top, nose down), `gunners` (child ids, dead ones kept), `gunnersAlive`, `hidden` (true while waiting off-field or below y 905), `lead` (true on the box lead) | r 30. Body contact hurts. Not hit while `hidden`. The box flies as a unit; a box wipe pays the squadron bonus. |
| `tailGunner` | `parentId`, `ox`, `oy` (offset from the bomber; `oy` > 0 is toward the bottom of the screen), `aim` (radians toward the player, slewing) | r 10. Fires aimed 3-round bursts only once its bomber is above the player. A shot over a live gunner hits the gunner first, as with hull turrets. Never hurts on contact (the bomber body does). Dies with its bomber. |
| `skyAce` | `dodge` (seconds of sidestep left; > 0 while dodging), `dodgeDir` (−1 or 1), `dodgeCool`, `lane` (the x it hovers on) | r 16. Enters from the top, hovers and weaves on its lane, leads its aim, then climbs away. |
| `foundry` | `w`, `h` (half-extents; an ellipse for shots), `bays` (child ids), `baysAlive`, `turrets` / `turretsAlive` (void batteries, `hullTurret` children with `gun: "void"`; foundry 2 only), `large` (true for foundry 2) | Scrolls down. ×0.35 damage while any bay lives. Never fires, never hurts on contact; enemy bullets pass under it. |
| `foundryBay` | `parentId` (a foundry or HALCYON), `ox`, `oy`, `launch` (seconds to the next launch), `open` (0..1, the bay doors; opens over the 0.45 s before a launch, closes after) | r 18. Foundry bays launch drones; HALCYON's bays launch interceptor squadrons. Dies with its parent. |
| `drone` | `dive` (true: a kamikaze that locks `heading` at the player and dives; false: fires one short aimed shot and peels off), `drift` (true: the flak corridor's drifting popcorn, which never peels) | r 9. Popcorn: one volley. Contact hurts. Divers fly only against a kitted ship (threat ≥ 0.3). HALCYON's core hangar also drops drone pairs in phases 2 and 3. |

**Hazards**: `game.hazards` (array, cleared when a flagship arrives, at each HALCYON phase change, when it dies and between sectors; a bomb clears flak bands and lasers but not EMP rings). Every hazard has `id`, `kind`, `age` (seconds since spawn) and `state`.

| Kind | Fields | Behaviour |
| --- | --- | --- |
| `flakBand` | `y`, `gaps` (gap centre x values), `gapW` (gap width, px), `warn` (mark seconds), `state` (`"mark"`, then `"burst"`), `spread` (shrapnel reach above and below `y`, px) | Marks its altitude for `warn` s, then bursts: shrapnel bullets (`kind: "amber"`, r 4.4, with `ttl`) spawn along the row except inside the gaps and fly a short way up and down. The hazard then stays in `"burst"` for 0.5 s (for the flash) and is removed. Shrapnel is ordinary bullets: reflector, orbitals and Kestrel flak can stop it. |
| `laser` | `orient` (`"h"` or `"v"`), `pos` (y for `"h"`, x for `"v"`), `from`, `to` (span along the other axis), `width` (half-thickness, px), `warn`, `on`, `state` (`"warn"`, `"fire"`, `"off"`), `void` (bool), `frame` (id shared by the bars of one lattice) | A telegraph line for `warn` s, then a beam for `on` s, then `"off"` for one frame before removal. It hurts on contact (a hit, through shields as usual) unless the player is rolling or invulnerable. Reflector and orbitals never stop a laser. `void: true` lasers are phase 3's violet look; behaviour is the same. |
| `emp` | `x`, `y`, `r`, `charge` (0..1), `chargeTime` (s), `state` (`"charge"`, then `"pulse"`) | A ring that charges for `chargeTime` (1.2 s), then pulses once. It is placed where the ship will be in 0.6 s (round 2), so holding a straight line is caught. Round 3: `r` grows with the rank at spawn, from 120 px at threat 0.6 or less to 170 px at 0.84 and above. If the player is inside `r` and not rolling, the escorts are disabled for `EMP_TIME` (2.0 s). The `"pulse"` state lasts 0.35 s for drawing, then the hazard is removed. |

**Player**: `player.empTime` (seconds, > 0 while the escorts are disabled; the full disable is 2.0 s, so `empTime / 2` is a ready fraction). It is reset to 0 on a scatter, a lost life, HALCYON's death and a sector change. Disabled escorts keep flying in formation but do not fire. `player.vx`, `player.vy` (px/s, every sector) are the ship's velocity; the sky aces lead with it.

**Pickups**: sector-5 authored drops carry `tag` (`"<beat time>:<type>"`), and their `pickup` event carries the same `tag`. It exists so the drop schedule can be measured at collection; presentation may ignore it.

**HALCYON** (`this.boss`, `stage === 5`)
- `boss.name = "HALCYON"`, `boss.halcyon = true`, `boss.w = 220`, `boss.h = 70` (collision ellipse), `boss.r = 70`.
- `boss.bays` (three `foundryBay` ids, dead ones kept) and `boss.baysAlive`. In the campaign, `boss.maxHp` is below 240,000 for a short kit (the mercy, under "HALCYON" below); drills always have 240,000. While any bay lives, core damage is ×0.25, in every phase (as LEVIATHAN's turrets).
- `boss.lattice` (0..1): how far the lattice emitters have deployed (phase 2 on). `boss.eclipse` (0..1): the phase-3 eclipse glow.
- Phase 1, "Three bays": the bays launch interceptor squadrons; the wingtips fire fans. Phase 2, "Lattice": laser frames (`laser` hazards). Phase 3, "Eclipse protocol": void lasers, void bullet rows and `emp` hazards, then the desperation curtain on the guard floor.

**New events** (`x, y` is the natural point of each)
- `boxEnter {x, y, value: "climb" | "dive", count, xs: [x…], lead: 1.2}`: fires 1.2 s before the box enters; `x` is the box centre, `y` 900 for a climb and 0 for a dive, `xs` the bombers' lanes.
- `flakMark {x: 270, y, value: gapCount, gaps, gapW, warn}` and `flakBurst {x: 270, y, count}` (count = shrapnel spawned).
- `skyAceDodge {x, y, value: dir}`: at most one per 0.3 s.
- `foundryEnter {x, y: 0, value: "small" | "large"}`, `foundryDown {x, y, value: "small" | "large"}`.
- `bayDown {x, y, value: "foundry" | "boss"}`: a bay shot down (bays lost with their parent are silent).
- `droneLaunch {x, y, count}`: coalesced, at most one per 0.25 s.
- `laserWarn {x, y, orient, pos, value: void, count, bars: [{orient, pos, from, to}]}`: one per lattice frame, when its telegraph starts. `laserFire {x, y, count, value: void}`: one per frame, when the beams go live.
- `empCharge {x, y, r}`, `empPulse {x, y, value: hitEscorts}` (true when the pulse disabled a live wing), `empClear` (the wing is back). **Round 2:** `empClear {value: "reset"}` is sent when the disable is cut short: by a scatter or a lost life (the escorts are gone), by HALCYON's death, or by a sector change. The natural reboot has no `value`. Audio plays the reboot chirp only for a natural clear with escorts flying.
- `gunnerFire {x, y, value: rounds}`: a tail gunner starts a burst (audio's request; one per burst).
- `wingBreak {x, y, value: 5, w, h, angle}`: HALCYON's death, in the same frame as `bossDown`. HALCYON's `bossDown {x, y, value: 5}` also carries `w, h, angle` and `bays: [{ox, oy}]`, the bays still alive at the end.
- Existing events gain `stage === 5` where they carry the stage (`bossEnter`, `bossPhase`, `bossDown`, `stage`). Interceptors, scavengers, mines and their events are reused unchanged.

#### Reference kit

The no-hit engaged collector (the arsenal-r3 regression bot: invulnerable, fire held, lines up under the lowest enemy, detours to pickups within 300 px) flew the whole Act I and sector 4 campaign on the pre-sector-5 code, seeds 0–7. This is what it carried into sector 5, counting LEVIATHAN's spoils:

| Ship | Power | Escorts | Sidewinder | Signature | Shield | Threat |
| --- | --- | --- | --- | --- | --- | --- |
| Kestrel | 42–44 | 6 | 10–16 | 11–14 | 3 | 0.85–0.86 |
| Manta | 45–48 | 6 | 10–14 | 9–13 | 3 | 0.86 |
| Wraith | 42–44 | 6 | 11–18 | 10–13 | 3 | 0.86–0.87 |

- **The sector-5 reference kit is P43, E6, M12, ★12, S3** (arsenal 87, threat 0.858). Drill 5 uses it.
- Sector 4 snowballs a full kit: its 20-odd squadron wipes each pay an equipment item, and LEVIATHAN's deck turrets pay power plus a ladder item. The collector gains about 18 power and 8 levels each of sidewinder and signature in sector 4.
- **Raw flagship DPS** (invulnerable tracker, guard ignored): Kestrel 3,745, Manta 4,747, Wraith 4,264. The P25 kit gives 2,194 / 2,449 / 2,300, so the reference kit is about 1.75× the sector-4 kit.
- The rank saturates: the reference kit sits at threat 0.84–0.88 through the whole sector. Sector 5 therefore makes itself harder with authored density, HP and the knobs below, not with the rank.

#### HP curve and rank knobs

- **Heavies** (bombers, gunners, aces, foundries, bays, foundry batteries) use `ACT_TWO_HP_SCALE[5] = 2.2` (it was ×1.35 on the old +35% rule) **at threat 0.84 or more** (`HEAVY_FULL_THREAT`; round 1 used 0.75). Below that the scale falls on an eased ramp, `f^1.6` with `f = (threat − 0.3) / 0.54`, to ×1.35 at `LOW_THREAT` (0.3). It is read when the craft spawns.
  - The reference kit (about 0.84–0.86) meets ×2.2. A P25 kit (about 0.68) meets ×1.84 (round 1: ×2.09); threat 0.6 meets ×1.68.
  - A stripped or P12 ship meets softer heavies, which is its path back.
- **Popcorn** (interceptor, scavenger, mine, enemy torpedo, drone) stays on ×1.35 (`POPCORN_HP_SCALE`): an interceptor has 74 HP, a drone 41 HP. A P43 Kestrel volley deals about 195, so popcorn still melts, and a weak ship can still wipe squadrons and reach its rescue leads.
- **Base HP** (before the scale): bomber 1,600, tail gunner 420, sky ace 1,000, drone 30. Foundry 1 (small): 9,000, with 1,100 bays. Foundry 2 (large): 11,000, with 1,300 bays and 1,600 void batteries. At ×2.2, foundry 1 is 19,800 and an ace is 2,200.
- **Weak-kit damage**: the ×1.5 bonus that hull turrets get below threat 0.3 now also covers the bays, gunners, bombers, aces and foundries (`WEAK_KIT_TYPES`). Sector 4's hull turrets are unchanged.
- **Sector notch**: sector 5's own fire runs ×1.12 faster (`SECTOR_FIVE_SPEED`) on ×0.88 cooldowns (`SECTOR_FIVE_PACE`) on top of the shared rank. Both fade in linearly from threat 0.15 and are full at `SECTOR_FIVE_FULL` 0.85 (round 2: 0.75; round 1: 0.6), so a stripped ship meets sector 4's curve and a P25 kit meets about 73% of the notch. HALCYON uses `_halcyonPace()` (round 3; see "HALCYON").
- **Rescue power**: sector 5 pays rescue power below threat 0.6 (`RESCUE_THREAT_S5`; sector 4 keeps 0.5). Every interceptor, box and HALCYON-bay squadron lead without an authored drop carries it, and so does the 48 s ace wing's lead.
- **Time on screen** (good dodger, invulnerable, reference kit; median / 90th percentile):
  - interceptor 0.30 / 0.78 s; drone 0.38 / 1.53 s;
  - sky ace 2.48 / 7.23 s; tail gunner 2.42 / 5.73 s; bomber 5.95 / 6.27 s;
  - foundry bay 1.88 / 6.53 s; foundry 1 5.2 / 8.8 s; foundry 2 13.2 / 18.4 s; foundry 2's void batteries 10.4 / 13.9 s.
  - Sector 4 with its P25 kit, for comparison: destroyer 8.6 s, cruiser 10.4 s, interceptor 0.35 s.

#### Enemy and hazard numbers

- **Bomber boxes**: three bombers in a wedge (four for the 62 s climb), aimed at the ship's lane when the box is called. `boxEnter` fires 1.2 s before entry.
  - A climbing box rises at 170 px/s and a diving box falls at 120 px/s. Body contact hurts.
  - Each bomber has one tail gun, and the lead has two. They fire 2–3-round aimed bursts (2-way above threat 0.55) on a 1.15 s cooldown, and only once their bomber is above the ship (y < ship − 90).
  - The box lead carries rescue power below threat 0.6.
- **Sky aces** enter from the top, hover at y 285–335 and weave ±34 px on their lane. They leave after 7.5 s.
  - Each burst is 2–4 rounds (3-way above threat 0.7; round 2: 0.6) at 310 px/s ×rank, on a 1.5 s cooldown. The aim leads by the full flight time. A ship flying orbitals or a reflector meets a void last round.
  - The sidestep fires when a main-gun shot (`shot`, `lance` or `pierce`) is below the ace and within 40 px of its column. It lasts 0.42 s at 360 px/s (about 150 px), then a 1.2 s cooldown follows. Homing, escort and flak fire are never dodged.
- **Foundry bays** launch drones every 3 s ×pace: 2, or 3 at volley share 0.7 or more. Every second drone is a diver against a kitted ship.
  - A diver locks its heading after 0.42 s and accelerates to 380 px/s.
  - A shooter fires one aimed round at 240 px/s, then peels off to the side.
- **Flak bands**: 1.0 s mark; shrapnel every 26 px along the row, outside two 80 px gaps, at 120 px/s for 0.55 s (reach 66 px above and below the row). One gap is within ±150 px of the ship, the other across the field.
  - **Corridors and the gauntlet** (24 s and 83.5 s) mark three bands together at the ship's altitude and ±120 px. They burst 0.35 s apart. The bands' reach overlaps, so the pilot threads a stepped path of gaps, each 45–75 px from the last.
  - **Single bands** (41, 49.6, 72.5 and 95.5 s) mark at the ship's altitude when their turn comes.
- **Lasers** (HALCYON): 0.9 s warning, 0.8 s beam, 9 px half-width.
  - **Columns**: bars every 128 px, leaving 110 px between them.
  - **Two rows**: each row has a 112 px gap; the second row warns 0.35 s later, and its gap moves 70–120 px.
  - **Cross**: a row at the ship's altitude, plus two columns 175 px either side of its gap.
  - A test pins every frame's gap at 96 px or more.
- **Foundry 2's void batteries** fire 3-way, or 5-way above threat 0.75 (round 3; sector 4's deck batteries keep 0.65).
- **EMP** (HALCYON phase 3): a ring of 120 px (threat 0.6 or less) to 170 px (threat 0.84 and above; round 3, read at spawn) charging 1.2 s, centred where the ship will be in 0.6 s (`EMP_LEAD`: position + velocity × 0.6, clamped to x 70–470 and y 300–780). The pulse disables the wing for 2.0 s unless the ship rolls or is outside the ring.
  - A ship drifting in a straight line at under about 210 px/s ends inside the ring. A turn, a roll, or a full-speed dash out escapes. A still ship gets the ring on itself, as in round 1.
  - Round 2: the good bot lost the wing 0.1–0.6 times per fight (round 1: 0.8–1.1). It changes direction constantly, so a 120 px ring was usually ahead of where it ended up.
  - Round 3: with the 170 px ring the average bot loses the wing about 0.5–0.85 times per reference fight and the good bot 1.2–1.6. A drift out no longer escapes; a turn back or a roll does.

#### HALCYON

- **HP 240,000**. Three bays of 1,800 base HP. Each drops power plus a ladder item and scores 3,000. Core ×0.25 while any bay lives.
- **Bays hold against a full kit** (round 2): on top of the heavy scale, a bay gets up to ×2.6 HP from threat 0.7 to 0.84 (`HALCYON_BAY_RANK`), read at spawn. The reference kit's bays have 10,296 HP (round 1: 3,960); a P25 kit's are unchanged. "Three bays" now reads: with the reference kit the last bay falls at 12.5–17.8 s.
- **Campaign mercy** (round 2; never in drills): `HP × (0.55 + 0.45 × clamp((arsenal − 30) / 70))`, read at spawn. That is ×0.55 at arsenal 30 or less, ×0.68 at 50 (a typical P25 arrival after a sector of scatters), ×0.92 at 87 (the reference kit) and full at 100 or more (a reference pilot arrives at about 117). It follows Act I's flagship mercy: an under-kitted arrival meets a shorter fight, and a drill always meets the authored flagship.
- **Mid-kit pace (round 3)**: `_halcyonPace()` = `_bossPace() × (1 + 0.35·f(boss.easeThreat) + 0.08·f(threat))`, `f(t) = clamp((0.84 − t) / 0.24, 0, 1)`. `boss.easeThreat` is the threat at spawn. Every HALCYON cooldown and bay launch uses it. The reference kit meets the authored flagship. A P25 kit at threat 0.68 meets cooldowns about ×1.29 longer; a ship at threat 0.6 or less meets ×1.43. The kill times below are unchanged: the learn windows and HP set them, not the fire.
- **Learn windows 24 / 48 / 74 s**. `BOSS_GUARD_PAR[5] = 0.017` (the reference kit's share per second). Guard K is 20, as LEVIATHAN's.
- **Phase 1, "Three bays"**: each bay launches a three-craft interceptor squadron (a loop out of the bay, no wipe bonus, rescue lead) every 6 s × `_bossPace`. The wingtips fire 5–7-bullet fans every 1.7 s × pace (1.3 s once the bays fall). The core fires a 3-way aimed spread on alternate salvos, and every salvo once the bays fall.
- **Phase 2, "Lattice"**: a laser frame every 2.9 s × pace, cycling columns, rows and cross. A 3-way aimed spread comes every 2.3 s; every third is void for a void-aware kit. Slow 5-bullet wingtip fans come every 2.4 s. The core hangar drops a drone pair every 4.2 s; one drone carries rescue power, like LEVIATHAN's torpedoes.
- **Phase 3, "Eclipse protocol"**:
  - void laser frames every 3.4 s;
  - a full-width void row with a 116 px gap every 3.0 s;
  - an EMP ring every 5.2 s;
  - a 3-way void spread every 3.2 s;
  - hangar drones as in phase 2.
- **The desperation curtain**: on the final guard floor the lattice stops. Rose rows with two drifting gaps come every 0.85 s, and void rows and EMPs slow down.
- **Kill times** (round 2; invulnerable tracker, shooting bays first, collecting drops; HALCYON is spawned at each kit's own rank). Each cell is the kill time, then the times of phases 2 and 3 in brackets, then when each bay fell:

| Kit | Kestrel | Manta | Wraith |
| --- | --- | --- | --- |
| Reference (P43), drill | 76.8 s [35.9 / 55.0], bays 7.8 / 11.8 / 17.8 | 73.4 s [27.7 / 47.7], bays 5.8 / 7.4 / 12.5 | 73.9 s [29.5 / 48.0], bays 5.1 / 9.2 / 14.3 |
| Arrival (P56, M22, ★19), drill | 72.9 s | 69.8 s | 70.4 s |
| P25, drill (no mercy) | 112.0 s | 95.2 s | 102.3 s |
| P25, campaign (mercy) | 76.2 s [32.7 / 52.7] | 73.9 s [27.0 / 47.9] | 74.1 s [28.5 / 48.0] |
| Mid (P12), drill / campaign | 161.7 / 96.6 s | 151.2 / 89.7 s | 152.9 / 90.3 s |
| Bare (P2), drill / campaign | 249.0 s (3.2×) / 159.0 s | 209.3 s (2.9×) / 134.0 s | 235.9 s (3.2×) / 148.4 s |

  - Round 1, for comparison: reference 73.1–74.0 s with the bays down at 6.7–8.8 s; P25 96–114 s.
  - Targets: 65–85 s for the reference kit, about 3× for a bare ship (the drill, with no mercy). In the campaign, the mercy brings a P25 kit to the learn windows (74–76 s, as LEVIATHAN for its kit), and a bare ship to about 2×.
  - The arrival kit is what the no-hit collector holds when HALCYON arrives, after a sector of squadron bonuses.
  - Tests pin the reference kill at 65–85 s with the last bay down at 11–19 s, and the bare drill kill at 190–290 s.

#### Drop schedule

Sector 5's beats are on `STAGE_BEATS[5]`, which is `SECTOR_FIVE_BEATS`. Act II beats may now carry drops:
- `lead` rides the formation lead: the squadron, box or ace lead.
- `heavy` rides the foundry.
- `bays` rides the foundry bays, in order.

"Collected" is the first pickup by the engaged collector over 8 seeds × 3 ships (24 runs). "Attack" is the first shot of the beat it answers, measured the same way. Every gap is measured at collection.

| Beat (s) | Drop | Collected | Answers | Attack | Worst gap |
| --- | --- | --- | --- | --- | --- |
| 2.5 loop L | lead: sidewinder | 7.8–7.9 | 10 s sky-ace pair (homing counters the sidestep) | 11.1 | 3.2 s |
| 7.2 sweep L | lead: signature | 8.3 | Ace streams, then the 14 s box's gunners | 11.1 / 17.2 | 2.8 s |
| 15.5 sweep R | lead: shield | 17.4–18.1 | The 24 s flak corridor (first sustained hazard) | 25.0 | 6.9 s |
| 29.5 sweep R | lead: power | 31.5–32.8 | Foundry 1 (armor, heavy plus popcorn) | 36.7 | 3.9 s |
| 34 foundry 1 | bays: power, signature, power; heavy: power ×2 | signature 39.8–42.0 | The 45.5 s box's gunners, then the ace wing | 48.1 / 49.1 | 6.1 s |
| 43.5 rise R | lead: reflector (6 s) | 44.9–45.3 (22 of 24 runs) | The ace wing's streams and shrapnel (and the box's gunners) | 48.7 / 49.1 | 3.4 s (box), 3.8 s (wing) |
| 54.5 sweep L | lead: signature | 55.8–59.7 | The peak: foundry 2's void batteries and the boxes' gunners | 63.7 | 4.0 s |
| 60 foundry 2 | bays: power, shield, power, sidewinder; heavy: power ×2 | shield 66.3–67.8; sidewinder 67.8–76.2 | Shield: the 72.5 s flak pair. Sidewinder: the 87.5 s ace pair | 73.5 / 88.6 | 5.7 s / 12.4 s |
| 75 rise both | lead: shield | 76.3–77.7 | The 83.5 s flak gauntlet | 84.5 | 6.8 s |
| 92.5 rise both | lead: power | 93.5–94.2 | HALCYON (100 s) | — | — |

- Rescue power rides every interceptor and box lead without an authored drop, as in sector 4.
- The reflector moved to 43.5 s in round 2. It is now collected 3.4 s before the 45.5 s box's gunners and 3.8 s before the ace wing. The engaged collector misses it in 2 of 24 runs (Manta seed 1234, Wraith seed 5): the rise lead dies at about y 760 on the right edge while the collector is at x 100–120, and the collector ignores pickups more than 300 px away. Round 1 missed it in 5 of 24.
- Rise leads near the bottom edge cost the collector other drops too: the 92.5 s power is collected in 15 of 24 runs. A slower sink for low authored drops was tried and did not help this collector, so it was not kept.
- **Full beat list** (s):
  - 2.5 loop L, 4.9 loop R, 7.2 sweep L;
  - 10 ace pair, 14 box climb, 15.5 sweep R, 18.5 rise R, 21 ace pair;
  - 24 flak corridor plus six drifting drones;
  - 29.5 sweep R, 31 ace pair, 34 foundry 1, 37 loop L, 40.5 rise L, 41 flak pair, 43.5 rise R, 45.5 box climb;
  - 48 ace wing (five aces, rescue lead) plus a flak band;
  - 54.5 sweep L, 56 rise R;
  - **The peak:** 60 foundry 2, 62 box climb ×4, 65.5 box dive;
  - 72 sweep R, 72.5 flak pair, 75 rise both;
  - 82 pincer sweep, 83.5 flak gauntlet, 87.5 ace pair, 89.5 pincer loop, 92.5 rise both, 95.5 flak pair.
- A test pins four of these pairs on every ship: sidewinder, shield, reflector and foundry signature, each at least 2 s before its attack.

#### Balance bots

- **Round 3 additions** (scripts in `~/knotz2026-dev-archive/s5-sim/r3/`):
  - `lib3.mjs` re-exports `../lib.mjs` and adds the following runners:
    - `fire5`: sector-only fire and hits by source per 10 s;
    - `range5`: the range and flight time of each hit;
    - `hal5`: HALCYON alone as a campaign flagship;
    - `emp5`: sustained phase 3, EMP catches per pulse;
    - `run5b`: lives and hull at HALCYON arrival and each phase.
  - The other tools:
    - `mkvar.mjs` builds patched `game.js` variants from the round-2 source (`r2-final-game.js`);
    - `table.mjs` takes 64- or 128-seed rows, with cached arrival kits (`arrivals.json`, `arrivals64.json`, `arrivals64b.json`) and a total-hits column;
    - the sweeps are `sweep1.txt`–`sweep9.txt`, and `r3-game.js` is the snapshot.
  - The limiter probe is `audio/limprobe.mjs`: HALCYON phase 3, reference kit, every level at full, the glue peak per window, and the events behind each top peak.
- **Round 2 additions** (scripts in `~/knotz2026-dev-archive/s5-sim/r2/`: `table.mjs`, `arrive.mjs`, `arrival5.mjs`, `diag-cont.mjs`; `lib.mjs` gains `campaign45`; snapshots `r1-game.js` and `r2-game.js`):
  - **Hesitant profile**: average's attention, noise and horizon, latency 0.3 s (average: 0.22), and hazard telegraphs noticed 0.25 s after they appear. Bullets and craft are seen as before.
  - **`campaign45`**: sector 4 and LEVIATHAN from the P25 kit with the dodging pilot. It records the kit, lives, hull and bombs at sector-5 entry, and can fly on into sector 5.
  - **Kill-time harness**: it now respawns HALCYON after swapping the kit, so the bays read that kit's rank. The round-1 harness kept the reference kit's bays for every kit. It also flies HALCYON as a campaign flagship (mercy on).
  - The round-2 tables are in "Round 2 summary" above. The tables below are round 1's.
- **Bot.** The scratch scripts are in `~/knotz2026-dev-archive/s5-sim/` (`lib.mjs`, `bots5.mjs`, `kt5.mjs`, `drops5.mjs`). The bot is the Act I dodger (good and average profiles unchanged) with two additions and one fix:
  - **Hazards:** it reads flak marks, laser warnings and EMP rings as a human reads a telegraph, always seen. Bomber boxes waiting below the edge show as their shadows.
  - **Lasers:** it never crosses a warned or live laser line.
  - **Planning fix:** it plans from its newest queued decision, not from the one executing. With 0.14 s latency and a 0.06 s replan, three plans are in flight at once. The old bot alternated between them and walked back and forth through a warned laser every 0.2 s. Against moving bullets this two-cycle mostly cancels out, but against a static telegraphed line it is fatal.
- **Runs** start at sector 5 from each kit, at threat 0, with full hull and three lives. Hits include shield hits. Seeds are 0, 5, 6, 7, 8, 9, 99, 1234 and 11–18 (16 seeds).

**Sector 5 plus HALCYON, round 1** (values are Kestrel / Manta / Wraith):

| Pilot | Kit | Clears | Sector hits | HALCYON hits | Scatters (sector) | Steals / returns | Peak bullets (sector / boss) | Threat, sector (mean / max) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Good | Reference | 16/16, 16/16, 16/16 | 4.2 / 5.1 / 6.6 | 3.3 / 6.6 / 5.1 | 2.0 / 3.4 / 5.3 (0.3 / 0.2 / 1.4) | 0.5 / 0.3, 0.3 / 0.2, 2.3 / 1.8 | 145–164 / 100–103 | 0.81–0.84 / 0.88 |
| Good | P25 | 15/16, 16/16, 16/16 | 5.6 / 6.8 / 7.8 | 6.0 / 7.4 / 6.3 | 5.0–6.1 | 0.8–2.1 / 0.8–1.6 | 170–177 | 0.72–0.75 / 0.86 |
| Good | Mid (P12) | 11/16, 15/16, 13/16 | 6.5 / 6.7 / 6.6 | 10.4 / 10.9 / 8.9 | 8.0–12.2 | 1.3–3.4 / 0.9–1.4 | 163–190 | 0.40–0.52 / 0.80 |
| Good | Bare | 0/16 ×3 | 6.9 / 8.1 / 7.5 | — | 10.5–14.5 | — | 75–77 | 0.00 / 0.18 |
| Average | Reference | 12/16, 16/16, 11/16 | 6.9 / 7.1 / 6.8 | 10.1 / 12.5 / 9.4 | 8.9–10.7 | 1.3–3.1 / 0.8–1.9 | 141–174 / 89–103 | 0.81–0.83 / 0.88 |
| Average | P25 | 2/16, 5/16, 4/16 | 8.8 / 10.0 / 11.4 | 13.6 / 17.7 / 12.8 | 14.7–16.1 | 3.1–5.6 / 1.4–3.0 | 169–178 | 0.65–0.70 / 0.85 |
| Average | Mid | 1/16, 0/16, 1/16 | 7.9 / 9.5 / 7.5 | 12–19 | 16–18 | — | 151–184 | 0.31–0.47 / 0.79 |
| Average | Bare | 0/16 ×3 | 8.6–9.3 | — | 8.7–14.5 | — | 75–78 | 0.00 / 0.24 |

- **HALCYON fight length** for clearing runs: good, reference 78–99 s; average 94–110 s.
- **EMP**: the good pilot loses the wing 0.8–1.1 times per fight. It never rolls, so this is the worst case.

**Sector 4 with the same bot**, for comparison (unchanged code, P25 kit, 16 seeds):

| Pilot | Clears | Sector hits | LEVIATHAN hits |
| --- | --- | --- | --- |
| Good | 16/16, 16/16, 16/16 | 3.3 / 4.3 / 5.7 | 2.9 / 5.2 / 3.9 |
| Average | 14/16, 13/16, 14/16 | 4.9 / 4.8 / 6.7 | 7.9 / 12.4 / 8.6 |

Sector 5 runs about one sector hit above sector 4 for the good pilot and about two for the average one. HALCYON costs the good pilot about 1 hit more than LEVIATHAN does, and the average pilot about the same.

**The archived bot's planning, for reference** (no planning fix; the hazard reading and laser rule kept), reference kit:
- Sector 4: good 16/16, 15/16, 14/16 with 4.2 / 3.8 / 6.1 sector hits; average 12/16, 13/16, 10/16. This matches round 2's published sector-4 rows.
- Sector 5: good 10/16, 15/16, 6/16 with 5.6 / 5.9 / 6.8 sector hits and 11–13 HALCYON hits; average 2/16, 5/16, 1/16.
- An indecisive pilot is punished much harder in sector 5 than in sector 4, because sector 5's attacks are static telegraphs that must be committed to.

- **Simulation cost**: about 0.03 ms per 120 Hz tick in the sector-5 peak with a P56 kit.

#### Targets, and misses with reasons

- **Good pilot, reference kit: sector hits 5–7.** Met on average (5.3); Manta is 5.1 and Wraith 6.6. **Kestrel is at 4.2**: its flak screen eats ordinary rounds, and it was also the lowest in sector 4 (3.3).
- **Good pilot, reference kit: about 7/8 clears.** Measured 48/48, so it is easier than the target. With this bot, sector 4's good pilot also clears 48/48, so the target cannot be met while staying a notch above sector 4. With the archived planning, the good pilot clears 31/48. Lowering it further would mean making sector 5 far harder than sector 4 for every pilot.
- **Average pilot, reference kit: 5/8 or better.** Met: 36/48 in round 2 (75%; round 1: 39/48; sector 4 is 41/48 with the same bot). The difference is within the bot's spread (about ±4 of 48).
- **Round 2: average pilot with a P25 kit or the real arrival kit, about 50% or more.** Met: P25 33/48 (69%), real arrival 27/41 (66%), mid 23/48 (48%).
  - **Flown straight on from LEVIATHAN, it is 13/41 (32%).** The miss is the run's life budget, not the kit: 12 of 41 average pilots reach sector 5 with one or two lives, and none of them clear. A full-hull repair or an extra life at sector-5 entry would address it; that changes the campaign's reward economy, so it is left to the lead and owner.
- **Hesitant pilot, round 2.** Reference 29/48, P25 20/48, real arrival 15/40; sector 4 with a P25 kit is 40/48.
- **Round 3 targets** (128 seeds):
  - Hesitant P25 about 30/48: **met within noise** (29.4/48; round 2 code 20.1).
  - Hesitant real arrival about 50%: **met** (55%; was 39%).
  - Average reference at most about 40/48: **held** (39.5/48; was 37.6).
  - Good reference sector hits 4–7: **held** (4.3–5.7).
  - **Hesitant reference about 34/48: missed (31.6/48; was 28.2).** No lever measured separates a slow reader from an average one at the same kit, so lifting hesitant reference to 34 lifts average reference to about 42. The `c9` candidate (live ease share 0.12) reaches 33.0 and 41.9.
  - The round-2 hypothesis that static telegraphs make the cliff did not hold up; the feel judge also found it. Removing the hazard delay changes nothing, and the gap is in diffuse aimed fire plus HALCYON's length for a mid kit.
- **Weaker kits, round 1.** A good pilot had a path (P25 47/48, mid 39/48); an average pilot had little (P25 11/48, mid 2/48).
  - **A bare ship has no path in sector 5** (0/96). It scatters every 10–15 s and never rebuilds past P5 before HALCYON.
  - A bare entry into sector 5 is rare in play: the LEVIATHAN interlude collects every floating salvage token. The in-sector case, a kitted ship scattering, is covered by scavenger returns and the rank-scaled heavies, as the reference rows show.
- **Peak bullets 130–170.** Met for the reference kit (141–174). Weaker kits reach 170–190, because they kill sources more slowly. The peaks fall at 52 s (the ace wing's flak), 70 s (foundry 2 with both boxes) and 84.5 s (the gauntlet).

#### Tests

- **New: `test/sector5.test.mjs`** (22 tests):
  - **Campaign:** the LEVIATHAN → sector 5 interlude (3.5 s, no `actTwo`, +1 hull, +1 bomb), and victory after HALCYON. Sector 5 has no lane sweeps; the full authored sector plays every beat, with peak bullets under 200.
  - **Drill 5:** the reference kit, HALCYON's 220×70 frame with three bays, and threat 0.84–0.88. Career and drill records accept 5.
  - **Sector 4 identity:** sector 4 and LEVIATHAN are bit-identical to golden fingerprints from the pre-sector-5 code. That is 18 runs: three ships × reference, bare and invulnerable-reference kits, from sector-4 entry and from drill 4.
  - **Boxes:** warning, entry, gunners holding fire until above the ship, gunner shielding, children dying with their parent, contact rules, the box-wipe bonus.
  - **Aces:** the sidestep and its cooldown, homing never dodged, leading aim.
  - **Foundry and drones:** foundry armor, drone launches, bays dying with it, no contact; drones melting to one volley, the diver's locked heading.
  - **HP:** the rank-scaled heavies' HP; popcorn and sector 4 unchanged.
  - **Hazards:**
    - flak mark, burst, gaps, short shrapnel life and removal; a ship in a gap is safe;
    - the corridor's stepped gaps;
    - laser warn, fire and off; harmless while warning, hurts through reflector and orbitals, never while rolling;
    - EMP charge, pulse, `empTime`, a silent wing, `empClear`; a roll or leaving the ring protects;
    - a bomb clears bands and lasers but not EMP rings.
  - **HALCYON:**
    - bays armor the core, launch squadrons with no bonus, and each pays a drop;
    - phases 2 and 3 with plain and void lattices (both orientations), EMP in phase 3, the desperation curtain;
    - the reference kill at 65–85 s, the bare kill at 190–290 s;
    - the death pose with the live bays, then `wingBreak`; hazards and children go with it;
    - every lattice gap is 96 px or more.
  - **Determinism and drops:** seeded sector-5 runs are identical. Four key drops are collected at least 2 s before their attacks on every ship.
- **Updated: `test/sector4.test.mjs`.** The campaign test now ends with LEVIATHAN handing over to sector 5. The career test clamps at `CAMPAIGN_STAGES`.
- **Round 2 tests** (`test/sector5.test.mjs`, now 27 tests):
  - New: the EMP ring leads the ship 0.6 s (a straight drift is caught, a turn escapes, a still ship gets the ring on itself).
  - New: a scatter, a lost life, HALCYON's death and a sector change each reset the wing, with `empClear "reset"`; there is no event when nothing is disabled, and a natural reboot has no reset flag.
  - New: a tail gunner sends one `gunnerFire` per burst, with `value` equal to the rounds it fires.
  - New: HALCYON's campaign mercy (full, reference, P25 and floor; drills have none) and the rank-scaled bays.
  - New: sector 5 pays rescue below threat 0.6 while sector 4 keeps 0.5; the 48 s ace wing has a rescue lead.
  - Changed: the reference kill also pins the last bay at 11–19 s. The bare kill respawns HALCYON at the bare kit's rank. The reflector (now 43.5 s) must be collected on every ship; the "missing is fine" escape hatch is gone.
- **Round 3 tests:**
  - `test/sector5.test.mjs` (now 28 tests): the EMP ring scales with the rank (120 px at threat 0.6 or less, 145 at 0.72, 170 from 0.84). The charge test now expects 170 px for the reference kit.
  - `test/audio.test.mjs`: the hum restarts after a pause or an unmute for the time left (two voices, no second pulse, a tracked long cue), never while paused or muted, and not once the wing is back. Combat sits 1.5 dB lower in HALCYON phase 3 only.
  - `qa/act-one.mjs`: the victory copy now reads `SECTOR 04 CLEARED / ACT II CONTINUES`, with a new `SECTOR 05 CLEARED / ACT II CONTINUES` row (it expected `BOTH ACTS CLEARED`).
  - `qa/audio.mjs`: the HALCYON leg runs 30 s with HALCYON held in phase 3, and resuming with the wing down must bring the hum back.
  - Sectors 1–4 stay bit-identical: the golden fingerprints pass.
- **Status:** 200 tests pass, and `scripts/build.mjs` passes. `qa/audio.mjs` and `qa/act-one.mjs` pass.

### Audio notes (sector 5)

Audio builder, round 1. These are the names and fields audio reads, plus one request to the simulation.
- **Request: `gunnerFire {x, y, value: rounds}`.** Emit it once when a tail gunner starts a burst (where `burstLeft` is set). Audio plays one crack per round, 0.12 s apart, matching the shots. There is no generic enemy-fire event, so without it tail-gunner fire is silent. `tailGunnerFire` is accepted as an alias.
- **Fields audio reads:**
  - `boxEnter`: `value`, `x`, `xs` (stereo width) and `lead` (crescendo length).
  - `flakMark`: `y` (tick pitch).
  - `foundryEnter` / `foundryDown`: `value` (`"large"` is heavier).
  - `bayDown`: `value` (`"boss"` is heavier).
  - `laserWarn`: `bars` / `orient` / `pos` (pan) and `value` (void adds a low growl). `laserFire`: `value`.
  - `empPulse`: `value` (`true` powers the escorts down, `false` plays a "saved by the roll" shimmer). `empClear`.
  - `wingBreak`: voices HALCYON's fall. When `wingBreak` is in the batch, or `bossDown.value === 5`, `bossDown` plays only the opening blasts.
- **EMP and escorts:** `shoot` adds a wide escort-fire layer when `player.escorts > 0`. While `player.empTime > 0` that layer is replaced by a sparse fizz, and a dead hum runs from `empPulse` until `empClear`. The hum is a long cue, so pause and mute cut it.
- **Music:**
  - `sector5` is F Lydian at 150 bpm.
  - `warning5` and `boss5` are in F at 156 bpm. HALCYON's lead is the sector melody darkened one mode per phase (Dorian, Aeolian, Phrygian), and each `bossPhase` restarts the phrase on the new mode.
  - LEVIATHAN → sector 5 plays a "climb" variant of the interlude cue. It needs no `actTwo`.
- **Ambience:** the `sector5` bed. Thunder follows `lightningAt(time, 5)`. It is muffled, has no crack and arrives late, as if it comes from below.
- **Tables:** `BOSS_KEYS`, `FLAGSHIP_ROOT` and the sector-clear roots run to 6. A sector without its own score or bed borrows the latest one.
- **Round 2 (EMP hum leaks, harness coverage):**
  - `sfx._cutEmp()` stops the dead hum (`empHum.stop(0.05)`). `lifeLost`, `gameover`, `bossDown`, `wingBreak` and `stage` call it, as does `empPulse` before starting a new hum. Pause and mute already cut it, because it is a tracked long cue.
  - `empClear` always stops the hum. It plays the reboot chirp only when `game.player.escorts > 0` and `value` is not `"reset"`.
  - `test/audio.test.mjs`: the "every gameplay event" list covers all 15 sector-5 events with representative values and fields. A new test checks that the hum stops on each of the five cutting events and on pause, and that empClear chirps only on a natural reboot with a wing.
  - `qa/audio.mjs` adds a HALCYON phase-3 leg: the reference kit, all levels at full, 12 s. It meters the glue stage, which feeds the limiter; the peak must stay under 0.75, and measured 0.61 (the master peaked at 0.58). Then an EMP catches the wing, and a pause must cut the hum.
  - The `sector5` cue's comment now says the only taiko is the phrase-opening hit.
- **Round 3 (limiter headroom, the hum after pause and mute):**
  - **Where the peak comes from.** The probe is `~/knotz2026-dev-archive/s5-sim/r3/audio/limprobe.mjs`: HALCYON phase 3, reference kit, a strafing tracker, every level at full, 72 s a run. Glue peaks before round 3:
    - music alone 0.61–0.63 in every HALCYON phase;
    - effects alone 0.34; ambience alone 0.18;
    - the full mix 0.65–0.68 (3 runs), the perf judge 0.730.
  - The top peaks are a flurry of core hits (`bossCoreHit`, `hit`, `shoot`) landing on the score, sometimes with a `laserFire`. They are not the EMP thoom.
  - Trimming the `boss5` cue level or its phase-3 layers barely moved the peak (0.611 → 0.591), because the score passes its own glue compressor first. Those changes were reverted.
  - **What changed:**
    - **Repeated combat in HALCYON phase 3**: `combatBus` sits at `COMBAT_CEILING × DENSE_COMBAT_TRIM` (0.84, −1.5 dB) while `stage ≥ 5`, `bossPhase === 3` and the game is playing. It ramps with a 0.4 s time constant (`audio.js`, `_applyMix`).
    - **The score in HALCYON phase 3**: the music director's post-compressor trim dips to `MUSIC_TRIM × DENSE_TRIM` (0.55 × 0.89, about −1 dB). It uses the same condition and a 0.6 s time constant (`music.js`, `update`).
    - **`laserFire`** ducks combat to 0.7 for 0.55 s. The beam's 49 Hz weight drops from 0.07 to 0.055, and the void growl from 0.03 to 0.025.
    - **`empPulse`**: the 72 Hz thoom drops from 0.12 to 0.1.
  - **Measured after:**
    - The probe's worst glue peak is 0.655 over 6 × 72 s (per-run peaks 0.626–0.655, against 0.65–0.68 before). That is about 1.2 dB under the 0.75 threshold.
    - The `qa/audio.mjs` HALCYON leg (now 30 s, keyboard strafing, gate unchanged at 0.75) meters 0.677 at the glue and 0.638 at the master.
  - **The hum after pause, mute or effects at 0:**
    - `stopLongCues()` now also clears `sfx.empHum`.
    - Each tick, if play is live (playing, not paused, on the play screen, not muted, effects up) with `player.empTime > 0` and no hum, `sfx.resumeEmpHum(t, empTime)` restarts the two hum voices for the time left. There is no second pulse or chirp. The hum is a tracked long cue again.
    - `sfx._empHum(at, seconds, attack)` is the shared builder; `empPulse` uses it too.


- **Lead decision (round 2): hull repair after LEVIATHAN.** Entering sector 5 now repairs the hull to full (it added one point before). Entering sector 4 still adds one point, so sector 4 opens as tuned. The round-2 bot showed average pilots carrying over from LEVIATHAN on one or two lives cleared nothing; an extra life was not added.

### Sector 6: ZERO MERIDIAN (planned; build after sector 5 passes)

- **Tagline:** "Where the long meridian ends."
- **Setting:** the stratosphere at eclipse, on the 180th meridian. The sea is a distant curve, the sky is black-blue, and auroras pulse with the music.
- **Final Act II flagship, THE SOVEREIGN:** a mirror-ship that copies the player's current arsenal in its patterns (spread, missiles or rails).
  - In phase 2 it steals the player's salvage on any hit.
  - Its final form is a full-screen bullet ballet with void and destructible bullet layers.
- **Act III hook:** its defeat ends Act II, not the whole game. The true ending moves to Act III (the final act, not yet planned). Until Act III exists, victory after THE SOVEREIGN shows the Act II ending plus an "ACT III" tease.

## Part 3: Act I retune (sectors 1–3)

Status: approved direction (2026-10-30). Owner: lead (root thread). This supersedes Goal 3 ("sectors 1–3 are the warm-up").

The owner's playtest verdict on sector 4: "this is how we'd like the game to play." Act I (sectors 1–3) now applies sector 4's lessons from the first second.

- The player's power grows more slowly and on an authored schedule, so it reaches the Act II reference kit right as Act II starts.
- Each sector's attacks are designed around the equipment the player has just been handed.
- Difficulty ramps across Act I toward sector 4, instead of staying a flat warm-up.

Sector 4, LEVIATHAN and the Act II numbers do not change.

### Goals

1. **Slower, earned growth, still no caps.**
   - Escort pairs ("drones") and main-gun power appear less often.
   - A pilot who collects everything as it shows up still reaches the full Act II reference kit when sector 4 starts: power 24–27, 6 escorts, sidewinder 4, signature 4, shield 3, counting the Crown spoils.
   - Nothing is capped. Levels past the ledger still count, and overflow still converts.
2. **Drop placement drives attack design.** Each sector's important drops are authored at specific beats: the kit ledger below.
   - The beats after a drop introduce the attack that the new equipment answers.
   - The beat after that leans on it.
   - Harder attacks are gated behind the drops that prepare the player for them.
3. **Act I ramps toward Act II.**
   - Sector 1 teaches the loop. Sector 2 pressures the kit. Sector 3 is a real test, one notch below sector 4.
   - A ledger-kit pilot should feel Act II's "sweat" approaching rather than hitting a wall at sector 4.
4. **It is Act I.** The game names it: the sector cards, console, pause screen, hangar drills, flight record, field manual and docs.

### Kit ledger (targets)

The targets are for an engaged collector who takes no hits (the arsenal-r3 regression bot) and are measured at flagship arrival. Each ship may sit within ±3 power of the row. Manta's shield overflow puts it at the top of each band, and that is acceptable.

| Point | Power | Escorts | Sidewinder | Signature | Shield (non-Manta) |
| --- | --- | --- | --- | --- | --- |
| Launch | 2 | 0 | 0 | 0 | 0 |
| Vesper arrival | 7–9 | 2 | 1 | 1 | 0–1 |
| Aurelia arrival | 13–16 | 4 | 2 | 2 | 1–2 |
| Crown arrival | 19–22 | 4–6 | 3 | 3 | 2–3 |
| Sector 4 start (after Crown spoils) | 24–27 | 6 | 4 | 4 | 3 |

- **Ramp (engaged collector).**
  - The first escort pair arrives no earlier than about 25 s into sector 1. It was 8–13 s.
  - Power 4 comes no earlier than about 12 s. It was 9 s.
  - Each sector gives about one escort pair.
  - The full wing of 6 lands in sector 3 or with the Crown spoils.
- **Authored drops do the work.** Most of the kit comes from authored `drop:` fields, carriers, minibosses and flagship spoils.
  - Random table rolls and the squadron bonus become flavour, at a lower rate.
  - The bonus ladder follows the ledger.
  - Sidewinder and signature growth must slow too. In round 3 they reached M14–21 and ★11–12 at the Crown, and that is why Crown-arrival DPS was 3,150–4,620 against a reference of about 1,800–2,100.
- **DPS check.** At sector 4 start, the ledger kit's raw flagship DPS should sit within about +25% of the reference: Kestrel 1,820, Manta 2,090, Wraith 2,110.
- **Drills.** `DRILL_LOADOUTS` for Vesper, Aurelia and the Crown match the ledger's arrival rows.

### Attack design rules (drop → attack)

Use the beat after a drop to show the new equipment off, and the beat after that to test it. These pairings are suggestions; the simulation builder may choose others, and must record the final ledger in "Simulation notes (Act I)".

| Drop | Next beat introduces | Then tests it with |
| --- | --- | --- |
| Escort pair | Side entries and flanks the wing covers | Wider formations, pincers |
| Sidewinder | Weaving aces and scattered loners that homing cleans up | Mixed-altitude waves |
| Signature (Kestrel flak, Manta torpedoes, Wraith orbitals) | Denser aimed streams | Combined stream plus formation |
| Shield | The sector's first sustained curtain or lane sweep | A curtain with a moving gap |
| Reflector | A dense bullet wave where reflection pays | — |
| Power past 8 (stream ceiling) | Armored and high-HP targets: turrets, carriers, minis | Heavy plus popcorn mixes |

- Key drops ride on carriers or formation leads that are guarded or exposed, so taking the drop is a risk and reward decision, as with 1942's red squadrons.

### Sector 4 lessons to apply in Act I

- **Threat rank in Act I.** `game.threat` runs in every sector on the same curve, `0.88·tanh((arsenal−6)/37)`. A ledger kit then rises naturally across Act I: about 0.14 at Vesper and about 0.58 at the Crown.
  - Act I enemies read it: fire cadence, bullet speed and volley size.
  - Act I gates are gentler than Act II's. Choose them so a ledger kit meets the intended ramp.
  - A scatter drops the threat, so a stripped ship gets a breather.
- **Rescue drops.** While threat is below `RESCUE_THREAT`, as after a scatter, chosen formation leads carry power, so a stripped pilot can rebuild. This replaces the flat "every lead carries power" warm-up in sector 1.
- **HP curve against the ledger.** Popcorn still melts in one or two volleys at that point's ledger kit, and kitted ships wipe 85–100% of squadrons. Heavies (turrets, carriers, minis, bombers) take sustained fire. Replace `1+(stage-1)*.22` with values tuned against the ledger.
- **Intro cards.** Each sector's opening beat lands after its intro card, at 2.5 s or later, as sector 4 learned. Today they land at 0.6–0.7 s.
- **Flagships.** Re-tune HP, guard par and phase pressure against the arrival-ledger kit. Kill-time targets for the invulnerable tracker with the arrival kit:
  - Vesper 18–24 s;
  - Aurelia 22–28 s;
  - the Crown 26–34 s;
  - LEVIATHAN stays at 52–72 s.
- **Optional:** sector 3 may preview one Act II mechanic, such as scavengers answering a scatter. If it does, presentation must confirm the sprite reads in the sector 3 palette. No other new enemy types are added in Act I.

### Difficulty targets (balance bot)

Use the sector 4 round-1 dodging bot (good pilot and average pilot) on 8 or more seeds, running each sector from the ledger kit for that sector's start, plus a full-campaign mortal run.

| Sector | Good pilot, ledger kit: sector hits | Clears (good / average) |
| --- | --- | --- |
| 1 | 1–2 | ≥ 8/8 / ≥ 7/8 |
| 2 | 2–3.5 | ≥ 8/8 / ≥ 6/8 |
| 3 | 3–5 | ≥ 7/8 / ≥ 5/8 |
| 4 (unchanged, for reference) | 4.9–6.3 | see sector 4 round 2 |

- **Mortal sector-1 dodger** (10 seeds, no lives refill): each ship clears at least 8/10. Today Kestrel is 9, Manta 10 and Wraith 2. Wraith must rise.
- **Sector 4 with the new arrival kits** must match the round-2 reference-kit rows, within seed noise.

### Act I identity (presentation)

- **Sector intro cards.** Sectors 1–3 read `ACT I · SECTOR 0N`, just as sector 4 reads `ACT II`.
- **Launch.** The sortie opens with a short ACT I title beat, folded into the sector-1 intro, so the start gets no longer than it is today. The Act I subtitle is the presentation builder's choice; one option is the existing operation name, "OPERATION LONG MERIDIAN".
- **Other screens.**
  - The console log notes ACT I at launch.
  - The pause screen and hangar drills group Vesper, Aurelia and the Crown under ACT I, and LEVIATHAN under ACT II.
  - The flight record notes the act reached.
  - The field manual, README and PLAYTEST name the two acts.
- **Act II HUD and audio.** Any HUD, music or audio cue that today keys on `stage >= ACT_TWO_STAGE` only because threat was 0 in Act I must be checked now that threat runs in Act I.

### Builder file ownership (Act I)

- **Simulation (Opus high):** owns `src/game.js`, `src/progress.js`, `test/*.mjs` and the "Simulation notes (Act I)" section below. New events or player fields go into this section first.
- **Presentation (Sol high):** owns:
  - `src/sequences.js`, `src/ambience.js`, `src/cinema.js`, `src/pause.js`;
  - `src/ui.js`, `src/render.js`, `src/frontend.js`, `src/main.js`, `src/timeline.js`;
  - `src/sfx.js`, `src/audio.js`, `src/music.js`;
  - `index.html`, the CSS, `README.md`, `PLAYTEST.md` and `qa/*.mjs`.
- Neither builder commits. Luna does the git work.

### Simulation notes (Act I)

Status: built 2026-10-30 (simulation builder); round 2 the same day, after review (recovery, drop timing, Wraith help, Crown density). The final ledger, drop schedule, recovery rules, threat gates, HP curve, flagship numbers and bot tables follow the presentation notes. For Act I, these notes supersede three earlier passages: the Part 1 "Drops" bullets about sectors 1–3, the round-3 "Sector 1 is the power warm-up" note, and the old example drill loadouts.

#### Events / fields for presentation

Written first, so the presentation builder can build against it. Everything else in this section is simulation detail.

- **`game.threat` now runs in Act I.**
  - It uses the same curve as Act II, in every sector; the `else this.threat=0` is gone.
  - It resets to 0 when a campaign enters a new sector, then rises at 0.15/s as before, so each sector opens on a short power trip. Sector 4 in a campaign therefore still opens at 0, exactly as it did.
  - Drills start at the drill kit's threat in every sector.
  - Typical Act I values for an engaged pilot: about 0 at launch, about 0.18 at Vesper, about 0.45 at Aurelia and about 0.62 at the Crown.
  - A scatter drops it toward 0 in any sector.
  - **Consequence:** `threat > 0` no longer means Act II. Any HUD, music or audio code that used threat as an Act II signal must test `game.act === 2` (or `stage >= ACT_TWO_STAGE`) instead. In today's tree only `qa/audio.mjs` reads `threat`.
- **`game.act`** (getter, 1 or 2): the act of the current sector. Also `export function actOf(stage)` from `src/game.js`, which returns 1 for sectors 1–3 and 2 from `ACT_TWO_STAGE` on.
- **`summary.act`**: the act of the sector the run ended in (victory runs report the last sector's act). The flight record can show it.
- **`squadronBonus`**: in Act I, a wipe always pays a small score bonus (150 per craft) and drops a reflector about 30% of the time.
  - `drops` is 0 or 1 in Act I. It is still 1 in Act II.
  - The event also carries `points`, the score awarded for the wipe.
  - The "SQUADRON BONUS!" banner stays truthful either way.
- **Pickups:** no new pickup types and no new enemy types. Act I flagship spoils are a wider fan, collected automatically during the interlude as before. The Crown's spoils are 6 items: four power, a sidewinder and a signature.
- **Recovery tokens (round 2).** A recovery token is an ordinary pickup (`power`, `escort`, `sidewinder` or `signature`).
  - Its `drop` event carries `recovery: true` and `amount`.
  - A power token may carry `value` 2–4 and is collected as that many levels. The `pickup` event still reports `power`, so one power cue plays.
  - Presentation may treat recovery tokens like any other drop. A distinct cue is optional and not required.
- **Flagship HP (round 2).** In a campaign, an Act I flagship can arrive with a lower `maxHp` than authored (see "Recovery and mercy"). HUD code that shows `hp / maxHp` needs no change. Drills and LEVIATHAN always use the authored HP.
- **Hull repair (round 2).** Clearing sector 1 or 2 now restores the hull to full. Entering sector 4 still adds one point. The `stage` event is unchanged.
- **Enemy fields:**
  - Act I formation leads may carry `e.rescue = true`, which drops power while `threat < RESCUE_THREAT` (0.5), as in Act II.
  - They may also carry `e.recover = true`, a recovery lead.
  - `e.drop` may be a string or an array of pickup types.
- **No new telegraph events:** Act I's new attacks reuse existing patterns, `wave`, `flank` and `lane` events.

#### Round 2 summary

The review scored balance 4/10. Recovery could not sustain a continuous campaign: the reconstructed average bot cleared Act I on 0/8, 6/8 and 0/8 seeds (Kestrel / Manta / Wraith). Every key drop was also collected after the attack it was meant to prepare for. Round 2 made five changes:

1. **Drop timing measured at collection.** Key items now ride formation leads, which die about 4–6 s after their beat; carriers took 5–11 s. Each key item is in hand at least 1 s before the attack beat that shows it off, so about 2.5 s before that attack's first shot. The sector-3 closing bomb now drops before the Crown.
2. **Recovery** (rules below). Rescue leads, new recovery leads and Act I flagship phase breaks top up a kit that has fallen below its entitlement, counting live salvage first. Missing equipment is replaced one token per opportunity. A clean collector never sees a token: zero tokens across 144 clean runs.
3. **Mercy.** A kit short of its entitlement meets softer craft and flagships, down to 40% HP. A ledger kit meets the authored HP.
4. **Campaign survival.**
   - Act I flagship salvos are 1.2× slower (`ACT_ONE_BOSS_PACE_BASE` 1.25 → 1.5); flagships were the campaign's largest source of hits.
   - The Crown's final phase fires its counter-fan on alternate salvos.
   - Act I sector clears repair the hull.
5. **Wraith.** Its orbitals come earlier in sectors 1 and 2 (`wraith` beat overrides; same items per sector). Recovery hands Wraith orbitals first.

**Continuous Act I campaign** (sectors 1–3 back to back, normal healing and extends, no manual refill). The bot is the reviewer's: the rebuilt dodger, which never barrel-rolls. Clears are Kestrel / Manta / Wraith.

| Code | Pilot | Reviewer seeds (8) | 48 seeds |
| --- | --- | --- | --- |
| `a1d523c` (round 3, before the Act I retune) | Average | 8/8, 8/8, 8/8 | — |
| `a1d523c` | Mortal | 7/8, 8/8, 5/8 | — |
| Round 1 (`aab27f3`) | Average | 0/8, 6/8, 0/8 | 2/48, 29/48, 1/48 |
| Round 1 | Mortal | 0/8, 0/8, 0/8 | 0/48, 0/48, 0/48 |
| **Round 2** | **Average** | **7/8, 8/8, 4/8** | **41/48, 48/48, 34/48** |
| **Round 2** | **Mortal** | **1/8, 3/8, 0/8** | **11/48, 16/48, 2/48** |

- The reviewer seeds are 0, 5, 6, 7, 8, 9, 99 and 1234. The 48 seeds add 11–18, 21–28 and 31–54.
- Eight seeds swing by ±2 clears, because any change reshuffles the seeded stream, so decisions used the 48-seed column.

Round-2 detail, 48 seeds, Kestrel / Manta / Wraith:

| Pilot | Hits per sector, flagship included (S1 / S2 / S3) | Of which flagship | Scatters | Recovery tokens (S1 / S2 / S3) | Flagship arrival power (V / A / C) |
| --- | --- | --- | --- | --- | --- |
| Average | 6.5/7.3/8.5, 5.2/6.0/11.7, 6.5/8.9/9.8 | 2.9/2.4/4.2, 3.3/3.6/6.6, 2.8/3.0/4.1 | 19.2, 12.4, 22.1 | 1.2/7.3/9.0, 0.9/2.9/8.6, 0.9/8.5/10.7 | 5.5/8.4/14.9, 7.3/12.9/16.0, 6.0/9.1/13.0 |
| Mortal | 9.8/9.4/4.1, 9.7/13.2/11.9, 11.0/8.7/1.2 | 3.4/2.4/2.0, 4.2/4.9/5.0, 4.3/1.3/0.3 | 20.8, 23.5, 18.6 | 2.0/9.2/4.8, 1.8/11.3/11.3, 2.1/7.1/1.1 | 4.3/7.5/13.8, 5.4/6.6/12.2, 4.7/6.4/11.5 |

The mortal pilot's hits per sector only count runs that reach that sector.

#### Kit ledger as built

Measured with the engaged no-hit collector (the arsenal-r3 regression bot: fire held, lines up under the lowest enemy, detours to pickups within 300 px, invulnerable). Power is the range over seeds 0–5 with the mean in brackets, then the range over 48 seeds. Escorts, sidewinder, signature and shields landed exactly on the row on every seed and ship.

| Point | Target | Kestrel | Manta | Wraith |
| --- | --- | --- | --- | --- |
| Vesper arrival | P7–9, E2, M1, ★1, S0–1 | P8–9 (8.2); 8–9. S1 | P8–9 (8.2); 8–9. S3 | P8–9 (8.2); 8–10. S1 |
| Aurelia arrival | P13–16, E4, M2, ★2, S1–2 | P15–16 (15.2); 15–18. S2 | P17–19 (17.8); 17–19. S3 | P15–18 (15.8); 15–18. S2 |
| Crown arrival | P19–22, E4–6, M3, ★3, S2–3 | P20–22 (21.0); 20–24. E6, S3 | P23–25 (24.3); 23–27. E6, S3 | P20–23 (21.3); 20–24. E6, S3 |
| Sector 4 start | P24–27, E6, M4, ★4, S3 | P24–26 (25.0); 24–28 | P27–29 (28.3); 27–31 | P24–27 (25.3); 24–28 |

- **Unchanged from round 1** within a level: the closing bomb now converts to power for a full bay, so sector 3 authors one power fewer.
- **Ramp (sector 1).**
  - Power 4 at 13.9–15.1 s.
  - First escort pair at 25.2–27.1 s (round 1: 30.5–31.7 s; the target is 25 s or later).
  - Power 6 at 43–44 s, or 26.8–30 s on the seeds where a flavour power drops early.
- **Threat at arrival:** Vesper 0.17–0.23, Aurelia 0.43–0.52, the Crown 0.60–0.68.
- **Squadron wipes:** 83–100% in sector 1, which opens bare; 100% in sectors 2 and 3.
- **Manta.** Its two shield overflows put it 2–4 levels above the others from Aurelia on. At sector-4 start it reaches P30–31 on 4 seeds of 48, past the +3 tolerance; its mean is 28.4.
- **Missed equipment.** With any one escort, sidewinder or signature withheld (its carrier removed without a drop), every ship still enters sector 4 on E6 / M4 / ★4. One recovery token replaces it, at the next recovery lead or flagship phase break. Round 1 entered sector 4 on E4.
- **DPS check at sector-4 start:** unchanged from round 1 (+0% to +9% against the reference).

#### Drop schedule

The schedule is authored on `STAGE_BEATS` (exported read-only for tests). Each Act I beat is `[time, pattern, drops]`:
- `lead`: the drop rides on the formation lead.
- `heavy`: it rides on the carrier, the mini or the centre turret.
- `rescue`: the lead also carries power while threat < 0.5. It now pays on top of an authored drop.
- `recover`: the lead is a recovery lead (see "Recovery and mercy").
- `wraith`: overrides the beat's drops for Wraith only.

"Collected" is the measured first pickup by the engaged collector, over 48 seeds and three ships. "Shown by" is the attack beat that shows the item off; its enemies open fire about 1.5 s after their beat. A lane sweep spawns at its time and reaches the ship about 5 s later.

**Sector 1, THE SHALLOWS (62 s).** Launch P2 → P8, E2, M1, ★1, S1. Lane sweeps at 19.5, 32 and 49 s.

| Beat | Drop | Collected | Shown by |
| --- | --- | --- | --- |
| 2.8 split | rescue power | ~7 | The opening teaches shooting and collecting |
| 7 drift | — | | |
| 10 wing | lead: power (power 4) | 13.9–15.1 | |
| 14.5 bomber | lead: shield | 19.6–22.3 | The 19.5 s lane sweep, which lands about 24.5 s |
| 21.5 drift | lead: escort pair | 25.2–27.1 | 29 flank (side entries), then 33 split (a wider formation) |
| 24.5 wing | rescue power | | |
| 33 split | recovery lead | | |
| 37.5 turret | lead: sidewinder; turret: power. **Wraith:** lead signature | 42.2–43.7 | 46.5 ace (weaving aces). **Wraith:** the aces' aimed streams |
| 41.5 mini | power | | |
| 46.5 ace | recovery lead | | |
| 50.5 drift | lead: signature. **Wraith:** lead sidewinder | 55.1–56.1 | 57.5 bomber (denser aimed streams). **Wraith:** bomber plus loose scouts |
| 52.5 cross | carrier: power | | |
| 57.5 bomber | recovery lead | | Then Vesper |

**Sector 2, STORM WALL (73 s).** Starts at P9, E2, M1, ★1, S2, after Vesper's spoils (power, shield). Ends at P15, E4, M2, ★2. Lane sweeps at 9, 23, 41 and 59 s.

| Beat | Drop | Collected | Shown by |
| --- | --- | --- | --- |
| 2.6 wing | carrier: power. **Wraith:** carrier signature | **Wraith:** 9.5–10.3 | Vesper's shield meets the 9 s lane sweep |
| 6.5 drift | rescue power | | |
| 10.5 turret | turret: signature. **Wraith:** turret power | 16.2–16.6 | 15 mini (heavy plus popcorn), then 20.5 ace (denser aimed streams) |
| 15 mini | power | | |
| 20.5 ace | recovery lead | | |
| 24 bomber | lead: escort pair | 28.2–30.2 | 28.5 relay (a curtain with a moving gap), 33.5 flank, 37.5 pincer |
| 28.5 relay | lead: power | | |
| 37.5 pincer | rescue power | | |
| 42.5 drift | lead: sidewinder; recovery lead | 47.2–48.7 | 51 pincer (weaving aces), then 55 wing (mixed altitudes) |
| 45.5 mini | power | | |
| 51 pincer, 55 wing | recovery leads | | |
| 60 relay | carrier: bomb | 70–72 | Closing: 64.5 turret, 68.5 flank |
| 64.5 turret, 68.5 flank | recovery leads | | |

**Sector 3, THE CROWN (82 s).** Starts at P16, E4, M3, ★2, S2, after Aurelia's spoils (power, sidewinder). Ends at P20, E6, M3, ★3, S3, plus the bomb (a power level for a full bay). Lane sweeps at 21, 39.5, 53.5, 67.5 and 77.5 s.

| Beat | Drop | Collected | Shown by |
| --- | --- | --- | --- |
| 2.6 curtain | — | | Opening |
| 7 pincer | rescue power | | Aurelia's sidewinder meets weaving aces, then 11 drift (mixed altitudes) |
| 11 drift | lead: shield | 15.4–16.6 | The 21 s lane sweep (lands about 25.5 s), then 22 curtain |
| 14 relay | recovery lead | | |
| 22 curtain | lead: signature | 27.5–28.5 | 32 ace (denser streams), then 36 wing (streams plus formation) |
| 26.5 mini | — | | |
| 32 ace | recovery lead | | |
| 36 wing | lead: escort pair (the full wing); carrier: power | 40.2–41.3 | 41 relay, 46 flank, then 50 pincer (wide) |
| 41 relay | recovery lead | | |
| 50 pincer | lead: reflector; rescue power (lapses for a ledger kit, whose threat is past 0.5) | ~56 | 61 curtain, a dense wave where reflection pays |
| 55.5 mini | power | | |
| 61 curtain, 65.5 drift | recovery leads | | |
| 75.5 flank | lead: bomb; recovery lead | 76.9–77.6 | Before the Crown (82 s). Round 1's 79 s relay carrier reached the Crown spawn at 1,100 HP and was deleted. |
| 79 relay | — | | |

- **Pickup → attack margin** (attack beat minus collection, worst case over 48 seeds and three ships):

  | Item | Sector 1 | Sector 2 | Sector 3 |
  | --- | --- | --- | --- |
  | Escort pair | 1.9 s | 3.3 s | 4.7 s |
  | Sidewinder | 2.8 s (Wraith 1.6 s) | 2.3 s | — |
  | Signature | 1.4 s (Wraith 3.2 s) | 3.9 s | 3.5 s |
  | Shield | about 2.2 s before the sweep lands | — | 5.4 s |

  Round 1 collected every escort pair, sidewinder and signature after its attack beat. The worst cases were the sector-2 and sector-3 escorts, both about 6 s late.
- **Flagship spoils** (collected in the interlude):
  - Vesper: power, shield;
  - Aurelia: power, sidewinder;
  - the Crown: power ×4, sidewinder, signature.

  LEVIATHAN is unchanged (power plus a ladder item).
- **Openings** land at 2.8, 2.6 and 2.6 s. Sector 4 keeps 2.5 s.
- **Roster and length** are unchanged: the same enemy types per sector, and goals of 62, 73 and 82 s.
- **Not taken:** the optional scavenger preview in sector 3 was not built.

#### Recovery and mercy

- **Entitlement.** A sector owes the pilot its entry row plus every authored item, and every rescue power, of the beats flown so far.
  - The entry rows are P2 / E0 / M0 / ★0 at launch, P9 / E2 / M1 / ★1 in sector 2, and P16 / E4 / M3 / ★2 in sector 3 (`ACT_ONE_ENTRY`).
  - At a flagship, the whole sector counts.
- **Held.** What the pilot holds or can still catch: the kit, plus live salvage and pickups, plus drops still riding live enemies (and live rescue power below 0.5), plus the kill's own fan.
- **Opportunities.** Rescue leads, recovery leads and Act I flagship phase breaks (phases 2 and 3).
  - Recovery leads: sector 1 at 33, 46.5 and 57.5 s; sector 2 at 20.5, 42.5, 51, 55, 64.5 and 68.5 s; sector 3 at 14, 32, 41, 61, 65.5 and 75.5 s.
- **Equipment.** Each opportunity pays at most one token: the first type where held is below the entitlement.
  - The order is escort pair, signature, sidewinder. Wraith takes signature first.
  - An escaped carrier, a pickup lost off the bottom and expired salvage are all replaced this way. One that is still in play is not.
- **Power.** When held power is more than `ACT_ONE_RECOVER_SLACK` (3) levels short, the opportunity adds one power token.
  - The token is worth one level per `ACT_ONE_RECOVER_STEP` (2) levels of shortfall past the slack, up to `ACT_ONE_RECOVER_MAX` (4).
  - For example, 4–5 levels short pays 1 and 12 short pays 4.
- **Mercy.** Each Act I beat's craft, and each Act I flagship on arrival, spawn with HP × max(`ACT_ONE_MERCY_FLOOR` 0.4, 1 − `ACT_ONE_MERCY_PER_LEVEL` 0.045 × shortfall).
  - The shortfall is in arsenal levels against the entitlement: power, 1 per escort, 1.5 per sidewinder or signature level.
  - Floating salvage counts as held, so mercy starts only once kit is truly gone.
  - Flagships still hold their learn windows, so a softened Crown still runs about 30 s.
  - Drills, directly spawned craft and sector 4 never soften.
  - In the scripted comeback (below), Vesper arrives with 3,287 HP instead of 3,800.
- **Never for a clean collector.** By construction, a clean collector is always at or above its entitlement. Zero recovery tokens and no softened craft were seen across 144 clean runs (48 seeds × 3 ships).
- **Comeback, scripted.** Each ship is stripped four times with every salvage token deleted, at sector 1 at 45 s, sector 2 at 35 and 58 s, and sector 3 at 30 s. It still enters sector 4 on E6 / M4 / ★4 at P22–23 (clean: P24–27), from 34 recovery tokens.

#### Generated drops (flavour)

- **Random rolls (Act I).** Rates: scout 0.8%, wing 1%, bomber 8%, ace 4%, turret 6%. The table is reflector 60, power 40. Rolls never give escorts, sidewinders, signatures or shields. Carriers and minis drop only what their beat authors.
- **Squadron wipes (Act I).** A wipe pays 150 points per craft and has a 30% chance of a reflector.
- **Bombs** are authored only: sector 2's closing relay carrier and sector 3's closing flank lead. A full bay converts a bomb to power.
- **The bonus ladder** is Act II only. A campaign enters Act II on the equipment cycle (`_bonusIndex` ≥ 6); drill 4 still opens on the starter rungs, unchanged.
- **Flavour for the engaged collector** adds about one power level per sector, already included in the ledger table above. A pilot who never bombs also gets two bomb conversions.

#### Threat in Act I

- **Curve:** unchanged, `0.88·tanh(max(0, arsenal−6)/37)`, rising at 0.15/s and falling at 0.35/s, now in every sector. It resets to 0 at each campaign sector change. Drills start at the kit's target.
- **Cadence.** Act I enemy cooldowns are multiplied by `ACT_ONE_STAGE_PACE[stage] × 1.45/(1 + 1.3t)`, with stage pace 1.15 / 1.1 / 1.0. This replaces `1 − (stage−1)·0.08`.
  - Ledger kit: sector 1 runs 1.67 → about 1.37 at Vesper; sector 2 about 1.2 → 1.0; sector 3 about 0.92 → 0.8.
  - A stripped ship (threat 0) gets 1.67 / 1.6 / 1.45.
- **Bullet speed** is multiplied by `1 + 0.12t`.
- **Volley tiers:**
  - Below 0.12 (`ACT_ONE_SMALL`, covering all of sector 1 and any stripped ship), volleys shrink a size: wing 3, bomber 5, turret 3, carrier 7, mini radial 9.
  - Past each type's gate they grow: ace 0.4 (3 → 5), carrier 0.45 (9 → 12), wing 0.5 (5 → 7), turret 0.5 (5 → 7), mini 0.5 (radial 12 → 16, spread 3 → 5), bomber 0.55 (7 → 9), scout 0.6 (1 → 2).
  - A ledger kit meets the big tier only in the second half of sector 3.
- **Flagships.** Act I flagship salvo cadence is multiplied by `1.5/(1 + 0.6t)` (round 1: 1.25): about 1.36 at Vesper's rank and 1.09 at the Crown's. LEVIATHAN keeps `_bossPace`.
- **Rescue drops.**
  - The rescue leads are the 2.8 split and the 24.5 wing in sector 1; the 6.5 drift and the 37.5 pincer in sector 2; and the 7 and 50 pincers in sector 3.
  - They drop power while threat < 0.5 (`RESCUE_THREAT`, shared with Act II). For a ledger kit that covers sectors 1–2 and early sector 3, so they are counted in the ledger. After that they pay only a stripped ship.
  - Rescue leads are recovery opportunities too.
- **Sector 4 is untouched.**
  - Its borrowed Act I craft (the scavenger curtain) keep the old curve, cadence and volleys.
  - Played from the same entry state, sector 4 is bit-identical on the round-3 code, the round-1 code and the round-2 code: same score, stats, RNG, enemies, bullets and boss HP over 6 runs of 160 s each.

#### HP curve

These are the authored values, met by a kit on its entitlement. "Recovery and mercy" softens them for a short kit.

| Type | Sector 1 | Sector 2 | Sector 3 | Old (×(1+(stage−1)·0.22)) |
| --- | --- | --- | --- | --- |
| scout | 18 | 36 | 60 | 22 / 27 / 32 |
| wing | 26 | 50 | 84 | 30 / 37 / 43 |
| ace | 50 | 85 | 150 | 50 / 61 / 72 |
| bomber | 85 | 250 | 600 | 72 / 88 / 104 |
| turret | 115 | 420 | 760 | 90 / 110 / 130 |
| carrier | 150 | 650 | 1,100 | 125 / 153 / 180 |
| mini | 450 | 2,000 | 3,200 | 250 / 305 / 360 |

- **Popcorn:** a power-2 Kestrel volley (3 × 7) deletes a sector-1 scout.
- **Heavies:** a sector-3 mini takes about 2 s of the ledger kit's focused fire.

#### Flagships

| | Vesper | Aurelia | The Crown |
| --- | --- | --- | --- |
| HP (ledger kit) | 3,800 (was 2,600) | 9,000 (4,700) | 10,500 (5,800) |
| Learn windows (phase 2 / phase 3 / defeat) | 10 / 18 / 22 | 12 / 21 / 25 (10 / 18 / 22) | 13 / 25 / 30 (10 / 18 / 22) |
| Guard par | 0.19 (0.22) | 0.14 (0.19) | 0.15 (0.17) |
| Guard K | 2.6 | 5.2 (2.6) | 5.2 (2.6) |
| Base cadence, phases 1 / 2 / 3 (s) | 0.9 / 0.68 / 0.6 (0.78 / 0.58 / 0.52) | 0.78 / 0.58 / 0.5 (phase 3 was 0.48) | 0.8 / 0.6 / 0.52 (0.78 / 0.58 / 0.42) |
| Patterns | unchanged | unchanged | phase 1 fan 23 → 19. Phase 3: a 16-bullet magenta fan every salvo, and the 16-bullet amber counter-fan every second salvo (`CROWN_FINAL_FAN`, `CROWN_FINAL_COUNTER_EVERY`). Was 19 + 19 every salvo before the retune, and 16 + 16 every salvo in round 1. |

- **Par** is the arrival kit's share of HP per second, so that kit keeps the authored pacing.
- **K** was doubled for Aurelia and the Crown so that surplus power still buys time on their deeper HP pools.
- **Kill times are unchanged from round 1.** Drills fly the authored HP, and cadence does not move the guard clock. Values are in seconds, for an invulnerable tracker holding fire under the boss:

| Ship | Vesper: drill / arrival / bare / P25 | Aurelia: drill / arrival / bare / P25 | Crown: drill / arrival / bare / P25 | LEVIATHAN: reference / arrival |
| --- | --- | --- | --- | --- |
| Kestrel | 21.4 / 21.4 (P8) / 24.6 / 14.5 | 25.0 / 24.8 (P16) / 48.3 / 21.2 | 29.8 / 29.1 (P23) / 54.6 / 27.8 | 68.0 / 67.9 (P27) |
| Manta | 20.5 / 20.5 (P8) / 25.3 / 13.4 | 24.3 / 23.2 (P18) / 54.7 / 19.5 | 28.3 / 26.4 (P25) / 60.8 / 25.8 | 67.3 / 66.7 (P29) |
| Wraith | 20.9 / 20.9 (P8) / 30.6 / 12.8 | 24.5 / 23.9 (P16) / 73.9 / 19.1 | 28.2 / 27.7 (P21) / 84.0 / 25.3 | 67.8 / 67.8 (P25) |

All within target: Vesper 18–24, Aurelia 22–28, the Crown 26–34, LEVIATHAN 52–72. In a campaign, mercy shortens the "bare" columns, because a bare kit meets a softened flagship.

- **Flagship fights for the dodging bots.** Each run starts from that sector's ledger kit, with 16 seeds. Peak live bullets, mean fight length and hits are given as round 2 (round 1), Kestrel / Manta / Wraith:

  | Flagship | Good pilot | Average pilot |
  | --- | --- | --- |
  | Vesper | peak 99–108 (122–128); 21–22 s; hits 1.4 / 2.5 / 2.5 (1.7 / 4.2 / 2.3) | hits 2.6 / 3.2 / 3.0 (2.8 / 3.8 / 3.3) |
  | Aurelia | peak 148–157 (172–184); 25–27 s; hits 1.8 / 2.3 / 1.8 (2.4 / 3.3 / 4.2) | hits 2.8 / 3.8 / 3.4 (4.3 / 4.8 / 6.2) |
  | The Crown | peak 116–127 (179–198); 29–30 s; hits 2.5 / 4.4 / 3.6 (3.3 / 6.4 / 5.7) | 30–31 s (35–38 s); hits 3.8 / 6.9 / 4.9 (7.1 / 9.1 / 8.7) |

#### Balance bots

**Method.** The round-1 dodging bot was not archived, so it was rebuilt. The scratch scripts live in `~/knotz2026-dev-archive/act1-sim`, not in the repo; the round-2 campaign runner was a scratch file.
- **How it flies:**
  - Every `replan` seconds it scores 55 candidate positions over a 0.55–0.85 s horizon, predicting bullets and enemy bodies linearly.
  - It sees each bullet with probability `attention`, and acts on each plan `latency` seconds later.
  - It aims under the lowest enemy (on a flagship: reactor or turrets first) with `noise` px of error, and detours to pickups and salvage.
  - It bombs when a collision looks unavoidable. It never barrel-rolls.
- **Good pilot:** latency 0.14 s, replan 0.06 s, attention 0.97, noise 14 px.
- **Average pilot:** latency 0.22 s, replan 0.08 s, attention 0.93, noise 24 px.
- **Mortal pilot:** latency 0.4 s, replan 0.15 s, attention 0.78, noise 50 px, no bombs.
- **Calibration** (round 1, unchanged sector 4):
  - Good: clears 7/8, 8/8, 8/8 with 4.8 / 4.8 / 4.5 sector hits.
  - Average: clears 7/8, 8/8, 6/8, matching sector-4 round 2's aggregate of 21/24.
- **Sector runs** start from the ledger kit for that sector, at threat 0, with full hull and lives:
  - sector 1: launch;
  - sector 2: P9, E2, M1, ★1, S2;
  - sector 3: P16, E4, M3, ★2, S2;
  - Manta flies with S3 in sectors 2 and 3.

  Hits include shield hits. "Sector hits" exclude the flagship.

**Per sector, ledger kits (round 2).** 16 seeds: 0, 5, 6, 7, 8, 9, 99, 1234 and 11–18. Values are Kestrel / Manta / Wraith.

| Sector | Pilot | Clears | Sector hits | Target hits | Flagship hits | Scatters, sector only | Threat, mean / max |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Good | 16/16, 16/16, 16/16 | 1.8 / 0.9 / 2.4 | 1–2 | 1.4 / 2.5 / 2.5 | 1.1 / 0.0 / 1.6 | 0.02–0.05 / 0.23 |
| 1 | Average | 16/16, 16/16, 16/16 | 3.9 / 2.2 / 4.1 | (clears ≥ 7/8) | 2.6 / 3.2 / 3.0 | 2.9 / 0.1 / 3.1 | 0.01–0.04 / 0.19 |
| 2 | Good | 16/16, 16/16, 16/16 | 3.6 / 1.7 / 4.0 | 2–3.5 | 1.8 / 2.3 / 1.8 | 1.7 / 0.0 / 2.1 | 0.26–0.33 / 0.47 |
| 2 | Average | 16/16, 16/16, 15/16 | 4.8 / 2.3 / 5.5 | (clears ≥ 6/8) | 2.8 / 3.8 / 3.4 | 2.8 / 0.3 / 3.5 | 0.23–0.33 / 0.45 |
| 3 | Good | 16/16, 16/16, 16/16 | 3.3 / 4.6 / 5.3 | 3–5 | 2.5 / 4.4 / 3.6 | 0.8 / 0.7 / 2.3 | 0.44–0.50 / 0.60 |
| 3 | Average | 16/16, 16/16, 16/16 | 5.2 / 5.9 / 7.3 | (clears ≥ 5/8) | 3.8 / 6.9 / 4.9 | 2.3 / 1.8 / 4.3 | 0.40–0.48 / 0.60 |

- **Ship means** are 1.7 / 3.1 / 4.4, inside every band, and the ramp is monotonic.
- **Wraith** is within 0.5 of every band: 2.4, 4.0 and 5.3 (round 1: 2.4 / 4.8 / 5.1). Its sector-2 orbitals now arrive at about 10 s instead of 16 s.
- **Off-band ships:** Manta stays under in sectors 1–2, because its shields absorb. Kestrel is 0.1 over in sector 2.

**Mortal sector-1 dodger** (10 seeds, no lives refill; target ≥ 8/10): Kestrel 10/10 with 10.3 hits, Manta 10/10 with 9.9 hits, Wraith 9/10 with 11.1 hits.

**Sector 4 plus LEVIATHAN** were not re-flown in round 2.
- Sector 4 is bit-identical from the same entry state.
- The clean arrival kits are within a level of round 1's: P24–28 / P27–31 / P24–28 with E6, M4, ★4, S3.
- The round-1 table (sector 4 round 2's reference rows, matched within seed noise) stands.

#### Known costs and misses

- **The mortal campaign target (≥ 2/8 per ship) is met for Kestrel and Manta (23% and 33% over 48 seeds), not for Wraith (2/48, 4%).**
  - The mortal bot takes about 10 hits in sector 1 alone, about as many as on the round-3 code, so it reaches sector 2 on about one life.
  - In sector 2 the good-pilot band plus Aurelia already implies about 4–6 hits, and the mortal bot takes about twice the average pilot's.
  - Trials showed the limit:
    - removing every lane sweep took round 1 to only 2/8, 1/8, 0/8;
    - an extreme mercy (enemy and flagship HP to 40%, slower fire) reached 4/8, 0/8, 0/8.
  - Clearing Wraith's mortal campaign would need Act I to be easy for a weak pilot even with the kit restored. That contradicts the approved ramp, so round 2 stops here.
- **Wraith's average campaign** is 34/48 (71%; 4/8 on the reviewer's eight seeds), against a target of 75%.
  - With the same kit, Wraith takes about 30% more hits than Kestrel: longer flagship fights at low power, narrower rails, and lanes.
  - A Wraith-only sector-3 orbital move did not help (16/24 against 18/24), and a stronger mercy did not help (32/48), so neither was kept.
- **Hull repair, mercy and slower flagship salvos** are generosity choices beyond the reviewer's list.
  - Recovery alone (with none of the three) cleared 12 / 19 / 4 of 24 seeds in the average campaign.
  - In a trial with power-only mercy over 48 seeds, all three together cleared 41 / 47 / 31. Without the repair, Wraith fell to 24/48; without the slower salvos, to 19/48.
  - The repair and the slower salvos are each one constant to revert if the owner wants Act I harsher.
- **Scatters sting less.** A pilot who loses everything four times still enters sector 4 about 2–4 power below a clean collector, on the full equipment row. The sting is lost power, lost time and a softened, lower-scoring run, not a permanently short wing.
- **Peak bullets:** Aurelia's fight now peaks at 143–157 bullets (round 1: 165–184), the Crown's at 116–127 and Vesper's at 99–110. Sector 4 peaks at 118–137.
- **Manta** reaches sector 4 at P30–31 on 4 of 48 seeds, past the +3 tolerance.
- **The mortal bot** cannot reproduce round 3's sector-1 baseline, as noted in round 1.

#### Tests

- **Round 1:**
  - re-pinned `arsenal-r3` (ledger arrival), `arsenal-r2` (the Vesper guard clock), the drill loadouts, and the `game.test` opening, breather, relay bomb, flagship cadence and spoils tests;
  - added `test/act-one.test.mjs` (11 tests).
- **Round 2, re-pinned:**
  - `game.test`: an Act I sector clear repairs the hull, and Act II entry adds one point.
  - `game.test`: the closing bombs ride sector 2's relay carrier and sector 3's flank lead.
  - `game.test`: the Vesper and Aurelia final-phase cadence (0.83 s and 0.6 s at their arrival ranks).
  - `act-one`: the schedule counts, with sector 3 at four levels plus the bomb, and Wraith's overrides keep each sector's items.
  - `act-one`: the rescue test ignores recovery tokens.
  - `act-one`: flagship HP is pinned at the ledger kit.
  - `reactors`: the centred-firing drill (it never dodges) now flies with spare lives, so it pins the firing line rather than survival.
- **Round 2, new in `act-one` (17 tests in all):**
  - key drops are collected at least 1 s before their attack beat on every ship; the first escort pair comes at 25 s or later; the sector-3 bomb drops once, before the Crown; and a clean collector sees zero recovery tokens;
  - a recovery lead replaces a missing item once, and not while a pickup, carrier or salvage still holds it; the token order (Wraith first takes orbitals); and the power token steps;
  - mercy softens craft and flagships for a short kit only, never at the ledger, in drills, for directly spawned craft or on LEVIATHAN;
  - flagship phase-break recovery happens for a short kit only;
  - the scripted comeback campaign: four total strips on each ship still reach sector 4 on E6 / M4 / ★4 at P20–27;
  - the Crown's final phase alternates its counter-fan (16 magenta every salvo, 16 amber every second salvo).
- **Status:** 169 tests pass, and the build passes.

## Process

- **Workflow:**
  1. Arsenal: two build → judge → iterate rounds, then merge.
  2. Sector 4: two build → judge → iterate rounds, then merge.
  3. Pause for player feedback before sector 5.
- **Builders own files** so they can work in parallel on one checkout:
  - For the Arsenal:
    - The simulation builder owns `src/game.js`, `src/progress.js` and `test/*.mjs`.
    - The presentation builder owns `src/render.js`, `src/ui.js`, `src/main.js`, `src/sfx.js`, `src/audio.js`, `src/sequences.js`, `index.html` (field-manual copy only) and the CSS.
  - For sector 4, see "Builder file ownership" in the sector 4 build contract.
- **Contract changes:** any change to the contract above is written into this file.
- **Done means:**
  - `npm test` passes.
  - `npm run build` passes.
  - `qa/browser.mjs` passes against the dev server.
  - No console errors.
  - The frame time stays steady with a full arsenal in a dense scene.
