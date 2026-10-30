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

  var els = {};
  function byId(id) { return document.getElementById(id); }

  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function setStatus(text, isError) {
    els.status.textContent = text;
    els.status.className = isError ? 'status error' : 'status';
  }

  function setBusy(value) {
    busy = value;
    els.analyzeBtn.disabled = value || selected.size === 0;
    els.addFilesBtn.disabled = value;
    els.fileInput.disabled = value;
    els.addFileInput.disabled = value;
    els.clearBtn.disabled = value;
    els.saveExcelBtn.disabled = value || !lastSummaries.length;
    els.copyIdsBtn.disabled = value || !lastMissingIds.length;
    els.saveValidationZipBtn.disabled = value || !sessionRuns.length;
    els.runCountNote.textContent = '이번 세션에서 실행한 분석: ' + sessionRuns.length + '회';
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
    var added = 0, replaced = 0;
    for (var i = 0; i < fileList.length; i++) {
      var file = fileList[i];
      if (!/\.(csv|xls|xlsx)$/i.test(file.name)) continue;
      if (selected.has(file.name)) replaced++; else added++;
      selected.set(file.name, file);
    }
    renderFileList();
    var msg = added + '개 추가';
    if (replaced) msg += ', ' + replaced + '개 갱신(같은 파일명)';
    msg += ' · 현재 총 ' + selected.size + '개 선택됨';
    setStatus(msg, false);
    setBusy(busy);
  }

  function renderFileList() {
    if (!selected.size) { els.fileList.textContent = '선택된 파일이 없습니다.'; return; }
    var total = 0;
    var lines = [];
    selected.forEach(function (file) {
      total += file.size;
      lines.push(file.name + ' (' + fmtBytes(file.size) + ')');
    });
    els.fileList.innerHTML = '<div>' + selected.size + '개 파일 · 합계 ' + fmtBytes(total) + '</div>' +
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
    if (!matrix || !matrix.length) return '<p class="muted">데이터 없음</p>';
    var thead = '<thead>' + matrix.slice(0, headerRows).map(function (row) {
      return '<tr>' + row.map(function (cell) { return '<th>' + escapeHtml(cell) + '</th>'; }).join('') + '</tr>';
    }).join('') + '</thead>';
    var tbody = '<tbody>' + matrix.slice(headerRows).map(function (row) {
      return '<tr>' + row.map(function (cell) { return '<td>' + escapeHtml(cell) + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody>';
    return '<div class="table-wrap"><table>' + thead + tbody + '</table></div>';
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
    if (!selected.size) { setStatus('먼저 See LOT 파일을 선택하세요.', true); return; }
    if (selected.size > MAX_FILES) { setStatus('최대 ' + MAX_FILES + '개까지 분석할 수 있습니다. (' + selected.size + '개 선택됨)', true); return; }
    setBusy(true);
    setStatus('분석 중… (' + selected.size + '개 파일)', false);
    lastSummaries = []; lastMissingIds = []; lastOutputs = null;
    lastWarnings = []; reportStepOptions = []; selectedReportSteps = []; lastRun = null;
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
          if (file.size > MAX_FILE_BYTES) throw Error(file.name + ': 파일당 최대 2MB입니다 (' + fmtBytes(file.size) + ').');
          total += file.size;
          if (total > MAX_TOTAL_BYTES) throw Error('전체 파일 용량이 128MB를 넘었습니다: ' + file.name + ' 근처.');
          return readFileBytes(file).then(function (bytes) {
            var digest = sha256Hex(bytes);
            logStage(run, 'FILE_PARSE', { file: file.name, size: bytes.length, sha256: digest });
            run.files.push({ name: file.name, size: bytes.length, sha256: digest });
            if (run.hasBytes) run.inputFiles.push({ name: file.name, bytes: bytes });
            try {
              var runSource = summarizeRunMetadata(bytes, file.name);
              var item = runSource || summarizeSeeLotWorkbook(bytes, file.name);
              var identity = (runSource ? 'RUNID:' : 'EVENT:') + item.lotId;
              if (seen.has(identity)) throw Error('중복된 LOTID ' + item.lotId + ' (' + file.name + ')');
              seen.add(identity);
              if (runSource) runSources.push(runSource); else summaries.push(item);
              logStage(run, 'FILE_PARSED', { file: file.name, lotId: item.lotId, kind: runSource ? 'RUNID' : (item.sourceKind || 'See LOT') });
            } catch (error) {
              throw Error(file.name + ': ' + error.message);
            }
          });
        });
      }, Promise.resolve());

      pending.then(function () {
        if (!summaries.length) throw Error('분석할 See LOT 이벤트 파일이 없습니다 (RUNID CSV만 선택되었을 수 있습니다).');
        logStage(run, 'RESOLVE_LOT_RELATIONS', { count: summaries.length });
        resolveTrackerSummaries(summaries);
        var runResult = assignRunLinks(summaries, runSources);
        logStage(run, 'RUNID_LINKS', {
          runSourceCount: runSources.length,
          linked: summaries.filter(function (s) { return s.runLinkType; }).length,
          unlinked: runResult.unlinked.map(function (s) { return s.lotId; }),
        });
        var warnings = runResult.unlinked.map(function (source) {
          return source.filename + ': RUNID 파일을 선택한 See LOT 이력과 연결할 수 없어 파트넘버 연결에 사용하지 않았습니다. [MERGE_LOT: ' + (source.mergeLotIds.join(', ') || '-') + ']';
        });
        warnings = warnings.concat(summaries.filter(function (summary) { return summary.pmsRequired; }).map(function (summary) {
          return summary.lotId + ': SMT 투입 RUN ID로 인식했습니다. PART NO와 투입 기준 확인을 위해 PMS 정보가 필요합니다.';
        }));

        logStage(run, 'BUILD_REPORTS');
        var tracking = trackingLists(summaries);

        lastSummaries = summaries;
        lastWarnings = warnings;
        reportStepOptions = stepOptions(summaries);
        selectedReportSteps = reportStepOptions.slice();
        lastRun = run;
        lastMissingIds = tracking.missing.map(function (r) { return r.id; });
        updateReports(false);
        var summaryLine = summaries.length + '개 LOT 분석 완료';
        if (warnings.length) summaryLine += ' · 경고 ' + warnings.length + '건 (RUNID 추적 탭 참고)';
        setStatus(summaryLine, false);
        finishRun(run, 'success', {
          summaryCount: summaries.length,
          lotIds: summaries.map(function (s) { return s.lotId; }),
          warnings: warnings,
        });
      }).catch(function (error) {
        setStatus('오류: ' + error.message, true);
        finishRun(run, 'error', { errorStage: run.log.length ? run.log[run.log.length - 1].stage : 'UNKNOWN', errorMessage: error.message, errorStack: error.stack || '' });
      }).finally(function () {
        setBusy(false);
      });
    } catch (error) {
      setStatus('오류: ' + error.message, true);
      finishRun(run, 'error', { errorStage: 'RUNANALYSIS', errorMessage: error.message, errorStack: error.stack || '' });
      setBusy(false);
    }
  }

  function updateReports(selectionChanged) {
    if (!lastSummaries.length || !selectedReportSteps.length) return;
    var tracking = trackingLists(lastSummaries);
    var fixedMatrix = fixedProcessReportMatrix(lastSummaries);
    var stepMatrix = stepReportMatrix(lastSummaries, selectedReportSteps, 'ko');
    var stepsWorkbookBytes = stepReportWorkbook(lastSummaries, selectedReportSteps, 'ko');
    lastOutputs = { stepsWorkbookBytes: stepsWorkbookBytes, summariesJson: JSON.stringify(lastSummaries, null, 2) };
    if (lastRun && lastRun.hasBytes) lastRun.outputs = lastOutputs;
    if (lastRun) {
      lastRun.selectedSteps = selectedReportSteps.slice();
      logStage(lastRun, selectionChanged ? 'REPORT_SELECTION_UPDATED' : 'WRITE_REPORT', { name: 'LOT 공정별 보고서', steps: selectedReportSteps.slice() });
    }
    var tabs = [
      { name: 'LOT 공정표', matrix: fixedMatrix, headerRows: 2 },
      { name: '공정별 보고서', matrix: stepMatrix, headerRows: 2 },
      { name: 'Scrap Summary', matrix: scrapSummaryMatrix(lastSummaries, selectedReportSteps), headerRows: 1 },
      { name: 'Track History', matrix: historyMatrix(lastSummaries, selectedReportSteps), headerRows: 1 },
      { name: 'LOT Follow-up', matrix: followUpMatrix(lastSummaries, 'ko'), headerRows: 1 },
      { name: 'LOT Split Flow', matrix: splitFlowMatrix(lastSummaries, 'ko'), headerRows: 1 },
      { name: '추가 파일 요청', matrix: tracking.matrices['추가 파일 요청'], headerRows: 1 },
      { name: 'SMT RUNID 추적', matrix: tracking.matrices['SMT RUNID 추적'], headerRows: 1 },
      { name: 'SPLIT LOT 목록', matrix: tracking.matrices['SPLIT LOT 목록'], headerRows: 1 },
    ];
    renderTabs(tabs, lastWarnings, lastSummaries);
  }

  function renderTabs(tabs, warnings, summaries) {
    var warningHtml = warnings.length
      ? '<div class="card warn"><strong>파일 오류 / 경고</strong><br>' + warnings.map(escapeHtml).join('<br>') + '</div>'
      : '';
    var partNoteHtml = '<p class="muted">PART NO는 원본 시작 Split과 RUNID 파일(CSV/XLS/XLSX)의 연결이 확인된 경우 PROD_ID에서 표시합니다. '
      + '연결 근거가 없거나 여러 RUNID가 충돌하면 추정하지 않습니다. RUNID 맵은 공정 IN/OUT 이력을 대체하지 않습니다.</p>';

    els.tabs.innerHTML = tabs.map(function (tab, index) {
      return '<button class="tab-btn' + (index === 0 ? ' active' : '') + '" data-tab="' + index + '">' + escapeHtml(tab.name) + '</button>';
    }).join('');

    var panels = tabs.map(function (tab, index) {
      var table = matrixToTable(tab.matrix, tab.headerRows);
      var tsv = matrixToTsv(tab.matrix);
      return '<div class="panel' + (index === 0 ? ' active' : '') + '" data-panel="' + index + '">' + table +
        '<details><summary>텍스트로 복사</summary><textarea readonly rows="8" class="tsv-box">' + escapeHtml(tsv) + '</textarea>' +
        '<button type="button" class="secondary copy-tsv-btn">텍스트 복사</button><span class="copy-status"></span></details></div>';
    }).join('');

    var processHtml = '<div class="process-picker"><strong>보고서 공정 선택</strong>' +
      '<div class="process-options">' + reportStepOptions.map(function (step) {
        return '<label><input type="checkbox" name="report-step" value="' + escapeHtml(step) + '"' +
          (selectedReportSteps.includes(step) ? ' checked' : '') + '>' + escapeHtml(step) + '</label>';
      }).join('') + '</div><div class="row" style="margin-bottom:0">' +
      '<button type="button" id="process-all-btn" class="secondary">전체 선택</button>' +
      '<button type="button" id="process-none-btn" class="secondary">전체 해제</button>' +
      '<button type="button" id="process-apply-btn" class="primary">선택 적용</button>' +
      '<span id="process-selection-status" class="muted">현재 ' + selectedReportSteps.length + '개 공정</span></div></div>';

    els.results.innerHTML = warningHtml + processHtml + partNoteHtml + '<div class="tabpanels">' + panels + '</div>';

    var processChecks = function () { return Array.from(els.results.querySelectorAll('input[name="report-step"]')); };
    byId('process-all-btn').addEventListener('click', function () { processChecks().forEach(function (box) { box.checked = true; }); });
    byId('process-none-btn').addEventListener('click', function () { processChecks().forEach(function (box) { box.checked = false; }); });
    byId('process-apply-btn').addEventListener('click', function () {
      var steps = processChecks().filter(function (box) { return box.checked; }).map(function (box) { return box.value; });
      if (!steps.length) {
        byId('process-selection-status').textContent = '공정을 하나 이상 선택하세요.';
        setStatus('보고서에 포함할 공정을 하나 이상 선택하세요.', true);
        return;
      }
      selectedReportSteps = reportStepOptions.filter(function (step) { return steps.includes(step); });
      updateReports(true);
      setStatus('선택한 ' + selectedReportSteps.length + '개 공정을 보고서에 적용했습니다.', false);
    });

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
        var done = function () { status.textContent = '복사했습니다.'; setTimeout(function () { status.textContent = ''; }, 2000); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(box.value).then(done).catch(function () { box.select(); document.execCommand('copy'); done(); });
        } else { box.select(); document.execCommand('copy'); done(); }
      });
    });

    setBusy(false);
  }

  function saveExcel() {
    if (!lastOutputs) return;
    var date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    downloadBlob(lastOutputs.stepsWorkbookBytes, 'LOT 공정별 보고서 ' + date + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    setStatus('선택한 공정의 Excel 보고서를 다운로드 폴더에 저장했습니다.', false);
  }

  // ---- 검증결과.zip (validation-run archive, for debugging) --------------------------------
  var README_TEXT = [
    'LOT Tracker 오프라인 (Web) — 검증결과.zip',
    '',
    '이 zip은 이 브라우저 탭에서 "분석 · 보고서 만들기" 버튼을 누를 때마다 자동으로 기록된 내용을 모은 것입니다.',
    '문제가 생겼을 때 이 zip을 그대로 전달하면 어느 파일에서 무엇이 어떻게 처리됐는지 재현할 수 있습니다.',
    '',
    '- session-summary.json : 이번 탭에서 실행한 모든 분석의 요약 (실행 순서, 상태, LOT 수, 오류 등)',
    '- runs/<실행ID>/request.json : 그 실행에 사용한 파일 이름·크기·SHA-256 해시 목록',
    '- runs/<실행ID>/status.json  : 그 실행의 최종 상태 (성공/실패, 분석된 LOT 수, 경고, 오류 위치와 메시지)',
    '- runs/<실행ID>/logs/analysis.jsonl : 그 실행의 단계별 처리 기록 (시간순, 한 줄에 한 단계)',
    '- runs/<실행ID>/inputs/  : 그 실행에 사용한 원본 파일 사본 (최근 ' + KEEP_FULL_RUNS + '회 실행만 보관)',
    '- runs/<실행ID>/outputs/ : 그 실행이 만든 Excel 보고서와 summaries.json (최근 ' + KEEP_FULL_RUNS + '회 실행만 보관)',
    '- runs/<실행ID>/NOTE.txt : 오래되어 원본/결과물 사본이 자동 삭제된 실행에 대한 안내',
    '',
    '이 zip은 다운로드 폴더에만 저장되며, 어디로도 자동 전송되지 않습니다.',
  ].join('\n');

  function runRequestJson(run) {
    return JSON.stringify({ id: run.id, appVersion: run.appVersion, startedAt: run.startedAt, files: run.files }, null, 2);
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
    setStatus('검증결과.zip 준비 중…', false);
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
    zip.file('README.txt', README_TEXT);

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
          outputsFolder.file('LOT 공정별 보고서.xlsx', run.outputs.stepsWorkbookBytes);
          outputsFolder.file('summaries.json', run.outputs.summariesJson);
        }
      } else {
        folder.file('NOTE.txt', '이 실행은 이후 실행이 ' + KEEP_FULL_RUNS + '회 넘게 진행되어 원본 파일 사본과 결과물이 자동 삭제되었습니다.\n실행 기록(request.json / status.json / logs)은 그대로 남아 있습니다.');
      }
    });

    zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } }).then(function (bytes) {
      var stamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadBlob(bytes, '검증결과 ' + stamp + '.zip', 'application/zip');
      setStatus('검증결과.zip을 다운로드 폴더에 저장했습니다. (실행 ' + sessionRuns.length + '건)', false);
    }).catch(function (error) {
      setStatus('검증결과.zip 생성 오류: ' + error.message, true);
    });
  }

  function copyIds() {
    if (!lastMissingIds.length) return;
    var text = lastMissingIds.join('\r\n');
    var done = function () { setStatus(lastMissingIds.length + '개 추가조회 ID를 클립보드에 복사했습니다.', false); };
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
    // Note: sessionRuns (검증결과.zip history) is intentionally NOT cleared here — it should
    // persist for the whole browser tab's lifetime, not just until the next "전체 초기화".
    selected.clear();
    lastSummaries = []; lastMissingIds = []; lastOutputs = null;
    lastWarnings = []; reportStepOptions = []; selectedReportSteps = []; lastRun = null;
    renderFileList();
    els.results.innerHTML = ''; els.tabs.innerHTML = '';
    setStatus('선택을 초기화했습니다.', false);
    setBusy(false);
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
    setStatus('See LOT 파일을 선택하세요. CSV / XLS / XLSX · 최대 500개, 파일당 2MB, 전체 128MB', false);
  });
})();
