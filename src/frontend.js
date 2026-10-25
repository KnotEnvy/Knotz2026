// Front end: loading, title attract scene and hangar presentation.
// main.js calls these hooks; keep the exported API stable.
import { SHIPS, SHIP_ORDER, shipShape } from './ships.js';

const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const frac = x => x - Math.floor(x);
function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function systemReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
// Offscreen layer drawn in CSS pixels at the given backing scale.
function layer(w, h, scale = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w * scale));
  canvas.height = Math.max(1, Math.ceil(h * scale));
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  return { canvas, ctx, w, h };
}
function radialSprite(size, stops, scale = 1) {
  const s = layer(size, size, scale), g = s.ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) g.addColorStop(at, color);
  s.ctx.fillStyle = g; s.ctx.fillRect(0, 0, size, size);
  return s.canvas;
}

/* ------------------------------------------------------------------ */
/* Title: dawn over a storm-swept Pacific, a three-ship echelon        */
/* ------------------------------------------------------------------ */

// Formation, in units of the lead's on-screen width S. Kestrel is nearest the camera;
// wingmen sit further out toward the dawn, so they read smaller and higher.
const FORMATION = [
  { id: 'kestrel', dx: 0, dy: 0, size: 1, phase: 0, label: 'SA-01 / KESTREL', role: 'LEAD' },
  { id: 'manta', dx: 0.84, dy: -0.5, size: 0.6, phase: 1.9, label: 'SA-02 / MANTA', role: 'WING' },
  { id: 'wraith', dx: 1.36, dy: -0.88, size: 0.47, phase: 3.7, label: 'SA-03 / WRAITH', role: 'WING' },
];
// Approximate engine nozzle positions on each authored sprite (fractions of its width, from centre).
const NOZZLES = {
  kestrel: [[-0.055, 0.39], [0.055, 0.39]],
  manta: [[-0.075, 0.34], [0.075, 0.34]],
  wraith: [[-0.04, 0.37], [0.04, 0.37]],
};

class TitleScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.w = 0; this.h = 0; this.scale = 1; this.dirty = true;
    if (canvas && typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => { this.dirty = true; }).observe(canvas);
    }
    if (typeof window !== 'undefined') window.addEventListener('resize', () => { this.dirty = true; });
  }

  measure() {
    const c = this.canvas;
    const w = Math.round(c.clientWidth), h = Math.round(c.clientHeight);
    if (!w || !h) return false;
    const dpr = window.devicePixelRatio || 1;
    // Cap the backing store (about 2 megapixels) so large and high-density displays draw cheaply at 30 fps.
    const scale = Math.round(clamp(Math.min(dpr, 1.25, Math.sqrt(2e6 / (w * h))), 0.6, 1.25) * 100) / 100;
    if (w !== this.w || h !== this.h || scale !== this.scale || !this.backdrop) {
      this.w = w; this.h = h; this.scale = scale;
      c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      this.build();
    }
    this.dirty = false;
    return true;
  }

  build() {
    const W = this.w, H = this.h, k = this.scale;
    // Matches the CSS breakpoint where the title copy moves to the lower half.
    const portrait = W <= 740 || W / H < 0.9;
    this.portrait = portrait;
    // On phones the copy fills the lower screen; the formation flies the clear band above it.
    const free = portrait ? this.freeHeight(H) : H;
    // Composition: storm mass over the title copy, dawn breaking at the right.
    const hy = portrait ? free * 0.2 : H * 0.33;
    const sun = { x: portrait ? W * 0.74 : W * 0.785, y: hy - (portrait ? free * 0.035 : H * 0.028) };
    const S = portrait ? Math.min(W * 0.32, free * 0.46) : Math.min(H * 0.36, W * 0.21);
    const lead = portrait ? { x: W * 0.33, y: free * 0.6 } : { x: W * 0.655, y: H * 0.66 };
    Object.assign(this, { hy, sun, S, lead, free });
    // Share the layout with CSS: the glare sits on the sun and the scrim starts under the formation.
    const screen = this.canvas.closest('.title-screen');
    if (screen) {
      screen.style.setProperty('--title-sun-x', (sun.x / W * 100).toFixed(2) + '%');
      screen.style.setProperty('--title-sun-y', (sun.y / H * 100).toFixed(2) + '%');
      screen.style.setProperty('--title-free', Math.round(free) + 'px');
    }
    this.bleed = Math.round(Math.max(W, H) * 0.03);
    // Sky, sea, sun, rays and the storm mass share one static layer; only the horizon band,
    // fleet, sea motion, clouds, aircraft and rain are drawn separately each frame.
    this.buildBackdrop();
    this.buildHorizonBand();
    this.buildFleet();
    this.buildRain();
    this.buildClouds();
    this.buildSprites();
    void k;
  }

  // Height of the clear band above the first visible line of title copy.
  freeHeight(H) {
    const copy = document.querySelector('#titleScreen .title-content');
    if (!copy) return H * 0.4;
    const top = this.canvas.getBoundingClientRect().top;
    for (const el of copy.children) {
      const box = el.getBoundingClientRect();
      if (box.height > 0) return clamp(box.top - top, H * 0.2, H * 0.6);
    }
    return H * 0.4;
  }

  buildBackdrop() {
    const { w: W, h: H, hy, sun, bleed: B, scale } = this;
    const L = layer(W + B * 2, H + B * 2, scale), c = L.ctx;
    c.translate(B, B);
    const h0 = hy;
    // Sky.
    const sky = c.createLinearGradient(0, -B, 0, h0);
    sky.addColorStop(0, '#061019');
    sky.addColorStop(0.42, '#0d2232');
    sky.addColorStop(0.72, '#26394a');
    sky.addColorStop(0.9, '#6d5a5c');
    sky.addColorStop(1, '#d99a6e');
    c.fillStyle = sky; c.fillRect(-B, -B, W + B * 2, h0 + B);
    // Dawn glow around the sun.
    const glow = c.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, Math.max(W, H) * 0.62);
    glow.addColorStop(0, 'rgba(255,236,196,.95)');
    glow.addColorStop(0.035, 'rgba(255,207,148,.75)');
    glow.addColorStop(0.12, 'rgba(240,160,104,.34)');
    glow.addColorStop(0.36, 'rgba(160,92,78,.12)');
    glow.addColorStop(1, 'rgba(80,40,50,0)');
    c.fillStyle = glow; c.fillRect(-B, -B, W + B * 2, h0 + B);
    // Sea.
    const sea = c.createLinearGradient(0, h0, 0, H + B);
    sea.addColorStop(0, '#b98468');
    sea.addColorStop(0.025, '#5f5658');
    sea.addColorStop(0.12, '#2a3b46');
    sea.addColorStop(0.45, '#13283a');
    sea.addColorStop(1, '#050f17');
    c.fillStyle = sea; c.fillRect(-B, h0, W + B * 2, H - h0 + B);
    // Sun path on the water.
    c.save();
    c.beginPath(); c.rect(-B, h0, W + B * 2, H - h0 + B); c.clip();
    c.translate(sun.x, h0); c.scale(0.2, 1);
    const path = c.createRadialGradient(0, 0, 0, 0, 0, (H - h0) * 1.05);
    path.addColorStop(0, 'rgba(255,214,160,.55)');
    path.addColorStop(0.25, 'rgba(240,160,110,.22)');
    path.addColorStop(1, 'rgba(240,160,110,0)');
    c.fillStyle = path; c.fillRect(-W * 3, 0, W * 6, H);
    c.restore();
    // Storm shadow over the western sea.
    const west = c.createLinearGradient(0, 0, W, 0);
    west.addColorStop(0, 'rgba(3,10,17,.62)');
    west.addColorStop(0.5, 'rgba(3,10,17,.25)');
    west.addColorStop(0.8, 'rgba(3,10,17,0)');
    c.fillStyle = west; c.fillRect(-B, h0, W + B * 2, H - h0 + B);
    // Static long swells in perspective, for texture under the moving streaks.
    for (let i = 0; i < 70; i++) {
      const u = (i + hash(i * 3.3)) / 70, d = Math.pow(u, 2.1);
      const y = h0 + (H - h0) * d;
      const near = smooth(u);
      const x = sun.x + (hash(i * 9.1) - 0.5) * W * (0.6 + near * 2);
      const len = W * (0.04 + near * 0.3);
      c.fillStyle = 'rgba(150,180,190,' + (0.025 + near * 0.035).toFixed(3) + ')';
      c.fillRect(x - len / 2, y, len, 1 + near * 1.5);
    }
    // Horizon haze line.
    const haze = c.createLinearGradient(0, h0 - H * 0.02, 0, h0 + H * 0.025);
    haze.addColorStop(0, 'rgba(240,180,130,0)');
    haze.addColorStop(0.5, 'rgba(250,200,150,.32)');
    haze.addColorStop(1, 'rgba(240,180,130,0)');
    c.fillStyle = haze; c.fillRect(-B, h0 - H * 0.02, W + B * 2, H * 0.045);
    // Sun disc.
    const r = Math.max(5, H * 0.017);
    const disc = c.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, r * 3.2);
    disc.addColorStop(0, 'rgba(255,252,236,1)');
    disc.addColorStop(0.3, 'rgba(255,236,190,.95)');
    disc.addColorStop(1, 'rgba(255,200,140,0)');
    c.fillStyle = disc; c.beginPath(); c.arc(sun.x, sun.y, r * 3.2, 0, TAU); c.fill();
    this.paintRays(c);
    this.paintStorm(c);
    this.backdrop = L.canvas;
  }

  // Cloud puff painted twice: a warm lit underside, then the dark body.
  puff(c, x, y, r, dark, lit, litAlpha) {
    if (litAlpha > 0.01) {
      const g = c.createRadialGradient(x, y + r * 0.24, 0, x, y + r * 0.24, r);
      g.addColorStop(0, `rgba(${lit},${litAlpha.toFixed(3)})`);
      g.addColorStop(1, `rgba(${lit},0)`);
      c.fillStyle = g; c.beginPath(); c.arc(x, y + r * 0.24, r, 0, TAU); c.fill();
    }
    const g = c.createRadialGradient(x, y - r * 0.08, 0, x, y, r);
    g.addColorStop(0, `rgba(${dark[0]},${dark[1].toFixed(3)})`);
    g.addColorStop(0.6, `rgba(${dark[0]},${(dark[1] * 0.7).toFixed(3)})`);
    g.addColorStop(1, `rgba(${dark[0]},0)`);
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }

  paintStorm(c) {
    const { w: W, h: H, hy, sun, portrait } = this;
    const count = portrait ? 90 : 150;
    for (let i = 0; i < count; i++) {
      const fx = hash(i * 1.37 + 4);
      const x = -W * 0.08 + fx * W * 1.0;
      // The storm reaches down to the sea in the west and lifts away toward the sun.
      const edge = hy * (0.98 - 0.62 * smooth(fx * 1.05));
      const y = -H * 0.06 + Math.pow(hash(i * 2.71 + 9), 0.8) * (edge + H * 0.06);
      const r = W * (portrait ? 0.07 : 0.045) * (0.6 + hash(i * 5.9) * 1.1);
      const toSun = Math.hypot((x - sun.x) / W, (y - sun.y) / H);
      const lit = clamp(1 - toSun * 1.55, 0, 1);
      const shade = 18 + Math.round(lit * 30);
      this.puff(c, x, y, r, [`${shade - 8},${shade + 4},${shade + 14}`, 0.55 + hash(i * 7.3) * 0.3], lit > 0.5 ? '255,196,140' : '214,150,128', 0.15 + lit * 0.55);
    }
    // A few higher, cooler streaks of scud across the top.
    for (let i = 0; i < 18; i++) {
      const x = hash(i * 8.8) * W, y = hash(i * 4.4) * hy * 0.5;
      c.save(); c.translate(x, y); c.scale(4, 0.5);
      this.puff(c, 0, 0, W * 0.03, ['20,34,48', 0.4], '200,160,140', 0.12);
      c.restore();
    }
  }

  buildHorizonBand() {
    const { w: W, h: H, hy, sun, scale } = this;
    const tileW = Math.round(W * 1.25), tileH = Math.round(H * 0.17);
    const L = layer(tileW, tileH, scale), c = L.ctx;
    const base = tileH * 0.62;
    this.bandBase = base;
    for (let i = 0; i < 46; i++) {
      const x = hash(i * 3.9 + 2) * tileW, r = H * (0.012 + hash(i * 6.1) * 0.03);
      const y = base - hash(i * 1.9) * tileH * 0.5;
      for (const wrap of [-tileW, 0, tileW]) {
        const sx = x + wrap;
        if (sx < -r * 4 || sx > tileW + r * 4) continue;
        c.save(); c.translate(sx, y); c.scale(2.6, 1);
        this.puff(c, 0, 0, r, ['70,62,70', 0.5], '255,190,140', 0.45);
        c.restore();
      }
    }
    void sun; void hy;
    this.band = L.canvas; this.bandW = tileW; this.bandH = tileH;
  }

  buildFleet() {
    const { w: W, h: H, scale, portrait } = this;
    const fw = W * (portrait ? 0.46 : 0.2), fh = (portrait ? this.free : H) * 0.12;
    const L = layer(fw, fh, scale), c = L.ctx;
    const sea = fh * 0.86, unit = Math.max(0.9, Math.min(W, H) * 0.0016);
    const ships = [[0.06, 0.55, 'escort'], [0.2, 1, 'carrier'], [0.43, 0.7, 'escort'], [0.58, 1.15, 'carrier'], [0.8, 0.6, 'escort'], [0.93, 0.45, 'escort']];
    // A damaged carrier trails smoke across the dawn.
    c.save();
    for (let i = 0; i < 26; i++) {
      const p = i / 26, x = fw * 0.58 - p * fw * 0.36, y = sea - unit * 7 - p * fh * 0.62 - Math.sin(p * 5) * unit * 3;
      const r = unit * (3 + p * 15);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(40,38,44,${(0.32 * (1 - p * 0.7)).toFixed(3)})`);
      g.addColorStop(1, 'rgba(40,38,44,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }
    c.restore();
    c.fillStyle = 'rgba(30,34,44,.82)';
    for (const [fx, size, type] of ships) {
      const x = fw * fx, len = unit * (type === 'carrier' ? 46 : 22) * size, hgt = unit * (type === 'carrier' ? 3.2 : 2.4) * size;
      c.beginPath();
      c.moveTo(x - len / 2, sea - hgt); c.lineTo(x + len / 2 + unit * 3, sea - hgt);
      c.lineTo(x + len / 2 - unit, sea); c.lineTo(x - len / 2 + unit * 2, sea); c.closePath(); c.fill();
      if (type === 'carrier') {
        c.fillRect(x + len * 0.16, sea - hgt - unit * 5 * size, unit * 4 * size, unit * 5 * size);
        c.fillRect(x + len * 0.2, sea - hgt - unit * 8 * size, unit * 0.8, unit * 3 * size);
      } else {
        c.fillRect(x - unit * 2 * size, sea - hgt - unit * 3 * size, unit * 5 * size, unit * 3 * size);
        c.fillRect(x, sea - hgt - unit * 6 * size, unit * 0.7, unit * 3 * size);
      }
    }
    // Faint warm rim where the hulls meet the bright horizon.
    c.fillStyle = 'rgba(255,200,150,.18)'; c.fillRect(0, sea, fw, Math.max(1, unit * 0.6));
    this.fleet = L.canvas;
    this.fleetBox = { x: portrait ? W * 0.12 : W * 0.55, y: this.hy - fh * 0.86, w: fw, h: fh };
  }

  paintRays(c) {
    const { w: W, h: H, sun } = this;
    c.save();
    c.globalCompositeOperation = 'lighter';
    const reach = Math.hypot(W, H) * 0.9;
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + 0.18 + i * 0.13 + hash(i * 2.2) * 0.06;
      const spread = 0.012 + hash(i * 4.1) * 0.02;
      const g = c.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, reach);
      const alpha = 0.05 + hash(i * 6.6) * 0.05;
      g.addColorStop(0, `rgba(255,214,160,${alpha.toFixed(3)})`);
      g.addColorStop(0.55, `rgba(255,190,140,${(alpha * 0.35).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,190,140,0)');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(sun.x, sun.y);
      c.lineTo(sun.x + Math.cos(a - spread) * reach, sun.y + Math.sin(a - spread) * reach);
      c.lineTo(sun.x + Math.cos(a + spread) * reach, sun.y + Math.sin(a + spread) * reach);
      c.closePath(); c.fill();
    }
    c.restore();
  }

  buildRain() {
    const { w: W, scale } = this;
    const make = (count, len, width, alpha, seed) => {
      const tileH = 300, L = layer(W, tileH, scale), c = L.ctx;
      c.strokeStyle = `rgba(196,218,222,${alpha})`; c.lineWidth = width; c.lineCap = 'round';
      c.beginPath();
      for (let i = 0; i < count; i++) {
        const x = hash(i * 1.7 + seed) * (W + 60), y = hash(i * 2.9 + seed) * tileH, l = len * (0.6 + hash(i * 3.3 + seed) * 0.8);
        for (const wrap of [0, tileH, -tileH]) { c.moveTo(x, y + wrap); c.lineTo(x - l * 0.34, y + l + wrap); }
      }
      c.stroke();
      // Heavier in the storm to the west; almost clear under the dawn.
      c.globalCompositeOperation = 'destination-in';
      const mask = c.createLinearGradient(0, 0, W, 0);
      mask.addColorStop(0, 'rgba(0,0,0,1)'); mask.addColorStop(0.55, 'rgba(0,0,0,.55)'); mask.addColorStop(1, 'rgba(0,0,0,.12)');
      c.fillStyle = mask; c.fillRect(0, 0, W, tileH);
      return L.canvas;
    };
    const density = W / 1440;
    this.rainFar = make(Math.round(260 * density + 40), 16, 1, 0.22, 11);
    this.rainNear = make(Math.round(70 * density + 14), 34, 1.6, 0.26, 23);
  }

  buildClouds() {
    const { scale } = this;
    // Three soft cumulus sprites seen from above, lit on their sun-facing side.
    // Flat stratus wisps far below, seen at a low angle, with a warm dawn-lit upper edge.
    this.cloudSprites = [0, 1, 2].map(v => {
      const w = 512, h = 128, L = layer(w, h, Math.min(scale, 1)), c = L.ctx;
      for (let i = 0; i < 36; i++) {
        const x = w * (0.1 + hash(i * 2.3 + v * 17) * 0.8), y = h * (0.52 + (hash(i * 3.1 + v * 9) - 0.5) * 0.28);
        const r = w * (0.035 + hash(i * 4.7 + v) * 0.09) * (1 - Math.abs(x / w - 0.5) * 0.9);
        c.save(); c.translate(x, y); c.scale(1, 0.4);
        const warm = c.createRadialGradient(0, -r * 0.3, 0, 0, -r * 0.3, r);
        warm.addColorStop(0, 'rgba(255,214,176,.22)'); warm.addColorStop(1, 'rgba(255,214,176,0)');
        c.fillStyle = warm; c.beginPath(); c.arc(0, -r * 0.3, r, 0, TAU); c.fill();
        const body = c.createRadialGradient(0, 0, 0, 0, 0, r);
        body.addColorStop(0, 'rgba(196,200,204,.34)'); body.addColorStop(0.55, 'rgba(130,146,160,.18)'); body.addColorStop(1, 'rgba(70,88,104,0)');
        c.fillStyle = body; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
        c.restore();
      }
      return L.canvas;
    });
  }

  buildSprites() {
    const { S, scale } = this;
    this.shipSprites = {};
    for (const unit of FORMATION) {
      const size = S * unit.size, pad = size * 0.35, box = size + pad * 2;
      const L = layer(box, box, scale), c = L.ctx;
      c.shadowColor = 'rgba(0,6,12,.78)'; c.shadowBlur = size * 0.16; c.shadowOffsetY = size * 0.1;
      shipShape(c, unit.id, box / 2, box / 2, size / 210, 0, false);
      this.shipSprites[unit.id] = { canvas: L.canvas, box };
    }
    this.glow = radialSprite(64, [[0, 'rgba(235,255,252,1)'], [0.2, 'rgba(150,240,232,.75)'], [0.55, 'rgba(90,200,210,.18)'], [1, 'rgba(60,160,190,0)']], 1);
    this.lightGlow = radialSprite(256, [[0, 'rgba(210,228,255,.95)'], [0.3, 'rgba(150,180,230,.35)'], [1, 'rgba(120,150,210,0)']], 1);
    this.flash = radialSprite(32, [[0, 'rgba(255,248,220,1)'], [0.3, 'rgba(255,190,110,.8)'], [1, 'rgba(255,140,60,0)']], 1);
    this.puffSprite = radialSprite(32, [[0, 'rgba(70,64,70,.55)'], [1, 'rgba(70,64,70,0)']], 1);
    // Tapered contrail: narrow at the nozzle, spreading as it streams toward the camera.
    const tw = 80, th = 512, T = layer(tw, th, 1), t = T.ctx;
    for (let pass = 0; pass < 4; pass++) {
      const spread = 0.35 + pass * 0.22;
      const g = t.createLinearGradient(0, 0, 0, th);
      g.addColorStop(0, `rgba(250,236,214,${(0.22 - pass * 0.04).toFixed(3)})`);
      g.addColorStop(0.35, `rgba(220,226,226,${(0.1 - pass * 0.018).toFixed(3)})`);
      g.addColorStop(1, 'rgba(220,226,226,0)');
      t.fillStyle = g; t.beginPath();
      t.moveTo(tw / 2 - 1.5 * spread, 0); t.lineTo(tw / 2 + 1.5 * spread, 0);
      t.lineTo(tw / 2 + tw * 0.5 * spread, th); t.lineTo(tw / 2 - tw * 0.5 * spread, th); t.closePath(); t.fill();
    }
    this.trail = T.canvas;
  }

  draw(t, reduced) {
    if (!this.ctx) return;
    if (this.dirty && !this.measure()) return;
    const c = this.ctx, { w: W, h: H, hy, sun, S, lead, bleed: B, portrait } = this;
    const motion = reduced ? 0.35 : 1;
    const time = t * motion;
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    // Slow camera drift: the formation leads, the sky lags behind.
    const camX = reduced ? 0 : Math.sin(t * 0.13) * W * 0.006 + Math.sin(t * 0.051) * W * 0.004;
    const camY = reduced ? 0 : Math.sin(t * 0.097) * H * 0.006;
    const roll = reduced ? 0 : Math.sin(t * 0.07) * 0.005;
    c.save();
    c.translate(W / 2, H / 2); c.rotate(roll); c.translate(-W / 2, -H / 2);

    c.drawImage(this.backdrop, -B + camX * 0.3, -B + camY * 0.3, W + B * 2, H + B * 2);

    // Horizon band drifts west; the fleet holds station beneath it.
    const bandY = hy - this.bandBase + camY * 0.4;
    const drift = -frac(time * 0.004) * this.bandW + camX * 0.4;
    for (let x = drift; x < W; x += this.bandW) c.drawImage(this.band, x, bandY, this.bandW, this.bandH);
    const fb = this.fleetBox;
    c.drawImage(this.fleet, fb.x + camX * 0.4, fb.y + camY * 0.4, fb.w, fb.h);
    this.drawFlak(c, time, fb, camX * 0.4, camY * 0.4, reduced);

    this.drawLightning(c, t, reduced);

    // Moving sea: swell streaks and glitter rush toward the camera.
    this.drawSea(c, time, camX * 0.6, camY * 0.6);
    this.drawLowClouds(c, time, camX * 0.75, camY * 0.75, 0);

    // Formation.
    const units = FORMATION.map(unit => {
      const p = unit.phase;
      return {
        unit,
        x: lead.x + unit.dx * S + Math.sin(time * 0.53 + p) * S * 0.03 + camX,
        y: lead.y + unit.dy * S + Math.sin(time * 0.9 + p * 1.3) * S * 0.022 + camY,
        a: 0.05 + Math.sin(time * 0.7 + p) * 0.03,
        size: S * unit.size,
      };
    });
    for (let i = units.length - 1; i >= 0; i--) this.drawTrails(c, units[i], H);
    this.drawReticle(c, units[0], time, portrait);
    for (let i = units.length - 1; i >= 0; i--) this.drawCraft(c, units[i], t, reduced);
    this.drawLowClouds(c, time, camX * 1.2, camY * 1.2, 1);

    // Rain sheets over everything, heaviest in the storm.
    const far = this.rainFar.height / this.scale, near = this.rainNear.height / this.scale;
    const rf = frac(time * 1.25) * far, rn = frac(time * 2.4) * near;
    c.globalAlpha = 0.85;
    for (let y = rf - far; y < H; y += far) c.drawImage(this.rainFar, camX * 1.1 - 30, y, W + 60, far);
    c.globalAlpha = 0.7;
    for (let y = rn - near; y < H; y += near) c.drawImage(this.rainNear, camX * 1.4 - 30, y, W + 60, near);
    c.globalAlpha = 1;
    c.restore();
    void sun;
  }

  drawSea(c, time, ox, oy) {
    const { w: W, h: H, hy, sun } = this;
    const depth = H - hy;
    // Swell streaks.
    for (let i = 0; i < 54; i++) {
      const u = frac(hash(i * 1.91) + time * (0.045 + hash(i * 7.7) * 0.02));
      const d = Math.pow(u, 2.2);
      const y = hy + depth * d * 1.04 + oy;
      if (y > H) continue;
      const near = smooth(u * 1.2);
      const x = sun.x + (hash(i * 5.3) - 0.5) * W * (0.5 + near * 2.4) + ox;
      const len = W * (0.02 + near * 0.16);
      const fade = smooth(u * 6) * (1 - smooth((u - 0.8) * 5));
      const warm = clamp(1 - Math.abs(x - sun.x) / (W * (0.08 + near * 0.3)), 0, 1);
      c.fillStyle = warm > 0.4 ? `rgba(255,206,160,${(fade * (0.08 + near * 0.12)).toFixed(3)})` : `rgba(170,198,206,${(fade * (0.05 + near * 0.08)).toFixed(3)})`;
      c.fillRect(x - len / 2, y, len, 1 + near * 2.2);
    }
    // Glitter in the sun path.
    c.fillStyle = 'rgba(255,240,210,1)';
    for (let i = 0; i < 150; i++) {
      const u = frac(hash(i * 3.17 + 1) + time * 0.05);
      const d = Math.pow(u, 2.3);
      const y = hy + depth * d + oy;
      if (y > H) continue;
      const spread = W * (0.015 + d * 0.22);
      const x = sun.x + (hash(i * 8.3) - 0.5) * 2 * spread * (0.4 + hash(i * 2.6) * 0.6) + ox;
      const tw = Math.pow(Math.max(0, Math.sin(time * (2.2 + hash(i) * 3) + i)), 8);
      if (tw < 0.05) continue;
      c.globalAlpha = tw * (0.35 + (1 - d) * 0.5) * smooth(u * 8);
      const size = 1 + d * 3.5;
      c.fillRect(x - size, y, size * 2, Math.max(1, size * 0.45));
    }
    c.globalAlpha = 1;
  }

  drawLowClouds(c, time, ox, oy, pass) {
    const { w: W, h: H, hy, sun } = this;
    // pass 0: cloud tops far beneath the formation; pass 1: a rare wisp passing just under the camera.
    const list = pass === 0 ? [0, 1, 2, 3, 4, 5, 6] : [7, 8];
    for (const i of list) {
      const speed = pass === 0 ? 0.03 + hash(i * 2.1) * 0.012 : 0.022;
      const u = frac(hash(i * 4.3 + 3) + time * speed);
      if (pass === 1 && u < 0.62) continue;
      const d = Math.pow(u, 1.9);
      const y = hy + (H * 1.05 - hy) * d + oy;
      const sizeW = W * (pass === 0 ? 0.12 + d * 0.85 : 0.7 + d * 0.8);
      const x = sun.x + (hash(i * 6.9) - 0.62) * W * (0.6 + d * 2.2) + ox;
      const fade = smooth(u * 5) * (1 - smooth((u - 0.82) * 6));
      c.globalAlpha = fade * (pass === 0 ? 0.8 : 0.32);
      const sprite = this.cloudSprites[i % 3];
      c.drawImage(sprite, x - sizeW / 2, y - sizeW * 0.125, sizeW, sizeW * 0.25);
    }
    c.globalAlpha = 1;
  }

  drawTrails(c, p, H) {
    const nozzles = NOZZLES[p.unit.id];
    const length = H - p.y + p.size * 1.4;
    c.save();
    c.translate(p.x, p.y); c.rotate(p.a);
    c.globalAlpha = 0.55 + p.unit.size * 0.35;
    for (const [nx, ny] of nozzles) {
      const w = p.size * 0.42;
      c.drawImage(this.trail, nx * p.size - w / 2, ny * p.size, w, length);
    }
    c.restore();
  }

  drawCraft(c, p, t, reduced) {
    const sprite = this.shipSprites[p.unit.id];
    if (!sprite) return;
    c.save();
    c.translate(p.x, p.y); c.rotate(p.a);
    c.drawImage(sprite.canvas, -sprite.box / 2, -sprite.box / 2, sprite.box, sprite.box);
    // Afterburner glow.
    c.globalCompositeOperation = 'lighter';
    const flicker = reduced ? 0.85 : 0.72 + 0.28 * Math.sin(t * 31 + p.unit.phase * 7) * Math.sin(t * 17.3 + p.unit.phase);
    for (const [nx, ny] of NOZZLES[p.unit.id]) {
      const r = p.size * 0.16;
      c.globalAlpha = flicker;
      c.drawImage(this.glow, nx * p.size - r, ny * p.size - r * 0.7, r * 2, r * 2.4);
    }
    c.restore();
  }

  drawReticle(c, p, time, portrait) {
    const r = p.size * 0.92;
    c.save();
    c.translate(p.x, p.y);
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(249,203,144,.26)';
    c.beginPath(); c.arc(0, 0, r, -Math.PI * 0.32 + time * 0.03, Math.PI * 0.18 + time * 0.03); c.stroke();
    c.strokeStyle = 'rgba(249,203,144,.15)';
    c.beginPath(); c.arc(0, 0, r * 1.18, Math.PI * 0.62 - time * 0.02, Math.PI * 1.06 - time * 0.02); c.stroke();
    c.setLineDash([3, 9]); c.strokeStyle = 'rgba(199,234,225,.2)';
    c.beginPath(); c.arc(0, 0, r * 1.36, time * 0.05, time * 0.05 + TAU); c.stroke(); c.setLineDash([]);
    // Ticks.
    c.strokeStyle = 'rgba(252,218,168,.3)';
    c.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      c.moveTo(Math.cos(a) * r * 1.08, Math.sin(a) * r * 1.08); c.lineTo(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2);
    }
    c.stroke();
    if (!portrait) {
      const x = r * 0.66, y = r * 0.1;
      c.strokeStyle = 'rgba(243,187,112,.42)';
      c.beginPath(); c.moveTo(r * 0.3, r * 0.02); c.lineTo(x - 6, y - 4); c.stroke();
      c.font = '700 10px Arial, Helvetica, sans-serif';
      if ('letterSpacing' in c) c.letterSpacing = '3px';
      c.fillStyle = 'rgba(243,198,140,.8)';
      c.fillText('SA-01 / KESTREL', x, y);
      c.font = '700 8px Arial, Helvetica, sans-serif';
      c.fillStyle = 'rgba(160,204,201,.55)';
      const sub = 'LEAD  ·  N 17° 42.6  E 168° 05.2';
      if (p.x + x + c.measureText(sub).width < this.w - 12) c.fillText(sub, x, y + 14);
      if ('letterSpacing' in c) c.letterSpacing = '0px';
    }
    c.restore();
  }

  drawFlak(c, time, fb, ox, oy, reduced) {
    const { h: H } = this;
    const slotLen = 0.55, life = 1.8, now = Math.floor(time / slotLen);
    for (let s = now - Math.ceil(life / slotLen); s <= now; s++) {
      if (hash(s * 3.7) < 0.35) continue;
      const age = time - (s * slotLen + hash(s * 1.3) * slotLen);
      if (age < 0 || age > life) continue;
      const x = fb.x + fb.w * (0.12 + hash(s * 2.9) * 0.76) + ox;
      const y = this.hy - H * (0.015 + hash(s * 5.1) * 0.09) + oy;
      const rr = 2 + age * 4.5;
      c.globalAlpha = 0.65 * (1 - age / life);
      c.drawImage(this.puffSprite, x - rr, y - rr, rr * 2, rr * 2);
      if (!reduced && age < 0.14) {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 1 - age / 0.14;
        c.drawImage(this.flash, x - 5, y - 5, 10, 10);
        c.globalCompositeOperation = 'source-over';
      }
    }
    c.globalAlpha = 1;
  }

  drawLightning(c, t, reduced) {
    if (reduced) return;
    const { w: W, h: H, hy } = this;
    const period = 7.5, slot = Math.floor(t / period);
    const start = slot * period + 0.8 + hash(slot * 2.3) * (period - 2);
    const age = t - start;
    if (age < 0 || age > 0.55) return;
    const flicker = age < 0.06 ? 0.7 : age < 0.11 ? 0.2 : age < 0.18 ? 1 : 1 - (age - 0.18) / 0.37;
    const x = W * (0.04 + hash(slot * 7.1) * 0.5), y = hy * (0.15 + hash(slot * 3.9) * 0.5);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = flicker * 0.55;
    const r = W * (0.18 + hash(slot) * 0.12);
    c.drawImage(this.lightGlow, x - r, y - r * 0.7, r * 2, r * 1.4);
    // Occasionally a bolt reaches the sea, away from the headline.
    if (hash(slot * 9.7) > 0.45 && age > 0.1 && age < 0.32) {
      const top = hy * 0.32, drop = hy - top;
      const points = [[W * (0.42 + hash(slot * 4.4) * 0.2), top]];
      for (let i = 1; i <= 16; i++) {
        const [px] = points[i - 1];
        points.push([px + (hash(slot * 13 + i) - 0.5) * W * 0.022, top + drop * (i / 16) + (hash(slot * 5 + i) - 0.5) * drop * 0.03]);
      }
      const branchAt = 5 + Math.floor(hash(slot * 2.7) * 5), branch = [points[branchAt]];
      for (let i = 1; i <= 6; i++) {
        const [px, py] = branch[i - 1];
        branch.push([px + W * 0.008 * (1 + hash(slot * 17 + i)) * (hash(slot) > 0.5 ? 1 : -1), py + drop * 0.045]);
      }
      const stroke = (pts, width, alpha) => {
        c.lineWidth = width; c.globalAlpha = flicker * alpha;
        c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
        c.stroke();
      };
      c.lineJoin = 'round'; c.lineCap = 'round';
      c.strokeStyle = 'rgb(150,180,255)'; stroke(points, 7, 0.12); stroke(branch, 4, 0.1);
      c.strokeStyle = 'rgb(236,242,255)'; stroke(points, 1.5, 0.85); stroke(branch, 0.9, 0.6);
    }
    // The whole scene catches the flash for a moment.
    c.globalAlpha = flicker * 0.06;
    c.fillStyle = 'rgb(150,175,210)'; c.fillRect(0, 0, W, H);
    c.restore();
  }
}

/* ------------------------------------------------------------------ */
/* Hangar: live blueprint                                             */
/* ------------------------------------------------------------------ */

// Logical blueprint space: 400 units tall, as wide as the panel's aspect allows (at least 600).
// The craft sits at the centre; callout anchors are authored for a 600-wide frame centred at x=300.
const BP_H = 400, BP_CY = 194;
// Callouts per airframe: [anchor on the craft, label, side, label y]. Labels type in after a swap.
const CALLOUTS = {
  kestrel: [[[237, 146], 'A / WING GEOMETRY', -1, 92], [[342, 221], 'B / POWER CORE', 1, 262], [[300, 84], 'C / CANNON ARRAY', 1, 62]],
  manta: [[[218, 196], 'A / SHIELD LATTICE', -1, 104], [[372, 214], 'B / MISSILE BAYS ×4', 1, 262], [[300, 108], 'C / BARRIER EMITTER', 1, 62]],
  wraith: [[[300, 72], 'A / PIERCING RAIL', -1, 70], [[228, 232], 'B / ORBITAL CRADLES', -1, 300], [[318, 214], 'C / PHASE CORE', 1, 262]],
};
const READOUTS = {
  kestrel: ['MASS 17.8 T', 'THRUST 2 × 118 KN', 'ROLE / AIR SUPERIORITY'],
  manta: ['MASS 26.4 T', 'THRUST 2 × 141 KN', 'ROLE / STRIKE + SHIELD'],
  wraith: ['MASS 13.1 T', 'THRUST 2 × 96 KN', 'ROLE / RECON + RAIL'],
};

class Blueprint {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.scale = 1; this.lw = 600; this.view = 1;
    this.sprites = {};
    this.shipId = 'kestrel'; this.prevId = null; this.swapAt = -10; this.typeAt = -10; this.dir = 1;
    this.dirty = true;
    if (canvas && typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { this.dirty = true; }).observe(canvas);
  }

  get cx() { return this.lw / 2; }

  size() {
    if (!this.canvas || !this.dirty) return;
    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    if (!cw || !ch) return;
    this.dirty = false;
    const lw = Math.round(clamp(BP_H * cw / ch, 600, 1400));
    // Device pixels per logical unit, capped so the backing store stays modest.
    const view = ch / BP_H, dpr = window.devicePixelRatio || 1;
    const scale = Math.round(clamp(view * dpr, 1, 2) * 100) / 100;
    if (lw === this.lw && scale === this.scale && this.rings) { this.view = view; return; }
    this.lw = lw; this.scale = scale; this.view = view;
    this.canvas.width = Math.round(lw * scale); this.canvas.height = Math.round(BP_H * scale);
    this.sprites = {}; this.rings = null;
  }

  sprite(id) {
    if (this.sprites[id]) return this.sprites[id];
    const L = layer(this.lw, BP_H, this.scale);
    shipShape(L.ctx, id, this.cx, BP_CY, 1.28, 0, true);
    return (this.sprites[id] = L.canvas);
  }

  ringLayer() {
    if (this.rings) return this.rings;
    const lw = this.lw, cx = this.cx;
    const L = layer(lw, BP_H, this.scale), g = L.ctx;
    g.strokeStyle = 'rgba(163,217,209,.22)'; g.lineWidth = 1;
    for (let r = 80; r < 260; r += 57) { g.beginPath(); g.arc(cx, BP_CY, r, 0, TAU); g.stroke(); }
    // Range ticks.
    g.strokeStyle = 'rgba(163,217,209,.3)';
    g.beginPath();
    for (let i = 0; i < 72; i++) {
      const a = i / 72 * TAU, r0 = 194, r1 = i % 6 ? 199 : 205;
      g.moveTo(cx + Math.cos(a) * r0, BP_CY + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, BP_CY + Math.sin(a) * r1);
    }
    g.stroke();
    // Sweep wedge sprite for the rotating scanner.
    const W = layer(lw, BP_H, this.scale), w = W.ctx;
    for (let i = 0; i < 24; i++) {
      const a0 = -i * 0.03, a1 = a0 - 0.032;
      w.fillStyle = `rgba(122,216,205,${(0.045 * (1 - i / 24)).toFixed(3)})`;
      w.beginPath(); w.moveTo(cx, BP_CY); w.arc(cx, BP_CY, 250, a1, a0); w.closePath(); w.fill();
    }
    this.wedge = W.canvas;
    // Scan band, faded at both ends so it never stops on a hard edge inside the panel.
    const bw = 620, band = layer(bw, 40, this.scale), b = band.ctx, bg = b.createLinearGradient(0, 0, 0, 40);
    bg.addColorStop(0, 'rgba(122,216,205,0)'); bg.addColorStop(0.75, 'rgba(122,216,205,.12)'); bg.addColorStop(0.97, 'rgba(190,250,240,.55)'); bg.addColorStop(1, 'rgba(122,216,205,0)');
    b.fillStyle = bg; b.fillRect(0, 0, bw, 40);
    b.globalCompositeOperation = 'destination-in';
    const ends = b.createLinearGradient(0, 0, bw, 0);
    ends.addColorStop(0, 'rgba(0,0,0,0)'); ends.addColorStop(0.22, 'rgba(0,0,0,1)'); ends.addColorStop(0.78, 'rgba(0,0,0,1)'); ends.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = ends; b.fillRect(0, 0, bw, 40);
    this.band = band.canvas; this.bandW = bw;
    return (this.rings = L.canvas);
  }

  select(id, now) {
    if (id === this.shipId) return;
    const from = SHIP_ORDER.indexOf(this.shipId), to = SHIP_ORDER.indexOf(id);
    this.dir = to >= from ? 1 : -1;
    this.prevId = this.shipId; this.shipId = id; this.swapAt = now; this.typeAt = now + 0.3;
  }

  enter(now) { this.typeAt = now + 0.15; this.enterAt = now; this.dirty = true; }

  drawBand(g, y) { g.drawImage(this.band, this.cx - this.bandW / 2, y, this.bandW, 40); }

  draw(t, reduced) {
    const g = this.ctx;
    if (!g) return;
    this.size();
    const k = this.scale, lw = this.lw, cx = this.cx;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, lw, BP_H);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const color = SHIPS[this.shipId]?.color || '#f3bb70';
    const enter = smooth((t - (this.enterAt ?? -10)) / 0.6);
    const motion = reduced ? 0.25 : 1;
    const rings = this.ringLayer();

    // Rings expand in on entry, then idle.
    g.save();
    g.translate(cx, BP_CY); g.scale(0.85 + enter * 0.15, 0.85 + enter * 0.15); g.translate(-cx, -BP_CY);
    g.globalAlpha = enter;
    g.drawImage(rings, 0, 0, lw, BP_H);
    if (!reduced) {
      g.save(); g.translate(cx, BP_CY); g.rotate(t * 0.7); g.translate(-cx, -BP_CY);
      g.drawImage(this.wedge, 0, 0, lw, BP_H); g.restore();
    }
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(243,187,112,.5)';
    g.beginPath(); g.arc(cx, BP_CY, 158, -0.8 - t * 0.12 * motion, 0.8 - t * 0.12 * motion); g.stroke();
    g.strokeStyle = 'rgba(243,187,112,.28)';
    g.beginPath(); g.arc(cx, BP_CY, 165, 2.4 + t * 0.08 * motion, 3.1 + t * 0.08 * motion); g.stroke();
    g.setLineDash([2, 7]); g.strokeStyle = 'rgba(163,217,209,.32)';
    g.beginPath(); g.arc(cx, BP_CY, 226, t * 0.05 * motion, t * 0.05 * motion + TAU); g.stroke(); g.setLineDash([]);
    g.restore();

    // Aircraft, with a scan reveal when the selection changes.
    const age = t - this.swapAt, swapping = age >= 0 && age < 0.5;
    const bob = Math.sin(t * 1.6) * 1.6 * motion;
    if (swapping && this.prevId) {
      const out = smooth(age / 0.2);
      if (out < 1) {
        g.globalAlpha = 1 - out;
        g.drawImage(this.sprite(this.prevId), -this.dir * out * 40, bob, lw, BP_H);
      }
      const p = reduced ? smooth(age / 0.3) : smooth((age - 0.06) / 0.4);
      if (reduced) {
        g.globalAlpha = p; g.drawImage(this.sprite(this.shipId), 0, bob, lw, BP_H);
      } else {
        const edge = 40 + p * 330;
        g.save(); g.beginPath(); g.rect(0, 0, lw, edge); g.clip();
        g.globalAlpha = 0.82 + 0.18 * hash(Math.floor(t * 30));
        g.drawImage(this.sprite(this.shipId), 0, bob, lw, BP_H);
        g.restore();
        if (p < 1) {
          g.globalAlpha = 1; g.globalCompositeOperation = 'lighter';
          this.drawBand(g, edge - 38);
          g.globalCompositeOperation = 'source-over';
        }
      }
    } else {
      g.globalAlpha = enter;
      g.drawImage(this.sprite(this.shipId), 0, bob, lw, BP_H);
      if (!reduced) {
        // Idle scan pass, highlighting the airframe as it crosses.
        const cycle = 3.6, s = frac(t / cycle), y = 30 + s * 380;
        if (s < 0.9) {
          g.globalAlpha = 0.55 * Math.sin(s / 0.9 * Math.PI);
          g.globalCompositeOperation = 'lighter';
          this.drawBand(g, y - 38);
          g.save(); g.beginPath(); g.rect(0, y - 16, lw, 18); g.clip();
          g.globalAlpha *= 0.55; g.drawImage(this.sprite(this.shipId), 0, bob, lw, BP_H);
          g.restore();
          g.globalCompositeOperation = 'source-over';
        }
      }
    }
    g.globalAlpha = 1;
    this.drawCallouts(g, t, color, reduced);
  }

  // Font size in logical units for a given on-screen pixel size.
  font(px, weight = 700) { return `${weight} ${(px / Math.max(0.3, this.view)).toFixed(1)}px Arial, Helvetica, sans-serif`; }

  drawCallouts(g, t, color, reduced) {
    const list = CALLOUTS[this.shipId] || CALLOUTS.kestrel;
    const cx = this.cx, lw = this.lw, ox = cx - 300;
    // Narrow panels (phones) pull the labels in toward the craft and tighten the tracking.
    const wide = lw >= 760, offset = wide ? 142 : 118;
    const spacing = ((wide ? 1.4 : 0.5) / Math.max(0.3, this.view)).toFixed(1) + 'px';
    // Fit the longest label into the space beside the rings; shrink the type if it still does not fit.
    let px = 10;
    g.font = this.font(px);
    if ('letterSpacing' in g) g.letterSpacing = spacing;
    const room = lw / 2 - offset - 8, widest = Math.max(...list.map(item => g.measureText(item[1]).width));
    if (widest > room) { px = Math.max(6.5, px * room / widest); g.font = this.font(px); }
    list.forEach(([anchor, label, side, textY], i) => {
      const start = this.typeAt + i * 0.28;
      const line = reduced ? 1 : smooth((t - start) / 0.22);
      if (line <= 0) return;
      const chars = reduced ? label.length : Math.floor(clamp((t - start - 0.18) * 34, 0, label.length));
      const ax = anchor[0] + ox, ay = anchor[1];
      const elbowX = cx + side * (offset - 10), textX = cx + side * offset;
      // Leader line: anchor → elbow → text, drawn progressively.
      const knee = [elbowX - side * 18, textY];
      g.strokeStyle = 'rgba(243,187,112,.62)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(ax, ay);
      const seg1 = Math.min(1, line * 1.6), seg2 = clamp((line - 0.62) / 0.38, 0, 1);
      g.lineTo(ax + (knee[0] - ax) * seg1, ay + (knee[1] - ay) * seg1);
      if (seg2 > 0) g.lineTo(knee[0] + (elbowX - knee[0]) * seg2, textY);
      g.stroke();
      g.fillStyle = color; g.beginPath(); g.arc(ax, ay, 2.4, 0, TAU); g.fill();
      if (chars > 0) {
        const text = label.slice(0, chars);
        g.textAlign = side < 0 ? 'right' : 'left';
        g.fillStyle = color;
        g.fillText(text, textX, textY + 4);
        if (chars < label.length && !reduced) {
          const w = g.measureText(text).width, cw = 6 / this.view;
          g.fillRect(side < 0 ? textX - w - cw - 3 : textX + w + 3, textY - 5, cw, 9 / this.view);
        }
      }
    });
    g.textAlign = 'left';
    // Telemetry readout, lower left; status, upper right.
    const ready = t - this.swapAt > 0.5;
    const lines = READOUTS[this.shipId] || READOUTS.kestrel;
    g.font = this.font(Math.min(9, px));
    g.fillStyle = 'rgba(163,217,209,.66)';
    const lineGap = 13 / this.view, base = BP_H - 18 - lineGap * 2;
    lines.forEach((text, i) => {
      const show = reduced ? text.length : Math.floor(clamp((t - this.typeAt - 0.9 - i * 0.15) * 40, 0, text.length));
      if (show > 0) g.fillText(text.slice(0, show), 18, base + i * lineGap);
    });
    g.fillStyle = ready ? 'rgba(122,216,205,.88)' : 'rgba(243,187,112,.88)';
    g.textAlign = 'right';
    g.fillText(ready ? '● FLIGHT READY' : '◌ CALIBRATING', lw - 18, 30);
    g.textAlign = 'left';
    if ('letterSpacing' in g) g.letterSpacing = '0px';
  }
}

/* ------------------------------------------------------------------ */
/* Card thumbnails                                                     */
/* ------------------------------------------------------------------ */

function drawCardShips() {
  for (const card of document.querySelectorAll('.ship-card')) {
    const id = card.dataset.ship, c = card.querySelector('canvas'), g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    const glow = g.createRadialGradient(80, 63, 4, 80, 63, 77);
    glow.addColorStop(0, id === 'manta' ? 'rgba(242,154,118,.21)' : id === 'wraith' ? 'rgba(129,215,208,.19)' : 'rgba(243,187,112,.21)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = glow; g.fillRect(0, 0, 160, 126);
    g.strokeStyle = 'rgba(190,218,210,.14)'; g.lineWidth = 1;
    g.beginPath(); g.arc(80, 62, 48, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(10, 63); g.lineTo(150, 63); g.moveTo(80, 7); g.lineTo(80, 119); g.stroke();
    shipShape(g, id, 80, 60, 0.48, 0, false);
  }
}

function restartClass(el, name) {
  if (!el) return;
  el.classList.remove(name);
  void el.offsetWidth;
  el.classList.add(name);
}

export class FrontEnd {
  constructor() {
    this._reduced = false;
    this.shipId = 'kestrel';
    this.screen = 'title';
    this.title = null;
    this.blueprint = null;
  }
  get reducedEffects() { return this._reduced; }
  set reducedEffects(value) {
    this._reduced = !!value;
    if (typeof document === 'undefined') return;
    for (const id of ['titleScreen', 'hangarScreen']) $(id)?.classList.toggle('fx-reduced', this._reduced);
  }
  get reduced() { return this._reduced || systemReducedMotion(); }

  // Called once at startup after art has loaded.
  init(shipId) {
    this.shipId = shipId;
    this.title = new TitleScene($('titleScene'));
    this.blueprint = new Blueprint($('shipBlueprint'));
    this.blueprint.shipId = shipId;
    drawCardShips();
    // Staged logo reveal plays once, on the first title after loading. The class stays until the
    // player leaves the title, because changing it mid-screen would restart the CSS animations.
    $('titleScreen')?.classList.add('is-first');
  }
  // Screen change notification: 'title' | 'hangar' | 'play' | 'pause' | 'end'.
  enter(screen) {
    const previous = this.screen;
    this.screen = screen;
    if (screen !== 'title' && previous === 'title') $('titleScreen')?.classList.remove('is-first');
    if (screen === 'title' && this.title) this.title.dirty = true;
    if (screen === 'hangar' && this.blueprint) {
      const now = performance.now() / 1000;
      this.blueprint.enter(now);
      this.blueprint.draw(now, this.reduced);
    }
  }
  // Aircraft selection changed in the hangar.
  selectShip(shipId) {
    const changed = shipId !== this.shipId;
    this.shipId = shipId;
    if (!this.blueprint) return;
    const now = performance.now() / 1000;
    this.blueprint.select(shipId, now);
    if (changed && this.screen === 'hangar') restartClass(document.querySelector('.ship-detail'), 'is-swapping');
    this.blueprint.draw(now, this.reduced);
  }
  // ~30 fps while the title screen is visible. t is seconds.
  drawTitle(t) { this.title?.draw(t, this.reduced); }
  // ~30 fps while the hangar is visible. t is seconds.
  drawHangar(t) { this.blueprint?.draw(t, this.reduced); }
}
