/* LOT Tracker 계보 추적 — 화면 코드 (app.js)
   전부 브라우저 안에서만 동작: 네트워크 호출·서버 없음.
   엔진(engine.js, report.js)과 xlsx-js-style / JSZip / sha256Hex 가 같은 페이지에 먼저 들어 있다. */
(function () {
  'use strict';

  var LT = window.LotTracer;
  var Lx = LT.Lx;
  var APP_VERSION = '__APP_VERSION__';
  var MAX_FILES = 500;
  var MAX_FILE_BYTES = 10 * 1024 * 1024;
  var MAX_TOTAL_BYTES = 128 * 1024 * 1024;
  var KEEP_FULL_RUNS = 5; // older runs keep their log/status but drop raw file bytes to bound memory

  var entries = new Map(); // fileName -> { file, bytes, sha256, parsed, override }
  var lastResult = null;
  var lastOutputs = null;  // { workbookBytes, resultJson }
  var lastMissingIds = [];
  var sessionRuns = [];    // every "추적 실행" click this tab has made, for the 검증결과.zip button
  var runSeq = 0;
  var busy = false;
  var els = {};

  function byId(id) { return document.getElementById(id); }
  function notifyHost(message) {
    if (!window.parent || window.parent === window) return;
    message.lotTracker = true;
    window.parent.postMessage(message, '*');
  }
  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function setStatus(text, isError) {
    els.status.textContent = text;
    els.status.className = isError ? 'status error' : 'status';
  }
  function setBusy(value) {
    busy = value;
    notifyHost({ type: 'busy', value: value });
    els.traceBtn.disabled = value || entries.size === 0;
    els.pickBtn.disabled = value;
    els.fileInput.disabled = value;
    els.clearBtn.disabled = value;
    // 0.3.3: 추적·파일 읽기 중에는 입력(LOT·기준 공정·불량 코드·옵션·파일 LOT ID·빼기)과 언어 버튼을 잠근다
    //        (이전: 추적 중에 옵션을 바꾸면 이전 옵션으로 만든 결과가 새 입력칸과 함께 '유효한 것처럼' 표시됐음 — Codex 2차 4번)
    [els.lotInput, els.refStep, els.refCode, els.optForeign].forEach(function (el) { if (el) el.disabled = value; });
    if (els.fileList) els.fileList.querySelectorAll('.lot-override, .rm-btn').forEach(function (el) { el.disabled = value; });
    var mism = lotMismatch();
    els.saveExcelBtn.disabled = value || !lastOutputs || mism;
    els.copyIdsBtn.disabled = value || !lastMissingIds.length || mism;
    refreshStaleNote(mism);
    els.saveValidationZipBtn.disabled = value || !sessionRuns.length;
    els.runCountNote.textContent = Lx('이번 세션에서 실행한 추적: ', 'Số lần truy vết đã chạy trong phiên này: ') + sessionRuns.length + Lx('회', ' lần');
  }
  /* 0.3.2: 입력이 바뀌면 이전 결과를 '유효한 것처럼' 남기지 않는다.
     - 파일 추가/빼기/LOT ID 수정, 기준 공정·옵션 변경 → 이전 결과를 지우고 다시 추적하도록 안내
     - 입력칸 LOT 만 바뀐 경우 → 결과는 보이되 "다른 LOT 결과" 표시 + 엑셀·ID 복사 잠금 (다시 같은 LOT 으로 돌리면 풀림) */
  function lotMismatch() {
    return !!(lastResult && els.lotInput && els.lotInput.value.trim().toUpperCase() !== lastResult.input);
  }
  function refreshStaleNote(mism) {
    if (!els.resultCard) return;
    var n = document.getElementById('stale-note');
    if (!mism) { if (n) n.parentNode.removeChild(n); return; }
    if (!n) { n = document.createElement('div'); n.id = 'stale-note'; n.className = 'card warn'; els.resultCard.insertBefore(n, els.resultCard.firstChild); }
    n.textContent = Lx(
      '입력칸의 LOT(' + els.lotInput.value.trim().toUpperCase() + ')이 아래 결과의 LOT(' + lastResult.input + ')과 다릅니다. 아래는 이전 결과이며 엑셀 저장·ID 복사를 막아 두었습니다. 추적 실행을 누르세요.',
      'LOT trong ô nhập (' + els.lotInput.value.trim().toUpperCase() + ') khác với LOT của kết quả bên dưới (' + lastResult.input + '). Đây là kết quả cũ nên đã khóa lưu Excel và sao chép ID. Hãy bấm Truy vết.'
    );
  }
  // 0.3.3: 추적 결과가 어떤 입력으로 만들어졌는지 — 파일(이름·해시·LOT ID 수정)과 옵션. 추적을 시작할 때와 끝날 때가 다르면 결과를 버린다.
  function inputSignature() {
    var files = [];
    entries.forEach(function (e, name) { files.push(name + '|' + e.sha256 + '|' + (e.override || '')); });
    return JSON.stringify({ files: files.sort(), foreign: els.optForeign ? els.optForeign.checked : true, refStep: els.refStep.value, refCode: els.refCode.value.trim() });
  }
  function invalidateResult(reason) {
    if (!lastResult && !lastOutputs) return;
    lastResult = null; lastOutputs = null; lastMissingIds = [];
    els.resultCard.style.display = 'none';
    els.results.innerHTML = ''; els.tabs.innerHTML = ''; els.summary.innerHTML = '';
    setStatus(reason + Lx(' — 입력이 바뀌어 이전 추적 결과를 지웠습니다. 추적 실행을 다시 누르세요.', ' — Đầu vào đã thay đổi nên đã xóa kết quả truy vết trước đó. Hãy bấm Truy vết lại.'), false);
  }
  function downloadBlob(bytes, filename, mime) {
    var blob = new Blob([bytes], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  /* ==================================================================
   * [인용] 검증결과 이력 — LOT-Tracker-Offline-Web v1.0.8 build/app.js
   *   newRun / pruneOldRunBytes / logStage / finishRun / README_TEXT /
   *   runRequestJson / runStatusJson / saveValidationZip
   *   변경점: "분석" → "추적", 실행 정보에 입력 LOT·RUNID·경로 추가,
   *          outputs 파일명을 이 도구 결과물에 맞춤. 보관 정책(최근 5회 원본·결과, 이전 회차 로그만)은 동일.
   * ================================================================== */
  // Every "추적 실행" click gets its own run record: what files went in (name + SHA-256), a
  // timestamped stage-by-stage log, and (for the most recent KEEP_FULL_RUNS runs) the raw
  // input file bytes and generated Excel bytes, so a problem can be reproduced from the zip
  // alone. Older runs keep their log/status but drop the raw bytes to bound memory.
  function newRun() {
    runSeq++;
    var run = {
      id: 'run-' + String(runSeq).padStart(3, '0') + '-' + new Date().toISOString().replace(/[:.]/g, '-'),
      startedAt: new Date().toISOString(), finishedAt: null, status: 'running', appVersion: APP_VERSION,
      files: [], summaryCount: 0, lotIds: [], warnings: [], errorStage: '', errorMessage: '',
      log: [], hasBytes: true, inputFiles: [], outputs: null,
      inputLot: '', root: '', path: [],
    };
    sessionRuns.push(run);
    pruneOldRunBytes();
    return run;
  }
  function pruneOldRunBytes() {
    var withBytes = sessionRuns.filter(function (r) { return r.hasBytes; });
    while (withBytes.length > KEEP_FULL_RUNS) {
      var oldest = withBytes.shift();
      oldest.hasBytes = false;
      oldest.inputFiles = [];
      oldest.outputs = null;
    }
  }
  function logStage(run, stage, details) {
    var entry = { time: new Date().toISOString(), stage: stage };
    if (details) for (var key in details) if (Object.prototype.hasOwnProperty.call(details, key)) entry[key] = details[key];
    run.log.push(entry);
  }
  function finishRun(run, status, extra) {
    run.status = status;
    run.finishedAt = new Date().toISOString();
    if (extra) for (var key in extra) if (Object.prototype.hasOwnProperty.call(extra, key)) run[key] = extra[key];
    logStage(run, status === 'success' ? 'TRACE_COMPLETE' : status === 'discarded' ? 'DISCARDED' : 'ERROR', extra);
    setBusy(busy); // refresh button states / run-count note without changing busy itself
  }

  // 0.3.2: 화면 언어 전환에 맞춰 매번 다시 만든다 (모듈 로드 시 한 번만 굳어지지 않도록 — README_TEXT를 상수로 두면 나중에 언어를 바꿔도 그대로 남는 문제가 있었음)
  function readmeText() {
    return [
      Lx('LOT Tracker 계보 추적 — 검증결과.zip', 'LOT Tracker truy vết phả hệ — validation-result.zip'),
      '',
      Lx('이 zip은 이 브라우저 탭에서 "추적 실행" 버튼을 누를 때마다 자동으로 기록된 내용을 모은 것입니다.', 'Tệp zip này gồm những gì được tự động ghi lại mỗi lần bấm nút "Truy vết" trong tab trình duyệt này.'),
      Lx('문제가 생겼을 때 이 zip을 그대로 전달하면 어느 파일에서 무엇이 어떻게 처리됐는지 재현할 수 있습니다.', 'Khi có sự cố, gửi nguyên tệp zip này sẽ giúp tái hiện file nào đã được xử lý như thế nào.'),
      '',
      Lx('- session-summary.json : 이번 탭에서 실행한 모든 추적의 요약 (실행 순서, 상태, 입력 LOT, RUNID, 오류 등)', '- session-summary.json : tóm tắt mọi lần truy vết trong tab này (thứ tự, trạng thái, LOT đầu vào, RUNID, lỗi...)'),
      Lx('- runs/<실행ID>/request.json : 그 실행의 입력 LOT·옵션과 사용한 파일 이름·크기·SHA-256 해시 목록', '- runs/<ID>/request.json : LOT đầu vào · tùy chọn và danh sách tên/kích thước/hash SHA-256 các tệp đã dùng của lần chạy đó'),
      Lx('- runs/<실행ID>/status.json  : 그 실행의 최종 상태 (성공/실패, 추적된 LOT 수, 경고, 오류 위치와 메시지)', '- runs/<ID>/status.json  : trạng thái cuối của lần chạy đó (thành công/thất bại, số LOT đã truy vết, cảnh báo, vị trí và nội dung lỗi)'),
      Lx('    status = success : 리포트를 만든 실행 (경고가 있을 수 있음 — warnings 확인)', '    status = success : lần chạy đã tạo được báo cáo (có thể có cảnh báo — xem warnings)'),
      Lx('    status = error   : 리포트를 만들지 못한 실행 (예: INPUT_LOT_NOT_FOUND = 입력 LOT 이력·분할 기록 없음) — errorStage/errorMessage 확인', '    status = error   : lần chạy không tạo được báo cáo (vd: INPUT_LOT_NOT_FOUND = không có lịch sử/bản ghi tách của LOT đầu vào) — xem errorStage/errorMessage'),
      Lx('    status = discarded : 추적하는 동안 파일·옵션이 바뀌어 화면에 쓰지 않고 버린 실행 (INPUT_CHANGED_DURING_TRACE, 결과물은 그 실행 요청 기준)', '    status = discarded : lần chạy bị bỏ vì tệp/tùy chọn thay đổi trong lúc truy vết (INPUT_CHANGED_DURING_TRACE, kết quả theo yêu cầu của lần chạy đó)'),
      Lx('    request.json 의 reason = LANGUAGE_SWITCH 는 화면 언어를 바꿔 같은 입력으로 다시 만든 실행', '    reason = LANGUAGE_SWITCH trong request.json: lần chạy tạo lại với cùng đầu vào khi đổi ngôn ngữ màn hình'),
      Lx('- runs/<실행ID>/logs/analysis.jsonl : 그 실행의 단계별 처리 기록 (시간순, 한 줄에 한 단계 · LOT 조회 기록 포함)', '- runs/<ID>/logs/analysis.jsonl : nhật ký xử lý theo từng bước của lần chạy đó (theo thời gian, mỗi dòng một bước · gồm cả bản ghi tra cứu LOT)'),
      Lx('- runs/<실행ID>/inputs/  : 그 실행에 사용한 원본 파일 사본 (최근 ', '- runs/<ID>/inputs/  : bản sao tệp gốc đã dùng cho lần chạy đó (chỉ giữ ') + KEEP_FULL_RUNS + Lx('회 실행만 보관)', ' lần chạy gần nhất)'),
      Lx('- runs/<실행ID>/outputs/ : 그 실행이 만든 엑셀 리포트와 trace-result.json (최근 ', '- runs/<ID>/outputs/ : báo cáo Excel và trace-result.json do lần chạy đó tạo ra (chỉ giữ ') + KEEP_FULL_RUNS + Lx('회 실행만 보관)', ' lần chạy gần nhất)'),
      Lx('    trace-result.json 에는 확산 LOT 목록(유입 시각·경로), LOT별 현재/유입 구성, 이동 한 건별 구성, 위치 수지·기준 공정 수지가 들어 있어 이 파일 안의 값끼리 맞는지(합계·범위·수지)를 검산할 수 있습니다 (원본 이벤트로부터 구성을 다시 계산하는 것은 아님)', '    trace-result.json chứa danh sách LOT phân tán (thời điểm/đường vào), thành phần hiện tại/lúc vào của từng LOT, thành phần từng lần di chuyển, cân đối vị trí · cân đối công đoạn chuẩn — có thể kiểm tra các giá trị trong tệp có khớp nhau không (tổng · khoảng · cân đối), nhưng không tính lại thành phần từ sự kiện gốc'),
      Lx('- runs/<실행ID>/NOTE.txt : 오래되어 원본/결과물 사본이 자동 삭제된 실행에 대한 안내', '- runs/<ID>/NOTE.txt : ghi chú cho lần chạy đã cũ nên bản sao gốc/kết quả đã bị tự động xóa'),
      '',
      Lx('이 zip은 다운로드 폴더에만 저장되며, 어디로도 자동 전송되지 않습니다.', 'Tệp zip này chỉ được lưu vào thư mục Downloads, không tự động gửi đi đâu cả.'),
    ].join('\n');
  }

  function runRequestJson(run) {
    return JSON.stringify({ id: run.id, appVersion: run.appVersion, startedAt: run.startedAt, inputLot: run.inputLot, options: run.options || {}, reason: run.reason || 'TRACE_CLICK', files: run.files }, null, 2);
  }
  function runStatusJson(run) {
    return JSON.stringify({
      id: run.id, appVersion: run.appVersion, status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt,
      inputLot: run.inputLot, root: run.root, path: run.path,
      summaryCount: run.summaryCount, lotIds: run.lotIds, warnings: run.warnings,
      errorStage: run.errorStage, errorMessage: run.errorMessage, errorStack: run.errorStack || '', hasFullCopy: run.hasBytes,
    }, null, 2);
  }

  function saveValidationZip() {
    if (!sessionRuns.length) return;
    setStatus(Lx('검증결과.zip 준비 중…', 'Đang chuẩn bị validation-result.zip…'), false);
    var zip = new JSZip();
    var summary = sessionRuns.map(function (run) {
      return {
        id: run.id, status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt,
        inputLot: run.inputLot, root: run.root,
        fileCount: run.files.length, summaryCount: run.summaryCount, lotIds: run.lotIds,
        warningCount: run.warnings.length, errorStage: run.errorStage, errorMessage: run.errorMessage,
        hasFullCopy: run.hasBytes,
      };
    });
    zip.file('session-summary.json', JSON.stringify({
      appVersion: APP_VERSION, generatedAt: new Date().toISOString(), runCount: sessionRuns.length, runs: summary,
    }, null, 2));
    zip.file('README.txt', readmeText());

    sessionRuns.forEach(function (run) {
      var folder = zip.folder('runs/' + run.id);
      folder.file('request.json', runRequestJson(run));
      folder.file('status.json', runStatusJson(run));
      folder.file('logs/analysis.jsonl', run.log.map(function (entry) { return JSON.stringify(entry); }).join('\n'));
      if (run.hasBytes) {
        var inputsFolder = folder.folder('inputs');
        run.inputFiles.forEach(function (f) { inputsFolder.file(f.name, f.bytes); });
        if (run.outputs) {
          var outputsFolder = folder.folder('outputs');
          outputsFolder.file(run.outputs.workbookName || Lx('LOT Tracker 리포트.xlsx', 'Bao cao LOT Tracker.xlsx'), run.outputs.workbookBytes);
          outputsFolder.file('trace-result.json', run.outputs.resultJson);
        }
      } else {
        folder.file('NOTE.txt', Lx(
          '이 실행은 이후 실행이 ' + KEEP_FULL_RUNS + '회 넘게 진행되어 원본 파일 사본과 결과물이 자동 삭제되었습니다.\n실행 기록(request.json / status.json / logs)은 그대로 남아 있습니다.',
          'Lần chạy này đã bị tự động xóa bản sao tệp gốc và kết quả vì có hơn ' + KEEP_FULL_RUNS + ' lần chạy sau đó.\nBản ghi lần chạy (request.json / status.json / logs) vẫn còn nguyên.'
        ));
      }
    });

    zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } }).then(function (bytes) {
      var stamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadBlob(bytes, Lx('검증결과 ', 'validation-result ') + stamp + '.zip', 'application/zip');
      setStatus(Lx('검증결과.zip을 다운로드 폴더에 저장했습니다. (실행 ', 'Đã lưu validation-result.zip vào thư mục Downloads. (') + sessionRuns.length + Lx('건)', ' lần chạy)'), false);
    }).catch(function (error) {
      setStatus(Lx('검증결과.zip 생성 오류: ', 'Lỗi khi tạo validation-result.zip: ') + error.message, true);
    });
  }
  /* ===================== [인용 끝] ===================== */

  /* ------------------------------------------------------------------
   * 파일 넣기
   * ------------------------------------------------------------------ */
  function parseBytes(bytes, name) {
    var wb = XLSX.read(bytes, { type: 'array' });
    for (var i = 0; i < wb.SheetNames.length; i++) {
      var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[i]], { header: 1, raw: true, defval: '' });
      var p = LT.parseSheetRows(rows, name);
      if (p.kind !== 'unknown') return p;
    }
    return { kind: 'unknown', fileName: name };
  }

  function addFiles(fileList) {
    if (busy) return;
    var list = Array.prototype.filter.call(fileList, function (f) { return /\.(csv|xls|xlsx)$/i.test(f.name); });
    if (!list.length) { setStatus(Lx('CSV / XLS / XLSX 파일만 넣을 수 있습니다.', 'Chỉ nhận tệp CSV / XLS / XLSX.'), true); return; }
    if (entries.size + list.length > MAX_FILES) { setStatus(Lx('최대 ', 'Chỉ được thêm tối đa ') + MAX_FILES + Lx('개까지 넣을 수 있습니다.', ' tệp.'), true); return; }
    var total = 0;
    entries.forEach(function (e) { total += e.bytes.length; });
    setBusy(true);
    setStatus(Lx('파일 읽는 중… (', 'Đang đọc tệp… (') + list.length + Lx('개)', ' tệp)'), false);
    var added = 0, replaced = 0, errors = [];
    var p = list.reduce(function (prev, file) {
      return prev.then(function () {
        if (file.size > MAX_FILE_BYTES) { errors.push(file.name + Lx(': 파일당 최대 ', ': tối đa mỗi tệp ') + fmtBytes(MAX_FILE_BYTES)); return; }
        if (total + file.size > MAX_TOTAL_BYTES) { errors.push(file.name + Lx(': 전체 용량 ', ': vượt tổng dung lượng ') + fmtBytes(MAX_TOTAL_BYTES) + Lx(' 초과', '')); return; }
        return file.arrayBuffer().then(function (buf) {
          var bytes = new Uint8Array(buf);
          var parsed;
          try { parsed = parseBytes(bytes, file.name); }
          catch (err) { parsed = { kind: 'error', fileName: file.name, error: err.message }; }
          if (entries.has(file.name)) { replaced++; total -= entries.get(file.name).bytes.length; } else added++;
          total += bytes.length;
          entries.set(file.name, { file: file, bytes: bytes, sha256: sha256Hex(bytes), parsed: parsed, override: '' });
        });
      });
    }, Promise.resolve());
    p.then(function () {
      renderFileList();
      var msg = added + Lx('개 추가', ' tệp đã thêm');
      if (replaced) msg += Lx(', ' + replaced + '개 갱신(같은 파일명)', ', ' + replaced + ' tệp cập nhật (trùng tên)');
      msg += Lx(' · 현재 총 ', ' · hiện tổng ') + entries.size + Lx('개', ' tệp');
      if ((added || replaced) && (lastResult || lastOutputs)) { invalidateResult(Lx('파일 추가/갱신', 'Thêm/cập nhật tệp')); msg += Lx(' · 입력이 바뀌어 이전 추적 결과를 지웠습니다 (다시 추적하세요)', ' · Đầu vào đã thay đổi nên đã xóa kết quả truy vết trước đó (hãy truy vết lại)'); }
      if (errors.length) msg += Lx(' · 제외: ', ' · Bỏ qua: ') + errors.join(' / ');
      setStatus(msg, errors.length > 0);
    }).catch(function (err) { setStatus(Lx('파일 읽기 오류: ', 'Lỗi đọc tệp: ') + err.message, true); })
      .then(function () { setBusy(false); });
  }

  function entryLotId(e) {
    if (e.parsed.kind === 'history') return (e.override || e.parsed.lotId || '').toUpperCase();
    if (e.parsed.kind === 'pms') return e.parsed.lotIds.join(', ');
    return '';
  }

  function refreshRefSteps() {
    var steps = {};
    entries.forEach(function (e) { if (e.parsed.kind === 'history') e.parsed.events.forEach(function (ev) { if (ev.step) steps[ev.step] = true; }); });
    var cur = els.refStep.value;
    var list = LT.sortSteps(Object.keys(steps));
    els.refStep.innerHTML = '<option value="">' + Lx('없음 — 전체 확산 추적', 'Không có — truy vết phân tán toàn bộ') + '</option>' + list.map(function (st) {
      return '<option value="' + escapeHtml(st) + '"' + (st === cur ? ' selected' : '') + '>' + escapeHtml(LT.stepLabel(st)) + '</option>';
    }).join('');
  }
  function renderFileList() {
    refreshRefSteps();
    if (!entries.size) { els.fileList.innerHTML = Lx('선택된 파일이 없습니다.', 'Chưa chọn tệp nào.'); return; }
    var total = 0, counts = { history: 0, pms: 0, other: 0 }, lotSeen = {}, dups = {};
    entries.forEach(function (e) {
      total += e.bytes.length;
      if (e.parsed.kind === 'history') {
        counts.history++;
        var id = entryLotId(e);
        if (id) { if (lotSeen[id]) dups[id] = true; lotSeen[id] = true; }
      } else if (e.parsed.kind === 'pms') counts.pms++; else counts.other++;
    });
    var rows = [];
    entries.forEach(function (e, name) {
      var p = e.parsed, kind, info = '', lot = '';
      if (p.kind === 'history') {
        kind = '<span class="kind-history">' + Lx('LOT 이력', 'Lịch sử LOT') + '</span>';
        var id = entryLotId(e);
        lot = '<input type="text" class="lot-override" data-file="' + escapeHtml(name) + '" value="' + escapeHtml(id) + '" placeholder="' + Lx('LOT ID 입력', 'Nhập LOT ID') + '">' +
          (!id ? ' <span class="kind-error">' + Lx('LOT ID 필요', 'Cần LOT ID') + '</span>' : '') + (dups[id] ? ' <span class="kind-error">' + Lx('중복', 'Trùng') + '</span>' : '');
        info = p.events.length + Lx('건', ' sự kiện') + (p.exportTime ? Lx(' · 조회 ', ' · tra cứu ') + p.exportTime : '');
      } else if (p.kind === 'pms') {
        kind = '<span class="kind-pms">PMS</span>';
        lot = escapeHtml(p.lotIds.join(', '));
        info = p.rows.length + ' Array';
      } else if (p.kind === 'error') {
        kind = '<span class="kind-error">' + Lx('읽기 오류', 'Lỗi đọc') + '</span>'; info = escapeHtml(p.error);
      } else {
        kind = '<span class="kind-unknown">' + Lx('인식 불가', 'Không nhận diện') + '</span>'; info = Lx('머리글(EVENT_NAME, DATE/TIME 또는 LOT_ID, BARCODE_SERLNO)을 찾지 못함', 'Không tìm thấy dòng tiêu đề (EVENT_NAME, DATE/TIME hoặc LOT_ID, BARCODE_SERLNO)');
      }
      rows.push('<tr><td>' + escapeHtml(name) + '</td><td>' + kind + '</td><td>' + lot + '</td><td>' + info + '</td><td>' + fmtBytes(e.bytes.length) +
        '</td><td><button type="button" class="small secondary rm-btn" data-file="' + escapeHtml(name) + '">' + Lx('빼기', 'Bỏ') + '</button></td></tr>');
    });
    els.fileList.innerHTML = '<div style="margin-bottom:6px">' + entries.size + Lx('개 파일 · LOT 이력 ', ' tệp · Lịch sử LOT ') + counts.history + ' · PMS ' + counts.pms +
      (counts.other ? Lx(' · <span class="kind-error">인식 불가 ', ' · <span class="kind-error">Không nhận diện ') + counts.other + '</span>' : '') + Lx(' · 합계 ', ' · Tổng ') + fmtBytes(total) +
      (Object.keys(dups).length ? Lx(' · <span class="kind-error">같은 LOT ID 파일이 여러 개 — 목록 아래쪽(나중에 넣은) 파일을 사용합니다</span>', ' · <span class="kind-error">Có nhiều tệp cùng LOT ID — dùng tệp ở dưới danh sách (thêm sau)</span>') : '') + '</div>' +
      '<div class="table-wrap" style="max-height:240px"><table class="files"><thead><tr><th>' + Lx('파일', 'Tệp') + '</th><th>' + Lx('종류', 'Loại') + '</th><th>LOT ID</th><th>' + Lx('내용', 'Nội dung') + '</th><th>' + Lx('크기', 'Kích thước') + '</th><th></th></tr></thead><tbody>' +
      rows.join('') + '</tbody></table></div>';
    els.fileList.querySelectorAll('.lot-override').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var e = entries.get(inp.getAttribute('data-file'));
        if (e) { e.override = inp.value.trim().toUpperCase(); renderFileList(); invalidateResult(Lx('파일 LOT ID 수정', 'Sửa LOT ID của tệp')); setBusy(busy); }
      });
    });
    els.fileList.querySelectorAll('.rm-btn').forEach(function (b) {
      b.addEventListener('click', function () { if (busy) return; var f = b.getAttribute('data-file'); entries.delete(f); renderFileList(); invalidateResult(Lx('파일 빼기: ', 'Bỏ tệp: ') + f); setBusy(false); });
    });
  }

  /* ------------------------------------------------------------------
   * 추적 실행
   * ------------------------------------------------------------------ */
  function traceClick() {
    var lot = els.lotInput.value.trim().toUpperCase();
    els.lotInput.value = lot;
    if (!lot) { setStatus(Lx('추적할 LOT ID를 입력하세요.', 'Hãy nhập LOT ID cần truy vết.'), true); els.lotInput.focus(); return; }
    if (!entries.size) { setStatus(Lx('먼저 MES 이력 파일을 넣으세요.', 'Hãy thêm tệp lịch sử MES trước.'), true); return; }
    startTrace(lot, 'TRACE_CLICK');
  }
  // reason: TRACE_CLICK(추적 실행 버튼) / LANGUAGE_SWITCH(화면 언어를 바꿔 같은 입력으로 다시 만듦 — 0.3.3)
  function startTrace(lot, reason) {
    setBusy(true);
    setStatus(lot + Lx(' 추적 중…', ' đang truy vết…'), false);
    lastResult = null; lastOutputs = null; lastMissingIds = [];
    els.resultCard.style.display = 'none';
    els.results.innerHTML = ''; els.tabs.innerHTML = ''; els.summary.innerHTML = '';
    var run = newRun();
    run.inputLot = lot;
    run.reason = reason;
    run.options = { traceForeignMerge: els.optForeign.checked, refStep: els.refStep.value, refCode: els.refCode.value.trim(), lang: LT.lang };
    run.sig = inputSignature();
    logStage(run, 'REQUEST', { inputLot: lot, fileCount: entries.size, options: run.options, reason: reason });
    setTimeout(function () { runTrace(run, lot); }, 30);
  }
  // 0.3.3: 추적하는 동안 파일·옵션이 바뀌었으면 이 결과를 화면에 쓰지 않는다 (입력은 잠가 두지만, 잠금 전후 틈이나 다른 경로를 위한 안전장치)
  function discardIfInputChanged(run) {
    if (inputSignature() === run.sig) return false;
    lastResult = null; lastOutputs = null; lastMissingIds = [];
    els.resultCard.style.display = 'none';
    els.results.innerHTML = ''; els.tabs.innerHTML = ''; els.summary.innerHTML = '';
    setStatus(run.inputLot + Lx(': 추적하는 동안 파일·옵션이 바뀌어 이 결과는 버렸습니다. 추적 실행을 다시 누르세요.', ': tệp/tùy chọn đã thay đổi trong lúc truy vết nên kết quả này đã bị bỏ. Hãy bấm Truy vết lại.'), true);
    finishRun(run, 'discarded', { errorStage: 'INPUT_CHANGED_DURING_TRACE', errorMessage: Lx('추적 시작 뒤 파일 또는 옵션(기준 공정·불량 코드·혼입 추적)이 바뀜 — 결과는 request.json 의 입력 기준', 'Tệp hoặc tùy chọn (công đoạn chuẩn · mã lỗi · truy vết trộn lẫn) đã thay đổi sau khi bắt đầu truy vết — kết quả theo đầu vào trong request.json') });
    return true;
  }

  function runTrace(run, lot) {
    try {
      var ds = new LT.FileDataSource();
      entries.forEach(function (e, name) {
        run.files.push({ name: name, size: e.bytes.length, sha256: e.sha256, kind: e.parsed.kind, lotId: entryLotId(e) });
        if (run.hasBytes) run.inputFiles.push({ name: name, bytes: e.bytes });
        logStage(run, 'FILE_USE', { file: name, size: e.bytes.length, sha256: e.sha256, kind: e.parsed.kind, lotId: entryLotId(e), rows: e.parsed.events ? e.parsed.events.length : (e.parsed.rows ? e.parsed.rows.length : 0) });
        if (e.parsed.kind === 'history' || e.parsed.kind === 'pms') ds.addParsed(e.parsed, e.override || null);
      });
      // LOT 조회를 기록하는 래퍼 — DB 연동 시에도 같은 방식으로 조회 기록이 남는다.
      var logged = {
        getLotHistory: function (id) {
          return ds.getLotHistory(id).then(function (h) {
            logStage(run, 'LOT_QUERY', { lot: id, found: !!h, events: h ? h.events.length : 0, source: h ? h.source : '' });
            return h;
          });
        },
        getPmsByRunId: function (id) {
          return ds.getPmsByRunId(id).then(function (r) { logStage(run, 'PMS_QUERY', { runId: id, rows: r ? r.length : 0 }); return r; });
        },
        hasLot: function (id) { return ds.hasLot(id); },
        listLots: function () { return ds.listLots(); },
        describe: function () { return ds.describe(); }
      };
      logStage(run, 'TRACE_START', { inputLot: lot, loadedLots: ds.listLots().length, pmsRows: ds.pmsRows.length });
      LT.trace(logged, lot, run.options).then(function (res) {
        logStage(run, 'TRACE_RESULT', {
          root: res.root, rootConfirmed: res.rootConfirmed, path: res.path, familyCount: res.family.length, spreadCount: (res.spreadList || []).length,
          refStep: res.refStep || '', refNote: res.refNote || '',
          refSummary: res.ref && res.ref.summary ? { tested: res.ref.summary.tested, pending: res.ref.summary.pending, unknown: res.ref.summary.unknown, missPre: res.ref.summary.missPre.map(function (x) { return x.id; }) } : null,
          runidSummary: res.runidSummary ? { total: res.runidSummary.total, smtLoss: res.runidSummary.smtLoss, scrap: res.runidSummary.scrap, other: res.runidSummary.other, known: res.runidSummary.known, unknown: res.runidSummary.unknown, openLots: res.runidSummary.missingHolders.length, balanced: res.runidSummary.balanced, imbalance: res.runidSummary.imbalance } : null,
          loadedFamily: res.family.filter(function (id) { return res.lots[id]; }).length,
          missing: res.missing.map(function (m) { return m.id + ':' + m.levelText; }),
          checks: res.checks.map(function (c) { return c.level + ':' + c.item; })
        });
        if (!res.top) {
          if (discardIfInputChanged(run)) return;
          lastResult = res;
          renderResult(res, null);
          setStatus(lot + Lx(': 추적 시작점을 찾지 못했습니다. 이 LOT의 이력 파일을 넣어 주세요.', ': không tìm thấy điểm bắt đầu truy vết. Hãy thêm tệp lịch sử của LOT này.'), true);
          // 0.3.2: 리포트를 만들지 못한 실행은 status.json 에 error 로 기록 (이전에는 success 로 기록됐음)
          finishRun(run, 'error', { summaryCount: 0, lotIds: [], warnings: [Lx('추적 시작점 없음', 'Không có điểm bắt đầu truy vết')], errorStage: 'INPUT_LOT_NOT_FOUND',
            errorMessage: lot + Lx(' 이력 파일이 없고, 불러온 다른 이력에서도 이 LOT의 분할 기록을 찾지 못해 리포트를 만들지 못했습니다.', ' không có tệp lịch sử, và cũng không tìm thấy bản ghi tách LOT này trong các lịch sử khác đã tải — không tạo được báo cáo.') });
          return;
        }
        logStage(run, 'BUILD_REPORT');
        var wb = LT.buildWorkbook(res, XLSX, { appLabel: Lx('LOT Tracker v', 'LOT Tracker truy vết phả hệ v') + APP_VERSION, generatedAt: new Date().toLocaleString(Lx('ko-KR', 'vi-VN')) });
        var raw = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
        return LT.finalizeXlsx(raw, JSZip, wb.LT_FREEZE).then(function (bytes) {
          var name = 'LOT Tracker ' + lot + ' ' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.xlsx';
          var outputs = { workbookBytes: bytes, workbookName: name, resultJson: JSON.stringify(LT.serializeResult(res), null, 2) };
          if (run.hasBytes) run.outputs = outputs;
          if (discardIfInputChanged(run)) return;
          lastResult = res; lastOutputs = outputs;
          lastMissingIds = res.missing.filter(function (m) { return m.level <= 2; }).map(function (m) { return m.id; });
          renderResult(res, wb);
          var warn = res.checks.filter(function (c) { return c.level === 'WARN' || c.level === 'FAIL'; });
          var need1 = res.missing.filter(function (m) { return m.level === 1 && (m.kinds.indexOf(Lx('역추적', 'truy ngược')) >= 0 || m.kinds.indexOf(Lx('전개', 'triển khai')) >= 0); });
          var needS = res.missing.filter(function (m) { return m.level === 1 && need1.indexOf(m) < 0; });
          var line = lot + Lx(' 추적 완료 · RUNID ', ' truy vết xong · RUNID ') + (res.root || Lx('미확인', 'Chưa xác định')) + Lx(' · 계보 LOT ', ' · LOT phả hệ ') + res.family.length + Lx('개 · 확산 LOT ', ' · LOT phân tán ') + (res.spreadList || []).length + Lx('개', '');
          if (need1.length) line += Lx(' · 필수(역추적·전개) ', ' · Bắt buộc(truy ngược·triển khai) ') + need1.length + Lx('개', '');
          if (needS.length) line += Lx(' · ', ' · ') + (res.ref ? Lx('필수(' + res.ref.step + ' 이력) ', 'Bắt buộc(lịch sử ' + res.ref.step + ') ') : Lx('필수(확산) ', 'Bắt buộc(phân tán) ')) + needS.length + Lx('개', '');
          if (res.ref) line += Lx(' · 기준 공정 ', ' · Công đoạn chuẩn ') + res.ref.step;
          if (warn.length) line += Lx(' · 검증 경고 ', ' · Cảnh báo kiểm tra ') + warn.length + Lx('건', '');
          setStatus(line, !!need1.length);
          run.root = res.root || ''; run.path = res.path;
          finishRun(run, 'success', {
            summaryCount: res.family.length + (res.spreadList || []).length, lotIds: res.family.concat(res.spreadList || []),
            warnings: warn.map(function (c) { return c.level + ' ' + c.item + ': ' + c.detail; }).concat(res.notes)
          });
        });
      }).catch(function (error) {
        setStatus(Lx('오류: ', 'Lỗi: ') + error.message, true);
        finishRun(run, 'error', { errorStage: run.log.length ? run.log[run.log.length - 1].stage : 'UNKNOWN', errorMessage: error.message, errorStack: error.stack || '' });
      }).then(function () { setBusy(false); });
    } catch (error) {
      setStatus(Lx('오류: ', 'Lỗi: ') + error.message, true);
      finishRun(run, 'error', { errorStage: 'RUNTRACE', errorMessage: error.message, errorStack: error.stack || '' });
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------------
   * 결과 표시
   * ------------------------------------------------------------------ */
  function fmtCell(v, pct) {
    if (v === '' || v === null || v === undefined) return '';
    if (pct && typeof v === 'number') return (v * 100).toFixed(2) + '%';
    return v;
  }

  function gridHtml(g) {
    var h1 = [], h2 = [], i = 0;
    while (i < g.cols.length) {
      var j = i;
      while (j + 1 < g.cols.length && g.cols[j + 1].h1 === g.cols[i].h1) j++;
      h1.push('<th colspan="' + (j - i + 1) + '"' + (i === 0 ? ' class="c-rowlot"' : g.cols[i].ref ? ' class="ref1"' : '') + '>' + escapeHtml(g.cols[i].h1) + '</th>');
      i = j + 1;
    }
    g.cols.forEach(function (c, k) { h2.push('<th' + (k === 0 ? ' class="c-rowlot"' : c.ref ? ' class="ref2"' : '') + '>' + escapeHtml(c.h2) + '</th>'); });
    var body = g.cells.map(function (row) {
      var tag = row[0] && row[0].row ? ' class="r-' + row[0].row + '"' : '';
      return '<tr' + tag + '>' + row.map(function (cell, k) {
        var col = g.cols[k], cls = [];
        if (k === 0) cls.push('c-rowlot');
        if (col.kind === 'mut') cls.push('k-mut');
        (cell.f || '').split(' ').forEach(function (f) { if (f) cls.push(f); });
        if (typeof cell.v === 'number') cls.push('num');
        if ((cell.f || '').indexOf('fail') >= 0 && (cell.v === 0 || cell.v === '')) cls = cls.filter(function (c) { return c !== 'fail'; });
        var ind = cell.indent ? ' style="padding-left:' + (6 + cell.indent * 14) + 'px"' : '';
        return '<td' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + ind + '>' + escapeHtml(fmtCell(cell.v, (cell.f || '').indexOf('pct') >= 0)) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<p class="legend"><b>' + escapeHtml(g.info || '') + '</b></p><p class="legend"><span style="background:var(--path)">' + Lx('노란 행', 'Hàng vàng') + '</span>' + Lx('입력 LOT → RUNID 경로 ', 'Đường LOT đầu vào → RUNID ') + '<span style="background:var(--input)">' + Lx('주황 행', 'Hàng cam') + '</span>' + Lx('입력 LOT ', 'LOT đầu vào ') +
      '<span style="background:var(--spread)">' + Lx('보라 행', 'Hàng tím') + '</span>' + Lx('RUNID 제품이 흘러 들어간 외부 LOT(확산) · ', 'LOT bên ngoài nhận sản phẩm RUNID (phân tán) · ') +
      Lx('SPLIT=분할 · MERGE +n=병합 유입 / −n=병합 반출 · PARENT=그 공정 변경 후 남은 수량 · ↳=윗 LOT의 병합 기록 행 · RUNID 포함=그 LOT에 있을 수 있는 RUNID 제품 최소~최대', 'SPLIT=tách · MERGE +n=gộp vào / −n=gộp ra · PARENT=số lượng còn lại sau khi công đoạn đó thay đổi · ↳=dòng ghi gộp của LOT phía trên · RUNID có thể chứa=khoảng tối thiểu~tối đa sản phẩm RUNID có thể có trong LOT đó') + '</p>' +
      '<div class="table-wrap" style="max-height:620px"><table class="grid"><thead><tr class="h1">' + h1.join('') + '</tr><tr class="h2">' + h2.join('') +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function lvClass(v) {
    var t = String(v);
    return t.indexOf(Lx('필수', 'Bắt buộc')) === 0 ? 'lv-필수' : t.indexOf(Lx('권장', 'Khuyến nghị')) === 0 ? 'lv-권장' : t.indexOf(Lx('선택', 'Tùy chọn')) === 0 ? 'lv-선택' : 'lv-' + t;
  }
  function sheetHtml(sh, res) {
    var pre = sh.pre ? '<table class="pre">' + sh.pre.map(function (kv, i) {
      return '<tr><th>' + escapeHtml(kv[0]) + '</th><td' + (i === 4 ? ' class="lv-FAIL"' : '') + '>' + escapeHtml(kv[1]) + '</td></tr>';
    }).join('') + '</table>' : '';
    var head = '<tr>' + sh.header.map(function (h) { return '<th>' + escapeHtml(h) + '</th>'; }).join('') + '</tr>';
    var body = sh.rows.map(function (r) {
      var tag = '';
      if (sh.lotCol !== undefined) {
        var id = r[sh.lotCol];
        tag = id === res.input ? ' style="background:var(--input)"' : (res.pathSet && res.pathSet[id] ? ' style="background:var(--path)"' : (res.spread && res.spread[id] ? ' style="background:var(--spread)"' : ''));
      }
      return '<tr' + tag + '>' + r.map(function (v, c) {
        var cls = '';
        if (sh.levelCol === c) cls = ' class="lv-' + v + '"';
        if (sh.name === Lx('추가 필요 LOT', 'LOT cần bổ sung') && c === 1) cls = ' class="' + lvClass(v) + '"';
        if (sh.actCol === c) cls = /필수|미확인|Bắt buộc|chưa xác/.test(String(v)) ? ' class="lv-필수"' : /봉쇄|HOLD/.test(String(v)) ? ' class="lv-권장"' : '';
        var pct = sh.pctCols && sh.pctCols.indexOf(c) >= 0;
        return '<td' + cls + '>' + escapeHtml(fmtCell(v, pct)) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return (sh.note ? '<p class="muted">' + escapeHtml(sh.note) + '</p>' : '') + pre +
      '<div class="table-wrap"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  }

  /* 엑셀 LOT Tracer의 행·공정 배치를 그대로 읽는 간단한 계보 표. */
  function lineageHtml(g) {
    var groups = [], byStep = {};
    g.cols.forEach(function (col, index) {
      if (!col.step || (col.kind !== 'mut' && col.kind !== 'run')) return;
      var group = byStep[col.step];
      if (!group) {
        group = { step: col.step, mut: null, run: null, ref: !!col.ref };
        byStep[col.step] = group;
        groups.push(group);
      }
      if (col.kind === 'mut' && col.part === 'm') group.mut = index;
      if (col.kind === 'run' && col.part === 'eqp') group.run = index;
    });
    function value(row, index) { return index === null || !row[index] ? '' : row[index].v; }
    function hasValue(v) { return v !== '' && v !== null && v !== undefined; }
    function processCell(row, group) {
      var lines = [];
      if (group.mut !== null) {
        var type = value(row, group.mut), lot = value(row, group.mut + 1), qty = value(row, group.mut + 2);
        if (hasValue(type) || hasValue(lot) || hasValue(qty)) {
          var mutation = '<strong>' + escapeHtml(type) + '</strong>';
          if (hasValue(lot) && lot !== value(row, 0)) mutation += ' ' + escapeHtml(lot);
          if (hasValue(qty)) mutation += ' <span class="lin-qty">' + escapeHtml(qty) + ' ea</span>';
          lines.push('<span class="lin-mutation">' + mutation + '</span>');
        }
      }
      if (group.run !== null) {
        var eqp = value(row, group.run), input = value(row, group.run + 1), output = value(row, group.run + 2);
        var scrap = value(row, group.run + 3), fail = value(row, group.run + 4);
        if (hasValue(eqp) || hasValue(input) || hasValue(output) || hasValue(scrap) || hasValue(fail)) {
          var run = [];
          if (hasValue(eqp)) run.push(escapeHtml(eqp));
          if (hasValue(input)) run.push('IN ' + escapeHtml(input));
          if (hasValue(output)) run.push('OUT ' + escapeHtml(output));
          if (hasValue(fail) && Number(fail) !== 0) run.push('FAIL ' + escapeHtml(fail));
          if (hasValue(scrap)) run.push(escapeHtml(scrap).replace(/\n/g, '<br>'));
          lines.push('<span class="lin-run">' + run.join(' · ') + '</span>');
        }
      }
      return '<td>' + lines.join('') + '</td>';
    }
    var statusIndex = g.cols.findIndex(function (col) { return col.kind === 'status'; });
    var body = g.cells.map(function (row) {
      var visible = row.slice(0, 2).some(function (cell) { return hasValue(cell.v); }) || groups.some(function (group) {
        return (group.mut !== null && (hasValue(value(row, group.mut)) || hasValue(value(row, group.mut + 1)) || hasValue(value(row, group.mut + 2)))) ||
          (group.run !== null && (hasValue(value(row, group.run)) || hasValue(value(row, group.run + 1)) || hasValue(value(row, group.run + 2)) || hasValue(value(row, group.run + 3)) || hasValue(value(row, group.run + 4))));
      });
      if (!visible) return '';
      var lot = value(row, 0), parent = value(row, 1), depth = Math.max(0, Math.min(8, Number(row[0].indent) || 0));
      var rowClass = row[0].row === 'input' ? ' class="r-input"' : '';
      var lotHtml = hasValue(lot) ? '<span class="lin-lot-name">' + escapeHtml(lot) + '</span>' : '';
      var statusCell = statusIndex < 0 ? null : row[statusIndex + 2];
      if (statusCell && /\bnofile\b/.test(statusCell.f || '')) lotHtml += '<span class="lin-missing">' + Lx('이력 없음', 'Thiếu lịch sử') + '</span>';
      var parentHtml = hasValue(parent) ? '<span class="lin-parent">' + Lx('상위 ', 'Cha ') + escapeHtml(parent) + '</span>' : '';
      return '<tr' + rowClass + '><th scope="row" style="padding-left:' + (12 + depth * 14) + 'px">' + lotHtml + parentHtml + '</th>' +
        groups.map(function (group) { return processCell(row, group); }).join('') + '</tr>';
    }).join('');
    var head = groups.map(function (group) { return '<th scope="col"' + (group.ref ? ' class="lin-ref"' : '') + '>' + escapeHtml(group.step) + '</th>'; }).join('');
    return '<p class="lineage-note">' + Lx('LOT 행을 공정별 열로 정리했습니다. 빈 칸은 기록이 없거나 이력이 없어 확인되지 않은 곳입니다. PARENT는 변경 후 잔량, MERGE +/−는 유입/반출입니다.', 'Các dòng LOT được sắp theo cột công đoạn. Ô trống là không có bản ghi hoặc thiếu lịch sử để xác nhận. PARENT là số lượng còn lại; MERGE +/− là nhập/xuất.') + '</p>' +
      '<div class="table-wrap lineage-wrap" role="region" aria-label="' + Lx('공정별 계보도', 'Phả hệ theo công đoạn') + '" tabindex="0">' +
      '<table class="lineage-grid"><thead><tr><th scope="col">LOT</th>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  /* 공정 위치 축의 동적 SPLIT/MERGE 계보도. 표는 접힌 보조 보기로 남긴다. */
  function lineageDiagramHtml(res, g) {
    var view = LT.buildProcessLineage(res), tree = view.tree;
    var real = tree.nodes.filter(function (n) { return !n.link; });
    if (!real.length) return lineageHtml(g);
    var cols = view.steps.slice(), byKey = {}, byId = {}, nodes = [], edges = [], edgeSet = {};
    function stage(s) {
      s = String(s || '').trim().toUpperCase();
      return !s ? '?' : (s === 'SMT' || LT.CONFIG.smtSteps.indexOf(s) >= 0 ? 'SMT' : s);
    }
    function addEdge(from, to, rel, step, qty, extra) {
      if (!from || !to || from === to) return;
      var id = from + '>' + to + '>' + rel + '>' + step + '>' + qty;
      if (edgeSet[id]) return;
      edgeSet[id] = true;
      edges.push({ from: from, to: to, rel: rel || '', step: step || '', qty: qty, extra: extra || '' });
    }
    tree.nodes.forEach(function (n) { byKey[n.key] = n; if (!n.link && !byId[n.id]) byId[n.id] = n; });
    tree.nodes.forEach(function (n) {
      if (n.link) {
        var target = byId[n.id];
        if (target && n.parentKey) addEdge(n.parentKey, target.key, n.rel, n.step, n.qty, n.note || '');
      } else if (n.parentKey) addEdge(n.parentKey, n.key, n.rel, n.step, n.qty, '');
    });
    var foreignById = {};
    real.forEach(function (n) {
      var L = res.lots[n.id];
      var hostInfo = res.smt && res.smt.hostInfo && res.smt.hostInfo[n.id];
      var spreadInfo = res.spread && res.spread[n.id];
      (L && L.events || []).forEach(function (e, eventIndex) {
        if (e.kind !== 'MERGE_IN' || !e.chgVals || res.familySet[e.chgVals]) return;
        // Fully absorbed SMT Arrays are already represented by the shared RUNID
        // and Array-merge host. Do not recreate them as foreign LOT nodes.
        if (hostInfo && eventIndex <= hostInfo.collapseIdx && res.smt.arrayMerge &&
            res.smt.arrayMerge[e.chgVals] === n.id) return;
        // A spread LOT belongs to this genealogy only after RUNID entry.
        if (spreadInfo && e.ts < spreadInfo.entryTs) return;
        var source = byId[e.chgVals];
        if (!source) {
          source = foreignById[e.chgVals];
          if (!source) {
            var composition = res.comp && res.comp[e.chgVals] || {};
            var hasOtherRun = Object.keys(composition).some(function (run) { return run !== res.runLabel && composition[run] && composition[run][1] > 0; });
            source = foreignById[e.chgVals] = { key: 'foreign-' + Object.keys(foreignById).length, id: e.chgVals,
              rel: Lx('혼입 유입', 'LOT gộp vào'), step: e.step || '', qty: e.chgQty, time: e.time || '',
              loaded: !!res.lots[e.chgVals], spread: true, input: false, link: false, foreign: true,
              runInfo: hasOtherRun ? Lx('다른 RUNID 포함', 'Có RUNID khác') : Lx('RUNID 미확인', 'RUNID chưa xác nhận'), children: [] };
            real.push(source);
          }
        }
        addEdge(source.key, n.key, 'MERGE', e.step, e.chgQty, Lx('RUNID 미확인', 'RUNID chưa xác nhận'));
      });
    });
    var colW = 210, left = 16, top = 56, rowH = 94, boxW = 180, boxH = 60;
    real.forEach(function (n, i) {
      var visits = view.visits[n.key] || [];
      var raw = n.step || (visits[0] && visits[0].step) || n.curStep || '';
      var s = stage(raw), ci = cols.indexOf(s);
      if (ci < 0) { cols.push(s); ci = cols.length - 1; }
      n._x = left + ci * colW + (colW - boxW) / 2;
      n._y = top + i * rowH;
      n._stage = s;
      n._visits = visits;
    });
    var width = left * 2 + cols.length * colW;
    var height = top + Math.max(real.length, 1) * rowH + 18;
    function edgeSvg(e) {
      var a = byKey[e.from] || real.filter(function (n) { return n.key === e.from; })[0];
      var b = byKey[e.to] || real.filter(function (n) { return n.key === e.to; })[0];
      if (!a || !b || a._x === undefined || b._x === undefined) return '';
      var x1 = a._x + boxW, y1 = a._y + boxH / 2, x2 = b._x, y2 = b._y + boxH / 2;
      var mid = (x1 + x2) / 2, back = x2 <= x1;
      var path = back ? 'M' + x1 + ' ' + y1 + ' C' + (x1 + 42) + ' ' + (y1 - 42) + ' ' + (x2 - 42) + ' ' + (y2 - 42) + ' ' + x2 + ' ' + y2 : 'M' + x1 + ' ' + y1 + ' H' + mid + ' V' + y2 + ' H' + x2;
      var label = [e.rel, e.step, e.qty !== undefined && e.qty !== null && e.qty !== '' ? e.qty + ' ea' : ''].filter(Boolean).join(' · ');
      return '<g class="trace-edge' + (e.extra ? ' trace-edge-foreign' : '') + (back ? ' trace-edge-back' : '') + '" data-from="' + escapeHtml(e.from) + '" data-to="' + escapeHtml(e.to) + '"><title>' + escapeHtml(label + (e.extra ? ' · ' + e.extra : '')) + '</title><path d="' + path + '" marker-end="url(#trace-arrow)"/><text x="' + mid + '" y="' + ((y1 + y2) / 2 - 5) + '" text-anchor="middle">' + escapeHtml(label) + '</text></g>';
    }
    var axes = cols.map(function (s, i) {
      return '<text class="trace-axis" x="' + (left + i * colW + colW / 2) + '" y="28" text-anchor="middle">' + escapeHtml(s === '?' ? Lx('공정 미확인', 'Công đoạn chưa rõ') : LT.stepLabel(s)) + '</text>';
    }).join('');
    var edgeMarkup = edges.map(edgeSvg).join('');
    var nodeMarkup = real.map(function (n) {
      var runs = (n._visits || []).filter(function (v) { return v.runs; }).map(function (v) { return v.eqps.join(', '); }).filter(Boolean);
      var sub = n.foreign ? Lx('외부 LOT · ', 'LOT ngoài · ') + n.runInfo :
        [n._stage, runs.join(', ')].filter(Boolean).join(' · ');
      if (n.qty !== undefined && n.qty !== null && n.qty !== '') sub += (sub ? ' · ' : '') + n.qty + ' ea';
      var cls = 'trace-node' + (n.input ? ' is-input' : '') + (n.spread ? ' is-spread' : '') + (n.foreign ? ' is-foreign' : '') + (!n.loaded ? ' is-missing' : '');
      var title = n.id + (sub ? ' · ' + sub : '') + (n.status ? ' · ' + n.status : '');
      return '<g class="' + cls + '" data-node="' + escapeHtml(n.key) + '" tabindex="0" role="button" aria-label="' + escapeHtml(title) + '"><title>' + escapeHtml(title) + '</title><rect class="trace-node-box" x="' + n._x + '" y="' + n._y + '" width="' + boxW + '" height="' + boxH + '" rx="11"/><text class="trace-node-id" x="' + (n._x + 10) + '" y="' + (n._y + 23) + '">' + escapeHtml(n.label || n.id) + (n.input ? ' ★' : '') + '</text><text class="trace-node-sub" x="' + (n._x + 10) + '" y="' + (n._y + 44) + '">' + escapeHtml(sub || n.status || '') + '</text></g>';
    }).join('');
    var hint = Lx('공정 위치 순으로 배치했습니다. LOT를 선택하면 해당 LOT의 앞뒤 연결을 강조합니다. 혼입 LOT은 별도 상자와 MERGE 선으로 표시하며 RUNID 구성은 확인 필요로 남깁니다.', 'Sắp theo vị trí công đoạn. Chọn LOT để làm nổi bật liên kết trước và sau. LOT gộp vào hiển thị riêng; RUNID chưa xác nhận.');
    return '<div class="lineage-diagram"><p class="lineage-note">' + hint + '</p><div class="lineage-svg-scroll" role="region" aria-label="' + Lx('공정별 계보 흐름도', 'Sơ đồ phả hệ theo công đoạn') + '" tabindex="0"><svg class="lineage-svg" xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" role="group"><defs><marker id="trace-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 1 L 8 5 L 0 9"/></marker></defs><g class="trace-axes">' + axes + '</g><g class="trace-edges">' + edgeMarkup + '</g><g class="trace-nodes">' + nodeMarkup + '</g></svg></div><p class="lineage-selection" aria-live="polite">' + Lx('LOT를 선택하면 계보 경로를 강조합니다.', 'Chọn LOT để làm nổi bật đường phả hệ.') + '</p><details class="lineage-table-details"><summary>' + Lx('표로 보기', 'Xem dạng bảng') + '</summary>' + lineageHtml(g) + '</details></div>';
  }

  function bindLineageDiagram() {
    var svg = els.results.querySelector('.lineage-svg');
    if (!svg) return;
    var edges = Array.prototype.slice.call(svg.querySelectorAll('.trace-edge'));
    var selected = null;
    function paint(key) {
      selected = key;
      var connected = {}, activeEdges = {};
      if (key) {
        var queue = [key]; connected[key] = true;
        while (queue.length) {
          var cur = queue.shift();
          edges.forEach(function (edge) {
            var from = edge.getAttribute('data-from'), to = edge.getAttribute('data-to');
            if (to === cur && !activeEdges[edge]) { activeEdges[edge] = true; if (!connected[from]) { connected[from] = true; queue.push(from); } }
          });
        }
        queue = [key];
        while (queue.length) {
          var cur2 = queue.shift();
          edges.forEach(function (edge) {
            var from2 = edge.getAttribute('data-from'), to2 = edge.getAttribute('data-to');
            if (from2 === cur2 && !activeEdges[edge]) { activeEdges[edge] = true; if (!connected[to2]) { connected[to2] = true; queue.push(to2); } }
          });
        }
      }
      svg.querySelectorAll('.trace-node').forEach(function (node) {
        node.classList.toggle('is-dim', !!key && !connected[node.getAttribute('data-node')]);
        node.classList.toggle('is-selected', node.getAttribute('data-node') === key);
      });
      edges.forEach(function (edge) {
        edge.classList.toggle('is-dim', !!key && !activeEdges[edge]);
        edge.classList.toggle('is-active', !!key && !!activeEdges[edge]);
      });
      var label = key ? svg.querySelector('[data-node="' + key + '"] .trace-node-id').textContent : '';
      var live = els.results.querySelector('.lineage-selection');
      if (live) live.textContent = key ? Lx('선택 LOT: ', 'LOT đã chọn: ') + label : Lx('전체 계보를 표시합니다.', 'Hiển thị toàn bộ phả hệ.');
    }
    svg.addEventListener('click', function (event) {
      var node = event.target.closest && event.target.closest('.trace-node');
      paint(node ? node.getAttribute('data-node') : null);
    });
    svg.addEventListener('keydown', function (event) {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.classList.contains('trace-node')) { event.preventDefault(); paint(event.target.getAttribute('data-node')); }
    });
    var input = svg.querySelector('.trace-node.is-input');
    if (input) paint(input.getAttribute('data-node'));
  }

  function renderResult(res, wb) {
    els.resultCard.style.display = '';
    var fail = 0, codes = {};
    res.family.forEach(function (id) {
      var L = res.lots[id];
      if (L) L.scraps.forEach(function (s) { fail += s.qty; codes[s.code] = (codes[s.code] || 0) + s.qty; });
    });
    var chk = { PASS: 0, WARN: 0, FAIL: 0 };
    res.checks.forEach(function (c) { if (chk[c.level] !== undefined) chk[c.level]++; });
    var miss = { 1: 0, 2: 0, 3: 0 }, missPath = [], missSpread = [];
    res.missing.forEach(function (m) {
      miss[m.level]++;
      if (m.level === 1 && (m.kinds.indexOf(Lx('역추적', 'truy ngược')) >= 0 || m.kinds.indexOf(Lx('전개', 'triển khai')) >= 0)) missPath.push(m);
      else if (m.level === 1) missSpread.push(m);
    });
    var S = res.runidSummary, rt = LT.rangeText;
    var loaded = res.family.filter(function (id) { return res.lots[id]; }).length;
    var stat = function (k, v) { return '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>'; };
    var html = '<div class="path">' + Lx('추적 경로: ', 'Đường truy vết: ') + res.path.map(function (p, i) {
      return (i === 0 ? '<b>' : '') + escapeHtml(p) + (i === 0 ? '</b>' : '');
    }).join(' → ') + (res.root && res.rootConfirmed ? ' <span class="lv-PASS">' + Lx('(RUNID 확정: 투입 이벤트 확인)', '(RUNID chắc chắn: đã xác nhận sự kiện đầu vào)') + '</span>' : res.root ? ' <span class="lv-WARN">' + Lx('(RUNID 추정)', '(RUNID ước tính)') + '</span>' : ' <span class="lv-FAIL">' + Lx('(RUNID 미도달)', '(chưa truy đến RUNID)') + '</span>') + '</div>';
    html += '<div class="summary">' +
      stat('SMT RUNID', escapeHtml(res.root || Lx('미확인', 'Chưa xác định'))) +
      stat(Lx('계보 LOT', 'LOT phả hệ'), res.family.length + Lx('개 <span class="muted">(이력 있음 ', ' <span class="muted">(có lịch sử ') + loaded + ')</span>') +
      stat(Lx('불량 합계 (계보)', 'Tổng lỗi (phả hệ)'), fail + 'ea' + (fail ? ' <span class="muted">' + escapeHtml(Object.keys(codes).map(function (c) { return c + '×' + codes[c]; }).join(', ')) + '</span>' : '')) +
      stat(Lx('검증', 'Kiểm tra'), '<span class="lv-PASS">PASS ' + chk.PASS + '</span> · <span class="lv-WARN">WARN ' + chk.WARN + '</span> · <span class="lv-FAIL">FAIL ' + chk.FAIL + '</span>') +
      (res.ref && res.ref.summary ? stat(res.ref.step + Lx(' 기준 (', ' chuẩn (') + res.ref.summary.total + 'ea)', Lx('확인 ', 'Đã xác nhận ') + rt(res.ref.summary.tested) + Lx(' · 미진행 ', ' · chưa qua ') + rt(res.ref.summary.pending) +
        '<br><span class="' + (res.ref.summary.missPre.length ? 'lv-FAIL' : 'lv-PASS') + '">' + Lx('이력 미확인 ', 'Chưa xác nhận lịch sử ') + rt(res.ref.summary.unknown) + 'ea</span>') : '') +
      (S ? stat(Lx('RUNID 제품 위치 (', 'Vị trí sản phẩm RUNID (') + S.total + 'ea)', Lx('확인 ', 'Đã xác nhận ') + rt(S.known) + Lx(' · 불량 ', ' · lỗi ') + rt(S.scrap) + (S.smtLoss === null ? Lx(' · SMT 감소 미확인', ' · Hao hụt SMT chưa rõ') : '') + '<br><span class="' + (S.missingHolders.length || !S.balanced ? 'lv-FAIL' : 'lv-PASS') + '">' + Lx('미확정 ', 'Chưa xác định ') + rt(S.unknown) + 'ea' + (S.balanced ? '' : Lx(' · 수지 불일치 ', ' · không cân đối ') + Math.abs(S.imbalance) + 'ea') + '</span>') : '') +
      stat(Lx('추가 필요 LOT', 'LOT cần bổ sung'), '<span class="lv-필수">' + Lx('필수 ', 'Bắt buộc ') + miss[1] + '</span> · <span class="lv-권장">' + Lx('권장 ', 'Khuyến nghị ') + miss[2] + '</span> · <span class="lv-선택">' + Lx('선택 ', 'Tùy chọn ') + miss[3] + '</span>') +
      '</div>';
    if (missPath.length) {
      html += '<div class="card warn"><b>' + Lx('추적을 이어가려면 아래 LOT 이력이 꼭 필요합니다 (역추적·전개).', 'Cần lịch sử các LOT dưới đây thì mới truy vết tiếp được (truy ngược·triển khai).') + '</b> ' + Lx('MES에서 LOT 이력을 xls로 저장해 상단에 추가한 뒤 다시 추적하세요.', 'Hãy lưu lịch sử LOT từ MES ra xls, thêm tệp ở trên rồi truy vết lại.') + '<br>' +
        missPath.map(function (m) { return '<b>' + escapeHtml(m.id) + '</b> — ' + escapeHtml(m.reasons.join(' / ')); }).join('<br>') + '</div>';
    }
    if (res.refNote) html += '<p class="muted">' + Lx('기준 공정: ', 'Công đoạn chuẩn: ') + escapeHtml(res.refNote) + '</p>';
    if (res.ref && res.ref.summary && res.ref.summary.pendingLots.length) {
      html += '<div class="card warn"><b>' + res.ref.step + Lx(' 미진행 LOT — 봉쇄 우선:', ' chưa qua — ưu tiên HOLD:') + '</b> ' + res.ref.summary.pendingLots.map(function (x) {
        return '<b>' + escapeHtml(x.id) + '</b> (' + x.qty + Lx('ea, RUNID 제품 ', 'ea, sản phẩm RUNID ') + rt(x.range) + 'ea)';
      }).join(', ') + Lx(' — 아직 ', ' — vẫn còn sản phẩm RUNID chưa qua ') + res.ref.step + Lx('를 받지 않은 RUNID 제품이 들어 있습니다.', '.') + '</div>';
    }
    if (missSpread.length && res.ref) {
      var recS = res.missing.filter(function (m) { return m.levelText === Lx('권장(출하 확인)', 'Khuyến nghị(kiểm tra xuất hàng)'); });
      html += '<div class="card warn"><b>' + res.ref.step + Lx(' 이력이 필요한 LOT ', ' cần lịch sử LOT ') + missSpread.length + Lx('개 (필수).', ' (bắt buộc).') + '</b> ' + Lx('이 LOT들에 ', 'Các LOT này chứa ') + res.ref.step + Lx(' 전 RUNID 제품 ', ' trước sản phẩm RUNID ') +
        (res.ref.summary ? rt(res.ref.summary.unknown) : '') + Lx('ea가 들어갔습니다. MES 이력을 추가해 다시 추적하세요.', 'ea. Hãy thêm lịch sử MES rồi truy vết lại.') + '<br>' +
        missSpread.map(function (m) { return '<b>' + escapeHtml(m.id) + '</b> — ' + escapeHtml(m.reasons[m.reasons.length - 1]); }).join('<br>') +
        (recS.length ? '<br><span class="muted">' + res.ref.step + Lx(' 이후에 나뉜 LOT ', ' sau đó tách ra LOT ') + recS.length + Lx('개는 권장(출하 확인)입니다: ', ' — khuyến nghị (kiểm tra xuất hàng): ') + recS.map(function (m) { return escapeHtml(m.id); }).join(', ') + '</span>' : '') + '</div>';
    } else if (missSpread.length) {
      html += '<div class="card warn"><b>' + Lx('RUNID 제품이 흘러 들어간 LOT ', 'LOT nhận sản phẩm RUNID ') + missSpread.length + Lx('개의 이력이 없습니다 (확산).', ' không có lịch sử (phân tán).') + '</b> ' +
        (S ? Lx('RUNID 제품 ', 'Sản phẩm RUNID ') + rt(S.unknown) + Lx('ea의 현재 위치가 미확정입니다. ', 'ea hiện chưa xác định vị trí. ') : '') +
        Lx('원자재 이슈 봉쇄 범위를 확정하려면 이 LOT들의 이력을 추가해 다시 추적하세요 (자세한 내용은 "RUNID 확산" 탭).', 'Để chốt phạm vi HOLD nguyên vật liệu, hãy thêm lịch sử các LOT này rồi truy vết lại (xem chi tiết ở tab "Phân tán RUNID").') + '<br>' +
        '<span class="muted">' + missSpread.map(function (m) { return escapeHtml(m.id); }).join(', ') + '</span></div>';
    }
    if (res.notes.length) html += '<p class="muted">' + res.notes.map(escapeHtml).join('<br>') + '</p>';
    els.summary.innerHTML = html;

    if (!wb) { els.tabs.innerHTML = ''; els.results.innerHTML = ''; setBusy(busy); return; }
    var g = LT.buildTracerGrid(res);
    var sheets = LT.buildSheets(res);
    var tabs = [{ name: Lx('계보도', 'Phả hệ'), html: lineageDiagramHtml(res, g) }, { name: 'LOT Tracer', html: gridHtml(g) }].concat(sheets.map(function (sh) {
      return { name: sh.name + (sh.rows.length ? ' (' + sh.rows.length + ')' : ''), html: sheetHtml(sh, res) };
    }));
    els.tabs.setAttribute('role', 'tablist');
    els.tabs.setAttribute('aria-label', Lx('결과 보기', 'Xem kết quả'));
    els.tabs.innerHTML = tabs.map(function (t, i) {
      var group = i === 0 ? '<span class="tab-group-label">' + Lx('주요 결과', 'KẾT QUẢ CHÍNH') + '</span>' : i === 2 ? '<span class="tab-group-label">' + Lx('상세 자료', 'DỮ LIỆU CHI TIẾT') + '</span>' : '';
      return group + '<button type="button" role="tab" aria-controls="result-panel-' + i + '" aria-selected="' + (i === 0) + '" class="tab-btn' + (i === 0 ? ' active' : '') + '" data-i="' + i + '">' + escapeHtml(t.name) + '</button>';
    }).join('');
    els.results.innerHTML = tabs.map(function (t, i) {
      return '<div role="tabpanel" id="result-panel-' + i + '" class="panel' + (i === 0 ? ' active' : '') + '" data-i="' + i + '">' + t.html + '</div>';
    }).join('');
    bindLineageDiagram();
    els.tabs.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        els.tabs.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
        els.results.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('active'); });
        btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
        els.results.querySelector('.panel[data-i="' + btn.getAttribute('data-i') + '"]').classList.add('active');
      });
    });
    setBusy(busy);
  }

  function saveExcel() {
    if (!lastOutputs || lotMismatch()) return;
    downloadBlob(lastOutputs.workbookBytes, lastOutputs.workbookName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    setStatus(Lx('엑셀 리포트를 다운로드 폴더에 저장했습니다: ', 'Đã lưu báo cáo Excel vào thư mục Downloads: ') + lastOutputs.workbookName, false);
  }

  function copyIds() {
    if (!lastMissingIds.length || lotMismatch()) return;
    var text = lastMissingIds.join('\r\n');
    var done = function () { setStatus(lastMissingIds.length + Lx('개 추가 필요 LOT ID를 클립보드에 복사했습니다.', ' LOT ID cần bổ sung đã được sao chép vào clipboard.'), false); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  }

  function clearAll() {
    // sessionRuns (검증결과.zip history) is intentionally NOT cleared here — it persists for the tab's lifetime.
    entries.clear();
    lastResult = null; lastOutputs = null; lastMissingIds = [];
    renderFileList();
    els.resultCard.style.display = 'none';
    els.results.innerHTML = ''; els.tabs.innerHTML = ''; els.summary.innerHTML = '';
    setStatus(Lx('선택을 초기화했습니다.', 'Đã đặt lại lựa chọn.'), false);
    setBusy(false);
  }

  /* ------------------------------------------------------------------
   * 화면 언어 전환 (한국어 / Tiếng Việt)
   * page-shell.html 의 [data-vi] 요소는 처음 화면에 한국어로 쓰여 있고, data-vi 속성에 베트남어를 담아 둔다.
   * 처음 적용할 때 현재 innerHTML(한국어)을 data-ko 로 남겨 두어, 다시 한국어로 되돌릴 수 있게 한다.
   * ------------------------------------------------------------------ */
  function applyStaticLang() {
    document.documentElement.lang = LT.lang === 'vi' ? 'vi' : 'ko';
    document.title = Lx('LOT Tracker v', 'LOT Tracker v') + APP_VERSION;
    document.querySelectorAll('[data-vi]').forEach(function (el) {
      if (el.getAttribute('data-ko') === null) el.setAttribute('data-ko', el.innerHTML);
      el.innerHTML = LT.lang === 'vi' ? el.getAttribute('data-vi') : el.getAttribute('data-ko');
    });
    document.querySelectorAll('[data-vi-placeholder]').forEach(function (el) {
      if (el.getAttribute('data-ko-placeholder') === null) el.setAttribute('data-ko-placeholder', el.placeholder);
      el.placeholder = LT.lang === 'vi' ? el.getAttribute('data-vi-placeholder') : el.getAttribute('data-ko-placeholder');
    });
  }
  // 0.3.3: 결과(리포트)가 있으면 같은 입력으로 추적을 다시 실행해 새 언어로 전부 다시 만든다 (Codex 2차 5번).
  //   엔진 결과 안의 문구(추가 필요 LOT 의 구분·사유, 검증 내용, 구성 라벨 등)는 추적할 때의 언어로 만들어지므로,
  //   화면만 다시 그리면 한국어로 추적한 결과를 베트남어 문구와 비교해 '역추적·전개 필수'가 '확산 필수'로 잘못 분류되고
  //   '필수(전개)' 같은 값과 엑셀은 이전 언어로 남았다. 추적은 결정적이라 수치는 같고 문구만 바뀐다 (검증결과.zip 에는 reason=LANGUAGE_SWITCH 로 남음).
  // The shared LOT Tracker header owns the language buttons and calls this for both panes.
  function switchLang(lang) {
    if (busy) return false;
    if (LT.lang === lang) return true;
    LT.setLang(lang);
    applyStaticLang();
    renderFileList();
    if (lastResult && lastOutputs) { startTrace(lastResult.input, 'LANGUAGE_SWITCH'); return true; }
    if (lastResult) renderResult(lastResult, false);
    setBusy(busy);
    return true;
  }

  document.addEventListener('DOMContentLoaded', function () {
    els.fileInput = byId('file-input');
    els.pickBtn = byId('pick-btn');
    els.traceBtn = byId('trace-btn');
    els.clearBtn = byId('clear-btn');
    els.lotInput = byId('lot-input');
    els.optForeign = byId('opt-foreign');
    els.refStep = byId('ref-step');
    els.refCode = byId('ref-code');
    els.saveExcelBtn = byId('save-excel-btn');
    els.copyIdsBtn = byId('copy-ids-btn');
    els.saveValidationZipBtn = byId('save-validation-zip-btn');
    els.runCountNote = byId('run-count-note');
    els.status = byId('status');
    els.fileList = byId('file-list');
    els.results = byId('results');
    els.tabs = byId('tabs');
    els.summary = byId('summary');
    els.resultCard = byId('result-card');
    byId('kept-runs-note').textContent = KEEP_FULL_RUNS;
    applyStaticLang();

    els.pickBtn.addEventListener('click', function () { els.fileInput.click(); });
    els.fileInput.addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
    els.traceBtn.addEventListener('click', traceClick);
    els.lotInput.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !els.traceBtn.disabled) traceClick(); });
    els.lotInput.addEventListener('input', function () { setBusy(busy); });
    els.refStep.addEventListener('change', function () { if (els.refStep.value) els.refCode.value = ''; invalidateResult(Lx('기준 공정 변경', 'Đổi công đoạn chuẩn')); setBusy(busy); });
    els.refCode.addEventListener('input', function () { if (els.refCode.value.trim()) els.refStep.value = ''; invalidateResult(Lx('기준 불량 코드 변경', 'Đổi mã lỗi chuẩn')); setBusy(busy); });
    if (els.optForeign) els.optForeign.addEventListener('change', function () { invalidateResult(Lx('추적 옵션 변경', 'Đổi tùy chọn truy vết')); setBusy(busy); });
    els.refCode.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !els.traceBtn.disabled) traceClick(); });
    els.clearBtn.addEventListener('click', clearAll);
    els.saveExcelBtn.addEventListener('click', saveExcel);
    els.copyIdsBtn.addEventListener('click', copyIds);
    els.saveValidationZipBtn.addEventListener('click', saveValidationZip);

    var dropZone = byId('drop-zone');
    ['dragenter', 'dragover'].forEach(function (evt) {
      dropZone.addEventListener(evt, function (e) { e.preventDefault(); dropZone.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      dropZone.addEventListener(evt, function (e) { e.preventDefault(); dropZone.classList.remove('drag'); });
    });
    dropZone.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
    });

    renderFileList();
    setBusy(false);
    setStatus(Lx('MES LOT 이력 파일을 넣고, 추적할 LOT ID를 입력하세요. CSV / XLS / XLSX · 최대 ', 'Hãy thêm tệp lịch sử LOT MES rồi nhập LOT ID cần truy vết. CSV / XLS / XLSX · tối đa ') + MAX_FILES + Lx('개, 파일당 ', ' tệp, mỗi tệp ') + fmtBytes(MAX_FILE_BYTES) + Lx(', 전체 ', ', tổng ') + fmtBytes(MAX_TOTAL_BYTES), false);
  });

  // The shared host talks to this pane only by postMessage (works in sandboxed viewers too).
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (window.parent === window || event.source !== window.parent || !data || data.lotTracker !== true) return;
    if (data.type === 'addFiles') addFiles(data.files || []);
    else if (data.type === 'clear') clearAll();
    else if (data.type === 'setLang') switchLang(data.lang);
  });
  document.addEventListener('DOMContentLoaded', function () { notifyHost({ type: 'ready' }); });

  window.LOTTrackerPane = { addFiles: addFiles, clear: clearAll, setLang: switchLang, isBusy: function () { return busy; }, fileCount: function () { return entries.size; } };
})();
