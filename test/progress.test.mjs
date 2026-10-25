import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,CAMPAIGN_STAGES} from '../src/game.js';
import {readProgress,saveProgress,markEncounter,recordFlight,flightAdvice,readDrillRecords,recordDrill,flightTime,drillClearTier} from '../src/progress.js';

test('flagship drills use sector weapons, end after one boss and preserve campaign high score',()=>{
  for(const stage of [1,2,3]){
    const g=new Game();g.selectShip('manta');g.best=23000;g.startDrill(stage);
    assert.equal(g.mode,'playing');assert.equal(g.practiceStage,stage);assert.ok(g.boss);
    assert.equal(g.player.level,[0,6,8,10][stage]);assert.equal(g.player.power,g.player.level);
    assert.equal(g.player.escorts,[0,2,4,4][stage]);assert.equal(g.player.sidewinder,[0,1,1,2][stage]);
    assert.equal(g.player.signature,[0,0,1,2][stage]);assert.equal(g.player.shield,2);
    const lives=g.player.lives;g._awardScore(999999);
    assert.equal(g.best,23000);assert.equal(g.player.lives,lives,'practice does not farm score extends');
    g._killEnemy(g.boss);g._advanceStage();
    assert.equal(g.mode,'victory');assert.equal(g.stage,stage);assert.equal(g.summary.practiceStage,stage);
    assert.equal(g.stats.bossesDefeated,1);assert.equal(g.best,23000);
    g._start();assert.equal(g.practiceStage,0);assert.equal(g.player.level,2,'sorties start at power 2');
    g._awardScore(30000);assert.equal(g.best,30000,'campaign scoring works after leaving a drill');
  }
});
test('defeated drill cannot promote a practice score into the campaign record',()=>{
  const g=new Game();g.best=4000;g.startDrill(2);g._awardScore(80000);
  g.player.hp=1;g.player.lives=1;g.player.invuln=0;g._hurtPlayer(270,750);
  assert.equal(g.mode,'gameover');assert.equal(g.summary.practiceStage,2);assert.equal(g.best,4000);
});
test('career records are per-airframe, monotonic, persisted and ignore unranked drills',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const progress=readProgress(storage);assert.equal(progress.bossSeen,1);
  assert.ok(markEncounter(progress,2));assert.equal(markEncounter(progress,1),false);
  const flight={shipId:'wraith',outcome:'defeat',score:50000,bossesDefeated:1,grazes:12,conversions:30};
  assert.equal(recordFlight(progress,{...flight,practiceStage:2}),null);
  const result=recordFlight(progress,flight);assert.equal(result.newBest,true);
  recordFlight(progress,{...flight,score:100,bossesDefeated:0,grazes:3,conversions:1});
  assert.equal(progress.ships.wraith.bestScore,50000);assert.equal(progress.ships.wraith.sorties,2);
  assert.equal(progress.ships.manta.sorties,0);saveProgress(progress,storage);
  assert.deepEqual(readProgress(storage),progress);
  assert.match(flightAdvice({...flight,bombsRemaining:1,hitsTaken:1}),/special in reserve/);
});
test('career handles corrupt and denied storage without blocking a flight',()=>{
  for(const value of ['{broken','null','{"bossSeen":99,"ships":{"manta":{"bestScore":-1,"bestClears":99}}}']){
    const progress=readProgress({getItem:()=>value});assert.ok(progress.bossSeen>=1&&progress.bossSeen<=CAMPAIGN_STAGES);
    assert.ok(progress.ships.manta.bestScore>=0);assert.ok(progress.ships.manta.bestClears<=CAMPAIGN_STAGES);
  }
  const denied={getItem:()=>{throw Error('denied')},setItem:()=>{throw Error('denied')}};
  assert.equal(readProgress(denied).bossSeen,1);assert.doesNotThrow(()=>saveProgress(readProgress(denied),denied));
});
test('interleaved tabs retain unlocks and bests while counting each new flight once',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const first=readProgress(storage),second=readProgress(storage);
  markEncounter(first,3);recordFlight(first,{shipId:'kestrel',outcome:'victory',score:90000,bossesDefeated:3});
  assert.equal(saveProgress(first,storage),true);
  recordFlight(second,{shipId:'kestrel',outcome:'defeat',score:20000});saveProgress(second,storage);
  assert.equal(second.bossSeen,3);assert.equal(second.ships.kestrel.bestScore,90000);
  assert.equal(second.ships.kestrel.sorties,2);assert.equal(second.ships.kestrel.wins,1);
  saveProgress(first,storage);saveProgress(second,storage);
  assert.equal(readProgress(storage).ships.kestrel.sorties,2,'saving unchanged tabs must not count their old flights again');
  recordFlight(first,{shipId:'manta',outcome:'victory',score:50000});saveProgress(first,storage);
  assert.equal(readProgress(storage).ships.manta.sorties,1);assert.equal(readProgress(storage).ships.kestrel.sorties,2);
});
test('failed career writes retain unsaved flight deltas for a successful retry',()=>{
  const values=new Map();let denied=true;
  const storage={getItem:key=>values.get(key),setItem:(key,value)=>{if(denied)throw Error('denied');values.set(key,value);}};
  const progress=readProgress(storage);recordFlight(progress,{shipId:'manta',score:1000,outcome:'defeat'});
  assert.equal(saveProgress(progress,storage),false);denied=false;saveProgress(progress,storage);saveProgress(progress,storage);
  assert.equal(readProgress(storage).ships.manta.sorties,1);
});
test('drill benchmarks track independent time and hit bests without touching campaign records',()=>{
  const values=new Map([['2026-career','untouched'],['2026-high-score','12345']]);
  const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const records=readDrillRecords(storage),otherTab=readDrillRecords(storage);
  const clear={shipId:'wraith',practiceStage:1,outcome:'victory',time:32.8,hitsTaken:3};
  recordDrill(records,clear,storage);recordDrill(otherTab,{...clear,time:35.1,hitsTaken:1},storage);
  recordDrill(records,{...clear,time:29.6,hitsTaken:4},storage);
  assert.deepEqual(readDrillRecords(storage),{'wraith-1':{bestTime:29.6,fewestHits:1}});
  recordDrill(records,{...clear,practiceStage:2,time:40,hitsTaken:0},storage);
  const before=JSON.stringify(readDrillRecords(storage));
  assert.equal(recordDrill(records,{...clear,outcome:'defeat'},storage),null);
  assert.equal(recordDrill(records,{...clear,practiceStage:0},storage),null);
  assert.equal(recordDrill(records,{...clear,practiceStage:CAMPAIGN_STAGES+1},storage),null);
  assert.equal(recordDrill(records,{...clear,time:NaN},storage),null);
  assert.equal(JSON.stringify(readDrillRecords(storage)),before);
  assert.equal(values.get('2026-career'),'untouched');assert.equal(values.get('2026-high-score'),'12345');
});
test('drill records reject invalid slots and tolerate unavailable persistence',()=>{
  const saved={'kestrel-1':{bestTime:12,fewestHits:1.8},'manta-2':{bestTime:-1,fewestHits:0},'unknown-4':{bestTime:2,fewestHits:0}};
  assert.deepEqual(readDrillRecords({getItem:()=>JSON.stringify(saved)}),{'kestrel-1':{bestTime:12,fewestHits:1}});
  for(const value of ['null','{broken'])assert.deepEqual(readDrillRecords({getItem:()=>value}),{});
  const denied={getItem:()=>{throw Error('denied')},setItem:()=>{throw Error('denied')}};
  const records={};assert.doesNotThrow(()=>recordDrill(records,{shipId:'manta',practiceStage:3,outcome:'victory',time:12,hitsTaken:0},denied));
  assert.deepEqual(records['manta-3'],{bestTime:12,fewestHits:0});
});
test('flight time rounds across a minute boundary and handles invalid input',()=>{
  assert.equal(flightTime(59.96),'1:00.0');assert.equal(flightTime(65.44),'1:05.4');
  assert.equal(flightTime(0),'0:00.0');assert.equal(flightTime(-4),'0:00.0');assert.equal(flightTime(Infinity),'0:00.0');
});
test('personal-best comparison uses the latest saved best, including remote ties and higher scores',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  for(const [remoteScore,score,newBest] of [[50000,60000,true],[60000,60000,false],[90000,60000,false]]){
    values.clear();const local=readProgress(storage),remote=readProgress(storage);
    recordFlight(remote,{shipId:'kestrel',outcome:'defeat',score:remoteScore},storage);saveProgress(remote,storage);
    const result=recordFlight(local,{shipId:'kestrel',outcome:'defeat',score},storage);saveProgress(local,storage);
    assert.equal(result.previous.bestScore,remoteScore);assert.equal(result.newBest,newBest);
    if(newBest)assert.equal(score-result.previous.bestScore,10000);
    assert.equal(local.ships.kestrel.bestScore,Math.max(remoteScore,score));assert.equal(local.ships.kestrel.sorties,2);
  }
});
test('debrief coaching distinguishes clear quality and offers attainable goals',()=>{
  const clear={practiceStage:1,outcome:'victory',hitsTaken:8,livesLost:2};
  assert.equal(drillClearTier(clear),'survived');assert.match(flightAdvice(clear),/Next target: keep all three lives/);
  assert.equal(drillClearTier({...clear,hitsTaken:2,livesLost:0}),'controlled');assert.match(flightAdvice({...clear,hitsTaken:2,livesLost:0}),/Next target: a no-hit clear/);
  assert.equal(drillClearTier({...clear,hitsTaken:0,livesLost:0}),'flawless');assert.match(flightAdvice({...clear,hitsTaken:0,livesLost:0}),/Beat your time/);
  assert.equal(drillClearTier({...clear,outcome:'defeat'}),null);assert.equal(drillClearTier({...clear,practiceStage:0}),null);
  const advice=flightAdvice({outcome:'defeat',rolls:3,accuracy:.2});assert.match(advice,/Line up below/);assert.doesNotMatch(advice,/Hold FOCUS/);
  for(const hitsTaken of [0,3]){
    const victory=flightAdvice({outcome:'victory',hitsTaken});assert.match(victory,/WAKE conversions/);assert.doesNotMatch(victory,/fewer hits/);
  }
});
