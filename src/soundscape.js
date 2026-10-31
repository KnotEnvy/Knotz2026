// Environmental ambience for Storm Atlas: one procedural bed per screen and sector,
// crossfaded as the flight moves on. Beds are built from a few shared noise buffers,
// filters and slow LFOs; one-shots (gulls, clanks, thunder, groans, PA bursts) are scheduled
// slightly ahead of the audio clock, and resume calmly after a frame stall instead of bursting.
//
// The engine owns the ambience bus it hands us: its level, mute and the pause filter.
// Nodes are created only when a bed starts or a one-shot fires, never per frame.
import { CAMPAIGN_STAGES } from './game.js';
import { lightningAt } from './timeline.js';

const FADE = 2.4;          // seconds for a bed crossfade to settle (time constant FADE / 3)
const LOOKAHEAD = 0.3;     // one-shot scheduling horizon, seconds
const RETIRE_AFTER = 7;    // a faded bed releases its nodes this long after it goes quiet
const INTERLUDE = 3.5;     // sector-clear transition length (timeline.INTERLUDE_LENGTH)
const DRONE_ROOT = 36.71;  // D1: the Crown drone and flagship pressure sit on D
const PRESSURE_BY_PHASE = [0, 0.55, 0.78, 1];
// Buffers are generated one per frame (about 1-10 ms each) so starting audio never hitches.
// The reverb is split: build its impulse on one frame, hand it to the convolver on the next.
const WARMUP = ['pink', 'brown', 'white', 'irBuild', 'irLoad', 'patter'];
const REVERB_SECONDS = 2;
const NEEDS_PATTER = new Set(['sector2', 'sector4', 'endDefeat']);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Which bed a state calls for.
function bedFor(s) {
  const screen = s.screen, mode = s.mode;
  if (screen === 'title') return 'title';
  if (screen === 'hangar') return 'hangar';
  const ended = mode === 'victory' || mode === 'gameover';
  if (screen === 'end' || (!screen && ended)) {
    const outcome = s.outcome || (mode === 'victory' ? 'victory' : 'gameover');
    return outcome === 'victory' ? 'endVictory' : 'endDefeat';
  }
  if (screen === 'play' || screen === 'pause' || mode === 'playing' || mode === 'paused') {
    return 'sector' + clamp(Math.round(Number(s.stage) || 1), 1, CAMPAIGN_STAGES);
  }
  return 'title';
}
const inFlight = s => (s.screen === 'play' || s.screen === 'pause' || (!s.screen && (s.mode === 'playing' || s.mode === 'paused')));

// A looping buffer whose overrun is crossfaded into its start, so the loop point is seamless.
// Low-frequency material is generated at a reduced rate; the source node resamples it.
function loopBuffer(ctx, seconds, channels, fill, rate = ctx.sampleRate) {
  const n = Math.max(8, Math.floor(seconds * rate));
  const x = Math.max(1, Math.min(Math.floor(rate * 0.3), Math.floor(n / 4)));
  const buffer = ctx.createBuffer(channels, n, rate);
  for (let ch = 0; ch < channels; ch++) {
    const raw = new Float32Array(n + x);
    fill(raw, ch, rate);
    const out = buffer.getChannelData(ch);
    for (let i = 0; i < n; i++) out[i] = raw[i];
    for (let i = 0; i < x; i++) {
      const k = (i / x) * Math.PI / 2;
      out[i] = raw[i] * Math.sin(k) + raw[n + i] * Math.cos(k);
    }
  }
  return buffer;
}
// Remove DC and set a common RMS so layer gains mean the same thing for every colour of noise.
function normalise(data, rms = 0.3) {
  let mean = 0;
  for (let i = 0; i < data.length; i++) mean += data[i];
  mean /= data.length || 1;
  let power = 0;
  for (let i = 0; i < data.length; i++) { data[i] -= mean; power += data[i] * data[i]; }
  const scale = rms / Math.sqrt(power / (data.length || 1) || 1);
  for (let i = 0; i < data.length; i++) data[i] *= scale;
}

class Bed {
  constructor(scape, name) {
    const ctx = scape.ctx;
    this.scape = scape; this.name = name; this.active = true; this.retireAt = Infinity;
    this.fadeUntil = 0; this.level = -1; this.modulate = null;
    this.gain = ctx.createGain(); this.gain.gain.value = 0; this.gain.connect(scape.master);
    this.send = ctx.createGain(); this.send.gain.value = 0; this.send.connect(scape.reverb);
    this.sources = []; this.nodes = [this.gain, this.send]; this.events = [];
  }
  fade(level, now, tc) {
    if (Math.abs(level - this.level) < 0.005) return;
    this.level = level;
    this.gain.gain.setTargetAtTime(level, now, tc);
    this.send.gain.setTargetAtTime(level, now, tc);
  }
  // Schedule fn(at, state) every min..max seconds; the first call lands in first[0]..first[1].
  every(min, max, fn, first = [min * 0.3, min]) {
    const sc = this.scape;
    this.events.push({ min, max, fn, next: sc.now + sc.between(first[0], first[1]) });
  }
  tick(now, state) {
    const sc = this.scape;
    for (const ev of this.events) {
      let guard = 0;
      while (ev.next <= now + LOOKAHEAD && guard++ < 3) {
        // After a long stall (manual open, tab hidden) pick up gently instead of firing a backlog.
        if (ev.next < now - 1) { ev.next = now + sc.between(ev.min * 0.25, ev.min * 0.8); continue; }
        ev.fn(Math.max(ev.next, now + 0.02), state);
        ev.next += sc.between(ev.min, ev.max);
      }
    }
    if (this.modulate) this.modulate(state, now);
  }
  dispose(now) {
    for (const s of this.sources) { try { s.stop(now + 0.05); } catch (_) {} }
    for (const n of this.nodes) { try { n.disconnect(); } catch (_) {} }
    this.sources = []; this.nodes = []; this.events = [];
  }
}

export class Soundscape {
  // ctx: AudioContext; out: GainNode (ambience bus). options.seed makes renders repeatable.
  constructor(ctx, out, options = {}) {
    this.ctx = ctx; this.out = out;
    this.r = seeded(Number.isFinite(options.seed) ? options.seed : Math.floor(Math.random() * 2 ** 32));
    this.ready = false; this.failed = false; this.stopped = false; this.error = null;
    this.now = 0; this.beds = []; this.current = null; this.currentName = '';
    this.pressure = null; this.lastStrike = -1; this.interludeOn = false;
    this.buffers = {}; this.targets = new WeakMap(); this.warmup = WARMUP.slice();
  }

  // Called every frame on every screen with the shared audio state (see audio.js buildState).
  update(state, now) {
    if (this.stopped || this.failed || !this.ctx) return;
    try {
      const s = state || {};
      const t = Number.isFinite(now) ? now : this.ctx.currentTime;
      if (!this.ready) this._init();
      this.now = t;
      const name = bedFor(s);
      if (this.warmup.length) {
        const job = this.warmup.shift();
        if (job === 'irBuild') this.impulse = this._impulse(REVERB_SECONDS);
        else if (job === 'irLoad') { this.reverb.buffer = this.impulse; this.impulse = null; }
        else this._buffer(job);
        // Hold the first bed until its noise is ready; it then fades in normally.
        const waiting = this.warmup.some(j => !j.startsWith('ir') && (j !== 'patter' || NEEDS_PATTER.has(name)));
        if (!this.current && waiting) return;
      }
      if (name !== this.currentName) this._switch(name, t);
      const bed = this.current;
      bed.fade(this._bedLevel(s), t, t < bed.fadeUntil ? FADE / 3 : 0.8);
      bed.tick(t, s);
      this._weather(s, t);
      this._pressure(s, t);
      this._interlude(s, t);
      this._retire(t);
    } catch (error) {
      // A broken ambience must never take the rest of the audio down with it.
      this.failed = true; this.error = error;
      try { this.master?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2); } catch (_) {}
    }
  }

  // Fade out and release all nodes.
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    try { this.master.gain.setTargetAtTime(0, now, 0.12); } catch (_) {}
    const beds = this.beds.slice();
    this.beds = []; this.current = null; this.pressure = null;
    // Let the fade finish, then release everything once the last tail has stopped.
    const end = this.ctx.createBufferSource();
    end.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
    end.onended = () => {
      for (const bed of beds) bed.dispose(this.ctx.currentTime);
      for (const node of [this.reverb, this.reverbOut, this.master, this.subCut]) { try { node.disconnect(); } catch (_) {} }
    };
    end.connect(this.master);
    end.start(now + 0.7);
  }

  // ---------------------------------------------------------------- infrastructure
  _init() {
    const ctx = this.ctx;
    // A gentle 28 Hz high-pass keeps sub-rumble from eating headroom the score and effects need.
    this.master = ctx.createGain(); this.master.gain.value = 1;
    this.subCut = this._filter('highpass', 28, 0.6);
    this.master.connect(this.subCut); this.subCut.connect(this.out);
    this.reverb = ctx.createConvolver();
    this.reverbOut = ctx.createGain(); this.reverbOut.gain.value = 0.6;
    this.reverb.connect(this.reverbOut); this.reverbOut.connect(this.master);
    this.ready = true;
  }
  between(a, b) { return a + (b - a) * this.r(); }
  _buffer(name) {
    if (this.buffers[name]) return this.buffers[name];
    const ctx = this.ctx, r = this.r;
    let buffer;
    if (name === 'white') {
      buffer = loopBuffer(ctx, 5.3, 2, d => { for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; normalise(d); }, Math.min(ctx.sampleRate, 32000));
    } else if (name === 'pink') {
      buffer = loopBuffer(ctx, 7.1, 2, d => {
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < d.length; i++) {
          const w = r() * 2 - 1;
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
        }
        normalise(d);
      }, Math.min(ctx.sampleRate, 24000));
    } else if (name === 'brown') {
      buffer = loopBuffer(ctx, 8.9, 2, d => {
        let b = 0;
        for (let i = 0; i < d.length; i++) { b = (b + 0.06 * (r() * 2 - 1)) / 1.06; d[i] = b; }
        normalise(d);
      }, Math.min(ctx.sampleRate, 12000));
    } else if (name === 'patter') {
      // Rain on the canopy: sparse drops, most tiny, a few heavy.
      buffer = loopBuffer(ctx, 4.7, 2, (d, ch, rate) => {
        const drops = Math.floor(d.length / rate * 140);
        for (let k = 0; k < drops; k++) {
          const at = Math.floor(r() * d.length), amp = Math.pow(r(), 3) * (r() < 0.5 ? 1 : -1);
          const len = Math.floor(rate * (0.0012 + r() * 0.004)), ring = 2200 + r() * 5200;
          for (let i = 0; i < len; i++) {
            const t = i / rate, idx = (at + i) % d.length;
            d[idx] += amp * Math.exp(-i / len * 5) * (Math.sin(t * ring * 6.283) * 0.6 + (r() * 2 - 1) * 0.4);
          }
        }
        normalise(d, 0.12);
      }, Math.min(ctx.sampleRate, 24000));
    }
    this.buffers[name] = buffer;
    return buffer;
  }
  // Stereo hall: decorrelated decaying noise that darkens as it fades.
  _impulse(seconds) {
    const ctx = this.ctx, rate = ctx.sampleRate, n = Math.max(8, Math.floor(seconds * rate));
    const buffer = ctx.createBuffer(2, n, rate), pre = Math.floor(0.021 * rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buffer.getChannelData(ch);
      const decayStep = Math.exp(-6.9 / seconds / rate), brightStep = Math.exp(-2.2 / rate), onset = Math.floor(0.08 * rate);
      let lp = 0, decay = 1, bright = 1;
      for (let i = pre; i < n; i++) {
        lp += (this.r() * 2 - 1 - lp) * (0.18 + 0.75 * bright);
        d[i] = lp * decay * (i - pre < onset ? 0.6 + 0.4 * (i - pre) / onset : 1);
        decay *= decayStep; bright *= brightStep;
      }
    }
    return buffer;
  }
  _gain(value) { const g = this.ctx.createGain(); g.gain.value = value; return g; }
  _filter(type, frequency, q = 0.707) {
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = frequency; f.Q.value = q; return f;
  }
  _panner(pan) {
    if (typeof this.ctx.createStereoPanner !== 'function') return this._gain(1);
    const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); return p;
  }
  _chain(nodes) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; }
  // Smooth a parameter toward a value, writing automation only when the target changes.
  _target(param, value, now, tc) {
    const last = this.targets.get(param);
    if (last !== undefined && Math.abs(last - value) < 1e-4) return;
    this.targets.set(param, value);
    param.setTargetAtTime(value, now, tc);
  }
  _loop(bed, name, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this._buffer(name); s.loop = true; s.playbackRate.value = rate;
    s.start(this.now, this.r() * s.buffer.duration);
    bed.sources.push(s);
    return s;
  }
  _lfo(bed, param, rate, depth, type = 'sine') {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = rate;
    const g = this._gain(depth);
    o.connect(g); g.connect(param); o.start(this.now);
    bed.sources.push(o); bed.nodes.push(g);
    return o;
  }
  _keep(bed, ...nodes) { bed.nodes.push(...nodes); }
  // A one-shot destination: panned into the bed, with a reverb send.
  _spot(bed, pan, send) {
    const p = this._panner(pan), sg = this._gain(send);
    p.connect(bed.gain); p.connect(sg); sg.connect(bed.send);
    return { input: p, nodes: [p, sg] };
  }
  _release(source, nodes) {
    source.onended = () => { for (const n of nodes) { try { n.disconnect(); } catch (_) {} } };
  }
  // A one-shot noise source. It loops (seamlessly) so long tails never hit the end of the buffer.
  _burst(name, at, dur, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this._buffer(name); s.loop = true; s.playbackRate.value = rate;
    s.start(at, this.r() * s.buffer.duration); s.stop(at + dur + 0.05);
    return s;
  }

  // ---------------------------------------------------------------- bed switching
  _switch(name, now) {
    if (this.current) {
      this.current.active = false;
      this.current.fade(0, now, FADE / 3);
      this.current.retireAt = now + FADE + RETIRE_AFTER;
    }
    let bed = this.beds.find(b => b.name === name && !b.active);
    if (bed) { bed.active = true; bed.retireAt = Infinity; }
    else { bed = this._build(name); this.beds.push(bed); }
    bed.fadeUntil = now + FADE;
    this.current = bed; this.currentName = name;
  }
  _bedLevel(s) {
    let level = 1;
    if (inFlight(s)) {
      // Sit under combat: thin out as the screen fills, and give flagships the floor.
      level *= 1 - 0.32 * clamp(Number(s.intensity) || 0, 0, 1);
      if (s.boss) level *= 0.82;
    }
    return Math.round(level * 50) / 50;
  }
  _retire(now) {
    for (let i = this.beds.length - 1; i >= 0; i--) {
      const bed = this.beds[i];
      if (bed.active || bed.retireAt > now) continue;
      bed.dispose(now);
      this.beds.splice(i, 1);
      if (bed === this.pressure) this.pressure = null;
    }
  }

  _build(name) {
    const bed = new Bed(this, name);
    if (name === 'title') this._title(bed);
    else if (name === 'hangar') this._hangar(bed);
    else if (name === 'sector1') this._shallows(bed);
    else if (name === 'sector2') this._stormWall(bed);
    else if (name === 'sector3') this._crown(bed);
    else if (name === 'sector4') this._typhoon(bed);
    else if (name === 'sector5') this._skyforge(bed);
    else if (name === 'sector6') this._meridian(bed);
    else if (/^sector\d+$/.test(name)) this._meridian(bed); // later sectors borrow the latest bed until scored
    else if (name === 'endVictory') this._calm(bed);
    else if (name === 'endDefeat') this._storm(bed);
    else if (name === 'pressure') this._pressureBed(bed);
    return bed;
  }

  // ---------------------------------------------------------------- beds
  _title(bed) {
    // Dawn over open ocean from the carrier's island: wind, swell, gulls, a deck at work far below.
    this._wind(bed, { level: 0.1, freq: 480, q: 0.8, gust: [2.5, 6.5], depth: 0.6, low: 0.05, whistle: 0.01, whistleFreq: 1150 });
    this._sea(bed, { level: 0.17, cutoff: 560, hiss: 0.09, every: [5.5, 9.5], width: 0.6 });
    bed.every(5, 13, at => this._gull(bed, at, this.between(0.35, 0.85)), [1.5, 4]);
    bed.every(3, 8.5, at => this._clank(bed, at, { distance: this.between(0.82, 0.95), pitch: this.between(240, 420) }), [2, 5]);
    bed.every(22, 40, at => this._runUp(bed, at, this.between(0.82, 0.95)), [7, 12]);
    bed.every(35, 70, at => this._whistle(bed, at), [16, 26]);
  }
  _hangar(bed) {
    // A cavernous hangar deck: room tone, ventilation, mains hum, machinery and a muffled PA.
    const roomLp = this._filter('lowpass', 150), room = this._gain(0.1);
    this._chain([this._loop(bed, 'brown', 0.9), roomLp, room, bed.gain]);
    const vent = this._filter('bandpass', 340, 0.6), ventAmp = this._gain(0.035);
    this._chain([this._loop(bed, 'pink'), vent, ventAmp, bed.gain]);
    this._lfo(bed, ventAmp.gain, 0.037, 0.01); this._lfo(bed, vent.frequency, 0.021, 60);
    const hum = this._gain(1), humLp = this._filter('lowpass', 400);
    this._chain([hum, humLp, bed.gain]);
    for (const [f, a] of [[60, 0.0035], [120, 0.002], [180, 0.0012], [240, 0.0005]]) {
      const o = this.ctx.createOscillator(); o.frequency.value = f + this.between(-0.15, 0.15);
      const g = this._gain(a); o.connect(g); g.connect(hum); o.start(this.now);
      bed.sources.push(o); this._keep(bed, g);
    }
    this._lfo(bed, hum.gain, 0.11, 0.25);
    this._keep(bed, roomLp, room, hum, humLp, vent, ventAmp);
    bed.every(2.2, 6.5, at => this._clank(bed, at, { distance: this.between(0.45, 0.85), pitch: this.between(150, 330), heavy: this.r() < 0.4, send: 0.85, level: 0.16 }), [0.8, 2.5]);
    bed.every(11, 24, at => this._hoist(bed, at), [4, 9]);
    bed.every(8, 17, at => this._hydraulic(bed, at), [3, 7]);
    bed.every(13, 26, at => this._pa(bed, at), [4, 7]);
    bed.every(18, 34, at => this._motor(bed, at), [6, 12]);
  }
  _shallows(bed) {
    // Sector 01: soft canopy air, reef swell far below, the odd gull.
    const rush = this._rush(bed, { level: 0.075, cut: 2200 });
    this._sea(bed, { level: 0.075, cutoff: 380, hiss: 0.025, every: [6, 10], width: 0.5 });
    this._wind(bed, { level: 0.045, freq: 650, q: 0.7, gust: [3, 7], depth: 0.5, low: 0.02 });
    bed.every(12, 26, at => this._gull(bed, at, this.between(0.55, 0.9)), [4, 9]);
    this._flightModulation(bed, rush, 0.075);
  }
  _stormWall(bed) {
    // Sector 02: rain on the canopy, gusting gale, foundry booms; thunder follows lightningAt().
    const rush = this._rush(bed, { level: 0.065, cut: 1900 });
    this._rain(bed, { level: 0.16, patter: 0.06 });
    this._wind(bed, { level: 0.13, freq: 420, q: 0.9, gust: [1.6, 4.5], depth: 0.9, low: 0.07, whistle: 0.028, whistleFreq: 880 });
    bed.every(9, 20, at => this._thud(bed, at, this.between(0.6, 0.9)), [5, 10]);
    this._flightModulation(bed, rush, 0.065);
  }
  _crown(bed) {
    // Sector 03: the maelstrom. A D drone, a circling roar, hull groans and rare red thunder.
    const rush = this._rush(bed, { level: 0.055, cut: 1700 });
    this._drone(bed, { level: 0.1 });
    this._roar(bed, { level: 0.11, swirl: 0.05 });
    this._wind(bed, { level: 0.04, freq: 300, q: 1.2, gust: [4, 9], depth: 0.6, low: 0.03 });
    bed.every(6, 13, at => this._groan(bed, at, this.between(0.4, 0.85)), [3, 6]);
    this._flightModulation(bed, rush, 0.055);
  }
  _typhoon(bed) {
    const rush = this._rush(bed, { level: 0.055, cut: 1500 });
    this._wind(bed, { level: 0.18, freq: 360, q: 1.1, gust: [1.2, 3.2], depth: 0.95, low: 0.085, whistle: 0.04, whistleFreq: 760 });
    this._rain(bed, { level: 0.18, patter: 0.095 });
    this._sea(bed, { level: 0.19, cutoff: 240, hiss: 0.035, every: [3.5, 6], width: 0.85 });
    bed.every(9, 17, at => this._shipHorn(bed, at), [2, 4]);
    bed.every(3, 6, at => this._clank(bed, at, { distance: 0.8, pitch: this.between(130, 230), level: 0.08, heavy: true }), [1, 2]);
    this._flightModulation(bed, rush, 0.055);
  }
  _skyforge(bed) {
    // Sector 05: dusk above the typhoon. Thin, bright air instead of rain; a far formation of
    // piston engines beating against each other; factory platforms clanking out across the sky,
    // their knocks thrown back off the cloud floor; thunder trapped in the cloud sea below.
    const rush = this._rush(bed, { level: 0.05, cut: 3200 });
    this._wind(bed, { level: 0.21, freq: 1250, q: 1.4, gust: [2.4, 6], depth: 0.75, low: 0.018, whistle: 0.055, whistleFreq: 2350 });
    this._wind(bed, { level: 0.08, freq: 3400, q: 2.2, gust: [3.5, 8], depth: 0.6 });
    this._engines(bed, { level: 0.05 });
    bed.every(13, 24, at => this._flyover(bed, at), [4, 8]);
    bed.every(4.5, 10, at => this._foundryClank(bed, at), [1.5, 3.5]);
    bed.every(17, 33, at => this._vent(bed, at), [8, 14]);
    this._flightModulation(bed, rush, 0.042);
  }
  _meridian(bed) {
    // Sector 06: the edge of space at eclipse. Near silence: thin canopy air, a high solar-wind
    // hiss drifting across the field, faint radio static, and an aurora shimmer (D and A, very
    // high and soft) that swells once per bar of the score (state.barPhase). No thunder:
    // lightningAt(t, 6) has no strikes.
    const rush = this._rush(bed, { level: 0.045, cut: 2600 });
    const hissHp = this._filter('highpass', 3800, 0.6), hissBand = this._filter('bandpass', 7200, 0.9), hiss = this._gain(0.034), hissPan = this._panner(0);
    this._chain([this._loop(bed, 'white', this.between(0.97, 1.03)), hissHp, hissBand, hiss, hissPan, bed.gain]);
    this._lfo(bed, hissBand.frequency, 0.029, 1700);
    this._lfo(bed, hiss.gain, 0.047, 0.012);
    if (hissPan.pan) this._lfo(bed, hissPan.pan, 0.019, 0.6);
    // A constant bed of static, barely there, band-limited like a far receiver.
    const staticBand = this._filter('bandpass', 2300, 1.6), staticAmp = this._gain(0.007);
    this._chain([this._loop(bed, 'white', 0.71), staticBand, staticAmp, bed.gain]);
    this._lfo(bed, staticAmp.gain, 0.13, 0.003);
    this._keep(bed, hissHp, hissBand, hiss, hissPan, staticBand, staticAmp);
    // The aurora: a soft cluster on D6, A6 and E7 with slow chorus; each bar it swells and settles.
    const shimmer = this._gain(0), shimmerLp = this._filter('lowpass', 5200, 0.5), shimmerSend = this._gain(0.9);
    shimmer.connect(shimmerLp); shimmerLp.connect(bed.gain); shimmerLp.connect(shimmerSend); shimmerSend.connect(bed.send);
    for (const [f, a, pan] of [[1174.66, 0.5, -0.4], [1176.1, 0.35, 0.4], [1760, 0.32, 0.25], [2637, 0.12, -0.2]]) {
      const osc = this.ctx.createOscillator(); osc.frequency.value = f;
      const g = this._gain(a), p = this._panner(pan); osc.connect(g); g.connect(p); p.connect(shimmer); osc.start(this.now);
      bed.sources.push(osc); this._keep(bed, g, p);
      this._lfo(bed, osc.frequency, this.between(0.11, 0.2), f * 0.0012);
    }
    this._keep(bed, shimmer, shimmerLp, shimmerSend);
    bed.every(3, 8.5, at => this._radio(bed, at), [1.5, 4]);
    bed.every(14, 30, at => this._heterodyne(bed, at), [6, 12]);
    this._flightModulation(bed, rush, 0.045);
    const air = bed.modulate;
    let last = -1;
    bed.modulate = (s, now) => {
      air(s, now);
      const phase = Number.isFinite(s.barPhase) ? s.barPhase : -1, bar = Number(s.barLength) > 0 ? s.barLength : 240 / 140;
      // Swell on each downbeat (the phase wraps), settle across the bar.
      if (phase >= 0 && phase < last - 0.5) {
        const peak = s.mode === 'gameover' ? 0 : 0.017, floor = 0.004;
        shimmer.gain.cancelScheduledValues?.(now);
        shimmer.gain.setTargetAtTime(peak, now, 0.12);
        shimmer.gain.setTargetAtTime(floor, now + bar * 0.3, bar * 0.22);
      }
      if (phase >= 0) last = phase;
    };
  }
  _radio(bed, at) {
    // Faint radio static: a short band-limited crackle burst, chopped by a fast syllable-like gate.
    const dur = this.between(0.25, 0.9), noise = this._burst('white', at, dur + 0.1);
    const band = this._filter('bandpass', this.between(1600, 3200), this.between(2, 4)), am = this._gain(0.5), env = this._gain(0);
    const chop = this.ctx.createOscillator(); chop.type = 'square'; chop.frequency.value = this.between(9, 26);
    const depth = this._gain(0.45); chop.connect(depth); depth.connect(am.gain);
    env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(1, at + 0.03);
    env.gain.setValueAtTime(1, at + dur * 0.7); env.gain.linearRampToValueAtTime(0, at + dur);
    const spot = this._spot(bed, this.between(-0.6, 0.6), 0.5), out = this._gain(0.02);
    this._chain([noise, band, am, env, out, spot.input]);
    chop.start(at); chop.stop(at + dur + 0.05);
    this._release(noise, [noise, band, am, env, chop, depth, out, ...spot.nodes]);
  }
  _heterodyne(bed, at) {
    // A distant carrier drifting through the band: a thin whistle that slides and fades.
    const dur = this.between(2.5, 4.5), f = this.between(700, 1300);
    const osc = this.ctx.createOscillator(), env = this._gain(0), out = this._gain(0.0045);
    osc.frequency.setValueAtTime(f, at); osc.frequency.linearRampToValueAtTime(f * this.between(1.15, 1.5), at + dur);
    env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(1, at + dur * 0.4); env.gain.linearRampToValueAtTime(0, at + dur);
    const spot = this._spot(bed, this.between(-0.7, 0.7), 0.7);
    this._chain([osc, env, out, spot.input]);
    osc.start(at); osc.stop(at + dur + 0.05);
    this._release(osc, [osc, env, out, ...spot.nodes]);
  }
  _engines(bed, o) {
    // Distant multi-engine drone: four radial engines per side, a few cents apart, so the
    // formation throbs slowly. Mostly below 300 Hz and low-passed, it sits under the score.
    const lp = this._filter('lowpass', 320, 0.7), amp = this._gain(o.level);
    for (const [base, pan] of [[61.7, -0.5], [74.3, 0.45]]) {
      const panner = this._panner(pan);
      for (let k = 0; k < 4; k++) {
        const osc = this.ctx.createOscillator(); osc.type = k % 2 ? 'triangle' : 'sawtooth';
        osc.frequency.value = base * (1 + k * 0.0045) + this.between(-0.1, 0.1);
        const g = this._gain(k % 2 ? 0.22 : 0.12); osc.connect(g); g.connect(panner); osc.start(this.now);
        bed.sources.push(osc); this._keep(bed, g);
      }
      panner.connect(lp); this._keep(bed, panner);
    }
    // Prop wash: a band of noise that breathes with the engines.
    const wash = this._filter('bandpass', 210, 1.4), washAmp = this._gain(o.level * 0.7);
    this._chain([this._loop(bed, 'brown', 1.3), wash, washAmp, lp]);
    this._chain([lp, amp, bed.gain]);
    this._lfo(bed, amp.gain, 0.051, o.level * 0.4);
    this._lfo(bed, lp.frequency, 0.033, 70);
    this._keep(bed, lp, amp, wash, washAmp);
  }
  _flyover(bed, at) {
    // A distant formation crossing high above: engines swell, pan across and drop a few cents
    // as they pass (Doppler), then thin out into the wind.
    const dur = this.between(7, 10), side = this.r() < 0.5 ? -1 : 1, base = this.between(78, 96);
    const pan = this._panner(side * 0.75), send = this._gain(0.4), env = this._gain(0), lp = this._filter('lowpass', 520, 0.8), out = this._gain(0.034);
    if (pan.pan) { pan.pan.setValueAtTime(side * 0.8, at); pan.pan.linearRampToValueAtTime(-side * 0.8, at + dur); }
    env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(1, at + dur * 0.5); env.gain.linearRampToValueAtTime(0, at + dur);
    lp.frequency.setValueAtTime(300, at); lp.frequency.linearRampToValueAtTime(700, at + dur * 0.5); lp.frequency.linearRampToValueAtTime(260, at + dur);
    this._chain([env, lp, out, pan]); pan.connect(bed.gain); pan.connect(send); send.connect(bed.send);
    const nodes = [env, lp, out, pan, send];
    let last = null;
    for (let k = 0; k < 3; k++) {
      const osc = this.ctx.createOscillator(); osc.type = 'sawtooth';
      const f = base * (1 + k * 0.006);
      osc.frequency.setValueAtTime(f * 1.03, at); osc.frequency.linearRampToValueAtTime(f * 1.02, at + dur * 0.4);
      osc.frequency.linearRampToValueAtTime(f * 0.96, at + dur * 0.62); osc.frequency.linearRampToValueAtTime(f * 0.95, at + dur);
      const g = this._gain(0.3); osc.connect(g); g.connect(env); osc.start(at); osc.stop(at + dur + 0.05);
      nodes.push(osc, g); last = osc;
    }
    const air = this._burst('pink', at, dur), band = this._filter('bandpass', 900, 1.2), ag = this._gain(0.5);
    this._chain([air, band, ag, env]); nodes.push(air, band, ag);
    this._release(last, nodes);
  }
  _foundryClank(bed, at) {
    // Factory platforms at work far off: a metal knock (sometimes a pair, a press stroke) and a
    // softer copy thrown back off the cloud floor a third of a second later.
    const distance = this.between(0.78, 0.93), pitch = this.between(150, 300), heavy = this.r() < 0.45;
    this._clank(bed, at, { distance, pitch, heavy, level: 0.14, send: 0.75 });
    if (this.r() < 0.4) this._clank(bed, at + this.between(0.16, 0.24), { distance, pitch: pitch * 1.19, level: 0.1, send: 0.75 });
    const echo = this.between(0.3, 0.42);
    this._clank(bed, at + echo, { distance: Math.min(0.97, distance + 0.08), pitch: pitch * 0.995, heavy, level: 0.065, send: 0.95 });
  }
  _vent(bed, at) {
    // A foundry vents steam: a pneumatic hiss that swells and dies, far away.
    const dur = this.between(1.4, 2.6), noise = this._burst('white', at, dur + 0.3);
    const band = this._filter('bandpass', this.between(2600, 3800), 1.6), env = this._gain(0), lp = this._filter('lowpass', 5200);
    env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(1, at + 0.12); env.gain.setTargetAtTime(0, at + dur * 0.4, dur / 4);
    const spot = this._spot(bed, this.between(-0.8, 0.8), 0.7), out = this._gain(0.016);
    this._chain([noise, band, env, lp, out, spot.input]);
    this._release(noise, [noise, band, env, lp, out, ...spot.nodes]);
  }
  _shipHorn(bed, at) {
    const spot = this._spot(bed, this.between(-0.65, 0.65), 0.65);
    const lp = this._filter('lowpass', 480), amp = this._gain(0);
    amp.gain.setValueAtTime(0, at); amp.gain.linearRampToValueAtTime(0.025, at + 0.5);
    amp.gain.setTargetAtTime(0, at + 1.6, 0.35);
    lp.connect(amp); amp.connect(spot.input);
    const nodes = [lp, amp, ...spot.nodes];
    for (const f of [73.42, 110.2]) {
      const osc = this.ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = f;
      osc.connect(lp); osc.start(at); osc.stop(at + 3.4); nodes.push(osc);
    }
    this._release(nodes[nodes.length - 1], nodes);
  }
  _calm(bed) {
    // Victory: calm sea at sunrise, light wind, gulls, a buoy bell far off.
    this._sea(bed, { level: 0.17, cutoff: 600, hiss: 0.08, every: [6, 10], width: 0.65 });
    this._wind(bed, { level: 0.05, freq: 520, q: 0.7, gust: [4, 8], depth: 0.4, low: 0.02 });
    bed.every(4, 10, at => this._gull(bed, at, this.between(0.25, 0.8)), [1, 3]);
    bed.every(16, 32, at => this._bell(bed, at), [5, 9]);
  }
  _storm(bed) {
    // Defeat: night storm over rough water, rain and thunder.
    this._rain(bed, { level: 0.11, patter: 0.02 });
    this._wind(bed, { level: 0.12, freq: 400, q: 0.9, gust: [1.8, 5], depth: 0.9, low: 0.07, whistle: 0.024, whistleFreq: 820 });
    this._sea(bed, { level: 0.12, cutoff: 320, hiss: 0.05, every: [4, 7], width: 0.6 });
    bed.every(5, 12, at => this._thunder(bed, at, { distance: this.between(0.25, 0.9), pan: this.between(-0.7, 0.7) }), [1.5, 3.5]);
  }
  _pressureBed(bed) {
    // Flagship pressure: a sub swell that pulses faster with each phase. Mostly unpitched so it
    // never fights the score; a faint D1 underneath ties it to the Crown drone.
    const lp = this._filter('lowpass', 105, 0.9), trem = this._gain(0.65), amp = this._gain(0.16);
    this._chain([this._loop(bed, 'brown', 0.8), lp, trem, amp, bed.gain]);
    const sub = this.ctx.createOscillator(); sub.frequency.value = DRONE_ROOT;
    const subAmp = this._gain(0.035); sub.connect(subAmp); subAmp.connect(trem); sub.start(this.now);
    bed.sources.push(sub);
    const air = this._filter('bandpass', 3100, 5), airAmp = this._gain(0.004);
    this._chain([this._loop(bed, 'pink'), air, airAmp, bed.gain]);
    const tremolo = this._lfo(bed, trem.gain, 0.6, 0.35);
    this._lfo(bed, air.frequency, 0.07, 700);
    this._keep(bed, lp, trem, amp, subAmp, air, airAmp);
    bed.modulate = (s, now) => {
      const phase = clamp(Math.round(Number(s.bossPhase) || 1), 1, 3);
      this._target(tremolo.frequency, s.boss ? [0, 0.6, 1.1, 1.8][phase] : 0.45, now, 1.2);
      this._target(lp.frequency, s.boss ? 95 + phase * 20 : 90, now, 1.5);
    };
  }

  // ---------------------------------------------------------------- continuous layers
  _wind(bed, o) {
    const src = this._loop(bed, 'pink', this.between(0.95, 1.05));
    const band = this._filter('bandpass', o.freq, o.q), amp = this._gain(o.level * 0.6);
    this._chain([src, band, amp, bed.gain]);
    this._lfo(bed, band.frequency, this.between(0.025, 0.045), o.freq * 0.22);
    this._keep(bed, band, amp);
    let low = null, whistle = null, whistleBand = null;
    if (o.low) {
      const lp = this._filter('lowpass', 150); low = this._gain(o.low * 0.6);
      this._chain([this._loop(bed, 'brown'), lp, low, bed.gain]); this._keep(bed, lp, low);
    }
    if (o.whistle) {
      whistleBand = this._filter('bandpass', o.whistleFreq, 9); whistle = this._gain(o.whistle * 0.3);
      this._chain([src, whistleBand, whistle, bed.gain]); this._keep(bed, whistleBand, whistle);
      this._lfo(bed, whistleBand.frequency, 0.053, o.whistleFreq * 0.12);
    }
    bed.every(o.gust[0], o.gust[1], at => {
      const strength = this.r(), tc = this.between(0.5, 1.6);
      amp.gain.setTargetAtTime(o.level * (0.35 + o.depth * strength * 1.25), at, tc);
      band.frequency.setTargetAtTime(o.freq * (0.75 + 0.7 * strength), at, tc * 1.3);
      if (low) low.gain.setTargetAtTime(o.low * (0.35 + strength), at, tc);
      if (whistle) {
        whistle.gain.setTargetAtTime(o.whistle * (0.15 + strength * strength * 1.4), at, tc * 1.2);
        whistleBand.frequency.setTargetAtTime(o.whistleFreq * (0.85 + 0.35 * strength), at, tc * 1.5);
      }
    }, [0.1, 0.8]);
  }
  _sea(bed, o) {
    for (const side of [-1, 1]) {
      const lp = this._filter('lowpass', o.cutoff, 0.6), body = this._gain(o.level * 0.4);
      const band = this._filter('bandpass', 2600, 0.6), hiss = this._gain(o.hiss * 0.2);
      const pan = this._panner(side * o.width);
      this._chain([this._loop(bed, 'brown', this.between(0.9, 1.1)), lp, body, pan]);
      this._chain([this._loop(bed, 'white'), band, hiss, pan]);
      pan.connect(bed.gain);
      this._keep(bed, lp, body, band, hiss, pan);
      // Each side breaks on its own clock, so the swell never pulses in lockstep.
      bed.every(o.every[0], o.every[1], at => {
        const rise = this.between(1.5, 2.8), fall = this.between(2.5, 4), peak = this.between(0.7, 1.3);
        body.gain.setTargetAtTime(o.level * 0.7 * peak, at, rise / 3);
        body.gain.setTargetAtTime(o.level * 0.3, at + rise, fall / 3);
        lp.frequency.setTargetAtTime(o.cutoff * (1.4 + 0.6 * peak), at, rise / 3);
        lp.frequency.setTargetAtTime(o.cutoff * 0.8, at + rise, fall / 3);
        hiss.gain.setTargetAtTime(o.hiss * 0.55 * peak, at + rise * 0.75, 0.35);
        hiss.gain.setTargetAtTime(o.hiss * 0.12, at + rise + 0.4, fall / 3);
      }, side < 0 ? [0.2, 1.5] : [2.5, 4.5]);
    }
  }
  _rush(bed, o) {
    // Canopy air and airframe rumble: the steady sense of flight. Dark, so it never fatigues.
    const lp = this._filter('lowpass', o.cut, 0.5), amp = this._gain(o.level);
    this._chain([this._loop(bed, 'pink'), this._filter('highpass', 380), lp, amp]);
    const rumbleLp = this._filter('lowpass', 95), rumble = this._gain(o.level * 1.1);
    this._chain([this._loop(bed, 'brown', 1.1), rumbleLp, rumble]);
    const out = this._gain(1); amp.connect(out); rumble.connect(out); out.connect(bed.gain);
    this._lfo(bed, amp.gain, 0.09, o.level * 0.12);
    this._lfo(bed, lp.frequency, 0.043, o.cut * 0.12);
    this._keep(bed, lp, amp, rumbleLp, rumble, out);
    return out;
  }
  // Air drops away when the aircraft is lost, and surges through the sector-clear transition.
  _flightModulation(bed, rush, level) {
    rush.gain.value = 1;
    bed.modulate = (s, now) => {
      const air = s.mode === 'gameover' ? 0 : s.interlude >= 0 ? 1.45 : 1;
      this._target(rush.gain, air, now, air === 0 ? 0.6 : 0.5);
    };
  }
  _rain(bed, o) {
    // Kept darker than real rain above 4 kHz so effect and warning transients cut through.
    const hp = this._filter('highpass', 1400), lp = this._filter('lowpass', 5200, 0.5), hiss = this._gain(o.level * 0.4);
    this._chain([this._loop(bed, 'white'), hp, lp, hiss, bed.gain]);
    const band = this._filter('bandpass', 750, 0.55), body = this._gain(o.level * 0.6);
    this._chain([this._loop(bed, 'pink'), band, body, bed.gain]);
    const php = this._filter('highpass', 700), plp = this._filter('lowpass', 6500), patter = this._gain(o.patter);
    this._chain([this._loop(bed, 'patter', this.between(0.97, 1.03)), php, plp, patter, bed.gain]);
    this._keep(bed, hp, lp, hiss, band, body, php, plp, patter);
    bed.every(5, 11, at => {
      const k = this.between(0.7, 1.3), tc = this.between(1, 2.2);
      hiss.gain.setTargetAtTime(o.level * 0.4 * k, at, tc);
      body.gain.setTargetAtTime(o.level * 0.6 * (0.85 + (k - 1) * 0.6), at, tc);
      patter.gain.setTargetAtTime(o.patter * (0.5 + k * 0.6), at, tc * 0.7);
    }, [1, 3]);
  }
  _drone(bed, o) {
    // Partials are spread across the field and slightly detuned left against right, so the
    // drone beats slowly and wraps around the listener instead of sitting in the centre.
    const lp = this._filter('lowpass', 240, 0.8), amp = this._gain(o.level);
    const partials = [[1, 'sine', -0.13, 0.3, -0.55], [1, 'sine', 0.13, 0.3, 0.55], [1.5, 'triangle', 0.27, 0.22, -0.35],
      [2, 'sine', -0.19, 0.2, 0.4], [3, 'triangle', 0.11, 0.05, -0.7]];
    for (const [ratio, type, detune, a, pan] of partials) {
      const osc = this.ctx.createOscillator(); osc.type = type; osc.frequency.value = DRONE_ROOT * ratio + detune;
      const g = this._gain(a), panner = this._panner(pan); osc.connect(g); g.connect(panner); panner.connect(lp); osc.start(this.now);
      bed.sources.push(osc); this._keep(bed, g, panner);
    }
    this._chain([lp, amp, bed.gain]);
    this._lfo(bed, amp.gain, 0.021, o.level * 0.35);
    this._lfo(bed, lp.frequency, 0.017, 90);
    this._keep(bed, lp, amp);
  }
  _roar(bed, o) {
    const band = this._filter('bandpass', 170, 0.7), roar = this._gain(o.level * 0.7);
    this._chain([this._loop(bed, 'brown'), band, roar, bed.gain]);
    const swirlBand = this._filter('bandpass', 520, 2.2), swirl = this._gain(o.swirl * 0.5), pan = this._panner(0);
    this._chain([this._loop(bed, 'pink'), swirlBand, swirl, pan, bed.gain]);
    this._lfo(bed, swirlBand.frequency, 0.031, 260);
    if (pan.pan) this._lfo(bed, pan.pan, 0.045, 0.75);
    this._keep(bed, band, roar, swirlBand, swirl, pan);
    bed.every(7, 14, at => {
      const k = this.between(0.6, 1.4), tc = this.between(1.2, 2.5);
      roar.gain.setTargetAtTime(o.level * 0.7 * k, at, tc);
      band.frequency.setTargetAtTime(150 + 60 * k, at, tc);
    }, [2, 5]);
  }

  // ---------------------------------------------------------------- one-shots
  _gull(bed, at, distance) {
    const ctx = this.ctx, yelps = 2 + Math.floor(this.r() * 4), base = this.between(780, 1050);
    const spot = this._spot(bed, this.between(-0.85, 0.85), 0.12 + distance * 0.5);
    const am = this._gain(0.55), bp = this._filter('bandpass', 1850, 1.1), lp = this._filter('lowpass', 4600 - distance * 2700);
    const out = this._gain(0.075 * (1 - distance * 0.72));
    const rough = ctx.createOscillator(); rough.frequency.value = this.between(38, 56);
    const roughDepth = this._gain(0.42); rough.connect(roughDepth); roughDepth.connect(am.gain);
    this._chain([am, bp, lp, out, spot.input]);
    const nodes = [am, bp, lp, out, roughDepth, rough, ...spot.nodes];
    let t = at;
    for (let i = 0; i < yelps; i++) {
      const dur = this.between(0.16, 0.34), f = base * (1 - i * 0.035) * this.between(0.95, 1.05);
      const osc = ctx.createOscillator(); osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f * 0.85, t);
      osc.frequency.linearRampToValueAtTime(f * 1.15, t + 0.04);
      osc.frequency.exponentialRampToValueAtTime(f * 0.68, t + dur);
      const env = this._gain(0);
      env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(1, t + 0.025);
      env.gain.setValueAtTime(1, t + dur * 0.7); env.gain.linearRampToValueAtTime(0, t + dur);
      osc.connect(env); env.connect(am);
      osc.start(t); osc.stop(t + dur + 0.02);
      nodes.push(osc, env);
      t += dur + this.between(0.08, 0.32);
    }
    rough.start(at); rough.stop(t + 0.1);
    this._release(rough, nodes);
  }
  _clank(bed, at, o) {
    const ctx = this.ctx, f = o.pitch, heavy = o.heavy ? 1.5 : 1;
    const spot = this._spot(bed, this.between(-0.8, 0.8), o.send ?? 0.3 + o.distance * 0.6);
    const lp = this._filter('lowpass', 5200 - o.distance * 3900), out = this._gain((o.level ?? 0.11) * heavy * (1 - o.distance * 0.75));
    this._chain([lp, out, spot.input]);
    const nodes = [lp, out, ...spot.nodes];
    let last = null;
    const ratios = [1, 2.76, 5.4, 8.93], amps = [1, 0.55, 0.32, 0.2], decays = [1.1, 0.6, 0.35, 0.2];
    for (let k = 0; k < 4; k++) {
      const osc = ctx.createOscillator(); osc.frequency.value = f * ratios[k] * this.between(0.98, 1.02);
      const g = this._gain(0);
      g.gain.setValueAtTime(amps[k] * 0.3, at); g.gain.setTargetAtTime(0, at + 0.002, decays[k] * heavy / 4);
      osc.connect(g); g.connect(lp); osc.start(at); osc.stop(at + decays[k] * heavy * 1.6);
      nodes.push(osc, g); if (k === 0) last = osc;
    }
    const click = this._burst('white', at, 0.02), hp = this._filter('highpass', 2000), cg = this._gain(0);
    cg.gain.setValueAtTime(0.25, at); cg.gain.setTargetAtTime(0, at + 0.001, 0.004);
    this._chain([click, hp, cg, lp]); nodes.push(click, hp, cg);
    this._release(last, nodes);
  }
  _runUp(bed, at, distance) {
    // A jet spooling up somewhere on the flight deck: rising whine and roar, then away.
    const ctx = this.ctx, dur = this.between(7, 10);
    const spot = this._spot(bed, this.between(-0.6, 0.6), 0.4);
    const lp = this._filter('lowpass', 2600), env = this._gain(0), out = this._gain(0.07 * (1 - distance * 0.6));
    this._chain([env, lp, out, spot.input]);
    env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(1, at + dur * 0.45);
    env.gain.setValueAtTime(1, at + dur * 0.7); env.gain.linearRampToValueAtTime(0, at + dur);
    const noise = this._burst('pink', at, dur), band = this._filter('bandpass', 420, 2.5);
    band.frequency.setValueAtTime(420, at); band.frequency.exponentialRampToValueAtTime(1600, at + dur * 0.55);
    band.frequency.exponentialRampToValueAtTime(900, at + dur);
    this._chain([noise, band, env]);
    const whine = ctx.createOscillator(), wg = this._gain(0.05);
    whine.frequency.setValueAtTime(380, at); whine.frequency.exponentialRampToValueAtTime(1250, at + dur * 0.6);
    whine.frequency.exponentialRampToValueAtTime(1100, at + dur);
    this._chain([whine, wg, env]); whine.start(at); whine.stop(at + dur + 0.05);
    this._release(noise, [noise, band, whine, wg, env, lp, out, ...spot.nodes]);
  }
  _whistle(bed, at) {
    // A bosun's pipe drifting up from the deck.
    const osc = this.ctx.createOscillator(), env = this._gain(0), lp = this._filter('lowpass', 3200);
    const spot = this._spot(bed, this.between(-0.5, 0.5), 0.6), out = this._gain(0.012);
    const f = this.between(1850, 2050), dur = this.between(1.6, 2.4);
    osc.frequency.setValueAtTime(f, at); osc.frequency.linearRampToValueAtTime(f * 1.2, at + 0.35);
    osc.frequency.setValueAtTime(f * 1.2, at + dur - 0.35); osc.frequency.linearRampToValueAtTime(f * 0.95, at + dur);
    const warble = this.ctx.createOscillator(), wd = this._gain(f * 0.012); warble.frequency.value = 9;
    warble.connect(wd); wd.connect(osc.frequency);
    env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(1, at + 0.12);
    env.gain.setValueAtTime(1, at + dur - 0.2); env.gain.linearRampToValueAtTime(0, at + dur);
    this._chain([osc, env, lp, out, spot.input]);
    osc.start(at); osc.stop(at + dur + 0.05); warble.start(at); warble.stop(at + dur + 0.05);
    this._release(osc, [osc, warble, wd, env, lp, out, ...spot.nodes]);
  }
  _bell(bed, at) {
    const strikes = this.r() < 0.5 ? 1 : 2, f = this.between(390, 430);
    const spot = this._spot(bed, this.between(-0.7, 0.7), 0.55), lp = this._filter('lowpass', 2400), out = this._gain(0.028);
    this._chain([lp, out, spot.input]);
    const nodes = [lp, out, ...spot.nodes];
    let last = null;
    for (let s = 0; s < strikes; s++) {
      const t = at + s * this.between(1.1, 1.6);
      for (const [ratio, a, d] of [[1, 1, 3.2], [2, 0.5, 2.2], [2.4, 0.35, 1.6], [3, 0.25, 1.2], [4.07, 0.15, 0.8]]) {
        const osc = this.ctx.createOscillator(); osc.frequency.value = f * ratio;
        const g = this._gain(0); g.gain.setValueAtTime(a * 0.3 * (1 - s * 0.3), t); g.gain.setTargetAtTime(0, t + 0.003, d / 4);
        osc.connect(g); g.connect(lp); osc.start(t); osc.stop(t + d * 1.5);
        nodes.push(osc, g); if (ratio === 1) last = osc;
      }
    }
    this._release(last, nodes);
  }
  _hoist(bed, at) {
    // Chain hoist: a rattling burst through a metal resonance.
    const dur = this.between(1.2, 2.2), noise = this._burst('white', at, dur);
    const band = this._filter('bandpass', this.between(900, 1300), 2.2), am = this._gain(0.4), env = this._gain(0);
    const rattle = this.ctx.createOscillator(); rattle.type = 'square'; rattle.frequency.value = this.between(14, 22);
    const depth = this._gain(0.4); rattle.connect(depth); depth.connect(am.gain);
    env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(1, at + 0.15);
    env.gain.setValueAtTime(1, at + dur - 0.3); env.gain.linearRampToValueAtTime(0, at + dur);
    const spot = this._spot(bed, this.between(-0.8, 0.8), 0.7), out = this._gain(0.085);
    this._chain([noise, band, am, env, out, spot.input]);
    rattle.start(at); rattle.stop(at + dur + 0.05);
    this._release(noise, [noise, band, am, env, rattle, depth, out, ...spot.nodes]);
  }
  _hydraulic(bed, at) {
    this._clank(bed, at, { distance: this.between(0.5, 0.75), pitch: this.between(110, 160), heavy: true, send: 0.7 });
    const t = at + 0.12, hold = this.between(0.6, 1.2), noise = this._burst('white', t, hold + 1);
    const hp = this._filter('highpass', 2500), lp = this._filter('lowpass', 7000), env = this._gain(0);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(1, t + 0.08);
    env.gain.setTargetAtTime(0, t + hold, 0.18);
    const spot = this._spot(bed, this.between(-0.7, 0.7), 0.45), out = this._gain(0.035);
    this._chain([noise, hp, lp, env, out, spot.input]);
    this._release(noise, [noise, hp, lp, env, out, ...spot.nodes]);
  }
  _pa(bed, at) {
    // Muffled public address: chime, then voice-shaped buzz and breath through a small horn.
    // Syllable rhythm and formants only; there are no words.
    const ctx = this.ctx, spot = this._spot(bed, this.between(-0.4, 0.4), 0.95);
    const horn = this._filter('highpass', 450, 0.8), muffle = this._filter('lowpass', 2300, 0.9), out = this._gain(0.05);
    this._chain([horn, muffle, out, spot.input]);
    const nodes = [horn, muffle, out, ...spot.nodes];
    let t = at, last = null;
    if (this.r() < 0.55) {
      for (const [f, start] of [[784, 0], [622, 0.42]]) {
        const osc = ctx.createOscillator(), g = this._gain(0);
        osc.frequency.value = f; g.gain.setValueAtTime(0.5, t + start); g.gain.setTargetAtTime(0, t + start + 0.01, 0.22);
        osc.connect(g); g.connect(horn); osc.start(t + start); osc.stop(t + start + 1.2);
        nodes.push(osc, g);
      }
      t += 1.25;
    }
    const dur = this.between(1.6, 3.4), f0 = this.between(118, 150);
    const buzz = ctx.createOscillator(); buzz.type = 'sawtooth'; buzz.frequency.value = f0;
    const f1 = this._filter('bandpass', 750, 3), f2 = this._filter('bandpass', 1500, 4), syll = this._gain(0);
    const breath = this._burst('white', t, dur + 0.3), bb = this._filter('bandpass', 1400, 1.2), bg = this._gain(0.25);
    buzz.connect(f1); buzz.connect(f2); f1.connect(syll); f2.connect(syll);
    this._chain([breath, bb, bg, syll]); syll.connect(horn);
    for (let s = t; s < t + dur;) {
      const len = this.between(0.09, 0.22);
      syll.gain.setTargetAtTime(this.between(0.5, 1), s, 0.015);
      syll.gain.setTargetAtTime(0.04, s + len, 0.02);
      buzz.frequency.setTargetAtTime(f0 * this.between(0.88, 1.18), s, 0.04);
      f1.frequency.setTargetAtTime(this.between(550, 1000), s, 0.03);
      f2.frequency.setTargetAtTime(this.between(1200, 2100), s, 0.03);
      s += len + (this.r() < 0.15 ? this.between(0.2, 0.4) : 0.03);
    }
    syll.gain.setTargetAtTime(0, t + dur, 0.03);
    buzz.start(t); buzz.stop(t + dur + 0.2); last = buzz;
    nodes.push(buzz, f1, f2, syll, breath, bb, bg);
    this._release(last, nodes);
  }
  _motor(bed, at) {
    // A deck compressor cycling on and off.
    const dur = this.between(5, 8), env = this._gain(0), lp = this._filter('lowpass', 180), out = this._gain(0.05);
    env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(1, at + 1.2);
    env.gain.setValueAtTime(1, at + dur - 2); env.gain.linearRampToValueAtTime(0, at + dur);
    const spot = this._spot(bed, this.between(-0.6, 0.6), 0.25);
    this._chain([env, lp, out, spot.input]);
    const nodes = [env, lp, out, ...spot.nodes];
    let last = null;
    for (const [f, a] of [[46, 0.5], [92.4, 0.3], [138.6, 0.12]]) {
      const osc = this.ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = f + this.between(-0.4, 0.4);
      const g = this._gain(a); osc.connect(g); g.connect(env); osc.start(at); osc.stop(at + dur + 0.05);
      nodes.push(osc, g); last = osc;
    }
    this._release(last, nodes);
  }
  _thud(bed, at, distance) {
    // A foundry drop hammer far across the water.
    const osc = this.ctx.createOscillator(), og = this._gain(0);
    osc.frequency.setValueAtTime(54, at); osc.frequency.exponentialRampToValueAtTime(32, at + 0.7);
    og.gain.setValueAtTime(0.6, at); og.gain.setTargetAtTime(0, at + 0.01, 0.22);
    const noise = this._burst('brown', at, 1.4), lp = this._filter('lowpass', 260), ng = this._gain(0);
    ng.gain.setValueAtTime(0.5, at); ng.gain.setTargetAtTime(0, at + 0.02, 0.3);
    const spot = this._spot(bed, this.between(-0.7, 0.7), 0.6), out = this._gain(0.16 * (1 - distance * 0.6));
    osc.connect(og); og.connect(out); this._chain([noise, lp, ng, out, spot.input]);
    osc.start(at); osc.stop(at + 1.2);
    this._release(noise, [osc, og, noise, lp, ng, out, ...spot.nodes]);
  }
  _thunder(bed, at, o) {
    // Near strikes crack and rip before the roll; distant ones are a soft, dark grumble.
    // `below` is thunder trapped in the cloud sea under sector 5: no crack, dark, felt more than heard.
    const near = (1 - clamp(o.distance, 0, 1)) * (o.below ? 0.45 : 1), dark = o.dark ? 0.6 : o.below ? 0.42 : 1;
    const level = (0.042 + 0.15 * Math.pow(near, 1.4)) * (o.dark ? 0.8 : o.below ? 1.4 : 1);
    const cutoff = (140 + 1100 * near * near) * dark, dur = 3.5 + o.distance * 3 + this.r() * 2 + (o.below ? 1.5 : 0);
    const spot = this._spot(bed, o.pan, 0.25 + o.distance * 0.35), out = this._gain(level);
    out.connect(spot.input);
    const nodes = [out, ...spot.nodes];
    if (near > 0.5) {
      const cracks = 3 + Math.floor(this.r() * 4);
      let t = at;
      for (let k = 0; k < cracks; k++) {
        const len = this.between(0.04, 0.12), src = this._burst('white', t, len + 0.05);
        const hp = this._filter('highpass', 900 * dark), g = this._gain(0);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5 * (1 - k * 0.13) * (near - 0.3), t + 0.004);
        g.gain.setTargetAtTime(0, t + len * 0.4, len / 3);
        this._chain([src, hp, g, out]); nodes.push(src, hp, g);
        t += this.between(0.03, 0.1);
      }
    }
    const src = this._burst('brown', at, dur + 1.5, this.between(0.85, 1.05));
    const lp = this._filter('lowpass', cutoff, 0.6), sub = this._filter('lowpass', 70), subAmp = this._gain(0.7 * near + 0.2);
    const env = this._gain(0);
    src.connect(lp); src.connect(sub); sub.connect(subAmp); lp.connect(env); subAmp.connect(env); env.connect(out);
    const attack = 0.04 + o.distance * 0.45;
    env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(1, at + attack);
    let t = at + attack;
    const rolls = 2 + Math.floor(this.r() * 4);
    for (let k = 0; k < rolls; k++) {
      t += this.between(0.3, 1.1);
      env.gain.setTargetAtTime(this.between(0.45, 1) * (1 - k * 0.12), t, this.between(0.15, 0.45));
    }
    env.gain.setTargetAtTime(0, t + 0.25, Math.max(0.3, (at + dur - t) / 4));
    lp.frequency.setTargetAtTime(cutoff * 0.5, at + 0.5, 1.5);
    nodes.push(src, lp, sub, subAmp, env);
    this._release(src, nodes);
  }
  _groan(bed, at, distance) {
    // Hull stress in the maelstrom: a slow stick-slip pulse train ringing through metal resonances.
    const ctx = this.ctx, dur = this.between(2.2, 4.5), f = this.between(26, 44);
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f, at); osc.frequency.linearRampToValueAtTime(f * this.between(0.75, 1.25), at + dur);
    const wobble = ctx.createOscillator(), wd = this._gain(f * 0.08); wobble.frequency.value = this.between(3, 7);
    wobble.connect(wd); wd.connect(osc.frequency);
    const env = this._gain(0), lp = this._filter('lowpass', 2200 - distance * 900);
    env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(1, at + this.between(0.5, 0.9));
    env.gain.setValueAtTime(1, at + dur - 1); env.gain.linearRampToValueAtTime(0, at + dur);
    const spot = this._spot(bed, this.between(-0.8, 0.8), 0.6), out = this._gain(0.09 * (1 - distance * 0.55));
    const nodes = [osc, wobble, wd, env, lp, out, ...spot.nodes];
    for (const [lo, hi, a] of [[260, 420, 1], [640, 900, 0.6], [1300, 1700, 0.35]]) {
      const fr = this.between(lo, hi), band = this._filter('bandpass', fr, this.between(14, 22)), g = this._gain(a * 3);
      band.frequency.setValueAtTime(fr, at); band.frequency.linearRampToValueAtTime(fr * this.between(0.92, 1.08), at + dur);
      osc.connect(band); band.connect(g); g.connect(env); nodes.push(band, g);
    }
    this._chain([env, lp, out, spot.input]);
    osc.start(at); osc.stop(at + dur + 0.05); wobble.start(at); wobble.stop(at + dur + 0.05);
    this._release(osc, nodes);
  }
  _whoosh(at, length) {
    // Sector-clear transition: a wide rush of air that peaks mid-way and settles into the next sector.
    const peak = at + length * 0.45, end = at + length + 0.4;
    const pan = this._panner(-0.7), send = this._gain(0.2), out = this._gain(0.13);
    if (pan.pan) { pan.pan.setValueAtTime(-0.7, at); pan.pan.linearRampToValueAtTime(0.7, end); }
    const air = this._burst('pink', at, length + 0.5), band = this._filter('bandpass', 260, 1.1), ae = this._gain(0);
    band.frequency.setValueAtTime(260, at); band.frequency.exponentialRampToValueAtTime(2400, peak);
    band.frequency.exponentialRampToValueAtTime(650, end);
    ae.gain.setValueAtTime(0, at); ae.gain.linearRampToValueAtTime(1, peak); ae.gain.linearRampToValueAtTime(0, end);
    const low = this._burst('brown', at, length + 0.5), lp = this._filter('lowpass', 220), le = this._gain(0);
    le.gain.setValueAtTime(0, at); le.gain.linearRampToValueAtTime(0.9, peak + 0.2); le.gain.linearRampToValueAtTime(0, end);
    this._chain([air, band, ae, out]); this._chain([low, lp, le, out]);
    out.connect(pan); pan.connect(this.master); pan.connect(send); send.connect(this.reverb);
    this._release(air, [air, band, ae, low, lp, le, out, pan, send]);
  }

  // ---------------------------------------------------------------- state-driven extras
  _weather(s, now) {
    const bed = this.current;
    if (!bed || !/^sector\d+$/.test(bed.name) || !inFlight(s)) return;
    // Every sector asks the shared schedule; sectors without weather get null from lightningAt.
    const stage = Number(bed.name.slice(6));
    const strike = lightningAt(s.time, stage);
    if (!strike || strike.id === this.lastStrike) return;
    this.lastStrike = strike.id;
    // Thunder lags the shared flash by distance, as the visuals and page ambience expect.
    // From above the cloud floor (sector 5) the sound has further to climb, and arrives later.
    const below = stage === 5;
    const delay = Math.max(0.03, 0.3 + strike.distance * (below ? 2.8 : 2.2) + (below ? 0.4 : 0) - strike.age);
    this._thunder(bed, now + delay, { distance: strike.distance, pan: (strike.x * 1.6 - 0.8) * (below ? 0.6 : 1), dark: stage === 3, below });
  }
  _pressure(s, now) {
    let target = 0;
    if (inFlight(s) && s.mode !== 'gameover') {
      if (s.boss) target = PRESSURE_BY_PHASE[clamp(Math.round(Number(s.bossPhase) || 1), 1, 3)];
      else if (Number.isFinite(s.bossWarning) && s.bossWarning >= 0) target = 0.12 + 0.5 * s.bossWarning;
    }
    let bed = this.pressure;
    if (target > 0 && !bed) { bed = this.pressure = this._build('pressure'); this.beds.push(bed); }
    if (!bed) return;
    bed.fade(Math.round(target * 50) / 50, now, target > bed.level ? 0.9 : 1.3);
    if (target > 0) { bed.active = true; bed.retireAt = Infinity; }
    else if (bed.active) { bed.active = false; bed.retireAt = now + 4 + RETIRE_AFTER; }
    bed.tick(now, s);
  }
  _interlude(s, now) {
    const progress = Number.isFinite(s.interlude) ? s.interlude : -1;
    if (progress < 0) { this.interludeOn = false; return; }
    if (this.interludeOn || !inFlight(s)) return;
    this.interludeOn = true;
    if (progress < 0.6) this._whoosh(now + 0.01, (Number(s.interludeLength) || INTERLUDE) * (1 - progress));
  }
}
