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
