import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
const type=process.env.QA_BROWSER==='firefox'?firefox:chromium;
const origin=process.env.GAME_URL||'http://127.0.0.1:4173/',out=new URL('../artifacts/lance/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await type.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||process.env.CHROMIUM_EXECUTABLE||undefined,args:type===chromium?['--no-sandbox']:[]});
const report={origin,browser:type.name(),errors:[],method:'Assisted bossSeen3 access only for ordinary Manta Crown drill. Actual pointer/fire/Shift controls, normal timing/damage/resources/collision. Read-only telemetry guides lane escape; this is not human validation. Separate stopped-clock critical layout fixtures are labeled.',samples:[],checks:{}};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/src/main.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nwindow.lanceGame=game;'});});
 await page.addInitScript(()=>{localStorage.setItem('2026-career',JSON.stringify({bossSeen:3}));localStorage.setItem('2026-settings',JSON.stringify({music:0,effects:80,ambience:60}));});
 await page.goto(origin);await page.locator('#enterHangarButton').click();await page.locator('[data-ship="manta"]').click();await page.locator('[data-drill="3"]').click();
 const box=await page.locator('#game').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height*750/900);await page.mouse.down();await page.keyboard.down('Shift');
 let locked=false,fired=false,paused=false,finish=null;
 for(let i=0;i<600;i++){
  const s=await page.evaluate(()=>({time:lanceGame.time,mode:lanceGame.mode,player:{x:lanceGame.player.x,y:lanceGame.player.y,hp:lanceGame.player.hp,lives:lanceGame.player.lives},boss:lanceGame.boss?{x:lanceGame.boss.x,age:lanceGame.boss.age,phase:lanceGame.boss.phase,lance:lanceGame.boss.lance}:null,stats:{...lanceGame.stats},summary:lanceGame.summary}));
  report.samples.push(s);if(s.mode!=='playing'){finish=s;break;}
  const l=s.boss?.lance,age=s.boss?.age;
  let x=s.boss?.x||270;
  if(l&&!l.cancelled&&age>=l.startsAt&&age<l.endsAt){
   if(!l.locked)x=s.player.x;
   else if(Math.abs(x-l.x)<75)x=Math.max(52,Math.min(488,l.x+(s.player.x<l.x?-105:105)));
   if(l.locked&&!locked){locked=true;await page.locator('#game').screenshot({path:new URL(type.name()+'-locked-ordinary-input.png',out).pathname});}
   if(l.active&&!fired){fired=true;await page.locator('#game').screenshot({path:new URL(type.name()+'-firing-ordinary-input.png',out).pathname});}
   if(l.locked&&!paused){await page.mouse.up();await page.keyboard.up('Shift');await page.keyboard.press('Escape');const ageBefore=await page.evaluate(()=>lanceGame.boss.age);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>lanceGame.boss.age),ageBefore);await page.locator('#resumeButton').click();paused=true;await page.mouse.move(box.x+box.width*s.player.x/540,box.y+box.height*750/900);await page.mouse.down();await page.keyboard.down('Shift');}
  }
  await page.mouse.move(box.x+box.width*x/540,box.y+box.height*750/900);await page.waitForTimeout(100);
 }
 await page.mouse.up();await page.keyboard.up('Shift');assert.ok(finish);assert.equal(finish.mode,'victory','ordinary aimed lane escapes retain a complete Crown route');assert.ok(locked&&fired&&paused);
 report.checks.normalCrown=finish;report.checks.lockFirePause=true;
 const stores=await page.evaluate(()=>({career:JSON.parse(localStorage.getItem('2026-career')),high:localStorage.getItem('2026-high-score')}));assert.deepEqual(stores.career,{bossSeen:3});assert.equal(stores.high,null);report.checks.unrankedIsolation=stores;
 if(await page.locator('#skipCinemaButton').isVisible())await page.locator('#skipCinemaButton').click();
 await page.locator('#changeShipButton').click();await page.locator('[data-drill="3"]').click();
 for(const viewport of [{width:320,height:568},{width:844,height:390}]){
  await page.setViewportSize(viewport);
  await page.evaluate(()=>{const g=lanceGame;g.startDrill(3);const b=g.boss;b.phase=2;b.age=12;b.hp=b.maxHp*.5;b.fireAt=999;g._updateEnemies(0);b.age=b.lance.locksAt;g._updateBossLance(b);g.player.hp=1;g.player.invuln=999;g.update=()=>{g.events=[]};});
  await page.waitForTimeout(100);
  const layout=await page.evaluate(()=>({signal:document.getElementById('flightSignal').textContent,canvas:document.getElementById('game').getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll('.touch-controls button')].map(b=>b.getBoundingClientRect().toJSON()),width:document.documentElement.scrollWidth}));
  assert.match(layout.signal,/CRITICAL.*LANCE LOCKED/);assert.equal(layout.width,viewport.width);assert.ok(layout.canvas.bottom<=viewport.height);assert.ok(layout.buttons.every(b=>b.height>=44&&b.bottom<=viewport.height));
  report.checks['criticalLocked-'+viewport.width]=layout;await page.screenshot({path:new URL(`${type.name()}-${viewport.width}-critical-locked-assisted.png`,out).pathname});
  await page.evaluate(()=>{const b=lanceGame.boss;b.age=b.lance.firesAt;lanceGame._updateBossLance(b);});await page.waitForTimeout(80);
  assert.match(await page.locator('#flightSignal').textContent(),/LANCE FIRING/);await page.screenshot({path:new URL(`${type.name()}-${viewport.width}-critical-firing-assisted.png`,out).pathname});
 }
 assert.deepEqual(report.errors,[]);
}finally{await browser.close();await writeFile(new URL(type.name()+'-report.json',out),JSON.stringify(report,null,2));}
console.log(JSON.stringify({browser:report.browser,errors:report.errors,checks:report.checks},null,2));
