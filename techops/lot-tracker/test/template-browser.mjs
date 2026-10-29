import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8'));
const playwright = process.env.PLAYWRIGHT_MODULE ? await import(process.env.PLAYWRIGHT_MODULE) : await import('playwright');
const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  const htmlPath = path.join(root, 'dist', 'LOT-Tracker-v' + release.version + '.html');
  if (process.env.LOT_TRACKER_BROWSER_INLINE === '1') {
    // Managed Chromium can forbid file:// navigation. Read this authorized
    // build through Node without granting the browser filesystem access.
    await page.setContent(fs.readFileSync(htmlPath, 'utf8'));
  } else {
    await page.goto(pathToFileURL(htmlPath).href);
  }
  await page.waitForFunction(() => {
    const report = document.getElementById('report-pane').contentWindow;
    return report.LOTTrackerTemplate?.exportBuiltin && report.LOTTrackerBuiltinTemplate && report.tracerReportMatrix && report.JSZip;
  });
  const result = await page.evaluate(async () => {
    const report = document.getElementById('report-pane').contentWindow;
    const API = report.LOTTrackerTemplate, builtin = report.LOTTrackerBuiltinTemplate;
    const selected = ['SMT', 'M033', 'M087', 'M100', 'M111', 'M130', 'M160', 'M164', 'M165'];
    const widths = { SMT: 6, M033: 9, M087: 9, M100: 9, M111: 6, M130: 9, M160: 9, M164: 9, M165: 9 };
    const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const checks = [];
    const check = (condition, message) => { if (!condition) throw Error(message); checks.push(message); };
    const same = (a, b, message) => check(JSON.stringify(a) === JSON.stringify(b), message);
    const parse = xml => {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      if (doc.getElementsByTagName('parsererror').length) throw Error('Invalid workbook XML');
      return doc;
    };
    const all = (node, name) => Array.from(node.getElementsByTagNameNS(NS, name));
    const signature = node => !node ? null : node.nodeType === 3 ? node.textContent :
      [node.namespaceURI, node.localName, Array.from(node.attributes || [])
        .filter(attribute => attribute.name !== 'xmlns' && !attribute.name.startsWith('xmlns:'))
        .map(attribute => [attribute.name, attribute.value]).sort(),
        Array.from(node.childNodes).filter(child => child.nodeType === 1 || child.nodeType === 3).map(signature)];
    const columnName = index => {
      let name = '', value = index + 1;
      while (value) { value--; name = String.fromCharCode(65 + value % 26) + name; value = Math.floor(value / 26); }
      return name;
    };
    const address = (matrixRow, matrixColumn) => columnName(matrixColumn + 1) + (matrixRow + 2);
    // JSZip 3.x checks byte-array constructors from its own iframe realm.
    const loadZip = bytes => report.JSZip.loadAsync(new report.Uint8Array(bytes));
    const baselineBytes = report.Uint8Array.from(atob(builtin.base64), character => character.charCodeAt(0));
    const baselineZip = await loadZip(baselineBytes);
    const baselineDoc = parse(await baselineZip.file('xl/worksheets/sheet1.xml').async('string'));
    const baselineWorkbook = parse(await baselineZip.file('xl/workbook.xml').async('string'));
    same([builtin.info.sheetName, builtin.info.headerStartRow, builtin.info.headerStartColumn,
      builtin.info.dataStartRow, builtin.info.columnCount], ['Sheet1', 2, 2, 4, 82], 'Built-in v3 report uses the original B2:CE3 header offset');
    same(all(baselineWorkbook, 'sheet').map(sheet => sheet.getAttribute('name')), ['Sheet1'], 'Built-in report keeps the reference worksheet name');
    const sharedStrings = async zip => {
      const file = zip.file('xl/sharedStrings.xml');
      return file ? all(parse(await file.async('string')), 'si').map(item => item.textContent) : [];
    };
    const valueOf = (cell, strings) => {
      if (!cell) return undefined;
      if (cell.getAttribute('t') === 'inlineStr') return all(cell, 'is')[0]?.textContent || '';
      const raw = all(cell, 'v')[0]?.textContent || '';
      if (cell.getAttribute('t') === 's') return strings[Number(raw)];
      return raw === '' ? '' : Number(raw);
    };
    const baselineStrings = await sharedStrings(baselineZip);
    const baselineRows = all(baselineDoc, 'row'), baselineCells = all(baselineDoc, 'c');
    const headerStrings = new Set(baselineCells.filter(cell => {
      const row = Number(cell.getAttribute('r').match(/\d+/)[0]);
      return row === 2 || row === 3;
    }).map(cell => valueOf(cell, baselineStrings)).filter(value => typeof value === 'string'));
    check(baselineStrings.every(value => value === '' || headerStrings.has(value)),
      'Built-in shared-string cache contains only the retained header labels');
    check(baselineCells.filter(cell => Number(cell.getAttribute('r').match(/\d+/)[0]) >= 4)
      .every(cell => valueOf(cell, baselineStrings) === '' || valueOf(cell, baselineStrings) === undefined),
      'Built-in template contains no business values in its body cells');
    const visit = (incoming, outgoing, equipment) => ({
      in: incoming, out: outgoing, eqp: equipment, inAt: '2026-10-02 08:00:00', outAt: '2026-10-02 09:00:00',
      failQty: String(Number(incoming) - Number(outgoing)), failCodes: ''
    });
    const summaries = [
      {
        lotId: '0000123456', partNumber: '001234', smtInputRun: true, smtInputQuantity: '12',
        evalCode: '00', tier: '01', opt: '002', relations: [
          { step: 'M100', eventName: 'Merge', relatedLotId: 'IN-LOT', changedQty: '4', qty: '14', dateTime: '2026-10-02 09:10:00', mergeDirection: 'incoming' },
          { step: 'M100', eventName: 'Split', relatedLotId: 'SPLIT-LOT', changedQty: '2', qty: '12', dateTime: '2026-10-02 09:20:00' },
          { step: 'M100', eventName: 'Merge', relatedLotId: 'OUT-LOT', changedQty: '12', qty: '0', dateTime: '2026-10-02 09:30:00', mergeDirection: 'outgoing' }
        ],
        steps: {
          M010: [visit('12', '12', 'SMT&<01')], M015: [visit('12', '12', 'SMT02')],
          M033: [visit('12', '11', 'ROUTER01')], M100: [visit('12', '10', 'AG01')], M130: [visit('12', '12', 'IF01')]
        }
      },
      {
        lotId: '0000000012', partNumber: '000999', smtInputRun: true, smtInputQuantity: '0',
        evalCode: '', tier: '', opt: '', relations: [],
        steps: { M010: [visit('0', '0', 'SMT-ZERO')], M015: [visit('0', '0', 'SMT-ZERO')], M100: [visit('0', '0', 'AG-ZERO')] }
      }
    ];
    const matrix = report.tracerReportMatrix(summaries, selected);
    check(matrix.length > 2 && matrix.every(row => row.length === 82), 'Synthetic rows come from the actual 82-column report engine');
    check(!matrix[0].includes('Mutation'), 'Process headers have no separate top-level Mutation groups');
    for (let index = 0; index < selected.length; index++) {
      const start = matrix[0].indexOf(selected[index]);
      const next = index + 1 < selected.length ? matrix[0].indexOf(selected[index + 1]) : matrix[0].length;
      same(next - start, widths[selected[index]], 'Process group width matches v3: ' + selected[index]);
      const metrics = matrix[1].slice(start, next);
      if (widths[selected[index]] === 9) same(metrics.slice(0, 3), ['Mutation', 'Change LOT', 'QTY'], 'Mutation columns precede metrics: ' + selected[index]);
      else check(!metrics.includes('Mutation'), 'Metrics-only process group has no mutation columns: ' + selected[index]);
    }
    const metricColumn = (step, metric) => {
      const start = matrix[0].indexOf(step), metricOffset = matrix[1].slice(start, start + widths[step]).indexOf(metric);
      if (metricOffset < 0) throw Error('Missing synthetic metric ' + step + '/' + metric);
      return start + metricOffset;
    };
    const outputBytes = await API.exportBuiltin(matrix), outputZip = await loadZip(outputBytes);
    const outputDoc = parse(await outputZip.file('xl/worksheets/sheet1.xml').async('string'));
    const outputStrings = await sharedStrings(outputZip);
    const outputRows = all(outputDoc, 'row'), cells = all(outputDoc, 'c');
    const cell = ref => cells.find(item => item.getAttribute('r') === ref);
    const value = ref => valueOf(cell(ref), outputStrings);
    for (const name of Object.keys(baselineZip.files).filter(name => !baselineZip.files[name].dir
      && !['xl/worksheets/sheet1.xml', 'xl/workbook.xml'].includes(name))) {
      check(!!outputZip.file(name), 'Template package part remains: ' + name);
      same(Array.from(await outputZip.file(name).async('uint8array')), Array.from(await baselineZip.file(name).async('uint8array')),
        'Template package part is unchanged: ' + name);
    }
    check(!!baselineZip.file('xl/styles.xml') && !!baselineZip.file('xl/theme/theme1.xml'), 'Baseline exercises original style and theme preservation');
    for (const row of ['1', '2', '3']) {
      same(signature(outputRows.find(item => item.getAttribute('r') === row)), signature(baselineRows.find(item => item.getAttribute('r') === row)),
        'Reference margin/header row is unchanged: ' + row);
    }
    for (const name of ['cols', 'sheetViews', 'pageMargins', 'pageSetup', 'printOptions']) {
      same(signature(all(outputDoc, name)[0]), signature(all(baselineDoc, name)[0]), 'Reference layout is unchanged: ' + name);
    }
    const headerMerges = doc => all(doc, 'mergeCell').filter(merge => {
      const rowNumbers = merge.getAttribute('ref').match(/\d+/g).map(Number);
      return Math.max(...rowNumbers) <= 3;
    }).map(merge => merge.getAttribute('ref')).sort();
    same(headerMerges(outputDoc), headerMerges(baselineDoc), 'Original B2:CE3 header merges remain exact');
    const bodyCells = cells.filter(item => Number(item.getAttribute('r').match(/\d+/)[0]) >= 4);
    check(bodyCells.every(item => item.getAttribute('r').match(/^[A-Z]+/)[0] !== 'A'), 'Column A remains an empty margin');
    same([value(address(2, 0)), value(address(2, 1))], ['001234', '0000123456'], 'Leading-zero PART and RUNID values remain text');
    check(['inlineStr', 's'].includes(cell(address(2, 0)).getAttribute('t')) && ['inlineStr', 's'].includes(cell(address(2, 1)).getAttribute('t')),
      'Identifiers retain text cell types');
    const zeroMatrixRow = matrix.findIndex((row, index) => index > 1 && row[1] === '0000000012');
    check(zeroMatrixRow >= 2, 'Synthetic zero-quantity root row is present');
    same([value(address(2, 2)), value(address(zeroMatrixRow, 2))], [12, 0], 'QTY includes a nonzero numeric value and numeric zero');
    check(!['inlineStr', 's'].includes(cell(address(zeroMatrixRow, 2)).getAttribute('t')), 'Numeric zero is not exported as text or blank');
    const m100Qty = metricColumn('M100', 'EQP') - 1;
    same([2, 3, 4].map(row => value(address(row, m100Qty))), ['+4', 2, '-12'], 'Merge QTY keeps its direction sign; split QTY stays numeric');
    check(['inlineStr', 's'].includes(cell(address(2, m100Qty)).getAttribute('t')) && ['inlineStr', 's'].includes(cell(address(4, m100Qty)).getAttribute('t')),
      'Signed merge QTY is exported as text so Excel shows + and -');
    same(cell(address(2, m100Qty)).getAttribute('s'), String(builtin.info.styles.normal), 'Signed merge QTY keeps the centered v3 body style');
    const ignoredQty = all(outputDoc, 'ignoredError').map(item => item.getAttribute('sqref')).join(' ').split(' ');
    check(ignoredQty.includes(address(2, m100Qty) + ':' + address(matrix.length - 1, m100Qty)), 'Excel does not flag signed merge QTY as numbers stored as text');
    const ratioAddress = address(2, metricColumn('M130', 'YLD'));
    same(value(ratioAddress), 1, 'Yield is stored as a numeric ratio');
    const stylesDoc = parse(await outputZip.file('xl/styles.xml').async('string'));
    const cellStyles = Array.from(all(stylesDoc, 'cellXfs')[0].children).filter(item => item.localName === 'xf');
    check(cell(ratioAddress).getAttribute('s') === String(builtin.info.styles.percent),
      'Numeric yield uses the active percentage style from the v3 palette');
    const percentageFormat = cellStyles[Number(cell(ratioAddress).getAttribute('s'))].getAttribute('numFmtId');
    same(percentageFormat, cellStyles[builtin.info.styles.emptyPercent].getAttribute('numFmtId'),
      'Active and inactive yields share the retained v3 percentage number format');
    same(all(stylesDoc, 'numFmt').find(item => item.getAttribute('numFmtId') === percentageFormat)?.getAttribute('formatCode'),
      '0.0%', 'Yield preserves the reference one-decimal percentage display');
    const fineAddress = address(2, metricColumn('M033', 'YLD'));
    check(value(fineAddress) > 0 && value(fineAddress) < 1, 'Synthetic M033 yield is below 100% and stays an exact numeric ratio');
    same(cell(fineAddress).getAttribute('s'), String(builtin.info.styles.percentFine), 'Yield below 100% uses the two-decimal style');
    const fineStyle = cellStyles[builtin.info.styles.percentFine], wholeStyle = cellStyles[builtin.info.styles.percent];
    same(fineStyle.getAttribute('numFmtId'), '10', 'The two-decimal style is the built-in 0.00% format of the original template');
    same(Array.from(fineStyle.attributes).filter(item => item.name !== 'numFmtId').map(item => item.name + '=' + item.value).sort().join(' ') + fineStyle.innerHTML,
      Array.from(wholeStyle.attributes).filter(item => item.name !== 'numFmtId').map(item => item.name + '=' + item.value).sort().join(' ') + wholeStyle.innerHTML,
      'The two-decimal yield style matches the v3 yield font, fill, border and alignment');
    check(value(address(2, metricColumn('SMT', 'EQP'))).includes('&<01'), 'Special XML characters survive equipment export');
    const lastRow = matrix.length + 1;
    same(all(outputDoc, 'dimension')[0].getAttribute('ref'), 'A1:CE' + lastRow, 'Used range follows offset plus generated row count');
    check(outputRows.filter(row => Number(row.getAttribute('r')) >= 4).every(row => Number(row.getAttribute('r')) <= lastRow),
      'Blank template sample rows do not extend the output report');
    check(!bodyCells.some(item => /STALE_|OLD_SAMPLE/.test(String(valueOf(item, outputStrings)))), 'No synthetic stale sample labels appear in export');
    const rootRow = outputRows.find(row => row.getAttribute('r') === '4'), prototypeRow = baselineRows.find(row => row.getAttribute('r') === '4');
    const prototypeHeight = Number(prototypeRow.getAttribute('ht') || all(baselineDoc, 'sheetFormatPr')[0].getAttribute('defaultRowHeight'));
    same(prototypeHeight, builtin.info.rowHeight, 'Retained prototype uses the original v3 row height');
    same(value(address(2, metricColumn('SMT', 'EQP'))).split('\n').length, 1, 'Synthetic equipment fits on a single display line');
    same(Number(rootRow.getAttribute('ht')), prototypeHeight, 'Single-line root row retains the original default row height');
    const multiline = report.tracerReportMatrix([{
      ...summaries[0], steps: { M010: [visit('12', '12', 'FIRST-LINE\nSECOND-LINE')], M015: [visit('12', '12', 'FIRST-LINE\nSECOND-LINE')] }
    }], selected);
    const multilineZip = await loadZip(await API.exportBuiltin(multiline));
    const multilineDoc = parse(await multilineZip.file('xl/worksheets/sheet1.xml').async('string'));
    same(Number(all(multilineDoc, 'row').find(row => row.getAttribute('r') === '4').getAttribute('ht')), prototypeHeight * 2,
      'Multiline equipment expands the original row height to keep both lines visible');
    const expandSummaries = Array.from({ length: 6 }, (_, index) => ({
      ...summaries[0], lotId: '00000000' + String(index + 1).padStart(2, '0'), partNumber: '00' + index, relations: []
    }));
    const expanded = report.tracerReportMatrix(expandSummaries, selected);
    const expandedZip = await loadZip(await API.exportBuiltin(expanded));
    const expandedDoc = parse(await expandedZip.file('xl/worksheets/sheet1.xml').async('string'));
    same(all(expandedDoc, 'dimension')[0].getAttribute('ref'), 'A1:CE' + (expanded.length + 1), 'Expanded report retains the original column offset');
    const expandedLast = all(expandedDoc, 'c').find(item => item.getAttribute('r') === address(expanded.length - 1, 2));
    check(!!expandedLast && expandedLast.getAttribute('s') === cell(address(2, 2)).getAttribute('s'), 'New rows inherit the template quantity style');
    const shrunk = report.tracerReportMatrix([summaries[0]], selected);
    const shrunkZip = await loadZip(await API.exportBuiltin(shrunk));
    const shrunkDoc = parse(await shrunkZip.file('xl/worksheets/sheet1.xml').async('string'));
    same(all(shrunkDoc, 'dimension')[0].getAttribute('ref'), 'A1:CE' + (shrunk.length + 1), 'A later smaller export has no rows from a prior export');

    const groupRoot = {
      ...summaries[0],
      smtPmsFlow: { validated: true, runId: '0000123456', totalQuantity: '12', parentLotId: 'GROUP-HOST', pmsRowCount: 2 },
      relations: [
        { step: 'M100', eventName: 'Split', relatedLotId: 'GROUP-CHILD', changedQty: '2', dateTime: '2026-10-02 10:00:00' },
        { step: 'M164', eventName: 'Split', relatedLotId: 'UNSELECTED-CHILD', changedQty: '1', dateTime: '2026-10-02 11:00:00' }
      ]
    };
    const groupChild = {
      ...summaries[1], lotId: 'GROUP-CHILD', smtInputRun: false,
      steps: { M100: [visit('2', '2', 'DETAIL-AG')] },
      relations: [{ step: 'M100', eventName: 'Split', relatedLotId: '0000123456', changedQty: '2', dateTime: '2026-10-02 10:00:00' }]
    };
    const grouped = report.tracerReportMatrix([groupRoot, groupChild], selected);
    check(Array.isArray(grouped.lotTrackerRowGroups) && grouped.lotTrackerRowGroups.some(group => group.end > group.start),
      'Actual engine supplies root/detail group metadata');
    const groupedZip = await loadZip(await API.exportBuiltin(grouped));
    const groupedDoc = parse(await groupedZip.file('xl/worksheets/sheet1.xml').async('string'));
    const groupedMerges = all(groupedDoc, 'mergeCell').map(merge => merge.getAttribute('ref'));
    check(Array.isArray(grouped.lotTrackerMerges), 'Actual engine supplies process and identity merge metadata');
    const expectedBodyMerges = grouped.lotTrackerMerges.map(merge =>
      address(merge.s.r, merge.s.c) + ':' + address(merge.e.r, merge.e.c)).sort();
    const actualBodyMerges = groupedMerges.filter(ref => Math.min(...ref.match(/\d+/g).map(Number)) >= 4).sort();
    same(actualBodyMerges, expectedBodyMerges, 'Every body merge follows exact event-row engine metadata');
    for (const group of grouped.lotTrackerRowGroups.filter(item => item.end > item.start)) {
      for (let column = 0; column < 7; column++) {
        const expected = columnName(column + 1) + (group.start + 2) + ':' + columnName(column + 1) + (group.end + 2);
        check(groupedMerges.includes(expected), 'Identity merge follows the actual root/detail group: ' + expected);
      }
    }
    const groupedCells = all(groupedDoc, 'c'), groupedStrings = await sharedStrings(groupedZip);
    for (const merge of groupedMerges) {
      const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(merge);
      if (!match || +match[2] < 4 || match[1] !== match[3]) continue;
      for (let row = +match[2] + 1; row <= +match[4]; row++) {
        const covered = groupedCells.find(item => item.getAttribute('r') === match[1] + row);
        check(!covered || valueOf(covered, groupedStrings) === '', 'Merged body cells do not hide a second generated value: ' + match[1] + row);
      }
    }
    const firstGroupedValue = groupedCells.find(item => item.getAttribute('r') === address(2, 0));
    same(valueOf(firstGroupedValue, groupedStrings), '001234', 'Grouped root identity remains at its merge anchor');
    return { checks: checks.length, outputBytes: Array.from(outputBytes) };
  });
  fs.writeFileSync(path.join(root, 'dist', 'template-test.xlsx'), Buffer.from(result.outputBytes));
  assert.deepEqual(errors, [], 'Built-in export must not cause browser page errors');
  assert.deepEqual(external, [], 'Built-in export must remain offline');
  console.log('PASS: ' + result.checks + ' built-in v3 layout and synthetic report invariants');
} finally {
  await browser.close();
}
