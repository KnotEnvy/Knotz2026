// 2026: deterministic, asset-free arcade simulation.
const SCORE_EXTENDS = [50000, 160000, 350000, 700000];
// Arsenal tuning (docs/design/act-two.md, Part 1). Power is uncapped: the
// main gun reaches its structural stream ceiling at level 8, then each level
// adds 6% damage and slightly larger shots.
const STREAM_CEILING = 8;
const OVERPOWER_DAMAGE = .06;
const MAX_ESCORTS = 6;
const SHOT_BUDGET = 650;           // live player shots; oldest small shots go first
const BULLET_CAP = 700;            // enemy bullets, sectors 1-3
// Act II (sectors 4+): docs/design/act-two.md, "Sector 4 build contract".
export const CAMPAIGN_STAGES = 6;  // last playable sector; victory follows its flagship (THE SOVEREIGN ends Act II)
export const ACT_TWO_STAGE = 4;
export const ACT_TWO_BULLET_CAP = 900;
const INTERLUDE = 3.5;             // sector-clear interlude (timeline INTERLUDE_LENGTH)
const ACT_TWO_INTERLUDE = 6.5;     // the "ACT II" card after the Crown, campaign only
const SALVAGE_LIFE = 9;            // seconds; tokens blink for their last 2.5 s
const SALVAGE_MAX_TOKENS = 10;
const SALVAGE_GRACE = .8;          // burst phase: no magnet or pickup, so a hit always scatters
const SALVAGE_BURST = [200,340];   // px/s outward from the impact point
const SALVAGE_MAGNET = 64;         // px; SALVAGE_MAGNET_FOCUS while focused
const SALVAGE_MAGNET_FOCUS = 100;
const PICKUP_MAGNET = 70;          // ordinary pickups; PICKUP_MAGNET_FOCUS while focused
const PICKUP_MAGNET_FOCUS = 105;
const ROLL_MAGNET_TIME = .35;      // seconds of magnet boost after a roll ends
const ROLL_MAGNET_SCALE = 1.8;     // "roll through the wreckage to snatch it back"
const SCATTER_BURN = .2;           // share of scattered power that burns away
const SCATTER_INVULN = 2;          // was 2.35 s before salvage existed
const SHIELD_CAP = 3;              // held charges, every ship; S pickups at the cap give +1 power
const MAX_BOMBS = 4;               // bomb pickups at the cap give +1 power
const SORTIE_POWER = 2;            // sorties (and the hangar preview) start at power 2
const SALVAGE_BOUNDS = {left:24,right:516,top:70,bottom:860};
const REFLECTOR_PICKUP = 6;        // seconds per R pickup
const REFLECTOR_RADIUS = 44;
const REFLECT_COST = .06;          // reflector seconds burned per reflected bullet
const ORBIT_RADIUS = 46;
const ORBITAL_COOL = .6;           // seconds before an orbital can eat again
const ORBITALS_SHOWN = 6;
const FLAK_SCREEN_TIME = .3;       // s (~230 px): Kestrel flak eats bullets only this close to the wing
const PARTICLE_CAP = 380;          // non-critical particles are dropped at the cap
const PARTICLE_HARD_CAP = 520;     // critical feedback (phase, scatter, bomb...) may overflow to here
const CRITICAL_PARTICLES = new Set(["boss","phase","ring","bomb","scatter","damage","shield","power","pickup","roll","explode"]);
// 1942 squadron bonus (Act II): wiping every craft of one formation wave drops
// this many equipment items (never power, so the bonus cannot compound the
// main gun). Act I wipes pay points and flavour (ACT_ONE_SQUAD_*).
const SQUADRON_BONUS_DROPS = 1;
// Act II random drop weights (Act I rolls ACT_ONE_FLAVOUR instead).
const DROP_WEIGHTS = [["power",50],["escort",12],["sidewinder",12],["signature",9],["shield",9],["reflector",8]];
const EQUIPMENT_WEIGHTS = DROP_WEIGHTS.filter(([type])=>type!=="power");
// Act II bonus ladder (LEVIATHAN's turrets, its spoils, sector-4 drills).
// Act I pays its kit from the authored ledger (STAGE_BEATS, ACT_ONE_SPOILS)
// instead, and a campaign enters Act II on the equipment cycle. A fresh
// ladder (drill 4) opens on the six starter rungs.
const BONUS_LADDER = ["escort","sidewinder","signature","power","reflector","shield"];
const BONUS_CYCLE = ["sidewinder","escort","signature","reflector","shield"];
// Act II: chance that an ordinary kill rolls the weighted table (round 3: x0.7).
// Formation scouts and wings never roll; they pay out as a squadron bonus.
// Act II: interceptors pay out through the squadron bonus; hulls and turrets
// carry authored drops; scavengers return what they stole; mines and enemy
// torpedoes never drop.
const DROP_CHANCE = {scout:.025,wing:.03,bomber:.18,ace:.1,turret:.18,carrier:1,mini:1,
  interceptor:0,gunboat:.16,hull:0,hullTurret:.08,scavenger:0,mine:0,torpedoEnemy:0,
  // Sector 5: boxes pay through the squadron bonus; foundries and bays carry
  // authored drops; drones are popcorn.
  boxBomber:0,tailGunner:.06,skyAce:.1,foundry:0,foundryBay:0,drone:0,
  // Sector 6: echoes pay through the squadron bonus; the station and the
  // SOVEREIGN's escorts carry authored drops; tethers carry stolen salvage.
  echo:0,satellite:.1,station:0,stationTurret:.06,mirrorEscort:0,tether:0};
// Act II bonus items on top of an authored drop (no Act II carriers or minis
// fly today; Act I carriers and minis carry only their authored drops).
const BONUS_DROPS = {carrier:1,mini:2};
const BIG_TARGETS = new Set(["boss","bomber","turret","carrier","mini","hull","hullTurret","gunboat",
  "boxBomber","foundry","foundryBay","station","stationTurret","satellite","mirrorEscort"]);
// Sector-4 enemy types. Surface craft (hulls, their turrets, gunboats) sit
// below the air layer: body contact never hurts the player.
const ACT_TWO_TYPES = new Set(["interceptor","gunboat","hull","hullTurret","scavenger","mine","torpedoEnemy",
  "boxBomber","tailGunner","skyAce","foundry","foundryBay","drone",
  "echo","satellite","station","stationTurret","mirrorEscort","tether"]);
const SURFACE_TYPES = new Set(["gunboat","hull","hullTurret"]);
// Never hurt on contact: surface ships, and sector 5's foundries (they fly
// above the player's layer), their bays and the bombers' gunners (the bomber
// body is the contact hazard).
// Sector 6: the Meridian Gate flies above the player like the foundry; tether
// nodes are salvage on its way up, never a contact hazard.
const NO_CONTACT_TYPES = new Set([...SURFACE_TYPES,"foundry","foundryBay","tailGunner","station","stationTurret","tether"]);
// Child guns and bays ride a parent: a shot over a live child hits it first.
const CHILD_TYPES = new Set(["hullTurret","foundryBay","tailGunner","stationTurret","mirrorEscort"]);
// Heavies a stripped ship (threat < LOW_THREAT) damages x1.5: hull turrets
// (sector 4), and sector 5's bays, gunners, bombers, aces and foundries.
const WEAK_KIT_TYPES = new Set([...CHILD_TYPES,"boxBomber","skyAce","foundry","satellite","station"]);
const SECTOR_FIVE_TYPES = new Set(["boxBomber","tailGunner","skyAce","foundry","foundryBay","drone"]);
// Fliers that are gone once they climb out of the top.
const ESCAPE_TYPES = new Set(["interceptor","scavenger","torpedoEnemy","boxBomber","skyAce","drone","echo"]);
const FORMATION_TYPES = new Set(["scout","wing","interceptor","echo"]);
const SECTOR_SIX_TYPES = new Set(["echo","satellite","station","stationTurret","mirrorEscort","tether"]);
// ---- Sector 5, SKYFORGE (docs/design/act-two.md, "Sector 5 build contract"
// and "Simulation notes (sector 5)"). Tuned against the sector-5 reference
// kit: what the no-hit ledger collector carries out of LEVIATHAN (P43, E6,
// M12, *12, S3; raw flagship DPS ~3,700-4,700, about 1.75x the P25 kit).
// Act II HP scale per sector (sector 4 stays 1; later sectors fall back to +35%
// each). Popcorn keeps the gentler POPCORN_HP_SCALE, so it still melts to the
// reference kit and a stripped ship can still wipe squadrons and catch rescue drops.
const ACT_TWO_HP_SCALE = [1,1,1,1,1,2.2,3.1];
const POPCORN_HP_SCALE = [1,1,1,1,1,1.35,1.6];
// Heavies reach the full scale at HEAVY_FULL_THREAT (the reference kit, ~0.84+)
// on an eased ramp from LOW_THREAT (x^HEAVY_EASE), so a P25 kit (~0.68) meets
// x1.84 rather than round 1's x2.09.
const HEAVY_FULL_THREAT = .84, HEAVY_EASE = 1.6;
const POPCORN_TYPES = new Set(["interceptor","scavenger","mine","torpedoEnemy","drone","echo"]);
const BOX_BOMBER_HP = 1600, TAIL_GUNNER_HP = 420, SKY_ACE_HP = 1000, DRONE_HP = 30;
const FOUNDRY_CLASSES = {
  small:{hp:9000,w:112,h:62,vy:34,value:14000,bayHp:1100,turretHp:1400},
  large:{hp:11000,w:150,h:84,vy:30,value:26000,bayHp:1300,turretHp:1600}
};
const FOUNDRY_ARMOR = .35;         // foundry damage share while any bay lives
const BAY_CYCLE = 3;               // s between a foundry bay's drone launches (x _pace)
const BAY_OPEN = .45;              // s of bay-door opening before a launch
const BOX_LEAD = 1.2;              // s from boxEnter (the edge warning) to entry
const BOMBER_CLIMB_SPEED = 170, BOMBER_DIVE_SPEED = 120;
const ACE_DODGE_RANGE = 40, ACE_DODGE_TIME = .42, ACE_DODGE_SPEED = 360, ACE_DODGE_COOL = 1.2;
const MAIN_GUN_SHOTS = new Set(["shot","lance","pierce"]);
const FLAK_WARN = 1, FLAK_GAP = 80, FLAK_STEP = 26, FLAK_SPEED = 120, FLAK_TTL = .55;
// Sector 5's own fire is a notch faster and denser than sector 4's (HALCYON keeps the shared rank).
const SECTOR_FIVE_SPEED = 1.12, SECTOR_FIVE_PACE = .88;
// The notch fades in from threat LOW_THREAT/2 and is full at SECTOR_FIVE_FULL (round 3: .85,
// was .75), so a P25 kit (~.66) meets about 73% of it and the reference kit (~.85) all of it.
const SECTOR_FIVE_FULL = .85;
// Round 3, mid-threat fire density: the extra ways of a sky-ace stream (3-way) and of a
// foundry void battery (5-way) start at these threats, so a P25 kit (~.66) meets the
// narrower streams and the reference kit (~.85) the full ones.
const ACE_WIDE_THREAT = .7, VOID_BATTERY_WIDE_THREAT_S5 = .75;
const LASER_WARN = .9, LASER_ON = .8, LASER_WIDTH = 9, LASER_GAP = 56;   // half-gap of a row
const EMP_CHARGE = 1.2, EMP_TIME = 2, EMP_RADIUS = 120, EMP_SHOW = .35, EMP_LEAD = .6;
// Round 3: the ring grows with the rank, read at spawn: EMP_RADIUS at threat EMP_RANK_FROM or
// less, EMP_RADIUS_FULL at EMP_RANK_FULL (the reference kit) and above. A full kit can no
// longer drift out of it; it has to turn or roll deliberately.
const EMP_RADIUS_FULL = 170, EMP_RANK_FROM = .6, EMP_RANK_FULL = .84;
const HALCYON_HP = 240000, HALCYON_BAY_HP = 1800, HALCYON_SWAY = 24;
// HALCYON's bays hold longer against a full kit, so phase 1 ("Three bays")
// reads: up to x HALCYON_BAY_RANK more HP from threat .7 (a sector-4 kit) to
// .84 (the sector-5 reference kit) and above.
const HALCYON_BAY_RANK = 2.6, HALCYON_BAY_RANK_FROM = .7, HALCYON_BAY_RANK_FULL = .84;
// Campaign mercy (never in drills, like Act I's): HALCYON meets a short kit
// with less HP. Full HP from the reference arsenal (87) up; it falls linearly
// to HALCYON_MERCY_FLOOR at arsenal HALCYON_MERCY_LOW and below. The
// reference kill is held by the learn windows, so only weak kits feel it.
const HALCYON_MERCY_FLOOR = .55, HALCYON_MERCY_LOW = 30, HALCYON_MERCY_FULL = 100;
const HALCYON_LAUNCH = 6;          // s between one bay's squadron launches (x _halcyonPace)
// Round 3, the mid-kit HALCYON: its cooldowns run up to HALCYON_EASE_SPAWN longer for a ship that
// arrived below the reference kit (threat at spawn, full ease at HALCYON_EASE_FROM - HALCYON_EASE_SPAN
// or less), plus up to HALCYON_EASE_LIVE for a ship whose threat has since fallen (scatters).
// The reference kit (threat ~.84+) meets the authored flagship.
const HALCYON_EASE_SPAWN = .35, HALCYON_EASE_LIVE = .08, HALCYON_EASE_FROM = .84, HALCYON_EASE_SPAN = .24;
const HALCYON_LATTICE_CYCLE = 2.9; // s between lattice frames (x _bossPace)
const HALCYON_HANGAR = 4.2;         // s between core-hangar drone pairs, phases 2-3 (x _bossPace)
// ---- Sector 6, ZERO MERIDIAN (docs/design/act-two.md, "Sector 6 build contract"
// and "Simulation notes (sector 6)"). Tuned against the sector-6 reference kit:
// what the no-hit ledger collector carries out of HALCYON (P62, E6, M24, *22, S3).
// Sector 6 pays rescue power a notch higher again, and has its own notch.
const RESCUE_THREAT_S6 = .65;
// The sector's elite tier: a kit at SECTOR_SIX_ELITE or above (the reference
// kit sits at ~.88; a P25 kit ~.69, a real arrival ~.55-.65) meets return
// sweeps on the satellites, two-volley echoes, six-echo wings, an extra curtain
// row with studs every fourth slot, five-ace wings, a four-bomber climbing box
// and the station's 5-way void spreads.
const SECTOR_SIX_ELITE = .8;
const SECTOR_SIX_SPEED = 1.14, SECTOR_SIX_PACE = .8, SECTOR_SIX_FULL = .85;
// Echoes replay the player's recorded path ECHO_DELAY s late (PATH_HZ samples
// per second, one per sim tick), mirrored and ECHO_OFFSET px up-field.
const PATH_HZ = 120, ECHO_DELAY = 2.5, PATH_SIZE = 360;
const ECHO_HP = 40, ECHO_OFFSET = 410, ECHO_LIFE = 6.5, ECHO_ENTER = .8, ECHO_FIRE = 1.6;
const ECHO_RAIL_WARN = .55, ECHO_RAIL_ON = .2;
// Satellite lances: a slow orbital crossing that sweeps a rotating laser. Each
// sweep warns SAT_WARN s on its start line, then turns (SAT_SWEEP_LOW rad/s at
// threat .6 or less, SAT_SWEEP from .84) across SAT_SPAN px at the ship's
// altitude. The start line sits SAT_LEAD px beside the ship, so the ship can
// slip behind it during the warning or outrun the sweep; a clear run of
// SAT_GAP_MIN px always stays open (a test pins it).
const SATELLITE_HP = 6000, SATELLITE_SPEED = 30, SAT_CYCLE = 3.6, SAT_WARN = .9, SAT_SWEEP = .72, SAT_SWEEP_LOW = .46, SAT_SPAN = 280, SAT_LEAD = 80;
const SAT_LASER_WIDTH = 8, SAT_LASER_LEN = 1100, SAT_GAP_MIN = 110;
// Shard rounds: destructible enemy bullets (any player shot breaks one).
const SHARD_R = 5.4, SHARD_SPEED = 140, SHARD_CELL = 24;
// The Meridian Gate: an armored orbital station (a hull in the air).
const STATION_CLASS = {hp:15000,w:176,h:74,vy:44,holdY:205,hold:15,leaveVy:32,value:42000,turretHp:1700};
const STATION_ARMOR = .35;
// THE SOVEREIGN (stage 6): mirror escorts armor the core (x LEVIATHAN_ARMOR),
// tethers carry phase-2 salvage up to the hull in TETHER_TIME s.
const SOVEREIGN_HP = 300000, SOVEREIGN_ESCORT_HP = 2000, SOVEREIGN_SWAY = 28;
// Campaign mercy (never in drills): HP x SOVEREIGN_MERCY_FLOOR at arsenal
// SOVEREIGN_MERCY_LOW or less, full from SOVEREIGN_MERCY_FULL (a reference
// arrival carries ~140-170). Mid-kit pace: cooldowns up to x(1 + EASE_SPAWN)
// for a ship that arrived below the reference kit, plus EASE_LIVE once it is
// stripped (the HALCYON_EASE_* thresholds).
const SOVEREIGN_MERCY_FLOOR = .62, SOVEREIGN_MERCY_LOW = 30, SOVEREIGN_MERCY_FULL = 130;
const SOVEREIGN_EASE_SPAWN = .2, SOVEREIGN_EASE_LIVE = .2;
const SOVEREIGN_ECHO_CYCLE = 10;   // s between the SOVEREIGN's echo pairs (x the shared flagship rank)
// THE SOVEREIGN's rank (boss.rank, 0..1, read at spawn): 0 at threat
// SOVEREIGN_RANK_FROM or less, 1 from SOVEREIGN_RANK_FULL (the reference kit).
// It brings the void layers in (the answer to a maxed kit), quickens the escorts
// and the phase-2 clock and thickens phase 3, on a ramp so no arrival meets a cliff.
const SOVEREIGN_RANK_FROM = .45, SOVEREIGN_RANK_FULL = .84, SOVEREIGN_RANK_HP = .3;
const TETHER_TIME = 2.9, TETHER_HP = 60, SOVEREIGN_WEAPONS_MAX = 4;
// Act II HP curve, tuned against the power-25 reference kit (P25, 6 escorts,
// sidewinder 4, signature 4; raw flagship DPS 1,820-2,110):
//   popcorn (interceptor, scavenger, torpedo, mine) dies to a single volley;
//   gunboats in ~0.5 s; a destroyer in ~4-9 s of focused fire including its
//   turrets, the cruiser (the mid-sector peak) in ~7-14 s.
// [hp, radius, scroll vy, score]. Later Act II sectors scale HP by +35% each.
const ACT_TWO_SPECS = {interceptor:[55,14,0,260],gunboat:[900,21,52,900],
  hullTurret:[1100,16,0,1500],scavenger:[45,11,0,450],mine:[120,13,50,180],torpedoEnemy:[42,9,0,160],
  // Sector 5 (base HP; x ACT_TWO_HP_SCALE[5] like everything in the sector).
  boxBomber:[BOX_BOMBER_HP,30,0,1400],tailGunner:[TAIL_GUNNER_HP,10,0,500],skyAce:[SKY_ACE_HP,16,0,900],
  foundryBay:[900,18,0,1800],drone:[DRONE_HP,9,0,120],
  // Sector 6 (base HP; x the sector-6 scale, popcorn for echoes; tethers never scale).
  echo:[ECHO_HP,14,0,320],satellite:[SATELLITE_HP,22,0,2400],stationTurret:[STATION_CLASS.turretHp,17,0,1600],
  mirrorEscort:[SOVEREIGN_ESCORT_HP,20,0,3000],tether:[TETHER_HP,11,0,600]};
const HULL_CLASSES = {
  destroyer:{hp:5600,w:46,h:132,vy:40,value:9000,turretHp:1100},
  cruiser:{hp:9000,w:62,h:176,vy:38,value:20000,turretHp:1600}
};
const HULL_ARMOR = .35;            // hull damage share while any of its turrets lives
const LEVIATHAN_ARMOR = .25;       // core damage share while any deck turret lives
const LEVIATHAN_HP = 145000;
const LEVIATHAN_TURRET_HP = 1800;
const LEVIATHAN_SWAY = 20;         // px each side of centre
const VOID_MIN_RADIUS = 5;
const SCAVENGER_CAP = 4;           // live scavengers at once
const SCAVENGER_CALL = .6;         // seconds from a sector-4 scatter to the scavenger call-in
const SCAVENGER_SPEED = 330;       // px/s while flying at a salvage target
const CRUISER_TORPEDO_CYCLE = 3.2; // seconds between cruiser torpedo pairs
// Threat rank (Act II is "aware of the arsenal"): game.threat follows the
// carried arsenal on a saturating curve, THREAT_MAX*tanh((arsenal-FLOOR)/SPAN).
// A bare ship sits at 0, a power-12 mid kit near 0.25, the power-25 reference
// kit near 0.69 and Crown-arrival kits at 0.85-0.87, so the rank still moves
// across real kits instead of pinning at a cap. It sets Act II fire cadence
// (_pace), bullet speed and volley size. It rises slowly, so each sector
// opens on a power trip, and falls after a scatter, so a stripped ship can
// rebuild while it chases its salvage.
const THREAT_FLOOR = 6, THREAT_SPAN = 37, THREAT_MAX = .88, THREAT_RISE = .15, THREAT_FALL = .35;
// Threat gates (on the curve above). LOW: a stripped ship (interceptors skip
// their entry burst; hull turrets take +50% damage). SECOND_BURST, a kitted
// ship: interceptors fire their entry burst at the field edge as narrow 3-way
// rounds and add a third burst; gunboats add a re-aimed follow-up burst.
const LOW_THREAT = .3, SECOND_BURST_THREAT = .65, WEAK_KIT_TURRET_BONUS = 1.5;
// Volley sizes grow with threat and are full from VOLLEY_FULL (about a
// power-30 full kit) upward.
const VOLLEY_FULL = .75;
// Rescue drops, the other half of the rank: squadron leads and gunboats carry
// a power level only while threat is below this (a stripped or bare ship),
// so a weak pilot can rebuild without feeding a full kit's snowball.
const RESCUE_THREAT = .5;
// Sector 5 pays rescue power a notch higher (a kit LEVIATHAN has stripped to
// P10-20 sits near 0.5-0.6), so an under-kitted arrival can rebuild.
const RESCUE_THREAT_S5 = .6;
const BURST_CUE_COOLDOWN = .085;  // per target: missile/torpedo burst cues (not damage)
const SMALL_SHOTS = new Set(["shot","lance","escort","flak","orbital","reflect"]);
// ---- Act I (sectors 1-3): docs/design/act-two.md, Part 3 -----------------
// The kit ledger: an engaged no-hit collector reaches each flagship with
//   Vesper  P7-9   E2  M1 *1 S0-1;  Aurelia P13-16 E4 M2 *2 S1-2;
//   Crown   P19-22 E6  M3 *3 S2-3;  sector 4 (after the Crown spoils) P24-27 E6 M4 *4 S3,
// the power-25 reference kit Act II is tuned against. Most of it is authored
// on STAGE_BEATS (formation leads, carriers, turrets, minis) and flagship
// spoils; random rolls and squadron wipes are flavour.
export function actOf(stage) { return stage>=ACT_TWO_STAGE?2:1; }
// Act I HP by sector, tuned against the ledger kit at that point: popcorn
// (scout, wing) dies to one or two volleys, heavies take sustained fire.
// Replaces the old flat 1+(stage-1)*.22 curve (still used by the Act I craft
// that sector 4 borrows for its scavenger curtain).
const ACT_ONE_HP = {scout:[18,36,60],wing:[26,50,84],ace:[50,85,150],bomber:[85,250,600],
  turret:[115,420,760],carrier:[150,650,1100],mini:[450,2000,3200]};
// Act I generated drops are flavour: heavies (and the odd loner) roll a small
// table, a squadron wipe always pays points and sometimes a reflector. Bombs
// are authored (sector 2's closing relay carrier, sector 3's closing flank
// lead), because a full bay converts them to power. HP is the authored value
// for a kit on its entitlement; ACT_ONE_MERCY softens it for a short kit.
const ACT_ONE_DROP_CHANCE = {scout:.008,wing:.01,bomber:.08,ace:.04,turret:.06,carrier:0,mini:0};
const ACT_ONE_FLAVOUR = [["reflector",60],["power",40]];
const ACT_ONE_SQUAD_FLAVOUR = [["reflector",1]];
const ACT_ONE_SQUAD_ITEM = .3;     // chance a wipe also drops an item
const ACT_ONE_SQUAD_POINTS = 150;  // per craft wiped
// Flagship spoils (collected in the interlude). The Crown's spoils carry the
// kit across the Act II gate: +4 power, the 4th sidewinder and signature.
const ACT_ONE_SPOILS = [null,["power","shield"],["power","sidewinder"],
  ["power","power","power","power","sidewinder","signature"]];
// Act I reads the threat rank too, more gently than Act II: cooldowns x
// ACT_ONE_PACE_BASE/(1+ACT_ONE_PACE_K*t) (1.45 bare or stripped, ~1.2 at
// Vesper's ledger rank, ~0.92 at Aurelia's, ~0.8 at the Crown's), bullets
// +12% at t=1, smaller volleys below ACT_ONE_SMALL and bigger ones past
// each type's gate (late in sector 3 for a ledger kit).
const ACT_ONE_PACE_BASE = 1.45, ACT_ONE_PACE_K = 1.3, ACT_ONE_SPEED = .12;
// Authored per-sector cadence on top of the rank (was 1-(stage-1)*.08): the
// Act I ramp toward sector 4.
const ACT_ONE_STAGE_PACE = [0, 1.15, 1.1, 1];
// Act I flagships lean on the rank like LEVIATHAN does, more gently: x1.5
// slower for a stripped ship, ~1.36 for Vesper's arrival kit, ~1.1 at the
// Crown's (round 2: was 1.25 base; flagship hits were the campaign's biggest cost).
const ACT_ONE_BOSS_PACE_BASE = 1.5, ACT_ONE_BOSS_PACE_K = .6;
// Act I flagship salvo cadence per phase (s, before the rank). Vesper teaches
// (was .78/.58/.52); Aurelia and the Crown keep their pressure (was .78/.58/.48
// and .78/.58/.42) over longer fights.
const BOSS_CADENCE = [null,[.9,.68,.6],[.78,.58,.5],[.8,.6,.52]];
// The Crown's final phase: a CROWN_FINAL_FAN-bullet magenta fan every salvo
// and an amber counter-fan every CROWN_FINAL_COUNTER_EVERY salvos (round 1
// fired both every salvo: 16+16, was 19+19). Density target: peak live enemy
// bullets about 150 or fewer in the Crown fight, near sector 4's 118-137.
const CROWN_FINAL_FAN = 16, CROWN_FINAL_COUNTER_EVERY = 2;
const ACT_ONE_GATES = {ace:.4,carrier:.45,wing:.5,turret:.5,mini:.5,bomber:.55,scout:.6};
// Below this a ship is bare or stripped (or early in sector 1): volleys shrink
// a size (wing 5->3, bomber 7->5, turret 5->3, carrier 9->7, mini 12->9).
const ACT_ONE_SMALL = .12;
// Act I recovery: a comeback for a scattered or stripped pilot, never a
// bonus for a clean one. A sector owes the pilot its entry row (below; escorts
// in pairs) plus every authored item and rescue power of the beats flown so
// far. Rescue and recovery leads (STAGE_BEATS `rescue` / `recover`) top up
// whatever is missing: salvage that expired, a carrier that escaped, a pickup
// that fell off the bottom. What the pilot holds counts the kit plus
// everything still in play (live salvage and pickups, drops still riding
// enemies), so a clean collector, always at or above the ledger, never sees a
// recovery token. Each lead pays at most one equipment token (escort, then
// signature, then sidewinder; Wraith takes its orbitals first) and, when power
// is more than ACT_ONE_RECOVER_SLACK levels short, one power token worth a
// level per ACT_ONE_RECOVER_STEP levels of shortfall past the slack (up to
// ACT_ONE_RECOVER_MAX). Act I flagship phase breaks are opportunities too.
const ACT_ONE_ENTRY = [null,
  {power:2,escort:0,sidewinder:0,signature:0},     // launch
  {power:9,escort:1,sidewinder:1,signature:1},     // after Vesper's spoils
  {power:16,escort:2,sidewinder:3,signature:2}];   // after Aurelia's spoils
const ACT_ONE_RECOVER_SLACK = 3, ACT_ONE_RECOVER_STEP = 2, ACT_ONE_RECOVER_MAX = 4;
const ACT_ONE_RECOVER_ORDER = ["escort","signature","sidewinder"];
const ACT_ONE_RECOVER_ORDER_WRAITH = ["signature","escort","sidewinder"];
// Act I mercy: a kit short of its entitlement meets softer craft. Each beat's
// craft (and each flagship, on arrival) spawn with HP x max(ACT_ONE_MERCY_FLOOR,
// 1 - ACT_ONE_MERCY_PER_LEVEL x shortfall), the shortfall counted in arsenal
// levels (power, 1 per escort, 1.5 per sidewinder or signature level) against
// what the pilot holds or can still catch. A clean collector is never short,
// so it meets the authored HP; flagships still hold their learn windows.
const ACT_ONE_MERCY_PER_LEVEL = .045, ACT_ONE_MERCY_FLOOR = .4;
const DRILL_LOADOUTS = [null,
  // Act I drills start on the ledger's arrival rows (Manta adds its +2 shield, capped).
  {level:8,escorts:2,sidewinder:1,signature:1,shield:1},    // Vesper
  {level:14,escorts:4,sidewinder:2,signature:2,shield:2},   // Aurelia
  {level:20,escorts:6,sidewinder:3,signature:3,shield:3},   // The Crown
  {level:25,escorts:6,sidewinder:4,signature:4,shield:3},  // LEVIATHAN: the power-25 reference kit
  {level:43,escorts:6,sidewinder:12,signature:12,shield:3}, // HALCYON: the sector-5 reference kit
  {level:62,escorts:6,sidewinder:24,signature:22,shield:3}  // THE SOVEREIGN: the sector-6 reference kit
];
// Visual growth of main-gun shots past the stream ceiling: logarithmic with no
// hard stop. +0.9 px at power 13, +1.8 at 20, +2.5 at 30, +3.3 at 50, +4.1 at 80.
export function overpowerGrowth(over) { return over>0?1.6*Math.log1p(over/6):0; }
export const SHIP_IDS = ["kestrel", "manta", "wraith"];
export const SHIP_DEFS = {
  kestrel: {id:"kestrel",name:"KESTREL",role:"Balanced striker",weapon:"spread",special:"nova",
    description:"Wide cannons and a screen clearing nova."},
  manta: {id:"manta",name:"MANTA",role:"Armored hunter",weapon:"missile",special:"barrier",
    description:"Homing missiles, layered shields, and a defensive pulse."},
  wraith: {id:"wraith",name:"WRAITH",role:"Precision wing",weapon:"pierce",special:"storm",
    description:"Piercing rail fire, ghost orbitals, and a conversion storm."}
};
// Sparse, authored pressure beats cross the lower safe lane. The first row is
// visible for several seconds; the second row moves the open corridor by 90px.
const BOSS_LEARN_AGES = { phase2: 10, phase3: 18, defeat: 22 };
// Guard floors hold each phase until the boss's effective "learn age"
// (age + learnShift) reaches the next entry above. Damage absorbed by a floor
// speeds that clock: the absorbed rate above BOSS_GUARD_PAR (share of max HP
// per second, smoothed) adds BOSS_GUARD_K seconds of learn age per max HP.
// A phase still lasts at least BOSS_PHASE_MIN of its authored window.
// Learn windows per flagship: [_, phase 2, phase 3, defeat]. Vesper keeps the
// authored 10/18/22; Aurelia and the Crown play longer fights (Act I ramp),
// and LEVIATHAN plays 24/46/68 (deck guns, broadside, monsoon engine).
const BOSS_LEARN_BY_STAGE = [null,
  [0, BOSS_LEARN_AGES.phase2, BOSS_LEARN_AGES.phase3, BOSS_LEARN_AGES.defeat],
  [0, 12, 21, 25],
  [0, 13, 25, 30],
  [0, 24, 46, 68],
  [0, 24, 48, 74],
  [0, 30, 60, 92]];
const BOSS_PHASE_MIN = .55;
const BOSS_GUARD_K = 2.6;
// LEVIATHAN's HP pool is ~56x Vesper's, so its absorbed share per second is
// small; K is scaled so surplus firepower still buys learn age.
// Aurelia and the Crown carry more HP per arrival-kit second, so their K is
// doubled to keep rewarding surplus firepower (a P25 kit still kills faster).
const BOSS_GUARD_K_BY_STAGE = [0, BOSS_GUARD_K, 5.2, 5.2, 20, 20, 20];
// Par = share of max HP per second the sector's arrival-ledger kit deals, so
// that kit keeps the authored pacing and only surplus firepower buys time.
// LEVIATHAN: the power-25 reference kit (~2,300 DPS on 145,000 HP).
// HALCYON: the sector-5 reference kit (~4,200 DPS on 240,000 HP).
const BOSS_GUARD_PAR = [0, .19, .14, .15, .016, .017, .016];
// Flagship HP, tuned against the arrival-ledger kit (Act I) and the
// power-25 reference kit (LEVIATHAN).
const BOSS_HP = [0, 3800, 9000, 10500, LEVIATHAN_HP, HALCYON_HP, SOVEREIGN_HP];
const BOSS_GUARD_SMOOTH = .4;      // seconds; absorbed-rate smoothing window
// Lane sweeps. Act I: each sector's first sweep follows its first shield
// (sector 2's comes from Vesper's spoils).
const LANE_BEATS = [null,
  [[19.5,150],[32,390],[49,175]],
  [[9,385],[23,155],[41,365],[59,185]],
  [[21,380],[39.5,180],[53.5,360],[67.5,155],[77.5,375]],
  [[19,150],[43,385],[71,165],[84,375],[90,170]],
  [],  // sector 5: flak bands (hazards) replace the lane sweeps
  []   // sector 6: satellite lances and shard curtains
];
// Each sector has its own cadence. The gaps before the closing acts let old
// fire leave the screen before the next formation arrives.
// Act I beats are [time, pattern, drops]. The drops are the authored kit
// ledger (docs/design/act-two.md, Part 3): `lead` is carried by the
// formation lead, `heavy` by the carrier, mini or centre turret, and
// `rescue` makes the lead carry power while threat < RESCUE_THREAT.
// `recover` makes the lead a recovery lead (see _actOneRecovery): it pays
// only a kit that has fallen below its entitlement, so a clean collector
// never sees it. Rescue leads recover equipment too.
// Drop -> attack is timed at collection, not spawn: a lead's drop reaches an
// engaged collector ~4-6 s after its beat, a heavy's ~5-11 s, so each key
// drop rides a beat early enough to be in hand about 2 s before the attack
// that shows it off starts firing (~1.5 s after that attack's beat; a lane
// sweep needs ~5 s to reach the ship). Openings land after the intro card
// (2.5 s or later). A `wraith` entry overrides the beat's drops for Wraith
// (Act I only): its low-power rails screen little, so its orbitals come
// earlier in sectors 1 and 2. Same items per sector, same ledger.
// Exported read-only for tests (the authored drop schedule).
const SECTOR_FIVE_BEATS = [
  [2.5,"loopL",{lead:"sidewinder"}],               // sidewinder (~7 s) -> the 10 s sky-ace pair
  [4.9,"loopR"],
  [7.2,"sweepL",{lead:"signature"}],               // signature (~10 s) -> the box gunners' aimed streams
  [10,"acePair"],
  [14,"boxClimb"],                                 // threats now come from below
  [15.5,"sweepR",{lead:"shield"}],                 // shield (~19 s) -> the 24 s flak corridor
  [18.5,"riseR"],
  [21,"acePair"],
  [24,"flakCorridor"],
  [29.5,"sweepR",{lead:"power"}],                  // power (~32 s) -> foundry 1 (heavy armor)
  [31,"acePair"],
  [34,"foundry1",{heavy:["power","power"],bays:["power","signature","power"]}],   // signature (~42 s) -> the 45.5 s box's gunners, the ace wing
  [37,"loopL"],
  [40.5,"riseL"],
  [41,"flakPair"],
  [43.5,"riseR",{lead:"reflector"}],               // reflector (~45 s, 6 s) -> the ace wing's streams and shrapnel
  [45.5,"boxClimb"],
  [48,"aceWing",{rescue:1}],                       // the wing lead carries rescue power
  [54.5,"sweepL",{lead:"signature"}],              // signature (~57 s) -> the peak's aimed streams
  [56,"riseR"],
  [60,"foundry2",{heavy:["power","power"],bays:["power","shield","power","sidewinder"]}],
  [62,"boxClimb4"],
  [65.5,"boxDive"],
  [72,"sweepR"],
  [72.5,"flakPair"],
  [75,"riseBoth",{lead:"shield"}],                 // shield (~79 s) -> the 83.5 s flak gauntlet
  [82,"pincerSweep"],
  [83.5,"flakGauntlet"],
  [87.5,"acePair"],
  [89.5,"pincerLoop"],
  [92.5,"riseBoth",{lead:"power"}],                // power before HALCYON
  [95.5,"flakPair"]
];
// Sector 6, ZERO MERIDIAN (~105 s). Drops are timed at collection, about 2 s
// or more before the attack each answers ("Simulation notes (sector 6)").
const SECTOR_SIX_BEATS = [
  [2.5,"loopL",{lead:"power"}],
  [4.9,"loopR"],
  [7.2,"sweepL",{lead:"sidewinder"}],              // sidewinder (~10 s) -> the 14 s echo pair (homing finds them)
  [9.5,"riseR"],
  [14,"echoPair"],                                 // "that's my flight path"
  [15.5,"sweepR",{lead:"shield"}],                 // shield (~18 s) -> the 24 s satellite lances
  [18.5,"riseL"],
  [21,"loopR"],
  [24,"satellites",{lead:"power"}],                // two lances crossing, with drifting popcorn
  [27.5,"echoPair"],
  [29,"sweepR",{lead:"power"}],                    // power (~32 s) -> the 34 s shard curtain (carve it)
  [31,"riseL"],
  [34,"shardCurtain"],
  [38,"echoPair",{lead:"signature"}],              // signature (~41 s) -> the 48 s echo wing
  [40.5,"riseR"],
  [43.5,"loopL"],
  [44.5,"satellite"],
  [48,"echoWing",{rescue:1}],                      // an echo wing plus sky aces
  [49.5,"acePair"],
  [53,"sweepL",{lead:"shield"}],                   // shield (~55 s) -> the Gate's mixes
  [56.5,"riseR"],
  [60,"gate",{heavy:["power","power"],turrets:["power","signature","power","shield","power","sidewinder"]}],
  [64,"satellite"],
  [66.5,"echoPair"],
  [69,"shardCurtainShort"],
  [72,"sweepR"],
  [75,"riseBoth"],
  [78.5,"echoWing",{lead:"reflector"}],            // reflector (~81 s, 6 s) -> the gauntlet's ace pair streams
  [82,"pincerLoop"],                               // the remix gauntlet: each Act II threat returns once
  [84,"remixAces"],                                // a sky-ace pair (never the elite wing)
  [86.5,"remixBox"],                               // a climbing three-bomber box
  [90,"flakPair"],
  [94.5,"riseBoth",{lead:"power"}],                // power before THE SOVEREIGN
  [97,"echoPair"],
  [99.5,"shardCurtainShort"]
];
export const STAGE_BEATS = [null,
  // Sector 1, THE SHALLOWS: teach the loop. P2 -> P8, one escort pair,
  // sidewinder, signature, one shield.
  [[2.8,"split",{rescue:1}],[7,"drift"],
   [10,"wing",{lead:"power"}],                     // power 4 at ~14 s
   [14.5,"bomber",{lead:"shield"}],                // shield (~20 s) -> the 19.5 s lane sweep (lands ~24 s)
   [21.5,"drift",{lead:"escort"}],                 // escort pair (~26 s) ->
   [24.5,"wing",{rescue:1}],
   [29,"flank"],                                   //   side entries the wing covers ->
   [33,"split",{recover:1}],                       //   a wider formation
   [37.5,"turret",{lead:"sidewinder",heavy:["power"],   // sidewinder (~43 s) ->
     wraith:{lead:"signature"}}],                  //   (Wraith: its orbitals here, then the aces' streams)
   [41.5,"mini",{heavy:["power"]}],
   [46.5,"ace",{recover:1}],                       //   weaving aces it cleans up ->
   [50.5,"drift",{lead:"signature",                //   mixed altitudes; signature (~55.5 s) ->
     wraith:{lead:"sidewinder"}}],                 //   (Wraith: the sidewinder, then mixed loners)
   [52.5,"cross",{heavy:["power"]}],
   [57.5,"bomber",{recover:1}]],                   //   denser aimed streams (then Vesper)
  // Sector 2, STORM WALL: pressure the kit. P9 -> P15, escort pair,
  // sidewinder, signature (Vesper's spoils bring the second shield).
  [[2.6,"wing",{heavy:["power"],                   // Vesper's shield meets the 9 s lane sweep
     wraith:{heavy:["signature"]}}],               //   (Wraith: its second orbital, ~8 s)
   [6.5,"drift",{rescue:1}],
   [10.5,"turret",{heavy:["signature"],            // power past 8 -> heavies; signature (~16.5 s) ->
     wraith:{heavy:["power"]}}],
   [15,"mini",{heavy:["power"]}],                  //   heavy plus popcorn ->
   [20.5,"ace",{recover:1}],                       //   denser aimed streams
   [24,"bomber",{lead:"escort"}],                  // escort pair (~30 s) ->
   [28.5,"relay",{lead:"power"}],                  //   a curtain with a moving gap ->
   [33.5,"flank"],[37.5,"pincer",{rescue:1}],      //   flanks, then pincers
   [42.5,"drift",{lead:"sidewinder",recover:1}],   // sidewinder (~48 s) ->
   [45.5,"mini",{heavy:["power"]}],
   [51,"pincer",{recover:1}],                      //   weaving aces ->
   [55,"wing",{recover:1}],                        //   mixed altitudes
   [60,"relay",{heavy:["bomb"]}],[64.5,"turret",{recover:1}],[68.5,"flank",{recover:1}]],
  // Sector 3, THE CROWN: a real test, one notch below sector 4. P16 -> P20
  // (plus the closing bomb, a power level for a full bay),
  // the third escort pair, signature, shield and a reflector.
  [[2.6,"curtain"],
   [7,"pincer",{rescue:1}],                        // Aurelia's sidewinder -> weaving aces
   [11,"drift",{lead:"shield"}],                   // shield (~16 s) -> the 21 s lane sweep ->
   [14,"relay",{recover:1}],
   [22,"curtain",{lead:"signature"}],              //   a curtain with a moving gap; signature (~27 s) ->
   [26.5,"mini"],
   [32,"ace",{recover:1}],                         //   denser aimed streams ->
   [36,"wing",{lead:"escort",heavy:["power"]}],    //   streams plus formation; the full wing (~41 s) ->
   [41,"relay",{recover:1}],
   [46,"flank"],                                   //   flanks, then wide pincers
   [50,"pincer",{lead:"reflector",rescue:1}],      // reflector (~56 s) ->
   [55.5,"mini",{heavy:["power"]}],
   [61,"curtain",{recover:1}],                     //   a dense wave where reflection pays
   [65.5,"drift",{recover:1}],[69,"ace"],[72.5,"turret"],
   [75.5,"flank",{lead:"bomb",recover:1}],         // the closing bomb (~77.5 s), before the Crown
   [79,"relay"]],
  // Sector 4, IRON MONSOON (~95 s). 1: squadrons to melt (2.5-12 s; the first
  // waits out the 3.4 s intro card, and the four stay ~2.3 s apart so a weak
  // ship can wipe each and catch its rescue drop). 2: the
  // destroyer hull. 3: scavengers in a curtain. 4: twin gunboat lines.
  // 5: the minefield corridor. 6: the cruiser peak. 7: a breather, then the
  // interceptor pincer with lane sweeps.
  [[2.5,"loopL"],[4.9,"loopR"],[7.2,"riseL"],[9.5,"sweepL"],
   [12,"destroyer"],[15,"loopR"],[18.5,"sweepR"],
   [24,"scavCurtain"],[30.5,"loopL"],
   [33.5,"boatLines"],[39,"riseR"],
   [46,"minefield"],[50,"sweepL"],[52.5,"minefield"],[56.5,"loopR"],
   [60,"cruiser"],[65,"riseL"],[69,"sweepR"],
   [80,"pincerSweep"],[82.5,"riseBoth"],[86,"pincerLoop"],[89.5,"pincerSweep"],[92,"riseBoth"]],
  // Sector 5, SKYFORGE (~100 s). Act II beats may carry drops: `lead` rides
  // the formation lead (squadron, box or ace lead), `heavy` the foundry, and
  // `bays` the foundry bays in order. Each key drop is timed at collection,
  // about 2 s or more before the attack it answers (docs, "Drop schedule").
  // 1: squadrons over the cloud sea, then the first sky-ace pair. 2: the
  // first box climbs from below. 3: a flak corridor with drifting drones.
  // 4: foundry 1. 5: a sky-ace wing with flak bands. 6: the peak, two boxes
  // over foundry 2. 7: a breather, then the pincer through a flak gauntlet.
  SECTOR_FIVE_BEATS,
  // Sector 6, ZERO MERIDIAN (~105 s): 1: squadrons over the curve of the
  // Earth. 2: the first echo pair. 3: satellite lances with drifting popcorn.
  // 4: the first shard curtain. 5: an echo wing with sky aces. 6: the Meridian
  // Gate. 7: a breather, then the remix gauntlet before THE SOVEREIGN.
  SECTOR_SIX_BEATS
];
export class Game {
  constructor() { this.width = 540; this.height = 900; this.best = 0; this.shipId="kestrel"; this.reset(); }
  reset() {
    this.mode = "title"; this.practiceStage=0; this.time = 0; this.stage = 1; this.stageTime = 0;
    this.scroll = 0; this.score = 0; this.combo = 1; this.graze = 0; this._nextExtend = 0;
    this.shake = 0; this.flash = 0; this.wave = 0; this.wakeConversions = 0;
    this.stageGoal = [0, 62, 73, 82, 95, 100, 105];
    this.shipId=SHIP_DEFS[this.shipId] ? this.shipId : "kestrel";
    this.selectedShip=SHIP_DEFS[this.shipId];
    this.player = {x:270,y:750,r:this.shipId==="manta"?9:7,hp:4,maxHp:4,lives:3,bombs:2,power:SORTIE_POWER,level:SORTIE_POWER,
      shipId:this.shipId,weaponType:this.selectedShip.weapon,specialType:this.selectedShip.special,
      shield:this.shipId==="manta"?1:0,maxShield:this.shipId==="manta"?1:0,shieldCap:SHIELD_CAP,drones:0,
      escorts:0,escortSlots:[],sidewinder:0,reflector:0,signature:0,orbitals:[],arsenal:0,magnetBoost:0,
      focus:false,invuln:0,roll:0,rollCooldown:0,rollX:0,rollY:-1,rollCharged:false,wake:0,firePulse:0,trail:[],
      empTime:0,vx:0,vy:0};
    this.enemies=[]; this.bullets=[]; this.shots=[]; this.pickups=[]; this.particles=[]; this.hazards=[];
    this.stats={kills:0,grazes:0,shotsFired:0,shotsHit:0,pickups:0,powerPeak:SORTIE_POWER,arsenalPeak:0,
      bombsUsed:0,rolls:0,conversions:0,hitsTaken:0,livesLost:0,bossesDefeated:0,reactorsBroken:0,
      scatters:0,salvageRecovered:0,salvageLost:0,reflected:0,orbitalEats:0,flakEats:0,squadronBonuses:0};
    this.summary=null;
    this.boss=null; this.events=[]; this._seed=20261942; this._acc=0;
    this._beatIndex=0; this._laneIndex=0; this._transition=0; this._transitionLength=INTERLUDE; this._fireClock=0; this._comboClock=0;
    this._id=0; this._last={}; this._hitAudioClock=0; this._missileClock=0; this._rollSerial=0;
    this._sidewinderClock=0; this._signatureClock=0; this._escortVolley=0; this._bonusIndex=0;
    this._squads=new Map(); this._squadId=0;
    this._pickupId=0; this._scavengerCall=0; this._scavengerFlank=false; this.threat=0;
    this._hpScale=1;
    this._hazardId=0; this._flakQueue=[]; this._cue={}; this._droneSerial=0;
    // Sector 6: the recorded player path (echoes replay it) and shard breaks.
    this.path={x:new Float64Array(PATH_SIZE),y:new Float64Array(PATH_SIZE),head:0,count:0,size:PATH_SIZE,hz:PATH_HZ};
    this._shardBroken=0;
    this._syncArsenal();
  }
  selectShip(id) {
    if(!SHIP_DEFS[id] || !["title","gameover","victory"].includes(this.mode)) return false;
    this.shipId=id;this.selectedShip=SHIP_DEFS[id];
    const p=this.player;
    p.shipId=id;p.weaponType=this.selectedShip.weapon;p.specialType=this.selectedShip.special;
    p.shield=id==="manta"?1:0;p.maxShield=id==="manta"?1:0;p.shieldCap=SHIELD_CAP;
    // Hurtbox radius: Manta 9, Kestrel and Wraith 7 (Kestrel was 8 until sector-4 round 2).
    p.r=id==="manta"?9:7;
    // A new airframe starts bare (the sortie loadout), never with the last ship's kit.
    p.level=p.power=SORTIE_POWER;p.escorts=0;p.escortSlots=[];p.sidewinder=0;p.signature=0;
    p.reflector=0;p.orbitals=[];p.drones=0;p.magnetBoost=0;
    this._syncEscortSlots();this._syncOrbitals();this._syncArsenal();
    this._event("shipSelect",p.x,p.y,id);
    return true;
  }
  get highScore() { return this.best; }
  // 1 for sectors 1-3, 2 from ACT_TWO_STAGE on.
  get act() { return actOf(this.stage); }
  get bestScore() { return this.best; }
  get progress() { return this.boss ? Math.max(0,1-this.boss.hp/this.boss.maxHp) :
    Math.min(1,this.stageTime/this.stageGoal[this.stage]); }
  _rand() { this._seed=(Math.imul(1664525,this._seed)+1013904223)>>>0; return this._seed/4294967296; }
  _range(a,b) { return a+(b-a)*this._rand(); }
  _clamp(v,a,b) { return Math.max(a,Math.min(b,v)); }
  _event(type,x,y,value) { this.events.push({type,x,y,value}); }
  _awardScore(points) {
    this.score += points;
    if(this.practiceStage)return;
    this.best = Math.max(this.best, this.score);
    // Four finite score extends give a good run a path through the long campaign.
    // The HUD has four life icons, so a stocked pilot receives a useful reserve instead.
    while (this._nextExtend < SCORE_EXTENDS.length && this.score >= SCORE_EXTENDS[this._nextExtend]) {
      this._nextExtend++;
      const p = this.player;
      let reward;
      if (p.lives < 4) { p.lives++; reward = "life"; }
      else if (p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + 2); reward = "shield"; }
      else if (p.bombs < 2) { p.bombs++; reward = "bomb"; }
      else { this.score += 2500; reward = "score"; }
      this.flash = Math.max(this.flash, .28);
      this._burst(p.x, p.y, 28, "gold", 150, "pickup");
      if (reward !== "score") this._event("pickup", p.x, p.y, reward);
      this._event("extend", p.x, p.y, SCORE_EXTENDS[this._nextExtend - 1]);
    }
  }
  // Power has no cap. One powerUp event per pickup carries the new level.
  _increasePower(amount=1) {
    const p=this.player;amount=Math.max(1,Math.floor(amount));
    p.level+=amount;p.power=p.level;p.drones=0;
    this.stats.powerPeak=Math.max(this.stats.powerPeak,p.level);
    this.flash=Math.max(this.flash,.25);
    this._burst(p.x,p.y,25,"cyan",125,"power");
    this._event("powerUp",p.x,p.y,p.level);
    this._syncArsenal();
    return true;
  }
  _addEscorts(pairs=1) {
    const p=this.player;let converted=0;
    for(let i=0;i<pairs;i++) {
      if(p.escorts<MAX_ESCORTS)p.escorts+=2;else converted++;
    }
    this._syncEscortSlots(true);
    if(pairs>converted)this._event("escortJoin",p.x,p.y,p.escorts);
    // A full wing is never wasted: each surplus pair becomes one level.
    if(converted)this._increasePower(converted);
    this._syncArsenal();
  }
  // Shield charges cap at SHIELD_CAP for every ship (power stays uncapped).
  // Charges fill the bank to the cap; each charge past it becomes +1 power,
  // so nothing is wasted (Manta at 2/3: one charge banks, one becomes power).
  _addShield(pickups=1,perPickup=1) {
    const p=this.player,charges=Math.max(0,pickups*perPickup);
    const gained=Math.min(charges,Math.max(0,SHIELD_CAP-p.shield)),overflow=charges-gained;
    p.shield+=gained;
    p.maxShield=Math.max(p.maxShield,p.shield);
    if(gained)this._event("shieldUp",p.x,p.y,p.shield);
    if(overflow)this._increasePower(overflow);
    this._syncArsenal();
  }
  _addReflector(seconds) {
    const p=this.player,was=p.reflector;p.reflector+=seconds;
    if(was<=0)this._event("reflectorUp",p.x,p.y,p.reflector);
  }
  _addSignature(levels) {
    const p=this.player;p.signature+=levels;
    this._syncOrbitals();this._event("signatureUp",p.x,p.y,p.signature);this._syncArsenal();
  }
  _syncArsenal() {
    const p=this.player;
    p.shield=Math.min(p.shield,SHIELD_CAP);p.maxShield=Math.min(p.maxShield,SHIELD_CAP);
    p.arsenal=p.level-1+p.escorts+p.sidewinder*1.5+p.signature*1.5+p.shield;
    if(this.stats)this.stats.arsenalPeak=Math.max(this.stats.arsenalPeak||0,p.arsenal);
  }
  _syncOrbitals() {
    const p=this.player,count=p.shipId==="wraith"?Math.min(ORBITALS_SHOWN,p.signature):0;
    while(p.orbitals.length>count)p.orbitals.pop();
    while(p.orbitals.length<count)p.orbitals.push({x:p.x,y:p.y,angle:0,cool:0,fire:0});
    p.orbitals.forEach((o,i)=>{o.angle=(p.orbitAngle||0)+i/count*Math.PI*2;});
  }
  _syncEscortSlots(snapNew=false) {
    const p=this.player;
    while(p.escortSlots.length>p.escorts)p.escortSlots.pop();
    while(p.escortSlots.length<p.escorts) {
      const i=p.escortSlots.length,side=i%2?1:-1;
      // New escorts sweep in from behind the wing instead of popping in place.
      p.escortSlots.push({x:p.x+side*90,y:Math.min(900,p.y+110),side,rank:Math.floor(i/2)});
    }
  }
  _start() { const best=this.best,id=this.shipId; this.reset(); this.shipId=id; this.best=best; this.mode="playing"; this._event("stage",270,170,1); }
  startDrill(stage) {
    stage=Math.max(1,Math.min(CAMPAIGN_STAGES,Math.floor(Number(stage)||1)));
    this._start();this.practiceStage=stage;this.stage=stage;this.stageTime=this.stageGoal[stage];
    // Drills start with a loadout matching the sector a campaign pilot would bring.
    const p=this.player,kit=DRILL_LOADOUTS[stage];
    p.level=p.power=kit.level;p.escorts=kit.escorts;p.sidewinder=kit.sidewinder;p.signature=kit.signature;
    // Manta brings its +2 shield bonus to the Act I drills (capped at 3).
    const manta=p.shipId==="manta";
    p.drones=0;p.shield=p.maxShield=stage<ACT_TWO_STAGE&&manta?Math.min(SHIELD_CAP,kit.shield+2):kit.shield;
    this._syncEscortSlots();for(const slot of p.escortSlots){slot.x=p.x+slot.side*(42+slot.rank*30);slot.y=p.y+14;}
    this._syncOrbitals();this._syncArsenal();
    p.invuln=2;this.stats.powerPeak=p.level;
    this.threat=this._threatTarget();
    this.events=[];this._spawnBoss();return true;
  }
  update(dt,input={}) {
    dt=this._clamp(Number.isFinite(dt)?dt:0,0,0.08);
    this.events=[];
    const pressed=k=>!!input[k]&&!this._last[k];
    if (["title","gameover","victory"].includes(this.mode)) {
      if (pressed("start")||pressed("fire")) this._start();
      this._last={...input}; return;
    }
    if (pressed("pause")) { this.mode=this.mode==="paused"?"playing":"paused"; this._event("pause",this.player.x,this.player.y); }
    if (this.mode!=="playing") { this._last={...input}; return; }
    if (pressed("bomb")) this._bomb();
    if (pressed("roll")) this._roll(input);
    this._last={...input};
    this._acc=Math.min(0.16,this._acc+dt);
    let ticks=0;
    while (this._acc>=1/120 && ticks++<16) {
      this._step(1/120,input); this._acc-=1/120;
      if (this.mode!=="playing") break;
    }
  }
  _step(h,input) {
    this.time+=h; this.stageTime+=h; this.scroll+=h*(112+this.stage*25);
    this._hitAudioClock=Math.max(0,this._hitAudioClock-h);
    this.shake=Math.max(0,this.shake-22*h); this.flash=Math.max(0,this.flash-2.2*h);
    const p=this.player;
    const rolling=p.roll>0;
    p.invuln=Math.max(0,p.invuln-h); p.roll=Math.max(0,p.roll-h);
    // Roll-to-recover: the end of a roll pulses the pickup magnet.
    p.magnetBoost=Math.max(0,(p.magnetBoost||0)-h);
    if(rolling&&p.roll<=0)p.magnetBoost=ROLL_MAGNET_TIME;
    p.rollCooldown=Math.max(0,p.rollCooldown-h); p.firePulse=Math.max(0,p.firePulse-6*h);
    if(p.roll<=0)p.rollCharged=false;
    this._comboClock-=h;
    if (this._comboClock<=0&&this.combo>1) this.combo=Math.max(1,this.combo-h*.9);
    this._movePlayer(h,input);
    if(this.stage===6)this._recordPath();
    this._fireClock-=h;this._missileClock=Math.max(0,this._missileClock-h);
    this._sidewinderClock=Math.max(0,this._sidewinderClock-h);this._signatureClock=Math.max(0,this._signatureClock-h);
    const firing=!!input.fire&&this._transition<=0;
    if (firing&&this._fireClock<=0) {
      this._fire(); this._fireClock=p.focus?.092:.105;
    }
    if (firing) this._fireSupport();
    if (!input.fire) this._fireClock=Math.min(0,this._fireClock);
    this._updateArsenal(h,firing);
    if (this._transition>0) {
      this._transition-=h; if (this._transition<=0) this._advanceStage();
    } else if (!this.boss&&this.stageTime>=this.stageGoal[this.stage]) this._spawnBoss();
    else if (!this.boss) {
      const beats=STAGE_BEATS[this.stage];
      while(this._beatIndex<beats.length&&this.stageTime>=beats[this._beatIndex][0]) {
        this._spawnStageBeat(beats[this._beatIndex][1],this._beatDrops(beats[this._beatIndex][2]));
        this._beatIndex++;
      }
      const lanes=LANE_BEATS[this.stage];
      while(this._laneIndex<lanes.length&&this.stageTime>=lanes[this._laneIndex][0]) {
        this._spawnLaneSweep(lanes[this._laneIndex][1]);
        this._laneIndex++;
      }
    }
    // The threat rank runs in every sector (Act I reads it more gently).
    {
      const want=this._threatTarget(),rate=want>this.threat?THREAT_RISE:THREAT_FALL;
      this.threat+=this._clamp(want-this.threat,-rate*h,rate*h);
    }
    // Act II: a scatter mid-sector calls scavengers in after the salvage.
    if(this._scavengerCall&&this.time>=this._scavengerCall) {
      this._scavengerCall=0;
      // A kit worth racing for: they cut in from the sides, level with the
      // salvage. A ship that was already stripped meets the slower top dive.
      if(this._transition<=0&&!this.boss)this._launchScavengers(2,null,false,this._scavengerFlank?this._salvageHeight():null);
    }
    if(this.mode!=='playing')return;
    this._updateEnemies(h);
    if(this.hazards.length||this._flakQueue.length||p.empTime>0)this._updateHazards(h);
    this._updateBullets(h); this._applyReactorCover(); this._updateShots(h);
    this._updatePickups(h); this._updateParticles(h); this._collide(); this._cleanup();
    this._enforceShotBudget();
  }
  _movePlayer(h,input) {
    const p=this.player; p.focus=!!input.focus;
    const oldX=p.x,oldY=p.y;
    const edge=p.shipId==="wraith"?62:p.shipId==="manta"?52:46;
    let dx=Number(!!input.right)-Number(!!input.left),dy=Number(!!input.down)-Number(!!input.up);
    const len=Math.hypot(dx,dy);
    if (len) { dx/=len; dy/=len; }
    else {
      dx=this._clamp(Number(input.moveX)||0,-1,1);
      dy=this._clamp(Number(input.moveY)||0,-1,1);
      const analogLength=Math.hypot(dx,dy);
      if(analogLength>1){dx/=analogLength;dy/=analogLength;}
    }
    if (p.roll>0) { p.x+=p.rollX*740*h; p.y+=p.rollY*740*h; }
    else if (input.pointerActive&&Number.isFinite(input.pointerX)&&Number.isFinite(input.pointerY)) {
      const tx=this._clamp(input.pointerX,edge,540-edge),ty=this._clamp(input.pointerY,230,820);
      const dist=Math.hypot(tx-p.x,ty-p.y);
      const speed=p.shipId==="manta"?(p.focus?185:420):p.shipId==="wraith"?(p.focus?230:500):(p.focus?210:460);
      const t=dist?Math.min(1,speed*h/dist):1;
      p.x+=(tx-p.x)*t; p.y+=(ty-p.y)*t;
    } else { const speed=p.shipId==="manta"?(p.focus?170:325):p.shipId==="wraith"?(p.focus?205:405):(p.focus?190:360); p.x+=dx*speed*h; p.y+=dy*speed*h; }
    p.x=this._clamp(p.x,edge,540-edge); p.y=this._clamp(p.y,230,820);
    if(Math.hypot(p.x-oldX,p.y-oldY)>.01){p.headingX=p.x-oldX;p.headingY=p.y-oldY;}
    // Velocity (px/s), read by sector 5's sky aces to lead their aim.
    p.vx=(p.x-oldX)/h;p.vy=(p.y-oldY)/h;
    p.bank=(p.bank||0)+(this._clamp((p.x-oldX)/(h*360),-1,1)-(p.bank||0))*Math.min(1,h*10);
    p.trail.push({x:p.x,y:p.y,life:.3,focus:p.focus});
    if (p.trail.length>20) p.trail.shift();
    for (const q of p.trail) q.life-=h;
    while (p.trail.length&&p.trail[0].life<=0) p.trail.shift();
    if (this._rand()<h*(p.focus?15:32))
      this._particle(p.x+this._range(-8,8),p.y+22,this._range(-12,12),this._range(60,150),.32,this._range(2,5),"cyan","engine");
  }
  _roll(input) {
    const p=this.player; if (p.rollCooldown>0||p.roll>0) return;
    let dx=Number(!!input.right)-Number(!!input.left),dy=Number(!!input.down)-Number(!!input.up);
    if(!dx&&!dy){dx=Number(input.moveX)||0;dy=Number(input.moveY)||0;}
    if(!dx&&!dy&&input.pointerActive){
      dx=(Number(input.pointerX)||p.x)-p.x;dy=(Number(input.pointerY)||p.y)-p.y;
      if(Math.hypot(dx,dy)<1){dx=p.headingX||0;dy=p.headingY||0;}
    }
    const len=Math.hypot(dx,dy); if (len<.1) {dx=0;dy=-1;} else {dx/=len;dy/=len;}
    const charged=p.wake>=.5;
    if(charged)p.wake-=.5;
    this.stats.rolls++;this._rollSerial++;
    p.rollCharged=charged;p.rollX=dx;p.rollY=dy;p.roll=charged?.34:.25;
    p.rollCooldown=charged?2.6:2.2;p.invuln=Math.max(p.invuln,charged?.45:.36);
    this.shake=Math.max(this.shake,charged?5:3);this._burst(p.x,p.y,charged?38:18,"cyan",charged?170:110,"roll");
    this._event("roll",p.x,p.y);if(charged)this._event("wakeRoll",p.x,p.y,p.wake);
  }
  _bomb() {
    const p=this.player;if(p.bombs<=0)return;
    const special=p.specialType;
    p.bombs--;this.stats.bombsUsed++;
    p.invuln=Math.max(p.invuln,2.4);this.shake=special==="storm"?18:15;this.flash=.85;
    const erased=this.bullets.length;
    const specialColor=special==="barrier"?"cyan":special==="storm"?"magenta":"gold";
    for(const b of this.bullets) this._particle(b.x,b.y,0,0,.28,3,specialColor,"spark");
    this.bullets.length=0;
    // Sector 5: a bomb also clears flak bands and laser bars (EMP rings stay).
    if(this.hazards.length){let w=0;for(const hz of this.hazards)if(hz.kind==="emp")this.hazards[w++]=hz;this.hazards.length=w;}
    if(this.boss?.lance){this.boss.lance.cancelled=true;this.boss.lance.active=false;this._event('lanceCancel',this.boss.lance.x,this.boss.lance.y);}
    // The Manta trades damage for restored armor. The Wraith converts the
    // whole field into score; the Kestrel retains the high-impact nova.
    if(special==="barrier") {
      // Restores a spent charge; growth beyond the life's best comes from S pickups.
      p.shield=Math.min(Math.max(1,p.maxShield),p.shield+1);this._syncArsenal();
      this._event("shieldRestore",p.x,p.y,p.shield);
    } else if(special==="storm" && erased) {
      const points=erased*120;
      this._awardScore(points);
      p.wake=Math.min(1,p.wake+Math.min(.5,erased*.025));
      this.stats.conversions+=erased;this.wakeConversions+=erased;
      this.events.push({type:"wakeConvert",x:p.x,y:p.y,value:erased,points,resource:Math.min(.5,erased*.025)});
    }
    const damage=special==="barrier"?120:special==="storm"?260:400;
    const bossDamage=special==="barrier"?100:special==="storm"?300:390;
    for(const e of [...this.enemies]) {
      this._damageEnemy(e,e.type==="boss"?bossDamage:damage);e.flash=1;
      if(e.hp<=0)this._killEnemy(e,true);
    }
    this._burst(p.x,p.y,special==="barrier"?20:special==="storm"?36:48,
      specialColor,special==="barrier"?220:special==="storm"?440:540,"bomb");
    this._event("bomb",p.x,p.y,special);
    this._event("special",p.x,p.y,special);
  }
  _shot(shot) { this.shots.push(shot); this.stats.shotsFired++; return shot; }
  // Main gun. Measured single-target DPS (fire held, unfocused; balance bot):
  //   power 1: 110-165, power 5: 245-330, power 10: 480-690, power 15: 610-880.
  // Kestrel trades single-target damage for width (best row DPS).
  // Streams stop growing at STREAM_CEILING; damage keeps scaling with no maximum.
  _fire() {
    const p=this.player,level=p.level,structural=Math.min(level,STREAM_CEILING);
    const over=Math.max(0,level-STREAM_CEILING),scale=1+over*OVERPOWER_DAMAGE,grow=overpowerGrowth(over);
    // Collision grows at half the visual rate: shots look heavier than they hit.
    const hitGrow=grow*.5;
    if(p.weaponType==="spread") {
      // Kestrel: 2 streams at power 1, 9 at power 8. The core columns stay
      // parallel (1942 tracer wall); only the outermost pair fans out.
      const n=structural+1,center=(n-1)/2,core=Math.max(1.5,center-1);
      for(let i=0;i<n;i++) {
        const off=i-center,fan=Math.max(0,Math.abs(off)-core)*Math.sign(off);
        this._shot({x:p.x+off*(p.focus?6:8),y:p.y-20,
          vx:fan*(p.focus?16:62),vy:-870,r:(level>=4?4.5:3.5)+grow,hitR:(level>=4?4.5:3.5)+hitGrow,
          damage:(p.focus?8:7)*scale,kind:p.focus?"lance":"shot",age:0});
      }
    } else if(p.weaponType==="missile") {
      // Manta: twin guns to quad guns by power 5, plus homing salvos that grow
      // from 1 to 4 missiles and speed up to the ceiling.
      const n=Math.min(4,1+Math.ceil(structural/2)),center=(n-1)/2;
      for(let i=0;i<n;i++) {
        const off=i-center;
        this._shot({x:p.x+off*13,y:p.y-20,vx:off*(p.focus?12:48),vy:-800,
          r:3.8+grow,hitR:3.8+hitGrow,damage:(p.focus?8:7)*scale,kind:"shot",age:0});
      }
      if(this._missileClock<=0) {
        const count=Math.min(4,1+Math.floor((structural-1)/2));
        for(let i=0;i<count;i++) {
          const side=count===1?0:(i%2?1:-1)*(1+Math.floor(i/2));
          this._shot({x:p.x+side*17,y:p.y-12,vx:side*80,vy:-460,
            r:6+grow*.5,hitR:6+hitGrow*.5,damage:(25+structural*2)*scale,kind:"missile",age:0,targetId:null});
        }
        this._missileClock=Math.max(.42,.62-structural*.025);
        this._event("missileLaunch",p.x,p.y,p.shipId);
      }
    } else {
      // Wraith: one rail, twin rails at 3, triple rails at 6, then a 4th rail
      // at 10 and a 5th at 14 for density. Each level adds rail damage and
      // pierce up to the ceiling, then 6% damage per level. Past three rails
      // the per-rail damage is split so single-target DPS stays on its curve.
      const n=level>=14?5:level>=10?4:structural>=6?3:structural>=3?2:1;
      const damage=((p.focus?14:12)+(structural-1)*1.6)*scale*(n>3?3/n:1);
      for(let i=0;i<n;i++) {
        const off=n===1?0:n===2?(i?9:-9):(i-(n-1)/2)*12;
        this._shot({x:p.x+off,y:p.y-22,vx:0,vy:-1020,
          r:4+structural*.15+grow,hitR:4+structural*.15+hitGrow,damage,kind:"pierce",age:0,pierceRemaining:2+Math.floor(structural/2),hitIds:[]});
      }
    }
    this._fireEscorts();
    p.firePulse=1;this._event("shoot",p.x,p.y-20);
  }
  // Escorts fire a light copy of the ship's weapon on every main-gun tick.
  // ~75 DPS per escort at power 1, +4% per level (uncapped).
  _fireEscorts() {
    const p=this.player;if(!p.escorts||p.empTime>0)return;   // an EMP silences the wing
    const scale=1+(p.level-1)*.04;
    this._escortVolley++;
    for(const slot of p.escortSlots) {
      const spread=p.focus?0:slot.side*(.035+slot.rank*.02);
      if(p.shipId==="kestrel") {
        for(const dx of [-3,3])this._shot({x:slot.x+dx,y:slot.y-12,vx:spread*870,vy:-880,
          r:2.8,damage:4*scale,kind:"escort",style:"cannon",age:0});
      } else if(p.shipId==="manta") {
        this._shot({x:slot.x,y:slot.y-12,vx:spread*700,vy:-700,
          r:3.4,damage:8*scale,kind:"escort",style:"rocket",age:0});
      } else {
        this._shot({x:slot.x,y:slot.y-14,vx:0,vy:-1000,r:2.6,damage:6.5*scale,
          kind:"escort",style:"rail",age:0,pierceRemaining:2,hitIds:[]});
      }
    }
  }
  _fireSupport() {
    const p=this.player;
    // Sidewinders: volley 2*min(level,3); cadence 1.05 s down to a 0.35 s floor
    // at level 6; damage +25% per level past 3 (uncapped).
    if(p.sidewinder>0&&this._sidewinderClock<=0) {
      const count=2*Math.min(p.sidewinder,3);
      const damage=14*(1+Math.max(0,p.sidewinder-3)*.25);
      for(let i=0;i<count;i++) {
        const side=i%2?1:-1,rank=Math.floor(i/2);
        this._shot({x:p.x+side*(24+rank*9),y:p.y+2+rank*4,vx:side*(150+rank*45),vy:-240+rank*30,
          r:4,damage,kind:"sidewinder",age:0,targetId:null});
      }
      this._sidewinderClock=Math.max(.35,1.05-(p.sidewinder-1)*.14);
      this._event("sidewinderLaunch",p.x,p.y,count);
    }
    if(p.signature>0&&this._signatureClock<=0) {
      if(p.shipId==="kestrel")this._fireFlak();
      else if(p.shipId==="manta")this._fireTorpedoes();
    }
  }
  // Kestrel "Hellfire Wings": each level adds a gun pair (forward flak, rear
  // guns, wide flak, steep rear) up to four pairs, then +10% damage per level.
  // Cadence 0.275 s at level 1 down to a 0.1 s floor.
  _fireFlak() {
    const p=this.player,sig=p.signature,pairs=Math.min(4,sig);
    const damage=6*(1+Math.max(0,sig-4)*.1);
    // Angles are measured from straight up; values past PI/2 point backward.
    const mounts=[[.38,20],[Math.PI-.5,12],[.72,28],[Math.PI-.2,6]];
    for(let k=0;k<pairs;k++) {
      const [angle,wing]=mounts[k];
      for(const side of [-1,1]) {
        const a=side*angle;
        this._shot({x:p.x+side*wing,y:p.y+(angle>1.6?12:-6),vx:Math.sin(a)*760,vy:-Math.cos(a)*760,
          r:3.2,damage,kind:"flak",age:0});
      }
    }
    this._signatureClock=Math.max(.1,.3-sig*.025);
  }
  // Manta "Hammer Torpedoes": slow-accelerating boss-killers. 1 torpedo per
  // 1.38 s at level 1 (~40 DPS), 2 at level 3, 3 at level 5; +15% damage per
  // level (uncapped); cadence floor 0.55 s.
  _fireTorpedoes() {
    const p=this.player,sig=p.signature,count=Math.min(3,1+Math.floor((sig-1)/2));
    for(let i=0;i<count;i++) {
      const off=count===1?0:count===2?(i?16:-16):(i-1)*22;
      this._shot({x:p.x+off,y:p.y-4,vx:0,vy:-120,r:6.5,damage:55*(1+(sig-1)*.15),
        kind:"torpedo",age:0,pierceRemaining:99,hitIds:[]});
    }
    this._signatureClock=Math.max(.55,1.5-sig*.12);
    this._event("torpedoLaunch",p.x,p.y,count);
  }
  _updateArsenal(h,firing) {
    const p=this.player;
    if(p.reflector>0) {
      p.reflector=Math.max(0,p.reflector-h);
      if(p.reflector<=0)this._event("reflectorDown",p.x,p.y,0);
    }
    // Escorts follow with a spring lag: wide flank cover, or a tight forward
    // column while focused.
    this._syncEscortSlots();
    for(const slot of p.escortSlots) {
      const tx=p.focus?p.x+slot.side*(20+slot.rank*13):p.x+slot.side*(42+slot.rank*30);
      const ty=p.focus?p.y-8-slot.rank*12:p.y+14+slot.rank*16;
      const k=Math.min(1,h*(10-slot.rank*2));
      slot.x+=(this._clamp(tx,12,528)-slot.x)*k;slot.y+=(ty-slot.y)*k;
    }
    // Wraith "Ghost Orbitals": count = signature (up to 6 shown); levels past 6
    // speed the 0.6 s eat cooldown and the 0.32 s rail cadence by 15% each.
    if(p.orbitals.length) {
      const haste=1+Math.max(0,p.signature-ORBITALS_SHOWN)*.15;
      p.orbitAngle=((p.orbitAngle||0)+h*2.4)%(Math.PI*2);
      const n=p.orbitals.length,scale=1+(p.level-1)*.04;
      p.orbitals.forEach((o,i)=>{
        o.angle=p.orbitAngle+i/n*Math.PI*2;
        o.x=p.x+Math.cos(o.angle)*ORBIT_RADIUS;o.y=p.y+Math.sin(o.angle)*ORBIT_RADIUS*.82;
        o.cool=Math.max(0,o.cool-h*haste);o.fire=Math.max(0,(o.fire||0)-h);
        if(firing&&o.fire<=0) {
          // Twin rails at half damage each: denser, same output.
          for(const dx of [-3,3])this._shot({x:o.x+dx,y:o.y-6,vx:0,vy:-960,r:2.2,damage:3*scale,kind:"orbital",age:0});
          o.fire=.32/haste;
        }
      });
    }
  }
  // Keep at most SHOT_BUDGET live player shots, dropping the oldest small
  // shots first so missiles, rails and torpedoes survive dense scenes.
  _enforceShotBudget() {
    let excess=this.shots.length-SHOT_BUDGET;if(excess<=0)return;
    for(const pass of [true,false]) {
      let write=0;
      for(let read=0;read<this.shots.length;read++) {
        const shot=this.shots[read];
        if(excess>0&&(!pass||SMALL_SHOTS.has(shot.kind))){excess--;continue;}
        this.shots[write++]=shot;
      }
      this.shots.length=write;if(excess<=0)return;
    }
  }
  _enemy(type,x,y,o={}) {
    const specs={scout:[22,15,150,160],wing:[30,17,155,220],bomber:[72,25,98,470],
      ace:[50,20,170,400],turret:[90,22,94,420],carrier:[125,27,75,600],mini:[250,34,54,1200]};
    if(ACT_TWO_TYPES.has(type))return this._actTwoEnemy(type,x,y,o);
    // Act I: HP tuned against the ledger kit per sector. Sector 4 borrows
    // Act I craft for its scavenger curtain and keeps the old flat curve.
    const [baseHp,r,vy,value]=specs[type];
    const hp=this.stage<ACT_TWO_STAGE?ACT_ONE_HP[type][this.stage-1]*this._hpScale:baseHp*(1+(this.stage-1)*.22);
    const e={id:++this._id,type,x,y,baseX:x,r,hp,maxHp:hp,age:0,vy:o.vy??vy,
      vx:o.vx||0,turnAt:o.turnAt||999,turnVx:o.turnVx||0,amp:o.amp||0,freq:o.freq||1.4,phase:o.phase||0,
      fireAt:o.fireAt??this._range(.9,2.1),fireRate:o.fireRate||2.4,
      flash:0,angle:0,seed:this._rand(),value,drop:o.drop||null};
    if(o.squad){e.squad=o.squad;const squad=this._squads.get(o.squad);if(squad)squad.total++;}
    this.enemies.push(e);return e;
  }
  // A formation wave whose craft all fall to the player earns a bonus fan.
  _newSquad() { const id=++this._squadId;this._squads.set(id,{total:0,killed:0});return id; }
  // drops: the beat's authored ledger drops (Act I), see STAGE_BEATS.
  _spawnStageBeat(pattern,drops) {
    // Act I mercy: the beat's craft spawn softer for a kit below its entitlement.
    if(this.stage<ACT_TWO_STAGE)this._hpScale=this._actOneMercy();
    if(this.stage>=ACT_TWO_STAGE&&pattern!=="curtain"&&pattern!=="drift"&&pattern!=="flank") this._spawnActTwoBeat(pattern,drops);
    else if(pattern==="drift") this._spawnDrift(drops);
    else if(pattern==="flank") this._spawnFlank(drops);
    else this._spawnWave(pattern,drops);
    this._hpScale=1;
    this._event("wave",270,0,pattern);
  }
  // Authored drops ride on a formation's lead (or its rescue power) and on
  // its heavy (carrier, mini, centre turret).
  _authorDrops(lead,heavy,drops) {
    if(!drops)return;
    if(lead&&drops.lead)lead.drop=drops.lead;
    if(lead&&drops.rescue)lead.rescue=true;
    if(lead&&drops.recover)lead.recover=true;
    if(heavy&&drops.heavy)heavy.drop=drops.heavy.length===1?drops.heavy[0]:[...drops.heavy];
  }
  _spawnWave(pattern,drops) {
    this.wave++;
    const s=this.stage;
    let lead=null,heavy=null;
    if(pattern==="split") {
      // Split spearhead: two readable lanes that close toward the centre.
      const squad=this._newSquad();
      for(let i=0;i<8+s;i++) {
        const x=46+i*(448/(7+s));
        this._enemy("scout",x,-25-Math.abs(i-(7+s)/2)*32,
          {amp:(x<270?1:-1)*27,phase:i*.28,fireAt:1.35+i*.065,squad});
      }
      lead=this._enemy("wing",100,-115,{vx:55,amp:20,fireAt:1.65,squad});
      this._enemy("wing",440,-115,{vx:-55,amp:-20,fireAt:1.65,squad});
    } else if(pattern==="wing") {
      const squad=this._newSquad(),centre=Math.floor((6+s)/2);
      for(let i=0;i<6+s;i++) {
        const x=70+i*(400/(5+s));
        const e=this._enemy("wing",x,-28-Math.abs(i-(5+s)/2)*24,
          {vx:(270-x)*.11,amp:22,phase:i*.54,fireAt:1.4,squad});
        if(i===centre)lead=e;
      }
      heavy=this._enemy("carrier",270,-125,{fireAt:1.75});
    } else if(pattern==="bomber") {
      const squad=this._newSquad();
      lead=this._enemy("bomber",132,-42,{amp:42,fireRate:2.05,fireAt:1.35,squad});
      heavy=this._enemy("bomber",408,-88,{amp:-42,phase:2,fireRate:2.05,fireAt:1.6,squad});
      for(let i=0;i<5+s;i++)
        this._enemy("scout",58+i*(424/(4+s)),-80-i*21,{amp:i%2?32:-32,phase:i*.7,fireAt:1.55,squad});
    } else if(pattern==="ace") {
      const squad=this._newSquad();
      lead=this._enemy("ace",80,-42,{vx:90,turnAt:2.2,turnVx:-145,amp:24,fireRate:1.38,squad});
      this._enemy("ace",460,-76,{vx:-90,turnAt:2.2,turnVx:145,amp:-24,phase:2,fireRate:1.38,squad});
      for(let i=0;i<5+s;i++)
        this._enemy("wing",65+i*(410/(4+s)),-90-i*24,{fireAt:1.6,squad});
    } else if(pattern==="turret") {
      for(let i=0;i<3;i++) {
        const e=this._enemy("turret",95+i*175,-45-i*48,{fireRate:1.9});
        if(i===1)heavy=e;
      }
      for(let i=0;i<6+s;i++) {
        const e=this._enemy("scout",45+i*(450/(5+s)),-138-i*26,{amp:55,phase:i*.48});
        if(!i)lead=e;
      }
    } else if(pattern==="mini") {
      heavy=this._enemy("mini",this._range(170,370),-85,{fireRate:1.35});
      for(let i=0;i<6+s;i++)
        this._enemy("scout",50+i*(440/(5+s)),-45-i*27,{amp:i%2?33:-33,fireAt:1.6});
    } else if(pattern==="cross") {
      const squad=this._newSquad();
      for(let i=0;i<9+s;i++) {
        const side=i%2?1:-1;
        const e=this._enemy("wing",side>0?485:55,-22-i*31,
          {vx:-side*95,turnAt:2,turnVx:side*135,amp:side*23,fireAt:1.55+i*.08,squad});
        if(!i)lead=e;
      }
      heavy=this._enemy("carrier",270,-205,{});
    } else if(pattern==="pincer") {
      // The second pass comes from the sides, leaving a readable centre lane.
      for(const side of [-1,1])
        for(let i=0;i<3;i++) {
          const e=this._enemy("ace",side<0?-25:565,-30-i*70,
            {vx:-side*(94+i*9),vy:105,turnAt:2.5,turnVx:side*125,fireAt:1.55+i*.2,fireRate:2.15});
          if(i===1&&side<0)lead=e;
        }
    } else if(pattern==="relay") {
      // Alternating columns create a moving gap instead of a solid wall.
      for(let i=0;i<6;i++) {
        const side=i%2?-1:1;
        const e=this._enemy("wing",side>0?425:115,-30-i*59,
          {vx:-side*38,amp:side*26,fireAt:1.45+i*.13,fireRate:2.75});
        if(!i)lead=e;
      }
      heavy=this._enemy("carrier",270,-440,{fireAt:2.3,fireRate:3.2});
    } else if(pattern==="curtain") {
      // Staggered lanes announce the last sector without sealing all exits.
      for(let i=0;i<7;i++) {
        const e=this._enemy("wing",55+i*72,-28-i*57,
          {amp:i%2?18:-18,fireAt:1.35+i*.12,fireRate:2.65});
        if(i===3)lead=e;
      }
      heavy=this._enemy("turret",270,-500,{fireAt:2.2,fireRate:2.8});
    }
    this._authorDrops(lead,heavy,drops);
  }
  _spawnLaneSweep(gap) {
    // Two slow rows announce the danger at mid-field before reaching the
    // player. The next opening moves a short, reachable distance sideways.
    const color=this.stage>=4?"rose":this.stage===3?"magenta":this.stage===2?"rose":"amber";
    const speed=138+this.stage*11;
    const next=this._clamp(gap+(gap<270?90:-90),95,445);
    for(let row=0;row<2;row++) {
      const opening=row?next:gap,y=row?-165:-40;
      for(let x=24;x<=516;x+=28)
        if(Math.abs(x-opening)>68)
          this._bullet(x,y,Math.PI/2,speed,color,5.2);
    }
    this.events.push({type:"lane",x:gap,y:-40,value:next,speed,rows:[{x:gap,y:-40},{x:next,y:-165}]});
  }
  _spawnDrift(drops) {
    const left=this._range(75,175),right=540-left,squad=this._newSquad();
    this._enemy("scout",left,-26,{amp:24,phase:this._rand()*3,fireAt:99,squad});
    const lead=this._enemy("scout",270,-72,{amp:this._range(-22,22),fireAt:1.85,fireRate:3.6,squad});
    this._enemy("scout",right,-46,{amp:-24,phase:this._rand()*3,fireAt:99,squad});
    this._authorDrops(lead,null,drops);
  }
  _spawnFlank(drops) {
    const y=310+this._range(-30,35);
    const lead=this._enemy("ace",-28,y,{vy:92,vx:126,turnAt:2.5,turnVx:-165,
      amp:10,fireAt:1.65,fireRate:3.5});
    this._enemy("ace",568,y+35,{vy:92,vx:-126,turnAt:2.5,turnVx:165,
      amp:-10,fireAt:1.85,fireRate:3.5});
    this._authorDrops(lead,null,drops);
    this._event("flank",270,y,0);
  }
  _spawnBoss() {
    // A scavenger still carrying salvage when the flagship arrives takes it along.
    for(const e of this.enemies)if(!e.dead&&e.carrying)this.stats.salvageLost+=e.carrying.value||1;
    this.enemies=[];this.bullets.length=0;this._scavengerCall=0;this._clearHazards();
    const names=["","VESPER","AURELIA","THE CROWN","LEVIATHAN","HALCYON","THE SOVEREIGN"];
    // Act I mercy: a flagship meets a short kit with less HP (never in drills).
    const hp=(BOSS_HP[this.stage]??LEVIATHAN_HP)*(this.stage<ACT_TWO_STAGE&&!this.practiceStage?this._actOneMercy(true):
      this.stage===5&&!this.practiceStage?this._halcyonMercy():this.stage===6&&!this.practiceStage?this._sovereignMercy():1)*
      // THE SOVEREIGN is rank-scaled like the sector's heavies: up to +30% HP for a ranked arrival.
      (this.stage===6?1+SOVEREIGN_RANK_HP*this._sovereignRank():1);
    const leviathan=this.stage===4,halcyon=this.stage===5,sovereign=this.stage===6;
    // w/h are the collision half-extents (an ellipse); LEVIATHAN and HALCYON are far wider.
    this.boss={id:++this._id,type:"boss",name:names[this.stage],
      x:270,y:leviathan?-210:halcyon?-190:sovereign?-200:-145,r:leviathan?80:sovereign?75:70,
      w:leviathan?210:halcyon?220:sovereign?200:98,h:leviathan?80:halcyon?70:sovereign?80:55,
      hp,maxHp:hp,age:0,phase:1,fireAt:4.1,
      flash:0,angle:0,guard:false,guardUntil:0,learnShift:0,phaseStart:0,guardAbsorb:0,absorbRate:0,
      seed:this._rand(),value:12000*this.stage};
    this._squads.clear();
    this.enemies.push(this.boss);
    if(leviathan)this._rigLeviathan(this.boss);
    if(halcyon)this._rigHalcyon(this.boss);
    if(sovereign)this._rigSovereign(this.boss);
    this.flash=.45;this.shake=5;this._event("bossEnter",270,285,this.stage);
  }

  // ---- Act II: sector 4, IRON MONSOON ------------------------------------
  // A non-finite arsenal (never produced by play) degrades to threat 0
  // instead of poisoning every Act II cooldown with NaN.
  _threatTarget() {
    const raw=(this.player.arsenal-THREAT_FLOOR)/THREAT_SPAN;
    return Number.isFinite(raw)?THREAT_MAX*Math.tanh(Math.max(0,raw)):0;
  }
  // Cooldown multiplier and bullet speed for Act II sources at the current threat.
  // A bare ship (threat 0) sees fire 1.8x slower than authored; the
  // reference kit (~0.69) about 1.35x faster; a Crown-arrival kit (~0.86) 1.6x.
  _pace() { const t=this.threat;return 1.8/(1+1.61*t+.66*t*t)*this._sectorFive(SECTOR_FIVE_PACE)*this._sectorSix(SECTOR_SIX_PACE); }
  _vel(speed) { const t=this.threat;return speed*(1+.1*t+.05*t*t)*this._sectorFive(SECTOR_FIVE_SPEED)*this._sectorSix(SECTOR_SIX_SPEED); }
  // Sector 5's notch over sector 4 (faster, denser fire) for a kitted ship;
  // it fades out below LOW_THREAT, so a stripped ship meets sector 4's curve.
  // HALCYON keeps the shared rank.
  _sectorFive(full) {
    if(this.stage!==5||this.boss)return 1;
    return 1+(full-1)*this._clamp((this.threat-LOW_THREAT*.5)/(SECTOR_FIVE_FULL-LOW_THREAT*.5),0,1);
  }
  // Sector 6's notch (the same shape as sector 5's; THE SOVEREIGN keeps the shared rank).
  _sectorSix(full) {
    if(this.stage!==6||this.boss)return 1;
    return 1+(full-1)*this._clamp((this.threat-LOW_THREAT*.5)/(SECTOR_SIX_FULL-LOW_THREAT*.5),0,1);
  }
  // Rescue leads pay power below this threat (higher in each later Act II sector).
  _rescueThreat() { return this.stage===6?RESCUE_THREAT_S6:this.stage===5?RESCUE_THREAT_S5:RESCUE_THREAT; }
  // 0..1 share of the full Act II volley size at the current threat.
  _volley() { return Math.min(1,this.threat/VOLLEY_FULL); }
  // Void rounds are the counter to a maxed loadout: when the ship flies
  // ghost orbitals (2+) or a live reflector, the last round of each
  // interceptor burst and every third gunboat or turret volley is void.
  // Kestrel flak cannot eat them either.
  _voidAware() { const p=this.player;return p.orbitals.length>=2||p.reflector>0; }
  _voidVolley() {
    if(!this._voidAware())return "red";
    this._voidCount=(this._voidCount||0)+1;
    return this._voidCount%3===0?"void":"red";
  }
  // LEVIATHAN's own guns lean less on the rank: 1.35x slower for a bare ship,
  // about authored pace for the reference kit, 1.15x faster at the top.
  _bossPace() { const t=this.threat;return 1.35/(1+.45*t+.2*t*t); }
  // HP grows +35% per Act II sector past the first.
  // Sector 5's heavies scale with the rank at spawn: a stripped ship
  // (threat <= LOW_THREAT) meets the popcorn scale, a kit at HEAVY_FULL_THREAT
  // or above (the sector-5 reference kit sits at ~0.84) the full scale.
  _actTwoScale(type) {
    const pop=POPCORN_HP_SCALE[this.stage],full=ACT_TWO_HP_SCALE[this.stage];
    if(pop===undefined||full===undefined)return 1+Math.max(0,this.stage-ACT_TWO_STAGE)*.35;
    if(POPCORN_TYPES.has(type))return pop;
    return pop+(full-pop)*this._clamp((this.threat-LOW_THREAT)/(HEAVY_FULL_THREAT-LOW_THREAT),0,1)**HEAVY_EASE;
  }
  _actTwoEnemy(type,x,y,o={}) {
    let hp,r,vy,value;
    if(type==="hull") {
      const c=HULL_CLASSES[o.hullClass]||HULL_CLASSES.destroyer;
      ({hp,vy,value}=c);r=c.w;
    } else if(type==="foundry") {
      const c=FOUNDRY_CLASSES[o.foundryClass]||FOUNDRY_CLASSES.small;
      ({hp,vy,value}=c);r=c.w;
    } else if(type==="station") {
      ({hp,vy,value}=STATION_CLASS);r=STATION_CLASS.w;
    } else [hp,r,vy,value]=ACT_TWO_SPECS[type];
    if(o.hp)hp=o.hp;
    if(!o.noScale)hp*=this._actTwoScale(type);
    const e={id:++this._id,type,x,y,baseX:x,r,hp,maxHp:hp,age:-(o.delay||0),vx:o.vx||0,vy:o.vy??vy,
      turnAt:999,turnVx:0,amp:o.amp||0,freq:o.freq||1.4,phase:o.phase||0,
      fireAt:o.fireAt??1.2,fireRate:o.fireRate||2,flash:0,angle:o.angle??0,
      seed:this._rand(),value:o.value??value,drop:o.drop||null};
    if(o.bonusDrops)e.bonusDrops=o.bonusDrops;
    if(o.rescue)e.rescue=true;
    if(type==="interceptor") {
      Object.assign(e,{path:o.path||"loop",side:o.side||1,x0:x,y0:y,speed:o.speed||300,
        loopY:o.loopY??300,loopR:o.loopR??78,hidden:true,fired:0,burstLeft:0,burstClock:0});
    } else if(type==="hull") {
      const c=HULL_CLASSES[o.hullClass]||HULL_CLASSES.destroyer;
      Object.assign(e,{hullClass:o.hullClass||"destroyer",w:c.w,h:c.h,turrets:[],turretsAlive:0,
        torpedoAt:o.torpedoes?3.5:Infinity});
    } else if(type==="hullTurret") {
      Object.assign(e,{parentId:o.parent.id,ox:o.ox,oy:o.oy,gun:o.gun,aim:Math.PI/2,burstLeft:0,burstClock:0,
        x:o.parent.x+o.ox,y:o.parent.y+o.oy});
      o.parent.turrets.push(e.id);o.parent.turretsAlive++;
    } else if(type==="scavenger") {
      Object.assign(e,{targetPickupId:null,carrying:null,leaveAt:o.leaveAt??9,fireAt:o.fireAt??1.6});
    } else if(type==="mine") {
      e.fuse=o.fuse??5;
    } else if(type==="torpedoEnemy") {
      e.heading=o.heading??Math.PI/2;e.speed=o.speed??80;e.angle=e.heading-Math.PI/2;
    } else if(type==="boxBomber") {
      Object.assign(e,{box:o.box,climb:!!o.climb,gunners:[],gunnersAlive:0,hidden:true,lead:!!o.lead,
        angle:o.climb?Math.PI:0});
    } else if(type==="tailGunner"||type==="foundryBay") {
      Object.assign(e,{parentId:o.parent.id,ox:o.ox,oy:o.oy,x:o.parent.x+o.ox,y:o.parent.y+o.oy,angle:o.parent.angle||0});
      if(type==="tailGunner") {
        Object.assign(e,{aim:o.parent.climb?Math.PI/2:Math.PI/2,burstLeft:0,burstClock:0,hidden:true});
        o.parent.gunners.push(e.id);o.parent.gunnersAlive++;
      } else {
        Object.assign(e,{launch:o.launch??2,open:0});
        o.parent.bays.push(e.id);o.parent.baysAlive++;
      }
    } else if(type==="skyAce") {
      Object.assign(e,{lane:x,hoverY:o.hoverY??220,leaveAt:o.leaveAt??7,dodge:0,dodgeDir:1,dodgeCool:o.dodgeCool??.6,
        burstLeft:0,burstClock:0,fireAt:o.fireAt??1.1,fireRate:o.fireRate??1.7});
    } else if(type==="foundry") {
      const c=FOUNDRY_CLASSES[o.foundryClass]||FOUNDRY_CLASSES.small;
      Object.assign(e,{foundryClass:o.foundryClass||"small",large:o.foundryClass==="large",w:c.w,h:c.h,
        bays:[],baysAlive:0,turrets:[],turretsAlive:0});
    } else if(type==="drone") {
      Object.assign(e,{dive:!!o.dive,drift:!!o.drift,fireAt:o.fireAt??.75,fired:false});
    } else if(type==="echo") {
      // e.trail: the path sample being replayed; e.mirror: -1 mirrored about
      // the centre line, 1 a straight copy; e.style: the copied weapon family.
      Object.assign(e,{style:o.style||this.player.weaponType,mirror:o.mirror??-1,ox:o.ox||0,oy:o.oy??ECHO_OFFSET,lag:o.lag??ECHO_DELAY,
        trail:-1,leaveAt:o.leaveAt??ECHO_LIFE,x0:x,y0:y,hidden:true,phasing:true,fireAt:o.fireAt??ECHO_ENTER+.1,fireRate:o.fireRate??ECHO_FIRE,
        laserId:0,railX:null,railWarn:0});
    } else if(type==="satellite") {
      Object.assign(e,{dir:o.dir||1,laserId:0,sweep:0,fireAt:o.fireAt??1.4,fireRate:o.fireRate??SAT_CYCLE,anchored:false});
    } else if(type==="station") {
      Object.assign(e,{w:STATION_CLASS.w,h:STATION_CLASS.h,turrets:[],turretsAlive:0,state:"enter",holdUntil:0});
    } else if(type==="stationTurret") {
      Object.assign(e,{parentId:o.parent.id,ox:o.ox,oy:o.oy,gun:o.gun,aim:Math.PI/2,burstLeft:0,burstClock:0,
        x:o.parent.x+o.ox,y:o.parent.y+o.oy});
      o.parent.turrets.push(e.id);o.parent.turretsAlive++;
    } else if(type==="mirrorEscort") {
      Object.assign(e,{parentId:o.parent.id,slot:o.slot,side:o.side,rank:o.rank,ox:o.ox,oy:o.oy,style:o.style,
        x:o.parent.x+o.ox,y:o.parent.y+o.oy});
      o.parent.escorts.push(e.id);o.parent.escortsAlive++;
    } else if(type==="tether") {
      // A phase-2 salvage tether: e.carrying is the salvage record, e.progress 0..1 up the line.
      Object.assign(e,{parentId:o.parent.id,carrying:o.carrying,progress:0,x0:x,y0:y,bow:o.bow||0,ox:o.ox||0});
    }
    if(o.tag)e.tag=o.tag;
    if(o.squad){e.squad=o.squad;const squad=this._squads.get(o.squad);if(squad)squad.total++;}
    this.enemies.push(e);return e;
  }
  _enemyById(id) { for(const e of this.enemies)if(e.id===id)return e; return null; }
  // Coalesced cue: one event per frame for a burst of identical happenings.
  _eventCoalesced(type,x,y,value) {
    const existing=this.events.find(event=>event.type===type&&event.value===value);
    if(existing){existing.count=(existing.count||1)+1;return existing;}
    const event={type,x,y,value,count:1};this.events.push(event);return event;
  }
  _spawnActTwoBeat(pattern,drops) {
    if(this.stage===5&&this._spawnSectorFiveBeat(pattern,drops))return;
    if(this.stage===6&&this._spawnSectorSixBeat(pattern,drops))return;
    if(pattern==="loopL")this._spawnSquadron("loop",1);
    else if(pattern==="loopR")this._spawnSquadron("loop",-1);
    else if(pattern==="riseL")this._spawnSquadron("rise",1);
    else if(pattern==="riseR")this._spawnSquadron("rise",-1);
    else if(pattern==="riseBoth"){this._spawnSquadron("rise",1,5);this._spawnSquadron("rise",-1,5);}
    else if(pattern==="sweepL")this._spawnSquadron("sweep",1,6,{y0:150});
    else if(pattern==="sweepR")this._spawnSquadron("sweep",-1,6,{y0:190});
    else if(pattern==="pincerSweep"){this._spawnSquadron("sweep",1,6,{y0:140});this._spawnSquadron("sweep",-1,6,{y0:250});}
    else if(pattern==="pincerLoop"){this._spawnSquadron("loop",1,5);this._spawnSquadron("loop",-1,5);}
    else if(pattern==="destroyer") {
      // Beat 2: the first armored hull, down the centre-left.
      this._spawnHull("destroyer",185,[[0,-80,"fan","sidewinder"],[0,-6,"flak",null],[0,72,"triple","power"]],
        ["power","escort"]);
    } else if(pattern==="cruiser") {
      // Beat 6: the mid-sector peak. Six turrets, two void batteries, torpedoes.
      this._spawnHull("cruiser",270,[[-30,-128,"broadside","power"],[30,-128,"broadside","reflector"],
        [-32,-40,"void","power"],[32,-40,"void","signature"],[0,46,"fan","shield"],[0,124,"triple","power"]],
        ["power","power","escort"],{torpedoes:true});
    } else if(pattern==="scavCurtain") {
      // Beat 3: scavengers hunt inside a staggered curtain.
      this._spawnWave("curtain");
      this._launchScavengers(4,null,true);
    } else if(pattern==="boatLines") {
      // Beat 4: twin gunboat lines whose aimed streams cross over the centre.
      for(let i=0;i<3;i++)for(const side of [-1,1])
        this._enemy("gunboat",side<0?95:445,-30-i*105,{vx:side*-3,amp:side*14,freq:.8,phase:i,
          fireAt:.9+i*.3+(side>0?.45:0),fireRate:1.8,rescue:true,drop:i===2&&side<0?"power":null});
    } else if(pattern==="minefield") {
      // Beat 5: a corridor of drifting mines. Shot down, they are harmless;
      // left alone, each fuse ends in a radial ring.
      const first=this.stageTime<50;
      for(let row=0;row<3;row++)for(let k=0;k<4;k++) {
        if((row+k)%2===(first?0:1)&&k%3!==0)continue;   // the corridor through the field
        const x=72+k*132+this._range(-16,16),y=-24-row*96;
        this._enemy("mine",x,y,{fuse:3.5+row*.6+this._range(0,.3),amp:this._range(-14,14),freq:.9,phase:this._rand()*6});
      }
    }
  }
  // Interceptor squadron (1942): every craft flies the same scripted path,
  // staggered in time. side picks the loop direction or the travel direction.
  // Returns the craft (lead first). o.x0/o.y0/o.loopY/o.loopR override the
  // entry (HALCYON's bays); o.bonus===false flies them with no squadron bonus.
  _spawnSquadron(path,side,count=6,o={}) {
    const squad=o.bonus===false?0:this._newSquad(),stagger=o.stagger??(path==="rise"?.17:.2);
    let x0,y0;
    if(path==="loop"){x0=side>0?118:422;y0=-40;}
    else if(path==="rise"){x0=side>0?72:468;y0=1090;}
    else {x0=side>0?-40:580;y0=o.y0??170;}
    if(o.x0!=null)x0=o.x0;if(o.y0!=null&&path!=="sweep")y0=o.y0;
    const craft=[];
    for(let i=0;i<count;i++)
      craft.push(this._enemy("interceptor",x0,y0,{path,side,squad,delay:i*stagger,speed:path==="rise"?330:path==="sweep"?320:300,rescue:i===0,
        loopY:o.loopY,loopR:o.loopR}));
    this.events.push({type:"squadronEnter",x:this._clamp(x0,0,540),y:this._clamp(y0,0,900),value:count,path,side});
    return craft;
  }
  _spawnHull(hullClass,x,turrets,drop,o={}) {
    const c=HULL_CLASSES[hullClass];
    const hull=this._enemy("hull",x,-c.h-12,{hullClass,drop,torpedoes:o.torpedoes});
    turrets.forEach(([ox,oy,gun,turretDrop],i)=>
      this._enemy("hullTurret",x+ox,hull.y+oy,{parent:hull,ox,oy,gun,hp:c.turretHp,fireAt:1.5+i*.4,drop:turretDrop}));
    this._event("hullEnter",x,0,hullClass);
    return hull;
  }
  // from: launch beside a ship (LEVIATHAN). flankY: cut in from both side
  // edges at that height (the scatter call-in, level with the salvage).
  // Otherwise they dive from the top corners.
  _launchScavengers(count,from,beat=false,flankY=null) {
    let live=0;for(const e of this.enemies)if(e.type==="scavenger"&&!e.dead)live++;
    count=Math.min(count,SCAVENGER_CAP-live);
    for(let i=0;i<count;i++) {
      const side=i%2?1:-1;
      if(flankY!=null) {
        this._enemy("scavenger",side>0?552:-12,flankY-i*40,{vx:-side*SCAVENGER_SPEED*.8,vy:0,leaveAt:8,fireAt:1.4+i*.3});
        continue;
      }
      const x=from?from.x+side*(70+i*18):side>0?520:20,y=from?from.y+30:-18-i*20;
      this._enemy("scavenger",x,y,{vx:-side*60,vy:from?160:120,leaveAt:beat?11:8,fireAt:1.4+i*.3});
    }
    return count;
  }
  // Mean height of the floating salvage (scavenger call-in line), or null.
  _salvageHeight() {
    let sum=0,n=0;
    for(const item of this.pickups)if(item.salvage&&!item.dead){sum+=item.y;n++;}
    return n?this._clamp(sum/n-40,140,720):null;
  }
  // Path state for an interceptor at its own age: [x, y, vx, vy].
  _interceptorPath(e) {
    const t=Math.max(0,e.age),s=e.side,v=e.speed;
    if(e.path==="loop") {
      // Dive, 1.5 loops (ends heading up), then climb out of the top.
      const yL=e.loopY,R=e.loopR,dive=(yL-e.y0)/v,w=v/R,turn=3*Math.PI;
      if(t<dive)return [e.x0,e.y0+v*t,0,v];
      const phi=(t-dive)*w;
      if(phi<turn) {
        const cx=e.x0+s*R;
        return [cx-s*R*Math.cos(phi),yL+R*Math.sin(phi),s*v*Math.sin(phi),v*Math.cos(phi)];
      }
      const climb=(phi-turn)/w;
      return [e.x0+2*s*R,yL-v*1.15*climb,0,-v*1.15];
    }
    if(e.path==="rise") {
      // From behind the player, up a side lane, drifting toward the centre.
      const drift=150*(1-Math.cos(Math.min(Math.PI,t*.9)))/2;
      return [e.x0+s*drift,e.y0-v*t,s*150*.45*Math.sin(Math.min(Math.PI,t*.9)),-v];
    }
    // Sweep: across the field on a shallow dipping arc.
    const x=e.x0+s*v*t,u=this._clamp((x-e.x0)*s/620,0,1);
    return [x,e.y0+150*Math.sin(Math.PI*u),s*v,150*Math.PI*Math.cos(Math.PI*u)*v/620];
  }
  _updateActTwoEnemy(e,h,p) {
    if(e.dead)return;
    if(SECTOR_FIVE_TYPES.has(e.type)){this._updateSectorFiveEnemy(e,h,p);return;}
    if(SECTOR_SIX_TYPES.has(e.type)){this._updateSectorSixEnemy(e,h,p);return;}
    const ready=e.y>12&&e.y<Math.min(640,p.y-140);
    if(e.type==="interceptor") {
      const [x,y,vx,vy]=this._interceptorPath(e);
      e.x=x;e.y=y;e.vx=vx;e.vy=vy;e.angle=Math.atan2(-vx,vy);
      e.hidden=e.age<0||y>905||x<-20||x>560;
      if(e.age<0)return;
      // Short aimed bursts, only from above the player: one on entry and one
      // mid-path (e.fired counts them). A low-threat ship (bare or stripped)
      // only meets the mid-path burst. A kitted ship (SECOND_BURST_THREAT)
      // meets the entry burst as soon as the craft clears the edge (popcorn
      // dies within ~0.3 s of a full kit), as up to three narrow 3-way rounds,
      // and a third burst 0.85 s after the second.
      if(e.fired===0&&this.threat<LOW_THREAT)e.fired=1;
      const early=this.threat>=SECOND_BURST_THREAT;
      const trigger=e.fired===0?(e.path==="rise"?y<p.y-170&&y<600:e.path==="loop"?y>(early?20:40):early?x>0&&x<540:x>40&&x<500):
        e.fired===1?(e.path==="loop"?e.y>=e.loopY-4&&e.vy<0:e.path==="rise"?y<260:e.side>0?x>330:x<210):
        e.fired===2&&e.extraAt>0&&e.age>=e.extraAt;
      if(trigger&&!e.hidden&&y>20&&y<p.y-120) {
        e.fired++;e.burstLeft=1+Math.round(3*this._volley());e.burstClock=0;e.wide=e.fired===1&&early;
        if(e.wide)e.burstLeft=Math.min(3,e.burstLeft);
        e.extraAt=e.fired===2&&this.threat>=SECOND_BURST_THREAT?e.age+.85:0;
      }
      if(e.burstLeft>0&&(e.burstClock-=h)<=0) {
        const round=e.burstLeft===1&&this._voidAware()?"void":"red";
        this._spread(e.x,e.y+10,p.x,p.y,e.wide?3:1,.07,this._vel(280),round,4.4);e.burstLeft--;e.burstClock=.075;
      }
    } else if(e.type==="gunboat") {
      e.y+=e.vy*h;e.x=e.baseX+e.vx*e.age+e.amp*Math.sin(e.age*e.freq+e.phase);
      if(e.age>=e.fireAt&&e.y>30&&e.y<560) {
        e.burstLeft=2+Math.round(2*this._volley());e.burstClock=0;e.fireAt=e.age+e.fireRate*this._pace();
        // A kitted ship meets a re-aimed follow-up burst after the first.
        e.followAt=this.threat>=SECOND_BURST_THREAT?e.age+.9:0;
      }
      if(e.followAt>0&&e.age>=e.followAt&&e.y<560){e.followAt=0;e.burstLeft=2;e.burstClock=0;}
      if(e.burstLeft>0&&(e.burstClock-=h)<=0) {
        this._spread(e.x,e.y+12,p.x,p.y,3,.1,this._vel(255),this._voidVolley(),4.6);e.burstLeft--;e.burstClock=.14;
      }
    } else if(e.type==="hull") {
      e.y+=e.vy*h;
      if(e.age>=e.torpedoAt&&e.y>40&&e.y<520) {
        for(const side of [-1,1])this._enemy("torpedoEnemy",e.x+side*26,e.y+e.h*.72,{heading:Math.PI/2+side*.35,speed:70});
        e.torpedoAt=e.age+CRUISER_TORPEDO_CYCLE;
        this._eventCoalesced("torpedoLaunch",e.x,e.y+e.h*.7,"enemy");
      }
    } else if(e.type==="hullTurret") {
      const parent=this._enemyById(e.parentId);
      if(!parent||parent.dead){this._killEnemy(e,false,true);return;}
      e.x=parent.x+e.ox;e.y=parent.y+e.oy;
      const want=Math.atan2(p.y-e.y,p.x-e.x);
      let diff=want-e.aim;diff=Math.atan2(Math.sin(diff),Math.cos(diff));
      e.aim+=this._clamp(diff,-2.6*h,2.6*h);
      const armed=parent.type==="boss"?parent.age>3.6:true;
      if(armed&&e.age>=e.fireAt&&ready) {
        this._turretFire(e,p,parent.type==="boss");
        e.fireAt=e.age+e.fireRate*this._pace();
      }
      if(e.burstLeft>0&&(e.burstClock-=h)<=0) {
        this._spread(e.x,e.y,p.x,p.y,this.threat>.55?5:3,.1,this._vel(265),this._voidVolley(),4.8);e.burstLeft--;e.burstClock=.15;
      }
    } else if(e.type==="scavenger") this._updateScavenger(e,h,p);
    else if(e.type==="mine") {
      e.y+=e.vy*h;e.x=e.baseX+e.amp*Math.sin(e.age*e.freq+e.phase);e.fuse-=h;
      if(e.fuse<=0) {
        // Left alone, a mine bursts into a ring with readable spokes.
        this._radial(e.x,e.y,12+Math.round(6*this._volley()),this._vel(145),e.seed*Math.PI*2,"magenta",4.6);
        this._burst(e.x,e.y,14,"magenta",150,"explode");
        this._eventCoalesced("mineBurst",e.x,e.y);
        e.dead=true;
      }
    } else if(e.type==="torpedoEnemy") {
      e.speed=Math.min(185,e.speed+h*70);
      if(e.age<5.5) {
        let diff=Math.atan2(p.y-e.y,p.x-e.x)-e.heading;diff=Math.atan2(Math.sin(diff),Math.cos(diff));
        e.heading+=this._clamp(diff,-1.05*h,1.05*h);
      }
      e.vx=Math.cos(e.heading)*e.speed;e.vy=Math.sin(e.heading)*e.speed;
      e.x+=e.vx*h;e.y+=e.vy*h;e.angle=e.heading-Math.PI/2;
      if(this._rand()<h*24)this._particle(e.x-e.vx*.05,e.y-e.vy*.05,0,0,.3,3,"white","smoke");
    }
  }
  // Turret guns. Act II streams run ~20% faster than sector 3.
  _turretFire(e,p,deck) {
    const x=e.x,y=e.y,pace=deck?.85:1;
    const t=this.threat,v=this._volley();
    if(e.gun==="triple") {
      this._spread(x,y,p.x,p.y,t>.55?5:3,.1,this._vel(265),"red",4.8);e.burstLeft=1;e.burstClock=.15;e.fireRate=1.8*pace;
    } else if(e.gun==="fan") {
      this._radial(x,y,9+Math.round(3*v),this._vel(178),Math.sin(e.age*1.3)*.45,"cyan",4.6,Math.PI*.12,Math.PI*.88);e.fireRate=1.1*pace;
    } else if(e.gun==="flak") {
      // A slow shell that bursts into a ring short of the player.
      const speed=this._vel(205),dist=Math.hypot(p.x-x,p.y-y),shell=this._bullet(x,y,Math.atan2(p.y-y,p.x-x),speed,"amber",7);
      if(shell){shell.fuse=Math.max(.45,(dist-130)/speed);shell.burst={count:10+Math.round(5*v),speed:125,kind:"amber",r:4.4,offset:e.seed*6};}
      e.fireRate=2.3*pace;
    } else if(e.gun==="void") {
      // Sector 4's deck batteries widen at .65; sector 5's foundry batteries at a higher threat.
      this._spread(x,y,p.x,p.y,t>(this.stage===5?VOID_BATTERY_WIDE_THREAT_S5:.65)?5:3,.17,this._vel(205),"void",5.6);e.fireRate=2.1*pace;
    } else if(e.gun==="broadside") {
      // A short diagonal row rolling outward from the hull's side.
      const side=Math.sign(e.ox)||1,angle=Math.PI/2-side*.5;
      for(let i=0;i<6;i++)this._bullet(x,y+(i-2.5)*21,angle,this._vel(150),"rose",5);
      e.fireRate=2.6*pace;
    }
  }
  _updateScavenger(e,h,p) {
    if(e.carrying) {
      // A carrying scavenger flees up and off the top; the salvage is lost if it escapes.
      e.vy=Math.max(-390,e.vy-620*h);e.vx*=1-Math.min(1,h*2);
      e.x+=e.vx*h;e.y+=e.vy*h;e.angle=Math.atan2(-e.vx,e.vy);
      if(e.y<-30) {
        this.stats.salvageLost+=e.carrying.value||1;
        this._event("scavengerEscape",e.x,0,e.carrying.type);
        e.dead=true;
      }
      return;
    }
    let target=null;
    if(e.targetPickupId!=null)for(const item of this.pickups)if(item.id===e.targetPickupId&&!item.dead&&item.salvage){target=item;break;}
    if(!target) {
      let best=Infinity;
      for(const item of this.pickups) {
        if(item.dead||!item.salvage||item.age<SALVAGE_GRACE*.5)continue;
        const d=(item.x-e.x)**2+(item.y-e.y)**2;if(d<best){best=d;target=item;}
      }
      e.targetPickupId=target?.id??null;
    }
    let tx,ty,speed;
    if(target){tx=target.x;ty=target.y;speed=SCAVENGER_SPEED;}
    else if(e.age<e.leaveAt){tx=p.x+Math.sin(e.age*1.1+e.seed*6)*140;ty=Math.max(110,p.y-330);speed=210;}
    else {tx=e.x;ty=-80;speed=300;}
    const dx=tx-e.x,dy=ty-e.y,len=Math.hypot(dx,dy)||1,k=Math.min(1,h*4);
    e.vx+=(dx/len*speed-e.vx)*k;e.vy+=(dy/len*speed-e.vy)*k;
    e.x+=e.vx*h;e.y+=e.vy*h;e.angle=Math.atan2(-e.vx,e.vy);
    if(target&&Math.hypot(target.x-e.x,target.y-e.y)<15) {
      target.dead=true;
      e.carrying={type:target.type,value:target.value||1,life:target.life};e.targetPickupId=null;
      e.vy=Math.min(e.vy,0);
      this._event("scavengerSteal",e.x,e.y,target.type);
      return;
    }
    if(!target&&e.age>=e.leaveAt&&e.y<-40){e.dead=true;return;}
    // Hunting scavengers snipe; a scavenger on its way to salvage does not.
    if(!target&&e.age>=e.fireAt&&e.y>20&&e.y<p.y-160) {
      this._aimed(e.x,e.y+8,p.x,p.y,this._vel(215),"rose",4.2);e.fireAt=e.age+3*this._pace();
    }
  }
  // LEVIATHAN: four deck turrets ride the hull (core x0.25 while any lives).
  _rigLeviathan(boss) {
    Object.assign(boss,{leviathan:true,turrets:[],turretsAlive:0,broadside:0,broadsideSide:1,core:0,
      wallAt:0,wallRowAt:Infinity,wallGap:270,torpedoAt:0,voidAt:0,spiralAt:0,scavAt:0,curtainAt:0,curtainGap:150});
    const deck=[[-150,-10,"triple"],[-62,24,"fan"],[62,24,"flak"],[150,-10,"broadside"]];
    deck.forEach(([ox,oy,gun],i)=>this._enemy("hullTurret",boss.x+ox,boss.y+oy,
      {parent:boss,ox,oy,gun,hp:LEVIATHAN_TURRET_HP,fireAt:4+i*.45,drop:"power",bonusDrops:1,value:3000}));
  }
  _leviathanEnterPhase(e) {
    if(e.phase===2){e.wallAt=e.age+1.5;e.torpedoAt=e.age+2.6;e.voidAt=e.age+3.4;}
    else if(e.phase===3){e.spiralAt=e.age+1.2;e.voidAt=e.age+2.6;e.scavAt=e.age+2;e.curtainAt=0;this._event("coreExposed",e.x,e.y,3);}
  }
  _leviathanFire(e,h) {
    const p=this.player;
    if(e.phase===2)e.broadside=Math.min(1,e.broadside+h/1.4);
    else if(e.phase===3){e.broadside=Math.max(0,e.broadside-h/1.2);e.core=Math.min(1,e.core+h/1.2);}
    if(e.age<3.6)return;
    if(e.phase===1) {
      // The bow fan keeps the deck honest; it quickens once the turrets fall.
      if(e.age>=e.fireAt) {
        const bare=!e.turretsAlive,salvo=e.salvo=(e.salvo||0)+1;
        this._radial(e.x,e.y+62,11,this._vel(185),Math.sin(e.age*.7)*.12,"amber",4.6,Math.PI*.18,Math.PI*.82);
        if(bare&&salvo%2===0)this._spread(e.x,e.y+70,p.x,p.y,this.threat>.4?5:3,.12,this._vel(260),"red",4.8);
        e.fireAt=e.age+(bare?1.25:1.5)*this._bossPace();this._event("bossShot",e.x,e.y);
      }
    } else if(e.phase===2) {
      // Broadside walls alternate sides; every row leaves one gap and the
      // follow-up row moves it a reachable distance.
      if(e.age>=e.wallAt) {
        e.broadsideSide=-e.broadsideSide;
        const lo=e.broadsideSide<0?16:236,hi=lo+288;
        e.wallGap=lo+70+this._rand()*(hi-lo-140);
        this._broadsideRow(e,lo,hi,e.wallGap);
        // The follow-up row (gap moved) is for a ship that still carries a kit.
        e.wallRowAt=this.threat>.6?e.age+.5:Infinity;e.wallAt=e.age+3*this._bossPace();
        this._event("broadside",e.x+e.broadsideSide*170,e.y+60,e.broadsideSide);
      }
      if(e.age>=e.wallRowAt) {
        const lo=e.broadsideSide<0?16:236,hi=lo+288,shift=e.wallGap<(lo+hi)/2?64:-64;
        this._broadsideRow(e,lo,hi,e.wallGap+shift);e.wallRowAt=Infinity;
      }
      if(e.age>=e.torpedoAt) {
        // One torpedo per salvo carries rescue power for a stripped ship.
        for(const side of [-1,1])this._enemy("torpedoEnemy",e.x+side*96,e.y+52,{heading:Math.PI/2+side*.45,speed:65,rescue:side<0});
        e.torpedoAt=e.age+3.6*this._bossPace();this._eventCoalesced("torpedoLaunch",e.x,e.y+52,"enemy");
      }
      if(e.age>=e.voidAt) {
        this._spread(e.x,e.y+66,p.x,p.y,this.threat>.6?5:3,.15,this._vel(205),"void",5.6);
        e.voidAt=e.age+2.3*this._bossPace();this._event("bossShot",e.x,e.y);
      }
    } else {
      // Monsoon engine: counter-rotating spirals from the exposed core; on the
      // final guard floor it adds the desperation curtain.
      const desperate=e.guard;
      if(e.age>=e.spiralAt) {
        const spin=e.age*1.05;
        for(let k=0;k<2;k++) {
          this._bullet(e.x,e.y+18,spin+k*Math.PI,152,"magenta",4.5);
          this._bullet(e.x,e.y+18,-spin+k*Math.PI+.5,152,"cyan",4.5);
        }
        e.spiralAt=e.age+(desperate?.3:.15)*this._bossPace();
      }
      if(e.age>=e.voidAt) {
        this._spread(e.x,e.y+40,p.x,p.y,3,.16,this._vel(215),"void",5.6);
        e.voidAt=e.age+(desperate?3.2:2.6)*this._bossPace();this._event("bossShot",e.x,e.y);
      }
      if(e.age>=e.scavAt) {
        if(this.pickups.some(item=>item.salvage&&!item.dead))this._launchScavengers(2,e);
        e.scavAt=e.age+3.8;
      }
      if(desperate&&e.age>=e.curtainAt) {
        // Full-width rows with two gaps that drift a reachable distance per row.
        e.curtainGap=this._clamp(e.curtainGap+(this._rand()<.5?-1:1)*this._range(40,80),70,230);
        const gaps=[e.curtainGap,e.curtainGap+240];
        for(let x=18;x<=522;x+=23)if(gaps.every(g=>Math.abs(x-g)>46))this._bullet(x,e.y+70,Math.PI/2,170,"rose",5);
        e.curtainAt=e.age+.8;this._event("bossShot",e.x,e.y);
      }
    }
  }
  _broadsideRow(e,lo,hi,gap) {
    for(let x=lo;x<=hi;x+=22)if(Math.abs(x-gap)>56)this._bullet(x,e.y+62,Math.PI/2,this._vel(150),"rose",5);
  }

  // ---- Sector 5, SKYFORGE -------------------------------------------------
  // A beat's authored drop rides this craft; the tag lets the drop schedule
  // be measured at collection (pickup events carry it).
  _tagDrop(e,type) {
    if(!e||!type)return;
    e.drop=type;e.tag=this.stageTime.toFixed(1)+":"+[].concat(type).join("+");
  }
  // Returns true for a sector-5 beat. Squadron patterns reuse sector 4's
  // spawner and carry the beat's lead drop on the squadron lead.
  _spawnSectorFiveBeat(pattern,drops) {
    const p=this.player,lead=drops?.lead;
    const squads={loopL:["loop",1,6],loopR:["loop",-1,6],riseL:["rise",1,6],riseR:["rise",-1,6],
      sweepL:["sweep",1,6,{y0:150}],sweepR:["sweep",-1,6,{y0:190}]};
    const pairs={riseBoth:[["rise",1,5],["rise",-1,5]],pincerSweep:[["sweep",1,6,{y0:140}],["sweep",-1,6,{y0:250}]],
      pincerLoop:[["loop",1,5],["loop",-1,5]]};
    if(squads[pattern]||pairs[pattern]) {
      let first=null;
      for(const [path,side,n,o] of pairs[pattern]||[squads[pattern]]) {
        const craft=this._spawnSquadron(path,side,n,o);first??=craft[0];
      }
      this._tagDrop(first,lead);
      return true;
    }
    if(pattern==="acePair")this._spawnAces([150,390],lead);
    else if(pattern==="aceWing"){this._spawnAces([80,175,270,365,460],lead,.3,!!drops?.rescue);this._queueFlak([[1.6,0,2]]);}
    else if(pattern==="boxClimb")this._spawnBox(true,p.x,3,lead);
    else if(pattern==="boxClimb4")this._spawnBox(true,p.x,4,lead);
    else if(pattern==="boxDive")this._spawnBox(false,p.x,3,lead);
    else if(pattern==="flakCorridor"){this._spawnFlakSet([[-120,FLAK_WARN],[0,FLAK_WARN+.35],[120,FLAK_WARN+.7]]);this._spawnDroneDrift(6);}
    else if(pattern==="flakGauntlet")this._spawnFlakSet([[-120,FLAK_WARN],[0,FLAK_WARN+.35],[120,FLAK_WARN+.7]]);
    else if(pattern==="flakPair")this._queueFlak([[0,0,2],[1.2,-125,2]]);
    else if(pattern==="foundry1")this._spawnFoundry("small",200,[[-74,6],[0,32],[74,6]],[],drops);
    else if(pattern==="foundry2")this._spawnFoundry("large",270,[[-104,0],[-36,36],[36,36],[104,0]],
      [[-62,-46,"void"],[62,-46,"void"]],drops);
    else return false;
    return true;
  }
  // A bomber box: 3-4 heavies in a wedge, aimed at the ship's lane. boxEnter
  // fires BOX_LEAD seconds before the box crosses the edge.
  _spawnBox(climb,cx,count=3,lead=null) {
    const box=this._newSquad(),xs=[];
    cx=this._clamp(cx,110,430);
    const slots=count>=4?[[0,0],[-74,56],[74,56],[0,112]]:[[0,0],[-74,56],[74,56]];
    slots.forEach(([dx,dy],i)=>{
      const x=cx+dx,y=climb?925+dy:-40-dy,oy=climb?24:-24;
      const e=this._enemy("boxBomber",x,y,{box,climb,squad:box,lead:i===0,delay:BOX_LEAD,
        vy:climb?-BOMBER_CLIMB_SPEED:BOMBER_DIVE_SPEED,rescue:i===0});
      if(i===0)this._tagDrop(e,lead);
      for(const ox of i===0?[-13,13]:[0])
        this._enemy("tailGunner",x+ox,y+oy,{parent:e,ox,oy,delay:BOX_LEAD,fireAt:.45+i*.3,fireRate:1.15});
      xs.push(x);
    });
    this.events.push({type:"boxEnter",x:cx,y:climb?900:0,value:climb?"climb":"dive",count:slots.length,xs,lead:BOX_LEAD});
  }
  _spawnAces(lanes,lead,stagger=.25,rescue=false) {
    const squad=this._newSquad();
    lanes.forEach((x,i)=>{
      const e=this._enemy("skyAce",x,-30,{squad,delay:i*stagger,hoverY:285+(i%2)*50,leaveAt:7.5,
        amp:34,freq:1.3,phase:i*1.7,fireAt:1.1+i*.15,fireRate:1.5,rescue:rescue&&i===0});
      if(i===0)this._tagDrop(e,lead);
    });
  }
  _spawnDroneDrift(n) {
    for(let i=0;i<n;i++)
      this._enemy("drone",60+i*(420/(n-1)),-20-(i%2)*44,{vx:0,vy:72,drift:true,fireAt:1.2+i*.12});
  }
  _spawnFoundry(cls,x,bays,guns,drops) {
    const c=FOUNDRY_CLASSES[cls];
    const f=this._enemy("foundry",x,-c.h-14,{foundryClass:cls});
    if(drops?.heavy)this._tagDrop(f,drops.heavy.length===1?drops.heavy[0]:[...drops.heavy]);
    bays.forEach(([ox,oy],i)=>{
      const bay=this._enemy("foundryBay",x+ox,f.y+oy,{parent:f,ox,oy,hp:c.bayHp,launch:1.4+i*.6});
      this._tagDrop(bay,drops?.bays?.[i]);
    });
    guns.forEach(([ox,oy,gun],i)=>this._enemy("hullTurret",x+ox,f.y+oy,{parent:f,ox,oy,gun,hp:c.turretHp,fireAt:1.6+i*.5}));
    this._event("foundryEnter",x,0,cls);
    return f;
  }
  _launchDrones(bay,n) {
    for(let i=0;i<n;i++) {
      // Kamikaze divers are for a kitted ship; a stripped one meets shooters.
      const dive=(this._droneSerial++)%2===1&&this.threat>=LOW_THREAT,spread=i-(n-1)/2;
      this._enemy("drone",bay.x+spread*10,bay.y+8,{vx:spread*120+Math.sign(bay.ox)*30,vy:130,dive,fireAt:.7+i*.08});
    }
    bay.open=1;
    if(this._cueReady("droneLaunch",.25))this.events.push({type:"droneLaunch",x:bay.x,y:bay.y,count:n});
  }
  // Throttle for repeating cues: true at most once per `gap` seconds.
  _cueReady(name,gap) {
    if((this._cue[name]??-Infinity)>this.time-gap)return false;
    this._cue[name]=this.time;return true;
  }
  _slewAim(e,p,h,rate) {
    let diff=Math.atan2(p.y-e.y,p.x-e.x)-e.aim;diff=Math.atan2(Math.sin(diff),Math.cos(diff));
    e.aim+=this._clamp(diff,-rate*h,rate*h);
  }
  // A child whose parent is gone: down with it (wreckage, half score) if the
  // parent died, quietly if the parent left the field.
  _loseChild(e,parent) { if(parent)this._killEnemy(e,false,true);else e.dead=true; }
  _childLost(t) {
    const parent=this._enemyById(t.parentId);if(!parent)return;
    if(t.type==="foundryBay"&&parent.baysAlive>0)parent.baysAlive--;
    else if(t.type==="tailGunner"&&parent.gunnersAlive>0)parent.gunnersAlive--;
    else if(t.type==="stationTurret"&&parent.turretsAlive>0)parent.turretsAlive--;
    else if(t.type==="mirrorEscort"&&parent.escortsAlive>0)parent.escortsAlive--;
  }
  _updateSectorFiveEnemy(e,h,p) {
    const t=e.type;
    if(t==="boxBomber") {
      if(e.age<0)return;
      e.y+=e.vy*h;
      e.hidden=e.climb?e.y>905:e.y<-34;
    } else if(t==="tailGunner") {
      const parent=this._enemyById(e.parentId);
      if(!parent||parent.dead){this._loseChild(e,parent);return;}
      e.x=parent.x+e.ox;e.y=parent.y+e.oy;e.hidden=parent.hidden;e.angle=parent.angle;
      if(e.age<0||e.hidden)return;
      this._slewAim(e,p,h,3);
      // Fires back down at the ship once its bomber has passed above it.
      if(e.age>=e.fireAt&&e.y>24&&e.y<p.y-90) {
        e.burstLeft=2+Math.round(this._volley());e.burstClock=0;e.round=this._voidVolley();
        e.fireAt=e.age+e.fireRate*this._pace();
        this._event("gunnerFire",e.x,e.y,e.burstLeft);
      }
      if(e.burstLeft>0&&(e.burstClock-=h)<=0) {
        this._spread(e.x,e.y,p.x,p.y,this.threat>.55?2:1,.12,this._vel(270),e.round||"red",4.6);
        e.burstLeft--;e.burstClock=.12;
      }
    } else if(t==="skyAce") {
      e.hidden=e.age<0;if(e.hidden)return;
      e.dodgeCool=Math.max(0,e.dodgeCool-h);
      const leaving=e.age>=e.leaveAt;
      if(e.dodge>0){e.dodge=Math.max(0,e.dodge-h);e.lane=this._clamp(e.lane+e.dodgeDir*ACE_DODGE_SPEED*h,50,490);}
      else if(e.dodgeCool<=0&&e.y>30&&!leaving)this._aceLook(e);
      const ox=e.x,oy=e.y;
      e.y=leaving?e.y-300*h:e.y+this._clamp(e.hoverY-e.y,-250*h,250*h);
      e.x+=(e.lane+e.amp*Math.sin(e.age*e.freq+e.phase)-e.x)*Math.min(1,h*(e.dodge>0?14:6));
      const vx=(e.x-ox)/h;e.vx=vx;e.vy=(e.y-oy)/h;
      e.angle=leaving?Math.PI+this._clamp(vx/500,-.5,.5):this._clamp(-vx/500,-.6,.6);
      if(!leaving&&e.dodge<=0&&e.age>=e.fireAt&&e.y>40&&e.y<p.y-150) {
        e.burstLeft=2+Math.round(2*this._volley());e.burstClock=0;e.fireAt=e.age+e.fireRate*this._pace();
      }
      if(e.burstLeft>0&&(e.burstClock-=h)<=0) {
        // Leads the target: aims where the ship will be when the round arrives.
        const speed=this._vel(310),lead=Math.hypot(p.x-e.x,p.y-e.y)/speed;
        const tx=this._clamp(p.x+(p.vx||0)*lead,20,520),ty=p.y+this._clamp((p.vy||0)*lead,-80,80);
        const round=e.burstLeft===1&&this._voidAware()?"void":"cyan";
        this._spread(e.x,e.y+12,tx,ty,this.threat>ACE_WIDE_THREAT?3:1,.07,speed,round,4.4);
        e.burstLeft--;e.burstClock=.09;
      }
    } else if(t==="foundry") {
      e.y+=e.vy*h;
    } else if(t==="foundryBay") {
      const parent=this._enemyById(e.parentId);
      if(!parent||parent.dead){this._loseChild(e,parent);return;}
      e.x=parent.x+e.ox;e.y=parent.y+e.oy;e.angle=parent.angle||0;
      if(parent.type==="boss"&&parent.age<3.6)return;
      e.launch-=h;
      e.open=e.launch<BAY_OPEN?Math.min(1,1-e.launch/BAY_OPEN):Math.max(0,e.open-h*2.5);
      if(e.launch<=0) {
        if(parent.type==="boss")this._halcyonLaunch(e,parent);
        else if(e.y>20&&e.y<600){this._launchDrones(e,2+(this._volley()>.7?1:0));e.launch=BAY_CYCLE*this._pace();}
        else e.launch=.25;
      }
    } else if(t==="drone") {
      const k=Math.min(1,h*2.4);
      if(e.dive) {
        if(e.age<.42){e.vx+=(0-e.vx)*k;e.vy+=(40-e.vy)*k;}
        else {
          if(e.heading===undefined)e.heading=Math.atan2(p.y-e.y,p.x-e.x);
          e.speed=Math.min(380,(e.speed||120)+h*560);
          e.vx=Math.cos(e.heading)*e.speed;e.vy=Math.sin(e.heading)*e.speed;
        }
      } else {
        if(!e.fired||e.drift||e.age<e.peelAt){e.vx+=(0-e.vx)*k*.5;e.vy+=((e.drift?72:60)-e.vy)*k;}
        else {const dir=e.x<270?-1:1;e.vx+=(dir*240-e.vx)*k;e.vy+=(-30-e.vy)*k;}
        if(!e.fired&&e.age>=e.fireAt&&e.y>30&&e.y<p.y-140) {
          e.fired=true;e.peelAt=e.age+.45;this._aimed(e.x,e.y+6,p.x,p.y,this._vel(240),"rose",4.2);
        }
      }
      e.x+=e.vx*h;e.y+=e.vy*h;e.angle=Math.atan2(-e.vx,e.vy);
    }
  }
  // A sky ace sidesteps a main-gun column closing on it, then waits out its cooldown.
  _aceLook(e) {
    for(const s of this.shots) {
      if(s.dead||!MAIN_GUN_SHOTS.has(s.kind)||s.y<e.y||s.y>e.y+460||Math.abs(s.x-e.x)>=ACE_DODGE_RANGE)continue;
      let dir=s.x<e.x?1:-1;
      if(e.lane+dir*150>490||e.lane+dir*150<50)dir=-dir;
      e.dodgeDir=dir;e.dodge=ACE_DODGE_TIME;e.dodgeCool=ACE_DODGE_COOL;
      if(this._cueReady("skyAceDodge",.3))this._event("skyAceDodge",e.x,e.y,dir);
      return;
    }
  }
  // ---- Hazards (game.hazards) ----
  _clearHazards() { this.hazards.length=0;this._flakQueue.length=0;this._resetEmp(); }
  // A disabled wing comes back at once when the field is wiped (HALCYON's
  // death, a sector change) or the escorts are gone (scatter, a lost life).
  _resetEmp() {
    const p=this.player;if(!(p.empTime>0))return;
    p.empTime=0;this._event("empClear",p.x,p.y,"reset");
  }
  // Flak bands are queued so each marks at the ship's altitude when its turn
  // comes: [delay s, altitude offset px, gap count].
  _queueFlak(list) {
    for(const [delay,dy,gaps] of list)this._flakQueue.push({at:this.stageTime+delay,dy,gaps});
    this._flakQueue.sort((a,b)=>a.at-b.at);
  }
  // A corridor: bands marked together around the ship's altitude, bursting
  // in sequence. Their reach overlaps, so the pilot threads a stepped path of
  // gaps: each band's near gap sits a reachable step from the last.
  _spawnFlakSet(rows) {
    const p=this.player,dir=p.x<270?1:-1,step=this._range(45,75);
    let g=this._clamp(p.x+this._range(-50,50),70,470);
    for(const [dy,warn] of rows) {
      this._spawnFlakBand(this._clamp(p.y+dy,260,810),2,g,warn);
      g=this._clamp(g+dir*step,70,470);
    }
  }
  _spawnFlakBand(y,gapCount=2,near=null,warn=FLAK_WARN) {
    const p=this.player;
    near??=this._clamp(p.x+this._range(-150,150),60,480);
    const gaps=[near];
    // One gap reachable inside the warning, the other across the field.
    if(gapCount>1)gaps.push(this._clamp(near+(near<270?1:-1)*this._range(170,260),60,480));
    const band={id:++this._hazardId,kind:"flakBand",y,gaps,gapW:FLAK_GAP,warn,age:0,state:"mark",
      spread:Math.round(FLAK_SPEED*FLAK_TTL)};
    this.hazards.push(band);
    this.events.push({type:"flakMark",x:270,y,value:gaps.length,gaps:[...gaps],gapW:FLAK_GAP,warn});
    return band;
  }
  _burstFlakBand(band) {
    let n=0;
    for(let x=12,k=0;x<=528;x+=FLAK_STEP,k++) {
      if(band.gaps.some(g=>Math.abs(x-g)<band.gapW/2))continue;
      const tilt=k%2?.22:-.22;
      for(const angle of [-Math.PI/2+tilt,Math.PI/2-tilt]) {
        const b=this._bullet(x,band.y,angle,FLAK_SPEED,"amber",4.4);
        if(b){b.ttl=FLAK_TTL;n++;}
      }
    }
    band.state="burst";
    this.events.push({type:"flakBurst",x:270,y:band.y,count:n});
  }
  _laserBar(frame,orient,pos,from,to,o={}) {
    const bar={id:++this._hazardId,kind:"laser",frame,orient,pos,from,to,width:LASER_WIDTH,
      warn:o.warn??LASER_WARN,on:o.on??LASER_ON,age:0,state:"warn",void:!!o.void};
    this.hazards.push(bar);return bar;
  }
  _laserTouches(bar,p) {
    if(bar.rotating) {
      // A rotating beam is a ray from its pivot along `angle`.
      const dx=p.x-bar.pivotX,dy=p.y-bar.pivotY,c=Math.cos(bar.angle),sn=Math.sin(bar.angle);
      const along=dx*c+dy*sn;
      return along>0&&along<bar.len&&Math.abs(dx*sn-dy*c)<bar.width+p.r;
    }
    const along=bar.orient==="h"?p.x:p.y,across=bar.orient==="h"?p.y:p.x;
    return Math.abs(across-bar.pos)<bar.width+p.r&&along>bar.from-p.r&&along<bar.to+p.r;
  }
  _empPulse(emp) {
    const p=this.player;emp.state="pulse";emp.charge=1;
    const hit=Math.hypot(p.x-emp.x,p.y-emp.y)<emp.r+p.r&&p.roll<=0&&p.escorts>0;
    if(hit)p.empTime=Math.max(p.empTime,EMP_TIME);
    this._event("empPulse",emp.x,emp.y,hit);
  }
  _updateHazards(h) {
    const p=this.player;
    if(p.empTime>0){p.empTime=Math.max(0,p.empTime-h);if(p.empTime<=0)this._event("empClear",p.x,p.y);}
    while(this._flakQueue.length&&this.stageTime>=this._flakQueue[0].at) {
      const q=this._flakQueue.shift();
      if(!this.boss&&this._transition<=0)this._spawnFlakBand(this._clamp(p.y+q.dy,300,800),q.gaps);
    }
    let write=0;
    for(const hz of this.hazards) {
      hz.age+=h;let keep=true;
      if(hz.kind==="flakBand") {
        if(hz.state==="mark"&&hz.age>=hz.warn)this._burstFlakBand(hz);
        else if(hz.state==="burst"&&hz.age>=hz.warn+.5)keep=false;
      } else if(hz.kind==="laser") {
        if(hz.rotating&&hz.state==="fire")hz.angle=hz.angle0+hz.sweep*Math.min(hz.on,hz.age-hz.warn);
        if(hz.state==="off"||(hz.ownerId&&this._ownerGone(hz.ownerId)))keep=false;
        else if(hz.state==="warn"&&hz.age>=hz.warn) {
          hz.state="fire";
          if(hz.lead)this.events.push({type:"laserFire",x:hz.orient==="v"?hz.pos:hz.rotating?hz.pivotX:270,y:hz.orient==="h"?hz.pos:hz.rotating?hz.pivotY:450,count:hz.count||1,value:hz.void,
            ...(hz.rotating?{rotating:true}:hz.mirror?{mirror:true}:{})});
        } else if(hz.state==="fire"&&hz.age>=hz.warn+hz.on)hz.state="off";
      } else if(hz.kind==="emp") {
        hz.charge=Math.min(1,hz.age/hz.chargeTime);
        if(hz.state==="charge"&&hz.age>=hz.chargeTime)this._empPulse(hz);
        else if(hz.state==="pulse"&&hz.age>=hz.chargeTime+EMP_SHOW)keep=false;
      }
      if(keep)this.hazards[write++]=hz;
    }
    this.hazards.length=write;
  }
  // ---- HALCYON (stage 5): three bays, the lattice, the eclipse protocol ----
  _halcyonMercy() {
    const f=(this.player.arsenal-HALCYON_MERCY_LOW)/(HALCYON_MERCY_FULL-HALCYON_MERCY_LOW);
    return HALCYON_MERCY_FLOOR+(1-HALCYON_MERCY_FLOOR)*this._clamp(Number.isFinite(f)?f:0,0,1);
  }
  _rigHalcyon(boss) {
    const rank=1+(HALCYON_BAY_RANK-1)*this._clamp((this.threat-HALCYON_BAY_RANK_FROM)/(HALCYON_BAY_RANK_FULL-HALCYON_BAY_RANK_FROM),0,1);
    Object.assign(boss,{halcyon:true,easeThreat:this.threat,bays:[],baysAlive:0,lattice:0,eclipse:0,latticeAt:0,latticeKind:0,
      aimAt:0,rowAt:0,empAt:0,hangarAt:0,curtainAt:0,curtainGap:150,frame:0,launches:0});
    [[-150,24],[0,42],[150,24]].forEach(([ox,oy],i)=>this._enemy("foundryBay",boss.x+ox,boss.y+oy,
      {parent:boss,ox,oy,hp:HALCYON_BAY_HP*rank,launch:1.2+i*1.8,drop:"power",bonusDrops:1,value:3000}));
  }
  // A bay launches a three-craft interceptor squadron (no squadron bonus; the
  // lead carries rescue power for a stripped ship).
  _halcyonLaunch(bay,boss) {
    const side=bay.ox<0?1:bay.ox>0?-1:(boss.launches%2?1:-1);
    boss.launches++;
    this._spawnSquadron("loop",side,3,{x0:bay.x,y0:bay.y+8,loopY:bay.y+230,loopR:62,stagger:.24,bonus:false});
    bay.launch=HALCYON_LAUNCH*this._halcyonPace();
  }
  _halcyonEnterPhase(e) {
    this._clearHazards();
    e.hangarAt=e.age+2;
    if(e.phase===2){e.latticeAt=e.age+1.6;e.aimAt=e.age+2.4;e.latticeKind=0;}
    else if(e.phase===3){e.latticeAt=e.age+2.2;e.rowAt=e.age+1.4;e.empAt=e.age+3;e.aimAt=e.age+3.6;e.curtainAt=0;}
  }
  // HALCYON's cooldown multiplier: the shared flagship rank, eased for a mid kit (see HALCYON_EASE_*).
  _halcyonPace() {
    const ease=t=>this._clamp((HALCYON_EASE_FROM-t)/HALCYON_EASE_SPAN,0,1);
    return this._bossPace()*(1+HALCYON_EASE_SPAWN*ease(this.boss?.easeThreat??this.threat)+HALCYON_EASE_LIVE*ease(this.threat));
  }
  _halcyonFire(e,h) {
    const p=this.player,pace=this._halcyonPace();
    if(e.phase>=2)e.lattice=Math.min(1,e.lattice+h/1.2);
    if(e.phase===3)e.eclipse=Math.min(1,e.eclipse+h/1.5);
    if(e.age<3.6)return;
    if(e.phase===1) {
      // Wingtip fans; the core joins in on alternate salvos, every salvo once the bays fall.
      if(e.age>=e.fireAt) {
        const salvo=e.salvo=(e.salvo||0)+1,bare=!e.baysAlive;
        const fan=5+Math.round(2*this._volley());
        for(const side of [-1,1])
          this._radial(e.x+side*196,e.y+10,fan,this._vel(175),side*.2+Math.sin(e.age*.8)*.1,"amber",4.6,Math.PI*.22,Math.PI*.78);
        if(bare||salvo%2===0)this._spread(e.x,e.y+50,p.x,p.y,3,.11,this._vel(255),"red",4.8);
        e.fireAt=e.age+(bare?1.3:1.7)*pace;this._event("bossShot",e.x,e.y);
      }
    } else if(e.phase===2) {
      this._halcyonHangar(e,pace);
      // Slow wingtip fans keep the ship moving inside the lattice.
      if(e.age>=e.fireAt) {
        for(const side of [-1,1])
          this._radial(e.x+side*196,e.y+10,5,this._vel(150),side*.25+Math.sin(e.age*.7)*.12,"amber",4.6,Math.PI*.25,Math.PI*.75);
        e.fireAt=e.age+2.4*pace;
      }
      if(e.age>=e.latticeAt){this._halcyonLattice(e,false);e.latticeAt=e.age+HALCYON_LATTICE_CYCLE*pace;}
      if(e.age>=e.aimAt) {
        this._spread(e.x,e.y+50,p.x,p.y,3,.12,this._vel(250),this._voidVolley(),4.8);
        e.aimAt=e.age+2.3*pace;this._event("bossShot",e.x,e.y);
      }
    } else {
      // Eclipse protocol: void lattices, void rows and EMP rings; on the final
      // guard floor the lattice stops and the desperation curtain starts.
      const desperate=e.guard;
      this._halcyonHangar(e,pace);
      if(!desperate&&e.age>=e.latticeAt){this._halcyonLattice(e,true);e.latticeAt=e.age+(HALCYON_LATTICE_CYCLE+.5)*pace;}
      if(e.age>=e.rowAt){this._halcyonVoidRow(e);e.rowAt=e.age+(desperate?3.6:3)*pace;}
      if(e.age>=e.empAt){this._halcyonEmp(e);e.empAt=e.age+(desperate?6:5.2)*pace;}
      if(!desperate&&e.age>=e.aimAt) {
        this._spread(e.x,e.y+44,p.x,p.y,3,.16,this._vel(215),"void",5.6);
        e.aimAt=e.age+3.2*pace;this._event("bossShot",e.x,e.y);
      }
      if(desperate&&e.age>=e.curtainAt) {
        e.curtainGap=this._clamp(e.curtainGap+(this._rand()<.5?-1:1)*this._range(40,80),70,230);
        const gaps=[e.curtainGap,e.curtainGap+240];
        for(let x=18;x<=522;x+=23)if(gaps.every(g=>Math.abs(x-g)>46))this._bullet(x,e.y+66,Math.PI/2,170,"rose",5);
        e.curtainAt=e.age+.85;this._event("bossShot",e.x,e.y);
      }
    }
  }
  // One lattice frame: columns (stand between the bars), two rows with
  // moving gaps, or a cross (a row at the ship's altitude plus two columns
  // clear of its gap). Every frame leaves a gap of 96 px or more.
  _halcyonLattice(e,isVoid) {
    const p=this.player,frame=++e.frame,kind=e.latticeKind++%3,bars=[],top=e.y+e.h*.7;
    const add=(orient,pos,from,to,warn)=>bars.push(this._laserBar(frame,orient,pos,from,to,{void:isVoid,warn}));
    if(kind===0) {
      for(let x=this._range(28,100);x<=525;x+=128)add("v",x,top,900);
    } else if(kind===1) {
      const y1=this._clamp(p.y,300,800),y2=this._clamp(y1+(y1>560?-150:150),300,800);
      const g1=this._clamp(p.x+this._range(-130,130),70,470),g2=this._clamp(g1+(g1<270?1:-1)*this._range(70,120),70,470);
      for(const [y,g,warn] of [[y1,g1,LASER_WARN],[y2,g2,LASER_WARN+.35]]){add("h",y,0,g-LASER_GAP,warn);add("h",y,g+LASER_GAP,540,warn);}
    } else {
      const y=this._clamp(p.y,300,800),g=this._clamp(p.x+this._range(-110,110),90,450);
      add("h",y,0,g-LASER_GAP);add("h",y,g+LASER_GAP,540);
      for(const x of [g-175,g+175])if(x>20&&x<520)add("v",x,top,900);
    }
    bars[0].lead=true;bars[0].count=bars.length;
    this.events.push({type:"laserWarn",x:bars[0].orient==="v"?bars[0].pos:270,y:bars[0].orient==="h"?bars[0].pos:450,
      orient:bars[0].orient,pos:bars[0].pos,value:isVoid,count:bars.length,
      bars:bars.map(b=>({orient:b.orient,pos:b.pos,from:b.from,to:b.to}))});
  }
  // Phases 2-3: the core hangar drops a drone pair (one diver). One carries
  // rescue power for a stripped ship, like LEVIATHAN's torpedo salvos.
  _halcyonHangar(e,pace) {
    if(e.age<e.hangarAt)return;
    for(const side of [-1,1])this._enemy("drone",e.x+side*34,e.y+46,{vx:side*90,vy:120,dive:side>0,rescue:side<0,fireAt:.8});
    e.hangarAt=e.age+HALCYON_HANGAR*pace;
    if(this._cueReady("droneLaunch",.25))this.events.push({type:"droneLaunch",x:e.x,y:e.y+46,count:2});
  }
  _halcyonVoidRow(e) {
    const g=this._clamp(this.player.x+this._range(-140,140),70,470);
    for(let x=14;x<=526;x+=26)if(Math.abs(x-g)>58)this._bullet(x,e.y+56,Math.PI/2,this._vel(140),"void",5);
    this._event("bossShot",e.x,e.y);
  }
  _empRadius() {
    const f=this._clamp((this.threat-EMP_RANK_FROM)/(EMP_RANK_FULL-EMP_RANK_FROM),0,1);
    return Math.round(EMP_RADIUS+(EMP_RADIUS_FULL-EMP_RADIUS)*f);
  }
  _halcyonEmp(e) {
    const p=this.player;
    // The ring leads the ship (where it will be in EMP_LEAD s): flying straight
    // is caught, a turn or a roll escapes.
    const emp={id:++this._hazardId,kind:"emp",x:this._clamp(p.x+(p.vx||0)*EMP_LEAD,70,470),
      y:this._clamp(p.y+(p.vy||0)*EMP_LEAD,300,780),r:this._empRadius(),
      charge:0,chargeTime:EMP_CHARGE,age:0,state:"charge"};
    this.hazards.push(emp);
    this.events.push({type:"empCharge",x:emp.x,y:emp.y,r:emp.r});
  }
  // ---- Sector 6, ZERO MERIDIAN --------------------------------------------
  // The recorded player path: one sample per sim tick into a ring buffer
  // (game.path; head is the next slot to write). Echoes replay it.
  _recordPath() {
    const P=this.path,p=this.player;
    P.x[P.head]=p.x;P.y[P.head]=p.y;P.head=(P.head+1)%P.size;if(P.count<P.size)P.count++;
  }
  // Ring index of the sample `back` ticks ago (the oldest kept if the path is shorter).
  _pathIndex(back) {
    const P=this.path;if(!P.count)return -1;
    return ((P.head-1-Math.min(back,P.count-1))%P.size+P.size)%P.size;
  }
  _spawnSectorSixBeat(pattern,drops) {
    const p=this.player,lead=drops?.lead,rescue=!!drops?.rescue;
    if(pattern==="echoPair")this._spawnEchoes([[-1,0,ECHO_OFFSET],[1,0,ECHO_OFFSET+60]],lead,rescue);
    else if(pattern==="echoWing")this._spawnEchoes([[-1,-70,380],[-1,70,380],[1,-120,470],[1,120,470],
      ...(this.threat>=SECTOR_SIX_ELITE?[[-1,0,520],[1,0,300]]:[])],lead,rescue,.3);
    else if(pattern==="satellites"){this._spawnSatellite(1,215,lead,0);this._spawnSatellite(-1,265,null,1.8);this._spawnDroneDrift(6);}
    else if(pattern==="satellite")this._spawnSatellite(p.x<270?-1:1,240,lead,0);
    else if(pattern==="shardCurtain")this._spawnShardCurtain(this.threat>=SECTOR_SIX_ELITE?6:5);
    else if(pattern==="shardCurtainShort")this._spawnShardCurtain(this.threat>=SECTOR_SIX_ELITE?4:3);
    else if(pattern==="gate")this._spawnStation(drops);
    // The remix gauntlet's pair and box stay as authored at every rank.
    else if(pattern==="remixAces")this._spawnAces([150,390],lead);
    else if(pattern==="remixBox")this._spawnBox(true,p.x,3,lead);
    // Elite tier: the ace pairs fly as wings, the climbing box as four.
    else if(pattern==="acePair"&&this.threat>=SECTOR_SIX_ELITE)this._spawnAces([80,175,270,365,460],lead,.3,rescue);
    else if(pattern==="boxClimb"&&this.threat>=SECTOR_SIX_ELITE)this._spawnBox(true,p.x,4,lead);
    else return this._spawnSectorFiveBeat(pattern,drops);
    return true;
  }
  // specs: [mirror, x offset, y offset up-field, replay lag s] per echo. The lead carries the beat's drop.
  _spawnEchoes(specs,lead=null,rescue=false,stagger=.25,o={}) {
    const squad=o.bonus===false?0:this._newSquad(),style=this.player.weaponType,out=[];
    specs.forEach(([mirror,ox,oy,lag],i)=>{
      const [tx,ty]=this._echoTarget({mirror,ox,oy,lag});
      const e=this._enemy("echo",o.x0??tx,o.y0??-30,{style,mirror,ox,oy,lag,squad,delay:i*stagger,
        fireAt:ECHO_ENTER+.1+i*.15,rescue:(rescue||o.rescue)&&i===0});
      if(i===0)this._tagDrop(e,lead);
      out.push(e);
    });
    this._event("echoSpawn",out[0].x,out[0].y,style);this.events[this.events.length-1].count=out.length;
    return out;
  }
  // Where an echo's replay puts it: the path ECHO_DELAY s ago, mirrored and up-field.
  _echoTarget(e) {
    const p=this.player,i=this._pathIndex(Math.round((e.lag??ECHO_DELAY)*PATH_HZ));
    const px=i<0?p.x:this.path.x[i],py=i<0?p.y:this.path.y[i];
    return [this._clamp(270+e.mirror*(px-270)+e.ox,36,504),Math.max(70,py-e.oy),i];
  }
  _updateEcho(e,h,p) {
    e.hidden=e.age<0;if(e.hidden)return;
    const ox=e.x,oy=e.y;
    if(e.age<e.leaveAt) {
      const [tx,ty,i]=this._echoTarget(e);e.trail=i;
      const k=Math.min(1,e.age/ECHO_ENTER),ease=1-(1-k)**3;
      e.x=e.x0+(tx-e.x0)*ease;e.y=e.y0+(ty-e.y0)*ease;
      // A ghost while it materialises: shots and the ship pass through it.
      e.phasing=k<1;
    } else {e.y-=340*h;e.trail=-1;}
    e.vx=(e.x-ox)/h;e.vy=(e.y-oy)/h;
    if(Math.hypot(e.vx,e.vy)>8)e.angle=Math.atan2(-e.vx,e.vy);
    if(e.age<e.leaveAt&&e.age>=e.fireAt&&e.y>30&&e.y<p.y-140) {
      this._echoFire(e,p);
      // Elite tier: a second volley 0.22 s later, then the cooldown.
      if(!this.boss&&this.threat>=SECTOR_SIX_ELITE&&!e.volley){e.volley=1;e.fireAt=e.age+.22;}
      else {e.volley=0;e.fireAt=e.age+e.fireRate*this._pace();}
    }
  }
  // A weak copy of the player's main-gun family. An echo knows the flight it
  // copies: it leads its aim to where the ship will be.
  _echoFire(e,p) {
    const speed=this._vel(240),lead=Math.hypot(p.x-e.x,p.y-e.y)/speed;
    const tx=this._clamp(p.x+(p.vx||0)*lead,20,520),ty=p.y+this._clamp((p.vy||0)*lead,-80,80);
    if(e.style==="spread") {
      const n=this.threat>.7&&!this.boss?5:3,a=Math.atan2(ty-e.y-12,tx-e.x);
      for(let i=0;i<n;i++){const b=this._bullet(e.x,e.y+12,a+(i-(n-1)/2)*.13,speed,"mirror",4.4);if(b)b.fragile=true;}
    }
    else if(e.style==="missile")this._mirrorMissile(e.x,e.y+12,Math.atan2(ty-e.y,tx-e.x),this._vel(160),1.6);
    else {
      const bar=this._mirrorRail(this._clamp(p.x+(p.vx||0)*ECHO_RAIL_WARN*.6,24,516),e.y+14,ECHO_RAIL_WARN,ECHO_RAIL_ON,e.id);
      e.railX=bar.pos;
    }
    this._eventCoalesced("echoFire",e.x,e.y,e.style);
  }
  // A Wraith-style rail: a telegraphed vertical line (a short `laser` hazard, mirror: true).
  _mirrorRail(x,top,warn,on,ownerId=0,frame=0) {
    const bar=this._laserBar(frame||++this._hazardId,"v",this._clamp(x,24,516),top,900,{warn,on});
    bar.width=6;bar.mirror=true;bar.ownerId=ownerId;
    if(!frame) {
      bar.lead=true;bar.count=1;
      this.events.push({type:"laserWarn",x:bar.pos,y:450,orient:"v",pos:bar.pos,value:false,mirror:true,count:1,
        bars:[{orient:"v",pos:bar.pos,from:bar.from,to:bar.to}]});
    }
    return bar;
  }
  // A Manta-style mirror missile: a fragile round that turns gently toward the ship.
  _mirrorMissile(x,y,angle,speed,homing=1.8) {
    const b=this._bullet(x,y,angle,speed,"mirror",6);
    if(b){b.style="missile";b.fragile=true;b.homing=homing;b.turn=1.25;}
    return b;
  }
  _steerBullet(b,h) {
    b.homing-=h;const p=this.player;
    const speed=Math.hypot(b.vx,b.vy),a=Math.atan2(b.vy,b.vx);
    let diff=Math.atan2(p.y-b.y,p.x-b.x)-a;diff=Math.atan2(Math.sin(diff),Math.cos(diff));
    const na=a+this._clamp(diff,-b.turn*h,b.turn*h);
    b.vx=Math.cos(na)*speed;b.vy=Math.sin(na)*speed;
  }
  _shard(x,y,angle,speed) {
    const b=this._bullet(x,y,angle,speed,"shard",SHARD_R);if(b)b.fragile=true;return b;
  }
  // Any player shot that touches a fragile round (shard, mirror missile) breaks
  // it; the shot is spent unless it pierces. Shards are binned by column.
  _breakFragile() {
    let cols=null;
    for(const b of this.bullets) {
      if(b.dead||!b.fragile)continue;
      const c=Math.floor(b.x/SHARD_CELL);if(c<-1||c>23)continue;
      ((cols||=[])[c+1]||=[]).push(b);
    }
    if(!cols)return;
    let broke=0;
    for(const shot of this.shots) {
      if(shot.dead)continue;
      const c=Math.floor(shot.x/SHARD_CELL)+1,reach=shot.hitR||shot.r;
      let spent=false;
      for(let k=c-1;k<=c+1&&!spent;k++) {
        const list=cols[k];if(!list)continue;
        for(const b of list) {
          if(b.dead)continue;
          const dx=b.x-shot.x,dy=b.y-shot.y,r=reach+b.r;
          if(dx*dx+dy*dy>=r*r)continue;
          b.dead=true;broke++;this._particle(b.x,b.y,0,0,.2,4,"white","spark");
          if(!this._pierces(shot)){shot.dead=true;spent=true;break;}
        }
      }
    }
    if(!broke)return;
    this._shardBroken+=broke;this._awardScore(10*broke);
    if(this._cueReady("shardBreak",.1)){this._event("shardBreak",this.player.x,this.player.y-120,this._shardBroken);this._shardBroken=0;}
  }
  // A shard curtain: rows of shards from the top edge with void studs (never
  // shootable), no gap of its own: the pilot carves a lane with any weapon.
  _spawnShardCurtain(rows) {
    // Void studs every fifth slot (every fourth in the elite tier).
    const studs=[],speed=this._vel(SHARD_SPEED),every=this.threat>=SECTOR_SIX_ELITE?4:5;
    for(let r=0;r<rows;r++) {
      const y=-24-r*70,shift=r%2?13:0,stud=this._range(0,5)|0;
      for(let x=14+shift,k=0;x<=526;x+=27,k++) {
        if((k+stud)%every===0){this._bullet(x,y,Math.PI/2,speed,"void",5);studs.push(x);}
        else this._shard(x,y,Math.PI/2,speed);
      }
    }
    this.events.push({type:"shardCurtain",x:270,y:0,value:rows,speed});
  }
  _spawnSatellite(dir,y,lead,delay) {
    const e=this._enemy("satellite",dir>0?-30:570,y,{dir,vx:dir*SATELLITE_SPEED,vy:0,delay,fireAt:1.2});
    e.baseY=y;this._tagDrop(e,lead);
    this.events.push({type:"satelliteEnter",x:dir>0?0:540,y,value:dir,delay});
    return e;
  }
  _updateSatellite(e,h,p) {
    e.hidden=e.age<0;if(e.hidden)return;
    const laser=e.laserId?this.hazards.find(hz=>hz.id===e.laserId):null;
    if(laser&&laser.state!=="off")e.anchored=true;
    else {
      // Elite tier: the beam sweeps straight back once (a return pass, same warning).
      if(laser&&e.returnPass&&this.threat>=SECTOR_SIX_ELITE&&!this.boss)this._satelliteReturn(e,laser);
      else {e.anchored=false;e.laserId=0;e.returnPass=false;}
    }
    // Fast onto the field, then the slow crossing.
    const entering=e.dir>0?e.x<70:e.x>470;
    if(!e.anchored){e.x+=e.vx*(entering?3:1)*h;e.y=e.baseY+Math.sin(e.age*.9)*6;}
    e.angle=Math.atan2(-e.vx,0);
    if(!e.anchored&&e.age>=e.fireAt&&e.x>50&&e.x<490&&Math.abs(p.x-e.x)<240&&p.y-e.y>260) {
      this._satelliteSweep(e,p);e.fireAt=e.age+e.fireRate*this._pace();
    }
  }
  // One rotating sweep. At the ship's altitude the beam starts SAT_LEAD px to
  // one side of the ship and turns across it toward the roomier side, covering
  // at most SAT_SPAN px, so an open run of SAT_GAP_MIN px or more always lies
  // ahead of it (and behind the start line while it only warns).
  _satelliteSweep(e,p) {
    // edge: how close this airframe can fly to the field's side (as in _movePlayer).
    const pivotX=e.x,pivotY=e.y+14,dy=p.y-pivotY,edge=p.shipId==="wraith"?62:p.shipId==="manta"?52:46;
    const sd=p.x>270?-1:1;             // screen direction of the sweep at the ship's altitude
    const startX=this._clamp(p.x-sd*SAT_LEAD,edge,540-edge);
    // The clear gap (beam edge plus a ship radius to the field edge) stays SAT_GAP_MIN or more.
    const clear=SAT_GAP_MIN+SAT_LASER_WIDTH+9,limit=sd>0?540-edge-clear:edge+clear;
    let endX=startX+sd*SAT_SPAN;
    endX=sd>0?Math.min(endX,limit):Math.max(endX,limit);
    // The turn rate grows with the rank: SAT_SWEEP_LOW at threat .6 or less, SAT_SWEEP from .84.
    const rate=SAT_SWEEP_LOW+(SAT_SWEEP-SAT_SWEEP_LOW)*this._clamp((this.threat-.6)/.24,0,1);
    let a0=Math.atan2(dy,startX-pivotX),a1=Math.atan2(dy,endX-pivotX);
    // The wedge widens below the ship: hold the gap 80 px lower too.
    const yl=Math.min(860,p.y+80);
    const xl=pivotX+(yl-pivotY)*Math.cos(a1)/Math.sin(a1);
    if(sd>0?xl>limit:xl<limit)a1=Math.atan2(yl-pivotY,limit-pivotX);
    // A short sweep turns slower rather than overshoot its end (the beam lives 0.5 s or more).
    const on=Math.max(.5,Math.abs(a1-a0)/rate),sweep=(a1-a0)/on;
    const bar={id:++this._hazardId,kind:"laser",rotating:true,orient:"r",pos:0,from:0,to:SAT_LASER_LEN,len:SAT_LASER_LEN,
      width:SAT_LASER_WIDTH,warn:SAT_WARN,on,age:0,state:"warn",void:false,frame:this._hazardId,
      pivotX,pivotY,angle:a0,angle0:a0,angle1:a0+sweep*on,sweep,ownerId:e.id,lead:true,count:1,
      span:[Math.min(startX,endX),Math.max(startX,endX)],spanY:p.y};
    this.hazards.push(bar);e.laserId=bar.id;e.sweep=sweep;e.anchored=true;e.returnPass=true;
    this.events.push({type:"laserWarn",x:pivotX,y:pivotY,orient:"r",pos:a0,value:false,count:1,rotating:true,
      angle:a0,pivotX,pivotY,sweep,on,bars:[{orient:"r",pos:a0,from:0,to:SAT_LASER_LEN}]});
  }
  // The return pass: from where the last sweep ended, back across at the same rate.
  _satelliteReturn(e,last) {
    const a0=last.angle1,sweep=-last.sweep,on=last.on;
    const bar={...last,id:++this._hazardId,frame:this._hazardId,age:0,state:"warn",angle:a0,angle0:a0,angle1:a0+sweep*on,sweep,
      span:[...last.span],returnPass:true};
    this.hazards.push(bar);e.laserId=bar.id;e.sweep=sweep;e.anchored=true;e.returnPass=false;
    this.events.push({type:"laserWarn",x:bar.pivotX,y:bar.pivotY,orient:"r",pos:a0,value:false,count:1,rotating:true,
      angle:a0,pivotX:bar.pivotX,pivotY:bar.pivotY,sweep,on,returnPass:true,bars:[{orient:"r",pos:a0,from:0,to:SAT_LASER_LEN}]});
  }
  _spawnStation(drops) {
    const c=STATION_CLASS,st=this._enemy("station",270,-c.h-16,{});
    if(drops?.heavy)this._tagDrop(st,drops.heavy.length===1?drops.heavy[0]:[...drops.heavy]);
    [[-140,4,"mix"],[-72,36,"shard"],[0,-28,"void"],[72,36,"shard"],[140,4,"mix"],[0,52,"void"]].forEach(([ox,oy,gun],i)=>{
      const t=this._enemy("stationTurret",270+ox,st.y+oy,{parent:st,ox,oy,gun,fireAt:1+i*.33,
        fireRate:gun==="mix"?2.8:gun==="void"?3:2});
      this._tagDrop(t,drops?.turrets?.[i]);
    });
    this._event("stationEnter",270,0,6);
    return st;
  }
  _updateStation(e,h) {
    const c=STATION_CLASS;
    if(e.state==="enter"){e.y+=c.vy*h;if(e.y>=c.holdY){e.y=c.holdY;e.state="hold";e.holdUntil=e.age+c.hold;}}
    else if(e.state==="hold"){if(e.age>=e.holdUntil)e.state="leave";}
    else e.y+=c.leaveVy*h;
    e.x=270+Math.sin(e.age*.35)*10;
  }
  _stationTurretFire(e,p) {
    const v=this._volley();
    if(e.gun==="shard")this._spreadShards(e.x,e.y+8,p.x,p.y,7+Math.round(2*v),.12,this._vel(150));
    else if(e.gun==="void")this._spread(e.x,e.y+8,p.x,p.y,this.threat>=SECTOR_SIX_ELITE?5:3,.16,this._vel(195),"void",5.6);
    else {
      const n=12+Math.round(2*v),off=e.age*.6;
      for(let i=0;i<n;i++){const a=off+i/n*Math.PI*2;if(i%3===0)this._bullet(e.x,e.y,a,this._vel(125),"void",5);else this._shard(e.x,e.y,a,this._vel(125));}
    }
  }
  // A shard wall fanned around `angle` (not aimed): something to carve through.
  _radialShards(x,y,count,speed,angle,step) {
    for(let i=0;i<count;i++)this._shard(x,y,angle+(i-(count-1)/2)*step,speed);
  }
  _spreadShards(x,y,tx,ty,count,step,speed) {
    const a=Math.atan2(ty-y,tx-x);
    for(let i=0;i<count;i++)this._shard(x,y,a+(i-(count-1)/2)*step,speed);
  }
  _updateSectorSixEnemy(e,h,p) {
    const t=e.type;
    if(t==="echo")this._updateEcho(e,h,p);
    else if(t==="satellite")this._updateSatellite(e,h,p);
    else if(t==="station")this._updateStation(e,h);
    else if(t==="stationTurret") {
      const parent=this._enemyById(e.parentId);
      if(!parent||parent.dead){this._loseChild(e,parent);return;}
      e.x=parent.x+e.ox;e.y=parent.y+e.oy;
      this._slewAim(e,p,h,2.6);
      if(e.age>=e.fireAt&&e.y>30&&e.y<Math.min(640,p.y-140)) {
        this._stationTurretFire(e,p);e.fireAt=e.age+e.fireRate*this._pace();
      }
    } else if(t==="mirrorEscort") {
      const parent=this._enemyById(e.parentId);
      if(!parent||parent.dead){this._loseChild(e,parent);return;}
      e.x=parent.x+e.ox+Math.sin(e.age*1.7+e.slot)*6;e.y=parent.y+e.oy+Math.cos(e.age*1.3+e.slot)*4;e.angle=parent.angle||0;
      if(parent.age>=3.6&&e.age>=e.fireAt&&e.y<p.y-140) {
        this._mirrorEscortFire(e,p);e.fireAt=e.age+e.fireRate*this._sovereignPace();
      }
    } else if(t==="tether")this._updateTether(e,h);
  }
  // A light copy of the player's escort weapon (cannon pairs, rockets, rails).
  _mirrorEscortFire(e,p) {
    if(e.style==="kestrel")for(const dx of [-4,4])this._bullet(e.x+dx,e.y+10,Math.PI/2+e.side*.04,this._vel(240),"mirror",4.2);
    else if(e.style==="manta")this._aimed(e.x,e.y+10,p.x,p.y,this._vel(205),"mirror",5);
    else for(let i=0;i<2;i++)this._bullet(e.x,e.y+10+i*16,Math.PI/2,this._vel(320),"mirror",4);
  }

  // ---- THE SOVEREIGN (stage 6): reflection, theft, ballet -----------------
  _sovereignMercy() {
    const f=(this.player.arsenal-SOVEREIGN_MERCY_LOW)/(SOVEREIGN_MERCY_FULL-SOVEREIGN_MERCY_LOW);
    return SOVEREIGN_MERCY_FLOOR+(1-SOVEREIGN_MERCY_FLOOR)*this._clamp(Number.isFinite(f)?f:0,0,1);
  }
  _sovereignPace() {
    const ease=t=>this._clamp((HALCYON_EASE_FROM-t)/HALCYON_EASE_SPAN,0,1);
    return this._bossPace()*(1+SOVEREIGN_EASE_SPAWN*ease(this.boss?.easeThreat??this.threat)+SOVEREIGN_EASE_LIVE*ease(this.threat));
  }
  _sovereignRank() { return this._clamp((this.threat-SOVEREIGN_RANK_FROM)/(SOVEREIGN_RANK_FULL-SOVEREIGN_RANK_FROM),0,1); }
  // Power band of the copied weapon: 0 below power 20, 1 below 40, 2 from 40.
  _mirrorBand() { const l=this.player.level;return l>=40?2:l>=20?1:0; }
  _rigSovereign(boss) {
    const p=this.player,n=Math.min(MAX_ESCORTS,p.escorts);
    Object.assign(boss,{sovereign:true,easeThreat:this.threat,style:p.weaponType,ship:p.shipId,escorts:[],escortsAlive:0,
      rank:this._sovereignRank(),
      weapons:[],grown:0,mirror:0,ballet:0,mirrorAt:0,echoAt:5,aimAt:0,shardAt:0,ringAt:0,rowAt:0,curtainAt:0,curtainGap:150,
      echoes:0});
    for(let i=0;i<n;i++) {
      const side=i%2?1:-1,row=Math.floor(i/2);
      this._enemy("mirrorEscort",boss.x+side*(118+row*36),boss.y+26+row*26,{parent:boss,slot:i,side,rank:row,
        ox:side*(118+row*36),oy:26+row*26,style:p.shipId,hp:SOVEREIGN_ESCORT_HP,fireAt:4+i*.4,fireRate:1.9-.75*this._sovereignRank(),
        drop:"power",bonusDrops:1,value:3000});
    }
    this._event("mirrorCopy",boss.x,boss.y,boss.style);
    Object.assign(this.events[this.events.length-1],{escorts:n,band:this._mirrorBand(),ship:p.shipId});
  }
  _sovereignEnterPhase(e) {
    this._clearHazards();
    if(e.phase===2){e.mirrorAt=e.age+2.4;e.aimAt=e.age+1.6;e.shardAt=e.age+3;}
    else if(e.phase===3){e.ringAt=e.age+1.2;e.rowAt=e.age+2.2;e.mirrorAt=e.age+3.4;e.curtainAt=0;}
    this._event("sovereignPhase",e.x,e.y,e.phase);
  }
  // Theft: phase 2 sends a hit's salvage up tethers instead of letting it float.
  _theft() { const b=this.boss;return !!(b&&b.sovereign&&!b.dead&&b.phase===2); }
  _sovereignFire(e,h) {
    const p=this.player,pace=this._sovereignPace();
    e.mirror=Math.min(1,e.mirror+h/1.4);
    if(e.phase===3)e.ballet=Math.min(1,e.ballet+h/1.5);
    if(e.age<3.6)return;
    const desperate=e.phase===3&&e.guard;
    // Echo pairs (its language): one carries rescue power for a stripped ship.
    if(!desperate&&e.age>=e.echoAt) {
      e.echoes++;
      // The rescue echo is a close shadow (0.5 s behind, straight above the ship), so
      // any gun finds it; its partner replays the full 2.5 s, mirrored.
      this._spawnEchoes([[1,0,300,.5],[-1,-40,400]],null,true,.3,{bonus:false,x0:e.x,y0:e.y+30});
      // A stripped ship meets them more often: its rescue power rides the straight copy.
      const rebuild=.4+.6*this._clamp(this.threat/RESCUE_THREAT_S6,0,1);
      e.echoAt=e.age+SOVEREIGN_ECHO_CYCLE*rebuild*this._bossPace()*(e.phase===3?1.3:1);
    }
    if(e.phase===1) {
      if(e.age>=e.mirrorAt){this._sovereignMirror(e);e.mirrorAt=e.age+this._mirrorCycle(e)*pace;}
      // The core joins in once the escorts fall; a ranked arrival meets it from the
      // start, as void rounds from rank 0.5.
      if((e.rank>0||!e.escortsAlive)&&e.age>=e.aimAt) {
        this._mixedSpread(e.x,e.y+50,e.rank>=.75?5:3,e.rank>=.5);
        e.aimAt=e.age+(e.escortsAlive?3.8-1.6*e.rank:2.6)*pace;this._event("bossShot",e.x,e.y);
      }
    } else if(e.phase===2) {
      // One volley clock, so the layers take turns instead of converging:
      // the copied gun, then crossing shard walls from the wings, then an aimed spread.
      if(e.age>=e.mirrorAt) {
        const k=e.volley2=(e.volley2||0)+1;
        if(k%3===1)this._sovereignMirror(e);
        else if(k%3===2)for(const side of [-1,1])this._radialShards(e.x+side*150,e.y+20,7,this._vel(150),Math.PI/2+side*.42,.12);
        else {this._mixedSpread(e.x,e.y+50,e.rank>=.75?5:3,e.rank>=.5);this._event("bossShot",e.x,e.y);}
        e.mirrorAt=e.age+(1.1-.35*e.rank)*pace;
      }
      this._sovereignGrown(e,pace);
    } else {
      // The ballet: void rings, shard rows and the mirrored main gun in layers;
      // on the final guard floor the desperation curtain (shard rows, drifting gaps).
      if(e.age>=e.ringAt) {
        // Void and red alternate against a void-aware ship (two void to one red
        // from rank 0.75); every other ship meets void and red half and half.
        const n=desperate?12:12+2*Math.round(2*e.rank),off=e.age*.37,third=e.rank>=.75&&this._voidAware();
        for(let i=0;i<n;i++){const red=!desperate&&(third?i%3===1:i%2===1);this._bullet(e.x,e.y+30,off+i/n*Math.PI*2,this._vel(105),red?"red":"void",red?4.8:5.2);}
        e.ringAt=e.age+(desperate?3.8:2.6)*pace;this._event("bossShot",e.x,e.y);
      }
      if(!desperate) {
        if(e.age>=e.rowAt){this._sovereignShardRow(e,null);e.rowAt=e.age+(2.2-.6*e.rank)*pace;}
        if(e.age>=e.mirrorAt){this._sovereignMirror(e);e.mirrorAt=e.age+this._mirrorCycle(e)*1.3*pace;}
        this._sovereignGrown(e,pace);
      } else if(e.age>=e.curtainAt) {
        e.curtainGap=this._clamp(e.curtainGap+(this._rand()<.5?-1:1)*this._range(40,80),70,230);
        this._sovereignShardRow(e,[e.curtainGap,e.curtainGap+240]);
        e.curtainAt=e.age+.85;this._event("bossShot",e.x,e.y);
      }
    }
  }
  // An aimed spread whose outer rounds are void (from rank 0.5) against a
  // void-aware ship (orbitals or a reflector: Act II's counter to a maxed kit);
  // the aimed centre stays red, so flak and orbitals still earn their keep.
  _mixedSpread(x,y,count,voidMix) {
    const p=this.player,a=Math.atan2(p.y-y,p.x-x),speed=this._vel(voidMix?225:245),aware=this._voidAware();
    for(let i=0;i<count;i++) {
      const v=voidMix&&aware&&(i===0||i===count-1);
      this._bullet(x,y,a+(i-(count-1)/2)*.13,speed,v?"void":"red",v?5.6:4.8);
    }
  }
  _mirrorCycle(e) { return e.style==="spread"?1.6:e.style==="missile"?1.8:2.1; }
  // The copied main gun, tiered by the player's power band.
  _sovereignMirror(e) {
    const p=this.player,band=this._mirrorBand();
    if(e.style==="spread") {
      // Kestrel's copy is glass: fragile mirror rounds its own spread can cancel.
      const n=[5,7,9][band],off=Math.sin(e.age*.8)*.08;
      for(let i=0;i<n;i++){const b=this._bullet(e.x,e.y+50,off+Math.PI*.3+i/n*Math.PI*.4,this._vel(170),"mirror",4.6);if(b)b.fragile=true;}
    } else if(e.style==="missile") {
      const n=[2,3,5][band];
      for(let i=0;i<n;i++){const side=i===4?0:i%2?1:-1,rank=Math.floor(i/2);
        // Launched wide, so they flank in from the sides instead of down the gun line.
        this._mirrorMissile(e.x+side*(48+rank*40),e.y+36,Math.PI/2+side*(.95+rank*.25),this._vel(175),2.6);}
    } else {
      // Rails at the ship's x (one), then 120 px steps (two), then two pairs 120 px
      // apart either side of the ship (four): every gap stays 100 px or more.
      const n=[1,2,4][band],frame=++this._hazardId,bars=[];
      const xs=n===1?[p.x]:n===2?[p.x,p.x+(p.x<270?120:-120)]:[p.x-60,p.x+60,p.x-180,p.x+180];
      for(const x of xs)bars.push(this._mirrorRail(x,e.y+e.h*.6,.75,.3,e.id,frame));
      bars[0].lead=true;bars[0].count=bars.length;
      this.events.push({type:"laserWarn",x:bars[0].pos,y:450,orient:"v",pos:bars[0].pos,value:false,mirror:true,count:bars.length,
        bars:bars.map(b=>({orient:"v",pos:b.pos,from:b.from,to:b.to}))});
    }
    this._event("bossShot",e.x,e.y);
  }
  // A full-width shard row with void studs; `gaps` (the desperation curtain) leaves two open lanes.
  _sovereignShardRow(e,gaps) {
    const speed=gaps?170:this._vel(140),y=e.y+60,stud=6-Math.round(2*(e.rank||0));
    for(let x=16,k=0;x<=524;x+=24,k++) {
      if(gaps&&gaps.some(g=>Math.abs(x-g)<46))continue;
      // Void studs every 6th slot at rank 0, every 4th at rank 1.
      if(!gaps&&k%stud===2)this._bullet(x,y,Math.PI/2,speed,"void",5);else this._shard(x,y,Math.PI/2,speed);
    }
  }
  // Grown weapons: each landed tether arms one mount (up to SOVEREIGN_WEAPONS_MAX).
  _sovereignGrown(e,pace) {
    const p=this.player;
    for(const w of e.weapons) {
      if(e.age<w.fireAt)continue;
      const x=e.x+w.ox,y=e.y+40;
      if(w.type==="power")this._spread(x,y,p.x,p.y,3,.1,this._vel(240),"mirror",4.6);
      else if(w.type==="escort")for(const dx of [-10,-4,4,10])this._bullet(x+dx,y,Math.PI/2,this._vel(240),"mirror",4.2);
      else if(w.type==="sidewinder")for(const s of [-1,1])this._mirrorMissile(x+s*10,y,Math.PI/2+s*.5,this._vel(150),1.6);
      else this._spreadShards(x,y,p.x,p.y,8,.12,this._vel(150));
      w.fireAt=e.age+3.6*pace;
    }
  }
  // Salvage tokens grouped by type, one tether each, rising to the hull.
  _launchTethers(tokens,x,y) {
    const boss=this.boss,groups=[];
    for(const t of tokens){const g=groups.find(o=>o.type===t.type);if(g)g.value+=t.value;else groups.push({type:t.type,value:t.value});}
    groups.forEach((g,i)=>{
      const k=i-(groups.length-1)/2;
      this._enemy("tether",this._clamp(x+k*26,24,516),this._clamp(y,70,860),{parent:boss,ox:k*44,bow:k*90,
        carrying:{type:g.type,value:g.value,life:SALVAGE_LIFE},hp:TETHER_HP,noScale:true});
      this.events.push({type:"tetherLaunch",x,y,value:g.type,amount:g.value,time:TETHER_TIME});
    });
  }
  _updateTether(e,h) {
    const boss=this._enemyById(e.parentId);
    if(!boss||boss.dead){this._cutTether(e,true);e.dead=true;return;}
    e.progress=Math.min(1,e.progress+h/TETHER_TIME);
    const t=e.progress,tx=boss.x+e.ox,ty=boss.y+boss.h*.55;
    const mx=(e.x0+tx)/2+e.bow,my=(e.y0+ty)/2;
    const ox=e.x,oy=e.y;
    e.x=(1-t)*(1-t)*e.x0+2*(1-t)*t*mx+t*t*tx;e.y=(1-t)*(1-t)*e.y0+2*(1-t)*t*my+t*t*ty;
    e.tx=tx;e.ty=ty;
    if(h>0)e.angle=Math.atan2(-(e.x-ox),e.y-oy);
    if(t>=1) {
      // Gone for good: the SOVEREIGN grows a weapon from it.
      const c=e.carrying;e.carrying=null;e.dead=true;
      this.stats.salvageLost+=c.value||1;
      this.events.push({type:"tetherLost",x:tx,y:ty,value:c.type,amount:c.value});
      this._sovereignGrow(boss,c.type);
    }
  }
  // A cut tether drops its salvage back into play (salvage: true).
  _cutTether(e,quiet=false) {
    const c=e.carrying;if(!c)return;
    e.carrying=null;
    this.pickups.push({id:++this._pickupId,x:this._clamp(e.x,SALVAGE_BOUNDS.left,SALVAGE_BOUNDS.right),
      y:this._clamp(e.y,SALVAGE_BOUNDS.top,SALVAGE_BOUNDS.bottom),r:18,type:c.type,age:SALVAGE_GRACE,
      vx:0,vy:60,salvage:true,value:c.value,life:Math.max(5,c.life||0)});
    this.events.push({type:"tetherCut",x:e.x,y:e.y,value:c.type,amount:c.value,quiet});
  }
  _sovereignGrow(boss,type) {
    boss.grown++;
    if(boss.weapons.length<SOVEREIGN_WEAPONS_MAX) {
      const slots=[-150,150,-80,80],ox=slots[boss.weapons.length];
      boss.weapons.push({type,ox,fireAt:boss.age+1.5});
    }
    this.events.push({type:"sovereignGrow",x:boss.x,y:boss.y,value:type,count:boss.weapons.length,grown:boss.grown});
  }
  _updateEnemies(h) {
    const p=this.player;
    for(const e of this.enemies) {
      e.age+=h;e.flash=Math.max(0,e.flash-h*5);
      e.impactCooldown=Math.max(0,(e.impactCooldown||0)-h);
      e.burstCooldown=Math.max(0,(e.burstCooldown||0)-h);
      if(e.type==="boss") {
        if(e.leviathan) {
          // A super-dreadnought: slow entrance, a narrow sway, a gentle roll.
          // The sway keeps bow, stern and the rolled-out broadside inside the
          // 540 field (270 +/- (20 + 210 + 22)).
          const entrance=Math.min(1,e.age/3.4);
          e.y=-210+(1-(1-entrance)**3)*400;
          e.x=270+Math.sin(Math.max(0,e.age-3.4)*.32)*LEVIATHAN_SWAY;
          e.angle=Math.sin(e.age*.7)*.015;
        } else if(e.halcyon) {
          // A flying wing: a long glide in, a slow sway, a gentle bank.
          const entrance=Math.min(1,e.age/3.4);
          e.y=-190+(1-(1-entrance)**3)*400;
          e.x=270+Math.sin(Math.max(0,e.age-3.4)*.3)*HALCYON_SWAY;
          e.angle=Math.sin(e.age*.6)*.02;
        } else if(e.sovereign) {
          // A mirror capital ship: a slow descent, a measured sway, a level keel.
          const entrance=Math.min(1,e.age/3.4);
          e.y=-200+(1-(1-entrance)**3)*400;
          e.x=270+Math.sin(Math.max(0,e.age-3.4)*.28)*SOVEREIGN_SWAY;
          e.angle=Math.sin(e.age*.5)*.015;
        } else {
        const entrance=Math.min(1,e.age/2.8);
        e.y=-145+(e.age<2.8?(1-(1-entrance)**3)*430:430);
        e.x=270+Math.sin((e.age-2.8)*(.48+this.stage*.09))*(78+this.stage*4);
        e.angle=Math.sin(e.age*1.2)*.05;
        }
        this._updateBossGuard(e,h);
        const unlocked=this._bossUnlocked(e);
        const phase=e.phase===1&&e.hp<e.maxHp*.66&&unlocked?2:
          e.phase===2&&e.hp<e.maxHp/3&&unlocked?3:e.phase;
        if(phase>e.phase) {
          if(e.guard)this._event("bossGuardEnd",e.x,e.y,e.phase);
          e.guard=false;e.guardUntil=0;
          e.phase=phase;e.phaseStart=e.age;this.flash=Math.max(this.flash,.35);this.shake=Math.max(this.shake,6);
          // A flare and brief ceasefire tell the player that the pattern changed.
          e.fireAt=e.age+1.15;this.bullets.length=0;
          this._burst(e.x,e.y,50,"magenta",230,"phase");
          this._particle(e.x,e.y,0,0,.65,10,"magenta","ring");
          this._event("bossPhase",e.x,e.y,phase);
          if(e.leviathan)this._leviathanEnterPhase(e);
          else if(e.halcyon)this._halcyonEnterPhase(e);
          else if(e.sovereign)this._sovereignEnterPhase(e);
          // Act I: a phase break is a recovery opportunity for a kit below
          // the sector's entitlement (a clean collector gets nothing).
          else if(this.stage<ACT_TWO_STAGE) {
            const tokens=this._actOneRecovery(e,[]);
            if(tokens.length)this._dropMany(e.x,e.y+40,tokens);
          }
        }
        if(e.phase===3&&e.guard&&this._bossUnlocked(e)) {
          e.guard=false;e.guardUntil=0;
          this._event("bossGuardEnd",e.x,e.y,3);
        }
        if(this.stage===2&&e.phase>=2){
          if(e.reactor?.phase!==e.phase){
            const side=e.phase===2?-1:1,maxHp=e.phase===2?120:160;
            e.reactor={id:-e.id*10-e.phase,phase:e.phase,side,hp:maxHp,maxHp,r:22,opensAt:e.age+.9};
            this._event('reactorOpen',e.x,e.y,side);
          }
          const r=e.reactor,angle=e.angle||0;
          // The arm extends into a side position during the opening cue.
          // Holding the central firing line must not also collect both targets.
          const extension=1-(1-this._clamp((e.age-r.opensAt+.9)/.9,0,1))**3;
          const wingX=e.x+r.side*126*Math.cos(angle)-24*Math.sin(angle);
          const wingY=e.y+r.side*126*Math.sin(angle)+24*Math.cos(angle);
          r.x=wingX+((r.side<0?108:432)-wingX)*extension;
          r.y=wingY+(e.y+58-wingY)*extension;
        }
        if(this.stage===3&&e.phase>=2)this._updateBossLance(e);
        if(e.leviathan)this._leviathanFire(e,h);
        else if(e.halcyon)this._halcyonFire(e,h);
        else if(e.sovereign)this._sovereignFire(e,h);
        else if(e.age>2.8&&e.age>=e.fireAt) {
          this._bossFire(e);
          e.fireAt=e.age+BOSS_CADENCE[this.stage][e.phase-1]*ACT_ONE_BOSS_PACE_BASE/(1+ACT_ONE_BOSS_PACE_K*this.threat);
        }
      } else if(ACT_TWO_TYPES.has(e.type)) this._updateActTwoEnemy(e,h,p);
      else {
        e.x=e.baseX+e.vx*e.age+e.turnVx*Math.max(0,e.age-e.turnAt)+e.amp*Math.sin(e.age*e.freq+e.phase);
        e.y+=e.vy*h;
        e.angle=Math.atan2(e.vx+(e.age>e.turnAt?e.turnVx:0)+e.amp*e.freq*Math.cos(e.age*e.freq+e.phase),e.vy)*.35;
        if(e.age>=e.fireAt&&e.y>20&&e.y<680) {
          this._enemyFire(e,p);
          e.fireAt=e.age+e.fireRate*(this.stage<ACT_TWO_STAGE?ACT_ONE_STAGE_PACE[this.stage]*this._actOnePace():1-(this.stage-1)*.08);
        }
      }
    }
  }
  _updateBossLance(boss) {
    let l=boss.lance;
    if(!l||l.phase!==boss.phase||boss.age>=l.nextAt){
      const startsAt=boss.age+.35;
      l=boss.lance={phase:boss.phase,x:this._clamp(this.player.x,64,476),y:boss.y+110,width:48,
        startsAt,locksAt:startsAt+.65,firesAt:startsAt+1.5,endsAt:startsAt+1.95,nextAt:startsAt+(boss.phase===3?3.5:4.1)};
    }
    l.y=boss.y+110;
    if(boss.age<l.locksAt)l.x=this._clamp(this.player.x,64,476);
    if(!l.cancelled&&boss.age>=l.locksAt&&!l.locked){l.locked=true;this._event('lanceLock',l.x,l.y);}
    if(!l.cancelled&&boss.age>=l.firesAt&&!l.fired){l.fired=true;this._event('lanceFire',l.x,l.y);}
    l.active=!l.cancelled&&boss.age>=l.firesAt&&boss.age<l.endsAt;
  }
  // Act I sources read the threat rank: cooldowns (_actOnePace), bullet
  // speed (+12% at threat 1) and, past each type's gate, a bigger volley.
  // Sector 4's borrowed Act I craft keep their authored fire.
  _actOnePace() { return ACT_ONE_PACE_BASE/(1+ACT_ONE_PACE_K*this.threat); }
  // A beat's drops for the current ship (STAGE_BEATS `wraith` overrides).
  _beatDrops(drops) { return drops?.wraith&&this.player.shipId==="wraith"?{...drops,...drops.wraith}:drops; }
  // Act I entitlement: the sector's entry row plus every authored item (and
  // rescue power) of the beats flown so far.
  _actOneOwed(wholeSector=false) {
    const owed={...ACT_ONE_ENTRY[this.stage]},beats=STAGE_BEATS[this.stage];
    for(let i=0;i<(wholeSector?beats.length:this._beatIndex)&&i<beats.length;i++) {
      const d=this._beatDrops(beats[i][2]);if(!d)continue;
      for(const type of [].concat(d.lead||[],d.heavy||[]))if(type in owed)owed[type]++;
      if(d.rescue)owed.power++;
    }
    return owed;
  }
  // What the pilot holds or can still catch: the kit, live salvage and
  // pickups, drops still riding enemies, and a kill's pending fan.
  _actOneHeld(pending=[]) {
    const p=this.player,held={power:p.level,escort:p.escorts/2,sidewinder:p.sidewinder,signature:p.signature};
    const add=(type,n)=>{if(type in held)held[type]+=n;};
    for(const item of this.pickups)if(!item.dead)add(item.type,Math.max(1,Math.floor(item.value||1)));
    for(const e of this.enemies) {
      if(e.dead)continue;
      if(e.drop)for(const type of [].concat(e.drop))add(type,1);
      if(e.rescue&&this.threat<RESCUE_THREAT)add("power",1);
    }
    for(const entry of pending)add(entry.type||entry,entry.value||1);
    return held;
  }
  // Act I mercy factor (HP scale) for a kit short of its entitlement, in
  // arsenal levels; 1 for a kit at or above the ledger.
  _actOneMercy(wholeSector=false) {
    if(!ACT_ONE_ENTRY[this.stage])return 1;
    const owed=this._actOneOwed(wholeSector),held=this._actOneHeld();
    const level=k=>k.power+2*k.escort+1.5*k.sidewinder+1.5*k.signature;
    return Math.max(ACT_ONE_MERCY_FLOOR,1-ACT_ONE_MERCY_PER_LEVEL*Math.max(0,level(owed)-level(held)));
  }
  // The recovery tokens a rescue or recovery lead adds to its kill's fan.
  _actOneRecovery(e,pending) {
    if(this.practiceStage||!ACT_ONE_ENTRY[this.stage])return [];
    const owed=this._actOneOwed(),held=this._actOneHeld(pending),out=[];
    const order=this.player.shipId==="wraith"?ACT_ONE_RECOVER_ORDER_WRAITH:ACT_ONE_RECOVER_ORDER;
    const type=order.find(t=>held[t]<owed[t]);
    if(type)out.push({type,recovery:true});
    const short=owed.power-held.power;
    if(short>ACT_ONE_RECOVER_SLACK)out.push({type:"power",value:Math.min(ACT_ONE_RECOVER_MAX,Math.ceil((short-ACT_ONE_RECOVER_SLACK)/ACT_ONE_RECOVER_STEP)),recovery:true});
    return out;
  }
  _enemyFire(e,p) {
    const actOne=this.stage<ACT_TWO_STAGE,t=actOne?this.threat:0;
    const speed=(160+this.stage*18)*(1+ACT_ONE_SPEED*t);
    const big=actOne&&t>=(ACT_ONE_GATES[e.type]??9),small=actOne&&t<ACT_ONE_SMALL;
    if(e.type==="scout") {
      if(big)this._spread(e.x,e.y+14,p.x,p.y,2,.09,speed,"red",4.5);
      else this._aimed(e.x,e.y+14,p.x,p.y,speed,"red",4.5);
    }
    else if(e.type==="wing") this._spread(e.x,e.y+15,p.x,p.y,big?7:small?3:5,big?.1:small?.14:.115,speed+5,"amber",4.5);
    else if(e.type==="bomber") this._spread(e.x,e.y+20,p.x,p.y,big?9:small?5:7,big?.105:.12,speed-20,"rose",5);
    else if(e.type==="ace") this._spread(e.x,e.y+20,p.x,p.y,big?5:3,big?.085:.1,speed+75,"cyan",4);
    else if(e.type==="turret") this._spread(e.x,e.y+15,p.x,p.y,big?7:small?3:5,big?.18:.22,speed-35,"magenta",5);
    else if(e.type==="carrier") this._radial(e.x,e.y,big?12:small?7:9,speed-35,e.age*.7,"amber",5);
    else if(e.type==="mini") {
      this._radial(e.x,e.y,big?16:small?9:12,speed-15,e.age*.5,"magenta",5);
      this._spread(e.x,e.y+20,p.x,p.y,big?5:3,.12,speed+25,"red",5);
    }
  }
  _bossFire(e) {
    const p=this.player,phase=e.phase,stage=this.stage;
    const salvo=e.salvo=(e.salvo||0)+1;
    const speed=140+stage*14+phase*8;
    const sway=Math.sin(e.age*.8)*.09;
    if(stage===1) {
      // Vesper sweeps broad amber tide fans, then splits fire between wing cannons.
      if(phase===1) {
        this._radial(e.x,e.y+30,17,speed,sway,"amber",4.8,Math.PI*.15,Math.PI*.85);
        if(salvo%2===0)for(const side of [-1,1])
          this._spread(e.x+side*58,e.y+26,p.x,p.y,3,.13,speed+65,"red",4.8);
      } else if(phase===2) {
        for(const side of [-1,1])
          this._radial(e.x+side*58,e.y+24,11,speed,side*.13+sway,"magenta",4.7,Math.PI*.17,Math.PI*.83);
        if(salvo%2===0)this._spread(e.x,e.y+48,p.x,p.y,5,.1,speed+82,"cyan",4.6);
      } else {
        this._radial(e.x,e.y+35,18,speed+18,sway,"magenta",4.8,Math.PI*.1,Math.PI*.9);
        // The counter-tide lands between magenta waves instead of stacking a
        // second full fan on every beat. Phase three still outruns phase two.
        if(salvo%2===0)this._radial(e.x,e.y+35,18,speed-24,-sway+.07,"amber",4.5,Math.PI*.1,Math.PI*.9);
        if(salvo%3===0)this._spread(e.x,e.y+48,p.x,p.y,5,.105,speed+85,"red",5);
      }
    } else if(stage===2) {
      // Aurelia's mirrored wing spirals weave around slower central volleys.
      const angle=e.age*.34;
      if(phase===1) {
        for(const side of [-1,1])
          this._radial(e.x+side*58,e.y+24,11,speed,angle*side,"cyan",4.7);
        if(salvo%3===0)this._spread(e.x,e.y+45,p.x,p.y,5,.16,speed+65,"rose",5);
      } else if(phase===2) {
        for(const side of [-1,1])
          this._radial(e.x+side*58,e.y+24,13,speed+8,angle*side,"magenta",4.7);
        this._radial(e.x,e.y+38,11,speed-25,-angle,"amber",4.4,Math.PI*.12,Math.PI*.88);
      } else {
        this._radial(e.x,e.y+35,21,speed+14,sway,"amber",4.5,Math.PI*.08,Math.PI*.92);
        if(salvo%2===0)for(const side of [-1,1]){
          if(side===1&&e.reactor?.phase===3&&e.reactor.broken)continue;
          this._radial(e.x+side*58,e.y+24,12,speed,angle*side,"cyan",4.7);
        }
        if(salvo%2===0)this._spread(e.x,e.y+48,p.x,p.y,5,.12,speed+80,"red",4.8);
      }
    } else {
      // The Crown compresses mirrored curtains into a rotating final crossfire.
      const angle=e.age*.28;
      if(phase===1) {
        this._radial(e.x,e.y+38,19,speed,Math.sin(e.age*.5)*.13,"amber",4.8,Math.PI*.08,Math.PI*.92);
        if(salvo%2===0)this._spread(e.x,e.y+48,p.x,p.y,7,.13,speed+75,"red",5);
      } else if(phase===2) {
        this._radial(e.x-60,e.y+24,14,speed,angle,"magenta",4.5);
        this._radial(e.x+60,e.y+24,14,speed,-angle,"cyan",4.5);
        if(salvo%2===0)this._spread(e.x,e.y+48,p.x,p.y,5,.11,speed+82,"red",5);
      } else {
        // The final crossfire: a magenta fan every salvo, the slower amber
        // counter-fan on alternate salvos (CROWN_FINAL_*).
        this._radial(e.x,e.y+38,CROWN_FINAL_FAN,speed+20,sway,"magenta",4.6,Math.PI*.06,Math.PI*.94);
        if(salvo%CROWN_FINAL_COUNTER_EVERY===0)this._radial(e.x,e.y+38,CROWN_FINAL_FAN,speed-28,-sway+.05,"amber",4.4,Math.PI*.06,Math.PI*.94);
        if(salvo%2===0)this._spread(e.x,e.y+48,p.x,p.y,7,.105,speed+95,"cyan",4.5);
      }
    }
    this._burst(e.x-58,e.y+24,3,"gold",55,"muzzle");
    if(!(stage===2&&phase===3&&e.reactor?.broken))this._burst(e.x+58,e.y+24,3,"gold",55,"muzzle");
    this._event("bossShot",e.x,e.y);
  }
  // Effective learn age: real age plus the time bought by guarded damage.
  _bossLearnAge(e) { return e.age+(e.learnShift||0); }
  _bossLearn() { return BOSS_LEARN_BY_STAGE[this.stage]??BOSS_LEARN_BY_STAGE[BOSS_LEARN_BY_STAGE.length-1]; }
  _bossLearnEnd(e) { return this._bossLearn()[e.phase]; }
  _bossPhaseMin(e) {
    const start=e.phase>1?this._bossLearn()[e.phase-1]:0;
    return BOSS_PHASE_MIN*(this._bossLearnEnd(e)-start);
  }
  _bossUnlocked(e) {
    return this._bossLearnAge(e)>=this._bossLearnEnd(e)&&e.age>=(e.phaseStart||0)+this._bossPhaseMin(e);
  }
  // Real boss age at which the current phase unlocks if no more damage lands.
  _bossUnlockAt(e) {
    return Math.max(this._bossLearnEnd(e)-(e.learnShift||0),(e.phaseStart||0)+this._bossPhaseMin(e));
  }
  // Damage soaked by a guard floor speeds the boss's learn clock, so a
  // stronger arsenal reaches each phase sooner. Shift is capped per phase so
  // the phase still lasts BOSS_PHASE_MIN of its authored window.
  _updateBossGuard(e,h) {
    if(!(h>0))return;
    const absorbed=e.guardAbsorb||0;e.guardAbsorb=0;
    e.absorbRate=(e.absorbRate||0)+(absorbed/e.maxHp/h-(e.absorbRate||0))*Math.min(1,h/BOSS_GUARD_SMOOTH);
    if(!e.guard)return;
    const par=BOSS_GUARD_PAR[this.stage]??BOSS_GUARD_PAR[BOSS_GUARD_PAR.length-1];
    const gain=Math.max(0,e.absorbRate-par)*(BOSS_GUARD_K_BY_STAGE[this.stage]??BOSS_GUARD_K)*h;
    const cap=this._bossLearnEnd(e)-(e.phaseStart||0)-this._bossPhaseMin(e);
    e.learnShift=e.learnShift||0;
    if(gain>0&&e.learnShift<cap)e.learnShift=Math.min(cap,e.learnShift+gain);
    e.guardUntil=this._bossUnlockAt(e);
  }
  _damageEnemy(e,amount) {
    // Armored hulls take a share of the damage while any of their turrets lives.
    if(e.type==="hull"&&e.turretsAlive>0)amount*=HULL_ARMOR;
    else if(e.type==="foundry"&&e.baysAlive>0)amount*=FOUNDRY_ARMOR;
    else if(e.type==="station"&&e.turretsAlive>0)amount*=STATION_ARMOR;
    // A stripped or bare ship can still silence a hull inside its lifetime.
    if(WEAK_KIT_TYPES.has(e.type)&&this.threat<LOW_THREAT)amount*=WEAK_KIT_TURRET_BONUS;
    if(e.type!=="boss") {e.hp-=amount;return;}
    // LEVIATHAN's deck turrets, HALCYON's bays and THE SOVEREIGN's mirror escorts armor the core.
    if(e.turretsAlive>0||e.baysAlive>0||e.escortsAlive>0)amount*=LEVIATHAN_ARMOR;
    // One threshold per learned pattern. Incoming fire still shows impacts,
    // while each phase has time to establish its distinctive attack.
    const floor=this._bossUnlocked(e)?0:(e.phase===1?Math.floor(e.maxHp*.66)-1:
      e.phase===2?Math.floor(e.maxHp/3)-1:1);
    const attempted=e.hp-amount;
    if(floor>0&&attempted<=floor) {
      if(!e.guard) {
        e.guard=true;e.guardUntil=this._bossUnlockAt(e);
        this._event("bossGuard",e.x,e.y,e.phase);
      }
      e.guardAbsorb=(e.guardAbsorb||0)+Math.min(amount,floor-attempted);
    }
    e.hp=Math.max(floor,attempted);
  }
  _breakReactor(boss) {
    const r=boss.reactor;if(!r||r.broken)return;
    r.hp=0;r.broken=true;this.stats.reactorsBroken++;
    boss.cover={x:r.x,y:r.y,until:boss.age+3.2,side:r.side,width:88};
    const previousWake=this.player.wake;this.player.wake=Math.min(1,previousWake+.2);this._awardScore(1000);
    if(previousWake<.5&&this.player.wake>=.5)this._event('wakeReady',this.player.x,this.player.y,this.player.wake);
    this._burst(r.x,r.y,24,'gold',190,'hit');
    this._event('reactorBreak',r.x,r.y,r.side);
    this._applyReactorCover();
  }
  _applyReactorCover() {
    const boss=this.boss,cover=boss?.cover;
    if(!cover||boss.age>=cover.until)return;
    for(const bullet of this.bullets)if(!bullet.dead&&bullet.y>=cover.y-24&&Math.abs(bullet.x-cover.x)<cover.width/2)bullet.dead=true;
  }
  _aimed(x,y,tx,ty,speed,kind,r=5) {
    this._bullet(x,y,Math.atan2(ty-y,tx-x),speed,kind,r);
  }
  _spread(x,y,tx,ty,count,step,speed,kind,r=5) {
    const a=Math.atan2(ty-y,tx-x);
    for(let i=0;i<count;i++) this._bullet(x,y,a+(i-(count-1)/2)*step,speed,kind,r);
  }
  _radial(x,y,count,speed,offset,kind,r=5,from=0,to=Math.PI*2) {
    for(let i=0;i<count;i++) this._bullet(x,y,offset+from+i/count*(to-from),speed,kind,r);
  }
  get bulletCap() { return this.stage>=ACT_TWO_STAGE?ACT_TWO_BULLET_CAP:BULLET_CAP; }
  _bullet(x,y,angle,speed,kind,r) {
    if(this.bullets.length>=this.bulletCap) return null;
    // Void rounds are never smaller than r 5, so their ring edge stays readable.
    if(kind==="void"&&r<VOID_MIN_RADIUS)r=VOID_MIN_RADIUS;
    const b={x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
      r,kind,color:kind,age:0,grazed:false};
    this.bullets.push(b);return b;
  }
  _updateBullets(h) {
    let bursting=null;
    for(const b of this.bullets) {
      b.x+=b.vx*h;b.y+=b.vy*h;b.age+=h;
      // Sector 5 flak shrapnel is short-lived.
      if(b.ttl!==undefined&&(b.ttl-=h)<=0)b.dead=true;
      // Flak shells burst into a ring when their fuse runs out.
      if(b.fuse!==undefined&&!b.dead&&(b.fuse-=h)<=0){b.dead=true;(bursting||=[]).push(b);}
      // Sector 6 mirror missiles turn gently toward the ship for a while.
      if(b.homing!==undefined&&b.homing>0)this._steerBullet(b,h);
    }
    if(bursting)for(const b of bursting)
      this._radial(b.x,b.y,b.burst.count,b.burst.speed,b.burst.offset||0,b.burst.kind,b.burst.r);
  }
  _updateShots(h) {
    for(const shot of this.shots) {
      const homing=shot.kind==="missile"||shot.kind==="sidewinder";
      if(shot.kind==="torpedo") {
        // Hammer torpedoes start slow and accelerate to 900 px/s.
        shot.vy=Math.max(-900,shot.vy-h*1100);
        if(this._rand()<h*30)this._particle(shot.x,shot.y+10,0,60,.22,3,"cyan","engine");
      } else if(homing) {
        // One pass finds the locked target, or else the nearest live enemy.
        let target=null,nearest=null,nearestDistance=Infinity;
        for(const enemy of this.enemies) {
          if(enemy.dead||enemy.y<=-50||enemy.hidden||enemy.phasing)continue;
          if(enemy.id===shot.targetId){target=enemy;break;}
          const dx=enemy.x-shot.x,dy=enemy.y-shot.y,distance=dx*dx+dy*dy;
          if(distance<nearestDistance){nearestDistance=distance;nearest=enemy;}
        }
        if(!target){target=nearest;shot.targetId=target?.id??null;}
        if(target) {
          const dx=target.x-shot.x,dy=target.y-shot.y,len=Math.hypot(dx,dy)||1;
          const sidewinder=shot.kind==="sidewinder";
          const speed=sidewinder?680:560,turn=Math.min(1,h*(sidewinder?7:5));
          shot.vx=shot.vx*(1-turn)+dx/len*speed*turn;
          shot.vy=shot.vy*(1-turn)+dy/len*speed*turn;
          const v=Math.hypot(shot.vx,shot.vy);
          if(v>speed){shot.vx*=speed/v;shot.vy*=speed/v;}
        }
        if(this._rand()<h*(shot.kind==="sidewinder"?28:50))
          this._particle(shot.x,shot.y,0,55,shot.kind==="sidewinder"?.32:.18,3,shot.kind==="sidewinder"?"white":"amber",shot.kind==="sidewinder"?"smoke":"engine");
      }
      shot.x+=shot.vx*h;shot.y+=shot.vy*h;shot.age+=h;
    }
  }
  _drop(x,y,type,vx=0) {
    const item={id:++this._pickupId,x,y,r:16,type,age:0,vy:95};if(vx)item.vx=vx;
    this.pickups.push(item);this._event("drop",x,y,type);return item;
  }
  // Generated drops (random table, ladder, squadron bonus) are kit-aware: they
  // never offer an escort pair to a full wing or an S to a full bank. Authored
  // drops keep their type, and anything that reaches a full kit still converts
  // to power at pickup.
  _canHold(type) {
    const p=this.player;
    return type==="escort"?p.escorts<MAX_ESCORTS:type==="shield"?p.shield<SHIELD_CAP:true;
  }
  _rollTable(table) {
    let roll=this._rand()*table.reduce((sum,[,w])=>sum+w,0);
    for(const [type,weight] of table){if((roll-=weight)<0)return type;}
    return table[0][0];
  }
  // A random roll the kit can't hold drops nothing. The squadron item is a
  // guaranteed reward, so it re-rolls among the equipment the kit can hold.
  _randomDropType(equipmentOnly=false) {
    const type=this._rollTable(equipmentOnly?EQUIPMENT_WEIGHTS:DROP_WEIGHTS);
    if(this._canHold(type))return type;
    return equipmentOnly?this._rollTable(EQUIPMENT_WEIGHTS.filter(([t])=>this._canHold(t))):null;
  }
  // Ladder rungs the kit can't hold are skipped (sidewinder is always held).
  _bonusDropType() {
    let type="sidewinder";
    for(let tries=0;tries<=BONUS_CYCLE.length;tries++) {
      const i=this._bonusIndex++;
      type=i<BONUS_LADDER.length?BONUS_LADDER[i]:BONUS_CYCLE[(i-BONUS_LADDER.length)%BONUS_CYCLE.length];
      if(this._canHold(type))break;
    }
    return type;
  }
  // Several items from one kill fan out sideways so each is readable.
  // Entries are a type, or {type,value,recovery} for an Act I recovery token
  // (a power token may be worth 2-4 levels; the drop event carries
  // recovery:true and amount).
  _dropMany(x,y,types) {
    types.forEach((entry,i)=>{
      const item=this._drop(x,y,entry.type||entry,(i-(types.length-1)/2)*70);
      if(entry.recovery) {
        item.recovery=true;if(entry.value>1)item.value=entry.value;
        Object.assign(this.events[this.events.length-1],{recovery:true,amount:entry.value||1});
      }
    });
  }
  _updatePickups(h) {
    const p=this.player,interlude=this._transition>0;
    for(const item of this.pickups) {
      if(item.dead)continue;
      item.age+=h;
      const dx=p.x-item.x,dy=p.y-item.y,dist=Math.hypot(dx,dy);
      if(interlude) {
        // Sector clears are celebratory: anything still on screen homes in.
        if(item.y>-20&&dist>1){
          const speed=Math.min(900,260+item.age*120);
          item.x+=dx/dist*Math.min(dist,speed*h);item.y+=dy/dist*Math.min(dist,speed*h);
        }
        continue;
      }
      if(item.salvage) {
        // Burst (travels ~140-240 px), damp toward a slow sinking drift,
        // bounce off the field edges.
        const damp=Math.min(1,h*1.4);
        item.vx-=item.vx*damp;item.vy+=(24-item.vy)*damp;
        item.x+=item.vx*h;item.y+=item.vy*h;
        const b=SALVAGE_BOUNDS;
        if(item.x<b.left){item.x=b.left;item.vx=Math.abs(item.vx)*.8;}
        else if(item.x>b.right){item.x=b.right;item.vx=-Math.abs(item.vx)*.8;}
        if(item.y<b.top){item.y=b.top;item.vy=Math.abs(item.vy)*.8;}
        else if(item.y>b.bottom){item.y=b.bottom;item.vy=-Math.abs(item.vy)*.6;}
        item.life-=h;
        if(item.life<=0) {
          item.dead=true;this.stats.salvageLost+=item.value||1;
          this._burst(item.x,item.y,8,"white",70,"fizzle");
          this._event("salvageExpire",item.x,item.y,item.type);
          continue;
        }
      } else {
        item.y+=item.vy*h;item.x+=Math.sin(item.age*2.2)*h*14;
        if(item.vx){item.x=this._clamp(item.x+item.vx*h,24,516);item.vx*=1-Math.min(1,h*3);}
      }
      // Salvage gets a slightly wider magnet (wider again in focus, and briefly
      // after a roll ends), so a brave sweep recovers it.
      if(item.salvage&&item.age<SALVAGE_GRACE)continue;
      const attract=(item.salvage?(p.focus?SALVAGE_MAGNET_FOCUS:SALVAGE_MAGNET):
        (p.focus?PICKUP_MAGNET_FOCUS:PICKUP_MAGNET))*(p.magnetBoost>0?ROLL_MAGNET_SCALE:1);
      if(dist<attract&&dist>1) {
        const speed=230+(attract-dist)*3;
        item.x+=dx/dist*speed*h;item.y+=dy/dist*speed*h;
      }
    }
  }
  _collect(item) {
    const p=this.player,value=Math.max(1,Math.floor(item.value||1));
    let reported=item.type;
    this.stats.pickups++;
    if(item.type==="power") this._increasePower(value);
    else if(item.type==="escort") this._addEscorts(value);
    else if(item.type==="sidewinder") {p.sidewinder+=value;this._syncArsenal();}
    else if(item.type==="shield") this._addShield(value,p.shipId==="manta"?2:1);
    else if(item.type==="reflector") this._addReflector(REFLECTOR_PICKUP*value);
    else if(item.type==="signature") this._addSignature(value);
    else if(item.type==="bomb") {
      // A full bomb bay turns the pickup into a power level, reported as a
      // power pickup so presentation plays one power cue, not a bomb cue too.
      if(p.bombs>=MAX_BOMBS){this._increasePower(1);reported="power";}else p.bombs++;
    }
    else this._awardScore(Math.round(1500*this.combo));
    this._burst(item.x,item.y,22,"gold",140,"pickup");
    // Salvage reports only salvageRecover (amount = levels carried); ordinary
    // pickups report pickup. Follow-on events (powerUp, escortJoin...) stay.
    if(item.salvage){this.stats.salvageRecovered+=value;this.events.push({type:"salvageRecover",x:item.x,y:item.y,value:item.type,amount:value});}
    else this._event("pickup",item.x,item.y,reported);
    if(item.tag)this.events[this.events.length-1].tag=item.tag;
  }
  // At the cap, new decorative particles are dropped (no array shifting);
  // critical feedback may overflow up to PARTICLE_HARD_CAP. Callers draw their
  // random numbers before this check, so the seeded stream never changes.
  _particle(x,y,vx,vy,life,size,color,kind) {
    const n=this.particles.length;
    if(n>=PARTICLE_CAP&&(n>=PARTICLE_HARD_CAP||!CRITICAL_PARTICLES.has(kind)))return;
    this.particles.push({x,y,vx,vy,life,maxLife:life,size,color,kind});
  }
  _burst(x,y,count,color,speed,kind="spark") {
    for(let i=0;i<count;i++) {
      const a=this._rand()*Math.PI*2,s=this._range(speed*.2,speed);
      this._particle(x,y,Math.cos(a)*s,Math.sin(a)*s,
        this._range(.25,.75),this._range(2,7),color,kind);
    }
  }
  _updateParticles(h) {
    for(const f of this.particles) {
      f.x+=f.vx*h;f.y+=f.vy*h;f.vx*=1-h*1.5;f.vy*=1-h*1.5;f.life-=h;
    }
  }

  // Rails, escort rails and torpedoes pass through targets (torpedoes only small ones).
  _pierces(shot) { return !!shot.hitIds&&(shot.kind==="pierce"||shot.kind==="torpedo"||shot.style==="rail"); }
  _collide() {
    const p=this.player;
    // Sector 6: any player shot breaks a shard (or a mirror missile) it touches.
    if(this.stage===6)this._breakFragile();
    for(const shot of this.shots) {
      if(shot.dead)continue;
      for(const hitEnemy of this.enemies) {
        let e=hitEnemy;
        if(e.dead||e.y< -70||e.hidden||e.phasing||shot.hitIds?.includes(e.id))continue;
        const reactor=e.reactor;
        if(reactor&&!reactor.broken&&e.age>=reactor.opensAt&&!shot.hitIds?.includes(reactor.id)&&Math.hypot(shot.x-reactor.x,shot.y-reactor.y)<reactor.r+(shot.hitR||shot.r)){
          if(!shot.countedHit){this.stats.shotsHit++;shot.countedHit=true;}
          reactor.hp-=shot.damage;
          if(this._pierces(shot)){shot.hitIds.push(reactor.id);if(--shot.pierceRemaining<=0||shot.kind==="torpedo")shot.dead=true;}
          else shot.dead=true;
          if(this._hitAudioClock<=0){this._event('bossCoreHit',reactor.x,reactor.y,'reactor');this._event('hit',reactor.x,reactor.y,'reactor');this._hitAudioClock=.065;}
          if(reactor.hp<=0)this._breakReactor(e);
          if(shot.dead)break;
          continue;
        }
        const dx=shot.x-e.x,dy=shot.y-e.y;
        // Bosses and hulls use their w/h ellipse; everything else a circle.
        const hit=e.w ? dx*dx/(e.w*e.w)+dy*dy/(e.h*e.h)<1 :
          dx*dx+dy*dy<((shot.hitR||shot.r)+e.r*.78)**2;
        if(!hit)continue;
        // Turrets ride on the deck: a shot over a live turret hits it, and a
        // shot flying up a live turret's column passes over the hull to reach it.
        if(e.turretsAlive>0||e.baysAlive>0||e.gunnersAlive>0||e.escortsAlive>0) {
          const turret=this._turretUnder(e,shot);
          if(turret===true)continue;
          if(turret)e=turret;
        }
        if(!shot.countedHit){this.stats.shotsHit++;shot.countedHit=true;}
        const previousHp=e.hp;
        this._damageEnemy(e,shot.damage);
        const armorStopped=(e.type==="boss"&&e.hp===previousHp)||((e.type==="boss"||e.type==="hull"||e.type==="station")&&e.turretsAlive>0)||
          ((e.type==="boss"||e.type==="foundry")&&e.baysAlive>0)||(e.type==="boss"&&e.escortsAlive>0);
        const heavy=shot.kind==="missile"||shot.kind==="torpedo";
        e.flash=heavy?.95:shot.kind==="pierce"?.72:.5;
        // Torpedoes pierce small craft and burst on big targets and bosses.
        const burst=shot.kind==="missile"||(shot.kind==="torpedo"&&BIG_TARGETS.has(e.type));
        if(this._pierces(shot)&&!burst) {
          shot.hitIds.push(e.id);
          shot.pierceRemaining--;
          if(shot.pierceRemaining<=0)shot.dead=true;
        } else shot.dead=true;
        if(burst) {
          const torpedo=shot.kind==="torpedo",radius=torpedo?70:52;
          this._burst(shot.x,shot.y,torpedo?22:14,torpedo?"cyan":"amber",torpedo?160:110,"missile");
          for(const other of this.enemies) {
            if(other===e||other.dead)continue;
            if(Math.hypot(other.x-shot.x,other.y-shot.y)<radius) {
              this._damageEnemy(other,shot.damage*(torpedo?.5:.45));
              if(other.hp<=0)this._killEnemy(other);
            }
          }
          // Burst cues are gated per target, so a salvo landing together reads
          // as one blast; damage, splash and particles above are untouched.
          if((e.burstCooldown||0)<=0) {
            this._event(armorStopped?"bossArmorHit":"missileHit",shot.x,shot.y,e.type);
            if(torpedo)this.events[this.events.length-1].torpedo=true;
            e.burstCooldown=BURST_CUE_COOLDOWN;
          }
        }
        // Contact cues respect the per-target cooldown; rails may cut in only
        // once it has nearly run out, so pierce volleys cannot flood events.
        const cool=e.impactCooldown||0;
        if(!burst&&(cool<=0||(shot.kind==="pierce"&&cool<=.04))) {
          const contact=armorStopped?"bossArmorHit":e.type==="boss"?"bossCoreHit":
            shot.kind==="pierce"?"railHit":"chipHit";
          this._event(contact,shot.x,shot.y,e.type);
          e.impactCooldown=shot.kind==="pierce"?.05:e.type==="boss"?.075:.09;
        }
        if(this._hitAudioClock<=0){this._event("hit",shot.x,shot.y,e.type);this._hitAudioClock=.065;}
        if(this._rand()<.2)this._particle(shot.x,shot.y,this._range(-35,35),
          this._range(-40,40),.18,3,"white","hit");
        if(e.hp<=0)this._killEnemy(e);
        if(shot.dead)break;
      }
    }
    // Every roll has a contact strike; WAKE charge extends reach and damage.
    // Each enemy can be struck once per roll, including the boss.
    if(p.roll>0) {
      for(const e of this.enemies) {
        if(e.dead||e.y< -70||e.phasing||e.lastRollHit===this._rollSerial)continue;
        const radius=e.type==="boss"?(p.rollCharged?90:75):e.r+(p.rollCharged?30:20);
        if(Math.hypot(e.x-p.x,e.y-p.y)>radius)continue;
        e.lastRollHit=this._rollSerial;
        this._damageEnemy(e,e.type==="boss"?(p.rollCharged?175:60):(p.rollCharged?135:45));
        e.flash=1;this._burst(e.x,e.y,18,"cyan",150,"roll");
        this.events.push({type:"rollStrike",x:e.x,y:e.y,value:e.type,charged:p.rollCharged});
        if(e.hp<=0)this._killEnemy(e);
      }
    }
    if(p.signature>0&&p.shipId==="kestrel")this._flakScreen();
    let reflected=0,eats=0;
    const flushDefense=()=>{
      if(reflected){this.stats.reflected+=reflected;this._event("reflect",p.x,p.y,reflected);}
      if(eats)this._event("orbitalEat",p.x,p.y,eats);
      if(reflected&&p.reflector<=0)this._event("reflectorDown",p.x,p.y,0);
      reflected=eats=0;
    };
    for(const b of this.bullets) {
      if(b.dead) continue;
      const dx=b.x-p.x,dy=b.y-p.y,d2=dx*dx+dy*dy;
      if(p.roll>0 && p.rollCharged && d2<(32+b.r)**2) {
        b.dead=true;
        const points=Math.round(180*this.combo),previousWake=p.wake;
        this._awardScore(points);
        p.wake=Math.min(1,p.wake+.025);
        this._particle(b.x,b.y,0,0,.36,6,"cyan","ring");
        this._burst(b.x,b.y,4,"cyan",75,"convert");
        this.wakeConversions++;this.stats.conversions++;
        const existing=this.events.find(event=>event.type==="wakeConvert");
        if(existing){existing.value++;existing.points+=points;existing.resource+=p.wake-previousWake;}
        else this.events.push({type:"wakeConvert",x:b.x,y:b.y,value:1,points,resource:p.wake-previousWake});
        continue;
      }
      // Reflector ring and ghost orbitals stop ordinary bullets; void rounds pass.
      if(b.kind!=="void") {
        if(p.reflector>0&&d2<REFLECTOR_RADIUS*REFLECTOR_RADIUS) {
          b.dead=true;this._reflectBullet(b);reflected++;continue;
        }
        let eaten=false;
        for(const o of p.orbitals) {
          if(o.cool>0)continue;
          const ox=b.x-o.x,oy=b.y-o.y;
          if(ox*ox+oy*oy<(9+b.r)**2){o.cool=ORBITAL_COOL;eaten=true;break;}
        }
        if(eaten) {
          b.dead=true;eats++;this.stats.orbitalEats++;
          this._particle(b.x,b.y,0,0,.25,5,"cyan","ring");
          continue;
        }
      }
      const hitRadius=p.r+b.r*.68;
      if(d2<hitRadius*hitRadius&&p.invuln<=0) {
        b.dead=true;flushDefense();this._hurtPlayer(b.x,b.y);
        if(this.mode==='gameover')return;
      } else if(!b.grazed&&d2<(p.r+b.r+23)**2) {
        b.grazed=true;this.graze++;this.stats.grazes++;
        this._awardScore(Math.ceil(25*this.combo));
        this.combo=Math.min(8,this.combo+.025);this._comboClock=3;
        const previous=p.wake;
        p.wake=Math.min(1,p.wake+.06);
        if(previous<.5&&p.wake>=.5)this._event("wakeReady",p.x,p.y,p.wake);
        if(this.graze%8===0)this._event("graze",p.x,p.y,this.graze);
        this._particle(b.x,b.y,this._range(-20,20),-30,.25,2,"cyan","graze");
      }
    }
    flushDefense();
    if(p.invuln<=0) {
      for(const e of this.enemies) {
        // Surface ships (hulls, their turrets, gunboats) sail below the plane.
        if(e.dead||e.hidden||e.phasing||NO_CONTACT_TYPES.has(e.type))continue;
        const dx=e.x-p.x,dy=e.y-p.y;
        if(dx*dx+dy*dy<(p.r+e.r*.66)**2) {
          this._hurtPlayer(p.x,p.y);
          if(this.mode==='gameover')return;
          if(e.type!=="boss") {e.hp-=80;if(e.hp<=0)this._killEnemy(e);}
          break;
        }
      }
    }
    const lance=this.boss?.lance;
    if(lance?.active&&!this.boss.dead&&p.invuln<=0&&Math.abs(p.x-lance.x)<lance.width/2+p.r&&p.y+p.r>lance.y){
      this._hurtPlayer(lance.x,p.y);if(this.mode==='gameover')return;
    }
    // Sector 5 laser bars: a live beam hurts unless the ship is rolling.
    if(this.hazards.length&&p.invuln<=0&&p.roll<=0)for(const bar of this.hazards)
      if(bar.kind==="laser"&&bar.state==="fire"&&this._laserTouches(bar,p)){this._hurtPlayer(p.x,p.y);if(this.mode==='gameover')return;break;}
    for(const item of this.pickups) {
      if(item.dead||(item.salvage&&item.age<SALVAGE_GRACE&&this._transition<=0))continue;
      const dx=item.x-p.x,dy=item.y-p.y;
      if(dx*dx+dy*dy<(item.r+16)**2) {
        item.dead=true;this._collect(item);
      }
    }
  }
  // Kestrel "Hellfire Wings" screen: in its first FLAK_SCREEN_TIME of flight
  // (~230 px from the wing) each flak shot eats one ordinary enemy bullet on
  // contact and is spent. Void rounds pass through. One coalesced flakEat
  // event per frame carries the count.
  _flakScreen() {
    let eaten=0,ex=0,ey=0;
    const bullets=this.bullets;
    for(const shot of this.shots) {
      if(shot.dead||shot.kind!=="flak"||shot.age>FLAK_SCREEN_TIME)continue;
      const sx=shot.x,sy=shot.y,sr=shot.r;
      for(const b of bullets) {
        if(b.dead||b.kind==="void")continue;
        const dx=b.x-sx,r=sr+b.r;
        if(dx>r||dx<-r)continue;
        const dy=b.y-sy;
        if(dx*dx+dy*dy<r*r) {
          b.dead=true;shot.dead=true;
          if(!eaten){ex=b.x;ey=b.y;}
          eaten++;this._particle(b.x,b.y,0,0,.2,4,"gold","spark");
          break;
        }
      }
    }
    if(!eaten)return;
    this.stats.flakEats+=eaten;
    const existing=this.events.find(event=>event.type==="flakEat");
    if(existing)existing.value+=eaten;else this._event("flakEat",ex,ey,eaten);
  }
  // Returns the live child turret the shot overlaps, true if one lies ahead
  // in the shot's path (the shot flies on over the hull), or null.
  _turretUnder(parent,shot) {
    const reach=shot.hitR||shot.r,speed=Math.hypot(shot.vx,shot.vy)||1;
    const ux=shot.vx/speed,uy=shot.vy/speed;
    let ahead=false;
    for(const t of this.enemies) {
      if(!CHILD_TYPES.has(t.type)||t.parentId!==parent.id||t.dead||shot.hitIds?.includes(t.id))continue;
      const dx=t.x-shot.x,dy=t.y-shot.y,r=reach+t.r;
      if(dx*dx+dy*dy<r*r)return t;
      const along=dx*ux+dy*uy;
      if(along>0&&Math.abs(dx*uy-dy*ux)<r)ahead=true;
    }
    return ahead||null;
  }
  // Hit order: a shield charge absorbs the hit outright; otherwise the
  // arsenal scatters as salvage, then the hull takes the hit.
  _hurtPlayer(x,y) {
    const p=this.player;if(p.invuln>0)return;
    if(p.shield>0) {
      p.shield--;this.stats.hitsTaken++;p.invuln=.65;this.shake=8;this.flash=.3;
      this._burst(p.x,p.y,22,"cyan",150,"shield");
      this._event("shieldHit",x,y,p.shield);
      if(p.shield===0)this._event("shieldBreak",p.x,p.y,0);
      this._syncArsenal();
      return;
    }
    this._scatterArsenal(x,y);
    p.hp--;this.stats.hitsTaken++;p.invuln=SCATTER_INVULN;this.combo=1;this._comboClock=0;
    this.shake=13;this.flash=.5;this._burst(p.x,p.y,32,"cyan",220,"damage");
    this._event("playerHit",x,y,p.hp);
    if(p.hp<=0) {
      p.lives--;this.stats.livesLost++;this._event("lifeLost",p.x,p.y,p.lives);
      if(p.lives<=0) {
        this.mode="gameover";if(!this.practiceStage)this.best=Math.max(this.best,this.score);
        this._finishRun("defeat");
        this._event("gameover",p.x,p.y,this.score);
      } else {
        // Losing a life scatters anything still held; the new ship is bare and
        // the salvage from this hit keeps floating.
        this._scatterArsenal(p.x,p.y);
        p.hp=p.maxHp;p.level=p.power=1;p.drones=0;
        p.shield=p.maxShield=p.shipId==="manta"?1:0;p.shieldCap=SHIELD_CAP;
        p.x=270;p.y=750;p.invuln=3.2;
        this.bullets=this.bullets.filter(b=>Math.hypot(b.x-p.x,b.y-p.y)>190);
        this._syncArsenal();
      }
    }
  }
  // Everything above a bare ship drops as at most SALVAGE_MAX_TOKENS tokens:
  // power splits into a few multi-level tokens, each equipment level is its
  // own token (bundled only when the token budget runs out). 20% of the power
  // burns away. Reflector time is lost, not dropped.
  _scatterArsenal(x,y) {
    const p=this.player;
    const levels=p.level-1,burned=Math.floor(levels*SCATTER_BURN),kept=levels-burned;
    const pools=[["power",kept,Math.min(kept,6,Math.ceil(kept/3))],["escort",p.escorts/2,p.escorts/2],
      ["sidewinder",p.sidewinder,p.sidewinder],["signature",p.signature,p.signature]]
      .filter(([,amount])=>amount>0).map(([type,amount,tokens])=>({type,amount,tokens:Math.max(1,tokens)}));
    if(p.reflector>0){p.reflector=0;this._event("reflectorDown",p.x,p.y,0);}
    if(!levels&&!pools.length)return 0;
    let total=pools.reduce((sum,pool)=>sum+pool.tokens,0);
    while(total>SALVAGE_MAX_TOKENS) {
      // Bundle the most fragmented pool first (fewest levels per token).
      let pick=null;
      for(const pool of pools)if(pool.tokens>1&&(!pick||pool.amount/pool.tokens<pick.amount/pick.tokens))pick=pool;
      if(!pick)break;pick.tokens--;total--;
    }
    const tokens=[];
    for(const pool of pools)
      for(let i=0;i<pool.tokens;i++) {
        const value=Math.floor(pool.amount/pool.tokens)+(i<pool.amount%pool.tokens?1:0);
        tokens.push({type:pool.type,value});
      }
    const offset=this._rand()*Math.PI*2;
    // THE SOVEREIGN's phase 2 ("Theft"): the salvage goes up tethers instead.
    if(this._theft())this._launchTethers(tokens,x,y);
    else tokens.forEach((token,i)=>{
      const angle=offset+i/tokens.length*Math.PI*2+this._range(-.25,.25),speed=this._range(SALVAGE_BURST[0],SALVAGE_BURST[1]);
      this.pickups.push({id:++this._pickupId,x:this._clamp(x,SALVAGE_BOUNDS.left,SALVAGE_BOUNDS.right),
        y:this._clamp(y,SALVAGE_BOUNDS.top,SALVAGE_BOUNDS.bottom),r:18,type:token.type,age:0,
        vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,salvage:true,value:token.value,life:SALVAGE_LIFE});
    });
    const dropped=tokens.reduce((sum,token)=>sum+token.value,0);
    p.level=p.power=1;p.escorts=0;p.escortSlots.length=0;p.sidewinder=0;p.signature=0;p.drones=0;
    this._resetEmp();
    this._syncOrbitals();this._syncArsenal();
    this.stats.scatters++;
    // Act II: scavengers are called in after the salvage (sector only; the
    // flagship launches its own in phase 3).
    if(this.stage>=ACT_TWO_STAGE&&!this.boss&&this._transition<=0) {
      this._scavengerCall=this.time+SCAVENGER_CALL;this._scavengerFlank=this.threat>=RESCUE_THREAT;
    }
    this._burst(x,y,30,"gold",240,"scatter");
    this.events.push({type:"arsenalScatter",x,y,value:dropped,tokens:tokens.length,burned});
    return tokens.length;
  }
  // A reflected bullet flies back at the nearest enemy as a player shot.
  _reflectBullet(b) {
    const p=this.player;
    p.reflector=Math.max(0,p.reflector-REFLECT_COST);
    let target=null,best=Infinity;
    for(const e of this.enemies) {
      if(e.dead||e.y< -40||e.hidden)continue;
      const d=(e.x-b.x)**2+(e.y-b.y)**2;if(d<best){best=d;target=e;}
    }
    const angle=target?Math.atan2(target.y-b.y,target.x-b.x):-Math.PI/2;
    this._shot({x:b.x,y:b.y,vx:Math.cos(angle)*760,vy:Math.sin(angle)*760,r:4,
      damage:12+p.level*.5,kind:"reflect",age:0});
    this._particle(b.x,b.y,0,0,.22,5,"violet","ring");
  }
  // silent: the target went down with its parent (no drops).
  _killEnemy(e,bomb=false,silent=false) {
    if(e.dead)return;e.dead=true;
    if(e.type==="boss") {
      this.stats.bossesDefeated++;
      this._awardScore(Math.round(e.value*this.combo));
      this._burst(e.x,e.y,130,"gold",360,"boss");
      this._particle(e.x,e.y,0,0,.75,16,"gold","ring");
      this.shake=18;this.flash=1;this.bullets.length=0;
      // The ACT II card plays after the Crown when the campaign continues.
      const actBreak=!this.practiceStage&&this.stage===ACT_TWO_STAGE-1&&CAMPAIGN_STAGES>=ACT_TWO_STAGE;
      this.boss=null;this._transition=this._transitionLength=actBreak?ACT_TWO_INTERLUDE:INTERLUDE;
      // HALCYON's last pose keeps the bays still standing.
      const liveBays=e.halcyon?this.enemies.filter(o=>o.type==="foundryBay"&&o.parentId===e.id&&!o.dead).map(o=>({ox:o.ox,oy:o.oy})):null;
      if(e.halcyon||e.sovereign)this._clearHazards();
      const liveEscorts=e.sovereign?this.enemies.filter(o=>o.type==="mirrorEscort"&&o.parentId===e.id&&!o.dead).map(o=>({ox:o.ox,oy:o.oy,slot:o.slot})):null;
      // Everything the flagship launched goes down with it; stolen salvage falls back.
      for(const other of this.enemies) {
        if(other===e||other.dead)continue;
        if(other.type==="hullTurret"||other.type==="foundryBay"||other.type==="mirrorEscort")this._killEnemy(other,true,true);
        else if(other.type==="tether"){this._cutTether(other,true);other.dead=true;}
        else {
          this._releaseCarried(other);other.dead=true;
          this._burst(other.x,other.y,8,"amber",120,"explode");
        }
      }
      // Flagship spoils: collected automatically during the interlude. Act I
      // spoils are authored on the ledger; Act II pays power plus a ladder item.
      this._dropMany(e.x,e.y,this.stage<ACT_TWO_STAGE?ACT_ONE_SPOILS[this.stage]:["power",this._bonusDropType()]);
      this._event("bossDown",e.x,e.y,this.stage);
      // LEVIATHAN's last pose, so presentation can sink the hull after boss is null.
      if(e.leviathan)Object.assign(this.events[this.events.length-1],
        {w:e.w,h:e.h,angle:e.angle||0,broadside:e.broadside||0,core:e.core||0});
      // HALCYON: the wing breaks apart and falls through the cloud floor.
      if(e.halcyon) {
        Object.assign(this.events[this.events.length-1],{w:e.w,h:e.h,angle:e.angle||0,bays:liveBays});
        this.events.push({type:"wingBreak",x:e.x,y:e.y,value:this.stage,w:e.w,h:e.h,angle:e.angle||0});
      }
      // THE SOVEREIGN: the mirror hull shatters into shards that tumble toward the Earth.
      if(e.sovereign) {
        const pose={w:e.w,h:e.h,angle:e.angle||0,escorts:liveEscorts,weapons:e.weapons.map(w=>({type:w.type,ox:w.ox})),style:e.style};
        Object.assign(this.events[this.events.length-1],pose);
        this.events.push({type:"mirrorShatter",x:e.x,y:e.y,value:this.stage,...pose});
      }
      if(actBreak)this._event("actTwo",e.x,e.y,ACT_TWO_STAGE);
    } else if(silent) {
      // Gone with its hull: score and wreckage, no drops or combo.
      this.stats.kills++;this._awardScore(Math.round(e.value*.5));
      this._burst(e.x,e.y,12,"amber",140,"explode");
      if(e.type==="hullTurret")this._turretLost(e);
      else if(CHILD_TYPES.has(e.type))this._childLost(e);
    } else {
      this.stats.kills++;
      this.combo=Math.min(8,this.combo+(e.type==="mini"?.45:.13));
      this._comboClock=4;this._awardScore(Math.round(e.value*this.combo));
      this._burst(e.x,e.y,e.type==="mini"?32:e.type==="bomber"||e.type==="carrier"?16:8,
        e.type==="ace"?"cyan":"amber",e.type==="mini"?220:130,"explode");
      this.shake=Math.max(this.shake,e.type==="mini"?7:e.type==="bomber"?4:2);
      // Authored drops stay. Act II carriers and minibosses add ladder
      // bonuses; Act I heavies carry only what their beat authors. Ordinary
      // kills roll a table.
      const drops=[],actOne=this.stage<ACT_TWO_STAGE;
      // Formation scouts and wings pay out through the squadron bonus instead
      // of the random table; heavies and loners still roll it. Act I rolls a
      // smaller flavour table at lower rates: the ledger is authored.
      const formation=e.squad&&FORMATION_TYPES.has(e.type);
      const rescued=e.rescue&&this.threat<this._rescueThreat();
      if(e.drop)drops.push(...[].concat(e.drop));
      // Act I: a rescue lead pays its power on top of an authored drop.
      if(rescued&&(actOne||!e.drop))drops.push("power");
      else if(!e.drop&&!rescued&&!formation&&this._rand()<((actOne?ACT_ONE_DROP_CHANCE:DROP_CHANCE)[e.type]??.035)) {
        const type=actOne?this._rollTable(ACT_ONE_FLAVOUR):this._randomDropType();if(type)drops.push(type);
      }
      if(!actOne)for(let i=0;i<(BONUS_DROPS[e.type]||e.bonusDrops||0);i++)drops.push(this._bonusDropType());
      // Act I recovery: a rescue or recovery lead tops up a kit that has
      // fallen below its entitlement (never a clean collector's).
      const recovery=actOne&&(e.rescue||e.recover)?this._actOneRecovery(e,drops):[];
      // Squadron wipe: the last kill of an intact formation adds a weighted
      // equipment item (no power) to this kill's fan. Act I: the wipe pays
      // points, and sometimes a reflector.
      const squad=e.squad&&this._squads.get(e.squad);
      let wiped=0,bonusDrops=SQUADRON_BONUS_DROPS,points=0;
      if(squad&&++squad.killed>=squad.total) {
        this._squads.delete(e.squad);wiped=squad.total;this.stats.squadronBonuses++;
        if(actOne) {
          points=ACT_ONE_SQUAD_POINTS*wiped;this._awardScore(points);
          bonusDrops=this._rand()<ACT_ONE_SQUAD_ITEM?1:0;
          if(bonusDrops)drops.push(this._rollTable(ACT_ONE_SQUAD_FLAVOUR));
        } else for(let i=0;i<SQUADRON_BONUS_DROPS;i++)drops.push(this._randomDropType(true));
      }
      if(recovery.length)drops.push(...recovery);
      const before=this.pickups.length;
      if(drops.length)this._dropMany(e.x,e.y,drops);
      // Sector 5's authored drops carry their beat tag (the schedule is measured at collection).
      if(e.tag){const authored=[].concat(e.drop);for(let i=before;i<this.pickups.length;i++)if(authored.includes(this.pickups[i].type))this.pickups[i].tag=e.tag;}
      if(wiped)this.events.push({type:"squadronBonus",x:e.x,y:e.y,value:wiped,drops:bonusDrops,points});
      this._event("enemyDown",e.x,e.y,e.type);
      if(ACT_TWO_TYPES.has(e.type))this._actTwoKill(e);
    }
    this._event("explode",e.x,e.y,e.type);this.events[this.events.length-1].angle=e.angle||0;
    if(!this.practiceStage&&!bomb&&this.score>this.best)this.best=this.score;
  }
  _actTwoKill(e) {
    if(e.type==="hullTurret") {
      this._turretLost(e);
      this._event("turretDown",e.x,e.y,e.gun);
    } else if(e.type==="hull") {
      this._burst(e.x,e.y,40,"gold",260,"explode");
      this._particle(e.x,e.y,0,0,.6,12,"amber","ring");
      this.shake=Math.max(this.shake,9);this.flash=Math.max(this.flash,.3);
      for(const t of this.enemies)if(t.type==="hullTurret"&&t.parentId===e.id&&!t.dead)this._killEnemy(t,false,true);
      this._event("hullDown",e.x,e.y,e.hullClass);
    } else if(e.type==="scavenger") this._releaseCarried(e);
    else if(e.type==="foundryBay") {
      this._childLost(e);
      const parent=this._enemyById(e.parentId);
      if(parent?.type==="boss"){this.shake=Math.max(this.shake,7);this.flash=Math.max(this.flash,.25);}
      this._event("bayDown",e.x,e.y,parent?.type==="boss"?"boss":"foundry");
    } else if(e.type==="tailGunner") this._childLost(e);
    else if(e.type==="station") {
      this._burst(e.x,e.y,44,"gold",270,"explode");this._particle(e.x,e.y,0,0,.6,12,"amber","ring");
      this.shake=Math.max(this.shake,10);this.flash=Math.max(this.flash,.32);
      for(const t of this.enemies)if(t.type==="stationTurret"&&t.parentId===e.id&&!t.dead)this._killEnemy(t,false,true);
      this._event("stationDown",e.x,e.y,0);
    } else if(e.type==="stationTurret") {
      this._childLost(e);this._event("stationTurretDown",e.x,e.y,e.gun);
    } else if(e.type==="mirrorEscort") {
      this._childLost(e);this.shake=Math.max(this.shake,6);this.flash=Math.max(this.flash,.2);
      this._event("mirrorEscortDown",e.x,e.y,e.slot);
    } else if(e.type==="satellite"||e.type==="echo") {
      this._dropOwnedHazards(e.id);
      if(e.type==="satellite")this._event("satelliteDown",e.x,e.y,0);
    } else if(e.type==="tether") this._cutTether(e);
    else if(e.type==="foundry"||e.type==="boxBomber") {
      if(e.type==="foundry") {
        this._burst(e.x,e.y,40,"gold",260,"explode");this._particle(e.x,e.y,0,0,.6,12,"amber","ring");
        this.shake=Math.max(this.shake,9);this.flash=Math.max(this.flash,.3);
      }
      for(const t of this.enemies)if(CHILD_TYPES.has(t.type)&&t.parentId===e.id&&!t.dead)this._killEnemy(t,false,true);
      if(e.type==="foundry")this._event("foundryDown",e.x,e.y,e.foundryClass);
    }
  }
  _ownerGone(id) { const o=this._enemyById(id);return !o||o.dead; }
  _dropOwnedHazards(id) {
    let w=0;for(const hz of this.hazards)if(hz.ownerId!==id)this.hazards[w++]=hz;this.hazards.length=w;
  }
  _turretLost(t) {
    const parent=this._enemyById(t.parentId);
    if(parent&&parent.turretsAlive>0)parent.turretsAlive--;
    if(parent?.type==="boss"){this.shake=Math.max(this.shake,7);this.flash=Math.max(this.flash,.25);}
  }
  // A shot-down scavenger drops its stolen salvage back into play.
  _releaseCarried(e) {
    const c=e.carrying;if(!c)return;
    e.carrying=null;
    this.pickups.push({id:++this._pickupId,x:this._clamp(e.x,SALVAGE_BOUNDS.left,SALVAGE_BOUNDS.right),
      y:this._clamp(e.y,SALVAGE_BOUNDS.top,SALVAGE_BOUNDS.bottom),r:18,type:c.type,age:SALVAGE_GRACE,
      vx:0,vy:60,salvage:true,value:c.value,life:Math.max(5,c.life||0)});
    this._event("scavengerDrop",e.x,e.y,c.type);
  }
  _advanceStage() {
    if(this.practiceStage){
      this.mode="victory";this._finishRun("victory");this._event("victory",270,320,this.score);return;
    }
    if(this.stage>=CAMPAIGN_STAGES) {
      this.mode="victory";
      this.score+=this.player.lives*5000+this.player.bombs*1500+this.player.hp*1000;
      this.best=Math.max(this.best,this.score);
      this._finishRun("victory");
      // THE SOVEREIGN's defeat ends Act II.
      if(this.stage===6)this._event("actTwoComplete",270,320,2);
      this._event("victory",270,320,this.score);return;
    }
    // Anything the interlude did not collect is off screen and is lost.
    for(const item of this.pickups)if(item.salvage&&!item.dead)this.stats.salvageLost+=item.value||1;
    this.pickups.length=0;this._squads.clear();this._scavengerCall=0;this._transitionLength=INTERLUDE;
    this.stage++;this.stageTime=0;this.wave=0;this._beatIndex=0;this._laneIndex=0;
    // Each sector opens on a short power trip: the rank climbs back from 0.
    this.threat=0;
    // Act I pays its kit from the ledger; Act II's bonus ladder opens on its
    // equipment cycle (the starter rungs belonged to the old sector 1).
    if(this.stage===ACT_TWO_STAGE)this._bonusIndex=Math.max(this._bonusIndex,BONUS_LADDER.length);
    this._awardScore(0);
    this.enemies.length=0;this.bullets.length=0;this._clearHazards();
    // Act I sector clears repair the hull (round 2: the campaign has to be
    // winnable for an average pilot). Entering Act II still adds one point,
    // so sector 4 opens as tuned. Clearing an Act II flagship repairs the
    // hull again: LEVIATHAN leaves average pilots on their last points.
    this.player.hp=this.stage===ACT_TWO_STAGE?Math.min(this.player.maxHp,this.player.hp+1):this.player.maxHp;
    this.player.bombs=Math.min(MAX_BOMBS,this.player.bombs+1);
    this.player.invuln=3;this.flash=.7;
    this._event("stage",270,170,this.stage);
  }
  _finishRun(outcome) {
    const p=this.player,s=this.stats;
    const accuracy=s.shotsFired?Math.min(1,s.shotsHit/s.shotsFired):0;
    const merit=(outcome==="victory"?40:0)+Math.min(20,this.score/12000)+
      Math.min(12,s.grazes/30)+Math.min(10,s.kills/12)+
      Math.min(10,accuracy*12)+Math.min(8,p.lives*2)-
      Math.min(24,s.hitsTaken*.65)-s.livesLost*2;
    const grade=merit>=84?"S":merit>=68?"A":merit>=50?"B":merit>=32?"C":"D";
    this.summary={outcome,shipId:this.shipId,score:this.score,grade,stage:this.stage,act:actOf(this.stage),livesRemaining:p.lives,
      practiceStage:this.practiceStage,bombsRemaining:p.bombs,
      time:this.time,kills:s.kills,grazes:s.grazes,shotsFired:s.shotsFired,
      shotsHit:s.shotsHit,accuracy,pickups:s.pickups,powerPeak:s.powerPeak,arsenalPeak:s.arsenalPeak,
      scatters:s.scatters,salvageRecovered:s.salvageRecovered,
      bombsUsed:s.bombsUsed,rolls:s.rolls,conversions:s.conversions,
      hitsTaken:s.hitsTaken,livesLost:s.livesLost,bossesDefeated:s.bossesDefeated,reactorsBroken:s.reactorsBroken};
    this._event("summary",270,320,grade);
    this.events[this.events.length-1].summary=this.summary;
  }
  _cleanup() {
    let write=0;
    for(let read=0;read<this.enemies.length;read++) {
      const e=this.enemies[read];
      // Rising interceptors start below the field; Act II fliers that climb
      // out of the top are gone.
      const gone=(e.type==="hull"||e.type==="foundry"||e.type==="station"?e.y-e.h>=920:e.y>=(e.hidden?1200:990))||e.x<=-130||e.x>=670||
        (e.y< -110&&e.age>1&&ESCAPE_TYPES.has(e.type));
      if(!e.dead&&!gone)this.enemies[write++]=e;
      else if(!e.dead&&e.type==="hullTurret")this._turretLost(e);
      else if(!e.dead&&CHILD_TYPES.has(e.type))this._childLost(e);
      else if(!e.dead&&e.squad)this._squads.delete(e.squad);  // an escapee spoils the bonus
    }
    this.enemies.length=write;

    write=0;
    for(let read=0;read<this.bullets.length;read++) {
      const b=this.bullets[read];
      if(!b.dead&&b.x> -35&&b.x<575&&b.y> -180&&b.y<945)this.bullets[write++]=b;
    }
    this.bullets.length=write;

    write=0;
    for(let read=0;read<this.shots.length;read++) {
      const s=this.shots[read];
      if(!s.dead&&s.y> -40&&s.y<940&&s.x> -30&&s.x<570)this.shots[write++]=s;
    }
    this.shots.length=write;

    write=0;
    for(let read=0;read<this.pickups.length;read++) {
      const i=this.pickups[read];
      if(!i.dead&&i.y<950)this.pickups[write++]=i;
    }
    this.pickups.length=write;

    write=0;
    for(let read=0;read<this.particles.length;read++) {
      const f=this.particles[read];
      if(f.life>0)this.particles[write++]=f;
    }
    this.particles.length=write;
  }
}
export default Game;
