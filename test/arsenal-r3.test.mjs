// Arsenal round 3: the power curve (no snowball), kit-aware generated drops,
// overflow conversions, cue hygiene and the uncapped visual growth formula.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, overpowerGrowth } from '../src/game.js';

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
// Engaged no-hit pilot (same policy as test/arsenal-r2.test.mjs): fire held,
// lines up under the lowest enemy on screen, detours to pickups within 300 px.
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

// Arrival targets for an engaged no-hit pilot (docs/design/act-two.md, round 3).
const ARRIVAL = [[12, 16], [22, 32], [35, 50]];
const NAMES = ['Vesper', 'Aurelia', 'the Crown'];

test('the engaged no-hit pilot arrives at each flagship inside the round-3 power band, on every ship', () => {
  for (const ship of SHIPS) {
    const game = sortie(ship), arrivals = [], ramp = {};
    let bonusEvents = 0;
    for (let f = 0; f < 60 * 400 && game.mode === 'playing'; f++) {
      game.player.invuln = 99;
      const hadBoss = !!game.boss;
      game.update(1/60, pilot(game));
      bonusEvents += game.events.filter(e => e.type === 'squadronBonus').length;
      const p = game.player;
      if (game.stage === 1 && !game.boss) {
        if (p.level >= 4) ramp.p4 ??= game.time;
        if (p.level >= 6) ramp.p6 ??= game.time;
        if (p.escorts >= 2) ramp.escort ??= game.time;
      }
      if (game.boss && !hadBoss) arrivals.push(p.level);
    }
    assert.equal(game.mode, 'victory', ship + ' clears the campaign');
    assert.equal(arrivals.length, 3);
    arrivals.forEach((level, i) => {
      const [lo, hi] = ARRIVAL[i];
      assert.ok(level >= lo && level <= hi, `${ship} reaches ${NAMES[i]} at power ${level} (target ${lo}-${hi})`);
    });
    // "Insanely powerful right away" survives the curve change.
    assert.ok(ramp.p4 <= 10.5, `${ship} power 4 at ${ramp.p4?.toFixed(1)} s`);
    assert.ok(ramp.p6 <= 25, `${ship} power 6 at ${ramp.p6?.toFixed(1)} s`);
    assert.ok(ramp.escort <= 20, `${ship} first escort pair at ${ramp.escort?.toFixed(1)} s`);
    assert.equal(game.stats.squadronBonuses, bonusEvents, 'every payout is counted once');
    assert.ok(bonusEvents >= 15, ship + ' still earns squadron bonuses all campaign: ' + bonusEvents);
  }
});

test('generated drops are kit-aware: no escort pair for a full wing, no S for a full bank', () => {
  const game = quiet('manta');
  kit(game, { escorts: 6, shield: 3 });
  const random = [], squadron = [];
  for (let i = 0; i < 400; i++) { random.push(game._randomDropType()); squadron.push(game._randomDropType(true)); }
  assert.ok(!random.includes('escort') && !random.includes('shield'), 'random rolls skip what the kit cannot hold');
  assert.ok(random.includes(null), 'such a roll drops nothing instead');
  assert.ok(random.includes('power') && random.includes('sidewinder'));
  assert.ok(squadron.every(t => ['sidewinder', 'signature', 'reflector'].includes(t)),
    'the squadron item re-rolls among equipment the kit can hold, never power');

  const fresh = quiet();
  const rungs = Array.from({ length: 11 }, () => fresh._bonusDropType());
  assert.deepEqual(rungs.slice(0, 6), ['escort', 'sidewinder', 'signature', 'power', 'reflector', 'shield'], 'sector-1 starter rungs');
  assert.deepEqual(rungs.slice(6), ['sidewinder', 'escort', 'signature', 'reflector', 'shield'], 'then equipment only');
  const full = quiet(); kit(full, { escorts: 6, shield: 3 });
  const skipped = Array.from({ length: 8 }, () => full._bonusDropType());
  assert.ok(!skipped.includes('escort') && !skipped.includes('shield'), 'ladder rungs the kit cannot hold are skipped');
  assert.equal(skipped.filter(t => t === 'power').length, 1, 'only the one starter power rung pays power');
});

test('authored drops keep converting at a full kit: escort pair +1, each shield charge +1', () => {
  const game = quiet(), p = game.player;
  kit(game, { escorts: 6, shield: 3 });
  give(game, 'escort'); assert.equal(p.level, 3, 'surplus escort pair is +1 power');
  assert.ok(!types(game).includes('escortJoin'));
  give(game, 'shield'); assert.equal(p.level, 4, 'one charge over the cap is +1 power');

  const manta = quiet('manta'), q = manta.player;
  q.shield = 2; give(manta, 'shield');
  assert.equal(q.shield, 3); assert.equal(q.level, 3, 'Manta at 2/3: one charge banks, one becomes power');
  assert.ok(types(manta).includes('shieldUp') && types(manta).includes('powerUp'));
  give(manta, 'shield');
  assert.equal(q.shield, 3); assert.equal(q.level, 5, 'Manta at 3/3: both charges become power');
  assert.ok(!types(manta).includes('shieldUp'));
});

test('a bomb pickup at a full bay reports one power cue: pickup(power) plus powerUp, no bomb cue', () => {
  const game = quiet(), p = game.player;
  p.bombs = 4; give(game, 'bomb');
  assert.equal(p.bombs, 4); assert.equal(p.level, 3);
  const pickups = game.events.filter(e => e.type === 'pickup').map(e => e.value);
  assert.deepEqual(pickups, ['power']);
  assert.ok(game.events.some(e => e.type === 'powerUp' && e.value === 3));
  p.bombs = 1; give(game, 'bomb');
  assert.equal(p.bombs, 2);
  assert.deepEqual(game.events.filter(e => e.type === 'pickup').map(e => e.value), ['bomb'], 'a bay with room still reports bomb');
});

test('the shield cap is an invariant: _syncArsenal clamps any stray bank to 3', () => {
  const game = quiet('manta'), p = game.player;
  p.shield = 6; p.maxShield = 6; game._syncArsenal();
  assert.equal(p.shield, 3); assert.equal(p.maxShield, 3);
});

test('enemy death bursts (explode) are critical particles and land past the decorative cap', () => {
  const game = quiet();
  for (let i = 0; i < 400; i++) game._particle(0, 0, 0, 0, 1, 2, 'cyan', 'engine');
  assert.equal(game.particles.length, 380);
  game._particle(0, 0, 0, 0, 1, 2, 'amber', 'explode');
  assert.equal(game.particles.length, 381);
  assert.equal(game.particles.at(-1).kind, 'explode');
});

test('missile and torpedo burst cues are gated per target; damage, splash and RNG are unchanged', () => {
  const duel = gated => {
    const game = new Game(); game.selectShip('manta'); game.startDrill(3);
    kit(game, { level: 25, escorts: 6, sidewinder: 4, signature: 6 });
    if (!gated) Object.defineProperty(game.boss, 'burstCooldown', { get: () => 0, set() {} });
    let cues = 0, hpLog = [];
    for (let f = 0; f < 60 * 10; f++) {
      game.player.invuln = 99;
      game.update(1/60, { fire: true, pointerActive: true, pointerX: game.boss?.x ?? 270, pointerY: 720 });
      if (f >= 60 * 4) cues += game.events.filter(e => (e.type === 'missileHit' || e.type === 'bossArmorHit') && e.value === 'boss').length;
      hpLog.push(game.boss ? game.boss.hp : -1);
    }
    return { cues: cues / 6, hpLog, seed: game._seed, particles: game.particles.length, shots: game.shots.length };
  };
  const gated = duel(true), open = duel(false);
  assert.ok(gated.cues <= 1 / .085 + .5, 'gated burst cues per second: ' + gated.cues.toFixed(1));
  assert.ok(gated.cues >= 3, 'bursts still read: ' + gated.cues.toFixed(1));
  assert.ok(open.cues > gated.cues, 'the ungated run floods more cues: ' + open.cues.toFixed(1));
  assert.deepEqual(gated.hpLog, open.hpLog, 'boss damage is identical tick for tick');
  assert.equal(gated.seed, open.seed, 'the seeded random stream is untouched');
  assert.equal(gated.particles, open.particles); assert.equal(gated.shots, open.shots);
});

test('shot growth past the stream ceiling is logarithmic with no hard stop; collision grows at half rate', () => {
  assert.equal(overpowerGrowth(0), 0); assert.equal(overpowerGrowth(-3), 0);
  assert.ok(Math.abs(overpowerGrowth(30 - 8) - 2.5) < .15, 'about 2.5 px at power 30: ' + overpowerGrowth(22).toFixed(2));
  assert.ok(Math.abs(overpowerGrowth(80 - 8) - 4) < .2, 'about 4 px at power 80: ' + overpowerGrowth(72).toFixed(2));
  for (let over = 1; over < 300; over++) assert.ok(overpowerGrowth(over) > overpowerGrowth(over - 1), 'keeps growing at ' + over);
  const shot = (ship, level) => {
    const game = quiet(ship); kit(game, { level }); game.shots.length = 0; game._fire();
    return game.shots.find(s => s.kind === 'shot' || s.kind === 'pierce');
  };
  for (const ship of SHIPS) {
    const at8 = shot(ship, 8), at30 = shot(ship, 30), at80 = shot(ship, 80);
    assert.ok(at80.r > at30.r && at30.r > at8.r, ship + ' shots keep growing past power 29');
    assert.ok(Math.abs((at80.r - at8.r) - overpowerGrowth(72)) < 1e-9, ship + ' visual radius follows the formula');
    assert.ok(Math.abs((at80.hitR - at8.hitR) - overpowerGrowth(72) / 2) < 1e-9, ship + ' collision radius grows at half rate');
  }
});
