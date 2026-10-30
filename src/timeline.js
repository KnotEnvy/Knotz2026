// Shared presentation timing and naming, so visuals and audio agree on the same moments.
// Read-only helpers: never change game state from here.

export const SECTOR_NAMES = Object.freeze(['', 'THE SHALLOWS', 'STORM WALL', 'THE CROWN', 'IRON MONSOON']);
export const FLAGSHIP_NAMES = Object.freeze(['', 'VESPER', 'AURELIA', 'THE CROWN', 'LEVIATHAN']);
export const FLAGSHIP_CLASSES = Object.freeze(['', 'STRIKE CARRIER', 'REACTOR DREADNOUGHT', 'LANCE CITADEL', 'SUPER-DREADNOUGHT']);
export const SECTOR_COORDS = Object.freeze(['', 'N 07°21′  E 134°28′', 'N 21°44′  E 148°02′', 'N 29°58′  E 162°40′', 'N 33°12′  E 171°05′']);
export const SECTOR_TAGLINES = Object.freeze(['', 'Reef lanes at first light.', 'Into the teeth of the storm.', 'Where the sea folds into fire.', 'The real fleet rides the typhoon.']);
// First sector of Act II. Act I builds the arsenal through the Crown.
export const ACT_TWO_STAGE = 4;
export const ACT_NAMES = Object.freeze(['', 'ACT I', 'ACT II']);
export const ACT_SUBTITLES = Object.freeze(['', 'OPERATION LONG MERIDIAN', 'IRON MONSOON']);
export const ACT_TAGLINES = Object.freeze(['', 'EVERY STORM HAS A SHORE', 'THE CROWN WAS ONLY THE GATE']);
export function actOf(stage) { return Number(stage) >= ACT_TWO_STAGE ? 2 : 1; }
export function actName(stage) { return ACT_NAMES[actOf(stage)]; }
// Rank describes carried-arsenal pressure in either act; flagship states override it in the HUD.
export function threatName(threat) {
  const rank = Math.max(0, Number(threat) || 0);
  return rank >= .65 ? 'EXTREME' : rank >= .3 ? 'SEVERE' : 'RISING';
}

// Seconds of warning before a campaign flagship spawns (drills start at the flagship, so no warning).
export const BOSS_WARNING_LEAD = 3.2;
// Default length of the sector-clear interlude after a flagship falls (matches game._transition = 3.5).
// The Act II interlude after the Crown is longer; the simulation reports it in game._transitionLength.
export const INTERLUDE_LENGTH = 3.5;
export function interludeLength(game) {
  const length = Number(game?._transitionLength);
  return length > 0 ? length : INTERLUDE_LENGTH;
}

// 0..1 progress through the pre-flagship warning, or -1 when no warning is active.
export function bossWarningProgress(game) {
  if (!game || game.mode !== 'playing' || game.boss || game.practiceStage) return -1;
  if (Number(game._transition) > 0) return -1;
  const goal = game.stageGoal?.[game.stage];
  if (!Number.isFinite(goal)) return -1;
  const left = goal - Number(game.stageTime || 0);
  if (left > BOSS_WARNING_LEAD || left < 0) return -1;
  return 1 - left / BOSS_WARNING_LEAD;
}

// 0..1 progress through the sector-clear interlude, or -1 when none is active.
export function interludeProgress(game) {
  const left = Number(game?._transition) || 0;
  if (left <= 0 || game?.boss) return -1;
  return Math.min(1, Math.max(0, 1 - left / interludeLength(game)));
}

// True while the long interlude between the Crown and sector 4 plays (campaign only).
export function actTwoInterlude(game) {
  return !!game && !game.practiceStage && Number(game.stage) === ACT_TWO_STAGE - 1 &&
    interludeLength(game) > INTERLUDE_LENGTH + .5 && interludeProgress(game) >= 0;
}

// Deterministic storm lightning shared by the playfield, page ambience and thunder audio.
// Sector 2 (Storm Wall) strikes often; sector 3 (The Crown) rarely, with a red cast;
// sector 4 (Iron Monsoon) most often of all, with a white-gold cast.
// Returns null between strikes, or { id, age, flash 0..1, x 0..1, distance 0..1 }.
// Thunder should follow a strike by roughly 0.3 + distance * 2.2 seconds.
function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
const STRIKE_LENGTH = 0.62;
export function lightningAt(time, stage) {
  if (stage !== 2 && stage !== 3 && stage !== 4) return null;
  const period = stage === 2 ? 6.5 : stage === 4 ? 4.5 : 14;
  const t = Number(time) || 0;
  const slot = Math.floor(t / period);
  for (const s of [slot, slot - 1]) {
    if (s < 0) continue;
    const start = s * period + 1 + hash(s * 3.17 + stage) * (period - 2);
    const age = t - start;
    if (age < 0 || age >= STRIKE_LENGTH) continue;
    // Two quick flickers then a soft decay.
    const flicker = age < 0.07 ? age / 0.07 : age < 0.12 ? 0.35 : age < 0.2 ? 1 : Math.max(0, 1 - (age - 0.2) / (STRIKE_LENGTH - 0.2));
    const distance = hash(s * 5.31 + stage * 2);
    return { id: stage * 100000 + s, age, flash: flicker * (1 - distance * 0.55), x: hash(s * 7.73 + stage), distance };
  }
  return null;
}
