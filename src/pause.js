// Pause / holding-pattern screen presentation.
// main.js calls these hooks; keep the exported API stable.
import { SHIPS, SPECIAL_LABELS, shipShape } from './ships.js';
import { SECTOR_NAMES, FLAGSHIP_NAMES, interludeProgress } from './timeline.js';

const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;
const SCOPE_RANGE = 820; // world units from the hold fix to the scope rim
const ORBIT_PERIOD = 14; // seconds per holding-pattern lap
const SWEEP_SPEED = 1.05; // radians per second

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const whole = v => Math.max(0, Math.floor(Number(v) || 0));
const pad = (v, width) => String(whole(v)).padStart(width, '0');
const clock = seconds => pad(whole(seconds) / 60, 2) + ':' + pad(whole(seconds) % 60, 2);

function setText(el, value) { if (el && el.textContent !== value) el.textContent = value; }
function setData(el, key, value) { if (el && el.dataset[key] !== value) el.dataset[key] = value; }
// Small indicator rows (lives, hull, power ...). Rebuilt only when the counts change.
function pips(el, total, filled, locked = total) {
  if (!el) return;
  const key = total + '/' + filled + '/' + locked;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  let html = '';
  for (let i = 0; i < total; i++) html += '<i class="' + (i < filled ? 'on' : i >= locked ? 'locked' : '') + '"></i>';
  el.innerHTML = html;
}
function surface(width, height) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(width)); c.height = Math.max(1, Math.round(height));
  return c;
}

// What the pilot should know right now: flagship tactics, the next contact, or the resupply.
function intelFor(game) {
  const stage = clamp(whole(game.stage) || 1, 1, 3);
  const boss = game.boss, drill = whole(game.practiceStage);
  if (boss) {
    const age = Number(boss.age) || 0, phase = clamp(whole(boss.phase) || 1, 1, 3);
    let head, tip;
    if (boss.guard) {
      const left = Math.max(0, (Number(boss.guardUntil) || 0) - age);
      head = 'ARMOR CYCLING';
      tip = 'The hull holds at this threshold until the pattern completes' + (left > 0.05 ? ' in ' + left.toFixed(1) + 's' : '') + '. Fly clean and keep the chain alive; damage lands again when the armor opens.';
    } else if (stage === 1) {
      head = phase === 1 ? 'FAN WEAVE' : 'TIGHTENING FANS';
      tip = phase === 1 ? 'Vesper opens its fire in arcs. Slip through the gaps beneath the hull, graze the edges for WAKE and roll when charged.'
        : 'Each phase packs the arcs closer. Focus to thread the narrow gaps and save a roll for the densest fan.';
    } else if (stage === 2) {
      const r = boss.reactor, cover = boss.cover;
      const coverLeft = cover ? Math.max(0, (Number(cover.until) || 0) - age) : 0;
      if (coverLeft > 0) { head = 'COVER LANE OPEN'; tip = 'The marked cover holds for ' + coverLeft.toFixed(1) + 's more. Use it to reset your line before it closes.'; }
      else if (r && !r.broken && r.side < 0) { head = 'LEFT REACTOR'; tip = 'Aim direct fire at the glowing left reactor. Breaking it opens a marked cover lane for 3.2 seconds and grants WAKE.'; }
      else if (r && !r.broken) { head = 'RIGHT REACTOR'; tip = 'Break the right reactor to disable the spiral cannon for the rest of the fight, or keep pressing the main hull.'; }
      else if (r && r.phase === 3 && r.broken) { head = 'SPIRAL OFFLINE'; tip = 'The right spiral cannon is silenced for the rest of the fight. Press the main hull.'; }
      else { head = 'OPTIONAL REACTORS'; tip = 'In phases two and three a side reactor opens. The left buys 3.2 seconds of cover; the right silences the spiral cannon.'; }
    } else {
      const l = boss.lance;
      const live = l && !l.cancelled && age >= l.startsAt && age < l.endsAt;
      if (phase === 1) { head = 'LANCE AHEAD'; tip = 'From phase two the Crown’s tracking lance hunts your lane. Let it track you, then move out when it locks.'; }
      else if (live && l.active) { head = 'LANCE FIRING'; tip = 'Stay clear until the beam fades. Rolls can cross it; any ship special vents the charge.'; }
      else if (live && l.locked) { head = 'LANCE LOCKED'; tip = 'The lane is fixed now. Leave it before it fires. Rolls can cross it; any ship special vents the charge.'; }
      else if (live) { head = 'LANCE TRACKING'; tip = 'Let the marked lane follow you, then move out the moment it locks. A special vents the charge.'; }
      else { head = 'TRACKING LANCE'; tip = 'Bait the marked lane, then move out when it locks. The locked lane stays fixed before firing. Rolls can cross it.'; }
    }
    const hull = boss.maxHp ? clamp(boss.hp / boss.maxHp, 0, 1) : 1;
    return { kind: 'boss', kicker: 'FLAGSHIP INTEL', right: 'PHASE ' + phase + ' / 3', name: boss.name || FLAGSHIP_NAMES[stage],
      sub: drill ? 'FLAGSHIP DRILL / UNRANKED' : 'SECTOR ' + pad(stage, 2) + ' FLAGSHIP', hull, head, tip };
  }
  if (interludeProgress(game) >= 0) {
    if (drill) return { kind: 'clear', kicker: 'FLAGSHIP DOWN', right: 'DRILL COMPLETE', name: FLAGSHIP_NAMES[stage], sub: 'UNRANKED / CAMPAIGN RECORDS PRESERVED', hull: null, head: 'DEBRIEF', tip: 'The flight record is next. Take the pattern into your next sortie.' };
    if (stage >= 3) return { kind: 'clear', kicker: 'SECTOR 03 CLEAR', right: 'ROUTE COMPLETE', name: 'THE SKY IS OPEN', sub: 'OPERATION LONG MERIDIAN', hull: null, head: 'FINAL LEG', tip: 'Every flagship is down. Resume to bring the flight record home.' };
    return { kind: 'clear', kicker: 'SECTOR ' + pad(stage, 2) + ' CLEAR', right: 'NEXT / SECTOR ' + pad(stage + 1, 2), name: SECTOR_NAMES[stage + 1],
      sub: 'FLAGSHIP ' + FLAGSHIP_NAMES[stage + 1] + ' AHEAD', hull: null, head: 'RESUPPLY', tip: 'One hull point and one special are restored as you cross into the next front.' };
  }
  const goal = Number(game.stageGoal?.[stage]) || 0;
  const eta = Math.max(0, goal - (Number(game.stageTime) || 0));
  const tips = [null,
    ['CURRENT LANES', 'Formations open marked corridors. Follow the current, break each formation and collect power from fallen aircraft.'],
    ['STORM WALL', 'Pincers and relay strikes close from both flanks. Hold the centre, read the second lane opening and keep WAKE charged.'],
    ['THE ABYSS', 'Storm curtains sweep the maelstrom. Focus to thread the gaps and keep a special in reserve for the Crown.']];
  return { kind: 'approach', kicker: 'NEXT CONTACT', right: 'ETA ' + clock(eta), name: FLAGSHIP_NAMES[stage], sub: 'SECTOR ' + pad(stage, 2) + ' FLAGSHIP',
    hull: null, head: tips[stage][0], tip: tips[stage][1] };
}

function flavorFor(game, critical, intel) {
  if (critical) return 'One more hit costs this airframe. Breathe, pick your line, then go.';
  if (game.practiceStage) return 'Unranked practice. Rehearse the pattern as often as you need.';
  if (intel.kind === 'boss') return 'The flagship holds its pattern. Study it, then return to the sky.';
  if (intel.kind === 'clear') return 'Sector clear. The next front is already forming on the horizon.';
  return 'The storm can wait. Take a breath, read the pattern, and return to the sky.';
}

// Route position 0..1 along Operation Long Meridian. Each sector owns a third;
// its flagship node sits at the centre of that third.
function routePosition(game) {
  const stage = clamp(whole(game.stage) || 1, 1, 3);
  const third = 1 / 3;
  if (game.boss) return (stage - 0.5) * third;
  const interlude = interludeProgress(game);
  if (interlude >= 0) return (stage - 0.5) * third + interlude * third * 0.5;
  const goal = Number(game.stageGoal?.[stage]) || 1;
  const p = clamp((Number(game.stageTime) || 0) / goal, 0, 1);
  return (stage - 1) * third + p * third * 0.5;
}

// The scope: a radar of the frozen sortie around the hold fix, with the aircraft
// flying a racetrack holding pattern. Static layers are cached per size.
class Scope {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas?.getContext('2d') || null;
    this.css = 0; this.dpr = 1; this.base = null; this.sweep = null;
    this.contacts = []; this.dust = []; this.shipId = 'kestrel';
  }
  resize() {
    if (!this.canvas || !this.g) return false;
    const css = Math.round(this.canvas.clientWidth || 0);
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    if (css < 40) return false;
    if (css === this.css && dpr === this.dpr && this.base) return true;
    this.css = css; this.dpr = dpr;
    this.canvas.width = Math.round(css * dpr); this.canvas.height = Math.round(css * dpr);
    this.buildBase(); this.buildSweep();
    return true;
  }
  buildBase() {
    const s = this.css, d = this.dpr, c = s / 2, r = s / 2 - 6;
    const layer = surface(s * d, s * d), g = layer.getContext('2d');
    g.scale(d, d);
    const face = g.createRadialGradient(c, c, r * 0.08, c, c, r);
    face.addColorStop(0, 'rgba(22,60,66,.95)'); face.addColorStop(0.7, 'rgba(9,32,40,.96)'); face.addColorStop(1, 'rgba(5,19,26,.98)');
    g.fillStyle = face; g.beginPath(); g.arc(c, c, r, 0, TAU); g.fill();
    // Dot grid inside the face.
    g.save(); g.beginPath(); g.arc(c, c, r, 0, TAU); g.clip();
    g.fillStyle = 'rgba(160,220,210,.07)';
    const step = Math.max(10, s / 22);
    for (let x = c % step; x < s; x += step) for (let y = c % step; y < s; y += step) g.fillRect(x - 0.5, y - 0.5, 1, 1);
    g.restore();
    g.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      g.strokeStyle = i === 4 ? 'rgba(122,216,205,.42)' : 'rgba(122,216,205,.16)';
      g.beginPath(); g.arc(c, c, r * i / 4, 0, TAU); g.stroke();
    }
    g.strokeStyle = 'rgba(122,216,205,.12)';
    g.beginPath(); g.moveTo(c - r, c); g.lineTo(c + r, c); g.moveTo(c, c - r); g.lineTo(c, c + r); g.stroke();
    // Bearing ticks: every 10 degrees, long every 30.
    for (let deg = 0; deg < 360; deg += 10) {
      const a = deg * Math.PI / 180 - Math.PI / 2, long = deg % 30 === 0;
      g.strokeStyle = long ? 'rgba(243,187,112,.55)' : 'rgba(168,189,186,.28)';
      g.beginPath(); g.moveTo(c + Math.cos(a) * (r - (long ? 9 : 5)), c + Math.sin(a) * (r - (long ? 9 : 5)));
      g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); g.stroke();
    }
    const font = Math.max(7, Math.round(s / 34));
    g.font = '700 ' + font + 'px Arial, Helvetica, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if ('letterSpacing' in g) g.letterSpacing = '1px';
    for (let deg = 0; deg < 360; deg += 30) {
      const a = deg * Math.PI / 180 - Math.PI / 2, rr = r - 9 - font;
      g.fillStyle = deg === 0 ? 'rgba(243,187,112,.85)' : 'rgba(168,189,186,.45)';
      g.fillText(deg === 0 ? 'FWD' : String(deg).padStart(3, '0'), c + Math.cos(a) * rr, c + Math.sin(a) * rr);
    }
    // Range marks sit just left of the aft axis, where contacts are rare.
    g.textAlign = 'right'; g.fillStyle = 'rgba(122,216,205,.48)';
    for (let i = 1; i <= 2; i++) g.fillText(i * 2 + ' NM', c - 5, c + r * i / 4 + font * 0.8);
    this.base = layer;
  }
  buildSweep() {
    const s = this.css, d = this.dpr, c = s / 2, r = s / 2 - 6;
    const layer = surface(s * d, s * d), g = layer.getContext('2d');
    g.scale(d, d); g.translate(c, c);
    // A fading wedge trailing the sweep line, which points straight up before rotation.
    const slices = 48, span = 1.15;
    for (let i = 0; i < slices; i++) {
      const a1 = -Math.PI / 2 - (i / slices) * span, a0 = -Math.PI / 2 - ((i + 1) / slices) * span;
      g.fillStyle = 'rgba(122,216,205,' + (0.26 * (1 - i / slices) ** 2).toFixed(3) + ')';
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, a0, a1 + 0.004); g.closePath(); g.fill();
    }
    g.strokeStyle = 'rgba(190,245,236,.75)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -r); g.stroke();
    this.sweep = layer;
  }
  // Snapshot hostile contacts relative to the frozen aircraft position.
  capture(game) {
    const p = game.player || { x: 270, y: 750 };
    const plot = (x, y) => {
      const dx = (Number(x) || 0) - p.x, dy = (Number(y) || 0) - p.y;
      const dist = Math.hypot(dx, dy);
      return { dx, dy, dist, bearing: (Math.atan2(dx, -dy) + TAU) % TAU };
    };
    this.contacts = [];
    for (const e of game.enemies || []) {
      if (!e || e.dead) continue;
      const boss = e.type === 'boss';
      this.contacts.push({ ...plot(e.x, e.y), kind: boss ? 'boss' : 'enemy', name: boss ? e.name : '' });
    }
    for (const item of game.pickups || []) this.contacts.push({ ...plot(item.x, item.y), kind: 'pickup' });
    this.dust = [];
    const bullets = game.bullets || [];
    const stride = Math.max(1, Math.ceil(bullets.length / 160));
    for (let i = 0; i < bullets.length; i += stride) this.dust.push(plot(bullets[i].x, bullets[i].y));
    return this.contacts.filter(item => item.kind !== 'pickup').length;
  }
  orbit(u, r) {
    // Racetrack holding pattern around the fix: two legs joined by half turns.
    const leg = r * 0.42, turn = r * 0.15, half = leg / 2;
    const straight = leg, arc = Math.PI * turn, total = 2 * straight + 2 * arc;
    let d = ((u % 1) + 1) % 1 * total, x, y, hx, hy;
    if (d < straight) { x = turn; y = half - d; hx = 0; hy = -1; }
    else if ((d -= straight) < arc) { const a = d / turn; x = Math.cos(a) * turn; y = -half - Math.sin(a) * turn; hx = -Math.sin(a); hy = -Math.cos(a); }
    else if ((d -= arc) < straight) { x = -turn; y = -half + d; hx = 0; hy = 1; }
    else { d -= straight; const a = d / turn; x = -Math.cos(a) * turn; y = half + Math.sin(a) * turn; hx = Math.sin(a); hy = Math.cos(a); }
    // Tilt the whole pattern a little so it reads as a drawn chart, not a UI shape.
    const tilt = -0.32, ct = Math.cos(tilt), st = Math.sin(tilt);
    return { x: x * ct - y * st, y: x * st + y * ct, hx: hx * ct - hy * st, hy: hx * st + hy * ct };
  }
  draw(t, animate) {
    const g = this.g;
    if (!g || !this.base) return;
    const s = this.css, d = this.dpr, c = s / 2, r = s / 2 - 6;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.drawImage(this.base, 0, 0);
    g.setTransform(d, 0, 0, d, 0, 0);
    const sweep = animate ? (t * SWEEP_SPEED) % TAU : 0;
    if (animate) {
      g.save(); g.translate(c, c); g.rotate(sweep);
      g.drawImage(this.sweep, -c, -c, s, s);
      g.restore();
    }
    const scale = (r * 0.94) / SCOPE_RANGE;
    // Contacts flare as the sweep passes, then fade over the rest of the turn.
    const glow = bearing => {
      if (!animate) return 0.85;
      const behind = ((sweep - bearing) % TAU + TAU) % TAU;
      return 0.16 + 0.84 * Math.exp(-behind * 1.3);
    };
    // Hostile fire as faint dust.
    g.fillStyle = '#e97057';
    for (const b of this.dust) {
      if (b.dist > SCOPE_RANGE) continue;
      g.globalAlpha = glow(b.bearing) * 0.5;
      g.fillRect(c + b.dx * scale - 0.75, c + b.dy * scale - 0.75, 1.5, 1.5);
    }
    const font = Math.max(7, Math.round(s / 32));
    g.font = '800 ' + font + 'px Arial, Helvetica, sans-serif';
    if ('letterSpacing' in g) g.letterSpacing = '1px';
    for (const item of this.contacts) {
      const clipped = item.dist > SCOPE_RANGE;
      const k = clipped ? SCOPE_RANGE / item.dist : 1;
      const x = c + item.dx * scale * k, y = c + item.dy * scale * k, a = glow(item.bearing);
      g.globalAlpha = a;
      if (item.kind === 'boss') {
        g.strokeStyle = '#e97057'; g.fillStyle = 'rgba(233,112,87,.32)'; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x + 8, y); g.lineTo(x, y + 8); g.lineTo(x - 8, y); g.closePath(); g.fill(); g.stroke();
        g.beginPath(); g.arc(x, y, 13, 0, TAU); g.globalAlpha = a * 0.45; g.stroke(); g.globalAlpha = a;
        // Label on whichever side has room, kept inside the scope (small scopes skip it).
        if (s < 220) continue;
        const bearing = String(Math.round(item.bearing * 180 / Math.PI) % 360).padStart(3, '0');
        const label = (item.name || 'FLAGSHIP') + ' ' + bearing + '°', width = g.measureText(label).width;
        let lx = x + 18 + width <= s - 4 ? x + 18 : x - 18 - width;
        lx = clamp(lx, 4, s - 4 - width);
        g.fillStyle = '#f6c9b4'; g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText(label, lx, y + (Math.abs(lx - x) < 18 ? 16 : 0));
      } else if (item.kind === 'enemy') {
        g.fillStyle = '#f3bb70';
        if (clipped) { g.fillRect(x - 1.5, y - 1.5, 3, 3); continue; }
        g.beginPath(); g.moveTo(x, y + 4); g.lineTo(x + 3.6, y - 3); g.lineTo(x - 3.6, y - 3); g.closePath(); g.fill();
      } else {
        g.fillStyle = '#7ad8cd'; g.fillRect(x - 2, y - 2, 4, 4);
      }
    }
    g.globalAlpha = 1;
    // Holding pattern, the hold fix and the orbiting aircraft.
    const steps = 64;
    g.setLineDash([3, 5]); g.strokeStyle = 'rgba(243,187,112,.42)'; g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i <= steps; i++) { const o = this.orbit(i / steps, r); if (i) g.lineTo(c + o.x, c + o.y); else g.moveTo(c + o.x, c + o.y); }
    g.stroke(); g.setLineDash([]);
    g.strokeStyle = 'rgba(122,216,205,.9)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(c - 6, c); g.lineTo(c - 2, c); g.moveTo(c + 2, c); g.lineTo(c + 6, c);
    g.moveTo(c, c - 6); g.lineTo(c, c - 2); g.moveTo(c, c + 2); g.lineTo(c, c + 6); g.stroke();
    g.beginPath(); g.moveTo(c, c - 4); g.lineTo(c + 4, c); g.lineTo(c, c + 4); g.lineTo(c - 4, c); g.closePath(); g.stroke();
    g.fillStyle = 'rgba(122,216,205,.75)'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText('HOLD FIX', c + 8, c + 6);
    const u = animate ? t / ORBIT_PERIOD : 0.62;
    for (let i = 14; i >= 1; i--) {
      const o = this.orbit(u - i * 0.006, r);
      g.globalAlpha = (1 - i / 15) * 0.55; g.fillStyle = '#f3bb70';
      g.fillRect(c + o.x - 1, c + o.y - 1, 2, 2);
    }
    g.globalAlpha = 1;
    const o = this.orbit(u, r);
    const size = Math.max(22, s * 0.1) / 210;
    g.save(); g.translate(c + o.x, c + o.y); g.rotate(Math.atan2(o.hx, -o.hy));
    shipShape(g, this.shipId, 0, 0, size, t);
    g.restore();
  }
}

export class PausePanel {
  constructor() {
    this.reducedEffects = false;
    this.visible = false;
    this.root = $('pauseScreen');
    this.scope = new Scope($('holdRadar'));
    this.craftCanvas = $('holdCraft');
    this.craftKey = '';
    this.dirty = true;
    this.lastDraw = -1;
    this.motion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (typeof ResizeObserver === 'function') {
      this.observer = new ResizeObserver(() => { this.dirty = true; this.craftKey = ''; });
      for (const el of [this.scope.canvas, this.craftCanvas]) if (el) this.observer.observe(el);
    }
  }
  get stillMotion() { return !!this.motion?.matches; }
  // Called when the pause screen opens. game is the live (paused) Game.
  // context: { shipId, ship (SHIPS entry), drill (0 or flagship drill number), career, compact }
  open(game, context = {}) {
    if (!game || !this.root) return;
    this.visible = true; this.dirty = true; this.craftKey = '';
    const shipId = SHIPS[context.shipId] ? context.shipId : SHIPS[game.shipId] ? game.shipId : 'kestrel';
    const ship = context.ship || SHIPS[shipId];
    this.scope.shipId = shipId;
    this.root.classList.toggle('hold-reduced', !!this.reducedEffects);
    const panel = $('holdPanel'); if (panel) panel.scrollTop = 0;

    const p = game.player || {};
    const stage = clamp(whole(game.stage) || 1, 1, 3);
    const drill = whole(game.practiceStage);
    const hp = whole(p.hp), maxHp = Math.max(1, whole(p.maxHp) || 4);
    const critical = hp <= 1;
    const condition = critical ? 'critical' : hp / maxHp <= 0.5 ? 'damaged' : 'nominal';
    const intel = intelFor(game);
    setData(this.root, 'stage', String(stage));
    setData(this.root, 'condition', condition);
    setData(this.root, 'kind', intel.kind);

    // Header.
    setText($('holdSector'), drill ? 'FLAGSHIP DRILL' : 'SECTOR ' + pad(stage, 2));
    setText($('holdSectorName'), drill ? FLAGSHIP_NAMES[drill] + ' / UNRANKED' : SECTOR_NAMES[stage]);
    setText($('holdClock'), clock(game.time) + ' IN FLIGHT');
    setText($('holdLine'), flavorFor(game, critical, intel));

    // Snapshot.
    const score = whole(game.score);
    setText($('holdScore'), pad(score, 8));
    const best = whole(context.career?.ships?.[shipId]?.bestScore);
    const sorties = whole(context.career?.ships?.[shipId]?.sorties);
    const record = $('holdRecord');
    const pace = !drill && best > 0 && score > best;
    setText(record, drill ? 'UNRANKED DRILL' : pace ? 'NEW BEST PACE' : sorties || best ? ship.name + ' BEST / ' + pad(best, 8) : 'FIRST SORTIE');
    record?.classList.toggle('hold-pace', pace);
    const level = Math.max(1, whole(p.level) || 1);
    setText($('holdPower'), 'LV ' + level);
    setText($('holdPowerLabel'), level > 8 ? 'POWER / OVERDRIVE' : 'POWER');
    setData($('holdPowerStat'), 'max', level > 8 ? 'yes' : 'no');
    pips($('holdPowerPips'), 8, Math.min(8, level), 8);
    setText($('holdEquipment'), 'E '+whole(p.escorts)+' · M '+whole(p.sidewinder)+' · ★ '+whole(p.signature)+' · R '+(Number(p.reflector)||0).toFixed(1)+'s');
    setText($('holdCombo'), (Number(game.combo) || 1).toFixed(1) + '×');
    const lives = whole(p.lives);
    setText($('holdLives'), String(lives));
    pips($('holdLivesPips'), Math.max(4, lives), lives);
    const special = SPECIAL_LABELS[shipId] || 'SPECIAL', bombs = whole(p.bombs);
    setText($('holdSpecialName'), special);
    setText($('holdSpecial'), String(bombs));
    pips($('holdSpecialPips'), Math.max(4, bombs), bombs);
    const wake = clamp(Number(p.wake) || 0, 0, 1);
    setText($('holdWake'), Math.round(wake * 100) + '%');
    setText($('holdWakeLabel'), wake >= 0.5 ? 'WAKE / CHARGED' : 'WAKE');
    setData($('holdWakeStat'), 'charged', wake >= 0.5 ? 'yes' : 'no');
    const wakeBar = $('holdWakeBar'); if (wakeBar) wakeBar.style.setProperty('--fill', wake.toFixed(3));
    setText($('holdGrazes'), String(whole(game.stats?.grazes)));

    // Airframe.
    setText($('holdCraftName'), ship.name);
    setText($('holdCraftCode'), ship.code + ' / ' + ship.role);
    pips($('holdHullPips'), maxHp, hp);
    setText($('holdHull'), hp + '/' + maxHp);
    const maxShield = Math.max(1, whole(p.shieldCap) || 3), shield = whole(p.shield);
    const shieldRow = $('holdShieldRow'); if (shieldRow) shieldRow.hidden = !shield && !whole(p.maxShield);
    if (maxShield) { pips($('holdShieldPips'), maxShield, shield); setText($('holdShield'), String(shield)); }
    setText($('holdCondition'), condition.toUpperCase());
    setData($('holdAirframe'), 'condition', condition);
    this.craft = { shipId, condition };

    // Intel.
    const intelEl = $('holdIntel');
    setData(intelEl, 'kind', intel.kind);
    setText($('holdIntelKicker'), intel.kicker);
    setText($('holdIntelRight'), intel.right);
    setText($('holdIntelName'), intel.name);
    setText($('holdIntelSub'), intel.sub);
    const barRow = $('holdIntelBarRow');
    if (barRow) barRow.hidden = intel.hull === null;
    if (intel.hull !== null) {
      $('holdIntelBar')?.style.setProperty('--fill', intel.hull.toFixed(3));
      setText($('holdIntelHull'), 'HULL ' + Math.round(intel.hull * 100) + '%');
    }
    setText($('holdTipHead'), intel.head);
    setText($('holdTip'), intel.tip);

    // Route.
    const pos = routePosition(game);
    $('holdTrack')?.style.setProperty('--route', pos.toFixed(4));
    const interlude = interludeProgress(game) >= 0;
    for (let k = 1; k <= 3; k++) {
      let state, label;
      if (drill) {
        state = k === drill ? (interlude ? 'cleared' : 'engaged') : 'off';
        label = k === drill ? (interlude ? 'DOWN' : 'DRILL') : '—';
      } else if (k < stage || (k === stage && interlude)) { state = 'cleared'; label = 'CLEARED'; }
      else if (k === stage) { state = game.boss ? 'engaged' : 'current'; label = game.boss ? 'ENGAGED' : 'IN SECTOR'; }
      else { state = 'ahead'; label = 'AHEAD'; }
      const li = this.root.querySelector('.hold-nodes li[data-sector="' + k + '"]');
      setData(li, 'state', state);
      setText(li?.querySelector('em'), label);
      setData(this.root.querySelector('.hold-node[data-node="' + k + '"]'), 'state', state);
    }
    setText($('holdRouteState'), drill ? 'DRILL / UNRANKED' : pad(stage, 2) + ' / 03 · ' + Math.round(pos * 100) + '%');

    // Scope.
    const hostiles = this.scope.capture(game);
    const flagship = this.scope.contacts.find(item => item.kind === 'boss');
    const bearing = flagship ? String(Math.round(flagship.bearing * 180 / Math.PI) % 360).padStart(3, '0') + '°' : '';
    setText($('holdContacts'), flagship ? 'FLAGSHIP ' + bearing : pad(hostiles, 2) + (hostiles === 1 ? ' CONTACT' : ' CONTACTS'));
    this.update(this.lastT ?? 0, game, true);
  }
  drawCraft() {
    const canvas = this.craftCanvas, info = this.craft;
    if (!canvas || !info) return;
    const css = Math.round(canvas.clientWidth || 0);
    if (css < 30) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const key = info.shipId + info.condition + css + 'x' + dpr;
    if (key === this.craftKey) return;
    this.craftKey = key;
    canvas.width = Math.round(css * dpr); canvas.height = Math.round(css * dpr);
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, css, css);
    const c = css / 2;
    g.strokeStyle = 'rgba(122,216,205,.13)'; g.lineWidth = 1;
    const step = css / 8;
    g.beginPath();
    for (let i = 1; i < 8; i++) { g.moveTo(i * step, 0); g.lineTo(i * step, css); g.moveTo(0, i * step); g.lineTo(css, i * step); }
    g.stroke();
    g.strokeStyle = 'rgba(243,187,112,.32)';
    g.beginPath(); g.arc(c, c, css * 0.44, -0.9, 0.9); g.stroke();
    g.beginPath(); g.arc(c, c, css * 0.44, Math.PI - 0.9, Math.PI + 0.9); g.stroke();
    // Draw the airframe on its own layer so damage tint only touches the aircraft.
    const art = surface(css * dpr, css * dpr), a = art.getContext('2d');
    a.setTransform(dpr, 0, 0, dpr, 0, 0);
    shipShape(a, info.shipId, c, c, (css * 0.8) / 210, 0, true);
    if (info.condition !== 'nominal') {
      a.globalCompositeOperation = 'source-atop';
      a.fillStyle = info.condition === 'critical' ? 'rgba(233,112,87,.42)' : 'rgba(243,187,112,.2)';
      a.fillRect(0, 0, css, css);
      // A few scorch marks across the hull.
      const marks = info.condition === 'critical' ? 7 : 3;
      for (let i = 0; i < marks; i++) {
        const x = c + Math.sin(i * 2.3 + 1) * css * 0.22, y = c + Math.cos(i * 1.7 + 0.4) * css * 0.18;
        const burn = a.createRadialGradient(x, y, 0, x, y, css * 0.05);
        burn.addColorStop(0, 'rgba(20,10,8,.7)'); burn.addColorStop(1, 'rgba(20,10,8,0)');
        a.fillStyle = burn; a.fillRect(x - css * 0.05, y - css * 0.05, css * 0.1, css * 0.1);
      }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(art, 0, 0);
  }
  // ~30 fps while the pause screen is visible. t is seconds.
  update(t, game, force = false) {
    if (!this.visible) return;
    this.lastT = t;
    this.root?.classList.toggle('hold-reduced', !!this.reducedEffects);
    if (this.dirty) { if (this.scope.resize()) this.dirty = false; this.drawCraft(); }
    const animate = !this.stillMotion;
    // Without motion the scope only needs one draw per layout change.
    if (!animate && !force && this.lastDraw >= 0) return;
    this.scope.draw(t, animate);
    this.lastDraw = t;
  }
  // Called when leaving the pause screen.
  close() { this.visible = false; this.lastDraw = -1; }
}
