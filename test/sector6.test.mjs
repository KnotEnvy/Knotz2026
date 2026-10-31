// Sector 6, ZERO MERIDIAN: the campaign ending, drill 6, echoes, satellite
// lances, shard rounds, the Meridian Gate, THE SOVEREIGN (reflection, theft,
// ballet), kill times, the death pose, determinism, the drop schedule and
// sectors 1-5's bit-identity (docs/design/act-two.md, "Sector 6 build contract"
// and "Simulation notes (sector 6)").
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Game, CAMPAIGN_STAGES, STAGE_BEATS } from '../src/game.js';
import { readProgress, markEncounter, recordDrill } from '../src/progress.js';

const REFERENCE6 = { level: 62, escorts: 6, sidewinder: 24, signature: 22, shield: 3 };
const REFERENCE5 = { level: 43, escorts: 6, sidewinder: 12, signature: 12, shield: 3 };
const BARE = { level: 2, escorts: 0, sidewinder: 0, signature: 0, shield: 0 };
const sortie = (ship = 'kestrel') => {
  const game = new Game(); game.selectShip(ship);
  game.update(0, { start: true }); game.update(1 / 60, {});
  return game;
};
const kit = (game, loadout) => {
  Object.assign(game.player, loadout);
  if (loadout.level) game.player.power = loadout.level;
  if (loadout.shield != null) game.player.maxShield = Math.max(game.player.maxShield, loadout.shield);
  game._syncEscortSlots(); game._syncOrbitals(); game._syncArsenal();
};
// Sector 6 with no authored beats: a clean field for behaviour tests.
const quiet6 = (ship = 'kestrel', loadout = REFERENCE6) => {
  const game = sortie(ship);
  game.stage = 6; game.stageTime = 0; game._beatIndex = 999; game._laneIndex = 999;
  game.stageGoal = [...game.stageGoal]; game.stageGoal[6] = 1e9;
  kit(game, loadout); game.threat = game._threatTarget();
  game.player.invuln = 999;
  return game;
};
const step = (game, seconds, input = {}) => {
  const seen = [];
  for (let i = 0; i < Math.round(seconds * 60) && game.mode === 'playing'; i++) {
    game.update(1 / 60, typeof input === 'function' ? input(game) : input); seen.push(...game.events);
  }
  return seen;
};
const count = (events, type) => events.filter(e => e.type === type).length;
// Invulnerable flagship tracker: collects drops, shoots the mirror escorts first, then the core.
const tracker = game => {
  const p = game.player;
  for (const i of game.pickups) if (!i.dead && i.y > 240 && Math.hypot(i.x - p.x, i.y - p.y) < 300)
    return { fire: true, pointerActive: true, pointerX: i.x, pointerY: i.y };
  let tx = game.boss ? game.boss.x : p.x;
  const esc = game.enemies.find(e => e.type === 'mirrorEscort' && !e.dead);
  if (esc) tx = esc.x;
  return { fire: true, pointerActive: true, pointerX: tx, pointerY: 720 };
};
// The engaged no-hit collector (arsenal-r3 regression bot).
const engaged = game => {
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

// ---- Campaign and drills --------------------------------------------------

test('HALCYON hands over to sector 6 on an ordinary interlude with a full repair; THE SOVEREIGN ends Act II', () => {
  assert.equal(CAMPAIGN_STAGES, 6);
  const game = sortie('wraith'); game.player.invuln = 999;
  game.stage = 5; game._spawnBoss(); game.boss.y = 200;
  game.player.hp = 1; const bombs = game.player.bombs = 1;
  game.events = []; game._killEnemy(game.boss);
  assert.equal(count(game.events, 'actTwo'), 0, 'no act card between sectors 5 and 6');
  assert.equal(game._transition, 3.5); assert.equal(game._transitionLength, 3.5);
  const climb = step(game, 3.7);
  assert.equal(game.stage, 6); assert.equal(game.mode, 'playing');
  assert.ok(climb.some(e => e.type === 'stage' && e.value === 6));
  assert.equal(game.player.hp, game.player.maxHp, 'clearing HALCYON repairs the hull'); assert.equal(game.player.bombs, bombs + 1);
  assert.equal(game.stageGoal[6], 105); assert.equal(game.threat, 0, 'the sector opens on a power trip');
  game._spawnBoss();
  assert.equal(game.boss.name, 'THE SOVEREIGN'); assert.ok(game.boss.sovereign);
  game.events = []; game._killEnemy(game.boss);
  assert.equal(game._transition, 3.5);
  const end = step(game, 4);
  assert.equal(game.mode, 'victory'); assert.equal(game.summary.outcome, 'victory');
  assert.equal(game.summary.stage, 6); assert.equal(game.summary.act, 2);
  const done = end.findIndex(e => e.type === 'actTwoComplete'), win = end.findIndex(e => e.type === 'victory');
  assert.ok(done >= 0 && done < win, 'actTwoComplete comes with the victory');
  assert.equal(end[done].value, 2);
});

test('sector 6 has no lane sweeps and authors 105 s of beats before THE SOVEREIGN; peak bullets stay readable', () => {
  const game = sortie(); game.stage = 6; game.stageTime = 0; game._beatIndex = 0; game._laneIndex = 0;
  kit(game, REFERENCE6);
  const events = [];
  let peak = 0;
  for (let f = 0; f < 60 * 106 && !game.boss; f++) {
    game.player.invuln = 99;
    game.update(1 / 60, engaged(game)); events.push(...game.events); peak = Math.max(peak, game.bullets.length);
  }
  assert.ok(game.boss && game.boss.name === 'THE SOVEREIGN', 'THE SOVEREIGN arrives at 105 s');
  assert.equal(count(events, 'lane'), 0);
  assert.ok(count(events, 'echoSpawn') >= 7, 'echo pairs and wings');
  assert.ok(count(events, 'satelliteEnter') >= 4 && count(events, 'satelliteDown') >= 3);
  assert.ok(events.some(e => e.type === 'laserWarn' && e.rotating), 'satellite lances sweep');
  assert.ok(count(events, 'shardCurtain') >= 3 && count(events, 'shardBreak') > 20, 'the reference kit carves the curtains');
  assert.equal(count(events, 'stationEnter'), 1); assert.equal(count(events, 'stationTurretDown'), 6); assert.equal(count(events, 'stationDown'), 1);
  assert.ok(count(events, 'boxEnter') >= 1 && count(events, 'flakMark') >= 2 && count(events, 'skyAceDodge') >= 0, 'the remix gauntlet');
  assert.ok(peak < 200, 'peak bullets stay readable: ' + peak);
  assert.equal(STAGE_BEATS[6].at(-1)[0] < 105, true);
});

test('drill 6 starts THE SOVEREIGN with the sector-6 reference kit; career and drill records accept 6', () => {
  for (const ship of ['kestrel', 'manta', 'wraith']) {
    const game = new Game(); game.selectShip(ship); game.startDrill(6);
    const p = game.player;
    assert.equal(game.stage, 6); assert.equal(game.practiceStage, 6);
    assert.deepEqual([p.level, p.power, p.escorts, p.sidewinder, p.signature, p.shield], [62, 62, 6, 24, 22, 3]);
    assert.equal(game.boss.name, 'THE SOVEREIGN'); assert.equal(game.boss.w, 200); assert.equal(game.boss.h, 80);
    assert.equal(game.boss.escorts.length, 6); assert.equal(game.boss.escortsAlive, 6);
    assert.equal(game.boss.style, p.weaponType); assert.equal(game.boss.rank, 1);
    assert.ok(game.threat > .86 && game.threat <= .88, 'the reference kit sits near threat 0.88: ' + game.threat);
    assert.equal(count(game.events, 'mirrorCopy'), 0, 'no copy while the hull is still off screen');
    const seen = step(game, 3.5, () => { game.player.invuln = 99; return {}; }), copy = seen.find(e => e.type === 'mirrorCopy');
    assert.equal(count(seen, 'mirrorCopy'), 1, 'one copy moment');
    assert.deepEqual([copy.value, copy.escorts, copy.band, copy.ship], [p.weaponType, 6, 2, ship]);
    assert.ok(game.boss.age >= 3.4 && Math.abs(copy.y - 200) < 2 && Math.abs(copy.x - game.boss.x) < 3, 'the copy fires on the settled hull: ' + copy.x + ',' + copy.y);
    game.events = []; game._killEnemy(game.boss); const end = step(game, 4);
    assert.equal(game.mode, 'victory', 'a drill ends in victory'); assert.equal(count(end, 'actTwoComplete'), 0, 'a drill is not the Act II ending');
  }
  const clamped = new Game(); clamped.startDrill(99); assert.equal(clamped.stage, 6);
  const values = new Map(), storage = { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) };
  const progress = readProgress(storage);
  assert.ok(markEncounter(progress, 6)); assert.equal(progress.bossSeen, 6);
  const clear = { shipId: 'kestrel', practiceStage: 6, outcome: 'victory', time: 88.4, hitsTaken: 1, livesLost: 0 };
  assert.deepEqual(recordDrill({}, clear, storage), { bestTime: 88.4, fewestHits: 1 });
  assert.equal(readProgress({ getItem: () => JSON.stringify({ bossSeen: 99 }) }).bossSeen, 6);
});

// ---- Sectors 1-5 are untouched -------------------------------------------------

// Golden fingerprints recorded on the pre-sector-6 code (commit ab6820f): sector 5
// from campaign entry (three kits), drill 5, HALCYON as a campaign flagship, and
// the engaged collector from launch through Act I, sector 4, sector 5 and HALCYON.
// Each campaign run stops on the frame its last flagship dies, which is where the
// 5-sector and 6-sector campaigns first differ.
const GOLDEN = {
  's5-kestrel-ref': 'ef1ac0ae12ca6919 gameover boss:1 f:10137',
  'd5-kestrel-ref': '1ded749d33e45536 gameover boss:2',
  's5-kestrel-bare': 'b686dd163ae63a79 gameover boss:- f:4756',
  'd5-kestrel-bare': '96d523ea3981c28b gameover boss:1',
  's5-kestrel-refInv': '4cc7842c03b28a80 playing boss:- f:10442',
  'd5-kestrel-refInv': '90ca3dd2ba1824d0 victory boss:-',
  'h5-kestrel': 'd73b8755b9bd1c38 playing f:4967',
  'c-kestrel': '1:a67f45c0f9157c99,2:455aabb0fc9cb5db,3:1e58fb669a8b4421,4:7de636725fa0d999 end:3c5937b3abe146c0 f:38516',
  's5-manta-ref': '5f3ff4f8a2624691 playing boss:1 f:12600',
  'd5-manta-ref': 'b8c4ffc6683da6a6 playing boss:1',
  's5-manta-bare': 'e29593b586653f9d gameover boss:- f:4961',
  'd5-manta-bare': '402366d639469caf gameover boss:1',
  's5-manta-refInv': '5c93cf32b07010f4 playing boss:- f:10317',
  'd5-manta-refInv': '4bb855fe2e1ebf6c victory boss:-',
  'h5-manta': 'f519aa5c83d0e166 playing f:4441',
  'c-manta': '1:24c819c37e482166,2:9b7e91a18f669083,3:67e1772b22fd3a77,4:039738b82669abe6 end:398e68d53b9c41ba f:37359',
  's5-wraith-ref': '820a58369e204404 gameover boss:1 f:10671',
  'd5-wraith-ref': 'efb3c69b4d28dab5 gameover boss:2',
  's5-wraith-bare': '4cb32bd0055389de gameover boss:- f:4756',
  'd5-wraith-bare': '0a7ea507a683990c gameover boss:1',
  's5-wraith-refInv': '738222259af92b20 playing boss:- f:10380',
  'd5-wraith-refInv': 'd50479acc2b75e45 victory boss:-',
  'h5-wraith': '59baa351b1b8aff0 playing f:5895',
  'c-wraith': '1:95137de2c1d8a08c,2:ef8dae3a98a76987,3:5b12fca040b39f35,4:03b9eca0ba292d52 end:45cf59ce3caaca63 f:39592',
};
test('sectors 1-5, LEVIATHAN and HALCYON are bit-identical to the pre-sector-6 code from the same starting state', () => {
  const pilot = f => { const t = f / 60; return { fire: true, pointerActive: true, pointerX: 270 + Math.sin(t * 1.3) * 180, pointerY: 700 + Math.sin(t * .7) * 80, roll: f % 400 === 0, bomb: f % 1500 === 700 }; };
  const fp = g => { const p = g.player; return createHash('sha256').update(JSON.stringify([g.mode, g.stage, g.score, g._seed, p.level, p.hp, p.lives, p.escorts, p.sidewinder, p.signature, p.shield, g.stats, g.threat.toFixed(9), g.enemies.length, g.bullets.length, g.pickups.length, g.boss && [g.boss.hp, g.boss.phase, g.boss.age.toFixed(6)], g.time.toFixed(6)])).digest('hex').slice(0, 16); };
  const seen = {};
  for (const ship of ['kestrel', 'manta', 'wraith']) {
    for (const k of ['ref', 'bare', 'refInv']) {
      const g = sortie(ship);
      g._seed = 5151; g.stage = 5; g.stageTime = 0; g._beatIndex = 0; g._laneIndex = 0; g.threat = 0;
      if (k !== 'bare') kit(g, REFERENCE5);
      let f = 0;
      for (; f < 60 * 210 && g.mode === 'playing' && g._transition <= 0; f++) { if (k === 'refInv') g.player.invuln = 99; g.update(1 / 60, pilot(f)); }
      seen[`s5-${ship}-${k}`] = fp(g) + ' ' + g.mode + ' boss:' + (g.boss ? g.boss.phase : '-') + ' f:' + f;
      const d = new Game(); d.selectShip(ship); d.startDrill(5); d._seed = 888;
      if (k === 'bare') kit(d, BARE);
      for (f = 0; f < 60 * 120 && d.mode === 'playing'; f++) { if (k === 'refInv') d.player.invuln = 99; d.update(1 / 60, pilot(f)); }
      seen[`d5-${ship}-${k}`] = fp(d) + ' ' + d.mode + ' boss:' + (d.boss ? d.boss.phase : '-');
    }
    const h = sortie(ship);
    h._seed = 99; h.stage = 5; kit(h, { level: 25, escorts: 6, sidewinder: 4, signature: 4, shield: 3 }); h.threat = h._threatTarget(); h._spawnBoss();
    let f = 0;
    for (; f < 60 * 200 && h.mode === 'playing' && h._transition <= 0; f++) { h.player.invuln = 99; h.update(1 / 60, { fire: true, pointerActive: true, pointerX: h.boss ? h.boss.x : 270, pointerY: 720 }); }
    seen[`h5-${ship}`] = fp(h) + ' ' + h.mode + ' f:' + f;
    const a = sortie(ship); a._seed = 31337;
    const marks = [];
    for (f = 0; f < 60 * 900 && a.mode === 'playing'; f++) {
      a.player.invuln = 99; const st = a.stage; a.update(1 / 60, engaged(a));
      if (a.stage !== st) marks.push(st + ':' + fp(a));
      if (a.stage === 5 && a.boss === null && a._transition > 0) break;
    }
    seen[`c-${ship}`] = marks.join(',') + ' end:' + fp(a) + ' f:' + f;
  }
  assert.deepEqual(seen, GOLDEN);
});

// ---- Echoes ------------------------------------------------------------------

test('an echo replays the recorded path 2.5 s late, mirrored and up-field, and the replay is deterministic', () => {
  const fly = () => {
    const game = quiet6('kestrel'); const p = game.player;
    const trace = [];
    const input = f => ({ pointerActive: true, pointerX: 270 + Math.sin(f / 40) * 170, pointerY: 720 + Math.cos(f / 55) * 60 });
    let f = 0;
    for (; f < 200; f++) game.update(1 / 60, input(f));
    game.events = [];
    const [e1, e2] = game._spawnEchoes([[-1, 0, 410], [1, 30, 470]], null, false, 0);
    assert.equal(count(game.events, 'echoSpawn'), 1); assert.equal(game.events[0].value, 'spread'); assert.equal(game.events[0].count, 2);
    assert.ok(e1.phasing && e2.phasing, 'echoes materialise as ghosts');
    for (; f < 200 + 3 * 60; f++) {
      game.update(1 / 60, input(f));
      if (e1.age > .85 && e1.age < 6) {
        const P = game.path, i = e1.trail;
        assert.equal(i, ((P.head - 1 - 300) % P.size + P.size) % P.size, 'replays the sample 300 ticks (2.5 s) old');
        assert.ok(Math.abs(e1.x - Math.max(36, Math.min(504, 540 - P.x[i]))) < 1e-9, 'mirrored about the centre line');
        assert.ok(Math.abs(e1.y - Math.max(70, P.y[i] - 410)) < 1e-9, '410 px up-field');
        assert.ok(Math.abs(e2.x - Math.max(36, Math.min(504, P.x[e2.trail] + 30))) < 1e-9, 'a straight copy, shifted');
        assert.equal(e1.phasing, false);
      }
      trace.push([e1.x, e1.y, e2.x, e2.y, game.bullets.length, game._seed].join(','));
    }
    assert.ok(Math.abs(p.x - 270) < 200);
    return trace;
  };
  assert.deepEqual(fly(), fly());
});

test('echoes are ghosts while they materialise, then die to a volley and fire a weak copy of the player gun', () => {
  for (const [ship, style] of [['kestrel', 'spread'], ['manta', 'missile'], ['wraith', 'pierce']]) {
    const game = quiet6(ship); const p = game.player; p.x = 300; p.y = 720;
    for (let i = 0; i < 400; i++) game._recordPath();
    const [e] = game._spawnEchoes([[1, 0, 410]], null, false, 0);
    assert.equal(e.style, style); assert.equal(e.ship, ship, 'an echo names the ship it copies (its sprite)'); assert.ok(e.maxHp < 200, 'popcorn: ' + e.maxHp);
    step(game, .3);
    game.shots.push({ x: e.x, y: e.y + 20, vx: 0, vy: -900, r: 4, damage: 1000, kind: 'shot', age: 0 });
    game._updateShots(1 / 120); game._collide();
    assert.ok(!e.dead, 'shots pass through a materialising echo');
    game.shots.length = 0; game.bullets.length = 0; game.hazards.length = 0;
    const fired = step(game, 1.2);
    assert.ok(fired.some(ev => ev.type === 'echoFire' && ev.value === style), ship + ' echo fires its copy');
    if (style === 'pierce') assert.ok(game.hazards.some(h => h.kind === 'laser' && h.mirror && h.ownerId === e.id) || fired.some(ev => ev.type === 'laserWarn' && ev.mirror), 'a Wraith echo fires a mirror rail');
    else assert.ok(game.bullets.some(b => b.kind === 'mirror' && b.fragile), 'mirror rounds, fragile');
    if (style === 'missile') assert.ok(game.bullets.some(b => b.style === 'missile' && b.homing > 0));
    game._damageEnemy(e, e.hp + 1); game._killEnemy(e);
    assert.ok(e.dead);
    assert.ok(!game.hazards.some(h => h.ownerId === e.id), 'its rail goes with it');
  }
});

// ---- Satellite lances ----------------------------------------------------------

// x where a ray from (px, py) at `angle` crosses altitude y.
const crossing = (h, y, angle) => h.pivotX + (y - h.pivotY) * Math.cos(angle) / Math.sin(angle);
test('every satellite sweep leaves a reachable gap of 110 px or more at the ship altitude (80 px 60 px above or below)', () => {
  let sweeps = 0;
  for (const [ship, edge] of [['kestrel', 46], ['manta', 52], ['wraith', 62]]) {
  const game = quiet6(ship), lo0 = edge, hi0 = 540 - edge;
  for (const threat of [.5, .7, .88]) for (let sx = 70; sx <= 470; sx += 40) for (let px = 52; px <= 488; px += 24) for (const py of [560, 700, 820]) {
    game.hazards.length = 0; game.threat = threat;
    const sat = game._enemy('satellite', sx, 240, { dir: 1 }); sat.baseY = 240;
    game.player.x = Math.max(lo0, Math.min(hi0, px)); game.player.y = py;
    game._satelliteSweep(sat, game.player); sweeps++;
    const h = game.hazards.at(-1);
    assert.ok(h.rotating && h.warn === .9 && h.state === 'warn');
    for (const y of [py - 60, py, py + 60].filter(y => y >= 230 && y <= 820)) {   // where the ship can fly
      const a = crossing(h, y, h.angle0), b = crossing(h, y, h.angle1), lo = Math.min(a, b) - h.width - 9, hi = Math.max(a, b) + h.width + 9;
      const gap = Math.max(lo - lo0, hi0 - hi);
      assert.ok(gap >= (y === py ? 110 : 80) - 1e-6, `gap ${gap.toFixed(0)} px at y ${y} (sat ${sx}, ship ${px},${py}, threat ${threat})`);
      if (y === py) {
        // Reachable: the nearest clear x is within reach before the beam gets there.
        const near = Math.min(Math.abs(px - Math.max(lo0, Math.min(lo, hi0))), Math.abs(px - Math.min(hi0, Math.max(hi, lo0))));
        const reach = (h.warn + Math.abs(Math.atan2(py - h.pivotY, px - h.pivotX) - h.angle0) / Math.abs(h.sweep)) * 325;
        assert.ok(lo < lo0 || hi > hi0 || near <= reach, `reachable: ${near.toFixed(0)} px vs ${reach.toFixed(0)}`);
      }
    }
    sat.dead = true;
  }
  }
  assert.ok(sweeps > 900);
});

test('a satellite lance warns 0.9 s, then turns across its span; it hurts only while live and never while rolling; the satellite owns it', () => {
  const game = quiet6('wraith'); const p = game.player; p.x = 300; p.y = 700;
  const sat = game._spawnSatellite(1, 240, null, 0); sat.x = 280; sat.age = 1; sat.fireAt = 0;
  game.events = []; game.update(1 / 60, {});
  const warn = game.events.find(e => e.type === 'laserWarn' && e.rotating);
  assert.ok(warn, 'it sweeps once over the field'); assert.ok(sat.anchored && sat.laserId);
  const h = game.hazards.find(x => x.id === sat.laserId);
  assert.deepEqual([warn.pivotX, warn.pivotY, warn.angle, warn.sweep, warn.orient], [h.pivotX, h.pivotY, h.angle0, h.sweep, 'r']);
  // Harmless while warning, even standing on the line.
  p.invuln = 0; p.shield = 3;
  const onLine = () => { p.x = h.pivotX + Math.cos(h.angle) * 400; p.y = h.pivotY + Math.sin(h.angle) * 400; };
  onLine(); game.events = []; game._collide(); assert.equal(count(game.events, 'shieldHit'), 0);
  const fire = step(game, .95, () => { p.invuln = 99; return {}; });
  assert.equal(h.state, 'fire'); assert.ok(fire.some(e => e.type === 'laserFire' && e.rotating));
  const a0 = h.angle; step(game, .2, () => { p.invuln = 99; return {}; }); assert.ok(Math.abs(h.angle - a0) > .05, 'the beam turns');
  onLine(); p.invuln = 0; p.roll = .2; game.events = []; game._collide(); assert.equal(count(game.events, 'shieldHit'), 0, 'a roll passes');
  p.roll = 0; game.events = []; game._collide(); assert.equal(count(game.events, 'shieldHit'), 1, 'a live beam hurts');
  p.invuln = 99; game.events = []; game._killEnemy(sat);
  assert.equal(count(game.events, 'satelliteDown'), 1); assert.ok(!game.hazards.includes(h), 'its laser ends with it');
});

// ---- Shards, the Gate ---------------------------------------------------------------

test('a shard breaks on any player shot (spent unless it pierces); void studs do not; reflector and flak treat shards as ordinary', () => {
  const game = quiet6('kestrel'); const p = game.player;
  game.bullets.length = 0; game.shots.length = 0;
  const s1 = game._shard(200, 400, Math.PI / 2, 0), v = game._bullet(300, 400, Math.PI / 2, 0, 'void', 5);
  game.shots.push({ x: 200, y: 409, vx: 0, vy: -870, r: 4, damage: 7, kind: 'shot', age: 0 });
  game.shots.push({ x: 300, y: 409, vx: 0, vy: -870, r: 4, damage: 7, kind: 'shot', age: 0 });
  game.events = []; game._collide();
  assert.ok(s1.dead && game.shots[0].dead, 'shard and shot both spent'); assert.ok(!v.dead, 'void is never shootable');
  assert.ok(game.events.some(e => e.type === 'shardBreak' && e.value === 1));
  const s2 = game._shard(200, 300, Math.PI / 2, 0);
  const rail = { x: 200, y: 309, vx: 0, vy: -1000, r: 4, damage: 12, kind: 'pierce', age: 0, pierceRemaining: 3, hitIds: [] };
  game.shots.push(rail); game._collide();
  assert.ok(s2.dead && !rail.dead, 'a rail carves on through');
  assert.equal(game._shard(0, 0, 0, 0).kind, 'shard'); assert.equal(game.bullets.at(-1).fragile, true);
  // Reflector: an ordinary bullet.
  game.bullets.length = 0; game.shots.length = 0; p.reflector = 3; p.invuln = 0;
  const s3 = game._shard(p.x + 20, p.y, 0, 0); game.events = []; game._collide();
  assert.ok(s3.dead && count(game.events, 'reflect') === 1, 'the reflector turns shards back');
  // Kestrel flak eats a shard near the wing.
  p.reflector = 0; p.invuln = 99; game.bullets.length = 0;
  const s4 = game._shard(p.x + 40, p.y - 60, 0, 0);
  game.shots.push({ x: p.x + 40, y: p.y - 60, vx: 0, vy: 0, r: 3.2, damage: 6, kind: 'flak', age: .05 });
  game.events = []; game._flakScreen(); assert.ok(s4.dead && count(game.events, 'flakEat') === 1);
});

test('shard curtains have no natural gap: every row is shards with void studs, and the ship carves its own lane', () => {
  const game = quiet6('wraith', BARE); game.threat = 0;
  game.bullets.length = 0; game.events = []; game._spawnShardCurtain(5);
  assert.equal(game.events.find(e => e.type === 'shardCurtain').value, 5);
  const rows = new Map();
  for (const b of game.bullets) (rows.get(b.y) || rows.set(b.y, []).get(b.y)).push(b);
  assert.equal(rows.size, 5);
  for (const row of rows.values()) {
    row.sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) assert.ok(row[i].x - row[i - 1].x <= 27.01, 'no gap of its own');
    assert.ok(row.some(b => b.kind === 'void') && row.filter(b => b.kind === 'shard').length > row.length * .7);
  }
  // A bare Wraith rail opens its column through a whole row.
  const p = game.player, row = [...rows.values()][0], target = row.find(b => b.kind === 'shard' && b.x > 100 && b.x < 440);
  for (const b of game.bullets) { b.y += 500; b.vy = 0; }
  p.x = target.x; p.y = 760; p.invuln = 99;
  step(game, .6, { fire: true });
  assert.ok(target.dead, 'carved');
});

test('the Meridian Gate: armored while turrets live, holds, then leaves; turrets fire shard, void and mix rounds and die with it; no contact', () => {
  const game = quiet6('manta'); const p = game.player;
  game.events = [];
  const st = game._spawnStation({ heavy: ['power'], turrets: ['power', 'signature', 'power', 'shield', 'power', 'sidewinder'] });
  assert.equal(count(game.events, 'stationEnter'), 1);
  assert.deepEqual([st.w, st.h, st.turrets.length, st.turretsAlive, st.state], [176, 74, 6, 6, 'enter']);
  const turrets = game.enemies.filter(e => e.type === 'stationTurret');
  assert.deepEqual(turrets.map(t => t.gun), ['mix', 'shard', 'void', 'shard', 'mix', 'void']);
  assert.deepEqual(turrets.map(t => t.drop), ['power', 'signature', 'power', 'shield', 'power', 'sidewinder']);
  const hp = st.hp; game._damageEnemy(st, 100); assert.ok(Math.abs(hp - st.hp - 35) < 1e-9, 'x0.35 while turrets live');
  const kinds = new Set(); let held = false;
  for (let f = 0; f < 60 * 12; f++) { p.invuln = 99; game.update(1 / 60, {}); for (const b of game.bullets) kinds.add(b.kind); if (st.state === 'hold') held = true; }
  assert.ok(held && Math.abs(st.y - 205) < 1, 'holds at y 205'); assert.ok(kinds.has('shard') && kinds.has('void'), [...kinds].join());
  for (const t of turrets) { assert.equal(t.x, st.x + t.ox); assert.equal(t.y, st.y + t.oy); }
  p.invuln = 0; p.shield = 3; st.x = p.x; st.y = p.y; game.bullets.length = 0; game.events = []; game._collide();
  assert.equal(count(game.events, 'shieldHit') + count(game.events, 'playerHit'), 0, 'it flies above the ship');
  p.invuln = 99; game.events = []; game._killEnemy(turrets[1]);
  assert.equal(game.events.find(e => e.type === 'stationTurretDown').value, 'shard'); assert.equal(st.turretsAlive, 5);
  game.events = []; game._killEnemy(st);
  assert.ok(turrets.every(t => t.dead)); assert.equal(count(game.events, 'stationDown'), 1); assert.equal(count(game.events, 'stationTurretDown'), 0);
  const leave = quiet6(); const s2 = leave._spawnStation(null); s2.state = 'hold'; s2.holdUntil = 0; s2.y = 205;
  const fired = leave.bullets.length;
  step(leave, 4); assert.equal(s2.state, 'leave'); assert.ok(s2.y < 205 - 100, 'then it climbs back out');
  assert.equal(leave.bullets.length, fired, 'its guns fall silent once it departs');
});

// ---- THE SOVEREIGN ---------------------------------------------------------------

test('reflection: THE SOVEREIGN copies the weapon family and the escort count; mirror escorts armor the core and pay drops', () => {
  const game = new Game(); game.selectShip('manta'); game.startDrill(6);
  const boss = game.boss;
  const hp = boss.hp; game._damageEnemy(boss, 400); assert.equal(hp - boss.hp, 100, 'core x0.25 while an escort lives');
  const escorts = game.enemies.filter(e => e.type === 'mirrorEscort');
  assert.equal(escorts.length, 6); assert.deepEqual(escorts.map(e => e.slot), [0, 1, 2, 3, 4, 5]);
  assert.ok(escorts.every(e => e.style === 'manta' && e.parentId === boss.id));
  assert.deepEqual(escorts.map(e => e.ox), [-118, 118, -154, 154, -190, 190]);
  // A shot over a live escort hits it first.
  step(game, 4, () => { game.player.invuln = 99; return {}; });
  const e0 = escorts[0], ehp = e0.hp;
  game.shots.length = 0; game.shots.push({ x: e0.x, y: e0.y + 30, vx: 0, vy: -900, r: 4, damage: 10, kind: 'shot', age: 0 });
  for (let i = 0; i < 12 && game.shots.length; i++) { game._updateShots(1 / 120); game._collide(); game._cleanup(); }
  assert.ok(e0.hp < ehp, 'the escort took the shot');
  game.events = []; game.pickups.length = 0; game._killEnemy(e0);
  assert.equal(count(game.events, 'mirrorEscortDown'), 1); assert.equal(boss.escortsAlive, 5);
  assert.ok(game.pickups.length >= 2 && game.pickups.some(i => i.type === 'power'), 'power plus a ladder item');
  // The copied gun fires `mirror` rounds by the live power band.
  game.bullets.length = 0; game._sovereignMirror(boss);
  assert.equal(game.bullets.filter(b => b.kind === 'mirror' && b.style === 'missile' && b.fragile).length, 5, 'Manta at band 2: five mirror missiles');
  game.player.level = 10; game.bullets.length = 0; game._sovereignMirror(boss);
  assert.equal(game.bullets.length, 2, 'band 0: two');
  // A bare ship has no escorts to copy.
  const bare = new Game(); bare.selectShip('kestrel'); bare.startDrill(6); kit(bare, BARE); bare.threat = 0; bare._spawnBoss();
  assert.equal(bare.boss.escortsAlive, 0); assert.equal(bare.boss.rank, 0);
  const k = new Game(); k.selectShip('kestrel'); k.startDrill(6); k._sovereignMirror(k.boss);
  assert.ok(k.bullets.length === 9 && k.bullets.every(b => b.kind === 'mirror' && b.fragile), 'Kestrel: a nine-round glass fan');
  const w = new Game(); w.selectShip('wraith'); w.startDrill(6); w.hazards.length = 0; w._sovereignMirror(w.boss);
  const rails = w.hazards.filter(h => h.kind === 'laser' && h.mirror).map(h => h.pos).sort((a, b) => a - b);
  assert.equal(rails.length, 4, 'Wraith: four mirror rails');
  for (let i = 1; i < rails.length; i++) assert.ok(rails[i] - rails[i - 1] - 12 >= 100, 'rail gaps ' + rails.join(','));
});

const theftAt = (ship = 'kestrel') => {
  const game = new Game(); game.selectShip(ship); game.startDrill(6);
  const boss = game.boss;
  for (const e of game.enemies.filter(e => e.type === 'mirrorEscort')) game._killEnemy(e, false, true);
  boss.age = 40; boss.phase = 2; boss.phaseStart = 40; boss.hp = boss.maxHp * .6; game._sovereignEnterPhase(boss);
  game.pickups.length = 0; game.bullets.length = 0;
  const p = game.player; p.shield = 0; p.invuln = 0; p.reflector = 0;
  return game;
};
test('theft: a phase-2 hit sends the salvage up slow tethers instead of letting it float; one per type', () => {
  const game = theftAt(); const p = game.player;
  game.events = []; game._hurtPlayer(p.x, p.y);
  const launches = game.events.filter(e => e.type === 'tetherLaunch');
  assert.deepEqual(launches.map(e => e.value).sort(), ['escort', 'power', 'sidewinder', 'signature']);
  assert.ok(launches.every(e => e.time === 2.9 && e.amount > 0));
  assert.equal(game.pickups.length, 0, 'nothing floats');
  const tethers = game.enemies.filter(e => e.type === 'tether');
  assert.equal(tethers.length, 4); assert.ok(tethers.every(t => t.progress === 0 && t.carrying && t.hp === 60));
  assert.equal(tethers.find(t => t.carrying.type === 'power').carrying.value, launches.find(e => e.value === 'power').amount);
  // Slow: after 1.45 s each is half way up its curve.
  step(game, 1.45, () => { p.invuln = 99; return {}; });
  for (const t of tethers) assert.ok(Math.abs(t.progress - .5) < .02);
  // In other phases the salvage floats as before.
  const p1 = new Game(); p1.selectShip('kestrel'); p1.startDrill(6); p1.player.shield = 0; p1.player.invuln = 0; p1.pickups.length = 0;
  p1.events = []; p1._hurtPlayer(270, 700);
  assert.equal(count(p1.events, 'tetherLaunch'), 0); assert.ok(p1.pickups.some(i => i.salvage));
});

test('theft: a tether cut inside 2.9 s drops the salvage back; a tether that lands is lost and THE SOVEREIGN grows a weapon', () => {
  const game = theftAt('wraith'); const p = game.player;
  game._hurtPlayer(p.x, p.y);
  const tethers = game.enemies.filter(e => e.type === 'tether');
  const power = tethers.find(t => t.carrying.type === 'power'), value = power.carrying.value;
  step(game, 1, () => { p.invuln = 99; return {}; });
  game.events = []; game._damageEnemy(power, 1000); game._killEnemy(power);
  const cut = game.events.find(e => e.type === 'tetherCut');
  assert.deepEqual([cut.value, cut.amount, cut.quiet], ['power', value, false]);
  const back = game.pickups.find(i => i.salvage && i.type === 'power');
  assert.ok(back && back.value === value, 'the salvage drops back (salvage: true)');
  const lost0 = game.stats.salvageLost;
  const seen = step(game, 2.2, () => { p.invuln = 99; return {}; });
  assert.equal(count(seen, 'tetherLost'), 3); assert.equal(count(seen, 'sovereignGrow'), 3);
  assert.ok(game.stats.salvageLost > lost0, 'lost for good');
  assert.equal(game.boss.weapons.length, 3); assert.equal(game.boss.grown, 3);
  assert.deepEqual(game.boss.weapons.map(w => w.ox), [-150, 150, -80]);
  assert.ok(seen.filter(e => e.type === 'sovereignGrow').map(e => e.count).join() === '1,2,3');
  // Grown weapons fire.
  game.bullets.length = 0; for (const w of game.boss.weapons) w.fireAt = 0;
  game._sovereignGrown(game.boss, 1); assert.ok(game.bullets.length > 0);
  // Mounts cap at four; later landings still count as grown.
  for (let i = 0; i < 3; i++) game._sovereignGrow(game.boss, 'power');
  assert.equal(game.boss.weapons.length, 4); assert.equal(game.boss.grown, 6);
});

test('the ballet: void rings, shard rows and the copied gun in phase 3, then the desperation curtain on the guard floor', () => {
  const game = new Game(); game.selectShip('kestrel'); game.startDrill(6);
  const boss = game.boss;
  for (const e of game.enemies.filter(e => e.type === 'mirrorEscort')) game._killEnemy(e, false, true);
  boss.age = 70; boss.phase = 3; boss.phaseStart = 70; boss.hp = boss.maxHp * .3; game._sovereignEnterPhase(boss);
  const kinds = new Set();
  for (let f = 0; f < 60 * 6; f++) { game.player.invuln = 99; game.update(1 / 60, {}); for (const b of game.bullets) kinds.add(b.kind); }
  assert.ok(kinds.has('void') && kinds.has('shard') && kinds.has('mirror'), [...kinds].join());
  assert.ok(boss.ballet > 0);
  // The guard floor: shard rows with two open lanes replace the layers.
  boss.guard = true; boss.curtainAt = 0; game.bullets.length = 0; game._sovereignFire(boss, 1 / 120);
  const row = game.bullets.filter(b => b.kind === 'shard').map(b => b.x).sort((a, b) => a - b);
  let gaps = 0; for (let i = 1; i < row.length; i++) if (row[i] - row[i - 1] > 80) gaps++;
  assert.ok(row.length > 10 && gaps >= 1 && game.bullets.every(b => b.kind === 'shard'), 'the desperation curtain: ' + gaps + ' gaps');
});

test('THE SOVEREIGN: the reference kit kills it in 80-95 s through all three phases', () => {
  for (const ship of ['kestrel', 'wraith']) {
    const game = new Game(); game.selectShip(ship); game.startDrill(6);
    const boss = game.boss, phases = [];
    let lastEscort = 0;
    for (let f = 0; f < 60 * 130 && game.mode === 'playing'; f++) {
      game.player.invuln = 99; game.update(1 / 60, tracker(game));
      for (const e of game.events) { if (e.type === 'bossPhase') phases.push(e.value); if (e.type === 'mirrorEscortDown') lastEscort = boss.age; }
    }
    assert.equal(game.mode, 'victory'); assert.deepEqual(phases, [2, 3]);
    assert.ok(boss.age >= 80 && boss.age <= 95, `${ship} reference kill 80-95 s: ${boss.age.toFixed(1)}`);
    assert.ok(lastEscort >= 6 && lastEscort <= 20, `${ship} the escorts hold a while: ${lastEscort.toFixed(1)}`);
  }
});

test('THE SOVEREIGN holds a bare ship about three times longer than the reference kit (drill, no mercy)', () => {
  const game = new Game(); game.selectShip('manta'); game.startDrill(6);
  kit(game, BARE); game.threat = 0; game._spawnBoss();
  for (let f = 0; f < 60 * 400 && game.mode === 'playing'; f++) { game.player.invuln = 99; game.update(1 / 60, tracker(game)); }
  assert.equal(game.mode, 'victory');
  assert.ok(game.time >= 210 && game.time <= 320, 'bare kill time ' + game.time.toFixed(1));
});

test('THE SOVEREIGN meets a short campaign kit with less HP (never in drills) and a full arrival with rank-scaled HP', () => {
  const at = loadout => { const g = sortie('kestrel'); g.stage = 6; kit(g, loadout); g.threat = g._threatTarget(); g._spawnBoss(); return g.boss; };
  const full = at(REFERENCE6), p25 = at({ level: 25, escorts: 6, sidewinder: 4, signature: 4, shield: 3 }), bare = at(BARE);
  assert.equal(full.rank, 1); assert.equal(full.maxHp, 300000 * 1.3, 'a reference arrival (arsenal 139) meets full, rank-scaled HP');
  assert.ok(p25.maxHp < full.maxHp * .75 && p25.rank > 0 && p25.rank < 1, 'a P25 kit meets less: ' + p25.maxHp);
  assert.equal(bare.maxHp, 300000 * .62); assert.equal(bare.rank, 0);
  const drill = new Game(); drill.startDrill(6); assert.equal(drill.boss.maxHp, 300000 * 1.3, 'drills: authored HP (rank-scaled), no mercy');
});

test('THE SOVEREIGN death: bossDown carries the last pose, mirrorShatter fires, tethers drop their salvage, hazards and children go', () => {
  const game = theftAt('kestrel'); const p = game.player;
  const boss = game.boss;
  game._hurtPlayer(p.x, p.y); p.invuln = 99;
  game._sovereignGrow(boss, 'signature');
  const esc = game._enemy('mirrorEscort', boss.x + 118, boss.y + 26, { parent: boss, slot: 1, side: 1, rank: 0, ox: 118, oy: 26, style: 'kestrel' });
  game._mirrorRail(200, 300, .75, .3, boss.id);
  boss.angle = .01; boss.x = 280; boss.y = 200;
  game.pickups.length = 0; game.events = []; game._killEnemy(boss);
  const down = game.events.find(e => e.type === 'bossDown'), shatter = game.events.find(e => e.type === 'mirrorShatter');
  assert.deepEqual([down.x, down.y, down.value, down.w, down.h, down.angle, down.style], [280, 200, 6, 200, 80, .01, 'spread']);
  assert.deepEqual(down.escorts, [{ ox: 118, oy: 26, slot: 1 }]); assert.deepEqual(down.weapons, [{ type: 'signature', ox: -150 }]);
  assert.deepEqual([shatter.value, shatter.w, shatter.h, shatter.angle], [6, 200, 80, .01]);
  assert.ok(game.events.indexOf(shatter) > game.events.indexOf(down));
  assert.equal(game.boss, null); assert.equal(game.hazards.length, 0); assert.ok(esc.dead);
  assert.ok(game.events.filter(e => e.type === 'tetherCut').every(e => e.quiet) && count(game.events, 'tetherCut') === 4, 'stolen salvage falls back');
  assert.ok(game.pickups.filter(i => i.salvage).length >= 4);
  const hal = new Game(); hal.startDrill(5); hal.events = []; hal._killEnemy(hal.boss);
  assert.equal(count(hal.events, 'mirrorShatter'), 0);
});

test('sector 6 pays rescue power below threat 0.65; THE SOVEREIGN\'s rescue echo is a close shadow', () => {
  const pays = (stage, threat) => {
    const g = sortie('kestrel'); g.stage = stage; g.threat = threat;
    const e = g._enemy('interceptor', 270, 300, { rescue: true }); g.pickups.length = 0;
    g._killEnemy(e); return g.pickups.filter(i => i.type === 'power').length;
  };
  assert.equal(pays(6, .62), 1); assert.equal(pays(6, .66), 0); assert.equal(pays(5, .62), 0);
  const game = new Game(); game.selectShip('kestrel'); game.startDrill(6); kit(game, BARE); game.threat = 0; game._spawnBoss();
  const boss = game.boss; boss.age = 5; boss.echoAt = 0;
  game.events = []; game._sovereignFire(boss, 1 / 120);
  const echoes = game.enemies.filter(e => e.type === 'echo');
  assert.equal(echoes.length, 2); assert.ok(echoes[0].rescue && echoes[0].mirror === 1 && echoes[0].lag === .5 && echoes[0].ox === 0);
  assert.ok(!echoes[0].squad, 'no squadron bonus'); assert.ok(boss.echoAt - boss.age < 6, 'a stripped ship meets them often');
});

// ---- Determinism, drops ----------------------------------------------------------

test('identical seeded runs through sector 6 and THE SOVEREIGN stay identical', () => {
  const run = () => {
    const game = sortie('manta'); game.stage = 6; game.stageTime = 0; game._beatIndex = 0; game._laneIndex = 0;
    kit(game, REFERENCE6); game._seed = 77;
    const trace = [];
    for (let f = 0; f < 60 * 150; f++) {
      const t = f / 60; game.player.invuln = f > 60 * 110 && f % 900 < 30 ? 0 : 99;
      game.update(1 / 60, { fire: true, pointerActive: true, pointerX: 270 + Math.sin(t * .7) * 180, pointerY: 700 + Math.cos(t * 1.3) * 60, roll: f % 300 === 0 });
      if (f % 120 === 0) trace.push([game.score, game.enemies.length, game.bullets.length, game.hazards.length, game.player.level,
        Math.round(game.threat * 1000), game._seed, game.boss?.hp, game.boss?.weapons?.length, game.path.head].join(','));
    }
    return trace;
  };
  assert.deepEqual(run(), run());
});

test('key drops are collected 2 s or more before the attack they answer (engaged collector, every ship)', () => {
  for (const ship of ['kestrel', 'manta', 'wraith']) {
    const game = sortie(ship); game.stage = 6; game.stageTime = 0; game._beatIndex = 0; game._laneIndex = 0;
    kit(game, REFERENCE6); game.threat = 0;
    const got = {}, first = {};
    const mark = k => { first[k] ??= game.stageTime; };
    const echo = game._echoFire.bind(game), turret = game._stationTurretFire.bind(game);
    game._echoFire = (e, p) => { mark('echo@' + Math.floor(game.stageTime - e.age)); return echo(e, p); };   // keyed by spawn second
    game._stationTurretFire = (e, p) => { mark('gate'); return turret(e, p); };
    for (let f = 0; f < 60 * 92 && !game.boss; f++) {
      game.player.invuln = 99;
      game.update(1 / 60, engaged(game));
      for (const e of game.events) {
        if (e.type === 'pickup' && e.tag) got[e.tag] ??= game.stageTime;
        if (e.type === 'laserFire' && e.rotating) mark('lance');
        // The curtain's first row reaches the ship's band (y 520) at its fall speed,
        // whether or not the kit has carved it by then.
        if (e.type === 'shardCurtain') first.curtain ??= game.stageTime + 520 / e.speed;
      }
      if (game.stageTime > 84 && game.bullets.some(b => b.kind === 'cyan')) mark('remixAces');
    }
    const check = (tag, attack, label) => assert.ok(got[tag] != null && got[tag] <= first[attack] - 2,
      `${ship} ${tag} collected at ${got[tag]?.toFixed(1)}, ${label} fires at ${first[attack]?.toFixed(1)}`);
    check('7.2:sidewinder', 'echo@14', 'the first echo pair');
    check('15.5:shield', 'lance', 'the first satellite lance');
    check('29.0:power', 'curtain', 'the first shard curtain');
    check('38.0:signature', 'echo@48', 'the echo wing');
    check('53.0:shield', 'gate', 'the Meridian Gate');
    check('78.5:reflector', 'remixAces', "the remix gauntlet's ace pair");
  }
});
