// Arsenal round 2: boss guard clock, ramp, squadron bonus, scatter tuning,
// caps that convert to power, ship reset, event hygiene and determinism.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';

const SHIPS = ['kestrel', 'manta', 'wraith'];
const sortie = (ship = 'kestrel') => {
  const game = new Game(); game.selectShip(ship);
  game.update(0, { start: true }); game.update(1/60, {});
  assert.equal(game.mode, 'playing');
  return game;
};
const quiet = (ship = 'kestrel') => {
  const game = sortie(ship);
  game._beatIndex = 999; game._laneIndex = 999; game.stageTime = -1e6;
  return game;
};
const kit = (game, loadout) => {
  Object.assign(game.player, loadout);
  if (loadout.level) game.player.power = loadout.level;
  game._syncEscortSlots(); game._syncOrbitals(); game._syncArsenal();
};
const give = (game, type, extra = {}) => {
  const p = game.player; game.events = [];
  game.pickups.push({ x: p.x, y: p.y, r: 16, type, age: 0, vy: 0, ...extra });
  game._collide();
};
const types = game => game.events.map(e => e.type);
// Engaged no-hit pilot: fire held, lines up under the lowest enemy on screen
// and detours to nearby pickups. Invulnerability keeps the run hit-free.
const pilot = game => {
  const p = game.player;
  let tx = p.x, ty = 700, pick = null, best = 1e9;
  for (const i of game.pickups) {
    if (i.dead || i.y < 160 || i.y > 860) continue;
    const d = Math.hypot(i.x - p.x, i.y - p.y);
    if (d < 300 && d < best) { best = d; pick = i; }
  }
  if (pick) { tx = pick.x; ty = Math.max(230, Math.min(820, pick.y + 10)); }
  else {
    let low = null;
    for (const e of game.enemies) if (!e.dead && e.y > -10 && e.y < 640 && (!low || e.y > low.y)) low = e;
    if (low) tx = low.x;
  }
  return { fire: true, pointerActive: true, pointerX: tx, pointerY: ty };
};
// Invulnerable boss duel: track the flagship's x with fire held.
const duel = (ship, stage, loadout) => {
  const game = new Game(); game.selectShip(ship); game.startDrill(stage); kit(game, loadout);
  const boss = game.boss, starts = [0], guards = [], ends = [];
  let phase = 1;
  for (let f = 0; f < 60 * 60 && game.mode === 'playing'; f++) {
    game.player.invuln = 99;
    game.update(1/60, { fire: true, pointerActive: true, pointerX: boss.x, pointerY: 720 });
    for (const e of game.events) { if (e.type === 'bossGuard') guards.push(e.value); if (e.type === 'bossGuardEnd') ends.push(e.value); }
    if (boss.phase !== phase) { phase = boss.phase; starts.push(boss.age); }
  }
  assert.equal(game.mode, 'victory');
  return { time: boss.age, starts, guards, ends, boss };
};
const DRILL_VESPER = { level: 6, escorts: 2, sidewinder: 1, signature: 0 };
const MAXED = { level: 15, escorts: 6, sidewinder: 4, signature: 4 };

test('sorties start at power 2; scatters and respawns still leave a bare level-1 ship', () => {
  const game = sortie(); const p = game.player;
  assert.equal(p.level, 2); assert.equal(p.power, 2); assert.equal(game.stats.powerPeak, 2);
  game._beatIndex = 999; game._laneIndex = 999;
  game._hurtPlayer(p.x, p.y);
  assert.equal(p.level, 1, 'the sortie bonus level scatters like any other');
  assert.equal(game.pickups.filter(t => t.salvage).length, 1);
});

test('selectShip resets the airframe to a bare sortie loadout', () => {
  const game = sortie('wraith');
  kit(game, { level: 14, escorts: 6, sidewinder: 3, signature: 4, reflector: 5, shield: 3 });
  assert.equal(game.player.orbitals.length, 4);
  game.mode = 'gameover';
  assert.equal(game.selectShip('kestrel'), true);
  const p = game.player;
  assert.deepEqual([p.level, p.power, p.escorts, p.escortSlots.length, p.sidewinder, p.signature, p.reflector, p.orbitals.length, p.drones],
    [2, 2, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(p.shield, 0); assert.equal(p.maxShield, 0); assert.equal(p.shieldCap, 3);
  assert.equal(p.arsenal, 1, 'the derived arsenal is re-synced');
  game.shots.length = 0; game._updateArsenal(1/60, true);
  assert.equal(game.shots.filter(s => s.kind === 'orbital').length, 0, 'no stale orbitals fire on the new ship');
  game.selectShip('manta');
  assert.equal(game.player.shield, 1); assert.equal(game.player.maxShield, 1);
});

test('guarded damage speeds the boss clock: a maxed arsenal kills Vesper far sooner than the drill kit', () => {
  for (const ship of SHIPS) {
    const drill = duel(ship, 1, DRILL_VESPER), maxed = duel(ship, 1, MAXED);
    assert.ok(drill.time > 19 && drill.time < 22.5, ship + ' drill kit keeps the authored pace: ' + drill.time.toFixed(2));
    assert.ok(maxed.time > 12 && maxed.time < 15, ship + ' maxed arsenal kills Vesper in 12-15 s: ' + maxed.time.toFixed(2));
    assert.ok(drill.time - maxed.time > 5, ship + ' power is rewarded');
    assert.deepEqual(maxed.guards, [1, 2, 3], 'every phase still raises its guard cue');
    assert.deepEqual(maxed.ends, [1, 2, 3], 'and ends it');
  }
});

test('no boss phase is shorter than 55% of its authored learn window, however strong the arsenal', () => {
  const minimum = [5.5, 4.4, 2.2];
  for (const stage of [1, 2, 3]) {
    const { starts, time } = duel('manta', stage, { level: 60, escorts: 6, sidewinder: 12, signature: 12 });
    const ends = [...starts.slice(1), time];
    starts.forEach((start, i) => assert.ok(ends[i] - start >= minimum[i] - 1/60,
      `stage ${stage} phase ${i + 1} lasted ${(ends[i] - start).toFixed(2)} s`));
  }
});

test('the guard countdown (guardUntil) falls faster than real time while the floor soaks damage', () => {
  const game = quiet(); game._spawnBoss(); const boss = game.boss;
  boss.age = 3; boss.y = 285; boss.hp = boss.maxHp * .66 + 5;
  game._damageEnemy(boss, 200);
  assert.equal(boss.guard, true); assert.equal(boss.guardUntil, 10);
  for (let i = 0; i < 120; i++) { boss.age += 1/120; game._damageEnemy(boss, 18); game._updateBossGuard(boss, 1/120); }
  assert.ok(boss.learnShift > .5, 'soaked damage buys learn age');
  assert.ok(boss.guardUntil < 10 - .5 && boss.guardUntil >= 5.5, 'the unlock moves earlier but not past the phase minimum');
  boss.age = boss.guardUntil + .01; game.events = []; game._updateEnemies(1/120);
  assert.equal(boss.phase, 2); assert.ok(types(game).includes('bossGuardEnd'));
  assert.ok(boss.age < 10, 'phase two arrives before the authored ten seconds');
});

test('shield charges cap at 3 for every ship; S pickups at the cap become +1 power', () => {
  const game = quiet(), p = game.player;
  for (let i = 0; i < 3; i++) give(game, 'shield');
  assert.equal(p.shield, 3); assert.equal(p.level, 2);
  give(game, 'shield');
  assert.equal(p.shield, 3); assert.equal(p.level, 3);
  assert.ok(game.events.some(e => e.type === 'powerUp' && e.value === 3), 'overflow announces the power level');
  assert.ok(!types(game).includes('shieldUp'), 'no shieldUp when nothing was added');
  const manta = quiet('manta');
  give(manta, 'shield'); assert.equal(manta.player.shield, 3, 'Manta: 1 + 2');
  give(manta, 'shield'); assert.equal(manta.player.shield, 3); assert.equal(manta.player.level, 3);
  manta.player.shield = 2; give(manta, 'shield');
  assert.equal(manta.player.shield, 3, 'a partial top-up fills the bank'); assert.equal(manta.player.level, 3);
});

test('a bomb pickup with a full bay (4) becomes +1 power', () => {
  const game = quiet(), p = game.player;
  p.bombs = 3; give(game, 'bomb'); assert.equal(p.bombs, 4); assert.equal(p.level, 2);
  give(game, 'bomb'); assert.equal(p.bombs, 4); assert.equal(p.level, 3);
  assert.ok(game.events.some(e => e.type === 'powerUp' && e.value === 3));
});

test('the sector-1 opening ramps an engaged pilot to power 4, power 6 and an escort pair quickly', () => {
  for (const ship of SHIPS) {
    const game = sortie(ship), at = {};
    for (let f = 0; f < 60 * 26; f++) {
      game.player.invuln = 99; game.update(1/60, pilot(game));
      const p = game.player;
      if (p.level >= 4) at.p4 ??= game.time;
      if (p.level >= 6) at.p6 ??= game.time;
      if (p.escorts >= 2) at.escort ??= game.time;
    }
    assert.ok(at.p4 <= 10.5, `${ship} power 4 at ${at.p4}`);
    assert.ok(at.p6 <= 25, `${ship} power 6 at ${at.p6}`);
    assert.ok(at.escort <= 20, `${ship} first escort pair at ${at.escort}`);
  }
});

test('wiping a whole formation drops a two-item bonus fan; one escapee spoils it', () => {
  const wipe = quiet(); wipe.stage = 1; wipe.stageTime = 30;
  wipe._spawnStageBeat('drift');
  const squad = wipe.enemies.filter(e => e.squad);
  assert.equal(squad.length, 3);
  wipe.events = [];
  for (const e of squad) wipe._killEnemy(e);
  const bonus = wipe.events.filter(e => e.type === 'squadronBonus');
  assert.equal(bonus.length, 1); assert.equal(bonus[0].value, 3); assert.equal(bonus[0].drops, 2);
  const last = squad[2];
  assert.equal(bonus[0].x, last.x); assert.equal(bonus[0].y, last.y);
  assert.equal(wipe.pickups.length, 2, 'the fan is two pickups at the last kill');
  assert.equal(wipe.pickups[0].type, 'power');
  assert.notEqual(wipe.pickups[1].type, 'power', 'the second item is equipment');
  assert.equal(wipe.stats.squadronBonuses, 1);

  const spoiled = quiet(); spoiled.stage = 1; spoiled.stageTime = 30;
  spoiled._spawnStageBeat('drift');
  const [runner, ...rest] = spoiled.enemies;
  runner.y = 1000; spoiled._cleanup();
  assert.ok(!spoiled.enemies.includes(runner));
  spoiled.events = [];
  for (const e of rest) spoiled._killEnemy(e);
  assert.ok(!types(spoiled).includes('squadronBonus'));
  assert.equal(spoiled.pickups.length, 0);

  for (const pattern of ['split', 'wing', 'ace', 'bomber', 'cross']) {
    const g = quiet(); g.stage = 1; g.stageTime = 30; g._spawnStageBeat(pattern);
    const members = g.enemies.filter(e => e.squad);
    assert.ok(members.length >= 3, pattern + ' spawns a squadron');
    assert.ok(g.enemies.filter(e => e.type === 'carrier').every(e => !e.squad), 'carriers fly outside the squadron');
    g.events = []; for (const e of members) g._killEnemy(e);
    assert.equal(g.events.filter(e => e.type === 'squadronBonus').length, 1, pattern + ' pays out once');
  }
});

test('salvage magnet shrinks (64 / 100 px) and a finished roll boosts it x1.8 for 0.35 s', () => {
  const token = (game, dx) => {
    const p = game.player, item = { x: p.x + dx, y: p.y, r: 18, type: 'power', age: 1, vx: 0, vy: 0, salvage: true, value: 2, life: 9 };
    game.pickups.push(item); return item;
  };
  const game = quiet(), p = game.player;
  const far = token(game, 90), near = token(game, 60);
  game._updatePickups(1/120);
  assert.ok(near.x < p.x + 60, 'inside 64 px: pulled in');
  assert.ok(far.x >= p.x + 90 - 1e-9, 'at 90 px: out of reach unfocused');
  p.focus = true; game._updatePickups(1/120); p.focus = false;
  assert.ok(far.x < p.x + 90, 'focus widens the magnet to 100 px');

  const roller = quiet(), q = roller.player;
  roller.update(1/60, { roll: true, right: true });
  assert.ok(q.roll > 0); assert.equal(q.magnetBoost, 0);
  let frames = 0;
  while (q.roll > 0 && frames++ < 60) roller.update(1/60, {});
  assert.ok(q.magnetBoost > .3 && q.magnetBoost <= .35, 'the roll ending opens a 0.35 s magnet pulse');
  const reach = token(roller, 110);
  roller._updatePickups(1/120);
  assert.ok(reach.x < q.x + 110, '110 px is inside the boosted 64 x 1.8 = 115 px magnet');
  for (let i = 0; i < 30; i++) roller.update(1/60, {});
  assert.equal(q.magnetBoost, 0, 'the pulse expires');
});

test('recovering salvage emits salvageRecover (with amount) instead of pickup, and keeps follow-on events', () => {
  const game = quiet(), p = game.player;
  give(game, 'escort', { salvage: true, value: 2, life: 9, age: 2 });
  assert.equal(p.escorts, 4);
  assert.deepEqual(game.events.filter(e => e.type === 'salvageRecover').map(e => [e.value, e.amount]), [['escort', 2]]);
  assert.ok(!types(game).includes('pickup'));
  assert.ok(game.events.some(e => e.type === 'escortJoin' && e.value === 4));
  give(game, 'escort');
  assert.ok(types(game).includes('pickup'), 'ordinary pickups still report pickup');
  assert.ok(!types(game).includes('salvageRecover'));
});

test('a stage advance counts uncollected salvage as lost before clearing it', () => {
  const game = quiet(), p = game.player;
  kit(game, { level: 9, escorts: 2, sidewinder: 1 });
  game._spawnBoss(); game.boss.y = 280;
  p.invuln = 0; game._hurtPlayer(80, 300);
  const tokens = game.pickups.filter(t => t.salvage);
  const parked = tokens[0]; parked.y = -30; parked.vy = 0; parked.vx = 0;  // off screen: the interlude skips it
  game._killEnemy(game.boss);
  for (let i = 0; i < 240 && game.stage === 1; i++) { p.invuln = 99; game.update(1/60, {}); }
  assert.equal(game.stage, 2);
  assert.equal(game.pickups.length, 0);
  assert.equal(game.stats.salvageLost, parked.value);
});

test('pierce rails respect the impact cooldown instead of flooding contact cues', () => {
  const game = new Game(); game.selectShip('wraith'); game.startDrill(1);
  kit(game, MAXED);
  let cues = 0;
  for (let f = 0; f < 60 * 9; f++) {
    game.player.invuln = 99;
    game.update(1/60, { fire: true, pointerActive: true, pointerX: game.boss.x, pointerY: 720 });
    if (game.boss.age > 4 && game.boss.age <= 9)
      cues += game.events.filter(e => ['railHit', 'bossCoreHit', 'bossArmorHit', 'chipHit'].includes(e.type)).length;
  }
  assert.ok(cues / 5 < 18, 'contact cues per second on the flagship: ' + (cues / 5).toFixed(1));
  assert.ok(cues / 5 > 5, 'but impacts still read');
});

test('particles past the cap drop decorative kinds without shifting the array', () => {
  const game = quiet();
  for (let i = 0; i < 600; i++) game._particle(0, 0, 0, 0, 1, 2, 'cyan', 'engine');
  assert.equal(game.particles.length, 380);
  const first = game.particles[0];
  game._particle(0, 0, 0, 0, 1, 2, 'gold', 'phase');
  assert.equal(game.particles.length, 381, 'critical feedback still lands');
  assert.strictEqual(game.particles[0], first, 'no shift');
  for (let i = 0; i < 400; i++) game._particle(0, 0, 0, 0, 1, 2, 'gold', 'scatter');
  assert.equal(game.particles.length, 520, 'hard cap');
});

test('two seeded sorties with live beats, bullets and real scatters replay identically', () => {
  const realRandom = Math.random;
  Math.random = () => { throw new Error('simulation must not use Math.random'); };
  try {
    const run = ship => {
      const game = sortie(ship);
      kit(game, { level: 9, escorts: 4, sidewinder: 2, signature: 3, reflector: 2, shield: 0 });
      const log = [];
      for (let i = 0; i < 60 * 45 && game.mode === 'playing'; i++) {
        // Sweeps the field without dodging, so fire lands and salvage is chased.
        const input = { fire: i % 300 < 270, left: i % 240 < 60, right: i % 240 >= 120 && i % 240 < 180, focus: i % 200 < 40, roll: i % 420 === 0 };
        game.update(1/60, input);
        for (const e of game.events) if (['arsenalScatter', 'salvageRecover', 'salvageExpire', 'squadronBonus', 'reflect', 'orbitalEat',
          'sidewinderLaunch', 'pickup', 'drop', 'playerHit', 'shieldHit', 'powerUp'].includes(e.type)) log.push([i, e.type, e.value, e.amount ?? null]);
      }
      const p = game.player;
      return {
        log, mode: game.mode, score: game.score, stage: game.stage, time: game.time,
        player: [p.x, p.y, p.hp, p.lives, p.level, p.escorts, p.sidewinder, p.signature, p.shield, p.reflector, p.magnetBoost, p.arsenal],
        pickups: game.pickups.map(t => [t.type, t.x, t.y, t.value, t.life]),
        bullets: game.bullets.map(b => [b.x, b.y]), enemies: game.enemies.map(e => [e.type, e.x, e.y, e.hp]),
        stats: { ...game.stats }
      };
    };
    for (const ship of SHIPS) {
      const first = run(ship), second = run(ship);
      assert.deepEqual(first, second);
      const seen = new Set(first.log.map(e => e[1]));
      assert.ok(seen.has('arsenalScatter'), ship + ' run really scatters');
      assert.ok(seen.has('salvageRecover') || seen.has('salvageExpire'), ship + ' run resolves salvage');
      assert.ok(first.stats.scatters >= 1 && first.enemies.length + first.stats.kills > 10);
    }
  } finally { Math.random = realRandom; }
});
