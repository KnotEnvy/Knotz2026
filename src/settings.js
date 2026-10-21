export const DEFAULT_SETTINGS = Object.freeze({music:80,effects:80,ambience:60,autoFire:false,reducedEffects:false,hitbox:true});
export function readSettings(storage) {
  const defaults={...DEFAULT_SETTINGS};
  try{defaults.reducedEffects=Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);}catch{}
  try {
    const saved=JSON.parse((storage||globalThis.localStorage)?.getItem('2026-settings')||'{}');
    if(!saved||typeof saved!=='object'||Array.isArray(saved))return defaults;
    const settings={...defaults};
    for(const key of ['music','effects','ambience'])if(Number.isFinite(saved[key]))settings[key]=Math.max(0,Math.min(100,saved[key]));
    for(const key of ['autoFire','reducedEffects','hitbox'])if(typeof saved[key]==='boolean')settings[key]=saved[key];
    return settings;
  } catch {return defaults;}
}
export function writeSettings(settings,storage) {
  try{(storage||globalThis.localStorage)?.setItem('2026-settings',JSON.stringify(settings));}catch{}
}
