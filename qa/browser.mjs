import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
const origin=process.env.GAME_URL||'http://127.0.0.1:4173/';
const out=new URL(process.env.QA_OUTPUT||'../artifacts/current/',import.meta.url);await mkdir(out,{recursive:true});
const browserType=process.env.QA_BROWSER==='firefox'?firefox:chromium;
const browser=await browserType.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||process.env.CHROMIUM_EXECUTABLE||undefined,args:browserType===chromium?['--no-sandbox']:[]});
const report={origin,browser:browserType.name(),errors:[],checks:{},stagedCaptures:[]};
async function fresh(options={},adaptLayout=false){
 const p=await browser.newPage({viewport:{width:1440,height:900},...options});
 p.on('pageerror',e=>report.errors.push(e.message));p.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`)});
 if(adaptLayout)await p.route('**/src/main.js',async route=>{
  const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nwindow.__qaLayoutGame=game;window.__qaLayoutRenderer=renderer;'});
 });
 await p.goto(origin);await p.locator('#enterHangarButton').waitFor();return p;
}
try{
 const p=await fresh();await p.screenshot({path:new URL('title.png',out).pathname});
 await p.locator('#enterHangarButton').click();await p.screenshot({path:new URL('hangar.png',out).pathname});
 for(const id of ['kestrel','manta','wraith']){
  await p.locator(`[data-ship="${id}"]`).click();await p.locator('#launchButton').click();
  await p.keyboard.down('Space');await p.waitForTimeout(180);await p.keyboard.up('Space');
  assert.equal(await p.locator('#app').getAttribute('data-screen'),'play');
  await p.locator('#pauseButton').click();await p.locator('#changeShipPauseButton').click();
 }
 report.checks.aircraft=true;
 await p.locator('#launchButton').click();await p.keyboard.down('Space');await p.waitForTimeout(1700);await p.keyboard.up('Space');
 await p.locator('#helpButton').click();
 const before=await p.locator('#game').evaluate(c=>c.toDataURL());await p.waitForTimeout(200);
 assert.equal(await p.locator('#game').evaluate(c=>c.toDataURL()),before,'manual must freeze frame');
 await p.locator('#manualDoneButton').click();assert.equal(await p.evaluate(()=>document.activeElement.id),'game');
 const xBefore=await p.evaluate(()=>window.__game?.player.x);
 await p.keyboard.down('ArrowLeft');await p.waitForTimeout(200);await p.keyboard.up('ArrowLeft');
 if(xBefore!==undefined){assert.ok(await p.evaluate(()=>__game.player.x)<xBefore);report.checks.movedAfterManual=true;}
 report.checks.manualFocusAndFreeze=true;
 await p.locator('#soundButton').click();assert.equal(await p.evaluate(()=>document.activeElement.id),'game');
 await p.keyboard.press('Escape');assert.equal(await p.locator('#app').getAttribute('data-screen'),'pause');
 await p.locator('#resumeButton').click();await p.locator('#game').click();assert.equal(await p.evaluate(()=>document.activeElement.id),'game');report.checks.soundAndCanvasFocus=true;
 await p.locator('#soundButton').click();
 await p.locator('#helpButton').click();await p.locator('#setting-autoFire').check();await p.locator('#setting-reducedEffects').check();await p.locator('#setting-music').fill('35');await p.locator('#setting-music').dispatchEvent('input');await p.locator('#setting-ambience').fill('65');await p.locator('#setting-ambience').dispatchEvent('input');
 await p.locator('#manualDoneButton').click();await p.reload();await p.locator('#helpButton').click();
 assert.equal(await p.locator('#setting-music').inputValue(),'35');assert.ok(await p.locator('#setting-autoFire').isChecked());assert.ok(await p.locator('#setting-reducedEffects').isChecked());
 assert.equal(await p.locator('#setting-ambience').inputValue(),'65');
 await p.locator('#setting-autoFire').uncheck();await p.locator('#setting-reducedEffects').uncheck();await p.locator('#manualDoneButton').click();report.checks.preferencesPersist=true;
 await p.locator('#enterHangarButton').click();await p.locator('#launchButton').click();
 const hooks=await p.evaluate(()=>!!window.__game);
 if(hooks){
  await p.evaluate(()=>{window.__game.player.invuln=999;});await p.keyboard.down('Space');await p.waitForTimeout(8000);await p.keyboard.up('Space');
  await p.screenshot({path:new URL('combat-live.png',out).pathname});
  for(const stage of [1,2,3]){
   await p.evaluate(stage=>{const g=__game;g.reset();g._start();g.stage=stage;g.stageTime=30;g.scroll=3500;g._beatIndex=99;g._laneIndex=99;g.player.invuln=999;g._spawnBoss();g.boss.age=24;g.boss.phase=3;g.boss.hp=g.boss.maxHp*.3;g.boss.fireAt=24;g.player.level=3;g.player.power=3;},stage);
   await p.keyboard.down('Space');await p.waitForTimeout(2300);await p.keyboard.up('Space');
   await p.locator('#game').screenshot({path:new URL(`boss-${stage}-staged.png`,out).pathname});
   report.stagedCaptures.push(await p.evaluate(()=>({stage:__game.stage,bullets:__game.bullets.length,mode:__game.mode})));
  }
  await p.locator('#pauseButton').click();await p.locator('#retryPauseButton').click();
  await p.evaluate(()=>{localStorage.removeItem('2026-high-score');__game.stage=3;__game._advanceStage();});await p.waitForTimeout(300);
  const scores=await p.evaluate(()=>({actual:__game.score,saved:Number(localStorage.getItem('2026-high-score'))}));assert.equal(scores.actual,scores.saved);report.checks.endScoreFlush=scores;
 }else report.checks.noPublicHooks=true;
 await p.close();
 const mobile=await fresh({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
 await mobile.locator('#enterHangarButton').tap();await mobile.locator('#launchButton').tap();await mobile.waitForTimeout(300);
 const layout=await mobile.evaluate(()=>({width:innerWidth,content:document.documentElement.scrollWidth,canvas:document.getElementById('game').getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll('.touch-controls button')].map(e=>e.getBoundingClientRect().height)}));
 assert.equal(layout.width,layout.content);assert.ok(layout.buttons.every(h=>h>=44));
 await mobile.screenshot({path:new URL('mobile.png',out).pathname});await mobile.locator('#touchPause').tap();assert.equal(await mobile.locator('#app').getAttribute('data-screen'),'pause');
 report.checks.mobile=layout;await mobile.close();
 for(const viewport of [{width:320,height:568},{width:768,height:1024},{width:844,height:390}]){
  const device=await fresh({viewport,hasTouch:true,isMobile:true},true);await device.locator('#enterHangarButton').tap();await device.locator('#launchButton').tap();
  const bounds=await device.locator('#game').boundingBox();assert.ok(bounds.y+bounds.height<=viewport.height,'playfield must fit viewport');
  for(const id of ['touchFocus','touchBomb','touchRoll','touchPause'])assert.ok(await device.locator('#'+id).isVisible());
  await device.screenshot({path:new URL(`touch-${viewport.width}x${viewport.height}.png`,out).pathname});
  const cases=[];
  for(const ship of ['kestrel','manta','wraith']){
   // Frozen layout fixture: maximum score/combo, critical hull, full shields,
   // longest boss name and legal forward clamp. This is not a player clear.
   await device.evaluate(ship=>{
    const g=__qaLayoutGame;g.shipId=ship;g._start();g.stage=3;g._spawnBoss();
    g.player.y=230;g.player.hp=1;g.player.shield=g.player.maxShield;g.player.invuln=0;
    g.score=99999999;g.combo=8;g.boss.age=3;g.boss.phase=3;g.boss.y=285;
    g.update=()=>{g.events=[]};
   },ship);await device.waitForTimeout(100);
   const hud=await device.locator('.mobile-hud').boundingBox();
   const radius=ship==='manta'?9:ship==='wraith'?7:8;
   const coreTop=bounds.y+bounds.height*(230-radius)/900;
   assert.ok(hud.y+hud.height<coreTop-2,`${ship} boss HUD must clear the entire highest legal collision core`);
   assert.ok(await device.locator('.mobile-hud').evaluate(el=>el.scrollWidth<=el.clientWidth),'HUD text must not overflow');
   cases.push({ship,hudBottom:hud.y+hud.height,coreTop,clearance:coreTop-hud.y-hud.height});
   await device.screenshot({path:new URL(`touch-${viewport.width}x${viewport.height}-${ship}-boss-staged.png`,out).pathname});
  }
  await device.locator('#touchPause').tap();assert.equal(await device.locator('#app').getAttribute('data-screen'),'pause');
  // Measure after the panel's short entrance slide settles; mid-animation boxes are offset.
  await device.locator('.modal-panel').evaluate(el=>Promise.all(el.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished)));
  const modal=await device.locator('.modal-panel').boundingBox();assert.ok(modal.y>=0&&modal.y+modal.height<=viewport.height,'pause panel must fit viewport');
  const resumeBox=await device.locator('#resumeButton').boundingBox();assert.ok(resumeBox.y>=0&&resumeBox.y+resumeBox.height<=viewport.height,'resume must be visible without scrolling');
  report.checks['touch-'+viewport.width+'x'+viewport.height]={...bounds,stagedHudCases:cases,modal};await device.close();
 }

 // Short desktop windows need the complete field before the first input too.
 for(const viewport of [{width:844,height:390},{width:1280,height:540}]){
  const short=await fresh({viewport});await short.locator('#enterHangarButton').click();await short.locator('#launchButton').click();
  const bounds=await short.locator('#game').boundingBox();
  assert.ok(bounds.y>=0&&bounds.y+bounds.height<=viewport.height,'fine-pointer short window must show the entire field on launch');
  assert.ok(await short.locator('#touchPause').isVisible());
  await short.keyboard.press('Escape');assert.ok(await short.locator('#pauseScreen').isVisible());
  await short.locator('#resumeButton').click();
  await short.setViewportSize({width:1280,height:900});await short.waitForFunction(()=>!document.body.classList.contains('compact-controls'));
  await short.setViewportSize(viewport);await short.waitForFunction(()=>document.body.classList.contains('compact-controls'));
  const resized=await short.locator('#game').boundingBox();assert.ok(resized.y+resized.height<=viewport.height);
  report.checks['short-desktop-'+viewport.width+'x'+viewport.height]={initial:bounds,resized};
  await short.screenshot({path:new URL(`short-desktop-${viewport.width}x${viewport.height}.png`,out).pathname});await short.close();
 }

 // Exercise the shipped entry with an in-memory, test-only state adapter.
 // The response body is the actual build; the adapter only exposes its Game.
 report.checks.terminalFlows=[];
 for(const outcome of ['defeat','victory']){
  const terminal=await browser.newPage({viewport:{width:1440,height:900}});const terminalErrors=[];
  terminal.on('pageerror',e=>terminalErrors.push(e.message));
  await terminal.route('**/src/main.js',async route=>{
   const response=await route.fetch(),body=await response.text();
   await route.fulfill({response,body:body+'\nwindow.__qaTerminalGame=game;window.__qaTerminalAudio=audio;'});
  });
  await terminal.goto(origin);await terminal.locator('#enterHangarButton').click();await terminal.locator('#launchButton').click();
  let terminalAudioReady=true;
  try{await terminal.waitForFunction(()=>window.__qaTerminalAudio.ready,null,{timeout:3000});}
  catch(error){
   const context=await terminal.evaluate(()=>({state:__qaTerminalAudio.ctx?.state,time:__qaTerminalAudio.ctx?.currentTime}));
   if(browserType!==firefox||context.state!=='suspended'||context.time!==0)throw error;
   terminalAudioReady=false;report.audioLimitation='This host also leaves a bare Firefox AudioContext.resume pending at time0. Terminal voice counts are verified in Chromium; Firefox flow checks continue without an audio-output claim.';
  }
  await terminal.evaluate(outcome=>{
   const g=window.__qaTerminalGame;
   window.__qaTerminalCues={dispatches:0,oscillators:0};
   const a=__qaTerminalAudio,play=a.playEvent.bind(a),create=a.ctx.createOscillator.bind(a.ctx);
   let terminalCue=false;
   a.ctx.createOscillator=()=>{if(terminalCue)__qaTerminalCues.oscillators++;return create();};
   a.playEvent=(event,game)=>{terminalCue=['victory','gameover'].includes(event.type);if(terminalCue)__qaTerminalCues.dispatches++;try{play(event,game);}finally{terminalCue=false;}};
   if(outcome==='victory'){g.stage=3;g.boss=null;g.enemies=[];g._transition=.001;}
   else{g.player.hp=1;g.player.lives=1;g.player.invuln=0;g.bullets.push({x:g.player.x,y:g.player.y,vx:0,vy:0,r:5,kind:'red'});}
  },outcome);
  await terminal.locator('#endScreen').waitFor({state:'visible'});
  await terminal.locator('#skipCinemaButton').click();assert.ok(await terminal.locator('#retryButton').isVisible());
  const record=await terminal.evaluate(()=>({score:__qaTerminalGame.score,saved:Number(localStorage.getItem('2026-high-score')),mode:__qaTerminalGame.mode}));
  const cues=await terminal.evaluate(()=>__qaTerminalCues);
  if(terminalAudioReady){assert.equal(cues.dispatches,1);assert.equal(cues.oscillators,outcome==='victory'?9:3,'terminal cue voices (sfx.js victory: 5 brass + 4 bells; gameover: 3 falling tones)');record.audio={verified:true,...cues};}
  else record.audio={verified:false,reason:report.audioLimitation};
  assert.ok(record.saved>=record.score);await terminal.locator('#retryButton').click();assert.equal(await terminal.locator('#app').getAttribute('data-screen'),'play');
  assert.deepEqual(terminalErrors,[]);report.checks.terminalFlows.push({outcome,...record,errors:terminalErrors});await terminal.close();
 }
 // A conversion can land with two power upgrades in one event batch. Assert
 // the actual drawn text remains distinct and in the field, including edges.
 const reward=await fresh({},true);await reward.locator('#enterHangarButton').click();await reward.locator('[data-ship="wraith"]').click();await reward.locator('#launchButton').click();
 await reward.evaluate(()=>{
  const c=document.getElementById('game').getContext('2d'),draw=c.fillText.bind(c);
  c.fillText=(text,x,y,...args)=>{
   if(/^POWER \d|^\+\d+ CONVERT$/.test(text))window.__qaRewardLabels[text]={text,x,y,width:c.measureText(text).width,height:parseFloat(c.font.replace(/^[^\d]*/,''))};
   return draw(text,x,y,...args);
  };
 });
 report.checks.rewardLabels=[];
 for(const position of [{x:62,y:250},{x:270,y:750},{x:478,y:750}]){
  await reward.evaluate(position=>{
   window.__qaRewardLabels={};__qaLayoutRenderer.impacts.length=0;const g=__qaLayoutGame;g._start();Object.assign(g.player,position);g.score=2500;
   for(let i=0;i<100;i++)g._bullet(50+i*4,100,Math.PI/2,100,'amber',5);
   // Score no longer buys power (uncapped arsenal), so the fixture collects two
   // power levels in the same batch as the conversion.
   let first=true;g.update=dt=>{if(first){g._bomb();g._increasePower();g._increasePower();first=false;}else g.events=[];g._updateParticles(dt);};
  },position);await reward.waitForTimeout(200);
  const labels=await reward.evaluate(()=>Object.values(__qaRewardLabels));
  assert.equal(labels.length,2,'simultaneous upgrades must coalesce to one power label beside conversion');
  assert.ok(labels.some(label=>label.text==='POWER 4'),'sortie power 2 plus two upgrades');
  assert.ok(labels.some(label=>label.text==='+12000 CONVERT'));
  assert.ok(Math.abs(labels[0].y-labels[1].y)>22,'reward labels must have separate vertical lanes');
  for(const label of labels)assert.ok(label.x-label.width/2>=0&&label.x+label.width/2<=540,'reward labels must stay inside the field');
  report.checks.rewardLabels.push({position,labels});
  await reward.locator('#game').screenshot({path:new URL(`rewards-${position.x}-${position.y}-staged.png`,out).pathname});
 }
 await reward.close();
 report.checks.systemReducedMotion=[];
 for(const failure of ['denied','malformed']){
  const motion=await browser.newPage({reducedMotion:'reduce'});motion.on('pageerror',e=>report.errors.push(e.message));
  await motion.addInitScript(failure=>{
   if(failure==='denied')Storage.prototype.getItem=()=>{throw new DOMException('Denied','SecurityError');};
   else localStorage.setItem('2026-settings','{broken');
  },failure);
  await motion.goto(origin);await motion.locator('#helpButton').click();assert.ok(await motion.locator('#setting-reducedEffects').isChecked());
  report.checks.systemReducedMotion.push({failure,reducedEffects:true});await motion.close();
 }
 assert.deepEqual(report.errors,[]);
}finally{await browser.close();await writeFile(new URL('qa.json',out),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
