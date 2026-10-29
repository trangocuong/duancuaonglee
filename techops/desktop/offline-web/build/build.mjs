import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..'); // desktop/offline-web

const release = JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8'));
const VERSION = release.version;
const BUILT_AT = release.releasedAt; // Stable release date makes identical sources byte-reproducible.

// Escape any literal "</script" that appears inside JS string/template literals in the
// source (e.g. the HTML-rendering helpers build strings containing "<script>...</script>").
// Left as-is, the browser's HTML parser would end our wrapping <script> tag right there.
function escapeInlineScriptClose(source) {
  return source.replace(/<\/script/gi, '<\\/script');
}

function stripModuleSyntax(source) {
  return escapeInlineScriptClose(
    source
      .split('\n')
      .filter(line => !/^\s*import\s.+from\s+['"].+['"];?\s*$/.test(line))
      .join('\n')
      .replace(/^export\s+(function|const|async function)/gm, '$1')
  );
}

function readEngineFile(name) {
  const p = path.join(root, 'engine', name);
  return stripModuleSyntax(fs.readFileSync(p, 'utf8'));
}

const vendorDir = path.join(root, 'vendor');
const xlsxSource = escapeInlineScriptClose(fs.readFileSync(path.join(vendorDir, 'xlsx.full.min.js'), 'utf8'));
const jszipSource = escapeInlineScriptClose(fs.readFileSync(path.join(vendorDir, 'jszip.min.js'), 'utf8'));
const sha256Source = escapeInlineScriptClose(fs.readFileSync(path.join(vendorDir, 'sha256.js'), 'utf8'));
const engineSource = [
  '/* ---- lot-step-report.js ---- */',
  readEngineFile('lot-step-report.js'),
  '/* ---- lot-tracker.js ---- */',
  readEngineFile('lot-tracker.js'),
  '/* ---- tracking.mjs ---- */',
  readEngineFile('tracking.mjs'),
].join('\n\n');
const appSource = escapeInlineScriptClose(fs.readFileSync(path.join(root, 'build', 'app.js'), 'utf8').replaceAll('__APP_VERSION__', VERSION));

let shell = fs.readFileSync(path.join(root, 'build', 'page-shell.html'), 'utf8');
shell = shell
  .replaceAll('__VERSION__', VERSION)
  .replace('__BUILT_AT__', BUILT_AT)
  .replace('__XLSX_SOURCE__', () => xlsxSource)
  .replace('__SHA256_SOURCE__', () => sha256Source)
  .replace('__JSZIP_SOURCE__', () => jszipSource)
  .replace('__ENGINE_SOURCE__', () => engineSource)
  .replace('__APP_SOURCE__', () => appSource);

const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `LOT-Tracker-Offline-Web-v${VERSION}.html`);
fs.writeFileSync(outFile, shell);
console.log('Built:', outFile, `(${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
