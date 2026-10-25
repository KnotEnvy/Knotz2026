import { Game } from './game.js';
import { Renderer } from './render.js';
import { HUD } from './ui.js';
import { AudioEngine } from './audio.js';
import { loadArt } from './art.js';
import { SHIPS, SHIP_ORDER, SPECIAL_LABELS } from './ships.js';
import { FrontEnd } from './frontend.js';
import { PausePanel } from './pause.js';
import { Sequences } from './sequences.js';
import { Cinema } from './cinema.js';
import { Ambience } from './ambience.js';
import { bossWarningProgress, interludeProgress } from './timeline.js';
import { readSettings, writeSettings } from './settings.js';
import { readProgress, saveProgress, markEncounter, recordFlight, flightAdvice, readDrillRecords, recordDrill, flightTime, drillClearTier } from './progress.js';

const artLoaded=await loadArt((loaded,total)=>{
  const bar=document.getElementById('assetProgress');if(bar)bar.value=loaded/total;
});
document.getElementById('assetLoading')?.remove();
if(!artLoaded)document.getElementById('assetWarning').hidden=false;

const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d', { alpha:false });
const game = new Game();
try { game.best = Math.max(game.best || 0, Number(localStorage.getItem('2026-high-score')) || 0); } catch {}
const renderer = new Renderer(canvas);
const hud = new HUD(canvas);
const audio = new AudioEngine();
// Presentation modules. Each owns one screen or layer; main.js only calls their hooks.
const frontEnd = new FrontEnd();
const pausePanel = new PausePanel();
const sequences = new Sequences();
const cinema = new Cinema();
const ambience = new Ambience();
const settings=readSettings();
const career=readProgress();
const drillRecords=readDrillRecords();
let selectedDrill=0,lastPersonalRecord=null;
function applySettings(){
  renderer.reducedEffects=settings.reducedEffects;renderer.showHitbox=settings.hitbox;
  hud.reducedEffects=settings.reducedEffects;
  for(const module of [frontEnd,pausePanel,sequences,cinema,ambience])module.reducedEffects=settings.reducedEffects;
  audio.setLevels(settings.music/100,settings.effects/100,settings.ambience/100);
  writeSettings(settings);
}
applySettings();
function updateLayout(){hud.compact=matchMedia('(max-width:740px), (pointer:coarse), (max-height:540px) and (orientation:landscape)').matches;document.body.classList.toggle('compact-controls',hud.compact);renderer.compactLabels=hud.compact;sequences.compact=hud.compact;hud.layerReady=false;}
updateLayout();window.addEventListener('resize',updateLayout);
let selectedShip = SHIP_ORDER.includes(game.shipId) ? game.shipId : 'kestrel';
let screen = 'title';
let manualOrigin = null;
let manualSuspended = false;
let manualPadTimer=null;
let endStarted = 0;
let endData = null;
let endIntroTimer = null;
let outroUntil = 0; // performance.now() deadline while the in-flight outro plays after a run ends
let navTime = -1e9; // last Tab press, so keyboard focus moves get an interface cue
let pointerId = null;
let pointerOrigin=null;
let touchFocusHeld = false;
let padStartHeld = false, padAcceptHeld = false, padBackHeld = false, padHorizontalHeld = false;
let padBombHeld = false, padRollHeld = false, activePadIndex = null;
let last = performance.now(), fpsFrames=0, fpsTime=0, titleFrame=0, endFrame=0;
let frameHandle = null, frameHandleType = null;
const held = new Set();
const input = {left:false,right:false,up:false,down:false,fire:false,focus:false,bomb:false,roll:false,start:false,pause:false,pointerX:270,pointerY:700,pointerActive:false};
const keyboardInput = {left:false,right:false,up:false,down:false,fire:false,focus:false,bomb:false,roll:false};
const touchInput = {focus:false,bomb:false,roll:false};
const padInput = {left:false,right:false,up:false,down:false,fire:false,focus:false,bomb:false,roll:false};
const padPressed = {bomb:false,roll:false};
const oneShot = new Set(['bomb','roll','start','pause']);
const keyMap = {ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',Space:'fire',KeyZ:'fire',ShiftLeft:'focus',ShiftRight:'focus',KeyX:'bomb',KeyC:'roll',Enter:'start',KeyP:'pause',Escape:'pause'};
const screens = {title:$('titleScreen'),hangar:$('hangarScreen'),play:$('playScreen'),pause:$('pauseScreen'),end:$('endScreen')};
const readouts = Object.create(null);
function setText(id,value){ if(readouts[id]!==value){ readouts[id]=value; $(id).textContent=value; } }
function clearInput(){
  held.clear();pointerId=null;touchFocusHeld=false;
  for(const source of [input,keyboardInput,touchInput,padInput,padPressed]){
    for(const key of Object.keys(source))if(typeof source[key]==='boolean')source[key]=false;
  }
  padStartHeld=false;padAcceptHeld=false;padBackHeld=false;padHorizontalHeld=false;padBombHeld=false;padRollHeld=false;
  input.moveX=input.moveY=padInput.moveX=padInput.moveY=0;
}
function composeInput(){
  for(const key of ['left','right','up','down','fire','focus']){
    input[key]=keyboardInput[key]||touchInput[key]||padInput[key]||(key==='fire'&&pointerId!==null);
  }
  input.bomb=keyboardInput.bomb||touchInput.bomb||padPressed.bomb;
  input.roll=keyboardInput.roll||touchInput.roll||padPressed.roll;
  input.moveX=padInput.moveX||0;input.moveY=padInput.moveY||0;
  if(settings.autoFire)input.fire=true;
}
function renderGameFrame(){renderer.draw(game,0);hud.draw(game,0,ctx);}
function focusForScreen(next){
  const focusTargets={title:$('enterHangarButton'),hangar:document.querySelector('.ship-card[data-ship="'+selectedShip+'"]'),play:canvas,pause:$('resumeButton'),end:$('skipCinemaButton')};
  const target=focusTargets[next];
  if(target&&typeof target.focus==='function')target.focus({preventScroll:true});
}
function showScreen(next){
  stopFrameLoop();
  if(screen==='pause'&&next!=='pause')pausePanel.close();
  last=performance.now();
  screen=next;$('app').dataset.screen=next;
  for(const [name,node] of Object.entries(screens))node.hidden=!(name===next||(name==='play'&&next==='pause'));
  focusForScreen(next);
  frontEnd.enter(next);ambience.setScreen(next);audio.setScreen(next);
  if(next==='pause'&&!document.hidden)renderGameFrame();
  if(next==='pause')pausePanel.open(game,{shipId:selectedShip,ship:SHIPS[selectedShip],drill:selectedDrill,career,compact:hud.compact});
  if(next==='pause'||next==='end')audio.update(game,0);
  window.scrollTo(0,0);
  requestAnimationFrame(()=>window.scrollTo(0,0));
  scheduleFrame();
}
function unlock(){audio.unlock();}
function chooseShip(id){
  if(!SHIPS[id])return;
  if(id!==selectedShip)audio.ui('select');
  selectedShip=id;
  for(const card of document.querySelectorAll('.ship-card')){
    const on=card.dataset.ship===id;
    card.classList.toggle('selected',on);
    card.setAttribute('aria-checked',String(on));
    card.tabIndex=on?0:-1;
  }
  const data=SHIPS[id];
  setText('shipName',data.name);setText('shipClass',data.role);setText('shipModel',data.code+' / '+data.name);
  setText('shipDescription',data.description);setText('activeShipLabel',data.name+' / '+data.code);
  setText('specialControlLabel',SPECIAL_LABELS[id]+' SPECIAL');
  setText('touchBomb',SPECIAL_LABELS[id]);
  $('speedMeter').style.setProperty('--meter',data.speed+'%');
  $('fireMeter').style.setProperty('--meter',data.fire+'%');
  $('hullMeter').style.setProperty('--meter',data.hull+'%');
  updateCareerDisplay();
  frontEnd.selectShip(id);
}
function updateCareerDisplay(){
  const record=career.ships[selectedShip];
  setText('shipRecord',record.sorties?String(record.bestScore).padStart(8,'0')+' / '+record.bestClears+' SECTORS':'YOUR FIRST SORTIE AWAITS');
  for(const badge of document.querySelectorAll('[data-mastery]')){
    const earned=record.bestClears>=Number(badge.dataset.mastery);
    badge.classList.toggle('earned',earned);badge.setAttribute('aria-label',badge.textContent+(earned?' cleared':' not yet cleared'));
  }
  for(const button of document.querySelectorAll('[data-drill]')){
    const locked=Number(button.dataset.drill)>career.bossSeen;button.disabled=locked;
    const best=drillRecords[selectedShip+'-'+button.dataset.drill];
    button.querySelector('small').textContent=locked?'ENCOUNTER TO UNLOCK':best?'BEST '+flightTime(best.bestTime)+' / '+best.fewestHits+' HITS':'UNRANKED / FULL WEAPONS';
  }
}
function enterHangar(){if(screen==='title'||screen==='end'||screen==='pause'){clearInput();audio.ui(screen==='title'?'confirm':'back');showScreen('hangar');}}
function selectInDirection(delta){
  const index=SHIP_ORDER.indexOf(selectedShip);
  chooseShip(SHIP_ORDER[(index+delta+SHIP_ORDER.length)%SHIP_ORDER.length]);
  document.querySelector('.ship-card[data-ship="'+selectedShip+'"]').focus({preventScroll:true});
}
function launch(initialFire=false,drillStage=screen==='hangar'?0:selectedDrill){
  unlock();audio.ui('launch');clearInput();renderer.impacts.length=0;hud.bannerTime=0;hud.encounterTime=0;outroUntil=0;
  selectedDrill=Math.max(0,Math.min(career.bossSeen,Number(drillStage)||0));lastPersonalRecord=null;
  if(game.mode!=='title')game.reset();
  if(typeof game.selectShip==='function')game.selectShip(selectedShip);
  if(selectedDrill)game.startDrill(selectedDrill);
  else{game.update(0,{});game.update(0,{start:true});}
  sequences.reset(game);ambience.reset(game);
  setText('retryPauseButton',selectedDrill?'RESTART DRILL':'RESTART SORTIE');
  if(initialFire===true){held.add('Space');keyboardInput.fire=true;}
  showScreen('play');
  renderGameFrame();audio.update(game,0);
}
function setGamePaused(paused){
  const currentlyPaused=game.mode==='paused';
  if(currentlyPaused===paused)return;
  game.update(0,{});
  game.update(0,{pause:true});
  game.update(0,{});
}
function pause(){
  if(screen!=='play'||game.mode!=='playing')return;
  setGamePaused(true);
  clearInput();audio.ui('pause');audio.update(game,0);showScreen('pause');
}
function resume(){
  if(screen!=='pause')return;
  setGamePaused(false);
  clearInput();audio.ui('resume');audio.update(game,0);showScreen('play');
}
function focusableIn(container){
  return [...container.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter(node=>node.tabIndex>=0&&!node.hidden&&!node.closest('[inert]')&&node.getClientRects().length>0);
}
function trapTab(e,container){
  const items=focusableIn(container);
  if(!items.length){e.preventDefault();return;}
  const first=items[0],last=items[items.length-1],active=document.activeElement;
  if(!container.contains(active)){e.preventDefault();(e.shiftKey?last:first).focus();return;}
  if(e.shiftKey&&active===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&active===last){e.preventDefault();first.focus();}
}
function openManual(){
  const dialog=$('manualDialog');
  if(!dialog.hidden)return;
  manualOrigin=document.activeElement;
  manualSuspended=screen==='play'&&game.mode==='playing';
  if(manualSuspended){setGamePaused(true);clearInput();audio.update(game,0);}
  dialog.hidden=false;
  audio.ui('open');
  $('closeManualButton').focus({preventScroll:true});
  stopFrameLoop();
  manualPadTimer=setInterval(readGamepad,80);
}
function closeManual(){
  const dialog=$('manualDialog');
  if(dialog.hidden)return;
  dialog.hidden=true;
  audio.ui('close');
  clearInterval(manualPadTimer);manualPadTimer=null;
  if(manualSuspended&&screen==='play'){
    setGamePaused(false);audio.update(game,0);
  }
  manualSuspended=false;
  const origin=manualOrigin;manualOrigin=null;
  if(screen==='play')canvas.focus({preventScroll:true});
  else if(origin&&origin.isConnected&&typeof origin.focus==='function')origin.focus({preventScroll:true});
  scheduleFrame();
}
function isGlobalShortcutTarget(target){return target===document.body||target===canvas;}
function onKeyDown(e){
  if(e.code==='Tab')navTime=performance.now();
  if(!keyMap[e.code]&&e.code!=='Tab')return;
  const manual=$('manualDialog');
  if(!manual.hidden){
    if(e.code==='Tab'){trapTab(e,manual);return;}
    if(e.code==='Escape'){e.preventDefault();closeManual();}
    return;
  }
  if(e.code==='Tab'&&screen==='pause'){trapTab(e,screens.pause);return;}
  if(screen==='pause'&&(e.code==='Escape'||e.code==='KeyP')){e.preventDefault();if(!e.repeat)resume();return;}
  const focusedShip=e.target instanceof Element?e.target.closest('.ship-card'):null;
  if(screen==='hangar'&&focusedShip&&['ArrowLeft','ArrowUp','KeyA','KeyW','ArrowRight','ArrowDown','KeyD','KeyS'].includes(e.code)){
    e.preventDefault();
    if(!e.repeat)selectInDirection(['ArrowLeft','ArrowUp','KeyA','KeyW'].includes(e.code)?-1:1);
    return;
  }
  if(screen==='hangar'&&focusedShip&&e.code==='Enter'){e.preventDefault();if(!e.repeat)launch(false,0);return;}
  if(!isGlobalShortcutTarget(e.target))return;
  if(screen==='title'){
    if(e.code==='Enter'||e.code==='Space'){e.preventDefault();if(!e.repeat)enterHangar();}
    return;
  }
  if(screen==='hangar'){
    if(['ArrowLeft','ArrowUp','KeyA','KeyW'].includes(e.code)){e.preventDefault();if(!e.repeat)selectInDirection(-1);}
    else if(['ArrowRight','ArrowDown','KeyD','KeyS'].includes(e.code)){e.preventDefault();if(!e.repeat)selectInDirection(1);}
    else if(e.code==='Enter'||e.code==='Space'){e.preventDefault();if(!e.repeat)launch(e.code==='Space');}
    else if(e.code==='Escape'){e.preventDefault();audio.ui('back');showScreen('title');}
    return;
  }
  if(screen==='end'){
    if(e.code==='Enter'||e.code==='Space'){
      e.preventDefault();
      if(!e.repeat){if($('endScreen').classList.contains('cinema-intro')){audio.ui('skip');dismissEndIntro();}else launch(e.code==='Space');}
    }else if(e.code==='Escape'){e.preventDefault();enterHangar();}
    return;
  }
  if(screen==='pause'){
    if(e.code==='Enter'&&!e.repeat){e.preventDefault();resume();}
    return;
  }
  if(screen!=='play')return;
  if(outroUntil){e.preventDefault();if(e.code==='Enter'&&!e.repeat){sequences.skipOutro();outroUntil=Math.min(outroUntil,performance.now());}return;}
  const action=keyMap[e.code];
  if(!action)return;
  e.preventDefault();
  unlock();
  if(action==='pause'){if(!held.has(e.code))pause();held.add(e.code);return;}
  if(oneShot.has(action)&&!held.has(e.code))keyboardInput[action]=true;
  held.add(e.code);
  if(!oneShot.has(action))keyboardInput[action]=true;
}
function onKeyUp(e){
  const action=keyMap[e.code];
  if(!action)return;
  if(screen==='play'&&isGlobalShortcutTarget(e.target))e.preventDefault();
  held.delete(e.code);
  if(!oneShot.has(action))keyboardInput[action]=[...held].some(code=>keyMap[code]===action);
}
window.addEventListener('keydown',onKeyDown);
window.addEventListener('keyup',onKeyUp);
window.addEventListener('blur',()=>{
  clearInput();
  if(screen==='play'&&game.mode==='playing')pause();
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    clearInput();
    if(screen==='play'&&game.mode==='playing')pause();
    stopFrameLoop();
  }else{
    last=performance.now();
    if(screen==='pause'&&!manualSuspended)renderGameFrame();
    scheduleFrame();
  }
});
function pointerPosition(e){
  const rect=canvas.getBoundingClientRect();
  const x=(e.clientX-rect.left)*540/rect.width,y=(e.clientY-rect.top)*900/rect.height;
  if(e.pointerType==='touch'&&pointerOrigin){
    input.pointerX=pointerOrigin.playerX+(x-pointerOrigin.x);input.pointerY=pointerOrigin.playerY+(y-pointerOrigin.y);
  }else{input.pointerX=Math.max(0,Math.min(540,x));input.pointerY=Math.max(0,Math.min(900,y));}
}
canvas.addEventListener('pointerdown',e=>{
  if(screen!=='play')return;
  e.preventDefault();unlock();pointerId=e.pointerId;canvas.setPointerCapture(e.pointerId);
  canvas.focus({preventScroll:true});
  const rect=canvas.getBoundingClientRect();
  pointerOrigin={x:(e.clientX-rect.left)*540/rect.width,y:(e.clientY-rect.top)*900/rect.height,playerX:game.player.x,playerY:game.player.y};
  pointerPosition(e);input.pointerActive=true;
});
canvas.addEventListener('pointermove',e=>{if(e.pointerId===pointerId)pointerPosition(e);});
for(const event of ['pointerup','pointercancel'])canvas.addEventListener(event,e=>{if(e.pointerId===pointerId){pointerId=null;input.pointerActive=false;}});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
function touchButton(id,action){
  const el=$(id);
  el.addEventListener('pointerdown',e=>{e.preventDefault();unlock();el.setPointerCapture(e.pointerId);touchInput[action]=true;if(action==='focus')touchFocusHeld=true;});
  for(const type of ['pointerup','pointercancel'])el.addEventListener(type,e=>{e.preventDefault();if(!oneShot.has(action))touchInput[action]=false;if(action==='focus')touchFocusHeld=false;});
}
touchButton('touchFocus','focus');touchButton('touchBomb','bomb');touchButton('touchRoll','roll');
$('touchPause').addEventListener('click',pause);
$('pauseButton').addEventListener('click',pause);
$('pauseOptionsButton').addEventListener('click',openManual);
$('pauseSoundButton').addEventListener('click',()=>soundButton.click());
$('resumeButton').addEventListener('click',resume);
$('retryPauseButton').addEventListener('click',launch);
$('changeShipPauseButton').addEventListener('click',()=>{game.reset();enterHangar();});
$('enterHangarButton').addEventListener('click',enterHangar);
$('hangarBackButton').addEventListener('click',()=>{audio.ui('back');showScreen('title');});
$('launchButton').addEventListener('click',launch);
for(const button of document.querySelectorAll('[data-drill]'))button.addEventListener('click',()=>launch(false,Number(button.dataset.drill)));
$('retryButton').addEventListener('click',launch);
$('skipCinemaButton').addEventListener('click',()=>{audio.ui('skip');dismissEndIntro();});
$('changeShipButton').addEventListener('click',enterHangar);
for(const card of document.querySelectorAll('.ship-card'))card.addEventListener('click',()=>chooseShip(card.dataset.ship));
$('helpButton').addEventListener('click',openManual);
$('closeManualButton').addEventListener('click',closeManual);
$('manualDoneButton').addEventListener('click',closeManual);
$('manualDialog').addEventListener('click',e=>{if(e.target===$('manualDialog'))closeManual();});
for(const key of ['music','effects','ambience','autoFire','reducedEffects','hitbox']){
  const control=$('setting-'+key);
  if(control.type==='checkbox')control.checked=settings[key];else control.value=settings[key];
  const output=$('value-'+key);if(output)output.textContent=settings[key]+'%';
  control.addEventListener('input',()=>{
    settings[key]=control.type==='checkbox'?control.checked:Number(control.value);
    if(output)output.textContent=settings[key]+'%';
    applySettings();audio.ui('tick');
  });
}
const soundButton=$('soundButton');
soundButton.addEventListener('click',()=>{
  unlock();audio.toggleMute();soundButton.textContent=audio.muted?'◖ SOUND OFF':'◖ SOUND ON';
  soundButton.setAttribute('aria-label',audio.muted?'Unmute sound':'Mute sound');
  try{localStorage.setItem('2026-muted',audio.muted?'1':'0');}catch{}
  if(screen==='play')canvas.focus({preventScroll:true});
});
try{if(localStorage.getItem('2026-muted')==='1'){audio.toggleMute();soundButton.textContent='◖ SOUND OFF';soundButton.setAttribute('aria-label','Unmute sound');}}catch{}
  soundButton.dataset.state=audio.muted?'OFF':'ON';
soundButton.addEventListener('click',()=>{soundButton.dataset.state=audio.muted?'OFF':'ON';setText('pauseSoundButton',audio.muted?'UNMUTE SOUND':'MUTE SOUND');});
setText('pauseSoundButton',audio.muted?'UNMUTE SOUND':'MUTE SOUND');
function clearPadInput(){
  for(const key of Object.keys(padInput))padInput[key]=false;
  padPressed.bomb=false;padPressed.roll=false;
  padStartHeld=false;padAcceptHeld=false;padBackHeld=false;padHorizontalHeld=false;padBombHeld=false;padRollHeld=false;
  activePadIndex=null;
  padInput.moveX=padInput.moveY=0;
}
function readGamepad(){
  const pads=navigator.getGamepads?.();
  const pad=pads?Array.from(pads).find(candidate=>candidate&&candidate.connected!==false):null;
  if(!pad){clearPadInput();return;}
  if(activePadIndex!==pad.index){
    for(const key of Object.keys(padInput))padInput[key]=false;
    padPressed.bomb=false;padPressed.roll=false;
    padStartHeld=false;padAcceptHeld=false;padBackHeld=false;padHorizontalHeld=false;padBombHeld=false;padRollHeld=false;
    activePadIndex=pad.index;
  }
  const x=Number(pad.axes?.[0])||0,y=Number(pad.axes?.[1])||0;
  const magnitude=Math.hypot(x,y),strength=Math.min(1,Math.max(0,(magnitude-.18)/.82));
  const b=i=>!!pad.buttons?.[i]?.pressed;
  const accept=b(0)||b(9),back=b(1),start=b(9);
  const horizontal=x>.45||b(15)?1:x<-.45||b(14)?-1:y>.45||b(13)?1:y<-.45||b(12)?-1:0;
  if(!$('manualDialog').hidden){
    const active=document.activeElement;
    if((x>.45||x<-.45||b(14)||b(15))&&active?.type==='range'&&!padHorizontalHeld){
      active.value=Math.max(0,Math.min(100,Number(active.value)+(x>0||b(15)?5:-5)));active.dispatchEvent(new Event('input',{bubbles:true}));
    }else if(horizontal&&!padHorizontalHeld){
      const items=focusableIn($('manualDialog')),index=items.indexOf(active);
      items[(index+horizontal+items.length)%items.length]?.focus();
    }
    if(accept&&!padAcceptHeld)active?.click();
    if(back&&!padBackHeld)closeManual();
  }else if(screen==='title'){
    if(accept&&!padAcceptHeld){unlock();enterHangar();}
  }else if(screen==='hangar'){
    const vertical=y>.45||b(13)?1:y<-.45||b(12)?-1:0;
    const active=document.activeElement;
    if(horizontal&&!padHorizontalHeld){
      if(!vertical&&active?.closest('.ship-card'))selectInDirection(horizontal);
      else{
        const items=focusableIn(screens.hangar),index=items.indexOf(active);
        items[(index+horizontal+items.length)%items.length]?.focus();
      }
    }
    if(accept&&!padAcceptHeld){unlock();if(start||active?.closest('.ship-card'))launch();else active?.click();}
    if(back&&!padBackHeld)showScreen('title');
  }else if(screen==='end'){
    if(accept&&!padAcceptHeld){
      unlock();
      if($('endScreen').classList.contains('cinema-intro'))dismissEndIntro();else launch();
    }
    if(back&&!padBackHeld)enterHangar();
  }else if(screen==='pause'){
    if(horizontal&&!padHorizontalHeld){
      const items=focusableIn(screens.pause),index=items.indexOf(document.activeElement);
      items[(index+horizontal+items.length)%items.length]?.focus();
    }
    if(start&&!padStartHeld||back&&!padBackHeld)resume();
    else if(b(0)&&!padAcceptHeld)document.activeElement?.click();
  }else if(screen==='play'&&game.mode==='playing'){
    padInput.left=b(14);padInput.right=b(15);padInput.up=b(12);padInput.down=b(13);
    padInput.moveX=magnitude?x/magnitude*strength:0;padInput.moveY=magnitude?y/magnitude*strength:0;
    padInput.fire=b(0)||b(7);
    padInput.focus=b(4)||b(6);
    padInput.bomb=b(1);padInput.roll=b(2);
    padPressed.bomb=b(1)&&!padBombHeld;
    padPressed.roll=b(2)&&!padRollHeld;
    if(start&&!padStartHeld)pause();
    if(accept||start)unlock();
  }
  padStartHeld=start;padAcceptHeld=accept;padBackHeld=back;padHorizontalHeld=!!horizontal;
  padBombHeld=b(1);padRollHeld=b(2);activePadIndex=pad.index;
}
function number(v){return Math.max(0,Math.floor(Number(v)||0));}
function dismissEndIntro(){
  const wasIntro=$('endScreen').classList.contains('cinema-intro');
  if(endIntroTimer){clearTimeout(endIntroTimer);endIntroTimer=null;}
  $('endScreen').classList.remove('cinema-intro');
  $('endContent').inert=false;
  $('endContent').removeAttribute('aria-hidden');
  if(wasIntro)cinema.reveal();
  if(wasIntro&&document.activeElement===$('skipCinemaButton'))$('retryButton').focus({preventScroll:true});
  scheduleFrame();
}
function endSortie(summary, fixture=false){
  const data=summary||{};
  endData=data;
  endStarted=performance.now();
  const won=data.outcome==='victory'||game.mode==='victory';
  $('endScreen').classList.toggle('lost',!won);
  setText('endEyebrow',won?'SORTIE COMPLETE / FLIGHT RECORD':'SORTIE LOST / FLIGHT RECORD');
  $('endHeading').innerHTML=won?'The sky<br><em>is ours.</em>':'Signal<br><em>lost at sea.</em>';
  const grade=String(data.grade||(!won?'—':'C')).toUpperCase();
  setText('endGrade',grade);
  const stage=Math.min(3,number(data.stage||game.stage));
  let narrative;
  if(won){
    narrative=grade.startsWith('S')?'A flawless line through the impossible. The storm fleet never saw you coming.':
      grade.startsWith('A')?'The carrier fleet is gone. Your wake cuts a new route home.':
      'The storm breaks at last. You held the line, and the sky opens ahead.';
  }else{
    narrative=stage>=3?'The final carrier held the line. The route remains open for one more sortie.':
      stage===2?'The storm wall claimed this flight. The next opening is yours to find.':
      'The first sector swallowed the signal. The flight deck is ready when you are.';
  }
  setText('endNarrative',narrative);
  setText('endScore',String(number(data.score??game.score)).padStart(8,'0'));
  setText('endSectors',String(Math.min(3,number(data.bossesDefeated??(won?3:Math.max(0,stage-1))))).padStart(2,'0')+' / 03');
  const survivors=number(data.livesRemaining??game.player?.lives);
  setText('endSurvival',survivors+' '+(survivors===1?'LIFE':'LIVES'));
  setText('endStyle',String(number(data.conversions)).padStart(3,'0')+' / '+String(number(data.rolls)).padStart(2,'0'));
  const drill=number(data.practiceStage);
  $('retryButton').querySelector('span').firstChild.textContent=drill?'RETRY DRILL ':'FLY AGAIN ';
  $('gradeLockup').hidden=!!drill;
  setText('endSectorsLabel',drill?'FLAGSHIPS CLEARED':'SECTORS CLEARED');
  setText('endAccuracy',Math.round(Math.min(1,Number(data.accuracy)||0)*100)+'%');
  setText('endGrazes',String(number(data.grazes)));setText('endConversions',String(number(data.conversions)));
  setText('endHits',String(number(data.hitsTaken)));setText('endFlightTime',flightTime(data.time));
  setText('flightAdvice',flightAdvice(data));
  setText('personalRecord',drill?'UNRANKED DRILL / CAMPAIGN RECORDS PRESERVED':lastPersonalRecord?.newBest?'NEW '+selectedShip.toUpperCase()+' BEST / +'+number(data.score-lastPersonalRecord.previous.bestScore).toLocaleString()+' POINTS':selectedShip.toUpperCase()+' BEST / '+String(career.ships[selectedShip].bestScore).padStart(8,'0'));
  if(drill){
    const name=['','VESPER','AURELIA','THE CROWN'][drill];
    const tier=drillClearTier(data);
    setText('endEyebrow','UNRANKED DRILL / '+(tier==='flawless'?'NO-HIT CLEAR':tier==='controlled'?'ALL LIVES KEPT':tier==='survived'?'CLEAR SECURED':'FLAGSHIP APPROACH'));
    $('endHeading').innerHTML=tier==='flawless'?'Clean<br><em>flight.</em>':tier==='controlled'?'Pattern<br><em>learned.</em>':tier==='survived'?'Flagship<br><em>down.</em>':'One more<br><em>approach.</em>';
    setText('endNarrative',name+' / '+(won?'Flagship disabled. Take the lesson into your next sortie.':'Read the gaps and try another line.'));
    setText('endSectors',number(data.bossesDefeated)+' / 01');
    const best=drillRecords[selectedShip+'-'+drill];
    if(best)setText('personalRecord','UNRANKED / BEST '+flightTime(best.bestTime)+' / FEWEST HITS '+best.fewestHits);
  }
  // DEV FIXTURE DISPLAY BEGIN
  $('fixtureNotice').hidden=!fixture;
  // DEV FIXTURE DISPLAY END
  const score=number(data.score??game.score);
  const gradeLine='GRADE '+grade+' / '+String(score).padStart(8,'0')+' POINTS';
  setText('endIntroKicker',won?'FINAL SIGNAL / FLEET DISABLED':'MAYDAY / SECTOR '+String(stage).padStart(2,'0'));
  setText('endIntroHeading',won?(grade==='S'||grade==='A'?'THE SKY OPENS':'ROUTE CLEARED'):(stage>=3?'THE CROWN HOLDS':'SIGNAL LOST'));
  setText('endIntroLine',won?gradeLine:'FLIGHT RECORD RECOVERED / '+gradeLine);
  if(drill){
    const tier=drillClearTier(data);
    setText('endIntroKicker','UNRANKED / FLAGSHIP DRILL');
    setText('endIntroHeading',tier==='flawless'?'NO-HIT CLEAR':tier==='controlled'?'ALL LIVES KEPT':tier==='survived'?'CLEAR SECURED':'RESET APPROACH');
    setText('endIntroLine','CAMPAIGN RECORDS PRESERVED');
  }
  cinema.start(data,{newBest:!drill&&!!lastPersonalRecord?.newBest});
  $('endContent').inert=true;$('endContent').setAttribute('aria-hidden','true');
  $('endScreen').classList.add('cinema-intro');
  if(endIntroTimer)clearTimeout(endIntroTimer);
  endIntroTimer=setTimeout(()=>{if(screen==='end')dismissEndIntro();},2600);
  clearInput();showScreen('end');
  $('endScreen').scrollTop=0;
}
function readoutsFromGame(dt){
  if(game.boss&&!game.practiceStage&&markEncounter(career,game.stage)){saveProgress(career);updateCareerDisplay();}
  if(hud.compact){
    const p=game.player;
    setText('mobileScore',String(Math.floor(game.score)).padStart(8,'0'));setText('mobileSector',String(game.stage).padStart(2,'0'));
    setText('mobileSectorLabel',game.practiceStage?'DRILL':'SECTOR');
    setText('mobileHull',p.hp+'/'+p.maxHp);setText('mobileLives',String(p.lives));setText('mobileBombs',String(p.bombs));
    setText('mobilePower',String(p.level));setText('mobileCombo',game.combo.toFixed(1)+'×');setText('mobileWake',Math.round(p.wake*100)+'%');
    setText('mobileRoll',p.rollCooldown>0?'ROLL '+p.rollCooldown.toFixed(1)+'s':p.wake>=.5?'CHARGED ROLL':'ROLL READY');
    $('mobileShieldRow').hidden=true;
    let equipment=$('mobileEquipment');
    if(!equipment){
      equipment=document.createElement('div');equipment.id='mobileEquipment';equipment.className='mobile-equipment';
      equipment.innerHTML='<span id="mobileEquipmentText"></span><label>R <progress id="mobileReflector" max="6" value="0" aria-label="Reflector seconds"></progress></label>';
      $('mobileBossRow').before(equipment);
    }
    equipment.hidden=!(p.escorts||p.sidewinder||p.signature||p.shield||p.reflector>0);
    setText('mobileEquipmentText','E '+(p.escorts||0)+' · M '+(p.sidewinder||0)+' · ★ '+(p.signature||0)+' · S '+(p.shield||0));
    $('mobileReflector').value=p.reflector||0;
    equipment.classList.toggle('reflector-low',p.reflector>0&&p.reflector<2);
    equipment.classList.toggle('recovering',hud.recoverTime>0);
    equipment.classList.toggle('arsenal-lost',hud.scatterTime>0);

    const reactor=game.boss?.reactor,cover=game.boss?.cover;
    const coverLeft=cover?Math.max(0,cover.until-game.boss.age):0;
    const objective=coverLeft>0?'COVER '+coverLeft.toFixed(1)+'s':reactor&&!reactor.broken?(reactor.side<0?'LEFT REACTOR / BREAK FOR COVER':'RIGHT REACTOR / CUT SPIRAL'):reactor?.phase===3&&reactor.broken?'RIGHT SPIRAL OFFLINE':null;
    const l=game.boss?.lance,age=game.boss?.age,lanceCue=l&&!l.cancelled&&age>=l.startsAt&&age<l.endsAt?
      l.active?'LANCE FIRING / KEEP CLEAR':l.locked?'LANCE LOCKED / LEAVE THE LANE':'LANCE TRACKING / BAIT THEN MOVE':null;
    const salvageCue=hud.scatterTime>0?'ARSENAL LOST / '+(hud.salvageCount||0)+' IN FIELD':hud.recoverTime>0?'RECOVERED +'+hud.recovered:hud.salvageCount?'RECOVER SALVAGE / '+hud.salvageCount:null;
    setText('flightSignal',lanceCue?(p.hp<=1?'CRITICAL / ':'')+lanceCue:p.hp<=1?'HULL CRITICAL / EVADE':objective||salvageCue||(hud.bannerTime>0?hud.banner:hud.encounterTime>0?hud.encounterName:'DRAG TO MOVE & FIRE'));
    $('mobileBossRow').hidden=!game.boss;
    if(game.boss){setText('mobileBossName',game.boss.name+' / PHASE '+game.boss.phase);$('mobileBoss').value=100*game.boss.hp/game.boss.maxHp;}
  }
  const elapsed=number(game.time||game.elapsed);
  setText('timeReadout',String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(elapsed%60).padStart(2,'0'));
  setText('threatReadout',game.boss?'CATASTROPHIC':bossWarningProgress(game)>=0?'FLAGSHIP INBOUND':interludeProgress(game)>=0?'SECTOR CLEAR':game.stage>1?'SEVERE':'RISING');
  setText('bestReadout',String(number(game.bestScore||game.highScore)).padStart(8,'0'));
  setText('frameSector',(game.practiceStage?'UNRANKED DRILL ':'SECTOR ')+String(game.stage||1).padStart(2,'0'));
  const hp=Number(game.player?.hp)||0;
  const maxHp=Math.max(1,Number(game.player?.maxHp)||4);
  setText('conditionReadout',hp<=1?'CRITICAL':hp/maxHp<=.5?'DAMAGED':'NOMINAL');
  document.body.classList.toggle('critical-hull',screen==='play'&&hp<=1);
  fpsFrames++;fpsTime+=dt;
  if(fpsTime>1){setText('fpsReadout',Math.round(fpsFrames/fpsTime)+' FPS');fpsTime=0;fpsFrames=0;}
}
function stopFrameLoop(){
  if(frameHandle===null)return;
  if(frameHandleType==='raf')cancelAnimationFrame(frameHandle);else clearTimeout(frameHandle);
  frameHandle=null;frameHandleType=null;
}
function scheduleFrame(){
  if(document.hidden||!$('manualDialog').hidden||frameHandle!==null)return;
  const active=['play','title','hangar','pause','end'].includes(screen);
  if(!active)return;
  if(screen==='play'){
    frameHandleType='raf';frameHandle=requestAnimationFrame(frame);
  }else{
    const delay=33;
    frameHandleType='timeout';frameHandle=setTimeout(()=>frame(performance.now()),delay);
  }
}
function consumeOneShots(){
  for(const key of ['bomb','roll']){keyboardInput[key]=false;touchInput[key]=false;padPressed[key]=false;input[key]=false;}
  input.start=false;input.pause=false;
}
function frame(now){
  frameHandle=null;frameHandleType=null;
  if(document.hidden||!$('manualDialog').hidden)return;
  const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;
  readGamepad();
  if(screen==='play'){
    if(outroUntil){
      // The run has ended: keep the playfield, HUD and outro sequence alive without updating the game.
      renderer.draw(game,dt);hud.draw(game,dt,ctx);sequences.draw(ctx,game,dt);
      audio.update(game,dt);ambience.update(game,dt);readoutsFromGame(dt);
      if(now>=outroUntil){outroUntil=0;endSortie(game.summary);}
      scheduleFrame();return;
    }
    composeInput();
    game.update(dt,input);
    renderer.draw(game,dt);
    hud.draw(game,dt,ctx);
    sequences.draw(ctx,game,dt);
    audio.update(game,dt);
    ambience.update(game,dt);
    consumeOneShots();
    readoutsFromGame(dt);
    if(screen==='play'&&game.mode==='paused'){clearInput();showScreen('pause');}
    else if(screen==='play'&&(game.mode==='victory'||game.mode==='gameover')){
      if(!game.practiceStage){
        hud.saveHighScore(game.score);lastPersonalRecord=recordFlight(career,game.summary);saveProgress(career);
        if(lastPersonalRecord&&career.ships[selectedShip].bestScore>game.score)lastPersonalRecord.newBest=false;
      }else recordDrill(drillRecords,game.summary);
      updateCareerDisplay();
      clearInput();
      const hold=Math.max(0,Math.min(6,Number(sequences.beginOutro(game))||0));
      game.events=[]; // already consumed this frame; the outro must not replay them
      if(hold>0)outroUntil=now+hold*1000;else endSortie(game.summary);
    }
  }else if(screen==='title'){
    if(now-titleFrame>=33){titleFrame=now;frontEnd.drawTitle(now/1000);}
    audio.update(game,dt);
  }else if(screen==='hangar'){
    frontEnd.drawHangar(now/1000);audio.update(game,dt);
  }else if(screen==='pause'){
    pausePanel.update(now/1000,game);audio.update(game,dt);
  }else if(screen==='end'){
    if(now-endFrame>=33){endFrame=now;cinema.draw((now-endStarted)/1000,endData||{});}
    audio.update(game,dt);
  }
  scheduleFrame();
}
frontEnd.init(selectedShip);
chooseShip(selectedShip);
frontEnd.enter(screen);ambience.setScreen(screen);audio.setScreen(screen);
// Browsers gate Web Audio until a gesture; the first key or tap anywhere starts sound.
for(const type of ['pointerdown','keydown'])window.addEventListener(type,unlock,{capture:true});
document.addEventListener('focusin',e=>{
  const target=e.target;
  if(screen!=='play'&&target instanceof HTMLElement&&target.matches('button,input')&&performance.now()-navTime<250)audio.ui('focus');
});
scheduleFrame();
// DEV REVIEW HOOKS BEGIN
window.__game=game;window.__renderer=renderer;window.__audio=audio;window.__canvas=canvas;
window.__hud=hud;window.__frontEnd=frontEnd;window.__pausePanel=pausePanel;window.__sequences=sequences;window.__cinema=cinema;window.__ambience=ambience;
window.__showEndFixture=outcome=>{
  const won=outcome==='victory';
  endSortie({outcome:won?'victory':'gameover',shipId:selectedShip,score:won?421850:86120,grade:won?'A':'C',stage:won?3:2,grazes:won?127:41,rolls:won?12:4,livesRemaining:won?2:0},true);
};
// DEV REVIEW HOOKS END
