import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
const type=process.env.QA_BROWSER==='firefox'?firefox:chromium;
const origin=process.env.GAME_URL||'http://127.0.0.1:4173/',out=new URL('../artifacts/reactor/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await type.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||process.env.CHROMIUM_EXECUTABLE||undefined,args:type===chromium?['--no-sandbox']:[]});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),report={origin,browser:type.name(),errors:[],method:'Assisted access and phase-two arrangement. Subsequent aiming, projectiles, reactor damage, timing and cover use actual browser controls and normal simulation. Layout-only freezes are labeled separately.',checks:{}};
page.on('pageerror',e=>report.errors.push(e.message));
await page.route('**/src/main.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nwindow.reactorGame=game;window.reactorAudio=audio;'});});
await page.addInitScript(()=>{localStorage.setItem('2026-career',JSON.stringify({bossSeen:2}));localStorage.setItem('2026-settings',JSON.stringify({music:0,effects:80,ambience:60}));});
try{
 await page.goto(origin);await page.locator('#enterHangarButton').click();await page.locator('[data-ship="manta"]').click();await page.locator('[data-drill="2"]').click();
 await page.evaluate(()=>{const g=reactorGame,b=g.boss;b.age=11;b.hp=2350;b.phase=2;b.fireAt=12.15;g.bullets=[];});
 await page.waitForTimeout(100);await page.locator('#game').screenshot({path:new URL(type.name()+'-opening-assisted.png',out).pathname});
 const box=await page.locator('#game').boundingBox();
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*750/900);await page.mouse.down();await page.keyboard.down('Shift');
 let previous=null,broken=null;
 for(let i=0;i<70;i++){
  const state=await page.evaluate(()=>{const g=reactorGame;return{mode:g.mode,time:g.time,bossAge:g.boss?.age,reactor:g.boss?.reactor,cover:g.boss?.cover,score:g.score,hits:g.stats.hitsTaken,reactors:g.stats.reactorsBroken,best:g.best}});
  if(state.reactor?.broken){broken=state;break;}
  assert.equal(state.mode,'playing');assert.equal(state.reactor?.phase,2,'reactor should be available before a phase change');
  const r=state.reactor;if(r){const velocity=previous?(r.x-previous.x)/Math.max(.01,state.time-previous.time):0;const target=Math.max(52,Math.min(488,r.x+velocity*.45));await page.mouse.move(box.x+box.width*target/540,box.y+box.height*750/900);previous={x:r.x,time:state.time};}
  await page.waitForTimeout(100);
 }
 await page.mouse.up();await page.keyboard.up('Shift');assert.ok(broken,'ordinary aimed shots must be able to break the separate reactor');
 assert.equal(broken.reactors,1);assert.equal(broken.best,0);report.checks.aimedReactorBreak=broken;
 await page.locator('#game').screenshot({path:new URL(type.name()+'-cover-aimed-input.png',out).pathname});
 await page.keyboard.press('Escape');const frozen=await page.evaluate(()=>reactorGame.boss.age);await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>reactorGame.boss.age),frozen);
 await page.locator('#resumeButton').click();report.checks.pauseFreezesCover=true;
 await page.waitForTimeout(3350);assert.ok(await page.evaluate(()=>reactorGame.boss.age>=reactorGame.boss.cover.until));report.checks.coverExpires=true;
 // Frozen rendering fixtures inspect both outer extremes without claiming player clears.
 for(const viewport of [{width:320,height:568},{width:844,height:390}]){
  await page.setViewportSize(viewport);
  for(const side of [-1,1]){
   await page.evaluate(side=>{const g=reactorGame,b=g.boss;g.update=()=>{g.events=[]};b.x=side<0?184:356;b.y=285;b.age=19;b.phase=side<0?2:3;b.angle=0;b.reactor={id:-99,phase:b.phase,side,hp:80,maxHp:160,r:22,opensAt:18,x:side<0?108:432,y:343};b.cover=null;},side);
   await page.waitForTimeout(100);await page.locator('#game').screenshot({path:new URL(`${type.name()}-${viewport.width}-${side<0?'left':'right'}-layout-assisted.png`,out).pathname});
  }
  await page.evaluate(()=>{const g=reactorGame,b=g.boss;g.player.hp=1;g.player.shield=0;b.reactor.broken=true;b.cover={x:432,y:343,width:88,until:b.age+.15};
   const c=document.getElementById('game').getContext('2d'),draw=c.fillText.bind(c);window.reactorTimerSample=null;
   c.fillText=(text,...args)=>{if(/^COVER /.test(text))window.reactorTimerSample={text,alpha:c.globalAlpha,font:c.font};return draw(text,...args);};
  });await page.waitForTimeout(100);
  const timer=await page.evaluate(()=>reactorTimerSample);assert.equal(timer.alpha,1,'active countdown stays opaque at expiry, including critical hull');assert.match(timer.font,/20px/);
  report.checks['criticalExpiryTimer-'+viewport.width]=timer;
  await page.screenshot({path:new URL(`${type.name()}-${viewport.width}-critical-expiry-assisted.png`,out).pathname});
 }
 const stores=await page.evaluate(()=>({career:JSON.parse(localStorage.getItem('2026-career')),high:localStorage.getItem('2026-high-score')}));assert.deepEqual(stores.career,{bossSeen:2});assert.equal(stores.high,null);report.checks.unrankedIsolation=stores;
 assert.deepEqual(report.errors,[]);
}finally{await browser.close();await writeFile(new URL(`${type.name()}-reactor-report.json`,out),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
