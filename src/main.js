import { Game } from './game.js';
import { Renderer } from './render.js';
import { HUD } from './ui.js';
import { AudioEngine } from './audio.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d', { alpha:false });
const game = new Game();
try { game.best = Math.max(game.best || 0, Number(localStorage.getItem('2026-high-score')) || 0); } catch {}
const renderer = new Renderer(canvas);
const hud = new HUD(canvas);
const audio = new AudioEngine();
const SHIPS = {
  kestrel:{name:'KESTREL',code:'SA-01',role:'INTERCEPTOR',description:'Balanced spread cannons and a screen-clearing nova. A razor-wing all-rounder for every opening.',speed:72,fire:72,hull:68,color:'#f3bb70'},
  manta:{name:'MANTA',code:'SA-02',role:'STRIKE CRAFT',description:'Homing missiles, layered shields, and a defensive barrier pulse. Built to hold the line.',speed:48,fire:94,hull:92,color:'#f29a76'},
  wraith:{name:'WRAITH',code:'SA-03',role:'RECON CRAFT',description:'Piercing rail fire, support drones, and a conversion storm. Precision through the impossible.',speed:95,fire:58,hull:42,color:'#81d7d0'}
};
const SHIP_ORDER = Object.keys(SHIPS);
const SPECIAL_LABELS = {kestrel:'NOVA',manta:'BARRIER',wraith:'STORM'};
let selectedShip = SHIP_ORDER.includes(game.shipId) ? game.shipId : 'kestrel';
let screen = 'title';
let manualOrigin = null;
let manualSuspended = false;
let endStarted = 0;
let endData = null;
let endIntroTimer = null;
let pointerId = null;
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
}
function composeInput(){
  for(const key of ['left','right','up','down','fire','focus']){
    input[key]=keyboardInput[key]||touchInput[key]||padInput[key]||(key==='fire'&&pointerId!==null);
  }
  input.bomb=keyboardInput.bomb||touchInput.bomb||padPressed.bomb;
  input.roll=keyboardInput.roll||touchInput.roll||padPressed.roll;
}
function renderGameFrame(){renderer.draw(game,0);hud.draw(game,0,ctx);}
function focusForScreen(next){
  const focusTargets={title:$('enterHangarButton'),hangar:document.querySelector('.ship-card[data-ship="'+selectedShip+'"]'),play:canvas,pause:$('resumeButton'),end:$('skipCinemaButton')};
  const target=focusTargets[next];
  if(target&&typeof target.focus==='function')target.focus({preventScroll:true});
}
function showScreen(next){
  stopFrameLoop();
  last=performance.now();
  screen=next;$('app').dataset.screen=next;
  for(const [name,node] of Object.entries(screens))node.hidden=!(name===next||(name==='play'&&next==='pause'));
  focusForScreen(next);
  if(next==='hangar')drawBlueprint();
  if(next==='pause'&&!document.hidden)renderGameFrame();
  if(next==='pause'||next==='end')audio.update(game,0);
  window.scrollTo(0,0);
  requestAnimationFrame(()=>window.scrollTo(0,0));
  scheduleFrame();
}
function unlock(){audio.unlock();}
function chooseShip(id){
  if(!SHIPS[id])return;
  selectedShip=id;
  for(const card of document.querySelectorAll('.ship-card')){
    const on=card.dataset.ship===id;
    card.classList.toggle('selected',on);
    card.setAttribute('aria-checked',String(on));
  }
  const data=SHIPS[id];
  setText('shipName',data.name);setText('shipClass',data.role);setText('shipModel',data.code+' / '+data.name);
  setText('shipDescription',data.description);setText('activeShipLabel',data.name+' / '+data.code);
  setText('specialControlLabel',SPECIAL_LABELS[id]+' SPECIAL');
  setText('touchBomb',SPECIAL_LABELS[id]);
  $('speedMeter').style.setProperty('--meter',data.speed+'%');
  $('fireMeter').style.setProperty('--meter',data.fire+'%');
  $('hullMeter').style.setProperty('--meter',data.hull+'%');
  drawBlueprint();
}
function enterHangar(){if(screen==='title'||screen==='end'||screen==='pause'){clearInput();showScreen('hangar');}}
function selectInDirection(delta){
  const index=SHIP_ORDER.indexOf(selectedShip);
  chooseShip(SHIP_ORDER[(index+delta+SHIP_ORDER.length)%SHIP_ORDER.length]);
  document.querySelector('.ship-card[data-ship="'+selectedShip+'"]').focus({preventScroll:true});
}
function launch(initialFire=false){
  unlock();clearInput();
  if(game.mode!=='title')game.reset();
  if(typeof game.selectShip==='function')game.selectShip(selectedShip);
  game.update(0,{});
  game.update(0,{start:true});
  game.update(0,{});
  if(initialFire===true){held.add('Space');keyboardInput.fire=true;}
  showScreen('play');
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
  clearInput();audio.update(game,0);showScreen('pause');
}
function resume(){
  if(screen!=='pause')return;
  setGamePaused(false);
  clearInput();audio.update(game,0);showScreen('play');
}
function focusableIn(container){
  return [...container.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter(node=>!node.hidden&&!node.closest('[inert]')&&node.getClientRects().length>0);
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
  $('closeManualButton').focus({preventScroll:true});
  stopFrameLoop();
}
function closeManual(){
  const dialog=$('manualDialog');
  if(dialog.hidden)return;
  dialog.hidden=true;
  if(manualSuspended&&screen==='play'){
    setGamePaused(false);audio.update(game,0);
  }
  manualSuspended=false;
  const origin=manualOrigin;manualOrigin=null;
  if(origin&&origin.isConnected&&typeof origin.focus==='function')origin.focus({preventScroll:true});
  scheduleFrame();
}
function isGlobalShortcutTarget(target){return target===document.body||target===canvas;}
function onKeyDown(e){
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
  if(!isGlobalShortcutTarget(e.target))return;
  if(screen==='title'){
    if(e.code==='Enter'||e.code==='Space'){e.preventDefault();if(!e.repeat)enterHangar();}
    return;
  }
  if(screen==='hangar'){
    if(['ArrowLeft','ArrowUp','KeyA','KeyW'].includes(e.code)){e.preventDefault();if(!e.repeat)selectInDirection(-1);}
    else if(['ArrowRight','ArrowDown','KeyD','KeyS'].includes(e.code)){e.preventDefault();if(!e.repeat)selectInDirection(1);}
    else if(e.code==='Enter'||e.code==='Space'){e.preventDefault();if(!e.repeat)launch(e.code==='Space');}
    else if(e.code==='Escape'){e.preventDefault();showScreen('title');}
    return;
  }
  if(screen==='end'){
    if(e.code==='Enter'||e.code==='Space'){
      e.preventDefault();
      if(!e.repeat){if($('endScreen').classList.contains('cinema-intro'))dismissEndIntro();else launch(e.code==='Space');}
    }else if(e.code==='Escape'){e.preventDefault();enterHangar();}
    return;
  }
  if(screen==='pause'){
    if(e.code==='Enter'&&!e.repeat){e.preventDefault();resume();}
    return;
  }
  if(screen!=='play')return;
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
  input.pointerX=Math.max(0,Math.min(540,(e.clientX-rect.left)*540/rect.width));
  input.pointerY=Math.max(0,Math.min(900,(e.clientY-rect.top)*900/rect.height));
}
canvas.addEventListener('pointerdown',e=>{
  if(screen!=='play')return;
  e.preventDefault();unlock();pointerId=e.pointerId;canvas.setPointerCapture(e.pointerId);
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
$('resumeButton').addEventListener('click',resume);
$('retryPauseButton').addEventListener('click',launch);
$('changeShipPauseButton').addEventListener('click',()=>{game.reset();enterHangar();});
$('enterHangarButton').addEventListener('click',enterHangar);
$('hangarBackButton').addEventListener('click',()=>showScreen('title'));
$('launchButton').addEventListener('click',launch);
$('retryButton').addEventListener('click',launch);
$('skipCinemaButton').addEventListener('click',dismissEndIntro);
$('changeShipButton').addEventListener('click',enterHangar);
for(const card of document.querySelectorAll('.ship-card'))card.addEventListener('click',()=>chooseShip(card.dataset.ship));
$('helpButton').addEventListener('click',openManual);
$('closeManualButton').addEventListener('click',closeManual);
$('manualDoneButton').addEventListener('click',closeManual);
$('manualDialog').addEventListener('click',e=>{if(e.target===$('manualDialog'))closeManual();});
const soundButton=$('soundButton');
soundButton.addEventListener('click',()=>{
  unlock();audio.toggleMute();soundButton.textContent=audio.muted?'◖ SOUND OFF':'◖ SOUND ON';
  soundButton.setAttribute('aria-label',audio.muted?'Unmute sound':'Mute sound');
  try{localStorage.setItem('2026-muted',audio.muted?'1':'0');}catch{}
});
try{if(localStorage.getItem('2026-muted')==='1'){audio.toggleMute();soundButton.textContent='◖ SOUND OFF';soundButton.setAttribute('aria-label','Unmute sound');}}catch{}
function clearPadInput(){
  for(const key of Object.keys(padInput))padInput[key]=false;
  padPressed.bomb=false;padPressed.roll=false;
  padStartHeld=false;padAcceptHeld=false;padBackHeld=false;padHorizontalHeld=false;padBombHeld=false;padRollHeld=false;
  activePadIndex=null;
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
  const b=i=>!!pad.buttons?.[i]?.pressed;
  const accept=b(0)||b(9),back=b(1),start=b(9);
  const horizontal=x>.45||b(15)?1:x<-.45||b(14)?-1:y>.45||b(13)?1:y<-.45||b(12)?-1:0;
  if(screen==='title'){
    if(accept&&!padAcceptHeld){unlock();enterHangar();}
  }else if(screen==='hangar'){
    if(horizontal&&!padHorizontalHeld)selectInDirection(horizontal);
    if(accept&&!padAcceptHeld){unlock();launch();}
    if(back&&!padBackHeld)showScreen('title');
  }else if(screen==='end'){
    if(accept&&!padAcceptHeld){
      unlock();
      if($('endScreen').classList.contains('cinema-intro'))dismissEndIntro();else launch();
    }
    if(back&&!padBackHeld)enterHangar();
  }else if(screen==='pause'){
    if(start&&!padStartHeld)resume();
  }else if(screen==='play'&&game.mode==='playing'){
    padInput.left=x<-.22||b(14);padInput.right=x>.22||b(15);
    padInput.up=y<-.22||b(12);padInput.down=y>.22||b(13);
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
  setText('endStyle',String(number(data.grazes)).padStart(3,'0')+' / '+String(number(data.rolls)).padStart(2,'0'));
  // DEV FIXTURE DISPLAY BEGIN
  $('fixtureNotice').hidden=!fixture;
  // DEV FIXTURE DISPLAY END
  const score=number(data.score??game.score);
  const gradeLine='GRADE '+grade+' / '+String(score).padStart(8,'0')+' POINTS';
  setText('endIntroKicker',won?'FINAL SIGNAL / FLEET DISABLED':'MAYDAY / SECTOR '+String(stage).padStart(2,'0'));
  setText('endIntroHeading',won?(grade==='S'||grade==='A'?'THE SKY OPENS':'ROUTE CLEARED'):(stage>=3?'THE CROWN HOLDS':'SIGNAL LOST'));
  setText('endIntroLine',won?gradeLine:'FLIGHT RECORD RECOVERED / '+gradeLine);
  $('endContent').inert=true;$('endContent').setAttribute('aria-hidden','true');
  $('endScreen').classList.add('cinema-intro');
  if(endIntroTimer)clearTimeout(endIntroTimer);
  endIntroTimer=setTimeout(()=>{if(screen==='end')dismissEndIntro();},2600);
  clearInput();showScreen('end');
}
function readoutsFromGame(dt){
  const elapsed=number(game.time||game.elapsed);
  setText('timeReadout',String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(elapsed%60).padStart(2,'0'));
  setText('threatReadout',game.boss?'CATASTROPHIC':game.stage>1?'SEVERE':'RISING');
  setText('bestReadout',String(number(game.bestScore||game.highScore)).padStart(8,'0'));
  setText('frameSector','SECTOR '+String(game.stage||1).padStart(2,'0'));
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
    const delay=screen==='title'||screen==='end'?34:80;
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
    composeInput();
    game.update(dt,input);
    renderer.draw(game,dt);
    hud.draw(game,dt,ctx);
    audio.update(game,dt);
    consumeOneShots();
    readoutsFromGame(dt);
    if(screen==='play'&&game.mode==='paused'){clearInput();showScreen('pause');}
    else if(screen==='play'&&(game.mode==='victory'||game.mode==='gameover'))endSortie(game.summary);
  }else if(screen==='title'){
    if(now-titleFrame>=33){titleFrame=now;drawTitleAircraft(now/1000);}
  }else if(screen==='end'){
    if(now-endFrame>=33){endFrame=now;drawCinema((now-endStarted)/1000,endData||{});}
  }
  scheduleFrame();
}
function poly(c,points,fill,stroke='#ffffff',line=1){
  c.beginPath();c.moveTo(points[0][0],points[0][1]);
  for(let i=1;i<points.length;i++)c.lineTo(points[i][0],points[i][1]);
  c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=line;c.stroke();}
}
function shipShape(c,id,x,y,size,time=0,blueprint=false){
  const data=SHIPS[id]||SHIPS.kestrel;
  c.save();c.translate(x,y);c.scale(size,size);
  const accent=blueprint?'#f3bb70':data.color;
  const metal=blueprint?'#1d3a42':'#e1e2d4';
  const shadow=blueprint?'#0b2530':'#526b70';
  c.shadowColor=blueprint?accent:'#031016';c.shadowBlur=blueprint?22:25;
  if(id==='kestrel'){
    poly(c,[[-7,-90],[7,-90],[19,-34],[96,14],[90,30],[18,15],[13,80],[-13,80],[-18,15],[-90,30],[-96,14],[-19,-34]],metal,accent,1.5);
    poly(c,[[-19,-33],[-96,14],[-82,18],[-15,-12]],shadow,accent,.8);
    poly(c,[[19,-33],[96,14],[82,18],[15,-12]],shadow,accent,.8);
    poly(c,[[-13,39],[-42,75],[-37,79],[-5,66],[5,66],[37,79],[42,75],[13,39]],shadow,accent,1);
  }else if(id==='manta'){
    poly(c,[[-10,-70],[10,-70],[33,-41],[112,10],[113,39],[75,44],[20,18],[23,75],[-23,75],[-20,18],[-75,44],[-113,39],[-112,10],[-33,-41]],metal,accent,1.6);
    poly(c,[[-31,-37],[-108,12],[-105,31],[-22,-3]],shadow,accent,.9);
    poly(c,[[31,-37],[108,12],[105,31],[22,-3]],shadow,accent,.9);
    poly(c,[[-18,44],[-71,71],[-66,81],[-8,66],[8,66],[66,81],[71,71],[18,44]],shadow,accent,1);
  }else{
    poly(c,[[0,-101],[12,-48],[20,-25],[84,24],[102,41],[42,22],[16,13],[11,78],[-11,78],[-16,13],[-42,22],[-102,41],[-84,24],[-20,-25],[-12,-48]],metal,accent,1.5);
    poly(c,[[-18,-22],[-100,39],[-68,25],[-13,-7]],shadow,accent,.9);
    poly(c,[[18,-22],[100,39],[68,25],[13,-7]],shadow,accent,.9);
    poly(c,[[-10,42],[-37,75],[-29,82],[0,65],[29,82],[37,75],[10,42]],shadow,accent,.9);
  }
  c.shadowBlur=0;
  poly(c,[[-5,-68],[5,-68],[10,-19],[5,46],[-5,46],[-10,-19]],blueprint?'#254d51':'#829aa0',accent,1);
  poly(c,[[-5,-50],[5,-50],[7,-25],[-7,-25]],blueprint?'#68babb':'#25484f',accent,1);
  c.strokeStyle=blueprint?'rgba(243,187,112,.45)':'rgba(16,52,58,.48)';c.lineWidth=.8;
  for(const sign of [-1,1]){
    c.beginPath();c.moveTo(sign*20,-7);c.lineTo(sign*(id==='manta'?82:71),22);c.moveTo(sign*13,47);c.lineTo(sign*31,68);c.stroke();
    c.fillStyle=accent;c.fillRect(sign*28-1,10,2,9);
    c.fillStyle=blueprint?'#b36e4f':'#162d34';c.fillRect(sign*7-3,65,6,13);
  }
  c.fillStyle=accent;c.fillRect(-3,-82,6,13);
  if(!blueprint){c.globalAlpha=.35+.18*Math.sin(time*12);c.fillStyle='#80e8e0';c.fillRect(-12,78,7,17);c.fillRect(5,78,7,17);}
  c.restore();
}
function drawTitleAircraft(t){
  const c=$('titleAircraft'),g=c.getContext('2d');g.clearRect(0,0,780,780);
  g.save();g.translate(410,350);g.rotate(-.23);
  for(let i=0;i<4;i++){
    g.strokeStyle='rgba(249,203,144,'+(.26-i*.045)+')';g.lineWidth=3-i*.45;
    g.beginPath();g.ellipse(0,0,180+i*42,180+i*42,0,-Math.PI*.35,Math.PI*.44);g.stroke();
  }
  g.strokeStyle='rgba(252,218,168,.42)';g.lineWidth=1;
  g.beginPath();g.moveTo(-250,0);g.lineTo(250,0);g.moveTo(0,-250);g.lineTo(0,250);g.stroke();
  g.setLineDash([4,10]);g.strokeStyle='rgba(199,234,225,.29)';g.beginPath();g.arc(0,0,263,0,Math.PI*2);g.stroke();g.setLineDash([]);
  const trail=g.createLinearGradient(0,0,0,580);trail.addColorStop(0,'rgba(244,202,140,.18)');trail.addColorStop(1,'rgba(244,202,140,0)');
  g.fillStyle=trail;poly(g,[[-44,140],[-30,140],[-94,550],[-118,550]],trail,null);poly(g,[[30,140],[44,140],[118,550],[94,550]],trail,null);
  shipShape(g,'kestrel',0,0,1.85,t);
  g.restore();
  g.font='700 11px Arial';g.letterSpacing='3px';g.fillStyle='rgba(241,209,165,.7)';g.fillText('SA-01 / KESTREL',78,540);
  g.fillStyle='rgba(160,204,201,.46)';g.fillText('N 43° 12.9 / W 32° 08.6',490,158);
}
function drawBlueprint(t=0){
  const c=$('shipBlueprint'),g=c.getContext('2d');if(!c||!g)return;
  g.clearRect(0,0,600,400);
  const color=SHIPS[selectedShip].color;
  g.strokeStyle='rgba(163,217,209,.24)';g.lineWidth=1;
  for(let r=80;r<260;r+=57){g.beginPath();g.arc(300,193,r,0,Math.PI*2);g.stroke();}
  g.strokeStyle='rgba(243,187,112,.48)';g.beginPath();g.arc(300,193,158,-.8,.8);g.stroke();
  shipShape(g,selectedShip,300,194,1.28,t,true);
  g.fillStyle=color;g.font='700 9px Arial';g.fillText('A / WING GEOMETRY',20,92);g.fillText('B / POWER CORE',415,260);
  g.strokeStyle='rgba(243,187,112,.6)';g.beginPath();g.moveTo(127,93);g.lineTo(214,93);g.lineTo(237,146);g.moveTo(418,254);g.lineTo(380,254);g.lineTo(342,221);g.stroke();
}
function drawCardShips(){
  for(const card of document.querySelectorAll('.ship-card')){
    const id=card.dataset.ship, c=card.querySelector('canvas'), g=c.getContext('2d');
    g.clearRect(0,0,c.width,c.height);
    const glow=g.createRadialGradient(80,63,4,80,63,77);
    glow.addColorStop(0,id==='manta'?'rgba(242,154,118,.21)':id==='wraith'?'rgba(129,215,208,.19)':'rgba(243,187,112,.21)');
    glow.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=glow;g.fillRect(0,0,160,126);
    g.strokeStyle='rgba(190,218,210,.14)';g.lineWidth=1;
    g.beginPath();g.arc(80,62,48,0,Math.PI*2);g.stroke();
    g.beginPath();g.moveTo(10,63);g.lineTo(150,63);g.moveTo(80,7);g.lineTo(80,119);g.stroke();
    shipShape(g,id,80,60,.48,0,false);
  }
}
function rand(n){const x=Math.sin(n*123.476+78.233)*43758.5453;return x-Math.floor(x);}
function drawCinema(t,data){
  const c=$('cinemaCanvas'),g=c.getContext('2d'),won=data.outcome==='victory';
  const w=1600,h=900;
  g.clearRect(0,0,w,h);
  const sky=g.createLinearGradient(0,0,0,h);
  if(won){sky.addColorStop(0,'#101f2b');sky.addColorStop(.5,'#355665');sky.addColorStop(.75,'#d49570');sky.addColorStop(1,'#172d39');}
  else{sky.addColorStop(0,'#100e17');sky.addColorStop(.48,'#3a2029');sky.addColorStop(.75,'#90443b');sky.addColorStop(1,'#101d29');}
  g.fillStyle=sky;g.fillRect(0,0,w,h);
  const sun=g.createRadialGradient(w*.76,h*.55,5,w*.76,h*.55,460);
  sun.addColorStop(0,won?'rgba(255,222,165,.65)':'rgba(242,111,67,.38)');sun.addColorStop(1,'rgba(255,184,111,0)');
  g.fillStyle=sun;g.fillRect(0,0,w,h);
  for(let i=0;i<32;i++){
    const x=rand(i+3)*w, y=90+rand(i+23)*520;
    const speed=(i%4+1)*t*8;
    g.fillStyle=won?'rgba(226,225,202,.18)':'rgba(247,139,112,.14)';
    g.beginPath();g.ellipse((x+speed)%(w+300)-150,y,70+rand(i+4)*180,8+rand(i+41)*20,-.13,0,Math.PI*2);g.fill();
  }
  const horizon=won?634:690;
  g.fillStyle=won?'#172f3b':'#14232b';g.fillRect(0,horizon,w,h-horizon);
  for(let i=0;i<42;i++){
    const y=horizon+i*9;
    g.strokeStyle=won?'rgba(243,185,131,'+(.17-i*.003)+')':'rgba(222,107,91,'+(.15-i*.002)+')';
    g.lineWidth=1+rand(i)*3;g.beginPath();g.moveTo(rand(i+100)*w,y);g.lineTo(w,y+2);g.stroke();
  }
  g.fillStyle=won?'#0c222c':'#1c1c26';
  poly(g,[[920,horizon],[980,horizon-26],[1130,horizon-28],[1180,horizon-3],[1320,horizon+3],[1390,horizon+11],[920,horizon+14]],g.fillStyle,null);
  g.fillRect(1052,horizon-55,45,31);g.fillRect(1095,horizon-72,27,50);
  if(won){
    for(let i=0;i<15;i++){
      const x=1130+rand(i+280)*240,y=horizon-20-rand(i+400)*145-t*(3+i%3);
      g.fillStyle='rgba(30,41,44,'+(0.12+rand(i)*.16)+')';
      g.beginPath();g.arc(x,y,12+rand(i+310)*34,0,Math.PI*2);g.fill();
    }
    g.strokeStyle='rgba(237,222,185,.36)';g.lineWidth=5;g.beginPath();g.moveTo(1400,850);g.bezierCurveTo(1270,730,1140,550,1110,360);g.stroke();
    g.strokeStyle='rgba(249,225,183,.17)';g.lineWidth=17;g.beginPath();g.moveTo(1440,850);g.bezierCurveTo(1320,690,1140,520,1110,360);g.stroke();
    g.save();g.translate(1090,340+Math.sin(t*1.3)*8);g.rotate(-.35);shipShape(g,data.shipId||selectedShip,0,0,2.2,t);g.restore();
    for(let i=0;i<12;i++){const x=930+rand(i+51)*520,y=180+rand(i+65)*430;g.fillStyle='rgba(250,224,168,'+(.3+.25*Math.sin(t*3+i))+')';g.fillRect(x,y,2,2);}
  }else{
    for(let i=0;i<18;i++){
      const x=1080+i*19-t*(8+i%3),y=250+i*20+t*(11+i%4);
      g.fillStyle='rgba(33,27,32,'+(0.05+i*.014)+')';g.beginPath();g.arc(x,y,18+i*1.8,0,Math.PI*2);g.fill();
    }
    g.save();g.translate(1100+t*12,455+t*22);g.rotate(2.6+t*.07);shipShape(g,data.shipId||selectedShip,0,0,1.65,t);g.restore();
    for(let i=0;i<13;i++){
      const x=1040+rand(i+88)*330+t*9,y=380+rand(i+77)*340+t*15;
      g.fillStyle=i%2?'#ec8052':'#e7b36e';g.beginPath();g.arc(x,y,2+rand(i+32)*5,0,Math.PI*2);g.fill();
    }
    if(Math.sin(t*1.8)>.91){g.strokeStyle='rgba(243,202,183,.35)';g.lineWidth=3;g.beginPath();g.moveTo(1320,0);g.lineTo(1280,150);g.lineTo(1350,208);g.lineTo(1250,380);g.stroke();}
  }
}
drawCardShips();
chooseShip(selectedShip);
scheduleFrame();
// DEV REVIEW HOOKS BEGIN
window.__game=game;window.__renderer=renderer;window.__audio=audio;window.__canvas=canvas;
window.__showEndFixture=outcome=>{
  const won=outcome==='victory';
  endSortie({outcome:won?'victory':'gameover',shipId:selectedShip,score:won?421850:86120,grade:won?'A':'C',stage:won?3:2,grazes:won?127:41,rolls:won?12:4,livesRemaining:won?2:0},true);
};
// DEV REVIEW HOOKS END
