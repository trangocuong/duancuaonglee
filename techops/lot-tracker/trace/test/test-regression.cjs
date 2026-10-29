// 외부 검토(Codex) 지적 6건 + 추가 발견 재현 사례 — 0.3.2 에서 고친 동작을 고정한다.
//   node test/test-regression.cjs            (LT_SRC=<다른 src> 로 이전 버전 비교 가능)
// 화면 동작(3번: 입력 변경 후 이전 결과, 4번: 실패 실행 기록)은 test/test-e2e-inputs.cjs 에서 브라우저로 확인한다.
const vm = require('vm'), fs = require('fs'), path = require('path'), assert = require('assert');
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../vendor/xlsx-js-style.bundle.js'), 'utf8'));
const SRC = process.env.LT_SRC || path.join(__dirname, '../src');
const LT = require(path.join(SRC, 'engine.js')); require(path.join(SRC, 'report.js'));
const { verify } = require('./verify-json.cjs');
const H = ['EVENT_NAME', 'DATE/TIME', 'QTY', 'STEP', 'EQP', 'LINE', 'OPERID', 'CHG_ITEM', 'CHG_VALS', 'QTY', 'COMMENT'];
// lots: { LOTID: [[event, 'HH:MM:SS', qty, step, eqp, chgVals, chgQty, comment], ...] (시간순) }, pms: [[RUNID, SN, SPLIT_LOT, MERGE_LOT]]
function ds(lots, pms) {
  const d = new LT.FileDataSource();
  Object.keys(lots).forEach(id => {
    const rows = [H].concat(lots[id].slice().reverse().map(e => [e[0], '2026-09-20 ' + e[1], e[2], e[3], e[4] || '-', 'VMDL', 'T', '', e[5] || '', e[6] || 0, e[7] || '']));
    rows.push(['Time : 2026-09-20 18:00:00']);
    d.addParsed(LT.parseSheetRows(rows, id + '.xlsx'));
  });
  if (pms) d.addParsed(LT.parseSheetRows([['LOT_ID', 'BARCODE_SERLNO', 'SPLIT_LOT', 'MERGE_LOT', 'PROD_ID']].concat(pms.map(r => r.concat(['P']))), 'pms.xlsx'));
  return d;
}
const check = (res, item) => res.checks.filter(c => c.item.indexOf(item) === 0);

// Execute the real browser renderer with DOM startup disabled. The hook exists
// only inside this test VM; production HTML gains no test-only API.
let diagramRenderer;
function diagramHtml(res) {
  if (!diagramRenderer) {
    const sandbox = { window: { LotTracer: LT, addEventListener() {} }, document: { addEventListener() {} } };
    const source = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8');
    const marker = '  window.LOTTrackerPane = ';
    assert.ok(source.includes(marker), 'browser renderer test hook anchor missing');
    vm.runInNewContext(source.replace(marker, '  window.__testLineageDiagram = lineageDiagramHtml;\n' + marker), sandbox);
    diagramRenderer = sandbox.window.__testLineageDiagram;
  }
  return diagramRenderer(res, LT.buildTracerGrid(res));
}

const results = [];
const T = async (name, fn) => { try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, e.message.split('\n')[0]]); } };
const jsonOk = res => { const p = verify(JSON.parse(JSON.stringify(LT.serializeResult(res)))); assert.deepStrictEqual(p, [], 'JSON 검산: ' + p.join(' / ')); };

(async () => {
  // ---- 1. 같은 두 LOT 사이 반복 병합 ----
  const c1 = {
    T1A0000001: [['ISSUE_VMS1_VMDL', '08:00:00', 100, 'M010', '-', '', 100], ['Merge', '09:00:00', 70, 'M100', '-', 'T1B0000001', 30], ['Merge', '10:00:00', 100, 'M100', '-', 'T1X0000001', 30], ['Merge', '11:00:00', 70, 'M100', '-', 'T1B0000001', 30]],
    T1B0000001: [['Merge', '09:00:00', 30, 'M100', '-', 'T1A0000001', 30], ['Merge', '11:00:00', 60, 'M100', '-', 'T1A0000001', 30]]
  };
  await T('1 반복 병합: B = A 30~60 / X 0~30, A 잔량 = A 40~70 / X 0~30, MERGE 대조 2건 일치', async () => {
    const r = await LT.trace(ds(c1), 'T1A0000001');
    const X = 'T1X0000001(RUNID 미확인)';
    assert.deepStrictEqual(r.comp.T1B0000001, { T1A0000001: [30, 60], [X]: [0, 30] });
    assert.deepStrictEqual(r.comp.T1A0000001, { T1A0000001: [40, 70], [X]: [0, 30] });
    const m = check(r, 'MERGE 보낸쪽');
    assert.deepStrictEqual(m.map(c => c.level), ['PASS']); assert.ok(/2건 일치/.test(m[0].detail));
    assert.deepStrictEqual(r.runidSummary.known, [100, 100]);
    jsonOk(r);
  });
  const c1b = {
    T1A0000002: [['ISSUE_VMS1_VMDL', '08:00:00', 100, 'M010', '-', '', 100], ['Split', '09:00:00', 60, 'M100', '-', 'T1C0000002', 40], ['Merge', '10:00:00', 90, 'M100', '-', 'T1X0000002', 30], ['Merge', '11:00:00', 60, 'M100', '-', 'T1C0000002', 30]],
    T1C0000002: [['Split', '09:00:00', 40, 'M100', '-', 'T1A0000002', 40], ['Merge', '11:00:00', 70, 'M100', '-', 'T1A0000002', 30]]
  };
  await T('1b 분할 뒤 같은 LOT 으로 병합: C = A 40~70 / X 0~30, A = A 30~60 / X 0~30', async () => {
    const r = await LT.trace(ds(c1b), 'T1A0000002');
    const X = 'T1X0000002(RUNID 미확인)';
    assert.deepStrictEqual(r.comp.T1C0000002, { T1A0000002: [40, 70], [X]: [0, 30] });
    assert.deepStrictEqual(r.comp.T1A0000002, { T1A0000002: [30, 60], [X]: [0, 30] });
    jsonOk(r);
  });
  await T('1c 받은 쪽에만 있는 병합은 MERGE 대조 경고', async () => {
    const lots = JSON.parse(JSON.stringify(c1));
    lots.T1B0000001.push(['Merge', '12:00:00', 65, 'M100', '-', 'T1A0000001', 5]);
    const r = await LT.trace(ds(lots), 'T1A0000001');
    assert.ok(check(r, 'MERGE 보낸쪽').some(c => c.level === 'WARN' && /보낸 쪽 이력에 없음/.test(c.detail)));
  });

  // ---- 2. SMT Array 분할 자식 행방 ----
  const c2 = { T2R0000001: [['ISSUE_VMS1_VMDL', '08:00:00', 100, 'M010', '-', '', 100], ['Split', '09:00:00', 0, 'M010', '-', 'T2S0000001', 100], ['Terminated', '09:00:00', 0, 'M010']] };
  await T('2 병합 LOT 미확인 Array: 필수(전개) 요청, SMT 감소 미확인, 위치 미확정 100, PASS 아님', async () => {
    const r = await LT.trace(ds(c2), 'T2R0000001');
    const m = r.missing.find(x => x.id === 'T2S0000001');
    assert.ok(m && m.level === 1 && m.levelText === '필수(전개)', JSON.stringify(m));
    const S = r.runidSummary;
    assert.strictEqual(S.smtLoss, null); assert.deepStrictEqual(S.unknown, [100, 100]); assert.ok(S.balanced);
    assert.strictEqual(check(r, '확산 추적')[0].level, 'WARN');
    assert.notStrictEqual(check(r, '계보 수량 수지')[0].level, 'PASS');
    assert.ok(!/SMT 감소 100/.test(check(r, '계보 수량 수지')[0].detail));
    jsonOk(r);
  });
  const c2b = {
    T2R0000002: [['ISSUE_VMS1_VMDL', '08:00:00', 6, 'M010', '-', '', 6], ['Split', '08:01:00', 4, 'M010', '-', 'T2H0000002', 2], ['Split', '08:02:00', 2, 'M010', '-', 'T2S1000002', 2], ['Split', '08:03:00', 0, 'M010', '-', 'T2S2000002', 2]]
  };
  const pms2b = [['T2R0000002', 'A1', 'T2H0000002', 'T2H0000002'], ['T2R0000002', 'A2', 'T2S1000002', 'T2H0000002'], ['T2R0000002', 'A3', 'T2S2000002', 'T2H0000002']];
  await T('2b 병합 LOT 이력 없음(PMS 있음): 위치 미확정 6 (범위 뒤집힘 없음), 병합 LOT 필수', async () => {
    const r = await LT.trace(ds(c2b, pms2b), 'T2R0000002');
    const S = r.runidSummary;
    assert.deepStrictEqual(S.unknown, [6, 6]); assert.strictEqual(S.smtLoss, null); assert.ok(S.balanced);
    assert.ok(r.missing.some(x => x.id === 'T2H0000002' && x.level === 1));
    jsonOk(r);
  });

  // ---- 5. 확산 LOT 유입 전/후 불량 ----
  const c5 = {
    T5F0000001: [['ISSUE_VMS1_VMDL', '08:00:00', 100, 'M010', '-', '', 100], ['Merge', '12:00:00', 60, 'M130', '-', 'T5Y0000001', 40]],
    T5Y0000001: [['Split', '07:00:00', 50, 'M120', '-', 'T5Z0000001', 50], ['Scrap', '08:00:00', 48, 'M120', '-', '', 2, '9999/pre-entry'], ['Merge', '12:00:00', 88, 'M130', '-', 'T5F0000001', 40], ['TrackIn', '12:30:00', 88, 'M130', 'AI-T01'], ['TrackOut', '13:00:00', 88, 'M130', 'AI-T01']]
  };
  const sheetRows = (res, name) => { const sh = LT.buildSheets(res).find(s => s.name === name); return sh ? sh.rows : []; };
  const gridHas = (res, v) => LT.buildTracerGrid(res).cells.some(row => row.some(c => c && c.v === v));
  await T('5 유입 전 불량(TrackIn 없음): 흐름표·공정 수율·불량 내역 모두 제외', async () => {
    const r = await LT.trace(ds(c5), 'T5F0000001');
    assert.ok(!gridHas(r, '9999*2'), '흐름표에 유입 전 불량이 있음');
    assert.ok(!sheetRows(r, '공정 수율').some(x => x[0] === 'M120'), '공정 수율에 유입 전 불량이 있음');
    assert.strictEqual(sheetRows(r, '불량 내역').length, 0);
  });
  const c5b = {
    T5F0000002: [['ISSUE_VMS1_VMDL', '08:00:00', 100, 'M010', '-', '', 100], ['Merge', '12:00:00', 60, 'M130', '-', 'T5Y0000002', 40]],
    T5Y0000002: [['Split', '05:00:00', 50, 'M130', '-', 'T5Z0000002', 50], ['TrackIn', '06:00:00', 50, 'M130', 'AI-T01'], ['TrackOut', '06:30:00', 50, 'M130', 'AI-T01'], ['Merge', '12:00:00', 90, 'M130', '-', 'T5F0000002', 40], ['Scrap', '13:00:00', 88, 'M130', 'AI-T01', '', 2, '4609/post-entry']]
  };
  await T('5b 유입 후 불량(유입 전 실적과 같은 공정): 흐름표·공정 수율·불량 내역 모두 포함, 기준 공정 완료로 보지 않음', async () => {
    const r = await LT.trace(ds(c5b), 'T5F0000002');
    assert.ok(gridHas(r, '4609*2'), '흐름표에 유입 후 불량이 없음');
    const y = sheetRows(r, '공정 수율').find(x => x[0] === 'M130'); assert.ok(y && y[6] === 2, JSON.stringify(y));
    assert.strictEqual(sheetRows(r, '불량 내역').length, 1);
    const r2 = await LT.trace(ds(c5b), 'T5F0000002', { refStep: 'M130' });
    assert.ok(!/완료/.test(LT.refStatus(r2, 'T5Y0000002')), LT.refStatus(r2, 'T5Y0000002'));
  });

  // ---- 6. 결과 JSON ----
  await T('6 trace-result.json: 확산 LOT·현재 구성·이동 기록·위치 수지 포함, JSON 만으로 재계산 일치', async () => {
    const r = await LT.trace(ds(c5), 'T5F0000001');
    const j = JSON.parse(JSON.stringify(LT.serializeResult(r)));
    ['schema', 'spread', 'comp', 'entryComp', 'transfers', 'runidSummary', 'outside', 'otherOut'].forEach(k => assert.ok(k in j, k + ' 없음'));
    assert.deepStrictEqual(j.spread.map(x => x.id), ['T5Y0000001']);
    assert.strictEqual(typeof j.spread[0].entryTs, 'number');
    assert.deepStrictEqual(j.comp.T5Y0000001.T5F0000001, [40, 40]);
    assert.deepStrictEqual(verify(j), []);
    // 값을 하나 바꾸면 검산이 잡아낸다
    j.runidSummary.known = [0, 0];
    assert.ok(verify(j).length > 0, '변조를 못 잡음');
  });

  await T('6b JSON 변조 탐지 (0.3.3, Codex 2차 6번): 비 RUNID 구성 [100,100] · finalQty 999 · 이동 라벨 FAKE 를 모두 잡음', async () => {
    const r = await LT.trace(ds(c1), 'T1A0000001');
    const base = JSON.stringify(LT.serializeResult(r)), X = 'T1X0000001(RUNID 미확인)';
    let j = JSON.parse(base); assert.deepStrictEqual(verify(j), []);
    j = JSON.parse(base); assert.strictEqual(j.lots.T1B0000001.finalQty, 60); j.comp.T1B0000001[X] = [100, 100]; assert.ok(verify(j).length > 0, '구성 범위 변조를 못 잡음');
    j = JSON.parse(base); j.lots.T1B0000001.finalQty = 999; assert.ok(verify(j).length > 0, 'finalQty 변조를 못 잡음');
    j = JSON.parse(base); const t = j.transfers.find(x => Object.keys(x.part).length); const k0 = Object.keys(t.part)[0]; t.part.FAKE = t.part[k0]; delete t.part[k0];
    assert.ok(verify(j).length > 0, '이동 라벨 변조를 못 잡음');
  });

  // ---- 추가: 이력 없는 LOT 을 거쳐 되돌아온 RUNID 제품 ----
  const cx = {
    T7R0000001: [['ISSUE_VMS1_VMDL', '08:00:00', 10, 'M010', '-', '', 10], ['Split', '09:00:00', 6, 'M100', '-', 'T7M0000001', 4], ['Split', '09:30:00', 0, 'M100', '-', 'T7D0000001', 6]],
    // T7M0000001: 이력 없음. 그 자식 T7U0000001(이력 없음)이 T7D 로 병합
    T7D0000001: [['Split', '09:30:00', 6, 'M100', '-', 'T7R0000001', 6], ['Merge', '11:00:00', 8, 'M120', '-', 'T7U0000001', 2]]
  };
  await T('추가 이력 없는 LOT 을 거쳐 되돌아온 제품: 이력 있는 LOT 의 RUNID 최대에 포함, 수지 일치', async () => {
    const r = await LT.trace(ds(cx), 'T7R0000001');
    assert.deepStrictEqual(r.comp.T7D0000001.T7R0000001, [6, 8]);
    assert.ok(r.runidSummary.balanced);
    assert.deepStrictEqual(r.runidSummary.unknown, [2, 4]);
    jsonOk(r);
  });
  // ================= 0.3.3: Codex 2차 검토(v0.3.2) 재현 사례 =================
  // ---- 7. SMT Array 일부 병합: S1 50 중 20 만 S2 로 병합 → 실제 S1 R 30, S2 R 70, SMT 감소 0 ----
  const c7 = {
    T8R0000001: [['ISSUE_VMS1_VMDL', '08:00:00', 100, 'M010', '-', '', 100], ['Split', '08:10:00', 50, 'M010', '-', 'T8S1000001', 50], ['Split', '08:11:00', 0, 'M010', '-', 'T8S2000001', 50]],
    T8S1000001: [['Split', '08:10:00', 50, 'M010', '-', 'T8R0000001', 50], ['Merge', '09:00:00', 30, 'M033', '-', 'T8S2000001', 20]],
    T8S2000001: [['Split', '08:11:00', 50, 'M010', '-', 'T8R0000001', 50], ['Merge', '09:00:00', 70, 'M033', '-', 'T8S1000001', 20]]
  };
  await T('7 SMT Array 일부 병합(Array 이력 있음): S1 R 30 / S2 R 70 따로 추적, SMT 감소 0, 위치 수지 일치', async () => {
    const r = await LT.trace(ds(c7), 'T8S2000001');
    assert.deepStrictEqual(r.comp.T8S1000001, { T8R0000001: [30, 30] });
    assert.deepStrictEqual(r.comp.T8S2000001, { T8R0000001: [70, 70] });
    const S = r.runidSummary;
    assert.strictEqual(S.smtLoss, 0); assert.deepStrictEqual(S.known, [100, 100]); assert.deepStrictEqual(S.unknown, [0, 0]); assert.ok(S.balanced);
    assert.ok(check(r, 'SMT Array 따로 추적').length === 1);
    jsonOk(r);
  });
  await T('7b SMT Array 일부 병합(Array 이력 없음, PMS 는 S2 로 연결): S1 위치 미확정·필수, S2 R 50~70, SMT 감소 미확인', async () => {
    const lots = { T8R0000001: c7.T8R0000001, T8S2000001: c7.T8S2000001 };
    const r = await LT.trace(ds(lots, [['T8R0000001', 'A1', 'T8S1000001', 'T8S2000001'], ['T8R0000001', 'A2', 'T8S2000001', 'T8S2000001']]), 'T8S2000001');
    assert.deepStrictEqual(r.comp.T8S2000001.T8R0000001, [50, 70]);
    const S = r.runidSummary;
    assert.strictEqual(S.smtLoss, null); assert.deepStrictEqual(S.unknown, [30, 50]); assert.ok(S.balanced);
    assert.ok(r.missing.some(m => m.id === 'T8S1000001' && m.level === 1));
    assert.strictEqual(check(r, 'SMT Array 일부 병합')[0].level, 'WARN');
    jsonOk(r);
  });
  // ---- 8. 같은 시각: A 가 X 100 을 받은 뒤 같은 시각에 B 로 100 을 보냄 (B 가 LOT 목록에서 A 보다 앞) → B 의 R 100~200 ----
  const c8 = {
    T9R0000001: [['ISSUE_VMS1_VMDL', '08:00:00', 200, 'M010', '-', '', 200], ['Split', '09:00:00', 100, 'M100', '-', 'T9B0000001', 100], ['Split', '09:00:30', 0, 'M100', '-', 'T9A0000001', 100]],
    T9B0000001: [['Split', '09:00:00', 100, 'M100', '-', 'T9R0000001', 100], ['Merge', '10:00:00', 200, 'M120', '-', 'T9A0000001', 100]],
    T9A0000001: [['Split', '09:00:30', 100, 'M100', '-', 'T9R0000001', 100], ['Merge', '10:00:00', 200, 'M120', '-', 'T9X0000001', 100], ['Merge', '10:00:00', 100, 'M120', '-', 'T9B0000001', 100]]
  };
  await T('8 같은 시각 받고 보내기: B = R 100~200, A = R 0~100 (보낸 쪽 이력 순서대로 계산)', async () => {
    const r = await LT.trace(ds(c8), 'T9R0000001');
    const X = 'T9X0000001(RUNID 미확인)';
    assert.deepStrictEqual(r.comp.T9B0000001, { T9R0000001: [100, 200], [X]: [0, 100] });
    assert.deepStrictEqual(r.comp.T9A0000001, { T9R0000001: [0, 100], [X]: [0, 100] });
    assert.ok(r.runidSummary.balanced);
    jsonOk(r);
  });
  // ---- 9. 이력 없는 A → 다른 RUNID F(이력 있음) → 계보 B: B 의 R 50~100, F 는 확산 LOT ----
  const c9 = {
    T6R0000001: [['ISSUE_VMS1_VMDL', '08:00:00', 100, 'M010', '-', '', 100], ['Split', '09:00:00', 50, 'M100', '-', 'T6A0000001', 50], ['Split', '09:10:00', 0, 'M100', '-', 'T6B0000001', 50]],
    T6F0000001: [['ISSUE_VMS1_VMDL', '07:00:00', 100, 'M010', '-', '', 100], ['Merge', '10:00:00', 150, 'M120', '-', 'T6A0000001', 50], ['Merge', '11:00:00', 100, 'M120', '-', 'T6B0000001', 50]],
    T6B0000001: [['Split', '09:10:00', 50, 'M100', '-', 'T6R0000001', 50], ['Merge', '11:00:00', 100, 'M120', '-', 'T6F0000001', 50]]
  };
  await T('9 이력 없는 A → 다른 RUNID F(이력 있음) → B: B = R 50~100, F 확산 LOT(R 0~50), 수지 일치', async () => {
    const r = await LT.trace(ds(c9), 'T6R0000001');
    assert.deepStrictEqual(r.comp.T6B0000001.T6R0000001, [50, 100]);
    assert.ok(r.spreadList.includes('T6F0000001'));
    assert.deepStrictEqual(r.comp.T6F0000001.T6R0000001, [0, 50]);
    const S = r.runidSummary;
    assert.deepStrictEqual(S.known, [50, 100]); assert.deepStrictEqual(S.unknown, [0, 50]); assert.ok(S.balanced);
    jsonOk(r);
  });
  await T('9b 이력 없는 A → 이력 없는 G → 다른 RUNID F(이력 있음, G 에서 받음) → B: B = R 50~100 (F 를 그 RUNID 로만 확정하지 않음)', async () => {
    const lots = JSON.parse(JSON.stringify(c9));
    lots.T6F0000001 = [['ISSUE_VMS1_VMDL', '07:00:00', 100, 'M010', '-', '', 100], ['Merge', '10:30:00', 150, 'M120', '-', 'T6G0000001', 50], ['Merge', '11:00:00', 100, 'M120', '-', 'T6B0000001', 50]];
    const r = await LT.trace(ds(lots), 'T6R0000001');
    assert.deepStrictEqual(r.comp.T6B0000001.T6R0000001, [50, 100]);
    assert.ok(r.runidSummary.balanced);
    jsonOk(r);
  });
  // ---- 추가(0.3.3 속성 시험에서 발견): 모든 이벤트가 한 시각인 이력, 두 번에 나눈 Array 병합 ----
  await T('10 한 시각에 투입 → 전량 병합 → 종료: 순서대로 읽어 RUNID LOT 잔량 0, 병합 대상이 R 76 보유', async () => {
    const r = await LT.trace(ds({
      T7Q0000001: [['ISSUE_VMS1_VMDL', '01:40:00', 76, 'M010', '-', '', 76], ['Merge', '01:40:00', 0, 'M100', '-', 'T7E0000001', 76], ['Terminated', '01:40:00', 0, 'M100']],
      T7E0000001: [['Split', '00:07:00', 25, 'M100', '-', 'T7Z0000001', 25], ['Merge', '01:40:00', 101, 'M100', '-', 'T7Q0000001', 76]]
    }), 'T7Q0000001');
    assert.strictEqual(r.lots.T7Q0000001.finalQty, 0);
    assert.deepStrictEqual(r.comp.T7E0000001.T7Q0000001, [76, 76]);
    assert.deepStrictEqual(r.runidSummary.known, [76, 76]); assert.deepStrictEqual(r.runidSummary.unknown, [0, 0]);
  });
  await T('11 Array 가 두 번에 나눠 배정 수량 전부 병합: 둘 다 RUNID, SMT 감소 0', async () => {
    const r = await LT.trace(ds({
      T5R0000003: [['ISSUE_VMS1_VMDL', '08:00:00', 10, 'M010', '-', '', 10], ['Split', '08:10:00', 6, 'M010', '-', 'T5S1000003', 4], ['Split', '08:11:00', 0, 'M010', '-', 'T5S2000003', 6]],
      T5S2000003: [['Split', '08:11:00', 6, 'M010', '-', 'T5R0000003', 6], ['Merge', '09:00:00', 7, 'M033', '-', 'T5S1000003', 1], ['Merge', '09:01:00', 10, 'M033', '-', 'T5S1000003', 3]]
    }), 'T5S2000003');
    assert.deepStrictEqual(r.comp.T5S2000003, { T5R0000003: [10, 10] });
    assert.strictEqual(r.runidSummary.smtLoss, 0); assert.ok(r.runidSummary.balanced);
  });

  // ================= 0.3.6: Codex 검토(v0.3.3) 수량 문제 2건 — test/review-repros/ 의 재현 입력을 고정 =================
  // ---- 12. 다른 제품을 이미 가진 비Array 병합 LOT: X 100 으로 만든 H 에 Array S 100 전량 병합 → H = R 100 + X 100, SMT 감소 0 ----
  const c12 = {
    T3R0000001: [['ISSUE_VMS1_VMDL', '08:00:00', 100, 'M010', '-', '', 100], ['Split', '08:10:00', 0, 'M010', '-', 'T3S0000001', 100]],
    T3X0000001: [['ISSUE_VMS1_VMDL', '08:00:00', 100, 'M010', '-', '', 100], ['Split', '08:10:00', 0, 'M100', '-', 'T3H0000001', 100]],
    T3H0000001: [['Split', '08:10:00', 100, 'M100', '-', 'T3X0000001', 100], ['Merge', '09:00:00', 200, 'M033', '-', 'T3S0000001', 100]]
  };
  await T('12 비Array 병합 LOT 에 다른 제품 100 + Array 100: 병합 수량 100, SMT 감소 0, 위치·계보 수지 PASS', async () => {
    const r = await LT.trace(ds(c12, [['T3R0000001', 'A1', 'T3S0000001', 'T3H0000001']]), 'T3R0000001');
    assert.strictEqual(r.smt.hostInfo.T3H0000001.qty, 100); assert.strictEqual(r.smt.hostInfo.T3H0000001.baseQty, 100);
    assert.deepStrictEqual(r.comp.T3H0000001.T3R0000001, [100, 100]);
    const S = r.runidSummary;
    assert.strictEqual(S.smtLoss, 0); assert.deepStrictEqual(S.known, [100, 100]); assert.deepStrictEqual(S.unknown, [0, 0]); assert.ok(S.balanced);
    ['SMT 병합 수량', '계보 수량 수지', '확산 추적'].forEach(k => assert.strictEqual(check(r, k)[0].level, 'PASS', k + ': ' + check(r, k)[0].detail));
    jsonOk(r);
  });
  // ---- 13. 무관한 외부 유입: 투입부터 이력이 다 있는 X 50 → 다른 RUNID F → B. A(이력 없음)와 이어질 길이 없으므로 B 의 R 은 정확히 50 ----
  const c13 = {
    T4R0000001: [['ISSUE_VMS1_VMDL', '08:00:00', 100, 'M010', '-', '', 100], ['Split', '09:00:00', 50, 'M100', '-', 'T4A0000001', 50], ['Split', '09:10:00', 0, 'M100', '-', 'T4B0000001', 50]],
    T4X0000001: [['ISSUE_VMS1_VMDL', '07:00:00', 50, 'M010', '-', '', 50], ['Merge', '10:00:00', 0, 'M120', '-', 'T4F0000001', 50], ['Terminated', '10:00:00', 0, 'M120']],
    T4F0000001: [['ISSUE_VMS1_VMDL', '07:00:00', 100, 'M010', '-', '', 100], ['Merge', '10:00:00', 150, 'M120', '-', 'T4X0000001', 50], ['Merge', '11:00:00', 100, 'M120', '-', 'T4B0000001', 50]],
    T4B0000001: [['Split', '09:10:00', 50, 'M100', '-', 'T4R0000001', 50], ['Merge', '11:00:00', 100, 'M120', '-', 'T4F0000001', 50]]
  };
  await T('13 다른 RUNID F 가 이력 다 있는 X 에서만 받음: B = R 50 (0.3.3 은 50~100), A 위치 미확정 50, 수지 일치', async () => {
    const r = await LT.trace(ds(c13), 'T4B0000001');
    assert.deepStrictEqual(r.comp.T4B0000001, { T4R0000001: [50, 50], T4F0000001: [50, 50] });
    const S = r.runidSummary;
    assert.deepStrictEqual(S.known, [50, 50]); assert.deepStrictEqual(S.unknown, [50, 50]); assert.ok(S.balanced);
    jsonOk(r);
  });
  await T('13b F 가 이력 없는 G 에서 받았지만 우리 RUNID 제품이 위치 미확정이 되기(09:00) 전(08:30): B = R 50', async () => {
    const lots = JSON.parse(JSON.stringify(c13));
    delete lots.T4X0000001;
    lots.T4F0000001 = [['ISSUE_VMS1_VMDL', '07:00:00', 100, 'M010', '-', '', 100], ['Merge', '08:30:00', 150, 'M120', '-', 'T4G0000001', 50], ['Merge', '11:00:00', 100, 'M120', '-', 'T4B0000001', 50]];
    const r = await LT.trace(ds(lots), 'T4B0000001');
    assert.deepStrictEqual(r.comp.T4B0000001.T4R0000001, [50, 50]);
    assert.ok(r.runidSummary.balanced);
    jsonOk(r);
  });
  await T('13c 이력 다 있는 X 가 그 전에 이력 없는 G 에서 받음(09:30, 위치 미확정 이후) → X → F → B: B = R 50~100 (열어 둠)', async () => {
    const lots = JSON.parse(JSON.stringify(c13));
    lots.T4X0000001 = [['ISSUE_VMS1_VMDL', '07:00:00', 50, 'M010', '-', '', 50], ['Merge', '09:30:00', 60, 'M120', '-', 'T4G0000001', 10], ['Merge', '10:00:00', 10, 'M120', '-', 'T4F0000001', 50]];
    const r = await LT.trace(ds(lots), 'T4B0000001');
    assert.deepStrictEqual(r.comp.T4B0000001.T4R0000001, [50, 100]);
    assert.ok(r.runidSummary.balanced);
    jsonOk(r);
  });

  // ---- 14. (0.3.6, 속성 시험 확장으로 발견) 이력 없는 비Array 병합 LOT: PMS 로 연결된 Array 10 이 위치 미확정에 들어가야 한다 ----
  await T('14 이력 없는 비Array 병합 LOT(PMS 로 Array 2개 연결): RUNID 10 을 위치 미확정으로 셈, 수지 일치', async () => {
    const r = await LT.trace(ds({
      T3R0000002: [['ISSUE_VMS1_VMDL', '08:00:00', 10, 'M010', '-', '', 10], ['Split', '08:10:00', 5, 'M010', '-', 'T3S1000002', 5], ['Split', '08:11:00', 0, 'M010', '-', 'T3S2000002', 5]]
    }, [['T3R0000002', 'A1', 'T3S1000002', 'T3H0000002'], ['T3R0000002', 'A2', 'T3S2000002', 'T3H0000002']]), 'T3R0000002');
    const S = r.runidSummary;
    assert.deepStrictEqual(S.unknown, [10, 10]); assert.ok(S.balanced, 'imbalance ' + S.imbalance);
    assert.ok(S.missingHolders.some(h => h.id === 'T3H0000002'));
    assert.ok(r.missing.some(m => m.id === 'T3H0000002' && m.level === 1));
    jsonOk(r);
  });
  // ---- 15. (0.3.6, 속성 시험 확장으로 발견) 같은 시각: A 가 이력 없는 Z 에서 받고 곧바로 Z 로 보냄, B 도 그 시각 Z 에서 받음 (B 가 LOT 목록에서 A 보다 앞) ----
  await T('15 같은 시각 이력 없는 Z 를 거친 이동: B = R 50~70 (0.3.5 는 A 가 Z 로 보내기 전에 B 를 계산해 50), A = R 30~40', async () => {
    const r = await LT.trace(ds({
      T9R0000002: [['ISSUE_VMS1_VMDL', '08:00:00', 100, 'M010', '-', '', 100], ['Split', '08:10:00', 50, 'M100', '-', 'T9B0000002', 50], ['Split', '08:20:00', 0, 'M100', '-', 'T9A0000002', 50]],
      T9A0000002: [['Split', '08:20:00', 50, 'M100', '-', 'T9R0000002', 50], ['Merge', '10:00:00', 60, 'M120', '-', 'T9Z0000002', 10], ['Merge', '10:00:00', 40, 'M120', '-', 'T9Z0000002', 20]],
      T9B0000002: [['Split', '08:10:00', 50, 'M100', '-', 'T9R0000002', 50], ['Merge', '10:00:00', 70, 'M120', '-', 'T9Z0000002', 20]]
    }), 'T9R0000002');
    assert.deepStrictEqual(r.comp.T9B0000002.T9R0000002, [50, 70]);
    assert.deepStrictEqual(r.comp.T9A0000002.T9R0000002, [30, 40]);
    assert.ok(r.runidSummary.balanced);
    jsonOk(r);
  });

  // ---- 4 (엔진 쪽): 없는 LOT ----
  await T('4 없는 LOT: 추적 시작점 없음 + FAIL (화면 기록은 test-e2e-inputs.cjs)', async () => {
    const r = await LT.trace(ds(c1), 'H0XXXX0000');
    assert.strictEqual(r.top, null); assert.ok(r.checks.some(c => c.level === 'FAIL'));
  });


  // ---- 16–19. SMT collapse must survive the process-axis SVG renderer ----
  await T('16 계보 SVG: 전량 흡수한 SMT Array를 외부 LOT으로 다시 만들지 않음, 수량 결과 유지', async () => {
    const r = await LT.trace(ds({
      T5R0000003: [['ISSUE_VMS1_VMDL', '08:00:00', 10, 'M010', '-', '', 10], ['Split', '08:10:00', 6, 'M010', '-', 'T5S1000003', 4], ['Split', '08:11:00', 0, 'M010', '-', 'T5S2000003', 6]],
      T5S2000003: [['Split', '08:11:00', 6, 'M010', '-', 'T5R0000003', 6], ['Merge', '09:00:00', 7, 'M033', '-', 'T5S1000003', 1], ['Merge', '09:01:00', 10, 'M033', '-', 'T5S1000003', 3]]
    }), 'T5S2000003');
    assert.strictEqual(r.smt.arrayMerge.T5S1000003, 'T5S2000003');
    const before = JSON.stringify(LT.serializeResult(r)), html = diagramHtml(r);
    assert.strictEqual((html.match(/class="trace-node-id"/g) || []).length, 2, 'RUNID와 Array 병합 LOT만 표시해야 함');
    assert.ok(!html.includes('T5S1000003'), '흡수한 Array LOT을 다시 표시함');
    assert.ok(!/class="trace-node[^"]*is-foreign/.test(html), 'Array를 외부 혼입으로 표시함');
    assert.strictEqual(JSON.stringify(LT.serializeResult(r)), before, '표시가 수량 결과를 바꿈');
    assert.deepStrictEqual(r.runidSummary.known, [10, 10]);
  });
  await T('17 계보 SVG: 일부 병합 Array는 따로 유지, 수량 위치 유지', async () => {
    const r = await LT.trace(ds(c7), 'T8S2000001');
    const before = JSON.stringify(LT.serializeResult(r)), html = diagramHtml(r);
    assert.ok(html.includes('T8S1000001') && html.includes('T8S2000001'), '일부 병합 Array의 독립 위치가 사라짐');
    assert.ok(!/class="trace-node[^"]*is-foreign/.test(html), '같은 RUNID Array를 외부 혼입으로 표시함');
    assert.strictEqual(JSON.stringify(LT.serializeResult(r)), before);
    assert.deepStrictEqual(r.runidSummary.known, [100, 100]);
  });
  await T('18 계보 SVG: SMT 흡수 뒤 실제 외부 MERGE는 유지', async () => {
    const r = await LT.trace(ds({
      T5R0000004: [['ISSUE_VMS1_VMDL', '08:00:00', 10, 'M010', '-', '', 10], ['Split', '08:10:00', 6, 'M010', '-', 'T5S1000004', 4], ['Split', '08:11:00', 0, 'M010', '-', 'T5S2000004', 6]],
      T5S2000004: [['Split', '08:11:00', 6, 'M010', '-', 'T5R0000004', 6], ['Merge', '09:00:00', 10, 'M033', '-', 'T5S1000004', 4], ['TrackIn', '10:00:00', 10, 'M100', 'AG-01'], ['Merge', '10:10:00', 12, 'M100', '-', 'T5X0000004', 2]]
    }), 'T5S2000004');
    const before = JSON.stringify(LT.serializeResult(r)), html = diagramHtml(r);
    assert.ok(!html.includes('T5S1000004'), '흡수한 SMT Array가 남음');
    assert.ok(html.includes('T5X0000004'), '실제 외부 혼입 LOT을 숨김');
    assert.strictEqual((html.match(/class="trace-node[^"]*is-foreign/g) || []).length, 1);
    assert.strictEqual(JSON.stringify(LT.serializeResult(r)), before);
    assert.deepStrictEqual(r.runidSummary.known, [10, 10]);
  });
  await T('19 계보 SVG: 확산 LOT의 RUNID 유입 전 외부 병합은 표시하지 않음', async () => {
    const r = await LT.trace(ds({
      T5F0000004: [['ISSUE_VMS1_VMDL', '08:00:00', 100, 'M010', '-', '', 100], ['Merge', '12:00:00', 60, 'M130', '-', 'T5Y0000004', 40]],
      T5Y0000004: [['Split', '07:00:00', 50, 'M120', '-', 'T5Z0000004', 50], ['Merge', '08:00:00', 60, 'M120', '-', 'T5X0000004', 10], ['Merge', '12:00:00', 100, 'M130', '-', 'T5F0000004', 40], ['TrackIn', '12:30:00', 100, 'M130', 'AI-T01'], ['TrackOut', '13:00:00', 100, 'M130', 'AI-T01']]
    }), 'T5F0000004');
    const before = JSON.stringify(LT.serializeResult(r)), html = diagramHtml(r);
    assert.ok(html.includes('T5Y0000004'));
    assert.ok(!html.includes('T5X0000004'), 'RUNID 유입 전 외부 병합 LOT을 표시함');
    assert.strictEqual(JSON.stringify(LT.serializeResult(r)), before);
  });

  const bad = results.filter(r => r[0] === 'FAIL');
  results.forEach(r => console.log(r[0], r[1], r[2] ? '— ' + r[2] : ''));
  console.log(`test-regression: ${results.length - bad.length}/${results.length} 통과`);
  if (bad.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exit(2); });
