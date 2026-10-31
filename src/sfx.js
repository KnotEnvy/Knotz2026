// Sound-effect designs for gameplay events, presentation moments and the interface.
// Every cue is layered synthesis: a transient for attack, a body for weight and a tail for space.
// Levels are set so a single cue peaks well below full scale; the engine's glue and limiter
// stages handle stacking.
import { CAMPAIGN_STAGES } from './game.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);

// Events resolved before the high-volume shot and hit streams.
export const PRIORITY_EVENTS = new Set([
  'scavengerSteal', 'scavengerDrop', 'scavengerEscape', 'hullEnter', 'hullDown', 'broadside', 'coreExposed', 'actTwo',
  'boxEnter', 'flakMark', 'foundryEnter', 'foundryDown', 'laserWarn', 'empCharge', 'empPulse', 'empClear', 'wingBreak',
  'squadronBonus', 'arsenalScatter', 'salvageRecover', 'escortJoin', 'reflectorUp', 'reflectorDown', 'signatureUp', 'shieldUp',
  'playerHit', 'lifeLost', 'bomb', 'shieldBreak', 'shieldRestore', 'powerUp', 'wakeRoll', 'wakeReady',
  'wakeConvert', 'bossDown', 'bossPhase', 'bossEnter', 'reactorBreak', 'reactorOpen', 'lanceLock',
  'lanceFire', 'lanceCancel', 'stage', 'extend', 'gameover', 'victory',
]);
export const RECOVERY_FOLLOW_ON_EVENTS = new Set(['powerUp','shieldUp','shieldRestore','escortJoin','signatureUp','reflectorUp']);

// Mix trims, set from offline renders through the full chain so the hierarchy reads:
// UI and fire at the back, hits and pickups above fire, warnings and milestones clearly on top.
// Sector-4 combat cues use the existing per-name RATE gates and global voice ceilings.
const TRIM = {
  squadronEnter: 1.2, hullEnter: 1.35, hullDown: 1.1, turretDown: 0.9,
  scavengerSteal: 1.7, scavengerDrop: 1.5, scavengerEscape: 1.5,
  mineBurst: 0.9, broadside: 1.15, coreExposed: 1.4,
  boxEnter: 1.3, 'boxEnter-dive': 1.6, gunnerFire: 1.4, skyAceDodge: 3, flakMark: 1.5, flakBurst: 1, foundryEnter: 1.3, foundryDown: 1.1,
  bayDown: 1, droneLaunch: 1.3, laserWarn: 1.4, laserFire: 1.1, empCharge: 1.4, empPulse: 1.2, empClear: 1.6, wingBreak: 1.45,
  shoot: 1, missileLaunch: 1.3, roll: 3.4, wakeRoll: 2.8, wakeConvert: 1.2, drop: 1.5,
  'pickup-power': 2, 'pickup-shield': 2.1, 'pickup-life': 2.3, 'pickup-score': 1.9, 'pickup-bomb': 1.15,
  powerUp: 2.2, wakeReady: 1.7, shieldBreak: 1.5, shieldRestore: 1.7,
  'bomb-barrier': 2.3, 'bomb-storm': 1.9, bossGuard: 1.7, reactorOpen: 1.7, lanceLock: 2.8,
  flank: 2, lane: 3, extend: 2.2, stage: 1.9, victory: 2.1,
  flagshipWarning: 1.6, sectorClear: 1.9, criticalPulse: 1.45,
  'ui-focus': 0.55, 'ui-confirm': 0.72, 'ui-skip': 1.6,
};
const BOOM_TRIM = { small: 1.3, medium: 1.6, large: 1 };
const LARGE = new Set(['bomber', 'carrier', 'mini', 'hull', 'boxBomber']);
const MEDIUM = new Set(['ace', 'turret', 'gunboat', 'hullTurret', 'skyAce', 'tailGunner']);
// Kills that have their own collapse event (hullDown, foundryDown, bayDown, the flagship).
const OWN_COLLAPSE = new Set(['boss', 'hull', 'hullTurret', 'foundry', 'foundryBay']);
// Flagship roots by sector, 1..6: D, C#, A, D, F (HALCYON), D. Each flagship announces itself in its own key.
const FLAGSHIP_ROOT = [0, 38, 37, 33, 38, 41, 38];
const SECTOR_CLEAR_ROOT = [0, 62, 64, 60, 62, 65, 62];
const sectorOf = (value, game) => clamp(Math.floor(Number(value || game?.stage) || 1), 1, Math.max(CAMPAIGN_STAGES, FLAGSHIP_ROOT.length - 1));

export class SfxLibrary {
  constructor(engine) {
    this.engine = engine;
    this.serial = 0;
    this.shots = 0;
    this.batch = null;
    this.recoveryCount = 0;
    this.scale = 1;
  }

  // ---------------------------------------------------------------- utilities
  rnd() {
    this.serial++;
    const x = Math.sin(this.serial * 12.9898 + 78.233) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
  }
  vary(amount) { return 1 + this.rnd() * amount; }
  pan(x) { return clamp(((Number(x) || 270) - 270) / 270, -1, 1) * 0.45; }
  rate(name, interval) { return this.engine.canPlay(name, interval); }
  // The EMP's dead hum ends with the escorts' state: a lost life, the run's end, HALCYON's fall
  // and a sector change all cut it (the simulation also sends empClear "reset" for these).
  _cutEmp() { this.empHum?.stop(0.05); this.empHum = null; }
  // The dead hum itself: two detuned low saws for `seconds`. It is a tracked long cue, so pause,
  // mute and leaving play cut it (stopLongCues also clears empHum).
  _empHum(at, seconds, attack) {
    this._cutEmp();
    const hold = clamp(seconds, 0.2, 2.6), cue = this.group(this.alert);
    this.engine.trackLongCue(cue, hold + Math.max(0, at - this.engine.ctx.currentTime));
    this.osc({ at, dur: hold, type: 'sawtooth', freq: 55, vol: 0.01, attack, hold: Math.max(0, hold - 0.5), filter: { freq: 260 }, group: cue });
    this.osc({ at, dur: hold, type: 'sawtooth', freq: 55.7, vol: 0.008, attack, hold: Math.max(0, hold - 0.5), filter: { freq: 240 }, group: cue });
    this.empHum = cue;
  }
  // Play resumes (after a pause, an unmute or the effects coming back up) with the wing still
  // down: the hum returns for the time left, without the pulse. Nothing when it is still running.
  resumeEmpHum(t, seconds) {
    if (this.empHum && !this.empHum.stopped) return false;
    if (!(seconds > 0.12)) return false;
    this._empHum(t, seconds, 0.08);
    return true;
  }
  get combat() { return this.engine.combatBus; }
  get fx() { return this.engine.fxBus; }
  get alert() { return this.engine.alertBus; }
  get uiBus() { return this.engine.uiBus; }

  beginBatch(events) {
    const types = new Set();
    for (const event of events) if (event?.type) types.add(event.type);
    this.batch = types;
    this.recoveryCount=0;
    for(const event of events)if(event?.type==='salvageRecover')this.recoveryCount+=Math.max(1,Number(event.amount)||1);
  }
  endBatch() { this.batch = null; this.recoveryCount = 0; }
  inBatch(type) { return Boolean(this.batch?.has(type)); }

  // Shared voice tail: filters, optional drive, envelope, pan, destination and reverb send.
  _chain(source, t, o, voices) {
    const engine = this.engine, ctx = engine.ctx, nodes = [source];
    let head = source;
    for (const f of [o.filter, o.filter2]) {
      if (!f) continue;
      const filter = ctx.createBiquadFilter();
      filter.type = f.type || 'lowpass';
      filter.frequency.setValueAtTime(Math.max(20, f.freq), t);
      if (f.end) filter.frequency.exponentialRampToValueAtTime(Math.max(20, f.end), t + (f.time ?? o.dur));
      if (f.q != null) filter.Q.setValueAtTime(f.q, t);
      head.connect(filter); head = filter; nodes.push(filter);
    }
    if (o.drive && engine.curves[o.drive]) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = engine.curves[o.drive];
      head.connect(shaper); head = shaper; nodes.push(shaper);
    }
    const envelope = ctx.createGain();
    const attack = Math.max(0.001, Math.min(o.attack ?? 0.002, o.dur * 0.9));
    const peak = Math.max(0.00012, o.vol * this.scale);
    // Start silent now: a GainNode defaults to 1, and when a source starts on a fractional
    // sample frame one sample can slip through before the first automation event (a click).
    envelope.gain.value = 0;
    envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.exponentialRampToValueAtTime(peak, t + attack);
    if (o.hold) envelope.gain.setValueAtTime(peak, t + attack + o.hold);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    head.connect(envelope); head = envelope; nodes.push(envelope);
    if (o.pan || o.panEnd != null) {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(clamp(o.pan || 0, -1, 1), t);
      if (o.panEnd != null) panner.pan.linearRampToValueAtTime(clamp(o.panEnd, -1, 1), t + o.dur);
      head.connect(panner); head = panner; nodes.push(panner);
    }
    head.connect(o.group ? o.group.node : (o.bus || this.fx));
    if (o.send && engine.spaceSend) {
      const send = ctx.createGain();
      send.gain.value = o.send;
      head.connect(send); send.connect(engine.spaceSend); nodes.push(send);
    }
    if (o.group) o.group.sources.push(source);
    const combat = (o.bus || this.fx) === this.combat;
    source.onended = () => {
      engine.release(ctx, voices, combat);
      for (const node of nodes) { try { node.disconnect(); } catch (_) {} }
    };
    return source;
  }

  _time(at) {
    const current = this.engine.ctx.currentTime;
    return Math.max(current, Number.isFinite(at) ? at : current);
  }

  osc(o) {
    const engine = this.engine;
    if (!engine.claim(1, (o.bus || this.fx) === this.combat)) return null;
    const ctx = engine.ctx, t = this._time(o.at);
    const source = ctx.createOscillator();
    const wave = engine.waves[o.type];
    if (wave) source.setPeriodicWave(wave); else source.type = o.type || 'sine';
    source.frequency.setValueAtTime(Math.max(10, o.freq), t);
    if (o.end) source.frequency.exponentialRampToValueAtTime(Math.max(10, o.end), t + (o.glide ?? o.dur));
    if (o.detune) source.detune.setValueAtTime(o.detune, t);
    this._chain(source, t, o, 1);
    source.start(t);
    source.stop(t + o.dur + 0.03);
    return source;
  }

  noise(o) {
    const engine = this.engine;
    const buffer = engine.noise[o.color || 'white'];
    if (!buffer || !engine.claim(1, (o.bus || this.fx) === this.combat)) return null;
    const ctx = engine.ctx, t = this._time(o.at);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const span = engine.noiseDuration || 1;
    const rate = o.rate || 1;
    if (o.dur * rate > span - 0.05) source.loop = true;
    source.playbackRate.setValueAtTime(rate, t);
    this._chain(source, t, o, 1);
    // Different windows of the buffer keep repeated cues from sounding like one recording.
    const offset = source.loop ? 0 : Math.abs(this.rnd()) * Math.max(0, span - o.dur * rate - 0.02);
    source.start(t, offset);
    source.stop(t + o.dur + 0.03);
    return source;
  }

  // Two-operator FM for bells, metal and energy. Counts as two voices.
  fm(o) {
    const engine = this.engine;
    const combat = (o.bus || this.fx) === this.combat;
    if (!engine.claim(2, combat)) return null;
    const ctx = engine.ctx, t = this._time(o.at);
    const carrier = ctx.createOscillator(), modulator = ctx.createOscillator(), index = ctx.createGain();
    carrier.type = 'sine'; modulator.type = 'sine';
    const ratio = o.ratio ?? 2;
    carrier.frequency.setValueAtTime(Math.max(10, o.freq), t);
    modulator.frequency.setValueAtTime(Math.max(10, o.freq * ratio), t);
    if (o.end) {
      carrier.frequency.exponentialRampToValueAtTime(Math.max(10, o.end), t + o.dur);
      modulator.frequency.exponentialRampToValueAtTime(Math.max(10, o.end * ratio), t + o.dur);
    }
    index.gain.setValueAtTime(Math.max(1, o.freq * (o.index ?? 1)), t);
    index.gain.exponentialRampToValueAtTime(Math.max(1, o.freq * (o.indexEnd ?? 0.05)), t + o.dur * 0.9);
    modulator.connect(index); index.connect(carrier.frequency);
    this._chain(carrier, t, o, 1);
    modulator.onended = () => { engine.release(ctx, 1, combat); try { modulator.disconnect(); index.disconnect(); } catch (_) {} };
    if (o.group) o.group.sources.push(modulator);
    carrier.start(t); modulator.start(t);
    carrier.stop(t + o.dur + 0.03); modulator.stop(t + o.dur + 0.03);
    return carrier;
  }

  // A fadeable container for long cues.
  group(bus) {
    const ctx = this.engine.ctx;
    const node = ctx.createGain();
    node.gain.value = 1;
    node.connect(bus);
    const cue = {
      node, sources: [], stopped: false,
      stop: (fade = 0.08) => {
        if (cue.stopped) return;
        cue.stopped = true;
        const t = ctx.currentTime;
        node.gain.cancelScheduledValues?.(t);
        node.gain.setTargetAtTime(0, t, fade / 3);
        for (const source of cue.sources) { try { source.stop(t + fade + 0.02); } catch (_) {} }
        if (typeof setTimeout !== 'undefined') setTimeout(() => { try { node.disconnect(); } catch (_) {} }, (fade + 0.3) * 1000);
      },
    };
    return cue;
  }

  // ------------------------------------------------------------------- events
  play(event, game, t) {
    // Recovery is one compact musical gesture, including the equipment tick-in events.
    if(this.inBatch('salvageRecover')&&RECOVERY_FOLLOW_ON_EVENTS.has(event?.type))return;
    const handler = this.handlers[event?.type];
    if (!handler) return;
    this.scale = TRIM[event.type + '-' + event.value] ?? TRIM[event.type] ?? 1;
    try { handler.call(this, event, game, t); } finally { this.scale = 1; }
  }

  // Runs a cue at its trim level.
  trimmed(key, run) {
    this.scale = TRIM[key] ?? 1;
    try { return run(); } finally { this.scale = 1; }
  }

  get handlers() {
    return HANDLERS;
  }

  // Explosion family shared by kills, reactors, the player and flagship collapse.
  boom(size, t, pan = 0, bus = this.combat, scale = 1) {
    const v = this.vary(0.08);
    scale *= BOOM_TRIM[size] ?? 1;
    if (size === 'small') {
      this.noise({ at: t, dur: 0.22, color: 'pink', vol: 0.09 * scale, filter: { freq: 3000 * v, end: 480, time: 0.18 }, pan, bus });
      this.osc({ at: t, dur: 0.16, type: 'sine', freq: 150 * v, end: 46, vol: 0.075 * scale, pan, bus });
      this.noise({ at: t + 0.03, dur: 0.3, color: 'crackle', vol: 0.035 * scale, filter: { type: 'highpass', freq: 1500 }, pan: pan * 1.4, bus });
    } else if (size === 'medium') {
      this.noise({ at: t, dur: 0.34, color: 'pink', vol: 0.12 * scale, filter: { freq: 2600 * v, end: 360, time: 0.28 }, pan, bus, send: 0.08 });
      this.osc({ at: t, dur: 0.24, type: 'sine', freq: 118 * v, end: 38, vol: 0.1 * scale, pan, bus });
      this.osc({ at: t, dur: 0.12, type: 'sawtooth', freq: 240 * v, end: 70, vol: 0.03 * scale, filter: { freq: 1100 }, pan, bus });
      this.noise({ at: t + 0.04, dur: 0.45, color: 'crackle', vol: 0.04 * scale, filter: { type: 'highpass', freq: 1300 }, pan: pan * 1.4, bus });
    } else {
      const width = 0.22;
      this.noise({ at: t, dur: 0.72, color: 'brown', vol: 0.2 * scale, filter: { freq: 2300 * v, end: 240, time: 0.6 }, pan: pan - width, bus, send: 0.2 });
      this.noise({ at: t + 0.006, dur: 0.66, color: 'pink', vol: 0.11 * scale, filter: { freq: 1900 * v, end: 260, time: 0.5 }, pan: pan + width, bus });
      this.osc({ at: t, dur: 0.58, type: 'sine', freq: 74 * v, end: 27, vol: 0.18 * scale, bus });
      this.osc({ at: t, dur: 0.22, type: 'sawtooth', freq: 210 * v, end: 52, vol: 0.05 * scale, filter: { freq: 900 }, pan, bus });
      this.noise({ at: t + 0.06, dur: 0.95, color: 'crackle', vol: 0.05 * scale, filter: { type: 'highpass', freq: 1150 }, pan: pan * 1.3, bus, send: 0.15 });
    }
  }

  // --------------------------------------------------------- presentation cues
  // A pulsing two-stage air-raid horn across the pre-flagship warning, over a rising swell.
  flagshipWarning(t, length = 3.2) {
    return this.trimmed('flagshipWarning', () => this._flagshipWarning(t, length));
  }
  _flagshipWarning(t, length) {
    const duration = clamp(length, 0.6, 3.4);
    const cue = this.group(this.alert);
    this.engine.trackLongCue(cue, duration);
    this.engine.duck('beds', 0.62, duration - 0.3, 0.6, 0.15);
    this.osc({ at: t, dur: 0.8, type: 'sine', freq: 62, end: 31, vol: 0.13, group: cue });
    this.noise({ at: t, dur: duration + 0.3, color: 'brown', vol: 0.1, attack: duration * 0.8, filter: { freq: 180, end: 700, time: duration }, group: cue });
    const pulses = Math.max(1, Math.round(duration / 0.8));
    for (let i = 0; i < pulses; i++) {
      const at = t + 0.05 + i * 0.8;
      const lift = 1 + i * 0.03;
      this.osc({ at, dur: 0.62, type: 'horn', freq: 466 * lift, end: 740 * lift, glide: 0.32, vol: 0.05, attack: 0.03, hold: 0.24,
        filter: { type: 'bandpass', freq: 1150, q: 1.2 }, drive: 'soft', send: 0.28, group: cue });
      this.osc({ at, dur: 0.62, type: 'square', freq: 468 * lift, end: 745 * lift, glide: 0.32, vol: 0.016, attack: 0.03, hold: 0.24,
        filter: { freq: 2600 }, pan: i % 2 ? 0.25 : -0.25, group: cue });
    }
    return cue;
  }

  // The interlude stinger: a bright rising arpeggio over a held brass triad.
  sectorClear(t, stage = 1, drill = false) {
    return this.trimmed('sectorClear', () => this._sectorClear(t, stage, drill));
  }
  _sectorClear(t, stage, drill) {
    const root = drill ? 62 : SECTOR_CLEAR_ROOT[clamp(stage, 1, SECTOR_CLEAR_ROOT.length - 1)];
    [12, 16, 19, 24, 28].forEach((step, i) => {
      this.osc({ at: t + i * 0.07, dur: 0.5, type: 'glass', freq: hz(root + step), vol: 0.032, send: 0.35 });
    });
    for (const step of [0, 7, 12]) {
      this.osc({ at: t, dur: 1.15, type: 'brass', freq: hz(root + step), vol: 0.024, attack: 0.09, filter: { freq: 900, end: 2800, time: 0.4 }, send: 0.25 });
    }
    this.noise({ at: t, dur: 0.95, color: 'white', vol: 0.012, attack: 0.35, filter: { type: 'highpass', freq: 6200 } });
  }

  // A low double heartbeat with a clean high ping that cuts through dense fire.
  criticalPulse(t) {
    return this.trimmed('criticalPulse', () => this._criticalPulse(t));
  }
  _criticalPulse(t) {
    this.engine.duck('combat', 0.7, 0.22, 0.2);
    this.osc({ at: t, dur: 0.13, type: 'sine', freq: 64, end: 44, vol: 0.11, bus: this.alert });
    this.osc({ at: t + 0.2, dur: 0.12, type: 'sine', freq: 60, end: 42, vol: 0.075, bus: this.alert });
    this.osc({ at: t, dur: 0.12, type: 'glass', freq: 988, vol: 0.05, bus: this.alert });
    this.osc({ at: t + 0.2, dur: 0.14, type: 'glass', freq: 784, vol: 0.04, bus: this.alert });
  }

  // ---------------------------------------------------------------------- UI
  ui(name, t) {
    return this.trimmed('ui-' + name, () => this._ui(name, t));
  }
  _ui(name, t) {
    const B = this.uiBus;
    switch (name) {
      case 'focus':
        if (!this.rate('ui-focus', 0.04) || this.engine.lastSound.get('ui-any') > t - 0.12) return;
        this.osc({ at: t, dur: 0.028, type: 'sine', freq: 2350, vol: 0.018, bus: B });
        this.noise({ at: t, dur: 0.01, vol: 0.01, filter: { type: 'highpass', freq: 6000 }, bus: B });
        return;
      case 'tick':
        if (!this.rate('ui-tick', 0.035)) return;
        this.noise({ at: t, dur: 0.009, vol: 0.022, filter: { type: 'bandpass', freq: 3200, q: 3 }, bus: B });
        this.osc({ at: t, dur: 0.014, type: 'sine', freq: 3200, vol: 0.006, bus: B });
        return;
    }
    if (!this.rate('ui-' + name, 0.05)) return;
    this.engine.lastSound.set('ui-any', t);
    const click = (at, freq = 2500, vol = 0.03) =>
      this.noise({ at, dur: 0.012, vol, filter: { type: 'bandpass', freq, q: 2 }, bus: B });
    switch (name) {
      case 'select':
        click(t);
        this.osc({ at: t, dur: 0.09, type: 'glass', freq: hz(86), vol: 0.03, bus: B });
        this.osc({ at: t + 0.035, dur: 0.11, type: 'glass', freq: hz(93), vol: 0.022, bus: B, send: 0.1 });
        break;
      case 'confirm':
        this.osc({ at: t, dur: 0.06, type: 'sine', freq: 190, end: 92, vol: 0.06, bus: B });
        click(t, 2000, 0.025);
        this.osc({ at: t, dur: 0.11, type: 'glass', freq: hz(81), vol: 0.034, bus: B });
        this.osc({ at: t + 0.05, dur: 0.17, type: 'glass', freq: hz(88), vol: 0.034, bus: B, send: 0.15 });
        break;
      case 'back':
        click(t, 1800, 0.022);
        this.osc({ at: t, dur: 0.08, type: 'glass', freq: hz(86), vol: 0.028, bus: B });
        this.osc({ at: t + 0.05, dur: 0.13, type: 'glass', freq: hz(79), vol: 0.026, bus: B });
        break;
      case 'launch':
        // Catapult shot, then the afterburner lights and carries into the sortie.
        this.osc({ at: t, dur: 0.2, type: 'sine', freq: 120, end: 48, vol: 0.11, bus: B });
        click(t, 1400, 0.04);
        this.noise({ at: t + 0.02, dur: 1.35, color: 'pink', vol: 0.085, attack: 0.55, filter: { type: 'bandpass', freq: 300, end: 2600, time: 1.1, q: 0.8 }, panEnd: 0.15, bus: B, send: 0.12 });
        this.osc({ at: t + 0.02, dur: 1.25, type: 'sawtooth', freq: 78, end: 158, vol: 0.026, attack: 0.5, filter: { freq: 500, end: 2000, time: 1.1 }, bus: B });
        this.osc({ at: t + 0.02, dur: 0.22, type: 'glass', freq: hz(86), vol: 0.03, bus: B, send: 0.2 });
        break;
      case 'pause':
        this.osc({ at: t, dur: 0.2, type: 'triangle', freq: 660, end: 330, vol: 0.04, bus: B });
        this.noise({ at: t, dur: 0.06, color: 'pink', vol: 0.03, filter: { freq: 900 }, bus: B });
        break;
      case 'resume':
        click(t);
        this.osc({ at: t, dur: 0.17, type: 'triangle', freq: 330, end: 660, vol: 0.04, bus: B });
        break;
      case 'open':
        this.noise({ at: t, dur: 0.15, vol: 0.028, attack: 0.04, filter: { type: 'bandpass', freq: 900, end: 2300, q: 1.1 }, bus: B });
        this.osc({ at: t + 0.06, dur: 0.11, type: 'glass', freq: hz(88), vol: 0.02, bus: B });
        break;
      case 'close':
        this.noise({ at: t, dur: 0.13, vol: 0.028, attack: 0.02, filter: { type: 'bandpass', freq: 2300, end: 900, q: 1.1 }, bus: B });
        this.osc({ at: t + 0.03, dur: 0.09, type: 'glass', freq: hz(81), vol: 0.02, bus: B });
        break;
      case 'skip':
        click(t, 2200, 0.025);
        this.noise({ at: t, dur: 0.2, vol: 0.032, attack: 0.05, filter: { type: 'bandpass', freq: 600, end: 3000, q: 1 }, bus: B });
        break;
    }
  }
}

// One handler per game event type. `this` is the SfxLibrary.
const HANDLERS = {
  squadronEnter(ev, game, t) {
    if (!this.rate('squadronEnter', 1.5)) return;
    this.noise({ at: t, dur: 1.5, color: 'brown', vol: 0.08, attack: 0.65, filter: { type: 'bandpass', freq: 120, end: 650, q: 1 }, pan: -0.4, panEnd: 0.4, bus: this.combat });
    this.osc({ at: t, dur: 1.4, type: 'sawtooth', freq: 65, end: 98, vol: 0.025, attack: 0.65, filter: { freq: 350 }, bus: this.combat });
  },
  hullEnter(ev, game, t) {
    if (!this.rate('hullEnter', 2)) return;
    for (const [offset, f] of [[0, 73.42], [0.18, 110]]) this.osc({ at: t + offset, dur: 1.7, type: 'horn', freq: f, vol: 0.065, attack: 0.18, hold: 0.3, filter: { freq: 650 }, pan: this.pan(ev.x), send: 0.3, bus: this.alert });
  },
  hullDown(ev, game, t) {
    if (!this.rate('hullDown', 0.65)) return;
    this.engine.duck('combat', 0.5, 0.4, 0.6);
    this.boom('large', t, this.pan(ev.x), this.fx, 0.9);
    this.boom('medium', t + 0.28, -this.pan(ev.x), this.fx, 0.65);
    this.fm({ at: t + 0.08, dur: 1.5, freq: 95, end: 48, ratio: 2.76, index: 4, vol: 0.055, send: 0.3 });
    this.noise({ at: t + 0.5, dur: 1.8, color: 'brown', vol: 0.1, filter: { freq: 850, end: 100 }, send: 0.2 });
  },
  turretDown(ev, game, t) {
    if (!this.rate('turretDown', 0.16)) return;
    this.boom('medium', t, this.pan(ev.x));
    this.fm({ at: t, dur: 0.4, freq: 220, ratio: 2.76, index: 3, vol: 0.03, pan: this.pan(ev.x), bus: this.combat });
  },
  scavengerSteal(ev, game, t) {
    if (!this.rate('scavengerSteal', 0.45)) return;
    this.engine.duck('combat', 0.45, 0.25, 0.25);
    [1568, 1175, 1568].forEach((f, i) => this.osc({ at: t + i * 0.09, dur: 0.085, type: 'square', freq: f, end: f * 0.8, vol: 0.035, filter: { freq: 2600 }, bus: this.alert }));
    this.noise({ at: t, dur: 0.22, color: 'pink', vol: 0.05, filter: { type: 'bandpass', freq: 2800, end: 400 }, bus: this.alert });
  },
  scavengerDrop(ev, game, t) {
    if (!this.rate('scavengerDrop', 0.3)) return;
    [74, 81, 86].forEach((n, i) => this.osc({ at: t + i * 0.08, dur: 0.35, type: 'glass', freq: hz(n), vol: 0.04, send: 0.2, bus: this.alert }));
  },
  scavengerEscape(ev, game, t) {
    if (!this.rate('scavengerEscape', 0.4)) return;
    [74, 70, 62].forEach((n, i) => this.osc({ at: t + i * 0.12, dur: 0.28, type: 'hollow', freq: hz(n), end: hz(n - 2), vol: 0.045, bus: this.alert }));
  },
  mineBurst(ev, game, t) {
    if (!this.rate('mineBurst', 0.14)) return;
    this.noise({ at: t, dur: 0.18, color: 'pink', vol: 0.075, filter: { freq: 3400, end: 700 }, pan: this.pan(ev.x), bus: this.combat });
    this.fm({ at: t, dur: 0.23, freq: 310, end: 80, ratio: 1.414, index: 3, vol: 0.04, bus: this.combat });
  },
  broadside(ev, game, t) {
    if (!this.rate('broadside', 0.75)) return;
    this.engine.duck('combat', 0.35, 0.25, 0.5);
    const side = Math.sign(Number(ev.value)) || 1;
    for (const [i, offset] of [0, 0.055, 0.11].entries()) {
      const pan = side * (0.5 - i * 0.2);
      this.noise({ at: t + offset, dur: 0.5, color: 'brown', vol: 0.14, filter: { freq: 2100, end: 180 }, pan, bus: this.alert, send: 0.15 });
      this.osc({ at: t + offset, dur: 0.65, type: 'sine', freq: 95 - i * 8, end: 28, vol: 0.14, pan, bus: this.alert });
    }
  },
  coreExposed(ev, game, t) {
    if (!this.rate('coreExposed', 2)) return;
    this.engine.duck('combat', 0.4, 0.5, 0.5);
    this.fm({ at: t, dur: 1.1, freq: 146.83, end: 587.33, ratio: 1.5, index: 4, indexEnd: 0.2, vol: 0.06, bus: this.alert });
    [74, 77, 81, 86].forEach((n, i) => this.osc({ at: t + 0.15 + i * 0.07, dur: 0.65, type: 'glass', freq: hz(n), vol: 0.035, bus: this.alert, send: 0.3 }));
  },
  actTwo(ev, game, t) {
    this.engine.duck('combat', 0.25, 1.2, 1);
    this.noise({ at: t, dur: 2.8, color: 'brown', vol: 0.12, attack: 0.3, filter: { freq: 120, end: 1200, time: 2.4 }, send: 0.3 });
  },
  arsenalScatter(ev,game,t){
    if(!this.rate('arsenalScatter',.4))return;
    this.engine.duck('all',.35,.25,.5);
    this.noise({at:t,dur:.35,color:'crackle',vol:.16,filter:{type:'highpass',freq:1500,end:400},bus:this.alert});
    [1700,2370,3180].forEach((freq,i)=>this.osc({at:t+i*.025,dur:.22,type:'glass',freq,end:freq*.33,vol:.045,pan:(i-1)*.5,bus:this.alert}));
    [0,.16].forEach(d=>this.osc({at:t+d,dur:.14,type:'triangle',freq:230,end:110,vol:.075,bus:this.alert}));
  },
  salvageRecover(ev,game,t){
    if(t<(this.recoveryUntil||0)||!this.rate('salvageRecover',.095))return;
    const count=Math.min(4,this.recoveryCount||1),steps=[0,4,7,12];
    this.recoveryNote=t-(this.recoveryLast||0)<.8?((this.recoveryNote||0)+1)%5:0;
    this.recoveryLast=t;this.recoveryUntil=t+(count-1)*.045+.13;
    for(let i=0;i<count;i++)this.osc({at:t+i*.045,dur:.095,type:'glass',freq:hz(79+this.recoveryNote*2+steps[i]),vol:.043,pan:this.pan(ev.x),bus:this.alert});
  },
  squadronBonus(ev,game,t){
    if(!this.rate('squadronBonus',.28))return;
    [0,7,12].forEach((step,i)=>this.osc({at:t+i*.065,dur:.16,type:'triangle',freq:hz(79+step),vol:.065,bus:this.alert}));
  },
  salvageExpire(ev,game,t){
    if(!this.rate('salvageExpire',.18))return;
    this.noise({at:t,dur:.09,vol:.014,filter:{type:'highpass',freq:4500,end:800},bus:this.combat});
  },
  sidewinderLaunch(ev,game,t){
    if(!this.rate('sidewinderLaunch',.18))return;
    this.noise({at:t,dur:.15,attack:.025,color:'pink',vol:.035,filter:{type:'bandpass',freq:450,end:2700,q:1},bus:this.combat});
  },
  reflect(ev,game,t){
    if(!this.rate('reflect',.10))return;
    this.osc({at:t,dur:.09,type:'glass',freq:2200,end:3200,vol:.025,bus:this.combat});
  },
  torpedoLaunch(ev,game,t){
    if (ev.value === 'enemy') {
      if (!this.rate('enemyTorpedo', 0.28)) return;
      this.osc({ at: t, dur: 0.3, type: 'reed', freq: 290, end: 95, vol: 0.055, filter: { freq: 1100 }, pan: this.pan(ev.x), bus: this.combat });
      this.noise({ at: t, dur: 0.25, color: 'pink', vol: 0.035, attack: 0.03, filter: { type: 'bandpass', freq: 1600, end: 400 }, bus: this.combat });
      return;
    }
    if(!this.rate('torpedoLaunch',.35))return;
    this.osc({at:t,dur:.17,type:'hollow',freq:115,end:42,vol:.06,bus:this.combat});
    this.noise({at:t,dur:.2,attack:.04,color:'brown',vol:.04,filter:{freq:800,end:1800},bus:this.combat});
  },
  orbitalEat(ev,game,t){
    if(!this.rate('orbitalEat',.13))return;
    this.noise({at:t,dur:.045,color:'crackle',vol:.04,filter:{type:'bandpass',freq:1900,end:600,q:2},bus:this.combat});
    this.osc({at:t,dur:.055,type:'triangle',freq:220,end:75,vol:.03,bus:this.combat});
  },
  flakEat(ev,game,t){
    if(!this.rate('flakEat',.12))return;
    this.noise({at:t,dur:.035,color:'crackle',vol:.022,filter:{type:'highpass',freq:2400,end:1100},pan:this.pan(ev.x),bus:this.combat});
  },
  escortJoin(ev,game,t){
    if(!this.rate('escortJoin',.18))return;
    [0,7,12].forEach((step,i)=>this.osc({at:t+i*.065,dur:.24,type:'hollow',freq:hz(72+step),vol:.055,pan:(i-1)*.4,bus:this.alert}));
  },
  reflectorUp(ev,game,t){
    if(!this.rate('reflectorUp',.2))return;
    this.osc({at:t,dur:.45,type:'glass',freq:420,end:1680,vol:.05,bus:this.alert});
  },
  reflectorDown(ev,game,t){
    if(!this.rate('reflectorDown',.2))return;
    this.osc({at:t,dur:.22,type:'sine',freq:1100,end:220,vol:.035,bus:this.alert});
  },
  signatureUp(ev,game,t){
    if(!this.rate('signatureUp',.2))return;
    [0,4,11,16].forEach((step,i)=>this.osc({at:t+i*.045,dur:.25,type:'glass',freq:hz(72+step),vol:.045,bus:this.alert}));
  },
  shieldUp(ev,game,t){
    if(!this.rate('shieldUp',.2))return;
    [880,1320].forEach((freq,i)=>this.osc({at:t+i*.08,dur:.28,type:'sine',freq,vol:.045,bus:this.alert}));
  },
  shoot(ev, game, t) {
    if (!this.rate('shoot', (game.player?.level||1)>7?0.085:0.055)) return;
    const p = game.player || {}, B = this.combat, pan = this.pan(ev.x), v = this.vary(0.045);
    const weight = 1 + .45 * Math.log1p(Math.max(0,(p.level||1)-1)) / (2 + Math.log1p(Math.max(0,(p.level||1)-1))), focus = Boolean(p.focus);
    this.shots++;
    if (p.weaponType === 'pierce') {
      // Wraith: a dry electric crack, a falling zip and a short chest thump.
      this.noise({ at: t, dur: 0.016, vol: 0.05, filter: { type: 'highpass', freq: 3800 }, pan, bus: B });
      this.osc({ at: t, dur: 0.08, type: 'sawtooth', freq: 2700 * v, end: 520 * v, vol: 0.028, filter: { type: 'bandpass', freq: 2300, end: 900, q: 3 }, pan, bus: B });
      this.osc({ at: t, dur: 0.06, type: 'sine', freq: 150 * v, end: 62, vol: 0.05 * weight, pan, bus: B });
    } else if (p.weaponType === 'missile') {
      // Manta: a slower, heavier cannon with an autoloader clack.
      this.noise({ at: t, dur: 0.045, color: 'pink', vol: 0.067, filter: { freq: focus ? 1500 : 2000, end: 520 }, filter2: { type: 'highpass', freq: 160 }, pan, bus: B });
      this.osc({ at: t, dur: 0.09, type: 'hollow', freq: 118 * v, end: 52, vol: 0.058 * weight, filter: { freq: 900 }, pan, bus: B });
      if (this.shots % 2 === 0) this.noise({ at: t + 0.022, dur: 0.012, vol: 0.016, filter: { type: 'highpass', freq: 5200 }, pan, bus: B });
    } else {
      // Kestrel: twin cannons alternate sides; a tight percussive thup, never a beep.
      const side = this.shots % 2 ? 0.08 : -0.08;
      this.noise({ at: t, dur: 0.028, vol: 0.062, filter: { type: 'bandpass', freq: (focus ? 2400 : 3200) * v, q: 0.9 }, pan: pan + side, bus: B });
      this.osc({ at: t, dur: 0.058, type: 'triangle', freq: 212 * v, end: 86, vol: 0.075 * weight, filter: { freq: focus ? 1200 : 1600 }, pan: pan + side, bus: B });
    }
    // Escorts add a light, wide chatter. An EMP (player.empTime > 0) takes it away: the escorts
    // fall silent and only a dead-electrics fizz is left until they reboot.
    const escorts = Math.min(6, Number(p.escorts) || 0);
    if (escorts > 0 && Number(p.empTime) > 0) {
      if (this.shots % 4 === 0) this.noise({ at: t + 0.01, dur: 0.05, color: 'crackle', vol: 0.016, filter: { type: 'highpass', freq: 3500 }, pan: (this.shots % 8 ? 0.4 : -0.4), bus: B });
    } else if (escorts > 0) {
      const side = this.shots % 2 ? 0.42 : -0.42, level = 0.02 + 0.007 * escorts;
      this.noise({ at: t + 0.018, dur: 0.026, vol: level, filter: { type: 'bandpass', freq: 5400 * v, q: 1.1 }, pan: pan + side, bus: B });
      this.osc({ at: t + 0.018, dur: 0.035, type: 'triangle', freq: 560 * v, end: 300, vol: level * 0.7, filter: { freq: 2200 }, pan: pan + side, bus: B });
    }
  },

  missileLaunch(ev, game, t) {
    if (!this.rate('missileLaunch', 0.14)) return;
    const pan = this.pan(ev.x);
    this.noise({ at: t, dur: 0.21, vol: 0.04, attack: 0.02, filter: { type: 'bandpass', freq: 700, end: 3200, q: 1.4 }, pan, panEnd: pan * 0.5, bus: this.combat });
    this.osc({ at: t, dur: 0.07, type: 'sine', freq: 96, end: 48, vol: 0.04, pan, bus: this.combat });
  },
  missileHit(ev, game, t) {
    if (!this.rate('missileHit', 0.1)) return;
    const pan = this.pan(ev.x);
    this.noise({ at: t, dur: 0.22, color: 'pink', vol: 0.07, filter: { freq: 2200, end: 360 }, pan, bus: this.combat });
    this.osc({ at: t, dur: 0.16, type: 'sine', freq: 130, end: 45, vol: 0.06, pan, bus: this.combat });
  },
  hit(ev, game, t) {
    // Flagship and reactor contacts have their own armour and core sounds.
    if (ev.value === 'boss' || ev.value === 'reactor') return;
    if (!this.rate('hit', 0.06)) return;
    const pan = this.pan(ev.x), v = this.vary(0.08);
    this.fm({ at: t, dur: 0.055, freq: 340 * v, ratio: 2.76, index: 1.6, vol: 0.03, pan, bus: this.combat });
    this.noise({ at: t, dur: 0.018, vol: 0.022, filter: { type: 'highpass', freq: 2500 }, pan, bus: this.combat });
  },
  railHit(ev, game, t) {
    if (!this.rate('railHit', 0.07)) return;
    this.osc({ at: t, dur: 0.05, type: 'sine', freq: 3200 * this.vary(0.05), end: 2350, vol: 0.012, pan: this.pan(ev.x), bus: this.combat });
  },
  bossArmorHit(ev, game, t) {
    // Deflected: a hard clank with an upward ricochet so the player hears the armour is closed.
    if (!this.rate('bossArmorHit', 0.085)) return;
    const pan = this.pan(ev.x), v = this.vary(0.06);
    this.fm({ at: t, dur: 0.12, freq: 520 * v, ratio: 1.414, index: 2.4, vol: 0.036, pan, bus: this.combat });
    this.noise({ at: t, dur: 0.03, vol: 0.026, filter: { type: 'bandpass', freq: 3000, q: 2 }, pan, bus: this.combat });
    this.osc({ at: t + 0.01, dur: 0.06, type: 'sine', freq: 1800 * v, end: 2700, vol: 0.011, pan, bus: this.combat });
  },
  bossCoreHit(ev, game, t) {
    // Damage landing: a meaty crunch with a bright ping (higher on a reactor).
    if (!this.rate('bossCoreHit', 0.07)) return;
    const pan = this.pan(ev.x), v = this.vary(0.05);
    this.noise({ at: t, dur: 0.05, color: 'pink', vol: 0.05, filter: { freq: 1900 }, pan, bus: this.combat });
    this.osc({ at: t, dur: 0.07, type: 'triangle', freq: 180 * v, end: 90, vol: 0.05, pan, bus: this.combat });
    this.osc({ at: t, dur: 0.08, type: 'glass', freq: (ev.value === 'reactor' ? 1650 : 1250) * v, vol: 0.014, pan, bus: this.combat });
  },
  explode(ev, game, t) {
    if (OWN_COLLAPSE.has(ev.value)) return; // Dedicated collapse events own these.
    const size = LARGE.has(ev.value) ? 'large' : MEDIUM.has(ev.value) ? 'medium' : 'small';
    if (!this.rate('boom-' + size, size === 'large' ? 0.09 : size === 'medium' ? 0.07 : 0.05)) return;
    this.boom(size, t, this.pan(ev.x));
  },
  reactorBreak(ev, game, t) {
    const pan = clamp(Number(ev.value) || 0, -1, 1) * 0.4;
    this.engine.duck('combat', 0.5, 0.15, 0.3);
    this.boom('large', t, pan, this.fx, 0.9);
    this.fm({ at: t, dur: 1.15, freq: 196, ratio: 1.41, index: 3, indexEnd: 0.2, vol: 0.04, pan, send: 0.35 });
    this.noise({ at: t, dur: 0.26, vol: 0.05, filter: { type: 'highpass', freq: 5000 }, pan: pan * 1.5 });
  },
  pickup(ev, game, t) {
    const type = String(ev.value || '');
    if(this.inBatch('salvageRecover')||type==='power'&&this.inBatch('powerUp'))return;
    if (this.inBatch('extend') && ['life', 'shield', 'bomb'].includes(type)) return;
    if (!this.rate('pickup', 0.05)) return;
    const pan = this.pan(ev.x);
    if (type === 'power') {
      [81, 85, 88].forEach((note, i) => this.osc({ at: t + i * 0.045, dur: 0.15, type: 'glass', freq: hz(note), vol: 0.048, pan }));
      this.noise({ at: t, dur: 0.13, vol: 0.012, filter: { type: 'highpass', freq: 7000 }, pan });
    } else if (type === 'shield') {
      this.osc({ at: t, dur: 0.22, type: 'sine', freq: hz(84), vol: 0.045, pan });
      this.osc({ at: t + 0.07, dur: 0.26, type: 'sine', freq: hz(91), vol: 0.04, pan, send: 0.15 });
      this.noise({ at: t, dur: 0.26, vol: 0.015, attack: 0.1, filter: { type: 'bandpass', freq: 4000, q: 1 }, pan });
    } else if (type === 'bomb') {
      this.osc({ at: t, dur: 0.12, type: 'sine', freq: 140, end: 70, vol: 0.07, pan });
      this.fm({ at: t, dur: 0.36, freq: hz(76), ratio: 3.5, index: 1.2, vol: 0.036, pan });
      this.fm({ at: t + 0.08, dur: 0.4, freq: hz(83), ratio: 3.5, index: 1.2, vol: 0.03, pan, send: 0.15 });
    } else if (type === 'life') {
      [74, 78, 81, 86].forEach((note, i) => this.osc({ at: t + i * 0.07, dur: 0.26, type: 'brass', freq: hz(note), vol: 0.04, filter: { freq: 3000 }, pan }));
      this.osc({ at: t + 0.28, dur: 0.4, type: 'glass', freq: hz(98), vol: 0.024, pan, send: 0.2 });
    } else {
      this.osc({ at: t, dur: 0.08, type: 'glass', freq: hz(88), vol: 0.045, pan });
      this.osc({ at: t + 0.05, dur: 0.17, type: 'glass', freq: hz(93), vol: 0.04, pan });
    }
  },
  drop(ev, game, t) {
    if (!this.rate('drop', 0.2)) return;
    this.osc({ at: t, dur: 0.055, type: 'sine', freq: 520, end: 790, vol: 0.016, pan: this.pan(ev.x) });
  },
  powerUp(ev, game, t) {
    if (!this.rate('powerUp', 0.2)) return;
    const level = Math.max(1,Number(ev.value)||1), root = 62 + 8*Math.log2(1+level)/Math.log2(14), pan = this.pan(ev.x);
    this.osc({ at: t, dur: 0.33, type: 'sawtooth', freq: 220, end: 1400, vol: 0.026, filter: { type: 'bandpass', freq: 600, end: 3000, q: 2.5 }, pan });
    [0, 4, 7, 12].forEach((step, i) => this.osc({ at: t + 0.04 + i * 0.035, dur: 0.34, type: 'brass', freq: hz(root + step), vol: 0.034, filter: { freq: 2800 }, pan, send: 0.15 }));
    this.noise({ at: t, dur: 0.3, vol: 0.014, attack: 0.08, filter: { type: 'highpass', freq: 6000 }, pan });
  },
  graze(ev, game, t) {
    if (!this.rate('graze', 0.075)) return;
    const pan = this.pan(ev.x), step = (Number(ev.value) || 0) % 8;
    this.noise({ at: t, dur: 0.03, vol: 0.011, filter: { type: 'highpass', freq: 6200 }, pan, bus: this.combat });
    this.osc({ at: t, dur: 0.036, type: 'sine', freq: 2100 + step * 45, end: 2500 + step * 45, vol: 0.007, pan, bus: this.combat });
  },
  wakeReady(ev, game, t) {
    if (!this.rate('wakeReady', 0.4)) return;
    [81, 88, 93].forEach((note, i) => this.osc({ at: t + i * 0.06, dur: 0.24, type: 'glass', freq: hz(note), vol: 0.042, send: 0.2 }));
    this.noise({ at: t, dur: 0.32, vol: 0.012, attack: 0.12, filter: { type: 'bandpass', freq: 5000, q: 1.2 } });
  },
  roll(ev, game, t) {
    if (game.player?.rollCharged || this.inBatch('wakeRoll')) return;
    if (!this.rate('roll', 0.1)) return;
    const pan = this.pan(ev.x);
    this.noise({ at: t, dur: 0.3, color: 'pink', vol: 0.06, attack: 0.06, filter: { type: 'bandpass', freq: 500, end: 2400, time: 0.2, q: 1.2 }, pan: pan - 0.3, panEnd: pan + 0.3 });
    this.osc({ at: t, dur: 0.2, type: 'sine', freq: 260, end: 520, vol: 0.012, pan });
  },
  wakeRoll(ev, game, t) {
    const pan = this.pan(ev.x);
    this.engine.duck('combat', 0.55, 0.1, 0.25);
    this.noise({ at: t, dur: 0.46, color: 'pink', vol: 0.1, attack: 0.05, filter: { type: 'bandpass', freq: 300, end: 3200, time: 0.3, q: 1 }, pan: pan - 0.35, panEnd: pan + 0.35 });
    this.osc({ at: t, dur: 0.36, type: 'sawtooth', freq: 160, end: 900, vol: 0.032, filter: { freq: 2000 }, pan });
    this.osc({ at: t + 0.08, dur: 0.32, type: 'glass', freq: hz(88), vol: 0.03, pan, send: 0.2 });
  },
  wakeConvert(ev, game, t) {
    if (!this.rate('wakeConvert', 0.06)) return;
    const count = clamp(Number(ev.value) || 1, 1, 20), pan = this.pan(ev.x);
    this.osc({ at: t, dur: 0.075, type: 'glass', freq: 1100 + count * 22, end: (1100 + count * 22) * 1.5, vol: Math.min(0.05, 0.02 + count * 0.004), pan, bus: this.combat });
    this.noise({ at: t, dur: 0.04, vol: 0.012, filter: { type: 'highpass', freq: 7000 }, pan, bus: this.combat });
    if (count >= 4) this.osc({ at: t + 0.04, dur: 0.15, type: 'sine', freq: hz(96), vol: 0.02, pan });
  },
  rollStrike(ev, game, t) {
    if (!this.rate('rollStrike', 0.1)) return;
    const pan = this.pan(ev.x);
    this.noise({ at: t, dur: 0.12, vol: 0.07, filter: { type: 'bandpass', freq: 1800, q: 2 }, pan });
    this.osc({ at: t, dur: 0.15, type: 'sawtooth', freq: 260, end: 80, vol: 0.04, filter: { freq: 1600 }, pan });
    if (ev.charged) this.osc({ at: t + 0.02, dur: 0.12, type: 'glass', freq: hz(84), vol: 0.02, pan });
  },
  shieldHit(ev, game, t) {
    if (this.inBatch('shieldBreak') || !this.rate('shieldHit', 0.15)) return;
    const pan = this.pan(ev.x);
    this.fm({ at: t, dur: 0.2, freq: 760, ratio: 1.5, index: 2.2, vol: 0.05, pan });
    this.noise({ at: t, dur: 0.07, vol: 0.03, filter: { type: 'highpass', freq: 3000 }, pan });
    this.osc({ at: t, dur: 0.18, type: 'sine', freq: 980, end: 520, vol: 0.03, pan, send: 0.12 });
  },
  shieldBreak(ev, game, t) {
    const pan = this.pan(ev.x);
    this.engine.duck('combat', 0.6, 0.08, 0.2);
    for (let i = 0; i < 5; i++) {
      this.noise({ at: t + Math.abs(this.rnd()) * 0.15, dur: 0.05 + Math.abs(this.rnd()) * 0.07, vol: 0.04,
        filter: { type: 'bandpass', freq: 6000 + Math.abs(this.rnd()) * 3000, q: 3 }, pan: pan + this.rnd() * 0.4 });
    }
    this.osc({ at: t, dur: 0.5, type: 'triangle', freq: 1150, end: 160, vol: 0.07, pan, send: 0.25 });
    this.osc({ at: t, dur: 0.2, type: 'sine', freq: 110, end: 50, vol: 0.07, pan });
  },
  shieldRestore(ev, game, t) {
    if (!this.rate('shieldRestore', 0.3)) return;
    const pan = this.pan(ev.x);
    [76, 83, 88].forEach((note, i) => this.osc({ at: t + i * 0.07, dur: 0.26, type: 'sine', freq: hz(note), vol: 0.04, pan }));
    this.noise({ at: t, dur: 0.36, vol: 0.012, attack: 0.15, filter: { type: 'bandpass', freq: 3500, q: 1 }, pan, send: 0.2 });
  },
  playerHit(ev, game, t) {
    if (this.inBatch('lifeLost') || !this.rate('playerHit', 0.2)) return;
    const pan = this.pan(ev.x);
    this.engine.duck('beds', 0.6, 0.12, 0.45);
    this.engine.duck('combat', 0.35, 0.1, 0.35);
    this.noise({ at: t, dur: 0.36, color: 'pink', vol: 0.15, filter: { freq: 1500, end: 300 }, pan });
    this.osc({ at: t, dur: 0.38, type: 'sawtooth', freq: 420, end: 70, vol: 0.075, filter: { freq: 1100 }, pan });
    this.osc({ at: t, dur: 0.26, type: 'sine', freq: 92, end: 40, vol: 0.14, pan });
    this.osc({ at: t + 0.02, dur: 0.08, type: 'square', freq: hz(81), vol: 0.028, filter: { type: 'bandpass', freq: 1500, q: 1.5 }, bus: this.alert });
    this.osc({ at: t + 0.12, dur: 0.1, type: 'square', freq: hz(77), vol: 0.026, filter: { type: 'bandpass', freq: 1500, q: 1.5 }, bus: this.alert });
  },
  lifeLost(ev, game, t) {
    this._cutEmp();
    const pan = this.pan(ev.x);
    this.engine.duck('beds', 0.45, 0.3, 0.8);
    this.engine.duck('combat', 0.25, 0.25, 0.6);
    this.boom('large', t, pan, this.fx, 1);
    this.osc({ at: t, dur: 1.0, type: 'sine', freq: 700, end: 70, vol: 0.05, pan, send: 0.2 });
    this.osc({ at: t, dur: 0.9, type: 'sine', freq: 52, end: 25, vol: 0.2 });
    this.noise({ at: t + 0.1, dur: 1.2, color: 'crackle', vol: 0.04, filter: { type: 'highpass', freq: 900 }, pan, send: 0.3 });
    this.osc({ at: t + 0.05, dur: 0.16, type: 'square', freq: hz(76), vol: 0.03, filter: { type: 'bandpass', freq: 1400, q: 1.4 }, bus: this.alert });
    this.osc({ at: t + 0.24, dur: 0.24, type: 'square', freq: hz(69), vol: 0.03, filter: { type: 'bandpass', freq: 1400, q: 1.4 }, bus: this.alert });
  },
  bomb(ev, game, t) {
    const variant = String(ev.value || game.player?.specialType || 'nova');
    const pan = this.pan(ev.x);
    if (variant === 'barrier') {
      // Manta BARRIER: a shield dome rises around the hull and hums.
      this.engine.duck('beds', 0.7, 0.1, 0.3);
      this.engine.duck('combat', 0.5, 0.2, 0.3);
      this.fm({ at: t, dur: 0.95, freq: hz(62), ratio: 2, index: 1.5, vol: 0.06, pan, send: 0.3 });
      this.osc({ at: t, dur: 0.9, type: 'sawtooth', freq: 110, vol: 0.035, attack: 0.08, filter: { freq: 650 }, pan });
      this.osc({ at: t, dur: 0.42, type: 'sine', freq: 280, end: 760, vol: 0.06, pan });
      this.osc({ at: t + 0.08, dur: 0.5, type: 'triangle', freq: 560, end: 1120, vol: 0.04, pan, send: 0.2 });
      this.noise({ at: t, dur: 0.3, vol: 0.024, filter: { type: 'highpass', freq: 6000 }, pan });
    } else if (variant === 'storm') {
      // Wraith STORM: a burst of electrical arcs and a rolling thunder bed.
      this.engine.duck('beds', 0.55, 0.25, 0.6);
      this.engine.duck('combat', 0.35, 0.3, 0.5);
      for (let i = 0; i < 6; i++) {
        this.noise({ at: t + i * 0.12 + Math.abs(this.rnd()) * 0.05, dur: 0.03 + Math.abs(this.rnd()) * 0.045, vol: 0.06,
          filter: { type: 'bandpass', freq: 1800 + Math.abs(this.rnd()) * 3200, q: 4 }, pan: this.rnd() * 0.5, send: 0.2 });
      }
      this.osc({ at: t, dur: 0.5, type: 'sine', freq: 930, end: 240, vol: 0.05, pan });
      this.noise({ at: t, dur: 1.4, color: 'brown', vol: 0.22, attack: 0.05, filter: { freq: 620, end: 120 }, send: 0.25 });
      this.osc({ at: t, dur: 0.8, type: 'sawtooth', freq: 96, end: 40, vol: 0.05, filter: { freq: 700 } });
    } else {
      // Kestrel NOVA: a short inhale, then a screen-wide detonation.
      this.engine.duck('beds', 0.4, 0.3, 0.9);
      this.engine.duck('combat', 0.15, 0.35, 0.6);
      this.noise({ at: t, dur: 0.12, vol: 0.05, attack: 0.1, filter: { type: 'bandpass', freq: 800, end: 6000, q: 1 }, pan });
      const at = t + 0.06;
      this.noise({ at, dur: 1.6, color: 'brown', vol: 0.32, filter: { freq: 3200, end: 180, time: 1.3 }, pan: -0.3, send: 0.35 });
      this.noise({ at: at + 0.008, dur: 1.5, color: 'pink', vol: 0.14, filter: { freq: 2600, end: 220, time: 1.2 }, pan: 0.3 });
      this.osc({ at, dur: 1.3, type: 'sine', freq: 58, end: 26, vol: 0.3 });
      this.noise({ at, dur: 0.18, vol: 0.1, filter: { type: 'highpass', freq: 3500 } });
      this.osc({ at: at + 0.05, dur: 1.2, type: 'glass', freq: hz(86), vol: 0.022, send: 0.5 });
    }
  },
  bossEnter(ev, game, t) {
    const stage = sectorOf(ev.stage || ev.value, game), root = FLAGSHIP_ROOT[stage];
    if (stage === 5) {
      // HALCYON: a wall of engines climbs over the horizon, then a wide F-minor wing chord.
      this.engine.duck('combat', 0.32, 1, 1);
      this.noise({ at: t, dur: 3, color: 'pink', vol: 0.09, attack: 1.4, filter: { type: 'bandpass', freq: 260, end: 1800, time: 2.4, q: 0.9 }, pan: -0.5, panEnd: 0.5, send: 0.35 });
      for (const [k, step] of [0, 3, 7].entries()) {
        this.osc({ at: t + 0.4 + k * 0.08, dur: 2.6, type: 'brass', freq: hz(root + 12 + step), vol: 0.035, attack: 0.5, hold: 0.8, filter: { freq: 500, end: 2400, time: 1.2 }, pan: (k - 1) * 0.35, send: 0.4 });
      }
    }
    if (stage === 4) {
      this.engine.duck('combat', 0.3, 1, 1);
      this.osc({ at: t, dur: 3.1, type: 'horn', freq: hz(root), vol: 0.08, attack: 0.3, hold: 0.7, filter: { freq: 900 }, send: 0.4 });
      this.fm({ at: t + 0.1, dur: 2.8, freq: 73.42, ratio: 2.76, index: 2, vol: 0.055, send: 0.4 });
    }
    this.engine.duck('beds', 0.55, 0.8, 1.2);
    this.osc({ at: t, dur: 0.6, type: 'sine', freq: 82, end: 30, vol: 0.16 });
    this.noise({ at: t, dur: 0.42, color: 'pink', vol: 0.1, filter: { freq: 1200, end: 300 } });
    this.osc({ at: t + 0.05, dur: 2.0, type: 'sawtooth', freq: hz(root), vol: 0.06, attack: 0.35, hold: 0.5, filter: { freq: 220, end: 1100, time: 1.2 }, drive: 'soft', pan: -0.15, send: 0.25 });
    this.osc({ at: t + 0.05, dur: 2.0, type: 'sawtooth', freq: hz(root + 7) * 1.003, vol: 0.045, attack: 0.35, hold: 0.5, filter: { freq: 220, end: 1000, time: 1.2 }, drive: 'soft', pan: 0.15, send: 0.25 });
    this.osc({ at: t + 0.05, dur: 2.0, type: 'sine', freq: hz(root - 12), vol: 0.1, attack: 0.3, hold: 0.6 });
    this.noise({ at: t, dur: 2.2, color: 'brown', vol: 0.11, attack: 0.4, filter: { freq: 300 } });
    this.fm({ at: t + 0.3, dur: 1.6, freq: hz(root + 12), ratio: 1.414, index: 2, indexEnd: 0.3, vol: 0.028, send: 0.35 });
  },
  bossPhase(ev, game, t) {
    const stage = sectorOf(ev.stage, game), phase = clamp(Number(ev.value) || 2, 2, 3), root = FLAGSHIP_ROOT[stage];
    if (stage === 5) {
      // HALCYON reconfigures: servo whine up, hatch slam, then the new mode's tonic below.
      this.engine.duck('combat', 0.38, 0.5, 0.5);
      this.osc({ at: t, dur: 0.7, type: 'sawtooth', freq: 180, end: phase === 3 ? 1400 : 980, vol: 0.03, filter: { type: 'bandpass', freq: 700, end: 2600, q: 3 }, send: 0.2 });
      this.fm({ at: t + 0.62, dur: 0.6, freq: 160, end: 70, ratio: 2.76, index: 4, vol: 0.05, send: 0.3 });
      this.osc({ at: t + 0.62, dur: 1.5, type: 'horn', freq: hz(root + (phase === 3 ? 1 : 0)), vol: 0.07, attack: 0.08, hold: 0.4, filter: { freq: 1100 }, send: 0.35 });
    }
    if (stage === 4) {
      this.engine.duck('combat', 0.35, 0.6, 0.5);
      this.boom('large', t, 0, this.fx, 0.7);
      this.osc({ at: t + 0.1, dur: 1.4, type: 'horn', freq: hz(root + (phase === 3 ? 12 : 7)), vol: 0.075, attack: 0.12, filter: { freq: 1400 }, send: 0.3 });
    }
    this.engine.duck('beds', 0.6, 0.3, 0.6);
    this.osc({ at: t, dur: 0.5, type: 'sine', freq: 72, end: 30, vol: 0.15 });
    this.noise({ at: t, dur: 0.45, color: 'pink', vol: 0.12, filter: { freq: 1600, end: 300 }, send: 0.15 });
    const steps = phase === 3 ? [12, 19, 24] : [12, 19];
    for (const step of steps) {
      this.osc({ at: t + 0.02, dur: 0.9, type: 'sawtooth', freq: hz(root + step), vol: 0.04, attack: 0.05, filter: { freq: 400, end: 1700, time: 0.3 }, drive: 'soft', pan: step === 19 ? 0.2 : -0.1, send: 0.2 });
    }
    this.fm({ at: t, dur: 0.3, freq: 300, ratio: 1.41, index: 3, vol: 0.038 });
  },
  bossGuard(ev, game, t) {
    const pan = this.pan(ev.x);
    this.osc({ at: t, dur: 0.55, type: 'sawtooth', freq: 260, end: 820, vol: 0.024, filter: { type: 'bandpass', freq: 600, end: 2000, q: 3 }, pan });
    this.noise({ at: t, dur: 0.08, color: 'pink', vol: 0.06, filter: { freq: 900 }, pan });
    this.noise({ at: t + 0.45, dur: 0.09, color: 'pink', vol: 0.07, filter: { freq: 800 }, pan });
    this.osc({ at: t, dur: 0.6, type: 'sine', freq: 55, vol: 0.05, attack: 0.05, pan });
  },
  bossGuardEnd(ev, game, t) {
    const pan = this.pan(ev.x);
    this.noise({ at: t, dur: 0.45, vol: 0.05, filter: { type: 'highpass', freq: 2500, end: 1200 }, pan });
    this.noise({ at: t, dur: 0.08, color: 'pink', vol: 0.06, filter: { freq: 800 }, pan });
    this.osc({ at: t + 0.12, dur: 0.3, type: 'glass', freq: hz(88), vol: 0.03, pan });
    this.osc({ at: t + 0.2, dur: 0.34, type: 'glass', freq: hz(93), vol: 0.03, pan, send: 0.2 });
  },
  bossShot(ev, game, t) {
    if (!this.rate('bossShot', 0.16)) return;
    const pan = this.pan(ev.x);
    this.osc({ at: t, dur: 0.09, type: 'sine', freq: 170, end: 85, vol: 0.022, pan, bus: this.combat });
    this.noise({ at: t, dur: 0.05, color: 'pink', vol: 0.02, filter: { freq: 900 }, pan, bus: this.combat });
  },
  reactorOpen(ev, game, t) {
    const pan = clamp(Number(ev.value) || 0, -1, 1) * 0.5;
    this.noise({ at: t, dur: 0.4, vol: 0.03, attack: 0.05, filter: { type: 'highpass', freq: 1500 }, pan });
    this.osc({ at: t, dur: 0.35, type: 'sawtooth', freq: 300, end: 600, vol: 0.015, filter: { type: 'bandpass', freq: 900, q: 2 }, pan });
    this.osc({ at: t + 0.35, dur: 0.08, type: 'sine', freq: hz(88), vol: 0.03, pan, bus: this.alert });
    this.osc({ at: t + 0.5, dur: 0.1, type: 'sine', freq: hz(93), vol: 0.03, pan, bus: this.alert });
  },
  lanceLock(ev, game, t) {
    // Locked: three hard alarm chirps over a charging riser that ends as the lance fires.
    this.engine.duck('combat', 0.55, 0.75, 0.25);
    const pan = this.pan(ev.x);
    [1320, 1760, 1320].forEach((freq, i) => this.osc({ at: t + i * 0.1, dur: 0.06, type: 'square', freq, vol: 0.04, filter: { type: 'bandpass', freq: 1600, q: 1.2 }, pan, bus: this.alert }));
    this.osc({ at: t, dur: 0.85, type: 'sawtooth', freq: 80, end: 140, vol: 0.04, attack: 0.1, filter: { freq: 300, end: 1800, time: 0.85 }, pan, bus: this.alert });
    this.noise({ at: t, dur: 0.85, vol: 0.02, attack: 0.6, filter: { type: 'bandpass', freq: 400, end: 2400, q: 1.2 }, pan, bus: this.alert });
  },
  lanceFire(ev, game, t) {
    // A thick beating beam with a sizzle and a body you feel.
    this.engine.duck('combat', 0.5, 0.4, 0.3);
    const pan = this.pan(ev.x);
    this.noise({ at: t, dur: 0.03, vol: 0.08, filter: { type: 'highpass', freq: 3000 }, pan });
    this.osc({ at: t, dur: 0.5, type: 'sawtooth', freq: 68, vol: 0.055, attack: 0.01, hold: 0.35, filter: { freq: 1400 }, drive: 'soft', pan: pan - 0.1 });
    this.osc({ at: t, dur: 0.5, type: 'sawtooth', freq: 68.9, vol: 0.055, attack: 0.01, hold: 0.35, filter: { freq: 1400 }, drive: 'soft', pan: pan + 0.1 });
    this.noise({ at: t, dur: 0.5, vol: 0.045, attack: 0.01, hold: 0.35, filter: { type: 'bandpass', freq: 2400, q: 0.8 }, pan });
    this.osc({ at: t, dur: 0.5, type: 'sine', freq: 45, vol: 0.1, attack: 0.01, hold: 0.3 });
  },
  lanceCancel(ev, game, t) {
    const pan = this.pan(ev.x);
    this.noise({ at: t, dur: 0.35, vol: 0.05, filter: { type: 'highpass', freq: 4000, end: 700 }, pan });
    this.osc({ at: t, dur: 0.4, type: 'sine', freq: 520, end: 110, vol: 0.04, pan });
    this.noise({ at: t, dur: 0.012, vol: 0.03, filter: { type: 'bandpass', freq: 2000, q: 2 }, pan });
  },
  flank(ev, game, t) {
    if (!this.rate('flank', 0.8)) return;
    this.osc({ at: t, dur: 0.05, type: 'sine', freq: 980, vol: 0.02, bus: this.alert });
    this.osc({ at: t + 0.07, dur: 0.06, type: 'sine', freq: 1310, vol: 0.018, bus: this.alert });
  },
  wave(ev, game, t) {
    if (!this.rate('wave', 1)) return;
    this.osc({ at: t, dur: 0.05, type: 'sine', freq: hz(93), vol: 0.012 });
    this.osc({ at: t + 0.08, dur: 0.07, type: 'sine', freq: hz(100), vol: 0.01, send: 0.2 });
  },
  lane(ev, game, t) {
    if (!this.rate('lane', 1.5)) return;
    const from = Number(ev.x) || 270, to = Number(ev.value) || 270;
    this.noise({ at: t, dur: 0.6, color: 'pink', vol: 0.02, attack: 0.25, filter: { type: 'bandpass', freq: 300, end: 1200, q: 1 }, pan: this.pan(from), panEnd: this.pan(to) });
  },
  extend(ev, game, t) {
    [74, 78, 81, 86].forEach((note, i) => this.osc({ at: t + i * 0.06, dur: 0.6 - i * 0.06, type: 'brass', freq: hz(note), vol: 0.03, filter: { freq: 3200 }, send: 0.25 }));
    this.osc({ at: t + 0.24, dur: 0.5, type: 'glass', freq: hz(98), vol: 0.025, send: 0.3 });
    this.noise({ at: t, dur: 0.5, vol: 0.012, attack: 0.2, filter: { type: 'highpass', freq: 7000 } });
  },
  stage(ev, game, t) {
    // Comms open: a static burst, two beeps and the air of the next sector.
    this._cutEmp();
    this.noise({ at: t, dur: 0.12, vol: 0.028, filter: { type: 'bandpass', freq: 1800, q: 1.5 } });
    this.osc({ at: t + 0.12, dur: 0.06, type: 'sine', freq: hz(81), vol: 0.03 });
    this.osc({ at: t + 0.2, dur: 0.08, type: 'sine', freq: hz(88), vol: 0.03, send: 0.2 });
    this.noise({ at: t, dur: 1.2, color: 'pink', vol: 0.04, attack: 0.5, filter: { type: 'bandpass', freq: 200, end: 900, q: 0.9 } });
  },
  bossDown(ev, game, t) {
    this._cutEmp();
    this.engine.duck('beds', 0.35, 1.6, 1.6);
    this.engine.duck('combat', 0.2, 1.6, 1);
    // HALCYON's fall is voiced by wingBreak; bossDown keeps only the opening blasts for it.
    if (this.inBatch('wingBreak') || Number(ev.value ?? ev.stage ?? game.stage) === 5) {
      this.engine.duck('combat', 0.2, 1.6, 1);
      [0, 0.16, 0.38].forEach((offset, i) => this.boom(i ? 'large' : 'medium', t + offset, this.rnd() * 0.5, this.fx, 0.95 + i * 0.08));
      return;
    }
    const leviathan = Number(ev.stage || game.stage) === 4;
    const times = leviathan ? [0, 0.14, 0.32, 0.58, 0.88, 1.2, 1.55] : [0, 0.18, 0.42, 0.7, 1.05];
    times.forEach((offset, i) => this.boom(i < 2 ? 'medium' : 'large', t + offset, this.rnd() * 0.4, this.fx, 0.75 + i * 0.07));
    if (leviathan) {
      this.fm({ at: t + 1.6, dur: 3.5, freq: 110, end: 24, ratio: 2.76, index: 5, vol: 0.08, send: 0.5 });
      this.noise({ at: t + 2.5, dur: 3, color: 'brown', vol: 0.14, filter: { freq: 500, end: 70 }, send: 0.4 });
    }
    const at = t + (leviathan ? 1.8 : 1.3);
    this.noise({ at, dur: 2.6, color: 'brown', vol: 0.3, filter: { freq: 2500, end: 150, time: 2.2 }, pan: -0.3, send: 0.4 });
    this.noise({ at: at + 0.01, dur: 2.4, color: 'pink', vol: 0.12, filter: { freq: 2000, end: 200, time: 2 }, pan: 0.3 });
    this.osc({ at, dur: 2.2, type: 'sine', freq: 50, end: 22, vol: 0.28 });
    this.noise({ at: at + 0.1, dur: 2.8, color: 'crackle', vol: 0.05, filter: { type: 'highpass', freq: 1000 }, send: 0.3 });
    this.fm({ at: t + 0.2, dur: 2.5, freq: hz(28), ratio: 1.41, index: 2, indexEnd: 0.2, vol: 0.04, send: 0.4 });
  },
  gameover(ev, game, t) {
    this._cutEmp();
    // Signal lost: two falling carriers through static, then a distant boom.
    this.osc({ at: t, dur: 1.8, type: 'sine', freq: 880, end: 110, vol: 0.045, send: 0.3 });
    this.osc({ at: t + 0.1, dur: 2.0, type: 'sine', freq: 442, end: 55, vol: 0.045, send: 0.3 });
    this.noise({ at: t, dur: 1.6, vol: 0.028, attack: 0.05, filter: { type: 'bandpass', freq: 2400, q: 0.7 } });
    this.osc({ at: t + 0.15, dur: 1.2, type: 'sine', freq: 55, end: 30, vol: 0.12 });
  },
  victory(ev, game, t) {
    // Operation complete: a D major chord swells under a rising bell arpeggio.
    for (const note of [62, 66, 69, 74, 78]) {
      this.osc({ at: t, dur: 1.8, type: 'brass', freq: hz(note), vol: 0.026, attack: 0.25, filter: { freq: 800, end: 3000, time: 0.6 }, send: 0.3 });
    }
    [86, 90, 93, 98].forEach((note, i) => this.osc({ at: t + 0.1 + i * 0.09, dur: 0.5, type: 'glass', freq: hz(note), vol: 0.025, send: 0.35 }));
    this.noise({ at: t, dur: 1.5, vol: 0.03, attack: 0.6, filter: { type: 'highpass', freq: 5000 } });
  },

  // ------------------------------------------------------------- sector 5: SKYFORGE
  boxEnter(ev, game, t) {
    // The audio half of the edge warning, ~1.2 s before entry: a box of four piston engines
    // swelling up from below (or bearing down from above), each engine a few cents apart.
    if (!this.rate('boxEnter', 1)) return;
    // `lead` is the warning time the simulation gives (1.2 s); the swell peaks as the box enters.
    const climb = ev.value !== 'dive', pan = this.pan(ev.x), lead = clamp(Number(ev.lead) || 1.2, 0.6, 2), dur = lead + 0.35;
    const width = clamp(((Math.max(...(ev.xs || [270])) - Math.min(...(ev.xs || [270]))) / 540) * 0.6, 0.12, 0.6);
    for (let k = 0; k < 4; k++) {
      const f = (climb ? 54 : 88) * (1 + k * 0.011), to = climb ? f * 1.55 : f * 0.86;
      this.osc({ at: t, dur, type: k % 2 ? 'reed' : 'sawtooth', freq: f, end: to, glide: dur, vol: 0.026, attack: lead * 0.96,
        filter: { freq: climb ? 160 : 420, end: climb ? 1300 : 1000, time: lead }, pan: pan + (k / 3 - 0.5) * width, bus: this.alert });
    }
    this.noise({ at: t, dur, color: 'brown', vol: 0.09, attack: lead * 0.92, filter: { type: 'bandpass', freq: climb ? 80 : 300, end: 520, time: lead, q: 0.9 }, pan, bus: this.alert });
    if (climb) this.osc({ at: t, dur, type: 'sine', freq: 38, end: 56, vol: 0.07, attack: lead * 0.85, bus: this.alert });
  },
  gunnerFire(ev, game, t) {
    // Tail gunners: one dry, mid-heavy crack per round of the burst (value = rounds, 0.12 s apart
    // as the simulation fires them), so it reads apart from player fire.
    if (!this.rate('gunnerFire', 0.14)) return;
    const pan = this.pan(ev.x), rounds = clamp(Math.round(Number(ev.value) || 3), 1, 4);
    for (let k = 0; k < rounds; k++) {
      this.noise({ at: t + k * 0.12, dur: 0.032, vol: 0.045, filter: { type: 'bandpass', freq: 1500 * this.vary(0.1), q: 1.3 }, pan, bus: this.combat });
      if (k === 0 || k === rounds - 1) this.osc({ at: t + k * 0.12, dur: 0.07, type: 'triangle', freq: 150, end: 80, vol: 0.026, filter: { freq: 700 }, pan, bus: this.combat });
    }
  },
  skyAceDodge(ev, game, t) {
    // A sky ace slips the firing line: a quick air whoosh that swings across the ace.
    if (!this.rate('skyAceDodge', 0.35)) return;
    const pan = this.pan(ev.x), dir = Math.sign(Number(ev.value) || this.rnd()) || 1;
    this.noise({ at: t, dur: 0.32, color: 'pink', vol: 0.05, attack: 0.09, filter: { type: 'bandpass', freq: 700, end: 2900, time: 0.18, q: 1.3 }, pan: pan - dir * 0.35, panEnd: pan + dir * 0.35 });
    this.osc({ at: t, dur: 0.22, type: 'sine', freq: 980, end: 620, vol: 0.008, pan });
  },
  flakMark(ev, game, t) {
    // Altitude marked: tick-tick, pitched by the band's height (higher on screen, higher tick).
    if (!this.rate('flakMark', 0.25)) return;
    const f = 2300 + clamp(1 - (Number(ev.y) || 480) / 960, 0, 1) * 900;
    for (const d of [0, 0.11]) {
      this.osc({ at: t + d, dur: 0.035, type: 'square', freq: f, vol: 0.022, filter: { type: 'bandpass', freq: f, q: 4 }, bus: this.alert });
      this.noise({ at: t + d, dur: 0.012, vol: 0.02, filter: { type: 'highpass', freq: 5000 }, bus: this.alert });
    }
  },
  flakBurst(ev, game, t) {
    // The band bursts: a wide row of crumps with shrapnel rattling out across the stereo field.
    if (!this.rate('flakBurst', 0.2)) return;
    for (const [i, pan] of [-0.55, 0, 0.55].entries()) {
      this.noise({ at: t + i * 0.032, dur: 0.36, color: 'pink', vol: 0.07, filter: { freq: 1700 * this.vary(0.1), end: 280 }, pan });
    }
    this.osc({ at: t, dur: 0.32, type: 'sine', freq: 96, end: 34, vol: 0.075 });
    this.noise({ at: t + 0.04, dur: 0.45, color: 'crackle', vol: 0.045, filter: { type: 'highpass', freq: 2200 }, pan: 0.2, send: 0.12 });
  },
  foundryEnter(ev, game, t) {
    // A factory platform heaves into view: a low two-note horn over a rhythmic machine knock.
    if (!this.rate('foundryEnter', 2)) return;
    // The large foundry (value "large", with void batteries) sounds a fifth lower and knocks five times.
    const pan = this.pan(ev.x), large = ev.value === 'large', drop = large ? 5 : 0;
    for (const [offset, f] of [[0, hz(41 - drop)], [0.22, hz(48 - drop)]]) this.osc({ at: t + offset, dur: large ? 2 : 1.6, type: 'horn', freq: f, vol: 0.055, attack: 0.2, hold: large ? 0.6 : 0.3, filter: { freq: 700 }, pan, send: 0.3, bus: this.alert });
    for (let k = 0; k < (large ? 5 : 3); k++) this.fm({ at: t + 0.3 + k * 0.26, dur: 0.3, freq: (large ? 150 : 190) - k * 12, ratio: 2.76, index: 3.5, vol: 0.03, pan: pan + (k % 3 - 1) * 0.2, send: 0.25, bus: this.alert });
  },
  foundryDown(ev, game, t) {
    // The platform fails: blast, a long metal groan, and girders clattering away below.
    if (!this.rate('foundryDown', 0.65)) return;
    const pan = this.pan(ev.x), large = ev.value === 'large';
    this.engine.duck('combat', 0.5, 0.45, 0.6);
    this.boom('large', t, pan, this.fx, 0.95);
    if (large) this.boom('large', t + 0.3, -pan, this.fx, 0.8);
    this.fm({ at: t + 0.12, dur: large ? 2.4 : 1.8, freq: large ? 100 : 125, end: 36, ratio: 1.41, index: 4, vol: 0.05, send: 0.3 });
    this.noise({ at: t + 0.4, dur: 1.7, color: 'brown', vol: 0.09, filter: { freq: 900, end: 90 }, send: 0.25 });
    for (let k = 0; k < 3; k++) this.fm({ at: t + 0.5 + k * 0.23, dur: 0.35, freq: 420 - k * 70, ratio: 2.76, index: 3, vol: 0.022, pan: pan + this.rnd() * 0.5, send: 0.3 });
  },
  bayDown(ev, game, t) {
    // A launch bay is gutted: blast, hatch slam, and its launcher spinning down.
    if (!this.rate('bayDown', 0.18)) return;
    const pan = this.pan(ev.x), flagship = ev.value === 'boss' || ev.value === game?.boss?.id || Number(ev.stage) === 5;
    this.boom('medium', t, pan, flagship ? this.fx : this.combat, flagship ? 1.05 : 0.9);
    this.fm({ at: t + 0.02, dur: 0.32, freq: 240, end: 150, ratio: 2.76, index: 3, vol: 0.035, pan, bus: flagship ? this.fx : this.combat });
    this.osc({ at: t + 0.05, dur: 0.55, type: 'sawtooth', freq: 900, end: 110, vol: 0.016, filter: { type: 'bandpass', freq: 1200, end: 300, q: 2 }, pan, bus: this.combat });
  },
  droneLaunch(ev, game, t) {
    // Popcorn leaves a bay: a pneumatic thup and a small rising whine.
    if (!this.rate('droneLaunch', 0.5)) return;
    const pan = this.pan(ev.x);
    this.noise({ at: t, dur: 0.06, color: 'pink', vol: 0.04, filter: { type: 'bandpass', freq: 900, q: 1.2 }, pan, bus: this.combat });
    this.osc({ at: t, dur: 0.07, type: 'sine', freq: 150, end: 70, vol: 0.035, pan, bus: this.combat });
    this.osc({ at: t + 0.03, dur: 0.2, type: 'square', freq: 480, end: 1500, vol: 0.006, filter: { freq: 2400 }, pan, bus: this.combat });
  },
  laserWarn(ev, game, t) {
    // A lattice bar charges: a thin tick, then a whine that climbs for the ~0.9 s telegraph.
    // One event per lattice frame; vertical bars pan to their mean x. Void (phase 3) adds a low growl.
    if (!this.rate('laserWarn', 0.12)) return;
    const bars = Array.isArray(ev.bars) && ev.bars.length ? ev.bars : [{ orient: ev.orient, pos: ev.pos }];
    const vertical = bars.filter(b => b.orient === 'v'), pan = vertical.length ? this.pan(vertical.reduce((sum, b) => sum + (Number(b.pos) || 270), 0) / vertical.length) : 0;
    const voided = ev.value === true;
    this.osc({ at: t, dur: 0.04, type: 'glass', freq: 2600, vol: 0.02, pan, bus: this.alert });
    this.osc({ at: t, dur: 0.9, type: 'sawtooth', freq: 240, end: 1250, vol: 0.02, attack: 0.8, filter: { type: 'bandpass', freq: 700, end: 2600, q: 4 }, pan, bus: this.alert });
    this.osc({ at: t, dur: 0.9, type: 'sine', freq: 480, end: 2500, vol: 0.01, attack: 0.8, pan, bus: this.alert });
    if (voided) this.osc({ at: t, dur: 0.9, type: 'sawtooth', freq: 62, end: 124, vol: 0.022, attack: 0.7, filter: { freq: 380 }, drive: 'soft', bus: this.alert });
  },
  laserFire(ev, game, t) {
    // The bar fires: a beating, driven beam hum with a sizzle on top and weight below.
    if (!this.rate('laserFire', 0.15)) return;
    const pan = ev.orient === 'v' ? this.pan(ev.pos) : 0;
    // Round 3: the beam's low end is lighter so a frame landing on a flurry of core hits
    // stays clear of the limiter. (A combat duck here pumped the player's guns every ~3 s
    // without buying headroom, so it was removed; the dense-mix trims do that work.)
    if (ev.value === true) this.osc({ at: t, dur: 0.8, type: 'sawtooth', freq: 73.4, vol: 0.025, attack: 0.012, hold: 0.55, filter: { freq: 500 }, drive: 'hot' });
    this.noise({ at: t, dur: 0.025, vol: 0.05, filter: { type: 'highpass', freq: 3000 }, pan });
    this.osc({ at: t, dur: 0.8, type: 'sawtooth', freq: 98, vol: 0.04, attack: 0.012, hold: 0.55, filter: { freq: 1600 }, drive: 'soft', pan: pan - 0.12 });
    this.osc({ at: t, dur: 0.8, type: 'sawtooth', freq: 99.6, vol: 0.04, attack: 0.012, hold: 0.55, filter: { freq: 1600 }, drive: 'soft', pan: pan + 0.12 });
    this.noise({ at: t, dur: 0.8, vol: 0.03, attack: 0.012, hold: 0.55, filter: { type: 'bandpass', freq: 3200, q: 0.9 }, pan });
    this.osc({ at: t, dur: 0.75, type: 'sine', freq: 49, vol: 0.055, attack: 0.012, hold: 0.5 });
  },
  empCharge(ev, game, t) {
    // The EMP ring charges for ~1.2 s: a climbing FM whine over swelling static and ticks that speed up.
    if (!this.rate('empCharge', 0.8)) return;
    const pan = this.pan(ev.x);
    this.fm({ at: t, dur: 1.2, freq: 110, end: 880, ratio: 1.5, index: 3, indexEnd: 0.6, vol: 0.03, attack: 1.05, pan, bus: this.alert });
    this.noise({ at: t, dur: 1.2, vol: 0.018, attack: 1.1, filter: { type: 'bandpass', freq: 400, end: 4200, q: 1.2 }, pan, bus: this.alert });
    [0, 0.4, 0.7, 0.9, 1.03, 1.12].forEach((d, i) => this.osc({ at: t + d, dur: 0.03, type: 'glass', freq: 1500 + i * 160, vol: 0.016 + i * 0.002, pan, bus: this.alert }));
  },
  empPulse(ev, game, t) {
    // The pulse: a deep thoom and an electric snap. If it caught the escorts they power down
    // (and stay silent; see shoot) under a dead hum until empClear. A roll that saved them
    // answers with a bright shimmer instead.
    const hit = Number(ev.value) > 0 || ev.value === true;
    this.engine.duck('combat', 0.35, 0.3, 0.4);
    this.osc({ at: t, dur: 0.9, type: 'sine', freq: 72, end: 28, vol: 0.1, bus: this.alert });
    this.noise({ at: t, dur: 0.4, color: 'crackle', vol: 0.06, filter: { type: 'bandpass', freq: 2200, q: 0.8 }, bus: this.alert, send: 0.2 });
    this.osc({ at: t, dur: 0.24, type: 'square', freq: 1900, end: 180, vol: 0.02, filter: { freq: 3000 }, bus: this.alert });
    this._cutEmp();
    if (!hit) {
      [88, 95].forEach((n, i) => this.osc({ at: t + 0.12 + i * 0.07, dur: 0.3, type: 'glass', freq: hz(n), vol: 0.026, send: 0.2, bus: this.alert }));
      return;
    }
    [0, 1, 2].forEach(i => this.osc({ at: t + 0.1 + i * 0.09, dur: 0.22, type: 'triangle', freq: 1250 - i * 220, end: 260 - i * 40, vol: 0.026, pan: (i - 1) * 0.45, bus: this.alert }));
    this._empHum(t + 0.2, clamp(Number(game?.player?.empTime) || 2, 0.6, 2.6), 0.15);
  },
  empClear(ev, game, t) {
    // Escorts reboot: the dead hum lifts and three chirps climb into a short power swell. A reset
    // (scatter, lost life, HALCYON's fall, sector change) or a wing that is gone only cuts the hum.
    this.empHum?.stop(0.06); this.empHum = null;
    if (ev.value === 'reset' || !(Number(game?.player?.escorts) > 0)) return;
    if (!this.rate('empClear', 0.4)) return;
    [72, 79, 84].forEach((n, i) => this.osc({ at: t + i * 0.07, dur: 0.055, type: 'square', freq: hz(n), vol: 0.022, filter: { type: 'bandpass', freq: 1800, q: 1.2 }, bus: this.alert }));
    this.osc({ at: t, dur: 0.4, type: 'sawtooth', freq: 80, end: 165, vol: 0.016, attack: 0.15, filter: { freq: 500, end: 1600, time: 0.35 }, bus: this.alert });
  },
  wingBreak(ev, game, t) {
    // HALCYON breaks apart: the spar shears, blasts roll along the wing from tip to tip, then the
    // hulk falls away with a long whistling drop and a muffled impact deep in the cloud floor.
    this._cutEmp();
    if (!this.rate('wingBreak', 3)) return;
    this.engine.duck('beds', 0.4, 2.4, 2);
    this.engine.duck('combat', 0.2, 2, 1);
    this.fm({ at: t, dur: 1.3, freq: 320, end: 60, ratio: 1.41, index: 6, indexEnd: 0.4, vol: 0.05, send: 0.35 });
    this.noise({ at: t, dur: 2.2, color: 'crackle', vol: 0.05, filter: { type: 'highpass', freq: 1500 }, send: 0.3 });
    [[0.5, -0.6], [0.85, 0.6], [1.25, -0.2]].forEach(([d, pan], i) => this.boom(i === 2 ? 'large' : 'medium', t + d, pan, this.fx, 0.85));
    this.osc({ at: t + 1.2, dur: 3.6, type: 'hollow', freq: 1150, end: 150, vol: 0.035, attack: 0.35, filter: { freq: 2400, end: 500, time: 3.6 }, pan: 0.15, panEnd: -0.1, send: 0.35 });
    this.osc({ at: t + 1.25, dur: 3.5, type: 'sine', freq: 1162, end: 146, vol: 0.02, attack: 0.35, pan: -0.15, send: 0.3 });
    this.noise({ at: t + 1.1, dur: 3.8, color: 'pink', vol: 0.06, attack: 0.5, filter: { type: 'bandpass', freq: 1800, end: 240, time: 3.6, q: 0.8 }, send: 0.3 });
    this.noise({ at: t + 4.6, dur: 2.6, color: 'brown', vol: 0.12, attack: 0.08, filter: { freq: 320, end: 70 }, send: 0.45 });
    this.osc({ at: t + 4.6, dur: 2.2, type: 'sine', freq: 46, end: 24, vol: 0.12, attack: 0.05 });
  },
};
HANDLERS.tailGunnerFire = HANDLERS.gunnerFire;
// Not voiced on purpose: chipHit (covered by hit), enemyDown (explode), special (bomb),
// pause (the ui cue), shipSelect (the ui cue) and summary.
