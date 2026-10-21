// Shared aircraft data and drawing used by the front end, pause, cinema and main flow.
import { drawCraft } from './art.js';

export const SHIPS = {
  kestrel:{name:'KESTREL',code:'SA-01',role:'INTERCEPTOR',description:'Balanced spread cannons and a screen-clearing nova. A razor-wing all-rounder for every opening.',speed:72,fire:72,hull:68,color:'#f3bb70'},
  manta:{name:'MANTA',code:'SA-02',role:'STRIKE CRAFT',description:'Homing missiles, layered shields, and a defensive barrier pulse. Built to hold the line.',speed:48,fire:94,hull:92,color:'#f29a76'},
  wraith:{name:'WRAITH',code:'SA-03',role:'RECON CRAFT',description:'Piercing rail fire, support drones, and a conversion storm. Precision through the impossible.',speed:95,fire:58,hull:42,color:'#81d7d0'}
};
export const SHIP_ORDER = Object.keys(SHIPS);
export const SPECIAL_LABELS = {kestrel:'NOVA',manta:'BARRIER',wraith:'STORM'};

export function poly(c,points,fill,stroke='#ffffff',line=1){
  c.beginPath();c.moveTo(points[0][0],points[0][1]);
  for(let i=1;i<points.length;i++)c.lineTo(points[i][0],points[i][1]);
  c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=line;c.stroke();}
}
export function shipShape(c,id,x,y,size,time=0,blueprint=false){
  c.save();
  if(blueprint){c.shadowColor='#7ad8cd';c.shadowBlur=18;}
  const authored=drawCraft(c,id,x,y,210*size,210*size);
  c.restore();
  if(authored)return;
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
