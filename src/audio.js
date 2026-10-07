// Every note and sound in 2026 is synthesized at runtime.
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pitch = midi => 440 * Math.pow(2, (midi - 69) / 12);

// Six scores share a clock, but each has its own harmony, accents, and motif.
// Notes are MIDI numbers; rhythmic positions are sixteenth notes within a bar.
const SCORES = {
  1: {
    bpm: 112, roots: [48, 45, 53, 43], chords: [[0, 4, 7, 11], [0, 3, 7, 10], [0, 4, 7, 11], [0, 4, 7, 10]],
    kick: [0, 8], snare: [12], hat: [2, 6, 10, 14],
    bass: [[0, 0], [8, 7]],
    lead: [[2, 12, 3], [6, 16, 2], [10, 19, 3], [14, 16, 2]],
    texture: "horizon",
  },
  2: {
    bpm: 138, roots: [45, 41, 43, 40], chords: [[0, 3, 7, 10], [0, 3, 7, 12], [0, 3, 7, 10], [0, 4, 7, 10]],
    kick: [0, 6, 10], snare: [4, 12], hat: [0, 2, 3, 6, 8, 10, 11, 14],
    bass: [[0, 0], [3, 0], [6, 7], [10, 0], [14, 10]],
    lead: [[1, 15, 2], [4, 12, 1], [7, 10, 2], [11, 19, 1], [14, 15, 2]],
    texture: "storm",
  },
  3: {
    bpm: 154, roots: [40, 36, 43, 39], chords: [[0, 3, 7, 11], [0, 3, 6, 10], [0, 3, 6, 10], [0, 4, 7, 10]],
    kick: [0, 3, 8, 11], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14],
    bass: [[0, 0], [2, 0], [3, 7], [6, 0], [8, 0], [10, 7], [11, 12], [14, 7]],
    lead: [[0, 24, 1], [3, 23, 1], [6, 19, 1], [8, 18, 2], [11, 23, 1], [14, 24, 2]],
    texture: "crown",
  },
  boss1: {
    bpm: 126, roots: [36, 35, 32, 31], chords: [[0, 3, 7, 10], [0, 4, 7, 10], [0, 3, 6, 10], [0, 3, 7, 11]],
    kick: [0, 7, 10], snare: [6, 14], hat: [2, 5, 8, 11, 15],
    bass: [[0, 0], [5, 7], [7, 0], [10, 3], [14, 0]],
    lead: [[0, 19, 5], [7, 13, 2], [12, 10, 3]],
    texture: "vesper",
  },
  boss2: {
    bpm: 150, roots: [38, 41, 35, 37], chords: [[0, 3, 6, 10], [0, 3, 7, 10], [0, 4, 6, 10], [0, 3, 7, 11]],
    kick: [0, 3, 6, 10, 14], snare: [4, 11, 12], hat: [0, 1, 3, 5, 7, 8, 10, 13, 15],
    bass: [[0, 0], [3, 12], [6, 6], [9, 0], [10, 12], [14, 6]],
    lead: [[0, 24, 1], [2, 24, 1], [5, 18, 2], [8, 24, 1], [10, 24, 1], [13, 30, 2]],
    texture: "aurelia",
  },
  boss3: {
    bpm: 168, roots: [36, 32, 39, 35], chords: [[0, 3, 7, 11], [0, 3, 6, 10], [0, 3, 6, 10], [0, 4, 7, 11]],
    kick: [0, 3, 6, 8, 11, 14], snare: [4, 12], hat: [0, 2, 3, 5, 6, 8, 10, 11, 13, 14],
    bass: [[0, 0], [2, 0], [3, 7], [6, 0], [8, 12], [10, 0], [11, 7], [14, 12]],
    lead: [[0, 12, 3], [4, 19, 2], [7, 24, 3], [11, 27, 2], [14, 31, 2]],
    texture: "finale",
  },
};

// The first four chords establish a theme; these detours give every cue an
// eight-bar harmonic sentence before its larger form returns or transforms it.
const DEVELOPMENT = {
  1: {
    form: ["intro", "A", "A2", "B", "break", "finale"], mix: 0.62,
    roots: [50, 46, 41, 43],
    chords: [[0, 3, 7, 10], [0, 4, 7, 11], [0, 4, 7, 11], [0, 4, 7, 10]],
    bKick: [0, 6, 10], bLead: [[0, 19, 5], [5, 16, 3], [9, 14, 3], [13, 12, 3]],
    aAnswer: [[0, 19, 4], [5, 16, 3], [10, 14, 2], [13, 12, 3]], bAnswer: [[0, 16, 4], [6, 14, 3], [10, 11, 2], [14, 12, 2]],
    counter: [[3, 7, 2], [11, 11, 2]], cadence: [7, 11, 12],
  },
  2: {
    form: ["intro", "A", "A2", "B", "break", "B2", "finale", "outro"], mix: 0.74,
    roots: [48, 43, 41, 40],
    chords: [[0, 4, 7, 11], [0, 3, 7, 10], [0, 3, 7, 10], [0, 4, 7, 10]],
    bKick: [0, 4, 8, 13], bLead: [[0, 19, 3], [4, 22, 2], [8, 17, 3], [13, 15, 2]],
    aAnswer: [[0, 19, 2], [3, 17, 2], [8, 15, 2], [12, 12, 3]], bAnswer: [[0, 15, 3], [5, 17, 2], [9, 12, 2], [13, 10, 2]],
    counter: [[2, 7, 1], [6, 10, 1], [10, 7, 1], [14, 3, 1]], cadence: [10, 7, 0],
  },
  3: {
    form: ["intro", "A", "A2", "B", "break", "B2", "finale", "outro"], mix: 0.58,
    roots: [45, 41, 43, 39],
    chords: [[0, 3, 7, 10], [0, 4, 7, 11], [0, 3, 6, 10], [0, 4, 7, 10]],
    bKick: [0, 4, 7, 10, 14], bLead: [[0, 12, 4], [5, 15, 3], [9, 19, 3], [13, 23, 3]],
    aAnswer: [[0, 24, 2], [2, 23, 2], [5, 19, 2], [9, 15, 2], [13, 12, 3]], bAnswer: [[0, 19, 3], [4, 15, 2], [8, 12, 3], [13, 11, 2]],
    counter: [[2, 7, 2], [6, 11, 2], [10, 7, 2], [14, 3, 2]], cadence: [11, 7, 0],
  },
  boss1: {
    form: ["intro", "A", "A2", "B", "break", "finale"], mix: 0.62,
    roots: [36, 39, 32, 35],
    chords: [[0, 3, 7, 10], [0, 3, 6, 10], [0, 3, 7, 10], [0, 4, 7, 10]],
    bKick: [0, 3, 8, 13], bLead: [[0, 15, 4], [5, 12, 3], [11, 7, 3]],
    aAnswer: [[0, 10, 4], [6, 13, 2], [11, 7, 3]], bAnswer: [[0, 7, 5], [8, 13, 2], [12, 10, 3]],
    counter: [[4, 7, 2], [12, 6, 2]], cadence: [10, 7, 0],
  },
  boss2: {
    form: ["intro", "A", "A2", "B", "break", "B2", "finale", "outro"], mix: 0.71,
    roots: [38, 34, 41, 37],
    chords: [[0, 3, 6, 10], [0, 4, 7, 10], [0, 3, 7, 10], [0, 3, 7, 11]],
    bKick: [0, 4, 7, 12, 15], bLead: [[0, 30, 1], [2, 30, 1], [4, 24, 2], [8, 18, 1], [12, 24, 2]],
    aAnswer: [[0, 18, 2], [3, 18, 2], [6, 24, 1], [9, 24, 1], [13, 18, 2]], bAnswer: [[0, 24, 1], [2, 18, 1], [5, 24, 1], [8, 18, 1], [11, 30, 2]],
    counter: [[2, 6, 1], [6, 10, 1], [10, 6, 1], [14, 3, 1]], cadence: [6, 10, 12],
  },
  boss3: {
    form: ["intro", "A", "A2", "B", "break", "B2", "finale", "outro"], mix: 0.50,
    roots: [36, 43, 39, 35],
    chords: [[0, 3, 7, 11], [0, 3, 6, 10], [0, 3, 6, 10], [0, 4, 7, 10]],
    bKick: [0, 3, 7, 8, 12, 15], bLead: [[0, 12, 4], [6, 18, 3], [11, 24, 3], [14, 31, 2]],
    aAnswer: [[0, 12, 3], [5, 19, 2], [9, 23, 2], [13, 31, 3]], bAnswer: [[0, 19, 3], [4, 24, 2], [9, 27, 2], [13, 31, 2]],
    counter: [[2, 7, 1], [5, 11, 1], [8, 7, 1], [11, 3, 1], [14, 0, 1]], cadence: [11, 7, 0],
  },
};
const PRIORITY_EVENTS = new Set(["playerHit", "lifeLost", "bomb", "shieldBreak", "shieldRestore", "powerUp", "wakeRoll", "wakeReady", "wakeConvert", "bossDown", "bossPhase", "bossEnter", "stage"]);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.fxBus = null;
    this.combatBus = null;
    this.echoSend = null;
    this.noiseBuffer = null;
    this.waves = {};
    this.muted = false;
    this.ready = false;
    this.step = 0;
    this.nextStep = 0;
    this.lastMode = "";
    this.lastSound = new Map();
    this.beat = 60 / 138 / 4;
    this.duckUntil = 0;
    this.duckFloor = 1;
    this.duckRelease = 0.22;
    this.musicTarget = null;
    this.musicKey = "";
    this.activeVoices = 0;
    this.arrangementPhase = 1;
    this._unlockPromise = null;
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
        if (ctx.state === "suspended") await ctx.resume();
      } catch (_) {
        await this._discardAudioContext(ctx);
      }
      return;
    }
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) return;
    let ctx = null;
    try {
      ctx = new AudioContextClass();
      this.ctx = ctx;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -17;
      limiter.knee.value = 18;
      limiter.ratio.value = 7;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.22;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0.27;
      this.fxBus = ctx.createGain();
      // Keep combat transients above the score without masking the mid-quiet cues.
      this.fxBus.gain.value = 0.58;
      // Repeated fire, hits and small kills have their own ceiling. Milestone
      // sounds still use the full effects bus so their accents remain distinct.
      this.combatBus = ctx.createGain();
      this.combatBus.gain.value = 0.74;
      this.combatBus.connect(this.fxBus);
      // A small family of deterministic harmonic spectra keeps six cues in one
      // world while giving bells, reeds, brass and pulse lines separate bodies.
      const wave = harmonics => {
        const real = new Float32Array(harmonics.length + 1);
        const imag = new Float32Array(harmonics.length + 1);
        harmonics.forEach((amplitude, index) => { imag[index + 1] = amplitude; });
        return ctx.createPeriodicWave(real, imag);
      };
      this.waves = {
        glass: wave([1, 0, 0.34, 0, 0.16, 0, 0.08]),
        reed: wave([1, 0.38, 0.53, 0.19, 0.24, 0.1, 0.12]),
        brass: wave([1, 0.75, 0.54, 0.39, 0.29, 0.19, 0.12]),
        pulse: wave([1, 0, 0.52, 0, 0.3, 0, 0.16]),
        hollow: wave([1, 0, 0.18, 0, 0.07]),
        mist: wave([1, 0.12, 0.28, 0.04, 0.12, 0, 0.05]),
        choir: wave([1, 0.57, 0.2, 0.08, 0.15, 0.04, 0.03]),
        steel: wave([1, 0.08, 0.48, 0.06, 0.25, 0.02, 0.12]),
      };
      const impulseLength = Math.floor(ctx.sampleRate * 0.72);
      const impulse = ctx.createBuffer(2, impulseLength, ctx.sampleRate);
      let impulseSeed = 4217;
      for (let channel = 0; channel < 2; channel++) {
        const samples = impulse.getChannelData(channel);
        for (let i = 0; i < samples.length; i++) {
          impulseSeed = (1664525 * impulseSeed + 1013904223) >>> 0;
          const decay = Math.pow(1 - i / impulseLength, 2.7);
          samples[i] = (impulseSeed / 2147483648 - 1) * decay * 0.35;
        }
      }
      const reverbFilter = ctx.createBiquadFilter();
      reverbFilter.type = "highpass";
      reverbFilter.frequency.value = 280;
      const reverb = ctx.createConvolver();
      reverb.buffer = impulse;
      const wet = ctx.createGain();
      wet.gain.value = 0.11;
      this.musicBus.connect(reverbFilter);
      reverbFilter.connect(reverb);
      reverb.connect(wet);
      wet.connect(limiter);
      // A quiet filtered side echo returns through the music bus so game
      // states and heavy effects also duck its tail.
      this.echoSend = ctx.createDelay(0.5);
      this.echoSend.delayTime.value = 0.19;
      const echoFilter = ctx.createBiquadFilter();
      echoFilter.type = "lowpass";
      echoFilter.frequency.value = 2100;
      const echoPan = ctx.createStereoPanner();
      echoPan.pan.value = -0.38;
      const echoWet = ctx.createGain();
      echoWet.gain.value = 0.12;
      this.echoSend.connect(echoFilter);
      echoFilter.connect(echoPan);
      echoPan.connect(echoWet);
      echoWet.connect(this.musicBus);
      this.musicBus.connect(limiter);
      this.fxBus.connect(limiter);
      limiter.connect(this.master);
      this.master.connect(ctx.destination);
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let seed = 2026;
      for (let i = 0; i < data.length; i++) {
        seed = (1664525 * seed + 1013904223) >>> 0;
        data[i] = (seed / 2147483648 - 1) * 0.85;
      }
      this.noiseBuffer = buffer;
      await ctx.resume();
      this.nextStep = ctx.currentTime + 0.04;
      this.ready = true;
    } catch (_) {
      await this._discardAudioContext(ctx);
    }
  }

  async _discardAudioContext(ctx) {
    if (ctx && this.ctx !== ctx) return;
    this.ready = false;
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.fxBus = null;
    this.combatBus = null;
    this.echoSend = null;
    this.noiseBuffer = null;
    this.waves = {};
    this.lastSound.clear();
    this.lastMode = "";
    this.musicKey = "";
    this.musicTarget = null;
    this.step = 0;
    this.nextStep = 0;
    this.beat = 60 / 138 / 4;
    this.duckUntil = 0;
    this.duckFloor = 1;
    this.duckRelease = 0.22;
    this.arrangementPhase = 1;
    this.activeVoices = 0;
    if (ctx) {
      try { await ctx.close(); } catch (_) {}
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.025);
    }
    return this.muted;
  }

  setMuted(value) {
    if (this.muted !== Boolean(value)) this.toggleMute();
  }

  tone(frequency, at, duration, volume, type = "sine", bus = this.fxBus, options = {}) {
    if (!this.ready || !this.ctx || !bus || this.muted || this.activeVoices >= 64) return;
    this.activeVoices++;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const envelope = ctx.createGain();
    const now = Math.max(at, ctx.currentTime);
    if (this.waves[type]) osc.setPeriodicWave(this.waves[type]);
    else osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, frequency), now);
    if (options.endFrequency) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFrequency), now + duration);
    }
    if (options.detune) osc.detune.value = options.detune;
    const attack = Math.min(duration * 0.48, options.attack ?? Math.min(0.025, duration * 0.18));
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + attack);
    if (options.hold) envelope.gain.setValueAtTime(Math.max(0.0002, volume),
      now + Math.max(attack, duration * clamp(options.hold, 0, 0.9)));
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    if (options.lowpass) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(options.lowpass, now);
      if (options.endLowpass) filter.frequency.exponentialRampToValueAtTime(
        Math.max(40, options.endLowpass), now + duration * 0.85);
      osc.connect(filter);
      filter.connect(envelope);
    } else {
      osc.connect(envelope);
    }
    let output = envelope;
    if (Number.isFinite(options.pan) && ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = clamp(options.pan, -0.7, 0.7);
      envelope.connect(pan);
      output = pan;
    }
    output.connect(bus);
    if (options.echo && this.echoSend && bus === this.musicBus) envelope.connect(this.echoSend);
    osc.start(now);
    osc.stop(now + duration + 0.02);
    osc.onended = () => { if (this.ctx === ctx) this.activeVoices--; osc.disconnect(); envelope.disconnect(); if (output !== envelope) output.disconnect(); };
  }

  fmTone(frequency, at, duration, volume, bus = this.musicBus, options = {}) {
    if (!this.ready || !this.ctx || !bus || this.muted || this.activeVoices > 62) return;
    this.activeVoices += 2;
    const ctx = this.ctx;
    const now = Math.max(at, ctx.currentTime);
    const carrier = ctx.createOscillator();
    const modulator = ctx.createOscillator();
    const index = ctx.createGain();
    const envelope = ctx.createGain();
    carrier.type = "sine";
    modulator.type = "sine";
    carrier.frequency.setValueAtTime(Math.max(20, frequency), now);
    modulator.frequency.setValueAtTime(Math.max(20, frequency * (options.ratio ?? 2.13)), now);
    index.gain.setValueAtTime(Math.max(1, frequency * (options.index ?? 0.8)), now);
    index.gain.exponentialRampToValueAtTime(0.01, now + duration * 0.88);
    modulator.connect(index);
    index.connect(carrier.frequency);
    const attack = Math.min(duration * 0.3, options.attack ?? 0.006);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    carrier.connect(envelope);
    let output = envelope;
    if (Number.isFinite(options.pan) && ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = clamp(options.pan, -0.7, 0.7);
      envelope.connect(pan);
      output = pan;
    }
    output.connect(bus);
    if (options.echo && this.echoSend && bus === this.musicBus) envelope.connect(this.echoSend);
    carrier.start(now);
    modulator.start(now);
    carrier.stop(now + duration + 0.02);
    modulator.stop(now + duration + 0.02);
    carrier.onended = () => { if (this.ctx === ctx) this.activeVoices--; carrier.disconnect(); envelope.disconnect(); if (output !== envelope) output.disconnect(); };
    modulator.onended = () => { if (this.ctx === ctx) this.activeVoices--; modulator.disconnect(); index.disconnect(); };
  }
  noise(at, duration, volume, lowpass = 800, highpass = 0, bus = this.fxBus) {
    if (!this.ready || !this.ctx || !this.noiseBuffer || this.muted || this.activeVoices >= 64) return;
    this.activeVoices++;
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = lowpass;
    const gain = ctx.createGain();
    const now = Math.max(at, ctx.currentTime);
    gain.gain.setValueAtTime(Math.max(0.0002, volume), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(low);
    if (highpass) {
      const high = ctx.createBiquadFilter();
      high.type = "highpass";
      high.frequency.value = highpass;
      low.connect(high);
      high.connect(gain);
    } else {
      low.connect(gain);
    }
    gain.connect(bus);
    source.start(now);
    source.stop(now + duration + 0.01);
    source.onended = () => { if (this.ctx === ctx) this.activeVoices--; source.disconnect(); low.disconnect(); gain.disconnect(); };
  }

  swell(at, duration, volume, startFrequency, endFrequency, pan = 0) {
    if (!this.ready || !this.ctx || !this.musicBus || this.muted || this.activeVoices >= 64) return;
    this.activeVoices++;
    const ctx = this.ctx;
    const now = Math.max(at, ctx.currentTime);
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.55;
    filter.frequency.setValueAtTime(Math.max(80, startFrequency), now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, endFrequency), now + duration * 0.85);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + Math.min(0.6, duration * 0.28));
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    const stereo = ctx.createStereoPanner();
    stereo.pan.value = clamp(pan, -0.5, 0.5);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(stereo);
    stereo.connect(this.musicBus);
    source.start(now);
    source.stop(now + duration + 0.02);
    source.onended = () => {
      if (this.ctx === ctx) this.activeVoices--;
      source.disconnect(); filter.disconnect(); envelope.disconnect(); stereo.disconnect();
    };
  }

  canPlay(name, interval) {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    const last = this.lastSound.get(name) ?? -Infinity;
    if (now - last < interval) return false;
    this.lastSound.set(name, now);
    return true;
  }

  requestDuck(now, hold, floor, release) {
    const active = now < this.duckUntil + this.duckRelease;
    this.duckFloor = active ? Math.min(this.duckFloor, floor) : floor;
    this.duckUntil = active ? Math.max(this.duckUntil, now + hold) : now + hold;
    this.duckRelease = active ? Math.max(this.duckRelease, release) : release;
  }

  playEvent(event, game) {
    if (!this.ready || this.muted) return;
    const now = this.ctx.currentTime;
    const combo = clamp(game.combo || 0, 0, 100);
    switch (event.type) {
      case "shoot":
        if (this.canPlay("shoot", 0.045)) {
          this.tone(720 + combo * 2, now, 0.07, 0.045, "triangle", this.combatBus, { endFrequency: 320 });
        }
        break;
      case "hit":
        if (this.canPlay("hit", 0.07)) {
          this.tone(210, now, 0.09, 0.075, "sawtooth", this.combatBus, { endFrequency: 75, lowpass: 850 });
        }
        break;
      case "explode":
      case "enemyDown":
        if (this.canPlay("explode", 0.055)) {
          this.noise(now, 0.17, 0.11, 1100, 0, this.combatBus);
          this.tone(event.type === "enemyDown" ? 120 : 160, now, 0.18, 0.11, "sawtooth", this.combatBus, { endFrequency: 40, lowpass: 1000 });
        }
        break;
      case "pickup":
        this.tone(660, now, 0.09, 0.15, "sine");
        this.tone(990, now + 0.065, 0.16, 0.13, "triangle");
        this.tone(1320, now + 0.14, 0.18, 0.11, "sine");
        break;
      case "bomb": {
        const variant = String(event.value || game.player?.specialType || "nova");
        if (variant === "barrier") {
          this.requestDuck(now, 0.09, 0.84, 0.18);
          this.tone(280, now, 0.4, 0.18, "sine", this.fxBus, { endFrequency: 760 });
          this.tone(560, now + 0.08, 0.5, 0.15, "triangle", this.fxBus, { endFrequency: 1120 });
          this.noise(now, 0.26, 0.08, 7600, 2800, this.fxBus);
        } else if (variant === "storm") {
          this.requestDuck(now, 0.18, 0.7, 0.28);
          this.noise(now, 0.8, 0.3, 4400, 260, this.fxBus);
          this.tone(96, now, 0.7, 0.24, "sawtooth", this.fxBus, { endFrequency: 38, lowpass: 800 });
          this.tone(930, now + 0.09, 0.42, 0.14, "sine", this.fxBus, { endFrequency: 240 });
        } else {
          this.requestDuck(now, 0.16, 0.68, 0.24);
          this.noise(now, 0.9, 0.42, 1900);
          this.tone(105, now, 0.75, 0.31, "sawtooth", this.fxBus, { endFrequency: 28, lowpass: 550 });
          this.tone(55, now + 0.06, 0.7, 0.35, "sine", this.fxBus, { endFrequency: 31 });
        }
        break;
      }
      case "special":
        // The matching bomb event carries the one full special cue.
        break;
      case "roll":
        if (game.player?.rollCharged) break;
        this.tone(180, now, 0.25, 0.12, "triangle", this.fxBus, { endFrequency: 900 });
        this.noise(now, 0.18, 0.065, 2600, 600);
        break;
      case "wakeReady":
        if (this.canPlay("wakeReady", 0.4)) {
          this.tone(740, now, 0.12, 0.11, "sine");
          this.tone(1108, now + 0.065, 0.19, 0.12, "triangle");
          this.tone(1480, now + 0.13, 0.23, 0.085, "sine");
        }
        break;
      case "wakeRoll":
        this.requestDuck(now, 0.07, 0.82, 0.18);
        this.noise(now, 0.29, 0.17, 4400, 350);
        this.tone(160, now, 0.29, 0.20, "sawtooth", this.fxBus, { endFrequency: 840, lowpass: 1800 });
        this.tone(880, now + 0.045, 0.25, 0.11, "sine", this.fxBus, { endFrequency: 440 });
        break;
      case "wakeConvert": {
        if (this.canPlay("wakeConvert", 0.065)) {
          const count = clamp(Number(event.value) || 1, 1, 20);
          this.tone(1120 + 19 * count, now, 0.075, Math.min(0.15, 0.05 + count * 0.008), "triangle", this.combatBus, { endFrequency: 1720 });
          this.noise(now, 0.055, 0.045, 7000, 1600, this.combatBus);
          if (count >= 4) this.tone(1660, now + 0.055, 0.16, 0.06, 'sine', this.fxBus, { endFrequency: 2200 });
        }
        break;
      }
      case "missileLaunch":
        if (this.canPlay("missileLaunch", 0.14)) {
          this.tone(180, now, 0.18, 0.07, "sawtooth", this.combatBus, { endFrequency: 740, lowpass: 2000 });
          this.noise(now, 0.12, 0.035, 5200, 700, this.combatBus);
        }
        break;
      case "missileHit":
        if (this.canPlay("missileHit", 0.1)) {
          this.noise(now, 0.24, 0.095, 1500, 200, this.combatBus);
          this.tone(170, now, 0.2, 0.1, "sawtooth", this.combatBus, { endFrequency: 55, lowpass: 1300 });
        }
        break;
      case "droneFire":
        if (this.canPlay("droneFire", 0.12))
          this.tone(1040, now, 0.085, 0.035, "sine", this.combatBus, { endFrequency: 540, pan: 0.38 });
        break;
      case "shieldHit":
        if (this.canPlay("shieldHit", 0.16)) {
          this.tone(840, now, 0.18, 0.11, "sine", this.fxBus, { endFrequency: 460 });
          this.tone(1260, now + 0.015, 0.14, 0.07, "triangle", this.fxBus, { endFrequency: 680 });
        }
        break;
      case "shieldBreak":
        this.requestDuck(now, 0.08, 0.84, 0.18);
        this.noise(now, 0.36, 0.14, 8100, 1900, this.fxBus);
        this.tone(1110, now, 0.48, 0.16, "triangle", this.fxBus, { endFrequency: 170 });
        break;
      case "shieldRestore":
        if (this.canPlay("shieldRestore", 0.3)) {
          for (let i = 0; i < 3; i++)
            this.tone([520, 780, 1040][i], now + i * 0.075, 0.22, 0.08, "sine", this.fxBus);
        }
        break;
      case "rollStrike":
        if (this.canPlay("rollStrike", 0.11)) {
          this.tone(240, now, 0.22, 0.13, "sawtooth", this.fxBus, { endFrequency: 84, lowpass: 1600 });
          this.noise(now, 0.13, 0.055, 3300, 450, this.fxBus);
        }
        break;
      case "powerUp": {
        const level = clamp(Number(event.value) || 1, 1, 5);
        if (this.canPlay("powerUp", 0.22)) {
          const base = 520 + level * 70;
          for (let i = 0; i < 3; i++)
            this.tone(base * [1, 1.25, 1.5][i], now + i * 0.075, 0.2, 0.09, "triangle", this.fxBus);
        }
        break;
      }
      case "playerHit":
      case "lifeLost":
        this.requestDuck(now, 0.12, 0.76, 0.22);
        if (this.canPlay("playerHit", 0.2)) {
          this.noise(now, 0.5, 0.21, 700);
          this.tone(450, now, 0.52, 0.21, "sawtooth", this.fxBus, { endFrequency: 55, lowpass: 1050 });
        }
        break;
      case "bossEnter": {
        const stage = clamp(Number(game.stage) || 1, 1, 3);
        const roots = [36, 38, 36];
        this.requestDuck(now, 0.22, 0.76, 0.28);
        this.tone(pitch(roots[stage - 1]), now, 0.8, 0.19, "sawtooth", this.fxBus, { endFrequency: pitch(roots[stage - 1] - 5), lowpass: 420 });
        this.tone(pitch(roots[stage - 1] + [7, 6, 11][stage - 1]), now + 0.24, 0.9, 0.15, "sine");
        this.noise(now + 0.1, 0.65, 0.1, 500);
        break;
      }
      case "bossPhase": {
        const stage = clamp(Number(game.stage) || 1, 1, 3);
        const phase = clamp(Number(event.value) || 2, 2, 3);
        const call = [0, 55, 50, 60][stage] + (phase === 3 ? 3 : 0);
        this.requestDuck(now, 0.08, 0.86, 0.18);
        this.tone(pitch(call), now, 0.19, 0.15, "square", this.fxBus, { endFrequency: pitch(call - 5), lowpass: 1050 });
        this.tone(pitch(call + (stage === 2 ? 6 : 7)), now + 0.13, 0.21, 0.1, "triangle");
        break;
      }
      case "bossDown":
        this.requestDuck(now, 0.28, 0.72, 0.38);
        this.noise(now, 1.2, 0.32, 1500);
        for (let i = 0; i < 5; i++) this.tone(220 / (1 + i * 0.2), now + i * 0.11, 0.32, 0.16, "sawtooth", this.fxBus, { endFrequency: 45, lowpass: 750 });
        break;
      case "stage": {
        const stage = clamp(Number(game.stage) || 1, 1, 3);
        const notes = [[60, 64, 67, 72], [57, 60, 64, 69], [52, 55, 59, 64]][stage - 1];
        this.requestDuck(now, 0.12, 0.82, 0.22);
        for (let i = 0; i < notes.length; i++) {
          this.tone(pitch(notes[i]), now + i * (stage === 3 ? 0.085 : 0.11), 0.24, 0.09, stage === 2 ? "square" : "triangle", this.fxBus, stage === 2 ? { lowpass: 1300 } : {});
        }
        break;
      }
      case "graze":
        if (this.canPlay("graze", 0.09)) this.tone(1100 + combo * 4, now, 0.06, 0.025, "sine", this.combatBus, { endFrequency: 1550 });
        break;
      case "gameover":
        for (let i = 0; i < 4; i++) this.tone([330, 277, 247, 165][i], now + i * 0.2, 0.48, 0.12, "triangle");
        break;
      case "victory":
        for (let i = 0; i < 6; i++) this.tone([330, 440, 554, 659, 880, 1108][i], now + i * 0.13, 0.48, 0.12, "triangle");
        break;
    }
  }

  scheduleMusic(game) {
    if (!this.ctx || this.muted) return;
    const stage = clamp(Number(game.stage) || 1, 1, 3);
    const boss = Boolean(game.boss && game.boss.hp > 0);
    const key = boss ? `boss${stage}` : String(stage);
    const score = SCORES[key];
    const development = DEVELOPMENT[key];
    const at = this.nextStep;
    const s = this.step % 16;
    if (boss && s === 0) this.arrangementPhase = clamp(Number(game.boss.phase) || 1, 1, 3);
    const phase = boss ? this.arrangementPhase : 1;
    const bar = Math.floor(this.step / 16) % (development.form.length * 4);
    const phraseBar = bar % 4;
    const harmonicBar = bar % 8;
    const root = harmonicBar < 4 ? score.roots[harmonicBar] : development.roots[harmonicBar - 4];
    const chord = harmonicBar < 4 ? score.chords[harmonicBar] : development.chords[harmonicBar - 4];
    let section = development.form[Math.floor(bar / 4)];
    // Boss damage promotes the composition at the next bar line.
    if (boss && phase === 2 && (section === "intro" || section === "break")) section = "B";
    if (boss && phase === 3 && section !== "outro") section = "finale";
    const bTheme = section === "B" || section === "B2";
    const climax = section === "finale";
    const spare = section === "break";
    const combo = clamp(((Number(game.combo) || 1) - 1) / 7, 0, 1);
    const wake = clamp(Number(game.player?.wake) || 0, 0, 1);
    const energy = clamp(combo * 0.35 + wake * 0.25 + (phase - 1) * 0.2 + (climax ? 0.2 : 0), 0, 1);
    const sectionGain = spare ? 0.82 : climax ? 1.1 : 1;
    const voice = (midi, length, volume, type, options = {}) =>
      this.tone(pitch(midi), at, length * this.beat, volume * sectionGain, type, this.musicBus, options);

    const kicks = bTheme ? development.bKick : score.kick;
    const kick = spare ? (s === 0 || s === 8) :
      section === "intro" ? (s === 0 || s === 8) :
      kicks.includes(s) || (climax && (s === 14 || (boss && s === 2)));
    if (kick) {
      this.tone(122, at, 0.14, 0.085 + energy * 0.022, "sine", this.musicBus, { endFrequency: 39 });
      if (boss && stage === 1 && (s === 0 || s === 8)) {
        this.fmTone(82, at, 0.18, 0.036, this.musicBus, { ratio: 1.02, index: 0.27 });
      }
    }
    const snare = !spare && (section !== "intro" || phraseBar >= 1) &&
      (score.snare.includes(s) || ((bTheme || climax) && s === 15 && phraseBar === 3));
    if (snare) {
      this.noise(at, 0.105, 0.05 + energy * 0.014, boss ? 3700 : 4400, 650, this.musicBus);
      this.tone(150, at, 0.065, 0.019, "triangle", this.musicBus, { endFrequency: 80 });
      if ((stage === 3 || (boss && stage === 2)) && s === score.snare[0]) {
        this.fmTone(stage === 3 ? 210 : 360, at, 0.13, 0.024, this.musicBus, { ratio: 2.75, index: 0.85 });
      }
    }
    const hat = spare ? (s === 4 || s === 12) :
      section === "intro" ? (s === 2 || s === 10 || s === 14) :
      score.hat.includes(s) || (climax && s % 4 === 3);
    if (hat) this.noise(at, 0.03, (spare ? 0.009 : 0.013) + energy * 0.006, 9000, 3600, this.musicBus);

    const bassNote = bTheme ?
      development.bKick.indexOf(s) : score.bass.findIndex(([beat]) => beat === s);
    if (bassNote >= 0 && (!spare || s === 0 || s === 8)) {
      const degree = bTheme ? [0, chord[2], 0, chord[1], chord[2]][bassNote % 5] :
        score.bass[bassNote][1];
      const gritty = score.texture !== "horizon" || bTheme;
      voice(root + degree, spare ? 5 : gritty ? 1.7 : 3.9,
        (gritty ? 0.087 : 0.105) + energy * 0.023,
        boss ? (stage === 1 ? "hollow" : stage === 2 ? "pulse" : "brass") : (gritty ? "pulse" : "hollow"),
        { lowpass: boss ? 820 : 620 });
    }

    const useB = bTheme || spare || section === "outro" || (climax && phraseBar >= 2);
    const motif = useB ? (phraseBar % 2 ? development.bAnswer : development.bLead) :
      (phraseBar % 2 ? development.aAnswer : score.lead);
    const leadIndex = motif.findIndex(([beat]) => beat === s);
    if (leadIndex >= 0) {
      const [_, interval, length] = motif[leadIndex];
      const play = section === "intro" ? (phraseBar > 0 || leadIndex < 2) :
        spare ? (phraseBar % 2 === 0 && leadIndex === 0) :
        section !== "outro" || leadIndex % 2 === 0;
      if (play) {
        const flourish = (climax && phraseBar === 3 && leadIndex === motif.length - 1) ? 12 : 0;
        const note = root + interval + flourish;
        const leadPan = phraseBar % 2 ? -0.2 : 0.2;
        switch (score.texture) {
          case "horizon":
            this.fmTone(pitch(note + 12), at, length * this.beat * (bTheme ? 1.2 : 1.65),
              (0.058 + energy * 0.013) * sectionGain, this.musicBus, { ratio: 2.01, index: 0.55, pan: leadPan, echo: leadIndex === 0 });
            if (bTheme) voice(note, length * 1.1, 0.018, "glass");
            break;
          case "storm":
            voice(note + 12, length * (bTheme ? 1.4 : 0.95), 0.064 + energy * 0.013,
              bTheme ? "reed" : "pulse", { lowpass: bTheme ? 1700 : 2200, pan: leadPan });
            break;
          case "crown":
            voice(note + 12, length * (bTheme ? 1.3 : 1.05), 0.064 + energy * 0.015,
              bTheme ? "brass" : "reed", { lowpass: bTheme ? 1450 : 2350, attack: bTheme ? 0.035 : 0.012, pan: leadPan });
            break;
          case "vesper":
            voice(note, length * (bTheme ? 1.3 : 2.0), 0.102 + energy * 0.018,
              bTheme ? "hollow" : "reed", { lowpass: bTheme ? 1000 : 1450, attack: 0.045, pan: leadPan, echo: leadIndex === 0 });
            break;
          case "aurelia":
            this.fmTone(pitch(note + 12), at, length * this.beat * (bTheme ? 1.15 : 0.95),
              (0.057 + energy * 0.012) * sectionGain, this.musicBus, { ratio: 3.02, index: 1.35, pan: leadPan, echo: leadIndex === 0 });
            if (leadIndex === 0 || leadIndex === 3) voice(note, length * 1.1, 0.035, "pulse", { lowpass: 1650 });
            break;
          case "finale":
            voice(note + 12, length * (bTheme ? 1.45 : 1.25), 0.091 + energy * 0.016,
              "brass", { lowpass: 2100, attack: 0.042, pan: leadPan, echo: leadIndex === 0 });
            if (climax && leadIndex % 2 === 0) voice(note, length * 1.2, 0.035, "reed", { lowpass: 1250 });
            break;
        }        if (climax && leadIndex % 2 === 0) voice(note, length * 0.85, 0.014, "triangle");
      }
    }

    // Harmonic space changes by section: held opening, clipped statement,
    // exposed breakdown, then a wider reprise.
    if (s === 0 && (section === "intro" || spare || score.texture === "vesper")) {
      for (const degree of [chord[0], chord[1], chord[2]]) {
        voice(root + degree + (score.texture === "vesper" ? 12 : 24),
          spare ? 14 : 12, spare ? 0.018 : 0.022, "hollow");
      }
    } else if (!spare && s === 0 && (score.texture === "horizon" || score.texture === "crown" || climax)) {
      for (const degree of [chord[1], chord[2], chord[3]]) {
        voice(root + degree + 24, climax ? 6 : 9, score.texture === "horizon" ? 0.018 : 0.021,
          score.texture === "crown" || score.texture === "finale" ? "brass" : "glass");
      }
    } else if (!spare && (s === 4 || s === 12) && (bTheme || score.texture === "storm" || score.texture === "aurelia")) {
      for (const degree of [chord[1], chord[2]]) {
        voice(root + degree + 24, bTheme ? 2.1 : 1.5, 0.020,
          score.texture === "storm" ? "pulse" : "reed", { lowpass: 1300 });
      }
    } else if (!spare && s === 8 && (climax || score.texture === "finale")) {
      for (const degree of [chord[2], chord[3]]) voice(root + degree + 24, 3.5, 0.018, "triangle");
    }

    if ((section === "A2" || section === "B2" || climax || (boss && phase >= 2)) && !spare) {
      const response = development.counter.find(([beat]) => beat === s);
      if (response) {
        const [_, interval, length] = response;
        const toneType = stage === 2 && !boss ? "sine" : boss && stage === 2 ? "square" : "triangle";
        voice(root + interval + (boss ? 24 : 36), length * 1.15, 0.021 + energy * 0.008,
          toneType === "square" ? "pulse" : toneType === "sine" ? "glass" : "reed",
          { lowpass: 1700 });
      }
    }
    if (wake >= 0.5 && (s === 5 || s === 13) && !spare) {
      voice(root + chord[2] + 36, 1.7, 0.012 + wake * 0.008, "sine");
    }
    if (combo > 0.45 && s === 7 && !boss && !spare) {
      voice(root + chord[3] + 36, 1, 0.012 * combo, "sine");
    }

    this.scheduleColor(score.texture, root, chord, s, bar, section, phase, energy, at);
    if (s === 0 && phraseBar === 0 && bar > 0)
      this.scheduleSectionAccent(score.texture, root, chord, section, at);

    // Three-note turnaround points into the next four-bar phrase.
    if (phraseBar === 3 && (s === 12 || s === 14 || s === 15) && section !== "intro") {
      const index = s === 12 ? 0 : s === 14 ? 1 : 2;
      voice(root + development.cadence[index] + 24, index === 2 ? 1.5 : 0.8,
        0.021 + energy * 0.006, stage === 1 ? "sine" : "triangle");
    }
    if (bar > 0 && phraseBar === 0 && s === 0) {
      // Section downbeat signals a new statement without masking combat SFX.
      voice(root + chord[2] + 24, 3.2, 0.025, "triangle");
    }
  }
  scheduleColor(texture, root, chord, s, bar, section, phase, energy, at) {
    // One restrained signature layer per location. Pitched details and stereo
    // placement change with the enemy world; kick, bass, and combat FX stay centered.
    const sectionLevel = section === "intro" ? 0.46 : section === "break" ? 0.34 :
      section === "outro" ? 0.52 : section === "finale" ? 1.12 : 0.82;
    const level = sectionLevel * (1 + energy * 0.12 + (phase - 1) * 0.06);
    const voice = (degree, length, volume, type, options = {}) =>
      this.tone(pitch(root + degree), at, length * this.beat, volume * level,
        type, this.musicBus, options);
    const moving = section !== "break" && section !== "outro";
    switch (texture) {
      case "horizon":
        if (s === 0 && bar % 2 === 0) {
          voice(chord[1] + 36, 13, 0.026, "mist", { pan: -0.33, lowpass: 800, endLowpass: 1850, hold: 0.48 });
          voice(chord[3] + 24, 13, 0.020, "glass", { pan: 0.3, lowpass: 1150, endLowpass: 2200, hold: 0.42 });
          this.swell(at, 28 * this.beat, 0.045 * level, 190, 850, bar % 4 === 0 ? -0.3 : 0.3);
        }
        if (moving && (section === "A2" || section === "B" || section === "finale") && (s === 6 || s === 14))
          voice((s === 6 ? chord[2] : chord[3]) + 48, 2.1, 0.020, "glass", { pan: s === 6 ? 0.36 : -0.36, echo: s === 14 });
        if (moving && s === 8 && bar % 2 === 1)
          this.fmTone(pitch(root + chord[2] + 48), at, 0.5, 0.034 * level,
            this.musicBus, { ratio: 2.01, index: 0.56, pan: 0.25, echo: true });
        break;
      case "storm":
        if (s === 0 && bar % 2 === 0) {
          voice(chord[1] + 24, 7, 0.022, "choir", { pan: -0.26, lowpass: 700, endLowpass: 1350, attack: 0.09, hold: 0.38 });
          this.swell(at, 27 * this.beat, 0.029 * level, 2300, 900, -0.22);
        }
        if (moving && (s === 3 || s === 7 || s === 11 || s === 15))
          voice(chord[Math.floor(s / 4)] + 36, 1.45, 0.027, "steel", { pan: s < 8 ? -0.35 : 0.35, lowpass: 1150, endLowpass: 2100 });
        if (moving && (s === 2 || s === 10))
          this.fmTone(pitch(root + chord[1] + 36), at, 0.13, 0.022 * level,
            this.musicBus, { ratio: 3.8, index: 1.5, pan: s === 2 ? 0.28 : -0.28 });
        break;
      case "crown":
        if (s === 0) {
          voice(chord[0] + 12, 10, 0.025, "brass", { pan: -0.2, lowpass: 450, endLowpass: 850, attack: 0.055, hold: 0.42 });
          if (bar % 2 === 0) this.swell(at, 26 * this.beat, 0.046 * level, 140, 420, 0.2);
        }
        if (moving && (s === 2 || s === 5 || s === 10 || s === 13))
          voice(chord[s < 8 ? 2 : 3] + 36, 1.8, 0.022, "reed", { pan: s % 2 ? -0.32 : 0.32, lowpass: 1000, endLowpass: 2050 });
        if (moving && (s === 3 || s === 11))
          this.tone(190, at, 0.16, 0.029 * level, "sine", this.musicBus, { endFrequency: 92 });
        break;
      case "vesper":
        if (s === 0) {
          voice(chord[0] + 24, 14, 0.029, "choir", { pan: -0.28, lowpass: 700, endLowpass: 1500, attack: 0.13, hold: 0.5 });
          voice(chord[2] + 24, 14, 0.024, "hollow", { pan: 0.3, lowpass: 720, endLowpass: 1200, attack: 0.15, hold: 0.5 });
          if (bar % 2 === 0) this.swell(at, 27 * this.beat, 0.055 * level, 220, 110, -0.25);
        }
        if (s === 12 && bar % 2 === 1)
          this.fmTone(pitch(root + chord[3] + 36), at, 0.42,
            0.035 * level, this.musicBus, { ratio: 2.02, index: 0.38, pan: 0.38, echo: true });
        break;
      case "aurelia":
        if (s === 0 && bar % 2 === 0) {
          voice(chord[0] + 12, 8, 0.026, "pulse", { pan: -0.2, lowpass: 540, endLowpass: 1050, hold: 0.38 });
          this.swell(at, 27 * this.beat, 0.035 * level, 700, 2200, 0.25);
        }
        if (moving && (s === 1 || s === 5 || s === 9 || s === 13))
          this.fmTone(pitch(root + chord[Math.floor(s / 4)] + 36), at,
            1.2 * this.beat, 0.031 * level, this.musicBus,
            { ratio: 3.46, index: 1.08, pan: s < 8 ? 0.37 : -0.37, echo: s === 13 });
        if (moving && (s === 3 || s === 11))
          this.fmTone(360, at, 0.11, 0.023 * level, this.musicBus,
            { ratio: 2.75, index: 0.92, pan: s === 3 ? -0.3 : 0.3 });
        break;
      case "finale":
        if (s === 0) {
          voice(chord[1] + 24, 12, 0.028, "choir", { pan: -0.34, lowpass: 850, endLowpass: 1700, attack: 0.1, hold: 0.4 });
          voice(chord[3] + 24, 12, 0.026, "brass", { pan: 0.34, lowpass: 900, endLowpass: 1900, attack: 0.09, hold: 0.42 });
          if (bar % 2 === 0) this.swell(at, 25 * this.beat, 0.058 * level, 280, 900, 0.17);
        }
        if (moving && (s === 3 || s === 7 || s === 11 || s === 15))
          voice(chord[Math.floor(s / 4)] + 48, 1.8, 0.025, "glass",
            { pan: Math.floor(s / 4) % 2 ? 0.27 : -0.27, echo: s === 15 });
        if (moving && (s === 2 || s === 6 || s === 10 || s === 14))
          this.tone(220, at, 0.14, 0.033 * level, "sine", this.musicBus, { endFrequency: 72 });
        break;
    }
  }
  scheduleSectionAccent(texture, root, chord, section, at) {
    // A different scene-change gesture marks the large form in each cue.
    // It remains on the music bus, below combat events and their ducking.
    const level = section === "break" || section === "outro" ? 0.58 : 1;
    const voice = (degree, duration, volume, type, options = {}) =>
      this.tone(pitch(root + degree), at, duration, volume * level,
        type, this.musicBus, options);
    switch (texture) {
      case "horizon":
        this.fmTone(pitch(root + chord[3] + 36), at, 0.67,
          0.054 * level, this.musicBus, { ratio: 2.01, index: 0.6, pan: 0.28, echo: true });
        break;
      case "storm":
        voice(chord[3] + 36, 0.32, 0.047, "steel", { pan: -0.34, endFrequency: pitch(root + chord[1] + 36), lowpass: 2200 });
        break;
      case "crown":
        voice(chord[0] + 12, 0.62, 0.062, "brass", { lowpass: 820, endLowpass: 1700, hold: 0.32 });
        break;
      case "vesper":
        voice(chord[0] + 12, 0.85, 0.065, "choir", { lowpass: 960, endLowpass: 540, hold: 0.5, pan: -0.2 });
        break;
      case "aurelia":
        this.fmTone(pitch(root + chord[3] + 36), at, 0.38,
          0.060 * level, this.musicBus, { ratio: 3.28, index: 1.7, pan: 0.3, echo: true });
        break;
      case "finale":
        voice(chord[0] + 12, 0.65, 0.068, "brass", { lowpass: 820, endLowpass: 1850, hold: 0.3 });
        voice(chord[2] + 24, 0.63, 0.037, "choir", { pan: 0.3, lowpass: 1250 });
        break;
    }
  }
  scheduleInterlude(game) {
    if (!this.ctx || this.muted || this.step > 27) return;
    const stage = clamp(Number(game.stage) || 1, 1, 3);
    const nextStage = stage < 3 ? stage + 1 : 1;
    const root = SCORES[nextStage].roots[0];
    const at = this.nextStep;
    const step = this.step;
    // The defeated machine falls away; a new harmonic beacon comes into view.
    if (step === 0) {
      this.tone(pitch(root - 12), at, 2.6, 0.11, "hollow", this.musicBus, { lowpass: 520, attack: 0.07 });
      this.tone(pitch(root + 7), at + 0.16, 1.7, 0.055, "glass", this.musicBus, { attack: 0.08 });
    }
    if (step === 8 || step === 16) {
      this.tone(pitch(root + (step === 8 ? 3 : 7)), at, 1.6, 0.054,
        step === 8 ? "hollow" : "reed", this.musicBus, { lowpass: 1250, attack: 0.07 });
    }
    const ascent = [10, 14, 18, 22, 25].indexOf(step);
    if (ascent >= 0) {
      this.fmTone(pitch(root + [7, 12, 15, 19, 24][ascent]), at,
        ascent === 4 ? 0.58 : 0.39, 0.055 + ascent * 0.006, this.musicBus,
        { ratio: 2.01, index: 0.42 });
    }
    if (step === 20 || step === 24) {
      this.noise(at, 0.2, step === 24 ? 0.045 : 0.026, 6200, 900, this.musicBus);
    }
  }
  update(game, dt) {
    if (!this.ready || !this.ctx) return;
    const now = this.ctx.currentTime;
    const mode = game?.mode || "title";
    const stage = clamp(Number(game?.stage) || 1, 1, 3);
    const boss = Boolean(game?.boss && game.boss.hp > 0);
    const interlude = Number(game?._transition) > 0 && !boss;
    const key = mode === "playing" ? (interlude ? "interlude" : boss ? `boss${stage}` : String(stage)) : mode;
    if (mode !== this.lastMode || key !== this.musicKey) {
      const changedDuringPlay = mode === "playing" && this.lastMode === "playing";
      this.lastMode = mode;
      this.musicKey = key;
      this.nextStep = now + (changedDuringPlay ? 0.09 : 0.05);
      this.step = 0;
      this.arrangementPhase = boss ? clamp(Number(game?.boss?.phase) || 1, 1, 3) : 1;
      if (changedDuringPlay) this.requestDuck(now, 0.08, 0.88, 0.16);
      if (SCORES[key]) this.beat = 60 / SCORES[key].bpm / 4;
      else if (interlude) this.beat = 60 / 120 / 4;
    }

    const events = Array.isArray(game?.events) ? game.events : [];
    // Resolve special cues before high-volume shot/hit streams.
    let used = 0;
    for (const event of events) {
      if (PRIORITY_EVENTS.has(event?.type) && used++ < 12) this.playEvent(event, game);
    }
    for (const event of events) {
      if (!event?.type || PRIORITY_EVENTS.has(event.type)) continue;
      if (used++ >= 34) break;
      this.playEvent(event, game);
    }

    const scoreMix = interlude ? 0.42 : DEVELOPMENT[key]?.mix ?? 0.27;
    const recovery = clamp((now - this.duckUntil) / this.duckRelease, 0, 1);
    const eased = recovery * recovery * (3 - 2 * recovery);
    const duckGain = this.duckFloor + (1 - this.duckFloor) * eased;
    if (recovery >= 1) this.duckFloor = 1;
    const target = mode === "playing" ? scoreMix * duckGain : 0;
    if (target !== this.musicTarget) {
      const dipping = this.musicTarget !== null && target < this.musicTarget;
      this.musicTarget = target;
      this.musicBus.gain.setTargetAtTime(target, now, target === 0 ? 0.035 : dipping ? 0.018 : 0.045);
    }
    if (mode !== "playing" || this.muted) return;
    if (game.player?.hp === 1 && this.canPlay("criticalPulse", 1.35)) {
      this.tone(395, now, 0.13, 0.05, "sine", this.fxBus, { endFrequency: 310 });
      this.tone(395, now + 0.19, 0.13, 0.04, "sine", this.fxBus, { endFrequency: 310 });
    }
    if (this.nextStep < now - 0.5) this.nextStep = now + 0.02;
    let scheduled = 0;
    while (this.nextStep < now + 0.14 && scheduled < 4) {
      if (interlude) this.scheduleInterlude(game);
      else this.scheduleMusic(game);
      this.step++;
      this.nextStep += this.beat;
      scheduled++;
    }
  }
}
