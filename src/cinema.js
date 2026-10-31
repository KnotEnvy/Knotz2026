// End-of-sortie cinematic and flight-record presentation.
// main.js calls start(data, meta), reveal() and draw(t, data); keep that API stable.
// Three procedural scenes render on #cinemaCanvas (1600x900): dawn victory, storm-night
// defeat (the storm fleet, the Crown, or LEVIATHAN in the typhoon) and a dusk training range for drills. Static layers are built once and cached.
import { SHIP_ORDER, shipShape } from './ships.js';
import { actName, ACT_TWO_STAGE } from './timeline.js';
import { drawSkyforge, warmSkyforge } from './art.js';
import { CAMPAIGN_STAGES } from './game.js';

const W = 1600, H = 900, TAU = Math.PI * 2;
const $ = id => document.getElementById(id);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const easeOut = t => 1 - Math.pow(1 - clamp(t), 3);
const easeInOut = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function surface(w, h) { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; }
const reducedMotionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

// ---------------------------------------------------------------- sprites
const sprites = new Map();
function glowSprite(rgb, r = 64) {
  const key = 'glow' + rgb + r;
  if (sprites.has(key)) return sprites.get(key);
  const s = surface(r * 2, r * 2), c = s.getContext('2d');
  const g = c.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(.18, `rgba(${rgb},.55)`);
  g.addColorStop(.45, `rgba(${rgb},.16)`); g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g; c.fillRect(0, 0, r * 2, r * 2);
  sprites.set(key, s); return s;
}
// Soft cloud lobe used to build cloud masses.
function blobSprite(rgb, alpha = .9) {
  const key = 'blob' + rgb + alpha;
  if (sprites.has(key)) return sprites.get(key);
  const s = surface(128, 128), c = s.getContext('2d');
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, `rgba(${rgb},${alpha})`); g.addColorStop(.55, `rgba(${rgb},${alpha * .8})`);
  g.addColorStop(.82, `rgba(${rgb},${alpha * .3})`); g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  sprites.set(key, s); return s;
}
// Lumpy smoke puff with a rim light on one side.
function puffSprite(dark, light, angle) {
  const key = 'puff' + dark + light + angle;
  if (sprites.has(key)) return sprites.get(key);
  const s = surface(128, 128), c = s.getContext('2d');
  for (let i = 0; i < 10; i++) {
    const a = hash(i * 3.1 + 1) * TAU, d = hash(i * 7.7 + 2) * 24, r = 22 + hash(i * 1.3 + 3) * 20;
    const x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${dark},.5)`); g.addColorStop(.6, `rgba(${dark},.32)`); g.addColorStop(1, `rgba(${dark},0)`);
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  if (light) {
    c.globalCompositeOperation = 'source-atop';
    const dx = Math.cos(angle) * 64, dy = Math.sin(angle) * 64;
    const g = c.createLinearGradient(64 - dx, 64 - dy, 64 + dx, 64 + dy);
    g.addColorStop(0, `rgba(${light},0)`); g.addColorStop(.55, `rgba(${light},.05)`); g.addColorStop(1, `rgba(${light},.75)`);
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  }
  sprites.set(key, s); return s;
}
// Four-point lens star for sun glints on canopies.
function starSprite() {
  if (sprites.has('star')) return sprites.get('star');
  const s = surface(256, 256), c = s.getContext('2d');
  c.drawImage(glowSprite('255,244,220', 64), 64, 64, 128, 128);
  c.globalCompositeOperation = 'lighter';
  for (const [w, h] of [[256, 5], [5, 200]]) {
    const g = w > h ? c.createLinearGradient(0, 0, 256, 0) : c.createLinearGradient(0, 28, 0, 228);
    g.addColorStop(0, 'rgba(255,240,210,0)'); g.addColorStop(.5, 'rgba(255,248,230,.95)'); g.addColorStop(1, 'rgba(255,240,210,0)');
    c.fillStyle = g; c.fillRect(128 - w / 2, 128 - h / 2, w, h);
  }
  sprites.set('star', s); return s;
}
// Long anamorphic flare streak.
function streakSprite() {
  if (sprites.has('streak')) return sprites.get('streak');
  const s = surface(1024, 40), c = s.getContext('2d');
  const g = c.createLinearGradient(0, 0, 1024, 0);
  g.addColorStop(0, 'rgba(120,200,230,0)'); g.addColorStop(.35, 'rgba(150,215,235,.25)');
  g.addColorStop(.5, 'rgba(255,240,215,.9)'); g.addColorStop(.65, 'rgba(150,215,235,.25)'); g.addColorStop(1, 'rgba(120,200,230,0)');
  c.fillStyle = g; c.fillRect(0, 17, 1024, 6);
  c.globalAlpha = .35; c.fillRect(0, 12, 1024, 16);
  sprites.set('streak', s); return s;
}
function vignetteSprite(strength, tint) {
  const key = 'vig' + strength + tint;
  if (sprites.has(key)) return sprites.get(key);
  const s = surface(W, H), c = s.getContext('2d');
  c.save(); c.translate(W * .6, H * .5); c.scale(1.25, 1);
  const g = c.createRadialGradient(0, 0, H * .3, 0, 0, H * .95);
  g.addColorStop(0, `rgba(${tint},0)`); g.addColorStop(1, `rgba(${tint},${strength})`);
  c.fillStyle = g; c.fillRect(-W, -H, W * 2, H * 2); c.restore();
  const top = c.createLinearGradient(0, 0, 0, 150);
  top.addColorStop(0, `rgba(${tint},.75)`); top.addColorStop(1, `rgba(${tint},0)`);
  c.fillStyle = top; c.fillRect(0, 0, W, 150);
  sprites.set(key, s); return s;
}
function sprite(g, s, x, y, w, h = w, alpha = 1) {
  if (alpha <= .004 || w <= 0) return;
  g.globalAlpha = Math.min(1, alpha);
  g.drawImage(s, x - w / 2, y - h / 2, w, h);
}
function cloudMass(c, blobs, darkRgb, lightRgb, lightAt) {
  const dark = blobSprite(darkRgb, .94), light = lightRgb && blobSprite(lightRgb, .85);
  if (light) for (const b of blobs) {
    const dx = lightAt.x - b.x, dy = lightAt.y - b.y, d = Math.hypot(dx, dy) || 1;
    const off = b.r * .2;
    c.globalAlpha = b.lit ?? .9;
    c.drawImage(light, b.x + dx / d * off - b.r, b.y + dy / d * off - b.r * b.squash, b.r * 2, b.r * 2 * b.squash);
  }
  c.globalAlpha = 1;
  for (const b of blobs) c.drawImage(dark, b.x - b.r, b.y - b.r * b.squash, b.r * 2, b.r * 2 * b.squash);
}
function poly(c, pts) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); }

// Value-noise fbm cloud fields, generated once at low resolution and upscaled softly.
function makeNoise(seed) {
  const v = new Float32Array(65536);
  for (let i = 0; i < v.length; i++) v[i] = hash(i * .731 + seed * 17.3);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
    const x0 = xi & 255, y0 = yi & 255, x1 = (x0 + 1) & 255, y1 = (y0 + 1) & 255;
    const a = v[y0 * 256 + x0], b = v[y0 * 256 + x1], c = v[y1 * 256 + x0], d = v[y1 * 256 + x1];
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
}
function fbm(n, x, y, octaves = 5) {
  let amp = .5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) { sum += amp * n(x * freq, y * freq); norm += amp; amp *= .5; freq *= 2.03; }
  return sum / norm;
}
// opts: { w, h, seed, fx, fy, coverage(X,Y), light(X,Y) -> [dx,dy,amount], dark(X,Y), bright, alpha, flash }
// Returns { canvas, flash? } at (w x h); draw scaled to the target size.
function cloudField(o) {
  const { w, h } = o, n = makeNoise(o.seed), dens = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x / w, Y = y / h;
    const warp = fbm(n, X * 2.2 + 11, Y * 2.2 + 5, 3) - .5;
    const f = fbm(n, X * o.fx + warp * .9 + 3.1, Y * o.fy + warp * .6 + 7.7, 5);
    const cov = clamp(o.coverage(X, Y));
    dens[y * w + x] = cov <= 0 ? 0 : smooth((f - (1 - cov) + .06) / .22);
  }
  const make = () => { const c = surface(w, h); return [c, c.getContext('2d'), new ImageData(w, h)]; };
  const [canvas, ctx, img] = make(), data = img.data;
  const flash = o.flash ? make() : null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, d = dens[i];
    if (d <= .002) continue;
    const X = x / w, Y = y / h, [lx, ly, amt] = o.light(X, Y);
    const sx = Math.min(w - 1, Math.max(0, Math.round(x + lx))), sy = Math.min(h - 1, Math.max(0, Math.round(y + ly)));
    const edge = clamp((d - dens[sy * w + sx]) * 2.6 + .08) * amt;
    const base = o.dark(X, Y), k = i * 4;
    data[k] = lerp(base[0], o.bright[0], edge); data[k + 1] = lerp(base[1], o.bright[1], edge); data[k + 2] = lerp(base[2], o.bright[2], edge);
    data[k + 3] = d * 255 * o.alpha;
    if (flash) { const f = flash[2].data; f[k] = o.flash[0]; f[k + 1] = o.flash[1]; f[k + 2] = o.flash[2]; f[k + 3] = d * (110 + edge * 145); }
  }
  ctx.putImageData(img, 0, 0);
  if (flash) flash[1].putImageData(flash[2], 0, 0);
  return { canvas, flash: flash && flash[0] };
}
function upscale(src, w, h, blur = 0) {
  const c = surface(w, h), g = c.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  if (blur) g.filter = `blur(${blur}px)`;
  g.drawImage(src, 0, 0, w, h);
  return c;
}

// ---------------------------------------------------------------- aircraft
const ENGINE = { kestrel: [.07, .4], manta: [.09, .38], wraith: [.06, .41] };
function engineOffsets(id, size) { const [x, y] = ENGINE[id] || ENGINE.kestrel; return [x * 210 * size, y * 210 * size]; }
function drawAircraft(g, id, x, y, size, rot, bank, t, opts = {}) {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(bank, 1);
  const [ex, ey] = engineOffsets(id, size);
  if (opts.engine !== false) {
    g.globalCompositeOperation = 'lighter';
    const pulse = .78 + .22 * Math.sin(t * 31 + size * 7);
    const glow = glowSprite(opts.fire ? '255,140,60' : '120,230,235', 48);
    for (const s of [-1, 1]) sprite(g, glow, s * ex, ey, 70 * size * pulse, 70 * size * pulse, (opts.engineAlpha ?? .75));
    g.globalCompositeOperation = 'source-over';
  }
  g.globalAlpha = opts.alpha ?? 1;
  shipShape(g, id, 0, 0, size, t);
  g.globalAlpha = 1;
  g.restore();
}
// Twin contrails streaming from the engines, opposite the nose direction.
function contrail(g, id, x, y, rot, size, length, alpha, t, seed, color = '255,242,224') {
  if (alpha <= .01) return;
  const tx = -Math.sin(rot), ty = Math.cos(rot), px = Math.cos(rot), py = Math.sin(rot);
  const [ex, ey] = engineOffsets(id, size);
  g.strokeStyle = `rgb(${color})`; g.lineCap = 'round';
  const steps = 22;
  for (const side of [-1, 1]) {
    const sx = x + px * side * ex + tx * ey, sy = y + py * side * ex + ty * ey;
    let lx = sx, ly = sy;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps, d = k * length;
      const spread = side * k * k * 26 * size + Math.sin(k * 5 + t * .7 + seed) * k * 10;
      const nx = sx + tx * d + px * spread, ny = sy + ty * d + py * spread + k * k * 30;
      g.globalAlpha = alpha * Math.pow(1 - k, 1.5);
      g.lineWidth = (1.6 + k * 15) * size * .55;
      g.beginPath(); g.moveTo(lx, ly); g.lineTo(nx, ny); g.stroke();
      lx = nx; ly = ny;
    }
  }
  g.globalAlpha = 1;
}
function smokeColumn(g, puff, sx, sy, t, opts) {
  const n = opts.count || 24, rate = opts.rate || .06;
  for (let k = n - 1; k >= 0; k--) {
    const a = ((t * rate + k / n + (opts.seed || 0)) % 1 + 1) % 1;
    const j = hash(k * 1.91 + (opts.seed || 0) * 13);
    const x = sx - a * a * (opts.wind ?? 320) - a * 50 + (j - .5) * 30 * a;
    const y = sy - a * (opts.rise ?? 380);
    const size = (opts.base ?? 18) + a * (opts.grow ?? 120) * (.75 + j * .5);
    const alpha = (opts.alpha ?? .5) * Math.pow(1 - a, 1.25) * Math.min(1, a * 9);
    sprite(g, puff, x, y, size, size, alpha);
  }
}
function birds(g, t, x0, y0, color, count = 9) {
  g.strokeStyle = color; g.lineWidth = 1.7; g.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const row = Math.floor((i + 1) / 2), side = i % 2 ? 1 : -1;
    const x = x0 + row * 26 + hash(i * 3.3) * 10, y = y0 + side * row * 9 + Math.sin(t * .9 + i) * 3;
    const s = 5.5 + hash(i * 2.1) * 3, flap = Math.sin(t * 7.5 + i * 1.7);
    g.globalAlpha = .85;
    g.beginPath(); g.moveTo(x - s, y - s * .55 * flap);
    g.quadraticCurveTo(x - s * .45, y - s * .3 * flap - 1.5, x, y);
    g.quadraticCurveTo(x + s * .45, y - s * .3 * flap - 1.5, x + s, y - s * .55 * flap);
    g.stroke();
  }
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------- victory: dawn over the Meridian
const V = { hz: 560, sun: { x: 1010, y: 528 } };
function buildVictory(stage) {
  if(stage===5){warmSkyforge();const sky=surface(W,H),c=sky.getContext('2d');c.translate(0,-360);c.scale(W/540,W/540);drawSkyforge(c,2600,'victory');return {sky,dusk:true};}
  const { hz, sun } = V, out = {};
  const sky = surface(W, H), c = sky.getContext('2d');
  let gr = c.createLinearGradient(0, 0, 0, hz);
  gr.addColorStop(0, '#07131c'); gr.addColorStop(.28, '#132c39'); gr.addColorStop(.54, '#365360');
  gr.addColorStop(.74, '#8f7a70'); gr.addColorStop(.9, '#dc9c72'); gr.addColorStop(1, '#f5c48f');
  c.fillStyle = gr; c.fillRect(0, 0, W, hz + 1);
  let rg = c.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, 820);
  rg.addColorStop(0, 'rgba(255,238,200,.95)'); rg.addColorStop(.05, 'rgba(255,216,162,.66)');
  rg.addColorStop(.2, 'rgba(244,168,112,.3)'); rg.addColorStop(.5, 'rgba(190,120,95,.1)'); rg.addColorStop(1, 'rgba(160,100,90,0)');
  c.fillStyle = rg; c.fillRect(0, 0, W, hz + 1);
  c.save(); c.translate(sun.x, hz); c.scale(1, .15);
  rg = c.createRadialGradient(0, 0, 0, 0, 0, 1150);
  rg.addColorStop(0, 'rgba(255,228,184,.9)'); rg.addColorStop(.4, 'rgba(246,176,124,.34)'); rg.addColorStop(1, 'rgba(240,160,110,0)');
  c.fillStyle = rg; c.fillRect(-1700, -1150, 3400, 1150); c.restore();
  // Distant islands, hazed by the low sun.
  c.fillStyle = 'rgba(92,82,94,.55)';
  poly(c, [[0, hz], [0, hz - 18], [80, hz - 26], [170, hz - 14], [260, hz - 30], [330, hz - 9], [420, hz - 4], [480, hz]]); c.fill();
  c.fillStyle = 'rgba(132,104,104,.45)';
  poly(c, [[1460, hz], [1500, hz - 12], [1560, hz - 17], [1600, hz - 10], [1600, hz]]); c.fill();
  // Sun disc, partly veiled by stratus strips.
  c.drawImage(glowSprite('255,238,200', 90), sun.x - 90, sun.y - 90, 180, 180);
  c.fillStyle = '#fff6de'; c.beginPath(); c.arc(sun.x, sun.y, 29, 0, TAU); c.fill();
  for (let i = 0; i < 14; i++) {
    const y = hz - 10 - i * 8.5 - hash(i * 4.1) * 10, cx = 640 + hash(i * 2.7) * 1000, w = 160 + hash(i * 6.2) * 480;
    const near = clamp(1 - Math.abs(cx - sun.x) / 700);
    c.fillStyle = `rgba(${near > .4 ? '255,206,154' : '196,140,122'},${.22 + near * .4})`;
    c.beginPath(); c.ellipse(cx, y, w / 2, 2 + hash(i * 9.1) * 4, 0, 0, TAU); c.fill();
    c.fillStyle = `rgba(92,70,78,${.25 + (1 - near) * .25})`;
    c.beginPath(); c.ellipse(cx + 12, y - 3, w / 2.3, 1.5 + hash(i * 3.9) * 2.5, 0, 0, TAU); c.fill();
  }
  out.sky = sky;
  // God rays through the breaking storm.
  const rays = surface(W, H), r = rays.getContext('2d');
  r.filter = 'blur(7px)';
  for (let i = 0; i < 13; i++) {
    const a = -2.9 + (i / 12) * 2.65 + (hash(i * 5.5) - .5) * .12, w = .02 + hash(i * 8.8) * .045;
    const g2 = r.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, 1400);
    g2.addColorStop(0, 'rgba(255,224,176,.16)'); g2.addColorStop(.45, 'rgba(255,210,160,.05)'); g2.addColorStop(1, 'rgba(255,210,160,0)');
    r.fillStyle = g2;
    r.beginPath(); r.moveTo(sun.x, sun.y);
    r.lineTo(sun.x + Math.cos(a - w) * 1500, sun.y + Math.sin(a - w) * 1500);
    r.lineTo(sun.x + Math.cos(a + w) * 1500, sun.y + Math.sin(a + w) * 1500); r.closePath(); r.fill();
  }
  out.rays = rays;
  // Storm remnant breaking around the sun, rim-lit warm. Wider than the frame so it can drift.
  const CW = W + 420, CH = hz + 20, sunX = (sun.x + 210) / CW, sunY = sun.y / CH;
  const field = cloudField({
    w: 520, h: 196, seed: 4, fx: 5.2, fy: 4.2, alpha: .97, bright: [246, 178, 128],
    coverage: (X, Y) => .98 - Y * 1.05 - .75 * Math.exp(-((X - sunX) ** 2 / .018 + (Y - sunY) ** 2 / .12)) + (Y > .78 ? -(Y - .78) * 2 : 0),
    light: (X, Y) => { const dx = (sunX - X) * CW, dy = (sunY - Y) * CH, d = Math.hypot(dx, dy) || 1; return [dx / d * 2.4, dy / d * 2.4, .35 + .65 * Math.exp(-d / 620)]; },
    dark: (X, Y) => [lerp(14, 52, Y), lerp(27, 52, Y), lerp(36, 60, Y)]
  });
  const clouds = upscale(field.canvas, CW, CH, 1.5), k = clouds.getContext('2d');
  // Thin stratus lit from beneath, low over the horizon.
  for (let i = 0; i < 22; i++) {
    const x = hash(i * 7.3 + 9) * CW, y = hz - 150 + hash(i * 5.9) * 120, w = 140 + hash(i * 2.2) * 320;
    k.globalAlpha = .45; k.drawImage(blobSprite('236,160,116', .7), x - w / 2, y - 6, w, 22);
    k.globalAlpha = .6; k.drawImage(blobSprite('52,54,64', .85), x - w / 2 - 6, y - 12, w * .95, 18);
  }
  k.globalAlpha = 1;
  out.clouds = clouds;
  // Sea, with horizon reflection and perspective swell lines.
  const sea = surface(W, H - hz), s = sea.getContext('2d'), sh = H - hz;
  gr = s.createLinearGradient(0, 0, 0, sh);
  gr.addColorStop(0, '#d8a47e'); gr.addColorStop(.05, '#8c7474'); gr.addColorStop(.18, '#4b5761');
  gr.addColorStop(.45, '#20343e'); gr.addColorStop(1, '#091820');
  s.fillStyle = gr; s.fillRect(0, 0, W, sh);
  s.save(); s.translate(sun.x, 0); s.scale(.4, 1.5);
  rg = s.createRadialGradient(0, 0, 0, 0, 0, 260);
  rg.addColorStop(0, 'rgba(255,214,160,.62)'); rg.addColorStop(.5, 'rgba(240,170,120,.2)'); rg.addColorStop(1, 'rgba(240,170,120,0)');
  s.fillStyle = rg; s.fillRect(-500, 0, 1000, 300); s.restore();
  for (let i = 0; i < 320; i++) {
    const d = Math.pow(hash(i * 1.13), 1.9), y = 2 + d * (sh - 4), len = 26 + d * 260 * (.4 + hash(i * 4.2));
    const x = hash(i * 3.71) * W, nearSun = clamp(1 - Math.abs(x - sun.x) / (220 + d * 520));
    const light = hash(i * 9.3) > .55;
    s.strokeStyle = light ? `rgba(255,214,170,${.06 + nearSun * .3})` : `rgba(3,14,20,${.18 + d * .25})`;
    s.lineWidth = .8 + d * 3.2;
    s.beginPath(); s.moveTo(x - len / 2, y); s.quadraticCurveTo(x, y - .6 - d * 2, x + len / 2, y); s.stroke();
  }
  out.sea = sea;
  out.glints = [];
  for (let i = 0; i < 270; i++) {
    const d = Math.pow(hash(i * 1.71 + 3), 1.5), y = hz + 3 + d * (sh - 20), spread = 16 + d * 330;
    const off = (hash(i * 3.31) - .5) * 2 * spread * (.25 + hash(i * 5.1) * .75);
    out.glints.push({ x: sun.x + off, y, w: 1.4 + d * 15, h: .8 + d * 2.6, rate: 1.4 + hash(i * 7.9) * 3.4, phase: hash(i * 2.3) * TAU,
      b: (1 - Math.abs(off) / (spread + 1) * .75) * (.55 + d * .45) });
  }
  out.wreck = buildCrownWreck();
  out.puff = puffSprite('32,30,33', '226,150,108', -.2);
  out.vignette = vignetteSprite(.62, '3,10,14');
  return out;
}
// The Crown, broken and listing on the horizon. Waterline sits at y=170 in this sprite.
function buildCrownWreck() {
  const s = surface(560, 230), c = s.getContext('2d');
  // Bow raised at left, stern settling under the waterline at right.
  const hull = [[40, 173], [6, 121], [30, 118], [92, 115], [250, 118], [380, 124], [470, 136], [530, 156], [552, 173]];
  const spires = [[118, 116, 66, 12, 0], [152, 115, 30, 15, 0], [190, 116, 12, 12, 0], [226, 117, 2, 17, 0], [264, 118, 26, 13, 0], [302, 120, 54, 12, .32], [342, 123, 92, 11, 0], [384, 128, 104, 9, -.22]];
  const shape = (dx, dy) => {
    c.beginPath(); c.moveTo(hull[0][0] + dx, hull[0][1] + dy);
    for (const [x, y] of hull) c.lineTo(x + dx, y + dy);
    c.closePath(); c.fill();
    for (const [x, base, tip, w, lean] of spires) {
      c.save(); c.translate(x + dx, base + dy); c.rotate(lean);
      c.beginPath(); c.moveTo(-w, 2); c.lineTo(-w * .25, tip - base); c.lineTo(w * .35, tip - base + 12); c.lineTo(w, 2); c.closePath(); c.fill();
      c.restore();
    }
    c.fillRect(160 + dx, 97 + dy, 150, 22); c.fillRect(208 + dx, 76 + dy, 56, 26);
  };
  c.fillStyle = 'rgba(236,156,106,.62)'; shape(2.4, -.8);
  c.fillStyle = '#0c161c'; shape(0, 0);
  // Hull plating and a darker band toward the water.
  const band = c.createLinearGradient(0, 120, 0, 173);
  band.addColorStop(0, 'rgba(40,52,58,.0)'); band.addColorStop(1, 'rgba(2,6,8,.75)');
  c.globalCompositeOperation = 'source-atop'; c.fillStyle = band; c.fillRect(0, 110, 560, 70);
  c.strokeStyle = 'rgba(120,130,130,.12)'; c.lineWidth = 1;
  for (let x = 60; x < 520; x += 34) { c.beginPath(); c.moveTo(x, 124); c.lineTo(x + 4, 172); c.stroke(); }
  c.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 24; i++) {
    const x = 50 + hash(i * 3.3) * 450, y = 126 + hash(i * 5.7) * 32;
    c.fillStyle = hash(i * 2.2) > .5 ? 'rgba(255,150,70,.85)' : 'rgba(255,200,120,.5)';
    c.fillRect(x, y, 2 + hash(i) * 5, 1.5 + hash(i * 9) * 2);
  }
  c.fillStyle = 'rgba(255,214,170,.32)'; c.fillRect(30, 170, 522, 2);
  return { canvas: s, fires: [[148, 108, 1.1], [232, 92, 1.3], [318, 110, .9], [404, 126, .8], [70, 122, .6]], smoke: [[232, 86, 0], [318, 104, .37], [150, 102, .71]] };
}

function drawVictory(g, t, data, opts) {
  const L = opts.layers, { hz, sun } = V, id = data.shipId || 'kestrel';
  if(L.dusk){
    g.drawImage(L.sky,0,0);
    const p=easeOut(t/3.3);
    drawAircraft(g,id,lerp(1780,1196,p),lerp(1090,418,p)+Math.sin(t*.9)*6,lerp(3.4,1.8,p),-.42,.9,t);
    return;
  }
  const push = 1 + .05 * easeOut(t / 28);
  const cam = (f) => { const s = 1 + (push - 1) * f; g.setTransform(s, 0, 0, s, 1150 * (1 - s), 450 * (1 - s)); };
  cam(.25); g.globalAlpha = 1; g.drawImage(L.sky, 0, 0);
  g.globalCompositeOperation = 'lighter';
  g.save(); g.translate(sun.x, sun.y); g.rotate(Math.sin(t * .11) * .012); g.translate(-sun.x, -sun.y);
  g.globalAlpha = .62 + .2 * Math.sin(t * .37); g.drawImage(L.rays, 0, 0); g.restore();
  g.globalCompositeOperation = 'source-over';
  cam(.4); g.globalAlpha = 1; g.drawImage(L.clouds, -Math.min(420, t * 5.5), 0);
  cam(.6); g.drawImage(L.sea, 0, hz);
  // Sun glitter.
  g.globalCompositeOperation = 'lighter'; g.fillStyle = '#ffe9bf';
  for (const p of L.glints) {
    const a = Math.pow(Math.max(0, Math.sin(t * p.rate + p.phase)), 5) * p.b;
    if (a < .03) continue;
    g.globalAlpha = a; g.fillRect(p.x - p.w / 2 + Math.sin(t * .6 + p.phase) * 3, p.y, p.w, p.h);
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  // The Crown wreck, slowly settling.
  const wr = L.wreck, wx = 425, wy = hz - 170 + 6 + Math.min(16, t * .45), tilt = -.035 - Math.min(.02, t * .0008);
  g.save(); g.translate(wx + 280, wy + 170); g.rotate(tilt); g.translate(-280, -170);
  g.save(); g.beginPath(); g.rect(-40, -60, 640, 232); g.clip(); g.drawImage(wr.canvas, 0, 0); g.restore();
  g.globalCompositeOperation = 'lighter';
  const fire = glowSprite('255,138,58', 64);
  for (const [fx, fy, s] of wr.fires) {
    const f = .62 + .38 * Math.sin(t * 9 + fx) * Math.sin(t * 5.3 + fy);
    sprite(g, fire, fx, fy, 120 * s * (.85 + f * .3), 120 * s * (.85 + f * .3), .55 + f * .35);
    sprite(g, glowSprite('255,214,150', 32), fx, fy + 2, 22 * s, 18 * s, .8);
    g.fillStyle = '#ff9a54';
    for (let j = 0; j < 4; j++) { g.globalAlpha = (.16 + f * .1) * (1 - j * .2); g.fillRect(fx - (4 - j) * s + Math.sin(t * 3 + j + fx) * 2, 176 + j * 9, (8 - j * 1.4) * s, 3); }
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = .16;
  g.save(); g.translate(0, 245); g.scale(1, -.42); g.drawImage(wr.canvas, 0, 0, 560, 172, 0, 0, 560, 172); g.restore();
  g.globalAlpha = 1;
  for (const [sx, sy, seed] of wr.smoke) smokeColumn(g, L.puff, sx, sy, t, { seed, count: 26, rate: .05, rise: 470, wind: 360, grow: 150, alpha: .55 });
  g.restore();
  // Birds crossing the bright horizon.
  birds(g, t, 1650 - (t * 30 + 40) % 2200, 470 - Math.sin(t * .1) * 18, 'rgba(26,28,34,.9)');
  // Formation: hero banks past the camera, wingmen join behind.
  cam(1);
  const others = SHIP_ORDER.filter(s => s !== id);
  const wing = [
    { id: others[0], enter: 2.5, from: [1720, 780, 1.3], to: [1428, 578, .8], phase: 1.7 },
    { id: others[1], enter: 3.4, from: [1700, 920, 1.1], to: [1540, 676, .6], phase: 3.1 }
  ];
  const heroP = easeOut(t / 3.3);
  const hero = {
    x: lerp(1780, 1196, heroP) + Math.sin(t * .35) * 10 * smooth(t - 3),
    y: lerp(1090, 418, heroP) + Math.sin(t * .9) * 6 * smooth(t - 3),
    size: lerp(3.4, 1.8, heroP), rot: lerp(-.82, -.42, heroP) + Math.sin(t * .5) * .03,
    bank: 1 - .42 * Math.sin(clamp(t / 3.3) * Math.PI) - .05 * Math.sin(t * .5 + 1) * smooth(t - 3)
  };
  for (const w of wing) {
    const p = easeInOut((t - w.enter) / 2.6);
    if (p <= 0) continue;
    w.x = lerp(w.from[0], w.to[0], p) + Math.sin(t * .4 + w.phase) * 8; w.y = lerp(w.from[1], w.to[1], p) + Math.sin(t * .85 + w.phase) * 5;
    w.size = lerp(w.from[2], w.to[2], p); w.rot = -.42 + Math.sin(t * .5 + w.phase) * .025; w.bank = 1 - .3 * Math.sin(p * Math.PI);
    contrail(g, w.id, w.x, w.y, w.rot, w.size, 760, .3 * smooth(p * 3), t, w.phase);
  }
  contrail(g, id, hero.x, hero.y, hero.rot, hero.size, 1150, .42, t, 0);
  for (const w of wing) if (w.x !== undefined) drawAircraft(g, w.id, w.x, w.y, w.size, w.rot, w.bank, t, { alpha: .93 });
  drawAircraft(g, id, hero.x, hero.y, hero.size, hero.rot, hero.bank, t);
  // Sun glint as the hero rolls through the light, then occasional sparkles.
  const glint = Math.max(0, 1 - Math.abs(t - 2.05) / .55) + Math.max(0, 1 - Math.abs((t % 7.5) - 6.2) / .3) * .5 * smooth(t - 4);
  if (glint > .02) {
    g.globalCompositeOperation = 'lighter';
    const cx = hero.x + Math.sin(hero.rot) * 210 * hero.size * .16, cy = hero.y - Math.cos(hero.rot) * 210 * hero.size * .16;
    sprite(g, starSprite(), cx, cy, 190 * glint + 40, 190 * glint + 40, glint);
    if (!opts.reducedEffects) sprite(g, streakSprite(), cx, cy, 1250 * glint, 34, glint * .8);
    g.globalCompositeOperation = 'source-over';
  }
  // Lens ghosts from the sun.
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'lighter';
  const vx = 1350 - sun.x, vy = 240 - sun.y;
  for (const [k, size, rgb, a] of [[.32, 90, '255,206,150', .1], [.58, 28, '160,232,222', .2], [.86, 150, '255,190,140', .05], [1.22, 54, '150,220,230', .09]]) {
    sprite(g, glowSprite(rgb, 48), sun.x + vx * k, sun.y + vy * k, size, size, a * (.85 + .15 * Math.sin(t * .7 + k)));
  }
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1; g.drawImage(L.vignette, 0, 0);
}

// ---------------------------------------------------------------- defeat: storm night
const D = { hz: 634, fall: 2.3, impact: { x: 1165, y: 772 } };
function buildDefeat(stage) {
  const { hz } = D, out = {};
  const sky = surface(W, H), c = sky.getContext('2d');
  let gr = c.createLinearGradient(0, 0, 0, hz);
  gr.addColorStop(0, '#020509'); gr.addColorStop(.45, '#091018'); gr.addColorStop(.8, '#131a24'); gr.addColorStop(1, '#2a1d22');
  c.fillStyle = gr; c.fillRect(0, 0, W, hz + 1);
  const crown = stage === 3, lev = stage >= 4;
  c.save(); c.translate(crown ? 900 : lev ? 1000 : 1330, hz); c.scale(1, .2);
  let rg = c.createRadialGradient(0, 0, 0, 0, 0, 760);
  rg.addColorStop(0, crown ? 'rgba(200,52,58,.5)' : lev ? 'rgba(214,150,70,.4)' : 'rgba(206,92,54,.42)'); rg.addColorStop(1, 'rgba(160,60,50,0)');
  c.fillStyle = rg; c.fillRect(-900, -760, 1800, 760); c.restore();
  // Horizon silhouettes: the Crown intact, LEVIATHAN riding the typhoon, or the storm fleet.
  c.fillStyle = '#05080c';
  if (stage === 5) {
    // HALCYON hangs above the cloud horizon.
    poly(c, [[500,hz-100],[840,hz-160],[1000,hz-180],[1160,hz-160],[1500,hz-100],[1140,hz-117],[1000,hz-130],[860,hz-117]]);c.fill();
    for(let i=0;i<3;i++){c.fillStyle='#c99382';c.fillRect(910+i*80,hz-143,30,3);}
  } else if (lev) {
    // Super-dreadnought broadside-on: long low hull, stepped superstructure, turrets and funnels.
    poly(c, [[560, hz + 2], [600, hz - 22], [1420, hz - 26], [1470, hz - 8], [1490, hz + 2]]); c.fill();
    poly(c, [[860, hz - 22], [880, hz - 58], [930, hz - 64], [940, hz - 120], [968, hz - 126], [980, hz - 70], [1080, hz - 64], [1100, hz - 22]]); c.fill();
    c.fillRect(1010, hz - 104, 22, 44); c.fillRect(1048, hz - 96, 18, 36);
    for (const [x, d] of [[680, 1], [760, 1], [1190, -1], [1290, -1]]) {
      c.beginPath(); c.ellipse(x, hz - 28, 30, 12, 0, Math.PI, 0); c.fill();
      c.fillRect(d > 0 ? x - 78 : x + 18, hz - 34, 60, 4);
    }
    c.fillRect(952, hz - 170, 3, 50);
  } else if (crown) {
    poly(c, [[640, hz + 2], [670, hz - 30], [760, hz - 44], [1060, hz - 44], [1150, hz - 26], [1180, hz + 2]]); c.fill();
    for (let i = 0; i < 9; i++) {
      const x = 700 + i * 52, tip = hz - 90 - (i === 4 ? 150 : (4 - Math.abs(i - 4)) * 26) - hash(i) * 20, w = 14 + hash(i * 3) * 8;
      poly(c, [[x - w, hz - 40], [x - w * .2, tip], [x + w * .3, tip + 14], [x + w, hz - 40]]); c.fill();
    }
  } else {
    for (const [x, w, h2] of [[930, 170, 22], [1330, 240, 30], [1530, 120, 16]]) {
      poly(c, [[x - w / 2, hz + 1], [x - w / 2 + 12, hz - h2 * .5], [x - w * .1, hz - h2 * .55], [x - w * .05, hz - h2], [x + w * .08, hz - h2], [x + w * .12, hz - h2 * .55], [x + w / 2 - 8, hz - h2 * .45], [x + w / 2, hz + 1]]); c.fill();
      c.fillRect(x - 3, hz - h2 - 16, 2, 16);
    }
  }
  out.sky = sky; out.crown = crown; out.lev = lev;
  out.lights = crown ? [[700, hz - 160], [856, hz - 290], [1012, hz - 160], [760, hz - 44], [1060, hz - 44]]
    : lev ? [[954, hz - 172], [640, hz - 20], [880, hz - 60], [1090, hz - 60], [1440, hz - 22], [1220, hz - 24]]
    : [[930, hz - 38], [1330, hz - 46], [1530, hz - 32]];
  out.beam = { x: crown ? 912 : lev ? 960 : 1338, y: crown ? hz - 60 : lev ? hz - 124 : hz - 30 };
  out.fires = crown ? [[1240, hz - 4, .7], [1460, hz - 3, .5]] : lev ? [[420, hz - 4, .6], [1640, hz - 6, .5]] : [[930, hz - 14, .8], [610, hz - 4, .55], [1530, hz - 10, .5]];
  // Low storm ceiling, under-lit by distant fires, and its lightning-lit twin.
  const glowX = crown ? 900 / W : lev ? 1000 / W : 1330 / W, CH = hz + 30;
  const storm = cloudField({
    w: 480, h: 200, seed: 9, fx: 4.4, fy: 5.6, alpha: .96, bright: crown ? [122, 46, 52] : lev ? [92, 84, 58] : [118, 64, 50], flash: lev ? [255, 232, 186] : [178, 198, 226],
    coverage: (X, Y) => 1.08 - Y * .82 + (Y > .8 ? -(Y - .8) * 3 : 0),
    light: (X, Y) => [0, 2.6, .25 + .75 * Math.exp(-Math.abs(X - glowX) * 3.2) * Y],
    dark: (X, Y) => [lerp(7, 20, Y), lerp(10, 24, Y), lerp(16, 32, Y)]
  });
  out.clouds = upscale(storm.canvas, W + 80, CH, 1.5);
  out.lit = upscale(storm.flash, W + 80, CH, 2);
  // Sea.
  const sea = surface(W, H - hz), s = sea.getContext('2d'), sh = H - hz;
  gr = s.createLinearGradient(0, 0, 0, sh);
  if (lev) { gr.addColorStop(0, '#22221a'); gr.addColorStop(.06, '#0f1a16'); gr.addColorStop(1, '#030807'); }
  else { gr.addColorStop(0, '#241c22'); gr.addColorStop(.06, '#141c25'); gr.addColorStop(1, '#05090d'); }
  s.fillStyle = gr; s.fillRect(0, 0, W, sh);
  for (let i = 0; i < 300; i++) {
    const d = Math.pow(hash(i * 1.37 + 7), 1.7), y = 2 + d * (sh - 4), len = 20 + d * 200 * (.4 + hash(i * 4.6));
    const x = hash(i * 2.91) * W;
    s.strokeStyle = hash(i * 5.3) > .6 ? `rgba(70,92,110,${.12 + d * .14})` : `rgba(0,3,6,${.25 + d * .3})`;
    s.lineWidth = .8 + d * 3;
    s.beginPath(); s.moveTo(x - len / 2, y); s.quadraticCurveTo(x, y - 1 - d * 3, x + len / 2, y); s.stroke();
  }
  out.sea = sea;
  out.caps = [];
  for (let i = 0; i < 70; i++) { const d = Math.pow(hash(i * 3.9), 1.4); out.caps.push({ x: hash(i * 6.1) * W, y: hz + 4 + d * (sh - 10), w: 6 + d * 40, rate: .6 + hash(i * 2.4) * 1.4, phase: hash(i * 7.2) * TAU }); }
  out.rain = [rainTile(.7, 150, '160,182,200'), rainTile(1.25, 70, '186,204,220')].map(tile => ({ tile, pattern: null }));
  // Searchlight wedge.
  const beam = surface(1400, 140), b = beam.getContext('2d');
  gr = b.createLinearGradient(0, 0, 1400, 0);
  gr.addColorStop(0, 'rgba(214,228,242,.5)'); gr.addColorStop(.4, 'rgba(190,210,230,.2)'); gr.addColorStop(1, 'rgba(190,210,230,0)');
  b.fillStyle = gr; b.beginPath(); b.moveTo(0, 66); b.lineTo(1400, 0); b.lineTo(1400, 140); b.lineTo(0, 74); b.closePath(); b.fill();
  out.beamSprite = beam;
  out.smoke = puffSprite('40,38,42', '170,90,60', 1.6);
  out.trailPuff = puffSprite('58,56,62', '160,100,82', 1.4);
  out.vignette = vignetteSprite(.72, '1,4,8');
  out.bolts = new Map();
  return out;
}
function rainTile(scale, count, rgb) {
  const s = surface(420, 420), c = s.getContext('2d');
  c.strokeStyle = `rgb(${rgb})`; c.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = hash(i * 1.9 + scale) * 420, y = hash(i * 3.7 + scale) * 420, len = (16 + hash(i * 5.3) * 30) * scale;
    c.globalAlpha = .1 + hash(i * 7.1) * .28; c.lineWidth = (.7 + hash(i * 2.2) * .7) * scale;
    for (const [ox, oy] of [[0, 0], [-420, 0], [0, -420], [-420, -420], [420, 0], [0, 420]]) {
      c.beginPath(); c.moveTo(x + ox, y + oy); c.lineTo(x + ox - len * .22, y + oy + len); c.stroke();
    }
  }
  return s;
}
function boltPath(seed) {
  const pts = [], x0 = 260 + hash(seed * 3.1) * 1240, y0 = 150 + hash(seed * 5.7) * 140;
  const x1 = x0 + (hash(seed * 7.3) - .5) * 260, y1 = D.hz + 2;
  const segs = [[x0, y0], [x1, y1]];
  let line = segs;
  for (let level = 0, amp = 120; level < 6; level++, amp *= .55) {
    const next = [line[0]];
    for (let i = 1; i < line.length; i++) {
      const [ax, ay] = line[i - 1], [bx, by] = line[i];
      next.push([(ax + bx) / 2 + (hash(seed * 11 + level * 37 + i * 3.3) - .5) * amp, (ay + by) / 2], [bx, by]);
    }
    line = next;
  }
  pts.push(line);
  for (let b = 0; b < 3; b++) {
    const start = line[Math.floor((.2 + hash(seed * 13 + b) * .5) * line.length)], len = 6 + Math.floor(hash(seed * 17 + b) * 10);
    const branch = [start]; let [x, y] = start; const dir = hash(seed * 19 + b) > .5 ? 1 : -1;
    for (let i = 0; i < len; i++) { x += dir * (2 + hash(seed * 23 + b * 7 + i) * 9) + (hash(seed * 31 + b * 5 + i) - .5) * 18; y += 6 + hash(seed * 29 + i + b) * 13; branch.push([x, y]); }
    pts.push(branch);
  }
  return pts;
}
// Defeat lightning: one strike while the aircraft falls, one at impact, then a slow irregular cadence.
function defeatStrike(t) {
  const fixed = [.35, D.fall + .04];
  for (let i = 0; i < fixed.length; i++) { const age = t - fixed[i]; if (age >= 0 && age < .62) return { id: i, age }; }
  if (t < 6) return null;
  const period = 6.8, slot = Math.floor((t - 6) / period);
  for (const s of [slot, slot - 1]) {
    if (s < 0) continue;
    const age = t - (6 + s * period + hash(s * 4.7) * 3);
    if (age >= 0 && age < .62) return { id: 10 + s, age };
  }
  return null;
}
function flashCurve(age) { return age < .06 ? age / .06 : age < .11 ? .3 : age < .19 ? 1 : Math.max(0, 1 - (age - .19) / .43); }
// Nose-down spiral: the airframe rolls about its long axis as it falls.
function fallPose(p) {
  const S = { x: 1440, y: 30 }, I = D.impact, e = p * p * .55 + p * .45;
  return {
    x: lerp(S.x, I.x, e) + Math.sin(p * TAU * 1.05) * 80 * (1 - p),
    y: lerp(S.y, I.y, e), rot: Math.PI + .36 + Math.sin(p * TAU * 1.4) * .28, size: lerp(1.05, 1.2, p),
    bank: .42 + .58 * Math.abs(Math.cos(p * TAU * 1.7))
  };
}
function drawDefeat(g, t, data, opts) {
  const L = opts.layers, { hz, fall, impact } = D, id = data.shipId || 'kestrel';
  const push = 1 + .04 * easeOut(t / 30);
  const cam = f => { const s = 1 + (push - 1) * f; g.setTransform(s, 0, 0, s, 1100 * (1 - s), 520 * (1 - s)); };
  cam(.3); g.globalAlpha = 1; g.drawImage(L.sky, 0, 0);
  const strike = opts.still ? null : defeatStrike(t), flash = strike ? flashCurve(strike.age) : 0;
  const flashAlpha = opts.reducedEffects ? flash * .18 : flash * .8;
  // Searchlight sweeping the low ceiling.
  g.globalCompositeOperation = 'lighter';
  const sweep = -1.62 + Math.sin(t * .23) * .62;
  g.save(); g.translate(L.beam.x, L.beam.y); g.rotate(sweep); g.globalAlpha = .75; g.drawImage(L.beamSprite, 0, -70); g.restore();
  g.globalCompositeOperation = 'source-over';
  cam(.45); g.globalAlpha = 1; g.drawImage(L.clouds, Math.sin(t * .05) * 30 - 30, 0);
  if (flashAlpha > .01) {
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = flashAlpha; g.drawImage(L.lit, Math.sin(t * .05) * 30 - 30, 0);
    g.globalCompositeOperation = 'source-over';
  }
  if (strike && flash > .05) {
    if (!L.bolts.has(strike.id)) { if (L.bolts.size > 8) L.bolts.clear(); L.bolts.set(strike.id, boltPath(strike.id + 1)); }
    const paths = L.bolts.get(strike.id);
    g.lineJoin = 'round'; g.lineCap = 'round';
    for (const [w, a] of [[10, .16], [2.4, .95]]) {
      g.strokeStyle = L.lev ? 'rgb(255,242,212)' : 'rgb(222,236,255)'; g.lineWidth = w; g.globalAlpha = a * (opts.reducedEffects ? .55 : 1) * flash;
      paths.forEach((path, i) => { g.lineWidth = i ? w * .55 : w; g.beginPath(); g.moveTo(path[0][0], path[0][1]); for (const [x, y] of path) g.lineTo(x, y); g.stroke(); });
    }
    g.globalAlpha = 1;
  }
  cam(.6); g.drawImage(L.sea, 0, hz);
  // Running lights on the horizon ships.
  g.globalCompositeOperation = 'lighter';
  L.lights.forEach(([x, y], i) => { const on = Math.sin(t * 2.1 + i * 1.9) > .2; sprite(g, glowSprite(L.crown ? '255,70,60' : L.lev ? '255,206,130' : '255,170,110', 24), x, y, on ? 26 : 12, on ? 26 : 12, on ? .9 : .3); });
  for (const [x, y, s] of L.fires) {
    const f = .7 + .3 * Math.sin(t * 7 + x) * Math.sin(t * 4.3 + y);
    sprite(g, glowSprite('255,120,60', 48), x, y, 90 * s * f + 30, 40 * s + 10, .55);
    sprite(g, glowSprite('255,190,120', 16), x, y + 1, 14 * s + 4, 8 * s + 3, .9);
  }
  // Whitecaps catching the searchlight.
  g.fillStyle = '#a9bccb';
  for (const cap of L.caps) { const a = Math.pow(Math.max(0, Math.sin(t * cap.rate + cap.phase)), 6) * .35; if (a > .02) { g.globalAlpha = a; g.fillRect(cap.x, cap.y, cap.w, 1.5); } }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  // A second searchlight combs the water for the pilot.
  const poolX = 1090 + Math.sin(t * .31) * 380, poolY = 770 + Math.cos(t * .31) * 20;
  g.globalCompositeOperation = 'lighter';
  { const dx = poolX - L.beam.x, dy = poolY - L.beam.y, len = Math.hypot(dx, dy);
    g.save(); g.translate(L.beam.x, L.beam.y + 4); g.rotate(Math.atan2(dy, dx)); g.globalAlpha = .32; g.drawImage(L.beamSprite, 0, -len * .06, len * 1.15, len * .12); g.restore(); }
  sprite(g, glowSprite('190,210,228', 64), poolX, poolY, 420, 70, .38);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  cam(1);
  // Smoke trail laid down along the spiral.
  const end = Math.min(t, fall);
  for (let tau = 0; tau <= end; tau += .035) {
    const pose = fallPose(tau / fall), age = t - tau;
    const size = Math.min(190, 34 + age * 76), alpha = .58 * Math.exp(-age * .7) * Math.min(1, tau / .12);
    sprite(g, L.trailPuff, pose.x - age * 30 + Math.sin(tau * 9) * age * 6, pose.y - age * 12, size, size, alpha);
  }
  if (t < fall) {
    const pose = fallPose(t / fall);
    drawAircraft(g, id, pose.x, pose.y, pose.size, pose.rot, pose.bank, t, { fire: true, engineAlpha: .95 });
    g.globalCompositeOperation = 'lighter';
    const fl = .7 + .3 * Math.sin(t * 23);
    sprite(g, glowSprite('255,120,50', 48), pose.x - Math.sin(pose.rot) * 30, pose.y + Math.cos(pose.rot) * 30, 120 * fl, 120 * fl, .7);
    g.globalCompositeOperation = 'source-over';
  } else {
    const a = t - fall;
    g.globalCompositeOperation = 'lighter';
    sprite(g, glowSprite('255,214,170', 64), impact.x, impact.y, 260 + a * 140, 200, Math.max(0, .9 - a * 1.4));
    g.globalCompositeOperation = 'source-over';
    // Spray.
    g.fillStyle = '#cbd8e2';
    for (let i = 0; i < 48; i++) {
      const vx = (hash(i * 2.7) - .5) * 300, vy = -(260 + hash(i * 4.3) * 560), y = impact.y + vy * a + 490 * a * a;
      if (y > impact.y + 4) continue;
      g.globalAlpha = Math.max(0, .75 - a * .4); const r = 1.5 + hash(i * 6.1) * 3;
      g.fillRect(impact.x + vx * a, y, r, r * 1.6);
    }
    sprite(g, glowSprite('190,206,220', 64), impact.x, impact.y - 30 - a * 40, 120 + a * 300, 90 + a * 200, Math.max(0, .42 - a * .17));
    // Ripples.
    g.strokeStyle = '#8fa4b4'; g.lineWidth = 1.4;
    for (let k = 0; k < 4; k++) {
      if (a < k * .55) continue;
      const ak = (a - k * .55) % 3.4, rx = 12 + ak * 120;
      g.globalAlpha = .4 * (1 - ak / 3.4) * (a > 3.4 ? .5 : 1);
      g.beginPath(); g.ellipse(impact.x, impact.y + 4, rx, rx * .15, 0, 0, TAU); g.stroke();
    }
    // Flotsam and a burning slick.
    if (a > .45) {
      const show = smooth((a - .45) / .8);
      smokeColumn(g, L.smoke, impact.x + 22, impact.y - 4, t, { count: 22, rate: .05, rise: 330, wind: 210, grow: 130, alpha: .55 * show, seed: .2 });
      g.globalCompositeOperation = 'lighter';
      const f = .6 + .4 * Math.sin(t * 8.3) * Math.sin(t * 5.1);
      sprite(g, glowSprite('255,120,50', 48), impact.x + 22, impact.y - 6, 200 * (.8 + f * .3), 90, .7 * show);
      sprite(g, glowSprite('255,200,130', 24), impact.x + 22, impact.y - 4, 40 * (.8 + f * .4), 24, .9 * show);
      sprite(g, glowSprite('255,140,70', 32), impact.x + 22, impact.y + 34, 34, 70 * f + 20, .3 * show);
      sprite(g, glowSprite('255,120,60', 64), impact.x + 10, impact.y + 8, 380, 54, .16 * show);
      g.fillStyle = '#ffb070';
      for (let i = 0; i < 12; i++) {
        const life = ((t * .5 + i / 12) % 1), ex = impact.x + 22 + Math.sin(i * 2.3 + t) * 14 + life * 30, ey = impact.y - 10 - life * 150;
        g.globalAlpha = (1 - life) * .8 * show; g.fillRect(ex, ey, 2, 2);
      }
      g.globalCompositeOperation = 'source-over';
      const sink = Math.min(1, (a - .45) / 22), fin = 1 - sink * .7;
      g.save(); g.translate(impact.x - 26, impact.y + 6); g.rotate(-.38 - sink * .25); g.globalAlpha = show;
      g.fillStyle = 'rgba(255,150,90,.35)'; poly(g, [[-15, 0], [-3, -60 * fin], [10, -58 * fin], [18, 0]]); g.fill();
      g.fillStyle = '#0a1014'; poly(g, [[-16, 0], [-5, -58 * fin], [8, -57 * fin], [16, 0]]); g.fill();
      g.fillStyle = 'rgba(233,112,87,.6)'; g.fillRect(-2, -44 * fin, 6, 3);
      g.restore();
      g.fillStyle = '#080c10';
      for (let i = 0; i < 7; i++) {
        const x = impact.x + (hash(i * 3.3) - .5) * 190, y = impact.y + 4 + (hash(i * 5.9) - .5) * 22 + Math.sin(t * 1.6 + i) * 1.8;
        g.save(); g.translate(x, y); g.rotate((hash(i) - .5) * .6 + Math.sin(t * 1.2 + i) * .08); g.globalAlpha = show;
        const w = 6 + hash(i * 7.7) * 16; g.fillRect(-w / 2, -2, w, 3.5); g.fillStyle = 'rgba(150,170,186,.35)'; g.fillRect(-w / 2, -2, w, 1); g.fillStyle = '#080c10';
        g.restore();
      }
    }
  }
  // Rain sheets.
  g.setTransform(1, 0, 0, 1, 0, 0);
  L.rain.forEach((r, i) => {
    r.pattern ||= g.createPattern(r.tile, 'repeat');
    const speed = i ? 1500 : 950, ox = -(t * speed * .22) % 420, oy = (t * speed) % 420;
    g.save(); g.translate(ox, oy - 420); g.fillStyle = r.pattern; g.globalAlpha = i ? .75 : .55;
    g.fillRect(-ox, 420 - oy, W + 420, H + 420); g.restore();
  });
  if (flash > .01 && !opts.reducedEffects) { g.globalAlpha = flash * .1; g.fillStyle = '#b8c8e0'; g.fillRect(0, 0, W, H); }
  g.globalAlpha = 1; g.drawImage(L.vignette, 0, 0);
}

// ---------------------------------------------------------------- drill: dusk training range
const R = { hz: 606 };
function buildRange() {
  const { hz } = R, out = {};
  const sky = surface(W, H), c = sky.getContext('2d');
  let gr = c.createLinearGradient(0, 0, 0, hz);
  gr.addColorStop(0, '#0b1029'); gr.addColorStop(.4, '#22264c'); gr.addColorStop(.66, '#523f63'); gr.addColorStop(.86, '#b86d5e'); gr.addColorStop(1, '#eea474');
  c.fillStyle = gr; c.fillRect(0, 0, W, hz + 1);
  c.save(); c.translate(1180, hz); c.scale(1, .3);
  const rg = c.createRadialGradient(0, 0, 0, 0, 0, 900); rg.addColorStop(0, 'rgba(255,196,140,.75)'); rg.addColorStop(1, 'rgba(240,140,110,0)');
  c.fillStyle = rg; c.fillRect(-1000, -900, 2000, 900); c.restore();
  const dusk = cloudField({
    w: 420, h: 160, seed: 21, fx: 3.2, fy: 9, alpha: .85, bright: [236, 150, 132],
    coverage: (X, Y) => .55 - Math.abs(Y - .68) * 2.4,
    light: () => [0, 2.2, .9], dark: (X, Y) => [lerp(30, 70, Y), lerp(30, 50, Y), lerp(62, 82, Y)]
  });
  c.drawImage(upscale(dusk.canvas, W, hz, 1), 0, 0);
  for (let i = 0; i < 8; i++) {
    const y = 380 + hash(i * 3.3) * 170, x = hash(i * 5.1) * W, w = 140 + hash(i * 7.9) * 420;
    c.fillStyle = `rgba(231,150,136,${.12 + hash(i) * .2})`; c.beginPath(); c.ellipse(x, y + 2, w / 2, 3 + hash(i * 2) * 3, 0, 0, TAU); c.fill();
    c.fillStyle = `rgba(36,34,66,${.35 + hash(i * 4) * .25})`; c.beginPath(); c.ellipse(x - 10, y - 2, w / 2.2, 2.5 + hash(i * 6) * 3, 0, 0, TAU); c.fill();
  }
  // Range tower on the horizon.
  c.strokeStyle = '#121729'; c.fillStyle = '#121729'; c.lineWidth = 3;
  const tx = 1452;
  c.beginPath(); c.moveTo(tx - 26, hz); c.lineTo(tx - 8, hz - 120); c.moveTo(tx + 26, hz); c.lineTo(tx + 8, hz - 120); c.stroke();
  c.lineWidth = 1.4;
  for (let i = 0; i < 6; i++) { const y0 = hz - i * 20, y1 = hz - (i + 1) * 20, w0 = 26 - i * 3, w1 = 26 - (i + 1) * 3; c.beginPath(); c.moveTo(tx - w0, y0); c.lineTo(tx + w1, y1); c.moveTo(tx + w0, y0); c.lineTo(tx - w1, y1); c.stroke(); }
  c.fillRect(tx - 22, hz - 132, 44, 12); c.fillRect(tx - 1, hz - 176, 2, 44);
  c.fillRect(1380, hz - 6, 150, 7);
  out.sky = sky; out.beacon = [tx, hz - 178];
  out.stars = [];
  for (let i = 0; i < 90; i++) out.stars.push({ x: hash(i * 1.3) * W, y: Math.pow(hash(i * 2.9), 1.4) * 330, r: .6 + hash(i * 4.4) * 1.3, rate: .6 + hash(i * 6.6) * 2, phase: hash(i * 8.8) * TAU });
  const sea = surface(W, H - hz), s = sea.getContext('2d'), sh = H - hz;
  gr = s.createLinearGradient(0, 0, 0, sh);
  gr.addColorStop(0, '#9c6f6c'); gr.addColorStop(.06, '#4e4260'); gr.addColorStop(.25, '#232847'); gr.addColorStop(1, '#0c1024');
  s.fillStyle = gr; s.fillRect(0, 0, W, sh);
  // Perspective range grid.
  s.strokeStyle = 'rgba(122,216,205,.09)'; s.lineWidth = 1;
  const vp = 1060;
  for (let x = -2400; x <= 4600; x += 150) { s.beginPath(); s.moveTo(vp + (x - vp) * .02, 0); s.lineTo(x, sh); s.stroke(); }
  for (let z = 1; z < 22; z++) { const y = sh * (1 - 1 / (1 + z * z * .02)) ; s.globalAlpha = .9 - z * .03; s.beginPath(); s.moveTo(0, y); s.lineTo(W, y); s.stroke(); }
  s.globalAlpha = 1;
  for (let i = 0; i < 240; i++) {
    const d = Math.pow(hash(i * 1.53), 1.8), y = 2 + d * (sh - 4), len = 20 + d * 200, x = hash(i * 3.17) * W;
    s.strokeStyle = hash(i * 7.4) > .6 ? `rgba(240,170,140,${.05 + (1 - d) * .12})` : `rgba(4,6,18,${.2 + d * .2})`;
    s.lineWidth = .8 + d * 2.4; s.beginPath(); s.moveTo(x - len / 2, y); s.lineTo(x + len / 2, y); s.stroke();
  }
  out.sea = sea;
  out.buoys = [];
  for (let i = 0; i < 7; i++) { const z = 1 + i * .8; out.buoys.push({ x: lerp(1060, 1290, 1 / z), y: hz + (H - 30 - hz) / z, s: 2.3 / z }); }
  out.puff = puffSprite('120,134,140', '255,200,170', -.4);
  out.vignette = vignetteSprite(.6, '4,6,16');
  return out;
}
function drawRange(g, t, data, opts) {
  const L = opts.layers, { hz } = R, id = data.shipId || 'kestrel', cleared = data.outcome === 'victory';
  const push = 1 + .035 * easeOut(t / 30);
  const cam = f => { const s = 1 + (push - 1) * f; g.setTransform(s, 0, 0, s, 1150 * (1 - s), 450 * (1 - s)); };
  cam(.3); g.globalAlpha = 1; g.drawImage(L.sky, 0, 0);
  g.fillStyle = '#f2ecd8';
  for (const s of L.stars) { g.globalAlpha = .25 + .55 * Math.pow(.5 + .5 * Math.sin(t * s.rate + s.phase), 2); g.fillRect(s.x, s.y, s.r, s.r); }
  g.globalCompositeOperation = 'lighter';
  const beaconOn = (t % 1.6) < .22;
  sprite(g, glowSprite('255,80,70', 24), L.beacon[0], L.beacon[1], beaconOn ? 30 : 10, beaconOn ? 30 : 10, beaconOn ? 1 : .35);
  g.globalCompositeOperation = 'source-over';
  cam(.6); g.globalAlpha = 1; g.drawImage(L.sea, 0, hz);
  // Target buoys with a chasing light sequence.
  L.buoys.forEach((b, i) => {
    const s = b.s, bob = Math.sin(t * 1.4 + i) * 2 * s;
    g.fillStyle = '#1a1f33'; g.fillRect(b.x - 7 * s, b.y - 34 * s + bob, 14 * s, 30 * s);
    g.fillStyle = '#e08a4e'; g.fillRect(b.x - 7 * s, b.y - 26 * s + bob, 14 * s, 6 * s);
    g.fillStyle = '#d9d2c2'; g.fillRect(b.x - 7 * s, b.y - 16 * s + bob, 14 * s, 5 * s);
    g.fillStyle = 'rgba(240,190,150,.35)'; g.fillRect(b.x - 18 * s, b.y - 3 * s + bob, 36 * s, 2 * s);
    const on = ((t * 2 - i * .32) % 2.2 + 2.2) % 2.2 < .3;
    g.globalCompositeOperation = 'lighter';
    sprite(g, glowSprite('255,206,122', 24), b.x, b.y - 38 * s + bob, (on ? 46 : 14) * s + 4, (on ? 46 : 14) * s + 4, on ? 1 : .45);
    if (on) { g.globalAlpha = .3; g.fillStyle = '#ffcf7a'; g.fillRect(b.x - 1.5 * s, b.y + 2 * s, 3 * s, 40 * s); }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  });
  // Signal flare from the third buoy: green for a clear, red otherwise.
  const fb = L.buoys[1], ft = t - .8;
  if (ft > 0) {
    const rise = easeOut(ft / 1.5), fy = fb.y - 40 * fb.s - rise * 300 + Math.min(60, Math.max(0, ft - 1.5) * 3), fx = fb.x + rise * 26;
    smokeColumn(g, L.puff, fb.x + 4, fb.y - 40 * fb.s, t, { count: 18, rate: .055, rise: 260 * rise + 40, wind: 140, grow: 70, alpha: .28 * smooth(ft), seed: .4 });
    const rgb = cleared ? '120,236,170' : '255,104,84';
    g.globalCompositeOperation = 'lighter';
    const f = .8 + .2 * Math.sin(t * 19);
    sprite(g, glowSprite(rgb, 64), fx, fy, 170 * f, 170 * f, .75);
    sprite(g, glowSprite('255,255,240', 24), fx, fy, 16, 16, 1);
    sprite(g, glowSprite(rgb, 32), fx, hz + 70, 26, 150, .28);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  }
  // Lazy banking orbit over the range, with a contrail that follows the actual path.
  cam(1);
  const pose = tt => {
    const phi = tt * TAU / 16 + .6, x = 1110 + Math.cos(phi) * 175, y = 290 + Math.sin(phi) * 48;
    const dx = -Math.sin(phi) * 175, dy = Math.cos(phi) * 48;
    return { x, y, rot: Math.atan2(dy, dx) + Math.PI / 2, size: 1.2 + Math.sin(phi) * .22, bank: 1 - .38 * Math.abs(Math.cos(phi)) };
  };
  g.strokeStyle = 'rgb(255,236,220)'; g.lineCap = 'round';
  let prev = pose(t);
  for (let k = 1; k <= 34; k++) {
    const p = pose(t - k * .08), fade = 1 - k / 34;
    g.globalAlpha = .3 * fade * fade; g.lineWidth = 2 + k * .5;
    g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(p.x, p.y); g.stroke(); prev = p;
  }
  g.globalAlpha = 1;
  const now = pose(t);
  drawAircraft(g, id, now.x, now.y, now.size, now.rot, now.bank, t);
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.drawImage(L.vignette, 0, 0);
}

// ---------------------------------------------------------------- flight record
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
// Commendations earned on this flight. Unknown stats never award a ribbon.
export function commendations(data = {}) {
  const won = data.outcome === 'victory', drill = num(data.practiceStage) || 0, list = [];
  const hits = num(data.hitsTaken), lost = num(data.livesLost), grazes = num(data.grazes) || 0;
  const conversions = num(data.conversions) || 0, accuracy = num(data.accuracy) || 0, fired = num(data.shotsFired) || 0;
  const bosses = num(data.bossesDefeated) ?? (won ? (drill ? 1 : CAMPAIGN_STAGES) : Math.max(0, (num(data.stage) || 1) - 1));
  if (won && hits === 0) list.push({ tone: 'gold', name: 'UNTOUCHED', note: 'NO HITS TAKEN' });
  else if (won && lost === 0) list.push({ tone: 'cyan', name: 'IRON WING', note: 'ALL LIVES KEPT' });
  if (!drill && won && bosses >= CAMPAIGN_STAGES) list.push({ tone: 'gold', name: 'FLEET BREAKER', note: CAMPAIGN_STAGES + ' FLAGSHIPS DOWN' });
  if (grazes >= (drill ? 25 : 60)) list.push({ tone: 'cyan', name: 'GRAZE MASTER', note: grazes + ' GRAZES' });
  if (accuracy >= .75 && fired >= 80) list.push({ tone: 'paper', name: 'SHARPSHOOTER', note: Math.round(accuracy * 100) + '% ACCURACY' });
  if (conversions >= (drill ? 10 : 25)) list.push({ tone: 'cyan', name: 'WAKE RIDER', note: conversions + ' CONVERSIONS' });
  if ((num(data.reactorsBroken) || 0) >= 2) list.push({ tone: 'hot', name: 'REACTOR SAPPER', note: 'AURELIA DISARMED' });
  if (!drill && (num(data.kills) || 0) >= 300) list.push({ tone: 'paper', name: 'MERIDIAN ACE', note: num(data.kills) + ' KILLS' });
  if (!won && !drill && (num(data.stage) || 0) >= ACT_TWO_STAGE) list.push({ tone: 'hot', name: 'INTO THE TYPHOON', note: 'REACHED ACT II' });
  else if (!won && !drill && (num(data.stage) || 0) >= 3) list.push({ tone: 'hot', name: 'DEEP STRIKE', note: 'REACHED THE CROWN' });
  return list.slice(0, 5);
}
const GRADE_TONES = { S: 's', A: 'a', B: 'b', C: 'c', D: 'd' };

export class Cinema {
  constructor() {
    this.reducedEffects = false; this.data = {}; this.layers = {}; this.scene = 'victory';
    this.revealAt = 0; this.finalScore = '00000000'; this.counting = false; this.staticKey = ''; this.lastCode = '';
  }
  // Called by endSortie after the record text is filled in, before the curtain shows.
  // data is game.summary (outcome, shipId, score, grade, stage, practiceStage, ...); meta: { newBest }.
  start(data, meta = {}) {
    this.data = data || {};
    const drill = num(this.data.practiceStage) || 0, won = this.data.outcome === 'victory';
    this.scene = drill ? 'range' : won ? 'victory' : 'defeat';
    this.stage = Math.max(1, Math.min(CAMPAIGN_STAGES, num(this.data.stage) || 1));
    this.staticKey = ''; this.counting = false; this.revealAt = 0;
    const reached = actName(this.stage);
    const record = drill ? reached + ' DRILL' : won ? this.stage>=6?'ACT II CLEARED / ACT III AWAITS':'SECTOR '+String(this.stage).padStart(2,'0')+' CLEARED / ACT II CONTINUES' : this.stage >= ACT_TWO_STAGE ? 'REACHED ' + reached : reached + ' · SECTOR ' + String(this.stage).padStart(2, '0');
    for (const id of ['endEyebrow', 'endIntroLine']) {
      const node = $(id);
      // The shell caches its base copy; consecutive losses may retain our prior suffix.
      if (node) node.textContent = node.textContent.replace(/ \/ (?:REACHED ACT |ACT [IV]|BOTH ACTS CLEARED|SECTOR \d+ CLEARED).*$/, '') + ' / ' + record;
    }
    const screen = $('endScreen');
    if (screen) { screen.classList.remove('record-in'); screen.dataset.scene = this.scene; }
    const score = String(Math.max(0, Math.floor(num(this.data.score) || 0))).padStart(8, '0');
    this.finalScore = score;
    const scoreNode = $('endScore'); if (scoreNode) scoreNode.textContent = score;
    const grade = String(this.data.grade || '').toUpperCase().slice(0, 1);
    const lockup = $('gradeLockup'); if (lockup) lockup.dataset.grade = GRADE_TONES[grade] || 'none';
    const flag = $('endBestFlag'); if (flag) flag.hidden = !meta.newBest || !!drill;
    const medals = $('endMedals');
    if (medals) {
      medals.replaceChildren();
      const list = commendations(this.data);
      list.forEach((m, i) => {
        const li = document.createElement('li'); li.className = 'medal medal-' + m.tone; li.style.setProperty('--i', i);
        const ribbon = document.createElement('i'); ribbon.setAttribute('aria-hidden', 'true');
        const name = document.createElement('b'); name.textContent = m.name;
        const note = document.createElement('small'); note.textContent = m.note;
        li.append(ribbon, name, note); medals.append(li);
      });
      medals.hidden = !list.length;
    }
    this.lastCode = '';
  }
  // Called when the intro curtain is dismissed (timer or skip) and the record is revealed.
  reveal() {
    const screen = $('endScreen');
    if (screen) { screen.classList.remove('record-in'); void screen.offsetWidth; screen.classList.add('record-in'); }
    this.revealAt = performance.now();
    this.counting = !this.reducedEffects && !reducedMotionQuery?.matches && this.finalScore !== '00000000';
    if (this.counting) { const node = $('endScore'); if (node) node.textContent = '00000000'; }
  }
  layersFor(scene) {
    const key = scene === 'defeat' ? 'defeat' + (this.stage >= 4 ? 4 : this.stage >= 3 ? 3 : 1) : scene==='victory'?scene+this.stage:scene;
    return this.layers[key] ||= scene === 'victory' ? buildVictory(this.stage) : scene === 'defeat' ? buildDefeat(this.stage) : buildRange();
  }
  updateRecord() {
    if (!this.counting) return;
    const node = $('endScore'); if (!node) { this.counting = false; return; }
    const p = clamp((performance.now() - this.revealAt - 380) / 1250);
    const target = Number(this.finalScore), value = p >= 1 ? target : Math.floor(target * easeOut(p));
    node.textContent = String(value).padStart(8, '0');
    if (p >= 1) { node.textContent = this.finalScore; this.counting = false; }
  }
  // ~30 fps while the end screen is visible. t is seconds since the end screen opened.
  draw(t, data) {
    this.updateRecord();
    const canvas = $('cinemaCanvas'), g = canvas?.getContext('2d');
    if (!g) return;
    const d = data || this.data;
    const code = $('endTimecode');
    if (code) {
      const f = Math.floor(t * 24), text = 'T+' + String(Math.floor(f / 1440)).padStart(2, '0') + ':' + String(Math.floor(f / 24) % 60).padStart(2, '0') + ':' + String(f % 24).padStart(2, '0');
      if (text !== this.lastCode) { code.textContent = text; this.lastCode = text; }
    }
    // Reduced motion: one settled frame, redrawn only if the scene changes.
    const still = !!reducedMotionQuery?.matches;
    if (still) { const key = this.scene + this.stage + d.shipId; if (this.staticKey === key) return; this.staticKey = key; t = 9; }
    const opts = { layers: this.layersFor(this.scene), reducedEffects: this.reducedEffects || still, still };
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    if (this.scene === 'victory') drawVictory(g, t, d, opts);
    else if (this.scene === 'defeat') drawDefeat(g, t, d, opts);
    else drawRange(g, t, d, opts);
    g.restore();
  }
}
