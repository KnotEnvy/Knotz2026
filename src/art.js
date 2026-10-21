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
export function prepareWaterMaps(){for(let stage=1;stage<=3;stage++)waterMap(stage);}
// groundY is the screen y minus the coast travel (scroll * .29), so it is fixed to the terrain.
export function coastWaterAt(stage,x,groundY){
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
