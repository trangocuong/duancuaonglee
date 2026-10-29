

/* =====================================================================
 * LOT Tracker - 리포트 (report.js)
 *   - LOT Tracer 가로 공정 흐름표(그리드) 배치
 *   - 부가 시트(LOT 목록/불량/수율/이벤트/추가 필요 LOT/검증/RUNID 정보)
 *   - Excel 통합문서 생성 (xlsx-js-style)
 * 그리드는 화면 미리보기와 Excel 이 같은 데이터를 사용한다.
 * ===================================================================== */
(function (root) {
  'use strict';
  var LT = root.LotTracer || (typeof require !== 'undefined' ? require('./engine.js') : null);
  var Lx = LT.Lx;

  function stepKey(s) { var m = /^M(\d+)/.exec(s || ''); return m ? +m[1] : 99999; }
  function yld(i, o) { return (i && o !== null && o !== undefined && i > 0) ? o / i : ''; }
  // 확산 규모가 매우 크면 LOT ID를 한 셀에 다 이어붙이면 엑셀 셀 글자 수 한도(32,767자)를 넘어 리포트 생성 자체가 실패한다.
  // (test/bench.cjs 로 계보 2,000 + 확산 3,000 규모를 재현해 발견 — 실사용 규모(수십 개)에서는 발생하지 않았음)
  function joinCapped(arr, sep, limit) {
    sep = sep || ', '; limit = limit || 2000;
    var out = '', shown = 0;
    for (var i = 0; i < arr.length; i++) {
      var next = (shown ? sep : '') + arr[i];
      if (out.length + next.length > limit) break;
      out += next; shown++;
    }
    if (shown < arr.length) out += (shown ? sep : '') + Lx('… 외 ' + (arr.length - shown) + '개', '… và ' + (arr.length - shown) + ' mục khác');
    return out;
  }

  /* ------------------------------------------------------------------
   * 1. LOT 별 트랙(공정 순서대로 변경/실적 묶음)
   * ------------------------------------------------------------------ */
  function combineRuns(runs) {
    if (!runs.length) return null;
    var eqps = [];
    runs.forEach(function (r) { if (r.eqp && eqps.indexOf(r.eqp) < 0) eqps.push(r.eqp); });
    var sc = [];
    runs.forEach(function (r) { sc = sc.concat(r.scraps); });
    var codes = {};
    sc.forEach(function (s) { var k = s.code || '?'; codes[k] = (codes[k] || 0) + s.qty; });
    var fail = 0; sc.forEach(function (s) { fail += s.qty; });
    var first = runs[0], last = runs[runs.length - 1];
    var inQ = first.inQty !== null ? first.inQty : (last.outQty !== null ? last.outQty + fail : null);
    var outQ = last.outQty !== null ? last.outQty : null;
    return {
      eqp: eqps.join('/'), inQty: inQ, outQty: outQ, fail: fail, visits: runs.length,
      codes: Object.keys(codes).map(function (k) { return k + '*' + codes[k]; }).join('\n'),
      inTime: first.inTime, outTime: last.outTime, scraps: sc
    };
  }

  function buildTracks(res) {
    var lots = res.lots, smt = res.smt, smtSteps = LT.CONFIG.smtSteps;
    var tracks = {}, spread = res.spread || {};
    res.family.concat(res.spreadList || []).forEach(function (id) {
      var L = lots[id];
      if (!L) return;
      var sp = spread[id];
      var startTs = sp ? sp.entryTs : -Infinity;
      var startIdx = 0, excludeSrc = {}, skipSmtRuns = false, isRootCollapsed = false;
      if (smt && id === res.top) { isRootCollapsed = true; }
      if (smt && smt.hostInfo[id]) {
        startIdx = smt.hostInfo[id].collapseIdx;
        Object.keys(smt.subs).forEach(function (k) { if (smt.arrayMerge && smt.arrayMerge[k] === id) excludeSrc[k] = true; }); // 이 LOT 에 병합된 Array 만 (다른 병합 LOT 과의 병합은 표시)
        skipSmtRuns = true;
      }
      if (!smt && id === res.top) skipSmtRuns = true; // 최상위 LOT 의 SMT 실적은 SMT 칸으로
      var items = {};
      function item(step) { return items[step] || (items[step] = { step: step, muts: [], after: null, runs: [] }); }
      if (!isRootCollapsed) {
        L.events.forEach(function (e, i) {
          if (i <= startIdx && startIdx > 0) return;
          if (e.ts < startTs) return;
          // 확산 LOT 의 유입 MERGE 자체는 보낸 쪽 행에 표시되므로 제외
          if (sp && sp.via.kind === 'MERGE' && e.kind === 'MERGE_IN' && e.chgVals === sp.via.from && e.ts === sp.entryTs) return;
          if (e.kind === 'SPLIT_OUT') {
            var it = item(e.step);
            it.muts.push({ type: 'SPLIT', lot: e.chgVals, qty: e.chgQty, time: e.time, toSpread: !!spread[e.chgVals] });
            it.after = e.qty;
          }
          else if (e.kind === 'MERGE_IN' && !excludeSrc[e.chgVals]) { var it2 = item(e.step); it2.muts.push({ type: 'MERGE', dir: 'in', lot: e.chgVals, qty: e.chgQty, time: e.time }); it2.after = e.qty; }
          else if (e.kind === 'MERGE_OUT') {
            var it3 = item(e.step);
            it3.muts.push({ type: 'MERGE', dir: 'out', lot: e.chgVals, qty: -e.chgQty, time: e.time, toSpread: !!spread[e.chgVals] && !res.familySet[e.chgVals] });
            it3.after = e.qty;
          }
        });
        L.runs.forEach(function (r) {
          if (skipSmtRuns && smtSteps.indexOf(r.step) >= 0) return;
          if (startTs === -Infinity) { item(r.step).runs.push(r); return; }
          // 확산 LOT (0.3.2): 실적은 실적 시각, 불량은 불량 시각으로 RUNID 유입 이후인지 판단 — 불량 내역 시트와 같은 기준.
          //   이전에는 불량을 실적 시각으로만 걸러, TrackIn 없는 유입 전 불량이 들어가고 유입 전 실적에 붙은 유입 후 불량은 빠졌음.
          var rt = r.inTs !== undefined ? r.inTs : r.outTs;
          var post = r.scraps.filter(function (s) { return s.ts >= startTs; });
          if (rt !== undefined && rt >= startTs) {
            if (post.length === r.scraps.length) item(r.step).runs.push(r);
            else { var c = {}; Object.keys(r).forEach(function (k) { c[k] = r[k]; }); c.scraps = post; item(r.step).runs.push(c); }
          } else if (post.length) {
            item(r.step).runs.push({ step: r.step, eqp: post[0].eqp || r.eqp, inTime: null, outTime: null, inQty: null, outQty: null, scraps: post, implicit: true, scrapOnly: true });
          }
        });
      }
      var list = Object.keys(items).map(function (k) { var it = items[k]; it.run = combineRuns(it.runs); return it; });
      list.sort(function (a, b) { return stepKey(a.step) - stepKey(b.step); });
      tracks[id] = { id: id, items: list };
    });
    return tracks;
  }

  /* ------------------------------------------------------------------
   * 1-b. 계보 트리 (계보도 시트 · 화면 그림 · 흐름표 들여쓰기 공용)
   *   노드 = LOT 하나(또는 같은 공정·수량으로 나뉜 이력 없는 LOT 묶음)
   * ------------------------------------------------------------------ */
  LT.buildLineageTree = function (res) {
    var lots = res.lots, smt = res.smt, spread = res.spread || {}, smtSteps = LT.CONFIG.smtSteps;
    var levelOf = {};
    (res.missing || []).forEach(function (m) { levelOf[m.id] = m.levelText; });
    var placed = {}, seq = 0;
    function runInOf(id) {
      var c = res.comp && res.comp[id];
      var r = c && res.runLabel ? c[res.runLabel] : null;
      return r ? LT.rangeText(r) : '';
    }
    function flowOf(id) {
      var L = lots[id];
      if (!L) return { flow: '', fails: '' };
      var sp = spread[id], parts = [], codes = {};
      var skipSmt = (smt && (smt.hostInfo[id] || id === res.top)) || (!smt && id === res.top);
      L.events.forEach(function (e) {
        if (sp && e.ts < sp.entryTs) return;
        if (e.kind === 'TRACKIN') {
          if (skipSmt && smtSteps.indexOf(e.step) >= 0) return;
          var run = L.runs.filter(function (x) { return x.inTime === e.time && x.step === e.step; })[0];
          var f = run && run.scraps.length ? '(' + run.scraps.map(function (x) { return x.code + '×' + x.qty; }).join(',') + ')' : '';
          parts.push((e.eqp || e.step) + f);
        } else if (e.kind === 'MERGE_IN') {
          if (smt && smt.subs[e.chgVals] !== undefined) return;
          if (sp && e.chgVals === sp.via.from && e.ts === sp.entryTs) return;
          parts.push('+' + e.chgVals + ' ' + e.chgQty);
        }
      });
      L.scraps.forEach(function (x) { if (!sp || x.ts >= sp.entryTs) codes[x.code] = (codes[x.code] || 0) + x.qty; });
      return { flow: parts.join(' · '), fails: Object.keys(codes).map(function (k) { return k + '×' + codes[k]; }).join(', ') };
    }
    function mk(id, rel, step, qty, time, extra) {
      var L = lots[id], st = LT.lotStatus(L, null), fl = flowOf(id);
      var n = {
        key: 'n' + (seq++), id: id, ids: [id], rel: rel, step: step || '', qty: qty, time: time || '', loaded: !!L,
        flow: fl.flow, fails: fl.fails, qtyNow: L ? L.finalQty : '', curStep: L ? st.step : '', status: L ? st.text : Lx('이력 파일 없음', 'Không có tệp lịch sử'),
        runIn: (L && !L.finalQty) ? '' : runInOf(id), refStat: LT.refStatus ? LT.refStatus(res, id) : '', level: levelOf[id] || '',
        input: id === res.input, path: !!(res.pathSet && res.pathSet[id]), spread: !!spread[id], link: false, children: []
      };
      if (extra) Object.keys(extra).forEach(function (k) { n[k] = extra[k]; });
      if (n.link) { n.flow = ''; n.fails = ''; n.qtyNow = ''; n.curStep = ''; n.status = n.note || ''; n.runIn = ''; n.refStat = ''; n.level = ''; }
      return n;
    }
    function childEvents(id) {
      var L = lots[id];
      if (!L) return [];
      var sp = spread[id], out = [];
      L.events.forEach(function (e) {
        if (sp && e.ts < sp.entryTs) return;
        if (e.kind === 'SPLIT_OUT') {
          if (smt && id === res.top && smt.subs[e.chgVals] !== undefined) return;
          out.push({ kind: 'SPLIT', id: e.chgVals, qty: e.chgQty, step: e.step, time: e.time });
        } else if (e.kind === 'MERGE_OUT') out.push({ kind: 'MERGE', id: e.chgVals, qty: e.chgQty, step: e.step, time: e.time });
      });
      return out;
    }
    function walk(n) {
      placed[n.id] = true;
      var groups = [];
      childEvents(n.id).forEach(function (c) {
        var g = groups[groups.length - 1];
        var plainLeaf = c.kind === 'SPLIT' && !lots[c.id] && !placed[c.id];
        if (plainLeaf && g && g.plain && g.step === c.step && g.qty === c.qty && (levelOf[g.ids[0]] || '') === (levelOf[c.id] || '')) g.ids.push(c.id);
        else groups.push({ kind: c.kind, ids: [c.id], qty: c.qty, step: c.step, time: c.time, plain: plainLeaf });
      });
      groups.forEach(function (g) {
        var cid = g.ids[0], ch;
        if (g.ids.length > 1) {
          ch = mk(cid, 'SPLIT', g.step, g.qty, g.time, { ids: g.ids, group: true });
          ch.label = g.ids[0] + ' ~ ' + g.ids[g.ids.length - 1] + ' (' + g.ids.length + Lx('개)', ' LOT)');
          g.ids.forEach(function (x) { placed[x] = true; });
          n.children.push(ch); return;
        }
        if (g.kind === 'MERGE' && res.familySet[cid]) { n.children.push(mk(cid, 'MERGE →', g.step, g.qty, g.time, { link: true, note: Lx('계보 안으로 재병합', 'Gộp lại vào trong phả hệ') })); return; }
        if (g.kind === 'MERGE' && spread[cid] && spread[cid].via.from !== n.id) { n.children.push(mk(cid, 'MERGE →', g.step, g.qty, g.time, { link: true, note: Lx('다른 경로에 표시', 'Hiển thị ở nhánh khác') })); return; }
        if (placed[cid]) { n.children.push(mk(cid, g.kind === 'MERGE' ? 'MERGE →' : 'SPLIT', g.step, g.qty, g.time, { link: true, note: Lx('다른 경로에 표시', 'Hiển thị ở nhánh khác') })); return; }
        ch = mk(cid, g.kind === 'MERGE' ? 'MERGE →' : 'SPLIT', g.step, g.qty, g.time);
        n.children.push(ch);
        if (lots[cid]) walk(ch); else placed[cid] = true;
      });
    }
    var roots = [];
    var TL = lots[res.top];
    if (res.top) {
      var rootN = mk(res.top, TL && TL.origin ? Lx('RUNID 투입', 'Đầu vào RUNID') : Lx('최상위', 'Cao nhất'), TL && TL.origin ? TL.origin.step : '', TL ? (TL.origin ? TL.origin.qty : TL.createdQty) : '', TL && TL.origin ? TL.origin.time : '');
      if (smt) {
        placed[res.top] = true;
        rootN.flow = 'SMT ' + ((TL && TL.attrs.ASSYLINE) || '') + ' · Array ' + smt.subList.length + Lx('개', '');
        smt.hosts.forEach(function (h) {
          var hi = smt.hostInfo[h];
          var hn = mk(h, Lx('Array 병합', 'Gộp Array'), hi ? hi.mergeStep : '', hi ? hi.qty : '', hi ? hi.lastMerge : '');
          rootN.children.push(hn);
          if (lots[h]) walk(hn); else placed[h] = true;
        });
      } else walk(rootN);
      roots.push(rootN);
    }
    // 상위 이력이 없어 떨어져 나온 LOT (계보·확산)
    res.family.concat(res.spreadList || []).forEach(function (id) {
      if (placed[id] || !lots[id]) return;
      var par = spread[id] ? spread[id].via.from : res.parentOf[id];
      if (par && lots[par] && placed[par]) return;
      var on = mk(id, Lx('상위 이력 없음', 'Không có lịch sử LOT cha'), '', lots[id].createdQty, '', { note: Lx('상위 LOT ' + (par || '?') + ' 이력 없음', 'Không có lịch sử LOT cha ' + (par || '?')) });
      roots.push(on); walk(on);
    });
    // 평탄화 + 선 모양 접두어
    var flat = [];
    function flatten(n, depth, pre, isLast, isRoot, parentKey) {
      n.depth = depth; n.parentKey = parentKey || null;
      n.prefix = isRoot ? '' : pre + (isLast ? '└─ ' : '├─ ');
      flat.push(n);
      var np = isRoot ? '' : pre + (isLast ? '   ' : '│  ');
      n.children.forEach(function (c, i) { flatten(c, depth + 1, np, i === n.children.length - 1, false, n.key); });
    }
    roots.forEach(function (r) { flatten(r, 0, '', true, true, null); });
    return { roots: roots, nodes: flat };
  };

  /* 화면 계보도 전용 공정 축. 엑셀 계보/수량 계산에 쓰는 트리는 변경하지 않는다.
     공정 방문은 LOT의 작업 이력에서, 분할·병합 위치는 계보 연결에서 얻는다. */
  LT.buildProcessLineage = function (res, tree) {
    tree = tree || LT.buildLineageTree(res);
    var fixed = ['SMT', 'M033', 'M087', 'M100', 'M111', 'M130', 'M160', 'M164', 'M165'];
    var smtSteps = LT.CONFIG.smtSteps;
    var found = {}, visits = {};
    function stage(step) {
      step = String(step || '').trim().toUpperCase();
      return !step ? '?' : (step === 'SMT' || smtSteps.indexOf(step) >= 0 ? 'SMT' : step);
    }
    fixed.forEach(function (s) { found[s] = true; });
    tree.nodes.forEach(function (n) {
      var L = res.lots[n.id], list = [], byStage = {};
      function add(raw, kind, eqp, time) {
        var code = stage(raw), v = byStage[code];
        found[code] = true;
        if (!v) { v = byStage[code] = { step: code, runs: 0, transfer: false, eqps: [], times: [] }; list.push(v); }
        if (kind === 'run') v.runs++;
        else v.transfer = true;
        if (eqp && v.eqps.indexOf(eqp) < 0) v.eqps.push(eqp);
        if (time) v.times.push(time);
      }
      if (n.id === res.top && res.smt) add('SMT', 'run', '', '');
      if (n.step) add(n.step, 'transfer', '', n.time);
      if (L && !n.link) (L.runs || []).forEach(function (r) { add(r.step, 'run', r.eqp, r.inTime || r.outTime); });
      if (!list.length) add('', 'transfer', '', '');
      visits[n.key] = list;
    });
    var steps = Object.keys(found).sort(function (a, b) {
      if (a === 'SMT') return -1;
      if (b === 'SMT') return 1;
      if (a === '?') return 1;
      if (b === '?') return -1;
      var ma = /^M(\d+)$/.exec(a), mb = /^M(\d+)$/.exec(b);
      if (ma && mb) return (+ma[1]) - (+mb[1]);
      if (ma) return -1;
      if (mb) return 1;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    return { tree: tree, steps: steps, visits: visits };
  };

  /* ------------------------------------------------------------------
   * 2. LOT Tracer 그리드
   * ------------------------------------------------------------------ */
  LT.buildTracerGrid = function (res) {
    var lots = res.lots, smt = res.smt, smtSteps = LT.CONFIG.smtSteps;
    var tracks = buildTracks(res);
    var mutSteps = {}, runSteps = {};
    Object.keys(tracks).forEach(function (id) {
      tracks[id].items.forEach(function (it) {
        if (it.muts.length) mutSteps[it.step] = true;
        if (it.run) runSteps[it.step] = true;
      });
    });
    var hostMergeStep = null;
    if (smt && smt.hosts.length) {
      var hi0 = smt.hostInfo[smt.hosts[0]];
      hostMergeStep = hi0 ? hi0.mergeStep : null;
      if (hostMergeStep) mutSteps[hostMergeStep] = true;
    }
    var steps = LT.sortSteps(Object.keys(mutSteps).concat(Object.keys(runSteps)).filter(function (s, i, a) { return a.indexOf(s) === i; }));

    // 컬럼 정의
    var cols = [], colIdx = {};
    function addCol(h1, h2, w, kind, step, part) { cols.push({ h1: h1, h2: h2, w: w, kind: kind, step: step, part: part, ref: !!(res.refStep && step === res.refStep) }); return cols.length - 1; }
    var cLot = addCol(Lx('행 LOT', 'LOT của dòng'), 'LOT', 20, 'rowlot');
    var cPar = addCol(Lx('행 LOT', 'LOT của dòng'), Lx('상위 LOT', 'LOT cha'), 13, 'rowpar');
    var cSmt = addCol('SMT (' + smtSteps.join('~') + ')', 'EQP', 10, 'run', 'SMT', 'eqp');
    addCol('SMT (' + smtSteps.join('~') + ')', 'IN', 6, 'run', 'SMT', 'in');
    addCol('SMT (' + smtSteps.join('~') + ')', 'OUT', 6, 'run', 'SMT', 'out');
    addCol('SMT (' + smtSteps.join('~') + ')', 'SCRAP', 12, 'run', 'SMT', 'scrap');
    addCol('SMT (' + smtSteps.join('~') + ')', 'FAIL', 5, 'run', 'SMT', 'fail');
    addCol('SMT (' + smtSteps.join('~') + ')', 'YLD', 8, 'run', 'SMT', 'yld');
    steps.forEach(function (s) {
      var lab = LT.stepLabel(s) + (res.refStep === s ? Lx(' ★기준 공정', ' ★Công đoạn chuẩn') : '');
      colIdx[s] = {};
      if (mutSteps[s]) {
        colIdx[s].mut = addCol(lab, 'Mutation', 8, 'mut', s, 'm');
        addCol(lab, 'Change LOT', 12, 'mut', s, 'lot');
        addCol(lab, 'QTY', 6, 'mut', s, 'qty');
      }
      if (runSteps[s]) {
        colIdx[s].run = addCol(lab, 'EQP', 10, 'run', s, 'eqp');
        addCol(lab, 'IN', 6, 'run', s, 'in');
        addCol(lab, 'OUT', 6, 'run', s, 'out');
        addCol(lab, 'SCRAP', 12, 'run', s, 'scrap');
        addCol(lab, 'FAIL', 5, 'run', s, 'fail');
        addCol(lab, 'YLD', 8, 'run', s, 'yld');
      }
    });
    var cStat = addCol(Lx('현재 상태 (조회 시점)', 'Trạng thái hiện tại (tại thời điểm tra cứu)'), 'LOT', 13, 'status');
    addCol(Lx('현재 상태 (조회 시점)', 'Trạng thái hiện tại (tại thời điểm tra cứu)'), 'STEP', 7, 'status');
    addCol(Lx('현재 상태 (조회 시점)', 'Trạng thái hiện tại (tại thời điểm tra cứu)'), Lx('상태', 'Trạng thái'), 40, 'status');
    addCol(Lx('현재 상태 (조회 시점)', 'Trạng thái hiện tại (tại thời điểm tra cứu)'), 'QTY', 6, 'status');
    addCol(Lx('현재 상태 (조회 시점)', 'Trạng thái hiện tại (tại thời điểm tra cứu)'), Lx('RUNID 포함', 'RUNID có thể chứa'), 9, 'status');
    var cRef = res.ref ? addCol(Lx('현재 상태 (조회 시점)', 'Trạng thái hiện tại (tại thời điểm tra cứu)'), Lx(res.refStep + ' 기준', 'Theo ' + res.refStep), 22, 'status') : -1;
    addCol(Lx('현재 상태 (조회 시점)', 'Trạng thái hiện tại (tại thời điểm tra cứu)'), Lx('최종 이벤트', 'Sự kiện cuối'), 18, 'status');
    var lastCol = cols.length - 1;

    // 셀 저장
    var cells = [], occ = {}, rowLot = [], owner = [], placedTrack = {};
    function put(r, c, v, flags) {
      if (!cells[r]) cells[r] = [];
      cells[r][c] = { v: v, f: flags || '' };
    }
    function mark(r, c1, c2) { for (var c = c1; c <= c2; c++) occ[r + ':' + c] = true; }
    function free(r, ranges) {
      for (var i = 0; i < ranges.length; i++) for (var c = ranges[i][0]; c <= ranges[i][1]; c++) if (occ[r + ':' + c]) return false;
      return true;
    }
    function firstFree(from, ranges) { var r = from; while (!free(r, ranges)) r++; return r; }
    function putRun(r, c, run) {
      put(r, c, run.eqp); put(r, c + 1, run.inQty); put(r, c + 2, run.outQty);
      put(r, c + 3, run.codes, run.fail ? 'fail' : ''); put(r, c + 4, run.fail, run.fail ? 'fail' : '');
      put(r, c + 5, yld(run.inQty, run.outQty), 'pct' + (run.fail ? ' fail' : ''));
    }
    function runIn(id) {
      var c = res.comp && res.comp[id];
      var rr = c && res.runLabel ? c[res.runLabel] : null;
      return rr ? LT.rangeText(rr) : '';
    }
    function putStatus(r, id) {
      var L = lots[id];
      var st = LT.lotStatus(L, null);
      put(r, cStat, id, 'lotid'); put(r, cStat + 1, st.step); put(r, cStat + 2, st.text, L && !L.terminated ? 'live' : '');
      put(r, cStat + 3, L ? st.qty : ''); put(r, cStat + 4, L && !L.finalQty ? '' : runIn(id), 'runin');
      if (cRef >= 0) { var rs = LT.refStatus(res, id); put(r, cRef, rs, /미확인|봉쇄|chưa xác nhận|HOLD/.test(rs) ? 'fail' : ''); }
      put(r, lastCol, st.time);
    }
    var levelOf = {};
    (res.missing || []).forEach(function (m) { levelOf[m.id] = m.levelText; });
    function putMissingStatus(r, id, qty, kindText) {
      putStatus(r, id);
      cells[r][cStat + 2] = { v: Lx('이력 파일 없음 — ', 'Không có tệp lịch sử — ') + kindText, f: 'nofile' };
      cells[r][cStat + 3] = { v: qty, f: 'nofile' };
      cells[r][cStat + 4] = { v: runIn(id), f: 'runin' };
      if (/^권장|^선택|^Khuyến nghị|^Tùy chọn/.test(kindText)) cells[r][cStat + 2].f = 'nofile';
    }
    function putEntry(r, c, en) {
      var q = en.type === 'MERGE' ? (en.qty > 0 ? '+' + en.qty : String(en.qty)) : en.qty;
      put(r, c, en.type, 'm-' + (en.type === 'SPLIT' ? 'split' : (en.qty >= 0 ? 'in' : 'out')));
      put(r, c + 1, en.lot, 'lotid'); put(r, c + 2, en.type === 'MERGE' ? q : en.qty);
    }

    function layoutTrack(id, row, entryCol) {
      rowLot[row] = id; owner[row] = id; placedTrack[id] = true;
      put(row, cLot, id, 'lotid');
      mark(row, entryCol >= 0 ? entryCol : 0, lastCol);
      mark(row, cLot, cLot);
      var T = tracks[id];
      var groups = [];
      if (T) {
        T.items.forEach(function (it) {
          var ci = colIdx[it.step] || {};
          if (it.muts.length && ci.mut !== undefined) {
            if (ci.mut === entryCol) groups.push({ col: ci.mut, entries: it.muts });
            else {
              put(row, ci.mut, 'PARENT', 'm-parent'); put(row, ci.mut + 1, id, 'lotid'); put(row, ci.mut + 2, it.after);
              groups.push({ col: ci.mut, entries: it.muts });
            }
          }
          if (it.run && ci.run !== undefined) putRun(row, ci.run, it.run);
        });
      }
      putStatus(row, id);
      // 1차: 병합 행 (이 LOT 소유 행에만, 공정 칸이 비어 있으면 같은 행 공유)
      groups.forEach(function (g) {
        g.entries.forEach(function (en) {
          if (en.type !== 'MERGE') return;
          // 확산 대상 외부 LOT: 처음 유입된 LOT 아래에서 2차로 자기 행 배치 (그 외 경로는 병합 기록 행)
          if (en.toSpread && res.spread[en.lot] && res.spread[en.lot].via.from === id && !placedTrack[en.lot]) return;
          var r = row + 1;
          while (!(free(r, [[g.col, g.col + 2]]) && (owner[r] === undefined || owner[r] === 'M:' + id))) r++;
          putEntry(r, g.col, en);
          mark(r, g.col, g.col + 2);
          if (owner[r] === undefined) { owner[r] = 'M:' + id; rowLot[r] = id; put(r, cLot, '↳ ' + id, 'sub'); mark(r, cLot, cLot); }
        });
      });
      // 2차: 분할 자식 (오른쪽 공정부터, 같은 공정 안에서는 시간순)
      groups.slice().reverse().forEach(function (g) {
        g.entries.forEach(function (en) {
          var ownRow = en.type === 'SPLIT' || (en.type === 'MERGE' && en.toSpread && res.spread[en.lot] && res.spread[en.lot].via.from === id);
          if (!ownRow) return;
          if (en.type === 'MERGE' && placedTrack[en.lot]) return; // 1차에서 병합 기록 행으로 처리됨
          if (tracks[en.lot] && !placedTrack[en.lot]) {
            var r2 = firstFree(row + 1, [[g.col, lastCol], [cLot, cLot]]);
            putEntry(r2, g.col, en);
            layoutTrack(en.lot, r2, g.col);
          } else {
            var r3 = firstFree(row + 1, [[g.col, g.col + 2], [cStat, lastCol], [cLot, cLot]]);
            putEntry(r3, g.col, en);
            mark(r3, g.col, g.col + 2); mark(r3, cStat, lastCol); mark(r3, cLot, cLot);
            owner[r3] = en.lot; rowLot[r3] = en.lot; put(r3, cLot, en.lot, 'lotid');
            if (!tracks[en.lot]) putMissingStatus(r3, en.lot, Math.abs(en.qty), levelOf[en.lot] || Lx('필수(확산)', 'Bắt buộc(phân tán)'));
            else putStatus(r3, en.lot);
          }
        });
      });
    }

    // 첫 행: RUNID
    var R0 = 0;
    var top = res.top, TL = top ? lots[top] : null;
    var attrs = TL ? TL.attrs : {};
    var partNo = '';
    if (res.pms) {
      var prods = {};
      res.pms.forEach(function (r) { if (r.PROD_ID) prods[r.PROD_ID] = true; });
      partNo = Object.keys(prods).join(', ');
    }
    var runIdText = res.root ? (res.rootConfirmed ? res.root : res.root + Lx(' (추정)', ' (ước tính)')) : (top ? Lx('미확인 (최상위 ', 'Chưa xác định (LOT cao nhất ') + top + ')' : '');
    var info = 'PART NO ' + (partNo || '-') + ' · SMT RUNID ' + (runIdText || '-') + ' · QTY ' + (TL ? (TL.origin ? TL.origin.qty : TL.createdQty) : '-') +
      ' · PROC_ID ' + (attrs.PROC_ID || '-') + ' · EVAL ' + (attrs.EVALCODE || '-') + ' · TIER ' + (attrs.TIER || '-') + ' · OPT ' + (attrs.OPTCODE || '-') +
      (res.refNote ? Lx(' · 기준 공정: ', ' · Công đoạn chuẩn: ') + res.refNote : '');
    mark(R0, 0, cSmt + 5);

    if (smt) {
      var issue = TL && TL.origin ? TL.origin.qty : null;
      var hostQty = 0;
      smt.hosts.forEach(function (h) { if (smt.hostInfo[h]) hostQty += smt.hostInfo[h].qty; });
      var eqp = attrs.ASSYLINE || '';
      if (!eqp) {
        var hs = smt.hostInfo[smt.hosts[0]];
        if (hs && hs.smtRuns.length) eqp = hs.smtRuns.map(function (r) { return r.eqp; }).filter(Boolean).join('/');
      }
      var hostKnown = smt.hosts.length && smt.hosts.every(function (h) { return smt.hostInfo[h]; });
      var sf = issue !== null && hostKnown ? issue - hostQty : '';
      putRun(R0, cSmt, { eqp: eqp, inQty: issue, outQty: hostKnown ? hostQty : null, codes: hostKnown ? '' : Lx('병합 LOT 이력 필요', 'Cần lịch sử LOT gộp'), fail: sf });
      var mc = colIdx[hostMergeStep] ? colIdx[hostMergeStep].mut : undefined;
      smt.hosts.forEach(function (h, i) {
        var q = smt.hostInfo[h] ? smt.hostInfo[h].qty : '';
        var en = { type: 'MERGE', lot: h, qty: q };
        if (mc === undefined) {
          var rr = i === 0 ? R0 : firstFree(R0 + 1, [[cStat, lastCol], [cLot, cLot]]);
          owner[rr] = h; rowLot[rr] = h; put(rr, cLot, h, 'lotid'); putStatus(rr, h); mark(rr, cStat, lastCol); mark(rr, cLot, cLot);
          cells[rr][cStat + 2] = { v: Lx('SMT 병합 LOT — 이력 파일 없음 (추가 필요)', 'LOT gộp SMT — không có tệp lịch sử (cần bổ sung)'), f: 'nofile' };
          return;
        }
        if (i === 0) {
          put(R0, mc, 'MERGE', 'm-in'); put(R0, mc + 1, h, 'lotid'); put(R0, mc + 2, q);
          mark(R0, cSmt + 6, mc - 1);
          if (tracks[h]) layoutTrack(h, R0, mc);
          else { rowLot[R0] = h; put(R0, cLot, h, 'lotid'); putStatus(R0, h); }
        } else {
          var r5 = firstFree(R0 + 1, [[mc, lastCol], [cLot, cLot]]);
          put(r5, mc, 'MERGE', 'm-in'); put(r5, mc + 1, h, 'lotid'); put(r5, mc + 2, q);
          if (tracks[h]) layoutTrack(h, r5, mc);
          else { rowLot[r5] = h; put(r5, cLot, h, 'lotid'); putStatus(r5, h); mark(r5, mc, lastCol); }
        }
      });
      if (smt.unresolved.length && mc !== undefined) {
        var r6 = firstFree(R0 + 1, [[mc, mc + 2], [cLot, cLot]]);
        owner[r6] = 'M:' + top; mark(r6, cLot, cLot);
        put(r6, mc, Lx('미확인', 'Chưa xác định'), 'm-out'); put(r6, mc + 1, 'Array ' + smt.unresolved.length + Lx('개', '')); put(r6, mc + 2, '');
        mark(r6, mc, mc + 2);
      }
      if (!smt.hosts.length) { rowLot[R0] = top; put(R0, cLot, top, 'lotid'); putStatus(R0, top); }
    } else if (TL) {
      var smtRuns = TL.runs.filter(function (r) { return smtSteps.indexOf(r.step) >= 0; });
      var sr = combineRuns(smtRuns);
      if (sr) putRun(R0, cSmt, sr);
      else if (TL.origin) putRun(R0, cSmt, { eqp: attrs.ASSYLINE || '', inQty: TL.origin.qty, outQty: null, codes: '', fail: 0 });
      layoutTrack(top, R0, -1);
    }

    // 상위 LOT 이력이 없어 본 계보에 붙지 못한 LOT 묶음 (예: 경로 중간 LOT 이력 누락)
    var placed = {};
    rowLot.forEach(function (id, r) { if (owner[r] === id) placed[id] = true; });
    (res.spreadList || []).forEach(function (id) {
      if (placedTrack[id] || !tracks[id]) return;
      var rr = firstFree(0, [[0, lastCol]]);
      layoutTrack(id, rr, -1);
      put(rr, cPar, res.spread[id].via.from + Lx(' (확산)', ' (phân tán)'), 'nofile');
    });
    res.family.forEach(function (id) {
      if (placed[id] || !tracks[id] || id === res.top) return;
      var par = res.parentOf[id];
      if (par && lots[par]) return; // 부모가 있으면 부모 쪽에서 배치됨
      var rr = firstFree(0, [[0, lastCol]]);
      layoutTrack(id, rr, -1);
      put(rr, cPar, (par || '?') + Lx(' (이력 없음)', ' (không có lịch sử)'), 'nofile');
      rowLot.forEach(function (x, r) { if (owner[r] === x) placed[x] = true; });
    });

    // 행 채우기 (빈 칸도 배열로)
    var nRows = cells.length;
    for (var r = 0; r < nRows; r++) {
      if (!cells[r]) cells[r] = [];
      for (var c = 0; c <= lastCol; c++) if (!cells[r][c]) cells[r][c] = { v: '', f: '' };
    }
    // 계보 깊이로 행 LOT 들여쓰기, 상위 LOT 채우기
    var depthOf = {};
    LT.buildLineageTree(res).nodes.forEach(function (n) { if (!n.link) n.ids.forEach(function (x) { if (depthOf[x] === undefined) depthOf[x] = n.depth; }); });
    for (var rI = 0; rI < nRows; rI++) {
      var rid = rowLot[rI];
      if (!rid) continue;
      var isSub = typeof owner[rI] === 'string' && owner[rI].indexOf('M:') === 0;
      cells[rI][cLot].indent = (depthOf[rid] || 0) + (isSub ? 1 : 0);
      if (!isSub && !cells[rI][cPar].v) {
        var par = res.spread && res.spread[rid] ? res.spread[rid].via.from : (res.parentOf[rid] || '');
        cells[rI][cPar] = { v: par, f: 'lotid' };
      }
    }

    // 입력 경로 / 입력 LOT 강조 플래그
    for (var r2 = 0; r2 < nRows; r2++) {
      var id = rowLot[r2];
      var tag = id === res.input ? 'input' : (res.pathSet && res.pathSet[id] ? 'path' : (res.spread && res.spread[id] ? 'spread' : ''));
      if (r2 === R0 && res.pathSet && res.pathSet[res.top]) tag = tag || 'path';
      if (tag) for (var c2 = 0; c2 <= lastCol; c2++) cells[r2][c2].row = tag;
    }
    var title = Lx('LOT Tracer — 입력 LOT ', 'LOT Tracer — LOT đầu vào ') + res.input + ' · SMT RUNID ' + (runIdText || '-') + Lx(' · 조회 경로 ', ' · Đường truy vết ') + res.path.join(' → ');
    return { cols: cols, cells: cells, rowLot: rowLot, owner: owner, title: title, info: info, lastCol: lastCol, steps: steps };
  };

  /* ------------------------------------------------------------------
   * 3. 부가 시트 데이터
   * ------------------------------------------------------------------ */
  LT.buildSheets = function (res) {
    var lots = res.lots, smt = res.smt, spread = res.spread || {};
    var sheets = [];
    var inPath = function (id) { return res.pathSet && res.pathSet[id] ? (id === res.input ? Lx('입력 LOT', 'LOT đầu vào') : Lx('경로', 'Đường truy')) : ''; };
    var R = res.runLabel;
    var rt = LT.rangeText;
    var runOf = function (c) { return c && R && c[R] ? c[R] : null; };

    // RUNID 확산 (원자재 이슈 봉쇄 범위)
    var S = res.runidSummary;
    if (S) {
      var pre = [
        [Lx('기준 RUNID', 'RUNID chuẩn'), S.runId + Lx(' (투입 ', ' (đầu vào ') + S.total + 'ea)'],
        [Lx('SMT 감소', 'Hao hụt SMT'), S.smtLoss === null ? Lx('미확인 — 병합 LOT(또는 PMS 파일)이 없어 위치 미확정에 포함', 'Chưa rõ — không có LOT gộp (hoặc tệp PMS) nên đã tính vào chưa xác định vị trí') : S.smtLoss + 'ea'],
        [Lx('불량 처리', 'Xử lý lỗi'), rt(S.scrap) + 'ea' + (S.other && S.other[1] ? Lx(' · 기타 감소(설명되지 않은 수량 감소) ', ' · giảm khác (số lượng giảm chưa giải thích được) ') + rt(S.other) + 'ea' : '')],
        [Lx('이력 확인된 LOT에 남아 있음', 'Còn trong LOT có lịch sử'), rt(S.known) + 'ea · ' + S.holders.length + Lx('개 LOT', ' LOT')],
        [Lx('위치 미확정 (이력 없는 LOT 등)', 'Chưa xác định vị trí (LOT không có lịch sử, v.v.)'), rt(S.unknown) + 'ea · ' + S.missingHolders.length + Lx('개 LOT — "추가 필요 LOT"의 필수 LOT 이력을 추가하면 줄어듭니다', ' LOT — sẽ giảm khi bổ sung lịch sử các LOT "Bắt buộc" trong "Danh sách LOT cần bổ sung"')],
        [Lx('수지 검산', 'Đối chiếu cân đối'), S.balanced ? Lx('일치 (투입 = 위 항목 합계 범위 안)', 'Khớp (đầu vào nằm trong tổng các mục trên)') : Lx('불일치 — 설명되지 않는 수량 ', 'Không khớp — số lượng chưa giải thích được: ') + (S.imbalance > 0 ? S.imbalance + Lx('ea 부족', 'ea (thiếu)') : (-S.imbalance) + Lx('ea 초과', 'ea (dư)')) + Lx('. 이력 파일 간 수량이 맞는지 검증 시트를 확인하세요', '. Hãy kiểm tra sheet "Kiểm tra" xem số lượng giữa các tệp lịch sử có khớp không')],
        [Lx('수량 표시', 'Cách hiển thị số lượng'), Lx('최소~최대. 다른 RUNID 제품과 섞인 뒤 나뉘면 LOT별 정확한 수량을 알 수 없어 범위로 표시합니다 (S/N 자료로 확정 가능).', 'Tối thiểu~tối đa. Khi sản phẩm bị trộn với RUNID khác rồi tách ra thì không biết chính xác số lượng từng LOT, nên hiển thị dạng khoảng (có thể xác định bằng dữ liệu S/N).')]
      ];
      var F = res.ref && res.ref.summary;
      if (F) {
        var st = res.ref.step;
        pre = [pre[0], pre[1],
          [Lx('기준 공정', 'Công đoạn chuẩn'), res.ref.note || st],
          [Lx(st + ' 전 불량', 'Lỗi trước ' + st), rt(F.scrapPre) + 'ea' + (F.otherPre && F.otherPre[1] ? Lx(' · ' + st + ' 전 기타 감소 ' + rt(F.otherPre) + 'ea', ' · ' + st + ' trước: giảm khác ' + rt(F.otherPre) + 'ea') : '')],
          [Lx(st + ' 이력 확인 (테스트됨)', 'Đã xác nhận ' + st + ' (đã test)'), rt(F.tested) + 'ea' + (F.codeQty ? Lx(' · ' + st + ' ' + res.ref.code + ' 불량 ' + F.codeQty + 'ea 중 RUNID 제품 ' + rt(F.codeR) + 'ea', ' · ' + st + ': trong ' + F.codeQty + 'ea lỗi ' + res.ref.code + ' có ' + rt(F.codeR) + 'ea sản phẩm RUNID') : '')],
          [Lx(st + ' 미진행 (이력 있는 LOT)', 'Chưa qua ' + st + ' (LOT có lịch sử)'), rt(F.pending) + 'ea · ' + joinCapped(F.pendingLots.map(function (x) { return x.id; }), ', ') + (F.pendingLots.length ? Lx(' — 봉쇄 우선', ' — ưu tiên HOLD') : '')],
          [Lx(st + ' 이력 미확인 (필수)', 'Chưa xác nhận ' + st + ' (bắt buộc)'), Lx(rt(F.unknown) + 'ea · ' + F.missPre.length + '개 LOT — 이 LOT들의 ' + st + ' 이력 필요', rt(F.unknown) + 'ea · ' + F.missPre.length + ' LOT — cần lịch sử ' + st + ' của các LOT này')],
          [Lx(st + ' 이후 분할 (권장)', 'Tách sau ' + st + ' (khuyến nghị)'), Lx(F.missPost.length + '개 LOT — ' + st + ' 결과는 앞 LOT 이력에 있음, 출하 여부만 확인', F.missPost.length + ' LOT — kết quả ' + st + ' đã có trong lịch sử LOT trước, chỉ cần kiểm tra xuất hàng')],
          [st + Lx(' 수지 검산', ' đối chiếu cân đối'), F.balanced ? Lx('일치', 'Khớp') : Lx('불일치 — 설명되지 않는 수량 ', 'Không khớp — số lượng chưa giải thích được: ') + (F.imbalance > 0 ? F.imbalance + Lx('ea 부족', 'ea (thiếu)') : (-F.imbalance) + Lx('ea 초과', 'ea (dư)'))],
          pre[6]];
      }
      var srows = [];
      var order = res.family.concat(res.spreadList || []);
      order.forEach(function (id) {
        if (smt && id === res.top) return;
        var L = lots[id], sp = spread[id];
        var entry = smt && smt.hostInfo[id] ? [smt.hostInfo[id].qty, smt.hostInfo[id].qty] : runOf(res.entryComp[id]);
        var now = runOf(res.comp[id]);
        var kind, via = '';
        if (sp) {
          kind = sp.via.kind === 'MERGE' ? Lx('외부 LOT (병합으로 유입)', 'LOT bên ngoài (vào qua gộp)') : Lx('외부 LOT (분할로 유입)', 'LOT bên ngoài (vào qua tách)');
          via = sp.via.from + ' → ' + (sp.via.kind === 'MERGE' ? 'MERGE ' : 'SPLIT ') + sp.via.qty + 'ea · ' + sp.via.step + ' · ' + sp.via.time;
        } else {
          var isHost = smt && smt.hosts.indexOf(id) >= 0;
          kind = isHost ? (smt.hostInfo[id] ? Lx('RUNID 계보 (SMT 병합 LOT)', 'Phả hệ RUNID (LOT gộp SMT)') : Lx('RUNID 계보 (SMT 병합 LOT, 이력 없음)', 'Phả hệ RUNID (LOT gộp SMT, không có lịch sử)')) : Lx('RUNID 계보', 'Phả hệ RUNID');
          var par = res.parentOf[id];
          var PL = par ? lots[par] : null;
          var spl = PL ? PL.splitOuts.filter(function (x) { return x.child === id; })[0] : null;
          var mapped = 0; if (isHost) smt.subList.forEach(function (x) { if (smt.hostOf[x] === id) mapped++; });
          via = isHost ? (smt.hostInfo[id] ? res.top + ' → SMT Array ' + smt.hostInfo[id].mergeCount + Lx('개 병합 · ', ' được gộp · ') + smt.hostInfo[id].mergeStep : res.top + ' → SMT Array ' + mapped + Lx('개 병합 (PMS 기준, 이 LOT 이력 없음)', ' được gộp (theo PMS, LOT này không có lịch sử)'))
            : (spl ? par + ' → SPLIT ' + spl.qty + 'ea · ' + spl.step + ' · ' + spl.time : (par || ''));
        }
        var st = LT.lotStatus(L, null);
        var act, mLevel = (res.missing || []).filter(function (m) { return m.id === id; })[0];
        if (!L) act = mLevel ? (mLevel.level === 1 ? Lx('이력 필요 — ', 'Cần lịch sử — ') : Lx('확인 — ', 'Kiểm tra — ')) + mLevel.levelText : Lx('이력 필요', 'Cần lịch sử');
        else if (res.ref && /미진행|chưa thực hiện/.test(LT.refStatus(res, id))) act = res.ref.step + Lx(' 미진행 — 봉쇄 우선', ' chưa thực hiện — ưu tiên HOLD');
        else if (L.finalQty > 0 && now && now[1] > 0) act = Lx('현재 위치 확인됨 — 봉쇄/HOLD 검토 대상', 'Đã xác nhận vị trí hiện tại — xem xét cách ly/HOLD');
        else if (L.finalQty > 0) act = Lx('현재 LOT에 RUNID 제품 없음', 'LOT hiện tại không có sản phẩm RUNID');
        else act = Lx('비어 있음 (모두 이동·종료)', 'Trống (đã chuyển/kết thúc hết)');
        var row = [id, kind, via, entry ? rt(entry) : '', L ? L.finalQty : '', L ? (L.finalQty ? (now ? rt(now) : '0') : '0') : (now ? rt(now) : '')];
        if (res.ref) {
          var rc = res.ref.comp[id] || {}, keep = !L || L.finalQty;
          row.push(keep && rc[res.ref.pre] ? rt(rc[res.ref.pre]) : (keep ? '0' : ''), keep && rc[res.ref.post] ? rt(rc[res.ref.post]) : (keep ? '0' : ''), LT.refStatus(res, id));
        }
        srows.push(row.concat([L ? st.step : '', L ? st.text : Lx('이력 파일 없음', 'Không có tệp lịch sử'), L ? L.source : Lx('없음', 'Không có'), act]));
      });
      // 계보/확산 목록 밖의 위치 미확정 몫 (병합 LOT 미확인 Array LOT, 추적 범위 밖으로 나간 몫) — 0.3.2
      var inOrder = {}; order.forEach(function (id) { inOrder[id] = true; });
      S.missingHolders.forEach(function (h) {
        if (inOrder[h.id]) return;
        var mLv = (res.missing || []).filter(function (m) { return m.id === h.id; })[0];
        var row = [h.id, h.kind || Lx('위치 미확정', 'Chưa xác định vị trí'), (h.via || []).join(' / '), rt(h.range), lots[h.id] ? lots[h.id].finalQty : '', rt(h.range)];
        if (res.ref) row.push('', '', '');
        srows.push(row.concat(['', lots[h.id] ? LT.lotStatus(lots[h.id], null).text : Lx('이력 파일 없음', 'Không có tệp lịch sử'), lots[h.id] ? lots[h.id].source : Lx('없음', 'Không có'), mLv ? (mLv.level === 1 ? Lx('이력 필요 — ', 'Cần lịch sử — ') : Lx('확인 — ', 'Kiểm tra — ')) + mLv.levelText : Lx('위치 확인 필요', 'Cần kiểm tra vị trí')]));
      });
      sheets.push({
        name: Lx('RUNID 확산', 'Phân tán RUNID'),
        pre: pre,
        header: ['LOT', Lx('구분', 'Phân loại'), Lx('들어온 경로', 'Đường vào'), Lx('들어온 RUNID 수량', 'SL RUNID vào'), Lx('현재 수량', 'SL hiện tại'), Lx('현재 RUNID 포함', 'RUNID hiện có')].concat(res.ref ? [Lx('그중 ' + res.ref.step + ' 전', 'Trong đó trước ' + res.ref.step), Lx('그중 ' + res.ref.step + ' 후', 'Trong đó sau ' + res.ref.step), Lx(res.ref.step + ' 기준 상태', 'Trạng thái theo ' + res.ref.step)] : []).concat([Lx('현재 STEP', 'STEP hiện tại'), Lx('상태', 'Trạng thái'), Lx('이력 파일', 'Tệp lịch sử'), Lx('조치', 'Hành động')]),
        widths: [13, 22, 52, 12, 8, 12].concat(res.ref ? [10, 10, 26] : []).concat([8, 40, 20, 30]),
        rows: srows, lotCol: 0, spreadCol: 0, actCol: res.ref ? 12 : 9
      });

      // 기준 공정 이력 시트
      if (res.ref) {
        var ref = res.ref, stp = ref.step, trows = [];
        ref.tested.forEach(function (t) {
          var L = lots[t.lot];
          var run = L ? L.runs.filter(function (r) { return r.step === stp && r.inTime === t.time; })[0] : null;
          var scs = ref.scrapComp.filter(function (x) { return x.lot === t.lot && x.step === stp && (!run || !run.outTs || x.ts <= run.outTs) && x.ts >= t.ts; });
          var codes = {}; scs.forEach(function (x) { codes[x.code] = (codes[x.code] || 0) + x.qty; });
          var codeQ = 0, codeR = [0, 0];
          scs.forEach(function (x) { if (ref.code && x.code === ref.code) { codeQ += x.qty; var r = x.scrapped[ref.post]; if (r) { codeR[0] += r[0]; codeR[1] += r[1]; } } });
          var tot = [t.converted[0] + t.alreadyPost[0], t.converted[1] + t.alreadyPost[1]];
          trows.push([run && !run.outTime ? stp + Lx(' 진행 중', ' đang thực hiện') : stp + Lx(' 완료', ': hoàn thành'), t.lot, res.familySet[t.lot] ? Lx('RUNID 계보', 'Phả hệ RUNID') : Lx('외부 LOT(확산)', 'LOT bên ngoài (phân tán)'), t.eqp, t.time, run ? run.outTime || '' : '', t.qty, run ? run.outQty : '',
            Object.keys(codes).map(function (k) { return k + '*' + codes[k]; }).join(', '), ref.code ? codeQ : '', rt(tot), ref.code ? rt(codeR) : '', t.alreadyPost[1] ? Lx('재테스트 포함 (이미 ', 'Bao gồm test lại (sản phẩm đã qua ') + stp + Lx(' 거친 제품 ', ': ') + rt(t.alreadyPost) + ')' : '']);
        });
        (ref.summary ? ref.summary.pendingLots : []).forEach(function (x) {
          var L = lots[x.id], stt = LT.lotStatus(L, null);
          trows.push([stp + Lx(' 미진행 — 봉쇄 우선', ' chưa thực hiện — ưu tiên HOLD'), x.id, res.familySet[x.id] ? Lx('RUNID 계보', 'Phả hệ RUNID') : Lx('외부 LOT(확산)', 'LOT bên ngoài (phân tán)'), '', '', '', x.qty, '', '', '', rt(x.range), '', Lx('현재 ', 'Hiện tại ') + stt.step + ' · ' + stt.text]);
        });
        (ref.summary ? ref.summary.missPre : []).forEach(function (x) {
          var sp2 = spread[x.id];
          trows.push([stp + Lx(' 이력 미확인 — 필수', ': chưa xác nhận lịch sử — bắt buộc'), x.id, res.familySet[x.id] ? Lx('RUNID 계보', 'Phả hệ RUNID') : (spread[x.id] ? Lx('외부 LOT(확산)', 'LOT bên ngoài (phân tán)') : (x.kind || '')), '', '', '', '', '', '', '', rt(x.range), '',
            (sp2 ? sp2.via.from + ' → ' + sp2.via.qty + 'ea (' + sp2.via.step + ', ' + sp2.via.time + ')' : ((x.via && x.via.length ? x.via.join(' / ') : res.parentOf[x.id]) || '')) + Lx(' · 이력 파일 필요', ' · cần tệp lịch sử')]);
        });
        sheets.push({
          name: Lx(stp + ' 이력', 'Lịch sử ' + stp),
          pre: [[Lx('기준 공정', 'Công đoạn chuẩn'), ref.note || stp],
            [Lx('요약', 'Tóm tắt'), Lx('RUNID 제품 ' + (ref.summary ? ref.summary.total : '') + 'ea 중 ' + stp + ' 이력 확인 ' + (ref.summary ? rt(ref.summary.tested) : '') + 'ea · 미진행 ' + (ref.summary ? rt(ref.summary.pending) : '') + 'ea · 이력 미확인 ' + (ref.summary ? rt(ref.summary.unknown) : '') + 'ea',
        'Sản phẩm RUNID ' + (ref.summary ? ref.summary.total : '') + 'ea: đã xác nhận ' + stp + ' ' + (ref.summary ? rt(ref.summary.tested) : '') + 'ea · chưa qua ' + (ref.summary ? rt(ref.summary.pending) : '') + 'ea · chưa xác nhận lịch sử ' + (ref.summary ? rt(ref.summary.unknown) : '') + 'ea')],
            [Lx('수량 표시', 'Cách hiển thị số lượng'), Lx('"우리 RUNID 제품" 수량은 최소~최대 범위 (다른 RUNID와 섞인 LOT은 정확히 알 수 없음)', 'Số lượng "sản phẩm RUNID của chúng ta" là khoảng tối thiểu~tối đa (LOT trộn với RUNID khác không thể biết chính xác)')]],
          header: [Lx('구분', 'Phân loại'), 'LOT', Lx('계보/확산', 'Phả hệ/Phân tán'), 'EQP', 'TrackIn', 'TrackOut', 'IN', 'OUT', Lx('불량 코드', 'Mã lỗi'), ref.code ? Lx(ref.code + ' 수량', 'SL ' + ref.code) : Lx('기준 코드', 'Mã chuẩn'), Lx('그중 우리 RUNID 제품', 'Trong đó SP RUNID của ta'), ref.code ? Lx(ref.code + ' 중 우리 RUNID', 'RUNID của ta trong ' + ref.code) : '', Lx('비고', 'Ghi chú')],
          widths: [22, 13, 14, 10, 18, 18, 7, 7, 16, 9, 14, 14, 50],
          rows: trows, lotCol: 1, actCol: 0
        });
      }
    }

    // LOT 목록
    var lotRows = [];
    var seen = {};
    function kindOf(id) {
      if (id === res.root) return 'SMT RUNID';
      if (smt && smt.hostInfo[id]) return Lx('SMT 병합 LOT', 'LOT gộp SMT');
      if (res.familySet[id]) return 'SPLIT';
      if (spread[id]) return spread[id].via.kind === 'MERGE' ? Lx('외부 병합 LOT(확산)', 'LOT gộp bên ngoài (phân tán)') : Lx('외부 분할 LOT(확산)', 'LOT tách bên ngoài (phân tán)');
      return '';
    }
    res.family.forEach(function (id) {
      seen[id] = true;
      var L = lots[id];
      var st = LT.lotStatus(L, null);
      var par = res.parentOf[id] || (L && L.splitFrom ? L.splitFrom.parent : '');
      var created = L ? (L.origin ? L.origin : L.splitFrom) : null;
      var mi = 0, so = 0, mo = 0, sc = 0;
      if (L) {
        L.mergeIns.forEach(function (m) { if (!(smt && smt.subs[m.src] !== undefined)) mi += m.qty; });
        L.splitOuts.forEach(function (s) { if (!(smt && id === res.top)) so += s.qty; });
        L.mergeOuts.forEach(function (m) { mo += m.qty; });
        L.scraps.forEach(function (s) { sc += s.qty; });
      }
      var PL = par ? lots[par] : null;
      var sp = !L && PL ? PL.splitOuts.filter(function (s) { return s.child === id; })[0] : null;
      lotRows.push([
        id, kindOf(id), par || '', created ? created.step : (sp ? sp.step : ''), created ? created.time : (sp ? sp.time : ''),
        L ? L.createdQty : (sp ? sp.qty : ''), mi || '', so || '', mo || '', sc || '',
        L ? L.finalQty : '', st.step, st.text, st.time, LT.compText(res.compMax[id]), inPath(id), L ? L.source : Lx('없음', 'Không có')
      ]);
    });
    res.foreignIns.forEach(function (f) {
      if (seen[f.src]) return; seen[f.src] = true;
      var fr = res.foreignRunId[f.src];
      lotRows.push([f.src, Lx('병합 유입(외부)', 'Gộp vào (bên ngoài)'), '→ ' + f.into, f.step, f.time, f.qty, '', '', '', '', '', '', lots[f.src] ? LT.lotStatus(lots[f.src]).text : Lx('이력 파일 없음', 'Không có tệp lịch sử'), '',
        fr && fr.runId ? 'RUNID ' + fr.runId : Lx('RUNID 미확인', 'Chưa rõ RUNID'), '', lots[f.src] ? lots[f.src].source : Lx('없음', 'Không có')]);
    });
    (res.spreadList || []).forEach(function (id) {
      if (seen[id]) return; seen[id] = true;
      var L = lots[id], sp = spread[id], st = LT.lotStatus(L, null);
      var mi = 0, so = 0, mo = 0, sc = 0;
      if (L) {
        L.mergeIns.forEach(function (m) { if (m.ts >= sp.entryTs) mi += m.qty; });
        L.splitOuts.forEach(function (x) { if (x.ts >= sp.entryTs) so += x.qty; });
        L.mergeOuts.forEach(function (m) { if (m.ts >= sp.entryTs) mo += m.qty; });
        L.scraps.forEach(function (x) { if (x.ts >= sp.entryTs) sc += x.qty; });
      }
      lotRows.push([id, kindOf(id), sp.via.from, sp.via.step, sp.via.time, sp.via.qty, mi || '', so || '', mo || '', sc || '',
        L ? L.finalQty : '', st.step, st.text, st.time, LT.compText(res.compMax[id]), '', L ? L.source : Lx('없음', 'Không có')]);
    });
    res.mergeTargets.forEach(function (t) {
      if (seen[t.dst]) return; seen[t.dst] = true;
      lotRows.push([t.dst, Lx('병합 반출 대상(외부)', 'Đích gộp ra (bên ngoài)'), t.from + ' →', t.step, t.time, t.qty, '', '', '', '', '', '', lots[t.dst] ? LT.lotStatus(lots[t.dst]).text : Lx('이력 파일 없음', 'Không có tệp lịch sử'), '', '', '', lots[t.dst] ? lots[t.dst].source : Lx('없음', 'Không có')]);
    });
    sheets.push({
      name: Lx('LOT 목록', 'Danh sách LOT'),
      header: ['LOT', Lx('구분', 'Phân loại'), Lx('상위/관련 LOT', 'LOT cha/liên quan'), Lx('생성(유입) STEP', 'STEP tạo (vào)'), Lx('생성(유입) 시각', 'Thời điểm tạo (vào)'), Lx('생성(유입) 수량', 'SL tạo (vào)'), Lx('병합 유입', 'Gộp vào'), Lx('분할 반출', 'Tách ra'), Lx('병합 반출', 'Gộp ra'), Lx('불량', 'Lỗi'), Lx('현재 수량', 'SL hiện tại'), Lx('현재 STEP', 'STEP hiện tại'), Lx('상태', 'Trạng thái'), Lx('최종 이벤트', 'Sự kiện cuối'), Lx('구성 RUNID (이력 중 최대 범위)', 'Thành phần RUNID (khoảng lớn nhất trong lịch sử)'), Lx('입력 경로', 'Đường LOT đầu vào'), Lx('이력 파일', 'Tệp lịch sử')],
      widths: [13, 16, 14, 8, 18, 8, 8, 8, 8, 6, 8, 8, 44, 18, 44, 9, 22],
      rows: lotRows, lotCol: 0
    });

    // 불량 내역
    var fRows = [];
    res.family.concat(res.spreadList || []).forEach(function (id) {
      var L = lots[id];
      if (!L) return;
      L.scraps.forEach(function (s) {
        if (spread[id] && s.ts < spread[id].entryTs) return;
        var sc = (res.scrapComp || []).filter(function (x) { return x.lot === id && x.time === s.time && x.qtyBefore === s.qty + s.qtyAfter; })[0];
        var scR = sc ? runOf(sc.scrapped) : null;
        fRows.push([s.time, id, s.step, LT.CONFIG.stepNames[s.step] || '', s.eqp, s.code, s.desc, s.qty, scR ? rt(scR) : (sc ? '0' : ''), s.recycleLot || '', sc ? sc.qtyBefore : '', sc ? LT.compText(sc.comp) : '', inPath(id)]);
      });
    });
    fRows.sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
    sheets.push({
      name: Lx('불량 내역', 'Chi tiết lỗi'),
      header: [Lx('발생 시각', 'Thời điểm'), 'LOT', 'STEP', Lx('공정', 'Công đoạn'), 'EQP', Lx('불량 코드', 'Mã lỗi'), Lx('내용', 'Nội dung'), Lx('수량', 'SL'), Lx('그중 ' + (R || 'RUNID') + ' 제품', 'Trong đó SP ' + (R || 'RUNID')), Lx('불량품 이동 LOT', 'LOT chứa hàng lỗi'), Lx('불량 시점 LOT 수량', 'SL LOT khi lỗi'), Lx('불량 시점 구성 (RUNID별 최소~최대)', 'Thành phần khi lỗi (theo RUNID, tối thiểu~tối đa)'), Lx('입력 경로', 'Đường LOT đầu vào')],
      widths: [18, 13, 7, 10, 10, 9, 28, 6, 12, 15, 10, 52, 9],
      rows: fRows, lotCol: 1
    });

    // 공정 수율
    var agg = {};
    var tracks = buildTracks(res);
    Object.keys(tracks).forEach(function (id) {
      tracks[id].items.forEach(function (it) {
        if (!it.run) return;
        var k = it.step + '|' + it.run.eqp;
        var a = agg[k] || (agg[k] = { step: it.step, eqp: it.run.eqp, lots: [], inQ: 0, outQ: 0, fail: 0, codes: {} });
        a.lots.push(id); a.inQ += it.run.inQty || 0; a.outQ += it.run.outQty || 0; a.fail += it.run.fail;
        it.run.scraps.forEach(function (s) { a.codes[s.code] = (a.codes[s.code] || 0) + s.qty; });
      });
    });
    var yRows = [];
    if (smt && lots[res.top] && lots[res.top].origin) {
      var hq = 0; smt.hosts.forEach(function (h) { if (smt.hostInfo[h]) hq += smt.hostInfo[h].qty; });
      var iq = lots[res.top].origin.qty;
      yRows.push(['SMT', 'SMT', lots[res.top].attrs.ASSYLINE || '', res.top, iq, hq, iq - hq, yld(iq, hq), '']);
    }
    Object.keys(agg).map(function (k) { return agg[k]; })
      .sort(function (a, b) { return stepKey(a.step) - stepKey(b.step) || (a.eqp < b.eqp ? -1 : 1); })
      .forEach(function (a) {
        yRows.push([a.step, LT.CONFIG.stepNames[a.step] || '', a.eqp, joinCapped(a.lots, ', '), a.inQ, a.outQ, a.fail, yld(a.inQ, a.outQ),
          Object.keys(a.codes).map(function (c) { return c + '*' + a.codes[c]; }).join(', ')]);
      });
    sheets.push({ name: Lx('공정 수율', 'Hiệu suất công đoạn'), header: ['STEP', Lx('공정', 'Công đoạn'), 'EQP', 'LOT', 'IN', 'OUT', 'FAIL', 'YLD', Lx('불량 코드', 'Mã lỗi')], widths: [7, 10, 10, 40, 7, 7, 6, 9, 22], rows: yRows, pctCols: [7] });

    // 이벤트 이력
    var tl = LT.timeline(res);
    sheets.push({
      name: Lx('이벤트 이력', 'Lịch sử sự kiện'),
      header: [Lx('시각', 'Thời điểm'), 'LOT', 'EVENT', 'STEP', 'EQP', Lx('QTY(후)', 'QTY(sau)'), Lx('변경 LOT', 'LOT thay đổi'), Lx('변경 수량', 'SL thay đổi'), 'COMMENT', 'OPERID'],
      widths: [18, 13, 14, 7, 10, 8, 16, 8, 50, 11],
      rows: tl.map(function (t) { return [t.time, t.lot, t.event, t.step, t.eqp, t.qty, t.chgVals, t.chgQty || '', t.comment, t.oper || '']; }),
      lotCol: 1
    });

    // 추가 필요 LOT
    sheets.push({
      name: Lx('추가 필요 LOT', 'LOT cần bổ sung'),
      header: ['LOT', Lx('필요도', 'Mức cần thiết'), Lx('이유', 'Lý do'), Lx('관련 LOT', 'LOT liên quan')],
      widths: [13, 7, 60, 30],
      rows: res.missing.map(function (m) { return [m.id, m.levelText, m.reasons.join(' / '), m.related.join(', ')]; }),
      note: Lx('MES LOT History에서 조회해 xls로 저장 → 파일명에 LOT ID가 들어가게 저장 → 도구에 추가하고 다시 추적하세요. 필수(역추적·전개): RUNID까지/RUNID 이후 추적이 끊긴 LOT · 필수(확산): RUNID 제품이 흘러 들어간 LOT(원자재 이슈 봉쇄 범위) · 권장(혼입): 섞여 들어온 LOT의 RUNID 확인 · 선택: 불량품 이동 LOT 등.', 'Tra cứu trong MES LOT History, lưu thành xls → đặt tên tệp có chứa LOT ID → thêm vào công cụ và truy vết lại. Bắt buộc(truy ngược·triển khai): LOT làm đứt truy vết đến/sau RUNID · Bắt buộc(phân tán / lịch sử công đoạn chuẩn): LOT nhận sản phẩm RUNID (phạm vi cách ly khi có sự cố nguyên vật liệu) · Khuyến nghị(trộn lẫn / kiểm tra xuất hàng): xác nhận RUNID của LOT trộn vào, hoặc kiểm tra xuất hàng · Tùy chọn: LOT chứa hàng lỗi v.v.')
    });

    // 검증
    var cRows = res.checks.map(function (c) { return [c.level, c.item, c.detail]; });
    res.notes.forEach(function (n) { cRows.push(['INFO', Lx('참고', 'tham khảo'), n]); });
    sheets.push({ name: Lx('검증', 'Kiểm tra'), header: [Lx('결과', 'Kết quả'), Lx('항목', 'Hạng mục'), Lx('내용', 'Nội dung')], widths: [7, 26, 110], rows: cRows, levelCol: 0 });

    // RUNID 정보
    var info = [];
    var TL = lots[res.top];
    info.push([Lx('입력 LOT', 'LOT đầu vào'), res.input]);
    info.push(['SMT RUNID', res.root ? res.root + (res.rootConfirmed ? '' : Lx(' (추정)', ' (ước tính)')) : Lx('미확인', 'Chưa xác định')]);
    info.push([Lx('역추적 경로', 'Đường truy ngược'), res.path.join(' → ')]);
    info.push([Lx('데이터 소스', 'Nguồn dữ liệu'), res.dataSource]);
    if (TL && TL.origin) info.push([Lx('투입', 'Đầu vào'), TL.origin.time + ' · ' + TL.origin.qty + 'ea · ' + TL.origin.event]);
    if (res.pms) {
      var prods = {}; res.pms.forEach(function (r) { prods[r.PROD_ID] = true; });
      info.push(['PART NO (PMS PROD_ID)', Object.keys(prods).join(', ')]);
      info.push([Lx('PMS Array 수', 'Số Array PMS'), res.pms.length + Lx('개 (PCB_ARRAY ', ' (PCB_ARRAY ') + (res.pms[0].PCB_ARRAY || '') + 'ea/Array)']);
      var ts = res.pms.map(function (r) { return r.CREATE_DATE; }).sort();
      info.push([Lx('PMS 기록 시각', 'Thời điểm ghi PMS'), ts[0] + ' ~ ' + ts[ts.length - 1]]);
    } else info.push(['PART NO', Lx('PMS 파일 없음 — 비워 둠', 'Không có tệp PMS — để trống')]);
    if (smt) {
      smt.hosts.forEach(function (h) {
        var hi = smt.hostInfo[h];
        if (hi) info.push([Lx('SMT 병합 LOT ', 'LOT gộp SMT ') + h, hi.mergeCount + Lx('개 Array LOT 병합 (', ' LOT Array được gộp (') + hi.mergeStep + ', ' + hi.firstMerge + ' ~ ' + hi.lastMerge + ') → ' + hi.qty + 'ea']);
      });
    }
    if (TL) Object.keys(TL.attrs).sort().forEach(function (k) { info.push([Lx('속성 ', 'Thuộc tính ') + k, TL.attrs[k]]); });
    sheets.push({ name: Lx('RUNID 정보', 'Thông tin RUNID'), header: [Lx('항목', 'Hạng mục'), Lx('값', 'Giá trị')], widths: [28, 80], rows: info });
    return sheets;
  };

  /* ------------------------------------------------------------------
   * 4. Excel 통합문서
   * ------------------------------------------------------------------ */
  var C = {
    navy: '1F3864', h2: 'D9E1F2', mut: 'F2F2F2', path: 'FFF2CC', input: 'FCE4D6', spread: 'E4DFEC', border: 'BFBFBF',
    red: 'C00000', green: '1E7B34', warn: '9C5700', gray: '808080', blue: '1F4E9A'
  };
  function border() { var b = { style: 'thin', color: { rgb: C.border } }; return { top: b, bottom: b, left: b, right: b }; }
  function cellStyle(col, cell, isHeader) {
    var s = { font: { name: '맑은 고딕', sz: 9 }, border: border(), alignment: { vertical: 'center' } };
    if (isHeader) return s;
    var fill = null;
    if (col.kind === 'mut') fill = C.mut;
    if (cell.row === 'spread') fill = C.spread;
    if (cell.row === 'path') fill = C.path;
    if (cell.row === 'input') fill = C.input;
    if (fill) s.fill = { patternType: 'solid', fgColor: { rgb: fill } };
    var f = cell.f || '';
    if (f.indexOf('fail') >= 0 && cell.v !== '' && cell.v !== 0) s.font = { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: C.red } };
    if (f.indexOf('lotid') >= 0) s.font = { name: '맑은 고딕', sz: 9, bold: cell.row === 'input', color: { rgb: C.blue } };
    if (f.indexOf('m-split') >= 0) s.font = { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: C.blue } };
    if (f.indexOf('m-in') >= 0) s.font = { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: C.green } };
    if (f.indexOf('m-out') >= 0) s.font = { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: C.warn } };
    if (f.indexOf('m-parent') >= 0) s.font = { name: '맑은 고딕', sz: 9, color: { rgb: C.gray } };
    if (f.indexOf('nofile') >= 0) s.font = { name: '맑은 고딕', sz: 9, italic: true, color: { rgb: C.gray } };
    if (col.part === 'scrap') s.alignment = { vertical: 'center', wrapText: true };
    if (f.indexOf('pct') >= 0) s.numFmt = '0.00%';
    if (f.indexOf('runin') >= 0 && cell.v !== '') s.font = { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: '7030A0' } };
    if (cell.indent) s.alignment = { vertical: 'center', indent: cell.indent };
    return s;
  }
  function hdrStyle(level) {
    return {
      font: { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: level === 1 ? 'FFFFFF' : '000000' } },
      fill: { patternType: 'solid', fgColor: { rgb: level === 1 ? C.navy : C.h2 } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: border()
    };
  }
  function toCell(v, s) {
    if (v === null || v === undefined || v === '') return { t: 's', v: '', s: s };
    if (typeof v === 'number') return { t: 'n', v: v, s: s };
    return { t: 's', v: String(v), s: s };
  }

  LT.buildWorkbook = function (res, XLSX, extra) {
    extra = extra || {};
    var wb = XLSX.utils.book_new();
    var g = LT.buildTracerGrid(res);
    var ws = {}, merges = [];
    var addr = function (r, c) { return XLSX.utils.encode_cell({ r: r, c: c }); };
    wb.LT_FREEZE = [];

    // ---- 계보도 시트 (첫 시트): 들여쓰기 트리 + 행 그룹(+/−) + 흐름표 행으로 가는 링크
    (function () {
      var tree = LT.buildLineageTree(res);
      var trackRow = {};
      g.cells.forEach(function (row, r) { var v = row[0].v; if (v && g.owner[r] === v && trackRow[v] === undefined) trackRow[v] = r; });
      var t = {}, rowsMeta = [];
      var hdr = [Lx('계보 (LOT을 누르면 LOT Tracer 상세 행으로 이동)', 'Phả hệ (bấm vào LOT để đến dòng chi tiết trong LOT Tracer)'), Lx('관계', 'Quan hệ'), Lx('공정', 'Công đoạn'), Lx('이동 수량', 'SL di chuyển'), Lx('거친 공정·설비 (불량)', 'Công đoạn·thiết bị đã qua (lỗi)'), Lx('불량 합계', 'Tổng lỗi'), Lx('현재 수량', 'SL hiện tại'), Lx('현재 STEP', 'STEP hiện tại'), Lx('상태', 'Trạng thái'), Lx('RUNID 포함', 'RUNID có thể chứa')]
        .concat(res.ref ? [Lx(res.ref.step + ' 기준', 'Theo ' + res.ref.step)] : []).concat([Lx('필요도', 'Mức cần thiết'), Lx('비고', 'Ghi chú')]);
      var widths = [58, 11, 7, 8, 70, 14, 8, 8, 40, 10].concat(res.ref ? [26] : []).concat([16, 26]);
      t[addr(0, 0)] = { t: 's', v: Lx('계보도 — 입력 LOT ', 'Phả hệ — LOT đầu vào ') + res.input + ' · SMT RUNID ' + (res.root || Lx('미확인', 'Chưa xác định')) + (res.refNote ? Lx(' · 기준 공정: ', ' · Công đoạn chuẩn: ') + res.refNote : ''), s: { font: { name: '맑은 고딕', sz: 12, bold: true } } };
      t[addr(1, 0)] = { t: 's', v: Lx('왼쪽 [+]/[−] 로 가지를 접고 펼 수 있습니다 · 주황=입력 LOT, 노랑=입력 LOT→RUNID 경로, 보라=RUNID 제품이 흘러 들어간 외부 LOT, 회색 기울임=이력 파일 없음 · RUNID 포함=그 LOT에 있을 수 있는 RUNID 제품 최소~최대', 'Dùng [+]/[−] bên trái để thu gọn/mở rộng nhánh · Cam = LOT đầu vào, Vàng = đường LOT đầu vào→RUNID, Tím = LOT bên ngoài nhận sản phẩm RUNID, Xám nghiêng = không có tệp lịch sử · RUNID có thể chứa = số sản phẩm RUNID tối thiểu~tối đa có thể có trong LOT đó'), s: { font: { name: '맑은 고딕', sz: 9, color: { rgb: '595959' } } } };
      var HR = 3;
      hdr.forEach(function (h, c) { t[addr(HR, c)] = toCell(h, hdrStyle(1)); });
      rowsMeta[HR] = { hpt: 18 };
      tree.nodes.forEach(function (n, i) {
        var r = HR + 1 + i;
        var fill = n.input ? C.input : n.path ? C.path : n.spread ? C.spread : null;
        var base = function (extra) {
          var st = { font: { name: '맑은 고딕', sz: 9, italic: !n.loaded || n.link, color: { rgb: (!n.loaded || n.link) ? '808080' : '000000' } }, border: border(), alignment: { vertical: 'center' } };
          if (fill) st.fill = { patternType: 'solid', fgColor: { rgb: fill } };
          if (extra) Object.keys(extra).forEach(function (k) { st[k] = extra[k]; });
          return st;
        };
        var name = n.prefix + (n.label || n.id) + (n.input ? Lx('  ★입력', '  ★Đầu vào') : '');
        var treeCell = toCell(name, base({ font: { name: '굴림체', sz: 10, bold: n.input || n.path, color: { rgb: (!n.loaded || n.link) ? '808080' : C.blue } } }));
        if (trackRow[n.id] !== undefined && !n.group) treeCell.l = { Target: "#'LOT Tracer'!A" + (5 + trackRow[n.id] + 1), Tooltip: Lx('LOT Tracer 에서 ' + n.id + ' 보기', 'Xem ' + n.id + ' trong LOT Tracer') };
        t[addr(r, 0)] = treeCell;
        var vals = [n.rel, n.step, n.qty === '' ? '' : n.qty, n.flow, n.fails, n.qtyNow, n.curStep, n.status, n.runIn].concat(res.ref ? [n.refStat] : []).concat([n.level, n.group ? joinCapped(n.ids, ', ') : (n.note || '')]);
        vals.forEach(function (v, j) {
          var c = j + 1, st = base();
          if (hdr[c] === Lx('필요도', 'Mức cần thiết') && v) st.font = { name: '맑은 고딕', sz: 9, bold: /^필수|^Bắt buộc/.test(v), color: { rgb: /^필수|^Bắt buộc/.test(v) ? C.red : /^권장|^Khuyến nghị/.test(v) ? C.warn : C.gray } };
          if (hdr[c] === Lx('불량 합계', 'Tổng lỗi') && v) st.font = { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: C.red } };
          if (hdr[c] === Lx('RUNID 포함', 'RUNID có thể chứa') && v) st.font = { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: '7030A0' } };
          if (res.ref && hdr[c] === Lx(res.ref.step + ' 기준', 'Theo ' + res.ref.step) && /미확인|봉쇄|chưa xác nhận|HOLD/.test(v)) st.font = { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: C.red } };
          if (hdr[c] === Lx('관계', 'Quan hệ') && /SPLIT/.test(v)) st.font = { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: C.blue } };
          if (hdr[c] === Lx('관계', 'Quan hệ') && /MERGE/.test(v)) st.font = { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: C.warn } };
          t[addr(r, c)] = toCell(v, st);
        });
        rowsMeta[r] = { level: Math.min(n.depth, 7) };
      });
      t['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: HR + Math.max(tree.nodes.length, 1), c: hdr.length - 1 } });
      t['!cols'] = widths.map(function (w) { return { wch: w }; });
      t['!rows'] = rowsMeta;
      t['!outline'] = { above: true };
      XLSX.utils.book_append_sheet(wb, t, Lx('계보도', 'Phả hệ'));
      wb.LT_FREEZE.push({ x: 1, y: HR + 1 });
    })();

    ws[addr(0, 0)] = { t: 's', v: g.title, s: { font: { name: '맑은 고딕', sz: 12, bold: true } } };
    ws[addr(1, 0)] = { t: 's', v: Lx('노란 행: 입력 LOT → RUNID 경로 · 주황 행: 입력 LOT · 보라 행: RUNID 제품이 흘러 들어간 외부 LOT(확산) · SPLIT=분할, MERGE +n=병합 유입 / −n=병합 반출, PARENT=해당 공정 변경 후 잔량 · RUNID 포함=그 LOT에 있을 수 있는 RUNID 제품 최소~최대 · 생성: ', 'Dòng vàng: đường LOT đầu vào → RUNID · Dòng cam: LOT đầu vào · Dòng tím: LOT bên ngoài nhận sản phẩm RUNID (phân tán) · SPLIT=tách, MERGE +n=gộp vào / −n=gộp ra, PARENT=số còn lại sau thay đổi tại công đoạn đó · RUNID có thể chứa = số sản phẩm RUNID tối thiểu~tối đa có thể có trong LOT đó · Tạo lúc: ') + (extra.generatedAt || res.tracedAt) + ' · ' + (extra.appLabel || ''), s: { font: { name: '맑은 고딕', sz: 9, color: { rgb: '595959' } } } };
    ws[addr(2, 0)] = { t: 's', v: g.info, s: { font: { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: '1F3864' } } } };
    var H1 = 3, H2 = 4, D0 = 5;
    var start = 0;
    g.cols.forEach(function (col, c) {
      var h1s = hdrStyle(1), h2s = hdrStyle(2);
      if (col.ref) { h1s.fill = { patternType: 'solid', fgColor: { rgb: 'C65911' } }; h2s.fill = { patternType: 'solid', fgColor: { rgb: 'F8CBAD' } }; }
      ws[addr(H1, c)] = toCell(col.h1, h1s);
      ws[addr(H2, c)] = toCell(col.h2, h2s);
      var nxt = g.cols[c + 1];
      if (!nxt || nxt.h1 !== col.h1) {
        if (c > start) merges.push({ s: { r: H1, c: start }, e: { r: H1, c: c } });
        start = c + 1;
      }
    });
    g.cells.forEach(function (row, r) {
      row.forEach(function (cell, c) { ws[addr(D0 + r, c)] = toCell(cell.v, cellStyle(g.cols[c], cell, false)); });
    });
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: D0 + Math.max(g.cells.length, 1) - 1, c: g.lastCol } });
    ws['!merges'] = merges;
    ws['!cols'] = g.cols.map(function (c) { return { wch: c.w }; });
    ws['!rows'] = [{ hpt: 20 }];
    ws['!freeze'] = { xSplit: 1, ySplit: D0 };
    ws['!views'] = [{ state: 'frozen', xSplit: 1, ySplit: D0, topLeftCell: 'B6' }];
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: H2, c: 0 }, e: { r: D0 + g.cells.length - 1, c: g.lastCol } }) };
    XLSX.utils.book_append_sheet(wb, ws, 'LOT Tracer');
    wb.LT_FREEZE.push({ x: 2, y: D0 });

    LT.buildSheets(res).forEach(function (sh) {
      var w = {};
      var r0 = 0;
      if (sh.note) { w[addr(0, 0)] = { t: 's', v: sh.note, s: { font: { name: '맑은 고딕', sz: 9, color: { rgb: '595959' } } } }; r0 = 2; }
      if (sh.pre) {
        sh.pre.forEach(function (kv, i) {
          w[addr(r0 + i, 0)] = { t: 's', v: kv[0], s: { font: { name: '맑은 고딕', sz: 9, bold: true }, fill: { patternType: 'solid', fgColor: { rgb: C.h2 } }, border: border() } };
          w[addr(r0 + i, 1)] = { t: 's', v: kv[1], s: { font: { name: '맑은 고딕', sz: 9, bold: i === 4, color: { rgb: i === 4 ? C.red : '000000' } }, border: border() } };
        });
        (w['!merges'] = w['!merges'] || []);
        sh.pre.forEach(function (kv, i) { w['!merges'].push({ s: { r: r0 + i, c: 1 }, e: { r: r0 + i, c: Math.min(sh.header.length - 1, 7) } }); });
        r0 += sh.pre.length + 1;
      }
      sh.header.forEach(function (h, c) { w[addr(r0, c)] = toCell(h, hdrStyle(1)); });
      sh.rows.forEach(function (row, i) {
        var rowTag = '';
        if (sh.lotCol !== undefined) {
          var id = row[sh.lotCol];
          rowTag = id === res.input ? 'input' : (res.pathSet && res.pathSet[id] ? 'path' : (res.spread && res.spread[id] ? 'spread' : ''));
        }
        row.forEach(function (v, c) {
          var s = { font: { name: '맑은 고딕', sz: 9 }, border: border(), alignment: { vertical: 'center', wrapText: typeof v === 'string' && v.length > 40 } };
          if (rowTag) s.fill = { patternType: 'solid', fgColor: { rgb: rowTag === 'input' ? C.input : rowTag === 'spread' ? C.spread : C.path } };
          if (sh.pctCols && sh.pctCols.indexOf(c) >= 0) s.numFmt = '0.00%';
          if (sh.levelCol === c) {
            var col = v === 'PASS' ? C.green : v === 'FAIL' ? C.red : v === 'WARN' ? C.warn : C.gray;
            s.font = { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: col } };
          }
          if (sh.name === Lx('추가 필요 LOT', 'LOT cần bổ sung') && c === 1) { var lv = String(v); s.font = { name: '맑은 고딕', sz: 9, bold: lv.indexOf(Lx('필수', 'Bắt buộc')) === 0, color: { rgb: lv.indexOf(Lx('필수', 'Bắt buộc')) === 0 ? C.red : lv.indexOf(Lx('권장', 'Khuyến nghị')) === 0 ? C.warn : C.gray } }; }
          if (sh.actCol === c && /필수|Bắt buộc/.test(String(v))) s.font = { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: C.red } };
          else if (sh.actCol === c && /봉쇄|HOLD/.test(String(v))) s.font = { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: C.warn } };
          w[addr(r0 + 1 + i, c)] = toCell(v, s);
        });
      });
      w['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r0 + Math.max(sh.rows.length, 1), c: sh.header.length - 1 } });
      w['!cols'] = sh.widths.map(function (x) { return { wch: x }; });
      if (sh.rows.length) w['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: r0, c: 0 }, e: { r: r0 + sh.rows.length, c: sh.header.length - 1 } }) };
      XLSX.utils.book_append_sheet(wb, w, sh.name);
      wb.LT_FREEZE.push({ x: 0, y: r0 + 1 });
    });
    return wb;
  };

  /* 틀 고정: xlsx-js-style 이 pane 을 쓰지 않으므로 저장된 xlsx 의 sheetView 를 직접 수정 */
  LT.finalizeXlsx = function (bytes, JSZip, freeze) {
    return JSZip.loadAsync(bytes).then(function (zip) {
      var jobs = (freeze || []).map(function (f, i) {
        var path = 'xl/worksheets/sheet' + (i + 1) + '.xml';
        var file = zip.file(path);
        if (!file || (!f.x && !f.y)) return null;
        return file.async('string').then(function (xml) {
          var col = '', n = f.x, c;
          n = f.x + 1;
          while (n > 0) { c = (n - 1) % 26; col = String.fromCharCode(65 + c) + col; n = Math.floor((n - 1) / 26); }
          var tl = col + (f.y + 1);
          var pane = '<pane' + (f.x ? ' xSplit="' + f.x + '"' : '') + (f.y ? ' ySplit="' + f.y + '"' : '') +
            ' topLeftCell="' + tl + '" activePane="' + (f.x && f.y ? 'bottomRight' : f.y ? 'bottomLeft' : 'topRight') + '" state="frozen"/>';
          var view = '<sheetView workbookViewId="0">' + pane + '</sheetView>';
          xml = xml.replace(/<sheetView workbookViewId="0"\/>/, view);
          zip.file(path, xml);
        });
      }).filter(Boolean);
      return Promise.all(jobs).then(function () {
        return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      });
    });
  };

  /* 검증 ZIP 등에 넣을 결과 요약(JSON) — 원본 이벤트 전체는 제외 */
  /* 검증 ZIP 등에 넣을 결과(JSON). 0.3.2: 이 파일만으로 결과를 다시 검산할 수 있도록
     확산 LOT 목록(유입 시각·경로), LOT별 현재/유입/최대 구성, 이동 한 건별 구성, 위치 수지·기준 공정 수지 전체를 넣는다.
     원본 이벤트 전체는 넣지 않는다 (원본 파일은 같은 ZIP 의 inputs/ 에 최근 5회분 보관). */
  LT.RESULT_SCHEMA = 2;
  LT.serializeResult = function (res) {
    var lots = {};
    Object.keys(res.lots).forEach(function (id) {
      var L = res.lots[id];
      if (!L) { lots[id] = null; return; }
      lots[id] = {
        source: L.source, events: L.events.length, exportTime: L.exportTime || null, createdQty: L.createdQty, finalQty: L.finalQty, finalStep: L.finalStep,
        origin: L.origin, splitFrom: L.splitFrom, splitOuts: L.splitOuts, mergeIns: L.mergeIns, mergeOuts: L.mergeOuts,
        runs: L.runs.map(function (r) { return { step: r.step, eqp: r.eqp, inQty: r.inQty, outQty: r.outQty, inTime: r.inTime, outTime: r.outTime, implicit: !!r.implicit, scraps: r.scraps.length }; }),
        scraps: L.scraps, holds: L.holds, qtyIssues: L.qtyIssues, status: LT.lotStatus(L, null)
      };
    });
    var pick = function (m, ids) { var o = {}; ids.forEach(function (id) { if (m && m[id]) o[id] = m[id]; }); return o; };
    var ids = res.family.concat(res.spreadList || []);
    var spread = (res.spreadList || []).map(function (id) {
      var x = res.spread[id];
      return { id: id, entryTime: x.entryTime, entryTs: x.entryTs, depth: x.depth, via: x.via, vias: x.vias, loaded: !!res.lots[id] };
    });
    var transferList = function (pend) {
      return Object.keys(pend || {}).map(function (k) { var t = pend[k]; return { key: k, from: t.from, to: t.to, qty: t.qty, part: t.part }; });
    };
    var ref = res.ref ? {
      step: res.ref.step, code: res.ref.code, note: res.ref.note, pre: res.ref.pre, post: res.ref.post, summary: res.ref.summary,
      comp: pick(res.ref.comp, ids), tested: res.ref.tested, scrapComp: res.ref.scrapComp, outside: res.ref.outside, otherOut: res.ref.otherOut,
      status: ids.reduce(function (o, id) { o[id] = LT.refStatus(res, id); return o; }, {})
    } : null;
    return {
      schema: LT.RESULT_SCHEMA,
      input: res.input, root: res.root, rootConfirmed: res.rootConfirmed, top: res.top, path: res.path, runLabel: res.runLabel || null,
      dataSource: res.dataSource, tracedAt: res.tracedAt, family: res.family, parentOf: res.parentOf,
      smt: res.smt ? { hosts: res.smt.hosts, hostInfo: res.smt.hostInfo, subCount: res.smt.subList.length, subs: res.smt.subs, hostOf: res.smt.hostOf, unresolved: res.smt.unresolved, pmsCount: res.smt.pmsCount } : null,
      foreignIns: res.foreignIns, mergeTargets: res.mergeTargets, foreignRunId: res.foreignRunId,
      spread: spread,
      comp: pick(res.comp, ids), entryComp: pick(res.entryComp, ids), compMax: res.compMax,
      transfers: transferList(res.transfers), outside: res.outside || [], otherOut: res.otherOut || [],
      scrapComp: res.scrapComp, runidSummary: res.runidSummary || null, ref: ref,
      missing: res.missing, checks: res.checks, notes: res.notes, lots: lots
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = LT;
})(typeof globalThis !== 'undefined' ? globalThis : this);

