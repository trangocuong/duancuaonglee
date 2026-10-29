import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { read, write, utils } from 'xlsx/xlsx.mjs';
import { trackingLists } from './tracking.mjs';
import { connectRunMaps } from './run-maps.mjs';
import { summarizeSeeLotWorkbook, resolveTrackerSummaries, buildTrackerReportRows, trackerReportWorkbook } from './lot-tracker.js';
import { stepOptions, stepReportWorkbook } from './lot-step-report.js';

let logDirectory;
let release;
let stage = 'REQUEST_READ';
const started = Date.now();
function log(name, details = {}) {
  stage = name;
  if (logDirectory) fs.appendFileSync(path.join(logDirectory, 'analysis.jsonl'), JSON.stringify({ time: new Date().toISOString(), appVersion: release?.version, elapsedMs: Date.now() - started, stage, ...details }) + '\n');
}
try {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const request = JSON.parse(input.trim());
  const { files, output } = request;
  logDirectory = request.logDirectory || output;
  fs.mkdirSync(logDirectory, { recursive: true });
  release = JSON.parse(fs.readFileSync(new URL('./release.json', import.meta.url), 'utf8'));
  log('APP_VERSION', { version: release.version, builtAt: release.builtAt });
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  log('ENGINE_READY', { node: process.version, platform: process.platform, arch: process.arch, modules: Object.fromEntries(['analyze.mjs', 'tracking.mjs', 'run-maps.mjs', 'lot-tracker.js', 'lot-step-report.js'].map(name => [name, hash(fs.readFileSync(fileURLToPath(new URL(name, import.meta.url))))])) });
  log('VALIDATE_FILES', { count: files?.length });
  if (!Array.isArray(files) || !files.length || files.length > 500) throw Error('파일을 1~500개 선택하세요.');
  let total = 0;
  const parsed = files.map(file => {
    log('FILE_READ', { file });
    const size = fs.statSync(file).size;
    total += size;
    if (!/\.(csv|xls|xlsx)$/i.test(file) || size > 2 * 1024 * 1024 || total > 128 * 1024 * 1024) throw Error('파일당 2MB, 전체 128MB 제한: ' + path.basename(file));
    try {
      const bytes = new Uint8Array(fs.readFileSync(file));
      log('FILE_PARSE', { file, size, sha256: hash(bytes) });
      const summary = summarizeSeeLotWorkbook(bytes, path.basename(file));
      log('FILE_PARSED', { file, lotId: summary.lotId, sourceKind: summary.sourceKind || 'See LOT events', mapRows: summary.mapRecords?.length || 0, steps: Object.keys(summary.steps || {}) });
      return summary;
    }
    catch (error) { throw Error(path.basename(file) + ': ' + error.message); }
  });
  log('CLASSIFY_INPUTS');
  const maps = parsed.filter(s => s.mapRecords);
  const summaries = parsed.filter(s => !s.mapRecords);
  if (!summaries.length) throw Error('RUNID 맵만 선택되었습니다. 공정 실적을 분석할 See LOT 이벤트 파일도 함께 선택하세요.');
  log('RESOLVE_LOT_RELATIONS');
  resolveTrackerSummaries(summaries);
  const runConnections = connectRunMaps(summaries, maps);
  log('RUN_MAPS_CONNECTED', { mapFiles: maps.length, eventLots: summaries.length, linkedLots: runConnections.linkedLots });
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'summaries.json'), JSON.stringify(summaries, null, 2));
  fs.writeFileSync(path.join(output, 'run-maps.json'), JSON.stringify(maps, null, 2));
  log('BUILD_REPORTS');
  const tracking = trackingLists(summaries, maps);
  Object.assign(tracking.matrices, runConnections.matrices);
  const book = read(stepReportWorkbook(summaries, stepOptions(summaries), 'ko'), { type: 'array' });
  for (const [name, rows] of Object.entries(tracking.matrices)) {
    const sheet = utils.aoa_to_sheet(rows);
    sheet['!cols'] = rows[0].map(() => ({ wch: 28 }));
    utils.book_append_sheet(book, sheet, name);
  }
  fs.writeFileSync(path.join(output, '추가조회_ID.txt'), tracking.missing.map(r => r.id).join('\r\n'));
  log('TRACKING_REQUESTS', { missingCount: tracking.missing.length, ids: tracking.missing.map(r => r.id) });
  const reports = {
    'LOT 공정별 보고서': new Uint8Array(write(book, { type: 'array', bookType: 'xlsx', compression: true })),
    'LOT Tracker 기존 고정양식': trackerReportWorkbook(buildTrackerReportRows(summaries), summaries),
  };
  fs.mkdirSync(output, { recursive: true });
  const tabs = [];
  const exports = [];
  for (const [name, bytes] of Object.entries(reports)) {
    log('WRITE_REPORT', { name });
    const target = path.join(output, name + '.xlsx');
    fs.writeFileSync(target, bytes);
    exports.push(target);
    const book = read(bytes, { type: 'array' });
    for (const sheetName of book.SheetNames) {
      if (name === 'LOT Tracker 기존 고정양식' && sheetName !== 'LOT Tracker') continue;
      tabs.push({ name: sheetName === 'LOT Steps' ? '전체 공정 (SMT부터)' : sheetName === 'LOT Tracker' ? '기존 고정양식 (M121부터)' : sheetName, headerRows: ['LOT Steps', 'LOT Tracker'].includes(sheetName) ? 2 : 1, rows: utils.sheet_to_json(book.Sheets[sheetName], { header: 1, defval: '', raw: false }) });
    }
  }
  log('ANALYSIS_COMPLETE', { count: summaries.length, reports: exports });
  const priority = ['전체 공정 (SMT부터)', '추가 파일 요청', 'SMT RUNID 추적', 'SPLIT LOT 목록'];
  tabs.sort((a, b) => (priority.includes(a.name) ? priority.indexOf(a.name) : 10) - (priority.includes(b.name) ? priority.indexOf(b.name) : 10));
  process.stdout.write(JSON.stringify({ appVersion: release.version, builtAt: release.builtAt, count: summaries.length, mapCount: maps.length, tabs, exports, missingIds: tracking.missing.map(r => r.id) }));
} catch (error) {
  const failedStage = stage;
  try { log('ERROR', { failedStage, message: error.message, stack: error.stack, code: error.code }); } catch (logError) { process.stderr.write('Log write failed: ' + logError.stack + '\n'); }
  process.stderr.write('Stage: ' + failedStage + '\n' + error.stack);
  process.exitCode = 1;
}
