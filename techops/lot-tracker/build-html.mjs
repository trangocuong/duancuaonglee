export function buildHtml(read, release) {
  const esc = source => source.replace(/<\/script/gi, '<\\/script');
  const strip = source => source.split('\n').filter(line => !/^\s*import\s.+from\s+['"].+['"];?\s*$/.test(line)).join('\n').replace(/^export\s+(function|const|async function)/gm, '$1');
  const panes = {};
  for (const mode of ['report', 'trace']) {
    const engine = mode === 'report'
      ? ['lot-step-report.js', 'lot-tracker.js', 'tracking.mjs'].map(name => strip(read('report/engine/' + name))).join('\n\n')
      : ['engine.js', 'report.js'].map(name => read('trace/src/' + name)).join('\n\n');
    const xlsx = mode === 'report' ? read('vendor/xlsx.full.min.cjs') : read('trace/vendor/xlsx-js-style.bundle.js');
    const app = mode === 'report' ? read('report/builtin-template.js') + '\n\n' + read('report/template.js') + '\n\n' + read('report/build/app.js') : read('trace/src/app.js');
    panes[mode] = read(mode + '/build/page-shell.html')
      .replaceAll('__VERSION__', release.version).replaceAll('__BUILT_AT__', release.releasedAt)
      .replace('__XLSX_SOURCE__', () => esc(xlsx))
      .replace('__JSZIP_SOURCE__', () => esc(read('trace/vendor/jszip.min.js')))
      .replace('__SHA256_SOURCE__', () => esc(read('trace/vendor/sha256.js')))
      .replace('__ENGINE_SOURCE__', () => esc(engine))
      .replace('__APP_SOURCE__', () => esc(app.replaceAll('__APP_VERSION__', release.version)));
  }
  return read('build/host.html').replaceAll('__VERSION__', release.version)
    .replace('__PANE_DATA__', () => JSON.stringify(panes).replace(/</g, '\\u003c'));
}
