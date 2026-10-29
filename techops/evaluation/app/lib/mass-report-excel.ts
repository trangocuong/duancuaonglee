import { strToU8, zipSync } from "fflate";

type Stage = { equipment: string; input: number; output: number; scrap: string; fail: number; yield: number };
type Lot = { partNo: string; lotNo: string; quantity: number; status?: string; stages: Record<string, Stage> };
type Report = {
  evaluationNo: string; evaluationType: string; classification: string; product: string;
  formFactor: string; startStep: string; partId: string; density: string; lane: string;
  quantity: number; status: string; lots: Lot[];
};

const escapeXml = (value: unknown) => String(value ?? "")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const col = (index: number): string => {
  let result = "";
  for (let position = index + 1; position; position = Math.floor((position - 1) / 26)) result = String.fromCharCode(65 + (position - 1) % 26) + result;
  return result;
};
const cell = (column: number, row: number, value: string | number, style = 0) => {
  const ref = `${col(column)}${row}`;
  return typeof value === "number" && Number.isFinite(value)
    ? `<c r="${ref}" s="${style}"><v>${value}</v></c>`
    : `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
};

export function buildMassReportExcel(report: Report, allStages: string[]) {
  const stages = allStages.slice(Math.max(0, allStages.indexOf(report.startStep)), 11);
  const lots = report.lots.filter((lot) => lot.partNo && lot.lotNo);
  const lastColumn = col(4 + stages.length * 6);
  const rows: string[] = [];
  const merges: string[] = [`A1:${lastColumn}1`];
  rows.push(`<row r="1" ht="31" customHeight="1">${cell(0, 1, `BÁO CÁO ${report.evaluationType} · NO. ${report.evaluationNo}`, 1)}</row>`);
  const info = [
    ["No.", report.evaluationNo, "Start Step", report.startStep, "Density", report.density.split(", ").join("\n")],
    ["Eval Type", report.evaluationType, "Part ID", report.partId, "", ""],
    ["Phân loại", report.classification, "Q'ty", report.quantity, "", ""],
    ["Product / Model", report.product, "ASSY Lane", report.lane, "", ""],
    ["Form Factor", report.formFactor, "Status", report.status, "", ""],
  ] as (string | number)[][];
  for (let index = 0; index < info.length; index++) {
    const rowNo = index + 2;
    rows.push(`<row r="${rowNo}" ht="${index === 0 ? 35 : 28}" customHeight="1">${info[index].map((value, column) => cell(column, rowNo, value, column % 2 === 0 ? 2 : 3)).join("")}</row>`);
  }
  rows.push(`<row r="8" ht="29" customHeight="1">${[
    cell(0, 8, "Part No.", 4), cell(1, 8, "LOT NO.", 4), cell(2, 8, "Data", 4), cell(3, 8, "Q'ty", 4),
    ...stages.map((stage, index) => cell(4 + index * 6, 8, stage, 4)),
    cell(4 + stages.length * 6, 8, "Status", 4),
  ].join("")}</row>`);
  for (let index = 0; index < stages.length; index++) merges.push(`${col(4 + index * 6)}8:${col(9 + index * 6)}8`);
  const detailHeaders = ["EQP", "IN", "OUT", "SCRAP", "FAIL", "YLD"];
  rows.push(`<row r="9" ht="25" customHeight="1">${stages.flatMap((stage, index) => detailHeaders.map((header, offset) => cell(4 + index * 6 + offset, 9, header, header === "SCRAP" || header === "FAIL" ? 7 : 4))).join("")}</row>`);
  for (const index of [0, 1, 2, 3, 4 + stages.length * 6]) merges.push(`${col(index)}8:${col(index)}9`);
  const totals = stages.map((stage) => {
    const stageRows = lots.map((lot) => lot.stages?.[stage]).filter((value): value is Stage => Boolean(value));
    let input = stageRows.reduce((sum, value) => sum + (Number(value.input) || 0), 0);
    let output = stageRows.reduce((sum, value) => sum + (Number(value.output) || 0), 0);
    const fail = stageRows.reduce((sum, value) => sum + (Number(value.fail) || 0), 0);
    if ([allStages[0], allStages[2]].includes(stage)) {
      const routerInput = lots.reduce((sum, lot) => sum + (Number(lot.stages?.[allStages[3]]?.input) || 0), 0);
      if (routerInput) { output = routerInput; input = routerInput + (stage === allStages[2] ? fail : 0); }
    }
    return [cell(4 + stages.indexOf(stage) * 6, 10, "—", 5), cell(5 + stages.indexOf(stage) * 6, 10, input || "-", 5),
      cell(6 + stages.indexOf(stage) * 6, 10, output || "-", 5), cell(7 + stages.indexOf(stage) * 6, 10, "—", 5),
      cell(8 + stages.indexOf(stage) * 6, 10, fail || "-", fail ? 6 : 5),
      cell(9 + stages.indexOf(stage) * 6, 10, input ? `${(output / input * 100).toFixed(2)}%` : "-", 5)].join("");
  });
  rows.push(`<row r="10" ht="27" customHeight="1">${cell(0, 10, "TỔNG", 5)}${cell(3, 10, lots.reduce((sum, lot) => sum + (Number(lot.quantity) || 0), 0), 5)}${totals.join("")}</row>`);
  merges.push("A10:B10");
  for (let index = 0; index < lots.length; index++) {
    const lot = lots[index], rowNo = index + 11, cells = [
      cell(0, rowNo, lot.partNo, 3), cell(1, rowNo, lot.lotNo, 3), cell(2, rowNo, lot.stages && Object.keys(lot.stages).length ? "✓" : "", 3),
      cell(3, rowNo, Number(lot.quantity) || 0, 3),
    ];
    for (let offset = 0; offset < stages.length; offset++) {
      const stage = lot.stages?.[stages[offset]], start = 4 + offset * 6;
      const values = stage ? [stage.equipment || "", Number(stage.input) || 0, Number(stage.output) || 0, stage.scrap || "", Number(stage.fail) || 0,
        stage.input ? `${(stage.output / stage.input * 100).toFixed(2)}%` : ""] : ["", "", "", "", "", ""];
      for (let column = 0; column < 6; column++) cells.push(cell(start + column, rowNo, values[column], stage && stage.fail >= 1 && (column === 3 || column === 4) ? 6 : 3));
    }
    cells.push(cell(4 + stages.length * 6, rowNo, lot.status || "", 3));
    rows.push(`<row r="${rowNo}" ht="26" customHeight="1">${cells.join("")}</row>`);
  }
  const columnWidths = [31, 17, 10, 11, ...stages.flatMap(() => [18, 11, 11, 16, 11, 12]), 19];
  const columns = columnWidths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane xSplit="4" ySplit="10" topLeftCell="E11" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><cols>${columns}</cols><sheetData>${rows.join("")}</sheetData><mergeCells count="${merges.length}">${merges.map((range) => `<mergeCell ref="${range}"/>`).join("")}</mergeCells></worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFDF1F33"/><name val="Arial"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF225789"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD6EFFF"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8F4FF"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBAC9D9"/></left><right style="thin"><color rgb="FFBAC9D9"/></right><top style="thin"><color rgb="FFBAC9D9"/></top><bottom style="thin"><color rgb="FFBAC9D9"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="4" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="4" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="2" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Update các Lot đánh giá" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(worksheet),
    "xl/styles.xml": strToU8(styles),
  };
  return zipSync(files, { level: 6 });
}
