import { isOutgoingSplit } from './lot-step-report.js';

export function trackingLists(summaries, maps = []) {
  const byId = new Map(summaries.map(s => [s.lotId, s]));
  const requests = new Map();
  const smt = [['원 LOT', 'SMT RUNID / 후보', '근거', '관측 시각', '파일 포함 상태', '필요한 작업']];
  const splits = [['원 LOT', 'SPLIT LOT', '분할 공정', '관측 시각', '분할 수량', '파일 포함 상태', '필요한 작업']];
  function presence(id) {
    const target = byId.get(id);
    return !target ? (maps.some(m => m.lotId === id) ? 'RUNID 맵 포함 · 공정 이력 별도' : '미포함') : target.sourceKind === 'PCB split / merge map' ? '맵만 포함 · See LOT 이력 필요' : 'See LOT 포함';
  }
  function request(id, type, source, evidence) {
    if (presence(id) === 'See LOT 포함') return;
    let row = requests.get(id);
    if (!row) requests.set(id, row = { id, types: new Set(), sources: new Set(), evidence: new Set() });
    row.types.add(type); row.sources.add(source); row.evidence.add(evidence);
  }
  for (const summary of summaries) {
    const smtSplits = (summary.relations || []).filter(r => r.eventName === 'Split' && r.step === 'M010' && r.relatedLotId);
    const parents = smtSplits.filter(r => summary.sourceKind !== 'PCB split / merge map' && smtSplits.length === 1 && r.qty !== '' && r.changedQty !== '' && Number(r.qty) === Number(r.changedQty));
    const linked = summary.runMapLinks || [];
    for (const link of linked) smt.push([summary.lotId, link.runId, link.type + ' · ' + link.via, '', 'RUNID 맵 연결 완료', '맵은 공정 IN/OUT 이력을 대체하지 않습니다']);
    if (!parents.length && !linked.length) smt.push([summary.lotId, '', 'M010 유입 Split 근거 없음', '', 'RUNID 미확인', 'SMT RUNID 또는 상위 LOT 연결 자료 확인']);
    for (const r of parents.filter(r => !linked.some(link => link.runId === r.relatedLotId))) {
      const evidence = 'M010 유입 Split 연결 ID · RUNID 여부 확인 필요';
      smt.push([summary.lotId, r.relatedLotId, evidence, r.dateTime, presence(r.relatedLotId), presence(r.relatedLotId) === 'See LOT 포함' ? '상위 이력 및 RUNID 연결 확인' : '연결 ID의 See LOT 파일을 추가하세요']);
      request(r.relatedLotId, 'SMT RUNID 후보', summary.lotId, evidence);
    }
    if (linked.length && (!summary.steps?.M010 || !summary.steps?.M015 || !summary.steps?.M033)) {
      for (const id of summary.originSplitLotIds || []) request(id, '선행 이력 LOT', summary.lotId, 'SMT / M033 이력 누락 · RUNID 맵과 별도로 See LOT 이력 필요');
    }
    for (const r of summary.relations || []) {
      if (parents.includes(r) || !isOutgoingSplit(summary, r)) continue;
      splits.push([summary.lotId, r.relatedLotId, r.step, r.dateTime, r.changedQty, presence(r.relatedLotId), presence(r.relatedLotId) === 'See LOT 포함' ? '포함 완료 · 최신 상태 확인' : 'SPLIT LOT의 See LOT 파일을 추가하세요']);
      request(r.relatedLotId, 'SPLIT LOT', summary.lotId, r.step + ' Split');
    }
  }
  const missing = [...requests.values()].map(r => ({ id: r.id, types: [...r.types].join(' / '), sources: [...r.sources].join('\n'), evidence: [...r.evidence].join('\n') })).sort((a, b) => a.id.localeCompare(b.id));
  return {
    missing,
    matrices: {
      '추가 파일 요청': [['조회할 ID', '구분', '원 LOT', '근거', '작업'], ...missing.map(r => [r.id, r.types, r.sources, r.evidence, 'See LOT 조회 파일 저장 → 추적 파일 추가 · 재분석'])],
      'SMT RUNID 추적': smt,
      'SPLIT LOT 목록': splits,
    },
  };
}
