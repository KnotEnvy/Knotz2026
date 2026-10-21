import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, relative, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const distRoot = resolve(projectRoot, 'dist');
if (dirname(distRoot) !== projectRoot || distRoot === projectRoot) {
  throw new Error('Refusing to build outside the project dist directory.');
}

const runtimeFiles = [
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
  'assets/brand/icon.svg',
  'assets/brand/icon-192.png',
  'assets/brand/apple-touch-icon.png',
  'assets/brand/og-image.png',
];
const allowedFiles = new Set(runtimeFiles);
const sources = new Map();
for (const file of runtimeFiles) sources.set(file, await readFile(join(projectRoot, file), /\.(webp|png)$/.test(file) ? undefined : 'utf8'));

function stripMarkedBlock(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || source.indexOf(startMarker, start + startMarker.length) >= 0) {
    throw new Error('Expected one complete ' + label + ' block.');
  }
  return source.slice(0, start) + source.slice(end + endMarker.length);
}

let html = sources.get('index.html');
html = stripMarkedBlock(html, '<!-- DEV FIXTURE NOTICE BEGIN -->', '<!-- DEV FIXTURE NOTICE END -->', 'fixture notice');
let main = sources.get('src/main.js');
main = stripMarkedBlock(main, '// DEV FIXTURE DISPLAY BEGIN', '// DEV FIXTURE DISPLAY END', 'fixture display');
main = stripMarkedBlock(main, '// DEV REVIEW HOOKS BEGIN', '// DEV REVIEW HOOKS END', 'review hooks');
const signature = 'function endSortie(summary, fixture=false){';
if (!main.includes(signature)) throw new Error('Unexpected endSortie signature.');
main = main.replace(signature, 'function endSortie(summary){');
if (/window\.__|__showEndFixture|fixtureNotice|\bfixture\b|PREVIEW FIXTURE|DEV REVIEW HOOKS|DEV FIXTURE/.test(main + html)) {
  throw new Error('Development fixture hooks remain in the public entry.');
}
sources.set('index.html', html);
sources.set('src/main.js', main);

function resolveRuntimeRef(ref, fromFile) {
  const cleaned = decodeURIComponent(ref.split(/[?#]/, 1)[0]);
  if (cleaned.startsWith('/') || cleaned.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(cleaned)) {
    throw new Error('Runtime references must be relative for GitHub Pages: ' + fromFile + ' -> ' + ref);
  }
  const base = fromFile.includes('/') ? dirname(fromFile) : '.';
  const resolved = normalize(join(base, cleaned)).replaceAll('\\', '/');
  if (resolved === '..' || resolved.startsWith('../') || resolved.startsWith('/')) {
    throw new Error('Runtime reference escapes the allowlist: ' + fromFile + ' -> ' + ref);
  }
  return resolved;
}

for (const [file, contents] of sources) {
  if (file.endsWith('.js')) {
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*import\s+.*?\s+from\s+['"]([^'"]+)['"]/);
      if (!match) continue;
      const specifier = match[1];
      if (!specifier.startsWith('.')) throw new Error('Non-local runtime import in ' + file + ': ' + specifier);
      const target = resolveRuntimeRef(specifier, file);
      if (!allowedFiles.has(target)) throw new Error('Runtime import is not allowlisted: ' + file + ' -> ' + target);
    }
    if (/\bimport\s*\(/.test(contents)) throw new Error('Dynamic imports need an explicit allowlist review: ' + file);
  }
}
for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
  const ref = match[1];
  if (/^(?:data:|#)/i.test(ref)) continue;
  if (!allowedFiles.has(resolveRuntimeRef(ref, 'index.html'))) throw new Error('HTML asset is not allowlisted: ' + ref);
}
for (const [file, contents] of sources) {
  if (!file.endsWith('.css')) continue;
  for (const match of contents.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) {
    const ref = match[1].trim();
    if (/^(?:data:|#)/i.test(ref)) continue;
    if (!allowedFiles.has(resolveRuntimeRef(ref, file))) throw new Error('CSS asset is not allowlisted: ' + file + ' -> ' + ref);
  }
}

await rm(distRoot, { recursive: true, force: true });
for (const [file, contents] of sources) {
  const destination = join(distRoot, file);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, contents, 'utf8');
}
async function listFiles(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) result.push(...await listFiles(join(directory, entry.name), path));
    else if (entry.isFile()) result.push(path);
    else throw new Error('Unexpected non-file in dist: ' + path);
  }
  return result;
}
const actual = (await listFiles(distRoot)).sort();
const expected = [...runtimeFiles].sort();
if (actual.length !== expected.length || actual.some((file, index) => file !== expected[index])) {
  throw new Error('Unexpected files in dist: ' + actual.join(', '));
}
console.log('Built ' + actual.length + ' allowlisted runtime files in ' + relative(projectRoot, distRoot) + '.');
