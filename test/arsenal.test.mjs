import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';

const start = (ship = 'kestrel') => {
  const game = new Game(); game.selectShip(ship);
  game.update(0, { start: true }); game.update(1/60, { start: false });
  assert.equal(game.mode, 'playing');
  game._beatIndex = 999; game._laneIndex = 999; game.stageTime = -1e6;
  // Sorties start at power 2; these unit checks start from a bare level-1 ship.
  game.player.level = game.player.power = 1; game._syncArsenal();
  return game;
};
const step = (game, frames, input = {}) => { for (let i = 0; i < frames; i++) game.update(1/60, input); };
const give = (game, type, extra = {}) => {
  const p = game.player; game.events = [];
  game.pickups.push({ x: p.x, y: p.y, r: 16, type, age: 0, vy: 0, ...extra });
  game._collide();
};
const kit = (game, loadout) => {
  Object.assign(game.player, loadout);
  if (loadout.level) game.player.power = loadout.level;
  game._syncEscortSlots(); game._syncOrbitals(); game._syncArsenal();
};
const types = game => game.events.map(e => e.type);

test('power is uncapped and keeps adding damage past the stream ceiling', () => {
  const shots = (level, ship = 'kestrel') => {
    const game = start(ship); kit(game, { level }); game._fire();
    return game.shots.filter(s => s.kind === 'shot' || s.kind === 'pierce');
  };
  assert.equal(shots(1).length, 2);
  assert.equal(shots(8).length, 9, 'Kestrel reaches nine streams at the ceiling');
  assert.equal(shots(20).length, 9);
  assert.ok(shots(20)[0].damage > shots(8)[0].damage * 1.7, 'each level past 8 adds about 6% damage');
  assert.ok(shots(20)[0].r > shots(8)[0].r, 'and slightly larger shots');
  assert.equal(shots(6, 'wraith').length, 3, 'Wraith reaches triple rails at the structural ceiling');
  assert.equal(shots(9, 'wraith').length, 3);
  assert.equal(shots(10, 'wraith').length, 4, 'a fourth rail at power 10');
  assert.equal(shots(14, 'wraith').length, 5, 'a fifth rail at power 14');
  const volley = (level, ship = 'wraith') => shots(level, ship).reduce((sum, s) => sum + s.damage, 0);
  assert.ok(volley(14) > volley(8), 'Wraith volley damage still grows with power');
  // Extra rails split the volley: single-target output stays on the 3-rail curve.
  for (const level of [10, 13, 14, 20]) {
    const n = level >= 14 ? 5 : 4, scale = 1 + (level - 8) * .06, base = (12 + 7 * 1.6) * scale;
    assert.ok(Math.abs(volley(level) - 3 * base) < 1e-9, 'level ' + level + ' keeps three rails of damage across ' + n);
  }
  const spread = shots(14, 'wraith').map(s => s.x - shots(14, 'wraith')[0].x);
  assert.deepEqual(spread.map(Math.round), [0, 12, 24, 36, 48], 'five parallel rails, 12 px apart');
  const game = start(); for (let i = 0; i < 40; i++) give(game, 'power');
  assert.equal(game.player.level, 41); assert.equal(game.player.power, 41);
});

test('every pickup type applies its contract effect and event', () => {
  const game = start(), p = game.player;
  give(game, 'power', { value: 3 });
  assert.equal(p.level, 4); assert.ok(game.events.some(e => e.type === 'powerUp' && e.value === 4));
  give(game, 'escort');
  assert.equal(p.escorts, 2); assert.equal(p.escortSlots.length, 2);
  assert.ok(game.events.some(e => e.type === 'escortJoin' && e.value === 2));
  give(game, 'sidewinder'); assert.equal(p.sidewinder, 1);
  give(game, 'shield'); assert.equal(p.shield, 1, 'non-Manta ships now take shield charges');
  assert.equal(p.maxShield, 1); assert.ok(game.events.some(e => e.type === 'shieldUp' && e.value === 1));
  give(game, 'reflector'); assert.equal(p.reflector, 6); assert.ok(types(game).includes('reflectorUp'));
  give(game, 'reflector'); assert.equal(p.reflector, 12); assert.ok(!types(game).includes('reflectorUp'), 'reflectorUp fires only on activation');
  give(game, 'signature'); assert.equal(p.signature, 1); assert.ok(game.events.some(e => e.type === 'signatureUp' && e.value === 1));
  const bombs = p.bombs; give(game, 'bomb'); assert.equal(p.bombs, bombs + 1);
  assert.equal(p.arsenal, 3 + 2 + 1.5 + 1.5 + 1);
  assert.equal(p.drones, 0, 'drones stay deprecated');
  assert.equal(game.stats.pickups, 8);

  const manta = start('manta');
  assert.equal(manta.player.shield, 1); assert.equal(manta.player.shieldCap, 3);
  give(manta, 'shield'); assert.equal(manta.player.shield, 3, 'Manta gains two charges per pickup, up to the cap');
  assert.equal(manta.player.maxShield, 3);
});

test('escort pickups past six convert into one power level and are never wasted', () => {
  const game = start(), p = game.player;
  for (let i = 0; i < 3; i++) give(game, 'escort');
  assert.equal(p.escorts, 6); assert.equal(p.escortSlots.length, 6);
  assert.deepEqual(p.escortSlots.map(s => [s.side, s.rank]), [[-1, 0], [1, 0], [-1, 1], [1, 1], [-1, 2], [1, 2]]);
  give(game, 'escort');
  assert.equal(p.escorts, 6); assert.equal(p.level, 2, 'round 3: a surplus pair is +1 power (was +2)');
  assert.ok(!types(game).includes('escortJoin'));
  assert.ok(game.events.some(e => e.type === 'powerUp' && e.value === 2));
});

test('escorts trail with a spring lag, spread wide unfocused and collapse forward on focus', () => {
  const game = start(), p = game.player;
  give(game, 'escort'); give(game, 'escort');
  step(game, 90);
  const wide = p.escortSlots.map(s => Math.abs(s.x - p.x));
  assert.ok(p.escortSlots.every(s => s.y > p.y), 'unfocused escorts fly just behind the wing line');
  step(game, 6, { right: true });
  assert.ok(p.escortSlots[0].x - p.x < -42, 'escorts lag behind sudden movement');
  step(game, 90, { focus: true });
  assert.ok(p.escortSlots.every(s => s.y < p.y), 'focus pulls escorts forward');
  assert.ok(p.escortSlots.every((s, i) => Math.abs(s.x - p.x) < wide[i]), 'and tightens the formation');
  game.shots.length = 0; game._fire();
  assert.equal(game.shots.filter(s => s.kind === 'escort' && s.style === 'cannon').length, 8, 'Kestrel escorts fire twin cannons');
  for (const [ship, style] of [['manta', 'rocket'], ['wraith', 'rail']]) {
    const other = start(ship); give(other, 'escort'); other.shots.length = 0; other._fire();
    assert.equal(other.shots.filter(s => s.kind === 'escort' && s.style === style).length, 2);
  }
});

test('sidewinder volleys home on targets with a level-scaled size and cadence', () => {
  const game = start(); kit(game, { sidewinder: 2 });
  const target = game._enemy('bomber', 420, 400, { vy: 0, fireAt: 99 });
  game.update(1/60, { fire: true });
  const volley = game.shots.filter(s => s.kind === 'sidewinder');
  assert.equal(volley.length, 4);
  assert.equal(game.events.filter(e => e.type === 'sidewinderLaunch').length, 1);
  assert.ok(game.events.some(e => e.type === 'sidewinderLaunch' && e.value === 4));
  step(game, 20, { fire: true });
  assert.ok(volley.every(s => s.targetId === target.id));
  const rack = start(); kit(rack, { sidewinder: 9 }); rack.update(1/60, { fire: true });
  assert.equal(rack.shots.filter(s => s.kind === 'sidewinder').length, 6, 'volley size is 2*min(level,3)');
  assert.ok(Math.abs(rack._sidewinderClock - .35) < .02, 'cadence floors at 0.35 s');
  assert.ok(rack.shots.find(s => s.kind === 'sidewinder').damage > volley[0].damage, 'damage grows past level 3');
});

test('signature systems: Kestrel flak covers the rear, Manta torpedoes pierce small craft and burst on big ones, Wraith orbitals fire rails', () => {
  const kestrel = start(); kit(kestrel, { signature: 2 }); kestrel.update(1/60, { fire: true });
  const flak = kestrel.shots.filter(s => s.kind === 'flak');
  assert.equal(flak.length, 4); assert.ok(flak.some(s => s.vy > 0), 'rear guns fire backward');
  assert.ok(flak.some(s => s.vy < 0 && Math.abs(s.vx) > 200), 'wing flak angles outward');

  const manta = start('manta'); kit(manta, { signature: 1 }); manta.update(1/60, { fire: true });
  const torpedo = manta.shots.find(s => s.kind === 'torpedo');
  assert.ok(torpedo); manta.shots = [torpedo];
  const scout = manta._enemy('scout', torpedo.x, torpedo.y, { fireAt: 99, vy: 0 }); scout.hp = 999;
  manta._collide();
  assert.ok(scout.hp < 999); assert.equal(torpedo.dead, undefined, 'torpedo pierces small craft');
  scout.dead = true;
  const bomber = manta._enemy('bomber', torpedo.x, torpedo.y, { fireAt: 99, vy: 0 }); bomber.hp = 999;
  const near = manta._enemy('wing', torpedo.x + 40, torpedo.y, { fireAt: 99, vy: 0 }); near.hp = 999;
  manta._collide();
  assert.equal(torpedo.dead, true, 'torpedo bursts on big targets');
  assert.ok(near.hp < 999, 'the burst splashes nearby craft');
  assert.ok(manta.events.some(e => e.type === 'missileHit' && e.torpedo));

  const wraith = start('wraith'); kit(wraith, { signature: 8 });
  assert.equal(wraith.player.orbitals.length, 6, 'orbital count shows up to six');
  wraith.update(1/60, { fire: true });
  const orbitalShots = wraith.shots.filter(s => s.kind === 'orbital');
  assert.equal(orbitalShots.length, 12, 'each orbital fires twin rails');
  assert.ok(orbitalShots.every(s => Math.abs(s.damage - 3 * (1 + 0 * .04)) < 1e-9), 'at half damage each');
  for (const o of wraith.player.orbitals) {
    const d = Math.hypot(o.x - wraith.player.x, (o.y - wraith.player.y) / .82);
    assert.ok(Math.abs(d - 46) < 1);
  }
  assert.equal(start('kestrel').player.orbitals.length, 0);
});

test('a shield charge absorbs a hit before any scatter or hull loss', () => {
  const game = start(), p = game.player;
  kit(game, { level: 6, escorts: 2, shield: 1 });
  game._hurtPlayer(p.x, p.y);
  assert.equal(p.shield, 0); assert.equal(p.level, 6); assert.equal(p.escorts, 2); assert.equal(p.hp, 4);
  assert.equal(game.pickups.length, 0);
  assert.ok(types(game).includes('shieldHit') && types(game).includes('shieldBreak'));
  assert.ok(!types(game).includes('arsenalScatter'));
  p.invuln = 0; game.events = [];
  game._hurtPlayer(p.x, p.y);
  assert.equal(p.hp, 3); assert.equal(p.level, 1); assert.ok(types(game).includes('arsenalScatter'));
  assert.ok(Math.abs(p.invuln - 2) < 1e-9, 'scatter hits give a shorter 2.0 s invuln');
});

test('a scatter bundles the arsenal into at most ten tokens and burns about 20% of the power', () => {
  const game = start(), p = game.player;
  kit(game, { level: 11, escorts: 6, sidewinder: 3, signature: 4, reflector: 4 });
  game._hurtPlayer(300, 600);
  const tokens = game.pickups.filter(i => i.salvage);
  assert.ok(tokens.length <= 10);
  const sum = type => tokens.filter(t => t.type === type).reduce((s, t) => s + t.value, 0);
  assert.equal(sum('power'), 8, 'ten levels above bare: two burn, eight drop');
  assert.ok(tokens.filter(t => t.type === 'power').every(t => t.value > 1), 'power drops as multi-level tokens');
  assert.equal(sum('escort'), 3, 'escort tokens carry pairs');
  assert.equal(sum('sidewinder'), 3); assert.equal(sum('signature'), 4);
  const scatter = game.events.find(e => e.type === 'arsenalScatter');
  assert.equal(scatter.value, 18); assert.equal(scatter.tokens, tokens.length); assert.equal(scatter.burned, 2);
  assert.ok(types(game).includes('reflectorDown'), 'reflector time is lost');
  assert.deepEqual([p.level, p.power, p.escorts, p.escortSlots.length, p.sidewinder, p.signature, p.reflector, p.drones], [1, 1, 0, 0, 0, 0, 0, 0]);
  for (const t of tokens) {
    const speed = Math.hypot(t.vx, t.vy);
    assert.ok(speed >= 200 && speed <= 340); assert.equal(t.life, 9); assert.equal(t.salvage, true);
  }

  const small = start(); kit(small, { level: 6, sidewinder: 2 });
  small._hurtPlayer(270, 600);
  const parts = small.pickups.map(t => [t.type, t.value]).sort();
  assert.deepEqual(parts, [['power', 2], ['power', 2], ['sidewinder', 1], ['sidewinder', 1]], 'each equipment level is its own token when there is room');
  const bare = start(); bare._hurtPlayer(270, 600);
  assert.equal(bare.pickups.length, 0); assert.ok(!types(bare).includes('arsenalScatter'));
});

test('salvage drifts and bounces inside the field, can be recovered, and expires after nine seconds', () => {
  const game = start(), p = game.player;
  kit(game, { level: 9, escorts: 2, signature: 1 });
  game._hurtPlayer(60, 120);
  const tokens = [...game.pickups];
  p.x = -2000; p.y = -2000;
  for (let i = 0; i < 360; i++) {
    game._updatePickups(1/120);
    for (const t of tokens) assert.ok(t.x >= 24 && t.x <= 516 && t.y >= 70 && t.y <= 860);
  }
  assert.ok(tokens.every(t => Math.hypot(t.vx, t.vy - 24) < 40), 'the burst damps into a slow sinking drift');
  const token = tokens.find(t => t.type === 'power');
  p.x = token.x; p.y = token.y; game.events = [];
  game._collide();
  assert.equal(token.dead, true); assert.equal(p.level, 1 + token.value);
  assert.ok(game.events.some(e => e.type === 'salvageRecover' && e.value === 'power' && e.amount === token.value));
  assert.ok(!types(game).includes('pickup'), 'salvage reports salvageRecover only, never pickup as well');
  assert.ok(game.events.some(e => e.type === 'powerUp' && e.value === p.level), 'follow-on powerUp still fires');
  p.x = -2000; p.y = -2000; game.events = [];
  const left = game.pickups.filter(t => !t.dead);
  const expired = [];
  for (let i = 0; i < 6.1 * 120; i++) { game._updatePickups(1/120); expired.push(...game.events.filter(e => e.type === 'salvageExpire')); game.events = []; }
  assert.ok(left.every(t => t.dead), 'unrecovered salvage expires');
  assert.equal(expired.length, left.length);
  assert.equal(game.stats.salvageLost, left.reduce((s, t) => s + t.value, 0));
});

test('losing a life scatters too, and the respawned ship is bare while the salvage keeps floating', () => {
  const game = start('manta'), p = game.player;
  kit(game, { level: 7, escorts: 4, shield: 0, hp: 1 });
  game._hurtPlayer(p.x, p.y);
  assert.equal(p.lives, 2); assert.equal(p.hp, 4); assert.equal(p.level, 1); assert.equal(p.escorts, 0);
  assert.equal(p.shield, 1, 'Manta starts each life with one charge');
  assert.ok(game.pickups.length > 0 && game.pickups.every(t => t.salvage));
  assert.equal(game.events.filter(e => e.type === 'arsenalScatter').length, 1);
});

test('salvage on screen during a sector-clear interlude homes in and is collected automatically', () => {
  const game = start(), p = game.player;
  kit(game, { level: 9, escorts: 2, sidewinder: 1 });
  game._spawnBoss(); game.boss.y = 280;
  p.invuln = 0; game._hurtPlayer(80, 300);
  for (const t of game.pickups) t.life = 1;  // expiry is paused through the interlude
  game._killEnemy(game.boss);
  const recovered = [];
  for (let i = 0; i < 230 && game.stage === 1; i++) {
    p.invuln = 99; game.update(1/60, {});
    recovered.push(...game.events.filter(e => e.type === 'salvageRecover'));
  }
  assert.equal(game.stage, 2);
  assert.equal(game.pickups.length, 0);
  assert.equal(game.stats.salvageLost, 0);
  assert.ok(recovered.length >= 4);
  assert.equal(p.escorts, 4, 'scattered escort pair plus the Vesper ladder bonus escort');
  assert.equal(p.sidewinder, 1);
  assert.equal(p.level, 1 + 7 + 1, 'kept power plus the flagship power spoil');
});

test('the reflector bounces bullets at the nearest enemy and drains 0.06 s per reflection', () => {
  const game = start(), p = game.player;
  give(game, 'reflector'); p.reflector = 1;
  const enemy = game._enemy('bomber', 470, 300, { vy: 0, fireAt: 99 });
  for (let i = 0; i < 5; i++) game.bullets.push({ x: p.x - 20 + i * 10, y: p.y - 30, vx: 0, vy: 100, r: 5, kind: 'red' });
  game.events = []; game._collide();
  assert.equal(p.hp, 4);
  const reflected = game.shots.filter(s => s.kind === 'reflect');
  assert.equal(reflected.length, 5);
  assert.ok(reflected.every(s => s.vx > 0 && s.vy < 0), 'reflections aim at the nearest enemy');
  assert.ok(Math.abs(p.reflector - (1 - 5 * .06)) < 1e-9);
  assert.deepEqual(game.events.filter(e => e.type === 'reflect').map(e => e.value), [5], 'reflect events coalesce per tick');
  assert.equal(game.stats.reflected, 5);
  enemy.dead = true; game._cleanup();
  p.reflector = .1; game.events = [];
  for (let i = 0; i < 3; i++) game.bullets.push({ x: p.x, y: p.y - 40, vx: 0, vy: 0, r: 5, kind: 'amber' });
  game._collide();
  assert.equal(p.reflector, 0); assert.ok(types(game).includes('reflectorDown'));
  const timed = start(); give(timed, 'reflector'); timed.events = [];
  const downs = [];
  for (let i = 0; i < 6.2 * 60; i++) { timed.update(1/60, {}); downs.push(...timed.events.filter(e => e.type === 'reflectorDown')); }
  assert.equal(timed.player.reflector, 0); assert.equal(downs.length, 1);
});

test('void rounds ignore the reflector and ghost orbitals', () => {
  const game = start('wraith'), p = game.player;
  kit(game, { level: 4, signature: 3, reflector: 5 });
  game._updateArsenal(0, false);
  const o = p.orbitals[0];
  game.bullets.push({ x: o.x, y: o.y, vx: 0, vy: 0, r: 5, kind: 'void' }, { x: p.x, y: p.y, vx: 0, vy: 0, r: 5, kind: 'void' });
  game._collide();
  assert.equal(o.cool, 0, 'an orbital cannot eat a void round');
  assert.equal(game.shots.filter(s => s.kind === 'reflect').length, 0);
  assert.equal(p.hp, 3, 'the void round reaches the hurtbox');
  assert.ok(types(game).includes('arsenalScatter'));
  const cap = new Game(); cap._bullet(10, 10, 0, 100, 'void', 5); assert.equal(cap.bullets[0].kind, 'void');
});

test('ghost orbitals eat enemy bullets, then cool down for 0.6 s', () => {
  const game = start('wraith'), p = game.player;
  kit(game, { signature: 2 });
  game._updateArsenal(0, false);
  const [a, b] = p.orbitals;
  game.bullets.push({ x: a.x, y: a.y, vx: 0, vy: 0, r: 4, kind: 'red' }, { x: b.x, y: b.y, vx: 0, vy: 0, r: 4, kind: 'red' });
  game.events = []; game._collide();
  assert.equal(game.bullets.filter(x => x.dead).length, 2);
  assert.equal(a.cool, .6); assert.equal(b.cool, .6);
  assert.deepEqual(game.events.filter(e => e.type === 'orbitalEat').map(e => e.value), [2]);
  game._cleanup();
  const late = { x: a.x, y: a.y, vx: 0, vy: 0, r: 4, kind: 'red' };
  game.bullets.push(late); game._collide();
  assert.equal(late.dead, undefined, 'a cooling orbital lets bullets through');
  game._updateArsenal(.61, false); late.x = a.x; late.y = a.y;
  game._collide();
  assert.equal(late.dead, true, 'the orbital eats again after its cooldown');
  const fast = start('wraith'); kit(fast, { signature: 10 }); fast._updateArsenal(0, false);
  const fo = fast.player.orbitals[0]; fo.cool = .6; fast._updateArsenal(.3, false);
  assert.ok(fo.cool < .6 - .3 * 1.5, 'levels past six speed up the cooldown');
});

test('live player shots stay within the 650 budget, dropping the oldest small shots first', () => {
  const game = start();
  for (let i = 0; i < 40; i++) game.shots.push({ x: 100, y: 400, vx: 0, vy: 0, r: 6, damage: 30, kind: 'missile', age: 0, id: 'm' + i });
  for (let i = 0; i < 700; i++) game.shots.push({ x: 100, y: 400, vx: 0, vy: 0, r: 3, damage: 7, kind: 'shot', age: 0, id: 's' + i });
  game._enforceShotBudget();
  assert.equal(game.shots.length, 650);
  assert.equal(game.shots.filter(s => s.kind === 'missile').length, 40);
  assert.equal(game.shots.find(s => s.kind === 'shot').id, 's90', 'the oldest small shots go first');
  for (const ship of ['kestrel', 'manta', 'wraith']) {
    const stress = start(ship); kit(stress, { level: 60, escorts: 6, sidewinder: 12, signature: 12 });
    let peak = 0;
    for (let i = 0; i < 300; i++) { stress.player.invuln = 99; stress.update(1/60, { fire: true }); peak = Math.max(peak, stress.shots.length); }
    assert.ok(peak <= 650, ship + ' never exceeds the shot budget');
  }
});

test('sector drills start with a loadout matching the sector', () => {
  const expected = [null, [6, 2, 1, 0], [8, 4, 1, 1], [10, 4, 2, 2]];
  for (const stage of [1, 2, 3]) for (const ship of ['kestrel', 'wraith']) {
    const game = new Game(); game.selectShip(ship); game.startDrill(stage);
    const p = game.player;
    assert.deepEqual([p.level, p.escorts, p.sidewinder, p.signature], expected[stage]);
    assert.equal(p.escortSlots.length, p.escorts);
    assert.equal(p.orbitals.length, ship === 'wraith' ? p.signature : 0);
    assert.equal(game.stats.powerPeak, p.level);
  }
});

test('two identical seeded runs with fire, hits, scatter and salvage produce identical state', () => {
  const realRandom = Math.random;
  Math.random = () => { throw new Error('simulation must not use Math.random'); };
  try {
    const run = ship => {
      const game = new Game(); game.selectShip(ship);
      game.update(0, { start: true }); game.update(1/60, {});
      kit(game, { level: 9, escorts: 4, sidewinder: 2, signature: 3, reflector: 3 });
      const log = [];
      for (let i = 0; i < 2400 && game.mode === 'playing'; i++) {
        const input = { fire: i % 300 < 260, left: i % 240 < 50, right: i % 240 >= 120 && i % 240 < 170, focus: i % 180 < 40, up: i % 400 < 30 };
        game.update(1/60, input);
        for (const e of game.events) if (['arsenalScatter', 'salvageRecover', 'salvageExpire', 'reflect', 'orbitalEat', 'sidewinderLaunch', 'pickup', 'drop'].includes(e.type)) log.push([i, e.type, e.value]);
      }
      const p = game.player;
      return {
        log, mode: game.mode, score: game.score, stage: game.stage,
        player: [p.x, p.y, p.hp, p.lives, p.level, p.power, p.escorts, p.sidewinder, p.signature, p.shield, p.reflector, p.arsenal],
        slots: p.escortSlots.map(s => [s.x, s.y]), orbitals: p.orbitals.map(o => [o.x, o.y, o.cool]),
        pickups: game.pickups.map(t => [t.type, t.x, t.y, t.value, t.life]),
        shots: game.shots.map(s => [s.kind, s.x, s.y]), bullets: game.bullets.map(b => [b.x, b.y]),
        enemies: game.enemies.map(e => [e.type, e.x, e.y, e.hp]), stats: { ...game.stats }
      };
    };
    for (const ship of ['kestrel', 'manta', 'wraith']) {
      const first = run(ship), second = run(ship);
      assert.deepEqual(first, second);
      assert.ok(first.log.length > 0);
    }
  } finally { Math.random = realRandom; }
});
