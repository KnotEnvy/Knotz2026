import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/game.js';
function arena(stage=3,phase=2,ship='kestrel'){
 const g=new Game();g.selectShip(ship);g.startDrill(stage);const b=g.boss;
 b.phase=phase;b.age=phase===1?3:phase===2?11:24;b.hp=b.maxHp*(phase===1?.9:phase===2?.5:.25);b.fireAt=999;
 g._updateEnemies(0);g.events=[];g.player.invuln=0;return g;
}
test('Crown alone introduces a tracking, locked, then firing lane with a safe warning',()=>{
 for(const stage of [1,2])assert.equal(arena(stage).boss.lance,undefined);
 assert.equal(arena(3,1).boss.lance,undefined);
 const g=arena(),b=g.boss,l=b.lance;
 g.player.x=150;b.age=l.startsAt+.2;g._updateBossLance(b);assert.equal(l.x,150);assert.equal(l.active,false);
 b.age=l.locksAt;g._updateBossLance(b);g.player.x=400;b.age+=.4;g._updateBossLance(b);
 assert.equal(l.x,150,'aim freezes at lock');assert.equal(l.active,false);assert.ok(l.firesAt-l.locksAt>=.84);
 b.age=l.firesAt;g._updateBossLance(b);assert.equal(l.active,true);g._updateBossLance(b);
 assert.equal(g.events.filter(e=>e.type==='lanceLock').length,1);assert.equal(g.events.filter(e=>e.type==='lanceFire').length,1);
 b.age=l.endsAt;g._updateBossLance(b);assert.equal(l.active,false);
 b.age=l.nextAt;g._updateBossLance(b);assert.notEqual(b.lance,l);assert.equal(b.lance.active,false);assert.equal(b.lance.x,400);
});
test('lance collision is local to the firing lane and honors protection and expiry',()=>{
 const g=arena(),b=g.boss,l=b.lance,p=g.player;
 p.x=l.x;p.y=750;b.age=l.firesAt-.01;g._updateBossLance(b);g._collide();assert.equal(p.hp,4);
 b.age=l.firesAt;g._updateBossLance(b);p.x=l.x+l.width/2+p.r;g._collide();assert.equal(p.hp,4,'outside edge remains safe');
 p.x=l.x;p.y=l.y-p.r;g._collide();assert.equal(p.hp,4,'space above the vertical lance remains safe');
 p.y=750;p.invuln=.2;g._collide();assert.equal(p.hp,4);p.invuln=0;g._collide();assert.equal(p.hp,3);
 g._collide();assert.equal(p.hp,3,'contact does not repeat during ordinary hit protection');
 p.invuln=0;b.age=l.endsAt;g._updateBossLance(b);g._collide();assert.equal(p.hp,3);
});
test('pause freezes the lance and every aircraft special vents only its current charge',()=>{
 for(const ship of ['kestrel','manta','wraith']){
  const g=arena(3,2,ship),b=g.boss,l=b.lance;b.age=l.firesAt;g._updateBossLance(b);
  g.mode='paused';g.update(.1,{});assert.equal(b.age,l.firesAt);assert.equal(l.active,true);g.mode='playing';
  const bombs=g.player.bombs;g._bomb();assert.equal(l.active,false);assert.equal(l.cancelled,true);assert.equal(g.player.bombs,bombs-1);
  g.player.invuln=0;g._updateBossLance(b);g._collide();assert.equal(g.player.hp,4);
  b.age=l.nextAt;g._updateBossLance(b);assert.notEqual(b.lance,l);assert.equal(b.lance.cancelled,undefined);
 }
});
test('a focused lateral escape after lock can clear the lane before it fires',()=>{
 const g=arena(),b=g.boss,l=b.lance;b.age=l.locksAt;g._updateBossLance(b);
 for(let i=0;i<55;i++)g.update(1/60,{right:i<24});
 assert.ok(g.player.x>l.x+l.width/2+g.player.r);assert.equal(g.stats.hitsTaken,0);assert.equal(l.active,true);
});
test('destroying the source before hazard collision prevents a last-frame lance hit',()=>{
 const g=arena(3,3),b=g.boss,l=b.lance;b.age=l.firesAt;g._updateBossLance(b);b.hp=1;
 g.player.x=l.x;g.player.hp=1;g.player.lives=1;
 g.shots=[{x:b.x,y:b.y,r:4,damage:10,kind:'shot'}];g._collide();
 assert.equal(g.boss,null);assert.equal(g.player.hp,1);assert.equal(g.stats.hitsTaken,0);
});
