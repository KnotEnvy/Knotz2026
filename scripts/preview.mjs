import { createServer } from 'node:http';
import { readFile, access } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const distRoot = resolve(import.meta.dirname, '..', 'dist');
const port = Number(process.env.PORT || 4173);
const basePath = process.env.BASE_PATH || '/';
if (!/^\/(?:[A-Za-z0-9._-]+\/)*$/.test(basePath) || basePath.includes('/../') || basePath.includes('/./')) {
  throw new Error('BASE_PATH must be an absolute directory path, such as /Knotz2026/.');
}
const publicFiles = new Set([
  'index.html',
  'style.css',
  'src/main.js',
  'src/game.js',
  'src/render.js',
  'src/ui.js',
  'src/audio.js',
  'src/background.js',
  'src/art.js',
  'src/settings.js',
  'src/progress.js',
  'src/ships.js',
  'src/timeline.js',
  'src/frontend.js',
  'src/pause.js',
  'src/sequences.js',
  'src/cinema.js',
  'src/ambience.js',
  'src/sfx.js',
  'src/music.js',
  'src/soundscape.js',
  'css/ambience.css',
  'css/title.css',
  'css/pause.css',
  'css/end.css',
  'assets/aircraft-atlas.webp',
  'assets/pacific-coast.webp',
  'assets/storm-harbor.webp',
  'assets/crown-abyss.webp',
  'assets/enemy-atlas.webp',
  'assets/act2-s4-fleet.webp',
  'assets/act2-leviathan.webp',
  'assets/act2-s5-skyforge.webp',
  'assets/act2-halcyon.webp',
  'assets/act2-s6-meridian.webp',
  'assets/act2-sovereign.webp',
  'assets/brand/icon.svg',
  'assets/brand/icon-192.png',
  'assets/brand/apple-touch-icon.png',
  'assets/brand/og-image.png',
]);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

await access(join(distRoot, 'index.html')).catch(() => {
  throw new Error('dist/index.html is missing. Run npm run build first.');
});

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    if (basePath !== '/' && pathname === basePath.slice(0, -1)) {
      res.writeHead(301, { location: basePath + url.search });
      res.end();
      return;
    }
    if (!pathname.startsWith(basePath)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const requested = pathname.slice(basePath.length) || 'index.html';
    if (requested.includes('\\') || requested.includes('\0') || !publicFiles.has(requested)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const body = await readFile(join(distRoot, requested));
    res.writeHead(200, {
      'content-type': types[extname(requested)] || 'application/octet-stream',
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log('Static build preview at http://127.0.0.1:' + port + basePath));
