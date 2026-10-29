import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8'));
const playwright = process.env.PLAYWRIGHT_MODULE ? await import(process.env.PLAYWRIGHT_MODULE) : await import('playwright');
const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  const htmlPath = path.join(root, 'dist', 'LOT-Tracker-v' + release.version + '.html');
  if (process.env.LOT_TRACKER_BROWSER_INLINE === '1') await page.setContent(fs.readFileSync(htmlPath, 'utf8'));
  else await page.goto(pathToFileURL(htmlPath).href);
  await page.waitForFunction(() => !document.getElementById('pick-shared').disabled);
  const report = page.frameLocator('#report-pane');
  assert.equal(await report.locator('#analyze-btn').isEnabled(), false, 'analysis requires an input file');
  assert.equal(await report.locator('#template-input, #pick-template-btn, #template-status').count(), 0, 'the report format is built in without a template selection step');
  const csv = 'EVENT_NAME,DATE/TIME,QTY,STEP,EQP,LINE,OPERID,CHG_ITEM,CHG_VALS,QTY,COMMENT\n'
    + 'TrackOut,2026-09-20 10:00:00,10,M100,E1,L,U,,,0,\n'
    + 'TrackIn,2026-09-20 09:00:00,10,M100,E1,L,U,,,0,\n'
    + 'ISSUE_VMS1_VMDL,2026-09-20 08:00:00,10,M010,E0,L,U,,,10,\n';
  await page.locator('#shared-input').setInputFiles([{ name: 'T1A0000001.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }]);
  await page.waitForFunction(() => ['report','trace'].every(mode => document.getElementById(mode+'-pane').contentWindow.LOTTrackerPane.fileCount() === 1) && !document.getElementById('pick-shared').disabled);
  assert.equal(await report.locator('#analyze-btn').isEnabled(), true, 'adding MES input enables report analysis immediately');
  await report.locator('#analyze-btn').waitFor({state:'visible'});
  await page.waitForFunction(() => !document.getElementById('report-pane').contentDocument.getElementById('analyze-btn').disabled);
  await report.locator('#analyze-btn').click();
  await report.locator('#results table tbody tr').first().waitFor();
  assert.equal(await report.locator('#results table thead tr').first().locator('th').evaluateAll(headings => headings.reduce((sum, cell) => sum + cell.colSpan, 0)), 82, 'merged headings must cover all 82 report columns');
  assert.equal(await report.locator('#results table tbody tr').first().locator('td').count(), 82);
  assert.equal(await report.locator('#results table tbody tr').first().locator('td').nth(39).textContent(), '100.0%', 'yield shows the Excel 0.0% format on screen');
  assert.ok((await report.locator('.tsv-box').inputValue()).includes('\t100.0%'), 'copied text shows the same yield');
  assert.deepEqual(await report.locator('#results table thead tr').first().locator('th[colspan]').evaluateAll(headings => headings.map(cell => [cell.textContent, cell.colSpan])),
    [['SMT',6],['M033',9],['M087',9],['M100',9],['M111',6],['M130',9],['M160',9],['M164',9],['M165',9]], 'each v3 process heading covers its metrics and mutation columns');
  const firstHeading = await report.locator('thead tr').first().locator('th[colspan]').first().boundingBox();
  const secondHeading = await report.locator('thead tr').nth(1).locator('th').first().boundingBox();
  assert.ok(firstHeading.y + firstHeading.height <= secondHeading.y + 1, 'two header rows must not overlap');
  assert.equal(await report.locator('.diagnostic-details').evaluate(element => element.open), false, 'diagnostics should not displace report results');
  await page.screenshot({ path: path.join(root, 'dist', 'report-test.png'), fullPage: false });
  const reportDownloadPromise = page.waitForEvent('download');
  await report.locator('#save-excel-btn').click();
  const reportDownload = await reportDownloadPromise;
  assert.ok(reportDownload.suggestedFilename().includes('LOT Tracer Result'));
  await reportDownload.saveAs(path.join(root, 'dist', 'report-test.xlsx'));
  const trace = page.frameLocator('#trace-pane');
  assert.equal(await trace.locator('#lang-ko, #lang-vi').count(), 0, 'the shared header owns the only language control');
  const koStatus = await report.locator('#status').textContent();
  await page.locator('#lang-vi').click();
  assert.equal(await page.locator('#pick-shared').textContent(), 'Thêm tệp MES·PMS', 'the header follows the selected language');
  assert.equal(await page.locator('#lang-vi').getAttribute('aria-pressed'), 'true');
  assert.equal(await report.locator('#analyze-btn').textContent(), 'Phân tích · tạo báo cáo', 'the report pane follows the shared language');
  assert.equal(await report.locator('#status').textContent(), 'Đã lưu báo cáo Excel LOT Tracer Result vào thư mục tải xuống.', 'the current report status is redrawn in the new language');
  assert.equal(await report.locator('html').getAttribute('lang'), 'vi');
  assert.equal(await report.locator('#results table thead th').first().textContent(), 'PART NO', 'v3 report headings stay unchanged');
  assert.equal(await trace.locator('h2').first().textContent(), 'Truy vết LOT', 'the lineage pane follows the shared language');
  await page.locator('#lang-ko').click();
  assert.equal(await page.locator('#pick-shared').textContent(), 'MES·PMS 파일 추가');
  assert.equal(await report.locator('#analyze-btn').textContent(), '분석 · 보고서 만들기');
  assert.equal(await report.locator('#status').textContent(), koStatus, 'switching back restores the Korean status');
  assert.equal(await trace.locator('h2').first().textContent(), '계보 추적');
  await page.evaluate(() => {
    const w = document.getElementById('report-pane').contentWindow;
    w.__restoreExportBuiltin = w.LOTTrackerTemplate.exportBuiltin;
    w.LOTTrackerTemplate.exportBuiltin = () => Promise.reject(Error('UI export failure test'));
  });
  await report.locator('#analyze-btn').click();
  await page.waitForFunction(() => {
    const frame = document.getElementById('report-pane');
    return frame.contentDocument.getElementById('status').classList.contains('error') && !frame.contentWindow.LOTTrackerPane.isBusy();
  });
  assert.equal(await report.locator('#save-excel-btn').isEnabled(), false, 'a failed export must not leave a previous Excel downloadable');
  assert.equal(await report.locator('#results table').count(), 0, 'a failed export must not leave a previous table visible');
  assert.equal(await page.locator('#pick-shared').isEnabled(), true, 'an export failure must release shared input controls');
  await page.evaluate(() => {
    const w = document.getElementById('report-pane').contentWindow;
    w.LOTTrackerTemplate.exportBuiltin = w.__restoreExportBuiltin;
    delete w.__restoreExportBuiltin;
  });
  await report.locator('#analyze-btn').click();
  await report.locator('#results table tbody tr').first().waitFor();
  await page.waitForFunction(() => !document.getElementById('pick-shared').disabled);
  await report.locator('.diagnostic-details > summary').click();
  const validationDownloadPromise = page.waitForEvent('download');
  await report.locator('#save-validation-zip-btn').click();
  const validationDownload = await validationDownloadPromise;
  const validationPath = path.join(root, 'dist', 'validation-test.zip');
  await validationDownload.saveAs(validationPath);
  const archive = await page.evaluate(async bytes => {
    const w = document.getElementById('report-pane').contentWindow;
    const zip = await w.JSZip.loadAsync(new w.Uint8Array(bytes));
    const names = Object.keys(zip.files);
    const requests = await Promise.all(names.filter(name => name.endsWith('/request.json')).map(async name => JSON.parse(await zip.file(name).async('string'))));
    const logs = await Promise.all(names.filter(name => name.endsWith('/logs/analysis.jsonl')).map(name => zip.file(name).async('string')));
    return { names, requests, logs };
  }, Array.from(fs.readFileSync(validationPath)));
  assert.equal(archive.names.some(name => name.includes('/template/')), false, 'validation archives must not contain a reference workbook copy');
  assert.equal(archive.requests.length, 3, 'successful, failed, and recovered analyses must all be logged');
  assert.ok(archive.requests.every(request => request.reportFormat === 'LOT Tracer Result v3' && !('template' in request)), 'each run records only the built-in report format');
  assert.ok(archive.logs.every(log => log.includes('APPLY_BUILTIN_FORMAT') && !log.includes('APPLY_REFERENCE_TEMPLATE')), 'each export attempt uses the built-in format');
  await report.locator('.diagnostic-details > summary').click();
  const mutationCsv = csv + 'Split,2026-09-20 08:20:00,6,M087,,L,U,,UNLOADED-2,6,\n'
    + 'Split,2026-09-20 08:10:00,10,M087,,L,U,,UNLOADED-1,4,\n';
  await page.locator('#shared-input').setInputFiles([{ name: 'T1A0000001.csv', mimeType: 'text/csv', buffer: Buffer.from(mutationCsv) }]);
  await report.locator('#analyze-btn').click();
  await report.locator('#results table tbody tr').first().waitFor();
  await page.waitForFunction(() => !document.getElementById('pick-shared').disabled);
  assert.equal(await report.locator('tbody tr').count(), 2, 'separate mutations must occupy separate rows');
  assert.equal(await report.locator('tbody .report-identity-cell').count(), 1, 'one identity cell covers the mutation rows');
  assert.equal(await report.locator('tbody .report-identity-cell').evaluate(cell => cell.rowSpan), 2);
  assert.equal(await report.locator('tbody td').filter({ hasText: /^E1$/ }).evaluate(cell => cell.rowSpan), 2, 'shared observed process metrics must span the mutation rows');
  assert.ok((await report.locator('tbody tr').nth(0).textContent()).includes('UNLOADED-1'));
  assert.ok((await report.locator('tbody tr').nth(1).textContent()).includes('UNLOADED-2'));
  assert.equal(await report.locator('tbody tr').nth(1).locator('td').first().evaluate(cell => getComputedStyle(cell).position), 'static', 'a detail-row mutation cell must not inherit identity-column sticky positioning');
  await page.locator('#shared-input').setInputFiles([{ name: 'T1A0000001.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }]);
  await page.waitForFunction(() => !document.getElementById('pick-shared').disabled);
  await page.waitForFunction(() => document.getElementById('report-pane').contentDocument.getElementById('results').textContent === '', null, { timeout: 5000 }); // replacing mutation inputs must invalidate the old report
  await page.locator('#trace-tab').click();
  await trace.getByLabel('LOT ID', { exact: true }).fill('T1A0000001');
  await trace.locator('#trace-btn').click();
  await trace.locator('#result-card').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.getElementById('pick-shared').disabled);
  assert.ok(await trace.locator('.lineage-svg').count(), 'recovered process-axis lineage diagram must render');
  assert.equal(await trace.locator('.file-recognition').evaluate(element => element.open), false, 'file details should be collapsed');
  await page.screenshot({ path: path.join(root, 'dist', 'trace-test.png'), fullPage: false });
  const traceDownloadPromise = page.waitForEvent('download');
  await trace.locator('#save-excel-btn').click();
  const traceDownload = await traceDownloadPromise;
  await traceDownload.saveAs(path.join(root, 'dist', 'trace-test.xlsx'));
  await page.locator('#shared-input').setInputFiles([{ name: 'T1A0000001.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }]);
  await page.waitForFunction(() => !document.getElementById('pick-shared').disabled);
  await page.waitForFunction(() => document.getElementById('report-pane').contentDocument.getElementById('results').textContent === ''
    && getComputedStyle(document.getElementById('trace-pane').contentDocument.getElementById('result-card')).display === 'none', null, { timeout: 5000 }); // replacing inputs must invalidate old report and trace
  await page.locator('#clear-shared').click();
  assert.equal(await page.locator('#shared-files li').count(), 0);
  // Panes receive host commands by message, so their state follows a moment later.
  await page.waitForFunction(() => ['report', 'trace'].every(mode => document.getElementById(mode + '-pane').contentWindow.LOTTrackerPane.fileCount() === 0), null, { timeout: 5000 });
  assert.deepEqual(external, [], 'standalone HTML must make no external requests');
  assert.deepEqual(errors, [], 'all panes must run without page errors');
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const layout = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
      frame: document.getElementById('trace-pane').getBoundingClientRect().toJSON(),
      main: document.querySelector('main').getBoundingClientRect().toJSON()
    }));
    assert.ok(layout.width <= layout.viewport, 'host must fit viewport without horizontal scrolling');
    assert.ok(layout.frame.height > viewport.height / 2, 'workspace must retain room for results');
    assert.ok(layout.frame.y + layout.frame.height <= viewport.height + 1, 'workspace must fit viewport');
  }
  // A file viewer may run the HTML in a sandboxed frame with an opaque origin, where the
  // host cannot read pane windows directly. Every host/pane exchange must still work.
  const viewer = await browser.newPage({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
  const viewerErrors = [];
  viewer.on('pageerror', error => viewerErrors.push(error.message));
  viewer.on('console', message => { if (message.type() === 'error') viewerErrors.push(message.text()); });
  await viewer.setContent('<iframe id="viewer" sandbox="allow-scripts allow-downloads" style="width:1400px;height:980px;border:0"></iframe>');
  await viewer.evaluate(html => { document.getElementById('viewer').srcdoc = html; }, fs.readFileSync(htmlPath, 'utf8'));
  const sandboxed = viewer.frameLocator('#viewer');
  await sandboxed.locator('#pick-shared:not([disabled])').waitFor();
  // One M100 unit short: yield below 100% shows two decimals.
  const shortCsv = csv.replace('TrackOut,2026-09-20 10:00:00,10,M100', 'TrackOut,2026-09-20 10:00:00,9,M100');
  assert.notEqual(shortCsv, csv);
  await sandboxed.locator('#shared-input').setInputFiles([{ name: 'T1A0000001.csv', mimeType: 'text/csv', buffer: Buffer.from(shortCsv) }]);
  const sandboxedReport = sandboxed.frameLocator('#report-pane');
  await sandboxedReport.locator('#analyze-btn:not([disabled])').waitFor();
  await sandboxedReport.locator('#analyze-btn').click();
  await sandboxedReport.locator('#results table tbody tr').first().waitFor();
  assert.equal(await sandboxedReport.locator('#results table tbody tr').first().locator('td').nth(39).textContent(), '90.00%', 'yield below 100% shows two decimals');
  await sandboxed.locator('#lang-vi:not([disabled])').waitFor();
  await sandboxed.locator('#lang-vi').click();
  assert.equal(await sandboxedReport.locator('#analyze-btn').textContent(), 'Phân tích · tạo báo cáo', 'language reaches a sandboxed pane');
  const sandboxedDownload = viewer.waitForEvent('download');
  await sandboxedReport.locator('#save-excel-btn').click();
  assert.ok((await sandboxedDownload).suggestedFilename().includes('LOT Tracer Result'), 'a sandboxed viewer that allows downloads saves the report');
  const sandboxedTrace = sandboxed.frameLocator('#trace-pane');
  await sandboxed.locator('#trace-tab').click();
  await sandboxedTrace.getByLabel('LOT ID', { exact: true }).fill('T1A0000001');
  await sandboxedTrace.locator('#trace-btn').click();
  await sandboxedTrace.locator('#result-card').waitFor({ state: 'visible' });
  assert.deepEqual(viewerErrors, [], 'a sandboxed viewer must run without cross-frame errors');
  await viewer.close();
  console.log('PASS: shared files, built-in 82-column report, export failure recovery, validation archive, lineage diagram, Excel downloads, stale-result clearing, sandboxed viewer, no network/page errors');
} finally { await browser.close(); }
