import { read, write, utils } from 'xlsx/xlsx.mjs';
import { summarizeStepVisits, validateSteps, selectedSteps, stepReportWorkbook, renderStepReport, reportVisit, withoutCancelledEvents, followUpMatrix, isOutgoingSplit } from './lot-step-report.js';

const MAX_FILES = 50;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_ROWS = 10000;
const EVENT_HEADERS = ['EVENT_NAME', 'DATE/TIME', 'QTY', 'STEP', 'EQP', 'LINE', 'OPERID', 'CHG_ITEM', 'CHG_VALS', 'QTY', 'COMMENT'];
const SPLIT_MAP_HEADERS = ['NO', 'REPRSN_SRLNO', 'LOT_ID', 'BARCODE_SERLNO', 'PROD_ID', 'SPLIT_LOT', 'RESERVE_ID', 'PS_PROC', 'FW_PROC', 'TEST_RESULT', 'PCB_ARRAY', 'MERGE_LOT', 'PCB_MAP', 'WORK_NAME', 'FRONT_RESULT', 'BACK_RESULT', 'FRONT_SCRAP_CODE', 'BACK_SCRAP_CODE', 'CREATE_DATE'];
const RUN_FILE_HEADERS = ['LOT_ID', 'PROD_ID', 'MERGE_LOT'];
const METRIC_KEYS = ['eqp', 'in', 'out', 'failQty', 'failCodes', 'yld'];

export const trackerWords = {
  ko: {
    title: 'LOT Tracker', pending: 'SWP See LOT 연결 대기', future: '향후 LOTID를 한 줄에 하나씩 붙여넣으면 SWP See LOT을 조회해 같은 형식의 보고서를 만듭니다.',
    lotIds: 'LOTID 목록', connect: 'SWP 조회 (연결 대기)', upload: 'See LOT 조회 파일 분석',
    guide: 'See LOT의 .csv, .xls 또는 .xlsx 파일을 여러 개 선택하세요. 일반 파일명은 LOTID로 사용하고, 보안 다운로드 UUID 파일명은 ASSYLOT·상호 Split 이력으로 실제 LOTID를 판별합니다. PCB 분할/병합 맵 파일도 함께 읽습니다. Cancel 회차를 제외하고 공정 이력·불량·수율·후속 추적 LOT·최신 상태를 계산합니다. 최대 50개, 파일당 2MB, 전체 12MB.',
    preview: '보고서 만들기', report: 'LOT Tracker 보고서', excel: 'Excel 보고서 다운로드', copy: '텍스트 복사', copied: '복사했습니다.',
    apply: 'LOT INFO에 반영', saved: '개 LOT을 LOT INFO에 반영했습니다.', fileError: '파일 오류', partMissing: 'See LOT 파일에는 PART NO가 없습니다. 기존 LOT INFO 또는 일일보고에서 찾은 값만 표시하며, 없는 값은 빈칸입니다.',
    splitMissing: '분할 LOT의 공정 실적을 채우려면 해당 분할 LOT의 See LOT 파일도 함께 선택하세요.', asOf: '기준 시각', source: '분석 파일',
  },
  en: {
    title: 'LOT Tracker', pending: 'SWP See LOT connection pending', future: 'Later, paste one LOTID per line to query SWP See LOT and create the same report.',
    lotIds: 'LOTID list', connect: 'Query SWP (pending)', upload: 'Analyze See LOT exports',
    guide: 'For now, select multiple .csv, .xls or .xlsx files saved from See LOT, one per LOTID. The filename supplies the LOTID; process history, failures, yield, split lots, and current status are calculated. Up to 50 files, 2MB each, 12MB total.',
    preview: 'Build report', report: 'LOT Tracker report', excel: 'Download Excel report', copy: 'Copy text', copied: 'Copied.',
    apply: 'Save to LOT INFO', saved: ' LOTs saved to LOT INFO.', fileError: 'File error', partMissing: 'See LOT exports do not contain PART NO. Only values found in existing LOT INFO or daily reports are shown; otherwise the field is blank.',
    splitMissing: 'Select the See LOT files for split LOTs as well to fill their process results.', asOf: 'As of', source: 'Source files',
  },
  vi: {
    title: 'LOT Tracker', pending: 'Đang chờ kết nối SWP See LOT', future: 'Sau này, dán mỗi LOTID trên một dòng để truy vấn SWP See LOT và tạo cùng mẫu báo cáo.',
    lotIds: 'Danh sách LOTID', connect: 'Truy vấn SWP (đang chờ)', upload: 'Phân tích tệp See LOT',
    guide: 'Hiện tại, chọn nhiều tệp .csv, .xls hoặc .xlsx đã lưu từ See LOT, mỗi LOTID một tệp. LOTID lấy từ tên tệp; hệ thống tính lịch sử công đoạn, lỗi, yield, lot tách và trạng thái mới nhất. Tối đa 50 tệp, 2MB mỗi tệp, tổng 12MB.',
    preview: 'Tạo báo cáo', report: 'Báo cáo LOT Tracker', excel: 'Tải báo cáo Excel', copy: 'Sao chép văn bản', copied: 'Đã sao chép.',
    apply: 'Lưu vào LOT INFO', saved: ' LOT đã lưu vào LOT INFO.', fileError: 'Lỗi tệp', partMissing: 'Tệp See LOT không có PART NO. Chỉ hiển thị giá trị tìm thấy trong LOT INFO hoặc báo cáo hằng ngày; nếu không có sẽ để trống.',
    splitMissing: 'Chọn thêm tệp See LOT của các lot tách để điền kết quả công đoạn của chúng.', asOf: 'Thời điểm dữ liệu', source: 'Tệp phân tích',
  },
};

function cleanText(value, max = 4000) {
  const text = String(value ?? '').trim();
  if (text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw Error(`Invalid text / ${max} characters`);
  return text;
}

function fileLotId(filename) {
  const base = String(filename || '').split(/[\\/]/).pop().replace(/\.(?:xlsx?|csv)$/i, '').trim();
  if (!base || base.length > 120 || /[\u0000-\u001f\u007f]/.test(base)) throw Error('LOTID filename');
  return embeddedLotId(base) || base;
}

function embeddedLotId(value) {
  const lotId = String(value || '').trim().replace(/^\/+/, '').split(/[\s,;]/, 1)[0];
  return lotId && lotId.length <= 120 && /^[A-Z0-9_-]+$/i.test(lotId) ? lotId : '';
}

function opaqueFileLotId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function smtInputRun(events, sourceLotId) {
  const issue = events.find(event => event.eventName === 'ISSUE_VMS1_VMDL' && event.step === 'M010' && numberValue(event.qty) > 0);
  const splits = events.filter(event => event.eventName === 'Split' && event.step === 'M010' && embeddedLotId(event.changedValues));
  const terminated = events.some(event => event.eventName === 'Terminated' && event.step === 'M010' && numberValue(event.qty) === 0);
  if (!issue || !terminated || !splits.length) return null;
  const childIds = splits.map(event => embeddedLotId(event.changedValues));
  if (new Set(childIds).size !== childIds.length || childIds.some(id => !/^[A-Z0-9]{10}$/i.test(id) || id.slice(4, 7) === '000')) return null;
  const prefix = childIds[0].slice(0, 4), suffix = childIds[0].slice(7);
  if (childIds.some(id => id.slice(0, 4) !== prefix || id.slice(7) !== suffix)) return null;
  const lotId = `${prefix}000${suffix}`;
  if (!opaqueFileLotId(sourceLotId) && sourceLotId !== lotId) return null;
  const splitQuantity = splits.reduce((sum, event) => sum + (numberValue(event.changedQty) || 0), 0);
  const issueQuantity = numberValue(issue.qty);
  if (!(issueQuantity > 0) || Math.abs(splitQuantity - issueQuantity) > 1e-9) return null;
  return { lotId, quantity: String(issueQuantity), dateTime: issue.dateTime, splitCount: childIds.length };
}

function numberValue(value) {
  const normalized = String(value ?? '').trim().replace(/,/g, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function quantity(value) {
  const number = numberValue(value);
  return number === null ? '' : String(number);
}

function failureCode(comment) {
  const text = String(comment || '').trim();
  const code = text.split(/[\/;]/, 1)[0].trim();
  return code && code.length <= 80 ? code : 'FAIL';
}

function stageMetric(events, steps) {
  const stage = events.filter(event => steps.includes(event.step));
  const input = stage.find(event => event.eventName === 'TrackIn');
  const output = stage.find(event => event.eventName === 'TrackOut');
  const equipmentEvent = stage.find(event => ['TrackIn', 'TrackOut'].includes(event.eventName) && event.eqp && event.eqp !== '-');
  const failures = new Map();
  let failed = 0;
  for (const event of stage.filter(event => event.eventName === 'Scrap')) {
    const count = numberValue(event.changedQty);
    if (count === null || count <= 0) continue;
    const code = failureCode(event.comment);
    failures.set(code, (failures.get(code) || 0) + count);
    failed += count;
  }
  const incoming = input ? numberValue(input.qty) : null;
  const outgoing = output ? numberValue(output.qty) : null;
  const yld = incoming !== null && incoming > 0 && outgoing !== null
    ? `${((outgoing / incoming) * 100).toFixed(1)}%`
    : '';
  return {
    eqp: equipmentEvent?.eqp || '',
    in: input ? quantity(input.qty) : '',
    out: output ? quantity(output.qty) : '',
    failQty: failed > 0 ? String(failed) : (input || output ? '-' : ''),
    failCodes: failures.size ? [...failures].map(([code, count]) => `${code}*${count}`).join('\n') : (input || output ? '-' : ''),
    yld,
  };
}

function lotStatus(events) {
  if (events.some(event => event.eventName === 'SHIP_VFMS_ASIMACS')) return 'Ship';
  let hold = null;
  for (const event of [...events].reverse()) {
    if (event.eventName === 'Hold') hold = event;
    if (event.eventName === 'Release') hold = null;
  }
  if (hold) return `Hold ${hold.step}`;
  const operational = new Set(['Terminated', 'Merge', 'Split', 'Release', 'TrackIn', 'TrackOut', 'SubcontractOut', 'SubcontractIn']);
  const current = events.find(event => operational.has(event.eventName));
  if (!current) return '';
  if (current.eventName === 'Terminated') return 'Terminated';
  if (current.eventName === 'Hold') return `Hold ${current.step}`;
  if (current.eventName === 'Release') return `Wait ${current.step}`;
  if (current.eventName === 'Split') return `Split ${current.step}`;
  if (current.eventName === 'Merge') return `Merge ${current.step}${current.changedValues ? ` → ${current.changedValues}` : ''}`;
  if (current.eventName === 'SubcontractOut') return `SubcontractOut ${current.step}`;
  if (current.eventName === 'SubcontractIn') return `SubcontractIn ${current.step}`;
  if (current.eventName === 'TrackIn') return `Run ${current.step}`;
  if (current.eventName === 'TrackOut') {
    const next = { M121: 'M130', M130: 'M160', M160: 'M164', M164: 'M165', M165: 'M170', M170: 'Ship' }[current.step];
    return next ? `Wait ${next}` : `TrackOut ${current.step}`;
  }
  return current.eventName;
}

function checkWorkbookEnvelope(bytes) {
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw Error('2MB');
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const ole = bytes.length >= 8 && [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((value, index) => bytes[index] === value);
  if (!zip && !ole) throw Error('.xls / .xlsx');
  if (!zip) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let expanded = 0, entries = 0;
  for (let index = 0; index + 46 <= bytes.length; index++) {
    if (view.getUint32(index, true) !== 0x02014b50) continue;
    expanded += view.getUint32(index + 24, true); entries++;
    if (expanded > 20 * 1024 * 1024 || entries > 1000) throw Error('Workbook too large');
    index += 45 + view.getUint16(index + 28, true) + view.getUint16(index + 30, true) + view.getUint16(index + 32, true);
  }
  if (!entries) throw Error('Invalid XLSX');
}

function readSeeLotCsv(bytes) {
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw Error('2MB');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { text = new TextDecoder('euc-kr', { fatal: true }).decode(bytes); }
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], value = '', quoted = false, closed = false;
  const cell = () => {
    row.push(value); value = ''; closed = false;
    if (row.length > 64) throw Error('64 columns');
  };
  const endRow = () => {
    cell(); rows.push(row); row = [];
    if (rows.length > MAX_ROWS + 1) throw Error('10000 rows');
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { value += '"'; i++; }
        else { quoted = false; closed = true; }
      } else value += ch;
    } else if (ch === ',') cell();
    else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else if (ch === '"' && !value && !closed) quoted = true;
    else {
      if (closed || ch === '"') throw Error('Invalid CSV quoting');
      value += ch;
    }
  }
  if (quoted) throw Error('Invalid CSV quoting');
  if (value || row.length || closed) endRow();
  return rows;
}

function readSeeLotWorkbook(bytes) {
  checkWorkbookEnvelope(bytes);
  const book = read(bytes, { type: 'array', sheetRows: MAX_ROWS + 2, cellFormula: true, cellHTML: false, cellStyles: false });
  const sheetName = book.SheetNames.find(name => name.trim().toUpperCase() === 'SHEET1') || (book.SheetNames.length === 1 ? book.SheetNames[0] : null);
  if (!sheetName) throw Error('Select a single See LOT sheet');
  const sheet = book.Sheets[sheetName];
  if (!sheet?.['!ref']) throw Error('0 rows');
  const range = utils.decode_range(sheet['!fullref'] || sheet['!ref']);
  if (range.s.r !== 0 || range.s.c !== 0 || range.e.r > MAX_ROWS || range.e.c > 63) throw Error('10000 rows / 64 columns / header at row 1');
  for (let row = 0; row <= range.e.r; row++) {
    for (let col = 0; col <= range.e.c; col++) {
      const cell = sheet[utils.encode_cell({ r: row, c: col })];
      if (cell?.f || cell?.t === 'e') throw Error(`Row ${row + 1}: formula / error cell`);
    }
  }
  return utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: true });
}

function emptyMetric() {
  return { eqp: '', in: '', out: '', failQty: '', failCodes: '', yld: '' };
}

function splitMapDate(value) {
  const match = /^(\d{4})(\d{2})(\d{2})\s+(\d{2})(\d{2})(\d{2})$/.exec(String(value || '').trim());
  return match ? `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}` : cleanText(value, 100);
}

function summarizeSplitMapRows(rows, filename, partNumber) {
  const records = [];
  for (const cells of rows) {
    if (!/^\d+$/.test(String(cells[0] || '').trim())) continue;
    const values = Array.from({ length: SPLIT_MAP_HEADERS.length }, (_, col) => cleanText(cells[col] ?? ''));
    const sourceLot = embeddedLotId(values[2]), splitLot = embeddedLotId(values[5]), mergeLot = embeddedLotId(values[11]);
    const pcbArray = numberValue(values[10]);
    if (!sourceLot || !splitLot || !mergeLot || pcbArray === null || pcbArray <= 0) throw Error('PCB split / merge map row');
    records.push({ sourceLot, splitLot, mergeLot, productId: values[4], pcbArray, dateTime: splitMapDate(values[18]) });
  }
  if (!records.length) throw Error('No PCB split / merge map rows');
  const sourceLots = new Set(records.map(record => record.sourceLot));
  const mergeLots = new Set(records.map(record => record.mergeLot));
  if (sourceLots.size !== 1 || mergeLots.size !== 1 || new Set(records.map(record => record.splitLot)).size !== records.length) throw Error('Mixed PCB split / merge map');
  const ordered = [...records].sort((a, b) => a.dateTime.localeCompare(b.dateTime) || a.splitLot.localeCompare(b.splitLot));
  const total = ordered.reduce((sum, record) => sum + record.pcbArray, 0);
  let remaining = total;
  const relations = ordered.map(record => {
    remaining -= record.pcbArray;
    return { eventName: 'Split', dateTime: record.dateTime, step: 'M010', qty: String(remaining), changedQty: String(record.pcbArray), relatedLotId: record.splitLot };
  });
  const lotId = ordered[0].sourceLot, mergeTarget = ordered[0].mergeLot;
  return {
    lotId, sourceLotId: fileLotId(filename), lotIdSource: 'LOT_ID column', sourceKind: 'PCB split / merge map', mergeTarget,
    filename: String(filename).split(/[\\/]/).pop().slice(0, 200), partNumber: cleanText(partNumber || ordered[0].productId, 500),
    asOf: ordered.at(-1).dateTime, currentQty: '0', initialQty: String(total), status: `Merge map → ${mergeTarget}`,
    interface: emptyMetric(), m160: emptyMetric(), m164: emptyMetric(), m165: emptyMetric(), m170: emptyMetric(),
    splits: [], steps: {}, relations, recycles: [], excludedCancelCount: '0',
  };
}

function csvHeaders(rows) {
  return (rows[0] || []).map(value => String(value).replace(/^﻿/, '').trim().toUpperCase());
}

// RUNID CSV: a separate SWP export (LOT_ID, PROD_ID, MERGE_LOT) that names which downstream
// LOT(s) a run's output was merged into. Returns null (not an error) when the file's headers
// don't match, so callers can fall back to treating it as a regular See LOT export.
export function summarizeRunMetadata(bytes, filename) {
  if (!/\.(csv|xls|xlsx)$/i.test(filename)) return null;
  let rows;
  try { rows = /\.csv$/i.test(filename) ? readSeeLotCsv(bytes) : readSeeLotWorkbook(bytes); } catch { return null; }
  const headers = csvHeaders(rows);
  if (!RUN_FILE_HEADERS.every(header => headers.includes(header))) return null;
  const indexes = Object.fromEntries(headers.map((header, index) => [header, index]));
  let lotId = '';
  const productIds = new Set(), mergeLotIds = new Set();
  const fabs = new Set(), tiers = new Set(), opts = new Set();
  let smtQuantity = 0, barcodeRecords = 0, pcbArrayRecords = 0;
  let records = 0;
  for (const cells of rows.slice(1)) {
    const rowLotId = cleanText(cells[indexes.LOT_ID] ?? '', 120);
    if (!rowLotId) continue;
    if (lotId && rowLotId !== lotId) throw Error('RUNID file contains multiple LOT_ID values');
    lotId = rowLotId;
    records++;
    const productId = cleanText(cells[indexes.PROD_ID] ?? '', 500);
    const mergeLotId = cleanText(cells[indexes.MERGE_LOT] ?? '', 120);
    if (productId) productIds.add(productId);
    if (mergeLotId && mergeLotId !== lotId) mergeLotIds.add(mergeLotId);
    if (indexes.BARCODE_SERLNO !== undefined) {
      const barcode = cleanText(cells[indexes.BARCODE_SERLNO] ?? '', 120);
      if (/^[A-Z0-9]{19,}$/i.test(barcode)) {
        opts.add(barcode[0]); fabs.add(barcode[17]); tiers.add(barcode[18]);
        barcodeRecords++;
      }
    }
    if (indexes.PCB_ARRAY !== undefined) {
      const count = numberValue(cells[indexes.PCB_ARRAY]);
      if (count !== null && count > 0) { smtQuantity += count; pcbArrayRecords++; }
    }
  }
  if (!records) throw Error('RUNID rows');
  if (productIds.size !== 1) throw Error(`PROD_ID count ${productIds.size}`);
  return {
    lotId, filename: String(filename).split(/[\\/]/).pop().slice(0, 200), partNumber: [...productIds][0], mergeLotIds: [...mergeLotIds],
    fab: barcodeRecords === records && fabs.size === 1 ? [...fabs][0] : '',
    tier: barcodeRecords === records && tiers.size === 1 ? [...tiers][0] : '',
    opt: barcodeRecords === records && opts.size === 1 ? [...opts][0] : '',
    smtQuantity: pcbArrayRecords === records ? String(smtQuantity) : '',
  };
}

// The LOT(s) this summary's own history says it originated from: a single, full-quantity
// M010 Split relation (see isOutgoingSplit — anything else is this LOT actively splitting
// children off, not itself being born from one). Mirrors what a RUNID CSV's MERGE_LOT points at.
export function originLotIds(summary) {
  if (summary.originSplitLotIds) return summary.originSplitLotIds;
  return (summary.relations || [])
    .filter(relation => relation.eventName === 'Split' && relation.step === 'M010' && relation.relatedLotId && !isOutgoingSplit(summary, relation))
    .map(relation => relation.relatedLotId);
}

// Matches RUNID CSVs against summaries via the same LOT_ID they claim to have merged into
// (MERGE_LOT), confirming or replacing the M010-split-only guess used for the "SMT RUNID
// candidate" heuristic. 'direct' = the RUNID file itself names this LOT as its MERGE_LOT.
// 'indirect' = it names an intermediate LOT that this LOT's own history says it split from.
export function assignRunLinks(summaries, runSources = []) {
  const usedRunIds = new Set();
  for (const summary of summaries) {
    const origins = originLotIds(summary);
    const candidates = runSources.filter(source => (origins.includes(source.lotId) && source.mergeLotIds.includes(summary.lotId)) || source.mergeLotIds.some(lotId => origins.includes(lotId)));
    if (candidates.length > 1) {
      summary.runLinkType = ''; summary.runSourceLotId = ''; summary.runViaLotId = '';
      continue; // Ambiguous sources are reported as unlinked, never choose an arbitrary RUNID/product.
    }
    const directSource = runSources.find(source => origins.includes(source.lotId) && source.mergeLotIds.includes(summary.lotId));
    const indirectSource = !directSource ? runSources.find(source => source.mergeLotIds.some(lotId => origins.includes(lotId))) : null;
    const runSource = directSource || indirectSource;
    summary.runLinkType = directSource ? 'direct' : runSource ? 'indirect' : '';
    summary.runSourceLotId = runSource?.lotId || '';
    summary.runViaLotId = directSource ? '' : (runSource?.mergeLotIds.find(lotId => origins.includes(lotId)) || '');
    if (runSource) {
      usedRunIds.add(runSource.lotId);
      if (!summary.partNumber && runSource.partNumber) summary.partNumber = runSource.partNumber;
      summary.fab = runSource.fab || '';
      summary.tier = runSource.tier || '';
      summary.opt = runSource.opt || '';
      summary.smtQuantity = runSource.smtQuantity || '';
    }
  }
  return { usedRunIds, unlinked: runSources.filter(source => !usedRunIds.has(source.lotId)) };
}

export function summarizeSeeLotWorkbook(bytes, filename, partNumber = '') {
  const rows = /\.csv$/i.test(filename) ? readSeeLotCsv(bytes) : readSeeLotWorkbook(bytes);
  const rawHeaders = rows.shift() || [];
  const mapHeaders = rawHeaders.slice(0, SPLIT_MAP_HEADERS.length).map(value => String(value).trim().toUpperCase());
  if (mapHeaders.length === SPLIT_MAP_HEADERS.length && mapHeaders.every((header, index) => header === SPLIT_MAP_HEADERS[index])) return summarizeSplitMapRows(rows, filename, partNumber);
  const headers = rawHeaders.slice(0, EVENT_HEADERS.length).map(value => String(value).trim().toUpperCase());
  if (headers.length !== EVENT_HEADERS.length || headers.some((header, index) => header !== EVENT_HEADERS[index])) throw Error('See LOT header');
  const events = [];
  for (let index = 0; index < rows.length; index++) {
    const cells = rows[index];
    if (cells.every(value => !String(value).trim())) continue;
    const values = Array.from({ length: EVENT_HEADERS.length }, (_, col) => cleanText(cells[col] ?? ''));
    if (!values[1]) continue; // confidentiality footer and export metadata
    events.push({
      eventName: values[0], dateTime: values[1], qty: values[2], step: values[3], eqp: values[4], line: values[5],
      operator: values[6], changedItem: values[7], changedValues: values[8], changedQty: values[9], comment: values[10],
    });
  }
  if (!events.length) throw Error('No See LOT events');
  const sourceLotId = fileLotId(filename);
  const includedEvents = withoutCancelledEvents(events);
  const assyLot = includedEvents.map(event => event.changedItem === 'ASSYLOT' ? embeddedLotId(event.changedValues) : '').find(Boolean) || '';
  const smtRun = !assyLot ? smtInputRun(includedEvents, sourceLotId) : null;
  const relations = includedEvents.filter(event => ['Split', 'Merge'].includes(event.eventName) && embeddedLotId(event.changedValues)).map(event => ({
    eventName: event.eventName, dateTime: event.dateTime, step: event.step, qty: quantity(event.qty), changedQty: quantity(event.changedQty), relatedLotId: embeddedLotId(event.changedValues),
  }));
  const recycles = includedEvents.flatMap(event => {
    const match = /RECYCLELOTID=([^,\s]+),RECYCLEQTY=(\d+(?:\.\d+)?)/i.exec(event.comment);
    return match ? [{ lotId: embeddedLotId(match[1]), qty: quantity(match[2]), dateTime: event.dateTime, step: event.step }] : [];
  }).filter(item => item.lotId);
  const lotId = assyLot || smtRun?.lotId || sourceLotId;
  const interfaceMetric = stageMetric(includedEvents, ['M130', 'M121']);
  const splits = includedEvents
    .filter(event => event.eventName === 'Split' && event.step === 'M165' && event.changedValues)
    .map(event => ({ lotId: cleanText(event.changedValues, 120), qty: quantity(event.changedQty), remainingQty: quantity(event.qty) }));
  return {
    lotId, sourceLotId, lotIdSource: assyLot ? 'ASSYLOT' : smtRun ? 'M010 SMT input' : 'filename',
    sourceKind: smtRun ? 'SMT input RUN ID' : 'See LOT events', smtInputRun: Boolean(smtRun), pmsRequired: Boolean(smtRun),
    smtInputQuantity: smtRun?.quantity || '', smtInputAt: smtRun?.dateTime || '', smtSplitCount: smtRun ? String(smtRun.splitCount) : '',
    filename: String(filename).split(/[\\/]/).pop().slice(0, 200), partNumber: cleanText(partNumber, 500),
    asOf: includedEvents[0].dateTime, currentQty: quantity(includedEvents[0].qty), initialQty: smtRun?.quantity || interfaceMetric.in, status: lotStatus(includedEvents),
    interface: interfaceMetric, m160: stageMetric(includedEvents, ['M160']), m164: stageMetric(includedEvents, ['M164']),
    m165: stageMetric(includedEvents, ['M165']), m170: stageMetric(includedEvents, ['M170']), splits, steps: summarizeStepVisits(includedEvents),
    relations, recycles, excludedCancelCount: String(events.length - includedEvents.length),
    originSplitLotIds: includedEvents.at(-1)?.eventName === 'Split' ? [embeddedLotId(includedEvents.at(-1).changedValues)].filter(Boolean) : [],
  };
}

export function resolveTrackerSummaries(summaries) {
  // LOTID sequence is not lineage evidence; reserved split values remain undefined.
  const pending = new Set(summaries.filter(summary => opaqueFileLotId(summary.lotId)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const child of summaries.filter(summary => !pending.has(summary))) {
      const origins = new Set(child.originSplitLotIds || []);
      for (const incoming of (child.relations || []).filter(relation => relation.eventName === 'Split' && origins.has(relation.relatedLotId))) {
        const matches = [...pending].filter(candidate => (candidate.relations || []).some(outgoing => outgoing.eventName === 'Split'
          && outgoing.relatedLotId === child.lotId && outgoing.dateTime === incoming.dateTime && outgoing.step === incoming.step
          && Number(outgoing.changedQty) === Number(incoming.changedQty) && Number(outgoing.qty) !== Number(outgoing.changedQty)));
        if (matches.length !== 1 || summaries.some(summary => summary !== matches[0] && summary.lotId === incoming.relatedLotId)) continue;
        const parent = matches[0];
        parent.lotId = incoming.relatedLotId;
        parent.lotIdSource = `Reciprocal Split ${child.lotId}`;
        pending.delete(parent); changed = true;
      }
    }
    for (const parent of summaries.filter(summary => !pending.has(summary))) {
      for (const outgoing of (parent.relations || []).filter(relation => isOutgoingSplit(parent, relation))) {
        const matches = [...pending].filter(candidate => (candidate.relations || []).some(incoming => incoming.eventName === 'Split'
          && incoming.relatedLotId === parent.lotId && incoming.dateTime === outgoing.dateTime && incoming.step === outgoing.step
          && Number(incoming.changedQty) === Number(outgoing.changedQty) && Number(incoming.qty) === Number(outgoing.changedQty)));
        if (matches.length !== 1) continue;
        const child = matches[0];
        child.lotId = outgoing.relatedLotId;
        child.lotIdSource = `Split ${parent.lotId}`;
        pending.delete(child); changed = true;
      }
    }
  }
  const seen = new Set();
  for (const summary of summaries) {
    if (!summary.lotId || seen.has(summary.lotId)) throw Error(`Duplicate LOTID ${summary.lotId}`);
    seen.add(summary.lotId);
  }
  return summaries;
}

function reportRow(parent, split = null, child = null, includeParent = true) {
  const blank = emptyMetric();
  const interfaceMetric = includeParent ? parent.interface : blank;
  const m160 = includeParent ? parent.m160 : blank;
  const m164 = includeParent ? parent.m164 : blank;
  const finalLot = child || (!split ? parent : null);
  const m165 = finalLot?.m165 || blank;
  const m170 = finalLot?.m170 || blank;
  return {
    partNumber: includeParent ? parent.partNumber : '', lotNo: includeParent ? parent.lotId : '', quantity: includeParent ? parent.initialQty : '',
    interface: interfaceMetric, m160, m164, lotSplit: split?.lotId || '', splitQty: split?.qty || '', m165, m170,
    status: finalLot?.status || '',
  };
}

export function buildTrackerReportRows(summaries) {
  const byId = new Map(summaries.map(summary => [summary.lotId, summary]));
  const childIds = new Set(summaries.flatMap(summary => summary.splits.map(split => split.lotId)));
  const parents = summaries.filter(summary => !childIds.has(summary.lotId));
  const rows = [];
  for (const parent of parents) {
    if (!parent.splits.length) {
      rows.push(reportRow(parent));
      continue;
    }
    parent.splits.forEach((split, index) => rows.push(reportRow(parent, split, byId.get(split.lotId), index === 0)));
    const remaining = parent.splits[0]?.remainingQty;
    if (remaining && remaining !== '0') rows.push(reportRow(parent, { lotId: parent.lotId, qty: remaining }, parent, false));
  }
  return rows;
}

const HEADER_TOP = ['PART NO', 'LOT NO', "Q'ty", 'M121/M130 (INTERFACE)', '', '', '', '', '', 'M160 (AVI)', '', '', '', '', '', 'M164 (FVI)', '', '', '', '', 'Lot Split', "Q'ty", 'M165 (Basic)', '', '', '', '', 'M170 ( Packing )', '', '', '', '', 'Status'];
const HEADER_SUB = ['', '', '', 'EQP', 'IN', 'OUT', 'SCRAP', 'FAIL', 'YLD', 'EQP', 'IN', 'OUT', 'SCRAP', 'FAIL', 'YLD', 'IN', 'OUT', 'SCRAP', 'FAIL Code', 'YLD', '', '', 'IN', 'OUT', "Q'ty Fail", 'FAIL Code', 'YLD', 'IN', 'OUT', 'SCRAP', 'FAIL Code', 'YLD', ''];

function rowValues(row) {
  return [
    row.partNumber, row.lotNo, row.quantity,
    row.interface.eqp, row.interface.in, row.interface.out, row.interface.failCodes, row.interface.failQty, row.interface.yld,
    row.m160.eqp, row.m160.in, row.m160.out, row.m160.failCodes, row.m160.failQty, row.m160.yld,
    row.m164.in, row.m164.out, row.m164.failQty, row.m164.failCodes, row.m164.yld,
    row.lotSplit, row.splitQty,
    row.m165.in, row.m165.out, row.m165.failQty, row.m165.failCodes, row.m165.yld,
    row.m170.in, row.m170.out, row.m170.failQty, row.m170.failCodes, row.m170.yld,
    row.status,
  ];
}

function tsvCell(value) {
  const text = String(value ?? '');
  return /[\t\r\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function trackerReportText(rows) {
  return [HEADER_TOP, HEADER_SUB, ...rows.map(rowValues)].map(row => row.map(tsvCell).join('\t')).join('\r\n');
}

export function trackerReportWorkbook(rows, summaries = []) {
  const sheet = utils.aoa_to_sheet([HEADER_TOP, HEADER_SUB, ...rows.map(rowValues)]);
  sheet['!merges'] = [
    ...[0, 1, 2, 20, 21, 32].map(col => ({ s: { r: 0, c: col }, e: { r: 1, c: col } })),
    { s: { r: 0, c: 3 }, e: { r: 0, c: 8 } }, { s: { r: 0, c: 9 }, e: { r: 0, c: 14 } },
    { s: { r: 0, c: 15 }, e: { r: 0, c: 19 } }, { s: { r: 0, c: 22 }, e: { r: 0, c: 26 } },
    { s: { r: 0, c: 27 }, e: { r: 0, c: 31 } },
  ];
  sheet['!cols'] = HEADER_TOP.map((_, index) => ({ wch: [0, 1, 20, 32].includes(index) ? 20 : (index === 2 || index === 21 ? 9 : 12) }));
  const book = utils.book_new();
  utils.book_append_sheet(book, sheet, 'LOT Tracker');
  if (summaries.length) {
    const followUp = utils.aoa_to_sheet(followUpMatrix(summaries));
    followUp['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 18 }, { wch: 20 }, { wch: 10 }, { wch: 30 }, { wch: 44 }, { wch: 22 }];
    utils.book_append_sheet(book, followUp, 'LOT Follow-up');
  }
  return new Uint8Array(write(book, { type: 'array', bookType: 'xlsx', compression: true }));
}

function validateMetric(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid report metric');
  return Object.fromEntries(METRIC_KEYS.map(key => [key, cleanText(value[key] ?? '')]));
}

function validateRelations(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 500) throw Error('Invalid LOT relations');
  return value.map(item => ({
    eventName: cleanText(item?.eventName, 40), dateTime: cleanText(item?.dateTime, 100), step: cleanText(item?.step, 20),
    qty: cleanText(item?.qty, 100), changedQty: cleanText(item?.changedQty, 100), relatedLotId: cleanText(item?.relatedLotId, 120),
  }));
}

function validateRecycles(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 500) throw Error('Invalid recycle LOTs');
  return value.map(item => ({ lotId: cleanText(item?.lotId, 120), qty: cleanText(item?.qty, 100), dateTime: cleanText(item?.dateTime, 100), step: cleanText(item?.step, 20) }));
}

export function validateTrackerPayload(value) {
  if (String(value || '').length > 2 * 1024 * 1024) throw Error('Report too large');
  let parsed;
  try { parsed = JSON.parse(String(value || '')); } catch { throw Error('Invalid report'); }
  if (!Array.isArray(parsed) || !parsed.length || parsed.length > MAX_FILES) throw Error(`1-${MAX_FILES} reports`);
  const seen = new Set();
  return parsed.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw Error('Invalid report');
    const lotId = cleanText(item.lotId, 120);
    if (!lotId || seen.has(lotId)) throw Error('Duplicate LOTID');
    seen.add(lotId);
    if (!Array.isArray(item.splits) || item.splits.length > 200) throw Error('Invalid split LOTs');
    return {
      lotId, sourceLotId: cleanText(item.sourceLotId || lotId, 120), lotIdSource: cleanText(item.lotIdSource || 'filename', 200),
      sourceKind: cleanText(item.sourceKind || 'See LOT events', 100), mergeTarget: cleanText(item.mergeTarget, 120),
      filename: cleanText(String(item.filename || '').split(/[\\/]/).pop(), 200), partNumber: cleanText(item.partNumber, 500),
      fab: cleanText(item.fab, 20), tier: cleanText(item.tier, 20), opt: cleanText(item.opt, 20), smtQuantity: cleanText(item.smtQuantity, 100),
      smtInputRun: item.smtInputRun === true, pmsRequired: item.pmsRequired === true,
      smtInputQuantity: cleanText(item.smtInputQuantity, 100), smtInputAt: cleanText(item.smtInputAt, 100), smtSplitCount: cleanText(item.smtSplitCount, 20),
      asOf: cleanText(item.asOf, 100), currentQty: cleanText(item.currentQty, 100), initialQty: cleanText(item.initialQty, 100), status: cleanText(item.status, 500),
      interface: validateMetric(item.interface), m160: validateMetric(item.m160), m164: validateMetric(item.m164),
      m165: validateMetric(item.m165), m170: validateMetric(item.m170),
      steps: validateSteps(item.steps, cleanText),
      splits: item.splits.map(split => ({ lotId: cleanText(split?.lotId, 120), qty: cleanText(split?.qty, 100), remainingQty: cleanText(split?.remainingQty, 100) })),
      relations: validateRelations(item.relations), recycles: validateRecycles(item.recycles), excludedCancelCount: cleanText(item.excludedCancelCount, 20),
    };
  });
}

async function boundedForm(request) {
  if (!request.body) throw Error('Files required');
  const reader = request.body.getReader(), chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_BODY_BYTES) { await reader.cancel(); throw Error('12MB total'); }
    chunks.push(value);
  }
  return new Response(new Blob(chunks), { headers: { 'content-type': request.headers.get('content-type') || '' } }).formData();
}

function normalizedKey(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9가-힣]/g, '');
}

function pickPartNumber(data) {
  if (!data || typeof data !== 'object') return '';
  for (const [key, value] of Object.entries(data)) {
    if (['PARTNUMBER', 'PARTNO', '파트넘버'].includes(normalizedKey(key)) && String(value || '').trim()) return String(value).trim();
  }
  return '';
}

async function loadPartNumbers(env, lotIds) {
  const requested = new Set(lotIds), parts = new Map();
  for (let index = 0; index < lotIds.length; index += 80) {
    const ids = lotIds.slice(index, index + 80);
    const found = await env.DB.prepare(`SELECT lot_id,data_json FROM tech_lot_info WHERE lot_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
    for (const row of found.results) {
      try { const part = pickPartNumber(JSON.parse(row.data_json)); if (part) parts.set(row.lot_id, part); } catch {}
    }
  }
  const daily = await env.DB.prepare(`SELECT lv.value AS lot_ids,pv.value AS part_number,u.id
    FROM tech_daily_update_value lv
    JOIN tech_daily_field lf ON lf.id=lv.field_id AND lf.label='LOTID'
    JOIN tech_daily_update u ON u.id=lv.update_id
    JOIN tech_daily_update_value pv ON pv.update_id=u.id
    JOIN tech_daily_field pf ON pf.id=pv.field_id AND pf.label='파트넘버'
    WHERE lv.value IS NOT NULL AND pv.value IS NOT NULL ORDER BY u.id DESC LIMIT 1000`).all();
  for (const row of daily.results) {
    for (const lotId of String(row.lot_ids || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
      if (requested.has(lotId) && !parts.has(lotId)) parts.set(lotId, String(row.part_number || '').trim());
    }
  }
  return parts;
}

function trackerFields(summary, partNumber) {
  const stepFields = Object.fromEntries(['SMT', ...Object.keys(summary.steps || {}).filter(step => !['M010', 'M015'].includes(step))].flatMap(step => {
    const visits = step === 'SMT'
      ? [summary.steps?.M010?.at(-1), summary.steps?.M015?.at(-1)].filter(Boolean)
      : (summary.steps?.[step] || []);
    const visit = reportVisit(summary, step);
    return visit ? [['EQP', visit.eqp], ['IN', visit.in], ['OUT', visit.out], ['TRACK_IN', visit.inAt], ['TRACK_OUT', visit.outAt], ['YLD', visit.yld], ['FAIL_QTY', visit.failQty], ['SCRAP', visit.failCodes], ['VISITS', String(visits.length)]].map(([key, value]) => [`${step}_${key}`, value]) : [];
  }));
  return {
    LOTID: summary.lotId, PART_NUMBER: partNumber || '', QTY: summary.initialQty,
    INTERFACE_EQP: summary.interface.eqp, INTERFACE_IN: summary.interface.in, INTERFACE_OUT: summary.interface.out,
    INTERFACE_SCRAP: summary.interface.failCodes, INTERFACE_FAIL: summary.interface.failQty, INTERFACE_YLD: summary.interface.yld,
    M160_EQP: summary.m160.eqp, M160_IN: summary.m160.in, M160_OUT: summary.m160.out,
    M160_SCRAP: summary.m160.failCodes, M160_FAIL: summary.m160.failQty, M160_YLD: summary.m160.yld,
    M164_IN: summary.m164.in, M164_OUT: summary.m164.out, M164_SCRAP: summary.m164.failQty, M164_FAIL_CODE: summary.m164.failCodes, M164_YLD: summary.m164.yld,
    LOT_SPLIT: summary.splits.map(split => split.lotId).join('\n'), LOT_SPLIT_QTY: summary.splits.map(split => split.qty).join('\n'),
    M165_IN: summary.m165.in, M165_OUT: summary.m165.out, M165_FAIL_QTY: summary.m165.failQty, M165_FAIL_CODE: summary.m165.failCodes, M165_YLD: summary.m165.yld,
    M170_IN: summary.m170.in, M170_OUT: summary.m170.out, M170_SCRAP: summary.m170.failQty, M170_FAIL_CODE: summary.m170.failCodes, M170_YLD: summary.m170.yld,
    STATUS: summary.status, DATA_AS_OF: summary.asOf, ...stepFields,
  };
}

async function saveSummaries(env, user, summaries) {
  const ids = summaries.map(summary => summary.lotId);
  const existingRows = ids.length ? (await env.DB.prepare(`SELECT lot_id,data_json FROM tech_lot_info WHERE lot_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results : [];
  const existing = new Map(existingRows.map(row => {
    try { return [row.lot_id, JSON.parse(row.data_json)]; } catch { return [row.lot_id, {}]; }
  }));
  const statements = summaries.map(summary => {
    const previous = existing.get(summary.lotId) || {};
    const preserved = Object.fromEntries(Object.entries(previous).filter(([key]) => !/^M\d{3}_STATE$/.test(key) && !/^(?:M010|M015|SMT)_/.test(key)));
    const data = { ...preserved, ...trackerFields(summary, summary.partNumber || pickPartNumber(previous)) };
    return env.DB.prepare(`INSERT INTO tech_lot_info(lot_id,data_json,source_filename,imported_by) VALUES (?,?,?,?)
      ON CONFLICT(lot_id) DO UPDATE SET data_json=excluded.data_json,source_filename=excluded.source_filename,imported_by=excluded.imported_by,updated_at=datetime('now')`)
      .bind(summary.lotId, JSON.stringify(data), `See LOT: ${summary.filename}`, user.id);
  });
  await env.DB.batch(statements);
}

function metricCells(metric, type, esc) {
  const values = type === 'equipment'
    ? [metric.eqp, metric.in, metric.out, metric.failCodes, metric.failQty, metric.yld]
    : [metric.in, metric.out, metric.failQty, metric.failCodes, metric.yld];
  return values.map(value => `<td style="white-space:pre-wrap">${esc(value)}</td>`).join('');
}

function renderReport(summaries, w, esc) {
  const rows = buildTrackerReportRows(summaries);
  const payload = JSON.stringify(summaries);
  const missingChildren = summaries.some(summary => summary.splits.some(split => !summaries.some(candidate => candidate.lotId === split.lotId)));
  const followUp = followUpMatrix(summaries);
  return `<div class="card"><h3>${esc(w.report)} · ${summaries.length} LOT</h3>
    <form method="post"><input type="hidden" name="action" value="select"><input type="hidden" name="reportMode" value="steps"><input type="hidden" name="payload" value="${esc(payload)}"><button>${esc({ko: '스텝별 보고서로 전환', en: 'Report by step', vi: 'Báo cáo theo công đoạn'}[Object.keys(trackerWords).find(key => trackerWords[key] === w)] || 'Report by step')}</button></form>
    <p class="muted">${esc(w.source)}: ${esc(summaries.map(summary => summary.filename).join(', '))}</p>
    <p class="muted">${esc(w.asOf)}: ${esc(summaries.map(summary => `${summary.lotId} ${summary.asOf}`).join(' · '))}</p>
    <p class="muted">${esc(w.partMissing)}</p>${missingChildren ? `<p role="status">${esc(w.splitMissing)}</p>` : ''}
    <div style="overflow:auto;max-height:620px"><table><thead><tr>
      <th rowspan="2">PART NO</th><th rowspan="2">LOT NO</th><th rowspan="2">Q'ty</th>
      <th colspan="6">M121/M130 (INTERFACE)</th><th colspan="6">M160 (AVI)</th><th colspan="5">M164 (FVI)</th>
      <th rowspan="2">Lot Split</th><th rowspan="2">Q'ty</th><th colspan="5">M165 (Basic)</th><th colspan="5">M170 (Packing)</th><th rowspan="2">Status</th>
      </tr><tr><th>EQP</th><th>IN</th><th>OUT</th><th>SCRAP</th><th>FAIL</th><th>YLD</th><th>EQP</th><th>IN</th><th>OUT</th><th>SCRAP</th><th>FAIL</th><th>YLD</th><th>IN</th><th>OUT</th><th>SCRAP</th><th>FAIL Code</th><th>YLD</th><th>IN</th><th>OUT</th><th>Q'ty Fail</th><th>FAIL Code</th><th>YLD</th><th>IN</th><th>OUT</th><th>SCRAP</th><th>FAIL Code</th><th>YLD</th></tr></thead>
      <tbody>${rows.map(row => `<tr><td>${esc(row.partNumber)}</td><td>${esc(row.lotNo)}</td><td>${esc(row.quantity)}</td>${metricCells(row.interface, 'equipment', esc)}${metricCells(row.m160, 'equipment', esc)}${metricCells(row.m164, 'process', esc)}<td>${esc(row.lotSplit)}</td><td>${esc(row.splitQty)}</td>${metricCells(row.m165, 'process', esc)}${metricCells(row.m170, 'process', esc)}<td>${esc(row.status)}</td></tr>`).join('')}</tbody></table></div>
    <details open><summary>LOT Follow-up · ${followUp.length - 1}</summary><div style="overflow:auto;max-height:420px"><table><thead><tr>${followUp[0].map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${followUp.slice(1).map(row => `<tr>${row.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>
    <details><summary>${esc(w.copy)}</summary><textarea id="tracker-report-text" rows="12" readonly style="width:100%;white-space:pre">${esc(trackerReportText(rows))}</textarea><button type="button" class="secondary" data-copy-tracker>${esc(w.copy)}</button><span data-copy-status class="muted"></span></details>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><form method="post"><input type="hidden" name="action" value="download"><input type="hidden" name="payload" value="${esc(payload)}"><button class="secondary">${esc(w.excel)}</button></form>
    <form method="post"><input type="hidden" name="action" value="apply"><input type="hidden" name="payload" value="${esc(payload)}"><button>${esc(w.apply)}</button></form></div></div>
    <script>(function(){var b=document.querySelector('[data-copy-tracker]');if(!b)return;b.addEventListener('click',async function(){var t=document.getElementById('tracker-report-text');try{await navigator.clipboard.writeText(t.value);document.querySelector('[data-copy-status]').textContent=${JSON.stringify(w.copied)};}catch(e){t.select();}});})();</script>`;
}

export async function handleLotTracker(request, env, user, { lang, esc, render }) {
  const url = new URL(request.url), w = trackerWords[lang];
  let notice = '', report = '', status = 200;
  if (request.method === 'POST') {
    try {
      const form = await boundedForm(request);
      const action = String(form.get('action') || 'preview');
      let summaries;
      if (['apply', 'download', 'select'].includes(action)) {
        summaries = validateTrackerPayload(form.get('payload'));
      } else {
        const files = form.getAll('files').filter(file => file && typeof file.arrayBuffer === 'function' && file.name);
        if (!files.length || files.length > MAX_FILES) throw Error(`1-${MAX_FILES} files`);
        summaries = [];
        for (const file of files) {
          if (!/\.(?:xlsx?|csv)$/i.test(file.name) || file.size > MAX_FILE_BYTES) throw Error(`${file.name}: .csv / .xls / .xlsx / 2MB`);
          const summary = summarizeSeeLotWorkbook(new Uint8Array(await file.arrayBuffer()), file.name);
          summaries.push(summary);
        }
        resolveTrackerSummaries(summaries);
        const parts = await loadPartNumbers(env, summaries.map(summary => summary.lotId));
        summaries.forEach(summary => { summary.partNumber = parts.get(summary.lotId) || ''; });
      }
      const stepMode = String(form.get('reportMode') || (action === 'preview' ? 'steps' : 'fixed')) === 'steps';
      const selection = stepMode ? selectedSteps(form, summaries) : null;
      if (action === 'download') {
        if (stepMode && !selection.selected.length) throw Error('Select at least one step');
        const bytes = stepMode ? stepReportWorkbook(summaries, selection.selected, lang) : trackerReportWorkbook(buildTrackerReportRows(summaries), summaries);
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        return new Response(bytes, { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="lot-tracker-report-${date}.xlsx"`, 'cache-control': 'no-store' } });
      }
      if (action === 'apply') {
        await saveSummaries(env, user, summaries);
        return new Response(null, { status: 303, headers: { location: `/lot-tracker?saved=${summaries.length}` } });
      }
      report = stepMode ? renderStepReport(summaries, selection, lang, w, esc) : renderReport(summaries, w, esc);
    } catch (error) {
      notice = `${w.fileError}: ${error.message}`; status = 400;
    }
  }
  const saved = Math.max(0, Number.parseInt(url.searchParams.get('saved') || '0', 10) || 0);
  const body = `<h2>${esc(w.title)}</h2><p class="muted">${esc(w.pending)}</p>${notice ? `<p role="alert">${esc(notice)}</p>` : ''}${saved ? `<p role="status">${saved}${esc(w.saved)}</p>` : ''}
    <div class="card"><h3>${esc(w.pending)}</h3><p>${esc(w.future)}</p><label>${esc(w.lotIds)}<textarea rows="6" placeholder="LOTID-001&#10;LOTID-002"></textarea></label><button type="button" disabled>${esc(w.connect)}</button></div>
    <div class="card"><h3>${esc(w.upload)}</h3><p>${esc(w.guide)}</p><form method="post" enctype="multipart/form-data"><input type="hidden" name="action" value="preview"><input type="file" name="files" accept=".csv,.xls,.xlsx" multiple required aria-label="${esc(w.upload)}"><button>${esc(w.preview)}</button></form></div>${report}`;
  return render(body, status);
}
