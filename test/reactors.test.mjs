import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/game.js';

// Drill kits carry the ledger's shields; hull-hit checks fly without them.
function arena(stage=2,phase=2){
  const g=new Game();g.startDrill(stage);g.player.shield=0;g.boss.phase=phase;g.boss.age=phase===1?3:phase===2?11:19;
  g.boss.hp=g.boss.maxHp*(phase===1?.9:phase===2?.5:.25);g.boss.fireAt=999;g._updateEnemies(0);g.events=[];
  return g;
}
function shotAt(g,x,y,damage=8,kind='shot'){
  const shot={x,y,r:3,damage,kind,age:0,vx:0,vy:0,pierceRemaining:3,hitIds:[]};g.shots=[shot];g._collide();return shot;
}
test('Aurelia alone exposes a separate side reactor after a visible opening delay',()=>{
  for(const stage of [1,3])assert.equal(arena(stage).boss.reactor,undefined);
  assert.equal(arena(2,1).boss.reactor,undefined);
  const g=arena(),b=g.boss,r=b.reactor;
  assert.equal(r.side,-1);assert.ok(r.x<b.x-100);assert.ok(r.opensAt>b.age);
  shotAt(g,r.x,r.y);assert.equal(r.hp,r.maxHp,'warning state cannot be damaged');
  b.age=r.opensAt;const hull=b.hp;shotAt(g,r.x,r.y);
  assert.equal(r.hp,r.maxHp-8);assert.equal(b.hp,hull,'reactor shots do not count as central hull damage');
  shotAt(g,b.x,b.y);assert.equal(b.hp,hull-8,'the central hull remains a valid target');
});
test('reactor destruction rewards once and opens local projectile cover without changing campaign records in drills',()=>{
  const g=arena(),b=g.boss,r=b.reactor;b.age=r.opensAt;g.best=50000;g.player.wake=.4;
  const wake=g.player.wake,lives=g.player.lives;
  g.bullets=[{x:r.x,y:750,r:5},{x:r.x+80,y:750,r:5},{x:r.x,y:r.y-60,r:5}];
  const shot=shotAt(g,r.x,r.y,999);
  assert.equal(shot.dead,true);assert.equal(r.broken,true);assert.equal(g.stats.reactorsBroken,1);
  assert.equal(g.score,1000);assert.equal(g.player.wake,wake+.2);assert.equal(g.best,50000);assert.equal(g.player.lives,lives);
  assert.equal(g.bullets[0].dead,true);assert.equal(g.bullets[1].dead,undefined);assert.equal(g.bullets[2].dead,undefined);
  g._breakReactor(b);assert.equal(g.score,1000);assert.equal(g.stats.reactorsBroken,1);
  assert.equal(g.events.filter(e=>e.type==='reactorBreak').length,1);
  assert.equal(g.events.filter(e=>e.type==='wakeReady').length,1);
  b.phase=3;g._updateEnemies(0);assert.equal(b.reactor.side,1);assert.equal(b.reactor.broken,undefined);
});
test('cover clears newly arriving fire for its fixed duration, freezes while paused, and restores normal collision afterwards',()=>{
  const g=arena(),b=g.boss,r=b.reactor;b.age=r.opensAt;shotAt(g,r.x,r.y,999);
  const p=g.player;p.x=b.cover.x;p.y=750;p.invuln=0;
  g.bullets=[{x:p.x,y:p.y,r:5}];g._applyReactorCover();g._collide();assert.equal(p.hp,4);
  const age=b.age;g.mode='paused';g.update(.1,{});assert.equal(b.age,age);g.mode='playing';
  b.age=b.cover.until;g.bullets=[{x:p.x,y:p.y,r:5}];g._applyReactorCover();g._collide();assert.equal(p.hp,3);
});
test('piercing fire strikes a reactor once per projectile, and specials cannot buy the side objective',()=>{
  const g=arena(),b=g.boss,r=b.reactor;b.age=r.opensAt;
  const shot=shotAt(g,r.x,r.y,13,'pierce');g._collide();
  assert.equal(r.hp,r.maxHp-13);assert.equal(shot.pierceRemaining,2);assert.ok(shot.hitIds.includes(r.id));
  const hp=r.hp;g._bomb();assert.equal(r.hp,hp);assert.equal(g.stats.reactorsBroken,0);
});
test('a centered firing plan leaves the optional reactors intact for every airframe',()=>{
  for(const ship of ['kestrel','manta','wraith'])for(const focus of [false,true]){
    // Bare main gun at the old drill power: flank-covering arsenal pieces
    // (escorts, Kestrel flak) can legitimately reach the side reactors.
    const g=new Game();g.selectShip(ship);g.startDrill(2);const phases=new Set();
    // The pilot never dodges, so spare lives keep it flying to the end: this
    // pins the firing line, not survival against the final phase.
    Object.assign(g.player,{level:4,power:4,escorts:0,sidewinder:0,signature:0,lives:9});g._syncEscortSlots();g._syncOrbitals();
    for(let frame=0;frame<60*75&&g.mode==='playing';frame++){
      g.update(1/60,{fire:true,focus});if(g.boss)phases.add(g.boss.phase);
    }
    assert.equal(g.mode,'victory',ship+' retains the ordinary main-hull route');
    assert.deepEqual([...phases],[1,2,3]);
    assert.equal(g.stats.reactorsBroken,0,ship+' must choose a lateral firing line to collect cover');
  }
});
test('the final reactor disables its wing spiral after cover expires while the remaining weapons keep firing',()=>{
  const intact=arena(2,3),broken=arena(2,3);
  broken.boss.age=broken.boss.reactor.opensAt;broken._breakReactor(broken.boss);
  intact.boss.age=broken.boss.age=broken.boss.cover.until+1;
  for(const g of [intact,broken]){g.boss.salvo=1;g.bullets=[];g._bossFire(g.boss);}
  assert.equal(intact.bullets.length,50);assert.equal(broken.bullets.length,38);
  const right=intact.boss.x+58,left=intact.boss.x-58,wingY=intact.boss.y+24;
  assert.equal(broken.bullets.filter(b=>b.x===right&&b.y===wingY).length,0,'destroyed cannon no longer emits its spiral');
  assert.equal(broken.bullets.filter(b=>b.x===left&&b.y===wingY).length,12,'opposite spiral remains');
  for(const g of [intact,broken]){g.bullets=[];g._bossFire(g.boss);}
  assert.equal(broken.bullets.length,intact.bullets.length,'central fan cadence remains unchanged');
  const phaseTwo=arena();phaseTwo.boss.reactor.broken=true;phaseTwo.boss.salvo=1;phaseTwo.bullets=[];phaseTwo._bossFire(phaseTwo.boss);
  assert.equal(phaseTwo.bullets.length,37,'phase-two cover does not disable weapons');
});
