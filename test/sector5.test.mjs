// Sector 5, SKYFORGE: campaign flow, drill 5, the new enemies and hazards,
// the EMP, HALCYON, the drop schedule and sector 4's bit-identity
// (docs/design/act-two.md, "Sector 5 build contract" and "Simulation notes (sector 5)").
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Game, CAMPAIGN_STAGES, STAGE_BEATS } from '../src/game.js';
import { readProgress, markEncounter, recordDrill, drillClearTier } from '../src/progress.js';

const REFERENCE5 = { level: 43, escorts: 6, sidewinder: 12, signature: 12, shield: 3 };
const REFERENCE4 = { level: 25, escorts: 6, sidewinder: 4, signature: 4, shield: 3 };
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
// Sector 5 with no authored beats: a clean field for behaviour tests.
const quietSector5 = (ship = 'kestrel', loadout = REFERENCE5) => {
  const game = sortie(ship);
  game.stage = 5; game.stageTime = 0; game._beatIndex = 999; game._laneIndex = 999;
  game.stageGoal = [...game.stageGoal]; game.stageGoal[5] = 1e9;
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
// Invulnerable boss tracker: collects drops, shoots bays first, then the core.
const tracker = game => {
  const p = game.player;
  for (const i of game.pickups) if (!i.dead && i.y > 240 && Math.hypot(i.x - p.x, i.y - p.y) < 300)
    return { fire: true, pointerActive: true, pointerX: i.x, pointerY: i.y };
  let tx = game.boss ? game.boss.x : p.x;
  const bay = game.enemies.find(e => e.type === 'foundryBay' && !e.dead && e.parentId === game.boss?.id);
  if (bay) tx = bay.x;
  return { fire: true, pointerActive: true, pointerX: tx, pointerY: 700 };
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

test('LEVIATHAN hands over to sector 5 on an ordinary interlude; HALCYON hands over to sector 6', () => {
  assert.equal(CAMPAIGN_STAGES, 6);
  const game = sortie('manta'); game.player.invuln = 999;
  game.stage = 4; game._spawnBoss(); game.boss.y = 190;
  const hp = game.player.hp = 2, bombs = game.player.bombs = 1;
  game.events = []; game._killEnemy(game.boss);
  assert.equal(count(game.events, 'actTwo'), 0, 'no act card between sectors 4 and 5');
  assert.equal(game._transition, 3.5); assert.equal(game._transitionLength, 3.5);
  const climb = step(game, 3.7);
  assert.equal(game.stage, 5); assert.equal(game.mode, 'playing');
  assert.ok(climb.some(e => e.type === 'stage' && e.value === 5));
  assert.ok(hp < game.player.maxHp); assert.equal(game.player.hp, game.player.maxHp, 'clearing LEVIATHAN repairs the hull'); assert.equal(game.player.bombs, bombs + 1);
  assert.equal(game.stageGoal[5], 100); assert.equal(game.threat, 0, 'the sector opens on a power trip');
  game._spawnBoss();
  assert.equal(game.boss.name, 'HALCYON'); assert.ok(game.boss.halcyon);
  game.player.hp = 1; game.events = []; game._killEnemy(game.boss);
  assert.equal(game._transition, 3.5); assert.equal(count(game.events, 'actTwo'), 0);
  step(game, 4);
  assert.equal(game.mode, 'playing'); assert.equal(game.stage, 6); assert.equal(game.summary, null);
  assert.equal(game.player.hp, game.player.maxHp, 'clearing HALCYON repairs the hull');
});

test('sector 5 has no lane sweeps and authors 100 s of beats before HALCYON', () => {
  const game = sortie(); game.stage = 5; game.stageTime = 0; game._beatIndex = 0; game._laneIndex = 0;
  kit(game, REFERENCE5);
  const events = [];
  let peak = 0;
  for (let f = 0; f < 60 * 101 && !game.boss; f++) {
    game.player.invuln = 99;
    game.update(1 / 60, engaged(game)); events.push(...game.events); peak = Math.max(peak, game.bullets.length);
  }
  assert.ok(game.boss && game.boss.name === 'HALCYON', 'HALCYON arrives at 100 s');
  assert.equal(count(events, 'lane'), 0);
  assert.deepEqual(events.filter(e => e.type === 'foundryEnter').map(e => e.value), ['small', 'large']);
  assert.deepEqual(events.filter(e => e.type === 'boxEnter').map(e => e.value), ['climb', 'climb', 'climb', 'dive']);
  assert.equal(count(events, 'foundryDown'), 2, 'the reference kit downs both foundries');
  assert.ok(count(events, 'flakMark') >= 10 && count(events, 'flakBurst') === count(events, 'flakMark'));
  assert.ok(count(events, 'squadronEnter') >= 16); assert.ok(count(events, 'squadronBonus') >= 14, 'popcorn still melts');
  assert.ok(count(events, 'skyAceDodge') > 0); assert.ok(count(events, 'droneLaunch') > 0); assert.ok(count(events, 'bayDown') >= 7);
  assert.ok(peak < 200, 'peak bullets stay readable: ' + peak);
  assert.equal(STAGE_BEATS[5].at(-1)[0] < 100, true);
});

test('drill 5 starts HALCYON with the sector-5 reference kit; career and drill records accept 5', () => {
  for (const ship of ['kestrel', 'manta', 'wraith']) {
    const game = new Game(); game.selectShip(ship); game.startDrill(5);
    const p = game.player;
    assert.equal(game.stage, 5); assert.equal(game.practiceStage, 5);
    assert.deepEqual([p.level, p.power, p.escorts, p.sidewinder, p.signature, p.shield], [43, 43, 6, 12, 12, 3]);
    assert.equal(game.boss.name, 'HALCYON'); assert.equal(game.boss.w, 220); assert.equal(game.boss.h, 70);
    assert.equal(game.boss.bays.length, 3); assert.equal(game.boss.baysAlive, 3);
    assert.ok(game.threat > .84 && game.threat < .88, 'the reference kit sits near threat 0.86: ' + game.threat);
    game.events = []; game._killEnemy(game.boss); step(game, 4);
    assert.equal(game.mode, 'victory', 'a drill ends in victory');
  }
  const clamped = new Game(); clamped.startDrill(99); assert.equal(clamped.stage, CAMPAIGN_STAGES);
  const values = new Map(), storage = { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) };
  const progress = readProgress(storage);
  assert.ok(markEncounter(progress, 5)); assert.equal(progress.bossSeen, 5);
  const clear = { shipId: 'wraith', practiceStage: 5, outcome: 'victory', time: 74.2, hitsTaken: 0, livesLost: 0 };
  assert.equal(drillClearTier(clear), 'flawless');
  assert.deepEqual(recordDrill({}, clear, storage), { bestTime: 74.2, fewestHits: 0 });
  assert.equal(readProgress({ getItem: () => JSON.stringify({ bossSeen: 99 }) }).bossSeen, CAMPAIGN_STAGES);
});

// ---- Sector 4 is untouched -------------------------------------------------

// Golden fingerprints recorded on the pre-sector-5 code (commit 73f9a75):
// sector 4 from campaign entry and drill 4 (LEVIATHAN), each ship, three kits.
const GOLDEN = {
  's4-kestrel-ref': '15c7418296121b0b gameover boss:1', 'd4-kestrel-ref': '0505e9b9d56eaf2d playing boss:3',
  's4-kestrel-bare': 'ef7e70a36ea1adab gameover boss:-', 'd4-kestrel-bare': '0505e9b9d56eaf2d playing boss:3',
  's4-kestrel-refInv': 'e56f467b233c2d2e playing boss:3', 'd4-kestrel-refInv': '25a84a85b1f05cc5 victory boss:-',
  's4-manta-ref': '1e9c8dd4e806f520 playing boss:1', 'd4-manta-ref': 'd9f2299f2496079d playing boss:3',
  's4-manta-bare': '2bd1c70be8755bd0 gameover boss:1', 'd4-manta-bare': 'd9f2299f2496079d playing boss:3',
  's4-manta-refInv': '9456ea6d4fe70093 playing boss:3', 'd4-manta-refInv': 'a9a487aa8b21245c victory boss:-',
  's4-wraith-ref': 'cf1c6d394049ff2b gameover boss:1', 'd4-wraith-ref': '57688955d0bcbaed playing boss:1',
  's4-wraith-bare': '9db38390d3657e2a gameover boss:-', 'd4-wraith-bare': '57688955d0bcbaed playing boss:1',
  's4-wraith-refInv': '1a3036c5c8a185a0 playing boss:3', 'd4-wraith-refInv': 'c12773cb5b293184 victory boss:-'
};
test('sector 4 and LEVIATHAN are bit-identical to the pre-sector-5 code from the same starting state', () => {
  const pilot = f => { const t = f / 60; return { fire: true, pointerActive: true, pointerX: 270 + Math.sin(t * 1.3) * 180, pointerY: 700 + Math.sin(t * .7) * 80, roll: f % 400 === 0, bomb: f % 1500 === 700 }; };
  const fp = g => { const p = g.player; return createHash('sha256').update(JSON.stringify([g.mode, g.stage, g.score, g._seed, p.level, p.hp, p.lives, p.escorts, p.sidewinder, p.signature, p.shield, g.stats, g.threat.toFixed(9), g.enemies.length, g.bullets.length, g.pickups.length, g.boss && [g.boss.hp, g.boss.phase, g.boss.age.toFixed(6)], g.time.toFixed(6)])).digest('hex').slice(0, 16); };
  const seen = {};
  for (const ship of ['kestrel', 'manta', 'wraith']) for (const k of ['ref', 'bare', 'refInv']) {
    const g = new Game(); g.selectShip(ship); g.update(0, { start: true }); g.update(1 / 60, {});
    g._seed = 4242; g.stage = 4; g.stageTime = 0; g._beatIndex = 0; g._laneIndex = 0; g.threat = 0;
    if (k !== 'bare') kit(g, REFERENCE4);
    for (let f = 0; f < 60 * 150 && g.mode === 'playing'; f++) { if (k === 'refInv') g.player.invuln = 99; g.update(1 / 60, pilot(f)); }
    seen[`s4-${ship}-${k}`] = fp(g) + ' ' + g.mode + ' boss:' + (g.boss ? g.boss.phase : '-');
    const d = new Game(); d.selectShip(ship); d.startDrill(4); d._seed = 777;
    for (let f = 0; f < 60 * 90 && d.mode === 'playing'; f++) { if (k === 'refInv') d.player.invuln = 99; d.update(1 / 60, pilot(f)); }
    seen[`d4-${ship}-${k}`] = fp(d) + ' ' + d.mode + ' boss:' + (d.boss ? d.boss.phase : '-');
  }
  assert.deepEqual(seen, GOLDEN);
});

// ---- Enemies ----------------------------------------------------------------

test('a climbing bomber box warns 1.2 s ahead, enters from below, and its tail gunners fire only once above the ship', () => {
  const game = quietSector5(); const p = game.player; p.x = 270; p.y = 700;
  game.events = []; game._spawnBox(true, p.x, 3);
  const warn = game.events.find(e => e.type === 'boxEnter');
  assert.deepEqual([warn.value, warn.count, warn.lead, warn.y], ['climb', 3, 1.2, 900]); assert.equal(warn.xs.length, 3);
  const bombers = game.enemies.filter(e => e.type === 'boxBomber'), gunners = game.enemies.filter(e => e.type === 'tailGunner');
  assert.equal(bombers.length, 3); assert.equal(gunners.length, 4, 'the lead carries two guns');
  assert.ok(bombers.every(b => b.climb && b.hidden && b.y > 900 && b.box === bombers[0].box && Math.abs(b.angle - Math.PI) < 1e-9));
  assert.deepEqual(bombers[0].gunners, gunners.slice(0, 2).map(g => g.id));
  step(game, 1.15);
  assert.ok(bombers.every(b => b.hidden && b.y > 900), 'still waiting off the bottom edge');
  let firedBelow = false;
  for (let f = 0; f < 60 * 6 && bombers.some(b => !b.dead); f++) {
    const before = game.bullets.length; game.update(1 / 60, {});
    if (game.bullets.length > before && gunners.every(g => g.dead || g.y > p.y - 90)) firedBelow = true;
  }
  assert.ok(bombers.every(b => b.y < 0 || b.dead), 'the box climbed out of the top');
  assert.equal(firedBelow, false, 'gunners hold fire until their bomber has passed above the ship');
});

test('tail gunners shield their bomber, die with it, never hurt on contact; bomber bodies do', () => {
  const game = quietSector5(); const p = game.player;
  game._spawnBox(true, 270, 3); step(game, 1.3);
  const lead = game.enemies.find(e => e.type === 'boxBomber' && e.lead);
  lead.y = 400; for (let i = 0; i < 2; i++) game.update(1 / 120, {});
  const gun = game.enemies.find(e => e.type === 'tailGunner' && e.parentId === lead.id && !e.dead);
  const bomberHp = lead.hp, gunHp = gun.hp;
  game.shots.push({ x: gun.x, y: gun.y + 30, vx: 0, vy: -900, r: 4, damage: 10, kind: 'shot', age: 0 });
  for (let i = 0; i < 20 && game.shots.length; i++) { game._updateShots(1 / 120); game._collide(); game._cleanup(); }
  assert.equal(lead.hp, bomberHp, 'the shot struck the gunner first'); assert.ok(gun.hp < gunHp);
  game.events = []; game._killEnemy(lead);
  assert.ok(game.enemies.filter(e => e.type === 'tailGunner' && e.parentId === lead.id).every(g => g.dead));
  assert.equal(lead.gunnersAlive, 0);
  // Contact: a live gunner over the ship does nothing; a bomber body hurts.
  p.invuln = 0; p.shield = 0;
  const other = game.enemies.find(e => e.type === 'boxBomber' && !e.dead);
  const og = game.enemies.find(e => e.type === 'tailGunner' && e.parentId === other.id);
  og.x = p.x; og.y = p.y; other.x = p.x + 200; other.hidden = false; og.hidden = false;
  game.events = []; game._collide(); assert.equal(count(game.events, 'playerHit'), 0);
  other.x = p.x; other.y = p.y; game._collide(); assert.equal(count(game.events, 'playerHit'), 1);
});

test('a bomber box wipe pays the squadron bonus', () => {
  const game = quietSector5(); game._spawnBox(false, 270, 3); step(game, 1.4);
  game.events = [];
  for (const b of game.enemies.filter(e => e.type === 'boxBomber')) game._killEnemy(b);
  assert.equal(count(game.events, 'squadronBonus'), 1);
});

test('a sky ace sidesteps a main-gun column on a cooldown, ignores homing, and leads its aim', () => {
  const game = quietSector5(); const p = game.player; p.x = 270; p.y = 720;
  const ace = game._enemy('skyAce', 270, 260, { hoverY: 260, leaveAt: 99, fireAt: 99 });
  game.update(1 / 60, {});
  game.shots.push({ x: 300, y: 600, vx: 0, vy: -870, r: 4, damage: 0, kind: 'sidewinder', age: 0 });
  game._aceLook(ace); assert.equal(ace.dodge, 0, 'homing fire is not dodged');
  game.shots.push({ x: 290, y: 600, vx: 0, vy: -870, r: 4, damage: 0, kind: 'shot', age: 0 });
  game.events = []; game._aceLook(ace);
  assert.ok(ace.dodge > 0 && ace.dodgeDir === -1, 'steps away from the column'); assert.equal(count(game.events, 'skyAceDodge'), 1);
  const x0 = ace.x; step(game, .5); assert.ok(ace.x < x0 - 80, 'the sidestep moves it ' + (x0 - ace.x).toFixed(0) + ' px');
  game.shots = [{ x: ace.x, y: 600, vx: 0, vy: 0, r: 4, damage: 0, kind: 'shot', age: 0 }];
  game.update(1 / 60, {}); assert.ok(ace.dodgeCool > 0 && ace.dodge === 0, 'cooldown: not immortal');
  // Leading: with the ship moving right, the burst aims right of it.
  game.shots = []; game.bullets = []; ace.fireAt = 0; ace.dodge = 0;
  for (let i = 0; i < 6; i++) game.update(1 / 60, { right: true });
  const b = game.bullets[0]; assert.ok(b, 'the ace fired');
  const aimX = b.x + b.vx * ((p.y - b.y) / b.vy);
  assert.ok(aimX > p.x + 20, `leads the target: aims at ${aimX.toFixed(0)}, ship at ${p.x.toFixed(0)}`);
});

test('a foundry takes 35% damage while any bay lives; bays launch drones and die with it; foundries never hurt on contact', () => {
  const game = quietSector5(); const p = game.player;
  game.events = [];
  const f = game._spawnFoundry('small', 270, [[-74, 6], [0, 32], [74, 6]], [], null);
  assert.equal(count(game.events, 'foundryEnter'), 1); assert.equal(game.events.find(e => e.type === 'foundryEnter').value, 'small');
  assert.equal(f.bays.length, 3); assert.equal(f.baysAlive, 3); assert.ok(f.w > 0 && f.h > 0);
  const hp = f.hp; game._damageEnemy(f, 100); assert.ok(Math.abs(hp - f.hp - 35) < 1e-9, 'armored while bays live');
  const launches = step(game, 6);
  assert.ok(count(launches, 'droneLaunch') > 0 && game.enemies.some(e => e.type === 'drone'), 'bays launch drones');
  const bays = game.enemies.filter(e => e.type === 'foundryBay');
  for (const b of bays) { assert.equal(b.x, f.x + b.ox); assert.equal(b.y, f.y + b.oy); }
  game.events = []; game._killEnemy(bays[0]);
  assert.equal(game.events.find(e => e.type === 'bayDown').value, 'foundry'); assert.equal(f.baysAlive, 2);
  p.invuln = 0; f.y = p.y; f.x = p.x; game.events = []; game._collide();
  assert.equal(count(game.events, 'playerHit') + count(game.events, 'shieldHit'), 0, 'it flies above the ship');
  game.events = []; game._killEnemy(f);
  assert.ok(bays.every(b => b.dead)); assert.equal(count(game.events, 'foundryDown'), 1); assert.equal(count(game.events, 'bayDown'), 0);
});

test('drones melt to one reference volley; divers lock a heading at the ship; contact hurts', () => {
  const game = quietSector5(); const p = game.player;
  const d = game._enemy('drone', 270, 300, {}); const volley = 9 * 7 * (1 + 35 * .06);
  assert.ok(d.maxHp < volley, `drone ${d.maxHp} HP < one P43 Kestrel volley ${volley.toFixed(0)}`);
  const diver = game._enemy('drone', 270, 300, { dive: true });
  step(game, .45); const heading = diver.heading; assert.ok(Number.isFinite(heading));
  p.x += 120; step(game, .2); assert.equal(diver.heading, heading, 'the dive keeps its locked heading');
  p.invuln = 0; p.shield = 0; diver.x = p.x; diver.y = p.y; diver.hidden = false;
  game.events = []; game._collide(); assert.equal(count(game.events, 'playerHit'), 1);
});

test('sector-5 heavies scale with the rank (stripped ship x1.35, reference kit x2.2); popcorn and sector 4 do not', () => {
  const game = quietSector5();
  const full = game._enemy('boxBomber', 100, 100, {}).maxHp, pop = game._enemy('interceptor', 100, 100, {}).maxHp;
  game.threat = 0;
  const bare = game._enemy('boxBomber', 100, 100, {}).maxHp, popBare = game._enemy('interceptor', 100, 100, {}).maxHp;
  assert.ok(Math.abs(full - 1600 * 2.2) < 1e-6 && Math.abs(bare - 1600 * 1.35) < 1e-6, `${full} / ${bare}`);
  assert.ok(Math.abs(pop - 55 * 1.35) < 1e-6 && pop === popBare);
  const s4 = sortie(); s4.stage = 4; s4.threat = 0;
  assert.equal(s4._enemy('interceptor', 0, 0, {}).maxHp, 55); assert.equal(s4._enemy('hullTurret', 0, 0, { parent: { id: 1, x: 0, y: 0, turrets: [], turretsAlive: 0 }, ox: 0, oy: 0, gun: 'triple' }).maxHp, 1100);
});

// ---- Hazards -----------------------------------------------------------------

test('a flak band marks its altitude, bursts into short-lived shrapnel outside its gaps, then clears', () => {
  const game = quietSector5(); const p = game.player;
  game.events = []; const band = game._spawnFlakBand(600, 2);
  const mark = game.events.find(e => e.type === 'flakMark');
  assert.deepEqual([mark.y, mark.value, mark.gapW, mark.warn], [600, 2, 80, 1]); assert.equal(band.gaps.length, 2);
  assert.equal(game.hazards[0], band); assert.equal(band.state, 'mark'); assert.equal(game.bullets.length, 0);
  p.y = 400; const seen = step(game, 1.02);
  assert.equal(band.state, 'burst'); assert.equal(count(seen, 'flakBurst'), 1);
  const shrapnel = game.bullets.filter(b => b.ttl !== undefined);
  assert.ok(shrapnel.length >= 24, 'shrapnel along the row: ' + shrapnel.length);
  for (const b of shrapnel) assert.ok(band.gaps.every(g => Math.abs(b.x - g) >= band.gapW / 2 - 14), 'no shrapnel inside a gap');
  step(game, .7);
  assert.equal(game.bullets.filter(b => b.ttl !== undefined).length, 0, 'shrapnel is short-lived');
  assert.equal(game.hazards.length, 0, 'the band is gone after its burst');
  // A ship waiting in a gap is not hit.
  const safe = quietSector5(); const q = safe.player; q.invuln = 0; q.shield = 3;
  const b2 = safe._spawnFlakBand(q.y, 1, q.x);
  assert.equal(b2.gaps[0], q.x);
  const hits = step(safe, 1.6);
  assert.equal(count(hits, 'shieldHit') + count(hits, 'playerHit'), 0);
});

test('a flak corridor marks its bands together and steps each gap a reachable distance', () => {
  const game = quietSector5(); game.player.x = 200; game.player.y = 600;
  game.events = []; game._spawnFlakSet([[-120, 1], [0, 1.35], [120, 1.7]]);
  const marks = game.events.filter(e => e.type === 'flakMark');
  assert.deepEqual(marks.map(m => m.y), [480, 600, 720]); assert.deepEqual(marks.map(m => m.warn), [1, 1.35, 1.7]);
  for (let i = 1; i < marks.length; i++) assert.ok(Math.abs(marks[i].gaps[0] - marks[i - 1].gaps[0]) <= 76, 'a stepped path of gaps');
});

test('a laser warns, fires, then goes off; it hurts only while live and never while rolling; reflector and orbitals do not stop it', () => {
  const game = quietSector5('wraith'); const p = game.player; p.invuln = 0; p.shield = 0; p.reflector = 10;
  const bar = game._laserBar(1, 'v', p.x, 200, 900); bar.lead = true; bar.count = 1;
  game.events = []; game._collide(); assert.equal(count(game.events, 'playerHit'), 0, 'the telegraph is harmless');
  const seen = step(game, .95);
  assert.equal(bar.state, 'fire'); assert.equal(count(seen, 'laserFire'), 1);
  assert.equal(count(seen, 'playerHit'), 1, 'a live beam hurts through reflector and orbitals');
  // Rolling through a live beam is safe.
  const roller = quietSector5(); const r = roller.player; r.invuln = 0; r.shield = 0;
  const live = roller._laserBar(1, 'h', r.y, 0, 540, { warn: 0 }); roller.update(1 / 60, {});
  assert.equal(live.state, 'fire');
  r.invuln = 0; r.roll = .25; roller.events = []; roller._collide(); assert.equal(count(roller.events, 'playerHit'), 0);
  r.roll = 0; r.invuln = 0; roller._collide(); assert.equal(count(roller.events, 'playerHit'), 1);
  step(roller, 1); assert.equal(roller.hazards.length, 0, 'the bar is removed after it switches off');
});

test('an EMP ring charges 1.2 s, then disables the escorts for 2 s unless the ship rolls or leaves the ring', () => {
  const game = quietSector5(); const p = game.player;
  game.boss = { id: -1 }; game.events = []; game._halcyonEmp({ x: 270, y: 200 }); game.boss = null;
  const emp = game.hazards[0];
  // Round 3: the reference kit (threat ~0.86) meets the full 170 px ring.
  assert.deepEqual([emp.kind, emp.state, emp.chargeTime, emp.r], ['emp', 'charge', 1.2, 170]);
  assert.equal(count(game.events, 'empCharge'), 1);
  step(game, .6); assert.ok(emp.charge > .45 && emp.charge < .55);
  const pulse = step(game, .65, { fire: true });
  const ev = pulse.find(e => e.type === 'empPulse');
  assert.equal(ev.value, true); assert.ok(p.empTime > 1.8 && p.empTime <= 2);
  const before = game.stats.shotsFired; game.shots = [];
  step(game, .5, { fire: true });
  assert.ok(game.shots.length > 0 && !game.shots.some(s => s.kind === 'escort'), 'the wing goes dark and stops firing');
  assert.ok(game.stats.shotsFired > before);
  const clear = step(game, 1.6, { fire: true });
  assert.equal(count(clear, 'empClear'), 1); assert.equal(p.empTime, 0);
  step(game, .3, { fire: true }); assert.ok(game.shots.some(s => s.kind === 'escort'), 'the wing is back');
  // A roll during the pulse protects the escorts; so does leaving the ring.
  for (const dodge of ['roll', 'leave']) {
    const g = quietSector5(); g.boss = { id: -1 }; g._halcyonEmp({}); g.boss = null;
    if (dodge === 'leave') g.player.x = g.hazards[0].x + 200;
    step(g, 1.15);
    if (dodge === 'roll') g.player.roll = .3;
    const out = step(g, .1);
    assert.equal(out.find(e => e.type === 'empPulse').value, false, dodge); assert.equal(g.player.empTime, 0);
  }
});

test('the EMP ring grows with the rank: 120 px at threat 0.6 or less, 170 px from 0.84', () => {
  const g = quietSector5(); g.boss = { id: -1 };
  const ring = threat => { g.threat = threat; g.hazards.length = 0; g._halcyonEmp({}); return g.hazards[0].r; };
  assert.deepEqual([0, .45, .6, .72, .84, .88].map(ring), [120, 120, 120, 145, 170, 170]);
  g.boss = null;
});

test('an EMP ring leads the ship 0.6 s: a steady drift is caught, a turn escapes', () => {
  const fly = turnAt => {
    const g = quietSector5(); const p = g.player; p.x = 150; p.y = 600;
    step(g, 1 / 60, { right: true, focus: true });
    g.boss = { id: -1 }; g._halcyonEmp({}); g.boss = null;
    const emp = g.hazards[0];
    const out = step(g, 1.25, gm => gm.stageTime < turnAt ? { right: true, focus: true } : { left: true, focus: true });
    return { emp, vx: 190, x0: 150 + 190 / 60, hit: out.find(e => e.type === 'empPulse').value };
  };
  const straight = fly(99);
  assert.ok(Math.abs(straight.emp.x - (straight.x0 + 190 * .6)) < 1, 'the ring is centred 0.6 s ahead: ' + straight.emp.x);
  assert.equal(straight.hit, true, 'flying straight is caught');
  assert.equal(fly(.3).hit, false, 'turning back escapes');
  // A still ship gets the ring on itself, as before.
  const still = quietSector5(); still.player.x = 200; still.player.y = 600; step(still, 1 / 60, {});
  still.boss = { id: -1 }; still._halcyonEmp({}); still.boss = null;
  assert.deepEqual([still.hazards[0].x, still.hazards[0].y], [200, 600]);
});

test('a scatter, a lost life, HALCYON\'s death and a sector change reset a disabled wing (empClear "reset")', () => {
  const resets = events => events.filter(e => e.type === 'empClear' && e.value === 'reset').length;
  // Scatter: the escorts are gone, and so is the EMP.
  const g = quietSector5(); const p = g.player; p.invuln = 0; p.shield = 0; p.empTime = 1.5; g.events = [];
  g._hurtPlayer(p.x, p.y);
  assert.equal(p.empTime, 0); assert.equal(resets(g.events), 1);
  // A lost life (its first scatter resets the wing before lifeLost).
  const d = quietSector5(); d.player.invuln = 0; d.player.shield = 0; d.player.hp = 1; d.player.empTime = 1.5; d.events = [];
  d._hurtPlayer(d.player.x, d.player.y);
  const types = d.events.map(e => e.type);
  assert.equal(d.player.empTime, 0); assert.equal(resets(d.events), 1);
  assert.ok(types.indexOf('empClear') < types.indexOf('lifeLost'));
  // HALCYON's death.
  const h = new Game(); h.selectShip('kestrel'); h.startDrill(5); h.player.empTime = 1.2; h.events = [];
  h._killEnemy(h.boss);
  assert.equal(h.player.empTime, 0); assert.equal(resets(h.events), 1);
  // A sector change.
  const s = quietSector5(); s.stage = 4; s.player.empTime = .8; s.events = [];
  s._advanceStage();
  assert.equal(s.stage, 5); assert.equal(s.player.empTime, 0); assert.equal(resets(s.events), 1);
  // Nothing to reset: no event (sectors 1-4 never see one).
  const q = quietSector5(); q.player.invuln = 0; q.player.shield = 0; q.events = [];
  q._hurtPlayer(q.player.x, q.player.y); assert.equal(count(q.events, 'empClear'), 0);
  // The natural reboot carries no reset flag.
  const n = quietSector5(); n.player.empTime = .1; const out = step(n, .2);
  assert.equal(count(out, 'empClear'), 1); assert.notEqual(out.find(e => e.type === 'empClear').value, 'reset');
});

test('a tail gunner emits one gunnerFire per burst, with value = the rounds it fires', () => {
  const game = quietSector5(); game.player.x = 270; game.player.y = 800;
  let cur = null;
  const upd = game._updateSectorFiveEnemy.bind(game), spread = game._spread.bind(game), ev = game._event.bind(game);
  game._updateSectorFiveEnemy = (e, h, p) => { cur = e; upd(e, h, p); cur = null; };
  const bursts = new Map();
  game._event = (type, x, y, value) => { if (type === 'gunnerFire') (bursts.get(cur.id) || bursts.set(cur.id, []).get(cur.id)).push({ value, rounds: 0 }); return ev(type, x, y, value); };
  game._spread = (...a) => { if (cur?.type === 'tailGunner') bursts.get(cur.id).at(-1).rounds++; return spread(...a); };
  game._spawnBox(true, 270, 3);
  const events = step(game, 9, {});
  const all = [...bursts.values()].flat();
  assert.ok(all.length >= 4, 'gunners fired bursts: ' + all.length);
  assert.equal(count(events, 'gunnerFire'), all.length, 'one event per burst');
  const live = new Set(game.enemies.filter(e => e.type === 'tailGunner' && !e.dead && e.burstLeft > 0).map(e => e.id));
  for (const [id, list] of bursts) list.forEach((b, i) => {
    assert.ok(b.value >= 2 && b.value <= 3);
    if (!(live.has(id) && i === list.length - 1)) assert.equal(b.rounds, b.value, 'a burst fires exactly its announced rounds');
  });
});

test('a bomb clears flak bands and lasers, but EMP rings stay', () => {
  const game = quietSector5(); game.player.bombs = 1;
  game._spawnFlakBand(500, 2); game._laserBar(1, 'v', 100, 0, 900);
  game.hazards.push({ id: 99, kind: 'emp', x: 270, y: 600, r: 120, charge: 0, chargeTime: 1.2, age: 0, state: 'charge' });
  game._bomb();
  assert.deepEqual(game.hazards.map(h => h.kind), ['emp']);
});

// ---- HALCYON -------------------------------------------------------------------

test('HALCYON: three bays armor the core x0.25 and launch squadrons, then the lattice, then the eclipse protocol', () => {
  const game = new Game(); game.selectShip('manta'); game.startDrill(5);
  const boss = game.boss;
  const hp = boss.hp; game._damageEnemy(boss, 400); assert.equal(hp - boss.hp, 100, 'core x0.25 while a bay lives');
  // Left alone, each bay launches a three-craft interceptor squadron (no squadron bonus).
  const quiet = new Game(); quiet.selectShip('manta'); quiet.startDrill(5);
  const launched = step(quiet, 9, () => { quiet.player.invuln = 99; return {}; });
  assert.ok(count(launched, 'squadronEnter') >= 3 && launched.filter(e => e.type === 'squadronEnter').every(e => e.value === 3));
  assert.ok(quiet.enemies.filter(e => e.type === 'interceptor').every(e => !e.squad), 'bay squadrons pay no wipe bonus');
  const events = [], phases = [], kinds = new Set();
  let drops = 0, empPhase = 0, voidLasers = 0, plainLasers = 0, guardCurtain = false, lastBay = 0;
  for (let f = 0; f < 60 * 120 && game.mode === 'playing'; f++) {
    game.player.invuln = 99;
    game.update(1 / 60, tracker(game));
    for (const e of game.events) {
      events.push(e);
      if (e.type === 'drop' && boss.phase === 1) drops++;
      if (e.type === 'bossPhase') phases.push(e.value);
      if (e.type === 'bayDown') lastBay = boss.age;
      if (e.type === 'empCharge') empPhase = Math.max(empPhase, boss.phase);
      if (e.type === 'laserWarn') { if (e.value) voidLasers++; else plainLasers++; e.bars.forEach(b => kinds.add(b.orient)); }
    }
    if (boss.phase === 3 && boss.guard && game.bullets.some(b => b.kind === 'rose')) guardCurtain = true;
    if (boss.phase >= 2) assert.equal(game.enemies.filter(e => e.type === 'foundryBay' && !e.dead).length, 0, 'the tracker cleared the bays');
  }
  assert.equal(count(events, 'bayDown'), 3); assert.ok(events.filter(e => e.type === 'bayDown').every(e => e.value === 'boss'));
  assert.ok(drops >= 6, 'each bay drops power plus a bonus item: ' + drops);
  assert.deepEqual(phases, [2, 3]);
  assert.ok(plainLasers >= 3 && voidLasers >= 1, `lattice frames: ${plainLasers} plain, ${voidLasers} void`);
  assert.deepEqual([...kinds].sort(), ['h', 'v']);
  assert.equal(empPhase, 3, 'EMP rings come with the eclipse protocol');
  assert.ok(guardCurtain, 'the desperation curtain plays on the final guard floor');
  assert.equal(game.mode, 'victory');
  assert.ok(boss.age >= 65 && boss.age <= 85, 'the reference kit takes 65-85 s: ' + boss.age.toFixed(1));
  assert.ok(lastBay >= 11 && lastBay <= 19, 'the three bays hold about 12-18 s against the reference kit: ' + lastBay.toFixed(1));
});

test('HALCYON meets a short campaign kit with less HP (never in drills); its bays read the rank', () => {
  const at = loadout => {
    const g = sortie('kestrel'); g.stage = 5; kit(g, loadout); g.threat = g._threatTarget(); g._spawnBoss();
    return { hp: g.boss.maxHp, bay: g.enemies.find(e => e.type === 'foundryBay').maxHp };
  };
  const full = at({ level: 60, escorts: 6, sidewinder: 20, signature: 20, shield: 3 }), ref = at(REFERENCE5);
  const p25 = at(REFERENCE4), bare = at({ level: 2 });
  assert.equal(full.hp, 240000, 'a full arrival kit meets full HP');
  assert.ok(ref.hp < 240000 && ref.hp > 210000, 'the reference kit (arsenal 87) is near full: ' + ref.hp);
  assert.ok(p25.hp < ref.hp && p25.hp > .6 * 240000, 'a P25 kit meets less: ' + p25.hp);
  assert.equal(bare.hp, .55 * 240000, 'the floor');
  const drill = new Game(); drill.selectShip('kestrel'); drill.startDrill(5);
  assert.equal(drill.boss.maxHp, 240000, 'drills have no mercy');
  // Bays: x2.6 more HP from threat .7 to .84 (the reference kit), none for a sector-4 kit.
  assert.ok(Math.abs(ref.bay - 1800 * 2.2 * 2.6) < 1e-6, 'reference bays ' + ref.bay);
  assert.ok(bare.bay === 1800 * 1.35 && p25.bay < 1800 * 2.2, 'weak-kit bays ' + p25.bay);
});

test('sector 5 pays rescue power below threat 0.6 (sector 4 keeps 0.5), and the 48 s ace wing has a rescue lead', () => {
  const pays = stage => {
    const g = sortie('kestrel'); g.stage = stage; g.threat = .55;
    const e = g._enemy('interceptor', 270, 300, { rescue: true }); g.pickups.length = 0;
    g._killEnemy(e); return g.pickups.filter(i => i.type === 'power').length;
  };
  assert.equal(pays(5), 1); assert.equal(pays(4), 0);
  const wing = STAGE_BEATS[5].find(b => b[1] === 'aceWing');
  assert.equal(wing[0], 48); assert.ok(wing[2]?.rescue);
  const g = quietSector5(); g._spawnSectorFiveBeat('aceWing', wing[2]);
  const aces = g.enemies.filter(e => e.type === 'skyAce');
  assert.deepEqual(aces.map(e => !!e.rescue), [true, false, false, false, false]);
});

test('HALCYON holds a bare ship roughly three times longer than the reference kit', () => {
  const game = new Game(); game.selectShip('kestrel'); game.startDrill(5);
  kit(game, { level: 2, escorts: 0, sidewinder: 0, signature: 0, shield: 0 }); game.threat = 0;
  game._spawnBoss();   // respawn at the bare kit's rank (bays read it at spawn); a drill has no mercy
  for (let f = 0; f < 60 * 400 && game.mode === 'playing'; f++) { game.player.invuln = 99; game.update(1 / 60, tracker(game)); }
  assert.equal(game.mode, 'victory');
  assert.ok(game.time >= 190 && game.time <= 290, 'bare kill time ' + game.time.toFixed(1));
});

test('HALCYON death: bossDown carries the last pose and live bays, wingBreak fires, hazards and children go', () => {
  const game = new Game(); game.selectShip('wraith'); game.startDrill(5);
  const boss = game.boss, bays = game.enemies.filter(e => e.type === 'foundryBay');
  game._killEnemy(bays[1], false, true);
  boss.angle = .015; boss.x = 280; boss.y = 210; boss.phase = 2;
  game._laserBar(1, 'v', 100, 0, 900);
  const drone = game._enemy('drone', 200, 300, {});
  game.events = []; game._killEnemy(boss);
  const down = game.events.find(e => e.type === 'bossDown'), wing = game.events.find(e => e.type === 'wingBreak');
  assert.deepEqual({ x: down.x, y: down.y, value: down.value, w: down.w, h: down.h, angle: down.angle }, { x: 280, y: 210, value: 5, w: 220, h: 70, angle: .015 });
  assert.deepEqual(down.bays, [{ ox: -150, oy: 24 }, { ox: 150, oy: 24 }]);
  assert.deepEqual([wing.value, wing.w, wing.h, wing.angle], [5, 220, 70, .015]);
  assert.ok(game.events.indexOf(wing) > game.events.indexOf(down));
  assert.equal(game.boss, null); assert.equal(game.hazards.length, 0);
  assert.ok(bays.every(b => b.dead) && drone.dead); assert.equal(count(game.events, 'bayDown'), 0);
  const lev = new Game(); lev.startDrill(4); lev.events = []; lev._killEnemy(lev.boss);
  assert.equal(count(lev.events, 'wingBreak'), 0); assert.equal(lev.events.find(e => e.type === 'bossDown').bays, undefined);
});

test('HALCYON lattice frames always leave a gap of 96 px or more', () => {
  const game = new Game(); game.selectShip('kestrel'); game.startDrill(5);
  const boss = game.boss;
  for (let k = 0; k < 12; k++) {
    game.hazards.length = 0; game.player.x = 60 + k * 37; game.player.y = 300 + k * 40;
    game._halcyonLattice(boss, k % 2 === 1);
    const v = game.hazards.filter(h => h.orient === 'v').map(h => h.pos).sort((a, b) => a - b);
    for (let i = 1; i < v.length; i++) assert.ok(v[i] - v[i - 1] - 2 * 9 >= 96, 'columns ' + v.join(','));
    const rows = new Map();
    for (const h of game.hazards.filter(h => h.orient === 'h')) (rows.get(h.pos) || rows.set(h.pos, []).get(h.pos)).push(h);
    for (const segs of rows.values()) { segs.sort((a, b) => a.from - b.from); assert.ok(segs[1].from - segs[0].to >= 96 + 2 * 7); }
  }
});

// ---- Determinism, drops ----------------------------------------------------------

test('identical seeded runs through sector 5 and HALCYON stay identical', () => {
  const run = () => {
    const game = sortie('kestrel'); game.stage = 5; game.stageTime = 0; game._beatIndex = 0; game._laneIndex = 0;
    kit(game, REFERENCE5); game._seed = 99;
    const trace = [];
    for (let f = 0; f < 60 * 130; f++) {
      const t = f / 60; game.player.invuln = 99;
      game.update(1 / 60, { fire: true, pointerActive: true, pointerX: 270 + Math.sin(t * .7) * 180, pointerY: 700 + Math.cos(t * 1.3) * 60, roll: f % 300 === 0 });
      if (f % 120 === 0) trace.push([game.score, game.enemies.length, game.bullets.length, game.hazards.length, game.player.level, game.player.empTime.toFixed(4),
        Math.round(game.threat * 1000), game._seed, game.boss?.hp].join(','));
    }
    return trace;
  };
  assert.deepEqual(run(), run());
});

test('key drops are collected 2 s or more before the attack they answer (engaged collector, every ship)', () => {
  for (const ship of ['kestrel', 'manta', 'wraith']) {
    const game = sortie(ship); game.stage = 5; game.stageTime = 0; game._beatIndex = 0; game._laneIndex = 0;
    kit(game, REFERENCE5); game.threat = 0;
    const got = {}, firstAce = [], flak = [];
    for (let f = 0; f < 60 * 60 && !game.boss; f++) {
      game.player.invuln = 99;
      const aces = game.enemies.filter(e => e.type === 'skyAce').length, bullets = game.bullets.length;
      game.update(1 / 60, engaged(game));
      for (const e of game.events) {
        if (e.type === 'pickup' && e.tag) got[e.tag] ??= game.stageTime;
        if (e.type === 'flakBurst') flak.push(game.stageTime);
      }
      if (aces && game.bullets.length > bullets && game.enemies.some(e => e.type === 'skyAce' && e.burstLeft > 0) && !firstAce.length) firstAce.push(game.stageTime);
    }
    assert.ok(got['2.5:sidewinder'] <= 11.1 - 2, `${ship} sidewinder ${got['2.5:sidewinder']} before the first aces fire`);
    assert.ok(got['15.5:shield'] <= flak[0] - 2, `${ship} shield ${got['15.5:shield']} before the first flak burst ${flak[0]}`);
    assert.ok(got['43.5:reflector'] <= 49.1 - 2, `${ship} reflector ${got['43.5:reflector']} collected before the ace wing`);
    assert.ok(got['34.0:signature'] <= 48.1 - 2, `${ship} foundry signature ${got['34.0:signature']} before the 45.5 s box gunners`);
  }
});
