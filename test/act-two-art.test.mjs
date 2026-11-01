import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pieceRegions, actTwoSheets, hasPiece, drawPiece, pieceInfo, pieceCanvas, loadActTwoArt } from '../src/art.js';

// Sheet sizes as written in docs/design/act-two-art.md §5, kept independent of art.js.
const CONTRACT_SHEETS = {
  'act2-s4-fleet': [2048, 1024], 'act2-leviathan': [2048, 1024], 'act2-s5-skyforge': [2048, 1024],
  'act2-halcyon': [2048, 640], 'act2-s6-meridian': [2048, 640], 'act2-sovereign': [2048, 640],
};
const REQUIRED = ['hull-destroyer', 'hull-cruiser', 'scavenger', 'mine', 'torpedo', 'turret-head-triple', 'turret-head-fan',
  'turret-head-flak', 'turret-head-broadside', 'turret-head-void', 'turret-base', 'turret-head-wreck', 'leviathan-hull',
  'leviathan-wreck', 'core-rotor-a', 'core-rotor-b', 'core-armor-l', 'core-armor-r', 'battery-block-l', 'battery-block-r',
  'battery-barrels-l', 'battery-barrels-r', 'foundry-large', 'foundry-small', 'box-bomber', 'sky-ace', 'drone',
  'tail-gunner-head', 'bay-closed', 'bay-open', 'bay-dead', 'sky-turret-head-void', 'halcyon-hull', 'halcyon-broken',
  'eye-closed', 'eye-open', 'eye-ring', 'lattice-emitter', 'gate-ring', 'station-turret-base', 'station-turret-head-mix',
  'station-turret-head-shard', 'station-turret-head-void', 'satellite', 'satellite-arm', 'sovereign-hull', 'sovereign-core',
  'pod-socket', 'pod-power', 'pod-escort', 'pod-sidewinder', 'pod-generic'];

test('Act II sheets match the contract', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(actTwoSheets).map(([k, v]) => [k, [...v]])), CONTRACT_SHEETS);
});

test('every piece rect is a positive, integral cell inside its sheet', () => {
  for (const [id, r] of Object.entries(pieceRegions)) {
    const sheet = CONTRACT_SHEETS[r.sheet];
    assert.ok(sheet, id + ' uses unknown sheet ' + r.sheet);
    for (const v of [r.x, r.y, r.w, r.h]) assert.ok(Number.isInteger(v), id + ' rect must be integral');
    assert.ok(r.w > 0 && r.h > 0, id + ' must have a positive size');
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= sheet[0] && r.y + r.h <= sheet[1], id + ' must lie inside ' + r.sheet);
    assert.ok([2, 3, 4].includes(r.s), id + ' scale S');
    assert.ok(r.px >= 0 && r.px <= 1 && r.py >= 0 && r.py <= 1, id + ' pivot must be in 0..1');
    assert.equal(typeof r.optional, 'boolean');
  }
});

test('piece cells do not overlap within a sheet', () => {
  const list = Object.entries(pieceRegions);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const [a, ra] = list[i], [b, rb] = list[j];
    if (ra.sheet !== rb.sheet) continue;
    const overlap = ra.x < rb.x + rb.w && rb.x < ra.x + ra.w && ra.y < rb.y + rb.h && rb.y < ra.y + ra.h;
    assert.ok(!overlap, a + ' overlaps ' + b);
  }
});

test('all required pieces exist and ids are unique kebab-case', () => {
  const ids = Object.keys(pieceRegions);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  for (const id of REQUIRED) {
    assert.ok(pieceRegions[id], 'missing ' + id);
    assert.equal(pieceRegions[id].optional, false, id + ' is required by the contract');
  }
  for (const id of ['battery-barrels-r', 'battery-barrels-l', 'pod-power']) assert.notDeepEqual([pieceRegions[id].px, pieceRegions[id].py], [.5, .5]);
});

test('every piece id appears in the contract §5 tables', async () => {
  const doc = await readFile(new URL('../docs/design/act-two-art.md', import.meta.url), 'utf8');
  const section = doc.slice(doc.indexOf('## 5.'), doc.indexOf('## 6.'));
  for (const id of Object.keys(pieceRegions)) {
    // Grouped rows: `battery-block-l` / `battery-barrels-l`, `-shard`, `pod-power` / `pod-escort`, `scorch-1..3`.
    const tail = id.split('-').pop();
    const listed = section.includes('`' + id + '`') || section.includes('`-' + tail + '`') ||
      (/^scorch-[123]$/.test(id) && section.includes('`scorch-1..3`'));
    assert.ok(listed, id + ' is not in the contract');
  }
});

test('pieces are inert without a DOM: no sheets, logical info still available', async () => {
  assert.deepEqual(await loadActTwoArt(), []);
  assert.equal(hasPiece('hull-destroyer'), false);
  assert.equal(drawPiece({}, 'hull-destroyer', 0, 0), false);
  assert.equal(pieceCanvas('sovereign-hull'), null);
  assert.deepEqual(pieceInfo('leviathan-hull'), { sheet: 'act2-leviathan', w: 512, h: 256, s: 2, px: .5, py: .5, optional: false, loaded: false });
  assert.equal(pieceInfo('nope'), null);
});
