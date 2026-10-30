// Staged presentation fixtures; these captures make no campaign balance claim.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { actOf, actName, threatName } from '../src/timeline.js';
const origin = process.env.GAME_URL || 'http://127.0.0.1:4390/';
const out = new URL('../artifacts/act-one/', import.meta.url);
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
  assert.deepEqual([0, .14, .3, .58, .69].map(threatName), ['RISING', 'RISING', 'SEVERE', 'SEVERE', 'EXTREME']);
  await page.goto(origin); await page.locator('#enterHangarButton').click();
  for (let stage = 1; stage <= 4; stage++) assert.match(await page.locator(`[data-drill="${stage}"] span`).textContent(), new RegExp(actName(stage)));
  await page.setViewportSize({width:1440,height:1200}); await page.waitForTimeout(1400);
  await page.locator('.training-deck').scrollIntoViewIfNeeded(); await capture('hangar-drills'); await page.setViewportSize({width:1440,height:1000});
  await page.locator('#launchButton').click();
  // Hold exact intro times while the normal renderer/HUD/sequence loop runs.
  for (const [stage, time, name] of [[1,.75,'sector-1-act-i'],[1,1.65,'sector-1-shallows'],[2,1,'sector-2'],[3,1,'sector-3'],[4,1,'sector-4-act-ii']]) {
    await page.evaluate(({ stage, time }) => {
      const {game:g,sequences:s} = __qaAct;
      g._start(); g.stage=stage; g.stageTime=time; g.enemies=[]; g.bullets=[];
      g.update=()=>{g.events=[];}; s.reset(g);
    }, {stage,time});
    await page.waitForTimeout(100); await capture(name);
  }
  for (const [rank, label] of [[.14,'RISING'],[.58,'SEVERE'],[.7,'EXTREME']]) {
    await page.evaluate(rank=>{const g=__qaAct.game;g.stage=2;g.stageTime=20;g.threat=rank;},rank);
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#threatReadout').textContent(),label);
    assert.equal(await page.locator('body').getAttribute('data-rank'),label.toLowerCase());
  }
  await page.evaluate(() => { const g=__qaAct.game;g.stage=3;g.stageTime=90;g._transitionLength=8;g._transition=3;__qaAct.sequences.reset(g); });
  await page.waitForTimeout(100);await capture('act-ii-handoff');
  await page.evaluate(() => { const g=__qaAct.game;g.stage=2;g._transition=0;g.stageTime=20; });
  await page.locator('#pauseButton').click();
  assert.match(await page.locator('#holdSector').textContent(), /ACT I/);
  await page.waitForTimeout(800); await capture('pause-act-i'); await page.locator('#resumeButton').click();
  for (const stage of [2,4]) {
    await page.evaluate(stage => __qaAct.endSortie({outcome:'gameover',shipId:'kestrel',score:86120,grade:'C',stage,grazes:41,rolls:4,livesRemaining:0},true),stage);
    assert.match(await page.locator('#endIntroLine').textContent(),new RegExp('REACHED '+actName(stage)));
    await page.waitForTimeout(700); await capture('debrief-act-'+actOf(stage));
    await page.locator('#skipCinemaButton').click();
    assert.match(await page.locator('#endEyebrow').textContent(),new RegExp('REACHED '+actName(stage)));
    await page.waitForTimeout(1900);await capture('flight-record-act-'+actOf(stage));
  }
  assert.deepEqual(report.errors, []);
} finally {
  await browser.close(); await writeFile(new URL('presentation-qa.json', out),JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report,null,2));
