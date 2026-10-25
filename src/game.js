// 2026: deterministic, asset-free arcade simulation.
const SCORE_EXTENDS = [50000, 160000, 350000, 700000];
// Arsenal tuning (docs/design/act-two.md, Part 1). Power is uncapped: the
// main gun reaches its structural stream ceiling at level 8, then each level
// adds 6% damage and slightly larger shots.
const STREAM_CEILING = 8;
const OVERPOWER_DAMAGE = .06;
const MAX_ESCORTS = 6;
const SHOT_BUDGET = 650;           // live player shots; oldest small shots go first
const BULLET_CAP = 700;            // enemy bullets (Act II raises this to ~900)
const SALVAGE_LIFE = 9;            // seconds; tokens blink for their last 2.5 s
const SALVAGE_MAX_TOKENS = 10;
const SALVAGE_GRACE = .6;          // burst phase: no magnet or pickup, so a hit always scatters
const SCATTER_BURN = .2;           // share of scattered power that burns away
const SCATTER_INVULN = 1.6;        // was 2.35 s before salvage existed
const SALVAGE_BOUNDS = {left:24,right:516,top:70,bottom:860};
const REFLECTOR_PICKUP = 6;        // seconds per R pickup
const REFLECTOR_RADIUS = 44;
const REFLECT_COST = .06;          // reflector seconds burned per reflected bullet
const ORBIT_RADIUS = 46;
const ORBITAL_COOL = .6;           // seconds before an orbital can eat again
const ORBITALS_SHOWN = 6;
// Random drop weights. Power dominates so the main gun visibly grows; the
// equipment share keeps a sector-1 run collecting a full kit.
const DROP_WEIGHTS = [["power",50],["escort",12],["sidewinder",12],["signature",9],["shield",9],["reflector",8]];
// Carriers, minibosses and bosses add bonus items from a fixed ladder, so every
// run sees escorts, a sidewinder rack and a signature level in sector 1.
// Sector 1 awards the first six rungs (3 carriers, the miniboss, Vesper).
const BONUS_LADDER = ["escort","sidewinder","signature","power","reflector","shield","escort","sidewinder","signature","power"];
// Chance that an ordinary kill drops a random item (old flat rate was 4.5%).
// Sector 1 has ~90 kills: ~5 random drops on top of 4 authored power drops,
// 6 ladder bonuses and the flagship spoils, so a no-hit run reaches about
// power 8 at Vesper and 9-10 after it, with 1-3 escort pairs, a sidewinder
// rack and a signature level.
const DROP_CHANCE = {scout:.035,wing:.04,bomber:.25,ace:.15,turret:.25,carrier:1,mini:1};
// Bonus items on top of the authored drop: carriers/minis drop 2-3 in total.
const BONUS_DROPS = {carrier:1,mini:2};
const BIG_TARGETS = new Set(["boss","bomber","turret","carrier","mini"]);
const SMALL_SHOTS = new Set(["shot","lance","escort","flak","orbital","reflect"]);
const DRILL_LOADOUTS = [null,
  {level:6,escorts:2,sidewinder:1,signature:0},    // Vesper
  {level:8,escorts:4,sidewinder:1,signature:1},    // Aurelia
  {level:10,escorts:4,sidewinder:2,signature:2}    // The Crown
];
export const SHIP_IDS = ["kestrel", "manta", "wraith"];
export const SHIP_DEFS = {
  kestrel: {id:"kestrel",name:"KESTREL",role:"Balanced striker",weapon:"spread",special:"nova",
    description:"Wide cannons and a screen clearing nova."},
  manta: {id:"manta",name:"MANTA",role:"Armored hunter",weapon:"missile",special:"barrier",
    description:"Homing missiles, layered shields, and a defensive pulse."},
  wraith: {id:"wraith",name:"WRAITH",role:"Precision wing",weapon:"pierce",special:"storm",
    description:"Piercing rail fire, support drones, and a conversion storm."}
};
// Sparse, authored pressure beats cross the lower safe lane. The first row is
// visible for several seconds; the second row moves the open corridor by 90px.
const BOSS_LEARN_AGES = { phase2: 10, phase3: 18, defeat: 22 };
const LANE_BEATS = [null,
  [[10,150],[29,390],[47,175]],
  [[9,385],[27,155],[44,365],[61,185]],
  [[8,160],[25,380],[42,180],[59,360],[74,155]]
];
// Each sector has its own cadence. The gaps before the closing acts let old
// fire leave the screen before the next formation arrives.
const STAGE_BEATS = [null,
  [[.6,"split"],[4.7,"drift"],[7.5,"wing"],[12,"bomber"],[16.3,"drift"],[20,"ace"],
   [24.2,"flank"],[29.5,"turret"],[34,"drift"],[37,"mini"],[42,"split"],
   [46.5,"wing"],[51,"flank"],[56,"cross"]],
  [[.7,"wing"],[4.8,"drift"],[8,"flank"],[11,"turret"],[15,"ace"],[19,"mini"],
   [23,"drift"],[28.5,"pincer"],[33,"bomber"],[37,"flank"],[41,"relay"],
   [45,"wing"],[49,"mini"],[53,"drift"],[59,"pincer"],[63,"turret"],[67,"relay"]],
  [[.7,"curtain"],[5,"drift"],[9,"pincer"],[13,"ace"],[17,"relay"],[21,"mini"],
   [25,"curtain"],[29,"flank"],[35,"wing"],[39,"pincer"],[43,"relay"],
   [47,"mini"],[51,"drift"],[57,"curtain"],[62,"flank"],[66,"ace"],
   [70,"turret"],[74,"pincer"],[78,"relay"]]
];
export class Game {
  constructor() { this.width = 540; this.height = 900; this.best = 0; this.shipId="kestrel"; this.reset(); }
  reset() {
    this.mode = "title"; this.practiceStage=0; this.time = 0; this.stage = 1; this.stageTime = 0;
    this.scroll = 0; this.score = 0; this.combo = 1; this.graze = 0; this._nextExtend = 0;
    this.shake = 0; this.flash = 0; this.wave = 0; this.wakeConversions = 0;
    this.stageGoal = [0, 62, 73, 82];
    this.shipId=SHIP_DEFS[this.shipId] ? this.shipId : "kestrel";
    this.selectedShip=SHIP_DEFS[this.shipId];
    this.player = {x:270,y:750,r:this.shipId==="manta"?9:this.shipId==="wraith"?7:8,hp:4,maxHp:4,lives:3,bombs:2,power:1,level:1,
      shipId:this.shipId,weaponType:this.selectedShip.weapon,specialType:this.selectedShip.special,
      shield:this.shipId==="manta"?1:0,maxShield:this.shipId==="manta"?1:0,drones:0,
      escorts:0,escortSlots:[],sidewinder:0,reflector:0,signature:0,orbitals:[],arsenal:0,
      focus:false,invuln:0,roll:0,rollCooldown:0,rollX:0,rollY:-1,rollCharged:false,wake:0,firePulse:0,trail:[]};
    this.enemies=[]; this.bullets=[]; this.shots=[]; this.pickups=[]; this.particles=[];
    this.stats={kills:0,grazes:0,shotsFired:0,shotsHit:0,pickups:0,powerPeak:1,arsenalPeak:0,
      bombsUsed:0,rolls:0,conversions:0,hitsTaken:0,livesLost:0,bossesDefeated:0,reactorsBroken:0,
      scatters:0,salvageRecovered:0,salvageLost:0,reflected:0,orbitalEats:0};
    this.summary=null;
    this.boss=null; this.events=[]; this._seed=20261942; this._acc=0;
    this._beatIndex=0; this._laneIndex=0; this._transition=0; this._fireClock=0; this._comboClock=0;
    this._id=0; this._last={}; this._hitAudioClock=0; this._missileClock=0; this._rollSerial=0;
    this._sidewinderClock=0; this._signatureClock=0; this._escortVolley=0; this._bonusIndex=0;
    this._syncArsenal();
  }
  selectShip(id) {
    if(!SHIP_DEFS[id] || !["title","gameover","victory"].includes(this.mode)) return false;
    this.shipId=id;this.selectedShip=SHIP_DEFS[id];
    const p=this.player;
    p.shipId=id;p.weaponType=this.selectedShip.weapon;p.specialType=this.selectedShip.special;
    p.shield=id==="manta"?1:0;p.maxShield=id==="manta"?1:0;
    p.r=id==="manta"?9:id==="wraith"?7:8;
    p.drones=0;this._syncArsenal();
    this._event("shipSelect",p.x,p.y,id);
    return true;
  }
  get highScore() { return this.best; }
  get bestScore() { return this.best; }
  get progress() { return this.boss ? Math.max(0,1-this.boss.hp/this.boss.maxHp) :
    Math.min(1,this.stageTime/this.stageGoal[this.stage]); }
  _rand() { this._seed=(Math.imul(1664525,this._seed)+1013904223)>>>0; return this._seed/4294967296; }
  _range(a,b) { return a+(b-a)*this._rand(); }
  _clamp(v,a,b) { return Math.max(a,Math.min(b,v)); }
  _event(type,x,y,value) { this.events.push({type,x,y,value}); }
  _awardScore(points) {
    this.score += points;
    if(this.practiceStage)return;
    this.best = Math.max(this.best, this.score);
    // Four finite score extends give a good run a path through the long campaign.
    // The HUD has four life icons, so a stocked pilot receives a useful reserve instead.
    while (this._nextExtend < SCORE_EXTENDS.length && this.score >= SCORE_EXTENDS[this._nextExtend]) {
      this._nextExtend++;
      const p = this.player;
      let reward;
      if (p.lives < 4) { p.lives++; reward = "life"; }
      else if (p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + 2); reward = "shield"; }
      else if (p.bombs < 2) { p.bombs++; reward = "bomb"; }
      else { this.score += 2500; reward = "score"; }
      this.flash = Math.max(this.flash, .28);
      this._burst(p.x, p.y, 28, "gold", 150, "pickup");
      if (reward !== "score") this._event("pickup", p.x, p.y, reward);
      this._event("extend", p.x, p.y, SCORE_EXTENDS[this._nextExtend - 1]);
    }
  }
  // Power has no cap. One powerUp event per pickup carries the new level.
  _increasePower(amount=1) {
    const p=this.player;amount=Math.max(1,Math.floor(amount));
    p.level+=amount;p.power=p.level;p.drones=0;
    this.stats.powerPeak=Math.max(this.stats.powerPeak,p.level);
    this.flash=Math.max(this.flash,.25);
    this._burst(p.x,p.y,25,"cyan",125,"power");
    this._event("powerUp",p.x,p.y,p.level);
    this._syncArsenal();
    return true;
  }
  _addEscorts(pairs=1) {
    const p=this.player;let converted=0;
    for(let i=0;i<pairs;i++) {
      if(p.escorts<MAX_ESCORTS)p.escorts+=2;else converted+=2;
    }
    this._syncEscortSlots(true);
    if(pairs*2>converted)this._event("escortJoin",p.x,p.y,p.escorts);
    // A full wing is never wasted: each surplus pair becomes two levels.
    if(converted)this._increasePower(converted);
    this._syncArsenal();
  }
  _addShield(charges) {
    const p=this.player;p.shield+=charges;
    p.maxShield=Math.max(p.maxShield,p.shield);
    this._event("shieldUp",p.x,p.y,p.shield);this._syncArsenal();
  }
  _addReflector(seconds) {
    const p=this.player,was=p.reflector;p.reflector+=seconds;
    if(was<=0)this._event("reflectorUp",p.x,p.y,p.reflector);
  }
  _addSignature(levels) {
    const p=this.player;p.signature+=levels;
    this._syncOrbitals();this._event("signatureUp",p.x,p.y,p.signature);this._syncArsenal();
  }
  _syncArsenal() {
    const p=this.player;
    p.arsenal=p.level-1+p.escorts+p.sidewinder*1.5+p.signature*1.5+p.shield;
    if(this.stats)this.stats.arsenalPeak=Math.max(this.stats.arsenalPeak||0,p.arsenal);
  }
  _syncOrbitals() {
    const p=this.player,count=p.shipId==="wraith"?Math.min(ORBITALS_SHOWN,p.signature):0;
    while(p.orbitals.length>count)p.orbitals.pop();
    while(p.orbitals.length<count)p.orbitals.push({x:p.x,y:p.y,angle:0,cool:0,fire:0});
    p.orbitals.forEach((o,i)=>{o.angle=(p.orbitAngle||0)+i/count*Math.PI*2;});
  }
  _syncEscortSlots(snapNew=false) {
    const p=this.player;
    while(p.escortSlots.length>p.escorts)p.escortSlots.pop();
    while(p.escortSlots.length<p.escorts) {
      const i=p.escortSlots.length,side=i%2?1:-1;
      // New escorts sweep in from behind the wing instead of popping in place.
      p.escortSlots.push({x:p.x+side*90,y:Math.min(900,p.y+110),side,rank:Math.floor(i/2)});
    }
  }
  _start() { const best=this.best,id=this.shipId; this.reset(); this.shipId=id; this.best=best; this.mode="playing"; this._event("stage",270,170,1); }
  startDrill(stage) {
    stage=Math.max(1,Math.min(3,Math.floor(Number(stage)||1)));
    this._start();this.practiceStage=stage;this.stage=stage;this.stageTime=this.stageGoal[stage];
    // Drills start with a loadout matching the sector a campaign pilot would bring.
    const p=this.player,kit=DRILL_LOADOUTS[stage];
    p.level=p.power=kit.level;p.escorts=kit.escorts;p.sidewinder=kit.sidewinder;p.signature=kit.signature;
    p.drones=0;p.shield=p.maxShield=p.shipId==="manta"?2:0;
    this._syncEscortSlots();for(const slot of p.escortSlots){slot.x=p.x+slot.side*(42+slot.rank*30);slot.y=p.y+14;}
    this._syncOrbitals();this._syncArsenal();
    p.invuln=2;this.stats.powerPeak=p.level;
    this.events=[];this._spawnBoss();return true;
  }
  update(dt,input={}) {
    dt=this._clamp(Number.isFinite(dt)?dt:0,0,0.08);
    this.events=[];
    const pressed=k=>!!input[k]&&!this._last[k];
    if (["title","gameover","victory"].includes(this.mode)) {
      if (pressed("start")||pressed("fire")) this._start();
      this._last={...input}; return;
    }
    if (pressed("pause")) { this.mode=this.mode==="paused"?"playing":"paused"; this._event("pause",this.player.x,this.player.y); }
    if (this.mode!=="playing") { this._last={...input}; return; }
    if (pressed("bomb")) this._bomb();
    if (pressed("roll")) this._roll(input);
    this._last={...input};
    this._acc=Math.min(0.16,this._acc+dt);
    let ticks=0;
    while (this._acc>=1/120 && ticks++<16) {
      this._step(1/120,input); this._acc-=1/120;
      if (this.mode!=="playing") break;
    }
  }
  _step(h,input) {
    this.time+=h; this.stageTime+=h; this.scroll+=h*(112+this.stage*25);
    this._hitAudioClock=Math.max(0,this._hitAudioClock-h);
    this.shake=Math.max(0,this.shake-22*h); this.flash=Math.max(0,this.flash-2.2*h);
    const p=this.player;
    p.invuln=Math.max(0,p.invuln-h); p.roll=Math.max(0,p.roll-h);
    p.rollCooldown=Math.max(0,p.rollCooldown-h); p.firePulse=Math.max(0,p.firePulse-6*h);
    if(p.roll<=0)p.rollCharged=false;
    this._comboClock-=h;
    if (this._comboClock<=0&&this.combo>1) this.combo=Math.max(1,this.combo-h*.9);
    this._movePlayer(h,input);
    this._fireClock-=h;this._missileClock=Math.max(0,this._missileClock-h);
    this._sidewinderClock=Math.max(0,this._sidewinderClock-h);this._signatureClock=Math.max(0,this._signatureClock-h);
    const firing=!!input.fire&&this._transition<=0;
    if (firing&&this._fireClock<=0) {
      this._fire(); this._fireClock=p.focus?.092:.105;
    }
    if (firing) this._fireSupport();
    if (!input.fire) this._fireClock=Math.min(0,this._fireClock);
    this._updateArsenal(h,firing);
    if (this._transition>0) {
      this._transition-=h; if (this._transition<=0) this._advanceStage();
    } else if (!this.boss&&this.stageTime>=this.stageGoal[this.stage]) this._spawnBoss();
    else if (!this.boss) {
      const beats=STAGE_BEATS[this.stage];
      while(this._beatIndex<beats.length&&this.stageTime>=beats[this._beatIndex][0]) {
        this._spawnStageBeat(beats[this._beatIndex][1]);
        this._beatIndex++;
      }
      const lanes=LANE_BEATS[this.stage];
      while(this._laneIndex<lanes.length&&this.stageTime>=lanes[this._laneIndex][0]) {
        this._spawnLaneSweep(lanes[this._laneIndex][1]);
        this._laneIndex++;
      }
    }
    if(this.mode!=='playing')return;
    this._updateEnemies(h); this._updateBullets(h); this._applyReactorCover(); this._updateShots(h);
    this._updatePickups(h); this._updateParticles(h); this._collide(); this._cleanup();
    this._enforceShotBudget();
  }
  _movePlayer(h,input) {
    const p=this.player; p.focus=!!input.focus;
    const oldX=p.x,oldY=p.y;
    const edge=p.shipId==="wraith"?62:p.shipId==="manta"?52:46;
    let dx=Number(!!input.right)-Number(!!input.left),dy=Number(!!input.down)-Number(!!input.up);
    const len=Math.hypot(dx,dy);
    if (len) { dx/=len; dy/=len; }
    else {
      dx=this._clamp(Number(input.moveX)||0,-1,1);
      dy=this._clamp(Number(input.moveY)||0,-1,1);
      const analogLength=Math.hypot(dx,dy);
      if(analogLength>1){dx/=analogLength;dy/=analogLength;}
    }
    if (p.roll>0) { p.x+=p.rollX*740*h; p.y+=p.rollY*740*h; }
    else if (input.pointerActive&&Number.isFinite(input.pointerX)&&Number.isFinite(input.pointerY)) {
      const tx=this._clamp(input.pointerX,edge,540-edge),ty=this._clamp(input.pointerY,230,820);
      const dist=Math.hypot(tx-p.x,ty-p.y);
      const speed=p.shipId==="manta"?(p.focus?185:420):p.shipId==="wraith"?(p.focus?230:500):(p.focus?210:460);
      const t=dist?Math.min(1,speed*h/dist):1;
      p.x+=(tx-p.x)*t; p.y+=(ty-p.y)*t;
    } else { const speed=p.shipId==="manta"?(p.focus?170:325):p.shipId==="wraith"?(p.focus?205:405):(p.focus?190:360); p.x+=dx*speed*h; p.y+=dy*speed*h; }
    p.x=this._clamp(p.x,edge,540-edge); p.y=this._clamp(p.y,230,820);
    if(Math.hypot(p.x-oldX,p.y-oldY)>.01){p.headingX=p.x-oldX;p.headingY=p.y-oldY;}
    p.bank=(p.bank||0)+(this._clamp((p.x-oldX)/(h*360),-1,1)-(p.bank||0))*Math.min(1,h*10);
    p.trail.push({x:p.x,y:p.y,life:.3,focus:p.focus});
    if (p.trail.length>20) p.trail.shift();
    for (const q of p.trail) q.life-=h;
    while (p.trail.length&&p.trail[0].life<=0) p.trail.shift();
    if (this._rand()<h*(p.focus?15:32))
      this._particle(p.x+this._range(-8,8),p.y+22,this._range(-12,12),this._range(60,150),.32,this._range(2,5),"cyan","engine");
  }
  _roll(input) {
    const p=this.player; if (p.rollCooldown>0||p.roll>0) return;
    let dx=Number(!!input.right)-Number(!!input.left),dy=Number(!!input.down)-Number(!!input.up);
    if(!dx&&!dy){dx=Number(input.moveX)||0;dy=Number(input.moveY)||0;}
    if(!dx&&!dy&&input.pointerActive){
      dx=(Number(input.pointerX)||p.x)-p.x;dy=(Number(input.pointerY)||p.y)-p.y;
      if(Math.hypot(dx,dy)<1){dx=p.headingX||0;dy=p.headingY||0;}
    }
    const len=Math.hypot(dx,dy); if (len<.1) {dx=0;dy=-1;} else {dx/=len;dy/=len;}
    const charged=p.wake>=.5;
    if(charged)p.wake-=.5;
    this.stats.rolls++;this._rollSerial++;
    p.rollCharged=charged;p.rollX=dx;p.rollY=dy;p.roll=charged?.34:.25;
    p.rollCooldown=charged?2.6:2.2;p.invuln=Math.max(p.invuln,charged?.45:.36);
    this.shake=Math.max(this.shake,charged?5:3);this._burst(p.x,p.y,charged?38:18,"cyan",charged?170:110,"roll");
    this._event("roll",p.x,p.y);if(charged)this._event("wakeRoll",p.x,p.y,p.wake);
  }
  _bomb() {
    const p=this.player;if(p.bombs<=0)return;
    const special=p.specialType;
    p.bombs--;this.stats.bombsUsed++;
    p.invuln=Math.max(p.invuln,2.4);this.shake=special==="storm"?18:15;this.flash=.85;
    const erased=this.bullets.length;
    const specialColor=special==="barrier"?"cyan":special==="storm"?"magenta":"gold";
    for(const b of this.bullets) this._particle(b.x,b.y,0,0,.28,3,specialColor,"spark");
    this.bullets.length=0;
    if(this.boss?.lance){this.boss.lance.cancelled=true;this.boss.lance.active=false;this._event('lanceCancel',this.boss.lance.x,this.boss.lance.y);}
    // The Manta trades damage for restored armor. The Wraith converts the
    // whole field into score; the Kestrel retains the high-impact nova.
    if(special==="barrier") {
      // Restores a spent charge; growth beyond the life's best comes from S pickups.
      p.shield=Math.min(Math.max(1,p.maxShield),p.shield+1);this._syncArsenal();
      this._event("shieldRestore",p.x,p.y,p.shield);
    } else if(special==="storm" && erased) {
      const points=erased*120;
      this._awardScore(points);
      p.wake=Math.min(1,p.wake+Math.min(.5,erased*.025));
      this.stats.conversions+=erased;this.wakeConversions+=erased;
      this.events.push({type:"wakeConvert",x:p.x,y:p.y,value:erased,points,resource:Math.min(.5,erased*.025)});
    }
    const damage=special==="barrier"?120:special==="storm"?260:400;
    const bossDamage=special==="barrier"?100:special==="storm"?300:390;
    for(const e of [...this.enemies]) {
      this._damageEnemy(e,e.type==="boss"?bossDamage:damage);e.flash=1;
      if(e.hp<=0)this._killEnemy(e,true);
    }
    this._burst(p.x,p.y,special==="barrier"?20:special==="storm"?36:48,
      specialColor,special==="barrier"?220:special==="storm"?440:540,"bomb");
    this._event("bomb",p.x,p.y,special);
    this._event("special",p.x,p.y,special);
  }
  _shot(shot) { this.shots.push(shot); this.stats.shotsFired++; return shot; }
  // Main gun. Measured single-target DPS (fire held, unfocused; balance bot):
  //   power 1: 110-165, power 5: 245-330, power 10: 480-690, power 15: 610-880.
  // Kestrel trades single-target damage for width (best row DPS).
  // Streams stop growing at STREAM_CEILING; damage keeps scaling with no maximum.
  _fire() {
    const p=this.player,level=p.level,structural=Math.min(level,STREAM_CEILING);
    const over=Math.max(0,level-STREAM_CEILING),scale=1+over*OVERPOWER_DAMAGE,grow=Math.min(2.5,over*.12);
    if(p.weaponType==="spread") {
      // Kestrel: 2 streams at power 1, 9 at power 8. The core columns stay
      // parallel (1942 tracer wall); only the outermost pair fans out.
      const n=structural+1,center=(n-1)/2,core=Math.max(1.5,center-1);
      for(let i=0;i<n;i++) {
        const off=i-center,fan=Math.max(0,Math.abs(off)-core)*Math.sign(off);
        this._shot({x:p.x+off*(p.focus?6:8),y:p.y-20,
          vx:fan*(p.focus?16:62),vy:-870,r:(level>=4?4.5:3.5)+grow,
          damage:(p.focus?8:7)*scale,kind:p.focus?"lance":"shot",age:0});
      }
    } else if(p.weaponType==="missile") {
      // Manta: twin guns to quad guns by power 5, plus homing salvos that grow
      // from 1 to 4 missiles and speed up to the ceiling.
      const n=Math.min(4,1+Math.ceil(structural/2)),center=(n-1)/2;
      for(let i=0;i<n;i++) {
        const off=i-center;
        this._shot({x:p.x+off*13,y:p.y-20,vx:off*(p.focus?12:48),vy:-800,
          r:3.8+grow,damage:(p.focus?8:7)*scale,kind:"shot",age:0});
      }
      if(this._missileClock<=0) {
        const count=Math.min(4,1+Math.floor((structural-1)/2));
        for(let i=0;i<count;i++) {
          const side=count===1?0:(i%2?1:-1)*(1+Math.floor(i/2));
          this._shot({x:p.x+side*17,y:p.y-12,vx:side*80,vy:-460,
            r:6+grow*.5,damage:(25+structural*2)*scale,kind:"missile",age:0,targetId:null});
        }
        this._missileClock=Math.max(.42,.62-structural*.025);
        this._event("missileLaunch",p.x,p.y,p.shipId);
      }
    } else {
      // Wraith: one rail, twin rails at 3, triple rails at 6; each level adds
      // rail damage and pierce up to the ceiling, then 6% damage per level.
      const n=structural>=6?3:structural>=3?2:1;
      const damage=((p.focus?14:12)+(structural-1)*1.6)*scale;
      for(let i=0;i<n;i++) {
        const off=n===1?0:n===2?(i?9:-9):(i-1)*12;
        this._shot({x:p.x+off,y:p.y-22,vx:0,vy:-1020,
          r:4+structural*.15+grow,damage,kind:"pierce",age:0,pierceRemaining:2+Math.floor(structural/2),hitIds:[]});
      }
    }
    this._fireEscorts();
    p.firePulse=1;this._event("shoot",p.x,p.y-20);
  }
  // Escorts fire a light copy of the ship's weapon on every main-gun tick.
  // ~75 DPS per escort at power 1, +4% per level (uncapped).
  _fireEscorts() {
    const p=this.player;if(!p.escorts)return;
    const scale=1+(p.level-1)*.04;
    this._escortVolley++;
    for(const slot of p.escortSlots) {
      const spread=p.focus?0:slot.side*(.035+slot.rank*.02);
      if(p.shipId==="kestrel") {
        for(const dx of [-3,3])this._shot({x:slot.x+dx,y:slot.y-12,vx:spread*870,vy:-880,
          r:2.8,damage:4*scale,kind:"escort",style:"cannon",age:0});
      } else if(p.shipId==="manta") {
        this._shot({x:slot.x,y:slot.y-12,vx:spread*700,vy:-700,
          r:3.4,damage:8*scale,kind:"escort",style:"rocket",age:0});
      } else {
        this._shot({x:slot.x,y:slot.y-14,vx:0,vy:-1000,r:2.6,damage:6.5*scale,
          kind:"escort",style:"rail",age:0,pierceRemaining:2,hitIds:[]});
      }
    }
  }
  _fireSupport() {
    const p=this.player;
    // Sidewinders: volley 2*min(level,3); cadence 1.05 s down to a 0.35 s floor
    // at level 6; damage +25% per level past 3 (uncapped).
    if(p.sidewinder>0&&this._sidewinderClock<=0) {
      const count=2*Math.min(p.sidewinder,3);
      const damage=14*(1+Math.max(0,p.sidewinder-3)*.25);
      for(let i=0;i<count;i++) {
        const side=i%2?1:-1,rank=Math.floor(i/2);
        this._shot({x:p.x+side*(24+rank*9),y:p.y+2+rank*4,vx:side*(150+rank*45),vy:-240+rank*30,
          r:4,damage,kind:"sidewinder",age:0,targetId:null});
      }
      this._sidewinderClock=Math.max(.35,1.05-(p.sidewinder-1)*.14);
      this._event("sidewinderLaunch",p.x,p.y,count);
    }
    if(p.signature>0&&this._signatureClock<=0) {
      if(p.shipId==="kestrel")this._fireFlak();
      else if(p.shipId==="manta")this._fireTorpedoes();
    }
  }
  // Kestrel "Hellfire Wings": each level adds a gun pair (forward flak, rear
  // guns, wide flak, steep rear) up to four pairs, then +10% damage per level.
  // Cadence 0.275 s at level 1 down to a 0.1 s floor.
  _fireFlak() {
    const p=this.player,sig=p.signature,pairs=Math.min(4,sig);
    const damage=6*(1+Math.max(0,sig-4)*.1);
    // Angles are measured from straight up; values past PI/2 point backward.
    const mounts=[[.38,20],[Math.PI-.5,12],[.72,28],[Math.PI-.2,6]];
    for(let k=0;k<pairs;k++) {
      const [angle,wing]=mounts[k];
      for(const side of [-1,1]) {
        const a=side*angle;
        this._shot({x:p.x+side*wing,y:p.y+(angle>1.6?12:-6),vx:Math.sin(a)*760,vy:-Math.cos(a)*760,
          r:3.2,damage,kind:"flak",age:0});
      }
    }
    this._signatureClock=Math.max(.1,.3-sig*.025);
  }
  // Manta "Hammer Torpedoes": slow-accelerating boss-killers. 1 torpedo per
  // 1.38 s at level 1 (~40 DPS), 2 at level 3, 3 at level 5; +15% damage per
  // level (uncapped); cadence floor 0.55 s.
  _fireTorpedoes() {
    const p=this.player,sig=p.signature,count=Math.min(3,1+Math.floor((sig-1)/2));
    for(let i=0;i<count;i++) {
      const off=count===1?0:count===2?(i?16:-16):(i-1)*22;
      this._shot({x:p.x+off,y:p.y-4,vx:0,vy:-120,r:6.5,damage:55*(1+(sig-1)*.15),
        kind:"torpedo",age:0,pierceRemaining:99,hitIds:[]});
    }
    this._signatureClock=Math.max(.55,1.5-sig*.12);
    this._event("torpedoLaunch",p.x,p.y,count);
  }
  _updateArsenal(h,firing) {
    const p=this.player;
    if(p.reflector>0) {
      p.reflector=Math.max(0,p.reflector-h);
      if(p.reflector<=0)this._event("reflectorDown",p.x,p.y,0);
    }
    // Escorts follow with a spring lag: wide flank cover, or a tight forward
    // column while focused.
    this._syncEscortSlots();
    for(const slot of p.escortSlots) {
      const tx=p.focus?p.x+slot.side*(20+slot.rank*13):p.x+slot.side*(42+slot.rank*30);
      const ty=p.focus?p.y-8-slot.rank*12:p.y+14+slot.rank*16;
      const k=Math.min(1,h*(10-slot.rank*2));
      slot.x+=(this._clamp(tx,12,528)-slot.x)*k;slot.y+=(ty-slot.y)*k;
    }
    // Wraith "Ghost Orbitals": count = signature (up to 6 shown); levels past 6
    // speed the 0.6 s eat cooldown and the 0.32 s rail cadence by 15% each.
    if(p.orbitals.length) {
      const haste=1+Math.max(0,p.signature-ORBITALS_SHOWN)*.15;
      p.orbitAngle=((p.orbitAngle||0)+h*2.4)%(Math.PI*2);
      const n=p.orbitals.length,scale=1+(p.level-1)*.04;
      p.orbitals.forEach((o,i)=>{
        o.angle=p.orbitAngle+i/n*Math.PI*2;
        o.x=p.x+Math.cos(o.angle)*ORBIT_RADIUS;o.y=p.y+Math.sin(o.angle)*ORBIT_RADIUS*.82;
        o.cool=Math.max(0,o.cool-h*haste);o.fire=Math.max(0,(o.fire||0)-h);
        if(firing&&o.fire<=0) {
          this._shot({x:o.x,y:o.y-6,vx:0,vy:-960,r:2.6,damage:6*scale,kind:"orbital",age:0});
          o.fire=.32/haste;
        }
      });
    }
  }
  // Keep at most SHOT_BUDGET live player shots, dropping the oldest small
  // shots first so missiles, rails and torpedoes survive dense scenes.
  _enforceShotBudget() {
    let excess=this.shots.length-SHOT_BUDGET;if(excess<=0)return;
    for(const pass of [true,false]) {
      let write=0;
      for(let read=0;read<this.shots.length;read++) {
        const shot=this.shots[read];
        if(excess>0&&(!pass||SMALL_SHOTS.has(shot.kind))){excess--;continue;}
        this.shots[write++]=shot;
      }
      this.shots.length=write;if(excess<=0)return;
    }
  }
  _enemy(type,x,y,o={}) {
    const specs={scout:[22,15,150,160],wing:[30,17,155,220],bomber:[72,25,98,470],
      ace:[50,20,170,400],turret:[90,22,94,420],carrier:[125,27,75,600],mini:[250,34,54,1200]};
    const [baseHp,r,vy,value]=specs[type],hp=baseHp*(1+(this.stage-1)*.22);
    const e={id:++this._id,type,x,y,baseX:x,r,hp,maxHp:hp,age:0,vy:o.vy??vy,
      vx:o.vx||0,turnAt:o.turnAt||999,turnVx:o.turnVx||0,amp:o.amp||0,freq:o.freq||1.4,phase:o.phase||0,
      fireAt:o.fireAt??this._range(.9,2.1),fireRate:o.fireRate||2.4,
      flash:0,angle:0,seed:this._rand(),value,drop:o.drop||null};
    this.enemies.push(e);return e;
  }
  _spawnStageBeat(pattern) {
    if(pattern==="drift") this._spawnDrift();
    else if(pattern==="flank") this._spawnFlank();
    else this._spawnWave(pattern);
    this._event("wave",270,0,pattern);
  }
  _spawnWave(pattern) {
    this.wave++;
    const w=this.wave,s=this.stage;
    if(pattern==="split") {
      // Split spearhead: two readable lanes that close toward the centre.
      for(let i=0;i<8+s;i++) {
        const x=46+i*(448/(7+s));
        this._enemy("scout",x,-25-Math.abs(i-(7+s)/2)*32,
          {amp:(x<270?1:-1)*27,phase:i*.28,fireAt:1.35+i*.065});
      }
      this._enemy("wing",100,-115,{vx:55,amp:20,fireAt:1.65});
      this._enemy("wing",440,-115,{vx:-55,amp:-20,fireAt:1.65});
    } else if(pattern==="wing") {
      for(let i=0;i<6+s;i++) {
        const x=70+i*(400/(5+s));
        this._enemy("wing",x,-28-Math.abs(i-(5+s)/2)*24,
          {vx:(270-x)*.11,amp:22,phase:i*.54,fireAt:1.4});
      }
      this._enemy("carrier",270,-125,{drop:"power",fireAt:1.75});
    } else if(pattern==="bomber") {
      this._enemy("bomber",132,-42,{amp:42,fireRate:2.05,fireAt:1.35});
      this._enemy("bomber",408,-88,{amp:-42,phase:2,fireRate:2.05,fireAt:1.6});
      for(let i=0;i<5+s;i++)
        this._enemy("scout",58+i*(424/(4+s)),-80-i*21,{amp:i%2?32:-32,phase:i*.7,fireAt:1.55});
    } else if(pattern==="ace") {
      this._enemy("ace",80,-42,{vx:90,turnAt:2.2,turnVx:-145,amp:24,fireRate:1.38,drop:w===4?"bomb":null});
      this._enemy("ace",460,-76,{vx:-90,turnAt:2.2,turnVx:145,amp:-24,phase:2,fireRate:1.38});
      for(let i=0;i<5+s;i++)
        this._enemy("wing",65+i*(410/(4+s)),-90-i*24,{fireAt:1.6});
    } else if(pattern==="turret") {
      for(let i=0;i<3;i++)
        this._enemy("turret",95+i*175,-45-i*48,{fireRate:1.9,drop:i===1?"power":null});
      for(let i=0;i<6+s;i++)
        this._enemy("scout",45+i*(450/(5+s)),-138-i*26,{amp:55,phase:i*.48});
    } else if(pattern==="mini") {
      this._enemy("mini",this._range(170,370),-85,{fireRate:1.35,drop:"power"});
      for(let i=0;i<6+s;i++)
        this._enemy("scout",50+i*(440/(5+s)),-45-i*27,{amp:i%2?33:-33,fireAt:1.6});
    } else if(pattern==="cross") {
      for(let i=0;i<9+s;i++) {
        const side=i%2?1:-1;
        this._enemy("wing",side>0?485:55,-22-i*31,
          {vx:-side*95,turnAt:2,turnVx:side*135,amp:side*23,fireAt:1.55+i*.08});
      }
      this._enemy("carrier",270,-205,{drop:"shield"});
    } else if(pattern==="pincer") {
      // The second pass comes from the sides, leaving a readable centre lane.
      for(const side of [-1,1])
        for(let i=0;i<3;i++) this._enemy("ace",side<0?-25:565,-30-i*70,
          {vx:-side*(94+i*9),vy:105,turnAt:2.5,turnVx:side*125,
           fireAt:1.55+i*.2,fireRate:2.15,drop:i===1&&side<0?"shield":null});
    } else if(pattern==="relay") {
      // Alternating columns create a moving gap instead of a solid wall.
      for(let i=0;i<6;i++) {
        const side=i%2?-1:1;
        this._enemy("wing",side>0?425:115,-30-i*59,
          {vx:-side*38,amp:side*26,fireAt:1.45+i*.13,fireRate:2.75});
      }
      // Only each sector's closing relay carries a bomb; earlier relays repair.
      const lastRelay=this.stage===2?this.stageTime>=60:this.stageTime>=70;
      this._enemy("carrier",270,-440,{drop:lastRelay?"bomb":"shield",fireAt:2.3,fireRate:3.2});
    } else if(pattern==="curtain") {
      // Staggered lanes announce the last sector without sealing all exits.
      for(let i=0;i<7;i++) this._enemy("wing",55+i*72,-28-i*57,
        {amp:i%2?18:-18,fireAt:1.35+i*.12,fireRate:2.65});
      this._enemy("turret",270,-500,{fireAt:2.2,fireRate:2.8});
    }
  }
  _spawnLaneSweep(gap) {
    // Two slow rows announce the danger at mid-field before reaching the
    // player. The next opening moves a short, reachable distance sideways.
    const color=this.stage===3?"magenta":this.stage===2?"rose":"amber";
    const speed=138+this.stage*11;
    const next=this._clamp(gap+(gap<270?90:-90),95,445);
    for(let row=0;row<2;row++) {
      const opening=row?next:gap,y=row?-165:-40;
      for(let x=24;x<=516;x+=28)
        if(Math.abs(x-opening)>68)
          this._bullet(x,y,Math.PI/2,speed,color,5.2);
    }
    this.events.push({type:"lane",x:gap,y:-40,value:next,speed,rows:[{x:gap,y:-40},{x:next,y:-165}]});
  }
  _spawnDrift() {
    const left=this._range(75,175),right=540-left;
    this._enemy("scout",left,-26,{amp:24,phase:this._rand()*3,fireAt:99});
    this._enemy("scout",270,-72,{amp:this._range(-22,22),fireAt:1.85,fireRate:3.6});
    this._enemy("scout",right,-46,{amp:-24,phase:this._rand()*3,fireAt:99});
  }
  _spawnFlank() {
    const y=310+this._range(-30,35);
    this._enemy("ace",-28,y,{vy:92,vx:126,turnAt:2.5,turnVx:-165,
      amp:10,fireAt:1.65,fireRate:3.5});
    this._enemy("ace",568,y+35,{vy:92,vx:-126,turnAt:2.5,turnVx:165,
      amp:-10,fireAt:1.85,fireRate:3.5});
    this._event("flank",270,y,0);
  }
  _spawnBoss() {
    this.enemies=[];this.bullets.length=0;
    const names=["","VESPER","AURELIA","THE CROWN"];
    const hp=[0,2600,4700,5800][this.stage];
    this.boss={id:++this._id,type:"boss",name:names[this.stage],
      x:270,y:-145,r:70,hp,maxHp:hp,age:0,phase:1,fireAt:4.1,
      flash:0,angle:0,guard:false,guardUntil:0,
      seed:this._rand(),value:12000*this.stage};
    this.enemies.push(this.boss);
    this.flash=.45;this.shake=5;this._event("bossEnter",270,285,this.stage);
  }
  _updateEnemies(h) {
    const p=this.player;
    for(const e of this.enemies) {
      e.age+=h;e.flash=Math.max(0,e.flash-h*5);
      e.impactCooldown=Math.max(0,(e.impactCooldown||0)-h);
      if(e.type==="boss") {
        const entrance=Math.min(1,e.age/2.8);
        e.y=-145+(e.age<2.8?(1-(1-entrance)**3)*430:430);
        e.x=270+Math.sin((e.age-2.8)*(.48+this.stage*.09))*(78+this.stage*4);
        e.angle=Math.sin(e.age*1.2)*.05;
        const phase=e.phase===1&&e.hp<e.maxHp*.66&&e.age>=BOSS_LEARN_AGES.phase2?2:
          e.phase===2&&e.hp<e.maxHp/3&&e.age>=BOSS_LEARN_AGES.phase3?3:e.phase;
        if(phase>e.phase) {
          if(e.guard)this._event("bossGuardEnd",e.x,e.y,e.phase);
          e.guard=false;e.guardUntil=0;
          e.phase=phase;this.flash=Math.max(this.flash,.35);this.shake=Math.max(this.shake,6);
          // A flare and brief ceasefire tell the player that the pattern changed.
          e.fireAt=e.age+1.15;this.bullets.length=0;
          this._burst(e.x,e.y,50,"magenta",230,"phase");
          this._particle(e.x,e.y,0,0,.65,10,"magenta","ring");
          this._event("bossPhase",e.x,e.y,phase);
        }
        if(e.phase===3&&e.guard&&e.age>=BOSS_LEARN_AGES.defeat) {
          e.guard=false;e.guardUntil=0;
          this._event("bossGuardEnd",e.x,e.y,3);
        }
        if(this.stage===2&&e.phase>=2){
          if(e.reactor?.phase!==e.phase){
            const side=e.phase===2?-1:1,maxHp=e.phase===2?120:160;
            e.reactor={id:-e.id*10-e.phase,phase:e.phase,side,hp:maxHp,maxHp,r:22,opensAt:e.age+.9};
            this._event('reactorOpen',e.x,e.y,side);
          }
          const r=e.reactor,angle=e.angle||0;
          // The arm extends into a side position during the opening cue.
          // Holding the central firing line must not also collect both targets.
          const extension=1-(1-this._clamp((e.age-r.opensAt+.9)/.9,0,1))**3;
          const wingX=e.x+r.side*126*Math.cos(angle)-24*Math.sin(angle);
          const wingY=e.y+r.side*126*Math.sin(angle)+24*Math.cos(angle);
          r.x=wingX+((r.side<0?108:432)-wingX)*extension;
          r.y=wingY+(e.y+58-wingY)*extension;
        }
        if(this.stage===3&&e.phase>=2)this._updateBossLance(e);
        if(e.age>2.8&&e.age>=e.fireAt) {
          this._bossFire(e);
          e.fireAt=e.age+(e.phase===3 ? (this.stage===1 ? 0.52 : this.stage===2 ? 0.48 : 0.42) : e.phase===2 ? 0.58 : 0.78);
        }
      } else {
        e.x=e.baseX+e.vx*e.age+e.turnVx*Math.max(0,e.age-e.turnAt)+e.amp*Math.sin(e.age*e.freq+e.phase);
        e.y+=e.vy*h;
        e.angle=Math.atan2(e.vx+(e.age>e.turnAt?e.turnVx:0)+e.amp*e.freq*Math.cos(e.age*e.freq+e.phase),e.vy)*.35;
        if(e.age>=e.fireAt&&e.y>20&&e.y<680) {
          this._enemyFire(e,p);
          e.fireAt=e.age+e.fireRate*(1-(this.stage-1)*.08);
        }
      }
    }
  }
  _updateBossLance(boss) {
    let l=boss.lance;
    if(!l||l.phase!==boss.phase||boss.age>=l.nextAt){
      const startsAt=boss.age+.35;
      l=boss.lance={phase:boss.phase,x:this._clamp(this.player.x,64,476),y:boss.y+110,width:48,
        startsAt,locksAt:startsAt+.65,firesAt:startsAt+1.5,endsAt:startsAt+1.95,nextAt:startsAt+(boss.phase===3?3.5:4.1)};
    }
    l.y=boss.y+110;
    if(boss.age<l.locksAt)l.x=this._clamp(this.player.x,64,476);
    if(!l.cancelled&&boss.age>=l.locksAt&&!l.locked){l.locked=true;this._event('lanceLock',l.x,l.y);}
    if(!l.cancelled&&boss.age>=l.firesAt&&!l.fired){l.fired=true;this._event('lanceFire',l.x,l.y);}
    l.active=!l.cancelled&&boss.age>=l.firesAt&&boss.age<l.endsAt;
  }
  _enemyFire(e,p) {
    const speed=160+this.stage*18;
    if(e.type==="scout") this._aimed(e.x,e.y+14,p.x,p.y,speed,"red",4.5);
    else if(e.type==="wing") this._spread(e.x,e.y+15,p.x,p.y,5,.115,speed+5,"amber",4.5);
    else if(e.type==="bomber") this._spread(e.x,e.y+20,p.x,p.y,7,.12,speed-20,"rose",5);
    else if(e.type==="ace") this._spread(e.x,e.y+20,p.x,p.y,3,.1,speed+75,"cyan",4);
    else if(e.type==="turret") this._spread(e.x,e.y+15,p.x,p.y,5,.22,speed-35,"magenta",5);
    else if(e.type==="carrier") this._radial(e.x,e.y,9,speed-35,e.age*.7,"amber",5);
    else if(e.type==="mini") {
      this._radial(e.x,e.y,12,speed-15,e.age*.5,"magenta",5);
      this._spread(e.x,e.y+20,p.x,p.y,3,.12,speed+25,"red",5);
    }
  }
  _bossFire(e) {
    const p=this.player,phase=e.phase,stage=this.stage;
    const salvo=e.salvo=(e.salvo||0)+1;
    const speed=140+stage*14+phase*8;
    const sway=Math.sin(e.age*.8)*.09;
    if(stage===1) {
      // Vesper sweeps broad amber tide fans, then splits fire between wing cannons.
      if(phase===1) {
        this._radial(e.x,e.y+30,17,speed,sway,"amber",4.8,Math.PI*.15,Math.PI*.85);
        if(salvo%2===0)for(const side of [-1,1])
          this._spread(e.x+side*58,e.y+26,p.x,p.y,3,.13,speed+65,"red",4.8);
      } else if(phase===2) {
        for(const side of [-1,1])
          this._radial(e.x+side*58,e.y+24,11,speed,side*.13+sway,"magenta",4.7,Math.PI*.17,Math.PI*.83);
        if(salvo%2===0)this._spread(e.x,e.y+48,p.x,p.y,5,.1,speed+82,"cyan",4.6);
      } else {
        this._radial(e.x,e.y+35,18,speed+18,sway,"magenta",4.8,Math.PI*.1,Math.PI*.9);
        // The counter-tide lands between magenta waves instead of stacking a
        // second full fan on every beat. Phase three still outruns phase two.
        if(salvo%2===0)this._radial(e.x,e.y+35,18,speed-24,-sway+.07,"amber",4.5,Math.PI*.1,Math.PI*.9);
        if(salvo%3===0)this._spread(e.x,e.y+48,p.x,p.y,5,.105,speed+85,"red",5);
      }
    } else if(stage===2) {
      // Aurelia's mirrored wing spirals weave around slower central volleys.
      const angle=e.age*.34;
      if(phase===1) {
        for(const side of [-1,1])
          this._radial(e.x+side*58,e.y+24,11,speed,angle*side,"cyan",4.7);
        if(salvo%3===0)this._spread(e.x,e.y+45,p.x,p.y,5,.16,speed+65,"rose",5);
      } else if(phase===2) {
        for(const side of [-1,1])
          this._radial(e.x+side*58,e.y+24,13,speed+8,angle*side,"magenta",4.7);
        this._radial(e.x,e.y+38,11,speed-25,-angle,"amber",4.4,Math.PI*.12,Math.PI*.88);
      } else {
        this._radial(e.x,e.y+35,21,speed+14,sway,"amber",4.5,Math.PI*.08,Math.PI*.92);
        if(salvo%2===0)for(const side of [-1,1]){
          if(side===1&&e.reactor?.phase===3&&e.reactor.broken)continue;
          this._radial(e.x+side*58,e.y+24,12,speed,angle*side,"cyan",4.7);
        }
        if(salvo%2===0)this._spread(e.x,e.y+48,p.x,p.y,5,.12,speed+80,"red",4.8);
      }
    } else {
      // The Crown compresses mirrored curtains into a rotating final crossfire.
      const angle=e.age*.28;
      if(phase===1) {
        this._radial(e.x,e.y+38,23,speed,Math.sin(e.age*.5)*.13,"amber",4.8,Math.PI*.08,Math.PI*.92);
        if(salvo%2===0)this._spread(e.x,e.y+48,p.x,p.y,7,.13,speed+75,"red",5);
      } else if(phase===2) {
        this._radial(e.x-60,e.y+24,14,speed,angle,"magenta",4.5);
        this._radial(e.x+60,e.y+24,14,speed,-angle,"cyan",4.5);
        if(salvo%2===0)this._spread(e.x,e.y+48,p.x,p.y,5,.11,speed+82,"red",5);
      } else {
        this._radial(e.x,e.y+38,19,speed+20,sway,"magenta",4.6,Math.PI*.06,Math.PI*.94);
        this._radial(e.x,e.y+38,19,speed-28,-sway+.05,"amber",4.4,Math.PI*.06,Math.PI*.94);
        if(salvo%2===0)this._spread(e.x,e.y+48,p.x,p.y,7,.105,speed+95,"cyan",4.5);
      }
    }
    this._burst(e.x-58,e.y+24,3,"gold",55,"muzzle");
    if(!(stage===2&&phase===3&&e.reactor?.broken))this._burst(e.x+58,e.y+24,3,"gold",55,"muzzle");
    this._event("bossShot",e.x,e.y);
  }
  _damageEnemy(e,amount) {
    if(e.type!=="boss") {e.hp-=amount;return;}
    // One threshold per learned pattern. Incoming fire still shows impacts,
    // while each phase has time to establish its distinctive attack.
    const until=e.phase===1?BOSS_LEARN_AGES.phase2:
      e.phase===2?BOSS_LEARN_AGES.phase3:BOSS_LEARN_AGES.defeat;
    const floor=e.age<until?(e.phase===1?Math.floor(e.maxHp*.66)-1:
      e.phase===2?Math.floor(e.maxHp/3)-1:1):0;
    const attempted=e.hp-amount;
    if(floor>0&&attempted<=floor&&!e.guard) {
      e.guard=true;e.guardUntil=until;
      this._event("bossGuard",e.x,e.y,e.phase);
    }
    e.hp=Math.max(floor,attempted);
  }
  _breakReactor(boss) {
    const r=boss.reactor;if(!r||r.broken)return;
    r.hp=0;r.broken=true;this.stats.reactorsBroken++;
    boss.cover={x:r.x,y:r.y,until:boss.age+3.2,side:r.side,width:88};
    const previousWake=this.player.wake;this.player.wake=Math.min(1,previousWake+.2);this._awardScore(1000);
    if(previousWake<.5&&this.player.wake>=.5)this._event('wakeReady',this.player.x,this.player.y,this.player.wake);
    this._burst(r.x,r.y,24,'gold',190,'hit');
    this._event('reactorBreak',r.x,r.y,r.side);
    this._applyReactorCover();
  }
  _applyReactorCover() {
    const boss=this.boss,cover=boss?.cover;
    if(!cover||boss.age>=cover.until)return;
    for(const bullet of this.bullets)if(!bullet.dead&&bullet.y>=cover.y-24&&Math.abs(bullet.x-cover.x)<cover.width/2)bullet.dead=true;
  }
  _aimed(x,y,tx,ty,speed,kind,r=5) {
    this._bullet(x,y,Math.atan2(ty-y,tx-x),speed,kind,r);
  }
  _spread(x,y,tx,ty,count,step,speed,kind,r=5) {
    const a=Math.atan2(ty-y,tx-x);
    for(let i=0;i<count;i++) this._bullet(x,y,a+(i-(count-1)/2)*step,speed,kind,r);
  }
  _radial(x,y,count,speed,offset,kind,r=5,from=0,to=Math.PI*2) {
    for(let i=0;i<count;i++) this._bullet(x,y,offset+from+i/count*(to-from),speed,kind,r);
  }
  _bullet(x,y,angle,speed,kind,r) {
    if(this.bullets.length>=BULLET_CAP) return;
    this.bullets.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
      r,kind,color:kind,age:0,grazed:false});
  }
  _updateBullets(h) { for(const b of this.bullets) {b.x+=b.vx*h;b.y+=b.vy*h;b.age+=h;} }
  _updateShots(h) {
    for(const shot of this.shots) {
      const homing=shot.kind==="missile"||shot.kind==="sidewinder";
      if(shot.kind==="torpedo") {
        // Hammer torpedoes start slow and accelerate to 900 px/s.
        shot.vy=Math.max(-900,shot.vy-h*1100);
        if(this._rand()<h*30)this._particle(shot.x,shot.y+10,0,60,.22,3,"cyan","engine");
      } else if(homing) {
        let target=this.enemies.find(e=>e.id===shot.targetId&&!e.dead&&e.y>-50);
        if(!target) {
          let nearestDistance=Infinity;
          for(const enemy of this.enemies) {
            if(enemy.dead||enemy.y<=-50)continue;
            const dx=enemy.x-shot.x,dy=enemy.y-shot.y;
            const distance=dx*dx+dy*dy;
            if(distance<nearestDistance) {
              nearestDistance=distance;
              target=enemy;
            }
          }
          shot.targetId=target?.id??null;
        }
        if(target) {
          const dx=target.x-shot.x,dy=target.y-shot.y,len=Math.hypot(dx,dy)||1;
          const sidewinder=shot.kind==="sidewinder";
          const speed=sidewinder?680:560,turn=Math.min(1,h*(sidewinder?7:5));
          shot.vx=shot.vx*(1-turn)+dx/len*speed*turn;
          shot.vy=shot.vy*(1-turn)+dy/len*speed*turn;
          const v=Math.hypot(shot.vx,shot.vy);
          if(v>speed){shot.vx*=speed/v;shot.vy*=speed/v;}
        }
        if(this._rand()<h*(shot.kind==="sidewinder"?28:50))
          this._particle(shot.x,shot.y,0,55,shot.kind==="sidewinder"?.32:.18,3,shot.kind==="sidewinder"?"white":"amber",shot.kind==="sidewinder"?"smoke":"engine");
      }
      shot.x+=shot.vx*h;shot.y+=shot.vy*h;shot.age+=h;
    }
  }
  _drop(x,y,type,vx=0) {
    const item={x,y,r:16,type,age:0,vy:95};if(vx)item.vx=vx;
    this.pickups.push(item);this._event("drop",x,y,type);return item;
  }
  _randomDropType() {
    let roll=this._rand()*DROP_WEIGHTS.reduce((sum,[,w])=>sum+w,0);
    for(const [type,weight] of DROP_WEIGHTS){if((roll-=weight)<0)return type;}
    return "power";
  }
  _bonusDropType() { return BONUS_LADDER[this._bonusIndex++%BONUS_LADDER.length]; }
  // Several items from one kill fan out sideways so each is readable.
  _dropMany(x,y,types) {
    types.forEach((type,i)=>this._drop(x,y,type,(i-(types.length-1)/2)*70));
  }
  _updatePickups(h) {
    const p=this.player,interlude=this._transition>0;
    for(const item of this.pickups) {
      if(item.dead)continue;
      item.age+=h;
      const dx=p.x-item.x,dy=p.y-item.y,dist=Math.hypot(dx,dy);
      if(interlude) {
        // Sector clears are celebratory: anything still on screen homes in.
        if(item.y>-20&&dist>1){
          const speed=Math.min(900,260+item.age*120);
          item.x+=dx/dist*Math.min(dist,speed*h);item.y+=dy/dist*Math.min(dist,speed*h);
        }
        continue;
      }
      if(item.salvage) {
        // Burst (travels ~115-200 px), damp toward a slow sinking drift,
        // bounce off the field edges.
        const damp=Math.min(1,h*1.4);
        item.vx-=item.vx*damp;item.vy+=(24-item.vy)*damp;
        item.x+=item.vx*h;item.y+=item.vy*h;
        const b=SALVAGE_BOUNDS;
        if(item.x<b.left){item.x=b.left;item.vx=Math.abs(item.vx)*.8;}
        else if(item.x>b.right){item.x=b.right;item.vx=-Math.abs(item.vx)*.8;}
        if(item.y<b.top){item.y=b.top;item.vy=Math.abs(item.vy)*.8;}
        else if(item.y>b.bottom){item.y=b.bottom;item.vy=-Math.abs(item.vy)*.6;}
        item.life-=h;
        if(item.life<=0) {
          item.dead=true;this.stats.salvageLost+=item.value||1;
          this._burst(item.x,item.y,8,"white",70,"fizzle");
          this._event("salvageExpire",item.x,item.y,item.type);
          continue;
        }
      } else {
        item.y+=item.vy*h;item.x+=Math.sin(item.age*2.2)*h*14;
        if(item.vx){item.x=this._clamp(item.x+item.vx*h,24,516);item.vx*=1-Math.min(1,h*3);}
      }
      // Salvage gets a wider magnet (wider again in focus) so a sweep recovers it.
      if(item.salvage&&item.age<SALVAGE_GRACE)continue;
      // Salvage magnet: 84 px, 130 px in focus (pickups: 70 / 105 px).
      const attract=item.salvage?(p.focus?130:84):(p.focus?105:70);
      if(dist<attract&&dist>1) {
        const speed=230+(attract-dist)*3;
        item.x+=dx/dist*speed*h;item.y+=dy/dist*speed*h;
      }
    }
  }
  _collect(item) {
    const p=this.player,value=Math.max(1,Math.floor(item.value||1));
    this.stats.pickups++;
    if(item.type==="power") this._increasePower(value);
    else if(item.type==="escort") this._addEscorts(value);
    else if(item.type==="sidewinder") {p.sidewinder+=value;this._syncArsenal();}
    else if(item.type==="shield") this._addShield(value*(p.shipId==="manta"?2:1));
    else if(item.type==="reflector") this._addReflector(REFLECTOR_PICKUP*value);
    else if(item.type==="signature") this._addSignature(value);
    else if(item.type==="bomb") p.bombs=Math.min(4,p.bombs+1);
    else this._awardScore(Math.round(1500*this.combo));
    this._burst(item.x,item.y,22,"gold",140,"pickup");
    this._event("pickup",item.x,item.y,item.type);
    if(item.salvage){this.stats.salvageRecovered+=value;this._event("salvageRecover",item.x,item.y,item.type);}
  }
  _particle(x,y,vx,vy,life,size,color,kind) {
    if(this.particles.length>380) this.particles.shift();
    this.particles.push({x,y,vx,vy,life,maxLife:life,size,color,kind});
  }
  _burst(x,y,count,color,speed,kind="spark") {
    for(let i=0;i<count;i++) {
      const a=this._rand()*Math.PI*2,s=this._range(speed*.2,speed);
      this._particle(x,y,Math.cos(a)*s,Math.sin(a)*s,
        this._range(.25,.75),this._range(2,7),color,kind);
    }
  }
  _updateParticles(h) {
    for(const f of this.particles) {
      f.x+=f.vx*h;f.y+=f.vy*h;f.vx*=1-h*1.5;f.vy*=1-h*1.5;f.life-=h;
    }
  }

  // Rails, escort rails and torpedoes pass through targets (torpedoes only small ones).
  _pierces(shot) { return !!shot.hitIds&&(shot.kind==="pierce"||shot.kind==="torpedo"||shot.style==="rail"); }
  _collide() {
    const p=this.player;
    for(const shot of this.shots) {
      if(shot.dead)continue;
      for(const e of this.enemies) {
        if(e.dead||e.y< -70||shot.hitIds?.includes(e.id))continue;
        const reactor=e.reactor;
        if(reactor&&!reactor.broken&&e.age>=reactor.opensAt&&!shot.hitIds?.includes(reactor.id)&&Math.hypot(shot.x-reactor.x,shot.y-reactor.y)<reactor.r+shot.r){
          if(!shot.countedHit){this.stats.shotsHit++;shot.countedHit=true;}
          reactor.hp-=shot.damage;
          if(this._pierces(shot)){shot.hitIds.push(reactor.id);if(--shot.pierceRemaining<=0||shot.kind==="torpedo")shot.dead=true;}
          else shot.dead=true;
          if(this._hitAudioClock<=0){this._event('bossCoreHit',reactor.x,reactor.y,'reactor');this._event('hit',reactor.x,reactor.y,'reactor');this._hitAudioClock=.065;}
          if(reactor.hp<=0)this._breakReactor(e);
          if(shot.dead)break;
          continue;
        }
        const dx=shot.x-e.x,dy=shot.y-e.y;
        const hit=e.type==="boss" ? dx*dx/(98*98)+dy*dy/(55*55)<1 :
          dx*dx+dy*dy<(shot.r+e.r*.78)**2;
        if(!hit)continue;
        if(!shot.countedHit){this.stats.shotsHit++;shot.countedHit=true;}
        const previousHp=e.hp;
        this._damageEnemy(e,shot.damage);
        const armorStopped=e.type==="boss"&&e.hp===previousHp;
        const heavy=shot.kind==="missile"||shot.kind==="torpedo";
        e.flash=heavy?.95:shot.kind==="pierce"?.72:.5;
        // Torpedoes pierce small craft and burst on big targets and bosses.
        const burst=shot.kind==="missile"||(shot.kind==="torpedo"&&BIG_TARGETS.has(e.type));
        if(this._pierces(shot)&&!burst) {
          shot.hitIds.push(e.id);
          shot.pierceRemaining--;
          if(shot.pierceRemaining<=0)shot.dead=true;
        } else shot.dead=true;
        if(burst) {
          const torpedo=shot.kind==="torpedo",radius=torpedo?70:52;
          this._burst(shot.x,shot.y,torpedo?22:14,torpedo?"cyan":"amber",torpedo?160:110,"missile");
          for(const other of this.enemies) {
            if(other===e||other.dead)continue;
            if(Math.hypot(other.x-shot.x,other.y-shot.y)<radius) {
              this._damageEnemy(other,shot.damage*(torpedo?.5:.45));
              if(other.hp<=0)this._killEnemy(other);
            }
          }
          this._event(armorStopped?"bossArmorHit":"missileHit",shot.x,shot.y,e.type);
          if(torpedo)this.events[this.events.length-1].torpedo=true;
        }
        if(!burst&&(!e.impactCooldown||shot.kind==="pierce")) {
          const contact=armorStopped?"bossArmorHit":e.type==="boss"?"bossCoreHit":
            shot.kind==="pierce"?"railHit":"chipHit";
          this._event(contact,shot.x,shot.y,e.type);
          e.impactCooldown=shot.kind==="pierce"?.05:e.type==="boss"?.075:.09;
        }
        if(this._hitAudioClock<=0){this._event("hit",shot.x,shot.y,e.type);this._hitAudioClock=.065;}
        if(this._rand()<.2)this._particle(shot.x,shot.y,this._range(-35,35),
          this._range(-40,40),.18,3,"white","hit");
        if(e.hp<=0)this._killEnemy(e);
        if(shot.dead)break;
      }
    }
    // Every roll has a contact strike; WAKE charge extends reach and damage.
    // Each enemy can be struck once per roll, including the boss.
    if(p.roll>0) {
      for(const e of this.enemies) {
        if(e.dead||e.y< -70||e.lastRollHit===this._rollSerial)continue;
        const radius=e.type==="boss"?(p.rollCharged?90:75):e.r+(p.rollCharged?30:20);
        if(Math.hypot(e.x-p.x,e.y-p.y)>radius)continue;
        e.lastRollHit=this._rollSerial;
        this._damageEnemy(e,e.type==="boss"?(p.rollCharged?175:60):(p.rollCharged?135:45));
        e.flash=1;this._burst(e.x,e.y,18,"cyan",150,"roll");
        this.events.push({type:"rollStrike",x:e.x,y:e.y,value:e.type,charged:p.rollCharged});
        if(e.hp<=0)this._killEnemy(e);
      }
    }
    let reflected=0,eats=0;
    const flushDefense=()=>{
      if(reflected){this.stats.reflected+=reflected;this._event("reflect",p.x,p.y,reflected);}
      if(eats)this._event("orbitalEat",p.x,p.y,eats);
      if(reflected&&p.reflector<=0)this._event("reflectorDown",p.x,p.y,0);
      reflected=eats=0;
    };
    for(const b of this.bullets) {
      if(b.dead) continue;
      const dx=b.x-p.x,dy=b.y-p.y,d2=dx*dx+dy*dy;
      if(p.roll>0 && p.rollCharged && d2<(32+b.r)**2) {
        b.dead=true;
        const points=Math.round(180*this.combo),previousWake=p.wake;
        this._awardScore(points);
        p.wake=Math.min(1,p.wake+.025);
        this._particle(b.x,b.y,0,0,.36,6,"cyan","ring");
        this._burst(b.x,b.y,4,"cyan",75,"convert");
        this.wakeConversions++;this.stats.conversions++;
        const existing=this.events.find(event=>event.type==="wakeConvert");
        if(existing){existing.value++;existing.points+=points;existing.resource+=p.wake-previousWake;}
        else this.events.push({type:"wakeConvert",x:b.x,y:b.y,value:1,points,resource:p.wake-previousWake});
        continue;
      }
      // Reflector ring and ghost orbitals stop ordinary bullets; void rounds pass.
      if(b.kind!=="void") {
        if(p.reflector>0&&d2<REFLECTOR_RADIUS*REFLECTOR_RADIUS) {
          b.dead=true;this._reflectBullet(b);reflected++;continue;
        }
        let eaten=false;
        for(const o of p.orbitals) {
          if(o.cool>0)continue;
          const ox=b.x-o.x,oy=b.y-o.y;
          if(ox*ox+oy*oy<(9+b.r)**2){o.cool=ORBITAL_COOL;eaten=true;break;}
        }
        if(eaten) {
          b.dead=true;eats++;this.stats.orbitalEats++;
          this._particle(b.x,b.y,0,0,.25,5,"cyan","ring");
          continue;
        }
      }
      const hitRadius=p.r+b.r*.68;
      if(d2<hitRadius*hitRadius&&p.invuln<=0) {
        b.dead=true;flushDefense();this._hurtPlayer(b.x,b.y);
        if(this.mode==='gameover')return;
      } else if(!b.grazed&&d2<(p.r+b.r+23)**2) {
        b.grazed=true;this.graze++;this.stats.grazes++;
        this._awardScore(Math.ceil(25*this.combo));
        this.combo=Math.min(8,this.combo+.025);this._comboClock=3;
        const previous=p.wake;
        p.wake=Math.min(1,p.wake+.06);
        if(previous<.5&&p.wake>=.5)this._event("wakeReady",p.x,p.y,p.wake);
        if(this.graze%8===0)this._event("graze",p.x,p.y,this.graze);
        this._particle(b.x,b.y,this._range(-20,20),-30,.25,2,"cyan","graze");
      }
    }
    flushDefense();
    if(p.invuln<=0) {
      for(const e of this.enemies) {
        if(e.dead)continue;
        const dx=e.x-p.x,dy=e.y-p.y;
        if(dx*dx+dy*dy<(p.r+e.r*.66)**2) {
          this._hurtPlayer(p.x,p.y);
          if(this.mode==='gameover')return;
          if(e.type!=="boss") {e.hp-=80;if(e.hp<=0)this._killEnemy(e);}
          break;
        }
      }
    }
    const lance=this.boss?.lance;
    if(lance?.active&&!this.boss.dead&&p.invuln<=0&&Math.abs(p.x-lance.x)<lance.width/2+p.r&&p.y+p.r>lance.y){
      this._hurtPlayer(lance.x,p.y);if(this.mode==='gameover')return;
    }
    for(const item of this.pickups) {
      if(item.dead||(item.salvage&&item.age<SALVAGE_GRACE&&this._transition<=0))continue;
      const dx=item.x-p.x,dy=item.y-p.y;
      if(dx*dx+dy*dy<(item.r+16)**2) {
        item.dead=true;this._collect(item);
      }
    }
  }
  // Hit order: a shield charge absorbs the hit outright; otherwise the
  // arsenal scatters as salvage, then the hull takes the hit.
  _hurtPlayer(x,y) {
    const p=this.player;if(p.invuln>0)return;
    if(p.shield>0) {
      p.shield--;this.stats.hitsTaken++;p.invuln=.65;this.shake=8;this.flash=.3;
      this._burst(p.x,p.y,22,"cyan",150,"shield");
      this._event("shieldHit",x,y,p.shield);
      if(p.shield===0)this._event("shieldBreak",p.x,p.y,0);
      this._syncArsenal();
      return;
    }
    this._scatterArsenal(x,y);
    p.hp--;this.stats.hitsTaken++;p.invuln=SCATTER_INVULN;this.combo=1;this._comboClock=0;
    this.shake=13;this.flash=.5;this._burst(p.x,p.y,32,"cyan",220,"damage");
    this._event("playerHit",x,y,p.hp);
    if(p.hp<=0) {
      p.lives--;this.stats.livesLost++;this._event("lifeLost",p.x,p.y,p.lives);
      if(p.lives<=0) {
        this.mode="gameover";if(!this.practiceStage)this.best=Math.max(this.best,this.score);
        this._finishRun("defeat");
        this._event("gameover",p.x,p.y,this.score);
      } else {
        // Losing a life scatters anything still held; the new ship is bare and
        // the salvage from this hit keeps floating.
        this._scatterArsenal(p.x,p.y);
        p.hp=p.maxHp;p.level=p.power=1;p.drones=0;
        p.shield=p.maxShield=p.shipId==="manta"?1:0;
        p.x=270;p.y=750;p.invuln=3.2;
        this.bullets=this.bullets.filter(b=>Math.hypot(b.x-p.x,b.y-p.y)>190);
        this._syncArsenal();
      }
    }
  }
  // Everything above a bare ship drops as at most SALVAGE_MAX_TOKENS tokens:
  // power splits into a few multi-level tokens, each equipment level is its
  // own token (bundled only when the token budget runs out). 20% of the power
  // burns away. Reflector time is lost, not dropped.
  _scatterArsenal(x,y) {
    const p=this.player;
    const levels=p.level-1,burned=Math.floor(levels*SCATTER_BURN),kept=levels-burned;
    const pools=[["power",kept,Math.min(kept,6,Math.ceil(kept/3))],["escort",p.escorts/2,p.escorts/2],
      ["sidewinder",p.sidewinder,p.sidewinder],["signature",p.signature,p.signature]]
      .filter(([,amount])=>amount>0).map(([type,amount,tokens])=>({type,amount,tokens:Math.max(1,tokens)}));
    if(p.reflector>0){p.reflector=0;this._event("reflectorDown",p.x,p.y,0);}
    if(!levels&&!pools.length)return 0;
    let total=pools.reduce((sum,pool)=>sum+pool.tokens,0);
    while(total>SALVAGE_MAX_TOKENS) {
      // Bundle the most fragmented pool first (fewest levels per token).
      let pick=null;
      for(const pool of pools)if(pool.tokens>1&&(!pick||pool.amount/pool.tokens<pick.amount/pick.tokens))pick=pool;
      if(!pick)break;pick.tokens--;total--;
    }
    const tokens=[];
    for(const pool of pools)
      for(let i=0;i<pool.tokens;i++) {
        const value=Math.floor(pool.amount/pool.tokens)+(i<pool.amount%pool.tokens?1:0);
        tokens.push({type:pool.type,value});
      }
    const offset=this._rand()*Math.PI*2;
    tokens.forEach((token,i)=>{
      const angle=offset+i/tokens.length*Math.PI*2+this._range(-.25,.25),speed=this._range(160,280);
      this.pickups.push({x:this._clamp(x,SALVAGE_BOUNDS.left,SALVAGE_BOUNDS.right),
        y:this._clamp(y,SALVAGE_BOUNDS.top,SALVAGE_BOUNDS.bottom),r:18,type:token.type,age:0,
        vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,salvage:true,value:token.value,life:SALVAGE_LIFE});
    });
    const dropped=tokens.reduce((sum,token)=>sum+token.value,0);
    p.level=p.power=1;p.escorts=0;p.escortSlots.length=0;p.sidewinder=0;p.signature=0;p.drones=0;
    this._syncOrbitals();this._syncArsenal();
    this.stats.scatters++;
    this._burst(x,y,30,"gold",240,"scatter");
    this.events.push({type:"arsenalScatter",x,y,value:dropped,tokens:tokens.length,burned});
    return tokens.length;
  }
  // A reflected bullet flies back at the nearest enemy as a player shot.
  _reflectBullet(b) {
    const p=this.player;
    p.reflector=Math.max(0,p.reflector-REFLECT_COST);
    let target=null,best=Infinity;
    for(const e of this.enemies) {
      if(e.dead||e.y< -40)continue;
      const d=(e.x-b.x)**2+(e.y-b.y)**2;if(d<best){best=d;target=e;}
    }
    const angle=target?Math.atan2(target.y-b.y,target.x-b.x):-Math.PI/2;
    this._shot({x:b.x,y:b.y,vx:Math.cos(angle)*760,vy:Math.sin(angle)*760,r:4,
      damage:12+p.level*.5,kind:"reflect",age:0});
    this._particle(b.x,b.y,0,0,.22,5,"violet","ring");
  }
  _killEnemy(e,bomb=false) {
    if(e.dead)return;e.dead=true;
    if(e.type==="boss") {
      this.stats.bossesDefeated++;
      this._awardScore(Math.round(e.value*this.combo));
      this._burst(e.x,e.y,130,"gold",360,"boss");
      this._particle(e.x,e.y,0,0,.75,16,"gold","ring");
      this.shake=18;this.flash=1;this.bullets.length=0;
      this.boss=null;this._transition=3.5;
      // Flagship spoils: collected automatically during the interlude.
      this._dropMany(e.x,e.y,["power",this._bonusDropType()]);
      this._event("bossDown",e.x,e.y,this.stage);
    } else {
      this.stats.kills++;
      this.combo=Math.min(8,this.combo+(e.type==="mini"?.45:.13));
      this._comboClock=4;this._awardScore(Math.round(e.value*this.combo));
      this._burst(e.x,e.y,e.type==="mini"?32:e.type==="bomber"||e.type==="carrier"?16:8,
        e.type==="ace"?"cyan":"amber",e.type==="mini"?220:130,"explode");
      this.shake=Math.max(this.shake,e.type==="mini"?7:e.type==="bomber"?4:2);
      // Authored drops stay; carriers and minibosses add ladder bonuses
      // (2-3 items total); ordinary kills roll the weighted table.
      const drops=[];
      if(e.drop)drops.push(e.drop);
      else if(this._rand()<(DROP_CHANCE[e.type]??.05))drops.push(this._randomDropType());
      for(let i=0;i<(BONUS_DROPS[e.type]||0);i++)drops.push(this._bonusDropType());
      if(drops.length)this._dropMany(e.x,e.y,drops);
      this._event("enemyDown",e.x,e.y,e.type);
    }
    this._event("explode",e.x,e.y,e.type);this.events[this.events.length-1].angle=e.angle||0;
    if(!this.practiceStage&&!bomb&&this.score>this.best)this.best=this.score;
  }
  _advanceStage() {
    if(this.practiceStage){
      this.mode="victory";this._finishRun("victory");this._event("victory",270,320,this.score);return;
    }
    if(this.stage>=3) {
      this.mode="victory";
      this.score+=this.player.lives*5000+this.player.bombs*1500+this.player.hp*1000;
      this.best=Math.max(this.best,this.score);
      this._finishRun("victory");
      this._event("victory",270,320,this.score);return;
    }
    // Anything the interlude did not collect is off screen and is lost.
    this.pickups.length=0;
    this.stage++;this.stageTime=0;this.wave=0;this._beatIndex=0;this._laneIndex=0;
    this._awardScore(0);
    this.enemies.length=0;this.bullets.length=0;
    this.player.hp=Math.min(this.player.maxHp,this.player.hp+1);
    this.player.bombs=Math.min(4,this.player.bombs+1);
    this.player.invuln=3;this.flash=.7;
    this._event("stage",270,170,this.stage);
  }
  _finishRun(outcome) {
    const p=this.player,s=this.stats;
    const accuracy=s.shotsFired?Math.min(1,s.shotsHit/s.shotsFired):0;
    const merit=(outcome==="victory"?40:0)+Math.min(20,this.score/12000)+
      Math.min(12,s.grazes/30)+Math.min(10,s.kills/12)+
      Math.min(10,accuracy*12)+Math.min(8,p.lives*2)-
      Math.min(24,s.hitsTaken*.65)-s.livesLost*2;
    const grade=merit>=84?"S":merit>=68?"A":merit>=50?"B":merit>=32?"C":"D";
    this.summary={outcome,shipId:this.shipId,score:this.score,grade,stage:this.stage,livesRemaining:p.lives,
      practiceStage:this.practiceStage,bombsRemaining:p.bombs,
      time:this.time,kills:s.kills,grazes:s.grazes,shotsFired:s.shotsFired,
      shotsHit:s.shotsHit,accuracy,pickups:s.pickups,powerPeak:s.powerPeak,arsenalPeak:s.arsenalPeak,
      scatters:s.scatters,salvageRecovered:s.salvageRecovered,
      bombsUsed:s.bombsUsed,rolls:s.rolls,conversions:s.conversions,
      hitsTaken:s.hitsTaken,livesLost:s.livesLost,bossesDefeated:s.bossesDefeated,reactorsBroken:s.reactorsBroken};
    this._event("summary",270,320,grade);
    this.events[this.events.length-1].summary=this.summary;
  }
  _cleanup() {
    let write=0;
    for(let read=0;read<this.enemies.length;read++) {
      const e=this.enemies[read];
      if(!e.dead&&e.y<990&&e.x> -130&&e.x<670)this.enemies[write++]=e;
    }
    this.enemies.length=write;

    write=0;
    for(let read=0;read<this.bullets.length;read++) {
      const b=this.bullets[read];
      if(!b.dead&&b.x> -35&&b.x<575&&b.y> -180&&b.y<945)this.bullets[write++]=b;
    }
    this.bullets.length=write;

    write=0;
    for(let read=0;read<this.shots.length;read++) {
      const s=this.shots[read];
      if(!s.dead&&s.y> -40&&s.y<940&&s.x> -30&&s.x<570)this.shots[write++]=s;
    }
    this.shots.length=write;

    write=0;
    for(let read=0;read<this.pickups.length;read++) {
      const i=this.pickups[read];
      if(!i.dead&&i.y<950)this.pickups[write++]=i;
    }
    this.pickups.length=write;

    write=0;
    for(let read=0;read<this.particles.length;read++) {
      const f=this.particles[read];
      if(f.life>0)this.particles[write++]=f;
    }
    this.particles.length=write;
  }
}
export default Game;
