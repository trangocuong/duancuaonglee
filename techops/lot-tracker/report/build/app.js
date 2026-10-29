/* LOT Tracker Offline (Web) — UI glue code.
   Runs entirely client-side: no network calls, no server, no build step for the user.
   Relies on the engine functions (lot-step-report.js + lot-tracker.js + tracking.mjs)
   and the SheetJS (XLSX) library, both inlined above this script in the same page. */
(function () {
  'use strict';

  var MAX_FILES = 500;
  var MAX_FILE_BYTES = 2 * 1024 * 1024;
  var MAX_TOTAL_BYTES = 128 * 1024 * 1024;
  var APP_VERSION = '__APP_VERSION__';
  var REPORT_FORMAT = 'LOT Tracer Result v3';
  var KEEP_FULL_RUNS = 5; // older runs keep their log/status but drop raw file bytes to bound memory

  var selected = new Map(); // filename -> File
  var lastSummaries = [];
  var lastMissingIds = [];
  var lastOutputs = null; // { stepsWorkbookBytes, summariesJson } for the most recent analysis
  var lastWarnings = [];
  var reportStepOptions = [];
  var selectedReportSteps = [];
  var lastRun = null;
  var sessionRuns = []; // every "분석" click this tab has made, for the 검증결과.zip button
  var runSeq = 0;
  var busy = false;
  var lastTabs = null; // rendered report tabs, redrawn when the screen language changes
  var lastStatus = null;

  // ---- Screen language (Korean / Vietnamese), chosen in the shared header ----------------------
  // Messages keep both languages so a later switch redraws them without re-running the analysis.
  var lang = 'ko';
  function Lx(ko, vi) { return lang === 'vi' ? vi : ko; }
  function both(ko, vi) { return { ko: ko, vi: vi }; }
  function inLang(text) { return text && typeof text === 'object' ? text[lang] : String(text == null ? '' : text); }
  function failure(ko, vi) { var error = Error(Lx(ko, vi)); error.text = both(ko, vi); return error; }
  function errorText(error, code) { return error && error.text ? error.text[code] : String(error && error.message || error); }

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

  function setStatus(text, isError) {
    lastStatus = { text: text, isError: isError };
    els.status.textContent = inLang(text);
    els.status.className = isError ? 'status error' : 'status';
  }

  function setBusy(value) {
    busy = value;
    notifyHost({ type: 'busy', value: value });
    els.analyzeBtn.disabled = value || selected.size === 0;
    els.addFilesBtn.disabled = value;
    els.fileInput.disabled = value;
    els.addFileInput.disabled = value;
    els.clearBtn.disabled = value;
    els.saveExcelBtn.disabled = value || !lastOutputs || !lastOutputs.stepsWorkbookBytes;
    els.copyIdsBtn.disabled = value || !lastMissingIds.length;
    els.saveValidationZipBtn.disabled = value || !sessionRuns.length;
    els.runCountNote.textContent = Lx('이번 세션에서 실행한 분석: ' + sessionRuns.length + '회', 'Số lần phân tích trong phiên này: ' + sessionRuns.length);
  }

  // ---- Validation-run logging (for the 검증결과.zip button) --------------------------------
  // Every "분석" click gets its own run record: what files went in (name + SHA-256), a
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
      reportFormat: REPORT_FORMAT,
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

  function addFiles(fileList) {
    if (busy) return;
    lastSummaries = []; lastMissingIds = []; lastOutputs = null;
    lastWarnings = []; reportStepOptions = []; selectedReportSteps = []; lastRun = null; lastTabs = null;
    els.results.innerHTML = ''; els.tabs.innerHTML = '';
    var added = 0, replaced = 0;
    for (var i = 0; i < fileList.length; i++) {
      var file = fileList[i];
      if (!/\.(csv|xls|xlsx)$/i.test(file.name)) continue;
      if (selected.has(file.name)) replaced++; else added++;
      selected.set(file.name, file);
    }
    renderFileList();
    var ko = added + '개 추가', vi = 'Đã thêm ' + added + ' tệp';
    if (replaced) { ko += ', ' + replaced + '개 갱신(같은 파일명)'; vi += ', cập nhật ' + replaced + ' tệp (trùng tên)'; }
    ko += ' · 현재 총 ' + selected.size + '개 선택됨'; vi += ' · hiện đã chọn tổng ' + selected.size + ' tệp';
    setStatus(both(ko, vi), false);
    setBusy(busy);
  }

  function renderFileList() {
    if (!selected.size) { els.fileList.textContent = Lx('선택된 파일이 없습니다.', 'Chưa chọn tệp nào.'); return; }
    var total = 0;
    var lines = [];
    selected.forEach(function (file) {
      total += file.size;
      lines.push(file.name + ' (' + fmtBytes(file.size) + ')');
    });
    els.fileList.innerHTML = '<div>' + escapeHtml(Lx(selected.size + '개 파일 · 합계 ', selected.size + ' tệp · tổng ') + fmtBytes(total)) + '</div>' +
      '<ul>' + lines.map(function (line) { return '<li>' + escapeHtml(line) + '</li>'; }).join('') + '</ul>';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function readFileBytes(file) {
    return file.arrayBuffer().then(function (buffer) { return new Uint8Array(buffer); });
  }

  function historyMatrix(summaries, selectedSteps) {
    var rows = [['LOT NO', 'STEP', 'Visit', 'EQP', 'Track In', 'IN', 'Track Out', 'OUT', 'FAIL', 'SCRAP', 'YLD']];
    summaries.forEach(function (s) {
      selectedSteps.forEach(function (step) {
        var visits = step === 'SMT' ? [reportVisit(s, step)].filter(Boolean) : (s.steps && s.steps[step] || []);
        visits.forEach(function (visit, i) {
          rows.push([s.lotId, step, i + 1, visit.eqp, visit.inAt, visit.in, visit.outAt, visit.out, visit.failQty, visit.failCodes, visit.yld]);
        });
      });
    });
    return rows;
  }

  function matrixToTable(matrix, headerRows) {
    headerRows = headerRows || 1;
    if (!matrix || !matrix.length) return '<p class="muted">' + Lx('데이터 없음', 'Không có dữ liệu') + '</p>';
    var headingRows;
    if (headerRows === 2 && matrix.length >= 2) {
      // The report matrix uses empty cells as merged-header placeholders.
      // Render the same identity and process groups as the Excel report.
      // Mutation columns belong to their process header in the v3 layout.
      var top = matrix[0], sub = matrix[1], first = [], second = [];
      for (var col = 0; col < top.length;) {
        if (top[col] !== '' && (sub[col] == null || sub[col] === '')) {
          first.push('<th scope="col" rowspan="2" class="report-identity-heading">' + escapeHtml(top[col]) + '</th>');
          col++;
          continue;
        }
        var span = 1;
        while (col + span < top.length && top[col + span] === '') span++;
        first.push('<th scope="colgroup" colspan="' + span + '" class="report-group-heading">' + escapeHtml(top[col]) + '</th>');
        for (var offset = 0; offset < span; offset++) {
          second.push('<th scope="col">' + escapeHtml(sub[col + offset]) + '</th>');
        }
        col += span;
      }
      headingRows = '<tr>' + first.join('') + '</tr><tr>' + second.join('') + '</tr>';
    } else {
      headingRows = matrix.slice(0, headerRows).map(function (row) {
        return '<tr>' + row.map(function (cell) { return '<th scope="col">' + escapeHtml(cell) + '</th>'; }).join('') + '</tr>';
      }).join('');
    }
    var thead = '<thead>' + headingRows + '</thead>';
    var bodySpans = new Map(), coveredCells = new Set();
    (matrix.lotTrackerMerges || []).forEach(function (merge) {
      var start = merge.s, end = merge.e;
      if (!start || !end || start.r < headerRows || end.r >= matrix.length || start.r >= end.r || start.c !== end.c) return;
      bodySpans.set(start.r + ':' + start.c, end.r - start.r + 1);
      for (var row = start.r + 1; row <= end.r; row++) coveredCells.add(row + ':' + start.c);
    });
    var tbody = '<tbody>' + matrix.slice(headerRows).map(function (row, offset) {
      var rowIndex = offset + headerRows;
      return '<tr>' + row.map(function (cell, col) {
        var key = rowIndex + ':' + col;
        if (coveredCells.has(key)) return '';
        var span = bodySpans.get(key);
        return '<td' + (col === 0 ? ' class="report-identity-cell"' : '') + (span ? ' rowspan="' + span + '"' : '') + '>' + escapeHtml(cell) + '</td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody>';
    return '<div class="table-wrap"><table class="report-table">' + thead + tbody + '</table></div>';
  }

  // YLD stays an exact ratio in the report data and the Excel cell. Like the Excel
  // number format, 100% and above shows one decimal and below 100% two decimals.
  function displayMatrix(matrix, headerRows) {
    if (headerRows !== 2 || !matrix || matrix.length < 2) return matrix;
    var headings = matrix[1];
    var shown = matrix.map(function (row, index) {
      if (index < headerRows) return row;
      return row.map(function (value, col) {
        if (headings[col] !== 'YLD' || value === '' || value == null) return value;
        var ratio = Number(value);
        if (!Number.isFinite(ratio)) return value;
        return ratio >= 1 ? (Math.round(ratio * 1000) / 10).toFixed(1) + '%' : (Math.round(ratio * 10000) / 100).toFixed(2) + '%';
      });
    });
    shown.lotTrackerMerges = matrix.lotTrackerMerges;
    return shown;
  }

  function matrixToTsv(matrix) {
    return matrix.map(function (row) {
      return row.map(function (value) {
        var text = String(value == null ? '' : value);
        return /[\t\r\n"]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
      }).join('\t');
    }).join('\r\n');
  }

  function downloadBlob(bytes, filename, mime) {
    var blob = new Blob([bytes], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  function analyze() {
    if (busy) return;
    if (!selected.size) { setStatus(both('먼저 See LOT 파일을 선택하세요.', 'Hãy chọn tệp See LOT trước.'), true); return; }
    if (selected.size > MAX_FILES) {
      setStatus(both('최대 ' + MAX_FILES + '개까지 분석할 수 있습니다. (' + selected.size + '개 선택됨)',
        'Chỉ phân tích được tối đa ' + MAX_FILES + ' tệp. (đã chọn ' + selected.size + ')'), true);
      return;
    }
    setBusy(true);
    setStatus(both('분석 중… (' + selected.size + '개 파일)', 'Đang phân tích… (' + selected.size + ' tệp)'), false);
    lastSummaries = []; lastMissingIds = []; lastOutputs = null;
    lastWarnings = []; reportStepOptions = []; selectedReportSteps = []; lastRun = null; lastTabs = null;
    els.results.innerHTML = '';
    els.tabs.innerHTML = '';

    var run = newRun();
    logStage(run, 'REQUEST_READ', { fileCount: selected.size });

    // Give the status message a chance to paint before the (synchronous, CPU-bound) parse work.
    setTimeout(function () { runAnalysis(run); }, 30);
  }

  function finishRun(run, status, extra) {
    run.status = status;
    run.finishedAt = new Date().toISOString();
    if (extra) for (var key in extra) if (Object.prototype.hasOwnProperty.call(extra, key)) run[key] = extra[key];
    logStage(run, status === 'success' ? 'ANALYSIS_COMPLETE' : 'ERROR', extra);
    setBusy(busy); // refresh button states / run-count note without changing busy itself
  }

  function runAnalysis(run) {
    try {
      var files = Array.from(selected.values());
      logStage(run, 'VALIDATE_FILES', { count: files.length });
      var total = 0;
      var runSources = [];
      var summaries = [];
      var seen = new Set();

      var pending = files.reduce(function (promise, file) {
        return promise.then(function () {
          logStage(run, 'FILE_READ', { file: file.name, size: file.size });
          if (file.size > MAX_FILE_BYTES) {
            throw failure(file.name + ': 파일당 최대 2MB입니다 (' + fmtBytes(file.size) + ').', file.name + ': mỗi tệp tối đa 2MB (' + fmtBytes(file.size) + ').');
          }
          total += file.size;
          if (total > MAX_TOTAL_BYTES) throw failure('전체 파일 용량이 128MB를 넘었습니다: ' + file.name + ' 근처.', 'Tổng dung lượng tệp vượt 128MB: gần ' + file.name + '.');
          return readFileBytes(file).then(function (bytes) {
            var digest = sha256Hex(bytes);
            logStage(run, 'FILE_PARSE', { file: file.name, size: bytes.length, sha256: digest });
            run.files.push({ name: file.name, size: bytes.length, sha256: digest });
            if (run.hasBytes) run.inputFiles.push({ name: file.name, bytes: bytes });
            try {
              var runSource = summarizeRunMetadata(bytes, file.name);
              var item = runSource || summarizeSeeLotWorkbook(bytes, file.name);
              var identity = (runSource ? 'RUNID:' : 'EVENT:') + item.lotId;
              if (seen.has(identity)) throw failure('중복된 LOTID ' + item.lotId + ' (' + file.name + ')', 'LOTID trùng ' + item.lotId + ' (' + file.name + ')');
              seen.add(identity);
              if (runSource) runSources.push(runSource); else summaries.push(item);
              logStage(run, 'FILE_PARSED', { file: file.name, lotId: item.lotId, kind: runSource ? 'RUNID' : (item.sourceKind || 'See LOT') });
            } catch (error) {
              throw failure(file.name + ': ' + errorText(error, 'ko'), file.name + ': ' + errorText(error, 'vi'));
            }
          });
        });
      }, Promise.resolve());

      pending.then(function () {
        if (!summaries.length) {
          throw failure('분석할 See LOT 이벤트 파일이 없습니다 (RUNID CSV만 선택되었을 수 있습니다).',
            'Không có tệp sự kiện See LOT để phân tích (có thể chỉ chọn RUNID CSV).');
        }
        logStage(run, 'RESOLVE_LOT_RELATIONS', { count: summaries.length });
        resolveTrackerSummaries(summaries);
        var runResult = assignRunLinks(summaries, runSources);
        logStage(run, 'RUNID_LINKS', {
          runSourceCount: runSources.length,
          linked: summaries.filter(function (s) { return s.runLinkType; }).length,
          unlinked: runResult.unlinked.map(function (s) { return s.lotId; }),
        });
        var warnings = runResult.unlinked.map(function (source) {
          var mergeLots = ' [MERGE_LOT: ' + (source.mergeLotIds.join(', ') || '-') + ']';
          return both(source.filename + ': RUNID 파일을 선택한 See LOT 이력과 연결할 수 없어 파트넘버 연결에 사용하지 않았습니다.' + mergeLots,
            source.filename + ': không liên kết được tệp RUNID với lịch sử See LOT đã chọn nên không dùng để gán mã sản phẩm.' + mergeLots);
        });
        warnings = warnings.concat(summaries.filter(function (summary) { return summary.pmsRequired && !summary.smtPmsConsumedBy; }).map(function (summary) {
          return both(summary.lotId + ': SMT 투입 RUN ID로 인식했습니다. PART NO와 투입 기준 확인을 위해 PMS 정보가 필요합니다.',
            summary.lotId + ': được nhận diện là RUN ID đầu vào SMT. Cần thông tin PMS để xác nhận PART NO và tiêu chí nhập.');
        }));

        logStage(run, 'BUILD_REPORTS');
        var tracking = trackingLists(summaries);

        lastSummaries = summaries;
        lastWarnings = warnings;
        reportStepOptions = ['SMT', 'M033', 'M087', 'M100', 'M111', 'M130', 'M160', 'M164', 'M165'];
        selectedReportSteps = reportStepOptions.slice();
        lastRun = run;
        lastMissingIds = tracking.missing.map(function (r) { return r.id; });
        return updateReports(false).then(function () {
        var reportRows = Math.max(0, tracerReportMatrix(summaries, selectedReportSteps).length - 2);
        var summaryKo = summaries.length + '개 LOT 분석 완료 · LOT Tracer Result ' + reportRows + '행';
        var summaryVi = 'Đã phân tích xong ' + summaries.length + ' LOT · LOT Tracer Result ' + reportRows + ' dòng';
        if (warnings.length) { summaryKo += ' · 경고 ' + warnings.length + '건'; summaryVi += ' · ' + warnings.length + ' cảnh báo'; }
        setStatus(both(summaryKo, summaryVi), false);
        finishRun(run, 'success', {
          summaryCount: summaries.length,
          lotIds: summaries.map(function (s) { return s.lotId; }),
          warnings: warnings.map(inLang),
        });
        });
      }).catch(function (error) {
        setStatus(both('오류: ' + errorText(error, 'ko'), 'Lỗi: ' + errorText(error, 'vi')), true);
        finishRun(run, 'error', { errorStage: run.log.length ? run.log[run.log.length - 1].stage : 'UNKNOWN', errorMessage: error.message, errorStack: error.stack || '' });
      }).finally(function () {
        setBusy(false);
      });
    } catch (error) {
      setStatus(both('오류: ' + errorText(error, 'ko'), 'Lỗi: ' + errorText(error, 'vi')), true);
      finishRun(run, 'error', { errorStage: 'RUNANALYSIS', errorMessage: error.message, errorStack: error.stack || '' });
      setBusy(false);
    }
  }

  function updateReports(selectionChanged) {
    if (!lastSummaries.length || !selectedReportSteps.length) return Promise.resolve();
    var tracerMatrix = tracerReportMatrix(lastSummaries, selectedReportSteps);
    if (lastRun) {
      lastRun.selectedSteps = selectedReportSteps.slice();
      logStage(lastRun, 'APPLY_BUILTIN_FORMAT', { reportFormat: REPORT_FORMAT });
    }
    return window.LOTTrackerTemplate.exportBuiltin(tracerMatrix).then(function (stepsWorkbookBytes) {
      lastOutputs = { stepsWorkbookBytes: stepsWorkbookBytes, summariesJson: JSON.stringify(lastSummaries, null, 2) };
      if (lastRun && lastRun.hasBytes) lastRun.outputs = lastOutputs;
      if (lastRun) logStage(lastRun, selectionChanged ? 'REPORT_SELECTION_UPDATED' : 'WRITE_REPORT', { name: 'LOT Tracer Result', steps: selectedReportSteps.slice(), reportFormat: REPORT_FORMAT });
      lastTabs = [{ name: 'LOT Tracer Result', matrix: tracerMatrix, headerRows: 2 }];
      renderTabs(lastTabs, lastWarnings, lastSummaries);
    });
  }

  function renderTabs(tabs, warnings, summaries) {
    var warningHtml = warnings.length
      ? '<div class="card warn"><strong>' + Lx('파일 오류 / 경고', 'Lỗi tệp / cảnh báo') + '</strong><br>' + warnings.map(function (warning) { return escapeHtml(inLang(warning)); }).join('<br>') + '</div>'
      : '';
    var partNoteHtml = '<details class="input-help"><summary>' + Lx('PART NO 표시 기준', 'Tiêu chí hiển thị PART NO') + '</summary><p class="muted">'
      + Lx('PART NO는 원본 시작 Split과 RUNID 파일(CSV/XLS/XLSX)의 연결이 확인된 경우 PROD_ID에서 표시합니다. '
        + '연결 근거가 없거나 여러 RUNID가 충돌하면 추정하지 않습니다. RUNID 맵은 공정 IN/OUT 이력을 대체하지 않습니다.',
        'PART NO được lấy từ PROD_ID khi đã xác nhận liên kết giữa Split khởi đầu gốc và tệp RUNID (CSV/XLS/XLSX). '
        + 'Không suy đoán khi không có căn cứ liên kết hoặc khi nhiều RUNID mâu thuẫn. Bản đồ RUNID không thay thế lịch sử IN/OUT của công đoạn.') + '</p></details>';

    els.tabs.innerHTML = tabs.length > 1 ? tabs.map(function (tab, index) {
      return '<button class="tab-btn' + (index === 0 ? ' active' : '') + '" data-tab="' + index + '">' + escapeHtml(tab.name) + '</button>';
    }).join('') : '';

    var panels = tabs.map(function (tab, index) {
      var shown = displayMatrix(tab.matrix, tab.headerRows);
      var table = matrixToTable(shown, tab.headerRows);
      var tsv = matrixToTsv(shown);
      return '<div class="panel' + (index === 0 ? ' active' : '') + '" data-panel="' + index + '">' + table +
        '<details><summary>' + Lx('텍스트로 복사', 'Sao chép dạng văn bản') + '</summary><textarea readonly rows="8" class="tsv-box">' + escapeHtml(tsv) + '</textarea>' +
        '<button type="button" class="secondary copy-tsv-btn">' + Lx('텍스트 복사', 'Sao chép văn bản') + '</button><span class="copy-status"></span></details></div>';
    }).join('');

    els.results.innerHTML = warningHtml + partNoteHtml + '<div class="tabpanels">' + panels + '</div>';

    els.tabs.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        els.tabs.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
        els.results.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('active'); });
        btn.classList.add('active');
        els.results.querySelector('.panel[data-panel="' + btn.dataset.tab + '"]').classList.add('active');
      });
    });
    els.results.querySelectorAll('.copy-tsv-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var box = btn.previousElementSibling;
        var status = btn.nextElementSibling;
        var done = function () { status.textContent = Lx('복사했습니다.', 'Đã sao chép.'); setTimeout(function () { status.textContent = ''; }, 2000); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(box.value).then(done).catch(function () { box.select(); document.execCommand('copy'); done(); });
        } else { box.select(); document.execCommand('copy'); done(); }
      });
    });

    setBusy(busy);
  }

  function saveExcel() {
    if (!lastOutputs || !lastOutputs.stepsWorkbookBytes) return;
    var date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    downloadBlob(lastOutputs.stepsWorkbookBytes, 'LOT Tracer Result ' + date + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    setStatus(both('LOT Tracer Result Excel 보고서를 다운로드 폴더에 저장했습니다.', 'Đã lưu báo cáo Excel LOT Tracer Result vào thư mục tải xuống.'), false);
  }

  // ---- 검증결과.zip (validation-run archive, for debugging) --------------------------------
  function readmeText() {
    return [
      Lx('LOT Tracker 오프라인 (Web) — 검증결과.zip', 'LOT Tracker ngoại tuyến (Web) — validation-result.zip'),
      '',
      Lx('이 zip은 이 브라우저 탭에서 "분석 · 보고서 만들기" 버튼을 누를 때마다 자동으로 기록된 내용을 모은 것입니다.',
        'Tệp zip này tập hợp nội dung được ghi tự động mỗi khi nhấn nút "Phân tích · tạo báo cáo" trong tab trình duyệt này.'),
      Lx('문제가 생겼을 때 이 zip을 그대로 전달하면 어느 파일에서 무엇이 어떻게 처리됐는지 재현할 수 있습니다.',
        'Khi có sự cố, chỉ cần gửi nguyên tệp zip này là có thể tái hiện tệp nào được xử lý thế nào.'),
      '',
      Lx('- session-summary.json : 이번 탭에서 실행한 모든 분석의 요약 (실행 순서, 상태, LOT 수, 오류 등)',
        '- session-summary.json : tóm tắt mọi lần phân tích trong tab này (thứ tự chạy, trạng thái, số LOT, lỗi...)'),
      Lx('- runs/<실행ID>/request.json : 그 실행에 사용한 파일 이름·크기·SHA-256 해시 목록',
        '- runs/<ID lần chạy>/request.json : danh sách tên·kích thước·hash SHA-256 của các tệp đã dùng'),
      Lx('- runs/<실행ID>/status.json  : 그 실행의 최종 상태 (성공/실패, 분석된 LOT 수, 경고, 오류 위치와 메시지)',
        '- runs/<ID lần chạy>/status.json  : trạng thái cuối của lần chạy (thành công/thất bại, số LOT đã phân tích, cảnh báo, vị trí và nội dung lỗi)'),
      Lx('- runs/<실행ID>/logs/analysis.jsonl : 그 실행의 단계별 처리 기록 (시간순, 한 줄에 한 단계)',
        '- runs/<ID lần chạy>/logs/analysis.jsonl : bản ghi xử lý từng bước của lần chạy (theo thời gian, mỗi dòng một bước)'),
      Lx('- runs/<실행ID>/inputs/  : 그 실행에 사용한 원본 파일 사본 (최근 ' + KEEP_FULL_RUNS + '회 실행만 보관)',
        '- runs/<ID lần chạy>/inputs/  : bản sao tệp gốc đã dùng (chỉ giữ cho ' + KEEP_FULL_RUNS + ' lần chạy gần nhất)'),
      Lx('- runs/<실행ID>/outputs/ : 그 실행이 만든 Excel 보고서와 summaries.json (최근 ' + KEEP_FULL_RUNS + '회 실행만 보관)',
        '- runs/<ID lần chạy>/outputs/ : báo cáo Excel và summaries.json do lần chạy tạo ra (chỉ giữ cho ' + KEEP_FULL_RUNS + ' lần chạy gần nhất)'),
      Lx('- SMT RUNID가 확인된 Split+Merge는 LOT Tracer Result에서 묶어 집계하며, 개별 근거는 outputs/summaries.json에서 확인합니다.',
        '- Split+Merge đã xác nhận SMT RUNID được gộp trong LOT Tracer Result; căn cứ chi tiết có trong outputs/summaries.json.'),
      Lx('- 보고서 양식은 LOT Tracer Result v3 구조를 HTML 안에 내장해 사용합니다.',
        '- Mẫu báo cáo dùng cấu trúc LOT Tracer Result v3 được tích hợp sẵn trong HTML.'),
      Lx('- runs/<실행ID>/NOTE.txt : 오래되어 원본/결과물 사본이 자동 삭제된 실행에 대한 안내',
        '- runs/<ID lần chạy>/NOTE.txt : ghi chú cho các lần chạy cũ đã tự động xóa bản sao tệp gốc/kết quả'),
      '',
      Lx('이 zip은 다운로드 폴더에만 저장되며, 어디로도 자동 전송되지 않습니다.',
        'Tệp zip này chỉ được lưu trong thư mục tải xuống và không tự động gửi đi đâu.'),
    ].join('\n');
  }

  function runRequestJson(run) {
    return JSON.stringify({ id: run.id, appVersion: run.appVersion, startedAt: run.startedAt, files: run.files, reportFormat: run.reportFormat }, null, 2);
  }
  function runStatusJson(run) {
    return JSON.stringify({
      id: run.id, appVersion: run.appVersion, status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt,
      summaryCount: run.summaryCount, lotIds: run.lotIds, warnings: run.warnings,
      selectedSteps: run.selectedSteps || [],
      errorStage: run.errorStage, errorMessage: run.errorMessage, errorStack: run.errorStack || '', hasFullCopy: run.hasBytes,
    }, null, 2);
  }

  function saveValidationZip() {
    if (!sessionRuns.length) return;
    setStatus(both('검증결과.zip 준비 중…', 'Đang chuẩn bị validation-result.zip…'), false);
    var zip = new JSZip();
    var summary = sessionRuns.map(function (run) {
      return {
        id: run.id, status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt,
        fileCount: run.files.length, summaryCount: run.summaryCount, lotIds: run.lotIds,
        selectedSteps: run.selectedSteps || [],
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
          outputsFolder.file('LOT Tracer Result.xlsx', run.outputs.stepsWorkbookBytes);
          outputsFolder.file('summaries.json', run.outputs.summariesJson);
        }
      } else {
        folder.file('NOTE.txt', Lx('이 실행은 이후 실행이 ' + KEEP_FULL_RUNS + '회 넘게 진행되어 원본 파일 사본과 결과물이 자동 삭제되었습니다.\n실행 기록(request.json / status.json / logs)은 그대로 남아 있습니다.',
          'Lần chạy này đã tự động xóa bản sao tệp gốc và kết quả vì sau đó đã có hơn ' + KEEP_FULL_RUNS + ' lần chạy.\nBản ghi lần chạy (request.json / status.json / logs) vẫn được giữ nguyên.'));
      }
    });

    zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } }).then(function (bytes) {
      var stamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadBlob(bytes, Lx('검증결과 ', 'validation-result ') + stamp + '.zip', 'application/zip');
      setStatus(both('검증결과.zip을 다운로드 폴더에 저장했습니다. (실행 ' + sessionRuns.length + '건)',
        'Đã lưu validation-result.zip vào thư mục tải xuống. (' + sessionRuns.length + ' lần chạy)'), false);
    }).catch(function (error) {
      setStatus(both('검증결과.zip 생성 오류: ' + error.message, 'Lỗi tạo validation-result.zip: ' + error.message), true);
    });
  }

  function copyIds() {
    if (!lastMissingIds.length) return;
    var text = lastMissingIds.join('\r\n');
    var done = function () {
      setStatus(both(lastMissingIds.length + '개 추가조회 ID를 클립보드에 복사했습니다.', 'Đã sao chép ' + lastMissingIds.length + ' ID cần tra cứu thêm vào bộ nhớ tạm.'), false);
    };
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
    if (busy) return;
    // Note: sessionRuns (검증결과.zip history) is intentionally NOT cleared here — it should
    // persist for the whole browser tab's lifetime, not just until the next "전체 초기화".
    selected.clear();
    lastSummaries = []; lastMissingIds = []; lastOutputs = null;
    lastWarnings = []; reportStepOptions = []; selectedReportSteps = []; lastRun = null; lastTabs = null;
    renderFileList();
    els.results.innerHTML = ''; els.tabs.innerHTML = '';
    setStatus(both('선택을 초기화했습니다.', 'Đã đặt lại lựa chọn.'), false);
    setBusy(false);
  }

  // Static page text is written in Korean with a data-vi translation; the Korean is kept in data-ko.
  function applyStaticLang() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-vi]').forEach(function (element) {
      if (element.getAttribute('data-ko') === null) element.setAttribute('data-ko', element.innerHTML);
      element.innerHTML = element.getAttribute(lang === 'vi' ? 'data-vi' : 'data-ko');
    });
  }
  function setLang(code) {
    if (busy) return false;
    lang = code === 'vi' ? 'vi' : 'ko';
    applyStaticLang();
    renderFileList();
    if (lastTabs) renderTabs(lastTabs, lastWarnings, lastSummaries); else setBusy(busy);
    if (lastStatus) setStatus(lastStatus.text, lastStatus.isError);
    return true;
  }

  document.addEventListener('DOMContentLoaded', function () {
    els.fileInput = byId('file-input');
    els.addFileInput = byId('add-file-input');
    els.analyzeBtn = byId('analyze-btn');
    els.addFilesBtn = byId('add-files-btn');
    els.clearBtn = byId('clear-btn');
    els.saveExcelBtn = byId('save-excel-btn');
    els.copyIdsBtn = byId('copy-ids-btn');
    els.saveValidationZipBtn = byId('save-validation-zip-btn');
    els.runCountNote = byId('run-count-note');
    els.status = byId('status');
    els.fileList = byId('file-list');
    els.results = byId('results');
    els.tabs = byId('tabs');
    els.fileInput.addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
    els.addFileInput.addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
    els.addFilesBtn.addEventListener('click', function () { els.addFileInput.click(); });
    els.analyzeBtn.addEventListener('click', analyze);
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
    setStatus(both('상단에서 MES·PMS 파일을 추가한 뒤 분석하세요.', 'Hãy thêm tệp MES·PMS ở phía trên rồi phân tích.'), false);
  });

  // The shared host talks to this pane only by postMessage (works in sandboxed viewers too).
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (window.parent === window || event.source !== window.parent || !data || data.lotTracker !== true) return;
    if (data.type === 'addFiles') addFiles(data.files || []);
    else if (data.type === 'clear') clearAll();
    else if (data.type === 'setLang') setLang(data.lang);
  });
  document.addEventListener('DOMContentLoaded', function () { notifyHost({ type: 'ready' }); });

  window.LOTTrackerPane = { addFiles: addFiles, clear: clearAll, setLang: setLang, isBusy: function () { return busy; }, fileCount: function () { return selected.size; } };
})();
