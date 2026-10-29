import { utils, write } from 'xlsx/xlsx.mjs';

export const STEP_ROUTES = {
  MDL: ['SMT', 'M033', 'M050', 'M055', 'M060', 'M065', 'M070'],
  SSD: ['M031', 'SMT', 'M033', 'M087', 'M100', 'M111', 'M120', 'M121', 'M130', 'M160', 'M165', 'M170'],
};
const STEP_PATTERN = /^M\d{3}$/;
const REPORT_COLUMNS = ['EQP', 'IN', 'OUT', 'FAIL', 'SCRAP', 'YLD'];
const HISTORY_COLUMNS = ['EQP', 'Track In', 'IN', 'Track Out', 'OUT', 'FAIL', 'SCRAP', 'YLD'];
const FOLLOW_UP_COLUMNS = ['Priority', 'LOT NO', 'Type', 'Observed at', 'QTY', 'Status / reason', 'Required check', 'Source LOT'];
const SPLIT_FLOW_COLUMNS = ['Root LOT', 'Level', 'Type', 'LOT NO', 'Parent / Target', 'Split / Merge QTY', 'Current QTY', 'Timestamp', 'Status'];
const FOLLOW_UP_WORDS = {
  ko: { headers: ['우선순위', 'LOTID', '구분', '관측 시각', '수량', '상태 / 사유', '확인할 사항', '원 LOT'], priority: { High: '긴급', Monitor: '추적', Lookup: '조회 필요' }, type: { 'Uploaded LOT': '업로드 LOT', 'Split LOT': '분할 LOT', 'Recycle LOT': '회수 LOT' } },
  en: { headers: FOLLOW_UP_COLUMNS, priority: {}, type: {} },
  vi: { headers: ['Ưu tiên', 'LOT NO', 'Loại', 'Thời điểm', 'QTY', 'Trạng thái / lý do', 'Nội dung cần kiểm tra', 'LOT nguồn'], priority: { High: 'Cao', Monitor: 'Theo dõi', Lookup: 'Cần tra cứu' }, type: { 'Uploaded LOT': 'LOT đã tải', 'Split LOT': 'LOT tách', 'Recycle LOT': 'LOT tái chế' } },
};
const WORDS = {
  ko: { choose: '보고서 스텝 선택', route: '공정 기준', auto: '파일에서 확인된 스텝', update: '선택 적용', all: '전체 선택', none: '전체 해제', note: '각 스텝의 최신 차수 IN/OUT과 전체 차수의 FAIL/SCRAP 누계를 표시합니다. SMT는 M010의 Track In과 M015의 Track Out을 한 행으로 연결합니다. 수량은 원본 단위를 유지하며 스텝 간 합산하지 않습니다.', detail: 'Track In / Out 상세 보기', missing: '이력 없음', select: '보고서에 포함할 스텝을 하나 이상 선택하세요.', legacy: '기존 고정 양식', dynamic: '스텝별 보고서', mode: '보고서 형식' },
  en: { choose: 'Select report steps', route: 'Process route', auto: 'Steps found in files', update: 'Apply selection', all: 'Select all', none: 'Clear all', note: 'Each step shows the latest visit IN/OUT and cumulative FAIL/SCRAP across all visits. SMT combines the M010 Track In with the M015 Track Out. Quantities retain their source units and are not added across steps.', detail: 'Show Track In / Out details', missing: 'No history', select: 'Select at least one report step.', legacy: 'Original fixed format', dynamic: 'Report by step', mode: 'Report format' },
  vi: { choose: 'Chọn công đoạn báo cáo', route: 'Quy trình', auto: 'Công đoạn có trong tệp', update: 'Áp dụng', all: 'Chọn tất cả', none: 'Bỏ chọn', note: 'Hiển thị lượt mới nhất của mỗi công đoạn. SMT nối Track In của M010 với Track Out của M015. Giữ nguyên đơn vị số lượng, không cộng giữa các công đoạn.', detail: 'Xem chi tiết Track In / Out', missing: 'Không có lịch sử', select: 'Chọn ít nhất một công đoạn.', legacy: 'Mẫu cố định ban đầu', dynamic: 'Báo cáo theo công đoạn', mode: 'Mẫu báo cáo' },
};

export function timestamp(text) {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4}) (\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5], +(iso[6] || 0));
  if (us) return Date.UTC(us[3].length === 2 ? 2000 + +us[3] : +us[3], +us[1] - 1, +us[2], +us[4], +us[5], +(us[6] || 0));
  return null;
}

export function withoutCancelledEvents(events) {
  const ordered = events.map((event, index) => ({ event, index, time: timestamp(event.dateTime) }));
  ordered.sort((a, b) => a.time !== null && b.time !== null && a.time !== b.time ? a.time - b.time : b.index - a.index);
  const excluded = new Set(), open = new Map();
  for (const item of ordered) {
    const eventName = String(item.event.eventName || '');
    const cancellation = /cancel/i.test(eventName) || /MULTI_OPERATOR_CANCEL/i.test(String(item.event.comment || ''));
    if (cancellation) {
      excluded.add(item.index);
      if (/TrackInCancel/i.test(eventName)) {
        const input = open.get(item.event.step);
        if (input !== undefined) excluded.add(input);
        open.delete(item.event.step);
      }
      continue;
    }
    if (eventName === 'TrackIn') open.set(item.event.step, item.index);
    if (eventName === 'TrackOut') open.delete(item.event.step);
  }
  return events.filter((_, index) => !excluded.has(index));
}
function qty(value) {
  const text = String(value ?? '').replace(/,/g, '').trim();
  return /^\d+(?:\.\d+)?$/.test(text) && Number.isFinite(Number(text)) ? text : '';
}

// See LOT exports are newest first; reverse order breaks equal-minute ties.
export function summarizeStepVisits(events) {
  const ordered = withoutCancelledEvents(events).map((event, index) => ({ ...event, index, time: timestamp(event.dateTime) }));
  ordered.sort((a, b) => a.time !== null && b.time !== null && a.time !== b.time ? a.time - b.time : b.index - a.index);
  const steps = new Map();
  for (const event of ordered) {
    if (!STEP_PATTERN.test(event.step) || !['TrackIn', 'TrackOut', 'Scrap'].includes(event.eventName)) continue;
    let visits = steps.get(event.step);
    if (!visits) { visits = []; steps.set(event.step, visits); }
    let visit = visits.at(-1);
    if (event.eventName === 'TrackIn') {
      if (visit && !visit.outAt) visit.state = 'interrupted';
      visit = { eqp: '', inAt: event.dateTime, in: qty(event.qty), outAt: '', out: '', failQty: '', failCodes: '', yld: '', state: 'running' };
      visits.push(visit);
    } else if (event.eventName === 'TrackOut') {
      if (!visit || visit.outAt || !visit.inAt) {
        visit = { eqp: '', inAt: '', in: '', outAt: '', out: '', failQty: '', failCodes: '', yld: '', state: 'outOnly' };
        visits.push(visit);
      }
      visit.outAt = event.dateTime; visit.out = qty(event.qty);
      visit.state = visit.inAt ? 'completed' : 'outOnly';
      if (Number(visit.in) > 0 && visit.out !== '') visit.yld = (Number(visit.out) / Number(visit.in) * 100).toFixed(1) + '%';
    } else {
      // A scrap outside an open visit cannot be attributed to a paired cycle.
      if (!visit || visit.outAt || !visit.inAt) continue;
      const count = Number(qty(event.changedQty));
      if (count > 0) {
        visit.failQty = String(Number(visit.failQty || 0) + count);
        const code = String(event.comment || '').split(/[\/;]/, 1)[0].trim().slice(0, 80) || 'FAIL';
        visit.failCodes += (visit.failCodes ? '\n' : '') + `${code}*${count}`;
      }
    }
    if (visit && ['TrackIn', 'TrackOut'].includes(event.eventName) && event.eqp && event.eqp !== '-') visit.eqp = event.eqp;
  }
  return Object.fromEntries([...steps].filter(([, visits]) => visits.length));
}

export function isOutgoingSplit(summary, relation) {
  if (relation?.eventName !== 'Split' || !relation.relatedLotId) return false;
  if ((summary?.originSplitLotIds || []).includes(relation.relatedLotId)) return false;
  const splitCount = (summary?.relations || []).filter(item => item.eventName === 'Split' && item.relatedLotId).length;
  return splitCount > 1 || Number(relation.qty) !== Number(relation.changedQty);
}

function mergeDirections(summary) {
  const directions = new Map();
  const originIds = new Set(summary?.originSplitLotIds || []);
  const groups = new Map();
  for (const [index, relation] of (summary?.relations || []).entries()) {
    const key = timestamp(relation.dateTime) || relation.dateTime || `unknown-${index}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ relation, index });
  }
  let previousQty;
  for (const [, entries] of [...groups].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const remaining = [...entries];
    while (remaining.length) {
      let selected = -1;
      if (Number.isFinite(previousQty)) {
        selected = remaining.findIndex(({ relation }) => {
          if (relation.eventName !== 'Merge') return false;
          const current = Number(relation.qty), moved = Number(relation.changedQty);
          return Number.isFinite(current) && Number.isFinite(moved)
            && (current === previousQty + moved || current === previousQty - moved);
        });
      }
      if (selected < 0) selected = remaining.findIndex(({ relation }) => relation.eventName === 'Split' && originIds.has(relation.relatedLotId));
      if (selected < 0) selected = 0;
      const [{ relation, index }] = remaining.splice(selected, 1);
      const current = Number(relation.qty), moved = Number(relation.changedQty);
      if (relation.eventName === 'Merge') {
        let direction = 'unknown';
        if (Number.isFinite(previousQty) && Number.isFinite(current) && Number.isFinite(moved)) {
          if (current === previousQty + moved) direction = 'incoming';
          else if (current === previousQty - moved) direction = 'outgoing';
        } else if (current === 0 && moved > 0) direction = 'outgoing';
        directions.set(index, direction);
      }
      if (Number.isFinite(current)) previousQty = current;
    }
  }
  return directions;
}

export function followUpRows(summaries) {
  const rows = new Map();
  const put = row => {
    const previous = rows.get(row.lotId);
    if (!previous || row.rank < previous.rank) rows.set(row.lotId, row);
  };
  for (const summary of summaries) {
    const status = String(summary.status || '');
    if (!/^(?:Ship|Terminated)$/i.test(status)) put({
      rank: 1, priority: /^Hold\b/i.test(status) ? 'High' : 'Monitor', lotId: summary.lotId, type: 'Uploaded LOT',
      observedAt: summary.asOf, qty: summary.currentQty || summary.initialQty, status: status || 'Current status unavailable',
      action: /^Hold\b/i.test(status) ? 'Confirm disposition and release' : 'Confirm next process and latest quantity', sourceLot: summary.lotId,
    });
    for (const relation of summary.relations || []) {
      if (!isOutgoingSplit(summary, relation)) continue;
      const uploaded = summaries.some(candidate => candidate.lotId === relation.relatedLotId);
      put({ rank: 2, priority: uploaded ? 'Monitor' : 'Lookup', lotId: relation.relatedLotId, type: 'Split LOT',
        observedAt: relation.dateTime, qty: relation.changedQty, status: uploaded ? 'Uploaded' : `No uploaded history after ${relation.step}`,
        action: 'Query See LOT for current process, status and quantity', sourceLot: summary.lotId });
    }
    for (const recycle of summary.recycles || []) put({
      rank: 3, priority: 'Lookup', lotId: recycle.lotId, type: 'Recycle LOT', observedAt: recycle.dateTime, qty: recycle.qty,
      status: `Created from ${recycle.step}`, action: 'Confirm recycle, re-entry or disposal result', sourceLot: summary.lotId,
    });
  }
  return [...rows.values()].sort((a, b) => a.rank - b.rank || (timestamp(b.observedAt) || 0) - (timestamp(a.observedAt) || 0) || a.lotId.localeCompare(b.lotId));
}

export function followUpMatrix(summaries, lang = 'en') {
  const words = FOLLOW_UP_WORDS[lang] || FOLLOW_UP_WORDS.en;
  return [words.headers, ...followUpRows(summaries).map(row => {
    let status = row.status, action = row.action;
    if (lang === 'ko') {
      status = status === 'Uploaded' ? '파일 있음' : status.replace(/^No uploaded history after /, '이후 업로드 이력 없음: ').replace(/^Created from /, '생성 공정: ');
      action = action === 'Confirm disposition and release' ? '판정 결과 및 Hold 해제 확인' : action === 'Confirm next process and latest quantity' ? '다음 공정 및 최신 수량 확인' : action === 'Query See LOT for current process, status and quantity' ? 'See LOT에서 현재 공정·상태·수량 조회' : '회수·재투입·폐기 결과 확인';
    }
    return [words.priority[row.priority] || row.priority, row.lotId, words.type[row.type] || row.type, row.observedAt, row.qty, status, action, row.sourceLot];
  })];
}

export function splitFlowRows(summaries) {
  const byId = new Map(summaries.map(summary => [summary.lotId, summary]));
  const relations = summaries.flatMap(summary => {
    const directions = mergeDirections(summary);
    return (summary.relations || []).map((relation, index) => ({ ...relation, sourceLot: summary.lotId,
      outgoingSplit: isOutgoingSplit(summary, relation), mergeDirection: directions.get(index) || '' }));
  });
  const splits = relations.filter(relation => relation.outgoingSplit);
  const activeSplits = splits; // Preserve split history after later merges.
  const activeChildren = new Set(activeSplits.map(relation => relation.relatedLotId));
  const roots = summaries.filter(summary => !activeChildren.has(summary.lotId));
  const rows = [];
  const visit = (rootLot, parentLot, level, seen) => {
    const childEvents = [
      ...activeSplits.filter(relation => relation.sourceLot === parentLot).map(relation => ({ ...relation, kind: 'Split' })),
      ...relations.filter(relation => relation.sourceLot === parentLot && relation.eventName === 'Merge').map(relation => ({ ...relation, kind: 'Merge' })),
    ].sort((a, b) => (timestamp(a.dateTime) || 0) - (timestamp(b.dateTime) || 0)
      || (a.kind === b.kind ? (Number(b.qty) + Number(b.changedQty)) - (Number(a.qty) + Number(a.changedQty)) : (a.kind === 'Split' ? -1 : 1)));
    for (const event of childEvents) {
      if (event.kind === 'Merge') {
        if (event.mergeDirection === 'incoming') {
          const source = byId.get(event.relatedLotId);
          rows.push({ rootLot, level, type: 'Merge', lotId: event.relatedLotId, parentTarget: parentLot,
            quantity: event.changedQty, currentQty: source?.currentQty || '', dateTime: event.dateTime, status: `Merged into ${parentLot}` });
        } else if (event.mergeDirection === 'outgoing') {
          rows.push({ rootLot, level, type: 'Merge', lotId: parentLot, parentTarget: event.relatedLotId,
            quantity: event.changedQty, currentQty: event.qty, dateTime: event.dateTime, status: `Merged into ${event.relatedLotId}` });
        } else {
          rows.push({ rootLot, level, type: 'Merge', lotId: parentLot, parentTarget: event.relatedLotId,
            quantity: event.changedQty, currentQty: event.qty, dateTime: event.dateTime, status: `Merge direction unconfirmed: ${parentLot} ↔ ${event.relatedLotId}` });
        }
        continue;
      }
      if (seen.has(event.relatedLotId)) continue;
      seen.add(event.relatedLotId);
      const child = byId.get(event.relatedLotId);
      rows.push({ rootLot, level, type: 'Split', lotId: event.relatedLotId, parentTarget: parentLot, quantity: event.changedQty,
        currentQty: child?.currentQty || '', dateTime: event.dateTime, status: child?.status || 'No follow-up file' });
      visit(rootLot, event.relatedLotId, level + 1, seen);
    }
  };
  for (const root of roots) {
    const rootSplits = splits.filter(relation => relation.sourceLot === root.lotId).sort((a, b) => (timestamp(a.dateTime) || 0) - (timestamp(b.dateTime) || 0));
    const initial = rootSplits.length ? String(Math.max(...rootSplits.map(split => Number(split.qty) + Number(split.changedQty)))) : (root.initialQty || root.currentQty);
    rows.push({ rootLot: root.lotId, level: 0, type: 'Root', lotId: root.lotId, parentTarget: '', quantity: initial,
      currentQty: root.currentQty, dateTime: root.asOf, status: root.status });
    visit(root.lotId, root.lotId, 1, new Set([root.lotId]));
  }
  return rows;
}

export function splitFlowMatrix(summaries, lang = 'en') {
  const headers = lang === 'ko' ? ['원 LOT', '단계', '구분', 'LOTID', '부모 / 병합 대상', '분할 / 병합 수량', '현재 수량', 'Timestamp', '상태'] : SPLIT_FLOW_COLUMNS;
  return [headers, ...splitFlowRows(summaries).map(row => {
    let type = row.type, status = row.status;
    if (lang === 'ko') {
      type = { Root: '원 LOT', Split: '분할', Merge: '병합' }[type] || type;
      status = status === 'No follow-up file' ? '후속 파일 없음' : status.replace(/^Merged into /, '병합 완료 → ')
        .replace(/^Merge direction unconfirmed: /, '병합 방향 확인 필요: ');
    }
    return [row.rootLot, row.level, type, row.lotId, row.parentTarget, row.quantity, row.currentQty, row.dateTime, status];
  })];
}

export function validateSteps(value, clean) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 200) throw Error('Invalid steps');
  return Object.fromEntries(Object.entries(value).map(([step, visits]) => {
    if (!STEP_PATTERN.test(step) || !Array.isArray(visits) || visits.length > 10000) throw Error('Invalid step visits');
    return [step, visits.map(visit => {
      if (!visit || typeof visit !== 'object' || !['running', 'completed', 'outOnly', 'interrupted'].includes(visit.state)) throw Error('Invalid visit');
      return Object.fromEntries(['eqp', 'inAt', 'in', 'outAt', 'out', 'failQty', 'failCodes', 'yld', 'state'].map(key => [key, clean(visit[key] ?? '', key === 'failCodes' ? 4000 : 100)]));
    })];
  }));
}

export function stepOptions(summaries, route = '') {
  const observed = summaries.flatMap(s => Object.keys(s.steps || {}).map(step => ['M010', 'M015'].includes(step) ? 'SMT' : step));
  const routeSteps = STEP_ROUTES[route] || [];
  const order = step => step === 'SMT' ? 32.5 : Number(step.slice(1));
  const extras = [...new Set(observed)].filter(step => !routeSteps.includes(step)).sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  return [...routeSteps, ...extras];
}
export function selectedSteps(form, summaries) {
  const route = String(form.get('route') || '');
  if (route && !STEP_ROUTES[route]) throw Error('Invalid process route');
  const options = stepOptions(summaries, route);
  const selected = form.has('selection') ? [...new Set(form.getAll('steps').map(String))] : options;
  if (selected.some(step => !options.includes(step))) throw Error('Invalid report step');
  return { route, options, selected: options.filter(step => selected.includes(step)) };
}
function mergeFailureValues(...visits) {
  const failures = visits.filter(Boolean);
  const failQty = failures.reduce((total, visit) => total + (Number(visit.failQty) || 0), 0);
  const failCodes = failures.map(visit => visit.failCodes).filter(Boolean).join('\n');
  return { failQty: failQty ? String(failQty) : '', failCodes };
}
export function reportVisit(summary, step) {
  if (step !== 'SMT') {
    const visits = summary.steps?.[step] || [];
    if (!visits.length) return null;
    return { ...visits.at(-1), ...mergeFailureValues(...visits) };
  }
  const m010 = summary.steps?.M010?.at(-1) || null;
  const m015 = summary.steps?.M015?.at(-1) || null;
  if (!m010 && !m015) return null;
  const failures = mergeFailureValues(...(summary.steps?.M010 || []), ...(summary.steps?.M015 || []));
  const input = m010?.in || '';
  const out = m015?.out || '';
  return {
    eqp: [m010?.eqp, m015?.eqp].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(' → '),
    inAt: m010?.inAt || '', in: input, outAt: m015?.outAt || '', out,
    ...failures, yld: Number(input) > 0 && out !== '' ? `${((Number(out) / Number(input)) * 100).toFixed(1)}%` : '',
  };
}

export function scrapSummaryMatrix(summaries, selected) {
  const rows = [['LOT NO', 'STEP', 'Visit', 'Track In', 'Track Out', 'IN', 'OUT', 'FAIL QTY', 'SCRAP Code', 'YLD']];
  for (const summary of summaries) for (const step of selected) {
    const visits = step === 'SMT' ? [...(summary.steps?.M010 || []), ...(summary.steps?.M015 || [])] : (summary.steps?.[step] || []);
    visits.forEach((visit, index) => {
      if (!(Number(visit.failQty) > 0) && !visit.failCodes) return;
      rows.push([summary.lotId, step, index + 1, visit.inAt, visit.outAt, visit.in, visit.out, visit.failQty, visit.failCodes, visit.yld]);
    });
  }
  return rows;
}
function reportValues(visit) {
  return visit ? [visit.eqp, visit.in, visit.out, visit.failQty, visit.failCodes, visit.yld] : ['', '', '', '', '', ''];
}
function historyValues(visit) {
  return visit ? [visit.eqp, visit.inAt, visit.in, visit.outAt, visit.out, visit.failQty, visit.failCodes, visit.yld] : ['', '', '', '', '', '', '', ''];
}
export function stepReportMatrix(summaries, selected, lang = 'ko') {
  const top = ['PART NO', 'LOT NO', 'Status', ...selected.flatMap(step => [step, ...Array(REPORT_COLUMNS.length - 1).fill('')])];
  const sub = ['', '', '', ...selected.flatMap(() => REPORT_COLUMNS)];
  return [top, sub, ...summaries.map(s => [s.partNumber, s.lotId, s.status, ...selected.flatMap(step => {
    return reportValues(reportVisit(s, step));
  })])];
}
export function stepReportWorkbook(summaries, selected, lang) {
  const matrix = stepReportMatrix(summaries, selected, lang);
  const sheet = utils.aoa_to_sheet(matrix);
  sheet['!merges'] = [...[0, 1, 2].map(c => ({ s: { r: 0, c }, e: { r: 1, c } })), ...selected.map((_, i) => ({ s: { r: 0, c: 3 + i * REPORT_COLUMNS.length }, e: { r: 0, c: 2 + (i + 1) * REPORT_COLUMNS.length } }))];
  sheet['!cols'] = matrix[0].map(() => ({ wch: 20 }));
  const book = utils.book_new(); utils.book_append_sheet(book, sheet, 'LOT Steps');
  const scrap = utils.aoa_to_sheet(scrapSummaryMatrix(summaries, selected));
  scrap['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 8 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 28 }, { wch: 12 }];
  utils.book_append_sheet(book, scrap, 'Scrap Summary');
  const history = [['LOT NO', 'STEP', 'Visit', ...HISTORY_COLUMNS]];
  for (const s of summaries) for (const step of selected) {
    const visits = step === 'SMT' ? [reportVisit(s, step)].filter(Boolean) : (s.steps?.[step] || []);
    visits.forEach((visit, i) => history.push([s.lotId, step, i + 1, ...historyValues(visit)]));
  }
  utils.book_append_sheet(book, utils.aoa_to_sheet(history), 'Track History');
  const followUp = utils.aoa_to_sheet(followUpMatrix(summaries, lang));
  followUp['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 18 }, { wch: 20 }, { wch: 10 }, { wch: 30 }, { wch: 44 }, { wch: 22 }];
  utils.book_append_sheet(book, followUp, 'LOT Follow-up');
  const splitFlow = utils.aoa_to_sheet(splitFlowMatrix(summaries, lang));
  splitFlow['!cols'] = [{ wch: 22 }, { wch: 8 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 28 }];
  utils.book_append_sheet(book, splitFlow, 'LOT Split Flow');
  return new Uint8Array(write(book, { type: 'array', bookType: 'xlsx', compression: true }));
}
const tsv = matrix => matrix.map(row => row.map(value => /[\t\r\n"]/.test(String(value ?? '')) ? '"' + String(value).replace(/"/g, '""') + '"' : String(value ?? '')).join('\t')).join('\r\n');

export function requiredPriorHistoryLots(summaries) {
  const uploaded = new Set(summaries.map(summary => summary.lotId));
  const required = new Set();
  for (const summary of summaries) {
    const missingSmt = !summary.steps?.M010?.length || !summary.steps?.M015?.length;
    const missingRouter = !summary.steps?.M033?.length;
    if (!missingSmt && !missingRouter) continue;
    for (const lotId of summary.originSplitLotIds || []) if (!uploaded.has(lotId)) required.add(lotId);
  }
  return [...required];
}

export function renderRunLinkNotices(summaries, w, esc) {
  return summaries.filter(summary => summary.runLinkType).map(summary => {
    const label = summary.runLinkType === 'direct' ? w.runDirect : w.runIndirect;
    const path = summary.runLinkType === 'direct'
      ? `${summary.runSourceLotId} → ${summary.lotId}`
      : `${summary.runSourceLotId} → ${summary.runViaLotId} → ${summary.lotId}`;
    return `<p role="status" class="lot-note"><strong>${esc(label)}:</strong> ${esc(path)}. ${esc(w.partFromRun)}</p>`;
  }).join('');
}

export function renderStepReport(summaries, selection, lang, w, esc) {
  const words = WORDS[lang], { route, options, selected } = selection;
  const required = requiredPriorHistoryLots(summaries);
  const requiredNotice = required.length ? `<p role="status" class="lot-note is-warn">${esc(w.splitMissing)} <strong>${esc(required.join(', '))}</strong></p>` : '';
  const runLinkNotices = renderRunLinkNotices(summaries, w, esc);
  const payload = `<input type="hidden" name="payload" value="${esc(JSON.stringify(summaries))}">`;
  const inputs = `<input type="hidden" name="reportMode" value="steps"><input type="hidden" name="route" value="${esc(route)}"><input type="hidden" name="selection" value="1">${selected.map(step => `<input type="hidden" name="steps" value="${step}">`).join('')}`;
  const matrix = stepReportMatrix(summaries, selected, lang);
  const history = summaries.flatMap(s => selected.flatMap(step => {
    const visits = step === 'SMT' ? [reportVisit(s, step)].filter(Boolean) : (s.steps?.[step] || []);
    return visits.map((visit, i) => `<tr><td>${esc(s.lotId)}</td><td>${step}</td><td>${i + 1}</td>${historyValues(visit).map(v => `<td style="white-space:pre">${esc(v)}</td>`).join('')}</tr>`);
  })).join('');
  const followUp = followUpMatrix(summaries, lang);
  const splitFlow = splitFlowMatrix(summaries, lang);
  return `<div class="card daily-part lot-report"><div class="daily-part-head"><h3>${esc(w.report)}</h3><span class="daily-count">${summaries.length} LOT</span></div><p class="muted">${esc(w.asOf)}: ${esc(summaries.map(s => `${s.lotId} ${s.asOf}`).join(" · "))}</p><p class="lot-guide">${esc(words.note)}</p>${runLinkNotices}${requiredNotice}
    <form method="post" id="step-selection" class="lot-step-form">${payload}<input type="hidden" name="action" value="select"><input type="hidden" name="selection" value="1">
    <div class="daily-filter"><label>${esc(words.mode)} <select name="reportMode"><option value="steps">${esc(words.dynamic)}</option><option value="fixed">${esc(words.legacy)}</option></select></label>
    <label>${esc(words.route)} <select name="route"><option value="">${esc(words.auto)}</option>${Object.keys(STEP_ROUTES).map(key => `<option value="${key}"${key === route ? ' selected' : ''}>${key === 'MDL' ? 'DM / MDL (Module)' : 'SSD'}</option>`).join('')}</select></label></div>
    <fieldset class="lot-steps"><legend>${esc(words.choose)}</legend><div class="lot-step-chips">${options.map(step => `<label class="lot-step-chip"><input type="checkbox" name="steps" value="${step}"${selected.includes(step) ? ' checked' : ''}>${step}</label>`).join('')}</div></fieldset>
    <div class="lot-step-buttons"><button type="button" data-step-all="1" class="secondary">${esc(words.all)}</button> <button type="button" data-step-all="0" class="secondary">${esc(words.none)}</button> <button>${esc(words.update)}</button></div></form>
    ${selected.length ? `<div class="lot-table-wrap"><table class="lot-table"><thead><tr><th rowspan="2">PART NO</th><th rowspan="2">LOT NO</th><th rowspan="2">Status</th>${selected.map(step => `<th colspan="${REPORT_COLUMNS.length}">${step}</th>`).join('')}</tr><tr>${selected.flatMap(() => REPORT_COLUMNS).map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${matrix.slice(2).map(row => `<tr>${row.map(v => `<td style="white-space:pre">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <details class="lot-section"><summary>${esc(words.detail)}</summary><div class="lot-table-wrap is-short"><table class="lot-table"><thead><tr>${['LOT NO', 'STEP', 'Visit', ...HISTORY_COLUMNS].map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${history}</tbody></table></div></details>
    <details open class="lot-section"><summary>LOT Follow-up · ${followUp.length - 1}</summary><div class="lot-table-wrap is-short"><table class="lot-table"><thead><tr>${followUp[0].map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${followUp.slice(1).map(row => `<tr>${row.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>
    <details open class="lot-section"><summary>LOT Split Flow</summary><div class="lot-table-wrap is-short"><table class="lot-table"><thead><tr>${splitFlow[0].map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${splitFlow.slice(1).map(row => `<tr>${row.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>
    <details class="lot-section"><summary>${esc(w.copy)}</summary><textarea id="step-report-text" rows="10" readonly class="lot-copy-text">${esc(tsv(matrix))}</textarea><button type="button" data-step-copy class="secondary">${esc(w.copy)}</button><span data-step-copy-status class="muted"></span></details>` : `<p role="status" class="lot-note is-warn">${esc(words.select)}</p>`}
    <p class="muted">${esc(w.partMissing)}</p>
    <div class="lot-actions">${selected.length ? `<form method="post">${payload}${inputs}<input type="hidden" name="action" value="download"><button class="secondary">${esc(w.excel)}</button></form>` : ''}<form method="post">${payload}<input type="hidden" name="action" value="apply"><button>${esc(w.apply)}</button></form></div></div>
    <script>(()=>{const copy=document.querySelector('[data-step-copy]');if(copy)copy.addEventListener('click',async()=>{const text=document.getElementById('step-report-text');try{await navigator.clipboard.writeText(text.value);document.querySelector('[data-step-copy-status]').textContent=${JSON.stringify(w.copied)};}catch{text.select();}});const form=document.getElementById('step-selection');form.querySelectorAll('[data-step-all]').forEach(b=>b.addEventListener('click',()=>form.querySelectorAll('[name=steps]').forEach(c=>c.checked=b.dataset.stepAll==='1')));form.querySelector('[name=route]').addEventListener('change',()=>{form.querySelector('[name=selection]').remove();form.requestSubmit();});})();</script>`;
}
