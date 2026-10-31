import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
// Sector 6 (ZERO MERIDIAN) live-browser audio checks, kept apart from qa/audio.mjs:
//  1. the shared audio state carries a finite bar phase that follows the 140 bpm sector-6 score;
//  2. THE SOVEREIGN phase 3 (the ballet) with the sector-6 reference kit and every level at full,
//     30 s of strafing with fire held: the glue stage (the limiter's input) must peak under 0.7,
//     the voice budgets must hold, and the score must report no errors;
//  3. a rotating satellite beam and a phase-2 tether pull are long cues: pause cuts them, resuming
//     restores them, mute cuts them, and they end with their state.
// These are measurements, not listening judgments. QA_AUDIO_RECORD=0 skips the 30 s leg.
const origin=process.env.GAME_URL||'http://127.0.0.1:4173/';
const output=new URL('../artifacts/audio/',import.meta.url);await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});
const page=await browser.newPage();const report={origin,errors:[],warnings:[]};
page.on('pageerror',error=>report.errors.push(error.message));
page.on('console',message=>{if(message.type()==='warning'&&message.text().includes('[audio]'))report.warnings.push(message.text());});
try{
 await page.route('**/src/main.js',async route=>{
  const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nwindow.__qaSound={game,audio};'});
 });
 await page.goto(origin);await page.locator('#enterHangarButton').click();
 await page.waitForFunction(()=>window.__qaSound?.audio.ready);
 await page.locator('#launchButton').click();
 // 1. Bar clock: sector 6 in flight, music on.
 report.clock=await page.evaluate(async()=>{
  const {game:g,audio:a}=__qaSound;a.setLevels(.8,.8,.6);g._start();g.player.invuln=999;
  g.stage=6;g.stageTime=8;g._beatIndex=g._laneIndex=99;
  await new Promise(r=>setTimeout(r,2500));
  const samples=[];for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,50));samples.push(a.state?.barPhase);}
  return{cue:a.music?.cueId,bpm:a.state?.bpm,barLength:a.state?.barLength,samples,wraps:samples.filter((p,k)=>k&&p<samples[k-1]).length};
 });
 assert.equal(report.clock.cue,'sector6','sector 6 plays its own score');
 assert.equal(report.clock.bpm,140);
 assert.ok(report.clock.samples.every(p=>Number.isFinite(p)&&p>=0&&p<1),'barPhase is a finite 0..1 number');
 assert.ok(report.clock.wraps>=1,'the bar phase wraps on the downbeat');
 // 2. THE SOVEREIGN phase 3.
 if(process.env.QA_AUDIO_RECORD!=='0'){
  await page.evaluate(()=>{
   const {game:g,audio:a}=__qaSound;g.shipId='kestrel';g.startDrill(6);
   const b=g.boss;for(const e of g.enemies.filter(e=>e.type==='mirrorEscort'))g._killEnemy(e,false,true);
   b.age=Math.max(b.age,6);b.phase=3;b.phaseStart=b.age;b.hp=Math.floor(b.maxHp/3)-1;g._sovereignEnterPhase(b);
   const update=g.update.bind(g);g.update=(dt,input)=>{update(dt,input);if(g.boss){g.player.invuln=999;g.boss.hp=Math.max(g.boss.hp,g.boss.maxHp*.14);}};
   __qaSound.restoreUpdate=()=>{g.update=update;};
   a.setLevels(1,1,1);a.lastSound.clear();__qaSound.counts={};
   const play=a.playEvent.bind(a);a.playEvent=(event,game)=>{__qaSound.counts[event.type]=(__qaSound.counts[event.type]||0)+1;play(event,game);};
   const tap=a.ctx.createAnalyser();tap.fftSize=2048;a.glue.connect(tap);const buf=new Float32Array(tap.fftSize);
   __qaSound.meter={peak:0,voices:0,combat:0,music:0,tap};
   __qaSound.timer=setInterval(()=>{const m=__qaSound.meter;tap.getFloatTimeDomainData(buf);for(const v of buf)m.peak=Math.max(m.peak,Math.abs(v));
    m.voices=Math.max(m.voices,a.activeVoices);m.combat=Math.max(m.combat,a.combatVoices);m.music=Math.max(m.music,a.music?.stats.live||0);},30);
  });
  await page.keyboard.down('Space');
  for(let i=0;i<21;i++){const key=i%2?'ArrowRight':'ArrowLeft';await page.keyboard.down(key);await page.waitForTimeout(1400);await page.keyboard.up(key);}
  await page.keyboard.up('Space');
  report.sovereign=await page.evaluate(()=>{
   const {game:g,audio:a}=__qaSound,m=__qaSound.meter;clearInterval(__qaSound.timer);a.glue.disconnect(m.tap);__qaSound.restoreUpdate();
   return{phase:g.boss?.phase??null,cue:a.music?.cueId,gluePeak:m.peak,maxVoices:m.voices,maxCombatVoices:m.combat,maxMusicVoices:m.music,musicErrors:a.music?.stats.errors,events:__qaSound.counts};
  });
  const s=report.sovereign;
  assert.equal(s.phase,3,'the leg stays in THE SOVEREIGN phase 3');assert.equal(s.cue,'boss6');
  assert.ok(s.gluePeak<.7,'THE SOVEREIGN phase 3 peaks under 0.7 before the limiter: '+s.gluePeak.toFixed(3));
  assert.ok(s.maxVoices<=96&&s.maxCombatVoices<=40,'voice budget holds');assert.equal(s.musicErrors,0);
  assert.ok(s.events.shoot>40&&s.events.bossShot>0,'the leg exercises held fire against live boss fire');
 }
 // 3. Long cues: a rotating beam and a tether pull, cut by pause and mute and restored on resume.
 report.loops=await page.evaluate(()=>{
  const {game:g,audio:a}=__qaSound;g._start();g.stage=6;g.player.invuln=999;a.setLevels(.8,.8,.6);
  const stub={...g,mode:'playing',events:[],hazards:[{id:9e6,kind:'laser',rotating:true,orient:'r',state:'fire',warn:.9,on:3,age:1,pivotX:120,pivotY:200,angle:.9,angle0:.6,angle1:2.2}],
   enemies:[{id:9e6+1,type:'tether',x:300,y:500,hp:90,progress:.3,carrying:{type:'power',value:4}}]};
  a.setScreen('play');a.update(stub,0);
  const started=a.sfx.loops.size,tracked=[...a.sfx.loops.values()].every(l=>a.longCues.has(l.cue));
  a.setScreen('pause');a.update({...stub,mode:'paused'},0);const paused=a.sfx.loops.size;
  a.setScreen('play');a.update(stub,0);const resumed=a.sfx.loops.size;
  a.toggleMute();const muted=a.sfx.loops.size;a.update(stub,0);const mutedTick=a.sfx.loops.size;a.toggleMute();
  a.update({...stub,hazards:[],enemies:[]},0);const cleared=a.sfx.loops.size;
  return{started,tracked,paused,resumed,muted,mutedTick,cleared};
 });
 const l=report.loops;
 assert.equal(l.started,2);assert.ok(l.tracked,'beam and pull are tracked long cues');
 assert.equal(l.paused,0,'pause cuts them');assert.equal(l.resumed,2,'resume restores them');
 assert.equal(l.muted,0);assert.equal(l.mutedTick,0,'mute cuts them');assert.equal(l.cleared,0,'they end with their state');
 assert.deepEqual(report.errors,[]);
 assert.deepEqual(report.warnings,[],'no audio module may be disabled by an exception');
}finally{await browser.close();await writeFile(new URL('sector6-report.json',output),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
