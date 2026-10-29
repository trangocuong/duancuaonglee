import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

type EvaluationReport = {
  evaluationNo: string;
  evaluationType: string;
  evaluationContent: string;
  lotNo: string;
  product: string;
  density: string;
  partNo: string;
  quantity: number;
  equipment: string;
  step: string;
  status: string;
  result: string;
  failQty: number;
  yieldRate: number;
  note: string;
};

type TimelineReportItem = {
  stage: string;
  status: string;
  note: string;
};

type CellValue = string | number | null;

const decode = (value?: Uint8Array) => (value ? strFromU8(value) : "");
const encode = (value: string) => strToU8(value);
const xmlEscape = (value: string) =>
  value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const cellBody = (value: CellValue) => {
  if (value === null || value === "") return { type: "", body: "" };
  if (typeof value === "number" && Number.isFinite(value)) {
    return { type: "", body: `<v>${value}</v>` };
  }
  const shown = String(value);
  const preserve = /^\s|\s$|\n/.test(shown) ? ' xml:space="preserve"' : "";
  return {
    type: ' t="inlineStr"',
    body: `<is><t${preserve}>${xmlEscape(shown)}</t></is>`,
  };
};

function setCell(xml: string, reference: string, value: CellValue) {
  const { type, body } = cellBody(value);
  const cellPattern = new RegExp(
    `<c\\b([^>]*\\br="${reference}"[^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/c>)`,
  );
  const existing = xml.match(cellPattern);
  if (existing) {
    const attributes = existing[1].replace(/\s+t="[^"]*"/g, "");
    const replacement = body
      ? `<c${attributes}${type}>${body}</c>`
      : `<c${attributes}/>`;
    return xml.replace(cellPattern, replacement);
  }

  if (!body) return xml;
  const rowNumber = Number(reference.match(/\d+$/)?.[0]);
  const targetColumn = columnNumber(reference);
  const rowPattern = new RegExp(`(<row\\b[^>]*\\br="${rowNumber}"[^>]*>)([\\s\\S]*?)(<\\/row>)`);
  const newCell = `<c r="${reference}"${type}>${body}</c>`;
  if (rowPattern.test(xml)) {
    return xml.replace(rowPattern, (_match, open, content, close) => {
      const cells = Array.from(content.matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g));
      const next = cells.find((cell) => columnNumber(cell[1]) > targetColumn);
      const position = next?.index ?? content.length;
      return `${open}${content.slice(0, position)}${newCell}${content.slice(position)}${close}`;
    });
  }
  return xml.replace("</sheetData>", `<row r="${rowNumber}">${newCell}</row></sheetData>`);
}

function columnNumber(reference: string) {
  const letters = reference.match(/^[A-Z]+/)?.[0] ?? reference;
  return Array.from(letters).reduce(
    (total, letter) => total * 26 + letter.charCodeAt(0) - 64,
    0,
  );
}

const redRichText = (value: CellValue) =>
  `<is><r><rPr><b/><color rgb="FFFF0000"/></rPr><t>${xmlEscape(String(value))}</t></r></is>`;

function setRedCell(xml: string, reference: string, value: CellValue) {
  const cellPattern = new RegExp(
    `<c\\b([^>]*\\br="${reference}"[^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/c>)`,
  );
  const existing = xml.match(cellPattern);
  if (!existing) return setRedCell(setCell(xml, reference, value), reference, value);
  const attributes = existing[1].replace(/\s+t="[^"]*"/g, "");
  return xml.replace(cellPattern, `<c${attributes} t="inlineStr">${redRichText(value)}</c>`);
}

function setFormula(xml: string, reference: string, formula: string, cachedValue: number) {
  const cellPattern = new RegExp(
    `<c\\b([^>]*\\br="${reference}"[^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/c>)`,
  );
  const existing = xml.match(cellPattern);
  if (!existing) return xml;
  const attributes = existing[1].replace(/\s+t="[^"]*"/g, "");
  return xml.replace(
    cellPattern,
    `<c${attributes}><f>${xmlEscape(formula)}</f><v>${cachedValue}</v></c>`,
  );
}

function setHiddenColumnRanges(xml: string, ranges: Array<[number, number]>) {
  return xml.replace(/<cols>[\s\S]*?<\/cols>/, (columns) =>
    columns.replace(/<col\b[^>]*\/>/g, (column) => {
      const min = Number(column.match(/\bmin="(\d+)"/)?.[1]);
      const max = Number(column.match(/\bmax="(\d+)"/)?.[1]);
      const cleaned = column.replace(/\s+hidden="[^"]*"/g, "");
      return ranges.some(([start, end]) => min >= start && max <= end)
        ? cleaned.replace(/\/>$/, ' hidden="1"/>')
        : cleaned;
    }),
  );
}

const noteValue = (note: string, labels: string[]) => {
  for (const label of labels) {
    const match = note.match(
      new RegExp(`(?:^|\\s·\\s)${label}\\s*:\\s*(.*?)(?=\\s·\\s[^:]+\\s*:|$)`, "i"),
    );
    if (match?.[1]) return match[1].trim();
  }
  return "";
};
const noteNumber = (note: string, labels: string[]) => {
  const value = noteValue(note, labels).replace(/%$/, "").trim();
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const failCount = (code: string, result: string, fallback = 0) => {
  const coded = Array.from(code.matchAll(/\*(\d+)/g)).reduce(
    (sum, match) => sum + Number(match[1]),
    0,
  );
  if (coded) return coded;
  const resultCount = Number(result.match(/\b(\d+)\s*F\b/i)?.[1] ?? 0);
  return resultCount || fallback;
};

type StageKey = "smt" | "soldering" | "arts" | "router" | "m045" | "casing" | "aging" | "led" | "interface" | "avi" | "fvi" | "basic" | "packing";

const stageKey = (stage: string): StageKey | null => {
  const value = stage.toUpperCase().replaceAll("_", " ");
  if (/M010|M015|SMT/.test(value)) return "smt";
  if (/M026|SOLDER/.test(value)) return "soldering";
  if (/M031|IARTS|ARTS/.test(value)) return "arts";
  if (/M033|ROUTER/.test(value)) return "router";
  if (/M045/.test(value)) return "m045";
  if (/M087|M120|CASING/.test(value)) return "casing";
  if (/M100|M111|AGING/.test(value)) return "aging";
  if (/M125|LED/.test(value)) return "led";
  if (/M130|INTERFACE|\bLI\b/.test(value)) return "interface";
  if (/M160|\bAVI\b/.test(value)) return "avi";
  if (/M164|\bFVI\b/.test(value)) return "fvi";
  if (/M165|BASIC|AQL/.test(value)) return "basic";
  if (/M170|PACK/.test(value)) return "packing";
  return null;
};

type StageCells = { equipment?: string; input: string; output: string; code: string; fail: string; yield: string };
const stageCells: Partial<Record<StageKey, StageCells>> = {
  smt: { input: "F4", output: "G4", code: "H4", fail: "I4", yield: "J4" },
  soldering: { equipment: "K4", input: "L4", output: "M4", code: "N4", fail: "O4", yield: "P4" },
  router: { equipment: "Q4", input: "R4", output: "S4", code: "T4", fail: "U4", yield: "V4" },
  m045: { equipment: "W4", input: "X4", output: "Y4", code: "Z4", fail: "AA4", yield: "AB4" },
  casing: { equipment: "AC4", input: "AD4", output: "AE4", code: "AF4", fail: "AG4", yield: "AH4" },
  aging: { equipment: "AI4", input: "AJ4", output: "AK4", code: "AL4", fail: "AM4", yield: "AN4" },
  interface: { equipment: "AO4", input: "AP4", output: "AQ4", code: "AR4", fail: "AS4", yield: "AT4" },
  avi: { equipment: "AU4", input: "AV4", output: "AW4", code: "AX4", fail: "AY4", yield: "AZ4" },
  fvi: { input: "BA4", output: "BB4", code: "BC4", fail: "BD4", yield: "BE4" },
  basic: { input: "BF4", output: "BG4", code: "BH4", fail: "BI4", yield: "BJ4" },
  packing: { input: "BK4", output: "BL4", code: "BM4", fail: "BN4", yield: "BO4" },
};

const yieldStageOrder: Array<{ key: StageKey; columns: [number, number] }> = [
  { key: "smt", columns: [6, 10] },
  { key: "soldering", columns: [11, 16] },
  { key: "router", columns: [17, 22] },
  { key: "m045", columns: [23, 28] },
  { key: "casing", columns: [29, 34] },
  { key: "aging", columns: [35, 40] },
  { key: "interface", columns: [41, 46] },
  { key: "avi", columns: [47, 52] },
  { key: "fvi", columns: [53, 57] },
  { key: "basic", columns: [58, 62] },
  { key: "packing", columns: [63, 67] },
];

const departmentForStage = (stage: string) => {
  const key = stageKey(stage);
  if (key === "arts" || key === "aging" || key === "interface") return "HYV 제품기술";
  if (key === "fvi" || key === "packing") return "HYV 제조";
  if (key === "basic") return "HYV 품질";
  return "HYV 공정기술";
};

const styledCell = (reference: string, style: number, value: CellValue) => {
  const { type, body } = cellBody(value);
  return `<c r="${reference}" s="${style}"${type}>${body}</c>`;
};

const styledRedCell = (reference: string, style: number, value: CellValue) =>
  `<c r="${reference}" s="${style}" t="inlineStr">${redRichText(value)}</c>`;

function rebuildDepartmentSummaryLegacy(
  xml: string,
  partNo: string,
  timeline: TimelineReportItem[],
) {
  const active = timeline.map((item) => {
    const equipment = noteValue(item.note, ["EQP", "Equipment", "Machine"]);
    const input = noteNumber(item.note, ["Input", "INPUT"]);
    const output = noteNumber(item.note, ["Output", "OUTPUT"]);
    const code = noteValue(item.note, ["Fail code", "FAIL CODE"]);
    const explicitFail = noteNumber(item.note, ["Fail Qty", "FAIL Q'TY"]);
    const fail = explicitFail ?? (input !== null && output !== null ? Math.max(0, input - output) : null);
    const yieldRate = input !== null && input > 0 && output !== null ? output / input * 100 : null;
    return { item, equipment, input, output, code, fail, yieldRate };
  });

  const headerRows = [2, 3].map((row) =>
    (xml.match(new RegExp(`<row\\b[^>]*\\br="${row}"[^>]*>[\\s\\S]*?<\\/row>`))?.[0] ?? "")
      .replace(/\\s+spans="[^"]*"/, ' spans="3:11"'),
  ).join("");
  const rows = active.map((row, index) => {
    const number = index + 4;
    const result = row.input !== null
      ? `${row.fail ?? 0}F / ${row.input.toLocaleString("en-US")} SET (${row.yieldRate === null ? "-" : `${row.yieldRate.toFixed(2)}%`})${row.code ? ` · ${row.code}` : ""}`
      : "-";
    const hasFailure = Boolean(row.code) && Boolean(row.fail && row.fail >= 1);
    return `<row r="${number}" spans="3:11" s="27" customFormat="1">${[
      styledCell(`C${number}`, 106, index ? null : partNo),
      styledCell(`D${number}`, 29, row.item.stage),
      styledCell(`E${number}`, 60, departmentForStage(row.item.stage)),
      styledCell(`F${number}`, 61, "▷ Yield :"),
      hasFailure ? styledRedCell(`G${number}`, 91, result) : styledCell(`G${number}`, 91, result),
      styledCell(`H${number}`, 92, null),
      styledCell(`J${number}`, 28, row.input),
      hasFailure ? styledRedCell(`K${number}`, 30, row.fail ?? "-") : styledCell(`K${number}`, 30, row.fail ?? "-"),
    ].join("")}</row>`;
  }).join("");
  xml = xml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${headerRows}${rows}</sheetData>`);
  const lastRow = Math.max(3, active.length + 3);
  xml = xml.replace(/<dimension\b[^>]*\bref="[^"]+"\/>/, `<dimension ref="C2:K${lastRow}"/>`);
  xml = xml.replace(/<selection\b[^>]*\/>/, '<selection activeCell="C2" sqref="C2"/>');
  const mergeRefs = ["C2:H2", "F3:H3"];
  if (active.length > 1) mergeRefs.push(`C4:C${lastRow}`);
  for (let row = 4; row <= lastRow; row++) mergeRefs.push(`G${row}:H${row}`);
  const mergeXml = `<mergeCells count="${mergeRefs.length}">${mergeRefs.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`;
  xml = /<mergeCells\b[\s\S]*?<\/mergeCells>/.test(xml)
    ? xml.replace(/<mergeCells\b[\s\S]*?<\/mergeCells>/, mergeXml)
    : xml.replace("</worksheet>", `${mergeXml}</worksheet>`);
  return xml;
}

function setRowHidden(xml: string, rowNumber: number, hidden: boolean) {
  const rowPattern = new RegExp(`<row\\b([^>]*\\br="${rowNumber}"[^>]*)>`);
  return xml.replace(rowPattern, (_match, attributes) => {
    const cleaned = attributes.replace(/\\s+hidden="[^"]*"/g, "");
    return `<row${cleaned}${hidden ? ' hidden="1"' : ""}>`;
  });
}

function updateDepartmentSummary(
  xml: string,
  evaluation: EvaluationReport,
  timeline: TimelineReportItem[],
) {
  const grouped = new Map<StageKey, TimelineReportItem>();
  for (const item of timeline) {
    const key = stageKey(item.stage);
    if (key) grouped.set(key, item);
  }
  const stages: Array<{ key: StageKey; label: string }> = [
    { key: "smt", label: "SMT (M010/M015)" },
    { key: "soldering", label: "Soldering (M026)" },
    { key: "arts", label: "iARTs (M031)" },
    { key: "router", label: "Router (M033)" },
    { key: "m045", label: "M045" },
    { key: "casing", label: "Casing (M087)" },
    { key: "aging", label: "Aging Test (M100-M111)" },
    { key: "led", label: "Led Test (M125)" },
    { key: "interface", label: "Interface Test (M130)" },
    { key: "avi", label: "AVI (M160)" },
    { key: "fvi", label: "FVI (M164)" },
    { key: "basic", label: "BASIC (M165)" },
  ];
  const lastUpdated = stages.reduce(
    (latest, stage, index) => grouped.has(stage.key) ? index : latest,
    -1,
  );
  const visibleStages = stages.filter(
    (stage, index) => index > lastUpdated || grouped.has(stage.key),
  );
  const rows = visibleStages.map((stage) => {
    const item = grouped.get(stage.key);
    if (!item) return { stage, item: null, input: null, fail: null, code: "", yieldRate: null };
    const explicitInput = noteNumber(item.note, ["Input", "INPUT"]);
    const explicitOutput = noteNumber(item.note, ["Output", "OUTPUT"]);
    const code = noteValue(item.note, ["Fail code", "FAIL CODE"]);
    const explicitFail = noteNumber(item.note, ["Fail Qty", "FAIL Q'TY"]);
    const result = noteValue(item.note, ["Result", "RESULT"]);
    const fail = explicitFail ?? (
      explicitInput !== null && explicitOutput !== null
        ? Math.max(0, explicitInput - explicitOutput)
        : failCount(code, result, 0)
    );
    const input = explicitInput ?? Math.max(0, evaluation.quantity || 0);
    const output = explicitOutput ?? (
      item.status === "Hoàn thành" ? Math.max(0, input - fail) : null
    );
    const yieldRate = input > 0 && output !== null ? output / input * 100 : null;
    return { stage, item, input, fail, code, yieldRate };
  });
  xml = setCell(xml, "C4", evaluation.partNo || evaluation.product);
  for (let index = 0; index < stages.length; index++) {
    const rowNumber = index + 4;
    const row = rows[index];
    xml = setRowHidden(xml, rowNumber, !row);
    if (!row) {
      xml = setCell(xml, `G${rowNumber}`, null);
      xml = setCell(xml, `J${rowNumber}`, null);
      xml = setCell(xml, `K${rowNumber}`, null);
      continue;
    }
    const result = row.input !== null
      ? `${row.fail ?? 0}F / ${row.input.toLocaleString("en-US")} SET (${row.yieldRate === null ? "-" : `${row.yieldRate.toFixed(2)}%`})${row.code ? ` · ${row.code}` : ""}`
      : "-";
    xml = setCell(xml, `D${rowNumber}`, row.stage.label);
    xml = setCell(xml, `E${rowNumber}`, departmentForStage(row.stage.label));
    xml = setCell(xml, `F${rowNumber}`, "▷ Yield :");
    // Preserve the template's original font, colour and cell style on sheet 1.
    xml = setCell(xml, `G${rowNumber}`, result);
    xml = setCell(xml, `J${rowNumber}`, row.input);
    xml = setCell(xml, `K${rowNumber}`, row.item ? row.fail ?? "-" : null);
  }
  return xml;
}

export function evaluationReportTitle(
  evaluation: Pick<EvaluationReport, "evaluationType" | "evaluationContent" | "evaluationNo" | "product" | "lotNo">,
) {
  return [
    "Evaluation",
    evaluation.evaluationType,
    evaluation.evaluationContent,
    evaluation.evaluationNo ? `No ${evaluation.evaluationNo}` : "",
    evaluation.product || evaluation.lotNo,
  ].filter(Boolean).join(" ").replace(/[\\/:*?"<>|]+/g, "-");
}

export function buildEvaluationReport(
  template: Uint8Array,
  evaluation: EvaluationReport,
  timeline: TimelineReportItem[],
) {
  const archive = unzipSync(template);
  let summary = decode(archive["xl/worksheets/sheet1.xml"]);
  let yieldSheet = decode(archive["xl/worksheets/sheet2.xml"]);
  let workbook = decode(archive["xl/workbook.xml"]);
  if (!summary || !yieldSheet || !workbook) throw new Error("Không đọc được file Excel mẫu.");

  const title = evaluationReportTitle(evaluation);
  const partNo = evaluation.partNo || evaluation.product;
  const quantity = Math.max(0, evaluation.quantity || 0);
  const grouped = new Map<StageKey, TimelineReportItem>();
  for (const item of timeline) {
    const key = stageKey(item.stage);
    if (key) grouped.set(key, item);
  }

  yieldSheet = setCell(yieldSheet, "B1", `■ ${title}`);
  yieldSheet = setCell(yieldSheet, "B4", partNo);
  yieldSheet = setCell(yieldSheet, "C4", evaluation.lotNo);
  yieldSheet = setCell(yieldSheet, "D4", evaluation.equipment || "-");
  yieldSheet = setCell(yieldSheet, "E4", quantity);
  yieldSheet = setCell(yieldSheet, "E5", quantity);
  yieldSheet = setCell(
    yieldSheet,
    "BP4",
    [evaluation.status, evaluation.result !== "-" ? evaluation.result : ""]
      .filter(Boolean)
      .join(" / "),
  );

  summary = setCell(summary, "C2", title);
  summary = updateDepartmentSummary(summary, evaluation, timeline);

  for (const [key, cells] of Object.entries(stageCells) as Array<[
    StageKey,
    StageCells,
  ]>) {
    const item = grouped.get(key);
    const code = item ? noteValue(item.note, ["Fail code", "FAIL CODE"]) : "";
    const result = item ? noteValue(item.note, ["Result", "RESULT"]) : "";
    const equipment = item
      ? noteValue(item.note, ["EQP", "Equipment", "Machine"])
      : "";
    const completed = item?.status === "Hoàn thành";
    const started = Boolean(item);
    const explicitInput = item ? noteNumber(item.note, ["Input", "INPUT"]) : null;
    const explicitOutput = item ? noteNumber(item.note, ["Output", "OUTPUT"]) : null;
    const explicitFail = item ? noteNumber(item.note, ["Fail Qty", "FAIL Q'TY"]) : null;
    const count = explicitFail ?? (explicitInput !== null && explicitOutput !== null
      ? Math.max(0, explicitInput - explicitOutput)
      : item ? failCount(code, result, timeline.length === 1 ? evaluation.failQty : 0) : 0);
    const input = explicitInput ?? (started ? quantity : null);
    const output = explicitOutput ?? (completed && input !== null ? Math.max(0, input - count) : null);
    const yieldValue = input !== null && input > 0 && output !== null ? output / input : null;

    if (cells.equipment) yieldSheet = setCell(yieldSheet, cells.equipment, equipment || null);
    yieldSheet = setCell(yieldSheet, cells.input, input);
    yieldSheet = setCell(yieldSheet, cells.output, output);
    yieldSheet = code && count >= 1 ? setRedCell(yieldSheet, cells.code, code) : setCell(yieldSheet, cells.code, code || (item ? "-" : null));
    yieldSheet = count > 0 ? setRedCell(yieldSheet, cells.fail, count) : setCell(yieldSheet, cells.fail, item ? "-" : null);
    yieldSheet = yieldValue === null
      ? setCell(yieldSheet, cells.yield, item ? "-" : null)
      : setFormula(yieldSheet, cells.yield, `IFERROR(${cells.output}/${cells.input}*100%,"-")`, yieldValue);
    const totalInput = cells.input.replace(/4$/, "5");
    const totalOutput = cells.output.replace(/4$/, "5");
    const totalCode = cells.code.replace(/4$/, "5");
    const totalFail = cells.fail.replace(/4$/, "5");
    const totalYield = cells.yield.replace(/4$/, "5");
    yieldSheet = setCell(yieldSheet, totalInput, input);
    yieldSheet = setCell(yieldSheet, totalOutput, output);
    yieldSheet = setCell(yieldSheet, totalCode, item ? "-" : null);
    yieldSheet = count > 0 ? setRedCell(yieldSheet, totalFail, count) : setCell(yieldSheet, totalFail, item ? "-" : null);
    yieldSheet = yieldValue === null
      ? setCell(yieldSheet, totalYield, item ? "-" : null)
      : setFormula(yieldSheet, totalYield, `IFERROR(${totalOutput}/${totalInput}*100%,"-")`, yieldValue);

  }

  const lastUpdatedStage = yieldStageOrder.reduce(
    (latest, stage, index) => grouped.has(stage.key) ? index : latest,
    -1,
  );
  const hiddenInternalStages = yieldStageOrder
    .slice(0, Math.max(0, lastUpdatedStage))
    .filter((stage) => !grouped.has(stage.key))
    .map((stage) => stage.columns);
  yieldSheet = setHiddenColumnRanges(yieldSheet, hiddenInternalStages);

  workbook = workbook.includes("<calcPr")
    ? workbook.replace(
        /<calcPr\b[^>]*\/>/,
        '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>',
      )
    : workbook.replace(
        "</workbook>",
        '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>',
      );
  archive["xl/worksheets/sheet1.xml"] = encode(summary);
  archive["xl/worksheets/sheet2.xml"] = encode(yieldSheet);
  archive["xl/workbook.xml"] = encode(workbook);
  delete archive["xl/calcChain.xml"];
  const contentTypes = decode(archive["[Content_Types].xml"])
    .replace(/<Override\b[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/g, "");
  const workbookRelationships = decode(archive["xl/_rels/workbook.xml.rels"])
    .replace(/<Relationship\b[^>]*Type="[^"]*\/calcChain"[^>]*\/>/g, "");
  archive["[Content_Types].xml"] = encode(contentTypes);
  archive["xl/_rels/workbook.xml.rels"] = encode(workbookRelationships);
  return zipSync(archive, { level: 6 });
}
