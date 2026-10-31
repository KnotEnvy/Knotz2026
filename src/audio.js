// Every sound in 2026 is synthesized at runtime. This file owns the AudioContext, the mixer and
// the event routing. Sound designs live in sfx.js, the score in music.js and the ambience beds in
// soundscape.js.
//
// MIXER
//   combatBus ─> combatDuck ─┐                 repeated fire, hits and small kills (ceiling, ducked by big moments)
//   alertBus ────────────────┤                 warnings that must cut through (never ducked)
//   spaceReturn <─ space <─ spaceSend          shared effects reverb (ConvolverNode)
//   fxBus (effects level) <──┘ ─> fxGate (silent while paused) ─┐
//   uiBus (effects level) ──────────────────────────────────────┤  interface cues, never paused
//   musicBus (music level) ────┐                                │
//   ambienceBus (ambience lvl) ┴─> bedDuck ─> bedFilter ─> bedPause ─┤  low-passed and lowered while paused
//                                                                    └─> glue ─> limiter ─> master (mute) ─> out
//
// SHARED STATE — built every update and passed to MusicDirector.update(state, now) and
// Soundscape.update(state, now), where now = ctx.currentTime. A fresh object each call.
//   screen       'title' | 'hangar' | 'play' | 'pause' | 'end'
//   mode         game.mode: 'title' | 'playing' | 'paused' | 'victory' | 'gameover'
//   time         game.time (seconds of flight; use with timeline.lightningAt)
//   stage        1..CAMPAIGN_STAGES
//   stageTime    seconds into the current sector
//   bossWarning  0..1 progress through the pre-flagship warning, -1 when none
//   boss         true while a flagship is alive
//   bossName     timeline FLAGSHIP_NAMES[stage] ('VESPER' … 'LEVIATHAN', 'HALCYON') | null
//   bossPhase    1..3, 0 when no flagship
//   bossHp       0..1 remaining flagship hull (0 when none)
//   interlude    0..1 progress through the sector-clear interlude, -1 when none
//   actTwo       true during the long Crown → Iron Monsoon hand-off (other interludes are the normal length)
//   interludeLength  actual transition length, seconds
//   intensity    0..1 combat density (enemies, hostile bullets, flagship)
//   critical     true when the player's hull is at 1 during play
//   outcome      'victory' | 'gameover' | null (set from the run's end through the end screen)
//   grade        'S'..'D' after a run, else null
//   practice     flagship drill number, 0 for the campaign
//   paused       true on the pause screen or while the game is paused (manual open)
//   muted        true while sound is muted (the master is already silent)
//   events       game events new this tick ([] when the batch was already seen)
import { CAMPAIGN_STAGES } from './game.js';
import { SfxLibrary, PRIORITY_EVENTS, RECOVERY_FOLLOW_ON_EVENTS } from './sfx.js';
import { MusicDirector } from './music.js';
import { Soundscape } from './soundscape.js';
import { bossWarningProgress, interludeProgress, actTwoInterlude, interludeLength, BOSS_WARNING_LEAD, INTERLUDE_LENGTH } from './timeline.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const MASTER_LEVEL = 0.8;
const FX_LEVEL = 0.9;
const UI_LEVEL = 0.8;
const COMBAT_CEILING = 0.78;
const MAX_VOICES = 96;
const MAX_COMBAT_VOICES = 40;
const PRIORITY_LIMIT = 12;
const EVENT_LIMIT = 34;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class AudioEngine {
  constructor() {
    this.musicLevel = 1; this.effectsLevel = 1; this.ambienceLevel = 0.6;
    this.muted = false;
    this.ready = false;
    this.screen = 'title';
    this._unlockPromise = null;
    this._lastGame = null;
    this._lastTick = 0;
    this._pendingUi = null;
    this._hiddenSuspend = false;
    this._warned = new Set();
    this._reset();
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => this._onVisibility());
    }
  }

  // Clears every context-bound field. Called on construction and whenever a context is discarded.
  _reset() {
    this.ctx = null;
    this.master = null; this.limiter = null; this.glue = null;
    this.musicBus = null; this.ambienceBus = null; this.bedDuck = null; this.bedFilter = null; this.bedPause = null;
    this.fxBus = null; this.fxGate = null; this.combatBus = null; this.combatDuck = null; this.alertBus = null; this.uiBus = null;
    this.spaceSend = null; this.space = null; this.spaceReturn = null;
    this.noise = {}; this.noiseDuration = 0; this.waves = {}; this.curves = {};
    this.music = null; this.soundscape = null; this.sfx = null;
    this.lastEventBatch = null;
    this.lastSound = new Map();
    this.activeVoices = 0; this.combatVoices = 0;
    this.ducks = { beds: { floor: 1, until: 0, end: 0 }, combat: { floor: 1, until: 0, end: 0 } };
    this.mix = null;
    this.cues = { warning: false, interlude: false, interludeAt: 0, critical: 0, outcome: null };
    this.longCues = new Set();
    if (this._pump) { clearInterval(this._pump); this._pump = null; }
  }

  unlock() {
    if (this._unlockPromise) return this._unlockPromise;
    const pending = this._unlockOnce();
    const coalesced = pending.finally(() => {
      if (this._unlockPromise === coalesced) this._unlockPromise = null;
    });
    this._unlockPromise = coalesced;
    return coalesced;
  }

  async _unlockOnce() {
    if (this.ready && this.ctx) {
      const ctx = this.ctx;
      try {
        if (ctx.state === 'suspended') await ctx.resume();
        this._hiddenSuspend = false;
      } catch (_) {
        await this._discardAudioContext(ctx);
      }
      return;
    }
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) return;
    let ctx = null;
    try {
      ctx = new AudioContextClass({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this._build(ctx);
      await ctx.resume();
      if (this.ctx !== ctx) return;
      this.ready = true;
      this._startPump();
      this._applyMix(true);
      this._flushPendingUi();
    } catch (_) {
      await this._discardAudioContext(ctx);
    }
  }

  // Creates the mixer graph, shared buffers and the music / ambience directors.
  _build(ctx) {
    const gain = (value, to) => { const node = ctx.createGain(); node.gain.value = value; if (to) node.connect(to); return node; };
    const compressor = (threshold, knee, ratio, attack, release) => {
      const node = ctx.createDynamicsCompressor();
      node.threshold.value = threshold; node.knee.value = knee; node.ratio.value = ratio;
      node.attack.value = attack; node.release.value = release;
      return node;
    };
    this.master = gain(this.muted ? 0 : MASTER_LEVEL, ctx.destination);
    this.limiter = compressor(-2.5, 0, 20, 0.0015, 0.09);
    this.limiter.connect(this.master);
    // A gentle glue stage binds the score, beds and effects without audible pumping.
    this.glue = compressor(-14, 10, 2.4, 0.012, 0.22);
    this.glue.connect(this.limiter);

    this.bedPause = gain(1, this.glue);
    this.bedFilter = ctx.createBiquadFilter();
    this.bedFilter.type = 'lowpass'; this.bedFilter.frequency.value = 20000; this.bedFilter.Q.value = 0.5;
    this.bedFilter.connect(this.bedPause);
    this.bedDuck = gain(1, this.bedFilter);
    this.musicBus = gain(0, this.bedDuck);
    this.ambienceBus = gain(0, this.bedDuck);

    this.fxGate = gain(1, this.glue);
    this.fxBus = gain(0, this.fxGate);
    this.combatDuck = gain(1, this.fxBus);
    this.combatBus = gain(COMBAT_CEILING, this.combatDuck);
    this.alertBus = gain(1, this.fxBus);
    this.uiBus = gain(0, this.glue);

    this.spaceSend = gain(1);
    this.space = ctx.createConvolver();
    this.space.buffer = this._impulse(ctx, 2.3);
    this.spaceReturn = gain(0.32, this.fxBus);
    this.spaceSend.connect(this.space);
    this.space.connect(this.spaceReturn);

    this._buildNoise(ctx);
    this._buildWaves(ctx);
    this._buildCurves();
    this.sfx = new SfxLibrary(this);
    try { this.music = new MusicDirector(ctx, this.musicBus); }
    catch (error) { this.music = null; this._warn('music', error); }
    try { this.soundscape = new Soundscape(ctx, this.ambienceBus); }
    catch (error) { this.soundscape = null; this._warn('soundscape', error); }
  }

  _buildNoise(ctx) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * 2.5));
    const make = fill => {
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      fill(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
      if (peak > 0) for (let i = 0; i < data.length; i++) data[i] /= peak;
      return buffer;
    };
    let seed = 2026;
    const random = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
    const white = make(data => { for (let i = 0; i < data.length; i++) data[i] = random(); });
    const pink = make(data => {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < data.length; i++) {
        const w = random();
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
      }
    });
    const brown = make(data => {
      let last = 0;
      for (let i = 0; i < data.length; i++) { last = (last + 0.02 * random()) / 1.02; data[i] = last; }
    });
    // Sparse decaying grains: debris, embers and electrical crackle.
    const crackle = make(data => {
      let level = 0;
      for (let i = 0; i < data.length; i++) {
        if (random() > 0.9965) level = 0.4 + 0.6 * Math.abs(random());
        level *= 0.985;
        data[i] = random() * level;
      }
    });
    this.noise = { white, pink, brown, crackle };
    this.noiseDuration = length / ctx.sampleRate;
  }

  _buildWaves(ctx) {
    const wave = harmonics => {
      const real = new Float32Array(harmonics.length + 1);
      const imag = new Float32Array(harmonics.length + 1);
      harmonics.forEach((amplitude, index) => { imag[index + 1] = amplitude; });
      return ctx.createPeriodicWave(real, imag);
    };
    this.waves = {
      glass: wave([1, 0, 0.42, 0, 0.21, 0, 0.11, 0, 0.05]),
      brass: wave([1, 0.82, 0.62, 0.46, 0.33, 0.23, 0.15, 0.1, 0.06]),
      reed: wave([1, 0.32, 0.56, 0.18, 0.27, 0.09, 0.12]),
      hollow: wave([1, 0, 0.3, 0, 0.12, 0, 0.05]),
      horn: wave([1, 0.6, 0.72, 0.38, 0.4, 0.2, 0.22, 0.1]),
    };
  }

  _buildCurves() {
    const curve = drive => {
      const data = new Float32Array(1024);
      const norm = Math.tanh(drive);
      for (let i = 0; i < data.length; i++) { const x = i / 511.5 - 1; data[i] = Math.tanh(x * drive) / norm; }
      return data;
    };
    this.curves = { soft: curve(1.8), hot: curve(4) };
  }

  _impulse(ctx, seconds) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    let seed = 4217;
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let low = 0;
      for (let i = 0; i < length; i++) {
        seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
        const position = i / length;
        // The tail darkens as it decays, like a large open hangar over water.
        const smoothing = 0.15 + position * 0.75;
        low += ((seed / 2147483648 - 1) - low) * (1 - smoothing);
        const early = i < length * 0.04 ? 1.4 : 1;
        data[i] = low * Math.pow(1 - position, 3.2) * 0.42 * early;
      }
    }
    return buffer;
  }

  async _discardAudioContext(ctx) {
    if (ctx && this.ctx !== ctx) return;
    this.ready = false;
    for (const director of [this.music, this.soundscape]) {
      try { director?.stop?.(); } catch (_) {}
    }
    this._reset();
    if (ctx) {
      try { await ctx.close(); } catch (_) {}
    }
  }

  _warn(key, error) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    if (typeof console !== 'undefined') console.warn('[audio] ' + key + ' disabled:', error);
  }

  // Keeps the score and ambience flowing while main.js stops its frame loop (manual dialog).
  _startPump() {
    if (this._pump || typeof window === 'undefined' || typeof setInterval === 'undefined') return;
    this._pump = setInterval(() => {
      if (!this.ready || (typeof document !== 'undefined' && document.hidden)) return;
      if (now() - this._lastTick > 140) this._tick(this._lastGame, false);
    }, 100);
  }

  _onVisibility() {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return;
    if (document.hidden) {
      if (ctx.state === 'running') { this._hiddenSuspend = true; ctx.suspend?.().catch?.(() => {}); }
    } else if (this._hiddenSuspend) {
      this._hiddenSuspend = false;
      ctx.resume?.().catch?.(() => {});
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues?.(t);
      this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER_LEVEL, t, this.muted ? 0.015 : 0.05);
    }
    if (this.muted) this.stopLongCues();
    return this.muted;
  }

  setMuted(value) {
    if (this.muted !== Boolean(value)) this.toggleMute();
  }

  setLevels(music, effects, ambience = this.ambienceLevel) {
    this.musicLevel = clamp(Number(music) || 0, 0, 1);
    this.effectsLevel = clamp(Number(effects) || 0, 0, 1);
    this.ambienceLevel = clamp(Number(ambience) || 0, 0, 1);
    this._applyMix(true);
  }

  setScreen(screen) {
    if (screen === this.screen) return;
    this.screen = String(screen || 'title');
    if (this.screen !== 'play') this.stopLongCues();
    this._applyMix(false);
  }

  // Interface cue on the ui bus. Requests made while the first gesture is still unlocking audio
  // are held briefly so the very first click is not silent.
  ui(name) {
    if (!this.ready || !this.ctx) {
      if (this._unlockPromise) this._pendingUi = { name, at: now() };
      return;
    }
    if (this.muted || this.effectsLevel === 0 || !this.sfx) return;
    try { this.sfx.ui(String(name), this.ctx.currentTime); } catch (error) { this._warn('ui', error); }
  }

  _flushPendingUi() {
    const pending = this._pendingUi;
    this._pendingUi = null;
    if (pending && now() - pending.at < 450) this.ui(pending.name);
  }

  // Voice accounting shared by every sfx voice. Combat voices have their own ceiling so dense
  // fire can never starve warnings and milestones.
  claim(count, combat) {
    if (!this.ready || !this.ctx) return false;
    if (this.activeVoices + count > MAX_VOICES) return false;
    if (combat && this.combatVoices + count > MAX_COMBAT_VOICES) return false;
    this.activeVoices += count;
    if (combat) this.combatVoices += count;
    return true;
  }

  release(ctx, count, combat) {
    if (this.ctx !== ctx) return;
    this.activeVoices = Math.max(0, this.activeVoices - count);
    if (combat) this.combatVoices = Math.max(0, this.combatVoices - count);
  }

  canPlay(name, interval) {
    if (!this.ctx) return false;
    const t = this.ctx.currentTime;
    const last = this.lastSound.get(name) ?? -Infinity;
    if (t - last < interval) return false;
    this.lastSound.set(name, t);
    return true;
  }

  // Ducks the score and ambience ('beds'), repeated combat sounds ('combat') or both ('all').
  // Overlapping requests merge: the deepest floor and the latest release win.
  duck(target, floor, hold, release = 0.3, attack = 0.012) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const key of target === 'all' ? ['beds', 'combat'] : [target]) {
      const param = key === 'beds' ? this.bedDuck?.gain : this.combatDuck?.gain;
      const state = this.ducks[key];
      if (!param || !state) continue;
      const active = t < state.until;
      const depth = clamp(active ? Math.min(state.floor, floor) : floor, 0.05, 1);
      const until = Math.max(active ? state.until : 0, t + attack + hold);
      const end = until + Math.max(release, active ? state.end - state.until : 0);
      state.floor = depth; state.until = until; state.end = end;
      const current = clamp(Number(param.value) || 1, 0, 1);
      param.cancelScheduledValues(t);
      param.setValueAtTime(current, t);
      param.linearRampToValueAtTime(Math.min(current, depth), t + attack);
      param.setValueAtTime(depth, until);
      param.linearRampToValueAtTime(1, end);
    }
  }

  // Long cues (the flagship siren) can be cut when the player pauses, leaves or mutes.
  trackLongCue(cue, seconds = 4) {
    this.longCues.add(cue);
    if (typeof setTimeout !== 'undefined') {
      const timer = setTimeout(() => this.longCues.delete(cue), (seconds + 0.5) * 1000);
      timer?.unref?.();
    }
  }
  stopLongCues() {
    for (const cue of this.longCues) { try { cue.stop(); } catch (_) {} }
    this.longCues.clear();
    this.cues.warning = false;
  }

  playEvent(event, game) {
    if (!this.ready || !this.ctx || !this.sfx || this.muted || this.effectsLevel === 0) return;
    try { this.sfx.play(event, game || {}, this.ctx.currentTime); } catch (error) { this._warn('sfx:' + event?.type, error); }
  }

  update(game, dt) {
    this._tick(game, true);
  }

  _tick(game, fresh) {
    if (fresh) { this._lastGame = game; this._lastTick = now(); }
    if (!this.ready || !this.ctx) return;
    const batch = game?.events;
    const events = fresh && Array.isArray(batch) && batch !== this.lastEventBatch ? batch : [];
    if (fresh) this.lastEventBatch = batch;
    const state = this.buildState(game, events);
    this._applyMix(false, state);
    if (events.length) this._dispatch(events, game);
    this._presentationCues(state, game);
    for (const [key, director] of [['music', this.music], ['soundscape', this.soundscape]]) {
      if (!director) continue;
      try { director.update(state, this.ctx.currentTime); } catch (error) { this._warn(key, error); }
    }
  }

  _dispatch(events, game) {
    this.sfx?.beginBatch(events);
    let used = 0, recovered = false;
    const recovering=this.sfx?.inBatch('salvageRecover');
    for (const event of events) {
      if(recovering&&RECOVERY_FOLLOW_ON_EVENTS.has(event?.type))continue;
      if(event?.type==='salvageRecover'){if(recovered)continue;recovered=true;}
      if (PRIORITY_EVENTS.has(event?.type) && used++ < PRIORITY_LIMIT) this.playEvent(event, game);
    }
    for (const event of events) {
      if (!event?.type || PRIORITY_EVENTS.has(event.type)) continue;
      if (used++ >= EVENT_LIMIT) break;
      this.playEvent(event, game);
    }
    this.sfx?.endBatch();
  }

  buildState(game, events = []) {
    const g = game || {};
    const mode = g.mode || 'title';
    const boss = g.boss && g.boss.hp > 0 ? g.boss : null;
    const player = g.player || {};
    const enemies = Array.isArray(g.enemies) ? g.enemies.length : 0;
    const bullets = Array.isArray(g.bullets) ? g.bullets.length : 0;
    const playing = mode === 'playing';
    const summaryOutcome = g.summary?.outcome === 'victory' ? 'victory' : g.summary ? 'gameover' : null;
    let outcome = mode === 'victory' ? 'victory' : mode === 'gameover' ? 'gameover' : null;
    if (!outcome && this.screen === 'end') outcome = summaryOutcome || this.cues.outcome;
    if (outcome) this.cues.outcome = outcome;
    else if (playing) this.cues.outcome = null;
    return {
      screen: this.screen,
      mode,
      time: Number(g.time) || 0,
      stage: clamp(Math.floor(Number(g.stage) || 1), 1, CAMPAIGN_STAGES),
      stageTime: Number(g.stageTime) || 0,
      bossWarning: bossWarningProgress(g),
      boss: Boolean(boss),
      bossName: boss?.name || null,
      bossPhase: boss ? clamp(Number(boss.phase) || 1, 1, 3) : 0,
      bossHp: boss ? clamp(boss.hp / Math.max(1, boss.maxHp || boss.hp), 0, 1) : 0,
      interlude: interludeProgress(g),
      actTwo: actTwoInterlude(g),
      interludeLength: interludeLength(g),
      intensity: playing ? clamp(enemies * 0.05 + bullets * 0.0045 + Math.min(.18,(Number(player.arsenal)||0)*.006) + (boss ? 0.32 + 0.12 * ((boss.phase || 1) - 1) : 0), 0, 1) : 0,
      critical: playing && Number(player.hp) === 1,
      outcome,
      grade: outcome && g.summary?.grade ? String(g.summary.grade) : null,
      practice: Number(g.practiceStage) || 0,
      paused: this.screen === 'pause' || mode === 'paused',
      muted: this.muted,
      events,
    };
  }

  // Bus levels, the pause treatment and the mute fade. Writes only when something changed.
  _applyMix(force, state) {
    if (!this.ctx || !this.master) return;
    const paused = state ? state.paused : this.screen === 'pause' || this._lastGame?.mode === 'paused';
    const key = [this.musicLevel, this.effectsLevel, this.ambienceLevel, paused, this.muted].join('|');
    if (!force && key === this.mix) return;
    const changedPause = this.mix === null || this.mix.split('|')[3] !== String(paused);
    this.mix = key;
    const t = this.ctx.currentTime;
    const set = (param, value, tc) => { if (param) param.setTargetAtTime(value, t, tc); };
    set(this.musicBus?.gain, this.musicLevel, 0.05);
    set(this.ambienceBus?.gain, this.ambienceLevel, 0.08);
    set(this.fxBus?.gain, this.effectsLevel * FX_LEVEL, 0.03);
    set(this.uiBus?.gain, this.effectsLevel * UI_LEVEL, 0.03);
    // Pause: effects stop dead, the score and weather sink behind glass.
    set(this.fxGate?.gain, paused ? 0 : 1, paused ? 0.012 : 0.06);
    set(this.bedFilter?.frequency, paused ? 720 : 20000, paused ? 0.08 : 0.18);
    set(this.bedPause?.gain, paused ? 0.5 : 1, paused ? 0.1 : 0.25);
    if (changedPause && paused) this.stopLongCues();
  }

  // Cues that come from game state rather than events: the flagship siren, the sector-clear
  // stinger and the critical-hull pulse.
  _presentationCues(state, game) {
    if (!this.sfx || this.muted || this.effectsLevel === 0) {
      this.cues.warning = state.bossWarning >= 0;
      this.cues.interlude = state.interlude >= 0;
      return;
    }
    const t = this.ctx.currentTime;
    const live = state.mode === 'playing' && !state.paused && state.screen === 'play';
    if (live && state.bossWarning >= 0 && state.bossWarning < 0.97 && !this.cues.warning) {
      this.cues.warning = true;
      try { this.sfx.flagshipWarning(t, (1 - state.bossWarning) * BOSS_WARNING_LEAD); } catch (error) { this._warn('warning', error); }
    } else if (state.bossWarning < 0) this.cues.warning = false;

    if (state.interlude >= 0 && !this.cues.interlude) {
      this.cues.interlude = true;
      if (state.mode === 'playing' && !state.actTwo && !state.events.some(e => e.type === 'actTwo')) {
        const wait = Math.max(0, 0.95 - state.interlude * INTERLUDE_LENGTH);
        try { this.sfx.sectorClear(t + wait, state.stage, state.practice > 0); } catch (error) { this._warn('sectorClear', error); }
      }
    } else if (state.interlude < 0) this.cues.interlude = false;

    if (live && state.critical && this.canPlay('criticalPulse', 1.3)) {
      try { this.sfx.criticalPulse(t); } catch (error) { this._warn('critical', error); }
    }
  }
}
