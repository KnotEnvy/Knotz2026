// Authored craft and terrain with procedural light, atmosphere and combat.
import { drawAtlasScenery, drawAtlasClouds, WorldAmbience, worldPaintsStage } from './background.js';
import * as skyArt from './art.js';
import { CAMPAIGN_STAGES } from './game.js';
import { drawCraft, drawCoast, drawWreck, prepareWaterMaps, monsoonSea, drawPiece, hasSheet, pieceInfo } from './art.js';
const W = 540, H = 900, TAU = Math.PI * 2;
const ZERO_ENEMIES = new Set(['echo','satellite','station','stationTurret','mirrorEscort','tether']);
const ECHO_SHIPS = {spread:'kestrel',missile:'manta',pierce:'wraith'};
// Sector 6 painted pieces (docs/design/act-two-art.md §5), logical px measured from
// the sheets. Station heads turn about their round body (hub px below the cell
// center); muzzles are [x,y] from that body, barrels up.
const S6_GATE='act2-s6-meridian',S6_BOSS='act2-sovereign';
const GATE_HEADS={
  mix:{hub:8,muzzles:[[-6,-34],[0,-35],[6,-34]],glow:'coreCool',rgb:'159,234,255'},
  shard:{hub:8,muzzles:[[-5,-34],[5,-34]],glow:'coreCool',rgb:'159,234,255'},
  void:{hub:0,muzzles:[[-17,-24],[17,-24]],glow:'rimViolet',rgb:'215,163,255'}
};
const SOVEREIGN_SLOTS=[-150,150,-80,80];
// The outer wings are thin (painted underside at y 14), so those mounts sit higher.
const sovereignMountY=ox=>Math.abs(ox)>100?10:24;
const SOVEREIGN_PODS={power:[-9,0,9],escort:[-7,7],sidewinder:[-7,7]};
const SOVEREIGN_NOZZLES=[-70,-50,50,70];
const SOVEREIGN_PHASE=[
  {tint:'rgba(143,230,255,.9)',glow:'coreCool',rgb:'143,230,255',rate:2},
  {tint:'rgba(192,140,255,.9)',glow:'rimViolet',rgb:'192,140,255',rate:2.8},
  {tint:'rgba(255,143,216,.9)',glow:'enemyMini',rgb:'255,143,216',rate:4}
];
const easeOutBack=k=>{const s=2.2;return 1+(s+1)*Math.pow(k-1,3)+s*Math.pow(k-1,2);};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = n => { const v = Math.sin(n * 127.1 + 31.7) * 43758.5453; return v - Math.floor(v); };
const BLOOM_CACHE_RADIUS = 96;
const BLOOM_CACHE_SIZE = BLOOM_CACHE_RADIUS * 2;
const BLOOM_PROFILE_RGB = Object.freeze({
  effectTeal:'128,253,228',effectGold:'255,224,150',effectCoral:'255,119,107',
  hitRail:'195,184,255',hitMissile:'255,185,103',hitBossMissile:'245,193,255',
  rimViolet:'215,163,255',rimCool:'143,237,248',rimGold:'255,222,148',rimFire:'255,178,116',
  coreViolet:'249,227,255',coreCool:'207,254,255',coreGold:'255,246,204',coreFire:'255,226,179',
  enemyHit:'255,238,190',enemyStorm:'184,106,216',enemyFoundry:'255,183,103',enemyAce:'197,86,168',
  enemyCoast:'239,125,76',enemyMini:'236,107,178',
  playerInvuln:'137,255,240',playerHurt:'255,121,62',playerHit:'255,122,66',
  playerMantaExhaust:'255,187,132',playerWraithExhaust:'183,166,255',playerKestrelExhaust:'119,249,224',
  playerMantaFire:'255,218,170',playerWraithFire:'182,174,255',playerKestrelFire:'205,255,225',
  projectileMissile:'255,180,111',projectilePierce:'172,158,255',
  pickup:'240,201,116'
});
const bloomSprites = new Map();
const PICKUP_THEMES = Object.freeze({
  power:['P','#ffe066','diamond'], escort:['E','#6bff95','chevron'],
  sidewinder:['M','#ff9f43','hexagon'], shield:['S','#5ce1ff','circle'],
  reflector:['R','#c98bff','ring'], signature:['★','#fff2a6','star'],
  bomb:['B','#ff7f9e','square']
});
const TRACER_STYLES = Object.freeze({
  shot:{jacket:'rgba(111,214,239,.55)',core:'rgba(229,253,255,.8)',width:2.9,length:21},
  lance:{jacket:'rgba(127,243,235,.56)',core:'rgba(235,255,249,.82)',width:3.3,length:29},
  pierce:{jacket:'rgba(157,209,255,.58)',core:'rgba(233,246,255,.82)',width:4.8,length:43},
  escort:{jacket:'rgba(117,213,231,.42)',core:'rgba(210,248,255,.7)',width:1.9,length:15},
  orbital:{jacket:'rgba(180,148,255,.52)',core:'rgba(239,230,255,.8)',width:2.7,length:29},
  railEscort:{jacket:'rgba(157,209,255,.45)',core:'rgba(233,246,255,.74)',width:2,length:28}
});
// Preserve the early power ramp, then grow gently enough to keep columns apart.
const tracerGrowth = radius => { const grow=Math.max(0,radius-4);return grow<=2.5?grow:2.5+Math.log1p(grow-2.5)*.7; };
const SKY_SIDES = [-1,1];
const HALCYON_BAY_X = [-150,0,150];
// Sector 5 painted pieces (docs/design/act-two-art.md §5). Points are logical px in
// the piece frame, measured from the sheets: engine exhausts, muzzle tips, bay sockets.
const S5_SKY='act2-s5-skyforge',S5_BOSS='act2-halcyon';
const HALCYON_BAY_Y = [24,42,24];
const HALCYON_NOZZLES = [-102,-77,-51,-27,28,53,77,101];
const SKY_EXHAUSTS = {
  boxBomber:{points:[[-43,8],[-23,8],[23,8],[43,8]],r:13},
  skyAce:{points:[[-8.5,42],[8.5,42]],r:15},
  drone:{points:[[-15,-15],[15,-15],[-15,15],[15,15]],r:7},
  'foundry-small':{points:[[-8,50],[8,50]],r:20},
  'foundry-large':{points:[[-17,60],[0,60],[16,60]],r:20}
};
const SKY_CRAFT_SCALE = {boxBomber:1,skyAce:1.1,drone:1.1};
const HALCYON_STREAK_COLORS = Array.from({length:12},(_,i)=>`rgba(255,230,210,${.25*(1-i/12)})`);
const exhaustSprites = new Map();
function playerExhaust(ship) {
  if(exhaustSprites.has(ship))return exhaustSprites.get(ship);
  const sprite=surface(12,64),c=sprite.getContext('2d');
  const tint=ship==='manta'?'255,187,132':ship==='wraith'?'183,166,255':'119,249,224';
  const gradient=c.createLinearGradient(0,0,0,64);
  gradient.addColorStop(0,'rgba(244,255,243,.9)');
  gradient.addColorStop(.2,'rgba('+tint+',.65)');gradient.addColorStop(1,'rgba('+tint+',0)');
  poly(c,[3,0,9,0,12,64,0,64],gradient);
  exhaustSprites.set(ship,sprite);return sprite;
}
const IMPACT_PARTICLES = new Set(['spark','hit','missile','rail']);
const SPECIAL_SHOTS = new Set(['missile','sidewinder','torpedo','flak','reflect']);
const PARTICLE_PALETTE = Object.freeze({
  cyan:'#7ef4e6',gold:'#ffdb91',amber:'#ffb977',white:'#f7fff0',
  magenta:'#e9a2ec',red:'#ff8d77'
});
function poly(c, p, fill, stroke, width = 1) {
  c.beginPath(); c.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i+1]);
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
function oval(c,x,y,rx,ry,color,stroke=false,width=1) {
  c.beginPath(); c.ellipse(x,y,rx,ry,0,0,TAU);
  if (stroke) { c.strokeStyle=color;c.lineWidth=width;c.stroke(); }
  else { c.fillStyle=color;c.fill(); }
}
function line(c,pts,color,width=1) {
  c.beginPath();c.moveTo(pts[0],pts[1]);
  for(let i=2;i<pts.length;i+=2)c.lineTo(pts[i],pts[i+1]);
  c.strokeStyle=color;c.lineWidth=width;c.stroke();
}
function makeBloomSprite(rgb) {
  const sprite=surface(BLOOM_CACHE_SIZE,BLOOM_CACHE_SIZE),ctx=sprite.getContext('2d');
  const center=BLOOM_CACHE_RADIUS;
  const gradient=ctx.createRadialGradient(center,center,0,center,center,center);
  gradient.addColorStop(0,'rgba('+rgb+',1)');
  gradient.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,BLOOM_CACHE_SIZE,BLOOM_CACHE_SIZE);
  return sprite;
}
function bloom(c,x,y,r,color,profile,opacity=1) {
  const rgb=profile&&BLOOM_PROFILE_RGB[profile];
  if(rgb&&r>0&&r<=BLOOM_CACHE_RADIUS) {
    let sprite=bloomSprites.get(profile);
    if(!sprite) {sprite=makeBloomSprite(rgb);bloomSprites.set(profile,sprite);}
    const previousAlpha=c.globalAlpha;
    c.globalAlpha=previousAlpha*opacity;
    c.drawImage(sprite,x-r,y-r,r*2,r*2);
    c.globalAlpha=previousAlpha;
    return;
  }
  const g=c.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,color);g.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
}
function surface(width,height) {
  const canvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(width,height):document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  return canvas;
}
// Sector 4 painted pieces (docs/design/act-two-art.md). Measured from the sheets in
// logical px: hull half-extents of the painted art, and for each turret head the
// muzzle tips [x, y, splay] in the head cell frame (barrels up) plus the y where the
// barrels meet the mantlet (barrels above it slide back on recoil).
const S4_FLEET='act2-s4-fleet',S4_BOSS='act2-leviathan';
const S4_HULLS={destroyer:{id:'hull-destroyer',w:32,h:150},cruiser:{id:'hull-cruiser',w:46,h:194}};
const TURRET_HUB=10; // the head's round body sits this far below its cell center
const TURRET_GUNS={
  triple:{muzzles:[[-8.3,-30,0],[0,-30,0],[8.3,-30,0]],cut:-8,rim:'#b9c6ad'},
  fan:{muzzles:[[-17.5,-26,-.3],[-5.5,-30,-.08],[5.3,-30,.08],[17.5,-26,.3]],cut:-10,rim:'#8ac3bd'},
  flak:{muzzles:[[-8,-30,0],[7.7,-30,0]],cut:-10,rim:'#e5ae68'},
  broadside:{muzzles:[[-8.8,-30,0],[-3,-30,0],[2.8,-30,0],[8.8,-30,0]],cut:-4,rim:'#b9c6ad'},
  void:{muzzles:[[-5.8,-30,0],[5.8,-30,0]],cut:-7,rim:'#c391e8'}
};
// LEVIATHAN batteries are render-only (broadside rows fire from fixed screen
// columns). The painted hull's port casemate reaches x -210 and the starboard one
// only +190, so the starboard guns sit further in and roll out a little less.
function leviathanBatteryX(side,extension){return side<0?-(178.5+22*extension):166+18*extension;}
const LEVIATHAN_BATTERY_REACH=20.3; // barrel length of the piece at scale 1
const LEVIATHAN_BATTERY_SCALE=1.3;  // the S4 battery pieces read too thin at 1:1 on the casemates
export class Renderer {
  constructor(canvas) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});
    this.time=0;this.travel=0;
    this.seas=[
      ['#0b5a77','#0b5175','#073857'],
      ['#245574','#1d4b6b','#123a59'],
      ['#203d63','#194161','#102d4b'],
      ['#061d1c','#092d29','#041513']
    ].map(colors=>{
      const gradient=this.ctx.createLinearGradient(0,0,0,H);
      gradient.addColorStop(0,colors[0]);gradient.addColorStop(.5,colors[1]);gradient.addColorStop(1,colors[2]);
      return gradient;
    });
    this.sceneTiles=[1,2,3,4].map(stage=>this.makeSceneTile(stage));
    this.lightShafts=['rgba(99,222,192,.09)','rgba(244,167,102,.085)','rgba(137,107,199,.1)','rgba(168,205,165,.06)'].map(color=>{
      const sprite=surface(730,730),g=sprite.getContext('2d'),light=g.createRadialGradient(365,365,15,365,365,365);
      light.addColorStop(0,color);light.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=light;g.fillRect(0,0,730,730);
      return sprite;
    });
    // Distant haze is baked into each scenery tile; only the nearer weather
    // plane moves independently, keeping the dense boss path to one overlay.
    this.weatherTiles=[1,2,3,4].map(stage=>this.makeWeatherTile(stage,true));
    this.bossSprites=[1,2,3].map(stage=>this.makeBossSprite(stage));
    this.bulletSprites=this.makeBulletSprites();
    this.enemyExhaustSprites={
      light:this.makeEnemyExhaustSprite(false),
      heavy:this.makeEnemyExhaustSprite(true)
    };
    this.contactShadows={
      player:this.makeContactShadow(52,24,.34),
      light:this.makeContactShadow(31,13,.36),
      heavy:this.makeContactShadow(54,21,.4),
      boss:this.makeContactShadow(180,66,.5)
    };
    this.lightSprites={
      cool:this.makeLightSprite('112,238,213'),
      warm:this.makeLightSprite('255,180,105'),
      violet:this.makeLightSprite('198,151,250')
    };
    this.foregroundShade=surface(W,H);
    const shade=this.foregroundShade.getContext('2d');
    const v=shade.createRadialGradient(W/2,H*.48,H*.18,W/2,H*.48,H*.77);
    v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,7,18,.24)');
    shade.fillStyle=v;shade.fillRect(0,0,W,H);
    this.impacts=[];this.effectId=0;
    // Sector life, weather, lightning and transitions (see background.js).
    prepareWaterMaps();
    this.ambience=new WorldAmbience();
  }
  makeLightSprite(rgb) {
    const sprite=surface(192,192),c=sprite.getContext('2d');
    const g=c.createRadialGradient(96,96,0,96,96,96);
    g.addColorStop(0,'rgba('+rgb+',.82)');
    g.addColorStop(.23,'rgba('+rgb+',.38)');
    g.addColorStop(.64,'rgba('+rgb+',.12)');
    g.addColorStop(1,'rgba('+rgb+',0)');
    c.fillStyle=g;c.fillRect(0,0,192,192);
    return sprite;
  }
  makeEnemyExhaustSprite(heavy) {
    const len=heavy?57:42,height=len-13;
    const sprite=surface(10,height),c=sprite.getContext('2d');
    const g=c.createLinearGradient(5,4,5,height);
    g.addColorStop(0,'rgba(255,197,140,.58)');
    g.addColorStop(1,'rgba(241,118,83,0)');
    poly(c,[2,0,8,0,10,height,0,height],g);
    return sprite;
  }
  makeContactShadow(rx,ry,opacity) {
    const sprite=surface(rx*2+8,ry*2+8),c=sprite.getContext('2d');
    c.translate(rx+4,ry+4);c.scale(rx,ry);
    const g=c.createRadialGradient(0,0,.1,0,0,1);
    g.addColorStop(0,'rgba(0,5,20,'+opacity+')');
    g.addColorStop(.54,'rgba(2,9,25,'+(opacity*.48)+')');
    g.addColorStop(1,'rgba(3,13,32,0)');
    c.fillStyle=g;c.fillRect(-1,-1,2,2);
    return sprite;
  }
  castShadows(enemies,boss,player) {
    const c=this.ctx,s=this.contactShadows;
    if(boss&&boss.hp>0&&this.currentStage!==4) {
      const x=boss.x??W/2,y=boss.y??285;
      c.drawImage(s.boss,x+22-s.boss.width/2,y+129-s.boss.height/2);
      oval(c,x+22,y+129,146,43,'rgba(150,187,230,.1)',true,1.5);
    }
    for(const e of enemies) {
      if(!e||e.dead||e.alive===false||e.isBoss||['boss','hull','hullTurret','gunboat'].includes(e.type))continue;
      const heavy=/bomber|heavy|gunship|carrier|tank|mini/.test(String(e.type||'').toLowerCase());
      const tile=heavy?s.heavy:s.light;
      c.drawImage(tile,(e.x||0)+8-tile.width/2,(e.y||0)+24-tile.height/2);
    }
    if(player&&!player.dead&&player.alive!==false) {
      c.drawImage(s.player,(player.x??W/2)+8-s.player.width/2,
        (player.y??H*.78)+30-s.player.height/2);
    }
  }
  makeBulletSprites() {
    const themes={
      amber:['#f68455','#ffe6af','255,107,55','255,221,163'],
      red:['#f68455','#ffe6af','255,107,55','255,221,163'],
      magenta:['#b975ec','#fce5ff','190,105,244','240,184,255'],
      cyan:['#ff728b','#fff2dc','255,85,115','255,182,175'],
      void:['#291039','#f1c5ff','140,65,230','237,191,255'],
      rose:['#f67aa1','#ffe0eb','251,107,153','255,192,217']
    };
    const sprites={};
    for(const [kind,[shell,core,halo,ring]] of Object.entries(themes)) {
      sprites[kind]=[];
      // Game projectiles use half-pixel radii; cache each appearance once.
      for(let half=4;half<=26;half++) {
        const r=half/2,extent=Math.ceil(r*3+3),s=surface(extent*2,extent*2),c=s.getContext('2d');
        c.translate(extent,extent);
        const glow=c.createRadialGradient(0,0,r*.3,0,0,r*2.7);
        glow.addColorStop(0,'rgba('+halo+',.3)');glow.addColorStop(1,'rgba('+halo+',0)');
        c.fillStyle=glow;c.fillRect(-extent,-extent,extent*2,extent*2);
        oval(c,0,0,r+1.7,r+1.7,'#07101e');
        oval(c,0,0,r,r,shell);
        if(kind==='void'){
          oval(c,0,0,r,r,'#100c1c');
          oval(c,0,0,r,r,'#d9a7f4',true,2.3);
        }
        if(kind!=='void')oval(c,-r*.2,-r*.23,r*.52,r*.52,core);
        if(r>5)oval(c,0,0,r*1.42,r*1.42,'rgba('+ring+',.72)',true,1);
        sprites[kind][half]=s;
      }
    }
    return sprites;
  }
  makeSceneTile(stage) {
    const tile=surface(W,1400),c=tile.getContext('2d');
    c.drawImage(this.makeWeatherTile(stage,false),0,0);
    if(stage===4)return tile; // Sector 4 sea is authored by drawCoast; no painted scenery.
    drawAtlasScenery(c,stage);
    if(stage===2) this.drawFoundry(c);
    else if(stage===3) this.drawMaelstrom(c);
    return tile;
  }
  makeWeatherTile(stage,near) {
    const tile=surface(W,1400),c=tile.getContext('2d');
    const count=near?20:26;
    for(let i=0;i<count;i++) {
      const x=hash(i*37+stage*29+(near?71:0))*W;
      const y=hash(i*59+stage*17+(near?13:0))*1400;
      const r=(near?92:130)+hash(i*11+stage*7)*95;
      const tint=stage===1?'115,214,195':stage===2?'241,156,105':'161,145,227';
      const shadow=stage===1?'7,31,43':stage===2?'30,23,31':'12,13,35';
      const g=c.createRadialGradient(x,y,4,x,y,r);
      g.addColorStop(0,'rgba('+tint+','+(near?.105:.065)+')');
      g.addColorStop(.55,'rgba('+shadow+','+(near?.16:.21)+')');
      g.addColorStop(1,'rgba('+shadow+',0)');
      c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
    }
    for(let i=0;i<(near?75:48);i++) {
      const x=hash(i*23+stage*31+(near?4:9))*W;
      const y=hash(i*41+stage*13+(near?27:3))*1400;
      const len=18+hash(i*17+stage)*64;
      if(stage===3) {
        line(c,[x,y,x-5,y+len],near?'rgba(195,176,255,.13)':'rgba(150,167,232,.075)',1);
      } else if(stage===2) {
        line(c,[x-len*.5,y,x+len*.5,y+1],near?'rgba(255,191,121,.15)':'rgba(246,168,116,.08)',near?2:1);
      } else {
        line(c,[x-len*.5,y,x+len*.5,y-2],near?'rgba(189,247,222,.19)':'rgba(157,215,206,.1)',near?2:1);
      }
    }
    if(near) {
      // Cached soft lobes avoid a hard polygon edge against detailed terrain.
      const rgb=stage===3?'122,137,173':stage===2?'149,158,172':'184,212,210';
      for(let i=0;i<18;i++){
        const x=430+Math.sin(i*1.8)*90,y=1070+Math.cos(i*1.1)*44;
        const r=40+hash(i*12+stage)*70;
        const g=c.createRadialGradient(x,y,0,x,y,r);
        g.addColorStop(0,'rgba('+rgb+',.09)');g.addColorStop(.55,'rgba('+rgb+',.045)');g.addColorStop(1,'rgba('+rgb+',0)');
        c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
      }
    }
    return tile;
  }
  drawWeatherTile(tile,scroll,speed) {
    const c=this.ctx,h=tile.height;
    const offset=(scroll*speed)%h,top=(h-offset)%h;
    const first=Math.min(H,h-top);
    c.drawImage(tile,0,top,W,first,0,0,W,first);
    if(first<H)c.drawImage(tile,0,0,W,H-first,0,first,W,H-first);
  }
  drawShoals(c) {
    // Bright surf around dark, broken coastal shelves. All geometry is baked.
    for(let i=0;i<8;i++) {
      const side=i%2===0?-1:1,cy=120+i*171+hash(i*21)*42;
      const cx=side<0?-50+hash(i*13)*36:W+50-hash(i*13)*36;
      const rx=135+hash(i*7+3)*54,ry=105+hash(i*11+6)*55;
      const wash=c.createRadialGradient(cx,cy,ry*.24,cx,cy,rx*1.36);
      wash.addColorStop(0,'rgba(70,171,156,.28)');
      wash.addColorStop(.62,'rgba(85,172,150,.13)');
      wash.addColorStop(1,'rgba(85,172,150,0)');
      c.fillStyle=wash;c.fillRect(cx-rx*1.4,cy-ry*1.4,rx*2.8,ry*2.8);
      // Submerged shelf shadow sits below the stepped rock and surf rim.
      oval(c,cx+side*14,cy+19,rx*1.03,ry*.81,'rgba(3,23,35,.33)');
      for(let layer=0;layer<4;layer++) {
        const scale=1-layer*.16;
        c.beginPath();
        for(let j=0;j<=40;j++) {
          const a=j*TAU/40;
          const rough=1+Math.sin(a*5+i*1.7)*.085+Math.cos(a*11+i*.7)*.045;
          const x=cx+Math.cos(a)*rx*scale*rough,y=cy+Math.sin(a)*ry*scale*rough;
          if(j===0)c.moveTo(x,y);else c.lineTo(x,y);
        }
        c.closePath();
        c.fillStyle=['#1b4651','#2c6161','#3d746b','#638b73'][layer];c.fill();
        c.strokeStyle=layer===0?'rgba(179,242,210,.5)':'rgba(186,227,186,.2)';
        c.lineWidth=layer===0?3:1.4;c.stroke();
      }
      // Broad sunward planes and narrow dark clefts make the shelves read as
      // raised stone rather than flat map outlines. These live on the tile.
      poly(c,[cx-rx*.49,cy-ry*.24,cx-rx*.09,cy-ry*.52,
        cx+rx*.31,cy-ry*.29,cx+rx*.06,cy-ry*.02],
        'rgba(193,232,179,.28)');
      poly(c,[cx+rx*.08,cy-ry*.02,cx+rx*.47,cy-ry*.16,
        cx+rx*.29,cy+ry*.31,cx-rx*.09,cy+ry*.43],
        'rgba(6,31,42,.45)');
      line(c,[cx-rx*.39,cy-ry*.29,cx-rx*.08,cy-ry*.49,
        cx+rx*.25,cy-ry*.3],'rgba(226,247,197,.34)',2);
      for(let crack=0;crack<3;crack++) {
        const ox=cx+(crack-1)*rx*.24,oy=cy+ry*(crack%2?.16:-.03);
        line(c,[ox-10,oy-4,ox+1,oy+4,ox+11,oy+1],
          'rgba(11,48,51,.25)',1.7);
      }
      const px=cx-side*rx*.4,py=cy-ry*.26;
      poly(c,[px-23,py-9,px+20,py-9,px+27,py+8,px-25,py+8],'#17333b','#c2d3b4',1);
      for(let post=-1;post<=1;post++) {
        c.fillStyle='#dbc897';c.fillRect(px+post*14-1,py-5,2,7);
      }
      line(c,[px,py-10,px,py-34],'#c6dcba',1.4);
      oval(c,px,py-35,2.6,2.6,'#f9deb0');
      for(let j=0;j<5;j++) {
        const wx=cx-side*(rx*.72+j*9),wy=cy+(j-2)*17;
        line(c,[wx-10,wy,wx+8,wy-2],'rgba(190,248,225,.35)',1.5);
      }
    }
    // One wrecked convoy provides a human scale and a directional wake.
    for(let i=0;i<3;i++) {
      const x=i%2?W-100:87,y=215+i*420;
      poly(c,[x,y-31,x-12,y-15,x-14,y+25,x,y+38,x+14,y+25,x+12,y-15],
        'rgba(9,31,42,.52)','rgba(160,215,200,.22)',1);
      line(c,[x,y+37,x-8,y+76],'rgba(176,241,221,.23)',2);
      line(c,[x,y+37,x+8,y+76],'rgba(176,241,221,.23)',2);
      oval(c,x,y-10,3,7,'rgba(214,227,194,.42)');
    }
    for(let i=0;i<70;i++) {
      const x=hash(i*17+5)*W,y=hash(i*31+7)*1400;
      c.fillStyle='rgba(187,241,221,.22)';
      c.fillRect(x,y,3+hash(i*19)*10,hash(i+3)>.85?2:1);
    }
  }
  drawFoundry(c) {
    // Soot clouds and furnace reflections surround an industrial strait.
    for(let i=0;i<9;i++) {
      const x=i%2?W-40:40,y=85+i*165,r=100+hash(i*5)*48;
      const g=c.createRadialGradient(x,y,8,x,y,r);
      g.addColorStop(0,i%3===0?'rgba(239,156,96,.17)':'rgba(31,31,43,.42)');
      g.addColorStop(1,'rgba(24,24,35,0)');
      c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
    }
    for(let i=0;i<2;i++) {
      const y=225+i*690,side=i%2===0?-1:1;
      c.save();c.translate(side<0?0:W,y);c.scale(side<0?1:-1,1);
      // Massive steel docks recede into the lane in stepped, layered planes.
      poly(c,[-36,-110,57,-110,125,-68,151,4,106,75,-36,89],
        '#202f3b','#b3977e',2);
      poly(c,[-30,-99,49,-99,113,-57,132,2,94,61,-30,76],
        '#53606a','#c6aa86',1.4);
      poly(c,[-20,-90,42,-90,100,-51,119,0,82,49,-20,64],
        '#796b67');
      // Deck top, recessed wall, and side bevel are separate light planes.
      poly(c,[42,-90,100,-51,119,0,82,49,68,40,103,-1,88,-44],
        'rgba(255,218,159,.3)');
      poly(c,[-20,50,82,39,119,0,106,75,-30,76],
        'rgba(13,26,39,.59)');
      line(c,[-19,-88,42,-88,99,-50,118,-2],
        'rgba(255,223,174,.45)',2.1);
      for(let rib=0;rib<7;rib++) {
        const xx=10+rib*14;
        line(c,[xx,-74+rib*3,xx+8,-68+rib*3],
          'rgba(31,42,51,.37)',2.5);
        oval(c,xx+2,43-rib*2,1.6,1.6,'rgba(252,218,166,.38)');
      }
      for(let deck=0;deck<5;deck++) {
        const yy=-70+deck*27;
        line(c,[8,yy,72+deck*6,yy+4],'rgba(247,202,138,.48)',2);
        c.fillStyle='rgba(23,33,43,.65)';c.fillRect(9,yy+6,34+deck*8,8);
      }
      // Drydock gantry, hanging cable, hazard lamps and a furnace vent.
      poly(c,[52,-94,63,-94,67,32,55,32],'#243542','#d6b283',1.5);
      poly(c,[56,-91,161,-112,164,-104,60,-82],'#313d47','#e7bb80',1.2);
      line(c,[146,-108,146,-37],'rgba(218,212,178,.58)',1.3);
      poly(c,[134,-37,158,-37,153,-22,140,-22],'#e1b270');
      oval(c,146,-28,4,4,'#fff1bf');
      c.fillStyle='#392e35';c.fillRect(22,32,39,19);
      c.fillStyle='#ef975a';c.fillRect(27,32,29,5);
      for(let post=0;post<4;post++) {
        oval(c,12+post*24,61,2.5,2.5,post%2?'#f5c581':'#d98567');
      }
      c.restore();
      // A reflected orange furnace column breaks up the dark water.
      const x=side<0?80:W-80;
      for(let j=0;j<8;j++) {
        const yy=y+82+j*13,w=21-j*1.6;
        line(c,[x-w,yy,x+w,yy],'rgba(255,163,95,'+(.14-j*.012)+')',2);
      }
    }
    for(let i=0;i<45;i++) {
      const x=hash(i*19+4)*W,y=hash(i*23+7)*1400;
      line(c,[x,y,x+6+hash(i*17)*13,y+1],'rgba(255,213,169,.13)',1);
    }
  }
  drawMaelstrom(c) {
    c.fillStyle='rgba(19,13,42,.10)';c.fillRect(0,0,W,1400);
    // Gigantic concentric storm bands bend around a drifting dark eye.
    for(let group=0;group<2;group++) {
      const cx=270+Math.sin(group*2.7)*76,cy=320+group*640;
      const g=c.createRadialGradient(cx,cy,48,cx,cy,300);
      g.addColorStop(0,'rgba(8,13,30,.2)');
      g.addColorStop(.65,'rgba(101,87,164,.12)');
      g.addColorStop(1,'rgba(88,120,185,0)');
      c.fillStyle=g;c.fillRect(cx-310,cy-310,620,620);
      // Wide lit crest over a dark lower swell gives the storm a raised
      // relief plane without competing with orange and violet projectiles.
      c.beginPath();
      c.ellipse(cx+12,cy+22,193,72,-.24,.18,Math.PI*1.73);
      c.strokeStyle='rgba(4,10,29,.25)';c.lineWidth=27;c.stroke();
      c.beginPath();
      c.ellipse(cx-7,cy-13,180,67,-.24,.18,Math.PI*1.72);
      c.strokeStyle='rgba(153,158,227,.12)';c.lineWidth=15;c.stroke();
      for(let band=0;band<5;band++) {
        c.beginPath();
        c.ellipse(cx,cy,95+band*42,39+band*22,-.24,
          .12+band*.08,Math.PI*1.8+band*.07);
        c.strokeStyle=band%2?'rgba(124,151,213,.13)':'rgba(183,157,235,.17)';
        c.lineWidth=band===0?6:2;c.stroke();
      }
    }
    // Wrecked signal towers and crystalline spires frame the kill zone.
    for(let i=0;i<3;i++) {
      const side=i%2===0?-1:1,y=215+i*430+hash(i*3)*31;
      c.save();c.translate(side<0?0:W,y);c.scale(side<0?.78:-.78,.78);
      const h=87+hash(i*11)*76,w=72+hash(i*13)*32;
      poly(c,[-22,73,19,57,34,-h*.5,49,-h,70,-h*.53,w,37,133,89],
        '#111d35','#566182',1.8);
      poly(c,[29,49,39,-h*.43,49,-h+9,59,-h*.44,74,53],
        '#36415f');
      poly(c,[49,-h+8,45,-h*.44,54,-h*.2,51,48],
        'rgba(154,143,238,.44)');
      // Faceted mineral: one cold face, one amethyst face, and a cut edge.
      poly(c,[19,57,34,-h*.5,49,-h,45,-h*.44,38,42],
        'rgba(123,151,204,.19)');
      poly(c,[59,-h*.44,70,-h*.53,w,37,133,89,74,53],
        'rgba(13,17,44,.38)');
      poly(c,[50,-h+10,59,-h*.46,55,-h*.17,52,46],
        'rgba(213,186,255,.18)');
      line(c,[48,-h+4,35,-h*.49,21,57],
        'rgba(183,204,255,.34)',1.7);
      line(c,[49,-h+8,45,-h*.44,54,-h*.2,51,48],
        'rgba(194,183,255,.55)',1.5);
      for(let j=0;j<4;j++) {
        const xx=78+j*11,yy=35+j*7;
        poly(c,[xx,yy,xx+9,yy-24,xx+21,yy+4,xx+8,yy+15],
          j%2?'#283550':'#202e4b','rgba(139,156,211,.28)',1);
      }
      // Hanging chains and wreck lights give the monoliths scale.
      line(c,[107,-18,107,60],'rgba(157,176,220,.25)',1);
      oval(c,107,65,4,4,'rgba(196,176,255,.48)');
      c.restore();
    }
    for(let i=0;i<5;i++) {
      const side=i%2===0?-1:1,x=side<0?39:W-39,y=165+i*270;
      const dir=side<0?1:-1;
      line(c,[x,y,x+dir*18,y+34,x+dir*6,y+70,x+dir*27,y+95],
        'rgba(199,203,255,.34)',2);
      line(c,[x+dir*18,y+34,x+dir*42,y+47],'rgba(177,195,255,.25)',1);
    }
    for(let i=0;i<85;i++) {
      const x=hash(i*17+5)*W,y=hash(i*31+7)*1400;
      line(c,[x,y,x-6,y+10+hash(i*3)*14],
        'rgba(184,194,245,'+(.045+hash(i+8)*.065)+')',1);
    }
  }
  makeBossSprite(stage) {
    const sprite=surface(390,340),c=sprite.getContext('2d');
    c.translate(195,170);
    if(stage===1) this.drawVesper(c);
    else if(stage===2) this.drawAurelia(c);
    else this.drawCrown(c);
    return sprite;
  }
  drawVesper(c) {
    // Vesper: broad, asymmetrical copper convoy killer with twin turbines.
    bloom(c,0,0,175,'rgba(230,114,75,.22)');
    oval(c,8,26,157,69,'rgba(2,12,24,.43)');
    for(const side of [-1,1]) {
      c.save();c.scale(side,1);
      poly(c,[9,-61,88,-103,158,-73,161,-35,121,31,49,57,15,18],
        '#273846','#d49268',2);
      poly(c,[20,-52,89,-87,143,-62,139,-37,107,20,52,37,21,10],
        '#a65c4e','#efb577',1.2);
      poly(c,[44,-40,98,-61,122,-46,115,-27,68,-5],
        '#d98967');
      poly(c,[21,-50,89,-84,141,-61,121,-51,69,-69],
        'rgba(255,228,174,.29)');
      poly(c,[21,10,52,37,107,20,139,-37,131,12,111,31,63,49],
        'rgba(35,27,43,.31)');
      poly(c,[45,-37,80,-53,114,-40,66,-24],
        'rgba(255,221,165,.25)');
      for(let rivet=0;rivet<4;rivet++)
        oval(c,66+rivet*15,-47+rivet*3,1.7,1.7,'rgba(255,231,183,.48)');
      poly(c,[64,10,132,-6,145,23,108,49,65,43],
        '#543e47','#d69672',1.4);
      // Engines and guns project beyond the long wings.
      poly(c,[95,-18,126,-29,144,-9,142,42,118,62,93,42],
        '#263946','#dfae78',1.4);
      oval(c,119,11,17,22,'#1a3542');
      oval(c,119,9,10,14,'#f0aa70');
      oval(c,119,9,4,5,'#ffebae');
      poly(c,[113,46,128,46,130,76,121,83,110,75],
        '#273945','#e7b482',1.2);
      oval(c,121,76,6,7,'#f5a66c');
      for(let k=0;k<5;k++) {
        line(c,[54+k*13,-43+k*4,58+k*13,-23+k*3],
          'rgba(255,218,168,.55)',1.4);
      }
      c.restore();
    }
    const hull=c.createLinearGradient(-28,0,30,0);
    hull.addColorStop(0,'#774b4b');hull.addColorStop(.5,'#e4a46e');hull.addColorStop(1,'#563e48');
    poly(c,[0,-123,-22,-80,-35,-19,-26,55,0,91,26,55,35,-19,22,-80],
      hull,'#ffcd89',1.7);
    poly(c,[0,-116,-12,-78,-16,43,0,70,16,43,12,-78],
      '#f2c182');
    poly(c,[0,-104,-5,-58,-5,36,0,52,5,36,5,-58],
      '#ffe0a3');
    poly(c,[0,-116,16,-78,16,43,0,70],
      'rgba(71,38,52,.28)');
    line(c,[-12,-78,-15,39,0,69],
      'rgba(255,239,192,.7)',1.8);
    poly(c,[-24,-21,-9,-37,9,-37,24,-21,17,14,0,30,-17,14],
      '#2e4851','#efbd86',1.4);
    oval(c,0,-14,9,15,'#193a48');
    oval(c,0,-17,4,7,'#ffe2a1');
    for(const side of [-1,1]) {
      oval(c,side*47,17,13,17,'#423946');
      oval(c,side*47,17,7,9,'#ffbd7f');
      line(c,[side*38,-31,side*78,-53],'rgba(255,227,177,.72)',2);
    }
    oval(c,0,50,17,17,'#da8a65');
    oval(c,0,50,9,9,'#fff0b9');
  }
  drawAurelia(c) {
    // Aurelia: a hovering solar annulus, never a conventional winged plane.
    bloom(c,0,0,174,'rgba(255,191,95,.24)');
    oval(c,7,24,145,115,'rgba(7,15,27,.45)');
    for(let j=0;j<20;j++) {
      const a=j*TAU/20;
      const x=Math.cos(a),y=Math.sin(a);
      poly(c,[x*105-y*6,y*102+x*6,x*131,y*127,
        x*105+y*6,y*102-x*6],
        j%2?'#9d684e':'#d29964');
    }
    oval(c,0,0,109,104,'#2e424c',true,19);
    oval(c,0,0,109,104,'#f0c080',true,2.4);
    // Ceramic annulus has an illuminated lip and a deeper inner wall.
    oval(c,0,0,99,94,'rgba(255,223,157,.22)',true,11);
    oval(c,0,0,91,86,'rgba(9,32,43,.55)',true,9);
    for(let spoke=0;spoke<16;spoke++) {
      const a=spoke*TAU/16;
      line(c,[Math.cos(a)*99,Math.sin(a)*94,
        Math.cos(a)*108,Math.sin(a)*103],
        'rgba(255,237,183,.43)',1.6);
    }
    oval(c,0,0,86,81,'rgba(17,42,53,.82)',true,4);
    for(const side of [-1,1]) {
      c.save();c.scale(side,1);
      poly(c,[68,-83,133,-105,165,-70,145,-15,168,30,129,91,79,76,109,14],
        '#4c4850','#f4bd7c',1.8);
      poly(c,[91,-70,132,-86,146,-61,126,-10,146,29,119,64,94,52,113,10],
        '#ae7761');
      poly(c,[70,-80,132,-102,164,-69,145,-45,129,-76],
        'rgba(255,240,189,.3)');
      poly(c,[146,-61,126,-10,146,29,119,64,129,91,168,30],
        'rgba(30,31,48,.33)');
      line(c,[93,-67,129,-84,149,-62],
        'rgba(255,245,202,.55)',1.8);
      poly(c,[124,-72,131,-28,118,12,137,43],
        'rgba(254,215,144,.37)');
      poly(c,[122,37,143,48,145,79,133,96,117,78],
        '#263c4a','#e3af75',1.4);
      oval(c,132,75,8,9,'#f9d395');
      line(c,[93,-62,134,-74],'rgba(255,232,172,.71)',2);
      c.restore();
    }
    // Serrated sun sails form a vertical hourglass silhouette.
    poly(c,[0,-147,-25,-94,0,-107,25,-94],
      '#e8b67a','#fff0b7',1.4);
    poly(c,[0,132,-29,80,0,94,29,80],
      '#a36857','#eac48b',1.2);
    for(let j=0;j<8;j++) {
      const a=j*TAU/8;
      const x=Math.cos(a)*72,y=Math.sin(a)*67;
      poly(c,[x,y,x+Math.cos(a-.19)*18,y+Math.sin(a-.19)*18,
        x+Math.cos(a)*34,y+Math.sin(a)*34,
        x+Math.cos(a+.19)*18,y+Math.sin(a+.19)*18],
        j%2?'#aa7457':'#dca770');
    }
    oval(c,5,7,60,56,'rgba(10,25,38,.47)');
    oval(c,0,0,58,55,'#765851');
    for(let ray=0;ray<12;ray++) {
      const a=ray*TAU/12;
      line(c,[Math.cos(a)*47,Math.sin(a)*44,
        Math.cos(a)*54,Math.sin(a)*51],
        'rgba(255,242,190,.38)',1.5);
    }
    oval(c,0,0,49,46,'#d39b62',true,8);
    oval(c,0,0,37,35,'#273f4c');
    oval(c,0,0,29,27,'#ffcf80');
    oval(c,0,0,16,15,'#fff2bc');
    for(let j=0;j<8;j++) {
      const a=j*TAU/8;
      line(c,[Math.cos(a)*42,Math.sin(a)*40,
        Math.cos(a)*54,Math.sin(a)*52],'#ffe7aa',2.2);
    }
  }
  drawCrown(c) {
    // The Crown: a fractured airborne citadel with a tall central spire.
    bloom(c,0,0,183,'rgba(161,103,220,.17)');
    oval(c,9,28,167,91,'rgba(1,6,22,.53)');
    for(const side of [-1,1]) {
      c.save();c.scale(side,1);
      poly(c,[16,-68,70,-102,86,-72,124,-94,164,-48,151,18,
        167,61,122,83,72,43,21,50],
        '#151d35','#aa82ba',2.3);
      poly(c,[39,-60,77,-85,89,-49,130,-72,148,-40,137,14,
        149,51,116,66,70,27,43,37],
        '#704e7d');
      poly(c,[40,-60,77,-85,89,-49,74,-23,56,-32],
        '#bf93b6');
      poly(c,[89,-49,130,-72,148,-40,137,14,116,66,
        119,12,126,-39],
        '#302849');
      line(c,[40,-58,77,-83,88,-49,129,-69],
        'rgba(237,199,241,.43)',1.6);
      for(let seam=0;seam<3;seam++)
        line(c,[61+seam*21,-39,67+seam*21,-7],
          'rgba(202,159,224,.24)',1.4);
      poly(c,[66,-54,79,-108,91,-58,83,29,71,34],
        '#af7f9e','#efbad0',1.8);
      poly(c,[111,-55,121,-109,132,-57,128,13,115,24],
        '#76547d','#e1a8c2',1.8);
      poly(c,[79,4,115,-14,135,5,128,55,106,73,75,46],
        '#27334d','#b28ba6',1.4);
      for(let j=0;j<4;j++) {
        poly(c,[53+j*14,-17,57+j*14,-29,62+j*14,-14,
          60+j*14,3,55+j*14,4],
          j%2?'#c18ba9':'#704d80');
      }
      oval(c,122,27,15,18,'#172b44');
      oval(c,122,27,9,11,'#d995d0');
      oval(c,122,27,4,5,'#fff0d6');
      poly(c,[118,55,133,55,137,96,127,108,115,94],
        '#27334c','#c796c7',1.2);
      oval(c,127,96,7,9,'#b17ec2');
      c.restore();
    }
    poly(c,[-33,-61,-21,-92,0,-135,21,-92,33,-61,30,70,0,108,-30,70],
      '#252842','#d0a1c7',2.4);
    poly(c,[-21,-64,-12,-101,0,-128,12,-101,21,-64,19,64,0,86,-19,64],
      '#a376a0');
    poly(c,[-9,-64,0,-128,9,-64,9,54,0,71,-9,54],
      '#f0b7ad');
    poly(c,[0,-128,9,-64,9,54,0,71],
      '#51345d');
    line(c,[-9,-61,0,-125,9,-61],
      'rgba(255,231,219,.65)',2);
    poly(c,[-11,-29,0,-47,11,-29,14,21,0,43,-14,21],
      '#243b51','#e3a6c8',1.4);
    oval(c,0,-10,8,17,'#d694c9');
    oval(c,0,-13,4,8,'#fff0d6');
    for(const side of [-1,1]) {
      line(c,[side*34,-53,side*76,-74],
        'rgba(255,201,212,.66)',2);
      line(c,[side*34,29,side*64,52],
        'rgba(191,143,211,.65)',1.5);
    }
    oval(c,0,65,17,21,'#673d74');
    oval(c,0,65,9,12,'#efb3d6');
  }
  makeCloudTile(stage) {
    const tile=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(700,1400):document.createElement('canvas');
    tile.width=700;tile.height=1400;
    const c=tile.getContext('2d');
    const cloud=(x,y,r,sy,stops)=>{
      c.save();c.translate(x,y);c.scale(1,sy);
      const g=c.createRadialGradient(0,0,0,0,0,r);
      for(const stop of stops)g.addColorStop(stop[0],stop[1]);
      c.fillStyle=g;c.fillRect(-r,-r,r*2,r*2);c.restore();
    };
    const warm=stage===2?'rgba(255,184,108,':'rgba(246,210,149,';
    const cool=stage===3?'rgba(185,148,216,':'rgba(159,220,213,';
    for(let front=0;front<4;front++){
      const baseY=front*350+80;
      const slope=front%2?-.19:.15;
      // Large shadow body, illuminated rim, and scalloped cloud crowns.
      for(let i=-2;i<12;i++){
        const x=i*76+hash(front*23+i+8)*40-25;
        const y=baseY+(x-350)*slope+Math.sin(i*1.72+front)*22;
        const r=120+hash(front*47+i+5)*68;
        cloud(x,y+31,r,.69,[[0,'rgba(9,30,42,.52)'],[.55,'rgba(16,42,51,.42)'],[1,'rgba(12,37,47,0)']]);
        cloud(x-6,y-24,r*.84,.49,[[0,warm+(.18+hash(i+front)*.09)+')'],[.55,cool+'.12)'],[1,'rgba(255,255,255,0)']]);
        cloud(x-18,y-48,r*.58,.29,[[0,cool+'.17)'],[.7,cool+'.055)'],[1,'rgba(255,255,255,0)']]);
      }
      c.beginPath();
      for(let x=-20;x<=720;x+=10){
        const y=baseY+(x-350)*slope-47+Math.sin(x*.027+front)*16+Math.sin(x*.069+front)*6;
        if(x===-20)c.moveTo(x,y);else c.lineTo(x,y);
      }
      c.strokeStyle=warm+'.24)';c.lineWidth=2.3;c.stroke();
      c.strokeStyle=cool+'.13)';c.lineWidth=7;c.stroke();
    }
    return tile;
  }
  draw(game={},dt=1/60) {
    const c=this.ctx;
    this.currentStage=Math.max(1,game.stage||1);
    this.fleetEnemies=game.enemies||[];this.fleetBoss=game.boss;
    if((game.stageTime||0)<(this.fleetStageTime||0)-1)this.fleetWrecks?.clear();
    this.fleetStageTime=game.stageTime||0;
    if(this.fleetFireClocks?.size>80)this.fleetFireClocks.clear();
    const step=clamp(dt>1?dt/1000:dt,0,.05);
    if(game.mode!=='paused') {this.time+=step;this.travel+=step*105;}
    const t=Number.isFinite(game.time)?game.time:this.time;
    const scroll=Number.isFinite(game.scroll)?game.scroll:this.travel;
    if(!this.monsoonWarmed&&(this.currentStage===4||(game.events||[]).some(e=>e.type==='actTwo'))){
      // A real blit plus a one-pixel read forces rasterization before the first
      // strike. Alpha zero (or an immediately covered blit) can be culled.
      c.save();c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation='lighter';
      c.drawImage(monsoonSea().lit,0,0);
      const storm=this.ambience.monsoonSprites();
      for(const tile of [storm.shipLit,...storm.scudLit,storm.flash])c.drawImage(tile,0,0);
      c.getImageData(0,0,1,1);c.restore();this.monsoonWarmed=true;
    }
    if(!this.skyWarmed&&skyArt.warmSkyforge&&(
      (this.currentStage===4&&game._transition>0&&game._transition<=game._transitionLength-.5)||this.currentStage===5)){
      this.skyWarmed=skyArt.warmSkyforge()!==false;
    }
    if(!this.zeroWarmed&&skyArt.warmZeroMeridian&&((this.currentStage===5&&game._transition>0)||this.currentStage===6)){
      do{this.zeroWarmed=skyArt.warmZeroMeridian()!==false;}while(this.currentStage===6&&!this.zeroWarmed);
    }
    c.setTransform(1,0,0,1,0,0);c.fillStyle='#061b2b';c.fillRect(0,0,W,H);
    c.save();
    this.playerPoint=game.player;
    this.skyEnemies=game.enemies||[];this.skyLaserWarning=(game.hazards||[]).some(h=>h.kind==='laser'&&h.state==='warn');
    const shake=this.reducedEffects?0:clamp(Number(game.shake||0),0,14);
    if(shake) c.translate(Math.sin(t*163)*shake*.55,Math.cos(t*179)*shake*.55);
    this.background(scroll,t,game.stage||1,game,step);
    if(this.currentStage===5&&game.boss?.phase>=3){
      const eclipse=clamp(game.boss.eclipse??1,0,1);c.save();c.globalAlpha=eclipse;
      bloom(c,408,244,54,'#d9a1e0','rimViolet',.7);oval(c,408,244,35,35,'#1b152d');oval(c,408,244,37,37,'#d9a1e0',true,1.5);c.restore();
    }
    this.drawReactorCover(game.boss);
    this.zeroBoss=game.boss;
    this.captureEffects(game.events||[],step);
    this.drawWorldResponse();
    this.castShadows(game.enemies||[],game.boss,game.player);
    this.drawCombatLighting(game);
    const fleet=this.currentStage===4,enemies=game.enemies||[];
    if(fleet){
      for(const e of enemies)if(e.type==='hull'||e.type==='gunboat')this.enemy(e,t);
      for(const e of enemies)if(e.type==='hullTurret'&&e.parentId!==game.boss?.id)this.enemy(e,t);
      for(const e of enemies)if(e.type==='hull'&&!e.dead)this.fleetTurretWrecks(e,t);
      for(const fx of this.impacts)if(fx.fleet&&fx.type==='bossDown')this.sinkingLeviathan(fx,t);
    }
    this.pickups(game.pickups||[],t);
    if(!fleet){if(this.currentStage!==5)this.projectiles(game.shots||[],true,t);this.arsenalCraft(game.player,t);}
    for(const e of enemies)if(!fleet||!['hull','gunboat','hullTurret'].includes(e.type)){if(!['foundry','foundryBay','tailGunner'].includes(e.type)&&!(this.currentStage===5&&e.type==='hullTurret'))this.enemy(e,t);}
    if(game.boss&&!enemies.includes(game.boss)) this.boss(game.boss,t);
    for(const e of enemies)if(e.type==='tailGunner')this.enemy(e,t);
    if(!fleet)this.drawEffects(t);
    else this.projectiles(game.shots||[],true,t);
    this.drawReactorCoverLabel(game.boss);
    this.drawBossLance(game.boss,t);
    if(!fleet)this.particles(game.particles||[]);
    this.player(game.player,t);
    if(fleet)this.arsenalCraft(game.player,t);
    for(const e of enemies)if(e.type==='foundry')this.enemy(e,t);
    for(const e of enemies)if(e.type==='foundryBay')this.enemy(e,t);
    // Foundry void batteries sit on the deck, so they draw over their foundry.
    if(this.currentStage===5)for(const e of enemies)if(e.type==='hullTurret')this.enemy(e,t);
    if(this.currentStage===5){
      this.ambience.drawSkyforgeOver?.(c,game);
      this.foundrySilhouettes(game.player,enemies,t);
      const p=game.player;if(p&&!p.dead){c.save();c.translate(p.x,p.y);this.playerCore(p);c.restore();}
    }
    if(this.currentStage===6)this.ambience.drawSkyforgeOver?.(c,game);
    this.shieldAura(game.player);
    this.zeroEffects(game,t);
    this.skyHazards(game,t);
    if(this.currentStage===5)this.projectiles(game.shots||[],true,t);
    // Threats stay above the hull, escorts, orbitals, smoke and auras.
    this.projectiles(game.bullets||[],false,t);
    if(this.currentStage===6)this.zeroLabels();
    if(fleet){this.particles(game.particles||[]);this.drawEffects(t);this.fleetEffects(t);}
    this.foreground(t,this.reducedEffects?0:Math.min(.09,game.flash||0));
    c.restore();c.setTransform(1,0,0,1,0,0);
    if(fleet){
      this.fleetPickupPoints=(game.pickups||[]).map(p=>({id:p.id,x:p.x,y:p.y,type:p.type}));
      this.fleetMountPoints=enemies.filter(e=>e.type==='hullTurret'&&!e.dead&&e.hp>0).map(e=>({id:e.id,parentId:e.parentId,x:e.x,y:e.y,ox:e.ox,oy:e.oy,gun:e.gun,aim:e.aim}));
      for(const [id,wreck] of this.fleetWrecks||[]){if(!enemies.some(e=>e.id===wreck.parentId)&&game.boss?.id!==wreck.parentId)this.fleetWrecks.delete(id);}
    }
  }
  captureEffects(events,step) {
    if(step>0) for(const fx of this.impacts)fx.age+=step;
    this.impacts=this.impacts.filter(fx=>fx.age<fx.life);
    this.seenEffects ||= new WeakSet();
    this.fleetMuzzles ||= new Map();
    for(const [id,left] of this.fleetMuzzles){if(left<=step)this.fleetMuzzles.delete(id);else this.fleetMuzzles.set(id,left-step);}
    for(const event of events) {
      if(!event||this.seenEffects.has(event))continue;
      this.seenEffects.add(event);
      const type=event.type;
      if(this.currentStage===6&&['mirrorCopy','shardBreak','tetherCut','tetherLost','sovereignGrow','mirrorShatter','bossDown'].includes(type)){
        const death=type==='mirrorShatter'||type==='bossDown';
        if(death&&this.impacts.some(f=>f.zero&&f.death&&f.age<.2))continue;
        this.impacts.push({zero:true,death,type,x:event.x??this.zeroBoss?.x??270,y:event.y??this.zeroBoss?.y??180,w:event.w??200,h:event.h??80,angle:event.angle??0,value:event.value,count:event.count,age:0,life:death?2.6:type==='mirrorCopy'?1.4:.65});continue;
      }
      if(this.currentStage===5&&['foundryDown','bayDown','empPulse','flakBurst','laserFire'].includes(type)){
        this.impacts.push({type,sky:true,x:event.x??270,y:event.y??280,age:0,life:type==='foundryDown'?2.1:type==='bayDown'?1:.45});continue;
      }
      if(type==='boxEnter'||(this.currentStage===5&&(type==='wingBreak'||type==='bossDown'))){
        if(this.impacts.some(f=>f.type==='wingBreak'&&f.age<.2)){const pose=this.impacts.find(f=>f.type==='wingBreak'&&f.age<.2);if(event.bays)pose.bays=event.bays;continue;}
        this.impacts.push({type:type==='bossDown'?'wingBreak':type,x:event.x??270,y:event.y??180,w:event.w??220,h:event.h??70,angle:event.angle??0,bays:event.bays||[],value:event.value,age:0,life:type==='boxEnter'?1.2:3.6});continue;
      }
      if(this.currentStage===4){
        if(type==='bossShot'||type==='shoot'){
          // Existing shot events provide origin coordinates; no simulation field needed.
          for(const e of this.fleetEnemies||[])if(e.type==='hullTurret'&&Math.hypot(e.x-event.x,e.y-event.y)<38)this.fleetMuzzles.set(e.id,.1);
        }
        if(['hullDown','turretDown','scavengerSteal','scavengerDrop','scavengerEscape','mineBurst','broadside','coreExposed'].includes(type)||(type==='torpedoLaunch'&&event.value==='enemy')||type==='bossDown'){
          if(type==='turretDown'){
            const mount=this.fleetMountPoints?.find(m=>Math.hypot(m.x-event.x,m.y-event.y)<24);
            if(mount){
              const parent=this.fleetEnemies.find(e=>e.id===mount.parentId)||this.fleetBoss;
              if(parent){this.fleetWrecks ||= new Map();this.fleetWrecks.set(mount.id,{...mount,ox:mount.ox??mount.x-parent.x,oy:mount.oy??mount.y-parent.y});}
            }
          }
          const origin=type==='scavengerSteal'?this.fleetPickupPoints?.filter(p=>p.type===event.value).sort((a,b)=>Math.hypot(a.x-event.x,a.y-event.y)-Math.hypot(b.x-event.x,b.y-event.y))[0]:null;
          this.impacts.push({id:++this.effectId,type,fleet:true,fromX:origin?.x,fromY:origin?.y,x:event.x??270,y:event.y??280,value:event.value,age:0,
            hull:type==='bossDown'?{w:event.w??210,h:event.h??80,angle:event.angle??0,broadside:event.broadside??0,core:event.core??0}:null,
            life:type==='bossDown'?2.8:type==='hullDown'?2.1:1,size:type==='bossDown'?270:type==='hullDown'?130:type==='turretDown'?35:type==='coreExposed'?150:55});
          continue;
        }
      }
      if(type==='flakEat'){
        this.impacts.push({id:++this.effectId,type,x:event.x??270,y:event.y??750,value:event.value,age:0,life:.18,size:12});
        continue;
      }
      if(['squadronBonus','arsenalScatter','salvageRecover','salvageExpire','escortJoin','sidewinderLaunch','reflect','reflectorUp','reflectorDown','signatureUp','shieldUp','orbitalEat'].includes(type)){
        if(['reflect','orbitalEat','sidewinderLaunch'].includes(type)&&this.impacts.some(f=>f.type===type&&f.age<.1))continue;
        this.impacts.push({id:++this.effectId,type,x:event.x??this.playerPoint?.x??270,y:event.y??this.playerPoint?.y??750,value:event.value,points:event.points,drops:event.drops,age:0,life:type==='squadronBonus'?1.15:type==='arsenalScatter'?.95:.48,size:type==='arsenalScatter'?130:40});
        continue;
      }
      if(type==='explode'&&event.value==='boss')continue;
      if(!['explode','bossDown','bomb','bossPhase','bossEnter','playerHit','pickup','shoot','hit','lane',
        'wakeConvert','rollStrike','shieldHit','shieldBreak','shieldRestore','powerUp','missileHit',
        'chipHit','railHit','bossArmorHit','bossCoreHit'].includes(type))continue;
      if(type==='powerUp'||type==='wakeConvert'){
        const recent=this.impacts.find(fx=>fx.type===type&&fx.age<(type==='wakeConvert'?.4:.15));
        if(recent){
          if(type==='powerUp')recent.value=Math.max(Number(recent.value)||1,Number(event.value)||1);
          else{
            recent.points=(recent.points||Number(recent.value)*120)+(event.points||Number(event.value)*120);
            recent.value=(Number(recent.value)||0)+(Number(event.value)||0);
            recent.size=Math.min(126,44+Number(recent.value)*3);
          }
          recent.x=event.x;recent.y=event.y;continue;
        }
      }
      const big=type==='bossDown'||type==='bomb';
      const size=type==='explode'?(event.value==='mini'?102:59):big?(type==='bomb'?285:210):
        type==='bossEnter'?210:type==='bossPhase'?133:type==='playerHit'?85:
        type==='rollStrike'?(event.charged?88:57):type==='wakeConvert'?Math.min(126,44+(Number(event.value)||1)*3):
        type==='shieldBreak'?94:type==='shieldHit'?63:type==='shieldRestore'?74:
        type==='powerUp'?91:type==='missileHit'?78:type==='railHit'?42:
        type==='bossArmorHit'?57:type==='bossCoreHit'?36:type==='chipHit'?20:
        type==='pickup'?34:type==='hit'?21:16;
      const life=type==='lane'?(H+210)/(event.speed||149):big?1.4:type==='bossEnter'?1.1:type==='bossPhase'?.82:
        type==='explode'?1.05:type==='playerHit'?.65:type==='wakeConvert'?.9:
        type==='powerUp'?1.1:type==='shieldBreak'?.8:type==='shieldRestore'?.7:
        type==='rollStrike'?(event.charged?.55:.4):type==='missileHit'?.68:
        type==='railHit'?.42:type==='bossArmorHit'?.48:type==='bossCoreHit'?.42:
        type==='chipHit'?.32:type==='hit'?.24:.34;
      this.impacts.push({id:++this.effectId,x:event.x||0,y:event.y||0,age:0,life,size,type,value:event.value,
        points:event.points,resource:event.resource,charged:event.charged,rows:event.rows,speed:event.speed,angle:event.angle||0});
    }
    if(this.impacts.length>52)this.impacts.splice(0,this.impacts.length-52);
  }
  drawCombatLighting(game) {
    // A few cached pools tie fire and impacts to the sea below the actors.
    // They are drawn before projectile sprites, so threat colors stay crisp.
    const c=this.ctx,lights=this.lightSprites;
    const stage=this.currentStage;
    const world=stage===3?lights.violet:stage===2?lights.warm:lights.cool;
    c.save();c.globalCompositeOperation='screen';
    const player=game.player;
    if(player&&!player.dead&&player.alive!==false&&player.firePulse>0) {
      const pulse=clamp(player.firePulse,0,1);
      c.globalAlpha=.18+pulse*.44;
      c.drawImage(lights.cool,player.x-83,player.y-119,166,133);
      c.globalAlpha=.24+pulse*.2;
      c.drawImage(lights.cool,player.x-67,player.y+12,134,55);
    }
    let lit=0;
    for(const e of game.enemies||[]) {
      if(!e||e.dead||e.type==='boss'||e.isBoss||lit>=8)continue;
      const hit=clamp(e.flash||0,0,1);
      const warmup=e.fireAt-e.age>0&&e.fireAt-e.age<.14?.25:0;
      const intensity=Math.max(hit*.56,warmup);
      if(intensity<.08)continue;
      c.globalAlpha=intensity;
      const r=Number(e.r||18)*2.6;
      c.drawImage(world,e.x-r,e.y-r*.6,r*2,r*1.3);
      lit++;
    }
    let impactLights=0;
    for(const fx of this.impacts) {
      if(fx.zero||fx.sky||fx.type==='boxEnter'||fx.type==='wingBreak')continue;
      if(impactLights>=9)break;
      if(!['hit','chipHit','railHit','bossCoreHit','bossArmorHit','explode','bossDown','bomb',
        'playerHit','missileHit','rollStrike','shieldBreak'].includes(fx.type))continue;
      const remaining=1-fx.age/fx.life;
      if(remaining<=0)continue;
      const lightContact=['hit','chipHit','railHit','bossCoreHit','bossArmorHit'].includes(fx.type);
      const r=lightContact?Math.max(35,fx.size*.9):fx.type==='bomb'?140:Math.min(160,fx.size*.8);
      const tile=fx.type==='bomb'?(fx.value==='barrier'?lights.cool:fx.value==='storm'?lights.violet:lights.warm):
        ['playerHit','rollStrike','shieldBreak','railHit','bossArmorHit'].includes(fx.type)?lights.cool:
        fx.type==='explode'&&(fx.value==='ace'||stage===3)?lights.violet:lights.warm;
      c.globalAlpha=(lightContact?.28:fx.type==='explode'?.22:fx.type==='bomb'?.28:.5)*remaining*remaining;
      c.drawImage(tile,fx.x-r,fx.y-r*.73,r*2,r*1.46);
      c.globalAlpha=(lightContact?.16:.34)*remaining;
      c.drawImage(tile,fx.x-r*.85,fx.y+r*.33,r*1.7,r*.55);
      impactLights++;
    }
    c.restore();
  }
  drawWorldResponse() {
    const c=this.ctx,stage=this.currentStage;
    const color=stage===3?'183,159,255':stage===2?'255,185,118':'151,238,211';
    c.save();
    for(const fx of this.impacts) {
      if(fx.zero||fx.sky||fx.type==='boxEnter'||fx.type==='wingBreak')continue;
      if(fx.type==='lane') {
        // Two openings ride with their bullet rows. The thin seam points
        // from the nearer safe gap to the next shifted gap.
        const alpha=Math.min(1,fx.age*4)*Math.min(1,Math.max(0,(fx.life-fx.age)/.55));
        const speed=fx.speed||138+stage*11,next=clamp(Number(fx.value)||fx.x,95,445);
        const rows=fx.rows?.map(row=>[row.x,row.y])||[[fx.x,-40],[next,-165]];
        for(let row=0;row<rows.length;row++) {
          const x=rows[row][0],y=rows[row][1]+speed*fx.age;
          if(y<-50||y>H+50)continue;
          for(const side of [-1,1]) {
            const edge=x+side*68;
            line(c,[edge,y-16,edge,y+16],
              'rgba(177,255,226,'+(alpha*.42)+')',2);
            line(c,[edge,y,edge-side*12,y],
              'rgba(205,255,236,'+(alpha*.48)+')',1.3);
          }
          line(c,[x-16,y,x+16,y],
            'rgba(183,255,224,'+(alpha*.24)+')',1.2);
        }
        const y0=rows[0][1]+speed*fx.age,y1=rows[1][1]+speed*fx.age;
        if(y0<H+30&&y1>-30)
          line(c,[fx.x,y0,next,y1],
            'rgba(166,248,219,'+(alpha*.16)+')',1.2);
        continue;
      }
      if(fx.type!=='explode'&&fx.type!=='bossDown'&&fx.type!=='bomb')continue;
      const p=fx.age/fx.life,fade=(1-p)*(1-p);
      const r=fx.size*(.27+p*.92),y=fx.y+Math.min(24,fx.size*.17);
      if(y<-60||y>H+40)continue;
      oval(c,fx.x+8,y+13,r*.82,r*.21,
        'rgba(2,10,26,'+(fade*.27)+')');
      oval(c,fx.x,y,r,r*.23,'rgba('+color+','+(fade*.27)+')',true,Math.max(.8,3*(1-p)));
      oval(c,fx.x,y,r*.67,r*.13,'rgba('+color+','+(fade*.16)+')',true,1.2);
      for(const side of [-1,1]) {
        const x=fx.x+side*(r*.45);
        line(c,[x-side*14,y+8,x+side*20,y+8],'rgba('+color+','+(fade*.18)+')',1.5);
      }
    }
    c.restore();
  }
  drawEffects(t) {
    const c=this.ctx;
    for(const fx of this.impacts) {
      if(fx.zero||fx.sky||fx.type==='boxEnter'||fx.type==='wingBreak')continue;
      if(fx.type==='lane'||fx.fleet)continue;
      const p=fx.age/fx.life,fade=(1-p)*(1-p),size=fx.size;
      const violet=this.currentStage===3&&(fx.type==='bossPhase'||fx.type==='explode');
      const cool=fx.type==='playerHit';
      const gold=fx.type==='bomb'||fx.type==='pickup'||fx.type==='bossDown'||
        fx.type==='bossPhase'&&this.currentStage===2||fx.type==='explode'&&this.currentStage===2;
      const rim=violet?'rgba(215,163,255,':cool?'rgba(143,237,248,':
        gold?'rgba(255,222,148,':'rgba(255,178,116,';
      const core=violet?'rgba(249,227,255,':cool?'rgba(207,254,255,':
        gold?'rgba(255,246,204,':'rgba(255,226,179,';
      const rimProfile=violet?'rimViolet':cool?'rimCool':gold?'rimGold':'rimFire';
      const coreProfile=violet?'coreViolet':cool?'coreCool':gold?'coreGold':'coreFire';
      c.save();
      if(fx.type==='flakEat'){
        c.globalAlpha=fade;
        oval(c,fx.x,fx.y,2.5*(1-p),2.5*(1-p),'#fff5d4');
        for(let i=0;i<5;i++){
          const a=i*TAU/5+fx.id,d=3+p*10;
          line(c,[fx.x+Math.cos(a)*d*.4,fx.y+Math.sin(a)*d*.4,fx.x+Math.cos(a)*d,fx.y+Math.sin(a)*d],'#ffce88',1.4);
        }
        c.restore();continue;
      }
      if(['squadronBonus','arsenalScatter','salvageRecover','salvageExpire','escortJoin','sidewinderLaunch','reflect','reflectorUp','reflectorDown','signatureUp','shieldUp','orbitalEat'].includes(fx.type)){
        const scatter=fx.type==='arsenalScatter',fizzle=fx.type==='salvageExpire';
        const col=scatter?'#ff775f':fizzle?'#8394ae':fx.type==='signatureUp'?'#cab8ff':'#a0fff0';
        c.globalAlpha=fade;c.strokeStyle=col;c.lineWidth=scatter?2.5:1.5;
        const radius=size*(.2+p);
        if(!fizzle)oval(c,fx.x,fx.y,radius,radius,col,true,1.5);
        const n=scatter?22:fizzle?5:8;
        for(let i=0;i<n;i++){
          const a=i*TAU/n+hash(fx.id+i)*.4,d=radius*(.5+hash(i+fx.id)*.6);
          const x=fx.x+Math.cos(a)*d,y=fx.y+Math.sin(a)*d;
          line(c,[x,y,x+Math.cos(a)*(scatter?16:6)*(1-p),y+Math.sin(a)*(scatter?16:6)*(1-p)],col,scatter?2:1);
        }
        if(fx.type==='escortJoin')for(const side of [-1,1]){
          const x=fx.x+side*(70-35*p),y=fx.y+20*(1-p);
          poly(c,[x,y-12,x+12,y+5,x,y+1,x-12,y+5],'#d1f6ff');
          line(c,[x,y+7,x+side*20*(1-p),y+30*(1-p)],'#75e5f5',2);
        }
        if(fx.type==='squadronBonus'){
          c.font='900 19px monospace';c.textAlign='center';c.fillStyle='#ffe89e';
          c.fillText('BONUS!',clamp(fx.x,65,W-65),fx.y-30-p*35);
          c.font='bold 10px monospace';c.fillText('SQUADRON '+(fx.value||''),clamp(fx.x,65,W-65),fx.y-13-p*35);
          if(fx.points>0)c.fillText('+'+fx.points,clamp(fx.x,65,W-65),fx.y+2-p*35);
        }
        if(fx.type==='salvageRecover'){
          c.font='bold 12px monospace';c.textAlign='center';c.fillStyle='#baffed';
          c.fillText('RECOVER '+String(fx.value||'').toUpperCase(),clamp(fx.x,75,W-75),fx.y-25-p*28);
        }
        if(fx.type==='orbitalEat'){
          const r=20*(1-p);poly(c,[fx.x,fx.y-r,fx.x+r,fx.y,fx.x,fx.y+r,fx.x-r,fx.y],'#bfb5ff');
        }
        if(fx.type==='signatureUp')for(let i=0;i<5;i++){
          const a=i*TAU/5-Math.PI/2;
          line(c,[fx.x+Math.cos(a)*radius*.4,fx.y+Math.sin(a)*radius*.4,fx.x+Math.cos(a)*radius*1.3,fx.y+Math.sin(a)*radius*1.3],col,3);
        }
        if(fx.type==='reflectorDown')oval(c,fx.x,fx.y,44*(1-p),44*(1-p),'#beacff',true,2);
        c.restore();continue;
      }
      if(fx.type==='bomb'){
        const a=(1-p)*(1-p);
        if(fx.value==='barrier'){
          for(let i=0;i<12;i++){
            const angle=i*TAU/12,r=75+p*65,x=fx.x+Math.cos(angle)*r,y=fx.y+Math.sin(angle)*r;
            c.beginPath();for(let j=0;j<6;j++){const ax=x+Math.cos(j*TAU/6)*13,ay=y+Math.sin(j*TAU/6)*13;if(j)c.lineTo(ax,ay);else c.moveTo(ax,ay);}c.closePath();
            c.fillStyle='rgba(100,235,222,'+(a*.14)+')';c.fill();c.strokeStyle='rgba(153,255,237,'+(a*.7)+')';c.lineWidth=1.6;c.stroke();
          }
        }else if(fx.value==='storm'){
          for(let i=0;i<9;i++){
            const angle=i*TAU/9+t*.7,len=60+p*310;
            c.beginPath();c.moveTo(fx.x,fx.y);
            for(let j=1;j<=5;j++){const d=len*j/5,zig=Math.sin(i*11+j*5)*14*a;c.lineTo(fx.x+Math.cos(angle)*d+zig,fx.y+Math.sin(angle)*d+zig);}
            c.strokeStyle='rgba(194,164,255,'+(a*.7)+')';c.lineWidth=1.4;c.stroke();
          }
        }else{
          const radius=35+p*420;
          oval(c,fx.x,fx.y,radius,radius*.8,'rgba(255,213,137,'+(a*.6)+')',true,Math.max(1,7*(1-p)));
          if(p<.3)oval(c,fx.x,fx.y,25+p*90,20+p*70,'rgba(255,238,183,'+((.3-p)*1.5)+')');
        }
        c.restore();continue;
      }
      if(fx.type==='explode'){
        const heavy=['bomber','carrier','turret','mini'].includes(fx.value);
        const electric=fx.value==='ace',n=heavy?7:4;
        const id=['wing','ace','carrier','turret'].includes(fx.value)?fx.value:fx.value==='mini'?'gunship':heavy?'bomber':'scout';
        const hullSize=fx.value==='mini'?106:heavy?86:fx.value==='ace'?74:fx.value==='wing'?68:60;
        drawWreck(c,id,fx.x,fx.y,hullSize,fx.age,fx.angle);
        // Broken aircraft panels tumble through an asymmetric smoke trail.
        // Light kills use a brief directional flash; fuel tanks leave staggered
        // combustion pockets, rather than the same circular blast at every size.
        c.globalCompositeOperation='source-over';
        for(let i=0;i<n;i++){
          const seed=hash(fx.id*23+i),angle=seed*TAU;
          const d=size*(.08+p*(.5+seed*.7));
          const x=fx.x+Math.cos(angle)*d,y=fx.y+Math.sin(angle)*d*.7+p*p*35;
          const smoke=size*(heavy?.14:.08)*(1+p*.8);
          oval(c,x,y,smoke*(1+seed),smoke*.62,'rgba(17,30,39,'+(fade*.62)+')');
          c.save();c.translate(x,y);c.rotate(angle+p*(seed>.5?5:-4));
          const shard=(heavy?9:7)*(1-p*.6)*(seed+.6);
          poly(c,[-shard,-shard*.2,shard*.8,-shard*.5,shard*.45,shard*.35,-shard*.7,shard*.2],
            '#263640','rgba(199,195,169,'+(fade*.7)+')',.8);
          c.restore();
          const ignition=clamp(1-(fx.age-i*.016)/.17,0,1);
          if(ignition>0&&fx.age>=i*.016){
            const rr=size*(heavy?.105:.065)*ignition;
            oval(c,x-3,y-4,rr*(1+seed),rr*.54,
              (electric?'rgba(151,241,229,':'rgba(255,185,104,')+(ignition*.65)+')');
          }
        }
        c.globalCompositeOperation='lighter';
        const snap=clamp(1-fx.age/(heavy?.14:.085),0,1);
        if(snap>0){
          const reach=size*(heavy?.45:.36)*(1-snap*.45);
          line(c,[fx.x-reach,fx.y+reach*.26,fx.x+reach*.8,fx.y-reach*.3],
            (electric?'rgba(177,255,244,':'rgba(255,227,170,')+(snap*.85)+')',1+snap*3);
          line(c,[fx.x-reach*.2,fx.y-reach*.7,fx.x+reach*.3,fx.y+reach*.6],
            'rgba(255,246,212,'+(snap*.66)+')',1+snap*2);
        }
        for(let i=0;i<(heavy?9:5);i++){
          const angle=hash(fx.id*7+i)*TAU,d=size*(.1+p*.95),tail=5+size*.1*(1-p);
          const x=fx.x+Math.cos(angle)*d,y=fx.y+Math.sin(angle)*d*.7;
          line(c,[x,y,x-Math.cos(angle)*tail,y-Math.sin(angle)*tail*.7],
            (electric?'rgba(146,244,225,':'rgba(255,189,121,')+(fade*.75)+')',1.3);
        }
        c.restore();continue;
      }
      if(['wakeConvert','rollStrike','shieldHit','shieldBreak','shieldRestore','powerUp'].includes(fx.type)) {
        const cyan=fx.type==='wakeConvert'||fx.type==='rollStrike'||fx.type==='shieldHit'||fx.type==='shieldRestore';
        const rgb=cyan?'128,253,228':fx.type==='powerUp'?'255,224,150':'255,119,107';
        const a=(1-p)*(1-p),rad=size*(.3+p*.75);
        c.globalCompositeOperation='lighter';
        const profile=cyan?'effectTeal':fx.type==='powerUp'?'effectGold':'effectCoral';
        bloom(c,fx.x,fx.y,rad*.85,'rgba('+rgb+','+(a*.25)+')',profile,a*.25);
        for(let j=0;j<2;j++) {
          const rr=rad*(j?.7:1);
          oval(c,fx.x,fx.y,rr,rr*(fx.type==='rollStrike'?.73:1),
            'rgba('+rgb+','+(a*(j?.28:.62))+')',true,Math.max(1,(1-p)*(j?2:4)));
        }
        const n=fx.type==='wakeConvert'?Math.min(12,4+Math.floor(Number(fx.value||1)/3)):fx.type==='shieldBreak'?11:7;
        for(let i=0;i<n;i++) {
          const angle=i*TAU/n+hash(fx.id+i)*.35;
          const d=rad*(.22+.7*p)*(i%2?.78:1);
          const xx=fx.x+Math.cos(angle)*d,yy=fx.y+Math.sin(angle)*d*.8;
          if(fx.type==='wakeConvert') {
            poly(c,[xx,yy-5,xx+4,yy,xx,yy+5,xx-4,yy],
              'rgba(208,255,232,'+(a*.7)+')');
          } else {
            line(c,[xx,yy,xx+Math.cos(angle)*12*(1-p),yy+Math.sin(angle)*12*(1-p)],
              'rgba('+rgb+','+(a*.8)+')',1.5);
          }
        }
        if(fx.type==='wakeConvert'&&Number(fx.value)>=3 || fx.type==='powerUp') {
          const label=fx.type==='powerUp'?'POWER '+fx.value:
            '+'+(fx.points||Number(fx.value)*120)+' CONVERT';
          c.globalCompositeOperation='source-over';
          c.font='bold '+(fx.type==='powerUp'?17:14)+'px monospace';
          c.textAlign='center';c.textBaseline='middle';
          const half=c.measureText(label).width/2;
          const labelX=clamp(fx.x,half+10,W-half-10);
          // Two reward lanes. Forward flight puts labels below the aircraft,
          // clear of the top instruments; lower flight places them above it.
          const forward=fx.y<340,power=fx.type==='powerUp';
          const labelY=fx.y+(forward?50:-50)+(power?(forward?28:-28):0)-p*22;
          c.fillStyle='rgba(7,23,35,'+(a*.78)+')';
          c.fillRect(labelX-half-5,labelY-11,half*2+10,22);
          c.fillStyle='rgba('+rgb+','+(a*.95)+')';
          c.fillText(label,labelX,labelY);
        }
        c.restore();continue;
      }
      if(fx.type==='hit') {
        const r=6+p*20;
        oval(c,fx.x,fx.y,r,r*.46,'rgba(255,245,197,'+(fade*.55)+')',true,2*(1-p)+.5);
        line(c,[fx.x-r*.7,fx.y,fx.x+r*.7,fx.y],
          'rgba(255,239,181,'+(fade*.55)+')',Math.max(.7,2.5*(1-p)));
        line(c,[fx.x,fx.y-r*.65,fx.x,fx.y+r*.65],
          'rgba(255,239,181,'+(fade*.55)+')',Math.max(.7,2.5*(1-p)));
        for(let i=0;i<5;i++) {
          const a=i*TAU/5+hash(fx.id)*TAU,reach=(8+p*27)*(i%2?.75:1);
          line(c,[fx.x+Math.cos(a)*reach*.55,fx.y+Math.sin(a)*reach*.55,
            fx.x+Math.cos(a)*reach,fx.y+Math.sin(a)*reach],
            'rgba(255,206,137,'+(fade*.55)+')',1.5*(1-p)+.4);
        }
        c.restore();continue;
      }
      if(['chipHit','railHit','missileHit','bossArmorHit','bossCoreHit'].includes(fx.type)) {
        const rail=fx.type==='railHit',missile=fx.type==='missileHit';
        const armor=fx.type==='bossArmorHit',boss=fx.type==='bossCoreHit';
        const rgb=armor?'109,249,230':rail?'195,184,255':
          boss||fx.value==='boss'?'245,193,255':missile?'255,185,103':'255,221,157';
        const a=(1-p)*(1-p),r=size*(.25+p*(missile?.9:.48));
        // Dark fragments anchor light effects to the target's material.
        c.globalCompositeOperation='source-over';
        const chunks=missile?7:rail?4:armor?5:boss?6:3;
        for(let i=0;i<chunks;i++) {
          const angle=i*TAU/chunks+hash(fx.id*13+i)*.5;
          const dist=size*(.12+p*(missile?.65:.43));
          const x=fx.x+Math.cos(angle)*dist,y=fx.y+Math.sin(angle)*dist*.67;
          const length=(missile?11:rail?13:8)*(1-p);
          line(c,[x,y,x+Math.cos(angle)*length,y+Math.sin(angle)*length],
            'rgba(19,32,42,'+(a*.55)+')',Math.max(.7,(missile?4:3)*(1-p)));
          line(c,[x-1,y-1,x+Math.cos(angle)*length*.56-1,y+Math.sin(angle)*length*.56-1],
            'rgba('+rgb+','+(a*.55)+')',Math.max(.5,1.3*(1-p)));
        }
        c.globalCompositeOperation='lighter';
        if(missile) {
          // Staggered blast rim and hot center stay on the victim.
          oval(c,fx.x,fx.y,r,r*.8,'rgba(36,39,42,'+(a*.46)+')',true,Math.max(1,6*(1-p)));
          const bloomProfile=fx.value==='boss'?'hitBossMissile':'hitMissile';
          bloom(c,fx.x,fx.y,r*1.1,'rgba('+rgb+','+(a*.39)+')',bloomProfile,a*.39);
          oval(c,fx.x,fx.y,r*.65,r*.48,'rgba('+rgb+','+(a*.55)+')');
          oval(c,fx.x,fx.y,r*.34,r*.27,'rgba(255,249,222,'+(a*.55)+')');
          for(let i=0;i<5;i++) {
            const angle=i*TAU/5+hash(fx.id*5+i)*.4;
            const d=r*(.65+p*.38);
            line(c,[fx.x+Math.cos(angle)*d*.52,fx.y+Math.sin(angle)*d*.42,
              fx.x+Math.cos(angle)*d,fx.y+Math.sin(angle)*d*.75],
              'rgba('+rgb+','+(a*.55)+')',Math.max(.7,3*(1-p)));
          }
        } else if(rail) {
          // A narrow diagonal slash reads as a penetrating rail.
          bloom(c,fx.x,fx.y,r*.82,'rgba('+rgb+','+(a*.22)+')','hitRail',a*.22);
          line(c,[fx.x-5-r*.27,fx.y+r*.45,fx.x+4+r*.25,fx.y-r*.75],
            'rgba('+rgb+','+(a*.55)+')',Math.max(1,4*(1-p)));
          line(c,[fx.x-3-r*.13,fx.y+r*.4,fx.x+2+r*.12,fx.y-r],
            'rgba(251,252,255,'+(a*.55)+')',Math.max(.7,2*(1-p)));
          oval(c,fx.x,fx.y,r*.55,r*.28,'rgba('+rgb+','+(a*.55)+')',true,2*(1-p)+.5);
        } else if(armor) {
          // Broken guard rays read as a ricochet.
          for(let i=0;i<5;i++) {
            const angle=(-.75+i*.39)+hash(fx.id+i)*.14;
            const x=fx.x+Math.cos(angle)*r,y=fx.y+Math.sin(angle)*r*.7;
            line(c,[fx.x,fx.y,x,y],'rgba('+rgb+','+(a*.55)+')',Math.max(.8,2.3*(1-p)));
          }
          oval(c,fx.x,fx.y,r,r*.65,'rgba('+rgb+','+(a*.55)+')',true,Math.max(1,3.5*(1-p)));
          oval(c,fx.x,fx.y,r*.53,r*.36,'rgba(243,255,247,'+(a*.55)+')',true,1.3);
        } else {
          oval(c,fx.x,fx.y,r*(boss?1.4:1),r*.55,
            'rgba('+rgb+','+(a*.55)+')',
            true,Math.max(.8,(boss?3.4:2.2)*(1-p)));
          line(c,[fx.x-r*.65,fx.y-r*.26,fx.x+r*.4,fx.y+r*.25],
            'rgba(255,249,220,'+(a*.55)+')',Math.max(.7,(boss?2.8:2)*(1-p)));
          if(boss) line(c,[fx.x-r*.14,fx.y-r*.42,fx.x+r*.37,fx.y+r*.18],
            'rgba('+rgb+','+(a*.55)+')',Math.max(.6,2*(1-p)));
        }
        c.restore();continue;
      }
      if(fx.type==='bossEnter') {
        const tint=fx.value===3?'rgba(188,160,251,':fx.value===2?
          'rgba(255,202,131,':'rgba(169,239,214,';
        const reach=44+p*260;
        if(!this.reducedEffects){c.fillStyle=tint+(fade*.025)+')';c.fillRect(0,0,W,H);}
        oval(c,fx.x,fx.y,reach,reach*.56,tint+(fade*.62)+')',true,Math.max(1,(1-p)*5));
        oval(c,fx.x,fx.y,reach*.82,reach*.4,tint+(fade*.28)+')',true,1.4);
        for(let ray=0;ray<8;ray++) {
          const a=ray*TAU/8;
          const x=Math.cos(a),y=Math.sin(a)*.56;
          line(c,[fx.x+x*reach*.72,fx.y+y*reach*.72,
            fx.x+x*(reach+24),fx.y+y*(reach+24)],
            tint+(fade*.48)+')',1.6);
        }
        c.restore();continue;
      }
      // Lingering smoke is deliberately opaque enough to give blasts volume.
      if(fx.type==='explode'||fx.type==='bossDown'||fx.type==='bomb') {
        c.globalCompositeOperation='source-over';
        for(let i=0;i<8;i++){
          const angle=i*TAU/8+hash(fx.id*31+i),distance=size*(.1+p*.95);
          const x=fx.x+Math.cos(angle)*distance,y=fx.y+Math.sin(angle)*distance*.7+p*p*23;
          c.save();c.translate(x,y);c.rotate(angle+p*(i%2?4:-3));
          const shard=(4+hash(i+fx.id)*7)*(1-p*.7);
          poly(c,[-shard,-shard*.4,shard*.7,-shard*.7,shard,shard*.4,-shard*.6,shard*.7],
            'rgba(37,47,53,'+fade+')','rgba(215,184,143,'+(fade*.7)+')',.8);c.restore();
        }
        for(let i=0;i<7;i++){
          const a=i*TAU/7+hash(fx.id*13+i)*.8;
          const d=size*(.12+p*.49)*(i%2?.8:1);
          const x=fx.x+Math.cos(a)*d,y=fx.y+Math.sin(a)*d*.55;
          const r=size*(.2+.19*p)*(i%3===0?1.25:.8);
          oval(c,x,y,r,r*.66,'rgba(17,27,33,'+(.46*fade)+')');
          oval(c,x-5,y-7,r*.77,r*.43,'rgba(90,81,69,'+(.22*fade)+')');
        }
      }
      c.globalCompositeOperation='lighter';
      const bloomSize=size*(.48+p*.65);
      const blastGain=fx.type==='explode'?.24:.46;
      bloom(c,fx.x,fx.y,bloomSize,rim+(fade*blastGain)+')',size<=59?rimProfile:null,fade*blastGain);
      if(p<.58) {
        const q=1-p/.58;
        // An uneven fireball with overlapping tongues; no sprite or texture asset.
        for(let i=0;i<9;i++){
          const a=i*TAU/9+hash(fx.id*41+i)*.5;
          const dist=size*(.08+p*.34)*(i%2?.9:1.18);
          const x=fx.x+Math.cos(a)*dist,y=fx.y+Math.sin(a)*dist*.74;
          const rr=size*(.105+hash(i*7+fx.id)*.09)*(1+p*.4);
          const hue=violet?'rgba(204,138,246,':cool?'rgba(130,239,248,':i%3===0?'rgba(255,239,164,':'rgba(255,139,75,';
          oval(c,x,y,rr,rr*(.7+hash(i+fx.id)*.3),hue+(q*.48)+')');
        }
        bloom(c,fx.x-size*.11,fx.y-size*.04,size*.37,core+(q*.44)+')',size<=59?coreProfile:null,q*.44);
        oval(c,fx.x,fx.y,size*(.18+p*.33),size*(.15+p*.26),core+(.72*q)+')');
        oval(c,fx.x,fx.y,size*(.065+p*.08),size*(.05+p*.08),'rgba(255,239,188,'+(.6*q)+')');
      }
      // Two expanding pressure rings and a broken second rim.
      for(let ring=0;ring<(fx.type==='explode'?1:2);ring++) {
        const a=clamp((p-ring*.19)/.81,0,1);
        if(p<ring*.19)continue;
        const r=size*(.16+a*(ring?.86:1.13));
        if(fx.type==='explode'){
          c.beginPath();c.ellipse(fx.x,fx.y,r,r*.7,hash(fx.id)*Math.PI,.2+p,Math.PI*1.3+p);
          c.strokeStyle=rim+(fade*.32)+')';c.lineWidth=Math.max(.8,(1-a)*2.4);c.stroke();
        }else oval(c,fx.x,fx.y,r,r*(fx.type==='bossDown'?.67:.84),rim+(fade*(ring?.32:.55))+')',true,Math.max(.8,(1-a)*(ring?3:5)));
      }
      if(fx.type==='bossPhase') {
        c.fillStyle=rim+(fade*.14)+')';c.fillRect(0,fx.y-3,W,6);
        line(c,[0,fx.y-24*p,W,fx.y-24*p],rim+(fade*.3)+')',1.5);
        line(c,[0,fx.y+24*p,W,fx.y+24*p],rim+(fade*.3)+')',1.5);
      }
      const sparks=fx.type==='shoot'?3:fx.type==='pickup'?6:fx.type==='explode'?12:18;
      for(let i=0;i<sparks;i++) {
        const a=i*TAU/sparks+hash(fx.id*7+i)*.43;
        const d=size*(.17+p*(.57+hash(fx.id+i*3)*.5));
        const x=fx.x+Math.cos(a)*d,y=fx.y+Math.sin(a)*d*.75;
        const tail=8+size*.14*(1-p);
        line(c,[x,y,x-Math.cos(a)*tail,y-Math.sin(a)*tail*.75],rim+(fade*.55)+')',Math.max(1,2.3*(1-p)));
        if(i%3===0)oval(c,x,y,Math.max(.8,size*.02*(1-p)),Math.max(.8,size*.02*(1-p)),core+(fade*.55)+')');
      }
      // Large effects keep their energy local so threats retain contrast.
      c.restore();
    }
  }
  background(scroll,t,stage,game={},step=0) {
    const c=this.ctx;
    const index=clamp(stage-1,0,3);
    c.fillStyle=this.seas[index];c.fillRect(-15,-15,W+30,H+30);
    const authored=drawCoast(c,scroll,stage);
    const tile=this.sceneTiles[index];
    const offset=(scroll*.29)%1400,top=(1400-offset)%1400;
    const first=Math.min(H,1400-top);
    if(!authored){
      c.drawImage(tile,0,top,W,first,0,0,W,first);
      if(first<H)c.drawImage(tile,0,0,W,H-first,0,first,W,H-first);
    }
    const ambience=this.ambience;
    ambience.begin(game,t,scroll,clamp(stage,1,CAMPAIGN_STAGES),step,this.reducedEffects);
    ambience.drawSurface(c,clamp(stage,1,CAMPAIGN_STAGES));
    // From sector 4 the world layer paints its own weather; skip the sector 1-3 dressing.
    const worldPainted=worldPaintsStage(stage);
    if(!worldPainted){
      this.drawWeatherTile(this.weatherTiles[index],scroll,.53);
      this.drawActiveWeather(scroll,t,stage);this.drawTerrainLights(scroll,t,stage);
      // Broad low-contrast light shafts add moving atmosphere with few draw calls.
      // Cached per sector: same falloff as a per-frame gradient, fewer pixels, no gradient rebuild.
      const lightX=W*.52+Math.sin(t*.23)*85;
      const shaft=this.lightShafts[index];
      c.drawImage(shaft,Math.round(lightX-365),10);
      // Flow lines at a distinct speed preserve parallax against the cached coast.
      for(let band=0;band<3;band++) {
        const y=((band*327+scroll*(.47+band*.08))%(H+250))-125;
        c.beginPath();
        for(let x=-12;x<=W+12;x+=18) {
          const yy=y+Math.sin(x*.013+band*2.73)*17+Math.sin(x*.036+band)*5;
          if(x===-12)c.moveTo(x,yy);else c.lineTo(x,yy);
        }
        c.strokeStyle=stage===3?'rgba(154,155,227,.09)':stage===2?'rgba(255,202,151,.07)':band===1?'rgba(84,195,193,.065)':'rgba(125,218,207,.095)';
        c.lineWidth=band===1?1:2;c.stroke();
      }
    }
    ambience.drawAir(c,clamp(stage,1,CAMPAIGN_STAGES));
    ambience.drawTransitions(c,clamp(stage,1,CAMPAIGN_STAGES));
  }
  drawTerrainLights(scroll,t,stage) {
    // Reflections move with cached shelves, furnaces and spires. Their low
    // wide light pools mark near surfaces without brightening the bullet lanes.
    const c=this.ctx,top=(1400-(scroll*.29)%1400)%1400;
    const tile=stage===3?this.lightSprites.violet:
      stage===2?this.lightSprites.warm:this.lightSprites.cool;
    c.save();c.globalCompositeOperation='screen';
    for(let i=0;i<(stage===2?2:stage===3?3:5);i++) {
      const worldY=stage===2?225+i*690:
        stage===3?215+i*430+hash(i*3)*31:
        110+i*240+hash(i*21)*42;
      const y=(worldY-top+1400)%1400;
      if(y<-95||y>H+95)continue;
      const side=i%2===0?-1:1;
      const x=side<0?stage===2?86:77:W-(stage===2?86:77);
      const shimmer=.84+.16*Math.sin(t*1.8+i*2.3);
      c.globalAlpha=(stage===2?.52:.34)*shimmer;
      c.drawImage(tile,x-113,y-44,226,102);
      c.globalAlpha=(stage===2?.24:.17)*shimmer;
      c.drawImage(tile,x-50,y+12,126,80);
    }
    c.restore();
  }
  drawActiveWeather(scroll,t,stage) {
    const c=this.ctx;
    c.save();
    if(stage===1) {
      // Slow tide shadows and broken moving highlights keep open water alive.
      for(let i=0;i<3;i++) {
        const y=((i*359+scroll*.41)%(H+320))-160;
        const x=130+Math.sin(t*.26+i*2.4)*112;
        poly(c,[x-190,y-32,x+143,y-13,x+232,y+55,x-145,y+28],
          'rgba(130,228,204,.035)');
        line(c,[x-150,y+17,x+104,y+10],'rgba(218,255,224,.12)',1.5);
        line(c,[x-93,y+29,x+36,y+25],'rgba(187,248,222,.1)',1);
      }
    } else if(stage===2) {
      // Furnace reflections move at a speed distinct from the dock geometry.
      for(let i=0;i<3;i++) {
        const y=((i*391+scroll*.65)%(H+350))-175;
        const side=i%2?-1:1,x=side<0?58:W-58;
        poly(c,[x-side*30,y-115,x+side*20,y-80,
          x+side*68,y+145,x-side*44,y+120],'rgba(255,141,75,.035)');
        for(let stripe=0;stripe<5;stripe++) {
          const yy=y+stripe*27+Math.sin(t*1.7+i+stripe)*4;
          line(c,[x-25-stripe*2,yy,x+24+stripe*2,yy+1],
            'rgba(255,188,110,'+(.09+stripe*.01)+')',1.3);
        }
      }
    } else {
      // The storm's broad current turns underneath the patterned fire.
      for(let i=0;i<2;i++) {
        const x=270+Math.sin(t*.24+i*2.5)*45;
        const y=((i*505+scroll*.28)%(H+450))-225;
        for(let ring=0;ring<3;ring++) {
          c.beginPath();
          c.ellipse(x,y,90+ring*55,36+ring*23,-.2+t*.025,
            -.15,Math.PI*1.22);
          c.strokeStyle='rgba(183,166,250,'+(.08-ring*.015)+')';
          c.lineWidth=ring===0?3:1.5;c.stroke();
        }
      }
      const pulse=Math.pow(Math.max(0,Math.sin(t*.61+1.4)),28);
      if(pulse>.03&&!this.reducedEffects) {
        c.fillStyle='rgba(169,149,235,'+(pulse*.035)+')';
        c.fillRect(0,0,W,H);
      }
    }
    c.restore();
  }
  authoredPlayer(p,t) {
    const c=this.ctx,ship=p.shipId||'kestrel';
    c.save();c.translate(p.x,p.y);
    const roll=p.roll>0?(1-p.roll/(p.rollCharged?.34:.25))*TAU*(p.rollX>=0?1:-1):0;
    c.rotate(roll+(p.bank||0)*.1);c.scale(1-Math.abs(p.bank||0)*.12,1);
    const span=ship==='manta'?20:ship==='wraith'?8:12,exhaust=playerExhaust(ship);
    for(const side of [-1,1]){
      const length=25+(p.focus?11:22)+Math.sin(t*33+side)*5;
      c.drawImage(exhaust,side*span-5,24,10,length);
    }
    if(p.invuln>0)c.globalAlpha=.65+.28*Math.sin(t*20)**2;
    const drawn=drawCraft(c,ship,0,0,ship==='manta'?100:88,92);
    c.globalAlpha=1;
    if(p.hp<=2){
      for(let i=0;i<(p.hp===1?7:3);i++){
        const age=(t*1.4+i*.15)%1;
        oval(c,-12+Math.sin(i*7+age*2)*8,15+age*82,3+age*13,5+age*15,'rgba(22,27,31,'+((1-age)*(p.hp===1?.55:.3))+')');
      }
      oval(c,-12,15,3+Math.sin(t*28)**2*3,5,'rgba(255,151,79,.8)');
    }
    if(p.roll>0)oval(c,0,0,45,45,'rgba(125,247,232,.45)',true,2.2);
    this.playerCore(p);
    c.restore();return drawn;
  }
  authoredEnemy(e,t) {
    const c=this.ctx,heavy=/bomber|carrier|mini|turret/.test(e.type);
    const id=['wing','ace','carrier','turret'].includes(e.type)?e.type:e.type==='mini'?'gunship':heavy?'bomber':'scout';
    const size=e.type==='mini'?106:heavy?86:e.type==='ace'?74:e.type==='wing'?68:60;
    c.save();c.translate(e.x,e.y);c.rotate(Math.PI+(e.angle||0));
    const drawn=drawCraft(c,id,0,0,size,size,true);
    if(e.flash>0){
      oval(c,0,2,size*.18,size*.1,'rgba(255,230,187,'+(e.flash*.8)+')');
      line(c,[-size*.25,0,0,-size*.22,size*.25,0],'rgba(255,250,220,'+e.flash+')',1.5);
    }
    c.restore();
    const until=e.fireAt-e.age;
    if(until>0&&until<.35&&e.y>0&&e.y<650){
      const p=1-until/.35;
      oval(c,e.x,e.y+size*.28,5+p*8,5+p*8,'rgba(255,163,97,'+(p*.65)+')',true,1.5);
    }
    return drawn;
  }
  authoredBoss(b,t) {
    const c=this.ctx,stage=/CROWN/i.test(b.name)?3:/AURELIA/i.test(b.name)?2:1;
    c.save();c.translate(b.x,b.y);c.rotate(b.angle||0);
    const size=stage===2?326:318;
    const drawn=drawCraft(c,['vesper','aurelia','crown'][stage-1],0,0,size,size);
    const color=stage===1?'108,239,234':stage===2?'255,208,116':'226,148,255';
    if(b.guard){
      for(let i=0;i<8;i++){
        c.beginPath();c.ellipse(0,12,155,117,0,t*.3+i*TAU/8,t*.3+i*TAU/8+.45);
        c.strokeStyle='rgba(118,245,236,.5)';c.lineWidth=2;c.stroke();
      }
    }
    if(b.phase>=2){
      for(const side of [-1,1]){
        const y=28+Math.sin(t*3+side)*6;
        oval(c,side*97,y,8,4,'rgba(20,22,26,.8)');
        line(c,[side*75,12,side*88,21,side*96,18,side*111,35],'rgba('+color+',.7)',1.3);
      }
    }
    if(b.flash>0){
      oval(c,0,25,12+b.flash*16,8+b.flash*10,'rgba(255,243,207,'+(b.flash*.75)+')');
    }
    for(const side of [-1,1]){
      const until=b.fireAt-b.age,p=1-clamp(until/.35,0,1);
      oval(c,side*58,26,3+p*5,3+p*5,'rgba('+color+','+(.3+p*.6)+')');
    }
    c.restore();return drawn;
  }
  player(p,t) {
    if(!p||p.dead||p.alive===false)return;
    if(this.authoredPlayer(p,t))return;
    const c=this.ctx,x=p.x??W/2,y=p.y??H*.78,ship=p.shipId||'kestrel';
    const hurt=p.hp<=1,heat=p.maxHp>0?1-p.hp/p.maxHp:0;
    c.save();c.translate(x,y);
    if(p.invuln>0) {
      bloom(c,0,0,60,'rgba(137,255,240,.23)','playerInvuln',.23);
      oval(c,0,0,45+Math.sin(t*9)*2,45+Math.sin(t*9)*2,'rgba(181,255,235,.52)',true,1.7);
      c.globalAlpha=.82+.09*Math.sin(t*15);
    }
    if(p.trail) for(const q of p.trail) {
      const a=clamp(q.life/.3,0,1);
      oval(c,q.x-x,q.y-y,4+a*8,4+a*14,'rgba(94,236,216,'+(a*.075)+')');
    }
    // Drifting smoke is anchored to the moving craft, then crosses the world
    // through the ordinary player translation. It grows as armor fails.
    if(heat>.23) {
      const smoke=hurt?8:heat>.45?4:2;
      for(let i=0;i<smoke;i++) {
        const drift=(t*43+i*13)%105;
        const sx=(ship==='manta'?-22:ship==='wraith'?12:-19)+Math.sin(t*2+i*2.6)*9+drift*.13;
        const sy=5+drift;
        const a=(hurt?.5:.19+heat*.16)*(1-drift/112);
        oval(c,sx,sy,7+drift*.2,5+drift*.17,'rgba(18,23,27,'+a+')');
        oval(c,sx-4,sy-5,4+drift*.11,3+drift*.09,'rgba(114,100,86,'+(a*.47)+')');
      }
      if(hurt) {
        const flicker=.48+.52*Math.max(0,Math.sin(t*19));
        bloom(c,-16,14,19,'rgba(255,121,62,'+(flicker*.27)+')','playerHurt',flicker*.27);
        oval(c,-16,14,3+flicker*2,3+flicker*3,'rgba(255,133,74,'+(flicker*.78)+')');
      }
    }
    const roll=(p.roll||0)>0 ? (1-(p.roll/(p.rollCharged?.34:.25)))*TAU*(p.rollX>=0?1:-1) : 0;
    c.rotate(roll);
    const exhaust=ship==='manta'?'255,187,132':ship==='wraith'?'183,166,255':'119,249,224';
    const exhaustProfile=ship==='manta'?'playerMantaExhaust':
      ship==='wraith'?'playerWraithExhaust':'playerKestrelExhaust';
    bloom(c,0,20,58,'rgba('+exhaust+',.14)',exhaustProfile,.14);
    oval(c,7,14,48,23,'rgba(0,7,18,.39)');
    for(const side of [-1,1]) {
      const dx=ship==='manta'?24:ship==='wraith'?10:19;
      const length=62+Math.sin(t*29+side)*8;
      const g=c.createLinearGradient(0,15,0,length);
      g.addColorStop(0,'rgba(245,255,228,.82)');
      g.addColorStop(.24,'rgba('+exhaust+',.48)');
      g.addColorStop(1,'rgba('+exhaust+',0)');
      poly(c,[side*(dx-3),13,side*(dx+3),13,side*(dx+6),length,side*(dx-6),length],g);
    }
    if(ship==='manta') {
      // Wide maritime interceptor: split gull wings, torpedo pods, copper spine.
      poly(c,[-5,-14,-20,-18,-49,-2,-50,13,-30,13,-14,4,-8,24,8,24,14,4,30,13,50,13,49,-2,20,-18,5,-14],'#cfa77e');
      poly(c,[-6,-14,-19,-15,-48,3,-42,9,-25,5,-12,-4,12,-4,25,5,42,9,48,3,19,-15,6,-14],'#326d74');
      poly(c,[-10,-9,-35,2,-34,9,-19,7,-7,1],'#9ed3c2');
      poly(c,[10,-9,35,2,34,9,19,7,7,1],'#9ed3c2');
      poly(c,[-5,-25,0,-39,5,-25,7,18,0,26,-7,18],'#dba978');
      poly(c,[-3,-27,0,-38,3,-27,3,15,0,19,-3,15],'#fff0c8');
      for(const side of [-1,1]) {
        poly(c,[side*26,-2,side*33,-1,side*34,26,side*29,33,side*26,25],'#233e50','#f2bd8a',1);
        oval(c,side*31,25,3.7,7,'#f1c89a');
        oval(c,side*23,10,5.3,7,'#294252');
        c.save();c.translate(side*23,7);c.rotate(t*32+side);
        line(c,[-9,0,9,0],'rgba(252,235,211,.64)',2);
        oval(c,0,0,9,9,'rgba(254,237,218,.2)',true,1);c.restore();
      }
      poly(c,[-5,-12,0,-19,5,-12,4,2,0,6,-4,2],'#194c5c');
      oval(c,0,-7,2,4,'#b8fcdf');
      line(c,[-47,9,-31,9],'rgba(255,226,180,.75)',1.7);
      line(c,[31,9,47,9],'rgba(255,226,180,.75)',1.7);
    } else if(ship==='wraith') {
      // Fast narrow delta with detached drone spars and a glass rail keel.
      poly(c,[0,-45,-8,-22,-18,-11,-35,15,-48,22,-27,24,-12,15,-7,30,0,38,7,30,12,15,27,24,48,22,35,15,18,-11,8,-22],'#6d7b98');
      poly(c,[0,-43,-7,-18,-31,15,-38,20,-16,15,-6,4,6,4,16,15,38,20,31,15,7,-18],'#283b62');
      poly(c,[0,-37,-5,-12,-4,22,0,32,4,22,5,-12],'#d7dded');
      poly(c,[0,-43,-2,-18,0,11,2,-18],'#adf8ef');
      for(const side of [-1,1]) {
        poly(c,[side*15,-5,side*41,17,side*35,20,side*13,9],'#aebcdb');
        line(c,[side*18,3,side*38,19],'rgba(219,248,255,.85)',1.8);
        poly(c,[side*7,17,side*16,26,side*12,35,side*5,26],'#302f5a');
      }
      oval(c,0,-14,4,10,'#243e59');
      oval(c,0,-16,2,6,'#b7fff2');
      line(c,[0,-41,0,27],'rgba(220,247,255,.8)',1.3);
    } else {
      // Chartmaker bronze and sea-glass twin-engine Kestrel.
      poly(c,[-5,-17,-43,0,-41,11,-16,10,-12,25,12,25,16,10,41,11,43,0,5,-17],'#d1a35f');
      poly(c,[-5,-16,-39,2,-35,8,-14,7,-9,22,9,22,14,7,35,8,39,2,5,-16],'#286477');
      poly(c,[-5,-14,-32,1,-18,1,-9,-8,9,-8,18,1,32,1,5,-14],'#b3d0af');
      poly(c,[-32,1,-18,1,-9,-8,-5,-14,-18,-2,-35,8],'#e6e9c1');
      poly(c,[5,-14,18,1,32,1,35,8,18,6,9,-8],'#244653');
      poly(c,[-10,-26,0,-39,10,-26,7,16,0,25,-7,16],'#d7b574');
      poly(c,[-6,-27,0,-38,6,-27,4,15,0,20,-4,15],'#fff0bd');
      poly(c,[-15,7,-15,23,-22,29,-18,10],'#193d4a');
      poly(c,[15,7,15,23,22,29,18,10],'#193d4a');
      for(const side of [-1,1]) {
        oval(c,side*18,13,6,8,'#344d54');
        oval(c,side*18,12,3.2,4.2,'#d39f66');
        c.save();c.translate(side*18,10);c.rotate(t*33+side);
        line(c,[-8,0,8,0],'rgba(228,251,231,.62)',2.4);
        oval(c,0,0,8.5,8.5,'rgba(226,252,230,.22)',true,1.2);c.restore();
      }
      poly(c,[-5,-12,0,-19,5,-12,5,2,0,7,-5,2],'#1b5766');
      oval(c,0,-8,2.1,5,'#78e1d5');
      line(c,[-38,5,-17,5],'rgba(255,240,190,.84)',1.4);
      line(c,[17,5,38,5],'rgba(255,240,190,.84)',1.4);
    }
    if(hurt) {
      // A torn panel and intermittent sparks show the final hit is imminent.
      const side=ship==='manta'?-1:1;
      poly(c,[side*5,-6,side*34,-3,side*30,11,side*12,15,side*4,6],'rgba(29,27,29,.92)');
      poly(c,[side*8,-4,side*26,0,side*17,8],'rgba(89,54,47,.83)');
      line(c,[side*7,-3,side*29,9],'rgba(255,133,73,.94)',2.4);
      line(c,[side*12,11,side*22,2],'rgba(255,210,140,.75)',1.2);
      if(Math.sin(t*23)>0.8) {
        bloom(c,side*18,4,20,'rgba(255,122,66,.28)','playerHit',.28);
        line(c,[side*18,4,side*(26+Math.sin(t*13)*3),17],'rgba(255,216,144,.75)',1.2);
      }
    }
    if(p.firePulse>0) {
      const fire=clamp(p.firePulse,0,1);
      c.globalCompositeOperation='lighter';
      const color=ship==='wraith'?'182,174,255':ship==='manta'?'255,218,170':'205,255,225';
      const fireProfile=ship==='wraith'?'playerWraithFire':
        ship==='manta'?'playerMantaFire':'playerKestrelFire';
      bloom(c,0,-38,33,'rgba('+color+','+(fire*.38)+')',fireProfile,fire*.38);
      poly(c,[-5,-34,0,-52-fire*12,5,-34],'rgba('+color+','+(fire*.65)+')');
      c.globalCompositeOperation='source-over';
    }
    if(p.roll>0&&!p.rollCharged)oval(c,0,0,45,45,'rgba(125,247,232,.45)',true,2.2);
    if(p.rollCharged&&p.roll>0) {
      const strength=clamp(p.roll/(.34),0,1);
      oval(c,0,0,52+(1-strength)*33,52+(1-strength)*33,
        'rgba(126,253,234,'+(strength*.68)+')',true,3.5);
      for(let i=0;i<6;i++) {
        const a=i*TAU/6+t*9;
        line(c,[Math.cos(a)*43,Math.sin(a)*43,Math.cos(a)*63,Math.sin(a)*63],
          'rgba(208,255,236,'+(strength*.7)+')',2);
      }
    }
    this.playerCore(p);
    c.globalAlpha=1;
    c.restore();
  }
  playerCore(p) {
    const c=this.ctx,bright=p.focus||this.showHitbox,r=p.r||8;
    oval(c,0,0,r,r,'rgba(3,18,27,.65)');
    oval(c,0,0,r,r,bright?'rgba(212,255,246,.95)':'rgba(212,255,246,.48)',true,bright?1.5:1);
    oval(c,0,0,bright?2.8:2,bright?2.8:2,bright?'#fffce8':'rgba(255,248,225,.65)');
  }
  // The static steel is cached once; only weapons, engine shutters and damage move.
  fleetHull(w,h,flagship=false,hullClass='destroyer') {
    this.fleetSprites ||= new Map();
    const key=[w,h,flagship,hullClass].join('/');
    if(this.fleetSprites.has(key))return this.fleetSprites.get(key);
    const s=surface(w*2+64,h*2+64),c=s.getContext('2d');c.translate(w+32,h+32);
    c.lineJoin='round';
    const outline=[-w,-h*.18,-w*.83,-h*.72,-w*.48,-h,w*.62,-h,w*.91,-h*.54,w,h*.1,w*.84,h*.7,w*.5,h,-w*.6,h,-w*.9,h*.57];
    c.save();c.translate(5,12);poly(c,outline,'#030b0f','#02080c',9);c.restore();
    const steel=c.createLinearGradient(0,-h,0,h);steel.addColorStop(0,'#798a87');steel.addColorStop(.25,'#3d5457');steel.addColorStop(.75,'#23353c');steel.addColorStop(1,'#101f29');
    poly(c,outline,steel,'#91aaa2',2);
    c.save();c.scale(.94,.84);poly(c,outline,'#283b40','#b8b79a',1.5);c.restore();
    c.save();c.scale(.86,.72);poly(c,outline,'#4b5550','#111e26',3);c.restore();
    // Pitted steel grain and beveled deck plates remain entirely in the cache.
    c.save();poly(c,outline);c.clip();
    for(let i=0;i<1500;i++){
      c.fillStyle=i%3?'rgba(219,217,181,.09)':'rgba(0,9,14,.2)';
      c.fillRect((hash(i*13+1)-.5)*w*2,(hash(i*29+2)-.5)*h*2,1+hash(i*7)*3,.6);
    }
    c.restore();
    for(const side of [-1,1])for(let i=0;i<4;i++){
      const x=side*(w*.47+i*w*.075),y=-h*.2+i%2*12;
      c.fillStyle='#12282e';c.fillRect(x-5,y-13,10,26);
      c.fillStyle='#687b73';c.fillRect(x-4,y-12,8,23);
      line(c,[x-2,y-9,x+2,y-9,x+2,y+7],'#afb29a',1);
      for(let j=0;j<4;j++)line(c,[x-3,y-5+j*4,x+3,y-5+j*4],'#203a40',1);
    }
    // Riveted deck seams, longitudinal catwalks, ladders and plated armor belt.
    for(let x=-w*.72;x<w*.8;x+=24){
      line(c,[x,-h*.62,x,h*.64],'rgba(9,21,25,.7)',1);
      for(const y of [-h*.76,h*.76]){oval(c,x,y,1.3,1.3,'#b5b39b');line(c,[x-7,y-3,x+7,y-3],'#121f26',2);}
    }
    for(const y of [-h*.45,h*.45])line(c,[-w*.78,y,w*.81,y],'#92947d',1.5);
    for(const side of [-1,1])for(let i=0;i<7;i++){
      const x=-w*.65+i*w*.21,y=side*h*.85;
      poly(c,[x-7,y-4,x+7,y-4,x+6,y+4,x-6,y+4],'#192b32','#7f8f83',1);
    }
    // Layered armored island and bridge windows.
    const bw=flagship?43:w*.24,bh=flagship?29:h*.24;
    poly(c,[-bw-10,-bh,bw-6,-bh-10,bw+10,bh,-bw+2,bh+9],'#142731','#b8b69c',1.4);
    poly(c,[-bw,-bh+3,bw-12,-bh+3,bw,bh-3,-bw+8,bh-3],'#76827a','#172c34',2);
    for(let i=0;i<6;i++)line(c,[-bw+12+i*(bw*2-23)/6,-bh+8,-bw+15+i*(bw*2-23)/6,-bh+8],'#bee8d4',2);
    for(const x of [-bw*.4,bw*.45]){oval(c,x,3,8,11,'#111d22');oval(c,x,3,8,11,'#8c9589',true);line(c,[x-5,-3,x+5,-3],'#a19b7b',2);}
    line(c,[2,-8,2,-h-22],'#a3b4a8',2);line(c,[-23,-h-12,25,-h-12],'#728b85',2);
    line(c,[-17,-h-10,2,-h-22,20,-h-10],'#314b51',1);
    c.fillStyle='#d5c6a0';c.font='bold '+(flagship?11:8)+'px monospace';c.textAlign='center';
    c.fillText(flagship?'L V / 0 4':'I M / '+(hullClass==='cruiser'?'CR':'DD'),w*.48,h*.25);
    this.fleetSprites.set(key,s);return s;
  }
  // Silhouette drop shadow for a painted piece: a blurred dark copy baked once per
  // piece, drawn offset down-right like the old baked hull shadow.
  fleetPieceShadow(c,id,x,y,alpha=.85) {
    this.fleetShadows ||= new Map();
    let shadow=this.fleetShadows.get(id);
    if(!shadow){
      const info=pieceInfo(id),pad=10,s=surface(Math.ceil(info.w+pad*2),Math.ceil(info.h+pad*2)),g=s.getContext('2d');
      g.filter='blur(2.5px)';
      if(!drawPiece(g,id,pad+info.w*info.px,pad+info.h*info.py,0,1,1,{tint:'#02080c'}))return false;
      g.filter='none';
      shadow={canvas:s,dx:-pad-info.w*info.px,dy:-pad-info.h*info.py};this.fleetShadows.set(id,shadow);
    }
    const prior=c.globalAlpha;c.globalAlpha=prior*alpha;
    c.drawImage(shadow.canvas,x+5+shadow.dx,y+12+shadow.dy);c.globalAlpha=prior;
    return true;
  }
  fleetWake(x,y,w,h,t,foam=true) {
    const c=this.ctx;c.save();
    oval(c,x+6,y+11,w+9,h+5,'rgba(0,6,10,.7)');
    for(const side of [-1,1]){
      line(c,[x+side*w*.77,y-h*.72,x+side*(w+12),y+h*.3,x+side*(w+23),y+h+38], 'rgba(193,231,216,.28)',2);
      line(c,[x+side*w*.8,y+h*.65,x+side*(w+5),y+h+27+Math.sin(t*4)*5], 'rgba(231,248,229,.5)',1.3);
    }
    if(foam)oval(c,x,y+h+9,w*.63,9,'rgba(175,224,208,.15)');c.restore();
  }
  fleetDamage(e,w,h,t) {
    const c=this.ctx,damage=1-clamp(e.hp/Math.max(1,e.maxHp||e.hp),0,1);
    if(damage<.22)return;
    const count=damage>.65?5:damage>.4?3:1;
    for(let i=0;i<count;i++){
      const x=(hash(i*17+13)-.5)*w*1.5,y=(hash(i*23+8)-.5)*h*1.3;
      oval(c,x,y,15+i*2,9+i,'rgba(12,18,20,.35)');oval(c,x,y,9+i*2,5+i,'rgba(12,18,20,.6)');
      const pulse=1+Math.sin(t*15+i*2)*.22;
      poly(c,[x-5,y+3,x-8,y-8*pulse,x-2,y-4,x+2,y-18*pulse,x+7,y-4,x+5,y+4],'#dc6034');
      poly(c,[x-3,y+2,x,y-10*pulse,x+4,y+1],'#ffe8a1');
      for(let j=0;j<3;j++)oval(c,x+Math.sin(i+j+t)*4-j*5,y-14-j*10,7+j*4,6+j*3,'rgba(16,22,25,'+(.47-j*.09)+')');
    }
  }
  fleetEnemy(e,t) {
    const type=e.type,c=this.ctx;
    if(!['interceptor','gunboat','hull','hullTurret','scavenger','mine','torpedoEnemy'].includes(type))return false;
    c.save();c.translate(e.x,e.y);
    if(type==='hull'||type==='gunboat'){
      const w=type==='hull'?(e.w||72):18,h=type==='hull'?(e.h||100):37;
      const sprite=type==='hull'&&hasSheet(S4_FLEET)&&S4_HULLS[e.hullClass==='cruiser'?'cruiser':'destroyer'];
      c.save();c.translate(-e.x,-e.y);
      // The painted hulls are slimmer and longer than the sim box; the wake follows the paint.
      if(sprite)this.fleetWake(e.x,e.y,sprite.w,sprite.h*.93,t);else this.fleetWake(e.x,e.y,w,h,t);
      c.restore();
      if(sprite){
        this.fleetPieceShadow(c,sprite.id,0,0);
        drawPiece(c,sprite.id,0,0);
        this.fleetDamage(e,sprite.w*.8,h,t);
        if(e.flash>0)drawPiece(c,sprite.id,0,0,0,1,Math.min(.3,e.flash*.3),'flash');
        c.restore();return true;
      }
      if(type==='hull'){const tile=this.fleetHull(w,h,false,e.hullClass);c.drawImage(tile,-w-32,-h-32);}
      else if(!drawCraft(c,'turret',0,0,44,79,true)){
        poly(c,[0,-h,-w,-h*.35,-w,h*.7,0,h,w,h*.7,w,-h*.35],'#30484c','#a3b5a5',1.3);
        poly(c,[-11,-17,0,-28,11,-17,10,25,-10,25],'#717a69','#14272b',1);
        c.fillStyle='#1a3037';c.fillRect(-7,-1,14,17);line(c,[-6,1,6,1],'#b3e6d3',2);
        oval(c,0,-14,7,6,'#182d35');oval(c,0,-14,7,6,'#b8b99b',true);line(c,[0,-14,0,-31],'#c0b899',3);
      }
      this.fleetDamage(e,w,h,t);
    }else if(type==='hullTurret'){
      this.fleetFireClocks ||= new Map();
      const prior=this.fleetFireClocks.get(e.id);
      if(prior!==undefined&&e.fireAt>prior+.03)this.fleetMuzzles?.set(e.id,.11);
      this.fleetFireClocks.set(e.id,e.fireAt);
      const gun=e.gun||'triple',col=gun==='void'?'#c391e8':gun==='flak'?'#e5ae68':gun==='fan'?'#8ac3bd':'#b9c6ad';
      if(this.currentStage===5&&hasSheet(S5_SKY)){this.skyTurretSprite(e,t);c.restore();return true;}
      if(hasSheet(S4_FLEET)){this.fleetTurretSprite(e,gun,t);c.restore();return true;}
      oval(c,2,5,21,16,'#071217');oval(c,0,0,20,16,'#293c40');oval(c,0,0,20,16,col,true,1.5);
      if(e.hp<=0||e.dead){poly(c,[-15,-4,3,-12,13,3,-6,10],'#10181b','#6e7470',2);line(c,[-12,-7,10,9],'#c17e51',2);}
      else{
        c.rotate((e.aim??Math.PI/2)-Math.PI/2);
        poly(c,[-13,-9,9,-11,15,1,11,11,-12,11,-16,1],'#64716a',col,1.4);
        poly(c,[-12,-8,8,-9,11,-3,-12,0],'#9ba48d');
        poly(c,[-12,3,11,3,10,10,-11,10],'#283e42');
        line(c,[-9,-5,7,-6],'#d1c8a3',1);
        for(const x of [-9,8])oval(c,x,0,1.2,1.2,'#e0cfaa');
        const n=gun==='triple'?3:gun==='fan'||gun==='broadside'?4:2;
        for(let i=0;i<n;i++){
          const x=(i-(n-1)/2)*6,len=gun==='broadside'?29:gun==='flak'?18:25;
          line(c,[x,4,x,len],'#0b1b22',5);line(c,[x-1,4,x-1,len],col,2);
          const flash=this.fleetMuzzles?.get(e.id)||0;
          if(flash>0||e.firePulse>0)poly(c,[x-4,len,x,len+12+hash(i+t)*8,x+4,len],'#fff0b4');
        }
        if(gun==='void'){oval(c,0,-1,6,6,'#281435');oval(c,0,-1,6,6,'#ebc5ff',true,2);}
        else if(gun==='flak')line(c,[-10,-4,10,5],col,2);
        else if(gun==='fan'){oval(c,0,-3,6,4,'#142b32');oval(c,0,-3,6,4,col,true);}
      }
    }else if(type==='interceptor'){
      c.rotate((e.angle||0)+Math.PI);c.scale(.88+Math.cos((e.age||0)*3)*.12,1);
      line(c,[-12,13,-16,44],'rgba(228,141,102,.24)',2);line(c,[12,13,16,44],'rgba(228,141,102,.24)',2);
      if(!drawCraft(c,'ace',0,0,68,72,true)){
      poly(c,[0,-30,-7,-11,-32,5,-29,15,-9,7,-5,23,-14,29,-13,33,0,27,13,33,14,29,5,23,9,7,29,15,32,5,7,-11],'#17242b','#d89378',1);
      poly(c,[-7,-9,-29,7,-27,10,-8,2,8,2,27,10,29,7,7,-9],'#a93535');
      poly(c,[0,-30,-4,-10,-3,22,0,26,3,22,4,-10],'#e45c48','#6b2529',1);
      poly(c,[-3,-10,0,-17,3,-10,3,1,-3,1],'#091c25','#a5ddd0',1);
      }
      // Keep the identification lamps visible on the authored sprite as well.
      for(const side of [-1,1]){oval(c,side*25,6,4.2,2.6,'#f4c7a4');oval(c,side*25,6,2,1.4,'#ff765c');}
    }else if(type==='scavenger'){
      const col=PICKUP_THEMES[e.carrying?.type]?.[1]||'#ffdf7c';
      if(e.carrying){
        c.globalAlpha=.18;oval(c,0,12,29,34,col);c.globalAlpha=1;
        line(c,[-7,8,0,25,7,8],col,2);
        c.save();c.translate(0,27);poly(c,[0,-10,10,0,0,10,-10,0],'#0a1620',col,2.5);c.fillStyle=col;c.font='bold 11px Arial';c.textAlign='center';c.fillText(PICKUP_THEMES[e.carrying.type]?.[0]||'P',0,4);c.restore();
      }
      if(hasSheet(S4_FLEET)){
        // Claws snap while it homes on salvage, clamp shut (with a twitch) while carrying.
        const id=e.id||0,hunting=!e.carrying&&e.targetPickupId!=null;
        const open=e.carrying?Math.sin(t*7+id)>.92:hunting?Math.sin(t*21+id)>0:Math.sin(t*3.1+id)>.2;
        c.rotate(clamp((e.vx||0)/900,-.3,.3));
        const frame=open?'scavenger-open':'scavenger';
        drawPiece(c,frame,0,0,0,1,1,'outline');
        oval(c,0,-6,1.8,1.8,e.carrying?col:'#c8543a');
        if(e.flash>0)drawPiece(c,frame,0,0,0,1,Math.min(.6,e.flash*.6),'flash');
        c.restore();return true;
      }
      for(const side of [-1,1]){
        poly(c,[side*5,-5,side*20,-13,side*25,3,side*14,0,side*9,10],'#374a46','#a0c3a0',1);
        line(c,[side*10,3,side*18,10+Math.sin(t*30)*3,side*13,17],'#c2a775',1.6);
      }
      poly(c,[0,-15,-7,-4,-5,9,0,15,5,9,7,-4],'#25302c','#a5b995',1);
      oval(c,0,-5,3,4,e.carrying?col:'#ef6b47');
    }else if(type==='mine'){
      const fuse=Math.max(0,e.fuse??4),pulse=Math.sin(t*(8+28/(fuse+.5)))>0;
      if(hasSheet(S4_FLEET)){
        // Slow tumble; the fuse lamp stays procedural and quickens as the fuse burns.
        const id=e.id||0,spin=t*(id%2?.55:-.55)+id;
        drawPiece(c,'mine',0,0,spin,1,1,'outline');
        if(e.flash>0)drawPiece(c,'mine',0,0,spin,1,Math.min(.6,e.flash*.6),'flash');
        oval(c,0,0,3.2,3.2,pulse?'#fff4bf':'#8f3a2a');
        if(pulse)oval(c,0,0,6.5,6.5,'#e99c61',true,1.3);
        c.restore();return true;
      }
      for(let i=0;i<8;i++){const a=i*TAU/8;line(c,[Math.cos(a)*10,Math.sin(a)*10,Math.cos(a)*19,Math.sin(a)*19],'#a6b2a0',3);}
      oval(c,1,3,13,13,'#030d13');oval(c,0,0,12,12,'#3d4640');oval(c,0,0,12,12,'#a2aa92',true,1.5);oval(c,-3,-4,4,3,'#65766b');
      oval(c,0,0,4,4,pulse?'#fff4bf':'#ad422e');if(pulse)oval(c,0,0,7,7,'#e99c61',true,1.5);
    }else{
      if(hasSheet(S4_FLEET)){
        // Painted nose up: the wake trails the tail fins, the motor burns at the tail.
        c.rotate(Math.atan2(e.vy||110,e.vx||0)+Math.PI/2);
        const flick=.85+.15*Math.sin(t*41+(e.id||0));
        line(c,[-5,12,-9,44],'rgba(194,228,208,.5)',2);line(c,[5,12,9,44],'rgba(194,228,208,.5)',2);
        line(c,[0,22,0,34+flick*6],'rgba(194,228,208,.22)',4);
        bloom(c,0,23,15*flick,'rgba(255,185,103,.25)','hitMissile',.3);
        drawPiece(c,'torpedo',0,0,0,1,1,'outline');
        line(c,[-2.6,22.5,2.6,22.5],'#ffc27a',2.4);
        if(Math.sin(t*9+(e.id||0))>0)oval(c,0,-16,1.3,1.3,'#ff765c');
        if(e.flash>0)drawPiece(c,'torpedo',0,0,0,1,Math.min(.6,e.flash*.6),'flash');
        c.restore();return true;
      }
      c.rotate(Math.atan2(e.vy||110,e.vx||0)-Math.PI/2);
      line(c,[-6,-11,-10,-42],'rgba(194,228,208,.6)',2);line(c,[6,-11,10,-42],'rgba(194,228,208,.6)',2);
      poly(c,[0,21,-7,9,-6,-16,-12,-23,-3,-20,3,-20,12,-23,6,-16,7,9],'#14252b','#aab6a0',1.5);
      bloom(c,0,7,18,'rgba(255,185,103,.25)','hitMissile',.25);
      line(c,[-5,6,5,6],'#ffc27a',4);oval(c,0,14,3,3,'#ffdb96');
    }
    if(e.flash>0){c.globalAlpha=Math.min(.65,e.flash);oval(c,0,0,type==='hull'?e.w:19,type==='hull'?e.h:15,'#fff3ca');}
    c.restore();return true;
  }
  // Painted hull turret, drawn at the mount (context already translated). The head
  // turns about its round body (TURRET_HUB below the cell center); on each shot the
  // barrels slide back into the mantlet and spring out again.
  fleetTurretSprite(e,gun,t) {
    const c=this.ctx,spec=TURRET_GUNS[gun]||TURRET_GUNS.triple,id=e.id||0;
    const rot=(e.aim??Math.PI/2)+Math.PI/2;
    if(e.hp<=0||e.dead){
      drawPiece(c,'turret-base-wreck',0,0);
      // The burnt head keeps its last bearing, knocked askew on the ring.
      c.save();c.rotate(rot+(hash(id*7+3)-.5)*.9);c.translate(1.5,-8);
      drawPiece(c,'turret-head-wreck',0,0);c.restore();
      const ember=.45+.35*Math.sin(t*11+id);
      oval(c,-2,1,2.2,1.6,'rgba(220,96,52,'+ember.toFixed(2)+')');
      for(let j=0;j<(this.reducedEffects?1:3);j++){
        const q=(t*.42+j/3+hash(id*3))%1;
        oval(c,Math.sin(q*3+id)*3+q*7,-4-q*30,4+q*7,3+q*5,'rgba(16,22,25,'+((1-q)*.38).toFixed(3)+')');
      }
      return;
    }
    const shot=clamp(Math.max((this.fleetMuzzles?.get(e.id)||0)/.11,e.firePulse||0),0,1);
    const kick=shot*4.2,head='turret-head-'+(TURRET_GUNS[gun]?gun:'triple');
    // Head-shaped drop shadow on the deck, then the base and a thin gun-type rim.
    c.save();c.translate(2,4);c.rotate(rot);drawPiece(c,head,0,-TURRET_HUB,0,1,.55,{tint:'#02080c'});c.restore();
    drawPiece(c,'turret-base',0,0);
    c.save();c.globalAlpha*=.38;oval(c,0,0,19.5,18.5,spec.rim,true,1.1);c.restore();
    c.save();c.rotate(rot);c.translate(0,-TURRET_HUB+kick*.25);
    if(kick>.2){
      c.save();c.beginPath();c.rect(-40,-60,80,60+spec.cut);c.clip();drawPiece(c,head,0,kick);c.restore();
      c.save();c.beginPath();c.rect(-40,spec.cut,80,60);c.clip();drawPiece(c,head,0,0);c.restore();
    }else drawPiece(c,head,0,0);
    if(gun==='void'){
      const charge=clamp(1-((e.fireAt??0)-(e.age??0))/.7,0,1),pulse=.75+.25*Math.sin(t*6+id);
      bloom(c,0,12,9+charge*7,'rgba(215,163,255,.6)','rimViolet',(.2+.35*charge)*pulse);
      oval(c,0,12,2.2,7,'rgba(220,170,255,'+(.25+.45*charge).toFixed(2)+')');
    }
    if(e.flash>0)drawPiece(c,head,0,0,0,1,Math.min(.45,e.flash*.45),'flash');
    if(shot>.05){
      for(const [x,y,a] of spec.muzzles){
        const tip=y+kick,len=6+shot*7+hash(x+t*60)*3;
        c.save();c.translate(x,tip);c.rotate(a);
        if(!this.reducedEffects)bloom(c,0,-3,8,'rgba(255,178,116,.5)','rimFire',.55*shot);
        c.globalAlpha*=shot;
        poly(c,[-2.8,0,-1.2,-len*.55,0,-len,1.2,-len*.55,2.8,0],'#e98a4c');
        poly(c,[-1.4,0,0,-len*.6,1.4,0],'#fff0b4');
        c.restore();
      }
    }
    c.restore();
  }
  fleetTurretWrecks(parent,t) {
    for(const wreck of this.fleetWrecks?.values()||[]){
      if(wreck.parentId!==parent.id)continue;
      this.fleetEnemy({...wreck,type:'hullTurret',x:parent.x+wreck.ox,y:parent.y+wreck.oy,hp:0,maxHp:1},t);
    }
  }
  // Broadside recoil (0..1) of one LEVIATHAN side, from its latest broadside event.
  leviathanRecoil(side) {
    let r=0;
    for(const fx of this.impacts)if(fx.fleet&&fx.type==='broadside'&&(Number(fx.value)||1)===side&&fx.age<.32)r=Math.max(r,1-fx.age/.32);
    return r;
  }
  // Ten casemate batteries: blocks slide out with `extension`, twin barrels grow
  // 9 -> 21 px about their root. `sink` (0..1) folds the barrels down on the wreck.
  leviathanBatteries(c,extension,litSide,t,sink=0) {
    for(const side of [-1,1]){
      const s=side<0?'l':'r',lit=!sink&&extension>0&&litSide===side,recoil=sink?0:this.leviathanRecoil(side);
      const variant=sink?'wreck':undefined;
      for(let i=0;i<5;i++){
        const y=-41.6+i*20.8,x=leviathanBatteryX(side,extension)-side*recoil*2.2;
        const len=(9+extension*12)*(1-.42*recoil)*(1-sink*.7);
        const bars=[len/LEVIATHAN_BATTERY_REACH,LEVIATHAN_BATTERY_SCALE],fold=side*sink*.55;
        if(lit&&!this.reducedEffects)bloom(c,x+side*(len+1),y,11,'rgba(255,178,116,.5)','rimFire',.3+.12*Math.sin(t*7+i));
        // Dark underside first so the small parts separate from the deck and the sea.
        drawPiece(c,'battery-barrels-'+s,x+1,y+2,fold,bars,.75,{tint:'#02080c'});
        drawPiece(c,'battery-block-'+s,x+1,y+2,0,LEVIATHAN_BATTERY_SCALE*1.08,.8,{tint:'#02080c'});
        drawPiece(c,'battery-barrels-'+s,x,y,fold,bars,1,variant);
        drawPiece(c,'battery-block-'+s,x,y,0,LEVIATHAN_BATTERY_SCALE,1,variant);
        if(lit)drawPiece(c,'battery-block-'+s,x,y,0,LEVIATHAN_BATTERY_SCALE,.4+.15*Math.sin(t*7+i),{tint:'rgba(255,170,92,.55)'});
      }
    }
  }
  leviathanSprite(b,t) {
    const c=this.ctx,w=b.w||210,h=b.h||80,cy=18;
    // The painted hull spans y -59..57 (mast to -92): the wake hugs the paint.
    this.fleetWake(b.x,b.y-1,w,58,t,false);
    c.save();c.translate(b.x,b.y);c.rotate(b.angle||0);
    this.fleetPieceShadow(c,'leviathan-hull',0,0);
    drawPiece(c,'leviathan-hull',0,0);
    this.leviathanBatteries(c,clamp(b.broadside||0,0,1),b.broadsideSide,t);
    // Armor plates part over the engine bed; two counter-rotating rotors spin up.
    const core=clamp(b.core||0,0,1);
    drawPiece(c,'core-bed',0,cy);
    if(core>0){
      c.save();c.globalAlpha*=core;
      bloom(c,0,cy,65,'rgba(128,253,228,.8)','effectTeal',this.reducedEffects?.5:.75);
      for(const [id,dir,scale] of [['core-rotor-a',-1,1],['core-rotor-b',1,.84]]){
        const a=t*dir*1.7;
        // Motion blur: two fading ghosts trail each rotor.
        if(!this.reducedEffects)for(let j=2;j>=1;j--)drawPiece(c,id,0,cy,a-dir*j*.13,scale,.2/j);
        drawPiece(c,id,0,cy,a,scale);
      }
      bloom(c,0,cy,26,'rgba(128,253,228,.8)','effectTeal',.45+.15*Math.sin(t*9));
      // Small hub glow: the spirals leave from here, so it stays dimmer than the rounds.
      oval(c,0,cy,5+Math.sin(t*9),5,'rgba(206,255,238,.72)');
      c.restore();
    }
    drawPiece(c,'core-armor-l',-(19+core*37),cy);
    drawPiece(c,'core-armor-r',19+core*37,cy);
    this.fleetDamage(b,w,h*.85,t);
    if(b.flash>0)drawPiece(c,'leviathan-hull',0,0,0,1,Math.min(.16,b.flash*.16),'flash');
    c.restore();
    this.fleetTurretWrecks(b,t);
    for(const e of this.fleetEnemies||[])if(e.type==='hullTurret'&&e.parentId===b.id&&!e.dead&&e.hp>0)this.enemy(e,t);
  }
  leviathan(b,t) {
    if(hasSheet(S4_BOSS)&&hasSheet(S4_FLEET))return this.leviathanSprite(b,t);
    const c=this.ctx,w=b.w||210,h=b.h||80;
    this.fleetWake(b.x,b.y,w,h,t);
    c.save();c.translate(b.x,b.y);c.rotate(b.angle||0);
    const tile=this.fleetHull(w,h,true);c.drawImage(tile,-w-32,-h-32);
    const extension=clamp(b.broadside||0,0,1);
    for(const side of [-1,1])for(let i=0;i<5;i++){
      const y=-h*.52+i*h*.26,x=side*(w*.85+extension*22),lit=extension>0&&b.broadsideSide===side;
      c.fillStyle='#071419';c.fillRect(side<0?-w*.93:w*.81,y-8,w*.12,16);
      poly(c,[x-8,y-7,x+8,y-7,x+8,y+7,x-8,y+7],lit?'#9e7048':'#455f5b',lit?'#ffd78c':'#99aaa0',1);
      for(const dy of [-3,3])line(c,[x,y+dy,x+side*(9+extension*12),y+dy],lit?'#f4d59a':'#899f95',3);
      if(lit)oval(c,x,y,4,3,'#ffe0a0');
    }
    // Sliding core armor reveals a counter-rotating monsoon engine.
    const core=clamp(b.core||0,0,1),cy=18;
    oval(c,0,cy,42,34,'#08151d');oval(c,0,cy,42,34,'#bcb897',true,2);
    if(core>0){
      c.save();c.globalAlpha=core;
      bloom(c,0,cy,65,'rgba(128,253,228,.8)','effectTeal',.8);
      for(const side of [-1,1]){
        c.save();c.translate(0,cy);c.rotate(t*side*1.7);
        for(let i=0;i<8;i++){const a=i*TAU/8;line(c,[Math.cos(a)*15,Math.sin(a)*15,Math.cos(a+.4*side)*34,Math.sin(a+.4*side)*27],side<0?'#c5fff0':'#dca2ef',2.3);}
        c.restore();
      }
      oval(c,0,cy,12+Math.sin(t*9)*2,12,'#efffec');c.restore();
    }
    for(const side of [-1,1]){
      const x=side*(19+core*37);
      poly(c,[x-18,cy-30,x+18,cy-30,x+18,cy+30,x-18,cy+30],'#3d5555','#c1bea0',1.5);
      for(let j=0;j<4;j++)line(c,[x-13,cy-20+j*12,x+13,cy-20+j*12],'#162b31',3);
    }
    this.fleetDamage(b,w,h,t);
    if(b.flash>0){c.globalAlpha=b.flash*.65;line(c,[-w*.8,-h*.6,w*.65,-h*.6,w*.9,-h*.25],'#fff3cb',3);}
    c.restore();
    this.fleetTurretWrecks(b,t);
    // Child coordinates are authoritative: no decorative guns that survive a kill.
    for(const e of this.fleetEnemies||[])if(e.type==='hullTurret'&&e.parentId===b.id&&!e.dead&&e.hp>0)this.enemy(e,t);
  }
  sinkingLeviathan(fx,t) {
    const c=this.ctx,{w,h,angle,broadside,core}=fx.hull,p=fx.age/fx.life;
    const fade=Math.min(1,(1-p)*3),sink=p*p*85;
    c.save();c.translate(fx.x+Math.sin(p*2)*8,fx.y+sink);
    c.rotate(angle+p*.13);c.scale(1,1-p*.36);c.globalAlpha=fade;
    if(hasSheet(S4_BOSS)){
      // Burnt hull at the same registration; batteries fold, the engine is dead.
      this.fleetPieceShadow(c,'leviathan-wreck',0,0,.7);
      drawPiece(c,'leviathan-wreck',0,0);
      this.leviathanBatteries(c,broadside,0,t,Math.min(1,p*1.6));
      drawPiece(c,'core-bed',0,18,0,1,1,'wreck');
      drawPiece(c,'core-armor-l',-(19+core*37),18+p*4,-p*.2,1,1,'wreck');
      drawPiece(c,'core-armor-r',19+core*37,18+p*6,p*.25,1,1,'wreck');
    }else{
    c.drawImage(this.fleetHull(w,h,true),-w-32,-h-32);
    // Batteries fold down with the listing deck; the engine is extinguished.
    for(const side of [-1,1])for(let i=0;i<5;i++){
      const x=side*(w*.85+broadside*22),y=-h*.52+i*h*.26;
      line(c,[x,y,x+side*(9+broadside*12)*(1-p),y+8*p],'#7c8d82',5);
    }
    oval(c,0,18,42+core*12,34,'#0b1519');
    oval(c,0,18,42+core*12,34,'#7d887a',true,2);
    }
    // Persistent fires stay attached to the deck. Only their small lobes move.
    for(let i=0;i<7;i++){
      const x=(i/6-.5)*w*1.55,y=(hash(i*17+8)-.5)*h;
      const fire=(9+hash(i+4)*10)*(1+Math.sin(t*19+i*3)*.15)*(1-p*.7);
      oval(c,x,y,fire*1.4,fire*.65,'#0a1519');
      bloom(c,x,y,fire*2.4,'rgba(255,178,116,.5)','rimFire',.5*fade);
      poly(c,[x-fire,y,x-fire*.4,y-fire*1.4,x+2,y-fire*2.2,x+fire*.4,y-fire,x+fire,y+2],'#d86432');
      oval(c,x,y-fire*.4,fire*.45,fire*.75,'#ffda8c');
    }
    c.restore();
    // A widening waterline and individual spray jets frame the whole wreck.
    c.save();c.globalAlpha=fade*.65;
    for(let ring=0;ring<3;ring++){
      const q=(p+ring*.24)%1;
      oval(c,fx.x,fx.y+h*.35+sink*.65,w*(.85+q*.5),h*(.6+q*.8),'rgba(198,234,219,'+((1-q)*.7)+')',true,2-q);
    }
    for(let i=0;i<24;i++){
      const a=i*TAU/24,q=(p*2.2+hash(i*3))%1;
      const x=fx.x+Math.cos(a)*w*(.92+q*.23),y=fx.y+sink*.7+Math.sin(a)*h*.7;
      line(c,[x,y,x+Math.cos(a)*q*17,y-Math.sin(q*Math.PI)*24],'rgba(216,245,229,'+((1-q)*.8)+')',1.5);
    }
    // Cache a neutral steam lobe; its upward drift follows the storm wind.
    if(!this.fleetSteam){
      this.fleetSteam=surface(96,96);const sc=this.fleetSteam.getContext('2d');
      for(let i=0;i<6;i++){
        const x=30+hash(i*7)*36,y=28+hash(i*11)*36,rad=21;
        const g=sc.createRadialGradient(x,y,0,x,y,rad);
        g.addColorStop(0,'rgba(178,193,181,.32)');g.addColorStop(1,'rgba(121,145,135,0)');
        sc.fillStyle=g;sc.fillRect(x-rad,y-rad,rad*2,rad*2);
      }
    }
    for(let i=0;i<7;i++){
      const q=(p*.85+i/7)%1,sz=48+q*76;
      c.globalAlpha=Math.sin(q*Math.PI)*.75*fade;
      c.drawImage(this.fleetSteam,fx.x+(hash(i*7)-.5)*w*.5+q*48-sz*.5,fx.y+sink*.3-q*130-sz*.5,sz,sz);
    }
    c.restore();
  }
  fleetEffects(t) {
    const c=this.ctx;
    for(const fx of this.impacts){
      if(!fx.fleet)continue;
      const p=fx.age/fx.life,fade=(1-p)*(1-p);c.save();c.globalAlpha=fade;
      const col=PICKUP_THEMES[fx.value]?.[1]||'#ffe4a2';
      if(fx.type.startsWith('scavenger')){
        const sign=fx.type==='scavengerEscape'?-1:1;
        line(c,[fx.fromX??fx.x-40*(1-p),fx.fromY??fx.y+sign*48*(1-p),fx.x,fx.y],col,3);
        oval(c,fx.x,fx.y,10+p*34,10+p*34,col,true,2);
        for(let i=0;i<5;i++)line(c,[fx.x,fx.y,fx.x+Math.cos(i*TAU/5)*p*45,fx.y+Math.sin(i*TAU/5)*p*45],col,1);
      }else if(['hullDown','turretDown','bossDown'].includes(fx.type)){
        if(fx.type==='turretDown'){
          oval(c,fx.x,fx.y,20,14,'#172426');oval(c,fx.x,fx.y,20,14,'#77837b',true,2);
          line(c,[fx.x-12,fx.y-7,fx.x+8,fx.y+8],'#d78b56',3);
          poly(c,[fx.x-10,fx.y+7,fx.x+5,fx.y-8,fx.x+13,fx.y+4],'#0b171c');
        }
        const n=fx.type==='bossDown'?17:fx.type==='hullDown'?7:3;
        for(let i=0;i<n;i++){
          const death=fx.type==='bossDown',age=death?(fx.age-i*.135)/.72:p-i*.045;
          if(age<0||(death&&age>1))continue;
          c.globalAlpha=Math.max(.15,1-age*1.4)*Math.min(1,(1-p)*3);
          const x=fx.x+(death?(i/(n-1)-.5)*fx.hull.w*1.7:(hash(i+fx.id)-.5)*fx.size*1.5),
            y=fx.y+(hash(i*19+fx.id)-.5)*(death?fx.hull.h:fx.size*.55)+(death?p*p*65:0);
          const r=(fx.type==='bossDown'?23+age*65:fx.type==='hullDown'?17+age*47:9+age*23)*(1-age*.5);
          oval(c,x-8*age,y-45*age,r*1.2,r,'rgba(17,25,28,.7)');
          bloom(c,x,y,Math.min(94,r*2.3),'rgba(255,178,116,.7)','rimFire',.7);
          oval(c,x,y,r,r*.8,'#b74428');oval(c,x-2,y-3,r*.75,r*.65,'#f28a3f');
          oval(c,x-3,y-6,r*.45,r*.44,'#fff0b5');
          for(let j=0;j<3;j++){
            const a=i*2.3+j*2.1,d=age*(45+j*25),dx=Math.cos(a)*d,dy=Math.sin(a)*d+age*age*25;
            line(c,[x+dx*.7,y+dy*.7,x+dx,y+dy],'#eab778',1.5);
            poly(c,[x+dx-3,y+dy,x+dx+2,y+dy-4,x+dx+4,y+dy+3],'#2a3939','#b2ad8d',1);
          }
          line(c,[x,y,x+Math.cos(i*3)*age*80,y+Math.sin(i*3)*age*70],'#fff3b7',2);
        }
        c.globalAlpha=fade;oval(c,fx.x,fx.y,fx.size*(.2+p),fx.size*(.1+p*.3),'#c7f5e2',true,2);
      }else{
        const radius=fx.size*(.1+p);
        const boss=this.fleetBoss;
        if(fx.type==='broadside'&&boss&&!boss.dead&&hasSheet(S4_BOSS)){
          // Muzzle blasts at the battery tips that just fired, then gun smoke rolling outward.
          const side=Number(fx.value)||1,extension=clamp(boss.broadside||0,0,1),k=clamp(1-p/.22,0,1);
          const x=leviathanBatteryX(side,extension),len=9+extension*12;
          c.save();c.translate(boss.x,boss.y);c.rotate(boss.angle||0);
          for(let i=0;i<5;i++){
            const y=-41.6+i*20.8,tip=x+side*len;
            for(let j=0;j<2;j++){
              const q=clamp((p-j*.08)/.9,0,1);if(q<=0)continue;
              oval(c,tip+side*(5+q*30+j*6),y-q*10+(j?3:-2),3+q*9,2.5+q*6,'rgba(132,146,140,'+((1-q)*.26).toFixed(3)+')');
            }
            if(k>0){
              if(!this.reducedEffects)bloom(c,tip+side*5,y,13,'rgba(255,226,179,.8)','coreFire',.55*k);
              c.globalAlpha=fade*k;
              poly(c,[tip,y-3.6,tip+side*(9+9*k),y-1.2,tip+side*(13+11*k),y,tip+side*(9+9*k),y+1.2,tip,y+3.6],'#f0a25a');
              poly(c,[tip,y-1.8,tip+side*(8+7*k),y,tip,y+1.8],'#ffe4a0');
              c.globalAlpha=fade;
            }
          }
          c.restore();
        }else if(fx.type==='broadside'){
          const side=Number(fx.value)||1;
          for(let i=0;i<7;i++){
            const x=fx.x,y=fx.y-65+i*20;
            bloom(c,x,y,25,'rgba(255,226,179,.8)','coreFire',.8);
            poly(c,[x,y-5,x+side*(25+p*30),y+Math.sin(i)*9,x,y+5],'#ffe4a0');
          }
        }else if(fx.type==='coreExposed'){
          bloom(c,fx.x,fx.y,94,'rgba(128,253,228,.8)','effectTeal',.8);
          line(c,[fx.x-radius,fx.y,fx.x+radius,fx.y],'#d8ffed',3);
        }else if(fx.type==='torpedoLaunch'){
          for(const side of [-1,1])line(c,[fx.x+side*7,fx.y,fx.x+side*(17+p*25),fx.y+60*p],'#d3eee2',2);
        }else if(fx.type==='mineBurst'){
          for(let i=0;i<12;i++){const a=i*TAU/12,x=fx.x+Math.cos(a)*radius,y=fx.y+Math.sin(a)*radius;oval(c,x,y,3,3,'#fff0bd');}
        }
        oval(c,fx.x,fx.y,radius,radius*.6,fx.type==='coreExposed'?'#a8ffe7':'#ffe3ad',true,3);
        for(let i=0;i<10;i++){const a=i*TAU/10;line(c,[fx.x+Math.cos(a)*radius*.6,fx.y+Math.sin(a)*radius*.6,fx.x+Math.cos(a)*radius,fx.y+Math.sin(a)*radius],'#fff0c2',2);}
      }
      c.restore();
    }
  }

  // Static metalwork is rasterized once; only weapons, lights and damage animate.
  skyHull(type,w=80,h=65) {
    this.skySprites ||= new Map();const key=`${type}/${w}/${h}`;
    if(this.skySprites.has(key))return this.skySprites.get(key);
    const tile=surface(w*2+80,h*2+100),c=tile.getContext('2d');c.translate(w+40,h+40);c.lineJoin='round';
    const flagship=type==='halcyon',foundry=type==='foundry';
    if(!this.skyMetal){this.skyMetal=c.createLinearGradient(55,-60,-45,55);for(const [p,col] of [[0,'#f4b99b'],[.16,'#a58b99'],[.34,'#655b78'],[.65,'#35354e'],[1,'#171a30']])this.skyMetal.addColorStop(p,col);}
    if(!this.halcyonMetal){this.halcyonMetal=c.createLinearGradient(80,-70,-30,80);for(const [p,col] of [[0,'#f4b99b'],[.12,'#b797a2'],[.3,'#6d617c'],[.7,'#34334e'],[1,'#171a30']])this.halcyonMetal.addColorStop(p,col);}
    const metal=flagship?this.halcyonMetal:this.skyMetal,rim='#f4b99b';
    let outline=flagship?[-w,h*.3,-w*.94,-h*.2,-w*.32,-h*.7,0,-h,w*.32,-h*.7,w*.94,-h*.2,w,h*.3,w*.4,h*.7,w*.15,h*.45,0,h,-w*.15,h*.45,-w*.4,h*.7]:foundry?[-w,-h,w,-h,w+12,h*.4,w*.7,h,-w*.7,h,-w-12,h*.4]:type==='boxBomber'?[0,-48,10,-32,14,-12,66,-2,68,13,13,9,9,31,29,37,29,45,0,40,-29,45,-29,37,-9,31,-13,9,-68,13,-66,-2,-14,-12,-10,-32]:type==='skyAce'?[0,-40,7,-19,21,-12,22,-6,8,-9,12,9,43,-9,39,11,10,24,0,31,-10,24,-39,11,-43,-9,-12,9,-8,-9,-22,-6,-21,-12,-7,-19]:[-15,-8,-8,-15,8,-15,15,-8,15,8,8,15,-8,15,-15,8];
    c.save();c.translate(0,6);poly(c,outline,'#101326','#101326',3);c.restore();poly(c,outline,metal,rim,1.5);
    c.save();poly(c,outline);c.clip();
    // Beveled plates, fine seams, rivets, and pitting follow the skin.
    for(let x=-w;x<w;x+=flagship?28:18){line(c,[x,-h,x+9,h],'#201d34',1);line(c,[x+2,-h,x+11,h],'rgba(244,185,155,.25)',.7);for(let y=-h+7;y<h;y+=13)oval(c,x+5,y,.8,.8,'#c1a2a5');}
    for(let y=-h+14;y<h;y+=24)line(c,[-w,y,w,y+5],'#201d34',1);
    for(let i=0;i<(flagship?1800:foundry?900:400);i++){c.fillStyle=i%3?'rgba(255,220,186,.1)':'rgba(8,10,25,.24)';c.fillRect((hash(i*13)-.5)*w*2,(hash(i*29)-.5)*h*2,hash(i*7)*2+.5,.6);}
    c.restore();
    if(flagship){
      for(const side of [-1,1])for(let j=0;j<6;j++){
        const x=side*(45+j*28),y=-h+12+j*7;
        poly(c,[x,y,x+side*22,y+6,x+side*20,y+20,x+side*2,y+15],'#5c536d','#c09a9e',1);
        for(let k=0;k<3;k++)line(c,[x+side*4,y+5+k*4,x+side*18,y+9+k*4],'#201d34',1.5);
        line(c,[x,y-2,x+side*22,y+4],rim,2);
      }
      for(const side of [-1,1])for(let j=0;j<4;j++){const x=side*(56+j*39),y=-28+j*6;poly(c,[x-7,y,x+7,y+2,x+12,y+40,x-9,y+38],'#25263c','#8f758c',1);line(c,[x+6,y+3,x+10,y+35],'#e0aca4',1);for(let k=0;k<4;k++)line(c,[x-4,y+12+k*5,x+5,y+13+k*5],'#171a30',2);}
      for(let i=0;i<8;i++){const x=(i-3.5)*46,y=48-Math.abs(x)*.08;poly(c,[x-10,y-10,x+10,y-10,x+12,y+17,x-12,y+17],metal,'#a88997',1);oval(c,x,y+16,8,4,'#100f24');bloom(c,x,y+24,23,'#ffb98a','rimFire',.65);oval(c,x,y+17,6,2,'#ffd6ac');}
      poly(c,[-25,26,-21,-36,0,-59,21,-36,25,26,0,48],metal,'#d8acaa',1.5);
      poly(c,[-12,-30,0,-45,12,-30,9,-9,-9,-9],'#18283d','#f4c3b5',1);poly(c,[-9,-29,0,-40,7,-30,0,-20],'#92acbc');
      for(const x of [-150,0,150]){poly(c,[x-29,2,x+29,2,x+25,42,x-25,42],'#0d1021','#ab8294',2);c.fillStyle='#694258';c.fillRect(x-21,8,42,27);line(c,[x-19,34,x+19,34],'#ffd1a0',2);}
    }else if(foundry){
      c.save();c.scale(.91,.82);poly(c,outline,'#4b4058','#b896a0',2);c.restore();
      for(const x of [-.65,0,.65]){poly(c,[x*w-23,-h+12,x*w+23,-h+12,x*w+23,h-14,x*w-23,h-14],metal,'#201d34',2);for(let y=-h+20;y<h-14;y+=9){line(c,[x*w-16,y,x*w+16,y],'#171a30',5);line(c,[x*w-13,y,x*w+13,y],'#ffc88e',2);}}
      for(const side of [-1,1]){poly(c,[side*(w-20),-h,side*w,-h,side*w,h*.6,side*(w-20),h*.5],metal,rim,1);bloom(c,side*(w-9),h*.7,26,'#ffb98a','rimFire',.7);}
    }else if(type==='boxBomber'){
      for(const x of [-48,-27,27,48]){poly(c,[x-6,-17,x,-23,x+6,-17,x+7,12,x-7,12],metal,'#d1a9a4',1);oval(c,x,-17,7,4,'#171a30');oval(c,x,-19,12,3,'rgba(255,230,210,.3)');line(c,[x-12,-19,x+12,-19],'#ddc1ae',1);bloom(c,x,17,15,'#ffb98a','rimFire',.65);}
      poly(c,[-6,-29,0,-39,6,-29,5,-18,-5,-18],'#17263d','#c8b2bf',1);line(c,[-3,-29,0,-35,3,-28],'#b4d3dc',1);
      line(c,[0,-12,0,30],'#bda0a6',2);
    }else if(type==='skyAce'){
      for(const side of [-1,1]){line(c,[side*12,15,side*32,0],'#f6ce80',3);poly(c,[side*5,13,side*11,14,side*12,26,side*6,26],'#171a30','#b38d99',1);bloom(c,side*9,29,18,'#ffb98a','rimFire',.8);}
      poly(c,[0,-28,5,-12,0,1,-5,-12],'#17263d','#d6b9ba',1);line(c,[0,-24,2,-12],'#c0d9e3',1.5);
    }else{oval(c,0,0,14,14,metal,rim,1);oval(c,0,0,8,8,'#171a30','#b7a1b9',1);for(const x of [-1,1])for(const y of [-1,1]){line(c,[x*6,y*6,x*15,y*15],'#a691a6',3);oval(c,x*15,y*15,6,6,'#171a30',rim,1);oval(c,x*15,y*15,4,2,'#ffc89e');}oval(c,0,-4,3,4,'#b8c6dc');}
    this.skySprites.set(key,tile);return tile;
  }
  skyCloudShadow(w,h) {
    this.skyShadows ||= new Map();const key=w+'/'+h;if(this.skyShadows.has(key))return this.skyShadows.get(key);
    const tile=surface(w*2.8,h*2),c=tile.getContext('2d');c.translate(tile.width/2,tile.height/2);c.scale(1,h/w*.7);
    const g=c.createRadialGradient(0,0,w*.3,0,0,w*1.35);g.addColorStop(0,'rgba(20,10,40,.35)');g.addColorStop(.65,'rgba(20,10,40,.22)');g.addColorStop(1,'rgba(20,10,40,0)');c.fillStyle=g;c.fillRect(-w*1.4,-w*1.4,w*2.8,w*2.8);this.skyShadows.set(key,tile);return tile;
  }
  skyModule(type,open=false) {
    this.skyModules ||= new Map();const key=type+'/'+open;if(this.skyModules.has(key))return this.skyModules.get(key);
    const tile=surface(64,76),c=tile.getContext('2d');c.translate(32,30);
    if(type==='tailGunner'){oval(c,0,0,12,12,'#242239');oval(c,0,0,12,12,'#b99baf',true,1);oval(c,0,0,8,8,this.skyMetal||'#626078');oval(c,0,0,6,6,'#242239');}
    else{poly(c,[-23,-17,23,-17,23,19,-23,19],'#171527','#b392a1',1.5);c.fillStyle=open?'#ffc88e':'#66516b';c.fillRect(-18,-12,36,26);for(let y=-10;y<15;y+=6)line(c,[-17,y,17,y],'#282139',2);if(open){c.fillStyle='#171527';c.fillRect(-12,-11,24,23);bloom(c,0,14,21,'#ffb98a','rimFire',.6);}for(const x of [-20,20])for(const y of [-14,15])oval(c,x,y,.9,.9,'#dfb5a9');}
    this.skyModules.set(key,tile);return tile;
  }
  skyEnemy(e,t) {
    if(!['boxBomber','tailGunner','skyAce','foundry','foundryBay','drone'].includes(e.type))return false;
    if(hasSheet(S5_SKY))return this.skySpriteEnemy(e,t);
    const c=this.ctx;c.save();c.translate(e.x,e.y);c.rotate(e.angle||0);
    if(['boxBomber','skyAce','drone'].includes(e.type))c.rotate(Math.PI);
    if(e.type==='tailGunner'){
      c.drawImage(this.skyModule('tailGunner'),-32,-30);c.rotate((e.aim||0)-Math.PI/2);line(c,[-4,0,-4,21,4,21,4,0],'#d3b3ac',2);oval(c,0,0,4,4,'#f7cf9c');
    }else if(e.type==='foundryBay'){
      c.drawImage(this.skyModule('foundryBay',(e.launch??2)<.8),-32,-30);
    }else{
      const w=e.type==='foundry'?(e.w||110):80,h=e.type==='foundry'?(e.h||62):65;
      if(e.type==='skyAce')c.scale(1.2,1.2);
      if(e.type==='foundry'){const shadow=this.skyCloudShadow(w,h);c.drawImage(shadow,-shadow.width/2+6,-shadow.height/2+42);}
      c.drawImage(this.skyHull(e.type,w,h),-w-40,-h-40);
      if(e.type==='foundry'&&!this.reducedEffects)for(let i=0;i<4;i++)oval(c,-w*.6+i*42, -h-10-(t*14+i*9)%32,15,9,'rgba(45,31,54,.22)');
      if(e.type!=='drone')for(const side of [-1,1])oval(c,side*(e.type==='foundry'?w: e.type==='boxBomber'?65:40),0,2,2,side<0?'#ff6a77':'#92f6ba');
    }
    if(e.flash>0){c.globalAlpha=Math.min(1,e.flash*3);oval(c,0,0,18,12,'#fff0c7');}c.restore();return true;
  }
  // ---- Sector 5 painted sprites (act2-s5-skyforge / act2-halcyon). Render-only state:
  // per-id trackers below read the sim (x, fireAt, burstLeft, launch) and never write it.
  skyTrack(name,id,make) {
    const map=this[name] ||= new Map();let s=map.get(id);
    if(!s){if(map.size>160)for(const k of map.keys()){map.delete(k);if(map.size<=100)break;}map.set(id,s=make());}
    return s;
  }
  // Smoothed lateral velocity in -1..1, for a cheap bank squash.
  skyBank(e,t) {
    const s=this.skyTrack('skyMotion',e.id,()=>({x:e.x,t,roll:0}));
    const dt=t-s.t;
    if(dt<0||dt>.5){s.x=e.x;s.t=t;s.roll=0;return 0;}
    if(dt>0){s.roll+=(clamp((e.x-s.x)/dt/320,-1,1)-s.roll)*Math.min(1,dt*7);s.x=e.x;s.t=t;}
    return s.roll;
  }
  // 1 right after a shot (fireAt jumps or a burst round leaves), decaying over ~.13 s.
  skyShot(e) {
    const s=this.skyTrack('skyShots',e.id,()=>({fireAt:e.fireAt,burst:e.burstLeft,at:-9}));
    if((e.fireAt??0)>(s.fireAt??0)+.03||(e.burstLeft??0)<(s.burst??0))s.at=this.time;
    s.fireAt=e.fireAt;s.burst=e.burstLeft;
    return Math.max(clamp(1-(this.time-s.at)/.13,0,1),clamp(e.firePulse||0,0,1));
  }
  skyExhaust(c,key,t,id,k=1) {
    const spec=SKY_EXHAUSTS[key];if(!spec)return;
    c.save();c.globalCompositeOperation='lighter';
    spec.points.forEach(([x,y],i)=>{
      const flicker=.82+.18*Math.sin(t*37+i*2.1+id*1.7)*Math.sin(t*23+i);
      if(!this.reducedEffects)bloom(c,x,y+spec.r*.35,spec.r*flicker,'rgba(255,170,112,.55)','rimFire',.45*k*flicker);
      oval(c,x,y,spec.r*.22,spec.r*.12,'rgba(255,206,160,'+(.55*k*flicker).toFixed(2)+')');
    });
    c.restore();
  }
  skySpriteEnemy(e,t) {
    const c=this.ctx,type=e.type,id=e.id||0;
    c.save();c.translate(e.x,e.y);c.rotate(e.angle||0);
    if(type==='foundry'){
      const w=e.w||112,h=e.h||62,piece=e.large||e.foundryClass==='large'||w>=140?'foundry-large':'foundry-small';
      const shadow=this.skyCloudShadow(w,h);c.drawImage(shadow,-shadow.width/2+6,-shadow.height/2+42);
      drawPiece(c,piece,0,0);
      // A thin violet dusk wash keeps the pale hatch plates at mid value under bullets.
      drawPiece(c,piece,0,0,0,1,.2,{tint:'#1d1030'});
      this.skyExhaust(c,piece,t,id,.9);
      // Soot curls off the stacks and trails behind (up-screen) as the foundry descends.
      if(!this.reducedEffects)for(let i=0;i<6;i++){const q=((t*.45+i*.37)%1),x=(i%2?1:-1)*w*(.18+.22*(i>>1))+Math.sin(t*1.3+i)*3*q;oval(c,x,-h*.55-q*30,5+q*10,4+q*6,'rgba(40,28,50,'+(.3*(1-q)*Math.min(1,q*5)).toFixed(3)+')');}
      for(const side of SKY_SIDES)oval(c,side*(w+4),2,2,2,Math.sin(t*3.2+side)>-.3?(side<0?'#ff6a77':'#92f6ba'):'#3b2c40');
      if(e.flash>0)drawPiece(c,piece,0,0,0,1,Math.min(.32,e.flash*.4),'flash');
    }else if(type==='foundryBay'){
      this.skyBaySprite(e,t);
    }else if(type==='tailGunner'){
      const shot=this.skyShot(e),kick=shot*3;
      drawPiece(c,'tail-gunner-base',0,0);
      c.rotate((e.aim??Math.PI/2)+Math.PI/2-(e.angle||0));
      c.save();c.translate(1.5,2.5);drawPiece(c,'tail-gunner-head',0,0,0,1,.45,{tint:'#0b0716'});c.restore();
      drawPiece(c,'tail-gunner-head',0,kick);
      if(e.flash>0)drawPiece(c,'tail-gunner-head',0,kick,0,1,Math.min(.45,e.flash*.45),'flash');
      if(shot>.05)for(const x of [-3,3])this.skyMuzzle(c,x,-28+kick,shot,t+x,false);
    }else{
      // boxBomber, skyAce, drone: painted nose UP.
      c.rotate(Math.PI);
      const bank=type==='drone'?0:this.skyBank(e,t),k=SKY_CRAFT_SCALE[type]||1,piece=type==='boxBomber'?'box-bomber':type==='skyAce'?'sky-ace':'drone';
      // Banking reads as a roll: the wings foreshorten and the hull slides toward the turn.
      const squash=1-Math.abs(bank)*(type==='skyAce'?.2:.1);
      c.scale(k*squash,k);
      this.skyExhaust(c,type,t,id,1);
      drawPiece(c,piece,0,0);
      if(type==='drone'){const spin=t*9+id;for(const [x,y] of SKY_EXHAUSTS.drone.points)oval(c,x,y,4.6,4.6*Math.abs(Math.cos(spin+x)),'rgba(20,14,30,.35)');}
      if(e.flash>0)drawPiece(c,piece,0,0,0,1,Math.min(.45,e.flash*.45),'flash');
      c.scale(1/(k*squash),1/k);
      if(type!=='drone')for(const side of SKY_SIDES){
        const x=side*(type==='boxBomber'?67:36)*k*squash,y=type==='boxBomber'?4:14;
        oval(c,x,y,1.8,1.8,Math.sin(t*4+side+id)>-.4?(side<0?'#ff6a77':'#92f6ba'):'#3b2c40');
      }
    }
    c.restore();return true;
  }
  skyMuzzle(c,x,y,shot,seed,violet) {
    c.save();c.translate(x,y);
    if(!this.reducedEffects)bloom(c,0,-3,violet?10:7,violet?'rgba(215,163,255,.55)':'rgba(255,178,116,.5)',violet?'rimViolet':'rimFire',.55*shot);
    c.globalAlpha*=shot;const len=5+shot*6+hash(seed*7.3)*3;
    poly(c,[-2.6,0,-1.1,-len*.55,0,-len,1.1,-len*.55,2.6,0],violet?'#b77ee6':'#e98a4c');
    poly(c,[-1.3,0,0,-len*.6,1.3,0],violet?'#f2dcff':'#fff0b4');
    c.restore();
  }
  // Bay doors: shut, then a hard snap open (crossfade + scale pop) in the last beat
  // before a launch, a lit throat while open, and a smoke puff as the drones leave.
  skyBaySprite(e,t) {
    const c=this.ctx,id=e.id||0,open=clamp(e.open??((e.launch??2)<.8?1:0),0,1);
    const s=this.skyTrack('skyBays',id,()=>({launch:e.launch,puff:-9}));
    if((e.launch??0)>(s.launch??0)+.2)s.puff=this.time;
    s.launch=e.launch;
    const q=clamp((open-.5)/.3,0,1),pop=1+.09*Math.sin(Math.PI*q),strain=open>.05&&q<1?open:0;
    c.save();
    if(strain&&!this.reducedEffects)c.translate(Math.sin(t*95+id)*.7*strain,0);
    if(q<1)drawPiece(c,'bay-closed',0,0,0,1,1-q*q);
    if(q>0)drawPiece(c,'bay-open',0,0,0,pop,q);
    // Seam heat as the latches strain, then the furnace throat.
    if(strain&&q<.5)line(c,[-11,1,11,1],'rgba(255,190,130,'+(.6*strain).toFixed(2)+')',1.4);
    if(q>0){
      const flicker=.85+.15*Math.sin(t*29+id);
      c.save();c.globalCompositeOperation='lighter';
      if(!this.reducedEffects)bloom(c,0,10,13+4*q,'rgba(255,150,96,.45)','rimFire',.32*q*flicker);
      const g=c.createLinearGradient(0,-9,0,12);g.addColorStop(0,'rgba(255,120,80,0)');g.addColorStop(1,'rgba(255,128,84,'+(.3*q*flicker).toFixed(2)+')');
      c.fillStyle=g;c.fillRect(-8*pop,-9,16*pop,21);c.restore();
    }
    if(e.flash>0)drawPiece(c,'bay-closed',0,0,0,1,Math.min(.4,e.flash*.45),'flash');
    c.restore();
    const age=this.time-s.puff;
    if(age>=0&&age<.6){
      const p=age/.6;
      if(!this.reducedEffects)for(let i=0;i<3;i++)oval(c,(i-1)*9*(1+p),14+p*22+i%2*4,7+p*12,5+p*8,'rgba(48,34,58,'+(.42*(1-p)).toFixed(3)+')');
      oval(c,0,12+p*8,8+p*20,3+p*6,'rgba(255,205,150,'+(.34*(1-p)).toFixed(3)+')',true,1.2);
    }
  }
  // Foundry void battery (hullTurret gun 'void' in sector 5): sky livery, barrels UP.
  skyTurretSprite(e,t) {
    const c=this.ctx,id=e.id||0,rot=(e.aim??Math.PI/2)+Math.PI/2,shot=this.skyShot(e),kick=shot*3.5;
    c.save();c.translate(2,4);c.rotate(rot);drawPiece(c,'sky-turret-head-void',0,0,0,1,.5,{tint:'#0b0716'});c.restore();
    drawPiece(c,'sky-turret-base',0,0);
    c.save();c.rotate(rot);drawPiece(c,'sky-turret-head-void',0,kick);
    const charge=clamp(1-((e.fireAt??0)-(e.age??0))/.7,0,1),pulse=.75+.25*Math.sin(t*6+id);
    c.save();c.globalCompositeOperation='lighter';
    if(!this.reducedEffects)bloom(c,0,-6+kick,8+charge*7,'rgba(215,163,255,.6)','rimViolet',(.15+.35*charge)*pulse);
    oval(c,0,-6+kick,1.8,5,'rgba(220,170,255,'+(.2+.4*charge).toFixed(2)+')');c.restore();
    if(e.flash>0)drawPiece(c,'sky-turret-head-void',0,kick,0,1,Math.min(.45,e.flash*.45),'flash');
    if(shot>.05)this.skyMuzzle(c,0,-36+kick,shot,t+id,true);
    c.restore();
  }
  halcyonSprite(b,t) {
    const c=this.ctx,w=b.w||220,h=b.h||70,ratio=b.hp/b.maxHp;
    const s=this.skyTrack('skyBossState',b.id??'halcyon',()=>({phase:b.phase||1,emit:b.phase>=2?-9:null,eye:b.phase>=3?-9:null}));
    if(b.phase>=2&&s.emit===null)s.emit=this.time;
    if(b.phase>=3&&s.eye===null)s.eye=this.time;
    if(b.phase>=3){bloom(c,b.x,b.y,92,'#d9a1e0','rimViolet',.4);oval(c,b.x,b.y,56,56,'rgba(20,10,40,.8)');}
    c.save();c.translate(b.x,b.y);c.rotate(b.angle||0);
    c.save();c.translate(0,60);c.scale(1.1,1.1);const shadow=this.skyCloudShadow(w,h);c.drawImage(shadow,-shadow.width/2,-shadow.height/2);c.restore();
    if(!this.reducedEffects){
      const points=this.skyStreakLine ||= [0,0,0,0];
      for(const side of SKY_SIDES)for(let i=0;i<12;i++){
        points[0]=side*(w-4);points[1]=i*10-12;points[2]=points[0]+Math.sin(t+i*.3)*3;points[3]=i*10-1;
        line(c,points,HALCYON_STREAK_COLORS[i],3+i*.25);
      }
    }
    drawPiece(c,'halcyon-hull',0,0);
    c.save();c.globalCompositeOperation='lighter';
    HALCYON_NOZZLES.forEach((x,i)=>{
      const f=.8+.2*Math.sin(t*31+i*1.9)*Math.sin(t*17+i);
      if(!this.reducedEffects)bloom(c,x,62,19*f,'rgba(255,170,112,.55)','rimFire',.6*f);
      oval(c,x,58,7,2.4,'rgba(255,200,150,'+(.5*f).toFixed(2)+')');
    });
    c.restore();
    for(let i=0;i<3;i++)if(!this.skyBayLife[i]){const x=HALCYON_BAY_X[i];drawPiece(c,'bay-dead',x,HALCYON_BAY_Y[i]);this.skyFire(c,x,HALCYON_BAY_Y[i]+2,t+i,15);}
    if(ratio<.66)for(const side of SKY_SIDES)this.skyFire(c,side*143,8,t+side,18);
    if(ratio<.33)for(const side of SKY_SIDES){const pts=[side*36,-22,side*68,-5,side*59,13,side*103,27];line(c,pts,'rgba(20,10,28,.85)',4);line(c,pts,'rgba(255,170,140,'+(.45+.25*Math.sin(t*9+side)).toFixed(2)+')',1);}
    // Lattice emitters deploy one by one, sliding up out of their mounts.
    if(b.phase>=2)for(const side of SKY_SIDES)for(let i=0;i<5;i++){
      const x=side*(45+i*32),y=-h+14+i*8,a=clamp((this.time-s.emit-i*.07-(side>0?.035:0))/.35,0,1);
      if(a<=0)continue;
      const ease=1+2.2*Math.pow(a-1,3)+1.2*Math.pow(a-1,2);
      drawPiece(c,'lattice-emitter',x,y+(1-a)*7,0,Math.max(.01,ease),Math.min(1,a*2));
      if(this.skyLaserWarning){bloom(c,x,y-2,17,'#d9a1e0','rimViolet',.7);oval(c,x,y-3,1.8,2.6,'#fff3ef');}
    }
    for(const side of SKY_SIDES)oval(c,side*(w-6),-13,2.5,2.5,Math.sin(t*4+side)>0?(side<0?'#ff7888':'#9effc5'):'#49394f');
    // The eye: shut through phases 1-2; in phase 3 it irises open, the tick ring spins
    // up, and the pupil dilates as the next void row / EMP comes due.
    const opened=b.phase>=3?clamp((this.time-s.eye)/.6,0,1):0;
    if(opened<1)drawPiece(c,'eye-closed',0,0,0,1,1-opened);
    if(opened>0){
      const charge=clamp(1-(Math.min(b.rowAt??Infinity,b.empAt??Infinity)-(b.age??0))/1.2,0,1);
      drawPiece(c,'eye-open',0,0,0,1,opened);
      oval(c,0,0,(5+charge*9)*opened,(5+charge*9)*opened,'rgba(8,6,20,.9)');
      c.save();c.globalCompositeOperation='lighter';
      bloom(c,0,0,14+charge*12,'rgba(217,161,224,.6)','rimViolet',(.25+.45*charge)*opened);
      oval(c,0,0,(5+charge*9)*opened,(5+charge*9)*opened,'rgba(230,180,255,'+(.25+.4*charge).toFixed(2)+')',true,1.2);c.restore();
      drawPiece(c,'eye-ring',0,0,t*.3+(1-opened)*1.5,.75+.25*opened,opened);
    }
    if(b.flash>0)drawPiece(c,'halcyon-hull',0,0,0,1,Math.min(.22,b.flash*.25),'flash');
    c.restore();
  }
  foundrySilhouettes(p,enemies,t) {
    if(!p||p.dead||p.alive===false)return;
    const c=this.ctx,ship=p.shipId||'kestrel';
    // Test each craft independently so a covered escort remains readable too.
    for(let i=-1;i<(p.escortSlots?.length||0);i++){
      const craft=i<0?p:p.escortSlots[i],radius=i<0?50:20;
      let covered=false;
      for(const e of enemies){
        if(e.type!=='foundry'||e.dead)continue;
        const dx=craft.x-e.x,dy=craft.y-e.y,a=e.angle||0;
        const x=dx*Math.cos(a)+dy*Math.sin(a),y=dy*Math.cos(a)-dx*Math.sin(a);
        if(Math.abs(x)<(e.w||110)+12+radius&&Math.abs(y)<(e.h||62)+radius){covered=true;break;}
      }
      if(!covered)continue;
      c.save();c.globalAlpha=.55;c.translate(craft.x,craft.y);
      const roll=i<0&&p.roll>0?(1-p.roll/(p.rollCharged?.34:.25))*TAU*(p.rollX>=0?1:-1):0;
      c.rotate(roll+(p.bank||0)*(i<0?.1:.13)+(i<0?0:Math.sin(t*3+(craft.rank||0))*.025));
      if(i<0)c.scale(1-Math.abs(p.bank||0)*.12,1);
      drawCraft(c,ship,0,0,i<0?(ship==='manta'?100:88):(ship==='manta'?39:34),i<0?92:36,true);
      c.restore();
    }
  }
  halcyon(b,t) {
    if(!b)return;const c=this.ctx,w=b.w||220,h=b.h||70;
    const bayLife=this.skyBayLife ||= [false,false,false];bayLife.fill(false);
    for(const e of this.skyEnemies||[]){
      if(e.dead||e.hp<=0||!b.bays?.includes(e.id))continue;
      const x=e.ox??e.x-b.x;
      for(let i=0;i<3;i++)if(Math.abs(x-HALCYON_BAY_X[i])<45)bayLife[i]=true;
    }
    if(hasSheet(S5_BOSS))return this.halcyonSprite(b,t);
    if(b.phase>=3){bloom(c,b.x,b.y,92,'#d9a1e0','rimViolet',.4);oval(c,b.x,b.y,56,56,'rgba(20,10,40,.8)');}
    c.save();c.translate(b.x,b.y);c.rotate(b.angle||0);
    c.save();c.translate(0,60);c.scale(1.1,1.1);const shadow=this.skyCloudShadow(w,h);c.drawImage(shadow,-shadow.width/2,-shadow.height/2);c.restore();
    if(!this.reducedEffects){
      const points=this.skyStreakLine ||= [0,0,0,0];
      for(const side of SKY_SIDES)for(let i=0;i<12;i++){
        points[0]=side*(w-4);points[1]=i*10;points[2]=points[0]+Math.sin(t+i*.3)*3;points[3]=i*10+11;
        line(c,points,HALCYON_STREAK_COLORS[i],3+i*.25);
      }
    }
    c.drawImage(this.skyHull('halcyon',w,h),-w-40,-h-40);
    for(let i=0;i<3;i++){const x=(i-1)*150;if(!this.skyBayLife[i]){poly(c,[x-25,6,x+23,8,x+19,37,x-23,37],'#0b0d1c','#49334c',1);this.skyFire(c,x,28,t+i,22);}}
    if(b.hp/b.maxHp<.66)for(const side of SKY_SIDES)this.skyFire(c,side*143,8,t+side,18);
    if(b.hp/b.maxHp<.33)for(const side of SKY_SIDES){line(c,[side*36,-22,side*68,-5,side*59,13,side*103,27],'#8e527b',4);line(c,[side*36,-22,side*68,-5,side*59,13,side*103,27],'#ffc3e4',1);}
    if(b.phase>=2)for(const side of SKY_SIDES)for(let i=0;i<5;i++){const x=side*(45+i*32),y=-h+14+i*8;poly(c,[x-5,y,x,y-9,x+5,y,x,y+6],'#29233e','#c59ac8',1);if(this.skyLaserWarning){bloom(c,x,y,17,'#d9a1e0','rimViolet',.7);oval(c,x,y,2,3,'#fff3ef');}}
    for(const side of SKY_SIDES)oval(c,side*(w-4),14,2.5,2.5,Math.sin(t*4+side)>0?(side<0?'#ff7888':'#9effc5'):'#49394f');
    if(b.phase>=3){oval(c,0,0,32,32,'#eeb2d9');oval(c,0,0,25,25,'#090f23');oval(c,0,0,12,12,'#fff0c0',true,2);for(let i=0;i<8;i++){const a=i*TAU/8+t*.3;line(c,[Math.cos(a)*34,Math.sin(a)*34,Math.cos(a)*43,Math.sin(a)*43],'#d9a1e0',2);}}
    c.restore();
  }
  skyFire(c,x,y,t,r=25) {
    if(!this.reducedEffects)for(let j=0;j<4;j++)oval(c,x+Math.sin(j+t)*6,y-j*14-8,8+j*4,12+j*5,'rgba(27,22,39,.3)');
    c.save();c.globalCompositeOperation='lighter';bloom(c,x,y,r*(.85+Math.sin(t*19)*.15),'#ffb98a','rimFire',.8);bloom(c,x,y-3,r*.45,'#fff0bd','coreFire',.8);c.restore();
  }
  skyHazards(game,t) {
    const c=this.ctx;c.save();
    for(const f of this.impacts){
      if(f.sky){
        const p=f.age/f.life,fade=1-p;c.save();c.globalAlpha=fade;
        if(f.type==='foundryDown'||f.type==='bayDown'){
          const big=f.type==='foundryDown';for(let i=0;i<(big?7:3);i++){const age=f.age-i*.16;if(age<0||age>.8)continue;this.skyFire(c,f.x+Math.sin(i*7)* (big?65:14),f.y+Math.cos(i*5)*22,age+i,(big?42:22)*(1+age));}
          oval(c,f.x,f.y,12+p*(big?140:50),6+p*40,'rgba(255,205,142,'+fade*.7+')',true,2);
        }else if(f.type==='empPulse'){bloom(c,f.x,f.y,85,'#d9a1e0','rimViolet',fade*.6);}
        else oval(c,f.x,f.y,8+p*32,4+p*12,'rgba(255,211,174,'+fade*.4+')',true,1);
        c.restore();
      }else if(f.type==='boxEnter'){
        const y=game.player?.empTime>=.05&&game.player?.escorts>0?815:845;c.fillStyle='rgba(22,15,36,.48)';c.fillRect(80,y-14,380,27);
        for(const x of [95,135,405,445])line(c,[x-8,y+4,x,y-5,x+8,y+4],'#ffd09e',2);
        c.fillStyle='#ffe0b5';c.font='800 15px Arial';c.textAlign='center';c.fillText(f.value==='dive'?'BOMBER DIVE':'BOMBERS CLIMBING',270,y+5);
      }else if(f.type==='wingBreak'){
        const p=f.age/f.life,w=f.w,h=f.h,tile=hasSheet(S5_BOSS)?null:this.skyHull('halcyon',w,h);
        // Keep the first breakup beat above the title, then plunge into cloud.
        const early=Math.min(f.age/1.5,1),late=Math.max(0,(f.age-1.5)/(f.life-1.5));
        const breakupY=clamp(f.y,180,200)+early*early*65+late*late*310;
        for(let piece=-1;piece<=1;piece++){
          c.save();const drift=piece*(early*65+late*45),fall=piece===0?late*late*45:0;c.translate(f.x+drift,breakupY+fall);c.rotate(f.angle+piece*(early*.28+late*.62));c.globalAlpha=p>.86?(1-p)/.14:1;
          c.beginPath();c.rect(piece<0?-w-40:piece===0?-48:48,-h-40,piece===0?96:w,h*2+100);c.clip();if(!drawPiece(c,'halcyon-broken',0,0))c.drawImage(tile,-w-40,-h-40);c.restore();
          for(let j=0;j<3;j++)this.skyFire(c,f.x+drift+piece*(65+j*35),breakupY+fall-j*13,f.age+j,23+j*4);
        }
        // Timed secondary detonations retain the full skin for more than two seconds.
        const beat=Math.floor(f.age/.3),blast=(f.age% .3)/.3;
        if(p<.88){c.save();c.globalAlpha=1-blast;this.skyFire(c,f.x+Math.sin(beat*13)*150,breakupY,f.age,25+blast*38);c.restore();}
        if(p>.75){const q=(p-.75)/.25;c.save();c.globalAlpha=1-q;oval(c,f.x,560,40+q*210,10+q*38,'#d9a1e0',true,8*(1-q)+1);bloom(c,f.x,555,90,'#d9a1e0','rimViolet',1-q);c.restore();}
      }
    }
    for(const h of game.hazards||[]){
      if(h.state==='off')continue;
      const col=h.void?'#e3a5ff':'#ffc796';
      if(h.kind==='flakBand'||h.type==='flakBand'){
        const gaps=h.gaps||[],half=(h.gapW||90)/2;
        const under=new Path2D(),dashes=new Path2D();for(let x=0;x<W;x+=12){let gap=false;for(let i=0;i<gaps.length;i++)if(Math.abs(x-gaps[i])<half){gap=true;break;}if(!gap){under.moveTo(x,h.y);under.lineTo(x+7,h.y);dashes.moveTo(x,h.y);dashes.lineTo(x+7,h.y);}}c.strokeStyle='#231a35';c.lineWidth=6;c.stroke(under);c.strokeStyle=h.state==='burst'?'#fff0bd':col;c.lineWidth=h.state==='burst'?5:2;c.stroke(dashes);
        for(const x of gaps){line(c,[x-half+9,h.y-10,x-half,h.y-10,x-half,h.y+10,x-half+9,h.y+10],'#c4fff1',3);line(c,[x+half-9,h.y-10,x+half,h.y-10,x+half,h.y+10,x+half-9,h.y+10],'#c4fff1',3);}
      }else if((h.kind==='laser'||h.type==='laser')&&h.rotating){
        const x=h.pivotX??h.x,y=h.pivotY??h.y,a=h.angle||0,warn=h.state==='warn';
        c.save();c.translate(x,y);c.rotate(a-Math.PI/2);oval(c,0,0,12,12,'#13263e','#b5f7ff');
        if(warn){c.strokeStyle='rgba(190,159,255,.55)';c.lineWidth=2;c.beginPath();c.arc(0,0,80,Math.PI/2-.35,Math.PI/2+.35);c.stroke();c.setLineDash([9,9]);}
        line(c,[0,0,0,1100],warn?'rgba(203,176,255,.55)':'rgba(141,124,255,.35)',warn?2:(h.width||16)*2);
        if(!warn)line(c,[0,0,0,1100],'#e7faff',3);c.restore();
      }else if(h.kind==='laser'||h.type==='laser'){
        const v=h.orient==='v',a=h.from??0,b=h.to??(v?H:W),pts=v?[h.pos,a,h.pos,b]:[a,h.pos,b,h.pos],fire=h.state==='fire';
        line(c,pts,'#21142f',fire?22:5);c.setLineDash(fire?[]:[8,6]);line(c,pts,h.void?'#f1c5ff':col,fire?14:3);c.setLineDash([]);if(fire)line(c,pts,'#fff9f5',3+Math.sin(t*43));
        for(const end of [a,b]){const x=v?h.pos:end,y=v?end:h.pos;oval(c,x,y,8,8,'#20152e',false);oval(c,x,y,fire?10:5,fire?10:5,col,true,2);if(fire)bloom(c,x,y,22,col,'coreViolet',.7);}
      }else if(h.kind==='emp'||h.type==='emp'){
        const pulse=h.state==='pulse',r=Math.max(8,h.r||35);oval(c,h.x,h.y,r,r,'#261733',true,7);oval(c,h.x,h.y,r,r,pulse?'#f5d4ff':'#cfa3f2',true,pulse?5:3);
        c.fillStyle='#f2d5ff';c.font='800 15px Arial';c.textAlign='center';c.strokeStyle='#251a37';c.lineWidth=3;const label=pulse?'EMP PULSE':'EMP CHARGE';c.strokeText(label,h.x,h.y-r-12);c.fillText(label,h.x,h.y-r-12);
      }
    }c.restore();
  }
  zeroRound(kind,r) {
    const ship=this.playerPoint?.shipId||'kestrel';
    if(this.zeroRoundShip!==ship){this.zeroRounds=Object.create(null);this.zeroRoundShip=ship;}
    const cache=this.zeroRounds[kind] ||= [],radius=Math.round(r);
    if(cache[radius])return cache[radius];
    const tile=surface(40,40),c=tile.getContext('2d');c.translate(20,20);
    const col=this.playerPoint?.shipId==='manta'?'#ffbe84':this.playerPoint?.shipId==='wraith'?'#bca7ff':'#8cffe0';
    if(kind==='shard'){
      poly(c,[0,-11,6,-2,3,9,-5,4,-6,-3],'#31547b','#9feaff',1.5);
      poly(c,[0,-11,1,1,6,-2],'#e3fcff');line(c,[1,1,3,9,-5,4],'#c4acff',1);
      line(c,[-9,-6,-9,-10,-5,-10],'#83b5d6',1);
    }else{poly(c,[0,-12,7,0,0,12,-7,0],'#160e2c','#171326',3);poly(c,[0,-9,4,0,0,9,-4,0],'#9057b8',col,1.5);poly(c,[0,-5,2,0,0,5,-2,0],'#fff1d4');line(c,[-7,-3,-7,3],'#e59dff',1);}
    cache[radius]=tile;return tile;
  }
  zeroHull(type,w,h,ship='kestrel') {
    this.zeroSprites ||= Object.create(null);
    const cache=this.zeroSprites[type] ||= Object.create(null),byShip=cache[ship] ||= [],byWidth=byShip[w] ||= [];
    if(byWidth[h])return byWidth[h];
    const tile=surface(w*2+40,h*2+40),c=tile.getContext('2d');c.translate(w+20,h+20);
    const metal=c.createLinearGradient(-w,-h,w,h);for(const [n,col] of [[0,'#d8f6f7'],[.16,'#637f9c'],[.3,'#172b47'],[.48,'#9f8abc'],[.51,'#d5e8ed'],[.6,'#385269'],[1,'#101e37']])metal.addColorStop(n,col);
    if(type==='echo'||type==='mirrorEscort'){
      c.rotate(Math.PI);drawCraft(c,ship,0,0,w*2,h*2,true);
      c.globalCompositeOperation='source-atop';c.fillStyle=type==='echo'?'rgba(110,116,225,.82)':'rgba(122,161,255,.6)';c.fillRect(-w,-h,w*2,h*2);c.globalCompositeOperation='source-over';
      if(type==='echo'){poly(c,[0,-h*.3,9,0,0,h*.35,-9,0],'#17102c','#b49aff',2);oval(c,0,2,4,8,'#ff81d0');line(c,[-w*.6,6,-w*.3,12],'#91efff',2);line(c,[w*.6,6,w*.3,12],'#91efff',2);}
    }else if(type==='station'){
      c.scale(1,h/w);c.beginPath();c.arc(0,0,w,0,TAU);c.arc(0,0,w*.58,0,TAU,true);c.fillStyle=metal;c.fill();c.strokeStyle='#8aa7c2';c.lineWidth=3;c.stroke();
      for(let i=0;i<24;i++){const a=i*TAU/24;c.save();c.rotate(a);poly(c,[w*.62,-4,w*.95,-9,w*.95,9,w*.62,4],i%3?'#233b55':'#718496','#a1c5d1',.7);c.restore();}
      for(let i=0;i<6;i++){c.save();c.rotate(i*TAU/6);poly(c,[w*.16,-7,w*.65,-4,w*.65,4,w*.16,7],metal,'#8aa7c2',1);c.restore();}
      oval(c,0,0,w*.25,w*.25,'#101a31','#9ebacb',3);oval(c,0,0,w*.18,w*.18,'#263958','#64779e',2);oval(c,-4,-4,w*.115,w*.115,'#0d1a32','#bdacff',2);oval(c,-7,-8,w*.06,w*.06,'#9ccfe4');oval(c,-10,-12,w*.022,w*.022,'#efffff');
      for(let i=0;i<12;i++){const a=i*TAU/12;oval(c,Math.cos(a)*w*.21,Math.sin(a)*w*.21,2,2,i%3?'#5b738f':'#d7bcff');}
    }else if(type==='satellite'){
      for(const side of [-1,1]){c.fillStyle='#526779';c.fillRect(side<0?-w:9,-3,w-9,6);for(let i=0;i<4;i++)for(let j=0;j<3;j++){c.fillStyle=(i+j)%2?'#263b70':'#425984';c.fillRect(side*(15+i*8)-3,-h+j*12,7,10);}}
      poly(c,[-12,-18,10,-18,16,10,0,22,-16,10],metal,'#bfdde6',1.5);oval(c,0,0,9,9,'#172340');oval(c,0,0,5,5,'#ccedff');
    }else if(type==='stationTurret'){
      poly(c,[-17,-10,0,-19,17,-10,17,12,0,19,-17,12],metal,'#a9c6dc',2);oval(c,0,0,12,12,'#10172c','#c1cee4',1);oval(c,0,-2,8,8,'#4a557d','#8ca6cf',1);oval(c,-2,-4,4,4,'#ceafff');oval(c,-3,-6,1.5,1.5,'#f1ffff');for(const side of [-1,1]){line(c,[side*12,-7,side*12,8],'#18233d',3);oval(c,side*12,-8,1.5,1.5,'#adc9d5');}c.fillStyle='#a5c3d7';c.fillRect(-4,0,8,25);c.fillStyle='#efffff';c.fillRect(-2,20,4,3);
    }else{
      poly(c,[-w,-h*.15,-w*.72,-h*.85,-w*.25,-h*.55,0,-h,w*.25,-h*.55,w*.72,-h*.85,w,-h*.15,w*.75,h*.7,w*.25,h*.45,0,h,-w*.25,h*.45,-w*.75,h*.7],metal,'#bdd7df',2);
      for(const side of [-1,1])for(let i=0;i<6;i++){
        const x=side*(26+i*25);poly(c,[x,-h*.4,x+side*20,-h*.65,x+side*28,h*.25,x+side*5,h*.48],i%2?'#263c56':metal,'#a1b2d0',.8);
        line(c,[x,0,x+side*16,4],'#b9e9ec',1);oval(c,x,h*.4,2,2,'#c4aeff');
        for(let j=0;j<5;j++){const y=-h*.22+j*5;line(c,[x+side*5,y,x+side*15,y+2],j%2?'#0c1d33':'#577387',1);}
        for(const y of [-h*.3,h*.29]){oval(c,x+side*5,y,1.3,1.3,'#dae5ea');oval(c,x+side*18,y+3,1,1,'#99b7c9');}
        poly(c,[x+side*7,-h*.42,x+side*16,-h*.5,x+side*18,-h*.34,x+side*10,-h*.29],'#101f38','#718fa8',.6);
      }
      poly(c,[0,-h*.8,24,0,0,h*.85,-24,0],'#182a47','#b8eeec',2);poly(c,[0,-25,10,0,0,25,-10,0],'#b4e8ed','#fff7e4',1);
    }
    byWidth[h]=tile;return tile;
  }
  zeroEnemy(e,t) {
    if(!ZERO_ENEMIES.has(e.type))return false;
    const c=this.ctx,b=this.fleetBoss;
    if(e.type==='tether'){
      line(c,[e.x,e.y,b?.x??270,b?.y??180],'rgba(167,199,255,.48)',3);
      if(hasSheet(S6_GATE)&&this.zeroPainted('tether-node'))this.tetherSprite(e,t);
      else{oval(c,e.x,e.y,12,12,'#132940');oval(c,e.x,e.y,12,12,'#b6f9ff',true,2);}
      const glyph=PICKUP_THEMES[e.carrying?.type]?.[0]||'S';c.fillStyle='#fff0ac';c.font='bold 13px monospace';c.textAlign='center';c.fillText(glyph,e.x,e.y+5);return true;
    }
    if(hasSheet(S6_GATE)&&(e.type==='station'||e.type==='stationTurret'||e.type==='satellite')){this.meridianSprite(e,t);return true;}
    const w=e.w||(e.type==='station'?180:e.type==='satellite'?52:e.type==='stationTurret'?23:e.type==='mirrorEscort'?19:34),h=e.h||(e.type==='station'?90:e.type==='satellite'?28:e.type==='stationTurret'?28:e.type==='mirrorEscort'?20:36);
    const tile=this.zeroHull(e.type,w,h,e.type==='echo'?(e.ship||ECHO_SHIPS[e.style]||'kestrel'):(e.ship||e.style||'kestrel'));
    if(e.type==='echo'){
      this.echoPaths ||= new Map();let path=this.echoPaths.get(e.id??e);
      if(!path){path={x:new Float32Array(20),y:new Float32Array(20),n:0};this.echoPaths.set(e.id??e,path);}
      path.x[path.n%20]=e.x;path.y[path.n%20]=e.y;path.n++;
      c.save();for(let i=15;i>0;i-=5){if(path.n<=i)continue;const k=(path.n-1-i)%20;c.globalAlpha=.035*(4-i/5);c.save();c.translate(path.x[k],path.y[k]);c.rotate(e.angle||0);c.drawImage(tile,-w-20,-h-20);c.restore();}c.restore();
      if(this.echoPaths.size>40)for(const id of this.echoPaths.keys()){if(!this.fleetEnemies.some(e=>(e.id??e)===id))this.echoPaths.delete(id);}
    }
    c.save();c.translate(e.x,e.y);c.rotate(e.angle||0);
    if(e.type==='echo'){const material=e.phasing?clamp((e.age||0)/.8,0,1):1;c.globalAlpha=.25+material*.6;if(e.phasing){oval(c,0,0,w*(1.4-material*.3),h*(1.1-material*.3),'#bba4ff',true,1.5);line(c,[-w, h*(1-material*2),w,h*(1-material*2)],'#c4f5ff',2);}}
    c.drawImage(tile,-w-20,-h-20);
    if(e.type==='satellite'){c.rotate(t*.6);line(c,[0,0,0,23],'#e6dbff',4);}
    if(e.flash>0){c.globalAlpha=.6;oval(c,0,0,12,12,'#fffaff');}c.restore();return true;
  }
  zeroPod(type) {
    this.zeroPods ||= Object.create(null);if(this.zeroPods[type])return this.zeroPods[type];
    const tile=surface(48,64),c=tile.getContext('2d');c.translate(24,25);
    const metal=c.createLinearGradient(-18,0,18,0);metal.addColorStop(0,'#1a2540');metal.addColorStop(.4,'#91a6c2');metal.addColorStop(.55,'#cad4e4');metal.addColorStop(1,'#293452');
    poly(c,[-17,-18,12,-18,19,-5,15,21,-15,21,-20,-6],metal,'#bd9cd2',1.5);
    if(type==='power'){for(const x of [-8,0,8]){c.fillStyle='#1a1c32';c.fillRect(x-3,0,6,30);oval(c,x,29,2,3,'#ffb8e6');}}
    else if(type==='escort'){for(const x of [-12,12]){poly(c,[x-5,-8,x+5,-8,x+7,28,x-7,28],'#23334e','#9ea7e2',1);oval(c,x,23,3,4,'#b1f5ff');}oval(c,0,-5,4,6,'#d8aeff');}
    else if(type==='sidewinder'){for(const x of [-9,9]){poly(c,[x-6,-11,x+6,-11,x+6,17,x,29,x-6,17],'#243149','#afa9d6',1);line(c,[x-3,10,x+3,10],'#ffb881',3);}}
    else{poly(c,[-12,0,0,-13,12,0,0,31],'#384368','#b9dfff',2);poly(c,[0,-7,6,4,0,23,-6,4],'#c6c2ff');}
    for(const x of [-14,14])oval(c,x,-13,1.5,1.5,'#f0e2ff');
    this.zeroPods[type]=tile;return tile;
  }
  // ---- Sector 6 painted pieces ------------------------------------------------
  // Optional cells may be left blank on the sheet: test once whether one has paint.
  zeroPainted(id) {
    this.zeroPaint ||= new Map();
    if(this.zeroPaint.has(id))return this.zeroPaint.get(id);
    if(!skyArt.hasPiece(id))return false;
    const canvas=skyArt.pieceCanvas(id,{logical:true});let painted=true;
    try{const d=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;painted=false;
      for(let i=3;i<d.length;i+=4)if(d[i]>40){painted=true;break;}}catch{}
    this.zeroPaint.set(id,painted);return painted;
  }
  // A pale band of light that sweeps across a piece every `period` s (mirror chrome).
  // Kept faint: S6 chrome must stay darker than the shard rounds.
  zeroGlint(c,id,t,period,span,alpha=.13,offset=0) {
    const k=((t+offset)%period)/1.3;if(k>=1)return;
    const x=-span+k*span*2,fade=Math.sin(k*Math.PI);
    c.save();c.beginPath();c.moveTo(x-14,-200);c.lineTo(x+22,-200);c.lineTo(x-38,200);c.lineTo(x-74,200);c.closePath();c.clip();
    c.globalCompositeOperation='lighter';drawPiece(c,id,0,0,0,1,alpha*fade,{tint:'#cfe4ff'});c.restore();
  }
  // Recent shot (1 -> 0 over `span` s) of a gun, from its sim fire clock.
  zeroShot(key,clock,t,span=.14) {
    this.zeroShots ||= new Map();this.zeroClocks ||= new Map();
    const prior=this.zeroClocks.get(key);
    if(prior!==undefined&&clock>prior+.03)this.zeroShots.set(key,t);
    this.zeroClocks.set(key,clock);
    if(this.zeroClocks.size>120){this.zeroClocks.clear();this.zeroShots.clear();}
    const at=this.zeroShots.get(key);
    return at===undefined?0:clamp(1-(t-at)/span,0,1);
  }
  meridianSprite(e,t) {
    const c=this.ctx;c.save();c.translate(e.x,e.y);
    if(e.type==='station')this.gateSprite(e,t);
    else if(e.type==='stationTurret')this.gateTurretSprite(e,t);
    else this.satelliteSprite(e,t);
    c.restore();
  }
  // The Meridian Gate: ring, a counter-spinning hub that spins up on arrival and a
  // core lamp that dims as its guns fall. Dead guns stay on the ring as wrecks.
  gateSprite(e,t) {
    const c=this.ctx,age=e.age||0;
    this.fleetPieceShadow(c,'gate-ring',0,0,.45);
    drawPiece(c,'gate-ring',0,0);
    this.zeroGlint(c,'gate-ring',age<1.6?age+5.4:t,7,190,.12);
    const spin=-(age*.22+2.6*(1-Math.exp(-age*.9)));
    this.fleetPieceShadow(c,'gate-hub',0,0,.35);
    drawPiece(c,'gate-hub',0,0,spin);
    const alive=e.turrets?.length?(e.turretsAlive??e.turrets.length)/e.turrets.length:1;
    const lamp=(.25+.55*alive)*(.8+.2*Math.sin(t*3.1));
    if(!this.reducedEffects)bloom(c,0,0,30,'rgba(215,163,255,.6)','rimViolet',.38*lamp);
    oval(c,0,0,5,5,'rgba(189,172,255,'+(.35*lamp).toFixed(3)+')');
    if(e.flash>0)drawPiece(c,'gate-ring',0,0,0,1,Math.min(.25,e.flash*.25),'flash');
    // Gun wrecks: the sim drops a dead turret, so keep its last pose here.
    for(const id of e.turrets||[]){
      const pose=this.gatePoses?.get(id);if(!pose)continue;
      const live=this.fleetEnemies.some(o=>o.id===id&&!o.dead&&o.hp>0);
      if(!live)this.gateTurretWreck(pose,t);
    }
  }
  gateTurretWreck(pose,t) {
    const c=this.ctx,id=pose.id||0;
    c.save();c.translate(pose.ox,pose.oy);
    if(this.zeroPainted('station-turret-wreck'))drawPiece(c,'station-turret-wreck',0,0,(hash(id*5)-.5)*.6);
    else{
      // Scorched pad, burnt base, and the dead head knocked askew off its ring.
      oval(c,1,2,21,17,'rgba(5,6,16,.55)');
      drawPiece(c,'station-turret-base',0,0,0,1,1,'wreck');
      const spec=GATE_HEADS[pose.gun]||GATE_HEADS.mix,skew=hash(id*7+3)-.5;
      c.save();c.translate(skew*6,3);c.rotate(pose.aim+Math.PI/2+skew*1.1);
      drawPiece(c,'station-turret-head-'+(GATE_HEADS[pose.gun]?pose.gun:'mix'),0,-spec.hub,0,.86,1,{tint:'rgba(9,11,24,.74)'});c.restore();
    }
    const ember=.4+.35*Math.sin(t*11+id);
    oval(c,-2,1,2.4,1.7,'rgba(196,140,255,'+ember.toFixed(2)+')');
    // Leaking coolant vents up and away in thin violet wisps.
    for(let j=0;j<(this.reducedEffects?1:3);j++){
      const q=(t*.5+j/3+hash(id*3))%1;
      oval(c,Math.sin(q*3+id)*3+q*6,-4-q*26,3+q*6,2+q*4,'rgba(30,26,58,'+((1-q)*.42).toFixed(3)+')');
    }
    c.restore();
  }
  // Gate gun: a fixed base, a head that tracks `aim`, recoil and a muzzle flash
  // per shot. The void gun's emitter charges up before it fires.
  gateTurretSprite(e,t) {
    const c=this.ctx,gun=GATE_HEADS[e.gun]?e.gun:'mix',spec=GATE_HEADS[gun],head='station-turret-head-'+gun;
    const rot=(e.aim??Math.PI/2)+Math.PI/2;
    (this.gatePoses ||= new Map()).set(e.id,{id:e.id,ox:e.ox??0,oy:e.oy??0,aim:e.aim??Math.PI/2,gun});
    if(this.gatePoses.size>60)for(const id of this.gatePoses.keys()){if(!this.fleetEnemies.some(o=>o.id===id||o.turrets?.includes(id)))this.gatePoses.delete(id);}
    const shot=this.zeroShot('gate'+e.id,e.fireAt??0,t,.16),kick=shot*3.4;
    // Head-shaped shadow onto the ring, then the base and the turning head.
    c.save();c.translate(2,4);c.rotate(rot);drawPiece(c,head,0,-spec.hub,0,1,.5,{tint:'#02060f'});c.restore();
    drawPiece(c,'station-turret-base',0,0);
    c.save();c.rotate(rot);c.translate(0,kick);
    drawPiece(c,head,0,-spec.hub);
    if(gun==='void'){
      const charge=clamp(1-((e.fireAt??0)-(e.age??0))/.8,0,1),pulse=.75+.25*Math.sin(t*7+(e.id||0));
      if(!this.reducedEffects)bloom(c,0,-4,8+charge*9,'rgba(215,163,255,.6)','rimViolet',(.18+.4*charge)*pulse);
      oval(c,0,-4,2.5+charge*1.5,2.5+charge*1.5,'rgba(222,180,255,'+(.2+.5*charge).toFixed(2)+')');
    }
    if(e.flash>0)drawPiece(c,head,0,-spec.hub,0,1,Math.min(.45,e.flash*.45),'flash');
    if(shot>.05){
      for(const [x,y] of spec.muzzles){
        const len=5+shot*8+hash(x+t*60)*3;
        c.save();c.translate(x,y);
        if(!this.reducedEffects)bloom(c,0,-3,8,'rgba('+spec.rgb+',.5)',spec.glow,.5*shot);
        c.globalAlpha*=shot;
        poly(c,[-2.4,0,-1,-len*.55,0,-len,1,-len*.55,2.4,0],gun==='void'?'#9b62d6':'#5fa8d8');
        poly(c,[-1.2,0,0,-len*.6,1.2,0],gun==='void'?'#ecd2ff':'#d8f6ff');
        c.restore();
      }
    }
    c.restore();
    // The mix gun fires a full ring: a thin shock ring leaves the body.
    if(gun==='mix'&&shot>0){c.save();c.globalAlpha*=shot*.55;oval(c,0,0,10+(1-shot)*26,8+(1-shot)*20,'#a9d9f2',true,1.4);c.restore();}
  }
  // Satellite: painted body (turned with the sim's heading like the old tile), an
  // emitter arm sweeping about its root and a lamp that glows while the beam is live.
  satelliteSprite(e,t) {
    const c=this.ctx;
    c.rotate(e.angle||0);
    this.fleetPieceShadow(c,'satellite',0,0,.4);
    drawPiece(c,'satellite',0,0);
    this.zeroGlint(c,'satellite',t,5.5,60,.16,(e.id||0)*1.3);
    const arm=t*.6+Math.PI;
    drawPiece(c,'satellite-arm',1,2,arm,1,.5,{tint:'#02060f'});
    drawPiece(c,'satellite-arm',0,0,arm);
    const live=e.anchored?1:0,tipX=-Math.sin(arm)*-20,tipY=Math.cos(arm)*-20;
    const lamp=live?.7+.3*Math.sin(t*14):.25+.15*Math.sin(t*3+(e.id||0));
    if(live&&!this.reducedEffects)bloom(c,tipX,tipY,12,'rgba(215,163,255,.6)','rimViolet',.45*lamp);
    oval(c,tipX,tipY,1.8,1.8,'rgba(230,219,255,'+lamp.toFixed(2)+')');
    if(e.flash>0)drawPiece(c,'satellite',0,0,0,1,Math.min(.4,e.flash*.4),'flash');
  }
  // Tether: the painted grapple head turns slowly as it hauls the salvage home.
  tetherSprite(e,t) {
    const c=this.ctx;
    drawPiece(c,'tether-node',e.x+1.5,e.y+3,(e.angle||0)+t*1.4,.9,.5,{tint:'#02060f'});
    drawPiece(c,'tether-node',e.x,e.y,(e.angle||0)+t*1.4,.9);
    if(e.flash>0)drawPiece(c,'tether-node',e.x,e.y,(e.angle||0)+t*1.4,.9,Math.min(.5,e.flash*.5),'flash');
    oval(c,e.x,e.y,8,8,'rgba(10,18,36,.72)');
  }
  // THE SOVEREIGN: painted hull, a breathing crystal core coloured by phase, four
  // pod mounts (sockets until a stolen weapon grows into one), engine glow.
  sovereignSprite(b,t) {
    const c=this.ctx,phase=clamp(b.phase||1,1,3),look=SOVEREIGN_PHASE[phase-1];
    // Render-only memory: phase change flare, and the core's kick on each volley.
    const seen=this.sovSeen ||= {phase,at:-9,clock:0,shotAt:-9};
    if(seen.id!==b.id){seen.id=b.id;seen.phase=phase;seen.at=-9;seen.shotAt=-9;}
    if(phase!==seen.phase){seen.phase=phase;seen.at=t;}
    const clock=(b.aimAt||0)+(b.mirrorAt||0)+(b.ringAt||0)+(b.rowAt||0)+(b.shardAt||0);
    if(clock>seen.clock+.03)seen.shotAt=t;seen.clock=clock;
    const flare=clamp(1-(t-seen.at)/.9,0,1),kick=clamp(1-(t-seen.shotAt)/.22,0,1);
    c.save();c.translate(b.x,b.y);c.rotate(b.angle||0);
    this.fleetPieceShadow(c,'sovereign-hull',0,0,.5);
    // Engine glow under the four nozzles.
    const thrust=.55+.2*Math.sin(t*9)+.25*flare;
    for(const x of SOVEREIGN_NOZZLES){
      if(!this.reducedEffects)bloom(c,x,52,14,'rgba(192,140,255,.6)','rimViolet',.35*thrust);
      oval(c,x,50,4.5,2.5+thrust*2,'rgba(183,160,255,'+(.3*thrust).toFixed(3)+')');
    }
    drawPiece(c,'sovereign-hull',0,0);
    this.zeroGlint(c,'sovereign-hull',t,6.5,230,.1);
    if(this.zeroPainted('sovereign-fractured')){
      const damage=1-clamp(b.hp/Math.max(1,b.maxHp),0,1);
      if(damage>.5)drawPiece(c,'sovereign-fractured',0,0,0,1,clamp((damage-.5)*3,0,1));
    }else this.sovereignCracks(b);
    // Sockets on every mount, then the grown pods over them.
    for(const ox of SOVEREIGN_SLOTS)drawPiece(c,'pod-socket',ox,sovereignMountY(ox));
    for(let i=0;i<(b.weapons?.length||0);i++)this.sovereignPod(b,b.weapons[i],i,t);
    // The core: a slow breath that quickens each phase, a flare on phase change.
    const breath=.5+.5*Math.sin(t*look.rate),scale=1+.025*breath+.06*flare;
    if(!this.reducedEffects)bloom(c,0,0,46+flare*30,'rgba('+look.rgb+',.6)',look.glow,.22+.18*breath+.4*flare);
    drawPiece(c,'sovereign-core',0,0,0,scale);
    c.save();c.globalCompositeOperation='lighter';
    drawPiece(c,'sovereign-core',0,0,0,scale,.1+.14*breath+.25*kick+.35*flare,{tint:look.tint});c.restore();
    if(flare>0){c.save();c.globalAlpha*=flare;oval(c,0,0,30+(1-flare)*120,24+(1-flare)*60,'rgba('+look.rgb+',.8)',true,2);c.restore();}
    if(b.flash>0){
      drawPiece(c,'sovereign-hull',0,0,0,1,Math.min(.16,b.flash*.16),'flash');
      drawPiece(c,'sovereign-core',0,0,0,scale,Math.min(.5,b.flash*.5),'flash');
    }
    c.restore();
  }
  // Procedural cracks over the paint, kept inside the hull's diamond silhouette.
  sovereignCracks(b) {
    const c=this.ctx,damage=1-clamp(b.hp/Math.max(1,b.maxHp),0,1);
    for(let i=0;i<Math.floor(damage*12);i++){
      const x=(hash(i+7)-.5)*300,half=Math.max(8,70*(1-Math.abs(x)/180)),y=(hash(i+9)-.5)*half*1.3;
      line(c,[x-8,y-7,x,y,x-4,y+12],'rgba(8,10,26,.85)',3);line(c,[x,y,x+8,y+3],'rgba(214,170,255,.75)',1);
    }
  }
  sovereignPod(b,pod,i,t) {
    const c=this.ctx,my=sovereignMountY(pod.ox);
    const fx=this.impacts.find(f=>f.zero&&f.type==='sovereignGrow'&&f.count===i+1);
    const grow=fx?clamp(fx.age/.55,0,1):1,ease=easeOutBack(grow);
    const shot=this.zeroShot('pod'+(b.id||0)+'-'+i,pod.fireAt??0,t,.2),kick=shot*3;
    const id=SOVEREIGN_PODS[pod.type]?'pod-'+pod.type:this.zeroPainted('pod-'+pod.type)?'pod-'+pod.type:'pod-generic';
    c.save();c.translate(pod.ox,my+(1-ease)*42-kick);c.globalAlpha*=.4+.6*Math.min(1,grow*1.6);
    drawPiece(c,id,2,4,0,1,.45,{tint:'#02060f'});
    drawPiece(c,id,0,0);
    if(b.flash>0)drawPiece(c,id,0,0,0,1,Math.min(.35,b.flash*.35),'flash');
    if(grow<1){
      // Bolt ring while it slides in; sparks as the collar locks home.
      oval(c,0,0,26*(1-grow)+14,24,'#e8b8ff',true,2);line(c,[-24,-12,-10,-3,6,-14,22,0],'#fff2c8',1.5);
      if(grow>.55)for(let k=0;k<5;k++){const a=-Math.PI*(.15+.7*hash(k+i*5)),r=8+(grow-.55)*60;line(c,[Math.cos(a)*r*.6,Math.sin(a)*r*.4-1,Math.cos(a)*r,Math.sin(a)*r*.6-1],'rgba(255,236,200,'+(1-grow).toFixed(2)+')',1.2);}
    }
    if(shot>.05){
      const missile=pod.type==='sidewinder';
      for(const x of SOVEREIGN_PODS[pod.type]||[0]){
        const len=5+shot*9;
        c.save();c.translate(x,37);
        if(!this.reducedEffects)bloom(c,0,3,9,missile?'rgba(255,178,116,.5)':'rgba(215,163,255,.5)',missile?'rimFire':'rimViolet',.5*shot);
        c.globalAlpha*=shot;
        poly(c,[-2.4,0,-1,len*.55,0,len,1,len*.55,2.4,0],missile?'#e98a4c':'#9b62d6');
        poly(c,[-1.2,0,0,len*.6,1.2,0],missile?'#fff0b4':'#f0dcff');
        c.restore();
      }
    }
    c.restore();
  }
  // The hull, pre-cut for the death shatter: logical canvas, white silhouette for
  // the shard rims, and which of the 8x3 cells actually hold paint.
  sovereignShards() {
    if(this.sovShards!==undefined)return this.sovShards;
    const tile=skyArt.pieceCanvas('sovereign-hull',{logical:true});if(!tile)return null;
    const rim=surface(tile.width,tile.height),g=rim.getContext('2d');
    g.drawImage(tile,0,0);g.globalCompositeOperation='source-atop';g.fillStyle='#f6eaff';g.fillRect(0,0,rim.width,rim.height);
    const cols=8,rows=3,tw=tile.width/cols,th=tile.height/rows,live=[];
    let d=null;try{d=tile.getContext('2d').getImageData(0,0,tile.width,tile.height).data;}catch{}
    for(let i=0;i<cols*rows;i++){
      if(!d){live.push(true);continue;}
      const x0=(i%cols)*tw|0,y0=Math.floor(i/cols)*th|0;let n=0;
      for(let y=y0;y<y0+th;y+=3)for(let x=x0;x<x0+tw;x+=3)if(d[(y*tile.width+x)*4+3]>80)n++;
      live.push(n>12);
    }
    return this.sovShards={tile,rim,live};
  }
  sovereign(b,t) {
    if(b&&hasSheet(S6_BOSS))return this.sovereignSprite(b,t);
    if(!b)return;const c=this.ctx,w=b.w||200,h=b.h||80;c.save();c.translate(b.x,b.y);c.rotate(b.angle||0);
    c.drawImage(this.zeroHull('sovereign',w,h),-w-20,-h-20);
    const damage=1-clamp(b.hp/Math.max(1,b.maxHp),0,1);
    for(let i=0;i<Math.floor(damage*12);i++){const x=(hash(i+7)-.5)*w*1.6,y=(hash(i+9)-.5)*h;line(c,[x-8,y-7,x,y,x-4,y+12],'#0b1229',3);line(c,[x,y,x+8,y+3],'#e9bbff',1);}
    for(let i=0;i<(b.weapons?.length||0);i++){
      const pod=b.weapons[i],fx=this.impacts.find(f=>f.zero&&f.type==='sovereignGrow'&&f.count===i+1),bolt=fx?clamp(fx.age/.45,0,1):1;
      c.save();c.translate(pod.ox,24+(1-bolt)*42);c.globalAlpha=.4+bolt*.6;
      const tile=this.zeroPod(pod.type);c.drawImage(tile,-24,-25);
      if(bolt<1){oval(c,0,0,26*(1-bolt)+14,24,'#e8b8ff',true,2);line(c,[-24,-12,-10,-3,6,-14,22,0],'#fff2c8',1.5);}c.restore();
    }
    if(b.flash>0){c.globalAlpha=.5;oval(c,0,0,25,30,'#fff7e7');}c.restore();
  }
  zeroEffects(game,t) {
    const c=this.ctx;c.save();
    for(const f of this.impacts){if(!f.zero)continue;const p=f.age/f.life;c.save();c.globalAlpha=1-p;
      if(f.death){
        // The finale lands: a brief white-violet bloom, then bright-edged shards.
        const bloom=clamp(1-f.age/.35,0,1);
        if(bloom>0){c.save();c.globalAlpha=(this.reducedEffects?.35:.75)*bloom;oval(c,f.x,f.y,f.w*(.7+(1-bloom)*.6),f.h*(1+(1-bloom)*.9),'#f4e8ff');
          c.globalAlpha=(this.reducedEffects?.2:.45)*bloom;oval(c,f.x,f.y,f.w*(1.1+(1-bloom)*.9),f.h*(1.6+(1-bloom)*1.2),'#b48cff');c.restore();}
        const shards=hasSheet(S6_BOSS)?this.sovereignShards():null;
        const tile=shards?.tile||this.zeroHull('sovereign',f.w,f.h),cols=8,rows=3,tw=tile.width/cols,th=tile.height/rows,edge=clamp(1-f.age/1.2,0,1);
        for(let i=0;i<cols*rows;i++){const col=i%cols,row=Math.floor(i/cols),age=f.age;
          if(shards&&!shards.live[i])continue;
          c.save();c.globalAlpha*=clamp((2.4-age)/.8,0,1);c.translate(f.x+(col-3.5)*tw*(1+age*.22),f.y+(row-1)*th+age*10+age*age*5);c.rotate(f.angle+(hash(i+8)-.5)*age*2);
          if(shards){
            // Painted shards: a hot silhouette rim around each piece, then the paint;
            // the cut faces glow a moment longer than the rim.
            const hot=edge*(.45+.55*hash(i+31));
            if(hot>0){c.save();c.globalAlpha*=hot;c.drawImage(shards.rim,col*tw,row*th,tw,th,-tw/2-2.5,-th/2-2.5,tw+5,th+5);c.restore();}
            c.drawImage(tile,col*tw,row*th,tw,th,-tw/2,-th/2,tw,th);
            if(hot>0){c.save();c.globalAlpha*=hot*hot*.22;c.globalCompositeOperation='lighter';c.drawImage(shards.rim,col*tw,row*th,tw,th,-tw/2,-th/2,tw,th);c.restore();}
          }else{
            c.drawImage(tile,col*tw,row*th,tw,th,-tw/2,-th/2,tw,th);
            if(edge>0){c.globalAlpha*=edge*(.45+.55*hash(i+31));c.strokeStyle='#f6eaff';c.lineWidth=1.5;c.strokeRect(-tw/2+1,-th/2+1,tw-2,th-2);}
          }
          c.restore();}
      }else if(f.type==='mirrorCopy'){
        oval(c,f.x,f.y,30+p*170,15+p*65,'#c2eeff',true,2);
      }else{const snap=f.type==='tetherCut';for(let i=0;i<8;i++){const a=i*TAU/8,r=8+p*38;line(c,[f.x+Math.cos(a)*r,f.y+Math.sin(a)*r,f.x+Math.cos(a)*(r+8),f.y+Math.sin(a)*(r+8)],snap?'#a6ffed':f.type==='shardBreak'?'#d2f7ff':'#edbaff',2);}}
      c.restore();
    }c.restore();
  }
  // Text that must read over enemy fire (drawn after the bullet layer).
  zeroLabels() {
    const c=this.ctx;
    for(const f of this.impacts){
      if(!f.zero||f.type!=='mirrorCopy')continue;
      const a=clamp(Math.min(f.age/.15,(f.life-f.age)/.4),0,1);if(a<=0)continue;
      const y=clamp(f.y+f.h+30,150,550);
      c.save();c.globalAlpha=a;c.font='bold 14px monospace';c.textAlign='center';c.textBaseline='middle';
      const w=c.measureText('ARSENAL COPIED').width+22;
      c.fillStyle='rgba(8,12,28,.82)';c.fillRect(f.x-w/2,y-12,w,24);c.strokeStyle='rgba(194,238,255,.55)';c.lineWidth=1;c.strokeRect(f.x-w/2+.5,y-11.5,w-1,23);
      c.fillStyle='#d6f3ff';c.fillText('ARSENAL COPIED',f.x,y+1);c.restore();
    }
  }
  enemy(e,t) {
    if(!e||e.dead||e.alive===false||e.hidden)return;
    const kind=String(e.type||'scout').toLowerCase();
    if(kind==='boss'||e.isBoss)return this.boss(e,t);
    if(this.zeroEnemy(e,t))return;
    if(this.skyEnemy(e,t))return;
    if(this.fleetEnemy(e,t))return;
    if(this.authoredEnemy(e,t))return;
    const stage=this.currentStage||1;
    const heavy=/bomber|heavy|gunship|carrier|tank|mini/.test(kind);
    const ace=/ace|elite|interceptor/.test(kind);
    const turret=kind==='turret';
    const wing=kind==='wing';
    const r=e.r||e.radius||(heavy?32:ace?24:turret?22:18);
    const c=this.ctx,x=e.x||0,y=e.y||0;
    const seed=(e.id||0)*1.41,wingBeat=Math.sin(t*5.4+seed);
    const tint=stage===3?'195,163,239':stage===2?'255,197,128':'168,236,211';
    // Separate wake and contact shadow from the hull so banking reads as motion.
    const wake=heavy?72:ace?54:39;
    for(const side of [-1,1]) {
      const sx=x+side*(heavy?22:13),sway=Math.sin(t*2.2+seed+side)*5;
      line(c,[sx,y-7,sx+side*5+sway,y-wake],
        'rgba('+tint+','+(heavy?.21:.15)+')',heavy?2:1.2);
      line(c,[sx+side*2,y-15,sx+side*7+sway,y-wake*.72],
        'rgba('+tint+',.08)',3);
    }
    c.save();c.translate(x,y+wingBeat*1.4);c.rotate((e.angle||0)+Math.PI);
    const scale=(r/(heavy?32:ace?24:turret?22:18))*(heavy?1.07:1.16);
    c.scale(scale*(1+wingBeat*.024),scale*(1-wingBeat*.012));
    poly(c,[0,-22,-17,-7,-31,-2,-28,15,-12,10,-9,30,0,35,9,30,12,10,
      28,15,31,-2,17,-7],
      stage===3?'#1b2038':stage===2?'#302d37':'#20343d');
    const bloomProfile=stage===3?'enemyStorm':stage===2?'enemyFoundry':
      ace?'enemyAce':'enemyCoast';
    const bloomAlpha=stage===3?.2:stage===2?.18:ace?.18:.17;
    const bloomColor=stage===3?'rgba(184,106,216,.2)':
      stage===2?'rgba(255,183,103,.18)':ace?'rgba(197,86,168,.18)':'rgba(239,125,76,.17)';
    bloom(c,0,0,heavy?62:43,bloomColor,bloomProfile,bloomAlpha);
    // Foundry wings carry solar vanes; storm craft wear long fractured fins.
    if(stage===2) for(const side of [-1,1]) {
      poly(c,[side*10,-14,side*36,-27,side*39,13,side*12,5],
        '#66515a','#dfac78',1);
      line(c,[side*20,-17,side*22,6],'rgba(255,222,162,.65)',1.5);
    }
    if(stage===3) for(const side of [-1,1]) {
      poly(c,[side*12,-6,side*34,-35,side*31,-8,side*43,18,
        side*16,8],'#4b3d69','#b88ac5',1);
      line(c,[side*22,-15,side*29,-27],'rgba(227,179,242,.6)',1.4);
    }
    const exhaust=this.enemyExhaustSprites[heavy?'heavy':'light'];
    for(const side of [-1,1]) {
      const px=side*(heavy?23:16);
      c.drawImage(exhaust,px-5,13);
    }
    oval(c,6,10,heavy?37:25,heavy?25:17,'rgba(0,6,16,.42)');
    if(heavy) {
      poly(c,[-13,-27,-35,-7,-35,17,-19,13,-12,29,12,29,19,13,35,17,35,-7,13,-27],'#68353d');
      poly(c,[-11,-30,-31,-6,-30,5,-12,1,12,1,30,5,31,-6,11,-30],stage===2?'#c9936c':stage===3?'#9d6e9e':'#b65f50');
      poly(c,[-8,-28,0,-38,8,-28,8,25,0,33,-8,25],'#e3a86e');
      for(const s of [-1,1]) {
        oval(c,s*23,9,7,12,'#46313f');oval(c,s*23,7,3,4,'#ffc077');
        line(c,[s*15,-5,s*32,-5],'rgba(255,201,142,.66)',1.5);
      }
      if(kind==='mini') {
        poly(c,[-17,-31,-61,-20,-56,13,-23,4,-11,35,0,47,11,35,23,4,56,13,61,-20,17,-31],'#702f52');
        poly(c,[-8,-42,0,-57,8,-42,10,15,0,24,-10,15],'#f4b476');
        for(const side of [-1,1]) {
          oval(c,side*48,-7,11,13,'#3d304d');
          oval(c,side*48,-7,6,7,'#e86eaa');
          bloom(c,side*48,-7,28,'rgba(236,107,178,.2)','enemyMini',.2);
        }
      }
    } else if(turret) {
      poly(c,[0,-27,-20,-20,-31,-3,-24,20,0,29,24,20,31,-3,20,-20],'#6d4359');
      poly(c,[0,-22,-17,-15,-24,-2,-17,15,0,21,17,15,24,-2,17,-15],stage===2?'#d7aa78':stage===3?'#9f77a8':'#d9806d');
      oval(c,0,0,13,13,'#283b4d');oval(c,0,0,8,8,'#f0ae79');
      for(let i=0;i<4;i++) {
        const a=t*.65+i*TAU/4;
        line(c,[Math.cos(a)*16,Math.sin(a)*16,Math.cos(a)*23,Math.sin(a)*23],'#ffd7a0',2);
      }
    } else if(ace) {
      poly(c,[0,-28,-12,-9,-29,-4,-25,10,-10,7,-12,25,0,17,12,25,10,7,25,10,29,-4,12,-9],'#59385d');
      poly(c,[0,-30,-9,-10,-23,-2,-11,2,-7,17,0,12,7,17,11,2,23,-2,9,-10],stage===2?'#c88c6d':stage===3?'#bd82b4':'#c36380');
      poly(c,[0,-30,-4,-10,0,0,4,-10],'#ffc48c');
    } else if(wing) {
      poly(c,[0,-24,-30,-14,-31,0,-15,7,-7,24,0,15,7,24,15,7,31,0,30,-14],'#6b4653');
      poly(c,[0,-26,-25,-11,-14,-4,-7,10,0,6,7,10,14,-4,25,-11],stage===2?'#d7aa74':stage===3?'#a67bab':'#e38f70');
      poly(c,[0,-28,-5,-13,0,-6,5,-13],'#ffe0a1');
      for(const side of [-1,1]) oval(c,side*20,-7,4,3,'#f2ba85');
    } else {
      poly(c,[0,-26,-12,-7,-27,-1,-24,8,-8,4,-10,21,0,13,10,21,8,4,24,8,27,-1,12,-7],'#78474a');
      poly(c,[0,-27,-8,-7,-21,0,-8,1,-6,13,0,7,6,13,8,1,21,0,8,-7],stage===2?'#d3a374':stage===3?'#ac78a4':'#df7b5f');
      poly(c,[0,-27,-4,-9,0,-3,4,-9],'#ffd092');
      for(const s of [-1,1])oval(c,s*16,4,5,6,'#683f48');
    }
    // Tiny live facets turn with each craft; all expensive material lives in
    // the larger cached scenery and boss sprites.
    if(heavy) {
      poly(c,[-10,-27,-30,-6,-12,1,-7,-15],
        stage===3?'#cba1c8':'#e8c79e');
      poly(c,[10,-27,30,-6,12,1,7,-15],
        stage===3?'#443450':'#513d43');
      poly(c,[8,-26,8,25,0,33],
        '#493344');
    } else {
      poly(c,[-8,-9,-23,-1,-8,2],
        stage===3?'#d0a5c9':'#f0c19d');
      poly(c,[8,-9,23,-1,8,2],
        stage===3?'#402f56':'#533946');
      line(c,[-6,-16,0,-26,6,-16],
        'rgba(255,235,194,.5)',1.1);
    }
    for(const side of [-1,1]) {
      line(c,[side*8,-12,side*(heavy?28:20),-4],'rgba(255,213,164,.43)',1.2);
      line(c,[side*8,7,side*(heavy?17:12),17],'rgba(43,34,46,.55)',1.1);
    }
    if(heavy){
      for(let i=0;i<3;i++) {
        oval(c,-9+i*9,17,1.4,1.4,'rgba(255,220,175,.62)');
      }
      // Segmented armor catches the moving environmental light.
      for(const side of [-1,1]) {
        poly(c,[side*13,-16,side*28,-10,side*25,-3,side*12,-8],
          'rgba(255,229,181,.19)');
        line(c,[side*15,13,side*27,12],'rgba('+tint+',.42)',1.3);
      }
    }
    if(ace||wing) {
      for(const side of [-1,1]) {
        const tip=ace?24:27;
        line(c,[side*tip,-4,side*(tip+6+wingBeat*2),-11],
          'rgba('+tint+',.67)',1.5);
        oval(c,side*tip,-4,2.2,2.2,
          'rgba('+tint+','+(.52+wingBeat*.15)+')');
      }
    }
    oval(c,0,-5,heavy?6:4,heavy?11:7,'#294051');
    oval(c,0,-8,2,3.2,'#ffd6a0');
    const pos=heavy?23:ace?17:16;
    for(const s of [-1,1]) {
      c.save();c.translate(s*pos,5);c.rotate(t*28+s);
      line(c,[-5,0,5,0],'rgba(255,200,163,.68)',1.3);c.restore();
    }
    if(e.flash>0) {
      c.globalAlpha=Math.min(.62,e.flash*1.6);
      line(c,[-(heavy?31:20),-7,0,-24,(heavy?31:20),-7],'#fff4c9',2.4);
      bloom(c,0,-5,heavy?34:22,'rgba(255,238,190,.35)','enemyHit',.35);
    }
    c.restore();
  }
  drawReactorCover(b) {
    const cover=b?.cover;if(!cover||b.age>=cover.until)return;
    const c=this.ctx,left=cover.until-b.age,alpha=Math.min(1,left/.55),x=cover.x,w=cover.width;
    c.save();c.globalAlpha=alpha;c.fillStyle='rgba(107,219,178,.075)';c.fillRect(x-w/2,cover.y,w,H-cover.y);
    c.strokeStyle='rgba(154,232,190,.48)';c.lineWidth=1.5;c.setLineDash([10,9]);
    for(const side of [-1,1]){c.beginPath();c.moveTo(x+side*w/2,cover.y);c.lineTo(x+side*w/2,H);c.stroke();}
    c.restore();
  }
  drawBossLance(b,t) {
    const l=b?.lance;if(!l||l.cancelled||b.age<l.startsAt||b.age>=l.endsAt)return;
    const c=this.ctx,x=l.x,y=l.y,half=l.width/2,active=l.active;
    c.save();
    c.fillStyle=active?'rgba(255,112,88,.42)':l.locked?'rgba(242,116,94,.16)':'rgba(242,116,94,.055)';
    c.fillRect(x-half,y,l.width,H-y);
    c.strokeStyle=active?'#ffae87':l.locked?'#ffd2b2':'#c88b91';c.lineWidth=active?2.4:1.8;
    c.setLineDash(active?[]:l.locked?[14,7]:[4,9]);
    for(const side of [-1,1]){c.beginPath();c.moveTo(x+side*half,y);c.lineTo(x+side*half,H);c.stroke();}
    c.setLineDash([]);line(c,[b.x,b.y+70,x,y],'rgba(230,140,145,.42)',active?6:2);
    if(active){
      const pulse=this.reducedEffects?1:.9+.1*Math.sin(t*47);
      c.globalAlpha=pulse;c.fillStyle='#ffe5ce';c.fillRect(x-7,y,14,H-y);c.fillStyle='#fff9e8';c.fillRect(x-2,y,4,H-y);c.globalAlpha=1;
    }else{
      const progress=clamp((b.age-l.startsAt)/(l.firesAt-l.startsAt),0,1);
      c.strokeStyle='#ffccaa';c.lineWidth=3;c.beginPath();c.arc(x,y+24,17,-Math.PI/2,-Math.PI/2+TAU*progress);c.stroke();
    }
    const label=active?'LANCE FIRING':l.locked?'LOCKED / MOVE':'TRACKING',labelX=clamp(x,102,W-102),labelY=Math.max(y+72,490);
    c.fillStyle='rgba(27,15,25,.96)';c.fillRect(labelX-96,labelY-20,192,30);c.fillStyle='#ffe2c6';c.font='800 18px Arial';c.textAlign='center';c.fillText(label,labelX,labelY+1);
    c.restore();
  }
  drawReactorStatus(r,value,color) {
    const c=this.ctx,size=this.compactLabels?18:13;
    c.save();c.font='800 '+size+'px Arial';c.textAlign='center';
    const width=Math.max(150,c.measureText(value).width+20),x=clamp(r.x,width/2+8,W-width/2-8),y=r.y+49;
    c.fillStyle='rgba(5,23,31,.96)';c.fillRect(x-width/2,y-size-2,width,size+10);c.fillStyle=color;c.fillText(value,x,y+1);c.restore();
  }
  drawReactorCoverLabel(b) {
    const cover=b?.cover;if(!cover||b.age>=cover.until)return;
    const c=this.ctx,left=cover.until-b.age,x=clamp(cover.x,76,W-76),y=Math.max(cover.y+92,430);
    c.save();c.fillStyle='rgba(5,24,30,.96)';c.fillRect(x-72,y-22,144,34);
    c.font='800 20px Arial';c.textAlign='center';c.fillStyle='#d0f7d8';c.fillText('COVER '+left.toFixed(1)+'s',x,y+2);c.restore();
  }
  bossReactor(b,t) {
    const r=b?.reactor;if(!r||!Number.isFinite(r.x))return;
    const c=this.ctx,open=b.age>=r.opensAt,pulse=this.reducedEffects?.65:.65+.2*Math.sin(t*4);
    c.save();c.translate(r.x,r.y);c.rotate(b.angle||0);
    oval(c,3,7,29,27,'rgba(1,10,17,.65)');
    const metal=c.createLinearGradient(-24,-25,25,27);
    metal.addColorStop(0,r.broken?'#53605c':'#c6b58a');metal.addColorStop(.23,r.broken?'#273b3e':'#627879');
    metal.addColorStop(.54,'#172d36');metal.addColorStop(.79,r.broken?'#253434':'#87928a');metal.addColorStop(1,'#1a2930');
    poly(c,[-13,-25,13,-25,25,-13,25,13,13,25,-13,25,-25,13,-25,-13],metal,r.broken?'#576567':'#e4bc72',1.6);
    line(c,[-23,-11,-12,-23,12,-23,22,-12],'rgba(249,238,204,.55)',1.5);
    poly(c,[-10,-18,10,-18,18,-10,18,10,10,18,-10,18,-18,10,-18,-10],'#071820','#516369',2);
    for(const [x,y] of [[-16,-16],[16,-16],[-16,16],[16,16]]){oval(c,x,y,2.2,2.2,'#101e25');line(c,[x-1,y-1,x+1,y+1],'#a8ac92',1);}
    for(const side of [-1,1])for(let i=0;i<3;i++)line(c,[side*20,-6+i*5,side*24,-6+i*5],'#0c2028',2);
    if(r.broken){
      line(c,[-12,-11,1,-3,-4,8,12,13],'#627470',2);poly(c,[-9,-9,1,-5,-4,8,-11,10],'#070f17');c.restore();
      if(r.phase===3)this.drawReactorStatus(r,'RIGHT SPIRAL OFFLINE','#b9dcc7');
      return;
    }
    c.fillStyle=open?'rgba(255,213,135,'+pulse+')':'#58655f';c.fillRect(-8,-12,16,24);
    line(c,[-8,-11,8,-11],'#fff2c7',1.4);line(c,[-7,0,7,0],'#715831',2);
    oval(c,0,0,4.5,4.5,open?'#fff0be':'#c4b793');
    c.strokeStyle=open?'#f9d289':'#b2aaa0';c.lineWidth=3;c.beginPath();c.arc(0,0,30,-Math.PI/2,-Math.PI/2+TAU*(open?r.hp/r.maxHp:clamp((b.age-r.opensAt+.9)/.9,0,1)));c.stroke();c.restore();
    this.drawReactorStatus(r,open?(r.phase===3?'CUT RIGHT SPIRAL':'BREAK FOR COVER'):'REACTOR OPENING','#f3d29c');
  }
  boss(b,t) {
    if(b?.name==='THE SOVEREIGN'||this.currentStage===6)return this.sovereign(b,t);
    if(b?.name==='HALCYON'||this.currentStage===5)return this.halcyon(b,t);
    if(this.currentStage===4||b?.name==='LEVIATHAN')return this.leviathan(b,t);
    const r=b?.reactor;
    if(r&&Number.isFinite(r.x)){
      const c=this.ctx,angle=b.angle||0,x=b.x+r.side*108*Math.cos(angle)-28*Math.sin(angle),y=b.y+r.side*108*Math.sin(angle)+28*Math.cos(angle);
      const elbow=(x+r.x)/2;
      c.save();c.lineJoin='round';line(c,[x+3,y+5,elbow+3,r.y+16,r.x+3,r.y+5],'rgba(1,10,17,.65)',12);
      line(c,[x,y,elbow,r.y+10,r.x,r.y],r.broken?'#36464a':'#4f666a',8);
      line(c,[x,y-2,elbow,r.y+8,r.x,r.y-2],r.broken?'#66716a':'#a5aaa0',2);
      oval(c,elbow,r.y+10,6,6,'#233b43');oval(c,elbow,r.y+10,2,2,'#b6b18e');c.restore();
    }
    this.bossHull(b,t);
    if(r?.phase===3&&r.broken){
      const c=this.ctx;c.save();c.translate(b.x,b.y);c.rotate(b.angle||0);
      poly(c,[45,12,70,12,73,31,62,40,44,31],'rgba(5,15,22,.94)','#455458',1.5);
      for(let i=0;i<4;i++)line(c,[49,17+i*4,67,18+i*4],'#263b43',2);
      line(c,[47,15,56,25,52,34],'#887764',1.4);oval(c,63,18,3,3,'#17262b');c.restore();
    }
    this.bossReactor(b,t);
  }
  bossHull(b,t) {
    if(this.authoredBoss(b,t))return;
    const c=this.ctx;
    const stage=/CROWN/i.test(b.name||'')?3:/AURELIA/i.test(b.name||'')?2:1;
    const phase=b.phase||1,pulse=.5+.5*Math.sin(t*3.1);
    const coreY=stage===1?50:stage===2?0:65;
    const accent=stage===1?'255,207,142':stage===2?'255,231,162':'232,179,242';
    c.save();c.translate(b.x??W/2,b.y??285);c.rotate(b.angle||0);
    // Outer beacons and exhaust move independently of the cached hull.
    for(const side of [-1,1]) {
      const ventX=side*(stage===2?128:stage===3?116:105);
      const pulseLen=34+Math.sin(t*7+side)*9;
      poly(c,[ventX-6,45,ventX+6,45,ventX+13,45+pulseLen,
        ventX-13,45+pulseLen],
        'rgba('+accent+',.095)');
      line(c,[ventX,53,ventX+Math.sin(t*4+side)*5,58+pulseLen],
        'rgba('+accent+',.19)',1.8);
    }
    // A dark, offset lower hull stays visible below each cached machine.
    // The cast shadow is a separate world layer beneath projectile fire.
    if(stage===2) {
      oval(c,0,21,136,108,'rgba(9,17,33,.8)',true,24);
      poly(c,[-158,-48,-124,-85,0,-116,124,-85,158,-48,144,78,0,133,-144,78],
        'rgba(9,17,33,.75)');
    } else {
      poly(c,[-165,-47,-126,-82,-86,-100,0,-137,86,-100,126,-82,165,-47,
        151,65,95,93,0,129,-95,93,-151,65],
        stage===3?'#11182d':'#172333');
    }
    c.drawImage(this.bossSprites[stage-1],-195,-170);
    if(b.guard) {
      // Damage floor: visible segmented armor cycles until the hull opens.
      // Its radius clears the core and keeps projectile shapes unobscured.
      const remaining=Math.max(0,(b.guardUntil??b.age)-(b.age||0));
      const opening=1-clamp(remaining/8,0,1);
      c.save();c.rotate(Math.sin(t*.85)*.035);
      for(let plate=0;plate<8;plate++) {
        const a=plate*TAU/8+t*.24,span=.48+opening*.16;
        c.beginPath();c.ellipse(0,coreY-13,155,99,0,a,a+span);
        c.strokeStyle='rgba(134,246,240,'+(.27+.12*pulse)+')';
        c.lineWidth=5;c.stroke();
        c.beginPath();c.ellipse(0,coreY-13,145,91,0,a+.05,a+span-.05);
        c.strokeStyle='rgba(190,255,243,'+(.16+.18*pulse)+')';
        c.lineWidth=1.5;c.stroke();
      }
      oval(c,0,coreY,20+pulse*3,20+pulse*3,
        'rgba(103,247,231,.44)',true,2);
      c.restore();
    }
    for(let i=0;i<6;i++) {
      const a=t*.35+i*TAU/6,rx=stage===2?103:125,ry=stage===3?55:67;
      const x=Math.cos(a)*rx,y=coreY+Math.sin(a)*ry;
      oval(c,x,y,2.1,2.1,'rgba('+accent+','+(.23+pulse*.3)+')');
    }
    // The cached hull stays stable while the core and damage state pulse.
    oval(c,0,coreY,9+pulse*3,9+pulse*3,
      'rgba('+accent+','+(.44+pulse*.28)+')');
    oval(c,0,coreY,4+pulse*2,4+pulse*2,'#fff8dc');
    if(phase>=2) {
      const crack=stage===3?'rgba(241,167,255,.78)':
        stage===2?'rgba(255,224,155,.79)':'rgba(255,190,124,.82)';
      for(const side of [-1,1]) {
        line(c,[side*28,-8,side*48,6,side*62,1,side*78,20],crack,2);
        line(c,[side*65,-31,side*79,-21,side*90,-25],crack,1.2);
      }
    }
    if(phase>=3) {
      for(const side of [-1,1]) {
        oval(c,side*(stage===2?132:stage===3?126:120),
          stage===3?28:stage===2?75:10,5+pulse*2,6+pulse*2,
          'rgba('+accent+',.72)');
      }
    }
    if(b.flash>0) {
      c.globalAlpha=Math.min(.65,b.flash*1.5);
      oval(c,0,coreY,27,27,'#fff0ca',true,2.5);
      line(c,[-19,coreY,19,coreY],'#fff9dc',2.2);
      line(c,[0,coreY-19,0,coreY+19],'#fff9dc',2.2);
    }
    c.restore();
  }
  projectiles(items,friendly,t) {
    const c=this.ctx;
    if(!friendly) {
      const sprites=this.bulletSprites;
      for(const b of items) {
        if(!b)continue;
        const x=b.x||0,y=b.y||0;
        if(x< -40||x>W+40||y< -40||y>H+40)continue;
        const kind=b.kind||b.color||'amber';
        if(kind==='shard'||kind==='mirror'){
          const tile=this.zeroRound(kind,b.r||4),r=tile.width/2;
          c.drawImage(tile,x-r,y-r);continue;
        }
        const set=sprites[kind]||sprites.amber;
        const half=Math.round(clamp(b.r||b.radius||4,2,13)*2);
        const sprite=set[half],extent=sprite.width/2;
        c.drawImage(sprite,x-extent,y-extent);
      }
      return;
    }
    // Reuse style buckets. Each style costs two strokes, independent of shot count.
    // The width follows the largest radius in that weapon stream; length follows every shot.
    this.tracerGroups ||= Object.fromEntries(Object.keys(TRACER_STYLES).map(k=>[k,[]]));
    const groups=this.tracerGroups;
    for(const kind in groups)groups[kind].length=0;
    for(const b of items){
      if(!b||b.x< -50||b.x>W+50||b.y< -60||b.y>H+50)continue;
      const kind=b.kind||'shot';
      if(SPECIAL_SHOTS.has(kind)||kind==='escort'&&b.style==='rocket')continue;
      (kind==='escort'&&b.style==='rail'?groups.railEscort:groups[kind]||groups.shot).push(b);
    }
    c.save();c.lineCap='round';
    for(const kind in groups){
      const group=groups[kind];
      if(!group.length)continue;
      const style=TRACER_STYLES[kind];let radius=0;
      c.beginPath();
      for(const b of group){
        const r=b.r||4;radius=Math.max(radius,r);
        const len=style.length+tracerGrowth(r)*4;
        const vx=b.vx||0,vy=b.vy??-760,speed=Math.hypot(vx,vy)||1,dx=vx/speed,dy=vy/speed;
        c.moveTo(b.x-dx*len,b.y-dy*len);c.lineTo(b.x+dx*5,b.y+dy*5);
      }
      const width=style.width+tracerGrowth(radius)*.65;
      c.globalAlpha=1/(1+Math.max(0,radius-6.5)*.06);
      c.strokeStyle=style.jacket;c.lineWidth=width;c.stroke();c.globalAlpha=1;
      c.strokeStyle=style.core;c.lineWidth=Math.max(.85,width*.36);c.stroke();
    }
    for(const b of items){
      if(!b||b.x< -50||b.x>W+50||b.y< -60||b.y>H+50)continue;
      const escortRocket=b.kind==='escort'&&b.style==='rocket';
      const k=escortRocket?'missile':b.kind;if(!SPECIAL_SHOTS.has(k))continue;
      const x=b.x,y=b.y,speed=Math.hypot(b.vx||0,b.vy||-1),dx=(b.vx||0)/speed,dy=(b.vy||-1)/speed;
      if(k==='flak'){
        line(c,[x-dx*9,y-dy*9,x+dx*3,y+dy*3],'rgba(162,208,255,.6)',2);
        if((b.age||0)>.18)line(c,[x-4,y-3,x+4,y+3],'rgba(185,231,255,.4)',1);
      }else if(k==='reflect'){
        poly(c,[x,y-7,x+4,y,x,y+7,x-4,y],'rgba(157,255,232,.6)');
      }else{
        const heavy=k==='torpedo',homing=k==='sidewinder';
        c.save();c.translate(x,y);c.rotate(Math.atan2(dy,dx)+Math.PI/2);
        if(homing){
          // Swept fins and a pale gold jacket echo the M rack token.
          poly(c,[-5,8,-2,-3,0,-13,2,-3,5,8,0,4],'rgba(255,214,142,.6)','#fff3d1',.8);
          line(c,[0,7,0,17],'rgba(255,214,142,.38)',1.5);
        }else if(heavy){
          poly(c,[-6,12,-5,-8,0,-20,5,-8,6,12,0,8],'rgba(152,167,255,.6)','#d4dcff',1.3);
          line(c,[-2,-6,-2,9],'rgba(245,244,255,.8)',1.5);
          line(c,[0,12,0,32],'rgba(166,183,255,.4)',3);
        }else if(escortRocket){
          poly(c,[-3,5,-2,-4,0,-10,2,-4,3,5],'rgba(117,255,197,.55)','#c2ffe2',.8);
          line(c,[0,6,0,13],'rgba(117,255,197,.35)',1.2);
        }else{
          poly(c,[-4,9,-3,-7,0,-15,3,-7,4,9,0,6],'rgba(125,218,255,.6)','#d8fbff',1);
          line(c,[0,9,0,23],'rgba(111,225,255,.4)',2);
        }
        c.restore();
      }
    }
    c.restore();
  }
  arsenalCraft(p,t){
    if(!p||p.dead)return;
    const c=this.ctx,ship=p.shipId||'kestrel';
    for(const slot of p.escortSlots||[]){
      c.save();c.translate(slot.x,slot.y);c.rotate((p.bank||0)*.13+Math.sin(t*3+(slot.rank||0))*.025);
      if(p.empTime>0){
        poly(c,[0,-16,6,-2,17,7,0,13,-17,7,-6,-2],'#202033','#736583',1.5);
        for(let i=0;i<4;i++){const y=-10+i*7;line(c,[-13,y,Math.sin(t*23+i)*8,y-2,13,y+1],i%2?'#ba9dc9':'#594c73',1);}
        c.restore();continue;
      }
      c.globalAlpha=.55;c.drawImage(this.lightSprites.cool,-15,2,30,39);c.globalAlpha=1;
      if(!drawCraft(c,ship,0,0,ship==='manta'?39:34,36,true))
        poly(c,[0,-16,5,-3,17,7,4,6,0,14,-4,6,-17,7,-5,-3],'#8eafb9','#c5f9ff',1);
      c.restore();
    }
    for(const o of p.orbitals||[]){
      const ready=1-clamp((o.cool||0)/.6,0,1);
      c.save();c.translate(o.x,o.y);c.rotate(o.angle||0);c.globalAlpha=.35+ready*.6;
      poly(c,[0,-10,7,0,0,10,-7,0],'#182841','#cbbcff',1.5);
      oval(c,0,0,3,3,ready>.8?'#dfffff':'#665b8d');
      c.beginPath();c.arc(0,0,14,-Math.PI/2,-Math.PI/2+TAU*ready);c.strokeStyle='#b8caff';c.lineWidth=1.5;c.stroke();c.restore();
    }
    c.save();
    if(p.reflector>0){
      const low=p.reflector<2,flash=this.impacts.some(f=>f.type==='reflect'&&f.age<.13);
      c.globalAlpha=low?.35+.55*Math.sin(t*16)**2:.8;
      c.setLineDash([8,7]);c.lineDashOffset=-t*12;
      oval(c,p.x,p.y,54,54,flash?'#efffff':'#b3a4ff',true,flash?2.5:1.3);c.setLineDash([]);
      for(let i=0;i<3;i++){
        const a=t*1.8+i*TAU/3;c.beginPath();c.arc(p.x,p.y,58,a,a+.65);c.strokeStyle='#b7faff';c.lineWidth=1;c.stroke();
      }
    }
    if(p.magnetBoost>0){
      const phase=1-clamp(p.magnetBoost/.35,0,1),r=67+phase*38;
      c.globalAlpha=.6*(1-phase*.65);c.setLineDash([4,6]);c.lineDashOffset=-t*24;
      oval(c,p.x,p.y,r,r,'#afffe8',true,2.2);c.setLineDash([]);
      c.globalAlpha=.8;c.font='bold 9px monospace';c.textAlign='center';
      c.fillStyle='#0a2936';c.fillRect(p.x-24,p.y-84,48,13);
      c.fillStyle='#c8fff0';c.fillText('MAGNET',p.x,p.y-74);
    }
    c.restore();
  }
  shieldAura(p){
    if(!p||p.dead||!(p.shield>0))return;
    const c=this.ctx,charges=Math.min(p.shieldCap||3,p.shield),rx=26+(charges-1)*4,ry=30+(charges-1)*4;
    c.save();
    // A clear centre and a soft rim read as a bubble over the opaque airframe.
    const rim=c.createRadialGradient(p.x,p.y,12,p.x,p.y,ry);
    rim.addColorStop(0,'rgba(111,247,237,0)');rim.addColorStop(.65,'rgba(111,247,237,.015)');rim.addColorStop(1,'rgba(111,247,237,.12)');
    oval(c,p.x,p.y,rx,ry,rim);
    for(let i=0;i<charges;i++)oval(c,p.x,p.y,26+i*4,30+i*4,'rgba(111,247,237,'+(.35-i*.055)+')',true,1.2);
    c.restore();
  }
  pickups(items,t) {
    const c=this.ctx;
    for(const p of items){
      if(!p||p.dead)continue;const [glyph,col,shape]=PICKUP_THEMES[p.type]||PICKUP_THEMES.power;
      c.save();
      if(p.salvage&&p.life<2.5)c.globalAlpha=Math.sin((p.age||t)*22)>0?1:.45;
      const x=p.x||0,y=(p.y||0)+Math.sin(t*4+x)*2;
      const r=(p.r||16)*(p.salvage?1.25:1)+Math.sin(t*5+x)*.6;
      c.translate(x,y);
      if(p.salvage){
        line(c,[0,-r-5,0,-r-22],col,2.2);
        line(c,[-5,-r-14,0,-r-22,5,-r-14],col,1.5);
        c.setLineDash([5,5]);c.lineDashOffset=-t*18;
        oval(c,0,0,r+6,r+6,'#fff6d6',true,1.6);c.setLineDash([]);
      }
      oval(c,0,0,r+2,r+2,'rgba(3,12,24,.95)');
      // Geometry as well as hue identifies each reward in a crowded salvage field.
      if(shape==='circle'||shape==='ring'){
        oval(c,0,0,r,r,'#10283a');oval(c,0,0,r,r,col,true,2);
        if(shape==='ring')oval(c,0,0,r-4,r-4,col,true,1);
      }else{
        let points;
        if(shape==='diamond')points=[0,-r,r,0,0,r,-r,0];
        else if(shape==='chevron')points=[-r,-r*.6,0,-r*.15,r,-r*.6,r*.7,r*.7,0,r*.3,-r*.7,r*.7];
        else if(shape==='hexagon')points=[-r,-r*.5,0,-r,r,-r*.5,r,r*.5,0,r,-r,r*.5];
        else if(shape==='star'){
          points=[];for(let i=0;i<10;i++){const a=i*TAU/10-Math.PI/2,d=i%2?r*.63:r+2;points.push(Math.cos(a)*d,Math.sin(a)*d);}
        }else points=[-r*.85,-r*.85,r*.85,-r*.85,r*.85,r*.85,-r*.85,r*.85];
        poly(c,points,'#10283a',col,2);
      }
      c.fillStyle=col;c.font='900 '+Math.round(r*.95)+'px monospace';c.textAlign='center';c.textBaseline='middle';c.fillText(glyph,0,1);
      if(p.salvage){
        c.fillStyle='#071622';c.fillRect(-16,r-3,32,14);c.fillStyle=col;c.font='bold 11px monospace';c.fillText('×'+(p.value||1),0,r+4);
      }
      c.restore();
    }
  }

  particles(items) {
    const c=this.ctx;c.save();c.globalCompositeOperation='lighter';
    for(const p of items) {
      if(!p)continue;
      const a=clamp((p.life??1)/(p.maxLife||1),0,1);
      const r=clamp((p.size||2)*Math.max(.25,a),.4,22);
      const x=p.x||0,y=p.y||0;
      const color=PARTICLE_PALETTE[p.color]||p.color||'#f5ba7e';
      c.globalAlpha=IMPACT_PARTICLES.has(p.kind)?Math.min(.55,a):a;
      if(p.kind==='ring') oval(c,x,y,(1-a)*43+r,(1-a)*43+r,color,true,Math.max(1,a*3));
      else {
        if(p.vx||p.vy)line(c,[x,y,x-(p.vx||0)*.026*a,y-(p.vy||0)*.026*a],color,Math.max(1,r*.75));
        oval(c,x,y,r,r,color);
      }
    }
    c.restore();
  }
  foreground(t,flash) {
    const c=this.ctx;
    c.drawImage(this.foregroundShade,0,0);
    if(flash>0) {c.fillStyle='rgba(255,238,201,'+clamp(flash,0,.7)+')';c.fillRect(0,0,W,H);}
  }
}
export default Renderer;
