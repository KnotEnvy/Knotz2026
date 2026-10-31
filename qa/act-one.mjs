// Staged presentation fixtures; these captures make no campaign balance claim.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { actOf, actName, threatName } from '../src/timeline.js';
const origin = process.env.GAME_URL || 'http://127.0.0.1:4173/';
const out = new URL((process.env.QA_OUTPUT || '../artifacts/act-one').replace(/\/?$/, '/'), import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const report = { origin, errors: [], captures: [], staged: true };
page.on('pageerror', e => report.errors.push(e.message));
await page.route('**/src/main.js', async route => {
  const response = await route.fetch();
  await route.fulfill({ response, body: await response.text() + '\nwindow.__qaAct={game,sequences,renderer,endSortie};' });
});
async function capture(name) {
  await page.screenshot({ path: new URL(name + '.png', out).pathname }); report.captures.push(name + '.png');
}
try {
  assert.deepEqual([1, 2, 3, 4].map(actOf), [1, 1, 1, 2]);
  assert.deepEqual([0, .14, .3, .58, .60, .67, .69, .7].map(threatName), ['RISING', 'RISING', 'HIGH', 'HIGH', 'HIGH', 'HIGH', 'HIGH', 'EXTREME']);
  await page.goto(origin); await page.locator('#enterHangarButton').click();
  for (let stage = 1; stage <= 4; stage++) assert.match(await page.locator(`[data-drill="${stage}"] span`).textContent(), new RegExp(actName(stage)));
  await page.setViewportSize({width:1440,height:1200}); await page.waitForTimeout(1400);
  await page.locator('.training-deck').scrollIntoViewIfNeeded(); await capture('hangar-drills'); await page.setViewportSize({width:1440,height:1000});
  await page.locator('#launchButton').click();
  // Hold exact intro times while the normal renderer/HUD/sequence loop runs.
  for (const [stage, time, name] of [[1,.75,'sector-1-act-i'],[1,1.4,'sector-1-mid-wipe'],[1,2.08,'sector-1-shallows'],[2,1,'sector-2'],[3,1,'sector-3'],[4,1,'sector-4-act-ii']]) {
    await page.evaluate(({ stage, time }) => {
      const {game:g,sequences:s} = __qaAct;
      g._start(); g.stage=stage; g.stageTime=time; g.enemies=[]; g.bullets=[];
      g.update=()=>{g.events=[];}; s.reset(g);
    }, {stage,time});
    await page.waitForTimeout(100); await capture(name);
  }
  for (const [rank, label] of [[.14,'RISING'],[.67,'HIGH'],[.7,'EXTREME']]) {
    await page.evaluate(rank=>{const g=__qaAct.game;g.stage=2;g.stageTime=20;g.threat=rank;},rank);
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#threatReadout').textContent(),label);
    assert.equal(await page.locator('body').getAttribute('data-rank'),label.toLowerCase());
  }
  await page.evaluate(() => {
    const {game:g,sequences:s}=__qaAct;
    g.stage=3;g.stageTime=90;g._transitionLength=6.5;g._transition=1.2;g.boss=null;
    s.reset(g);s.down=s.tally(g);
    window.__qaActTwoDraws=0;
    const draw=s.drawActTwo.bind(s);
    s.drawActTwo=(...args)=>{if(args[1]>0&&args[1]<args[2])window.__qaActTwoDraws++;return draw(...args);};
  });
  await page.waitForTimeout(100);
  assert.ok(await page.evaluate(()=>__qaActTwoDraws>0),'ACT II card must actually draw during the handoff');
  await capture('act-ii-handoff');
  await page.evaluate(() => { const g=__qaAct.game;g.stage=2;g._transition=0;g.stageTime=20; });
  await page.locator('#pauseButton').click();
  assert.match(await page.locator('#holdSector').textContent(), /ACT I/);
  await page.waitForTimeout(800); await capture('pause-act-i'); await page.locator('#resumeButton').click();
  // Freeze a real scored squadron event long enough to inspect its popup.
  await page.evaluate(()=>{
    const {game:g,renderer:r,sequences:s}=__qaAct;g.stage=1;g.stageTime=20;s.reset(g);
    g.events=[{type:'squadronBonus',x:270,y:420,value:5,points:750,drops:0}];
    r.draw(g,0);g.events=[];
    for(const fx of r.impacts)if(fx.type==='squadronBonus')fx.age=.2;
    const draw=r.draw.bind(r);r.draw=(game)=>draw(game,0);
  });
  await page.waitForTimeout(100);await capture('squadron-points');
  assert.ok(await page.evaluate(()=>__qaAct.renderer.impacts.some(f=>f.type==='squadronBonus'&&f.points===750&&f.drops===0)));
  // Victory copy follows src/cinema.js: a summary that clears sector N (4 or 5) reads
  // "SECTOR 0N CLEARED / ACT II CONTINUES"; the campaign victory after sector 6
  // (THE SOVEREIGN, CAMPAIGN_STAGES = 6) reads ACT II COMPLETE.
  for (const [stage,outcome,name,record] of [[2,'gameover','act-1','ACT I · SECTOR 02'],[4,'gameover','act-2','REACHED ACT II'],
    [4,'victory','victory','SECTOR 04 CLEARED / ACT II CONTINUES'],[5,'victory','victory-s5','SECTOR 05 CLEARED / ACT II CONTINUES'],
    [6,'victory','victory-s6','ACT II COMPLETE \/ ACT III AWAITS']]) {
    await page.evaluate(({stage,outcome}) => __qaAct.endSortie({outcome,shipId:'kestrel',score:86120,grade:'C',stage,grazes:41,rolls:4,livesRemaining:outcome==='victory'?3:0},true),{stage,outcome});
    assert.match(await page.locator('#endIntroLine').textContent(),new RegExp(record));
    await page.waitForTimeout(700); await capture('debrief-'+name);
    await page.locator('#skipCinemaButton').click();
    assert.match(await page.locator('#endEyebrow').textContent(),new RegExp(record+'$'));
    assert.equal((await page.locator('#endEyebrow').textContent()).split(' / ').length,2+record.split(' / ').length,'record must replace the previous sortie suffix');
    await page.waitForTimeout(1900);await capture('flight-record-'+name);
  }
  assert.deepEqual(report.errors, []);
} finally {
  await browser.close(); await writeFile(new URL('presentation-qa.json', out),JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report,null,2));
