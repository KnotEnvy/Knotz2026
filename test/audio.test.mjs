import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../src/audio.js';
import { PRIORITY_EVENTS } from '../src/sfx.js';

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

test('update preserves priority order and the 12 and 34 event limits', async () => {
  await unlocked(engine => {
    const played = [];
    engine.playEvent = event => played.push(event.type);
    const regular = Array.from({ length: 40 }, (_, index) => ({ type: 'regular-' + index }));
    const priority = ['playerHit', 'lifeLost', 'bomb', 'shieldBreak', 'shieldRestore', 'powerUp',
      'wakeRoll', 'wakeReady', 'wakeConvert', 'bossDown', 'bossPhase', 'bossEnter'].map(type => ({ type }));
    for (const event of priority) assert.ok(PRIORITY_EVENTS.has(event.type));
    engine.update({ mode: 'title', stage: 1, events: [...regular, ...priority] }, 1 / 60);
    assert.deepEqual(played.slice(0, 12), priority.map(event => event.type), 'priority events play first, in order');
    assert.equal(played.length, 34, 'at most 34 event plays per update');
    assert.deepEqual(played.slice(12), regular.slice(0, 22).map(event => event.type));
  });
});

test('the same event batch is never dispatched twice', async () => {
  await unlocked(engine => {
    const played = [];
    engine.playEvent = event => played.push(event.type);
    const game = { mode: 'victory', stage: 3, events: [{ type: 'victory' }] };
    engine.update(game, 1 / 60); engine.setScreen('end'); engine.update(game, 0); engine.update(game, 0);
    assert.deepEqual(played, ['victory']);
    game.events = [{ type: 'gameover' }]; game.mode = 'gameover'; engine.update(game, 0);
    assert.deepEqual(played, ['victory', 'gameover'], 'a new simulation batch still dispatches');
  });
});

test('failed initial resume closes and clears its context so a muted retry can succeed', async () => {
  const contexts = [];
  class RetryContext extends MockAudioContext {
    constructor() { super(); contexts.push(this); }
    async resume() { if (contexts.length === 1) throw new Error('resume rejected'); this.state = 'running'; }
  }
  await withAudioContext(RetryContext, async () => {
    const engine = new AudioEngine();
    engine.setMuted(true);
    await engine.unlock();
    assert.equal(contexts.length, 1);
    assert.equal(contexts[0].closeCount, 1, 'failed context closes exactly once');
    assert.equal(engine.ready, false);
    for (const key of ['ctx', 'master', 'musicBus', 'ambienceBus', 'fxBus', 'combatBus', 'alertBus', 'uiBus', 'spaceSend', 'music', 'soundscape', 'sfx']) {
      assert.equal(engine[key], null, key + ' must be cleared');
    }
    assert.deepEqual(engine.noise, {});
    assert.deepEqual(engine.waves, {});
    assert.equal(engine.muted, true, 'failed unlock preserves the mute choice');
    await engine.unlock();
    assert.equal(contexts.length, 2, 'a later gesture creates a fresh context');
    assert.equal(contexts[1].closeCount, 0);
    assert.equal(engine.ready, true);
    assert.strictEqual(engine.ctx, contexts[1]);
    assert.equal(engine.master.gain.value, 0, 'the retry keeps the master silent while muted');
  });
});

test('concurrent unlock calls share one context until resume settles', async () => {
  let finishResume;
  const contexts = [];
  class PendingContext extends MockAudioContext {
    constructor() { super(); contexts.push(this); }
    resume() { return new Promise(resolve => { finishResume = () => { this.state = 'running'; resolve(); }; }); }
  }
  await withAudioContext(PendingContext, async () => {
    const engine = new AudioEngine();
    const first = engine.unlock(), second = engine.unlock();
    assert.strictEqual(first, second, 'callers receive the same pending promise');
    assert.equal(contexts.length, 1, 'concurrent gestures do not create overlapping contexts');
    assert.equal(engine.ready, false);
    engine.ui('confirm');
    finishResume();
    await Promise.all([first, second]);
    assert.equal(engine.ready, true);
    assert.strictEqual(engine.ctx, contexts[0]);
    assert.ok(contexts[0].oscillators.length > 0, 'a UI cue requested during the unlock gesture plays once ready');
  });
});

test('a failed resumed context resets voices and state and isolates late callbacks', async () => {
  const contexts = [];
  class RecoveringContext extends MockAudioContext {
    constructor() { super(); contexts.push(this); this.rejectResume = false; }
    async resume() { if (this.rejectResume) throw new Error('resume rejected'); this.state = 'running'; }
  }
  await withAudioContext(RecoveringContext, async () => {
    const engine = new AudioEngine();
    await engine.unlock();
    const old = contexts[0];
    engine.sfx.osc({ dur: 0.1, freq: 440, vol: 0.1 });
    const oldOscillator = old.lastOscillator;
    engine.lastSound.set('old-cue', old.currentTime);
    engine.duck('beds', 0.3, 1, 1);
    engine.update(playingGame({ stageTime: 60 }), 1 / 60);
    assert.equal(engine.activeVoices > 0, true);
    old.state = 'suspended'; old.rejectResume = true;
    await engine.unlock();
    assert.equal(old.closeCount, 1);
    assert.equal(engine.ready, false);
    assert.equal(engine.lastSound.size, 0);
    assert.equal(engine.activeVoices, 0);
    assert.equal(engine.combatVoices, 0);
    assert.equal(engine.ducks.beds.floor, 1);
    assert.equal(engine.longCues.size, 0);
    assert.equal(engine.cues.warning, false);
    await engine.unlock();
    assert.equal(contexts.length, 2);
    engine.sfx.osc({ dur: 0.1, freq: 660, vol: 0.1 });
    assert.equal(engine.activeVoices, 1);
    oldOscillator.onended();
    assert.equal(engine.activeVoices, 1, 'an old context callback cannot change the new voice count');
  });
});

test('mixer routes every bus through the glue and limiter to the destination', async () => {
  await unlocked((engine, ctx) => {
    for (const bus of ['combatBus', 'alertBus', 'fxBus', 'uiBus', 'musicBus', 'ambienceBus', 'spaceReturn']) {
      assert.ok(reaches(engine[bus], engine.glue), bus + ' reaches the glue compressor');
    }
    assert.ok(reaches(engine.glue, ctx.destination));
    assert.ok(reaches(engine.combatBus, engine.combatDuck) && reaches(engine.combatDuck, engine.fxBus));
    assert.ok(!reaches(engine.alertBus, engine.combatDuck), 'warnings bypass the combat duck');
    assert.ok(reaches(engine.musicBus, engine.bedDuck) && reaches(engine.ambienceBus, engine.bedDuck));
    assert.ok(!reaches(engine.uiBus, engine.fxGate), 'interface cues are not gated by pause');
  });
});

test('ambience survives music and effects at zero; mute silences the master', async () => {
  await unlocked(engine => {
    engine.setLevels(0, 0, 1);
    engine.update(playingGame({ stage: 2 }), 1 / 60);
    assert.equal(engine.musicBus.gain.value, 0);
    assert.equal(engine.fxBus.gain.value, 0);
    assert.equal(engine.uiBus.gain.value, 0);
    assert.equal(engine.ambienceBus.gain.value, 1);
    assert.ok(engine.master.gain.value > 0);
    const voices = engine.activeVoices;
    engine.playEvent({ type: 'shoot', x: 270 }, playingGame());
    assert.equal(engine.activeVoices, voices, 'effects at zero allocate no inaudible voices');
    engine.toggleMute();
    assert.equal(engine.master.gain.value, 0);
    engine.toggleMute();
    assert.ok(engine.master.gain.value > 0);
  });
});

test('pause silences effects and sinks the score and ambience behind a low-pass', async () => {
  await unlocked(engine => {
    const game = playingGame();
    engine.setScreen('play'); engine.update(game, 1 / 60);
    assert.equal(engine.fxGate.gain.value, 1);
    assert.ok(engine.bedFilter.frequency.value > 15000);
    game.mode = 'paused'; engine.setScreen('pause'); engine.update(game, 0);
    assert.equal(engine.fxGate.gain.value, 0, 'effects stop');
    assert.ok(engine.bedFilter.frequency.value < 1000, 'beds are low-passed');
    assert.ok(engine.bedPause.gain.value < 1 && engine.bedPause.gain.value > 0, 'beds are lowered, not muted');
    assert.ok(engine.ambienceBus.gain.value > 0);
    const states = [];
    engine.soundscape = { update: state => states.push(state) };
    engine.update(game, 0);
    assert.equal(states.at(-1).paused, true);
    game.mode = 'playing'; engine.setScreen('play'); engine.update(game, 1 / 60);
    assert.equal(engine.fxGate.gain.value, 1);
    assert.ok(engine.bedFilter.frequency.value > 15000);
  });
});

test('primary fire has a distinct signature per aircraft and stays on the combat bus', async () => {
  await unlocked((engine, ctx) => {
    const signatures = [];
    for (const weaponType of ['spread', 'missile', 'pierce']) {
      engine.lastSound.clear();
      const created = sourcesDuring(ctx, () => engine.playEvent({ type: 'shoot', x: 100 }, { player: { weaponType, level: 3 } }));
      assert.ok(created.length >= 2, weaponType + ' layers at least a transient and a body');
      for (const source of created) {
        assert.ok(reaches(source, engine.combatBus), weaponType + ' voice reaches the combat bus');
      }
      signatures.push(created.map(source => source.kind + ':' + Math.round(source.frequency.value)).join(','));
    }
    assert.equal(new Set(signatures).size, 3);
  });
});

test('warnings and milestones bypass the combat ceiling and stay audible under dense fire', async () => {
  await unlocked((engine, ctx) => {
    const game = playingGame();
    for (let frame = 0; frame < 200; frame++) {
      ctx.currentTime += 0.2;
      engine.playEvent({ type: 'shoot', x: 270 }, game);
      engine.playEvent({ type: 'hit', x: 260, value: 'scout' }, game);
      engine.playEvent({ type: 'explode', x: 250, value: 'bomber' }, game);
    }
    assert.ok(engine.combatVoices <= 40, 'combat voices respect their ceiling');
    assert.ok(engine.activeVoices <= 96, 'total voices respect the budget');
    const lock = sourcesDuring(ctx, () => engine.playEvent({ type: 'lanceLock', x: 270 }, game));
    assert.ok(lock.length >= 3, 'the lance lock still gets voices with combat saturated');
    assert.ok(lock.every(source => reaches(source, engine.alertBus)), 'the lance lock is on the alert bus');
  });
});

test('the flagship siren starts once per warning, follows the remaining time and stops on pause', async () => {
  await unlocked((engine, ctx) => {
    engine.setScreen('play');
    const game = playingGame({ stageTime: 62 - 3.2 + 0.4 });
    const created = sourcesDuring(ctx, () => engine.update({ ...game, events: [] }, 1 / 60));
    assert.ok(created.length >= 5, 'the warning starts a layered siren');
    assert.equal(engine.longCues.size, 1);
    const again = sourcesDuring(ctx, () => engine.update({ ...game, stageTime: game.stageTime + 0.5, events: [] }, 1 / 60));
    assert.equal(again.length, 0, 'the siren does not retrigger during the same warning');
    const [cue] = engine.longCues;
    engine.setScreen('pause');
    engine.update({ ...game, mode: 'paused', events: [] }, 0);
    assert.equal(cue.stopped, true, 'pausing cuts the siren');
    assert.equal(engine.longCues.size, 0);
    engine.setScreen('play');
    const resumed = sourcesDuring(ctx, () => engine.update({ ...game, stageTime: game.stageTime + 1, events: [] }, 1 / 60));
    assert.ok(resumed.length > 0, 'resuming mid-warning restarts the siren for the time left');
  });
});

test('the real music and ambience modules construct and update against the mock context', async () => {
  await withAudioContext(MockAudioContext, async () => {
    const engine = new AudioEngine();
    const warnings = [], warn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      await engine.unlock();
      engine.setScreen('play');
      for (let i = 0; i < 30; i++) { engine.ctx.currentTime += 0.05; engine.update(playingGame({ time: 10 + i * 0.05 }), 0.05); }
    } finally { console.warn = warn; }
    assert.deepEqual(warnings, [], 'no director was disabled by an exception');
  });
});

test('the sector-clear stinger plays once when the interlude starts and the critical pulse is rate limited', async () => {
  await unlocked((engine, ctx) => {
    engine.setScreen('play');
    const game = playingGame({ _transition: 3.4 });
    const stinger = sourcesDuring(ctx, () => engine.update({ ...game, events: [] }, 1 / 60));
    assert.ok(stinger.length >= 5);
    assert.equal(sourcesDuring(ctx, () => engine.update({ ...game, _transition: 3, events: [] }, 1 / 60)).length, 0);
    const critical = playingGame({ player: { ...playingGame().player, hp: 1 } });
    const first = sourcesDuring(ctx, () => engine.update({ ...critical, events: [] }, 1 / 60));
    assert.ok(first.length >= 2, 'the critical pulse plays at hull 1');
    assert.ok(first.every(source => reaches(source, engine.alertBus)));
    ctx.currentTime += 0.5;
    assert.equal(sourcesDuring(ctx, () => engine.update({ ...critical, events: [] }, 1 / 60)).length, 0);
    ctx.currentTime += 1;
    assert.ok(sourcesDuring(ctx, () => engine.update({ ...critical, events: [] }, 1 / 60)).length >= 2);
  });
});

test('music and soundscape receive the shared state, and a failing director cannot stop effects', async () => {
  await unlocked((engine, ctx) => {
    const states = [];
    engine.music = { update() { throw new Error('composer bug'); }, stop() {} };
    engine.soundscape = { update: (state, now) => states.push({ state, now }), stop() {} };
    engine.setScreen('play');
    const boss = { name: 'AURELIA', hp: 2350, maxHp: 4700, phase: 2 };
    const game = playingGame({ stage: 2, boss, enemies: [boss, {}, {}], bullets: new Array(40), events: [{ type: 'shoot', x: 270 }] });
    const created = sourcesDuring(ctx, () => engine.update(game, 1 / 60));
    assert.ok(created.length > 0, 'effects still play after the music director throws');
    const { state, now } = states.at(-1);
    assert.equal(now, ctx.currentTime);
    for (const key of ['screen', 'mode', 'time', 'stage', 'stageTime', 'bossWarning', 'boss', 'bossName', 'bossPhase', 'bossHp',
      'interlude', 'intensity', 'critical', 'outcome', 'grade', 'practice', 'paused', 'events']) {
      assert.ok(key in state, 'state has ' + key);
    }
    assert.equal(state.screen, 'play');
    assert.equal(state.boss, true);
    assert.equal(state.bossName, 'AURELIA');
    assert.equal(state.bossPhase, 2);
    assert.equal(state.bossHp, 0.5);
    assert.equal(state.bossWarning, -1);
    assert.equal(state.interlude, -1);
    assert.ok(state.intensity > 0.3 && state.intensity <= 1);
    assert.deepEqual(state.events.map(event => event.type), ['shoot']);
    engine.update(game, 0);
    assert.deepEqual(states.at(-1).state.events, [], 'a repeated batch reaches the directors as no events');
    game.mode = 'gameover'; game.summary = { outcome: 'defeat', grade: 'C' }; game.boss = null;
    engine.update({ ...game, events: [] }, 0);
    engine.setScreen('end'); game.mode = 'title';
    engine.update({ ...game, events: [] }, 0);
    assert.equal(states.at(-1).state.outcome, 'gameover', 'the end screen keeps the run outcome');
    assert.equal(states.at(-1).state.grade, 'C');
  });
});

test('every gameplay event and interface cue plays without errors', async () => {
  await unlocked((engine, ctx) => {
    const warnings = [];
    const warn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      const types = ['shoot', 'droneFire', 'missileLaunch', 'missileHit', 'hit', 'railHit', 'bossArmorHit', 'bossCoreHit', 'explode',
        'reactorBreak', 'pickup', 'drop', 'powerUp', 'graze', 'wakeReady', 'roll', 'wakeRoll', 'wakeConvert', 'rollStrike', 'shieldHit',
        'shieldBreak', 'shieldRestore', 'playerHit', 'lifeLost', 'bomb', 'bossEnter', 'bossPhase', 'bossGuard', 'bossGuardEnd', 'bossShot',
        'reactorOpen', 'lanceLock', 'lanceFire', 'lanceCancel', 'flank', 'wave', 'lane', 'extend', 'stage', 'bossDown', 'gameover', 'victory'];
      const values = { explode: ['scout', 'ace', 'carrier'], pickup: ['power', 'shield', 'bomb', 'life', 'score'], bomb: ['nova', 'barrier', 'storm'], bossPhase: [2, 3], powerUp: [3] };
      for (const type of types) {
        for (const value of values[type] || [1]) {
          ctx.currentTime += 1;
          const created = sourcesDuring(ctx, () => engine.playEvent({ type, x: 300, y: 400, value }, playingGame()));
          assert.ok(created.length > 0, type + ' (' + value + ') makes a sound');
          endVoices(ctx);
        }
      }
      for (const name of ['focus', 'select', 'confirm', 'back', 'launch', 'pause', 'resume', 'open', 'close', 'tick', 'skip']) {
        ctx.currentTime += 1;
        const created = sourcesDuring(ctx, () => engine.ui(name));
        assert.ok(created.length > 0, 'ui ' + name);
        assert.ok(created.every(source => reaches(source, engine.uiBus)), 'ui ' + name + ' is on the ui bus');
        endVoices(ctx);
      }
    } finally { console.warn = warn; }
    assert.deepEqual(warnings, []);
    assert.equal(engine.activeVoices, 0, 'every voice releases its budget when it ends');
    assert.equal(engine.combatVoices, 0);
  });
});

test('an extend replaces its own reward pickup and a lost life replaces the hit cue', async () => {
  await unlocked((engine, ctx) => {
    const played = [];
    const original = engine.sfx.play.bind(engine.sfx);
    engine.sfx.play = (event, game, t) => {
      const created = sourcesDuring(ctx, () => original(event, game, t));
      played.push([event.type, created.length]);
    };
    engine.update(playingGame({ events: [{ type: 'pickup', value: 'life', x: 270 }, { type: 'extend', x: 270 }, { type: 'playerHit', x: 270 }, { type: 'lifeLost', x: 270 }] }), 1 / 60);
    const voices = Object.fromEntries(played);
    assert.equal(voices.pickup, 0);
    assert.equal(voices.playerHit, 0);
    assert.ok(voices.extend > 0 && voices.lifeLost > 0);
  });
});
