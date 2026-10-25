import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
// Live-browser audio checks: bus routing, pause treatment, interface cues, presentation cues and
// three short in-flight recordings. These are measurements, not listening judgments.
const origin=process.env.GAME_URL||'http://127.0.0.1:4173/';
const output=new URL('../artifacts/audio/',import.meta.url);await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});
const page=await browser.newPage();const report={origin,auditioned:false,scope:'Engine routing, pause treatment, cues and SFX/ambience recordings with music muted. Staged samples, not completed player runs.',errors:[],warnings:[],samples:[]};
page.on('pageerror',error=>report.errors.push(error.message));
page.on('console',message=>{if(message.type()==='warning'&&message.text().includes('[audio]'))report.warnings.push(message.text());});
try{
 await page.route('**/src/main.js',async route=>{
  const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nwindow.__qaSound={game,audio};'});
 });
 await page.goto(origin);await page.locator('#enterHangarButton').click();
 await page.waitForFunction(()=>window.__qaSound?.audio.ready);
 report.directors=await page.evaluate(()=>({music:!!__qaSound.audio.music,soundscape:!!__qaSound.audio.soundscape}));
 // Interface cues: every name creates voices on the ui bus.
 report.ui=await page.evaluate(()=>{
  const a=__qaSound.audio,result={};
  for(const name of ['focus','select','confirm','back','launch','pause','resume','open','close','tick','skip']){
   a.lastSound.clear();const before=a.activeVoices;a.ui(name);result[name]=a.activeVoices-before;
  }
  return result;
 });
 for(const [name,voices] of Object.entries(report.ui))assert.ok(voices>0,'ui cue '+name+' must sound');
 await page.locator('#launchButton').click();
 const routing=await page.evaluate(async()=>{
  const {audio:a,game:g}=__qaSound,ctx=a.ctx;
  const measure=async node=>{
   const analyser=ctx.createAnalyser();analyser.fftSize=4096;node.connect(analyser);
   await new Promise(r=>setTimeout(r,450));const data=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(data);node.disconnect(analyser);
   return Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length);
  };
  a.setLevels(0,0,1);g.stage=2;await new Promise(r=>setTimeout(r,1500));
  const ambientOnly={master:await measure(a.master),ambient:await measure(a.ambienceBus),music:await measure(a.musicBus),effects:await measure(a.fxBus)};
  a.setScreen('pause');g.mode='paused';a.update(g,0);await new Promise(r=>setTimeout(r,600));
  const paused={beds:await measure(a.bedPause),effects:await measure(a.fxGate),filter:a.bedFilter.frequency.value};
  a.setScreen('play');g.mode='playing';a.update(g,0);
  a.setLevels(0,1,0);a.update(g,0);await new Promise(r=>setTimeout(r,500));const ambientZero=await measure(a.ambienceBus);
  a.setLevels(0,0,0);await new Promise(r=>setTimeout(r,500));const allZero=await measure(a.master);
  return{ambientOnly,paused,ambientZero,allZero};
 });
 assert.ok(routing.ambientOnly.master>.0001,'music/effects 0 must preserve an audible ambient signal');
 assert.ok(routing.ambientOnly.ambient>.0001);
 assert.ok(routing.ambientOnly.music<.00001&&routing.ambientOnly.effects<.00001,'the environment must not leak into the score or effects');
 assert.ok(routing.paused.effects<.00001,'pause silences effects');
 assert.ok(routing.paused.beds>.00001&&routing.paused.filter<1000,'pause keeps the beds, low-passed');
 assert.ok(routing.ambientZero<.00001&&routing.allZero<.00001,'zero controls must silence their routes');
 report.routing=routing;
 if(await page.locator('#resumeButton').isVisible())await page.locator('#resumeButton').click();
 // Presentation cue: the flagship siren starts once from game state and stops on pause.
 report.flagshipWarning=await page.evaluate(async()=>{
  const {audio:a,game:g}=__qaSound;a.setLevels(0,.8,.6);g._start();g.player.invuln=999;g._beatIndex=g._laneIndex=99;
  g.stageTime=g.stageGoal[1]-2.6;await new Promise(r=>setTimeout(r,250));
  const started=a.longCues.size;a.setScreen('pause');a.update({...g,mode:'paused',events:[]},0);const stopped=a.longCues.size;a.setScreen('play');
  return{started,stopped};
 });
 assert.equal(report.flagshipWarning.started,1);assert.equal(report.flagshipWarning.stopped,0);
 await page.evaluate(()=>{
  const a=__qaSound.audio,play=a.playEvent.bind(a);__qaSound.counts={};
  a.playEvent=(event,game)=>{const counts=__qaSound.counts;counts[event.type]=(counts[event.type]||0)+1;play(event,game);};
 });
 for(const [index,ship] of (process.env.QA_AUDIO_RECORD==='0'?[]:['kestrel','manta','wraith']).entries()){
  await page.evaluate(({ship,index})=>{
   const {game:g,audio:a}=__qaSound;g.shipId=ship;g._start();g.stage=index+1;g._beatIndex=g._laneIndex=99;g.player.invuln=999;g.player.level=3;g.player.power=3;g.player.drones=0;g.player.signature=ship==='wraith'?1:0;g._syncOrbitals();g._syncArsenal();
   a.setLevels(0,.8,.6);a.lastSound.clear();
   __qaSound.counts={};
  },{ship,index});
  const recording=page.evaluate(async()=>{
   const a=__qaSound.audio,ctx=a.ctx,dest=ctx.createMediaStreamDestination(),meter=ctx.createAnalyser();meter.fftSize=2048;a.master.connect(dest);a.master.connect(meter);
   const chunks=[],samples=[],data=new Float32Array(meter.fftSize),recorder=new MediaRecorder(dest.stream,{mimeType:'audio/webm;codecs=opus'});
   recorder.ondataavailable=e=>chunks.push(e.data);const done=new Promise(resolve=>recorder.onstop=resolve);
   const interval=setInterval(()=>{
    meter.getFloatTimeDomainData(data);let sum=0,peak=0;for(const value of data){sum+=value*value;peak=Math.max(peak,Math.abs(value));}
    samples.push({rms:Math.sqrt(sum/data.length),peak,voices:a.activeVoices,combat:a.combatVoices});
   },30);
   recorder.start();await new Promise(r=>setTimeout(r,12000));recorder.stop();await done;clearInterval(interval);a.master.disconnect(dest);a.master.disconnect(meter);
   const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());let binary='';for(const v of bytes)binary+=String.fromCharCode(v);
   return{base64:btoa(binary),events:__qaSound.counts,maxPeak:Math.max(...samples.map(s=>s.peak)),rmsDb:20*Math.log10(Math.sqrt(samples.reduce((s,v)=>s+v.rms*v.rms,0)/samples.length)),maxVoices:Math.max(...samples.map(s=>s.voices)),maxCombatVoices:Math.max(...samples.map(s=>s.combat))};
  });
  await page.waitForTimeout(1800);await page.keyboard.down('Space');
  await page.evaluate(()=>{const g=__qaSound.game;for(let i=0;i<4;i++)g._enemy(i%2?'bomber':'scout',220+i*30,300-i*60,{fireAt:99});});
  await page.waitForTimeout(4000);await page.keyboard.press('x');await page.waitForTimeout(2000);await page.keyboard.press('c');
  await page.waitForTimeout(1200);await page.evaluate(()=>{const {audio:a,game:g}=__qaSound;a.playEvent({type:'shieldBreak',x:270},g);});
  const {base64,...metrics}=await recording;await page.keyboard.up('Space');
  assert.ok(metrics.maxPeak<.95,'sample must not clip');assert.ok(metrics.maxVoices<=96&&metrics.maxCombatVoices<=40,'voice budget holds');
  assert.ok(metrics.events.shoot>40&&metrics.events.bomb===1&&metrics.events.roll===1,'each clip must actually exercise fire, special and roll');
  const file=`${ship}-sfx-ambience.webm`;await writeFile(new URL(file,output),Buffer.from(base64,'base64'));
  report.samples.push({ship,stage:index+1,file,duration:12,timeline:'0–1.8s ambience;1.8s fire/targets;5.8s special;7.8s roll;9s shield-break cue',...metrics});
 }
 assert.deepEqual(report.errors,[]);
 assert.deepEqual(report.warnings,[],'no audio module may be disabled by an exception');
}finally{await browser.close();await writeFile(new URL(process.env.QA_AUDIO_RECORD==='0'?'routing-report.json':'sfx-report.json',output),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
