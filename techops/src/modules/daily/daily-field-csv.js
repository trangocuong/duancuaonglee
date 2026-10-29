// CSV interchange for administrator-managed daily field definitions.
export const FIELD_HEADERS = ["항목명", "영문명", "베트남어명", "입력유형", "순서", "상위항목", "선택값", "선택순서", "상위선택값"];
export function fieldCsv(rows) {
  const cell = value => {
    let s = String(value ?? "");
    // Excel must treat user-entered formulas as text. The importer reverses this prefix.
    if (/^(?:'|[\s]*[=+@-])/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return '\uFEFF' + [FIELD_HEADERS, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function parseFieldCsv(source) {
  if (new TextEncoder().encode(source).length > 1024 * 1024) throw new Error('size');
  const text = source.replace(/^\uFEFF/, '');
  const rows = []; let row = [], value = '', quoted = false, ended = false;
  const endCell = () => { row.push(value); value = ''; ended = false; };
  const endRow = () => { endCell(); if (row.some(v => v.trim())) rows.push(row); row = []; if (rows.length > 501) throw new Error('rows'); };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { value += '"'; i++; } else { quoted = false; ended = true; } }
      else value += ch;
    } else if (ch === ',') endCell();
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; endRow(); }
    else if (ch === '"' && !value && !ended) quoted = true;
    else { if (ended || ch === '"') throw new Error('csv'); value += ch; }
  }
  if (quoted) throw new Error('csv');
  if (value || row.length || ended) endRow();
  if (!rows.length || rows[0].length !== FIELD_HEADERS.length || !rows[0].every((v, i) => v.trim() === FIELD_HEADERS[i])) throw new Error('header');
  return rows.slice(1).map(row => row.map(v => v.replace(/\r\n?/g, '\n').replace(/^'(?='|\s*[=+@-])/, '').trim()));
}
