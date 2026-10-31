// Page-level ambience around the playfield: masthead, side panels and site backdrop.
// Everything here is presentation. It reads the game and writes the DOM only when a value changes.
import { SECTOR_NAMES, FLAGSHIP_NAMES, actName, threatName, ACT_TWO_STAGE, bossWarningProgress, interludeProgress, lightningAt, actTwoInterlude } from './timeline.js';
import { CAMPAIGN_STAGES } from './game.js';

const TAU = Math.PI * 2;
const SPECIALS = { kestrel: 'NOVA', manta: 'BARRIER', wraith: 'STORM' };
const SECTORS = [null,
  { heading: 'Into the<br><em>shallows.</em>', copy: 'Reef channels and carrier pickets. Break the formation, graze hostile fire to charge WAKE, then roll through.',
    weather: 'CLEAR / WIND 08 KT', sea: 'SEA STATE 2', hdg: 292, signal: 4, lat: 12.8, lon: 151.1 },
  { heading: 'Through the<br><em>storm wall.</em>', copy: 'Lightning over the foundry line. Read each corridor early; the squall closes it fast.',
    weather: 'SQUALL / WIND 34 KT', sea: 'SEA STATE 6', hdg: 305, signal: 3, lat: 14.3, lon: 148.6 },
  { heading: 'Beneath<br><em>the Crown.</em>', copy: 'The maelstrom feeds the last flagship. Bait the lance, then leave the lane.',
    weather: 'MAELSTROM / SHEAR 61 KT', sea: 'SEA STATE 9', hdg: 318, signal: 2, lat: 15.9, lon: 146.2 },
  { heading: 'Into the<br><em>typhoon.</em>', copy: 'The real fleet rides the storm. Strip hull turrets, kill scavengers before they steal your salvage, and dodge violet void rounds: the reflector cannot stop them.',
    weather: 'TYPHOON / WIND 70 KT', sea: 'SEA STATE 9 / PHENOMENAL', hdg: 331, signal: 2, lat: 33.2, lon: 171.08, jam: true },
  {heading:'Above the<br><em>storm.</em>',copy:'Above the storm, the factories fly. Watch below for bomber boxes. Break foundry bays and follow the gaps through HALCYON’s lattice.',weather:'DUSK / HIGH ALTITUDE / WIND 26 KT',sea:'CLOUD FLOOR / TYPHOON BELOW',hdg:88,signal:3,lat:35+40/60,lon:176+20/60},
];
const sectorOf = value => Math.min(CAMPAIGN_STAGES, Math.max(1, Math.floor(Number(value) || 1)));
const SIGNAL_LABELS = ['NO CARRIER', 'LINK JAMMED', 'LINK WEAK', 'LINK FAIR', 'LINK SOLID'];
const SCREEN_STATES = { title: 'COMMAND LINK', hangar: 'DECK STANDBY', play: 'LIVE SORTIE', pause: 'HOLDING PATTERN', end: 'DEBRIEF' };
const pad = (n, w = 2) => String(Math.max(0, Math.floor(n))).padStart(w, '0');
const clock = seconds => pad(seconds / 60) + ':' + pad(seconds % 60);
function coordinate(value, positive, negative) {
  const deg = Math.floor(Math.abs(value)), min = (Math.abs(value) - deg) * 60;
  return (value >= 0 ? positive : negative) + ' ' + deg + '°' + min.toFixed(1).padStart(4, '0') + '′';
}

export class Ambience {
  constructor() {
    this._reduced = false;
    this.screen = 'title';
    this.attrs = Object.create(null);
    this.texts = Object.create(null);
    this.styles = Object.create(null);
    this.ready = typeof document !== 'undefined';
    this.telemetry = { hdg: 292, alt: 6200, ias: 288, pitch: 0 };
    this.teleClock = 1; this.radarClock = 1; this.gridClock = 1;
    this.lastStage = 0; this.lastPhase = 0; this.lastStrike = -1; this.warned = false; this.critical = false;
    this.signalDip = 0; this.jamClock = 0; this.jamUntil = 0; this.stealLogged = -9; this.actTwoLogged = false;
    this.skyLogs = Object.create(null);
    this.lite = false; this.perfTime = 0; this.perfFrames = 0;
    this.gutters = null;
    if (!this.ready) return;
    this.body = document.body;
    this.el = id => document.getElementById(id);
    this.compactQuery = typeof matchMedia === 'function' ? matchMedia('(min-width:741px)') : null;
    this.leftQuery = typeof matchMedia === 'function' ? matchMedia('(min-width:1101px)') : null;
    this._prepareRadar();
    this._tickClock();
    this.clockTimer = setInterval(() => this._tickClock(), 1000);
    if (typeof addEventListener === 'function') addEventListener('resize', () => { this.gutters = null; });
    this.setScreen('title');
  }

  get reducedEffects() { return this._reduced; }
  set reducedEffects(value) {
    this._reduced = !!value;
    if (this.ready) this._attr('reducedFx', this._reduced ? '1' : null);
    if (this._reduced && this.ready) this._style('consoleFlash', 'opacity', '0');
  }

  // Screen change: 'title' | 'hangar' | 'play' | 'pause' | 'end'.
  setScreen(screen) {
    this.screen = screen;
    if (!this.ready) return;
    this._attr('screen', screen);
    if (screen === 'play') this.gutters = null;
    this._text('consoleState', SCREEN_STATES[screen] || 'COMMAND LINK');
    if (screen !== 'play' && screen !== 'pause') {
      this._attr('rank', null); this._attr('threat', null); this._attr('flagship', null); this._attr('interlude', null);
      this._style('consoleFlash', 'opacity', '0');
      this._setSignal(4);
    }
  }

  // New sortie or drill launched.
  reset(game) {
    if (!this.ready) return;
    this.lastStage = 0; this.lastPhase = 0; this.lastStrike = -1; this.warned = false; this.critical = false;
    this.jamUntil = 0; this.stealLogged = -9; this.actTwoLogged = false;
    this.teleClock = this.radarClock = this.gridClock = 1;
    const log = this.el('consoleLog');
    if (log) log.textContent = '';
    const ship = String(game?.shipId || 'kestrel').toUpperCase();
    this._log('00:00', game?.practiceStage ? ship + ' AIRBORNE / UNRANKED DRILL' : ship + ' AIRBORNE / ACT I', 'cool');
    this._applySector(game, true);
  }

  // Every play frame. Cheap: no layout reads, write only on change.
  update(game, dt) {
    if (!this.ready || !game) return;
    dt = Math.min(0.1, Math.max(0, Number(dt) || 0));
    const stage = sectorOf(game.stage);
    if (stage !== this.lastStage) this._applySector(game);
    const p = game.player || {};
    const playing = game.mode === 'playing';
    const warning = bossWarningProgress(game);
    const interlude = interludeProgress(game);
    const boss = game.boss && game.boss.hp > 0 ? game.boss : null;
    const critical = playing && Number(p.hp) <= 1;
    this._attr('rank', threatName(game.threat).toLowerCase());
    this._attr('threat', critical ? 'critical' : boss ? 'boss' : warning >= 0 ? 'warning' : 'calm');
    this._attr('flagship', boss ? '1' : null);
    this._attr('interlude', interlude >= 0 ? (actTwoInterlude(game) ? 'act2' : '1') : null);
    this._attr('drill', game.practiceStage ? '1' : null);
    this._events(game, stage, boss, warning, critical);
    // Adaptive quality: if play runs under ~40 fps for two seconds, freeze the backdrop's
    // continuous drift. Software-rendered browsers repaint those large masked layers every
    // frame. Flashes and alerts keep working. Once on, it stays on for the session.
    if (!this.lite && playing && dt > 0) {
      this.perfTime += dt; this.perfFrames++;
      if (this.perfTime >= 2) {
        if (this.perfTime / this.perfFrames > 1 / 40) { this.lite = true; this._attr('backdrop', 'lite'); }
        this.perfTime = 0; this.perfFrames = 0;
      }
    }

    // Instruments only exist on the wide layout; the compact layout skips all of this.
    const wide = !this.body.classList.contains('compact-controls') && (!this.compactQuery || this.compactQuery.matches);
    if (!wide) return;
    this._meter(game, stage, boss, interlude);
    this._lightning(game, stage);
    this._attitude(p, dt);
    this.teleClock += dt;
    if (this.teleClock >= 0.125) { this._telemetry(game, p, stage, this.teleClock); this.teleClock = 0; }
    this.radarClock += dt;
    if (this.radarClock >= 1 / 30) { this.radarClock = 0; this._drawRadar(game, p, boss); }
    this.gridClock += dt;
    if (this.gridClock >= 0.5) { this.gridClock = 0; this._grid(game, stage); }
  }

  _applySector(game, force = false) {
    const stage = sectorOf(game?.stage);
    const info = SECTORS[stage];
    const changed = stage !== this.lastStage;
    this.lastStage = stage;
    this._attr('sector', String(stage));
    const drill = Number(game?.practiceStage) || 0;
    this._text('consoleKicker', drill ? 'FLAGSHIP DRILL / UNRANKED' : actName(stage) + ' / SECTOR ' + pad(stage));
    this._html('consoleHeading', drill ? 'Flagship<br><em>drill.</em>' : info.heading);
    this._text('consoleCopy', drill ? 'Arrival kit against ' + FLAGSHIP_NAMES[stage] + '. Learn the pattern; campaign records stay untouched.' : info.copy);
    this._text('consoleTheater', 'PACIFIC FRONT / ' + pad(stage) + ' ' + SECTOR_NAMES[stage]);
    this._text('consoleWeather', info.weather);
    this._setSignal(info.signal);
    this._grid(game, stage);
    for (const node of document.querySelectorAll('.console-route [data-node]')) {
      const n = Number(node.dataset.node);
      node.dataset.state = n < stage ? 'clear' : n === stage ? 'active' : 'ahead';
    }
    if ((changed || force) && game?.mode === 'playing' && !drill && Number(game.stageTime) < 2) {
      this._log(clock(game.time || 0), 'SECTOR ' + pad(stage) + ' / ' + SECTOR_NAMES[stage] + ' ENTERED', stage >= ACT_TWO_STAGE ? 'warn' : 'cool');
      if (info.jam) this._log(clock(game.time || 0), 'TYPHOON FRONT / COMMAND LINK DEGRADED', 'hot');
    }
  }

  _events(game, stage, boss, warning, critical) {
    const t = clock(Number(game.time) || 0);
    const name = FLAGSHIP_NAMES[stage];
    if (warning >= 0 && !this.warned) { this.warned = true; this._log(t, 'CONTACT / FLAGSHIP SIGNATURE AHEAD', 'warn'); }
    if (warning < 0 && !boss) this.warned = false;
    if (critical && !this.critical) this._log(t, 'HULL CRITICAL / EVADE', 'hot');
    this.critical = critical;
    for (const event of game.events || []) {
      switch (event?.type) {
        case 'bossEnter': this.lastPhase = 1; this._log(t, stage >= ACT_TWO_STAGE ? name + ' SURFACING / ' + 'SUPER-DREADNOUGHT ENGAGED' : 'FLAGSHIP ' + name + ' ENGAGED', 'hot'); break;
        case 'bossPhase': {
          const phase = Number(event.value) || (boss?.phase ?? 2);
          if (phase !== this.lastPhase) { this.lastPhase = phase; this._log(t, name + ' / PHASE ' + phase + ' / PATTERN SHIFT', 'warn'); }
          break;
        }
        case 'bossDown': this._log(t, stage >= ACT_TWO_STAGE ? name + ' SINKING / SECTOR ' + pad(stage) + ' CLEAR' : name + ' DOWN / SECTOR ' + pad(stage) + ' CLEAR', 'gold'); break;
        case 'actTwo':
          if (!this.actTwoLogged) { this.actTwoLogged = true; this._log(t, 'ACT II / THE CROWN WAS ONLY THE GATE', 'gold'); this._log(t, 'NEW CONTACT / ENEMY BATTLE LINE IN TYPHOON', 'warn'); }
          break;
        case 'boxEnter': case 'flakMark': case 'foundryEnter': case 'foundryDown': case 'laserWarn': case 'empPulse': case 'wingBreak': {
          const now=Number(game.time)||0;
          if(now-(this.skyLogs[event.type]??-99)<4)break;
          this.skyLogs[event.type]=now;
          const copy={boxEnter:event.value==='climb'?'BOMBER BOX / CLIMBING FROM BELOW':'BOMBER BOX / DIVING',flakMark:'FLAK ALTITUDE MARKED / FIND THE GAP',foundryEnter:'FLYING FOUNDRY / BREAK THE BAYS',foundryDown:'FOUNDRY FALLING THROUGH CLOUD',laserWarn:'HALCYON / LATTICE CHARGING',empPulse:event.value?'EMP / ESCORTS OFFLINE':'EMP / ESCORTS PROTECTED',wingBreak:'HALCYON / WING BREAKING APART'};
          this._log(t,copy[event.type],event.type==='wingBreak'||event.type==='foundryDown'?'gold':'warn');break;
        }
        case 'hullEnter': this._log(t, 'ARMORED HULL / ' + String(event.value || 'warship').toUpperCase() + ' IN THE LINE', 'warn'); break;
        case 'hullDown': this._log(t, String(event.value || 'hull').toUpperCase() + ' HULL BROKEN', 'gold'); break;
        case 'scavengerSteal':
          if ((Number(game.time) || 0) - this.stealLogged > 5) { this.stealLogged = Number(game.time) || 0; this._log(t, 'SCAVENGER / SALVAGE STOLEN', 'hot'); }
          break;
        case 'broadside': this._log(t, name + ' / BROADSIDE ' + (Number(event.value) < 0 ? 'PORT' : 'STARBOARD'), 'warn'); break;
        case 'coreExposed': this._log(t, 'MONSOON ENGINE EXPOSED', 'gold'); break;
        case 'lifeLost': if (Number(event.value) > 0) this._log(t, 'AIRFRAME LOST / RESERVE LAUNCHED', 'hot'); break;
        case 'extend': this._log(t, 'SCORE EXTEND / RESERVE AUTHORISED', 'gold'); break;
        case 'powerUp': this._log(t, 'ARMAMENT / LEVEL ' + (Number(event.value) || 1), 'cool'); break;
        case 'bomb': this._log(t, (SPECIALS[game.shipId] || 'SPECIAL') + ' DEPLOYED', 'gold'); break;
        case 'reactorBreak': this._log(t, Number(event.value) < 0 ? 'LEFT REACTOR / COVER OPEN' : 'RIGHT REACTOR / SPIRAL OFFLINE', 'gold'); break;
        case 'lanceCancel': this._log(t, 'LANCE VENTED', 'cool'); break;
        case 'victory': this._log(t, 'OPERATION COMPLETE / FLEET DISABLED', 'gold'); break;
        case 'gameover': this._log(t, 'MAYDAY / SIGNAL LOST', 'hot'); break;
      }
    }
  }

  _log(time, text, tone) {
    const log = this.el('consoleLog');
    if (!log) return;
    const item = document.createElement('li');
    item.dataset.tone = tone;
    const stamp = document.createElement('time');
    stamp.textContent = time;
    item.append(stamp, text);
    log.prepend(item);
    while (log.children.length > 5) log.lastElementChild.remove();
  }

  _meter(game, stage, boss, interlude) {
    let label, value, mode;
    if (boss) { label = 'FLAGSHIP / ' + FLAGSHIP_NAMES[stage] + ' HULL'; value = Math.max(0, boss.hp / boss.maxHp); mode = 'boss'; }
    else if (interlude >= 0) { label = 'SECTOR ' + pad(stage) + ' / CLEAR'; value = 1; mode = 'clear'; }
    else {
      const goal = Number(game.stageGoal?.[stage]) || 60;
      label = 'SECTOR ' + pad(stage) + ' / FLAGSHIP ETA ' + pad(Math.max(0, goal - (Number(game.stageTime) || 0)));
      value = Math.min(1, Math.max(0, Number(game.progress) || 0)); mode = 'route';
    }
    this._text('consoleMeterLabel', label);
    this._text('consoleMeterValue', Math.round(value * 100) + '%');
    this._attr('meter', mode);
    this._style('consoleMeterFill', 'transform', 'scaleX(' + (Math.round(value * 400) / 400) + ')');
  }

  _lightning(game, stage) {
    if (this._reduced || this.screen !== 'play') { this._style('consoleFlash', 'opacity', '0'); return; }
    const strike = lightningAt(game.time, stage);
    if (strike && strike.id !== this.lastStrike) {
      this.lastStrike = strike.id;
      // Strike in one of the open gutters between the panels and the playfield, where the bolt can be seen.
      const gutters = this.gutters || (this.gutters = this._measureGutters());
      const x = gutters.length ? gutters[Math.min(gutters.length - 1, Math.floor(strike.x * gutters.length))] + 'px' : Math.round(12 + strike.x * 76) + '%';
      this._style('consoleFlash', '--lx', x);
      this.signalDip = SECTORS[stage]?.jam ? 1.6 : 0.9;
    }
    this._style('consoleFlash', 'opacity', strike ? (Math.round(strike.flash * (stage===5?.12:1) * 50) / 50).toString() : '0');
  }

  // One layout read per screen entry or resize, never per frame.
  _measureGutters() {
    const width = document.documentElement.clientWidth || 0;
    const boxes = ['.left-panel', '#gameFrame', '.right-panel']
      .map(selector => document.querySelector(selector))
      .filter(node => node && node.offsetParent !== null)
      .map(node => node.getBoundingClientRect())
      .sort((a, b) => a.left - b.left);
    const gutters = [];
    let edge = 0;
    for (const box of [...boxes, { left: width, right: width }]) {
      if (box.left - edge >= 48) gutters.push(Math.round((edge + box.left) / 2));
      edge = Math.max(edge, box.right + 10);
    }
    return gutters;
  }

  _setSignal(level) {
    level = Math.max(0, Math.min(4, level));
    const node = this.el('consoleSignal');
    if (node && this.styles.signal !== level) { this.styles.signal = level; node.dataset.level = String(level); }
    this._text('consoleSignalLabel', SIGNAL_LABELS[level]);
  }

  _attitude(p, dt) {
    const bank = Math.max(-1, Math.min(1, Number(p.bank) || 0));
    const vy = Number.isFinite(p.headingY) ? Math.max(-6, Math.min(6, -p.headingY)) : 0;
    this.telemetry.pitch += (vy * 1.6 - this.telemetry.pitch) * Math.min(1, dt * 4);
    const roll = this._reduced ? 0 : Math.round(-bank * 28 * 4) / 4;
    const pitch = Math.round(Math.max(-9, Math.min(9, this.telemetry.pitch)) * 2) / 2;
    this._style('consoleAttitude', 'transform', 'rotate(' + roll + 'deg) translateY(' + pitch + 'px)');
  }

  _telemetry(game, p, stage, dt) {
    const s = this.telemetry, k = Math.min(1, dt * 3);
    const base = SECTORS[stage].hdg;
    const bank = Number(p.bank) || 0;
    const t = Number(game.time) || 0;
    const hdgTarget = base + bank * 14 + Math.sin(t * 0.31) * 1.4;
    const altTarget = (stage===5?14500:5200) + (820 - (Number(p.y) || 750)) * 7 + Math.sin(t * 0.7) * 18;
    let iasTarget = (112 + stage * 25) * 2.1;
    if (p.focus) iasTarget -= 62;
    if (Number(p.roll) > 0) iasTarget += 120;
    if (game.boss) iasTarget -= 18;
    s.hdg += (hdgTarget - s.hdg) * k; s.alt += (altTarget - s.alt) * k; s.ias += (iasTarget - s.ias) * k;
    const hdg = ((Math.round(s.hdg) % 360) + 360) % 360;
    this._text('teleHdg', pad(hdg, 3) + '°');
    this._text('teleAlt', (Math.round(s.alt / 10) * 10).toLocaleString('en-US'));
    this._text('teleIas', String(Math.round(s.ias + Math.sin(t * 9.3))));
    // Storms dent the command link briefly after each strike.
    this.signalDip = Math.max(0, this.signalDip - dt);
    let level = SECTORS[stage].signal - (this.signalDip > 0 ? 1 : 0) - (game.boss && stage >= 3 ? 1 : 0);
    // Typhoon jamming: the link drops out in short bursts and readouts scramble.
    if (SECTORS[stage].jam) {
      this.jamClock += dt;
      if (this.jamClock >= 0.5) { this.jamClock = 0; if (Math.random() < (game.boss ? .3 : .16)) this.jamUntil = t + .4 + Math.random() * .8; }
      if (t < this.jamUntil) {
        level = 0;
        this._text('teleAlt', '-,---');
      }
    }
    this._attr('jam', SECTORS[stage].jam && t < this.jamUntil ? '1' : null);
    this._setSignal(level);
  }

  _grid(game, stage) {
    const info = SECTORS[stage];
    const t = Number(game?.time) || 0;
    const lat = info.lat + t * 0.0009, lon = info.lon - t * 0.0021;
    this._text('consoleGrid', 'GRID ' + coordinate(lat, 'N', 'S') + ' / ' + coordinate(lon, 'E', 'W') + ' · ' + info.sea);
  }

  _tickClock() {
    if (typeof document !== 'undefined' && document.hidden) return;
    const d = new Date();
    this._text('consoleClock', 'UTC ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()));
  }

  // Radar: a cached scope face, a cached sweep wedge and live blips for every hostile in range.
  _prepareRadar() {
    const canvas = this.el('consoleRadar');
    if (!canvas || !canvas.getContext) return;
    const size = 136, dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
    canvas.width = size * dpr; canvas.height = size * dpr;
    this.radar = { canvas, ctx: canvas.getContext('2d'), size, dpr };
    const make = () => { const c = document.createElement('canvas'); c.width = size * dpr; c.height = size * dpr; const g = c.getContext('2d'); g.scale(dpr, dpr); return [c, g]; };
    const r = size / 2;
    const [face, f] = make();
    const glow = f.createRadialGradient(r, r, 4, r, r, r);
    glow.addColorStop(0, 'rgba(32,74,78,.55)'); glow.addColorStop(1, 'rgba(6,22,28,.92)');
    f.fillStyle = glow; f.beginPath(); f.arc(r, r, r - 1, 0, TAU); f.fill();
    f.strokeStyle = 'rgba(122,216,205,.32)'; f.lineWidth = 1;
    for (const k of [0.33, 0.66, 0.98]) { f.beginPath(); f.arc(r, r, (r - 2) * k, 0, TAU); f.stroke(); }
    f.strokeStyle = 'rgba(122,216,205,.16)';
    f.beginPath(); f.moveTo(r, 3); f.lineTo(r, size - 3); f.moveTo(3, r); f.lineTo(size - 3, r); f.stroke();
    f.strokeStyle = 'rgba(122,216,205,.4)';
    for (let i = 0; i < 36; i++) {
      const a = i / 36 * TAU, inner = i % 9 === 0 ? r - 9 : r - 5;
      f.beginPath(); f.moveTo(r + Math.cos(a) * inner, r + Math.sin(a) * inner); f.lineTo(r + Math.cos(a) * (r - 2), r + Math.sin(a) * (r - 2)); f.stroke();
    }
    f.fillStyle = '#7ad8cd'; f.beginPath(); f.moveTo(r, r - 5); f.lineTo(r + 4, r + 4); f.lineTo(r, r + 2); f.lineTo(r - 4, r + 4); f.closePath(); f.fill();
    const sweep = color => {
      const [c, g] = make();
      g.translate(r, r);
      for (let i = 0; i < 28; i++) {
        const a0 = -i * 0.045, a1 = a0 - 0.05;
        g.fillStyle = 'rgba(' + color + ',' + (0.3 * Math.pow(1 - i / 28, 2.2)).toFixed(3) + ')';
        g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r - 2, a1, a0); g.closePath(); g.fill();
      }
      g.strokeStyle = 'rgba(' + color + ',.85)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(r - 2, 0); g.stroke();
      return c;
    };
    this.radar.face = face;
    this.radar.sweeps = { cool: sweep('122,216,205'), hot: sweep('233,112,87') };
    this.radar.angle = -Math.PI / 2;
    this.radar.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.radar.ctx.drawImage(face, 0, 0, size, size);
  }

  _drawRadar(game, p, boss) {
    const R = this.radar;
    if (!R || this.screen !== 'play') return;
    const { ctx: c, size } = R, r = size / 2;
    c.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    c.clearRect(0, 0, size, size);
    c.drawImage(R.face, 0, 0, size, size);
    const hot = !!boss || Number(p.hp) <= 1;
    if (!this._reduced) {
      R.angle = (R.angle + TAU / 2.6 / 30) % TAU;
      c.save(); c.translate(r, r); c.rotate(R.angle); c.drawImage(hot ? R.sweeps.hot : R.sweeps.cool, -r, -r, size, size); c.restore();
    }
    const px = Number(p.x) || 270, py = Number(p.y) || 750, scale = (r - 6) / 760, limit = (r - 5) * (r - 5);
    for (const e of game.enemies || []) {
      if (!e || e.dead) continue;
      const bx = r + ((Number(e.x) || 0) - px) * scale, by = r + ((Number(e.y) || 0) - py) * scale;
      const dx = bx - r, dy = by - r;
      if (dx * dx + dy * dy > limit) continue;
      let alpha = 0.85;
      if (!this._reduced) {
        const behind = ((R.angle - Math.atan2(dy, dx)) % TAU + TAU) % TAU;
        alpha = 0.22 + 0.78 * Math.pow(1 - behind / TAU, 3);
      }
      c.globalAlpha = alpha;
      if (e.type === 'boss') {
        c.strokeStyle = '#ff8a6e'; c.lineWidth = 1.5; c.beginPath(); c.arc(bx, by, 6, 0, TAU); c.stroke();
        c.fillStyle = '#ff8a6e'; c.fillRect(bx - 2, by - 2, 4, 4);
      } else {
        c.fillStyle = e.type === 'ace' ? '#9cf3e7' : e.type === 'mini' || e.type === 'bomber' || e.type === 'carrier' ? '#ffc98a' : '#f3bb70';
        const s = e.type === 'mini' || e.type === 'carrier' ? 4 : 2.6;
        c.fillRect(bx - s / 2, by - s / 2, s, s);
      }
    }
    c.globalAlpha = 1;
  }

  // DOM writes, each cached so unchanged values cost nothing.
  _attr(name, value) {
    if (this.attrs[name] === value) return;
    this.attrs[name] = value;
    if (value === null || value === undefined) delete this.body.dataset[name];
    else this.body.dataset[name] = value;
  }
  _text(id, value) {
    if (this.texts[id] === value) return;
    const node = this.el(id);
    if (!node) return;
    this.texts[id] = value; node.textContent = value;
  }
  _html(id, value) {
    const key = '#' + id;
    if (this.texts[key] === value) return;
    const node = this.el(id);
    if (!node) return;
    this.texts[key] = value; node.innerHTML = value;
  }
  _style(id, prop, value) {
    const key = id + '|' + prop;
    if (this.styles[key] === value) return;
    const node = this.el(id);
    if (!node) return;
    this.styles[key] = value;
    if (prop.startsWith('--')) node.style.setProperty(prop, value); else node.style[prop] = value;
  }
}
