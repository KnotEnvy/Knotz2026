// Cached procedural sea, coast and cloud geography for Storm Atlas.
import { coastWaterAt } from './art.js';
import { lightningAt, bossWarningProgress, interludeProgress } from './timeline.js';
const W=540,H=1400,TAU=Math.PI*2;
const hash=n=>{const v=Math.sin(n*127.1+31.7)*43758.5453;return v-Math.floor(v);};
const pal=[
  {shelf:'rgba(64,183,178,.14)',reef:'rgba(125,219,207,.18)',foam:'rgba(222,248,230,.42)',sand:'#cdbb89',land:'#426d62',high:'#779276',shade:'#244d50',tree:'#285e51',water:'rgba(174,228,227,.16)'},
  {shelf:'rgba(73,150,168,.13)',reef:'rgba(146,197,193,.13)',foam:'rgba(224,229,209,.31)',sand:'#9e9680',land:'#566763',high:'#827d72',shade:'#334650',tree:'#3b5554',water:'rgba(175,208,216,.13)'},
  {shelf:'rgba(73,126,168,.13)',reef:'rgba(150,170,210,.12)',foam:'rgba(202,222,239,.24)',sand:'#788497',land:'#354d63',high:'#68788e',shade:'#20374f',tree:'#2c4860',water:'rgba(165,199,227,.12)'}
];
const fade=(y,a,b)=>Math.pow(Math.max(0,Math.sin(Math.PI*(y-a)/(b-a))),.62);
function coastline(y,a,b,seed){
  const e=fade(y,a,b);
  const bay=135*Math.exp(-Math.pow((y-(a+b)*.5)/(b-a)*5.1,2));
  return -22+e*(105+34*Math.sin(y*.011+seed)+22*Math.sin(y*.025-seed*.7)+bay);
}
function coastPath(c,a,b,seed,side,offset=()=>0) {
  c.beginPath();
  c.moveTo(side<0?-50:W+50,a);
  for(let y=a;y<=b;y+=10){
    const x=coastline(y,a,b,seed)+offset(y);
    c.lineTo(side<0?x:W-x,y);
  }
  c.lineTo(side<0?-50:W+50,b);c.closePath();
}
function coastPoint(y,a,b,seed,side){const x=coastline(y,a,b,seed);return side<0?x:W-x;}
function seaMaterial(c,stage){
  const lit=stage===1?'111,205,186':stage===2?'139,185,181':'115,151,198';
  const deep=stage===1?'2,34,51':stage===2?'5,30,48':'4,22,51';
  // Soft water masses and grouped glints stay outside the central fire lane.
  c.save();c.beginPath();c.rect(0,0,191,H);c.rect(349,0,W-349,H);c.clip();
  for(let i=0;i<20;i++){
    const side=i%2===0?-1:1;
    const x=side<0?38+hash(i*17+stage*3)*154:W-38-hash(i*17+stage*3)*154;
    const y=-80+hash(i*29+stage*11)*1560;
    const rx=36+hash(i*41+stage)*63,ry=95+hash(i*13+stage)*125;
    const rgb=i%5===0?deep:lit,alpha=i%5===0?.13:.078;
    c.save();c.translate(x,y);c.scale(rx/ry,1);
    const g=c.createRadialGradient(0,0,ry*.12,0,0,ry);
    g.addColorStop(0,'rgba('+rgb+','+alpha+')');
    g.addColorStop(.53,'rgba('+rgb+','+(alpha*.46)+')');
    g.addColorStop(1,'rgba('+rgb+',0)');
    c.fillStyle=g;c.fillRect(-ry,-ry,ry*2,ry*2);c.restore();
  }
  for(let i=0;i<205;i++){
    const side=i%2===0?-1:1;
    const x=side<0?19+hash(i*37+stage)*176:W-19-hash(i*37+stage)*176;
    const y=hash(i*53+stage*13)*H,len=8+hash(i*23+stage)*24;
    c.strokeStyle='rgba('+lit+','+(i%6===0?.12:.075)+')';
    c.lineWidth=i%9===0?1.35:.75;
    c.beginPath();c.moveTo(x-len*.5,y);c.quadraticCurveTo(x,y-2,x+len*.5,y+1);c.stroke();
    if(i%3===0){c.beginPath();c.moveTo(x-len*.32,y+5);c.lineTo(x+len*.12,y+5);c.stroke();}
  }
  c.restore();
}
function coast(c,stage,side,a,b,seed) {
  const p=pal[stage-1],sign=side<0?1:-1;
  // Shallow water widens and narrows independently from the land outline.
  coastPath(c,a,b,seed,side,y=>25+16*Math.sin(y*.019+seed*2)+11*Math.sin(y*.047));
  c.fillStyle=p.shelf;c.fill();
  coastPath(c,a,b,seed,side,y=>12+9*Math.sin(y*.022+seed));
  c.fillStyle=p.reef;c.fill();
  coastPath(c,a,b,seed,side,y=>7);
  c.fillStyle='rgba(1,19,34,.23)';c.fill();
  coastPath(c,a,b,seed,side);
  c.fillStyle=p.land;c.fill();
  c.save();coastPath(c,a,b,seed,side);c.clip();
  // Broad sunward planes, stream valleys and forest clusters are inside land.
  for(let i=0;i<29;i++){
    const y=a+hash(i*21+seed*19)*(b-a),x=coastPoint(y,a,b,seed,side)-sign*(25+hash(i*29+seed)*100);
    const rx=20+hash(i*17+seed)*66,ry=12+hash(i*33+seed)*47;
    c.fillStyle=i%3?p.shade:p.high;
    c.beginPath();c.ellipse(x,y,rx,ry,hash(i*7+seed)*.6-.3,0,TAU);c.fill();
  }
  for(let i=0;i<195;i++){
    const y=a+hash(i*41+seed*7)*(b-a),x=coastPoint(y,a,b,seed,side)-sign*(8+hash(i*13+seed*5)*170);
    const r=1.3+hash(i*23+seed)*3.4;
    c.fillStyle=i%5===0?p.high:p.tree;
    c.beginPath();c.ellipse(x,y,r*1.6,r,hash(i*3+seed),0,TAU);c.fill();
  }
  for(let i=0;i<12;i++){
    const y=a+40+i*(b-a-80)/11,x=coastPoint(y,a,b,seed,side)-sign*52;
    c.beginPath();c.moveTo(x-sign*30,y-25);c.quadraticCurveTo(x+sign*2,y-7,x+sign*27,y+19);
    c.strokeStyle=stage===1?'rgba(207,225,177,.12)':'rgba(207,210,194,.1)';
    c.lineWidth=3;c.stroke();
  }
  c.restore();
  // Narrow beach is discontinuous; gaps expose rock and mangrove roots.
  for(let i=0;i<42;i++){
    if(hash(i*27+seed*12)<.36)continue;
    const y=a+24+i*(b-a-48)/42;
    const x=coastPoint(y,a,b,seed,side);
    const width=2+hash(i*19+seed)*5;
    c.beginPath();c.moveTo(x-sign*width,y-2);
    c.lineTo(x+sign*(1+hash(i*31+seed)*2),y+10);
    c.strokeStyle=i%5===0?p.foam:p.sand;c.lineWidth=i%7===0?2.2:1.2;c.stroke();
  }
  // Surf follows short, separated stretches of the irregular coast.
  for(let i=0;i<78;i++){
    if(hash(i*23+seed*17)<.39)continue;
    const y=a+12+hash(i*47+seed*29)*(b-a-36);
    const span=7+hash(i*31+seed)*23,offset=7+hash(i*11+seed)*10;
    c.beginPath();
    for(let j=0;j<=4;j++){
      const yy=Math.min(b-7,y+span*j/4);
      const xx=coastPoint(yy,a,b,seed,side)+sign*(offset+Math.sin(j*1.6+i)*2.2);
      if(j===0)c.moveTo(xx,yy);else c.lineTo(xx,yy);
    }
    c.strokeStyle=p.foam;c.lineWidth=.65+hash(i*7+seed)*1.05;c.stroke();
    if(i%4===0){
      const yy=y+span*.55,xx=coastPoint(yy,a,b,seed,side)+sign*(offset+7);
      c.beginPath();c.moveTo(xx,yy);c.lineTo(xx+sign*(3+hash(i*3+seed)*6),yy+1);
      c.strokeStyle=p.water;c.lineWidth=.8;c.stroke();
    }
  }
}
function islandPath(c,x,y,rx,ry,seed,shift=0){
  c.beginPath();
  for(let j=0;j<=44;j++){
    const a=j*TAU/44,noise=1+.16*Math.sin(a*3+seed)+.11*Math.cos(a*7-seed*2)+.055*Math.sin(a*13+seed*3);
    const px=x+Math.cos(a)*rx*noise+Math.sin(a*2+seed)*shift;
    const py=y+Math.sin(a)*ry*noise;
    if(j===0)c.moveTo(px,py);else c.lineTo(px,py);
  }
  c.closePath();
}
function island(c,stage,x,y,rx,ry,seed){
  const p=pal[stage-1],g=c.createRadialGradient(x,y,rx*.15,x,y,rx*1.8);
  g.addColorStop(0,p.shelf);g.addColorStop(.55,p.reef);g.addColorStop(1,'rgba(52,163,183,0)');
  c.fillStyle=g;c.fillRect(x-rx*1.9,y-ry*2.3,rx*3.8,ry*4.6);
  islandPath(c,x+3,y+10,rx*1.04,ry*1.04,seed+.17,4);
  c.fillStyle='rgba(2,24,39,.25)';c.fill();
  islandPath(c,x,y,rx,ry,seed,3);c.fillStyle=p.land;c.fill();
  c.save();islandPath(c,x,y,rx,ry,seed,3);c.clip();
  c.fillStyle=p.high;c.beginPath();c.ellipse(x-rx*.23,y-ry*.22,rx*.56,ry*.36,-.3,0,TAU);c.fill();
  c.fillStyle=p.shade;c.beginPath();c.ellipse(x+rx*.18,y+ry*.2,rx*.56,ry*.4,-.1,0,TAU);c.fill();
  for(let i=0;i<32;i++){
    const xx=x+(hash(i*17+seed)-.5)*rx*1.65,yy=y+(hash(i*29+seed)-.5)*ry*1.5;
    c.fillStyle=i%3?p.tree:p.high;
    c.beginPath();c.ellipse(xx,yy,1+hash(i+seed)*2.5,1.5,0,0,TAU);c.fill();
  }
  c.restore();
  for(let i=0;i<15;i++){
    const a=(i+.35*Math.sin(i*2+seed))*TAU/15;
    const xx=x+Math.cos(a)*rx*1.12,yy=y+Math.sin(a)*ry*1.13;
    c.beginPath();c.moveTo(xx-3,yy);c.lineTo(xx+2,yy-1);
    c.strokeStyle=i%3?p.foam:p.sand;c.lineWidth=i%4===0?1.8:.9;c.stroke();
  }
}
function boat(c,x,y,stage){
  const p=pal[stage-1];
  c.strokeStyle=p.foam;c.lineWidth=1.15;
  c.beginPath();c.moveTo(x-2,y+19);c.lineTo(x-10,y+55);c.moveTo(x+2,y+19);c.lineTo(x+10,y+55);c.stroke();
  for(let i=0;i<6;i++){
    const yy=y+36+i*11;
    c.beginPath();c.moveTo(x-8-i*2,yy);c.lineTo(x+8+i*2,yy);
    c.strokeStyle=p.water;c.stroke();
  }
  c.fillStyle=stage===1?'#173b4c':stage===2?'#414c56':'#263c56';
  c.strokeStyle=p.foam;c.lineWidth=.8;
  c.beginPath();c.moveTo(x,y-21);c.lineTo(x-6,y-10);c.lineTo(x-7,y+14);c.lineTo(x,y+23);c.lineTo(x+7,y+14);c.lineTo(x+6,y-10);c.closePath();c.fill();c.stroke();
  c.fillStyle=stage===2?'#c49675':'#bac6b4';c.fillRect(x-3,y-7,6,8);
}
export function drawAtlasScenery(c,stage){
  const p=pal[stage-1];
  seaMaterial(c,stage);
  // Surface grain is baked once: broad currents, scattered foam and fine stipple.
  for(let i=0;i<18;i++){
    const y=i*93-25,x=hash(i*17+stage*7)*W;
    c.beginPath();c.moveTo(x-230,y-13);
    c.bezierCurveTo(x-80,y+25,x+105,y-21,x+245,y+35);
    c.strokeStyle=stage===1?'rgba(3,39,70,.1)':'rgba(3,23,51,.12)';
    c.lineWidth=35+hash(i*13)*42;c.stroke();
  }
  for(let i=0;i<1080;i++){
    const x=hash(i*17+stage*23)*W,y=hash(i*31+stage*13)*H;
    const len=.6+Math.pow(hash(i*47+5),3)*19;
    c.beginPath();c.moveTo(x,y);c.lineTo(x+len,y+(i%11===0?1:0));
    c.strokeStyle=i%9===0?p.foam:p.water;c.lineWidth=i%17===0?1.5:.65;c.stroke();
  }
  // Intertidal broken ripples collect near land without tracing another ring.
  for(let i=0;i<230;i++){
    const y=hash(i*53+stage*3)*H;
    const left=y>50&&y<930;
    const right=y>970&&y<1395;
    if(!left&&!right)continue;
    const coastX=left?coastline(y,50,930,1.3):W-coastline(y,970,1395,3.7);
    const x=coastX+(left?1:-1)*(8+hash(i*37+stage)*95);
    const length=2+hash(i*11+stage)*9;
    c.beginPath();c.moveTo(x,y);c.lineTo(x+length,y-1);
    c.strokeStyle=i%7===0?p.foam:p.water;c.lineWidth=i%13===0?1.2:.6;c.stroke();
  }
  // A long landmass with a deep inlet arrives from the left, then recedes.
  // Secondary coast on the right makes the travel seam into another sea reach.
  coast(c,stage,-1,50,930,1.3);
  coast(c,stage,1,970,1395,3.7);
  const isles=stage===1?[[427,330,45,39,1],[120,1070,37,26,2],[397,1150,24,41,3]]:
    stage===2?[[432,320,40,34,1],[133,1080,32,29,2],[410,1130,30,19,3]]:
    [[426,323,43,31,1],[133,1080,35,25,2]];
  isles.forEach(([x,y,rx,ry,seed])=>island(c,stage,x,y,rx,ry,seed));
  boat(c,stage===1?352:331,238,stage);
  boat(c,stage===3?213:376,785,stage);
}
function cloudOutline(c,x,y,rx,ry,seed){
  c.beginPath();
  for(let i=0;i<=36;i++){
    const q=i/36,xx=x-rx+2*rx*q,arc=Math.sqrt(Math.max(0,1-Math.pow(2*q-1,2)));
    const yy=y-ry*(.10+.74*arc)+Math.sin(q*13+seed)*ry*.065+Math.sin(q*31-seed)*ry*.035;
    if(i===0)c.moveTo(xx,yy);else c.lineTo(xx,yy);
  }
  for(let i=36;i>=0;i--){
    const q=i/36,xx=x-rx+2*rx*q,arc=Math.sqrt(Math.max(0,1-Math.pow(2*q-1,2)));
    const yy=y+ry*(.10+.43*arc)+Math.sin(q*17+seed*2)*ry*.035;
    c.lineTo(xx,yy);
  }
  c.closePath();
}
function cloudLobe(c,x,y,rx,ry,stage,opacity){
  const rgb=stage===1?'244,250,242':stage===2?'241,230,211':'212,220,238';
  c.save();c.translate(x,y);c.scale(1,ry/rx);
  const g=c.createRadialGradient(-rx*.18,-rx*.22,rx*.05,0,0,rx);
  g.addColorStop(0,'rgba('+rgb+','+opacity+')');
  g.addColorStop(.52,'rgba('+rgb+','+(opacity*.65)+')');
  g.addColorStop(1,'rgba('+rgb+',0)');
  c.fillStyle=g;c.fillRect(-rx,-rx,rx*2,rx*2);c.restore();
}
function largeCloud(c,x,y,rx,ry,stage,seed){
  const dark=stage===1?'21,58,72':stage===2?'45,49,65':'24,35,68';
  const mid=stage===1?'149,186,181':stage===2?'168,159,156':'135,148,178';
  const bright=stage===1?'235,248,235':stage===2?'240,225,203':'207,216,240';
  // Airborne body casts a displaced shadow on the distant water.
  c.save();c.translate(x+18,y+ry*.62);c.scale(1,.55);
  const shade=c.createRadialGradient(0,0,rx*.18,0,0,rx*1.3);
  shade.addColorStop(0,'rgba('+dark+',.29)');
  shade.addColorStop(1,'rgba('+dark+',0)');
  c.fillStyle=shade;c.fillRect(-rx*1.3,-rx*1.3,rx*2.6,rx*2.6);c.restore();
  // A blurred silhouette gives the mass an atmospheric edge.
  c.save();c.filter='blur(14px)';
  cloudOutline(c,x,y,rx,ry,seed);
  c.fillStyle='rgba('+mid+',.23)';c.fill();c.restore();
  cloudOutline(c,x,y,rx,ry,seed);
  const body=c.createLinearGradient(x,y-ry,x,y+ry*.65);
  body.addColorStop(0,'rgba('+bright+','+(stage===1?.42:.30)+')');
  body.addColorStop(.47,'rgba('+mid+','+(stage===1?.43:.36)+')');
  body.addColorStop(1,'rgba('+dark+','+(stage===1?.43:.37)+')');
  c.fillStyle=body;c.fill();
  // Upper crowns are broad and uneven; each has its own lit top.
  for(let i=0;i<8;i++){
    const u=(i-3.5)/4,px=x+u*rx*.78;
    const py=y-ry*(.28+.15*Math.sin(i*1.7+seed));
    const lrx=rx*(.20+hash(i*19+seed)*.10);
    cloudLobe(c,px,py,lrx,ry*(.31+hash(i*13+seed)*.13),stage,
      stage===1?.56:stage===2?.43:.38);
  }
  // Broken underbelly and a few wisps prevent an even capsule silhouette.
  for(let i=0;i<9;i++){
    const u=(i-4)/4,px=x+u*rx*.74;
    c.beginPath();c.ellipse(px,y+ry*(.28+.08*Math.sin(i*2.1+seed)),
      rx*(.10+hash(i*23+seed)*.05),ry*.11,0,0,TAU);
    c.fillStyle='rgba('+dark+','+(.09+hash(i*11+seed)*.07)+')';c.fill();
  }
  for(let i=0;i<5;i++){
    const px=x-rx*.66+i*rx*.33,py=y-ry*.48+Math.sin(i+seed)*ry*.12;
    c.beginPath();c.moveTo(px,py);c.lineTo(px+rx*.08,py-ry*.035);
    c.strokeStyle='rgba('+bright+',.19)';c.lineWidth=1.3;c.stroke();
  }
}
export function drawAtlasClouds(c,stage){
  // One large weather front per scroll tile moves faster than the shore.
  const x=stage===1?440:stage===2?438:455;
  const y=stage===1?1120:stage===2?1040:790;
  largeCloud(c,x,y,205,123,stage,stage*.9);
  // Small distant scraps support scale without occupying the firing lane.
  cloudLobe(c,stage===2?80:64,stage===3?1190:360,62,22,stage,.14);
  cloudLobe(c,stage===1?490:18,stage===2?260:1320,75,25,stage,.13);
}

// ---------------------------------------------------------------------------
// Living world ambience. Sector life, weather, lightning and sector transitions.
// Everything here draws beneath enemies, bullets and the player, at low contrast,
// so hostile fire and the player core stay the clearest things on the field.
// Sprites are baked once; per-frame work is batched paths and cached blits.
// ---------------------------------------------------------------------------
const FW=540,FH=900,GROUND_RATE=.29;
const noise=n=>{const v=Math.sin(n*91.345+47.853)*24634.6345;return v-Math.floor(v);};
const ease=(a,b,v)=>{const x=Math.max(0,Math.min(1,(v-a)/(b-a)));return x*x*(3-2*x);};
function canvasOf(w,h){
  const c=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(w,h):document.createElement('canvas');
  c.width=w;c.height=h;return c;
}
function bake(w,h,draw){const c=canvasOf(w,h);draw(c.getContext('2d'),w,h);return c;}
function softBlob(c,x,y,rx,ry,rgb,alpha,mid=.5){
  c.save();c.translate(x,y);c.scale(1,ry/rx);
  const g=c.createRadialGradient(0,0,0,0,0,rx);
  g.addColorStop(0,'rgba('+rgb+','+alpha+')');g.addColorStop(mid,'rgba('+rgb+','+(alpha*.55)+')');g.addColorStop(1,'rgba('+rgb+',0)');
  c.fillStyle=g;c.fillRect(-rx,-rx,rx*2,rx*2);c.restore();
}
function glowSprite(size,rgb,core=.55){
  return bake(size,size,(c,w)=>{
    const g=c.createRadialGradient(w/2,w/2,0,w/2,w/2,w/2);
    g.addColorStop(0,'rgba('+rgb+','+core+')');g.addColorStop(.3,'rgba('+rgb+','+(core*.42)+')');
    g.addColorStop(.7,'rgba('+rgb+','+(core*.1)+')');g.addColorStop(1,'rgba('+rgb+',0)');
    c.fillStyle=g;c.fillRect(0,0,w,w);
  });
}
// Interlude cloud palettes: 1 Shallows, 2 Storm Wall, 3 The Crown, 4 dawn after the final flagship.
const COVER={
  1:{fog:'#8fc3c0',lit:'226,246,236',body:'120,170,172',shade:'52,96,108'},
  2:{fog:'#5c6a7c',lit:'196,208,222',body:'98,112,130',shade:'40,48,62'},
  3:{fog:'#3e3058',lit:'200,168,236',body:'86,66,120',shade:'32,22,52'},
  4:{fog:'#e6b48a',lit:'255,244,222',body:'242,196,150',shade:'176,112,96'}
};

export class WorldAmbience {
  constructor(){
    this.reduced=false;this.clock=0;this.dt=0;this.gameT=0;this.travel=0;this.stage=0;
    this.cover=0;this.lines=0;this.flow=0;this.boatTimer=2;this.rngState=26042019;
    this.boats=[0,1,2].map(()=>({active:false,gx:0,gy:0,vx:0,vy:0,angle:0,kind:0,wake:1}));
    this.buildSprites();
  }
  rand(){this.rngState=(Math.imul(1664525,this.rngState)+1013904223)>>>0;return this.rngState/4294967296;}
  buildSprites(){
    // Cloud shadows: broken soft lobes, darkest in the middle.
    this.shadows=[.82,.96,1.1].map((k,v)=>bake(Math.round(400*k),Math.round(290*k),c=>{
      c.scale(k,k);
      for(let i=0;i<9;i++){
        const a=i/9*Math.PI*2,r=60+noise(i*7+v*13)*55;
        softBlob(c,200+Math.cos(a)*r*1.1,145+Math.sin(a)*r*.62,70+noise(i*3+v)*55,52+noise(i*5+v)*30,'2,16,26',.13);
      }
      softBlob(c,200,145,150,95,'2,14,24',.16,.6);
    }));
    this.foam=bake(28,10,c=>softBlob(c,14,5,13,4,'236,252,246',.85,.4));
    this.glint=bake(16,8,c=>{softBlob(c,8,4,7.5,2.2,'255,246,222',.85,.3);softBlob(c,8,4,2.2,2.2,'255,253,244',1,.5);});
    this.ring=bake(32,32,c=>{c.strokeStyle='rgba(206,224,236,.9)';c.lineWidth=1.4;c.beginPath();c.arc(16,16,13.5,0,Math.PI*2);c.stroke();});
    this.wake=bake(70,170,c=>{
      // Kelvin wake: two diverging foam arms and a churned centre line that thin out astern.
      for(let i=0;i<14;i++){
        const f=i/14,y=6+f*160,spread=5+f*28;
        c.globalAlpha=(1-f)*.55;
        softBlob(c,35-spread,y,4+f*5,2.4,'226,246,240',.7);softBlob(c,35+spread,y,4+f*5,2.4,'226,246,240',.7);
        c.globalAlpha=(1-f)*.45;softBlob(c,35+Math.sin(i*1.7)*2,y,5+f*4,4,'214,240,236',.6);
      }
      c.globalAlpha=1;
    });
    // Small craft, baked at 2x for clean edges. All point up (bow at -y).
    this.boatSprites=[0,1,2].map(kind=>bake(28,64,c=>{
      c.scale(2,2);c.translate(7,16);
      c.fillStyle='rgba(0,10,18,.35)';c.beginPath();c.ellipse(1.5,2,5.2,13,0,0,Math.PI*2);c.fill();
      if(kind===0){ // trawler
        c.fillStyle='#d9d4c4';c.beginPath();c.moveTo(0,-13);c.quadraticCurveTo(5.5,-6,4.6,11);c.lineTo(-4.6,11);c.quadraticCurveTo(-5.5,-6,0,-13);c.fill();
        c.fillStyle='#3e5660';c.fillRect(-3.2,-2,6.4,11);c.fillStyle='#b8473a';c.fillRect(-2.6,-7,5.2,5.2);
        c.fillStyle='#f2efe2';c.fillRect(-1.6,-6.2,3.2,1.6);c.strokeStyle='#6d7a7c';c.lineWidth=.6;c.beginPath();c.moveTo(0,1);c.lineTo(0,9);c.stroke();
      }else if(kind===1){ // sailboat with its sail cast to leeward
        c.fillStyle='#ece8dc';c.beginPath();c.moveTo(0,-12);c.quadraticCurveTo(4.4,-3,3.4,11);c.lineTo(-3.4,11);c.quadraticCurveTo(-4.4,-3,0,-12);c.fill();
        c.fillStyle='#8f7a5c';c.fillRect(-2,2,4,6);
        c.fillStyle='rgba(250,248,238,.92)';c.beginPath();c.moveTo(0,-9);c.quadraticCurveTo(8.5,-1,1,8);c.lineTo(0,8);c.closePath();c.fill();
        c.strokeStyle='rgba(60,70,72,.7)';c.lineWidth=.5;c.beginPath();c.moveTo(0,-9);c.lineTo(0,8);c.stroke();
      }else{ // harbour tug
        c.fillStyle='#2b3438';c.beginPath();c.moveTo(0,-12);c.quadraticCurveTo(6,-6,5.4,10);c.lineTo(-5.4,10);c.quadraticCurveTo(-6,-6,0,-12);c.fill();
        c.fillStyle='#6e4a36';c.fillRect(-3.2,-5,6.4,7);c.fillStyle='#9d9585';c.fillRect(-2.2,-4,4.4,2);
        c.fillStyle='#1b1f22';c.beginPath();c.arc(0,5.5,1.8,0,Math.PI*2);c.fill();
        c.fillStyle='rgba(255,214,140,.7)';c.fillRect(-.6,-11,1.2,1.2);
      }
    }));
    this.puff=bake(64,64,c=>softBlob(c,32,32,31,31,'88,92,102',.7,.45));
    this.fogBank=bake(660,230,c=>{
      for(let i=0;i<11;i++)softBlob(c,70+i*52+noise(i*3.3)*30,115+(noise(i*5.1)-.5)*50,90+noise(i*7.7)*60,46+noise(i)*24,'150,164,180',.17,.55);
    });
    const scud=(lit,v)=>bake(340,200,c=>{
      const rgbBody=lit?'214,226,255':'104,116,134',rgbTop=lit?'236,242,255':'146,158,176';
      for(let i=0;i<8;i++){
        const x=60+i*30+noise(i*4.4+v*9)*30,y=100+(noise(i*2.2+v*5)-.5)*60,r=48+noise(i*6.6+v)*40;
        softBlob(c,x,y,r,r*.62,rgbBody,lit?.42:.22,.5);
        softBlob(c,x-10,y-14,r*.64,r*.36,rgbTop,lit?.4:.14,.45);
      }
    });
    this.scud=[0,1,2].map(v=>scud(false,v));this.scudLit=[0,1,2].map(v=>scud(true,v));
    this.flashCool=glowSprite(320,'196,214,255',.62);this.flashRed=glowSprite(320,'255,104,138',.58);
    const pool=(size,rgb,core)=>bake(size,Math.round(size*.7),c=>{c.scale(1,.7);c.drawImage(glowSprite(size,rgb,core),0,0);});
    this.pools=[[96,128,160].map(s=>pool(s,'176,108,255',.5)),[96,128,160].map(s=>pool(s,'255,84,196',.45))];
    this.warmGlow=glowSprite(64,'255,166,92',.7);
    this.eye=bake(160,128,c=>softBlob(c,80,64,78,62,'4,2,16',.55,.4));
    this.sheen=bake(84,52,c=>{
      const g=c.createRadialGradient(42,26,6,42,26,40);
      g.addColorStop(0,'rgba(10,8,20,.5)');g.addColorStop(.45,'rgba(116,78,160,.22)');g.addColorStop(.62,'rgba(70,160,150,.16)');
      g.addColorStop(.78,'rgba(200,150,80,.1)');g.addColorStop(1,'rgba(0,0,0,0)');
      c.save();c.scale(1,.62);c.translate(0,16);c.fillStyle=g;c.fillRect(0,0,84,84);c.restore();
    });
    this.debris=[0,1,2,3].map(v=>bake(96,96,c=>{
      c.translate(48,48);c.scale(2,2);
      const metal=['#26232f','#2b2630','#232832','#29233a'][v];
      c.fillStyle='rgba(0,0,8,.4)';c.beginPath();c.ellipse(2,3,17,10,0,0,Math.PI*2);c.fill();
      c.fillStyle=metal;c.strokeStyle='rgba(188,160,236,.4)';c.lineWidth=.7;c.beginPath();
      if(v===0){c.moveTo(-15,-4);c.lineTo(-4,-9);c.lineTo(12,-5);c.lineTo(15,3);c.lineTo(2,8);c.lineTo(-12,5);}
      else if(v===1){c.moveTo(-6,-14);c.lineTo(5,-12);c.lineTo(7,13);c.lineTo(-5,14);}
      else if(v===2){c.moveTo(-16,0);c.lineTo(10,-8);c.lineTo(16,-3);c.lineTo(-10,7);}
      else{c.moveTo(-9,-9);c.lineTo(9,-10);c.lineTo(11,8);c.lineTo(-8,10);}
      c.closePath();c.fill();c.stroke();
      c.strokeStyle='rgba(18,12,24,.8)';c.lineWidth=1;c.beginPath();
      for(let i=-2;i<=2;i++){c.moveTo(i*5-2,-6);c.lineTo(i*5+1,6);}c.stroke();
      c.fillStyle='rgba(255,120,80,.32)';c.fillRect(-2,-2,2.5,1.6);
    }));
    this.coverPuffs={};
    for(const key of [1,2,3,4]){
      const p=COVER[key];
      // Cumulus: a shaded base, firm lobes and sunlit crowns, so the deck reads as cloud, not haze.
      // A broken cumulus bank seen from above: irregular lobes, shade only along the lower rim,
      // sunlit crowns towards the upper left. Wide rather than round so the deck reads as cloud.
      this.coverPuffs[key]=[0,1].map(v=>bake(384,224,c=>{
        for(let i=0;i<11;i++){
          const x=58+i*27+(noise(i*3.1+v*7)-.5)*26,y=128+(noise(i*5.3+v*3)-.5)*46,r=30+noise(i*7.7+v)*34;
          softBlob(c,x+8,y+14,r*1.05,r*.72,p.shade,.42,.62);
        }
        for(let i=0;i<13;i++){
          const x=52+i*24+(noise(i*2.3+v*5)-.5)*24,y=112+(noise(i*4.1+v*9)-.5)*52,r=26+noise(i*6.1+v*2)*30;
          softBlob(c,x,y,r,r*.78,p.body,.7,.7);
        }
        for(let i=0;i<9;i++){
          const x=60+i*30+(noise(i*8.3+v)-.5)*28,y=96+(noise(i*9.1+v*4)-.5)*40,r=18+noise(i*5.9+v*6)*22;
          softBlob(c,x-6,y-8,r,r*.62,p.lit,.6,.55);
        }
      }));
      this.wisps=this.wisps||{};
      this.wisps[key]=bake(24,240,c=>softBlob(c,12,120,11,118,p.lit,.75,.35));
    }
  }
  // Called once per frame before any ambient layer.
  begin(game,t,scroll,stage,step,reduced){
    this.reduced=!!reduced;this.game=game;this.gameT=t;
    const mode=game.mode||'playing';
    // The world keeps breathing at a slower rate while the end-of-run outro holds the action.
    const rate=mode==='paused'?0:mode==='victory'||mode==='gameover'?.35:1;
    this.dt=step*rate;this.clock+=this.dt;
    const travel=scroll*GROUND_RATE;
    if(stage!==this.stage||travel<this.travel-2||travel-this.travel>500){
      this.stage=stage;for(const b of this.boats)b.active=false;this.boatTimer=1.2;
    }
    this.travel=travel;
    this.strike=mode==='playing'||mode==='paused'?lightningAt(Number(game.time)||0,stage):null;
    this.updateTransition(game,stage);
  }
  // Water-surface life and low air, drawn right after the terrain.
  drawSurface(c,stage){
    c.save();
    if(stage===1){this.drawFoam(c,1);this.drawGlints(c);this.drawBoats(c,1);this.drawCloudShadows(c);}
    else if(stage===2){this.drawRipples(c);this.drawBoats(c,2);this.drawStacks(c);}
    else{this.drawPools(c);this.drawDebris(c);this.drawSpiral(c);}
    c.restore();
  }
  // Weather above the surface (still beneath enemies and fire).
  drawAir(c,stage){
    c.save();
    if(stage===1)this.drawBirds(c);
    else if(stage===2){this.drawFog(c);this.drawScud(c);this.drawRain(c);}
    else this.drawEmbers(c);
    if(this.strike)this.drawLightning(c,stage);
    c.restore();
  }
  // World-level tint for the flagship warning and the sector-clear cloud transition.
  drawTransitions(c,stage){
    const game=this.game;
    c.save();
    let dark=0,red=0;
    const warn=bossWarningProgress(game);
    if(warn>=0){const e=ease(0,1,warn);dark=.27*e;red=.12*e;}
    else if(game.boss&&game.mode!=='victory'){const e=Math.max(0,1-(Number(game.boss.age)||0)/2.5);dark=.27*e;red=.12*e;}
    if(dark>.003){c.globalAlpha=dark;c.fillStyle='#03060e';c.fillRect(-20,-20,FW+40,FH+40);}
    if(red>.003){c.globalAlpha=red;c.fillStyle='#6e1422';c.fillRect(-20,-20,FW+40,FH+40);}
    if(this.cover>.004||this.lines>.004)this.drawCover(c);
    c.restore();
  }
  updateTransition(game,stage){
    const ip=interludeProgress(game);
    const final=stage>=3||!!game.practiceStage;
    let cover=-1,lines=0;
    if(ip>=0&&game.mode==='playing'){
      this.palette=final?4:Math.min(3,stage+1);
      cover=ease(.5,.95,ip)*(final?.6:1);lines=ease(.16,.7,ip);
    }else if(game.mode==='playing'&&!game.boss&&!game.practiceStage&&Number(game.stageTime)<1.25){
      // A new sector opens out of the cloud deck the interlude ended in.
      this.palette=stage;const r=ease(0,1.15,Number(game.stageTime)||0);cover=1-r;lines=(1-r)*.85;
    }
    if(cover>=0){this.cover=cover;this.lines=lines;}
    else{this.cover=Math.max(0,this.cover-this.dt*.9);this.lines=Math.max(0,this.lines-this.dt*1.5);}
    this.flow+=this.dt*(.35+this.lines*2.6);
  }
  drawCover(c){
    const p=COVER[this.palette||1],puffs=this.coverPuffs[this.palette||1],cover=this.cover;
    if(cover>.004){
      // The deck closes almost completely as the sector swaps underneath it.
      const c2=cover*cover;c.globalAlpha=cover*.46+c2*c2*.44;c.fillStyle=p.fog;c.fillRect(-20,-20,FW+40,FH+40);
      for(let j=0;j<16;j++){
        const span=FH+420,y=(noise(j*3.1)*span+this.flow*560*(.7+noise(j*1.9)*.6))%span-210;
        const x0=noise(j*5.7)*(FW+160)-80,x=270+(x0-270)*(1+(1-cover)*1.7),w=300+noise(j*9.3)*240,h=w*.58;
        c.globalAlpha=Math.min(1,cover*1.05);c.drawImage(puffs[j%2],x-w/2,y-h/2,w,h);
      }
    }
    if(this.lines>.004){
      // Cloud wisps streaming past give the dive its speed.
      const wisp=this.wisps[this.palette||1],base=this.lines*(this.reduced?.16:.42);
      for(let i=0;i<24;i++){
        const span=FH+520,len=(140+noise(i*6.1)*180)*(.45+this.lines*.8);
        const y=(noise(i*2.3)*span+this.flow*1500*(.8+noise(i*.7)*.5))%span-len,x=noise(i*4.9)*FW,w=8+noise(i*8.3)*16;
        c.globalAlpha=base*(.45+noise(i*9.7)*.55);c.drawImage(wisp,x-w/2,y,w,len);
      }
    }
  }
  // --- Sector 1: The Shallows -------------------------------------------------
  drawGlints(c){
    // Sun glitter concentrates under the moving light shaft drawn by the renderer.
    const t=this.clock,sun=FW*.52+Math.sin(this.gameT*.23)*85,cell=26,top=-this.travel;
    const first=Math.max(0,Math.floor((sun-150)/cell)),last=Math.min(20,Math.floor((sun+150)/cell));
    for(let r=Math.floor((top-cell)/cell);r<=Math.floor((top+FH)/cell);r++)for(let col=first;col<=last;col++){
      const n=noise(r*41.3+col*7.1);if(n>.5)continue;
      const x=col*cell+noise(n*13)*cell,gy=r*cell+noise(n*29)*cell;
      const band=Math.exp(-((x-sun)*(x-sun))/7000);
      if(noise(n*53)>band*.75)continue;
      const tw=Math.sin(t*(4.5+n*7)+n*40);if(tw<.62)continue;
      if(coastWaterAt(1,x,gy)!==2)continue;
      const a=(tw-.62)/.38,size=.7+noise(n*61)*.6;c.globalAlpha=a*a*.6;
      c.drawImage(this.glint,x-8*size,gy+this.travel-4*size,16*size,8*size);
    }
  }
  drawFoam(c,stage){
    // Whitecaps break briefly and drift downwind; densest along reef and dock edges.
    const t=this.clock,cell=34,top=-this.travel,max=stage===1?.36:.26;
    for(let r=Math.floor((top-cell)/cell);r<=Math.floor((top+FH)/cell);r++)for(let col=0;col<16;col++){
      const n=noise(r*17.9+col*3.7+stage*.31);if(n>.5)continue;
      const x=col*cell+noise(n*11)*cell,gy=r*cell+noise(n*23)*cell;
      const water=coastWaterAt(stage,x,gy);if(!water)continue;
      if(noise(n*37)>(water===1?.62:.13))continue;
      const ph=(t/(2.2+n*3)+n*7)%1;if(ph>.5)continue;
      c.globalAlpha=Math.sin(ph*2*Math.PI)*max;
      const w=16+n*22;c.drawImage(this.foam,x+ph*8-w/2,gy+this.travel-3,w,w*.32);
    }
  }
  updateBoats(stage){
    const max=stage===1?3:2,dt=this.dt;let count=0;
    for(const b of this.boats){
      if(!b.active)continue;
      b.gx+=b.vx*dt;b.gy+=b.vy*dt;
      const sy=b.gy+this.travel;
      if(sy>FH+120||sy<-260||b.gx<-60||b.gx>FW+60)b.active=false;else count++;
    }
    this.boatTimer-=dt;
    if(count>=max||this.boatTimer>0)return;
    this.boatTimer=2.5+this.rand()*5;
    const b=this.boats.find(boat=>!boat.active);if(!b)return;
    const ground=(112+stage*25)*GROUND_RATE;
    for(let attempt=0;attempt<8;attempt++){
      const x=stage===1?120+this.rand()*300:(this.rand()<.5?150:338)+this.rand()*52,gy=-this.travel-70;
      const up=this.rand()<.5,speed=7+this.rand()*9;
      const angle=(up?0:Math.PI)+(this.rand()-.5)*(stage===1?.9:.25);
      const vx=Math.sin(angle)*speed,vy=-Math.cos(angle)*speed;
      const life=(FH+200)/Math.max(12,ground+vy);
      let clear=true;
      for(let s=0;s<=life&&clear;s+=1.2){
        const px=x+vx*s,py=gy+vy*s;
        clear=coastWaterAt(stage,px,py)===2&&coastWaterAt(stage,px-9,py)===2&&coastWaterAt(stage,px+9,py)===2&&coastWaterAt(stage,px,py-16)===2;
      }
      if(!clear)continue;
      Object.assign(b,{active:true,gx:x,gy,vx,vy,angle,kind:stage===2?2:this.rand()<.55?0:1,wake:.75+speed/20});
      return;
    }
  }
  drawBoats(c,stage){
    this.updateBoats(stage);
    for(const b of this.boats){
      if(!b.active)continue;
      c.save();c.translate(b.gx,b.gy+this.travel);c.rotate(b.angle);
      c.globalAlpha=stage===2?.5:.72;c.drawImage(this.wake,-40*b.wake,8,80*b.wake,190*b.wake);
      c.globalAlpha=stage===2?.8:.86;c.drawImage(this.boatSprites[b.kind],-9,-20,18,41);
      c.restore();
    }
  }
  drawCloudShadows(c){
    const span=FH+640;
    for(let i=0;i<2;i++){
      const pos=i*span/2+this.travel*1.25+this.clock*5,y=pos%span-320,cyc=Math.floor(pos/span);
      const sprite=this.shadows[(cyc+i)%3],x=60+noise(cyc*7.7+i*3)*420;
      c.globalAlpha=.9;c.drawImage(sprite,Math.round(x-sprite.width/2),Math.round(y-sprite.height/2));
    }
  }
  drawBirds(c){
    // A loose V of gulls flying our way but slower, so we overtake them; shadows fall on the water.
    const t=this.clock,period=22,k=Math.floor(t/period),age=t-k*period-noise(k*3.3)*4;
    if(age<0||age>12)return;
    const drift=(noise(k*1.7)-.5)*60,leadX=90+noise(k*4.1)*360+drift*age,leadY=-60+(72+noise(k*5.3)*20)*age;
    const count=5+Math.floor(noise(k*6.7)*5);
    for(let pass=0;pass<2;pass++){
      const ox=pass?0:20,oy=pass?0:30,s=pass?10:8.5;
      c.beginPath();
      for(let j=0;j<count;j++){
        const rank=Math.ceil(j/2),side=j%2?1:-1;
        const bx=leadX+side*rank*17+Math.sin(t*.9+j*1.3)*3+ox,by=leadY+rank*15+Math.cos(t*.7+j)*3+oy;
        const glide=Math.sin(t*.8+j*1.1)>.3,f=glide?.1:Math.sin(t*11+j*1.9);
        const tip=s*(.1+.32*f),elbow=s*(.28-.18*f);
        c.moveTo(bx-s,by+tip);c.quadraticCurveTo(bx-s*.5,by-elbow,bx,by);
        c.quadraticCurveTo(bx+s*.5,by-elbow,bx+s,by+tip);
        c.moveTo(bx,by-s*.28);c.lineTo(bx,by+s*.42);
      }
      c.globalAlpha=pass?.85:.22;c.strokeStyle=pass?'#f1f6ee':'#021622';c.lineWidth=pass?1.7:1.6;c.stroke();
    }
  }
  // --- Sector 2: Storm Wall ---------------------------------------------------
  gust(){const t=this.clock;return .5+.5*Math.sin(t*.31)*Math.sin(t*.83+.6);}
  drawRipples(c){
    // Rain rings on open water, batched into two strokes by brightness.
    const t=this.clock,cell=30,top=-this.travel;
    c.strokeStyle='#cfdeea';c.lineWidth=1;
    for(let bucket=0;bucket<2;bucket++){
      c.beginPath();
      for(let r=Math.floor((top-cell)/cell);r<=Math.floor((top+FH)/cell);r++)for(let col=0;col<18;col++){
        const n=noise(r*23.1+col*5.3);if(n>.34)continue;
        const ph=(t/(.7+n*.7)+n*5)%1;if((ph<.45)!==(bucket===0))continue;
        const x=col*cell+noise(n*7)*cell,gy=r*cell+noise(n*19)*cell;
        if(coastWaterAt(2,x,gy)!==2)continue;
        const rad=1.5+ph*6.5,sy=gy+this.travel;
        c.moveTo(x+rad,sy);c.ellipse(x,sy,rad,rad*.7,0,0,Math.PI*2);
      }
      c.globalAlpha=bucket?.1:.2;c.stroke();
    }
  }
  drawStacks(c){
    // Foundry stacks on the docks: wind-torn smoke and short-lived sparks.
    const t=this.clock,cell=260,top=-this.travel;
    for(let r=Math.floor((top-200)/cell);r<=Math.floor((top+FH+120)/cell);r++)for(const side of [-1,1]){
      const n=noise(r*17.3+side*5.1);if(n>.42)continue;
      const x=side<0?20+noise(n*3)*80:FW-20-noise(n*3)*80,gy=r*cell+noise(n*9)*200;
      if(coastWaterAt(2,x,gy)!==0)continue;
      const sy=gy+this.travel;
      for(let i=0;i<3;i++){
        const a=(t*.2+i/3+n*3)%1,rad=10+a*38;
        c.globalAlpha=.4*(1-a)*Math.min(1,a*5);
        c.drawImage(this.puff,x+a*92-rad,sy+a*44-rad,rad*2,rad*2);
      }
      if(n>.2)continue;
      c.globalAlpha=.22+.12*Math.sin(t*13+n*20);c.drawImage(this.warmGlow,x-18,sy-18,36,36);
      c.fillStyle='#ffc27a';
      for(let j=0;j<7;j++){
        const a=(t*1.25+j/7+n*11)%1,ang=-2.2+noise(n*3+j)*2.6,d=a*(12+noise(j+n)*20);
        c.globalAlpha=(1-a)*.7;c.fillRect(x+Math.cos(ang)*d+a*10,sy+Math.sin(ang)*d+a*a*8,1.3,1.3);
      }
    }
  }
  drawFog(c){
    const span=FW+760;
    for(let i=0;i<1;i++){
      const x=(i*430+this.clock*11)%span-380,y=(i*560+this.travel*1.08)%(FH+460)-230;
      c.globalAlpha=.3+.1*this.gust();c.drawImage(this.fogBank,Math.round(x-330),Math.round(y-115));
    }
  }
  drawScud(c){
    const strike=this.strike;
    for(let i=0;i<2;i++){
      const spanY=FH+420,y=(i*spanY/2+this.travel*1.45+this.clock*18)%spanY-210;
      const x=(i*265+this.clock*34)%(FW+440)-220;
      const sx=Math.round(x-170),sy=Math.round(y-100);
      c.globalAlpha=.6;c.drawImage(this.scud[i],sx,sy);
      if(strike){
        const lx=40+strike.x*460,ly=70+noise(strike.id*.37)*460,d=Math.hypot(x-lx,y-ly);
        const k=strike.flash*Math.exp(-d*d/180000)*(this.reduced?.35:1);
        if(k>.01){c.globalAlpha=k;c.drawImage(this.scudLit[i],sx,sy);}
      }
    }
  }
  drawRain(c){
    const t=this.clock,g=this.gust();
    // Far rain, then a nearer, heavier curtain; both slant with the wind.
    for(let layer=0;layer<2;layer++){
      const count=layer?50:84,speed=layer?1150:640,lenA=layer?24:9,lenB=layer?20:12;
      c.beginPath();
      for(let i=0;i<count;i++){
        const n1=noise(i*1.31+layer*9),n2=noise(i*2.77+layer*5),n3=noise(i*4.13+layer*3),v=speed*(.78+n3*.44);
        const y=(n2*(FH+80)+t*v)%(FH+80)-40,x=(n1*(FW+140)+t*v*.22)%(FW+140)-70,len=lenA+n3*lenB;
        c.moveTo(x,y);c.lineTo(x+len*.22,y+len);
      }
      c.globalAlpha=layer?.13+.15*g:.13+.08*g;c.strokeStyle=layer?'#c4d4e8':'#b0c4dc';c.lineWidth=layer?1.35:1;c.stroke();
    }
    // A denser rain sheet sweeps diagonally across the field every few seconds.
    const k=Math.floor(t/4.6),age=t-k*4.6;
    if(age<3.4){
      const cy=-180+age/3.4*(FH+360);
      c.beginPath();
      for(let i=0;i<64;i++){
        const n1=noise(i*3.7+k),n2=noise(i*5.9+k),x=n1*FW,y=cy+(x-270)*-.28+(n2-.5)*200+((t*900*(.8+n2*.4))%60);
        c.moveTo(x,y);c.lineTo(x+7,y+30);
      }
      c.globalAlpha=(.16+.12*g)*Math.sin(age/3.4*Math.PI);c.strokeStyle='#d0dcec';c.lineWidth=1.2;c.stroke();
    }
  }
  drawLightning(c,stage){
    const l=this.strike,lx=40+l.x*460,ly=70+noise(l.id*.37)*460,red=stage===3;
    c.globalCompositeOperation='lighter';
    c.globalAlpha=l.flash*(this.reduced?.25:.62);
    c.drawImage(red?this.flashRed:this.flashCool,lx-310,ly-270,620,540);
    c.globalCompositeOperation='source-over';
    if(l.age<.24&&l.distance<.78){
      // Cloud-to-cloud bolt, deterministic per strike so every frame agrees.
      const f=l.flash*(this.reduced?.45:1);
      c.beginPath();
      let x=lx-50+noise(l.id*1.3)*100,y=ly-90;c.moveTo(x,y);
      for(let s=0;s<10;s++){
        x+=(noise(l.id+s*2.1)-.5)*34;y+=15+noise(l.id+s*3.7)*12;c.lineTo(x,y);
        if(s===3||s===6){
          let bx=x,by=y,side=noise(l.id+s)>.5?1:-1;
          for(let b=0;b<3;b++){bx+=side*(10+noise(l.id+s+b*1.7)*16);by+=8+noise(l.id+b+s*.9)*10;c.lineTo(bx,by);}
          c.moveTo(x,y);
        }
      }
      c.strokeStyle=red?'#ff7a9a':'#a8bcff';c.lineWidth=5;c.globalAlpha=f*.2;c.stroke();
      c.strokeStyle=red?'#ffe0ea':'#f4f7ff';c.lineWidth=1.4;c.globalAlpha=f*.82;c.stroke();
    }
    if(!this.reduced){c.globalAlpha=l.flash*(red?.07:.085);c.fillStyle=red?'#ff7896':'#d2deff';c.fillRect(-20,-20,FW+40,FH+40);}
  }
  // --- Sector 3: The Crown ----------------------------------------------------
  drawPools(c){
    // Bioluminescent blooms pulse in the dark water beneath the maelstrom.
    const t=this.clock,cell=110,top=-this.travel;
    for(let r=Math.floor((top-cell)/cell);r<=Math.floor((top+FH)/cell);r++)for(let col=0;col<5;col++){
      const n=noise(r*13.7+col*29.1);if(n>.42)continue;
      const x=col*cell+noise(n*5)*cell,gy=r*cell+noise(n*17)*cell;
      if(coastWaterAt(3,x,gy)!==2)continue;
      const wave=Math.sin(t*(.45+n*.6)+n*20);if(wave<=0)continue;
      const p=wave*wave*wave,sprite=this.pools[n<.2?1:0][Math.floor(noise(n*31)*3)],sy=gy+this.travel;
      c.globalAlpha=p*.5;c.drawImage(sprite,Math.round(x-sprite.width/2),Math.round(sy-sprite.height/2));
      const rad=sprite.width*(.18+(1-p)*.22);c.globalAlpha=p*.18;c.drawImage(this.ring,x-rad,sy-rad*.6,rad*2,rad*1.2);
    }
  }
  drawDebris(c){
    const t=this.clock,cellY=150,cellX=135,top=-this.travel;
    for(let r=Math.floor((top-cellY)/cellY);r<=Math.floor((top+FH)/cellY);r++)for(let col=0;col<4;col++){
      const n=noise(r*7.9+col*19.3);if(n>.3)continue;
      const x=col*cellX+20+noise(n*3)*95,gy=r*cellY+noise(n*5)*110;
      if(coastWaterAt(3,x,gy)!==2)continue;
      const sy=gy+this.travel,size=34+noise(n*13)*26,angle=noise(n*7)*Math.PI*2+t*(noise(n*9)-.5)*.22;
      c.globalAlpha=.42;c.drawImage(this.sheen,x-size*.9,sy-size*.55,size*1.8,size*1.1);
      c.save();c.translate(x,sy);c.rotate(angle);c.globalAlpha=.8;c.drawImage(this.debris[Math.floor(noise(n*21)*4)],-size/2,-size/2,size,size);c.restore();
      if(noise(n*11)>.6){
        c.globalAlpha=.3+.18*Math.sin(t*13+n*5);c.drawImage(this.warmGlow,x-14,sy-14,28,28);
        for(let i=0;i<3;i++){
          const a=(t*.32+i/3+n)%1,rad=4+a*16;
          c.globalAlpha=.3*(1-a)*Math.min(1,a*6);c.drawImage(this.puff,x+a*34-rad,sy-a*18-rad,rad*2,rad*2);
        }
      }
    }
  }
  drawSpiral(c){
    // Foam arms of the maelstrom as vector strokes: cheap to rotate, no large blits.
    for(let i=0;i<2;i++){
      const x=270+Math.sin(this.gameT*.24+i*2.5)*45,y=(i*505+this.travel/GROUND_RATE*.28)%1350-225;
      if(y<-240||y>FH+240)continue;
      const rot=-this.clock*.09-i*1.7;
      c.globalAlpha=.8;c.drawImage(this.eye,Math.round(x-80),Math.round(y-64));
      for(let pass=0;pass<2;pass++){
        c.beginPath();
        for(let arm=0;arm<5;arm++){
          let down=false;
          for(let s=0;s<=18;s++){
            const f=s/18*.92,seed=arm*31+s+i*7;
            // Broken streaks: a few segments drop out so the arms read as torn foam.
            if(noise(seed*1.7)<.28){down=false;continue;}
            const a=rot+arm*Math.PI*.4+f*5+Math.sin(f*9+arm)*.08,r=24+f*200+(noise(seed*2.9)-.5)*14;
            const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r*.67;
            if(!down){c.moveTo(px,py);down=true;}else c.lineTo(px,py);
          }
        }
        c.globalAlpha=pass?.15:.07;c.strokeStyle=pass?'#d8cbff':'#9b8be6';c.lineWidth=pass?1:3.2;c.stroke();
      }
    }
  }
  drawEmbers(c){
    const t=this.clock;
    c.lineCap='round';
    // Two brightness buckets keep embers batched while they flicker.
    for(let bucket=0;bucket<2;bucket++){
      c.beginPath();
      for(let i=0;i<28;i++){
        const n1=noise(i*1.9),n2=noise(i*3.3),s=.5+noise(i*5.7)*.8;
        if((Math.sin(t*(6+n1*5)+i*2.3)>.2)!==!!bucket)continue;
        const x=(n1*(FW+60)+t*(16+20*s)+Math.sin(t*.8+i)*12)%(FW+60)-30;
        const y=(n2*(FH+60)+t*(26+44*s)+this.travel*.85)%(FH+60)-30;
        c.moveTo(x,y);c.lineTo(x+1.8,y+4.5);
      }
      c.globalAlpha=bucket?.62:.26;c.strokeStyle='#ff9466';c.lineWidth=1.3;c.stroke();
    }
    c.lineCap='butt';
    c.beginPath();
    for(let i=0;i<42;i++){
      const n1=noise(i*2.9+7),n2=noise(i*4.7+3),s=.4+noise(i*6.1)*.7;
      const x=(n1*(FW+40)+t*(10+14*s)+Math.sin(t*1.3+i*.7)*8)%(FW+40)-20;
      const y=(n2*(FH+40)+t*(20+30*s)+this.travel*.75)%(FH+40)-20;
      c.rect(x,y,1.4,1.4);
    }
    c.globalAlpha=.3;c.fillStyle='#b9abcb';c.fill();
  }
}
