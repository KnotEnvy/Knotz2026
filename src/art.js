// Authored raster surfaces share one light direction and material palette.
const craft = new Map();
let coast = null;
const coastTiles=[];
let artPromise;
const enemyRegions={wing:[0,0,.55,.475],ace:[.6,0,.4,.475],carrier:[0,.48,.64,.52],turret:[.66,.48,.34,.52]};
const regions = {
  kestrel:[0,0,.333,.32], manta:[.333,0,.334,.32], wraith:[.667,0,.333,.32],
  scout:[0,.32,.333,.275], bomber:[.333,.32,.334,.275], gunship:[.667,.32,.333,.275],
  vesper:[0,.595,.333,.405], aurelia:[.333,.595,.334,.405], crown:[.667,.595,.333,.405]
};
function imageAt(path) {
  return new Promise(resolve => {
    const image = new Image();
    const timer=setTimeout(()=>resolve(null),15000);
    image.onload = () => {clearTimeout(timer);resolve(image);};
    image.onerror = () => {clearTimeout(timer);resolve(null);};
    image.src = new URL(path, import.meta.url).href;
  });
}
export function loadArt(progress=()=>{}) {return artPromise??=prepareArt(progress);}
async function prepareArt(progress) {
  if(typeof Image==='undefined')return false;
  let loaded=0;
  const paths=['aircraft-atlas','pacific-coast','storm-harbor','crown-abyss','enemy-atlas'];
  const images=await Promise.all(paths.map(async path=>{const image=await imageAt('../assets/'+path+'.webp');progress(++loaded,paths.length);return image;}));
  const [atlas,terrain,harbor,abyss,enemies]=images;
  coast=terrain;
  if(coast)for(let stage=1;stage<=3;stage++){
    const tile=document.createElement('canvas');tile.width=540;tile.height=1080;
    const c=tile.getContext('2d');
    c.filter=stage===1?'saturate(.8) brightness(.68)':'brightness(.8)';
    c.drawImage([coast,harbor||coast,abyss||coast][stage-1],0,0,540,1080);c.filter='none';
    c.fillStyle=stage===2?'rgba(22,31,48,.1)':stage===3?'rgba(27,15,55,.1)':'rgba(3,24,37,.1)';
    c.fillRect(0,0,540,1080);coastTiles.push(tile);
  }
  if(!atlas)return false;
  for(const [id,rect] of Object.entries({...regions,...enemyRegions})) {
    const sheet=id in enemyRegions?enemies:atlas;if(!sheet)continue;
    const [x,y,w,h]=rect.map((v,i)=>Math.round(v*(i%2?sheet.height:sheet.width)));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(sheet,x,y,w,h,0,0,w,h);
    const pixels=c.getImageData(0,0,w,h).data;
    let left=w,right=0,top=h,bottom=0;
    for(let row=0;row<h;row++)for(let col=0;col<w;col++)if(pixels[(row*w+col)*4+3]>40){
      left=Math.min(left,col);right=Math.max(right,col);top=Math.min(top,row);bottom=Math.max(bottom,row);
    }
    if(right>left){
      const sw=right-left+1,sh=bottom-top+1;
      const outlined=document.createElement('canvas');outlined.width=sw+24;outlined.height=sh+24;
      const oc=outlined.getContext('2d');oc.shadowColor='rgba(255,217,174,.85)';oc.shadowBlur=12;
      oc.drawImage(sheet,x+left,y+top,sw,sh,12,12,sw,sh);
      const wreck=document.createElement('canvas');wreck.width=sw;wreck.height=sh;
      const wc=wreck.getContext('2d');wc.drawImage(sheet,x+left,y+top,sw,sh,0,0,sw,sh);
      wc.globalCompositeOperation='source-atop';wc.fillStyle='rgba(15,26,35,.62)';wc.fillRect(0,0,sw,sh);
      craft.set(id,{image:sheet,x:x+left,y:y+top,w:sw,h:sh,outlined,wreck});
    }
  }
  return images.every(Boolean);
}
export function drawCraft(c,id,x,y,width,height=width,outline=false) {
  const sprite=craft.get(id);if(!sprite)return false;
  const scale=Math.min(width/sprite.w,height/sprite.h),w=sprite.w*scale,h=sprite.h*scale;
  if(outline)c.drawImage(sprite.outlined,x-w/2-12*scale,y-h/2-12*scale,w+24*scale,h+24*scale);
  else c.drawImage(sprite.image,sprite.x,sprite.y,sprite.w,sprite.h,x-w/2,y-h/2,w,h);
  return true;
}
export function drawWreck(c,id,x,y,size,age,angle=0) {
  const sprite=craft.get(id);if(!sprite||age>.64)return false;
  const scale=Math.min(size/sprite.w,size/sprite.h),w=sprite.w*scale,h=sprite.h*scale;
  const fade=Math.max(0,1-age/.64);
  for(const side of [-1,0,1]){
    c.save();c.translate(x+side*age*43,y+age*28+age*age*55);
    c.rotate(Math.PI+angle+(side||.2)*age*1.5);c.globalAlpha*=fade*.9;
    c.beginPath();
    if(side<0)c.rect(-w/2,-h/2,w*.39,h);
    else if(side>0)c.rect(w*.11,-h/2,w*.39,h);
    else c.rect(-w*.11,-h/2,w*.22,h);
    c.clip();c.drawImage(sprite.wreck,-w/2,-h/2,w,h);c.restore();
  }
  return true;
}
// Coarse water map of each authored coast tile, so ambient life (boats, glints,
// foam, debris) only appears over water. 0 land, 1 shallows / foam, 2 open water.
const WATER_CELL=10,WATER_COLS=54,WATER_ROWS=108;
const waterMaps=[];
function waterMap(stage){
  if(waterMaps[stage]!==undefined)return waterMaps[stage];
  const tile=coastTiles[stage-1];
  if(!tile){waterMaps[stage]=null;return null;}
  let pixels;
  try{pixels=tile.getContext('2d').getImageData(0,0,540,1080).data;}catch{waterMaps[stage]=null;return null;}
  const water=stage===1?(r,g,b)=>b>r*1.6+8&&g>r+8&&r<60:stage===2?(r,g,b)=>b-r>=9&&b>=g&&b<90:(r,g,b)=>r*2.4<b&&b>13&&r<40;
  const deep=stage===1?(r,g,b)=>b>g+5&&r<30:stage===2?(r,g,b)=>b-r>=9&&b>=g&&b<70:(r,g,b)=>r*2.4<b&&b>13&&b<70;
  const map=new Uint8Array(WATER_COLS*WATER_ROWS);
  for(let cy=0;cy<WATER_ROWS;cy++)for(let cx=0;cx<WATER_COLS;cx++){
    let w=0,d=0,n=0;
    for(let y=cy*WATER_CELL+1;y<cy*WATER_CELL+WATER_CELL;y+=3)for(let x=cx*WATER_CELL+1;x<cx*WATER_CELL+WATER_CELL;x+=3){
      const i=(y*540+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2];n++;
      if(water(r,g,b))w++;if(deep(r,g,b))d++;
    }
    map[cy*WATER_COLS+cx]=d>=n*.9?2:w>=n*.85?1:0;
  }
  waterMaps[stage]=map;return map;
}
// Sectors 1-3 are authored paintings; later sectors are procedural open sea.
const PAINTED_STAGES=3;
export function prepareWaterMaps(){for(let stage=1;stage<=PAINTED_STAGES;stage++)waterMap(stage);}
// groundY is the screen y minus the coast travel (scroll * .29), so it is fixed to the terrain.
export function coastWaterAt(stage,x,groundY){
  if(stage>PAINTED_STAGES)return 2;
  const map=waterMap(stage);
  if(!map)return x>150&&x<390?2:0;
  const index=Math.floor(groundY/1080);
  let local=groundY-index*1080;
  if(Math.abs(index)%2)local=1080-local;
  const cx=x/WATER_CELL|0,cy=local/WATER_CELL|0;
  if(cx<0||cx>=WATER_COLS||cy<0||cy>=WATER_ROWS)return 0;
  return map[cy*WATER_COLS+cx];
}
export function drawCoast(c,scroll,stage) {
  if(stage===6){drawZeroMeridian(c,scroll);return true;}
  if(stage===5){drawSkyforge(c,scroll);return true;}
  if(stage>PAINTED_STAGES){drawMonsoonSea(c,scroll);return true;}
  if(!coast)return false;
  const tile=coastTiles[stage-1],height=tile.height,travel=scroll*.29;
  c.save();
  // Mirrored adjacent tiles share the same edge, without a visible loop seam.
  for(let index=Math.floor(-travel/height);index*height+travel<900;index++){
    const y=index*height+travel;c.save();c.translate(0,y);
    if(Math.abs(index)%2){c.translate(0,height);c.scale(1,-1);}
    c.drawImage(tile,0,0,540,height+1);c.restore();
  }
  c.restore();return true;
}

// ---------------------------------------------------------------------------
// Sector 4, Iron Monsoon: a procedural night-typhoon sea. Baked once into a
// vertically seamless 540x1400 tile plus a lit twin that lightning reveals.
// Wind blows toward the lower right; spindrift streaks run with it and the
// swell crests lie across it. The base stays dark and desaturated so hostile
// fire reads first; only lightning brings out the crest structure.
// ---------------------------------------------------------------------------
export const MONSOON_WIND=Object.freeze({x:.42,y:.91});
const SEA_W=540,SEA_H=1400,CREST=Math.atan2(-MONSOON_WIND.x,MONSOON_WIND.y);
let monsoon=null;
const mh=n=>{const v=Math.sin(n*157.31+71.7)*43758.5453;return v-Math.floor(v);};
function seaCanvas(w,h){
  const c=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(w,h):document.createElement('canvas');
  c.width=w;c.height=h;return c;
}
function bakeMonsoon(){
  const base=seaCanvas(SEA_W,SEA_H),lit=seaCanvas(SEA_W,SEA_H);
  const b=base.getContext('2d'),l=lit.getContext('2d');
  // Draw f at y and, near an edge, again one tile away so the tile wraps cleanly.
  const wrap=(y,m,f)=>{f(0);if(y<m)f(SEA_H);if(y>SEA_H-m)f(-SEA_H);};
  b.fillStyle='#050e0d';b.fillRect(0,0,SEA_W,SEA_H);
  // Broad swell masses: trough shadow and faint green lift, stretched along the crests.
  for(let i=0;i<46;i++){
    const x=mh(i*3.1)*SEA_W,y=mh(i*5.7)*SEA_H,r=90+mh(i*7.3)*170,dark=i%3!==0;
    wrap(y,r,dy=>{
      b.save();b.translate(x,y+dy);b.rotate(CREST);b.scale(1,.34);
      const g=b.createRadialGradient(0,0,0,0,0,r);
      const rgb=dark?'0,3,3':'22,48,42',a=dark?.5:.32;
      g.addColorStop(0,'rgba('+rgb+','+a+')');g.addColorStop(.6,'rgba('+rgb+','+(a*.45)+')');g.addColorStop(1,'rgba('+rgb+',0)');
      b.fillStyle=g;b.fillRect(-r,-r,r*2,r*2);b.restore();
    });
  }
  // Long broken swell crests across the wind: dark trough, dim face, thin crest line.
  const cx=Math.cos(CREST),cy=Math.sin(CREST);
  for(let i=0;i<34;i++){
    const x0=mh(i*11.3)*SEA_W,y0=mh(i*13.9)*SEA_H,len=260+mh(i*2.9)*520,wob=6+mh(i*4.4)*10;
    const pts=[];
    for(let s=0;s<=24;s++){
      const u=(s/24-.5)*len,w=Math.sin(s*.9+i)*wob+Math.sin(s*2.3-i)*wob*.35;
      pts.push([x0+cx*u-cy*w,y0+cy*u+cx*w,mh(i*17+s)>.24]);
    }
    const stroke=(c,dx,dy,color,width)=>{
      c.beginPath();let down=false;
      for(const [x,y,on] of pts){if(!on){down=false;continue;}if(!down){c.moveTo(x+dx,y+dy);down=true;}else c.lineTo(x+dx,y+dy);}
      c.strokeStyle=color;c.lineWidth=width;c.stroke();
    };
    wrap(y0,len*.5+30,dy=>{
      stroke(b,MONSOON_WIND.x*9,MONSOON_WIND.y*9+dy,'rgba(0,4,4,.42)',12+mh(i)*10);
      stroke(b,0,dy,'rgba(46,78,70,.13)',3);
      stroke(b,0,dy,'rgba(138,170,158,.1)',1);
      stroke(l,MONSOON_WIND.x*4,MONSOON_WIND.y*4+dy,'rgba(214,190,130,.16)',7);
      stroke(l,0,dy,'rgba(255,240,200,.38)',2.2);
      stroke(l,0,dy,'rgba(255,252,236,.55)',.9);
    });
  }
  // Spindrift: wind-torn foam streaks running downwind.
  for(let i=0;i<620;i++){
    const x=mh(i*1.7+3)*SEA_W,y=mh(i*2.3+9)*SEA_H,len=12+Math.pow(mh(i*3.9),2)*90;
    const ex=MONSOON_WIND.x*len,ey=MONSOON_WIND.y*len,a=.05+mh(i*5.1)*.1;
    wrap(y,len+4,dy=>{
      b.beginPath();b.moveTo(x,y+dy);b.lineTo(x+ex,y+ey+dy);
      b.strokeStyle='rgba(150,186,174,'+a.toFixed(3)+')';b.lineWidth=i%7===0?1.3:.7;b.stroke();
      l.beginPath();l.moveTo(x,y+dy);l.lineTo(x+ex,y+ey+dy);
      l.strokeStyle='rgba(255,238,200,'+(a*2.6).toFixed(3)+')';l.lineWidth=i%7===0?1.3:.7;l.stroke();
    });
  }
  // Breaking whitecaps: a ragged foam head across the wind and a torn tail downwind.
  for(let i=0;i<210;i++){
    const x=mh(i*6.7+1)*SEA_W,y=mh(i*8.3+2)*SEA_H,size=4+mh(i*9.1)*9;
    const lane=x>180&&x<360?.72:1,a=(.28+mh(i*4.3)*.34)*lane;
    wrap(y,size*6,dy=>{
      for(const [c,rgb,k] of [[b,'206,226,218',1],[l,'255,250,230',1.8]]){
        c.fillStyle='rgba('+rgb+','+Math.min(.95,a*k).toFixed(3)+')';
        c.beginPath();
        for(let j=0;j<5;j++){
          const u=(j-2)*size*.55+(mh(i*3+j)-.5)*size*.4;
          c.ellipse(x+cx*u,y+cy*u+dy,size*(.35+mh(i+j*2)*.35),size*.18,CREST,0,Math.PI*2);
        }
        c.fill();
        c.beginPath();
        for(let j=0;j<3;j++){
          const ox=(j-1)*size*.6*cx,oy=(j-1)*size*.6*cy,tl=size*(2+mh(i*7+j)*3);
          c.moveTo(x+ox,y+oy+dy);c.lineTo(x+ox+MONSOON_WIND.x*tl,y+oy+dy+MONSOON_WIND.y*tl);
        }
        c.strokeStyle='rgba('+rgb+','+(a*k*.55).toFixed(3)+')';c.lineWidth=1;c.stroke();
      }
    });
  }
  return {base,lit};
}
export function monsoonSea(){return monsoon??=bakeMonsoon();}
// Blit the seamless tile scrolled with the ground (same .29 rate as the painted coasts).
function blitSea(c,tile,scroll){
  // Covers -20..920 so camera shake never shows an edge; the canvas clips the rest.
  const off=((scroll*.29)%SEA_H+SEA_H)%SEA_H;
  if(off>-20)c.drawImage(tile,0,off-SEA_H);
  if(off<920)c.drawImage(tile,0,off);
}
export function drawMonsoonSea(c,scroll){blitSea(c,monsoonSea().base,scroll);}
// Lightning reveals the swell and crest structure across the whole sea.
export function drawMonsoonLit(c,scroll,alpha){
  if(alpha<=.004)return;
  c.save();c.globalCompositeOperation='lighter';c.globalAlpha=Math.min(1,alpha);
  blitSea(c,monsoonSea().lit,scroll);c.restore();
}

// SKYFORGE: cached dusk sky, three seamless cumulus decks and aerial platforms.
let skyforge;
// One bounded bake/raster slice per call. A completed cache is a constant-time no-op.
function skyforgeCache(){
  if(skyforge)return skyforge;
  const s=skyforge={clouds:[],lobes:[],jobs:[],next:0,warmed:false};
  let raster,rc;
  s.jobs.push(()=>{raster=seaCanvas(680,1100);rc=raster.getContext('2d',{willReadFrequently:true});});
  const flush=tile=>{rc.clearRect(0,0,680,1100);rc.drawImage(tile,0,0);rc.getImageData(0,0,1,1);};
  s.jobs.push(()=>{
  const sky=seaCanvas(540,900),b=sky.getContext('2d');
  const g=b.createLinearGradient(0,0,0,900);
  g.addColorStop(0,'#10162c');g.addColorStop(.22,'#442849');g.addColorStop(.34,'#875062');g.addColorStop(.46,'#35283f');g.addColorStop(1,'#171d34');
  s.sky=sky;s.skyGradient=g;
  });
  for(let band=0;band<3;band++)s.jobs.push(()=>{
    const sky=s.sky,b=sky.getContext('2d');
    b.fillStyle=s.skyGradient;b.fillRect(0,band*300,540,300);flush(sky);
  });
  s.jobs.push(()=>{
    const sky=s.sky,b=sky.getContext('2d');
  const halo=b.createRadialGradient(408,244,8,408,244,155);
  halo.addColorStop(0,'#f7ba79');halo.addColorStop(.25,'#ce6c84');halo.addColorStop(1,'rgba(180,71,133,0)');
  b.fillStyle=halo;b.fillRect(230,60,310,360);
  b.fillStyle='#efbd85';b.beginPath();b.arc(408,244,36,0,Math.PI*2);b.fill();
    s.sky=sky;flush(sky);
  });
  for(let layer=0;layer<3;layer++){
    s.jobs.push(()=>{
      s.clouds[layer]=seaCanvas(680,1100);
      const lobe=s.lobes[layer]=seaCanvas(192,192),c=lobe.getContext('2d');
      const g=c.createLinearGradient(96,0,96,192);
      g.addColorStop(0,'#9d718e');g.addColorStop(.38,'#705477');g.addColorStop(1,'#3d2d55');
      c.fillStyle=g;c.beginPath();c.ellipse(96,96,95,68.4,0,0,Math.PI*2);c.fill();
      c.strokeStyle='rgba(241,164,160,.35)';c.lineWidth=2;c.beginPath();c.ellipse(96,96,94,67.4,0,Math.PI*1.1,Math.PI*1.88);c.stroke();flush(lobe);
    });
    for(let start=0;start<32;start+=4)s.jobs.push(()=>{
      const d=s.clouds[layer].getContext('2d');
      for(let i=start;i<start+4;i++){
        const x=mh(i*3+layer*47)*760-40,y=mh(i*7+layer*31)*1100,r=32+mh(i*11+layer*19)*52;
        for(const wrap of [-1100,0,1100]){
          const cy=y+wrap;
          d.fillStyle='#2a1d40';d.beginPath();d.ellipse(x+5,cy+20,r*1.65,r*.55,0,0,Math.PI*2);d.fill();
          for(let j=0;j<5;j++){
            const lx=x+(j-2)*r*.48,ly=cy-Math.sin(j/4*Math.PI)*r*.3,lr=r*(.48+mh(i*17+j*3)*.22);
            d.drawImage(s.lobes[layer],lx-lr,ly-lr,lr*2,lr*2);
          }
        }
      }flush(s.clouds[layer]);
    });
  }
  s.jobs.push(()=>{
  const glare=seaCanvas(540,615),d=glare.getContext('2d');
  const gl=d.createRadialGradient(408,0,0,408,0,530);gl.addColorStop(0,'rgba(255,190,140,.12)');gl.addColorStop(1,'rgba(255,190,140,0)');
  d.save();d.translate(286,0);d.scale(.3,1);d.fillStyle=gl;d.fillRect(-960,0,1800,615);d.restore();
  const veil=seaCanvas(540,95),v=veil.getContext('2d'),vg=v.createLinearGradient(0,0,0,95);
  vg.addColorStop(0,'#814c60');vg.addColorStop(1,'rgba(90,57,80,0)');v.fillStyle=vg;v.fillRect(0,0,540,95);
    s.glare=glare;s.veil=veil;flush(glare);flush(veil);
  });
  s.jobs.push(()=>{
    const platform=s.platform=seaCanvas(220,180),f=platform.getContext('2d');f.translate(110,80);
    // A distant freight gantry: long, shallow hull and open trusses, no rotors or shadow.
    f.fillStyle='#5a4a6e';f.strokeStyle='#8a7395';f.lineWidth=2;
    f.beginPath();f.moveTo(-102,-7);f.lineTo(90,-17);f.lineTo(103,-6);f.lineTo(66,10);f.lineTo(-80,15);f.closePath();f.fill();f.stroke();
    f.beginPath();f.moveTo(-81,-9);f.lineTo(-81,-26);f.lineTo(62,-33);f.lineTo(62,-16);
    for(let j=0;j<6;j++){const x=-81+j*24;f.moveTo(x,-10);f.lineTo(x+24,-29);f.lineTo(x+24,-12);}f.stroke();
    f.fillStyle='#776183';for(let j=0;j<7;j++)f.fillRect(-62+j*19,-2,8,2);
    flush(platform);
  });
  return s;
}
export function warmSkyforge(){
  const s=skyforgeCache();if(s.warmed)return true;
  s.jobs[s.next++]();
  if(s.next===s.jobs.length){s.warmed=true;s.jobs.length=0;s.lobes.length=0;}
  return s.warmed;
}
export function drawSkyforge(c,scroll=0,platforms=true){
  // A cold stage-5 start (drill 5, QA hooks) finishes the bake before its first
  // frame instead of drawing half-baked tiles; the campaign warms it during the climb.
  const s=skyforgeCache();while(!s.warmed)warmSkyforge();c.save();c.globalAlpha=1;if(s.sky)c.drawImage(s.sky,0,0);
  c.save();c.beginPath();c.rect(0,285,540,615);c.clip();
  for(let layer=0;layer<3;layer++){
    const offset=(scroll*[.025,.055,.12][layer])%1100;
    c.globalAlpha=[.65,.45,.32][layer];
    if(s.clouds[layer])for(let j=-1;j<1;j++)c.drawImage(s.clouds[layer],-70+Math.sin(scroll*.0001+layer)*22,offset+j*1100);
    if(layer===0&&platforms&&s.platform){
      c.globalAlpha=.58;
      for(let i=0;i<3;i++){
        const x=platforms==='victory'?[30,500,515][i]:55+i*205,y=platforms==='victory'?340+i*26:320+(i*139+scroll*.018)%420,k=.24+i*.03;
        c.drawImage(s.platform,x-110*k,y-80*k,220*k,180*k);
      }
    }
  }
  c.globalAlpha=1;if(s.glare)c.drawImage(s.glare,0,285);if(s.veil)c.drawImage(s.veil,0,285);c.restore();
  c.save();c.strokeStyle='rgba(231,180,158,.16)';c.lineWidth=1;
  for(let i=0;i<6;i++){const y=(i*173+scroll*.035)%1000-50;c.beginPath();c.moveTo(35+i*82,y);c.lineTo(100+i*82,y+125);c.stroke();}
  c.restore();c.restore();
}

// ZERO MERIDIAN: 24 bounded raster slices. No image readback or full-frame noise.
let zeroMeridian;
export function warmZeroMeridian(){
  if(zeroMeridian?.done)return true;
  if(!zeroMeridian){
    const stars=seaCanvas(540,900),sc=stars.getContext('2d');
    for(let i=0;i<240;i++){
      const x=((Math.sin(i*127.1)*43758.5453)%1+1)%1*540,y=((Math.sin(i*311.7+9)*23421.17)%1+1)%1*900;
      sc.fillStyle=i%9===0?'#9aafc6':'#4f607b';sc.fillRect(x,y,i%9===0?1.3:.7,i%9===0?1.3:.7);
    }
    zeroMeridian={canvas:seaCanvas(540,900),stars,next:0,done:false};
  }
  const s=zeroMeridian,c=s.canvas.getContext('2d',{willReadFrequently:true}),n=s.next++;
  c.save();c.beginPath();c.rect(0,n*38,540,38);c.clip();
  const sky=c.createLinearGradient(0,0,0,900);
  sky.addColorStop(0,'#02040d');sky.addColorStop(.65,'#060d20');sky.addColorStop(.85,'#14233c');sky.addColorStop(1,'#382a43');
  c.fillStyle=sky;c.fillRect(0,0,540,900);
  // Low contrast eclipse, half occluded by the planetary horizon.
  const corona=c.createRadialGradient(470,780,24,470,780,112);
  corona.addColorStop(0,'rgba(226,210,188,.5)');corona.addColorStop(.17,'rgba(179,186,215,.16)');corona.addColorStop(1,'rgba(110,139,199,0)');
  c.fillStyle=corona;c.fillRect(350,660,240,240);
  c.fillStyle='#081223';c.beginPath();c.arc(470,780,25,0,Math.PI*2);c.fill();
  // A hairline of light on the upper rim keeps the eclipse readable as a motif.
  c.strokeStyle='rgba(255,236,206,.55)';c.lineWidth=1.2;c.beginPath();c.arc(470,780,25.5,Math.PI*1.08,Math.PI*1.92);c.stroke();
  // Large-radius planetary limb, with a thin atmosphere and a distant typhoon.
  c.fillStyle='#0a1c30';c.strokeStyle='#496b84';c.lineWidth=2;
  c.beginPath();c.ellipse(210,1210,780,458,0,0,Math.PI*2);c.fill();c.stroke();
  c.strokeStyle='rgba(115,149,171,.22)';c.lineWidth=.7;
  for(let j=0;j<11;j++){
    c.beginPath();for(let k=0;k<100;k++){const a=k*.065+j*.55,r=2+k*.39,x=192+Math.cos(a)*r*1.8,y=817+Math.sin(a)*r*.32;k?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();
  }
  c.restore();c.getImageData(0,n*38,1,1);s.done=s.next>=24;return s.done;
}
export function drawZeroMeridian(c,scroll=0){
  while(!warmZeroMeridian()){} // Cold entry completes before the first visible frame.
  c.drawImage(zeroMeridian.canvas,0,0);
  // Two copies of the baked star tile wrap seamlessly; the limb stays distant.
  const drift=((scroll*.028)%900+900)%900;
  c.save();c.beginPath();c.rect(0,0,540,720);c.clip();
  c.drawImage(zeroMeridian.stars,0,drift);c.drawImage(zeroMeridian.stars,0,drift-900);c.restore();
}
let zeroDawn;
export function drawZeroDawn(c,progress=1){
  if(!zeroDawn){
    zeroDawn=seaCanvas(540,900);const d=zeroDawn.getContext('2d');
    const glow=d.createRadialGradient(470,750,4,470,750,240);
    glow.addColorStop(0,'rgba(255,238,204,.85)');glow.addColorStop(.16,'rgba(244,191,141,.24)');glow.addColorStop(.5,'rgba(174,124,156,.09)');glow.addColorStop(1,'rgba(174,124,156,0)');
    d.fillStyle=glow;d.fillRect(230,510,310,390);
    d.fillStyle='#ffe5b5';d.beginPath();d.arc(470,750,18,0,Math.PI*2);d.fill();
    // The moon and the Earth remain in front as the sun clears their edges.
    d.fillStyle='#081223';d.beginPath();d.arc(470,780,25,0,Math.PI*2);d.fill();
    d.fillStyle='#0a1c30';d.strokeStyle='#71899a';d.lineWidth=2;
    d.beginPath();d.ellipse(210,1210,780,458,0,0,Math.PI*2);d.fill();d.stroke();
  }
  c.save();c.globalAlpha*=Math.max(0,Math.min(1,progress));c.drawImage(zeroDawn,0,0);c.restore();
}
const zeroAuroraGradients={};
export function drawZeroAurora(c,time=0,phase=0,over=false,reduced=false){
  c.save();const pulse=.65+.35*Math.cos(phase*Math.PI*2);
  c.globalAlpha=(over?.025:.16)*(reduced?.55:1)*pulse;
  const key=over?'over':'under';
  if(!zeroAuroraGradients[key]){
    const g=c.createLinearGradient(0,0,0,over?900:540);
    g.addColorStop(0,'rgba(67,197,177,0)');g.addColorStop(.3,'#53b7b3');g.addColorStop(.65,'#7062aa');g.addColorStop(1,'rgba(70,90,150,0)');zeroAuroraGradients[key]=g;
  }
  c.fillStyle=zeroAuroraGradients[key];
  for(let band=0;band<3;band++){
    const y=x=>95+band*75+Math.sin(x*.008+time*.09+band)*55+Math.sin(x*.019-time*.055)*23;
    c.beginPath();
    for(let x=-20;x<=560;x+=2)x===-20?c.moveTo(x,y(x)):c.lineTo(x,y(x));
    for(let x=560;x>=-20;x-=2)c.lineTo(x,y(x)+(over?530:260)+Math.sin(x*.015+band)*70);
    c.closePath();c.fill();
  }c.restore();
}
