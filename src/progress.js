import { SHIP_IDS } from './game.js';

const integer=value=>Number.isFinite(Number(value))?Math.max(0,Math.floor(Number(value))):0;
const emptyRecord=()=>({sorties:0,wins:0,bestScore:0,bestClears:0,bestGrazes:0,bestConversions:0});
const savedSnapshots=new WeakMap();
const snapshot=progress=>Object.fromEntries(SHIP_IDS.map(id=>[id,{...progress.ships[id]}]));
export function readProgress(storage) {
  const progress={bossSeen:1,ships:Object.fromEntries(SHIP_IDS.map(id=>[id,emptyRecord()]))};
  try{
    const saved=JSON.parse((storage||globalThis.localStorage)?.getItem('2026-career')||'{}');
    progress.bossSeen=Math.max(1,Math.min(3,integer(saved.bossSeen)));
    for(const id of SHIP_IDS)for(const key of Object.keys(progress.ships[id])){
      const value=saved.ships?.[id]?.[key];
      if(Number.isFinite(value))progress.ships[id][key]=integer(value);
    }
    for(const record of Object.values(progress.ships))record.bestClears=Math.min(3,record.bestClears);
  }catch{}
  savedSnapshots.set(progress,snapshot(progress));return progress;
}
export function saveProgress(progress,storage) {
  try{
    const stored=readProgress(storage),known=savedSnapshots.get(progress)||Object.fromEntries(SHIP_IDS.map(id=>[id,emptyRecord()]));
    const merged={bossSeen:Math.max(progress.bossSeen,stored.bossSeen),ships:{}};
    for(const id of SHIP_IDS){
      merged.ships[id]={};
      for(const key of Object.keys(emptyRecord())){
        merged.ships[id][key]=key==='sorties'||key==='wins'?
          stored.ships[id][key]+Math.max(0,progress.ships[id][key]-known[id][key]):
          Math.max(stored.ships[id][key],progress.ships[id][key]);
      }
    }
    (storage||globalThis.localStorage)?.setItem('2026-career',JSON.stringify(merged));
    Object.assign(progress,merged);savedSnapshots.set(progress,snapshot(progress));return true;
  }catch{return false;}
}
export function markEncounter(progress,stage) {
  const next=Math.max(progress.bossSeen,Math.min(3,integer(stage)));
  if(next===progress.bossSeen)return false;
  progress.bossSeen=next;return true;
}
export function recordFlight(progress,summary,storage) {
  if(!summary||summary.practiceStage||!SHIP_IDS.includes(summary.shipId))return null;
  const record=progress.ships[summary.shipId],previous={...record};
  previous.bestScore=Math.max(previous.bestScore,readProgress(storage).ships[summary.shipId].bestScore);
  record.bestScore=previous.bestScore;
  record.sorties++;if(summary.outcome==='victory')record.wins++;
  for(const [key,source] of [['bestScore','score'],['bestClears','bossesDefeated'],['bestGrazes','grazes'],['bestConversions','conversions']]){
    record[key]=Math.max(record[key],integer(summary[source]));
  }
  record.bestClears=Math.min(3,record.bestClears);
  return{previous,record,newBest:record.bestScore>previous.bestScore};
}
export function flightAdvice(summary) {
  if(summary?.practiceStage){
    const tier=drillClearTier(summary);
    return tier==='flawless'?'No-hit clear. Beat your time, or learn this pattern with a different airframe.':
      tier==='controlled'?'All three lives kept. Next target: a no-hit clear. Use small adjustments through the gaps and roll before the corridor closes.':
      tier==='survived'?'Clear secured. Next target: keep all three lives. Roll toward an opening before the corridor closes, and use your special to recover space.':
      'Try a focused pass through the gaps, then use a directional roll when the corridor closes.';
  }
  if(summary?.outcome==='victory')return 'Route reclaimed. Try another airframe, or build a higher score with well-timed WAKE conversions.';
  if((summary?.bombsRemaining||0)>0&&(summary?.hitsTaken||0)>0)return 'You still had a special in reserve. Use it before a gap closes to clear fire and gain a moment of safety.';
  if(!(summary?.rolls>0))return 'Roll in your movement direction to cross closing lanes. At 50% WAKE, your roll also converts nearby fire into score.';
  if((summary?.accuracy||0)<.3)return 'Line up below the formation, then follow it as you fire. Use the open gaps to reposition before the next pass.';
  return 'Lead aimed fire to one side, then move through the opening. Use FOCUS for small adjustments and save a roll for the lane shift.';
}

export function drillClearTier(summary) {
  if(![1,2,3].includes(summary?.practiceStage)||summary.outcome!=='victory')return null;
  return summary.hitsTaken===0?'flawless':summary.livesLost===0?'controlled':'survived';
}

export function readDrillRecords(storage) {
  const records={};
  try{
    const saved=JSON.parse((storage||globalThis.localStorage)?.getItem('2026-drills')||'{}');
    for(const id of SHIP_IDS)for(const stage of [1,2,3]){
      const key=id+'-'+stage,record=saved?.[key];
      if(record&&Number.isFinite(record.bestTime)&&record.bestTime>0&&Number.isFinite(record.fewestHits)&&record.fewestHits>=0)
        records[key]={bestTime:record.bestTime,fewestHits:integer(record.fewestHits)};
    }
  }catch{}
  return records;
}
export function recordDrill(records,summary,storage) {
  if(![1,2,3].includes(summary?.practiceStage)||summary.outcome!=='victory'||!SHIP_IDS.includes(summary.shipId)||!Number.isFinite(summary.time)||summary.time<=0)return null;
  const merged=readDrillRecords(storage);
  for(const [key,record] of Object.entries(records)){
    const old=merged[key];merged[key]=old?{bestTime:Math.min(old.bestTime,record.bestTime),fewestHits:Math.min(old.fewestHits,record.fewestHits)}:{...record};
  }
  const key=summary.shipId+'-'+summary.practiceStage,previous=merged[key];
  merged[key]={bestTime:Math.min(previous?.bestTime||Infinity,summary.time),fewestHits:Math.min(previous?.fewestHits??Infinity,integer(summary.hitsTaken))};
  Object.assign(records,merged);
  try{(storage||globalThis.localStorage)?.setItem('2026-drills',JSON.stringify(merged));}catch{}
  return merged[key];
}

export function flightTime(seconds) {
  const tenths=Math.round((Number.isFinite(Number(seconds))?Math.max(0,Number(seconds)):0)*10);
  return Math.floor(tenths/600)+':'+((tenths%600)/10).toFixed(1).padStart(4,'0');
}
