// Storm Atlas — adaptive score. Original music, synthesized entirely with Web Audio (no samples).
//
// Contract (the audio engine in audio.js drives this):
//   new MusicDirector(ctx, out)  out = music-bus GainNode. The engine owns its level, mute,
//                                ducking and the pause filter; everything upstream is ours.
//   update(state, now)           every frame on every screen, now = ctx.currentTime.
//   stop()                       fade out and release every node.
// state = { screen, mode, time, stage, stageTime, bossWarning (-1 | 0..1), boss, bossName,
//           bossPhase, bossHp, interlude (-1 | 0..1), intensity, critical, outcome, grade,
//           practice, paused, events }
//
// Musical identity: one main theme, "Long Meridian" (D major with a bVI-bVII-I lift), recurs as
// the title anthem, the Shallows lead, the hangar fragment, the victory hymn, and in minor as the
// Crown's battle theme and the game-over lament. Each cue is a function that writes one bar at a
// time. The scheduler commits a bar only when its downbeat falls inside a short lookahead window,
// so cue changes land on the next uncommitted bar (or beat, for urgent moments) and stalls resync
// instead of bursting.
import { CAMPAIGN_STAGES } from './game.js';
import { BOSS_WARNING_LEAD } from './timeline.js';

const LOOKAHEAD = 0.3;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const norm = r => { const x = ((r % 12) + 12) % 12; return x > 6 ? x - 12 : x; };
const QUAL = {
  maj: [0, 4, 7], min: [0, 3, 7], sus2: [0, 2, 7], sus4: [0, 5, 7], dim: [0, 3, 6],
  maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], five: [0, 7]
};
// Per-instrument channel gain and effect sends.
const CHANNELS = {
  drums: { level: 0.62, verb: 0.08 },
  taiko: { level: 0.78, verb: 0.24 },
  perc: { level: 0.6, verb: 0.1 },
  bass: { level: 0.42, verb: 0 },
  pad: { level: 0.5, verb: 0.4 },
  choir: { level: 0.46, verb: 0.55 },
  brass: { level: 0.5, verb: 0.28 },
  lead: { level: 0.5, verb: 0.22, echo: 0.2 },
  keys: { level: 0.46, verb: 0.3, echo: 0.16 },
  strings: { level: 0.5, verb: 0.32 },
  arp: { level: 0.4, verb: 0.24, echo: 0.3 },
  fx: { level: 0.42, verb: 0.45 }
};
const VEL = { X: 1.15, x: 1, o: 0.7, '-': 0.38 };

function env(p, at, a, peak, d, sus, hold, rel) {
  p.value = 0; // a fresh GainNode starts at 1; never let a sample through before the envelope
  peak = Math.max(1e-4, peak);
  const s = Math.max(1e-4, peak * sus), relAt = Math.max(at + a + 0.004, at + hold);
  p.setValueAtTime(1e-4, at);
  p.linearRampToValueAtTime(peak, at + a);
  if (relAt > at + a + d) { p.exponentialRampToValueAtTime(s, at + a + d); p.setValueAtTime(s, relAt); }
  else p.exponentialRampToValueAtTime(Math.max(1e-4, peak * Math.pow(sus, (relAt - at - a) / d)), relAt);
  p.exponentialRampToValueAtTime(1e-4, relAt + rel);
}
function perc(p, at, peak, decay, attack = 0.002) {
  p.value = 0;
  p.setValueAtTime(1e-4, at);
  p.linearRampToValueAtTime(Math.max(1e-4, peak), at + attack);
  p.exponentialRampToValueAtTime(1e-4, at + attack + decay);
}
function minorize(bar) {
  return bar.map(([o, l]) => {
    if (o == null) return [o, l];
    const pc = ((o % 12) + 12) % 12;
    return [o - (pc === 4 || pc === 9 || pc === 11 ? 1 : 0), l];
  });
}
// Re-spells a bar into another mode on the same root: `shift` maps a pitch class to a semitone
// offset (e.g. Lydian -> Dorian lowers the 3rd, #4 and 7th).
function modal(bar, shift) {
  return bar.map(([o, l]) => {
    if (o == null) return [o, l];
    const pc = ((o % 12) + 12) % 12;
    return [o + (shift[pc] || 0), l];
  });
}

// ---------------------------------------------------------------------------------------------
// Themes. Notes are [semitones from the key root, length in sixteenths]; every bar sums to 16.

// "Long Meridian" — the main theme. Chords: D Bm G A | D Bm Bb C (back to D).
const THEME = [
  [[0, 4], [7, 6], [5, 2], [4, 2], [5, 2]],
  [[7, 2], [9, 2], [12, 8], [11, 2], [9, 2]],
  [[9, 6], [7, 2], [5, 4], [0, 4]],
  [[2, 4], [4, 2], [5, 2], [7, 8]],
  [[0, 4], [7, 6], [5, 2], [4, 2], [5, 2]],
  [[7, 2], [9, 2], [12, 6], [16, 2], [14, 2], [12, 2]],
  [[12, 4], [15, 6], [12, 2], [8, 4]],
  [[14, 6], [12, 2], [10, 6], [12, 2]]
];
const THEME_CH = [[0, 'maj'], [9, 'min'], [5, 'maj'], [7, 'maj'], [0, 'maj'], [9, 'min'], [8, 'maj'], [10, 'maj']];
// The theme in minor (the Crown, the lament). Chords: i bVI iv V | i iv bVI bVII.
const THEME_MINOR = THEME.map(minorize);
const THEME_MINOR_CH = [[0, 'min'], [8, 'maj'], [5, 'min'], [7, 'maj'], [0, 'min'], [5, 'min'], [8, 'maj'], [10, 'maj']];
// "Soar" — the adventurous answer. Chords: G A F#m Bm | G A Bb Asus4.
const SOAR = [
  [[9, 4], [12, 4], [9, 2], [7, 2], [5, 4]],
  [[7, 4], [11, 4], [14, 6], [12, 2]],
  [[11, 6], [7, 2], [4, 4], [7, 4]],
  [[9, 8], [16, 4], [12, 4]],
  [[9, 4], [12, 4], [17, 6], [16, 2]],
  [[14, 4], [11, 2], [14, 2], [19, 8]],
  [[15, 6], [12, 2], [8, 4], [12, 4]],
  [[12, 8], [11, 8]]
];
const SOAR_CH = [[5, 'maj'], [7, 'maj'], [4, 'min'], [9, 'min'], [5, 'maj'], [7, 'maj'], [8, 'maj'], [7, 'sus4']];
// Storm Wall (E minor): the theme's opening gesture turned into a gale.
const GALE = [
  [[0, 4], [7, 4], [5, 2], [3, 2], [5, 4]],
  [[3, 4], [0, 2], [3, 2], [7, 8]],
  [[5, 4], [2, 4], [5, 2], [7, 2], [10, 4]],
  [[11, 6], [14, 2], [11, 4], [7, 4]],
  [[12, 4], [19, 4], [17, 2], [15, 2], [17, 4]],
  [[15, 4], [12, 2], [15, 2], [19, 8]],
  [[17, 4], [15, 2], [12, 2], [8, 8]],
  [[11, 4], [12, 2], [11, 2], [7, 8]]
];
const GALE_CH = [[0, 'min'], [8, 'maj'], [10, 'maj'], [7, 'maj'], [0, 'min'], [8, 'maj'], [5, 'min'], [7, 'maj']];
const GALE_B_CH = [[0, 'min'], [0, 'min'], [8, 'maj'], [8, 'maj'], [5, 'min'], [5, 'min'], [7, 'maj'], [7, 'maj']];
const GALE_HORN = [[[7, 12], [5, 4]], [[3, 16]], [[3, 12], [5, 4]], [[7, 16]], [[8, 12], [7, 4]], [[5, 16]], [[2, 8], [-1, 8]], [[-1, 16]]];
// The Crown sector (C minor): phrygian chant answered by the minor theme.
const CHANT = [
  [[0, 6], [3, 2], [1, 4], [0, 4]], [[1, 6], [5, 2], [3, 4], [1, 4]], [[0, 6], [3, 2], [1, 4], [0, 4]], [[1, 6], [5, 2], [3, 4], [1, 4]],
  [[8, 6], [7, 2], [3, 4], [0, 4]], [[10, 6], [8, 2], [5, 4], [2, 4]], [[11, 8], [7, 8]], [[2, 8], [-1, 8]]
];
const CHANT_CH = [[0, 'min'], [1, 'maj'], [0, 'min'], [1, 'maj'], [8, 'maj'], [10, 'maj'], [7, 'maj'], [7, 'maj']];
// Vesper (A minor): riffs plus a lead built from the theme's opening.
const V_CH = [[0, 'min'], [0, 'min'], [8, 'maj'], [7, 'maj'], [0, 'min'], [0, 'min'], [5, 'min'], [7, 'maj']];
const V_RIFF = [[0, 0, 3, 0, 5, 0, 6, 5], [0, 0, 3, 0, 8, 7, 5, 3], [0, 0, 4, 0, 5, 0, 6, 5]];
const V_LEAD = [
  [[0, 4], [7, 6], [5, 2], [3, 2], [5, 2]], [[7, 4], [12, 8], [10, 2], [8, 2]], [[8, 6], [7, 2], [3, 4], [0, 4]], [[11, 6], [14, 2], [11, 4], [7, 4]],
  [[0, 4], [7, 6], [5, 2], [3, 2], [5, 2]], [[7, 4], [15, 8], [14, 2], [12, 2]], [[5, 4], [8, 4], [12, 8]], [[11, 6], [14, 2], [11, 4], [7, 4]]
];
// Aurelia (G minor): 3+3+2 syncopation.
const A_CH = [[0, 'min'], [8, 'maj'], [5, 'min'], [7, 'maj'], [0, 'min'], [8, 'maj'], [5, 'min'], [7, 'dom7']];
const A_LEAD = [
  [[0, 3], [2, 3], [3, 2], [7, 8]], [[8, 3], [7, 3], [3, 2], [0, 8]], [[5, 3], [3, 3], [2, 2], [0, 8]], [[7, 3], [11, 3], [14, 2], [11, 8]],
  [[12, 3], [10, 3], [7, 2], [3, 8]], [[8, 3], [10, 3], [12, 2], [15, 8]], [[12, 3], [10, 3], [8, 2], [7, 8]], [[9, 3], [11, 3], [12, 2], [14, 8]]
];
// The Crown (C minor): dread motif, then the minor theme.
const C_CH1 = [[0, 'min'], [1, 'maj'], [0, 'min'], [10, 'maj'], [0, 'min'], [1, 'maj'], [8, 'maj'], [7, 'maj']];
const C_MOTIF = [
  [[0, 8], [1, 4], [0, 4]], [[1, 8], [3, 4], [1, 4]], [[0, 8], [1, 4], [0, 4]], [[-2, 8], [0, 4], [-2, 4]],
  [[0, 8], [3, 4], [2, 4]], [[1, 8], [5, 4], [3, 4]], [[0, 6], [3, 2], [8, 8]], [[-1, 8], [2, 8]]
];
const HANGAR_CH = [[0, 'maj7'], [9, 'min7'], [2, 'min7'], [7, 'dom7'], [0, 'maj7'], [9, 'min7'], [5, 'maj7'], [7, 'sus4']];
const LAMENT_CH = [[0, 'min'], [8, 'maj'], [5, 'min'], [7, 'maj'], [0, 'min'], [8, 'maj'], [10, 'maj'], [7, 'sus4']];

// ---------------------------------------------------------------------------------------------
// Cue definitions. bar(m, I, b, t, S, s): m = director, I = cue instance, b = bar since the cue
// started, t = bar start time, S = sixteenth length, s = latest state.

function impact(m, I, t, key, chord, center, vel = 0.5) {
  m.boom(I, t, vel * 1.6);
  m.crash(I, t, vel * 1.1);
  m.taiko(I, t, vel * 1.6, true);
  m.chord(I, 'brass', t, 0.42, key, chord, center, vel, { timbre: 'brass', attack: 0.012, rel: 0.35 });
}

const CUES = {
  title: {
    bpm: 108, key: 62, intro: 2, loop: true, level: 1,
    bar(m, I, b, t, S, s) {
      const K = 62, B = 38;
      if (b === 0) {
        m.roll(I, 'timp', t, S * 16, 45, 0.06, 0.5, S / 2);
        m.chord(I, 'brass', t, S * 15, K, [7, 'sus4'], 52, 0.24, { timbre: 'brass', attack: S * 13, bright: 0.6 });
        m.revCymbal(I, t + S * 8, S * 8, 0.32);
        return;
      }
      if (b === 1) {
        impact(m, I, t, K, [7, 'maj'], 57, 0.42);
        m.chord(I, 'brass', t + S * 6, 0.3, K, [7, 'maj'], 59, 0.32, { timbre: 'brass', attack: 0.012 });
        m.chord(I, 'brass', t + S * 8, S * 6, K, [7, 'sus4'], 59, 0.3, { timbre: 'brass', attack: 0.04 });
        m.drums(I, 't', '......x.x...xxxx', t, S, 0.55);
        m.roll(I, 'snare', t + S * 10, S * 6, 0, 0.08, 0.5, S / 2);
        m.bassPat(I, 'R-----R-R-------', t, S, B, [7, 'maj'], 0.45, { type: 'synth' });
        return;
      }
      const L = (b - 2) % 16, A = L < 8, i = L % 8;
      const ch = A ? THEME_CH[i] : SOAR_CH[i], mel = A ? THEME[i] : SOAR[i];
      if (i === 0) m.crash(I, t, 0.36);
      m.mel(I, 'lead', mel, t, S, K, { vel: 0.44, bright: 0.85 });
      if (i >= 2 || !A) m.mel(I, 'brass', mel, t, S, K - 12, { vel: 0.22, bright: 0.45, vib: 0 });
      m.chord(I, 'pad', t, S * 16, K, ch, 62, 0.2, { attack: 0.35, cutoff: 1700 });
      m.bassPat(I, A ? 'R-------R---F---' : 'R-R-O-R-R-R-O-R-', t, S, B, ch, 0.42, { type: A ? 'synth' : 'pulse' });
      m.drums(I, 'T', 'x.....o.x.......', t, S, 0.62);
      m.drums(I, 's', i === 7 ? '....x.......xxxx' : '....x.......x.--', t, S, 0.3);
      if (!A) m.drums(I, 'h', '..x...x...x...x.', t, S, 0.2);
      if (!A || i >= 4) m.arp(I, t, S, K, ch, 76, [0, 1, 2, 3, 4, 3, 2, 1], 0.05, 2, { wave: 'triangle', decay: 0.4 });
      if (i === 3 || i === 7) m.timp(I, t + S * 8, B + 12 + norm(ch[0]), 0.34);
    }
  },
  hangar: {
    bpm: 96, key: 62, intro: 0, loop: true, level: 1.2,
    bar(m, I, b, t, S, s) {
      const K = 62, B = 38, i = b % 8, ch = HANGAR_CH[i];
      m.drums(I, 'k', 'x.......x.x.....', t, S, 0.5);
      m.drums(I, 'r', '....x.......x..-', t, S, 0.3);
      m.drums(I, 'z', 'x-x-x-x-x-x-x-x-', t, S, 0.3);
      m.drums(I, 'h', '..x...x...x...x.', t, S, 0.14);
      m.drums(I, 'H', '..............o.', t, S, 0.2);
      m.bassPat(I, 'R-.R-.F-R---.O-.', t, S, B, ch, 0.36, { type: 'pick' });
      m.keysChord(I, 'keys', t, S * 5, m.voicing(K, ch, 64, 4), 0.2);
      m.keysChord(I, 'keys', t + S * 10, S * 4, m.voicing(K, ch, 66, 4), 0.13);
      m.chord(I, 'pad', t, S * 16, K, ch, 57, 0.08, { timbre: 'warm', attack: 0.6, cutoff: 900 });
      if (b >= 8 && i < 4) m.mel(I, 'keys', THEME[i], t, S, K + 12, { voice: 'pluck', vel: 0.11, wave: 'triangle', decay: 0.5 });
      m.arp(I, t, S, K, ch, 79, [0, 2, 1, 3, 2, 4, 1, 3], 0.035, 2, { wave: 'triangle', decay: 0.32 });
      if (i === 7) m.bell(I, 'keys', t + S * 12, K + 24 + 7, 0.05, 1.8);
    }
  },
  sector1: {
    bpm: 138, key: 62, intro: 1, loop: true, level: 1,
    bar(m, I, b, t, S, s) {
      const K = 62, B = 38, inten = clamp(s.intensity ?? 0.5, 0, 1);
      if (b === 0) {
        m.roll(I, 'snare', t, S * 12, 0, 0.06, 0.45, S / 2);
        m.drums(I, 'm', '............x...', t, S, 0.6, { tom: 52 });
        m.drums(I, 'm', '.............x..', t, S, 0.62, { tom: 47 });
        m.drums(I, 'm', '..............xx', t, S, 0.66, { tom: 43 });
        m.riser(I, t, S * 16, 0.16);
        m.chord(I, 'brass', t, S * 14, K, [7, 'sus4'], 57, 0.2, { timbre: 'brass', attack: S * 12, bright: 0.7 });
        m.bassPat(I, 'R...R...R...R-R-', t, S, B, [7, 'maj'], 0.4, { type: 'pulse' });
        return;
      }
      const L = (b - 1) % 16, A = L < 8, i = L % 8;
      const ch = A ? THEME_CH[i] : SOAR_CH[i], mel = A ? THEME[i] : SOAR[i];
      if (i === 0) { m.crash(I, t, 0.38); m.taiko(I, t, 0.7, true); }
      m.mel(I, 'lead', mel, t, S, K, { vel: 0.4, bright: 1 });
      if (i >= 4) m.mel(I, 'brass', mel, t, S, K - 12, { vel: 0.16, bright: 0.4, vib: 0 });
      m.chord(I, 'pad', t, S * 16, K, ch, 64, 0.12, { attack: 0.22, rel: 0.5, cutoff: 1900 });
      m.bassPat(I, 'R-O-R-O-R-O-R-O-', t, S, B, ch, 0.4, { type: 'pulse' });
      m.drums(I, 'k', 'x...x...x...x...', t, S, 0.72);
      m.drums(I, 's', i === 7 ? '....x.......xxxx' : '....x.......x...', t, S, 0.5);
      m.drums(I, 'h', inten > 0.55 ? '-.x--.x--.x--.x-' : '..x...x...x...x.', t, S, 0.24);
      if (!A || inten > 0.45) m.arp(I, t, S, K, ch, 76, [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1], A ? 0.04 : 0.055, 1, { decay: 0.14 });
      if (inten > 0.7 && i % 2 === 1) m.drums(I, 't', '........x..x..x.', t, S, 0.45);
    }
  },
  sector2: {
    bpm: 150, key: 64, intro: 1, loop: true, level: 0.86,
    bar(m, I, b, t, S, s) {
      const K = 64, B = 40, inten = clamp(s.intensity ?? 0.5, 0, 1);
      const trem = 1 / (S * 2);
      if (b === 0) {
        m.chord(I, 'pad', t, S * 16, K, [0, 'min'], 64, 0.16, { trem, attack: 0.3, cutoff: 2400 });
        m.drums(I, 'T', 'x.......x...x.x.', t, S, 0.62);
        m.drums(I, 't', '............xxxx', t, S, 0.45);
        m.riser(I, t + S * 4, S * 12, 0.16);
        m.bassPat(I, 'RRRRRRRRRRRRRRRR', t, S, B, [0, 'min'], 0.32, { type: 'pulse', accent: 'x..x..x.x..x..x.' });
        return;
      }
      const L = (b - 1) % 16, A = L < 8, i = L % 8, ch = A ? GALE_CH[i] : GALE_B_CH[i];
      if (i === 0) { m.crash(I, t, 0.36); m.taiko(I, t, 0.65, true); }
      m.bassPat(I, 'RRRORRRFRRRORRFR', t, S, B, ch, 0.34, { type: 'pulse', accent: 'x..x..x.x..x..x.' });
      m.chord(I, 'pad', t, S * 16, K, ch, 66, 0.11, { trem, attack: 0.12, rel: 0.4, cutoff: 2600 });
      m.drums(I, 'k', 'x..x..x.x..x..x.', t, S, 0.66);
      m.drums(I, 's', i === 7 || (!A && i === 6) ? '....x...x.x.xxxx' : '....x.......x...', t, S, 0.5);
      if (inten > 0.35) m.drums(I, 'h', '-x-x-x-x-x-x-x-x', t, S, 0.2);
      if (A) {
        m.mel(I, 'lead', GALE[i], t, S, K, { vel: 0.36, bright: 0.9 });
        if (i >= 4) m.mel(I, 'brass', GALE[i], t, S, K - 12, { vel: 0.16, bright: 0.45, vib: 0 });
      } else {
        for (const k of [0, 3, 6, 10]) m.chord(I, 'brass', t + k * S, S * 1.4, K, ch, 64, 0.26, { timbre: 'brass', attack: 0.01, rel: 0.12 });
        m.mel(I, 'brass', GALE_HORN[i], t, S, K - 12, { vel: 0.26, bright: 0.55 });
      }
      if (i === 3 || i === 7) m.drums(I, 'm', '............xxxx', t, S, 0.5, { tom: 45 });
      if (inten > 0.65) m.drums(I, 't', '..x.....x..x....', t, S, 0.4);
    }
  },
  sector3: {
    bpm: 128, key: 62, intro: 1, loop: true, level: 1,
    bar(m, I, b, t, S, s) {
      const K = 62, B = 38, inten = clamp(s.intensity ?? 0.5, 0, 1);
      if (b === 0) {
        m.boom(I, t, 0.8);
        m.chord(I, 'choir', t, S * 16, K, [0, 'min'], 62, 0.24, { timbre: 'choir', attack: S * 10, cutoff: 2400 });
        m.drums(I, 'T', 'x...........x.xx', t, S, 0.6);
        m.riser(I, t + S * 2, S * 14, 0.15);
        return;
      }
      const L = (b - 1) % 16, A = L < 8, i = L % 8, ch = A ? THEME_MINOR_CH[i] : CHANT_CH[i];
      const r = norm(ch[0]);
      if (i === 0) m.crash(I, t, 0.34);
      m.chord(I, 'choir', t, S * 16, K, ch, 62, A ? 0.13 : 0.18, { timbre: 'choir', attack: 0.4 });
      m.ostinato(I, t, S, 50 + r, [0, 12, 7, 12, 0, 12, 7, 12], 0.12);
      m.bassPat(I, 'R-------R---R---', t, S, B, ch, 0.42, { type: 'synth' });
      m.drums(I, 'T', 'x.....x...x.....', t, S, 0.78);
      m.drums(I, 't', '...x.......x..x.', t, S, 0.38);
      m.drums(I, 's', '........x.......', t, S, 0.46);
      m.drums(I, 'h', inten > 0.5 ? '-.x--.x--.x--.x-' : '..x...x...x...x.', t, S, 0.15);
      if (i % 2 === 0) m.timp(I, t, B + 12 + r, 0.32);
      if (A) {
        m.mel(I, 'brass', THEME_MINOR[i], t, S, K - 12, { vel: 0.42, bright: 0.7, sub: true });
        if (i >= 4) m.mel(I, 'lead', THEME_MINOR[i], t, S, K, { vel: 0.24, bright: 0.8 });
      } else {
        m.mel(I, 'brass', CHANT[i], t, S, K - 12, { vel: 0.4, bright: 0.65, sub: true });
        if (i >= 6) m.drums(I, 't', 'x-x-x-x-x-x-xxxx', t, S, 0.42);
      }
    }
  },
  interlude: {
    bpm: 126, key: 62, intro: 0, loop: false, length: 2, level: 1,
    bar(m, I, b, t, S, s) {
      const K = 62;
      if (I.variant === 'climb') {
        // LEVIATHAN -> SKYFORGE: the camera climbs out of the typhoon. D minor strings rise
        // through Bb to a C major arrival, the dominant of sector 5's F Lydian.
        if (b === 0) {
          m.taiko(I, t, 0.7, true); m.boom(I, t, 0.45);
          m.pad(I, 'strings', t, S * 16, [50, 57, 62, 65], 0.15, { attack: 0.2, rel: 0.4, trem: 1 / S, cutoff: 2000 });
          for (let k = 0; k < 16; k++) m.spicc(I, 'strings', t + k * S, 50 + [0, 7, 12, 7][k % 4] + Math.floor(k / 4) * 2, 0.12 + k * 0.008);
          m.riser(I, t, S * 16, 0.16);
          m.bass(I, t, S * 15, 38, 0.36, { type: 'synth' });
        } else {
          m.crash(I, t, 0.42);
          m.chord(I, 'strings', t, S * 8, K, [8, 'add9'], 64, 0.17, { attack: 0.06 });
          m.chord(I, 'strings', t + S * 8, S * 8, K, [10, 'maj'], 67, 0.18, { attack: 0.08 });
          m.chord(I, 'brass', t + S * 8, S * 7.5, K, [10, 'maj'], 60, 0.26, { timbre: 'brass', attack: 0.06, bright: 0.7 });
          m.bass(I, t, S * 7.6, 34, 0.38, { type: 'synth' }); m.bass(I, t + S * 8, S * 7.6, 36, 0.4, { type: 'synth' });
          [79, 84, 86, 88, 91].forEach((n, k) => m.bell(I, 'keys', t + S * (2 + k * 2.5), n, 0.05, 1.8));
        }
        return;
      }
      if (b === 0) {
        m.taiko(I, t, 0.8, true);
        m.chord(I, 'brass', t, S * 5, K, [8, 'maj'], 62, 0.36, { timbre: 'brass', attack: 0.015 });
        m.bass(I, t, S * 5, 34, 0.42, { type: 'synth' });
        m.chord(I, 'brass', t + S * 6, S * 1.6, K, [10, 'maj'], 64, 0.3, { timbre: 'brass', attack: 0.012 });
        m.chord(I, 'brass', t + S * 8, S * 7.6, K, [10, 'maj'], 64, 0.36, { timbre: 'brass', attack: 0.015 });
        m.bass(I, t + S * 6, S * 9.6, 36, 0.42, { type: 'synth' });
        m.roll(I, 'snare', t + S * 8, S * 8, 0, 0.1, 0.55, S / 2);
        m.mel(I, 'lead', [[null, 13], [7, 1], [9, 1], [11, 1]], t, S, K, { vel: 0.32, bright: 1, leg: 0.8 });
        m.chord(I, 'pad', t, S * 16, K, [10, 'maj'], 62, 0.1, { attack: 0.3 });
      } else {
        m.crash(I, t, 0.5); m.taiko(I, t, 0.9, true); m.boom(I, t, 0.5);
        m.chord(I, 'brass', t, S * 14, K, [0, 'maj'], 66, 0.42, { timbre: 'brass', attack: 0.02, bright: 0.9 });
        m.chord(I, 'pad', t, S * 16, K, [0, 'add9'], 62, 0.16, { attack: 0.08 });
        m.brass(I, 'lead', t, S * 6, K + 12, 0.4, { bright: 1 });
        m.brass(I, 'lead', t + S * 6, S * 10, K + 19, 0.4, { bright: 1 });
        m.bass(I, t, S * 15, 38, 0.44, { type: 'synth' });
        [74, 78, 81, 86].forEach((n, k) => m.bell(I, 'keys', t + S * (2 + k * 2), n, 0.07, 1.8));
        m.roll(I, 'timp', t + S * 4, S * 8, 50, 0.32, 0.06, S / 2);
      }
    }
  },
  victory: {
    bpm: 84, key: 62, intro: 1, loop: true, level: 1,
    bar(m, I, b, t, S, s) {
      const K = 62, B = 38, grand = /^[SA]/.test(String(I.grade || 'A'));
      if (b === 0) {
        m.revCymbal(I, t, S * 16, 0.34);
        m.roll(I, 'timp', t, S * 16, 45, 0.05, 0.42, S / 2);
        m.chord(I, 'brass', t, S * 15, K, [7, 'sus4'], 55, 0.2, { timbre: 'brass', attack: S * 12, bright: 0.5 });
        return;
      }
      const L = (b - 1) % 16, A = L < 8, i = L % 8;
      const ch = A ? THEME_CH[i] : SOAR_CH[i], mel = A ? THEME[i] : SOAR[i];
      if (i === 0) m.crash(I, t, 0.32);
      m.mel(I, 'lead', mel, t, S, K, { vel: A ? 0.4 : 0.3, bright: grand ? 0.75 : 0.55, vib: 10 });
      if (i >= 2) m.mel(I, 'brass', mel, t, S, K - 12, { vel: 0.2, bright: 0.4, vib: 0 });
      m.chord(I, 'pad', t, S * 16, K, ch, 64, 0.2, { attack: 0.5, cutoff: 1800 });
      if (!A) m.chord(I, 'choir', t, S * 16, K, ch, 69, 0.1, { timbre: 'choir', attack: 0.8 });
      m.bassPat(I, 'R-------F-------', t, S, B, ch, 0.4, { type: 'synth' });
      if (grand || !A) m.timp(I, t, B + 12 + norm(ch[0]), 0.36);
      m.drums(I, 'T', 'x.......o.......', t, S, 0.42);
      m.arp(I, t, S, K, ch, 81, [0, 2, 1, 3, 2, 4, 3, 1], 0.045, 2, { wave: 'triangle', decay: 0.6 });
    }
  },
  gameover: {
    bpm: 66, key: 62, intro: 1, loop: true, level: 0.95,
    bar(m, I, b, t, S, s) {
      const K = 62, B = 38;
      if (b === 0) {
        m.boom(I, t, 0.5);
        m.chord(I, 'pad', t, S * 16, K, [0, 'min'], 57, 0.16, { attack: 1.6, cutoff: 1100 });
        m.bass(I, t, S * 15, B, 0.3, { type: 'synth' });
        return;
      }
      const i = (b - 1) % 8, ch = LAMENT_CH[i];
      m.chord(I, 'pad', t, S * 16, K, ch, 57, 0.15, { attack: 0.9, rel: 1.4, cutoff: 1200 });
      m.bassPat(I, 'R---------------', t, S, B, ch, 0.3, { type: 'synth' });
      if (i < 4) m.mel(I, 'lead', THEME_MINOR[i], t, S, K - 12, { vel: 0.34, bright: 0.45, attack: 0.09, vib: 11 });
      else m.mel(I, 'keys', i === 7 ? [[2, 8], [null, 8]] : [[0, 4], [7, 4], [5, 4], [3, 4]], t, S, K + 12, { voice: 'bell', vel: 0.05, decay: 2.4 });
      if (i === 0 || i === 4) m.timp(I, t, B + 12, 0.24, 1.6);
    }
  },
  drillClear: {
    bpm: 100, key: 62, intro: 0, loop: true, level: 0.85,
    bar(m, I, b, t, S, s) {
      const K = 62, i = b % 4, ch = [[0, 'maj'], [5, 'maj'], [9, 'min'], [7, 'maj']][i];
      const tune = [THEME[0], THEME[1], [[9, 6], [7, 2], [5, 8]], [[2, 4], [4, 4], [7, 8]]][i];
      m.keysChord(I, 'keys', t, S * 6, m.voicing(K, ch, 64, 4), 0.16);
      m.keysChord(I, 'keys', t + S * 8, S * 6, m.voicing(K, ch, 64, 4), 0.11);
      m.mel(I, 'keys', tune, t, S, K + 12, { voice: 'pluck', vel: 0.12, wave: 'triangle', decay: 0.45 });
      m.drums(I, 'z', 'x-x-x-x-x-x-x-x-', t, S, 0.16);
      m.drums(I, 'k', 'x.......x.......', t, S, 0.4);
      m.bassPat(I, 'R---R---F---R---', t, S, 38, ch, 0.3, { type: 'pick' });
    }
  },
  drillFail: {
    bpm: 90, key: 62, intro: 0, loop: true, level: 0.85,
    bar(m, I, b, t, S, s) {
      const K = 62, i = b % 4, ch = [[0, 'min'], [8, 'maj'], [3, 'maj'], [7, i === 3 ? 'maj' : 'sus4']][i];
      m.chord(I, 'pad', t, S * 16, K, ch, 60, 0.12, { attack: 0.5, cutoff: 1300 });
      m.mel(I, 'keys', [[[0, 4], [3, 4], [7, 4], [10, 4]], [[8, 4], [7, 4], [3, 8]], [[3, 4], [5, 4], [7, 8]], [[5, 4], [4, 4], [null, 8]]][i], t, S, K + 12, { voice: 'pluck', vel: 0.1, wave: 'triangle', decay: 0.5 });
      m.drums(I, 'z', 'x...x...x...x...', t, S, 0.12);
      m.bassPat(I, 'R-------R-------', t, S, 38, ch, 0.26, { type: 'synth' });
    }
  },
  pause: {
    bpm: 60, key: 62, intro: 0, loop: true, level: 0.8,
    bar(m, I, b, t, S, s) {
      const K = I.keyRoot ?? 62, minor = !!I.minor, i = b % 2;
      m.chord(I, 'pad', t, S * 16, K, i ? [5, minor ? 'madd9' : 'add9'] : [0, 'sus2'], 60, 0.09, { timbre: 'warm', attack: 1.2, rel: 1.6, cutoff: 900 });
      const head = i ? [5, minor ? 3 : 4] : [0, 7];
      m.bell(I, 'keys', t, K + 12 + head[0], 0.04, 2.6);
      m.bell(I, 'keys', t + S * 8, K + 12 + head[1], 0.035, 2.6);
    }
  }
};

// Warnings take the key and tempo of the flagship that is coming.
// Indexed by sector, 1..6 (sector 6 is planned; its entry keeps warning6 valid until it is scored).
// `light` swaps the taiko pulse for toms (sector 5 sits above the storm, so its drums stay light).
const BOSS_KEYS = [null, { key: 57, bass: 33, bpm: 156 }, { key: 55, bass: 43, bpm: 160 }, { key: 62, bass: 38, bpm: 144 },
  { key: 62, bass: 38, bpm: 168 }, { key: 65, bass: 41, bpm: 156, light: true }, { key: 62, bass: 38, bpm: 160 }];
for (let stage = 1; stage < BOSS_KEYS.length; stage++) {
  const k = BOSS_KEYS[stage];
  CUES['warning' + stage] = {
    bpm: k.bpm, key: k.key, intro: 0, loop: true, level: 1,
    bar(m, I, b, t, S, s) {
      const start = I.warnStart ?? I.start, p0 = clamp((t - start) / BOSS_WARNING_LEAD, 0, 1);
      if (b === 0) {
        m.riser(I, t, Math.max(0.4, (1 - p0) * BOSS_WARNING_LEAD), 0.2);
        if (stage === 4) { m.boom(I, t, 0.7); m.chord(I, 'brass', t, S * 14, k.key, [0, 'five'], 50, 0.28, { timbre: 'brass', attack: 0.18, bright: 0.4 }); }
        if (stage === 5) {
          // The Lydian sky curdles: a high string cluster bends from F major toward F minor.
          const left = Math.max(0.5, (1 - p0) * BOSS_WARNING_LEAD);
          m.pad(I, 'strings', t, left, [77, 81, 84], 0.13, { attack: 0.08, rel: 0.3, trem: 1 / S, cutoff: 3600 });
          m.pad(I, 'strings', t + left * 0.45, left * 0.55, [77, 80, 83], 0.15, { attack: left * 0.3, rel: 0.25, trem: 1 / S, cutoff: 3200 });
          m.boom(I, t, 0.45);
        }
      }
      for (let n = 0; n < 16; n++) {
        const tk = t + n * S, p = clamp((tk - start) / BOSS_WARNING_LEAD, 0, 1);
        if (p >= 1) break;
        if (n % 2 === 0) m.bass(I, tk, S * 1.6, k.bass, (0.2 + 0.32 * p) * (k.light ? 0.75 : 1), { type: k.light ? 'pulse' : 'growl' });
        if (k.light) {
          // Spiccato strings climb the warning instead of a drum swell.
          m.spicc(I, 'strings', tk, k.key - 12 + [0, 7, 12, 7][n % 4] + Math.floor(p * 6), 0.12 + 0.2 * p);
          if (n % 4 === 0) m.tom(I, tk, 0.3 + 0.4 * p, 45 + Math.floor(p * 6));
        }
        if (n % 4 === 0) {
          if (!k.light) m.taiko(I, tk, 0.28 + 0.5 * p, p > 0.5);
          const r = k.key + 12 + Math.floor(p * 7);
          m.pad(I, 'pad', tk, S * 3.6, [r, r + 1, r + 6], 0.05 + 0.14 * p, { attack: 0.03, rel: 0.15, trem: 1 / S, cutoff: 3200 });
        }
        if (p > 0.72 && n % 4 === 2) { if (k.light) m.tom(I, tk, 0.3 + 0.35 * p, 50); else m.taiko(I, tk, 0.3 + 0.4 * p, false); }
        if (p > 0.55) { const v = 0.06 + 0.42 * (p - 0.55) / 0.45; m.snare(I, tk, v, { decay: 0.08 }); m.snare(I, tk + S / 2, v * 0.8, { decay: 0.07 }); }
      }
    }
  };
}

CUES.boss1 = {
  bpm: 156, key: 57, intro: 0, loop: true, level: 1,
  bar(m, I, b, t, S, s) {
    const K = 57, B = 33, ph = clamp(s.bossPhase || 1, 1, 3), low = (s.bossHp ?? 1) < 0.25, drill = I.variant === 'drill';
    const i = b % 8, ch = V_CH[i], r = norm(ch[0]);
    if (b === 0) impact(m, I, t, K, ch, 57, 0.5);
    else if (i === 0 && ph >= 2) m.crash(I, t, 0.32);
    const riff = ch[1] === 'maj' && ch[0] === 7 ? V_RIFF[2] : V_RIFF[i % 2];
    for (let k = 0; k < 8; k++) {
      const n = riff[k] + r;
      m.bass(I, t + k * 2 * S, S * 1.7, B + n, 0.31, { type: 'growl' });
      if (ph >= 2 || k === 0 || k === 4 || k === 6) m.brass(I, 'brass', t + k * 2 * S, S * 1.5, K + n, 0.2, { attack: 0.01, rel: 0.08, vib: 0, bright: 0.8, scoop: false });
    }
    m.drums(I, 'k', 'x.x.x.x.x.x.x.x.', t, S, 0.62);
    m.drums(I, 's', i === 7 ? '....x.......x.xx' : '....x.......x...', t, S, 0.56);
    m.drums(I, 'h', ph >= 2 || low ? 'x-x-x-x-x-x-x-x-' : '..x...x...x...x.', t, S, 0.2);
    if (ph >= 2) m.mel(I, 'lead', V_LEAD[i], t, S, K + 12, { vel: 0.34, bright: 1, timbre: drill ? 'sim' : undefined });
    if (ph >= 3 && !drill) m.chord(I, 'choir', t, S * 16, K, ch, 64, 0.14, { timbre: 'choir', attack: 0.3 });
    if (ph >= 3 || low) m.drums(I, 'T', 'x..x..x.x..x..x.', t, S, 0.5);
    if (low && i % 2 === 1) m.roll(I, 'snare', t + S * 12, S * 4, 0, 0.12, 0.42, S / 2);
    if (drill && i % 2 === 0) m.bell(I, 'keys', t, K + 24, 0.05, 0.7);
  }
};
CUES.boss2 = {
  bpm: 160, key: 55, intro: 0, loop: true, level: 1,
  bar(m, I, b, t, S, s) {
    const K = 55, B = 43, ph = clamp(s.bossPhase || 1, 1, 3), low = (s.bossHp ?? 1) < 0.25, drill = I.variant === 'drill';
    const i = b % 8, ch = A_CH[i];
    if (b === 0) impact(m, I, t, K, ch, 60, 0.5);
    else if (i === 0 && ph >= 2) m.crash(I, t, 0.32);
    m.bassPat(I, 'R--R--F-R--R--O-', t, S, B, ch, 0.42, { type: 'growl' });
    const hits = ph >= 2 ? [0, 3, 6, 8, 11, 14] : [0, 3, 6];
    for (const k of hits) m.chord(I, 'brass', t + k * S, S * 1.4, K, ch, 62, k < 8 ? 0.24 : 0.2, { timbre: 'brass', attack: 0.01, rel: 0.1 });
    m.drums(I, 'k', 'x..x..x.x..x..x.', t, S, 0.64);
    m.drums(I, 's', low ? '....x..x....x.xx' : '....x.......x...', t, S, 0.54);
    m.drums(I, 'h', ph >= 2 ? '-x-x-x-x-x-x-x-x' : '..x...x...x...x.', t, S, 0.2);
    if (ph >= 2) m.mel(I, 'lead', A_LEAD[i], t, S, K + 12, { vel: 0.33, bright: 1, timbre: drill ? 'sim' : undefined });
    if (ph >= 3) {
      m.arp(I, t, S, K, ch, 79, [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3], 0.045, 1, { decay: 0.13 });
      if (!drill) m.chord(I, 'choir', t, S * 16, K, ch, 62, 0.12, { timbre: 'choir', attack: 0.3 });
      m.drums(I, 't', '..x..x....x..x..', t, S, 0.42);
    }
    if (drill && i % 2 === 0) m.bell(I, 'keys', t, K + 24, 0.05, 0.7);
  }
};
CUES.boss3 = {
  bpm: 144, key: 62, intro: 0, loop: true, level: 1,
  bar(m, I, b, t, S, s) {
    const K = 62, B = 38, ph = clamp(s.bossPhase || 1, 1, 3), low = (s.bossHp ?? 1) < 0.2, drill = I.variant === 'drill';
    const i = b % 8, ch = ph >= 2 ? THEME_MINOR_CH[i] : C_CH1[i], r = norm(ch[0]);
    if (b === 0) { impact(m, I, t, K, ch, 62, 0.52); m.chord(I, 'choir', t, S * 16, K, ch, 62, 0.22, { timbre: 'choir', attack: 0.05, cutoff: 2400 }); }
    else if (i === 0) m.crash(I, t, 0.34);
    m.ostinato(I, t, S, 50 + r, [0, 12, 7, 12, 0, 12, 7, 12], 0.12);
    m.bassPat(I, ph >= 2 ? 'R-R-R-R-R-R-R-O-' : 'R-------R-------', t, S, B, ch, 0.42, { type: ph >= 2 ? 'growl' : 'synth' });
    if (!drill || ph >= 2) m.chord(I, 'choir', t, S * 16, K, ch, 62, ph >= 3 ? 0.18 : 0.13, { timbre: 'choir', attack: 0.3 });
    m.drums(I, 'T', 'x..x..x.x..x..x.', t, S, ph >= 2 ? 0.66 : 0.56);
    if (ph >= 2) { m.drums(I, 'k', 'x.......x.......', t, S, 0.6); m.drums(I, 's', '....x.......x...', t, S, 0.54); }
    if (ph >= 3) m.drums(I, 'h', '-x-x-x-x-x-x-x-x', t, S, 0.2);
    if (low) m.drums(I, 't', 'x-x-x-x-x-x-x-x-', t, S, 0.36);
    if (ph >= 3 && i === 7) m.roll(I, 'timp', t + S * 8, S * 8, B + 12, 0.1, 0.5, S / 2);
    if (ph === 1) m.mel(I, 'brass', C_MOTIF[i], t, S, K - 12, { vel: 0.36, bright: 0.6, sub: true });
    else {
      m.mel(I, 'lead', THEME_MINOR[i], t, S, K, { vel: 0.38, bright: 0.95, timbre: drill ? 'sim' : undefined });
      m.mel(I, 'brass', THEME_MINOR[i], t, S, K - 12, { vel: 0.22, bright: 0.5, vib: 0 });
    }
    if (i % 2 === 0) m.timp(I, t, B + 12 + r, 0.3);
    if (drill && i % 2 === 0) m.bell(I, 'keys', t, K + 24, 0.05, 0.7);
  }
};
// Act II: the Crown's D minor becomes a naval war march. The lead waits two bars;
// combat density adds upper percussion and octave answers, rather than simply more gain.
const IRON_LEAD = [
  [[0, 3], [7, 3], [12, 6], [10, 2], [7, 2]],
  [[8, 6], [7, 2], [3, 4], [5, 4]],
  [[5, 3], [7, 3], [12, 4], [15, 4], [14, 2]],
  [[11, 6], [7, 2], [2, 4], [-1, 4]],
  [[12, 3], [19, 3], [17, 4], [15, 4], [12, 2]],
  [[15, 6], [14, 2], [12, 4], [7, 4]],
  [[8, 4], [12, 4], [15, 6], [14, 2]],
  [[11, 3], [14, 3], [12, 6], [11, 2], [7, 2]]
];
function ironRiff(m, I, t, S, root, vel, dense) {
  for (const [k, n] of [[0, 0], [3, 0], [6, 7], [8, 0], [11, 12], [14, 7]]) {
    m.brass(I, 'brass', t + k * S, S * 1.3, root + n, vel,
      { attack: 0.008, rel: 0.08, bright: dense ? 0.8 : 0.5, vib: 0, scoop: false });
  }
}
CUES.sector4 = {
  bpm: 160, key: 62, intro: 2, loop: true, level: 0.94,
  bar(m, I, b, t, S, s) {
    const intensity = clamp(s.intensity ?? 0.5, 0, 1), i = Math.max(0, b - 2) % 8;
    const ch = b < 2 ? [0, 'min'] : THEME_MINOR_CH[i], r = norm(ch[0]);
    if (b === 0) impact(m, I, t, 62, ch, 50, 0.55);
    else if (i === 0 && b >= 2) m.crash(I, t, 0.4);
    ironRiff(m, I, t, S, 38 + r, 0.31, intensity > 0.6);
    m.bassPat(I, 'RRRORRFRRRRORRFR', t, S, 38, ch, 0.32, { type: 'pulse', accent: 'x..x..x.x..x..x.' });
    m.drums(I, 'T', 'x.....x.x.....x.', t, S, 0.7);
    m.drums(I, 's', i === 7 ? '....x.......xxxx' : '....x.......x...', t, S, 0.5);
    if (b === 1) m.riser(I, t, S * 16, 0.18);
    if (b >= 2) {
      m.mel(I, 'lead', IRON_LEAD[i], t, S, 74, { vel: 0.36, bright: 0.95 });
      m.chord(I, 'pad', t, S * 16, 62, ch, 62, 0.1, { attack: 0.2, cutoff: 1900 });
    }
    if (intensity > 0.35) m.drums(I, 'h', '-x-x-x-x-x-x-x-x', t, S, 0.18);
    if (intensity > 0.65) {
      m.drums(I, 't', '...x.......x..x.', t, S, 0.42);
      if (b >= 2 && i >= 4) m.mel(I, 'brass', IRON_LEAD[i], t, S, 62, { vel: 0.17, bright: 0.5, vib: 0 });
    }
  }
};
CUES.boss4 = {
  bpm: 168, key: 62, intro: 0, loop: true, level: 0.94,
  bar(m, I, b, t, S, s) {
    const ph = clamp(s.bossPhase || 1, 1, 3), i = b % 8;
    const ch = ph === 1 ? C_CH1[i] : THEME_MINOR_CH[i], r = norm(ch[0]);
    if (b === 0 || i === 0) impact(m, I, t, 62, ch, 50, b === 0 ? 0.65 : 0.45);
    ironRiff(m, I, t, S, 38 + r, 0.34, true);
    m.bassPat(I, 'RRRORRFRRRRORRFR', t, S, 38, ch, 0.34, { type: 'growl', accent: 'x..x..x.x..x..x.' });
    m.chord(I, 'choir', t, S * 16, 62, ch, 62, ph === 3 ? 0.19 : 0.13, { timbre: 'choir', attack: 0.18 });
    m.drums(I, 'T', 'x..x..x.x..x..x.', t, S, 0.68);
    m.drums(I, 's', '....x.......x...', t, S, 0.56);
    m.mel(I, ph === 1 ? 'brass' : 'lead', ph === 1 ? C_MOTIF[i] : IRON_LEAD[i], t, S, ph === 1 ? 50 : 74,
      { vel: ph === 1 ? 0.4 : 0.38, bright: 0.9, sub: ph === 1 });
    if (ph >= 2) {
      m.drums(I, 'k', 'x.......x.......', t, S, 0.6);
      m.drums(I, 'h', '-x-x-x-x-x-x-x-x', t, S, 0.19);
    }
    if (ph >= 3) {
      m.mel(I, 'brass', IRON_LEAD[i], t, S, 62, { vel: 0.2, vib: 0, bright: 0.6 });
      m.arp(I, t, S, 62, ch, 86, [0, 2, 1, 3, 2, 4, 3, 1], 0.045, 2, { decay: 0.16 });
      m.drums(I, 't', '..x..x....x..x..', t, S, 0.36);
    }
    if ((s.bossHp ?? 1) < 0.2 && i % 2 === 1) m.roll(I, 'snare', t + S * 12, S * 4, 0, 0.12, 0.4, S / 2);
  }
};
CUES.actTwo = {
  bpm: 120, key: 62, intro: 0, loop: false, length: 3, level: 0.95,
  bar(m, I, b, t, S) {
    const ch = [[0, 'min'], [8, 'maj'], [7, 'maj']][b];
    if (b === 0) { m.boom(I, t, 1); m.crash(I, t, 0.5); }
    m.chord(I, 'choir', t, S * 16, 62, ch, 62, 0.2, { timbre: 'choir', attack: 0.15, rel: 0.5 });
    m.chord(I, 'brass', t, S * 12, 62, ch, 50, 0.34, { timbre: 'brass', attack: 0.025 });
    m.bass(I, t, S * 15, 38 + norm(ch[0]), 0.42, { type: 'synth' });
    if (b === 1) m.mel(I, 'lead', [[0, 4], [7, 4], [12, 8]], t, S, 62, { vel: 0.34 });
    if (b === 2) { m.roll(I, 'taiko', t, S * 16, 0, 0.12, 0.6, S); m.riser(I, t, S * 16, 0.18); }
  }
};

// Act II, sector 5 — "Skyforge" (F Lydian, 150 bpm). Above the typhoon the score lifts into a
// bright mode: spiccato string ostinatos, a glassy synth arpeggio and a soaring lead, over light
// kit drums instead of sector 4's taiko. The B section quotes "Long Meridian" with its fourth
// raised, and lets a borrowed Ab chord cast the first shadow of HALCYON.
const SKY_A = [[0, 'maj'], [2, 'maj'], [4, 'min'], [2, 'maj'], [0, 'maj7'], [2, 'maj'], [11, 'min'], [2, 'sus4']];
const SKY_B = [[9, 'min'], [7, 'maj'], [0, 'maj'], [2, 'maj'], [9, 'min'], [7, 'maj'], [3, 'maj'], [7, 'sus4']];
const SKY_LEAD = [
  [[7, 4], [12, 4], [14, 6], [16, 2]],
  [[18, 8], [14, 4], [11, 4]],
  [[16, 6], [12, 2], [19, 8]],
  [[18, 4], [19, 2], [18, 2], [14, 8]],
  [[19, 4], [24, 4], [23, 6], [21, 2]],
  [[23, 8], [18, 4], [19, 4]],
  [[16, 6], [14, 2], [11, 8]],
  [[14, 4], [19, 4], [18, 8]]
];
const LYDIAN = { 5: 1 };
const SKY_THEME = THEME.map(bar => modal(bar, LYDIAN));
// String ostinato (offsets from the chord root) and its 3+3+2 accent.
const SKY_OST = [0, 7, 12, 7, 0, 7, 14, 7, 0, 7, 12, 7, 0, 7, 14, 12];
const SKY_ACC = 'x..x..x.x..x..x.';
function skyStrings(m, I, t, S, root, vel, pattern = SKY_OST) {
  for (let k = 0; k < 16; k++) m.spicc(I, 'strings', t + k * S, root + pattern[k], vel * (SKY_ACC[k] === 'x' ? 1 : 0.62));
}
// The glassy arpeggio rides chord tones plus the ninth, so the Lydian colour shimmers on top.
function skyArp(m, I, t, S, key, chord, center, vel, step = 1) {
  const v = m.voicing(key, chord, center, 3), pool = [v[0], v[1], v[2], v[0] + 14, v[0] + 12, v[1] + 12];
  const seq = [0, 1, 2, 4, 3, 4, 2, 1, 0, 2, 4, 5, 3, 5, 4, 2];
  for (let k = 0; k < 16; k += step) {
    m.pluck(I, 'arp', t + k * S, pool[seq[k] % pool.length], vel * (k % 4 === 0 ? 1 : 0.76), { wave: 'square', decay: 0.13, bright: 0.7 });
  }
}
CUES.sector5 = {
  bpm: 150, key: 65, intro: 2, loop: true, level: 1,
  bar(m, I, b, t, S, s) {
    const K = 65, B = 41, inten = clamp(s.intensity ?? 0.5, 0, 1);
    if (b === 0) {
      // Breaking through the cloud deck: a tremolo F pedal, rising harmonics and a long swell.
      m.pad(I, 'strings', t, S * 16, [53, 60, 65, 72], 0.15, { attack: S * 6, rel: 0.4, trem: 1 / S, cutoff: 2400 });
      [79, 84, 86, 91].forEach((n, k) => m.bell(I, 'keys', t + S * (4 + k * 3), n, 0.045, 2));
      m.riser(I, t, S * 16, 0.13);
      m.bass(I, t, S * 15, B, 0.3, { type: 'synth' });
      return;
    }
    if (b === 1) {
      m.chord(I, 'strings', t, S * 16, K, [2, 'maj'], 67, 0.12, { attack: 0.3, cutoff: 2800 });
      skyStrings(m, I, t, S, 53 + 2, 0.16);
      skyArp(m, I, t + S * 8, S, K, [2, 'maj'], 79, 0.04, 1);
      m.drums(I, 'm', '............xxxx', t, S, 0.5, { tom: 50 });
      m.drums(I, 'k', 'x.......x.......', t, S, 0.5);
      m.revCymbal(I, t + S * 4, S * 12, 0.26);
      return;
    }
    const L = (b - 2) % 16, A = L < 8, i = L % 8, ch = A ? SKY_A[i] : SKY_B[i], r = norm(ch[0]);
    if (i === 0) { m.crash(I, t, 0.34); m.taiko(I, t, 0.42, true); }
    skyStrings(m, I, t, S, 53 + r, 0.15 + 0.05 * inten);
    m.chord(I, 'strings', t, S * 16, K, ch, 69, 0.085, { attack: 0.35, rel: 0.6, cutoff: 2600 });
    m.bassPat(I, inten > 0.5 ? 'R---R-O-R---R-F-' : 'R-------R-----F-', t, S, B, ch, 0.34, { type: inten > 0.5 ? 'pulse' : 'synth' });
    if (A) {
      m.mel(I, 'lead', SKY_LEAD[i], t, S, K, { vel: 0.34, bright: 0.85 });
      if (inten > 0.7) m.mel(I, 'brass', SKY_LEAD[i], t, S, K - 12, { vel: 0.14, bright: 0.45, vib: 0 });
    } else {
      // "Long Meridian" in Lydian: the theme seen from above the storm.
      m.mel(I, 'lead', SKY_THEME[i], t, S, K + 12, { vel: 0.3, bright: 0.7, attack: 0.06, vib: 10 });
      m.mel(I, 'strings', SKY_THEME[i], t, S, K, { vel: 0.16, bright: 0.5, attack: 0.08, vib: 6 });
    }
    if (!A || inten > 0.3) skyArp(m, I, t, S, K, ch, 81, A ? 0.034 : 0.042, 1);
    // Light kit: kick and rim carry the pulse; density adds hats, shaker and toms, never taiko.
    m.drums(I, 'k', 'x.......x.x.....', t, S, 0.56);
    m.drums(I, inten > 0.55 ? 's' : 'r', i === 7 ? '....x.......x.xx' : '....x.......x...', t, S, inten > 0.55 ? 0.4 : 0.34);
    m.drums(I, 'h', inten > 0.4 ? '-.x--.x--.x--.x-' : '..x...x...x...x.', t, S, 0.15);
    if (inten > 0.55) m.drums(I, 'z', 'x-x-x-x-x-x-x-x-', t, S, 0.13);
    if (inten > 0.7) m.drums(I, 'm', '..x.....x..x....', t, S, 0.36, { tom: 52 });
    if (i === 7) m.drums(I, 'm', '............xxxx', t, S, 0.46, { tom: A ? 50 : 47 });
    if (!A && i === 6) m.chord(I, 'brass', t, S * 14, K, ch, 60, 0.18, { timbre: 'brass', attack: 0.2, bright: 0.45 });
    if (!A && i === 7) m.riser(I, t + S * 4, S * 12, 0.12);
  }
};

// HALCYON (F, 156 bpm). The flagship takes the Skyforge melody and darkens it one mode per
// phase: Dorian for the bays, Aeolian for the lattice, Phrygian for the eclipse.
const HAL_MODES = [null, { 4: -1, 6: -1, 11: -1 }, { 4: -1, 6: -1, 9: -1, 11: -1 }, { 2: -1, 4: -1, 6: -1, 9: -1, 11: -1 }];
const HAL_LEAD = HAL_MODES.map(shift => shift && SKY_LEAD.map(bar => modal(bar, shift)));
const HAL_CH = [null,
  [[0, 'min'], [5, 'maj'], [3, 'maj'], [5, 'maj'], [0, 'min'], [5, 'maj'], [10, 'maj'], [7, 'sus4']],
  [[0, 'min'], [10, 'maj'], [3, 'maj'], [10, 'maj'], [8, 'maj'], [10, 'maj'], [7, 'min'], [7, 'dom7']],
  [[0, 'min'], [10, 'min'], [0, 'min'], [1, 'maj'], [8, 'maj'], [10, 'min'], [3, 'dom7'], [7, 'maj']]
];
const HAL_OST = [null, SKY_OST.map(n => n === 14 ? 15 : n), [0, 7, 12, 7, 0, 8, 12, 8, 0, 7, 12, 7, 0, 8, 13, 12], [0, 1, 7, 1, 0, 1, 8, 7, 0, 1, 7, 1, 12, 13, 8, 7]];
CUES.boss5 = {
  bpm: 156, key: 65, intro: 0, loop: true, level: 0.92,
  bar(m, I, b, t, S, s) {
    const K = 65, B = 41, ph = clamp(s.bossPhase || 1, 1, 3), low = (s.bossHp ?? 1) < 0.22, drill = I.variant === 'drill';
    const i = b % 8;
    // A phase change restarts the 8-bar phrase so the new mode lands on its own downbeat.
    if (I.phase !== ph) { I.phase = ph; I.phaseBar = b; }
    const j = (b - I.phaseBar) % 8, chj = HAL_CH[ph][j], rj = norm(chj[0]);
    if (b === 0) impact(m, I, t, K, chj, 60, 0.5);
    else if (j === 0) { m.crash(I, t, 0.36); if (ph >= 3) m.boom(I, t, 0.5); }
    skyStrings(m, I, t, S, 53 + rj, ph === 1 ? 0.18 : 0.21, HAL_OST[ph]);
    m.bassPat(I, ph === 1 ? 'R-R-R-R-R-R-R-O-' : 'RRR-RRO-RRR-RRF-', t, S, B, chj, 0.34, { type: ph === 1 ? 'pulse' : 'growl', accent: SKY_ACC });
    m.chord(I, ph >= 2 && !drill ? 'choir' : 'strings', t, S * 16, K, chj, 65, ph === 3 ? 0.17 : 0.11,
      { timbre: ph >= 2 && !drill ? 'choir' : 'strings', attack: 0.25, cutoff: 2600 });
    m.mel(I, 'lead', HAL_LEAD[ph][j], t, S, K, { vel: 0.35, bright: 0.95, timbre: drill ? 'sim' : undefined });
    if (ph === 2) m.mel(I, 'brass', HAL_LEAD[ph][j], t, S, K - 12, { vel: 0.16, bright: 0.5, vib: 0 });
    // Light kit, pushed harder than the sector: four-on-the-floor kick, snare backbeat.
    m.drums(I, 'k', ph === 1 ? 'x...x...x...x...' : 'x...x...x..xx...', t, S, 0.58);
    m.drums(I, 's', j === 7 ? '....x.......xxxx' : '....x.......x...', t, S, 0.48);
    m.drums(I, 'h', ph >= 2 ? '-x-x-x-x-x-x-x-x' : '..x...x...x...x.', t, S, 0.17);
    if (ph === 1 || ph === 3) skyArp(m, I, t, S, K, chj, 81, 0.036, ph === 3 ? 2 : 1);
    if (ph === 2) {
      // The lattice: a gated square pulse ticks like a laser grid sweeping into place.
      for (let k = 0; k < 16; k++) if ('x.xx.x.xx.xx.x.x'[k] === 'x') m.pluck(I, 'arp', t + k * S, K + 12 + rj + (k % 4 === 3 ? 7 : 0), 0.05, { wave: 'square', decay: 0.07, bright: 1 });
      m.drums(I, 'm', '..x.....x..x....', t, S, 0.34, { tom: 50 });
    }
    if (ph === 3) {
      if (!drill) m.mel(I, 'brass', THEME_MINOR[j], t, S, K - 12, { vel: 0.2, bright: 0.5, vib: 0, sub: true });
      m.drums(I, 'm', '..x..x....x..x..', t, S, 0.4, { tom: 45 });
    }
    if (low && i % 2 === 1) m.roll(I, 'snare', t + S * 12, S * 4, 0, 0.12, 0.42, S / 2);
    if (low && i % 4 === 3) m.riser(I, t, S * 16, 0.1);
    if (drill && i % 2 === 0) m.bell(I, 'keys', t, K + 24, 0.05, 0.7);
  }
};

for (const [id, def] of Object.entries(CUES)) { def.id = id; def.minor = /^(sector2|sector3|sector4|actTwo|boss|warning|gameover|drillFail)/.test(id); }

function impulse(ctx, seconds = 2.3, decay = 3.2) {
  const sr = ctx.sampleRate, len = Math.max(1, Math.floor(sr * seconds)), buf = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(sr * 0.014);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let seed = c ? 7919 : 104729, lp = 0;
    for (let i = pre; i < len; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const n = seed / 4294967296 * 2 - 1, k = (i - pre) / (len - pre);
      lp += (n - lp) * (0.86 - 0.7 * k); // darker as the tail decays
      d[i] = lp * Math.pow(1 - k, decay);
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------------------------

export class MusicDirector {
  constructor(ctx, out) {
    this.ctx = ctx; this.out = out; this.alive = true;
    this._seed = 20261942;
    this.stats = { voices: 0, maxLive: 0, live: 0, errors: 0, cues: [] };
    this.cur = null; this.pending = null; this.targetKey = ''; this.screen = null;
    this.retired = []; this.memory = Object.create(null); this.lastPlay = null; this._lastLife = -9;
    const c = ctx;
    // Sub-buses: cues -> cueBus (dips for stingers) -> mix -> DC/rumble filter -> glue -> trim -> out.
    this.mix = c.createGain(); this.mix.gain.value = 1;
    this.cueBus = c.createGain(); this.cueBus.gain.value = 1; this.cueBus.connect(this.mix);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 24; hp.Q.value = 0.7;
    this.glue = c.createDynamicsCompressor();
    this.glue.threshold.value = -16; this.glue.knee.value = 10; this.glue.ratio.value = 3.2;
    this.glue.attack.value = 0.008; this.glue.release.value = 0.22;
    this.trim = c.createGain(); this.trim.gain.value = 0.55;
    this.mix.connect(hp); hp.connect(this.glue); this.glue.connect(this.trim); this.trim.connect(out);
    this._fixed = [this.mix, this.cueBus, hp, this.glue, this.trim];
    // Shared hall reverb and a tempo-synced echo.
    this.verbIn = c.createGain();
    const vhp = c.createBiquadFilter(); vhp.type = 'highpass'; vhp.frequency.value = 240;
    this.verb = c.createConvolver(); this.verb.buffer = impulse(c);
    const vout = c.createGain(); vout.gain.value = 0.5;
    this.verbIn.connect(vhp); vhp.connect(this.verb); this.verb.connect(vout); vout.connect(this.mix);
    this.echoIn = c.createGain();
    this.delay = c.createDelay(2); this.delay.delayTime.value = 0.33;
    const elp = c.createBiquadFilter(); elp.type = 'lowpass'; elp.frequency.value = 2800;
    const efb = c.createGain(); efb.gain.value = 0.34;
    const eout = c.createGain(); eout.gain.value = 0.5;
    this.echoIn.connect(this.delay); this.delay.connect(elp); elp.connect(efb); efb.connect(this.delay); elp.connect(eout); eout.connect(this.mix);
    this._fixed.push(this.verbIn, vhp, this.verb, vout, this.echoIn, this.delay, elp, efb, eout);
    // Reused material.
    const sr = c.sampleRate, nlen = Math.floor(sr * 2), nb = c.createBuffer(1, nlen, sr), nd = nb.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = this._r() * 2 - 1;
    this.noiseBuf = nb;
    const wave = h => { const re = new Float32Array(h.length + 1), im = new Float32Array(h.length + 1); h.forEach((a, i) => { im[i + 1] = a; }); return c.createPeriodicWave(re, im); };
    this.waves = { choir: wave([1, 0.55, 0.32, 0.12, 0.2, 0.07, 0.05, 0.03, 0.02]) };
    // Stingers play on their own instance, outside cue crossfades and dips.
    this.sting = this._newInstance({ id: 'sting', bpm: 120, key: 62, level: 1 }, 'sting', c.currentTime, { direct: true });
  }

  get cueId() { return this.cur?.def.id || ''; }

  update(state, now) {
    if (!this.alive || !state) return;
    now = Number.isFinite(now) ? now : this.ctx.currentTime;
    this.state = state;
    this._prune(now);
    const events = Array.isArray(state.events) ? state.events : [];
    for (const e of events) this._event(e, state, now);
    const want = this._pick(state);
    const key = want ? want.key : '';
    if (key !== this.targetKey) this._plan(want, state, now);
    const cur = this.cur;
    if (cur && !cur.done && cur.nextBar < now - 0.02) cur.nextBar = now + 0.06; // stalled: resync, never burst
    if (this.pending && this.pending.at < now + LOOKAHEAD) this._switch(now);
    let guard = 0;
    while (this.cur && !this.cur.done && this.cur.nextBar < now + LOOKAHEAD && guard++ < 3) {
      if (this.pending && this.pending.at <= this.cur.nextBar + 1e-3) { this._switch(now); continue; }
      this._scheduleBar(this.cur, state);
    }
    this.screen = state.screen;
  }

  stop() {
    if (!this.alive) return;
    this.alive = false;
    const now = this.ctx.currentTime;
    try { this.trim.gain.cancelScheduledValues(now); this.trim.gain.setValueAtTime(this.trim.gain.value, now); this.trim.gain.linearRampToValueAtTime(0, now + 0.25); } catch (_) {}
    for (const inst of [this.cur, this.sting, ...this.retired.map(r => r.inst)]) if (inst) this._cut(inst, now + 0.3, true);
    const release = () => {
      for (const inst of [this.cur, this.sting, ...this.retired.map(r => r.inst)]) if (inst) this._disconnect(inst);
      for (const n of this._fixed) { try { n.disconnect(); } catch (_) {} }
    };
    this.cur = null; this.pending = null;
    if (typeof setTimeout === 'function') setTimeout(release, 450); else release();
  }

  // --- cue selection --------------------------------------------------------------------------

  _pick(s) {
    const drill = (Number(s.practice) || 0) > 0;
    const screen = s.screen || 'play';
    if (screen === 'title') return { id: 'title', key: 'title' };
    if (screen === 'hangar') return { id: 'hangar', key: 'hangar' };
    if (screen === 'end' || s.mode === 'victory' || s.mode === 'gameover') {
      const won = s.outcome ? s.outcome === 'victory' : s.mode === 'victory';
      const id = drill ? (won ? 'drillClear' : 'drillFail') : (won ? 'victory' : 'gameover');
      return { id, key: id, grade: s.grade };
    }
    if (screen === 'pause' || s.paused || s.mode === 'paused') return { id: 'pause', key: 'pause' };
    if (screen !== 'play') return null;
    if (s.actTwo || (s.stage === 3 && (Number(s.time) || 0) < (this.actTwoUntil ?? -1))) return { id: 'actTwo', key: 'actTwo' };
    if (Number(s.interlude) >= 0) {
      const climb = !drill && Number(s.stage) === 4 && CAMPAIGN_STAGES >= 5;
      return climb ? { id: 'interlude', key: 'interludeClimb', variant: 'climb' } : { id: 'interlude', key: 'interlude' };
    }
    // A sector without its own score yet borrows the latest one written (never a missing cue).
    let stage = clamp(Math.floor(Number(s.stage) || 1), 1, CAMPAIGN_STAGES);
    while (stage > 1 && !CUES['sector' + stage]) stage--;
    if (s.boss) { const variant = drill ? 'drill' : ''; return { id: 'boss' + stage, key: 'boss' + stage + variant, variant }; }
    if (Number(s.bossWarning) >= 0) return { id: 'warning' + stage, key: 'warning' + stage };
    return { id: 'sector' + stage, key: 'sector' + stage };
  }

  _nextBeat(inst, now) {
    if (!inst || inst.done) return now + 0.05;
    const barStart = inst.nextBar - inst.barDur, beat = inst.step * 4;
    const k = Math.ceil((now + 0.05 - barStart) / beat);
    return Math.max(now + 0.03, barStart + k * beat);
  }

  _plan(want, s, now) {
    this.targetKey = want ? want.key : '';
    const from = this.cur && !this.cur.done ? this.cur : null;
    if (want && this.cur && this.cur.key === want.key && !this.cur.done) { this.pending = null; return; }
    if (!want) { this.pending = { want: null, at: now + 0.05, fade: 0.6 }; return; }
    const id = want.id, fromId = from ? from.def.id : '';
    const screenChanged = this.screen != null && s.screen !== this.screen;
    const p = { want, at: now + 0.06, outAt: null, fade: 0.6, fadeIn: 0.03, startBar: 0 };
    if (!from) p.at = now + 0.06;
    else if (id === 'pause' || fromId === 'pause') { p.at = now + 0.04; p.fade = 0.35; p.fadeIn = id === 'pause' ? 0.9 : 0.35; }
    else if (id.startsWith('boss')) { p.at = now + (fromId.startsWith('warning') ? 0.14 : 0.08); p.fade = fromId.startsWith('warning') ? 0.05 : 0.25; }
    else if (id === 'actTwo') { p.at = now + 0.04; p.fade = 0.15; }
    else if (id === 'interlude') { p.at = now + 0.5; p.outAt = now + 0.03; p.fade = 0.22; }
    else if (id === 'gameover' || id === 'drillFail') { p.at = now + 0.9; p.outAt = now + 0.03; p.fade = 0.35; }
    else if (fromId === 'interlude' || id === 'victory' || id === 'drillClear' || id.startsWith('warning') || screenChanged) {
      p.at = this._nextBeat(from, now); p.fade = fromId === 'interlude' ? 0.9 : id.startsWith('warning') ? 0.3 : 0.6;
    } else p.at = from.nextBar > now + 0.02 ? from.nextBar : from.nextBar + from.barDur;
    if (id.startsWith('warning')) p.warnStart = now - Math.max(0, Number(s.bossWarning) || 0) * BOSS_WARNING_LEAD;
    if (id === 'pause') {
      const src = from || this.lastPlay;
      p.keyRoot = src?.def.key ?? 62; p.minor = !!src?.def.minor;
    }
    // Returning from pause picks the score up where it left off (same run, same game time).
    const mem = this.memory[want.key];
    if (fromId === 'pause' && mem && Math.abs((Number(s.time) || 0) - mem.time) < 0.3) { p.startBar = mem.bar; p.fadeIn = 0.4; }
    this.pending = p;
  }

  _switch(now) {
    const p = this.pending; this.pending = null;
    if (!p) return;
    const at = Math.max(p.at, now + 0.01);
    const outAt = Math.max(Math.min(p.outAt ?? at, at), now + 0.005);
    if (this.cur) {
      const id = this.cur.def.id;
      if (/^(sector|boss|actTwo)/.test(id)) { this.memory[this.cur.key] = { bar: this.cur.bar, time: Number(this.state?.time) || 0 }; this.lastPlay = this.cur; }
      this._retire(this.cur, outAt, p.fade);
    }
    this.cur = p.want ? this._newInstance(CUES[p.want.id], p.want.key, at, p) : null;
    if (this.cur) {
      if (this.stats.cues.length < 64) this.stats.cues.push([+at.toFixed(3), p.want.key]);
      const beat = 60 / this.cur.def.bpm;
      this.delay.delayTime.setTargetAtTime(Math.min(1.5, beat * 0.75), at, 0.15);
    }
  }

  _scheduleBar(inst, s) {
    const def = inst.def, b = inst.bar, t = inst.nextBar;
    if (!def.loop && b >= def.length) { inst.done = true; return; }
    try { def.bar(this, inst, b, t, inst.step, s); }
    catch (e) { this.stats.errors++; if (!this.stats.lastError) this.stats.lastError = String(e?.stack || e); }
    inst.bar++; inst.nextBar = t + inst.barDur;
  }

  // --- instances --------------------------------------------------------------------------------

  _newInstance(def, key, at, o = {}) {
    const c = this.ctx, step = 60 / def.bpm / 4;
    const I = {
      def, key, start: at, step, barDur: step * 16, bar: 0, nextBar: at, voices: [], chs: Object.create(null), done: false,
      level: def.level ?? 1, variant: o.want?.variant || '', grade: o.want?.grade, warnStart: o.warnStart,
      keyRoot: o.keyRoot, minor: o.minor,
      dry: c.createGain(), wet: c.createGain(), echo: c.createGain()
    };
    if (o.startBar > 0) { I.bar = Math.max(def.intro || 0, o.startBar); }
    I.dry.connect(o.direct ? this.mix : this.cueBus); I.wet.connect(this.verbIn); I.echo.connect(this.echoIn);
    const fadeIn = o.fadeIn ?? 0.03;
    for (const g of [I.dry, I.wet, I.echo]) {
      if (o.direct) { g.gain.value = 1; continue; }
      g.gain.value = 0;
      g.gain.setValueAtTime(0, Math.max(c.currentTime, at - 0.001));
      g.gain.linearRampToValueAtTime(I.level, at + fadeIn);
    }
    return I;
  }

  _ch(I, name) {
    let ch = I.chs[name];
    if (ch) return ch;
    const cfg = CHANNELS[name] || CHANNELS.fx, c = this.ctx;
    ch = c.createGain(); ch.gain.value = cfg.level; ch.connect(I.dry);
    const extra = [];
    if (cfg.verb) { const g = c.createGain(); g.gain.value = cfg.verb; ch.connect(g); g.connect(I.wet); extra.push(g); }
    if (cfg.echo) { const g = c.createGain(); g.gain.value = cfg.echo; ch.connect(g); g.connect(I.echo); extra.push(g); }
    ch._extra = extra;
    I.chs[name] = ch;
    return ch;
  }

  _track(I, srcs, nodes, at, end) {
    const first = srcs[0];
    if (first) first.onended = () => { for (const n of nodes) { try { n.disconnect(); } catch (_) {} } };
    I.voices.push({ srcs, at, end });
    this.stats.voices++;
  }

  _cut(I, T, all = false) {
    for (const v of I.voices) {
      if (!all && v.at < T - 1e-4) continue;
      for (const s of v.srcs) { try { s.stop(Math.max(T, v.at)); } catch (_) {} }
    }
  }

  _retire(I, T, fade) {
    this._cut(I, T);
    for (const g of [I.dry, I.wet, I.echo]) {
      const p = g.gain;
      try {
        if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(T);
        else { p.cancelScheduledValues(T); p.setValueAtTime(I.level, T); }
        p.linearRampToValueAtTime(0, T + Math.max(0.02, fade));
      } catch (_) {}
    }
    this.retired.push({ inst: I, until: T + fade + 3.5 });
  }

  _disconnect(I) {
    for (const ch of Object.values(I.chs)) { try { ch.disconnect(); } catch (_) {} for (const g of ch._extra || []) { try { g.disconnect(); } catch (_) {} } }
    for (const g of [I.dry, I.wet, I.echo]) { try { g.disconnect(); } catch (_) {} }
  }

  _prune(now) {
    if (this.retired.length) {
      this.retired = this.retired.filter(r => { if (now < r.until) return true; this._disconnect(r.inst); return false; });
    }
    let live = 0;
    for (const I of [this.cur, this.sting, ...this.retired.map(r => r.inst)]) {
      if (!I) continue;
      if (I.voices.length > 40) I.voices = I.voices.filter(v => v.end > now);
      for (const v of I.voices) if (v.end > now && v.at <= now + LOOKAHEAD) live++;
    }
    this.stats.live = live;
    this.stats.maxLive = Math.max(this.stats.maxLive, live);
  }

  // --- stingers ---------------------------------------------------------------------------------

  _event(e, s, now) {
    switch (e?.type) {
      case 'actTwo': this.actTwoUntil = (Number(s.time) || 0) + 6.5; break;
      case 'stage': this.actTwoUntil = -1; break;
      case 'bossDown': if (!s.events?.some(e => e.type === 'actTwo')) this._stingBossDown(now + 0.02); break;
      case 'lifeLost':
        if (s.mode === 'playing' && now - this._lastLife > 1) { this._lastLife = now; this._stingLife(now + 0.02); }
        break;
      case 'bossPhase':
        if (this.cur && this.cur.def.id.startsWith('boss')) this._phaseFill(this.cur, this._nextBeat(this.cur, now));
        break;
      case 'extend': this._stingExtend(now + 0.03); break;
    }
  }

  _stingBossDown(at) {
    const I = this.sting;
    this.boom(I, at, 0.9); this.crash(I, at, 0.6); this.taiko(I, at, 1, true);
    this.chord(I, 'brass', at, 0.9, 62, [0, 'maj'], 62, 0.42, { timbre: 'brass', attack: 0.012, rel: 0.6 });
    this.roll(I, 'timp', at + 0.05, 0.5, 50, 0.4, 0.05, 0.045);
  }

  _stingLife(at) {
    const I = this.sting, K = (this.cur?.def.key ?? 62) + 12;
    this.brass(I, 'brass', at, 0.35, K, 0.24, { attack: 0.01, rel: 0.55, fall: 7, vib: 0, scoop: false });
    this.brass(I, 'brass', at, 0.35, K + 1, 0.2, { attack: 0.01, rel: 0.55, fall: 7, vib: 0, scoop: false });
    this.boom(I, at, 0.5);
    const p = this.cueBus.gain;
    try {
      p.cancelScheduledValues(at); p.setValueAtTime(p.value, at);
      p.linearRampToValueAtTime(0.42, at + 0.06); p.setValueAtTime(0.42, at + 1.1); p.linearRampToValueAtTime(1, at + 1.9);
    } catch (_) {}
  }

  _phaseFill(I, at) {
    const beat = I.step * 4;
    if (I.def.id === 'boss5') {
      // HALCYON shifts mode: a string run tears upward into a tom triplet and a low hit.
      for (let k = 0; k < 8; k++) this.spicc(I, 'strings', at - beat + k * beat / 8, I.def.key - 12 + [0, 2, 3, 5, 7, 8, 10, 12][k], 0.14 + k * 0.025);
      this.crash(I, at, 0.42); this.boom(I, at, 0.55);
      [0, 1, 2].forEach(k => this.tom(I, at + k * beat / 3, 0.7 - k * 0.1, 50 - k * 4));
      this.chord(I, 'brass', at, 0.4, I.def.key, [0, 'five'], I.def.key - 5, 0.32, { timbre: 'brass', attack: 0.01 });
      return;
    }
    this.crash(I, at, 0.42);
    this.taiko(I, at, 0.85, true); this.taiko(I, at + beat / 3, 0.6, false); this.taiko(I, at + beat * 2 / 3, 0.7, false);
    this.chord(I, 'brass', at, 0.32, I.def.key, [0, 'five'], I.def.key, 0.34, { timbre: 'brass', attack: 0.01 });
  }

  _stingExtend(at) {
    const I = this.sting, K = (this.cur?.def.key ?? 62) + 12, third = this.cur?.def.minor ? 3 : 4;
    [0, third, 7, 12].forEach((n, k) => this.bell(I, 'keys', at + k * 0.085, K + n, 0.06, 1.2));
  }

  // --- arrangement helpers ----------------------------------------------------------------------

  _r() { this._seed = (Math.imul(this._seed, 1664525) + 1013904223) >>> 0; return this._seed / 4294967296; }

  voicing(key, chord, center = 62, n = 4) {
    const q = QUAL[chord[1]] || QUAL.maj;
    const notes = q.map(x => { const p = key + chord[0] + x; return p - 12 * Math.round((p - center) / 12); });
    notes.sort((a, b) => a - b);
    const out = [...new Set(notes)];
    while (out.length < n) out.push(out[out.length - (q.length > 2 ? 3 : 2)] + 12);
    return out.slice(0, Math.max(n, 2));
  }

  mel(I, ch, notes, t, S, base, o = {}) {
    let pos = 0;
    for (const [off, len] of notes) {
      if (off != null) {
        const at = t + pos * S, dur = len * S * (o.leg ?? 0.94), v = (o.vel ?? 0.4) * (pos % 4 === 0 ? 1 : 0.86);
        if (o.voice === 'pluck') this.pluck(I, ch, at, base + off, v, o);
        else if (o.voice === 'bell') this.bell(I, ch, at, base + off, v, o.decay ?? 1.6);
        else this.brass(I, ch, at, dur, base + off, v, o);
      }
      pos += len;
    }
  }

  chord(I, ch, t, dur, key, chord, center, vel, o = {}) {
    this.pad(I, ch, t, dur, this.voicing(key, chord, center, chord[1] === 'five' ? 3 : 4), vel, o);
  }

  bassPat(I, pat, t, S, root, chord, vel, o = {}) {
    const r = root + norm(chord[0]), q = QUAL[chord[1]] || QUAL.maj;
    for (let k = 0; k < pat.length; k++) {
      const c = pat[k];
      if (c === '.' || c === '-') continue;
      let len = 1;
      while (k + len < pat.length && pat[k + len] === '-') len++;
      const off = c === 'O' ? 12 : c === 'F' ? 7 : c === 'f' ? -5 : c === '3' ? q[1] : c === '4' ? 5 : c === 'b' ? -12 : 0;
      const acc = o.accent ? (o.accent[k] === 'x' ? 1 : 0.62) : 1;
      this.bass(I, t + k * S, len * S * (o.leg ?? 0.86), r + off, vel * acc, o);
    }
  }

  drums(I, kind, pat, t, S, vel, o = {}) {
    for (let k = 0; k < pat.length; k++) {
      const v = VEL[pat[k]];
      if (!v) continue;
      const at = t + k * S, x = vel * v;
      switch (kind) {
        case 'k': this.kick(I, at, x); break;
        case 's': this.snare(I, at, x); break;
        case 'r': this.snare(I, at, x, { rim: true }); break;
        case 'h': this.hat(I, at, x, false); break;
        case 'H': this.hat(I, at, x, true); break;
        case 'z': this.shaker(I, at, x); break;
        case 'T': this.taiko(I, at, x, true); break;
        case 't': this.taiko(I, at, x, false); break;
        case 'm': this.tom(I, at, x, o.tom ?? 45); break;
      }
    }
  }

  arp(I, t, S, key, chord, center, seq, vel, every = 1, o = {}) {
    const v = this.voicing(key, chord, center, 3), pool = [...v, v[0] + 12, v[1] + 12];
    seq.forEach((idx, k) => this.pluck(I, 'keys', t + k * every * S, pool[idx % pool.length], vel * (k % 4 === 0 ? 1 : 0.8), o));
  }

  ostinato(I, t, S, root, pattern, vel) {
    pattern.forEach((n, k) => this.pluck(I, 'keys', t + k * 2 * S, root + n, vel * (k % 4 === 0 ? 1 : 0.78), { wave: 'sawtooth', decay: 0.22, bright: 0.5 }));
  }

  roll(I, kind, at, dur, midi, v0, v1, rate) {
    const n = Math.max(1, Math.floor(dur / rate));
    for (let k = 0; k < n; k++) {
      const v = v0 + (v1 - v0) * k / n, tk = at + k * rate;
      if (kind === 'snare') this.snare(I, tk, v, { decay: 0.085 });
      else if (kind === 'timp') this.timp(I, tk, midi, v * 0.75, 0.55);
      else this.taiko(I, tk, v, false);
    }
  }

  // --- instruments ------------------------------------------------------------------------------

  _osc(type, f, at, end) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f, at); o.start(at); o.stop(end);
    return o;
  }

  _noise(at, end) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = true; s.start(at, this._r() * 1.8); s.stop(end);
    return s;
  }

  // Brass / lead: two detuned saws through an articulated low-pass ("blat" on attack), optional
  // delayed vibrato, scoop and fall.
  brass(I, ch, at, dur, midi, vel, o = {}) {
    const c = this.ctx, f = mtof(midi), a = o.attack ?? 0.035, rel = o.rel ?? 0.16, end = at + dur + rel + 0.05;
    const nyq = c.sampleRate * 0.45, br = o.bright ?? 1, sim = o.timbre === 'sim';
    const lp = c.createBiquadFilter(), g = c.createGain();
    lp.type = 'lowpass'; lp.Q.value = o.q ?? (sim ? 2.2 : 1.3);
    const f0 = Math.min(nyq, f * 1.4 + 200), f1 = Math.min(nyq, f * (4 + 8 * br) * (0.6 + 0.6 * vel) + 600), f2 = Math.min(nyq, f * (3 + 4 * br) + 400);
    lp.frequency.setValueAtTime(f0, at);
    lp.frequency.exponentialRampToValueAtTime(sim ? Math.min(nyq, 2400) : f1, at + a + 0.02);
    lp.frequency.exponentialRampToValueAtTime(sim ? Math.min(nyq, 1600) : f2, at + a + 0.3);
    const type = sim ? 'square' : 'sawtooth';
    const o1 = this._osc(type, f, at, end), o2 = this._osc(type, f, at, end);
    const scoop = o.scoop !== false && dur > 0.18;
    o1.detune.setValueAtTime(scoop ? -40 : -6, at); o2.detune.setValueAtTime(scoop ? -27 : 7, at);
    if (scoop) { o1.detune.linearRampToValueAtTime(-6, at + 0.06); o2.detune.linearRampToValueAtTime(7, at + 0.06); }
    o1.connect(lp); o2.connect(lp);
    const srcs = [o1, o2], nodes = [o1, o2, lp, g];
    if (o.sub) { const o3 = this._osc('triangle', f / 2, at, end), sg = c.createGain(); sg.gain.value = 0.4; o3.connect(sg); sg.connect(lp); srcs.push(o3); nodes.push(o3, sg); }
    const vib = o.vib ?? 8;
    if (vib > 0 && dur > 0.5) {
      const l = this._osc('sine', 5.1 + this._r() * 0.5, at, end), lg = c.createGain();
      lg.gain.value = 0; lg.gain.setValueAtTime(0, at); lg.gain.setValueAtTime(0, at + 0.22); lg.gain.linearRampToValueAtTime(vib, at + Math.min(0.62, dur * 0.8));
      l.connect(lg); lg.connect(o1.detune); lg.connect(o2.detune); srcs.push(l); nodes.push(l, lg);
    }
    if (o.fall) for (const x of [o1, o2]) { x.frequency.setValueAtTime(f, at + dur); x.frequency.exponentialRampToValueAtTime(f * Math.pow(2, -o.fall / 12), at + dur + rel); }
    env(g.gain, at, a, vel * 0.5, 0.3, o.sus ?? 0.72, dur, rel);
    lp.connect(g); g.connect(this._ch(I, ch));
    this._track(I, srcs, nodes, at, end);
  }

  // Sustained chords: strings (saws), warm (triangle + saw), choir (formant wave + vibrato) or brass
  // section (articulated filter). Optional tremolo.
  pad(I, ch, at, dur, notes, vel, o = {}) {
    const c = this.ctx, timbre = o.timbre || 'strings', brassy = timbre === 'brass';
    const a = o.attack ?? (brassy ? 0.02 : 0.45), rel = o.rel ?? (brassy ? 0.2 : 0.9), end = at + dur + rel + 0.06;
    const nyq = c.sampleRate * 0.45;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = brassy ? 1.1 : 0.5;
    if (brassy) {
      const f = mtof(notes[0]), br = o.bright ?? 1;
      lp.frequency.setValueAtTime(Math.min(nyq, f * 1.5), at);
      lp.frequency.exponentialRampToValueAtTime(Math.min(nyq, f * (5 + 8 * br) + 500), at + a + 0.03);
      lp.frequency.exponentialRampToValueAtTime(Math.min(nyq, f * (3 + 4 * br) + 350), at + a + 0.35);
    } else {
      const cut = Math.min(nyq, (o.cutoff ?? (timbre === 'choir' ? 2400 : 1500)) * 1.5);
      lp.frequency.setValueAtTime(cut * 0.4, at); lp.frequency.exponentialRampToValueAtTime(cut, at + Math.max(0.06, a));
    }
    const g = c.createGain();
    env(g.gain, at, a, vel / Math.sqrt(notes.length * 2), brassy ? 0.25 : 0.6, brassy ? 0.7 : 0.9, dur, rel);
    const srcs = [], nodes = [lp, g];
    lp.connect(g);
    let tail = g;
    if (o.trem) {
      const tg = c.createGain(), l = this._osc('sine', o.trem, at, end), lg = c.createGain();
      tg.gain.value = 0; tg.gain.setValueAtTime(0.6, at); lg.gain.value = 0.4;
      l.connect(lg); lg.connect(tg.gain); g.connect(tg); tail = tg;
      srcs.push(l); nodes.push(tg, l, lg);
    }
    let vib = null;
    if (timbre === 'choir' || o.vib) {
      const l = this._osc('sine', 4.6 + this._r() * 0.8, at, end), vg = c.createGain();
      vg.gain.value = o.vib ?? 9; l.connect(vg); srcs.push(l); nodes.push(l, vg); vib = vg;
    }
    for (const n of notes) {
      const f = mtof(n);
      for (const d of [-8, 8]) {
        const x = c.createOscillator();
        if (timbre === 'choir') x.setPeriodicWave(this.waves.choir); else x.type = timbre === 'warm' && d < 0 ? 'triangle' : 'sawtooth';
        x.frequency.setValueAtTime(f, at); x.detune.setValueAtTime(d + (this._r() - 0.5) * 5, at);
        if (vib) vib.connect(x.detune);
        x.connect(lp); x.start(at); x.stop(end);
        srcs.push(x); nodes.push(x);
      }
    }
    tail.connect(this._ch(I, ch));
    this._track(I, srcs, nodes, at, end);
  }

  bass(I, at, dur, midi, vel, o = {}) {
    const c = this.ctx, type = o.type || 'pick', f = mtof(midi), rel = type === 'synth' ? 0.2 : 0.07, end = at + dur + rel + 0.04;
    const lp = c.createBiquadFilter(), g = c.createGain();
    lp.type = 'lowpass';
    const main = this._osc(type === 'pulse' ? 'square' : 'sawtooth', f, at, end);
    main.connect(lp);
    const srcs = [main], nodes = [main, lp, g];
    if (type === 'growl') {
      const x = this._osc('sawtooth', f, at, end); x.detune.setValueAtTime(14, at); x.connect(lp); srcs.push(x); nodes.push(x);
      lp.Q.value = 4; lp.frequency.setValueAtTime(2600, at); lp.frequency.exponentialRampToValueAtTime(460, at + 0.16);
    } else if (type === 'pulse') {
      lp.Q.value = 2; lp.frequency.setValueAtTime(1700, at); lp.frequency.exponentialRampToValueAtTime(380, at + 0.11);
    } else if (type === 'synth') {
      lp.Q.value = 1; lp.frequency.setValueAtTime(320, at); lp.frequency.linearRampToValueAtTime(800, at + 0.3);
    } else {
      lp.Q.value = 2.5; lp.frequency.setValueAtTime(Math.min(3200, f * 16), at); lp.frequency.exponentialRampToValueAtTime(f * 3 + 140, at + 0.18);
    }
    lp.connect(g);
    const sub = this._osc('sine', f, at, end), sg = c.createGain();
    sg.gain.value = type === 'growl' ? 0.5 : 0.42; sub.connect(sg); sg.connect(g); srcs.push(sub); nodes.push(sub, sg);
    env(g.gain, at, type === 'synth' ? 0.03 : 0.004, vel * 0.6, 0.25, 0.7, dur, rel);
    g.connect(this._ch(I, 'bass'));
    this._track(I, srcs, nodes, at, end);
  }

  pluck(I, ch, at, midi, vel, o = {}) {
    const c = this.ctx, f = mtof(midi), dec = o.decay ?? 0.28, end = at + dec + 0.05, nyq = c.sampleRate * 0.45;
    const x = this._osc(o.wave || 'square', f, at, end), lp = c.createBiquadFilter(), g = c.createGain();
    lp.type = 'lowpass'; lp.Q.value = 1.4;
    lp.frequency.setValueAtTime(Math.min(nyq, f * (3 + 6 * (o.bright ?? 1)) + 1800), at);
    lp.frequency.exponentialRampToValueAtTime(Math.min(nyq, f * 1.5 + 200), at + dec * 0.8);
    perc(g.gain, at, vel * 0.6, dec, 0.003);
    x.connect(lp); lp.connect(g); g.connect(this._ch(I, ch));
    this._track(I, [x], [x, lp, g], at, end);
  }

  // Spiccato string: two detuned saws, a bowed bite that closes fast, and a short body.
  spicc(I, ch, at, midi, vel, dur = 0.13) {
    const c = this.ctx, f = mtof(midi), end = at + dur + 0.08, nyq = c.sampleRate * 0.45;
    const lp = c.createBiquadFilter(), g = c.createGain();
    lp.type = 'lowpass'; lp.Q.value = 0.9;
    lp.frequency.setValueAtTime(Math.min(nyq, f * 7 + 900), at);
    lp.frequency.exponentialRampToValueAtTime(Math.min(nyq, f * 2.2 + 300), at + dur);
    const a = this._osc('sawtooth', f, at, end), b = this._osc('sawtooth', f, at, end);
    a.detune.setValueAtTime(-9, at); b.detune.setValueAtTime(8, at);
    a.connect(lp); b.connect(lp); lp.connect(g);
    perc(g.gain, at, vel * 0.42, dur, 0.006);
    g.connect(this._ch(I, ch));
    this._track(I, [a, b], [a, b, lp, g], at, end);
  }

  // Electric-piano style chord: sine + soft triangle octave per note, one shared envelope.
  keysChord(I, ch, at, dur, notes, vel) {
    const c = this.ctx, end = at + dur + 0.4, g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 4800;
    env(g.gain, at, 0.006, vel / Math.sqrt(notes.length), 0.8, 0.35, dur, 0.35);
    const srcs = [], nodes = [g, lp];
    for (const n of notes) {
      const f = mtof(n), a = this._osc('sine', f, at, end), b = this._osc('triangle', f * 2, at, end), bg = c.createGain();
      bg.gain.value = 0.3; a.connect(lp); b.connect(bg); bg.connect(lp);
      srcs.push(a, b); nodes.push(a, b, bg);
    }
    lp.connect(g); g.connect(this._ch(I, ch));
    this._track(I, srcs, nodes, at, end);
  }

  bell(I, ch, at, midi, vel, decay = 1.6) {
    const c = this.ctx, f = mtof(midi), out = this._ch(I, ch), srcs = [], nodes = [];
    for (const [mul, amp, d] of [[1, 1, 1], [2, 0.38, 0.55], [2.76, 0.22, 0.35], [5.4, 0.08, 0.18]]) {
      if (f * mul > c.sampleRate * 0.45) continue;
      const x = this._osc('sine', f * mul, at, at + decay * d + 0.05), g = c.createGain();
      perc(g.gain, at, vel * amp, decay * d, 0.002);
      x.connect(g); g.connect(out); srcs.push(x); nodes.push(x, g);
    }
    this._track(I, srcs, nodes, at, at + decay + 0.05);
  }

  kick(I, at, vel) {
    const c = this.ctx, end = at + 0.42, x = this._osc('sine', 155, at, end), g = c.createGain();
    x.frequency.exponentialRampToValueAtTime(52, at + 0.07); x.frequency.exponentialRampToValueAtTime(42, at + 0.3);
    perc(g.gain, at, vel * 0.85, 0.26, 0.002);
    const n = this._noise(at, at + 0.03), hp = c.createBiquadFilter(), ng = c.createGain();
    hp.type = 'highpass'; hp.frequency.value = 2200; perc(ng.gain, at, vel * 0.3, 0.016, 0.001);
    const out = this._ch(I, 'drums');
    x.connect(g); g.connect(out); n.connect(hp); hp.connect(ng); ng.connect(out);
    this._track(I, [x, n], [x, g, n, hp, ng], at, end);
  }

  snare(I, at, vel, o = {}) {
    const c = this.ctx, dec = o.decay ?? (o.rim ? 0.035 : 0.15), end = at + Math.max(dec, 0.09) + 0.03;
    const n = this._noise(at, end), hp = c.createBiquadFilter(), ng = c.createGain();
    hp.type = 'highpass'; hp.frequency.value = o.rim ? 2600 : 1500; hp.Q.value = 0.7;
    perc(ng.gain, at, vel * (o.rim ? 0.5 : 0.78), dec, 0.001);
    const b = this._osc('triangle', o.rim ? 440 : 210, at, end), bg = c.createGain();
    b.frequency.exponentialRampToValueAtTime(o.rim ? 380 : 155, at + 0.05);
    perc(bg.gain, at, vel * 0.38, o.rim ? 0.025 : 0.08, 0.001);
    const out = this._ch(I, 'drums');
    n.connect(hp); hp.connect(ng); ng.connect(out); b.connect(bg); bg.connect(out);
    this._track(I, [n, b], [n, hp, ng, b, bg], at, end);
  }

  hat(I, at, vel, open = false) {
    const c = this.ctx, dec = open ? 0.24 : 0.035, end = at + dec + 0.03;
    const n = this._noise(at, end), hp = c.createBiquadFilter(), g = c.createGain();
    hp.type = 'highpass'; hp.frequency.value = 6800; hp.Q.value = 0.7;
    perc(g.gain, at, vel * 0.5, dec, 0.001);
    n.connect(hp); hp.connect(g); g.connect(this._ch(I, 'perc'));
    this._track(I, [n], [n, hp, g], at, end);
  }

  shaker(I, at, vel) {
    const c = this.ctx, end = at + 0.1, n = this._noise(at, end), bp = c.createBiquadFilter(), g = c.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 6000; bp.Q.value = 1.1;
    perc(g.gain, at, vel * 0.5, 0.055, 0.008);
    n.connect(bp); bp.connect(g); g.connect(this._ch(I, 'perc'));
    this._track(I, [n], [n, bp, g], at, end);
  }

  taiko(I, at, vel, big = false) {
    const c = this.ctx, dec = big ? 0.75 : 0.34, end = at + dec + 0.05;
    const x = this._osc('sine', big ? 104 : 160, at, end), g = c.createGain();
    x.frequency.exponentialRampToValueAtTime(big ? 56 : 92, at + 0.12);
    perc(g.gain, at, vel * 0.62, dec, 0.002);
    const y = this._osc('triangle', big ? 210 : 320, at, at + 0.2), yg = c.createGain();
    y.frequency.exponentialRampToValueAtTime(big ? 120 : 190, at + 0.08); perc(yg.gain, at, vel * 0.22, 0.12, 0.001);
    const n = this._noise(at, at + 0.1), lp = c.createBiquadFilter(), ng = c.createGain();
    lp.type = 'bandpass'; lp.frequency.value = big ? 1300 : 1900; lp.Q.value = 0.8; perc(ng.gain, at, vel * 0.6, 0.06, 0.001);
    const out = this._ch(I, 'taiko');
    x.connect(g); g.connect(out); y.connect(yg); yg.connect(out); n.connect(lp); lp.connect(ng); ng.connect(out);
    this._track(I, [x, y, n], [x, g, y, yg, n, lp, ng], at, end);
  }

  tom(I, at, vel, midi) {
    const c = this.ctx, f = mtof(midi), end = at + 0.34, x = this._osc('sine', f * 1.4, at, end), g = c.createGain();
    x.frequency.exponentialRampToValueAtTime(f, at + 0.09);
    perc(g.gain, at, vel * 0.7, 0.28, 0.002);
    x.connect(g); g.connect(this._ch(I, 'drums'));
    this._track(I, [x], [x, g], at, end);
  }

  timp(I, at, midi, vel, decay = 1.1) {
    const c = this.ctx, f = mtof(midi), end = at + decay + 0.05;
    const x = this._osc('sine', f * 1.01, at, end), y = this._osc('sine', f * 1.5, at, end), g = c.createGain(), yg = c.createGain();
    x.frequency.exponentialRampToValueAtTime(f, at + 0.3);
    perc(g.gain, at, vel * 0.7, decay, 0.004); perc(yg.gain, at, vel * 0.16, decay * 0.5, 0.004);
    const n = this._noise(at, at + 0.05), lp = c.createBiquadFilter(), ng = c.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 500; perc(ng.gain, at, vel * 0.2, 0.03, 0.001);
    const out = this._ch(I, 'taiko');
    x.connect(g); g.connect(out); y.connect(yg); yg.connect(out); n.connect(lp); lp.connect(ng); ng.connect(out);
    this._track(I, [x, y, n], [x, y, g, yg, n, lp, ng], at, end);
  }

  crash(I, at, vel, dur = 2.4) {
    const c = this.ctx, end = at + dur + 0.05, n = this._noise(at, end);
    const hp = c.createBiquadFilter(), g = c.createGain(), bp = c.createBiquadFilter(), g2 = c.createGain();
    hp.type = 'highpass'; hp.frequency.value = 3400; perc(g.gain, at, vel * 0.42, dur, 0.003);
    bp.type = 'bandpass'; bp.frequency.value = 8500; bp.Q.value = 0.8; perc(g2.gain, at, vel * 0.22, dur * 0.55, 0.002);
    const out = this._ch(I, 'fx');
    n.connect(hp); hp.connect(g); g.connect(out); n.connect(bp); bp.connect(g2); g2.connect(out);
    this._track(I, [n], [n, hp, g, bp, g2], at, end);
  }

  revCymbal(I, at, dur, vel) {
    const c = this.ctx, end = at + dur + 0.05, n = this._noise(at, end), hp = c.createBiquadFilter(), g = c.createGain();
    hp.type = 'highpass'; hp.frequency.value = 2800;
    g.gain.value = 0; g.gain.setValueAtTime(1e-4, at); g.gain.exponentialRampToValueAtTime(vel * 0.4, at + dur); g.gain.linearRampToValueAtTime(0, at + dur + 0.03);
    n.connect(hp); hp.connect(g); g.connect(this._ch(I, 'fx'));
    this._track(I, [n], [n, hp, g], at, end);
  }

  riser(I, at, dur, vel) {
    const c = this.ctx, end = at + dur + 0.06, nyq = c.sampleRate * 0.45;
    const n = this._noise(at, end), s = this._osc('sawtooth', 110, at, end), bp = c.createBiquadFilter(), sg = c.createGain(), g = c.createGain();
    s.frequency.exponentialRampToValueAtTime(660, at + dur); sg.gain.value = 0.12;
    bp.type = 'bandpass'; bp.Q.value = 5; bp.frequency.setValueAtTime(300, at); bp.frequency.exponentialRampToValueAtTime(Math.min(nyq, 6000), at + dur);
    g.gain.value = 0; g.gain.setValueAtTime(1e-4, at); g.gain.exponentialRampToValueAtTime(vel, at + dur); g.gain.linearRampToValueAtTime(0, at + dur + 0.05);
    n.connect(bp); s.connect(sg); sg.connect(bp); bp.connect(g); g.connect(this._ch(I, 'fx'));
    this._track(I, [n, s], [n, s, bp, sg, g], at, end);
  }

  boom(I, at, vel) {
    const c = this.ctx, end = at + 1.7, x = this._osc('sine', 72, at, end), g = c.createGain();
    x.frequency.exponentialRampToValueAtTime(30, at + 1.0);
    perc(g.gain, at, vel * 0.5, 1.4, 0.004);
    const n = this._noise(at, at + 0.7), lp = c.createBiquadFilter(), ng = c.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 240; perc(ng.gain, at, vel * 0.5, 0.6, 0.003);
    const out = this._ch(I, 'taiko');
    x.connect(g); g.connect(out); n.connect(lp); lp.connect(ng); ng.connect(out);
    this._track(I, [x, n], [x, g, n, lp, ng], at, end);
  }
}

export const MUSIC_CUES = Object.freeze(Object.keys(CUES));
