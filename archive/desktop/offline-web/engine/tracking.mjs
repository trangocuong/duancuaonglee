import { isOutgoingSplit } from './lot-step-report.js';

export function trackingLists(summaries) {
  const byId = new Map(summaries.map(s => [s.lotId, s]));
  const requests = new Map();
  const smt = [['원 LOT', 'SMT RUNID 후보', '근거', '관측 시각', '파일 포함 상태', '필요한 작업']];
  const splits = [['원 LOT', 'SPLIT LOT', '분할 공정', '관측 시각', '분할 수량', '파일 포함 상태', '필요한 작업']];
  function presence(id) {
    const target = byId.get(id);
    return !target ? '미포함' : target.sourceKind === 'PCB split / merge map' ? '맵만 포함 · See LOT 이력 필요' : 'See LOT 포함';
  }
  function request(id, type, source, evidence, action = 'See LOT 조회 파일 저장 → 추적 파일 추가 · 재분석', force = false) {
    if (!force && presence(id) === 'See LOT 포함') return;
    let row = requests.get(id);
    if (!row) requests.set(id, row = { id, types: new Set(), sources: new Set(), evidence: new Set(), actions: new Set() });
    row.types.add(type); row.sources.add(source); row.evidence.add(evidence); row.actions.add(action);
  }
  for (const summary of summaries) {
    const smtSplits = (summary.relations || []).filter(r => r.eventName === 'Split' && r.step === 'M010' && r.relatedLotId);
    const parents = smtSplits.filter(r => summary.sourceKind !== 'PCB split / merge map' && smtSplits.length === 1 && r.qty !== '' && r.changedQty !== '' && Number(r.qty) === Number(r.changedQty));
    if (summary.smtInputRun) {
      const evidence = `M010 SMT 투입 발행 및 Split 합계 ${summary.smtInputQuantity || '-'} · 5~7자리 000 RUN ID`;
      smt.push([summary.lotId, summary.lotId, evidence, summary.smtInputAt || summary.asOf || '', 'SMT 투입 RUN ID 이력 포함', 'PMS 정보 요청']);
      request(summary.lotId, 'PMS 정보', summary.lotId, evidence, 'PMS에서 RUN ID의 PART NO·FAB·TIER·OPT·투입수량 확인', true);
      for (const r of smtSplits.filter(relation => isOutgoingSplit(summary, relation))) {
        splits.push([summary.lotId, r.relatedLotId, r.step, r.dateTime, r.changedQty, presence(r.relatedLotId), 'PMS 정보 확인 후 필요한 LOT만 See LOT 조회']);
      }
      continue;
    } else if (summary.runLinkType) {
      // A RUNID CSV (LOT_ID/PROD_ID/MERGE_LOT) confirmed this link — no longer a guess.
      const via = summary.runLinkType === 'indirect' && summary.runViaLotId ? ` (경유 LOT: ${summary.runViaLotId})` : '';
      const evidence = `RUNID CSV ${summary.runLinkType === 'direct' ? '직접' : '간접'} 연결 확인됨${via}`;
      const observedAt = parents.find(r => r.relatedLotId === summary.runSourceLotId)?.dateTime || parents[0]?.dateTime || '';
      smt.push([summary.lotId, summary.runSourceLotId, evidence, observedAt, 'RUNID 맵 연결 완료', '맵은 공정 IN/OUT 이력을 대체하지 않습니다']);
      if (!summary.steps?.M010 || !summary.steps?.M015 || !summary.steps?.M033) {
        for (const id of summary.originSplitLotIds || []) request(id, '선행 이력 LOT', summary.lotId, 'SMT / M033 이력 누락 · See LOT 이벤트 파일 필요');
      }
    } else if (!parents.length) {
      smt.push([summary.lotId, '', 'M010 유입 Split 근거 없음', '', 'RUNID 미확인', 'SMT RUNID 또는 상위 LOT 연결 자료 확인']);
    } else {
      for (const r of parents) {
        const evidence = 'M010 유입 Split 연결 ID · RUNID 여부 확인 필요 (RUNID CSV 없음 · 추정)';
        smt.push([summary.lotId, r.relatedLotId, evidence, r.dateTime, presence(r.relatedLotId), presence(r.relatedLotId) === 'See LOT 포함' ? '상위 이력 및 RUNID 연결 확인' : '연결 ID의 See LOT 파일을 추가하세요']);
        request(r.relatedLotId, 'SMT RUNID 후보', summary.lotId, evidence);
      }
    }
    for (const r of summary.relations || []) {
      if (parents.includes(r) || !isOutgoingSplit(summary, r)) continue;
      splits.push([summary.lotId, r.relatedLotId, r.step, r.dateTime, r.changedQty, presence(r.relatedLotId), presence(r.relatedLotId) === 'See LOT 포함' ? '포함 완료 · 최신 상태 확인' : 'SPLIT LOT의 See LOT 파일을 추가하세요']);
      request(r.relatedLotId, 'SPLIT LOT', summary.lotId, r.step + ' Split');
    }
  }
  const missing = [...requests.values()].map(r => ({ id: r.id, types: [...r.types].join(' / '), sources: [...r.sources].join('\n'), evidence: [...r.evidence].join('\n'), action: [...r.actions].join('\n') })).sort((a, b) => a.id.localeCompare(b.id));
  return {
    missing,
    matrices: {
      '추가 파일 요청': [['조회할 ID', '구분', '원 LOT', '근거', '작업'], ...missing.map(r => [r.id, r.types, r.sources, r.evidence, r.action])],
      'SMT RUNID 추적': smt,
      'SPLIT LOT 목록': splits,
    },
  };
}
