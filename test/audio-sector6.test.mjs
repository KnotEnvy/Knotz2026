// Sector 6, ZERO MERIDIAN: audio tests (audio builder). Kept in their own file so they never
// collide with edits to test/audio.test.mjs; the mock below is copied from it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../src/audio.js';
import { PRIORITY_EVENTS } from '../src/sfx.js';
import { MusicDirector, MUSIC_CUES } from '../src/music.js';
import { Soundscape } from '../src/soundscape.js';
import { lightningAt } from '../src/timeline.js';

class MockParam {
  constructor(value = 0) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  setValueCurveAtTime(values) { this.value = values[values.length - 1]; }
  cancelScheduledValues() {}
  cancelAndHoldAtTime() {}
}
class MockNode {
  constructor(ctx, kind) {
    this.ctx = ctx; this.kind = kind; this.connections = [];
    for (const name of ['gain', 'frequency', 'Q', 'pan', 'detune', 'playbackRate', 'delayTime', 'offset']) this[name] = new MockParam(name === 'gain' ? 1 : 0);
    ctx.nodes.push(this);
  }
  connect(target) { this.connections.push(target); return target; }
  disconnect() { this.connections = []; }
}
class MockSource extends MockNode {
  constructor(ctx, kind) { super(ctx, kind); this.started = false; this.stopped = false; }
  start() { this.started = true; }
  stop() { this.stopped = true; }
  setPeriodicWave(wave) { this.wave = wave; }
}
class MockAudioContext {
  constructor() {
    this.currentTime = 12; this.sampleRate = 64; this.destination = { kind: 'destination', connections: [] };
    this.state = 'suspended'; this.closeCount = 0; this.nodes = []; this.oscillators = []; this.sources = [];
  }
  createGain() { return new MockNode(this, 'gain'); }
  createBiquadFilter() { const n = new MockNode(this, 'filter'); n.type = 'lowpass'; return n; }
  createStereoPanner() { return new MockNode(this, 'panner'); }
  createWaveShaper() { return new MockNode(this, 'shaper'); }
  createConvolver() { return new MockNode(this, 'convolver'); }
  createDelay() { return new MockNode(this, 'delay'); }
  createAnalyser() { return new MockNode(this, 'analyser'); }
  createConstantSource() { return new MockSource(this, 'constant'); }
  createDynamicsCompressor() {
    const n = new MockNode(this, 'compressor');
    for (const name of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[name] = new MockParam();
    return n;
  }
  createPeriodicWave() { return { kind: 'wave' }; }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: c => data[c] };
  }
  createBufferSource() { const s = new MockSource(this, 'buffer'); this.sources.push(s); return s; }
  createOscillator() { const o = new MockSource(this, 'oscillator'); this.oscillators.push(o); this.lastOscillator = o; return o; }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.closeCount++; this.state = 'closed'; }
}

async function withAudioContext(Context, run) {
  const previous = globalThis.AudioContext, previousWebkit = globalThis.webkitAudioContext;
  globalThis.AudioContext = Context;
  delete globalThis.webkitAudioContext;
  try { await run(); }
  finally {
    if (previous === undefined) delete globalThis.AudioContext; else globalThis.AudioContext = previous;
    if (previousWebkit === undefined) delete globalThis.webkitAudioContext; else globalThis.webkitAudioContext = previousWebkit;
  }
}
async function unlocked(run, Context = MockAudioContext) {
  await withAudioContext(Context, async () => {
    const engine = new AudioEngine();
    await engine.unlock();
    assert.equal(engine.ready, true);
    // The score and ambience modules have their own tests; these isolate the engine and effects.
    engine.music = null; engine.soundscape = null;
    await run(engine, engine.ctx);
  });
}
// Follows the first connection of each node until it reaches a bus we care about.
function reaches(node, target, depth = 0) {
  if (node === target) return true;
  if (!node || depth > 12) return false;
  return (node.connections || []).some(next => reaches(next, target, depth + 1));
}
// Mock voices never end on their own; this plays every pending onended callback.
function endVoices(ctx) {
  for (const source of [...ctx.oscillators, ...ctx.sources]) {
    if (!source.ended && source.onended) { source.ended = true; source.onended(); }
  }
}
function sourcesDuring(ctx, run) {
  const before = new Set([...ctx.oscillators, ...ctx.sources]);
  run();
  return [...ctx.oscillators, ...ctx.sources].filter(source => !before.has(source));
}
const playingGame = (extra = {}) => ({ mode: 'playing', stage: 1, time: 10, stageTime: 10, stageGoal: [0, 62, 73, 82],
  player: { x: 270, y: 700, hp: 4, maxHp: 4, weaponType: 'spread', level: 2, shipId: 'kestrel' }, enemies: [], bullets: [], events: [], ...extra });

const S6_EVENTS = ['echoSpawn', 'echoFire', 'satelliteEnter', 'satelliteDown', 'shardCurtain', 'shardBreak', 'stationEnter', 'stationDown',
  'stationTurretDown', 'mirrorCopy', 'mirrorEscortDown', 'tetherLaunch', 'tetherCut', 'tetherLost', 'sovereignGrow', 'mirrorShatter', 'actTwoComplete'];
// Repeated combat sounds; everything else resolves before the shot stream.
const S6_COMBAT = new Set(['echoFire', 'shardBreak', 'stationTurretDown', 'mirrorEscortDown', 'shardCurtain']);
const s6Game = (extra = {}) => playingGame({ stage: 6, stageGoal: [0, 62, 73, 82, 90, 100, 105], hazards: [], ...extra });
const rotatingLaser = (extra = {}) => ({ id: 41, kind: 'laser', rotating: true, orient: 'r', state: 'fire', warn: 0.9, on: 2.4, age: 1,
  pivotX: 120, pivotY: 200, angle: 0.9, angle0: 0.6, angle1: 2.2, sweep: 0.66, ...extra });
const tether = (extra = {}) => ({ id: 52, type: 'tether', x: 300, y: 500, hp: 90, progress: 0.2, carrying: { type: 'power', value: 4 }, ...extra });

test('sector 6: every new event sounds without errors and releases its voices', async () => {
  await unlocked((engine, ctx) => {
    const warnings = [], warn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      const values = { echoSpawn: ['spread', 'missile', 'pierce'], echoFire: ['spread', 'missile', 'pierce'], mirrorCopy: ['spread', 'missile', 'pierce'],
        shardBreak: [1, 4, 30], shardCurtain: [2, 4], stationTurretDown: ['shard', 'void', 'mix'], tetherLaunch: ['power', 'shield', 'life'],
        tetherCut: ['power'], tetherLost: ['power', 'bomb'], sovereignGrow: ['power'], mirrorEscortDown: [0], actTwoComplete: [2], mirrorShatter: [6] };
      const fields = { mirrorShatter: { w: 200, h: 80, angle: 0, escorts: [], weapons: [], style: 'spread' }, tetherLaunch: { amount: 4, time: 2.6 },
        mirrorCopy: { escorts: 6, band: 2, ship: 'kestrel' }, sovereignGrow: { count: 1, grown: 1 }, satelliteEnter: { value: 1, delay: 0.5 } };
      for (const type of S6_EVENTS) {
        for (const value of values[type] || [undefined]) {
          ctx.currentTime += 5.5;
          const created = sourcesDuring(ctx, () => engine.playEvent({ type, x: 300, y: 400, value, ...fields[type] }, s6Game()));
          assert.ok(created.length > 0, type + ' (' + value + ') makes a sound');
          endVoices(ctx);
        }
        assert.ok(S6_COMBAT.has(type) || PRIORITY_EVENTS.has(type), type + ' resolves before the shot stream');
      }
      // The laser variants: a rotating sweep's charge, and the short mirror rails.
      for (const ev of [{ type: 'laserWarn', x: 120, y: 200, orient: 'r', pos: 0.6, rotating: true, pivotX: 120, pivotY: 200, sweep: 0.66, on: 2.4, count: 1 },
        { type: 'laserWarn', x: 200, orient: 'v', pos: 200, mirror: true }, { type: 'laserFire', x: 200, orient: 'v', pos: 200, mirror: true }]) {
        ctx.currentTime += 1;
        assert.ok(sourcesDuring(ctx, () => engine.playEvent(ev, s6Game())).length > 0, ev.type + (ev.rotating ? ' rotating' : ' mirror'));
        endVoices(ctx);
      }
      // A rotating laserFire is voiced by its state-driven beam, a quiet tether cut by mirrorShatter.
      ctx.currentTime += 1;
      assert.equal(sourcesDuring(ctx, () => engine.playEvent({ type: 'laserFire', x: 120, rotating: true }, s6Game())).length, 0);
      assert.equal(sourcesDuring(ctx, () => engine.playEvent({ type: 'tetherCut', x: 120, value: 'power', quiet: true }, s6Game())).length, 0);
    } finally { console.warn = warn; }
    assert.deepEqual(warnings, []);
    assert.equal(engine.activeVoices, 0);
    assert.equal(engine.combatVoices, 0);
  });
});

test('sector 6: shard tinks stay on the combat bus, are throttled and never repeat a note back to back', async () => {
  await unlocked((engine, ctx) => {
    const firsts = [];
    for (let k = 0; k < 40; k++) {
      ctx.currentTime += 0.1;
      const created = sourcesDuring(ctx, () => engine.playEvent({ type: 'shardBreak', x: 100 + k * 8, value: 1 + (k % 5) }, s6Game()));
      assert.ok(created.length > 0 && created.length <= 5, 'one to three tinks, not a pile-up');
      assert.ok(created.every(source => reaches(source, engine.combatBus)), 'shards sit under the combat ceiling');
      firsts.push(Math.round(created[0].frequency.value));
      endVoices(ctx);
    }
    for (let k = 1; k < firsts.length; k++) assert.notEqual(firsts[k], firsts[k - 1], 'consecutive tinks change pitch');
    assert.ok(new Set(firsts).size >= 5, 'the walk covers the scale');
    ctx.currentTime += 0.1;
    engine.playEvent({ type: 'shardBreak', x: 270, value: 3 }, s6Game());
    ctx.currentTime += 0.01;
    assert.equal(sourcesDuring(ctx, () => engine.playEvent({ type: 'shardBreak', x: 270, value: 3 }, s6Game())).length, 0, 'throttled');
    endVoices(ctx);
  });
});

test('sector 6: rotating beams and tether pulls follow state as long cues; pause, mute, a lost life and leaving play cut them, and resume restores them', async () => {
  await unlocked((engine, ctx) => {
    engine.setScreen('play');
    const live = (extra = {}) => s6Game({ hazards: [rotatingLaser()], enemies: [tether()], ...extra });
    engine.update(live({ events: [{ type: 'laserFire', rotating: true, x: 120 }] }), 1 / 60);
    const beam = engine.sfx.loops.get('beam:41'), pull = engine.sfx.loops.get('tether:52');
    assert.ok(beam && pull, 'the beam and the pull start from state');
    assert.ok(engine.longCues.has(beam.cue) && engine.longCues.has(pull.cue), 'both are tracked long cues');
    assert.ok(beam.until - ctx.currentTime <= 2.31, 'the beam lasts the sweep left (2.3 s)');
    // They follow state: the pull tightens with progress, and a further frame starts nothing new.
    const before = pull.cue.node.gain.value;
    engine.update(live({ enemies: [tether({ progress: 0.8 })] }), 1 / 60);
    assert.equal(engine.sfx.loops.get('tether:52'), pull);
    assert.ok(pull.cue.node.gain.value > before, 'the pull grows as the salvage climbs');
    // The sweep ending (or its satellite dying) and the tether going stop each one.
    engine.update(live({ hazards: [rotatingLaser({ state: 'off' })], enemies: [] }), 1 / 60);
    assert.equal(beam.cue.stopped, true); assert.equal(pull.cue.stopped, true);
    assert.equal(engine.sfx.loops.size, 0);
    // A beam or pull never outlives its state, and the caps hold (two beams, three pulls).
    const many = s6Game({ hazards: [1, 2, 3].map(id => rotatingLaser({ id })), enemies: [1, 2, 3, 4, 5].map(id => tether({ id })) });
    engine.update(many, 1 / 60);
    const kinds = [...engine.sfx.loops.values()].map(loop => loop.kind);
    assert.equal(kinds.filter(k => k === 'beam').length, 2); assert.equal(kinds.filter(k => k === 'tether').length, 3);
    engine.update(s6Game(), 1 / 60);
    assert.equal(engine.sfx.loops.size, 0);
    // Pause cuts them; nothing plays while paused; resume brings them back for the time left.
    engine.update(live(), 1 / 60);
    const again = engine.sfx.loops.get('beam:41');
    assert.ok(again && !again.cue.stopped);
    engine.setScreen('pause'); engine.update(live({ mode: 'paused' }), 0);
    assert.equal(again.cue.stopped, true, 'pause cuts the beam'); assert.equal(engine.sfx.loops.size, 0);
    engine.update(live({ mode: 'paused' }), 0);
    assert.equal(engine.sfx.loops.size, 0, 'nothing while paused');
    engine.setScreen('play'); ctx.currentTime += 0.2;
    engine.update(live({ hazards: [rotatingLaser({ age: 2.5 })] }), 1 / 60);
    const resumed = engine.sfx.loops.get('beam:41');
    assert.ok(resumed && resumed !== again && engine.longCues.has(resumed.cue), 'resume restarts the beam');
    assert.ok(resumed.until - ctx.currentTime <= 0.81, 'for the time left in the sweep (0.8 s)');
    // Mute cuts them and keeps them off until unmuted.
    engine.toggleMute();
    assert.equal(resumed.cue.stopped, true); assert.equal(engine.sfx.loops.size, 0);
    engine.update(live(), 1 / 60);
    assert.equal(engine.sfx.loops.size, 0, 'nothing while muted');
    engine.toggleMute(); engine.update(live(), 1 / 60);
    assert.ok(engine.sfx.loops.size > 0, 'unmute restores them');
    // Effects at 0 cut them too.
    engine.setLevels(1, 0, 1); engine.update(live(), 1 / 60);
    assert.equal(engine.sfx.loops.size, 0, 'effects at 0');
    engine.setLevels(1, 1, 1); ctx.currentTime += 0.6; engine.update(live(), 1 / 60);
    assert.ok(engine.sfx.loops.size > 0);
    // A lost life (and the run's end, a flagship's fall, a sector change) cuts them and holds them off a moment.
    for (const type of ['lifeLost', 'gameover', 'bossDown', 'stage', 'mirrorShatter']) {
      const cut = [...engine.sfx.loops.values()];
      assert.ok(cut.length > 0);
      engine.update(live({ events: [{ type, x: 270, value: 1, stage: 6 }] }), 1 / 60);
      assert.ok(cut.every(loop => loop.cue.stopped), type + ' cuts them'); assert.equal(engine.sfx.loops.size, 0, 'no restart in the same tick');
      ctx.currentTime += 0.6; engine.update(live(), 1 / 60);
      assert.ok(engine.sfx.loops.size > 0, 'still-live state comes back after the gap');
    }
    // Leaving play cuts them.
    const last = [...engine.sfx.loops.values()];
    engine.setScreen('end');
    assert.ok(last.every(loop => loop.cue.stopped)); assert.equal(engine.sfx.loops.size, 0);
    endVoices(ctx);
  });
});

test('sector 6: the SOVEREIGN\'s fall is voiced by mirrorShatter (a tracked long cue) and bossDown keeps only its opening blasts', async () => {
  await unlocked((engine, ctx) => {
    engine.setScreen('play');
    const played = [];
    const original = engine.sfx.play.bind(engine.sfx);
    engine.sfx.play = (event, game, t) => { played.push([event.type, sourcesDuring(ctx, () => original(event, game, t)).length]); };
    ctx.currentTime += 4;
    engine.update(s6Game({ events: [{ type: 'bossDown', value: 6, stage: 6, x: 270, w: 200, h: 80, angle: 0 }, { type: 'mirrorShatter', x: 270, value: 6 }] }), 1 / 60);
    const voices = Object.fromEntries(played);
    assert.ok(voices.mirrorShatter > 20, 'the shatter is the big cue');
    assert.ok(voices.bossDown > 0 && voices.bossDown <= 15, 'bossDown keeps three opening blasts');
    assert.ok(engine.longCues.size >= 1, 'the shatter tail is a long cue');
    engine.setScreen('pause'); engine.update(s6Game({ mode: 'paused' }), 0);
    assert.equal(engine.longCues.size, 0, 'pause cuts the tail');
    // The victory frame: actTwoComplete sounds, and the generic victory chord stands aside for the score's sting.
    engine.setScreen('play'); played.length = 0; ctx.currentTime += 6;
    engine.update(s6Game({ mode: 'victory', events: [{ type: 'actTwoComplete', value: 2, x: 270, y: 320 }, { type: 'victory' }] }), 1 / 60);
    const end = Object.fromEntries(played);
    assert.ok(end.actTwoComplete > 0); assert.equal(end.victory, 0);
    endVoices(ctx);
  });
});

test('sector 6: the shared state carries a finite bar phase from the score clock, with a 140 bpm fallback', async () => {
  await withAudioContext(MockAudioContext, async () => {
    const engine = new AudioEngine();
    await engine.unlock();
    engine.setScreen('play');
    const ctx = engine.ctx, phases = [];
    for (let i = 0; i < 80; i++) {
      ctx.currentTime += 0.05;
      engine.update(s6Game({ time: 10 + i * 0.05, stageTime: 5 + i * 0.05 }), 0.05);
      const s = engine.state;
      assert.ok(Number.isFinite(s.barPhase) && s.barPhase >= 0 && s.barPhase < 1, 'barPhase is 0..1');
      assert.ok(s.barLength > 0 && s.bpm > 0);
      phases.push(s.barPhase);
    }
    assert.equal(engine.music.cueId, 'sector6');
    assert.equal(engine.state.bpm, 140, 'sector 6 runs at 140 bpm');
    const clock = engine.music.clock(ctx.currentTime);
    assert.ok(clock && Math.abs(clock.barPhase - engine.state.barPhase) < 0.05, 'the state follows MusicDirector.clock');
    assert.ok(phases.some((p, k) => k && p < phases[k - 1]), 'the phase wraps on each downbeat');
    // Without a score the phase follows game time at 140 bpm (timeline.ZERO_MERIDIAN_BPM).
    engine.music = null;
    engine.update(s6Game({ time: 240 / 140 * 2.25 }), 0);
    assert.ok(Math.abs(engine.state.barPhase - 0.25) < 1e-6);
    assert.equal(engine.state.bpm, 140);
  });
});

test('sector 6: the score has its cues and renders every phase and variant without errors inside the voice budget', async () => {
  for (const id of ['sector6', 'warning6', 'boss6', 'victory', 'interlude']) assert.ok(MUSIC_CUES.includes(id), id);
  const runs = [
    [{ id: 'sector6', key: 'sector6' }, t => ({ stageTime: t * 1.2, intensity: t < 50 ? 0.4 : 0.8 }), t => t === 30 ? [{ type: 'stationEnter' }] : []],
    [{ id: 'warning6', key: 'warning6' }, t => ({ bossWarning: Math.min(0.97, t / 3.2) }), () => []],
    [{ id: 'boss6', key: 'boss6' }, t => ({ boss: true, bossPhase: t < 25 ? 1 : t < 50 ? 2 : 3, bossHp: t < 70 ? 0.6 : 0.1 }), () => []],
    [{ id: 'boss6', key: 'boss6drill', variant: 'drill' }, t => ({ boss: true, bossPhase: t < 25 ? 1 : t < 50 ? 2 : 3, bossHp: 0.5 }), () => []],
    [{ id: 'interlude', key: 'interludeAscent', variant: 'ascent' }, () => ({ interlude: 0.5 }), () => []],
    [{ id: 'victory', key: 'victoryActTwo', variant: 'actTwo', grade: 'S' }, () => ({ mode: 'victory' }), () => []],
  ];
  for (const [want, at, events] of runs) {
    const ctx = new MockAudioContext(), director = new MusicDirector(ctx, ctx.createGain());
    director._pick = () => want;
    for (let step = 0; step < 1800; step++) {
      const t = step * 0.05;
      ctx.currentTime = t;
      director.update({ screen: 'play', mode: 'playing', stage: 6, time: t, events: events(Math.round(t * 20) / 20), intensity: 0.6, ...at(t) }, t);
    }
    assert.equal(director.stats.errors, 0, want.key + ': ' + (director.stats.lastError || ''));
    assert.ok(director.stats.voices > 20, want.key + ' plays');
    assert.ok(director.stats.maxLive <= 64, want.key + ' stays inside the music voice budget: ' + director.stats.maxLive);
  }
});

test('sector 6: the director picks the sector-6 cues, the ascent interlude after HALCYON and the ACT II COMPLETE victory', async () => {
  const ctx = new MockAudioContext(), director = new MusicDirector(ctx, ctx.createGain());
  const pick = state => director._pick({ screen: 'play', mode: 'playing', interlude: -1, bossWarning: -1, practice: 0, ...state });
  assert.equal(pick({ stage: 6 }).key, 'sector6');
  assert.equal(pick({ stage: 6, bossWarning: 0.4 }).key, 'warning6');
  assert.equal(pick({ stage: 6, boss: true }).key, 'boss6');
  assert.equal(pick({ stage: 6, boss: true, practice: 6 }).key, 'boss6drill');
  assert.equal(pick({ stage: 5, interlude: 0.3 }).key, 'interludeAscent', 'HALCYON to sector 6 continues the climb');
  assert.equal(pick({ stage: 4, interlude: 0.3 }).key, 'interludeClimb');
  assert.equal(pick({ stage: 6, mode: 'victory', outcome: 'victory' }).key, 'victoryActTwo');
  assert.equal(pick({ stage: 6, mode: 'victory', outcome: 'victory', practice: 6 }).key, 'drillClear', 'a drill victory is an ordinary drill clear');
  // The Meridian Gate arriving early brings the full ensemble with it.
  director.update({ screen: 'play', mode: 'playing', stage: 6, stageTime: 40, events: [{ type: 'stationEnter' }] }, 0);
  assert.equal(director.zmGateAt, 40);
  director.update({ screen: 'play', mode: 'playing', stage: 6, stageTime: 41, events: [{ type: 'stage' }] }, 0.05);
  assert.equal(director.zmGateAt, null, 'a new sector forgets the Gate');
});

test('sector 6: the bed is near silence with no thunder, and its aurora swells on each downbeat of the bar clock', async () => {
  const ctx = new MockAudioContext(), scape = new Soundscape(ctx, ctx.createGain(), { seed: 6 });
  scape._init();
  for (const job of ['pink', 'brown', 'white']) scape._buffer(job);
  scape.now = 0;
  const bed = scape._build('sector6');
  assert.ok(bed.sources.length > 4, 'hiss, static and the shimmer run');
  // Find the shimmer: the gain the modulate hook writes on each downbeat.
  const writes = [];
  const original = MockParam.prototype.setTargetAtTime;
  MockParam.prototype.setTargetAtTime = function (value, at, tc) { writes.push([this, value, at]); return original.call(this, value, at, tc); };
  let downbeats = 0, last = -1;
  try {
    for (let i = 0; i < 200; i++) {
      const now = i * 0.05, barPhase = (now / (240 / 140)) % 1;
      if (barPhase < last) downbeats++;
      last = barPhase;
      bed.tick(now, { screen: 'play', mode: 'playing', stage: 6, time: now, interlude: -1, barPhase, barLength: 240 / 140 });
    }
  } finally { MockParam.prototype.setTargetAtTime = original; }
  const swells = writes.filter(([, value]) => Math.abs(value - 0.017) < 1e-9);
  assert.ok(downbeats >= 4);
  assert.equal(swells.length, downbeats, 'one aurora swell per downbeat');
  for (let t = 0; t < 120; t += 0.5) assert.equal(lightningAt(t, 6), null, 'lightningAt(t, 6) has no strikes');
});
