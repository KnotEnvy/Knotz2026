import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
const origin=process.env.GAME_URL||'http://127.0.0.1:4173/',output=new URL(process.env.QA_OUTPUT||'../artifacts/career/',import.meta.url);await mkdir(output,{recursive:true});
const type=process.env.QA_BROWSER==='firefox'?firefox:chromium;
const browser=await type.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||process.env.CHROMIUM_EXECUTABLE||undefined,args:type===chromium?['--no-sandbox']:[]});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),report={origin,browser:type.name(),errors:[],checks:{}};
page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`)});
await page.route('**/src/main.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nwindow.__qaCareerGame=game;'});});
await page.addInitScript(()=>{if(localStorage.getItem('2026-high-score')===null)localStorage.setItem('2026-high-score','87654');});
try{
 await page.goto(origin);await page.locator('#enterHangarButton').click();
 report.checks.hangarLayouts=[];
 for(const viewport of [{width:1440,height:1000},{width:1366,height:768},{width:320,height:568}]){
  await page.setViewportSize(viewport);
  for(const ship of ['kestrel','manta','wraith']){
   await page.locator('[data-ship="'+ship+'"]').click();
   const layout=await page.evaluate(()=>{const box=selector=>{const b=document.querySelector(selector).getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height}};return{launch:box('#launchButton'),metrics:box('.ship-metrics'),card:box('.ship-detail'),bar:box('.hangar-bottom')};});
   assert.ok(layout.launch.y>=0&&layout.launch.bottom<=viewport.height&&layout.launch.right<=viewport.width,'departure action must be fully visible');
   assert.ok(layout.metrics.right<=layout.card.right-8&&layout.metrics.x>=layout.card.x,'performance gauges must fit the aircraft card');
   report.checks.hangarLayouts.push({viewport,ship,...layout});
   if(viewport.width===320&&ship==='kestrel')await page.screenshot({path:new URL('hangar-kestrel-320.png',output).pathname});
  }
  if(viewport.width===320)await page.screenshot({path:new URL('hangar-320.png',output).pathname});
 }
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>scrollTo(0,0));
 assert.ok(await page.locator('[data-drill="1"]').isEnabled());assert.ok(await page.locator('[data-drill="2"]').isDisabled());assert.ok(await page.locator('[data-drill="3"]').isDisabled());
 await page.locator('[data-ship="wraith"]').click();await page.screenshot({path:new URL('hangar-drills.png',output).pathname});
 await page.evaluate(()=>{window.__pad={connected:true,index:0,axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[__pad]});});
 async function button(index){await page.evaluate(i=>__pad.buttons[i].pressed=true,index);await page.waitForTimeout(120);await page.evaluate(i=>__pad.buttons[i].pressed=false,index);await page.waitForTimeout(120);}
 await button(13);assert.equal(await page.evaluate(()=>document.activeElement.dataset.drill),'1');await button(0);
 assert.equal(await page.locator('#app').getAttribute('data-screen'),'play');assert.equal(await page.evaluate(()=>__qaCareerGame.practiceStage),1);
 await page.keyboard.down('Space');await page.waitForTimeout(4500);await page.keyboard.up('Space');await page.screenshot({path:new URL('vesper-drill-live.png',output).pathname});
 assert.equal(await page.evaluate(()=>localStorage.getItem('2026-career')),null,'live drills must not create campaign career records');
 // Technical terminal fixture proves isolation even with a huge practice score.
 await page.evaluate(()=>{const g=__qaCareerGame;g._awardScore(999999);g._killEnemy(g.boss);});
 await page.locator('#endScreen').waitFor({state:'visible'});await page.locator('#skipCinemaButton').click();
 assert.match(await page.locator('#personalRecord').textContent(),/UNRANKED/);
 assert.match(await page.locator('#retryButton').textContent(),/RETRY DRILL/);
 assert.equal(await page.evaluate(()=>localStorage.getItem('2026-high-score')),'87654');
 assert.equal(await page.evaluate(()=>localStorage.getItem('2026-career')),null);
 const drill=await page.evaluate(()=>({summary:__qaCareerGame.summary,records:JSON.parse(localStorage.getItem('2026-drills'))}));
 assert.equal(drill.records['wraith-1'].bestTime,drill.summary.time);assert.equal(drill.records['wraith-1'].fewestHits,drill.summary.hitsTaken);
 assert.equal(await page.locator('#endHits').textContent(),String(drill.summary.hitsTaken));assert.match(await page.locator('#endFlightTime').textContent(),/^\d+:\d\d\.\d$/);
 assert.match(await page.locator('#personalRecord').textContent(),/FEWEST HITS/);report.checks.drillBenchmarks=drill.records;
 if(drill.summary.hitsTaken===0)assert.match(await page.locator('#endEyebrow').textContent(),/NO-HIT CLEAR/);
 report.checks.practiceIsolation=true;await page.waitForTimeout(900);await page.screenshot({path:new URL('drill-result-assisted.png',output).pathname});
 await page.setViewportSize({width:320,height:568});
 assert.ok(await page.locator('#endHeading').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return range.getBoundingClientRect().right<=innerWidth-19}),'no-hit result heading must fit the phone');
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('#retryButton').click();assert.equal(await page.evaluate(()=>__qaCareerGame.practiceStage),1);
 await button(9);assert.equal(await page.locator('#app').getAttribute('data-screen'),'pause');
 // Pause menu order: Resume, Manual / Options, Restart, Mute, Change aircraft.
 await button(13);assert.equal(await page.evaluate(()=>document.activeElement.id),'pauseOptionsButton');
 await button(13);assert.equal(await page.evaluate(()=>document.activeElement.id),'retryPauseButton');
 await button(12);assert.equal(await page.evaluate(()=>document.activeElement.id),'pauseOptionsButton');
 await button(0);assert.ok(await page.locator('#manualDialog').isVisible());await button(1);assert.ok(await page.locator('#manualDialog').isHidden());
 await page.locator('#changeShipPauseButton').click();await page.locator('#launchButton').click();assert.equal(await page.evaluate(()=>__qaCareerGame.practiceStage),0);
 // Assisted encounter unlock and campaign finish exercise the shipped entry.
 await page.evaluate(()=>{const g=__qaCareerGame;g.stage=2;g._spawnBoss();});await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('2026-career')).bossSeen),2);
 await page.evaluate(()=>{const g=__qaCareerGame;g._awardScore(60000);g.player.hp=1;g.player.lives=1;g.player.invuln=0;g._hurtPlayer(g.player.x,g.player.y);});
 await page.locator('#endScreen').waitFor({state:'visible'});await page.locator('#skipCinemaButton').click();
 assert.match(await page.locator('#personalRecord').textContent(),/NEW WRAITH BEST/);assert.ok((await page.locator('#flightAdvice').textContent()).length>30);
 const record=await page.evaluate(()=>JSON.parse(localStorage.getItem('2026-career')).ships.wraith);assert.equal(record.sorties,1);assert.equal(record.bestScore,60000);
 report.checks.campaignRecord=record;
 await page.setViewportSize({width:320,height:568});await page.waitForTimeout(900);await page.locator('#endScreen').evaluate(el=>el.scrollTop=0);
 const header=await page.evaluate(()=>{const b=id=>{const r=document.getElementById(id).getBoundingClientRect();return{top:r.top,bottom:r.bottom}};return{grade:b('gradeLockup'),kicker:b('endEyebrow'),heading:b('endHeading')};});
 assert.ok(header.grade.top>=header.kicker.bottom&&header.heading.top>=header.grade.bottom,'mobile grade must sit between kicker and heading');
 report.checks.mobileResultHeader=header;await page.screenshot({path:new URL('debrief-mobile-top-assisted.png',output).pathname});
 await page.locator('#retryButton').scrollIntoViewIfNeeded();await page.screenshot({path:new URL('debrief-mobile-assisted.png',output).pathname});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('#changeShipButton').click();assert.ok(await page.locator('[data-drill="2"]').isEnabled());
 assert.match(await page.locator('#shipRecord').textContent(),/00060000/);
 await page.reload();await page.locator('#enterHangarButton').click();assert.ok(await page.locator('[data-drill="2"]').isEnabled());
 await page.locator('[data-ship="wraith"]').click();assert.match(await page.locator('#shipRecord').textContent(),/00060000/);
 assert.match(await page.locator('[data-drill="1"] small').textContent(),/BEST \d+:\d\d\.\d \/ \d+ HITS/);
 await page.locator('[data-ship="kestrel"]').click();assert.match(await page.locator('#shipRecord').textContent(),/FIRST SORTIE/);
 await page.locator('[data-drill="2"]').click();assert.equal(await page.evaluate(()=>__qaCareerGame.practiceStage),2);
 await page.locator('#touchPause').click();assert.match(await page.locator('#retryPauseButton').textContent(),/RESTART DRILL/);
 await page.locator('#changeShipPauseButton').click();await page.locator('#launchButton').click();assert.equal(await page.evaluate(()=>__qaCareerGame.practiceStage),0);
 await page.locator('#touchPause').click();await page.locator('#changeShipPauseButton').click();await page.locator('[data-ship="kestrel"]').focus();await page.keyboard.press('Enter');
 assert.equal(await page.evaluate(()=>__qaCareerGame.practiceStage),0);assert.equal(await page.locator('#app').getAttribute('data-screen'),'play');
 // Controlled other-tab writes exercise the actual stale in-memory career and result UI.
 report.checks.remoteBestDebriefs=[];
 for(const [remoteScore,score,expected] of [[50000,60000,'NEW KESTREL BEST / +10,000 POINTS'],[60000,60000,'KESTREL BEST / 00060000'],[90000,70000,'KESTREL BEST / 00090000']]){
  await page.evaluate(async({remoteScore,score})=>{
   const {readProgress,recordFlight,saveProgress}=await import('./src/progress.js');const remote=readProgress();
   recordFlight(remote,{shipId:'kestrel',outcome:'defeat',score:remoteScore});saveProgress(remote);
   const g=__qaCareerGame;g._awardScore(score);g.player.hp=1;g.player.lives=1;g.player.invuln=0;g._hurtPlayer(g.player.x,g.player.y);
  },{remoteScore,score});
  await page.locator('#endScreen').waitFor({state:'visible'});await page.locator('#skipCinemaButton').click();
  assert.equal(await page.locator('#personalRecord').textContent(),expected);report.checks.remoteBestDebriefs.push({remoteScore,score,display:expected});
  await page.locator('#retryButton').click();
 }
 await page.locator('#touchPause').click();await page.locator('#changeShipPauseButton').click();
 await page.locator('[data-drill="1"]').click();report.checks.assistedDrillGoals=[];
 for(const [hitsTaken,livesLost,kicker,heading,target] of [[8,2,'CLEAR SECURED','Flagship','keep all three lives'],[2,0,'ALL LIVES KEPT','Pattern','a no-hit clear']]){
  await page.evaluate(({hitsTaken,livesLost})=>{const g=__qaCareerGame;g.stats.hitsTaken=hitsTaken;g.stats.livesLost=livesLost;g.player.lives=3-livesLost;g._killEnemy(g.boss);},{hitsTaken,livesLost});
  await page.locator('#endScreen').waitFor({state:'visible'});await page.locator('#skipCinemaButton').click();
  assert.ok((await page.locator('#endEyebrow').textContent()).includes(kicker));assert.ok((await page.locator('#endHeading').textContent()).includes(heading));
  assert.ok(await page.locator('#endHeading').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return range.getBoundingClientRect().right<=innerWidth-19}),'drill result heading must fit the phone');
  assert.ok((await page.locator('#flightAdvice').textContent()).includes(target));report.checks.assistedDrillGoals.push({hitsTaken,livesLost,kicker,target});
  await page.locator('#retryButton').click();
 }
 report.checks.unlockAndRecordPersistence=true;report.checks.controllerDrillAndPauseOptions=true;
 assert.deepEqual(report.errors,[]);
}finally{await browser.close();await writeFile(new URL(`${type.name()}-report.json`,output),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
