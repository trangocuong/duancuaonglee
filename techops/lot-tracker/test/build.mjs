import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHtml } from '../build-html.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const release = JSON.parse(read('release.json'));
const first = buildHtml(read, release);
assert.equal(first, buildHtml(read, release), 'identical sources must produce identical HTML');
assert.ok(!/__[A-Z_]+__/.test(first), 'all build placeholders must be replaced');
const panes = JSON.parse(first.match(/<script id="pane-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
assert.deepEqual(Object.keys(panes), ['report', 'trace']);
for (const [mode, html] of Object.entries(panes)) {
  assert.ok(html.includes("var APP_VERSION = '" + release.version + "'"), mode + ' must share release version');
  assert.ok(html.includes('window.LOTTrackerPane'), mode + ' must accept shared inputs');
  assert.ok(!/<(?:script|link|iframe)\b[^>]*(?:src|href)\s*=/i.test(html), mode + ' must contain all resources');
  for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new Function(script[1]);
}
console.log('PASS: reproducible single HTML, shared version/input contract, inline resources and script syntax');
