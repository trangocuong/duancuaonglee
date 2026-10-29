import { strFromU8, unzipSync } from "fflate";

export type ImportedTimeline = {
  stage: string;
  eventDate: string;
  status: "Chờ thực hiện" | "Đang thực hiện" | "Hoàn thành" | "Hold";
  note: string;
};

export type ImportedEvaluation = {
  importMode?: "full" | "process-history";
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
  owner: string;
  startDate: string;
  targetDate: string;
  status: "Chờ thực hiện" | "Đang đánh giá" | "Hold" | "Hoàn thành";
  result: "-" | "PASS" | "FAIL";
  progress: number;
  failQty: number;
  yieldRate: number;
  note: string;
  timelines: ImportedTimeline[];
};

export type WorkbookImport = {
  fileName: string;
  sheets: string[];
  evaluations: ImportedEvaluation[];
  skippedRows: number;
  warnings: string[];
};

export type SeeWipRecord = {
  lot: string;
  partNo: string;
  quantity: number;
  step: string;
  equipment: string;
};

export type SeeWipDatabase = {
  fileName: string;
  records: SeeWipRecord[];
};

export type SeeLotManualPrefill = {
  fileName: string;
  lotId: string;
  smtLot: string;
  lotCurrent: string;
  partNo: string;
  lane: string;
  quantity: number;
  planDateIn: string;
  stages: Array<{
    stage: string;
    equipment: string;
    trackIn: string;
    trackOut: string;
    inputQty: string;
    outputQty: string;
    failCode: string;
    reason: string;
  }>;
  startsFromSmt: boolean;
  warnings: string[];
};

type CellValue = string | number | boolean | null;

const decoder = (bytes?: Uint8Array) => bytes ? strFromU8(bytes) : "";
const unescapeXml = (value: string) => value
  .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"').replaceAll("&apos;", "'");
const textRuns = (xml: string) => Array.from(xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g), match => unescapeXml(match[1])).join("");
const columnIndex = (reference: string) => {
  const letters = reference.match(/[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
};
const normalizeType = (value: unknown): ImportedEvaluation["evaluationType"] | null => {
  const type = String(value ?? "").trim().toUpperCase().replaceAll(".", "");
  return type === "DOE" || type === "PFQ" || type === "PRQ" || type === "FQ" ? type : null;
};

const PROCESS_STAGES = [
  { name: "SMT (M010/M015)", codes: ["M010", "M015"] },
  { name: "Soldering (M026)", codes: ["M026"] },
  { name: "iARTs (M031)", codes: ["M031"] },
  { name: "Router (M033)", codes: ["M033"] },
  { name: "M045", codes: ["M045"] },
  { name: "Casing (M087/M120)", codes: ["M087", "M120"] },
  { name: "Aging (M100/M111)", codes: ["M100", "M111"] },
  { name: "LED Test (M125)", codes: ["M125"] },
  { name: "Interface (M130)", codes: ["M130"] },
  { name: "AVI (M160)", codes: ["M160"] },
  { name: "FVI (M164)", codes: ["M164"] },
  { name: "Basic (M165)", codes: ["M165"] },
  { name: "Packing (M170)", codes: ["M170"] },
];

const formatManualDateTime = (value: string) => value
  ? `${value.slice(0, 4)}/${value.slice(5, 7)}/${value.slice(8, 10)} ${value.slice(11, 19)}`
  : "";

function rowsToProcessHistory(sheetName: string, rows: CellValue[][], warnings: string[]) {
  const headerIndex = rows.findIndex((row) => {
    const cells = row.map((value) => clean(value).toUpperCase());
    return cells.includes("EVENT_NAME") && cells.includes("DATE/TIME") && cells.includes("STEP");
  });
  if (headerIndex < 0) return { evaluations: [] as ImportedEvaluation[], skipped: 0 };
  const headers = rows[headerIndex].map((value) => clean(value).toUpperCase());
  const eventCol = headers.indexOf("EVENT_NAME");
  const dateCol = headers.indexOf("DATE/TIME");
  const stepCol = headers.indexOf("STEP");
  const eqpCol = headers.indexOf("EQP");
  const changeValueCol = headers.indexOf("CHG_VALS");
  const commentCol = headers.indexOf("COMMENT");
  const quantityColumns = headers.map((value, index) => value === "QTY" ? index : -1).filter((index) => index >= 0);
  const processQtyCol = quantityColumns[0] ?? -1;
  const changeQtyCol = quantityColumns[1] ?? processQtyCol;
  const records = rows.slice(headerIndex + 1).map((row, offset) => ({
    row,
    rowNumber: headerIndex + offset + 2,
    event: clean(row[eventCol]),
    eventUpper: clean(row[eventCol]).toUpperCase(),
    date: excelDate(row[dateCol], true),
    dateValue: Number(row[dateCol]) || 0,
    step: clean(row[stepCol]).toUpperCase(),
    equipment: clean(row[eqpCol]),
    changeValue: clean(row[changeValueCol]).toUpperCase(),
    processQty: numberValue(row[processQtyCol]),
    changeQty: numberValue(row[changeQtyCol]),
    comment: clean(row[commentCol]),
  })).filter((record) => record.event && record.step);
  const lotCandidates = records
    .filter((record) => /^(SPLIT|MERGE)$/.test(record.eventUpper) && /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{8,14}$/.test(record.changeValue))
    .sort((a, b) => a.dateValue - b.dateValue);
  const lotNo = lotCandidates[0]?.changeValue ?? "";
  if (!lotNo) {
    warnings.push(`${sheetName}: không xác định được Lot từ sự kiện Split/Merge.`);
    return { evaluations: [] as ImportedEvaluation[], skipped: records.length };
  }
  const timelines: ImportedTimeline[] = [];
  let totalFailQty = 0;
  let maximumInput = 0;
  let previousTrackOutDateValue = 0;
  for (const stage of PROCESS_STAGES) {
    const stageRecords = records.filter((record) => stage.codes.includes(record.step)).sort((a, b) => a.dateValue - b.dateValue);
    if (!stageRecords.length) continue;
    const trackIn = stageRecords.find((record) => record.eventUpper === "TRACKIN");
    const trackOut = [...stageRecords].reverse().find((record) => record.eventUpper === "TRACKOUT");
    const scraps = stageRecords.filter((record) => record.eventUpper === "SCRAP");
    const failQty = scraps.reduce((sum, record) => sum + (record.changeQty || 0), 0);
    totalFailQty += failQty;
    const inferredQty = Math.max(0, ...stageRecords.map((record) => record.processQty));
    const input = trackIn?.processQty || inferredQty;
    const output = trackOut?.processQty || Math.max(0, input - failQty);
    maximumInput = Math.max(maximumInput, input);
    const equipment = clean((trackOut?.equipment && trackOut.equipment !== "-") ? trackOut.equipment : trackIn?.equipment);
    const latest = stageRecords.at(-1)!;
    const terminated = stageRecords.some((record) => record.eventUpper === "TERMINATED");
    const latestHold = [...stageRecords].reverse().find((record) => record.eventUpper === "HOLD" || record.eventUpper === "RELEASE");
    const status: ImportedTimeline["status"] = trackOut || terminated
      ? "Hoàn thành"
      : latestHold?.eventUpper === "HOLD" ? "Hold" : trackIn ? "Đang thực hiện" : "Chờ thực hiện";
    const eventDate = trackOut?.date || trackIn?.date || latest.date;
    if (!eventDate && !failQty && !equipment) continue;
    const failCode = scraps.map((record) => {
      const code = record.comment.match(/^\s*([^/;\s]+)/)?.[1] || "Scrap";
      return `${code}*${record.changeQty || 0}`;
    }).filter((value) => !value.endsWith("*0")).join(" ");
    const yieldRate = input ? output / input * 100 : 0;
    const processingHours = trackIn?.dateValue && trackOut?.dateValue
      ? (trackOut.dateValue - trackIn.dateValue) * 24
      : null;
    const waitingHours = trackIn?.dateValue && previousTrackOutDateValue
      ? (trackIn.dateValue - previousTrackOutDateValue) * 24
      : null;
    timelines.push({
      stage: stage.name,
      eventDate: eventDate || new Date().toISOString().slice(0, 19),
      status,
      note: [
        "Nguồn: SEE LOT Excel",
        trackIn?.date ? `Track In: ${formatManualDateTime(trackIn.date)}` : "",
        trackOut?.date ? `Track Out: ${formatManualDateTime(trackOut.date)}` : "",
        processingHours !== null ? `Processing Time: ${processingHours.toFixed(2)} h` : "",
        equipment ? `EQP: ${equipment}` : "",
        input ? `Input: ${input}` : "",
        input ? `Output: ${output}` : "",
        failCode ? `Fail code: ${failCode}` : "",
        input ? `Fail Qty: ${failQty}` : "",
        input ? `Yield: ${yieldRate.toFixed(2)}%` : "",
        waitingHours !== null ? `Waiting Time: ${waitingHours.toFixed(2)} h` : "",
      ].filter(Boolean).join(" · "),
    });
    if (trackOut?.dateValue) previousTrackOutDateValue = trackOut.dateValue;
  }
  const unsupportedSteps = [...new Set(records.map((record) => record.step).filter((step) => step && !PROCESS_STAGES.some((stage) => stage.codes.includes(step))))];
  if (unsupportedSteps.length) warnings.push(`${sheetName}: bỏ qua Step chưa có trong Q-EVAL: ${unsupportedSteps.join(", ")}.`);
  if (!timelines.length) {
    warnings.push(`${sheetName}: không tìm thấy TrackIn, TrackOut hoặc Scrap ở các Step được hỗ trợ.`);
    return { evaluations: [] as ImportedEvaluation[], skipped: records.length };
  }
  const lastTimeline = timelines.at(-1)!;
  const completed = timelines.filter((item) => item.status === "Hoàn thành").length;
  const status: ImportedEvaluation["status"] = lastTimeline.status === "Hold" ? "Hold" : "Đang đánh giá";
  const firstDate = timelines.map((item) => item.eventDate).filter(Boolean).sort()[0] ?? "";
  const lastOutput = [...timelines].reverse().map((item) => Number(item.note.match(/(?:^| · )Output:\s*(\d+)/)?.[1] || 0)).find((value) => value > 0) || maximumInput;
  return {
    skipped: 0,
    evaluations: [{
      importMode: "process-history",
      evaluationNo: "", evaluationType: "", evaluationContent: "", lotNo, product: "", density: "", partNo: "",
      quantity: maximumInput, equipment: "", step: lastTimeline.stage, owner: "", startDate: firstDate.slice(0, 10), targetDate: "",
      status, result: totalFailQty > 0 ? "FAIL" : "-", progress: Math.round(completed / timelines.length * 100), failQty: totalFailQty,
      yieldRate: maximumInput ? Number((lastOutput / maximumInput * 100).toFixed(2)) : 0,
      note: `Nguồn: SEE LOT Excel · Manual Steps: ${timelines.map((item) => item.stage).join("|")}`,
      timelines,
    }],
  };
}
const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const numberValue = (value: unknown) => Math.max(0, Number(value) || 0);
const excelDate = (value: unknown, withTime = false) => {
  if (value === null || value === undefined || value === "" || value === "-") return "";
  if (typeof value === "number" || /^\d+(\.\d+)?$/.test(clean(value))) {
    const serial = Number(value);
    if (serial > 20000 && serial < 100000) {
      const milliseconds = Math.round((serial - 25569) * 86400000);
      const date = new Date(milliseconds);
      return withTime ? date.toISOString().slice(0, 19) : date.toISOString().slice(0, 10);
    }
  }
  const parsed = new Date(clean(value));
  if (Number.isNaN(parsed.getTime())) return "";
  return withTime ? parsed.toISOString().slice(0, 19) : parsed.toISOString().slice(0, 10);
};
const statusFromExcel = (value: unknown, timelineCount: number): ImportedEvaluation["status"] => {
  const status = clean(value).toLowerCase();
  if (/ship|shipped|done|complete|hoàn thành/.test(status)) return "Hoàn thành";
  if (/hold|pause|stop/.test(status)) return "Hold";
  if (/pending|wait|chờ/.test(status)) return "Chờ thực hiện";
  return timelineCount ? "Đang đánh giá" : "Chờ thực hiện";
};
const failCount = (failCode: unknown, stageResults: string[]) => {
  const code = clean(failCode);
  const coded = Array.from(code.matchAll(/\*(\d+)/g), match => Number(match[1])).reduce((sum, value) => sum + value, 0);
  if (coded) return coded;
  return Math.max(0, ...stageResults.map(result => Number(result.match(/\b(\d+)\s*F\s*\//i)?.[1] ?? 0)));
};
const failCodesByStep = (value: unknown) => {
  const source = clean(value);
  const result = new Map<string, string>();
  for (const match of source.matchAll(/(?:^|\s)([A-Za-z0-9_-]+)\s*:\s*(.*?)(?=\s+[A-Za-z0-9_-]+\s*:|$)/g)) {
    const step = clean(match[1]).toUpperCase();
    const codes = clean(match[2]);
    if (step && codes) result.set(step, codes);
  }
  return result;
};

function parseWorksheet(xml: string, sharedStrings: string[]): CellValue[][] {
  const rows: CellValue[][] = [];
  for (const rowMatch of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const row: CellValue[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1], body = cellMatch[2] ?? "";
      const reference = attrs.match(/\br="([^"]+)"/)?.[1] ?? "A1";
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? "n";
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      let value: CellValue = null;
      if (type === "s") value = sharedStrings[Number(raw)] ?? "";
      else if (type === "inlineStr") value = textRuns(body);
      else if (type === "b") value = raw === "1";
      else if (type === "str") value = unescapeXml(raw);
      else if (raw !== "") value = Number.isFinite(Number(raw)) ? Number(raw) : unescapeXml(raw);
      row[columnIndex(reference)] = value;
    }
    rows.push(row);
  }
  return rows;
}

async function workbookRows(file: File) {
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const workbookXml = decoder(archive["xl/workbook.xml"]);
  const relationshipsXml = decoder(archive["xl/_rels/workbook.xml.rels"]);
  if (!workbookXml || !relationshipsXml) throw new Error("File Excel không hợp lệ hoặc không đọc được cấu trúc workbook.");
  const sharedXml = decoder(archive["xl/sharedStrings.xml"]);
  const sharedStrings = Array.from(sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g), match => textRuns(match[1]));
  const relationships = new Map(Array.from(relationshipsXml.matchAll(/<Relationship\s+([^>]+)\/?>(?:<\/Relationship>)?/g), match => {
    const attrs = match[1];
    return [attrs.match(/\bId="([^"]+)"/)?.[1] ?? "", attrs.match(/\bTarget="([^"]+)"/)?.[1] ?? ""] as const;
  }));
  return Array.from(workbookXml.matchAll(/<sheet\s+([^>]+)\/?>(?:<\/sheet>)?/g)).map(match => {
    const attrs = match[1];
    const name = unescapeXml(attrs.match(/\bname="([^"]+)"/)?.[1] ?? "");
    const relationshipId = attrs.match(/\br:id="([^"]+)"/)?.[1] ?? "";
    const target = relationships.get(relationshipId) ?? "";
    const normalizedTarget = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    return { name, rows: parseWorksheet(decoder(archive[normalizedTarget]), sharedStrings) };
  });
}

export async function parseSeeWipWorkbook(file: File): Promise<SeeWipDatabase> {
  const sheets = await workbookRows(file);
  const records: SeeWipRecord[] = [];
  for (const sheet of sheets) {
    const headerIndex = sheet.rows.findIndex(row => row.map(value => clean(value).toUpperCase()).includes("PARTNUMBER") && row.map(value => clean(value).toUpperCase()).includes("LOT"));
    if (headerIndex < 0) continue;
    const headers = sheet.rows[headerIndex].map(value => clean(value).toUpperCase());
    const lotCol = headers.indexOf("LOT"), partCol = headers.indexOf("PARTNUMBER"), qtyCol = headers.indexOf("QTY");
    const stepCol = headers.indexOf("STEP"), equipmentCol = headers.findIndex(value => value === "EQP ID" || value === "EQP");
    for (const row of sheet.rows.slice(headerIndex + 1)) {
      const lot = clean(row[lotCol]).toUpperCase(), partNo = clean(row[partCol]).toUpperCase();
      if (!lot || !partNo) continue;
      records.push({ lot, partNo, quantity: numberValue(row[qtyCol]), step: clean(row[stepCol]).toUpperCase(), equipment: clean(row[equipmentCol]).toUpperCase() });
    }
  }
  if (!records.length) throw new Error("Không tìm thấy cột LOT và PARTNUMBER trong file SEE WIP.");
  return { fileName: file.name, records };
}

const manualStageName = (step: string) => PROCESS_STAGES.find(stage => stage.codes.includes(step))?.name ?? "";
const manualDateTime = (value: string) => value ? `${value.slice(0, 4)}/${value.slice(5, 7)}/${value.slice(8, 10)} ${value.slice(11, 19)}` : "";
const normalizedLane = (equipment: string) => equipment.match(/SM-S[A-G]/i)?.[0]?.toUpperCase() ?? "";

export async function parseSeeLotForManual(file: File): Promise<SeeLotManualPrefill> {
  const sheets = await workbookRows(file);
  const sheet = sheets.find(candidate => candidate.rows.some(row => {
    const values = row.map(value => clean(value).toUpperCase());
    return values.includes("DATE/TIME") && values.includes("STEP");
  }));
  if (!sheet) throw new Error("File SEE Lot không có các cột DATE/TIME và STEP.");
  const headerIndex = sheet.rows.findIndex(row => {
    const values = row.map(value => clean(value).toUpperCase());
    return values.includes("DATE/TIME") && values.includes("STEP");
  });
  const headers = sheet.rows[headerIndex].map(value => clean(value).toUpperCase());
  const eventCol = Math.max(0, headers.indexOf("EVENT_NAME")), dateCol = headers.indexOf("DATE/TIME"), stepCol = headers.indexOf("STEP");
  const equipmentCol = headers.indexOf("EQP"), commentCol = headers.indexOf("COMMENT");
  const qtyCols = headers.map((value, index) => value === "QTY" ? index : -1).filter(index => index >= 0);
  const processQtyCol = qtyCols[0] ?? -1, changeQtyCol = qtyCols[1] ?? processQtyCol;
  const records = sheet.rows.slice(headerIndex + 1).map(row => ({
    event: clean(row[eventCol]), eventUpper: clean(row[eventCol]).toUpperCase(),
    date: excelDate(row[dateCol], true), dateValue: Number(row[dateCol]) || 0,
    step: clean(row[stepCol]).toUpperCase(), equipment: clean(row[equipmentCol]).toUpperCase(),
    processQty: numberValue(row[processQtyCol]),
    changeQty: numberValue(row[changeQtyCol]), comment: clean(row[commentCol]),
  })).filter(record => record.event && record.step).sort((a, b) => a.dateValue - b.dateValue);
  if (!records.length) throw new Error("File SEE Lot không có lịch sử công đoạn hợp lệ.");

  const fileLot = file.name.replace(/\.xlsx$/i, "").trim().toUpperCase();
  if (fileLot.length < 7) throw new Error(`Tên file ${file.name} không phải Lot ID hợp lệ.`);
  const smtLot = `${fileLot.slice(0, 4)}000${fileLot.slice(-3)}`;
  const a1 = clean(sheet.rows[0]?.[0]).toUpperCase();
  const partNo = a1.match(/MZ[A-Z0-9-]{10,}/)?.[0] ?? "";
  const m033TrackIn = records.find(record => record.step === "M033" && record.eventUpper === "TRACKIN");
  const beforeM033 = records.filter(record => !m033TrackIn || record.dateValue <= m033TrackIn.dateValue);
  const quantityBeforeM033 = Math.max(0, ...beforeM033.filter(record => record.step === "M033").map(record => record.processQty));
  const quantity = quantityBeforeM033 || Math.max(0, ...records.map(record => record.processQty));
  const firstTrackIn = records.find(record => record.eventUpper === "TRACKIN");
  const processLane = normalizedLane(records.find(record => ["M010", "M015"].includes(record.step) && record.eventUpper === "TRACKIN")?.equipment ?? "");
  const stagesWithData = PROCESS_STAGES.map(stage => {
    const items = records.filter(record => stage.codes.includes(record.step));
    const trackIn = items.find(record => record.eventUpper === "TRACKIN");
    const trackOut = [...items].reverse().find(record => record.eventUpper === "TRACKOUT");
    const scraps = items.filter(record => record.eventUpper === "SCRAP");
    if (!trackIn && !trackOut && !scraps.length) return null;
    const specialPreRouterQty = stage.codes.some(code => ["M010", "M015", "M031"].includes(code)) && quantityBeforeM033 > 0;
    const input = specialPreRouterQty ? quantityBeforeM033 : (trackIn?.processQty || Math.max(0, ...items.map(record => record.processQty)));
    const failed = scraps.reduce((sum, record) => sum + record.changeQty, 0);
    const output = specialPreRouterQty ? Math.max(0, input - failed) : (trackOut?.processQty || Math.max(0, input - failed));
    const failCode = scraps.map(record => `${record.comment.match(/^\s*([^/;\s]+)/)?.[1] || "Scrap"}*${record.changeQty}`).filter(value => !value.endsWith("*0")).join(" ");
    return { stage: stage.name, equipment: (trackOut?.equipment && trackOut.equipment !== "-") ? trackOut.equipment : (trackIn?.equipment ?? ""), trackIn: manualDateTime(trackIn?.date ?? ""), trackOut: manualDateTime(trackOut?.date ?? ""), inputQty: input ? String(input) : "", outputQty: input ? String(output) : "", failCode, reason: "" };
  }).filter((stage): stage is NonNullable<typeof stage> => Boolean(stage));
  const lastStageIndex = Math.max(...stagesWithData.map(stage => PROCESS_STAGES.findIndex(candidate => candidate.name === stage.stage)));
  const included = new Set(stagesWithData.map(stage => stage.stage));
  const futureStages = PROCESS_STAGES.slice(lastStageIndex + 1).filter(stage => !included.has(stage.name)).map(stage => ({ stage: stage.name, equipment: "", trackIn: "", trackOut: "", inputQty: "", outputQty: "", failCode: "", reason: "" }));
  const warnings: string[] = [];
  if (!partNo) warnings.push(`File ${file.name}: ô A1 chưa có Part No. hợp lệ.`);
  return {
    fileName: file.name, lotId: fileLot, smtLot, lotCurrent: fileLot, partNo, lane: processLane,
    quantity, planDateIn: firstTrackIn?.date ? firstTrackIn.date.slice(0, 10).replaceAll("-", "/") : "",
    stages: [...stagesWithData, ...futureStages], startsFromSmt: stagesWithData.some(stage => /M010|M015|SMT/i.test(stage.stage)), warnings,
  };
}

export function parseSeeLotTableForManual(partNumber: string, lotIdentifier: string, pastedRows: string[][]): SeeLotManualPrefill {
  const partNo = clean(partNumber).toUpperCase();
  const lotId = clean(lotIdentifier).toUpperCase();
  if (!partNo) throw new Error("Vui lòng nhập Part No.");
  if (lotId.length < 6) throw new Error("Vui lòng nhập Lot ID hợp lệ.");
  const expected = ["EVENT_NAME", "DATE/TIME", "QTY", "STEP", "EQP", "LINE", "OPERID", "CHG_ITEM", "CHG_VALS", "QTY", "COMMENT"];
  const normalized = pastedRows.filter(row => row.some(value => clean(value))).map(row => Array.from({ length: expected.length }, (_unused, index) => clean(row[index])));
  const first = normalized[0]?.map(value => value.toUpperCase()) ?? [];
  const hasHeader = first.includes("EVENT_NAME") && first.includes("STEP");
  const headers = hasHeader ? first : expected;
  const rows = hasHeader ? normalized.slice(1) : normalized;
  const column = (name: string, occurrence = 0) => {
    let seen = -1;
    return headers.findIndex(value => value === name && ++seen === occurrence);
  };
  const eventCol = column("EVENT_NAME"), dateCol = column("DATE/TIME"), stepCol = column("STEP"), equipmentCol = column("EQP");
  const commentCol = column("COMMENT"), processQtyCol = column("QTY"), changeQtyCol = column("QTY", 1);
  const records = rows.map((row, order) => {
    const rawDate = row[dateCol] || "";
    const exactDate = rawDate.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
    const parsedDate = exactDate
      ? `${exactDate[1]}-${exactDate[2].padStart(2, "0")}-${exactDate[3].padStart(2, "0")}T${exactDate[4].padStart(2, "0")}:${exactDate[5].padStart(2, "0")}:${(exactDate[6] || "00").padStart(2, "0")}`
      : excelDate(rawDate, true);
    return {
      event: clean(row[eventCol]), eventUpper: clean(row[eventCol]).toUpperCase().replaceAll(" ", ""),
      date: parsedDate || rawDate.replaceAll("/", "-").replace(" ", "T").slice(0, 19),
      order, step: clean(row[stepCol]).toUpperCase(), equipment: clean(row[equipmentCol]).toUpperCase(),
      processQty: numberValue(row[processQtyCol]), changeQty: numberValue(row[changeQtyCol]), comment: clean(row[commentCol]),
    };
  }).filter(record => record.event && record.step).sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.order - b.order);
  if (!records.length) throw new Error("Bảng Update See Lot chưa có dữ liệu công đoạn hợp lệ.");
  const m033TrackIn = records.find(record => record.step === "M033" && record.eventUpper === "TRACKIN");
  const beforeM033 = records.filter(record => !m033TrackIn || record.order <= m033TrackIn.order);
  const quantityBeforeM033 = Math.max(0, ...beforeM033.filter(record => record.step === "M033").map(record => record.processQty));
  const quantity = quantityBeforeM033 || Math.max(0, ...records.map(record => record.processQty));
  const firstTrackIn = records.find(record => record.eventUpper === "TRACKIN");
  const processLane = normalizedLane(records.find(record => ["M010", "M015"].includes(record.step) && record.eventUpper === "TRACKIN")?.equipment ?? "");
  const stagesWithData = PROCESS_STAGES.map(stage => {
    const items = records.filter(record => stage.codes.includes(record.step));
    const trackIn = items.find(record => record.eventUpper === "TRACKIN");
    const trackOut = [...items].reverse().find(record => record.eventUpper === "TRACKOUT");
    const scraps = items.filter(record => record.eventUpper === "SCRAP");
    if (!trackIn && !trackOut && !scraps.length) return null;
    const specialPreRouterQty = stage.codes.some(code => ["M010", "M015", "M031"].includes(code)) && quantityBeforeM033 > 0;
    const input = specialPreRouterQty ? quantityBeforeM033 : (trackIn?.processQty || Math.max(0, ...items.map(record => record.processQty)));
    const failed = scraps.reduce((sum, record) => sum + record.changeQty, 0);
    const output = specialPreRouterQty ? Math.max(0, input - failed) : (trackOut?.processQty || Math.max(0, input - failed));
    const failCode = scraps.map(record => `${record.comment.match(/^\s*([^/;\s]+)/)?.[1] || "Scrap"}*${record.changeQty}`).filter(value => !value.endsWith("*0")).join(" ");
    return {
      stage: stage.name, equipment: (trackOut?.equipment && trackOut.equipment !== "-") ? trackOut.equipment : (trackIn?.equipment ?? ""),
      trackIn: manualDateTime(trackIn?.date ?? ""), trackOut: manualDateTime(trackOut?.date ?? ""),
      inputQty: input ? String(input) : "", outputQty: input ? String(output) : "", failCode, reason: "",
    };
  }).filter((stage): stage is NonNullable<typeof stage> => Boolean(stage));
  if (!stagesWithData.length) throw new Error("Không tìm thấy Track In, Track Out hoặc Scrap trong bảng.");
  const lastStageIndex = Math.max(...stagesWithData.map(stage => PROCESS_STAGES.findIndex(candidate => candidate.name === stage.stage)));
  const included = new Set(stagesWithData.map(stage => stage.stage));
  const futureStages = PROCESS_STAGES.slice(lastStageIndex + 1).filter(stage => !included.has(stage.name))
    .map(stage => ({ stage: stage.name, equipment: "", trackIn: "", trackOut: "", inputQty: "", outputQty: "", failCode: "", reason: "" }));
  const smtLot = `${lotId.slice(0, 3)}000${lotId.slice(-3)}`;
  return {
    fileName: "Update See Lot", lotId, smtLot, lotCurrent: lotId, partNo, lane: processLane, quantity,
    planDateIn: firstTrackIn?.date ? firstTrackIn.date.slice(0, 10).replaceAll("-", "/") : "",
    stages: [...stagesWithData, ...futureStages],
    startsFromSmt: stagesWithData.some(stage => /M010|M015|SMT/i.test(stage.stage)), warnings: [],
  };
}

function rowsToEvaluations(sheetName: string, rows: CellValue[][], warnings: string[]) {
  const fallbackType = normalizeType(sheetName);
  if (!fallbackType) return { evaluations: [] as ImportedEvaluation[], skipped: 0 };
  const headerIndex = rows.findIndex(row => row.some(value => clean(value).toLowerCase() === "product") && row.some(value => clean(value).toLowerCase().includes("lot current")));
  if (headerIndex < 0) {
    warnings.push(`${sheetName}: không tìm thấy dòng tiêu đề Product / Lot Current.`);
    return { evaluations: [] as ImportedEvaluation[], skipped: 0 };
  }
  const headers = rows[headerIndex], subheaders = rows[headerIndex + 1] ?? [];
  const header = (name: string) => headers.findIndex(value => clean(value).toLowerCase() === name.toLowerCase());
  const base = {
    no: header("No."), product: header("Product"), density: header("Density"), destiny: header("Destiny"), type: header("EVAL TYPE"), classification: header("Phân loại"),
    partNo: header("Part No"), smtLot: header("SMT Lot"), lane: header("Lane"), quantity: headers.findIndex(value => clean(value).toLowerCase().includes("total")),
    planDate: headers.findIndex(value => clean(value).toLowerCase().includes("plan")), lotCurrent: header("Lot Current"),
    status: header("Status"), failCode: headers.findIndex(value => clean(value).toLowerCase() === "fail code"),
  };
  const terminal = Math.max(base.status, base.failCode, headers.length);
  const stageStarts: Array<{ name: string; start: number; end: number }> = [];
  for (let col = base.lotCurrent + 1; col < terminal; col++) {
    const name = clean(headers[col]);
    if (!name || /^status$|^fail code$/i.test(name)) continue;
    const next = headers.findIndex((value, index) => index > col && clean(value) !== "");
    stageStarts.push({ name, start: col, end: next < 0 ? terminal : next });
  }
  const evaluations: ImportedEvaluation[] = [];
  let skipped = 0;
  for (let rowIndex = headerIndex + 2; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] ?? [];
    const lotNo = clean(row[base.lotCurrent] ?? row[base.smtLot]).toUpperCase();
    const product = clean(row[base.product]);
    if (!lotNo && !product) continue;
    const evaluationType = normalizeType(row[base.type]) ?? fallbackType;
    if (!lotNo || !product) {
      skipped++;
      warnings.push(`${sheetName} dòng ${rowIndex + 1}: thiếu Product hoặc Lot Current.`);
      continue;
    }
    const timelines: ImportedTimeline[] = [];
    const stageResults: string[] = [];
    const stepFailCodes = failCodesByStep(row[base.failCode]);
    for (const stage of stageStarts) {
      const entries = [] as Array<{ label: string; value: CellValue }>;
      for (let col = stage.start; col < stage.end; col++) {
        const label = clean(subheaders[col]);
        const value = row[col] ?? null;
        if (label || value !== null) entries.push({ label, value });
      }
      const resultEntry = entries.find(entry => /result/i.test(entry.label));
      const resultText = clean(resultEntry?.value);
      const meaningfulResult = Boolean(resultText && resultText !== "-");
      if (meaningfulResult) stageResults.push(resultText);
      const outDate = entries.find(entry => /out date/i.test(entry.label))?.value;
      const trackDate = entries.find(entry => /track in time/i.test(entry.label))?.value;
      const inDate = entries.find(entry => /in date/i.test(entry.label))?.value;
      const eventDate = excelDate(outDate ?? trackDate ?? inDate, true);
      const stepFailCode = stepFailCodes.get(stage.name.toUpperCase()) ?? "";
      if (!eventDate && !meaningfulResult && !stepFailCode) continue;
      const noteParts = entries.filter(entry => clean(entry.value) && clean(entry.value) !== "-").map(entry => {
        const shown = /date|time/i.test(entry.label) ? excelDate(entry.value, true).replace("T", " ") : clean(entry.value);
        return `${entry.label || "Giá trị"}: ${shown}`;
      });
      if (stepFailCode) noteParts.push(`Fail code: ${stepFailCode}`);
      timelines.push({ stage: stage.name, eventDate: eventDate || new Date().toISOString().slice(0, 19), status: meaningfulResult || stepFailCode ? "Hoàn thành" : "Đang thực hiện", note: noteParts.join(" · ") || "Đã cập nhật từ Excel" });
    }
    const statusValue = base.status >= 0 ? row[base.status] : row[headers.length - 1];
    const status = statusFromExcel(statusValue, timelines.length);
    const failQty = failCount(row[base.failCode], stageResults);
    const quantity = numberValue(row[base.quantity]);
    const hasPass = stageResults.some(value => /all pass|\bpass\b/i.test(value));
    const result: ImportedEvaluation["result"] = failQty > 0 || stageResults.some(value => /\bfail\b/i.test(value)) ? "FAIL" : status === "Hoàn thành" && hasPass ? "PASS" : "-";
    const completedStages = timelines.filter(item => item.status === "Hoàn thành").length;
    const progress = status === "Hoàn thành" ? 100 : stageStarts.length ? Math.round(completedStages / stageStarts.length * 100) : 0;
    const targetDate = excelDate(row[base.planDate]);
    const startDate = timelines.map(item => item.eventDate.slice(0, 10)).sort()[0] ?? targetDate;
    const classification = clean(row[base.classification]), destiny = clean(row[base.destiny]), failCode = clean(row[base.failCode]);
    evaluations.push({
      evaluationNo: clean(row[base.no]), evaluationType, evaluationContent: [classification, destiny].filter(Boolean).join(" · "), lotNo, product,
      density: clean(row[base.density]), partNo: clean(row[base.partNo]), quantity, equipment: clean(row[base.lane]), step: clean(row[base.lotCurrent]), owner: "",
      startDate, targetDate, status, result, progress, failQty,
      yieldRate: quantity ? Number((((quantity - failQty) / quantity) * 100).toFixed(2)) : 0,
      note: [`SMT Lot: ${clean(row[base.smtLot])}`, failCode ? `Fail code: ${failCode}` : ""].filter(Boolean).join(" · "), timelines,
    });
  }
  return { evaluations, skipped };
}

export async function parseEvaluationWorkbook(file: File): Promise<WorkbookImport> {
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const workbookXml = decoder(archive["xl/workbook.xml"]);
  const relationshipsXml = decoder(archive["xl/_rels/workbook.xml.rels"]);
  if (!workbookXml || !relationshipsXml) throw new Error("File Excel không hợp lệ hoặc không đọc được cấu trúc workbook.");
  const sharedXml = decoder(archive["xl/sharedStrings.xml"]);
  const sharedStrings = Array.from(sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g), match => textRuns(match[1]));
  const relationships = new Map(Array.from(relationshipsXml.matchAll(/<Relationship\s+([^>]+)\/?>(?:<\/Relationship>)?/g), match => {
    const attrs = match[1];
    const id = attrs.match(/\bId="([^"]+)"/)?.[1] ?? "";
    const target = attrs.match(/\bTarget="([^"]+)"/)?.[1] ?? "";
    return [id, target] as const;
  }));
  const sheets = Array.from(workbookXml.matchAll(/<sheet\s+([^>]+)\/?>(?:<\/sheet>)?/g), match => {
    const attrs = match[1];
    return { name: unescapeXml(attrs.match(/\bname="([^"]+)"/)?.[1] ?? ""), relationshipId: attrs.match(/\br:id="([^"]+)"/)?.[1] ?? "" };
  });
  const warnings: string[] = [], evaluations: ImportedEvaluation[] = [];
  let skippedRows = 0;
  const importedSheets: string[] = [];
  for (const sheet of sheets) {
    const target = relationships.get(sheet.relationshipId);
    if (!target) continue;
    const normalizedTarget = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    const xml = decoder(archive[normalizedTarget]);
    if (!xml) continue;
    const rows = parseWorksheet(xml, sharedStrings);
    const parsed = normalizeType(sheet.name)
      ? rowsToEvaluations(sheet.name, rows, warnings)
      : rowsToProcessHistory(sheet.name, rows, warnings);
    if (parsed.evaluations.length) importedSheets.push(sheet.name);
    evaluations.push(...parsed.evaluations);
    skippedRows += parsed.skipped;
  }
  if (!evaluations.length) throw new Error("Không tìm thấy dữ liệu đánh giá hoặc lịch sử công đoạn hợp lệ trong file Excel.");
  const unique = new Map<string, ImportedEvaluation>();
  for (const evaluation of evaluations) unique.set(evaluation.lotNo, evaluation);
  if (unique.size !== evaluations.length) warnings.push(`Có ${evaluations.length - unique.size} Lot trùng; dữ liệu ở dòng cuối được sử dụng.`);
  return { fileName: file.name, sheets: importedSheets, evaluations: [...unique.values()], skippedRows, warnings };
}
