// Act I retune (docs/design/act-two.md, Part 3): the authored kit ledger,
// threat in every sector, rescue drops, flavour-only generated drops, the HP
// curve, opening timing, drills and the act fields presentation reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, STAGE_BEATS, ACT_TWO_STAGE, actOf } from '../src/game.js';

const sortie = (ship = 'kestrel') => {
  const game = new Game(); game.selectShip(ship);
  game.update(0, { start: true }); game.update(1/60, {});
  assert.equal(game.mode, 'playing');
  return game;
};
const quiet = (ship = 'kestrel', stage = 1) => {
  const game = sortie(ship);
  game.stage = stage; game._beatIndex = 999; game._laneIndex = 999; game.stageTime = -1e6;
  return game;
};
const kit = (game, loadout) => {
  Object.assign(game.player, { escorts: 0, sidewinder: 0, signature: 0, ...loadout });
  if (loadout.level) game.player.power = loadout.level;
  game._syncEscortSlots(); game._syncOrbitals(); game._syncArsenal();
};
const authored = stage => {
  const out = [];
  for (const [, , drops] of STAGE_BEATS[stage]) out.push(...[].concat(drops?.lead || [], drops?.heavy || []));
  return out;
};
const tally = list => list.reduce((m, t) => (m[t] = (m[t] || 0) + 1, m), {});

test('the authored drop schedule carries one escort pair, sidewinder and signature per sector (the ledger)', () => {
  const [one, two, three] = [1, 2, 3].map(s => tally(authored(s)));
  assert.deepEqual([one.escort, one.sidewinder, one.signature, one.shield], [1, 1, 1, 1], 'sector 1');
  assert.deepEqual([two.escort, two.sidewinder, two.signature, two.shield ?? 0], [1, 1, 1, 0], 'sector 2 (Vesper spoils bring its shield)');
  assert.deepEqual([three.escort, three.sidewinder ?? 0, three.signature, three.shield, three.reflector], [1, 0, 1, 1, 1],
    'sector 3 (Aurelia spoils bring its sidewinder)');
  // Power: authored drops plus rescue leads, which a ledger kit meets below RESCUE_THREAT.
  const rescues = s => STAGE_BEATS[s].filter(([, , d]) => d?.rescue).length;
  assert.equal(one.power + rescues(1), 6, 'sector 1 authors P2 -> P8');
  assert.equal(two.power + rescues(2), 6, 'sector 2 authors P9 -> P15 (Vesper spoils included in P9)');
  assert.equal(three.power + rescues(3), 5, 'sector 3: five levels; its late rescue lead lapses once the rank passes 0.5');
  // Drop -> attack: every escort pair is followed by a flank within two beats.
  for (const s of [1, 2, 3]) {
    const beats = STAGE_BEATS[s], i = beats.findIndex(([, , d]) => [].concat(d?.heavy || [], d?.lead || []).includes('escort'));
    assert.ok(beats.slice(i + 1, i + 3).some(([, pattern]) => pattern === 'flank'), 'sector ' + s + ': the escort pair meets side entries next');
  }
});

test('Act I flagship spoils follow the ledger and the Crown carries the kit across the Act II gate', () => {
  const spoils = stage => {
    const game = quiet('kestrel', stage); game._spawnBoss(); game.boss.y = 285; game.events = [];
    game._killEnemy(game.boss);
    return tally(game.events.filter(e => e.type === 'drop').map(e => e.value));
  };
  assert.deepEqual(spoils(1), { power: 1, shield: 1 });
  assert.deepEqual(spoils(2), { power: 1, sidewinder: 1 });
  assert.deepEqual(spoils(3), { power: 4, sidewinder: 1, signature: 1 });
  const leviathan = quiet('kestrel', 4); leviathan._spawnBoss(); leviathan.boss.y = 285;
  for (const e of leviathan.enemies) if (e.type === 'hullTurret') e.dead = true;
  leviathan.events = []; leviathan._killEnemy(leviathan.boss);
  assert.equal(leviathan.events.filter(e => e.type === 'drop').length, 2, 'Act II keeps power plus a ladder item');
});

test('threat runs in Act I on the Act II curve, resets on each new sector, and drills start at the kit rank', () => {
  const game = sortie();
  assert.equal(game.threat, 0);
  kit(game, { level: 14, escorts: 4, sidewinder: 2, signature: 2, shield: 2 });  // Aurelia's ledger row
  const target = game._threatTarget();
  assert.ok(target > .35 && target < .45, 'Aurelia ledger rank ~0.4: ' + target);
  game._beatIndex = 999; game._laneIndex = 999;
  for (let i = 0; i < 60; i++) { game.player.invuln = 99; game.update(1/60, {}); }
  assert.ok(Math.abs(game.threat - .15) < .02, 'rises at 0.15/s in sector 1: ' + game.threat);
  for (let i = 0; i < 240; i++) { game.player.invuln = 99; game.update(1/60, {}); }
  assert.ok(Math.abs(game.threat - target) < 1e-9, 'settles on the kit rank');
  game.stageTime = game.stageGoal[1]; game.update(1/60, {});
  game._killEnemy(game.boss);
  for (let i = 0; i < 230 && game.stage === 1; i++) { game.player.invuln = 99; game.update(1/60, {}); }
  assert.equal(game.stage, 2);
  assert.ok(game.threat < .02, 'a new sector opens on a short power trip: ' + game.threat);
  for (const stage of [1, 2, 3, 4]) {
    const drill = new Game(); drill.startDrill(stage);
    assert.ok(Math.abs(drill.threat - drill._threatTarget()) < 1e-9 && drill.threat > 0, 'drill ' + stage + ' starts at its kit rank');
  }
});

test('Act I fire reads the rank: slower and smaller for a stripped ship, bigger and faster for a kit', () => {
  const volley = (type, threat) => {
    const game = quiet('kestrel', 3); game.threat = threat;
    const e = game._enemy(type, 270, 200, { fireAt: 0, vy: 0 }); game.bullets.length = 0;
    game._updateEnemies(1/120);
    return { n: game.bullets.length, speed: Math.hypot(game.bullets[0].vx, game.bullets[0].vy), cool: e.fireAt - e.age };
  };
  const bare = volley('wing', 0), mid = volley('wing', .3), full = volley('wing', .6);
  assert.deepEqual([bare.n, mid.n, full.n], [3, 5, 7], 'wing spreads 3 / 5 / 7 across the gates');
  assert.ok(bare.cool > mid.cool && mid.cool > full.cool, 'cadence quickens with the rank');
  assert.ok(Math.abs(bare.cool / full.cool - (1 + 1.3 * .6)) < 1e-6, 'pace 1.45/(1+1.3t)');
  assert.ok(full.speed > bare.speed && full.speed / bare.speed < 1.1, 'bullets +7% at 0.6');
  assert.deepEqual(['bomber', 'turret', 'carrier', 'mini'].map(t => volley(t, 0).n < volley(t, .6).n), [true, true, true, true]);
  // Sector 4's borrowed curtain craft keep their authored fire.
  const act2 = quiet('kestrel', 4); act2.threat = .8;
  const w = act2._enemy('wing', 270, 200, { fireAt: 0, vy: 0, fireRate: 2 }); act2.bullets.length = 0; act2._updateEnemies(1/120);
  assert.equal(act2.bullets.length, 5);
  assert.ok(Math.abs(w.fireAt - w.age - 2 * (1 - 3 * .08)) < 1e-9, 'the old stage factor, no rank');
});

test('rescue leads drop power below RESCUE_THREAT (0.5) in Act I, and nothing generated otherwise', () => {
  const drops = threat => {
    const game = quiet('kestrel', 2); game.threat = threat; game._spawnStageBeat('drift', { rescue: 1 });
    const lead = game.enemies.find(e => e.rescue);
    assert.ok(lead, 'the drift centre scout is the rescue lead');
    game.events = []; game._killEnemy(lead);
    return game.events.filter(e => e.type === 'drop').map(e => e.value);
  };
  assert.deepEqual(drops(0), ['power'], 'a stripped ship rebuilds');
  assert.deepEqual(drops(.45), ['power']);
  assert.deepEqual(drops(.55), [], 'a kit above the rank gate gets no rescue power');
  // The old flat warm-up is gone: sector-1 leads carry only what a beat authors.
  const game = quiet('kestrel', 1); game._spawnWave('split'); game._spawnWave('bomber');
  assert.ok(game.enemies.every(e => !e.drop && !e.rescue));
});

test('Act I generated drops are flavour: no escort, sidewinder, signature or shield from rolls or wipes', () => {
  const game = quiet('kestrel', 2), seen = new Set();
  for (let i = 0; i < 400; i++) {
    const e = game._enemy('bomber', 270, 300, { vy: 0, fireAt: 99 }); game.events = [];
    game._killEnemy(e);
    for (const d of game.events.filter(ev => ev.type === 'drop')) seen.add(d.value);
  }
  assert.ok(seen.size > 0 && [...seen].every(t => t === 'power' || t === 'reflector'), [...seen].join());
  let items = 0, wipes = 0;
  const wipeTypes = new Set();
  for (let i = 0; i < 60; i++) {
    const g = quiet('kestrel', 1); g._seed = 1000 + i; g._spawnStageBeat('drift');
    const before = g.score; g.events = [];
    for (const e of [...g.enemies]) g._killEnemy(e);
    const bonus = g.events.find(e => e.type === 'squadronBonus');
    assert.ok(bonus && bonus.value === 3 && (bonus.drops === 0 || bonus.drops === 1));
    assert.equal(bonus.points, 450, 'a wipe always pays 150 per craft');
    assert.ok(g.score - before >= 450);
    wipes++; items += bonus.drops;
    for (const d of g.events.filter(e => e.type === 'drop')) wipeTypes.add(d.value);
  }
  assert.deepEqual([...wipeTypes], ['reflector'], 'a wipe item is a reflector');
  assert.ok(items / wipes > .15 && items / wipes < .5, 'about a third of wipes drop it: ' + items + '/' + wipes);
});

test('Act I HP replaces the flat curve; sector 4 keeps it for its borrowed curtain craft', () => {
  const hp = (type, stage) => { const g = quiet('kestrel', stage); return g._enemy(type, 0, 0).maxHp; };
  for (const type of ['scout', 'wing', 'ace', 'bomber', 'turret', 'carrier', 'mini'])
    assert.ok(hp(type, 1) < hp(type, 2) && hp(type, 2) < hp(type, 3), type + ' grows across Act I');
  assert.ok(hp('scout', 1) <= 21, 'a power-2 Kestrel volley (3 x 7) deletes a sector-1 scout');
  assert.ok(hp('mini', 3) / hp('scout', 3) > 40, 'heavies take sustained fire');
  assert.ok(Math.abs(hp('wing', 4) - 30 * 1.66) < 1e-9 && Math.abs(hp('turret', 4) - 90 * 1.66) < 1e-9, 'sector 4 curtain unchanged');
  assert.deepEqual([1, 2, 3, 4].map(s => { const g = quiet('kestrel', s); g._spawnBoss(); return g.boss.maxHp; }), [3800, 9000, 10500, 145000]);
});

test('every opening beat lands after its intro card (2.5 s or later)', () => {
  for (let stage = 1; stage <= 4; stage++) {
    assert.ok(STAGE_BEATS[stage][0][0] >= 2.5, 'sector ' + stage + ' opens at ' + STAGE_BEATS[stage][0][0]);
    const game = sortie(); game.stage = stage; game.player.invuln = 99;
    for (let i = 0; i < 148; i++) game.update(1/60, {});
    assert.equal(game.enemies.length, 0, 'nothing flies under the sector ' + stage + ' card');
    assert.ok(!game.bullets.length);
  }
});

test('drills start on the ledger arrival rows; Manta brings its +2 shield (cap 3)', () => {
  const rows = [null, [8, 2, 1, 1, 1], [14, 4, 2, 2, 2], [20, 6, 3, 3, 3], [25, 6, 4, 4, 3]];
  for (const ship of ['kestrel', 'manta', 'wraith']) for (const stage of [1, 2, 3, 4]) {
    const game = new Game(); game.selectShip(ship); game.startDrill(stage);
    const p = game.player, row = [...rows[stage]];
    if (ship === 'manta') row[4] = 3;
    assert.deepEqual([p.level, p.escorts, p.sidewinder, p.signature, p.shield], row, ship + ' drill ' + stage);
    assert.equal(p.orbitals.length, ship === 'wraith' ? p.signature : 0);
  }
});

test('act fields: game.act, actOf and summary.act', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(actOf), [1, 1, 1, 2, 2]);
  const game = sortie(); assert.equal(game.act, 1);
  game.stage = ACT_TWO_STAGE; assert.equal(game.act, 2);
  const lost = sortie(); lost.player.lives = 1; lost.player.hp = 1; lost.player.shield = 0; lost._hurtPlayer(270, 750);
  assert.equal(lost.mode, 'gameover'); assert.equal(lost.summary.act, 1);
  const deep = sortie(); deep.stage = 4; deep.player.lives = 1; deep.player.hp = 1; deep._hurtPlayer(270, 750);
  assert.equal(deep.summary.act, 2);
});

test('entering Act II opens the bonus ladder on its equipment cycle', () => {
  const game = sortie(); game.player.invuln = 999; game.stage = 3;
  game._spawnBoss(); game.boss.y = 285; game._killEnemy(game.boss);
  for (let i = 0; i < 60 * 7 && game.stage === 3; i++) game.update(1/60, {});
  assert.equal(game.stage, 4);
  assert.ok(game._bonusIndex >= 6, 'starter rungs (and their power) belonged to the old sector 1');
  assert.equal(game.threat < .05, true, 'sector 4 still opens at threat ~0, as before');
});
