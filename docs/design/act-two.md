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

(Simulation builder: record the final ledger, drop schedule per sector, threat gates, HP curve, flagship numbers and bot tables here.)

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
