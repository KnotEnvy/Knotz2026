// Cached procedural sea, coast and cloud geography for Storm Atlas.
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
