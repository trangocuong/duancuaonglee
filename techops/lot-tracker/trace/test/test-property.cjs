// 무작위 계보 시나리오 속성 시험 (property test) — 0.3.2, 0.3.3 확장
//
// 무엇을 확인하나
//   가상 계보(분할·병합·같은 LOT 쌍 반복 이동·다른 RUNID 유입·외부 LOT 확산·불량(TrackIn 유무)·설명 안 되는 감소·
//   SMT Array 분할/병합(PMS 유무)·이력 파일 누락)를 무작위로 만들고, 제품 한 개 단위로 "실제로 어디로 갔는지"를
//   (0.3.3 — Codex 2차 검토: 이전 생성기가 만들지 않던 유형 추가 — SMT Array 일부 병합(나머지 잔류/다른 병합 LOT),
//    바로 앞 연산과 같은 시각의 연산, 같은 시각에 받고 곧바로 내보내기, 자체 투입(ISSUE)이 있는 다른 RUNID LOT(대부분 이력 있음).
//    생성기가 바뀌어 같은 seed 라도 0.3.2 때와 다른 시나리오가 만들어진다)
//   여러 번(뽑는 순서를 바꿔 가며) 재생한다. 매번 아래가 성립해야 한다.
//     1) 이력 있는 LOT: 실제 RUNID 수량 ∈ 엔진의 [최소, 최대]  (기준 공정 모드면 '전'/'후' 각각)
//     2) 불량 한 건마다: 실제로 버려진 RUNID 수량 ∈ 엔진 범위
//     3) 위치 수지: 불량·기타 감소·이력 있는 LOT 합계·위치 미확정 각각이 실제 값을 포함, SMT 감소가 확정이면 실제와 같음,
//        수지 불일치(balanced=false)가 없어야 함 (데이터가 서로 맞으므로)
//     4) 기준 공정 수지: 테스트됨·전 불량·미진행·이력 미확인 각각이 실제 값을 포함
//     5) RUNID 제품이 실제로 들어간 이력 없는 LOT 은 '추가 필요 LOT' 에 올라 있어야 함 (기준 공정 없으면 필수)
//     6) 모든 범위는 0 ≤ 최소 ≤ 최대
//     7) 결과 JSON(trace-result.json)만으로 다시 계산한 수지가 엔진 값과 같음 (test/verify-json.cjs)
//     8) (0.3.6) 계보·확산 밖에서 들어온 이동: 불러온 이력만 보고 우리 RUNID 제품이 보낸 LOT 에 갈 길이 없으면 엔진도 RUNID 몫 0
//        — 1~7 은 참값이 범위 안에 있는지만 봐서, 참값을 포함하면서 불필요하게 넓은 범위(Codex 검토 v0.3.3 2번)를 못 잡는다.
//        '갈 길'은 엔진과 따로 넓게 잡는다: 이력 있는 LOT 은 받은 기록(분할 생성·병합 유입·설명 안 되는 증가)을 따라가고,
//        이력 없는 LOT 은 우리 RUNID 제품이 이력 없는 LOT(SMT Array 포함)으로 처음 보내진 시각부터 무엇이든 담았을 수 있다고 본다.
//   (0.3.6 — Codex 검토 v0.3.3: SMT 병합 LOT 을 Array LOT 에서만 골라, 다른 제품을 이미 가진 비Array 병합 LOT(1번 유형)을 만들지 않았음
//    → SMT 모드의 35% 는 첫 병합 LOT 을 외부 LOT 에서 분할하거나 다른 RUNID 로 투입한 비Array LOT 으로 만든다. 같은 seed 라도 0.3.5 때와 시나리오가 다르다)
//
//   node test/test-property.cjs [시나리오 수=400] [시나리오당 재생=30] [seed=1]
//   LT_SRC=<다른 src 폴더> 로 이전 버전 엔진에 같은 시험을 돌려 비교할 수 있다.
const fs = require('fs'), path = require('path');
const SRC = process.env.LT_SRC || path.join(__dirname, '../src');
const LT = require(path.join(SRC, 'engine.js'));
try { require(path.join(SRC, 'report.js')); } catch (e) { /* 이전 버전 비교 시 report 없이도 동작 */ }
let verifyJson = null;
try { verifyJson = require('./verify-json.cjs').verify; } catch (e) { /* 선택 */ }

const NS = +(process.argv[2] || 400), NT = +(process.argv[3] || 30), SEED = +(process.argv[4] || 1);
const VERBOSE = !!process.env.VERBOSE, MAXPRINT = +(process.env.MAXPRINT || 12);

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const STEPS = ['M100', 'M120', 'M130', 'M160', 'M165'];
const H = ['EVENT_NAME', 'DATE/TIME', 'QTY', 'STEP', 'EQP', 'LINE', 'OPERID', 'CHG_ITEM', 'CHG_VALS', 'QTY', 'COMMENT'];

/* ---------------- 시나리오 생성 (수량만) ---------------- */
function genScenario(rand, sid) {
  const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  let seq = 0;
  const d = String(sid % 10);
  const newId = p => p + d + String(sid).padStart(4, '0').slice(-4) + String(++seq).padStart(4, '0');
  const base = Date.UTC(2026, 8, 20, 0, 0, 0);
  let tmin = 0;
  const T = () => new Date(base + tmin * 60000).toISOString().slice(0, 19).replace('T', ' ');
  const lots = {}, ops = [], stats = { feeder: 0, partialSmt: 0, sameTime: 0, relay: 0, nonArrayHost: 0 };
  const lot = (id, kind, loaded) => (lots[id] = { id, qty: 0, kind, loaded, events: [], alive: true });
  const ev = (L, row) => L.events.push(row);

  const R = lot(newId('R'), 'fam', true);
  const N = ri(20, 120);
  const smtMode = rand() < 0.3, refMode = rand() < 0.5;
  // 외부 LOT (다른 제품이 먼저 들어 있음)
  for (let k = ri(0, 3); k > 0; k--) {
    const E = lot(newId('E'), 'ext', rand() < 0.8), q = ri(5, 60);
    tmin = ri(0, 90);
    ev(E, ['Split', T(), q, 'M100', '-', newId('Z'), q]); E.qty = q;
    ops.push({ t: 'base', lot: E.id, q });
  }
  // 0.3.3: 다른 RUNID LOT (자체 투입 ISSUE, 대부분 이력 있음) — 계보 LOT(이력 없는 것 포함)에서 받은 뒤 다시 계보로 내보낼 수 있다 (Codex 3번 유형)
  for (let k = ri(0, 2); k > 0; k--) {
    const G = lot(newId('G'), 'ext', rand() < 0.85), q = ri(5, 60);
    tmin = ri(0, 90);
    ev(G, ['ISSUE_VMS1_VMDL', T(), q, 'M010', '-', '', q]); G.qty = q;
    ops.push({ t: 'base', lot: G.id, q }); stats.feeder++;
  }
  tmin = 100;
  ev(R, ['ISSUE_VMS1_VMDL', T(), N, 'M010', '-', '', N]); R.qty = N;
  ops.push({ t: 'issue', lot: R.id, q: N });
  let smt = null;
  if (smtMode) {
    tmin = 110;
    const subs = [];
    let left = N;
    while (left > 0) {
      const q = Math.min(left, ri(1, 4)); left -= q;
      const S = lot(newId('S'), 'sub', false);
      subs.push({ id: S.id, q });
      R.qty -= q; ev(R, ['Split', T(), R.qty, 'M010', '-', S.id, q]); ev(S, ['Split', T(), q, 'M010', '-', R.id, q]); S.qty = q;
      ops.push({ t: 'move', from: R.id, to: S.id, q }); tmin++;
    }
    const hosts = subs.slice(0, Math.min(subs.length, ri(1, 2))).map(s => s.id);
    hosts.forEach(h => { lots[h].loaded = rand() < 0.8; lots[h].kind = 'fam'; });
    // 0.3.6: 비Array 병합 LOT (Codex 검토 v0.3.3 1번) — 다른 제품을 먼저 담은 LOT 에 Array 를 병합한다.
    //        외부 LOT 에서 분할해 만들거나(Array 병합 확인 가능), 다른 RUNID 로 투입해 만든다(투입이 먼저라 Array 병합으로 확인 못 함).
    if (rand() < 0.35) {
      const src = Object.values(lots).filter(L => L.kind === 'ext' && L.alive && L.qty >= 2);
      const Hn = lot(newId('H'), 'fam', rand() < 0.85); Hn.nah = true;
      if (src.length && rand() < 0.7) {
        const E = pick(src), q0 = ri(1, E.qty - 1);
        E.qty -= q0; ev(E, ['Split', T(), E.qty, 'M100', '-', Hn.id, q0]); ev(Hn, ['Split', T(), q0, 'M100', '-', E.id, q0]);
        Hn.qty = q0; ops.push({ t: 'move', from: E.id, to: Hn.id, q: q0 });
      } else {
        const q0 = ri(1, 40);
        ev(Hn, ['ISSUE_VMS1_VMDL', T(), q0, 'M010', '-', '', q0]); Hn.qty = q0; ops.push({ t: 'base', lot: Hn.id, q: q0 });
      }
      Object.assign(lots[hosts[0]], { kind: 'sub', loaded: false }); hosts[0] = Hn.id; stats.nonArrayHost++; // 원래 병합 LOT 이던 Array 는 보통 Array 로
    }
    tmin += 10;
    const pms = [], unmerged = [];
    subs.forEach((s, i) => {
      if (hosts.includes(s.id)) { pms.push([R.id, 'SN' + i, s.id, s.id]); return; }
      if (rand() < 0.1) { pms.push([R.id, 'SN' + i, s.id, '']); unmerged.push(s.id); return; } // 병합 안 된 Array (SMT 감소)
      const h = pick(hosts), Hh = lots[h], S = lots[s.id];
      // 0.3.3: 배정 수량 중 일부만 병합 (Codex 1번 유형) — 나머지는 Array LOT 에 남거나 (다른) 병합 LOT 으로 따로 병합. Array LOT 이력은 절반만 있음
      if (s.q >= 2 && rand() < 0.2) {
        const q1 = ri(1, s.q - 1);
        S.qty -= q1; ev(S, ['Merge', T(), S.qty, 'M033', '-', h, q1]);
        Hh.qty += q1; ev(Hh, ['Merge', T(), Hh.qty, 'M033', '-', s.id, q1]);
        ops.push({ t: 'move', from: s.id, to: h, q: q1 }); tmin++;
        S.loaded = rand() < 0.5; stats.partialSmt++;
        if (rand() < 0.4) {
          const h2 = pick(hosts), H2 = lots[h2], q2 = S.qty;
          S.qty = 0; ev(S, ['Merge', T(), 0, 'M033', '-', h2, q2]); ev(S, ['Terminated', T(), 0, 'M033', '-']); S.alive = false;
          H2.qty += q2; ev(H2, ['Merge', T(), H2.qty, 'M033', '-', s.id, q2]);
          ops.push({ t: 'move', from: s.id, to: h2, q: q2 }); tmin++;
        }
        pms.push([R.id, 'SN' + i, s.id, h]);
        return;
      }
      S.qty = 0; ev(S, ['Merge', T(), 0, 'M033', '-', h, s.q]); ev(S, ['Terminated', T(), 0, 'M033', '-']); S.alive = false;
      Hh.qty += s.q; ev(Hh, ['Merge', T(), Hh.qty, 'M033', '-', s.id, s.q]);
      ops.push({ t: 'move', from: s.id, to: h, q: s.q }); pms.push([R.id, 'SN' + i, s.id, h]); tmin++;
    });
    smt = { pms: rand() < 0.6 ? pms : null, hosts, unmerged, hostOfPms: Object.fromEntries(pms.filter(r => r[3]).map(r => [r[2], r[3]])) };
  }
  const active = () => Object.values(lots).filter(L => (L.kind === 'fam' || L.kind === 'ext') && L.qty > 0 && L.alive);
  let lastPair = null;
  const nOps = ri(5, 30);
  for (let k = 0; k < nOps; k++) {
    // 0.3.3: 15% 는 바로 앞 연산과 같은 시각 (Codex 2번 유형 — 같은 시각 이벤트의 순서)
    if (rand() < 0.15) stats.sameTime++; else tmin += ri(1, 30);
    const act = active();
    if (!act.length) break;
    if (rand() < 0.07) { // 같은 시각에 받고 곧바로 내보내기 (A 가 X 를 받은 뒤 같은 시각에 B 로 보냄)
      const A = pick(act), step = pick(STEPS);
      if (rand() < 0.5) { const F = lot(newId('F'), 'foreign', false), q = ri(1, 30); A.qty += q; ev(A, ['Merge', T(), A.qty, step, '-', F.id, q]); ops.push({ t: 'foreign', to: A.id, q }); }
      else {
        const src = act.filter(L => L !== A && L.qty >= 2);
        if (!src.length) continue;
        const X = pick(src), q = ri(1, X.qty - 1);
        X.qty -= q; ev(X, ['Merge', T(), X.qty, step, '-', A.id, q]);
        A.qty += q; ev(A, ['Merge', T(), A.qty, step, '-', X.id, q]);
        ops.push({ t: 'move', from: X.id, to: A.id, q });
      }
      const dst = active().filter(L => L !== A);
      if (!dst.length || A.qty < 1) continue;
      const B = pick(dst), q2 = ri(1, A.qty);
      A.qty -= q2; ev(A, ['Merge', T(), A.qty, step, '-', B.id, q2]);
      if (!A.qty) { ev(A, ['Terminated', T(), 0, step, '-']); A.alive = false; }
      B.qty += q2; ev(B, ['Merge', T(), B.qty, step, '-', A.id, q2]);
      ops.push({ t: 'move', from: A.id, to: B.id, q: q2 }); stats.relay++;
      continue;
    }
    const r = rand();
    if (r < 0.28) { // 분할
      const cand = act.filter(L => L.qty >= 2);
      if (!cand.length) continue;
      const P = pick(cand), q = rand() < 0.1 ? P.qty : ri(1, P.qty - 1), step = pick(STEPS);
      const C = lot(newId(P.kind === 'ext' ? 'E' : 'C'), P.kind, rand() < 0.75); C.nah = P.nah;
      P.qty -= q; ev(P, ['Split', T(), P.qty, step, '-', C.id, q]);
      C.qty = q; ev(C, ['Split', T(), q, step, '-', P.id, q]);
      ops.push({ t: 'move', from: P.id, to: C.id, q });
    } else if (r < 0.55) { // 병합 (일부/전부) — 같은 LOT 쌍 반복을 일부러 자주 만든다
      let A, B;
      if (lastPair && rand() < 0.45 && lots[lastPair[0]].qty > 0 && lots[lastPair[0]].alive && lots[lastPair[1]].alive) { A = lots[lastPair[0]]; B = lots[lastPair[1]]; }
      else { A = pick(act); const others = act.filter(L => L !== A); if (!others.length) continue; B = pick(others); }
      const full = rand() < 0.3, q = full ? A.qty : ri(1, A.qty), step = pick(STEPS);
      A.qty -= q; ev(A, ['Merge', T(), A.qty, step, '-', B.id, q]);
      if (full) { ev(A, ['Terminated', T(), 0, step, '-']); A.alive = false; }
      B.qty += q; ev(B, ['Merge', T(), B.qty, step, '-', A.id, q]);
      ops.push({ t: 'move', from: A.id, to: B.id, q }); lastPair = [A.id, B.id];
    } else if (r < 0.64) { // 다른 RUNID LOT 유입 (이력 없음)
      const B = pick(act), F = lot(newId('F'), 'foreign', false), q = ri(1, 30);
      B.qty += q; ev(B, ['Merge', T(), B.qty, pick(STEPS), '-', F.id, q]);
      ops.push({ t: 'foreign', to: B.id, q });
    } else if (r < 0.8) { // 불량 (TrackIn 있을 수도 없을 수도)
      const L = pick(act), q = ri(1, Math.min(3, L.qty)), step = pick(STEPS), tracked = rand() < 0.5;
      if (tracked) { ev(L, ['TrackIn', T(), L.qty, step, 'EQ-1']); ops.push({ t: 'trackin', lot: L.id, step }); tmin++; }
      L.qty -= q; const tm = T(); ev(L, ['Scrap', tm, L.qty, step, 'EQ-1', '', q, pick(['4609', '3329', '9999']) + '/x']);
      ops.push({ t: 'scrap', lot: L.id, q, time: tm });
      if (tracked) { tmin++; ev(L, ['TrackOut', T(), L.qty, step, 'EQ-1']); }
    } else if (r < 0.95) { // 기준 공정(M130) 실적
      const L = pick(act);
      ev(L, ['TrackIn', T(), L.qty, 'M130', 'AI-T01']); ops.push({ t: 'trackin', lot: L.id, step: 'M130' });
      if (rand() < 0.4) { tmin++; const q = ri(1, Math.min(3, L.qty)); L.qty -= q; const tm = T(); ev(L, ['Scrap', tm, L.qty, 'M130', 'AI-T01', '', q, '4609/x']); ops.push({ t: 'scrap', lot: L.id, q, time: tm }); }
      tmin++; ev(L, ['TrackOut', T(), L.qty, 'M130', 'AI-T01']);
    } else { // 설명되지 않는 수량 감소 (기타 이벤트)
      const L = pick(act), q = ri(1, L.qty);
      L.qty -= q; ev(L, ['ShipOut', T(), L.qty, 'M180', '-', 'CUST', q, 'x']);
      ops.push({ t: 'other', lot: L.id, q });
    }
  }
  // 0.3.6: 비Array 병합 LOT 과 그 분할 자식은 입력으로 쓰지 않는다 — 역추적은 분할 부모만 따라가므로 그 LOT 의 분할 부모(다른 제품) 쪽
  //        RUNID 로 가고, Array 로 들어온 우리 RUNID 는 혼입으로 보인다 (시나리오가 가정하는 'R 의 계보 LOT' 이 아님)
  const famLoaded = Object.values(lots).filter(L => L.kind === 'fam' && L.loaded && L.events.length && !L.nah);
  const input = rand() < 0.5 ? R.id : pick(famLoaded).id;
  return { lots, ops, N, R: R.id, smt, refMode, input, stats };
}

function buildDs(sc) {
  const ds = new LT.FileDataSource();
  Object.values(sc.lots).forEach(L => {
    if (!L.loaded || !L.events.length) return;
    const rows = [H].concat(L.events.slice().reverse().map(e => [e[0], e[1], e[2], e[3], e[4], 'VMDL', 'PROP', '', e[5] || '', e[6] || 0, e[7] || '']));
    rows.push(['Time : 2026-10-01 00:00:00']);
    ds.addParsed(LT.parseSheetRows(rows, L.id + '.xlsx'));
  });
  if (sc.smt && sc.smt.pms) ds.addParsed(LT.parseSheetRows([['LOT_ID', 'BARCODE_SERLNO', 'SPLIT_LOT', 'MERGE_LOT', 'PROD_ID']].concat(sc.smt.pms.map(r => r.concat(['PART-X']))), sc.R + '_PMS.xlsx'));
  return ds;
}

/* ---------------- 제품 단위 재생 (실제 값) ---------------- */
// 라벨: R = RUNID(기준 공정 전), P = RUNID(기준 공정 후), F = 다른 RUNID, X = 외부 LOT 기존 제품
function replay(sc, rand, refStep) {
  const box = {}, scraps = [], conv = [], others = [], moves = [];
  const isR = l => l === 'R' || l === 'P';
  const take = (id, q) => {
    const u = box[id] || [], mode = Math.floor(rand() * 5);
    for (let i = u.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [u[i], u[j]] = [u[j], u[i]]; }
    const key = l => mode === 1 ? (isR(l) ? 0 : 1) : mode === 2 ? (isR(l) ? 1 : 0) : mode === 3 ? (l === 'R' ? 0 : 1) : mode === 4 ? (l === 'P' ? 0 : 1) : 0;
    if (mode) u.sort((a, b) => key(a) - key(b));
    const out = u.splice(0, q);
    box[id] = u;
    return out;
  };
  const put = (id, arr) => { box[id] = (box[id] || []).concat(arr); };
  const cnt = (arr, l) => arr.filter(x => x === l).length;
  for (const o of sc.ops) {
    if (o.t === 'issue') put(o.lot, Array(o.q).fill('R'));
    else if (o.t === 'base') put(o.lot, Array(o.q).fill('X'));
    else if (o.t === 'foreign') put(o.to, Array(o.q).fill('F'));
    else if (o.t === 'move') { const a = take(o.from, o.q); put(o.to, a); moves.push({ from: o.from, to: o.to, R: cnt(a, 'R'), P: cnt(a, 'P') }); }
    else if (o.t === 'scrap') { const a = take(o.lot, o.q); scraps.push({ lot: o.lot, time: o.time, R: cnt(a, 'R'), P: cnt(a, 'P') }); }
    else if (o.t === 'other') { const a = take(o.lot, o.q); others.push({ lot: o.lot, R: cnt(a, 'R'), P: cnt(a, 'P') }); }
    else if (o.t === 'trackin') {
      if (refStep && o.step === refStep) { const u = box[o.lot] || []; const c = cnt(u, 'R'); box[o.lot] = u.map(x => x === 'R' ? 'P' : x); conv.push({ lot: o.lot, R: c }); }
    }
  }
  return { box, scraps, conv, others, moves, cnt };
}

/* ---------------- 8) 우리 RUNID 제품이 갈 수 있는 길 (불러온 이력만으로, 엔진과 따로 계산) ---------------- */
// may[id]: 이력 있는 LOT 이 우리 RUNID 제품을 담았을 수 있는 가장 이른 시각, pool: 이력 없는 LOT 이 그럴 수 있는 가장 이른 시각
// (이력 없는 LOT 끼리는 보이지 않게 오갈 수 있으므로 하나로 본다). 받은 기록·보낸 기록을 시각 비교(≤)로 넓게 따라가며 고정점까지 반복.
function reachR(sc) {
  const loaded = {}; Object.values(sc.lots).forEach(L => { if (L.loaded && L.events.length) loaded[L.id] = L; });
  const INF = '9999', may = {}; let pool = INF, changed = true;
  may[sc.R] = sc.lots[sc.R].events[0][1];
  const mayAt = (id, t) => (loaded[id] ? (may[id] || INF) : pool) <= t;
  while (changed) {
    changed = false;
    Object.values(loaded).forEach(L => {
      let prev = null;
      L.events.forEach(([ev, t, q, , , v]) => {
        const kind = /^ISSUE/.test(ev) ? 'issue' : ev === 'Split' ? (prev === null ? 'in' : 'out') : ev === 'Merge' ? (prev === null || q > prev ? 'in' : 'out')
          : ((prev === null ? q > 0 : q > prev) ? 'up' : 'other');
        const mark = () => { if ((may[L.id] || INF) > t) { may[L.id] = t; changed = true; } };
        if (kind === 'in' && mayAt(v, t)) mark();
        else if (kind === 'up' && pool <= t) mark();
        else if (kind === 'out' && !loaded[v] && (may[L.id] || INF) <= t && pool > t) { pool = t; changed = true; }
        prev = q;
      });
    });
  }
  return { loaded, mayAt };
}

/* ---------------- 검사 ---------------- */
function checkScenario(sc, res, rand, fails, tag, cov) {
  // RUNID 에 도달하지 못한 경우(역추적이 이력 없는 LOT 에서 끊김)에는 엔진이 RUNID 를 모르므로 구성 라벨이 달라진다 → 요청 목록만 확인
  if (!(res.root === sc.R && res.rootConfirmed)) {
    if (!res.missing.some(m => m.level === 1 && m.kinds.indexOf('역추적') >= 0)) fails.push(tag + ' RUNID 미도달인데 필수(역추적) 요청이 없음');
    return;
  }
  const R = res.runLabel;
  const ref = res.ref || null;
  const ids = res.family.concat(res.spreadList || []);
  const loadedIds = ids.filter(id => res.lots[id]);
  const inLoaded = {}; loadedIds.forEach(id => { inLoaded[id] = true; });
  const fail = (msg) => { fails.push(tag + ' ' + msg); };
  const within = (what, v, r) => { const x = r || [0, 0]; if (!(v >= x[0] && v <= x[1])) fail(`${what}: 실제 ${v} ∉ [${x[0]}, ${x[1]}]`); };
  const okRange = (what, r) => { if (r && !(r[0] >= 0 && r[0] <= r[1])) fail(`${what}: 범위 이상 [${r[0]}, ${r[1]}]`); };
  // 6) 범위 정상
  Object.keys(res.comp || {}).forEach(id => Object.keys(res.comp[id]).forEach(k => okRange('comp ' + id + ' ' + k, res.comp[id][k])));
  const S = res.runidSummary;
  if (S) ['scrap', 'known', 'unknown'].concat(S.other ? ['other'] : []).forEach(k => okRange('runidSummary.' + k, S[k]));
  const F = ref && ref.summary;
  if (F) ['tested', 'scrapPre', 'pending', 'unknown'].forEach(k => okRange('ref.summary.' + k, F[k]));
  const missIds = {}; (res.missing || []).forEach(m => { missIds[m.id] = m; });
  // 8) 계보·확산 밖에서 들어온 이동: 보낸 LOT 에 우리 RUNID 제품이 갈 길이 없으면 엔진의 그 이동 RUNID 몫도 0 이어야 함
  const rr = reachR(sc), inIds = {}; ids.forEach(id => { inIds[id] = true; });
  const smtSubs = (res.smt && res.smt.subs) || {};
  loadedIds.forEach(id => {
    let prev = null; const nth = {};
    sc.lots[id].events.forEach(([ev, t, q, , , v]) => {
      const isIn = (ev === 'Split' && prev === null) || (ev === 'Merge' && (prev === null || q > prev));
      prev = q;
      if (!isIn || !v || inIds[v] || smtSubs[v] !== undefined) return;
      const key = v + '>' + id + '#' + (nth[v] = (nth[v] === undefined ? 0 : nth[v] + 1));
      if (rr.mayAt(v, t)) return;
      cov.cleanIn++;
      if (rr.loaded[v] && sc.lots[v].events.some((e, i) => i > 0 && e[0] === 'Merge' && e[2] > sc.lots[v].events[i - 1][2] && e[1] <= t)) cov.cleanInAfterRecv++;
      const zero = (what, part, labs) => labs.forEach(k => { const r = part && part[k]; if (r && r[1] > 0) fail(`${what} ${key} (${t}): 보낸 LOT 에 우리 RUNID 제품이 갈 길이 없는데 ${k} 몫 [${r[0]}, ${r[1]}]`); });
      const t0 = (res.transfers || {})[key];
      if (!t0) { fail(`이동 ${key} 엔진 기록 없음`); return; }
      zero('계보 밖 유입', t0.part, [R]);
      if (ref) { const t1 = (ref.transfers || {})[key]; if (t1) zero('계보 밖 유입(기준 공정)', t1.part, [ref.pre, ref.post]); }
    });
  });

  for (let trial = 0; trial < NT; trial++) {
    const tr = replay(sc, rand, ref ? ref.step : null);
    const allR = arr => tr.cnt(arr || [], 'R') + tr.cnt(arr || [], 'P');
    // 1) 이력 있는 LOT 최종
    loadedIds.forEach(id => {
      within(`최종 ${id} RUNID`, allR(tr.box[id]), (res.comp[id] || {})[R]);
      if (ref) { within(`최종 ${id} ${ref.step} 전`, tr.cnt(tr.box[id] || [], 'R'), (ref.comp[id] || {})[ref.pre]); within(`최종 ${id} ${ref.step} 후`, tr.cnt(tr.box[id] || [], 'P'), (ref.comp[id] || {})[ref.post]); }
    });
    // 2) 불량 한 건씩
    const used = {};
    tr.scraps.forEach(s => {
      if (!inLoaded[s.lot]) return;
      const i = res.scrapComp.findIndex((x, k) => !used[k] && x.lot === s.lot && x.time === s.time);
      if (i < 0) { fail(`불량 ${s.lot} ${s.time}: 엔진 기록 없음`); return; }
      used[i] = true;
      within(`불량 ${s.lot} ${s.time} RUNID`, s.R + s.P, res.scrapComp[i].scrapped[R]);
    });
    // 3) 위치 수지
    if (S) {
      const scrapT = tr.scraps.filter(s => inLoaded[s.lot]).reduce((a, s) => a + s.R + s.P, 0);
      const otherT = tr.others.filter(s => inLoaded[s.lot]).reduce((a, s) => a + s.R + s.P, 0);
      const knownT = loadedIds.filter(id => res.lots[id].finalQty > 0).reduce((a, id) => a + allR(tr.box[id]), 0);
      const smtT = sc.smt ? sc.smt.unmerged.reduce((a, id) => a + allR(tr.box[id]), 0) : 0;
      const smtLoss = S.smtLoss === undefined ? 0 : S.smtLoss;
      if (smtLoss !== null && smtLoss !== smtT) fail(`SMT 감소: 엔진 ${smtLoss} ≠ 실제 ${smtT}`);
      const unknownT = S.total - scrapT - otherT - knownT - (smtLoss !== null ? smtT : 0);
      within('수지 불량', scrapT, S.scrap);
      within('수지 기타 감소', otherT, S.other || [0, 0]);
      within('수지 이력 있는 LOT 합계', knownT, S.known);
      within('수지 위치 미확정', unknownT, S.unknown);
      if (S.balanced === false) fail(`수지 불일치 표시 (imbalance ${S.imbalance}) — 데이터는 서로 맞음`);
    }
    // 4) 기준 공정 수지
    if (F) {
      const testedT = tr.conv.filter(c => inLoaded[c.lot]).reduce((a, c) => a + c.R, 0);
      const scrapPreT = tr.scraps.filter(s => inLoaded[s.lot]).reduce((a, s) => a + s.R, 0);
      const otherPreT = tr.others.filter(s => inLoaded[s.lot]).reduce((a, s) => a + s.R, 0);
      const pendingT = loadedIds.filter(id => res.lots[id].finalQty > 0).reduce((a, id) => a + tr.cnt(tr.box[id] || [], 'R'), 0);
      const smtT = sc.smt ? sc.smt.unmerged.reduce((a, id) => a + allR(tr.box[id]), 0) : 0;
      const smtLoss = F.smtLoss === undefined ? 0 : F.smtLoss;
      const unknownT = F.total - testedT - scrapPreT - otherPreT - pendingT - (smtLoss !== null ? smtT : 0);
      within('기준 수지 테스트됨', testedT, F.tested);
      within('기준 수지 전 불량', scrapPreT, F.scrapPre);
      within('기준 수지 전 기타 감소', otherPreT, F.otherPre || [0, 0]);
      within('기준 수지 미진행', pendingT, F.pending);
      within('기준 수지 이력 미확인', unknownT, F.unknown);
      if (F.balanced === false) fail(`기준 수지 불일치 표시 (imbalance ${F.imbalance})`);
    }
    // 5) RUNID 제품이 실제로 들어간 이력 없는 LOT 은 요청 목록에 있어야 함
    //    - Array LOT(SMT): 지금 RUNID 제품이 남아 있으면(병합 안 됨/병합 LOT 미확인) 필요
    //    - 그 외: 엔진 범위 안의 이력 있는 LOT 에서 RUNID 제품을 실제로 받은 적이 있으면 필요 (이력 없는 LOT 끼리의 이동은 앞 LOT 이 대신 요청됨)
    Object.keys(sc.lots).forEach(id => {
      const L = sc.lots[id];
      if ((L.loaded && L.events.length) || L.kind === 'foreign' || !L.events.length) return;
      let needR = 0, needPre = 0;
      if (L.kind === 'sub') { needR = allR(tr.box[id]); needPre = tr.cnt(tr.box[id] || [], 'R'); }
      else tr.moves.forEach(m => { if (m.to === id && inLoaded[m.from]) { needR += m.R + m.P; needPre += m.R; } });
      if (!(needR > 0)) return;
      const m = missIds[id];
      // Array LOT 이 PMS 에서 병합 LOT 으로 연결돼 있고 그 병합 LOT 도 이력이 없으면, 엔진은 먼저 병합 LOT 을 요청한다
      // (병합 LOT 이력이 들어와야 Array 가 일부만 병합됐는지 알 수 있음) → 병합 LOT 이 요청 목록에 있으면 인정
      const viaHost = L.kind === 'sub' && sc.smt && sc.smt.pms && sc.smt.hostOfPms[id] && !(sc.lots[sc.smt.hostOfPms[id]] || {}).loaded && missIds[sc.smt.hostOfPms[id]];
      if (!m && viaHost) return;
      if (!m) fail(`RUNID 제품(${needR}ea)이 들어간 이력 없는 LOT ${id} 가 추가 필요 LOT 에 없음`);
      else if (!ref && m.level !== 1) fail(`RUNID 제품이 들어간 이력 없는 LOT ${id} 가 필수가 아님 (${m.levelText})`);
      else if (ref && needPre > 0 && m.level !== 1) fail(`${ref.step} 전 RUNID 제품이 들어간 이력 없는 LOT ${id} 가 필수가 아님 (${m.levelText})`);
    });
  }
}

(async () => {
  const rand = rng(SEED);
  const fails = [];
  let scen = 0, withSummary = 0, smtN = 0, refN = 0, repeatPairs = 0, missingLots = 0, jsonChecked = 0;
  const extra = { partialSmt: 0, sameTime: 0, relay: 0, feeder: 0, nonArrayHost: 0 }, cov = { cleanIn: 0, cleanInAfterRecv: 0 };
  for (let sid = 1; sid <= NS; sid++) {
    const sc = genScenario(rand, sid);
    Object.keys(extra).forEach(k => { if (sc.stats[k]) extra[k]++; });
    const res = await LT.trace(buildDs(sc), sc.input, sc.refMode ? { refStep: 'M130' } : {});
    scen++;
    if (res.runidSummary) withSummary++;
    if (sc.smt) smtN++;
    if (res.ref) refN++;
    const pairs = {}; sc.ops.filter(o => o.t === 'move').forEach(o => { const k = o.from + '>' + o.to; pairs[k] = (pairs[k] || 0) + 1; });
    if (Object.values(pairs).some(v => v > 1)) repeatPairs++;
    missingLots += Object.values(sc.lots).filter(L => !L.loaded && L.kind !== 'foreign').length;
    const before = fails.length;
    if (process.env.DUMP && +process.env.DUMP === sid) {
      console.log('== 시나리오', sid, '입력', sc.input, 'R', sc.R, 'N', sc.N, 'SMT', !!sc.smt, sc.smt ? JSON.stringify({ pms: !!sc.smt.pms, hosts: sc.smt.hosts, unmerged: sc.smt.unmerged }) : '', 'ref', sc.refMode);
      Object.values(sc.lots).forEach(L => { if (L.kind === 'sub' && !process.env.DUMPSUB) return; console.log(' ', L.id, L.kind, L.loaded ? '이력있음' : '이력없음', 'qty', L.qty); L.events.forEach(e => console.log('     ', e.join(' | '))); });
      console.log(' family', res.family.join(','), '| spread', (res.spreadList || []).join(','));
      Object.keys(res.comp).forEach(id => console.log('  comp', id, res.lots[id] ? 'L' : '-', JSON.stringify(res.comp[id])));
      if (res.ref) Object.keys(res.ref.comp).forEach(id => console.log('  refcomp', id, JSON.stringify(res.ref.comp[id])));
      console.log(' transfers', JSON.stringify(Object.keys(res.transfers).map(k => k + ':' + JSON.stringify(res.transfers[k].part))));
      console.log(' summary', JSON.stringify(res.runidSummary));
      console.log(' missing', res.missing.map(m => m.id + ':' + m.levelText).join(', '));
    }
    checkScenario(sc, res, rand, fails, `[seed ${SEED} 시나리오 ${sid}]`, cov);
    if (verifyJson && LT.serializeResult && LT.RESULT_SCHEMA) {
      const j = JSON.parse(JSON.stringify(LT.serializeResult(res)));
      verifyJson(j).forEach(p => fails.push(`[seed ${SEED} 시나리오 ${sid}] JSON 검산: ${p}`));
      jsonChecked++;
    }
    if (VERBOSE && fails.length > before) console.log('시나리오', sid, '입력', sc.input, 'SMT', !!sc.smt, sc.smt ? 'hosts ' + sc.smt.hosts.join(',') : '', 'ref', sc.refMode, sc.stats.nonArrayHost ? '비Array 병합 LOT' : '');
  }
  const uniq = [...new Set(fails)];
  const summary = `test-property: 시나리오 ${scen}개 (위치 수지 있음 ${withSummary}, SMT ${smtN}, 기준 공정 ${refN}, 같은 LOT 쌍 반복 이동 포함 ${repeatPairs}, 이력 없는 LOT 합계 ${missingLots}, ` +
    `SMT 일부 병합 ${extra.partialSmt}, 같은 시각 연산 ${extra.sameTime}, 같은 시각 받고 내보내기 ${extra.relay}, 다른 RUNID(자체 투입) LOT ${extra.feeder}, SMT 비Array 병합 LOT ${extra.nonArrayHost}) × 재생 ${NT}회, JSON 검산 ${jsonChecked}건, ` +
    `RUNID 몫 0 확인 이동 ${cov.cleanIn}건(보낸 LOT 이 그 전에 병합으로 받은 적 있음 ${cov.cleanInAfterRecv}건)`;
  if (!uniq.length) { console.log(summary + ' — 위반 0건'); return; }
  console.log(summary + ` — 위반 ${uniq.length}건 (서로 다른 메시지 기준)`);
  const bySc = {}; uniq.forEach(f => { const k = f.slice(0, f.indexOf(']') + 1); bySc[k] = (bySc[k] || 0) + 1; });
  console.log('위반이 난 시나리오 수:', Object.keys(bySc).length);
  const cats = {}; uniq.forEach(f => { const c = f.replace(/^\[[^\]]+\]\s*/, '').replace(/[A-Z]\d[0-9A-Z]{8}/g, '<LOT>').replace(/\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/g, '<T>').replace(/-?\d+/g, 'n'); cats[c] = (cats[c] || 0) + 1; });
  console.log('유형별:'); Object.keys(cats).sort((a, b) => cats[b] - cats[a]).slice(0, 20).forEach(c => console.log('  ', cats[c], '×', c));
  console.log('예:'); uniq.slice(0, MAXPRINT).forEach(f => console.log('  ', f));
  process.exitCode = 1;
})().catch(e => { console.error('ERROR', e.stack); process.exit(2); });
