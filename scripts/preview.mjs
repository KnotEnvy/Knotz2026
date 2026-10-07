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
]);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
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
