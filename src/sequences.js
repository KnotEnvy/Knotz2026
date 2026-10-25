// In-flight cinematic sequences drawn on the game canvas above the HUD:
// sector intro cards, flagship warnings, phase slashes, sector-clear tallies,
// life-lost and extend stingers, and the end-of-run outro.
// Presentation only: never change game state from here.
import {
  FLAGSHIP_NAMES, FLAGSHIP_CLASSES, SECTOR_NAMES, SECTOR_COORDS, SECTOR_TAGLINES,
  BOSS_WARNING_LEAD, INTERLUDE_LENGTH, bossWarningProgress, interludeProgress
} from './timeline.js';
import { flightTime } from './progress.js';

const W = 540, H = 900, TAU = Math.PI * 2;
const DISPLAY = "'Arial Black', 'Arial Bold', Arial, sans-serif";
const LABEL = 'Arial, Helvetica, sans-serif';
const SERIF = "Georgia, 'Times New Roman', serif";
const C = {
  pale: '#eef8f2', muted: '#94b3b5', gold: '#ffd98b', amber: '#f3bb70',
  cyan: '#76f6eb', coral: '#ff775f', red: '#ff5443'
};
const INTRO_LENGTH = 2.6, NAMEPLATE_LENGTH = 3, DRILL_INTRO_LENGTH = 3.3;
const PHASE_LENGTH = 1.25, LIFE_LENGTH = 1.9, EXTEND_LENGTH = 2.2;
const OUTRO = { victory: 1.7, gameover: 2.1, drillVictory: 1.4, drillGameover: 1.5 };
const COMPACT_SCALE = 1.34; // phone layout: canvas text is drawn larger for legibility

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const easeOut = t => 1 - (1 - clamp(t)) ** 3;
const easeInOut = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; };
const ramp = (a, b, t) => { const x = clamp((t - a) / (b - a)); return x * x * (3 - 2 * x); };
const envelope = (t, length, fadeIn, fadeOut) => Math.min(fadeIn > 0 ? ramp(0, fadeIn, t) : 1, fadeOut > 0 ? 1 - ramp(length - fadeOut, length, t) : 1);
const two = n => String(Math.max(0, Math.floor(n))).padStart(2, '0');
const comma = n => Math.max(0, Math.round(n)).toLocaleString('en-US');
const hash = n => { const x = Math.sin(n * 91.345 + 47.853) * 43758.5453; return x - Math.floor(x); };
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

function surface(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return null;
}

const glyphs = new Map();
function setFont(ctx, size, family = LABEL, weight = 800, italic = false) {
  ctx.font = (italic ? 'italic ' : '') + weight + ' ' + size + 'px ' + family;
}
function glyph(ctx, ch) {
  const key = ctx.font + '\0' + ch;
  let w = glyphs.get(key);
  if (w === undefined) { w = ctx.measureText(ch).width; glyphs.set(key, w); }
  return w;
}
function textWidth(ctx, str, spacing = 0) {
  let w = 0, n = 0;
  for (const ch of str) { w += glyph(ctx, ch); n++; }
  return w + Math.max(0, n - 1) * spacing;
}
function write(ctx, str, x, y, spacing = 0, align = 'center', stroke = false) {
  str = String(str); ctx.textBaseline = 'middle';
  if (!spacing) { ctx.textAlign = align; stroke ? ctx.strokeText(str, x, y) : ctx.fillText(str, x, y); return; }
  const width = textWidth(ctx, str, spacing);
  let px = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  ctx.textAlign = 'left';
  for (const ch of str) { stroke ? ctx.strokeText(ch, px, y) : ctx.fillText(ch, px, y); px += glyph(ctx, ch) + spacing; }
}
function blit(ctx, s, x, y, alpha = 1, scale = 1, align = 'center') {
  if (!s || alpha <= 0) return;
  const w = s.w * scale, h = s.h * scale;
  const left = align === 'left' ? x - s.pad * scale : align === 'right' ? x - w + s.pad * scale : x - w / 2;
  ctx.globalAlpha = alpha;
  ctx.drawImage(s.canvas, left, y - h / 2, w, h);
}
// Draw only the left fraction of a sprite (type-on / wipe reveal).
function wipe(ctx, s, x, y, frac, alpha = 1, align = 'center') {
  if (!s || alpha <= 0 || frac <= 0) return;
  const f = clamp(frac), left = align === 'left' ? x - s.pad : align === 'right' ? x - s.w + s.pad : x - s.w / 2;
  ctx.globalAlpha = alpha;
  ctx.drawImage(s.canvas, 0, 0, s.w * f, s.h, left, y - s.h / 2, s.w * f, s.h);
  return left + s.w * f;
}
function line(ctx, x1, y1, x2, y2, color, width = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function brackets(ctx, x, y, w, h, size, color, width = 1.5) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
  ctx.moveTo(x, y + size); ctx.lineTo(x, y); ctx.lineTo(x + size, y);
  ctx.moveTo(x + w - size, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + size);
  ctx.moveTo(x + w, y + h - size); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - size, y + h);
  ctx.moveTo(x + size, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - size);
  ctx.stroke();
}
function notched(ctx, x, y, w, h, notch, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + notch, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - notch);
  ctx.lineTo(x + w - notch, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + notch); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}
function diamond(ctx, x, y, r, color) {
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill();
}

export class Sequences {
  constructor() {
    this.reducedEffects = false;
    this.compact = false;
    this.outroTime = 0;
    this.outroLength = 0;
    this.labels = new Map();
    this.sprites = new Map();
    this.scratch = null;
    this.reset(null);
  }

  // New sortie or drill launched (called after the game has started).
  reset(game) {
    this.outroTime = 0; this.outroLength = 0; this.outro = null;
    this.stage = game?.stage || 0;
    this.snap = game ? this.snapshot(game) : null;
    this.bossId = game?.boss?.id || 0;
    this.bossPhase = game?.boss?.phase || 0;
    this.bossName = game?.boss?.name || '';
    this.bossX = 270; this.bossY = 285;
    this.phaseFx = null; this.lifeFx = null; this.extendFx = null; this.down = null;
    this.lives = game?.player?.lives ?? 0;
    this.level = game?.player?.level ?? 1;
    this.lastBatch = null;
  }

  snapshot(game) {
    const s = game.stats || {};
    return { stage: game.stage, kills: s.kills || 0, grazes: s.grazes || 0, shotsFired: s.shotsFired || 0,
      shotsHit: s.shotsHit || 0, hitsTaken: s.hitsTaken || 0, score: game.score || 0, time: game.time || 0 };
  }

  tally(game) {
    const s = game.stats || {}, a = this.snap || this.snapshot(game);
    const fired = (s.shotsFired || 0) - a.shotsFired, hit = (s.shotsHit || 0) - a.shotsHit;
    const drill = !!game.practiceStage;
    return {
      stage: clamp(game.stage | 0, 1, 3), name: this.bossName || FLAGSHIP_NAMES[game.stage] || 'FLAGSHIP',
      drill, final: drill || game.stage >= 3, x: this.bossX, y: this.bossY,
      kills: Math.max(0, (s.kills || 0) - a.kills), grazes: Math.max(0, (s.grazes || 0) - a.grazes),
      hits: Math.max(0, (s.hitsTaken || 0) - a.hitsTaken), accuracy: fired > 0 ? clamp(hit / fired) : -1,
      time: Math.max(0, (game.time || 0) - a.time), score: Math.max(0, (game.score || 0) - a.score)
    };
  }

  // Follow game state between frames. State changes are more reliable than event
  // batches here: launch-time events are consumed before the first sequence frame.
  track(game) {
    if (game.stage !== this.stage) { this.stage = game.stage; this.snap = this.snapshot(game); this.down = null; }
    const boss = game.boss;
    if (boss && boss.id !== this.bossId) {
      this.bossId = boss.id; this.bossPhase = boss.phase || 1;
      this.bossName = boss.name || FLAGSHIP_NAMES[game.stage] || 'FLAGSHIP'; this.down = null;
    } else if (boss && (boss.phase || 1) > this.bossPhase) {
      this.bossPhase = boss.phase;
      if (game.mode === 'playing') this.phaseFx = { t: 0, phase: boss.phase, name: this.bossName };
    } else if (!boss && this.bossId) {
      if (interludeProgress(game) >= 0) this.down = this.tally(game);
      this.bossId = 0;
    }
    if (boss) { this.bossX = Number(boss.x) || 270; this.bossY = Number(boss.y) || 285; }
    const p = game.player || {};
    if (Number.isFinite(p.lives)) {
      if (game.mode === 'playing' && p.lives < this.lives) this.lifeFx = { t: 0, lives: p.lives, from: this.level, to: p.level ?? this.level, salvage: (game.pickups||[]).filter(item=>item.salvage).length };
      this.lives = p.lives;
    }
    if (Number.isFinite(p.level)) this.level = p.level;
    const batch = game.events;
    if (Array.isArray(batch) && batch !== this.lastBatch) {
      this.lastBatch = batch;
      for (let i = 0; i < batch.length; i++) {
        if (batch[i]?.type !== 'extend') continue;
        const prev = batch[i - 1];
        const reward = ['pickup','salvageRecover'].includes(prev?.type) && ['life', 'shield', 'bomb'].includes(prev.value) ? prev.value : 'score';
        this.extendFx = { t: 0, value: Number(batch[i].value) || 0, reward };
      }
    }
  }

  // Every play frame, after HUD.draw.
  draw(ctx, game, dt) {
    if (!ctx || !game) return;
    const step = clamp(Number(dt) || 0, 0, 0.1);
    if (this.outro) { this.outro.t = now() - this.outro.start; this.outroTime = this.outro.t; }
    this.track(game);
    for (const key of ['phaseFx', 'lifeFx', 'extendFx']) if (this[key]) this[key].t += step;
    if (this.phaseFx && this.phaseFx.t > PHASE_LENGTH) this.phaseFx = null;
    if (this.lifeFx && this.lifeFx.t > LIFE_LENGTH) this.lifeFx = null;
    if (this.extendFx && this.extendFx.t > EXTEND_LENGTH) this.extendFx = null;

    const warn = game.mode === 'playing' ? bossWarningProgress(game) : -1;
    const inter = game.mode === 'playing' ? interludeProgress(game) : -1;
    const stageTime = Number(game.stageTime) || 0;
    const age = Number(game.boss?.age) || 0;
    const intro = game.mode === 'playing' && !game.practiceStage && !game.boss && inter < 0 && stageTime < INTRO_LENGTH;
    const plate = game.mode === 'playing' && game.boss && age < (game.practiceStage ? DRILL_INTRO_LENGTH : NAMEPLATE_LENGTH);
    if (!this.outro && warn < 0 && !intro && !plate && !(inter >= 0 && this.down) && !this.phaseFx && !this.lifeFx && !this.extendFx) return;

    ctx.save();
    ctx.setTransform((ctx.canvas?.width || W) / W, 0, 0, (ctx.canvas?.height || H) / H, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (this.outro) this.drawOutro(ctx, game);
    else if (game.mode === 'playing') {
      if (warn >= 0) this.drawWarning(ctx, game, warn * BOSS_WARNING_LEAD);
      if (intro) this.drawIntro(ctx, game, stageTime);
      if (plate) this.drawNameplate(ctx, game, age);
      if (this.phaseFx) this.drawPhase(ctx, this.phaseFx);
      if (inter >= 0 && this.down) this.drawInterlude(ctx, this.down, inter * INTERLUDE_LENGTH, 1);
      // Stingers step below the warning bands when a flagship warning is up.
      const lower = warn >= 0 || intro;
      if (this.lifeFx) this.drawLifeLost(ctx, game, this.lifeFx, lower);
      if (this.extendFx) this.drawExtend(ctx, this.extendFx, lower);
    }
    ctx.restore();
  }

  // The run just ended. Return how long the playfield should keep animating.
  beginOutro(game) {
    const won = game?.mode === 'victory', drill = !!game?.practiceStage;
    const length = drill ? (won ? OUTRO.drillVictory : OUTRO.drillGameover) : (won ? OUTRO.victory : OUTRO.gameover);
    const stage = clamp((game?.stage | 0) || 1, 1, 3);
    this.outro = { start: now(), t: 0, length, won, drill, stage,
      name: this.bossName || FLAGSHIP_NAMES[stage], score: Number(game?.summary?.score ?? game?.score) || 0 };
    this.outroTime = 0; this.outroLength = length;
    this.phaseFx = this.lifeFx = this.extendFx = null;
    return length;
  }

  skipOutro() {
    this.outroLength = Math.min(this.outroLength, this.outroTime);
    if (this.outro) this.outro.length = Math.min(this.outro.length, this.outro.t);
  }

  // ---------- shared drawing ----------

  // Cached text sprite. s.pad is the horizontal padding, so left/right anchors land on the glyphs.
  label(str, size, color, { family = LABEL, weight = 800, italic = false, spacing = 0, stroke = false, glow = null } = {}) {
    str = String(str);
    const key = [str, size, color, family, weight, italic, spacing, stroke, glow].join('|');
    if (this.labels.has(key)) return this.labels.get(key);
    const probe = (this.probe ||= surface(8, 8)?.getContext('2d'));
    if (!probe) { this.labels.set(key, null); return null; }
    setFont(probe, size, family, weight, italic);
    const pad = Math.ceil(size * (italic ? .45 : .3)) + (glow ? 14 : 2);
    const w = Math.ceil(textWidth(probe, str, spacing)) + pad * 2;
    const h = Math.ceil(size * 1.45) + (glow ? 28 : 4);
    const canvas = surface(w, h), g = canvas.getContext('2d');
    setFont(g, size, family, weight, italic);
    if (glow) { g.shadowColor = glow; g.shadowBlur = 14; }
    if (stroke) { g.strokeStyle = color; g.lineWidth = Math.max(1, size / 40); g.lineJoin = 'round'; write(g, str, w / 2, h / 2, spacing, 'center', true); }
    else { g.fillStyle = color; write(g, str, w / 2, h / 2, spacing, 'center'); }
    const s = { canvas, w, h, pad };
    if (this.labels.size > 400) this.labels.clear();
    this.labels.set(key, s);
    return s;
  }

  sprite(key, w, h, paint) {
    if (this.sprites.has(key)) return this.sprites.get(key);
    const canvas = surface(w, h);
    if (canvas) paint(canvas.getContext('2d'), w, h);
    this.sprites.set(key, canvas);
    return canvas;
  }

  // Soft dark band, transparent at both ends and edges.
  band(ctx, cy, height, alpha, tint = '5,17,27') {
    if (alpha <= 0) return;
    const s = this.sprite('band:' + tint, 540, 96, (g, w, h) => {
      const x = g.createLinearGradient(0, 0, w, 0);
      x.addColorStop(0, `rgba(${tint},0)`); x.addColorStop(.16, `rgba(${tint},1)`);
      x.addColorStop(.84, `rgba(${tint},1)`); x.addColorStop(1, `rgba(${tint},0)`);
      g.fillStyle = x; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'destination-in';
      const y = g.createLinearGradient(0, 0, 0, h);
      y.addColorStop(0, 'rgba(0,0,0,0)'); y.addColorStop(.22, 'rgba(0,0,0,1)');
      y.addColorStop(.78, 'rgba(0,0,0,1)'); y.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = y; g.fillRect(0, 0, w, h);
    });
    if (!s) return;
    ctx.globalAlpha = clamp(alpha);
    ctx.drawImage(s, 0, cy - height / 2, W, height);
  }

  vignette(ctx, kind, alpha) {
    if (alpha <= 0) return;
    const rgb = kind === 'red' ? '255,52,38' : '0,3,6';
    const s = this.sprite('vignette:' + kind, 270, 450, (g, w, h) => {
      const r = g.createRadialGradient(w / 2, h * .5, h * .2, w / 2, h * .5, h * .72);
      r.addColorStop(0, `rgba(${rgb},0)`); r.addColorStop(.6, `rgba(${rgb},.28)`); r.addColorStop(1, `rgba(${rgb},1)`);
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    });
    if (!s) return;
    ctx.globalAlpha = clamp(alpha);
    ctx.drawImage(s, 0, 0, W, H);
  }

  // Thin horizontal light flare, white-hot in the middle.
  flare(ctx, cy, width, alpha, rgb = '255,217,139') {
    if (alpha <= 0 || width <= 0) return;
    const s = this.sprite('flare:' + rgb, 540, 9, (g, w, h) => {
      const x = g.createLinearGradient(0, 0, w, 0);
      x.addColorStop(0, `rgba(${rgb},0)`); x.addColorStop(.35, `rgba(${rgb},.75)`);
      x.addColorStop(.5, 'rgba(255,252,240,1)'); x.addColorStop(.65, `rgba(${rgb},.75)`); x.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = x; g.fillRect(0, 3, w, 3);
      g.globalAlpha = .35; g.fillRect(0, 0, w, h);
    });
    if (!s) return;
    ctx.globalAlpha = clamp(alpha);
    ctx.drawImage(s, 270 - width / 2, cy - 4.5, width, 9);
  }

  // Scrolling hazard chevron strip across the full width.
  hazard(ctx, cy, open, offset, alpha) {
    if (alpha <= 0 || open <= 0) return;
    const s = this.sprite('hazard', 600, 20, (g, w, h) => {
      g.fillStyle = 'rgba(52,7,9,.86)'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,84,67,.82)';
      for (let x = -28; x < w + 28; x += 28) {
        g.beginPath(); g.moveTo(x, h); g.lineTo(x + 12, h); g.lineTo(x + 26, 0); g.lineTo(x + 14, 0); g.closePath(); g.fill();
      }
      g.fillStyle = 'rgba(255,190,170,.9)'; g.fillRect(0, 0, w, 1); g.fillRect(0, h - 1, w, 1);
    });
    if (!s) return;
    const half = 270 * clamp(open), sx = ((offset % 28) + 28) % 28;
    ctx.globalAlpha = clamp(alpha);
    ctx.drawImage(s, sx + (270 - half), 0, half * 2, 20, 270 - half, cy - 10, half * 2, 20);
  }

  // Phone layout: scale typography about an anchor.
  scaleGroup(ctx, cx, cy) {
    if (!this.compact) return;
    ctx.translate(cx, cy); ctx.scale(COMPACT_SCALE, COMPACT_SCALE); ctx.translate(-cx, -cy);
  }

  // Draw a sprite with a gold highlight passing across its glyphs.
  shimmer(ctx, s, x, y, phase, alpha) {
    if (!s || alpha <= 0 || phase <= 0 || phase >= 1 || this.reducedEffects) return;
    let scratch = this.scratch;
    if (!scratch || scratch.width < s.w || scratch.height < s.h) scratch = this.scratch = surface(Math.max(s.w, 480), Math.max(s.h, 96));
    if (!scratch) return;
    const g = scratch.getContext('2d');
    g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, scratch.width, scratch.height);
    g.drawImage(s.canvas, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    const cx = -60 + (s.w + 120) * phase;
    const grad = g.createLinearGradient(cx - 46, 0, cx + 46, 0);
    grad.addColorStop(0, 'rgba(255,240,205,0)'); grad.addColorStop(.5, 'rgba(255,240,205,.95)'); grad.addColorStop(1, 'rgba(255,240,205,0)');
    g.fillStyle = grad; g.fillRect(0, 0, s.w, s.h);
    ctx.globalAlpha = clamp(alpha);
    ctx.drawImage(scratch, 0, 0, s.w, s.h, x - s.w / 2, y - s.h / 2, s.w, s.h);
  }

  // ---------- sector intro ----------

  drawIntro(ctx, game, t) {
    const stage = clamp(game.stage | 0, 1, 3);
    const a = envelope(t, INTRO_LENGTH, .22, .62);
    if (a <= 0) return;
    const cy = this.compact ? 300 : 272;
    const rise = 6 * (1 - easeOut(t / .55)) - 12 * ramp(INTRO_LENGTH - .62, INTRO_LENGTH, t);
    const open = this.reducedEffects ? 1 : easeOut(t / .42);
    ctx.save();
    this.scaleGroup(ctx, 270, cy);
    this.band(ctx, cy, 168, .64 * a);
    const y = cy + rise;
    blit(ctx, this.label(two(stage), 176, 'rgba(118,246,235,.16)', { family: DISPLAY, weight: 900, stroke: true }),
      270 + 10 * (1 - easeOut(t / 1.4)), y + 2, a);
    const half = 184 * open;
    ctx.globalAlpha = a;
    line(ctx, 270 - half, y - 44, 270 + half, y - 44, 'rgba(243,187,112,.7)');
    line(ctx, 270 - half, y + 44, 270 + half, y + 44, 'rgba(118,246,235,.42)');
    diamond(ctx, 270, y - 44, 3.5, C.amber);
    const bx = 108 * open + 82;
    brackets(ctx, 270 - bx, y - 72, bx * 2, 146, 12, `rgba(118,246,235,${.55 * a})`);
    ctx.globalAlpha = a;
    wipe(ctx, this.label('OPERATION LONG MERIDIAN  ·  SECTOR ' + two(stage) + ' / 03', 10, C.gold, { spacing: 2.4 }), 270, y - 59, ramp(.12, .62, t) * 1.02, a);
    const title = this.label(SECTOR_NAMES[stage] || 'SECTOR ' + two(stage), this.compact ? 34 : 40, C.pale, { family: DISPLAY, weight: 900, spacing: 3 });
    const reveal = this.reducedEffects ? ramp(0, .3, t) : easeOut((t - .06) / .5);
    const edge = this.reducedEffects ? blit(ctx, title, 270, y - 8, a * reveal) : wipe(ctx, title, 270, y - 8, reveal, a);
    if (!this.reducedEffects && reveal > 0 && reveal < 1 && edge) line(ctx, edge, y - 30, edge, y + 14, `rgba(118,246,235,${.9 * (1 - reveal)})`, 2);
    if (title) this.shimmer(ctx, title, 270, y - 8, (t - 1) / .65, a);
    const tagA = a * ramp(.32, .72, t);
    blit(ctx, this.label(SECTOR_TAGLINES[stage] || '', 16, C.amber, { family: SERIF, weight: 400, italic: true }), 270, y + 25 + 5 * (1 - tagA), tagA);
    const footA = a * ramp(.5, .9, t);
    blit(ctx, this.label(SECTOR_COORDS[stage] || '', 9, C.muted, { spacing: 1.6 }), 270 - 184, y + 59, footA, 1, 'left');
    blit(ctx, this.label('OBJECTIVE / ' + (FLAGSHIP_NAMES[stage] || 'FLAGSHIP'), 9, C.cyan, { spacing: 1.6 }), 270 + 184, y + 59, footA, 1, 'right');
    ctx.restore();
  }

  // ---------- flagship warning ----------

  drawWarning(ctx, game, t) {
    const L = BOSS_WARNING_LEAD, stage = clamp(game.stage | 0, 1, 3);
    const a = envelope(t, L, .2, .35);
    if (a <= 0) return;
    const reduced = this.reducedEffects;
    const pulse = reduced ? .4 : .5 + .5 * Math.sin(t * TAU * 1.55 - Math.PI / 2);
    this.vignette(ctx, 'red', a * (reduced ? .3 : .2 + .45 * pulse));
    ctx.globalAlpha = 1;
    ctx.strokeStyle = `rgba(255,84,67,${a * (reduced ? .4 : .22 + .55 * pulse)})`; ctx.lineWidth = 3;
    ctx.strokeRect(4.5, 4.5, W - 9, H - 9);
    const cy = this.compact ? 304 : 280;
    const open = reduced ? 1 : easeOut(t / .32);
    const scroll = reduced ? 0 : t * 74;
    this.band(ctx, cy, 112, .58 * a, '22,5,8');
    this.hazard(ctx, cy - 60, open, scroll, .62 * a);
    this.hazard(ctx, cy + 60, open, -scroll, .62 * a);
    ctx.save();
    this.scaleGroup(ctx, 270, cy);
    const blink = reduced ? 1 : .34 + .66 * ramp(-.2, .2, Math.sin(t * TAU * 2.2 + 1.2));
    const word = this.label('WARNING', 54, C.red, { family: DISPLAY, weight: 900, spacing: 9 });
    if (!reduced) blit(ctx, this.label('WARNING', 54, 'rgba(118,246,235,.5)', { family: DISPLAY, weight: 900, spacing: 9 }), 268 - 3 * pulse, cy - 6, a * blink * .35);
    blit(ctx, word, 270, cy - 6, a * blink);
    blit(ctx, this.label('HOSTILE FLAGSHIP APPROACHING', 11, C.pale, { spacing: 2.6 }), 270, cy + 32, a * ramp(.18, .5, t));
    ctx.restore();

    const pa = envelope(t - .85, L - .85, .3, .35) * a;
    if (pa <= 0) return;
    const py = cy + (this.compact ? 136 : 112);
    ctx.save();
    this.scaleGroup(ctx, 270, py);
    notched(ctx, 120, py - 26, 300, 54, 8, `rgba(24,6,9,${.8 * pa})`, `rgba(255,119,95,${.5 * pa})`);
    ctx.globalAlpha = pa;
    line(ctx, 128, py - 26, 170, py - 26, C.coral, 2);
    const name = FLAGSHIP_NAMES[stage] || 'FLAGSHIP';
    wipe(ctx, this.label(name, 20, C.pale, { family: DISPLAY, weight: 900, spacing: 3 }), 136, py - 8, easeOut((t - .85) / .4), pa, 'left');
    blit(ctx, this.label('FLAGSHIP ' + two(stage) + ' / 03', 9, C.muted, { spacing: 1.6 }), 404, py - 8, pa, 1, 'right');
    blit(ctx, this.label(FLAGSHIP_CLASSES[stage] || 'FLAGSHIP', 9, C.gold, { spacing: 1.8 }), 136, py + 13, pa * ramp(1.1, 1.5, t), 1, 'left');
    ctx.globalAlpha = pa; ctx.fillStyle = C.cyan; setFont(ctx, 11, LABEL, 800);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    ctx.fillText('RANGE ' + Math.max(0, (L - t) * 1.32).toFixed(1) + ' KM', 404, py + 13);
    ctx.restore();
  }

  // ---------- flagship nameplate / drill intro ----------

  drawNameplate(ctx, game, age) {
    const stage = clamp(game.stage | 0, 1, 3), drill = !!game.practiceStage;
    const L = drill ? DRILL_INTRO_LENGTH : NAMEPLATE_LENGTH;
    const a = envelope(age, L, .3, .6);
    if (a <= 0) return;
    const cy = this.compact ? 566 : 552;
    const name = game.boss?.name || FLAGSHIP_NAMES[stage] || 'FLAGSHIP';
    ctx.save();
    this.scaleGroup(ctx, 270, cy);
    this.band(ctx, cy, drill ? 150 : 128, .6 * a);
    const nameSprite = this.label(name, 34, C.pale, { family: DISPLAY, weight: 900, spacing: 5 });
    const reveal = this.reducedEffects ? 1 : easeOut(age / .5);
    const nameA = this.reducedEffects ? a * ramp(0, .35, age) : a;
    wipe(ctx, nameSprite, 270, cy, reveal, nameA);
    const nw = (nameSprite?.w || 200) / 2 + 10;
    const span = 196 * (this.reducedEffects ? 1 : easeOut((age - .1) / .5));
    ctx.globalAlpha = a;
    if (span > nw) {
      line(ctx, 270 - span, cy, 270 - nw, cy, 'rgba(255,119,95,.55)');
      line(ctx, 270 + nw, cy, 270 + span, cy, 'rgba(255,119,95,.55)');
      diamond(ctx, 270 - span, cy, 3, C.coral); diamond(ctx, 270 + span, cy, 3, C.coral);
    }
    const kicker = drill ? 'FLAGSHIP DRILL  ·  UNRANKED' : 'FLAGSHIP ' + two(stage) + ' / 03  ·  ENGAGE';
    wipe(ctx, this.label(kicker, 10, drill ? C.cyan : C.coral, { spacing: 2.6 }), 270, cy - 34, ramp(.1, .55, age) * 1.02, a);
    blit(ctx, this.label(FLAGSHIP_CLASSES[stage] || 'FLAGSHIP', 10, C.gold, { spacing: 3.2 }), 270, cy + 30, a * ramp(.3, .7, age));
    if (drill) {
      blit(ctx, this.label('FULL WEAPONS  ·  CAMPAIGN RECORDS PRESERVED', 9, C.muted, { spacing: 1.6 }), 270, cy + 54, a * ramp(.5, .9, age));
    } else {
      // Cosmetic hull scan that echoes the HUD flagship meter filling in.
      const fill = this.reducedEffects ? 1 : easeOut((age - .25) / .9);
      ctx.globalAlpha = a * .9;
      ctx.fillStyle = 'rgba(255,119,95,.16)'; ctx.fillRect(196, cy + 50, 148, 3);
      ctx.fillStyle = C.coral; ctx.fillRect(196, cy + 50, 148 * fill, 3);
      blit(ctx, this.label('HULL', 8, C.muted, { spacing: 1.6 }), 188, cy + 51, a * .9, 1, 'right');
      ctx.globalAlpha = a * .9; ctx.fillStyle = C.coral; setFont(ctx, 9, LABEL, 800);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(Math.round(fill * 100) + '%', 352, cy + 51);
    }
    ctx.restore();
  }

  // ---------- boss phase slash ----------

  drawPhase(ctx, fx) {
    const t = fx.t, L = PHASE_LENGTH, reduced = this.reducedEffects;
    const a = reduced ? envelope(t, L, .15, .3) : 1 - ramp(L - .12, L, t);
    if (a <= 0) return;
    const cy = this.compact ? 492 : 478;
    const enter = reduced ? 1 : easeOut(t / .2), exit = reduced ? 0 : easeInOut((t - (L - .32)) / .32);
    const off = (1 - enter) * -640 + exit * 640;
    if (!reduced && t < .16) {
      ctx.globalAlpha = (1 - t / .16) * .85;
      line(ctx, -20, cy + 150, W + 20, cy - 150, 'rgba(255,245,230,1)', 2);
    }
    ctx.save();
    this.scaleGroup(ctx, 270, cy);
    ctx.translate(270 + off, cy);
    ctx.transform(1, 0, -.3, 1, 0, 0);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(27,7,22,.8)'; ctx.fillRect(-300, -38, 600, 76);
    ctx.fillStyle = C.coral; ctx.fillRect(-300, -38, 600, 2);
    ctx.fillStyle = 'rgba(255,217,139,.8)'; ctx.fillRect(-300, 36, 600, 1);
    ctx.fillStyle = 'rgba(255,95,168,.55)'; ctx.fillRect(-300, -34, 7, 68); ctx.fillRect(293, -34, 7, 68);
    const final = fx.phase >= 3;
    blit(ctx, this.label('PHASE ' + fx.phase, 42, final ? C.gold : C.pale, { family: DISPLAY, weight: 900, spacing: 6 }), 0, -7, a);
    blit(ctx, this.label((final ? 'FINAL PATTERN' : 'PATTERN SHIFT') + '  ·  ' + fx.name, 10, C.coral, { spacing: 3 }), 0, 24, a);
    ctx.restore();
  }

  // ---------- flagship down + sector clear ----------

  drawInterlude(ctx, d, te, fade) {
    const reduced = this.reducedEffects;
    const cy = 318;
    // Beat 1: FLAGSHIP DOWN impact.
    const ia = envelope(te, 1.32, .1, .32) * fade;
    if (ia > 0) {
      if (!reduced && te < .95) {
        ctx.globalAlpha = (1 - te / .95) * .65 * fade;
        ctx.strokeStyle = C.gold; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(d.x, d.y, 30 + 330 * easeOut(te / .95), 0, TAU); ctx.stroke();
      }
      this.flare(ctx, cy + 26, W * (reduced ? 1 : easeOut(te / .35)), ia * (reduced ? .45 : 1 - ramp(.35, 1.2, te)));
      ctx.save();
      this.scaleGroup(ctx, 270, cy);
      this.band(ctx, cy, 110, .55 * ia);
      const punch = reduced ? 1 : 1 + .32 * (1 - easeOut(te / .26));
      blit(ctx, this.label('FLAGSHIP DOWN', 40, C.gold, { family: DISPLAY, weight: 900, spacing: 4 }), 270, cy - 2, ia, punch);
      if (!reduced && te < .3) blit(ctx, this.label('FLAGSHIP DOWN', 40, '#fffaf0', { family: DISPLAY, weight: 900, spacing: 4 }), 270, cy - 2, ia * (1 - te / .3), punch);
      blit(ctx, this.label(d.name + '  ·  ' + (FLAGSHIP_CLASSES[d.stage] || 'FLAGSHIP') + ' DESTROYED', 10, C.coral, { spacing: 2.6 }), 270, cy - 38, ia * ramp(.08, .3, te));
      ctx.restore();
    }
    // Beat 2: tally card.
    const tt = te - 1.05;
    const ta = envelope(tt, INTERLUDE_LENGTH - 1.05, .32, d.final ? 0 : .34) * fade;
    if (ta <= 0) return;
    const rows = d.drill
      ? [['ACCURACY', d.accuracy, 'pct'], ['GRAZES', d.grazes, 'int'], ['HITS TAKEN', d.hits, 'hits']]
      : [['KILLS', d.kills, 'int'], ['ACCURACY', d.accuracy, 'pct'], ['GRAZES', d.grazes, 'int'], ['HITS TAKEN', d.hits, 'hits'], ['SECTOR TIME', d.time, 'time']];
    const x0 = 95, x1 = 445, top = 296, rowsTop = top + 94, step = 29;
    const bottom = rowsTop + rows.length * step + 54;
    const mid = (top + bottom) / 2;
    const rise = reduced ? 0 : 14 * (1 - easeOut(tt / .42));
    ctx.save();
    if (this.compact) ctx.translate(0, -46); // keep the scaled card and footer clear of the aircraft
    this.scaleGroup(ctx, 270, mid);
    ctx.translate(0, rise);
    notched(ctx, x0, top, x1 - x0, bottom - top, 11, `rgba(5,19,30,${.86 * ta})`, `rgba(135,244,231,${.3 * ta})`);
    ctx.globalAlpha = ta;
    line(ctx, x0 + 12, top + 1, x0 + 72, top + 1, C.gold, 2);
    brackets(ctx, x0 - 7, top - 7, x1 - x0 + 14, bottom - top + 14, 12, `rgba(255,217,139,${.55 * ta})`);
    const header = d.drill ? 'DRILL CLEAR' : 'SECTOR ' + two(d.stage) + ' CLEAR';
    wipe(ctx, this.label(header, 22, C.gold, { family: DISPLAY, weight: 900, spacing: 3 }), 270, top + 31, reduced ? 1 : easeOut(tt / .45), ta);
    const sector = SECTOR_NAMES[d.stage] || '';
    const sub = d.drill ? d.name + '  ·  UNRANKED' : sector + '  ·  ' + (d.name === sector ? 'FLAGSHIP' : d.name) + ' DOWN';
    blit(ctx, this.label(sub, 9.5, C.muted, { spacing: 2 }), 270, top + 56, ta * ramp(.12, .4, tt));
    ctx.globalAlpha = ta;
    line(ctx, x0 + 20, top + 72, x1 - 20, top + 72, 'rgba(135,244,231,.22)');
    setFont(ctx, 16, LABEL, 800);
    ctx.textBaseline = 'middle';
    for (let i = 0; i < rows.length; i++) {
      const [name, value, kind] = rows[i];
      const rt = tt - (.24 + i * .13), ra = ta * ramp(0, .2, rt);
      if (ra <= 0) continue;
      const y = rowsTop + i * step;
      const count = reduced ? 1 : easeOut(rt / .55);
      blit(ctx, this.label(name, 10, C.muted, { spacing: 1.8 }), x0 + 22, y, ra, 1, 'left');
      ctx.globalAlpha = ra * .7; ctx.setLineDash([1, 4]);
      line(ctx, x0 + 150, y + 4, x1 - 92, y + 4, 'rgba(135,244,231,.4)');
      ctx.setLineDash([]);
      let text, color = C.pale;
      if (kind === 'pct') text = value < 0 ? '—' : Math.round(value * 100 * count) + '%';
      else if (kind === 'time') text = flightTime(value * count);
      else if (kind === 'hits') { text = String(Math.round(value * count)); color = value > 0 ? C.coral : C.cyan; if (value === 0) text = 'CLEAN'; }
      else text = String(Math.round(value * count));
      ctx.globalAlpha = ra; ctx.fillStyle = color; setFont(ctx, 16, LABEL, 800); ctx.textAlign = 'right';
      ctx.fillText(text, x1 - 22, y);
    }
    const sy = bottom - 34, st = tt - (.3 + rows.length * .13), sa = ta * ramp(0, .25, st);
    ctx.globalAlpha = ta;
    line(ctx, x0 + 20, sy - 20, x1 - 20, sy - 20, 'rgba(255,217,139,.3)');
    if (sa > 0) {
      const count = reduced ? 1 : easeOut(st / .6);
      blit(ctx, this.label(d.drill ? 'FLIGHT TIME' : 'SECTOR SCORE', 10, C.gold, { spacing: 2 }), x0 + 22, sy, sa, 1, 'left');
      ctx.globalAlpha = sa; ctx.fillStyle = C.gold; setFont(ctx, 20, DISPLAY, 900); ctx.textAlign = 'right';
      ctx.fillText(d.drill ? flightTime(d.time * count) : '+' + comma(d.score * count), x1 - 22, sy);
    }
    const fa = ta * ramp(1.35, 1.75, tt);
    if (fa > 0) {
      const lines = d.drill ? [['UNRANKED  ·  CAMPAIGN RECORDS PRESERVED', C.muted]]
        : d.stage >= 3 ? [['FLEET BROKEN  ·  LONG MERIDIAN SECURED', C.gold]]
        : [['RESUPPLY  ·  HULL +1  ·  SPECIAL +1', C.cyan], ['NEXT  ·  SECTOR ' + two(d.stage + 1) + ' — ' + (SECTOR_NAMES[d.stage + 1] || ''), C.muted]];
      this.band(ctx, bottom + 24 + (lines.length - 1) * 9.5, 30 + lines.length * 19, .5 * fa);
      lines.forEach(([str, color], i) => blit(ctx, this.label(str, 10, color, { spacing: 2 }), 270, bottom + 24 + i * 19, fa));
    }
    ctx.restore();
  }

  // ---------- life lost ----------

  drawLifeLost(ctx, game, fx, lower = false) {
    const t = fx.t, L = LIFE_LENGTH, reduced = this.reducedEffects;
    const a = envelope(t, L, .12, .45);
    if (a <= 0) return;
    const p = game.player || {};
    const px = Number(p.x) || 270, py = Number(p.y) || 750;
    // Re-entry lock on the new airframe.
    for (const delay of reduced ? [0] : [0, .42]) {
      const rt = (t - delay) / .75;
      if (rt < 0 || rt > 1) continue;
      ctx.globalAlpha = (1 - rt) * .75;
      ctx.strokeStyle = C.cyan; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 78 - 50 * easeOut(rt), 0, TAU); ctx.stroke();
    }
    const lock = a * (1 - ramp(1.2, 1.6, t));
    if (lock > 0) { ctx.globalAlpha = 1; brackets(ctx, px - 34, py - 38, 68, 76, 9, `rgba(118,246,235,${.7 * lock})`); }
    const cy = lower ? 470 : this.compact ? 236 : 222;
    if (!reduced && t < .28) { ctx.globalAlpha = (1 - t / .28) * .8; line(ctx, 0, cy, W, cy, C.coral, 2); }
    ctx.save();
    this.scaleGroup(ctx, 270, cy);
    this.band(ctx, cy, 84, .62 * a, '24,6,9');
    const jitter = reduced || t > .3 ? 0 : (hash(Math.floor(t * 40)) - .5) * 10 * (1 - t / .3);
    blit(ctx, this.label('AIRFRAME LOST', 26, C.coral, { family: DISPLAY, weight: 900, spacing: 4 }), 270 + jitter, cy - 9, a);
    const lives = fx.lives;
    let sub = lives <= 1 ? 'FINAL AIRFRAME  ·  RE-ENTRY' : 'RE-ENTRY  ·  ' + lives + ' LIVES REMAIN';
    if(fx.salvage)sub+='  ·  RECOVER '+fx.salvage+' SALVAGE';
    else if (fx.from > fx.to) sub += '  ·  POWER ' + fx.from + ' → ' + fx.to;
    blit(ctx, this.label(sub, 10, lives <= 1 ? C.gold : C.pale, { spacing: 1.6 }), 270, cy + 19, a * ramp(.1, .35, t));
    ctx.restore();
  }

  // ---------- score extend ----------

  drawExtend(ctx, fx, lower = false) {
    const t = fx.t, L = EXTEND_LENGTH, reduced = this.reducedEffects;
    const slide = reduced ? 0 : (1 - easeOut(t / .32)) + easeInOut((t - (L - .35)) / .35);
    const a = reduced ? envelope(t, L, .2, .35) : 1 - ramp(L - .1, L, t);
    if (a <= 0) return;
    const w = 214, h = 48, right = 529, y = lower ? 420 : 186;
    ctx.save();
    this.scaleGroup(ctx, right, y + h / 2);
    ctx.translate(slide * 250, 0);
    const x = right - w;
    notched(ctx, x, y, w, h, 9, `rgba(30,22,6,${.84 * a})`, `rgba(255,217,139,${.55 * a})`);
    ctx.globalAlpha = a; ctx.fillStyle = C.gold; ctx.fillRect(x, y + 9, 3, h - 9);
    blit(ctx, this.label('EXTEND', 20, C.gold, { family: DISPLAY, weight: 900, spacing: 5 }), x + 17, y + 17, a, 1, 'left');
    const reward = fx.reward === 'life' ? '+1 LIFE' : fx.reward === 'shield' ? 'HULL RESTORED' : fx.reward === 'bomb' ? '+1 SPECIAL' : '+2,500 BONUS';
    blit(ctx, this.label(comma(fx.value) + ' PTS  ·  ' + reward, 9, C.pale, { spacing: 1.5 }), x + 17, y + 36, a * ramp(.15, .4, t), 1, 'left');
    ctx.globalAlpha = a;
    line(ctx, x + 17, y + 27, x + 17 + (w - 60) * (reduced ? 1 : easeOut((t - .12) / .5)), y + 27, 'rgba(255,217,139,.7)');
    const spin = reduced ? 0 : t * 2.4, glow = reduced ? 1 : .7 + .3 * Math.sin(t * 9);
    ctx.save(); ctx.translate(right - 24, y + 22); ctx.rotate(spin); ctx.globalAlpha = a * glow;
    diamond(ctx, 0, 0, 8, C.gold); ctx.globalAlpha = a; diamond(ctx, 0, 0, 3.5, '#fffaf0');
    ctx.restore();
    ctx.restore();
  }

  // ---------- end-of-run outro ----------

  drawOutro(ctx, game) {
    const o = this.outro, t = o.t, L = Math.max(.01, o.length), reduced = this.reducedEffects;
    if (o.won) {
      if (this.down?.final) this.drawInterlude(ctx, this.down, INTERLUDE_LENGTH, 1 - ramp(0, .35, t));
      const bar = 96 * (reduced ? ramp(0, .5, t) : easeInOut(t / .7));
      ctx.globalAlpha = 1; ctx.fillStyle = '#03080c';
      ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
      ctx.globalAlpha = .5 * ramp(0, .4, t);
      line(ctx, 0, bar, W, bar, C.amber); line(ctx, 0, H - bar, W, H - bar, C.amber);
      const cy = 436;
      ctx.save();
      this.scaleGroup(ctx, 270, cy);
      this.band(ctx, cy, 200, .55 * ramp(.05, .5, t));
      const kicker = o.drill ? o.name + '  ·  UNRANKED' : 'LONG MERIDIAN  ·  FLEET BROKEN';
      wipe(ctx, this.label(kicker, 11, C.gold, { spacing: 3.2 }), 270, cy - 64, ramp(.15, .55, t) * 1.02, 1);
      const word = this.label(o.drill ? 'DRILL' : 'OPERATION', 46, C.pale, { family: DISPLAY, weight: 900, spacing: 6 });
      reduced ? blit(ctx, word, 270, cy - 20, ramp(.05, .4, t)) : wipe(ctx, word, 270, cy - 20, easeOut((t - .08) / .5), 1);
      const ea = ramp(.3, .7, t);
      blit(ctx, this.label('complete.', 54, C.gold, { family: SERIF, weight: 400, italic: true }), 270, cy + 36 + (reduced ? 0 : 8 * (1 - ea)), ea);
      this.flare(ctx, cy + 78, W * (reduced ? 1 : easeOut((t - .4) / .5)), .8 * ramp(.4, .6, t) * (1 - ramp(1.1, 1.5, t)));
      if (!o.drill) blit(ctx, this.label('FINAL SCORE  ·  ' + String(Math.floor(o.score)).padStart(8, '0'), 10, C.muted, { spacing: 2.4 }), 270, cy + 98, ramp(.6, .9, t));
      ctx.restore();
    } else {
      // Signal lost: drain colour, close in the dark, break the feed.
      const drain = ramp(0, .9, t);
      ctx.globalCompositeOperation = 'saturation';
      ctx.globalAlpha = .92 * drain; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = .38 * ramp(0, 1.2, t); ctx.fillStyle = '#04080c'; ctx.fillRect(0, 0, W, H);
      this.vignette(ctx, 'dark', .9 * ramp(0, .8, t));
      if (!reduced) {
        const slot = Math.floor(t * 14);
        ctx.fillStyle = '#e6f0ea';
        for (let i = 0; i < 6; i++) {
          ctx.globalAlpha = .05 + .12 * hash(slot * 7 + i);
          ctx.fillRect(0, hash(slot * 13 + i * 3) * H, W, 1 + Math.floor(hash(slot + i * 5) * 3));
        }
        this.band(ctx, (t * 420) % (H + 120) - 60, 80, .1, '200,220,215');
      }
      const cy = 430;
      ctx.save();
      this.scaleGroup(ctx, 270, cy);
      const kicker = o.drill ? o.name + '  ·  DRILL ENDED' : 'MAYDAY  ·  SECTOR ' + two(o.stage) + '  ·  ' + (SECTOR_NAMES[o.stage] || '');
      wipe(ctx, this.label(kicker, 11, C.coral, { spacing: 3 }), 270, cy - 66, ramp(.2, .6, t) * 1.02, 1);
      const word = this.label(o.drill ? 'DRILL' : 'SIGNAL', 50, C.pale, { family: DISPLAY, weight: 900, spacing: 8 });
      const wa = ramp(.1, .45, t);
      const glitch = !reduced && word && (t * 7) % 1 < .22 && t < L - .5;
      if (glitch) {
        const slices = 3, sh = word.h / slices, left = 270 - word.w / 2, top = cy - 18 - word.h / 2;
        ctx.globalAlpha = wa;
        for (let i = 0; i < slices; i++) {
          const dx = (hash(Math.floor(t * 30) + i * 11) - .5) * 12;
          ctx.drawImage(word.canvas, 0, i * sh, word.w, sh, left + dx, top + i * sh, word.w, sh);
        }
      } else blit(ctx, word, 270, cy - 18, wa);
      const la = ramp(.35, .75, t);
      blit(ctx, this.label(o.drill ? 'ended.' : 'lost.', 58, C.coral, { family: SERIF, weight: 400, italic: true }), 270, cy + 40 + (reduced ? 0 : 8 * (1 - la)), la);
      const ra = ramp(.6, .9, t);
      blit(ctx, this.label('RECOVERING FLIGHT RECORD', 10, C.muted, { spacing: 2.4 }), 270, cy + 96, ra);
      ctx.globalAlpha = ra; ctx.fillStyle = 'rgba(148,179,181,.22)'; ctx.fillRect(190, cy + 110, 160, 3);
      ctx.fillStyle = C.coral; ctx.fillRect(190, cy + 110, 160 * ramp(.6, L - .35, t), 3);
      ctx.restore();
    }
    // Hand off to the end screen through the dark.
    const out = ramp(L - .4, L, t);
    if (out > 0) { ctx.globalAlpha = out; ctx.fillStyle = '#07131b'; ctx.fillRect(0, 0, W, H); }
  }
}
