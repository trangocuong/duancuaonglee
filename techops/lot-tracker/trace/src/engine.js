

/* =====================================================================
 * LOT Tracker - 추적 엔진 (engine.js)
 *   - MES LOT 이력(xls) / PMS 파일 파싱
 *   - LOT 단위 이벤트 분석 (SPLIT/MERGE 방향 판정, 수량 검증)
 *   - 입력 LOT → SMT RUNID 역추적, RUNID → 전체 SPLIT/MERGE 전개
 *   - RUNID 혼입(구성) 추정, 누락 LOT 목록, 검증 항목
 *
 * 데이터 소스는 DataSource 인터페이스로 분리되어 있음:
 *   getLotHistory(lotId) -> Promise<{events, exportTime, source} | null>
 *   getPmsByRunId(runId) -> Promise<Array<row> | null>
 *   hasLot(lotId)        -> boolean (선택, 없으면 항상 조회)
 * 지금은 FileDataSource(로컬 파일), 향후 DbDataSource(MES DB/API)로 교체.
 * ===================================================================== */
(function (root) {
  'use strict';

  var LT = {};
  LT.VERSION = '0.1.0';
  // 다국어: Lx('한국어', 'Tiếng Việt') — 현재 언어(LT.lang)에 맞는 문장을 돌려준다
  LT.lang = 'ko';
  LT.setLang = function (l) { LT.lang = l === 'vi' ? 'vi' : 'ko'; };
  function Lx(ko, vi) { return LT.lang === 'vi' && vi !== undefined ? vi : ko; }
  LT.Lx = Lx;

  LT.CONFIG = {
    smtSteps: ['M010', 'M015'],
    stepNames: {
      M010: 'SMT', M015: 'SMT', M031: 'iARTs', M033: 'Router', M050: 'ATE', M055: 'PCT',
      M060: 'AVI', M065: 'AQL', M070: 'Packing', M087: 'Casing', M100: 'Aging(IT)',
      M111: 'Aging(AT)', M120: 'Casing', M121: 'Label', M130: 'I/F Test', M160: 'AVI',
      M164: 'FVI', M165: 'AQL', M170: 'Packing'
    },
    // 예: H0HK8G0639  (영문1 + 숫자1 + 영숫자8)
    lotIdRegex: /(?:^|[^A-Z0-9])([A-Z][0-9][A-Z0-9]{8})(?=[^A-Z0-9]|$)/,
    traceForeignMerge: true
  };

  /* ------------------------------------------------------------------
   * 공통 유틸
   * ------------------------------------------------------------------ */
  function norm(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
  function num(v) {
    if (typeof v === 'number') return v;
    var s = norm(v).replace(/,/g, '');
    if (s === '') return 0;
    var n = Number(s);
    return isNaN(n) ? 0 : n;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // 엑셀 날짜(serial) 또는 문자열 → {str:'YYYY-MM-DD HH:MM:SS', ts:ms}
  function toTime(v) {
    if (typeof v === 'number' && isFinite(v) && v > 20000 && v < 80000) {
      var ms = Math.round((v - 25569) * 86400) * 1000;
      var d = new Date(ms);
      var s = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' +
        pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
      return { str: s, ts: ms };
    }
    if (v instanceof Date && !isNaN(v)) {
      var s2 = v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate()) + ' ' +
        pad(v.getHours()) + ':' + pad(v.getMinutes()) + ':' + pad(v.getSeconds());
      return toTime(s2);
    }
    var t = norm(v);
    var m = t.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) m = t.match(/^(\d{4})(\d{2})(\d{2})\s+(\d{2})(\d{2})(\d{2})?$/);
    if (m) {
      var ts = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
      return { str: m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]) + ' ' + pad(+m[4]) + ':' + m[5] + ':' + pad(+(m[6] || 0)), ts: ts };
    }
    return null;
  }
  LT.toTime = toTime;

  LT.lotIdFromFileName = function (fileName) {
    var base = norm(fileName).replace(/^.*[\\\/]/, '').replace(/\.[^.]+$/, '').toUpperCase();
    var m = base.match(LT.CONFIG.lotIdRegex);
    return m ? m[1] : null;
  };

  LT.stepLabel = function (step) {
    var n = LT.CONFIG.stepNames[step];
    return n ? step + ' ' + n : step;
  };

  function stepSortKey(step) {
    var m = /^M(\d+)/.exec(step || '');
    return m ? +m[1] : 99999;
  }
  LT.sortSteps = function (steps) {
    return steps.slice().sort(function (a, b) { return stepSortKey(a) - stepSortKey(b) || (a < b ? -1 : a > b ? 1 : 0); });
  };

  /* ------------------------------------------------------------------
   * 1. 파일 파싱 (SheetJS 로 읽은 2차원 배열 → 구조화)
   * ------------------------------------------------------------------ */
  LT.parseSheetRows = function (rows, fileName) {
    for (var i = 0; i < Math.min(rows.length, 30); i++) {
      var r = rows[i] || [];
      if (norm(r[0]).toUpperCase() === 'EVENT_NAME' && norm(r[1]).toUpperCase() === 'DATE/TIME') {
        return parseHistory(rows, i, fileName);
      }
      var up = r.map(function (x) { return norm(x).toUpperCase(); });
      if (up.indexOf('LOT_ID') >= 0 && up.indexOf('BARCODE_SERLNO') >= 0) {
        return parsePms(rows, i, fileName);
      }
    }
    return { kind: 'unknown', fileName: fileName };
  };

  function parseHistory(rows, hi, fileName) {
    var h = rows[hi].map(function (x) { return norm(x).toUpperCase(); });
    var qtyIdx = [];
    h.forEach(function (x, i) { if (x === 'QTY') qtyIdx.push(i); });
    var ix = {
      ev: h.indexOf('EVENT_NAME'), dt: h.indexOf('DATE/TIME'), qty: qtyIdx[0], step: h.indexOf('STEP'),
      eqp: h.indexOf('EQP'), line: h.indexOf('LINE'), oper: h.indexOf('OPERID'), item: h.indexOf('CHG_ITEM'),
      vals: h.indexOf('CHG_VALS'), cqty: qtyIdx.length > 1 ? qtyIdx[1] : -1, cmt: h.indexOf('COMMENT')
    };
    var events = [], exportTime = null, skipped = 0;
    for (var i = hi + 1; i < rows.length; i++) {
      var r = rows[i] || [];
      var first = norm(r[0]);
      var tm = /^Time\s*:\s*(.+)$/i.exec(first);
      if (tm) { var t0 = toTime(tm[1]); exportTime = t0 ? t0.str : tm[1]; continue; }
      if (!first) continue;
      var t = toTime(r[ix.dt]);
      if (!t) { skipped++; continue; }
      var g = function (k) { return ix[k] >= 0 ? r[ix[k]] : ''; };
      events.push({
        fileIdx: i, event: first, time: t.str, ts: t.ts, qty: num(g('qty')), step: norm(g('step')),
        eqp: norm(g('eqp')) === '-' ? '' : norm(g('eqp')), line: norm(g('line')), oper: norm(g('oper')),
        chgItem: norm(g('item')), chgVals: norm(g('vals')), chgQty: ix.cqty >= 0 ? num(r[ix.cqty]) : 0,
        comment: norm(g('cmt'))
      });
    }
    return {
      kind: 'history', fileName: fileName, lotId: LT.lotIdFromFileName(fileName),
      events: events, exportTime: exportTime, skippedRows: skipped
    };
  }

  function parsePms(rows, hi, fileName) {
    var h = rows[hi].map(function (x) { return norm(x).toUpperCase(); });
    var out = [];
    for (var i = hi + 1; i < rows.length; i++) {
      var r = rows[i] || [];
      var o = {};
      h.forEach(function (k, j) { if (k) o[k] = norm(r[j]); });
      if (!o.LOT_ID || !/^[A-Z0-9]{6,}$/i.test(o.LOT_ID)) continue;
      out.push(o);
    }
    var lots = {};
    out.forEach(function (o) { lots[o.LOT_ID] = true; });
    return { kind: 'pms', fileName: fileName, rows: out, lotIds: Object.keys(lots) };
  }

  /* ------------------------------------------------------------------
   * 2. 데이터 소스
   * ------------------------------------------------------------------ */
  function FileDataSource() {
    this.histories = {};   // lotId -> parsed history
    this.pmsRows = [];
    this.files = [];       // {fileName, kind, lotId, rows}
  }
  FileDataSource.prototype.addParsed = function (p, lotIdOverride) {
    if (p.kind === 'history') {
      var id = (lotIdOverride || p.lotId || '').toUpperCase();
      if (!id) { this.files.push({ fileName: p.fileName, kind: 'history', lotId: null, rows: p.events.length, error: Lx('LOT ID를 파일명에서 찾지 못함', 'Không tìm thấy LOT ID trong tên tệp') }); return null; }
      var dup = !!this.histories[id];
      this.histories[id] = { events: p.events, exportTime: p.exportTime, source: p.fileName };
      this.files.push({ fileName: p.fileName, kind: 'history', lotId: id, rows: p.events.length, exportTime: p.exportTime, replaced: dup });
      return id;
    }
    if (p.kind === 'pms') {
      var self = this;
      var keys = {};
      this.pmsRows.forEach(function (r) { keys[r.LOT_ID + '|' + r.BARCODE_SERLNO] = true; });
      p.rows.forEach(function (r) { if (!keys[r.LOT_ID + '|' + r.BARCODE_SERLNO]) self.pmsRows.push(r); });
      this.files.push({ fileName: p.fileName, kind: 'pms', lotId: p.lotIds.join(','), rows: p.rows.length });
      return p.lotIds[0] || null;
    }
    this.files.push({ fileName: p.fileName, kind: 'unknown', lotId: null, rows: 0, error: Lx('인식할 수 없는 형식', 'Định dạng không nhận diện được') });
    return null;
  };
  FileDataSource.prototype.hasLot = function (id) { return !!this.histories[id]; };
  FileDataSource.prototype.listLots = function () { return Object.keys(this.histories); };
  FileDataSource.prototype.getLotHistory = function (id) {
    return Promise.resolve(this.histories[id] || null);
  };
  FileDataSource.prototype.getPmsByRunId = function (runId) {
    var r = this.pmsRows.filter(function (x) { return x.LOT_ID === runId; });
    return Promise.resolve(r.length ? r : null);
  };
  FileDataSource.prototype.describe = function () { return Lx('로컬 MES 이력 파일', 'Tệp lịch sử MES cục bộ'); };
  LT.FileDataSource = FileDataSource;

  /* 향후 DB 연동용 골격. 브라우저는 DB에 직접 붙을 수 없으므로
   * 사내 API 서버(예: /api/lot/{id}/history)를 거치는 형태를 가정한다.
   * 반환 형식만 FileDataSource 와 같으면 추적 엔진은 수정 없이 동작한다. */
  function DbDataSource(baseUrl) { this.baseUrl = baseUrl; }
  DbDataSource.prototype.getLotHistory = function (id) {
    var self = this;
    return fetch(self.baseUrl + '/lot/' + encodeURIComponent(id) + '/history')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return null;
        // 기대 형식: [{EVENT_NAME, DATE_TIME, QTY, STEP, EQP, LINE, OPERID, CHG_ITEM, CHG_VALS, CHG_QTY, COMMENT}, ...]
        var ev = j.map(function (x, i) {
          var t = toTime(x.DATE_TIME);
          return {
            fileIdx: i, event: norm(x.EVENT_NAME), time: t ? t.str : '', ts: t ? t.ts : 0, qty: num(x.QTY),
            step: norm(x.STEP), eqp: norm(x.EQP) === '-' ? '' : norm(x.EQP), line: norm(x.LINE), oper: norm(x.OPERID),
            chgItem: norm(x.CHG_ITEM), chgVals: norm(x.CHG_VALS), chgQty: num(x.CHG_QTY), comment: norm(x.COMMENT)
          };
        });
        return { events: ev, exportTime: null, source: 'DB' };
      });
  };
  DbDataSource.prototype.getPmsByRunId = function (runId) {
    return fetch(this.baseUrl + '/pms/' + encodeURIComponent(runId)).then(function (r) { return r.ok ? r.json() : null; });
  };
  DbDataSource.prototype.describe = function () { return 'MES DB (' + this.baseUrl + ')'; };
  LT.DbDataSource = DbDataSource;

  /* ------------------------------------------------------------------
   * 3. LOT 1개 이력 분석
   * ------------------------------------------------------------------ */
  function parseScrapComment(c) {
    var s = norm(c);
    var i = s.indexOf('/');
    if (i < 0) return { code: s, desc: '' };
    return { code: s.slice(0, i).trim(), desc: s.slice(i + 1).trim() };
  }

  LT.analyzeLot = function (lotId, hist) {
    var raw = hist.events.slice();
    // 파일이 최신순인지 판단 (MES 기본: 최신순).
    // 0.3.3: 첫·끝 이벤트 시각이 같으면(모두 같은 시각) 생성 이벤트(투입 ISSUE / 생성 분할)가 어느 끝에 있는지로 판단하고, 그것도 모르면 MES 기본(최신순).
    //        (이전: 모두 같은 시각이면 오래된 순으로 읽어, 예: '투입 → 전량 병합 → 종료'가 한 시각에 있으면 거꾸로 읽혀 잔량이 남은 것으로 계산됐음)
    var isCreate = function (e) { return /^ISSUE/i.test(e.event) || (/^SPLIT$/i.test(e.event) && e.qty === e.chgQty); };
    var newestFirst = raw.length > 1 && raw[0].ts > raw[raw.length - 1].ts;
    if (raw.length > 1 && raw[0].ts === raw[raw.length - 1].ts) newestFirst = isCreate(raw[raw.length - 1]) || !isCreate(raw[0]);
    var ev = raw.sort(function (a, b) {
      return (a.ts - b.ts) || (newestFirst ? b.fileIdx - a.fileIdx : a.fileIdx - b.fileIdx);
    });
    var L = {
      id: lotId, source: hist.source, exportTime: hist.exportTime, events: ev,
      origin: null, splitFrom: null, splitOuts: [], mergeIns: [], mergeOuts: [], runs: [], scraps: [],
      holds: [], attrs: {}, recycles: [], qtyIssues: [], terminated: null, others: []
    };
    var prev = null, openRun = null;
    function runFor(e) {
      if (openRun && openRun.step === e.step) return openRun;
      for (var k = L.runs.length - 1; k >= 0; k--) if (L.runs[k].step === e.step) return L.runs[k];
      var r = { step: e.step, eqp: e.eqp, inTime: null, outTime: null, inQty: null, outQty: null, scraps: [], implicit: true };
      L.runs.push(r);
      return r;
    }
    ev.forEach(function (e, i) {
      var E = e.event.toUpperCase();
      var expected = prev, kind = 'OTHER';
      if (E.indexOf('ISSUE') === 0) {
        kind = 'ISSUE';
        L.origin = { type: 'ISSUE', event: e.event, time: e.time, ts: e.ts, qty: e.qty, step: e.step };
        expected = e.chgQty || e.qty;
      } else if (E === 'SPLIT') {
        if (prev === null) {
          kind = 'SPLIT_IN';
          L.splitFrom = { parent: e.chgVals, qty: e.chgQty, time: e.time, ts: e.ts, step: e.step, comment: e.comment };
          expected = e.chgQty;
        } else {
          kind = 'SPLIT_OUT';
          L.splitOuts.push({ child: e.chgVals, qty: e.chgQty, qtyAfter: e.qty, time: e.time, ts: e.ts, step: e.step, comment: e.comment, oper: e.oper });
          expected = prev - e.chgQty;
        }
      } else if (E === 'MERGE') {
        var d = e.qty - (prev === null ? 0 : prev);
        var isIn = d > 0 || (d === 0 && e.qty > 0 && prev === null);
        if (d === 0 && prev !== null) {
          var nx = ev[i + 1];
          isIn = !(nx && nx.event.toUpperCase() === 'TERMINATED' && nx.ts === e.ts);
        }
        if (isIn) {
          kind = 'MERGE_IN';
          L.mergeIns.push({ src: e.chgVals, qty: e.chgQty, qtyAfter: e.qty, time: e.time, ts: e.ts, step: e.step });
          expected = (prev || 0) + e.chgQty;
        } else {
          kind = 'MERGE_OUT';
          L.mergeOuts.push({ dst: e.chgVals, qty: e.chgQty, qtyAfter: e.qty, time: e.time, ts: e.ts, step: e.step });
          expected = prev - e.chgQty;
        }
      } else if (E === 'TRACKIN') {
        kind = 'TRACKIN';
        openRun = { step: e.step, eqp: e.eqp, inTime: e.time, inTs: e.ts, outTime: null, inQty: e.qty, outQty: null, scraps: [], oper: e.oper };
        L.runs.push(openRun);
      } else if (E === 'TRACKOUT') {
        kind = 'TRACKOUT';
        var r = runFor(e);
        r.outTime = e.time; r.outTs = e.ts; r.outQty = e.qty; if (!r.eqp) r.eqp = e.eqp;
        r.outComment = e.comment;
        openRun = null;
      } else if (E === 'SCRAP') {
        kind = 'SCRAP';
        var sc = parseScrapComment(e.comment);
        var s = { lot: lotId, time: e.time, ts: e.ts, step: e.step, eqp: e.eqp, qty: e.chgQty, qtyAfter: e.qty, code: sc.code, desc: sc.desc, recycleLot: null };
        L.scraps.push(s);
        runFor(e).scraps.push(s);
        expected = prev - e.chgQty;
      } else if (E === 'TERMINATED') {
        kind = 'TERMINATED';
        L.terminated = { time: e.time, ts: e.ts, step: e.step };
      } else if (E === 'HOLD') {
        kind = 'HOLD';
        L.holds.push({ time: e.time, ts: e.ts, step: e.step, code: e.chgVals, comment: e.comment, releaseTime: null, oper: e.oper });
      } else if (E === 'RELEASE') {
        kind = 'RELEASE';
        for (var k = L.holds.length - 1; k >= 0; k--) if (!L.holds[k].releaseTime) { L.holds[k].releaseTime = e.time; L.holds[k].releaseTs = e.ts; break; }
      } else if (E === 'MODIFYATTRH') {
        kind = 'ATTR';
        var v = e.chgVals, j = v.indexOf('/');
        L.attrs[e.chgItem] = j >= 0 ? v.slice(j + 1) : v;
      } else if (E === 'ADDCOMMENT') {
        kind = 'COMMENT';
        var rm = /RECYCLELOTID=([A-Z0-9]+)\s*,\s*RECYCLEQTY=(\d+)/i.exec(e.comment);
        if (rm) {
          var rec = { lot: rm[1].toUpperCase(), qty: +rm[2], time: e.time, ts: e.ts, step: e.step };
          L.recycles.push(rec);
          // 직전(같은 시각 이하) 미할당 SCRAP 에 연결
          for (var q = L.scraps.length - 1; q >= 0; q--) {
            if (L.scraps[q].ts <= e.ts && !L.scraps[q].recycleLot) L.scraps[q].recycleLot = rec.lot; else if (L.scraps[q].recycleLot) break;
          }
        }
      } else {
        L.others.push(e);
      }
      e.kind = kind;
      if (expected !== null && Math.abs(e.qty - expected) > 1e-9) {
        L.qtyIssues.push({ lot: lotId, time: e.time, event: e.event, step: e.step, before: prev, expected: expected, actual: e.qty, chg: e.chgVals, chgQty: e.chgQty });
      }
      prev = e.qty;
    });
    var last = ev[ev.length - 1] || null;
    L.firstTime = ev.length ? ev[0].time : null;
    L.lastEvent = last;
    L.finalQty = prev === null ? 0 : prev;
    L.finalStep = last ? last.step : '';
    L.createdQty = L.splitFrom ? L.splitFrom.qty : (L.origin ? L.origin.qty : (ev[0] ? ev[0].qty : 0));
    L.openHold = null;
    L.holds.forEach(function (h) { if (!h.releaseTime) L.openHold = h; });
    return L;
  };

  /* ------------------------------------------------------------------
   * 4. 추적 (역추적 + 전방 전개)
   * ------------------------------------------------------------------ */
  /* 구성(composition): { 라벨(RUNID 또는 LOT): [최소, 최대] } — 라벨 합계 = LOT 수량 */
  function tighten(c, Q) {
    var ks = Object.keys(c), sumLo = 0, sumHi = 0, o = {};
    ks.forEach(function (k) { sumLo += c[k][0]; sumHi += c[k][1]; });
    ks.forEach(function (k) {
      var lo = c[k][0], hi = c[k][1];
      lo = Math.max(lo, Q - (sumHi - hi), 0);
      hi = Math.min(hi, Q - (sumLo - c[k][0]), Q);
      if (lo > hi) lo = hi;
      if (hi > 0) o[k] = [lo, hi];
    });
    return o;
  }
  // 수량 Q 인 LOT 에서 q 를 떼어 낼 때: 떼어 낸 쪽(part) / 남은 쪽(rest)
  function takeComp(c, Q, q) {
    var part = {}, rest = {};
    Object.keys(c).forEach(function (k) {
      var lo = c[k][0], hi = c[k][1];
      part[k] = [Math.max(0, q - (Q - lo)), Math.min(q, hi)];
      rest[k] = [Math.max(0, lo - q), Math.min(Q - q, hi)];
    });
    return { part: tighten(part, q), rest: tighten(rest, Q - q) };
  }
  // 수량을 모르는(이력 없는) LOT 에서 q 를 떼어 낼 때
  function takeUnknown(c, q) {
    var part = {};
    Object.keys(c).forEach(function (k) { part[k] = [0, Math.min(q, c[k][1])]; });
    return tighten(part, q);
  }
  function addComp(a, b, Q) {
    var o = {};
    Object.keys(a).forEach(function (k) { o[k] = [a[k][0], a[k][1]]; });
    Object.keys(b).forEach(function (k) { o[k] = o[k] ? [o[k][0] + b[k][0], o[k][1] + b[k][1]] : [b[k][0], b[k][1]]; });
    return tighten(o, Q);
  }
  function one(label, q) { var o = {}; o[label] = [q, q]; return o; }
  function rangeText(r) { return !r ? '0' : (r[0] === r[1] ? String(r[0]) : r[0] + '~' + r[1]); }
  LT.rangeText = rangeText;
  LT.compText = function (c) {
    var ks = Object.keys(c || {});
    if (!ks.length) return '';
    if (ks.length === 1) return ks[0] + Lx(' 단일', ' (duy nhất)');
    ks.sort(function (a, b) { return c[b][1] - c[a][1]; });
    return ks.map(function (k) { return k + ' ' + rangeText(c[k]); }).join(' / ');
  };
  // 특정 RUNID 라벨의 [최소, 최대]
  LT.runidIn = function (res, c) { return (c && res.runLabel && c[res.runLabel]) ? c[res.runLabel] : [0, 0]; };

  LT.trace = function (ds, inputLot, opts) {
    opts = opts || {};
    var cfg = LT.CONFIG;
    var smtSteps = opts.smtSteps || cfg.smtSteps;
    var traceForeign = opts.traceForeignMerge !== undefined ? opts.traceForeignMerge : cfg.traceForeignMerge;
    inputLot = norm(inputLot).toUpperCase();

    var lots = {};         // id -> analyzed | null
    var missing = {};      // id -> {id, level, reasons[], related[]}
    var notes = [];
    var MAX_SPREAD = opts.maxSpreadLots || 3000;
    function levelText(m) {
      if (m.level === 1) return Lx('필수', 'Bắt buộc') + '(' + m.kinds.filter(function (k) { return k !== Lx('혼입', 'trộn lẫn') && k !== Lx('참고', 'tham khảo'); }).join('·') + ')';
      if (m.level === 2) return Lx('권장', 'Khuyến nghị') + '(' + (m.kinds.indexOf(Lx('혼입', 'trộn lẫn')) >= 0 ? Lx('혼입', 'trộn lẫn') : m.kinds.filter(function (k) { return k !== Lx('참고', 'tham khảo'); }).join('·')) + ')';
      return Lx('선택', 'Tùy chọn');
    }

    var peeked = {};       // 받은 기록 찾기용으로만 읽어 둔 이력 (추적 대상이 되면 lots 로 옮김)
    function get(id) {
      if (Object.prototype.hasOwnProperty.call(lots, id)) return Promise.resolve(lots[id]);
      if (Object.prototype.hasOwnProperty.call(peeked, id)) { lots[id] = peeked[id]; return Promise.resolve(lots[id]); }
      return Promise.resolve(ds.getLotHistory(id)).then(function (h) {
        lots[id] = (h && h.events && h.events.length) ? LT.analyzeLot(id, h) : null;
        return lots[id];
      });
    }
    function peek(id) {
      if (Object.prototype.hasOwnProperty.call(lots, id)) return Promise.resolve(lots[id]);
      if (Object.prototype.hasOwnProperty.call(peeked, id)) return Promise.resolve(peeked[id]);
      return Promise.resolve(ds.getLotHistory(id)).then(function (h) {
        peeked[id] = (h && h.events && h.events.length) ? LT.analyzeLot(id, h) : null;
        return peeked[id];
      });
    }
    // 0.3.3: 이력 없는 LOT 에서 '받은' 기록이 있는 이력 있는 LOT 찾기 (받은 쪽 이력의 SPLIT/MERGE 유입 기록 기준).
    //   이력 없는 LOT 은 자기 이력으로 앞으로 따라갈 수 없어, 그 LOT 에서 분할·병합되어 나간 이력 있는 LOT 을 놓쳤었다.
    //   DB 연동 시에는 ds.findReceivers(lotId) (CHG_VALS = lotId 인 Split/Merge 유입 이벤트 조회) 로 대신할 수 있다.
    var recvIndex = null, recvReady = null;
    function receiversOf(id) {
      if (ds.findReceivers) return Promise.resolve(ds.findReceivers(id)).then(function (r) { return r || []; });
      if (!ds.listLots) return Promise.resolve([]);
      if (!recvReady) {
        recvIndex = {};
        recvReady = seq(ds.listLots(), function (x) {
          return peek(x).then(function (L) {
            if (!L) return;
            var push = function (src, o) { (recvIndex[src] = recvIndex[src] || []).push(o); };
            if (L.splitFrom && L.splitFrom.parent) push(L.splitFrom.parent, { lot: x, kind: 'SPLIT', ts: L.splitFrom.ts, time: L.splitFrom.time, step: L.splitFrom.step, qty: L.splitFrom.qty });
            L.mergeIns.forEach(function (m) { push(m.src, { lot: x, kind: 'MERGE', ts: m.ts, time: m.time, step: m.step, qty: m.qty }); });
          });
        });
      }
      return recvReady.then(function () { return recvIndex[id] || []; });
    }
    // kind: 역추적(RUNID까지 경로) / 전개(RUNID 이후 공정) / 확산(RUNID 제품이 흘러간 곳) / 혼입(유입 LOT RUNID) / 참고
    function need(id, level, reason, related, kind) {
      var m = missing[id];
      if (!m) m = missing[id] = { id: id, level: level, reasons: [], related: [], kinds: [] };
      if (level < m.level) m.level = level;
      if (m.reasons.indexOf(reason) < 0) m.reasons.push(reason);
      if (related && m.related.indexOf(related) < 0) m.related.push(related);
      if (kind && m.kinds.indexOf(kind) < 0) m.kinds.push(kind);
    }
    function finalizeMissing() {
      return Object.keys(missing).map(function (k) {
        var m = missing[k]; m.levelText = levelText(m); return m;
      }).sort(function (a, b) { return a.level - b.level || (a.levelText < b.levelText ? -1 : a.levelText > b.levelText ? 1 : 0) || (a.id < b.id ? -1 : 1); });
    }
    function findSplitParent(id) {
      if (ds.findSplitParent) return Promise.resolve(ds.findSplitParent(id));
      if (!ds.listLots) return Promise.resolve(null);
      var ids = ds.listLots(), found = null;
      return seq(ids, function (x) {
        if (found) return;
        return get(x).then(function (L) {
          if (L && L.splitOuts.some(function (s) { return s.child === id; })) found = x;
        });
      }).then(function () { return found; });
    }
    function seq(items, fn) {
      return items.reduce(function (p, x) { return p.then(function () { return fn(x); }); }, Promise.resolve());
    }

    var res = {
      input: inputLot, root: null, rootConfirmed: false, top: null, path: [], smt: null,
      lots: lots, family: [], familySet: {}, parentOf: {}, foreignIns: [], mergeTargets: [],
      foreignRunId: {}, missing: [], checks: [], notes: notes, comp: {}, scrapComp: [],
      dataSource: ds.describe ? ds.describe() : '', tracedAt: new Date().toISOString(), pms: null
    };

    // ---- 4-1. 역추적: 입력 LOT → SPLIT 부모 → ... → ISSUE(RUNID)
    function backward(start, level, reasonPrefix, kind) {
      var path = [], cur = start, seen = {};
      function step() {
        if (!cur || seen[cur]) return Promise.resolve({ path: path, root: null, top: path[path.length - 1] || null });
        seen[cur] = true; path.push(cur);
        return get(cur).then(function (L) {
          if (!L) {
            need(cur, level, reasonPrefix, start, kind);
            // 이 LOT 이력이 없어도, 다른 LOT 이력에 이 LOT을 분할해 준 기록이 있으면 부모로 계속 진행
            return findSplitParent(cur).then(function (par) {
              if (par) { notes.push(Lx(cur + ' 이력 파일은 없지만 ' + par + ' 이력의 SPLIT 기록으로 부모를 확인했습니다.', 'Không có tệp lịch sử của ' + cur + ', nhưng đã xác định LOT cha nhờ bản ghi SPLIT trong lịch sử của ' + par + '.')); cur = par; return step(); }
              return { path: path, root: null, top: path.length > 1 ? path[path.length - 2] : null, brokenAt: cur };
            });
          }
          if (L.splitFrom && L.splitFrom.parent) { cur = L.splitFrom.parent; return step(); }
          return { path: path, root: cur, confirmed: !!L.origin, top: cur };
        });
      }
      return step();
    }

    return backward(inputLot, 1, Lx('입력 LOT → SMT RUNID 역추적 경로', 'Đường truy ngược LOT đầu vào → SMT RUNID'), Lx('역추적', 'truy ngược')).then(function (b) {
      res.path = b.path;
      res.root = b.root;
      res.rootConfirmed = !!b.confirmed;
      res.top = b.root || b.top;
      if (!res.top) {
        res.comp = {}; res.compMax = {};
        res.checks.push({ level: 'FAIL', item: Lx('입력 LOT 이력', 'Lịch sử LOT đầu vào'), detail: Lx(inputLot + ' 이력 파일이 없고, 불러온 다른 이력에서도 이 LOT의 분할 기록을 찾지 못했습니다.', 'Không có tệp lịch sử của ' + inputLot + ' và cũng không tìm thấy bản ghi tách LOT này trong các lịch sử đã tải.') });
        res.missing = finalizeMissing();
        return res;
      }
      res.refStep = norm(opts.refStep).toUpperCase() || '';
      res.refCode = norm(opts.refCode);
      if (!res.refStep && res.refCode) {
        var hitL = lots[inputLot];
        var hit = hitL ? hitL.scraps.filter(function (x) { return x.code === res.refCode; })[0] : null;
        if (hit) { res.refStep = hit.step; res.refNote = Lx('불량 코드 ' + res.refCode + ' 가 입력 LOT ' + inputLot + ' 의 ' + LT.stepLabel(hit.step) + ' (' + hit.eqp + ', ' + hit.time + ') 에서 발생 → 기준 공정 ' + hit.step, 'Mã lỗi ' + res.refCode + ' phát sinh tại ' + LT.stepLabel(hit.step) + ' (' + hit.eqp + ', ' + hit.time + ') của LOT đầu vào ' + inputLot + ' → công đoạn chuẩn ' + hit.step); }
        else notes.push(Lx('불량 코드 ' + res.refCode + ' 를 입력 LOT 이력에서 찾지 못해 기준 공정 없이 추적했습니다.', 'Không tìm thấy mã lỗi ' + res.refCode + ' trong lịch sử LOT đầu vào, nên đã truy vết không có công đoạn chuẩn.'));
      } else if (res.refStep) res.refNote = Lx('기준 공정 ', 'Công đoạn chuẩn ') + LT.stepLabel(res.refStep) + Lx(' (직접 지정)', ' (chỉ định trực tiếp)') + (res.refCode ? Lx(', 불량 코드 ', ', mã lỗi ') + res.refCode : '');
      if (!b.root) notes.push(Lx('역추적이 ' + b.brokenAt + ' 에서 끊겨, 확인된 최상위 LOT ' + res.top + ' 부터 전개했습니다.', 'Truy ngược bị đứt tại ' + b.brokenAt + ', đã triển khai từ LOT cao nhất xác nhận được là ' + res.top + '.'));
      if (b.root && !b.confirmed) notes.push(Lx(b.root + ' 에 투입(ISSUE) 이벤트가 없어 RUNID 로 추정만 했습니다.', b.root + ' không có sự kiện đầu vào (ISSUE), nên chỉ ước tính là RUNID.'));

      // ---- 4-2. SMT Array 분할 LOT 접기 (RUNID → Array sub-lot → M033 병합 LOT)
      var topL = lots[res.top];
      var subSplits = (topL && topL.origin) ? topL.splitOuts.filter(function (s) { return smtSteps.indexOf(s.step) >= 0; }) : [];
      var smt = null;
      var p0 = Promise.resolve();
      if (subSplits.length) {
        smt = { subs: {}, subList: [], hostOf: {}, arrayMerge: {}, hosts: [], hostInfo: {}, unresolved: [], pmsCount: 0, selfRun: [], partialInto: {} };
        subSplits.forEach(function (s) { smt.subs[s.child] = s.qty; smt.subList.push(s.child); });
        p0 = Promise.resolve(ds.getPmsByRunId ? ds.getPmsByRunId(res.top) : null).then(function (pms) {
          res.pms = pms;
          if (pms) {
            smt.pmsCount = pms.length;
            pms.forEach(function (r) { if (r.SPLIT_LOT && r.MERGE_LOT && smt.subs[r.SPLIT_LOT] !== undefined) smt.hostOf[r.SPLIT_LOT] = r.MERGE_LOT; });
          }
          var cand = smt.subList.filter(function (id) { return !ds.hasLot || ds.hasLot(id); });
          var loadedSubs = {}, loadedHosts = {}, isHost = {};
          return seq(cand, function (id) {
            return get(id).then(function (L) { if (L) loadedSubs[id] = L; });
          }).then(function () {
            // 병합 LOT = 다른 Array LOT 을 받아들인 Array LOT (또는 PMS 의 MERGE_LOT).
            // 0.3.2: 병합 LOT 끼리 나중에 병합해도 서로를 'Array 병합'으로 보지 않는다 (이전: 순서에 따라 병합 수량·SMT 감소가 틀어짐)
            Object.keys(smt.hostOf).forEach(function (k) { isHost[smt.hostOf[k]] = true; });
            Object.keys(loadedSubs).forEach(function (id) {
              if (loadedSubs[id].mergeIns.some(function (m) { return smt.subs[m.src] !== undefined; })) isHost[id] = true;
              // Array 수량보다 많이 병합해 준 Array LOT 은 그 자체가 (이력을 볼 수 없는) 병합 LOT 이다
              loadedSubs[id].mergeIns.forEach(function (m) { if (smt.subs[m.src] !== undefined && m.qty > smt.subs[m.src]) isHost[m.src] = true; });
            });
            Object.keys(isHost).forEach(function (k) { if (smt.subs[k] !== undefined) smt.hostOf[k] = k; });
            // 0.3.3: Array LOT 이 아닌 병합 LOT(PMS MERGE_LOT)도 이력이 있으면 같은 방식으로 Array 병합을 확인한다
            return seq(Object.keys(isHost), function (h) {
              if (loadedSubs[h]) { loadedHosts[h] = loadedSubs[h]; return; }
              if (ds.hasLot && !ds.hasLot(h)) return;
              return get(h).then(function (L) { if (L) loadedHosts[h] = L; });
            });
          }).then(function () {
            var seenIn = {}; // Array LOT → 그 Array LOT 에서 들어온 기록이 있는 병합 LOT (이력 있음)
            Object.keys(loadedHosts).forEach(function (id) {
              var L = loadedHosts[id];
              // Array 병합 = 병합 LOT 의 첫 흐름 변화(분할·반출·불량·Array 가 아닌 유입·기타 이벤트) 전까지 들어온 Array LOT.
              // 0.3.2: 그 전까지 들어온 합계가 Array 배정 수량과 정확히 같을 때만 흡수로 본다 (이전: 한 건이라도 배정 수량 이하면 흡수로 봐서,
              // 배정 수량 중 일부만 들어오고 나머지는 다른 곳으로 간 경우도 전량 흡수로 잘못 판정해 그 LOT이 요청 목록·수지에서 빠졌음)
              var open = true, mergedTotal = {};
              L.events.forEach(function (e) {
                var fromArray = e.kind === 'MERGE_IN' && smt.subs[e.chgVals] !== undefined && !isHost[e.chgVals];
                if (fromArray && !seenIn[e.chgVals]) seenIn[e.chgVals] = id;
                if (!open) return;
                if (fromArray) mergedTotal[e.chgVals] = (mergedTotal[e.chgVals] || 0) + e.chgQty;
                else if (!{ SPLIT_IN: 1, ATTR: 1, COMMENT: 1, TRACKIN: 1, TRACKOUT: 1, HOLD: 1, RELEASE: 1 }[e.kind]) open = false;
              });
              Object.keys(mergedTotal).forEach(function (src) {
                if (mergedTotal[src] === smt.subs[src]) { smt.hostOf[src] = id; smt.arrayMerge[src] = id; }
              });
            });
            // 0.3.3: 병합 LOT 이 아닌, 이력 있는 Array LOT — 배정 수량 전부를 이력 없는 LOT 하나로 병합하고 끝났을 때만 그 LOT 을 병합 LOT 으로 본다.
            //        일부만 병합했거나(남은 수량 있음) 여러 곳·이력 있는 LOT 으로 나갔으면 자기 이력으로 따로 추적한다
            //        (이전: 첫 병합 대상을 병합 LOT 으로 잡고 이 LOT 을 계보에서 빼서, 남은 RUNID 제품이 위치 목록에서 사라지고 SMT 감소로 잘못 셈)
            Object.keys(loadedSubs).forEach(function (id) {
              if (isHost[id] || smt.arrayMerge[id]) return;
              var L = loadedSubs[id], outs = L.mergeOuts, dst = outs.length ? outs[0].dst : null, sent = 0;
              outs.forEach(function (m) { sent += m.qty; });
              var dstMissing = !!dst && !loadedHosts[dst] && (ds.hasLot ? !ds.hasLot(dst) : false);
              var whole = dstMissing && outs.every(function (m) { return m.dst === dst; }) && sent === smt.subs[id] &&
                !L.mergeIns.length && !L.splitOuts.length && !L.scraps.length && L.finalQty === 0;
              if (whole) smt.hostOf[id] = dst;
              else { smt.hostOf[id] = id; smt.selfRun.push(id); }
            });
            // 0.3.3: 이력 없는 Array LOT 이 병합 LOT 이력에 들어왔는데 배정 수량 전부가 Array 병합으로 확인되지 않으면(일부만·늦게 병합)
            //        나머지가 어디 있는지 모른다 → PMS 가 병합 LOT 을 알려 줘도 위치 미확정으로 셈 (이전: PMS 병합 LOT 을 믿고 SMT 감소로 셈)
            Object.keys(seenIn).forEach(function (src) {
              if (loadedSubs[src] || smt.arrayMerge[src]) return;
              delete smt.hostOf[src];
              smt.partialInto[src] = seenIn[src];
            });
          });
        }).then(function () {
          var hosts = {};
          smt.subList.forEach(function (id) {
            var h = smt.hostOf[id];
            if (!h) { smt.unresolved.push(id); return; }
            hosts[h] = true;
          });
          smt.hosts = Object.keys(hosts);
          // 병합 LOT을 모르는 Array LOT: RUNID 제품이 들어 있으므로 위치 확인이 필요 (0.3.2 — 이전에는 요청 목록에서 빠졌음)
          smt.unresolved.forEach(function (id) {
            if (smt.partialInto[id]) need(id, 1, Lx('SMT Array LOT (' + smt.subs[id] + 'ea) — 병합 LOT ' + smt.partialInto[id] + ' 이력에 배정 수량 전부가 Array 병합으로 들어오지 않음(일부만 또는 늦게 병합). 나머지 위치를 확인하려면 이 Array LOT 이력이 필요합니다',
              'LOT SMT Array (' + smt.subs[id] + 'ea) — lịch sử LOT gộp ' + smt.partialInto[id] + ' không nhận đủ toàn bộ số lượng Array (chỉ gộp một phần hoặc gộp muộn). Cần lịch sử LOT Array này để xác định vị trí phần còn lại'), res.top, Lx('전개', 'triển khai'));
            else need(id, 1, Lx('SMT Array LOT (' + smt.subs[id] + 'ea) — 병합 LOT 미확인. PMS 파일(RUNID ' + res.top + ') 1개를 넣으면 한 번에 확인됩니다', 'LOT SMT Array (' + smt.subs[id] + 'ea) — chưa xác định LOT gộp. Thêm 1 tệp PMS (RUNID ' + res.top + ') là xác nhận được tất cả'), res.top, Lx('전개', 'triển khai'));
          });
          return seq(smt.hosts, function (h) {
            return get(h).then(function (L) {
              if (!L) { need(h, 1, Lx('SMT Array 병합 LOT (RUNID 이후 공정 전개)', 'LOT gộp SMT Array (triển khai các công đoạn sau RUNID)'), res.top, Lx('전개', 'triển khai')); return; }
              var own = function (src) { return smt.arrayMerge[src] === h; };
              var sib = L.mergeIns.filter(function (m) { return own(m.src); });
              var lastIdx = -1;
              L.events.forEach(function (e, i) {
                if (e.kind === 'MERGE_IN' && own(e.chgVals)) lastIdx = i;
              });
              // 0.3.3: 마지막 Array 병합 전에 들어온 '흡수로 보지 않은 Array 일부 병합'은 보낸 Array LOT 쪽에서 세므로 병합 수량에서 뺀다 (이중 계산 방지)
              var extra = 0;
              L.events.forEach(function (e, i) { if (i < lastIdx && e.kind === 'MERGE_IN' && !own(e.chgVals)) extra += e.chgQty; });
              // 0.3.6: Array LOT 이 아닌 병합 LOT 이 Array 병합 전에 이미 담고 있던 수량(생성 분할·투입 — 다른 제품)은 Array 병합 수량이 아니다.
              //        (이전: 병합 후 수량 전체를 Array 병합 수량으로 써서, 예: 다른 제품 100 을 가진 LOT 에 Array 100 이 병합되면
              //         SMT 감소 = 100 − 200 = −100, 정상 이력인데 위치 수지 FAIL — Codex 검토 v0.3.3 1번)
              var isArr = smt.subs[h] !== undefined, e0 = L.events[0];
              var baseQty = !isArr && e0 && (e0.kind === 'SPLIT_IN' || e0.kind === 'ISSUE') ? e0.qty : 0;
              var mergedQty = lastIdx >= 0 ? L.events[lastIdx].qty - extra - baseQty : (isArr ? L.createdQty : 0);
              smt.hostInfo[h] = {
                collapseIdx: lastIdx, qty: mergedQty, baseQty: baseQty, mergeStep: lastIdx >= 0 ? L.events[lastIdx].step : (L.events[0] ? L.events[0].step : ''),
                mergeCount: sib.length, firstMerge: sib.length ? sib[0].time : null, lastMerge: sib.length ? sib[sib.length - 1].time : null,
                smtRuns: L.runs.filter(function (r) { return smtSteps.indexOf(r.step) >= 0; })
              };
            });
          });
        });
      }
      res.smt = smt;

      // ---- 4-3. 전방 전개 (SPLIT 자식 따라가기)
      return p0.then(function () {
        var family = [], fset = {};
        var starts = smt ? smt.hosts.slice() : [res.top];
        if (smt) { family.push(res.top); fset[res.top] = true; starts.forEach(function (h) { res.parentOf[h] = res.top; }); }
        var queue = starts.slice();
        function next() {
          if (!queue.length) return Promise.resolve();
          var id = queue.shift();
          if (fset[id]) return next();
          fset[id] = true; family.push(id);
          return get(id).then(function (L) {
            if (L) {
              L.splitOuts.forEach(function (s) {
                if (smt && id === res.top) return;
                if (!res.parentOf[s.child]) res.parentOf[s.child] = id;
                queue.push(s.child);
              });
              return next();
            }
            // 0.3.3: 이력 없는 계보 LOT — 다른 이력에 이 LOT 에서 분할되어 나온 기록이 있으면 그 LOT 을 계보로 이어서 전개
            return receiversOf(id).then(function (rs) {
              rs.forEach(function (r) {
                if (r.kind !== 'SPLIT' || fset[r.lot]) return;
                if (!res.parentOf[r.lot]) res.parentOf[r.lot] = id;
                queue.push(r.lot);
                var nt = Lx(id + ' 이력 파일은 없지만 ' + r.lot + ' 이력의 SPLIT 기록으로 자식 LOT 을 계보에 이었습니다.', 'Không có tệp lịch sử của ' + id + ', nhưng đã nối LOT con ' + r.lot + ' vào phả hệ nhờ bản ghi SPLIT trong lịch sử của ' + r.lot + '.');
                if (notes.indexOf(nt) < 0) notes.push(nt);
              });
              return next();
            });
          });
        }
        return next().then(function () {
          // 경로 중간 LOT 이력이 없어 전개가 끊긴 경우: 경로에 있는(이력 있는) LOT 부터 따로 전개
          var orphanStarts = res.path.filter(function (p) { return !fset[p] && lots[p]; });
          if (!orphanStarts.length) return;
          var top = orphanStarts[orphanStarts.length - 1];
          if (lots[top] && lots[top].splitFrom) res.parentOf[top] = lots[top].splitFrom.parent;
          queue = [top];
          return next();
        }).then(function () {
          res.family = family; res.familySet = fset;
        });
      }).then(function () {
        var fset = res.familySet;
        var smt = res.smt;
        var pathSet = {};
        res.path.forEach(function (p) { pathSet[p] = true; });
        res.pathSet = pathSet;

        // 전개 중 이력 없는 계보 LOT: RUNID 제품을 담고 있으므로 현재 위치를 알려면 필요 (확산)
        res.family.forEach(function (id) {
          if (lots[id] || pathSet[id]) return;
          var par = res.parentOf[id];
          var PL = par ? lots[par] : null;
          var sp = PL ? PL.splitOuts.filter(function (s) { return s.child === id; })[0] : null;
          need(id, 1, Lx('RUNID 제품이 분할되어 들어간 LOT (' + (sp ? LT.stepLabel(sp.step) + ' 분할, ' + sp.qty + 'ea' : '분할') + ') — 이후 위치 확인', 'LOT nhận sản phẩm RUNID qua tách (' + (sp ? 'tách tại ' + LT.stepLabel(sp.step) + ', ' + sp.qty + 'ea' : 'tách') + ') — kiểm tra vị trí sau đó'), par, Lx('확산', 'phân tán'));
        });

        // 병합 분류
        var foreign = [], targets = [];
        res.family.forEach(function (id) {
          var L = lots[id];
          if (!L) return;
          L.mergeIns.forEach(function (m) {
            if (fset[m.src] || (smt && smt.subs[m.src] !== undefined)) return;
            foreign.push({ into: id, src: m.src, qty: m.qty, time: m.time, step: m.step });
          });
          L.mergeOuts.forEach(function (m) {
            if (fset[m.dst]) return;
            targets.push({ from: id, dst: m.dst, qty: m.qty, time: m.time, ts: m.ts, step: m.step });
          });
        });
        res.foreignIns = foreign; res.mergeTargets = targets;

        // ---- 4-4. 확산 추적: RUNID 제품이 병합되어 나간 외부 LOT → 그 LOT의 이후 SPLIT/MERGE → … 끝까지
        //      외부 LOT은 RUNID 제품이 들어온 시각(entry) 이후의 분할/병합만 따라간다 (그 전에 나간 것은 무관).
        var spread = {}, spreadList = [];
        var sq = targets.map(function (t) {
          return { id: t.dst, ts: t.ts, time: t.time, depth: 1, via: { from: t.from, kind: 'MERGE', step: t.step, qty: t.qty, time: t.time } };
        });
        function nextSpread() {
          if (!sq.length) return Promise.resolve();
          var x = sq.shift();
          if (fset[x.id]) return nextSpread();
          var s0 = spread[x.id];
          if (s0) {
            s0.vias.push(x.via);
            if (x.ts >= s0.entryTs) return nextSpread();
            s0.entryTs = x.ts; s0.entryTime = x.time; s0.via = x.via; // 더 이른 유입 → 다시 전개
          } else {
            if (spreadList.length >= MAX_SPREAD) {
              if (notes.indexOf(Lx('확산 LOT이 ' + MAX_SPREAD + '개를 넘어 이후 전개를 멈췄습니다.', 'Số LOT phân tán vượt quá ' + MAX_SPREAD + ', đã dừng triển khai tiếp.')) < 0) notes.push(Lx('확산 LOT이 ' + MAX_SPREAD + '개를 넘어 이후 전개를 멈췄습니다.', 'Số LOT phân tán vượt quá ' + MAX_SPREAD + ', đã dừng triển khai tiếp.'));
              return nextSpread();
            }
            s0 = spread[x.id] = { id: x.id, entryTs: x.ts, entryTime: x.time, via: x.via, vias: [x.via], depth: x.depth };
            spreadList.push(x.id);
          }
          var sEntry = s0;
          return get(x.id).then(function (L) {
            if (!L) {
              need(x.id, 1, Lx('RUNID 제품이 ' + (x.via.kind === 'MERGE' ? '병합' : '분할') + '되어 들어간 외부 LOT (' + x.via.from + ' → ' + x.via.qty + 'ea, ' + LT.stepLabel(x.via.step) + ') — 이후 위치 확인', 'LOT bên ngoài nhận sản phẩm RUNID qua ' + (x.via.kind === 'MERGE' ? 'gộp' : 'tách') + ' (' + x.via.from + ' → ' + x.via.qty + 'ea, ' + LT.stepLabel(x.via.step) + ') — kiểm tra vị trí sau đó'), x.via.from, Lx('확산', 'phân tán'));
              return nextSpread();
            }
            L.splitOuts.forEach(function (sp) {
              if (sp.ts >= sEntry.entryTs) sq.push({ id: sp.child, ts: sp.ts, time: sp.time, depth: sEntry.depth + 1, via: { from: x.id, kind: 'SPLIT', step: sp.step, qty: sp.qty, time: sp.time } });
            });
            L.mergeOuts.forEach(function (m) {
              if (m.ts >= sEntry.entryTs && !fset[m.dst]) sq.push({ id: m.dst, ts: m.ts, time: m.time, depth: sEntry.depth + 1, via: { from: x.id, kind: 'MERGE', step: m.step, qty: m.qty, time: m.time } });
            });
            return nextSpread();
          });
        }
        // 0.3.3: 이력 없는 계보·확산 LOT(과 병합 LOT 미확인 Array)에서 받은 기록이 있는 이력 있는 LOT → 확산 LOT 으로 추가.
        //   이력 없는 LOT 은 자기 이력으로 앞으로 따라갈 수 없어, 거기서 나간 제품이 들어간 이력 있는 LOT(다른 RUNID LOT 포함)을 놓쳤었다
        //   (예: 이력 없는 A → 다른 RUNID F(이력 있음) → 계보 B 로 되돌아온 제품을 F 의 RUNID 제품으로만 확정).
        var scanned = {};
        function reverseSpread() {
          var srcs = res.family.filter(function (id) { return !lots[id]; }).map(function (id) { return { id: id, entryTs: -Infinity, depth: 0 }; })
            .concat(spreadList.filter(function (id) { return !lots[id]; }).map(function (id) { return { id: id, entryTs: spread[id].entryTs, depth: spread[id].depth }; }));
          if (smt) smt.unresolved.forEach(function (id) { srcs.push({ id: id, entryTs: -Infinity, depth: 0 }); });
          var added = 0;
          return seq(srcs, function (s) {
            var sk = s.id + '@' + s.entryTs;
            if (scanned[sk]) return;
            scanned[sk] = true;
            return receiversOf(s.id).then(function (rs) {
              rs.forEach(function (r) {
                if (fset[r.lot] || !(r.ts >= s.entryTs)) return;
                if (spread[r.lot] && spread[r.lot].entryTs <= r.ts) return;
                added++;
                sq.push({ id: r.lot, ts: r.ts, time: r.time, depth: s.depth + 1, via: { from: s.id, kind: r.kind, step: r.step, qty: r.qty, time: r.time } });
              });
            });
          }).then(function () {
            if (!added) return;
            return nextSpread().then(reverseSpread);
          });
        }
        return nextSpread().then(reverseSpread).then(function () {
          res.spread = spread; res.spreadList = spreadList;
          // 불량품 이동 LOT (RECYCLELOTID)
          var rec = [];
          res.family.concat(spreadList).forEach(function (id) {
            var L = lots[id];
            if (!L) return;
            L.scraps.forEach(function (s) {
              if (s.recycleLot) {
                rec.push({ lot: s.recycleLot, from: id, qty: s.qty, code: s.code, time: s.time, step: s.step });
                need(s.recycleLot, 3, Lx('불량품 이동 LOT — 불량품 재분석/처리 확인 시', 'LOT chứa hàng lỗi đã chuyển — khi cần phân tích lại/kiểm tra xử lý hàng lỗi'), id, Lx('참고', 'tham khảo'));
              }
            });
          });
          res.recycles = rec;
          if (!traceForeign) return;
          // 0.3.6: 계보·확산 밖에서 들어온 제품에 우리 RUNID 제품이 섞였을 수 있는지는 '보낸 LOT 이 그 시각까지 우리 RUNID 제품을
          //        받을 수 있었는지'로 정한다. 보낸 LOT 이력의 생성(분할 부모·병합 출처)과 병합 유입을 거슬러 올라가 확인하고,
          //        이력 없는 LOT 은 우리 RUNID 제품이 처음 위치 미확정이 된 시각(openFrom)부터 담았을 수 있다고 본다.
          //        설명되지 않는 증가·출처 없는 시작 수량도 openFrom 이후면 섞였을 수 있다고 본다.
          //        (0.3.3: 다른 RUNID LOT 은 무엇이든 받은 기록이 있으면 — 투입부터 이력이 다 있는 다른 RUNID LOT 에서 받았어도 —
          //         그 시각부터 섞였을 수 있다고 봤고, RUNID 미확인 LOT 은 늘 그렇게 봤다 → 범위가 불필요하게 넓어짐. Codex 검토 v0.3.3 2번)
          //        같은 시각에 서로 주고받은 기록처럼 순환이 있어도, 바깥에서 들어온 것이 없으면 섞였다고 보지 않는다(고정점 계산).
          // 계보·확산 LOT 이 계보·확산 밖에서 받은 기록의 보낸 LOT 마다 계산해 res.srcDirt 에 둔다 (구성 계산의 transfer 가 쓴다)
          function scanDirt(openFrom) {
            var fam = res.familySet, sp = res.spread || {}, sm = res.smt;
            var ids = res.family.concat(res.spreadList || []), inIds = {}, srcs = {};
            var fixed = function (id) { return id === res.top || id === res.root || !!fam[id] || !!(sm && sm.subs[id] !== undefined); };
            var recvSrc = function (e) { return (e.kind === 'MERGE_IN' || e.kind === 'SPLIT_IN') && e.chgVals ? e.chgVals : null; };
            ids.forEach(function (id) { inIds[id] = true; });
            ids.forEach(function (id) {
              var L = lots[id];
              if (L) L.events.forEach(function (e) { var v = recvSrc(e); if (v && !inIds[v] && !(sm && sm.subs[v] !== undefined)) srcs[v] = true; });
            });
            Object.keys(res.foreignRunId).forEach(function (src) { srcs[src] = true; });
            // 1) 보낸 LOT 부터 받은 기록의 보낸 LOT 을 따라 이력을 읽는다 (탐색 한도를 넘으면 읽지 못한 LOT 은 섞였을 수 있다고 본다)
            var hist = {}, queue = Object.keys(srcs), budget = 5000;
            function explore() {
              while (queue.length && (hist[queue[0]] !== undefined || fixed(queue[0]))) queue.shift();
              if (!queue.length || budget-- <= 0) return Promise.resolve();
              var id = queue.shift();
              return peek(id).then(function (L) {
                hist[id] = L || null;
                if (L) L.events.forEach(function (e) { var v = recvSrc(e); if (v && hist[v] === undefined && !fixed(v)) queue.push(v); });
                return explore();
              });
            }
            return explore().then(function () {
              // 2) LOT 마다 우리 RUNID 제품을 담았을 수 있는 가장 이른 시각 — 모두 '없음'에서 시작해 받은 기록으로만 앞당긴다(최소 고정점)
              var may = {};
              var mayOf = function (id) {
                if (fixed(id)) return -Infinity;
                if (hist[id] === undefined) return -Infinity; // 읽지 못함(탐색 한도)
                if (hist[id] === null) return Math.min(openFrom, sp[id] ? sp[id].entryTs : Infinity); // 이력 없음: 위치 미확정 제품이 생긴 뒤로는 무엇이든
                return may[id];
              };
              Object.keys(hist).forEach(function (id) {
                var L = hist[id];
                if (!L) return;
                var at = sp[id] ? sp[id].entryTs : Infinity, prev = null; // 확산 LOT: 우리 RUNID 제품이 들어온 시각부터
                L.events.some(function (e) {
                  var p = prev; prev = e.qty;
                  if (e.ts >= at) return true;
                  var unexplained = recvSrc(e) === null && ((e.kind === 'MERGE_IN' || e.kind === 'SPLIT_IN') || (p === null ? (e.kind !== 'ISSUE' && e.qty > 0) : (e.qty > p && e.kind !== 'ISSUE')));
                  if (unexplained && openFrom <= e.ts) { at = e.ts; return true; } // 출처 모르는 수량
                  return false;
                });
                may[id] = at;
              });
              var changed = true;
              while (changed) {
                changed = false;
                Object.keys(may).forEach(function (id) {
                  hist[id].events.some(function (e) {
                    if (e.ts >= may[id]) return true;
                    var v = recvSrc(e);
                    if (v && mayOf(v) <= e.ts) { may[id] = e.ts; changed = true; return true; }
                    return false;
                  });
                });
              }
              res.srcDirt = {};
              Object.keys(srcs).forEach(function (src) {
                res.srcDirt[src] = mayOf(src);
                if (res.foreignRunId[src]) res.foreignRunId[src].inflowAt = res.srcDirt[src]; // 이 LOT 이 우리 RUNID 제품을 담았을 수 있는 가장 이른 시각
              });
            });
          }
          return seq(foreign, function (f) {
            if (res.foreignRunId[f.src] !== undefined) return;
            return backward(f.src, 2, Lx('병합 유입 LOT의 RUNID 확인 (혼입 구분)', 'Xác nhận RUNID của LOT gộp vào (phân biệt trộn lẫn)'), Lx('혼입', 'trộn lẫn')).then(function (b) {
              res.foreignRunId[f.src] = b.root ? { runId: b.root, confirmed: !!b.confirmed, path: b.path } : { runId: null, path: b.path, brokenAt: b.brokenAt };
            });
          }).then(function () {
            // 0.3.2: 확산 LOT 에 계보 밖에서 들어온 제품 중 'RUNID 제품 위치를 모르는 때' 이후에 들어온 것은
            //        이력 없는 경로로 RUNID 제품이 되돌아왔을 수 있다 → 출처 LOT 의 RUNID 를 확인해 본다
            // 0.3.6: 이 첫 재생은 계보 밖 유입이 모두 섞였을 수 있다고 보고(res.srcDirt 없음) 확인할 출처 LOT 과 openFrom 을 구한다.
            //        섞였을 수 있다고 넓히는 것은 이미 위치 미확정 제품이 있을 때뿐이라, openFrom 은 이 가정과 무관하게 최종 재생과 같다.
            var probe = {};
            res.runLabel = res.root || (res.top ? res.top + Lx('(최상위)', '(cao nhất)') : '?');
            res.srcDirt = null;
            var first = simulate(res, res.runLabel, null, probe);
            return seq(Object.keys(probe), function (src) {
              if (res.foreignRunId[src] !== undefined) return;
              return backward(src, 2, Lx('확산 LOT 유입 LOT의 RUNID 확인 (이력 없는 LOT을 거쳐 RUNID 제품이 섞였을 수 있음)', 'Xác nhận RUNID của LOT gộp vào LOT phân tán (sản phẩm RUNID có thể đã lẫn vào qua LOT không có lịch sử)'), Lx('혼입', 'trộn lẫn')).then(function (b) {
                res.foreignRunId[src] = b.root ? { runId: b.root, confirmed: !!b.confirmed, path: b.path } : { runId: null, path: b.path, brokenAt: b.brokenAt };
              });
            }).then(function () { return scanDirt(first.openFrom); });
          });
        });
      }).then(function () {
        // Array LOT 이 병합 LOT 말고 다른 LOT 의 부모로 쓰인 흔적(유입 LOT 역추적 경로에 등장) → 그 Array LOT 이력 필요
        if (res.smt) Object.keys(res.foreignRunId).forEach(function (src) {
          (res.foreignRunId[src].path || []).forEach(function (p) {
            if (res.smt.subs[p] !== undefined && !lots[p]) need(p, 1, Lx('SMT Array LOT 이 병합 LOT 이외의 LOT 으로 나뉨 (' + src + ' 의 역추적 경로) — 이 LOT 이력 필요', 'LOT SMT Array được tách sang LOT khác ngoài LOT gộp (đường truy ngược của ' + src + ') — cần lịch sử LOT này'), src, Lx('전개', 'triển khai'));
          });
        });
        computeComposition(res);
        // 추적 범위 밖으로 나간 몫에 RUNID 제품이 있었을 수 있으면 그 LOT 도 요청 (0.3.2)
        (res.outside || []).forEach(function (o) {
          var r = o.part[res.runLabel];
          if (r && r[1] > 0) need(o.lot, 1, Lx('RUNID 제품이 들어갔을 수 있는 LOT (' + o.from + ' → ' + o.qty + 'ea, ' + LT.stepLabel(o.step) + ', ' + o.time + ') — 추적 범위 밖, 이후 위치 확인', 'LOT có thể đã nhận sản phẩm RUNID (' + o.from + ' → ' + o.qty + 'ea, ' + LT.stepLabel(o.step) + ', ' + o.time + ') — ngoài phạm vi truy vết, kiểm tra vị trí sau đó'), o.from, Lx('확산', 'phân tán'));
        });
        if (res.ref) reclassifyForRef(res, missing);
        buildChecks(res, missing);
        res.missing = finalizeMissing();
        return res;
      });
    });
  };

  /* ------------------------------------------------------------------
   * 5. RUNID 구성 계산 — 최소~최대 범위 (혼입 + 확산 공통)
   *    계보 LOT 과 확산 LOT(이력 있는 것)의 모든 이벤트를 시간순으로 재생하며
   *    각 LOT 안에 어느 RUNID 제품이 몇 ea 있을 수 있는지 [최소, 최대] 로 계산한다.
   * ------------------------------------------------------------------ */
  function computeComposition(res) {
    var R = res.root || (res.top ? res.top + Lx('(최상위)', '(cao nhất)') : '?');
    res.runLabel = R;
    var base = simulate(res, R, null);
    res.comp = base.comp;
    res.compMax = base.compMax;
    res.entryComp = base.entryComp;
    res.transfers = base.pend;
    res.scrapComp = base.scrapComp;
    res.outside = base.outside;
    res.otherOut = base.otherOut;
    res.orderConflicts = base.orderConflicts;
    res.runidSummary = runidSummary(res);
    if (res.refStep) {
      var rs = simulate(res, R, res.refStep);
      res.ref = { step: res.refStep, code: res.refCode || '', note: res.refNote || '', pre: R + '@' + res.refStep + Lx(' 전', ' trước'), post: R + '@' + res.refStep + Lx(' 후', ' sau'),
        comp: rs.comp, entryComp: rs.entryComp, scrapComp: rs.scrapComp, tested: rs.tested, transfers: rs.pend, outside: rs.outside, otherOut: rs.otherOut };
      res.ref.summary = refSummary(res);
    }
  }

  /* 0.3.3: 같은 시각에 일어난 여러 LOT 이벤트의 재생 순서.
     시간순 정렬만 하면 같은 시각의 이벤트가 LOT 목록 순서대로 재생되어, 받은 쪽 기록이 보낸 쪽의 앞선 이벤트보다 먼저 계산될 수 있었다
     (예: A 가 X 를 받은 뒤 같은 시각에 B 로 보냈는데 B 의 수신을 먼저 계산 → X 가 섞였을 가능성을 놓치고 B 를 RUNID 로 확정).
     같은 시각 묶음 안에서만 (1) 각 LOT 이력의 순서, (2) 같은 두 LOT 사이 k번째 보낸 기록 → k번째 받은 기록 순서를 지키도록 다시 정렬한다.
     (3) 그 밖에는 이력 없는 LOT 으로 '보내는' 기록을 이력 없는 LOT 에서 '받는' 기록보다 먼저 재생한다 — 같은 시각에 이력 없는 LOT 을
         거쳐 곧바로 되돌아왔을 수 있는 제품을 빠뜨리지 않도록 (넓게 잡는 쪽).
     두 이력이 서로 모순이면(순환) 그 묶음은 원래 순서로 두고 conflicts 에 시각을 남긴다. */
  function causalOrder(all) {
    var sendQ = {}, recvQ = {}, inAll = {};
    all.forEach(function (x) { inAll[x.lot] = true; });
    var cls = function (x) { // 0 = 이력 없는 LOT 으로 보냄, 2 = 이력 없는 LOT 에서 받음, 1 = 그 밖
      var k = x.e.kind, v = x.e.chgVals;
      if (!v || inAll[v]) return 1;
      return (k === 'SPLIT_OUT' || k === 'MERGE_OUT') ? 0 : (k === 'SPLIT_IN' || k === 'MERGE_IN') ? 2 : 1;
    };
    all.forEach(function (x, p) {
      var k = x.e.kind, v = x.e.chgVals;
      if (!v) return;
      if (k === 'SPLIT_OUT' || k === 'MERGE_OUT') (sendQ[x.lot + '>' + v] = sendQ[x.lot + '>' + v] || []).push(p);
      else if (k === 'SPLIT_IN' || k === 'MERGE_IN') (recvQ[v + '>' + x.lot] = recvQ[v + '>' + x.lot] || []).push(p);
    });
    var after = {}; // 받은 기록 위치 → 먼저 재생해야 하는 보낸 기록 위치 (같은 시각일 때만)
    Object.keys(recvQ).forEach(function (pair) {
      var s = sendQ[pair];
      if (!s) return;
      recvQ[pair].forEach(function (rp, k) { if (k < s.length && all[s[k]].e.ts === all[rp].e.ts) after[rp] = s[k]; });
    });
    var out = [], conflicts = [], g = 0;
    while (g < all.length) {
      var h = g, p;
      while (h < all.length && all[h].e.ts === all[g].e.ts) h++;
      var needSort = false, seenTake = false;
      for (p = g; p < h && !needSort; p++) {
        if (after[p] !== undefined && after[p] > p) needSort = true;
        var c = cls(all[p]);
        if (c === 2) seenTake = true; else if (c === 0 && seenTake) needSort = true;
      }
      if (!needSort) { for (p = g; p < h; p++) out.push(all[p]); g = h; continue; }
      // 묶음 안 위상 정렬 — 먼저 재생할 수 있는 것 중 (보냄 → 그 밖 → 받음), 같으면 원래 위치가 앞선 것부터
      // 0.3.6: 받음 중에서도 뒤에 '이력 없는 LOT 으로 보냄'이 걸려 있는 것(자기 LOT 이력 순서상 먼저여야 하는 것)을 먼저 재생한다.
      //        (이전: 다른 LOT 의 받음이 원래 위치가 앞서면 먼저 재생돼, 같은 시각에 이력 없는 LOT 으로 보낸 제품이 그 LOT 을 거쳐
      //         곧바로 들어왔을 가능성을 놓쳤음 — 속성 시험 seed 8 에서 발견, 0.3.5 에도 있던 문제)
      var succ = {}, indeg = {}, lastOf = {}, emitted = {}, ready = [], done = 0, key = {};
      for (p = g; p < h; p++) { succ[p] = []; indeg[p] = 0; }
      for (p = g; p < h; p++) {
        var lot = all[p].lot;
        if (lastOf[lot] !== undefined) { succ[lastOf[lot]].push(p); indeg[p]++; }
        lastOf[lot] = p;
        if (after[p] !== undefined) { succ[after[p]].push(p); indeg[p]++; }
      }
      var leads = function (x, seen) { // x 뒤에(묶음 안에서) 이력 없는 LOT 으로 보냄이 있는가
        if (seen[x]) return false;
        seen[x] = true;
        return succ[x].some(function (y) { return cls(all[y]) === 0 || leads(y, seen); });
      };
      for (p = g; p < h; p++) {
        var c0 = cls(all[p]);
        key[p] = (c0 === 2 ? (leads(p, {}) ? 2 : 3) : c0) * (h - g + 1) + (p - g);
      }
      for (p = g; p < h; p++) if (!indeg[p]) ready.push(p);
      while (ready.length) {
        ready.sort(function (a, b) { return key[a] - key[b]; });
        var q = ready.shift();
        out.push(all[q]); emitted[q] = true; done++;
        succ[q].forEach(function (r) { if (--indeg[r] === 0) ready.push(r); });
      }
      if (done < h - g) {
        for (p = g; p < h; p++) if (!emitted[p]) out.push(all[p]);
        conflicts.push(all[g].e.time);
      }
      g = h;
    }
    return { order: out, conflicts: conflicts };
  }

  /* 이벤트 재생. ref(기준 공정)가 있으면 RUNID 제품을 '기준 공정 전/후'로 나눠 추적:
     기준 공정 TrackIn 순간 그 LOT 안의 '전' 제품이 '후'로 바뀐다.
     0.3.2: 이동 한 건 = 기록 한 건. 같은 두 LOT 사이에 여러 번 이동해도 k번째 보낸 기록과 k번째 받은 기록을 짝지어
            각각 따로 계산한다 (이전에는 LOT 쌍마다 첫 이동 결과를 재사용해 두 번째 이동부터 틀렸음). */
  function simulate(res, R, ref, probe) {
    var lots = res.lots, fset = res.familySet, smt = res.smt, spread = res.spread || {};
    var RL = ref ? R + '@' + ref + Lx(' 전', ' trước') : R, RP = ref ? R + '@' + ref + Lx(' 후', ' sau') : null;
    var scrapList = [], tested = [], outside = [], otherOut = [];
    function foreignLabel(src) {
      var f = res.foreignRunId[src];
      if (f && f.runId) return f.runId;
      return src + Lx('(RUNID 미확인)', '(chưa rõ RUNID)');
    }
    function otherLabel(id) { return Lx('기타(', 'Khác(') + id + ')'; }
    var ids = res.family.concat(res.spreadList || []);
    var inIds = {};
    ids.forEach(function (id) { inIds[id] = true; });
    var all = [];
    ids.forEach(function (id) {
      var L = lots[id];
      if (L) L.events.forEach(function (e, i) { all.push({ lot: id, e: e, i: i }); });
    });
    all.sort(function (a, b) { return (a.e.ts - b.e.ts) || (a.lot === b.lot ? a.i - b.i : 0); });
    var co = causalOrder(all);
    all = co.order;
    var comp = {}, pend = {}, compMax = {}, qty = {}, entryComp = {}, sendN = {}, recvN = {};
    // 0.3.6: 우리 RUNID 제품이 처음 위치 미확정(이력 없는 LOT·추적 범위 밖·병합 LOT 미확인 Array)이 된 시각 — 위치 미확정 몫(openAmount)은 줄지 않는다
    var openFrom = Infinity, openTouched = false;
    function cur(id) { return comp[id] || {}; }
    function track(id, ts) {
      if (spread[id] && ts !== undefined && ts < spread[id].entryTs) return; // 확산 LOT: RUNID 유입 전 구성은 보지 않음
      var c = comp[id] || {}, m = compMax[id] || (compMax[id] = {});
      Object.keys(c).forEach(function (k) {
        if (!m[k]) m[k] = [c[k][0], c[k][1]];
        else { m[k][0] = Math.max(m[k][0], c[k][0]); m[k][1] = Math.max(m[k][1], c[k][1]); }
      });
    }
    // from→to 의 k번째 이동 키. 보낸 쪽 k번째 기록과 받은 쪽 k번째 기록이 같은 키를 쓴다.
    function tkey(from, to, side) {
      var b = from + '>' + to, ctr = side === 'send' ? sendN : recvN, n = ctr[b] || 0;
      ctr[b] = n + 1;
      return b + '#' + n;
    }
    // 이력 없는 LOT: 전체 수량을 모르므로 들어온 몫만 쌓고, 나갈 때는 '미확인(그 LOT)' 몫을 함께 둔다
    function addLoose(a, b) {
      var o = {};
      Object.keys(a).forEach(function (k) { o[k] = [a[k][0], a[k][1]]; });
      Object.keys(b).forEach(function (k) { o[k] = o[k] ? [o[k][0] + b[k][0], o[k][1] + b[k][1]] : [b[k][0], b[k][1]]; });
      return o;
    }
    function takeLoose(c, q, id) {
      var part = {}, rest = {};
      Object.keys(c).forEach(function (k) {
        part[k] = [0, Math.min(q, c[k][1])];
        rest[k] = [Math.max(0, c[k][0] - q), c[k][1]];
      });
      // 이력이 없으니 이 LOT 이 몰래(기록을 볼 수 없게) 받은 것도 있을 수 있다 — 위치 모르는 RUNID 제품 전체가 후보 (openAmount 는 이 LOT 몫 포함)
      var o = openAmount();
      if (o.pre > 0) part[RL] = [0, Math.min(q, o.pre)];
      // 기준 공정 모드: 이력 없는 LOT 안에서 기준 공정 TrackIn 을 했을 수 있으므로 '전' 제품이 '후'로 나올 수 있다
      if (RP && (o.pre + o.post) > 0) part[RP] = [0, Math.min(q, o.pre + o.post)];
      part[Lx('미확인(' + id + ')', 'chưa rõ(' + id + ')')] = [0, q];
      return { part: tighten(part, q), rest: rest };
    }
    // 위치를 모르는 RUNID 제품(이력 없는 LOT, 추적 범위 밖, 병합 LOT 을 볼 수 없는 Array)의 현재 최대량
    var smtOpen = 0, subSent = {};
    function openAmount() {
      var pre = smtOpen, post = 0;
      ids.forEach(function (id) { if (lots[id] || !comp[id]) return; if (comp[id][RL]) pre += comp[id][RL][1]; if (RP && comp[id][RP]) post += comp[id][RP][1]; });
      outside.forEach(function (o) { if (o.part[RL]) pre += o.part[RL][1]; if (RP && o.part[RP]) post += o.part[RP][1]; });
      return { pre: pre, post: post };
    }
    // 출처를 볼 수 없는 유입(RUNID 미확인 LOT, 확산 LOT 에 계보 밖에서 들어온 것): 위치를 모르는 RUNID 제품이 있으면
    // 그것이 이력 없는 경로로 돌아왔을 수 있으므로 RUNID 몫을 0~(그 양) 으로 열어 둔다 (0.3.2)
    function withShare(part, q, from) {
      var o = openAmount();
      if (!(o.pre > 0 || o.post > 0)) return part;
      if (probe && from && res.foreignRunId[from] === undefined) probe[from] = true;
      var p = {};
      Object.keys(part).forEach(function (k) { p[k] = [0, part[k][1]]; });
      if (o.pre > 0) p[RL] = [0, Math.min(q, o.pre)];
      if (RP) p[RP] = [0, Math.min(q, o.pre + o.post)];
      return tighten(p, q);
    }
    // 보낸 쪽 LOT 에서 떼어 내기 (보낸 쪽 이력이 있으면 정확히, 없으면 들어온 구성 기준)
    function transfer(key, from, to, q, fromBefore, ts) {
      if (pend[key]) return pend[key];
      var t;
      if (lots[from] && inIds[from] && comp[from]) {
        var Q = fromBefore !== undefined ? fromBefore : (qty[from] || 0);
        var tk = takeComp(cur(from), Q, q);
        t = { part: tk.part, rest: tk.rest };
      } else if (!lots[from] && inIds[from] && comp[from]) {
        var tl = takeLoose(comp[from], q, from);
        t = { part: tl.part };
        comp[from] = tl.rest; track(from);
      } else if (from === res.root || (smt && smt.subs[from] !== undefined && smt.arrayMerge[from] === to && (subSent[from] || 0) + q <= smt.subs[from])) {
        // RUNID LOT, 또는 SMT 병합 구간에서 병합 LOT 으로 들어간 Array LOT (Array 는 RUNID 제품만 담음)
        // 0.3.3: 한 Array 가 여러 번에 나눠 병합돼도 배정 수량까지는 모두 Array 병합으로 본다 (이전: 첫 번째 병합만 RUNID 로 셌음)
        if (smt && smt.subs[from] !== undefined) subSent[from] = (subSent[from] || 0) + q;
        t = { part: one(RL, q) };
      } else if (smt && smt.subs[from] !== undefined) {
        // 병합 LOT 을 모르는 Array LOT 에서 온 것: 실제로는 다른 Array 를 받아 병합 LOT 처럼 쓰였을 수 있어 구성을 모른다
        t = { part: withShare(one(from + Lx('(Array, 병합 LOT 미확인)', '(Array, chưa xác định LOT gộp)'), q), q, null) };
      } else if (fset[from] || spread[from]) {
        // 계보/확산 LOT 이지만 이력이 없고 아직 받은 기록도 없음 → 구성을 모름 (위치 모르는 RUNID 제품이 있었을 수 있음)
        t = { part: withShare(one(from + Lx('(미확인)', '(chưa rõ)'), q), q, null) };
      } else {
        // 계보·확산 밖에서 들어온 제품. 다른 RUNID 로 확인된 LOT 이면 그 RUNID 제품으로 본다.
        // RUNID 미확인이거나 이력 없는 LOT 을 거쳐 우리 RUNID 로 이어지는 LOT 이면, 위치를 모르는 RUNID 제품이 섞였을 수 있다.
        var fr = res.foreignRunId[from];
        var lab = spread[to] ? Lx('기타(', 'Khác(') + (lots[to] && lots[to].splitFrom && lots[to].splitFrom.parent === from ? to + Lx(' 기존분', ' phần có sẵn') : from) + ')'
          : (fr && fr.runId === res.root ? from + Lx('(이력 없는 경로)', '(qua đường không có lịch sử)') : foreignLabel(from));
        var other = fr && fr.runId && fr.runId !== res.root;
        var p0 = one(other ? (spread[to] ? fr.runId : foreignLabel(from)) : lab, q);
        // 0.3.6: 보낸 LOT 이 이 시각까지 우리 RUNID 제품을 받을 수 없었음이 이력으로 확인되면(res.srcDirt — LT.trace 의 scanDirt) 섞였을 가능성을 열지 않는다.
        //        확인하지 못한 LOT 은 이전처럼 위치 모르는 우리 RUNID 제품이 섞였을 수 있다고 본다.
        //        (0.3.3: 다른 RUNID LOT 은 받은 기록이 하나라도 있으면, RUNID 미확인 LOT 은 늘 섞였을 수 있다고 봤음)
        var dirt = res.srcDirt ? res.srcDirt[from] : undefined;
        t = { part: dirt !== undefined && !(dirt <= ts) ? p0 : withShare(p0, q, from) };
      }
      t.from = from; t.to = to; t.qty = q;
      pend[key] = t;
      return t;
    }
    // 받는 쪽 LOT 반영 (보낸 쪽 이벤트에서): 받는 쪽 이력이 있으면 그쪽 이벤트에서 반영하므로 여기서는 하지 않는다
    // 이력 없는 SMT 병합 LOT: Array LOT 병합을 볼 수 없으므로 그 LOT 에 매핑된 Array 수량 전부가 들어올 수 있다고 본다
    function hostMapped(h) { var mq = 0; smt.subList.forEach(function (s) { if (smt.hostOf[s] === h) mq += smt.subs[s]; }); return mq; }
    function deliver(t, to, e) {
      if (lots[to] && inIds[to]) return;
      if (inIds[to] && smt && smt.hosts.indexOf(to) >= 0) {
        if (!comp[to]) { comp[to] = {}; comp[to][RL] = [0, hostMapped(to)]; entryComp[to] = comp[to]; }
        if (t.from !== res.top) comp[to] = addLoose(comp[to], t.part); // Array 가 아닌 곳(다른 병합 LOT 등)에서 들어온 몫
        track(to); openTouched = true;
      } else if (inIds[to]) {
        comp[to] = comp[to] ? addLoose(comp[to], t.part) : addLoose({}, t.part);
        if (!entryComp[to]) entryComp[to] = t.part;
        track(to); openTouched = true;
      } else if (!(smt && t.from === res.top && smt.subs[to] !== undefined)) {
        // 추적 대상 밖으로 나간 몫 (예: 확산 LOT이 유입 전에 보낸 것, 확산 개수 한도 초과, 병합 LOT 으로 확인 안 된 Array LOT 으로 병합) — 수지에서 따로 센다
        // (RUNID LOT → Array 분할은 SMT 항목으로 센다)
        outside.push({ lot: to, from: t.from, time: e.time, ts: e.ts, step: e.step, qty: t.qty, part: t.part }); openTouched = true;
      }
    }
    function applyRest(t, from, q) {
      if (t.rest && !t.restApplied && lots[from] && inIds[from]) { comp[from] = t.rest; t.restApplied = true; qty[from] = (qty[from] || 0) - q; }
    }
    all.forEach(function (x) {
      var e = x.e, id = x.lot, before = qty[id], t;
      switch (e.kind) {
        case 'ISSUE':
          comp[id] = one(id === res.top ? RL : id, e.qty); break;
        case 'SPLIT_IN':
          t = transfer(tkey(e.chgVals, id, 'recv'), e.chgVals, id, e.chgQty, undefined, e.ts);
          applyRest(t, e.chgVals, e.chgQty);
          comp[id] = tighten(t.part, e.qty); entryComp[id] = comp[id]; break;
        case 'SPLIT_OUT':
        case 'MERGE_OUT':
          var key = tkey(id, e.chgVals, 'send');
          if (pend[key] && pend[key].restApplied) { /* 받는 쪽에서 이미 반영 */ }
          else {
            t = transfer(key, id, e.chgVals, e.chgQty, before !== undefined ? before : e.qty + e.chgQty, e.ts);
            comp[id] = t.rest || tighten(cur(id), e.qty); t.restApplied = true;
            deliver(t, e.chgVals, e);
            if (smt && id === res.top && smt.subs[e.chgVals] !== undefined && !inIds[e.chgVals]) {
              var hh = smt.hostOf[e.chgVals];
              if (!hh) { smtOpen += (t.part[RL] ? t.part[RL][1] : 0); openTouched = true; } // 병합 LOT 미확인 Array → 위치 모름 (병합 LOT 이력 없음은 그 LOT 구성에 포함)
              else if (!lots[hh] && inIds[hh] && !comp[hh]) {
                // 0.3.6: 이력 없는 병합 LOT 의 구성은 그 LOT 으로 보낸 기록에서 잡았는데, Array LOT 이 아닌 병합 LOT 은 RUNID LOT 이 직접 보내지 않아
                //        계보 LOT 이 보내지 않으면 끝까지 잡히지 않았다 → 그 안의 RUNID 제품이 위치 미확정 목록·수지에서 빠짐. Array 분할 때 잡는다
                comp[hh] = {}; comp[hh][RL] = [0, hostMapped(hh)]; entryComp[hh] = comp[hh]; track(hh); openTouched = true;
              }
            }
          }
          comp[id] = tighten(cur(id), e.qty); break;
        case 'MERGE_IN':
          t = transfer(tkey(e.chgVals, id, 'recv'), e.chgVals, id, e.chgQty, undefined, e.ts);
          applyRest(t, e.chgVals, e.chgQty);
          if (!comp[id]) comp[id] = before ? one(otherLabel(id), before) : {};
          comp[id] = addComp(cur(id), t.part, e.qty);
          if (spread[id] && e.ts === spread[id].entryTs && !entryComp[id]) entryComp[id] = t.part;
          break;
        case 'SCRAP':
          var Qb = before !== undefined ? before : e.qty + e.chgQty;
          var tk = takeComp(cur(id), Qb, e.chgQty);
          scrapList.push({ lot: id, time: e.time, ts: e.ts, step: e.step, code: parseScrapComment(e.comment).code, comp: cur(id), scrapped: tk.part, qtyBefore: Qb, qty: e.chgQty });
          comp[id] = tk.rest; break;
        default:
          if (!comp[id]) comp[id] = one(id === res.top ? RL : otherLabel(id), e.qty);
          else if (before !== undefined && e.qty !== before) {
            // 설명되지 않은 수량 변화 (예: 기타 이벤트) — 감소는 떼어 내어 '기타 감소'로 기록, 증가는 기타로 추가
            if (e.qty < before) {
              var tko = takeComp(cur(id), before, before - e.qty);
              otherOut.push({ lot: id, event: e.event, time: e.time, ts: e.ts, step: e.step, qty: before - e.qty, part: tko.part });
              comp[id] = tko.rest;
            }
            else comp[id] = addComp(cur(id), one(Lx('미확인 증가(', 'Tăng chưa rõ(') + id + ')', e.qty - before), e.qty);
          }
      }
      // 기준 공정 TrackIn → '전' 제품을 '후'로 전환
      if (ref && e.kind === 'TRACKIN' && e.step === ref) {
        var c0 = cur(id), pre = c0[RL], post = c0[RP];
        var c1 = {};
        Object.keys(c0).forEach(function (k) { if (k !== RL) c1[k] = c0[k]; });
        if (pre) c1[RP] = post ? [post[0] + pre[0], post[1] + pre[1]] : [pre[0], pre[1]];
        comp[id] = tighten(c1, e.qty);
        tested.push({ lot: id, time: e.time, ts: e.ts, eqp: e.eqp, qty: e.qty, converted: pre ? [pre[0], pre[1]] : [0, 0], alreadyPost: post ? [post[0], post[1]] : [0, 0] });
      }
      qty[id] = e.qty;
      track(id, e.ts);
      if (openTouched && openFrom === Infinity) { var oa = openAmount(); if (oa.pre > 0 || oa.post > 0) openFrom = e.ts; }
      openTouched = false;
    });
    return { comp: comp, compMax: compMax, entryComp: entryComp, pend: pend, scrapComp: scrapList, tested: tested, outside: outside, otherOut: otherOut, orderConflicts: co.conflicts, openFrom: openFrom };
  }

  /* 기준 공정이 있으면 확산 LOT 필요도를 다시 나눈다:
     기준 공정 전 제품이 있을 수 있으면 필수(기준 공정 이력), 기준 공정 후 제품만이면 권장(출하 확인) */
  function reclassifyForRef(res, missing) {
    var ref = res.ref;
    Object.keys(missing).forEach(function (id) {
      var m = missing[id];
      if (m.kinds.indexOf(Lx('확산', 'phân tán')) < 0 || m.kinds.indexOf(Lx('역추적', 'truy ngược')) >= 0 || m.kinds.indexOf(Lx('전개', 'triển khai')) >= 0) return;
      var c = ref.comp[id];
      if (!c) { // 추적 범위 밖 LOT: 그리로 나간 몫을 합친다
        c = {};
        (ref.outside || []).forEach(function (o) { if (o.lot !== id) return; Object.keys(o.part).forEach(function (k) { c[k] = c[k] ? [c[k][0] + o.part[k][0], c[k][1] + o.part[k][1]] : [o.part[k][0], o.part[k][1]]; }); });
      }
      var pre = c[ref.pre], post = c[ref.post];
      m.kinds = m.kinds.filter(function (k) { return k !== Lx('확산', 'phân tán'); });
      m.reasons = m.reasons.map(function (r) { return r.replace(Lx(' — 이후 위치 확인', ' — kiểm tra vị trí sau đó'), ''); });
      if (pre && pre[1] > 0) {
        m.level = 1; m.kinds.push(ref.step + Lx(' 이력', ' lịch sử'));
        m.reasons.push(Lx(ref.step + ' 전 RUNID 제품 ' + LT.rangeText(pre) + 'ea 포함 — 이 LOT의 ' + ref.step + ' 이력 필요', 'Chứa ' + LT.rangeText(pre) + 'ea sản phẩm RUNID chưa qua ' + ref.step + ' — cần lịch sử ' + ref.step + ' của LOT này'));
      } else if (post && post[1] > 0) {
        m.level = 2; m.kinds.push(Lx('출하 확인', 'kiểm tra xuất hàng'));
        m.reasons.push(Lx(ref.step + ' 이후에 나뉜 LOT (RUNID 제품 ' + LT.rangeText(post) + 'ea, ' + ref.step + ' 결과는 앞 LOT 이력에 있음) — 출하 여부 확인', 'LOT tách/chuyển sau ' + ref.step + ' (sản phẩm RUNID ' + LT.rangeText(post) + 'ea, kết quả ' + ref.step + ' đã có trong lịch sử LOT trước) — kiểm tra xuất hàng'));
      } else {
        m.level = 3; m.kinds.push(Lx('참고', 'tham khảo'));
      }
    });
  }

  /* 수지 공통: 알려진 몫들의 합으로부터 '위치 미확정' 범위를 구한다.
     - 위치 미확정 = [max(0, 투입−알려진 최대), min(투입−알려진 최소, 이력 없는 LOT 등에 들어간 최대)]
     - 이 범위가 뒤집히면(최소>최대) 설명되지 않는 수량이 있다는 뜻 → imbalance 로 알리고 범위는 이력 없는 LOT 기준으로 둔다
     - 이력 없는 LOT 이 없으면 투입 = 알려진 몫 합(범위)이 성립해야 한다 */
  function balance(total, knownLo, knownHi, missLo, missHi, hasMissing) {
    var loBal = total - knownHi, hiBal = total - knownLo;
    if (!hasMissing) {
      var gap = loBal > 0 ? loBal : (hiBal < 0 ? hiBal : 0);
      return { unknown: [0, 0], imbalance: gap };
    }
    // 이력 없는 LOT 의 '들어간 수량' 최소는 쓰지 않는다: 이력이 없으니 그 뒤 어디로 나갔는지(다시 이력 있는 LOT 으로 돌아왔는지) 모른다
    var lo = Math.max(0, loBal), hi = Math.min(hiBal, missHi);
    if (lo > hi) return { unknown: [Math.min(missLo, missHi), missHi], imbalance: loBal > missHi ? loBal - missHi : hiBal };
    return { unknown: [lo, hi], imbalance: 0 };
  }
  // SMT 감소: 모든 Array LOT 의 병합 LOT 을 알고, 그 병합 LOT 이력이 모두 있을 때만 확정. 아니면 null(미확인)
  function smtLossOf(smt) {
    if (!smt) return 0;
    if (!smt.hosts.length || smt.unresolved.length || !smt.hosts.every(function (h) { return smt.hostInfo[h]; })) return null;
    var subTotal = 0, hq = 0;
    Object.keys(smt.subs).forEach(function (k) { subTotal += smt.subs[k]; });
    smt.hosts.forEach(function (h) { hq += smt.hostInfo[h].qty; });
    return subTotal - hq;
  }
  // 위치를 모르는 몫: 이력 없는 계보/확산 LOT, 병합 LOT 미확인 Array LOT, 추적 범위 밖으로 나간 몫
  function openHolders(res, comp, label, outside) {
    var lots = res.lots, smt = res.smt, list = [], lo = 0, hi = 0, byId = {};
    function push(id, r, kind, via) {
      if (!r || r[1] <= 0) return;
      if (byId[id]) { byId[id].range = [byId[id].range[0] + r[0], byId[id].range[1] + r[1]]; if (via && byId[id].via.indexOf(via) < 0) byId[id].via.push(via); }
      else { byId[id] = { id: id, range: [r[0], r[1]], kind: kind, via: via ? [via] : [] }; list.push(byId[id]); }
      lo += r[0]; hi += r[1];
    }
    res.family.concat(res.spreadList || []).forEach(function (id) {
      if (lots[id]) return;
      push(id, comp[id] && comp[id][label], smt && smt.hosts.indexOf(id) >= 0 ? Lx('SMT 병합 LOT (이력 없음)', 'LOT gộp SMT (không có lịch sử)') : (res.spread && res.spread[id] ? Lx('확산 LOT (이력 없음)', 'LOT phân tán (không có lịch sử)') : Lx('계보 LOT (이력 없음)', 'LOT phả hệ (không có lịch sử)')));
    });
    if (smt) smt.unresolved.forEach(function (id) { push(id, [0, smt.subs[id]], Lx('SMT Array LOT (병합 LOT 미확인)', 'LOT SMT Array (chưa xác định LOT gộp)'), res.top + Lx(' → SMT Array 분할 ', ' → tách SMT Array ') + smt.subs[id] + 'ea'); });
    (outside || []).forEach(function (o) { push(o.lot, o.part[label], Lx('추적 범위 밖으로 이동', 'Di chuyển ra ngoài phạm vi truy vết'), o.from + ' → ' + o.qty + 'ea · ' + o.step + ' · ' + o.time); });
    return { list: list, lo: lo, hi: hi };
  }

  /* 기준 공정 수지: 투입 = SMT 감소 + 기준 공정 전 불량 + 기준 공정 전 기타 감소 + 기준 공정 이력 확인(테스트됨) + 기준 공정 미진행(이력 있는 LOT) + 기준 공정 이력 미확인 */
  function refSummary(res) {
    var ref = res.ref, lots = res.lots, smt = res.smt;
    if (!res.root || !res.rootConfirmed || !lots[res.root]) return null;
    var total = lots[res.root].origin.qty, RL = ref.pre, RP = ref.post;
    var smtLoss = smtLossOf(smt);
    var add = function (a, r) { if (r) { a[0] += r[0]; a[1] += r[1]; } };
    var tested = [0, 0], scrapPre = [0, 0], scrapPost = [0, 0], otherPre = [0, 0], codeR = [0, 0], codeQty = 0, pending = [0, 0];
    ref.tested.forEach(function (t) { add(tested, t.converted); });
    ref.scrapComp.forEach(function (sc) {
      add(scrapPre, sc.scrapped[RL]); add(scrapPost, sc.scrapped[RP]);
      if (ref.code && sc.code === ref.code && sc.step === ref.step) { codeQty += sc.qty; add(codeR, sc.scrapped[RP]); }
    });
    (ref.otherOut || []).forEach(function (o) { add(otherPre, o.part[RL]); });
    var pendingLots = [], missPost = [];
    res.family.concat(res.spreadList || []).forEach(function (id) {
      var L = lots[id], c = ref.comp[id] || {};
      if (L) {
        if (L.finalQty > 0 && c[RL] && c[RL][1] > 0) { add(pending, c[RL]); pendingLots.push({ id: id, qty: L.finalQty, range: c[RL] }); }
      } else if (!(c[RL] && c[RL][1] > 0) && c[RP] && c[RP][1] > 0) missPost.push({ id: id, range: c[RP] });
    });
    var open = openHolders(res, ref.comp, RL, ref.outside);
    var sl = smtLoss || 0;
    var b = balance(total - sl, scrapPre[0] + otherPre[0] + tested[0] + pending[0], scrapPre[1] + otherPre[1] + tested[1] + pending[1], open.lo, open.hi, open.list.length > 0);
    return { total: total, smtLoss: smtLoss, tested: tested, scrapPre: scrapPre, scrapPost: scrapPost, otherPre: otherPre, pending: pending, pendingLots: pendingLots,
      unknown: b.unknown, missPre: open.list, missPost: missPost, codeQty: codeQty, codeR: codeR, imbalance: b.imbalance, balanced: !b.imbalance };
  }

  /* RUNID 제품 위치 수지: 투입 = SMT 감소 + 불량 + 기타 감소 + 이력 있는 LOT 잔량 + 위치 미확정(이력 없는 LOT 등) */
  function runidSummary(res) {
    var lots = res.lots, smt = res.smt, R = res.runLabel;
    if (!res.root || !res.rootConfirmed || !lots[res.root]) return null;
    var total = lots[res.root].origin.qty;
    var smtLoss = smtLossOf(smt);
    var add = function (a, r) { if (r) { a[0] += r[0]; a[1] += r[1]; } };
    var scrap = [0, 0], other = [0, 0];
    res.scrapComp.forEach(function (sc) { add(scrap, sc.scrapped[R]); });
    (res.otherOut || []).forEach(function (o) { add(other, o.part[R]); });
    var known = [0, 0], holders = [];
    res.family.concat(res.spreadList || []).forEach(function (id) {
      var L = lots[id], r = res.comp[id] && res.comp[id][R];
      if (!L || !r || r[1] <= 0 || !(L.finalQty > 0)) return;
      add(known, r); holders.push({ id: id, qty: L.finalQty, range: r });
    });
    var open = openHolders(res, res.comp, R, res.outside);
    var sl = smtLoss || 0;
    var b = balance(total - sl, scrap[0] + other[0] + known[0], scrap[1] + other[1] + known[1], open.lo, open.hi, open.list.length > 0);
    // 이력 있는 LOT 합계는 LOT별 범위의 합보다 수지로 더 좁혀질 수 있다 (예: 불량·미확정이 0이면 투입 − SMT 감소 로 확정)
    var kLo = Math.max(known[0], total - sl - scrap[1] - other[1] - b.unknown[1]), kHi = Math.min(known[1], total - sl - scrap[0] - other[0] - b.unknown[0]);
    var knownTotal = !b.imbalance && kLo <= kHi ? [kLo, kHi] : known;
    return { runId: res.root, total: total, smtLoss: smtLoss, scrap: scrap, other: other, known: knownTotal, knownSum: known, holders: holders, unknown: b.unknown,
      missingHolders: open.list, imbalance: b.imbalance, balanced: !b.imbalance };
  }

  /* ------------------------------------------------------------------
   * 6. 검증 항목
   * ------------------------------------------------------------------ */
  function buildChecks(res, missing) {
    var C = res.checks, lots = res.lots, fset = res.familySet, smt = res.smt;
    missing = missing || {};
    function add(level, item, detail) { C.push({ level: level, item: item, detail: detail }); }

    add(lots[res.input] ? 'PASS' : 'FAIL', Lx('입력 LOT 이력', 'Lịch sử LOT đầu vào'), lots[res.input] ? Lx(res.input + ' 이력 ' + lots[res.input].events.length + '건', res.input + ': ' + lots[res.input].events.length + ' sự kiện') : Lx(res.input + ' 이력 파일 없음', res.input + ': không có tệp lịch sử'));
    if (res.root && res.rootConfirmed) add('PASS', Lx('SMT RUNID 도달', 'Truy đến SMT RUNID'), res.path.join(' → ') + Lx(' (투입 이벤트 확인)', ' (đã xác nhận sự kiện đầu vào)'));
    else if (res.root) add('WARN', Lx('SMT RUNID 도달', 'Truy đến SMT RUNID'), res.path.join(' → ') + Lx(' (투입 이벤트 없음 — 추정)', ' (không có sự kiện đầu vào — ước tính)'));
    else add('FAIL', Lx('SMT RUNID 도달', 'Truy đến SMT RUNID'), Lx('역추적 경로 끊김: ', 'Đường truy ngược bị đứt: ') + res.path.join(' → '));

    // 수량 연속성
    var qi = [];
    Object.keys(lots).forEach(function (id) { if (lots[id]) qi = qi.concat(lots[id].qtyIssues); });
    if (!qi.length) add('PASS', Lx('이벤트별 수량 연속성', 'Tính liên tục số lượng theo sự kiện'), Lx('모든 SPLIT/MERGE/SCRAP 전후 수량 일치', 'Số lượng trước/sau mọi SPLIT/MERGE/SCRAP đều khớp'));
    else qi.forEach(function (q) {
      add('WARN', Lx('이벤트별 수량 연속성', 'Tính liên tục số lượng theo sự kiện'), q.lot + ' ' + q.time + ' ' + q.event + ' ' + (q.chg || '') + Lx(': 이전 ', ': trước ') + q.before + Lx(', 예상 ', ', dự kiến ') + q.expected + Lx(', 실제 ', ', thực tế ') + q.actual);
    });

    // SPLIT 상호 대조
    var sOk = 0, sBad = [];
    res.family.forEach(function (id) {
      var L = lots[id];
      if (!L) return;
      L.splitOuts.forEach(function (s) {
        var C2 = lots[s.child];
        if (!C2 || !C2.splitFrom) return;
        if (C2.splitFrom.parent === id && C2.splitFrom.qty === s.qty && C2.splitFrom.time === s.time) sOk++;
        else sBad.push(id + '→' + s.child + Lx(' (부모: ', ' (LOT cha: ') + s.qty + '@' + s.time + Lx(' / 자식: ', ' / LOT con: ') + C2.splitFrom.parent + ' ' + C2.splitFrom.qty + '@' + C2.splitFrom.time + ')');
      });
    });
    if (sBad.length) sBad.forEach(function (x) { add('WARN', Lx('SPLIT 부모↔자식 대조', 'Đối chiếu SPLIT cha↔con'), x); });
    else add('PASS', Lx('SPLIT 부모↔자식 대조', 'Đối chiếu SPLIT cha↔con'), Lx(sOk + '건 일치 (양쪽 이력이 있는 경우)', sOk + ' trường hợp khớp (khi có lịch sử cả hai phía)'));

    // MERGE 상호 대조 — 같은 두 LOT 사이 병합이 여러 번이면 수량·시각이 같은 기록끼리 1:1로 짝짓는다 (0.3.2)
    var mOk = 0, mBad = [], usedIn = {};
    Object.keys(lots).forEach(function (id) {
      var L = lots[id];
      if (!L) return;
      L.mergeOuts.forEach(function (m) {
        var D = lots[m.dst];
        if (!D) return;
        var cand = [];
        D.mergeIns.forEach(function (x, i) { if (x.src === id && !usedIn[m.dst + '#' + i]) cand.push({ x: x, i: i }); });
        var hit = cand.filter(function (o) { return o.x.qty === m.qty && o.x.time === m.time; })[0];
        if (hit) { usedIn[m.dst + '#' + hit.i] = true; mOk++; }
        else mBad.push(id + '→' + m.dst + ' ' + m.qty + '@' + m.time + (cand[0] ? Lx(' / 상대: ', ' / phía kia: ') + cand[0].x.qty + '@' + cand[0].x.time : Lx(' / 상대 이력에 없음', ' / không có trong lịch sử phía kia')));
      });
    });
    // 받은 쪽에만 있는 병합 (보낸 쪽 이력이 있는데 짝이 없음)
    Object.keys(lots).forEach(function (id) {
      var D = lots[id];
      if (!D) return;
      D.mergeIns.forEach(function (x, i) {
        if (usedIn[id + '#' + i] || !lots[x.src]) return;
        mBad.push(x.src + '→' + id + ' ' + x.qty + '@' + x.time + Lx(' / 보낸 쪽 이력에 없음', ' / không có trong lịch sử bên gửi'));
      });
    });
    if (mBad.length) mBad.forEach(function (x) { add('WARN', Lx('MERGE 보낸쪽↔받은쪽 대조', 'Đối chiếu MERGE bên gửi↔bên nhận'), x); });
    else add('PASS', Lx('MERGE 보낸쪽↔받은쪽 대조', 'Đối chiếu MERGE bên gửi↔bên nhận'), Lx(mOk + '건 일치 (양쪽 이력이 있는 경우)', mOk + ' trường hợp khớp (khi có lịch sử cả hai phía)'));
    // 0.3.3: 같은 시각 이동의 순서가 두 LOT 이력끼리 모순 (보낸 기록보다 받은 기록이 앞서야만 하는 순환)
    if (res.orderConflicts && res.orderConflicts.length) add('WARN', Lx('같은 시각 이동 순서', 'Thứ tự di chuyển cùng thời điểm'), res.orderConflicts.join(', ') + Lx(' — 같은 시각에 오간 이동의 순서가 LOT 이력끼리 맞지 않아 파일 순서대로 계산했습니다 (그 시각의 구성 범위는 확인 필요)',
      ' — thứ tự các lần di chuyển cùng thời điểm không khớp giữa các lịch sử LOT nên đã tính theo thứ tự tệp (cần kiểm tra khoảng thành phần tại thời điểm đó)'));

    // SMT 접기
    if (smt) {
      var subTotal = 0;
      Object.keys(smt.subs).forEach(function (k) { subTotal += smt.subs[k]; });
      var rootL = lots[res.top];
      var issueQty = rootL && rootL.origin ? rootL.origin.qty : null;
      add(issueQty === subTotal ? 'PASS' : 'WARN', Lx('SMT Array 분할 수량', 'Số lượng tách SMT Array'), Lx('Array LOT ' + smt.subList.length + '개, 합계 ' + subTotal + 'ea / 투입 ' + issueQty + 'ea', smt.subList.length + ' LOT Array, tổng ' + subTotal + 'ea / đầu vào ' + issueQty + 'ea'));
      if (smt.pmsCount) add(smt.pmsCount === smt.subList.length ? 'PASS' : 'WARN', Lx('PMS Array 수', 'Số Array PMS'), Lx('PMS ' + smt.pmsCount + '건 / MES Array LOT ' + smt.subList.length + '개', 'PMS ' + smt.pmsCount + ' / MES ' + smt.subList.length + ' LOT Array'));
      else add('INFO', Lx('PMS Array 수', 'Số Array PMS'), Lx('PMS 파일 없음 — Array 병합 대상은 이력 파일로만 판정', 'Không có tệp PMS — LOT gộp Array chỉ được xác định bằng tệp lịch sử'));
      var noHostSubs = smt.unresolved.filter(function (k) { return !(smt.partialInto && smt.partialInto[k]); });
      if (noHostSubs.length) {
        var unq = 0; noHostSubs.forEach(function (k) { unq += smt.subs[k]; });
        add('WARN', Lx('SMT 병합 대상 판정', 'Xác định LOT gộp SMT'), Lx(noHostSubs.length + '개 Array LOT(' + unq + 'ea)의 병합 LOT 미확인 — 이 수량은 위치 미확정으로 셈, 추가 필요 LOT에 필수(전개)로 올림. PMS 파일(RUNID ' + res.top + ')을 넣으면 한 번에 해결', noHostSubs.length + ' LOT Array (' + unq + 'ea) chưa xác định LOT gộp — số lượng này được tính là chưa xác định vị trí, đưa vào LOT cần bổ sung với mức Bắt buộc(triển khai). Thêm tệp PMS (RUNID ' + res.top + ') là giải quyết được tất cả'));
      }
      else if (!smt.unresolved.length) add('PASS', Lx('SMT 병합 대상 판정', 'Xác định LOT gộp SMT'), Lx('전 Array LOT → ', 'Tất cả LOT Array → ') + smt.hosts.join(', '));
      // 0.3.3: 병합 LOT 에 전량 병합되지 않은 Array LOT (이력 있음 → 따로 추적 / 이력 없음 → 위치 미확정)
      if (smt.selfRun && smt.selfRun.length) add('INFO', Lx('SMT Array 따로 추적', 'Theo dõi riêng SMT Array'), Lx('Array LOT ' + smt.selfRun.join(', ') + ' 은 병합 LOT 에 배정 수량 전부가 병합되지 않아(일부만 병합 또는 여러 곳으로 이동) 자기 이력으로 따로 추적했습니다',
        'LOT Array ' + smt.selfRun.join(', ') + ' không được gộp toàn bộ số lượng vào LOT gộp (chỉ gộp một phần hoặc chuyển đến nhiều nơi) nên được theo dõi riêng bằng lịch sử của chính nó'));
      var partial = Object.keys(smt.partialInto || {});
      if (partial.length) add('WARN', Lx('SMT Array 일부 병합', 'SMT Array gộp một phần'), partial.map(function (k) { return k + ' → ' + smt.partialInto[k]; }).join(', ') + Lx(' — 병합 LOT 이력에 배정 수량 전부가 Array 병합으로 들어오지 않음. 나머지는 위치 미확정으로 셈 (이 Array LOT 이력 필요)',
        ' — lịch sử LOT gộp không nhận đủ toàn bộ số lượng Array. Phần còn lại được tính là chưa xác định vị trí (cần lịch sử LOT Array này)'));
      var hostQty = 0;
      smt.hosts.forEach(function (h) { if (smt.hostInfo[h]) hostQty += smt.hostInfo[h].qty; });
      var noHost = smt.hosts.filter(function (h) { return !smt.hostInfo[h]; });
      if (noHost.length) add('WARN', Lx('SMT 병합 수량', 'Số lượng gộp SMT'), Lx('병합 LOT ' + noHost.join(', ') + ' 이력 파일 없음 — 수량 확인 불가', 'Không có tệp lịch sử của LOT gộp ' + noHost.join(', ') + ' — không thể xác nhận số lượng'));
      else add(hostQty === subTotal ? 'PASS' : 'WARN', Lx('SMT 병합 수량', 'Số lượng gộp SMT'), Lx('병합 LOT 합계 ' + hostQty + 'ea / Array 합계 ' + subTotal + 'ea', 'Tổng LOT gộp ' + hostQty + 'ea / tổng Array ' + subTotal + 'ea'));
      if (res.pms) {
        var bad = res.pms.filter(function (r) {
          return (r.FRONT_SCRAP_CODE || r.BACK_SCRAP_CODE) || (r.FRONT_RESULT && /[^1A]/.test(r.FRONT_RESULT)) || (r.BACK_RESULT && /[^1A]/.test(r.BACK_RESULT));
        });
        add(bad.length ? 'WARN' : 'PASS', Lx('PMS AOI 결과', 'Kết quả AOI (PMS)'), bad.length ? Lx(bad.length + '개 Array 에 불량/스크랩 코드', bad.length + ' Array có mã lỗi/scrap') : Lx('전 Array 앞/뒷면 양품', 'Tất cả Array đạt cả mặt trước/sau'));
      }
    }

    // 전체 수지
    if (res.root && res.rootConfirmed) {
      var issue = lots[res.root].origin.qty;
      var leaves = 0, scrap = 0, outF = 0, inF = 0, inBase = 0, unknown = 0;
      res.family.forEach(function (id) {
        var L = lots[id];
        if (!L) {
          var par = res.parentOf[id], PL = par ? lots[par] : null;
          var sp = PL ? PL.splitOuts.filter(function (s) { return s.child === id; })[0] : null;
          if (sp && !(smt && id !== res.top && smt.subs[id] !== undefined)) leaves += sp.qty; else unknown++;
          return;
        }
        // SMT 모드의 RUNID LOT: Array 분할분은 아래 SMT 항목(병합 LOT 수량 + SMT 감소)으로 센다
        leaves += L.finalQty;
        L.scraps.forEach(function (s) { scrap += s.qty; });
        L.mergeOuts.forEach(function (m) { if (!fset[m.dst]) outF += m.qty; });
        L.mergeIns.forEach(function (m) { if (!fset[m.src] && !(smt && smt.subs[m.src] !== undefined)) inF += m.qty; });
        // 0.3.6: Array LOT 이 아닌 SMT 병합 LOT 이 Array 병합 전에 이미 담고 있던 수량 — 계보 밖에서 분할·투입된 것이면 외부 유입으로 센다
        var hInfo = smt && smt.hostInfo[id];
        if (hInfo && hInfo.baseQty && !(L.splitFrom && fset[L.splitFrom.parent])) inBase += hInfo.baseQty;
      });
      // SMT 감소는 모든 Array LOT 의 병합 LOT 을 알고 그 이력이 다 있을 때만 확정 (0.3.2 — 이전에는 병합 LOT 을 하나도 모르면 투입 전량을 SMT 감소로 계산했음)
      //   투입 = RUNID LOT 잔량 + Array 분할 합계, Array 분할 합계 = 병합 LOT 수량 + SMT 감소 → 투입 = 잔량 + 불량 + 반출 − 유입 + SMT 감소
      var smtLoss = smtLossOf(smt);
      var rhs = leaves + scrap + outF - inF - inBase + (smtLoss || 0);
      var incomplete = Object.keys(missing).some(function (k) {
        var m = missing[k];
        return m.level === 1 && (m.kinds.indexOf(Lx('역추적', 'truy ngược')) >= 0 || m.kinds.indexOf(Lx('전개', 'triển khai')) >= 0);
      });
      var smtText = smt ? (smtLoss === null ? Lx(' + SMT 감소 미확인(병합 LOT 확인 필요)', ' + hao hụt SMT chưa rõ (cần xác nhận LOT gộp)') : (smtLoss ? Lx(' + SMT 감소 ', ' + hao hụt SMT ') + smtLoss : '')) : '';
      add(incomplete || (smt && smtLoss === null) ? 'INFO' : (rhs === issue && !unknown ? 'PASS' : 'WARN'), Lx('계보 수량 수지 (RUNID 계보 기준)', 'Cân đối số lượng phả hệ (theo phả hệ RUNID)') + (incomplete || (smt && smtLoss === null) ? Lx(' — 역추적/전개 이력 누락, 참고용', ' — thiếu lịch sử truy ngược/triển khai, chỉ tham khảo') : ''),
        Lx('투입 ', 'Đầu vào ') + issue + Lx(' = 현재 잔량 ', ' = còn lại hiện tại ') + leaves + Lx(' + 불량 ', ' + lỗi ') + scrap + Lx(' + 외부 병합 반출 ', ' + gộp ra ngoài ') + outF + Lx(' − 외부 병합 유입 ', ' − gộp từ ngoài vào ') + inF +
        (inBase ? Lx(' − SMT 병합 LOT 기존 수량(Array 병합 전) ', ' − số lượng có sẵn trong LOT gộp SMT (trước khi gộp Array) ') + inBase : '') + smtText + ' → ' + rhs + (unknown ? Lx(' (수량 미확인 LOT ' + unknown + '개)', ' (' + unknown + ' LOT chưa rõ số lượng)') : ''));
    }

    // 확산 추적 (원자재 이슈 봉쇄 범위)
    var S = res.runidSummary;
    if (S) {
      var rt = LT.rangeText;
      var smtPart = function (v) { return v === null ? Lx('SMT 감소 미확인(위치 미확정에 포함) + ', 'Hao hụt SMT chưa rõ (đã tính vào phần chưa xác định vị trí) + ') : (v ? Lx('SMT 감소 ', 'Hao hụt SMT ') + v + ' + ' : ''); };
      var imb = function (x) { return x.imbalance ? Lx(' · 수지 불일치: 설명되지 않는 수량 ', ' · Không cân đối: số lượng chưa giải thích được ') + (x.imbalance > 0 ? x.imbalance + Lx('ea 부족', 'ea (thiếu)') : (-x.imbalance) + Lx('ea 초과', 'ea (dư)')) : ''; };
      var line = 'RUNID ' + S.runId + ' ' + S.total + 'ea = ' + smtPart(S.smtLoss) + Lx('불량 ', 'lỗi ') + rt(S.scrap) + (S.other[1] ? Lx(' + 기타 감소 ', ' + giảm khác ') + rt(S.other) : '') +
        Lx(' + 이력 확인된 LOT ', ' + LOT có lịch sử: ') + S.holders.length + Lx('개에 ', ' LOT có ') + rt(S.known) + Lx(' + 위치 미확정 ', ' + chưa xác định vị trí: ') + S.missingHolders.length + Lx('개 LOT에 ', ' LOT có ') + rt(S.unknown) + imb(S);
      // PASS 는 수지가 맞고 위치 미확정이 없을 때만 (0.3.2 — 이전에는 합계를 검산하지 않아 100ea 가 사라져도 PASS 가능했음)
      add(!S.balanced ? 'FAIL' : (S.missingHolders.length || S.smtLoss === null ? 'WARN' : 'PASS'), Lx('확산 추적 (RUNID 제품 현재 위치)', 'Truy vết phân tán (vị trí hiện tại của sản phẩm RUNID)'), line);
      if (res.ref && res.ref.summary) {
        var F = res.ref.summary, st = res.ref.step;
        add(!F.balanced ? 'FAIL' : (F.missPre.length || F.smtLoss === null ? 'WARN' : 'PASS'), Lx('기준 공정 ' + st + ' 이력 (RUNID 제품)', 'Lịch sử công đoạn chuẩn ' + st + ' (sản phẩm RUNID)'),
          'RUNID ' + S.runId + ' ' + F.total + 'ea = ' + smtPart(F.smtLoss) + st + Lx(' 전 불량 ', ' trước: lỗi ') + rt(F.scrapPre) + (F.otherPre[1] ? Lx(' + ', ' + ') + st + Lx(' 전 기타 감소 ', ' trước: giảm khác ') + rt(F.otherPre) : '') + Lx(' + ', ' + ') + st + Lx(' 이력 확인 ', ': đã xác nhận lịch sử ') + rt(F.tested) +
          Lx(' + ', ' + ') + st + Lx(' 미진행(이력 있는 LOT ', ': chưa qua (LOT có lịch sử ') + F.pendingLots.length + Lx('개) ', ' LOT) ') + rt(F.pending) + Lx(' + ', ' + ') + st + Lx(' 이력 미확인(', ': chưa xác nhận lịch sử (') + F.missPre.length + Lx('개 LOT) ', ' LOT) ') + rt(F.unknown) +
          (F.codeQty ? Lx(' · ', ' · ') + st + ' ' + res.ref.code + Lx(' 불량 ', ' lỗi ') + F.codeQty + Lx('ea 중 RUNID 제품 ', 'ea trong đó có sản phẩm RUNID ') + rt(F.codeR) : '') + imb(F));
      }
      add('INFO', Lx('확산 범위', 'Phạm vi phân tán'), Lx('계보 LOT ' + res.family.length + '개 + 외부로 퍼진 LOT ' + (res.spreadList || []).length + '개 (병합 반출 ' + res.mergeTargets.length + '건에서 시작)', res.family.length + ' LOT phả hệ + ' + (res.spreadList || []).length + ' LOT phân tán ra ngoài (bắt đầu từ ' + res.mergeTargets.length + ' lần gộp ra ngoài)'));
    }
  }

  /* ------------------------------------------------------------------
   * 7. 보조: 이벤트 타임라인 (주요 이벤트만)
   * ------------------------------------------------------------------ */
  LT.timeline = function (res) {
    var rows = [], lots = res.lots, smt = res.smt;
    var ids = res.family.slice().concat(res.spreadList || []);
    Object.keys(res.foreignRunId).forEach(function (k) { (res.foreignRunId[k].path || []).forEach(function (p) { if (ids.indexOf(p) < 0 && lots[p]) ids.push(p); }); });
    var keep = { ISSUE: 1, SPLIT_IN: 1, SPLIT_OUT: 1, MERGE_IN: 1, MERGE_OUT: 1, TRACKIN: 1, TRACKOUT: 1, SCRAP: 1, TERMINATED: 1, HOLD: 1, RELEASE: 1, OTHER: 1 };
    ids.forEach(function (id) {
      var L = lots[id];
      if (!L) return;
      var subSplit = 0, subSplitT = [], subMerge = 0, subMergeT = [], subStep = '';
      L.events.forEach(function (e) {
        var isSub = smt && ((e.kind === 'SPLIT_OUT' && id === res.top && smt.subs[e.chgVals] !== undefined) || (e.kind === 'MERGE_IN' && smt.arrayMerge[e.chgVals] === id));
        if (isSub) {
          if (e.kind === 'SPLIT_OUT') { subSplit++; subSplitT.push(e.time); subStep = e.step; }
          else { subMerge++; subMergeT.push(e.time); }
          return;
        }
        if (res.spread && res.spread[id] && e.ts < res.spread[id].entryTs) return;
        var isRecycle = e.kind === 'COMMENT' && /RECYCLELOTID/i.test(e.comment);
        if (!keep[e.kind] && !isRecycle) return;
        rows.push({ time: e.time, ts: e.ts, lot: id, event: e.event, kind: e.kind, step: e.step, eqp: e.eqp, qty: e.qty, chgVals: e.chgVals, chgQty: e.chgQty, comment: e.comment, oper: e.oper, family: !!res.familySet[id], spread: !!(res.spread && res.spread[id]) });
      });
      if (subSplit) rows.push({ time: subSplitT[0], ts: LT.toTime(subSplitT[0]).ts, lot: id, event: 'Split ×' + subSplit, kind: 'SMT_SUB', step: subStep, eqp: '', qty: '', chgVals: Lx('Array LOT ' + subSplit + '개', subSplit + ' LOT Array'), chgQty: '', comment: Lx('SMT Array 분할 ', 'Tách SMT Array ') + subSplitT[0] + ' ~ ' + subSplitT[subSplitT.length - 1] + Lx(' (요약)', ' (tóm tắt)'), family: true });
      if (subMerge) {
        var hi = smt.hostInfo[id];
        rows.push({ time: subMergeT[subMergeT.length - 1], ts: LT.toTime(subMergeT[subMergeT.length - 1]).ts, lot: id, event: 'Merge ×' + subMerge, kind: 'SMT_SUB', step: hi ? hi.mergeStep : '', eqp: '', qty: hi ? hi.qty : '', chgVals: Lx('Array LOT ' + subMerge + '개', subMerge + ' LOT Array'), chgQty: '', comment: Lx('SMT Array 병합 ', 'Gộp SMT Array ') + subMergeT[0] + ' ~ ' + subMergeT[subMergeT.length - 1] + Lx(' (요약)', ' (tóm tắt)'), family: true });
      }
    });
    rows.sort(function (a, b) { return a.ts - b.ts; });
    return rows;
  };

  // 기준 공정 관점의 LOT 상태
  LT.refStatus = function (res, id) {
    if (!res.ref) return '';
    var ref = res.ref, L = res.lots[id], st = ref.step, c = ref.comp[id] || {};
    var entryTs = res.spread && res.spread[id] ? res.spread[id].entryTs : -Infinity;
    if (!L) {
      if (c[ref.pre] && c[ref.pre][1] > 0) return Lx(st + ' 이력 미확인 (필수)', 'Chưa xác nhận ' + st + ' (bắt buộc)');
      if (c[ref.post] && c[ref.post][1] > 0) return st + Lx(' 이후 이동 (출하 확인 권장)', ' đã chuyển sau công đoạn (khuyến nghị kiểm tra xuất hàng)');
      return '';
    }
    // 기준 공정 실적 = RUNID 유입 이후의 TrackIn (구성 계산에서 '전→후' 전환도 TrackIn 기준). TrackIn 없는 불량만의 가상 실적은 제외 (0.3.2)
    var runs = L.runs.filter(function (r) { return r.step === st && r.inTs !== undefined && r.inTs >= entryTs; });
    if (runs.length) return runs.some(function (r) { return !r.outTime; }) ? st + Lx(' 진행 중', ' đang thực hiện') : st + Lx(' 완료 (', ' hoàn thành (') + runs.map(function (r) { return r.eqp; }).join('/') + ')';
    if (L.finalQty > 0 && c[ref.pre] && c[ref.pre][1] > 0) return st + Lx(' 미진행 — 봉쇄 우선', ' chưa thực hiện — ưu tiên HOLD');
    if (L.finalQty > 0 && c[ref.post] && c[ref.post][1] > 0) return st + Lx(' 이후 LOT', ' LOT sau công đoạn');
    var mo = L.mergeOuts[L.mergeOuts.length - 1];
    return L.finalQty === 0 ? (mo ? st + Lx(' 전 이동 → ', ' chuyển trước công đoạn → ') + mo.dst : '') : '';
  };

  LT.lotStatus = function (L, exportTime) {
    if (!L) return { text: Lx('이력 파일 없음', 'Không có tệp lịch sử'), step: '', qty: '', time: '' };
    var last = L.lastEvent;
    var t = '';
    if (L.terminated) {
      var mo = L.mergeOuts[L.mergeOuts.length - 1];
      t = (mo && mo.ts === L.terminated.ts) ? Lx('병합됨 → ', 'Đã gộp → ') + mo.dst : Lx('종료', 'Kết thúc');
    } else if (L.openHold) {
      t = Lx('HOLD 중: ', 'Đang HOLD: ') + L.openHold.comment;
    } else if (last && last.kind === 'OTHER') {
      t = Lx('마지막 이벤트: ', 'Sự kiện cuối: ') + last.event + (last.step ? ' @' + last.step : '') + (last.comment ? ' (' + last.comment + ')' : '');
    } else {
      t = Lx('진행/대기', 'Đang xử lý/chờ');
      var lastHold = L.holds[L.holds.length - 1];
      if (lastHold && lastHold.releaseTime) t += Lx(' (HOLD 해제 ', ' (gỡ HOLD ') + lastHold.releaseTime.slice(5, 16) + ')';
      var ex = exportTime || L.exportTime;
      var et = ex ? LT.toTime(ex) : null;
      if (et && last) {
        var h = (et.ts - last.ts) / 3600000;
        if (h >= 0) t += Lx(' · 마지막 이벤트 후 ', ' · ') + h.toFixed(1) + 'h';
      }
    }
    return { text: t, step: L.finalStep, qty: L.finalQty, time: last ? last.time : '' };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = LT;
  root.LotTracer = LT;
})(typeof globalThis !== 'undefined' ? globalThis : this);


