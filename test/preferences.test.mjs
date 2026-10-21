import test from 'node:test';
import assert from 'node:assert/strict';
import {HUD} from '../src/ui.js';
import {readSettings,writeSettings} from '../src/settings.js';

test('terminal high score flushes immediately and preserves a newer score from another tab',()=>{
  const previous=globalThis.localStorage,values=new Map([['2026-high-score','50']]);
  globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  try{
    const hud=new HUD(null);hud.saveHighScore(22000);assert.equal(values.get('2026-high-score'),'22000');
    values.set('2026-high-score','30000');hud.saveHighScore(100);assert.equal(values.get('2026-high-score'),'30000');
  }finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});
test('preferences reject malformed values and tolerate denied storage',()=>{
  const storage={getItem:()=>JSON.stringify({music:999,effects:-5,autoFire:'yes',hitbox:false}),setItem:()=>{throw Error('denied')}};
  const settings=readSettings(storage);assert.equal(settings.music,100);assert.equal(settings.effects,0);
  assert.equal(settings.autoFire,false);assert.equal(settings.hitbox,false);assert.doesNotThrow(()=>writeSettings(settings,storage));
  assert.equal(readSettings({getItem:()=>'{broken'}).music,80);
});

test('system reduced motion survives unavailable or corrupt storage, with explicit boolean overrides',()=>{
  const previous=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:true});
  try{
    for(const storage of [{getItem:()=>{throw Error('denied')}},{getItem:()=>'{broken'},{getItem:()=> 'null'},{getItem:()=> '"invalid"'},{getItem:()=>'{"reducedEffects":"invalid"}'}]){
      assert.equal(readSettings(storage).reducedEffects,true);
    }
    assert.equal(readSettings({getItem:()=>'{"reducedEffects":false}'}).reducedEffects,false,'explicit saved choice overrides the system default');
    assert.equal(readSettings({getItem:()=>'{"reducedEffects":true}'}).reducedEffects,true);
  }finally{if(previous===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=previous;}
});
