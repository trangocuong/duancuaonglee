(function (global) {
  'use strict';
  var NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  var IDENTITY = ['PART NO', 'SMT RUNID', 'QTY', 'PROC_ID', 'EVAL', 'TIER', 'OPT'];
  var BLOCKS = [
    ['SMT', false], ['M033', true], ['M087', true], ['M100', true], ['M111', false],
    ['M130', true], ['M160', true], ['M164', true], ['M165', true]
  ];
  var TOP = IDENTITY.slice(), SUB = Array(7).fill('');
  var KINDS = ['text', 'text', 'number', 'text', 'text', 'text', 'text'];
  var METRIC_COLUMNS = [];
  BLOCKS.forEach(function (block) {
    var width = block[1] ? 9 : 6;
    TOP.push(block[0]);
    for (var offset = 1; offset < width; offset++) TOP.push('');
    if (block[1]) { SUB.push('Mutation', 'Change LOT', 'QTY'); KINDS.push('text', 'text', 'number'); }
    METRIC_COLUMNS.push(SUB.length);
    SUB.push('EQP', 'IN', 'OUT', 'SCRAP', 'FAIL', 'YLD');
    KINDS.push('text', 'number', 'number', 'number', 'number', 'percent');
  });
  function fail(message) { throw Error(message); }
  function children(node, name) {
    return Array.from(node.childNodes).filter(function (item) { return item.nodeType === 1 && item.localName === name; });
  }
  function one(node, name) { return children(node, name)[0] || null; }
  function parseXml(text) {
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) fail('내장 Excel 서식을 읽을 수 없습니다. HTML 파일을 다시 받아 주세요.');
    return doc;
  }
  function column(index) {
    var name = '', value = index + 1;
    while (value > 0) { value--; name = String.fromCharCode(65 + value % 26) + name; value = Math.floor(value / 26); }
    return name;
  }
  function blank(value) { return value == null || value === ''; }
  function normalized(value) { return String(value == null ? '' : value).trim().toUpperCase(); }
  function numberValue(value, percentage) {
    if (typeof value === 'number') { if (!Number.isFinite(value)) fail('보고서에 저장할 수 없는 숫자가 있습니다.'); return value; }
    var text = String(value).trim().replace(/,/g, ''), hasPercent = percentage && /%$/.test(text);
    if (hasPercent) text = text.slice(0, -1).trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) fail('보고서 수량·수율 값이 숫자가 아닙니다.');
    var valueAsNumber = Number(text);
    if (!Number.isFinite(valueAsNumber)) fail('보고서에 저장할 수 없는 숫자가 있습니다.');
    return hasPercent ? valueAsNumber / 100 : valueAsNumber;
  }
  function compatible(matrix) {
    return Array.isArray(matrix) && matrix.length >= 2 && matrix.every(function (row) { return Array.isArray(row) && row.length === 82; })
      && TOP.every(function (value, col) { return normalized(value) === normalized(matrix[0][col]); })
      && SUB.every(function (value, col) { return normalized(value) === normalized(matrix[1][col]); });
  }
  function validateMerges(matrix) {
    var occupied = new Set();
    return (matrix.lotTrackerMerges || []).map(function (merge) {
      var start = merge.s, end = merge.e;
      if (![start.r, start.c, end.r, end.c].every(Number.isInteger) || start.r < 2 || end.r <= start.r || end.r >= matrix.length
        || start.c !== end.c || start.c < 0 || start.c >= 82) fail('보고서의 셀 병합 범위가 올바르지 않습니다.');
      for (var row = start.r; row <= end.r; row++) {
        var key = row + ':' + start.c;
        if (occupied.has(key)) fail('보고서의 셀 병합 범위가 겹칩니다.');
        occupied.add(key);
        if (row !== start.r && !blank(matrix[row][start.c])) fail('셀 병합으로 다른 LOT의 값이 가려질 수 있습니다.');
      }
      return merge;
    });
  }
  // A signed mutation QTY (+ merged in, - merged out) keeps its displayed sign as text.
  function signedQty(col, value) { return SUB[col] === 'QTY' && /^[+-]/.test(String(value).trim()); }
  function cell(doc, row, col, value, style) {
    var element = doc.createElementNS(NS, 'c');
    element.setAttribute('r', column(col + 1) + row);
    element.setAttribute('s', String(style));
    if (blank(value)) return element;
    if (KINDS[col] !== 'text' && !signedQty(col, value)) {
      var numeric = doc.createElementNS(NS, 'v');
      numeric.textContent = String(numberValue(value, KINDS[col] === 'percent'));
      element.appendChild(numeric);
    } else {
      element.setAttribute('t', 'inlineStr');
      var inline = doc.createElementNS(NS, 'is'), text = doc.createElementNS(NS, 't');
      text.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
      text.textContent = String(value); inline.appendChild(text); element.appendChild(inline);
    }
    return element;
  }
  async function exportBuiltin(matrix) {
    if (!compatible(matrix)) fail('보고서의 공정·열 구성이 내장 v3 서식과 다릅니다.');
    if (matrix.length > 100002) fail('보고서는 100000행까지 저장할 수 있습니다.');
    var built = global.LOTTrackerBuiltinTemplate;
    if (!built || !global.JSZip) fail('내장 Excel 서식을 사용할 수 없습니다. HTML 파일을 다시 받아 주세요.');
    var merges = validateMerges(matrix);
    var bytes = Uint8Array.from(atob(built.base64), function (character) { return character.charCodeAt(0); });
    var zip = await global.JSZip.loadAsync(bytes);
    var doc = parseXml(await zip.file('xl/worksheets/sheet1.xml').async('string'));
    var root = doc.documentElement, data = one(root, 'sheetData'), style = built.info.styles;
    children(data, 'row').forEach(function (row) { if (Number(row.getAttribute('r')) >= 4) data.removeChild(row); });
    for (var index = 2; index < matrix.length; index++) {
      var row = doc.createElementNS(NS, 'row'); row.setAttribute('r', String(index + 2));
      var lineCount = Math.max(1, ...matrix[index].map(function (value) { return String(value == null ? '' : value).split(/\r?\n/).length; }));
      var height = built.info.rowHeight * Math.min(6, lineCount);
      row.setAttribute('ht', String(height)); row.setAttribute('customHeight', '1');
      var inactiveColumns = new Set();
      METRIC_COLUMNS.forEach(function (first) {
        if (matrix[index].slice(first, first + 6).every(blank)) for (var col = first; col < first + 6; col++) inactiveColumns.add(col);
      });
      for (var col = 0; col < 82; col++) {
        // Yield: 100% and above uses the v3 0.0% style, below 100% its 0.00% twin.
        var cellStyle = KINDS[col] !== 'percent' ? style.normal
          : !blank(matrix[index][col]) && numberValue(matrix[index][col], true) < 1 ? style.percentFine : style.percent;
        if (SUB[col] === 'Change LOT') cellStyle = style.text;
        if (String(matrix[index][col] || '').includes('\n')) cellStyle = style.wrap;
        if (inactiveColumns.has(col)) cellStyle = KINDS[col] === 'percent' ? style.emptyPercent : style.empty;
        row.appendChild(cell(doc, index + 2, col, matrix[index][col], cellStyle));
      }
      data.appendChild(row);
    }
    // Covered cells retain their anchor formatting, including the white shared
    // SMT/RT band. Blank covered values must not appear as inactive grey steps.
    var cellsByAddress = new Map();
    children(data, 'row').forEach(function (row) { children(row, 'c').forEach(function (item) { cellsByAddress.set(item.getAttribute('r'), item); }); });
    merges.forEach(function (merge) {
      var anchor = cellsByAddress.get(column(merge.s.c + 1) + (merge.s.r + 2));
      for (var row = merge.s.r + 1; row <= merge.e.r; row++) cellsByAddress.get(column(merge.s.c + 1) + (row + 2)).setAttribute('s', anchor.getAttribute('s'));
    });
    one(root, 'dimension').setAttribute('ref', 'A1:CE' + (matrix.length + 1));
    var mergeList = one(root, 'mergeCells');
    merges.forEach(function (merge) {
      var element = doc.createElementNS(NS, 'mergeCell');
      element.setAttribute('ref', column(merge.s.c + 1) + (merge.s.r + 2) + ':' + column(merge.e.c + 1) + (merge.e.r + 2));
      mergeList.appendChild(element);
    });
    mergeList.setAttribute('count', String(children(mergeList, 'mergeCell').length));
    if (matrix.length > 2) {
      // Signed QTY text is intentional; keep Excel from offering to convert it.
      var ignored = one(root, 'ignoredErrors');
      if (!ignored) {
        ignored = doc.createElementNS(NS, 'ignoredErrors');
        var later = ['smartTags', 'drawing', 'legacyDrawing', 'legacyDrawingHF', 'drawingHF', 'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst'];
        root.insertBefore(ignored, Array.from(root.childNodes).find(function (item) { return item.nodeType === 1 && later.indexOf(item.localName) >= 0; }) || null);
      }
      var ignoredError = doc.createElementNS(NS, 'ignoredError');
      ignoredError.setAttribute('sqref', SUB.map(function (name, col) { return name === 'QTY' ? column(col + 1) + '4:' + column(col + 1) + (matrix.length + 1) : ''; }).filter(Boolean).join(' '));
      ignoredError.setAttribute('numberStoredAsText', '1');
      ignored.appendChild(ignoredError);
    }
    zip.file('xl/worksheets/sheet1.xml', new XMLSerializer().serializeToString(doc));
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }
  global.LOTTrackerTemplate = { exportBuiltin: exportBuiltin };
})(window);
