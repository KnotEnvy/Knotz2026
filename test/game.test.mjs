import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN_STAGES, Game, STAGE_BEATS } from '../src/game.js';

const start = game => {
  game.update(0, { start: true });
  game.update(1/60, { start: false });
  assert.equal(game.mode, 'playing');
};
const step = (game, frames, input = {}) => {
  for (let i = 0; i < frames; i++) game.update(1/60, input);
};

test('an enemy destroyed by a shot cannot damage the player in that collision tick', () => {
  const game=new Game();start(game);
  const p=game.player,e=game._enemy('scout',p.x,p.y,{fireAt:99});e.y=p.y;e.hp=1;
  game.shots.push({x:e.x,y:e.y,vx:0,vy:0,r:4,damage:10,kind:'shot',age:0});
  const hp=p.hp;game._collide();
  assert.equal(e.dead,true);assert.equal(game.stats.kills,1);assert.equal(p.hp,hp);
});

test('analog input preserves stick magnitude, caps diagonals and aims a roll', () => {
  const slow=new Game(),fast=new Game();start(slow);start(fast);
  step(slow,15,{moveX:.25});step(fast,15,{moveX:1});
  assert.ok(Math.abs((fast.player.x-270)/(slow.player.x-270)-4)<.01);
  const diagonal=new Game();start(diagonal);step(diagonal,15,{moveX:1,moveY:1});
  assert.ok(Math.abs(Math.hypot(diagonal.player.x-270,diagonal.player.y-750)-(fast.player.x-270))<.1);
  slow._roll({moveX:-.5,moveY:.5});assert.ok(slow.player.rollX<0&&slow.player.rollY>0);
});

test('movement is responsive and focus gives precise control', () => {
  const normal = new Game(); start(normal);
  step(normal, 30, { right: true });
  const normalTravel = normal.player.x - 270;
  const focused = new Game(); start(focused);
  step(focused, 30, { right: true, focus: true });
  const focusedTravel = focused.player.x - 270;
  assert.ok(normalTravel > 150, 'normal movement should cover ground quickly');
  assert.ok(focusedTravel > 65 && focusedTravel < normalTravel * .7, 'focus should slow movement');
});

test('bomb clears bullets, spends charge, and grants brief safety', () => {
  const game = new Game(); start(game);
  game.bullets.push({ x: 100, y: 300, vx: 0, vy: 100, r: 5, kind: 'red' });
  const charges = game.player.bombs;
  game._bomb();
  assert.equal(game.player.bombs, charges - 1);
  assert.equal(game.bullets.length, 0);
  assert.ok(game.player.invuln > 2);
});

test('pause freezes simulation and resumes', () => {
  const game = new Game(); start(game);
  game.update(1/60, { pause: true });
  assert.equal(game.mode, 'paused');
  const time = game.time;
  step(game, 120, { pause: false });
  assert.equal(game.time, time);
  game.update(1/60, { pause: true });
  assert.equal(game.mode, 'playing');
  assert.ok(game.time > time);
});

test('defeating a boss advances sector and replenishes resources', () => {
  const game = new Game(); start(game);
  game.stageTime = game.stageGoal[1];
  step(game, 1);
  assert.equal(game.boss?.type, 'boss');
  game.player.hp = 1;
  game.player.bombs = 0;
  game._killEnemy(game.boss);
  step(game, 240);
  assert.equal(game.stage, 2);
  assert.equal(game.player.hp, game.player.maxHp, 'an Act I sector clear repairs the hull (round 2)');
  assert.equal(game.player.bombs, 1);
  // Entering Act II still adds a single hull point.
  const crown = new Game(); start(crown); crown.stage = 3; crown.player.invuln = 999;
  crown._spawnBoss(); crown.player.hp = 1; crown._killEnemy(crown.boss);
  for (let i = 0; i < 60 * 7 && crown.stage === 3; i++) crown.update(1/60, {});
  assert.equal(crown.stage, 4);
  assert.equal(crown.player.hp, 2);
});

test('equal input sequences produce equal enemy and bullet state', () => {
  const first = new Game(), second = new Game();
  start(first); start(second);
  for (let i = 0; i < 1200; i++) {
    const input = { fire: true, left: i % 240 < 30, right: i % 240 >= 120 && i % 240 < 150, focus: i % 180 < 40 };
    first.update(1/60, input);
    second.update(1/60, input);
  }
  const snapshot = game => ({
    score: game.score, mode: game.mode, time: game.time,
    player: { x: game.player.x, y: game.player.y, hp: game.player.hp },
    enemies: game.enemies.map(e => [e.type, e.x, e.y, e.hp]),
    bullets: game.bullets.map(b => [b.x, b.y, b.kind])
  });
  assert.deepEqual(snapshot(first), snapshot(second));
});


test('grazing charges the storm wake and a charged roll converts nearby bullets', () => {
  const game = new Game(); start(game);
  const p = game.player;
  game.bullets.push({ x: p.x + 22, y: p.y, vx: 0, vy: 0, r: 5, kind: 'amber', grazed: false });
  game.update(1/60, {});
  assert.ok(p.wake > 0, 'a near miss should charge wake');
  p.wake = .5;
  game.bullets.push({ x: p.x, y: p.y - 20, vx: 0, vy: 0, r: 5, kind: 'red', grazed: false });
  const before = game.score;
  game.update(1/60, { roll: true });
  assert.ok(game.wakeConversions >= 1, 'charged roll should convert nearby fire');
  assert.ok(game.score > before, 'converted fire should award score');
  assert.ok(p.wake < .5, 'charged roll should spend wake');
});


test('score milestones award finite survival resources and reset on a new run', () => {
  const game = new Game(); start(game);
  game._awardScore(50000);
  assert.equal(game.player.lives, 4);
  assert.equal(game._nextExtend, 1);
  assert.ok(game.events.some(event => event.type === 'extend' && event.value === 50000));

  game.player.hp = 2;
  game._awardScore(110000);
  assert.equal(game.player.hp, 4, 'a full life rack should receive repair');

  game.player.bombs = 1;
  game._awardScore(190000);
  assert.equal(game.player.bombs, 2, 'full lives and hull should receive a bomb');
  game._awardScore(350000);
  assert.equal(game._nextExtend, 4);
  const resources = [game.player.lives, game.player.hp, game.player.bombs];
  game._awardScore(1000000);
  assert.deepEqual([game.player.lives, game.player.hp, game.player.bombs], resources);

  game._start();
  assert.equal(game._nextExtend, 0);
  assert.equal(game.player.lives, 3);
});
test('sector openings use distinct authored formations', () => {
  const opening = stage => {
    const game = new Game(); start(game);
    game.stage = stage;
    game.player.invuln = 10;
    // The opening beat lands after the sector intro card (Act I retune: 2.5 s or later).
    step(game, 145);
    assert.equal(game.enemies.length, 0, 'sector ' + stage + ' stays clear under its intro card');
    step(game, 65);
    return game.enemies.map(enemy => enemy.type);
  };
  const first = opening(1), second = opening(2), third = opening(3);
  assert.ok(first.includes('scout') && !first.includes('carrier'));
  assert.ok(second.includes('carrier') && !second.includes('scout'));
  assert.ok(third.includes('turret') && !third.includes('carrier'));
});

test('final sector has a planned breather before its next formation', () => {
  // After the shield relay (14 s) only the 21 s lane sweep flies until the 22 s curtain.
  const game = new Game(); start(game);
  game.stage = 3;
  game.player.invuln = 100;
  step(game, 900);
  assert.equal(game._beatIndex, 4, 'four beats should have begun by 15 seconds');
  step(game, 410);
  assert.equal(game._beatIndex, 4, 'the field should have a gap through 21.8 seconds');
  assert.equal(game._laneIndex, 1, 'the breather holds the sector\'s first lane sweep');
  step(game, 18);
  assert.equal(game._beatIndex, 5, 'the next formation should start at 22 seconds');
});

test('boss phase transitions clear old fire and announce a new pattern before shooting', () => {
  const game = new Game(); start(game);
  game.stage = 2;
  game._spawnBoss();
  const boss = game.boss;
  boss.age = 12;  // Aurelia's phase two unlocks at learn age 12 (Act I retune)
  boss.hp = boss.maxHp * .6;
  game.bullets.push({x: 40, y: 500, vx: 0, vy: 0, r: 5, kind: 'red', grazed: false});
  game.update(1/60, {});
  assert.equal(boss.phase, 2);
  assert.equal(game.bullets.length, 0);
  assert.ok(boss.fireAt - boss.age > 1.1, 'the new phase must have a readable windup');
  assert.ok(game.events.some(event => event.type === 'bossPhase' && event.value === 2));
});

test('authored lane sweep visibly opens one corridor, then moves it a reachable distance', () => {
  const game = new Game(); start(game);
  game._spawnLaneSweep(150);
  const first = game.bullets.filter(b => b.y === -40);
  const second = game.bullets.filter(b => b.y === -165);
  assert.ok(first.length >= 12 && second.length >= 12, 'two rows should announce the sweep');
  assert.ok(first.every(b => Math.abs(b.x - 150) > 68));
  assert.ok(second.every(b => Math.abs(b.x - 240) > 68));
  assert.ok(first.some(b => Math.abs(b.x - 270) < 15), 'holding the centre is pressured');
  assert.ok((230 - first[0].y) / first[0].vy > 1.5, 'even the highest legal player position gets reaction time');
});

test('a bottom-lane pilot can dodge the staggered sweep, while holding centre takes a hit', () => {
  const idle = new Game(); start(idle);
  idle._beatIndex = 99; idle._laneIndex = 99;
  idle._spawnLaneSweep(150);
  step(idle, 340);
  assert.ok(idle.player.hp < 4, 'stationary centre should not be a permanent safe lane');

  const moving = new Game(); start(moving);
  moving._beatIndex = 99; moving._laneIndex = 99;
  moving.player.x = 150;
  moving._spawnLaneSweep(150);
  step(moving, 340);
  step(moving, 15, { right: true });
  step(moving, 60);
  assert.equal(moving.player.hp, 4, 'crossing to the announced second gap should remain survivable');
});

test('boss armor cue holds each phase long enough, then releases damage at the unlock', () => {
  const game = new Game(); start(game);
  game._spawnBoss();
  const boss = game.boss;
  boss.age = 5;
  boss.hp = boss.maxHp * .66 + 20;
  game._damageEnemy(boss, 400);
  assert.equal(boss.guard, true);
  assert.equal(boss.guardUntil, 10);
  assert.ok(boss.hp > 0 && boss.phase === 1);
  assert.ok(game.events.some(e => e.type === 'bossGuard'));
  game._damageEnemy(boss, 50);
  assert.equal(game.events.filter(e => e.type === 'bossGuard').length, 1, 'one cue per guarded phase');
  game.events = [];

  boss.age = 10;
  game.update(1/60, {});
  assert.equal(boss.phase, 2);
  assert.equal(boss.guard, false);
  assert.ok(game.events.some(e => e.type === 'bossGuardEnd'));
  assert.ok(game.events.some(e => e.type === 'bossPhase' && e.value === 2));
  const phase2Hp = boss.hp;
  game._damageEnemy(boss, 20);
  assert.ok(boss.hp < phase2Hp, 'damage resumes in phase two');

  boss.age = 12;
  boss.hp = boss.maxHp / 3 + 20;
  game._damageEnemy(boss, 400);
  // A sliver of learn age was bought by the soaked phase-one damage.
  assert.ok(boss.guardUntil <= 18 && boss.guardUntil > 17.9);
  boss.age = 18;
  game.update(1/60, {});
  assert.equal(boss.phase, 3);
  assert.equal(boss.guard, false);
  assert.ok(game.events.some(e => e.type === 'bossGuardEnd'));
  const phase3Hp = boss.hp;
  game._damageEnemy(boss, 20);
  assert.ok(boss.hp < phase3Hp, 'damage resumes in phase three');

  boss.age = 20;
  boss.hp = 20;
  game._damageEnemy(boss, 100);
  assert.equal(boss.hp, 1);
  assert.ok(boss.guardUntil <= 22 && boss.guardUntil > 21.9);
  boss.age = 22;
  game.update(1/60, {});
  assert.equal(boss.guard, false);
  assert.ok(game.events.some(e => e.type === 'bossGuardEnd'));
  game._damageEnemy(boss, 100);
  assert.ok(boss.hp <= 0, 'damage must resume after the final armor cycle');
});

test('bomb damage obeys the boss armor cycle while still clearing fire', () => {
  const game = new Game(); start(game);
  game._spawnBoss();
  const boss = game.boss;
  boss.age = 6;
  boss.hp = boss.maxHp * .66 + 10;
  game.bullets.push({ x: 270, y: 650, vx: 0, vy: 60, r: 5, kind: 'red' });
  game._bomb();
  assert.equal(game.bullets.length, 0);
  assert.equal(boss.guard, true);
  assert.ok(boss.hp > 0);
});

test('capped score resources and early relays no longer generate surplus bombs', () => {
  const game = new Game(); start(game);
  game._awardScore(50000);
  assert.equal(game.player.lives, 4);
  game.player.bombs = 2;
  game._awardScore(110000);
  assert.equal(game.player.bombs, 2, 'a full rack should not snowball reserve bombs');
  assert.ok(game.score > 160000, 'a capped milestone may still give points');

  // Act I bombs are authored: only each later sector's closing relay carries
  // one, and a relay carrier carries nothing the beat does not author.
  game.stage = 2; game.stageTime = 41;
  game._spawnWave('relay');
  assert.equal(game.enemies.find(e => e.type === 'carrier').drop, null);
  game.enemies.length = 0;
  game._spawnWave('relay', { heavy: ['bomb'] });
  assert.equal(game.enemies.find(e => e.type === 'carrier').drop, 'bomb');
  const bombs = stage => STAGE_BEATS[stage].filter(([, , drops]) => [].concat(drops?.heavy || [], drops?.lead || []).includes('bomb'));
  assert.equal(bombs(1).length, 0, 'sector 1 sorties carry their starting bombs only');
  for (const stage of [2, 3]) {
    assert.equal(bombs(stage).length, 1, 'one authored bomb in sector ' + stage);
    assert.ok(bombs(stage)[0][0] >= STAGE_BEATS[stage].at(-1)[0] - 9, 'in the closing beats');
  }
  // Sector 2's rides the closing relay's carrier; sector 3's rides the closing
  // flank's lead, which dies before the Crown arrives (a relay carrier spawned
  // at 79 s never could).
  assert.deepEqual(bombs(2)[0][2], { heavy: ['bomb'] });
  assert.equal(bombs(3)[0][1], 'flank');
  assert.equal(bombs(3)[0][2].lead, 'bomb');
});

test('Vesper final phase alternates its counter-tide at a half-second cadence', () => {
  const game = new Game(); start(game);
  game._spawnBoss();
  const boss = game.boss;
  boss.phase = 3;
  boss.age = 20;
  boss.fireAt = 20;
  game.threat = .15;  // about Vesper's arrival-ledger rank
  game._updateEnemies(1/120);
  // Act I retune: Vesper teaches, 0.6 s base cadence x 1.5/(1+0.6t) (round 2).
  assert.ok(boss.fireAt - boss.age > .8 && boss.fireAt - boss.age < .85,
    'the first boss gives a long beat between final-phase waves: ' + (boss.fireAt - boss.age).toFixed(3));

  const volley = () => {
    const before = game.bullets.length;
    game._bossFire(boss);
    return game.bullets.slice(before);
  };
  const first = volley(), second = volley(), third = volley();
  assert.equal(first.filter(b => b.kind === 'amber').length, 18,
    'the second wave carries an amber counter-tide');
  assert.equal(second.filter(b => b.kind === 'amber').length, 0,
    'the counter-tide should leave an escape interval');
  assert.equal(third.filter(b => b.kind === 'amber').length, 18);
  assert.ok([first, second, third].every(wave => wave.filter(b => b.kind === 'magenta').length === 18),
    'the final-phase magenta fan remains persistent');
});
test('boss lateral sweep keeps its hull inside the portrait playfield', () => {
  for (const stage of [1, 2, 3]) {
    const game = new Game(); start(game);
    game.stage = stage;
    game._spawnBoss();
    const boss = game.boss;
    boss.fireAt = Infinity;
    let left = Infinity, right = -Infinity;
    for (let age = 3; age < 30; age += .08) {
      boss.age = age;
      game._updateEnemies(0);
      left = Math.min(left, boss.x);
      right = Math.max(right, boss.x);
      assert.ok(boss.x >= 180 && boss.x <= 360,
        'the visible hull needs a margin on both sides');
    }
    assert.ok(right - left >= 145, 'boss should still sweep across the field');
  }
});

test('Aurelia final phase alternates wing spirals without a pressure spike', () => {
  const game = new Game(); start(game);
  game.stage = 2;
  game._spawnBoss();
  const boss = game.boss;
  boss.phase = 3;
  boss.age = 20;
  boss.fireAt = 20;
  game.threat = .4;  // about Aurelia's arrival-ledger rank
  game._updateEnemies(1/120);
  assert.ok(boss.fireAt - boss.age > .59 && boss.fireAt - boss.age < .62,
    'Aurelia phase three should leave a 0.6 s dodge interval: ' + (boss.fireAt - boss.age).toFixed(3));
  const volley = () => {
    const before = game.bullets.length;
    game._bossFire(boss);
    return game.bullets.slice(before);
  };
  const first = volley(), second = volley(), third = volley();
  assert.deepEqual([first, second, third].map(wave => wave.filter(b => b.kind === 'cyan').length),
    [24, 0, 24], 'mirrored wing spirals need alternating escape intervals');
  assert.ok([first, second, third].every(wave => wave.filter(b => b.kind === 'amber').length === 21),
    'the central final-phase fan remains persistent');
});

test('a three-sector clear keeps growing power through collected flagship spoils, past five with no cap', () => {
  const game = new Game(); start(game);
  game.player.invuln = 999;
  // Fixture: resolve each boss after its combat phase to isolate campaign rewards.
  for (const stage of [1, 2, 3]) {
    game.stage = stage;
    game._spawnBoss();
    game._beatIndex = 99; game._laneIndex = 99;
    game.boss.y = 285;
    game._killEnemy(game.boss);
    if (stage < 3) {
      step(game, 230);
      assert.equal(game.stage, stage + 1);
      assert.equal(game.pickups.length, 0, 'the interlude collects every flagship spoil');
    }
  }
  // Sortie power 2, then the authored Act I spoils: Vesper power + shield,
  // Aurelia power + sidewinder.
  assert.equal(game.player.level, 4);
  assert.equal(game.player.power, game.player.level);
  assert.equal(game.player.shield, 1);
  assert.equal(game.player.sidewinder, 1);
  assert.equal(game.stats.powerPeak, 4);
  game.player.x = game.pickups[0].x; game.player.y = game.pickups[0].y;
  for (const item of [...game.pickups]) { item.x = game.player.x; item.y = game.player.y; }
  game._collide();
  assert.equal(game.player.level, 8, 'the Crown spoils carry four power across the Act II gate');
  assert.equal(game.player.sidewinder, 2);
  assert.equal(game.player.signature, 1);
  for (let i = 0; i < 8; i++) game.pickups.push({x: game.player.x, y: game.player.y, r: 16, type: 'power', age: 0, vy: 0});
  game._collide();
  assert.equal(game.player.level, 16, 'no sector or final-boss cap holds power back');
});

test('score no longer buys power, and pickups raise power without a cap', () => {
  const game = new Game(); start(game);
  game._awardScore(50000);
  assert.equal(game.player.level, 2, 'score extends stay, power milestones are gone (sorties start at 2)');
  const p = game.player;
  for (let i = 0; i < 14; i++) { game.pickups.push({x: p.x, y: p.y, r: 16, type: 'power', age: 0, vy: 0}); }
  game._collide();
  assert.equal(p.level, 16);
  assert.equal(p.power, 16);
  assert.deepEqual(game.events.filter(e => e.type === 'powerUp').map(e => e.value), Array.from({length: 14}, (_, i) => i + 3));
  game.stage = 3; game._spawnBoss();
  assert.equal(p.level, 16, 'the final boss neither caps nor grants power');
});

test('selection persists into a run and three ships fire distinct primary weapons', () => {
  const modes = [];
  for (const id of ['kestrel', 'manta', 'wraith']) {
    const game = new Game();
    assert.equal(game.selectShip(id), true);
    start(game);
    assert.equal(game.player.shipId, id);
    assert.equal(game.player.weaponType, game.selectedShip.weapon);
    game.player.level = game.player.power = 5;
    game._fire();
    modes.push(game.shots.map(shot => shot.kind));
    if (id === 'manta') {
      assert.ok(game.shots.some(shot => shot.kind === 'missile'));
      assert.equal(game.player.shield, 1);
    }
    if (id === 'wraith') {
      assert.ok(game.shots.some(shot => shot.kind === 'pierce'));
      assert.equal(game.shots.filter(shot => shot.kind === 'drone').length, 0, 'drones are deprecated');
      assert.equal(game.player.drones, 0);
    }
  }
  assert.notDeepEqual(modes[0], modes[1]);
  assert.notDeepEqual(modes[1], modes[2]);
});

test('all aircraft remain fully inside the playfield at both horizontal edges', () => {
  const margins = {kestrel:46,manta:52,wraith:62};
  for (const id of ['kestrel','manta','wraith']) {
    const game = new Game(); game.selectShip(id); start(game);
    step(game, 90, {right:true});
    assert.equal(game.player.x, 540-margins[id]);
    step(game, 180, {left:true});
    assert.equal(game.player.x, margins[id]);
    step(game, 30, {pointerActive:true,pointerX:540,pointerY:750});
    assert.ok(game.player.x<=540-margins[id]);
  }
});

test('missiles home toward targets and escort rails and piercing shots damage enemies', () => {
  const manta = new Game(); manta.selectShip('manta'); start(manta);
  manta._enemy('bomber', 390, 470, {fireAt: 99, vy: 0});
  manta._fire();
  const missile = manta.shots.find(shot => shot.kind === 'missile');
  manta._updateShots(.1);
  assert.ok(missile.vx > 0, 'missile should steer toward an offset target');

  const wraith = new Game(); wraith.selectShip('wraith'); start(wraith);
  wraith.player.level = wraith.player.power = 4;
  wraith._addEscorts(1);
  wraith._fire();
  assert.equal(wraith.shots.filter(shot => shot.kind === 'escort' && shot.style === 'rail').length, 2);
  wraith.shots = wraith.shots.filter(shot => shot.kind === 'pierce');
  const target = wraith._enemy('bomber', 270, 500, {fireAt: 99, vy: 0});
  const pierce = wraith.shots.find(shot => shot.kind === 'pierce');
  pierce.x = target.x; pierce.y = target.y;
  wraith._collide();
  assert.ok(target.hp < target.maxHp);
  assert.equal(pierce.dead, undefined, 'piercing shot survives its first hit');
  assert.equal(wraith.stats.shotsHit, 1);
});

test('Manta shield absorbs damage and specials have distinct effects', () => {
  const manta = new Game(); manta.selectShip('manta'); start(manta);
  manta.player.shield = 1; manta.player.hp = 2;
  manta._hurtPlayer(manta.player.x, manta.player.y);
  assert.equal(manta.player.hp, 2);
  assert.equal(manta.player.shield, 0);
  assert.ok(manta.events.some(e => e.type === 'shieldBreak'));
  manta.player.invuln = 0; manta._bomb();
  assert.equal(manta.player.shield, 1);
  assert.equal(manta.stats.hitsTaken, 1);
  assert.ok(manta.events.some(e => e.type === 'special' && e.value === 'barrier'));

  const wraith = new Game(); wraith.selectShip('wraith'); start(wraith);
  wraith.bullets.push(...Array.from({length: 5}, () => ({
    x: 100, y: 400, vx: 0, vy: 0, r: 5, kind: 'red'
  })));
  const before = wraith.score;
  wraith._bomb();
  assert.ok(wraith.score > before);
  assert.equal(wraith.stats.conversions, 5);
  assert.ok(wraith.events.some(e => e.type === 'special' && e.value === 'storm'));
});

test('an uncharged roll also strikes once without consuming bullets', () => {
  const game = new Game(); start(game);
  const p=game.player;
  const target=game._enemy('bomber',p.x,p.y-20,{vy:0,fireAt:99});
  const bullet={x:p.x+8,y:p.y-12,vx:0,vy:0,r:5,kind:'amber',grazed:false};
  game.bullets.push(bullet);
  game.update(1/60,{roll:true});
  const after=target.hp;
  assert.ok(after<target.maxHp);
  assert.ok(game.events.some(e=>e.type==='rollStrike'&&e.charged===false));
  assert.equal(bullet.dead,undefined,'ordinary roll does not convert shots');
  step(game,8,{});
  assert.equal(target.hp,after,'one enemy is struck only once by each roll');
});

test('charged roll strikes an enemy once and reports conversion rewards', () => {
  const game = new Game(); start(game);
  const p = game.player; p.wake = .5;
  const target = game._enemy('bomber', p.x, p.y - 25, {vy: 0, fireAt: 99});
  game.bullets.push({x:p.x+10,y:p.y-15,vx:0,vy:0,r:5,kind:'amber',grazed:false});
  game.update(1/60, {roll:true});
  const struckHp = target.hp;
  assert.ok(struckHp < target.maxHp);
  assert.ok(game.events.some(e => e.type === 'rollStrike'));
  const converted = game.events.find(e => e.type === 'wakeConvert');
  assert.ok(converted && converted.points > 0 && converted.resource >= 0);
  step(game, 8, {});
  assert.equal(target.hp, struckHp, 'each roll damages a given enemy once');
});

test('a costly campaign victory still earns a meaningful completion grade', () => {
  const game=new Game(); start(game);
  game.stage=CAMPAIGN_STAGES;game.score=841597;
  game.player.lives=2;
  Object.assign(game.stats,{kills:100,grazes:335,shotsFired:1000,shotsHit:500,hitsTaken:33,livesLost:4,bossesDefeated:3});
  game._advanceStage();
  assert.equal(game.mode,'victory');
  assert.ok(['S','A','B','C'].includes(game.summary.grade),'campaign completion should not be graded D solely for shield impacts');
});

test('victory and defeat expose performance summaries and grades', () => {
  const win = new Game(); start(win);
  win.stage = CAMPAIGN_STAGES; win.score = 80000; win.stats.kills = 20;
  win.stats.shotsFired = 100; win.stats.shotsHit = 65;
  win._advanceStage();
  assert.equal(win.mode, 'victory');
  assert.equal(win.summary.outcome, 'victory');
  assert.equal(win.summary.accuracy, .65);
  assert.match(win.summary.grade, /^[SABCD]$/);
  assert.ok(win.events.some(e => e.type === 'summary' && e.summary === win.summary));

  const loss = new Game(); start(loss);
  loss.player.hp = 1; loss.player.lives = 1;
  loss._hurtPlayer(loss.player.x, loss.player.y);
  assert.equal(loss.mode, 'gameover');
  assert.equal(loss.summary.outcome, 'defeat');
  assert.equal(loss.summary.livesLost, 1);
  assert.equal(loss.summary.hitsTaken, 1);
});


test('cleanup compacts entity arrays in place while preserving survivor order', () => {
  const game = new Game();
  const enemyA = {id:'enemy-a',dead:false,x:20,y:80};
  const enemyB = {id:'enemy-b',dead:false,x:670,y:80};
  const bulletA = {id:'bullet-a',dead:false,x:50,y:60};
  const bulletB = {id:'bullet-b',dead:false,x:100,y:960};
  const shotA = {id:'shot-a',dead:false,x:20,y:20};
  const shotB = {id:'shot-b',dead:false,x:20,y:-50};
  const pickupA = {id:'pickup-a',dead:false,y:900};
  const pickupB = {id:'pickup-b',dead:false,y:950};
  const particleA = {id:'particle-a',life:0.1};
  const particleB = {id:'particle-b',life:0};
  game.enemies = [enemyA,{id:'dead-enemy',dead:true,x:20,y:80},enemyB];
  game.bullets = [bulletA,{id:'dead-bullet',dead:true,x:50,y:60},bulletB];
  game.shots = [shotA,{id:'offscreen-shot',dead:false,x:20,y:-50},shotB];
  game.pickups = [pickupA,{id:'dead-pickup',dead:true,y:10},pickupB];
  game.particles = [particleA,particleB];
  const arrays = [game.enemies,game.bullets,game.shots,game.pickups,game.particles];

  game._cleanup();

  assert.strictEqual(game.enemies,arrays[0]);
  assert.strictEqual(game.bullets,arrays[1]);
  assert.strictEqual(game.shots,arrays[2]);
  assert.strictEqual(game.pickups,arrays[3]);
  assert.strictEqual(game.particles,arrays[4]);
  assert.deepEqual(game.enemies,[enemyA]);
  assert.deepEqual(game.bullets,[bulletA]);
  assert.deepEqual(game.shots,[shotA]);
  assert.deepEqual(game.pickups,[pickupA]);
  assert.deepEqual(game.particles,[particleA]);

  game._cleanup();
  assert.deepEqual([game.enemies,game.bullets,game.shots,game.pickups,game.particles],arrays);
});

test('missile reacquisition handles missing, dead, and equidistant targets stably', () => {
  const game = new Game();
  game._rand = () => 1;
  const missile = {kind:'missile',x:250,y:300,vx:0,vy:0,age:0,targetId:null};
  game.shots.push(missile);
  game.enemies.push({id:'dead',dead:true,x:250,y:300});
  game.enemies.push({id:'too-high',dead:false,x:250,y:-50});
  game._updateShots(0.01);
  assert.equal(missile.targetId,null,'invalid candidates leave the missile without a target');

  const first = game._enemy('bomber',280,300,{fireAt:99,vy:0});
  const second = game._enemy('bomber',350,300,{fireAt:99,vy:0});
  game._updateShots(0.01);
  assert.equal(missile.targetId,first.id,'nearest valid enemy is acquired');
  first.dead = true;
  game._updateShots(0.01);
  assert.equal(missile.targetId,second.id,'a dead target is reacquired');

  const tied = new Game();
  tied._rand = () => 1;
  const tiedMissile = {kind:'missile',x:270,y:400,vx:0,vy:0,age:0,targetId:null};
  tied.shots.push(tiedMissile);
  const earlier = tied._enemy('bomber',250,400,{fireAt:99,vy:0});
  tied._enemy('bomber',290,400,{fireAt:99,vy:0});
  tied._updateShots(0.01);
  assert.equal(tiedMissile.targetId,earlier.id,'equal distances keep enemy array order');
});

test('lane warning cannot overlap any legal player position in its spawn tick',()=>{
 for(const y of [230,255,400,750,820]){
  const game=new Game();start(game);game.player.x=388;game.player.y=y;
  game._spawnLaneSweep(150);game._collide();assert.equal(game.player.hp,4);
  assert.ok(game.bullets.every(b=>b.y<0));
 }
});
test('a pointer roll follows drag direction and retains the last moving heading',()=>{
 const game=new Game();start(game);const p=game.player;
 game._roll({pointerActive:true,pointerX:p.x+120,pointerY:p.y});assert.equal(p.rollX,1);assert.equal(p.rollY,0);
 p.roll=0;p.rollCooldown=0;p.headingX=-2;p.headingY=0;
 game._roll({pointerActive:true,pointerX:p.x,pointerY:p.y});assert.equal(p.rollX,-1);
});
test('defeat freezes scoring, grazing and pickup rewards in the terminal collision pass',()=>{
 const game=new Game();start(game);const p=game.player;p.hp=1;p.lives=1;
 game.bullets.push({x:p.x,y:p.y,vx:0,vy:0,r:5,kind:'red',grazed:false},{x:p.x+22,y:p.y,vx:0,vy:0,r:5,kind:'red',grazed:false});
 game.pickups.push({x:p.x,y:p.y,r:16,type:'shield'});game._collide();
 assert.equal(game.mode,'gameover');assert.equal(game.score,game.summary.score);assert.equal(game.stats.grazes,0);assert.equal(game.stats.pickups,0);assert.equal(p.hp,0);
});

test('lane effects receive the exact bullet origins and speed for synchronized markers',()=>{
 const game=new Game();start(game);game._spawnLaneSweep(150);
 const event=game.events.find(e=>e.type==='lane');assert.equal(event.speed,149);
 assert.deepEqual(event.rows,[{x:150,y:-40},{x:240,y:-165}]);
 for(const row of event.rows)assert.ok(game.bullets.some(b=>b.y===row.y&&b.vy===event.speed));
});
test('victory finalizes before a leftover pickup can change the result',()=>{
 const game=new Game();start(game);game.stage=CAMPAIGN_STAGES;game._transition=.001;
 const p=game.player;p.hp=2;game.pickups.push({x:p.x,y:p.y,r:16,type:'shield',age:0,vy:0});
 game.update(1/60,{});assert.equal(game.mode,'victory');assert.equal(game.stats.pickups,0);assert.equal(p.hp,2);assert.equal(game.summary.score,game.score);
});
