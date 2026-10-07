// 2026: deterministic, asset-free arcade simulation.
const SCORE_EXTENDS = [50000, 160000, 350000, 700000];
// Score milestones bank at sector power caps; the final boss guarantees level five.
const POWER_MILESTONES = [3000, 10000, 25000, 35000];
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
    this.mode = "title"; this.time = 0; this.stage = 1; this.stageTime = 0;
    this.scroll = 0; this.score = 0; this.combo = 1; this.graze = 0; this._nextExtend = 0;
    this.shake = 0; this.flash = 0; this.wave = 0; this.wakeConversions = 0;
    this.stageGoal = [0, 62, 73, 82];
    this.shipId=SHIP_DEFS[this.shipId] ? this.shipId : "kestrel";
    this.selectedShip=SHIP_DEFS[this.shipId];
    this.player = {x:270,y:750,r:this.shipId==="manta"?9:this.shipId==="wraith"?7:8,hp:4,maxHp:4,lives:3,bombs:2,power:1,level:1,
      shipId:this.shipId,weaponType:this.selectedShip.weapon,specialType:this.selectedShip.special,
      shield:this.shipId==="manta"?1:0,maxShield:this.shipId==="manta"?2:0,drones:0,
      focus:false,invuln:0,roll:0,rollCooldown:0,rollX:0,rollY:-1,rollCharged:false,wake:0,firePulse:0,trail:[]};
    this.enemies=[]; this.bullets=[]; this.shots=[]; this.pickups=[]; this.particles=[];
    this.stats={kills:0,grazes:0,shotsFired:0,shotsHit:0,pickups:0,powerPeak:1,
      bombsUsed:0,rolls:0,conversions:0,hitsTaken:0,livesLost:0,bossesDefeated:0};
    this.summary=null;
    this.boss=null; this.events=[]; this._seed=20261942; this._acc=0;
    this._beatIndex=0; this._laneIndex=0; this._transition=0; this._fireClock=0; this._comboClock=0;
    this._id=0; this._last={}; this._hitAudioClock=0; this._powerScoreIndex=0; this._missileClock=0; this._rollSerial=0;
  }
  selectShip(id) {
    if(!SHIP_DEFS[id] || !["title","gameover","victory"].includes(this.mode)) return false;
    this.shipId=id;this.selectedShip=SHIP_DEFS[id];
    const p=this.player;
    p.shipId=id;p.weaponType=this.selectedShip.weapon;p.specialType=this.selectedShip.special;
    p.shield=id==="manta"?1:0;p.maxShield=id==="manta"?2:0;
    p.r=id==="manta"?9:id==="wraith"?7:8;
    p.drones=id==="wraith"?Math.floor(p.level/2):0;
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
    while(this._powerScoreIndex<POWER_MILESTONES.length && this.score>=POWER_MILESTONES[this._powerScoreIndex]) {
      if(!this._increasePower())break;
      this._powerScoreIndex++;
    }
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
  _increasePower() {
    const p=this.player;
    const cap=this.stage===1?3:this.stage===2?4:5;
    if(p.level>=cap)return false;
    p.level++;p.power=p.level;
    p.drones=p.shipId==="wraith"?Math.floor(p.level/2):0;
    this.stats.powerPeak=Math.max(this.stats.powerPeak,p.level);
    this.flash=Math.max(this.flash,.25);
    this._burst(p.x,p.y,25,"cyan",125,"power");
    this._event("powerUp",p.x,p.y,p.level);
    return true;
  }
  _start() { const best=this.best,id=this.shipId; this.reset(); this.shipId=id; this.best=best; this.mode="playing"; this._event("stage",270,170,1); }
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
    if (input.fire&&this._fireClock<=0&&this._transition<=0) {
      this._fire(); this._fireClock=p.focus?.092:.105;
    }
    if (!input.fire) this._fireClock=Math.min(0,this._fireClock);
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
    this._updateEnemies(h); this._updateBullets(h); this._updateShots(h);
    this._updatePickups(h); this._updateParticles(h); this._collide(); this._cleanup();
  }
  _movePlayer(h,input) {
    const p=this.player; p.focus=!!input.focus;
    const edge=p.shipId==="wraith"?62:p.shipId==="manta"?52:46;
    let dx=Number(!!input.right)-Number(!!input.left),dy=Number(!!input.down)-Number(!!input.up);
    const len=Math.hypot(dx,dy); if (len) { dx/=len; dy/=len; }
    if (p.roll>0) { p.x+=p.rollX*740*h; p.y+=p.rollY*740*h; }
    else if (input.pointerActive&&Number.isFinite(input.pointerX)&&Number.isFinite(input.pointerY)) {
      const tx=this._clamp(input.pointerX,edge,540-edge),ty=this._clamp(input.pointerY,230,820);
      const dist=Math.hypot(tx-p.x,ty-p.y);
      const speed=p.shipId==="manta"?(p.focus?185:420):p.shipId==="wraith"?(p.focus?230:500):(p.focus?210:460);
      const t=dist?Math.min(1,speed*h/dist):1;
      p.x+=(tx-p.x)*t; p.y+=(ty-p.y)*t;
    } else { const speed=p.shipId==="manta"?(p.focus?170:325):p.shipId==="wraith"?(p.focus?205:405):(p.focus?190:360); p.x+=dx*speed*h; p.y+=dy*speed*h; }
    p.x=this._clamp(p.x,edge,540-edge); p.y=this._clamp(p.y,230,820);
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
    for(const b of this.bullets) this._particle(b.x,b.y,0,0,.45,5,
      special==="storm"?"cyan":"gold","spark");
    this.bullets.length=0;
    // The Manta trades damage for restored armor. The Wraith converts the
    // whole field into score; the Kestrel retains the high-impact nova.
    if(special==="barrier") {
      p.shield=Math.min(p.maxShield,p.shield+1);
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
    this._burst(p.x,p.y,special==="barrier"?65:100,
      special==="storm"?"cyan":"gold",special==="barrier"?320:580,"bomb");
    this._event("bomb",p.x,p.y,special);
    this._event("special",p.x,p.y,special);
  }
  _fire() {
    const p=this.player,level=p.level;
    if(p.weaponType==="spread") {
      const n=level+1,center=(n-1)/2;
      for(let i=0;i<n;i++) {
        const off=i-center,ang=p.focus?off*.022:off*.072;
        this.shots.push({x:p.x+off*(p.focus?10:12),y:p.y-20,
          vx:ang*800,vy:-870,r:level>=4?4.5:3.5,
          damage:p.focus?8:7,kind:p.focus?"lance":"shot",age:0});
      }
      this.stats.shotsFired+=n;
    } else if(p.weaponType==="missile") {
      const n=level>=4?4:2,center=(n-1)/2;
      for(let i=0;i<n;i++) {
        const off=i-center;
        this.shots.push({x:p.x+off*13,y:p.y-20,vx:off*(p.focus?12:55),vy:-800,
          r:3.8,damage:p.focus?8:7,kind:"shot",age:0});
      }
      this.stats.shotsFired+=n;
      if(this._missileClock<=0) {
        const count=level>=5?2:1;
        for(let i=0;i<count;i++) {
          const side=count===1?0:i?1:-1;
          this.shots.push({x:p.x+side*21,y:p.y-12,vx:side*95,vy:-460,
            r:6,damage:level>=5?30:25+level*2,kind:"missile",age:0,targetId:null});
        }
        this.stats.shotsFired+=count;
        this._missileClock=level>=4?.52:.6;
        this._event("missileLaunch",p.x,p.y,p.shipId);
      }
    } else {
      const n=level>=4?2:1;
      for(let i=0;i<n;i++) {
        const off=n===1?0:i?9:-9;
        this.shots.push({x:p.x+off,y:p.y-22,vx:0,vy:-1020,
          r:4,damage:p.focus?13:11,kind:"pierce",age:0,pierceRemaining:level>=3?3:2,hitIds:[]});
      }
      this.stats.shotsFired+=n;
      if(p.drones) {
        for(let i=0;i<p.drones;i++) {
          const side=i?1:-1;
          this.shots.push({x:p.x+side*34,y:p.y+4,vx:side*35,vy:-780,
            r:3,damage:level>=5?6:4,kind:"drone",age:0});
        }
        this.stats.shotsFired+=p.drones;
        this._event("droneFire",p.x,p.y,p.drones);
      }
    }
    p.firePulse=1;this._event("shoot",p.x,p.y-20);
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
      const opening=row?next:gap,y=row?130:255;
      for(let x=24;x<=516;x+=28)
        if(Math.abs(x-opening)>68)
          this._bullet(x,y,Math.PI/2,speed,color,5.2);
    }
    this._event("lane",gap,255,next);
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
    if(this.stage===3)while(this.player.level<5)this._increasePower();
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
        if(salvo%2===0)for(const side of [-1,1])
          this._radial(e.x+side*58,e.y+24,12,speed,angle*side,"cyan",4.7);
        if(salvo%2===0)this._spread(e.x,e.y+48,p.x,p.y,5,.12,speed+80,"red",4.8);
      }
    } else {
      // The Crown compresses mirrored curtains into a rotating final crossfire.
      const angle=e.age*.28;
      if(phase===1) {
        this._radial(e.x,e.y+38,23,speed,Math.sin(e.age*.5)*.13,"amber",4.8,Math.PI*.08,Math.PI*.92);
        if(salvo%2===0)this._spread(e.x,e.y+48,p.x,p.y,7,.13,speed+75,"red",5);
      } else if(phase===2) {
        this._radial(e.x-60,e.y+24,17,speed,angle,"magenta",4.5);
        this._radial(e.x+60,e.y+24,17,speed,-angle,"cyan",4.5);
        if(salvo%2===0)this._spread(e.x,e.y+48,p.x,p.y,5,.11,speed+82,"red",5);
      } else {
        this._radial(e.x,e.y+38,24,speed+20,sway,"magenta",4.6,Math.PI*.06,Math.PI*.94);
        this._radial(e.x,e.y+38,24,speed-28,-sway+.05,"amber",4.4,Math.PI*.06,Math.PI*.94);
        if(salvo%2===0)this._spread(e.x,e.y+48,p.x,p.y,7,.105,speed+95,"cyan",4.5);
      }
    }
    this._burst(e.x-58,e.y+24,3,"gold",55,"muzzle");
    this._burst(e.x+58,e.y+24,3,"gold",55,"muzzle");
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
    if(this.bullets.length>=700) return;
    this.bullets.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
      r,kind,color:kind,age:0,grazed:false});
  }
  _updateBullets(h) { for(const b of this.bullets) {b.x+=b.vx*h;b.y+=b.vy*h;b.age+=h;} }
  _updateShots(h) {
    for(const shot of this.shots) {
      if(shot.kind==="missile") {
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
          const speed=560,turn=Math.min(1,h*5);
          shot.vx=shot.vx*(1-turn)+dx/len*speed*turn;
          shot.vy=shot.vy*(1-turn)+dy/len*speed*turn;
          const v=Math.hypot(shot.vx,shot.vy);
          if(v>speed){shot.vx*=speed/v;shot.vy*=speed/v;}
        }
        if(this._rand()<h*50)this._particle(shot.x,shot.y,0,55,.18,3,"amber","engine");
      }
      shot.x+=shot.vx*h;shot.y+=shot.vy*h;shot.age+=h;
    }
  }
  _drop(x,y,type) {this.pickups.push({x,y,r:16,type,age:0,vy:95});this._event("drop",x,y,type);}
  _updatePickups(h) {
    const p=this.player;
    for(const item of this.pickups) {
      item.age+=h;item.y+=item.vy*h;item.x+=Math.sin(item.age*2.2)*h*14;
      const dx=p.x-item.x,dy=p.y-item.y,dist=Math.hypot(dx,dy);
      const attract=p.focus?105:70;
      if(dist<attract&&dist>1) {
        const speed=230+(attract-dist)*3;
        item.x+=dx/dist*speed*h;item.y+=dy/dist*speed*h;
      }
    }
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

  _collide() {
    const p=this.player;
    for(const shot of this.shots) {
      if(shot.dead)continue;
      for(const e of this.enemies) {
        if(e.dead||e.y< -70||shot.hitIds?.includes(e.id))continue;
        const dx=shot.x-e.x,dy=shot.y-e.y;
        const hit=e.type==="boss" ? dx*dx/(98*98)+dy*dy/(55*55)<1 :
          dx*dx+dy*dy<(shot.r+e.r*.78)**2;
        if(!hit)continue;
        if(!shot.countedHit){this.stats.shotsHit++;shot.countedHit=true;}
        const previousHp=e.hp;
        this._damageEnemy(e,shot.damage);
        const armorStopped=e.type==="boss"&&e.hp===previousHp;
        e.flash=shot.kind==="missile"?.95:shot.kind==="pierce"?.72:.5;
        if(shot.kind==="pierce") {
          shot.hitIds.push(e.id);
          shot.pierceRemaining--;
          if(shot.pierceRemaining<=0)shot.dead=true;
        } else shot.dead=true;
        if(shot.kind==="missile") {
          this._burst(shot.x,shot.y,14,"amber",110,"missile");
          for(const other of this.enemies) {
            if(other===e||other.dead)continue;
            if(Math.hypot(other.x-shot.x,other.y-shot.y)<52) {
              this._damageEnemy(other,shot.damage*.45);
              if(other.hp<=0)this._killEnemy(other);
            }
          }
          this._event(armorStopped?"bossArmorHit":"missileHit",shot.x,shot.y,e.type);
        }
        if(shot.kind!=="missile"&&(!e.impactCooldown||shot.kind==="pierce")) {
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
      const hitRadius=p.r+b.r*.68;
      if(d2<hitRadius*hitRadius&&p.invuln<=0) {
        b.dead=true;this._hurtPlayer(b.x,b.y);
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
    if(p.invuln<=0) {
      for(const e of this.enemies) {
        const dx=e.x-p.x,dy=e.y-p.y;
        if(dx*dx+dy*dy<(p.r+e.r*.66)**2) {
          this._hurtPlayer(p.x,p.y);
          if(e.type!=="boss") {e.hp-=80;if(e.hp<=0)this._killEnemy(e);}
          break;
        }
      }
    }
    for(const item of this.pickups) {
      const dx=item.x-p.x,dy=item.y-p.y;
      if(dx*dx+dy*dy<(item.r+16)**2) {
        item.dead=true;
        this.stats.pickups++;
        if(item.type==="power") {
          if(!this._increasePower())this._awardScore(Math.round(1000*this.combo));
        } else if(item.type==="shield") {
          if(p.maxShield&&p.shield<p.maxShield) {
            p.shield++;this._event("shieldRestore",p.x,p.y,p.shield);
          } else p.hp=Math.min(p.maxHp,p.hp+1);
        }
        else if(item.type==="bomb") p.bombs=Math.min(4,p.bombs+1);
        else this._awardScore(Math.round(1500*this.combo));
        this._burst(item.x,item.y,22,"gold",140,"pickup");
        this._event("pickup",item.x,item.y,item.type);
      }
    }
  }
  _hurtPlayer(x,y) {
    const p=this.player;if(p.invuln>0)return;
    if(p.shield>0) {
      p.shield--;this.stats.hitsTaken++;p.invuln=.65;this.shake=8;this.flash=.3;
      this._burst(p.x,p.y,22,"cyan",150,"shield");
      this._event("shieldHit",x,y,p.shield);
      if(p.shield===0)this._event("shieldBreak",p.x,p.y,0);
      return;
    }
    p.hp--;this.stats.hitsTaken++;p.invuln=2.35;this.combo=1;this._comboClock=0;
    this.shake=13;this.flash=.5;this._burst(p.x,p.y,32,"cyan",220,"damage");
    this._event("playerHit",x,y,p.hp);
    if(p.hp<=0) {
      p.lives--;this.stats.livesLost++;this._event("lifeLost",p.x,p.y,p.lives);
      if(p.lives<=0) {
        this.mode="gameover";this.best=Math.max(this.best,this.score);
        this._finishRun("defeat");
        this._event("gameover",p.x,p.y,this.score);
      } else {
        p.hp=p.maxHp;p.level=Math.max(1,p.level-1);p.power=p.level;
        p.drones=p.shipId==="wraith"?Math.floor(p.level/2):0;
        p.x=270;p.y=750;p.invuln=3.2;
        this.bullets=this.bullets.filter(b=>Math.hypot(b.x-p.x,b.y-p.y)>190);
      }
    }
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
      this._event("bossDown",e.x,e.y,this.stage);
    } else {
      this.stats.kills++;
      this.combo=Math.min(8,this.combo+(e.type==="mini"?.45:.13));
      this._comboClock=4;this._awardScore(Math.round(e.value*this.combo));
      this._burst(e.x,e.y,e.type==="mini"?52:e.type==="bomber"||e.type==="carrier"?36:24,
        e.type==="ace"?"cyan":"amber",e.type==="mini"?220:130,"explode");
      this._particle(e.x,e.y,0,0,.42,e.type==="mini"?10:5,e.type==="ace"?"cyan":"amber","ring");
      this.shake=Math.max(this.shake,e.type==="mini"?7:e.type==="bomber"?4:2);
      if(e.drop)this._drop(e.x,e.y,e.drop);
      else if(this._rand()<(e.type==="carrier"?.6:e.type==="mini"?.45:.045))
        this._drop(e.x,e.y,this._rand()<.68?"power":"shield");
      this._event("enemyDown",e.x,e.y,e.type);
    }
    this._event("explode",e.x,e.y,e.type);
    if(!bomb&&this.score>this.best)this.best=this.score;
  }
  _advanceStage() {
    if(this.stage>=3) {
      this.mode="victory";
      this.score+=this.player.lives*5000+this.player.bombs*1500+this.player.hp*1000;
      this.best=Math.max(this.best,this.score);
      this._finishRun("victory");
      this._event("victory",270,320,this.score);return;
    }
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
    this.summary={outcome,shipId:this.shipId,score:this.score,grade,stage:this.stage,
      time:this.time,kills:s.kills,grazes:s.grazes,shotsFired:s.shotsFired,
      shotsHit:s.shotsHit,accuracy,pickups:s.pickups,powerPeak:s.powerPeak,
      bombsUsed:s.bombsUsed,rolls:s.rolls,conversions:s.conversions,
      hitsTaken:s.hitsTaken,livesLost:s.livesLost,bossesDefeated:s.bossesDefeated};
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
      if(!b.dead&&b.x> -35&&b.x<575&&b.y> -45&&b.y<945)this.bullets[write++]=b;
    }
    this.bullets.length=write;

    write=0;
    for(let read=0;read<this.shots.length;read++) {
      const s=this.shots[read];
      if(!s.dead&&s.y> -40&&s.x> -30&&s.x<570)this.shots[write++]=s;
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
