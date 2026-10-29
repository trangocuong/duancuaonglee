import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { read, utils } from 'xlsx/xlsx.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const release = JSON.parse(await fs.readFile(new URL('./release.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) });
const output = path.resolve('outputs/offline-web-e2e'); await fs.mkdir(output, { recursive: true });
const context = await browser.newContext({ acceptDownloads: true, offline: true });
const page = await context.newPage();
const errors = [], network = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
const payload = (name, text) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
const headers = 'EVENT_NAME,DATE/TIME,QTY,STEP,EQP,LINE,OPERID,CHG_ITEM,CHG_VALS,QTY,COMMENT\n';
const child = payload('CHILD-001.csv', headers + 'TrackOut,2026-09-20 12:00,100,M033,E1,L,U,,,0,\nTrackOut,2026-09-20 11:00,100,M015,E1,L,U,,,0,\nTrackIn,2026-09-20 10:30,100,M010,E1,L,U,,,0,\nSplit,2026-09-20 10:00,100,M010,,L,U,,PARENT-999,100,\n');
const direct = payload('PARENT-999.csv', 'LOT_ID,PROD_ID,MERGE_LOT\nPARENT-999,PART-TEST,CHILD-001\n');
async function analyze(files, reset = true) {
  if (reset) await page.locator('#clear-btn').click();
  await page.locator('#file-input').setInputFiles(files);
  await page.locator('#analyze-btn').click();
  await page.waitForFunction(() => !document.getElementById('analyze-btn').disabled);
}
async function archive(label) {
  const downloadEvent = page.waitForEvent('download'); await page.locator('#save-validation-zip-btn').click();
  const download = await downloadEvent; const target = path.join(output, label + '.zip'); await download.saveAs(target);
  const bytes = await fs.readFile(target);
  return page.evaluate(async data => {
    const zip = await JSZip.loadAsync(new Uint8Array(data));
    const result = {};
    for (const [name, entry] of Object.entries(zip.files)) if (!entry.dir) {
      result[name] = /\.(json|jsonl|txt|csv)$/.test(name) ? await entry.async('string') : { size: (await entry.async('uint8array')).length };
    }
    return result;
  }, [...bytes]);
}
try {
  await page.goto(new URL(`./dist/LOT-Tracker-Offline-Web-v${release.version}.html`, import.meta.url).href);
  assert.equal(await page.evaluate(() => XLSX.version), '0.20.3');
  assert.equal(await page.evaluate(() => sha256Hex(new TextEncoder().encode('abc'))), createHash('sha256').update('abc').digest('hex'));
  await analyze([child, direct]);
  assert.match(await page.locator('#status').innerText(), /1개 LOT 분석 완료/);
  assert.match(await page.locator('#results').innerText(), /PART-TEST/);
  assert.deepEqual(await page.locator('.panel.active table thead tr').first().locator('th').allInnerTexts(), ['PART NO', 'LOT NO', 'FAB', 'TIER', 'OPT', 'M010-M015', '', '', '', '', '', 'M033', '', '', '', '', '', 'SPLIT LOT', 'M050', '', '', '', '', '', 'M055 step1', '', '', '', '', '', 'M055 step2', '', '', '', '', '', 'M060', '', '', '', '', '']);
  assert.equal(await page.getByRole('button', { name: '기존 고정양식 (M121부터)', exact: true }).count(), 0);
  assert.deepEqual(await page.locator('input[name="report-step"]').evaluateAll(boxes => boxes.map(box => ({ value: box.value, checked: box.checked }))), [
    { value: 'SMT', checked: true }, { value: 'M033', checked: true },
  ]);
  await page.locator('input[name="report-step"][value="M033"]').uncheck();
  await page.getByRole('button', { name: '선택 적용', exact: true }).click();
  await page.getByRole('button', { name: '공정별 보고서', exact: true }).click();
  assert.deepEqual(await page.locator('.panel.active table thead tr').first().locator('th').allInnerTexts(), ['PART NO', 'LOT NO', 'Status', 'SMT', '', '', '', '', '']);
  assert.match(await page.locator('#status').innerText(), /1개 공정/);
  await page.getByRole('button', { name: '전체 해제', exact: true }).click();
  await page.getByRole('button', { name: '선택 적용', exact: true }).click();
  assert.match(await page.locator('#status').innerText(), /하나 이상 선택/);
  await page.getByRole('button', { name: '전체 선택', exact: true }).click();
  await page.getByRole('button', { name: '선택 적용', exact: true }).click();
  const excelEvent = page.waitForEvent('download'); await page.locator('#save-excel-btn').click();
  const excelDownload = await excelEvent; const excelPath = path.join(output, 'lot-report.xlsx'); await excelDownload.saveAs(excelPath);
  const excelBook = read(await fs.readFile(excelPath), { type: 'buffer' });
  assert.equal(excelBook.SheetNames[0], 'LOT Fixed Report');
  const fixedRows = utils.sheet_to_json(excelBook.Sheets['LOT Fixed Report'], { header: 1, raw: false, defval: '' });
  assert.deepEqual(fixedRows[0].slice(0, 18), ['PART NO', 'LOT NO', 'FAB', 'TIER', 'OPT', 'M010-M015', '', '', '', '', '', 'M033', '', '', '', '', '', 'SPLIT LOT']);
  const normal = await archive('normal');
  const first = JSON.parse(normal['session-summary.json']).runs[0];
  const prefix = `runs/${first.id}/`;
  assert.equal(normal[prefix + 'inputs/CHILD-001.csv'], child.buffer.toString());
  const request = JSON.parse(normal[prefix + 'request.json']);
  assert.equal(request.files[0].sha256, createHash('sha256').update(child.buffer).digest('hex'));
  assert.ok(normal[prefix + 'outputs/LOT 공정별 보고서.xlsx'].size > 0);
  assert.equal(normal[prefix + 'outputs/LOT Tracker 기존 고정양식.xlsx'], undefined);
  assert.deepEqual(JSON.parse(normal[prefix + 'status.json']).selectedSteps, ['SMT', 'M033']);
  assert.equal(JSON.parse(normal[prefix + 'outputs/summaries.json'])[0].runLinkType, 'direct');
  await analyze([payload('INDIRECT.csv', child.buffer.toString().replace('PARENT-999', 'VIA-LOT')), payload('RUN.csv', 'LOT_ID,PROD_ID,MERGE_LOT\nRUN,PART-I,VIA-LOT\n')]);
  await page.getByRole('button', { name: 'SMT RUNID 추적', exact: true }).click();
  assert.match(await page.locator('#results').innerText(), /간접 연결 확인됨/);
  // XLS map with multiple merge targets must be classified before the old event/map parser.
  const xls = await page.evaluate(() => {
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['LOT_ID','PROD_ID','MERGE_LOT'],['PARENT-999','PART-X','CHILD-001'],['PARENT-999','PART-X','OTHER-LOT']]), 'Sheet1');
    return [...new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'biff8' }))];
  });
  await analyze([child, { name: 'PARENT-999.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from(xls) }]);
  assert.match(await page.locator('#status').innerText(), /분석 완료/);
  assert.match(await page.locator('#results').innerText(), /PART-X/);
  const smtInput = payload('11111111-2222-4333-8444-555555555555.csv', headers
    + 'Terminated,2026-09-21 10:03,0,M010,,L,U,,,0,\n'
    + 'Split,2026-09-21 10:02,0,M010,,L,U,,HABC020639,3,\n'
    + 'Split,2026-09-21 10:01,3,M010,,L,U,,HABC010639,3,\n'
    + 'ISSUE_VMS1_VMDL,2026-09-21 10:00,6,M010,,L,U,,,0,\n');
  await analyze([smtInput]);
  assert.match(await page.locator('#status').innerText(), /경고 1건/);
  assert.match(await page.locator('#results').innerText(), /HABC000639.*SMT 투입 RUN ID로 인식/s);
  await page.getByRole('button', { name: '추가 파일 요청', exact: true }).click();
  assert.match(await page.locator('#results').innerText(), /PMS에서 RUN ID/);
  const smtArchive = await archive('smt-input-run');
  const smtSession = JSON.parse(smtArchive['session-summary.json']);
  const smtRun = smtSession.runs.at(-1);
  assert.deepEqual(JSON.parse(smtArchive[`runs/${smtRun.id}/status.json`]).selectedSteps, ['SMT']);
  assert.equal(JSON.parse(smtArchive[`runs/${smtRun.id}/outputs/summaries.json`])[0].smtInputRun, true);
  assert.ok(smtArchive[`runs/${smtRun.id}/outputs/LOT 공정별 보고서.xlsx`].size > 0);
  await page.screenshot({ path: path.join(output, 'app.png'), fullPage: true });
  await analyze([payload('invalid.csv', 'bad,header\n1,2\n')]);
  assert.match(await page.locator('#status').innerText(), /오류:/);
  assert.equal(await page.locator('#save-excel-btn').isDisabled(), true);
  const failed = await archive('with-error');
  const errorRun = JSON.parse(failed['session-summary.json']).runs.find(run => run.status === 'error');
  const failStatus = JSON.parse(failed[`runs/${errorRun.id}/status.json`]);
  assert.equal(failStatus.status, 'error'); assert.ok(failStatus.errorStack); assert.ok(failed[`runs/${errorRun.id}/inputs/invalid.csv`]);
  for (let i = 0; i < 3; i++) await analyze([child, direct]);
  const pruned = await archive('eight-runs');
  const session = JSON.parse(pruned['session-summary.json']); assert.equal(session.runCount, 8);
  assert.equal(session.runs.filter(r => r.hasFullCopy).length, 5);
  assert.ok(pruned[`runs/${session.runs[0].id}/NOTE.txt`]);
  assert.equal(pruned[`runs/${session.runs[0].id}/inputs/CHILD-001.csv`], undefined);
  assert.ok(pruned[`runs/${session.runs.at(-1).id}/outputs/summaries.json`]);
  assert.equal(session.appVersion, release.version);
  if (process.env.LOT_TRACKER_REVIEW_DIR) {
    const inputs = path.join(process.env.LOT_TRACKER_REVIEW_DIR, 'inputs');
    const files = [];
    for (const dir of await fs.readdir(inputs)) for (const name of await fs.readdir(path.join(inputs, dir))) files.push(path.join(inputs, dir, name));
    await analyze(files);
    assert.doesNotMatch(await page.locator('#status').innerText(), /오류:/);
    await archive('private-review');
    console.log('Private input replay:', files.length, 'files;', await page.locator('#status').innerText());
  }
  assert.deepEqual(errors, []); assert.deepEqual(network, []);
  console.log('PASS: file:// offline browser, direct/indirect and M010 SMT input RUNID, PMS request, multi-merge XLS, SHA-256, Excel+ZIP contents, failure logs, stale export disabled, 8 runs with 5 retained, no external requests.');
} finally { await browser.close(); }
