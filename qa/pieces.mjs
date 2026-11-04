// Act II piece inspector. Loads every Act II sheet that exists through src/art.js in
// headless Chromium and draws each piece via drawPiece: native (at S), on-screen size,
// and the flash / wreck / outline bakes, with the cell outline and a pivot crosshair.
// Writes artifacts/pieces/<sheet>.png plus report.json (alpha extent per cell, and
// whether the art touches the cell edge, which usually means a registration problem).
//
//   node qa/pieces.mjs                  # serves the repo on 127.0.0.1:4381 (or next free)
//   PIECES_ASSETS=/dir node qa/pieces.mjs   # read act2-*.webp from another directory
// Chromium on this box needs LD_LIBRARY_PATH (see the README of the QA scripts).
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'artifacts/pieces');
const sheetDir = process.env.PIECES_ASSETS ? resolve(process.env.PIECES_ASSETS) : null;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png' };

const page = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000"><script type="module">
import { actTwoSheets, pieceRegions, loadActTwoArt, drawPiece, pieceInfo, pieceCanvas } from '/src/art.js';
window.__pieces = (async () => {
  const loaded = await loadActTwoArt(), sheets = {}, report = {};
  for (const sheet of loaded) {
    const ids = Object.keys(pieceRegions).filter(id => pieceRegions[id].sheet === sheet);
    // Card per piece: native cell (scaleMul = S) then on-screen clean/flash/wreck/outline.
    const cards = ids.map(id => {
      const info = pieceInfo(id), nw = info.w * info.s, nh = info.h * info.s;
      return { id, info, nw, nh, w: nw + 5 * (info.w + 24) + 24, h: Math.max(nh, info.h + 40) + 64 };
    });
    const maxW = 2600; let x = 0, y = 0, row = 0, width = 0;
    for (const card of cards) {
      if (x && x + card.w > maxW) { x = 0; y += row; row = 0; }
      card.x = x; card.y = y; x += card.w; row = Math.max(row, card.h); width = Math.max(width, x);
    }
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = y + row;
    const c = canvas.getContext('2d');
    c.fillStyle = '#0b1016'; c.fillRect(0, 0, canvas.width, canvas.height);
    c.strokeStyle = 'rgba(120,150,170,.12)'; c.lineWidth = 1;
    for (let gx = 0; gx < canvas.width; gx += 16) { c.beginPath(); c.moveTo(gx + .5, 0); c.lineTo(gx + .5, canvas.height); c.stroke(); }
    for (let gy = 0; gy < canvas.height; gy += 16) { c.beginPath(); c.moveTo(0, gy + .5); c.lineTo(canvas.width, gy + .5); c.stroke(); }
    const frame = (x0, y0, w, h, px, py) => {
      c.save(); c.strokeStyle = '#3fa7ff'; c.setLineDash([4, 3]); c.strokeRect(x0 + .5, y0 + .5, w - 1, h - 1); c.restore();
      return [x0 + px * w, y0 + py * h];
    };
    const cross = (cx, cy) => {
      c.save(); c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.7)';
      for (const color of ['rgba(0,0,0,.7)', '#ff3b6b']) {
        c.strokeStyle = color; c.beginPath(); c.moveTo(cx - 9, cy); c.lineTo(cx + 9, cy); c.moveTo(cx, cy - 9); c.lineTo(cx, cy + 9); c.stroke(); c.lineWidth = 1;
      }
      c.restore();
    };
    for (const card of cards) {
      const { id, info, nw, nh } = card, top = card.y + 40;
      c.fillStyle = '#e6eef2'; c.font = '600 15px monospace';
      c.fillText(id + (info.optional ? ' (opt)' : ''), card.x + 12, card.y + 20);
      c.fillStyle = '#8fa3ad'; c.font = '12px monospace';
      c.fillText('S' + info.s + '  ' + nw + 'x' + nh + ' src  ' + info.w.toFixed(1) + 'x' + info.h.toFixed(1) + ' px  pivot ' + info.px + ',' + info.py, card.x + 12, card.y + 34);
      let [cx, cy] = frame(card.x + 12, top, nw, nh, info.px, info.py);
      drawPiece(c, id, cx, cy, 0, info.s); cross(cx, cy);
      let ox = card.x + 12 + nw + 24;
      for (const variant of ['clean', 'flash', 'wreck', 'outline', 'rot45']) {
        [cx, cy] = frame(ox, top, info.w, info.h, info.px, info.py);
        if (variant === 'rot45') drawPiece(c, id, cx, cy, Math.PI / 4);
        else drawPiece(c, id, cx, cy, 0, 1, 1, variant);
        cross(cx, cy);
        c.fillStyle = '#8fa3ad'; c.fillText(variant, ox, top + info.h + 14); ox += info.w + 24;
      }
      // Alpha extent of the native cell.
      const cell = pieceCanvas(id), data = cell.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cell.width, cell.height).data;
      let l = cell.width, r = -1, t = cell.height, b = -1, edge = false;
      for (let yy = 0; yy < cell.height; yy++) for (let xx = 0; xx < cell.width; xx++) if (data[(yy * cell.width + xx) * 4 + 3] > 16) {
        l = Math.min(l, xx); r = Math.max(r, xx); t = Math.min(t, yy); b = Math.max(b, yy);
        if (!xx || !yy || xx === cell.width - 1 || yy === cell.height - 1) edge = true;
      }
      report[id] = r < 0 ? { sheet, empty: true } : { sheet, cell: [cell.width, cell.height], extent: [r - l + 1, b - t + 1], bbox: [l, t, r, b], touchesEdge: edge,
        artCenterOffset: [+(((l + r + 1) / 2) - info.px * cell.width).toFixed(1), +(((t + b + 1) / 2) - info.py * cell.height).toFixed(1)] };
    }
    sheets[sheet] = canvas.toDataURL('image/png');
  }
  return { loaded, missing: Object.keys(actTwoSheets).filter(s => !loaded.includes(s)), sheets, report };
})();
</script>`;

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/__pieces.html') { res.writeHead(200, { 'content-type': types['.html'] }); res.end(page); return; }
    const sheet = pathname.match(/^\/assets\/(act2-[a-z0-9-]+\.webp)$/);
    const path = sheet && sheetDir ? join(sheetDir, sheet[1]) : resolve(join(root, pathname.slice(1)));
    if (!(sheet && sheetDir) && !path.startsWith(root + sep)) throw new Error("Invalid path");
    if (!(await stat(path)).isFile()) throw new Error('Not a file');
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end('Not found'); }
});
let port = Number(process.env.PORT || 4381);
for (;;) {
  if (port === 5190) port++;
  try { await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', ok); }); break; }
  catch (error) { if (error.code !== 'EADDRINUSE' || port > 4400) throw error; port++; }
}

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROMIUM_EXECUTABLE || undefined });
  const tab = await browser.newPage();
  const errors = [];
  tab.on('pageerror', e => errors.push(e.message));
  tab.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') errors.push(m.text()); });
  await tab.goto(`http://127.0.0.1:${port}/__pieces.html`);
  const result = await tab.evaluate(() => window.__pieces);
  await mkdir(out, { recursive: true });
  for (const [sheet, url] of Object.entries(result.sheets)) {
    await writeFile(join(out, sheet + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote artifacts/pieces/' + sheet + '.png');
  }
  await writeFile(join(out, 'report.json'), JSON.stringify({ loaded: result.loaded, missing: result.missing, pieces: result.report }, null, 1));
  for (const [id, r] of Object.entries(result.report)) {
    if (r.empty) console.log('  EMPTY  ' + id);
    else if (r.touchesEdge) console.log('  EDGE   ' + id + ' art touches the cell edge (bbox ' + r.bbox.join(',') + ')');
  }
  if (result.missing.length) console.log('skipped (not present): ' + result.missing.join(', '));
  // Missing sheets 404 by design; anything else the page reports is a real error.
  const real = errors.filter(e => !/404|Failed to load resource/.test(e));
  if (real.length) { console.error(real.join('\n')); process.exitCode = 1; }
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
