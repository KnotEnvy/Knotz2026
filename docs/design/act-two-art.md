# Act II art contract (sectors 4–6)

Status: audit 2026-10-31, read from `main` @ 0f5d002. This is the working spec for the image generator (painted transparent PNGs) and the integrators (render.js/art.js swaps). Line numbers refer to `src/render.js` unless noted.

Reference captures of the current procedural look are in `artifacts/art-audit/` (gitignored): `s4-hulls.png`, `s4-small.png`, `s4-boss-p2.png`, `s4-boss-p3.png`, `s5-foundry.png`, `s5-small.png`, `s5-boss-p1.png`, `s5-boss-p3.png`, `s6-gate.png`, `s6-echo.png`, `s6-boss.png`. The script that made them is `capture.mjs` in the same folder.

## 0. Global facts and conventions

| Topic | Fact (from code) | Rule for new art |
|---|---|---|
| Playfield | Canvas is a fixed **540×900** backing store (`index.html` `<canvas width=540 height=900>`, `W/H` render.js:6). There is no DPR upscaling; CSS scales it to about 1.0–1.1× on desktop. | Generate at **S = 2** (bosses, hulls, platforms) or **S = 3** (small craft, turret heads, parts), measured in source px per logical px. That is enough headroom for every display. |
| Existing atlases | `aircraft-atlas.png` and `enemy-atlas.png` are 1254² RGBA, painted weathered metal with rivets and panel seams, top-down orthographic, key light from the upper left, dark rims. Enemy cells are painted **nose UP** and drawn with `rotate(PI+angle)` (`authoredEnemy` 1471–1488). Boss cells are painted **in screen orientation** (`authoredBoss` 1489). | Match this style and material language. Do not use flat vector shapes (act-two.md S6 readability rule: "Bake detailed sprites… never flat vector shapes"). |
| Orientation A | Small aircraft, torpedoes and turret heads | Paint **nose / barrels UP (−y)**. Integrators draw aircraft with `rotate(PI + e.angle)` (sim angle 0 = nose down), turret heads with `rotate(e.aim + PI/2)`, and torpedoes with `rotate(atan2(vy,vx) + PI/2)`. |
| Orientation B | Bosses, hulls, foundries, Gate | Paint **in screen orientation** (the top of the image is the top of the screen). Surface ships (hull, gunboat) are **bow UP**: the existing wake geometry (`fleetWake` 1715) trails below the stern. LEVIATHAN lies broadside, long axis horizontal; put the bow at +x. |
| Pivot | — | **Pivot = exact cell center** unless the piece table gives a normalized pivot. Pieces are drawn at a fixed `1/S` scale. **Never auto-crop.** The current `drawCraft` alpha-trims and fits to a box (art.js:31–50), which would break part registration (see §7). |
| Rest pose | — | The hull is painted with **empty sockets** wherever a moving part sits: turret rings, bay apertures, pod mounts, core well, battery slots. The part sprites cover them. |
| Do not bake | — | Cast or drop shadows, engine glow and bloom, muzzle flashes, lit nav lights, text and hull numbers (fleetHull 1711 bakes "IM / DD"), background, and white "hit flash". Code adds all of these. Paint emissives (engine nozzles, windows, cores) **unlit or dim**: dark glass, a faint inner color. |
| Wreck variants | Act I wrecks are a darkened, clipped copy of the clean sprite (`drawWreck`, art.js:68; a 62% `rgba(15,26,35)` source-atop tint). | Use tint + clip by default. Paint a separate damaged piece only where §4 says so. |

## 1. Entity inventory

22 Act II enemy and boss types were audited. **18 need new painted art**. 4 already render from the atlases and are acceptable: `gunboat`, `interceptor`, `echo`, `mirrorEscort`. `tether` is mostly an FX line and only needs an optional node piece.

| # | type (sim string) | Sector | Role | Draw fn · lines | On-screen size (logical px) | Facing / rotation | Status |
|---|---|---|---|---|---|---|---|
| 1 | `hull` · `hullClass:"destroyer"` | 4 | Armored warship, scrolls at vy 40; ×0.35 dmg while turrets live | `fleetEnemy` 1741–1751 → `fleetHull` 1667–1714 (cached), `fleetWake` 1715, `fleetDamage` 1724 | half-extents w46 h132 → **92×264** (mast to −h−22 → 92×286) | bow up, no rotation | PROCEDURAL |
| 2 | `hull` · `"cruiser"` | 4 | Mid-sector peak, 6 turrets, torpedoes | same | w62 h176 → **124×352** (+mast) | bow up | PROCEDURAL |
| 3 | `hullTurret` | 4 (also LEVIATHAN, foundry 2) | Child turret; parent-relative `ox/oy` | `fleetEnemy` 1752–1777; wrecks `fleetTurretWrecks` 1817 | base ellipse 40×32; head ≈32×22 with barrels 18–29 px → ~60 px swept circle | head rotates `aim−PI/2` (barrels drawn +y today) | PROCEDURAL |
| 4 | `gunboat` | 4 | Small armored boat, aimed streams | `fleetEnemy` 1745 → `drawCraft('turret',0,0,44,79,true)` | fits 44×79 | bow up, no rotation | **ATLAS OK** (Act I gunboat; optional S4 reskin) |
| 5 | `interceptor` | 4 (also HALCYON launches, S6 remix) | 1942 squadron popcorn | `fleetEnemy` 1778–1788 → `drawCraft('ace',…,68,72,true)`, plus procedural ID lamps at (±25,6) | 68×72; x-scale breathes 0.76–1.0 | `rotate(angle+PI)` | **ATLAS OK** (optional S4 livery) |
| 6 | `scavenger` | 4 | Steals salvage; glows while carrying | `fleetEnemy` 1789–1801 | ≈50×30 body; carry token below to y+37 | no rotation (nose up) | PROCEDURAL |
| 7 | `mine` | 4 | Drifting; fuse ends in a ring burst | `fleetEnemy` 1802–1806 | r12 body, 8 spikes to r19 → **38×38** | none | PROCEDURAL |
| 8 | `torpedoEnemy` | 4 | Destructible homing torpedo | `fleetEnemy` 1807–1813 | ≈24×44 (+wake lines) | `rotate(atan2(vy,vx)−PI/2)`, nose at +y today | PROCEDURAL |
| 9 | boss `LEVIATHAN` | 4 | Super-dreadnought: deck guns → broadside → monsoon core | `leviathan` 1823–1860; `sinkingLeviathan` 1861–1911 | w210 h80 → **420×160**; batteries reach ±222 | `rotate(b.angle)` (≈0), sways ±20 px in x | PROCEDURAL |
| 10 | `foundry` · `small` / `large` | 5 | Flying factory; drawn **above the player** (draw order 799); player silhouette shown through (`foundrySilhouettes` 2046) | `skyEnemy` 2028–2045 → `skyHull` 2002–2005; `skyCloudShadow` 2016 | small w112 h62 → outline ±124×±62 = **248×124**; large w150 h84 → **324×168** | screen orientation, `rotate(angle)` | PROCEDURAL |
| 11 | `foundryBay` | 5 (foundry + HALCYON) | Bay launches drones / squadrons | `skyEnemy` 2034 → `skyModule` 2021–2027 | panel **46×36** | parent angle | PROCEDURAL |
| 12 | `hullTurret` `gun:"void"` on foundry 2 | 5 | Void battery | `fleetEnemy` 1752 (steel-teal **S4 art on a violet S5 platform**: a palette mismatch) | as #3 | aim | PROCEDURAL; needs a sky livery |
| 13 | `boxBomber` | 5 (S6 remix) | Heavy in a 3–4 wedge; climbs or dives | `skyEnemy` → `skyHull` 2006–2009 | outline ±68 × −48..45 → **136×93** | `rotate(angle+PI)`; climb has angle PI | PROCEDURAL |
| 14 | `tailGunner` | 5 | Child gun on the bomber tail | `skyEnemy` 2032–2033 → `skyModule('tailGunner')` | disc r12 (24 px); barrel 8×21 | barrel `rotate(aim−PI/2)` | PROCEDURAL |
| 15 | `skyAce` | 5 (S6 remix) | Hover-and-dodge ace | `skyEnemy` → `skyHull` 2010–2012, `scale(1.2)` | outline ±43×±40 ×1.2 → **103×96** | `rotate(angle+PI)` | PROCEDURAL |
| 16 | `drone` | 5, 6 | Bay / hangar popcorn, divers | `skyEnemy` → `skyHull` 2013 | ±21 → **42×42** | `rotate(angle+PI)` | PROCEDURAL |
| 17 | boss `HALCYON` | 5 | Flying-wing carrier: 3 bays → lattice lasers → eclipse | `halcyon` 2068–2094; break-up `skyHazards` 2114–2128 | w220 h70 → **440×140** (engine nozzles to y≈65) | screen orientation, `rotate(angle)` | PROCEDURAL |
| 18 | `station` (Meridian Gate) | 6 | Orbital set piece, holds at y 205 | `zeroEnemy` → `zeroHull` 2177–2182 | ring ellipse w176 h74 → **352×148** (code draws 180×90 if `e.w` is missing; the sim sets 176/74) | screen orientation; static today | PROCEDURAL |
| 19 | `stationTurret` | 6 | 6 children: mix/shard/void | `zeroHull` 2186–2187 (baked, **does not rotate** even though the sim has `e.aim`) | body 34×38, barrel 8×25 down | static today; should rotate by `aim` | PROCEDURAL |
| 20 | `satellite` | 6 | Crosses the field, sweeps a rotating laser | `zeroHull` 2183–2185 + rotating arm 2221 | w52 h28 → **104×~56** | screen; arm spins `t*.6` | PROCEDURAL |
| 21 | `tether` | 6 | Phase-2 salvage line to the boss | `zeroEnemy` 2204–2208 | 24 px node + beam | — | FX (optional node piece) |
| 22 | boss `THE SOVEREIGN` | 6 | Mirror capital ship; grows weapon pods | `sovereign` 2236–2248; `zeroPod` 2224–2235; shatter `zeroEffects` 2252–2260 | w200 h80 → **400×160** | screen, `rotate(angle)`, sways ±28 | PROCEDURAL |
| — | `echo`, `mirrorEscort` | 6 | Copies of the player ship | `zeroHull` 2173–2176: `drawCraft(playerShip)` + violet/blue source-atop tint | echo w34 h36; escort w19 h20 | `rotate(angle)` | **ATLAS OK** (reuses the aircraft atlas) |

## 2. Moving / stateful parts (become separate pieces)

Offsets are logical px relative to the parent center, in the parent's local frame. Source: `src/game.js`.

### Sector 4

| Parent | Part | Offset(s) | Driver | Range / variants |
|---|---|---|---|---|
| destroyer | 3 × `hullTurret` | (0,−80) fan · (0,−6) flak · (0,72) triple | `e.aim`, `e.hp`, dead → wreck | game.js 1415 |
| cruiser | 6 × `hullTurret` | (−30,−128) broadside · (30,−128) broadside · (−32,−40) void · (32,−40) void · (0,46) fan · (0,124) triple | same | game.js 1420 |
| any hull | damage fires | 1 / 3 / 5 fires at hashed spots once hp lost ≥22% / 40% / 65% | `hp/maxHp` | procedural (`fleetDamage`) |
| hullTurret | base ring | 0,0 (static, ellipse 40×32) | — | color rim by gun: triple `#b9c6ad`, fan `#8ac3bd`, flak `#e5ae68`, void `#c391e8` |
| hullTurret | head | pivot 0,0 | `aim` (rad, PI/2 = down), full 360° | **triple** 3 barrels L25 · **fan** 4 barrels L25 + sight · **flak** 2 short thick L18 + cross bar · **broadside** 4 barrels L29 · **void** 2 barrels + violet emitter |
| hullTurret | muzzle flash | barrel tips | `fleetMuzzles` (0.11 s) / `firePulse` | procedural, keep |
| hullTurret | wreck | same mount | `turretDown` event → `fleetWrecks` (stays on the hull) | needs a wreck piece |
| LEVIATHAN | 4 deck turrets | (−150,−10) triple · (−62,24) fan · (62,24) flak · (150,−10) broadside | as above, HP 1800 | game.js 1678 |
| LEVIATHAN | 10 broadside batteries | x = ±(178.5 + 22·`b.broadside`), y = −41.6 + i·20.8 (i 0..4); housing slot x ∈ ±[170,195] | `b.broadside` 0→1 (phase 2), `b.broadsideSide` ±1 lights one side | block slides out 22 px; twin barrels grow 9→21 px outward; "lit" side = warm glow (procedural) |
| LEVIATHAN | core armor plates L/R | center (±(19+37·`b.core`), 18), each 36×60 | `b.core` 0→1 (phase 3) | slide apart 19→56 px |
| LEVIATHAN | monsoon engine | (0,18), well ellipse 84×68 | `b.core` alpha; spin ±1.7 rad/s | 2 counter-rotating 8-spoke rotors r15–34 (teal `#c5fff0` and violet `#dca2ef`), white center r12, teal bloom r65 (procedural) |
| LEVIATHAN | torpedo salvos | launched at (±96,52) | phase timers | uses `torpedoEnemy` |

### Sector 5

| Parent | Part | Offset(s) | Driver | Range / variants |
|---|---|---|---|---|
| foundry small | 3 × `foundryBay` | (−74,6) · (0,32) · (74,6) | `launch < .8` → open; hp | closed / open / dead |
| foundry large | 4 × `foundryBay` + 2 void `hullTurret` | bays (−104,0) · (−36,36) · (36,36) · (104,0); guns (−62,−46) · (62,−46) | same + `aim` | — |
| foundry | smoke puffs | row above the hull | time | procedural |
| boxBomber | `tailGunner` | lead: (±13, tail +24 local); others: (0, tail +24) | `aim`, hp | world oy is +24 when climbing and −24 when diving, i.e. always at the tail |
| boxBomber | 4 engine nacelles | x ±27, ±48, y −17 | — | glow procedural |
| skyAce | twin engines | (±9, 29) | — | glow procedural |
| HALCYON | 3 × `foundryBay` | (−150,24) · (0,42) · (150,24) (game.js 2061); render socket at x −150/0/150, y 6..37 | hp; dead → dark socket + fire | open/closed/dead |
| HALCYON | 10 lattice emitters (phase ≥2) | x = ±(45 + 32i), y = −56 + 8i (i 0..4) | `phase`, laser warning → glow | appear in phase 2 |
| HALCYON | eclipse eye (phase 3) | (0,0), r32 + 8 ticks at r34–43 spinning `t*.3` | `phase ≥ 3` | closed → open + tick ring |
| HALCYON | 8 engine nozzles | x = (i−3.5)·46, y ≈ 48 − |x|·.08 | — | glow procedural |
| HALCYON | wingtip guns / nav lights | fans fire from (±196,10); lights at (±216,14) | — | procedural lights |
| HALCYON | damage | fires at (±143,8) once hp <66%; cracks ±36..±103 once hp <33% | hp | crack decals optional |

### Sector 6

| Parent | Part | Offset(s) | Driver | Range / variants |
|---|---|---|---|---|
| station | 6 × `stationTurret` | (−140,4) mix · (−72,36) shard · (0,−28) void · (72,36) shard · (140,4) mix · (0,52) void | `aim` (unused today), hp, `state` hold/leave | 3 head variants |
| station | hub | (0,0), r≈44 | — | optional slow counter-spin |
| satellite | emitter arm | (0,0), L23 | spins `t*.6`; the laser pivot is drawn by the hazard | separate piece |
| SOVEREIGN | ≤4 weapon pods | mount (ox, 24), ox from [−150, 150, −80, 80] in grow order | `b.weapons[i].type`; grow anim slides up from +42 over 0.45 s | **power** (3 tubes) · **escort** (2 pylons) · **sidewinder** (2 missiles) · **default diamond** (shield / reflector / signature / bomb) |
| SOVEREIGN | ≤6 `mirrorEscort` | ox = side·(118 + 36·rank), oy = 26 + 26·rank | player escorts | atlas OK |
| SOVEREIGN | damage cracks | floor(12·damage) hashed cracks | hp | procedural or decal |
| SOVEREIGN | core crystal | (0,0), diamond 48×≈132 | flash / phase | separate piece so it can be tinted |

## 3. Damage and death states

| Entity | Current presentation | New art needed? |
|---|---|---|
| hull | `hullDown`: explosion chain only; the hull vanishes | No: keep FX. Optional scorch decals. |
| hullTurret | Wreck persists on the parent (poly + scorch, 1759) | **Yes**: turret-head wreck + scorched base |
| LEVIATHAN | Sinks over the fx life: lists, scales y, folds batteries, 7 deck fires, steam, spray rings (1861–1911) | **Yes**: `leviathan-wreck` hull (burnt deck, broken superstructure) at the same registration. Batteries reuse their pieces. |
| foundry / bay | `foundryDown` / `bayDown`: fire bursts; the sprite vanishes | Bay: **yes** (dead socket, also used by HALCYON). Foundry: no. |
| HALCYON | `wingBreak`: hull tile clipped into 3 slabs at x = ±48, drifting and rotating, with secondary blasts (2114–2128) | **Yes**: `halcyon-broken`, the full hull at the same registration with torn seams at x = ±48 and burnt edges. Integrators clip it the same way. |
| SOVEREIGN | Bloom, then the hull tile is sliced into an 8×3 grid of tumbling shards with bright edges (2252–2260) | No dedicated piece needed (slicing works on any hull canvas). Optional `sovereign-fractured` overlay for damage ≥50%. |
| station / satellite / stationTurret | Generic explosion; vanish | stationTurret wreck: optional. Others: no. |
| small craft (scavenger, mine, torpedo, bomber, ace, drone) | Generic explode FX | No: use `drawWreck`-style tint + clip from the new sprite |

## 4. Palette and mood

Enemy bullet colors (makeBulletSprites 207–214, `zeroRound` 2153): amber/red shell `#f68455` core `#ffe6af`; magenta `#b975ec`/`#fce5ff`; "cyan" kind is actually rose-red `#ff728b`/`#fff2dc`; void `#291039` ring `#d9a7f4`/`#f1c5ff`; rose `#f67aa1`/`#ffe0eb`; shard `#31547b`/`#9feaff`/`#e3fcff`; mirror rounds use the player color (kestrel `#8cffe0`, manta `#ffbe84`, wraith `#bca7ff`). Bullets are drawn with a dark `#07101e` outline and a halo.

**Readability rules** (act-two.md §"Readability rule", S6 rules):
- Enemy bullets must be the brightest, most saturated thing on screen.
- Bodies sit at mid or dark value: no large fills above ~70% value. **No round bright dots 4–26 px across in any bullet hue** (orange-cream, pink, violet, cyan-white). Small emissives are fine only if painted dim; code adds the glow.
- Background props never read as targets.
- The player must stay visible under foundries; keep foundry interiors mid-value so the silhouette overlay reads.

| Sector | Background (code) | Current body palette (code) | Direction for painted art |
|---|---|---|---|
| S4 IRON MONSOON | Sea `#050e0d`, swell `rgba(22,48,42)`, crest lines `rgba(138,170,158)`; lightning white-gold `rgba(255,240,200)` reveals the sea every ~4.5 s; diagonal rain | Steel gradient `#798a87`→`#3d5457`→`#23353c`→`#101f29`; rims `#91aaa2` `#b8b79a`; deck `#4b5550`; bridge glass `#bee8d4`; fire `#dc6034` `#ffe8a1` | Rain-slick gunmetal and teal-grey naval steel, cream-khaki rim highlights, rust streaks, wet specular on the upper-left edges. Hull value must stay above the near-black sea (dark rim + lighter deck). |
| S5 SKYFORGE | Sky `#10162c` `#442849` `#875062` `#35283f` `#171d34`; sun `#efbd85` at (408,244) with halo `#f7ba79`/`#ce6c84`; clouds `#9d718e` `#705477` `#3d2d55` | Metal `#f4b99b`→`#a58b99`→`#655b78`→`#35354e`→`#171a30`; seams `#201d34`; nav `#ff6a77`/`#92f6ba` | Dusk-lit plum/slate alloy with rose-gold rims, foundry soot and heat-stained vents. Note: the code gradient puts the warm rim on the **upper right** (the sun side). Keep the key light upper left, plus an optional warm rose rim on the right edges. |
| S6 ZERO MERIDIAN | Sky `#02040d` `#060d20` `#14233c` `#382a43`; planet `#0a1c30` rim `#496b84`; corona `rgba(226,210,188)`; aurora `#53b7b3` `#7062aa` | Mirror metal `#d8f6f7` `#637f9c` `#172b47` `#9f8abc` `#d5e8ed` `#385269` `#101e37`; accents `#bdacff` `#b8eeec`; pods rim `#bd9cd2` | Polished mirror chrome and blue-violet anodized panels in mostly **mid-dark** values. Today's near-white `#d8f6f7` bands compete with the shard bullets (`#9feaff`/`#e3fcff`); cap highlights to thin edges. |

## 5. Piece list and sheet layouts

All sheets are RGBA PNG with a transparent background, source in `assets/source/`, runtime WebP in `assets/`. Rects are **px (x, y, w, h)**; the loader normalizes them by sheet size (same idea as `enemyRegions`). The art must fit inside the "art extent"; the rest of the cell stays transparent. Pivot is the cell center unless stated otherwise as (px, py) in 0–1 of the cell.

### Sheet `act2-s4-fleet.png`: 2048×1024 (128 px grid)

| Piece | Rect | S | Art extent (src px) | Pivot | Notes |
|---|---|---|---|---|---|
| `hull-destroyer` | 0,0,256,640 | 2 | 184×616 (incl. mast) | center = hull (0,0) | bow up; 3 empty turret rings at (0,−80),(0,−6),(0,72) ×S |
| `hull-cruiser` | 256,0,384,896 | 2 | 248×792 | center | 6 rings at the cruiser offsets |
| `gunboat` (opt.) | 640,0,256,256 | 3 | 132×237 | center | reskin of the atlas gunboat in S4 livery |
| `scavenger` | 896,0,256,128 | 3 | 150×90 | center | claws closed |
| `scavenger-open` | 1152,0,256,128 | 3 | 150×90 | center | claws open (alternate frames) |
| `mine` | 1408,0,128,128 | 3 | 114×114 | center | dark lens center; the fuse lamp is procedural |
| `torpedo` | 1536,0,128,256 | 3 | 72×132 | center | nose UP |
| `interceptor` (opt.) | 1664,0,256,256 | 3 | 204×216 | center | S4 livery for the `ace` |
| `turret-head-triple` | 640,256,256,256 | 3 | ≤192 radius-circle | center | barrels UP |
| `turret-head-fan` | 896,256,256,256 | 3 | " | center | |
| `turret-head-flak` | 1152,256,256,256 | 3 | " | center | |
| `turret-head-broadside` | 1408,256,256,256 | 3 | " | center | |
| `turret-head-void` | 1664,256,256,256 | 3 | " | center | violet emitter painted dim |
| `turret-base` | 640,512,128,128 | 3 | 120×96 | center | no gun-color rim; code tints the rim stroke |
| `turret-base-wreck` | 768,512,128,128 | 3 | 120×96 | center | |
| `turret-head-wreck` | 896,512,256,256 | 3 | ~150 | center | bent barrels, scorched |
| `scorch-1..3` | 1152/1280/1408,512,128,128 | 3 | ~96×72 | center | deck damage decals (optional) |

### Sheet `act2-leviathan.png`: 2048×1024

| Piece | Rect | S | Art extent | Pivot | Notes |
|---|---|---|---|---|---|
| `leviathan-hull` | 0,0,1024,512 | 2 | 840×408 (mast up to −102) | center = hull (0,0) | 4 empty turret rings; 10 battery slots; empty core well at (0,18); plates **not** painted |
| `leviathan-wreck` | 1024,0,1024,512 | 2 | same | center | burnt, buckled deck, same registration |
| `core-rotor-a` | 0,512,256,256 | 2 | 136×136 | center | 8 swept spokes, teal-steel |
| `core-rotor-b` | 256,512,256,256 | 2 | 136×136 | center | counter-handed, violet-steel |
| `core-armor-l` | 512,512,128,256 | 2 | 72×120 | center | slides −x |
| `core-armor-r` | 640,512,128,256 | 2 | 72×120 | center | slides +x |
| `core-bed` | 768,512,256,256 | 2 | 168×136 | center | engine bed seen when the plates part |
| `battery-block-r` | 1024,512,128,128 | 4 | 64×56 | center | right side |
| `battery-barrels-r` | 1152,512,128,128 | 4 | 84×32 | (0.1, 0.5) | twin barrels pointing +x; code scales length 9→21 |
| `battery-block-l` / `battery-barrels-l` | 1280 / 1408,512,128,128 | 4 | as above | mirror pivot (0.9, 0.5) | paint separately (light direction) |

Deck turrets reuse the `act2-s4-fleet` heads.

### Sheet `act2-s5-skyforge.png`: 2048×1024

| Piece | Rect | S | Art extent | Pivot | Notes |
|---|---|---|---|---|---|
| `foundry-large` | 0,0,768,384 | 2 | 648×336 | center | 4 bay apertures + 2 gun rings, empty |
| `foundry-small` | 768,0,640,320 | 2 | 496×248 | center | 3 bay apertures |
| `box-bomber` | 1408,0,512,320 | 3 | 408×279 | center | nose UP; empty gunner ring at the tail |
| `sky-ace` | 0,384,384,384 | 3 | 309×288 | center | nose UP; the ×1.2 is already included |
| `drone` | 384,384,192,192 | 3 | 126×126 | center | |
| `tail-gunner-base` | 576,384,128,128 | 3 | 72×72 | center | |
| `tail-gunner-head` | 704,384,192,192 | 3 | ~150 | center | barrel UP |
| `bay-closed` | 896,384,192,192 | 3 | 138×108 | center | shared by foundry and HALCYON |
| `bay-open` | 1088,384,192,192 | 3 | 138×108 | center | dark throat; glow procedural |
| `bay-dead` | 1280,384,192,192 | 3 | 150×96 | center | scorched socket |
| `sky-turret-base` | 1472,384,128,128 | 3 | 120×96 | center | S5 livery of `turret-base` |
| `sky-turret-head-void` | 1600,384,256,256 | 3 | ≤192 | center | barrels UP |

### Sheet `act2-halcyon.png`: 2048×640

| Piece | Rect | S | Art extent | Pivot | Notes |
|---|---|---|---|---|---|
| `halcyon-hull` | 0,0,1024,384 | 2 | 880×300 | center = hull (0,0) | 3 bay sockets at x −150/0/150; empty eye socket at (0,0); emitter mounts unlit |
| `halcyon-broken` | 1024,0,1024,384 | 2 | same | center | torn seams at x = ±48 |
| `eye-closed` | 0,384,192,192 | 2 | 128×128 | center | phases 1–2 |
| `eye-open` | 192,384,192,192 | 2 | 128×128 | center | phase 3; dark iris, dim |
| `eye-ring` | 384,384,256,256 | 2 | 172×172 | center | rotating tick ring |
| `lattice-emitter` | 640,384,64,64 | 3 | 30×45 | center | 10 instances |
| `crack-l` / `crack-r` | 704 / 960,384,256,128 | 2 | ~140×100 | center | hp <33% decals (optional) |

### Sheet `act2-s6-meridian.png`: 2048×640

| Piece | Rect | S | Art extent | Pivot | Notes |
|---|---|---|---|---|---|
| `gate-ring` | 0,0,768,384 | 2 | 704×296 | center | 6 empty turret pads; hub hole |
| `gate-hub` | 768,0,256,256 | 2 | 176×176 | center | optional counter-spin |
| `station-turret-base` | 1024,0,128,128 | 3 | 102×114 | center | |
| `station-turret-head-mix` / `-shard` / `-void` | 1152 / 1344 / 1536,0,192,192 | 3 | ~162 | center | barrel UP; distinct emitter shapes per gun |
| `station-turret-wreck` (opt.) | 1728,0,192,192 | 3 | ~140 | center | |
| `satellite` | 0,384,384,256 | 3 | 312×168 | center | body + solar wings |
| `satellite-arm` | 384,384,128,128 | 3 | 24×69 | (0.5, 0.5) at the arm root | arm points UP from center |
| `tether-node` (opt.) | 512,384,128,128 | 3 | 72×72 | center | grapple head |

### Sheet `act2-sovereign.png`: 2048×640

| Piece | Rect | S | Art extent | Pivot | Notes |
|---|---|---|---|---|---|
| `sovereign-hull` | 0,0,896,384 | 2 | 800×320 | center = hull (0,0) | empty core slot; 4 pod mounts at (−150/150/−80/80, 24) |
| `sovereign-fractured` (opt.) | 896,0,896,384 | 2 | same | center | glowing-seam crack overlay |
| `sovereign-core` | 0,384,128,256 | 2 | 96×240 | center | crystal diamond |
| `pod-socket` | 128,384,128,192 | 3 | 120×60 | (0.5, 0.39) | empty mount |
| `pod-power` / `pod-escort` / `pod-sidewinder` / `pod-generic` | 256 / 384 / 512 / 640,384,128,192 | 3 | 120×150 | (0.5, 0.39) = mount point | muzzles face DOWN (screen orientation) |
| `pod-shield` / `pod-reflector` / `pod-signature` (opt.) | 768 / 896 / 1024,384,128,192 | 3 | 120×150 | (0.5, 0.39) | replace `pod-generic` per type |

**Total: 6 sheets, about 70 pieces** (about 55 required).

## 6. Integration notes

| Where | Swap | Keep procedural on top |
|---|---|---|
| `fleetHull` 1667 (used by `fleetEnemy` 1744, `leviathan` 1827, `sinkingLeviathan` 1866) | Return the sprite canvas instead of the vector bake. Keep a silhouette-derived drop shadow (offset dark copy; today it is baked at translate(5,12)). | `fleetWake`, `fleetDamage` fires/smoke, hull flash |
| `fleetEnemy` hullTurret 1757–1777 | base sprite + head `rotate(aim+PI/2)`; wreck pieces when `hp<=0` | gun-color rim stroke, muzzle flash (`fleetMuzzles`), void glow |
| `fleetEnemy` scavenger / mine / torpedo 1789–1813 | sprite draws | carry halo + token (1791–1795), fuse lamp pulse, torpedo exhaust bloom + wake lines |
| `leviathan` 1823–1860 | hull; batteries (translate by `broadside`, scale barrels); plates; rotors (rotate ±1.7t, alpha = `core`) | core bloom + white center, lit-battery glow, `broadside` FX, flash |
| `sinkingLeviathan` 1861 | `leviathan-wreck` instead of `fleetHull` | list/scale/fade, fires, steam, spray rings |
| `skyHull` 1974 / `skyModule` 2021 / `skyEnemy` 2028 | sprite per type; tail-gunner head rotates | engine/vent bloom (rimFire), nav lights, smoke puffs, `skyCloudShadow`, flash |
| foundry void guns (game.js 1831 → `fleetEnemy`) | branch on `currentStage===5` to use the `sky-turret-*` pieces | muzzle flash |
| `halcyon` 2068 | hull; bays (via `skyEnemy`); `bay-dead` where `skyBayLife[i]` is false; emitters at phase ≥2; eye pieces at phase 3 | contrail streaks, `skyFire`, emitter warning bloom, eclipse disc (draw 770), nav blink |
| `skyHazards` wingBreak 2114 | clip `halcyon-broken` instead of `skyHull('halcyon')` | fires, secondary blasts, violet shock ring |
| `zeroHull` 2167 / `zeroEnemy` 2201 | station ring/hub, satellite + arm, turret base + head (**add `rotate(aim+PI/2)`**) | echo trails/phasing, tether beam + glyph, flash |
| `sovereign` 2236 / `zeroPod` 2224 | hull, core, pods at (ox, 24 + grow slide) | grow bolt ring, cracks (or decal), flash |
| `zeroEffects` shatter 2257 | needs `sovereign-hull` as a **standalone canvas** (it slices `tile.width/8 × tile.height/3`); pre-cut it at load | bloom, shard edge strokes |
| Hit flash | Replace white ovals with a per-piece white silhouette (pre-baked source-atop, like `wreck` in art.js:44) | — |
| Outline | For small craft over the dark S4/S6 fields, reuse the `outlined` warm-glow bake (art.js:40, shadow `rgba(255,217,174,.85)` blur 12) | — |

**Loader (`src/art.js`).** Add the 6 paths to `paths` in `prepareArt` (art.js:24); progress uses `paths.length` automatically. Add a new `pieceRegions` table and `drawPiece(c, id, x, y, rot=0, scaleMul=1)` that **does not alpha-trim** and draws at `1/S` around the pivot. Keep each procedural branch as the fallback when a piece is missing, using the same pattern as `if(!drawCraft(...))` in `fleetEnemy`. Today `prepareArt` returns `images.every(Boolean)`; decide whether optional Act II sheets should count toward `artLoaded` (main.js:30).

**Whitelists.** Every new `assets/*.webp` must be added to `runtimeFiles` in **`scripts/build.mjs`** (lines 36–44; it throws on unlisted runtime refs) and to the list in **`scripts/preview.mjs`** (lines 37–45). `server.mjs` serves any file (no change; it already has `.webp`/`.png` MIME types). No `test/*.mjs` counts assets. `qa/browser.mjs` records any 4xx response as an error, so a missing file fails QA. Put source PNGs in `assets/source/`.

**Draw order to respect** (draw 780–815). In S4, hulls/gunboats draw first, then non-boss turrets, then wrecks, then sinking, all under the projectiles. In S5, `foundry` and `foundryBay` draw **after the player** (they are overhead), then `foundrySilhouettes`. Keep the foundry sprites inside the footprint `|x| < w+12`, `|y| < h` that the silhouette test uses (2057). Shadows: `castShadows` 188 skips hull/hullTurret/gunboat/boss in S4.

**Verification.** Check every swap at 1440×1000, 390×844, 900×500 and with reduced effects (act-two.md S6 rule). Re-run `artifacts/art-audit/capture.mjs` (dev server on port 4381) for before/after.

## 7. Five things the image generator must get right

1. **Registration.** Fixed scale per sheet (S2 or S3 exactly), pivot at the cell center (or the stated pivot), no cropping or recentering, art inside its extent. Hulls are painted with empty sockets where every turret, bay, pod, plate and rotor sits.
2. **Orientation.** Small craft, torpedoes and turret heads nose/barrels UP. Bosses, hulls, foundries and the Gate in screen orientation. Surface ships bow up, LEVIATHAN broadside with the bow at +x. Left/right parts painted separately, not mirrored.
3. **Bullet readability.** Bodies at mid/dark value. No bright round dots in bullet hues (cream-orange, pink, violet, cyan-white). S6 chrome highlights must be thin edges, not bright fills.
4. **Clean plates.** Transparent background, with no baked shadows, glows, muzzle flashes, lit lights, hull text or hit flashes. Emissives are painted dim; the code lights them.
5. **Atlas parity and per-sector material.** Weathered, riveted, painted metal; top-down orthographic; key light upper left. S4 wet teal-grey naval steel, S5 plum/rose-gold foundry alloy, S6 blue-violet mirror chrome. Every piece must still read clearly when downscaled to its on-screen size.
