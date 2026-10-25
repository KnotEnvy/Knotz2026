// Sector 4, IRON MONSOON: campaign flow, drills, Act II enemy behaviour,
// LEVIATHAN, determinism and the bullet cap (docs/design/act-two.md,
// "Sector 4 build contract").
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, CAMPAIGN_STAGES, ACT_TWO_BULLET_CAP } from '../src/game.js';
import { readProgress, markEncounter, recordFlight, readDrillRecords, recordDrill, drillClearTier } from '../src/progress.js';

const REFERENCE = { level: 25, escorts: 6, sidewinder: 4, signature: 4, shield: 3 };
const sortie = (ship = 'kestrel') => {
  const game = new Game(); game.selectShip(ship);
  game.update(0, { start: true }); game.update(1 / 60, {});
  return game;
};
// Sector 4 with no authored beats: a clean field for behaviour tests.
const quietSector4 = (ship = 'kestrel') => {
  const game = sortie(ship);
  game.stage = 4; game.stageTime = 0; game._beatIndex = 999; game._laneIndex = 999; game.stageGoal = [...game.stageGoal]; game.stageGoal[4] = 1e9;
  game.player.invuln = 999;
  return game;
};
const kit = (game, loadout) => {
  Object.assign(game.player, loadout);
  if (loadout.level) game.player.power = loadout.level;
  game._syncEscortSlots(); game._syncOrbitals(); game._syncArsenal();
};
const step = (game, seconds, input = {}) => {
  const seen = [];
  for (let i = 0; i < Math.round(seconds * 60) && game.mode === 'playing'; i++) { game.update(1 / 60, input); seen.push(...game.events); }
  return seen;
};
const count = (events, type) => events.filter(e => e.type === type).length;
// Invulnerable boss tracker: collects drops, shoots deck turrets first, then
// the core, fire held.
const tracker = game => {
  const p = game.player;
  for (const i of game.pickups) if (!i.dead && i.y > 240 && Math.hypot(i.x - p.x, i.y - p.y) < 300)
    return { fire: true, pointerActive: true, pointerX: i.x, pointerY: i.y };
  let tx = game.boss ? game.boss.x : p.x, turret = null;
  for (const e of game.enemies) if (e.type === 'hullTurret' && !e.dead && (!turret || Math.abs(e.x - p.x) < Math.abs(turret.x - p.x))) turret = e;
  if (turret) tx = turret.x;
  return { fire: true, pointerActive: true, pointerX: tx, pointerY: 700 };
};

test('the campaign runs the Crown, an ACT II interlude, sector 4, then victory after LEVIATHAN', () => {
  assert.equal(CAMPAIGN_STAGES, 4);
  const game = sortie(); game.player.invuln = 999;
  game.stage = 3; game._spawnBoss(); game.boss.y = 285;
  game.events = []; game._killEnemy(game.boss);
  assert.equal(count(game.events, 'actTwo'), 1, 'the ACT II card fires once, with the Crown');
  assert.equal(game._transition, 6.5); assert.equal(game._transitionLength, 6.5);
  const interlude = step(game, 6);
  assert.equal(game.stage, 3, 'the act break is longer than an ordinary interlude');
  assert.equal(count(interlude, 'actTwo'), 0);
  const arrival = step(game, 1);
  assert.equal(game.stage, 4); assert.equal(game.mode, 'playing');
  assert.ok(arrival.some(e => e.type === 'stage' && e.value === 4));
  assert.equal(game._transitionLength, 3.5);
  assert.equal(game.stageGoal[4], 95);

  game._spawnBoss();
  assert.equal(game.boss.name, 'LEVIATHAN');
  game.events = []; game._killEnemy(game.boss);
  assert.equal(count(game.events, 'actTwo'), 0); assert.equal(game._transition, 3.5);
  step(game, 4);
  assert.equal(game.mode, 'victory'); assert.equal(game.summary.outcome, 'victory'); assert.equal(game.summary.stage, 4);
});

test('drills 1-4 start at their flagship with the sector kit, and drill 4 uses the power-25 reference kit', () => {
  for (const stage of [1, 2, 3, 4]) {
    const game = new Game(); game.selectShip('wraith'); game.startDrill(stage);
    assert.equal(game.stage, stage); assert.equal(game.practiceStage, stage); assert.ok(game.boss);
    game.events = []; game._killEnemy(game.boss);
    assert.equal(count(game.events, 'actTwo'), 0, 'drills never play the act break');
    step(game, 4); assert.equal(game.mode, 'victory');
  }
  const game = new Game(); game.selectShip('kestrel'); game.startDrill(4);
  const p = game.player;
  assert.deepEqual([p.level, p.power, p.escorts, p.sidewinder, p.signature, p.shield], [25, 25, 6, 4, 4, 3]);
  assert.equal(game.boss.name, 'LEVIATHAN'); assert.equal(game.boss.w, 210); assert.equal(game.boss.h, 80);
  assert.equal(game.boss.turrets.length, 4); assert.equal(game.boss.turretsAlive, 4);
  assert.ok(game.threat > .64 && game.threat < .74, 'the reference kit sits near threat 0.69: ' + game.threat);
  const clamped = new Game(); clamped.startDrill(99); assert.equal(clamped.stage, CAMPAIGN_STAGES);
});

test('career and drill records accept sector 4 and clamp at CAMPAIGN_STAGES', () => {
  const values = new Map(), storage = { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) };
  const progress = readProgress(storage);
  assert.ok(markEncounter(progress, 4)); assert.equal(progress.bossSeen, 4);
  assert.equal(markEncounter(progress, 9), false, 'no flagship past the campaign');
  recordFlight(progress, { shipId: 'manta', outcome: 'victory', score: 900000, bossesDefeated: 7 });
  assert.equal(progress.ships.manta.bestClears, 4);
  const saved = readProgress({ getItem: () => JSON.stringify({ bossSeen: 99, ships: { kestrel: { bestClears: 99 } } }) });
  assert.equal(saved.bossSeen, 4); assert.equal(saved.ships.kestrel.bestClears, 4);
  const clear = { shipId: 'kestrel', practiceStage: 4, outcome: 'victory', time: 70.5, hitsTaken: 3, livesLost: 0 };
  assert.equal(drillClearTier(clear), 'controlled');
  const records = {}; assert.deepEqual(recordDrill(records, clear, storage), { bestTime: 70.5, fewestHits: 3 });
  assert.deepEqual(readDrillRecords(storage)['kestrel-4'], { bestTime: 70.5, fewestHits: 3 });
  assert.equal(recordDrill(records, { ...clear, practiceStage: 5 }, storage), null);
});

test('a hull takes 35% damage while any turret lives; turrets ride their hull and die with it', () => {
  const game = quietSector4();
  const hull = game._spawnHull('destroyer', 185, [[0, -80, 'fan'], [0, 0, 'flak'], [0, 72, 'triple']], ['power']);
  const turrets = game.enemies.filter(e => e.type === 'hullTurret');
  assert.equal(turrets.length, 3); assert.deepEqual(hull.turrets, turrets.map(t => t.id));
  assert.ok(turrets.every(t => t.parentId === hull.id));
  assert.equal(hull.hullClass, 'destroyer'); assert.ok(hull.w > 0 && hull.h > 0);
  const before = hull.hp; game._damageEnemy(hull, 100);
  assert.equal(before - hull.hp, 35, 'armored while turrets live');
  step(game, 1.5);
  for (const t of turrets) { assert.equal(t.x, hull.x + t.ox); assert.equal(t.y, hull.y + t.oy); }
  assert.ok(hull.y > -hull.h, 'the hull scrolls down');
  game.events = [];
  for (const t of turrets) game._killEnemy(t);
  assert.equal(count(game.events, 'turretDown'), 3); assert.equal(hull.turretsAlive, 0);
  assert.deepEqual(game.events.filter(e => e.type === 'turretDown').map(e => e.value), ['fan', 'flak', 'triple']);
  const bare = hull.hp; game._damageEnemy(hull, 100); assert.equal(bare - hull.hp, 100, 'full damage once the turrets are gone');

  const second = game._spawnHull('cruiser', 270, [[0, 0, 'void'], [0, 60, 'broadside']], null);
  const children = game.enemies.filter(e => e.parentId === second.id);
  game.events = []; game._killEnemy(second);
  assert.ok(children.every(t => t.dead), 'turrets die with their hull');
  assert.equal(count(game.events, 'hullDown'), 1); assert.equal(game.events.find(e => e.type === 'hullDown').value, 'cruiser');
  assert.equal(count(game.events, 'turretDown'), 0, 'turrets lost with the hull are not reported as shot down');
});

test('surface ships never hurt on contact; shots over a live turret strike the turret, not the hull', () => {
  const game = quietSector4(), p = game.player; p.invuln = 0; p.shield = 0;
  const hull = game._spawnHull('destroyer', p.x, [[0, -60, 'triple']], null);
  hull.y = p.y; game.enemies.forEach(e => { if (e.type === 'hullTurret') e.y = hull.y - 60; });
  const boat = game._enemy('gunboat', p.x, p.y);
  game.events = []; game._collide();
  assert.equal(count(game.events, 'playerHit'), 0); assert.equal(count(game.events, 'shieldHit'), 0);
  boat.dead = true; game._cleanup();
  const turret = game.enemies.find(e => e.type === 'hullTurret');
  game.threat = .7; // a kitted ship: no weak-kit turret bonus
  const hullHp = hull.hp, turretHp = turret.hp;
  game.shots.push({ x: turret.x, y: hull.y + hull.h * .8, vx: 0, vy: -900, r: 4, damage: 10, kind: 'shot', age: 0 });
  for (let i = 0; i < 40 && game.shots.length; i++) { game._updateShots(1 / 120); game._collide(); game._cleanup(); }
  assert.equal(hull.hp, hullHp, 'the shot flew over the hull'); assert.equal(turretHp - turret.hp, 10);
});

test('a scavenger steals floating salvage, drops it back when shot, and loses it if it escapes', () => {
  const game = quietSector4(), p = game.player;
  kit(game, { level: 9 }); p.x = 270; p.y = 760;
  game._scatterArsenal(270, 500);
  for (const item of game.pickups) { item.vx = 0; item.vy = 0; item.age = 2; item.x = 270; item.y = 420; }
  const token = game.pickups[0];
  const scav = game._enemy('scavenger', 300, 120, { vy: 100 });
  let seen = [];
  for (let i = 0; i < 300 && !scav.carrying; i++) { game.update(1 / 60, {}); seen.push(...game.events); }
  assert.ok(scav.carrying, 'the scavenger reached the salvage');
  const steal = seen.find(e => e.type === 'scavengerSteal');
  assert.ok(steal); assert.equal(steal.value, scav.carrying.type);
  assert.ok(token.dead || !game.pickups.includes(token) || game.pickups.filter(i => i.salvage && !i.dead).length < 4);
  const carried = scav.carrying;
  game.events = []; game._killEnemy(scav);
  assert.equal(count(game.events, 'scavengerDrop'), 1);
  const back = game.pickups.find(i => i.salvage && !i.dead && i.type === carried.type && i.value === carried.value && Math.abs(i.x - scav.x) < 1);
  assert.ok(back, 'the stolen salvage falls back, still salvage');

  const thief = game._enemy('scavenger', 270, 300);
  thief.carrying = { type: 'power', value: 3, life: 6 }; thief.vy = -200;
  const lost = game.stats.salvageLost;
  seen = step(game, 2);
  assert.equal(count(seen, 'scavengerEscape'), 1); assert.ok(thief.dead);
  assert.equal(game.stats.salvageLost, lost + 3, 'escaped salvage counts as lost');
});

test('a scatter in sector 4 calls scavengers after the salvage', () => {
  const game = quietSector4(), p = game.player;
  kit(game, { level: 12, escorts: 2 }); p.invuln = 0; p.shield = 0;
  game._hurtPlayer(p.x, p.y);
  assert.ok(game._scavengerCall > game.time);
  step(game, 1.3);
  assert.ok(game.enemies.some(e => e.type === 'scavenger'), 'scavengers launch about a second after the scatter');
});

test('a mine bursts into a ring when its fuse runs out, but a mine shot down stays silent', () => {
  const game = quietSector4();
  const mine = game._enemy('mine', 270, 200, { fuse: .25 });
  const before = game.bullets.length;
  const events = step(game, .4);
  assert.ok(mine.dead); assert.equal(count(events, 'mineBurst'), 1);
  assert.ok(game.bullets.length - before >= 12, 'a radial ring');
  const quiet = game._enemy('mine', 200, 200, { fuse: .5 });
  game.events = []; game._killEnemy(quiet);
  const after = step(game, .6);
  assert.equal(count(after, 'mineBurst'), 0);
});

test('an enemy torpedo homes slowly, hurts on contact, and can be shot down', () => {
  const game = quietSector4(), p = game.player;
  const torpedo = game._enemy('torpedoEnemy', 270, 200, { heading: Math.PI / 2 + .6, speed: 70 });
  const start = torpedo.heading;
  step(game, .5);
  assert.ok(Math.abs(torpedo.heading - start) > .1, 'it turns toward the ship');
  assert.ok(Math.abs(torpedo.heading - start) < .6, 'slowly');
  game.shots.push({ x: torpedo.x, y: torpedo.y + 4, vx: 0, vy: -800, r: 4, damage: 60, kind: 'shot', age: 0 });
  game.events = []; game._collide();
  assert.ok(torpedo.dead); assert.ok(game.events.some(e => e.type === 'enemyDown' && e.value === 'torpedoEnemy'));
  const second = game._enemy('torpedoEnemy', p.x, p.y);
  p.invuln = 0; p.shield = 0; game.events = []; game._collide();
  assert.equal(count(game.events, 'playerHit'), 1, 'contact hurts'); assert.ok(second);
});

test('interceptor squadrons announce themselves, fly scripted paths, melt and pay a squadron bonus', () => {
  const game = quietSector4(); kit(game, REFERENCE);
  game.events = []; game._spawnSquadron('loop', 1, 6);
  const enter = game.events.find(e => e.type === 'squadronEnter');
  assert.ok(enter); assert.equal(enter.value, 6); assert.equal(enter.path, 'loop');
  const squad = game.enemies.filter(e => e.type === 'interceptor');
  assert.equal(squad.length, 6); assert.ok(squad.every(e => e.squad === squad[0].squad && e.path === 'loop'));
  const events = step(game, 6, { fire: true, pointerActive: true, pointerX: 120, pointerY: 720 });
  assert.equal(count(events, 'squadronBonus'), 1, 'the reference kit wipes the squadron');
  // Rise squadrons start below the field, hidden, and climb.
  game._spawnSquadron('rise', -1, 5);
  const riser = game.enemies.find(e => e.path === 'rise');
  assert.ok(riser.hidden && riser.y > 900);
  step(game, 1.5);
  assert.ok(riser.dead || riser.y < 700, 'it climbs up past the ship');
});

test('LEVIATHAN: deck turrets armor the core x0.25, then broadside, then the monsoon engine', () => {
  const game = new Game(); game.selectShip('manta'); game.startDrill(4);
  const boss = game.boss;
  assert.equal(boss.turrets.length, 4);
  const guns = game.enemies.filter(e => e.type === 'hullTurret').map(e => e.gun);
  assert.deepEqual(guns, ['triple', 'fan', 'flak', 'broadside']);
  const hp = boss.hp; game._damageEnemy(boss, 400); assert.equal(hp - boss.hp, 100, 'core x0.25 while a deck turret lives');
  const events = [], phases = [];
  let turretsDown = 0, drops = 0;
  for (let f = 0; f < 60 * 120 && game.mode === 'playing'; f++) {
    game.player.invuln = 99;
    game.update(1 / 60, tracker(game));
    for (const e of game.events) {
      events.push(e);
      if (e.type === 'turretDown') turretsDown++;
      if (e.type === 'drop' && boss.phase === 1) drops++;
      if (e.type === 'bossPhase') phases.push([e.value, boss.age]);
    }
    if (boss.phase === 2 && boss.age > boss.phaseStart + 3) assert.ok(boss.broadside > .99);
    if (boss.phase === 3 && boss.age > boss.phaseStart + 2) assert.ok(boss.core > .99);
  }
  assert.equal(turretsDown, 4); assert.ok(drops >= 8, 'each deck turret drops power plus a bonus item: ' + drops);
  const full = boss.hp; if (game.boss) { game._damageEnemy(boss, 10); }
  assert.deepEqual(phases.map(([v]) => v), [2, 3]);
  const sides = events.filter(e => e.type === 'broadside').map(e => e.value);
  assert.ok(sides.length >= 4 && sides.every((s, i) => !i || s === -sides[i - 1]), 'broadsides alternate sides');
  assert.ok(events.some(e => e.type === 'torpedoLaunch' && e.value === 'enemy'));
  assert.equal(count(events, 'coreExposed'), 1);
  assert.equal(game.mode, 'victory');
  assert.ok(boss.age >= 60 && boss.age <= 80, 'the reference kit takes 60-80 s: ' + boss.age.toFixed(1));
  assert.ok(full >= 0);
});

test('LEVIATHAN holds a bare ship roughly three times longer than the reference kit', () => {
  const game = new Game(); game.selectShip('kestrel'); game.startDrill(4);
  kit(game, { level: 2, escorts: 0, sidewinder: 0, signature: 0, shield: 0 });
  for (let f = 0; f < 60 * 400 && game.mode === 'playing'; f++) { game.player.invuln = 99; game.update(1 / 60, tracker(game)); }
  assert.equal(game.mode, 'victory');
  assert.ok(game.time >= 150 && game.time <= 240, 'bare kill time ' + game.time.toFixed(1));
});

test('phase 3 launches scavengers at floating salvage', () => {
  const game = new Game(); game.selectShip('wraith'); game.startDrill(4);
  const boss = game.boss;
  for (const t of game.enemies) if (t.type === 'hullTurret') game._killEnemy(t, false, true);
  boss.age = 50; boss.phase = 3; boss.phaseStart = 50; game._leviathanEnterPhase(boss);
  game.pickups.push({ id: 999, x: 120, y: 600, r: 18, type: 'power', age: 3, vx: 0, vy: 0, salvage: true, value: 4, life: 9 });
  step(game, 2.5);
  assert.ok(game.enemies.some(e => e.type === 'scavenger'), 'scavengers launched from the hull');
});

test('identical seeded runs through sector 4 stay identical', () => {
  const run = () => {
    const game = sortie('wraith'); game.stage = 4; game.stageTime = 0; game._beatIndex = 0; game._laneIndex = 0;
    kit(game, REFERENCE);
    const trace = [];
    for (let f = 0; f < 60 * 100; f++) {
      const t = f / 60;
      game.player.invuln = 99;
      game.update(1 / 60, { fire: true, pointerActive: true, pointerX: 270 + Math.sin(t * .7) * 180, pointerY: 700 + Math.cos(t * 1.3) * 60, roll: f % 300 === 0 });
      if (f % 60 === 0) trace.push([game.score, game.enemies.length, game.bullets.length, game.pickups.length, game.player.level,
        Math.round(game.threat * 1000), game.enemies.reduce((s, e) => s + e.x + e.y, 0).toFixed(3), game._seed].join(','));
    }
    return trace;
  };
  const a = run(), b = run();
  assert.equal(a.length, 100); assert.deepEqual(a, b);
});

test('Act II raises the enemy bullet cap to 900; sectors 1-3 keep 700', () => {
  const game = quietSector4();
  assert.equal(game.bulletCap, ACT_TWO_BULLET_CAP); assert.equal(ACT_TWO_BULLET_CAP, 900);
  for (let i = 0; i < 1200; i++) game._bullet(270, 100, Math.PI / 2, 10, 'red', 4);
  assert.equal(game.bullets.length, 900);
  const early = sortie(); early.stage = 3;
  for (let i = 0; i < 1200; i++) early._bullet(270, 100, Math.PI / 2, 10, 'red', 4);
  assert.equal(early.bullets.length, 700);
});

test('threat follows the arsenal: a bare ship sees slower fire and rescue drops, a full kit faster fire', () => {
  const game = quietSector4();
  kit(game, { level: 2, escorts: 0, sidewinder: 0, signature: 0, shield: 0 });
  step(game, 1); assert.equal(game.threat, 0);
  const slow = game._pace();
  const lead = game._enemy('interceptor', 270, 300, { rescue: true, path: 'loop', side: 1 });
  game.events = []; game._killEnemy(lead);
  assert.ok(game.events.some(e => e.type === 'drop' && e.value === 'power'), 'rescue power for a weak ship');
  kit(game, REFERENCE); step(game, 8);
  assert.ok(game.threat > .66 && game.threat < .72, 'threat rises toward the reference kit (0.69): ' + game.threat);
  assert.ok(game._pace() < slow * .6);
  const lead2 = game._enemy('interceptor', 270, 300, { rescue: true, path: 'loop', side: 1 });
  game.events = []; game._killEnemy(lead2);
  assert.ok(!game.events.some(e => e.type === 'drop'), 'no rescue drop for a full kit');
});

test('the authored sector plays every beat: hulls, squadrons, gunboats, minefields and lanes', () => {
  const game = sortie('kestrel'); game.stage = 4; game.stageTime = 0; game._beatIndex = 0; game._laneIndex = 0;
  kit(game, REFERENCE);
  const events = [];
  let peak = 0;
  for (let f = 0; f < 60 * 96 && !game.boss; f++) {
    game.player.invuln = 99;
    // Under the nearest armored target when one is on screen, else a slow sweep.
    let aim = 270 + Math.sin(f / 90) * 200;
    const armored = game.enemies.find(e => !e.dead && (e.type === 'hullTurret' || e.type === 'hull') && e.y > 0 && e.y < 600);
    if (armored) aim = armored.x;
    game.update(1 / 60, { fire: true, pointerActive: true, pointerX: aim, pointerY: 720 });
    events.push(...game.events); peak = Math.max(peak, game.bullets.length);
  }
  assert.ok(game.boss, 'LEVIATHAN arrives at 95 s');
  assert.deepEqual(events.filter(e => e.type === 'hullEnter').map(e => e.value), ['destroyer', 'cruiser']);
  assert.ok(count(events, 'squadronEnter') >= 18);
  assert.ok(count(events, 'squadronBonus') >= 15, 'the reference kit melts the squadrons');
  assert.equal(count(events, 'lane'), 5);
  assert.equal(count(events, 'hullDown'), 2, 'the reference kit sinks both hulls');
  assert.ok(count(events, 'flakEat') > 0, 'the Kestrel flak screen eats bullets');
  assert.ok(peak < ACT_TWO_BULLET_CAP);
});

// ---- Sector 4 round 2 (docs/design/act-two.md, "Simulation notes (sector 4, round 2)") ----

const ARRIVAL = {
  kestrel: { level: 39, escorts: 6, sidewinder: 14, signature: 12, shield: 2 },
  manta: { level: 48, escorts: 6, sidewinder: 16, signature: 12, shield: 3 },
  wraith: { level: 37, escorts: 6, sidewinder: 21, signature: 11, shield: 2 }
};
const MID = { level: 12, escorts: 2, sidewinder: 1, signature: 1, shield: 1 };
const BARE = { level: 2, escorts: 0, sidewinder: 0, signature: 0, shield: 0 };
// A kitted quiet sector with threat already at the kit's level.
const rankedSector4 = (ship, loadout) => {
  const game = quietSector4(ship); kit(game, loadout); game.threat = game._threatTarget();
  return game;
};
const countCalls = (game, name) => {
  const original = game[name], tally = { n: 0 };
  game[name] = (...args) => { tally.n++; return original.apply(game, args); };
  return tally;
};

test('Kestrel flak eats one ordinary bullet per shot near the wing; void rounds pass and one coalesced flakEat reports the count', () => {
  const game = quietSector4('kestrel'); kit(game, { signature: 2 });
  const flak = (x, y, age = 0) => { const s = { x, y, vx: 0, vy: -760, r: 3.2, damage: 6, kind: 'flak', age }; game.shots.push(s); return s; };
  const a = flak(150, 400), b = flak(300, 400);
  const red1 = game._bullet(150, 402, Math.PI / 2, 0, 'red', 4.6), red2 = game._bullet(150, 397, Math.PI / 2, 0, 'red', 4.6);
  const red3 = game._bullet(300, 401, Math.PI / 2, 0, 'amber', 4.6);
  game.events = []; game._collide();
  assert.ok(a.dead && b.dead, 'each flak shot is spent on its eat');
  assert.equal([red1, red2].filter(x => x.dead).length, 1, 'one flak shot eats exactly one bullet');
  assert.ok(red3.dead);
  const eats = game.events.filter(e => e.type === 'flakEat');
  assert.equal(eats.length, 1, 'coalesced per frame'); assert.equal(eats[0].value, 2);
  assert.equal(game.stats.flakEats, 2);

  game.shots.length = 0; game.bullets.length = 0; game.events = [];
  const c = flak(200, 400);
  const voidRound = game._bullet(200, 400, Math.PI / 2, 0, 'void', 5);
  game._collide();
  assert.ok(!voidRound.dead && !c.dead, 'flak cannot eat a void round');
  assert.equal(count(game.events, 'flakEat'), 0);

  game.shots.length = 0; game.bullets.length = 0;
  const far = flak(250, 300, .31);
  const red4 = game._bullet(250, 300, Math.PI / 2, 0, 'red', 4.6);
  game._collide();
  assert.ok(!far.dead && !red4.dead, 'flak far past the wing (age > 0.3 s) no longer screens');

  const manta = quietSector4('manta'); kit(manta, { signature: 2 });
  manta.shots.push({ x: 200, y: 400, vx: 0, vy: -760, r: 3.2, damage: 6, kind: 'flak', age: 0 });
  const red5 = manta._bullet(200, 400, Math.PI / 2, 0, 'red', 4.6);
  manta._collide(); assert.ok(!red5.dead, 'only the Kestrel signature screens');
});

test('Kestrel and Wraith share a 7 px hurtbox; Manta keeps 9', () => {
  for (const [ship, r] of [['kestrel', 7], ['manta', 9], ['wraith', 7]]) {
    const game = new Game(); game.selectShip(ship); assert.equal(game.player.r, r, ship);
    game.update(0, { start: true }); assert.equal(game.player.r, r, ship + ' after launch');
  }
  const fresh = new Game(); assert.equal(fresh.player.r, 7, 'the default airframe is the Kestrel');
});

test('threat curve: 0 bare, ~0.25 mid, ~0.69 reference, 0.85-0.88 Crown arrival, saturating and monotone', () => {
  const game = quietSector4();
  const at = loadout => { kit(game, loadout); return game._threatTarget(); };
  assert.equal(at(BARE), 0);
  const mid = at(MID), ref = at(REFERENCE);
  assert.ok(mid > .2 && mid < .3, 'mid kit ' + mid);
  assert.ok(ref > .66 && ref < .72, 'reference kit ' + ref);
  for (const [ship, loadout] of Object.entries(ARRIVAL)) {
    const t = at(loadout);
    assert.ok(t > .84 && t < .88, ship + ' arrival ' + t);
    assert.ok(t - ref > .12, 'the rank still separates arrival kits from the reference kit');
  }
  const extreme = at({ level: 9999, escorts: 6, sidewinder: 99, signature: 99, shield: 3 });
  assert.ok(extreme <= .88 && extreme > .879, 'saturates at 0.88: ' + extreme);
  let last = -1;
  for (let level = 1; level <= 90; level += 1) {
    const t = at({ level, escorts: 6, sidewinder: 4, signature: 4, shield: 3 });
    assert.ok(t >= last, 'monotone in the arsenal'); last = t;
  }
  // Fire cadence: 1.8x slower bare, ~0.74 for the reference kit, ~0.62 for an arrival kit.
  game.threat = 0; assert.equal(game._pace(), 1.8);
  game.threat = ref; assert.ok(Math.abs(game._pace() - .74) < .02, 'reference pace ' + game._pace());
  game.threat = .87; assert.ok(Math.abs(game._pace() - .62) < .02, 'arrival pace ' + game._pace());
  game.threat = ref; assert.ok(Math.abs(game._bossPace() - .96) < .02, 'LEVIATHAN pace for the reference kit ' + game._bossPace());
});

test('a scatter eases threat while the ship rebuilds, and recovering the salvage restores it', () => {
  const game = quietSector4(); const p = game.player;
  kit(game, REFERENCE); step(game, 8);
  const before = game.threat;
  p.invuln = 0; p.shield = 0; game._hurtPlayer(p.x, p.y);
  game._scavengerCall = 0; // isolate the rank from the scavenger race
  step(game, 1.5);
  assert.ok(game.threat < before - .4, `threat falls after the scatter: ${before.toFixed(2)} -> ${game.threat.toFixed(2)}`);
  for (const item of game.pickups) if (item.salvage && !item.dead) { item.dead = true; game._collect(item); }
  const target = game._threatTarget();
  assert.ok(target > .58, 'the recovered kit (power burned 20%, shields spent) targets ~0.62: ' + target);
  step(game, 4);
  assert.ok(game.threat > .5, 'the rank climbs back at 0.15/s: ' + game.threat);
});

test('a non-finite arsenal degrades threat to 0 instead of silencing Act II fire', () => {
  const game = quietSector4();
  game.player.sidewinder = NaN; game._syncArsenal();
  step(game, 1);
  assert.equal(game.threat, 0);
  assert.ok(Number.isFinite(game._pace()) && Number.isFinite(game._bossPace()));
  game.player.sidewinder = Infinity; game._syncArsenal(); assert.equal(game._threatTarget(), 0);
  game.player.sidewinder = NaN; game._syncArsenal();
  const boat = game._enemy('gunboat', 270, 100, { fireAt: .2 }); boat.vy = 0;
  const before = game.bullets.length; step(game, 1);
  assert.ok(game.bullets.length > before, 'Act II sources still fire');
});

test('hull turrets take +50% damage from a stripped ship (threat < 0.3); hulls and kitted ships are unchanged', () => {
  const game = quietSector4();
  const hull = game._spawnHull('cruiser', 270, [[0, 0, 'void']], null);
  const turret = game.enemies.find(e => e.type === 'hullTurret');
  assert.equal(turret.maxHp, 1600, 'cruiser turrets carry 1,600 HP');
  const dealt = (target, threat) => { game.threat = threat; const hp = target.hp; game._damageEnemy(target, 100); return hp - target.hp; };
  assert.equal(dealt(turret, 0), 150); assert.equal(dealt(turret, .29), 150);
  assert.equal(dealt(turret, .3), 100); assert.equal(dealt(turret, .8), 100);
  assert.equal(dealt(hull, 0), 35, 'the hull itself keeps its x0.35 armor rule');
  const drill = new Game(); drill.startDrill(4); kit(drill, BARE); drill.threat = 0;
  const deck = drill.enemies.find(e => e.type === 'hullTurret'), hp = deck.hp;
  drill._damageEnemy(deck, 100); assert.equal(hp - deck.hp, 150, 'LEVIATHAN deck turrets too');
});

test('a kitted ship meets interceptor entry bursts at the field edge as 3-way rounds plus a third burst; a stripped ship meets only the mid-path burst', () => {
  const pass = loadout => {
    const game = rankedSector4('kestrel', loadout);
    const bullets = countCalls(game, '_bullet');
    game._spawnSquadron('loop', 1, 1);
    const craft = game.enemies.find(e => e.type === 'interceptor');
    let entry = null, entryY = null, maxFired = 0;
    for (let i = 0; i < 60 * 7 && !craft.dead && game.enemies.includes(craft); i++) {
      game.update(1 / 60, {});
      if (craft.fired >= 1 && entryY === null && craft.burstLeft > 0) entryY = craft.y;
      if (craft.fired === 1 && craft.burstLeft === 0 && entry === null) entry = bullets.n;
      maxFired = Math.max(maxFired, craft.fired);
    }
    return { entry, entryY, maxFired, total: bullets.n, threat: game.threat };
  };
  const kitted = pass(REFERENCE);
  assert.equal(kitted.entry, 9, 'three 3-way rounds on entry');
  assert.ok(kitted.entryY < 40, 'the entry burst fires as the craft clears the edge: y ' + kitted.entryY);
  assert.equal(kitted.maxFired, 3, 'a third burst follows the mid-path burst');
  const stripped = pass(BARE);
  assert.equal(stripped.maxFired, 2, 'the entry burst is skipped');
  assert.equal(stripped.total, 1, 'one single round, mid-path');
});

test('gunboats add a re-aimed follow-up burst for a kitted ship only', () => {
  const volleys = loadout => {
    const game = rankedSector4('kestrel', loadout);
    const spreads = countCalls(game, '_spread');
    const boat = game._enemy('gunboat', 270, 100, { fireAt: .1 }); boat.vy = 0;
    step(game, 1.3);
    return spreads.n;
  };
  assert.equal(volleys(REFERENCE), 6, '4 volleys, then a 2-volley follow-up');
  assert.equal(volleys(BARE), 2, 'a bare ship meets 2 volleys and no follow-up');
});

test('the cruiser fires torpedo pairs every 3.2 s; mines fuse in 3.5-5.0 s; the opening squadron waits for the intro card', () => {
  const game = quietSector4();
  game._spawnActTwoBeat('cruiser');
  const cruiser = game.enemies.find(e => e.type === 'hull');
  assert.ok(game.enemies.filter(e => e.parentId === cruiser.id).every(t => t.maxHp === 1600));
  const launches = [];
  for (let i = 0; i < 60 * 14; i++) { game.update(1 / 60, {}); if (game.events.some(e => e.type === 'torpedoLaunch' && e.value === 'enemy')) launches.push(cruiser.age); }
  assert.ok(launches.length >= 2, 'torpedo pairs launched: ' + launches.length);
  assert.ok(Math.abs(launches[1] - launches[0] - 3.2) < .02, 'cycle ' + (launches[1] - launches[0]).toFixed(3));

  const field = quietSector4();
  field._spawnActTwoBeat('minefield'); field.stageTime = 60; field._spawnActTwoBeat('minefield');
  const fuses = field.enemies.filter(e => e.type === 'mine').map(e => e.fuse);
  assert.ok(fuses.length >= 12 && fuses.every(f => f >= 3.5 && f <= 5.0), 'fuses ' + Math.min(...fuses).toFixed(2) + '-' + Math.max(...fuses).toFixed(2));

  const opening = sortie(); opening.stage = 4; opening.stageTime = 0; opening._beatIndex = 0; opening._laneIndex = 0;
  opening.player.invuln = 999;
  assert.equal(count(step(opening, 2.4), 'squadronEnter'), 0, 'nothing enters under the 3.4 s intro card before 2.5 s');
  assert.equal(count(step(opening, .2), 'squadronEnter'), 1);
});

test('a sector scatter calls two scavengers 0.6 s later: from the side edges for a kitted ship, from the top for a stripped one', () => {
  const callIn = loadout => {
    const game = rankedSector4('wraith', loadout), p = game.player;
    p.invuln = 0; p.shield = 0; game._hurtPlayer(p.x, p.y);
    assert.ok(Math.abs(game._scavengerCall - game.time - .6) < 1e-9);
    const salvage = game.pickups.filter(i => i.salvage && !i.dead);
    step(game, .5); assert.ok(!game.enemies.some(e => e.type === 'scavenger'), 'not before the call-in');
    step(game, .15);
    return { scavengers: game.enemies.filter(e => e.type === 'scavenger'), salvage };
  };
  const kitted = callIn(REFERENCE);
  assert.equal(kitted.scavengers.length, 2);
  for (const s of kitted.scavengers) {
    assert.ok(s.x < 60 || s.x > 480, 'cuts in from a side edge: x ' + s.x.toFixed(0));
    assert.ok(s.y > 140 && s.y < 760, 'level with the salvage: y ' + s.y.toFixed(0));
  }
  const stripped = callIn({ level: 4, escorts: 0, sidewinder: 0, signature: 0, shield: 0 });
  assert.equal(stripped.scavengers.length, 2);
  assert.ok(stripped.scavengers.every(s => s.y < 120), 'a ship that was already stripped meets the top dive');
});

test('void rounds are never smaller than r 5', () => {
  const game = quietSector4();
  assert.equal(game._bullet(270, 100, 1, 100, 'void', 4.4).r, 5);
  assert.equal(game._bullet(270, 100, 1, 100, 'void', 5.6).r, 5.6);
  assert.equal(game._bullet(270, 100, 1, 100, 'red', 4.4).r, 4.4);
  const wraith = rankedSector4('wraith', REFERENCE);
  wraith._spawnSquadron('loop', 1, 1);
  step(wraith, 4);
  const voids = wraith.bullets.filter(b => b.kind === 'void');
  assert.ok(voids.length > 0 && voids.every(b => b.r >= 5), 'interceptor void rounds read at r 5');
});

test('LEVIATHAN sways within the field: bow, stern and the rolled-out broadside stay inside 0-540', () => {
  const game = new Game(); game.selectShip('wraith'); game.startDrill(4);
  const boss = game.boss;
  let minX = 999, maxX = -999;
  for (let f = 0; f < 60 * 40 && game.boss; f++) {
    game.player.invuln = 99; game.update(1 / 60, {});
    minX = Math.min(minX, boss.x); maxX = Math.max(maxX, boss.x);
    assert.ok(boss.x - boss.w - 22 >= 0 && boss.x + boss.w + 22 <= 540, 'inside the field at x ' + boss.x.toFixed(1));
  }
  assert.ok(maxX - 270 > 19 && 270 - minX > 19, 'it still sways about +/-20');
  assert.equal(boss.w, 210, 'the collision ellipse keeps the drawn 210x80 hull');
});

test('LEVIATHAN death carries its last pose for the sinking hull, and takes turrets, torpedoes and mines with it', () => {
  const game = new Game(); game.selectShip('manta'); game.startDrill(4);
  const boss = game.boss;
  boss.phase = 2; boss.broadside = .6; boss.core = .2; boss.angle = .01; boss.x = 281; boss.y = 190;
  const torpedo = game._enemy('torpedoEnemy', 270, 300, {});
  const mine = game._enemy('mine', 200, 200, { fuse: 30 });
  const turrets = game.enemies.filter(e => e.type === 'hullTurret');
  game.events = []; game._killEnemy(boss);
  const down = game.events.find(e => e.type === 'bossDown');
  assert.deepEqual({ x: down.x, y: down.y, value: down.value, w: down.w, h: down.h, angle: down.angle, broadside: down.broadside, core: down.core },
    { x: 281, y: 190, value: 4, w: 210, h: 80, angle: .01, broadside: .6, core: .2 });
  assert.equal(game.boss, null);
  assert.ok(turrets.every(t => t.dead) && torpedo.dead && mine.dead, 'children go down with the flagship');
  assert.equal(count(game.events, 'turretDown'), 0, 'deck turrets lost with the hull are not reported as shot down');
  step(game, .2);
  assert.ok(!game.enemies.some(e => !e.dead && ['torpedoEnemy', 'mine', 'hullTurret'].includes(e.type)));
  const crown = sortie(); crown.stage = 3; crown._spawnBoss(); crown.events = []; crown._killEnemy(crown.boss);
  assert.equal(crown.events.find(e => e.type === 'bossDown').broadside, undefined, 'earlier flagships keep the plain event');
});

test('pause freezes LEVIATHAN and resumes it', () => {
  const game = new Game(); game.selectShip('kestrel'); game.startDrill(4);
  step(game, 2);
  const age = game.boss.age, time = game.time, bullets = game.bullets.length;
  game.update(1 / 60, { pause: true }); assert.equal(game.mode, 'paused');
  game.update(1 / 60, {}); game.update(1 / 60, {});
  assert.equal(game.boss.age, age); assert.equal(game.time, time); assert.equal(game.bullets.length, bullets);
  game.update(1 / 60, { pause: true }); assert.equal(game.mode, 'playing');
  step(game, .5); assert.ok(game.boss.age > age, 'the fight resumes');
});

test('a bomb damages LEVIATHAN in every phase, through the deck armor rule', () => {
  const game = new Game(); game.selectShip('kestrel'); game.startDrill(4);
  const boss = game.boss, p = game.player;
  const bomb = () => { p.bombs = 1; const hp = boss.hp; game._bomb(); return hp - boss.hp; };
  assert.equal(bomb(), 97.5, 'phase 1 with deck turrets alive: 390 x 0.25');
  for (const t of game.enemies.filter(e => e.type === 'hullTurret')) game._killEnemy(t, false, true);
  for (const phase of [1, 2, 3]) { boss.phase = phase; assert.equal(bomb(), 390, 'phase ' + phase + ' with the deck cleared'); }
  const hull = rankedSector4('kestrel', REFERENCE);
  const destroyer = hull._spawnHull('destroyer', 270, [[0, -60, 'triple']], null), gun = hull.enemies.find(e => e.type === 'hullTurret');
  hull.player.bombs = 1; const dh = destroyer.hp, gh = gun.hp; hull._bomb();
  assert.ok(Math.abs(dh - destroyer.hp - 140) < 1e-9); assert.equal(gh - gun.hp, 400);
});

test('scavenger edge cases: stale targets, the interlude, stolen salvage across a sector change, and the stats', () => {
  // The player collects the target first: the scavenger retargets with no phantom steal.
  const stale = quietSector4();
  stale.pickups.push({ id: 4242, x: 270, y: 600, r: 18, type: 'power', age: 3, vx: 0, vy: 0, salvage: true, value: 2, life: 9 });
  const hunter = stale._enemy('scavenger', 270, 200); hunter.targetPickupId = 4242;
  stale.pickups[0].dead = true; stale.events = [];
  for (let i = 0; i < 120; i++) stale._updateScavenger(hunter, 1 / 60, stale.player);
  assert.ok(!hunter.carrying); assert.equal(count(stale.events, 'scavengerSteal'), 0);

  // A carrier still alive when LEVIATHAN arrives takes its salvage along, counted once.
  const arrival = quietSector4();
  const carrier = arrival._enemy('scavenger', 270, 300); carrier.carrying = { type: 'power', value: 3, life: 6 };
  const lostBefore = arrival.stats.salvageLost;
  arrival._spawnBoss();
  assert.equal(arrival.stats.salvageLost, lostBefore + 3); assert.equal(arrival.boss.name, 'LEVIATHAN');

  // An escape counts as lost exactly once.
  const escape = quietSector4();
  const thief = escape._enemy('scavenger', 270, 300); thief.carrying = { type: 'escort', value: 2, life: 6 };
  thief.vy = -400; thief.y = -29;
  const lostEscape = escape.stats.salvageLost;
  const escaped = step(escape, 1);
  assert.ok(thief.dead); assert.equal(count(escaped, 'scavengerEscape'), 1);
  assert.equal(escape.stats.salvageLost, lostEscape + 2);

  // Shot down during the act break: the salvage falls back and the interlude
  // collects it on the way into sector 4; nothing is lost or counted twice.
  const crown = sortie(); crown.player.invuln = 999; crown.stage = 3; crown._spawnBoss(); crown.boss.y = 285;
  const runner = crown._enemy('scavenger', 270, 400); runner.carrying = { type: 'signature', value: 2, life: 7 };
  crown._killEnemy(crown.boss);
  assert.ok(runner.dead, 'everything the flagship fielded goes down with it');
  const back = crown.pickups.find(i => i.salvage && !i.dead && i.type === 'signature');
  assert.ok(back && back.value === 2 && back.life >= 5, 'the carried salvage falls back as salvage');
  const recovered = crown.stats.salvageRecovered, lost = crown.stats.salvageLost, signature = crown.player.signature;
  const late = crown._enemy('scavenger', 200, 420); late.carrying = { type: 'escort', value: 1, life: 6 };
  crown.events = []; crown._killEnemy(late);
  assert.equal(count(crown.events, 'scavengerDrop'), 1, 'killed during the interlude, it drops its salvage');
  step(crown, 7);
  assert.equal(crown.stage, 4);
  assert.equal(crown.stats.salvageRecovered, recovered + 3, 'both pieces are collected by the interlude');
  assert.equal(crown.stats.salvageLost, lost); assert.equal(crown.player.signature, signature + 2);
});

test('Crown-arrival kits kill LEVIATHAN in 52-72 s (pinned)', () => {
  for (const [ship, loadout] of Object.entries(ARRIVAL)) {
    const game = new Game(); game.selectShip(ship); game.startDrill(4); kit(game, loadout);
    const boss = game.boss;
    for (let f = 0; f < 60 * 120 && game.mode === 'playing'; f++) { game.player.invuln = 99; game.update(1 / 60, tracker(game)); }
    assert.equal(game.mode, 'victory', ship);
    assert.ok(boss.age >= 52 && boss.age <= 72, `${ship} arrival kill ${boss.age.toFixed(1)} s`);
  }
});
