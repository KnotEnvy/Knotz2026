import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../src/audio.js';

class MockParam {
  constructor() { this.value = 0; }
  setTargetAtTime() {}
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
}
class MockNode {
  constructor() {
    this.gain = new MockParam();
    this.frequency = new MockParam();
    this.delayTime = new MockParam();
    this.pan = new MockParam();
    this.Q = new MockParam();
  }
  connect() { return this; }
  disconnect() {}
}
class MockAudioContext {
  constructor() {
    this.currentTime = 12;
    this.sampleRate = 16;
    this.destination = {};
    this.state = 'suspended';
    this.closeCount = 0;
  }
  createDynamicsCompressor() {
    const node = new MockNode();
    for (const name of ['threshold','knee','ratio','attack','release']) node[name] = new MockParam();
    return node;
  }
  createGain() { return new MockNode(); }
  createPeriodicWave() { return {}; }
  createBuffer(channels, length) {
    const data = Array.from({length:channels}, () => new Float32Array(length));
    return {getChannelData: channel => data[channel]};
  }
  createBiquadFilter() { return new MockNode(); }
  createConvolver() { return new MockNode(); }
  createDelay() { return new MockNode(); }
  createStereoPanner() { return new MockNode(); }
  createOscillator() {
    const oscillator = new MockNode();
    oscillator.detune = new MockParam();
    oscillator.start = () => {};
    oscillator.stop = () => {};
    this.lastOscillator = oscillator;
    return oscillator;
  }
  async resume() { this.state = 'running'; }
  async close() { this.closeCount++; this.state = 'closed'; }
}

async function withAudioContext(Context, run) {
  const previousAudioContext = globalThis.AudioContext;
  const previousWebkitAudioContext = globalThis.webkitAudioContext;
  globalThis.AudioContext = Context;
  delete globalThis.webkitAudioContext;
  try {
    await run();
  } finally {
    if (previousAudioContext === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previousAudioContext;
    if (previousWebkitAudioContext === undefined) delete globalThis.webkitAudioContext;
    else globalThis.webkitAudioContext = previousWebkitAudioContext;
  }
}

test('audio update preserves priority order and the 12 and 34 event limits', () => {
  const engine = new AudioEngine();
  engine.ready = true;
  engine.ctx = {currentTime:1};
  engine.musicBus = {gain:new MockParam()};
  const played = [];
  engine.playEvent = event => played.push(event.type);
  const regular = Array.from({length:40}, (_, index) => ({type:'regular-' + index}));
  const priority = [
    'playerHit','lifeLost','bomb','shieldBreak','shieldRestore','powerUp',
    'wakeRoll','wakeReady','wakeConvert','bossDown','bossPhase','bossEnter'
  ].map(type => ({type}));

  engine.update({mode:'title',stage:1,events:[...regular,...priority]},1/60);

  assert.deepEqual(played.slice(0,12),priority.map(event => event.type),
    'the first twelve priority events play before regular events in their original order');
  assert.equal(played.length,34,'the update handles at most 34 event plays');
  assert.deepEqual(played.slice(12),regular.slice(0,22).map(event => event.type));
});

test('failed initial resume closes and clears its context so a muted retry can succeed', async () => {
  const contexts = [];
  class RetryContext extends MockAudioContext {
    constructor() { super(); contexts.push(this); }
    async resume() {
      if (contexts.length === 1) throw new Error('resume rejected');
      this.state = 'running';
    }
  }
  await withAudioContext(RetryContext, async () => {
    const engine = new AudioEngine();
    engine.setMuted(true);
    const scheduledStep = engine.nextStep;

    await engine.unlock();

    assert.equal(contexts.length,1);
    assert.equal(contexts[0].closeCount,1,'failed context closes exactly once');
    assert.equal(engine.ready,false);
    assert.equal(engine.ctx,null);
    assert.equal(engine.master,null);
    assert.equal(engine.musicBus,null);
    assert.equal(engine.fxBus,null);
    assert.equal(engine.combatBus,null);
    assert.equal(engine.echoSend,null);
    assert.equal(engine.noiseBuffer,null);
    assert.deepEqual(engine.waves,{});
    assert.equal(engine.muted,true,'failed unlock preserves the mute choice');
    assert.equal(engine.nextStep,0,'failed unlock leaves step scheduling reset');

    await engine.unlock();

    assert.equal(contexts.length,2,'later gesture creates a fresh context');
    assert.equal(contexts[1].closeCount,0);
    assert.equal(engine.ready,true);
    assert.strictEqual(engine.ctx,contexts[1]);
    assert.equal(engine.master.gain.value,0,'retry keeps the master silent while muted');
    assert.equal(engine.muted,true);
    assert.equal(engine.nextStep,contexts[1].currentTime+0.04);
    assert.equal(scheduledStep,0);
  });
});

test('concurrent audio unlock calls share one context until resume settles', async () => {
  let finishResume;
  const contexts = [];
  class PendingContext extends MockAudioContext {
    constructor() { super(); contexts.push(this); }
    resume() {
      return new Promise(resolve => {
        finishResume = () => { this.state = 'running'; resolve(); };
      });
    }
  }
  await withAudioContext(PendingContext, async () => {
    const engine = new AudioEngine();
    const first = engine.unlock();
    const second = engine.unlock();
    assert.strictEqual(first,second,'callers receive the same pending unlock promise');
    assert.equal(contexts.length,1,'concurrent gestures do not create overlapping contexts');
    assert.equal(engine.ready,false,'unlock remains unavailable until resume settles');
    assert.equal(contexts[0].closeCount,0);

    finishResume();
    await Promise.all([first,second]);

    assert.equal(engine.ready,true);
    assert.strictEqual(engine.ctx,contexts[0]);
    assert.equal(contexts[0].closeCount,0);
  });
});

test('a failed resumed context resets scheduler state and isolates late voice callbacks', async () => {
  const contexts = [];
  class RecoveringContext extends MockAudioContext {
    constructor() { super(); contexts.push(this); this.rejectResume = false; }
    async resume() {
      if (this.rejectResume) throw new Error('resume rejected');
      this.state = 'running';
    }
  }
  await withAudioContext(RecoveringContext, async () => {
    const engine = new AudioEngine();
    await engine.unlock();
    const oldContext = contexts[0];
    engine.tone(440,oldContext.currentTime,0.1,0.1,'sine',engine.fxBus);
    const oldOscillator = oldContext.lastOscillator;
    engine.lastSound.set('old-cue',oldContext.currentTime);
    engine.lastMode = 'playing';
    engine.musicKey = 'old-score';
    engine.musicTarget = 0.4;
    engine.step = 17;
    engine.nextStep = 88;
    engine.duckUntil = 24;
    engine.duckFloor = 0.35;
    engine.duckRelease = 0.8;
    engine.arrangementPhase = 3;
    oldContext.state = 'suspended';
    oldContext.rejectResume = true;

    await engine.unlock();

    assert.equal(oldContext.closeCount,1);
    assert.equal(engine.lastSound.size,0);
    assert.equal(engine.lastMode,'');
    assert.equal(engine.musicKey,'');
    assert.equal(engine.musicTarget,null);
    assert.equal(engine.step,0);
    assert.equal(engine.nextStep,0);
    assert.equal(engine.duckUntil,0);
    assert.equal(engine.duckFloor,1);
    assert.equal(engine.duckRelease,0.22);
    assert.equal(engine.arrangementPhase,1);
    assert.equal(engine.activeVoices,0);

    await engine.unlock();
    assert.equal(contexts.length,2);
    engine.tone(660,contexts[1].currentTime,0.1,0.1,'sine',engine.fxBus);
    assert.equal(engine.activeVoices,1);
    oldOscillator.onended();
    assert.equal(engine.activeVoices,1,'an old context callback cannot decrement the new context count');
  });
});
