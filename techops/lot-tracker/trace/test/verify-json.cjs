// trace-result.json 의 '내부 일관성'을 검산한다 (엔진 코드를 쓰지 않는 별도 구현).
//   node test/verify-json.cjs <trace-result.json>     (검증결과.zip 의 runs/<실행ID>/outputs/trace-result.json)
// 이 검산이 하는 것과 하지 않는 것 (0.3.3 — Codex 2차 검토 6번):
//   - 한다: JSON 안의 값끼리 서로 맞는지 (범위 형식, 합계 제약, LOT 수량 흐름, 라벨 형식, 위치 수지·기준 공정 수지 재계산).
//           값 하나를 손으로 바꾸면 대부분 여기서 드러난다.
//   - 하지 않는다: 원본 MES 이벤트로부터 LOT 구성을 처음부터 다시 계산하는 것 — JSON 에는 이벤트 원본이 없다.
//           구성 계산 자체가 맞는지는 test/test-property.cjs(제품 한 개 단위 재생)로 확인한다.
// 확인 항목
//   - 모든 범위 0 ≤ 최소 ≤ 최대, 이동·불량 한 건마다 라벨 범위 합이 수량을 포함
//   - 이력 있는 계보/확산 LOT: 현재 구성 범위 합이 현재 수량을 포함 (0.3.3)
//   - 이력 있는 LOT: 수량 연속성 문제가 없으면 현재 수량 = 생성 수량 + 병합 유입 − 병합 반출 − 분할 반출 − 불량 (0.3.3)
//   - 구성·이동·불량·범위 밖 이동의 라벨마다 LOT ID 가 들어 있음 (0.3.3)
//   - 확산 LOT 의 유입 경로가 계보/확산 LOT (또는 병합 LOT 미확인 SMT Array) 에서 시작
//   - 위치 수지: SMT 감소·불량·기타 감소·이력 있는 LOT 합계·위치 미확정 LOT 목록과 범위·수지 일치 여부를 JSON 값으로 다시 계산해 기록값과 비교
//   - 기준 공정 수지도 같은 방식으로 다시 계산
//   - 위치 미확정 LOT 이 '추가 필요 LOT' 에 올라 있는지
'use strict';
function verify(j) {
  const P = [];
  if (!j || j.schema !== 2) { P.push('schema 2 가 아님 (' + (j && j.schema) + ')'); return P; }
  const eq = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
  const add = (a, r) => { if (r) { a[0] += r[0]; a[1] += r[1]; } };
  const rs = r => r ? r[0] + '~' + r[1] : '없음';
  const spreadIds = (j.spread || []).map(x => x.id);
  const ids = j.family.concat(spreadIds);
  const inIds = {}; ids.forEach(id => { inIds[id] = true; });
  const loaded = id => !!(j.lots[id]);
  // 범위
  Object.keys(j.comp || {}).forEach(id => Object.keys(j.comp[id]).forEach(k => { const r = j.comp[id][k]; if (!(r[0] >= 0 && r[0] <= r[1])) P.push(`구성 범위 이상 ${id} ${k} ${rs(r)}`); }));
  const sumCheck = (what, part, q) => { let lo = 0, hi = 0; Object.keys(part || {}).forEach(k => { lo += part[k][0]; hi += part[k][1]; }); if (!(lo <= q && q <= hi)) P.push(`${what}: 라벨 합 ${lo}~${hi} 이 수량 ${q} 를 포함하지 않음`); };
  (j.transfers || []).forEach(t => sumCheck('이동 ' + t.key, t.part, t.qty));
  (j.scrapComp || []).forEach(s => sumCheck('불량 ' + s.lot + ' ' + s.time, s.scrapped, s.qty));
  // 0.3.3: 이력 있는 LOT 의 현재 구성 합 ⊇ 현재 수량
  ids.forEach(id => { const L = j.lots[id]; if (L && j.comp && j.comp[id]) sumCheck('현재 구성 ' + id, j.comp[id], L.finalQty); });
  // 0.3.3: 이력 있는 LOT 의 수량 흐름 (수량 연속성 문제가 없고 생성 기록이 있을 때): 현재 = 생성 + 유입 − 반출 − 분할 − 불량
  Object.keys(j.lots || {}).forEach(id => {
    const L = j.lots[id];
    if (!L || (L.qtyIssues && L.qtyIssues.length) || !(L.origin || L.splitFrom)) return;
    const sum = (a, f) => (a || []).reduce((s, x) => s + (f ? f(x) : x.qty), 0);
    const flow = L.createdQty + sum(L.mergeIns) - sum(L.mergeOuts) - sum(L.splitOuts) - sum(L.scraps);
    if (flow !== L.finalQty) P.push(`LOT ${id} 수량 흐름: 생성 ${L.createdQty} + 유입 − 반출 − 분할 − 불량 = ${flow} ≠ 현재 수량 ${L.finalQty}`);
  });
  // 0.3.3: 라벨 형식 — 모든 라벨에 LOT ID 가 들어 있어야 한다 (RUNID·다른 RUNID·기타(LOT)·미확인(LOT)·…)
  const LOTID = /[A-Z][0-9][A-Z0-9]{8}/;
  const labels = (what, c) => Object.keys(c || {}).forEach(k => { if (!LOTID.test(k)) P.push(`${what}: 라벨 '${k}' 에 LOT ID 가 없음`); });
  Object.keys(j.comp || {}).forEach(id => labels('구성 ' + id, j.comp[id]));
  (j.transfers || []).forEach(t => labels('이동 ' + t.key, t.part));
  (j.scrapComp || []).forEach(s => labels('불량 ' + s.lot + ' ' + s.time, s.scrapped));
  (j.outside || []).concat(j.otherOut || []).forEach(o => labels('범위 밖/기타 감소 ' + o.lot, o.part));
  // 확산 LOT 의 유입 경로 시작은 계보/확산 LOT, 또는 (0.3.3) 병합 LOT 을 모르는 SMT Array LOT (그 LOT 에서 받은 기록이 있는 이력 있는 LOT)
  const smtSub = id => !!(j.smt && j.smt.subs && j.smt.subs[id] !== undefined);
  (j.spread || []).forEach(x => { if (!inIds[x.via.from] && !smtSub(x.via.from)) P.push(`확산 LOT ${x.id} 의 유입 경로 시작 ${x.via.from} 이 계보/확산 LOT 이 아님`); if (typeof x.entryTs !== 'number') P.push(`확산 LOT ${x.id} 유입 시각 없음`); });

  function smtLossOf() {
    const s = j.smt;
    if (!s) return 0;
    if (!s.hosts.length || s.unresolved.length || !s.hosts.every(h => s.hostInfo[h])) return null;
    let subTotal = 0, hq = 0;
    Object.keys(s.subs).forEach(k => { subTotal += s.subs[k]; });
    s.hosts.forEach(h => { hq += s.hostInfo[h].qty; });
    return subTotal - hq;
  }
  function open(comp, label, outside) {
    const list = [], byId = {}; let lo = 0, hi = 0;
    const push = (id, r) => { if (!r || r[1] <= 0) return; if (byId[id]) { byId[id][0] += r[0]; byId[id][1] += r[1]; } else { byId[id] = [r[0], r[1]]; list.push(id); } lo += r[0]; hi += r[1]; };
    ids.forEach(id => { if (!loaded(id)) push(id, comp[id] && comp[id][label]); });
    if (j.smt) j.smt.unresolved.forEach(id => push(id, [0, j.smt.subs[id]]));
    (outside || []).forEach(o => push(o.lot, o.part[label]));
    return { list, byId, lo, hi };
  }
  function balance(total, kLo, kHi, mLo, mHi, has) {
    const loBal = total - kHi, hiBal = total - kLo;
    if (!has) return { unknown: [0, 0], imbalance: loBal > 0 ? loBal : (hiBal < 0 ? hiBal : 0) };
    const lo = Math.max(0, loBal), hi = Math.min(hiBal, mHi);
    if (lo > hi) return { unknown: [Math.min(mLo, mHi), mHi], imbalance: loBal > mHi ? loBal - mHi : hiBal };
    return { unknown: [lo, hi], imbalance: 0 };
  }
  const missSet = {}; (j.missing || []).forEach(m => { missSet[m.id] = m; });
  const S = j.runidSummary, R = j.runLabel;
  if (S) {
    const total = j.lots[j.root].origin.qty;
    if (S.total !== total) P.push(`투입 ${S.total} ≠ RUNID 이력 ${total}`);
    const smtLoss = smtLossOf();
    if (S.smtLoss !== smtLoss) P.push(`SMT 감소 기록 ${S.smtLoss} ≠ 재계산 ${smtLoss}`);
    const scrap = [0, 0], other = [0, 0], known = [0, 0];
    (j.scrapComp || []).forEach(s => add(scrap, s.scrapped[R]));
    (j.otherOut || []).forEach(o => add(other, o.part[R]));
    const holders = [];
    ids.forEach(id => { const L = j.lots[id], r = j.comp[id] && j.comp[id][R]; if (L && r && r[1] > 0 && L.finalQty > 0) { add(known, r); holders.push(id); } });
    if (!eq(scrap, S.scrap)) P.push(`불량 기록 ${rs(S.scrap)} ≠ 재계산 ${rs(scrap)}`);
    if (!eq(other, S.other)) P.push(`기타 감소 기록 ${rs(S.other)} ≠ 재계산 ${rs(other)}`);
    if (!eq(known, S.knownSum)) P.push(`이력 있는 LOT 합(LOT별 범위 합) 기록 ${rs(S.knownSum)} ≠ 재계산 ${rs(known)}`);
    if (holders.slice().sort().join() !== S.holders.map(h => h.id).sort().join()) P.push('이력 있는 LOT 목록이 다름');
    S.holders.forEach(h => { if (!eq(h.range, j.comp[h.id] && j.comp[h.id][R])) P.push(`이력 있는 LOT ${h.id} 범위 ${rs(h.range)} ≠ 구성 ${rs(j.comp[h.id] && j.comp[h.id][R])}`); });
    const o = open(j.comp, R, j.outside);
    if (o.list.slice().sort().join() !== S.missingHolders.map(h => h.id).sort().join()) P.push('위치 미확정 LOT 목록이 다름');
    S.missingHolders.forEach(h => { if (!eq(h.range, o.byId[h.id])) P.push(`위치 미확정 LOT ${h.id} 범위 ${rs(h.range)} ≠ 재계산 ${rs(o.byId[h.id])}`); });
    const sl = smtLoss || 0;
    const b = balance(total - sl, scrap[0] + other[0] + known[0], scrap[1] + other[1] + known[1], o.lo, o.hi, o.list.length > 0);
    if (!eq(b.unknown, S.unknown)) P.push(`위치 미확정 기록 ${rs(S.unknown)} ≠ 재계산 ${rs(b.unknown)}`);
    if ((b.imbalance || 0) !== (S.imbalance || 0) || S.balanced !== !b.imbalance) P.push(`수지 일치 여부 기록(${S.balanced}, ${S.imbalance}) ≠ 재계산(${!b.imbalance}, ${b.imbalance})`);
    // 최종 합계가 투입을 포함하는지 (수지가 맞다고 기록된 경우)
    if (S.balanced) {
      const lo = sl + S.scrap[0] + S.other[0] + S.known[0] + S.unknown[0], hi = sl + S.scrap[1] + S.other[1] + S.known[1] + S.unknown[1];
      if (!(lo <= total && total <= hi)) P.push(`수지 일치로 기록됐지만 합계 ${lo}~${hi} 가 투입 ${total} 을 포함하지 않음`);
      if (!(S.known[0] >= known[0] && S.known[1] <= known[1])) P.push(`이력 있는 LOT 합계 ${rs(S.known)} 가 LOT별 합 ${rs(known)} 밖`);
    }
    S.missingHolders.forEach(h => { if (h.kind !== '추적 범위 밖으로 이동' && !missSet[h.id]) P.push(`위치 미확정 LOT ${h.id} 가 추가 필요 LOT 에 없음`); });
  }
  const ref = j.ref, F = ref && ref.summary;
  if (F && S) {
    const total = S.total, smtLoss = smtLossOf();
    const tested = [0, 0], scrapPre = [0, 0], otherPre = [0, 0], pending = [0, 0];
    (ref.tested || []).forEach(t => add(tested, t.converted));
    (ref.scrapComp || []).forEach(s => add(scrapPre, s.scrapped[ref.pre]));
    (ref.otherOut || []).forEach(x => add(otherPre, x.part[ref.pre]));
    ids.forEach(id => { const L = j.lots[id], c = ref.comp[id] || {}; if (L && L.finalQty > 0 && c[ref.pre] && c[ref.pre][1] > 0) add(pending, c[ref.pre]); });
    [['테스트됨', tested, F.tested], ['전 불량', scrapPre, F.scrapPre], ['전 기타 감소', otherPre, F.otherPre], ['미진행', pending, F.pending]].forEach(x => { if (!eq(x[1], x[2])) P.push(`기준 수지 ${x[0]} 기록 ${rs(x[2])} ≠ 재계산 ${rs(x[1])}`); });
    const o = open(ref.comp, ref.pre, ref.outside);
    const b = balance(total - (smtLoss || 0), scrapPre[0] + otherPre[0] + tested[0] + pending[0], scrapPre[1] + otherPre[1] + tested[1] + pending[1], o.lo, o.hi, o.list.length > 0);
    if (!eq(b.unknown, F.unknown)) P.push(`기준 수지 이력 미확인 기록 ${rs(F.unknown)} ≠ 재계산 ${rs(b.unknown)}`);
    if (F.balanced !== !b.imbalance) P.push('기준 수지 일치 여부가 다름');
  }
  return P;
}
module.exports = { verify };
if (require.main === module) {
  const f = process.argv[2];
  if (!f) { console.log('사용법: node test/verify-json.cjs <trace-result.json>'); process.exit(0); }
  const j = JSON.parse(require('fs').readFileSync(f, 'utf8'));
  const p = verify(j);
  if (!p.length) console.log('verify-json: ' + f + ' — JSON 만으로 다시 계산한 결과가 기록값과 모두 일치');
  else { console.log('verify-json: 불일치 ' + p.length + '건'); p.forEach(x => console.log('  ' + x)); process.exitCode = 1; }
}
